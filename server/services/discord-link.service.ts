import { createHmac, randomInt as cryptoRandomInt } from 'node:crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import SQL from 'sql-template-strings';
import {
    DISCORD_LINK_CODE_ALPHABET,
    DISCORD_LINK_CODE_BLOCK,
    DISCORD_LINK_CODE_LENGTH,
    DISCORD_LINK_CODE_TTL_MS,
    DISCORD_LINK_COMMAND
} from '~~/shared/constants/discord';
import { SHEET_LIMIT_FREE } from '~~/shared/constants/sheet';
import type {
    DiscordClaimRequest,
    DiscordClaimResponse,
    DiscordCodeResponse,
    DiscordLinkState,
    DiscordMergePreview
} from '~~/shared/types/discord';
import { getConfig } from '../utils/config';
import { query, queryOne, withTransaction, type Query } from '../utils/database';
import { DiscordLinkError } from './discord-link-errors';
import { emitUserLinked, emitUserMerged } from './realtime.service';

export interface DiscordUserRow extends QueryResultRow {
    id: number;
    username: string | null;
    email: string | null;
    password: string | null;
    discord_id: string | null;
    avatar: string | null;
    is_premium: boolean;
    is_beta: boolean;
    last_use: Date | string;
    created_at: Date | string;
}

export interface SyncCodeRow extends QueryResultRow {
    id: number;
    user_id: number;
    status: string;
    claimed_discord_id: string | null;
    claimed_discord_username: string | null;
    claimed_at: Date | string | null;
    confirmed_at: Date | string | null;
    expires_at: Date | string;
    created_at: Date | string;
}

interface SheetNameRow extends QueryResultRow {
    sheet_name: string;
}

interface CountRow extends QueryResultRow {
    total: string | number;
}

interface ClaimRow extends QueryResultRow {
    user_id: number;
    username: string | null;
}

interface ConfigRow extends QueryResultRow {
    id: number;
}

type QueryRunner = <T extends QueryResultRow>(statement: Query) => Promise<T[]>;
type QueryOneRunner = <T extends QueryResultRow>(statement: Query) => Promise<T | null>;

interface ConfirmResult {
    botUserId: number | null;
    discordId: string;
    discordUsername: string | null;
}

const CODE_ATTEMPTS = 3;

function toIso(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new Error('Data inválida no vínculo do Discord');
    }

    return date.toISOString();
}

function requireCount(value: string | number, field: string): number {
    const count = Number(value);

    if (!Number.isFinite(count) || count < 0) {
        throw new Error(`Contagem inválida em ${field}`);
    }

    return Math.trunc(count);
}

function isUniqueViolation(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505');
}

export function generateSyncCode(random: (max: number) => number = cryptoRandomInt): string {
    let code = '';

    for (let index = 0; index < DISCORD_LINK_CODE_LENGTH; index += 1) {
        code += DISCORD_LINK_CODE_ALPHABET[random(DISCORD_LINK_CODE_ALPHABET.length)];
    }

    return code;
}

export function normalizeSyncCode(value: string): string | null {
    const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (normalized.length !== DISCORD_LINK_CODE_LENGTH) {
        return null;
    }

    for (const character of normalized) {
        if (!DISCORD_LINK_CODE_ALPHABET.includes(character)) {
            return null;
        }
    }

    return normalized;
}

export function formatSyncCode(code: string): string {
    const groups: string[] = [];

    for (let index = 0; index < code.length; index += DISCORD_LINK_CODE_BLOCK) {
        groups.push(code.slice(index, index + DISCORD_LINK_CODE_BLOCK));
    }

    return groups.join('-');
}

export function hashSyncCode(secret: string, code: string): string {
    return createHmac('sha256', secret).update(code).digest('hex');
}

export function findDuplicateSheetNames(siteNames: string[], botNames: string[]): string[] {
    const counts = new Map<string, number>();

    for (const name of [...siteNames, ...botNames]) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
    }

    return [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([name]) => name)
        .sort((left, right) => left.localeCompare(right, 'pt-BR'));
}

function resolveSyncCodeSecret(): string {
    const config = getConfig();

    return config.syncCodeSecret ?? config.sessionSecret;
}

async function findSiteUser(runQueryOne: QueryOneRunner, userId: number): Promise<DiscordUserRow | null> {
    return runQueryOne<DiscordUserRow>(SQL`
        SELECT id, username, email, password, discord_id, avatar, is_premium, is_beta, last_use, created_at
        FROM users
        WHERE id = ${userId}
        LIMIT 1
    `);
}

