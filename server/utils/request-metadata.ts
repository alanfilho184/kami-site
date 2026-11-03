import { isIP } from 'node:net';
import type { H3Event } from 'h3';

/**
 * A aplicação roda atrás do Nginx e da Cloudflare. O Nginx deve sobrescrever
 * os cabeçalhos de IP; sem isso, um cliente poderia forjar o valor.
 */
export function getClientIp(event: H3Event): string {
    const candidates = [
        getRequestHeader(event, 'cf-connecting-ip'),
        getRequestHeader(event, 'x-real-ip'),
        getRequestIP(event, { xForwardedFor: true })
    ];

    for (const candidate of candidates) {
        const value = candidate?.split(',')[0]?.trim();

        if (value && isIP(value) !== 0) {
            return value;
        }
    }

    return 'unknown';
}

export function getUserAgent(event: H3Event): string | null {
    const value = getRequestHeader(event, 'user-agent');

    if (!value) {
        return null;
    }

    const normalized = value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 512);
    return normalized.length > 0 ? normalized : null;
}
