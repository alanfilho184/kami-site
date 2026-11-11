import type { H3Event } from 'h3';
import { sheetService } from '../../services/sheet.service';
import { getAuthUser } from '../../utils/auth-context';
import { logger } from '../../logs';
import { sheetUrl } from '~~/shared/utils/sheet-url';

export default defineEventHandler(async (event: H3Event) => {
    const user = getAuthUser(event);

    if (!user) {
        return sendRedirect(event, `/entrar?redirecionar=${encodeURIComponent(event.path)}`, 302);
    }

    const sheetId = Number(getRouterParam(event, 'id'));

    if (!Number.isInteger(sheetId) || sheetId <= 0) {
        setResponseStatus(event, 404);
        return { message: 'Ficha não encontrada.' };
    }

    try {
        const sheet = await sheetService.getSheet(user.id, sheetId);

        return sendRedirect(event, sheetUrl(sheet.userId, sheet.name, sheet.id), 302);
    } catch (error) {
        logger.warn('Redirecionamento de ficha antiga não encontrou a ficha', {
            event: 'sheet.redirect_not_found',
            error,
            sheet_id: sheetId
        });
        setResponseStatus(event, 404);
        return { message: 'Ficha não encontrada.' };
    }
});
