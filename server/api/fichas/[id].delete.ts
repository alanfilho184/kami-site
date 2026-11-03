import { sendNoContent, type H3Event } from 'h3';
import type { SheetErrorResponse } from '~~/shared/types/sheet';
import { deleteSheetSchema } from '../../schemas/sheet';
import { resolveSheetError } from '../../services/sheet-errors';
import { sheetService } from '../../services/sheet.service';
import { getAuthUser } from '../../utils/auth-context';
import { logger } from '../../utils/logger';
import { assertSameOrigin } from '../../utils/request-origin';

export default defineEventHandler(async (event: H3Event): Promise<SheetErrorResponse | void> => {
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

    let body: unknown = null;

    try {
        body = await readBody(event);
    } catch {
        body = null;
    }

    const parsed = deleteSheetSchema.safeParse(body);

    if (!parsed.success) {
        setResponseStatus(event, 400);
        return {
            message: 'Confira a versão da ficha.',
            code: 'invalid_sheet'
        };
    }

    try {
        await sheetService.deleteSheet(user.id, sheetId, parsed.data.version);
        logger.info('Ficha excluída', { user_id: user.id, sheet_id: sheetId });
        sendNoContent(event);
        return;
    } catch (error) {
        const failure = resolveSheetError(error);

        if (failure) {
            setResponseStatus(event, failure.statusCode);
            return failure.response;
        }

        logger.error('Falha ao excluir ficha', { error });
        setResponseStatus(event, 503);
        return { message: 'Não foi possível excluir a ficha. Tente novamente em instantes.' };
    }
});
