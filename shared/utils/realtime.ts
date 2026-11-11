import {
    REALTIME_PUBLIC_SHEET_ROOM_PREFIX,
    REALTIME_SERVICE_ROOM_LIST,
    REALTIME_SHEET_ROOM_PREFIX,
    REALTIME_USER_ROOM_PREFIX,
    type RealtimeServiceRoom
} from '../constants/realtime';

export function userRoom(userId: number): string {
    return `${REALTIME_USER_ROOM_PREFIX}${userId}`;
}

export function sheetRoom(sheetId: number): string {
    return `${REALTIME_SHEET_ROOM_PREFIX}${sheetId}`;
}

export function publicSheetRoom(sheetId: number): string {
    return `${REALTIME_PUBLIC_SHEET_ROOM_PREFIX}${sheetId}`;
}

export function isServiceRoom(value: string): value is RealtimeServiceRoom {
    return (REALTIME_SERVICE_ROOM_LIST as readonly string[]).includes(value);
}
