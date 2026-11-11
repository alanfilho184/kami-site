import { hashSync } from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { sheetRequiresPassword, verifySheetPassword } from '../../server/services/public-sheet.service';
import type { SheetRow } from '../../server/services/sheet.service';

function createRow(overrides: Partial<SheetRow> = {}): SheetRow {
    return {
        id: 7,
        user_id: 42,
        sheet_name: 'Lyra Voss',
        sheet_password: null,
        is_public: true,
        legacy: false,
        attributes: { sections: [] },
        sheet_layout: null,
        last_use: new Date('2026-10-31T15:30:00Z'),
        created_at: new Date('2026-05-01T10:00:00Z'),
        is_live: false,
        ...overrides
    };
}

describe('verifySheetPassword', () => {
    it('libera quando a ficha não tem senha', async () => {
        await expect(verifySheetPassword(null, 'qualquer')).resolves.toBe(true);
        await expect(verifySheetPassword('', 'qualquer')).resolves.toBe(true);
    });

    it('aceita a senha correta de um hash bcrypt', async () => {
        const stored = hashSync('segredo-da-lyra', 4);

        await expect(verifySheetPassword(stored, 'segredo-da-lyra')).resolves.toBe(true);
    });

    it('recusa a senha errada de um hash bcrypt', async () => {
        const stored = hashSync('segredo-da-lyra', 4);

        await expect(verifySheetPassword(stored, 'outra-senha')).resolves.toBe(false);
    });

    it('aceita senhas legadas em texto puro', async () => {
        await expect(verifySheetPassword('senha-antiga', 'senha-antiga')).resolves.toBe(true);
    });

    it('recusa texto puro diferente sem estourar por tamanho', async () => {
        await expect(verifySheetPassword('senha-antiga', 'senha')).resolves.toBe(false);
        await expect(verifySheetPassword('senha', 'senha-antiga')).resolves.toBe(false);
    });
});

describe('sheetRequiresPassword', () => {
    it('só exige senha quando existe valor salvo', () => {
        expect(sheetRequiresPassword(createRow())).toBe(false);
        expect(sheetRequiresPassword(createRow({ sheet_password: '' }))).toBe(false);
        expect(sheetRequiresPassword(createRow({ sheet_password: 'hash' }))).toBe(true);
    });
});
