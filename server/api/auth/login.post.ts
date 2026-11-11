import type { H3Event } from 'h3';
import type { AuthErrorResponse, AuthResponse, AuthUser } from '~~/shared/types/auth';
import { loginSchema } from '../../schemas/auth';
import { authService } from '../../services/auth.service';
import { sessionService } from '../../services/session.service';
import { logger } from '../../logs';
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

    const log = logger.forRequest(event);

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
        log.error('Falha ao autenticar login', {
            event: 'auth.login.failed',
            error_code: 'auth_unavailable',
            auth_method: 'password',
            error
        });
        setResponseStatus(event, 503);
        return { message: unavailableMessage };
    }

    if (!user) {
        log.warn('Tentativa de login recusada', {
            event: 'auth.login.failed',
            error_code: 'invalid_credentials',
            auth_method: 'password'
        });
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
        log.error('Falha ao criar sessão de login', {
            event: 'auth.session.create_failed',
            error_code: 'session_unavailable',
            auth_method: 'password',
            error
        });
        setResponseStatus(event, 503);
        return { message: unavailableMessage };
    }

    try {
        await sessionService.cleanup();
    } catch (error) {
        log.warn('Falha ao limpar sessões expiradas', { event: 'auth.sessions.cleanup_failed', error });
    }

    resetLoginEmail(email);
    log.info('Login realizado', { event: 'auth.login', user_id: user.id, auth_method: 'password' });

    return { user };
});
