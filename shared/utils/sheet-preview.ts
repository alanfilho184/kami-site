import type { SheetAttribute, SheetAttributes, SheetSection } from '../types/sheet';

function imageUrl(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();

    if (!trimmed) {
        return null;
    }

    try {
        const url = new URL(trimmed);

        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
    } catch {
        return null;
    }
}

function imageAttributes(section: SheetSection): SheetAttribute[] {
    return section.attributes.filter(attribute => attribute.type === 2).sort((a, b) => a.position - b.position);
}

/**
 * Primeira imagem http(s) da ficha na ordem de exibição das seções e dos
 * atributos. Usada apenas para o preview de link, nunca para renderizar HTML.
 */
export function firstSheetImage(attributes: SheetAttributes | null | undefined): string | null {
    if (!attributes?.sections?.length) {
        return null;
    }

    const sections = [...attributes.sections].sort((a, b) => a.position - b.position);

    for (const section of sections) {
        for (const attribute of imageAttributes(section)) {
            const url = imageUrl(attribute.value);

            if (url) {
                return url;
            }
        }
    }

    return null;
}
