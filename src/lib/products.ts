
export type Category = "Campo" | "Society";

export type Product = {
  id: string;
  name: string;
  line: string;
  category: Category;
  price: number;
  oldPrice?: number;
  image: string;
  colorway: string;
  tag?: string;
  description: string;
  sizes: number[];
};

export const categories: Category[] = ["Campo", "Society"];

export const formatPrice = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
