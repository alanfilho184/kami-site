import { hash } from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import {
    DUMMY_PASSWORD_HASH,
    createAuthService,
    isBcryptHash,
    type AuthUserRow
} from '../../server/services/auth.service';

function createRow(overrides: Partial<AuthUserRow> = {}): AuthUserRow {
    return {
        id: 42,
        username: 'lyra',
        email: 'lyra@example.com',
        password: null,
        ...overrides
    };
}

describe('serviço de autenticação', () => {
    it('reconhece hashes bcrypt dos formatos usados pelo bot', () => {
        expect(isBcryptHash('$2a$12$abc')).toBe(true);
        expect(isBcryptHash('$2b$12$abc')).toBe(true);
        expect(isBcryptHash('$2y$12$abc')).toBe(true);
        expect(isBcryptHash('senha-em-texto')).toBe(false);
        expect(isBcryptHash('')).toBe(false);
    });

    it('autentica a senha correta e atualiza o último uso', async () => {
        const passwordHash = await hash('senha-correta', 4);
        const markActive = vi.fn().mockResolvedValue(undefined);
        const service = createAuthService({
            findUser: vi.fn().mockResolvedValue(createRow({ password: passwordHash })),
            markActive
        });

        const user = await service.authenticate('lyra@example.com', 'senha-correta');

        expect(user).toEqual({ id: 42, username: 'lyra', email: 'lyra@example.com' });
        expect(markActive).toHaveBeenCalledWith(42);
    });

    it('recusa a senha errada sem atualizar o último uso', async () => {
        const passwordHash = await hash('senha-correta', 4);
        const markActive = vi.fn().mockResolvedValue(undefined);
        const service = createAuthService({
            findUser: vi.fn().mockResolvedValue(createRow({ password: passwordHash })),
            markActive
        });

        const user = await service.authenticate('lyra@example.com', 'senha-errada');

        expect(user).toBeNull();
        expect(markActive).not.toHaveBeenCalled();
    });

    it('faz uma comparação descartável quando o e-mail não existe', async () => {
        const compare = vi.fn().mockResolvedValue(false);
        const service = createAuthService({
            findUser: vi.fn().mockResolvedValue(null),
            compare,
            markActive: vi.fn()
        });

        const user = await service.authenticate('ninguem@example.com', 'qualquer-senha');

        expect(user).toBeNull();
        expect(compare).toHaveBeenCalledWith('qualquer-senha', DUMMY_PASSWORD_HASH);
    });

    it('trata conta sem senha como credencial inválida', async () => {
        const compare = vi.fn().mockResolvedValue(false);
        const service = createAuthService({
            findUser: vi.fn().mockResolvedValue(createRow({ password: null })),
            compare,
            markActive: vi.fn()
        });

        const user = await service.authenticate('lyra@example.com', 'qualquer-senha');

        expect(user).toBeNull();
        expect(compare).toHaveBeenCalledWith('qualquer-senha', DUMMY_PASSWORD_HASH);
    });

    it('trata senha em formato legado como credencial inválida', async () => {
        const compare = vi.fn().mockResolvedValue(false);
        const service = createAuthService({
            findUser: vi.fn().mockResolvedValue(createRow({ password: 'texto-puro' })),
            compare,
            markActive: vi.fn()
        });

        const user = await service.authenticate('lyra@example.com', 'texto-puro');

        expect(user).toBeNull();
        expect(compare).toHaveBeenCalledWith('texto-puro', DUMMY_PASSWORD_HASH);
    });

    it('não falha o login se a atualização do último uso falhar', async () => {
        const passwordHash = await hash('senha-correta', 4);
        const warn = vi.fn();
        const service = createAuthService({
            findUser: vi.fn().mockResolvedValue(createRow({ password: passwordHash })),
            markActive: vi.fn().mockRejectedValue(new Error('banco fora')),
            warn
        });

        const user = await service.authenticate('lyra@example.com', 'senha-correta');

        expect(user).not.toBeNull();
        expect(warn).toHaveBeenCalled();
    });
});
