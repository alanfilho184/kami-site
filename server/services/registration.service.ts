import { hash as hashBcrypt } from 'bcryptjs';
import type { QueryResultRow } from 'pg';
import SQL from 'sql-template-strings';
import type { AuthUser } from '~~/shared/types/auth';
import { queryOne } from '../utils/database';
import { EmailAlreadyRegisteredError, UsernameAlreadyTakenError } from './user-errors';

export { EmailAlreadyRegisteredError, UsernameAlreadyTakenError } from './user-errors';

export interface ExistingUserRow extends QueryResultRow {
    id: number;
}

export interface RegisteredUserRow extends QueryResultRow {
    id: number;
    username: string | null;
    email: string | null;
}

export interface RegistrationDependencies {
    findByEmail: (email: string) => Promise<ExistingUserRow | null>;
    findByUsername: (username: string) => Promise<ExistingUserRow | null>;
    insertUser: (username: string, email: string, passwordHash: string) => Promise<RegisteredUserRow | null>;
    hash: (password: string) => Promise<string>;
}

function isUniqueViolation(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505');
}

function uniqueConstraint(error: unknown): string | null {
    if (!error || typeof error !== 'object') {
        return null;
    }

    const constraint = (error as { constraint?: unknown }).constraint;
    return typeof constraint === 'string' ? constraint : null;
}

export function createRegistrationService(dependencies: Partial<RegistrationDependencies> = {}) {
    const findByEmail =
        dependencies.findByEmail ??
        ((email: string) =>
            queryOne<ExistingUserRow>(SQL`
                SELECT id
                FROM users
                WHERE lower(email) = lower(${email})
                LIMIT 1
            `));
    const findByUsername =
        dependencies.findByUsername ??
        ((username: string) =>
            queryOne<ExistingUserRow>(SQL`
                SELECT id
                FROM users
                WHERE lower(username) = lower(${username})
                LIMIT 1
            `));
    const insertUser =
        dependencies.insertUser ??
        ((username: string, email: string, passwordHash: string) =>
            queryOne<RegisteredUserRow>(SQL`
                INSERT INTO users (username, email, password, terms_accepted_at)
                VALUES (${username}, ${email}, ${passwordHash}, NOW())
                RETURNING id, username, email
            `));
    const hash = dependencies.hash ?? ((password: string) => hashBcrypt(password, 12));

    async function register(username: string, email: string, password: string): Promise<AuthUser> {
        const [existingEmail, existingUsername] = await Promise.all([findByEmail(email), findByUsername(username)]);

        if (existingUsername) {
            throw new UsernameAlreadyTakenError();
        }

        if (existingEmail) {
            throw new EmailAlreadyRegisteredError();
        }

        const passwordHash = await hash(password);

        try {
            const user = await insertUser(username, email, passwordHash);

            if (!user) {
                throw new Error('Cadastro não retornou usuário');
            }

            return {
                id: user.id,
                username: user.username,
                email: user.email,
                isPremium: false
            };
        } catch (error) {
            if (isUniqueViolation(error)) {
                const constraint = uniqueConstraint(error);

                if (constraint === 'users_username_key') {
                    throw new UsernameAlreadyTakenError();
                }

                if (constraint === 'users_email_key') {
                    throw new EmailAlreadyRegisteredError();
                }
            }

            throw error;
        }
    }

    return { register };
}

export const registrationService = createRegistrationService();
