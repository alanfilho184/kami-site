import { defineConfig } from 'prisma/config';

/**
 * Configuração do Prisma CLI. O runtime do site não usa Prisma Client: o pool
 * do Postgres continua em server/utils/database.ts, com pg.
 *
 * As migrations usam MIGRATION_DATABASE_URL, uma role com DDL que nunca é
 * usada pela aplicação. DATABASE_URL (kami_app) fica só para leitura/escrita
 * de dados em runtime.
 */
try {
    process.loadEnvFile('.env');
} catch {
    // O .env é opcional para comandos que não acessam o banco, como validate.
}

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
