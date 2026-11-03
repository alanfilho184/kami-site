import { createHash } from 'node:crypto';

export interface RateLimitResult {
    allowed: boolean;
    retryAfterSeconds: number;
}

export interface RateLimiter {
    consume(key: string): RateLimitResult;
    reset(key: string): void;
}

export interface RateLimiterOptions {
    limit: number;
    windowMs: number;
    maxEntries?: number;
    now?: () => number;
}

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
    const entries = new Map<string, RateLimitEntry>();
    const now = options.now ?? (() => Date.now());
    const maxEntries = options.maxEntries ?? 10_000;

    function cleanup(instant: number): void {
        for (const [key, entry] of entries) {
            if (entry.resetAt <= instant) {
                entries.delete(key);
            }
        }
    }

    function evictOldest(): void {
        while (entries.size >= maxEntries) {
            const oldest = entries.keys().next().value;

            if (oldest === undefined) {
                return;
            }

            entries.delete(oldest);
        }
    }

    function consume(key: string): RateLimitResult {
        const instant = now();
        cleanup(instant);

        const current = entries.get(key);

        if (!current || current.resetAt <= instant) {
            evictOldest();
            entries.set(key, {
                count: 1,
                resetAt: instant + options.windowMs
            });

            return { allowed: true, retryAfterSeconds: 0 };
        }

        if (current.count >= options.limit) {
            return {
                allowed: false,
                retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - instant) / 1000))
            };
        }

        current.count += 1;
        return { allowed: true, retryAfterSeconds: 0 };
    }

    function reset(key: string): void {
        entries.delete(key);
    }

    return { consume, reset };
}

export const LOGIN_IP_LIMIT = 10;
export const LOGIN_EMAIL_LIMIT = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export const loginIpLimiter = createRateLimiter({
    limit: LOGIN_IP_LIMIT,
    windowMs: LOGIN_WINDOW_MS
});

export const loginEmailLimiter = createRateLimiter({
    limit: LOGIN_EMAIL_LIMIT,
    windowMs: LOGIN_WINDOW_MS
});

export function hashRateLimitKey(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

export function consumeLoginIp(ip: string): RateLimitResult {
    return loginIpLimiter.consume(`ip:${ip}`);
}

export function consumeLoginAttempt(ip: string, email: string): RateLimitResult {
    const ipResult = loginIpLimiter.consume(`ip:${ip}`);

    if (!ipResult.allowed) {
        return ipResult;
    }

    const emailResult = loginEmailLimiter.consume(`email:${hashRateLimitKey(email)}`);

    if (!emailResult.allowed) {
        return emailResult;
    }

    return { allowed: true, retryAfterSeconds: 0 };
}

export function resetLoginEmail(email: string): void {
    loginEmailLimiter.reset(`email:${hashRateLimitKey(email)}`);
}

export const REGISTER_IP_LIMIT = 5;
export const REGISTER_EMAIL_LIMIT = 1;
export const REGISTER_IP_WINDOW_MS = 60 * 60 * 1000;
export const REGISTER_EMAIL_WINDOW_MS = 10 * 60 * 1000;

export const registerIpLimiter = createRateLimiter({
    limit: REGISTER_IP_LIMIT,
    windowMs: REGISTER_IP_WINDOW_MS
});

export const registerEmailLimiter = createRateLimiter({
    limit: REGISTER_EMAIL_LIMIT,
    windowMs: REGISTER_EMAIL_WINDOW_MS
});

export function consumeRegisterIp(ip: string): RateLimitResult {
    return registerIpLimiter.consume(`ip:${ip}`);
}

export function consumeRegisterAttempt(ip: string, email: string): RateLimitResult {
    const ipResult = registerIpLimiter.consume(`ip:${ip}`);

    if (!ipResult.allowed) {
        return ipResult;
    }

    const emailResult = registerEmailLimiter.consume(`email:${hashRateLimitKey(email)}`);

    if (!emailResult.allowed) {
        return emailResult;
    }

    return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRegisterEmail(email: string): void {
    registerEmailLimiter.reset(`email:${hashRateLimitKey(email)}`);
}

export const PASSWORD_CHANGE_LIMIT = 5;
export const PASSWORD_CHANGE_WINDOW_MS = 15 * 60 * 1000;

export const passwordChangeLimiter = createRateLimiter({
    limit: PASSWORD_CHANGE_LIMIT,
    windowMs: PASSWORD_CHANGE_WINDOW_MS
});

export function consumePasswordChange(userId: number): RateLimitResult {
    return passwordChangeLimiter.consume(`user:${userId}`);
}

export function resetPasswordChange(userId: number): void {
    passwordChangeLimiter.reset(`user:${userId}`);
}
