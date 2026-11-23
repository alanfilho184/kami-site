import type { H3Event } from 'h3';
import type { RequestLogContext } from './types';
import { getClientIp } from '../utils/request-metadata';

const MAX_RAW_PATH_LENGTH = 512;

export function requestRoute(event: H3Event): string {
    const matchedRoute = (event.context as { matchedRoute?: { path?: string } }).matchedRoute?.path;

    if (matchedRoute) {
        return matchedRoute;
    }

    const path = typeof event.path === 'string' ? event.path : '';
    return path.split('?')[0] || event.context.log?.route || '/';
}

/**
 * Caminho cru da requisição, sem query e sanitizado. A rota normalizada
 * (`/**`, `/api/fichas/:id`) agrupa bem, mas esconde o alvo real de
 * scanners (`/.env`, `/wp-login.php`); o `raw_path` preserva essa
 * informação para forense sem vazar query (que pode carregar segredo).
 */
export function requestRawPath(event: H3Event): string | null {
    const raw = typeof event.path === 'string' ? event.path : '';
    const withoutQuery = raw.split('?')[0] ?? '';
    const sanitized = withoutQuery.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, MAX_RAW_PATH_LENGTH);

    return sanitized.length > 0 ? sanitized : null;
}

export function createRequestLogContext(event: H3Event, requestId: string): RequestLogContext {
    const ip = getClientIp(event);

    return {
        request_id: requestId,
        method: event.method,
        route: requestRoute(event),
        raw_path: requestRawPath(event),
        ip: ip === 'unknown' ? null : ip,
        user_id: null
    };
}

export function getRequestLogContext(event: H3Event): RequestLogContext | undefined {
    return event.context.log;
}

export function setRequestLogUser(event: H3Event, userId: number): void {
    if (event.context.log) {
        event.context.log.user_id = userId;
    }
}
