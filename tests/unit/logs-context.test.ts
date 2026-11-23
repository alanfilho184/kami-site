import type { H3Event } from 'h3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequestLogContext, requestRawPath, requestRoute } from '../../server/logs/context';

function buildEvent(path: unknown, matchedRoute?: string): H3Event {
    return {
        path,
        method: 'GET',
        node: { req: { headers: {} } },
        context: matchedRoute === undefined ? {} : { matchedRoute: { path: matchedRoute } }
    } as unknown as H3Event;
}

describe('contexto de log da requisição', () => {
    beforeEach(() => {
        vi.stubGlobal('getRequestHeader', () => undefined);
        vi.stubGlobal('getRequestIP', () => undefined);

        return () => {
            vi.unstubAllGlobals();
        };
    });

    it('prefere a rota normalizada quando o roteador resolveu', () => {
        expect(requestRoute(buildEvent('/api/fichas/10', '/api/fichas/:id'))).toBe('/api/fichas/:id');
    });

    it('usa o caminho cru como rota quando não há match', () => {
        expect(requestRoute(buildEvent('/wp-login.php'))).toBe('/wp-login.php');
    });

    it('remove a query do caminho cru', () => {
        expect(requestRawPath(buildEvent('/api/fichas?filtro=vivas&limite=30'))).toBe('/api/fichas');
    });

    it('remove caracteres de controle do caminho cru', () => {
        const dirty = '/api/' + String.fromCharCode(0) + 'fichas/' + String.fromCharCode(7) + 'teste';

        expect(requestRawPath(buildEvent(dirty))).toBe('/api/fichas/teste');
    });

    it('limita o caminho cru a 512 caracteres', () => {
        const long = `/${'a'.repeat(600)}`;
        const raw = requestRawPath(buildEvent(long));

        expect(raw).toHaveLength(512);
    });

    it('devolve null para caminho vazio ou ausente', () => {
        expect(requestRawPath(buildEvent(''))).toBeNull();
        expect(requestRawPath(buildEvent('?só-query=1'))).toBeNull();
        expect(requestRawPath(buildEvent(undefined))).toBeNull();
    });

    it('inclui o caminho cru no contexto da requisição', () => {
        const context = createRequestLogContext(buildEvent('/.env', '/**'), 'req-1');

        expect(context).toMatchObject({
            request_id: 'req-1',
            method: 'GET',
            route: '/**',
            raw_path: '/.env',
            ip: null,
            user_id: null
        });
    });
});
