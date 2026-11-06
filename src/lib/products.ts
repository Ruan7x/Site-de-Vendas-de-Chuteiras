
export type Category = "Campo" | "Society";

export type ProductColor = { name: string; image: string };

export type Product = {
  id: string;
  name: string;
  line: string;
  category: Category;
  price: number;
  oldPrice?: number;
  image: string;
  colorway: string;
  /** Cores que o cliente pode escolher; cada uma com a sua foto (ou a foto principal). */
  colors: ProductColor[];
  tag?: string;
  description: string;
  sizes: number[];
};

export const categories: Category[] = ["Campo", "Society"];

export const formatPrice = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
