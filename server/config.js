import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Carrega o .env (se existir) sem sobrescrever variáveis já definidas. */
export function loadDotEnv(file = path.join(ROOT, ".env"), target = process.env) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || m[1] in target) continue;
    // Valor entre aspas: usa o conteúdo das aspas (pode ter "#"). Sem aspas: " # ..." no fim é comentário.
    const quoted = m[2].match(/^(["'])(.*?)\1(?:\s+#.*)?$/);
    target[m[1]] = quoted ? quoted[2] : m[2].replace(/\s+#.*$/, "");
  }
}

const strip = (s) => (s || "").replace(/\/+$/, "");
const isPublicHttps = (u) => /^https:\/\//.test(u) && !/^https:\/\/(localhost|127\.|\[::1\])/.test(u);

export function loadConfig(env = process.env) {
  const publicUrl = strip(env.PUBLIC_URL || "http://localhost:5173");

  return {
    port: Number(env.PORT || 3001),
    publicUrl,
    // URL que o Mercado Pago consegue acessar (https e não-localhost; em dev use um túnel).
    webhookBaseUrl: strip(env.WEBHOOK_BASE_URL || publicUrl),
    mpEnv: env.MP_ENV === "production" ? "production" : "sandbox",
    mpAccessToken: env.MP_ACCESS_TOKEN || "",
    mpBaseUrl: strip(env.MP_BASE_URL || "https://api.mercadopago.com"),
    mpWebhookSecret: env.MP_WEBHOOK_SECRET || "",
    requireSignature: env.MP_REQUIRE_SIGNATURE !== "false",
    payHostAllowlist: (env.MP_PAY_HOSTS || "").split(",").map((s) => s.trim()).filter(Boolean),
    whatsappNumber: (env.WHATSAPP_NUMBER || "").replace(/\D/g, ""),
    adminPassword: env.ADMIN_PASSWORD || "",
    sessionSecret: env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    sessionSecretIsEphemeral: !env.SESSION_SECRET,
    dbPath: env.DATABASE_PATH || path.join(ROOT, "data", "tn-sports.db"),
    uploadsDir: env.UPLOADS_DIR || path.join(ROOT, "data", "uploads"),
    // Fotos enviadas pelos clientes no feedback: fora de /uploads (que é público); só o admin lê.
    feedbackDir: env.FEEDBACK_UPLOADS_DIR || path.join(ROOT, "data", "feedback-uploads"),
    distDir: path.join(ROOT, "dist"),
    trustProxy: env.TRUST_PROXY ? (/^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY) : false,
    secureCookies: publicUrl.startsWith("https://"),
    publicHttps: isPublicHttps(publicUrl),
    webhookReachable: isPublicHttps(strip(env.WEBHOOK_BASE_URL || publicUrl)),
  };
}
