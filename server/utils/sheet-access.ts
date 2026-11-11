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

function passwordFingerprint(sheetId: number, passwordHash: string | null): string {
    return createHmac('sha256', getConfig().sessionSecret)
        .update(`${sheetId}.${passwordHash ?? ''}`)
        .digest('base64url')
        .slice(0, 16);
}

export function createSheetAccessToken(sheetId: number, now = Date.now(), passwordHash: string | null = null): string {
    const expiresAt = now + SHEET_ACCESS_TTL_SECONDS * 1000;
    const fingerprint = passwordFingerprint(sheetId, passwordHash);
    const payload = `${sheetId}.${expiresAt}.${fingerprint}`;

    return `${payload}.${sign(payload)}`;
}

export function verifySheetAccessToken(
    token: string,
    sheetId: number,
    now = Date.now(),
    passwordHash: string | null = null
): boolean {
    const [rawId, rawExpiresAt, fingerprint, signature] = token.split('.');

    if (!rawId || !rawExpiresAt || !fingerprint || !signature) {
        return false;
    }

    if (Number(rawId) !== sheetId) {
        return false;
    }

    if (fingerprint !== passwordFingerprint(sheetId, passwordHash)) {
        return false;
    }

    const expiresAt = Number(rawExpiresAt);

    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
        return false;
    }

    const expected = sign(`${rawId}.${rawExpiresAt}.${fingerprint}`);

    if (expected.length !== signature.length) {
        return false;
    }

    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function hasSheetAccess(event: H3Event, sheetId: number, passwordHash: string | null): boolean {
    const token = getCookie(event, sheetAccessCookieName(sheetId));

    return (
        typeof token === 'string' &&
        token.length > 0 &&
        verifySheetAccessToken(token, sheetId, Date.now(), passwordHash)
    );
}

export function setSheetAccessCookie(event: H3Event, sheetId: number, passwordHash: string | null): void {
    setCookie(event, sheetAccessCookieName(sheetId), createSheetAccessToken(sheetId, Date.now(), passwordHash), {
        httpOnly: true,
        secure: getConfig().production,
        sameSite: 'lax',
        path: '/',
        maxAge: SHEET_ACCESS_TTL_SECONDS
    });
}
