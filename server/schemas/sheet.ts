import { z } from 'zod';
import { SHEET_DESCRIPTION_MAX_LENGTH, SHEET_TEXT_MAX_LENGTH } from '~~/shared/constants/sheet';
import {
    clampAttributeRows,
    clampAttributeSpan,
    clampGalleryColumns,
    defaultAttributeSpanFor,
    SHEET_LAYOUT_COLUMNS,
    SHEET_LAYOUT_DEFAULT_SPAN,
    SHEET_LAYOUT_ROWS_MAX
} from '~~/shared/utils/sheet-layout';
import type {
    SheetAttribute,
    SheetAttributeType,
    SheetAttributes,
    SheetBarValue,
    SheetLayout,
    SheetLayoutAttribute,
    SheetLayoutColumns,
    SheetLayoutSection,
    SheetListValue,
    SheetSection,
    SheetSectionHeader,
    SheetSectionType
} from '~~/shared/types/sheet';

export const SHEET_NAME_MAX_LENGTH = 32;
export const SHEET_SECTION_NAME_MIN_LENGTH = 2;
export const SHEET_SECTION_NAME_MAX_LENGTH = 20;
export const SHEET_SECTIONS_MAX = 50;
export const SHEET_ATTRIBUTE_NAME_MIN_LENGTH = 1;
export const SHEET_ATTRIBUTE_NAME_MAX_LENGTH = 32;
export const SHEET_ATTRIBUTES_MAX = 200;
export { SHEET_DESCRIPTION_MAX_LENGTH, SHEET_TEXT_MAX_LENGTH };
export const SHEET_NUMBER_MAX_LENGTH = 32;
export const SHEET_IMAGE_MAX_LENGTH = 2048;
export const SHEET_LIST_ITEMS_MAX = 100;
export const SHEET_LIST_QUANTITY_MAX_LENGTH = 32;
export const SHEET_BAR_VALUE_MAX_DIGITS = 32;
export const SHEET_STATUS_MAX = 32;
export const SHEET_STATUS_NAME_MAX_LENGTH = 32;
export const SHEET_TABLE_COLUMNS_MIN = 2;
export const SHEET_TABLE_COLUMNS_MAX = 8;
export const SHEET_TABLE_ROWS_MAX = 100;
export const SHEET_TABLE_CELL_MAX_LENGTH = 128;

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/;
const SHEET_NAME_FORBIDDEN = /['$%]/;
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];

/**
 * O bot aceita nomes de ficha com até 32 caracteres e rejeita aspas simples,
 * cifrão e porcentagem, pois esses caracteres quebram os comandos do Discord.
 */
export const sheetNameSchema = z.preprocess(
    value => (typeof value === 'string' ? value.trim() : value),
    z
        .string()
        .min(1, 'Informe o nome da ficha')
        .max(SHEET_NAME_MAX_LENGTH, `O nome da ficha deve ter no máximo ${SHEET_NAME_MAX_LENGTH} caracteres`)
        .refine(value => !SHEET_NAME_FORBIDDEN.test(value), {
            message: 'O nome da ficha não pode conter aspas simples, cifrão ou porcentagem'
        })
);

export const sheetVersionSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'Versão da ficha inválida')
    .refine(value => !Number.isNaN(Date.parse(value)), {
        message: 'Versão da ficha inválida'
    });

const sectionNameSchema = z.preprocess(
    value => (typeof value === 'string' ? value.trim() : value),
    z
        .string()
        .min(
            SHEET_SECTION_NAME_MIN_LENGTH,
            `O nome da seção deve ter pelo menos ${SHEET_SECTION_NAME_MIN_LENGTH} caracteres`
        )
        .max(
            SHEET_SECTION_NAME_MAX_LENGTH,
            `O nome da seção deve ter no máximo ${SHEET_SECTION_NAME_MAX_LENGTH} caracteres`
        )
        .refine(value => !CONTROL_CHARACTERS.test(value), {
            message: 'O nome da seção não pode ter caracteres de controle'
        })
);

const attributeNameSchema = z.preprocess(
    value => (typeof value === 'string' ? value.trim() : value),
    z
        .string()
        .min(SHEET_ATTRIBUTE_NAME_MIN_LENGTH, 'Informe o nome do atributo')
        .max(
            SHEET_ATTRIBUTE_NAME_MAX_LENGTH,
            `O nome do atributo deve ter no máximo ${SHEET_ATTRIBUTE_NAME_MAX_LENGTH} caracteres`
        )
);

