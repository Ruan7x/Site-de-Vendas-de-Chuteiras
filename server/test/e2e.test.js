import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb } from "../db.js";
import { createApp } from "../app.js";
import { createMercadoPagoClient, verifySignature } from "../mercadopago.js";
import { loadConfig } from "../config.js";

const TOKEN = "APP_USR-test-token";
const SECRET = "webhook-secret-xyz";
const quiet = { log() {}, warn() {}, error() {} };

/** Mercado Pago falso: guarda o "estado real" dos pagamentos e das preferências. */
async function startMock() {
  const state = { preferences: 0, payments: {}, failCreate: false, lastBody: null, down: false };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (code, obj) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (state.down) return req.socket.destroy();
      if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { message: "invalid access token" });
      const url = new URL(req.url, "http://x");
      if (req.method === "POST" && url.pathname === "/checkout/preferences") {
        if (state.failCreate) return send(400, { message: "invalid_items", error: "bad_request" });
        state.preferences++;
        state.lastBody = JSON.parse(body);
        const n = state.preferences;
        const origin = `http://127.0.0.1:${server.address().port}`;
        return send(201, {
          id: `1234567-abcd-${n}`,
          init_point: `${origin}/pay?pref=${n}`,
          sandbox_init_point: `${origin}/sandbox-pay?pref=${n}`,
        });
      }
      let m = url.pathname.match(/^\/v1\/payments\/(\d+)$/);
      if (m) return state.payments[m[1]] ? send(200, state.payments[m[1]]) : send(404, { message: "Payment not found" });
      if (url.pathname === "/v1/payments/search") {
        const ref = url.searchParams.get("external_reference");
        const results = Object.values(state.payments).filter((p) => p.external_reference === ref);
        return send(200, { paging: { total: results.length, limit: 30, offset: 0 }, results });
      }
      send(404, {});
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { state, server, url: `http://127.0.0.1:${server.address().port}` };
}

