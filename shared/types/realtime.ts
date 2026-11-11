import type { AuthUser } from './auth';
import type { RealtimeServiceRoom } from '../constants/realtime';

export type SheetRealtimeEventType =
    'sheet.created' | 'sheet.updated' | 'sheet.deleted' | 'sheet.unpublished' | 'sheet.access_changed';

/**
 * Minimal payload for every sheet event. Consumers must fetch the canonical
 * sheet state from the database/API when they need the content.
 */
export interface SheetDeletedIrtMessage {
    channelId: string;
    messageId: string;
}

export interface SheetRealtimeEvent {
    id: string;
    type: SheetRealtimeEventType;
    occurredAt: string;
    resource: 'sheet';
    resourceId: number;
    userId: number;
    version: string;
    name?: string;
    /**
     * Presente em `sheet.deleted`: vínculos IRT que existiam antes de a ficha
     * ser apagada. O bot usa esses ids para remover o botão das mensagens.
     */
    irtSheets?: SheetDeletedIrtMessage[];
}

export interface SheetSubscribePayload {
    sheetId: number;
}

export interface SheetSubscribeResponse {
    ok: boolean;
    code?: 'invalid_sheet' | 'sheet_not_found' | 'sheet_password_required' | 'too_many_subscriptions';
}

export interface UserLinkedRealtimeEvent {
    id: string;
    type: 'user.linked';
    occurredAt: string;
    resource: 'user';
    resourceId: number;
    discordId: string;
    discordUsername: string | null;
}

export interface UserMergedRealtimeEvent {
    id: string;
    type: 'user.merged';
    occurredAt: string;
    resource: 'user';
    resourceId: number;
    fromUserId: number;
    toUserId: number;
    discordId: string;
}

/** Events emitted by the server to site users and service consumers. */
export interface ServerToClientEvents {
    'sheet.created': (event: SheetRealtimeEvent) => void;
    'sheet.updated': (event: SheetRealtimeEvent) => void;
    'sheet.deleted': (event: SheetRealtimeEvent) => void;
    'sheet.unpublished': (event: SheetRealtimeEvent) => void;
    'sheet.access_changed': (event: SheetRealtimeEvent) => void;
    'user.linked': (event: UserLinkedRealtimeEvent) => void;
    'user.merged': (event: UserMergedRealtimeEvent) => void;
}

/** Events accepted from browser clients. */
export interface ClientToServerEvents {
    'sheet.subscribe': (payload: SheetSubscribePayload, callback: (response: SheetSubscribeResponse) => void) => void;
    'sheet.unsubscribe': (payload: SheetSubscribePayload) => void;
    'public-sheet.subscribe': (
        payload: SheetSubscribePayload,
        callback: (response: SheetSubscribeResponse) => void
    ) => void;
    'public-sheet.unsubscribe': (payload: SheetSubscribePayload) => void;
}

export interface InterServerEvents {}

export interface RealtimeSocketData {
    kind: 'user' | 'public' | 'service';
    user?: AuthUser;
    rooms?: RealtimeServiceRoom[];
    /** Hash da sessão usada no handshake, para revalidar e revogar o socket. */
    sessionTokenHash?: string;
}
