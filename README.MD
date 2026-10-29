# Kami - site

Site público do Kami: landing, estatísticas, ficha de amostra e documentos legais.
O projeto está na **D1** concluída; login, editor de fichas e fichas públicas ainda
estão nas próximas entregas.

**Versão atual:** `6.0.0`.

- Nuxt 4 com SSR e Vue 3 em Options API;
- TypeScript estrito e Prettier;
- PostgreSQL compartilhado com o bot, via `pg` + `sql-template-strings`;
- Zod para validar o ambiente e as entradas;
- CSS puro com o chassi do `kami-design-system`;
- Vitest para unidade e Playwright para fumaça;
- deploy em duas VPS com PM2, Nginx e Cloudflare.

O plano completo, incluindo as entregas D1-D5, está em [PLANEJAMENTO.md](PLANEJAMENTO.md).

## O que existe hoje

- Landing em `/` com narrativa de produto, estatísticas reais, ficha de amostra e roadmap.
- Estatísticas com cache de 60s, fallback e estado de indisponibilidade.
- Ficha de amostra em HTML com os cinco tipos de atributo.
- Roadmap de macros e campanhas, sem números.
- Jurídico em `/termos`, `/privacidade`, `/terms` e `/privacy`.
- Página de ficha pública em desenvolvimento em `/ficha` e `/ficha/:userId/:sheetName`.
- Redirects antigos, `/comandos` com `410`, `robots.txt` e `sitemap.xml`.
- Open Graph com imagem gerada em `public/og/kami-site.png`.

## Requisitos

| Item       | Versão                               |
| ---------- | ------------------------------------ |
| Node.js    | 24.12 ou superior                    |
| npm        | 11 ou superior                       |
| PostgreSQL | 18 (cluster compartilhado com o bot) |

## Como rodar

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Abra `http://localhost:3000`. O servidor de desenvolvimento escuta em
`0.0.0.0:3000`, então também pode ser acessado por outro dispositivo da rede ou
por um túnel. Use isso apenas em uma rede confiável.

Sem um Postgres acessível, `/api/ready` responde `503` e a landing mostra as
estatísticas como indisponíveis; `/api/health` continua respondendo `200`.

### Variáveis de ambiente

| Variável                     | Escopo   | Uso                                                           |
| ---------------------------- | -------- | ------------------------------------------------------------- |
| `NUXT_PUBLIC_SITE_URL`       | público  | URL canônica do jurídico e base de `robots.txt`/`sitemap.xml` |
| `NUXT_PUBLIC_ENVIRONMENT`    | público  | rótulo do ambiente na interface                               |
| `NUXT_PUBLIC_DISCORD_INVITE` | público  | convite do servidor                                           |
| `NUXT_PUBLIC_BOT_INVITE`     | público  | convite de instalação do bot                                  |
| `DATABASE_URL`               | servidor | conexão com o Postgres (role `kami_app`)                      |
| `SESSION_SECRET`             | servidor | 32+ bytes; assinatura de sessões e cookies                    |
| `LOG_LEVEL`                  | servidor | `debug`, `info`, `warn` ou `error`                            |
| `DB_POOL_MAX`                | servidor | máximo de clientes no pool                                    |
| `DB_CONNECTION_TIMEOUT_MS`   | servidor | timeout para obter um cliente                                 |
| `DB_STATEMENT_TIMEOUT_MS`    | servidor | timeout de cada consulta                                      |

Nunca leia `process.env` fora de `server/utils/config.ts` e nunca versione o
`.env` real. O arquivo de produção fica em `/etc/kami/kami-site.env`.

## Scripts

| Comando                | O que faz                                |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | servidor de desenvolvimento              |
| `npm run build`        | build de produção em `.output`           |
| `npm run preview`      | pré-visualização do build                |
| `npm start`            | sobe o build (carrega `.env` se existir) |
| `npm run typecheck`    | `nuxt typecheck` + `vue-tsc`             |
| `npm run test`         | testes unitários (Vitest)                |
| `npm run test:watch`   | Vitest em modo watch                     |
| `npm run test:e2e`     | fumaça com Playwright                    |
| `npm run format`       | Prettier em todo o projeto               |
| `npm run format:check` | verifica a formatação                    |
| `npm run check`        | formato + tipos + testes + build         |

O E2E sobe o servidor de desenvolvimento e precisa de um navegador do Playwright:

```powershell
npx playwright install chromium
npm run test:e2e
```

## Estrutura

```txt
app/                 aplicação Nuxt (app.vue, layout, páginas e componentes)
server/              Nitro (api, middleware, plugins, utils e tipos)
shared/              contratos e funções puras usadas nos dois lados
public/              fontes, marca, imagens e arquivos estáticos
scripts/             utilitários de desenvolvimento, como o gerador do OG
tests/               unit (Vitest) e e2e (Playwright)
deploy/              configuração de Nginx
docs/                documentação de deploy
```

A camada de dados segue o guia do backend: `api` orquestra, `services` valida,
`controllers` executam SQL e `utils` concentram pool, config e logger. O site não
cria tabelas nem altera o schema - isso é responsabilidade do bot.

## Rotas principais

| Rota                                        | Comportamento                             |
| ------------------------------------------- | ----------------------------------------- |
| `/`                                         | Landing                                   |
| `/termos`, `/privacidade`                   | Jurídico PT-BR                            |
| `/terms`, `/privacy`                        | Jurídico EN                               |
| `/ficha`, `/ficha/:userId/:sheetName`       | Aviso de ficha pública em desenvolvimento |
| `/comandos`                                 | `410 Gone`                                |
| `/convite`, `/suporte`                      | `302` para o Discord                      |
| `/tutoriais`, `/macros`, `/macro/:id/:nome` | `302` para a landing ou seção de recursos |

## Imagens e marca

- Hero: `public/exemplos/exemplo-discord.webp`, captura real do Kami no Discord.
- Ficha de amostra: `public/placeholders/placeholder.webp`, placeholder de marca.
- Open Graph: `public/og/kami-site.png`, 1200x630, mantido em PNG por compatibilidade
  com os previews do Discord e de outras redes.
- O card OG é gerado por `python scripts/gerar-og.py`; ele usa as fontes e a marca
  que já estão em `public/`.
- `design/source/` fica fora do Git e do build; não há arte gerada por IA sendo
  servida pelo site.

## Deploy

O passo a passo de banco, segredos, PM2, Nginx, Cloudflare, atualização e rollback
está em [docs/deploy.md](docs/deploy.md). O processo do PM2 está em
`ecosystem.config.cjs` e o Nginx de exemplo em `deploy/nginx/kami-site.conf`.

Antes de publicar, rode `npm run check` e os E2E no build de produção. A revisão
jurídica humana e os dados do responsável ainda são pendências de publicação.

## Licença

CC BY-NC-ND 4.0 - o mesmo regime do bot do Kami.
