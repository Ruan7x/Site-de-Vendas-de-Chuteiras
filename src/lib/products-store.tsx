import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { products as seedProducts, type Product } from "@/lib/products";

const STORAGE_KEY = "tn-sports-products";

type ProductInput = Omit<Product, "id"> & { id?: string };

type ProductsContextValue = {
  products: Product[];
  addProduct: (data: ProductInput) => Product;
  updateProduct: (id: string, data: ProductInput) => void;
  removeProduct: (id: string) => void;
  resetToDefaults: () => void;
};

const ProductsContext = createContext<ProductsContextValue | null>(null);

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function loadInitial(): Product[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Product[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* ignore corrupted storage */
  }
  return seedProducts;
}

export function ProductsProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Product[]>(() => loadInitial());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      /* storage full or unavailable - ignore */
    }
  }, [list]);

  const value = useMemo<ProductsContextValue>(
    () => ({
      products: list,
      addProduct: (data) => {
        const base = data.id?.trim() ? slugify(data.id) : slugify(data.name);
        let id = base || `chuteira-${Date.now()}`;
        setList((prev) => {
          let unique = id;
          let n = 2;
          while (prev.some((p) => p.id === unique)) {
            unique = `${id}-${n}`;
            n += 1;
          }
          id = unique;
          const newProduct: Product = { ...data, id: unique };
          return [...prev, newProduct];
        });
        return { ...data, id };
      },
      updateProduct: (id, data) => {
        setList((prev) => prev.map((p) => (p.id === id ? { ...data, id } : p)));
      },
      removeProduct: (id) => {
        setList((prev) => prev.filter((p) => p.id !== id));
      },
      resetToDefaults: () => {
        setList(seedProducts);
      },
    }),
    [list],
  );

  return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>;
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error("useProducts must be used inside ProductsProvider");
  return ctx;
}
