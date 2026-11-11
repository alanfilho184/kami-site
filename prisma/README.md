# Banco e migrations

O schema Prisma e o histórico de migrations do Kami vivem neste repositório a
partir da D2. O runtime do site continua usando `pg` + `sql-template-strings`;
o Prisma entra apenas como ferramenta de schema e migration.

## Papéis

| Variável                     | Uso                                                           |
| ---------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`               | runtime do site, role `kami_app`, sem DDL                     |
| `MIGRATION_DATABASE_URL`     | CLI do Prisma, role com DDL, usada só no passo de migration   |
| `PRISMA_SHADOW_DATABASE_URL` | banco de sombra local para `prisma migrate dev --create-only` |

A aplicação nunca recebe DDL. As migrations são aplicadas uma vez por release,
antes do `pm2 reload`, e não no boot do processo.

## Arquivo de ambiente

O `prisma.config.ts` carrega o ambiente na mesma ordem do `ecosystem.config.cjs`:
`KAMI_ENV_FILE` quando definido, senão `/etc/kami/kami-site.env`, e por último o
`.env` da raiz. O primeiro arquivo carregado vence, e variável já exportada no
shell continua tendo precedência. Um `KAMI_ENV_FILE` explícito que não existe
falha na hora, em vez de cair no `.env` por engano.

Em produção, aponte o passo de migration para o arquivo da role com DDL:

```bash
KAMI_ENV_FILE=/etc/kami/migrations.env npm run db:migrate
```

## Histórico existente

As migrations em `prisma/migrations/` foram copiadas do repositório do bot com
os mesmos nomes e o mesmo conteúdo. Isso preserva os checksums da tabela
`_prisma_migrations` que já existe no banco compartilhado.

Antes da primeira migration nova:

```powershell
npm run db:validate
npm run db:status
npm run db:diff
```

O `db:diff` deve sair vazio. Se houver drift, reconcilie antes de criar
qualquer migration. Nunca edite uma migration já aplicada.

## Comandos

| Comando                     | O que faz                                                           |
| --------------------------- | ------------------------------------------------------------------- |
| `npm run db:validate`       | valida o schema sem acessar o banco                                 |
| `npm run db:format`         | formata o schema                                                    |
| `npm run db:status`         | compara o histórico local com o banco                               |
| `npm run db:diff`           | mostra o SQL que falta entre o banco e o schema                     |
| `npm run db:migrate`        | aplica as migrations pendentes (`migrate deploy`)                   |
| `npm run db:migrate:create` | cria uma migration nova em desenvolvimento, sem aplicar em produção |

`prisma migrate dev` usa um banco de sombra e não deve ser executado contra
produção ou contra o banco compartilhado. Use um banco local e
`PRISMA_SHADOW_DATABASE_URL`.

## Bot

O `Kami-Bot-HTTP` mantém um espelho do schema apenas para gerar o Prisma Client
dele. As migrations do bot estão congeladas. Mudanças em tabelas compartilhadas
(`users`, `sheets`, `macros`) devem ser coordenadas com o bot; tabelas novas
exclusivas do site podem evoluir aqui.
