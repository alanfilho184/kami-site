import type { H3Event } from 'h3';
import { SESSION_COOKIE_NAME } from '../services/session.service';
import { getConfig } from './config';

export function readSessionToken(event: H3Event): string | null {
    const token = getCookie(event, SESSION_COOKIE_NAME);

    if (typeof token !== 'string' || token.length === 0) {
        return null;
    }

    return token;
}

export function setSessionCookie(event: H3Event, token: string, expiresAt: Date): void {
    const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

    setCookie(event, SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: getConfig().production,
        sameSite: 'lax',
        path: '/',
        maxAge,
        expires: expiresAt
    });
}

export function clearSessionCookie(event: H3Event): void {
    deleteCookie(event, SESSION_COOKIE_NAME, {
        path: '/'
    });
}
