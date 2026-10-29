# Padrões de projeto - kami-site

> Guia único de arquitetura, código e entrega do kami-site. Substitui os guias separados de backend e frontend que existiam na raiz.
> Vale para código novo e para refatorações. Em conflito com documentação antiga, vale este arquivo.
> Contratos públicos - rotas, URLs, campos já publicados da API e classes do design system - não mudam por causa deste guia.

## 1. Stack e estrutura

| Camada    | Escolha                                                                  |
| --------- | ------------------------------------------------------------------------ |
| Aplicação | Nuxt 4 com SSR, Vue 3 em Options API e TypeScript estrito                |
| Runtime   | Node.js 24.12 ou superior                                                |
| Dados     | PostgreSQL 18 compartilhado com o bot, via `pg` + `sql-template-strings` |
| Validação | Zod para ambiente e entradas                                             |
| Estilo    | CSS puro: `kami.css` (design system) + `site.css` (site)                 |
| Testes    | Vitest para unidade e Playwright para E2E                                |
| Deploy    | PM2 em modo fork, Nginx e Cloudflare                                     |

### Estrutura atual

```txt
app/
├── app.vue, error.vue
├── layouts/default.vue
├── pages/                 index, termos, privacidade, terms, privacy
├── components/Kami/       Button, Chip, EmptyState, Footer, LegalDocument,
│                          Loading, Panel, Questions, SampleSheet, Section,
│                          Stat, TablePreview, Tag, Topbar
├── assets/css/            kami.css, site.css
└── types/

server/
├── api/                   estatisticas, health, ready
├── routes/                comandos, convite, macros, suporte, robots.txt,
│                          sitemap.xml, macro/[userId]/[macroName],
│                          tutoriais/index, tutoriais/[slug]
├── middleware/            observability, security
├── plugins/               initialization, lifecycle
├── services/              statistics.service
├── utils/                 config, database, logger
└── types/

shared/
├── content/landing/       pt-br.ts
├── content/legal/         pt-br.ts, en-us.ts, types.ts
├── types/                 statistics.ts
└── utils/                 formatting.ts

public/                    fontes, marca, og e exemplos
tests/                     unit (Vitest) e e2e (Playwright)
deploy/                    nginx/kami-site.conf
docs/deploy.md
ecosystem.config.cjs
nuxt.config.ts
```

### Camadas

```txt
server/api/*.get.ts        HTTP: status, headers e contrato
        ↓
server/services/*.ts       regra, cache e SQL de leitura
        ↓
server/utils/database.ts   Pool único e consultas
server/utils/config.ts     ambiente validado uma vez
server/utils/logger.ts     log JSON com contexto mascarado
```

- **`server/api/`** orquestra a requisição. Não executa SQL e não contém regra de negócio.
- **`server/routes/`** cobre o que não é API: redirects de compatibilidade, `410`, `robots.txt` e `sitemap.xml`.
- **`server/services/`** valida entradas com Zod quando existem, aplica regra, mantém cache e executa SQL de leitura. Retorna objeto tipado, nunca resposta HTTP.
- **`server/utils/`** é infraestrutura: configuração, pool, logger. Não conhece regra de negócio.
- **`server/middleware/` e `server/plugins/`** tratam segurança, observabilidade, boot e shutdown.
- **`shared/`** guarda tipos, funções puras e conteúdo usados nos dois lados. Nunca importe `server/` em `app/`.

Não existe camada de controllers neste projeto. O SQL de leitura fica no serviço que o usa. Se um fluxo de escrita crescer, extraia as queries para `server/services/<resource>/queries.ts`; não crie uma camada de controller vazia.

## 2. Nomenclatura e estilo

| Elemento                                            | Convenção                                          | Exemplo                                   |
| --------------------------------------------------- | -------------------------------------------------- | ----------------------------------------- |
| Arquivos e pastas internos                          | kebab-case em inglês                               | `statistics.service.ts`, `formatting.ts`  |
| Páginas do Nuxt                                     | nome da rota pública, em PT-BR                     | `termos.vue`, `privacidade.vue`           |
| Rotas do Nitro                                      | nome da URL pública, em PT-BR                      | `estatisticas.get.ts`, `comandos.get.ts`  |
| Componentes Vue                                     | PascalCase em inglês, prefixo `Kami`; `name` igual | `Stat.vue` → `KamiStat`                   |
| Props, data, computed, methods, funções e variáveis | camelCase em inglês                                | `displayValue`, `loadStatistics`          |
| Booleanos                                           | prefixo `is`, `has`, `can` ou `should`             | `isLoading`, `canSubmit`                  |
| Tipos, interfaces e enums                           | PascalCase em inglês                               | `StatisticsResult`, `StatState`           |
| Constantes de configuração e limites                | SCREAMING_SNAKE_CASE em inglês                     | `REFRESH_INTERVAL_MS`                     |
| Chaves de objetos de conteúdo                       | inglês                                             | `title`, `summary`, `sections`            |
| Colunas do banco                                    | `snake_case` como o bot define                     | `action_type`, `last_use`                 |
| Rotas e URLs públicas                               | PT-BR, congeladas                                  | `/termos`, `/api/estatisticas`            |
| Classes CSS                                         | como estão no design system e no site              | `.kami-stat__value`, `.site-faixa__valor` |

Exceções e limites:

