import type { QueryResultRow } from 'pg';
import SQL from 'sql-template-strings';
import type { SheetAttributes, SheetDetail, SheetRenameInput, SheetUpdateInput } from '~~/shared/types/sheet';
import {
    createEmptySheetAttributes,
    normalizeSheetAttributes,
    normalizeSheetLayout,
    sheetNameSchema
} from '../schemas/sheet';
import { queryOne } from '../utils/database';
import {
    InvalidSheetError,
    SheetConflictError,
    SheetLiveError,
    SheetNameTakenError,
    SheetNotFoundError
} from './sheet-errors';

export interface SheetRow extends QueryResultRow {
    id: number;
    sheet_name: string;
    is_public: boolean;
    legacy: boolean;
    attributes: unknown;
    sheet_layout: unknown;
    last_use: Date | string;
    created_at: Date | string;
    is_live: boolean;
}

export interface ExistingSheetRow extends QueryResultRow {
    id: number;
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

export interface SheetDependencies {
    findSheet: (userId: number, sheetId: number) => Promise<SheetRow | null>;
    findSheetName: (userId: number, name: string, excludeSheetId: number) => Promise<ExistingSheetRow | null>;
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
    deleteSheetRecord: (userId: number, sheetId: number, version: string) => Promise<number | null>;
}

const COPY_NAME_MAX_ATTEMPTS = 1000;

function toIso(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new Error('Data inválida na ficha');
    }

    return date.toISOString();
}

function toDetail(row: SheetRow): SheetDetail {
    const isLegacy = Boolean(row.legacy);
    const attributes = normalizeSheetAttributes(row.attributes, isLegacy);

    return {
        id: row.id,
        name: row.sheet_name,
        isPublic: Boolean(row.is_public),
        isLegacy,
        isLive: Boolean(row.is_live),
        version: toIso(row.last_use),
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.last_use),
        attributes,
        layout: normalizeSheetLayout(row.sheet_layout, attributes.sections)
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
                    s.sheet_name,
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
                    sheet_name,
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
                  AND NOT EXISTS (SELECT 1 FROM irt_sheets i WHERE i.sheet_id = s.id)
                  AND date_trunc('milliseconds', s.last_use) = ${input.version}::timestamptz
                RETURNING
                    s.id,
                    s.sheet_name,
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
                  AND NOT EXISTS (SELECT 1 FROM irt_sheets i WHERE i.sheet_id = s.id)
                  AND date_trunc('milliseconds', s.last_use) = ${input.version}::timestamptz
                RETURNING
                    s.id,
                    s.sheet_name,
                    s.is_public,
                    s.legacy,
                    s.attributes,
                    s.sheet_layout,
                    date_trunc('milliseconds', s.last_use) AS last_use,
                    s.created_at,
                    EXISTS (SELECT 1 FROM irt_sheets i WHERE i.sheet_id = s.id) AS is_live
            `));
    const deleteSheetRecord =
        dependencies.deleteSheetRecord ??
        (async (userId: number, sheetId: number, version: string) => {
            const row = await queryOne<ExistingSheetRow>(SQL`
                DELETE FROM sheets s
                WHERE s.id = ${sheetId}
                  AND s.user_id = ${userId}
                  AND NOT EXISTS (SELECT 1 FROM irt_sheets i WHERE i.sheet_id = s.id)
                  AND date_trunc('milliseconds', s.last_use) = ${version}::timestamptz
                RETURNING s.id
            `);

            return row?.id ?? null;
        });

    async function requireEditable(userId: number, sheetId: number): Promise<SheetRow> {
        const row = await findSheet(userId, sheetId);

        if (!row) {
            throw new SheetNotFoundError();
        }

        if (row.is_live) {
            throw new SheetLiveError();
        }

        return row;
    }

    async function requireAvailableName(userId: number, name: string, excludeSheetId = 0): Promise<void> {
        const existing = await findSheetName(userId, name, excludeSheetId);

        if (existing) {
            throw new SheetNameTakenError();
        }
    }

    async function diagnoseWriteFailure(userId: number, sheetId: number): Promise<never> {
        const row = await findSheet(userId, sheetId);

        if (!row) {
            throw new SheetNotFoundError();
        }

        if (row.is_live) {
            throw new SheetLiveError();
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

    async function createSheet(userId: number, name: string): Promise<SheetDetail> {
        const sheetName = requireSheetName(name);
        await requireAvailableName(userId, sheetName);

        const attributes: SheetAttributes = createEmptySheetAttributes();
        const row = await insertSheet(userId, sheetName, attributes, false, false, null);

        if (!row) {
            throw new Error('Ficha não criada');
        }

        return toDetail(row);
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

        return toDetail(row);
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

        return toDetail(row);
    }

    async function deleteSheet(userId: number, sheetId: number, version: string): Promise<void> {
        await requireEditable(userId, sheetId);

        const deletedId = await deleteSheetRecord(userId, sheetId, version);

        if (deletedId === null) {
            return diagnoseWriteFailure(userId, sheetId);
        }
    }

    async function duplicateSheet(userId: number, sheetId: number): Promise<SheetDetail> {
        const source = await findSheet(userId, sheetId);

        if (!source) {
            throw new SheetNotFoundError();
        }

        const name = await findAvailableCopyName(userId, source.sheet_name);
        const attributes = parseStoredAttributes(source.attributes);
        const normalized = normalizeSheetAttributes(source.attributes, Boolean(source.legacy));
        const layout = normalizeSheetLayout(source.sheet_layout, normalized.sections);
        const row = await insertSheet(userId, name, attributes, Boolean(source.legacy), false, layout);

        if (!row) {
            throw new Error('Ficha não duplicada');
        }

        return toDetail(row);
    }

    return { getSheet, createSheet, updateSheet, renameSheet, deleteSheet, duplicateSheet };
}

export const sheetService = createSheetService();
