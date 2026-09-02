# TN Sports

Loja de chuteiras (campo, society e futsal) — projeto React + TypeScript + Vite + Tailwind CSS,
sem nenhuma dependência do Lovable ou de frameworks de SSR. Roda de forma limpa em qualquer
editor, incluindo o VS Code.

## Estrutura de pastas

```
tn-sports/
├── index.html                # HTML de entrada (Vite)
├── public/                   # arquivos estáticos (favicon, robots.txt)
├── src/
│   ├── main.tsx               # ponto de entrada React
│   ├── App.tsx                # rotas da aplicação
│   ├── styles/
│   │   └── globals.css        # CSS global + design system (Tailwind v4)
│   ├── assets/                # imagens dos produtos
│   ├── components/
│   │   ├── site-header.tsx
│   │   ├── site-footer.tsx
│   │   ├── product-card.tsx
│   │   └── ui/                 # componentes shadcn/ui (botão, sheet, etc.)
│   ├── pages/
│   │   ├── home.tsx
│   │   ├── products.tsx
│   │   ├── product-detail.tsx
│   │   └── not-found.tsx
│   ├── lib/
│   │   ├── products.ts        # catálogo de produtos
│   │   ├── cart.tsx           # contexto do carrinho (localStorage)
│   │   └── utils.ts
│   └── hooks/
│       └── use-mobile.tsx
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Como rodar no VS Code

1. Abra a pasta `tn-sports` no VS Code (`File > Open Folder`).
2. Abra um terminal integrado (`` Ctrl+` ``) e instale as dependências:

   ```bash
   npm install
   ```

3. Rode o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

4. Abra o endereço mostrado no terminal (normalmente `http://localhost:5173`).

## Build de produção

```bash
npm run build
npm run preview
```

## Stack

- **React 19** + **TypeScript**
- **Vite** (bundler)
- **React Router** (navegação entre Home, Catálogo e Detalhe do produto)
- **Tailwind CSS v4**
- **shadcn/ui** (Radix UI + Tailwind)
- **Sonner** (notificações/toasts)

Nenhum pacote da Lovable ou de SSR (TanStack Start) é usado — é um projeto Vite + React padrão.
