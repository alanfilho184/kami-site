import type { H3Event } from 'h3';
import type { SheetDetail, SheetErrorResponse } from '~~/shared/types/sheet';
import { resolveSheetError } from '../../../services/sheet-errors';
import { sheetService } from '../../../services/sheet.service';
import { getAuthUser } from '../../../utils/auth-context';
import { logger } from '../../../logs';
import { assertSameOrigin } from '../../../utils/request-origin';
import { enforceSheetWriteLimit } from '../../../utils/sheet-write-limit';

export default defineEventHandler(async (event: H3Event): Promise<SheetDetail | SheetErrorResponse> => {
    assertSameOrigin(event);

    const user = getAuthUser(event);

    if (!user) {
        setResponseStatus(event, 401);
        return { message: 'Não autenticado.' };
    }

    const log = logger.forRequest(event);
    const writeLimit = enforceSheetWriteLimit(event, user.id);

    if (writeLimit) {
        return writeLimit;
    }

    const sheetId = Number(getRouterParam(event, 'id'));

    if (!Number.isInteger(sheetId) || sheetId <= 0) {
        setResponseStatus(event, 404);
        return { message: 'Ficha não encontrada.', code: 'sheet_not_found' };
    }

    try {
        const sheet = await sheetService.duplicateSheet(user.id, sheetId, user.isPremium);
        setResponseStatus(event, 201);
        log.info('Ficha duplicada', {
            event: 'sheet.duplicated',
            user_id: user.id,
            sheet_id: sheet.id,
            sheet_name: sheet.name,
            source_sheet_id: sheetId,
            is_public: false,
            is_legacy: false
        });
        return sheet;
    } catch (error) {
        const failure = resolveSheetError(error);

        if (failure) {
            log.warn('Ficha não duplicada', {
                event: 'sheet.duplicate_failed',
                error_code: failure.response.code,
                error_name: error instanceof Error ? error.name : undefined,
                sheet_id: sheetId
            });
            setResponseStatus(event, failure.statusCode);
            return failure.response;
        }

        log.error('Falha ao duplicar ficha', { event: 'sheet.duplicate_failed', error, sheet_id: sheetId });
        setResponseStatus(event, 503);
        return { message: 'Não foi possível duplicar a ficha. Tente novamente em instantes.' };
    }
});
