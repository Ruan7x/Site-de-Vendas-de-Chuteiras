import { z } from "zod";
import { newPublicId, sha256Hex } from "./security.js";
import { MercadoPagoError, PAYMENT_ID_RE, verifySignature } from "./mercadopago.js";

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1).max(80),
        size: z.number().int().min(20).max(60),
        quantity: z.number().int().min(1).max(10),
      }),
    )
    .min(1)
    .max(20),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,80}$/),
});

const PENDING = new Set(["AWAITING_PAYMENT", "IN_ANALYSIS"]);
const RETRYABLE = new Set(["DECLINED", "CANCELED", "EXPIRED", "ERROR"]);
const DEFAULT_PAY_HOSTS = [/(^|\.)mercadopago\.com(\.[a-z]{2})?$/, /(^|\.)mercadolibre\.com(\.[a-z]{2})?$/, /(^|\.)mercadolivre\.com\.br$/];
const PREFERENCE_ID_RE = /^[A-Za-z0-9_-]{6,80}$/;
const mpDate = (ms) => new Date(ms).toISOString().replace("Z", "+00:00");
const toCents = (v) => Math.round(Number(v) * 100);

export const formatBRL = (cents) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");
export const orderNumber = (id) => `TN-${String(id).padStart(5, "0")}`;

/**
 * Interpreta os pagamentos de um pedido, já lidos da API do Mercado Pago (nunca do navegador).
 * Fonte única de verdade do status: só "approved" em BRL com valor >= total vira PAID.
 */
export function derivePaymentState(payments, totalCents) {
  const list = (payments || []).filter(Boolean);
  if (!list.length) return null;

  const approved = list.filter((p) => p.status === "approved" && (!p.currency_id || p.currency_id === "BRL"));
  if (approved.length) {
    const sum = approved.reduce((acc, p) => acc + toCents(p.transaction_amount ?? 0), 0);
    return sum >= totalCents
      ? { status: "PAID", payment: approved[0] }
      : { status: "VERIFICATION_ERROR", payment: approved[0], reason: `valor pago ${sum} < total ${totalCents}` };
  }
  const refunded = list.find((p) => p.status === "refunded" || p.status === "charged_back");
  if (refunded) return { status: "REFUNDED", payment: refunded };

  const latest = [...list].sort((x, y) => String(y.date_created ?? "").localeCompare(String(x.date_created ?? "")))[0];
  switch (latest.status) {
    case "pending":
      return { status: "AWAITING_PAYMENT", payment: latest };
    case "in_process":
    case "authorized":
    case "in_mediation":
      return { status: "IN_ANALYSIS", payment: latest };
    case "rejected":
      return { status: "DECLINED", payment: latest };
    case "cancelled":
      return { status: latest.status_detail === "expired" ? "EXPIRED" : "CANCELED", payment: latest };
    default:
      return null;
  }
}

