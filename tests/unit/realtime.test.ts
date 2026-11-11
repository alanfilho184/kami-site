import { afterEach, describe, expect, it, vi } from 'vitest';
import { REALTIME_SERVICE_ROOMS } from '../../shared/constants/realtime';
import { publicSheetRoom, sheetRoom, userRoom } from '../../shared/utils/realtime';
import {
    buildSheetRealtimeEvent,
    disconnectUserSessions,
    emitSheetUnpublished,
    emitSheetUpdated,
    setRealtimeServer,
    type RealtimeServer
} from '../../server/services/realtime.service';
import { compareServiceToken, readServiceRooms } from '../../server/utils/service-auth';
import { readCookieValue } from '../../server/utils/socket-cookie';
import { getSocketIp, isAllowedSocketOrigin } from '../../server/utils/socket-origin';

const sheet = {
    id: 7,
    userId: 42,
    version: '2026-11-06T12:00:00.000Z',
    name: 'Lyra'
};

afterEach(() => {
    setRealtimeServer(null);
});

describe('eventos de tempo real', () => {
    it('monta um envelope mínimo e estável para a ficha', () => {
        const event = buildSheetRealtimeEvent('sheet.updated', sheet, {
            id: 'evt-1',
            now: new Date('2026-11-06T15:00:00Z')
        });

        expect(event).toEqual({
            id: 'evt-1',
            type: 'sheet.updated',
            occurredAt: '2026-11-06T15:00:00.000Z',
            resource: 'sheet',
            resourceId: 7,
            userId: 42,
            version: sheet.version,
            name: 'Lyra'
        });
    });

    it('entrega a atualização para a ficha, o dono e o serviço de fichas', () => {
        const emit = vi.fn();
        const chain = {
            to: vi.fn(),
            emit
        };
        chain.to.mockReturnValue(chain);
        setRealtimeServer(chain as unknown as RealtimeServer);

        const delivered = emitSheetUpdated(sheet);

        expect(delivered).toBe(true);
        expect(chain.to).toHaveBeenNthCalledWith(1, sheetRoom(7));
        expect(chain.to).toHaveBeenNthCalledWith(2, userRoom(42));
        expect(chain.to).toHaveBeenNthCalledWith(3, REALTIME_SERVICE_ROOMS.sheets);
        expect(emit).toHaveBeenCalledWith(
            'sheet.updated',
            expect.objectContaining({ resourceId: 7, userId: 42, version: sheet.version })
        );
    });

    it('inclui a sala pública quando a ficha está publicada', () => {
        const emit = vi.fn();
        const chain = { to: vi.fn(), emit };
        chain.to.mockReturnValue(chain);
        setRealtimeServer(chain as unknown as RealtimeServer);

        emitSheetUpdated({ ...sheet, isPublic: true });

        expect(chain.to).toHaveBeenNthCalledWith(1, sheetRoom(7));
        expect(chain.to).toHaveBeenNthCalledWith(2, userRoom(42));
        expect(chain.to).toHaveBeenNthCalledWith(3, REALTIME_SERVICE_ROOMS.sheets);
        expect(chain.to).toHaveBeenNthCalledWith(4, publicSheetRoom(7));
    });

    it('entrega o evento localmente e remove os sockets da sala pública ao despublicar', () => {
        const emit = vi.fn();
        const socketsLeave = vi.fn();
        const local = { to: vi.fn() };
        const chain = { to: vi.fn(), in: vi.fn(), local, emit, socketsLeave };
        local.to.mockReturnValue(chain);
        chain.to.mockReturnValue(chain);
        chain.in.mockReturnValue(chain);
        setRealtimeServer(chain as unknown as RealtimeServer);

        const delivered = emitSheetUnpublished(7, 42, sheet.version, 'Lyra');

        expect(delivered).toBe(true);
        expect(local.to).toHaveBeenCalledWith(publicSheetRoom(7));
        expect(chain.to).toHaveBeenCalledWith(publicSheetRoom(7));
        expect(emit).toHaveBeenCalledWith('sheet.unpublished', expect.objectContaining({ resourceId: 7 }));
        expect(chain.socketsLeave).toHaveBeenCalledWith(publicSheetRoom(7));
    });

    it('não falha quando o Socket.IO ainda não está disponível', () => {
        expect(emitSheetUpdated(sheet)).toBe(false);
    });

    it('desconecta sockets de outras sessões da mesma conta', async () => {
        const disconnectOther = vi.fn();
        const disconnectKept = vi.fn();
        const disconnectOtherUser = vi.fn();
        const auth = { id: 42, username: 'lyra', email: 'lyra@example.com', isPremium: false };
        const sockets = [
            {
                data: { kind: 'user', user: auth, sessionTokenHash: 'outra-sessao' },
                disconnect: disconnectOther
            },
            {
                data: { kind: 'user', user: auth, sessionTokenHash: 'sessao-atual' },
                disconnect: disconnectKept
            },
            {
                data: {
                    kind: 'user',
                    user: { ...auth, id: 7 },
                    sessionTokenHash: 'outra-sessao'
                },
                disconnect: disconnectOtherUser
            }
        ];

        setRealtimeServer({
            fetchSockets: async () => sockets
        } as unknown as RealtimeServer);

        const disconnected = await disconnectUserSessions(42, 'sessao-atual');

        expect(disconnected).toBe(1);
        expect(disconnectOther).toHaveBeenCalledWith(true);
        expect(disconnectKept).not.toHaveBeenCalled();
        expect(disconnectOtherUser).not.toHaveBeenCalled();
    });

    it('monta nomes de sala sem colisão com salas de serviço', () => {
        expect(userRoom(42)).toBe('user-42');
        expect(sheetRoom(7)).toBe('sheet-7');
        expect(publicSheetRoom(7)).toBe('public-sheet-7');
    });
});

