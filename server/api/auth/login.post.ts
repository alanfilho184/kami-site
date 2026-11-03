import type { H3Event } from 'h3';
import type { AuthErrorResponse, AuthResponse, AuthUser } from '~~/shared/types/auth';
import { loginSchema } from '../../schemas/auth';
import { authService } from '../../services/auth.service';
import { sessionService } from '../../services/session.service';
import { logger } from '../../utils/logger';
import { consumeLoginAttempt, consumeLoginIp, resetLoginEmail } from '../../utils/rate-limit';
import { getClientIp, getUserAgent } from '../../utils/request-metadata';
import { assertSameOrigin } from '../../utils/request-origin';
import { readSessionToken, setSessionCookie } from '../../utils/session-cookie';

const invalidCredentialsMessage = 'E-mail ou senha inválidos.';
const unavailableMessage = 'Serviço indisponível. Tente novamente em instantes.';

function tooManyAttempts(event: H3Event, retryAfterSeconds: number): AuthErrorResponse {
    setHeader(event, 'retry-after', retryAfterSeconds);
    setResponseStatus(event, 429);

    return { message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' };
}

export default defineEventHandler(async (event: H3Event): Promise<AuthResponse | AuthErrorResponse> => {
    assertSameOrigin(event);

    let body: unknown = null;

    try {
        body = await readBody(event);
    } catch {
        body = null;
    }

    const ip = getClientIp(event);
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
        const ipRate = consumeLoginIp(ip);

        if (!ipRate.allowed) {
            return tooManyAttempts(event, ipRate.retryAfterSeconds);
        }

        setResponseStatus(event, 400);
        return { message: 'Informe e-mail e senha válidos.' };
    }

    const { email, password } = parsed.data;
    const rate = consumeLoginAttempt(ip, email);

    if (!rate.allowed) {
        return tooManyAttempts(event, rate.retryAfterSeconds);
    }

    let user: AuthUser | null = null;

    try {
        user = await authService.authenticate(email, password);
    } catch (error) {
        logger.error('Falha ao autenticar login', { error });
        setResponseStatus(event, 503);
        return { message: unavailableMessage };
    }

    if (!user) {
        logger.warn('Tentativa de login recusada');
        setResponseStatus(event, 401);
        return { message: invalidCredentialsMessage };
    }

    try {
        const existingToken = readSessionToken(event);

        if (existingToken) {
            await sessionService.destroy(existingToken);
        }

        const session = await sessionService.create(user.id, {
            ip: ip === 'unknown' ? null : ip,
            userAgent: getUserAgent(event)
        });

        setSessionCookie(event, session.token, session.expiresAt);
    } catch (error) {
        logger.error('Falha ao criar sessão de login', { error });
        setResponseStatus(event, 503);
        return { message: unavailableMessage };
    }

    try {
        await sessionService.cleanup();
    } catch (error) {
        logger.warn('Falha ao limpar sessões expiradas', { error });
    }

    resetLoginEmail(email);
    logger.info('Login realizado', { user_id: user.id });

    return { user };
});
