import { describe, expect, it } from 'vitest';
import {
    findDuplicateSheetNames,
    formatSyncCode,
    generateSyncCode,
    hashSyncCode,
    normalizeSyncCode
} from '../../server/services/discord-link.service';
import { DiscordLinkError, resolveDiscordLinkError } from '../../server/services/discord-link-errors';

describe('código de vínculo do Discord', () => {
    it('gera oito caracteres do alfabeto sem ambiguidade', () => {
        const code = generateSyncCode(() => 0);

        expect(code).toBe('AAAAAAAA');
        expect(code).toHaveLength(8);
    });

    it('normaliza minúsculas e separadores', () => {
        expect(normalizeSyncCode('k7m2-9q4f')).toBe('K7M29Q4F');
        expect(normalizeSyncCode('K7M2 9Q4F')).toBe('K7M29Q4F');
        expect(formatSyncCode('K7M29Q4F')).toBe('K7M2-9Q4F');
    });

    it('recusa tamanho errado e caracteres ambíguos', () => {
        expect(normalizeSyncCode('K7M2-9Q4')).toBeNull();
        expect(normalizeSyncCode('K7M2-9Q4F0')).toBeNull();
        expect(normalizeSyncCode('K7M2-9Q4O')).toBeNull();
        expect(normalizeSyncCode('K7M2-9Q4I')).toBeNull();
    });

    it('gera um HMAC estável e sensível ao segredo', () => {
        const first = hashSyncCode('a'.repeat(32), 'K7M29Q4F');
        const second = hashSyncCode('a'.repeat(32), 'K7M29Q4F');
        const other = hashSyncCode('b'.repeat(32), 'K7M29Q4F');

        expect(first).toMatch(/^[a-f0-9]{64}$/);
        expect(second).toBe(first);
        expect(other).not.toBe(first);
    });

    it('encontra nomes repetidos entre as duas contas', () => {
        expect(findDuplicateSheetNames(['Lyra', 'Lyra', 'Voss'], ['Voss', 'Kai'])).toEqual(['Lyra', 'Voss']);
        expect(findDuplicateSheetNames(['Lyra'], ['Voss'])).toEqual([]);
    });
});

describe('erros do vínculo do Discord', () => {
    it('preserva código e lista de fichas duplicadas', () => {
        const error = new DiscordLinkError('discord_duplicate_sheet_names', 409, 'Renomeie as fichas.', [
            'Lyra',
            'Voss'
        ]);
        const resolved = resolveDiscordLinkError(error);

        expect(resolved).toEqual({
            statusCode: 409,
            response: {
                message: 'Renomeie as fichas.',
                code: 'discord_duplicate_sheet_names',
                duplicateSheetNames: ['Lyra', 'Voss']
            }
        });
    });

    it('ignora erros desconhecidos', () => {
        expect(resolveDiscordLinkError(new Error('banco fora'))).toBeNull();
    });
});
