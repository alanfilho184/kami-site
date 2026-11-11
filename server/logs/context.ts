import type { H3Event } from 'h3';
import type { RequestLogContext } from './types';
import { getClientIp } from '../utils/request-metadata';

export function requestRoute(event: H3Event): string {
    const matchedRoute = (event.context as { matchedRoute?: { path?: string } }).matchedRoute?.path;

    if (matchedRoute) {
        return matchedRoute;
    }

    const path = typeof event.path === 'string' ? event.path : '';
    return path.split('?')[0] || event.context.log?.route || '/';
}

export function createRequestLogContext(event: H3Event, requestId: string): RequestLogContext {
    const ip = getClientIp(event);

    return {
        request_id: requestId,
        method: event.method,
        route: requestRoute(event),
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
