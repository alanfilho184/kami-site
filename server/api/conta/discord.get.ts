import type { H3Event } from 'h3';
import type { DiscordLinkErrorResponse, DiscordLinkState } from '~~/shared/types/discord';
import { resolveDiscordLinkError } from '../../services/discord-link-errors';
import { discordLinkService } from '../../services/discord-link.service';
import { getAuthUser } from '../../utils/auth-context';
import { logger } from '../../logs';

export default defineEventHandler(async (event: H3Event): Promise<DiscordLinkState | DiscordLinkErrorResponse> => {
    const user = getAuthUser(event);

    if (!user) {
        setResponseStatus(event, 401);
        return { message: 'Não autenticado.' };
    }

    const log = logger.forRequest(event);

    try {
        return await discordLinkService.getState(user.id);
    } catch (error) {
        const failure = resolveDiscordLinkError(error);

        if (failure) {
            log.warn('Vínculo do Discord não consultado', {
                event: 'discord.link.read_failed',
                error_code: failure.response.code,
                error_name: error instanceof Error ? error.name : undefined
            });
            setResponseStatus(event, failure.statusCode);
            return failure.response;
        }

        log.error('Falha ao consultar vínculo do Discord', {
            event: 'discord.link.read_failed',
            error,
            user_id: user.id
        });
        setResponseStatus(event, 503);
        return { message: 'Não foi possível consultar o vínculo agora. Tente novamente em instantes.' };
    }
});
