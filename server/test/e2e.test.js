import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { openDb } from "../db.js";
import { createApp } from "../app.js";
import { createPagBankClient } from "../pagbank.js";
import { loadConfig } from "../config.js";

const TOKEN = "test-token-123";
const quiet = { log() {}, warn() {}, error() {} };

/** PagBank falso: guarda o "estado real" dos pedidos e conta chamadas. */
async function startMock() {
  const state = { checkouts: 0, orderGets: 0, orders: {}, checkoutStatus: "ACTIVE", failCreate: false, lastBody: null };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
      if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { error: "unauthorized" });
      if (req.method === "POST" && req.url === "/checkouts") {
        if (state.failCreate) return send(400, { error_messages: [{ code: "40002", parameter_name: "items" }] });
        state.checkouts++; state.lastBody = JSON.parse(body);
        const n = state.checkouts;
        return send(201, { id: `CHEC_0000000${n}-AAAA`, status: "ACTIVE",
          links: [{ rel: "PAY", href: `http://127.0.0.1:${server.address().port}/pay?code=${n}`, method: "GET" }] });
      }
      let m = req.url.match(/^\/orders\/(ORDE_[\w-]+)$/);
      if (m) { state.orderGets++; const o = state.orders[m[1]]; return o ? send(200, o) : send(404, {}); }
      m = req.url.match(/^\/checkouts\/(CHEC_[\w-]+)$/);
      if (m) return send(200, { id: m[1], status: state.checkoutStatus });
      send(404, {});
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { state, server, url: `http://127.0.0.1:${server.address().port}` };
}

async function setup(extraEnv = {}) {
  const mock = await startMock();
  const config = loadConfig({
    PUBLIC_URL: "http://localhost:5173", WEBHOOK_BASE_URL: "https://hooks.example.com",
    PAGBANK_TOKEN: TOKEN, PAGBANK_BASE_URL: mock.url, PAGBANK_PAY_HOSTS: "127.0.0.1",
    WHATSAPP_NUMBER: "5565999998888", ADMIN_PASSWORD: "s3cret-pass", SESSION_SECRET: "x".repeat(32),
    UPLOADS_DIR: path.join(os.tmpdir(), `tn-up-${Date.now()}`), ...extraEnv,
  });
  const db = openDb(":memory:");
  const pagbank = createPagBankClient({ token: TOKEN, baseUrl: mock.url });
  const app = createApp({ db, config, pagbank, log: quiet });
  const server = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, p, body, headers = {}) => {
    const res = await fetch(base + p, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)) });
    const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json, headers: res.headers };
  };
  const close = () => { server.close(); mock.server.close(); };
  return { api, db, mock, config, close };
}

const key = () => crypto.randomBytes(16).toString("hex");
const sign = (raw) => crypto.createHash("sha256").update(`${TOKEN}-${raw}`).digest("hex");
const hook = (t, payload, { signed = true } = {}) => {
  const raw = JSON.stringify(payload);
  return t.api("POST", "/api/webhooks/pagbank", raw, signed ? { "x-authenticity-token": sign(raw) } : {});
};
const pbOrder = (ref, status, value, id = "ORDE_11111111-AAAA") => ({
  id, reference_id: ref, items: [{ reference_id: `${ref}-0`, quantity: 1 }],
  charges: [{ id: "CHAR_22222222-BBBB", status, paid_at: "2026-10-14T10:00:00-03:00", amount: { value, currency: "BRL" } }],
});
async function newOrder(t, items = [{ productId: "velocity-fg", size: 40, quantity: 2 }]) {
  const r = await t.api("POST", "/api/orders", { items, idempotencyKey: key() });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json;
}

