// Cria um pedido PAGO DE TESTE direto no banco local, para você testar a página /pedido/:id
// e o botão/redirecionamento do WhatsApp SEM usar o PagBank.
// Uso: npm run test:whatsapp
// Não é uma rota da API (ninguém acessa pela internet) e é bloqueado em produção.
import { loadConfig, loadDotEnv } from "../server/config.js";
loadDotEnv();
import { openDb } from "../server/db.js";
import { newPublicId } from "../server/security.js";

const config = loadConfig();
if (config.pagbankEnv === "production" || process.env.NODE_ENV === "production") {
  console.error("Recusado: este script é só para desenvolvimento (PAGBANK_ENV=production detectado).");
  process.exit(1);
}
if (!/^55\d{10,11}$/.test(config.whatsappNumber)) {
  console.error("Defina WHATSAPP_NUMBER no .env no formato 55DDDNUMERO (ex.: 5565999998888) e rode de novo.");
  process.exit(1);
}

const db = openDb(config.dbPath);
const p = db.prepare("SELECT * FROM products ORDER BY position LIMIT 1").get();
if (!p) {
  console.error("Nenhum produto cadastrado.");
  process.exit(1);
}
const size = JSON.parse(p.sizes)[0];
const id = newPublicId();
const now = new Date().toISOString();
db.prepare(
  `INSERT INTO orders (public_id,reference_id,status,total_cents,items_json,paid_at,last_error,created_at,updated_at)
   VALUES (?,?,?,?,?,?,?,?,?)`,
).run(
  id, id, "PAID", p.price_cents,
  JSON.stringify([{ productId: p.id, name: p.name, size, quantity: 1, unitCents: p.price_cents }]),
  now, "PEDIDO DE TESTE (script test-whatsapp) — sem pagamento real", now, now,
);

console.log("\nPedido pago de TESTE criado (nenhum pagamento real).");
console.log(`\nAbra no navegador:\n  ${config.publicUrl}/pedido/${id}\n`);
console.log(`A página vai contar 6s e abrir o WhatsApp de ${config.whatsappNumber} com a mensagem do pedido.`);
console.log("O servidor (npm run dev) precisa estar rodando.\n");
