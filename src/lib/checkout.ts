import { api } from "@/lib/api";

export type CheckoutResult = { publicId: string; status: string; payUrl: string | null };
type Line = { id: string; size: number; qty: number };

const KEY = "tn-sports-checkout";

function randomKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Cria o pedido no servidor a partir do carrinho existente. Enviamos apenas produto/tamanho/quantidade:
 * preços e total são SEMPRE recalculados no servidor. A chave de idempotência evita pedidos duplicados
 * (duplo clique, recarregar a página, voltar do Mercado Pago e clicar de novo com o mesmo carrinho).
 */
export async function startCheckout(lines: Line[]): Promise<CheckoutResult> {
  const items = lines.map((l) => ({ productId: l.id, size: l.size, quantity: l.qty }));
  const sig = JSON.stringify([...items].sort((a, b) => `${a.productId}${a.size}`.localeCompare(`${b.productId}${b.size}`)));
  let key = "";
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || "null") as { sig: string; key: string } | null;
    if (saved?.sig === sig) key = saved.key;
  } catch {
    /* ignore */
  }
  if (!key) {
    key = randomKey();
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ sig, key }));
    } catch {
      /* ignore */
    }
  }
  return api<CheckoutResult>("/api/orders", { method: "POST", json: { items, idempotencyKey: key } });
}

export const forgetCheckoutKey = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};
