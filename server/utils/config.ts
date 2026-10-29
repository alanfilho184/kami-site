import { z } from 'zod';

const environmentSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z
        .string()
        .min(1, 'DATABASE_URL é obrigatória')
        .refine(value => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
            message: 'DATABASE_URL deve usar postgres:// ou postgresql://'
        }),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET deve ter pelo menos 32 caracteres'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(500).max(60000).default(5000),
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(500).max(60000).default(5000)
});

export type Environment = 'development' | 'test' | 'production';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppConfig {
    environment: Environment;
    production: boolean;
    databaseUrl: string;
    sessionSecret: string;
    logLevel: LogLevel;
    dbPoolMax: number;
    dbConnectionTimeoutMs: number;
    dbStatementTimeoutMs: number;
}

let cache: AppConfig | null = null;

/**
 * Valida e converte o ambiente uma única vez. A mensagem de erro lista apenas os
 * nomes dos campos inválidos, nunca os valores, para não vazar credenciais no log.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
    const result = environmentSchema.safeParse(env);

    if (!result.success) {
        const errors = result.error.issues.map(issue => {
            const field = issue.path.join('.') || 'environment';
            return `${field}: ${issue.message}`;
        });
        throw new Error(`Configuração de ambiente inválida:\n${errors.join('\n')}`);
    }

    const data = result.data;

    return {
        environment: data.NODE_ENV,
        production: data.NODE_ENV === 'production',
        databaseUrl: data.DATABASE_URL,
        sessionSecret: data.SESSION_SECRET,
        logLevel: data.LOG_LEVEL,
        dbPoolMax: data.DB_POOL_MAX,
        dbConnectionTimeoutMs: data.DB_CONNECTION_TIMEOUT_MS,
        dbStatementTimeoutMs: data.DB_STATEMENT_TIMEOUT_MS
    };
}

export function getConfig(): AppConfig {
    if (!cache) {
        cache = loadConfig();
    }

    return cache;
}

export function clearConfigCache(): void {
    cache = null;
}
