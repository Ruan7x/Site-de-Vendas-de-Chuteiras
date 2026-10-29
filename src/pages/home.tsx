import { Link } from "react-router-dom";
import { Truck, ShieldCheck, RefreshCcw, CreditCard } from "lucide-react";
import heroBoot from "@/assets/hero-boot.jpg";
import storyFounder from "@/assets/story-founder.jpg";
import { FeedbackSection } from "@/components/feedback-section";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/product-card";
import { categories } from "@/lib/products";
import { useProducts } from "@/lib/products-store";

const benefits = [
  { icon: Truck, title: "Frete grátis", text: "Em compras acima de R$ 499" },
  { icon: CreditCard, title: "12x sem juros", text: "No cartão de crédito" },
  { icon: RefreshCcw, title: "Troca fácil", text: "30 dias para trocar o tamanho" },
  { icon: ShieldCheck, title: "Original", text: "Garantia de 6 meses" },
];

export default function Home() {
  const { products } = useProducts();

  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <img
          src={heroBoot}
          alt="Chuteira TN Sports Velocity em preto e verde volt"
          width={1600}
          height={1104}
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
        <div className="relative mx-auto flex min-h-[82vh] max-w-7xl flex-col justify-center px-4 py-20 sm:px-6">
          <span className="eyebrow skew-tag w-fit bg-primary px-3 py-1 text-primary-foreground">
            Coleção 26/27
          </span>
          <h1 className="mt-6 max-w-2xl text-5xl sm:text-7xl lg:text-8xl">
            Velocidade
            <br />
            <span className="text-primary">sem desculpa</span>
          </h1>
          <p className="mt-6 max-w-md text-base text-muted-foreground sm:text-lg">
            Chuteiras desenvolvidas para campo e society. Cabedal leve, tração agressiva
            e ajuste que responde no primeiro toque.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild variant="volt" size="xl">
              <Link to="/produtos">Comprar agora</Link>
            </Button>
            <Button asChild variant="onDark" size="xl">
              <Link to="/produtos?cat=Society">Ver society</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="text-3xl sm:text-4xl">Escolha seu terreno</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {categories.map((cat) => {
            const item = products.find((p) => p.category === cat);
            if (!item) return null;
            return (
              <Link
                key={cat}
                to={`/produtos?cat=${encodeURIComponent(cat)}`}
                className="group relative overflow-hidden border border-border bg-secondary"
              >
                <img
                  src={item.image}
                  alt={`Chuteiras para ${cat}`}
                  loading="lazy"
                  width={900}
                  height={900}
                  className="aspect-4/3 w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background to-transparent p-5">
                  <h3 className="text-2xl">{cat}</h3>
                  <span className="eyebrow text-primary">Ver modelos</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-3xl sm:text-4xl">Destaques da linha</h2>
          <Button asChild variant="onDark">
            <Link to="/produtos">Ver tudo</Link>
          </Button>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.slice(0, 6).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-secondary/40">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div className="overflow-hidden border border-border">
            <img
              src={storyFounder}
              alt="Thiago Nalberth, fundador da TN Sports, cercado por chuteiras"
              loading="lazy"
              width={952}
              height={1258}
              className="aspect-[3/4] w-full object-cover"
            />
          </div>
          <div>
            <span className="eyebrow text-primary">Nossa história</span>
            <h2 className="mt-3 max-w-lg text-3xl sm:text-5xl">
              De uma dificuldade financeira a um projeto pra ajudar outros atletas
            </h2>
            <p className="mt-5 max-w-xl text-sm text-muted-foreground sm:text-base">
              A TN Sports nasceu de uma iniciativa do jovem Thiago Nalberth. Sem recursos para
              comprar sua própria chuteira, ele transformou essa dificuldade pessoal em um projeto
              de apoio a outros atletas na mesma situação.
            </p>

            <div className="mt-8 space-y-6">
              <div className="border-l-2 border-primary pl-4">
                <h3 className="font-display text-lg">A motivação</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  O projeto surgiu da frustração de Thiago ao não conseguir adquirir seu próprio
                  equipamento, o que o levou a estudar o mercado de artigos esportivos em busca de
                  alternativas viáveis.
                </p>
              </div>
              <div className="border-l-2 border-primary pl-4">
                <h3 className="font-display text-lg">O propósito</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  A missão central da TN Sports era incentivar jovens a não desistirem do esporte
                  por limitações financeiras, guiando-os na escolha de materiais adequados.
                </p>
              </div>
              <div className="border-l-2 border-primary pl-4">
                <h3 className="font-display text-lg">Foco no custo-benefício</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  O projeto se dedicava a mapear e recomendar chuteiras que entregassem boa
                  qualidade, durabilidade e conforto por preços justos, democratizando o acesso
                  aos gramados e quadras.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <FeedbackSection />
    </>
  );
}
