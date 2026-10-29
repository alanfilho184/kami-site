import { getConfig, type LogLevel } from './config';

const levelOrder: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40
};

const sensitiveKeys = /senha|password|token|secret|authorization|cookie|sessao|session/i;
const credentialUrl = /(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi;

export interface LogRecord {
    timestamp: string;
    level: LogLevel;
    service: 'kami-site';
    message: string;
    context?: unknown;
}

/**
 * Redige a senha embutida em URLs de conexão e remove quebras de linha para
 * manter uma linha JSON por evento.
 */
function redactText(text: string): string {
    return text.replace(credentialUrl, '$1***@').replace(/\s+/g, ' ');
}

function redactValue(value: unknown, depth = 0): unknown {
    if (depth > 4) {
        return '[limit]';
    }

    if (typeof value === 'string') {
        return redactText(value);
    }

    if (value instanceof Error) {
        return {
            name: value.name,
            message: redactText(value.message),
            stack: value.stack ? redactText(value.stack) : undefined
        };
    }

    if (Array.isArray(value)) {
        return value.map(item => redactValue(item, depth + 1));
    }

    if (value && typeof value === 'object') {
        const output: Record<string, unknown> = {};

        for (const [key, content] of Object.entries(value as Record<string, unknown>)) {
            output[key] = sensitiveKeys.test(key) ? '***' : redactValue(content, depth + 1);
        }

        return output;
    }

    return value;
}

export function redactContext(context: unknown): unknown {
    return redactValue(context);
}

function write(level: LogLevel, message: string, context?: unknown): void {
    const record: LogRecord = {
        timestamp: new Date().toISOString(),
        level,
        service: 'kami-site',
        message,
        context: context === undefined ? undefined : redactContext(context)
    };
    const line = JSON.stringify(record);

    if (level === 'warn' || level === 'error') {
        console.error(line);
        return;
    }

    console.log(line);
}

export interface Logger {
    debug(message: string, context?: unknown): void;
    info(message: string, context?: unknown): void;
    warn(message: string, context?: unknown): void;
    error(message: string, context?: unknown): void;
    logText(level: LogLevel, message: string, context?: unknown): void;
}

export function createLogger(minimumLevel: LogLevel): Logger {
    const minimum = levelOrder[minimumLevel];

    function emit(level: LogLevel, message: string, context?: unknown): void {
        if (levelOrder[level] >= minimum) {
            write(level, message, context);
        }
    }

    return {
        debug: (message, context) => emit('debug', message, context),
        info: (message, context) => emit('info', message, context),
        warn: (message, context) => emit('warn', message, context),
        error: (message, context) => emit('error', message, context),
        logText: (level, message, context) => emit(level, message, context)
    };
}

let defaultLogger: Logger | null = null;

export function getLogger(): Logger {
    if (!defaultLogger) {
        defaultLogger = createLogger(getConfig().logLevel);
    }

    return defaultLogger;
}

/**
 * Fachada preguiçosa: a configuração só é lida na primeira chamada, para que
 * testes possam importar o módulo sem um ambiente completo.
 */
export const logger: Logger = {
    debug: (message, context) => getLogger().debug(message, context),
    info: (message, context) => getLogger().info(message, context),
    warn: (message, context) => getLogger().warn(message, context),
    error: (message, context) => getLogger().error(message, context),
    logText: (level, message, context) => getLogger().logText(level, message, context)
};
