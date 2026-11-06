import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ImagePlus, Lock, LogOut, Pencil, Plus, Star, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { categories, formatPrice, type Category, type Product } from "@/lib/products";
import { useProducts } from "@/lib/products-store";
import { api } from "@/lib/api";
import { compressImage } from "@/lib/image";

const ALL_SIZES = Array.from({ length: 12 }, (_, i) => 34 + i); // 34..45

type FormState = {
  id: string;
  name: string;
  line: string;
  category: Category;
  price: string;
  oldPrice: string;
  /** `image` vazio = a cor usa a imagem principal; data URL = foto nova; caminho/URL = foto já salva. */
  colors: { key: number; name: string; image: string }[];
  tag: string;
  description: string;
  sizes: number[];
  image: string;
};

let colorKey = 0;
const newColor = (name = "", image = "") => ({ key: ++colorKey, name, image });

const emptyForm: FormState = {
  id: "",
  name: "",
  line: "",
  category: "Campo",
  price: "",
  oldPrice: "",
  colors: [],
  tag: "",
  description: "",
  sizes: [],
  image: "",
};

function AdminGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A senha é validada no SERVIDOR (variável ADMIN_PASSWORD); a sessão fica em cookie HttpOnly.
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/admin/login", { method: "POST", json: { password: value } });
      onUnlock();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login.");
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center justify-center px-4 text-center">
      <Lock className="size-8 text-primary" />
      <h1 className="mt-4 text-3xl">Área administrativa</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Digite a senha para gerenciar o catálogo de chuteiras.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 w-full space-y-3">
        <Input
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="Senha"
          autoFocus
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="submit" variant="volt" size="xl" className="w-full" disabled={busy}>
          Entrar
        </Button>
      </form>
      <Link to="/" className="mt-6 text-xs text-muted-foreground hover:text-primary">
        Voltar para a loja
      </Link>
    </div>
  );
}

