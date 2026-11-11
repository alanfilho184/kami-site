import type { H3Event } from 'h3';
import type { DiscordCodeResponse, DiscordLinkErrorResponse } from '~~/shared/types/discord';
import { resolveDiscordLinkError } from '../../../services/discord-link-errors';
import { discordLinkService } from '../../../services/discord-link.service';
import { getAuthUser } from '../../../utils/auth-context';
import { logger } from '../../../logs';
import { consumeDiscordCode } from '../../../utils/rate-limit';
import { assertSameOrigin } from '../../../utils/request-origin';

export default defineEventHandler(async (event: H3Event): Promise<DiscordCodeResponse | DiscordLinkErrorResponse> => {
    assertSameOrigin(event);

    const user = getAuthUser(event);

    if (!user) {
        setResponseStatus(event, 401);
        return { message: 'Não autenticado.' };
    }

    const log = logger.forRequest(event);
    const rate = consumeDiscordCode(user.id);

    if (!rate.allowed) {
        setHeader(event, 'retry-after', rate.retryAfterSeconds);
        setResponseStatus(event, 429);
        return { message: 'Muitos códigos gerados. Aguarde alguns minutos e tente novamente.' };
    }

    try {
        const response = await discordLinkService.createCode(user.id);
        setResponseStatus(event, 201);
        log.info('Código de vínculo do Discord gerado', {
            event: 'discord.link.code.created',
            user_id: user.id,
            auth_method: 'session'
        });
        return response;
    } catch (error) {
        const failure = resolveDiscordLinkError(error);

        if (failure) {
            log.warn('Código de vínculo do Discord não gerado', {
                event: 'discord.link.code.create_failed',
                error_code: failure.response.code,
                error_name: error instanceof Error ? error.name : undefined
            });
            setResponseStatus(event, failure.statusCode);
            return failure.response;
        }

        log.error('Falha ao gerar código de vínculo do Discord', {
            event: 'discord.link.code.create_failed',
            error,
            user_id: user.id
        });
        setResponseStatus(event, 503);
        return { message: 'Não foi possível gerar o código agora. Tente novamente em instantes.' };
    }
});
