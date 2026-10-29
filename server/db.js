import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SEED_PRODUCTS } from "./seed-products.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS products (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  line            TEXT NOT NULL DEFAULT '',
  category        TEXT NOT NULL,
  price_cents     INTEGER NOT NULL CHECK (price_cents > 0),
  old_price_cents INTEGER,
  image           TEXT NOT NULL,
  colorway        TEXT NOT NULL DEFAULT '',
  tag             TEXT,
  description     TEXT NOT NULL DEFAULT '',
  sizes           TEXT NOT NULL,
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id           TEXT NOT NULL UNIQUE,   -- token imprevisível usado na URL/consulta
  reference_id        TEXT NOT NULL UNIQUE,   -- enviado ao PagBank como reference_id
  idempotency_key     TEXT UNIQUE,
  user_id             TEXT,                   -- reservado: o site ainda não tem login
  status              TEXT NOT NULL,          -- CREATED|AWAITING_PAYMENT|IN_ANALYSIS|PAID|DECLINED|CANCELED|EXPIRED|ERROR|VERIFICATION_ERROR
  total_cents         INTEGER NOT NULL,       -- calculado no servidor
  items_json          TEXT NOT NULL,          -- snapshot: [{productId,name,size,quantity,unitCents}]
  provider_checkout_id TEXT,                  -- id da preferência (Mercado Pago)
  provider_pay_url    TEXT,                   -- link de pagamento (init_point)
  provider_payment_id TEXT,                   -- id do pagamento aprovado/mais recente
  checkout_expires_at TEXT,
  last_error          TEXT,
  last_checked_at     INTEGER NOT NULL DEFAULT 0,
  paid_at             TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

-- Dedupe de notificações: o mesmo evento nunca é processado duas vezes.
CREATE TABLE IF NOT EXISTS payment_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key   TEXT NOT NULL UNIQUE,
  order_id    INTEGER REFERENCES orders(id),
  source      TEXT NOT NULL,
  outcome     TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT NOT NULL,
  name       TEXT,
  email      TEXT,
  model      TEXT,                            -- modelo de chuteira comprado
  images     TEXT NOT NULL DEFAULT '[]',      -- JSON: nomes dos arquivos enviados
  ip_hash    TEXT,
  created_at TEXT NOT NULL
);
`;

export function openDb(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  seedProductsOnce(db);
  return db;
}

const columns = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

/** Atualiza bancos criados por versões anteriores (PagBank) sem perder dados. */
function migrate(db) {
  const orderCols = columns(db, "orders");
  const renames = [
    ["pagbank_checkout_id", "provider_checkout_id"],
    ["pagbank_pay_url", "provider_pay_url"],
    ["pagbank_order_id", "provider_payment_id"],
  ];
  for (const [from, to] of renames) {
    if (orderCols.includes(from) && !orderCols.includes(to)) db.exec(`ALTER TABLE orders RENAME COLUMN ${from} TO ${to}`);
  }
  db.exec("DROP INDEX IF EXISTS idx_orders_pb_order");
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_payment ON orders(provider_payment_id)");

  const fbCols = columns(db, "feedback");
  if (!fbCols.includes("model")) db.exec("ALTER TABLE feedback ADD COLUMN model TEXT");
  if (!fbCols.includes("images")) db.exec("ALTER TABLE feedback ADD COLUMN images TEXT NOT NULL DEFAULT '[]'");
}

function seedProductsOnce(db) {
  if (db.prepare("SELECT 1 FROM meta WHERE key='products_seeded'").get()) return;
  const now = new Date().toISOString();
  const ins = db.prepare(
    `INSERT OR IGNORE INTO products (id,name,line,category,price_cents,old_price_cents,image,colorway,tag,description,sizes,position,created_at,updated_at)
     VALUES (@id,@name,@line,@category,@price_cents,@old_price_cents,@image,@colorway,@tag,@description,@sizes,@position,@now,@now)`,
  );
  db.transaction(() => {
    SEED_PRODUCTS.forEach((p, i) =>
      ins.run({
        id: p.id, name: p.name, line: p.line, category: p.category,
        price_cents: Math.round(p.price * 100),
        old_price_cents: p.oldPrice ? Math.round(p.oldPrice * 100) : null,
        image: p.image, colorway: p.colorway, tag: p.tag ?? null, description: p.description,
        sizes: JSON.stringify(p.sizes), position: i, now,
      }),
    );
    db.prepare("INSERT INTO meta(key,value) VALUES ('products_seeded','1')").run();
  })();
}

export const productToApi = (r) => ({
  id: r.id, name: r.name, line: r.line, category: r.category,
  price: r.price_cents / 100,
  oldPrice: r.old_price_cents ? r.old_price_cents / 100 : undefined,
  image: r.image, colorway: r.colorway, tag: r.tag ?? undefined,
  description: r.description, sizes: JSON.parse(r.sizes),
});
