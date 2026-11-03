import { compare as compareBcrypt } from 'bcryptjs';
import type { QueryResultRow } from 'pg';
import SQL from 'sql-template-strings';
import type { AuthUser } from '~~/shared/types/auth';
import { query, queryOne } from '../utils/database';
import { logger } from '../utils/logger';

/**
 * Hash descartável usado quando a conta não existe ou não tem senha. A
 * comparação mantém o tempo de resposta próximo ao de uma senha errada e evita
 * revelar a existência do e-mail.
 */
export const DUMMY_PASSWORD_HASH = '$2b$12$ZiAEDNFGsKa3V4cGHpYOrutaLwdcQn8GEjifQW43YMzBC6hFVkotm';

export interface AuthUserRow extends QueryResultRow {
    id: number;
    username: string | null;
    email: string | null;
    password: string | null;
}

export interface AuthDependencies {
    findUser: (email: string) => Promise<AuthUserRow | null>;
    markActive: (userId: number) => Promise<unknown>;
    compare: (password: string, hash: string) => Promise<boolean>;
    warn: (message: string, context?: unknown) => void;
}

export function isBcryptHash(value: string): boolean {
    return /^\$2[aby]\$/.test(value);
}

async function safeCompare(
    password: string,
    hash: string,
    compare: AuthDependencies['compare'],
    warn: AuthDependencies['warn']
): Promise<boolean> {
    try {
        return await compare(password, hash);
    } catch (error) {
        warn('Falha ao comparar hash de senha', { error });
        return false;
    }
}

export function createAuthService(dependencies: Partial<AuthDependencies> = {}) {
    const findUser =
        dependencies.findUser ??
        ((email: string) =>
            queryOne<AuthUserRow>(SQL`
                SELECT id, username, email, password
                FROM users
                WHERE lower(email) = lower(${email})
                LIMIT 1
            `));
    const markActive =
        dependencies.markActive ??
        ((userId: number) => query(SQL`UPDATE users SET last_use = NOW() WHERE id = ${userId}`));
    const compare = dependencies.compare ?? compareBcrypt;
    const warn = dependencies.warn ?? ((message: string, context?: unknown) => logger.warn(message, context));

    async function authenticate(email: string, password: string): Promise<AuthUser | null> {
        const user = await findUser(email);

        if (!user || !user.password || !isBcryptHash(user.password)) {
            await safeCompare(password, DUMMY_PASSWORD_HASH, compare, warn);
            return null;
        }

        const isValid = await safeCompare(password, user.password, compare, warn);

        if (!isValid) {
            return null;
        }

        try {
            await markActive(user.id);
        } catch (error) {
            warn('Falha ao atualizar last_use no login', { error });
        }

        return {
            id: user.id,
            username: user.username,
            email: user.email
        };
    }

    return { authenticate };
}

export const authService = createAuthService();
