import type { H3Event } from 'h3';
import type { PanelResponse } from '~~/shared/types/panel';
import { panelService } from '../services/panel.service';
import { getAuthUser } from '../utils/auth-context';
import { logger } from '../utils/logger';

export default defineEventHandler(async (event: H3Event): Promise<PanelResponse | { message: string }> => {
    const user = getAuthUser(event);

    if (!user) {
        setResponseStatus(event, 401);
        return { message: 'Não autenticado.' };
    }

    try {
        return await panelService.getOverview(user.id);
    } catch (error) {
        logger.error('Falha ao carregar o painel', { error });
        setResponseStatus(event, 503);
        return { message: 'Painel indisponível. Tente novamente em instantes.' };
    }
});
