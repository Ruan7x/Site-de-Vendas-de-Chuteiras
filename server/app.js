import fs from "node:fs";
import path from "node:path";
import express from "express";
import { z, ZodError } from "zod";
import { productToApi } from "./db.js";
import { ADMIN_STATUSES, HttpError, createOrdersService } from "./orders.js";
import { createMercadoPagoClient } from "./mercadopago.js";
import { IMAGE_NAME_RE, decodeDataUrlImage, saveDataUrlImage, writeImage } from "./uploads.js";
import {
  PUBLIC_ID_RE, createRateLimiter, parseCookies, safeEqual, sha256Hex, signSession, verifySession,
} from "./security.js";

const CATEGORIES = ["Campo", "Society"];
const SESSION_COOKIE = "tn_admin";
const SESSION_TTL = 8 * 3600_000;

const productSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    line: z.string().trim().max(60).default(""),
    category: z.enum(CATEGORIES),
    price: z.number().positive().max(99999),
    oldPrice: z.number().positive().max(99999).nullish(),
    colorway: z.string().trim().max(80).default(""),
    colors: z
      .array(
        z.object({
          name: z.string().trim().min(1, "Dê um nome para cada cor.").max(40),
          image: z.string().max(500).nullish(),
          imageData: z.string().max(6_000_000).nullish(),
        }),
      )
      .max(12)
      .optional(),
    tag: z.string().trim().max(40).nullish(),
    description: z.string().trim().max(1000).default(""),
    sizes: z.array(z.number().int().min(20).max(60)).min(1).max(30),
    image: z.string().max(500).optional(),
    imageData: z.string().max(6_000_000).optional(),
  })
  .refine((d) => d.image || d.imageData, { message: "Imagem obrigatória" });

const feedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(5).max(1000),
  name: z.string().trim().max(80).optional(),
  email: z.union([z.literal(""), z.string().trim().max(120).email()]).optional(),
  model: z.string().trim().max(100).optional(),
  images: z.array(z.string().max(4_500_000)).max(3).optional(),
  website: z.string().max(200).optional(), // honeypot
  elapsedMs: z.number().int().min(0).optional(),
});

const clean = (s) => (s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
const slugify = (v) =>
  v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "").slice(0, 60);
const validImageRef = (s) => (s.startsWith("/") && !s.startsWith("//")) || /^https:\/\//.test(s);

