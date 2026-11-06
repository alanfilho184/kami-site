import { describe, expect, it, vi } from 'vitest';
import {
    EmailAlreadyRegisteredError,
    UsernameAlreadyTakenError,
    createRegistrationService
} from '../../server/services/registration.service';

function createService() {
    const findByEmail = vi.fn().mockResolvedValue(null);
    const findByUsername = vi.fn().mockResolvedValue(null);
    const insertUser = vi.fn().mockResolvedValue({
        id: 42,
        username: 'lyra',
        email: 'lyra@example.com'
    });
    const hash = vi.fn().mockResolvedValue('hash-da-senha');
    const service = createRegistrationService({ findByEmail, findByUsername, insertUser, hash });

    return { service, findByEmail, findByUsername, insertUser, hash };
}

describe('serviço de cadastro', () => {
    it('cria a conta com username, senha em hash e devolve o usuário', async () => {
        const { service, insertUser, hash } = createService();

        const user = await service.register('lyra', 'lyra@example.com', 'senha-segura');

        expect(hash).toHaveBeenCalledWith('senha-segura');
        expect(insertUser).toHaveBeenCalledWith('lyra', 'lyra@example.com', 'hash-da-senha');
        expect(user).toEqual({ id: 42, username: 'lyra', email: 'lyra@example.com', isPremium: false });
    });

    it('recusa username já cadastrado antes de calcular o hash', async () => {
        const { service, findByUsername, insertUser, hash } = createService();

        findByUsername.mockResolvedValue({ id: 1 });

        await expect(service.register('lyra', 'lyra@example.com', 'senha-segura')).rejects.toBeInstanceOf(
            UsernameAlreadyTakenError
        );
        expect(hash).not.toHaveBeenCalled();
        expect(insertUser).not.toHaveBeenCalled();
    });

    it('recusa e-mail já cadastrado antes de calcular o hash', async () => {
        const { service, findByEmail, insertUser, hash } = createService();

        findByEmail.mockResolvedValue({ id: 1 });

        await expect(service.register('lyra', 'lyra@example.com', 'senha-segura')).rejects.toBeInstanceOf(
            EmailAlreadyRegisteredError
        );
        expect(hash).not.toHaveBeenCalled();
        expect(insertUser).not.toHaveBeenCalled();
    });

    it('converte a violação de username do banco em username ocupado', async () => {
        const { service, insertUser } = createService();

        insertUser.mockRejectedValue({ code: '23505', constraint: 'users_username_key' });

        await expect(service.register('lyra', 'lyra@example.com', 'senha-segura')).rejects.toBeInstanceOf(
            UsernameAlreadyTakenError
        );
    });

    it('converte a violação de e-mail do banco em e-mail cadastrado', async () => {
        const { service, insertUser } = createService();

        insertUser.mockRejectedValue({ code: '23505', constraint: 'users_email_key' });

        await expect(service.register('lyra', 'lyra@example.com', 'senha-segura')).rejects.toBeInstanceOf(
            EmailAlreadyRegisteredError
        );
    });

    it('propaga outros erros de banco', async () => {
        const { service, insertUser } = createService();
        const error = new Error('banco fora');

        insertUser.mockRejectedValue(error);

        await expect(service.register('lyra', 'lyra@example.com', 'senha-segura')).rejects.toBe(error);
    });

    it('propaga falha ao calcular o hash sem tentar inserir', async () => {
        const { service, insertUser, hash } = createService();
        const error = new Error('hash falhou');

        hash.mockRejectedValue(error);

        await expect(service.register('lyra', 'lyra@example.com', 'senha-segura')).rejects.toBe(error);
        expect(insertUser).not.toHaveBeenCalled();
    });
});
