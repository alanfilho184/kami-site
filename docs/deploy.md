# Deploy - Kami Site

> Duas VPS idênticas atrás da Cloudflare. Cada uma roda Nginx, PM2 e o build do
> Nuxt; o Postgres é compartilhado com o bot e acessado por um HAProxy local.
> A aplicação não guarda estado: qualquer instância atende qualquer requisição.

## 1. Topologia

```txt
Cloudflare (DNS + proxy + health check)
        │
        ├── VPS A ── Nginx :443 ── PM2 fork ── Nuxt :3000 ── HAProxy 127.0.0.1:5432 ── Postgres
        │
        └── VPS B ── Nginx :443 ── PM2 fork ── Nuxt :3000 ── HAProxy 127.0.0.1:5432 ── Postgres
```

- O site escuta em `127.0.0.1:3000`; nunca exponha essa porta.
- O Postgres é acessado pela role `kami_app`, via HAProxy local, database `kami_prod`.
- Sessões, fichas e filas vivem no banco. Não há cache de disco obrigatório.
- O Socket.IO da D5 usará o adapter Postgres, sem Redis.

## 2. Pré-requisitos da VPS

| Item    | Versão/observação                         |
| ------- | ----------------------------------------- |
| Node.js | 24 LTS ou superior (mesmo runtime do bot) |
| npm     | 11 ou superior                            |
| PM2     | global, para o processo do site           |
| Nginx   | 1.24 ou superior                          |
| HAProxy | local, entregue pelo cluster do Postgres  |
| Git     | somente para o deploy por checkout        |

```bash
sudo apt update
sudo apt install -y nginx git curl
sudo npm install -g pm2
node --version
```

Crie o usuário e os diretórios:

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin kami
sudo mkdir -p /srv/kami-site /etc/kami /var/log/kami-site
sudo chown -R kami:kami /srv/kami-site /var/log/kami-site
```

## 3. Banco de dados

O **site** é dono do schema Prisma e das migrations a partir da D2. O histórico
fica em `prisma/migrations/` e foi copiado do bot preservando nomes e checksums,
para que a tabela `_prisma_migrations` existente reconheça o histórico.

O runtime continua com a role **`kami_app`**, sem DDL. As migrations usam uma
role separada com DDL, configurada em `MIGRATION_DATABASE_URL` e usada apenas no
passo de deploy. A aplicação nunca recebe essa URL.

Antes da primeira migration nova, valide o baseline:

```bash
npm run db:validate
npm run db:status
npm run db:diff
```

O `db:diff` deve sair vazio. Se houver drift, reconcilie antes de criar
qualquer migration. Depois:

```bash
npm run db:migrate
```

Rode a migration uma vez por release, antes de recarregar as duas VPS. Não
coloque `prisma migrate` no boot da aplicação. Quando a release também atualizar
o bot, aplique a migration antes de subir a instância ativa: o tratamento de
`10008 Unknown Message` usa a coluna `irt_sheets.sync_failures`.

Exemplo de preparação das roles (rodar como administrador do cluster, uma vez):

```sql
CREATE ROLE kami_app LOGIN PASSWORD 'troque-esta-senha';
GRANT CONNECT ON DATABASE kami_prod TO kami_app;
GRANT USAGE ON SCHEMA public TO kami_app;

CREATE ROLE kami_migrator LOGIN PASSWORD 'troque-esta-senha';
GRANT CONNECT ON DATABASE kami_prod TO kami_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO kami_migrator;

-- DML do runtime; inclua as tabelas novas depois que a migration criá-las.
GRANT SELECT, INSERT, UPDATE, DELETE ON
    users,
    sheets,
    irt_sheets,
    servers_config,
    macros,
    site_sessions,
    socket_io_attachments,
    site_sync_codes,
    site_account_merges
TO kami_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kami_app;
```

A role de migration precisa ser dona do schema e das tabelas, ou membro da role
que as possui. O caminho mais simples é reaproveitar a role que o bot já usava
para migrar, guardada em `MIGRATION_DATABASE_URL`. Se criar uma role nova,
transfira a ownership das tabelas existentes antes do primeiro `db:migrate`.

Regras:

- nunca use superusuário no site;
- `kami_app` não recebe DDL; `kami_migrator` não é usado pelo runtime;
- `DELETE` em `users` não é concedido sem o fluxo de exclusão acordado com o bot;
- toda tabela nova entra em `prisma/migrations/` e recebe GRANT para `kami_app`;
- mudanças em tabelas compartilhadas (`users`, `sheets`, `macros`) são coordenadas com o bot;
- o bot mantém o schema como espelho e não roda mais migrations;
- o site conecta em `127.0.0.1:5432` (HAProxy) e não conhece a topologia do cluster.

## 4. Segredos

O arquivo de produção fica em `/etc/kami/kami-site.env`, com dono do usuário de
deploy e permissão `600`. Ele não vai para o Git.

```bash
sudo install -m 600 -o kami -g kami /dev/null /etc/kami/kami-site.env
sudo -u kami nano /etc/kami/kami-site.env
```

Conteúdo mínimo:

```dotenv
NUXT_PUBLIC_SITE_URL=https://kamiapp.com.br
NUXT_PUBLIC_ENVIRONMENT=production
NUXT_PUBLIC_DISCORD_INVITE=https://discord.gg/9rqCkFB
NUXT_PUBLIC_BOT_INVITE=https://discord.com/oauth2/authorize?client_id=716053210179043409

