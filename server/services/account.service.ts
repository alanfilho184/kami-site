import { compare as compareBcrypt, hash as hashBcrypt } from 'bcryptjs';
import type { QueryResultRow } from 'pg';
import SQL from 'sql-template-strings';
import type { PanelAccount } from '~~/shared/types/panel';
import { queryOne } from '../utils/database';
import { toAccount, type AccountRow } from './panel.service';
import { InvalidCurrentPasswordError, UsernameAlreadyTakenError } from './user-errors';

export interface ExistingUsernameRow extends QueryResultRow {
    id: number;
}

export interface PasswordRow extends QueryResultRow {
    password: string | null;
}

export interface AccountDependencies {
    findUsername: (username: string, userId: number) => Promise<ExistingUsernameRow | null>;
    updateUsername: (userId: number, username: string) => Promise<AccountRow | null>;
    findPassword: (userId: number) => Promise<PasswordRow | null>;
    updatePassword: (userId: number, passwordHash: string) => Promise<unknown>;
    hash: (password: string) => Promise<string>;
    compare: (password: string, hash: string) => Promise<boolean>;
}

function isUniqueViolation(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505');
}

export function createAccountService(dependencies: Partial<AccountDependencies> = {}) {
    const findUsername =
        dependencies.findUsername ??
        ((username: string, userId: number) =>
            queryOne<ExistingUsernameRow>(SQL`
                SELECT id
                FROM users
                WHERE lower(username) = lower(${username})
                  AND id <> ${userId}
                LIMIT 1
            `));
    const updateUsername =
        dependencies.updateUsername ??
        ((userId: number, username: string) =>
            queryOne<AccountRow>(SQL`
                UPDATE users
                SET username = ${username}
                WHERE id = ${userId}
                RETURNING id, username, email, avatar, created_at, discord_id
            `));
    const findPassword =
        dependencies.findPassword ??
        ((userId: number) =>
            queryOne<PasswordRow>(SQL`
                SELECT password
                FROM users
                WHERE id = ${userId}
                LIMIT 1
            `));
    const updatePassword =
        dependencies.updatePassword ??
        ((userId: number, passwordHash: string) =>
            queryOne(SQL`
                UPDATE users
                SET password = ${passwordHash}
                WHERE id = ${userId}
            `));
    const hash = dependencies.hash ?? ((password: string) => hashBcrypt(password, 12));
    const compare = dependencies.compare ?? compareBcrypt;

    async function changeUsername(userId: number, username: string): Promise<PanelAccount> {
        const existing = await findUsername(username, userId);

        if (existing) {
            throw new UsernameAlreadyTakenError();
        }

        try {
            const row = await updateUsername(userId, username);

            if (!row) {
                throw new Error('Conta não encontrada');
            }

            return toAccount(row);
        } catch (error) {
            if (isUniqueViolation(error)) {
                throw new UsernameAlreadyTakenError();
            }

            throw error;
        }
    }

    async function changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
        const row = await findPassword(userId);

        if (!row || !row.password) {
            throw new InvalidCurrentPasswordError();
        }

        let isValid = false;

        try {
            isValid = await compare(currentPassword, row.password);
        } catch {
            isValid = false;
        }

        if (!isValid) {
            throw new InvalidCurrentPasswordError();
        }

        const passwordHash = await hash(newPassword);
        await updatePassword(userId, passwordHash);
    }

    return { changeUsername, changePassword };
}

export const accountService = createAccountService();
