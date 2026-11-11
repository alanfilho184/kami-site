import { describe, expect, it } from 'vitest';
import type { SheetAttributes, SheetSection } from '../../shared/types/sheet';
import { firstSheetImage } from '../../shared/utils/sheet-preview';

function section(overrides: Partial<SheetSection>): SheetSection {
    return {
        name: 'Seção',
        type: 0,
        position: 0,
        attributes: [],
        ...overrides
    };
}

function attributes(sections: SheetSection[]): SheetAttributes {
    return { sections };
}

describe('preview de ficha', () => {
    it('usa a primeira imagem http(s) na ordem de exibição', () => {
        const result = firstSheetImage(
            attributes([
                section({
                    position: 1,
                    attributes: [
                        { name: 'Retrato', type: 2, position: 1, value: 'https://example.com/segunda.png' },
                        { name: 'Texto', type: 0, position: 0, value: 'Não é imagem' }
                    ]
                }),
                section({
                    position: 0,
                    attributes: [{ name: 'Capa', type: 2, position: 1, value: '  https://example.com/primeira.png  ' }]
                })
            ])
        );

        expect(result).toBe('https://example.com/primeira.png');
    });

    it('ignora imagens vazias e protocolos que não são http(s)', () => {
        const result = firstSheetImage(
            attributes([
                section({
                    attributes: [
                        { name: 'Vazia', type: 2, position: 0, value: '   ' },
                        { name: 'Perigosa', type: 2, position: 1, value: 'javascript:alert(1)' },
                        { name: 'Relativa', type: 2, position: 2, value: '/imagem.png' },
                        { name: 'Válida', type: 2, position: 3, value: 'https://example.com/ok.png' }
                    ]
                })
            ])
        );

        expect(result).toBe('https://example.com/ok.png');
    });

    it('retorna null quando a ficha não tem imagem', () => {
        expect(firstSheetImage(null)).toBeNull();
        expect(firstSheetImage(attributes([]))).toBeNull();
        expect(
            firstSheetImage(
                attributes([
                    section({
                        attributes: [{ name: 'Texto', type: 0, position: 0, value: 'Sem imagem' }]
                    })
                ])
            )
        ).toBeNull();
    });
});
