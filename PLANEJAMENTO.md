# Planejamento - Novo Site do Kami

> Documento vivo. Substitui o site antigo (Vue SPA) por uma plataforma Nuxt 4 com SSR,
> compartilhando o Postgres do bot. A landing vem primeiro; login, editor, fichas públicas e
> tempo real vêm nas entregas seguintes.
>
> Última atualização: 28/10/2026.

---

## 1. Objetivo

Construir o novo site do Kami como a central web do sistema:

- apresentar o Kami e o que ele faz, com dados reais;
- receber login por e-mail e senha;
- permitir criar, editar e organizar fichas;
- publicar fichas públicas com controle de privacidade;
- sincronizar com o Discord sem transformar o site em dependência do bot;
- substituir as páginas jurídicas que hoje vivem no Google Docs;
- manter o bot como dono do schema e da integração com o Discord.

O site não é um painel administrativo do bot. É a interface pública e a área de membros do
mesmo produto.

## 2. Princípios

1. **Dado real ou ausente.** Nenhum número inventado. Quando a fonte falha, a tela mostra
   indisponibilidade, nunca zero.
2. **SSR primeiro.** A landing precisa ser útil sem JavaScript e indexável.
3. **Aplicação sem estado local.** Sessão e dados vivem no Postgres; qualquer VPS atende
   qualquer requisição.
4. **Bot dono do schema.** O site lê e escreve com SQL parametrizado, mas não migra tabelas.
5. **Entregas pequenas.** Cada entrega termina verificável, documentada e publicável.
6. **PT-BR primeiro, EN depois.** A estrutura de conteúdo e as rotas já nascem preparadas
   para os dois idiomas.
7. **Chassi do design system.** A identidade vem de `kami.css`; o site adiciona apenas o que
   for específico de página pública.
8. **Segurança por padrão.** Segredo só no servidor, validação com Zod em toda entrada,
   sessão opaca, banco com role dedicada.

## 3. Stack

| Item       | Escolha                                         | Observação                                                |
| ---------- | ----------------------------------------------- | --------------------------------------------------------- |
| Framework  | Nuxt 4 (SSR)                                    | Estrutura `app/`, `server/`, `shared/`, `public/`         |
| UI         | Vue 3 com Options API                           | Nunca `<script setup>`, `ref()` ou `reactive()` em `.vue` |
| Linguagem  | TypeScript estrito                              | `defineNuxtComponent` quando houver `asyncData` ou `head` |
| Banco      | PostgreSQL 18 via `pg` + `sql-template-strings` | SQL sempre parametrizado                                  |
| Validação  | Zod                                             | Schemas em `server/schemas/`                              |
| Estilo     | CSS puro (`kami.css` + `site.css`)              | Sem Tailwind, Sass, UI kit ou CSS-in-JS                   |
| Tempo real | Socket.IO + `@socket.io/postgres-adapter`       | A partir da D5                                            |
| Testes     | Vitest + Playwright                             | Unidade, integração e fumaça                              |
| Deploy     | PM2 (fork) + Nginx + Cloudflare                 | Duas VPS, failover                                        |
| Node       | 24 LTS                                          | Mesmo runtime do bot                                      |

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

### 5.3 Tabelas novas (migração do bot)

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

- O **bot** é dono do schema e das migrations (Prisma ou SQL versionado no repositório dele).
- O site usa a role **`kami_app`**, com `CONNECT`, `USAGE` no schema e
  `SELECT/INSERT/UPDATE/DELETE` apenas nas tabelas necessárias; `USAGE/SELECT` nas sequences.
- O site nunca conecta como superusuário.
- Conexão via HAProxy local em `127.0.0.1:5432`, database `kami_prod`.
- Toda nova tabela do site entra no repositório do bot com migration e GRANT correspondente.
- O site não roda `CREATE TABLE`, `ALTER TABLE` nem `CREATE INDEX` em produção.

### 5.5 Contas sem senha

O bot cria usuários do Discord com `password = NULL` e `email = NULL`. A D2 é login-only, então:

