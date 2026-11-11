import type { H3Event } from 'h3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../server/utils/config';
import { createLogger } from '../../server/logs/factory';
import type { LoggerClient } from '../../server/logs/types';

const baseConfig: AppConfig = {
    environment: 'test',
    production: false,
    databaseUrl: 'postgresql://kami_app:segredo@127.0.0.1:5432/kami_test',
    sessionSecret: 'a'.repeat(48),
    syncCodeSecret: null,
    botSyncToken: null,
    discordLogWebhookUrl: null,
    ownerDiscordId: null,
    logLevel: 'info',
    instanceName: 'test-instance',
    loggerUrl: 'https://logger.example.com',
    loggerToken: `klp_${'x'.repeat(32)}`,
    loggerEnabled: true,
    logHttpPayloads: true,
    logWsPayloads: true,
    logPayloadMaxBytes: 16384,
    dbPoolMax: 10,
    dbConnectionTimeoutMs: 5000,
    dbStatementTimeoutMs: 5000
};

function buildLogger(overrides: Partial<AppConfig> = {}) {
    const output = vi.fn();
    const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const client: LoggerClient = {
        send: (event, payload) => {
            events.push({ event, payload });
        },
        flush: async () => undefined,
        close: async () => undefined,
        isConnected: () => true,
        pending: () => 0
    };
    const logger = createLogger({
        getConfig: () => ({ ...baseConfig, ...overrides }),
        getRelease: () => '6.2.0',
        now: () => new Date('2026-11-09T12:00:00.000Z'),
        writeStdout: output,
        createClient: () => client
    });

    return { logger, output, events };
}

function firstRecord(output: ReturnType<typeof vi.fn>): Record<string, unknown> {
    return output.mock.calls[0]?.[0] as Record<string, unknown>;
}

