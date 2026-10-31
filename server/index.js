import { loadConfig, loadDotEnv } from "./config.js";
loadDotEnv();
import { openDb } from "./db.js";
import { createApp } from "./app.js";
import { createMercadoPagoClient } from "./mercadopago.js";

const config = loadConfig();
const db = openDb(config.dbPath);
const mp = createMercadoPagoClient({ accessToken: config.mpAccessToken, baseUrl: config.mpBaseUrl });
const app = createApp({ db, config, mp });

// Confere os pedidos pendentes a cada minuto (funciona mesmo sem webhook configurado).
if (mp.configured) {
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await app.locals.orders.reconcilePending();
    } finally {
      running = false;
    }
  }, 60_000).unref();
}

app.listen(config.port, () => {
  console.log(`TN Sports API em http://localhost:${config.port} (Mercado Pago: ${config.mpEnv})`);
  const warn = (m) => console.warn(`${m}`);
  if (!config.mpAccessToken) warn("MP_ACCESS_TOKEN não definido — o checkout está desativado.");
  if (config.mpAccessToken && !config.mpWebhookSecret && config.requireSignature)
    warn("MP_WEBHOOK_SECRET não definido — webhooks serão recusados. O status do pedido ainda é confirmado pela página /pedido.");
  if (!config.adminPassword) warn("ADMIN_PASSWORD não definido — o painel /admin está desativado.");
  if (!/^55\d{10,11}$/.test(config.whatsappNumber)) warn("WHATSAPP_NUMBER ausente/inválido (formato 55DDDNUMERO) — o botão de WhatsApp não será liberado.");
  if (config.sessionSecretIsEphemeral) warn("SESSION_SECRET não definido — sessões do admin expiram a cada reinício.");
  if (!config.webhookReachable)
    warn("WEBHOOK_BASE_URL não é uma URL https pública: o Mercado Pago não enviará notificações. O pedido ainda é confirmado ao consultar /pedido. Em desenvolvimento use um túnel (ex.: ngrok).");
});