async function setup(extraEnv = {}) {
  const mock = await startMock();
  const config = loadConfig({
    PUBLIC_URL: "http://localhost:5173",
    WEBHOOK_BASE_URL: "https://hooks.example.com",
    MP_ACCESS_TOKEN: TOKEN,
    MP_WEBHOOK_SECRET: SECRET,
    MP_BASE_URL: mock.url,
    MP_PAY_HOSTS: "127.0.0.1",
    WHATSAPP_NUMBER: "5565999998888",
    ADMIN_PASSWORD: "s3cret-pass",
    SESSION_SECRET: "x".repeat(32),
    UPLOADS_DIR: path.join(os.tmpdir(), `tn-up-${Date.now()}-${Math.random()}`),
    FEEDBACK_UPLOADS_DIR: path.join(os.tmpdir(), `tn-fb-${Date.now()}-${Math.random()}`),
    ...extraEnv,
  });
  const db = openDb(":memory:");
  const mp = createMercadoPagoClient({ accessToken: config.mpAccessToken, baseUrl: mock.url });
  const app = createApp({ db, config, mp, log: quiet });
  const server = await new Promise((r) => {
    const s = app.listen(0, "127.0.0.1", () => r(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, p, body, headers = {}) => {
    const res = await fetch(base + p, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, json, headers: res.headers };
  };
  const close = () => {
    server.close();
    mock.server.close();
  };
  return { api, db, mock, config, close, base };
}

const key = () => crypto.randomBytes(16).toString("hex");
const hmac = (dataId, rid, ts, secret = SECRET) =>
  crypto.createHmac("sha256", secret).update(`id:${dataId};request-id:${rid};ts:${ts};`).digest("hex");

/** Envia um webhook como o Mercado Pago envia: id na query + x-signature + x-request-id. */
const hook = (t, paymentId, { signed = true, secret = SECRET, body } = {}) => {
  const rid = crypto.randomUUID();
  const ts = String(Date.now());
  const headers = { "x-request-id": rid };
  if (signed) headers["x-signature"] = `ts=${ts},v1=${hmac(paymentId, rid, ts, secret)}`;
  const payload = body ?? { action: "payment.updated", type: "payment", data: { id: String(paymentId) }, id: crypto.randomInt(1e9) };
  return t.api("POST", `/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`, JSON.stringify(payload), headers);
};

let seq = 5000;
const payment = (ref, status, amount, extra = {}) => ({
  id: ++seq,
  external_reference: ref,
  status,
  status_detail: status === "approved" ? "accredited" : "pending_waiting_payment",
  currency_id: "BRL",
  transaction_amount: amount,
  date_created: new Date(Date.now() + seq).toISOString(),
  date_approved: status === "approved" ? "2026-10-28T20:00:00.000-04:00" : null,
  ...extra,
});
const put = (t, p) => (t.mock.state.payments[p.id] = p);

async function newOrder(t, items = [{ productId: "velocity-fg", size: 40, quantity: 2 }]) {
  const r = await t.api("POST", "/api/orders", { items, idempotencyKey: key() });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json;
}
const view = async (t, id, qs = "") => (await t.api("GET", `/api/orders/${id}${qs}`)).json;

test("assinatura x-signature: aceita a válida e recusa adulterada/ausente", () => {
  const rid = "req-1";
  const ts = "1704908010";
  const good = `ts=${ts},v1=${hmac("98765", rid, ts)}`;
  assert.equal(verifySignature({ signature: good, requestId: rid, dataId: "98765", secret: SECRET }), true);
  assert.equal(verifySignature({ signature: good, requestId: rid, dataId: "11111", secret: SECRET }), false);
  assert.equal(verifySignature({ signature: good, requestId: "outro", dataId: "98765", secret: SECRET }), false);
  assert.equal(verifySignature({ signature: good, requestId: rid, dataId: "98765", secret: "errado" }), false);
  assert.equal(verifySignature({ signature: undefined, requestId: rid, dataId: "98765", secret: SECRET }), false);
  assert.equal(verifySignature({ signature: "lixo", requestId: rid, dataId: "98765", secret: SECRET }), false);
  // data.id alfanumérico: a doc pede minúsculas
  const up = `ts=${ts},v1=${hmac("abc123", rid, ts)}`;
  assert.equal(verifySignature({ signature: up, requestId: rid, dataId: "ABC123", secret: SECRET }), true);
});

test("pedido: preço vem do servidor, preferência correta, validações e idempotência", async () => {
  const t = await setup();
  try {
    // o navegador tenta forçar preço/total: campos extras são ignorados
    const r = await t.api("POST", "/api/orders", {
      items: [{ productId: "velocity-fg", size: 40, quantity: 2, price: 1, unitCents: 1 }],
      total: 1,
      idempotencyKey: key(),
    });
    assert.equal(r.status, 201);
    assert.match(r.json.payUrl, /^http:\/\/127\.0\.0\.1:\d+\/pay\?pref=1$/); // init_point (não sandbox por padrão)
    const sent = t.mock.state.lastBody;
    assert.equal(sent.items[0].unit_price, 899.9); // R$ 899,90 do banco
    assert.equal(sent.items[0].quantity, 2);
    assert.equal(sent.items[0].currency_id, "BRL");
    assert.equal(sent.external_reference.length, 24);
    assert.equal(sent.back_urls.success, `http://localhost:5173/pedido/${sent.external_reference}`);
    assert.equal(sent.notification_url, "https://hooks.example.com/api/webhooks/mercadopago");
    assert.equal(sent.auto_return, undefined); // site em http: auto_return não é enviado
    assert.equal(sent.expires, true);
    const v = await view(t, r.json.publicId);
    assert.equal(v.total, 1799.8);
    // validações
    const bad = (items) => t.api("POST", "/api/orders", { items, idempotencyKey: key() });
    assert.equal((await bad([{ productId: "nao-existe", size: 40, quantity: 1 }])).status, 422);
    assert.equal((await bad([{ productId: "velocity-fg", size: 50, quantity: 1 }])).status, 422);
    assert.equal((await bad([{ productId: "velocity-fg", size: 40, quantity: 0 }])).status, 400);
    assert.equal((await bad([])).status, 400);
    // idempotência: mesma chave não cria 2º pedido nem 2ª preferência
    const k = key();
    const body = { items: [{ productId: "stealth-tf", size: 38, quantity: 1 }], idempotencyKey: k };
    const a = await t.api("POST", "/api/orders", body);
    const before = t.mock.state.preferences;
    const b = await t.api("POST", "/api/orders", body);
    assert.equal(a.json.publicId, b.json.publicId);
    assert.equal(t.mock.state.preferences, before);
    // id inválido / inexistente → 404
    assert.equal((await t.api("GET", "/api/orders/abc")).status, 404);
    assert.equal((await t.api("GET", `/api/orders/${"A".repeat(24)}`)).status, 404);
  } finally {
    t.close();
  }
});

test("site em https: auto_return; sandbox opcional usa sandbox_init_point; webhook localhost não é enviado", async () => {
  const t = await setup({ PUBLIC_URL: "https://loja.example.com", WEBHOOK_BASE_URL: "", MP_USE_SANDBOX_CHECKOUT: "true" });
  try {
    const r = await newOrder(t);
    assert.equal(t.mock.state.lastBody.auto_return, "approved");
    assert.match(r.payUrl, /sandbox-pay/);
  } finally {
    t.close();
  }
  const t2 = await setup({ PUBLIC_URL: "http://localhost:5173", WEBHOOK_BASE_URL: "http://localhost:3001" });
  try {
    await newOrder(t2);
    assert.equal(t2.mock.state.lastBody.notification_url, undefined);
  } finally {
    t2.close();
  }
});

test("webhook: assinatura inválida/ausente é descartada; webhook sem pagamento real não confirma nada", async () => {
  const t = await setup();
  try {
    const o = await newOrder(t);
    const ref = o.publicId;
    const real = put(t, payment(ref, "approved", 1799.8));
    const dbStatus = () => t.db.prepare("SELECT status FROM orders WHERE public_id=?").get(ref).status;
    assert.equal((await hook(t, real.id, { signed: false })).status, 401);
    assert.equal((await hook(t, real.id, { secret: "chave-errada" })).status, 401);
    assert.equal(dbStatus(), "AWAITING_PAYMENT"); // webhooks recusados não aplicaram nada
    // assinatura válida para um id que não existe na API (ex.: "Simular notificação" do painel): 200 e ignorado
    const sim = await hook(t, 123456);
    assert.equal(sim.status, 200);
    assert.equal(sim.json.status, "mercadopago_404");
    assert.equal(dbStatus(), "AWAITING_PAYMENT");
    // tópico que não é pagamento é ignorado
    const mo = await t.api("POST", "/api/webhooks/mercadopago?topic=merchant_order&id=1", "{}", {});
    assert.equal(mo.status, 401); // sem assinatura continua recusado
  } finally {
    t.close();
  }
});

test("pagamento aprovado: confirma pela API, libera WhatsApp com a mensagem correta, é idempotente e só vira REFUNDED", async () => {
  const t = await setup();
  try {
    const o = await newOrder(t);
    const ref = o.publicId;
    const pay = put(t, payment(ref, "approved", 1799.8));
    const rid = crypto.randomUUID();
    const ts = String(Date.now());
    const raw = JSON.stringify({ action: "payment.updated", type: "payment", data: { id: String(pay.id) }, id: 42 });
    const send = () =>
      t.api("POST", `/api/webhooks/mercadopago?data.id=${pay.id}&type=payment`, raw, {
        "x-request-id": rid,
        "x-signature": `ts=${ts},v1=${hmac(pay.id, rid, ts)}`,
      });
    const r1 = await send();
    assert.equal(r1.status, 200);
    assert.equal(r1.json.status, "status:PAID");
    assert.equal((await send()).json.status, "duplicate"); // mesmo evento não é reprocessado
    const v = await view(t, ref);
    assert.equal(v.status, "PAID");
    const u = new URL(v.whatsappUrl);
    assert.equal(u.origin + u.pathname, "https://wa.me/5565999998888");
    const msg = u.searchParams.get("text");
    assert.match(msg, /Pedido: #TN-00001/);
    assert.match(msg, /2x Velocity FG \(Tam\. 40\)/);
    assert.match(msg, /Valor total: R\$ 1\.799,80/);
    assert.match(msg, /Pagamento: aprovado pelo Mercado Pago/);
    assert.equal(t.db.prepare("SELECT provider_payment_id p FROM orders").get().p, String(pay.id));
    // um evento posterior "recusado" de outra tentativa não regride um pedido pago
    const other = put(t, payment(ref, "rejected", 1799.8));
    await hook(t, other.id);
    assert.equal((await view(t, ref)).status, "PAID");
    assert.equal((await t.api("POST", `/api/orders/${ref}/retry`)).status, 409);
    // reembolso confirmado na API: PAID → REFUNDED e o WhatsApp deixa de ser liberado
    delete t.mock.state.payments[other.id];
    pay.status = "refunded";
    await hook(t, pay.id, { body: { action: "payment.updated", type: "payment", data: { id: String(pay.id) }, id: 43 } });
    const after = await view(t, ref);
    assert.equal(after.status, "REFUNDED");
    assert.equal(after.whatsappUrl, null);
  } finally {
    t.close();
  }
});

test("sem webhook (credenciais de teste): a página /pedido confirma sozinha pela busca por external_reference", async () => {
  const t = await setup();
  try {
    const o = await newOrder(t);
    const ref = o.publicId;
    assert.equal((await view(t, ref)).status, "AWAITING_PAYMENT");
    put(t, payment(ref, "approved", 1799.8));
    t.db.prepare("UPDATE orders SET last_checked_at=0").run(); // passa o intervalo mínimo entre consultas
    const v = await view(t, ref);
    assert.equal(v.status, "PAID");
    assert.ok(v.whatsappUrl);
    // pagamento de OUTRO pedido nunca confirma este
    const o2 = await newOrder(t, [{ productId: "stealth-tf", size: 40, quantity: 1 }]);
    put(t, payment("referencia-de-outro-pedido", "approved", 559.9));
    t.db.prepare("UPDATE orders SET last_checked_at=0").run();
    assert.equal((await view(t, o2.publicId)).status, "AWAITING_PAYMENT");
  } finally {
    t.close();
  }
});

test("retorno do checkout: payment_id na URL é só dica e é conferido na API", async () => {
  const t = await setup();
  try {
    const a = await newOrder(t);
    const b = await newOrder(t, [{ productId: "stealth-tf", size: 40, quantity: 1 }]);
    // dica apontando para um pagamento de outro pedido: ignorada
    const foreign = put(t, payment(b.publicId, "approved", 559.9));
    assert.equal((await view(t, a.publicId, `?payment_id=${foreign.id}`)).status, "AWAITING_PAYMENT");
    // dica válida: confirmado
    const mine = put(t, payment(a.publicId, "approved", 1799.8));
    assert.equal((await view(t, a.publicId, `?payment_id=${mine.id}`)).status, "PAID");
    // dica inexistente / malformada: sem efeito e sem erro
    const c = await newOrder(t, [{ productId: "aero-elite", size: 40, quantity: 1 }]);
    assert.equal((await view(t, c.publicId, "?payment_id=999999999")).status, "AWAITING_PAYMENT");
    assert.equal((await t.api("GET", `/api/orders/${c.publicId}?payment_id=../../x`)).status, 200);
  } finally {
    t.close();
  }
});

test("valor divergente ou moeda diferente nunca vira PAID", async () => {
  const t = await setup();
  try {
    const o = await newOrder(t);
    put(t, payment(o.publicId, "approved", 1));
    t.db.prepare("UPDATE orders SET last_checked_at=0").run();
    const v = await view(t, o.publicId);
    assert.equal(v.status, "VERIFICATION_ERROR");
    assert.equal(v.whatsappUrl, null);
    assert.equal(v.canRetry, false);
    const o2 = await newOrder(t, [{ productId: "stealth-tf", size: 40, quantity: 1 }]);
    put(t, payment(o2.publicId, "approved", 559.9, { currency_id: "USD" }));
    t.db.prepare("UPDATE orders SET last_checked_at=0").run();
    assert.notEqual((await view(t, o2.publicId)).status, "PAID");
  } finally {
    t.close();
  }
});

test("pendente, em análise, recusado e cancelado: estados corretos e nova tentativa no MESMO pedido", async () => {
  const t = await setup();
  try {
    const o = await newOrder(t);
    const ref = o.publicId;
    const refresh = async () => {
      t.db.prepare("UPDATE orders SET last_checked_at=0").run();
      return view(t, ref);
    };
    const p1 = put(t, payment(ref, "pending", 1799.8)); // Pix/boleto gerado
    assert.equal((await refresh()).status, "AWAITING_PAYMENT");
    p1.status = "in_process";
    assert.equal((await refresh()).status, "IN_ANALYSIS");
    p1.status = "rejected";
    let v = await refresh();
    assert.equal(v.status, "DECLINED");
    assert.equal(v.canRetry, true);
    const before = t.mock.state.preferences;
    const rr = await t.api("POST", `/api/orders/${ref}/retry`);
    assert.equal(rr.status, 200);
    assert.equal(rr.json.publicId, ref);
    assert.match(rr.json.payUrl, /pay\?pref=2$/);
    assert.equal(t.mock.state.preferences, before + 1);
    assert.equal(t.mock.state.lastBody.external_reference, ref); // mesma referência
    // retry de pedido que não falhou → 409
    assert.equal((await t.api("POST", `/api/orders/${ref}/retry`)).status, 409);
    // segunda tentativa aprovada: vira PAID mesmo existindo uma tentativa recusada antes
    put(t, payment(ref, "approved", 1799.8));
    assert.equal((await refresh()).status, "PAID");
    // cancelado e expirado
    const o2 = await newOrder(t, [{ productId: "stealth-tf", size: 40, quantity: 1 }]);
    put(t, payment(o2.publicId, "cancelled", 559.9));
    t.db.prepare("UPDATE orders SET last_checked_at=0").run();
    assert.equal((await view(t, o2.publicId)).status, "CANCELED");
    const o3 = await newOrder(t, [{ productId: "aero-elite", size: 40, quantity: 1 }]);
    put(t, payment(o3.publicId, "cancelled", 1399.9, { status_detail: "expired" }));
    t.db.prepare("UPDATE orders SET last_checked_at=0").run();
    assert.equal((await view(t, o3.publicId)).status, "EXPIRED");
  } finally {
    t.close();
  }
});

test("link de pagamento expirado sem nenhum pagamento vira EXPIRED e permite tentar de novo", async () => {
  const t = await setup();
  try {
    const o = await newOrder(t);
    t.db.prepare("UPDATE orders SET checkout_expires_at=?, last_checked_at=0").run(new Date(Date.now() - 1000).toISOString());
    const v = await view(t, o.publicId);
    assert.equal(v.status, "EXPIRED");
    assert.equal(v.canRetry, true);
  } finally {
    t.close();
  }
});

test("falha ao criar a preferência: pedido em ERROR, mesma chave tenta de novo sem duplicar; Mercado Pago fora do ar no webhook → 503", async () => {
  const t = await setup();
  try {
    t.mock.state.failCreate = true;
    const k = key();
    const body = { items: [{ productId: "velocity-fg", size: 40, quantity: 1 }], idempotencyKey: k };
    const r = await t.api("POST", "/api/orders", body);
    assert.equal(r.status, 502);
    assert.ok(!JSON.stringify(r.json).includes(TOKEN));
    assert.equal(t.db.prepare("SELECT COUNT(*) c FROM orders").get().c, 1);
    t.mock.state.failCreate = false;
    const r2 = await t.api("POST", "/api/orders", body);
    assert.equal(r2.status, 201);
    assert.equal(t.db.prepare("SELECT COUNT(*) c FROM orders").get().c, 1);
    // Mercado Pago indisponível ao verificar o webhook → 503 (ele reenvia), sem marcar nada
    t.mock.state.down = true;
    const h = await hook(t, 777777);
    assert.equal(h.status, 503);
    t.mock.state.down = false;
    assert.equal((await view(t, r2.json.publicId)).status, "AWAITING_PAYMENT");
  } finally {
    t.close();
  }
});

// PNG mínimo válido (assinatura) para os testes de upload
const png = (extra = 32) =>
  "data:image/png;base64," + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(extra, 1)]).toString("base64");
const jpg = () => "data:image/jpeg;base64," + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 2)]).toString("base64");

