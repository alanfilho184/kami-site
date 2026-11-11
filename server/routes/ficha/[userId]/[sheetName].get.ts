import type { H3Event } from 'h3';
import { sheetPath, sheetUrl } from '~~/shared/utils/sheet-url';

function readSheetName(event: H3Event): string {
    const raw = getRouterParam(event, 'sheetName') ?? '';

    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

export default defineEventHandler((event: H3Event) => {
    const userId = Number(getRouterParam(event, 'userId'));
    const sheetName = readSheetName(event);
    const rawId = getQuery(event).id;
    const preferredId =
        typeof rawId === 'string' && Number.isInteger(Number(rawId)) && Number(rawId) > 0 ? Number(rawId) : undefined;

    if (!Number.isInteger(userId) || userId <= 0 || !sheetName) {
        setResponseStatus(event, 404);
        return { message: 'Ficha não encontrada.' };
    }

    const target = preferredId ? sheetUrl(userId, sheetName, preferredId) : sheetPath(userId, sheetName);

    return sendRedirect(event, target, 302);
});