test("pedido: preço vem do servidor, validações e idempotência", async () => {
  const t = await setup();
  try {
    // cliente tenta forçar preço/total: campos extras são ignorados
    const r = await t.api("POST", "/api/orders", { items: [{ productId: "velocity-fg", size: 40, quantity: 2, price: 1, unitCents: 1 }], total: 1, idempotencyKey: key() });
    assert.equal(r.status, 201);
    assert.match(r.json.payUrl, /^http:\/\/127\.0\.0\.1:\d+\/pay\?code=1$/);
    const sent = t.mock.state.lastBody;
    assert.equal(sent.items[0].unit_amount, 89990); // R$ 899,90 do banco
    assert.equal(sent.items[0].quantity, 2);
    assert.equal(sent.reference_id.length, 24);
    assert.equal(sent.redirect_url, `http://localhost:5173/pedido/${sent.reference_id}`);
    assert.deepEqual(sent.payment_notification_urls, ["https://hooks.example.com/api/webhooks/pagbank"]);
    const v = await t.api("GET", `/api/orders/${r.json.publicId}`);
    assert.equal(v.json.total, 1799.8);
    // validações
    assert.equal((await t.api("POST", "/api/orders", { items: [{ productId: "nao-existe", size: 40, quantity: 1 }], idempotencyKey: key() })).status, 422);
    assert.equal((await t.api("POST", "/api/orders", { items: [{ productId: "velocity-fg", size: 50, quantity: 1 }], idempotencyKey: key() })).status, 422);
    assert.equal((await t.api("POST", "/api/orders", { items: [{ productId: "velocity-fg", size: 40, quantity: 0 }], idempotencyKey: key() })).status, 400);
    assert.equal((await t.api("POST", "/api/orders", { items: [], idempotencyKey: key() })).status, 400);
    // idempotência: mesma chave não cria 2º pedido nem 2º checkout
    const k = key(); const body = { items: [{ productId: "stealth-tf", size: 38, quantity: 1 }], idempotencyKey: k };
    const a = await t.api("POST", "/api/orders", body); const before = t.mock.state.checkouts;
    const b = await t.api("POST", "/api/orders", body);
    assert.equal(a.json.publicId, b.json.publicId);
    assert.equal(t.mock.state.checkouts, before);
    // id inválido / inexistente → 404 sem vazar nada
    assert.equal((await t.api("GET", "/api/orders/abc")).status, 404);
    assert.equal((await t.api("GET", `/api/orders/${"A".repeat(24)}`)).status, 404);
  } finally { t.close(); }
});

test("webhook: assinatura inválida é descartada; corpo forjado não confirma pagamento", async () => {
  const t = await setup();
  try {
    const o = await newOrder(t); const ref = o.publicId;
    const forged = pbOrder(ref, "PAID", 179980);
    assert.equal((await hook(t, forged, { signed: false })).status, 401);
    const raw = JSON.stringify(forged);
    assert.equal((await t.api("POST", "/api/webhooks/pagbank", raw, { "x-authenticity-token": "0".repeat(64) })).status, 401);
    // assinatura válida, mas a API do PagBank diz que NÃO está pago → continua pendente
    t.mock.state.orders["ORDE_11111111-AAAA"] = pbOrder(ref, "WAITING", 179980);
    assert.equal((await hook(t, forged)).status, 200);
    const v = await t.api("GET", `/api/orders/${ref}`);
    assert.equal(v.json.status, "AWAITING_PAYMENT");
    assert.equal(v.json.whatsappUrl, null);
  } finally { t.close(); }
});

