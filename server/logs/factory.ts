import type { H3Event } from 'h3';
import type { AppConfig, LogLevel } from '../utils/config';
import { getConfig } from '../utils/config';
import { createLoggerClient } from './client';
import { captureJsonValue } from './body';
import { getRequestLogContext, requestRoute } from './context';
import { redactContext } from './redact';
import { writeLogRecord, type LogRecord } from './stdout';
import type {
    HttpLogContext,
    KamiLogger,
    LoggerClient,
    ScopedLogger,
    WsCallbackLogContext,
    WsLogContext
} from './types';

const levelOrder: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40
};

const fallbackConfig: AppConfig = {
    environment: 'test',
    production: false,
    databaseUrl: '',
    sessionSecret: '',
    syncCodeSecret: null,
    botSyncToken: null,
    discordLogWebhookUrl: null,
    ownerDiscordId: null,
    logLevel: 'error',
    instanceName: 'unknown',
    loggerUrl: null,
    loggerToken: null,
    loggerEnabled: false,
    logHttpPayloads: false,
    logWsPayloads: false,
    logPayloadMaxBytes: 16384,
    dbPoolMax: 1,
    dbConnectionTimeoutMs: 5000,
    dbStatementTimeoutMs: 5000
};

const wsStatusByCode: Record<string, number> = {
    invalid_sheet: 400,
    no_service_rooms: 400,
    unauthorized: 401,
    sheet_password_required: 401,
    forbidden_origin: 403,
    sheet_not_found: 404,
    rate_limited: 429,
    too_many_subscriptions: 429,
    unavailable: 503
};

const clientErrorIntervalMs = 60_000;

