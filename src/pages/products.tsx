import { Link, useSearchParams } from "react-router-dom";
import { ProductCard } from "@/components/product-card";
import { categories, type Category } from "@/lib/products";
import { useProducts } from "@/lib/products-store";

export default function Products() {
  const { products, loading, error } = useProducts();
  const [searchParams] = useSearchParams();
  const raw = searchParams.get("cat");
  const cat = categories.includes(raw as Category) ? (raw as Category) : undefined;
  const list = cat ? products.filter((p) => p.category === cat) : products;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <p className="eyebrow text-primary">Catálogo</p>
      <h1 className="mt-3 text-4xl sm:text-5xl">
        {cat ? `Chuteiras ${cat}` : "Todas as chuteiras"}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {list.length} {list.length === 1 ? "modelo" : "modelos"} disponíveis
      </p>
      {loading && <p className="mt-2 text-sm text-muted-foreground">Carregando catálogo…</p>}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-8 flex flex-wrap gap-2">
        <Link
          to="/produtos"
          className={`eyebrow border px-4 py-2 transition-colors ${
            cat
              ? "border-border text-muted-foreground hover:border-primary"
              : "border-primary bg-primary text-primary-foreground"
          }`}
        >
          Todas
        </Link>
        {categories.map((c) => (
          <Link
            key={c}
            to={`/produtos?cat=${encodeURIComponent(c)}`}
            className={`eyebrow border px-4 py-2 transition-colors ${
              cat === c
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary"
            }`}
          >
            {c}
          </Link>
        ))}
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
