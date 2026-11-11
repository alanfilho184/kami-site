import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import { REALTIME_SERVICE_ROOMS } from '~~/shared/constants/realtime';
import type {
    ClientToServerEvents,
    InterServerEvents,
    RealtimeSocketData,
    ServerToClientEvents,
    SheetDeletedIrtMessage,
    SheetRealtimeEvent,
    SheetRealtimeEventType,
    UserLinkedRealtimeEvent,
    UserMergedRealtimeEvent
} from '~~/shared/types/realtime';
import type { SheetDetail } from '~~/shared/types/sheet';
import { publicSheetRoom, sheetRoom, userRoom } from '~~/shared/utils/realtime';
import { logger } from '../logs';

export type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, RealtimeSocketData>;

type SheetRealtimeSource = Pick<SheetDetail, 'id' | 'userId' | 'version'> & {
    name?: string;
    isPublic?: boolean;
    irtSheets?: SheetDeletedIrtMessage[];
};

interface RealtimeEventOptions {
    id?: string;
    now?: Date;
}

let realtimeServer: RealtimeServer | null = null;

export function setRealtimeServer(server: RealtimeServer | null): void {
    realtimeServer = server;
}

export function hasRealtimeServer(): boolean {
    return realtimeServer !== null;
}

export async function closeRealtimeServer(): Promise<void> {
    const server = realtimeServer;
    realtimeServer = null;

    if (!server) {
        return;
    }

    try {
        await server.close();
    } catch (error) {
        logger.warn('Falha ao encerrar o Socket.IO', { event: 'realtime.shutdown.failed', error });
    }
}

export function buildSheetRealtimeEvent(
    type: SheetRealtimeEventType,
    sheet: SheetRealtimeSource,
    options: RealtimeEventOptions = {}
): SheetRealtimeEvent {
    return {
        id: options.id ?? randomUUID(),
        type,
        occurredAt: (options.now ?? new Date()).toISOString(),
        resource: 'sheet',
        resourceId: sheet.id,
        userId: sheet.userId,
        version: sheet.version,
        name: sheet.name,
        ...(sheet.irtSheets ? { irtSheets: sheet.irtSheets } : {})
    };
}

function emitSheetEvent(event: SheetRealtimeEvent, isPublic = false): boolean {
    const server = realtimeServer;

    if (!server) {
        return false;
    }

    try {
        let target = server
            .to(sheetRoom(event.resourceId))
            .to(userRoom(event.userId))
            .to(REALTIME_SERVICE_ROOMS.sheets);

        if (isPublic) {
            target = target.to(publicSheetRoom(event.resourceId));
        }

        target.emit(event.type, event);
        logger.logWs({
            event: event.type,
            action: 'emit',
            room: sheetRoom(event.resourceId),
            sheet_id: event.resourceId,
            user_id: event.userId,
            data: {
                ...event,
                rooms: [
                    sheetRoom(event.resourceId),
                    userRoom(event.userId),
                    REALTIME_SERVICE_ROOMS.sheets,
                    ...(isPublic ? [publicSheetRoom(event.resourceId)] : [])
                ]
            }
        });
        return true;
    } catch (error) {
        logger.warn('Falha ao emitir evento de ficha em tempo real', {
            event: 'realtime.emit.failed',
            error,
            event_id: event.id,
            event_type: event.type,
            sheet_id: event.resourceId
        });
        return false;
    }
}

export function emitSheetCreated(sheet: SheetRealtimeSource): boolean {
    return emitSheetEvent(buildSheetRealtimeEvent('sheet.created', sheet), sheet.isPublic === true);
}

export function emitSheetUpdated(sheet: SheetRealtimeSource): boolean {
    return emitSheetEvent(buildSheetRealtimeEvent('sheet.updated', sheet), sheet.isPublic === true);
}

export function emitSheetDeleted(
    sheetId: number,
    userId: number,
    version: string,
    isPublic = false,
    name?: string,
    irtSheets?: SheetDeletedIrtMessage[]
): boolean {
    return emitSheetEvent(
        buildSheetRealtimeEvent('sheet.deleted', {
            id: sheetId,
            userId,
            version,
            name,
            irtSheets
        }),
        isPublic
    );
}