const positionSchema = z.number().int();

const barIntegerSchema = z.preprocess(
    value => (typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value.trim()) : value),
    z
        .number()
        .int()
        .refine(value => Math.abs(value) < 10 ** SHEET_BAR_VALUE_MAX_DIGITS, {
            message: `Os valores da barra devem ter no máximo ${SHEET_BAR_VALUE_MAX_DIGITS} dígitos`
        })
);

const listItemSchema = z.object({
    name: z.preprocess(
        value => (typeof value === 'string' ? value.trim() : value),
        z
            .string()
            .min(SHEET_ATTRIBUTE_NAME_MIN_LENGTH, 'Informe o nome do item')
            .max(SHEET_ATTRIBUTE_NAME_MAX_LENGTH, 'O nome do item deve ter no máximo 32 caracteres')
    ),
    quantity: z
        .string()
        .max(SHEET_LIST_QUANTITY_MAX_LENGTH, 'A quantidade deve ter no máximo 32 dígitos')
        .regex(/^\d+$/, 'A quantidade deve conter apenas dígitos')
        .refine(value => Number(value) > 0, 'A quantidade deve ser maior que zero')
});

const listValueSchema = z.object({
    items: z.array(listItemSchema).max(SHEET_LIST_ITEMS_MAX)
});

const barColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'A cor da barra deve estar no formato #rrggbb');

const barValueSchema = z
    .object({
        actual: barIntegerSchema,
        max: barIntegerSchema,
        min: barIntegerSchema,
        step: barIntegerSchema,
        color: barColorSchema.optional(),
        background: barColorSchema.optional(),
        pattern: z.enum(['solid', 'segmented']).optional(),
        flashBelow: z.number().int().min(1).max(100).optional(),
        blink: z.boolean().optional()
    })
    .superRefine((value, context) => {
        if (value.max < 1) {
            context.addIssue({
                code: 'custom',
                path: ['max'],
                message: 'O máximo da barra deve ser maior que zero'
            });
        }

        if (value.min > value.max) {
            context.addIssue({
                code: 'custom',
                path: ['min'],
                message: 'O mínimo da barra não pode ser maior que o máximo'
            });
        }

        if (value.actual < value.min || value.actual > value.max) {
            context.addIssue({
                code: 'custom',
                path: ['actual'],
                message: 'O valor atual da barra deve ficar entre o mínimo e o máximo'
            });
        }

        if (value.step < 1) {
            context.addIssue({
                code: 'custom',
                path: ['step'],
                message: 'O passo da barra deve ser pelo menos 1'
            });
        }

        if (value.step > value.max) {
            context.addIssue({
                code: 'custom',
                path: ['step'],
                message: 'O passo da barra não pode ser maior que o máximo'
            });
        }
    });

const statusItemSchema = z
    .object({
        id: z.string().min(1).max(16),
        name: z.string().min(1).max(SHEET_STATUS_NAME_MAX_LENGTH),
        color: barColorSchema,
        blink: z.boolean(),
        active: z.boolean(),
        icon: z.string().max(SHEET_IMAGE_MAX_LENGTH).optional()
    })
    .superRefine((item, context) => {
        if (item.icon && !isImageUrl(item.icon)) {
            context.addIssue({
                code: 'custom',
                path: ['icon'],
                message: 'O ícone deve ser uma URL http(s) de imagem'
            });
        }
    });

const statusValueSchema = z.object({
    items: z.array(statusItemSchema).max(SHEET_STATUS_MAX)
});

const tableValueSchema = z
    .object({
        columns: z.array(z.string().min(1).max(SHEET_ATTRIBUTE_NAME_MAX_LENGTH)).min(2).max(SHEET_TABLE_COLUMNS_MAX),
        rows: z
            .array(z.array(z.string().max(SHEET_TABLE_CELL_MAX_LENGTH)).max(SHEET_TABLE_COLUMNS_MAX))
            .max(SHEET_TABLE_ROWS_MAX)
    })
    .superRefine((value, context) => {
        value.rows.forEach((row, index) => {
            if (row.length !== value.columns.length) {
                context.addIssue({
                    code: 'custom',
                    path: ['rows', index],
                    message: 'Cada linha precisa ter o mesmo número de colunas'
                });
            }
        });
    });

