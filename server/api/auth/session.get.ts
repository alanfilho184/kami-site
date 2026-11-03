import type { H3Event } from 'h3';
import type { AuthErrorResponse, AuthResponse } from '~~/shared/types/auth';

export default defineEventHandler((event: H3Event): AuthResponse | AuthErrorResponse => {
    const auth = event.context.auth;

    if (!auth) {
        setResponseStatus(event, 401);
        return { message: 'Não autenticado.' };
    }

    return { user: auth.user };
});
