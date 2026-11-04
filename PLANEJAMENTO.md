# Planejamento - Novo Site do Kami

> Documento vivo. Substitui o site antigo (Vue SPA) por uma plataforma Nuxt 4 com SSR,
> compartilhando o Postgres do bot. A landing vem primeiro; login, editor, fichas públicas e
> tempo real vêm nas entregas seguintes.
>
> Última atualização: 31/10/2026.

---

## 1. Objetivo

Construir o novo site do Kami como a central web do sistema:

- apresentar o Kami e o que ele faz, com dados reais;
- receber cadastro com username, e-mail e senha e login por e-mail e senha;
- permitir criar, editar e organizar fichas;
- publicar fichas públicas com controle de privacidade;
- sincronizar com o Discord sem transformar o site em dependência do bot;
- substituir as páginas jurídicas que hoje vivem no Google Docs;
- manter o bot responsável pela integração com o Discord, consumindo o schema compartilhado do site.

O site não é um painel administrativo do bot. É a interface pública e a área de membros do
mesmo produto.

## 2. Princípios

1. **Dado real ou ausente.** Nenhum número inventado. Quando a fonte falha, a tela mostra
   indisponibilidade, nunca zero.
2. **SSR primeiro.** A landing precisa ser útil sem JavaScript e indexável.
3. **Aplicação sem estado local.** Sessão e dados vivem no Postgres; qualquer VPS atende
   qualquer requisição.
4. **Schema compartilhado, dono no site.** O site mantém o schema Prisma e as migrations; o bot consome o mesmo schema e cuida da integração com o Discord.
5. **Entregas pequenas.** Cada entrega termina verificável, documentada e publicável.
6. **PT-BR primeiro, EN depois.** A estrutura de conteúdo e as rotas já nascem preparadas
   para os dois idiomas.
7. **Chassi do design system.** A identidade vem de `kami.css`; o site adiciona apenas o que
   for específico de página pública.
8. **Segurança por padrão.** Segredo só no servidor, validação com Zod em toda entrada,
   sessão opaca, banco com role dedicada.

## 3. Stack

| Item       | Escolha                                                             | Observação                                                |
| ---------- | ------------------------------------------------------------------- | --------------------------------------------------------- |
| Framework  | Nuxt 4 (SSR)                                                        | Estrutura `app/`, `server/`, `shared/`, `public/`         |
| UI         | Vue 3 com Options API                                               | Nunca `<script setup>`, `ref()` ou `reactive()` em `.vue` |
| Linguagem  | TypeScript estrito                                                  | `defineNuxtComponent` quando houver `asyncData` ou `head` |
| Banco      | PostgreSQL 18 via `pg` + `sql-template-strings`                     | SQL sempre parametrizado                                  |
| Schema     | Prisma CLI 7 para schema e migrations, sem Prisma Client no runtime | Aplicado por role com DDL, fora do runtime                |
| Validação  | Zod                                                                 | Schemas em `server/schemas/`                              |
| Estilo     | CSS puro (`kami.css` + `site.css`)                                  | Sem Tailwind, Sass, UI kit ou CSS-in-JS                   |
| Tempo real | Socket.IO + `@socket.io/postgres-adapter`                           | A partir da D5                                            |
| Testes     | Vitest + Playwright                                                 | Unidade, integração e fumaça                              |
| Deploy     | PM2 (fork) + Nginx + Cloudflare                                     | Duas VPS, failover                                        |
| Node       | 24 LTS                                                              | Mesmo runtime do bot                                      |

## 4. Arquitetura

### 4.1 Estrutura de pastas

```txt
app/
 ├── app.vue
 ├── error.vue
 ├── assets/css/
 │    ├── kami.css          # cópia fiel do design system
 │    └── site.css          # tokens e estilos do site
 ├── components/            # componentes reutilizáveis (Options API)
 │    └── site/             # blocos da landing e das páginas públicas
 ├── composables/           # apenas se necessário; preferir métodos Options API
 ├── layouts/
 │    └── default.vue
 └── pages/
      ├── index.vue
      ├── entrar.vue
      ├── painel.vue
      ├── fichas/
      │    ├── index.vue
      │    └── [id].vue
      ├── ficha/[userId]/[sheetName].vue
      ├── configuracoes.vue
      ├── termos.vue
      ├── privacidade.vue
      └── en/
           ├── terms.vue
           └── privacy.vue

server/
 ├── api/                   # rotas Nitro (equivalente a routes/)
 ├── controllers/           # SQL + conversores (única camada que importa o pool)
 ├── services/              # regras e validação (não executam SQL)
 ├── schemas/               # schemas Zod por recurso
 ├── middleware/            # segurança, observabilidade, sessão
 ├── plugins/               # boot e shutdown
 └── utils/                 # config, database, logger, erros, cache

prisma/
 ├── schema.prisma          # fonte de verdade do banco
 ├── migrations/            # histórico versionado, copiado do bot na D2
 └── README.md              # baseline, roles e comandos

prisma.config.ts           # URL da CLI de migration, fora do runtime

shared/
 ├── content/               # textos jurídicos e da landing, por idioma
 ├── types/                 # contratos usados por app e server
 └── utils/                 # formatadores puros

public/
 ├── fonts/                 # Oswald, Fira Code, Barlow + licenças OFL
 ├── marca/                 # logo e favicon
 └── og/                    # imagem de compartilhamento

tests/
 ├── unit/
 └── e2e/

deploy/
 ├── nginx/kami-site.conf
 └── README.md

docs/
 └── deploy.md
```

### 4.2 Camadas (adaptação do guia do backend para o Nitro)

```txt
HTTP (Nitro)                         WebSocket (Socket.IO, D5)
──────────────                       ─────────────────────────
server/api/*.ts                      server/websocket/
  autorização + orquestração           autenticação + evento
        ↓                                    ↓
server/services/*.services.ts        server/services/*.services.ts
  validação + regra                    validação + regra
        ↓                                    ↓
server/controllers/*.controller.ts   server/controllers/*.controller.ts
  SQL via querys/                      SQL via querys/
        ↓                                    ↓
server/utils/database.ts             server/utils/database.ts
  Pool único do Postgres               Pool único do Postgres
```

Contratos:

- **`server/api/`** - recebe a requisição, valida sessão/permissão, chama o service, padroniza
  a resposta e trata erro. Não executa SQL e não contém regra de negócio complexa.
- **`server/services/`** - valida com Zod e aplica regras. Retorna `string[]` de erros ou o
  objeto pronto para o controller.
- **`server/controllers/`** - única camada que executa SQL. Classes estáticas, queries em
  `controllers/<recurso>/querys/` e conversores `para<Entidade>`.
- **`server/utils/`** - configuração, pool, logger, erros, cache e funções genéricas.
- **`server/schemas/`** - `z.strictObject`, `z.coerce` para números e `refine` para regras de
  formulário.
- **`shared/`** - tipos e textos que precisam existir nos dois lados. Nunca importar código
  de `server/` no cliente.

### 4.3 Regras de código

- Nomes de arquivos, pastas, identificadores e rotas em português, sem acento.
- Banco e API em `snake_case`; nunca misturar `camelCase` no mesmo objeto.
- 4 espaços, aspas simples, ponto e vírgula, 120 colunas, sem vírgula final,
  `arrowParens: avoid`, um atributo por linha no template.
- Todo `if`, `else`, `for` e `while` com chaves, mesmo de uma linha.
- Comentários explicam o funcionamento, não o histórico da alteração.
- `return` explícito em respostas HTTP.
- Nunca ler `process.env` fora de `server/utils/config.ts`.
- Nunca escrever SQL fora de `server/controllers/`.
- Nunca expor erro interno, stack ou credencial ao cliente.

## 5. Banco de dados

### 5.1 Tabelas existentes reaproveitadas

| Tabela           | Uso no site                                                            |
| ---------------- | ---------------------------------------------------------------------- |
| `users`          | Login, perfil, nome, avatar, e-mail, hash, `discord_id` e `last_use`   |
| `sheets`         | Fichas, `attributes` em JSONB, `is_public`, `sheet_password`, `legacy` |
| `irt_sheets`     | Vínculo ficha ↔ mensagem do Discord; usado pela ficha ao vivo (D5)     |
| `servers_config` | Configuração de servidores do bot; não entra na faixa pública          |
| `macros`         | Não expor na D1; macros entram como roadmap                            |
| `logs`           | Interações da faixa pública (`COMMAND` + `COMPONENT`)                  |

Campos relevantes de `sheets`:

- `attributes`: `{ sections: [{ name, position, type, attributes: [...] }] }`;
- `section.type`: `0` padrão, `1` descrição;
- `attribute.type`: `0` texto, `1` número, `2` imagem, `3` lista, `4` barra;
- valor por tipo:
    - texto/número/imagem: valor escalar;
    - lista: `{ items: [{ name, quantity }] }`;
    - barra: `{ actual, max, min, step }`;
- `legacy`: fichas antigas em formato plano. O site normaliza em memória para leitura e, no
  primeiro salvamento, grava o formato novo com `legacy = false`, igual ao bot;
- `last_use`: versão de concorrência otimista. Toda atualização do site grava `last_use = now()`
  e compara o valor lido antes de escrever.

### 5.2 Estatísticas da landing

Uma consulta única, sem dados pessoais:

```sql
SELECT
    (SELECT COUNT(id) FROM users)                                             AS users,
    (SELECT COUNT(id) FROM users WHERE last_use >= NOW() - INTERVAL '30 days') AS active_users,
    (SELECT COUNT(id) FROM sheets)                                            AS sheets,
    (SELECT COUNT(*) FROM logs WHERE action_type = 'COMMAND')                 AS commands,
    (SELECT COUNT(*) FROM logs WHERE action_type = 'COMPONENT')               AS components;
```