DATABASE_URL=postgresql://kami_app:senha@127.0.0.1:5432/kami_prod
SESSION_SECRET=32-bytes-aleatorios-exclusivos-do-site
SYNC_CODE_SECRET=32-bytes-aleatorios-para-hmac-dos-codigos
BOT_SYNC_TOKEN=32-bytes-aleatorios-compartilhados-com-o-bot
DISCORD_LOG_WEBHOOK_URL=https://discord.com/api/webhooks/000000000000000000/troque-este-token
OWNER_DISCORD_ID=000000000000000000
LOG_LEVEL=info
INSTANCE_NAME=kami-site-a
LOGGER_URL=https://logger.kamiapp.com.br
LOGGER_TOKEN=klp_token-de-ingestao-da-vps
LOG_HTTP_PAYLOADS=true
LOG_WS_PAYLOADS=true
LOG_PAYLOAD_MAX_BYTES=16384
DB_POOL_MAX=10
DB_CONNECTION_TIMEOUT_MS=5000
DB_STATEMENT_TIMEOUT_MS=5000
```

No Developer Portal, habilite `Guild Install` e `User Install` em **Installation → Installation Contexts** e configure os defaults: `applications.commands` para usuário e `applications.commands` + `bot` (permissões `52224`) para servidor. O link curto de `NUXT_PUBLIC_BOT_INVITE` usa esses defaults e deixa o usuário escolher o contexto; uma URL com `scope`/`permissions` explícitos vale para um único `integration_type`.

A URL de migration não fica no mesmo arquivo da aplicação. Use um arquivo
separado, como `/etc/kami/migrations.env`, com permissão `600`, lido apenas no
passo de deploy. `MIGRATION_DATABASE_URL` usa a role `kami_migrator`; o runtime
continua usando `DATABASE_URL` com `kami_app`.

A CLI do Prisma segue a mesma regra do `ecosystem.config.cjs`: lê o arquivo
apontado por `KAMI_ENV_FILE`; sem ele, tenta `/etc/kami/kami-site.env` e depois o
`.env` da raiz. Por isso o passo de migration aponta `KAMI_ENV_FILE` para o
arquivo de migration, sem precisar exportar as variáveis no shell. Variáveis já
definidas no ambiente têm precedência sobre o arquivo.

Gere o `SESSION_SECRET` com `openssl rand -base64 48`. Ele fica reservado para
cookies assinados da D4; a sessão opaca da D2 não é assinada por ele. Para revogar
todas as sessões, limpe a tabela `site_sessions` em vez de trocar o segredo.

O `BOT_SYNC_TOKEN` autentica o bot nas salas de serviço do Socket.IO e no
endpoint interno `POST /api/internal/discord/claim`. Gere outro valor com
`openssl rand -base64 48` e configure o mesmo token no bot. Sem ele, o site sobe
normalmente, mas conexões de serviço e o vínculo de conta são recusados.

O `LOGGER_URL` e o `LOGGER_TOKEN` habilitam a cópia assíncrona dos logs para o
kami-logger. Crie um token `klp_...` por VPS no projeto `kami-site` (ambiente
`prod`) e guarde o valor cru apenas no arquivo `600`; ele não volta a ser
exibido. Sem as duas variáveis, o site continua subindo e grava só no stdout.
O `INSTANCE_NAME` identifica a VPS no filtro de instância (`kami-site-a`,
`kami-site-b`). A captura de bodies HTTP e dados de WebSocket é temporária:
`LOG_HTTP_PAYLOADS`/`LOG_WS_PAYLOADS` podem ser desligados sem migration, e os
logs antigos expiram pela retenção de 90 dias. Se o logger estiver fora, o site
continua respondendo; a fila é limitada e os eventos mais antigos são
descartados. Valide a ingestão em `/registros` do kami-logger.

O `SYNC_CODE_SECRET` é usado no HMAC dos códigos de vínculo de conta. Quando
ausente, o site usa o `SESSION_SECRET` como fallback; em produção, prefira um
segredo separado para poder rotacionar códigos sem afetar sessões.

O `DISCORD_LOG_WEBHOOK_URL` recebe os reportes de problema enviados pelo botão da
topbar e deve apontar para um webhook de um canal privado; trate a URL como
segredo. O `OWNER_DISCORD_ID` guarda o ID numérico do Discord do responsável,
usado para mencioná-lo no reporte. Sem webhook válido, o endpoint responde
`503`; sem owner ID válido, o reporte é enviado sem menção.

Se o arquivo estiver em outro caminho, exporte `KAMI_ENV_FILE` antes de subir o
PM2; o `ecosystem.config.cjs` repassa o valor ao Node via `--env-file-if-exists`.

## 5. Primeira instalação

```bash
sudo -u kami git clone <repositorio> /srv/kami-site
cd /srv/kami-site
sudo -u kami npm ci
sudo -u kami npm run build
sudo -u kami pm2 start ecosystem.config.cjs
sudo -u kami pm2 save
sudo env PATH=$PATH pm2 startup systemd -u kami --hp /home/kami
```

Verifique o processo e o log:

```bash
sudo -u kami pm2 status
sudo -u kami pm2 logs kami-site --lines 50
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/api/ready
```

O `ready` só responde `200` quando o pool executa `SELECT 1`. Sem banco ele
responde `503`, e a plataforma não deve receber tráfego.

## 6. Nginx

Copie `deploy/nginx/kami-site.conf` para `/etc/nginx/sites-available/kami-site`,
ajuste os caminhos do certificado e ative:

```bash
sudo ln -s /etc/nginx/sites-available/kami-site /etc/nginx/sites-enabled/kami-site
sudo nginx -t
sudo systemctl reload nginx
```

Se o certificado ainda não existir, comente o bloco `listen 443` ou use
Let's Encrypt temporariamente. Para restringir a origem aos IPs da Cloudflare,
use `allow`/`deny` no `server` ou um firewall na borda; não exponha a porta 3000.

## 7. Cloudflare

1. Aponte `kamiapp.com.br` e `www` para as duas VPS (registros proxied).
2. Use SSL/TLS em **Full (strict)** com o certificado de origem instalado.
3. Configure o health check para `https://kamiapp.com.br/api/ready`, esperando
   `200`; o `503` tira a origem do ar.
