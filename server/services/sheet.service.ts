import type { QueryResultRow } from 'pg';
import { hash as hashBcrypt } from 'bcryptjs';
import SQL from 'sql-template-strings';
import { SHEET_LIMIT_FREE } from '~~/shared/constants/sheet';
import type {
    SheetAttributes,
    SheetDetail,
    SheetQuota,
    SheetRenameInput,
    SheetSharingInput,
    SheetUpdateInput
} from '~~/shared/types/sheet';
import type { SheetDeletedIrtMessage } from '~~/shared/types/realtime';
import {
    createEmptySheetAttributes,
    normalizeSheetAttributes,
    normalizeSheetLayout,
    sheetNameSchema
} from '../schemas/sheet';
import { query, queryOne, withTransaction } from '../utils/database';
import {
    emitSheetAccessChanged,
    emitSheetCreated,
    emitSheetDeleted,
    emitSheetUnpublished,
    emitSheetUpdated
} from './realtime.service';
import {
    InvalidSheetError,
    SheetConflictError,
    SheetLimitError,
    SheetNameTakenError,
    SheetNotFoundError
} from './sheet-errors';

export interface SheetRow extends QueryResultRow {
    id: number;
    user_id: number;
    sheet_name: string;
    sheet_password: string | null;
    is_public: boolean;
    legacy: boolean;
    attributes: unknown;
    sheet_layout: unknown;
    last_use: Date | string;
    created_at: Date | string;
    is_live: boolean;
    creator_name?: string | null;
}

export interface ExistingSheetRow extends QueryResultRow {
    id: number;
}

export interface IrtSheetRow extends QueryResultRow {
    channel_id: string;
    msg_id: string;
}

export interface SheetCountRow extends QueryResultRow {
    total: string | number;
}

export interface UpdateSheetRecordInput {
    name: string;
    attributes: unknown;
    layout: unknown;
    version: string;
}

export interface RenameSheetRecordInput {
    name: string;
    version: string;
}

export interface UpdateSheetSharingRecordInput {
    isPublic: boolean;
    password: string | null;
    version: string;
}

export interface SheetDependencies {
    findSheet: (userId: number, sheetId: number) => Promise<SheetRow | null>;
    findSheetByName: (userId: number, name: string) => Promise<SheetRow | null>;
    findSheetName: (userId: number, name: string, excludeSheetId: number) => Promise<ExistingSheetRow | null>;
    countSheets: (userId: number) => Promise<number>;
    insertSheet: (
        userId: number,
        name: string,
        attributes: unknown,
        legacy: boolean,
        isPublic: boolean,
        layout?: unknown
    ) => Promise<SheetRow | null>;
    updateSheetRecord: (userId: number, sheetId: number, input: UpdateSheetRecordInput) => Promise<SheetRow | null>;
    renameSheetRecord: (userId: number, sheetId: number, input: RenameSheetRecordInput) => Promise<SheetRow | null>;
    updateSheetSharingRecord: (
        userId: number,
        sheetId: number,
        input: UpdateSheetSharingRecordInput
    ) => Promise<SheetRow | null>;
    deleteSheetRecord: (userId: number, sheetId: number, version: string) => Promise<number | null>;
    listIrtSheets: (userId: number, sheetId: number) => Promise<IrtSheetRow[]>;
}

const COPY_NAME_MAX_ATTEMPTS = 1000;

function toIso(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new Error('Data inválida na ficha');
    }

    return date.toISOString();
}

export function toDetail(row: SheetRow): SheetDetail {
    const isLegacy = Boolean(row.legacy);
    const attributes = normalizeSheetAttributes(row.attributes, isLegacy);
    const creatorName = row.creator_name?.trim();

    return {
        id: row.id,
        userId: row.user_id,
        name: row.sheet_name,
        isPublic: Boolean(row.is_public),
        hasPassword: Boolean(row.sheet_password && row.sheet_password.length > 0),
        isLegacy,
        isLive: Boolean(row.is_live),
        version: toIso(row.last_use),
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.last_use),
        attributes,
        layout: normalizeSheetLayout(row.sheet_layout, attributes.sections),
        ...(creatorName ? { creatorName } : {})
    };
}

