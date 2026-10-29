import type { H3Event } from 'h3';
import type { StatisticsResponse } from '~~/shared/types/statistics';
import { getStatistics } from '../services/statistics.service';

/**
 * Estatísticas públicas da landing. O cache de 60 segundos e o stale de 15
 * minutos ficam no serviço; a rota só traduz o resultado e o 503.
 */
export default defineEventHandler(async (event: H3Event): Promise<StatisticsResponse> => {
    const result = await getStatistics();
    setHeader(event, 'cache-control', 'no-store');

    if (!result.available) {
        setHeader(event, 'retry-after', 30);
        setResponseStatus(event, 503);
    }

    return {
        available: result.available,
        data: result.data,
        updatedAt: result.updatedAt,
        expired: result.expired,
        source: result.source
    };
});