describe('autenticação de serviço', () => {
    it('compara tokens em tempo constante', () => {
        const token = 'a'.repeat(48);

        expect(compareServiceToken(token, token)).toBe(true);
        expect(compareServiceToken(token, 'b'.repeat(48))).toBe(false);
        expect(compareServiceToken(token, 'curto')).toBe(false);
        expect(compareServiceToken(null, token)).toBe(false);
    });

    it('aceita apenas salas de serviço conhecidas e sem duplicatas', () => {
        expect(readServiceRooms(undefined)).toEqual([REALTIME_SERVICE_ROOMS.sheets]);
        expect(
            readServiceRooms([
                REALTIME_SERVICE_ROOMS.sheets,
                REALTIME_SERVICE_ROOMS.users,
                REALTIME_SERVICE_ROOMS.sheets
            ])
        ).toEqual([REALTIME_SERVICE_ROOMS.sheets, REALTIME_SERVICE_ROOMS.users]);
        expect(readServiceRooms(['user-42', 'service:desconhecida'])).toEqual([]);
    });
});

describe('cookie do handshake', () => {
    it('extrai o valor do cookie de sessão', () => {
        expect(readCookieValue('tema=escuro; kami_sessao=abc123; outro=1', 'kami_sessao')).toBe('abc123');
        expect(readCookieValue('kami_sessao=abc%20123', 'kami_sessao')).toBe('abc 123');
    });

    it('devolve nulo quando o cookie não existe ou está vazio', () => {
        expect(readCookieValue(undefined, 'kami_sessao')).toBeNull();
        expect(readCookieValue('tema=escuro', 'kami_sessao')).toBeNull();
        expect(readCookieValue('kami_sessao=', 'kami_sessao')).toBeNull();
    });
});

describe('origem do socket do usuário', () => {
    it('aceita o host direto e o encaminhado pelo proxy', () => {
        expect(
            isAllowedSocketOrigin({
                origin: 'https://kamiapp.com.br',
                host: 'kamiapp.com.br'
            })
        ).toBe(true);
        expect(
            isAllowedSocketOrigin({
                origin: 'https://kamiapp.com.br',
                host: '127.0.0.1:3000',
                'x-forwarded-host': 'kamiapp.com.br'
            })
        ).toBe(true);
    });

    it('recusa origem diferente ou ausente', () => {
        expect(isAllowedSocketOrigin({ origin: 'https://outro.example', host: 'kamiapp.com.br' })).toBe(false);
        expect(isAllowedSocketOrigin({ host: 'kamiapp.com.br' })).toBe(false);
    });

    it('prioriza os headers de IP e ignora valores inválidos', () => {
        expect(
            getSocketIp(
                {
                    'cf-connecting-ip': '203.0.113.10',
                    'x-forwarded-for': '198.51.100.2',
                    'x-real-ip': '198.51.100.1'
                },
                '127.0.0.1'
            )
        ).toBe('203.0.113.10');
        expect(getSocketIp({ 'x-forwarded-for': '198.51.100.2, 10.0.0.1' }, '127.0.0.1')).toBe('198.51.100.2');
        expect(getSocketIp({ 'cf-connecting-ip': 'invalido' }, '127.0.0.1')).toBe('127.0.0.1');
        expect(getSocketIp({}, null)).toBe('unknown');
    });
});
