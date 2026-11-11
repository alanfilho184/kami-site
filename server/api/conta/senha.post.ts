import type { H3Event } from 'h3';
import type { PasswordChangeResponse } from '~~/shared/types/panel';
import { changePasswordSchema } from '../../schemas/account';
import { accountService } from '../../services/account.service';
import { disconnectUserSessions } from '../../services/realtime.service';
import { sessionService } from '../../services/session.service';
import { InvalidCurrentPasswordError } from '../../services/user-errors';
import { getAuthUser } from '../../utils/auth-context';
import { logger } from '../../logs';
import { consumePasswordChange, resetPasswordChange } from '../../utils/rate-limit';
import { assertSameOrigin } from '../../utils/request-origin';

export default defineEventHandler(async (event: H3Event): Promise<PasswordChangeResponse | { message: string }> => {
    assertSameOrigin(event);

    const user = getAuthUser(event);

    if (!user) {
        setResponseStatus(event, 401);
        return { message: 'Não autenticado.' };
    }

    const log = logger.forRequest(event);
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

        const currentTokenHash = event.context.auth?.tokenHash;

        try {
            await sessionService.destroyForUser(user.id, currentTokenHash);
            const disconnected = await disconnectUserSessions(user.id, currentTokenHash);

            log.info('Outras sessões revogadas após troca de senha', {
                event: 'auth.sessions.revoked',
                user_id: user.id,
                disconnected
            });
        } catch (error) {
            log.warn('Falha ao revogar as outras sessões', {
                event: 'auth.sessions.revoke_failed',
                error,
                user_id: user.id
            });
        }

        log.info('Senha alterada', { event: 'auth.password.changed', user_id: user.id, auth_method: 'session' });
        return { message: 'Senha alterada.' };
    } catch (error) {
        if (error instanceof InvalidCurrentPasswordError) {
            log.warn('Senha atual incorreta', {
                event: 'auth.password.change_failed',
                error_code: 'invalid_current_password',
                auth_method: 'session'
            });
            setResponseStatus(event, 400);
            return { message: 'Senha atual incorreta.' };
        }

        log.error('Falha ao alterar a senha', {
            event: 'auth.password.change_failed',
            error_code: 'password_change_unavailable',
            auth_method: 'session',
            error
        });
        setResponseStatus(event, 503);
        return { message: 'Não foi possível alterar a senha. Tente novamente em instantes.' };
    }
});
