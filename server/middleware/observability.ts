import { randomUUID } from 'node:crypto';
import type { H3Event } from 'h3';
import { logger } from '../utils/logger';

const ignoredPaths = ['/_nuxt/', '/__nuxt', '/fonts/', '/marca/', '/favicon.ico', '/robots.txt'];

function generateRequestId(event: H3Event): string {
    const received = getRequestHeader(event, 'x-request-id');

    if (received && /^[a-zA-Z0-9._-]{8,100}$/.test(received)) {
        return received;
    }

    return randomUUID();
}

/**
 * Dá a cada requisição um identificador rastreável e registra uma linha JSON ao
 * final, com método, caminho, status e duração. O encerramento é feito no evento
 * `finish` para capturar também erros lançados por handlers.
 */
export default defineEventHandler(event => {
    const path = event.path.split('?')[0] ?? '/';

    if (ignoredPaths.some(prefix => path === prefix || path.startsWith(prefix))) {
        return;
    }

    const start = performance.now();
    const requestId = generateRequestId(event);

    event.node.res.setHeader('x-request-id', requestId);

    event.node.res.on('finish', () => {
        const status = event.node.res.statusCode;
        const duration = Math.round(performance.now() - start);
        const context = {
            method: event.method,
            path,
            status,
            duration_ms: duration,
            request_id: requestId
        };

        if (status >= 500) {
            logger.error('Requisição concluída com falha', context);
            return;
        }

        if (status >= 400) {
            logger.warn('Requisição recusada', context);
            return;
        }

        logger.info('Requisição concluída', context);
    });
});
