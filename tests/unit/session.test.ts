import { describe, expect, it, vi } from 'vitest';
import type { Query } from '../../server/utils/database';
import {
    SESSION_REFRESH_MS,
    SESSION_TTL_MS,
    createSessionService,
    hashSessionToken,
    type SessionRow
} from '../../server/services/session.service';

const now = Date.UTC(2026, 9, 31, 12, 0, 0);
const token = 'token-de-teste';

function createRow(overrides: Partial<SessionRow> = {}): SessionRow {
    return {
        session_id: 1,
        last_seen_at: new Date(now - 1000),
        expires_at: new Date(now + SESSION_TTL_MS),
        user_id: 42,
        username: 'lyra',
        email: 'lyra@example.com',
        is_premium: false,
        ...overrides
    };
}

function createService(row: SessionRow | null = null) {
    const execute = vi.fn().mockResolvedValue([]);
    const findRow = vi.fn().mockResolvedValue(row);
    const service = createSessionService({
        query: execute,
        queryOne: findRow,
        now: () => now,
        generateToken: () => token
    });

    return { service, execute, findRow };
}

describe('serviço de sessão', () => {
    it('gera um hash SHA-256 hexadecimal de 64 caracteres', () => {
        expect(hashSessionToken(token)).toMatch(/^[a-f0-9]{64}$/);
        expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    });

    it('cria a sessão com o hash do token, nunca com o token puro', async () => {
        const { service, execute } = createService();

        const created = await service.create(42, {
            ip: '127.0.0.1',
            userAgent: 'vitest'
        });

        const statement = execute.mock.calls[0]?.[0] as Query;
        const tokenHash = hashSessionToken(token);

        expect(created).toEqual({
            token,
            expiresAt: new Date(now + SESSION_TTL_MS)
        });
        expect(statement.values).toContain(tokenHash);
        expect(statement.values).not.toContain(token);
    });

    it('devolve o usuário de uma sessão válida sem renovar antes de uma hora', async () => {
        const { service, execute } = createService(createRow());

        const session = await service.find(token);

        expect(session?.user).toEqual({
            id: 42,
            username: 'lyra',
            email: 'lyra@example.com',
            isPremium: false
        });
        expect(session?.tokenHash).toBe(hashSessionToken(token));
        expect(execute).not.toHaveBeenCalled();
    });

    it('devolve o estado premium atual da conta na sessão', async () => {
        const { service } = createService(createRow({ is_premium: true }));

        const session = await service.find(token);

        expect(session?.user.isPremium).toBe(true);
    });

    it('renova last_seen_at depois de uma hora', async () => {
        const { service, execute } = createService(createRow({ last_seen_at: new Date(now - SESSION_REFRESH_MS - 1) }));

        await service.find(token);

        const statement = execute.mock.calls[0]?.[0] as Query;

        expect(statement.text).toContain('UPDATE site_sessions');
        expect(statement.text).toContain('last_seen_at');
    });

    it('remove a sessão expirada e devolve nulo', async () => {
        const { service, execute } = createService(createRow({ expires_at: new Date(now - 1) }));

        const session = await service.find(token);

        const statement = execute.mock.calls[0]?.[0] as Query;

        expect(session).toBeNull();
        expect(statement.text).toContain('DELETE FROM site_sessions');
    });

    it('devolve nulo quando o token não existe', async () => {
        const { service } = createService(null);

        await expect(service.find(token)).resolves.toBeNull();
    });

    it('remove a sessão no logout', async () => {
        const { service, execute } = createService();

        await service.destroy(token);

        const statement = execute.mock.calls[0]?.[0] as Query;

        expect(statement.text).toContain('DELETE FROM site_sessions');
        expect(statement.values).toContain(hashSessionToken(token));
    });

    it('limpa as sessões expiradas', async () => {
        const { service, execute } = createService();

        await service.cleanup();

        const statement = execute.mock.calls[0]?.[0] as Query;

        expect(statement.text).toContain('DELETE FROM site_sessions');
        expect(statement.text).toContain('expires_at');
    });
});
