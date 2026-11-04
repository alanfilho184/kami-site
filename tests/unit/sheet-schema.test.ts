import { describe, expect, it } from 'vitest';
import { SHEET_DESCRIPTION_MAX_LENGTH, SHEET_TEXT_MAX_LENGTH } from '../../shared/constants/sheet';
import {
    createEmptySheetAttributes,
    deleteSheetSchema,
    normalizeSheetAttributes,
    normalizeSheetLayout,
    patchSheetSchema,
    sheetAttributesSchema,
    sheetNameSchema,
    sheetSharingSchema,
    sheetVersionSchema
} from '../../server/schemas/sheet';

const version = '2026-10-31T12:00:00.000Z';

const validTextAttribute = {
    name: 'História',
    type: 0,
    position: 0,
    value: 'Cientista das sombras.'
};

const validSection = {
    name: 'Status',
    type: 0,
    position: 0,
    attributes: [validTextAttribute]
};

function parseSection(section: unknown): { success: boolean } {
    return sheetAttributesSchema.safeParse({ sections: [section] });
}

describe('normalização dos atributos da ficha', () => {
    it('converte o objeto plano legado em uma seção Info com atributos de texto', () => {
        const result = normalizeSheetAttributes({ Força: 12, Biografia: 'Cientista' }, true);

        expect(result).toEqual({
            sections: [
                {
                    name: 'Info',
                    type: 0,
                    position: 0,
                    attributes: [
                        { name: 'Força', type: 0, position: 0, value: '12' },
                        { name: 'Biografia', type: 0, position: 1, value: 'Cientista' }
                    ]
                }
            ]
        });
    });

    it('ordena as seções por position, reindexa posições e converte tipos em string', () => {
        const result = normalizeSheetAttributes(
            {
                sections: [
                    {
                        name: '  Inventário  ',
                        type: '0',
                        position: 5,
                        attributes: [
                            {
                                name: 'Poções',
                                type: '3',
                                position: 1,
                                value: { items: [{ name: ' Cura ', quantity: 2 }, 'Corda'] }
                            }
                        ]
                    },
                    {
                        name: 'Status',
                        type: '1',
                        position: -2,
                        attributes: [
                            {
                                name: 'Vida',
                                type: '4',
                                position: 9,
                                value: { actual: '5', max: '10', min: '', step: undefined }
                            }
                        ]
                    }
                ]
            },
            false
        );

        expect(result.sections.map(section => section.name)).toEqual(['Status', 'Inventário']);
        expect(result.sections.map(section => section.position)).toEqual([0, 1]);
        expect(result.sections[0]?.type).toBe(1);
        expect(result.sections[0]?.attributes[0]).toEqual({
            name: 'Vida',
            type: 4,
            position: 0,
            value: { actual: 5, max: 10, min: 0, step: 1 }
        });
        expect(result.sections[1]?.attributes[0]).toEqual({
            name: 'Poções',
            type: 3,
            position: 0,
            value: {
                items: [
                    { name: ' Cura ', quantity: '2' },
                    { name: 'Corda', quantity: '1' }
                ]
            }
        });
    });

    it('normaliza a aparência da barra e descarta valores inválidos', () => {
        const result = normalizeSheetAttributes(
            {
                sections: [
                    {
                        name: 'Status',
                        type: 0,
                        position: 0,
                        attributes: [
                            {
                                name: 'Vida',
                                type: 4,
                                position: 0,
                                value: {
                                    actual: 5,
                                    max: 10,
                                    min: 0,
                                    step: 1,
                                    color: '#22C55E',
                                    background: '#1A0B0B',
                                    pattern: 'segmented',
                                    flashBelow: 80,
                                    blink: false
                                }
                            },
                            {
                                name: 'Mana',
                                type: 4,
                                position: 1,
                                value: {
                                    actual: 5,
                                    max: 10,
                                    min: 0,
                                    step: 1,
                                    color: 'azul',
                                    background: 'fundo',
                                    pattern: 'listrada',
                                    flashBelow: 200,
                                    blink: true
                                }
                            }
                        ]
                    }
                ]
            },
            false
        );

        expect(result.sections[0]?.attributes[0]?.value).toEqual({
            actual: 5,
            max: 10,
            min: 0,
            step: 1,
            color: '#22c55e',
            background: '#1a0b0b',
            pattern: 'segmented',
            flashBelow: 80,
            blink: false
        });
        expect(result.sections[0]?.attributes[1]?.value).toEqual({ actual: 5, max: 10, min: 0, step: 1 });
    });

    it('converte o JSON legado em string para a seção Info', () => {
        const result = normalizeSheetAttributes('{"Força":3}', false);

        expect(result).toEqual({
            sections: [
                {
                    name: 'Info',
                    type: 0,
                    position: 0,
                    attributes: [{ name: 'Força', type: 0, position: 0, value: '3' }]
                }
            ]
        });
    });

    it('devolve uma seção Info vazia para formato irreconhecível', () => {
        const empty = createEmptySheetAttributes();

        expect(normalizeSheetAttributes({}, false)).toEqual(empty);
        expect(normalizeSheetAttributes({ sections: [] }, false)).toEqual(empty);
        expect(normalizeSheetAttributes(null, false)).toEqual(empty);
        expect(normalizeSheetAttributes('{ não é json', false)).toEqual(empty);
        expect(normalizeSheetAttributes(JSON.stringify({ sections: [] }), false)).toEqual(empty);
    });

    it('reduz tipos inválidos para texto sem lançar erro', () => {
        const result = normalizeSheetAttributes(
            {
                sections: [
                    {
                        name: 'Info',
                        type: 9,
                        position: 0,
                        attributes: [
                            { name: 'Mapa', type: 42, value: { chave: 'valor' } },
                            { name: 'Idade', type: 'muito', value: 31 }
                        ]
                    }
                ]
            },
            false
        );

        expect(result.sections[0]?.type).toBe(0);
        expect(result.sections[0]?.attributes[0]).toEqual({
            name: 'Mapa',
            type: 0,
            position: 0,
            value: '[object Object]'
        });
        expect(result.sections[0]?.attributes[1]).toEqual({ name: 'Idade', type: 0, position: 1, value: '31' });
    });

    it('ordena os atributos por position e reindexa', () => {
        const result = normalizeSheetAttributes(
            {
                sections: [
                    {
                        name: 'Status',
                        type: 0,
                        position: 0,
                        attributes: [
                            { name: 'Terceiro', type: 0, position: 9, value: 'c' },
                            { name: 'Primeiro', type: 0, position: -1, value: 'a' },
                            { name: 'Segundo', type: 0, position: 4, value: 'b' }
                        ]
                    }
                ]
            },
            false
        );

        expect(result.sections[0]?.attributes.map(attribute => attribute.name)).toEqual([
            'Primeiro',
            'Segundo',
            'Terceiro'
        ]);
        expect(result.sections[0]?.attributes.map(attribute => attribute.position)).toEqual([0, 1, 2]);
    });

    it('preserva valores estruturados de legacy como JSON em texto', () => {
        const result = normalizeSheetAttributes({ Config: { tema: 'escuro' } }, true);

        expect(result.sections[0]?.attributes[0]).toEqual({
            name: 'Config',
            type: 0,
            position: 0,
            value: '{"tema":"escuro"}'
        });
    });
});