- `/terms` e `/privacy` são as versões EN-US de `/termos` e `/privacidade`. Não renomeie nenhuma das quatro.
- `app/components/Kami/` mantém o prefixo do design system; os arquivos são PascalCase e o `name` recebe o prefixo `Kami`.
- Campos de API usam inglês, como no contrato atual de `/api/estatisticas` (`available`, `data`, `updatedAt`, `expired`, `source`). Mudou o contrato? Atualize frontend, testes e consumidores no mesmo PR.
- Comentários, documentação e textos de interface ficam em PT-BR; conteúdo EN-US fica em inglês no arquivo do locale.
- **Transição:** a árvore acima mostra os arquivos atuais. O padrão em inglês vale para código novo e para o arquivo que já estiver sendo refatorado. Não faça rename em massa; não renomeie rotas, classes CSS nem colunas do banco. Em um rename, atualize imports, testes e contrato no mesmo PR.
- Constantes de configuração e limites usam SCREAMING_SNAKE_CASE; queries e objetos internos podem seguir camelCase (`statisticsQuery`, `unavailableResponse`).

### Estilo obrigatório

- Prettier de `.prettierrc.json`: 4 espaços, aspas simples, ponto e vírgula, 120 colunas, sem vírgula final, `arrowParens: avoid`, um atributo por linha no template e `endOfLine: auto`.
- Todo `if`, `else`, `for` e `while` usa chaves, mesmo com uma linha.
- `return` explícito em handlers, computed e funções que devolvem valor.
- Use `import type` para tipos e evite `any`; prefira `unknown` com narrowing ou Zod.
- Comentários explicam o contrato, o fluxo ou o motivo. Não comentam o histórico da alteração nem código desativado.
- Sem `console.log` em `app/`; no servidor, use o logger (o `console` só aparece dentro de `logger.ts`).
- Nunca leia `process.env` fora de `server/utils/config.ts` no código da aplicação.
- Nunca escreva SQL fora de `server/utils/database.ts` e do serviço que executa a consulta.
- Nunca coloque segredo, token, senha ou URL de conexão completa em log, resposta ou conteúdo.
- Imports usam os aliases do Nuxt: `~~/shared` para a raiz compartilhada e `~/` para `app/`.

## 3. Servidor

### 3.1 API e rotas

O handler é fino: recebe, define cabeçalhos/status e devolve o contrato. A decisão de disponibilidade, cache e fallback fica no serviço.

```ts
import type { H3Event } from 'h3';
import type { StatisticsResponse } from '~~/shared/types/statistics';
import { getStatistics } from '../services/statistics.service';

export default defineEventHandler(async (event: H3Event): Promise<StatisticsResponse> => {
    const result = await getStatistics();

    setHeader(event, 'cache-control', 'no-store');

    if (!result.available) {
        setHeader(event, 'retry-after', 30);
        setResponseStatus(event, 503);
    }

    return {
        available: result.available,
        data: result.data,
        updatedAt: result.updatedAt,
        expired: result.expired,
        source: result.source
    };
});
```

Regras:

- Tipar `event` como `H3Event` quando o handler o recebe; tipar o retorno com o contrato de `shared/types`.
- Usar `setHeader`/`setResponseStatus` antes do `return` e nunca devolver `res` ou objeto de resposta do Node.
- Erros esperados viram status explícito. Erro inesperado sobe para o Nitro, que responde `500`; `server/middleware/observability.ts` registra a linha. Não engula erro com `catch` vazio.
- `createError({ statusCode, statusMessage, message })` para `404` e `410`; `sendRedirect(event, destination, 302)` para compatibilidade.
- Não coloque regra de negócio, SQL ou leitura de `process.env` no handler.
- Mudou o contrato? Atualize o tipo em `shared/`, o handler, o componente e os testes no mesmo PR.

Status usados:

| Código | Uso                                                                           |
| ------ | ----------------------------------------------------------------------------- |
| `200`  | leitura concluída                                                             |
| `201`  | criação (quando houver fluxo de escrita)                                      |
| `302`  | redirect de compatibilidade (`/tutoriais`, `/macros`, `/convite`, `/suporte`) |
| `400`  | entrada inválida                                                              |
| `401`  | sem sessão                                                                    |
| `403`  | sessão sem permissão                                                          |
| `404`  | recurso ou rota inexistente                                                   |
| `409`  | conflito ou duplicidade                                                       |
| `410`  | conteúdo removido permanentemente (`/comandos`)                               |
| `500`  | falha inesperada, com mensagem genérica                                       |
| `503`  | dependência indisponível (`/api/ready`, estatísticas)                         |

Cache e cabeçalhos:

- `/api/**` responde `cache-control: no-store` pela regra do `nuxt.config.ts`.
- Estatísticas também enviam `retry-after: 30` quando indisponíveis.
- `robots.txt` e `sitemap.xml` usam `public, max-age=3600`.
- Fontes usam `public, max-age=31536000, immutable`; arquivos de marca, `public, max-age=604800`.
- Rotas privadas (D2 em diante) recebem `noindex`; áreas públicas indexáveis entram no sitemap.

### 3.2 Serviço, SQL e cache

O serviço de estatísticas é o modelo: consulta fixa, cache de 60 s, cache expirado de 15 min, espera de 10 s após falha e injeção de dependências para teste.

