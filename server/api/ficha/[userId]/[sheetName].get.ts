import type { H3Event } from 'h3';
import type { SheetDetail } from '~~/shared/types/sheet';
import { findPublicSheet, sheetRequiresPassword } from '../../../services/public-sheet.service';
import { toDetail } from '../../../services/sheet.service';
import { logger } from '../../../utils/logger';
import { hasSheetAccess } from '../../../utils/sheet-access';

interface PublicSheetErrorResponse {
    message: string;
    code?: 'sheet_not_found' | 'sheet_password_required';
}

function readSheetName(event: H3Event): string {
    const raw = getRouterParam(event, 'sheetName') ?? '';

    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

function readPreferredId(event: H3Event): number | null {
    const raw = getQuery(event).id;

    if (typeof raw !== 'string' || raw.length === 0) {
        return null;
    }

    const id = Number(raw);

    return Number.isInteger(id) && id > 0 ? id : null;
}

export default defineEventHandler(async (event: H3Event): Promise<SheetDetail | PublicSheetErrorResponse> => {
    setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
    setHeader(event, 'Cache-Control', 'private, no-store');

    const userId = Number(getRouterParam(event, 'userId'));
    const sheetName = readSheetName(event);
    const preferredId = readPreferredId(event);

    if (!Number.isInteger(userId) || userId <= 0 || !sheetName) {
        setResponseStatus(event, 404);
        return { message: 'Ficha não encontrada.', code: 'sheet_not_found' };
    }

    try {
        const row = await findPublicSheet(userId, sheetName, preferredId);

        if (!row) {
            setResponseStatus(event, 404);
            return { message: 'Ficha não encontrada.', code: 'sheet_not_found' };
        }

        if (sheetRequiresPassword(row) && !hasSheetAccess(event, row.id)) {
            setResponseStatus(event, 401);
            return { message: 'Esta ficha precisa de senha.', code: 'sheet_password_required' };
        }

        return toDetail(row);
    } catch (error) {
        logger.error('Falha ao carregar ficha pública', { error, user_id: userId });
        setResponseStatus(event, 503);
        return { message: 'Ficha indisponível. Tente novamente em instantes.' };
    }
});
