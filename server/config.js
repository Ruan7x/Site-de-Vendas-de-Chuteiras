import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Carrega .env (se existir) sem sobrescrever variáveis já definidas. */
export function loadDotEnv(file = path.join(ROOT, ".env")) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || m[1] in process.env) continue;
    let v = m[2];
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const strip = (s) => (s || "").replace(/\/+$/, "");

export function loadConfig(env = process.env) {
  const port = Number(env.PORT || 3001);
  const publicUrl = strip(env.PUBLIC_URL || "http://localhost:5173");
  const pagbankEnv = env.PAGBANK_ENV === "production" ? "production" : "sandbox";
  const defaultBase =
    pagbankEnv === "production" ? "https://api.pagseguro.com" : "https://sandbox.api.pagseguro.com";

  return {
    port,
    publicUrl,
    // URL que o PagBank consegue acessar (precisa ser pública; em dev use um túnel https).
    webhookBaseUrl: strip(env.WEBHOOK_BASE_URL || publicUrl),
    pagbankEnv,
    pagbankToken: env.PAGBANK_TOKEN || "",
    pagbankBaseUrl: strip(env.PAGBANK_BASE_URL || defaultBase),
    requireSignature: env.PAGBANK_REQUIRE_SIGNATURE !== "false",
    interestFreeInstallments: env.PAGBANK_INTEREST_FREE_INSTALLMENTS || "",
    payHostAllowlist: (env.PAGBANK_PAY_HOSTS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    whatsappNumber: (env.WHATSAPP_NUMBER || "").replace(/\D/g, ""),
    adminPassword: env.ADMIN_PASSWORD || "",
    sessionSecret: env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    sessionSecretIsEphemeral: !env.SESSION_SECRET,
    dbPath: env.DATABASE_PATH || path.join(ROOT, "data", "tn-sports.db"),
    uploadsDir: env.UPLOADS_DIR || path.join(ROOT, "data", "uploads"),
    distDir: path.join(ROOT, "dist"),
    trustProxy: env.TRUST_PROXY ? (/^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY) : false,
    secureCookies: publicUrl.startsWith("https://"),
  };
}
