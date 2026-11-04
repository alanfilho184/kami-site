<script lang="ts">
import { defineNuxtComponent, navigateTo, useHead, useRequestFetch, useRoute } from '#app';
import type { NavigationGuardNext, RouteLocationNormalized } from 'vue-router';
import type {
    SheetAttribute,
    SheetAttributeType,
    SheetAttributes,
    SheetBarValue,
    SheetDetail,
    SheetLayout,
    SheetLayoutAttribute,
    SheetLayoutColumns,
    SheetLayoutSection,
    SheetListValue,
    SheetSection,
    SheetSectionType,
    SheetStatusItem,
    SheetStatusValue,
    SheetTableValue
} from '~~/shared/types/sheet';
import { formatDateTime } from '~~/shared/utils/formatting';
import { SHEET_DESCRIPTION_MAX_LENGTH, SHEET_TEXT_MAX_LENGTH } from '~~/shared/constants/sheet';
import { errorStatus, serverErrorCode, serverErrorMessage } from '~~/shared/utils/http-error';
import {
    clampAttributeRows,
    clampAttributeSpan,
    clampGalleryColumns,
    defaultAttributeSpanFor,
    SHEET_GALLERY_COLUMNS_MAX,
    SHEET_LAYOUT_COLUMNS,
    SHEET_LAYOUT_DEFAULT_SPAN,
    SHEET_LAYOUT_ROWS_MAX
} from '~~/shared/utils/sheet-layout';
import {
    focusDialog,
    lockDialogScroll,
    rememberDialogFocus,
    restoreDialogFocus,
    trapDialogTab,
    unlockDialogScroll
} from '~/utils/dialog';

type EditorMode = 'editar' | 'posicionamento' | 'estrutura';
type EditorDialog = 'settings' | 'bar';

interface NormalizedDraft {
    name: string;
    sections: SheetSection[];
}

interface DraftSectionHeader {
    title: SheetAttribute | null;
    subtitle: SheetAttribute | null;
    image: SheetAttribute | null;
    imageWidth: number;
    titleSize: number;
}

interface DraftSectionLayout {
    columns: SheetLayoutColumns;
    /** `null` mantém a altura automática. */
    rows: number | null;
    dense: boolean;
    spans: number[];
    rowSpans: number[];
    span: number;
    header: DraftSectionHeader | null;
}

const editorModes: { value: EditorMode; label: string }[] = [
    { value: 'editar', label: 'EDITAR' },
    { value: 'posicionamento', label: 'POSICIONAMENTO' },
    { value: 'estrutura', label: 'ESTRUTURA' }
];

const attributeTypeLabels: Record<SheetAttributeType, string> = {
    0: 'TEXTO',
    1: 'NÚMERO',
    2: 'IMAGEM',
    3: 'LISTA',
    4: 'BARRA',
    5: 'STATUS',
    6: 'TABELA'
};

/** Sugestões fixas de cor para barras; o color picker aceita qualquer hex. */
const barColorPresets = [
    { value: '#ff2b1d', label: 'Vermelho' },
    { value: '#22c55e', label: 'Verde' },
    { value: '#0082ff', label: 'Azul' },
    { value: '#e6e8ee', label: 'Branco' }
];

const defaultBarColor = '#0082ff';
const defaultBarBackground = '#05070a';
const defaultBarFlashBelow = 25;

const headerDefaultImageWidth = 4;
const headerDefaultTitleSize = 56;
const headerTitleSizeMin = 32;
const headerTitleSizeMax = 96;

function clampHeaderImageWidth(value: number): number {
    return Math.min(SHEET_LAYOUT_COLUMNS, Math.max(1, Math.trunc(value)));
}

function clampHeaderTitleSize(value: number): number {
    return Math.min(headerTitleSizeMax, Math.max(headerTitleSizeMin, Math.trunc(value)));
}

/** Estilos de preenchimento disponíveis para a barra. */
const barPatterns: { value: 'solid' | 'segmented'; label: string }[] = [
    { value: 'solid', label: 'LISA' },
    { value: 'segmented', label: 'SEGMENTADA' }
];

const forbiddenName = /['$%]/;

/** A galeria nasce com três colunas; as demais seções começam sem grade explícita. */
const galleryDefaultColumns = 3;

function defaultColumnsFor(sectionType: SheetSectionType): number {
    return sectionType === 4 ? galleryDefaultColumns : 1;
}

function cloneSections(sections: SheetSection[]): SheetSection[] {
    return JSON.parse(JSON.stringify(sections)) as SheetSection[];
}

function createDraftLayout(sections: SheetSection[]): DraftSectionLayout[] {
    return sections.map(section => ({
        columns: defaultColumnsFor(section.type),
        rows: null,
        dense: false,
        spans: section.attributes.map(attribute =>
            defaultAttributeSpanFor(section.type, attribute.type, defaultColumnsFor(section.type))
        ),
        rowSpans: section.attributes.map(() => 1),
        span: SHEET_LAYOUT_DEFAULT_SPAN,
        header: null
    }));
}

function deserializeLayout(layout: SheetLayout | null, sections: SheetSection[]): DraftSectionLayout[] {
    return sections.map(section => {
        const entry = layout?.sections?.[section.name];
        const columns = entry?.columns ?? defaultColumnsFor(section.type);
        const rows = typeof entry?.rows === 'number' ? entry.rows : null;

        return {
            columns,
            rows,
            dense: entry?.dense === true,
            spans: section.attributes.map(attribute => {
                const stored = entry?.attributes?.[attribute.name];
                const legacy = entry?.full?.includes(attribute.name) ? columns : undefined;
                const value = stored?.span ?? legacy;

                return clampAttributeSpan(
                    typeof value === 'number' ? value : defaultAttributeSpanFor(section.type, attribute.type, columns),
                    columns
                );
            }),
            rowSpans: section.attributes.map(attribute => {
                const stored = entry?.attributes?.[attribute.name]?.rows;

                return clampAttributeRows(typeof stored === 'number' ? stored : 1, rows ?? 1);
            }),
            span: entry?.span ?? SHEET_LAYOUT_DEFAULT_SPAN,
            header:
                section.type === 2 && entry?.header
                    ? {
                          title:
                              section.attributes.find(
                                  attribute => attribute.name === entry.header?.title && attribute.type === 0
                              ) ?? null,
                          subtitle:
                              section.attributes.find(
                                  attribute => attribute.name === entry.header?.subtitle && attribute.type === 0
                              ) ?? null,
                          image:
                              section.attributes.find(
                                  attribute => attribute.name === entry.header?.image && attribute.type === 2
                              ) ?? null,
                          imageWidth: clampHeaderImageWidth(
                              typeof entry.header.imageWidth === 'number'
                                  ? entry.header.imageWidth
                                  : headerDefaultImageWidth
                          ),
                          titleSize: clampHeaderTitleSize(
                              typeof entry.header.titleSize === 'number'
                                  ? entry.header.titleSize
                                  : headerDefaultTitleSize
                          )
                      }
                    : null
        };
    });
}

function alignDraftLayout(layout: DraftSectionLayout[], sections: SheetSection[]): DraftSectionLayout[] {
    return sections.map((section, sectionIndex) => {
        const current = layout[sectionIndex];
        const columns = current?.columns ?? 1;
        const rows = typeof current?.rows === 'number' ? current.rows : null;

        return {
            columns,
            rows,
            dense: current?.dense === true,
            spans: section.attributes.map((attribute, attributeIndex) => {
                const value = current?.spans[attributeIndex];

                return clampAttributeSpan(
                    typeof value === 'number' ? value : defaultAttributeSpanFor(section.type, attribute.type, columns),
                    columns
                );
            }),
            rowSpans: section.attributes.map((_attribute, attributeIndex) => {
                const value = current?.rowSpans[attributeIndex];

                return clampAttributeRows(typeof value === 'number' ? value : 1, rows ?? 1);
            }),
            span: current?.span ?? SHEET_LAYOUT_DEFAULT_SPAN,
            header:
                section.type === 2 && current?.header
                    ? {
                          title:
                              current.header.title && section.attributes.includes(current.header.title)
                                  ? current.header.title
                                  : null,
                          subtitle:
                              current.header.subtitle && section.attributes.includes(current.header.subtitle)
                                  ? current.header.subtitle
                                  : null,
                          image:
                              current.header.image && section.attributes.includes(current.header.image)
                                  ? current.header.image
                                  : null,
                          imageWidth: clampHeaderImageWidth(current.header.imageWidth),
                          titleSize: clampHeaderTitleSize(current.header.titleSize)
                      }
                    : null
        };
    });
}

function serializeLayout(layout: DraftSectionLayout[], sections: SheetSection[]): SheetLayout | null {
    const normalized = normalizeDraft('', sections).sections;
    const result: Record<string, SheetLayoutSection> = {};

    normalized.forEach((section, sectionIndex) => {
        const draft = layout[sectionIndex];
        const columns =
            section.type === 4 ? clampGalleryColumns(draft?.columns ?? galleryDefaultColumns) : (draft?.columns ?? 1);
        const rows = typeof draft?.rows === 'number' ? draft.rows : undefined;
        const dense = draft?.dense === true;
        const span = draft?.span ?? SHEET_LAYOUT_DEFAULT_SPAN;
        const attributes: Record<string, SheetLayoutAttribute> = {};

        section.attributes.forEach((attribute, attributeIndex) => {
            const fallback = defaultAttributeSpanFor(section.type, attribute.type, columns);
            const rawSpan = draft?.spans[attributeIndex];
            const attributeSpan = clampAttributeSpan(typeof rawSpan === 'number' ? rawSpan : fallback, columns);
            const rawRows = draft?.rowSpans[attributeIndex];
            const attributeRows = clampAttributeRows(typeof rawRows === 'number' ? rawRows : 1, rows ?? 1);

            if (attributeSpan !== fallback || attributeRows !== 1) {
                attributes[attribute.name] = { span: attributeSpan, rows: attributeRows };
            }
        });

        const header = (() => {
            if (section.type !== 2 || !draft?.header) {
                return undefined;
            }

            const byName = new Map(section.attributes.map(attribute => [attribute.name, attribute]));
            const title =
                draft.header.title && byName.get(draft.header.title.name)?.type === 0
                    ? draft.header.title.name
                    : undefined;
            const subtitle =
                draft.header.subtitle && byName.get(draft.header.subtitle.name)?.type === 0
                    ? draft.header.subtitle.name
                    : undefined;
            const image =
                draft.header.image && byName.get(draft.header.image.name)?.type === 2
                    ? draft.header.image.name
                    : undefined;

            if (!title && !subtitle && !image) {
                return undefined;
            }

            const imageWidth = clampHeaderImageWidth(draft.header.imageWidth);
            const titleSize = clampHeaderTitleSize(draft.header.titleSize);

            return {
                ...(title ? { title } : {}),
                ...(subtitle ? { subtitle } : {}),
                ...(image ? { image } : {}),
                ...(imageWidth !== headerDefaultImageWidth ? { imageWidth } : {}),
                ...(titleSize !== headerDefaultTitleSize ? { titleSize } : {})
            };
        })();

        if (
            columns === 1 &&
            rows === undefined &&
            !dense &&
            !header &&
            span === SHEET_LAYOUT_DEFAULT_SPAN &&
            Object.keys(attributes).length === 0
        ) {
            return;
        }

        result[section.name] = {
            columns,
            ...(rows !== undefined ? { rows } : {}),
            ...(dense ? { dense } : {}),
            ...(header ? { header } : {}),
            attributes,
            span
        };
    });

    return Object.keys(result).length > 0 ? { sections: result } : null;
}

function defaultAttributeValue(type: SheetAttributeType): SheetAttribute['value'] {
    if (type === 1) {
        return '0';
    }

    if (type === 3) {
        return { items: [] };
    }

    if (type === 4) {
        return { actual: 0, max: 10, min: 0, step: 1 };
    }

    return '';
}

function normalizeDraft(name: string, sections: SheetSection[]): NormalizedDraft {
    return {
        name: name.trim(),
        sections: sections.map((section, sectionIndex) => ({
            name: section.name.trim(),
            type: section.type,
            position: sectionIndex,
            attributes: section.attributes.map((attribute, attributeIndex) => ({
                name: attribute.name.trim(),
                type: attribute.type,
                position: attributeIndex,
                value: attribute.value
            }))
        }))
    };
}

function serializeDraft(name: string, sections: SheetSection[], layout: DraftSectionLayout[]): string {
    return JSON.stringify({ ...normalizeDraft(name, sections), layout: serializeLayout(layout, sections) });
}

function isHttpImageUrl(value: string): boolean {
    try {
        const url = new URL(value);

        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return false;
        }

        return /\.(png|jpe?g|gif|svg|webp)$/i.test(url.pathname);
    } catch {
        return false;
    }
}

function validateAttributeValue(attribute: SheetAttribute, allowEmpty = false): string | null {
    const value = attribute.value;

    if (attribute.type === 0) {
        if (typeof value !== 'string' || value.length > SHEET_TEXT_MAX_LENGTH) {
            return `o texto deve ter no máximo ${SHEET_TEXT_MAX_LENGTH} caracteres.`;
        }

        if (!allowEmpty && value.length === 0) {
            return `o texto deve ter entre 1 e ${SHEET_TEXT_MAX_LENGTH} caracteres.`;
        }

        return null;
    }

    if (attribute.type === 1) {
        if (typeof value !== 'string' || !/^-?\d+$/.test(value) || value.length > 32) {
            return 'o número deve ser um inteiro de até 32 caracteres.';
        }

        return null;
    }

    if (attribute.type === 2) {
        if (typeof value !== 'string' || value.length > 2048) {
            return 'informe uma URL http(s) de imagem com extensão .png, .jpg, .jpeg, .gif, .svg ou .webp.';
        }

        if (value.length === 0) {
            return allowEmpty
                ? null
                : 'informe uma URL http(s) de imagem com extensão .png, .jpg, .jpeg, .gif, .svg ou .webp.';
        }

        if (!isHttpImageUrl(value)) {
            return 'informe uma URL http(s) de imagem com extensão .png, .jpg, .jpeg, .gif, .svg ou .webp.';
        }

        return null;
    }

    if (attribute.type === 3) {
        if (!value || typeof value !== 'object' || !Array.isArray((value as SheetListValue).items)) {
            return 'a lista está em um formato inválido.';
        }

        const items = (value as SheetListValue).items;

        if (items.length > 100) {
            return 'a lista pode ter no máximo 100 itens.';
        }

        for (const item of items) {
            const rawItem = item as { name?: unknown; quantity?: unknown };
            const itemName = typeof rawItem.name === 'string' ? rawItem.name : '';
            const quantity = typeof rawItem.quantity === 'string' ? rawItem.quantity : String(rawItem.quantity ?? '');

            if (!itemName.trim() || itemName.length > 32) {
                return 'cada item precisa de um nome de 1 a 32 caracteres.';
            }

            if (!/^\d+$/.test(quantity) || Number(quantity) <= 0 || quantity.length > 32) {
                return 'cada quantidade deve ser um número inteiro maior que zero.';
            }
        }

        return null;
    }

    if (attribute.type === 5) {
        if (!value || typeof value !== 'object' || !Array.isArray((value as SheetStatusValue).items)) {
            return 'os status estão em um formato inválido.';
        }

        const items = (value as SheetStatusValue).items;

        if (items.length > 32) {
            return 'a seção pode ter no máximo 32 status.';
        }

        for (const item of items) {
            const itemName = typeof item.name === 'string' ? item.name.trim() : '';

            if (!itemName || itemName.length > 32) {
                return 'cada status precisa de um nome de 1 a 32 caracteres.';
            }

            if (typeof item.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.color)) {
                return 'a cor de cada status deve estar no formato #rrggbb.';
            }

            if (item.icon && !isHttpImageUrl(item.icon)) {
                return 'o ícone de cada status deve ser uma URL http(s) de imagem.';
            }
        }

        return null;
    }

    if (attribute.type === 6) {
        const table = value as SheetTableValue;

        if (!table || typeof table !== 'object' || !Array.isArray(table.columns) || !Array.isArray(table.rows)) {
            return 'a tabela está em um formato inválido.';
        }

        if (table.columns.length < 2 || table.columns.length > 8) {
            return 'a tabela precisa de 2 a 8 colunas.';
        }

        if (table.rows.length > 100) {
            return 'a tabela pode ter no máximo 100 linhas.';
        }

        for (const column of table.columns) {
            if (typeof column !== 'string' || !column.trim() || column.length > 32) {
                return 'cada coluna precisa de um nome de 1 a 32 caracteres.';
            }
        }

        for (const row of table.rows) {
            if (!Array.isArray(row) || row.length !== table.columns.length) {
                return 'cada linha precisa ter o mesmo número de colunas.';
            }

            if (row.some(cell => typeof cell !== 'string' || cell.length > 128)) {
                return 'cada célula deve ser um texto de até 128 caracteres.';
            }
        }

        return null;
    }

    const bar = value as SheetBarValue;

    if (
        !bar ||
        typeof bar !== 'object' ||
        !Number.isInteger(bar.actual) ||
        !Number.isInteger(bar.max) ||
        !Number.isInteger(bar.min) ||
        !Number.isInteger(bar.step)
    ) {
        return 'a barra precisa de valores inteiros.';
    }

    if (bar.max < 1) {
        return 'o máximo da barra deve ser maior que zero.';
    }

    if (bar.min > bar.max) {
        return 'o mínimo da barra não pode ser maior que o máximo.';
    }

    if (bar.actual < bar.min || bar.actual > bar.max) {
        return 'o valor atual deve ficar entre o mínimo e o máximo.';
    }

    if (bar.step < 1 || bar.step > bar.max) {
        return 'o passo deve ser pelo menos 1 e no máximo o valor máximo.';
    }

    if (bar.color !== undefined && !/^#[0-9a-f]{6}$/i.test(bar.color)) {
        return 'a cor da barra deve estar no formato #rrggbb.';
    }

    if (bar.background !== undefined && !/^#[0-9a-f]{6}$/i.test(bar.background)) {
        return 'a cor de fundo da barra deve estar no formato #rrggbb.';
    }

    if (bar.pattern !== undefined && bar.pattern !== 'solid' && bar.pattern !== 'segmented') {
        return 'o estilo da barra é inválido.';
    }

    if (
        bar.flashBelow !== undefined &&
        (!Number.isInteger(bar.flashBelow) || bar.flashBelow < 1 || bar.flashBelow > 100)
    ) {
        return 'o limite do alerta deve ser um inteiro entre 1 e 100.';
    }

    return null;
}