const escapeAttr = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Troca título e metatags Open Graph do index.html pelos dados do produto. */
export function withProductPreview(html, product, publicUrl, colorName) {
  const abs = (u) => (/^https?:\/\//.test(u) ? u : `${publicUrl}${u.startsWith("/") ? "" : "/"}${u}`);
  // ?cor= na URL (ex.: link do WhatsApp) mostra a foto e o nome daquela cor
  const color = product.colors?.find((c) => c.name === colorName);
  const colorway = color?.name ?? product.colorway;
  const imageUrl = color?.image ?? product.image;
  const title = `${product.name} – ${colorway} | TN Sports`;
  const price = product.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const desc = `Chuteira ${product.category} ${product.name}, ${colorway}. ${price}.`;
  const tags = [
    ["og:title", title],
    ["og:description", desc],
    ["og:type", "product"],
    ["og:url", `${publicUrl}/produtos/${encodeURIComponent(product.id)}${color ? `?cor=${encodeURIComponent(color.name)}` : ""}`],
    ["og:image", abs(imageUrl)],
    ["og:image:alt", `Chuteira ${product.name} na cor ${colorway}`],
  ]
    .map(([k, v]) => `<meta property="${k}" content="${escapeAttr(v)}" />`)
    .join("\n    ");
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeAttr(title)}</title>`)
    .replace(/\s*<meta\s+property="og:[^"]*"[\s\S]*?\/>/g, "")
    .replace("</head>", `    ${tags}\n    <meta name="twitter:image" content="${escapeAttr(abs(imageUrl))}" />\n  </head>`);
}

/** Avaliação como aparece no site: sem e-mail, IP ou outros dados internos. */
export const publicReview = (r) => ({
  id: r.id,
  name: r.name || null,
  rating: r.rating,
  comment: r.comment,
  model: r.model || null,
  images: JSON.parse(r.images || "[]").map((n) => `/api/feedback-images/${n}`),
  createdAt: r.created_at,
});

export function createApp({ db, config, mp, log = console }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  const orders = createOrdersService({ db, config, mp, log });
  app.locals.orders = orders;

  app.use((req, res, next) => {
    res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY" });
    next();
  });

  const limit = (windowMs, max, key) => createRateLimiter({ windowMs, max, key });
  const rl = {
    orderCreate: limit(60_000, 10), orderRead: limit(60_000, 120), orderRetry: limit(60_000, 10), pix: limit(60_000, 10),
    webhook: limit(60_000, 600), login: limit(15 * 60_000, 10), admin: limit(60_000, 120),
    feedbackAttempts: limit(3600_000, 60), feedbackStored: limit(3600_000, 5), feedbackGlobal: limit(3600_000, 200, () => "all"),
  };

  // ---------- webhook Mercado Pago ----------
  app.post("/api/webhooks/mercadopago", rl.webhook, express.raw({ type: () => true, limit: "200kb" }), async (req, res, next) => {
    try {
      const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
      const out = await orders.handleWebhook(raw, req.headers, req.query);
      res.status(out.code).json(out.body);
    } catch (e) { next(e); }
  });

  // ---------- feedback (antes do parser global: aceita fotos em base64, até 3 de 2,5 MB) ----------
  app.post("/api/feedback", rl.feedbackAttempts, express.json({ limit: "12mb" }), (req, res) => {
    const d = feedbackSchema.parse(req.body);
    if (d.website) return res.status(201).json({ ok: true }); // bot: finge sucesso, não grava
    if (d.elapsedMs !== undefined && d.elapsedMs < 1500)
      throw new HttpError(429, "too_fast", "Envio rápido demais. Revise o formulário e tente novamente.");
    // Valida todas as fotos ANTES de gastar cota ou gravar qualquer arquivo.
    const decoded = (d.images ?? []).map((img) => decodeDataUrlImage(img, 2.5 * 1024 * 1024));
    // Limites por IP (5/h) e globais (200/h) contam apenas envios válidos.
    const wait = rl.feedbackStored.consume(req.ip) || rl.feedbackGlobal.consume("all");
    if (wait) throw new HttpError(429, "rate_limited", "Você já enviou várias avaliações. Tente novamente mais tarde.");
    const ipHash = sha256Hex(`${req.ip}|${config.sessionSecret}`).slice(0, 32);
    const comment = clean(d.comment);
    const dup = db
      .prepare("SELECT * FROM feedback WHERE ip_hash=? AND comment=? AND created_at > ?")
      .get(ipHash, comment, new Date(Date.now() - 86_400_000).toISOString());
    let row = dup;
    if (!dup) {
      const names = decoded.map((img) => writeImage(img, config.feedbackDir));
      const r = db.prepare("INSERT INTO feedback (rating,comment,name,email,model,images,ip_hash,created_at) VALUES (?,?,?,?,?,?,?,?)").run(
        d.rating, comment, clean(d.name) || null, clean(d.email) || null, clean(d.model) || null,
        JSON.stringify(names), ipHash, new Date().toISOString(),
      );
      row = db.prepare("SELECT * FROM feedback WHERE id=?").get(r.lastInsertRowid);
    }
    // devolve a avaliação como ela aparece no site, para a pessoa já ver a dela na lista
    res.status(201).json({ ok: true, review: row && !row.hidden ? publicReview(row) : null });
  });

  // ---------- admin (sessão assinada em cookie HttpOnly) ----------
  const admin = express.Router();
  admin.use(express.json({ limit: "25mb" })); // foto principal + fotos das cores
  const isAdmin = (req) => verifySession(config.sessionSecret, parseCookies(req.headers.cookie)[SESSION_COOKIE]);
  const sameOrigin = (req) => {
    const o = req.get("origin");
    if (!o) return true;
    try {
      const h = new URL(o).host;
      return h === req.get("host") || h === new URL(config.publicUrl).host;
    } catch { return false; }
  };
  const cookieOpts = () => `Path=/; HttpOnly; SameSite=Strict${config.secureCookies ? "; Secure" : ""}`;

  admin.post("/login", rl.login, (req, res) => {
    if (!sameOrigin(req)) throw new HttpError(403, "bad_origin", "Origem não permitida.");
    if (!config.adminPassword) throw new HttpError(503, "admin_disabled", "Defina ADMIN_PASSWORD no servidor para habilitar o painel.");
    const pw = typeof req.body?.password === "string" ? req.body.password : "";
    if (!safeEqual(pw, config.adminPassword)) throw new HttpError(401, "invalid_credentials", "Senha incorreta.");
    res.set("Set-Cookie", `${SESSION_COOKIE}=${signSession(config.sessionSecret, SESSION_TTL)}; ${cookieOpts()}; Max-Age=${SESSION_TTL / 1000}`);
    res.json({ ok: true });
  });
  admin.post("/logout", (req, res) => {
    res.set("Set-Cookie", `${SESSION_COOKIE}=; ${cookieOpts()}; Max-Age=0`);
    res.json({ ok: true });
  });
  admin.get("/session", (req, res) => res.json({ authenticated: isAdmin(req) }));

  admin.use(rl.admin, (req, res, next) => {
    if (!isAdmin(req)) throw new HttpError(401, "unauthorized", "Faça login para continuar.");
    if (req.method !== "GET" && !sameOrigin(req)) throw new HttpError(403, "bad_origin", "Origem não permitida.");
    next();
  });

  const uniqueProductId = (name) => {
    const base = slugify(name) || "chuteira";
    let id = base;
    for (let n = 2; db.prepare("SELECT 1 FROM products WHERE id=?").get(id); n++) id = `${base}-${n}`;
    return id;
  };
  const productValues = (d) => {
    const image = d.imageData ? saveDataUrlImage(d.imageData, config.uploadsDir) : d.image;
    if (!validImageRef(image)) throw new HttpError(422, "invalid_image", "URL de imagem inválida (use https:// ou um arquivo enviado).");
    // cores que o cliente escolhe; cada uma pode ter foto própria
    let colors = (d.colors ?? []).map((c) => {
      const img = c.imageData ? saveDataUrlImage(c.imageData, config.uploadsDir) : c.image && c.image !== image ? c.image : null;
      if (img && !validImageRef(img)) throw new HttpError(422, "invalid_image", `Foto inválida na cor ${c.name}.`);
      return { name: clean(c.name), image: img };
    });
    if (colors.length === 0 && clean(d.colorway)) colors = [{ name: clean(d.colorway), image: null }];
    const seen = new Set();
    for (const c of colors) {
      const k = c.name.toLocaleLowerCase("pt-BR");
      if (seen.has(k)) throw new HttpError(422, "duplicate_color", `A cor "${c.name}" está repetida.`);
      seen.add(k);
    }
    return {
      name: clean(d.name), line: clean(d.line), category: d.category,
      price_cents: Math.round(d.price * 100), old_price_cents: d.oldPrice ? Math.round(d.oldPrice * 100) : null,
      image, colorway: colors[0]?.name ?? "", colors: JSON.stringify(colors), tag: clean(d.tag) || null, description: clean(d.description),
      sizes: JSON.stringify([...new Set(d.sizes)].sort((a, b) => a - b)),
    };
  };

  admin.post("/products", (req, res) => {
    const v = productValues(productSchema.parse(req.body));
    const id = uniqueProductId(v.name);
    const now = new Date().toISOString();
    const pos = db.prepare("SELECT COALESCE(MAX(position),-1)+1 AS p FROM products").get().p;
    db.prepare(
      `INSERT INTO products (id,name,line,category,price_cents,old_price_cents,image,colorway,colors,tag,description,sizes,position,created_at,updated_at)
       VALUES (@id,@name,@line,@category,@price_cents,@old_price_cents,@image,@colorway,@colors,@tag,@description,@sizes,@pos,@now,@now)`,
    ).run({ ...v, id, pos, now });
    res.status(201).json(productToApi(db.prepare("SELECT * FROM products WHERE id=?").get(id)));
  });
  admin.put("/products/:id", (req, res) => {
    if (!db.prepare("SELECT 1 FROM products WHERE id=?").get(req.params.id)) throw new HttpError(404, "not_found", "Produto não encontrado.");
    const v = productValues(productSchema.parse(req.body));
    db.prepare(
      `UPDATE products SET name=@name,line=@line,category=@category,price_cents=@price_cents,old_price_cents=@old_price_cents,
       image=@image,colorway=@colorway,colors=@colors,tag=@tag,description=@description,sizes=@sizes,updated_at=@now WHERE id=@id`,
    ).run({ ...v, id: req.params.id, now: new Date().toISOString() });
    res.json(productToApi(db.prepare("SELECT * FROM products WHERE id=?").get(req.params.id)));
  });
  admin.delete("/products/:id", (req, res) => {
    const r = db.prepare("DELETE FROM products WHERE id=?").run(req.params.id);
    if (!r.changes) throw new HttpError(404, "not_found", "Produto não encontrado.");
    res.json({ ok: true });
  });
  admin.patch("/orders/:id/status", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(404, "order_not_found", "Pedido não encontrado.");
    const { status } = z.object({ status: z.enum(ADMIN_STATUSES) }).parse(req.body);
    res.json({ order: orders.adminSetStatus(id, status) });
  });
  admin.delete("/orders/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(404, "order_not_found", "Pedido não encontrado.");
    res.json(orders.adminDeleteOrder(id));
  });
  admin.get("/orders", async (req, res) => {
    // confere os pendentes recentes antes de listar (limitado para a tela não demorar)
    await orders.reconcilePending({ minIntervalMs: 10_000, limit: 10 }).catch(() => {});
    res.json({ orders: orders.listOrders() });
  });
  admin.get("/feedback", (req, res) => {
    const rows = db
      .prepare("SELECT id,rating,comment,name,email,model,images,hidden,created_at AS createdAt FROM feedback ORDER BY id DESC LIMIT 500")
      .all();
    res.json({
      feedback: rows.map(({ images, hidden, ...r }) => ({
        ...r,
        hidden: hidden === 1,
        images: JSON.parse(images || "[]").map((n) => `/api/admin/feedback-images/${n}`),
      })),
    });
  });
  // Moderação: ocultar/mostrar no site e excluir (apaga também as fotos)
  admin.patch("/feedback/:id", (req, res) => {
    const { hidden } = z.object({ hidden: z.boolean() }).parse(req.body);
    const r = db.prepare("UPDATE feedback SET hidden=? WHERE id=?").run(hidden ? 1 : 0, Number(req.params.id));
    if (!r.changes) throw new HttpError(404, "not_found", "Avaliação não encontrada.");
    res.json({ ok: true, hidden });
  });
  admin.delete("/feedback/:id", (req, res) => {
    const row = db.prepare("SELECT images FROM feedback WHERE id=?").get(Number(req.params.id));
    if (!row) throw new HttpError(404, "not_found", "Avaliação não encontrada.");
    db.prepare("DELETE FROM feedback WHERE id=?").run(Number(req.params.id));
    for (const n of JSON.parse(row.images || "[]")) {
      if (IMAGE_NAME_RE.test(n)) fs.rm(path.join(config.feedbackDir, n), { force: true }, () => {});
    }
    res.json({ ok: true });
  });
  // Fotos dos clientes no admin (inclui avaliações ocultas; nome validado contra path traversal).
  admin.get("/feedback-images/:name", (req, res) => {
    if (!IMAGE_NAME_RE.test(req.params.name)) throw new HttpError(404, "not_found", "Imagem não encontrada.");
    res.set({ "Cache-Control": "private, max-age=3600", "Content-Security-Policy": "default-src 'none'; sandbox" });
    res.sendFile(req.params.name, { root: config.feedbackDir, dotfiles: "deny" }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: "not_found", message: "Imagem não encontrada." });
    });
  });
  app.use("/api/admin", admin);

  // ---------- público ----------
  app.use(express.json({ limit: "20kb" }));

  // Avaliações publicadas (mais novas primeiro) + resumo; nunca expõe e-mail
  app.get("/api/feedback", rl.orderRead, (req, res) => {
    const limitN = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? "6"), 10) || 6, 1), 24);
    const offset = Math.max(Number.parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const rows = db.prepare("SELECT * FROM feedback WHERE hidden=0 ORDER BY id DESC LIMIT ? OFFSET ?").all(limitN + 1, offset);
    const s = db.prepare("SELECT COUNT(*) AS count, AVG(rating) AS avg FROM feedback WHERE hidden=0").get();
    res.set("Cache-Control", "no-store");
    res.json({
      reviews: rows.slice(0, limitN).map(publicReview),
      hasMore: rows.length > limitN,
      summary: { count: s.count, average: s.count ? Math.round(s.avg * 10) / 10 : 0 },
    });
  });
  // Fotos públicas: só de avaliações visíveis (ocultar a avaliação esconde as fotos também)
  app.get("/api/feedback-images/:name", rl.orderRead, (req, res) => {
    const name = req.params.name;
    const visible = IMAGE_NAME_RE.test(name) && db.prepare("SELECT 1 FROM feedback WHERE hidden=0 AND images LIKE ?").get(`%"${name}"%`);
    if (!visible) return res.status(404).json({ error: "not_found", message: "Imagem não encontrada." });
    res.set({ "Cache-Control": "public, max-age=3600", "Content-Security-Policy": "default-src 'none'; sandbox", "X-Content-Type-Options": "nosniff" });
    res.sendFile(name, { root: config.feedbackDir, dotfiles: "deny" }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: "not_found", message: "Imagem não encontrada." });
    });
  });

  app.get("/api/health", (req, res) => res.json({ ok: true, payments: mp.configured, env: config.mpEnv }));
  app.get("/api/products", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ products: db.prepare("SELECT * FROM products ORDER BY position, created_at").all().map(productToApi) });
  });

  app.post("/api/orders", rl.orderCreate, async (req, res, next) => {
    try { res.status(201).json(await orders.createOrder(req.body)); } catch (e) { next(e); }
  });
  app.get("/api/orders/:publicId", rl.orderRead, async (req, res, next) => {
    try {
      if (!PUBLIC_ID_RE.test(req.params.publicId)) throw new HttpError(404, "not_found", "Pedido não encontrado.");
      const hint = typeof req.query.payment_id === "string" ? req.query.payment_id : undefined;
      const view = await orders.getPublicView(req.params.publicId, hint);
      if (!view) throw new HttpError(404, "not_found", "Pedido não encontrado.");
      res.set("Cache-Control", "no-store");
      res.json(view);
    } catch (e) { next(e); }
  });
  // Pix dentro do site: gera (ou reaproveita) o QR code do pedido
  app.post("/api/orders/:publicId/pix", rl.pix, async (req, res, next) => {
    try {
      if (!PUBLIC_ID_RE.test(req.params.publicId)) throw new HttpError(404, "not_found", "Pedido não encontrado.");
      const { email } = z.object({ email: z.string().trim().toLowerCase().max(120).email("Informe um e-mail válido.") }).parse(req.body);
      res.json({ pix: await orders.createPix(req.params.publicId, email) });
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/orders/:publicId/pix.png", rl.orderRead, (req, res) => {
    const img = PUBLIC_ID_RE.test(req.params.publicId) ? orders.pixImage(req.params.publicId) : null;
    if (!img) return res.status(404).json({ error: "not_found", message: "QR code indisponível." });
    res.type("png").setHeader("Cache-Control", "private, max-age=300").send(img);
  });
  // Cartão ou boleto: link da página do Mercado Pago (reaproveita ou cria um novo)
  app.post("/api/orders/:publicId/card", rl.orderRetry, async (req, res, next) => {
    try {
      if (!PUBLIC_ID_RE.test(req.params.publicId)) throw new HttpError(404, "not_found", "Pedido não encontrado.");
      res.json(await orders.cardCheckout(req.params.publicId));
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/orders/:publicId/retry", rl.orderRetry, async (req, res, next) => {
    try {
      if (!PUBLIC_ID_RE.test(req.params.publicId)) throw new HttpError(404, "not_found", "Pedido não encontrado.");
      res.json(await orders.retryOrder(req.params.publicId));
    } catch (e) { next(e); }
  });

  app.use("/api", (req, res) => res.status(404).json({ error: "not_found", message: "Rota não encontrada." }));

  // ---------- arquivos estáticos ----------
  app.use("/uploads", express.static(config.uploadsDir, { maxAge: "7d", fallthrough: false, index: false }));
  if (fs.existsSync(config.distDir)) {
    app.use(express.static(config.distDir, { index: false, maxAge: "1h" }));
    const indexHtml = fs.readFileSync(path.join(config.distDir, "index.html"), "utf8");
    app.use((req, res, next) => {
      if (req.method !== "GET") return next();
      // Na página de um produto, a prévia do link (WhatsApp, redes sociais) mostra a foto e o nome dele.
      const m = /^\/produtos\/([^/]+)\/?$/.exec(req.path);
      const p = m ? db.prepare("SELECT * FROM products WHERE id=?").get(decodeURIComponent(m[1])) : null;
      res.type("html").setHeader("Cache-Control", "no-cache");
      const cor = typeof req.query.cor === "string" ? req.query.cor : undefined;
      res.send(p ? withProductPreview(indexHtml, productToApi(p), config.publicUrl, cor) : indexHtml);
    });
  }

  // ---------- erros ----------
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof ZodError)
      return res.status(400).json({ error: "validation_error", message: "Dados inválidos.", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "too_large", message: "Requisição grande demais." });
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "invalid_json", message: "JSON inválido." });
    if (err?.code === "ENOENT" || err?.status === 404) return res.status(404).json({ error: "not_found" });
    log.error("[erro]", err);
    res.status(500).json({ error: "server_error", message: "Erro interno. Tente novamente." });
  });

  return app;
}

export { createMercadoPagoClient };