function requireCount(value: string | number, field: string): number {
    const count = Number(value);

    if (!Number.isFinite(count) || count < 0) {
        throw new Error(`Contagem inválida em ${field}`);
    }

    return Math.trunc(count);
}

export function buildSheetQuota(used: number, isPremium: boolean): SheetQuota {
    if (isPremium) {
        return {
            used,
            limit: null,
            remaining: null,
            isPremium: true,
            canCreate: true
        };
    }

    const remaining = Math.max(0, SHEET_LIMIT_FREE - used);

    return {
        used,
        limit: SHEET_LIMIT_FREE,
        remaining,
        isPremium: false,
        canCreate: remaining > 0
    };
}

function requireSheetName(value: string): string {
    const parsed = sheetNameSchema.safeParse(value);

    if (!parsed.success) {
        throw new InvalidSheetError(
            'Confira o nome da ficha: 1 a 32 caracteres, sem aspas simples, cifrão ou porcentagem.'
        );
    }

    return parsed.data;
}

function parseStoredAttributes(value: unknown): unknown {
    if (typeof value !== 'string') {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
}

export function buildCopyName(baseName: string, attempt: number): string {
    const suffix = attempt <= 1 ? ' (cópia)' : ` (cópia ${attempt})`;
    const available = Math.max(1, 32 - suffix.length);
    const base = baseName.slice(0, available).trim() || 'Ficha';

    return `${base}${suffix}`;
}

export function createSheetService(dependencies: Partial<SheetDependencies> = {}) {
    const findSheet =
        dependencies.findSheet ??
        ((userId: number, sheetId: number) =>
            queryOne<SheetRow>(SQL`
                SELECT
                    s.id,
                    s.user_id,
                    s.sheet_name,
                    s.sheet_password,
                    s.is_public,
                    s.legacy,
                    s.attributes,
                    s.sheet_layout,
                    date_trunc('milliseconds', s.last_use) AS last_use,
                    s.created_at,
                    EXISTS (SELECT 1 FROM irt_sheets i WHERE i.sheet_id = s.id) AS is_live
                FROM sheets s
                WHERE s.id = ${sheetId}
                  AND s.user_id = ${userId}
                LIMIT 1
            `));
    const findSheetByName =
        dependencies.findSheetByName ??
        ((userId: number, name: string) =>
            queryOne<SheetRow>(SQL`
                SELECT
                    s.id,
                    s.user_id,
                    s.sheet_name,
                    s.sheet_password,
                    s.is_public,
                    s.legacy,
                    s.attributes,
                    s.sheet_layout,
                    date_trunc('milliseconds', s.last_use) AS last_use,
                    s.created_at,
                    EXISTS (SELECT 1 FROM irt_sheets i WHERE i.sheet_id = s.id) AS is_live
                FROM sheets s
                WHERE s.user_id = ${userId}
                  AND s.sheet_name = ${name}
                ORDER BY s.id DESC
                LIMIT 1
            `));
    const findSheetName =
        dependencies.findSheetName ??
        ((userId: number, name: string, excludeSheetId: number) =>
            queryOne<ExistingSheetRow>(SQL`
                SELECT id
                FROM sheets
                WHERE user_id = ${userId}
                  AND sheet_name = ${name}
                  AND id <> ${excludeSheetId}
                LIMIT 1
            `));
    const countSheets =
        dependencies.countSheets ??
        (async (userId: number) => {
            const row = await queryOne<SheetCountRow>(SQL`
                SELECT COUNT(*) AS total
                FROM sheets
                WHERE user_id = ${userId}
            `);

            if (!row) {
                throw new Error('Contagem de fichas não retornou resultado');
            }

            return requireCount(row.total, 'sheets.total');
        });
    const insertSheet =
        dependencies.insertSheet ??
        ((userId: number, name: string, attributes: unknown, legacy: boolean, isPublic: boolean, layout?: unknown) =>
            queryOne<SheetRow>(SQL`
                INSERT INTO sheets (user_id, sheet_name, sheet_password, attributes, sheet_layout, legacy, is_public)
                VALUES (
                    ${userId},
                    ${name},
                    NULL,
                    ${JSON.stringify(attributes)}::jsonb,
                    ${layout === null || layout === undefined ? null : JSON.stringify(layout)}::jsonb,
                    ${legacy},
                    ${isPublic}
                )
                RETURNING
                    id,
                    user_id,
                    sheet_name,
                    sheet_password,
                    is_public,
                    legacy,
                    attributes,
                    sheet_layout,
                    date_trunc('milliseconds', last_use) AS last_use,
                    created_at,
                    FALSE AS is_live
            `));
    const updateSheetRecord =
        dependencies.updateSheetRecord ??
        ((userId: number, sheetId: number, input: UpdateSheetRecordInput) =>
            queryOne<SheetRow>(SQL`
                UPDATE sheets s
                SET sheet_name = ${input.name},
                    attributes = ${JSON.stringify(input.attributes)}::jsonb,
                    sheet_layout = ${input.layout === null || input.layout === undefined ? null : JSON.stringify(input.layout)}::jsonb,
                    legacy = FALSE,
                    last_use = GREATEST(
                        date_trunc('milliseconds', now()),
                        date_trunc('milliseconds', s.last_use) + interval '1 millisecond'
                    )
                WHERE s.id = ${sheetId}
                  AND s.user_id = ${userId}
                  AND date_trunc('milliseconds', s.last_use) = ${input.version}::timestamptz
                RETURNING
                    s.id,
                    s.user_id,
                    s.sheet_name,
                    s.sheet_password,
                    s.is_public,
                    s.legacy,
                    s.attributes,
                    s.sheet_layout,
                    date_trunc('milliseconds', s.last_use) AS last_use,
                    s.created_at,
                    EXISTS (SELECT 1 FROM irt_sheets i WHERE i.sheet_id = s.id) AS is_live
            `));
    const renameSheetRecord =
        dependencies.renameSheetRecord ??
        ((userId: number, sheetId: number, input: RenameSheetRecordInput) =>
            queryOne<SheetRow>(SQL`
                UPDATE sheets s
                SET sheet_name = ${input.name},
                    last_use = GREATEST(
                        date_trunc('milliseconds', now()),
                        date_trunc('milliseconds', s.last_use) + interval '1 millisecond'
                    )
                WHERE s.id = ${sheetId}
                  AND s.user_id = ${userId}
                  AND date_trunc('milliseconds', s.last_use) = ${input.version}::timestamptz
                RETURNING
                    s.id,
                    s.user_id,
                    s.sheet_name,
                    s.sheet_password,
                    s.is_public,
                    s.legacy,
                    s.attributes,
                    s.sheet_layout,
                    date_trunc('milliseconds', s.last_use) AS last_use,
                    s.created_at,
                    EXISTS (SELECT 1 FROM irt_sheets i WHERE i.sheet_id = s.id) AS is_live
            `));
    const updateSheetSharingRecord =
        dependencies.updateSheetSharingRecord ??
        ((userId: number, sheetId: number, input: UpdateSheetSharingRecordInput) =>
            queryOne<SheetRow>(SQL`
                UPDATE sheets s
                SET is_public = ${input.isPublic},
                    sheet_password = ${input.password},
                    last_use = GREATEST(
                        date_trunc('milliseconds', now()),
                        date_trunc('milliseconds', s.last_use) + interval '1 millisecond'
                    )
                WHERE s.id = ${sheetId}
                  AND s.user_id = ${userId}
                  AND date_trunc('milliseconds', s.last_use) = ${input.version}::timestamptz
                RETURNING
                    s.id,
                    s.user_id,
                    s.sheet_name,
                    s.sheet_password,
                    s.is_public,
                    s.legacy,
                    s.attributes,
                    s.sheet_layout,
                    date_trunc('milliseconds', s.last_use) AS last_use,
                    s.created_at,
                    EXISTS (SELECT 1 FROM irt_sheets i WHERE i.sheet_id = s.id) AS is_live
            `));
    const listIrtSheets =
        dependencies.listIrtSheets ??
        ((userId: number, sheetId: number) =>
            query<IrtSheetRow>(SQL`
                SELECT channel_id, msg_id
                FROM irt_sheets
                WHERE sheet_id = ${sheetId}
                  AND user_id = ${userId}
            `));

    const deleteSheetRecord =
        dependencies.deleteSheetRecord ??
        ((userId: number, sheetId: number, version: string) =>
            withTransaction(async client => {
                const lockStatement = SQL`
                    SELECT id
                    FROM sheets
                    WHERE id = ${sheetId}
                      AND user_id = ${userId}
                      AND date_trunc('milliseconds', last_use) = ${version}::timestamptz
                    FOR UPDATE
                `;
                const deleteIrtStatement = SQL`DELETE FROM irt_sheets WHERE sheet_id = ${sheetId}`;
                const deleteSheetStatement = SQL`DELETE FROM sheets WHERE id = ${sheetId}`;
                const locked = await client.query<ExistingSheetRow>(lockStatement.text, lockStatement.values);

                if (!locked.rows[0]) {
                    return null;
                }

                await client.query(deleteIrtStatement.text, deleteIrtStatement.values);
                await client.query(deleteSheetStatement.text, deleteSheetStatement.values);

                return sheetId;
            }));

    async function requireEditable(userId: number, sheetId: number): Promise<SheetRow> {
        const row = await findSheet(userId, sheetId);

        if (!row) {
            throw new SheetNotFoundError();
        }

        return row;
    }

    async function requireAvailableName(userId: number, name: string, excludeSheetId = 0): Promise<void> {
        const existing = await findSheetName(userId, name, excludeSheetId);

        if (existing) {
            throw new SheetNameTakenError();
        }
    }

    async function requireSheetQuota(userId: number, isPremium: boolean): Promise<void> {
        if (isPremium) {
            return;
        }

        const used = await countSheets(userId);

        if (used >= SHEET_LIMIT_FREE) {
            throw new SheetLimitError();
        }
    }

    async function diagnoseWriteFailure(userId: number, sheetId: number): Promise<never> {
        const row = await findSheet(userId, sheetId);

        if (!row) {
            throw new SheetNotFoundError();
        }

        throw new SheetConflictError();
    }

    async function findAvailableCopyName(userId: number, baseName: string): Promise<string> {
        for (let attempt = 1; attempt <= COPY_NAME_MAX_ATTEMPTS; attempt += 1) {
            const candidate = buildCopyName(baseName, attempt);
            const existing = await findSheetName(userId, candidate, 0);

            if (!existing) {
                return candidate;
            }
        }

        throw new Error('Não foi possível gerar um nome para a cópia');
    }

    async function getSheet(userId: number, sheetId: number): Promise<SheetDetail> {
        const row = await findSheet(userId, sheetId);

        if (!row) {
            throw new SheetNotFoundError();
        }

        return toDetail(row);
    }

    async function getSheetByName(userId: number, name: string): Promise<SheetDetail> {
        const row = await findSheetByName(userId, name);

        if (!row) {
            throw new SheetNotFoundError();
        }

        return toDetail(row);
    }

    async function createSheet(userId: number, name: string, isPremium = false): Promise<SheetDetail> {
        const sheetName = requireSheetName(name);
        await requireAvailableName(userId, sheetName);
        await requireSheetQuota(userId, isPremium);

        const attributes: SheetAttributes = createEmptySheetAttributes();
        const row = await insertSheet(userId, sheetName, attributes, false, false, null);

        if (!row) {
            throw new Error('Ficha não criada');
        }

        const detail = toDetail(row);
        emitSheetCreated(detail);
        return detail;
    }

    async function updateSheet(userId: number, sheetId: number, input: SheetUpdateInput): Promise<SheetDetail> {
        const sheetName = requireSheetName(input.name);
        await requireEditable(userId, sheetId);
        await requireAvailableName(userId, sheetName, sheetId);

        const attributes = normalizeSheetAttributes(input.attributes, false);
        const row = await updateSheetRecord(userId, sheetId, {
            name: sheetName,
            attributes,
            layout: normalizeSheetLayout(input.layout ?? null, attributes.sections),
            version: input.version
        });

        if (!row) {
            return diagnoseWriteFailure(userId, sheetId);
        }

        const detail = toDetail(row);
        emitSheetUpdated(detail);
        return detail;
    }

    async function renameSheet(userId: number, sheetId: number, input: SheetRenameInput): Promise<SheetDetail> {
        const sheetName = requireSheetName(input.name);
        await requireEditable(userId, sheetId);
        await requireAvailableName(userId, sheetName, sheetId);

        const row = await renameSheetRecord(userId, sheetId, {
            name: sheetName,
            version: input.version
        });

        if (!row) {
            return diagnoseWriteFailure(userId, sheetId);
        }

        const detail = toDetail(row);
        emitSheetUpdated(detail);
        return detail;
    }

    async function updateSheetSharing(userId: number, sheetId: number, input: SheetSharingInput): Promise<SheetDetail> {
        const current = await requireEditable(userId, sheetId);
        let password: string | null;

        if (input.password === undefined) {
            password = current.sheet_password;
        } else if (input.password === null || input.password.length === 0) {
            password = null;
        } else {
            password = await hashBcrypt(input.password, 12);
        }

        const row = await updateSheetSharingRecord(userId, sheetId, {
            isPublic: input.isPublic,
            password,
            version: input.version
        });

        if (!row) {
            return diagnoseWriteFailure(userId, sheetId);
        }

        const detail = toDetail(row);
        emitSheetUpdated(detail);

        if (current.is_public && !detail.isPublic) {
            emitSheetUnpublished(detail.id, detail.userId, detail.version, detail.name);
        } else if (detail.isPublic && input.password !== undefined) {
            emitSheetAccessChanged(detail.id, detail.userId, detail.version, detail.name);
        }

        return detail;
    }

    async function deleteSheet(userId: number, sheetId: number, version: string): Promise<void> {
        const current = await requireEditable(userId, sheetId);

        // A transação de delete apaga irt_sheets antes de sheets (FK RESTRICT).
        // Precisamos guardar os ids antes para o bot remover o botão das
        // mensagens IRT no Discord após o evento.
        const irtRows = await listIrtSheets(userId, sheetId);
        const irtSheets: SheetDeletedIrtMessage[] = irtRows.map(row => ({
            channelId: row.channel_id,
            messageId: row.msg_id
        }));

        const deletedId = await deleteSheetRecord(userId, sheetId, version);

        if (deletedId === null) {
            return diagnoseWriteFailure(userId, sheetId);
        }

        emitSheetDeleted(sheetId, userId, version, current.is_public, current.sheet_name, irtSheets);
    }

    async function duplicateSheet(userId: number, sheetId: number, isPremium = false): Promise<SheetDetail> {
        const source = await findSheet(userId, sheetId);

        if (!source) {
            throw new SheetNotFoundError();
        }

        await requireSheetQuota(userId, isPremium);

        const name = await findAvailableCopyName(userId, source.sheet_name);
        const attributes = parseStoredAttributes(source.attributes);
        const normalized = normalizeSheetAttributes(source.attributes, Boolean(source.legacy));
        const layout = normalizeSheetLayout(source.sheet_layout, normalized.sections);
        const row = await insertSheet(userId, name, attributes, Boolean(source.legacy), false, layout);

        if (!row) {
            throw new Error('Ficha não duplicada');
        }

        const detail = toDetail(row);
        emitSheetCreated(detail);
        return detail;
    }

    async function getQuota(userId: number, isPremium: boolean): Promise<SheetQuota> {
        const used = await countSheets(userId);

        return buildSheetQuota(used, isPremium);
    }

    return {
        getSheet,
        getSheetByName,
        createSheet,
        updateSheet,
        renameSheet,
        updateSheetSharing,
        deleteSheet,
        duplicateSheet,
        getQuota
    };
}

export const sheetService = createSheetService();
