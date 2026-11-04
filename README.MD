# Kami - site

Site público do Kami: landing, estatísticas, ficha de amostra, documentos legais,
cadastro, painel do jogador e editor de fichas. O projeto está com **D2, D2.1, D2.2 e
D3** concluídas no desenvolvimento; a próxima entrega é a D4 (fichas públicas) e o
release `6.2.0` aguarda migração no `kami_prod`, revisão jurídica e promoção.

**Versão de desenvolvimento:** `6.2.0` (produção: `6.0.0`).

- Nuxt 4 com SSR e Vue 3 em Options API;
- TypeScript estrito e Prettier;
- PostgreSQL compartilhado com o bot, via `pg` + `sql-template-strings`;
- Zod para validar o ambiente e as entradas;
- CSS puro com o chassi do `kami-design-system`;
- Vitest para unidade e Playwright para fumaça;
- deploy em duas VPS com PM2, Nginx e Cloudflare.

O plano completo, incluindo as entregas D0-D5, está em [PLANEJAMENTO.md](PLANEJAMENTO.md).

## O que existe hoje

- Landing em `/` com narrativa de produto, estatísticas reais, ficha de amostra e roadmap.
- Estatísticas com cache de 60s, fallback e estado de indisponibilidade.
- Ficha de amostra em HTML com os cinco tipos de atributo.
- Roadmap de macros e campanhas, sem números.
- Jurídico em `/termos`, `/privacidade`, `/terms` e `/privacy`.
- Cadastro em `/cadastrar` com username, e-mail, senha, aceite dos termos e login automático.
- Login em `/entrar`, saída em `/sair` e sessão opaca em `site_sessions`, com cookie `kami_sessao` HttpOnly e proteção CSRF por origem.
- Painel em `/painel` com conta, contagens reais e últimas fichas atualizadas.
- `/fichas` editável: criar, renomear, duplicar e excluir, com badges de pública, ao vivo e legada.
- `/:userId/ficha/:sheetName` com seções, os cinco tipos de atributo, salvamento explícito, Ctrl+S, aviso de saída e modo leitura; a mesma URL abre a ficha pública para quem não é o dono.
- Fichas `legacy` normalizam na leitura e gravam o formato novo no primeiro save.
- Concorrência por `last_use`: duas abas não sobrescrevem uma à outra; o conflito oferece recarregar.
- `/ao-vivo` para as fichas vinculadas ao Discord (`irt_sheets`), somente leitura até a D5.
- `/macros` somente leitura, com aviso de que o editor está em desenvolvimento.
- `/configuracoes` com username, status do Discord e troca de senha mediante a senha atual.
- Ficha pública na mesma URL do editor, com `noindex`, senha opcional e cookie de acesso; `/ficha/:userId/:sheetName` e `/fichas/:id` redirecionam para a URL canônica.
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
| `SESSION_SECRET`             | servidor | 32+ bytes; reservado para cookies assinados (D4)              |
| `LOG_LEVEL`                  | servidor | `debug`, `info`, `warn` ou `error`                            |
| `DB_POOL_MAX`                | servidor | máximo de clientes no pool                                    |
| `DB_CONNECTION_TIMEOUT_MS`   | servidor | timeout para obter um cliente                                 |
| `DB_STATEMENT_TIMEOUT_MS`    | servidor | timeout de cada consulta                                      |

Nunca leia `process.env` fora de `server/utils/config.ts` e nunca versione o
`.env` real. O arquivo de produção fica em `/etc/kami/kami-site.env`.

## Scripts

| Comando                     | O que faz                                  |
| --------------------------- | ------------------------------------------ |
| `npm run dev`               | servidor de desenvolvimento                |
| `npm run build`             | build de produção em `.output`             |
| `npm run preview`           | pré-visualização do build                  |
| `npm start`                 | sobe o build (carrega `.env` se existir)   |
| `npm run typecheck`         | `nuxt typecheck` + `vue-tsc`               |
| `npm run test`              | testes unitários (Vitest)                  |
| `npm run test:watch`        | Vitest em modo watch                       |
| `npm run test:e2e`          | fumaça com Playwright                      |
| `npm run db:validate`       | valida o schema Prisma                     |
| `npm run db:status`         | compara o histórico com o banco            |
| `npm run db:diff`           | mostra o SQL pendente entre banco e schema |
| `npm run db:migrate`        | aplica as migrations pendentes             |
| `npm run db:migrate:create` | cria uma migration em desenvolvimento      |
| `npm run format`            | Prettier em todo o projeto                 |
| `npm run format:check`      | verifica a formatação                      |
| `npm run check`             | formato + schema + tipos + testes + build  |

