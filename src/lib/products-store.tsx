import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Product } from "@/lib/products";

/** Dados enviados ao painel admin. `imageData` = upload (data URL); `image` = URL/caminho existente. */
export type ProductInput = Omit<Product, "id" | "image" | "oldPrice" | "tag"> & {
  oldPrice?: number | null;
  tag?: string | null;
  image?: string;
  imageData?: string;
};

type ProductsContextValue = {
  products: Product[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addProduct: (data: ProductInput) => Promise<void>;
  updateProduct: (id: string, data: ProductInput) => Promise<void>;
  removeProduct: (id: string) => Promise<void>;
};

const ProductsContext = createContext<ProductsContextValue | null>(null);

/** O catálogo vem do servidor (única fonte de verdade — é ele que valida preços no checkout). */
export function ProductsProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ products: Product[] }>("/api/products");
      setProducts(data.products);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar produtos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<ProductsContextValue>(
    () => ({
      products,
      loading,
      error,
      refresh,
      addProduct: async (data) => {
        await api("/api/admin/products", { method: "POST", json: data });
        await refresh();
      },
      updateProduct: async (id, data) => {
        await api(`/api/admin/products/${encodeURIComponent(id)}`, { method: "PUT", json: data });
        await refresh();
      },
      removeProduct: async (id) => {
        await api(`/api/admin/products/${encodeURIComponent(id)}`, { method: "DELETE" });
        await refresh();
      },
    }),
    [products, loading, error, refresh],
  );

  return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>;
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error("useProducts must be used inside ProductsProvider");
  return ctx;
}