4. O failover automático entre origens exige Load Balancing (plano pago) ou
   `cloudflared`. Se a conta não tiver o recurso, mantenha o failover manual via
   DNS e documente o procedimento.
5. Mantenha `NUXT_PUBLIC_SITE_URL` igual ao domínio público, para canonical e OG.
6. O rate limit de login confia no `CF-Connecting-IP`. Restrinja a origem aos IPs da
   Cloudflare ou use Cloudflare Tunnel; sem isso, o cabeçalho pode ser forjado.

## 8. Atualização rolante

Antes de recarregar as VPS, aplique as migrations uma única vez por release, na
primeira VPS e com a role de migration:

```bash
cd /srv/kami-site
sudo -u kami env KAMI_ENV_FILE=/etc/kami/migrations.env npm run db:status
sudo -u kami env KAMI_ENV_FILE=/etc/kami/migrations.env npm run db:migrate
```

Não rode a migration nas duas VPS e não a coloque no boot do processo.

Depois, uma VPS por vez, sempre validando antes de devolver ao balanceamento:

```bash
cd /srv/kami-site
sudo -u kami git fetch --tags
sudo -u kami git checkout <tag>
sudo -u kami npm ci
sudo -u kami npm run build
sudo -u kami pm2 reload ecosystem.config.cjs
curl -fsS http://127.0.0.1:3000/api/ready
curl -fsS http://127.0.0.1:3000/
```

Se o `ready` falhar, não devolva a VPS ao tráfego; veja o rollback.

## 9. Rollback

```bash
cd /srv/kami-site
sudo -u kami git checkout <tag-anterior>
sudo -u kami npm ci
sudo -u kami npm run build
sudo -u kami pm2 reload ecosystem.config.cjs
```

Nunca edite `.output` à mão. Se a falha for de configuração, corrija o
`/etc/kami/kami-site.env` e reinicie com `pm2 restart kami-site --update-env`.

## 10. Verificação de fumaça

