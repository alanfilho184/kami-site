import type { NitroApp } from 'nitropack';
import { defineEventHandler } from 'h3';
import { Server as Engine } from 'engine.io';
import { Server, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/postgres-adapter';
import { REALTIME_CLIENT_EVENTS, REALTIME_PATH, REALTIME_SERVICE_HEADER } from '~~/shared/constants/realtime';
import type {
    ClientToServerEvents,
    InterServerEvents,
    RealtimeSocketData,
    ServerToClientEvents
} from '~~/shared/types/realtime';
import { publicSheetRoom, sheetRoom, userRoom } from '~~/shared/utils/realtime';
import { findPublicSheetAccessById } from '../services/public-sheet.service';
import { SESSION_COOKIE_NAME, sessionService } from '../services/session.service';
import { sheetService } from '../services/sheet.service';
import { setRealtimeServer, type RealtimeServer } from '../services/realtime.service';
import { getConfig } from '../utils/config';
import { getDatabasePool } from '../utils/database';
import { logger } from '../logs';
import { compareServiceToken, readServiceRooms } from '../utils/service-auth';
import { sheetAccessCookieName, verifySheetAccessToken } from '../utils/sheet-access';
import { readCookieValue } from '../utils/socket-cookie';
import { getSocketIp, isAllowedSocketOrigin } from '../utils/socket-origin';
import { createRateLimiter } from '../utils/rate-limit';

const MAX_BUFFER_BYTES = 1024 * 1024;
const PING_INTERVAL_MS = 25_000;
const PING_TIMEOUT_MS = 20_000;
const SOCKET_CONNECTION_LIMIT = 120;
const SOCKET_CONNECTION_WINDOW_MS = 60_000;
const SESSION_CHECK_INTERVAL_MS = 60_000;
const socketConnectionLimiter = createRateLimiter({
    limit: SOCKET_CONNECTION_LIMIT,
    windowMs: SOCKET_CONNECTION_WINDOW_MS
});

type RealtimeSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, RealtimeSocketData>;

function socketAuthMethod(socket: RealtimeSocket): 'service_token' | 'session' | 'anonymous' {
    const data = socket.data as RealtimeSocketData;

    if (data.kind === 'service') {
        return 'service_token';
    }

    if (data.kind === 'user') {
        return 'session';
    }

    return 'anonymous';
}

function socketUserId(socket: RealtimeSocket): number | null {
    const data = socket.data as RealtimeSocketData;
    return data.kind === 'user' ? (data.user?.id ?? null) : null;
}

function socketIp(socket: RealtimeSocket): string | null {
    const ip = getSocketIp(socket.handshake.headers, socket.handshake.address || null);
    return ip === 'unknown' ? null : ip;
}

export default defineNitroPlugin((nitroApp: NitroApp) => {
    const engine = new Engine({
        path: REALTIME_PATH,
        transports: ['websocket'],
        allowUpgrades: false,
        pingInterval: PING_INTERVAL_MS,
        pingTimeout: PING_TIMEOUT_MS,
        maxHttpBufferSize: MAX_BUFFER_BYTES
    });
    const io: RealtimeServer = new Server({
        serveClient: false,
        maxHttpBufferSize: MAX_BUFFER_BYTES
    });

    io.bind(engine);
    io.adapter(createAdapter(getDatabasePool()));
    setRealtimeServer(io);

    io.use(async (socket, next) => {
        const serviceHeader = socket.handshake.headers[REALTIME_SERVICE_HEADER];
        const serviceToken = Array.isArray(serviceHeader) ? serviceHeader[0] : serviceHeader;

        if (serviceToken) {
            if (!compareServiceToken(getConfig().botSyncToken, serviceToken)) {
                logger.logWsCallback({
                    event: 'realtime.socket.rejected',
                    action: 'connect',
                    ok: false,
                    code: 'unauthorized',
                    auth_method: 'service_token',
                    socket_id: socket.id,
                    ip: socketIp(socket)
                });
                next(new Error('unauthorized'));
                return;
            }

            const rooms = readServiceRooms(socket.handshake.auth?.rooms);

            if (rooms.length === 0) {
                logger.logWsCallback({
                    event: 'realtime.socket.rejected',
                    action: 'connect',
                    ok: false,
                    code: 'no_service_rooms',
                    auth_method: 'service_token',
                    socket_id: socket.id,
                    ip: socketIp(socket),
                    data: { rooms: socket.handshake.auth?.rooms }
                });
                next(new Error('no_service_rooms'));
                return;
            }

            socket.data.kind = 'service';
            socket.data.rooms = rooms;
            next();
            return;
        }

        if (!isAllowedSocketOrigin(socket.handshake.headers)) {
            logger.logWsCallback({
                event: 'realtime.socket.rejected',
                action: 'connect',
                ok: false,
                code: 'forbidden_origin',
                auth_method: 'anonymous',
                socket_id: socket.id,
                ip: socketIp(socket)
            });
            next(new Error('forbidden_origin'));
            return;
        }

        const ip = getSocketIp(socket.handshake.headers, socket.handshake.address || null);

        if (!socketConnectionLimiter.consume(ip).allowed) {
            logger.logWsCallback({
                event: 'realtime.socket.rejected',
                action: 'connect',
                ok: false,
                code: 'rate_limited',
                auth_method: 'anonymous',
                socket_id: socket.id,
                ip: ip === 'unknown' ? null : ip
            });
            next(new Error('rate_limited'));
            return;
        }

        const token = readCookieValue(socket.handshake.headers.cookie, SESSION_COOKIE_NAME);

        if (!token) {
            socket.data.kind = 'public';
            next();
            return;
        }

        try {
            const session = await sessionService.find(token);

            if (!session) {
                socket.data.kind = 'public';
                next();
                return;
            }

            socket.data.kind = 'user';
            socket.data.user = session.user;
            socket.data.sessionTokenHash = session.tokenHash;
            next();
        } catch (error) {
            logger.error('Falha ao autenticar socket do site', { event: 'realtime.socket.auth_failed', error });
            logger.logWsCallback({
                event: 'realtime.socket.rejected',
                action: 'connect',
                ok: false,
                code: 'unavailable',
                auth_method: 'session',
                socket_id: socket.id,
                ip: socketIp(socket)
            });
            next(new Error('unavailable'));
        }
    });

    async function revalidateUserSessions(): Promise<void> {
        const sockets = [...io.sockets.sockets.values()];

        await Promise.all(
            sockets.map(async socket => {
                const data = socket.data;

                if (data.kind !== 'user' || !data.sessionTokenHash) {
                    return;
                }

                try {
                    const active = await sessionService.isActive(data.sessionTokenHash);

                    if (!active) {
                        socket.disconnect(true);
                    }
                } catch (error) {
                    logger.warn('Falha ao revalidar sessão do socket', {
                        event: 'realtime.session.revalidation_failed',
                        error,
                        user_id: data.user?.id
                    });
                }
            })
        );
    }

    function registerPublicSheetHandlers(socket: RealtimeSocket): void {
        const subscriptions = new Set<number>();

        socket.on(REALTIME_CLIENT_EVENTS.subscribePublicSheet, async (payload, callback) => {
            const sheetId = Number(payload?.sheetId);
            const userId = socketUserId(socket);
            let authMethod = socketAuthMethod(socket);

            if (!Number.isInteger(sheetId) || sheetId <= 0) {
                logger.logWsCallback({
                    event: 'realtime.sheet.subscription.denied',
                    action: 'subscribe',
                    ok: false,
                    code: 'invalid_sheet',
                    socket_id: socket.id,
                    sheet_id: null,
                    user_id: userId,
                    auth_method: authMethod,
                    data: payload
                });
                callback?.({ ok: false, code: 'invalid_sheet' });
                return;
            }

            if (!subscriptions.has(sheetId) && subscriptions.size >= 10) {
                logger.logWsCallback({
                    event: 'realtime.sheet.subscription.denied',
                    action: 'subscribe',
                    ok: false,
                    code: 'too_many_subscriptions',
                    socket_id: socket.id,
                    room: publicSheetRoom(sheetId),
                    sheet_id: sheetId,
                    user_id: userId,
                    auth_method: authMethod,
                    data: payload
                });
                callback?.({ ok: false, code: 'too_many_subscriptions' });
                return;
            }

            try {
                const sheet = await findPublicSheetAccessById(sheetId);

                if (!sheet) {
                    logger.logWsCallback({
                        event: 'realtime.sheet.subscription.denied',
                        action: 'subscribe',
                        ok: false,
                        code: 'sheet_not_found',
                        socket_id: socket.id,
                        room: publicSheetRoom(sheetId),
                        sheet_id: sheetId,
                        user_id: userId,
                        auth_method: authMethod,
                        data: payload
                    });
                    callback?.({ ok: false, code: 'sheet_not_found' });
                    return;
                }

                if (sheet.sheet_password) {
                    const token = readCookieValue(socket.handshake.headers.cookie, sheetAccessCookieName(sheetId));

                    if (!token || !verifySheetAccessToken(token, sheetId, Date.now(), sheet.sheet_password)) {
                        logger.logWsCallback({
                            event: 'realtime.sheet.subscription.denied',
                            action: 'subscribe',
                            ok: false,
                            code: 'sheet_password_required',
                            socket_id: socket.id,
                            room: publicSheetRoom(sheetId),
                            sheet_id: sheetId,
                            user_id: userId,
                            auth_method: 'sheet_cookie',
                            data: payload
                        });
                        callback?.({ ok: false, code: 'sheet_password_required' });
                        return;
                    }

                    authMethod = 'sheet_cookie';
                }

                await socket.join(publicSheetRoom(sheetId));
                subscriptions.add(sheetId);
                logger.logWs({
                    event: 'realtime.sheet.subscribed',
                    action: 'subscribe',
                    socket_id: socket.id,
                    room: publicSheetRoom(sheetId),
                    sheet_id: sheetId,
                    user_id: userId,
                    auth_method: authMethod,
                    data: payload
                });
                callback?.({ ok: true });
            } catch (error) {
                logger.warn('Falha ao assinar ficha pública no Socket.IO', {
                    event: 'realtime.sheet.subscribe_failed',
                    error,
                    sheet_id: sheetId
                });
                logger.logWsCallback({
                    event: 'realtime.sheet.subscription.denied',
                    action: 'subscribe',
                    ok: false,
                    code: 'sheet_not_found',
                    socket_id: socket.id,
                    room: publicSheetRoom(sheetId),
                    sheet_id: sheetId,
                    user_id: userId,
                    auth_method: authMethod,
                    error_name: error instanceof Error ? error.name : undefined,
                    data: payload
                });
                callback?.({ ok: false, code: 'sheet_not_found' });
            }
        });

        socket.on(REALTIME_CLIENT_EVENTS.unsubscribePublicSheet, payload => {
            const sheetId = Number(payload?.sheetId);

            if (Number.isInteger(sheetId) && sheetId > 0) {
                subscriptions.delete(sheetId);
                void socket.leave(publicSheetRoom(sheetId));
                logger.logWs({
                    event: 'realtime.sheet.unsubscribed',
                    action: 'unsubscribe',
                    socket_id: socket.id,
                    room: publicSheetRoom(sheetId),
                    sheet_id: sheetId,
                    user_id: socketUserId(socket),
                    auth_method: socketAuthMethod(socket),
                    data: payload
                });
            }
        });
    }

    io.on('connection', socket => {
        const data = socket.data as RealtimeSocketData;

        if (data.kind === 'service') {
            const rooms = data.rooms ?? [];

            for (const room of rooms) {
                void socket.join(room);
            }

            logger.logWs({
                event: 'realtime.socket.connected',
                action: 'connect',
                auth_method: 'service_token',
                socket_id: socket.id,
                room: rooms.join(','),
                ip: socketIp(socket),
                data: { rooms }
            });
            logger.debug('Serviço conectado ao Socket.IO', { rooms });

            socket.on('disconnect', reason => {
                logger.logWs({
                    event: 'realtime.socket.disconnected',
                    action: 'disconnect',
                    auth_method: 'service_token',
                    socket_id: socket.id,
                    room: rooms.join(','),
                    ip: socketIp(socket),
                    data: { reason, rooms }
                });
            });
            return;
        }

        if (data.kind === 'public') {
            logger.logWs({
                event: 'realtime.socket.connected',
                action: 'connect',
                auth_method: 'anonymous',
                socket_id: socket.id,
                ip: socketIp(socket),
                data: { kind: 'public' }
            });
            socket.on('disconnect', reason => {
                logger.logWs({
                    event: 'realtime.socket.disconnected',
                    action: 'disconnect',
                    auth_method: 'anonymous',
                    socket_id: socket.id,
                    ip: socketIp(socket),
                    data: { reason }
                });
            });
            registerPublicSheetHandlers(socket);
            return;
        }

        const user = data.user;

        if (!user) {
            socket.disconnect(true);
            return;
        }

        void socket.join(userRoom(user.id));
        logger.logWs({
            event: 'realtime.socket.connected',
            action: 'connect',
            auth_method: 'session',
            socket_id: socket.id,
            room: userRoom(user.id),
            user_id: user.id,
            ip: socketIp(socket)
        });
        registerPublicSheetHandlers(socket);

        socket.on('disconnect', reason => {
            logger.logWs({
                event: 'realtime.socket.disconnected',
                action: 'disconnect',
                auth_method: 'session',
                socket_id: socket.id,
                room: userRoom(user.id),
                user_id: user.id,
                ip: socketIp(socket),
                data: { reason }
            });
        });

        socket.on(REALTIME_CLIENT_EVENTS.subscribeSheet, async (payload, callback) => {
            const sheetId = Number(payload?.sheetId);

            if (!Number.isInteger(sheetId) || sheetId <= 0) {
                logger.logWsCallback({
                    event: 'realtime.sheet.subscription.denied',
                    action: 'subscribe',
                    ok: false,
                    code: 'invalid_sheet',
                    socket_id: socket.id,
                    sheet_id: null,
                    user_id: user.id,
                    auth_method: 'session',
                    data: payload
                });
                callback?.({ ok: false, code: 'invalid_sheet' });
                return;
            }

            try {
                await sheetService.getSheet(user.id, sheetId);
                await socket.join(sheetRoom(sheetId));
                logger.logWs({
                    event: 'realtime.sheet.subscribed',
                    action: 'subscribe',
                    socket_id: socket.id,
                    room: sheetRoom(sheetId),
                    sheet_id: sheetId,
                    user_id: user.id,
                    auth_method: 'session',
                    data: payload
                });
                callback?.({ ok: true });
            } catch (error) {
                logger.logWsCallback({
                    event: 'realtime.sheet.subscription.denied',
                    action: 'subscribe',
                    ok: false,
                    code: 'sheet_not_found',
                    socket_id: socket.id,
                    room: sheetRoom(sheetId),
                    sheet_id: sheetId,
                    user_id: user.id,
                    auth_method: 'session',
                    error_name: error instanceof Error ? error.name : undefined,
                    data: payload
                });
                callback?.({ ok: false, code: 'sheet_not_found' });
            }
        });

        socket.on(REALTIME_CLIENT_EVENTS.unsubscribeSheet, payload => {
            const sheetId = Number(payload?.sheetId);

            if (Number.isInteger(sheetId) && sheetId > 0) {
                void socket.leave(sheetRoom(sheetId));
                logger.logWs({
                    event: 'realtime.sheet.unsubscribed',
                    action: 'unsubscribe',
                    socket_id: socket.id,
                    room: sheetRoom(sheetId),
                    sheet_id: sheetId,
                    user_id: user.id,
                    auth_method: 'session',
                    data: payload
                });
            }
        });
    });

    nitroApp.router.use(
        `${REALTIME_PATH}/`,
        defineEventHandler({
            handler(event) {
                engine.handleRequest(event.node.req, event.node.res);
                event._handled = true;
            },
            websocket: {
                open(peer) {
                    // @ts-expect-error private method and property do not exist in the public types
                    engine.prepare(peer._internal.nodeReq);
                    // @ts-expect-error private method and property do not exist in the public types
                    engine.onWebSocket(peer._internal.nodeReq, peer._internal.nodeReq.socket, peer.websocket);
                }
            }
        })
    );

    const sessionCheckTimer = setInterval(() => {
        void revalidateUserSessions();
    }, SESSION_CHECK_INTERVAL_MS);

    sessionCheckTimer.unref?.();

    nitroApp.hooks.hook('close', () => {
        clearInterval(sessionCheckTimer);
    });

    logger.info('Socket.IO configurado', { event: 'realtime.server.started', path: REALTIME_PATH });
});
