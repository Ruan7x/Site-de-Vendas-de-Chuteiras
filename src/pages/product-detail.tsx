import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, Truck, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/product-card";
import { useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/products";
import { useProducts } from "@/lib/products-store";

export default function ProductDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { products } = useProducts();
  const product = products.find((p) => p.id === id);
  const { add } = useCart();
  const [size, setSize] = useState<number | null>(null);

  if (!product) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6">
        <h1 className="text-3xl">Produto não encontrado</h1>
        <Link to="/produtos" className="mt-4 inline-block text-primary hover:underline">
          Voltar ao catálogo
        </Link>
      </div>
    );
  }

  const related = products.filter((p) => p.id !== product.id).slice(0, 3);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <nav className="eyebrow text-muted-foreground">
        <Link to="/" className="hover:text-primary">
          Home
        </Link>{" "}
        /{" "}
        <Link to="/produtos" className="hover:text-primary">
          Chuteiras
        </Link>{" "}
        / <span className="text-foreground">{product.name}</span>
      </nav>

      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <div className="border border-border bg-secondary">
          <img
            src={product.image}
            alt={`Chuteira ${product.name} ${product.colorway}`}
            width={900}
            height={900}
            className="aspect-square w-full object-cover"
          />
        </div>

        <div>
          <p className="eyebrow text-primary">
            {product.category} · Linha {product.line}
          </p>
          <h1 className="mt-3 text-4xl sm:text-5xl">{product.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{product.colorway}</p>

          <div className="mt-6 flex items-baseline gap-3">
            <span className="font-display text-3xl text-primary">
              {formatPrice(product.price)}
            </span>
            {product.oldPrice && (
              <span className="text-sm text-muted-foreground line-through">
                {formatPrice(product.oldPrice)}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            ou 12x de {formatPrice(product.price / 12)} sem juros
          </p>

          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            {product.description}
          </p>

          <div className="mt-8">
            <p className="eyebrow text-muted-foreground">Tamanho (BR)</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {product.sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  className={`h-11 w-12 border font-display transition-colors ${
                    size === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-foreground hover:border-primary"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              variant="volt"
              size="xl"
              onClick={() => {
                if (!size) {
                  toast.error("Selecione um tamanho antes de adicionar.");
                  return;
                }
                add(product.id, size);
                toast.success(`${product.name} (tam. ${size}) na sacola!`);
              }}
            >
              Adicionar à sacola
            </Button>
            <Button asChild variant="onDark" size="xl">
              <Link to="/produtos">Continuar comprando</Link>
            </Button>
          </div>

          <ul className="mt-8 space-y-3 border-t border-border pt-6 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Truck className="size-4 text-primary" /> Frete grátis acima de R$ 499
            </li>
            <li className="flex items-center gap-2">
              <RefreshCcw className="size-4 text-primary" /> 30 dias para troca de tamanho
            </li>
            <li className="flex items-center gap-2">
              <Check className="size-4 text-primary" /> Produto original com garantia
            </li>
          </ul>
        </div>
      </div>

      <section className="mt-20">
        <h2 className="text-3xl">Você também vai gostar</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {related.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
