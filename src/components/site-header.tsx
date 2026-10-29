import { Link, useLocation, useNavigate } from "react-router-dom";
import { Loader2, Menu, Settings, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useCart } from "@/lib/cart";
import { startCheckout } from "@/lib/checkout";
import { categories, formatPrice } from "@/lib/products";

function CartSheet() {
  const { count, detailed, total, remove } = useCart();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [paying, setPaying] = useState(false);

  // Usa o carrinho existente; o servidor revalida produtos, tamanhos e preços.
  const checkout = async () => {
    if (paying || detailed.length === 0) return;
    setPaying(true);
    try {
      const res = await startCheckout(detailed.map((l) => ({ id: l.product.id, size: l.size, qty: l.qty })));
      if (res.payUrl) {
        window.location.assign(res.payUrl); // página segura de pagamento do Mercado Pago
        return;
      }
      setOpen(false);
      navigate(`/pedido/${res.publicId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível iniciar o pagamento.");
    }
    setPaying(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Abrir sacola" className="relative">
          <ShoppingBag />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {count}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col bg-surface text-surface-foreground sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">Sua sacola</SheetTitle>
        </SheetHeader>

        {detailed.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Sua sacola está vazia. Escolha sua próxima chuteira.
          </p>
        ) : (
          <div className="mt-6 flex-1 space-y-4 overflow-y-auto">
            {detailed.map((line) => (
              <div
                key={`${line.product.id}-${line.size}`}
                className="flex gap-3 border border-border p-3"
              >
                <img
                  src={line.product.image}
                  alt={line.product.name}
                  loading="lazy"
                  width={900}
                  height={900}
                  className="h-16 w-16 object-cover"
                />
                <div className="flex-1">
                  <p className="font-display text-sm">{line.product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Tam. {line.size} · {line.qty}x
                  </p>
                  <p className="mt-1 text-sm font-semibold text-primary">
                    {formatPrice(line.product.price * line.qty)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remover item"
                  onClick={() => remove(line.product.id, line.size)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-auto space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-display text-xl">{formatPrice(total)}</span>
          </div>
          <Button
            variant="volt"
            size="xl"
            className="w-full"
            disabled={detailed.length === 0 || paying}
            onClick={checkout}
          >
            {paying ? (
              <>
                <Loader2 className="animate-spin" /> Redirecionando…
              </>
            ) : (
              "Finalizar compra"
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Frete grátis acima de R$ 499 · Até 12x sem juros
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { pathname, search } = useLocation();
  const activeCat = new URLSearchParams(search).get("cat");

  const linkClass = (active: boolean) =>
    `text-sm font-semibold uppercase tracking-[0.14em] transition-colors hover:text-primary ${
      active ? "text-primary" : "text-muted-foreground"
    }`;

  const nav = (
    <>
      <Link
        to="/produtos"
        className={linkClass(pathname === "/produtos" && !activeCat)}
        onClick={() => setOpen(false)}
      >
        Todas
      </Link>
      {categories.map((cat) => (
        <Link
          key={cat}
          to={`/produtos?cat=${encodeURIComponent(cat)}`}
          className={linkClass(pathname === "/produtos" && activeCat === cat)}
          onClick={() => setOpen(false)}
        >
          {cat}
        </Link>
      ))}
    </>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="skew-tag bg-primary px-2.5 py-0.5 font-display text-2xl text-primary-foreground">
            TN
          </span>
          <span className="font-display text-2xl tracking-wider">Sports</span>
        </Link>

        <nav className="hidden items-center gap-10 md:flex">{nav}</nav>

        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="Área administrativa">
            <Link to="/admin">
              <Settings />
            </Link>
          </Button>
          <CartSheet />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" aria-label="Abrir menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="bg-surface text-surface-foreground">
              <SheetHeader>
                <SheetTitle className="font-display text-2xl">Categorias</SheetTitle>
              </SheetHeader>
              <nav className="mt-8 flex flex-col gap-5">{nav}</nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
