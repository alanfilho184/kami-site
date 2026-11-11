import type { H3Event } from 'h3';
import type { DiscordLinkErrorResponse, DiscordLinkState } from '~~/shared/types/discord';
import { resolveDiscordLinkError } from '../../../services/discord-link-errors';
import { discordLinkService } from '../../../services/discord-link.service';
import { getAuthUser } from '../../../utils/auth-context';
import { logger } from '../../../logs';
import { assertSameOrigin } from '../../../utils/request-origin';

export default defineEventHandler(async (event: H3Event): Promise<DiscordLinkState | DiscordLinkErrorResponse> => {
    assertSameOrigin(event);

    const user = getAuthUser(event);

    if (!user) {
        setResponseStatus(event, 401);
        return { message: 'Não autenticado.' };
    }

    const log = logger.forRequest(event);

    try {
        const state = await discordLinkService.confirm(user.id);
        log.info('Conta do Discord vinculada', {
            event: 'discord.link.confirmed',
            user_id: user.id,
            auth_method: 'session'
        });
        return state;
    } catch (error) {
        const failure = resolveDiscordLinkError(error);

        if (failure) {
            log.warn('Vínculo do Discord não confirmado', {
                event: 'discord.link.confirm_failed',
                error_code: failure.response.code,
                error_name: error instanceof Error ? error.name : undefined
            });
            setResponseStatus(event, failure.statusCode);
            return failure.response;
        }

        log.error('Falha ao confirmar vínculo do Discord', {
            event: 'discord.link.confirm_failed',
            error,
            user_id: user.id
        });
        setResponseStatus(event, 503);
        return { message: 'Não foi possível confirmar o vínculo agora. Tente novamente em instantes.' };
    }
});
