import { useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Lock, Pencil, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
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

// Senha simples apenas para evitar acesso casual a esta tela.
// Isso NÃO é segurança de verdade (roda só no navegador) — troque o valor abaixo
// à vontade, ou substitua por login real caso este site vá para produção.
const ADMIN_PASSWORD = "tnsports2026";
const AUTH_KEY = "tn-sports-admin-auth";

const ALL_SIZES = Array.from({ length: 12 }, (_, i) => 34 + i); // 34..45

type FormState = {
  id: string;
  name: string;
  line: string;
  category: Category;
  price: string;
  oldPrice: string;
  colorway: string;
  tag: string;
  description: string;
  sizes: number[];
  image: string;
};

const emptyForm: FormState = {
  id: "",
  name: "",
  line: "",
  category: "Campo",
  price: "",
  oldPrice: "",
  colorway: "",
  tag: "",
  description: "",
  sizes: [],
  image: "",
};

function AdminGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (value === ADMIN_PASSWORD) {
      window.sessionStorage.setItem(AUTH_KEY, "1");
      onUnlock();
    } else {
      setError(true);
    }
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
            setError(false);
          }}
          placeholder="Senha"
          autoFocus
        />
        {error && <p className="text-xs text-destructive">Senha incorreta.</p>}
        <Button type="submit" variant="volt" size="xl" className="w-full">
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

  const handleImageFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem válido.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set("image", reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Informe o nome do produto.");
    if (!form.price || Number(form.price.replace(",", ".")) <= 0)
      return toast.error("Informe um preço válido.");
    if (form.sizes.length === 0) return toast.error("Selecione ao menos um tamanho.");
    if (!form.image) return toast.error("Adicione uma imagem (upload ou URL).");
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
          <Label htmlFor="colorway">Cor</Label>
          <Input
            id="colorway"
            value={form.colorway}
            onChange={(e) => set("colorway", e.target.value)}
            placeholder="Preto / Ouro"
          />
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
        <Label>Imagem</Label>
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
              onChange={(e) => handleImageFile(e.target.files?.[0])}
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
    colorway: p.colorway,
    tag: p.tag ?? "",
    description: p.description,
    sizes: p.sizes,
    image: p.image,
  };
}

function AdminPanel() {
  const { products, addProduct, updateProduct, removeProduct, resetToDefaults } = useProducts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

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

  const handleSubmit = (data: FormState) => {
    const payload = {
      name: data.name.trim(),
      line: data.line.trim(),
      category: data.category,
      price: Number(data.price.replace(",", ".")),
      oldPrice: data.oldPrice ? Number(data.oldPrice.replace(",", ".")) : undefined,
      image: data.image,
      colorway: data.colorway.trim(),
      tag: data.tag.trim() || undefined,
      description: data.description.trim(),
      sizes: data.sizes,
    };

    if (editing) {
      updateProduct(editing.id, payload);
      toast.success("Produto atualizado.");
    } else {
      addProduct(payload);
      toast.success("Produto adicionado.");
    }
    setDialogOpen(false);
    setEditing(null);
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
          <Button variant="onDark" onClick={() => setResetOpen(true)}>
            <RotateCcw /> Restaurar padrão
          </Button>
          <Button variant="volt" onClick={openNew}>
            <Plus /> Novo produto
          </Button>
        </div>
      </div>

      <div className="mt-8 overflow-hidden border border-border">
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
                      <p className="text-xs text-muted-foreground">{p.colorway}</p>
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
              onClick={() => {
                if (deleteTarget) {
                  removeProduct(deleteTarget.id);
                  toast.success("Produto removido.");
                }
                setDeleteTarget(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar catálogo padrão?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as alterações feitas (produtos adicionados, editados ou removidos) serão
              perdidas e o catálogo original será restaurado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                resetToDefaults();
                toast.success("Catálogo restaurado ao padrão.");
                setResetOpen(false);
              }}
            >
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function Admin() {
  const [unlocked, setUnlocked] = useState(
    () => window.sessionStorage.getItem(AUTH_KEY) === "1",
  );

  if (!unlocked) return <AdminGate onUnlock={() => setUnlocked(true)} />;
  return <AdminPanel />;
}
