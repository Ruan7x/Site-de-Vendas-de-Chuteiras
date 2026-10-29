import crypto from "node:crypto";

export class MercadoPagoError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "MercadoPagoError";
    this.status = status;
    this.body = body;
  }
}

/** IDs de pagamento do Mercado Pago são numéricos; só eles entram em caminhos de URL da API. */
export const PAYMENT_ID_RE = /^\d{3,20}$/;

/**
 * Valida o header `x-signature` ("ts=...,v1=..."). O manifesto assinado é
 * `id:{data.id};request-id:{x-request-id};ts:{ts};` (partes ausentes são omitidas) e o
 * v1 é o HMAC-SHA256 em hexadecimal desse texto, usando a "assinatura secreta" do app.
 * Aceita data.id como veio ou em minúsculas (a documentação pede minúsculas para ids alfanuméricos).
 */
export function verifySignature({ signature, requestId, dataId, secret }) {
  if (!signature || !secret) return false;
  const parts = Object.fromEntries(
    String(signature)
      .split(",")
      .map((p) => p.trim().split("=", 2))
      .filter((kv) => kv.length === 2),
  );
  if (!parts.ts || !parts.v1) return false;
  const given = Buffer.from(String(parts.v1).toLowerCase());
  const candidates = new Set([dataId ?? "", String(dataId ?? "").toLowerCase()]);
  for (const id of candidates) {
    let manifest = "";
    if (id) manifest += `id:${id};`;
    if (requestId) manifest += `request-id:${requestId};`;
    manifest += `ts:${parts.ts};`;
    const expected = Buffer.from(crypto.createHmac("sha256", secret).update(manifest).digest("hex"));
    if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) return true;
  }
  return false;
}

export function createMercadoPagoClient({ accessToken, baseUrl, fetchImpl = fetch, timeoutMs = 15000 }) {
  async function request(method, path, body) {
    let res;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new MercadoPagoError(`Falha de comunicação com o Mercado Pago (${err.name})`, { status: 0 });
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* resposta não-JSON */
    }
    if (!res.ok) {
      const detail = json?.message || json?.error;
      throw new MercadoPagoError(`Mercado Pago respondeu ${res.status}${detail ? ` (${detail})` : ""}`, {
        status: res.status,
        body: json,
      });
    }
    return json;
  }

  return {
    configured: Boolean(accessToken),
    createPreference: (payload) => request("POST", "/checkout/preferences", payload),
    getPayment: (id) => request("GET", `/v1/payments/${encodeURIComponent(id)}`),
    searchPayments: (externalReference) =>
      request(
        "GET",
        `/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}&sort=date_created&criteria=desc&limit=30`,
      ),
  };
}