```ts
import type { QueryResultRow } from 'pg';
import SQL from 'sql-template-strings';
import type { StatisticsData, StatisticsSource } from '~~/shared/types/statistics';
import { queryOne } from '../utils/database';
import { logger } from '../utils/logger';

export const REFRESH_INTERVAL_MS = 60_000;
export const STALE_LIMIT_MS = 15 * 60_000;
export const RETRY_COOLDOWN_MS = 10_000;
export const LEGACY_INTERACTIONS = 803_410 + 120_647;

export interface StatisticsRow extends QueryResultRow {
    users: string | number;
    active_users: string | number;
    sheets: string | number;
    commands: string | number;
    components: string | number;
}

export interface StatisticsResult {
    available: boolean;
    data: StatisticsData | null;
    updatedAt: string | null;
    expired: boolean;
    source: StatisticsSource;
}

export interface StatisticsCache {
    data: StatisticsData | null;
    updatedAt: number | null;
    failedAt: number | null;
}

export interface StatisticsDependencies {
    query: () => Promise<StatisticsRow | null>;
    now: () => number;
    cache: StatisticsCache;
    warn: (message: string, context?: unknown) => void;
}

// Consulta fixa: não recebe entrada do usuário e não concatena SQL.
const statisticsQuery = SQL`
    SELECT
        (SELECT COUNT(id) FROM users) AS users,
        (SELECT COUNT(id) FROM users WHERE last_use >= NOW() - INTERVAL '30 days') AS active_users,
        (SELECT COUNT(id) FROM sheets) AS sheets,
        (SELECT COUNT(*) FROM logs WHERE action_type = 'COMMAND') AS commands,
        (SELECT COUNT(*) FROM logs WHERE action_type = 'COMPONENT') AS components
`;

const unavailableResponse: StatisticsResult = {
    available: false,
    data: null,
    updatedAt: null,
    expired: false,
    source: 'unavailable'
};

function requireCount(value: string | number, field: string): number {
    const count = Number(value);

    if (!Number.isFinite(count) || count < 0) {
        throw new Error(`Contagem inválida em ${field}`);
    }

    return Math.trunc(count);
}

function normalize(row: StatisticsRow): StatisticsData {
    return {
        users: requireCount(row.users, 'users'),
        activeUsers: requireCount(row.active_users, 'active_users'),
        sheets: requireCount(row.sheets, 'sheets'),
        // O total inclui os contadores do bot antigo, somados desde o início.
        interactions:
            requireCount(row.commands, 'commands') + requireCount(row.components, 'components') + LEGACY_INTERACTIONS
    };
}

function createEmptyCache(): StatisticsCache {
    return {
        data: null,
        updatedAt: null,
        failedAt: null
    };
}

function buildResponse(
    data: StatisticsData,
    updatedAt: number,
    expired: boolean,
    source: StatisticsSource
): StatisticsResult {
    return {
        available: true,
        data,
        updatedAt: new Date(updatedAt).toISOString(),
        expired,
        source
    };
}

export function createStatisticsService(dependencies: Partial<StatisticsDependencies> = {}) {
    const query = dependencies.query ?? (() => queryOne<StatisticsRow>(statisticsQuery));
    const now = dependencies.now ?? (() => Date.now());
    const cache = dependencies.cache ?? createEmptyCache();
    const warn = dependencies.warn ?? ((message: string, context?: unknown) => logger.warn(message, context));

    function cachedResponse(instant: number): StatisticsResult {
        if (!cache.data || cache.updatedAt === null) {
            return unavailableResponse;
        }

        const age = instant - cache.updatedAt;

        if (age > STALE_LIMIT_MS) {
            return unavailableResponse;
        }

        return buildResponse(cache.data, cache.updatedAt, true, 'stale-cache');
    }

    async function get(): Promise<StatisticsResult> {
        const instant = now();

        if (cache.data && cache.updatedAt !== null) {
            const age = instant - cache.updatedAt;

            if (age >= 0 && age < REFRESH_INTERVAL_MS) {
                return buildResponse(cache.data, cache.updatedAt, false, 'cache');
            }
        }

        if (cache.failedAt !== null && instant - cache.failedAt < RETRY_COOLDOWN_MS) {
            return cachedResponse(instant);
        }

        try {
            const row = await query();

            if (!row) {
                throw new Error('Statistics query returned no rows');
            }

            const data = normalize(row);
            cache.data = data;
            cache.updatedAt = instant;
            cache.failedAt = null;

            return buildResponse(data, instant, false, 'query');
        } catch (error) {
            cache.failedAt = instant;
            warn('Falha ao consultar estatísticas da landing', { error });
            return cachedResponse(instant);
        }
    }

    return { get };
}
```

Consultas com entrada do usuário usam interpolação do `sql-template-strings`, nunca concatenação:

```ts
const sheetsByOwner = (userId: number, limit: number) => SQL`
    SELECT id, name, updated_at
    FROM sheets
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
    LIMIT ${limit}
`;
```

Regras:

