import type { H3Event } from 'h3';
import type { SheetDetail, SheetErrorResponse } from '~~/shared/types/sheet';
import { sheetSharingSchema } from '../../../schemas/sheet';
import { resolveSheetError } from '../../../services/sheet-errors';
import { sheetService } from '../../../services/sheet.service';
import { getAuthUser } from '../../../utils/auth-context';
import { logger } from '../../../utils/logger';
import { readLimitedJsonBody, RequestBodyTooLargeError } from '../../../utils/request-body';
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

    let body: unknown = null;

    try {
        body = await readLimitedJsonBody(event);
    } catch (error) {
        if (error instanceof RequestBodyTooLargeError) {
            setResponseStatus(event, 413);
            return { message: 'Requisição grande demais.', code: 'invalid_sheet' };
        }

        body = null;
    }

    const parsed = sheetSharingSchema.safeParse(body);

    if (!parsed.success) {
        setResponseStatus(event, 400);
        return {
            message: 'Confira o compartilhamento: a senha deve ter de 4 a 64 caracteres.',
            code: 'invalid_password'
        };
    }

    try {
        const sheet = await sheetService.updateSheetSharing(user.id, sheetId, {
            version: parsed.data.version,
            isPublic: parsed.data.isPublic,
            password: parsed.data.password
        });

        logger.info('Compartilhamento da ficha atualizado', { user_id: user.id, sheet_id: sheet.id });
        return sheet;
    } catch (error) {
        const failure = resolveSheetError(error);

        if (failure) {
            setResponseStatus(event, failure.statusCode);
            return failure.response;
        }

        logger.error('Falha ao alterar compartilhamento da ficha', { error });
        setResponseStatus(event, 503);
        return { message: 'Não foi possível alterar o compartilhamento. Tente novamente em instantes.' };
    }
});
