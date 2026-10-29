# TN Sports

Loja de chuteiras de campo e society. A TN Sports nasceu do projeto do Thiago Nalberth para ajudar
jovens atletas a escolher boas chuteiras com preço justo.

Front-end em React + TypeScript + Vite + Tailwind CSS. Back-end em Node + Express + SQLite, com
pagamento pelo Checkout do PagBank e atendimento final pelo WhatsApp.

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
npm run test:server      # testes do back-end (PagBank simulado)
npm run test:whatsapp    # cria um pedido pago de teste para ver o fluxo do WhatsApp
```

## Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `PAGBANK_TOKEN` | Token da conta PagBank (sandbox em desenvolvimento). Fica só no servidor. |
| `PAGBANK_ENV` | `sandbox` (padrão) ou `production`. |
| `WEBHOOK_BASE_URL` | URL pública https que o PagBank alcança. Em desenvolvimento use um túnel (`ngrok http 3001`). |
| `PUBLIC_URL` | Endereço do site, para onde o PagBank devolve o cliente. |
| `WHATSAPP_NUMBER` | Número da loja, só dígitos, com país e DDD: `55DDDNUMERO`. |
| `ADMIN_PASSWORD` | Senha do painel `/admin`, validada no servidor. |
| `SESSION_SECRET` | Segredo da sessão do admin. Use um valor longo e aleatório. |
| `PAGBANK_REQUIRE_SIGNATURE` | `true` (padrão) descarta avisos do PagBank sem assinatura válida. |

O arquivo `.env` nunca deve ir para o GitHub. O `.gitignore` já o ignora, assim como a pasta `data/`.

## Como funciona a compra

1. O botão **Finalizar compra** envia ao servidor só produto, tamanho e quantidade. Preços e total são
   recalculados a partir do banco.
2. O cliente paga na página segura do PagBank. Voltar dela não confirma nada.
3. O servidor recebe o aviso do PagBank, confere a assinatura e consulta o pedido na API do PagBank
   antes de marcá-lo como pago.
4. A página `/pedido/:id` mostra o estado do pagamento e só libera o WhatsApp da loja depois da
   confirmação feita pelo servidor.

## Estrutura

```
server/     API, banco SQLite, integração PagBank e testes
scripts/    dev.mjs (sobe tudo) e test-whatsapp.mjs
public/     favicon, robots.txt e fotos dos produtos
src/
  pages/        home, catálogo, produto, pedido e admin
  components/   cabeçalho, rodapé, feedback e componentes de interface
  lib/          carrinho, catálogo, checkout e chamadas à API
```

## Observações

- O catálogo, os pedidos e as avaliações ficam em `data/tn-sports.db`. Faça backup dessa pasta e de
  `data/uploads/`.
- O frete não é cobrado no checkout; é combinado no WhatsApp após o pagamento.
- Os limites de requisições ficam em memória, então valem para uma única instância do servidor.