function isImageUrl(value: string): boolean {
    try {
        const url = new URL(value);

        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return false;
        }

        const pathname = url.pathname.toLowerCase();
        return IMAGE_EXTENSIONS.some(extension => pathname.endsWith(extension));
    } catch {
        return false;
    }
}

const attributeBaseShape = {
    name: attributeNameSchema,
    position: positionSchema
};

const sheetAttributeSchema = z.discriminatedUnion('type', [
    z.object({
        ...attributeBaseShape,
        type: z.literal(0),
        // O limite depende do tipo da seção; ver `sheetSectionSchema`.
        value: z.string().max(SHEET_DESCRIPTION_MAX_LENGTH)
    }),
    z.object({
        ...attributeBaseShape,
        type: z.literal(1),
        value: z
            .string()
            .min(1)
            .max(SHEET_NUMBER_MAX_LENGTH)
            .regex(/^-?\d+$/, 'O número deve ser um inteiro')
    }),
    z.object({
        ...attributeBaseShape,
        type: z.literal(2),
        // Vazio é permitido no cabeçalho; a validação da URL depende do tipo da seção.
        value: z.string().max(SHEET_IMAGE_MAX_LENGTH)
    }),
    z.object({
        ...attributeBaseShape,
        type: z.literal(3),
        value: listValueSchema
    }),
    z.object({
        ...attributeBaseShape,
        type: z.literal(4),
        value: barValueSchema
    }),
    z.object({
        ...attributeBaseShape,
        type: z.literal(5),
        value: statusValueSchema
    }),
    z.object({
        ...attributeBaseShape,
        type: z.literal(6),
        value: tableValueSchema
    })
]);

export const sheetSectionSchema = z
    .object({
        name: sectionNameSchema,
        type: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
        position: positionSchema,
        attributes: z.array(sheetAttributeSchema).max(SHEET_ATTRIBUTES_MAX)
    })
    .superRefine((section, context) => {
        if (section.type === 1) {
            if (section.attributes.length > 1) {
                context.addIssue({
                    code: 'custom',
                    path: ['attributes'],
                    message: 'A seção de descrição aceita apenas um texto'
                });
            }

            section.attributes.forEach((attribute, index) => {
                if (attribute.type !== 0) {
                    context.addIssue({
                        code: 'custom',
                        path: ['attributes', index, 'type'],
                        message: 'A seção de descrição aceita apenas texto'
                    });
                }
            });

            return;
        }

        if (section.type === 3) {
            if (section.attributes.length > 1 || (section.attributes[0] && section.attributes[0].type !== 5)) {
                context.addIssue({
                    code: 'custom',
                    path: ['attributes'],
                    message: 'A seção de status aceita apenas um conjunto de status'
                });
            }

            return;
        }

        if (section.type === 4) {
            section.attributes.forEach((attribute, index) => {
                if (attribute.type !== 2) {
                    context.addIssue({
                        code: 'custom',
                        path: ['attributes', index, 'type'],
                        message: 'A galeria aceita apenas imagens'
                    });
                }
            });

            return;
        }

        if (section.type === 5) {
            if (section.attributes.length > 1 || (section.attributes[0] && section.attributes[0].type !== 6)) {
                context.addIssue({
                    code: 'custom',
                    path: ['attributes'],
                    message: 'A seção de tabela aceita apenas uma tabela'
                });
            }

            return;
        }

        const isHeader = section.type === 2;

        section.attributes.forEach((attribute, index) => {
            if (attribute.type === 5 || attribute.type === 6) {
                context.addIssue({
                    code: 'custom',
                    path: ['attributes', index, 'type'],
                    message: 'Este atributo só existe em seções próprias'
                });
                return;
            }

            if (attribute.type === 0) {
                if (!isHeader && attribute.value.length === 0) {
                    context.addIssue({
                        code: 'custom',
                        path: ['attributes', index, 'value'],
                        message: 'O texto do atributo não pode ficar vazio'
                    });
                }

                if (attribute.value.length > SHEET_TEXT_MAX_LENGTH) {
                    context.addIssue({
                        code: 'custom',
                        path: ['attributes', index, 'value'],
                        message: `O texto do atributo deve ter no máximo ${SHEET_TEXT_MAX_LENGTH} caracteres`
                    });
                }

                return;
            }

            if (attribute.type === 2) {
                if (isHeader && attribute.value.length === 0) {
                    return;
                }

                if (!isImageUrl(attribute.value)) {
                    context.addIssue({
                        code: 'custom',
                        path: ['attributes', index, 'value'],
                        message: 'A imagem deve ser uma URL http(s) com extensão .png, .jpg, .jpeg, .gif, .svg ou .webp'
                    });
                }
            }
        });
    });