export function createOrdersService({ db, config, mp, log = console, now = () => Date.now() }) {
  const q = {
    byPublic: db.prepare("SELECT * FROM orders WHERE public_id=?"),
    byId: db.prepare("SELECT * FROM orders WHERE id=?"),
    byRef: db.prepare("SELECT * FROM orders WHERE reference_id=?"),
    byIdem: db.prepare("SELECT * FROM orders WHERE idempotency_key=?"),
    product: db.prepare("SELECT * FROM products WHERE id=?"),
  };
  const iso = () => new Date(now()).toISOString();

  // ---------- precificação (sempre a partir do banco; nunca do navegador) ----------
  function priceCart(items) {
    const merged = new Map();
    for (const it of items) {
      const k = `${it.productId}|${it.size}`;
      merged.set(k, { ...it, quantity: (merged.get(k)?.quantity ?? 0) + it.quantity });
    }
    const lines = [];
    let total = 0;
    for (const it of merged.values()) {
      const p = q.product.get(it.productId);
      if (!p) throw new HttpError(422, "product_unavailable", "Um dos produtos da sacola não está mais disponível.");
      if (!JSON.parse(p.sizes).includes(it.size))
        throw new HttpError(422, "size_unavailable", `O tamanho ${it.size} de ${p.name} não está disponível.`);
      if (it.quantity > 10) throw new HttpError(422, "quantity_limit", "Limite de 10 unidades por item.");
      lines.push({ productId: p.id, name: p.name, size: it.size, quantity: it.quantity, unitCents: p.price_cents });
      total += p.price_cents * it.quantity;
    }
    if (total <= 0 || total > 999_999_900) throw new HttpError(422, "invalid_total", "Valor total inválido.");
    return { lines, total };
  }

  const safePayUrl = (href) => {
    try {
      const u = new URL(href);
      if (config.payHostAllowlist.includes(u.hostname)) return u.href;
      if (u.protocol === "https:" && DEFAULT_PAY_HOSTS.some((re) => re.test(u.hostname))) return u.href;
    } catch {
      /* inválida */
    }
    return null;
  };

  // ---------- checkout Mercado Pago (Checkout Pro: preferência de pagamento) ----------
  async function openCheckout(order) {
    if (!mp.configured)
      throw new HttpError(503, "payments_not_configured", "Pagamentos ainda não estão configurados nesta loja.");
    const items = JSON.parse(order.items_json);
    const back = `${config.publicUrl}/pedido/${order.public_id}`;
    const payload = {
      items: items.map((i) => ({
        id: i.productId,
        title: `${i.name} (Tam. ${i.size})`.slice(0, 120),
        quantity: i.quantity,
        unit_price: i.unitCents / 100,
        currency_id: "BRL",
      })),
      external_reference: order.reference_id,
      back_urls: { success: back, pending: back, failure: back },
      statement_descriptor: "TN SPORTS",
      expires: true,
      expiration_date_from: mpDate(now()),
      expiration_date_to: mpDate(now() + 2 * 3600_000),
    };
    // O Mercado Pago só aceita auto_return com back_urls https e notification_url pública (https, fora do localhost).
    if (config.publicHttps) payload.auto_return = "approved";
    if (config.webhookReachable) payload.notification_url = `${config.webhookBaseUrl}/api/webhooks/mercadopago`;

    try {
      const res = await mp.createPreference(payload);
      // O Mercado Pago não tem mais ambiente sandbox: teste e produção usam o init_point (muda só a credencial).
      const href = res?.init_point;
      const payUrl = href && safePayUrl(href);
      if (!res?.id || !PREFERENCE_ID_RE.test(String(res.id)) || !payUrl) throw new MercadoPagoError("Resposta de checkout inesperada");
      db.prepare(
        `UPDATE orders SET status='AWAITING_PAYMENT', provider_checkout_id=?, provider_pay_url=?, checkout_expires_at=?, last_error=NULL,
         last_checked_at=0, updated_at=? WHERE id=?`,
      ).run(String(res.id), payUrl, new Date(now() + 2 * 3600_000).toISOString(), iso(), order.id);
    } catch (err) {
      db.prepare("UPDATE orders SET status='ERROR', last_error=?, updated_at=? WHERE id=?").run(
        String(err.message).slice(0, 300), iso(), order.id,
      );
      log.error(`[order ${order.id}] falha ao criar checkout: ${err.message}`);
      throw new HttpError(502, "checkout_failed", "Não foi possível iniciar o pagamento agora. Tente novamente em instantes.");
    }
    return q.byId.get(order.id);
  }

  const summary = (o) => ({
    publicId: o.public_id,
    status: o.status,
    payUrl: o.status === "AWAITING_PAYMENT" ? o.provider_pay_url : null,
  });

  async function createOrder(input) {
    const { items, idempotencyKey } = createOrderSchema.parse(input);
    const existing = q.byIdem.get(idempotencyKey);
    if (existing) {
      if (existing.status === "CREATED" || existing.status === "ERROR") return summary(await openCheckout(existing));
      return summary(existing);
    }
    const { lines, total } = priceCart(items);
    const publicId = newPublicId();
    const t = iso();
    let row;
    try {
      const info = db
        .prepare(
          `INSERT INTO orders (public_id,reference_id,idempotency_key,status,total_cents,items_json,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?)`,
        )
        .run(publicId, publicId, idempotencyKey, "CREATED", total, JSON.stringify(lines), t, t);
      row = q.byId.get(info.lastInsertRowid);
    } catch (e) {
      if (String(e.code).startsWith("SQLITE_CONSTRAINT")) return summary(q.byIdem.get(idempotencyKey));
      throw e;
    }
    return summary(await openCheckout(row));
  }

  async function retryOrder(publicId) {
    const o = q.byPublic.get(publicId);
    if (!o) throw new HttpError(404, "not_found", "Pedido não encontrado.");
    if (o.status === "PAID") throw new HttpError(409, "already_paid", "Este pedido já foi pago.");
    if (!RETRYABLE.has(o.status))
      throw new HttpError(409, "not_retryable", "Este pedido não pode ser reiniciado agora. Consulte o status novamente.");
    const { lines, total } = priceCart(JSON.parse(o.items_json).map((i) => ({ productId: i.productId, size: i.size, quantity: i.quantity })));
    db.prepare("UPDATE orders SET items_json=?, total_cents=?, updated_at=? WHERE id=?").run(JSON.stringify(lines), total, iso(), o.id);
    return summary(await openCheckout(q.byId.get(o.id)));
  }

  // ---------- atualização de status (PAID só pode virar REFUNDED; nunca regride para pendente/recusado) ----------
  function setStatus(order, status, extra = {}) {
    const cur = q.byId.get(order.id);
    if (cur.status === "REFUNDED") return "already_refunded";
    if (cur.status === "PAID" && status !== "REFUNDED") return "already_paid";
    if (cur.status !== status) log.log?.(`[pedido ${orderNumber(cur.id)}] ${cur.status} → ${status}`);
    db.prepare(
      `UPDATE orders SET status=?, provider_payment_id=COALESCE(?,provider_payment_id),
       paid_at=CASE WHEN ?='PAID' THEN COALESCE(?,?) ELSE paid_at END, last_error=?, updated_at=? WHERE id=?`,
    ).run(status, extra.paymentId ? String(extra.paymentId) : null, status, extra.paidAt ?? null, iso(), extra.reason ?? null, iso(), order.id);
    return `status:${status}`;
  }

  /**
   * Consulta os pagamentos do pedido no Mercado Pago (com o token privado) e aplica o status confirmado.
   * `known` é um pagamento já lido da API (ex.: vindo do webhook ou do retorno do checkout).
   */
  async function reconcile(order, known) {
    const payments = [];
    if (known && String(known.external_reference) === order.reference_id) payments.push(known);
    const found = await mp.searchPayments(order.reference_id);
    for (const p of found?.results ?? []) {
      if (p?.external_reference === order.reference_id && !payments.some((x) => String(x.id) === String(p.id))) payments.push(p);
    }
    const st = derivePaymentState(payments, order.total_cents);
    if (!st) {
      const cur = q.byId.get(order.id);
      if (cur.status === "AWAITING_PAYMENT" && cur.checkout_expires_at && Date.parse(cur.checkout_expires_at) < now())
        return setStatus(order, "EXPIRED");
      return "no_payments";
    }
    if (st.status === "VERIFICATION_ERROR") log.error(`[order ${order.id}] divergência de valor: ${st.reason}`);
    return setStatus(order, st.status, { paymentId: st.payment?.id, paidAt: st.payment?.date_approved, reason: st.reason });
  }

  const retryable = (err) => err instanceof MercadoPagoError && (err.status === 0 || err.status >= 500 || err.status === 429);

  /** `query` = parâmetros da URL da notificação (o Mercado Pago envia data.id e type na query). */
  async function handleWebhook(rawBody, headers, query = {}) {
    if (!config.mpAccessToken) return { code: 503, body: { error: "payments_not_configured" } };
    let payload = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return { code: 400, body: { error: "invalid_json" } };
    }
    if (!payload || typeof payload !== "object") return { code: 400, body: { error: "invalid_payload" } };

    const dataId = String(query["data.id"] ?? payload?.data?.id ?? (query.topic === "payment" ? query.id : "") ?? "");
    const signed = verifySignature({
      signature: headers["x-signature"],
      requestId: headers["x-request-id"],
      dataId: String(query["data.id"] ?? payload?.data?.id ?? ""),
      secret: config.mpWebhookSecret,
    });
    if (config.requireSignature && !signed) {
      log.warn("[webhook] assinatura inválida/ausente — descartado");
      return { code: 401, body: { error: "invalid_signature" } };
    }

    const type = String(payload.type ?? query.type ?? query.topic ?? "");
    if (type !== "payment" || !PAYMENT_ID_RE.test(dataId)) return { code: 200, body: { status: "ignored" } };

    const eventKey = sha256Hex(rawBody || `${dataId}|${type}`);
    if (db.prepare("SELECT 1 FROM payment_events WHERE event_key=?").get(eventKey))
      return { code: 200, body: { status: "duplicate" } };

    let outcome = "ignored";
    let order = null;
    try {
      // O corpo do webhook nunca é usado como verdade: o pagamento é lido na API com o token privado.
      const payment = await mp.getPayment(dataId);
      const ref = typeof payment?.external_reference === "string" ? payment.external_reference : "";
      order = ref ? q.byRef.get(ref) : null;
      outcome = order ? await reconcile(order, payment) : "unknown_order";
    } catch (err) {
      if (retryable(err)) {
        log.error(`[webhook] Mercado Pago indisponível: ${err.message}`);
        return { code: 503, body: { error: "verification_unavailable" } }; // o Mercado Pago reenvia
      }
      if (err instanceof MercadoPagoError) outcome = `mercadopago_${err.status}`;
      else throw err;
    }
    db.prepare("INSERT OR IGNORE INTO payment_events (event_key,order_id,source,outcome,received_at) VALUES (?,?,?,?,?)").run(
      eventKey, order?.id ?? null, "webhook", outcome, iso(),
    );
    log.log(`[webhook] pagamento ${dataId} -> ${outcome}${order ? ` (pedido ${order.id})` : ""}`);
    return { code: 200, body: { status: outcome } };
  }

  // ---------- visão pública ----------
  function whatsappUrl(o) {
    if (o.status !== "PAID" || !/^55\d{10,11}$/.test(config.whatsappNumber)) return null;
    const items = JSON.parse(o.items_json)
      .map((i) => `${i.quantity}x ${i.name} (Tam. ${i.size})`)
      .join("; ");
    const msg =
      `Olá, TN Sports! Realizei uma compra pelo site.\n\nPedido: #${orderNumber(o.id)}\nItens: ${items}\n` +
      `Valor total: ${formatBRL(o.total_cents)}\nPagamento: aprovado pelo Mercado Pago\n\nGostaria de confirmar os detalhes da entrega.`;
    return `https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent(msg)}`;
  }

  function toView(o, verification = "ok") {
    return {
      publicId: o.public_id,
      number: orderNumber(o.id),
      status: o.status,
      items: JSON.parse(o.items_json).map((i) => ({ name: i.name, size: i.size, quantity: i.quantity, unitPrice: i.unitCents / 100 })),
      total: o.total_cents / 100,
      createdAt: o.created_at,
      paidAt: o.paid_at,
      payUrl: o.status === "AWAITING_PAYMENT" ? o.provider_pay_url : null,
      canRetry: RETRYABLE.has(o.status),
      whatsappUrl: whatsappUrl(o),
      whatsappConfigured: /^55\d{10,11}$/.test(config.whatsappNumber),
      verification,
    };
  }

  /** `paymentHint`: id do pagamento que o Mercado Pago anexa à URL de retorno (só uma dica; é conferido na API). */
  async function getPublicView(publicId, paymentHint) {
    let o = q.byPublic.get(publicId);
    if (!o) return null;
    let verification = "ok";
    const hint = typeof paymentHint === "string" && PAYMENT_ID_RE.test(paymentHint) ? paymentHint : null;
    const due = now() - o.last_checked_at > 4000;
    if ((PENDING.has(o.status) || (hint && o.status !== "PAID" && o.status !== "REFUNDED")) && (due || hint) && mp.configured) {
      db.prepare("UPDATE orders SET last_checked_at=? WHERE id=?").run(now(), o.id); // limita as consultas
      try {
        let known = null;
        if (hint) {
          try {
            known = await mp.getPayment(hint);
          } catch (err) {
            if (!(err instanceof MercadoPagoError && err.status === 404)) throw err;
          }
        }
        await reconcile(o, known);
      } catch (err) {
        verification = "error";
        log.error(`[order ${o.id}] reconciliação falhou: ${err.message}`);
      }
      o = q.byPublic.get(publicId);
    }
    return toView(o, verification);
  }

  const pendingOrders = db.prepare(
    `SELECT * FROM orders WHERE status IN ('AWAITING_PAYMENT','IN_ANALYSIS') AND created_at >= ? AND last_checked_at < ?
     ORDER BY id DESC LIMIT ?`,
  );

  /**
   * Confere no Mercado Pago os pedidos ainda pendentes. Garante a confirmação mesmo sem webhook
   * e sem o cliente voltar para /pedido (ex.: pagou o Pix no app do banco e fechou a página).
   */
  async function reconcilePending({ maxAgeMs = 7 * 24 * 3600_000, minIntervalMs = 30_000, limit = 20 } = {}) {
    if (!mp.configured) return 0;
    const rows = pendingOrders.all(new Date(now() - maxAgeMs).toISOString(), now() - minIntervalMs, limit);
    let checked = 0;
    for (const o of rows) {
      db.prepare("UPDATE orders SET last_checked_at=? WHERE id=?").run(now(), o.id);
      try {
        await reconcile(o);
        checked++;
      } catch (err) {
        log.error(`[pedido ${orderNumber(o.id)}] conferência falhou: ${err.message}`);
        if (retryable(err)) break; // Mercado Pago fora do ar: tenta de novo na próxima rodada
      }
    }
    return checked;
  }

  const listOrders = () =>
    db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 200").all().map((o) => ({
      ...toView(o), publicId: undefined, paymentId: o.provider_payment_id, lastError: o.last_error,
    }));

  return { createOrder, retryOrder, handleWebhook, getPublicView, listOrders, reconcilePending, priceCart };
}