Regras:

- cache em memória de 60 segundos;
- em falha, servir o último valor por até 15 minutos e registrar aviso;
- sem cache válido, responder `503` e a tela mostrar `INDISPONÍVEL`, nunca `0`;
- usuários ativos: `last_use` dentro dos últimos 30 dias, como no `bot-status`;
- interações: comandos + componentes, somando os contadores legados do bot
  (803.410 comandos e 120.647 componentes) para fechar o total desde o início;
- macros não aparecem com número; entram como **EM DESENVOLVIMENTO**.

### 5.3 Tabelas novas (migrations do site)

| Tabela                  | Finalidade                          | Campos principais                                                                                        |
| ----------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `site_sessions`         | Sessão opaca do site                | `id`, `user_id`, `token_hash`, `created_at`, `last_seen_at`, `expires_at`, `ip`, `user_agent`            |
| `site_sync_codes`       | Código de vínculo site → Discord    | `id`, `user_id`, `code_hash`, `expires_at`, `used_at`, `created_at`                                      |
| `sheet_sync_queue`      | Outbox de alterações para o bot/IRT | `id`, `sheet_id`, `user_id`, `payload`, `status`, `attempts`, `last_error`, `created_at`, `processed_at` |
| `socket_io_attachments` | Adapter do Socket.IO no Postgres    | `id`, `created_at`, `payload`                                                                            |

Índices mínimos: `site_sessions(token_hash)`, `site_sessions(expires_at)`,
`site_sessions(user_id)`, `site_sync_codes(code_hash)`,
`sheet_sync_queue(status, created_at)`.

### 5.4 Propriedade e permissões

- O **site** é dono do schema Prisma e das migrations a partir da D2. O schema fica em
  `prisma/schema.prisma` e o histórico em `prisma/migrations/`.
- O runtime do site usa a role **`kami_app`**, com `CONNECT`, `USAGE` no schema e
  `SELECT/INSERT/UPDATE/DELETE` apenas nas tabelas necessárias; `USAGE/SELECT` nas sequences.
- As migrations usam **`MIGRATION_DATABASE_URL`**, uma role com DDL usada apenas no passo de
  deploy. A aplicação não recebe DDL e nunca conecta como superusuário.
- Conexão via HAProxy local em `127.0.0.1:5432`, database `kami_prod`.
- Toda nova tabela precisa de migration no site e GRANT correspondente para `kami_app`.
- O site não roda `CREATE TABLE`, `ALTER TABLE` nem `CREATE INDEX` em runtime; isso acontece
  apenas no passo de migration, antes do deploy.
- O bot mantém um espelho do schema apenas para gerar o Prisma Client. As migrations do bot
  ficam congeladas; mudanças em tabelas compartilhadas são coordenadas com ele.

### 5.5 Contas sem senha

O bot cria usuários do Discord com `password = NULL` e `email = NULL`. A D2 foi login-only; a
D2.1 adiciona cadastro, então:

- contas com e-mail e senha entram normalmente;
- contas sem senha recebem uma mensagem clara e um caminho de **primeiro acesso via código do
  Discord** em uma etapa posterior;
- o cadastro público simples entra na D2.1, com username, e-mail e senha e sem verificação de e-mail;
- não permitir login por `discord_id` antes do fluxo de vínculo.

O primeiro acesso por Discord segue como dependência do bot e será resolvido em uma etapa
posterior; a D2.1 já permite que novos usuários criem conta no site.

## 6. Entregas

| Entrega | Tema                             | Versão          | Estado            |
| ------- | -------------------------------- | --------------- | ----------------- |
| D0      | Fundação técnica e deploy        | `0.1.0`         | Concluída         |
| D1      | Landing, estatísticas e jurídico | `6.0.0`         | Em produção       |
| D2      | Login e sessão                   | `6.2.0` (dev)   | Concluída no dev  |
| D2.1    | Cadastro simples                 | `6.2.0` (dev)   | Concluída no dev  |
| D2.2    | Painel e conta                   | `6.2.0` (dev)   | Concluída no dev  |
| D3      | Editor de fichas                 | `6.2.0` release | Concluída no dev  |
| D3.1    | Editor multimodo e estrutura     | `6.2.0` (dev)   | Concluída no dev  |
| D3.2    | Status, galeria e tabela         | `6.2.0` (dev)   | Concluída no dev  |
| D3.3    | Mobile, ícones e navegação       | `6.2.0` (dev)   | Concluída no dev  |
| D4      | Fichas públicas                  | `6.2.0` (dev)   | Concluída no dev  |
| D4.1    | Modo leitura do dono             | `6.2.0` (dev)   | Concluída no dev  |
| D5      | Tempo real, sync e hardening     | —               | Depois da 6.2.0   |
| D6      | Tutoriais                        | —               | Fora desta versão |

A versão de desenvolvimento é `6.2.0`; a produção continua `6.0.0`. A D3 e a D4
estão concluídas no desenvolvimento e o release `6.2.0` fica pendente de migração no
`kami_prod`, revisão jurídica e promoção. D2, D2.1, D2.2, D3 e D4 são commits dentro
da 6.2.0; não há bump de versão por entrega. A D0 fica registrada como `0.1.0`,
o histórico da primeira fundação do site.

### D0 - Fundação

**Objetivo:** ter um esqueleto Nuxt que sobe, compila, conecta no Postgres, responde saúde e
está pronto para deploy nas duas VPS.

**Estado:** concluída em 28/10/2026, versão `0.1.0`.

Escopo:

- projeto Nuxt 4 + TypeScript + Options API;
- Git, Prettier, scripts de qualidade;
- `runtimeConfig` público + configuração de servidor validada com Zod;
- pool `pg` + `sql-template-strings`, transação, verificação e shutdown;
- logger estruturado com mascaramento;
- `/api/health` (liveness) e `/api/ready` (banco);
- headers de segurança e log de requisição;
- cópia de `kami.css`, fontes, logo e favicon;
- `app.vue`, layout padrão, `error.vue` e componentes base;
- Vitest, Playwright e um teste de fumaça;
- `.env.example`, `ecosystem.config.cjs`, Nginx de exemplo e documentação de deploy;
- `README.md` e este planejamento.

Aceite:

- `npm run dev` serve `/`, `/api/health` e `/api/ready`;
- `/api/health` responde `200` sem banco;
- `/api/ready` responde `200` com banco e `503` sem banco;
- `npm run typecheck`, `npm run test` e `npm run build` passam;
- `npm run start` sobe o build de produção;
- nenhum segredo no repositório;
- PM2 e Nginx documentados e prontos para copiar.

Resultado em 28/10/2026:

- `npm run check` passou: formato, tipos, 14 testes unitários e build de produção;
- 4 testes E2E de fumaça passaram em Chromium;
- build de produção validado com `/api/health` em `200` e `/api/ready` em `503` sem banco;
- Lighthouse mobile na página inicial: performance, acessibilidade, boas práticas e SEO em
  `100`;
- sem rolagem horizontal em 360px, 390px e 1440px;
- cabeçalho `x-powered-by` removido das respostas;
- repositório Git iniciado com `main` e `dev`.

O `/api/ready` só será validado em `200` quando a role `kami_app` e o HAProxy do cluster
estiverem disponíveis. O contrato de `503` já está coberto por teste.

### D1 - Landing, estatísticas e jurídico

**Objetivo:** publicar a nova cara do Kami com dados reais e substituir os documentos legais.

**Estado:** concluída em 28/10/2026; versão `6.0.0`.

Escopo:

- landing em `/` com **narrativa de produto** sobre o chassi técnico do design system;
- estatísticas reais com cache e fallback;
- ficha de amostra renderizada em HTML e marcada como `AMOSTRA`, com os cinco tipos de atributo;
- macros como roadmap, sem números;
- páginas `/termos` e `/privacidade`, com versões EN em `/terms` e `/privacy`;
- renderizador de blocos de conteúdo em `shared/content`;
- SEO, Open Graph, `robots.txt`, sitemap e `noindex` onde couber;
- redirects de compatibilidade (`/comandos` → `410`, legais e convite preservados);
- estados de carregando, vazio, erro e indisponível;
- revisão do texto jurídico pelo responsável antes de publicar.

Aceite:

- landing indexável, com título/descrição/OG corretos;
- landing descreve fichas, dados e ficha ao vivo sem expor endpoints, telemetria ou dados de deploy;
- estatísticas conferem com o banco e nunca aparecem como zero falso;
- ficha de amostra exibe texto, número, imagem, lista e barra, identificada como fictícia;
- jurídico PT/EN acessível, com data de atualização e links canônicos;
- `/comandos` responde `410`;
- Lighthouse mobile: performance ≥ 90, acessibilidade ≥ 95, SEO ≥ 95;
- funciona em 360px sem rolagem horizontal na página (tabelas podem rolar dentro do bloco).

### D2 - Login e sessão

**Objetivo:** permitir que contas existentes entrem no site sem cadastro público.

**Estado:** concluída no desenvolvimento em 31/10/2026, dentro da `6.2.0`.

Escopo:

- `/entrar` com e-mail e senha;
- `bcryptjs` para comparar hashes gerados pelo bot (`bcrypt` nativo é compatível);
- sessão opaca de 32 bytes, hash SHA-256 em `site_sessions`, cookie
  `kami_sessao` HttpOnly/Secure/SameSite=Lax;
