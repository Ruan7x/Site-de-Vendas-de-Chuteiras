import boot1 from "@/assets/boot-1.jpg";
import boot2 from "@/assets/boot-2.jpg";
import boot3 from "@/assets/boot-3.jpg";
import boot5 from "@/assets/boot-5.jpg";
import boot6 from "@/assets/boot-6.jpg";

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

export const products: Product[] = [
  {
    id: "velocity-fg",
    name: "Velocity FG",
    line: "Speed",
    category: "Campo",
    price: 899.9,
    oldPrice: 1099.9,
    image: boot1,
    colorway: "Branco / Laranja Flame",
    tag: "Novo",
    description:
      "Cabedal ultraleve com travas cônicas para arranques explosivos em grama natural.",
    sizes: [37, 38, 39, 40, 41, 42, 43, 44],
  },
  {
    id: "legado-pro",
    name: "Legado Pro",
    line: "Touch",
    category: "Campo",
    price: 1249.9,
    image: boot2,
    colorway: "Preto / Ouro",
    tag: "Couro premium",
    description:
      "Couro macio de toque premium, costura interna e ajuste anatômico para quem manda no jogo.",
    sizes: [38, 39, 40, 41, 42, 43, 44],
  },
  {
    id: "vortex-knit",
    name: "Vortex Knit",
    line: "Control",
    category: "Campo",
    price: 749.9,
    oldPrice: 899.9,
    image: boot3,
    colorway: "Azul / Volt",
    description:
      "Colarinho tricotado com textura de controle na área de contato para passes precisos.",
    sizes: [37, 38, 39, 40, 41, 42, 43],
  },
  {
    id: "aero-elite",
    name: "Aero Elite",
    line: "Speed",
    category: "Campo",
    price: 1399.9,
    image: boot5,
    colorway: "Prata / Turquesa",
    tag: "Edição limitada",
    description:
      "A chuteira mais leve da linha TN: 178 g de pura velocidade com placa em fibra.",
    sizes: [38, 39, 40, 41, 42, 43],
  },
  {
    id: "stealth-tf",
    name: "Stealth TF",
    line: "Grip",
    category: "Society",
    price: 559.9,
    oldPrice: 649.9,
    image: boot6,
    colorway: "Preto Total",
    description:
      "Travas multidirecionais para grama sintética, com amortecimento reforçado no calcâneo.",
    sizes: [37, 38, 39, 40, 41, 42, 43, 44],
  },
];

export const categories: Category[] = ["Campo", "Society"];

export const formatPrice = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
