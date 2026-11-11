import type { H3Event } from 'h3';
import type { SheetListItem } from '~~/shared/types/panel';
import { panelService } from '../../services/panel.service';
import { getAuthUser } from '../../utils/auth-context';
import { logger } from '../../logs';

export default defineEventHandler(async (event: H3Event): Promise<SheetListItem[] | { message: string }> => {
    const user = getAuthUser(event);

    if (!user) {
        setResponseStatus(event, 401);
        return { message: 'Não autenticado.' };
    }

    try {
        return await panelService.getSheets(user.id, 100);
    } catch (error) {
        logger.error('Falha ao listar fichas do painel', { event: 'sheet.list_failed', error });
        setResponseStatus(event, 503);
        return { message: 'Fichas indisponíveis. Tente novamente em instantes.' };
    }
});
