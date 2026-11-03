import type { H3Event } from 'h3';
import type { AuthErrorResponse } from '~~/shared/types/auth';
import { sessionService } from '../../services/session.service';
import { logger } from '../../utils/logger';
import { assertSameOrigin } from '../../utils/request-origin';
import { clearSessionCookie, readSessionToken } from '../../utils/session-cookie';

export default defineEventHandler(async (event: H3Event): Promise<AuthErrorResponse | null> => {
    assertSameOrigin(event);

    const token = readSessionToken(event);

    if (token) {
        try {
            await sessionService.destroy(token);
        } catch (error) {
            logger.error('Falha ao encerrar sessão', { error });
            setResponseStatus(event, 503);
            return { message: 'Serviço indisponível. Tente novamente em instantes.' };
        }
    }

    clearSessionCookie(event);
    setResponseStatus(event, 204);

    return null;
});
