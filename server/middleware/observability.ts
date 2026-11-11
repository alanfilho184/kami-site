import { randomUUID } from 'node:crypto';
import type { H3Event } from 'h3';
import { captureResponseBody, readRequestBodyForLog, shouldCaptureHttpPayloads, type CapturedBody } from '../logs/body';
import { createRequestLogContext, requestRoute } from '../logs/context';
import { logger } from '../logs';
import { getConfig } from '../utils/config';
import { getClientIp } from '../utils/request-metadata';

const ignoredPaths = [
    '/_nuxt/',
    '/__nuxt',
    '/fonts/',
    '/marca/',
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
    '/socket.io'
];

function generateRequestId(event: H3Event): string {
    const received = getRequestHeader(event, 'x-request-id');

    if (received && /^[a-zA-Z0-9._-]{8,100}$/.test(received)) {
        return received;
    }

    return randomUUID();
}

/**
 * Dá a cada requisição um identificador rastreável, guarda o contexto para os
 * logs de domínio e registra uma linha JSON ao final, com método, rota,
 * status, duração e os bodies temporários de depuração. O encerramento é feito
 * no evento `finish` para capturar também erros lançados por handlers.
 */
export default defineEventHandler(async (event: H3Event) => {
    const path = event.path.split('?')[0] ?? '/';

    if (ignoredPaths.some(prefix => path === prefix || path.startsWith(prefix))) {
        return;
    }

    const start = performance.now();
    const requestId = generateRequestId(event);
    const config = getConfig();

    event.context.log = createRequestLogContext(event, requestId);
    event.node.res.setHeader('x-request-id', requestId);

    const captureBodies = config.logHttpPayloads && shouldCaptureHttpPayloads(path);
    let requestBody: CapturedBody | null = null;

    if (captureBodies) {
        requestBody = await readRequestBodyForLog(event, config.logPayloadMaxBytes);
    }

    const responseCapture = captureBodies ? captureResponseBody(event, config.logPayloadMaxBytes) : null;
    let logged = false;

    function writeHttpLog(status: number): void {
        if (logged) {
            return;
        }

        logged = true;

        const duration = Math.round(performance.now() - start);
        const route = requestRoute(event);
        const userId = event.context.log?.user_id ?? event.context.auth?.user?.id ?? null;
        const responseBody = responseCapture?.finish() ?? null;
        const isSessionProbe = path === '/api/auth/session' && status === 401;

        logger.logHttp({
            method: event.method,
            route,
            status,
            execution_ms: duration,
            request_id: requestId,
            ip: event.context.log?.ip ?? getClientIp(event),
            user_id: userId,
            level: isSessionProbe ? 'debug' : undefined,
            message: isSessionProbe ? 'Sessão ausente na verificação de estado' : undefined,
            remote: !isSessionProbe,
            request_body: requestBody?.value,
            request_body_bytes: requestBody?.bytes,
            request_body_truncated: requestBody?.truncated,
            request_body_skipped: requestBody?.skipped,
            response_body: responseBody?.value,
            response_body_bytes: responseBody?.bytes,
            response_body_truncated: responseBody?.truncated,
            response_body_skipped: responseBody?.skipped
        });
    }

    event.node.res.on('finish', () => {
        writeHttpLog(event.node.res.statusCode);
    });

    event.node.res.on('close', () => {
        if (!event.node.res.writableFinished) {
            writeHttpLog(499);
        }
    });
});