export function emitSheetUnpublished(sheetId: number, userId: number, version: string, name?: string): boolean {
    const server = realtimeServer;

    if (!server) {
        return false;
    }

    const event = buildSheetRealtimeEvent('sheet.unpublished', {
        id: sheetId,
        userId,
        version,
        name
    });
    const room = publicSheetRoom(sheetId);

    try {
        // O adapter cluster publica de forma assíncrona e só então entrega aos
        // sockets locais; o emit local garante a ordem antes do socketsLeave.
        // Pela mesma assincronia o evento pode chegar duas vezes nesta
        // instância, então o cliente ignora repetições pelo `id` do evento.
        server.local.to(room).emit(event.type, event);
        server.to(room).emit(event.type, event);
        server.in(room).socketsLeave(room);
        logger.logWs({
            event: event.type,
            action: 'emit',
            room,
            sheet_id: sheetId,
            user_id: userId,
            data: event
        });
        return true;
    } catch (error) {
        logger.warn('Falha ao emitir despublicação de ficha', {
            event: 'realtime.emit.failed',
            error,
            event_id: event.id,
            sheet_id: sheetId
        });
        return false;
    }
}

export function emitSheetAccessChanged(sheetId: number, userId: number, version: string, name?: string): boolean {
    const server = realtimeServer;

    if (!server) {
        return false;
    }

    const event = buildSheetRealtimeEvent('sheet.access_changed', {
        id: sheetId,
        userId,
        version,
        name
    });
    const room = publicSheetRoom(sheetId);

    try {
        // Mesmo caso de `emitSheetUnpublished`: emissão local síncrona para
        // garantir a entrega antes do socketsLeave, com o cliente ignorando
        // repetições pelo `id` do evento.
        server.local.to(room).emit(event.type, event);
        server.to(room).emit(event.type, event);
        server.in(room).socketsLeave(room);
        logger.logWs({
            event: event.type,
            action: 'emit',
            room,
            sheet_id: sheetId,
            user_id: userId,
            data: event
        });
        return true;
    } catch (error) {
        logger.warn('Falha ao emitir mudança de acesso da ficha', {
            event: 'realtime.emit.failed',
            error,
            event_id: event.id,
            sheet_id: sheetId
        });
        return false;
    }
}

export function emitUserLinked(
    userId: number,
    discordId: string,
    discordUsername: string | null,
    options: RealtimeEventOptions = {}
): boolean {
    const server = realtimeServer;

    if (!server) {
        return false;
    }

    const event: UserLinkedRealtimeEvent = {
        id: options.id ?? randomUUID(),
        type: 'user.linked',
        occurredAt: (options.now ?? new Date()).toISOString(),
        resource: 'user',
        resourceId: userId,
        discordId,
        discordUsername
    };

    try {
        server.to(userRoom(userId)).to(REALTIME_SERVICE_ROOMS.users).emit(event.type, event);
        logger.logWs({
            event: event.type,
            action: 'emit',
            room: userRoom(userId),
            user_id: userId,
            data: event
        });
        return true;
    } catch (error) {
        logger.warn('Falha ao emitir vínculo de usuário em tempo real', {
            event: 'realtime.emit.failed',
            error,
            event_id: event.id,
            user_id: userId
        });
        return false;
    }
}

export function emitUserMerged(
    fromUserId: number,
    toUserId: number,
    discordId: string,
    options: RealtimeEventOptions = {}
): boolean {
    const server = realtimeServer;

    if (!server) {
        return false;
    }

    const event: UserMergedRealtimeEvent = {
        id: options.id ?? randomUUID(),
        type: 'user.merged',
        occurredAt: (options.now ?? new Date()).toISOString(),
        resource: 'user',
        resourceId: toUserId,
        fromUserId,
        toUserId,
        discordId
    };

    try {
        server.to(REALTIME_SERVICE_ROOMS.users).emit(event.type, event);
        logger.logWs({
            event: event.type,
            action: 'emit',
            user_id: toUserId,
            from_user_id: fromUserId,
            data: event
        });
        return true;
    } catch (error) {
        logger.warn('Falha ao emitir merge de usuário em tempo real', {
            event: 'realtime.emit.failed',
            error,
            event_id: event.id,
            from_user_id: fromUserId,
            to_user_id: toUserId
        });
        return false;
    }
}

/**
 * Desconecta os sockets de outras sessões da mesma conta, mantendo o hash
 * informado (a sessão que acabou de trocar a senha). Funciona entre instâncias
 * porque usa o fetchSockets do adapter.
 */
export async function disconnectUserSessions(userId: number, keepTokenHash?: string): Promise<number> {
    const server = realtimeServer;

    if (!server) {
        return 0;
    }

    try {
        const sockets = await server.fetchSockets();
        let disconnected = 0;

        for (const socket of sockets) {
            const data = socket.data;

            if (data.kind !== 'user' || data.user?.id !== userId) {
                continue;
            }

            if (keepTokenHash && data.sessionTokenHash === keepTokenHash) {
                continue;
            }

            socket.disconnect(true);
            disconnected += 1;
        }

        return disconnected;
    } catch (error) {
        logger.warn('Falha ao desconectar sessões revogadas', {
            event: 'realtime.sessions.disconnect_failed',
            error,
            user_id: userId
        });
        return 0;
    }
}