- `sql-template-strings` gera `$1`, `$2` e escapa os valores. Não use `+`, template string crua, `query(texto + valor)` nem nome de tabela/coluna vindo do cliente.
- `COUNT` chega como string do `pg`. Valide com `Number.isFinite`, rejeite negativo e truncue em `requireCount`. Contagem inválida é falha, nunca zero.
- Cache: 60 s fresco; até 15 min devolve o último valor com `expired: true` e `source: 'stale-cache'`; depois disso, `available: false` e `source: 'unavailable'`. Nunca invente zero para “manter a tela bonita”.
- Falha de banco não derruba a landing: registre o aviso, respeite a espera de 10 s e devolva o fallback.
- Em produção o cache fica em `globalThis` para sobreviver ao hot reload; exporte `clearStatisticsCache()` para testes.
- Leitura pública só acessa o que é público: `users`, `sheets` e `logs` com `action_type` `COMMAND` ou `COMPONENT`. Não exponha `servers_config`, `macros` ou dados de sessão.
- Listagens com `LIMIT` limitam o valor entre 1 e 100 no serviço, mesmo que o handler já valide.
- Escritas que tocam mais de uma tabela usam `withTransaction` (`BEGIN`, `COMMIT`, `ROLLBACK`, `release`).
- O site nunca executa DDL. Schema, migrations e GRANTs são do bot; a role é `kami_app`, sem superusuário.
- Se `COUNT` em `logs` ficar caro, o índice `(action_type, timestamp)` é criado no repositório do bot; o site só documenta a necessidade.

### 3.3 Config, banco e logs

**Config (`server/utils/config.ts`)**

- Zod valida o ambiente uma única vez e falha no boot, não na primeira requisição.
- A mensagem de erro lista apenas nomes de campos; nunca valores.
- Exporte `loadConfig(environment)` para teste, `getConfig()` com cache e `clearConfigCache()` para os testes.
- `NUXT_PUBLIC_*` chegam ao cliente por `useRuntimeConfig`; segredos ficam só no servidor.
- `.env` não é versionado; produção usa `/etc/kami/kami-site.env` com permissão `600`.

**Banco (`server/utils/database.ts`)**

- É o único arquivo que importa `pg` e cria o `Pool`.
- O pool fica em `globalThis` para sobreviver ao hot reload; em produção há uma instância por processo.
- `max`, timeouts de conexão e `statement_timeout` vêm da configuração. Use `application_name: 'kami-site'`.
- Exporte `query`, `queryOne`, `withTransaction`, `checkDatabase` e `closeDatabase`.
- O erro de cliente ocioso é logado; o `close` do Nitro chama `closeDatabase` para o PM2 encerrar em até 8 s.

**Logs (`server/utils/logger.ts`)**

- Uma linha JSON por evento, com horário, nível, serviço, mensagem e contexto.
- Níveis `debug`, `info`, `warn` e `error`; `warn`/`error` saem por `console.error`, o resto por `console.log`.
- Mascare chaves sensíveis (`senha`, `password`, `token`, `secret`, `authorization`, `cookie`, `sessao`, `session`) e a senha embutida em URL do Postgres.
- `server/middleware/observability.ts` cria ou aceita `x-request-id`, mede a duração e registra método, caminho, status e id no `finish`. Não duplique log de sucesso em cada handler.
- Logue erro com contexto (`{ error }`), não com o corpo inteiro da requisição.

### 3.4 Erros

- Resposta de erro não contém stack, SQL, nome de tabela, variável de ambiente ou detalhe interno.
- `400` para Zod/entrada inválida, com lista de campos quando fizer sentido; `401`/`403` para sessão/permissão (D2 em diante); `404` para ausência; `409` para conflito; `410` para conteúdo removido; `503` para dependência fora.
- `500` usa mensagem genérica em PT-BR. O detalhe fica no log, correlacionado pelo `x-request-id`.
- `createError` é o caminho para erros de rota; não monte HTML de erro.
- O `error.vue` cobre `404`, `410` e falha genérica com texto e ação de volta ao início.

### 3.5 Segurança

- Cabeçalhos globais em `server/middleware/security.ts`: `nosniff`, `X-Frame-Options: DENY`, `referrer-policy`, `permissions-policy` e `cross-origin-opener-policy`.
- HSTS só quando `x-forwarded-proto` é `https`.
- `x-powered-by` é removido no `beforeResponse`.
- CSP ainda não está fechada; enquanto isso, não adicione script inline nem origem de terceiro sem revisar a política.
- Sessão (D2): cookie opaco, `HttpOnly`, `Secure`, `SameSite=Lax`, CSRF por origem e rate limit no login. Mensagem de login sempre genérica.
- Nunca confie em id de usuário, papel ou empresa enviados pelo cliente; derive da sessão no servidor.
- Rotas privadas recebem `noindex` e `Disallow` no `robots.txt`.
- `kami_app` tem o mínimo de privilégios; `DELETE` em `users` só entra com o fluxo acordado com o bot.

### 3.6 Receita: novo endpoint público

1. Declare o contrato em `shared/types/` (ou reutilize o existente).
2. Crie/estenda o serviço com validação, query parametrizada, cache e fallback.
3. Crie `server/api/<name>.get.ts` com status, `cache-control` e tipo de retorno.
4. Cubra o serviço em `tests/unit/` e o contrato em `tests/e2e/` quando a rota for pública.
5. Se a rota for indexável, inclua no `sitemap.xml` e teste `robots.txt`/sitemap.

## 4. Frontend

### 4.1 Estrutura do componente

