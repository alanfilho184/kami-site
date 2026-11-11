import type { H3Event } from 'h3';
import type { SheetDetail, SheetErrorResponse } from '~~/shared/types/sheet';
import { sheetSharingSchema } from '../../../schemas/sheet';
import { resolveSheetError } from '../../../services/sheet-errors';
import { sheetService } from '../../../services/sheet.service';
import { getAuthUser } from '../../../utils/auth-context';
import { logger } from '../../../logs';
import { readLimitedJsonBody, RequestBodyTooLargeError } from '../../../utils/request-body';
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

        log.info('Compartilhamento da ficha atualizado', {
            event: 'sheet.publication.updated',
            user_id: user.id,
            sheet_id: sheet.id,
            sheet_name: sheet.name,
            is_public: sheet.isPublic,
            has_password: sheet.hasPassword,
            password_changed: parsed.data.password !== undefined
        });
        return sheet;
    } catch (error) {
        const failure = resolveSheetError(error);

        if (failure) {
            log.warn('Compartilhamento da ficha não atualizado', {
                event: 'sheet.publication.update_failed',
                error_code: failure.response.code,
                error_name: error instanceof Error ? error.name : undefined,
                sheet_id: sheetId
            });
            setResponseStatus(event, failure.statusCode);
            return failure.response;
        }

        log.error('Falha ao alterar compartilhamento da ficha', {
            event: 'sheet.publication.update_failed',
            error,
            sheet_id: sheetId
        });
        setResponseStatus(event, 503);
        return { message: 'Não foi possível alterar o compartilhamento. Tente novamente em instantes.' };
    }
});
