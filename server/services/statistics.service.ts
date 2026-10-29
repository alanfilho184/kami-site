import type { QueryResultRow } from 'pg';
import SQL from 'sql-template-strings';
import type { StatisticsData, StatisticsSource } from '~~/shared/types/statistics';
import { queryOne } from '../utils/database';
import { logger } from '../utils/logger';

export type { StatisticsData, StatisticsSource } from '~~/shared/types/statistics';

export interface StatisticsRow extends QueryResultRow {
    users: string | number;
    active_users: string | number;
    sheets: string | number;
    commands: string | number;
    components: string | number;
}

export interface StatisticsResult {
    available: boolean;
    data: StatisticsData | null;
    updatedAt: string | null;
    expired: boolean;
    source: StatisticsSource;
}

export interface StatisticsCache {
    data: StatisticsData | null;
    updatedAt: number | null;
    failedAt: number | null;
}

export interface StatisticsDependencies {
    query: () => Promise<StatisticsRow | null>;
    now: () => number;
    cache: StatisticsCache;
    warn: (message: string, context?: unknown) => void;
}

export const REFRESH_INTERVAL_MS = 60_000;
export const STALE_LIMIT_MS = 15 * 60_000;
export const RETRY_COOLDOWN_MS = 10_000;

/**
 * O bot-status soma os números do bot antigo, que só mantinha contadores
 * simples. O site usa o mesmo critério para exibir o total desde o início.
 */
const LEGACY_COMMANDS = 803_410;
const LEGACY_COMPONENTS = 120_647;
export const LEGACY_INTERACTIONS = LEGACY_COMMANDS + LEGACY_COMPONENTS;

const statisticsQuery = SQL`
    SELECT
        (SELECT COUNT(id) FROM users)                                              AS users,
        (SELECT COUNT(id) FROM users WHERE last_use >= NOW() - INTERVAL '30 days') AS active_users,
        (SELECT COUNT(id) FROM sheets)                                             AS sheets,
        (SELECT COUNT(*) FROM logs WHERE action_type = 'COMMAND')                  AS commands,
        (SELECT COUNT(*) FROM logs WHERE action_type = 'COMPONENT')                AS components
`;

interface GlobalWithCache {
    __kamiStatisticsCache?: StatisticsCache;
}

function createEmptyCache(): StatisticsCache {
    return {
        data: null,
        updatedAt: null,
        failedAt: null
    };
}

function getGlobalCache(): StatisticsCache {
    const globalScope = globalThis as typeof globalThis & GlobalWithCache;

    if (!globalScope.__kamiStatisticsCache) {
        globalScope.__kamiStatisticsCache = createEmptyCache();
    }

    return globalScope.__kamiStatisticsCache;
}

async function queryDatabase(): Promise<StatisticsRow | null> {
    return queryOne<StatisticsRow>(statisticsQuery);
}

function requireCount(value: string | number, field: string): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue < 0) {
        throw new Error(`Contagem inválida em ${field}`);
    }

    return Math.trunc(numericValue);
}

function normalize(row: StatisticsRow): StatisticsData {
    return {
        users: requireCount(row.users, 'users'),
        activeUsers: requireCount(row.active_users, 'active_users'),
        sheets: requireCount(row.sheets, 'sheets'),
        interactions:
            requireCount(row.commands, 'commands') + requireCount(row.components, 'components') + LEGACY_INTERACTIONS
    };
}

function buildResponse(
    data: StatisticsData,
    updatedAt: number,
    expired: boolean,
    source: StatisticsSource
): StatisticsResult {
    return {
        available: true,
        data,
        updatedAt: new Date(updatedAt).toISOString(),
        expired,
        source
    };
}

const unavailableResponse: StatisticsResult = {
    available: false,
    data: null,
    updatedAt: null,
    expired: false,
    source: 'unavailable'
};

/**
 * O serviço é criado por fábrica para que os testes controlem relógio, cache e
 * consulta. Em produção existe uma instância única sobre o cache global, que
 * sobrevive ao hot reload do Nitro.
 */
export function createStatisticsService(dependencies: Partial<StatisticsDependencies> = {}) {
    const query = dependencies.query ?? queryDatabase;
    const now = dependencies.now ?? (() => Date.now());
    const cache = dependencies.cache ?? createEmptyCache();
    const warn = dependencies.warn ?? ((message: string, context?: unknown) => logger.warn(message, context));

    function cachedResponse(instant: number): StatisticsResult {
        if (!cache.data || cache.updatedAt === null) {
            return unavailableResponse;
        }

        const age = instant - cache.updatedAt;

        if (age > STALE_LIMIT_MS) {
            return unavailableResponse;
        }

        return buildResponse(cache.data, cache.updatedAt, true, 'stale-cache');
    }

    async function get(): Promise<StatisticsResult> {
        const instant = now();

        if (cache.data && cache.updatedAt !== null) {
            const age = instant - cache.updatedAt;

            if (age >= 0 && age < REFRESH_INTERVAL_MS) {
                return buildResponse(cache.data, cache.updatedAt, false, 'cache');
            }
        }

        if (cache.failedAt !== null && instant - cache.failedAt < RETRY_COOLDOWN_MS) {
            return cachedResponse(instant);
        }

        try {
            const row = await query();

            if (!row) {
                throw new Error('Consulta de estatísticas não retornou linhas');
            }

            const data = normalize(row);

            cache.data = data;
            cache.updatedAt = instant;
            cache.failedAt = null;

            return buildResponse(data, instant, false, 'query');
        } catch (error) {
            cache.failedAt = instant;
            warn('Falha ao consultar estatísticas da landing', { error });
            return cachedResponse(instant);
        }
    }

    return { get };
}

const service = createStatisticsService({ cache: getGlobalCache() });

export function getStatistics(): Promise<StatisticsResult> {
    return service.get();
}

export function clearStatisticsCache(): void {
    const globalScope = globalThis as typeof globalThis & GlobalWithCache;
    globalScope.__kamiStatisticsCache = createEmptyCache();
}
