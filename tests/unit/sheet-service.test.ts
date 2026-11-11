import { describe, expect, it, vi } from 'vitest';
import { buildCopyName, buildSheetQuota, createSheetService, type SheetRow } from '../../server/services/sheet.service';
import {
    InvalidSheetError,
    SheetConflictError,
    SheetLimitError,
    SheetNameTakenError,
    SheetNotFoundError
} from '../../server/services/sheet-errors';

const createdAt = new Date('2026-05-01T10:00:00Z');
const lastUse = new Date('2026-10-31T15:30:00.123Z');
const version = lastUse.toISOString();

const emptyInfo = { sections: [{ name: 'Info', type: 0, position: 0, attributes: [] }] };

function createRow(overrides: Partial<SheetRow> = {}): SheetRow {
    return {
        id: 7,
        user_id: 42,
        sheet_name: 'Lyra Voss',
        sheet_password: null,
        is_public: false,
        legacy: false,
        attributes: { sections: [] },
        sheet_layout: null,
        last_use: lastUse,
        created_at: createdAt,
        is_live: false,
        ...overrides
    };
}

interface ServiceDependencies {
    findSheet: ReturnType<typeof vi.fn>;
    findSheetByName: ReturnType<typeof vi.fn>;
    findSheetName: ReturnType<typeof vi.fn>;
    countSheets: ReturnType<typeof vi.fn>;
    insertSheet: ReturnType<typeof vi.fn>;
    updateSheetRecord: ReturnType<typeof vi.fn>;
    renameSheetRecord: ReturnType<typeof vi.fn>;
    updateSheetSharingRecord: ReturnType<typeof vi.fn>;
    deleteSheetRecord: ReturnType<typeof vi.fn>;
    listIrtSheets: ReturnType<typeof vi.fn>;
}

function createService() {
    const deps: ServiceDependencies = {
        findSheet: vi.fn(),
        findSheetByName: vi.fn(),
        findSheetName: vi.fn(),
        countSheets: vi.fn().mockResolvedValue(0),
        insertSheet: vi.fn(),
        updateSheetRecord: vi.fn(),
        renameSheetRecord: vi.fn(),
        updateSheetSharingRecord: vi.fn(),
        deleteSheetRecord: vi.fn(),
        listIrtSheets: vi.fn().mockResolvedValue([])
    };
    const service = createSheetService(deps);

    return { service, deps };
}