- expiração de 30 dias, renovação de `last_seen_at` e limpeza oportunista;
- logout em `/sair` e `POST /api/auth/logout`;
- proteção CSRF por verificação de origem nas mutações;
- rate limit de login por IP e por e-mail (Cloudflare + aplicação);
- mensagens genéricas para não revelar existência de conta;
- `noindex` nas páginas autenticadas;
- mensagem explícita para contas sem senha; o fluxo por código do Discord fica para uma etapa posterior;
- exclusão de conta: revogar sessões e registrar solicitação; exclusão no bot conforme fluxo
  acordado, também em uma etapa posterior.

Aceite:

- login válido cria sessão e redireciona para `/painel`;
- login inválido não distingue e-mail inexistente de senha errada;
- cookie não é acessível por JavaScript;
- sessão inválida/expirada volta para `/entrar`;
- logout invalida a linha no banco;
- nenhum token em `localStorage`.

Resultado em 31/10/2026:

- `/entrar`, `/painel` e `/sair` publicados; `/login`, `/logout` e `/dashboard` redirecionam;
- sessão opaca de 32 bytes com hash SHA-256 em `site_sessions`, cookie `kami_sessao`
  HttpOnly/SameSite=Lax e expiração de 30 dias;
- CSRF por origem, rate limit por IP e e-mail, mensagem genérica e `noindex` nas rotas privadas;
- 49 testes unitários e 29 E2E passaram no build de produção;
- login real validado contra o Postgres local com uma conta de teste; a base local só tinha
  contas criadas pelo Discord, então a validação de produção ainda depende de uma conta real;
- primeiro acesso por código do Discord e exclusão de conta ficam para uma etapa posterior;
- texto de cookies atualizado, com `legalReviewPending` em `true` até a revisão humana antes do deploy.

### D2.1 - Cadastro simples

**Objetivo:** permitir criar uma conta no site com e-mail e senha, sem depender do Discord.

**Estado:** concluída no desenvolvimento em 31/10/2026, dentro da `6.2.0`.

Escopo:

- `/cadastrar` com username, e-mail, senha, confirmação e aceite dos termos;
- username obrigatório, único e com 3 a 32 caracteres (letras, números e underline);
- hash bcryptjs com custo 12; `users.terms_accepted_at` registra o aceite e
  `users.email_verified_at` fica nulo para a verificação futura;
- login automático após o cadastro, reutilizando `site_sessions` e o cookie `kami_sessao`;
- e-mail ou username duplicado responde `409` com caminho para `/entrar`;
- rate limit por IP e e-mail e proteção CSRF por origem;
- sem verificação de e-mail e sem recuperação de senha nesta etapa; suporte assume o fluxo manual;
- o vínculo/merge com o Discord fica para depois; um conflito de username será reconciliado no merge;
- textos jurídicos atualizados para incluir os dados de conta do site.

Aceite:

- cadastro válido cria a conta, abre a sessão e leva ao `/painel`;
- e-mail ou username duplicado não cria outra conta;
- a senha é armazenada como hash, nunca em texto puro;
- a conta fica ativa imediatamente, sem verificação de e-mail;
- `/cadastrar` responde com `noindex`;
- CSRF e rate limit cobertos por teste.

Resultado em 31/10/2026:

- 56 testes unitários e 34 E2E passaram no build de produção;
- cadastro real validado no Postgres local com uma conta de teste, incluindo username;
- a verificação de e-mail e a recuperação de senha ficam como pendências explícitas.

### D2.2 - Painel e conta

**Objetivo:** dar ao usuário uma visão real da conta, das fichas, do que está ao vivo e das macros, com
configurações básicas de conta.

**Estado:** concluída no desenvolvimento em 31/10/2026, dentro da `6.2.0`.

Escopo:

- layout autenticado com navegação local: Visão geral, Fichas, Ao vivo, Macros, Configurações e Sair;
- `/painel` com conta, contagens reais (fichas, públicas, ao vivo/IRT, macros) e últimas fichas atualizadas;
- `/fichas` somente leitura, com badges PÚBLICA, AO VIVO e LEGADA; a D3 transforma em editor;
- `/ao-vivo` lê `irt_sheets` e mostra canal, mensagem e último uso; sem link/desvincular;
- `/macros` somente leitura, com aviso de “em desenvolvimento”;
- `/configuracoes` com username, e-mail somente leitura, status do Discord e troca de senha com a senha atual;
- troca de senha sem revogar as demais sessões nesta etapa; a revogação/força-login fica para o hardening da D5;
- topbar ciente da sessão fora do painel, `/sync` → `/painel`, guards e `noindex` nas rotas privadas;
- nenhuma migration nova: o painel usa `users`, `sheets`, `irt_sheets`, `macros` e `site_sessions`.

Aceite:

- visitante anônimo é redirecionado para `/entrar` em todas as rotas do painel;
- conta, contagens e recentes refletem o banco, sem zero falso;
- IRT aparece como área de primeira classe, somente leitura até a D5;
- macros aparecem somente leitura, sem prometer edição;
- troca de username valida unicidade e troca de senha exige a senha atual;
- `noindex`, 360 px e estados de indisponibilidade cobertos por E2E.

Resultado em 31/10/2026:

- 68 testes unitários e 39 E2E passaram no build de produção;
- painel validado com login real no Postgres local;
- IRT e macros ficam como leitura até D5 e a definição do editor de macros;
- a revogação de sessões na troca de senha fica como pendência de hardening.

### D3 - Editor de fichas

**Objetivo:** criar e editar fichas no site com a mesma estrutura que o bot entende.

**Estado:** concluída no desenvolvimento em 31/10/2026, dentro da `6.2.0`.

Escopo:

- `/fichas` lista as fichas do usuário;
- `/fichas/:id` editor com seções e os cinco tipos de atributo;
- criar, renomear, duplicar e excluir ficha;
- validação Zod dos limites do bot (nome, seção, atributo, valor);
- editor de lista (`items`) e barra (`actual`, `max`, `min`, `step`);
- normalização de ficha `legacy` na leitura e gravação no formato novo;
- concorrência otimista por `last_use` com resposta `409`;
- ficha vinculada a IRT é somente leitura até a D5;
- renomear/excluir ficha vinculada a IRT é bloqueado;
- autosave não; salvamento explícito com estado sujo e aviso ao sair;
- preview de leitura compartilhado com a D4, com dois modos de visualização e toggle local;

Aceite:

- todos os cinco tipos renderizam e editam sem perda de dados;
- ficha IRT não aceita alteração e explica o motivo;
- duas abas não sobrescrevem uma à outra silenciosamente;
- ficha `legacy` abre, lê e salva no formato novo;
- nenhuma query do editor sai do controller;
- o toggle de visualização não altera a ficha nem grava preferência no banco.

Resultado em 31/10/2026:

- 104 testes unitários e 42 E2E passaram no build de produção;
- os cinco tipos renderizam, salvam e recarregam sem perda de dados;
- ficha `legacy` normaliza na leitura e grava o formato novo no primeiro save;
- conflito por `last_use` responde `409` e a interface oferece recarregar;
- ficha vinculada a IRT responde `423` e a interface abre em modo somente leitura;
- duplicar cria uma cópia privada, sem senha e sem vínculo IRT;
- o release `6.2.0` fica pendente de migração no `kami_prod`, revisão jurídica e promoção.

### D3.1 - Editor multimodo e estrutura da ficha

**Objetivo:** separar conteúdo, posicionamento e estrutura sem criar um formato paralelo ao do bot.

**Estado:** concluída no desenvolvimento em 01/11/2026, dentro da `6.2.0`.

Escopo:

- seletor de modo na sidebar do editor (`EDITAR`, `POSICIONAMENTO`, `ESTRUTURA`), com `<select>`
  equivalente abaixo de `900px`;
- `POSICIONAMENTO`: mapa de todas as seções com os atributos em cartões, busca por nome, e
  movimentação de atributo dentro da seção e entre seções por arraste ou pelo seletor “→ SEÇÃO”;
- `ESTRUTURA`: canvas com a ficha renderizada no modo documento (WYSIWYG). A grade tem 12 colunas,
  cada seção ocupa de `1` a `12` (largura livre, com atalhos `12/8/6/4/3`) e seções que cabem na
  mesma linha ficam lado a lado, como na amostra da landing. Inspetor da seção selecionada em
  grupos (largura da seção, grade, atributos e ordem), com tipografia maior (13px nos nomes, 11px
  nos títulos e 12px nas dicas) e coluna de 340px; a grade expõe colunas (`1`–`12`), linhas
  (`1`–`32`, com `AUTO`), preenchimento de espaços vazios (`dense`) e largura/altura individual de
  cada atributo. A largura continua editável mesmo com as linhas em `AUTO`, e só o campo de
  altura fica desabilitado nesse estado; largura e altura são campos numéricos com clamp
  (`1..colunas` e `1..rows`), iguais ao campo de largura da seção. Linhas da mesma faixa esticam
  para a mesma altura e a grade de atributos preenche o espaço restante, sem sobra embaixo;
- a antiga `APRESENTAÇÃO` foi absorvida pela `ESTRUTURA`; não existe mais prévia dupla;
- persistência em `sheets.sheet_layout` (`JSONB` nullable), chaveada por nome de seção e de
  atributo; `span` ausente equivale a `12` e `rows` ausente mantém a altura automática, então layout
  antigo continua válido; o bot ignora a coluna e continua lendo apenas `attributes`;
- `normalizeSheetLayout` poda seções e atributos inexistentes, limita o `span` da seção a `1..12`,
  `rows` a `1..32`, a largura do atributo a `1..columns` e a altura a `1..rows`, converte o par
  igual ao padrão em ausência (imagem, lista e barra ocupam a linha; texto e número, uma coluna), lê
  o número antigo como `{ span, rows: 1 }`, remove entradas sem efeito e devolve `null` quando não
  há layout; não há teto de 8 KB, só o limite de corpo de 512 KB;