describe('tipo do nome da ficha', () => {
    it('aceita e limpa nomes válidos', () => {
        const parsed = sheetNameSchema.safeParse('  Lyra Voss  ');

        expect(parsed.success).toBe(true);

        if (parsed.success) {
            expect(parsed.data).toBe('Lyra Voss');
        }
    });

    it('rejeita nome vazio, com mais de 32 caracteres ou com caracteres proibidos', () => {
        expect(sheetNameSchema.safeParse('   ').success).toBe(false);
        expect(sheetNameSchema.safeParse('x'.repeat(33)).success).toBe(false);
        expect(sheetNameSchema.safeParse('ficha de $uilson').success).toBe(false);
        expect(sheetNameSchema.safeParse('50% de desconto').success).toBe(false);
        expect(sheetNameSchema.safeParse("apóstrofo '").success).toBe(false);
    });
});

describe('schema dos atributos da ficha', () => {
    it('aceita os cinco tipos válidos de atributo', () => {
        const attributes = {
            sections: [
                {
                    name: 'Status',
                    type: 0,
                    position: 0,
                    attributes: [
                        { name: 'História', type: 0, position: 0, value: 'Cientista das sombras.' },
                        { name: 'Nível', type: 1, position: 1, value: '-3' },
                        { name: 'Retrato', type: 2, position: 2, value: 'https://exemplo.com/retrato.png' },
                        { name: 'Itens', type: 3, position: 3, value: { items: [{ name: 'Corda', quantity: '2' }] } },
                        {
                            name: 'Vida',
                            type: 4,
                            position: 4,
                            value: { actual: 5, max: 10, min: 0, step: 2 }
                        }
                    ]
                }
            ]
        };

        expect(sheetAttributesSchema.safeParse(attributes).success).toBe(true);
    });

    it('rejeita nome de seção curto, longo ou com caracteres de controle', () => {
        expect(parseSection({ ...validSection, name: ' A' }).success).toBe(false);
        expect(parseSection({ ...validSection, name: 'x'.repeat(21) }).success).toBe(false);
        expect(parseSection({ ...validSection, name: 'Seção\ncom quebra' }).success).toBe(false);

        const trimmed = sheetAttributesSchema.safeParse({ sections: [{ ...validSection, name: '  Status  ' }] });

        expect(trimmed.success).toBe(true);

        if (trimmed.success) {
            expect(trimmed.data.sections[0]?.name).toBe('Status');
        }
    });

    it('rejeita atributo sem nome ou com nome acima de 32 caracteres', () => {
        expect(parseSection({ ...validSection, attributes: [{ ...validTextAttribute, name: '' }] }).success).toBe(
            false
        );
        expect(
            parseSection({
                ...validSection,
                attributes: [{ ...validTextAttribute, name: 'x'.repeat(33) }]
            }).success
        ).toBe(false);
    });

    it('rejeita texto vazio ou acima de 1024 caracteres', () => {
        expect(parseSection({ ...validSection, attributes: [{ ...validTextAttribute, value: '' }] }).success).toBe(
            false
        );
        expect(
            parseSection({
                ...validSection,
                attributes: [{ ...validTextAttribute, value: 'a'.repeat(1025) }]
            }).success
        ).toBe(false);
    });

    it('aceita número inteiro e rejeita número quebrado', () => {
        expect(
            parseSection({ ...validSection, attributes: [{ ...validTextAttribute, type: 1, value: '-12' }] }).success
        ).toBe(true);
        expect(
            parseSection({ ...validSection, attributes: [{ ...validTextAttribute, type: 1, value: '3.5' }] }).success
        ).toBe(false);
        expect(
            parseSection({ ...validSection, attributes: [{ ...validTextAttribute, type: 1, value: '1e3' }] }).success
        ).toBe(false);
        expect(
            parseSection({ ...validSection, attributes: [{ ...validTextAttribute, type: 1, value: '' }] }).success
        ).toBe(false);
    });

    it('exige URL http(s) com extensão de imagem', () => {
        expect(
            parseSection({
                ...validSection,
                attributes: [{ ...validTextAttribute, type: 2, value: 'https://exemplo.com/retrato.webp' }]
            }).success
        ).toBe(true);
        expect(
            parseSection({
                ...validSection,
                attributes: [{ ...validTextAttribute, type: 2, value: 'https://exemplo.com/retrato' }]
            }).success
        ).toBe(false);
        expect(
            parseSection({
                ...validSection,
                attributes: [{ ...validTextAttribute, type: 2, value: 'ftp://exemplo.com/retrato.png' }]
            }).success
        ).toBe(false);
    });

    it('valida a quantidade dos itens da lista', () => {
        const sectionWithList = (value: unknown): { success: boolean } =>
            parseSection({
                ...validSection,
                attributes: [{ ...validTextAttribute, type: 3, value }]
            });

        expect(sectionWithList({ items: [{ name: 'Corda', quantity: '3' }] }).success).toBe(true);
        expect(sectionWithList({ items: [{ name: 'Corda', quantity: 'abc' }] }).success).toBe(false);
        expect(sectionWithList({ items: [{ name: 'Corda', quantity: '0' }] }).success).toBe(false);
        expect(sectionWithList({ items: [{ name: 'Corda', quantity: '1'.repeat(33) }] }).success).toBe(false);
        expect(sectionWithList({ items: [{ name: '', quantity: '3' }] }).success).toBe(false);
    });

    it('valida os limites da barra', () => {
        const sectionWithBar = (value: unknown): { success: boolean } =>
            parseSection({
                ...validSection,
                attributes: [{ ...validTextAttribute, type: 4, value }]
            });

        expect(sectionWithBar({ actual: '5', max: '10', min: '0', step: '2' }).success).toBe(true);
        expect(sectionWithBar({ actual: 0, max: 10, min: 11, step: 1 }).success).toBe(false);
        expect(sectionWithBar({ actual: 12, max: 10, min: 0, step: 1 }).success).toBe(false);
        expect(sectionWithBar({ actual: 0, max: 10, min: 0, step: 0 }).success).toBe(false);
        expect(sectionWithBar({ actual: 0, max: 10, min: 0, step: 11 }).success).toBe(false);
        expect(sectionWithBar({ actual: 0, max: 0, min: 0, step: 1 }).success).toBe(false);
        expect(sectionWithBar({ actual: 1.5, max: 10, min: 0, step: 1 }).success).toBe(false);
        expect(sectionWithBar({ actual: 5, max: 10, min: 0, step: 1, color: '#22c55e' }).success).toBe(true);
        expect(sectionWithBar({ actual: 5, max: 10, min: 0, step: 1, color: 'verde' }).success).toBe(false);
        expect(sectionWithBar({ actual: 5, max: 10, min: 0, step: 1, color: '#22c55' }).success).toBe(false);
        expect(
            sectionWithBar({
                actual: 5,
                max: 10,
                min: 0,
                step: 1,
                background: '#1a0b0b',
                pattern: 'segmented',
                flashBelow: 80,
                blink: false
            }).success
        ).toBe(true);
        expect(sectionWithBar({ actual: 5, max: 10, min: 0, step: 1, background: 'fundo' }).success).toBe(false);
        expect(sectionWithBar({ actual: 5, max: 10, min: 0, step: 1, pattern: 'listrada' }).success).toBe(false);
        expect(sectionWithBar({ actual: 5, max: 10, min: 0, step: 1, flashBelow: 0 }).success).toBe(false);
        expect(sectionWithBar({ actual: 5, max: 10, min: 0, step: 1, flashBelow: 101 }).success).toBe(false);
        expect(sectionWithBar({ actual: 5, max: 10, min: 0, step: 1, blink: 'sim' }).success).toBe(false);
    });
});

