import type { H3Event } from 'h3';
import type { PasswordChangeResponse } from '~~/shared/types/panel';
import { changePasswordSchema } from '../../schemas/account';
import { accountService } from '../../services/account.service';
import { InvalidCurrentPasswordError } from '../../services/user-errors';
import { getAuthUser } from '../../utils/auth-context';
import { logger } from '../../utils/logger';
import { consumePasswordChange, resetPasswordChange } from '../../utils/rate-limit';
import { assertSameOrigin } from '../../utils/request-origin';

export default defineEventHandler(async (event: H3Event): Promise<PasswordChangeResponse | { message: string }> => {
    assertSameOrigin(event);

    const user = getAuthUser(event);

    if (!user) {
        setResponseStatus(event, 401);
        return { message: 'Não autenticado.' };
    }

    const rate = consumePasswordChange(user.id);

    if (!rate.allowed) {
        setHeader(event, 'retry-after', rate.retryAfterSeconds);
        setResponseStatus(event, 429);
        return { message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' };
    }

    let body: unknown = null;

    try {
        body = await readBody(event);
    } catch {
        body = null;
    }

    const parsed = changePasswordSchema.safeParse(body);

    if (!parsed.success) {
        setResponseStatus(event, 400);
        return { message: 'Confira a senha atual e a nova senha (mínimo de 8 caracteres).' };
    }

    try {
        await accountService.changePassword(user.id, parsed.data.currentPassword, parsed.data.newPassword);
        resetPasswordChange(user.id);
        logger.info('Senha alterada', { user_id: user.id });
        return { message: 'Senha alterada.' };
    } catch (error) {
        if (error instanceof InvalidCurrentPasswordError) {
            setResponseStatus(event, 400);
            return { message: 'Senha atual incorreta.' };
        }

        logger.error('Falha ao alterar a senha', { error });
        setResponseStatus(event, 503);
        return { message: 'Não foi possível alterar a senha. Tente novamente em instantes.' };
    }
});