- com `rows` definido o componente monta `grid-template-rows: repeat(rows, minmax(56px, auto))` e
  cada atributo usa `grid-row: span N`; `dense` liga `grid-auto-flow: dense`; abaixo de `900px` e no
  modo `secoes` as linhas voltam a ser automáticas;
- renomear seção ou atributo não perde o layout, porque o editor alinha o rascunho por índice e
  serializa por nome apenas no salvamento;
- duplicar ficha copia o layout junto com os atributos;
- a prévia deixou de ficar aberta por padrão: abre como modal centralizado no botão `PRÉVIA`, na
  largura do documento (`1180px`), para refletir o uso normal da ficha; no modo `ESTRUTURA` o botão
  some, porque o canvas já é a prévia;
- as rotas de editor usam a largura total da janela, com o gutter do site;
- EDITAR mantém as linhas em caixa fechada com fundo alternado, agora com contraste perceptível;
- o layout vale para a prévia do editor, a ficha pública (D4) e a ficha ao vivo (D5); contêineres
  estreitos caem para uma coluna via container query;
- no documento, o tipo do atributo não é exibido em cada item (só o tipo da seção); números usam a
  fonte de display, centralizados e com tamanho calculado para preencher a célula (limitado pela
  largura e pela altura, recalculado em resize e quando o layout muda), e barras exibem
  `atual / máximo` em destaque sobre o trilho, sem repetir `mín.`/`máx.` abaixo (os limites ficam
  em `aria-valuemin`/`aria-valuemax` do `role="meter"`);
- barras têm `−` e `+` (um passo por clique, limitado a `min`/`max`) e listas têm `−`/`+` na
  quantidade (mínimo 1), adicionar/remover item e mover com `↑`/`↓` ou arraste, com cada item em
  caixa fechada e fundo alternado. A linha da barra mostra só ATUAL, MÍN. e MÁX.; PASSO e COR
  ficam no modal `AJUSTES DA BARRA` (ícone `⚙`), com prévia do preenchimento que também reflete a
  cor de fundo do trilho (`background`), o estilo `solid`/`segmented` (um segmento por ponto do
  máximo, até 60) e o alerta `flashBelow` (padrão 25%, `blink` ligado por padrão, com `blink:
false` para desligar e `prefers-reduced-motion` respeitado). Barras aceitam cor opcional
  `#rrggbb` no valor (ausente usa o azul do sistema), com color picker, quatro sugestões
  (vermelho, verde, azul e branco) e o botão `PADRÃO` para limpar.
  Os controles da lista só aparecem no modo de edição do atributo
  (botão `EDITAR`/`CONCLUIR` no cabeçalho, só para listas), que também transforma o nome do item em
  input; `KamiSheetView` recebe `adjustable` e emite `adjust-bar`, `adjust-quantity`,
  `add-list-item`, `remove-list-item`, `move-list-item` e `update-list-name`. A ficha pública e a ao
  vivo ficam sem os botões.

Aceite:

- os três modos compartilham o mesmo rascunho e um único salvamento;
- duas seções com `6 + 6` ou `8 + 4` aparecem lado a lado, `12` ocupa a linha e o celular empilha;
- mover atributo entre seções renumera as posições e sobrevive a salvar e recarregar;
- layout órfão é descartado sem erro e ficha sem layout renderiza como antes;
- contraste das linhas alternadas mantém AA e o celular continua sem rolagem horizontal.

Resultado em 01/11/2026:

- migration `20261101120000_sheet_layout` aplicada no `kami_new`;
- linhas do editor em caixa fechada com fundo alternado mais visível e divisórias internas fracas;
- prévia em modal no modo documento, sem coluna fixa nem drawer;
- 110 testes unitários e 42 E2E passaram no build de produção.

### D3.2 - Status, galeria e tabela

**Objetivo:** ampliar os tipos de seção do editor sem mudar a API existente nem o fluxo de salvamento.

**Estado:** concluída no desenvolvimento em 03/11/2026, dentro da `6.2.0`.

Escopo:

- novos tipos de seção `3 = STATUS`, `4 = GALERIA` e `5 = TABELA`, e novos tipos de atributo
  `5 = STATUS` e `6 = TABELA`. Status e tabela usam um único atributo especial por seção; a galeria
  continua usando atributos de imagem comuns;
- status: `{ items: [{ id, name, color, blink, active, icon }] }`, até 32 cards que preenchem a
  seção, com nomes definidos pelo usuário, cor de ativação, blink opcional e estado ativo salvo na
  ficha. O ícone é opcional: sem URL ele usa um anel genérico na cor do status; com URL, a imagem
  cresce dentro do card. No editor e na prévia o card alterna o estado (emitindo `toggle-status`); na
  ficha ao vivo ele apenas reflete o estado;
- galeria: colunas da seção de `1` a `6` (padrão `3`) e `span` por imagem de `1` até as colunas
  (padrão `1`), porque a proporção das imagens varia. A imagem mantém a proporção natural e abre um
  lightbox com teclado (`Esc`, `←`, `→`) e botões físicos de anterior, próxima e fechar. Qualquer
  outro atributo de imagem (inclusive a imagem do cabeçalho) abre o mesmo lightbox com um único item,
  sem carrossel, e o botão de fechar fica alinhado ao canto superior direito da imagem;
- tabela: `{ columns: string[], rows: string[][] }` com 2–8 colunas, até 100 linhas, coluna de 1 a
  32 caracteres e célula de até 128; só células de texto nesta etapa;
- status e tabela não usam a grade de colunas/linhas da seção; a galeria não usa `rows` nem `dense`;
- no `POSICIONAMENTO`, seções que não recebem atributos (descrição, status e tabela) mostram um texto
  de bloco único e ficam bloqueadas: não aceitam drop nem aparecem como destino no seletor `→ SEÇÃO`.
  A galeria só é oferecida como destino para atributos de imagem, no seletor e no arraste;
- o editor cria o bloco especial ao escolher o tipo, bloqueia a conversão quando a seção tem
  atributos incompatíveis e, ao sair de status/tabela, confirma e remove o bloco;
- o JSON do bot continua com `sections`/`attributes`; o layout continua em `sheet_layout` e os tipos
  novos exigem atualização do bot, que não é bloqueio desta entrega.

Aceite:

- criar uma seção de status, alternar um botão no editor, salvar e recarregar mantém o estado ativo;
- a galeria respeita `span` por imagem e o lightbox navega por teclado e pelos botões;
- a tabela edita células, adiciona/remove linhas e colunas e o servidor devolve o mesmo valor;
- seções comuns recusam os atributos 5 e 6, e status/tabela recusam outros atributos.

Resultado em 03/11/2026:

- `sheetStatusItemSchema`, `sheetTableValueSchema`, `normalizeStatusValue` e `normalizeTableValue`
  aplicam os limites no Zod e na normalização; o rascunho do editor repete as mesmas regras;
- `SHEET_GALLERY_COLUMNS_MAX`, `defaultAttributeSpanFor` e `clampGalleryColumns` centralizam a
  galeria em `shared/utils/sheet-layout.ts`;
- 137 testes unitários e 48 E2E no build de produção (44 anteriores + 4 novos, 1 skip).

### D3.3 - Mobile do editor, ícones e navegação

**Objetivo:** fechar a experiência mobile do editor e padronizar ícones e navegação antes da D4, sem abrir recursos novos.

**Estado:** concluída no desenvolvimento em 03/11/2026, dentro da `6.2.0`.

Escopo:

- barra inferior fixa no editor em telas de até `900px`, com SALVAR, descartar, prévia e configurações; as ações duplicadas do topo somem no mobile e o conteúdo ganha respiro para a barra;
- alvos de toque de 40–44px nos modos, seções, ações de atributo e navegação;
- `POSICIONAMENTO` compacto: cada atributo em duas faixas (nome/tipo e ações/seletor), sem arraste nativo no toque e sem caixas aninhadas;
- `ESTRUTURA`: canvas em largura total e atalho “AJUSTES DA SEÇÃO” que leva ao inspetor empilhado;
- ícones internos em SVG 24x24 (`KamiIcon`), com `currentColor` e `aria-hidden`, substituindo os caracteres ASCII do editor e do `KamiSheetView`; ações destrutivas usam lixeira e fechar usa `x`;
- navbar do painel redesenhada com ícone + label e estado ativo em pill no desktop; no mobile vira uma barra de cinco abas curtas e some dentro do editor, onde a barra inferior já concentra as ações;
- diálogos (CONFIGURAÇÕES, AJUSTES DA BARRA, PRÉVIA e lightbox) travam o scroll do documento, prendem o Tab/Shift+Tab e devolvem o foco ao gatilho; o contador de locks permite lightbox sobre a prévia.

Aceite:

- em 360px não há rolagem horizontal em nenhum modo;
- a barra inferior salva a ficha e não duplica as ações do topo;
- o lightbox e os modais mantêm o foco dentro e o body sem scroll enquanto abertos;
- a navbar mobile usa os rótulos curtos e desaparece no editor;
- os botões de ícone continuam com nomes acessíveis.

Resultado em 03/11/2026:

- 6 E2E novos em `tests/e2e/sheets-mobile.spec.ts` (barra inferior, posicionamento, foco/scroll dos modais, lightbox e navbar);
- 137 testes unitários e 53 E2E no build de produção (47 anteriores + 6 novos, 1 skip).

### D4 - Fichas públicas

**Objetivo:** compartilhar fichas por link, com privacidade controlada.

**Estado:** concluída no desenvolvimento em 04/11/2026, dentro da `6.2.0`.