describe('schemas de patch e exclusão', () => {
    it('aceita patch só de renome e patch com atributos', () => {
        expect(patchSheetSchema.safeParse({ name: 'Lyra Voss', version }).success).toBe(true);
        expect(patchSheetSchema.safeParse({ name: 'Lyra Voss', version, attributes: { sections: [] } }).success).toBe(
            true
        );
    });

    it('rejeita patch sem nome ou sem versão', () => {
        expect(patchSheetSchema.safeParse({ version }).success).toBe(false);
        expect(patchSheetSchema.safeParse({ name: 'Lyra Voss' }).success).toBe(false);
        expect(patchSheetSchema.safeParse({ name: 'Lyra Voss', version: 'agora' }).success).toBe(false);
        expect(sheetVersionSchema.safeParse('2026-10-31T12:00:00Z').success).toBe(false);
        expect(sheetVersionSchema.safeParse('2026-10-31T12:00:00.000-03:00').success).toBe(false);
    });

    it('exige versão válida na exclusão', () => {
        expect(deleteSheetSchema.safeParse({ version }).success).toBe(true);
        expect(deleteSheetSchema.safeParse({ version: 'agora' }).success).toBe(false);
        expect(deleteSheetSchema.safeParse({}).success).toBe(false);
    });

    it('aceita layout opcional ou nulo no patch', () => {
        expect(patchSheetSchema.safeParse({ name: 'Lyra Voss', version, layout: null }).success).toBe(true);
        expect(
            patchSheetSchema.safeParse({
                name: 'Lyra Voss',
                version,
                layout: { sections: { Info: { columns: 2, full: ['Retrato'] } } }
            }).success
        ).toBe(true);
        expect(
            patchSheetSchema.safeParse({
                name: 'Lyra Voss',
                version,
                layout: { sections: { Info: { columns: 12, attributes: { Nome: 12 } } } }
            }).success
        ).toBe(true);
        expect(
            patchSheetSchema.safeParse({
                name: 'Lyra Voss',
                version,
                layout: { sections: { Info: { columns: 13, full: [] } } }
            }).success
        ).toBe(false);
        expect(
            patchSheetSchema.safeParse({
                name: 'Lyra Voss',
                version,
                layout: { sections: { Info: { columns: 2, attributes: { Nome: 13 } } } }
            }).success
        ).toBe(false);
        expect(
            patchSheetSchema.safeParse({
                name: 'Lyra Voss',
                version,
                layout: { sections: { Info: { columns: 2, full: [], span: 8 } } }
            }).success
        ).toBe(true);
        expect(
            patchSheetSchema.safeParse({
                name: 'Lyra Voss',
                version,
                layout: { sections: { Info: { columns: 2, full: [], span: 13 } } }
            }).success
        ).toBe(false);
    });

    it('valida linhas da seção, altura do atributo e o modo dense', () => {
        expect(
            patchSheetSchema.safeParse({
                name: 'Lyra Voss',
                version,
                layout: {
                    sections: {
                        Info: {
                            columns: 3,
                            rows: 3,
                            dense: true,
                            attributes: { Nome: { span: 3, rows: 3 } }
                        }
                    }
                }
            }).success
        ).toBe(true);
        expect(
            patchSheetSchema.safeParse({
                name: 'Lyra Voss',
                version,
                layout: { sections: { Info: { columns: 3, rows: 0 } } }
            }).success
        ).toBe(false);
        expect(
            patchSheetSchema.safeParse({
                name: 'Lyra Voss',
                version,
                layout: { sections: { Info: { columns: 3, rows: 33 } } }
            }).success
        ).toBe(false);
        expect(
            patchSheetSchema.safeParse({
                name: 'Lyra Voss',
                version,
                layout: {
                    sections: { Info: { columns: 3, rows: 2, attributes: { Nome: { span: 2, rows: 3 } } } }
                }
            }).success
        ).toBe(false);
    });

    it('converte o formato numérico antigo em span + rows', () => {
        const parsed = patchSheetSchema.safeParse({
            name: 'Lyra Voss',
            version,
            layout: { sections: { Info: { columns: 3, attributes: { Nome: 2 } } } }
        });

        expect(parsed.success).toBe(true);
        expect(parsed.data?.layout?.sections.Info.attributes).toEqual({ Nome: { span: 2, rows: 1 } });
    });
});

