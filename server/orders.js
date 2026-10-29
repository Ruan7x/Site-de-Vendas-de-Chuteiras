import { z } from "zod";
import { newPublicId, sha256Hex } from "./security.js";
import { PagBankError, PB_ID_RE, verifyAuthenticity } from "./pagbank.js";

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
const DEFAULT_PAY_HOSTS = [
  /(^|\.)pagseguro\.uol\.com\.br$/,
  /(^|\.)pagseguro\.com\.br$/,
  /(^|\.)pagbank\.com\.br$/,
  /(^|\.)pagseguro\.com$/,
];

export const formatBRL = (cents) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");
export const orderNumber = (id) => `TN-${String(id).padStart(5, "0")}`;

/** Interpreta o pedido devolvido pela API do PagBank. Fonte única de verdade do status. */
export function derivePaymentState(pb, totalCents) {
  const charges = Array.isArray(pb?.charges) ? pb.charges : [];
  if (!charges.length) return null;
  const paid = charges.filter((c) => c.status === "PAID");
  if (paid.length) {
    const sum = paid.reduce((s, c) => s + Number(c.amount?.value ?? 0), 0);
    return sum >= totalCents
      ? { status: "PAID", charge: paid[0] }
      : { status: "VERIFICATION_ERROR", charge: paid[0], reason: `valor pago ${sum} < total ${totalCents}` };
  }
  const by = (s) => charges.find((c) => c.status === s);
  const analysis = by("IN_ANALYSIS") || by("AUTHORIZED");
  if (analysis) return { status: "IN_ANALYSIS", charge: analysis };
  if (by("WAITING")) return { status: "AWAITING_PAYMENT", charge: by("WAITING") };
  const last = charges[charges.length - 1];
  if (last.status === "DECLINED") return { status: "DECLINED", charge: last };
  if (last.status === "CANCELED") return { status: "CANCELED", charge: last };
  return null;
}

