# ISAE4 Competição — Nat vs Ang vs Buffet

Aplicação web (PWA) para acompanhar uma **disputa de investimentos** entre dois
usuários — **Nat** e **Ang** — no ativo **ISAE4**, comparada a um terceiro
cenário **passivo (Buffet / buy & hold)**.

> React + Vite + Tailwind · Chart.js · persistência em `localStorage` ·
> instalável como PWA · deploy estático no GitHub Pages (sem backend).

---

## ✨ Funcionalidades

- **Demonstração (pública)**: cards com patrimônio, rentabilidade, ações e caixa
  dos 3 cenários; ranking "quem está ganhando"; gráficos de evolução de
  patrimônio e rentabilidade acumulada com **filtro por período/data**; cotação
  atual de ISAE4 via API com botão **Atualizar**; tabela de transações.
- **Página Nat** e **Página Ang**: formulário de compra/venda (data, quantidade,
  preço) com **validação** (não vende mais do que tem, não compra sem caixa),
  histórico (somente leitura), resumo da carteira e gráfico comparando com o
  Buffet. As alterações de cada uma impactam **apenas o próprio cenário**.
  Os jogadores **não podem excluir** operações — toda movimentação é definitiva
  e fica registrada na auditoria.
- **Configurações (Admin)**: protegida por senha simples. Cadastro de
  **proventos (Dividendos/JCP)**, **perfis** (nome, foto, descrição, tese),
  **parâmetros gerais** (ticker, capital inicial, taxa RF, data inicial, preço
  inicial), histórico de **cotações manuais** (fallback da API),
  **gerenciamento de movimentações** (exclusão restrita ao admin),
  **registro de auditoria** (backup imutável de adições/exclusões, com export
  CSV) e **export/import** de dados em JSON.

## 🧮 Regras de negócio

- Nat e Ang começam com **R$ 50.000** em caixa.
- Caixa não investido rende **1% ao mês** em RF (juro composto proporcional por
  dia, base 30 dias).
- **Buffet** compra todo o capital inicial em ISAE4 na data inicial (ao preço
  inicial) e nunca mais movimenta.
- **Proventos**: ao cadastrar um Dividendo/JCP em uma data, o sistema calcula
  quantas ações cada cenário possuía naquela data e credita
  `ações × valor_por_ação` no caixa.
- **Patrimônio** = caixa (com RF acumulado) + valor de mercado das ações na data.

A lógica vive em [`src/lib/portfolio.js`](src/lib/portfolio.js).

## 🔗 Acesso (sem login)

O acesso é por link direto (hash routing, compatível com GitHub Pages):

| Página         | Link                          | Query alternativa        |
| -------------- | ----------------------------- | ------------------------ |
| Demonstração   | `…/#/`                        | `…/#/u?user=demo`        |
| Nat            | `…/#/nat`                     | `…/#/u?user=nat`         |
| Ang            | `…/#/ang`                     | `…/#/u?user=ang`         |
| Configurações  | `…/#/config`                  | `…/#/u?user=admin`       |

> A página de Configurações pede uma **senha simples** (padrão `admin123`,
> alterável na própria tela). Não é segurança real — compartilhe os links apenas
> com quem deve ter acesso.

## 🛠️ Tecnologias

React 18, Vite 5, Tailwind CSS 3, React Router (HashRouter), Zustand
(estado + `localStorage`), Chart.js / react-chartjs-2, date-fns,
vite-plugin-pwa (manifest + service worker).

## 🚀 Executar localmente

```bash
npm install
npm run dev        # http://localhost:5173
```

## 📦 Build de produção

```bash
npm run build      # gera /dist (inclui manifest.webmanifest e sw.js)
npm run preview    # serve o build localmente
```

Regenerar os ícones do PWA (opcional): `npm run icons`.

## 🌐 Deploy (GitHub Pages)

O deploy é automático via GitHub Actions
([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) a cada push.

1. No repositório: **Settings → Pages → Build and deployment → Source =
   GitHub Actions**.
2. Faça push para `main` (ou a branch de desenvolvimento). O workflow roda
   `npm ci && npm run build` e publica `dist/`.
3. A URL final aparece no resumo do workflow / em Settings → Pages.

> O `base` do Vite é relativo (`./`), então a app funciona em qualquer
> subdiretório do GitHub Pages sem configuração extra.

## 💾 Dados e sincronização

- Persistência local por navegador (`localStorage`, chave `isae4-app`).
- **Backup / sincronização entre dispositivos**: use **Exportar/Importar JSON**
  na página de Configurações.
- Há **dados mock iniciais** para visualizar a app já populada.

## 📈 Cotação ISAE4

Busca via Yahoo Finance (`ISAE4.SA`) usando proxies CORS de fallback. Se a
consulta online falhar, cadastre preços manualmente em
**Configurações → Histórico de cotações**.

## ✅ Checklist de critérios de aceite

- [x] Abrir as 4 páginas e navegar sem erro.
- [x] Registrar operações da Nat sem afetar Ang.
- [x] Registrar operações da Ang sem afetar Nat.
- [x] Cadastrar proventos e ver reflexo correto nos 3 cenários.
- [x] Gráficos de Nat, Ang e Buffet com filtros de data.
- [x] Cotação online do ISAE4 atualiza o patrimônio.
- [x] Instalável como PWA (manifest + service worker).
- [x] Build de produção sem falhas (`npm run build`).

## 📁 Estrutura

```
├── index.html
├── vite.config.js          # base relativo + VitePWA
├── scripts/generate-icons.mjs
├── public/                 # favicon.svg, icons/
├── src/
│   ├── main.jsx, App.jsx
│   ├── lib/                # portfolio.js, store.js, quote.js, format.js, initialData.js
│   ├── components/         # Layout, Charts, StatCard, Toast
│   └── pages/              # Demo, Trader (Nat/Ang), Config
└── .github/workflows/deploy.yml
```