export const sheetAttributesSchema = z.object({
    sections: z.array(sheetSectionSchema).max(SHEET_SECTIONS_MAX)
});

const layoutColumnsSchema = z.number().int().min(1).max(SHEET_LAYOUT_COLUMNS);
const layoutSpanSchema = z.number().int().min(1).max(SHEET_LAYOUT_COLUMNS);
const layoutRowsSchema = z.number().int().min(1).max(SHEET_LAYOUT_ROWS_MAX);
const layoutHeaderNameSchema = z.string().min(1).max(SHEET_ATTRIBUTE_NAME_MAX_LENGTH);

const layoutHeaderSchema = z.object({
    title: layoutHeaderNameSchema.optional(),
    subtitle: layoutHeaderNameSchema.optional(),
    image: layoutHeaderNameSchema.optional(),
    imageWidth: layoutColumnsSchema.optional(),
    titleSize: z.number().int().min(32).max(96).optional()
});

/** Aceita o formato antigo (só largura) e o atual (`span` + `rows`). */
const layoutAttributeSchema = z
    .union([
        z.number().int().min(1).max(SHEET_LAYOUT_COLUMNS),
        z.object({
            span: layoutColumnsSchema,
            rows: layoutRowsSchema
        })
    ])
    .transform(attribute => (typeof attribute === 'number' ? { span: attribute, rows: 1 } : attribute));

export const sheetLayoutSchema = z
    .object({
        sections: z.record(
            z.string().min(1).max(SHEET_SECTION_NAME_MAX_LENGTH),
            z.object({
                columns: layoutColumnsSchema,
                rows: layoutRowsSchema.optional(),
                dense: z.boolean().optional(),
                header: layoutHeaderSchema.optional(),
                full: z
                    .array(z.string().min(1).max(SHEET_ATTRIBUTE_NAME_MAX_LENGTH))
                    .max(SHEET_ATTRIBUTES_MAX)
                    .optional(),
                attributes: z
                    .record(z.string().min(1).max(SHEET_ATTRIBUTE_NAME_MAX_LENGTH), layoutAttributeSchema)
                    .optional(),
                span: layoutSpanSchema.optional()
            })
        )
    })
    .superRefine((value, context) => {
        for (const [sectionName, section] of Object.entries(value.sections)) {
            for (const [attributeName, attribute] of Object.entries(section.attributes ?? {})) {
                if (attribute.span > section.columns) {
                    context.addIssue({
                        code: 'custom',
                        path: ['sections', sectionName, 'attributes', attributeName, 'span'],
                        message: 'A largura do atributo não pode passar das colunas da seção'
                    });
                }

                if (attribute.rows > (section.rows ?? 1)) {
                    context.addIssue({
                        code: 'custom',
                        path: ['sections', sectionName, 'attributes', attributeName, 'rows'],
                        message: 'A altura do atributo não pode passar das linhas da seção'
                    });
                }
            }
        }
    });

export const createSheetSchema = z.object({
    name: sheetNameSchema
});

export const updateSheetSchema = z.object({
    name: sheetNameSchema,
    attributes: sheetAttributesSchema,
    layout: sheetLayoutSchema.nullish(),
    version: sheetVersionSchema
});

export const patchSheetSchema = z.object({
    name: sheetNameSchema,
    version: sheetVersionSchema,
    attributes: sheetAttributesSchema.optional(),
    layout: sheetLayoutSchema.nullish()
});

export const deleteSheetSchema = z.object({
    version: sheetVersionSchema
});

export const SHEET_PASSWORD_MIN_LENGTH = 4;
export const SHEET_PASSWORD_MAX_LENGTH = 64;

export const sheetSharingSchema = z.object({
    version: sheetVersionSchema,
    isPublic: z.boolean(),
    password: z.string().min(SHEET_PASSWORD_MIN_LENGTH).max(SHEET_PASSWORD_MAX_LENGTH).nullish()
});

export type CreateSheetInput = z.infer<typeof createSheetSchema>;
export type UpdateSheetInput = z.infer<typeof updateSheetSchema>;
export type PatchSheetInput = z.infer<typeof patchSheetSchema>;
export type DeleteSheetInput = z.infer<typeof deleteSheetSchema>;
export type SheetSharingSchemaInput = z.infer<typeof sheetSharingSchema>;

