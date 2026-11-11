import type { H3Event } from 'h3';

export interface OriginValues {
    origin: string | null;
    referer: string | null;
    host: string;
    protocol: string;
}

/**
 * Confere a origem de mutações. O cookie SameSite=Lax já bloqueia a maior parte
 * dos POSTs cross-site; esta checagem cobre o restante e também requisições
 * feitas por clientes que enviam Origin.
 */
export function isSameOriginValues(values: OriginValues): boolean {
    const source = values.origin || values.referer;

    if (!source || !values.host) {
        return false;
    }

    try {
        const url = new URL(source);

        if (!url.host || url.host !== values.host) {
            return false;
        }

        const protocol = values.protocol.replace(/:$/, '');
        return protocol.length === 0 || url.protocol === `${protocol}:`;
    } catch {
        return false;
    }
}

export function assertSameOrigin(event: H3Event): void {
    const valid = isSameOriginValues({
        origin: getRequestHeader(event, 'origin') ?? null,
        referer: getRequestHeader(event, 'referer') ?? null,
        host: getRequestHost(event, { xForwardedHost: true }) ?? '',
        protocol: getRequestProtocol(event, { xForwardedProto: true }) ?? ''
    });

    if (!valid) {
        throw createError({
            statusCode: 403,
            message: 'Requisição recusada.'
        });
    }
}
