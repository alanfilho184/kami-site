import type { H3Event } from 'h3';
import type { SheetDetail, SheetErrorResponse } from '~~/shared/types/sheet';
import { resolveSheetError } from '../../../services/sheet-errors';
import { sheetService } from '../../../services/sheet.service';
import { getAuthUser } from '../../../utils/auth-context';
import { logger } from '../../../utils/logger';
import { assertSameOrigin } from '../../../utils/request-origin';

export default defineEventHandler(async (event: H3Event): Promise<SheetDetail | SheetErrorResponse> => {
    assertSameOrigin(event);

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
        const sheet = await sheetService.duplicateSheet(user.id, sheetId);
        setResponseStatus(event, 201);
        logger.info('Ficha duplicada', { user_id: user.id, sheet_id: sheet.id });
        return sheet;
    } catch (error) {
        const failure = resolveSheetError(error);

        if (failure) {
            setResponseStatus(event, failure.statusCode);
            return failure.response;
        }

        logger.error('Falha ao duplicar ficha', { error });
        setResponseStatus(event, 503);
        return { message: 'Não foi possível duplicar a ficha. Tente novamente em instantes.' };
    }
});
