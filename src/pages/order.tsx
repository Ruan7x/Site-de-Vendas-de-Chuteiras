import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, Loader2, MessageCircle, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { forgetCheckoutKey } from "@/lib/checkout";
import { formatPrice } from "@/lib/products";

type OrderView = {
  publicId: string;
  number: string;
  status: string;
  items: { name: string; size: number; quantity: number; unitPrice: number }[];
  total: number;
  createdAt: string;
  payUrl: string | null;
  canRetry: boolean;
  whatsappUrl: string | null;
  whatsappConfigured: boolean;
  verification: "ok" | "error";
};

type Tone = "success" | "pending" | "danger";
const UI: Record<string, { title: string; text: string; tone: Tone; icon: typeof Clock }> = {
  AWAITING_PAYMENT: {
    title: "Aguardando pagamento",
    text: "Ainda não recebemos a confirmação do Mercado Pago. Se você já pagou, aguarde alguns instantes — esta página atualiza sozinha. Pix e boleto podem levar mais tempo.",
    tone: "pending",
    icon: Clock,
  },
  IN_ANALYSIS: {
    title: "Pagamento em análise",
    text: "O Mercado Pago está analisando a transação. Assim que for aprovada, liberamos o contato com a loja.",
    tone: "pending",
    icon: Clock,
  },
  PAID: {
    title: "Pagamento aprovado",
    text: "Pagamento confirmado pelo Mercado Pago. Continue o atendimento pelo WhatsApp para combinar a entrega.",
    tone: "success",
    icon: CheckCircle2,
  },
  DECLINED: {
    title: "Pagamento recusado",
    text: "O pagamento não foi aprovado. Você pode tentar novamente, inclusive com outra forma de pagamento — sem criar um novo pedido.",
    tone: "danger",
    icon: XCircle,
  },
  CANCELED: {
    title: "Pagamento cancelado",
    text: "O pagamento foi cancelado. Nenhuma cobrança foi concluída. Você pode tentar novamente.",
    tone: "danger",
    icon: XCircle,
  },
  EXPIRED: {
    title: "Link de pagamento expirado",
    text: "O tempo para pagar este pedido acabou. Gere um novo link de pagamento e conclua a compra.",
    tone: "danger",
    icon: XCircle,
  },
  REFUNDED: {
    title: "Pagamento reembolsado",
    text: "Este pagamento foi devolvido ou contestado. Se tiver dúvidas, fale com a loja informando o número do pedido.",
    tone: "danger",
    icon: AlertTriangle,
  },
  ERROR: {
    title: "Erro ao iniciar o pagamento",
    text: "Não conseguimos abrir o ambiente de pagamento. Tente novamente.",
    tone: "danger",
    icon: AlertTriangle,
  },
  VERIFICATION_ERROR: {
    title: "Erro ao verificar o pagamento",
    text: "Encontramos uma divergência ao confirmar este pagamento. Não pague novamente — fale com a loja informando o número do pedido.",
    tone: "danger",
    icon: AlertTriangle,
  },
};

const toneClass: Record<Tone, string> = {
  success: "border-primary text-primary",
  pending: "border-border text-foreground",
  danger: "border-destructive text-destructive",
};