function ProductForm({
  initial,
  onCancel,
  onSubmit,
}: {
  initial: FormState;
  onCancel: () => void;
  onSubmit: (data: FormState) => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleSize = (size: number) => {
    setForm((prev) => ({
      ...prev,
      sizes: prev.sizes.includes(size)
        ? prev.sizes.filter((s) => s !== size)
        : [...prev.sizes, size].sort((a, b) => a - b),
    }));
  };

  // As fotos são reduzidas no navegador antes do envio (até 1600 px), para o upload ser rápido.
  const readImage = async (file: File | undefined) => {
    if (!file) return null;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem válido.");
      return null;
    }
    try {
      return await compressImage(file);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível ler a imagem.");
      return null;
    }
  };
  const handleImageFile = async (file: File | undefined) => {
    const data = await readImage(file);
    if (data) set("image", data);
  };

  const updateColor = (key: number, patch: Partial<{ name: string; image: string }>) =>
    setForm((prev) => ({ ...prev, colors: prev.colors.map((c) => (c.key === key ? { ...c, ...patch } : c)) }));
  const removeColor = (key: number) => setForm((prev) => ({ ...prev, colors: prev.colors.filter((c) => c.key !== key) }));
  const addColor = () => setForm((prev) => ({ ...prev, colors: [...prev.colors, newColor()] }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Informe o nome do produto.");
    if (!form.price || Number(form.price.replace(",", ".")) <= 0)
      return toast.error("Informe um preço válido.");
    if (form.sizes.length === 0) return toast.error("Selecione ao menos um tamanho.");
    if (!form.image) return toast.error("Adicione uma imagem (upload ou URL).");
    const names = form.colors.map((c) => c.name.trim()).filter(Boolean);
    if (names.length !== form.colors.length) return toast.error("Dê um nome para cada cor (ou remova a cor vazia).");
    if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) return toast.error("Há cores com o mesmo nome.");
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Nome</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Velocity FG"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="line">Linha</Label>
          <Input
            id="line"
            value={form.line}
            onChange={(e) => set("line", e.target.value)}
            placeholder="Speed"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <Select value={form.category} onValueChange={(v) => set("category", v as Category)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="price">Preço (R$)</Label>
          <Input
            id="price"
            inputMode="decimal"
            value={form.price}
            onChange={(e) => set("price", e.target.value)}
            placeholder="899.90"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="oldPrice">Preço antigo (opcional)</Label>
          <Input
            id="oldPrice"
            inputMode="decimal"
            value={form.oldPrice}
            onChange={(e) => set("oldPrice", e.target.value)}
            placeholder="1099.90"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="tag">Etiqueta (opcional)</Label>
          <Input
            id="tag"
            value={form.tag}
            onChange={(e) => set("tag", e.target.value)}
            placeholder="Novo, Best-seller, Edição limitada..."
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="description">Descrição</Label>
          <Textarea
            id="description"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Cabedal ultraleve com travas cônicas para arranques explosivos..."
            rows={3}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <Label>Cores</Label>
          <Button type="button" variant="onDark" size="sm" onClick={addColor} disabled={form.colors.length >= 12}>
            <Plus /> Adicionar cor
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          O cliente escolhe entre estas cores. A primeira é a padrão. Cor sem foto usa a imagem principal.
        </p>
        <div className="mt-3 space-y-2">
          {form.colors.length === 0 && (
            <p className="border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              Nenhuma cor cadastrada. Clique em “Adicionar cor”.
            </p>
          )}
          {form.colors.map((c, i) => (
            <div key={c.key} className="flex items-center gap-3 border border-border p-2">
              <label
                className="relative flex size-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden border border-dashed border-input bg-secondary text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                title="Foto desta cor"
              >
                {c.image || form.image ? (
                  <img src={c.image || form.image} alt="" className={`size-full object-cover ${c.image ? "" : "opacity-40"}`} />
                ) : null}
                {!c.image && <ImagePlus className="absolute size-5" />}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label={`Foto da cor ${c.name || i + 1}`}
                  onChange={async (e) => {
                    const data = await readImage(e.target.files?.[0]);
                    if (data) updateColor(c.key, { image: data });
                    e.target.value = "";
                  }}
                />
              </label>
              <div className="min-w-0 flex-1">
                <Input
                  value={c.name}
                  maxLength={40}
                  onChange={(e) => updateColor(c.key, { name: e.target.value })}
                  placeholder={i === 0 ? "Ex.: Preto / Ouro" : "Ex.: Branco / Azul"}
                  aria-label={`Nome da cor ${i + 1}`}
                />
                <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                  {i === 0 && <span className="text-primary">Padrão</span>}
                  {c.image ? (
                    <button type="button" className="hover:text-foreground" onClick={() => updateColor(c.key, { image: "" })}>
                      Usar imagem principal
                    </button>
                  ) : (
                    <span>Usa a imagem principal</span>
                  )}
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remover cor ${c.name || i + 1}`} onClick={() => removeColor(c.key)}>
                <X />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label>Tamanhos disponíveis (BR)</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {ALL_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleSize(s)}
              className={`h-9 w-11 border font-display text-sm transition-colors ${
                form.sizes.includes(s)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-foreground hover:border-primary"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Imagem principal</Label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden border border-border bg-secondary">
            {form.image ? (
              <img src={form.image} alt="Pré-visualização" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[10px] text-muted-foreground">Sem imagem</span>
            )}
          </div>
          <div className="flex-1 space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void handleImageFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="onDark"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <Upload /> Enviar arquivo
            </Button>
            <p className="text-xs text-muted-foreground">ou cole uma URL de imagem:</p>
            <Input
              value={form.image.startsWith("data:") ? "" : form.image}
              onChange={(e) => set("image", e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>
      </div>

      <DialogFooter className="pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="volt">
          Salvar produto
        </Button>
      </DialogFooter>
    </form>
  );
}

function productToForm(p: Product): FormState {
  return {
    id: p.id,
    name: p.name,
    line: p.line,
    category: p.category,
    price: String(p.price),
    oldPrice: p.oldPrice ? String(p.oldPrice) : "",
    // foto igual à principal = a cor não tem foto própria
    colors: (p.colors ?? []).map((c) => newColor(c.name, c.image === p.image ? "" : c.image)),
    tag: p.tag ?? "",
    description: p.description,
    sizes: p.sizes,
    image: p.image,
  };
}

const STATUS_LABEL: Record<string, string> = {
  CREATED: "Criado", AWAITING_PAYMENT: "Aguardando pagamento", IN_ANALYSIS: "Em análise", PAID: "Pago",
  DECLINED: "Recusado", CANCELED: "Cancelado", EXPIRED: "Expirado", REFUNDED: "Reembolsado", ERROR: "Erro no checkout",
  VERIFICATION_ERROR: "Divergência — verificar",
};

type AdminOrder = {
  id: number; number: string; status: string; total: number; createdAt: string; paidAt: string | null;
  items: { name: string; color?: string | null; size: number; quantity: number }[]; paymentId: string | null; lastError: string | null;
  manualStatus: boolean;
};

// Status que podem ser escolhidos à mão (ex.: cliente pagou em dinheiro na entrega).
const EDITABLE_STATUSES = ["AWAITING_PAYMENT", "PAID", "CANCELED", "REFUNDED", "EXPIRED", "DECLINED"];

function OrderStatusCell({ order, onChanged }: { order: AdminOrder; onChanged: (o: AdminOrder) => void }) {
  const [pending, setPending] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const options = EDITABLE_STATUSES.includes(order.status) ? EDITABLE_STATUSES : [order.status, ...EDITABLE_STATUSES];
  const tone = order.status === "PAID" ? "text-primary" : order.status === "VERIFICATION_ERROR" ? "text-destructive" : "";

  const save = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      const r = await api<{ order: AdminOrder }>(`/api/admin/orders/${order.id}/status`, {
        method: "PATCH",
        json: { status: pending },
      });
      onChanged(r.order);
      toast.success("Status atualizado", { description: `${order.number}: ${STATUS_LABEL[pending] ?? pending}` });
      setPending(null);
    } catch (e) {
      toast.error("Não foi possível alterar", { description: e instanceof Error ? e.message : undefined });
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label={`Status do pedido ${order.number}`}
        value={order.status}
        disabled={saving}
        onChange={(e) => e.target.value !== order.status && setPending(e.target.value)}
        className={`h-9 w-full min-w-44 border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${tone}`}
      >
        {options.map((s) => (
          <option key={s} value={s} disabled={!EDITABLE_STATUSES.includes(s)}>
            {STATUS_LABEL[s] ?? s}
          </option>
        ))}
      </select>
      {order.manualStatus && <span className="text-[11px] text-muted-foreground">Alterado manualmente</span>}

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && !saving && setPending(null)}>
        <AlertDialogContent className="bg-surface text-surface-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl">Alterar status de {order.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              De <strong>{STATUS_LABEL[order.status] ?? order.status}</strong> para{" "}
              <strong>{pending ? (STATUS_LABEL[pending] ?? pending) : ""}</strong>.
              {pending === "PAID" &&
                " Use quando o cliente pagar fora do site (ex.: em dinheiro). A página do pedido passa a mostrar o botão do WhatsApp."}
              {pending === "REFUNDED" && " Isto não devolve o dinheiro no Mercado Pago: faça o reembolso pelo painel de lá."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              {saving ? "Salvando…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DeleteOrderButton({ order, onDeleted }: { order: AdminOrder; onDeleted: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const paid = order.status === "PAID";

  const confirm = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/orders/${order.id}`, { method: "DELETE" });
      onDeleted(order.id);
      toast.success("Pedido excluído", { description: order.number });
      setOpen(false);
    } catch (e) {
      toast.error("Não foi possível excluir", { description: e instanceof Error ? e.message : undefined });
    }
    setBusy(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Excluir pedido ${order.number}`}
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 />
      </Button>
      <AlertDialogContent className="bg-surface text-surface-foreground">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-2xl">Excluir {order.number}?</AlertDialogTitle>
          <AlertDialogDescription>
            O pedido some do painel e a página dele deixa de abrir para o cliente. Isso não pode ser desfeito.
            {paid && (
              <>
                {" "}
                <strong className="text-foreground">Este pedido está pago:</strong> excluir aqui não devolve o dinheiro.
                Se precisar reembolsar, faça pelo painel do Mercado Pago.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            {busy ? "Excluindo…" : "Excluir pedido"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AdminOrders() {
  const [rows, setRows] = useState<AdminOrder[] | null>(null);
  useEffect(() => {
    api<{ orders: AdminOrder[] }>("/api/admin/orders").then((r) => setRows(r.orders)).catch(() => setRows([]));
  }, []);
  if (!rows) return <p className="mt-6 text-sm text-muted-foreground">Carregando…</p>;
  return (
    <div className="mt-4 overflow-x-auto border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pedido</TableHead>
            <TableHead>Itens</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Criado em</TableHead>
            <TableHead className="w-12 text-right">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((o) => (
            <TableRow key={o.id}>
              <TableCell className="font-display">{o.number}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {o.items.map((i) => `${i.quantity}x ${i.name}${i.color ? ` – ${i.color}` : ""} (${i.size})`).join(", ")}
              </TableCell>
              <TableCell>{formatPrice(o.total)}</TableCell>
              <TableCell>
                <OrderStatusCell order={o} onChanged={(n) => setRows((prev) => prev?.map((x) => (x.id === n.id ? n : x)) ?? prev)} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleString("pt-BR")}</TableCell>
              <TableCell className="text-right">
                <DeleteOrderButton order={o} onDeleted={(id) => setRows((prev) => prev?.filter((x) => x.id !== id) ?? prev)} />
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Nenhum pedido ainda.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

type AdminFeedbackRow = {
  id: number;
  rating: number;
  comment: string;
  name: string | null;
  email: string | null;
  model: string | null;
  images: string[];
  createdAt: string;
};

function AdminFeedback() {
  const [rows, setRows] = useState<AdminFeedbackRow[] | null>(null);
  useEffect(() => {
    api<{ feedback: AdminFeedbackRow[] }>("/api/admin/feedback").then((r) => setRows(r.feedback)).catch(() => setRows([]));
  }, []);
  if (!rows) return <p className="mt-6 text-sm text-muted-foreground">Carregando…</p>;
  if (rows.length === 0) return <p className="mt-6 text-sm text-muted-foreground">Nenhuma avaliação ainda.</p>;
  const avg = rows.reduce((s, r) => s + r.rating, 0) / rows.length;
  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-muted-foreground">
        Média: <span className="font-display text-lg text-primary">{avg.toFixed(1)}</span> / 5 · {rows.length} avaliações
      </p>
      {rows.map((r) => (
        <div key={r.id} className="border border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="flex">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={`size-4 ${n <= r.rating ? "fill-primary text-primary" : "text-muted-foreground/40"}`} />
              ))}
            </span>
            <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString("pt-BR")}</span>
          </div>
          {r.model && (
            <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-primary">Modelo: {r.model}</p>
          )}
          <p className="mt-2 whitespace-pre-wrap text-sm">{r.comment}</p>
          {r.images?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {r.images.map((src) => (
                <a key={src} href={src} target="_blank" rel="noreferrer">
                  <img src={src} alt="Foto enviada pelo cliente" loading="lazy" className="size-24 border border-border object-cover" />
                </a>
              ))}
            </div>
          )}
          {(r.name || r.email) && (
            <p className="mt-2 text-xs text-muted-foreground">{[r.name, r.email].filter(Boolean).join(" · ")}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function AdminPanel() {
  const { products, addProduct, updateProduct, removeProduct } = useProducts();
  const [tab, setTab] = useState<"produtos" | "pedidos" | "avaliacoes">("produtos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const sorted = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setDialogOpen(true);
  };

  const handleSubmit = async (data: FormState) => {
    const isUpload = data.image.startsWith("data:");
    const payload = {
      name: data.name.trim(),
      line: data.line.trim(),
      category: data.category,
      price: Number(data.price.replace(",", ".")),
      oldPrice: data.oldPrice ? Number(data.oldPrice.replace(",", ".")) : null,
      ...(isUpload ? { imageData: data.image } : { image: data.image }),
      colorway: data.colors[0]?.name.trim() ?? "",
      colors: data.colors.map((c) =>
        c.image.startsWith("data:")
          ? { name: c.name.trim(), imageData: c.image }
          : { name: c.name.trim(), image: c.image || null },
      ),
      tag: data.tag.trim() || null,
      description: data.description.trim(),
      sizes: data.sizes,
    };

    try {
      if (editing) {
        await updateProduct(editing.id, payload);
        toast.success("Produto atualizado.");
      } else {
        await addProduct(payload);
        toast.success("Produto adicionado.");
      }
      setDialogOpen(false);
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-primary">Painel administrativo</p>
          <h1 className="mt-2 text-4xl sm:text-5xl">Catálogo de chuteiras</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {products.length} {products.length === 1 ? "produto cadastrado" : "produtos cadastrados"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="onDark"
            onClick={async () => {
              await api("/api/admin/logout", { method: "POST" }).catch(() => undefined);
              window.location.reload();
            }}
          >
            <LogOut /> Sair
          </Button>
          <Button variant="volt" onClick={openNew}>
            <Plus /> Novo produto
          </Button>
        </div>
      </div>

      <div className="mt-8 flex gap-2">
        {(
          [
            ["produtos", "Produtos"],
            ["pedidos", "Pedidos"],
            ["avaliacoes", "Avaliações"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`eyebrow border px-4 py-2 transition-colors ${
              tab === k ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "pedidos" && <AdminOrders />}
      {tab === "avaliacoes" && <AdminFeedback />}
      {tab === "produtos" && (
      <div className="mt-4 overflow-hidden border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Tamanhos</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <img
                      src={p.image}
                      alt={p.name}
                      className="h-12 w-12 shrink-0 border border-border object-cover"
                    />
                    <div>
                      <p className="font-display text-sm leading-tight">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(p.colors?.length ?? 0) > 1 ? p.colors.map((c) => c.name).join(" · ") : p.colorway}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.category}</TableCell>
                <TableCell className="text-sm">
                  <span className="font-medium text-primary">{formatPrice(p.price)}</span>
                  {p.oldPrice && (
                    <span className="ml-2 text-xs text-muted-foreground line-through">
                      {formatPrice(p.oldPrice)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {p.sizes.join(", ")}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => openEdit(p)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remover"
                      onClick={() => setDeleteTarget(p)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum produto cadastrado. Clique em "Novo produto" para começar.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {editing ? "Editar produto" : "Novo produto"}
            </DialogTitle>
          </DialogHeader>
          <ProductForm
            initial={editing ? productToForm(editing) : emptyForm}
            onCancel={() => setDialogOpen(false)}
            onSubmit={handleSubmit}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover produto?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso vai remover "{deleteTarget?.name}" do catálogo permanentemente. Essa ação não
              pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleteTarget) {
                  try {
                    await removeProduct(deleteTarget.id);
                    toast.success("Produto removido.");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Não foi possível remover.");
                  }
                }
                setDeleteTarget(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function Admin() {
  const [state, setState] = useState<"loading" | "locked" | "open">("loading");

  useEffect(() => {
    api<{ authenticated: boolean }>("/api/admin/session")
      .then((r) => setState(r.authenticated ? "open" : "locked"))
      .catch(() => setState("locked"));
  }, []);

  if (state === "loading") return <div className="py-24 text-center text-muted-foreground">Carregando…</div>;
  if (state === "locked") return <AdminGate onUnlock={() => setState("open")} />;
  return <AdminPanel />;
}