- Sempre Options API. Proibido `<script setup>`, `ref()` e `reactive()` em `.vue`.
- Componentes puros usam `defineComponent`; páginas e componentes com `asyncData`/`head` usam `defineNuxtComponent`.
- `setup()` existe apenas para composables do Nuxt (`useHead`, `useRuntimeConfig`); estado continua em `data`.
- `asyncData` é tipado pela augmentation em `app/types/nuxt-async-data.d.ts`; mantenha esse arquivo.
- Ordem do arquivo: `<script lang="ts">` → `<template>`. Sem `<style>`: o CSS do site fica em `app/assets/css/site.css` e as classes de componente vêm de `kami.css`.
- Imports: `#app`/`vue` → `~~/shared` → `~/` → locais.
- Ordem dentro do `export default`:
    1. `name`
    2. `components`
    3. `emits`
    4. `props`
    5. `setup` (só Nuxt)
    6. `asyncData`
    7. `data`
    8. `head`
    9. `computed`
    10. `methods`
    11. lifecycle (`created`, `mounted`, `beforeUnmount`)
    12. `watch`
- Constantes de domínio ficam fora do `export default`, no topo do `<script>`.
- `inheritAttrs: false` + `v-bind="$attrs"` quando o componente controla o elemento raiz.
- `v-for` sempre com `:key` estável (id, slug, código), nunca o índice.
- Antes de criar componente, verifique `app/components/Kami/` (Button, Loading, EmptyState, Tag, Chip, Panel, Section, Stat e outros).

### 4.2 Props, estado, computed, methods e watch

```vue
<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import { formatNumber } from '~~/shared/utils/formatting';

type StatState = 'ok' | 'warn' | 'danger' | 'dim';

export default defineComponent({
    name: 'KamiStat',
    props: {
        code: {
            type: String,
            required: true
        },
        label: {
            type: String,
            required: true
        },
        value: {
            type: [String, Number] as PropType<string | number | null | undefined>,
            default: null
        },
        unit: {
            type: String,
            default: ''
        },
        sub: {
            type: String,
            default: ''
        },
        status: {
            type: String as PropType<StatState>,
            default: 'ok'
        }
    },
    computed: {
        displayValue(): string {
            return this.formatValue(this.value);
        },
        valueClass(): string {
            return `site-estatistica__valor--${this.status}`;
        }
    },
    methods: {
        formatValue(value: string | number | null | undefined): string {
            if (value === null || value === undefined || value === '') {
                return '-';
            }

            return typeof value === 'number' ? formatNumber(value) : String(value);
        }
    }
});
</script>

<template>
    <article class="kami-stat site-estatistica">
        <span class="kami-stat__code">{{ code }}</span>
        <p class="kami-stat__label">{{ label }}</p>
        <p :class="['kami-stat__value', 'site-estatistica__valor', valueClass]">
            {{ displayValue
            }}<span
                v-if="unit"
                class="kami-stat__unit"
                >{{ unit }}</span
            >
        </p>
        <p
            v-if="sub"
            class="kami-stat__sub"
        >
            {{ sub }}
        </p>
        <div
            v-if="$slots.footer"
            class="kami-stat__foot"
        >
            <slot name="footer"></slot>
        </div>
    </article>
</template>
```

Regras:

- **Props:** tipadas, `required` quando não há padrão razoável, `PropType` para união/array/objeto, default-factory para objeto/array. Nunca mute prop.
- **`data()`:** sempre função; retorna estado novo. Flags de UI (`isLoading`, `isSubmitting`), erro (`errorMessage: ''`) e formulário dedicado. Não guarde valor derivado.
- **`computed`:** puro, síncrono, tipado; nada de efeito colateral. Se depende de prop/estado, é computed, não `data`.
- **`methods`:** verbo no infinitivo (`loadStatistics`, `handleSubmit`, `resetForm`). Fluxo assíncrono usa `try/catch/finally` e desliga a flag no `finally`. Erro de tela vira string; não use `console`.
- **`watch`:** só para efeito colateral (resetar formulário ao abrir, reagir à rota, limpar timer). `deep` apenas quando necessário; `immediate` explícito.
- **Eventos:** declare em `emits`; no template use kebab-case (`@select-stat`); payload tipado. `v-model` usa `modelValue` + `update:modelValue`.
- **Lifecycle:** remova listeners, timers e observers em `beforeUnmount`.
- Evite `v-html`. Se for inevitável, o conteúdo precisa ser controlado e sanitizado.
- Link externo usa `KamiButton` com `external`; se usar `<a target="_blank">` cru, inclua `rel="noopener noreferrer"` e o aviso `(abre em nova aba)` para leitor de tela.

### 4.3 Conteúdo e locales

- Um arquivo por locale: landing em `shared/content/landing/`, jurídico em `shared/content/legal/`.
- A landing hoje tem só `pt-br.ts`; um locale novo entra como `en-us.ts` com o mesmo contrato, sem condicional de idioma espalhada no template.
- O tipo do conteúdo fica junto (`types.ts` no jurídico) e todas as traduções têm a mesma forma.
- Chaves em inglês; valores no idioma do locale. Não traduza string dentro do componente.
- PT-BR atende `/termos` e `/privacidade`; EN-US atende `/terms` e `/privacy`. Cada página declara `lang` no `<html>` e o link alternativo declara o `lang` do outro idioma.
- Texto editorial não fica no template. Rótulos curtos de interface podem ficar inline quando não são reutilizáveis.
- O aviso de revisão jurídica pendente (`legalReviewPending` em `shared/content/legal/types.ts`) é visível até a revisão humana; não remova sem validação editorial.
- Números e datas usam `Intl` em `shared/utils/formatting.ts`, com fuso `America/Sao_Paulo` e fallback `-`/`--:--:--`.