```bash
curl -fsS https://kamiapp.com.br/api/health
curl -fsS https://kamiapp.com.br/api/ready
curl -fsS https://kamiapp.com.br/ | head -n 20
curl -fsS https://kamiapp.com.br/termos > /dev/null
curl -sS -o /dev/null -w '%{http_code}\n' https://kamiapp.com.br/ficha/123/amostra
curl -fsS https://kamiapp.com.br/entrar > /dev/null
curl -fsS https://kamiapp.com.br/cadastrar > /dev/null
curl -sS -o /dev/null -w '%{http_code}\n' https://kamiapp.com.br/painel
curl -sS -o /dev/null -w '%{http_code}\n' https://kamiapp.com.br/fichas
curl -sS -o /dev/null -w '%{http_code}\n' https://kamiapp.com.br/ao-vivo
curl -sS -o /dev/null -w '%{http_code}\n' https://kamiapp.com.br/macros
curl -sS -o /dev/null -w '%{http_code}\n' https://kamiapp.com.br/configuracoes
curl -sS -o /dev/null -w '%{http_code}\n' https://kamiapp.com.br/sync
curl -sS -o /dev/null -w '%{http_code}\n' https://kamiapp.com.br/login
curl -sS -o /dev/null -w '%{http_code}\n' https://kamiapp.com.br/comandos
```

A fumaça da D1 exige `/`, jurídico, `/ficha/:userId/:sheetName` em `302` para a URL canônica,
`/comandos` em `410`, `/api/health` em `200`, `/api/ready` em `200` e a imagem
OG acessível no domínio público.

A fumaça da D2 acrescenta `/entrar` em `200`, `/painel` anônimo em `302` e
`/login` em `302`. Faça um login real com uma conta de teste e confira no
`Set-Cookie` que `kami_sessao` tem `HttpOnly`, `Secure` e `SameSite=Lax`;
depois, o logout deve devolver `204` e o `/painel` deve voltar a redirecionar.

A fumaça da D2.1 acrescenta `/cadastrar` em `200` e um cadastro real com username
e e-mail descartáveis. A conta fica ativa imediatamente, sem verificação de e-mail;
como a exclusão de conta ainda não está implementada, remova a conta de teste pelo
banco depois.

A fumaça da D2.2 acrescenta `/fichas`, `/ao-vivo`, `/macros`, `/configuracoes` e
`/sync` anônimos em `302`. Com login, essas páginas respondem `200`, com `noindex`,
e o painel mostra conta, contagens reais, fichas recentes e os vínculos IRT em modo
somente leitura.

A fumaça da D3 acrescenta, com login, criar uma ficha descartável, abrir
`/:userId/ficha/:sheetName`, adicionar um atributo de cada tipo, salvar, recarregar e conferir os
valores. Edite a mesma ficha em duas abas e confirme o `409` na segunda; exclua no
fim. Uma ficha com IRT deve abrir somente leitura e responder `423` em PATCH/DELETE.
O release `6.2.0` fica pendente de migração no `kami_prod`, revisão jurídica e
promoção.

## 11. Observabilidade e operação

- Logs JSON em `/var/log/kami-site/out.log` e `error.log`, com `time: true`.
- Cada requisição recebe `x-request-id`; use o valor para correlacionar Nginx,
  Cloudflare e aplicação.
- Alertas mínimos: 5xx, latência acima do normal, `/api/ready` falhando e pool
  esgotado.
- O shutdown do PM2 tem 8 segundos para fechar o pool; não aumente sem revisar o
  tempo de drenagem do Nginx.
- Backup e restore são responsabilidade do cluster do Postgres; faça um ensaio
  antes do lançamento.

## 12. Problemas comuns

| Sintoma                          | Causa provável                                          | Ação                                                                |
| -------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| Processo reinicia em loop        | `SESSION_SECRET` ou `DATABASE_URL` inválidos            | `pm2 logs`, validar o env                                           |
| `/api/ready` 503                 | HAProxy/Postgres fora ou credencial errada              | testar `psql` com a role `kami_app`                                 |
| Página sem CSS/fontes            | build incompleto ou cache antigo                        | refazer `npm run build`, limpar cache da Cloudflare                 |
| 502 no Nginx                     | app não está em `127.0.0.1:3000`                        | `pm2 status`, `ss -ltnp`                                            |
| Sessões somem após deploy        | banco trocado, `site_sessions` limpa ou cookie expirado | conferir `DATABASE_URL`, `site_sessions` e validade do cookie       |
| `db:migrate` falha com permissão | migration rodou com `kami_app` ou role sem DDL          | usar `MIGRATION_DATABASE_URL` com `kami_migrator`                   |
| `db:status` mostra drift         | schema e migrations fora de sincronia                   | reconciliar antes de criar migration; não editar migration aplicada |
