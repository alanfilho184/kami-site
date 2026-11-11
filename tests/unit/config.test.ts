import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../server/utils/config';

const validEnvironment = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://kami_app:segredo@127.0.0.1:5432/kami_prod',
    SESSION_SECRET: 'a'.repeat(48),
    LOG_LEVEL: 'warn',
    INSTANCE_NAME: 'test-instance',
    DB_POOL_MAX: '7',
    DB_CONNECTION_TIMEOUT_MS: '1500',
    DB_STATEMENT_TIMEOUT_MS: '2500'
};

describe('loadConfig', () => {
    it('converte o ambiente validado para a configuração da aplicação', () => {
        const config = loadConfig(validEnvironment);

        expect(config).toEqual({
            environment: 'production',
            production: true,
            databaseUrl: validEnvironment.DATABASE_URL,
            sessionSecret: validEnvironment.SESSION_SECRET,
            syncCodeSecret: null,
            botSyncToken: null,
            discordLogWebhookUrl: null,
            ownerDiscordId: null,
            logLevel: 'warn',
            instanceName: 'test-instance',
            loggerUrl: null,
            loggerToken: null,
            loggerEnabled: false,
            logHttpPayloads: true,
            logWsPayloads: true,
            logPayloadMaxBytes: 16384,
            dbPoolMax: 7,
            dbConnectionTimeoutMs: 1500,
            dbStatementTimeoutMs: 2500
        });
    });

    it('aplica os padrões quando as variáveis opcionais estão ausentes', () => {
        const config = loadConfig({
            DATABASE_URL: validEnvironment.DATABASE_URL,
            SESSION_SECRET: validEnvironment.SESSION_SECRET
        });
        expect(config.environment).toBe('development');
        expect(config.logLevel).toBe('info');
        expect(config.syncCodeSecret).toBeNull();
        expect(config.botSyncToken).toBeNull();
        expect(config.dbPoolMax).toBe(10);
        expect(config.dbConnectionTimeoutMs).toBe(5000);
        expect(config.dbStatementTimeoutMs).toBe(5000);
    });

    it('carrega o token de serviço usado pelo bot', () => {
        const token = 'b'.repeat(48);
        const config = loadConfig({
            ...validEnvironment,
            BOT_SYNC_TOKEN: token
        });

        expect(config.botSyncToken).toBe(token);
    });

    it('carrega o segredo dos códigos de vínculo', () => {
        const secret = 'c'.repeat(48);
        const config = loadConfig({
            ...validEnvironment,
            SYNC_CODE_SECRET: secret
        });

        expect(config.syncCodeSecret).toBe(secret);
    });

    it('carrega o webhook de reportes e o owner do Discord', () => {
        const config = loadConfig({
            ...validEnvironment,
            DISCORD_LOG_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/token',
            OWNER_DISCORD_ID: '123456789012345678'
        });

        expect(config.discordLogWebhookUrl).toBe('https://discord.com/api/webhooks/123/token');
        expect(config.ownerDiscordId).toBe('123456789012345678');
    });

    it('carrega o logger remoto e as flags de payload', () => {
        const config = loadConfig({
            ...validEnvironment,
            LOGGER_URL: 'https://logger.example.com',
            LOGGER_TOKEN: `klp_${'x'.repeat(32)}`,
            LOG_HTTP_PAYLOADS: 'false',
            LOG_WS_PAYLOADS: 'false',
            LOG_PAYLOAD_MAX_BYTES: '8192'
        });

        expect(config.loggerUrl).toBe('https://logger.example.com');
        expect(config.loggerToken).toBe(`klp_${'x'.repeat(32)}`);
        expect(config.loggerEnabled).toBe(true);
        expect(config.logHttpPayloads).toBe(false);
        expect(config.logWsPayloads).toBe(false);
        expect(config.logPayloadMaxBytes).toBe(8192);
    });

    it('exige LOGGER_URL e LOGGER_TOKEN juntos', () => {
        expect(() =>
            loadConfig({
                ...validEnvironment,
                LOGGER_URL: 'https://logger.example.com'
            })
        ).toThrow(/LOGGER_URL/);
    });

    it('usa um nome de instância padrão quando INSTANCE_NAME não é definido', () => {
        const config = loadConfig({ ...validEnvironment, INSTANCE_NAME: undefined });

        expect(config.instanceName.length).toBeGreaterThan(0);
    });

    it('recusa uma URL que não aponta para o Postgres', () => {
        expect(() =>
            loadConfig({
                ...validEnvironment,
                DATABASE_URL: 'mysql://kami_app:segredo@127.0.0.1:3306/kami_prod'
            })
        ).toThrow(/DATABASE_URL/);
    });

    it('exige um segredo de sessão com pelo menos 32 caracteres', () => {
        expect(() =>
            loadConfig({
                ...validEnvironment,
                SESSION_SECRET: 'curto'
            })
        ).toThrow(/SESSION_SECRET/);
    });

    it('não inclui valores sensíveis na mensagem de erro', () => {
        const secret = 'segredo-que-nao-pode-vazar';
        let message = '';

        try {
            loadConfig({
                ...validEnvironment,
                DATABASE_URL: `mysql://kami_app:${secret}@127.0.0.1:3306/kami_prod`
            });
        } catch (error) {
            message = error instanceof Error ? error.message : String(error);
        }

        expect(message).toContain('DATABASE_URL');
        expect(message).not.toContain(secret);
    });
});
