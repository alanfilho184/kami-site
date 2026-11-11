import { timingSafeEqual } from 'node:crypto';
import type { H3Event } from 'h3';
import { createError, getRequestHeader } from 'h3';
import {
    REALTIME_SERVICE_HEADER,
    REALTIME_SERVICE_ROOMS,
    type RealtimeServiceRoom
} from '~~/shared/constants/realtime';
import { isServiceRoom } from '~~/shared/utils/realtime';
import { getConfig } from './config';

/**
 * Compara tokens de serviço em tempo constante. Tamanhos diferentes já são
 * recusados sem revelar qual byte divergiu.
 */
export function compareServiceToken(expected: string | null, received: string | null): boolean {
    if (!expected || !received) {
        return false;
    }

    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);

    if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
    }

    return timingSafeEqual(expectedBuffer, receivedBuffer);
}

/**
 * Aceita apenas as salas de serviço conhecidas. O primeiro acesso sem lista
 * recebe `service:sheets`, que é o canal básico do bot.
 */
export function readServiceRooms(input: unknown): RealtimeServiceRoom[] {
    const values = Array.isArray(input) ? input : [REALTIME_SERVICE_ROOMS.sheets];
    const rooms = new Set<RealtimeServiceRoom>();

    for (const value of values) {
        if (typeof value === 'string' && isServiceRoom(value)) {
            rooms.add(value);
        }
    }

    return [...rooms];
}

/** Protege endpoints internos chamados pelo bot com o mesmo token do Socket.IO. */
export function requireServiceToken(event: H3Event): void {
    const received = getRequestHeader(event, REALTIME_SERVICE_HEADER) ?? null;

    if (!compareServiceToken(getConfig().botSyncToken, received)) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized',
            message: 'Não autorizado.'
        });
    }
}