async function adminCookie(t) {
  const login = await t.api("POST", "/api/admin/login", { password: "s3cret-pass" });
  assert.equal(login.status, 200);
  return { cookie: login.headers.get("set-cookie").split(";")[0] };
}

test("feedback: valida, grava com modelo e fotos, antispam; fotos só o admin vê", async () => {
  const t = await setup();
  try {
    const ok = { rating: 5, comment: "Atendimento excelente!", name: "Thiago", email: "t@exemplo.com", model: "Velocity FG", elapsedMs: 8000 };
    const first = await t.api("POST", "/api/feedback", { ...ok, images: [png(), jpg()] });
    assert.equal(first.status, 201, JSON.stringify(first.json));
    const row = t.db.prepare("SELECT * FROM feedback").get();
    assert.equal(row.rating, 5);
    assert.equal(row.name, "Thiago");
    assert.equal(row.model, "Velocity FG");
    assert.ok(row.created_at);
    const names = JSON.parse(row.images);
    assert.equal(names.length, 2);
    assert.match(names[0], /^[0-9a-f]{24}\.png$/);
    assert.match(names[1], /^[0-9a-f]{24}\.jpg$/);
    assert.ok(fs.existsSync(path.join(t.config.feedbackDir, names[0])));
    // as fotos NÃO ficam em /uploads (público)
    assert.equal((await t.api("GET", `/uploads/${names[0]}`)).status, 404);
    // sem login, não há como ver foto nem lista
    assert.equal((await t.api("GET", `/api/admin/feedback-images/${names[0]}`)).status, 401);
    assert.equal((await t.api("GET", "/api/admin/feedback")).status, 401);
    // com login: lista traz modelo e URLs das fotos; a foto é entregue
    const cookie = await adminCookie(t);
    const list = (await t.api("GET", "/api/admin/feedback", undefined, cookie)).json.feedback[0];
    assert.equal(list.model, "Velocity FG");
    assert.deepEqual(list.images, names.map((n) => `/api/admin/feedback-images/${n}`));
    const img = await fetch(t.base + list.images[0], { headers: cookie });
    assert.equal(img.status, 200);
    assert.equal(img.headers.get("content-type"), "image/png");
    // path traversal / nome inválido
    assert.equal((await t.api("GET", "/api/admin/feedback-images/..%2F..%2Fetc%2Fpasswd", undefined, cookie)).status, 404);
    assert.equal((await t.api("GET", "/api/admin/feedback-images/" + "0".repeat(24) + ".png", undefined, cookie)).status, 404);

    // validações dos campos
    assert.equal((await t.api("POST", "/api/feedback", { ...ok, rating: 6 })).status, 400);
    assert.equal((await t.api("POST", "/api/feedback", { ...ok, rating: 0 })).status, 400);
    assert.equal((await t.api("POST", "/api/feedback", { ...ok, comment: "ok" })).status, 400);
    assert.equal((await t.api("POST", "/api/feedback", { ...ok, email: "invalido" })).status, 400);
    assert.equal((await t.api("POST", "/api/feedback", { rating: 4, comment: "Sem nome, modelo nem foto" })).status, 201);
    // fotos inválidas: mais de 3, falso PNG (texto), tipo não permitido, grande demais — nada é gravado
    const filesBefore = fs.readdirSync(t.config.feedbackDir).length;
    const rowsBefore = t.db.prepare("SELECT COUNT(*) c FROM feedback").get().c;
    const c = (extra) => ({ ...ok, comment: `tentativa ${Math.random()}`, ...extra });
    assert.equal((await t.api("POST", "/api/feedback", c({ images: [png(), png(), png(), png()] }))).status, 400);
    const fake = "data:image/png;base64," + Buffer.from("<script>alert(1)</script>").toString("base64");
    assert.equal((await t.api("POST", "/api/feedback", c({ images: [png(), fake] }))).status, 422);
    assert.equal((await t.api("POST", "/api/feedback", c({ images: ["data:image/svg+xml;base64," + Buffer.from("<svg/>").toString("base64")] }))).status, 422);
    assert.equal((await t.api("POST", "/api/feedback", c({ images: [png(3 * 1024 * 1024)] }))).status, 422);
    assert.equal(fs.readdirSync(t.config.feedbackDir).length, filesBefore);
    assert.equal(t.db.prepare("SELECT COUNT(*) c FROM feedback").get().c, rowsBefore);
    // honeypot: finge sucesso mas não grava; rápido demais: 429
    assert.equal((await t.api("POST", "/api/feedback", c({ website: "http://spam" }))).status, 201);
    assert.equal(t.db.prepare("SELECT COUNT(*) c FROM feedback").get().c, rowsBefore);
    assert.equal((await t.api("POST", "/api/feedback", c({ elapsedMs: 100 }))).status, 429);
    // duplicado não grava de novo
    await t.api("POST", "/api/feedback", ok);
    assert.equal(t.db.prepare("SELECT COUNT(*) c FROM feedback").get().c, rowsBefore);
    // limite por IP (5 envios válidos/h)
    let last;
    for (let i = 0; i < 6; i++) last = await t.api("POST", "/api/feedback", { ...ok, comment: `comentario ${i} longo` });
    assert.equal(last.status, 429);
    assert.equal((await t.api("GET", "/api/feedback")).status, 404);
  } finally {
    t.close();
  }
});

