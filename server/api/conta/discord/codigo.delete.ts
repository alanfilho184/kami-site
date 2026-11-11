import type { H3Event } from 'h3';
import type { DiscordLinkErrorResponse } from '~~/shared/types/discord';
import { resolveDiscordLinkError } from '../../../services/discord-link-errors';
import { discordLinkService } from '../../../services/discord-link.service';
import { getAuthUser } from '../../../utils/auth-context';
import { logger } from '../../../logs';
import { assertSameOrigin } from '../../../utils/request-origin';

export default defineEventHandler(async (event: H3Event): Promise<void | DiscordLinkErrorResponse> => {
    assertSameOrigin(event);

    const user = getAuthUser(event);

    if (!user) {
        setResponseStatus(event, 401);
        return { message: 'Não autenticado.' };
    }

    const log = logger.forRequest(event);

    try {
        await discordLinkService.cancelCode(user.id);
        setResponseStatus(event, 204);
        log.info('Código de vínculo do Discord cancelado', {
            event: 'discord.link.code.cancelled',
            user_id: user.id,
            auth_method: 'session'
        });
    } catch (error) {
        const failure = resolveDiscordLinkError(error);

        if (failure) {
            log.warn('Código de vínculo do Discord não cancelado', {
                event: 'discord.link.code.cancel_failed',
                error_code: failure.response.code,
                error_name: error instanceof Error ? error.name : undefined
            });
            setResponseStatus(event, failure.statusCode);
            return failure.response;
        }

        log.error('Falha ao cancelar código de vínculo do Discord', {
            event: 'discord.link.code.cancel_failed',
            error,
            user_id: user.id
        });
        setResponseStatus(event, 503);
        return { message: 'Não foi possível cancelar o código agora. Tente novamente em instantes.' };
    }
});
