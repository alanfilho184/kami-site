import { createHash, randomBytes } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import SQL from 'sql-template-strings';
import type { AuthUser } from '~~/shared/types/auth';
import { query, queryOne, type Query } from '../utils/database';
import { logger } from '../utils/logger';

export const SESSION_COOKIE_NAME = 'kami_sessao';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_REFRESH_MS = 60 * 60 * 1000;
export const SESSION_TOKEN_BYTES = 32;

export interface SessionRow extends QueryResultRow {
    session_id: number;
    last_seen_at: Date;
    expires_at: Date;
    user_id: number;
    username: string | null;
    email: string | null;
}

export interface SessionContext {
    ip: string | null;
    userAgent: string | null;
}

export interface CreatedSession {
    token: string;
    expiresAt: Date;
}

export interface FoundSession {
    user: AuthUser;
    tokenHash: string;
}

export interface SessionDependencies {
    query: (statement: Query) => Promise<unknown>;
    queryOne: (statement: Query) => Promise<SessionRow | null>;
    now: () => number;
    generateToken: () => string;
    warn: (message: string, context?: unknown) => void;
}

export function hashSessionToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

export function createSessionService(dependencies: Partial<SessionDependencies> = {}) {
    const execute = dependencies.query ?? ((statement: Query) => query(statement));
    const findRow = dependencies.queryOne ?? ((statement: Query) => queryOne<SessionRow>(statement));
    const now = dependencies.now ?? (() => Date.now());
    const generateToken = dependencies.generateToken ?? (() => randomBytes(SESSION_TOKEN_BYTES).toString('base64url'));
    const warn = dependencies.warn ?? ((message: string, context?: unknown) => logger.warn(message, context));

    async function create(userId: number, context: SessionContext): Promise<CreatedSession> {
        const token = generateToken();
        const tokenHash = hashSessionToken(token);
        const expiresAt = new Date(now() + SESSION_TTL_MS);

        await execute(SQL`
            INSERT INTO site_sessions (user_id, token_hash, expires_at, ip, user_agent)
            VALUES (${userId}, ${tokenHash}, ${expiresAt.toISOString()}, ${context.ip}, ${context.userAgent})
        `);

        return { token, expiresAt };
    }

    async function find(token: string): Promise<FoundSession | null> {
        const tokenHash = hashSessionToken(token);
        const row = await findRow(SQL`
            SELECT
                s.id AS session_id,
                s.last_seen_at,
                s.expires_at,
                u.id AS user_id,
                u.username,
                u.email
            FROM site_sessions s
            INNER JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ${tokenHash}
            LIMIT 1
        `);

        if (!row) {
            return null;
        }

        const instant = now();
        const expiresAt = new Date(row.expires_at).getTime();

        if (!Number.isFinite(expiresAt) || expiresAt <= instant) {
            try {
                await execute(SQL`DELETE FROM site_sessions WHERE token_hash = ${tokenHash}`);
            } catch (error) {
                warn('Falha ao remover sessão expirada', { error });
            }

            return null;
        }

        const lastSeenAt = new Date(row.last_seen_at).getTime();

        if (!Number.isFinite(lastSeenAt) || instant - lastSeenAt >= SESSION_REFRESH_MS) {
            try {
                await execute(SQL`
                    UPDATE site_sessions
                    SET last_seen_at = NOW()
                    WHERE token_hash = ${tokenHash}
                      AND last_seen_at < NOW() - INTERVAL '1 hour'
                `);
            } catch (error) {
                warn('Falha ao renovar last_seen_at da sessão', { error });
            }
        }

        return {
            user: {
                id: row.user_id,
                username: row.username,
                email: row.email
            },
            tokenHash
        };
    }

    async function destroy(token: string): Promise<void> {
        const tokenHash = hashSessionToken(token);
        await execute(SQL`DELETE FROM site_sessions WHERE token_hash = ${tokenHash}`);
    }

    async function cleanup(): Promise<void> {
        await execute(SQL`DELETE FROM site_sessions WHERE expires_at < NOW()`);
    }

    return { create, find, destroy, cleanup };
}

export const sessionService = createSessionService();
