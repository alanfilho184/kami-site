import type { H3Event } from 'h3';
import type { SheetDetail, SheetErrorResponse } from '~~/shared/types/sheet';
import { createSheetSchema } from '../../schemas/sheet';
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

    const parsed = createSheetSchema.safeParse(body);

    if (!parsed.success) {
        setResponseStatus(event, 400);
        return {
            message: 'Confira o nome da ficha: 1 a 32 caracteres, sem aspas simples, cifrão ou porcentagem.',
            code: 'invalid_sheet'
        };
    }

    try {
        const sheet = await sheetService.createSheet(user.id, parsed.data.name);
        setResponseStatus(event, 201);
        logger.info('Ficha criada', { user_id: user.id, sheet_id: sheet.id });
        return sheet;
    } catch (error) {
        const failure = resolveSheetError(error);

        if (failure) {
            setResponseStatus(event, failure.statusCode);
            return failure.response;
        }

        logger.error('Falha ao criar ficha', { error });
        setResponseStatus(event, 503);
        return { message: 'Não foi possível criar a ficha. Tente novamente em instantes.' };
    }
});
