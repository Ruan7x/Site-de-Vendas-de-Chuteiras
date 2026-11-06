import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { readMine } from "@/lib/my-reviews";

export type Review = {
  id: number;
  name: string | null;
  rating: number;
  comment: string;
  model: string | null;
  images: string[];
  createdAt: string;
};
type Page = { reviews: Review[]; hasMore: boolean; summary: { count: number; average: number } };

const PAGE = 6;
function Stars({ value, size = "size-4" }: { value: number; size?: string }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${size} ${i <= Math.round(value) ? "fill-primary text-primary" : "text-muted-foreground/40"}`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

function ReviewCard({ review, mine, onPhoto }: { review: Review; mine: boolean; onPhoto: (src: string) => void }) {
  return (
    <article
      className={`flex h-full flex-col border bg-surface p-5 ${
        mine ? "border-primary shadow-volt" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <Stars value={review.rating} />
        <time className="text-xs text-muted-foreground" dateTime={review.createdAt}>
          {dateFmt.format(new Date(review.createdAt))}
        </time>
      </div>
      {mine && (
        <span className="eyebrow mt-3 inline-block w-fit skew-tag bg-primary px-2 py-0.5 text-primary-foreground">
          Sua avaliação
        </span>
      )}
      <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-foreground/90">{review.comment}</p>
      {review.images.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {review.images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => onPhoto(src)}
              className="size-16 overflow-hidden border border-border transition-colors hover:border-primary"
              aria-label={`Ver foto ${i + 1} da avaliação`}
            >
              <img src={src} alt="" loading="lazy" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <div className="mt-auto pt-5 text-sm">
        <p className="font-semibold">{review.name || "Cliente TN Sports"}</p>
        {review.model && <p className="text-xs text-muted-foreground">Comprou: {review.model}</p>}
      </div>
    </article>
  );
}

/** Avaliações publicadas (de todos os clientes). `latest` = a que a pessoa acabou de enviar. */
export function ReviewsList({ latest }: { latest: Review | null }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState({ count: 0, average: 0 });
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mine, setMine] = useState<number[]>(readMine);
  const [photo, setPhoto] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    try {
      const page = await api<Page>(`/api/feedback?limit=${PAGE}&offset=${offset}`);
      setReviews((prev) => {
        const base = offset === 0 ? [] : prev;
        const seen = new Set(base.map((r) => r.id));
        return [...base, ...page.reviews.filter((r) => !seen.has(r.id))];
      });
      setSummary(page.summary);
      setHasMore(page.hasMore);
      setError(false);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(0);
  }, [load]);

  // Avaliação recém-enviada: entra no topo da lista, marcada, e a lista rola até ela.
  useEffect(() => {
    if (!latest) return;
    setMine(readMine());
    setReviews((prev) => {
      if (prev.some((r) => r.id === latest.id)) return prev;
      setSummary((s) => ({
        count: s.count + 1,
        average: Math.round(((s.average * s.count + latest.rating) / (s.count + 1)) * 10) / 10,
      }));
      return [latest, ...prev];
    });
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [latest]);

  return (
    <div ref={topRef} className="scroll-mt-24 lg:col-span-5">
      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-border pt-12">
        <div>
          <span className="eyebrow text-primary">Avaliações</span>
          <h3 className="mt-3 text-3xl sm:text-4xl">O que dizem os clientes</h3>
        </div>
        {summary.count > 0 && (
          <div className="flex items-center gap-3">
            <span className="font-display text-4xl text-primary">{summary.average.toFixed(1).replace(".", ",")}</span>
            <div>
              <Stars value={summary.average} size="size-5" />
              <p className="mt-1 text-xs text-muted-foreground">
                {summary.count} {summary.count === 1 ? "avaliação" : "avaliações"}
              </p>
            </div>
          </div>
        )}
      </div>

      {error && reviews.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          Não foi possível carregar as avaliações agora.{" "}
          <button className="text-primary underline" onClick={() => void load(0)}>
            Tentar de novo
          </button>
        </p>
      ) : !loading && reviews.length === 0 ? (
        <div className="mt-8 flex items-center gap-3 border border-dashed border-border p-6 text-sm text-muted-foreground">
          <MessageSquare className="size-5 text-primary" /> Ainda não há avaliações. Seja o primeiro a contar como foi!
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r} mine={mine.includes(r.id)} onPhoto={setPhoto} />
          ))}
        </div>
      )}

      {loading && reviews.length === 0 && (
        <div className="mt-8 flex justify-center">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      )}

      {hasMore && (
        <div className="mt-8 flex justify-center">
          <Button variant="onDark" size="lg" onClick={() => void load(reviews.length)} disabled={loading}>
            {loading && <Loader2 className="animate-spin" />} Ver mais avaliações
          </Button>
        </div>
      )}

      <Dialog open={photo !== null} onOpenChange={(o) => !o && setPhoto(null)}>
        <DialogContent className="max-w-3xl border-border bg-surface p-2">
          <DialogTitle className="sr-only">Foto da avaliação</DialogTitle>
          {photo && <img src={photo} alt="Foto enviada pelo cliente" className="max-h-[80vh] w-full object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
