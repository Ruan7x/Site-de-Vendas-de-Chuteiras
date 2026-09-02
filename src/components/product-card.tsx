import { Link } from "react-router-dom";
import { formatPrice, type Product } from "@/lib/products";

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      to={`/produtos/${product.id}`}
      className="group block border border-border bg-surface transition-colors hover:border-primary"
    >
      <div className="relative overflow-hidden bg-secondary">
        {product.tag && (
          <span className="skew-tag absolute left-3 top-3 z-10 bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
            {product.tag}
          </span>
        )}
        <img
          src={product.image}
          alt={`Chuteira ${product.name} na cor ${product.colorway}`}
          loading="lazy"
          width={900}
          height={900}
          className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
      <div className="space-y-1 p-4">
        <p className="eyebrow text-muted-foreground">
          {product.category} · {product.line}
        </p>
        <h3 className="font-display text-lg">{product.name}</h3>
        <p className="text-xs text-muted-foreground">{product.colorway}</p>
        <div className="flex items-baseline gap-2 pt-1">
          <span className="font-display text-lg text-primary">{formatPrice(product.price)}</span>
          {product.oldPrice && (
            <span className="text-xs text-muted-foreground line-through">
              {formatPrice(product.oldPrice)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
