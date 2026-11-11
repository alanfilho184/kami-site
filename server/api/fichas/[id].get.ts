import type { H3Event } from 'h3';
import type { SheetDetail, SheetErrorResponse } from '~~/shared/types/sheet';
import { resolveSheetError } from '../../services/sheet-errors';
import { sheetService } from '../../services/sheet.service';
import { getAuthUser } from '../../utils/auth-context';
import { logger } from '../../logs';

export default defineEventHandler(async (event: H3Event): Promise<SheetDetail | SheetErrorResponse> => {
    const user = getAuthUser(event);

    if (!user) {
        setResponseStatus(event, 401);
        return { message: 'Não autenticado.' };
    }

    const sheetId = Number(getRouterParam(event, 'id'));

    if (!Number.isInteger(sheetId) || sheetId <= 0) {
        setResponseStatus(event, 404);
        return { message: 'Ficha não encontrada.', code: 'sheet_not_found' };
    }

    try {
        return await sheetService.getSheet(user.id, sheetId);
    } catch (error) {
        const failure = resolveSheetError(error);

        if (failure) {
            setResponseStatus(event, failure.statusCode);
            return failure.response;
        }

        logger.error('Falha ao carregar ficha', { event: 'sheet.read_failed', error });
        setResponseStatus(event, 503);
        return { message: 'Ficha indisponível. Tente novamente em instantes.' };
    }
});
