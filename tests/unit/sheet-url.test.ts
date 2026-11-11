import { describe, expect, it } from 'vitest';
import { sheetPath, sheetUrl } from '../../shared/utils/sheet-url';

describe('URL da ficha', () => {
    it('monta a URL canônica com o nome codificado', () => {
        expect(sheetPath(42, 'Lyra Voss')).toBe('/42/ficha/Lyra%20Voss');
        expect(sheetPath(42, 'A/B?C#D')).toBe('/42/ficha/A%2FB%3FC%23D');
        expect(sheetPath(42, 'Júlia')).toBe('/42/ficha/J%C3%BAlia');
    });

    it('só adiciona o id quando ele é necessário', () => {
        expect(sheetUrl(42, 'Lyra Voss')).toBe('/42/ficha/Lyra%20Voss');
        expect(sheetUrl(42, 'Lyra Voss', 0)).toBe('/42/ficha/Lyra%20Voss');
        expect(sheetUrl(42, 'Lyra Voss', 7)).toBe('/42/ficha/Lyra%20Voss?id=7');
    });

    it('faz round-trip do nome pelo decodeURIComponent', () => {
        const name = 'Nome com / barra, ? interrogação e # cerquilha';
        const path = sheetPath(7, name);

        expect(decodeURIComponent(path.split('/').pop() ?? '')).toBe(name);
    });
});
