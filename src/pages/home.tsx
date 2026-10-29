import { Link } from "react-router-dom";
import { ArrowRight, Truck, ShieldCheck, RefreshCcw, CreditCard } from "lucide-react";
import heroBoot from "@/assets/hero-boot.jpg";
import storyFounder from "@/assets/story-founder.jpg";
import { FeedbackSection } from "@/components/feedback-section";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";
import { categories, formatPrice } from "@/lib/products";
import { useProducts } from "@/lib/products-store";

const benefits = [
  { icon: Truck, title: "Frete grátis", text: "Em compras acima de R$ 499" },
  { icon: CreditCard, title: "12x sem juros", text: "No cartão de crédito" },
  { icon: RefreshCcw, title: "Troca fácil", text: "30 dias para trocar o tamanho" },
  { icon: ShieldCheck, title: "Original", text: "Garantia de 6 meses" },
];

export default function Home() {
  const { products } = useProducts();
  const featured = products[0];
  // múltiplo de 3 para a grade não terminar com um cartão sozinho (mínimo de 3)
  const highlightCount = products.length >= 6 ? 6 : products.length >= 3 ? 3 : products.length;

  return (
    <>
      <section className="relative overflow-hidden">
        <img
          src={heroBoot}
          alt="Chuteira TN Sports Velocity em preto e verde volt"
          width={1600}
          height={1104}
          className="absolute inset-0 h-full w-full object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/10" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
        <div className="relative mx-auto grid min-h-[88vh] max-w-7xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <span className="eyebrow skew-tag inline-block bg-primary px-3 py-1 text-primary-foreground">
              Coleção 26/27
            </span>
            <h1 className="mt-6 text-6xl sm:text-8xl xl:text-9xl">
              Velocidade
              <br />
              <span className="text-primary">sem desculpa</span>
            </h1>
            <p className="mt-7 max-w-lg text-base text-foreground/80 sm:text-lg">
              Chuteiras desenvolvidas para campo e society. Cabedal leve, tração agressiva
              e ajuste que responde no primeiro toque.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Button asChild variant="volt" size="xl">
                <Link to="/produtos">Comprar agora</Link>
              </Button>
              <Button asChild variant="onDark" size="xl">
                <Link to="/produtos?cat=Society">Ver society</Link>
              </Button>
            </div>
          </div>

          {featured && (
            <Link
              to={`/produtos/${featured.id}`}
              className="group hidden border border-border bg-background/80 p-4 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary hover:shadow-volt lg:col-span-5 lg:block xl:col-span-4 xl:col-start-9"
            >
              <img
                src={featured.image}
                alt={`Chuteira ${featured.name}`}
                width={900}
                height={900}
                className="aspect-square w-full object-cover"
              />
              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <span className="eyebrow text-primary">Em destaque</span>
                  <h2 className="mt-1 text-2xl">{featured.name}</h2>
                  <p className="mt-1 font-display text-xl text-primary">{formatPrice(featured.price)}</p>
                </div>
                <span className="flex size-10 items-center justify-center bg-primary text-primary-foreground transition-transform duration-300 group-hover:translate-x-1">
                  <ArrowRight className="size-5" />
                </span>
              </div>
            </Link>
          )}
        </div>
      </section>

      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-4 gap-y-6 px-4 py-7 sm:px-6 lg:grid-cols-4">
          {benefits.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-center gap-3">
              <Icon className="size-7 shrink-0" strokeWidth={1.75} />
              <div>
                <p className="font-display text-lg leading-none">{title}</p>
                <p className="mt-1 text-xs font-medium opacity-80 sm:text-sm">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <Reveal>
          <span className="eyebrow text-primary">Categorias</span>
          <h2 className="mt-3 text-4xl sm:text-5xl">Escolha seu terreno</h2>
        </Reveal>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {categories.map((cat, i) => {
            const item = products.find((p) => p.category === cat);
            if (!item) return null;
            const total = products.filter((p) => p.category === cat).length;
            return (
              <Reveal key={cat} delay={i * 120}>
                <Link
                  to={`/produtos?cat=${encodeURIComponent(cat)}`}
                  className="group relative block overflow-hidden border border-border bg-secondary transition-colors duration-300 hover:border-primary"
                >
                  <img
                    src={item.image}
                    alt={`Chuteiras para ${cat}`}
                    loading="lazy"
                    width={900}
                    height={900}
                    className="aspect-4/3 w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-background via-background/70 to-transparent p-6 pt-20">
                    <div>
                      <h3 className="text-4xl">{cat}</h3>
                      <span className="eyebrow mt-2 block text-primary">
                        {total} {total === 1 ? "modelo" : "modelos"}
                      </span>
                    </div>
                    <span className="flex size-11 shrink-0 items-center justify-center bg-primary text-primary-foreground transition-transform duration-300 group-hover:translate-x-1">
                      <ArrowRight className="size-5" />
                    </span>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="eyebrow text-primary">Mais procuradas</span>
            <h2 className="mt-3 text-4xl sm:text-5xl">Destaques da linha</h2>
          </div>
          <Button asChild variant="onDark">
            <Link to="/produtos">Ver tudo</Link>
          </Button>
        </Reveal>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.slice(0, highlightCount).map((product, i) => (
            <Reveal key={product.id} delay={(i % 3) * 100} className="h-full">
              <ProductCard product={product} />
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-secondary/40">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16">
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
            <h2 className="mt-3 max-w-xl text-3xl sm:text-4xl lg:text-5xl">
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
