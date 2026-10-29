import type { H3Event } from 'h3';
import { checkDatabase } from '../utils/database';
import { logger } from '../utils/logger';

export interface ReadinessResponse {
    status: 'ok' | 'unavailable';
    timestamp: string;
    database: {
        ok: boolean;
        latencyMs: number | null;
    };
}

/**
 * Readiness: só responde 200 quando o pool consegue executar uma consulta. O
 * Cloudflare usa esta rota para decidir se a VPS continua recebendo tráfego.
 */
export default defineEventHandler(async (event: H3Event): Promise<ReadinessResponse> => {
    const result = await checkDatabase();
    const timestamp = new Date().toISOString();

    setHeader(event, 'cache-control', 'no-store');

    if (!result.ok) {
        logger.warn('Verificação de prontidão falhou', { error: result.error });
        setResponseStatus(event, 503);

        return {
            status: 'unavailable',
            timestamp,
            database: {
                ok: false,
                latencyMs: null
            }
        };
    }

    return {
        status: 'ok',
        timestamp,
        database: {
            ok: true,
            latencyMs: result.latencyMs
        }
    };
});