O E2E sobe o servidor de desenvolvimento e precisa de um navegador do Playwright:

```powershell
npx playwright install chromium
npm run test:e2e
```

Os testes de login bem-sucedido usam uma conta de teste local. Defina
`E2E_AUTH_EMAIL` e `E2E_AUTH_PASSWORD` antes de rodar; sem elas, esses testes são
ignorados. O teste de cadastro bem-sucedido só roda com `E2E_REGISTER=1` e cria
uma conta descartável com username e e-mail únicos. Nunca use uma conta real de produção.

O estado atual tem 137 testes unitários e 54 E2E. O rate limit de login é em memória por
processo; várias execuções seguidas do E2E no mesmo servidor podem responder `429`.
Reinicie o servidor para zerar o contador.

## Estrutura

```txt
app/                 aplicação Nuxt (app.vue, layout, páginas e componentes)
server/              Nitro (api, middleware, plugins, utils e tipos)
shared/              contratos e funções puras usadas nos dois lados
prisma/              schema e migrations do banco compartilhado
public/              fontes, marca, imagens e arquivos estáticos
scripts/             utilitários de desenvolvimento, como o gerador do OG
tests/               unit (Vitest) e e2e (Playwright)
deploy/              configuração de Nginx
docs/                documentação de deploy
```

A camada de dados segue o guia do projeto: `api` orquestra, `services` valida e
`utils` concentram pool, config e logger. O runtime usa `pg` +
`sql-template-strings`; o schema e as migrations ficam em `prisma/`.

## Banco e migrations

O site é dono do schema e das migrations a partir da D2. O Prisma entra apenas
como ferramenta de schema; o Prisma Client não é usado no runtime.

| Variável                     | Uso                                                   |
| ---------------------------- | ----------------------------------------------------- |
| `DATABASE_URL`               | runtime, role `kami_app`, sem DDL                     |
| `MIGRATION_DATABASE_URL`     | CLI do Prisma, role com DDL, só no passo de migration |
| `PRISMA_SHADOW_DATABASE_URL` | banco de sombra local para criar migrations           |

```powershell
npm run db:validate
npm run db:status
npm run db:diff
npm run db:migrate
```

O histórico existente foi copiado do bot preservando nomes e checksums. Antes da
primeira migration nova, `db:diff` deve sair vazio. Se houver drift, reconcilie
antes de criar qualquer migration. O guia completo está em [prisma/README.md](prisma/README.md).

## Rotas principais

| Rota                                       | Comportamento                             |
| ------------------------------------------ | ----------------------------------------- |
| `/`                                        | Landing                                   |
| `/termos`, `/privacidade`                  | Jurídico PT-BR                            |
| `/terms`, `/privacy`                       | Jurídico EN                               |
| `/cadastrar`                               | Cadastro com username, e-mail e senha     |
| `/entrar`                                  | Login com e-mail e senha                  |
| `/painel`                                  | Visão geral autenticada com `noindex`     |
| `/fichas`                                  | Lista editável de fichas                  |
| `/:userId/ficha/:sheetName`                | Editor/leitura do dono e ficha pública    |
| `/fichas/:id`                              | `302` para `/:userId/ficha/:sheetName`    |
| `/ao-vivo`                                 | Fichas vinculadas ao Discord (IRT)        |
| `/macros`                                  | Macros somente leitura                    |
| `/configuracoes`                           | Conta, username e senha                   |
| `/sair`                                    | Confirmação de logout                     |
| `/login`, `/logout`, `/dashboard`, `/sync` | `302` para `/entrar`, `/sair` e `/painel` |
| `/ficha/:userId/:sheetName`                | `302` para a URL canônica da ficha        |
| `/comandos`                                | `410 Gone`                                |
| `/convite`, `/suporte`                     | `302` para o Discord                      |
| `/tutoriais`, `/macro/:id/:nome`           | `302` para a landing ou seção de recursos |

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
