import type { AuthUser } from '~~/shared/types/auth';
import type { RequestLogContext } from '~~/server/logs/types';

declare module 'h3' {
    interface H3EventContext {
        auth?: {
            user: AuthUser;
            tokenHash: string;
        };
        log?: RequestLogContext;
        securityNonce?: string;
    }
}

export {};
