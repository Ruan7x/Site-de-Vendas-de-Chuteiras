import crypto from "node:crypto";

/** Limitador em memória (janela deslizante). Suficiente para uma instância única. */
export function createRateLimiter({ windowMs, max, key = (req) => req.ip }) {
  const hits = new Map();
  /** Registra uma tentativa. Retorna 0 se permitido, ou os segundos até poder tentar de novo. */
  function consume(k) {
    const now = Date.now();
    const recent = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) return Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000));
    recent.push(now);
    hits.set(k, recent);
    if (hits.size > 5000) {
      for (const [kk, arr] of hits) if (!arr.some((t) => now - t < windowMs)) hits.delete(kk);
    }
    return 0;
  }
  function rateLimit(req, res, next) {
    const wait = consume(key(req));
    if (wait) {
      res.set("Retry-After", String(wait));
      return res.status(429).json({
        error: "rate_limited",
        message: "Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.",
      });
    }
    next();
  }
  rateLimit.consume = consume;
  return rateLimit;
}

export const sha256Hex = (s) => crypto.createHash("sha256").update(s).digest("hex");

export function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function signSession(secret, ttlMs) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + ttlMs })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySession(secret, token) {
  if (typeof token !== "string") return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now();
  } catch {
    return false;
  }
}

export function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export const newPublicId = () => crypto.randomBytes(18).toString("base64url"); // 24 chars, 144 bits
export const PUBLIC_ID_RE = /^[A-Za-z0-9_-]{24}$/;
