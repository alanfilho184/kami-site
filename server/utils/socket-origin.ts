import type { IncomingHttpHeaders } from 'node:http';
import { isIP } from 'node:net';
import { isSameOriginValues } from './request-origin';

function firstHeader(value: string | string[] | undefined): string | null {
    if (Array.isArray(value)) {
        return value[0] ?? null;
    }

    return value ?? null;
}

export function getSocketIp(headers: IncomingHttpHeaders, fallback: string | null): string {
    const candidates = [
        firstHeader(headers['cf-connecting-ip']),
        firstHeader(headers['x-real-ip']),
        firstHeader(headers['x-forwarded-for'])?.split(',')[0]?.trim() ?? null,
        fallback
    ];

    for (const candidate of candidates) {
        if (candidate && isIP(candidate) !== 0) {
            return candidate;
        }
    }

    return 'unknown';
}

/**
 * O handshake de um usuário precisa vir da mesma origem do site. O cliente do
 * bot não passa por essa checagem porque usa token de serviço.
 */
export function isAllowedSocketOrigin(headers: IncomingHttpHeaders): boolean {
    return isSameOriginValues({
        origin: firstHeader(headers.origin),
        referer: null,
        host: firstHeader(headers['x-forwarded-host']) ?? firstHeader(headers.host) ?? '',
        protocol: ''
    });
}