Escopo:

- preservar `/ficha/:userId/:sheetName`;
- `is_public` e senha opcional;
- verificação de senha compatível com bcrypt e com o legado em texto puro;
- rehash de senha legada em acesso bem-sucedido, se o bot autorizar a escrita;
- cookie de acesso assinado, curto, por ficha;
- `noindex, nofollow` e `X-Robots-Tag` por padrão;
- 404 para ficha privada, sem revelar existência;
- rate limit de tentativa de senha;
- renderização somente leitura, sem `v-html` de conteúdo do usuário;
- controles do dono para tornar pública, definir/remover senha e copiar link.

Aceite:

- link público abre sem login;
- ficha privada sem senha responde 404;
- senha errada não permite acesso e é limitada;
- ficha pública não aparece em buscadores;
- URL antiga continua funcionando.

Resultado em 04/11/2026:

- `GET /api/ficha/:userId/:sheetName` responde `404` para ficha inexistente ou privada e `401` (`sheet_password_required`) quando falta o cookie de acesso; a página `/ficha/:userId/:sheetName` renderiza o formulário de senha nesse caso;
- `POST /api/ficha/:userId/:sheetName/acesso` valida a senha (bcrypt novo ou texto puro legado) com rate limit de 10 tentativas por 15 minutos por IP e ficha, e grava o cookie `kami_ficha_<id>` assinado por HMAC com `SESSION_SECRET`, `HttpOnly`, `SameSite=Lax`, TTL de 1 hora;
- `PATCH /api/fichas/:id/publicacao` recebe `{ version, isPublic, password? }`; `password` omitido mantém a senha, `null` remove e um valor novo é gravado em bcrypt (custo 12); a seção `COMPARTILHAMENTO` do modal `CONFIGURAÇÕES` controla isso e copia o link;
- a ficha pública reutiliza o `KamiSheetView` em modo documento, sem controles de edição, com `noindex, nofollow`, `X-Robots-Tag` e `Cache-Control: private, no-store`;
- busca pública escolhe a ficha pública mais recente quando há nomes duplicados históricos e nunca revela fichas privadas;
- o rehash de senha legada em acesso bem-sucedido continua pendente de autorização de escrita do bot;
- 20 testes unitários novos (senha bcrypt/legado, token/cookie, compartilhamento e schema) e 3 E2E novos (privada 404, senha com cookie e modal); a suíte fechou com 157 unitários e 57 E2E aprovados + 1 skip no build de produção.

### D4.1 - Modo leitura do dono

**Objetivo:** permitir que o dono veja a ficha sem o chrome do editor antes de abrir o compartilhamento público.

**Estado:** concluída no desenvolvimento em 04/11/2026, dentro da `6.2.0`.

Escopo:

- o editor alterna para leitura por `?ver=1` na mesma rota `/fichas/:id`, sem recarregar e sem perder o rascunho;
- a leitura renderiza o `KamiSheetView` no modo documento, sem sidebar, header de edição, inspetor, barra de ações ou controles (`adjustable` desligado);
- cabeçalho enxuto com nome da ficha, aviso de alterações não salvas e botões `EDITAR` e `FICHAS`;
- atalho `Ctrl+Shift+V` alterna leitura/edição (ignorado enquanto o foco está em campo de texto, para não roubar o colar sem formatação); `Esc` sai da leitura;
- a prévia em modal foi substituída por esse modo, que usa o mesmo rascunho e preserva a rolagem ao voltar;
- o link público, senha e controle de privacidade continuam pendentes na D4.

Aceite:

- entrar na leitura mostra alterações não salvas e sair mantém o rascunho no editor;
- o modo leitura não exibe tipo/largura de seção nem controles de edição;
- o atalho funciona no desktop e a barra inferior mobile some na leitura;
- a URL com `?ver=1` abre direto no modo leitura.

Resultado em 04/11/2026:

- 1 E2E novo de rascunho + atalho e a checagem do modo leitura no E2E mobile;
- 137 testes unitários e 54 E2E no build de produção (53 anteriores + 1 novo, 1 skip).

### D5 - Tempo real, sincronização e hardening

**Objetivo:** atualizar fichas em tempo real, sincronizar com o Discord e fechar a segurança.

Escopo:

- Socket.IO na mesma porta, websocket-only, path `/socket.io`;
- `@socket.io/postgres-adapter` com `socket_io_attachments`;
- autenticação do socket pela mesma sessão opaca;
- salas por usuário e por ficha; eventos `ficha-alterada` e `ficha-excluida`;
- outbox `sheet_sync_queue` para atualizações de IRT;
- consumo pelo bot com idempotência, retry e dead-letter;
- sincronização site → bot por código (`site_sync_codes`);
- edição de ficha IRT liberada somente depois do contrato de sync;
- CSP, rate limits finais, revisão de logs, auditoria e teste de carga;
- ensaio de failover e restore.

Aceite:

- duas abas veem a mesma alteração sem recarregar;
- ficha IRT atualiza o Discord via fila, sem perda em retry;
- sessão expirada derruba o socket;
- CSP não quebra a aplicação;
- failover de uma VPS não perde sessão nem escrita.

### D6 - Tutoriais (fora desta versão)

`/tutoriais` continua temporariamente redirecionado. A entrega futura decide se os tutoriais
vivem no site, no bot ou nos dois, com conteúdo em `shared/content` e slugs estáveis.

## 7. Landing (D1)

### 7.1 Direção

**Produto primeiro, chassi técnico.** A landing mantém a identidade do design system - fundo
escuro, grade, tipografia condensada, monoespaçado, painéis e azul de acento - mas usa essa
linguagem para apresentar o que o Kami faz, não a infraestrutura. O visitante deve sair
sabendo que o Kami organiza fichas de personagem, rola dados e mantém a ficha viva no Discord.

O que sai da página pública: endpoints, health/ready, latência, ambiente, relógio, versão de
deploy, tabela de entregas e qualquer vocabulário de operação interna.

O que evitar:

- hero com ilustração genérica, stock photo ou gradiente colorido;
- cards arredondados, sombras difusas e ícones fofos;
- "revolucione suas sessões", "a melhor plataforma", emoji e exclamação;
- número inventado, depoimento fictício, logo de cliente falso;
- excesso de animação;
- transformar a landing em painel de telemetria ou changelog técnico.

### 7.2 Seções

1. **Topbar** - marca, subtítulo de produto, navegação por âncoras (recursos, ficha, como
   funciona, perguntas), link para o servidor de suporte e CTA para adicionar o Kami. Sem
   ambiente, status ou relógio.
2. **Hero de produto** - coluna esquerda com eyebrow, H1 curto sobre fichas e dados,
   subtítulo de uma ou duas linhas, CTA principal para adicionar o Kami e CTA secundário para
   a ficha de amostra. À direita, uma captura real do Kami no Discord, em proporção quase
   quadrada e limitada a 560px.
3. **Faixa de estatísticas** - uma faixa editorial, não quatro cartões de dashboard:
   jogadores cadastrados, ativos nos últimos 30 dias, fichas criadas e interações
   (comandos + componentes). Timestamp discreto e estado de indisponibilidade.
4. **O que dá para fazer** - três blocos: fichas personalizáveis (cinco tipos), rolagem de
   dados (operações, vantagem/desvantagem, comparadores) e ficha ao vivo (IRT). Macros e
   campanhas aparecem como roadmap, sem número.
5. **Ficha de amostra** - o herói visual da página: ficha completa renderizada em HTML, com
   etiqueta `AMOSTRA`, personagem fictício e os cinco tipos visíveis.
6. **Como funciona** - três passos: adicionar o Kami, ficha, mesa. Cada passo com uma frase
   curta.
7. **Perguntas frequentes** - preço, instalação, sistemas, ficha ao vivo, privacidade e idioma.
8. **CTA final e rodapé** - adicionar o Kami, suporte, termos e privacidade.

Toda seção principal começa com um fio de 1px. A faixa de estatísticas mantém a borda superior
full-bleed e a seção seguinte fecha a faixa com o fio do container; as demais transições usam o
mesmo fio com respiro acima e abaixo.

### 7.3 Copy

- PT-BR direto, de produto, sem hype e sem vocabulário de infraestrutura.
- Falar de "ficha", "mesa", "jogadores" e "dados"; não de "usuários técnicos", "endpoints" ou
  "telemetria".
- Títulos em caixa alta com tracking; corpo em Barlow, caixa normal.
- Números com separador pt-BR; datas com fuso `America/Sao_Paulo`.
- Macros sempre "em desenvolvimento" até o bot confirmar uso.
- Nenhuma promessa de login antes da D2; o CTA da D1 é adicionar o Kami.
- O Discord fica como canal de suporte e operação, não como protagonista da narrativa; a
  landing deve continuar fazendo sentido quando a plataforma web assumir o jogo.
- Quando a D2 entrar, o CTA principal passa a ser "ENTRAR" e o convite vira secundário.
- Textos em `shared/content/landing/pt-br.ts`; EN depois, sem duplicar componente.

### 7.4 Ficha de amostra

- Renderizada em HTML com a mesma gramática visual da leitura da D3/D4, não por screenshot.
- Etiqueta `AMOSTRA` visível, personagem fictício e legenda de dados demonstrativos.
- Mostra os cinco tipos: texto (identidade/anotações), número (atributos), imagem (retrato),
  lista (inventário) e barra (recursos).
- Cada bloco identifica o tipo de atributo em rótulo discreto.
- Em telas pequenas, os blocos empilham; a página não rola horizontalmente.
- Nenhum dado de usuário real.

### 7.5 Dados e estados

