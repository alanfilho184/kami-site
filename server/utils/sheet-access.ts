import { createHmac, timingSafeEqual } from 'node:crypto';
import type { H3Event } from 'h3';
import { getConfig } from './config';

export const SHEET_ACCESS_TTL_SECONDS = 60 * 60;

export function sheetAccessCookieName(sheetId: number): string {
    return `kami_ficha_${sheetId}`;
}

function sign(payload: string): string {
    return createHmac('sha256', getConfig().sessionSecret).update(payload).digest('base64url');
}

export function createSheetAccessToken(sheetId: number, now = Date.now()): string {
    const expiresAt = now + SHEET_ACCESS_TTL_SECONDS * 1000;
    const payload = `${sheetId}.${expiresAt}`;

    return `${payload}.${sign(payload)}`;
}

export function verifySheetAccessToken(token: string, sheetId: number, now = Date.now()): boolean {
    const [rawId, rawExpiresAt, signature] = token.split('.');

    if (!rawId || !rawExpiresAt || !signature) {
        return false;
    }

    if (Number(rawId) !== sheetId) {
        return false;
    }

    const expiresAt = Number(rawExpiresAt);

    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
        return false;
    }

    const expected = sign(`${rawId}.${rawExpiresAt}`);

    if (expected.length !== signature.length) {
        return false;
    }

    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function hasSheetAccess(event: H3Event, sheetId: number): boolean {
    const token = getCookie(event, sheetAccessCookieName(sheetId));

    return typeof token === 'string' && token.length > 0 && verifySheetAccessToken(token, sheetId);
}

export function setSheetAccessCookie(event: H3Event, sheetId: number): void {
    setCookie(event, sheetAccessCookieName(sheetId), createSheetAccessToken(sheetId), {
        httpOnly: true,
        secure: getConfig().production,
        sameSite: 'lax',
        path: '/',
        maxAge: SHEET_ACCESS_TTL_SECONDS
    });
}
