import type { H3Event } from 'h3';
import type { SheetErrorResponse, SheetQuota } from '~~/shared/types/sheet';
import { sheetService } from '../../services/sheet.service';
import { getAuthUser } from '../../utils/auth-context';
import { logger } from '../../utils/logger';

export default defineEventHandler(async (event: H3Event): Promise<SheetQuota | SheetErrorResponse> => {
    const user = getAuthUser(event);

    if (!user) {
        setResponseStatus(event, 401);
        return { message: 'Não autenticado.' };
    }

    try {
        return await sheetService.getQuota(user.id, user.isPremium);
    } catch (error) {
        logger.error('Falha ao consultar o limite de fichas', { error });
        setResponseStatus(event, 503);
        return { message: 'Não foi possível consultar o limite de fichas. Tente novamente em instantes.' };
    }
});
