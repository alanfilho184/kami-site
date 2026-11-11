import type { H3Event } from 'h3';
import type { AuthErrorResponse } from '~~/shared/types/auth';
import { sessionService } from '../../services/session.service';
import { logger } from '../../logs';
import { assertSameOrigin } from '../../utils/request-origin';
import { clearSessionCookie, readSessionToken } from '../../utils/session-cookie';

export default defineEventHandler(async (event: H3Event): Promise<AuthErrorResponse | null> => {
    assertSameOrigin(event);

    const log = logger.forRequest(event);
    const token = readSessionToken(event);

    if (token) {
        try {
            await sessionService.destroy(token);
        } catch (error) {
            log.error('Falha ao encerrar sessão', { event: 'auth.logout.failed', error });
            setResponseStatus(event, 503);
            return { message: 'Serviço indisponível. Tente novamente em instantes.' };
        }
    }

    clearSessionCookie(event);
    setResponseStatus(event, 204);
    log.info('Sessão encerrada', { event: 'auth.logout', auth_method: 'session' });

    return null;
});
