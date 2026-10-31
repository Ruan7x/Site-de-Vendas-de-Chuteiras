import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { type Product } from "@/lib/products";
import { useProducts } from "@/lib/products-store";

export type CartLine = { id: string; size: number; qty: number };

type CartContextValue = {
  lines: CartLine[];
  add: (productId: string, size: number) => void;
  remove: (productId: string, size: number) => void;
  clear: () => void;
  count: number;
  total: number;
  detailed: { product: Product; size: number; qty: number }[];
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "tn-sports-cart";

const isLine = (v: unknown): v is CartLine =>
  !!v &&
  typeof v === "object" &&
  typeof (v as CartLine).id === "string" &&
  Number.isInteger((v as CartLine).size) &&
  Number.isInteger((v as CartLine).qty) &&
  (v as CartLine).qty > 0;

function readSaved(): CartLine[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isLine) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { products } = useProducts();
  // Lê a sacola salva já no primeiro render. Antes ela era lida num efeito, depois de o efeito de
  // salvar ter gravado a sacola vazia, e recarregar a página (ou o modo dev do React) a apagava.
  const [lines, setLines] = useState<CartLine[]>(readSaved);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* ignore */
    }
  }, [lines]);

  // Mantém a sacola igual entre abas abertas do site (ex.: a aba do pedido e outra do catálogo).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setLines(readSaved());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const detailed = lines
      .map((line) => {
        const product = products.find((p) => p.id === line.id);
        return product ? { product, size: line.size, qty: line.qty } : null;
      })
      .filter((v): v is { product: Product; size: number; qty: number } => v !== null);

    return {
      lines,
      detailed,
      count: lines.reduce((sum, l) => sum + l.qty, 0),
      total: detailed.reduce((sum, l) => sum + l.product.price * l.qty, 0),
      add: (productId, size) =>
        setLines((prev) => {
          const existing = prev.find((l) => l.id === productId && l.size === size);
          if (existing) {
            return prev.map((l) =>
              l === existing ? { ...l, qty: l.qty + 1 } : l,
            );
          }
          return [...prev, { id: productId, size, qty: 1 }];
        }),
      clear: () => setLines((prev) => (prev.length ? [] : prev)),
      remove: (productId, size) =>
        setLines((prev) =>
          prev
            .map((l) =>
              l.id === productId && l.size === size ? { ...l, qty: l.qty - 1 } : l,
            )
            .filter((l) => l.qty > 0),
        ),
    };
  }, [lines, products]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
