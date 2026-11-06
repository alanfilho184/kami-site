import { describe, expect, it, vi } from 'vitest';
import { createAccountService } from '../../server/services/account.service';
import type { AccountRow } from '../../server/services/panel.service';
import { InvalidCurrentPasswordError, UsernameAlreadyTakenError } from '../../server/services/user-errors';

function createAccountRow(overrides: Partial<AccountRow> = {}): AccountRow {
    return {
        id: 42,
        username: 'lyra',
        email: 'lyra@example.com',
        avatar: null,
        created_at: new Date('2026-10-01T12:00:00Z'),
        discord_id: null,
        is_premium: false,
        ...overrides
    };
}

function createService() {
    const findUsername = vi.fn().mockResolvedValue(null);
    const updateUsername = vi.fn().mockResolvedValue(createAccountRow({ username: 'lyra_nova' }));
    const findPassword = vi.fn().mockResolvedValue({ password: 'hash-atual' });
    const updatePassword = vi.fn().mockResolvedValue(undefined);
    const hash = vi.fn().mockResolvedValue('hash-nova');
    const compare = vi.fn().mockResolvedValue(true);
    const service = createAccountService({
        findUsername,
        updateUsername,
        findPassword,
        updatePassword,
        hash,
        compare
    });

    return { service, findUsername, updateUsername, findPassword, updatePassword, hash, compare };
}

describe('serviço de conta', () => {
    it('atualiza o username e devolve a conta', async () => {
        const { service, updateUsername } = createService();

        const account = await service.changeUsername(42, 'lyra_nova');

        expect(updateUsername).toHaveBeenCalledWith(42, 'lyra_nova');
        expect(account.username).toBe('lyra_nova');
    });

    it('recusa username já usado por outra conta', async () => {
        const { service, findUsername, updateUsername } = createService();
        findUsername.mockResolvedValue({ id: 7 });

        await expect(service.changeUsername(42, 'lyra')).rejects.toBeInstanceOf(UsernameAlreadyTakenError);
        expect(updateUsername).not.toHaveBeenCalled();
    });

    it('converte a violação de unicidade do banco em username ocupado', async () => {
        const { service, updateUsername } = createService();
        updateUsername.mockRejectedValue({ code: '23505' });

        await expect(service.changeUsername(42, 'lyra')).rejects.toBeInstanceOf(UsernameAlreadyTakenError);
    });

    it('troca a senha quando a senha atual confere', async () => {
        const { service, compare, hash, updatePassword } = createService();

        await service.changePassword(42, 'senha-atual', 'senha-nova');

        expect(compare).toHaveBeenCalledWith('senha-atual', 'hash-atual');
        expect(hash).toHaveBeenCalledWith('senha-nova');
        expect(updatePassword).toHaveBeenCalledWith(42, 'hash-nova');
    });

    it('recusa a troca quando a senha atual não confere', async () => {
        const { service, compare, hash, updatePassword } = createService();
        compare.mockResolvedValue(false);

        await expect(service.changePassword(42, 'errada', 'senha-nova')).rejects.toBeInstanceOf(
            InvalidCurrentPasswordError
        );
        expect(hash).not.toHaveBeenCalled();
        expect(updatePassword).not.toHaveBeenCalled();
    });

    it('recusa a troca quando a conta não tem senha', async () => {
        const { service, findPassword, updatePassword } = createService();
        findPassword.mockResolvedValue({ password: null });

        await expect(service.changePassword(42, 'atual', 'nova')).rejects.toBeInstanceOf(InvalidCurrentPasswordError);
        expect(updatePassword).not.toHaveBeenCalled();
    });
});
