import { describe, expect, it, vi } from 'vitest';
import {
    createPanelService,
    type AccountRow,
    type LiveSheetRow,
    type MacroRow,
    type SheetRow,
    type SummaryRow
} from '../../server/services/panel.service';

const createdAt = new Date('2026-10-01T12:00:00Z');
const lastUse = new Date('2026-10-31T12:00:00Z');

function createAccount(overrides: Partial<AccountRow> = {}): AccountRow {
    return {
        id: 42,
        username: 'lyra',
        email: 'lyra@example.com',
        avatar: null,
        created_at: createdAt,
        discord_id: null,
        ...overrides
    };
}

function createSummary(overrides: Partial<SummaryRow> = {}): SummaryRow {
    return {
        sheets: '3',
        public_sheets: '1',
        live_sheets: '2',
        macros: '4',
        ...overrides
    };
}

function createSheet(overrides: Partial<SheetRow> = {}): SheetRow {
    return {
        id: 7,
        sheet_name: 'Lyra Voss',
        is_public: true,
        legacy: false,
        last_use: lastUse,
        is_live: true,
        ...overrides
    };
}

function createLive(overrides: Partial<LiveSheetRow> = {}): LiveSheetRow {
    return {
        id: 3,
        sheet_id: 7,
        sheet_name: 'Lyra Voss',
        channel_id: '123',
        msg_id: '456',
        last_use: lastUse,
        ...overrides
    };
}

function createMacro(overrides: Partial<MacroRow> = {}): MacroRow {
    return {
        id: 9,
        macro_name: 'Ataque',
        is_public: false,
        last_use: lastUse,
        ...overrides
    };
}

function createService() {
    const findAccount = vi.fn().mockResolvedValue(createAccount());
    const findSummary = vi.fn().mockResolvedValue(createSummary());
    const findSheets = vi.fn().mockResolvedValue([createSheet()]);
    const findLiveSheets = vi.fn().mockResolvedValue([createLive()]);
    const findMacros = vi.fn().mockResolvedValue([createMacro()]);
    const service = createPanelService({ findAccount, findSummary, findSheets, findLiveSheets, findMacros });

    return { service, findAccount, findSummary, findSheets, findLiveSheets, findMacros };
}

describe('serviço do painel', () => {
    it('monta a visão geral com conta, contagens e recentes', async () => {
        const { service, findSheets } = createService();

        const result = await service.getOverview(42);

        expect(result.account).toEqual({
            id: 42,
            username: 'lyra',
            email: 'lyra@example.com',
            avatar: null,
            createdAt: createdAt.toISOString(),
            discordLinked: false
        });
        expect(result.summary).toEqual({
            sheets: 3,
            publicSheets: 1,
            liveSheets: 2,
            macros: 4
        });
        expect(result.recentSheets).toEqual([
            {
                id: 7,
                name: 'Lyra Voss',
                isPublic: true,
                isLegacy: false,
                isLive: true,
                updatedAt: lastUse.toISOString()
            }
        ]);
        expect(findSheets).toHaveBeenCalledWith(42, 5);
    });

    it('rejeita contagem inválida em vez de inventar zero', async () => {
        const { service, findSummary } = createService();
        findSummary.mockResolvedValue(createSummary({ sheets: 'invalido' }));

        await expect(service.getOverview(42)).rejects.toThrow(/Contagem inválida/);
    });

    it('lista fichas com limite aplicado', async () => {
        const { service, findSheets } = createService();

        const sheets = await service.getSheets(42, 50);

        expect(sheets).toHaveLength(1);
        expect(findSheets).toHaveBeenCalledWith(42, 50);
    });

    it('lista vínculos ao vivo', async () => {
        const { service } = createService();

        const live = await service.getLiveSheets(42, 10);

        expect(live).toEqual([
            {
                id: 3,
                sheetId: 7,
                sheetName: 'Lyra Voss',
                channelId: '123',
                messageId: '456',
                lastUse: lastUse.toISOString()
            }
        ]);
    });

    it('lista macros', async () => {
        const { service } = createService();

        const macros = await service.getMacros(42, 10);

        expect(macros).toEqual([
            {
                id: 9,
                name: 'Ataque',
                isPublic: false,
                updatedAt: lastUse.toISOString()
            }
        ]);
    });

    it('falha quando a conta não existe', async () => {
        const { service, findAccount } = createService();
        findAccount.mockResolvedValue(null);

        await expect(service.getAccount(42)).rejects.toThrow(/Conta não encontrada/);
    });
});