```ts
// shared/content/legal/pt-br.ts
export const termsPtBr: LegalDocument = {
    title: 'Termos de Uso',
    summary: 'As regras para usar o Kami no Discord e no site.',
    updatedAt: '28/10/2026',
    language: 'PT-BR',
    languageRoute: '/terms',
    languageLabel: 'READ IN ENGLISH',
    sections: [
        {
            title: '1. Sobre estes termos',
            paragraphs: ['Ao usar o Kami no Discord ou neste site, você concorda com estes termos.']
        }
    ]
};

// shared/content/legal/en-us.ts
export const termsEnUs: LegalDocument = {
    title: 'Terms of Use',
    summary: 'The rules for using Kami on Discord and on this website.',
    updatedAt: '2026-10-28',
    language: 'EN-US',
    languageRoute: '/termos',
    languageLabel: 'LER EM PORTUGUÊS',
    sections: [
        {
            title: '1. About these terms',
            paragraphs: ['By using Kami on Discord or on this website, you agree to these terms.']
        }
    ]
};
```

Funções puras de apresentação ficam em `shared/utils/formatting.ts`, sem estado e sem acesso ao DOM:

```ts
const defaultTimeZone = 'America/Sao_Paulo';

export function formatNumber(value: number): string {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
}

export function formatDateTime(value: Date | string | number, timeZone = defaultTimeZone): string {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone
    }).format(date);
}
```

Teste com datas ISO fixas e valide o fallback (`-`, `--:--:--`), não o fuso da máquina.

### 4.4 CSS e design system

- `app/assets/css/kami.css` é cópia do kami-design-system. **Nunca edite esse arquivo.** Atualizações vêm do design system e entram como substituição completa, com revisão do diff.
- `app/assets/css/site.css` é a camada do site: fontes WOFF2, tokens `--site-*` e layout da landing, erro e jurídico.
- Use token antes de valor literal: `var(--kami-accent)`, `var(--kami-text-muted)`, `var(--kami-line)`, `var(--kami-space-4)`, `var(--kami-font-display)`, `var(--site-max)`, `var(--site-gutter)`, `var(--site-font-prosa)`.
- Não renomeie classes existentes. Componente do design system usa `.kami-*`; composição do site usa `.site-*`. Classes novas seguem o bloco existente: `bloco__elemento--estado`.
- Não crie `<style>` em `.vue`. Layout novo vai para `site.css`; estilo de componente do design system vem de `kami.css`.
- Breakpoints existentes: `1080px`, `900px`, `860px`, `720px`, `560px`, `480px`. Use-os em vez de inventar valores; teste 360 px e 1024 px.
- `@media (prefers-reduced-motion: reduce)` no fim do arquivo/bloco desliga transições e animações.
- Foco visível é obrigatório: use `:focus-visible` com `var(--kami-shadow-focus)`; não remova outline sem substituto.
- Fontes ficam em `public/fonts` com as licenças; o preload de Oswald SemiBold e Fira Code Regular está no `nuxt.config.ts`. Não adicione fonte sem o arquivo de licença.

### 4.5 Acessibilidade

- O primeiro elemento focável é o skip link `.site-pular`, apontando para `#content`; `<main id="content" tabindex="-1">` recebe o foco.
- Use landmarks: `header`, `nav` com `aria-label`, `main` e `footer`. Uma única `h1` por página e hierarquia de títulos sem pular níveis.
- Seções recebem nome acessível (`aria-labelledby` ou `aria-label`), como a faixa de estatísticas.
- Contraste mínimo AA com os tokens do design system; não use cor literal para texto.
- Toda imagem tem `alt` significativo, ou `alt=""` quando decorativa. Informe `width`/`height` para evitar salto de layout.
- Links externos abrem em nova aba com aviso textual para leitor de tela.
- Formulários têm `label` associado, erro ligado por `aria-describedby`, `aria-invalid` e aviso com `role="alert"` quando necessário.
- Modais (quando existirem) prendem o foco, fecham com Escape e devolvem o foco ao gatilho.
- Alvos de toque confortáveis (mínimo 44×44 px quando possível) e sem dependência de hover.
- Nada de `div` clicável: use `button`, `a` ou o componente com semântica correta.
- Respeite `prefers-reduced-motion` e não inicie animação automática.
- O E2E cobre Tab + Enter no skip link, `lang` correto, títulos e ausência de rolagem horizontal em 360 px.

### 4.6 SEO e head

- Toda página pública define `title`, `description`, canonical absoluto, Open Graph e Twitter card.
- Canonical e `og:url` usam a origem real da requisição (`useRequestURL().origin`), com barras finais removidas; a home termina em `/`. Assim o preview funciona em dev, túnel e produção, sem emitir `localhost` para o Discord.
- `htmlAttrs.lang` segue o locale da página: `pt-BR` ou `en-US`.
- OG image padrão: `/og/kami-site.png`, 1200×630, com `og:image:alt` e `og:image:type`.
- Área privada recebe `robots: noindex, nofollow`; página pública usa `index, follow`.
- `robots.txt` e `sitemap.xml` são handlers em `server/routes/`; toda rota pública indexável entra no sitemap.
- Conteúdo removido responde `410`; URL antiga que ainda tem destino responde `302` e é coberta por teste.
- Não exponha versão, telemetria, rota de health ou dados de deploy na página pública.

