import type { H3Event } from 'h3';

export interface HealthResponse {
    status: 'ok';
    version: string;
    environment: string;
    timestamp: string;
}

/**
 * Liveness: confirma apenas que o processo HTTP está respondendo. Não toca no
 * banco de dados, para que a plataforma não reinicie a aplicação por causa de
 * uma falha momentânea do Postgres.
 */
export default defineEventHandler((event: H3Event): HealthResponse => {
    const config = useRuntimeConfig(event);

    setHeader(event, 'cache-control', 'no-store');

    return {
        status: 'ok',
        version: String(config.public.version),
        environment: String(config.public.environment),
        timestamp: new Date().toISOString()
    };
});