describe('layout da ficha', () => {
    const sections = [
        {
            name: 'Info',
            type: 0 as const,
            position: 0,
            attributes: [
                { name: 'Nome', type: 0 as const, position: 0, value: 'Lyra' },
                { name: 'Retrato', type: 2 as const, position: 1, value: 'https://exemplo.com/a.png' }
            ]
        }
    ];

    it('converte o formato legado de largura completa', () => {
        const layout = normalizeSheetLayout(
            {
                sections: {
                    Info: { columns: 3, full: ['Retrato', 'Inexistente', 'Retrato'] },
                    Removida: { columns: 2, full: [] }
                }
            },
            sections
        );

        // Retrato é imagem: 3 colunas já é o padrão, então a entrada não é gravada.
        expect(layout).toEqual({ sections: { Info: { columns: 3, attributes: {}, span: 12 } } });
    });

    it('mantém a largura individual de cada atributo', () => {
        expect(
            normalizeSheetLayout(
                { sections: { Info: { columns: 3, attributes: { Nome: 3, Retrato: 2, Fantasma: 2 } } } },
                sections
            )
        ).toEqual({
            sections: {
                Info: {
                    columns: 3,
                    attributes: { Nome: { span: 3, rows: 1 }, Retrato: { span: 2, rows: 1 } },
                    span: 12
                }
            }
        });
        expect(normalizeSheetLayout({ sections: { Info: { columns: 2, attributes: { Nome: 9 } } } }, sections)).toEqual(
            { sections: { Info: { columns: 2, attributes: { Nome: { span: 2, rows: 1 } }, span: 12 } } }
        );
        expect(
            normalizeSheetLayout({ sections: { Info: { columns: 12, attributes: { Nome: 12 } } } }, sections)
        ).toEqual({
            sections: { Info: { columns: 12, attributes: { Nome: { span: 12, rows: 1 } }, span: 12 } }
        });
    });

    it('respeita a largura livre e limita o span fora da grade', () => {
        expect(normalizeSheetLayout({ sections: { Info: { columns: 1, span: 8 } } }, sections)).toEqual({
            sections: { Info: { columns: 1, attributes: {}, span: 8 } }
        });
        expect(normalizeSheetLayout({ sections: { Info: { columns: 1, span: 40 } } }, sections)).toBeNull();
        expect(normalizeSheetLayout({ sections: { Info: { columns: 1, span: 0 } } }, sections)).toEqual({
            sections: { Info: { columns: 1, attributes: {}, span: 1 } }
        });
    });

    it('descarta entradas sem efeito e devolve null', () => {
        expect(normalizeSheetLayout({ sections: { Info: { columns: 1, full: [] } } }, sections)).toBeNull();
        expect(normalizeSheetLayout(null, sections)).toBeNull();
        expect(normalizeSheetLayout('quebrado', sections)).toBeNull();
    });

    it('normaliza layout serializado em texto', () => {
        expect(normalizeSheetLayout('{"sections":{"Info":{"columns":4,"full":[]}}}', sections)).toEqual({
            sections: { Info: { columns: 4, attributes: {}, span: 12 } }
        });
    });

    it('lê linhas da seção, altura por atributo e dense', () => {
        expect(
            normalizeSheetLayout(
                {
                    sections: {
                        Info: {
                            columns: 3,
                            rows: 3,
                            dense: true,
                            attributes: {
                                Nome: { span: 3, rows: 2 },
                                Retrato: { span: 2, rows: 9 }
                            }
                        }
                    }
                },
                sections
            )
        ).toEqual({
            sections: {
                Info: {
                    columns: 3,
                    rows: 3,
                    dense: true,
                    attributes: {
                        Nome: { span: 3, rows: 2 },
                        Retrato: { span: 2, rows: 3 }
                    },
                    span: 12
                }
            }
        });
    });

    it('ignora altura sem grade explícita e limita as linhas da seção', () => {
        expect(
            normalizeSheetLayout(
                { sections: { Info: { columns: 3, attributes: { Nome: { span: 1, rows: 2 } } } } },
                sections
            )
        ).toEqual({ sections: { Info: { columns: 3, attributes: {}, span: 12 } } });
        expect(normalizeSheetLayout({ sections: { Info: { columns: 1, rows: 1 } } }, sections)).toEqual({
            sections: { Info: { columns: 1, rows: 1, attributes: {}, span: 12 } }
        });
        expect(normalizeSheetLayout({ sections: { Info: { columns: 1, rows: 40 } } }, sections)).toEqual({
            sections: { Info: { columns: 1, rows: 32, attributes: {}, span: 12 } }
        });
    });
});