async function findBotUser(runQueryOne: QueryOneRunner, discordId: string): Promise<DiscordUserRow | null> {
    return runQueryOne<DiscordUserRow>(SQL`
        SELECT id, username, email, password, discord_id, avatar, is_premium, is_beta, last_use, created_at
        FROM users
        WHERE discord_id = ${discordId}
        LIMIT 1
    `);
}

async function findBotUserForUpdate(runQueryOne: QueryOneRunner, discordId: string): Promise<DiscordUserRow | null> {
    return runQueryOne<DiscordUserRow>(SQL`
        SELECT id, username, email, password, discord_id, avatar, is_premium, is_beta, last_use, created_at
        FROM users
        WHERE discord_id = ${discordId}
        FOR UPDATE
    `);
}

async function listSheetNames(runQuery: QueryRunner, userId: number): Promise<string[]> {
    const rows = await runQuery<SheetNameRow>(SQL`
        SELECT sheet_name
        FROM sheets
        WHERE user_id = ${userId}
        ORDER BY id
    `);

    return rows.map(row => row.sheet_name);
}

async function countRows(runQueryOne: QueryOneRunner, statement: Query, field: string): Promise<number> {
    const row = await runQueryOne<CountRow>(statement);

    return row ? requireCount(row.total, field) : 0;
}

async function buildPreview(
    site: DiscordUserRow,
    code: SyncCodeRow,
    runQuery: QueryRunner,
    runQueryOne: QueryOneRunner
): Promise<DiscordMergePreview> {
    const discordId = code.claimed_discord_id;

    if (!discordId) {
        throw new DiscordLinkError(
            'discord_code_invalid',
            409,
            'O código ainda não foi confirmado no Discord. Gere um novo código e tente novamente.'
        );
    }

    const bot = await findBotUser(runQueryOne, discordId);
    const siteNames = await listSheetNames(runQuery, site.id);
    const botNames = bot ? await listSheetNames(runQuery, bot.id) : [];
    const duplicateSheetNames = findDuplicateSheetNames(siteNames, botNames);
    const isPremium = site.is_premium || Boolean(bot?.is_premium);
    const combinedSheets = siteNames.length + botNames.length;
    const sheetLimit = isPremium ? null : SHEET_LIMIT_FREE;
    const fullAccount = Boolean(bot && (bot.email || bot.password));

    return {
        siteUsername: site.username ?? 'sua conta',
        discordId,
        discordUsername: code.claimed_discord_username,
        botAccountExists: Boolean(bot),
        botUserId: bot?.id ?? null,
        botSheets: botNames.length,
        botLiveSheets: bot
            ? await countRows(
                  runQueryOne,
                  SQL`SELECT COUNT(DISTINCT sheet_id) AS total FROM irt_sheets WHERE user_id = ${bot.id}`,
                  'irt_sheets'
              )
            : 0,
        siteSheets: siteNames.length,
        combinedSheets,
        sheetLimit,
        exceedsSheetLimit: sheetLimit !== null && combinedSheets > sheetLimit,
        duplicateSheetNames,
        canMerge: !fullAccount && duplicateSheetNames.length === 0,
        blockedReason: fullAccount ? 'full_account' : null
    };
}

async function buildState(
    site: DiscordUserRow,
    code: SyncCodeRow | null,
    runQuery: QueryRunner,
    runQueryOne: QueryOneRunner
): Promise<DiscordLinkState> {
    if (site.discord_id) {
        const lastConfirmed = await runQueryOne<SyncCodeRow>(SQL`
            SELECT id, user_id, status, claimed_discord_id, claimed_discord_username, claimed_at, confirmed_at,
                   expires_at, created_at
            FROM site_sync_codes
            WHERE user_id = ${site.id}
              AND status = 'confirmed'
              AND claimed_discord_id = ${site.discord_id}
            ORDER BY id DESC
            LIMIT 1
        `);

        return {
            status: 'linked',
            discordId: site.discord_id,
            discordUsername: lastConfirmed?.claimed_discord_username ?? null,
            expiresAt: null,
            preview: null
        };
    }

    if (!code) {
        return {
            status: 'unlinked',
            discordId: null,
            discordUsername: null,
            expiresAt: null,
            preview: null
        };
    }

    if (code.status === 'claimed') {
        return {
            status: 'claimed',
            discordId: code.claimed_discord_id,
            discordUsername: code.claimed_discord_username,
            expiresAt: toIso(code.expires_at),
            preview: await buildPreview(site, code, runQuery, runQueryOne)
        };
    }

    return {
        status: 'pending',
        discordId: null,
        discordUsername: null,
        expiresAt: toIso(code.expires_at),
        preview: null
    };
}

