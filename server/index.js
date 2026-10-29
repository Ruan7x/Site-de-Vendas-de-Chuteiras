import { loadConfig, loadDotEnv } from "./config.js";
loadDotEnv();
import { openDb } from "./db.js";
import { createApp } from "./app.js";
import { createPagBankClient } from "./pagbank.js";

const config = loadConfig();
const db = openDb(config.dbPath);
const pagbank = createPagBankClient({ token: config.pagbankToken, baseUrl: config.pagbankBaseUrl });
const app = createApp({ db, config, pagbank });

app.listen(config.port, () => {
  console.log(`TN Sports API em http://localhost:${config.port} (PagBank: ${config.pagbankEnv})`);
  const warn = (m) => console.warn(`${m}`);
  if (!config.pagbankToken) warn("PAGBANK_TOKEN não definido — o checkout está desativado.");
  if (!config.adminPassword) warn("ADMIN_PASSWORD não definido — o painel /admin está desativado.");
  if (!/^55\d{10,11}$/.test(config.whatsappNumber)) warn("WHATSAPP_NUMBER ausente/inválido (formato 55DDDNUMERO) — o botão de WhatsApp não será liberado.");
  if (config.sessionSecretIsEphemeral) warn("SESSION_SECRET não definido — sessões do admin expiram a cada reinício.");
  if (/localhost|127\.0\.0\.1/.test(config.webhookBaseUrl))
    warn("WEBHOOK_BASE_URL aponta para localhost: o PagBank NÃO consegue entregar webhooks. Use um túnel https (ex.: ngrok) em desenvolvimento.");
});
