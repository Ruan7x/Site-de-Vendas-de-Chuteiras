# TN Sports

Loja de chuteiras de campo e society. A TN Sports nasceu do projeto do Thiago Nalberth para ajudar
jovens atletas a escolher boas chuteiras com preço justo.

Front-end em React + TypeScript + Vite + Tailwind CSS. Back-end em Node + Express + SQLite, com
pagamento pelo Checkout Pro do Mercado Pago e atendimento final pelo WhatsApp.

## Rodando

Precisa de Node 20 ou mais novo.

```bash
npm install
cp .env.example .env     # preencha os valores (tabela abaixo)
npm run dev              # API em :3001 e site em :5173
```

Outros comandos:

```bash
npm run build            # gera o site em dist/
npm start                # produção: serve a API e o site compilado
npm run test:server      # testes do back-end (Mercado Pago simulado)
npm run test:whatsapp    # cria um pedido pago de teste para ver o fluxo do WhatsApp
```

## Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `MP_ACCESS_TOKEN` | Access Token da aplicação no Mercado Pago (credenciais de teste em desenvolvimento). Fica só no servidor. |
| `MP_ENV` | `sandbox` (padrão, credenciais de teste) ou `production`. É só um rótulo: o que define teste ou cobrança real é o Access Token usado. |
| `MP_WEBHOOK_SECRET` | Assinatura secreta das notificações (painel do Mercado Pago, em Webhooks). |
| `MP_REQUIRE_SIGNATURE` | `true` (padrão) descarta avisos sem assinatura válida. |
| `WEBHOOK_BASE_URL` | URL pública https que o Mercado Pago alcança. Em desenvolvimento use um túnel (`ngrok http 3001`). |
| `PUBLIC_URL` | Endereço do site, para onde o Mercado Pago devolve o cliente. |
| `WHATSAPP_NUMBER` | Número da loja, só dígitos, com país e DDD: `55DDDNUMERO`. |
| `ADMIN_PASSWORD` | Senha do painel `/admin`, validada no servidor. |
| `SESSION_SECRET` | Segredo da sessão do admin. Use um valor longo e aleatório. |
| `FEEDBACK_UPLOADS_DIR` | Pasta das fotos enviadas nas opiniões (padrão `data/feedback-uploads`). |

No painel do Mercado Pago, cadastre o webhook `https://SEU-DOMINIO/api/webhooks/mercadopago` com o
evento **Pagamentos**. Mesmo sem o aviso, a página `/pedido/:id` consulta a API do Mercado Pago e
confirma o pagamento sozinha.

O arquivo `.env` nunca deve ir para o GitHub. O `.gitignore` já o ignora, assim como a pasta `data/`.

## Como funciona a compra

1. O botão **Finalizar compra** envia ao servidor só produto, tamanho e quantidade. Preços e total são
   recalculados a partir do banco.
2. O cliente paga na página segura do Mercado Pago. Voltar dela não confirma nada.
3. O servidor recebe o aviso do Mercado Pago, confere a assinatura e consulta o pagamento na API do Mercado Pago
   antes de marcá-lo como pago.
4. A página `/pedido/:id` mostra o estado do pagamento e só libera o WhatsApp da loja depois da
   confirmação feita pelo servidor.

## Estrutura

```
server/     API, banco SQLite, integração Mercado Pago e testes
scripts/    dev.mjs (sobe tudo) e test-whatsapp.mjs
public/     favicon, robots.txt e fotos dos produtos
src/
  pages/        home, catálogo, produto, pedido e admin
  components/   cabeçalho, rodapé, feedback e componentes de interface
  lib/          carrinho, catálogo, checkout e chamadas à API
```

## Observações

- O catálogo, os pedidos e as avaliações ficam em `data/tn-sports.db`. Faça backup dessa pasta, de
  `data/uploads/` e de `data/feedback-uploads/`.
- As opiniões aceitam o modelo comprado e até 3 fotos (png, jpeg, webp ou gif, até 2,5 MB cada). As
  fotos não são públicas: só o painel `/admin`, logado, consegue abri-las.
- O frete não é cobrado no checkout; é combinado no WhatsApp após o pagamento.
- Os limites de requisições ficam em memória, então valem para uma única instância do servidor.
