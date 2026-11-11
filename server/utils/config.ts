import { hostname } from 'node:os';
import { z } from 'zod';

const emptyToUndefined = (value: unknown) =>
    typeof value === 'string' && value.trim().length === 0 ? undefined : value;

const environmentSchema = z
    .object({
        NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
        DATABASE_URL: z
            .string()
            .min(1, 'DATABASE_URL é obrigatória')
            .refine(value => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
                message: 'DATABASE_URL deve usar postgres:// ou postgresql://'
            }),
        SESSION_SECRET: z.string().min(32, 'SESSION_SECRET deve ter pelo menos 32 caracteres'),
        SYNC_CODE_SECRET: z.string().min(32, 'SYNC_CODE_SECRET deve ter pelo menos 32 caracteres').optional(),
        BOT_SYNC_TOKEN: z.string().min(32, 'BOT_SYNC_TOKEN deve ter pelo menos 32 caracteres').optional(),
        DISCORD_LOG_WEBHOOK_URL: z.string().trim().optional(),
        OWNER_DISCORD_ID: z.string().trim().optional(),
        LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
        INSTANCE_NAME: z.string().trim().max(64, 'INSTANCE_NAME deve ter no máximo 64 caracteres').optional(),
        LOGGER_URL: z.preprocess(
            emptyToUndefined,
            z.string().trim().url('LOGGER_URL deve ser uma URL válida').optional()
        ),
        LOGGER_TOKEN: z.preprocess(
            emptyToUndefined,
            z.string().trim().startsWith('klp_', 'LOGGER_TOKEN deve começar com klp_').min(20).optional()
        ),
        LOG_HTTP_PAYLOADS: z
            .enum(['true', 'false'])
            .default('true')
            .transform(value => value === 'true'),
        LOG_WS_PAYLOADS: z
            .enum(['true', 'false'])
            .default('true')
            .transform(value => value === 'true'),
        LOG_PAYLOAD_MAX_BYTES: z.coerce.number().int().min(1024).max(65536).default(16384),
        DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
        DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(500).max(60000).default(5000),
        DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(500).max(60000).default(5000)
    })
    .superRefine((data, context) => {
        if (Boolean(data.LOGGER_URL) !== Boolean(data.LOGGER_TOKEN)) {
            context.addIssue({
                code: 'custom',
                path: ['LOGGER_URL'],
                message: 'LOGGER_URL e LOGGER_TOKEN devem ser definidos juntos'
            });
        }
    });

export type Environment = 'development' | 'test' | 'production';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppConfig {
    environment: Environment;
    production: boolean;
    databaseUrl: string;
    sessionSecret: string;
    syncCodeSecret: string | null;
    botSyncToken: string | null;
    discordLogWebhookUrl: string | null;
    ownerDiscordId: string | null;
    logLevel: LogLevel;
    instanceName: string;
    loggerUrl: string | null;
    loggerToken: string | null;
    loggerEnabled: boolean;
    logHttpPayloads: boolean;
    logWsPayloads: boolean;
    logPayloadMaxBytes: number;
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
        syncCodeSecret: data.SYNC_CODE_SECRET ?? null,
        botSyncToken: data.BOT_SYNC_TOKEN ?? null,
        discordLogWebhookUrl: data.DISCORD_LOG_WEBHOOK_URL || null,
        ownerDiscordId: data.OWNER_DISCORD_ID || null,
        logLevel: data.LOG_LEVEL,
        instanceName: data.INSTANCE_NAME || hostname().slice(0, 64) || 'kami-site',
        loggerUrl: data.LOGGER_URL ?? null,
        loggerToken: data.LOGGER_TOKEN ?? null,
        loggerEnabled: Boolean(data.LOGGER_URL && data.LOGGER_TOKEN),
        logHttpPayloads: data.LOG_HTTP_PAYLOADS,
        logWsPayloads: data.LOG_WS_PAYLOADS,
        logPayloadMaxBytes: data.LOG_PAYLOAD_MAX_BYTES,
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
