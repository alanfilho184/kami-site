import type { H3Event } from 'h3';
import type { MacroListItem } from '~~/shared/types/panel';
import { panelService } from '../services/panel.service';
import { getAuthUser } from '../utils/auth-context';
import { logger } from '../utils/logger';

export default defineEventHandler(async (event: H3Event): Promise<MacroListItem[] | { message: string }> => {
    const user = getAuthUser(event);

    if (!user) {
        setResponseStatus(event, 401);
        return { message: 'Não autenticado.' };
    }

    try {
        return await panelService.getMacros(user.id, 100);
    } catch (error) {
        logger.error('Falha ao listar macros do painel', { error });
        setResponseStatus(event, 503);
        return { message: 'Macros indisponíveis. Tente novamente em instantes.' };
    }
});
