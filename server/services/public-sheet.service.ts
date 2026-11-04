import { compare as compareBcrypt } from 'bcryptjs';
import { timingSafeEqual } from 'node:crypto';
import SQL from 'sql-template-strings';
import { queryOne } from '../utils/database';
import type { SheetRow } from './sheet.service';

/**
 * Busca apenas fichas marcadas como públicas. Nome duplicado escolhe a mais
 * recente; fichas privadas nunca são retornadas (o chamador responde 404).
 */
export async function findPublicSheet(userId: number, sheetName: string): Promise<SheetRow | null> {
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
            EXISTS (SELECT 1 FROM irt_sheets i WHERE i.sheet_id = s.id) AS is_live
        FROM sheets s
        WHERE s.user_id = ${userId}
          AND s.sheet_name = ${sheetName}
          AND s.is_public = TRUE
        ORDER BY s.id DESC
        LIMIT 1
    `);
}

export function sheetRequiresPassword(row: SheetRow): boolean {
    return Boolean(row.sheet_password && row.sheet_password.length > 0);
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
