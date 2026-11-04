import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearConfigCache } from '../../server/utils/config';
import {
    createSheetAccessToken,
    SHEET_ACCESS_TTL_SECONDS,
    sheetAccessCookieName,
    verifySheetAccessToken
} from '../../server/utils/sheet-access';

const now = Date.parse('2026-11-04T12:00:00Z');

beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://kami_app:segredo@127.0.0.1:5432/kami_test';
    process.env.SESSION_SECRET = 's'.repeat(48);
    clearConfigCache();
});

afterEach(() => {
    clearConfigCache();
});

describe('token de acesso à ficha pública', () => {
    it('usa um cookie por ficha', () => {
        expect(sheetAccessCookieName(7)).toBe('kami_ficha_7');
        expect(sheetAccessCookieName(8)).not.toBe(sheetAccessCookieName(7));
    });

    it('valida o token recém-criado para a mesma ficha', () => {
        const token = createSheetAccessToken(7, now);

        expect(verifySheetAccessToken(token, 7, now + 1000)).toBe(true);
    });

    it('expira depois de uma hora', () => {
        const token = createSheetAccessToken(7, now);

        expect(verifySheetAccessToken(token, 7, now + SHEET_ACCESS_TTL_SECONDS * 1000 - 1)).toBe(true);
        expect(verifySheetAccessToken(token, 7, now + SHEET_ACCESS_TTL_SECONDS * 1000 + 1)).toBe(false);
    });

    it('recusa o token de outra ficha', () => {
        const token = createSheetAccessToken(7, now);

        expect(verifySheetAccessToken(token, 8, now + 1000)).toBe(false);
    });

    it('recusa token adulterado ou malformado', () => {
        const token = createSheetAccessToken(7, now);
        const [id, expiresAt] = token.split('.');

        expect(verifySheetAccessToken(`${id}.${expiresAt}.assinatura-falsa`, 7, now + 1000)).toBe(false);
        expect(verifySheetAccessToken(`${id}x.${expiresAt}.${token.split('.')[2]}`, 7, now + 1000)).toBe(false);
        expect(verifySheetAccessToken('sem-formato', 7, now + 1000)).toBe(false);
        expect(verifySheetAccessToken('', 7, now + 1000)).toBe(false);
    });

    it('recusa token cuja expiração não é numérica', () => {
        const token = createSheetAccessToken(7, now);
        const parts = token.split('.');

        expect(verifySheetAccessToken(`7.abc.${parts[2]}`, 7, now)).toBe(false);
    });
});
