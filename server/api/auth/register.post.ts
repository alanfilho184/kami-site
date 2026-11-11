import type { H3Event } from 'h3';
import type { AuthErrorResponse, AuthResponse, AuthUser } from '~~/shared/types/auth';
import { registerSchema } from '../../schemas/auth';
import {
    EmailAlreadyRegisteredError,
    UsernameAlreadyTakenError,
    registrationService
} from '../../services/registration.service';
import { sessionService } from '../../services/session.service';
import { logger } from '../../logs';
import { consumeRegisterAttempt, consumeRegisterIp, resetRegisterEmail } from '../../utils/rate-limit';
import { getClientIp, getUserAgent } from '../../utils/request-metadata';
import { assertSameOrigin } from '../../utils/request-origin';
import { readSessionToken, setSessionCookie } from '../../utils/session-cookie';

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
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
        const ipRate = consumeRegisterIp(ip);

        if (!ipRate.allowed) {
            return tooManyAttempts(event, ipRate.retryAfterSeconds);
        }

        setResponseStatus(event, 400);
        return { message: 'Confira os dados e tente novamente.' };
    }

    const { username, email, password } = parsed.data;
    const rate = consumeRegisterAttempt(ip, email);

    if (!rate.allowed) {
        return tooManyAttempts(event, rate.retryAfterSeconds);
    }

    let user: AuthUser;

    try {
        user = await registrationService.register(username, email, password);
    } catch (error) {
        if (error instanceof UsernameAlreadyTakenError) {
            resetRegisterEmail(email);
            log.warn('Nome de usuário já cadastrado', {
                event: 'auth.register.failed',
                error_code: 'username_taken',
                auth_method: 'password'
            });
            setResponseStatus(event, 409);
            return { message: 'Este nome de usuário já está em uso. Escolha outro.' };
        }

        if (error instanceof EmailAlreadyRegisteredError) {
            log.warn('E-mail já cadastrado', {
                event: 'auth.register.failed',
                error_code: 'email_registered',
                auth_method: 'password'
            });
            setResponseStatus(event, 409);
            return { message: 'Este e-mail já está cadastrado. Tente entrar.' };
        }

        resetRegisterEmail(email);
        log.error('Falha ao criar conta', {
            event: 'auth.register.failed',
            error_code: 'register_unavailable',
            auth_method: 'password',
            error
        });
        setResponseStatus(event, 503);
        return { message: unavailableMessage };
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
        resetRegisterEmail(email);
        log.error('Falha ao criar sessão após cadastro', {
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

    log.info('Cadastro realizado', { event: 'auth.register', user_id: user.id, auth_method: 'password' });
    setResponseStatus(event, 201);

    return { user };
});