test("pagamento aprovado: confirma pela API, libera WhatsApp com mensagem correta, é idempotente e não regride", async () => {
  const t = await setup();
  try {
    const o = await newOrder(t); const ref = o.publicId;
    t.mock.state.orders["ORDE_11111111-AAAA"] = pbOrder(ref, "PAID", 179980);
    const evt = pbOrder(ref, "PAID", 179980);
    const r1 = await hook(t, evt); assert.equal(r1.status, 200); assert.equal(r1.json.status, "status:PAID");
    const gets = t.mock.state.orderGets;
    const r2 = await hook(t, evt); assert.equal(r2.json.status, "duplicate");
    assert.equal(t.mock.state.orderGets, gets); // não reprocessou
    const v = (await t.api("GET", `/api/orders/${ref}`)).json;
    assert.equal(v.status, "PAID");
    const u = new URL(v.whatsappUrl);
    assert.equal(u.origin + u.pathname, "https://wa.me/5565999998888");
    const msg = u.searchParams.get("text");
    assert.match(msg, /Pedido: #TN-00001/);
    assert.match(msg, /2x Velocity FG \(Tam\. 40\)/);
    assert.match(msg, /Valor total: R\$ 1\.799,80/);
    assert.match(msg, /Pagamento: aprovado pelo PagBank/);
    // evento posterior "recusado" não regride um pedido pago
    t.mock.state.orders["ORDE_11111111-AAAA"] = pbOrder(ref, "DECLINED", 179980);
    await hook(t, { ...pbOrder(ref, "DECLINED", 179980), n: 2 });
    assert.equal((await t.api("GET", `/api/orders/${ref}`)).json.status, "PAID");
    assert.equal((await t.api("POST", `/api/orders/${ref}/retry`)).status, 409);
  } finally { t.close(); }
});

test("valor divergente nunca vira PAID", async () => {
  const t = await setup();
  try {
    const o = await newOrder(t);
    t.mock.state.orders["ORDE_11111111-AAAA"] = pbOrder(o.publicId, "PAID", 100);
    await hook(t, pbOrder(o.publicId, "PAID", 100));
    const v = (await t.api("GET", `/api/orders/${o.publicId}`)).json;
    assert.equal(v.status, "VERIFICATION_ERROR"); assert.equal(v.whatsappUrl, null); assert.equal(v.canRetry, false);
  } finally { t.close(); }
});

test("recusado/cancelado permitem nova tentativa no MESMO pedido; pedido de outra referência é ignorado", async () => {
  const t = await setup();
  try {
    const o = await newOrder(t); const ref = o.publicId;
    t.mock.state.orders["ORDE_11111111-AAAA"] = pbOrder(ref, "DECLINED", 179980);
    await hook(t, pbOrder(ref, "DECLINED", 179980));
    let v = (await t.api("GET", `/api/orders/${ref}`)).json;
    assert.equal(v.status, "DECLINED"); assert.equal(v.canRetry, true);
    const before = t.mock.state.checkouts;
    const rr = await t.api("POST", `/api/orders/${ref}/retry`);
    assert.equal(rr.status, 200); assert.equal(rr.json.publicId, ref); assert.match(rr.json.payUrl, /pay\?code=2$/);
    assert.equal(t.mock.state.checkouts, before + 1);
    assert.equal((await t.api("GET", `/api/orders/${ref}`)).json.status, "AWAITING_PAYMENT");
    // retry de pedido que não falhou → 409
    assert.equal((await t.api("POST", `/api/orders/${ref}/retry`)).status, 409);
    // webhook cujo pedido PagBank não referencia nenhum pedido nosso
    t.mock.state.orders["ORDE_99999999-ZZZZ"] = pbOrder("outra-referencia-qualquer", "PAID", 179980, "ORDE_99999999-ZZZZ");
    const x = await hook(t, pbOrder("outra-referencia-qualquer", "PAID", 179980, "ORDE_99999999-ZZZZ"));
    assert.equal(x.json.status, "unknown_order");
    // cancelado
    const o2 = await newOrder(t, [{ productId: "stealth-tf", size: 40, quantity: 1 }]);
    t.mock.state.orders["ORDE_33333333-CCCC"] = pbOrder(o2.publicId, "CANCELED", 55990, "ORDE_33333333-CCCC");
    await hook(t, pbOrder(o2.publicId, "CANCELED", 55990, "ORDE_33333333-CCCC"));
    assert.equal((await t.api("GET", `/api/orders/${o2.publicId}`)).json.status, "CANCELED");
  } finally { t.close(); }
});

test("falha ao criar checkout: pedido em ERROR, mesma chave tenta de novo sem duplicar; PagBank fora do ar no webhook → 503", async () => {
  const t = await setup();
  try {
    t.mock.state.failCreate = true;
    const k = key(); const body = { items: [{ productId: "velocity-fg", size: 40, quantity: 1 }], idempotencyKey: k };
    const r = await t.api("POST", "/api/orders", body);
    assert.equal(r.status, 502); assert.ok(!JSON.stringify(r.json).includes(TOKEN));
    assert.equal(t.db.prepare("SELECT COUNT(*) c FROM orders").get().c, 1);
    t.mock.state.failCreate = false;
    const r2 = await t.api("POST", "/api/orders", body);
    assert.equal(r2.status, 201); assert.equal(t.db.prepare("SELECT COUNT(*) c FROM orders").get().c, 1);
    // PagBank indisponível ao verificar webhook → 503 (PagBank reenvia), sem marcar nada
    const ref = r2.json.publicId;
    t.mock.server.close();
    const h = await hook(t, pbOrder(ref, "PAID", 89990));
    assert.equal(h.status, 503);
    assert.equal((await t.api("GET", `/api/orders/${ref}`)).json.status, "AWAITING_PAYMENT");
  } finally { t.close(); }
});

test("feedback: valida, grava, antispam e sem leitura pública", async () => {
  const t = await setup();
  try {
    const ok = { rating: 5, comment: "Atendimento excelente!", name: "Thiago", email: "t@exemplo.com", elapsedMs: 8000 };
    assert.equal((await t.api("POST", "/api/feedback", ok)).status, 201);
    const row = t.db.prepare("SELECT * FROM feedback").get();
    assert.equal(row.rating, 5); assert.equal(row.name, "Thiago"); assert.ok(row.created_at);
    assert.equal((await t.api("POST", "/api/feedback", { ...ok, rating: 6 })).status, 400);
    assert.equal((await t.api("POST", "/api/feedback", { ...ok, rating: 0 })).status, 400);
    assert.equal((await t.api("POST", "/api/feedback", { ...ok, comment: "ok" })).status, 400);
    assert.equal((await t.api("POST", "/api/feedback", { ...ok, email: "invalido" })).status, 400);
    assert.equal((await t.api("POST", "/api/feedback", { rating: 4, comment: "Sem nome nem e-mail ok" })).status, 201);
    // honeypot: finge sucesso mas não grava
    const n = t.db.prepare("SELECT COUNT(*) c FROM feedback").get().c;
    assert.equal((await t.api("POST", "/api/feedback", { ...ok, comment: "bot bot bot", website: "http://spam" })).status, 201);
    assert.equal(t.db.prepare("SELECT COUNT(*) c FROM feedback").get().c, n);
    assert.equal((await t.api("POST", "/api/feedback", { ...ok, comment: "rapido demais", elapsedMs: 100 })).status, 429);
    // duplicado não grava de novo
    await t.api("POST", "/api/feedback", ok);
    assert.equal(t.db.prepare("SELECT COUNT(*) c FROM feedback").get().c, n);
    // limite por IP (5/h): já fizemos várias requisições válidas → eventualmente 429
    let last; for (let i = 0; i < 6; i++) last = await t.api("POST", "/api/feedback", { ...ok, comment: `comentario ${i} longo` });
    assert.equal(last.status, 429);
    // visitante não lê avaliações
    assert.equal((await t.api("GET", "/api/admin/feedback")).status, 401);
    assert.equal((await t.api("GET", "/api/feedback")).status, 404);
  } finally { t.close(); }
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
    assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Strict/);
    const cookie = { cookie: setCookie.split(";")[0] };
    const png = "data:image/png;base64," + Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), Buffer.alloc(32)]).toString("base64");
    const created = await t.api("POST", "/api/admin/products", { name: "Nova Chuteira", category: "Campo", price: 500, sizes: [40, 41], imageData: png }, cookie);
    assert.equal(created.status, 201, JSON.stringify(created.json));
    assert.match(created.json.image, /^\/uploads\/[0-9a-f]{24}\.png$/);
    assert.equal(created.json.id, "nova-chuteira");
    // falso PNG (texto) é recusado; CSRF por origem é bloqueado; URL http é recusada
    assert.equal((await t.api("POST", "/api/admin/products", { name: "X", category: "Campo", price: 5, sizes: [40], imageData: "data:image/png;base64," + Buffer.from("<script>").toString("base64") }, cookie)).status, 422);
    assert.equal((await t.api("POST", "/api/admin/products", { name: "X", category: "Campo", price: 5, sizes: [40], image: "/a.png" }, { ...cookie, origin: "http://evil.com" })).status, 403);
    assert.equal((await t.api("POST", "/api/admin/products", { name: "X", category: "Campo", price: 5, sizes: [40], image: "http://x.com/a.png" }, cookie)).status, 422);
    // editar preço/tamanhos → catálogo público e pedido usam o valor novo
    const upd = await t.api("PUT", "/api/admin/products/nova-chuteira", { name: "Nova Chuteira", category: "Campo", price: 650.5, sizes: [39, 40], image: created.json.image }, cookie);
    assert.equal(upd.json.price, 650.5); assert.deepEqual(upd.json.sizes, [39, 40]);
    const list = (await t.api("GET", "/api/products")).json.products;
    assert.equal(list.find((p) => p.id === "nova-chuteira").price, 650.5);
    await t.api("POST", "/api/orders", { items: [{ productId: "nova-chuteira", size: 39, quantity: 1 }], idempotencyKey: key() });
    assert.equal(t.mock.state.lastBody.items[0].unit_amount, 65050);
    assert.equal((await t.api("POST", "/api/orders", { items: [{ productId: "nova-chuteira", size: 41, quantity: 1 }], idempotencyKey: key() })).status, 422);
    // remover
    assert.equal((await t.api("DELETE", "/api/admin/products/nova-chuteira", undefined, cookie)).status, 200);
    assert.equal((await t.api("GET", "/api/products")).json.products.some((p) => p.id === "nova-chuteira"), false);
    assert.equal((await t.api("GET", "/api/admin/orders", undefined, cookie)).status, 200);
    // cookie adulterado
    assert.equal((await t.api("GET", "/api/admin/orders", undefined, { cookie: cookie.cookie.slice(0, -3) + "abc" })).status, 401);
  } finally { t.close(); }
});

test("sem PAGBANK_TOKEN o checkout fica desativado (sem simulação)", async () => {
  const t = await setup({ PAGBANK_TOKEN: "" });
  try {
    const t2 = t; // pagbank client do setup ainda tem token; reconstrói app sem token
    const config = loadConfig({ PAGBANK_TOKEN: "", ADMIN_PASSWORD: "x" });
    const db = openDb(":memory:");
    const app = createApp({ db, config, pagbank: createPagBankClient({ token: "", baseUrl: "http://127.0.0.1:1" }), log: quiet });
    const s = await new Promise((r) => { const x = app.listen(0, "127.0.0.1", () => r(x)); });
    const res = await fetch(`http://127.0.0.1:${s.address().port}/api/orders`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [{ productId: "velocity-fg", size: 40, quantity: 1 }], idempotencyKey: key() }) });
    assert.equal(res.status, 503); s.close(); void t2;
  } finally { t.close(); }
});
