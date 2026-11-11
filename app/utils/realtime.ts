import { io, type Socket } from 'socket.io-client';
import { readonly, ref } from 'vue';
import { REALTIME_PATH } from '~~/shared/constants/realtime';
import type { ClientToServerEvents, ServerToClientEvents, SheetSubscribeResponse } from '~~/shared/types/realtime';

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

const SUBSCRIBE_TIMEOUT_MS = 5000;

let socket: RealtimeSocket | null = null;
let hasConnected = false;
const status = ref<RealtimeStatus>('connecting');

export const realtimeStatus = readonly(status);

export function getRealtimeSocket(): RealtimeSocket | null {
    return socket;
}

export function isRealtimeConnected(): boolean {
    return Boolean(socket?.connected);
}

export function connectRealtime(): RealtimeSocket | null {
    if (!import.meta.client) {
        return null;
    }

    if (socket) {
        if (!socket.connected) {
            status.value = hasConnected ? 'reconnecting' : 'connecting';
            socket.connect();
        } else {
            status.value = 'connected';
        }

        return socket;
    }

    status.value = 'connecting';
    socket = io({
        path: REALTIME_PATH,
        transports: ['websocket'],
        withCredentials: true,
        autoConnect: false,
        reconnection: true
    });

    socket.on('connect', () => {
        hasConnected = true;
        status.value = 'connected';
    });
    socket.on('disconnect', reason => {
        status.value =
            reason === 'io client disconnect' || reason === 'io server disconnect' ? 'offline' : 'reconnecting';
    });
    socket.on('connect_error', () => {
        status.value = hasConnected ? 'reconnecting' : 'offline';
    });
    socket.io.on('reconnect_attempt', () => {
        status.value = 'reconnecting';
    });
    socket.io.on('reconnect_failed', () => {
        status.value = 'offline';
    });

    socket.connect();

    return socket;
}

export function subscribeSheet(sheetId: number): Promise<boolean> {
    const current = socket;

    if (!current?.connected) {
        return Promise.resolve(false);
    }

    return new Promise(resolve => {
        const timer = setTimeout(() => resolve(false), SUBSCRIBE_TIMEOUT_MS);

        current.emit('sheet.subscribe', { sheetId }, response => {
            clearTimeout(timer);
            resolve(Boolean(response?.ok));
        });
    });
}

export function unsubscribeSheet(sheetId: number): void {
    if (socket?.connected) {
        socket.emit('sheet.unsubscribe', { sheetId });
    }
}

export function subscribePublicSheet(sheetId: number): Promise<SheetSubscribeResponse | null> {
    const current = socket;

    if (!current?.connected) {
        return Promise.resolve(null);
    }

    return new Promise(resolve => {
        const timer = setTimeout(() => resolve(null), SUBSCRIBE_TIMEOUT_MS);

        current.emit('public-sheet.subscribe', { sheetId }, response => {
            clearTimeout(timer);
            resolve(response ?? null);
        });
    });
}

export function unsubscribePublicSheet(sheetId: number): void {
    if (socket?.connected) {
        socket.emit('public-sheet.unsubscribe', { sheetId });
    }
}

export function disconnectRealtime(): void {
    socket?.disconnect();
    socket = null;
    hasConnected = false;
    status.value = 'offline';
}
