import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert } from "lucide-react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/** Notificações no visual da loja: cartão escuro, faixa lateral colorida e ícone em destaque. */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      offset={{ top: 88 }}
      mobileOffset={{ top: 80, left: 16, right: 16 }}
      gap={10}
      icons={{
        success: <CheckCircle2 className="size-5 text-primary" />,
        error: <AlertCircle className="size-5 text-destructive" />,
        warning: <TriangleAlert className="size-5 text-accent" />,
        info: <Info className="size-5 text-foreground" />,
        loading: <Loader2 className="size-5 animate-spin text-primary" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group flex w-full items-center sm:w-[380px] gap-3 border border-border border-l-4 border-l-primary bg-surface/95 px-4 py-3.5 text-surface-foreground shadow-[0_22px_48px_-18px_rgb(0_0_0/0.85)] backdrop-blur-sm",
          error: "border-l-destructive",
          warning: "border-l-accent",
          info: "border-l-foreground/60",
          icon: "flex size-9 shrink-0 items-center justify-center bg-secondary",
          content: "min-w-0 flex-1",
          title: "font-display text-base leading-tight tracking-wide uppercase",
          description: "mt-1 text-sm leading-snug text-muted-foreground",
          actionButton:
            "shrink-0 bg-primary px-3 py-2 font-display text-xs uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/85",
          cancelButton: "shrink-0 bg-secondary px-3 py-2 text-xs text-muted-foreground",
          closeButton: "border-border bg-surface text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
