import type { H3Event } from 'h3';
import type { AccountResponse } from '~~/shared/types/panel';
import { panelService } from '../services/panel.service';
import { getAuthUser } from '../utils/auth-context';
import { logger } from '../logs';

export default defineEventHandler(async (event: H3Event): Promise<AccountResponse | { message: string }> => {
    const user = getAuthUser(event);

    if (!user) {
        setResponseStatus(event, 401);
        return { message: 'Não autenticado.' };
    }

    try {
        return { account: await panelService.getAccount(user.id) };
    } catch (error) {
        logger.error('Falha ao carregar a conta', { event: 'account.read_failed', error });
        setResponseStatus(event, 503);
        return { message: 'Conta indisponível. Tente novamente em instantes.' };
    }
});
