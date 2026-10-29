import { Link } from "react-router-dom";
import { categories } from "@/lib/products";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="skew-tag bg-primary px-2 py-0.5 font-display text-xl text-primary-foreground">
              TN
            </span>
            <span className="font-display text-xl tracking-wider">Sports</span>
          </div>
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">
            Chuteiras de performance para campo e society. Feito para quem joga pra
            valer.
          </p>
        </div>

        <div>
          <h3 className="eyebrow text-primary">Categorias</h3>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {categories.map((cat) => (
              <li key={cat}>
                <Link to={`/produtos?cat=${encodeURIComponent(cat)}`} className="hover:text-foreground">
                  Chuteiras {cat}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="eyebrow text-primary">Ajuda</h3>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>Guia de tamanhos</li>
            <li>Trocas e devoluções</li>
            <li>Prazos de entrega</li>
            <li>Fale com a gente</li>
          </ul>
        </div>

        <div>
          <h3 className="eyebrow text-primary">Entrega</h3>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>Frete grátis acima de R$ 499</li>
            <li>Até 12x sem juros</li>
            <li>30 dias para troca</li>
            <li>Envio para todo o Brasil</li>
          </ul>
        </div>
      </div>
      <div aria-hidden="true" className="overflow-hidden px-4 sm:px-6">
        <p className="mx-auto max-w-7xl select-none whitespace-nowrap text-center font-display text-[17vw] leading-[0.85] text-secondary lg:text-[13rem]">
          TN <span className="text-primary/30">Sports</span>
        </p>
      </div>
      <div className="border-t border-border px-4 py-6 text-center text-xs text-muted-foreground sm:px-6">
        © {new Date().getFullYear()} TN Sports. Todos os direitos reservados.
      </div>
    </footer>
  );
}