```ts
setup() {
    const siteUrl = useRequestURL().origin.replace(/\/+$/, '');
    const url = `${siteUrl}/`;

    useHead({
        title: landing.meta.title,
        link: [{ rel: 'canonical', href: url }],
        meta: [
            { name: 'description', content: landing.meta.description },
            { property: 'og:type', content: 'website' },
            { property: 'og:site_name', content: 'Kami' },
            { property: 'og:title', content: landing.meta.ogTitle },
            { property: 'og:description', content: landing.meta.ogDescription },
            { property: 'og:url', content: url },
            { property: 'og:image', content: `${siteUrl}/og/kami-site.png` },
            { property: 'og:image:type', content: 'image/png' },
            { property: 'og:image:width', content: '1200' },
            { property: 'og:image:height', content: '630' },
            { property: 'og:image:alt', content: 'Kami - fichas e dados para RPG' },
            { property: 'og:locale', content: 'pt_BR' },
            { name: 'twitter:card', content: 'summary_large_image' },
            { name: 'twitter:title', content: landing.meta.ogTitle },
            { name: 'twitter:description', content: landing.meta.ogDescription },
            { name: 'twitter:image', content: `${siteUrl}/og/kami-site.png` }
        ]
    });
}
```

Para o jurídico, o título segue `Documento - Kami`, o `lang` vem do documento e o link alternativo aponta para a rota do outro idioma.

### 4.7 Estados e páginas

- **Estatísticas:** quando o serviço está indisponível, mostre `-` e a nota de indisponibilidade; nunca `0`. Quando o valor é de cache expirado, sinalize a última leitura válida.
- **Carregamento:** use `KamiLoading` com `role="status"`; não troque a tela inteira por um spinner quando o conteúdo anterior ainda serve.
- **Vazio:** use `KamiEmptyState` com título, descrição e ação.
- **Erro:** `app/error.vue` cobre `404`, `410` e `500`, com texto específico e ação de volta.
- `asyncData` devolve as mesmas chaves dos defaults de `data()` para não haver mismatch de hidratação. Endpoint tolerante usa `ignoreResponseError: true` e `.catch(() => null)`.
- Não mostre mensagem interna, status HTTP cru ou detalhe de banco para o visitante.

### 4.8 Receita: nova página

1. Crie `app/pages/<rota>.vue` com o nome da URL pública (PT-BR).
2. Coloque o texto em `shared/content/` no locale correto; não espalhe copy no template.
3. Use `defineNuxtComponent`, `useHead` no `setup()` e `data()` com defaults.
4. Monte a página com landmarks, uma `h1` e seções nomeadas; reutilize `Kami*` antes de criar componente.
5. Adicione teste E2E de rota, título e `lang`; inclua no sitemap se for indexável.

## 5. Testes

Unidade cobre contrato e lógica pura; E2E cobre rota, SEO, acessibilidade e estado de indisponibilidade. Não há teste de integração com banco hoje; quando houver, use um banco `kami_test` e role dedicada, nunca produção.

### 5.1 Unidade (Vitest)

- Arquivos em `tests/unit/*.test.ts`, ambiente `node`, sem rede e sem banco.
- Serviços recebem dependências por parâmetro: query falsa, relógio falso e logger falso.
- Teste caminho feliz e falha: cache fresco, cache expirado, contagem inválida, espera após erro.
- A fábrica recebe `query`, `now`, `cache` e `warn`; o teste controla os quatro.
- Nome do arquivo em inglês; títulos de teste em PT-BR por padrão (`describe` pode repetir o nome do módulo).
- Não persiga percentual de cobertura; cubra contrato e regressão.

```ts
import { describe, expect, it, vi } from 'vitest';
import {
    REFRESH_INTERVAL_MS,
    createStatisticsService,
    type StatisticsRow
} from '../../server/services/statistics.service';

function createRow(overrides: Partial<StatisticsRow> = {}): StatisticsRow {
    return {
        users: '120',
        active_users: '74',
        sheets: '348',
        commands: '1520',
        components: '240',
        ...overrides
    };
}

function createClock(start = 1_000_000) {
    let instant = start;

    return {
        now: () => instant,
        advance: (milliseconds: number) => {
            instant += milliseconds;
        }
    };
}

describe('serviço de estatísticas', () => {
    it('serve o cache fresco sem consultar o banco de novo', async () => {
        const query = vi.fn().mockResolvedValue(createRow());
        const clock = createClock();
        const service = createStatisticsService({ query, now: clock.now });

        await service.get();
        clock.advance(REFRESH_INTERVAL_MS - 1);
        const result = await service.get();

        expect(result.available).toBe(true);
        expect(result.source).toBe('cache');
        expect(query).toHaveBeenCalledTimes(1);
    });
});
```

### 5.2 E2E (Playwright)

- Arquivos em `tests/e2e/*.spec.ts`; o `playwright.config.ts` sobe o dev server em `127.0.0.1:3000` e usa `PLAYWRIGHT_BASE_URL` quando definido.
- Prefira seletores por role, label e texto. Classe CSS só como gancho estável quando não há semântica (`site-faixa__valor`).
- Teste tolerante a banco ausente: `/api/estatisticas` e `/api/ready` aceitam `200` ou `503`; nunca dependa de números reais.
- Cubra skip link, `lang`, títulos, 360 px sem rolagem horizontal, 404/410, redirects, `robots.txt` e `sitemap.xml` ao mexer em rota/SEO.
- Teste que a landing não mostra zero falso nem vaza versão/telemetria.