async function findActiveCode(runQueryOne: QueryOneRunner, userId: number): Promise<SyncCodeRow | null> {
    return runQueryOne<SyncCodeRow>(SQL`
        SELECT id, user_id, status, claimed_discord_id, claimed_discord_username, claimed_at, confirmed_at,
               expires_at, created_at
        FROM site_sync_codes
        WHERE user_id = ${userId}
          AND status IN ('pending', 'claimed')
          AND expires_at > NOW()
        ORDER BY id DESC
        LIMIT 1
    `);
}

async function expireStaleCodes(userId: number): Promise<void> {
    await query(SQL`
        UPDATE site_sync_codes
        SET status = 'cancelled'
        WHERE user_id = ${userId}
          AND status IN ('pending', 'claimed')
          AND expires_at <= NOW()
    `);
}

function createClientRunners(client: PoolClient): { runQuery: QueryRunner; runQueryOne: QueryOneRunner } {
    const runQuery: QueryRunner = async statement => {
        const result = await client.query(statement.text, statement.values);
        return result.rows;
    };
    const runQueryOne: QueryOneRunner = async statement => {
        const result = await client.query(statement.text, statement.values);
        return result.rows[0] ?? null;
    };

    return { runQuery, runQueryOne };
}

export function createDiscordLinkService() {
    async function getState(userId: number): Promise<DiscordLinkState> {
        const site = await findSiteUser(queryOne, userId);

        if (!site) {
            throw new DiscordLinkError('discord_link_unavailable', 404, 'Conta não encontrada.');
        }

        if (!site.discord_id) {
            await expireStaleCodes(userId);
        }

        const code = site.discord_id ? null : await findActiveCode(queryOne, userId);

        return buildState(site, code, query, queryOne);
    }

    async function createCode(userId: number): Promise<DiscordCodeResponse> {
        const site = await findSiteUser(queryOne, userId);

        if (!site) {
            throw new DiscordLinkError('discord_link_unavailable', 404, 'Conta não encontrada.');
        }

        if (site.discord_id) {
            throw new DiscordLinkError('discord_already_linked', 409, 'Sua conta já está vinculada a um Discord.');
        }

        const secret = resolveSyncCodeSecret();

        for (let attempt = 1; attempt <= CODE_ATTEMPTS; attempt += 1) {
            const code = generateSyncCode();
            const codeHash = hashSyncCode(secret, code);
            const expiresAt = new Date(Date.now() + DISCORD_LINK_CODE_TTL_MS);

            try {
                await withTransaction(async client => {
                    const { runQuery } = createClientRunners(client);

                    await runQuery(SQL`
                        DELETE FROM site_sync_codes
                        WHERE user_id = ${userId}
                          AND status = 'cancelled'
                    `);
                    await runQuery(SQL`
                        UPDATE site_sync_codes
                        SET status = 'cancelled'
                        WHERE user_id = ${userId}
                          AND status IN ('pending', 'claimed')
                    `);
                    await runQuery(SQL`
                        INSERT INTO site_sync_codes (user_id, code_hash, status, expires_at)
                        VALUES (${userId}, ${codeHash}, 'pending', ${expiresAt.toISOString()})
                    `);
                });

                return {
                    code,
                    formattedCode: formatSyncCode(code),
                    command: `/${DISCORD_LINK_COMMAND} ${formatSyncCode(code)}`,
                    expiresAt: expiresAt.toISOString()
                };
            } catch (error) {
                if (!isUniqueViolation(error) || attempt === CODE_ATTEMPTS) {
                    throw error;
                }
            }
        }

        throw new DiscordLinkError(
            'discord_link_unavailable',
            503,
            'Não foi possível gerar um código agora. Tente novamente.'
        );
    }

    async function cancelCode(userId: number): Promise<void> {
        await query(SQL`
            UPDATE site_sync_codes
            SET status = 'cancelled'
            WHERE user_id = ${userId}
              AND status IN ('pending', 'claimed')
        `);
    }

    async function claimCode(input: DiscordClaimRequest): Promise<DiscordClaimResponse> {
        const normalized = normalizeSyncCode(input.code);

        if (!normalized) {
            throw new DiscordLinkError(
                'discord_code_invalid',
                400,
                'Código inválido ou expirado. Gere um novo código no site.'
            );
        }

        const codeHash = hashSyncCode(resolveSyncCodeSecret(), normalized);
        const discordUsername = input.discordUsername?.trim().slice(0, 64) || null;
        const claimed = await queryOne<ClaimRow>(SQL`
            WITH claimed AS (
                UPDATE site_sync_codes
                SET status = 'claimed',
                    claimed_discord_id = ${input.discordId},
                    claimed_discord_username = ${discordUsername},
                    claimed_at = NOW()
                WHERE code_hash = ${codeHash}
                  AND status = 'pending'
                  AND expires_at > NOW()
                RETURNING user_id
            )
            SELECT c.user_id, u.username
            FROM claimed c
            INNER JOIN users u ON u.id = c.user_id
            LIMIT 1
        `);

        if (claimed) {
            return {
                ok: true,
                siteUsername: claimed.username ?? 'sua conta'
            };
        }

        const repeated = await queryOne<ClaimRow>(SQL`
            SELECT c.user_id, u.username
            FROM site_sync_codes c
            INNER JOIN users u ON u.id = c.user_id
            WHERE c.code_hash = ${codeHash}
              AND c.status = 'claimed'
              AND c.claimed_discord_id = ${input.discordId}
              AND c.expires_at > NOW()
            LIMIT 1
        `);

        if (repeated) {
            return {
                ok: true,
                siteUsername: repeated.username ?? 'sua conta'
            };
        }

        throw new DiscordLinkError(
            'discord_code_invalid',
            400,
            'Código inválido ou expirado. Gere um novo código no site.'
        );
    }

    async function confirm(userId: number): Promise<DiscordLinkState> {
        let result: ConfirmResult;

        try {
            result = await withTransaction<ConfirmResult>(async client => {
                const { runQuery, runQueryOne } = createClientRunners(client);

                const code = await runQueryOne<SyncCodeRow>(SQL`
                SELECT id, user_id, status, claimed_discord_id, claimed_discord_username, claimed_at, confirmed_at,
                       expires_at, created_at
                FROM site_sync_codes
                WHERE user_id = ${userId}
                  AND status = 'claimed'
                  AND expires_at > NOW()
                ORDER BY id DESC
                LIMIT 1
                FOR UPDATE
            `);

                if (!code || !code.claimed_discord_id) {
                    throw new DiscordLinkError(
                        'discord_code_invalid',
                        409,
                        'Nenhum código confirmado foi encontrado. Gere um novo código e confirme no Discord.'
                    );
                }

                const site = await runQueryOne<DiscordUserRow>(SQL`
                SELECT id, username, email, password, discord_id, avatar, is_premium, is_beta, last_use, created_at
                FROM users
                WHERE id = ${userId}
                FOR UPDATE
            `);

                if (!site) {
                    throw new DiscordLinkError('discord_link_unavailable', 404, 'Conta não encontrada.');
                }

                if (site.discord_id) {
                    throw new DiscordLinkError(
                        'discord_already_linked',
                        409,
                        'Sua conta já está vinculada a um Discord.'
                    );
                }

                const discordId = code.claimed_discord_id;
                const bot = await findBotUserForUpdate(runQueryOne, discordId);
                const preview = await buildPreview(site, code, runQuery, runQueryOne);

                if (preview.blockedReason === 'full_account') {
                    throw new DiscordLinkError(
                        'discord_full_account',
                        409,
                        'Essa conta do bot também é uma conta do site. Peça ajuda no servidor de suporte para fazer o merge manualmente.'
                    );
                }

                if (preview.duplicateSheetNames.length > 0) {
                    throw new DiscordLinkError(
                        'discord_duplicate_sheet_names',
                        409,
                        'Existem fichas com nomes repetidos. Renomeie uma delas no site ou no bot antes de vincular as contas.',
                        preview.duplicateSheetNames
                    );
                }

                let botUserId: number | null = null;

                if (bot) {
                    if (bot.id === site.id) {
                        throw new DiscordLinkError('discord_already_linked', 409, 'Sua conta já está vinculada.');
                    }

                    botUserId = bot.id;
                    const botMacroCount = await countRows(
                        runQueryOne,
                        SQL`SELECT COUNT(*) AS total FROM macros WHERE user_id = ${bot.id}`,
                        'macros'
                    );

                    await runQuery(SQL`UPDATE sheets SET user_id = ${site.id} WHERE user_id = ${bot.id}`);
                    await runQuery(SQL`UPDATE irt_sheets SET user_id = ${site.id} WHERE user_id = ${bot.id}`);
                    await runQuery(SQL`UPDATE macros SET user_id = ${site.id} WHERE user_id = ${bot.id}`);
                    await runQuery(SQL`UPDATE blocked_users SET user_id = ${site.id} WHERE user_id = ${bot.id}`);
                    await runQuery(SQL`UPDATE logs SET user_id = ${site.id} WHERE user_id = ${bot.id}`);

                    await runQuery(SQL`
                    INSERT INTO announcements_seen (user_id, announcement_id, first_seen, last_seen_date)
                    SELECT ${site.id}, announcement_id, first_seen, last_seen_date
                    FROM announcements_seen
                    WHERE user_id = ${bot.id}
                    ON CONFLICT (user_id, announcement_id) DO UPDATE
                    SET first_seen = LEAST(announcements_seen.first_seen, EXCLUDED.first_seen),
                        last_seen_date = GREATEST(announcements_seen.last_seen_date, EXCLUDED.last_seen_date)
                `);
                    await runQuery(SQL`DELETE FROM announcements_seen WHERE user_id = ${bot.id}`);

                    const siteConfig = await runQueryOne<ConfigRow>(SQL`
                    SELECT id FROM users_config WHERE user_id = ${site.id} LIMIT 1
                `);

                    if (siteConfig) {
                        await runQuery(SQL`DELETE FROM users_config WHERE user_id = ${bot.id}`);
                    } else {
                        await runQuery(SQL`UPDATE users_config SET user_id = ${site.id} WHERE user_id = ${bot.id}`);
                    }

                    await runQuery(SQL`DELETE FROM site_sessions WHERE user_id = ${bot.id}`);
                    await runQuery(SQL`
                    UPDATE site_sync_codes
                    SET status = 'cancelled'
                    WHERE user_id = ${bot.id}
                      AND status IN ('pending', 'claimed')
                `);
                    await runQuery(SQL`UPDATE users SET discord_id = NULL WHERE id = ${bot.id}`);

                    const snapshot = {
                        fromUser: {
                            id: bot.id,
                            username: bot.username,
                            discord_id: bot.discord_id,
                            avatar: bot.avatar,
                            is_beta: bot.is_beta,
                            is_premium: bot.is_premium,
                            last_use: toIso(bot.last_use),
                            created_at: toIso(bot.created_at)
                        },
                        counts: {
                            sheets: preview.botSheets,
                            macros: botMacroCount,
                            liveSheets: preview.botLiveSheets
                        },
                        mergedAt: new Date().toISOString()
                    };

                    await runQuery(SQL`
                    INSERT INTO site_account_merges (from_user_id, to_user_id, discord_id, snapshot)
                    VALUES (${bot.id}, ${site.id}, ${discordId}, ${JSON.stringify(snapshot)}::jsonb)
                `);

                    await runQuery(SQL`
                    UPDATE users
                    SET discord_id = ${discordId},
                        avatar = COALESCE(avatar, ${bot.avatar}),
                        is_premium = ${site.is_premium || bot.is_premium},
                        is_beta = ${site.is_beta || bot.is_beta},
                        last_use = GREATEST(last_use, ${bot.last_use}),
                        created_at = LEAST(created_at, ${bot.created_at})
                    WHERE id = ${site.id}
                `);
                    await runQuery(SQL`DELETE FROM users WHERE id = ${bot.id}`);
                } else {
                    await runQuery(SQL`
                    UPDATE users
                    SET discord_id = ${discordId},
                        last_use = NOW()
                    WHERE id = ${site.id}
                `);
                }

                await runQuery(SQL`
                UPDATE site_sync_codes
                SET status = 'confirmed',
                    confirmed_at = NOW()
                WHERE id = ${code.id}
            `);

                return {
                    botUserId,
                    discordId,
                    discordUsername: code.claimed_discord_username
                };
            });
        } catch (error) {
            if (isUniqueViolation(error)) {
                throw new DiscordLinkError(
                    'discord_already_linked',
                    409,
                    'Este Discord já está vinculado a outra conta do site.'
                );
            }

            throw error;
        }

        emitUserLinked(userId, result.discordId, result.discordUsername);

        if (result.botUserId !== null) {
            emitUserMerged(result.botUserId, userId, result.discordId);
        }

        return getState(userId);
    }

    return {
        getState,
        createCode,
        cancelCode,
        claimCode,
        confirm
    };
}

export const discordLinkService = createDiscordLinkService();
