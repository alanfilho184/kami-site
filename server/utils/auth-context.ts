import type { H3Event } from 'h3';
import type { AuthUser } from '~~/shared/types/auth';

export function getAuthUser(event: H3Event): AuthUser | null {
    return event.context.auth?.user ?? null;
}