test("admin: login no servidor, CRUD de produtos, upload validado, preço novo vale no pedido", async () => {
  const t = await setup();
  try {
    assert.equal((await t.api("POST", "/api/admin/products", {})).status, 401);
    assert.equal((await t.api("GET", "/api/admin/orders")).status, 401);
    assert.equal((await t.api("POST", "/api/admin/login", { password: "errada" })).status, 401);
    assert.equal((await t.api("POST", "/api/admin/login", { password: "s3cret-pass" }, { origin: "http://evil.com" })).status, 403);
    const login = await t.api("POST", "/api/admin/login", { password: "s3cret-pass" });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get("set-cookie");
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    const cookie = { cookie: setCookie.split(";")[0] };
    const created = await t.api("POST", "/api/admin/products", { name: "Nova Chuteira", category: "Campo", price: 500, sizes: [40, 41], imageData: png() }, cookie);
    assert.equal(created.status, 201, JSON.stringify(created.json));
    assert.match(created.json.image, /^\/uploads\/[0-9a-f]{24}\.png$/);
    assert.equal(created.json.id, "nova-chuteira");
    const base = { name: "X", category: "Campo", price: 5, sizes: [40] };
    assert.equal((await t.api("POST", "/api/admin/products", { ...base, imageData: "data:image/png;base64," + Buffer.from("<script>").toString("base64") }, cookie)).status, 422);
    assert.equal((await t.api("POST", "/api/admin/products", { ...base, image: "/a.png" }, { ...cookie, origin: "http://evil.com" })).status, 403);
    assert.equal((await t.api("POST", "/api/admin/products", { ...base, image: "http://x.com/a.png" }, cookie)).status, 422);
    const upd = await t.api("PUT", "/api/admin/products/nova-chuteira", { name: "Nova Chuteira", category: "Campo", price: 650.5, sizes: [39, 40], image: created.json.image }, cookie);
    assert.equal(upd.json.price, 650.5);
    assert.deepEqual(upd.json.sizes, [39, 40]);
    assert.equal((await t.api("GET", "/api/products")).json.products.find((p) => p.id === "nova-chuteira").price, 650.5);
    await t.api("POST", "/api/orders", { items: [{ productId: "nova-chuteira", size: 39, quantity: 1 }], idempotencyKey: key() });
    assert.equal(t.mock.state.lastBody.items[0].unit_price, 650.5);
    assert.equal((await t.api("POST", "/api/orders", { items: [{ productId: "nova-chuteira", size: 41, quantity: 1 }], idempotencyKey: key() })).status, 422);
    assert.equal((await t.api("DELETE", "/api/admin/products/nova-chuteira", undefined, cookie)).status, 200);
    assert.equal((await t.api("GET", "/api/products")).json.products.some((p) => p.id === "nova-chuteira"), false);
    assert.equal((await t.api("GET", "/api/admin/orders", undefined, cookie)).status, 200);
    assert.equal((await t.api("GET", "/api/admin/orders", undefined, { cookie: cookie.cookie.slice(0, -3) + "abc" })).status, 401);
  } finally {
    t.close();
  }
});

