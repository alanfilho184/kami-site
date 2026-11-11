/** Path used by the Socket.IO server and clients. */
export const REALTIME_PATH = '/socket.io';

/** Prefix for the personal room of a site user. */
export const REALTIME_USER_ROOM_PREFIX = 'user-';

/** Prefix for the room of an open sheet. */
export const REALTIME_SHEET_ROOM_PREFIX = 'sheet-';

/** Prefix for the read-only room of a public sheet. */
export const REALTIME_PUBLIC_SHEET_ROOM_PREFIX = 'public-sheet-';

/** Rooms consumed by trusted services such as the Discord bot. */
export const REALTIME_SERVICE_ROOMS = {
    sheets: 'service:sheets',
    users: 'service:users'
} as const;

export type RealtimeServiceRoom = (typeof REALTIME_SERVICE_ROOMS)[keyof typeof REALTIME_SERVICE_ROOMS];

export const REALTIME_SERVICE_ROOM_LIST: readonly RealtimeServiceRoom[] = Object.values(REALTIME_SERVICE_ROOMS);

/** Event names shared by the server, the site client and service consumers. */
export const REALTIME_EVENTS = {
    sheetCreated: 'sheet.created',
    sheetUpdated: 'sheet.updated',
    sheetDeleted: 'sheet.deleted',
    sheetUnpublished: 'sheet.unpublished',
    sheetAccessChanged: 'sheet.access_changed',
    userLinked: 'user.linked',
    userMerged: 'user.merged'
} as const;

/** Client-to-server events. */
export const REALTIME_CLIENT_EVENTS = {
    subscribeSheet: 'sheet.subscribe',
    unsubscribeSheet: 'sheet.unsubscribe',
    subscribePublicSheet: 'public-sheet.subscribe',
    unsubscribePublicSheet: 'public-sheet.unsubscribe'
} as const;

/** Header used by trusted services during the Socket.IO handshake. */
export const REALTIME_SERVICE_HEADER = 'x-kami-service-token';
