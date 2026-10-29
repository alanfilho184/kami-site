import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../server/utils/config';

const validEnvironment = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://kami_app:segredo@127.0.0.1:5432/kami_prod',
    SESSION_SECRET: 'a'.repeat(48),
    LOG_LEVEL: 'warn',
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
            logLevel: 'warn',
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
        expect(config.dbPoolMax).toBe(10);
        expect(config.dbConnectionTimeoutMs).toBe(5000);
        expect(config.dbStatementTimeoutMs).toBe(5000);
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