export function createOrdersService({ db, config, pagbank, log = console, now = () => Date.now() }) {
  const q = {
    byPublic: db.prepare("SELECT * FROM orders WHERE public_id=?"),
    byId: db.prepare("SELECT * FROM orders WHERE id=?"),
    byRef: db.prepare("SELECT * FROM orders WHERE reference_id=?"),
    byIdem: db.prepare("SELECT * FROM orders WHERE idempotency_key=?"),
    byPbOrder: db.prepare("SELECT * FROM orders WHERE pagbank_order_id=?"),
    byPbCheckout: db.prepare("SELECT * FROM orders WHERE pagbank_checkout_id=?"),
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

  // ---------- checkout PagBank ----------
  async function openCheckout(order) {
    if (!pagbank.configured)
      throw new HttpError(503, "payments_not_configured", "Pagamentos ainda não estão configurados nesta loja.");
    const items = JSON.parse(order.items_json);
    const hook = `${config.webhookBaseUrl}/api/webhooks/pagbank`;
    const back = `${config.publicUrl}/pedido/${order.public_id}`;
    const payload = {
      reference_id: order.reference_id,
      items: items.map((i, idx) => ({
        reference_id: `${order.reference_id}-${idx}`, // prefixo de 24 chars = reference do pedido
        name: `${i.name} (Tam. ${i.size})`.slice(0, 100),
        quantity: i.quantity,
        unit_amount: i.unitCents,
      })),
      payment_methods: [{ type: "CREDIT_CARD" }, { type: "PIX" }, { type: "BOLETO" }],
      redirect_url: back,
      return_url: back,
      notification_urls: [hook],
      payment_notification_urls: [hook],
    };
    if (config.interestFreeInstallments) {
      const n = String(config.interestFreeInstallments);
      payload.payment_methods_configs = [
        { type: "CREDIT_CARD", config_options: [
          { option: "INSTALLMENTS_LIMIT", value: n },
          { option: "INTEREST_FREE_INSTALLMENTS", value: n },
        ] },
      ];
    }
    const previous = order.pagbank_checkout_id;
    try {
      const res = await pagbank.createCheckout(payload);
      const pay = (res?.links || []).find((l) => l.rel === "PAY")?.href;
      const payUrl = pay && safePayUrl(pay);
      if (!res?.id || !PB_ID_RE.checkout.test(res.id) || !payUrl) throw new PagBankError("Resposta de checkout inesperada");
      db.prepare(
        `UPDATE orders SET status='AWAITING_PAYMENT', pagbank_checkout_id=?, pagbank_pay_url=?, checkout_expires_at=?, last_error=NULL,
         pagbank_order_id=NULL, pagbank_charge_id=NULL, last_checked_at=0, updated_at=? WHERE id=?`,
      ).run(res.id, payUrl, new Date(now() + 2 * 3600_000).toISOString(), iso(), order.id);
    } catch (err) {
      db.prepare("UPDATE orders SET status='ERROR', last_error=?, updated_at=? WHERE id=?").run(
        String(err.message).slice(0, 300), iso(), order.id,
      );
      log.error(`[order ${order.id}] falha ao criar checkout: ${err.message}`);
      throw new HttpError(502, "checkout_failed", "Não foi possível iniciar o pagamento agora. Tente novamente em instantes.");
    }
    // Novo checkout = nova tentativa: o anterior é inativado (best-effort) para não ser pago depois por engano.
    if (previous && PB_ID_RE.checkout.test(previous)) {
      pagbank.inactivateCheckout(previous).catch((e) => log.warn(`[order ${order.id}] não inativou checkout anterior: ${e.message}`));
    }
    return q.byId.get(order.id);
  }

  const summary = (o) => ({
    publicId: o.public_id,
    status: o.status,
    payUrl: o.status === "AWAITING_PAYMENT" ? o.pagbank_pay_url : null,
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

  // ---------- atualização de status (PAID é terminal; nunca regride) ----------
  function setStatus(order, status, extra = {}) {
    const cur = q.byId.get(order.id);
    if (cur.status === "PAID") return "already_paid";
    db.prepare(
      `UPDATE orders SET status=?, pagbank_order_id=COALESCE(?,pagbank_order_id), pagbank_charge_id=COALESCE(?,pagbank_charge_id),
       paid_at=CASE WHEN ?='PAID' THEN COALESCE(?,?) ELSE paid_at END, last_error=?, updated_at=? WHERE id=?`,
    ).run(status, extra.pbOrderId ?? null, extra.chargeId ?? null, status, extra.paidAt ?? null, iso(), extra.reason ?? null, iso(), order.id);
    return `status:${status}`;
  }

  const matchesOrder = (order, pb) =>
    pb.reference_id === order.reference_id ||
    (pb.items || []).some((i) => typeof i.reference_id === "string" && i.reference_id.slice(0, 24) === order.reference_id) ||
    (order.pagbank_order_id && pb.id === order.pagbank_order_id);

  /** Consulta o pedido no PagBank (com o token privado) e aplica o status confirmado. */
  async function reconcile(order, pbOrderId) {
    if (!PB_ID_RE.order.test(pbOrderId)) return "invalid_id";
    const pb = await pagbank.getOrder(pbOrderId);
    if (!pb || !matchesOrder(order, pb)) return "reference_mismatch";
    const st = derivePaymentState(pb, order.total_cents);
    if (!st) return "no_charges";
    if (st.status === "VERIFICATION_ERROR") log.error(`[order ${order.id}] divergência de valor: ${st.reason}`);
    return setStatus(order, st.status, {
      pbOrderId: pb.id, chargeId: st.charge?.id, paidAt: st.charge?.paid_at, reason: st.reason,
    });
  }

  async function confirmExpiry(order) {
    if (!order.pagbank_checkout_id || !PB_ID_RE.checkout.test(order.pagbank_checkout_id)) return "no_checkout";
    const c = await pagbank.getCheckout(order.pagbank_checkout_id);
    if (c?.status === "EXPIRED" && order.status === "AWAITING_PAYMENT") return setStatus(order, "EXPIRED");
    return "not_expired";
  }

  function locate(payload) {
    const refs = new Set();
    if (typeof payload.reference_id === "string") refs.add(payload.reference_id);
    for (const i of payload.items || []) if (typeof i?.reference_id === "string") refs.add(i.reference_id.slice(0, 24));
    for (const r of refs) {
      const o = q.byRef.get(r);
      if (o) return o;
    }
    return typeof payload.id === "string" ? q.byPbOrder.get(payload.id) : undefined;
  }

  async function handleWebhook(rawBody, headers) {
    if (!config.pagbankToken) return { code: 503, body: { error: "payments_not_configured" } };
    const signed = verifyAuthenticity(rawBody, headers["x-authenticity-token"], config.pagbankToken);
    if (config.requireSignature && !signed) {
      log.warn("[webhook] assinatura inválida/ausente — descartado");
      return { code: 401, body: { error: "invalid_signature" } };
    }
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { code: 400, body: { error: "invalid_json" } };
    }
    if (!payload || typeof payload !== "object") return { code: 400, body: { error: "invalid_payload" } };

    const eventKey = sha256Hex(rawBody);
    if (db.prepare("SELECT 1 FROM payment_events WHERE event_key=?").get(eventKey))
      return { code: 200, body: { status: "duplicate" } };

    const id = typeof payload.id === "string" ? payload.id : "";
    let outcome = "ignored";
    let order = null;
    try {
      if (PB_ID_RE.order.test(id)) {
        order = locate(payload);
        outcome = order ? await reconcile(order, id) : "unknown_order";
      } else if (PB_ID_RE.checkout.test(id)) {
        order = q.byPbCheckout.get(id);
        if (order && payload.status === "EXPIRED") outcome = await confirmExpiry(order);
      }
    } catch (err) {
      if (err instanceof PagBankError && (err.status === 0 || err.status >= 500 || err.status === 429)) {
        log.error(`[webhook] PagBank indisponível: ${err.message}`);
        return { code: 503, body: { error: "verification_unavailable" } }; // PagBank reenviará
      }
      if (err instanceof PagBankError) outcome = `pagbank_${err.status}`;
      else throw err;
    }
    db.prepare("INSERT OR IGNORE INTO payment_events (event_key,order_id,source,outcome,received_at) VALUES (?,?,?,?,?)").run(
      eventKey, order?.id ?? null, "webhook", outcome, iso(),
    );
    log.log(`[webhook] ${id.slice(0, 9)}… -> ${outcome}${order ? ` (pedido ${order.id})` : ""}`);
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
      `Valor total: ${formatBRL(o.total_cents)}\nPagamento: aprovado pelo PagBank\n\nGostaria de confirmar os detalhes da entrega.`;
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
      payUrl: o.status === "AWAITING_PAYMENT" ? o.pagbank_pay_url : null,
      canRetry: RETRYABLE.has(o.status),
      whatsappUrl: whatsappUrl(o),
      whatsappConfigured: /^55\d{10,11}$/.test(config.whatsappNumber),
      verification,
    };
  }

  async function getPublicView(publicId) {
    let o = q.byPublic.get(publicId);
    if (!o) return null;
    let verification = "ok";
    if (PENDING.has(o.status) && now() - o.last_checked_at > 8000 && pagbank.configured) {
      db.prepare("UPDATE orders SET last_checked_at=? WHERE id=?").run(now(), o.id); // throttle
      try {
        if (o.pagbank_order_id) await reconcile(o, o.pagbank_order_id);
        else if (o.checkout_expires_at && Date.parse(o.checkout_expires_at) < now()) await confirmExpiry(o);
      } catch (err) {
        verification = "error";
        log.error(`[order ${o.id}] reconciliação falhou: ${err.message}`);
      }
      o = q.byPublic.get(publicId);
    }
    return toView(o, verification);
  }

  const listOrders = () =>
    db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 200").all().map((o) => ({
      ...toView(o), publicId: undefined, pagbankOrderId: o.pagbank_order_id, lastError: o.last_error,
    }));

  return { createOrder, retryOrder, handleWebhook, getPublicView, listOrders, priceCart };
}
