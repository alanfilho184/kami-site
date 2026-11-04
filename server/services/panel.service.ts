import type { QueryResultRow } from 'pg';
import SQL from 'sql-template-strings';
import type {
    LiveSheetItem,
    MacroListItem,
    PanelAccount,
    PanelResponse,
    PanelSummary,
    SheetListItem
} from '~~/shared/types/panel';
import { query, queryOne } from '../utils/database';

export interface AccountRow extends QueryResultRow {
    id: number;
    username: string | null;
    email: string | null;
    avatar: string | null;
    created_at: Date;
    discord_id: string | null;
}

export interface SummaryRow extends QueryResultRow {
    sheets: string | number;
    public_sheets: string | number;
    live_sheets: string | number;
    macros: string | number;
}

export interface SheetRow extends QueryResultRow {
    id: number;
    user_id: number;
    sheet_name: string;
    is_public: boolean;
    legacy: boolean;
    last_use: Date;
    is_live: boolean;
}

export interface LiveSheetRow extends QueryResultRow {
    id: number;
    sheet_id: number;
    sheet_name: string;
    channel_id: string;
    msg_id: string;
    last_use: Date;
}

export interface MacroRow extends QueryResultRow {
    id: number;
    macro_name: string;
    is_public: boolean;
    last_use: Date;
}

export interface PanelDependencies {
    findAccount: (userId: number) => Promise<AccountRow | null>;
    findSummary: (userId: number) => Promise<SummaryRow | null>;
    findSheets: (userId: number, limit: number) => Promise<SheetRow[]>;
    findLiveSheets: (userId: number, limit: number) => Promise<LiveSheetRow[]>;
    findMacros: (userId: number, limit: number) => Promise<MacroRow[]>;
}

function requireCount(value: string | number, field: string): number {
    const count = Number(value);

    if (!Number.isFinite(count) || count < 0) {
        throw new Error(`Contagem inválida em ${field}`);
    }

    return Math.trunc(count);
}

function clampLimit(value: number, maximum = 100): number {
    return Math.min(Math.max(Math.trunc(value), 1), maximum);
}

function toIso(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new Error('Data inválida no painel');
    }

    return date.toISOString();
}

export function toAccount(row: AccountRow): PanelAccount {
    return {
        id: row.id,
        username: row.username,
        email: row.email,
        avatar: row.avatar,
        createdAt: toIso(row.created_at),
        discordLinked: Boolean(row.discord_id)
    };
}

function toSheet(row: SheetRow): SheetListItem {
    return {
        id: row.id,
        userId: row.user_id,
        name: row.sheet_name,
        isPublic: row.is_public,
        isLegacy: row.legacy,
        isLive: row.is_live,
        updatedAt: toIso(row.last_use)
    };
}

function toLiveSheet(row: LiveSheetRow): LiveSheetItem {
    return {
        id: row.id,
        sheetId: row.sheet_id,
        sheetName: row.sheet_name,
        channelId: row.channel_id,
        messageId: row.msg_id,
        lastUse: toIso(row.last_use)
    };
}

function toMacro(row: MacroRow): MacroListItem {
    return {
        id: row.id,
        name: row.macro_name,
        isPublic: row.is_public,
        updatedAt: toIso(row.last_use)
    };
}

function normalizeSummary(row: SummaryRow): PanelSummary {
    return {
        sheets: requireCount(row.sheets, 'sheets'),
        publicSheets: requireCount(row.public_sheets, 'public_sheets'),
        liveSheets: requireCount(row.live_sheets, 'live_sheets'),
        macros: requireCount(row.macros, 'macros')
    };
}

export function createPanelService(dependencies: Partial<PanelDependencies> = {}) {
    const findAccount =
        dependencies.findAccount ??
        ((userId: number) =>
            queryOne<AccountRow>(SQL`
                SELECT id, username, email, avatar, created_at, discord_id
                FROM users
                WHERE id = ${userId}
                LIMIT 1
            `));
    const findSummary =
        dependencies.findSummary ??
        ((userId: number) =>
            queryOne<SummaryRow>(SQL`
                SELECT
                    (SELECT COUNT(*) FROM sheets WHERE user_id = ${userId}) AS sheets,
                    (SELECT COUNT(*) FROM sheets WHERE user_id = ${userId} AND is_public) AS public_sheets,
                    (
                        SELECT COUNT(DISTINCT s.id)
                        FROM sheets s
                        INNER JOIN irt_sheets i ON i.sheet_id = s.id
                        WHERE s.user_id = ${userId}
                    ) AS live_sheets,
                    (SELECT COUNT(*) FROM macros WHERE user_id = ${userId}) AS macros
            `));
    const findSheets =
        dependencies.findSheets ??
        ((userId: number, limit: number) =>
            query<SheetRow>(SQL`
                SELECT
                    s.id,
                    s.user_id,
                    s.sheet_name,
                    s.is_public,
                    s.legacy,
                    s.last_use,
                    EXISTS (SELECT 1 FROM irt_sheets i WHERE i.sheet_id = s.id) AS is_live
                FROM sheets s
                WHERE s.user_id = ${userId}
                ORDER BY s.last_use DESC
                LIMIT ${clampLimit(limit)}
            `));
    const findLiveSheets =
        dependencies.findLiveSheets ??
        ((userId: number, limit: number) =>
            query<LiveSheetRow>(SQL`
                SELECT i.id, i.sheet_id, s.sheet_name, i.channel_id, i.msg_id, i.last_use
                FROM irt_sheets i
                INNER JOIN sheets s ON s.id = i.sheet_id
                WHERE s.user_id = ${userId}
                ORDER BY i.last_use DESC
                LIMIT ${clampLimit(limit)}
            `));
    const findMacros =
        dependencies.findMacros ??
        ((userId: number, limit: number) =>
            query<MacroRow>(SQL`
                SELECT id, macro_name, is_public, last_use
                FROM macros
                WHERE user_id = ${userId}
                ORDER BY last_use DESC
                LIMIT ${clampLimit(limit)}
            `));

    async function getAccount(userId: number): Promise<PanelAccount> {
        const row = await findAccount(userId);

        if (!row) {
            throw new Error('Conta não encontrada');
        }

        return toAccount(row);
    }

    async function getOverview(userId: number): Promise<PanelResponse> {
        const [accountRow, summaryRow, recentRows] = await Promise.all([
            findAccount(userId),
            findSummary(userId),
            findSheets(userId, 5)
        ]);

        if (!accountRow || !summaryRow) {
            throw new Error('Painel sem dados da conta');
        }

        return {
            account: toAccount(accountRow),
            summary: normalizeSummary(summaryRow),
            recentSheets: recentRows.map(toSheet)
        };
    }

    async function getSheets(userId: number, limit = 100): Promise<SheetListItem[]> {
        const rows = await findSheets(userId, limit);
        return rows.map(toSheet);
    }

    async function getLiveSheets(userId: number, limit = 100): Promise<LiveSheetItem[]> {
        const rows = await findLiveSheets(userId, limit);
        return rows.map(toLiveSheet);
    }

    async function getMacros(userId: number, limit = 100): Promise<MacroListItem[]> {
        const rows = await findMacros(userId, limit);
        return rows.map(toMacro);
    }

    return { getAccount, getOverview, getSheets, getLiveSheets, getMacros };
}

export const panelService = createPanelService();