export function createEmptySheetAttributes(): SheetAttributes {
    return {
        sections: [
            {
                name: 'Info',
                type: 0,
                position: 0,
                attributes: []
            }
        ]
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toText(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value);
}

function toInteger(value: unknown, fallback: number): number {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }

    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function toPosition(value: unknown, fallback: number): number {
    return toInteger(value, fallback);
}

function toSectionType(value: unknown): SheetSectionType {
    const parsed = typeof value === 'number' ? value : Number(value);

    if (parsed === 1 || parsed === 2 || parsed === 3 || parsed === 4 || parsed === 5) {
        return parsed;
    }

    return 0;
}

function toAttributeType(value: unknown): SheetAttributeType {
    const parsed = typeof value === 'number' ? value : Number(value);

    if (parsed === 1 || parsed === 2 || parsed === 3 || parsed === 4 || parsed === 5 || parsed === 6) {
        return parsed;
    }

    return 0;
}

function normalizeQuantity(value: unknown): string {
    if (typeof value === 'string' && value.length > 0) {
        return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(Math.trunc(value));
    }

    return '1';
}

function normalizeListValue(value: unknown): SheetListValue {
    const source = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.items) ? value.items : [];

    return {
        items: source.map(item => {
            if (isRecord(item)) {
                return {
                    name: toText(item.name),
                    quantity: normalizeQuantity(item.quantity)
                };
            }

            return {
                name: toText(item),
                quantity: '1'
            };
        })
    };
}

function toBarColor(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const color = value.trim().toLowerCase();

    return /^#[0-9a-f]{6}$/.test(color) ? color : undefined;
}

function normalizeBarValue(value: unknown): SheetBarValue {
    const source = isRecord(value) ? value : {};
    const color = toBarColor(source.color);
    const background = toBarColor(source.background);
    const pattern = source.pattern === 'segmented' || source.pattern === 'dotted' ? 'segmented' : undefined;
    const parsedFlash = toInteger(source.flashBelow, 0);
    const flashBelow = parsedFlash >= 1 && parsedFlash <= 100 ? parsedFlash : undefined;

    return {
        actual: toInteger(source.actual, 0),
        max: toInteger(source.max, 0),
        min: toInteger(source.min, 0),
        step: toInteger(source.step, 1),
        ...(color ? { color } : {}),
        ...(background ? { background } : {}),
        ...(pattern ? { pattern } : {}),
        ...(flashBelow !== undefined ? { flashBelow } : {}),
        ...(source.blink === false ? { blink: false } : {})
    };
}

function normalizeStatusValue(value: unknown): SheetStatusValue {
    const source = isRecord(value) ? value : {};
    const rawItems = Array.isArray(source.items) ? source.items : [];

    return {
        items: rawItems.slice(0, SHEET_STATUS_MAX).map((item, index) => {
            const entry = isRecord(item) ? item : {};
            const color = toBarColor(entry.color);
            const id = toText(entry.id).trim().slice(0, 16) || `status-${index + 1}`;
            const name = toText(entry.name).trim().slice(0, SHEET_STATUS_NAME_MAX_LENGTH);

            return {
                id,
                name: name || `Status ${index + 1}`,
                color: color ?? '#0082ff',
                blink: entry.blink === true,
                active: entry.active === true,
                icon: toText(entry.icon).trim().slice(0, SHEET_IMAGE_MAX_LENGTH)
            };
        })
    };
}

function normalizeTableValue(value: unknown): SheetTableValue {
    const source = isRecord(value) ? value : {};
    const rawColumns = Array.isArray(source.columns) ? source.columns : [];
    const columns = rawColumns
        .slice(0, SHEET_TABLE_COLUMNS_MAX)
        .map(
            (column, index) => toText(column).trim().slice(0, SHEET_ATTRIBUTE_NAME_MAX_LENGTH) || `Coluna ${index + 1}`
        );

    while (columns.length < SHEET_TABLE_COLUMNS_MIN) {
        columns.push(`Coluna ${columns.length + 1}`);
    }

    const rows = Array.isArray(source.rows)
        ? source.rows.slice(0, SHEET_TABLE_ROWS_MAX).map(row => {
              const cells = Array.isArray(row) ? row : [];

              return columns.map((_, index) => toText(cells[index]).slice(0, SHEET_TABLE_CELL_MAX_LENGTH));
          })
        : [];

    return { columns, rows };
}