- contas com e-mail e senha entram normalmente;
- contas sem senha recebem uma mensagem clara e um caminho de **primeiro acesso via código do
  Discord** (D2 ou D5, conforme a fila de trabalho);
- não criar cadastro público no site;
- não permitir login por `discord_id` antes do fluxo de vínculo.

Esse ponto é dependência explícita do bot e precisa ser resolvido antes de divulgar a D2 como
"login pronto para todos".

## 6. Entregas

| Entrega | Tema                             | Versão  | Estado            |
| ------- | -------------------------------- | ------- | ----------------- |
| D0      | Fundação técnica e deploy        | `0.1.0` | Concluída         |
| D1      | Landing, estatísticas e jurídico | `6.0.0` | Concluída         |
| D2      | Login e sessão                   | `6.x`   | Pendente          |
| D3      | Editor de fichas                 | `6.x`   | Pendente          |
| D4      | Fichas públicas                  | `6.x`   | Pendente          |
| D5      | Tempo real, sync e hardening     | `6.x`   | Pendente          |
| D6      | Tutoriais                        | —       | Fora desta versão |

A versão atual do projeto é `6.0.0`. A D0 fica registrada como `0.1.0`, o
histórico da primeira fundação do site.

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

**Estado:** concluída em 28/10/2026; versão atual `6.0.0`.

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
- fluxo de primeiro acesso para contas sem senha (código do Discord) ou mensagem explícita;
- exclusão de conta: revogar sessões e registrar solicitação; exclusão no bot conforme fluxo
  acordado.

Aceite:

- login válido cria sessão e redireciona para `/painel`;
- login inválido não distingue e-mail inexistente de senha errada;
- cookie não é acessível por JavaScript;
- sessão inválida/expirada volta para `/entrar`;
- logout invalida a linha no banco;
- nenhum token em `localStorage`.

### D3 - Editor de fichas

**Objetivo:** criar e editar fichas no site com a mesma estrutura que o bot entende.

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

### D4 - Fichas públicas

**Objetivo:** compartilhar fichas por link, com privacidade controlada.

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

- Login only; sem cadastro público.
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
- `noindex` em `/entrar`, `/painel`, `/fichas` e `/configuracoes`.
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
- Limites do bot: nome de ficha, seção e atributo até 256 caracteres; valor até 1024;
  barra com `max >= min` e `step > 0`; lista com quantidade textual curta.
- Ficha `legacy`: converte na leitura; o primeiro save grava `sections` e `legacy = false`.
- Ficha com IRT: somente leitura até a D5; renomear/excluir bloqueado com explicação.
- Concorrência: `last_use` como versão; `UPDATE ... WHERE id = $1 AND user_id = $2 AND
last_use = $3`; se 0 linhas, `409` com opção de recarregar.
- Salvamento explícito, estado sujo, atalho `Ctrl+S`, aviso de saída.
- Validação no cliente para UX e no servidor como fonte de verdade.
- Nenhum HTML do usuário renderizado com `v-html`.
- Exclusão com confirmação e, se houver IRT, bloqueio.

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
| `/ficha`, `/ficha/:userId/:sheetName`  | Aviso de ficha pública em desenvolvimento (D4)   |
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
- `SESSION_SECRET` com 32+ bytes aleatórios, exclusivo do site.
- Segredos em `/etc/kami/kami-site.env`, `chmod 600`, dono do usuário de deploy.
- `.env` local nunca vai para o Git.
- Rotação de segredo invalida sessões; documentar o procedimento.
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

