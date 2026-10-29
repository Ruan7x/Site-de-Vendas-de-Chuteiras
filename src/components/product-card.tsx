import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { formatPrice, type Product } from "@/lib/products";

export function ProductCard({ product }: { product: Product }) {
  const discount = product.oldPrice ? Math.round((1 - product.price / product.oldPrice) * 100) : 0;
  const sizes = product.sizes.length ? `${Math.min(...product.sizes)}–${Math.max(...product.sizes)}` : "";

  return (
    <Link
      to={`/produtos/${product.id}`}
      className="group flex h-full flex-col border border-border bg-surface transition-all duration-300 hover:-translate-y-1 hover:border-primary hover:shadow-volt"
    >
      <div className="relative overflow-hidden bg-secondary">
        {product.tag && (
          <span className="skew-tag absolute left-3 top-3 z-10 bg-primary px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary-foreground">
            {product.tag}
          </span>
        )}
        {discount > 0 && (
          <span className="absolute right-3 top-3 z-10 bg-background px-2 py-1 font-display text-sm text-primary">
            -{discount}%
          </span>
        )}
        <img
          src={product.image}
          alt={`Chuteira ${product.name} na cor ${product.colorway}`}
          loading="lazy"
          width={900}
          height={900}
          className="aspect-square w-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {product.category} · {product.line}
        </p>
        <h3 className="mt-2 font-display text-2xl">{product.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {product.colorway}
          {sizes && ` · Tam. ${sizes}`}
        </p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-2xl text-primary">{formatPrice(product.price)}</span>
            {product.oldPrice && (
              <span className="text-sm text-muted-foreground line-through">
                {formatPrice(product.oldPrice)}
              </span>
            )}
          </div>
          <span className="flex size-9 shrink-0 items-center justify-center bg-secondary text-foreground transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