function normalizeAttributeValue(type: SheetAttributeType, value: unknown): SheetAttribute['value'] {
    if (type === 3) {
        return normalizeListValue(value);
    }

    if (type === 4) {
        return normalizeBarValue(value);
    }

    if (type === 5) {
        return normalizeStatusValue(value);
    }

    if (type === 6) {
        return normalizeTableValue(value);
    }

    return toText(value);
}

function normalizeAttribute(entry: unknown, position: number): SheetAttribute {
    const attribute = isRecord(entry) ? entry : {};
    const type = toAttributeType(attribute.type);

    return {
        name: toText(attribute.name),
        type,
        position,
        value: normalizeAttributeValue(type, attribute.value)
    };
}

function normalizeSection(entry: unknown, position: number): SheetSection {
    const section = isRecord(entry) ? entry : {};
    const rawAttributes = Array.isArray(section.attributes) ? section.attributes : [];
    const name = toText(section.name).trim() || 'Info';
    const ordered = rawAttributes
        .map((attribute, index) => ({
            attribute,
            index,
            position: toPosition(isRecord(attribute) ? attribute.position : undefined, index)
        }))
        .sort((left, right) => left.position - right.position || left.index - right.index);

    return {
        name,
        type: toSectionType(section.type),
        position,
        attributes: ordered.map((item, index) => normalizeAttribute(item.attribute, index))
    };
}

function parseRawAttributes(value: unknown): unknown {
    if (typeof value !== 'string') {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function toLegacyText(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }

    if (typeof value === 'string') {
        return value;
    }

    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return '';
        }
    }

    return String(value);
}

function normalizeLegacyAttributes(value: unknown): SheetAttributes {
    if (!isRecord(value)) {
        return createEmptySheetAttributes();
    }

    const attributes: SheetAttribute[] = Object.entries(value).map(([name, content], position) => ({
        name,
        type: 0,
        position,
        value: toLegacyText(content)
    }));

    return {
        sections: [
            {
                name: 'Info',
                type: 0,
                position: 0,
                attributes
            }
        ]
    };
}

/**
 * Converte o JSONB da ficha no formato tipado do editor. Na leitura nunca
 * lança: fichas antigas e valores fora do formato viram atributos de texto ou
 * estruturas vazias.
 */
export function normalizeSheetAttributes(value: unknown, legacy = false): SheetAttributes {
    const raw = parseRawAttributes(value);

    if (legacy || !isRecord(raw) || !Array.isArray(raw.sections)) {
        return normalizeLegacyAttributes(raw);
    }

    if (raw.sections.length === 0) {
        return createEmptySheetAttributes();
    }

    const ordered = raw.sections
        .map((section, index) => ({
            section,
            index,
            position: toPosition(isRecord(section) ? section.position : undefined, index)
        }))
        .sort((left, right) => left.position - right.position || left.index - right.index);

    return {
        sections: ordered.map((item, position) => normalizeSection(item.section, position))
    };
}

function toLayoutColumns(value: unknown): SheetLayoutColumns {
    const parsed = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(parsed)) {
        return 1;
    }

    return Math.min(SHEET_LAYOUT_COLUMNS, Math.max(1, Math.trunc(parsed)));
}

function toLayoutSpan(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(parsed)) {
        return SHEET_LAYOUT_DEFAULT_SPAN;
    }

    return Math.min(SHEET_LAYOUT_COLUMNS, Math.max(1, Math.trunc(parsed)));
}

/** `undefined` mantém a altura automática; qualquer número liga a grade explícita. */
function toLayoutRows(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
        return undefined;
    }

    const parsed = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(parsed)) {
        return undefined;
    }

    return Math.min(SHEET_LAYOUT_ROWS_MAX, Math.max(1, Math.trunc(parsed)));
}

/** Lê o formato atual (`{ span, rows }`) e o antigo (número = só largura). */
function toLayoutAttribute(value: unknown): SheetLayoutAttribute | null {
    if (!isRecord(value)) {
        if (typeof value !== 'number' && typeof value !== 'string') {
            return null;
        }

        const span = Number(value);

        return Number.isFinite(span) ? { span, rows: 1 } : null;
    }

    const span = Number(value.span);
    const rows = value.rows === undefined || value.rows === '' ? 1 : Number(value.rows);

    if (!Number.isFinite(span) || !Number.isFinite(rows)) {
        return null;
    }

    return { span, rows };
}

