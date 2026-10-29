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

O **bot** é dono do schema e das migrations. O site não executa DDL. Antes de
subir a D2/D5, o repositório do bot precisa criar `site_sessions`,
`site_sync_codes`, `sheet_sync_queue` e `socket_io_attachments`, com os índices
e GRANTs correspondentes.

Exemplo de preparação da role (rodar como administrador do cluster, uma vez):

```sql
CREATE ROLE kami_app LOGIN PASSWORD 'troque-esta-senha';
GRANT CONNECT ON DATABASE kami_prod TO kami_app;
GRANT USAGE ON SCHEMA public TO kami_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON
    users,
    sheets,
    irt_sheets,
    servers_config,
    macros,
    site_sessions,
    site_sync_codes,
    sheet_sync_queue,
    socket_io_attachments
TO kami_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kami_app;
```

Regras:

- nunca use superusuário no site;
- `DELETE` em `users` não é concedido sem o fluxo de exclusão acordado com o bot;
- toda tabela nova entra no repositório do bot com migration e GRANT;
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
NUXT_PUBLIC_BOT_INVITE=https://discord.com/api/oauth2/authorize?client_id=716053210179043409&permissions=52224&scope=bot%20applications.commands

DATABASE_URL=postgresql://kami_app:senha@127.0.0.1:5432/kami_prod
SESSION_SECRET=32-bytes-aleatorios-exclusivos-do-site
LOG_LEVEL=info
DB_POOL_MAX=10
DB_CONNECTION_TIMEOUT_MS=5000
DB_STATEMENT_TIMEOUT_MS=5000
```

Gere o `SESSION_SECRET` com `openssl rand -base64 48`. Trocar o segredo invalida
as sessões existentes; faça isso apenas em incidente ou rotação planejada.

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

## 8. Atualização rolante

Uma VPS por vez, sempre validando antes de devolver ao balanceamento:

```bash
cd /srv/kami-site
sudo -u kami git fetch --tags
sudo -u kami git checkout v6.0.0
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
curl -fsS https://kamiapp.com.br/ficha > /dev/null
curl -sS -o /dev/null -w '%{http_code}\n' https://kamiapp.com.br/comandos
```

A fumaça da D1 exige `/`, jurídico, `/ficha` com o aviso de desenvolvimento,
`/comandos` em `410`, `/api/health` em `200`, `/api/ready` em `200` e a imagem
OG acessível no domínio público.

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

| Sintoma                   | Causa provável                               | Ação                                                |
| ------------------------- | -------------------------------------------- | --------------------------------------------------- |
| Processo reinicia em loop | `SESSION_SECRET` ou `DATABASE_URL` inválidos | `pm2 logs`, validar o env                           |
| `/api/ready` 503          | HAProxy/Postgres fora ou credencial errada   | testar `psql` com a role `kami_app`                 |
| Página sem CSS/fontes     | build incompleto ou cache antigo             | refazer `npm run build`, limpar cache da Cloudflare |
| 502 no Nginx              | app não está em `127.0.0.1:3000`             | `pm2 status`, `ss -ltnp`                            |
| Sessões somem após deploy | `SESSION_SECRET` mudou ou banco trocado      | conferir env e database                             |
