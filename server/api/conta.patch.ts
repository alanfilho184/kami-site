import type { H3Event } from 'h3';
import type { AccountResponse } from '~~/shared/types/panel';
import { updateAccountSchema } from '../schemas/account';
import { accountService } from '../services/account.service';
import { UsernameAlreadyTakenError } from '../services/user-errors';
import { getAuthUser } from '../utils/auth-context';
import { logger } from '../logs';
import { assertSameOrigin } from '../utils/request-origin';

export default defineEventHandler(async (event: H3Event): Promise<AccountResponse | { message: string }> => {
    assertSameOrigin(event);

    const user = getAuthUser(event);

    if (!user) {
        setResponseStatus(event, 401);
        return { message: 'Não autenticado.' };
    }

    let body: unknown = null;

    try {
        body = await readBody(event);
    } catch {
        body = null;
    }

    const parsed = updateAccountSchema.safeParse(body);

    if (!parsed.success) {
        setResponseStatus(event, 400);
        return { message: 'Confira o nome de usuário: 3 a 32 caracteres, apenas letras, números e underline.' };
    }

    try {
        const account = await accountService.changeUsername(user.id, parsed.data.username);
        return { account };
    } catch (error) {
        if (error instanceof UsernameAlreadyTakenError) {
            setResponseStatus(event, 409);
            return { message: 'Este nome de usuário já está em uso. Escolha outro.' };
        }

        logger.error('Falha ao atualizar a conta', { event: 'account.update_failed', error });
        setResponseStatus(event, 503);
        return { message: 'Não foi possível atualizar a conta. Tente novamente em instantes.' };
    }
});
