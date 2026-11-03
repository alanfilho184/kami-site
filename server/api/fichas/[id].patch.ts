import type { H3Event } from 'h3';
import type { SheetDetail, SheetErrorResponse } from '~~/shared/types/sheet';
import { patchSheetSchema } from '../../schemas/sheet';
import { resolveSheetError } from '../../services/sheet-errors';
import { sheetService } from '../../services/sheet.service';
import { getAuthUser } from '../../utils/auth-context';
import { logger } from '../../utils/logger';
import { readLimitedJsonBody, RequestBodyTooLargeError } from '../../utils/request-body';
import { assertSameOrigin } from '../../utils/request-origin';

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

    let body: unknown = null;

    try {
        body = await readLimitedJsonBody(event);
    } catch (error) {
        if (error instanceof RequestBodyTooLargeError) {
            setResponseStatus(event, 413);
            return {
                message: 'A ficha é grande demais para ser enviada.',
                code: 'invalid_sheet'
            };
        }

        body = null;
    }

    const parsed = patchSheetSchema.safeParse(body);

    if (!parsed.success) {
        setResponseStatus(event, 400);
        return {
            message: 'Confira os dados da ficha.',
            code: 'invalid_sheet'
        };
    }

    try {
        const sheet = parsed.data.attributes
            ? await sheetService.updateSheet(user.id, sheetId, {
                  name: parsed.data.name,
                  attributes: parsed.data.attributes,
                  layout: parsed.data.layout ?? null,
                  version: parsed.data.version
              })
            : await sheetService.renameSheet(user.id, sheetId, {
                  name: parsed.data.name,
                  version: parsed.data.version
              });

        logger.info('Ficha atualizada', { user_id: user.id, sheet_id: sheet.id });
        return sheet;
    } catch (error) {
        const failure = resolveSheetError(error);

        if (failure) {
            setResponseStatus(event, failure.statusCode);
            return failure.response;
        }

        logger.error('Falha ao alterar ficha', { error });
        setResponseStatus(event, 503);
        return { message: 'Não foi possível alterar a ficha. Tente novamente em instantes.' };
    }
});