export default function OrderPage() {
  const { publicId = "" } = useParams<{ publicId: string }>();
  const [searchParams] = useSearchParams();
  // O Mercado Pago anexa o id do pagamento à URL de retorno. É só uma dica: o servidor confere na API.
  const paymentHint = searchParams.get("payment_id") ?? searchParams.get("collection_id") ?? "";
  const { clear } = useCart();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const redirected = useRef(false);
  const paidHandled = useRef(false);

  const load = useCallback(async () => {
    try {
      const qs = /^\d{3,20}$/.test(paymentHint) ? `?payment_id=${paymentHint}` : "";
      setOrder(await api<OrderView>(`/api/orders/${encodeURIComponent(publicId)}${qs}`));
      setLoadError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true);
      else setLoadError(e instanceof Error ? e.message : "Erro ao verificar o pagamento.");
    }
  }, [publicId, paymentHint]);

  useEffect(() => {
    void load();
  }, [load]);

  const status = order?.status;
  const pending = status === "AWAITING_PAYMENT" || status === "IN_ANALYSIS";

  // Consulta o status no servidor até a confirmação (não depende só do webhook nem do redirecionamento).
  useEffect(() => {
    if (!pending) return;
    const started = Date.now();
    const t = setInterval(() => {
      if (Date.now() - started > 20 * 60_000) clearInterval(t);
      else void load();
    }, 6000);
    return () => clearInterval(t);
  }, [pending, load]);

  // Pagamento confirmado pelo servidor: limpa a sacola e agenda o WhatsApp (uma única vez por pedido).
  useEffect(() => {
    if (status !== "PAID" || !order || paidHandled.current) return;
    paidHandled.current = true; // executa uma única vez por visita (clear() muda de identidade a cada render)
    clear();
    forgetCheckoutKey();
    const flag = `tn-sports-wa-${order.publicId}`;
    if (!order.whatsappUrl || sessionStorage.getItem(flag)) return;
    setCountdown(6);
  }, [status, order, clear]);

  useEffect(() => {
    if (countdown === null || !order?.whatsappUrl) return;
    if (countdown <= 0) {
      if (!redirected.current) {
        redirected.current = true;
        try {
          sessionStorage.setItem(`tn-sports-wa-${order.publicId}`, "1");
        } catch {
          /* ignore */
        }
        window.location.assign(order.whatsappUrl);
      }
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? c : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, order]);

  const checkAgain = async () => {
    setChecking(true);
    await load();
    setChecking(false);
  };

  const retry = async () => {
    setRetrying(true);
    try {
      const res = await api<{ payUrl: string | null }>(`/api/orders/${encodeURIComponent(publicId)}/retry`, { method: "POST" });
      if (res.payUrl) window.location.assign(res.payUrl);
      else await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível tentar novamente.");
    }
    setRetrying(false);
  };

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <h1 className="text-3xl">Pedido não encontrado</h1>
        <Link to="/produtos" className="mt-4 inline-block text-primary hover:underline">
          Voltar ao catálogo
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-24 text-center sm:px-6">
        {loadError ? (
          <>
            <AlertTriangle className="size-10 text-destructive" />
            <h1 className="text-3xl">Erro ao verificar o pagamento</h1>
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <Button variant="volt" onClick={checkAgain} disabled={checking}>
              <RefreshCw className={checking ? "animate-spin" : ""} /> Tentar novamente
            </Button>
          </>
        ) : (
          <Loader2 className="size-8 animate-spin text-primary" />
        )}
      </div>
    );
  }

  const ui = UI[order.status] ?? UI.ERROR;
  const Icon = ui.icon;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="eyebrow text-primary">Pedido {order.number}</p>

      <div className={`mt-4 border-l-4 bg-secondary/40 p-6 ${toneClass[ui.tone]}`} role="status" aria-live="polite">
        <div className="flex items-center gap-3">
          <Icon className="size-8 shrink-0" />
          <h1 className="text-3xl sm:text-4xl">{ui.title}</h1>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{ui.text}</p>
        {order.verification === "error" && (
          <p className="mt-3 text-sm text-destructive">
            Não conseguimos consultar o Mercado Pago agora. Tentaremos de novo automaticamente.
          </p>
        )}
        {loadError && <p className="mt-3 text-sm text-destructive">{loadError}</p>}
      </div>

      <div className="mt-6 border border-border">
        {order.items.map((it, i) => (
          <div key={i} className="flex items-center justify-between gap-4 border-b border-border p-4 text-sm last:border-b-0">
            <div>
              <p className="font-display text-base">{it.name}</p>
              <p className="text-xs text-muted-foreground">
                Tam. {it.size} · {it.quantity}x {formatPrice(it.unitPrice)}
              </p>
            </div>
            <p className="font-semibold">{formatPrice(it.unitPrice * it.quantity)}</p>
          </div>
        ))}
        <div className="flex items-center justify-between bg-secondary/40 p-4">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="font-display text-2xl text-primary">{formatPrice(order.total)}</span>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {order.status === "PAID" &&
          (order.whatsappUrl ? (
            <Button asChild variant="volt" size="xl" className="flex-1">
              <a href={order.whatsappUrl}>
                <MessageCircle /> Continuar no WhatsApp
              </a>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Pagamento confirmado. O WhatsApp da loja ainda não foi configurado — entre em contato informando o pedido{" "}
              {order.number}.
            </p>
          ))}

        {order.status === "AWAITING_PAYMENT" && order.payUrl && (
          <Button asChild variant="volt" size="xl" className="flex-1">
            <a href={order.payUrl}>Ir para o pagamento</a>
          </Button>
        )}

        {order.canRetry && (
          <Button variant="volt" size="xl" className="flex-1" onClick={retry} disabled={retrying}>
            {retrying ? <Loader2 className="animate-spin" /> : <RefreshCw />} Tentar novamente
          </Button>
        )}

        {(pending || order.status === "VERIFICATION_ERROR" || order.verification === "error") && (
          <Button variant="onDark" size="xl" onClick={checkAgain} disabled={checking}>
            <RefreshCw className={checking ? "animate-spin" : ""} /> Verificar status
          </Button>
        )}
      </div>

      {countdown !== null && countdown > 0 && order.whatsappUrl && (
        <p className="mt-4 text-sm text-muted-foreground">
          Abrindo o WhatsApp em {countdown}s…{" "}
          <button className="text-primary underline" onClick={() => setCountdown(null)}>
            cancelar
          </button>
        </p>
      )}

      <Link to="/produtos" className="mt-10 inline-block text-sm text-muted-foreground hover:text-primary">
        ← Voltar ao catálogo
      </Link>
    </div>
  );
}
