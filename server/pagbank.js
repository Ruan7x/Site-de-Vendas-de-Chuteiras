import crypto from "node:crypto";

export class PagBankError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "PagBankError";
    this.status = status;
    this.body = body;
  }
}

// Só IDs com este formato podem ser usados em caminhos de URL da API (evita path injection
// a partir de payloads de webhook não confiáveis).
export const PB_ID_RE = {
  checkout: /^CHEC_[A-Za-z0-9-]{8,64}$/,
  order: /^ORDE_[A-Za-z0-9-]{8,64}$/,
  charge: /^CHAR_[A-Za-z0-9-]{8,64}$/,
};

/**
 * Autenticidade do webhook (doc oficial): header `x-authenticity-token` =
 * SHA-256 hex de "{token}-{corpo bruto da requisição}".
 */
export function verifyAuthenticity(rawBody, header, token) {
  if (!header || !token) return false;
  const expected = crypto.createHash("sha256").update(`${token}-${rawBody}`).digest("hex");
  const a = Buffer.from(String(header).toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createPagBankClient({ token, baseUrl, fetchImpl = fetch, timeoutMs = 15000 }) {
  async function request(method, path, body) {
    let res;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new PagBankError(`Falha de comunicação com o PagBank (${err.name})`, { status: 0 });
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* resposta não-JSON */
    }
    if (!res.ok) {
      const detail = json?.error_messages?.map((e) => `${e.code}:${e.parameter_name ?? ""}`).join(",");
      throw new PagBankError(`PagBank respondeu ${res.status}${detail ? ` (${detail})` : ""}`, {
        status: res.status,
        body: json,
      });
    }
    return json;
  }

  const enc = encodeURIComponent;
  return {
    configured: Boolean(token),
    createCheckout: (payload) => request("POST", "/checkouts", payload),
    getCheckout: (id) => request("GET", `/checkouts/${enc(id)}`),
    inactivateCheckout: (id) => request("POST", `/checkouts/${enc(id)}/inactivate`),
    getOrder: (id) => request("GET", `/orders/${enc(id)}`),
  };
}
