import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import SQL from 'sql-template-strings';
import { getConfig } from './config';
import { logger } from './logger';

export interface Query {
    text: string;
    values: unknown[];
}

export interface DatabaseCheckResult {
    ok: boolean;
    latencyMs: number | null;
    error?: unknown;
}

const poolKey = '__kamiSitePool';

type GlobalWithPool = typeof globalThis & {
    __kamiSitePool?: Pool;
};

/**
 * O pool fica no globalThis para sobreviver ao hot reload do Nitro em
 * desenvolvimento. Em produção existe uma única instância por processo.
 */
function getPool(): Pool {
    const globalScope = globalThis as GlobalWithPool;

    if (!globalScope[poolKey]) {
        const config = getConfig();
        const pool = new Pool({
            connectionString: config.databaseUrl,
            max: config.dbPoolMax,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: config.dbConnectionTimeoutMs,
            statement_timeout: config.dbStatementTimeoutMs,
            application_name: 'kami-site',
            allowExitOnIdle: false
        });

        pool.on('error', error => {
            logger.error('Erro em cliente ocioso do Postgres', { error });
        });

        globalScope[poolKey] = pool;
    }

    return globalScope[poolKey];
}

export async function query<T extends QueryResultRow>(statement: Query): Promise<T[]> {
    const result = await getPool().query<T>(statement.text, statement.values);
    return result.rows;
}

export async function queryOne<T extends QueryResultRow>(statement: Query): Promise<T | null> {
    const rows = await query<T>(statement);
    return rows[0] ?? null;
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await getPool().connect();

    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    } finally {
        client.release();
    }
}

export async function checkDatabase(): Promise<DatabaseCheckResult> {
    const start = performance.now();

    try {
        const statement = SQL`SELECT 1`;
        await getPool().query(statement.text, statement.values);
        return { ok: true, latencyMs: Math.round(performance.now() - start) };
    } catch (error) {
        return { ok: false, latencyMs: null, error };
    }
}

export async function closeDatabase(): Promise<void> {
    const globalScope = globalThis as GlobalWithPool;
    const pool = globalScope[poolKey];

    if (!pool) {
        return;
    }

    delete globalScope[poolKey];
    await pool.end();
}