| Risco/pendência                             | Impacto                         | Encaminhamento                                            |
| ------------------------------------------- | ------------------------------- | --------------------------------------------------------- |
| `COUNT` em `logs` a cada 60s                | Carga no Postgres               | Índice `(action_type, timestamp)` e cache de 60s          |
| Contas do bot sem e-mail/senha              | Login não cobre todos           | Fluxo de primeiro acesso por código do Discord            |
| Revisão jurídica e dados do responsável     | Bloqueia publicação do jurídico | Revisão humana antes do deploy da D1                      |
| Migrations das tabelas novas                | Bloqueia D2/D5                  | Implementar no repositório do bot com GRANTs              |
| Contrato da fila de IRT                     | Bloqueia edição de ficha IRT    | Definir payload/status com o bot antes da D5              |
| Ownership de DNS/Cloudflare                 | Bloqueia failover               | Confirmar conta, zonas e health check                     |
| Macros sem uso confirmado                   | Comunicação                     | Manter como roadmap, sem números                          |
| Site antigo ainda no ar                     | URLs e SEO                      | Mapear redirects e desligar após validação                |
| Segredo do `site.env` exposto               | Segurança                       | Rotacionar e nunca copiar para o repositório              |
| `npm audit`: 7 avisos baixos em `deepmerge` | Build, não runtime              | Aguardar correção do Nuxt/Nitro; não rebaixar o framework |

## 19. Convenções de entrega

- Versão SemVer no `package.json`; a versão atual é `6.0.0`. A D0 fica como
  histórico `0.1.0`; as próximas entregas seguem `6.x`.
- Commits `vX.Y.Z - Descrição`; trabalho em `dev`, promoção para `beta` e `main`.
- Cada entrega atualiza este documento (estado, decisões e pendências).
- Nenhuma entrega é considerada pronta sem build, testes e verificação manual do fluxo.

## 20. Próximos passos imediatos (D2)

1. Confirmar com o bot o schema de contas e hashes, e liberar a role `kami_app` para ler contas
   e escrever em `site_sessions`.
2. Implementar `/entrar`, `POST /api/auth/login`, sessão opaca de 32 bytes e cookie
   `kami_sessao` HttpOnly/Secure/SameSite=Lax.
3. Adicionar middleware de sessão, `/sair`, `POST /api/auth/logout` e proteção CSRF por origem.
4. Aplicar rate limit de login por IP e por e-mail, com mensagens genéricas.
5. Criar `/painel` mínimo com `noindex` e validar login real contra o Postgres.
6. Rodar build, testes, E2E e Lighthouse; commitar a D2 na próxima `6.x`.

## 21. Registro de decisões

| Data       | Decisão                                        | Motivo                                               |
| ---------- | ---------------------------------------------- | ---------------------------------------------------- |
| 28/10/2026 | Nuxt 4 SSR + Options API + TypeScript          | SEO, SSR e alinhamento ao guia do frontend           |
| 28/10/2026 | Landing "dossiê operacional"                   | Identidade Kami, não landing genérica                |
| 28/10/2026 | Estatísticas reais com cache e fallback        | Credibilidade e resiliência                          |
| 28/10/2026 | Estatísticas alinhadas ao bot-status           | Usuários, ativos em 30 dias, fichas e interações     |
| 28/10/2026 | Macros como roadmap                            | Sem uso confirmado no bot                            |
| 28/10/2026 | Sessão opaca em cookie HttpOnly                | Sem JWT/localStorage; logout real                    |
| 28/10/2026 | Bot dono do schema; site com role dedicada     | Evitar migração divergente e superusuário            |
| 28/10/2026 | Socket.IO com adapter Postgres                 | Escala horizontal sem Redis                          |
| 28/10/2026 | Sync site → bot por código                     | Não acoplar o bot a uma API do site                  |
| 28/10/2026 | `/comandos` 410; rotas antigas 302             | Limpeza de SEO sem quebrar links                     |
| 28/10/2026 | Duas VPS + PM2 fork + Nginx + Cloudflare       | Disponibilidade sem estado local                     |
| 28/10/2026 | Hero com prévia em imagem 3:2 substituível     | Troca por captura real sem tocar no layout           |
| 29/10/2026 | Captura real do Discord substitui a prévia 3:2 | Print 607x659 ao lado do H1; prévia limitada a 560px |
| 28/10/2026 | Fontes WOFF2 com subset latino                 | 316 KB → 107 KB e Lighthouse 96                      |
| 28/10/2026 | Dois modos de leitura com toggle local         | Página contínua para consulta; seções para foco      |
| 28/10/2026 | Landing sem protagonismo do Discord            | Preparar a saída do Discord sem perder o suporte     |