describe('seção de descrição', () => {
    function parse(type: number, attributes: unknown[]): { success: boolean } {
        return sheetAttributesSchema.safeParse({
            sections: [{ name: 'História', type, position: 0, attributes }]
        });
    }

    const textAttribute = (value: string) => ({ name: 'Texto', type: 0, position: 0, value });

    it('aceita um único texto vazio ou de até 4096', () => {
        expect(parse(1, []).success).toBe(true);
        expect(parse(1, [textAttribute('')]).success).toBe(true);
        expect(parse(1, [textAttribute('a'.repeat(SHEET_DESCRIPTION_MAX_LENGTH))]).success).toBe(true);
        expect(parse(1, [textAttribute('a'.repeat(SHEET_DESCRIPTION_MAX_LENGTH + 1))]).success).toBe(false);
    });

    it('recusa mais de um atributo ou atributo que não seja texto', () => {
        expect(parse(1, [textAttribute('a'), textAttribute('b')]).success).toBe(false);
        expect(parse(1, [{ name: 'Nível', type: 1, position: 0, value: '3' }]).success).toBe(false);
    });

    it('mantém o limite de 1024 e o texto obrigatório nas seções padrão', () => {
        expect(parse(0, [textAttribute('')]).success).toBe(false);
        expect(parse(0, [textAttribute('a'.repeat(SHEET_TEXT_MAX_LENGTH))]).success).toBe(true);
        expect(parse(0, [textAttribute('a'.repeat(SHEET_TEXT_MAX_LENGTH + 1))]).success).toBe(false);
    });
});

