import { createLogger } from './factory';

function readRelease(): string {
    try {
        const runtimeConfig = useRuntimeConfig();
        const version = (runtimeConfig.public as { version?: unknown }).version;

        return typeof version === 'string' && version.length > 0 ? version : 'unknown';
    } catch {
        return 'unknown';
    }
}

type GlobalWithLogger = typeof globalThis & {
    __kamiLogger?: ReturnType<typeof createLogger>;
};

const globalScope = globalThis as GlobalWithLogger;

/**
 * Singleton de logging do kami-site. Todo o código importa apenas `logger`;
 * a fábrica em `factory.ts` fica restrita aos testes.
 */
export const logger = (globalScope.__kamiLogger ??= createLogger({ getRelease: readRelease }));

export type {
    AuthMethod,
    HttpLogContext,
    KamiLogger,
    LogContext,
    LogLevel,
    ScopedLogger,
    WsCallbackLogContext,
    WsLogContext
} from './types';