- Estatísticas buscadas no servidor durante o SSR (`asyncData` / `$fetch` interno).
- Cache de 60s, stale de 15min, `503` sem cache.
- Estado de carregando: esqueleto com a mesma altura para não deslocar o layout.
- Estado de erro: nota na faixa com "ESTATÍSTICAS INDISPONÍVEIS" e horário da última leitura.
- Estado vazio: `-` e legenda, nunca `0` quando a fonte não respondeu.
- A faixa não bloqueia a renderização da landing; se o banco falhar, o restante da página
  continua completo.

### 7.6 SEO, performance e acessibilidade

- Título, descrição, canonical e OG por página. A landing usa a origem real da requisição
  para canonical e OG, então dev, túnel e produção não emitem `localhost`.
- OG estático em `public/og/kami-site.png`; sem dependência de geração dinâmica na D1.
- `robots.txt` permite landing/legal, bloqueia `/api/`, `/painel`, `/fichas`, `/entrar` e
  `/ficha`.
- Sitemap apenas com páginas estáticas e legais; fichas públicas ficam fora.
- Fontes com `font-display: swap`; preload apenas do display e do mono usados acima da dobra.
- Logo em WebP com `width`/`height` e `fetchpriority="high"`.
- Sem biblioteca de gráfico, carrossel ou animação pesada.
- Lighthouse mobile: performance ≥ 90, acessibilidade ≥ 95, SEO ≥ 95.
- Skip link, foco visível, contraste ≥ 4.5:1, `prefers-reduced-motion`, teclado.
- Relógio não usa `aria-live`; status do sistema usa `role="status"` apenas quando muda.

## 8. Design system

### 8.1 O que copiar

- `kami.css` inteiro, sem editar, em `app/assets/css/kami.css`;
- fontes `Oswald` e `Fira Code` + licenças OFL em `public/fonts/`;
- logo `Logo-256px.webp` e favicon em `public/marca/`.

### 8.2 O que adicionar

- **Barlow** (Regular e Medium, OFL) como fonte de prosa, em `public/fonts/`;
- `site.css` com `@font-face` da Barlow, tokens `--site-*` e classes de página
  (`.site-container`, `.site-prosa`, `.site-hero`, `.site-grade`, `.site-eyebrow`);
- componentes Vue próprios em Options API, sem copiar os SFCs do design system
  (`<script setup>`, `Math.random()` e props não tipadas não entram no site).

### 8.3 Componentes base (D0)

| Componente          | Uso                                                   |
| ------------------- | ----------------------------------------------------- |
| `KamiButton`        | Ações com variantes default/primary/solid/danger      |
| `KamiPanel`         | Moldura de seção com rótulo e código                  |
| `KamiSection`       | Cabeçalho de bloco com marca, rótulo, fio e meta      |
| `KamiStat`          | Cartão de métrica com código, valor, unidade e estado |
| `KamiChip`          | Estado com ponto + texto (nunca só cor)               |
| `KamiTag`           | Rótulo curto                                          |
| `KamiEmptyState`    | Vazio/erro com ação opcional                          |
| `KamiLoading`       | Indicador com texto                                   |
| `KamiTopbar`        | Marca, navegação, suporte e CTA                       |
| `KamiFooter`        | Links legais e suporte                                |
| `KamiTablePreview`  | Prévia da mesa no hero                                |
| `KamiSampleSheet`   | Ficha de amostra com os cinco tipos                   |
| `KamiQuestions`     | FAQ com `details`/`summary` nativos                   |
| `KamiLegalDocument` | Renderizador jurídico PT/EN                           |

### 8.4 Regras visuais

- Sem `border-radius`; sem tema claro.
- Azul é o estado saudável; verde só para "ao vivo"; âmbar e vermelho reservados.
- Rótulos em caixa alta com tracking; prosa em caixa normal.
- Números em monoespaçado (`--kami-font-mono` / `.kami-num`).
- Toda tela tem carregando, vazio e erro.
- Toda classe usa tokens; nenhum valor literal de cor/tamanho/fonte em componente.
- `kami.css` é a fonte de verdade; ajustes do site ficam em `site.css`.

## 9. Autenticação e sessão (D2)

- Login only na D2; a D2.1 adiciona cadastro simples com username, e-mail e senha, sem verificação de e-mail; a D2.2 adiciona o painel autenticado, com IRT e macros somente leitura.
- `POST /api/auth/login` recebe `{ email, password }`, valida com Zod, busca usuário por e-mail
  normalizado e compara com `bcryptjs`.
- Sessão opaca: 32 bytes aleatórios, cookie `kami_sessao`, hash SHA-256 em `site_sessions`.
- Cookie `HttpOnly`, `Secure` em produção, `SameSite=Lax`, `Path=/`, `Max-Age` de 30 dias.
- Nenhum JWT, nenhum token em `localStorage`, nenhum dado sensível no cliente.
- `last_seen_at` renovado no máximo uma vez por hora para não escrever a cada requisição.
- Limpeza de sessões expiradas no login e em uma rotina diária.
- CSRF: verificação de `Origin`/`Referer` nas mutações + `SameSite=Lax`; token explícito se
  necessário.
- Rate limit: Cloudflare + contador por IP/e-mail; mensagens genéricas.
- Logout: apaga a linha e limpa o cookie.
- Sessão inválida em página autenticada: redireciona para `/entrar?redirecionar=...`.
- `noindex` em `/entrar`, `/cadastrar`, `/painel`, `/fichas`, `/ao-vivo`, `/macros`, `/configuracoes` e `/sair`.
- Troca de senha no painel exige a senha atual; nesta etapa de desenvolvimento ela não revoga as outras sessões. A revogação/força-login fica no hardening da D5.
- Exclusão de conta: revoga sessões, registra solicitação e encaminha ao bot; o site não apaga
  dados do Discord sozinho.

## 10. Editor de fichas (D3)

- Estrutura JSON idêntica à do bot; o site não cria um formato paralelo.
- Seções com nome, posição e tipo (`0` padrão, `1` descrição).
- Cinco tipos:
    - texto: string;
    - número: número;
    - imagem: URL validada;
    - lista: itens `{ name, quantity }`;
    - barra: `{ actual, max, min, step }`.
- Limites reais do backend do bot: nome de ficha até 32; seção entre 2 e 20; atributo até
  32; texto até 1024; número com até 32 caracteres; item de lista com nome até 32 e
  quantidade em dígitos; barra com inteiros de até 32 dígitos, `min <= max`, `actual`
  entre os dois, `step >= 1` e `step <= max`. O site não replica a regex de nome do bot;
  aceita qualquer caractere imprimível dentro dos mesmos limites de tamanho.
- Ficha `legacy`: converte na leitura; o primeiro save grava `sections` e `legacy = false`.
- Ficha com IRT: somente leitura até a D5; renomear/excluir bloqueado com explicação.
- Duplicar copia `attributes` e `legacy`, mas cria uma ficha privada, sem senha e sem
  vínculo IRT.
- Concorrência: `last_use` como versão; `UPDATE ... WHERE id = $1 AND user_id = $2 AND
date_trunc('milliseconds', last_use) = $3`; se 0 linhas, `409` com opção de recarregar.
- Salvamento explícito, estado sujo, atalho `Ctrl+S`, aviso de saída.
- Validação no cliente para UX e no servidor como fonte de verdade.
- Nenhum HTML do usuário renderizado com `v-html`.
- Seção `type: 1` (descrição) é um único texto multilinha, sem atributos: guarda no máximo um
  atributo de texto interno (nome oculto), aceita vazio e até 4096 caracteres; texto de seção
  padrão continua entre 1 e 1024. Seções antigas com vários atributos permanecem intactas e o
  editor oferece “converter em texto”, que junta `Nome: valor` e falha se passar de 4096. No modo
  `EDITAR` o texto é um `textarea` sempre editável; no canvas `ESTRUTURA` e na prévia o cabeçalho
  da seção tem o mesmo toggle `EDITAR`/`CONCLUIR` dos atributos de lista, que abre o `textarea` ali
  mesmo e altera o rascunho sem entrar no modo de edição.
- Seção `type: 2` (cabeçalho): título e subtítulo fixos no topo da coluna esquerda, imagem
  opcional à direita (largura 1–12, padrão 4) e grade de atributos livres abaixo; sem imagem a
  coluna direita some e a grade ocupa a largura toda. Os papéis ficam em
  `sheet_layout.header` (`title`, `subtitle`, `image`, `imageWidth`, `titleSize`) apontando para
  atributos comuns, então o JSON do bot não muda. O título nunca quebra: a fonte parte de
  `titleSize` (32–96, padrão 56) e encolhe até 18px, com elipse se ainda não couber. O editor
  cria `Título`, `Subtítulo` e `Imagem` ao escolher o tipo e mantém os demais atributos na grade
  livre; não há conversão de seções antigas. Abaixo de 900px o bloco empilha.
- Exclusão fica fora do header, no modal `CONFIGURAÇÕES`, com confirmação dupla e bloqueio por
  IRT; o modal é o lugar para as próximas opções da ficha (pública, senha e link).
- Layout do editor: a partir de `901px` as seções ficam em sidebar com contagem de atributos e só
  a seção ativa é editada; abaixo disso a sidebar vira um `<select>`.
- Cada atributo é uma linha densa (alça, tipo, nome, valor e ações), com duplicar e mover por
  botões além do arraste HTML5; listas ficam resumidas em “N ITENS + EDITAR” e expandem inline.
  Tipo, nome e valor têm rótulos visíveis e os controles (34px) ficam alinhados; na barra as
  labels são ATUAL/MÍN./MÁX. e as ações acompanham a mesma faixa.