test("banco antigo (PagBank/feedback sem modelo) é migrado sem perder dados", async () => {
  const Database = (await import("better-sqlite3")).default;
  const file = path.join(os.tmpdir(), `tn-old-${Date.now()}.db`);
  const old = new Database(file);
  old.exec(`
    CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, public_id TEXT NOT NULL UNIQUE, reference_id TEXT NOT NULL UNIQUE,
      idempotency_key TEXT UNIQUE, user_id TEXT, status TEXT NOT NULL, total_cents INTEGER NOT NULL, items_json TEXT NOT NULL,
      pagbank_checkout_id TEXT, pagbank_pay_url TEXT, pagbank_order_id TEXT, pagbank_charge_id TEXT, checkout_expires_at TEXT,
      last_error TEXT, last_checked_at INTEGER NOT NULL DEFAULT 0, paid_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX idx_orders_pb_order ON orders(pagbank_order_id);
    CREATE TABLE feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, rating INTEGER NOT NULL, comment TEXT NOT NULL, name TEXT, email TEXT, ip_hash TEXT, created_at TEXT NOT NULL);
    INSERT INTO orders (public_id,reference_id,status,total_cents,items_json,pagbank_order_id,created_at,updated_at) VALUES ('p1','p1','PAID',100,'[]','ORDE_X','t','t');
    INSERT INTO feedback (rating,comment,created_at) VALUES (4,'antigo','t');
  `);
  old.close();
  const db = openDb(file);
  assert.equal(db.prepare("SELECT provider_payment_id p FROM orders").get().p, "ORDE_X");
  assert.equal(db.prepare("SELECT model, images FROM feedback").get().images, "[]");
  assert.equal(db.prepare("SELECT COUNT(*) c FROM products").get().c, 5);
  db.close();
  fs.rmSync(file, { force: true });
});

test("sem MP_ACCESS_TOKEN o checkout fica desativado (sem simulação)", async () => {
  const config = loadConfig({ MP_ACCESS_TOKEN: "", ADMIN_PASSWORD: "x" });
  const db = openDb(":memory:");
  const app = createApp({ db, config, mp: createMercadoPagoClient({ accessToken: "", baseUrl: "http://127.0.0.1:1" }), log: quiet });
  const s = await new Promise((r) => {
    const x = app.listen(0, "127.0.0.1", () => r(x));
  });
  const res = await fetch(`http://127.0.0.1:${s.address().port}/api/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: [{ productId: "velocity-fg", size: 40, quantity: 1 }], idempotencyKey: key() }),
  });
  assert.equal(res.status, 503);
  const wh = await fetch(`http://127.0.0.1:${s.address().port}/api/webhooks/mercadopago?data.id=1&type=payment`, { method: "POST", body: "{}" });
  assert.equal(wh.status, 503);
  s.close();
});