export interface LoggerFactoryOptions {
    getConfig?: () => AppConfig;
    getRelease?: () => string;
    now?: () => Date;
    writeStdout?: (record: LogRecord) => void;
    createClient?: (options: {
        url: string;
        token: string;
        instance: string;
        onError: (error: Error) => void;
    }) => LoggerClient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function wsStatusForCode(code: string | undefined): number {
    if (!code) {
        return 400;
    }

    return wsStatusByCode[code] ?? 400;
}

export function createLogger(options: LoggerFactoryOptions = {}): KamiLogger {
    const loadConfig = options.getConfig ?? getConfig;
    const getRelease = options.getRelease ?? (() => 'unknown');
    const now = options.now ?? (() => new Date());
    const writeStdout = options.writeStdout ?? writeLogRecord;
    const makeClient = options.createClient ?? createLoggerClient;

    let cachedConfig: AppConfig | null = null;
    let cachedRelease: string | null = null;
    let client: LoggerClient | null = null;
    let lastClientErrorAt = 0;

    function runtimeConfig(): AppConfig {
        if (!cachedConfig) {
            try {
                cachedConfig = loadConfig();
            } catch {
                // O boot valida a configuração separadamente; o logger nunca
                // pode derrubar um teste ou um serviço de infraestrutura.
                cachedConfig = fallbackConfig;
            }
        }

        return cachedConfig;
    }

    function baseContext(): Record<string, unknown> {
        if (cachedRelease === null) {
            cachedRelease = getRelease();
        }

        return {
            release: cachedRelease,
            instance: runtimeConfig().instanceName
        };
    }

    function shouldWrite(level: LogLevel): boolean {
        return levelOrder[level] >= levelOrder[runtimeConfig().logLevel];
    }

    function reportClientError(error: Error): void {
        const instant = Date.now();

        if (instant - lastClientErrorAt < clientErrorIntervalMs) {
            return;
        }

        lastClientErrorAt = instant;

        if (!shouldWrite('warn')) {
            return;
        }

        writeStdout({
            timestamp: now().toISOString(),
            level: 'warn',
            service: 'kami-site',
            message: 'Logger remoto indisponível',
            context: { event: 'logger.remote.unavailable', error: redactContext(error) }
        });
    }

    function getClient(): LoggerClient | null {
        const config = runtimeConfig();

        if (!config.loggerEnabled || !config.loggerUrl || !config.loggerToken) {
            return null;
        }

        if (!client) {
            client = makeClient({
                url: config.loggerUrl,
                token: config.loggerToken,
                instance: config.instanceName,
                onError: reportClientError
            });
        }

        return client;
    }

    function emitText(level: LogLevel, message: string, context?: unknown): void {
        if (!shouldWrite(level)) {
            return;
        }

        const timestamp = now().toISOString();
        const redacted = context === undefined ? undefined : redactContext(context);
        const record: LogRecord = {
            timestamp,
            level,
            service: 'kami-site',
            message,
            context: redacted
        };

        writeStdout(record);

        if (level === 'debug') {
            return;
        }

        const remote = getClient();

        if (!remote) {
            return;
        }

        const payload: Record<string, unknown> = {
            time: timestamp,
            nivel: level.toUpperCase(),
            mensagem: message,
            ...baseContext()
        };

        if (isRecord(redacted)) {
            Object.assign(payload, redacted);
        }

        remote.send('log-texto', payload);
    }

    function logTexto(level: LogLevel, message: string, context?: unknown): void {
        emitText(level, message, context);
    }

    function logHttp(context: HttpLogContext): void {
        const level: LogLevel =
            context.level ?? (context.status >= 500 ? 'error' : context.status >= 400 ? 'warn' : 'info');
        const message =
            context.message ??
            (context.status >= 500
                ? 'Requisição concluída com falha'
                : context.status >= 400
                  ? 'Requisição recusada'
                  : 'Requisição concluída');
        const timestamp = now().toISOString();
        const localContext: Record<string, unknown> = {
            method: context.method,
            path: context.route,
            status: context.status,
            duration_ms: context.execution_ms,
            request_id: context.request_id
        };

        if (context.request_body_bytes !== undefined) {
            localContext.request_body_bytes = context.request_body_bytes;
        }

        if (context.response_body_bytes !== undefined) {
            localContext.response_body_bytes = context.response_body_bytes;
        }

        if (context.request_body_truncated) {
            localContext.request_body_truncated = true;
        }

        if (context.response_body_truncated) {
            localContext.response_body_truncated = true;
        }

        if (shouldWrite(level)) {
            writeStdout({
                timestamp,
                level,
                service: 'kami-site',
                message,
                context: localContext
            });
        }

        if (context.remote === false) {
            return;
        }

        const remote = getClient();

        if (!remote) {
            return;
        }

        const { level: _level, message: _message, remote: _remote, ...remoteContext } = context;
        const payload = redactContext({
            time: timestamp,
            ...baseContext(),
            ...remoteContext
        });

        remote.send('log-http', isRecord(payload) ? payload : {});
    }

    function logWs(context: WsLogContext): void {
        writeWsEvent('log-ws', context);
    }

    function logWsCallback(context: WsCallbackLogContext): void {
        const status = context.ok ? 200 : wsStatusForCode(context.code);
        writeWsEvent('log-ws-callback', context, status);
    }

    function writeWsEvent(
        eventName: 'log-ws' | 'log-ws-callback',
        context: WsLogContext | WsCallbackLogContext,
        callbackStatus?: number
    ): void {
        const config = runtimeConfig();
        const timestamp = now().toISOString();
        const captured =
            config.logWsPayloads && context.data !== undefined
                ? captureJsonValue(context.data, config.logPayloadMaxBytes)
                : null;
        const { data: _data, ...rest } = context;
        const level: LogLevel = callbackStatus !== undefined && callbackStatus >= 400 ? 'warn' : 'info';
        const localContext: Record<string, unknown> = { ...rest };

        if (callbackStatus !== undefined) {
            localContext.callback_status = callbackStatus;
        }

        if (captured) {
            localContext.data_bytes = captured.bytes;
            localContext.data_truncated = captured.truncated;
        }

        if (shouldWrite(level)) {
            writeStdout({
                timestamp,
                level,
                service: 'kami-site',
                message: `WS ${context.event}`,
                context: localContext
            });
        }

        const remote = getClient();

        if (!remote) {
            return;
        }

        const remoteContext: Record<string, unknown> = {
            ...rest,
            ...(callbackStatus !== undefined ? { callback: { status: callbackStatus } } : {}),
            ...(captured
                ? {
                      data: captured.value,
                      data_bytes: captured.bytes,
                      data_truncated: captured.truncated
                  }
                : {})
        };
        const payload = redactContext({
            time: timestamp,
            ...baseContext(),
            ...remoteContext
        });

        remote.send(eventName, isRecord(payload) ? payload : {});
    }

    function forRequest(event: H3Event): ScopedLogger {
        const request = getRequestLogContext(event);
        const base: Record<string, unknown> = request
            ? {
                  request_id: request.request_id,
                  method: request.method,
                  route: requestRoute(event),
                  ip: request.ip,
                  user_id: request.user_id
              }
            : {};
        const write = (level: LogLevel, message: string, context?: unknown) => {
            const extra = isRecord(context) ? context : context === undefined ? {} : { value: context };
            logTexto(level, message, { ...base, ...extra });
        };

        return {
            debug: (message, context) => write('debug', message, context),
            info: (message, context) => write('info', message, context),
            warn: (message, context) => write('warn', message, context),
            error: (message, context) => write('error', message, context),
            logText: (level, message, context) => write(level, message, context)
        };
    }

    async function flush(timeoutMs = 2000): Promise<void> {
        if (client) {
            await client.flush(timeoutMs);
        }
    }

    async function close(): Promise<void> {
        if (!client) {
            return;
        }

        const current = client;
        client = null;

        try {
            await current.close();
        } catch {
            // O encerramento nunca pode impedir o processo de sair.
        }
    }

    return {
        debug: (message, context) => logTexto('debug', message, context),
        info: (message, context) => logTexto('info', message, context),
        warn: (message, context) => logTexto('warn', message, context),
        error: (message, context) => logTexto('error', message, context),
        logText: (level, message, context) => logTexto(level, message, context),
        logTexto,
        logHttp,
        logWs,
        logWsCallback,
        forRequest,
        flush,
        close
    };
}