- A prévia de `KamiSheetView` abre em modal centralizado na largura do documento (`1180px`) só
  quando o botão é clicado; sem coluna fixa ou drawer, fechando por `Esc` ou clique no backdrop.
- Estrutura da ficha: grade de 12 colunas no modo documento, com `span` livre por seção (`1` a
  `12`), edição WYSIWYG no modo `ESTRUTURA` e inspetor com colunas internas e largura individual de
  cada atributo dentro dessas colunas. Seções da mesma faixa ficam lado a lado e esticam para a
  mesma altura; abaixo de `900px` toda seção ocupa a linha inteira.

### 10.1 Modos de visualização

- `documento` (padrão): página contínua com todas as seções e os cinco tipos de atributo, com
  índice de seções e âncoras para deep-link.
- `secoes`: uma seção por vez, com navegação explícita entre elas.
- O toggle é local: chave `kami:ficha:modo` no `localStorage`; não é salvo na ficha, não entra no
  JSON, não é sincronizado e não gera `last_use` nem linha na `sheet_sync_queue`.
- O mesmo componente de leitura atende o preview do editor, a ficha pública (D4) e a ficha ao vivo
  (D5).
- A edição continua por seções; o toggle muda apenas a visualização.
- Sem preferência na conta: cada navegador escolhe o seu modo.

## 11. Fichas públicas (D4)

- Rota preservada: `/ficha/:userId/:sheetName`.
- Nome da ficha na URL é exato e URL-encoded; 404 se não existir, não for pública ou a senha
  não tiver sido validada.
- Senha opcional:
    - hash bcrypt (`$2a$`, `$2b$`, `$2y$`) → `bcrypt.compare`;
    - texto puro legado → comparação em tempo constante;
    - em sucesso com texto puro, rehash e atualização, se o bot autorizar.
- Cookie de acesso assinado com HMAC (`SESSION_SECRET`), curto, por ficha, HttpOnly.
- Rate limit por IP/ficha; atraso progressivo após falhas.
- `noindex, nofollow` e `X-Robots-Tag` em todas as fichas públicas.
- Renderização somente leitura com o mesmo componente do editor e os dois modos de visualização.
- O toggle de visualização é local também na ficha pública; não altera o link nem o conteúdo.
- Dono controla `is_public`, senha e link; copiar link com feedback.
- Sem diretório público de fichas na D4; apenas links diretos.

## 12. Tempo real e sincronização (D5)

- Socket.IO na mesma porta do HTTP, `path: '/socket.io'`, transporte websocket.
- Autenticação pela sessão opaca no handshake; sem token em query string.
- `@socket.io/postgres-adapter` com tabela `socket_io_attachments`; permite múltiplas
  instâncias sem Redis.
- Salas: `usuario-{id}` e `ficha-{id}`; eventos `ficha-alterada` e `ficha-excluida`.
- Eco do próprio cliente silenciado para não reaplicar estado.
- IRT: o site grava a intenção em `sheet_sync_queue`; o bot consome, aplica no Discord e marca
  processado. Idempotência por `id` da fila; retry com backoff; dead-letter após N tentativas.
- Sincronização de conta: site gera código de 6 a 8 caracteres, usuário executa o comando no
  Discord, bot grava o vínculo. Sem API bot → site.
- Edição de ficha IRT só é liberada quando o contrato da fila estiver implementado e testado.
- Hardening: CSP, limites de payload, timeout de socket, logs sem PII, teste de carga e ensaio
  de failover.

## 13. Conteúdo jurídico (D1)

- Rotas PT: `/termos`, `/privacidade`.
- Rotas EN: `/terms`, `/privacy` - os links que o bot já publica hoje em
  `https://kamiapp.com.br/terms` e `https://kamiapp.com.br/privacy`.
- `/en/terms` e `/en/privacy`, se existirem no futuro, redirecionam para as rotas EN canônicas.
- Conteúdo em `shared/content/legal/{pt-br,en-us}.ts`, tipado por `LegalDocument`
  com `title`, `summary`, `updatedAt`, `language`, `languageRoute`, `languageLabel`,
  `sections` e `paragraphs`.
- Renderizador próprio, sem `v-html`, sem HTML cru.
- Cada documento tem `updatedAt`; o aviso global usa `legalReviewPending`.
- Textos migrados dos Google Docs e **estendidos** para cobrir:
    - conta no site (e-mail/senha), cookies de sessão e segurança;
    - logs de acesso (IP, user agent, data/hora) e retenção;
    - fichas públicas e protegidas por senha;
    - sincronização com Discord e o que é compartilhado;
    - exclusão de conta e revogação de sessões;
    - contato do responsável e base legal.
- A publicação fica bloqueada até revisão humana do responsável; o código pode entrar antes,
  com `legalReviewPending = true` e aviso nas páginas jurídicas.
- Depois de publicar, as páginas do site são a fonte canônica; os links do Google Docs saem do
  bot e do README.
- `hreflang` entre PT e EN; `lang` correto em cada página.

## 14. Rotas, SEO e compatibilidade

| Rota                                   | Comportamento                                    |
| -------------------------------------- | ------------------------------------------------ |
| `/`                                    | Landing PT-BR                                    |
| `/termos`, `/privacidade`              | Jurídico PT-BR                                   |
| `/terms`, `/privacy`                   | Jurídico EN (links já usados pelo bot)           |
| `/entrar`                              | Login (D2)                                       |
| `/login`                               | `302` → `/entrar`                                |
| `/sair`                                | Logout (D2)                                      |
| `/logout`                              | `302` → `/sair`                                  |
| `/painel`                              | Área do usuário (D2)                             |
| `/dashboard`                           | `302` → `/painel`                                |
| `/fichas`                              | Lista do usuário (D3)                            |
| `/fichas/:id`                          | Editor (D3)                                      |
| `/ficha`, `/ficha/:userId/:sheetName`  | Ficha pública somente leitura (D4)               |
| `/configuracoes`                       | Conta (D2/D5)                                    |
| `/comandos`                            | `410 Gone`, com explicação e link para o Discord |
| `/convite`                             | `302` → convite do bot                           |
| `/suporte`                             | `302` → servidor de suporte                      |
| `/tutoriais`, `/tutoriais/:slug`       | `302` → `/` até a D6                             |
| `/macros`, `/macro/:userId/:macroName` | `302` → `/painel` ou página de roadmap           |
| `/sync`                                | `302` → `/painel` até a D5                       |
| Rotas antigas desconhecidas            | `302` → `/` ou 404 com a página do site          |

SEO:

- canonical absoluto em todas as páginas;
- `robots.txt` com bloqueios de área privada e fichas;
- sitemap estático de landing/legal;
- OG estático + metadados por página;
- `410` não indexável;
- redirecionamentos antigos em `302` para não cristalizar URLs mortas.

## 15. Deploy e operação

### 15.1 Topologia

```txt
Cloudflare (DNS + proxy + health check / failover)
        │
        ├── VPS A ── Nginx :443 ── PM2 fork ── Nuxt :3000 ── HAProxy 127.0.0.1:5432 ── Postgres
        │
        └── VPS B ── Nginx :443 ── PM2 fork ── Nuxt :3000 ── HAProxy 127.0.0.1:5432 ── Postgres
```

- Duas VPS idênticas, sem estado local.
- Sessões, fichas e cache durável no Postgres.
- Cloudflare na frente, com health check em `/api/ready`; se uma origem falhar, a outra atende.
- HAProxy local entrega o líder do Patroni; o site não conhece a topologia do cluster.
- Socket.IO usa o adapter Postgres, então qualquer instância atende qualquer socket.

### 15.2 Processo

- PM2 em modo `fork`, uma instância por VPS, `max_memory_restart` de 512 MB.
- `node_args` com `--env-file` quando `KAMI_ENV_FILE` estiver definido.
- `kill_timeout` de 8s para o shutdown fechar o pool.
- Build no servidor ou artefato de CI; `.output` é autossuficiente.
- Deploy rolante: tirar uma VPS do balanceamento, `npm ci`, `npm run build`, `pm2 reload`,
  validar `/api/ready` e `/`, devolver ao balanceamento, repetir na outra.
- Rollback: release anterior ou tag Git + rebuild; nunca editar `.output` à mão.

### 15.3 Nginx

- Proxy para `127.0.0.1:3000`, HTTP/1.1, `Host`, `X-Real-IP`, `X-Forwarded-For`,
  `X-Forwarded-Proto`.
- `Upgrade`/`Connection` preparados para o Socket.IO da D5.
- `client_max_body_size` de 1 MB até a D3 definir upload.
- Cloudflare Origin CA ou túnel; nunca expor a porta 3000 publicamente.
- Restringir a origem aos IPs da Cloudflare ou usar Cloudflare Tunnel.
- HSTS só depois de HTTPS validado; headers básicos também na aplicação.

### 15.4 Banco e segredos

- `DATABASE_URL` com role `kami_app`, via HAProxy local.
- `MIGRATION_DATABASE_URL` com role de migration, em arquivo separado ou injetada apenas no passo de deploy; nunca no runtime.
- `SESSION_SECRET` com 32+ bytes aleatórios, exclusivo do site.
- Segredos em `/etc/kami/kami-site.env`, `chmod 600`, dono do usuário de deploy.
- `.env` local nunca vai para o Git.
- A sessão opaca não depende do `SESSION_SECRET`; para revogar todas as sessões, limpe `site_sessions`. O segredo fica reservado para cookies assinados da D4 e rotação planejada.
- Backup e restore são responsabilidade do cluster (Databasus), com ensaio periódico.

### 15.5 Observabilidade

