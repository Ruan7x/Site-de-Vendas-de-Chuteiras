# TN Sports

Loja de chuteiras de campo e society. A TN Sports nasceu do projeto do Thiago Nalberth para ajudar
jovens atletas a escolher boas chuteiras com preço justo.

Front-end em React + TypeScript + Vite + Tailwind CSS. Back-end em Node + Express + SQLite, com
pagamento pelo Checkout Pro do Mercado Pago e atendimento final pelo WhatsApp.

## Rodando

Precisa de Node 20 ou mais novo.

```bash
npm install
# crie o arquivo .env (modelo abaixo, em "Variáveis de ambiente")
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

Crie na raiz do projeto um arquivo chamado `.env` (ele **nunca** vai para o GitHub) com o modelo
abaixo e preencha os valores conforme a tabela. Não deixe comentário no fim de uma linha com valor;
coloque o comentário na linha de cima.

```
PORT=3001
PUBLIC_URL=http://localhost:5173
# WEBHOOK_BASE_URL=https://seu-dominio.com.br
# TRUST_PROXY=1

# sandbox (credenciais de teste) | production (credenciais reais)
MP_ENV=sandbox
MP_ACCESS_TOKEN=
MP_WEBHOOK_SECRET=
MP_REQUIRE_SIGNATURE=true

WHATSAPP_NUMBER=
ADMIN_PASSWORD=
SESSION_SECRET=

# DATABASE_PATH=./data/tn-sports.db
# UPLOADS_DIR=./data/uploads
# FEEDBACK_UPLOADS_DIR=./data/feedback-uploads
```

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

Nenhum arquivo `.env` vai para o GitHub, nem de exemplo: o `.gitignore` ignora todos (`.env`, `.env.*`,
`*.env`), assim como a pasta `data/`.

## Como funciona a compra

1. **Finalizar compra** envia ao servidor só produto, cor, tamanho e quantidade. Preços e total são
   recalculados a partir do banco, e o cliente vai para a página do pedido (`/pedido/:id`).
2. Na página do pedido, o cliente escolhe:
   - **Pix** (no próprio site): informa o e-mail, o servidor cria o pagamento Pix pela API do Mercado
     Pago e a página mostra o QR code e o "copia e cola". O cliente não sai do navegador, nem no celular.
     O Pix vale 1 hora; recarregar a página mostra o mesmo código.
   - **Cartão ou boleto**: abre a página segura do Mercado Pago numa aba nova.
3. O servidor confirma o pagamento consultando a API do Mercado Pago (pelo webhook, pela página do
   pedido e por uma conferência automática a cada minuto). Voltar de uma página de pagamento não
   confirma nada sozinho.
4. Confirmado o pagamento, a página do pedido abre o WhatsApp da loja com a mensagem do pedido.

O Pix só funciona se a conta Mercado Pago da loja tiver uma **chave Pix cadastrada**.

## Publicar no Render

O arquivo `render.yaml` já descreve o serviço: plano **Starter** (sempre ligado), disco permanente de
1 GB em `/var/data` para o banco e as fotos, build, start, verificação de saúde e as variáveis.
O plano gratuito não serve: ele apaga o banco e as fotos e desliga o site sem visitas.

1. Crie a conta em render.com entrando com o GitHub e cadastre um cartão.
2. **New > Blueprint**, escolha o repositório `Site-de-Vendas-de-Chuteiras` e clique em **Apply**.
3. O Render pede os valores secretos (eles ficam só no Render, nunca no GitHub):
   - `MP_ACCESS_TOKEN`: Access Token de **produção** do Mercado Pago;
   - `MP_WEBHOOK_SECRET`: deixe vazio por enquanto (passo 6);
   - `WHATSAPP_NUMBER`: `55` + DDD + número, só dígitos;
   - `ADMIN_PASSWORD`: senha forte do `/admin`;
   - `PUBLIC_URL`: deixe vazio até ter domínio próprio (o site usa o endereço `.onrender.com`).
4. Espere o build terminar (alguns minutos) e abra o endereço `https://….onrender.com`.
5. O banco no Render começa novo, com os produtos padrão: cadastre ou ajuste os produtos no `/admin`.
6. No painel do Mercado Pago (modo produção) > Webhooks, cadastre
   `https://SEU-ENDEREÇO/api/webhooks/mercadopago` com o evento **Pagamentos**, copie a assinatura
   secreta e cole em `MP_WEBHOOK_SECRET` no Render (**Environment > Save**).
7. Domínio próprio: registre o `.com.br` no Registro.br; no Render, **Settings > Custom Domains**,
   adicione `seudominio.com.br` e `www.seudominio.com.br` e crie no Registro.br os registros DNS que o
   Render mostrar. Quando o https ficar ativo, preencha `PUBLIC_URL=https://seudominio.com.br` e
   atualize a URL do webhook no Mercado Pago.

Depois disso, cada `git push` na branch `main` atualiza o site sozinho (o site fica alguns segundos
fora do ar durante a troca, por causa do disco).

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
- As avaliações aceitam o modelo comprado e até 3 fotos (png, jpeg, webp ou gif, até 2,5 MB cada) e
  aparecem publicamente na página inicial (nome, estrelas, comentário, modelo e fotos; o e-mail nunca é
  mostrado). No `/admin`, aba Avaliações, dá para ocultar do site ou excluir (com as fotos).
- O frete não é cobrado no checkout; é combinado no WhatsApp após o pagamento.
- Os limites de requisições ficam em memória, então valem para uma única instância do servidor.