function validateDraft(name: string, sections: SheetSection[]): string | null {
    const sheetName = name.trim();

    if (!sheetName) {
        return 'Informe o nome da ficha.';
    }

    if (sheetName.length > 32) {
        return 'O nome da ficha deve ter no máximo 32 caracteres.';
    }

    if (forbiddenName.test(sheetName)) {
        return 'O nome da ficha não pode conter aspas simples, cifrão ou porcentagem.';
    }

    if (sections.length === 0) {
        return 'A ficha precisa de pelo menos uma seção.';
    }

    if (sections.length > 50) {
        return 'A ficha pode ter no máximo 50 seções.';
    }

    for (const section of sections) {
        const sectionName = section.name.trim();

        if (sectionName.length < 2 || sectionName.length > 20) {
            return 'Cada seção precisa de um nome de 2 a 20 caracteres.';
        }

        if (section.type === 1) {
            if (section.attributes.length > 1) {
                return 'A seção de descrição aceita apenas um texto.';
            }

            const [description] = section.attributes;

            if (
                description &&
                (description.type !== 0 || String(description.value).length > SHEET_DESCRIPTION_MAX_LENGTH)
            ) {
                return `A descrição deve ser um texto de até ${SHEET_DESCRIPTION_MAX_LENGTH} caracteres.`;
            }

            continue;
        }

        if (section.type === 3 || section.type === 5) {
            const expected = section.type === 3 ? 5 : 6;

            if (section.attributes.length > 1 || (section.attributes[0] && section.attributes[0].type !== expected)) {
                return section.type === 3
                    ? 'A seção de status aceita apenas um conjunto de status.'
                    : 'A seção de tabela aceita apenas uma tabela.';
            }
        }

        if (section.type === 4 && section.attributes.some(attribute => attribute.type !== 2)) {
            return 'A galeria aceita apenas imagens.';
        }

        if (section.attributes.length > 200) {
            return 'Cada seção pode ter no máximo 200 atributos.';
        }

        for (const attribute of section.attributes) {
            const attributeName = attribute.name.trim();

            if (!attributeName || attributeName.length > 32) {
                return 'Cada atributo precisa de um nome de 1 a 32 caracteres.';
            }

            const valueError = validateAttributeValue(attribute, section.type === 2);

            if (valueError) {
                return `Atributo “${attributeName}”: ${valueError}`;
            }
        }
    }

    return null;
}

