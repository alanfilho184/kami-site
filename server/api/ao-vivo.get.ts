import type { H3Event } from 'h3';
import type { LiveSheetItem } from '~~/shared/types/panel';
import { panelService } from '../services/panel.service';
import { getAuthUser } from '../utils/auth-context';
import { logger } from '../utils/logger';

export default defineEventHandler(async (event: H3Event): Promise<LiveSheetItem[] | { message: string }> => {
    const user = getAuthUser(event);

    if (!user) {
        setResponseStatus(event, 401);
        return { message: 'Não autenticado.' };
    }

    try {
        return await panelService.getLiveSheets(user.id, 100);
    } catch (error) {
        logger.error('Falha ao listar fichas ao vivo', { error });
        setResponseStatus(event, 503);
        return { message: 'Fichas ao vivo indisponíveis. Tente novamente em instantes.' };
    }
});
