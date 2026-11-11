import type { H3Event } from 'h3';
import type { DiscordClaimResponse, DiscordLinkErrorResponse } from '~~/shared/types/discord';
import { discordClaimSchema } from '../../../schemas/discord';
import { resolveDiscordLinkError } from '../../../services/discord-link-errors';
import { discordLinkService } from '../../../services/discord-link.service';
import { logger } from '../../../logs';
import { readLimitedJsonBody, RequestBodyTooLargeError } from '../../../utils/request-body';
import { requireServiceToken } from '../../../utils/service-auth';

const CLAIM_BODY_MAX_BYTES = 16 * 1024;

export default defineEventHandler(async (event: H3Event): Promise<DiscordClaimResponse | DiscordLinkErrorResponse> => {
    requireServiceToken(event);

    const log = logger.forRequest(event);

    let body: unknown = null;

    try {
        body = await readLimitedJsonBody(event, CLAIM_BODY_MAX_BYTES);
    } catch (error) {
        if (error instanceof RequestBodyTooLargeError) {
            setResponseStatus(event, 413);
            return { message: 'Dados inválidos.' };
        }

        body = null;
    }

    const parsed = discordClaimSchema.safeParse(body);

    if (!parsed.success) {
        setResponseStatus(event, 400);
        return { message: 'Dados inválidos.' };
    }

    try {
        const response = await discordLinkService.claimCode(parsed.data);
        log.info('Código de vínculo do Discord reivindicado', {
            event: 'discord.link.claimed',
            auth_method: 'service_token',
            site_username: response.siteUsername
        });
        return response;
    } catch (error) {
        const failure = resolveDiscordLinkError(error);

        if (failure) {
            log.warn('Código de vínculo do Discord não reivindicado', {
                event: 'discord.link.claim_failed',
                error_code: failure.response.code,
                error_name: error instanceof Error ? error.name : undefined
            });
            setResponseStatus(event, failure.statusCode);
            return failure.response;
        }

        log.error('Falha ao reivindicar código de vínculo do Discord', {
            event: 'discord.link.claim_failed',
            error
        });
        setResponseStatus(event, 503);
        return { message: 'Não foi possível validar o código agora. Tente novamente em instantes.' };
    }
});