describe('serviço de fichas', () => {
    it('getSheet falha quando a ficha não existe', async () => {
        const { service, deps } = createService();
        deps.findSheet.mockResolvedValue(null);

        await expect(service.getSheet(42, 7)).rejects.toThrow(SheetNotFoundError);
        expect(deps.findSheet).toHaveBeenCalledWith(42, 7);
    });

    it('getSheetByName devolve a ficha mais recente do dono com aquele nome', async () => {
        const { service, deps } = createService();
        deps.findSheetByName.mockResolvedValue(createRow({ id: 9, sheet_name: 'Lyra Voss' }));

        const detail = await service.getSheetByName(42, 'Lyra Voss');

        expect(detail.id).toBe(9);
        expect(deps.findSheetByName).toHaveBeenCalledWith(42, 'Lyra Voss');
    });

    it('getSheetByName falha quando o dono não tem a ficha', async () => {
        const { service, deps } = createService();
        deps.findSheetByName.mockResolvedValue(null);

        await expect(service.getSheetByName(42, 'Sumida')).rejects.toThrow(SheetNotFoundError);
    });

    it('getSheet devolve o detalhe normalizado de uma ficha legada', async () => {
        const { service, deps } = createService();
        deps.findSheet.mockResolvedValue(
            createRow({ legacy: true, attributes: { Força: 12, Biografia: 'Cientista' } })
        );

        const detail = await service.getSheet(42, 7);

        expect(detail).toMatchObject({
            id: 7,
            userId: 42,
            name: 'Lyra Voss',
            isPublic: false,
            hasPassword: false,
            isLegacy: true,
            isLive: false,
            version,
            createdAt: createdAt.toISOString()
        });
        expect(detail.attributes).toEqual({
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

    it('inclui o nome do criador quando a consulta pública traz creator_name', async () => {
        const { service, deps } = createService();
        deps.findSheet.mockResolvedValue(createRow({ creator_name: '  Lyra  ' }));

        const detail = await service.getSheet(42, 7);

        expect(detail.creatorName).toBe('Lyra');
    });

    it('createSheet grava o nome limpo e a seção Info vazia', async () => {
        const { service, deps } = createService();
        deps.findSheetName.mockResolvedValue(null);
        deps.insertSheet.mockResolvedValue(createRow({ id: 9, sheet_name: 'Nova Ficha' }));

        const detail = await service.createSheet(42, '  Nova Ficha  ');

        expect(detail.id).toBe(9);
        expect(detail.name).toBe('Nova Ficha');
        expect(detail.attributes).toEqual(emptyInfo);
        expect(deps.insertSheet).toHaveBeenCalledWith(42, 'Nova Ficha', emptyInfo, false, false, null);
    });

    it('createSheet recusa nome já usado pela conta', async () => {
        const { service, deps } = createService();
        deps.findSheetName.mockResolvedValue({ id: 5 });

        await expect(service.createSheet(42, 'Lyra Voss')).rejects.toThrow(SheetNameTakenError);
        expect(deps.insertSheet).not.toHaveBeenCalled();
    });

    it('createSheet recusa nome inválido sem tocar o banco', async () => {
        const { service, deps } = createService();

        await expect(service.createSheet(42, 'nome de $criança')).rejects.toThrow(InvalidSheetError);
        expect(deps.findSheetName).not.toHaveBeenCalled();
        expect(deps.insertSheet).not.toHaveBeenCalled();
    });

    it('createSheet bloqueia a conta gratuita no limite de 30 fichas', async () => {
        const { service, deps } = createService();
        deps.findSheetName.mockResolvedValue(null);
        deps.countSheets.mockResolvedValue(30);

        await expect(service.createSheet(42, 'Nova Ficha')).rejects.toThrow(SheetLimitError);
        expect(deps.insertSheet).not.toHaveBeenCalled();
    });

    it('createSheet libera a conta premium mesmo acima do limite gratuito', async () => {
        const { service, deps } = createService();
        deps.findSheetName.mockResolvedValue(null);
        deps.countSheets.mockResolvedValue(999);
        deps.insertSheet.mockResolvedValue(createRow({ id: 9, sheet_name: 'Nova Ficha' }));

        const detail = await service.createSheet(42, 'Nova Ficha', true);

        expect(detail.id).toBe(9);
        expect(deps.countSheets).not.toHaveBeenCalled();
        expect(deps.insertSheet).toHaveBeenCalledWith(42, 'Nova Ficha', emptyInfo, false, false, null);
    });

    it('updateSheet permite editar ficha ao vivo e mantém o selo', async () => {
        const { service, deps } = createService();
        deps.findSheet.mockResolvedValue(createRow({ is_live: true }));
        deps.findSheetName.mockResolvedValue(null);
        deps.updateSheetRecord.mockResolvedValue(createRow({ is_live: true }));

        const detail = await service.updateSheet(42, 7, { name: 'Lyra Voss', attributes: emptyInfo, version });

        expect(detail.isLive).toBe(true);
        expect(deps.updateSheetRecord).toHaveBeenCalled();
    });

    it('updateSheet sinaliza conflito quando a versão não corresponde mais', async () => {
        const { service, deps } = createService();
        deps.findSheet.mockResolvedValue(createRow());
        deps.findSheetName.mockResolvedValue(null);
        deps.updateSheetRecord.mockResolvedValue(null);

        await expect(
            service.updateSheet(42, 7, { name: 'Lyra Voss', attributes: { sections: [] }, version })
        ).rejects.toThrow(SheetConflictError);
        expect(deps.findSheet).toHaveBeenCalledTimes(2);
    });

    it('updateSheet salva os atributos normalizados e devolve a nova versão', async () => {
        const { service, deps } = createService();
        const nextUse = new Date('2026-10-31T16:00:00Z');
        deps.findSheet.mockResolvedValue(createRow());
        deps.findSheetName.mockResolvedValue(null);
        deps.updateSheetRecord.mockResolvedValue(
            createRow({
                last_use: nextUse,
                attributes: {
                    sections: [
                        {
                            name: 'Info',
                            type: 0,
                            position: 0,
                            attributes: [{ name: 'Nível', type: 1, position: 0, value: '3' }]
                        }
                    ]
                }
            })
        );

        const attributes = {
            sections: [
                {
                    name: 'Info',
                    type: 0,
                    position: 0,
                    attributes: [{ name: 'Nível', type: 1, position: 0, value: '3' }]
                }
            ]
        };
        const detail = await service.updateSheet(42, 7, { name: 'Lyra Voss', attributes, version });

        expect(detail.version).toBe(nextUse.toISOString());
        expect(deps.updateSheetRecord).toHaveBeenCalledWith(42, 7, {
            name: 'Lyra Voss',
            attributes,
            layout: null,
            version
        });
        expect(deps.findSheetName).toHaveBeenCalledWith(42, 'Lyra Voss', 7);
    });

    it('updateSheet normaliza o layout contra os atributos salvos', async () => {
        const { service, deps } = createService();
        const attributes = {
            sections: [
                {
                    name: 'Info',
                    type: 0,
                    position: 0,
                    attributes: [{ name: 'Nível', type: 1, position: 0, value: '3' }]
                }
            ]
        };
        deps.findSheet.mockResolvedValue(createRow());
        deps.findSheetName.mockResolvedValue(null);
        deps.updateSheetRecord.mockResolvedValue(
            createRow({
                attributes,
                sheet_layout: { sections: { Info: { columns: 2, full: ['Nível'] } } }
            })
        );

        const detail = await service.updateSheet(42, 7, {
            name: 'Lyra Voss',
            attributes,
            layout: { sections: { Info: { columns: 2, full: ['Nível', 'Fantasma'] } } },
            version
        });

        expect(deps.updateSheetRecord).toHaveBeenCalledWith(42, 7, {
            name: 'Lyra Voss',
            attributes,
            layout: {
                sections: { Info: { columns: 2, attributes: { Nível: { span: 2, rows: 1 } }, span: 12 } }
            },
            version
        });
        expect(detail.layout).toEqual({
            sections: { Info: { columns: 2, attributes: { Nível: { span: 2, rows: 1 } }, span: 12 } }
        });
    });

    it('updateSheetSharing publica mantendo a senha atual quando ela é omitida', async () => {
        const { service, deps } = createService();
        const storedHash = '$2b$12$senhaantiga';
        deps.findSheet.mockResolvedValue(createRow({ sheet_password: storedHash }));
        deps.updateSheetSharingRecord.mockResolvedValue(createRow({ is_public: true, sheet_password: storedHash }));

        const detail = await service.updateSheetSharing(42, 7, { version, isPublic: true });

        expect(deps.updateSheetSharingRecord).toHaveBeenCalledWith(42, 7, {
            isPublic: true,
            password: storedHash,
            version
        });
        expect(detail.isPublic).toBe(true);
        expect(detail.hasPassword).toBe(true);
    });

    it('updateSheetSharing grava uma senha nova em bcrypt', async () => {
        const { service, deps } = createService();
        deps.findSheet.mockResolvedValue(createRow());
        deps.updateSheetSharingRecord.mockResolvedValue(createRow({ is_public: true, sheet_password: 'hash' }));

        await service.updateSheetSharing(42, 7, { version, isPublic: true, password: 'segredo' });

        const call = deps.updateSheetSharingRecord.mock.calls[0];

        expect(call?.[0]).toBe(42);
        expect(call?.[1]).toBe(7);
        expect(call?.[2]).toMatchObject({ isPublic: true, version });
        expect(call?.[2].password).toMatch(/^\$2[aby]\$12\$/);
        expect(call?.[2].password).not.toBe('segredo');
    });

    it('updateSheetSharing remove a senha quando recebe null', async () => {
        const { service, deps } = createService();
        deps.findSheet.mockResolvedValue(createRow({ sheet_password: 'hash-antigo' }));
        deps.updateSheetSharingRecord.mockResolvedValue(createRow({ is_public: true, sheet_password: null }));

        const detail = await service.updateSheetSharing(42, 7, { version, isPublic: true, password: null });

        expect(deps.updateSheetSharingRecord).toHaveBeenCalledWith(42, 7, {
            isPublic: true,
            password: null,
            version
        });
        expect(detail.hasPassword).toBe(false);
    });

    it('updateSheetSharing permite alterar o compartilhamento de ficha ao vivo', async () => {
        const { service, deps } = createService();
        deps.findSheet.mockResolvedValue(createRow({ is_live: true }));
        deps.updateSheetSharingRecord.mockResolvedValue(createRow({ is_live: true, is_public: true }));

        await expect(service.updateSheetSharing(42, 7, { version, isPublic: true })).resolves.toMatchObject({
            isLive: true,
            isPublic: true
        });
        expect(deps.updateSheetSharingRecord).toHaveBeenCalled();
    });

    it('updateSheetSharing sinaliza conflito quando a versão não corresponde', async () => {
        const { service, deps } = createService();
        deps.findSheet.mockResolvedValue(createRow());
        deps.updateSheetSharingRecord.mockResolvedValue(null);

        await expect(service.updateSheetSharing(42, 7, { version, isPublic: true })).rejects.toThrow(
            SheetConflictError
        );
    });

    it('deleteSheet exclui ficha ao vivo e delega a limpeza dos vínculos IRT', async () => {
        const { service, deps } = createService();
        deps.findSheet.mockResolvedValue(createRow({ is_live: true }));
        deps.deleteSheetRecord.mockResolvedValue(7);

        await expect(service.deleteSheet(42, 7, version)).resolves.toBeUndefined();
        expect(deps.listIrtSheets).toHaveBeenCalledWith(42, 7);
        expect(deps.deleteSheetRecord).toHaveBeenCalledWith(42, 7, version);
    });

    it('deleteSheet exclui com a versão atual', async () => {
        const { service, deps } = createService();
        deps.findSheet.mockResolvedValue(createRow());
        deps.deleteSheetRecord.mockResolvedValue(7);

        await expect(service.deleteSheet(42, 7, version)).resolves.toBeUndefined();
        expect(deps.deleteSheetRecord).toHaveBeenCalledWith(42, 7, version);
    });

    it('deleteSheet sinaliza conflito quando a exclusão não sai', async () => {
        const { service, deps } = createService();
        deps.findSheet.mockResolvedValue(createRow());
        deps.deleteSheetRecord.mockResolvedValue(null);

        await expect(service.deleteSheet(42, 7, version)).rejects.toThrow(SheetConflictError);
    });

    it('duplicateSheet gera o nome com (cópia) e copia atributos legados', async () => {
        const { service, deps } = createService();
        deps.findSheet.mockResolvedValue(createRow({ legacy: true, attributes: { Poção: 'Cura' } }));
        deps.findSheetName.mockResolvedValue(null);
        deps.insertSheet.mockResolvedValue(createRow({ id: 10, legacy: true, sheet_name: 'Lyra Voss (cópia)' }));

        const detail = await service.duplicateSheet(42, 7);

        expect(detail.name).toBe('Lyra Voss (cópia)');
        expect(detail.isLegacy).toBe(true);
        expect(deps.findSheetName).toHaveBeenCalledWith(42, 'Lyra Voss (cópia)', 0);
        expect(deps.insertSheet).toHaveBeenCalledWith(42, 'Lyra Voss (cópia)', { Poção: 'Cura' }, true, false, null);
    });

    it('duplicateSheet incrementa a numeração da cópia existente', async () => {
        const { service, deps } = createService();
        deps.findSheet.mockResolvedValue(createRow());
        deps.findSheetName.mockResolvedValueOnce({ id: 5 }).mockResolvedValue(null);
        deps.insertSheet.mockResolvedValue(createRow({ id: 11, sheet_name: 'Lyra Voss (cópia 2)' }));

        const detail = await service.duplicateSheet(42, 7);

        expect(detail.name).toBe('Lyra Voss (cópia 2)');
        expect(detail.isLegacy).toBe(false);
        expect(deps.insertSheet).toHaveBeenCalledWith(42, 'Lyra Voss (cópia 2)', { sections: [] }, false, false, null);
    });

    it('duplicateSheet falha quando a ficha de origem não existe', async () => {
        const { service, deps } = createService();
        deps.findSheet.mockResolvedValue(null);

        await expect(service.duplicateSheet(42, 7)).rejects.toThrow(SheetNotFoundError);
    });

    it('duplicateSheet bloqueia a conta gratuita no limite de 30 fichas', async () => {
        const { service, deps } = createService();
        deps.findSheet.mockResolvedValue(createRow());
        deps.countSheets.mockResolvedValue(30);

        await expect(service.duplicateSheet(42, 7)).rejects.toThrow(SheetLimitError);
        expect(deps.insertSheet).not.toHaveBeenCalled();
    });

    it('duplicateSheet permite a conta premium sem consultar a cota', async () => {
        const { service, deps } = createService();
        deps.findSheet.mockResolvedValue(createRow());
        deps.findSheetName.mockResolvedValue(null);
        deps.countSheets.mockResolvedValue(30);
        deps.insertSheet.mockResolvedValue(createRow({ id: 10, sheet_name: 'Lyra Voss (cópia)' }));

        const detail = await service.duplicateSheet(42, 7, true);

        expect(detail.id).toBe(10);
        expect(deps.countSheets).not.toHaveBeenCalled();
    });

    it('getQuota devolve o limite e o saldo da conta gratuita', async () => {
        const { service, deps } = createService();
        deps.countSheets.mockResolvedValue(12);

        await expect(service.getQuota(42, false)).resolves.toEqual({
            used: 12,
            limit: 30,
            remaining: 18,
            isPremium: false,
            canCreate: true
        });
    });

    it('getQuota devolve cota ilimitada para a conta premium', async () => {
        const { service, deps } = createService();
        deps.countSheets.mockResolvedValue(80);

        await expect(service.getQuota(42, true)).resolves.toEqual({
            used: 80,
            limit: null,
            remaining: null,
            isPremium: true,
            canCreate: true
        });
    });
});

describe('buildSheetQuota', () => {
    it('nunca deixa o saldo ficar negativo acima do limite', () => {
        expect(buildSheetQuota(34, false)).toEqual({
            used: 34,
            limit: 30,
            remaining: 0,
            isPremium: false,
            canCreate: false
        });
    });
});

describe('buildCopyName', () => {
    it('gera (cópia) e (cópia N) com sufixo crescente', () => {
        expect(buildCopyName('Lyra Voss', 1)).toBe('Lyra Voss (cópia)');
        expect(buildCopyName('Lyra Voss', 2)).toBe('Lyra Voss (cópia 2)');
        expect(buildCopyName('Lyra Voss', 12)).toBe('Lyra Voss (cópia 12)');
    });

    it('mantém o nome final dentro de 32 caracteres', () => {
        const copy = buildCopyName('Ficha completa de aventuras épicas', 1);

        expect(copy.length).toBe(32);
        expect(copy.endsWith(' (cópia)')).toBe(true);

        const numbered = buildCopyName('F'.repeat(40), 2);

        expect(numbered.length).toBe(32);
        expect(numbered).toBe(`${'F'.repeat(22)} (cópia 2)`);
    });
});
