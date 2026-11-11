import { compare as compareBcrypt } from 'bcryptjs';
import { timingSafeEqual } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import SQL from 'sql-template-strings';
import { queryOne } from '../utils/database';
import type { SheetRow } from './sheet.service';

/**
 * Busca apenas fichas marcadas como públicas. Nome duplicado escolhe a mais
 * recente; fichas privadas nunca são retornadas (o chamador responde 404).
 */
export async function findPublicSheet(
    userId: number,
    sheetName: string,
    preferredId: number | null = null
): Promise<SheetRow | null> {
    return queryOne<SheetRow>(SQL`
        SELECT
            s.id,
            s.user_id,
            s.sheet_name,
            s.sheet_password,
            s.is_public,
            s.legacy,
            s.attributes,
            s.sheet_layout,
            date_trunc('milliseconds', s.last_use) AS last_use,
            s.created_at,
            u.username AS creator_name,
            EXISTS (SELECT 1 FROM irt_sheets i WHERE i.sheet_id = s.id) AS is_live
        FROM sheets s
        LEFT JOIN users u ON u.id = s.user_id
        WHERE s.user_id = ${userId}
          AND s.sheet_name = ${sheetName}
          AND s.is_public = TRUE
          AND (${preferredId}::int IS NULL OR s.id = ${preferredId})
        ORDER BY s.id DESC
        LIMIT 1
    `);
}

export function sheetRequiresPassword(row: SheetRow): boolean {
    return Boolean(row.sheet_password && row.sheet_password.length > 0);
}

export interface PublicSheetAccessRow extends QueryResultRow {
    id: number;
    sheet_password: string | null;
    is_public: boolean;
}

export async function findPublicSheetAccessById(sheetId: number): Promise<PublicSheetAccessRow | null> {
    return queryOne<PublicSheetAccessRow>(SQL`
        SELECT id, sheet_password, is_public
        FROM sheets
        WHERE id = ${sheetId}
          AND is_public = TRUE
        LIMIT 1
    `);
}

/**
 * Aceita hashes bcrypt novos e senhas legadas em texto puro. O rehash fica
 * pendente até o bot autorizar a escrita no formato novo.
 */
export async function verifySheetPassword(stored: string | null, candidate: string): Promise<boolean> {
    if (!stored) {
        return true;
    }

    if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
        return compareBcrypt(candidate, stored);
    }

    const storedBuffer = Buffer.from(stored);
    const candidateBuffer = Buffer.from(candidate);

    if (storedBuffer.length !== candidateBuffer.length) {
        return false;
    }

    return timingSafeEqual(storedBuffer, candidateBuffer);
}
