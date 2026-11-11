import type { H3Event } from 'h3';
import { reportProblemSchema } from '../../schemas/report';
import { getAuthUser } from '../../utils/auth-context';
import { getConfig } from '../../utils/config';
import { logger } from '../../logs';
import { consumeReport } from '../../utils/rate-limit';
import { readLimitedJsonBody, RequestBodyTooLargeError } from '../../utils/request-body';
import { assertSameOrigin } from '../../utils/request-origin';
import { buildReportWebhookPayload, isDiscordWebhookUrl, normalizeOwnerDiscordId } from '../../utils/report-webhook';

interface ReportErrorResponse {
    message: string;
    code?: 'invalid_report' | 'report_unavailable' | 'report_rate_limited';
}

export default defineEventHandler(async (event: H3Event): Promise<null | ReportErrorResponse> => {
    assertSameOrigin(event);

    const user = getAuthUser(event);

    if (!user) {
        setResponseStatus(event, 401);
        return { message: 'Não autenticado.' };
    }

    const log = logger.forRequest(event);
    const rate = consumeReport(user.id);

    if (!rate.allowed) {
        log.warn('Reporte de problema limitado', {
            event: 'support.report.failed',
            error_code: 'report_rate_limited',
            user_id: user.id,
            auth_method: 'session'
        });
        setHeader(event, 'retry-after', rate.retryAfterSeconds);
        setResponseStatus(event, 429);
        return {
            message: 'Muitos reportes em pouco tempo. Aguarde alguns minutos.',
            code: 'report_rate_limited'
        };
    }

    let body: unknown = null;

    try {
        body = await readLimitedJsonBody(event, 32 * 1024);
    } catch (error) {
        if (error instanceof RequestBodyTooLargeError) {
            setResponseStatus(event, 413);
            return { message: 'O reporte é grande demais.', code: 'invalid_report' };
        }

        body = null;
    }

    const parsed = reportProblemSchema.safeParse(body);

    if (!parsed.success) {
        log.warn('Reporte de problema inválido', {
            event: 'support.report.failed',
            error_code: 'invalid_report',
            user_id: user.id,
            auth_method: 'session'
        });
        setResponseStatus(event, 400);
        return {
            message: parsed.error.issues[0]?.message ?? 'Confira o texto do reporte.',
            code: 'invalid_report'
        };
    }

    const config = getConfig();
    const webhookUrl = config.discordLogWebhookUrl;

    if (!isDiscordWebhookUrl(webhookUrl)) {
        log.warn('Reporte de problema sem webhook válido configurado', {
            event: 'support.report.failed',
            error_code: 'report_unavailable',
            user_id: user.id,
            auth_method: 'session'
        });
        setResponseStatus(event, 503);
        return {
            message: 'O envio de reportes não está configurado.',
            code: 'report_unavailable'
        };
    }

    const payload = buildReportWebhookPayload({
        userId: user.id,
        username: user.username,
        message: parsed.data.message,
        page: parsed.data.page,
        ownerDiscordId: normalizeOwnerDiscordId(config.ownerDiscordId)
    });

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
            log.warn('Discord recusou o reporte de problema', {
                event: 'support.report.failed',
                error_code: 'report_unavailable',
                user_id: user.id,
                upstream_status: response.status,
                auth_method: 'session'
            });
            setResponseStatus(event, 502);
            return {
                message: 'Não foi possível enviar o reporte. Tente novamente em instantes.',
                code: 'report_unavailable'
            };
        }
    } catch (error) {
        log.warn('Falha de rede ao enviar reporte de problema', {
            event: 'support.report.failed',
            error_code: 'report_unavailable',
            user_id: user.id,
            error_name: error instanceof Error ? error.name : 'unknown',
            auth_method: 'session'
        });
        setResponseStatus(event, 502);
        return {
            message: 'Não foi possível enviar o reporte. Tente novamente em instantes.',
            code: 'report_unavailable'
        };
    }

    log.info('Reporte de problema enviado', {
        event: 'support.report.sent',
        user_id: user.id,
        auth_method: 'session'
    });
    setResponseStatus(event, 204);
    return null;
});