describe('seção de cabeçalho', () => {
    const headerSections = [
        {
            name: 'Apresentação',
            type: 2 as const,
            position: 0,
            attributes: [
                { name: 'Título', type: 0 as const, position: 0, value: '' },
                { name: 'Subtítulo', type: 0 as const, position: 1, value: 'Cartógrafa' },
                { name: 'Imagem', type: 2 as const, position: 2, value: '' },
                { name: 'Origem', type: 0 as const, position: 3, value: 'Porto' }
            ]
        }
    ];

    it('aceita textos e imagem vazios', () => {
        expect(sheetAttributesSchema.safeParse({ sections: headerSections }).success).toBe(true);
    });

    it('valida a URL da imagem quando ela não está vazia', () => {
        const sections = headerSections.map(section => ({
            ...section,
            attributes: section.attributes.map(attribute =>
                attribute.name === 'Imagem' ? { ...attribute, value: 'quebrada' } : attribute
            )
        }));

        expect(sheetAttributesSchema.safeParse({ sections }).success).toBe(false);
    });

    it('mantém o tipo 2 na normalização dos atributos', () => {
        expect(normalizeSheetAttributes({ sections: headerSections }, false).sections[0]?.type).toBe(2);
    });

    it('normaliza os papéis do cabeçalho no layout', () => {
        expect(
            normalizeSheetLayout(
                {
                    sections: {
                        Apresentação: {
                            columns: 1,
                            header: {
                                title: 'Título',
                                subtitle: 'Subtítulo',
                                image: 'Imagem',
                                imageWidth: 4,
                                titleSize: 56
                            }
                        }
                    }
                },
                headerSections
            )
        ).toEqual({
            sections: {
                Apresentação: {
                    columns: 1,
                    header: {
                        title: 'Título',
                        subtitle: 'Subtítulo',
                        image: 'Imagem',
                        imageWidth: 4,
                        titleSize: 56
                    },
                    attributes: {},
                    span: 12
                }
            }
        });
    });

    it('descarta papéis órfãos ou com o tipo errado', () => {
        expect(
            normalizeSheetLayout(
                {
                    sections: {
                        Apresentação: {
                            columns: 1,
                            header: { title: 'Fantasma', subtitle: 'Imagem', image: 'Origem' }
                        }
                    }
                },
                headerSections
            )
        ).toBeNull();
    });
});