```ts
import { expect, test } from '@playwright/test';

test('a faixa de estatísticas não mostra zero falso', async ({ page }) => {
    await page.goto('/');

    const values = page.locator('.site-faixa__valor');

    await expect(values).toHaveCount(4);

    for (const value of await values.allTextContents()) {
        expect(value.trim()).toMatch(/^(\d{1,3}(\.\d{3})*|-)$/);
    }
});

test('a API de estatísticas respeita o contrato de indisponibilidade', async ({ request }) => {
    const response = await request.get('/api/estatisticas');

    expect([200, 503]).toContain(response.status());

    if (response.status() === 503) {
        expect(response.headers()['retry-after']).toBe('30');
    }
});
```

### 5.3 O que rodar

| Comando             | Quando                                                    |
| ------------------- | --------------------------------------------------------- |
| `npm run test`      | sempre que mexer em serviço, utilitário, config ou logger |
| `npm run test:e2e`  | rota, SEO, acessibilidade ou estado de indisponibilidade  |
| `npm run typecheck` | antes de abrir PR                                         |
| `npm run check`     | fechamento: formato + tipos + unidade + build             |

O CI (`.github/workflows/ci.yml`) roda `format:check`, `typecheck`, `test`, `build` e, em job separado, o E2E com Chromium. O E2E exige `npx playwright install chromium` na máquina local.

## 6. Versionamento e commits

- SemVer `MAJOR.MINOR.PATCH` em `package.json`; a versão atual é `6.0.0`.
- Cada entrega sobe a minor a partir da atual: D1 `6.0.0`, D2 `6.1.0`, D3 `6.2.0`, e assim
  por diante. Correção sobe patch.
- Trabalhe em branch; nunca commite direto na `main`. Fluxo: `feature_branch → dev → beta → main`. Feature branch é para mudança grande ou trabalho paralelo; patch pode ir direto na `dev`.
- Commit de merge na `dev` usa `vX.Y.Z - Descrição`, em PT-BR. Na feature branch o número é opcional.
- Exemplos:
    - `v6.1.0 - Login e sessão com Postgres`
    - `v6.0.1 - Correção no fallback das estatísticas`
- Tag `vX.Y.Z` só depois de CI verde. Build, `.output`, `.nuxt`, `test-results`, `playwright-report`, logs e `.env` não entram no Git.
- Mudou contrato, operação ou escopo? Atualize `PLANEJAMENTO.md`, este guia ou `docs/deploy.md` no mesmo PR.
- Deploy segue `docs/deploy.md`: uma VPS por vez, `npm ci`, `npm run build`, `pm2 reload`, conferir `/api/ready`; rollback pela tag anterior.

## 7. Checklist de PR/entrega

**Código e contrato**

- [ ] `npm run check` verde; `npm run test:e2e` quando a mudança afeta UI, rota, SEO ou disponibilidade.
- [ ] Identificadores novos em inglês; conteúdo, comentários e mensagens ao usuário em PT-BR (ou no locale da página).
- [ ] Options API, sem `<script setup>`, `ref()` ou `reactive()` em `.vue`.
- [ ] Ordem do componente e ordem de imports conforme a seção 4.1.
- [ ] Props tipadas, `emits` declarados, sem mutação de prop, `:key` estável.
- [ ] Nenhum `any` novo, nenhum `console.log`, nenhum segredo em código/log.
- [ ] Nenhuma edição em `app/assets/css/kami.css`; classes e tokens existentes preservados.
- [ ] Rotas públicas, URLs, campos publicados da API e colunas do banco preservados (ou migração coordenada com redirect/teste).

**Servidor**

- [ ] Handler sem SQL nem regra de negócio; status e `cache-control` explícitos.
- [ ] SQL parametrizado com `sql-template-strings`; nenhuma concatenação ou identificador vindo do cliente.
- [ ] Serviço com cache/fallback quando a dependência pode falhar; estatística nunca vira zero falso.
- [ ] Erro interno não vaza; log com contexto mascarado e `x-request-id`.
- [ ] Role `kami_app`, sem DDL e sem superusuário.
- [ ] Teste unitário do serviço/utilitário e E2E do contrato público.

**Frontend, acessibilidade e SEO**

- [ ] Conteúdo no arquivo do locale certo; PT/EN não misturados.
- [ ] Skip link, landmarks, uma `h1`, foco visível, `lang` correto e alvos de toque.
- [ ] Imagens com `alt` adequado; link externo com aviso de nova aba.
- [ ] `prefers-reduced-motion` respeitado; 360 px e 1024 px conferidos.
- [ ] `title`, `description`, canonical, OG/Twitter e `robots` definidos; página pública no sitemap; privada com `noindex`.
- [ ] Estados de carregamento, vazio, erro e indisponibilidade conferidos.

**Entrega**

- [ ] Versão SemVer atualizada e commit `vX.Y.Z - Descrição`.
- [ ] PR fora da `main`, com escopo único e descrição do que mudou.
- [ ] Documentação afetada atualizada; nenhum arquivo gerado ou segredo incluído.
