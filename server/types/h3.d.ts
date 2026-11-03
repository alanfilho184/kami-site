import type { AuthUser } from '~~/shared/types/auth';

declare module 'h3' {
    interface H3EventContext {
        auth?: {
            user: AuthUser;
            tokenHash: string;
        };
    }
}

export {};