/**
 * Papéis do cabeçalho: só sobrevivem os nomes que existem na seção e têm o
 * tipo certo (título/subtítulo texto, imagem imagem).
 */
function toLayoutHeader(value: unknown, attributes: Map<string, SheetAttributeType>): SheetSectionHeader | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const title = typeof value.title === 'string' && attributes.get(value.title) === 0 ? value.title : undefined;
    const subtitle =
        typeof value.subtitle === 'string' && attributes.get(value.subtitle) === 0 ? value.subtitle : undefined;
    const image = typeof value.image === 'string' && attributes.get(value.image) === 2 ? value.image : undefined;

    if (!title && !subtitle && !image) {
        return undefined;
    }

    const imageWidth = Number(value.imageWidth);
    const titleSize = Number(value.titleSize);

    return {
        ...(title ? { title } : {}),
        ...(subtitle ? { subtitle } : {}),
        ...(image ? { image } : {}),
        ...(Number.isFinite(imageWidth) ? { imageWidth: Math.min(12, Math.max(1, Math.trunc(imageWidth))) } : {}),
        ...(Number.isFinite(titleSize) ? { titleSize: Math.min(96, Math.max(32, Math.trunc(titleSize))) } : {})
    };
}

/**
 * Mantém apenas o layout que aponta para seções e atributos existentes. Na
 * leitura nunca lança: dados fora do formato viram `null` e a ficha usa o
 * layout padrão.
 */
export function normalizeSheetLayout(value: unknown, sections: SheetSection[]): SheetLayout | null {
    const raw = typeof value === 'string' ? parseRawAttributes(value) : value;

    if (!isRecord(raw) || !isRecord(raw.sections)) {
        return null;
    }

    const known = new Map(
        sections.map(section => [
            section.name,
            {
                type: section.type,
                attributes: new Map(section.attributes.map(attribute => [attribute.name, attribute.type]))
            }
        ])
    );
    const result: Record<string, SheetLayoutSection> = {};

    for (const [sectionName, entry] of Object.entries(raw.sections)) {
        const knownSection = known.get(sectionName);

        if (!knownSection || !isRecord(entry)) {
            continue;
        }

        const knownAttributes = knownSection.attributes;
        const isGallery = knownSection.type === 4;
        const columns = isGallery
            ? clampGalleryColumns(toLayoutColumns(entry.columns))
            : toLayoutColumns(entry.columns);
        const rows = isGallery ? undefined : toLayoutRows(entry.rows);
        const dense = isGallery ? false : entry.dense === true;
        const span = toLayoutSpan(entry.span);
        const header = knownSection.type === 2 ? toLayoutHeader(entry.header, knownAttributes) : undefined;
        const attributes: Record<string, SheetLayoutAttribute> = {};

        const applyAttribute = (name: unknown, rawAttribute: unknown): void => {
            if (typeof name !== 'string') {
                return;
            }

            const type = knownAttributes.get(name);
            const parsed = toLayoutAttribute(rawAttribute);

            if (type === undefined || !parsed) {
                return;
            }

            const attributeSpan = clampAttributeSpan(parsed.span, columns);
            const attributeRows = clampAttributeRows(parsed.rows, rows ?? 1);

            if (attributeSpan !== defaultAttributeSpanFor(knownSection.type, type, columns) || attributeRows !== 1) {
                attributes[name] = { span: attributeSpan, rows: attributeRows };
            }
        };

        if (Array.isArray(entry.full)) {
            for (const name of entry.full) {
                applyAttribute(name, { span: columns, rows: 1 });
            }
        }

        if (isRecord(entry.attributes)) {
            for (const [name, rawAttribute] of Object.entries(entry.attributes)) {
                applyAttribute(name, rawAttribute);
            }
        }

        if (
            columns === 1 &&
            rows === undefined &&
            !dense &&
            !header &&
            span === SHEET_LAYOUT_DEFAULT_SPAN &&
            Object.keys(attributes).length === 0
        ) {
            continue;
        }

        result[sectionName] = {
            columns,
            ...(rows !== undefined ? { rows } : {}),
            ...(dense ? { dense } : {}),
            ...(header ? { header } : {}),
            attributes,
            span
        };
    }

    return Object.keys(result).length ? { sections: result } : null;
}