describe('seção de status', () => {
    const statusItem = {
        id: 'st-1',
        name: 'Ferido',
        color: '#ff0000',
        blink: true,
        active: true
    };

    function parse(attributes: unknown[], type = 3): { success: boolean } {
        return sheetAttributesSchema.safeParse({
            sections: [{ name: 'Condição', type, position: 0, attributes }]
        });
    }

    it('aceita um conjunto de status com cor, blink e estado ativo', () => {
        expect(parse([{ name: 'Condição', type: 5, position: 0, value: { items: [statusItem] } }]).success).toBe(true);
    });

    it('recusa status sem nome, com cor inválida ou acima do limite', () => {
        const withItems = (items: unknown[]) => parse([{ name: 'Condição', type: 5, position: 0, value: { items } }]);

        expect(withItems([{ ...statusItem, name: '' }]).success).toBe(false);
        expect(withItems([{ ...statusItem, name: 'x'.repeat(33) }]).success).toBe(false);
        expect(withItems([{ ...statusItem, color: 'vermelho' }]).success).toBe(false);
        expect(withItems([{ ...statusItem, blink: 'sim' }]).success).toBe(false);
        expect(withItems(Array.from({ length: 33 }, () => statusItem)).success).toBe(false);
    });

    it('aceita ícone opcional e recusa URL que não seja imagem', () => {
        const withIcon = (icon: unknown) =>
            parse([
                {
                    name: 'Condição',
                    type: 5,
                    position: 0,
                    value: { items: [statusItem, { ...statusItem, id: 'st-2', icon }] }
                }
            ]);

        expect(withIcon('').success).toBe(true);
        expect(withIcon('https://exemplo.com/icone.webp').success).toBe(true);
        expect(withIcon(undefined).success).toBe(true);
        expect(withIcon('https://exemplo.com/icone').success).toBe(false);
        expect(withIcon('ftp://exemplo.com/icone.png').success).toBe(false);
    });

    it('recusa status compartilhado com seções comuns', () => {
        expect(parse([{ name: 'Status', type: 5, position: 0, value: { items: [] } }], 0).success).toBe(false);
        expect(parse([{ name: 'Status', type: 5, position: 0, value: { items: [] } }], 4).success).toBe(false);
    });

    it('aceita a seção de status vazia ou com um único bloco', () => {
        expect(parse([]).success).toBe(true);
        expect(parse([{ name: 'Status', type: 5, position: 0, value: { items: [] } }]).success).toBe(true);
        expect(
            parse([
                { name: 'Status', type: 5, position: 0, value: { items: [] } },
                { name: 'Texto', type: 0, position: 1, value: 'a' }
            ]).success
        ).toBe(false);
    });

    it('normaliza ids, nomes e cores ausentes', () => {
        const result = normalizeSheetAttributes(
            {
                sections: [
                    {
                        name: 'Condição',
                        type: 3,
                        position: 0,
                        attributes: [
                            {
                                name: 'Status',
                                type: 5,
                                position: 0,
                                value: {
                                    items: [
                                        { name: '  ', color: 'azul' },
                                        {
                                            id: 'st-2',
                                            name: 'Morto',
                                            color: '#00ff00',
                                            blink: 'sim',
                                            active: 1,
                                            icon: ' https://exemplo.com/icone.png '
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                ]
            },
            false
        );

        expect(result.sections[0]?.type).toBe(3);
        expect(result.sections[0]?.attributes[0]?.type).toBe(5);
        expect(result.sections[0]?.attributes[0]?.value).toEqual({
            items: [
                { id: 'status-1', name: 'Status 1', color: '#0082ff', blink: false, active: false, icon: '' },
                {
                    id: 'st-2',
                    name: 'Morto',
                    color: '#00ff00',
                    blink: false,
                    active: false,
                    icon: 'https://exemplo.com/icone.png'
                }
            ]
        });
    });
});

describe('seção de galeria', () => {
    const gallerySections = [
        {
            name: 'Aparência',
            type: 4 as const,
            position: 0,
            attributes: [
                { name: 'Rosto', type: 2 as const, position: 0, value: 'https://exemplo.com/rosto.png' },
                { name: 'Corpo', type: 2 as const, position: 1, value: 'https://exemplo.com/corpo.png' }
            ]
        }
    ];

    it('aceita apenas imagens', () => {
        expect(sheetAttributesSchema.safeParse({ sections: gallerySections }).success).toBe(true);
        expect(
            sheetAttributesSchema.safeParse({
                sections: [
                    {
                        ...gallerySections[0],
                        attributes: [{ name: 'Texto', type: 0, position: 0, value: 'a' }]
                    }
                ]
            }).success
        ).toBe(false);
    });

    it('limita as colunas a 6 e descarta linhas e dense', () => {
        expect(
            normalizeSheetLayout({ sections: { Aparência: { columns: 9, rows: 4, dense: true } } }, gallerySections)
        ).toEqual({ sections: { Aparência: { columns: 6, attributes: {}, span: 12 } } });
    });

    it('usa uma coluna por imagem como padrão de span', () => {
        expect(
            normalizeSheetLayout(
                { sections: { Aparência: { columns: 3, attributes: { Rosto: 2, Corpo: 1 } } } },
                gallerySections
            )
        ).toEqual({
            sections: {
                Aparência: {
                    columns: 3,
                    attributes: { Rosto: { span: 2, rows: 1 } },
                    span: 12
                }
            }
        });
    });
});

describe('seção de tabela', () => {
    const tableValue = {
        columns: ['Nome', 'Valor'],
        rows: [
            ['Corda', '2'],
            ['Poção', '1']
        ]
    };

    function parse(attributes: unknown[], type = 5): { success: boolean } {
        return sheetAttributesSchema.safeParse({
            sections: [{ name: 'Inventário', type, position: 0, attributes }]
        });
    }

    it('aceita uma tabela de texto', () => {
        expect(parse([{ name: 'Tabela', type: 6, position: 0, value: tableValue }]).success).toBe(true);
    });

    it('recusa linhas com tamanho diferente, colunas fora do limite e células longas', () => {
        const withValue = (value: unknown) => parse([{ name: 'Tabela', type: 6, position: 0, value }]);

        expect(withValue({ columns: ['A'], rows: [] }).success).toBe(false);
        expect(withValue({ columns: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'], rows: [] }).success).toBe(false);
        expect(withValue({ columns: ['A', 'B'], rows: [['1']] }).success).toBe(false);
        expect(withValue({ columns: ['A', 'B'], rows: [['1', 'x'.repeat(129)]] }).success).toBe(false);
        expect(withValue({ columns: ['', 'B'], rows: [] }).success).toBe(false);
        expect(withValue({ columns: ['A', 'B'], rows: Array.from({ length: 101 }, () => ['1', '2']) }).success).toBe(
            false
        );
    });

    it('recusa tabela em seções comuns e mais de um bloco', () => {
        expect(parse([{ name: 'Tabela', type: 6, position: 0, value: tableValue }], 0).success).toBe(false);
        expect(
            parse([
                { name: 'Tabela', type: 6, position: 0, value: tableValue },
                { name: 'Outra', type: 6, position: 1, value: tableValue }
            ]).success
        ).toBe(false);
    });

    it('normaliza colunas ausentes, linhas curtas e células longas', () => {
        const result = normalizeSheetAttributes(
            {
                sections: [
                    {
                        name: 'Inventário',
                        type: 5,
                        position: 0,
                        attributes: [
                            {
                                name: 'Tabela',
                                type: 6,
                                position: 0,
                                value: {
                                    columns: ['  Nome  '],
                                    rows: [['Corda', 'extra'], ['x'.repeat(200)]]
                                }
                            }
                        ]
                    }
                ]
            },
            false
        );

        expect(result.sections[0]?.attributes[0]?.value).toEqual({
            columns: ['Nome', 'Coluna 2'],
            rows: [
                ['Corda', 'extra'],
                ['x'.repeat(128), '']
            ]
        });
    });
});

describe('compartilhamento da ficha', () => {
    it('aceita publicar sem senha, com senha nova ou removendo a senha', () => {
        expect(sheetSharingSchema.safeParse({ version, isPublic: true }).success).toBe(true);
        expect(sheetSharingSchema.safeParse({ version, isPublic: true, password: 'abcd' }).success).toBe(true);
        expect(sheetSharingSchema.safeParse({ version, isPublic: false, password: null }).success).toBe(true);
    });

    it('recusa senha curta ou longa demais', () => {
        expect(sheetSharingSchema.safeParse({ version, isPublic: true, password: 'abc' }).success).toBe(false);
        expect(sheetSharingSchema.safeParse({ version, isPublic: true, password: 'a'.repeat(65) }).success).toBe(false);
    });

    it('exige versão e isPublic', () => {
        expect(sheetSharingSchema.safeParse({ isPublic: true }).success).toBe(false);
        expect(sheetSharingSchema.safeParse({ version }).success).toBe(false);
    });
});
