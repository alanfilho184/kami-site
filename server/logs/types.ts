import type { H3Event } from 'h3';
import type { LogLevel } from '../utils/config';

export type { LogLevel };

export type AuthMethod = 'password' | 'session' | 'sheet_cookie' | 'service_token' | 'anonymous';

export type IngestEventName = 'log-http' | 'log-ws' | 'log-ws-callback' | 'log-texto';

export interface RequestLogContext {
    request_id: string;
    method: string;
    route: string;
    ip: string | null;
    user_id: number | null;
}

export interface LogContext {
    event?: string;
    action?: string;
    user_id?: number | null;
    sheet_id?: number | null;
    sheet_name?: string | null;
    sheet_owner_id?: number | null;
    from_user_id?: number | null;
    error_code?: string | null;
    error_name?: string | null;
    auth_method?: AuthMethod;
    is_public?: boolean;
    has_password?: boolean;
    is_legacy?: boolean;
    automatic?: boolean;
    room?: string | null;
    socket_id?: string | null;
    upstream_status?: number | null;
    request_id?: string;
    ip?: string | null;
    request_body?: unknown;
    response_body?: unknown;
    request_body_bytes?: number;
    response_body_bytes?: number;
    request_body_truncated?: boolean;
    response_body_truncated?: boolean;
    data?: unknown;
    data_bytes?: number;
    data_truncated?: boolean;
    [key: string]: unknown;
}

export interface HttpLogContext extends LogContext {
    method: string;
    route: string;
    status: number;
    execution_ms: number;
    request_id: string;
    /** Nível local; o remoto continua derivando do status HTTP. */
    level?: LogLevel;
    /** Mensagem local; o remoto não usa. */
    message?: string;
    /** Quando false, grava só no stdout. */
    remote?: boolean;
}

export interface WsLogContext extends LogContext {
    event: string;
    action?: string;
}

export interface WsCallbackLogContext extends WsLogContext {
    ok: boolean;
    code?: string;
}

export interface ScopedLogger {
    debug(message: string, context?: unknown): void;
    info(message: string, context?: unknown): void;
    warn(message: string, context?: unknown): void;
    error(message: string, context?: unknown): void;
    logText(level: LogLevel, message: string, context?: unknown): void;
}

export interface KamiLogger extends ScopedLogger {
    logTexto(level: LogLevel, message: string, context?: unknown): void;
    logHttp(context: HttpLogContext): void;
    logWs(context: WsLogContext): void;
    logWsCallback(context: WsCallbackLogContext): void;
    forRequest(event: H3Event): ScopedLogger;
    flush(timeoutMs?: number): Promise<void>;
    close(): Promise<void>;
}

export interface LoggerClient {
    send(event: IngestEventName, payload: Record<string, unknown>): void;
    flush(timeoutMs?: number): Promise<void>;
    close(): Promise<void>;
    isConnected(): boolean;
    pending(): number;
}

export interface LoggerClientOptions {
    url: string;
    token: string;
    instance: string;
    onError: (error: Error) => void;
    maxQueue?: number;
    maxQueueBytes?: number;
}