export default defineNuxtComponent({
    name: 'SheetEditorPage',
    setup() {
        useHead({
            title: 'Editor de ficha - Kami',
            meta: [
                {
                    name: 'description',
                    content: 'Editor de ficha do Kami.'
                },
                { name: 'robots', content: 'noindex, nofollow' }
            ]
        });
    },
    async asyncData() {
        const route = useRoute();
        const rawId = route.params.id;
        const sheetId = Number(Array.isArray(rawId) ? rawId[0] : rawId);

        if (!Number.isInteger(sheetId) || sheetId <= 0) {
            return { sheet: null, needsLogin: false, notFound: true, isUnavailable: false };
        }

        const requestFetch = useRequestFetch();

        try {
            const sheet = await requestFetch<SheetDetail>(`/api/fichas/${sheetId}`);
            return { sheet, needsLogin: false, notFound: false, isUnavailable: false };
        } catch (error) {
            const status = errorStatus(error);
            return {
                sheet: null,
                needsLogin: status === 401,
                notFound: status === 404,
                isUnavailable: status !== 401 && status !== 404
            };
        }
    },
    data() {
        return {
            sheet: null as SheetDetail | null,
            needsLogin: false,
            notFound: false,
            isUnavailable: false,
            name: '',
            sections: [] as SheetSection[],
            layout: [] as DraftSectionLayout[],
            mode: 'editar' as EditorMode,
            modes: editorModes,
            columnOptions: Array.from({ length: SHEET_LAYOUT_COLUMNS }, (_, index) => index + 1),
            galleryColumnOptions: Array.from({ length: SHEET_GALLERY_COLUMNS_MAX }, (_, index) => index + 1),
            rowOptions: Array.from({ length: SHEET_LAYOUT_ROWS_MAX }, (_, index) => index + 1),
            barColorPresets,
            barPatterns,
            descriptionMaxLength: SHEET_DESCRIPTION_MAX_LENGTH,
            spanOptions: [12, 8, 6, 4, 3],
            activeSectionIndex: 0,
            structureFilter: '',
            settingsOpen: false,
            barSettingsAttribute: null as SheetAttribute | null,
            isMobileViewport: false,
            readingScrollY: 0,
            sharingPublic: false,
            sharingPassword: '',
            sharingRemovePassword: false,
            sharingSaving: false,
            sharingError: '',
            sharingNotice: '',
            expandedLists: [] as SheetAttribute[],
            dragSectionIndex: null as number | null,
            dragOverSectionIndex: null as number | null,
            dragAttributeIndex: null as number | null,
            dragOverAttributeIndex: null as number | null,
            dragStructureFrom: null as { section: number; attribute: number } | null,
            dragStructureOver: null as { section: number; attribute: number } | null,
            savedSnapshot: '',
            isSaving: false,
            isReloading: false,
            isDeleting: false,
            showDeleteConfirm: false,
            conflict: false,
            liveBlocked: false,
            brokenImages: [] as string[],
            errorMessage: '',
            successMessage: ''
        };
    },
    computed: {
        isLive(): boolean {
            return Boolean(this.sheet?.isLive);
        },
        isLegacy(): boolean {
            return Boolean(this.sheet?.isLegacy);
        },
        displayName(): string {
            return this.name.trim() || this.sheet?.name || 'FICHA';
        },
        activeSection(): SheetSection | null {
            return this.sections[this.activeSectionIndex] ?? null;
        },
        lastSaved(): string {
            return this.sheet ? formatDateTime(this.sheet.updatedAt) : '-';
        },
        hasChanges(): boolean {
            return Boolean(this.sheet) && serializeDraft(this.name, this.sections, this.layout) !== this.savedSnapshot;
        },
        canSave(): boolean {
            return this.hasChanges && !this.isSaving && !this.liveBlocked;
        },
        previewAttributes(): SheetAttributes {
            const draft = normalizeDraft(this.name, this.sections);

            return { sections: draft.sections };
        },
        previewLayout(): SheetLayout | null {
            return serializeLayout(this.layout, this.sections);
        },
        activeLayout(): DraftSectionLayout {
            return this.layoutOf(this.activeSectionIndex);
        },
        descriptionText(): string {
            if (this.activeSection?.type !== 1) {
                return '';
            }

            const [attribute] = this.activeSection.attributes;

            return attribute && attribute.type === 0 ? String(attribute.value) : '';
        },
        activeHeader(): DraftSectionHeader | null {
            return this.activeSection?.type === 2 ? this.layoutOf(this.activeSectionIndex).header : null;
        },
        headerTitle(): SheetAttribute | null {
            return this.activeHeader?.title ?? null;
        },
        headerSubtitle(): SheetAttribute | null {
            return this.activeHeader?.subtitle ?? null;
        },
        headerImage(): SheetAttribute | null {
            return this.activeHeader?.image ?? null;
        },
        activeAttributeEntries(): { attribute: SheetAttribute; index: number }[] {
            const section = this.activeSection;

            if (!section) {
                return [];
            }

            const header = this.activeHeader;

            return section.attributes
                .map((attribute, index) => ({ attribute, index }))
                .filter(
                    ({ attribute }) =>
                        !header ||
                        (attribute !== header.title && attribute !== header.subtitle && attribute !== header.image)
                );
        },
        activeStatusAttribute(): SheetAttribute | null {
            if (this.activeSection?.type !== 3) {
                return null;
            }

            return this.activeSection.attributes.find(attribute => attribute.type === 5) ?? null;
        },
        activeStatusValue(): SheetStatusValue | null {
            const attribute = this.activeStatusAttribute;

            if (!attribute || !attribute.value || typeof attribute.value !== 'object') {
                return null;
            }

            return 'items' in attribute.value && Array.isArray(attribute.value.items)
                ? (attribute.value as SheetStatusValue)
                : null;
        },
        activeStatusItems(): SheetStatusItem[] {
            return this.activeStatusValue?.items ?? [];
        },
        activeTableAttribute(): SheetAttribute | null {
            if (this.activeSection?.type !== 5) {
                return null;
            }

            return this.activeSection.attributes.find(attribute => attribute.type === 6) ?? null;
        },
        activeTableValue(): SheetTableValue | null {
            const attribute = this.activeTableAttribute;

            if (!attribute || !attribute.value || typeof attribute.value !== 'object') {
                return null;
            }

            return 'columns' in attribute.value && Array.isArray(attribute.value.columns)
                ? (attribute.value as SheetTableValue)
                : null;
        },
        barSettingsBar(): SheetBarValue | null {
            return this.barSettingsAttribute ? this.asBar(this.barSettingsAttribute.value) : null;
        },
        barSettingsLabel(): string {
            const bar = this.barSettingsBar;

            return bar ? `${bar.actual} / ${bar.max}` : '';
        },
        barSettingsColorValue(): string {
            return this.barSettingsAttribute ? this.barColorValue(this.barSettingsAttribute) : defaultBarColor;
        },
        barSettingsBackgroundValue(): string {
            if (!this.barSettingsAttribute) {
                return defaultBarBackground;
            }

            const background = this.asBar(this.barSettingsAttribute.value).background;

            return typeof background === 'string' ? background : defaultBarBackground;
        },
        barSettingsPattern(): 'solid' | 'segmented' {
            return this.barSettingsAttribute ? this.barPatternOf(this.barSettingsAttribute) : 'solid';
        },
        barSettingsBlink(): boolean {
            return this.barSettingsAttribute ? this.barBlinkEnabled(this.barSettingsAttribute) : true;
        },
        barSettingsFlashBelow(): number {
            return this.barSettingsAttribute ? this.barFlashBelowOf(this.barSettingsAttribute) : defaultBarFlashBelow;
        },
        structureSections(): {
            section: SheetSection;
            index: number;
            attributes: { attribute: SheetAttribute; index: number }[];
        }[] {
            const term = this.structureFilter.trim().toLowerCase();

            return this.sections
                .map((section, index) => ({ section, index }))
                .filter(({ section }) => {
                    if (!term) {
                        return true;
                    }

                    return (
                        section.name.toLowerCase().includes(term) ||
                        section.attributes.some(attribute => attribute.name.toLowerCase().includes(term))
                    );
                })
                .map(entry => ({ ...entry, attributes: this.freeAttributesOf(entry.section) }));
        },
        contentLabel(): string {
            if (this.mode === 'estrutura') {
                return 'Estrutura da ficha';
            }

            if (this.mode === 'posicionamento') {
                return 'Posicionamento dos atributos';
            }

            return `Seção ${this.activeSection?.name ?? ''}`;
        },
        activeDialog(): EditorDialog | null {
            if (this.settingsOpen) {
                return 'settings';
            }

            if (this.barSettingsAttribute) {
                return 'bar';
            }

            return null;
        },
        isReading(): boolean {
            return this.$route.query.ver === '1';
        }
    },
    watch: {
        activeDialog(next: EditorDialog | null, previous: EditorDialog | null): void {
            if (next === previous) {
                return;
            }

            if (!previous && next) {
                rememberDialogFocus();
                lockDialogScroll();
            }

            if (previous && !next) {
                unlockDialogScroll();
                restoreDialogFocus();
            }

            if (next) {
                const refs: Record<EditorDialog, string> = {
                    settings: 'settingsDialog',
                    bar: 'barDialog'
                };

                void this.$nextTick(() => {
                    focusDialog((this.$refs[refs[next]] as HTMLElement | undefined) ?? null);
                });
            }
        }
    },
    created() {
        if (this.sheet) {
            this.initializeFromSheet(this.sheet);
        }
    },
    mounted() {
        this.updateViewport();
        window.addEventListener('beforeunload', this.handleBeforeUnload);
        window.addEventListener('keydown', this.handleKeydown);
        window.addEventListener('resize', this.updateViewport);
    },
    beforeUnmount() {
        window.removeEventListener('beforeunload', this.handleBeforeUnload);
        window.removeEventListener('keydown', this.handleKeydown);
        window.removeEventListener('resize', this.updateViewport);
    },
    beforeRouteLeave(_to: RouteLocationNormalized, _from: RouteLocationNormalized, next: NavigationGuardNext) {
        if (!this.hasChanges || this.isSaving || this.isDeleting) {
            next();
            return;
        }

        next(window.confirm('Você tem alterações não salvas. Sair mesmo assim?'));
    },
    methods: {
        initializeFromSheet(sheet: SheetDetail): void {
            this.sheet = sheet;
            this.name = sheet.name;
            this.sections = cloneSections(sheet.attributes.sections);
            this.layout = deserializeLayout(sheet.layout, this.sections);
            this.savedSnapshot = serializeDraft(this.name, this.sections, this.layout);
            this.activeSectionIndex = 0;
            this.expandedLists = [];
            this.conflict = false;
            this.liveBlocked = false;
            this.brokenImages = [];
            this.showDeleteConfirm = false;
            this.settingsOpen = false;
            this.barSettingsAttribute = null;
            this.clearDrag();
        },
        clearMessages(): void {
            this.errorMessage = '';
            this.successMessage = '';
        },
        handleError(error: unknown, fallback: string): void {
            this.errorMessage = serverErrorMessage(error) ?? fallback;
        },
        asList(value: SheetAttribute['value']): SheetListValue {
            return value as SheetListValue;
        },
        asBar(value: SheetAttribute['value']): SheetBarValue {
            return value as SheetBarValue;
        },
        adjustBar(payload: { section: number; attribute: number; delta: number }): void {
            const attribute = this.sections[payload.section]?.attributes[payload.attribute];

            if (!attribute || attribute.type !== 4) {
                return;
            }

            const bar = this.asBar(attribute.value);
            const step = bar.step > 0 ? bar.step : 1;

            bar.actual = Math.min(bar.max, Math.max(bar.min, bar.actual + payload.delta * step));
            this.clearMessages();
        },
        handleAdjustQuantity(payload: { section: number; attribute: number; index: number; delta: number }): void {
            const attribute = this.sections[payload.section]?.attributes[payload.attribute];

            if (!attribute || attribute.type !== 3) {
                return;
            }

            const item = this.asList(attribute.value).items[payload.index];

            if (!item) {
                return;
            }

            const current = Number(item.quantity);
            const next = Math.max(1, (Number.isFinite(current) ? current : 1) + payload.delta);

            item.quantity = String(next).slice(0, 32);
            this.clearMessages();
        },
        handleAddListItem(payload: { section: number; attribute: number }): void {
            const attribute = this.sections[payload.section]?.attributes[payload.attribute];

            if (!attribute || attribute.type !== 3) {
                return;
            }

            const list = this.asList(attribute.value);

            if (list.items.length >= 100) {
                return;
            }

            list.items.push({ name: 'Novo item', quantity: '1' });
            this.clearMessages();
        },
        handleRemoveListItem(payload: { section: number; attribute: number; index: number }): void {
            const attribute = this.sections[payload.section]?.attributes[payload.attribute];

            if (!attribute || attribute.type !== 3) {
                return;
            }

            this.asList(attribute.value).items.splice(payload.index, 1);
            this.clearMessages();
        },
        handleMoveListItem(payload: { section: number; attribute: number; from: number; to: number }): void {
            const attribute = this.sections[payload.section]?.attributes[payload.attribute];

            if (!attribute || attribute.type !== 3 || payload.from === payload.to) {
                return;
            }

            const items = this.asList(attribute.value).items;
            const [item] = items.splice(payload.from, 1);

            if (!item) {
                return;
            }

            items.splice(Math.max(0, Math.min(payload.to, items.length)), 0, item);
            this.clearMessages();
        },
        handleUpdateListItemName(payload: { section: number; attribute: number; index: number; value: string }): void {
            const attribute = this.sections[payload.section]?.attributes[payload.attribute];

            if (!attribute || attribute.type !== 3) {
                return;
            }

            const item = this.asList(attribute.value).items[payload.index];

            if (!item) {
                return;
            }

            item.name = payload.value;
            this.clearMessages();
        },
        attributeTypeLabel(type: SheetAttributeType): string {
            return attributeTypeLabels[type] ?? 'TEXTO';
        },
        isImageUrl(value: string): boolean {
            return isHttpImageUrl(value);
        },
        attributeTypeHint(type: SheetAttributeType): string {
            if (type === 0) {
                return 'Texto livre para descrições, anotações ou informações do personagem.';
            }

            if (type === 1) {
                return 'Use para atributos e valores inteiros, como força, nível ou armadura.';
            }

            if (type === 2) {
                return 'Informe uma URL de imagem para exibir um retrato ou referência visual.';
            }

            if (type === 3) {
                return 'Use para inventário, habilidades ou qualquer conjunto de itens com quantidade.';
            }

            return 'Use para vida, mana, energia ou outro recurso com valor atual e máximo.';
        },
        isEditorImageBroken(url: string): boolean {
            return this.brokenImages.includes(url);
        },
        markEditorImageBroken(url: string): void {
            if (!this.brokenImages.includes(url)) {
                this.brokenImages.push(url);
            }
        },
        canAddSection(): boolean {
            return this.sections.length < 50;
        },
        canAddAttribute(section: SheetSection): boolean {
            const acceptsAttributes = section.type === 0 || section.type === 2 || section.type === 4;

            return acceptsAttributes && section.attributes.length < 200;
        },
        canAddListItem(attribute: SheetAttribute): boolean {
            return this.asList(attribute.value).items.length < 100;
        },
        isListExpanded(attribute: SheetAttribute): boolean {
            return this.expandedLists.includes(attribute);
        },
        toggleList(attribute: SheetAttribute): void {
            const index = this.expandedLists.indexOf(attribute);

            if (index >= 0) {
                this.expandedLists.splice(index, 1);
                return;
            }

            this.expandedLists.push(attribute);
        },
        updateViewport(): void {
            this.isMobileViewport = window.matchMedia('(max-width: 900px)').matches;
        },
        handleDialogKeydown(name: EditorDialog, event: KeyboardEvent): void {
            const refs: Record<EditorDialog, string> = {
                settings: 'settingsDialog',
                bar: 'barDialog'
            };
            const element = this.$refs[refs[name]] as HTMLElement | undefined;

            if (element) {
                trapDialogTab(event, element);
            }
        },
        enterReading(): void {
            if (this.isReading) {
                return;
            }

            this.settingsOpen = false;
            this.barSettingsAttribute = null;
            this.showDeleteConfirm = false;
            this.readingScrollY = window.scrollY;

            const query = { ...this.$route.query, ver: '1' };

            void this.$router.replace({ query }).then(() => {
                window.scrollTo({ top: 0 });
            });
        },
        exitReading(): void {
            if (!this.isReading) {
                return;
            }

            const query = { ...this.$route.query };

            delete query.ver;

            void this.$router.replace({ query }).then(() => {
                void this.$nextTick(() => {
                    window.scrollTo({ top: this.readingScrollY });
                });
            });
        },
        toggleReading(): void {
            if (this.isReading) {
                this.exitReading();
                return;
            }

            this.enterReading();
        },
        openSettings(): void {
            this.settingsOpen = true;
            this.barSettingsAttribute = null;
            this.showDeleteConfirm = false;
            this.sharingPublic = this.sheet?.isPublic ?? false;
            this.sharingPassword = '';
            this.sharingRemovePassword = false;
            this.sharingError = '';
            this.sharingNotice = '';
        },
        closeSettings(): void {
            this.settingsOpen = false;
            this.showDeleteConfirm = false;
        },
        async saveSharing(): Promise<void> {
            if (!this.sheet || this.sharingSaving) {
                return;
            }

            this.sharingSaving = true;
            this.sharingError = '';
            this.sharingNotice = '';

            const body: { version: string; isPublic: boolean; password?: string | null } = {
                version: this.sheet.version,
                isPublic: this.sharingPublic
            };

            if (this.sharingRemovePassword) {
                body.password = null;
            } else if (this.sharingPassword.trim()) {
                body.password = this.sharingPassword.trim();
            }

            try {
                const updated = await $fetch<SheetDetail>(`/api/fichas/${this.sheet.id}/publicacao`, {
                    method: 'PATCH',
                    body
                });

                this.sheet = updated;
                this.sharingPassword = '';
                this.sharingRemovePassword = false;
                this.sharingNotice = updated.isPublic ? 'FICHA PÚBLICA ATUALIZADA.' : 'FICHA PRIVADA.';
            } catch (error) {
                this.sharingError =
                    serverErrorMessage(error) ?? 'Não foi possível salvar o compartilhamento. Tente novamente.';
            } finally {
                this.sharingSaving = false;
            }
        },
        async copyPublicLink(): Promise<void> {
            if (!this.sheet?.isPublic) {
                return;
            }

            const url = `${window.location.origin}/ficha/${this.sheet.userId}/${encodeURIComponent(this.sheet.name)}`;

            try {
                await navigator.clipboard.writeText(url);
                this.sharingNotice = 'LINK COPIADO.';
            } catch {
                this.sharingError = 'Não foi possível copiar o link.';
            }
        },
        setMode(mode: EditorMode): void {
            this.mode = mode;
            this.barSettingsAttribute = null;

            this.clearDrag();
            this.clearStructureDrag();
        },
        handleModeSelect(event: Event): void {
            const value = (event.target as HTMLSelectElement).value as EditorMode;

            if (editorModes.some(option => option.value === value)) {
                this.setMode(value);
            }
        },
        ensureLayout(sectionIndex: number): DraftSectionLayout {
            let entry = this.layout[sectionIndex];

            if (!entry) {
                entry = {
                    columns: defaultColumnsFor(this.sections[sectionIndex]?.type ?? 0),
                    rows: null,
                    dense: false,
                    spans: (this.sections[sectionIndex]?.attributes ?? []).map(() => 1),
                    rowSpans: (this.sections[sectionIndex]?.attributes ?? []).map(() => 1),
                    span: SHEET_LAYOUT_DEFAULT_SPAN,
                    header: null
                };
                this.layout[sectionIndex] = entry;
            }

            return entry;
        },
        layoutOf(sectionIndex: number): DraftSectionLayout {
            return (
                this.layout[sectionIndex] ?? {
                    columns: defaultColumnsFor(this.sections[sectionIndex]?.type ?? 0),
                    rows: null,
                    dense: false,
                    spans: [],
                    rowSpans: [],
                    span: SHEET_LAYOUT_DEFAULT_SPAN,
                    header: null
                }
            );
        },
        attributeSpanAt(sectionIndex: number, attributeIndex: number): number {
            const columns =
                this.layout[sectionIndex]?.columns ?? defaultColumnsFor(this.sections[sectionIndex]?.type ?? 0);
            const stored = this.layout[sectionIndex]?.spans[attributeIndex];

            if (typeof stored === 'number') {
                return stored;
            }

            return defaultAttributeSpanFor(
                this.sections[sectionIndex]?.type ?? 0,
                this.sections[sectionIndex]?.attributes[attributeIndex]?.type ?? 0,
                columns
            );
        },
        attributeRowsAt(sectionIndex: number, attributeIndex: number): number {
            const rows = this.layout[sectionIndex]?.rows ?? 1;
            const stored = this.layout[sectionIndex]?.rowSpans[attributeIndex];

            return clampAttributeRows(typeof stored === 'number' ? stored : 1, rows);
        },
        setColumns(sectionIndex: number, columns: SheetLayoutColumns): void {
            const parsed = typeof columns === 'number' ? columns : Number(columns);

            if (!Number.isFinite(parsed)) {
                return;
            }

            const sectionType = this.sections[sectionIndex]?.type;
            const max = sectionType === 4 ? SHEET_GALLERY_COLUMNS_MAX : SHEET_LAYOUT_COLUMNS;
            const next = Math.min(max, Math.max(1, Math.trunc(parsed)));
            this.clearMessages();
            const entry = this.ensureLayout(sectionIndex);
            entry.columns = next;
            entry.spans = entry.spans.map(span => clampAttributeSpan(span, next));
        },
        handleColumnsChange(sectionIndex: number, event: Event): void {
            this.setColumns(sectionIndex, Number((event.target as HTMLSelectElement).value));
        },
        /** `null` desliga a grade explícita e volta para a altura automática. */
        setRows(sectionIndex: number, rows: number | string | null): void {
            const entry = this.ensureLayout(sectionIndex);

            if (rows === null || rows === '') {
                entry.rows = null;
                entry.rowSpans = entry.rowSpans.map(() => 1);
                this.clearMessages();
                return;
            }

            const parsed = typeof rows === 'number' ? rows : Number(rows);

            if (!Number.isFinite(parsed)) {
                return;
            }

            const next = Math.min(SHEET_LAYOUT_ROWS_MAX, Math.max(1, Math.trunc(parsed)));
            entry.rows = next;
            entry.rowSpans = entry.rowSpans.map(value => clampAttributeRows(value, next));
            this.clearMessages();
        },
        handleRowsChange(sectionIndex: number, event: Event): void {
            const value = (event.target as HTMLSelectElement).value;

            this.setRows(sectionIndex, value === 'auto' ? null : value);
        },
        toggleDense(sectionIndex: number): void {
            const entry = this.ensureLayout(sectionIndex);

            entry.dense = !entry.dense;
            this.clearMessages();
        },
        setAttributeRows(sectionIndex: number, attributeIndex: number, value: number | string): void {
            const parsed = typeof value === 'number' ? value : Number(value);
            const entry = this.ensureLayout(sectionIndex);

            if (!Number.isFinite(parsed)) {
                return;
            }

            entry.rowSpans[attributeIndex] = clampAttributeRows(parsed, entry.rows ?? 1);
            this.clearMessages();
        },
        handleAttributeRowsInput(sectionIndex: number, attributeIndex: number, event: Event): void {
            const target = event.target as HTMLInputElement;

            if (target.value === '') {
                return;
            }

            this.setAttributeRows(sectionIndex, attributeIndex, target.value);
        },
        handleAttributeRowsCommit(sectionIndex: number, attributeIndex: number, event: Event): void {
            const target = event.target as HTMLInputElement;

            this.setAttributeRows(sectionIndex, attributeIndex, target.value === '' ? 1 : target.value);
            target.value = String(this.attributeRowsAt(sectionIndex, attributeIndex));
        },
        setSpan(sectionIndex: number, value: number | string): void {
            const parsed = typeof value === 'number' ? value : Number(value);

            if (!Number.isFinite(parsed)) {
                return;
            }

            this.clearMessages();
            this.ensureLayout(sectionIndex).span = Math.min(SHEET_LAYOUT_COLUMNS, Math.max(1, Math.trunc(parsed)));
        },
        handleSpanInput(sectionIndex: number, event: Event): void {
            const target = event.target as HTMLInputElement;

            if (target.value === '') {
                return;
            }

            this.setSpan(sectionIndex, target.value);
        },
        handleSpanCommit(sectionIndex: number, event: Event): void {
            const target = event.target as HTMLInputElement;

            this.setSpan(sectionIndex, target.value === '' ? SHEET_LAYOUT_DEFAULT_SPAN : target.value);
            target.value = String(this.ensureLayout(sectionIndex).span);
        },
        setAttributeSpan(sectionIndex: number, attributeIndex: number, value: number | string): void {
            const parsed = typeof value === 'number' ? value : Number(value);
            const entry = this.ensureLayout(sectionIndex);

            if (!Number.isFinite(parsed)) {
                return;
            }

            this.clearMessages();
            entry.spans[attributeIndex] = clampAttributeSpan(parsed, entry.columns);
        },
        handleAttributeSpanInput(sectionIndex: number, attributeIndex: number, event: Event): void {
            const target = event.target as HTMLInputElement;

            if (target.value === '') {
                return;
            }

            this.setAttributeSpan(sectionIndex, attributeIndex, target.value);
        },
        handleAttributeSpanCommit(sectionIndex: number, attributeIndex: number, event: Event): void {
            const target = event.target as HTMLInputElement;

            this.setAttributeSpan(sectionIndex, attributeIndex, target.value === '' ? 1 : target.value);
            target.value = String(this.attributeSpanAt(sectionIndex, attributeIndex));
        },
        handleStructureDragStart(sectionIndex: number, attributeIndex: number, event: DragEvent): void {
            this.dragStructureFrom = { section: sectionIndex, attribute: attributeIndex };
            this.dragStructureOver = { section: sectionIndex, attribute: attributeIndex };
            event.dataTransfer?.setData('text/plain', `${sectionIndex}:${attributeIndex}`);

            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
            }
        },
        handleStructureDragOver(sectionIndex: number, attributeIndex: number, event: DragEvent): void {
            event.preventDefault();
            this.dragStructureOver = { section: sectionIndex, attribute: attributeIndex };

            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'move';
            }
        },
        handleStructureDrop(sectionIndex: number, attributeIndex: number): void {
            const from = this.dragStructureFrom;

            this.clearStructureDrag();

            if (!from) {
                return;
            }

            this.moveAttributeTo(from.section, from.attribute, sectionIndex, attributeIndex);
        },
        handleStructureDropOnSection(sectionIndex: number): void {
            const from = this.dragStructureFrom;
            const target = this.sections[sectionIndex];

            this.clearStructureDrag();

            if (!from || !target) {
                return;
            }

            const attribute = this.sections[from.section]?.attributes[from.attribute];

            if (!attribute || !this.canMoveAttributeTo(attribute, target)) {
                return;
            }

            this.moveAttributeTo(from.section, from.attribute, sectionIndex, target.attributes.length);
        },
        clearStructureDrag(): void {
            this.dragStructureFrom = null;
            this.dragStructureOver = null;
        },
        moveAttributeTo(
            sourceSection: number,
            sourceAttribute: number,
            targetSection: number,
            targetAttribute: number
        ): void {
            const from = this.sections[sourceSection];
            const to = this.sections[targetSection];

            if (!from || !to) {
                return;
            }

            if (to.type === 1 || to.type === 3 || to.type === 5) {
                this.errorMessage = 'Esta seção não aceita atributos.';
                return;
            }

            const moving = from.attributes[sourceAttribute];

            if (!moving) {
                return;
            }

            if (moving.type === 5 || moving.type === 6) {
                return;
            }

            if (to.type === 4 && moving.type !== 2) {
                this.errorMessage = 'A galeria aceita apenas imagens.';
                return;
            }

            if (sourceSection === targetSection && sourceAttribute === targetAttribute) {
                return;
            }

            if (sourceSection !== targetSection && !this.canAddAttribute(to)) {
                this.errorMessage = 'A seção de destino já tem o máximo de atributos.';
                return;
            }

            const [attribute] = from.attributes.splice(sourceAttribute, 1);

            if (!attribute) {
                return;
            }

            const sourceLayout = this.ensureLayout(sourceSection);
            const movedSpan = sourceLayout.spans.splice(sourceAttribute, 1)[0];
            const movedRows = sourceLayout.rowSpans.splice(sourceAttribute, 1)[0];
            let insertAt = targetAttribute;

            if (sourceSection === targetSection && sourceAttribute < targetAttribute) {
                insertAt -= 1;
            }

            insertAt = Math.max(0, Math.min(insertAt, to.attributes.length));
            to.attributes.splice(insertAt, 0, attribute);

            const targetLayout = this.ensureLayout(targetSection);
            targetLayout.spans.splice(
                insertAt,
                0,
                clampAttributeSpan(
                    typeof movedSpan === 'number'
                        ? movedSpan
                        : defaultAttributeSpanFor(to.type, attribute.type, targetLayout.columns),
                    targetLayout.columns
                )
            );
            targetLayout.rowSpans.splice(
                insertAt,
                0,
                clampAttributeRows(typeof movedRows === 'number' ? movedRows : 1, targetLayout.rows ?? 1)
            );
            this.clearMessages();
        },
        moveToSection(sectionIndex: number, attributeIndex: number, event: Event): void {
            const target = Number((event.target as HTMLSelectElement).value);
            (event.target as HTMLSelectElement).value = '';

            if (!Number.isInteger(target) || target === sectionIndex) {
                return;
            }

            this.moveAttributeTo(sectionIndex, attributeIndex, target, this.sections[target]?.attributes.length ?? 0);
        },
        goToSection(sectionIndex: number): void {
            this.selectSection(sectionIndex);
            this.setMode('editar');
        },
        scrollToInspector(): void {
            const panel = this.$refs.inspectorPanel as HTMLElement | undefined;

            panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
        selectSection(index: number): void {
            if (index >= 0 && index < this.sections.length) {
                if (index !== this.activeSectionIndex) {
                    this.barSettingsAttribute = null;
                }

                this.activeSectionIndex = index;
            }
        },
        handleSectionSelect(event: Event): void {
            this.selectSection(Number((event.target as HTMLSelectElement).value));
        },
        focusAlert(): void {
            this.$nextTick(() => {
                const banner = this.$refs.alertBanner as HTMLElement | undefined;
                banner?.focus();
            });
        },
        nextAttributeName(section: SheetSection, base: string): string {
            const names = new Set(section.attributes.map(attribute => attribute.name));
            let name = base.slice(0, 32);
            let suffix = 2;

            while (names.has(name)) {
                name = `${base} ${suffix}`.slice(0, 32);
                suffix += 1;
            }

            return name;
        },
        ensureHeader(sectionIndex: number): DraftSectionHeader {
            const section = this.sections[sectionIndex];
            const layout = this.ensureLayout(sectionIndex);
            const current = layout.header;

            if (!section) {
                return {
                    title: null,
                    subtitle: null,
                    image: null,
                    imageWidth: headerDefaultImageWidth,
                    titleSize: headerDefaultTitleSize
                };
            }

            const create = (base: string, type: 0 | 2, value: string): SheetAttribute => {
                const attribute: SheetAttribute = {
                    name: this.nextAttributeName(section, base),
                    type,
                    position: section.attributes.length,
                    value
                };

                section.attributes.push(attribute);
                layout.spans.push(1);
                layout.rowSpans.push(1);

                return attribute;
            };

            const keep = (attribute: SheetAttribute | null | undefined): SheetAttribute | null =>
                attribute && section.attributes.includes(attribute) ? attribute : null;

            return {
                title: keep(current?.title) ?? create('Título', 0, ''),
                subtitle: keep(current?.subtitle) ?? create('Subtítulo', 0, ''),
                image: keep(current?.image) ?? create('Imagem', 2, ''),
                imageWidth: current?.imageWidth ?? headerDefaultImageWidth,
                titleSize: current?.titleSize ?? headerDefaultTitleSize
            };
        },
        isHeaderRole(attribute: SheetAttribute): boolean {
            const header = this.activeHeader;

            return Boolean(
                header && (header.title === attribute || header.subtitle === attribute || header.image === attribute)
            );
        },
        freeAttributesOf(section: SheetSection): { attribute: SheetAttribute; index: number }[] {
            const sectionIndex = this.sections.indexOf(section);
            const header = sectionIndex >= 0 && section.type === 2 ? this.layoutOf(sectionIndex).header : null;
            const isSpecial = section.type === 3 || section.type === 5;

            return section.attributes
                .map((attribute, index) => ({ attribute, index }))
                .filter(({ attribute }) => {
                    if (isSpecial && (attribute.type === 5 || attribute.type === 6)) {
                        return false;
                    }

                    return (
                        !header ||
                        (attribute !== header.title && attribute !== header.subtitle && attribute !== header.image)
                    );
                });
        },
        sectionAcceptsAttributes(section: SheetSection): boolean {
            return section.type === 0 || section.type === 2 || section.type === 4;
        },
        canMoveAttributeTo(attribute: SheetAttribute, target: SheetSection): boolean {
            if (!this.sectionAcceptsAttributes(target)) {
                return false;
            }

            if (target.type === 4) {
                return attribute.type === 2;
            }

            return attribute.type !== 5 && attribute.type !== 6;
        },
        sectionAttributeNotice(section: SheetSection): string {
            if (section.type === 1) {
                return section.attributes.length <= 1
                    ? 'SEÇÃO DE DESCRIÇÃO — TEXTO ÚNICO. O CONTEÚDO É EDITADO NO MODO EDITAR.'
                    : '';
            }

            if (section.type === 3) {
                return 'SEÇÃO DE STATUS — BLOCO ÚNICO. NÃO ACEITA ATRIBUTOS.';
            }

            if (section.type === 5) {
                return 'SEÇÃO DE TABELA — BLOCO ÚNICO. NÃO ACEITA ATRIBUTOS.';
            }

            return '';
        },
        handleStructureDragOverSection(section: SheetSection, event: DragEvent): void {
            const from = this.dragStructureFrom;

            if (!from) {
                return;
            }

            const attribute = this.sections[from.section]?.attributes[from.attribute];

            if (attribute && this.canMoveAttributeTo(attribute, section)) {
                event.preventDefault();
            }
        },
        updateHeaderField(field: 'title' | 'subtitle' | 'image', event: Event): void {
            const attribute =
                field === 'title' ? this.headerTitle : field === 'subtitle' ? this.headerSubtitle : this.headerImage;

            if (attribute) {
                this.updateText(attribute, event);
            }
        },
        setHeaderImageWidth(event: Event): void {
            const header = this.ensureLayout(this.activeSectionIndex).header;
            const parsed = Number((event.target as HTMLInputElement).value);

            if (!header || !Number.isFinite(parsed)) {
                return;
            }

            header.imageWidth = clampHeaderImageWidth(parsed);
            this.clearMessages();
        },
        setHeaderTitleSize(event: Event): void {
            const header = this.ensureLayout(this.activeSectionIndex).header;
            const parsed = Number((event.target as HTMLInputElement).value);

            if (!header || !Number.isFinite(parsed)) {
                return;
            }

            header.titleSize = clampHeaderTitleSize(parsed);
            this.clearMessages();
        },
        createSpecialAttribute(section: SheetSection, type: 5 | 6): SheetAttribute {
            const attribute: SheetAttribute = {
                name: this.nextAttributeName(section, type === 5 ? 'Status' : 'Tabela'),
                type,
                position: section.attributes.length,
                value: type === 5 ? { items: [] } : { columns: ['Nome', 'Valor', 'Notas'], rows: [['', '', '']] }
            };

            return attribute;
        },
        resetSpecialLayout(sectionIndex: number): void {
            const section = this.sections[sectionIndex];

            if (!section) {
                return;
            }

            const layout = this.ensureLayout(sectionIndex);

            layout.spans = section.attributes.map(() => 1);
            layout.rowSpans = section.attributes.map(() => 1);
        },
        createStatusId(): string {
            return `st-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.slice(0, 16);
        },
        addStatusItem(): void {
            const value = this.activeStatusValue;

            if (!value || value.items.length >= 32) {
                return;
            }

            value.items.push({
                id: this.createStatusId(),
                name: `Status ${value.items.length + 1}`,
                color: '#0082ff',
                blink: false,
                active: false,
                icon: ''
            });
            this.clearMessages();
        },
        removeStatusItem(index: number): void {
            this.activeStatusValue?.items.splice(index, 1);
            this.clearMessages();
        },
        moveStatusItem(index: number, direction: -1 | 1): void {
            const items = this.activeStatusValue?.items;

            if (!items) {
                return;
            }

            const target = index + direction;

            if (target < 0 || target >= items.length) {
                return;
            }

            const [item] = items.splice(index, 1);

            if (item) {
                items.splice(target, 0, item);
            }

            this.clearMessages();
        },
        setStatusItemColor(index: number, event: Event): void {
            const item = this.activeStatusValue?.items[index];

            if (item) {
                item.color = (event.target as HTMLInputElement).value.toLowerCase();
                this.clearMessages();
            }
        },
        toggleStatusItemBlink(index: number): void {
            const item = this.activeStatusValue?.items[index];

            if (item) {
                item.blink = !item.blink;
                this.clearMessages();
            }
        },
        toggleStatusItemActive(index: number): void {
            const item = this.activeStatusValue?.items[index];

            if (item) {
                item.active = !item.active;
                this.clearMessages();
            }
        },
        handleToggleStatus(payload: { section: number; index: number }): void {
            const section = this.sections[payload.section];
            const attribute = section?.attributes.find(item => item.type === 5);
            const value = attribute?.value as SheetStatusValue | undefined;

            if (!value || !Array.isArray(value.items)) {
                return;
            }

            const item = value.items[payload.index];

            if (!item) {
                return;
            }

            item.active = !item.active;
            this.clearMessages();
        },
        addTableRow(): void {
            const value = this.activeTableValue;

            if (!value || value.rows.length >= 100) {
                return;
            }

            value.rows.push(value.columns.map(() => ''));
            this.clearMessages();
        },
        removeTableRow(index: number): void {
            this.activeTableValue?.rows.splice(index, 1);
            this.clearMessages();
        },
        addTableColumn(): void {
            const value = this.activeTableValue;

            if (!value || value.columns.length >= 8) {
                return;
            }

            value.columns.push(`Coluna ${value.columns.length + 1}`.slice(0, 32));
            value.rows.forEach(row => row.push(''));
            this.clearMessages();
        },
        removeTableColumn(index: number): void {
            const value = this.activeTableValue;

            if (!value || value.columns.length <= 2) {
                return;
            }

            value.columns.splice(index, 1);
            value.rows.forEach(row => row.splice(index, 1));
            this.clearMessages();
        },
        updateTableColumn(index: number, event: Event): void {
            const value = this.activeTableValue;

            if (value) {
                value.columns[index] = (event.target as HTMLInputElement).value.slice(0, 32);
                this.clearMessages();
            }
        },
        updateTableCell(rowIndex: number, columnIndex: number, event: Event): void {
            const row = this.activeTableValue?.rows[rowIndex];

            if (row) {
                row[columnIndex] = (event.target as HTMLInputElement).value.slice(0, 128);
                this.clearMessages();
            }
        },
        changeSectionType(section: SheetSection, event: Event): void {
            const target = event.target as HTMLSelectElement;
            const raw = Number(target.value);
            const next = (
                raw === 1 ? 1 : raw === 2 ? 2 : raw === 3 ? 3 : raw === 4 ? 4 : raw === 5 ? 5 : 0
            ) as SheetSectionType;
            const previous = section.type;
            const sectionIndex = this.sections.indexOf(section);
            const hasSpecial = section.attributes.some(attribute => attribute.type === 5 || attribute.type === 6);
            const restore = (): void => {
                target.value = String(previous);
            };

            if (sectionIndex < 0) {
                return;
            }

            if (next === 3 || next === 5) {
                const expected = next === 3 ? 5 : 6;
                const others = section.attributes.filter(attribute => attribute.type !== 5 && attribute.type !== 6);

                if (others.length > 0) {
                    this.errorMessage =
                        'Este tipo usa um bloco único; crie uma seção vazia para ele ou remova os atributos antes.';
                    restore();
                    return;
                }

                if (section.attributes.some(attribute => attribute.type !== expected) && hasSpecial) {
                    if (!window.confirm('Isso substitui o bloco atual desta seção. Continuar?')) {
                        restore();
                        return;
                    }
                }

                const layout = this.ensureLayout(sectionIndex);

                section.attributes = [];
                layout.spans = [];
                layout.rowSpans = [];
                section.attributes.push(this.createSpecialAttribute(section, next === 3 ? 5 : 6));
                layout.spans.push(1);
                layout.rowSpans.push(1);
                layout.header = null;
            } else if (next === 4) {
                if (section.attributes.some(attribute => attribute.type !== 2)) {
                    this.errorMessage = 'A galeria aceita apenas imagens; remova os outros atributos antes.';
                    restore();
                    return;
                }

                const layout = this.ensureLayout(sectionIndex);

                layout.columns = clampGalleryColumns(layout.columns > 1 ? layout.columns : galleryDefaultColumns);
                layout.rows = null;
                layout.dense = false;
                layout.header = null;
                layout.rowSpans = section.attributes.map(() => 1);
                layout.spans = section.attributes.map(() => 1);
            } else if (hasSpecial) {
                if (!window.confirm('Mudar o tipo remove o bloco de status/tabela desta seção. Continuar?')) {
                    restore();
                    return;
                }

                section.attributes = section.attributes.filter(
                    attribute => attribute.type !== 5 && attribute.type !== 6
                );
                this.resetSpecialLayout(sectionIndex);
                this.ensureLayout(sectionIndex).header = next === 2 ? this.ensureHeader(sectionIndex) : null;
            } else {
                this.ensureLayout(sectionIndex).header = next === 2 ? this.ensureHeader(sectionIndex) : null;
            }

            section.type = next;
            this.clearMessages();

            if (section.type === 1) {
                this.expandedLists = this.expandedLists.filter(attribute => {
                    return !section.attributes.includes(attribute);
                });
            }
        },
        updateDescription(event: Event): void {
            this.handleUpdateDescription({
                section: this.activeSectionIndex,
                value: (event.target as HTMLTextAreaElement).value
            });
        },
        handleUpdateDescription(payload: { section: number; value: string }): void {
            const section = this.sections[payload.section];

            if (!section || section.type !== 1 || section.attributes.length > 1) {
                return;
            }

            const value = payload.value.slice(0, SHEET_DESCRIPTION_MAX_LENGTH);
            const [existing] = section.attributes;

            if (existing) {
                existing.type = 0;
                existing.value = value;
            } else {
                section.attributes.push({ name: 'Texto', type: 0, position: 0, value });
                const layout = this.ensureLayout(payload.section);

                layout.spans = [1];
                layout.rowSpans = [1];
            }

            this.clearMessages();
        },
        attributePlainValue(attribute: SheetAttribute): string {
            if (attribute.type === 3) {
                return this.asList(attribute.value)
                    .items.map(item => `${item.name} (${item.quantity})`)
                    .join(', ');
            }

            if (attribute.type === 4) {
                const bar = this.asBar(attribute.value);

                return `${bar.actual} / ${bar.max}`;
            }

            return String(attribute.value);
        },
        convertDescription(): void {
            const section = this.activeSection;

            if (!section || section.type !== 1 || section.attributes.length <= 1) {
                return;
            }

            const text = section.attributes
                .map(attribute => `${attribute.name.trim() || 'Atributo'}: ${this.attributePlainValue(attribute)}`)
                .join('\n\n');

            this.clearMessages();

            if (text.length > SHEET_DESCRIPTION_MAX_LENGTH) {
                this.errorMessage = `A descrição unida passa de ${SHEET_DESCRIPTION_MAX_LENGTH} caracteres. Reduza os atributos antes de converter.`;
                return;
            }

            section.attributes = [{ name: 'Texto', type: 0, position: 0, value: text }];
            const layout = this.ensureLayout(this.activeSectionIndex);

            layout.spans = [1];
            layout.rowSpans = [1];
            this.successMessage = 'ATRIBUTOS CONVERTIDOS EM TEXTO.';
        },
        changeAttributeType(attribute: SheetAttribute, event: Event): void {
            const type = Number((event.target as HTMLSelectElement).value) as SheetAttributeType;

            attribute.type = type >= 0 && type <= 4 ? type : 0;
            attribute.value = defaultAttributeValue(attribute.type);

            if (attribute.type !== 3) {
                const index = this.expandedLists.indexOf(attribute);

                if (index >= 0) {
                    this.expandedLists.splice(index, 1);
                }
            }
        },
        updateText(attribute: SheetAttribute, event: Event): void {
            const target = event.target as HTMLInputElement | HTMLTextAreaElement;
            attribute.value = target.value;
        },
        updateBar(attribute: SheetAttribute, field: 'actual' | 'max' | 'min' | 'step', event: Event): void {
            const parsed = Number((event.target as HTMLInputElement).value);

            if (!Number.isFinite(parsed)) {
                return;
            }

            this.asBar(attribute.value)[field] = Math.trunc(parsed);
        },
        barColorValue(attribute: SheetAttribute): string {
            const color = attribute.type === 4 ? this.asBar(attribute.value).color : undefined;

            return typeof color === 'string' ? color : defaultBarColor;
        },
        isBarColorPreset(attribute: SheetAttribute, value: string): boolean {
            return this.barColorValue(attribute).toLowerCase() === value;
        },
        setBarColor(attribute: SheetAttribute, color: string): void {
            if (attribute.type !== 4) {
                return;
            }

            this.asBar(attribute.value).color = color.toLowerCase();
            this.clearMessages();
        },
        updateBarColor(attribute: SheetAttribute, event: Event): void {
            this.setBarColor(attribute, (event.target as HTMLInputElement).value);
        },
        clearBarColor(attribute: SheetAttribute): void {
            if (attribute.type !== 4) {
                return;
            }

            delete this.asBar(attribute.value).color;
            this.clearMessages();
        },
        barPatternOf(attribute: SheetAttribute): 'solid' | 'segmented' {
            return attribute.type === 4 && this.asBar(attribute.value).pattern === 'segmented' ? 'segmented' : 'solid';
        },
        setBarPattern(attribute: SheetAttribute, pattern: 'solid' | 'segmented'): void {
            if (attribute.type !== 4) {
                return;
            }

            const bar = this.asBar(attribute.value);

            if (pattern === 'segmented') {
                bar.pattern = 'segmented';
            } else {
                delete bar.pattern;
            }

            this.clearMessages();
        },
        updateBarBackground(attribute: SheetAttribute, event: Event): void {
            if (attribute.type !== 4) {
                return;
            }

            this.asBar(attribute.value).background = (event.target as HTMLInputElement).value.toLowerCase();
            this.clearMessages();
        },
        clearBarBackground(attribute: SheetAttribute): void {
            if (attribute.type !== 4) {
                return;
            }

            delete this.asBar(attribute.value).background;
            this.clearMessages();
        },
        barBlinkEnabled(attribute: SheetAttribute): boolean {
            return attribute.type === 4 ? this.asBar(attribute.value).blink !== false : true;
        },
        toggleBarBlink(attribute: SheetAttribute): void {
            if (attribute.type !== 4) {
                return;
            }

            const bar = this.asBar(attribute.value);

            if (bar.blink === false) {
                delete bar.blink;
            } else {
                bar.blink = false;
            }

            this.clearMessages();
        },
        barFlashBelowOf(attribute: SheetAttribute): number {
            if (attribute.type !== 4) {
                return defaultBarFlashBelow;
            }

            const value = this.asBar(attribute.value).flashBelow;

            return typeof value === 'number' ? value : defaultBarFlashBelow;
        },
        setBarFlashBelow(attribute: SheetAttribute, value: number | string): void {
            if (attribute.type !== 4) {
                return;
            }

            const parsed = typeof value === 'number' ? value : Number(value);

            if (!Number.isFinite(parsed)) {
                return;
            }

            this.asBar(attribute.value).flashBelow = Math.min(100, Math.max(1, Math.trunc(parsed)));
            this.clearMessages();
        },
        updateBarFlashBelow(attribute: SheetAttribute, event: Event): void {
            this.setBarFlashBelow(attribute, (event.target as HTMLInputElement).value);
        },
        openBarSettings(attribute: SheetAttribute): void {
            if (attribute.type !== 4) {
                return;
            }

            this.barSettingsAttribute = attribute;
            this.settingsOpen = false;
        },
        closeBarSettings(): void {
            this.barSettingsAttribute = null;
        },
        updateBarSettingsStep(event: Event): void {
            if (this.barSettingsAttribute) {
                this.updateBar(this.barSettingsAttribute, 'step', event);
            }
        },
        updateBarSettingsColor(event: Event): void {
            if (this.barSettingsAttribute) {
                this.updateBarColor(this.barSettingsAttribute, event);
            }
        },
        setBarSettingsColor(color: string): void {
            if (this.barSettingsAttribute) {
                this.setBarColor(this.barSettingsAttribute, color);
            }
        },
        clearBarSettingsColor(): void {
            if (this.barSettingsAttribute) {
                this.clearBarColor(this.barSettingsAttribute);
            }
        },
        barSettingsPresetActive(value: string): boolean {
            return this.barSettingsColorValue.toLowerCase() === value;
        },
        setBarSettingsPattern(pattern: 'solid' | 'segmented'): void {
            if (this.barSettingsAttribute) {
                this.setBarPattern(this.barSettingsAttribute, pattern);
            }
        },
        updateBarSettingsBackground(event: Event): void {
            if (this.barSettingsAttribute) {
                this.updateBarBackground(this.barSettingsAttribute, event);
            }
        },
        clearBarSettingsBackground(): void {
            if (this.barSettingsAttribute) {
                this.clearBarBackground(this.barSettingsAttribute);
            }
        },
        toggleBarSettingsBlink(): void {
            if (this.barSettingsAttribute) {
                this.toggleBarBlink(this.barSettingsAttribute);
            }
        },
        updateBarSettingsFlashBelow(event: Event): void {
            if (this.barSettingsAttribute) {
                this.updateBarFlashBelow(this.barSettingsAttribute, event);
            }
        },
        addListItem(attribute: SheetAttribute): void {
            if (!this.canAddListItem(attribute)) {
                return;
            }

            this.asList(attribute.value).items.push({ name: '', quantity: '1' });
        },
        removeListItem(attribute: SheetAttribute, index: number): void {
            this.asList(attribute.value).items.splice(index, 1);
        },
        updateListItem(attribute: SheetAttribute, index: number, field: 'name' | 'quantity', event: Event): void {
            const item = this.asList(attribute.value).items[index];

            if (item) {
                item[field] = (event.target as HTMLInputElement).value;
            }
        },
        addSection(): void {
            if (!this.canAddSection()) {
                return;
            }

            this.clearMessages();
            this.sections.push({
                name: `Nova seção ${this.sections.length + 1}`.slice(0, 20),
                type: 0,
                position: this.sections.length,
                attributes: []
            });
            this.layout.push({
                columns: defaultColumnsFor(0),
                rows: null,
                dense: false,
                spans: [],
                rowSpans: [],
                span: SHEET_LAYOUT_DEFAULT_SPAN,
                header: null
            });
            this.activeSectionIndex = this.sections.length - 1;
        },
        removeSection(index: number): void {
            if (this.sections.length <= 1) {
                return;
            }

            this.clearMessages();
            this.sections.splice(index, 1);
            this.layout.splice(index, 1);
            this.activeSectionIndex = Math.min(index, this.sections.length - 1);
        },
        moveSection(index: number, direction: -1 | 1): void {
            const target = index + direction;

            if (target < 0 || target >= this.sections.length) {
                return;
            }

            const [section] = this.sections.splice(index, 1);

            if (section) {
                this.sections.splice(target, 0, section);
            }

            const [sectionLayout] = this.layout.splice(index, 1);

            if (sectionLayout) {
                this.layout.splice(target, 0, sectionLayout);
            }

            if (this.activeSectionIndex === index) {
                this.activeSectionIndex = target;
            } else if (this.activeSectionIndex === target) {
                this.activeSectionIndex = index;
            }
        },
        duplicateSection(): void {
            const section = this.activeSection;

            if (!section) {
                return;
            }

            const copy = JSON.parse(JSON.stringify(section)) as SheetSection;
            copy.name = `${section.name} (cópia)`.slice(0, 20);
            this.sections.splice(this.activeSectionIndex + 1, 0, copy);

            const sourceLayout = this.ensureLayout(this.activeSectionIndex);
            const sourceHeader = sourceLayout.header;
            const copyHeader =
                sourceHeader && copy.type === 2
                    ? {
                          title: copy.attributes.find(attribute => attribute.name === sourceHeader.title?.name) ?? null,
                          subtitle:
                              copy.attributes.find(attribute => attribute.name === sourceHeader.subtitle?.name) ?? null,
                          image: copy.attributes.find(attribute => attribute.name === sourceHeader.image?.name) ?? null,
                          imageWidth: sourceHeader.imageWidth,
                          titleSize: sourceHeader.titleSize
                      }
                    : null;

            this.layout.splice(this.activeSectionIndex + 1, 0, {
                columns: sourceLayout.columns,
                rows: sourceLayout.rows,
                dense: sourceLayout.dense,
                span: sourceLayout.span,
                header: copyHeader,
                spans: section.attributes.map((_, attributeIndex) => {
                    const span = sourceLayout.spans[attributeIndex];

                    return clampAttributeSpan(typeof span === 'number' ? span : 1, sourceLayout.columns);
                }),
                rowSpans: section.attributes.map((_, attributeIndex) => {
                    const rows = sourceLayout.rowSpans[attributeIndex];

                    return clampAttributeRows(typeof rows === 'number' ? rows : 1, sourceLayout.rows ?? 1);
                })
            });
            this.activeSectionIndex += 1;
        },
        duplicateAttribute(attribute: SheetAttribute): void {
            const section = this.activeSection;

            if (!section) {
                return;
            }

            const index = section.attributes.indexOf(attribute);

            if (index < 0) {
                return;
            }

            const copy = JSON.parse(JSON.stringify(attribute)) as SheetAttribute;
            section.attributes.splice(index + 1, 0, copy);
            const layout = this.ensureLayout(this.activeSectionIndex);

            layout.spans.splice(index + 1, 0, this.attributeSpanAt(this.activeSectionIndex, index));
            layout.rowSpans.splice(index + 1, 0, this.attributeRowsAt(this.activeSectionIndex, index));
        },
        handleSectionDragStart(index: number, event: DragEvent): void {
            this.dragSectionIndex = index;
            this.dragOverSectionIndex = index;
            event.dataTransfer?.setData('text/plain', String(index));

            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
            }
        },
        handleSectionDragOver(index: number, event: DragEvent): void {
            event.preventDefault();
            this.dragOverSectionIndex = index;

            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'move';
            }
        },
        handleSectionDrop(index: number): void {
            const source = this.dragSectionIndex;

            if (source === null || source === index) {
                this.clearDrag();
                return;
            }

            const [section] = this.sections.splice(source, 1);

            if (section) {
                this.sections.splice(index, 0, section);
            }

            this.activeSectionIndex = index;
            this.clearDrag();
        },
        handleAttributeDragStart(index: number, event: DragEvent): void {
            this.dragAttributeIndex = index;
            this.dragOverAttributeIndex = index;
            event.dataTransfer?.setData('text/plain', String(index));

            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
            }
        },
        handleAttributeDragOver(index: number, event: DragEvent): void {
            event.preventDefault();
            this.dragOverAttributeIndex = index;

            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'move';
            }
        },
        handleAttributeDrop(index: number): void {
            const section = this.activeSection;
            const source = this.dragAttributeIndex;

            if (!section || source === null || source === index) {
                this.clearDrag();
                return;
            }

            const [attribute] = section.attributes.splice(source, 1);

            if (attribute) {
                section.attributes.splice(index, 0, attribute);
            }

            const layout = this.ensureLayout(this.sections.indexOf(section));
            const [span] = layout.spans.splice(source, 1);
            const [rows] = layout.rowSpans.splice(source, 1);

            if (attribute) {
                layout.spans.splice(index, 0, typeof span === 'number' ? span : 1);
                layout.rowSpans.splice(
                    index,
                    0,
                    clampAttributeRows(typeof rows === 'number' ? rows : 1, layout.rows ?? 1)
                );
            }

            this.clearDrag();
        },
        clearDrag(): void {
            this.dragSectionIndex = null;
            this.dragOverSectionIndex = null;
            this.dragAttributeIndex = null;
            this.dragOverAttributeIndex = null;
        },
        addAttribute(section: SheetSection): void {
            if (!this.canAddAttribute(section)) {
                return;
            }

            this.clearMessages();
            section.attributes.push({
                name: 'Novo atributo',
                type: 0,
                position: section.attributes.length,
                value: ''
            });
            const layout = this.ensureLayout(this.sections.indexOf(section));

            layout.spans.push(1);
            layout.rowSpans.push(1);
        },
        removeAttribute(section: SheetSection, index: number): void {
            this.clearMessages();
            section.attributes.splice(index, 1);
            const layout = this.ensureLayout(this.sections.indexOf(section));

            layout.spans.splice(index, 1);
            layout.rowSpans.splice(index, 1);
        },
        moveAttribute(section: SheetSection, index: number, direction: -1 | 1): void {
            const target = index + direction;

            if (target < 0 || target >= section.attributes.length) {
                return;
            }

            const [attribute] = section.attributes.splice(index, 1);

            if (attribute) {
                section.attributes.splice(target, 0, attribute);
            }

            const layout = this.ensureLayout(this.sections.indexOf(section));
            const [span] = layout.spans.splice(index, 1);
            const [rows] = layout.rowSpans.splice(index, 1);

            if (attribute) {
                layout.spans.splice(target, 0, typeof span === 'number' ? span : 1);
                layout.rowSpans.splice(
                    target,
                    0,
                    clampAttributeRows(typeof rows === 'number' ? rows : 1, layout.rows ?? 1)
                );
            }
        },
        async handleSave(): Promise<void> {
            if (!this.sheet || this.isLive || this.liveBlocked || this.isSaving) {
                return;
            }

            this.clearMessages();
            const validation = validateDraft(this.name, this.sections);

            if (validation) {
                this.errorMessage = validation;
                return;
            }

            const draft = normalizeDraft(this.name, this.sections);
            const activeIndex = this.activeSectionIndex;
            this.isSaving = true;

            try {
                const updated = await $fetch<SheetDetail>(`/api/fichas/${this.sheet.id}`, {
                    method: 'PATCH',
                    body: {
                        name: draft.name,
                        attributes: { sections: draft.sections },
                        layout: serializeLayout(this.layout, this.sections),
                        version: this.sheet.version
                    }
                });

                this.initializeFromSheet(updated);
                this.selectSection(activeIndex);
                this.successMessage = 'FICHA SALVA.';
            } catch (error) {
                const status = errorStatus(error);
                const code = serverErrorCode(error);

                if (code === 'sheet_conflict') {
                    this.conflict = true;
                    this.errorMessage = serverErrorMessage(error) ?? 'A ficha foi alterada em outra janela.';
                } else if (code === 'sheet_live' || status === 423) {
                    this.liveBlocked = true;
                    this.errorMessage =
                        serverErrorMessage(error) ??
                        'Esta ficha está ao vivo no Discord e agora é somente leitura até a D5.';
                } else {
                    this.handleError(error, 'Não foi possível salvar a ficha.');
                }

                if (this.conflict || this.liveBlocked) {
                    this.focusAlert();
                }
            } finally {
                this.isSaving = false;
            }
        },
        async reloadSheet(): Promise<void> {
            if (!this.sheet || this.isReloading) {
                return;
            }

            this.isReloading = true;
            this.clearMessages();

            try {
                const sheet = await $fetch<SheetDetail>(`/api/fichas/${this.sheet.id}`);
                this.initializeFromSheet(sheet);
                this.successMessage = 'FICHA RECARREGADA.';
            } catch (error) {
                this.handleError(error, 'Não foi possível recarregar a ficha.');
            } finally {
                this.isReloading = false;
            }
        },
        handleDiscard(): void {
            if (this.conflict || this.liveBlocked) {
                void this.reloadSheet();
                return;
            }

            if (!this.sheet) {
                return;
            }

            this.initializeFromSheet(this.sheet);
            this.successMessage = 'ALTERAÇÕES DESCARTADAS.';
        },
        async handleDelete(): Promise<void> {
            if (!this.sheet || this.isLive || this.liveBlocked || this.isDeleting) {
                return;
            }

            this.clearMessages();
            this.isDeleting = true;

            try {
                await $fetch(`/api/fichas/${this.sheet.id}`, {
                    method: 'DELETE',
                    body: { version: this.sheet.version }
                });

                this.savedSnapshot = serializeDraft(this.name, this.sections, this.layout);
                await navigateTo('/fichas');
            } catch (error) {
                const status = errorStatus(error);
                const code = serverErrorCode(error);

                if (code === 'sheet_live' || status === 423) {
                    this.liveBlocked = true;
                    this.errorMessage =
                        serverErrorMessage(error) ??
                        'Esta ficha está ao vivo no Discord e não pode ser excluída até a D5.';
                } else if (code === 'sheet_conflict') {
                    this.conflict = true;
                    this.errorMessage = serverErrorMessage(error) ?? 'A ficha foi alterada em outra janela.';
                } else {
                    this.handleError(error, 'Não foi possível excluir a ficha.');
                }

                if (this.conflict || this.liveBlocked) {
                    this.focusAlert();
                }
            } finally {
                this.isDeleting = false;
            }
        },
        handleBeforeUnload(event: BeforeUnloadEvent): void {
            if (!this.hasChanges) {
                return;
            }

            event.preventDefault();
            event.returnValue = '';
        },
        handleKeydown(event: KeyboardEvent): void {
            const target = event.target as HTMLElement | null;
            const typing = Boolean(
                target &&
                (target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.tagName === 'SELECT' ||
                    target.isContentEditable)
            );

            if (event.key === 'Escape' && this.barSettingsAttribute) {
                this.closeBarSettings();
                return;
            }

            if (event.key === 'Escape' && this.settingsOpen) {
                this.closeSettings();
                return;
            }

            if (event.key === 'Escape' && this.isReading) {
                event.preventDefault();
                this.exitReading();
                return;
            }

            if (!typing && (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'v') {
                event.preventDefault();
                this.toggleReading();
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();

                if (this.canSave) {
                    void this.handleSave();
                }
            }
        }
    }
});
</script>

<template>
    <div class="site-painel-pagina">
        <KamiEmptyState
            v-if="needsLogin"
            title="SESSÃO EXPIRADA"
            description="Entre novamente para editar esta ficha."
        >
            <template #action>
                <KamiButton
                    variant="primary"
                    to="/entrar"
                >
                    ENTRAR
                </KamiButton>
            </template>
        </KamiEmptyState>

        <KamiEmptyState
            v-else-if="notFound"
            title="FICHA NÃO ENCONTRADA"
            description="A ficha não existe ou não pertence à sua conta."
            error
        >
            <template #action>
                <KamiButton to="/fichas">VOLTAR PARA FICHAS</KamiButton>
            </template>
        </KamiEmptyState>

        <KamiEmptyState
            v-else-if="isUnavailable"
            title="FICHA INDISPONÍVEL"
            description="Não foi possível carregar esta ficha agora. Tente novamente em instantes."
            error
        >
            <template #action>
                <KamiButton to="/fichas">VOLTAR PARA FICHAS</KamiButton>
            </template>
        </KamiEmptyState>

        <template v-else-if="sheet">
            <div
                v-if="isReading"
                class="site-editor__leitura"
            >
                <header class="site-editor__leitura-topo">
                    <div class="site-editor__leitura-identidade">
                        <p class="site-eyebrow">MODO LEITURA</p>
                        <h1 class="site-editor__leitura-titulo">{{ name || sheet.name }}</h1>
                        <p
                            v-if="hasChanges"
                            class="site-editor__leitura-aviso"
                        >
                            ALTERAÇÕES NÃO SALVAS · VISUALIZANDO O RASCUNHO
                        </p>
                    </div>
                    <div class="site-editor__leitura-acoes">
                        <KamiButton
                            size="sm"
                            @click="exitReading"
                        >
                            EDITAR
                        </KamiButton>
                        <KamiButton
                            size="sm"
                            to="/fichas"
                        >
                            FICHAS
                        </KamiButton>
                    </div>
                </header>

                <KamiSheetView
                    :name="name"
                    :attributes="previewAttributes"
                    :layout="previewLayout"
                    view-mode="documento"
                    :show-toggle="false"
                />
            </div>

            <header
                v-if="!isReading"
                class="site-editor__topo"
            >
                <div class="site-editor__topo-linha">
                    <div class="site-editor__topo-identidade">
                        <NuxtLink
                            to="/fichas"
                            class="site-editor__voltar"
                        >
                            <KamiIcon
                                name="arrow-left"
                                :size="16"
                            />
                            FICHAS
                        </NuxtLink>
                        <p class="site-eyebrow">EDITOR DE FICHA</p>
                        <h1 class="site-editor__titulo">
                            <input
                                v-if="!sheet.isLive"
                                id="ficha-nome"
                                v-model="name"
                                class="site-editor__titulo-input"
                                type="text"
                                maxlength="32"
                                autocomplete="off"
                                aria-label="Nome da ficha"
                            />
                            <span v-else>{{ sheet.name }}</span>
                        </h1>
                        <div class="site-editor__selos">
                            <KamiChip
                                v-if="sheet.isLive"
                                status="live"
                            >
                                AO VIVO
                            </KamiChip>
                            <KamiChip
                                v-if="sheet.isPublic"
                                status="dim"
                            >
                                PÚBLICA
                            </KamiChip>
                            <KamiChip
                                v-if="isLegacy"
                                status="warn"
                            >
                                LEGADA · SERÁ CONVERTIDA AO SALVAR
                            </KamiChip>
                            <span class="site-editor__versao">SALVA EM {{ lastSaved }}</span>
                        </div>
                    </div>

                    <div
                        v-if="!sheet.isLive"
                        class="site-editor__topo-acoes"
                    >
                        <KamiButton
                            size="sm"
                            title="Visualizar ficha (Ctrl+Shift+V)"
                            @click="enterReading"
                        >
                            VISUALIZAR
                        </KamiButton>
                        <KamiButton
                            v-if="hasChanges"
                            size="sm"
                            :disabled="isSaving"
                            @click="handleDiscard"
                        >
                            DESCARTAR
                        </KamiButton>
                        <KamiButton
                            variant="primary"
                            size="sm"
                            :disabled="!canSave"
                            @click="handleSave"
                        >
                            {{ isSaving ? 'SALVANDO...' : 'SALVAR' }}
                        </KamiButton>
                        <KamiButton
                            size="sm"
                            @click="openSettings"
                        >
                            CONFIGURAÇÕES
                        </KamiButton>
                    </div>
                </div>

                <p
                    v-if="!sheet.isLive && hasChanges"
                    class="site-editor__estado"
                    role="status"
                >
                    ALTERAÇÕES NÃO SALVAS · CTRL+S PARA SALVAR
                </p>
            </header>

            <KamiPanel
                v-if="!isReading && sheet.isLive"
                label="SOMENTE LEITURA"
                code="IRT"
            >
                <p class="site-prosa">
                    Esta ficha está vinculada a uma mensagem do Discord. O vínculo é gerenciado pelo bot e a edição pelo
                    site será liberada na D5, junto com a sincronização em tempo real.
                </p>
                <KamiSheetView
                    :name="sheet.name"
                    :attributes="sheet.attributes"
                    :layout="sheet.layout"
                />
            </KamiPanel>

            <template v-else-if="!isReading">
                <div
                    v-if="conflict || liveBlocked"
                    ref="alertBanner"
                    class="site-editor__conflito"
                    role="alert"
                    aria-live="assertive"
                    tabindex="-1"
                >
                    <p>
                        {{ errorMessage || 'A ficha foi alterada em outra janela. Recarregue para continuar.' }}
                    </p>
                    <p v-if="liveBlocked">
                        O rascunho local não foi salvo. Recarregar descarta estas alterações e abre a versão somente
                        leitura.
                    </p>
                    <KamiButton
                        size="sm"
                        :disabled="isReloading"
                        @click="reloadSheet"
                    >
                        {{ isReloading ? 'RECARREGANDO...' : 'RECARREGAR FICHA' }}
                    </KamiButton>
                </div>

                <p
                    v-if="successMessage"
                    class="site-config__sucesso"
                    role="status"
                >
                    {{ successMessage }}
                </p>
                <p
                    v-if="errorMessage && !conflict && !liveBlocked"
                    class="kami-field__error"
                    role="alert"
                >
                    {{ errorMessage }}
                </p>

                <div class="site-editor__seletores">
                    <div class="site-editor__seletor-modo">
                        <label
                            class="kami-field__label"
                            for="modo-editor"
                        >
                            MODO
                        </label>
                        <select
                            id="modo-editor"
                            class="kami-input"
                            :value="mode"
                            @change="handleModeSelect"
                        >
                            <option
                                v-for="option in modes"
                                :key="option.value"
                                :value="option.value"
                            >
                                {{ option.label }}
                            </option>
                        </select>
                    </div>

                    <div class="site-editor__seletor-secao">
                        <label
                            class="kami-field__label"
                            for="secao-ativa"
                        >
                            SEÇÃO
                        </label>
                        <div class="site-editor__seletor-linha">
                            <select
                                id="secao-ativa"
                                class="kami-input"
                                :value="activeSectionIndex"
                                @change="handleSectionSelect"
                            >
                                <option
                                    v-for="(section, index) in sections"
                                    :key="index"
                                    :value="index"
                                >
                                    {{ section.name || 'SEM NOME' }} ({{ section.attributes.length }})
                                </option>
                            </select>
                            <KamiButton
                                size="sm"
                                :disabled="!canAddSection()"
                                aria-label="ADICIONAR SEÇÃO"
                                @click="addSection"
                            >
                                <KamiIcon
                                    name="plus"
                                    :size="16"
                                />
                                SEÇÃO
                            </KamiButton>
                        </div>
                    </div>
                </div>

                <div class="site-editor__layout">
                    <aside
                        class="site-editor__sidebar"
                        aria-label="Seções da ficha"
                    >
                        <div class="site-editor__modo">
                            <p class="site-eyebrow">MODO</p>
                            <div
                                class="site-editor__modos"
                                role="group"
                                aria-label="Modo do editor"
                            >
                                <button
                                    v-for="option in modes"
                                    :key="option.value"
                                    type="button"
                                    class="site-editor__modo-btn"
                                    :class="{ 'site-editor__modo-btn--ativo': mode === option.value }"
                                    :aria-pressed="mode === option.value"
                                    @click="setMode(option.value)"
                                >
                                    {{ option.label }}
                                </button>
                            </div>
                        </div>

                        <div class="site-editor__sidebar-topo">
                            <p class="site-eyebrow">SEÇÕES</p>
                            <span class="site-editor__contagem">{{ sections.length }}</span>
                        </div>
                        <ul class="site-editor__secoes-lista">
                            <li
                                v-for="(section, index) in sections"
                                :key="index"
                                class="site-editor__secao-item"
                                :class="{
                                    'site-editor__secao-item--ativa': index === activeSectionIndex,
                                    'site-editor__secao-item--arrastando': dragSectionIndex === index,
                                    'site-editor__secao-item--alvo':
                                        dragOverSectionIndex === index &&
                                        dragSectionIndex !== null &&
                                        dragSectionIndex !== index
                                }"
                                draggable="true"
                                @dragstart="handleSectionDragStart(index, $event)"
                                @dragover="handleSectionDragOver(index, $event)"
                                @drop.prevent="handleSectionDrop(index)"
                                @dragend="clearDrag"
                            >
                                <button
                                    type="button"
                                    class="site-editor__secao-link"
                                    @click="selectSection(index)"
                                >
                                    <span class="site-editor__secao-nome">{{ section.name || 'SEM NOME' }}</span>
                                    <span class="site-editor__secao-contagem">{{ section.attributes.length }}</span>
                                </button>
                            </li>
                        </ul>
                        <KamiButton
                            size="sm"
                            :disabled="!canAddSection()"
                            aria-label="ADICIONAR SEÇÃO"
                            @click="addSection"
                        >
                            <KamiIcon
                                name="plus"
                                :size="16"
                            />
                            SEÇÃO
                        </KamiButton>
                    </aside>

                    <section
                        v-if="activeSection"
                        class="site-editor__conteudo"
                        :aria-label="contentLabel"
                    >
                        <template v-if="mode === 'editar'">
                            <header class="site-editor__secao-cabecalho">
                                <div class="site-editor__secao-campos">
                                    <div class="kami-field">
                                        <label
                                            class="kami-field__label"
                                            :for="`secao-nome-${activeSectionIndex}`"
                                        >
                                            NOME DA SEÇÃO
                                        </label>
                                        <input
                                            :id="`secao-nome-${activeSectionIndex}`"
                                            v-model="activeSection.name"
                                            class="kami-input"
                                            type="text"
                                            maxlength="20"
                                        />
                                    </div>
                                    <div class="kami-field">
                                        <label
                                            class="kami-field__label"
                                            :for="`secao-tipo-${activeSectionIndex}`"
                                        >
                                            TIPO
                                        </label>
                                        <select
                                            :id="`secao-tipo-${activeSectionIndex}`"
                                            class="kami-input"
                                            :value="activeSection.type"
                                            @change="changeSectionType(activeSection, $event)"
                                        >
                                            <option :value="0">PADRÃO</option>
                                            <option :value="1">DESCRIÇÃO</option>
                                            <option :value="2">CABEÇALHO</option>
                                            <option :value="3">STATUS</option>
                                            <option :value="4">GALERIA</option>
                                            <option :value="5">TABELA</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="site-editor__acoes">
                                    <KamiButton
                                        size="sm"
                                        @click="duplicateSection"
                                    >
                                        DUPLICAR
                                    </KamiButton>
                                    <KamiButton
                                        class="site-editor__icone"
                                        size="sm"
                                        :disabled="activeSectionIndex === 0"
                                        aria-label="Mover seção para cima"
                                        @click="moveSection(activeSectionIndex, -1)"
                                    >
                                        <KamiIcon
                                            name="arrow-up"
                                            :size="18"
                                        />
                                    </KamiButton>
                                    <KamiButton
                                        class="site-editor__icone"
                                        size="sm"
                                        :disabled="activeSectionIndex >= sections.length - 1"
                                        aria-label="Mover seção para baixo"
                                        @click="moveSection(activeSectionIndex, 1)"
                                    >
                                        <KamiIcon
                                            name="arrow-down"
                                            :size="18"
                                        />
                                    </KamiButton>
                                    <KamiButton
                                        size="sm"
                                        variant="danger"
                                        :disabled="sections.length === 1"
                                        @click="removeSection(activeSectionIndex)"
                                    >
                                        REMOVER
                                    </KamiButton>
                                </div>
                            </header>

                            <div
                                v-if="activeSection.type === 3"
                                class="site-editor__status"
                            >
                                <p
                                    v-if="!activeStatusItems.length"
                                    class="site-painel__nota"
                                >
                                    NENHUM STATUS. ADICIONE O PRIMEIRO ABAIXO.
                                </p>
                                <ul
                                    v-else
                                    class="site-editor__status-lista"
                                >
                                    <li
                                        v-for="(item, index) in activeStatusItems"
                                        :key="item.id"
                                        class="site-editor__status-item"
                                    >
                                        <input
                                            v-model="item.name"
                                            class="kami-input site-editor__status-nome"
                                            type="text"
                                            maxlength="32"
                                            aria-label="Nome do status"
                                        />
                                        <input
                                            type="color"
                                            class="site-editor__status-cor"
                                            :value="item.color"
                                            aria-label="Cor do status"
                                            @input="setStatusItemColor(index, $event)"
                                        />
                                        <label class="site-editor__status-blink">
                                            <input
                                                type="checkbox"
                                                :checked="item.blink"
                                                @change="toggleStatusItemBlink(index)"
                                            />
                                            PISCAR
                                        </label>
                                        <KamiButton
                                            size="sm"
                                            :aria-pressed="item.active"
                                            @click="toggleStatusItemActive(index)"
                                        >
                                            {{ item.active ? 'ATIVO' : 'INATIVO' }}
                                        </KamiButton>
                                        <div class="site-editor__acoes site-editor__acoes--linha">
                                            <KamiButton
                                                size="sm"
                                                :disabled="index === 0"
                                                aria-label="Mover status para cima"
                                                @click="moveStatusItem(index, -1)"
                                            >
                                                <KamiIcon
                                                    name="arrow-up"
                                                    :size="16"
                                                />
                                            </KamiButton>
                                            <KamiButton
                                                size="sm"
                                                :disabled="index === activeStatusItems.length - 1"
                                                aria-label="Mover status para baixo"
                                                @click="moveStatusItem(index, 1)"
                                            >
                                                <KamiIcon
                                                    name="arrow-down"
                                                    :size="16"
                                                />
                                            </KamiButton>
                                            <KamiButton
                                                size="sm"
                                                variant="danger"
                                                aria-label="Remover status"
                                                @click="removeStatusItem(index)"
                                            >
                                                <KamiIcon
                                                    name="trash"
                                                    :size="16"
                                                />
                                            </KamiButton>
                                        </div>
                                        <label class="site-editor__status-icone">
                                            <span class="site-editor__status-icone-rotulo">ÍCONE (URL)</span>
                                            <input
                                                v-model="item.icon"
                                                class="kami-input"
                                                type="url"
                                                maxlength="2048"
                                                placeholder="Vazio usa o ícone padrão"
                                                aria-label="URL do ícone do status"
                                            />
                                        </label>
                                    </li>
                                </ul>
                                <KamiButton
                                    size="sm"
                                    :disabled="activeStatusItems.length >= 32"
                                    @click="addStatusItem"
                                >
                                    <KamiIcon
                                        name="plus"
                                        :size="16"
                                    />
                                    STATUS
                                </KamiButton>
                            </div>

                            <div
                                v-if="activeSection.type === 5 && activeTableValue"
                                class="site-editor__tabela"
                            >
                                <div class="site-editor__tabela-scroll">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th
                                                    v-for="(column, columnIndex) in activeTableValue.columns"
                                                    :key="columnIndex"
                                                >
                                                    <div class="site-editor__tabela-coluna">
                                                        <input
                                                            class="kami-input"
                                                            type="text"
                                                            maxlength="32"
                                                            :value="column"
                                                            aria-label="Nome da coluna"
                                                            @input="updateTableColumn(columnIndex, $event)"
                                                        />
                                                        <KamiButton
                                                            size="sm"
                                                            variant="danger"
                                                            :disabled="activeTableValue.columns.length <= 2"
                                                            aria-label="Remover coluna"
                                                            @click="removeTableColumn(columnIndex)"
                                                        >
                                                            <KamiIcon
                                                                name="trash"
                                                                :size="16"
                                                            />
                                                        </KamiButton>
                                                    </div>
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr
                                                v-for="(row, rowIndex) in activeTableValue.rows"
                                                :key="rowIndex"
                                            >
                                                <td
                                                    v-for="(cell, columnIndex) in row"
                                                    :key="columnIndex"
                                                >
                                                    <input
                                                        class="kami-input"
                                                        type="text"
                                                        maxlength="128"
                                                        :value="cell"
                                                        aria-label="Célula da tabela"
                                                        @input="updateTableCell(rowIndex, columnIndex, $event)"
                                                    />
                                                </td>
                                                <td>
                                                    <KamiButton
                                                        size="sm"
                                                        variant="danger"
                                                        aria-label="Remover linha"
                                                        @click="removeTableRow(rowIndex)"
                                                    >
                                                        <KamiIcon
                                                            name="trash"
                                                            :size="16"
                                                        />
                                                    </KamiButton>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <div class="site-editor__acoes">
                                    <KamiButton
                                        size="sm"
                                        :disabled="activeTableValue.rows.length >= 100"
                                        @click="addTableRow"
                                    >
                                        <KamiIcon
                                            name="plus"
                                            :size="16"
                                        />
                                        LINHA
                                    </KamiButton>
                                    <KamiButton
                                        size="sm"
                                        :disabled="activeTableValue.columns.length >= 8"
                                        @click="addTableColumn"
                                    >
                                        <KamiIcon
                                            name="plus"
                                            :size="16"
                                        />
                                        COLUNA
                                    </KamiButton>
                                </div>
                            </div>

                            <div
                                v-if="activeSection.type === 2 && activeHeader"
                                class="site-editor__destaque"
                            >
                                <div class="site-editor__destaque-texto">
                                    <div class="site-editor__campo">
                                        <span class="site-editor__campo-rotulo">TÍTULO</span>
                                        <textarea
                                            class="kami-input site-editor__destaque-titulo"
                                            rows="1"
                                            maxlength="1024"
                                            :value="headerTitle ? String(headerTitle.value) : ''"
                                            aria-label="Título do cabeçalho"
                                            @input="updateHeaderField('title', $event)"
                                        ></textarea>
                                    </div>
                                    <div class="site-editor__campo">
                                        <span class="site-editor__campo-rotulo">SUBTÍTULO</span>
                                        <input
                                            class="kami-input"
                                            type="text"
                                            maxlength="1024"
                                            :value="headerSubtitle ? String(headerSubtitle.value) : ''"
                                            aria-label="Subtítulo do cabeçalho"
                                            @input="updateHeaderField('subtitle', $event)"
                                        />
                                    </div>
                                </div>

                                <div class="site-editor__campo site-editor__destaque-imagem">
                                    <span class="site-editor__campo-rotulo">IMAGEM</span>
                                    <div class="site-editor__valor-imagem">
                                        <input
                                            class="kami-input"
                                            type="url"
                                            maxlength="2048"
                                            placeholder="https://exemplo.com/imagem.png"
                                            :value="headerImage ? String(headerImage.value) : ''"
                                            aria-label="URL da imagem do cabeçalho"
                                            @input="updateHeaderField('image', $event)"
                                        />
                                        <img
                                            v-if="
                                                headerImage &&
                                                isImageUrl(String(headerImage.value)) &&
                                                !isEditorImageBroken(String(headerImage.value))
                                            "
                                            class="site-editor__thumb"
                                            :src="String(headerImage.value)"
                                            :alt="headerImage.name"
                                            loading="lazy"
                                            referrerpolicy="no-referrer"
                                            @error="markEditorImageBroken(String(headerImage.value))"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div
                                v-if="activeSection.type === 1 && activeSection.attributes.length > 1"
                                class="site-editor__descricao-aviso"
                                role="alert"
                            >
                                <p>
                                    ESTA SEÇÃO DE DESCRIÇÃO AINDA TEM
                                    {{ activeSection.attributes.length }} ATRIBUTOS ANTIGOS. CONVERTA EM UM TEXTO ÚNICO.
                                </p>
                                <KamiButton
                                    size="sm"
                                    @click="convertDescription"
                                >
                                    CONVERTER EM TEXTO
                                </KamiButton>
                            </div>

                            <div
                                v-if="activeSection.type === 1 && activeSection.attributes.length <= 1"
                                class="site-editor__descricao"
                            >
                                <label
                                    class="kami-field__label"
                                    for="descricao-texto"
                                >
                                    TEXTO DA DESCRIÇÃO
                                </label>
                                <textarea
                                    id="descricao-texto"
                                    class="kami-input site-editor__descricao-texto"
                                    :value="descriptionText"
                                    :maxlength="descriptionMaxLength"
                                    rows="8"
                                    @input="updateDescription"
                                ></textarea>
                                <p class="site-editor__descricao-contador">
                                    {{ descriptionText.length }} / {{ descriptionMaxLength }}
                                </p>
                            </div>

                            <div
                                v-if="
                                    activeSection.type === 0 ||
                                    activeSection.type === 2 ||
                                    activeSection.type === 4 ||
                                    (activeSection.type === 1 && activeSection.attributes.length > 1)
                                "
                                class="site-editor__atributos"
                            >
                                <p
                                    v-if="!activeAttributeEntries.length"
                                    class="site-painel__nota"
                                >
                                    ESTA SEÇÃO AINDA NÃO TEM ATRIBUTOS.
                                </p>

                                <template
                                    v-for="(attribute, attributeIndex) in activeSection.attributes"
                                    :key="attributeIndex"
                                >
                                    <div
                                        v-if="!isHeaderRole(attribute)"
                                        class="site-editor__atributo"
                                        :class="{
                                            'site-editor__atributo--arrastando': dragAttributeIndex === attributeIndex,
                                            'site-editor__atributo--alvo':
                                                dragOverAttributeIndex === attributeIndex &&
                                                dragAttributeIndex !== null &&
                                                dragAttributeIndex !== attributeIndex,
                                            'site-editor__atributo--expandido':
                                                attribute.type === 3 && isListExpanded(attribute)
                                        }"
                                        :draggable="!isMobileViewport"
                                        @dragstart="handleAttributeDragStart(attributeIndex, $event)"
                                        @dragover="handleAttributeDragOver(attributeIndex, $event)"
                                        @drop.prevent="handleAttributeDrop(attributeIndex)"
                                        @dragend="clearDrag"
                                    >
                                        <span
                                            class="site-editor__alca"
                                            aria-hidden="true"
                                            title="Arrastar para reordenar"
                                        >
                                            <KamiIcon
                                                name="grip"
                                                :size="16"
                                            />
                                        </span>

                                        <div class="site-editor__campo site-editor__campo--tipo">
                                            <span class="site-editor__campo-rotulo">TIPO</span>
                                            <select
                                                class="kami-input site-editor__tipo"
                                                :value="attribute.type"
                                                :aria-label="`Tipo do atributo ${attribute.name || attributeIndex + 1}`"
                                                @change="changeAttributeType(attribute, $event)"
                                            >
                                                <option :value="0">TEXTO</option>
                                                <option :value="1">NÚMERO</option>
                                                <option :value="2">IMAGEM</option>
                                                <option :value="3">LISTA</option>
                                                <option :value="4">BARRA</option>
                                            </select>
                                        </div>

                                        <div class="site-editor__campo site-editor__campo--nome">
                                            <span class="site-editor__campo-rotulo">NOME</span>
                                            <input
                                                :id="`atributo-nome-${activeSectionIndex}-${attributeIndex}`"
                                                v-model="attribute.name"
                                                class="kami-input site-editor__atributo-nome"
                                                type="text"
                                                maxlength="32"
                                                :aria-label="`Nome do atributo ${attributeIndex + 1}`"
                                            />
                                        </div>

                                        <div
                                            v-if="attribute.type !== 4"
                                            class="site-editor__campo site-editor__campo--valor"
                                        >
                                            <span class="site-editor__campo-rotulo">VALOR</span>
                                            <div class="site-editor__valor">
                                                <textarea
                                                    v-if="attribute.type === 0"
                                                    :id="`atributo-valor-${activeSectionIndex}-${attributeIndex}`"
                                                    class="kami-input site-editor__valor-texto"
                                                    :value="String(attribute.value)"
                                                    rows="1"
                                                    maxlength="1024"
                                                    :aria-label="`Texto de ${attribute.name || attributeIndex + 1}`"
                                                    @input="updateText(attribute, $event)"
                                                ></textarea>

                                                <input
                                                    v-else-if="attribute.type === 1"
                                                    :id="`atributo-valor-${activeSectionIndex}-${attributeIndex}`"
                                                    class="kami-input"
                                                    type="text"
                                                    inputmode="numeric"
                                                    pattern="-?[0-9]*"
                                                    maxlength="32"
                                                    :value="String(attribute.value)"
                                                    :aria-label="`Número de ${attribute.name || attributeIndex + 1}`"
                                                    @input="updateText(attribute, $event)"
                                                />

                                                <div
                                                    v-else-if="attribute.type === 2"
                                                    class="site-editor__valor-imagem"
                                                >
                                                    <input
                                                        :id="`atributo-valor-${activeSectionIndex}-${attributeIndex}`"
                                                        class="kami-input"
                                                        type="url"
                                                        maxlength="2048"
                                                        placeholder="https://exemplo.com/imagem.png"
                                                        :value="String(attribute.value)"
                                                        :aria-label="`URL da imagem de ${attribute.name || attributeIndex + 1}`"
                                                        @input="updateText(attribute, $event)"
                                                    />
                                                    <img
                                                        v-if="
                                                            isImageUrl(String(attribute.value)) &&
                                                            !isEditorImageBroken(String(attribute.value))
                                                        "
                                                        class="site-editor__thumb"
                                                        :src="String(attribute.value)"
                                                        :alt="attribute.name"
                                                        loading="lazy"
                                                        referrerpolicy="no-referrer"
                                                        @error="markEditorImageBroken(String(attribute.value))"
                                                    />
                                                </div>

                                                <div
                                                    v-else-if="attribute.type === 3"
                                                    class="site-editor__valor-lista"
                                                >
                                                    <span class="site-editor__lista-resumo">
                                                        {{ asList(attribute.value).items.length }} ITENS
                                                    </span>
                                                    <button
                                                        type="button"
                                                        class="site-editor__lista-toggle"
                                                        @click="toggleList(attribute)"
                                                    >
                                                        {{ isListExpanded(attribute) ? 'FECHAR' : 'EDITAR' }}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div
                                            v-else
                                            class="site-editor__valor-barra"
                                        >
                                            <label class="site-editor__barra-campo">
                                                <span>ATUAL</span>
                                                <input
                                                    class="kami-input"
                                                    type="text"
                                                    inputmode="numeric"
                                                    :value="asBar(attribute.value).actual"
                                                    aria-label="Valor atual da barra"
                                                    @input="updateBar(attribute, 'actual', $event)"
                                                />
                                            </label>
                                            <label class="site-editor__barra-campo">
                                                <span>MÍN.</span>
                                                <input
                                                    class="kami-input"
                                                    type="text"
                                                    inputmode="numeric"
                                                    :value="asBar(attribute.value).min"
                                                    aria-label="Valor mínimo da barra"
                                                    @input="updateBar(attribute, 'min', $event)"
                                                />
                                            </label>
                                            <label class="site-editor__barra-campo">
                                                <span>MÁX.</span>
                                                <input
                                                    class="kami-input"
                                                    type="text"
                                                    inputmode="numeric"
                                                    :value="asBar(attribute.value).max"
                                                    aria-label="Valor máximo da barra"
                                                    @input="updateBar(attribute, 'max', $event)"
                                                />
                                            </label>
                                        </div>

                                        <div class="site-editor__campo site-editor__campo--acoes">
                                            <span
                                                class="site-editor__campo-rotulo"
                                                aria-hidden="true"
                                                >&nbsp;</span
                                            >
                                            <div class="site-editor__acoes site-editor__acoes--linha">
                                                <KamiButton
                                                    v-if="attribute.type === 4"
                                                    size="sm"
                                                    :aria-label="`Ajustes da barra ${attribute.name || 'atributo'}`"
                                                    @click="openBarSettings(attribute)"
                                                >
                                                    <KamiIcon
                                                        name="settings"
                                                        :size="16"
                                                    />
                                                </KamiButton>
                                                <KamiButton
                                                    size="sm"
                                                    aria-label="Duplicar atributo"
                                                    @click="duplicateAttribute(attribute)"
                                                >
                                                    <KamiIcon
                                                        name="copy"
                                                        :size="16"
                                                    />
                                                </KamiButton>
                                                <KamiButton
                                                    size="sm"
                                                    :disabled="attributeIndex === 0"
                                                    aria-label="Mover atributo para cima"
                                                    @click="moveAttribute(activeSection, attributeIndex, -1)"
                                                >
                                                    <KamiIcon
                                                        name="arrow-up"
                                                        :size="16"
                                                    />
                                                </KamiButton>
                                                <KamiButton
                                                    size="sm"
                                                    :disabled="attributeIndex >= activeSection.attributes.length - 1"
                                                    aria-label="Mover atributo para baixo"
                                                    @click="moveAttribute(activeSection, attributeIndex, 1)"
                                                >
                                                    <KamiIcon
                                                        name="arrow-down"
                                                        :size="16"
                                                    />
                                                </KamiButton>
                                                <KamiButton
                                                    size="sm"
                                                    variant="danger"
                                                    aria-label="Remover atributo"
                                                    @click="removeAttribute(activeSection, attributeIndex)"
                                                >
                                                    <KamiIcon
                                                        name="trash"
                                                        :size="16"
                                                    />
                                                </KamiButton>
                                            </div>
                                        </div>

                                        <div
                                            v-if="attribute.type === 3 && isListExpanded(attribute)"
                                            class="site-editor__lista-editor"
                                        >
                                            <div
                                                v-for="(item, itemIndex) in asList(attribute.value).items"
                                                :key="itemIndex"
                                                class="site-editor__lista-linha"
                                            >
                                                <input
                                                    class="kami-input"
                                                    type="text"
                                                    maxlength="32"
                                                    placeholder="Nome"
                                                    :value="item.name"
                                                    :aria-label="`Nome do item ${itemIndex + 1}`"
                                                    @input="updateListItem(attribute, itemIndex, 'name', $event)"
                                                />
                                                <input
                                                    class="kami-input site-editor__lista-quantidade"
                                                    type="text"
                                                    inputmode="numeric"
                                                    maxlength="32"
                                                    placeholder="Qtd."
                                                    :value="item.quantity"
                                                    :aria-label="`Quantidade do item ${itemIndex + 1}`"
                                                    @input="updateListItem(attribute, itemIndex, 'quantity', $event)"
                                                />
                                                <KamiButton
                                                    size="sm"
                                                    variant="danger"
                                                    @click="removeListItem(attribute, itemIndex)"
                                                >
                                                    REMOVER
                                                </KamiButton>
                                            </div>
                                            <KamiButton
                                                size="sm"
                                                :disabled="!canAddListItem(attribute)"
                                                @click="addListItem(attribute)"
                                            >
                                                <KamiIcon
                                                    name="plus"
                                                    :size="16"
                                                />
                                                ITEM
                                            </KamiButton>
                                        </div>
                                    </div>
                                </template>

                                <KamiButton
                                    v-if="activeSection.type !== 1"
                                    size="sm"
                                    :disabled="!canAddAttribute(activeSection)"
                                    aria-label="ADICIONAR ATRIBUTO"
                                    @click="addAttribute(activeSection)"
                                >
                                    <KamiIcon
                                        name="plus"
                                        :size="16"
                                    />
                                    ATRIBUTO
                                </KamiButton>
                            </div>
                        </template>

                        <div
                            v-else-if="mode === 'posicionamento'"
                            class="site-editor__posicionamento"
                        >
                            <div class="site-editor__posicionamento-busca">
                                <label
                                    class="kami-field__label"
                                    for="estrutura-busca"
                                >
                                    BUSCAR ATRIBUTO
                                </label>
                                <input
                                    id="estrutura-busca"
                                    v-model="structureFilter"
                                    class="kami-input"
                                    type="search"
                                    placeholder="Nome do atributo ou da seção"
                                />
                                <p class="kami-field__hint">
                                    Arraste os atributos entre as seções ou use os botões de cada item. Nada muda no
                                    formato salvo.
                                </p>
                            </div>

                            <div class="site-editor__posicionamento-grade">
                                <section
                                    v-for="entry in structureSections"
                                    :key="entry.index"
                                    class="site-editor__posicionamento-card"
                                    :class="{
                                        'site-editor__posicionamento-card--ativa': entry.index === activeSectionIndex,
                                        'site-editor__posicionamento-card--bloqueada': !sectionAcceptsAttributes(
                                            entry.section
                                        )
                                    }"
                                    @dragover="handleStructureDragOverSection(entry.section, $event)"
                                    @drop.prevent="handleStructureDropOnSection(entry.index)"
                                >
                                    <header class="site-editor__posicionamento-topo">
                                        <button
                                            type="button"
                                            class="site-editor__posicionamento-secao"
                                            @click="goToSection(entry.index)"
                                        >
                                            <span class="site-editor__posicionamento-secao-nome">{{
                                                entry.section.name || 'SEM NOME'
                                            }}</span>
                                            <span class="site-editor__secao-contagem">{{
                                                entry.attributes.length
                                            }}</span>
                                        </button>
                                    </header>

                                    <p
                                        v-if="sectionAttributeNotice(entry.section)"
                                        class="site-painel__nota"
                                    >
                                        {{ sectionAttributeNotice(entry.section) }}
                                    </p>
                                    <p
                                        v-else-if="!entry.attributes.length"
                                        class="site-painel__nota"
                                    >
                                        SEM ATRIBUTOS. ARRASTE UM ATRIBUTO PARA CÁ.
                                    </p>

                                    <ul
                                        v-else
                                        class="site-editor__posicionamento-lista"
                                    >
                                        <li
                                            v-for="row in entry.attributes"
                                            :key="row.index"
                                            class="site-editor__posicionamento-item"
                                            :class="{
                                                'site-editor__posicionamento-item--arrastando':
                                                    dragStructureFrom?.section === entry.index &&
                                                    dragStructureFrom?.attribute === row.index,
                                                'site-editor__posicionamento-item--alvo':
                                                    dragStructureOver?.section === entry.index &&
                                                    dragStructureOver?.attribute === row.index &&
                                                    !(
                                                        dragStructureFrom?.section === entry.index &&
                                                        dragStructureFrom?.attribute === row.index
                                                    )
                                            }"
                                            :draggable="!isMobileViewport"
                                            @dragstart="handleStructureDragStart(entry.index, row.index, $event)"
                                            @dragover="handleStructureDragOver(entry.index, row.index, $event)"
                                            @drop.prevent="handleStructureDrop(entry.index, row.index)"
                                            @dragend="clearStructureDrag"
                                        >
                                            <div class="site-editor__posicionamento-item-topo">
                                                <span
                                                    class="site-editor__alca"
                                                    aria-hidden="true"
                                                    title="Arrastar para reordenar"
                                                >
                                                    <KamiIcon
                                                        name="grip"
                                                        :size="16"
                                                    />
                                                </span>
                                                <span class="site-editor__posicionamento-nome">{{
                                                    row.attribute.name || 'SEM NOME'
                                                }}</span>
                                                <span class="site-editor__posicionamento-tipo">{{
                                                    attributeTypeLabel(row.attribute.type)
                                                }}</span>
                                            </div>
                                            <div class="site-editor__posicionamento-item-acoes">
                                                <KamiButton
                                                    size="sm"
                                                    :disabled="row.index === entry.attributes[0]?.index"
                                                    :aria-label="`Mover ${row.attribute.name} para cima`"
                                                    @click="moveAttribute(entry.section, row.index, -1)"
                                                >
                                                    <KamiIcon
                                                        name="arrow-up"
                                                        :size="16"
                                                    />
                                                </KamiButton>
                                                <KamiButton
                                                    size="sm"
                                                    :disabled="
                                                        row.index ===
                                                        entry.attributes[entry.attributes.length - 1]?.index
                                                    "
                                                    :aria-label="`Mover ${row.attribute.name} para baixo`"
                                                    @click="moveAttribute(entry.section, row.index, 1)"
                                                >
                                                    <KamiIcon
                                                        name="arrow-down"
                                                        :size="16"
                                                    />
                                                </KamiButton>
                                                <select
                                                    class="kami-input site-editor__posicionamento-destino"
                                                    :value="''"
                                                    :aria-label="`Mover ${row.attribute.name} para outra seção`"
                                                    @change="moveToSection(entry.index, row.index, $event)"
                                                >
                                                    <option value="">MOVER PARA…</option>
                                                    <template
                                                        v-for="(target, targetIndex) in sections"
                                                        :key="targetIndex"
                                                    >
                                                        <option
                                                            v-if="canMoveAttributeTo(row.attribute, target)"
                                                            :value="targetIndex"
                                                            :disabled="targetIndex === entry.index"
                                                        >
                                                            {{ target.name || 'SEM NOME' }}
                                                        </option>
                                                    </template>
                                                </select>
                                            </div>
                                        </li>
                                    </ul>

                                    <KamiButton
                                        v-if="
                                            entry.section.type === 0 ||
                                            entry.section.type === 2 ||
                                            entry.section.type === 4
                                        "
                                        size="sm"
                                        :disabled="!canAddAttribute(entry.section)"
                                        @click="addAttribute(entry.section)"
                                    >
                                        <KamiIcon
                                            name="plus"
                                            :size="16"
                                        />
                                        ATRIBUTO
                                    </KamiButton>
                                </section>
                            </div>
                        </div>

                        <div
                            v-else
                            class="site-editor__estrutura"
                        >
                            <div class="site-editor__estrutura-topo">
                                <div>
                                    <p class="site-eyebrow">ESTRUTURA DA FICHA</p>
                                    <p class="site-editor__estrutura-dica">
                                        Clique numa seção para ajustar a largura. A grade do modo documento tem 12
                                        colunas; seções que cabem na mesma linha ficam lado a lado.
                                    </p>
                                </div>
                                <span class="site-editor__estrutura-total">12 COLUNAS</span>
                                <KamiButton
                                    class="site-editor__estrutura-ajustes"
                                    size="sm"
                                    @click="scrollToInspector"
                                >
                                    AJUSTES DA SEÇÃO
                                </KamiButton>
                            </div>

                            <div class="site-editor__estrutura-corpo">
                                <div class="site-editor__estrutura-canvas">
                                    <KamiSheetView
                                        :name="name"
                                        :attributes="previewAttributes"
                                        :layout="previewLayout"
                                        view-mode="documento"
                                        :show-toggle="false"
                                        editable
                                        adjustable
                                        :selected-section="activeSectionIndex"
                                        @select-section="selectSection"
                                        @adjust-bar="adjustBar"
                                        @adjust-quantity="handleAdjustQuantity"
                                        @add-list-item="handleAddListItem"
                                        @remove-list-item="handleRemoveListItem"
                                        @move-list-item="handleMoveListItem"
                                        @update-list-name="handleUpdateListItemName"
                                        @update-description="handleUpdateDescription"
                                        @toggle-status="handleToggleStatus"
                                    />
                                </div>

                                <aside
                                    ref="inspectorPanel"
                                    class="site-editor__estrutura-inspetor"
                                    aria-label="Ajustes da seção selecionada"
                                >
                                    <header class="site-editor__inspetor-topo">
                                        <p class="site-eyebrow">SEÇÃO SELECIONADA</p>
                                        <h2 class="site-editor__estrutura-titulo">
                                            {{ activeSection.name || 'SEM NOME' }}
                                        </h2>
                                        <KamiButton
                                            size="sm"
                                            @click="goToSection(activeSectionIndex)"
                                        >
                                            EDITAR CONTEÚDO
                                        </KamiButton>
                                    </header>

                                    <section class="site-editor__inspetor-grupo">
                                        <h3 class="site-editor__inspetor-grupo-titulo">LARGURA DA SEÇÃO</h3>
                                        <div class="site-editor__largura">
                                            <input
                                                class="kami-input site-editor__largura-input"
                                                type="number"
                                                min="1"
                                                max="12"
                                                :value="activeLayout.span"
                                                aria-label="Largura da seção na grade"
                                                @input="handleSpanInput(activeSectionIndex, $event)"
                                                @change="handleSpanCommit(activeSectionIndex, $event)"
                                            />
                                            <span class="site-editor__largura-total">de 12 colunas</span>
                                        </div>
                                        <div
                                            class="site-editor__largura-atalhos"
                                            role="group"
                                            aria-label="Larguras rápidas"
                                        >
                                            <button
                                                v-for="option in spanOptions"
                                                :key="option"
                                                type="button"
                                                class="site-editor__largura-btn"
                                                :class="{
                                                    'site-editor__largura-btn--ativo': activeLayout.span === option
                                                }"
                                                :aria-pressed="activeLayout.span === option"
                                                @click="setSpan(activeSectionIndex, option)"
                                            >
                                                {{ option }}
                                            </button>
                                        </div>
                                    </section>

                                    <section
                                        v-if="activeSection.type === 0 || activeSection.type === 2"
                                        class="site-editor__inspetor-grupo"
                                    >
                                        <h3 class="site-editor__inspetor-grupo-titulo">GRADE DA SEÇÃO</h3>
                                        <div class="site-editor__inspetor-dupla">
                                            <label class="site-editor__campo">
                                                <span class="site-editor__campo-rotulo">COLUNAS</span>
                                                <select
                                                    class="kami-input"
                                                    :value="activeLayout.columns"
                                                    aria-label="Colunas de atributos da seção"
                                                    @change="handleColumnsChange(activeSectionIndex, $event)"
                                                >
                                                    <option
                                                        v-for="option in columnOptions"
                                                        :key="option"
                                                        :value="option"
                                                    >
                                                        {{ option }}
                                                    </option>
                                                </select>
                                            </label>
                                            <label class="site-editor__campo">
                                                <span class="site-editor__campo-rotulo">LINHAS</span>
                                                <select
                                                    class="kami-input"
                                                    :value="activeLayout.rows ?? 'auto'"
                                                    aria-label="Linhas da seção"
                                                    @change="handleRowsChange(activeSectionIndex, $event)"
                                                >
                                                    <option value="auto">AUTO</option>
                                                    <option
                                                        v-for="option in rowOptions"
                                                        :key="option"
                                                        :value="option"
                                                    >
                                                        {{ option }}
                                                    </option>
                                                </select>
                                            </label>
                                        </div>
                                        <p class="site-editor__inspetor-hint">
                                            <template v-if="activeLayout.rows === null">
                                                AUTO: a altura das linhas acompanha o conteúdo.
                                            </template>
                                            <template v-else>
                                                {{ activeLayout.rows }} linha(s) de 56px; ajuste a altura de cada
                                                atributo abaixo.
                                            </template>
                                        </p>
                                        <label class="site-editor__dense">
                                            <input
                                                type="checkbox"
                                                :checked="activeLayout.dense"
                                                @change="toggleDense(activeSectionIndex)"
                                            />
                                            <span>PREENCHER ESPAÇOS VAZIOS</span>
                                        </label>
                                    </section>

                                    <section
                                        v-if="activeSection.type === 4"
                                        class="site-editor__inspetor-grupo"
                                    >
                                        <h3 class="site-editor__inspetor-grupo-titulo">GALERIA</h3>
                                        <label class="site-editor__campo">
                                            <span class="site-editor__campo-rotulo">COLUNAS</span>
                                            <select
                                                class="kami-input"
                                                :value="activeLayout.columns"
                                                aria-label="Colunas da galeria"
                                                @change="handleColumnsChange(activeSectionIndex, $event)"
                                            >
                                                <option
                                                    v-for="option in galleryColumnOptions"
                                                    :key="option"
                                                    :value="option"
                                                >
                                                    {{ option }}
                                                </option>
                                            </select>
                                        </label>
                                        <p class="site-editor__inspetor-hint">
                                            De 1 a 6; cada imagem pode ocupar de 1 a
                                            {{ activeLayout.columns }} coluna(s).
                                        </p>
                                    </section>

                                    <section
                                        v-if="activeSection.type === 2 && activeHeader"
                                        class="site-editor__inspetor-grupo"
                                    >
                                        <h3 class="site-editor__inspetor-grupo-titulo">CABEÇALHO</h3>
                                        <div class="site-editor__inspetor-dupla">
                                            <label class="site-editor__campo">
                                                <span class="site-editor__campo-rotulo">LARGURA DA IMAGEM</span>
                                                <input
                                                    class="kami-input"
                                                    type="number"
                                                    min="1"
                                                    max="12"
                                                    :value="activeHeader.imageWidth"
                                                    aria-label="Largura da imagem do cabeçalho"
                                                    @input="setHeaderImageWidth"
                                                />
                                            </label>
                                            <label class="site-editor__campo">
                                                <span class="site-editor__campo-rotulo">TAMANHO DO TÍTULO</span>
                                                <input
                                                    class="kami-input"
                                                    type="number"
                                                    min="32"
                                                    max="96"
                                                    :value="activeHeader.titleSize"
                                                    aria-label="Tamanho do título"
                                                    @input="setHeaderTitleSize"
                                                />
                                            </label>
                                        </div>
                                        <p class="site-editor__inspetor-hint">
                                            O título nunca quebra; a fonte encolhe se faltar espaço.
                                        </p>
                                    </section>

                                    <section
                                        v-if="
                                            activeSection.type === 0 ||
                                            activeSection.type === 2 ||
                                            activeSection.type === 4
                                        "
                                        class="site-editor__inspetor-grupo"
                                    >
                                        <h3 class="site-editor__inspetor-grupo-titulo">ATRIBUTOS</h3>
                                        <p class="site-editor__inspetor-hint">
                                            <template v-if="activeSection.type === 4">
                                                Colunas: 1 a {{ activeLayout.columns }}; cada imagem ocupa de 1 a
                                                {{ activeLayout.columns }}.
                                            </template>
                                            <template v-else>
                                                Colunas: 1 a {{ activeLayout.columns }}.
                                                <template v-if="activeLayout.rows === null">
                                                    Linhas: defina as linhas da seção para ajustar a altura.
                                                </template>
                                                <template v-else>Linhas: 1 a {{ activeLayout.rows }}.</template>
                                            </template>
                                        </p>
                                        <p
                                            v-if="!activeAttributeEntries.length"
                                            class="site-painel__nota"
                                        >
                                            ESTA SEÇÃO AINDA NÃO TEM ATRIBUTOS.
                                        </p>
                                        <ul
                                            v-else
                                            class="site-editor__full-lista"
                                        >
                                            <template
                                                v-for="(attribute, attributeIndex) in activeSection.attributes"
                                                :key="attributeIndex"
                                            >
                                                <li v-if="!isHeaderRole(attribute)">
                                                    <div class="site-editor__atributo-grade">
                                                        <div class="site-editor__atributo-grade-topo">
                                                            <span class="site-editor__full-nome">{{
                                                                attribute.name || 'SEM NOME'
                                                            }}</span>
                                                            <span class="site-editor__posicionamento-tipo">{{
                                                                attributeTypeLabel(attribute.type)
                                                            }}</span>
                                                        </div>
                                                        <div class="site-editor__atributo-grade-controles">
                                                            <label class="site-editor__grade-campo">
                                                                <span class="site-editor__grade-rotulo">COL.</span>
                                                                <input
                                                                    class="kami-input site-editor__grade-input"
                                                                    type="number"
                                                                    min="1"
                                                                    :max="activeLayout.columns"
                                                                    :value="
                                                                        attributeSpanAt(
                                                                            activeSectionIndex,
                                                                            attributeIndex
                                                                        )
                                                                    "
                                                                    :aria-label="`Largura de ${attribute.name || 'atributo'}`"
                                                                    @input="
                                                                        handleAttributeSpanInput(
                                                                            activeSectionIndex,
                                                                            attributeIndex,
                                                                            $event
                                                                        )
                                                                    "
                                                                    @change="
                                                                        handleAttributeSpanCommit(
                                                                            activeSectionIndex,
                                                                            attributeIndex,
                                                                            $event
                                                                        )
                                                                    "
                                                                />
                                                            </label>
                                                            <label
                                                                v-if="activeSection.type !== 4"
                                                                class="site-editor__grade-campo"
                                                                :class="{
                                                                    'site-editor__grade-campo--desativado':
                                                                        activeLayout.rows === null
                                                                }"
                                                            >
                                                                <span class="site-editor__grade-rotulo">LIN.</span>
                                                                <input
                                                                    class="kami-input site-editor__grade-input"
                                                                    type="number"
                                                                    min="1"
                                                                    :max="activeLayout.rows ?? 1"
                                                                    :value="
                                                                        attributeRowsAt(
                                                                            activeSectionIndex,
                                                                            attributeIndex
                                                                        )
                                                                    "
                                                                    :disabled="activeLayout.rows === null"
                                                                    :title="
                                                                        activeLayout.rows === null
                                                                            ? 'Defina as linhas da seção para ajustar a altura'
                                                                            : undefined
                                                                    "
                                                                    :aria-label="`Altura de ${attribute.name || 'atributo'}`"
                                                                    @input="
                                                                        handleAttributeRowsInput(
                                                                            activeSectionIndex,
                                                                            attributeIndex,
                                                                            $event
                                                                        )
                                                                    "
                                                                    @change="
                                                                        handleAttributeRowsCommit(
                                                                            activeSectionIndex,
                                                                            attributeIndex,
                                                                            $event
                                                                        )
                                                                    "
                                                                />
                                                            </label>
                                                        </div>
                                                    </div>
                                                </li>
                                            </template>
                                        </ul>
                                    </section>

                                    <p
                                        v-if="activeSection.type === 1"
                                        class="site-editor__inspetor-hint"
                                    >
                                        SEÇÃO DE DESCRIÇÃO: O TEXTO É EDITADO NO MODO EDITAR, SEM ATRIBUTOS.
                                    </p>

                                    <section class="site-editor__inspetor-grupo">
                                        <h3 class="site-editor__inspetor-grupo-titulo">ORDEM DAS SEÇÕES</h3>
                                        <div class="site-editor__acoes site-editor__acoes--linha">
                                            <KamiButton
                                                size="sm"
                                                :disabled="activeSectionIndex === 0"
                                                aria-label="Mover seção para cima"
                                                @click="moveSection(activeSectionIndex, -1)"
                                            >
                                                <KamiIcon
                                                    name="arrow-up"
                                                    :size="16"
                                                />
                                            </KamiButton>
                                            <KamiButton
                                                size="sm"
                                                :disabled="activeSectionIndex >= sections.length - 1"
                                                aria-label="Mover seção para baixo"
                                                @click="moveSection(activeSectionIndex, 1)"
                                            >
                                                <KamiIcon
                                                    name="arrow-down"
                                                    :size="16"
                                                />
                                            </KamiButton>
                                        </div>
                                    </section>
                                </aside>
                            </div>
                        </div>
                    </section>

                    <div
                        v-if="settingsOpen"
                        class="site-editor__config-fundo"
                        @click="closeSettings"
                    ></div>
                    <section
                        v-if="settingsOpen"
                        ref="settingsDialog"
                        class="site-editor__config"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="config-ficha-titulo"
                        tabindex="-1"
                        @keydown="handleDialogKeydown('settings', $event)"
                    >
                        <div class="site-editor__config-topo">
                            <div>
                                <p class="site-eyebrow">CONFIGURAÇÕES DA FICHA</p>
                                <h2
                                    id="config-ficha-titulo"
                                    class="site-editor__config-titulo"
                                >
                                    {{ sheet.name }}
                                </h2>
                            </div>
                            <KamiButton
                                size="sm"
                                @click="closeSettings"
                            >
                                FECHAR
                            </KamiButton>
                        </div>

                        <div class="site-editor__config-secao">
                            <h3 class="site-editor__config-secao-titulo">COMPARTILHAMENTO</h3>
                            <p class="site-editor__config-texto">
                                Uma ficha pública abre pelo link sem login. O link não aparece em buscadores.
                            </p>
                            <label class="site-editor__config-toggle">
                                <input
                                    v-model="sharingPublic"
                                    type="checkbox"
                                />
                                <span>FICHA PÚBLICA</span>
                            </label>
                            <label class="site-editor__campo">
                                <span class="site-editor__campo-rotulo">SENHA (OPCIONAL)</span>
                                <input
                                    v-model="sharingPassword"
                                    class="kami-input"
                                    type="password"
                                    maxlength="64"
                                    autocomplete="new-password"
                                    :disabled="sharingRemovePassword"
                                    :placeholder="sheet.hasPassword ? 'DEFINA UMA NOVA SENHA' : 'SEM SENHA'"
                                />
                            </label>
                            <label
                                v-if="sheet.hasPassword"
                                class="site-editor__config-toggle"
                            >
                                <input
                                    v-model="sharingRemovePassword"
                                    type="checkbox"
                                />
                                <span>REMOVER SENHA ATUAL</span>
                            </label>
                            <p
                                v-if="sharingError"
                                class="site-editor__config-erro"
                                role="alert"
                            >
                                {{ sharingError }}
                            </p>
                            <p
                                v-if="sharingNotice"
                                class="site-editor__config-ok"
                                role="status"
                            >
                                {{ sharingNotice }}
                            </p>
                            <div class="site-editor__acoes">
                                <KamiButton
                                    variant="primary"
                                    size="sm"
                                    :disabled="sharingSaving"
                                    @click="saveSharing"
                                >
                                    {{ sharingSaving ? 'SALVANDO...' : 'SALVAR COMPARTILHAMENTO' }}
                                </KamiButton>
                                <KamiButton
                                    size="sm"
                                    :disabled="!sheet.isPublic"
                                    @click="copyPublicLink"
                                >
                                    COPIAR LINK
                                </KamiButton>
                            </div>
                        </div>

                        <div class="site-editor__config-secao">
                            <h3 class="site-editor__config-secao-titulo">EXCLUIR FICHA</h3>
                            <p class="site-editor__config-texto">
                                Apagar a ficha é permanente e não pode ser desfeito.
                                <template v-if="liveBlocked">
                                    Esta ficha está ao vivo no Discord e não pode ser excluída até a D5.
                                </template>
                            </p>

                            <div
                                v-if="showDeleteConfirm"
                                class="site-editor__confirmar"
                                role="alert"
                            >
                                <p>EXCLUIR “{{ sheet.name }}”? ESSA AÇÃO NÃO PODE SER DESFEITA.</p>
                                <div class="site-editor__acoes">
                                    <KamiButton
                                        variant="danger"
                                        size="sm"
                                        :disabled="isDeleting"
                                        @click="handleDelete"
                                    >
                                        {{ isDeleting ? 'EXCLUINDO...' : 'CONFIRMAR EXCLUSÃO' }}
                                    </KamiButton>
                                    <KamiButton
                                        size="sm"
                                        :disabled="isDeleting"
                                        @click="showDeleteConfirm = false"
                                    >
                                        CANCELAR
                                    </KamiButton>
                                </div>
                            </div>
                            <div
                                v-else
                                class="site-editor__acoes"
                            >
                                <KamiButton
                                    variant="danger"
                                    size="sm"
                                    :disabled="isDeleting || liveBlocked"
                                    @click="showDeleteConfirm = true"
                                >
                                    EXCLUIR FICHA
                                </KamiButton>
                            </div>
                        </div>
                    </section>

                    <div
                        v-if="barSettingsAttribute"
                        class="site-editor__config-fundo"
                        @click="closeBarSettings"
                    ></div>
                    <section
                        v-if="barSettingsAttribute"
                        ref="barDialog"
                        class="site-editor__config site-editor__config--barra"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="bar-config-titulo"
                        tabindex="-1"
                        @keydown="handleDialogKeydown('bar', $event)"
                    >
                        <div class="site-editor__config-topo">
                            <div>
                                <p class="site-eyebrow">AJUSTES DA BARRA</p>
                                <h2
                                    id="bar-config-titulo"
                                    class="site-editor__config-titulo"
                                >
                                    {{ barSettingsAttribute.name || 'SEM NOME' }}
                                </h2>
                            </div>
                            <KamiButton
                                size="sm"
                                @click="closeBarSettings"
                            >
                                FECHAR
                            </KamiButton>
                        </div>

                        <div class="site-editor__config-secao">
                            <h3 class="site-editor__config-secao-titulo">PASSO</h3>
                            <input
                                class="kami-input site-editor__barra-passo"
                                type="text"
                                inputmode="numeric"
                                :value="barSettingsBar?.step"
                                aria-label="Passo da barra"
                                @input="updateBarSettingsStep"
                            />
                            <p class="site-editor__config-texto">Um passo por clique nos botões − e +.</p>
                        </div>

                        <div class="site-editor__config-secao">
                            <h3 class="site-editor__config-secao-titulo">COR</h3>

                            <div class="site-editor__barra-cor-campo">
                                <span class="site-editor__barra-cor-rotulo">PREENCHIMENTO</span>
                                <div class="site-editor__barra-cor-controles">
                                    <input
                                        type="color"
                                        class="site-editor__barra-cor-input"
                                        :value="barSettingsColorValue"
                                        :aria-label="`Cor da barra ${barSettingsAttribute.name || 'atributo'}`"
                                        @input="updateBarSettingsColor"
                                    />
                                    <div
                                        class="site-editor__barra-cor-sugestoes"
                                        role="group"
                                        aria-label="Sugestões de cor"
                                    >
                                        <button
                                            v-for="preset in barColorPresets"
                                            :key="preset.value"
                                            type="button"
                                            class="site-editor__barra-cor-sugestao"
                                            :class="{
                                                'site-editor__barra-cor-sugestao--ativa': barSettingsPresetActive(
                                                    preset.value
                                                )
                                            }"
                                            :style="{ '--swatch': preset.value }"
                                            :aria-pressed="barSettingsPresetActive(preset.value)"
                                            :aria-label="`Cor ${preset.label}`"
                                            :title="preset.label"
                                            @click="setBarSettingsColor(preset.value)"
                                        ></button>
                                    </div>
                                    <span class="site-editor__barra-cor-hex">{{
                                        barSettingsColorValue.toUpperCase()
                                    }}</span>
                                    <button
                                        type="button"
                                        class="site-editor__barra-cor-padrao"
                                        :disabled="!barSettingsBar?.color"
                                        @click="clearBarSettingsColor"
                                    >
                                        PADRÃO
                                    </button>
                                </div>
                            </div>

                            <div class="site-editor__barra-cor-campo">
                                <span class="site-editor__barra-cor-rotulo">FUNDO</span>
                                <div class="site-editor__barra-cor-controles">
                                    <input
                                        type="color"
                                        class="site-editor__barra-cor-input"
                                        :value="barSettingsBackgroundValue"
                                        :aria-label="`Fundo da barra ${barSettingsAttribute.name || 'atributo'}`"
                                        @input="updateBarSettingsBackground"
                                    />
                                    <span class="site-editor__barra-cor-hex">{{
                                        barSettingsBackgroundValue.toUpperCase()
                                    }}</span>
                                    <button
                                        type="button"
                                        class="site-editor__barra-cor-padrao"
                                        :disabled="!barSettingsBar?.background"
                                        @click="clearBarSettingsBackground"
                                    >
                                        PADRÃO
                                    </button>
                                </div>
                            </div>

                            <div class="site-editor__barra-previa">
                                <p class="site-sheetview__barra-topo">
                                    <span>{{ barSettingsLabel }}</span>
                                </p>
                                <KamiBarTrack
                                    v-if="barSettingsBar"
                                    :value="barSettingsBar"
                                    :label="barSettingsAttribute?.name ?? ''"
                                />
                            </div>
                        </div>

                        <div class="site-editor__config-secao">
                            <h3 class="site-editor__config-secao-titulo">ESTILO</h3>
                            <div
                                class="site-editor__barra-estilos"
                                role="group"
                                aria-label="Estilo da barra"
                            >
                                <button
                                    v-for="pattern in barPatterns"
                                    :key="pattern.value"
                                    type="button"
                                    class="site-editor__barra-estilo"
                                    :class="{
                                        'site-editor__barra-estilo--ativo': barSettingsPattern === pattern.value
                                    }"
                                    :aria-pressed="barSettingsPattern === pattern.value"
                                    @click="setBarSettingsPattern(pattern.value)"
                                >
                                    {{ pattern.label }}
                                </button>
                            </div>
                            <p class="site-editor__config-texto">
                                Um segmento por ponto do máximo (até 60); acima disso a barra volta a ser lisa.
                            </p>
                        </div>

                        <div class="site-editor__config-secao">
                            <h3 class="site-editor__config-secao-titulo">ALERTA</h3>
                            <div class="site-editor__barra-alerta">
                                <label class="site-editor__barra-alerta-toggle">
                                    <input
                                        type="checkbox"
                                        :checked="barSettingsBlink"
                                        @change="toggleBarSettingsBlink"
                                    />
                                    <span>PISCAR QUANDO ABAIXO DE</span>
                                </label>
                                <input
                                    class="kami-input site-editor__barra-alerta-pct"
                                    type="number"
                                    min="1"
                                    max="100"
                                    :value="barSettingsFlashBelow"
                                    :disabled="!barSettingsBlink"
                                    aria-label="Piscar quando abaixo de"
                                    @input="updateBarSettingsFlashBelow"
                                />
                                <span>%</span>
                            </div>
                            <p class="site-editor__config-texto">
                                O alerta é só visual; o valor em texto continua no card. Desative se preferir uma ficha
                                sem animação.
                            </p>
                        </div>
                    </section>
                </div>

                <div
                    v-if="!sheet.isLive && !isReading"
                    class="site-editor__acoes-fixas"
                    role="group"
                    aria-label="Ações da ficha"
                >
                    <KamiButton
                        variant="primary"
                        size="sm"
                        :disabled="!canSave"
                        @click="handleSave"
                    >
                        {{ isSaving ? 'SALVANDO...' : 'SALVAR' }}
                    </KamiButton>
                    <KamiButton
                        v-if="hasChanges"
                        size="sm"
                        aria-label="Descartar alterações"
                        title="Descartar alterações"
                        @click="handleDiscard"
                    >
                        <KamiIcon
                            name="rotate-ccw"
                            :size="20"
                        />
                    </KamiButton>
                    <KamiButton
                        size="sm"
                        aria-label="Visualizar ficha"
                        title="Visualizar ficha (Ctrl+Shift+V)"
                        @click="enterReading"
                    >
                        <KamiIcon
                            name="eye"
                            :size="20"
                        />
                    </KamiButton>
                    <KamiButton
                        size="sm"
                        aria-label="Configurações da ficha"
                        title="Configurações da ficha"
                        @click="openSettings"
                    >
                        <KamiIcon
                            name="settings"
                            :size="20"
                        />
                    </KamiButton>
                </div>
            </template>
        </template>
    </div>
</template>