describe('logs', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('emite a linha JSON local no formato atual', () => {
        const { logger, output } = buildLogger();

        logger.info('Requisição concluída', { request_id: 'abc12345' });

        expect(output).toHaveBeenCalledTimes(1);

        const record = firstRecord(output);

        expect(record).toMatchObject({
            level: 'info',
            service: 'kami-site',
            message: 'Requisição concluída',
            context: { request_id: 'abc12345' }
        });
        expect(record.timestamp).toBe('2026-11-09T12:00:00.000Z');
    });

    it('não emite registros abaixo do nível mínimo', () => {
        const { logger, output } = buildLogger({ logLevel: 'warn' });

        logger.info('IGNORADO');
        logger.debug('IGNORADO');

        expect(output).not.toHaveBeenCalled();
    });

    it('envia o evento de texto achatado e com o contexto base', () => {
        const { logger, events } = buildLogger();

        logger.info('Ficha criada', {
            event: 'sheet.created',
            user_id: 7,
            sheet_id: 10,
            sheet_name: 'Ficha teste'
        });

        expect(events).toHaveLength(1);
        expect(events[0]?.event).toBe('log-texto');
        expect(events[0]?.payload).toMatchObject({
            time: '2026-11-09T12:00:00.000Z',
            nivel: 'INFO',
            mensagem: 'Ficha criada',
            event: 'sheet.created',
            user_id: 7,
            sheet_id: 10,
            sheet_name: 'Ficha teste',
            release: '6.2.0',
            instance: 'test-instance'
        });
    });

    it('não envia debug ao logger remoto', () => {
        const { logger, output, events } = buildLogger({ logLevel: 'debug' });

        logger.debug('Depuração', { event: 'debug.local' });

        expect(output).toHaveBeenCalledTimes(1);
        expect(events).toHaveLength(0);
    });

    it('mascara chaves sensíveis, URL do Postgres e e-mail', () => {
        const { logger, output } = buildLogger();

        logger.info('Contexto', {
            password: 'valor-da-senha',
            nested: {
                token: 'valor-do-token',
                safe: 'visível'
            },
            url: 'postgresql://kami_app:segredo@127.0.0.1:5432/kami_prod',
            email: 'alan@example.com'
        });

        const context = firstRecord(output).context as Record<string, unknown>;

        expect(context).toMatchObject({
            password: '***',
            nested: {
                token: '***',
                safe: 'visível'
            },
            email: 'a***@example.com'
        });
        expect(context.url).toBe('postgresql://kami_app:***@127.0.0.1:5432/kami_prod');
    });

    it('preserva o código de erros do Node e do Postgres', () => {
        const { logger, output } = buildLogger();
        const error = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });

        logger.error('Falha de conexão', { error });

        const context = firstRecord(output).context as { error: Record<string, unknown> };

        expect(context.error).toMatchObject({
            name: 'Error',
            message: 'connect ECONNREFUSED',
            code: 'ECONNREFUSED'
        });
    });

    it('registra request/response body no remoto e só o resumo no stdout', () => {
        const { logger, output, events } = buildLogger();

        logger.logHttp({
            method: 'PATCH',
            route: '/api/fichas/:id',
            status: 200,
            execution_ms: 12,
            request_id: 'req-1',
            ip: '127.0.0.1',
            user_id: 7,
            request_body: { password: 'x', name: 'Ficha' },
            response_body: { ok: true },
            request_body_bytes: 30,
            response_body_bytes: 11
        });

        const local = firstRecord(output);
        expect(local.context).toMatchObject({
            method: 'PATCH',
            path: '/api/fichas/:id',
            status: 200,
            duration_ms: 12,
            request_id: 'req-1',
            request_body_bytes: 30,
            response_body_bytes: 11
        });
        expect(local.context).not.toHaveProperty('request_body');
        expect(local.context).not.toHaveProperty('response_body');

        expect(events[0]?.event).toBe('log-http');
        expect(events[0]?.payload).toMatchObject({
            method: 'PATCH',
            route: '/api/fichas/:id',
            status: 200,
            execution_ms: 12,
            request_id: 'req-1',
            user_id: 7,
            request_body: { password: '***', name: 'Ficha' },
            response_body: { ok: true },
            release: '6.2.0',
            instance: 'test-instance'
        });
    });

    it('não envia o 401 da verificação de sessão ao remoto', () => {
        const { logger, events } = buildLogger();

        logger.logHttp({
            method: 'GET',
            route: '/api/auth/session',
            status: 401,
            execution_ms: 3,
            request_id: 'req-2',
            level: 'debug',
            remote: false
        });

        expect(events).toHaveLength(0);
    });

    it('envia dados de WebSocket com máscara e callback.status', () => {
        const { logger, events } = buildLogger();

        logger.logWs({
            event: 'realtime.sheet.subscribed',
            action: 'subscribe',
            socket_id: 'socket-1',
            room: 'sheet-10',
            sheet_id: 10,
            user_id: 7,
            data: { sheetId: 10, nested: { token: 'segredo' } }
        });
        logger.logWsCallback({
            event: 'realtime.sheet.subscription.denied',
            action: 'subscribe',
            ok: false,
            code: 'sheet_not_found',
            socket_id: 'socket-1',
            sheet_id: 10,
            data: { sheetId: 10 }
        });

        expect(events[0]?.event).toBe('log-ws');
        expect(events[0]?.payload).toMatchObject({
            event: 'realtime.sheet.subscribed',
            socket_id: 'socket-1',
            room: 'sheet-10',
            sheet_id: 10,
            data: { sheetId: 10, nested: { token: '***' } }
        });

        expect(events[1]?.event).toBe('log-ws-callback');
        expect(events[1]?.payload).toMatchObject({
            event: 'realtime.sheet.subscription.denied',
            ok: false,
            code: 'sheet_not_found',
            callback: { status: 404 },
            data: { sheetId: 10 }
        });
    });

    it('respeita LOG_WS_PAYLOADS=false', () => {
        const { logger, events } = buildLogger({ logWsPayloads: false });

        logger.logWs({
            event: 'sheet.updated',
            action: 'emit',
            sheet_id: 10,
            data: { version: 'v1' }
        });

        expect(events[0]?.payload).not.toHaveProperty('data');
        expect(events[0]?.payload).not.toHaveProperty('data_bytes');
    });

    it('mescla o contexto da requisição em forRequest', () => {
        const { logger, events } = buildLogger();
        const event = {
            context: {
                log: {
                    request_id: 'req-3',
                    method: 'POST',
                    route: '/api/fichas',
                    ip: '127.0.0.1',
                    user_id: 7
                }
            }
        } as unknown as H3Event;

        logger.forRequest(event).info('Ficha criada', { event: 'sheet.created', sheet_id: 10 });

        expect(events[0]?.payload).toMatchObject({
            request_id: 'req-3',
            method: 'POST',
            route: '/api/fichas',
            ip: '127.0.0.1',
            user_id: 7,
            event: 'sheet.created',
            sheet_id: 10
        });
    });

    it('não abre cliente remoto quando o logger está desabilitado', () => {
        const { logger, output, events } = buildLogger({
            loggerEnabled: false,
            loggerUrl: null,
            loggerToken: null
        });

        logger.info('Somente stdout', { event: 'test.local' });

        expect(output).toHaveBeenCalledTimes(1);
        expect(events).toHaveLength(0);
    });
});