- Logs JSON no stdout/stderr, capturados pelo PM2.
- `x-request-id` por requisição, método, caminho, status e duração.
- `/api/health` para liveness; `/api/ready` para banco.
- Alertas: 5xx, latência, pool esgotado, `/api/ready` falhando.
- Cloudflare e Nginx com logs de acesso próprios.

## 16. Segurança

- [ ] Nenhum segredo no cliente ou no Git.
- [ ] Zod em toda entrada; SQL sempre parametrizado.
- [ ] Role de banco com menor privilégio; sem DDL pelo site.
- [ ] Cookie de sessão HttpOnly/Secure/SameSite.
- [ ] CSRF/origem nas mutações.
- [ ] Rate limit em login, senha de ficha e APIs sensíveis.
- [ ] `noindex` em áreas privadas e fichas.
- [ ] CSP na D5, com nonce e sem `unsafe-inline` desnecessário.
- [ ] Sem `v-html` de conteúdo do usuário.
- [ ] Logs sem senha, token, cookie ou corpo sensível.
- [ ] Dependências auditadas; lockfile commitado.
- [ ] Backup/restore testado antes do lançamento.
- [ ] Exclusão de conta e revogação de sessões documentadas.

## 17. Testes e qualidade

- **Unidade (Vitest)**: config, logger, formatadores, cache de estatísticas, schemas, sessão,
  validação de ficha, senha de ficha.
- **Integração**: handlers com banco de teste (`kami_test`) e role dedicada; fluxos de login,
  CRUD de ficha e ficha pública.
- **E2E (Playwright)**: landing, jurídico, login, editor, ficha pública, 410/redirects.
- **Fumaça em produção**: `/api/health`, `/api/ready`, `/`, `/termos`, `/comandos` (410).
- **CI**: `format:check`, `typecheck`, `test`, `build`; E2E quando houver navegador instalado.
- **Definition of Done**: código formatado, tipos ok, testes verdes, build ok, documentação
  atualizada, nenhum segredo, acessibilidade e estados conferidos.

## 18. Riscos e pendências

| Risco/pendência                                           | Impacto                                         | Encaminhamento                                                                       |
| --------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| `COUNT` em `logs` a cada 60s                              | Carga no Postgres                               | Índice `(action_type, timestamp)` e cache de 60s                                     |
| Contas do bot sem e-mail/senha                            | Login não cobre todos                           | Fluxo de primeiro acesso por código do Discord                                       |
| Cadastro sem verificação de e-mail                        | E-mail não comprovado; reserva de e-mail alheio | Verificação em etapa futura; rate limit, suporte e revisão jurídica                  |
| Revisão jurídica e dados do responsável                   | Bloqueia publicação do jurídico                 | Revisão humana antes do deploy da D1                                                 |
| Migrations das tabelas novas                              | Bloqueia D2/D5                                  | Site é dono do schema; baseline e migrations em `prisma/`, com GRANT para `kami_app` |
| Drift entre o schema do site e o espelho do bot           | Runtime do bot                                  | Congelar migrations do bot e coordenar mudanças em tabelas compartilhadas            |
| Contrato da fila de IRT                                   | Bloqueia edição de ficha IRT                    | Definir payload/status com o bot antes da D5                                         |
| IRT é escrita exclusiva do bot                            | Painel não linka/desvincula                     | D2.2 lê `irt_sheets`; D5 define sync, fila e gestão de vínculo                       |
| Nomes duplicados históricos em `sheets`                   | Sem `UNIQUE` em `(user_id, sheet_name)`         | Site valida antes de criar/renomear; D5 pode avaliar deduplicação e índice único     |
| Macros sem editor definido                                | Painel só lista                                 | Manter leitura e “em desenvolvimento” até definir a entrega de macros                |
| Ownership de DNS/Cloudflare                               | Bloqueia failover                               | Confirmar conta, zonas e health check                                                |
| Macros sem uso confirmado                                 | Comunicação                                     | Manter como roadmap, sem números                                                     |
| Site antigo ainda no ar                                   | URLs e SEO                                      | Mapear redirects e desligar após validação                                           |
| Segredo do `site.env` exposto                             | Segurança                                       | Rotacionar e nunca copiar para o repositório                                         |
| `npm audit`: 14 avisos (2 low, 12 moderate) em Nuxt/Nitro | Build, não runtime                              | Aguardar correção do Nuxt/Nitro; não rebaixar o framework                            |

## 19. Convenções de entrega

- A versão de desenvolvimento é `6.2.0`; a produção continua `6.0.0` até a promoção
  da `6.2.0`. Enquanto estiver em desenvolvimento, não há bump de versão por entrega.
- Commits durante o desenvolvimento usam descrição (`D2.2 - Painel e conta`). A tag
  `v6.2.0 - ...` e o bump de release entram apenas quando a versão for para produção.
- A D0 fica como histórico `0.1.0`; as próximas entregas seguem dentro da `6.2.0`.
- Trabalho em branch; promoção para `beta` e `main` no release.
- Cada entrega atualiza este documento (estado, decisões e pendências).
- Nenhuma entrega é considerada pronta sem build, testes e verificação manual do fluxo.

## 20. Próximos passos imediatos (release 6.2.0)

1. Revisar a D4 de ponta a ponta: link público, senha, cookie de acesso, `noindex` e controles do dono.
2. Manter o modo leitura (D4.1) e o render público usando o mesmo `KamiSheetView`, sempre com `noindex`.
3. Aplicar as migrations no `kami_prod` com a role de migration e validar o `db:diff`.
4. Fechar a revisão jurídica do texto de conta e cookies.
5. Promover a `6.2.0` (D2, D2.1, D2.2, D3 e D4) para `beta`/`main`, com smoke autenticado.
6. Manter IRT e macros somente leitura até a D5 e a definição do editor de macros.

## 21. Registro de decisões

| Data       | Decisão                                                           | Motivo                                                              |
| ---------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| 28/10/2026 | Nuxt 4 SSR + Options API + TypeScript                             | SEO, SSR e alinhamento ao guia do frontend                          |
| 28/10/2026 | Landing "dossiê operacional"                                      | Identidade Kami, não landing genérica                               |
| 28/10/2026 | Estatísticas reais com cache e fallback                           | Credibilidade e resiliência                                         |
| 28/10/2026 | Estatísticas alinhadas ao bot-status                              | Usuários, ativos em 30 dias, fichas e interações                    |
| 28/10/2026 | Macros como roadmap                                               | Sem uso confirmado no bot                                           |
| 28/10/2026 | Sessão opaca em cookie HttpOnly                                   | Sem JWT/localStorage; logout real                                   |
| 28/10/2026 | Bot dono do schema; site com role dedicada (substituída em 31/10) | Evitar migração divergente e superusuário                           |
| 28/10/2026 | Socket.IO com adapter Postgres                                    | Escala horizontal sem Redis                                         |
| 28/10/2026 | Sync site → bot por código                                        | Não acoplar o bot a uma API do site                                 |
| 28/10/2026 | `/comandos` 410; rotas antigas 302                                | Limpeza de SEO sem quebrar links                                    |
| 28/10/2026 | Duas VPS + PM2 fork + Nginx + Cloudflare                          | Disponibilidade sem estado local                                    |
| 28/10/2026 | Hero com prévia em imagem 3:2 substituível                        | Troca por captura real sem tocar no layout                          |
| 29/10/2026 | Captura real do Discord substitui a prévia 3:2                    | Print 607x659 ao lado do H1; prévia limitada a 560px                |
| 28/10/2026 | Fontes WOFF2 com subset latino                                    | 316 KB → 107 KB e Lighthouse 96                                     |
| 28/10/2026 | Dois modos de leitura com toggle local                            | Página contínua para consulta; seções para foco                     |
| 28/10/2026 | Landing sem protagonismo do Discord                               | Preparar a saída do Discord sem perder o suporte                    |
| 31/10/2026 | Site assume o schema Prisma e as migrations                       | Projeto principal é o site; evita ida e volta com o bot             |
| 31/10/2026 | Prisma 7 só para schema/migrations                                | Runtime segue com pg; sem Prisma Client no site                     |
| 31/10/2026 | Cadastro simples com username, e-mail e senha, sem verificação    | Login sozinho não criava contas; merge com Discord fica para depois |
| 31/10/2026 | Painel com IRT e macros somente leitura                           | IRT é do bot; D5 liga o tempo real; macros não têm editor definido  |
| 31/10/2026 | Versão 6.2.0 única até a promoção para produção                   | Produção só conta quando sobe; evita bump por commit                |
| 31/10/2026 | Editor grava o mesmo JSON de `sections` do bot                    | Sem formato paralelo; bot continua entendendo a ficha               |
| 31/10/2026 | Limites reais do backend do bot (32/20/32/1024)                   | Evita ficha que o bot rejeita; a documentação anterior dizia 256    |
| 31/10/2026 | Duplicar cria ficha privada, sem senha e sem IRT                  | Evita expor conteúdo ou herdar vínculo ao copiar                    |
| 31/10/2026 | Ficha legacy converte na leitura e grava formato novo no 1º save  | Migração preguiçosa, sem alterar dados antigos sem ação do usuário  |
| 04/11/2026 | Ficha pública com `401` para senha e `404` para privada           | Não revela a existência de ficha privada a quem não tem o link      |
| 04/11/2026 | Cookie de acesso por ficha assinado por HMAC                      | Libera a senha por 1 hora sem criar sessão de conta nem JWT         |
| 04/11/2026 | Senha nova em bcrypt; legado em texto puro só para leitura        | Compatibilidade com o bot sem reescrever senhas sem autorização     |
| 04/11/2026 | Ficha pública sempre `noindex` e fora do sitemap                  | Compartilhamento por link direto, não por busca                     |
