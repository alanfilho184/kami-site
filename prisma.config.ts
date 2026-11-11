import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

/**
 * Configuração do Prisma CLI. O runtime do site não usa Prisma Client: o pool
 * do Postgres continua em server/utils/database.ts, com pg.
 *
 * As migrations usam MIGRATION_DATABASE_URL, uma role com DDL que nunca é
 * usada pela aplicação. DATABASE_URL (kami_app) fica só para leitura/escrita
 * de dados em runtime.
 *
 * O arquivo de ambiente segue a regra do ecosystem.config.cjs: KAMI_ENV_FILE
 * quando definido, senão /etc/kami/kami-site.env. Em desenvolvimento, o .env
 * da raiz continua valendo como fallback. O primeiro arquivo carregado vence,
 * porque process.loadEnvFile não sobrescreve variável já definida.
 */
const PRODUCTION_ENV_FILE = '/etc/kami/kami-site.env';
const LOCAL_ENV_FILE = '.env';

function loadEnvFileIfExists(envFile: string): void {
    if (!existsSync(envFile)) {
        return;
    }

    process.loadEnvFile(envFile);
}

const configuredEnvFile = process.env.KAMI_ENV_FILE;

if (configuredEnvFile) {
    // Caminho pedido à mão não cai no .env local por engano: falhar alto é melhor
    // do que migrar o banco errado.
    process.loadEnvFile(configuredEnvFile);
} else {
    loadEnvFileIfExists(PRODUCTION_ENV_FILE);
}

loadEnvFileIfExists(LOCAL_ENV_FILE);

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations'
    },
    datasource: {
        url: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || '',
        shadowDatabaseUrl: process.env.PRISMA_SHADOW_DATABASE_URL
    }
});
