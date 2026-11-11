import type { H3Event } from 'h3';
import type { SheetDetail, SheetErrorResponse } from '~~/shared/types/sheet';
import { resolveSheetError } from '../../../services/sheet-errors';
import { sheetService } from '../../../services/sheet.service';
import { getAuthUser } from '../../../utils/auth-context';
import { logger } from '../../../logs';

function readSheetName(event: H3Event): string {
    const raw = getRouterParam(event, 'sheetName') ?? '';

    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

export default defineEventHandler(async (event: H3Event): Promise<SheetDetail | SheetErrorResponse> => {
    const user = getAuthUser(event);

    if (!user) {
        setResponseStatus(event, 401);
        return { message: 'Não autenticado.' };
    }

    const sheetName = readSheetName(event);

    if (!sheetName) {
        setResponseStatus(event, 404);
        return { message: 'Ficha não encontrada.', code: 'sheet_not_found' };
    }

    try {
        return await sheetService.getSheetByName(user.id, sheetName);
    } catch (error) {
        const failure = resolveSheetError(error);

        if (failure) {
            setResponseStatus(event, failure.statusCode);
            return failure.response;
        }

        logger.error('Falha ao carregar ficha pelo nome', { event: 'sheet.read_by_name_failed', error });
        setResponseStatus(event, 503);
        return { message: 'Ficha indisponível. Tente novamente em instantes.' };
    }
});
