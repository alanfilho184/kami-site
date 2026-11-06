export type SheetAttributeType = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type SheetSectionType = 0 | 1 | 2 | 3 | 4 | 5;

export interface SheetStatusItem {
    id: string;
    name: string;
    color: string;
    blink: boolean;
    active: boolean;
    /** URL opcional do ícone; vazio usa o ícone genérico na cor do status. */
    icon?: string;
}

export interface SheetStatusValue {
    items: SheetStatusItem[];
}

export interface SheetTableValue {
    columns: string[];
    rows: string[][];
}

/** Papéis do cabeçalho: nomes de atributos que ocupam título, subtítulo e imagem. */
export interface SheetSectionHeader {
    title?: string;
    subtitle?: string;
    image?: string;
    /** Largura da imagem na grade da seção (1..12). */
    imageWidth?: number;
    /** Tamanho máximo da fonte do título, em pixels. */
    titleSize?: number;
}

export interface SheetBarValue {
    actual: number;
    max: number;
    min: number;
    step: number;
    /** Cor do preenchimento em `#rrggbb`; ausente usa o azul do sistema. */
    color?: string;
    /** Cor do trilho em `#rrggbb`; ausente usa a superfície do card. */
    background?: string;
    /** `solid` (padrão) ou `segmented`; ausente equivale a `solid`. */
    pattern?: 'solid' | 'segmented';
    /** Percentual abaixo do qual a barra pisca; ausente equivale a 25. */
    flashBelow?: number;
    /** `false` desliga o piscar; ausente equivale a ligado. */
    blink?: boolean;
}

export interface SheetListItemValue {
    name: string;
    quantity: string;
}

export interface SheetListValue {
    items: SheetListItemValue[];
}

export interface SheetAttribute {
    name: string;
    type: SheetAttributeType;
    value: string | SheetListValue | SheetBarValue | SheetStatusValue | SheetTableValue;
    position: number;
}

export interface SheetSection {
    name: string;
    type: SheetSectionType;
    position: number;
    attributes: SheetAttribute[];
}

export interface SheetAttributes {
    sections: SheetSection[];
}

/** Colunas de atributos dentro da seção: 1 a 12, validado em runtime. */
export type SheetLayoutColumns = number;

/**
 * Posição de um atributo na grade da seção: `span` colunas por `rows` linhas.
 * O formato antigo guardava só o número de colunas.
 */
export interface SheetLayoutAttribute {
    span: number;
    rows: number;
}

export interface SheetLayoutSection {
    columns: SheetLayoutColumns;
    /** Linhas da grade da seção; ausente mantém a altura automática. */
    rows?: number;
    /** Preenche os buracos da grade puxando os próximos atributos para cima. */
    dense?: boolean;
    /** Papéis do cabeçalho (seção `type: 2`), por nome de atributo. */
    header?: SheetSectionHeader;
    /** Largura e altura de cada atributo na grade da seção, por nome. */
    attributes?: Record<string, SheetLayoutAttribute>;
    /** Formato legado: atributos que ocupavam a seção inteira. */
    full?: string[];
    /** Largura da seção na grade de 12 colunas; ausente equivale a 12. */
    span?: number;
}

/**
 * Apresentação da ficha, independente do JSON que o bot lê. Chaveada pelo nome
 * da seção e, em `full`, pelo nome do atributo; entradas órfãs são descartadas
 * na normalização.
 */
export interface SheetLayout {
    sections: Record<string, SheetLayoutSection>;
}

export interface SheetDetail {
    id: number;
    userId: number;
    name: string;
    isPublic: boolean;
    hasPassword: boolean;
    isLegacy: boolean;
    isLive: boolean;
    version: string;
    createdAt: string;
    updatedAt: string;
    attributes: SheetAttributes;
    layout: SheetLayout | null;
}

export interface SheetQuota {
    used: number;
    /** Limite da conta gratuita; `null` quando a conta é premium. */
    limit: number | null;
    /** Fichas que ainda podem ser criadas; `null` quando não há limite. */
    remaining: number | null;
    isPremium: boolean;
    canCreate: boolean;
}

export interface SheetCreateInput {
    name: string;
}

export interface SheetRenameInput {
    name: string;
    version: string;
}

export interface SheetUpdateInput {
    name: string;
    attributes: SheetAttributes;
    layout?: SheetLayout | null;
    version: string;
}

export interface SheetDeleteInput {
    version: string;
}

export interface SheetSharingInput {
    version: string;
    isPublic: boolean;
    /** `undefined` mantém a senha atual; `null` ou vazio remove. */
    password?: string | null;
}

export interface SheetErrorResponse {
    message: string;
    code?:
        | 'invalid_sheet'
        | 'invalid_password'
        | 'sheet_not_found'
        | 'sheet_conflict'
        | 'sheet_name_taken'
        | 'sheet_live'
        | 'sheet_limit_reached';
}
