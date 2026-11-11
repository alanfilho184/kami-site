import type { SheetAttributeType, SheetLayoutColumns, SheetSectionType } from '../types/sheet';

/** Largura da grade da página, em colunas. */
export const SHEET_LAYOUT_COLUMNS = 12;

/** Largura da seção quando o layout não define nada. */
export const SHEET_LAYOUT_DEFAULT_SPAN = 12;

/** Máximo de colunas da galeria. */
export const SHEET_GALLERY_COLUMNS_MAX = 6;

/** Máximo de linhas de uma seção; o número em si é escolhido pelo usuário. */
export const SHEET_LAYOUT_ROWS_MAX = 32;

/** Altura mínima de uma linha da grade da seção, em pixels. */
export const SHEET_LAYOUT_ROW_HEIGHT = 56;

/**
 * Largura padrão de um atributo dentro da grade da seção: imagem, lista e
 * barra ocupam a linha inteira; texto e número ocupam uma coluna.
 */
export function defaultAttributeSpan(type: SheetAttributeType, columns: SheetLayoutColumns): number {
    return type === 2 || type === 3 || type === 4 ? columns : 1;
}

export function clampAttributeSpan(value: number, columns: SheetLayoutColumns): number {
    return Math.min(columns, Math.max(1, Math.trunc(value)));
}

/** Na galeria cada imagem ocupa uma coluna por padrão. */
export function defaultAttributeSpanFor(
    sectionType: SheetSectionType,
    type: SheetAttributeType,
    columns: SheetLayoutColumns
): number {
    return sectionType === 4 ? 1 : defaultAttributeSpan(type, columns);
}

export function clampGalleryColumns(columns: number): number {
    return Math.min(SHEET_GALLERY_COLUMNS_MAX, Math.max(1, Math.trunc(columns)));
}

/** Limita a altura do atributo às linhas disponíveis na seção. */
export function clampAttributeRows(value: number, rows: number): number {
    const limit = Math.max(1, Math.trunc(rows));

    return Math.min(limit, Math.max(1, Math.trunc(value)));
}
