import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Star } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

const schema = z.object({
  rating: z.number({ message: "Escolha uma nota de 1 a 5 estrelas." }).int().min(1, "Escolha uma nota de 1 a 5 estrelas.").max(5),
  comment: z.string().trim().min(5, "Escreva pelo menos 5 caracteres.").max(1000, "Máximo de 1000 caracteres."),
  name: z.string().trim().max(80, "Máximo de 80 caracteres.").optional(),
  email: z.union([z.literal(""), z.string().trim().max(120).email("Informe um e-mail válido.")]).optional(),
});

const LABELS = ["", "Ruim", "Regular", "Bom", "Muito bom", "Excelente"];
type Errors = Partial<Record<"rating" | "comment" | "name" | "email" | "form", string>>;

export function FeedbackSection() {
  const mountedAt = useRef(0);

  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [popKey, setPopKey] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [comment, setComment] = useState("");
  const [website, setWebsite] = useState(""); // honeypot: humanos não preenchem
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const active = hover || rating;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    const parsed = schema.safeParse({ rating: rating || undefined, comment, name, email });
    if (!parsed.success) {
      const next: Errors = {};
      for (const i of parsed.error.issues) next[i.path[0] as keyof Errors] ??= i.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setSending(true);
    try {
      await api("/api/feedback", {
        method: "POST",
        json: { ...parsed.data, website, elapsedMs: Date.now() - mountedAt.current },
      });
      setRating(0);
      setHover(0);
      setName("");
      setEmail("");
      setComment("");
      setDone(true);
      mountedAt.current = Date.now();
    } catch (err) {
      setDone(false);
      setErrors({ form: err instanceof Error ? err.message : "Não foi possível enviar agora." });
    }
    setSending(false);
  };

  return (
    <section id="feedback" className="border-b border-border bg-background">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 py-16 sm:px-6 lg:grid-cols-5 lg:gap-16 lg:py-24">
        <div className="min-w-0 lg:col-span-2">
          <span className="eyebrow text-primary">Feedback</span>
          <h2 className="mt-3 break-words text-3xl uppercase sm:text-5xl lg:text-6xl">
            Sua opinião faz a <span className="text-primary">diferença</span>
          </h2>
          <p className="mt-5 max-w-md text-sm text-muted-foreground sm:text-base">
            Ajude a TN Sports a melhorar cada vez mais. Seu feedback é muito importante para nós!
          </p>
          <div className="mt-8 hidden h-1 w-24 skew-tag bg-primary lg:block" />
        </div>

        <form
          onSubmit={submit}
          noValidate
          className="relative border border-border bg-secondary/30 p-5 transition-all duration-300 hover:border-primary/60 hover:shadow-volt sm:p-8 min-w-0 lg:col-span-3"
        >
          {done && (
            <div
              role="status"
              className="mb-6 flex items-start gap-3 border border-primary bg-primary/10 p-4 text-sm animate-in fade-in slide-in-from-top-2 duration-500"
            >
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
              <p>
                <strong className="font-semibold text-primary">Feedback enviado com sucesso!</strong> Obrigado por nos
                ajudar a melhorar.
              </p>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fb-name">Nome (opcional)</Label>
              <Input id="fb-name" value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} placeholder="Como podemos te chamar?" />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fb-email">E-mail (opcional)</Label>
              <Input id="fb-email" type="email" value={email} maxLength={120} autoComplete="email" onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
          </div>

          <div className="mt-6">
            <Label id="fb-rating-label">Sua avaliação *</Label>
            <div
              role="radiogroup"
              aria-labelledby="fb-rating-label"
              className="mt-2 flex items-center gap-1"
              onMouseLeave={() => setHover(0)}
            >
              {[1, 2, 3, 4, 5].map((n) => {
                const on = n <= active;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"}`}
                    onMouseEnter={() => setHover(n)}
                    onClick={() => {
                      setRating(n);
                      setPopKey((k) => k + 1);
                    }}
                    className="p-1 transition-transform duration-200 hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Star
                      key={rating === n ? popKey : 0}
                      className={`size-9 transition-colors duration-200 ${
                        on ? "fill-primary text-primary" : "text-muted-foreground/50"
                      } ${rating === n ? "animate-star-pop" : ""}`}
                    />
                  </button>
                );
              })}
              <span className="ml-3 min-w-24 text-sm font-medium text-primary">{LABELS[active]}</span>
            </div>
            {errors.rating && <p className="mt-1 text-xs text-destructive">{errors.rating}</p>}
          </div>

          <div className="mt-6 space-y-1.5">
            <Label htmlFor="fb-comment">Sugestões, críticas ou elogios *</Label>
            <Textarea
              id="fb-comment"
              rows={5}
              value={comment}
              maxLength={1000}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Conte como foi sua experiência com a TN Sports..."
            />
            <div className="flex justify-between text-xs">
              <span className="text-destructive">{errors.comment}</span>
              <span className="text-muted-foreground">{comment.length}/1000</span>
            </div>
          </div>

          {/* honeypot anti-spam */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>
              Não preencha
              <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </label>
          </div>

          {errors.form && (
            <p role="alert" className="mt-4 border border-destructive p-3 text-sm text-destructive">
              {errors.form}
            </p>
          )}

          <Button type="submit" variant="volt" size="xl" className="mt-6 w-full uppercase" disabled={sending}>
            {sending ? (
              <>
                <Loader2 className="animate-spin" /> Enviando…
              </>
            ) : (
              "Enviar feedback"
            )}
          </Button>
        </form>
      </div>
    </section>
  );
}
