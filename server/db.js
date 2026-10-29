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
  pagbank_checkout_id TEXT,
  pagbank_pay_url     TEXT,
  pagbank_order_id    TEXT,
  pagbank_charge_id   TEXT,
  checkout_expires_at TEXT,
  last_error          TEXT,
  last_checked_at     INTEGER NOT NULL DEFAULT 0,
  paid_at             TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_pb_order ON orders(pagbank_order_id);

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
  seedProductsOnce(db);
  return db;
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
