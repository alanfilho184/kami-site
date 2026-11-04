import type { H3Event } from 'h3';
import { z } from 'zod';
import { findPublicSheet, sheetRequiresPassword, verifySheetPassword } from '../../../../services/public-sheet.service';
import { logger } from '../../../../utils/logger';
import { consumeSheetAccess } from '../../../../utils/rate-limit';
import { readLimitedJsonBody, RequestBodyTooLargeError } from '../../../../utils/request-body';
import { getClientIp } from '../../../../utils/request-metadata';
import { assertSameOrigin } from '../../../../utils/request-origin';
import { setSheetAccessCookie } from '../../../../utils/sheet-access';

const accessSchema = z.object({
    password: z.string().min(1).max(128)
});

interface AccessErrorResponse {
    message: string;
    code?: 'invalid_password' | 'sheet_not_found' | 'sheet_password_required';
    retryAfterSeconds?: number;
}

function readSheetName(event: H3Event): string {
    const raw = getRouterParam(event, 'sheetName') ?? '';

    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

export default defineEventHandler(async (event: H3Event): Promise<void | AccessErrorResponse> => {
    assertSameOrigin(event);
    setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
    setHeader(event, 'Cache-Control', 'private, no-store');

    const userId = Number(getRouterParam(event, 'userId'));
    const sheetName = readSheetName(event);

    if (!Number.isInteger(userId) || userId <= 0 || !sheetName) {
        setResponseStatus(event, 404);
        return { message: 'Ficha não encontrada.', code: 'sheet_not_found' };
    }

    let body: unknown = null;

    try {
        body = await readLimitedJsonBody(event);
    } catch (error) {
        if (error instanceof RequestBodyTooLargeError) {
            setResponseStatus(event, 413);
            return { message: 'Requisição grande demais.' };
        }

        body = null;
    }

    const parsed = accessSchema.safeParse(body);

    if (!parsed.success) {
        setResponseStatus(event, 400);
        return { message: 'Informe a senha da ficha.' };
    }

    try {
        const row = await findPublicSheet(userId, sheetName);

        if (!row) {
            setResponseStatus(event, 404);
            return { message: 'Ficha não encontrada.', code: 'sheet_not_found' };
        }

        if (!sheetRequiresPassword(row)) {
            setResponseStatus(event, 204);
            return;
        }

        const limit = consumeSheetAccess(getClientIp(event), row.id);

        if (!limit.allowed) {
            setHeader(event, 'Retry-After', limit.retryAfterSeconds);
            setResponseStatus(event, 429);
            return {
                message: 'Muitas tentativas. Tente novamente mais tarde.',
                retryAfterSeconds: limit.retryAfterSeconds
            };
        }

        const valid = await verifySheetPassword(row.sheet_password, parsed.data.password);

        if (!valid) {
            logger.warn('Senha de ficha pública recusada', { sheet_id: row.id });
            setResponseStatus(event, 403);
            return { message: 'Senha incorreta.', code: 'invalid_password' };
        }

        setSheetAccessCookie(event, row.id);
        logger.info('Acesso a ficha pública liberado', { sheet_id: row.id });
        setResponseStatus(event, 204);
    } catch (error) {
        logger.error('Falha ao liberar acesso à ficha pública', { error, user_id: userId });
        setResponseStatus(event, 503);
        return { message: 'Ficha indisponível. Tente novamente em instantes.' };
    }
});
