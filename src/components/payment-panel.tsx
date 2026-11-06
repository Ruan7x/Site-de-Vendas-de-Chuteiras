import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, CreditCard, Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { openPayTab } from "@/lib/pay-tab";

export type PixInfo = { qrCode: string; hasImage: boolean; expiresAt: string };

const EMAIL_KEY = "tn-sports-email";
const readEmail = () => {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
};

function useRemaining(expiresAt: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  if (!expiresAt) return null;
  const ms = Math.max(0, Date.parse(expiresAt) - now);
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // navegadores antigos / sem permissão: seleciona e copia
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/** Pix com QR code e "copia e cola" na própria página: o cliente não sai do navegador. */
function PixPayment({ publicId, pix, onChanged }: { publicId: string; pix: PixInfo | null; onChanged: () => Promise<void> }) {
  const [email, setEmail] = useState(readEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const remaining = useRemaining(pix?.expiresAt);

  const generate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Informe um e-mail válido.");
    setBusy(true);
    try {
      await api(`/api/orders/${encodeURIComponent(publicId)}/pix`, { method: "POST", json: { email: email.trim() } });
      try {
        localStorage.setItem(EMAIL_KEY, email.trim());
      } catch {
        /* ignore */
      }
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar o Pix.");
    }
    setBusy(false);
  };

  const copy = async () => {
    if (!pix) return;
    if (await copyText(pix.qrCode)) {
      setCopied(true);
      toast.success("Código Pix copiado", { description: "Cole no app do seu banco em Pix Copia e Cola." });
      setTimeout(() => setCopied(false), 2500);
    } else toast.error("Não foi possível copiar", { description: "Selecione o código e copie manualmente." });
  };

  if (!pix) {
    return (
      <form onSubmit={generate} className="space-y-4" noValidate>
        <p className="text-sm text-muted-foreground">
          Gere o código Pix aqui mesmo e pague pelo app do seu banco. A confirmação é automática.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="pix-email">Seu e-mail (o Mercado Pago envia o comprovante)</Label>
          <Input
            id="pix-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            maxLength={120}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@exemplo.com"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" variant="volt" size="xl" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <QrCode />} Gerar código Pix
        </Button>
      </form>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
      {pix.hasImage && (
        // no celular o QR vai para o fim: quem está no próprio celular usa o copia e cola
        <div className="order-last mx-auto bg-white p-3 sm:order-none sm:mx-0">
          <img
            src={`/api/orders/${encodeURIComponent(publicId)}/pix.png?v=${encodeURIComponent(pix.qrCode.slice(-12))}`}
            alt="QR code do Pix"
            width={220}
            height={220}
            className="size-48 sm:size-52"
          />
        </div>
      )}
      <div className="min-w-0 space-y-4">
        <div>
          <Label htmlFor="pix-code">Pix copia e cola</Label>
          <textarea
            id="pix-code"
            readOnly
            value={pix.qrCode}
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-1.5 w-full resize-none break-all border border-input bg-background p-3 font-mono text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <Button type="button" variant="volt" size="xl" className="w-full" onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? "Código copiado" : "Copiar código Pix"}
        </Button>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Copie o código{pix.hasImage && <span className="hidden sm:inline"> ou leia o QR code com o celular</span>}.
          </li>
          <li>
            No app do seu banco, escolha <strong className="text-foreground">Pix → Pix Copia e Cola</strong> e pague.
          </li>
          <li>
            Volte para esta página: ela abre o <strong className="text-foreground">WhatsApp da loja</strong> sozinha quando o
            pagamento cair.
          </li>
        </ol>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span>Aguardando o pagamento</span>
          {remaining && <span className="text-muted-foreground">· expira em {remaining}</span>}
        </p>
      </div>
    </div>
  );
}

/** Cartão ou boleto: abre a página segura do Mercado Pago numa aba nova (no celular pode abrir o app). */
function CardPayment({ publicId }: { publicId: string }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const tab = openPayTab();
    try {
      const res = await api<{ payUrl: string | null }>(`/api/orders/${encodeURIComponent(publicId)}/card`, { method: "POST" });
      if (!res.payUrl) throw new Error("Não foi possível abrir o pagamento agora.");
      if (!tab.go(res.payUrl)) window.location.assign(res.payUrl);
    } catch (err) {
      tab.close();
      toast.error("Não foi possível abrir o pagamento", { description: err instanceof Error ? err.message : undefined });
    }
    setBusy(false);
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pague com cartão de crédito (com parcelamento) ou boleto na página segura do Mercado Pago. Deixe esta página aberta:
        ela abre o WhatsApp da loja quando o pagamento for confirmado. Boleto pode levar até 3 dias úteis.
      </p>
      <Button type="button" variant="volt" size="xl" className="w-full" onClick={go} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <CreditCard />} Pagar com cartão ou boleto
      </Button>
    </div>
  );
}

export function PaymentPanel({ publicId, pix, onChanged }: { publicId: string; pix: PixInfo | null; onChanged: () => Promise<void> }) {
  const [method, setMethod] = useState<"pix" | "card">("pix");
  const tab = (id: "pix" | "card", label: string, Icon: typeof QrCode) => (
    <button
      type="button"
      role="tab"
      aria-selected={method === id}
      onClick={() => setMethod(id)}
      className={`flex flex-1 items-center justify-center gap-2 border px-3 py-3 font-display text-sm uppercase tracking-wider transition-colors ${
        method === id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
      }`}
    >
      <Icon className="size-4" /> {label}
    </button>
  );
  return (
    <section className="mt-6 border border-border bg-surface p-5 sm:p-6" aria-label="Pagamento">
      <h2 className="text-2xl">Como você quer pagar?</h2>
      <div className="mt-4 flex gap-2" role="tablist">
        {tab("pix", "Pix", QrCode)}
        {tab("card", "Cartão ou boleto", CreditCard)}
      </div>
      <div className="mt-5">
        {method === "pix" ? <PixPayment publicId={publicId} pix={pix} onChanged={onChanged} /> : <CardPayment publicId={publicId} />}
      </div>
    </section>
  );
}
