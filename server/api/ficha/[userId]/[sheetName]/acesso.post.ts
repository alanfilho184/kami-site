import type { H3Event } from 'h3';
import { z } from 'zod';
import { findPublicSheet, sheetRequiresPassword, verifySheetPassword } from '../../../../services/public-sheet.service';
import { logger } from '../../../../logs';
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

function readPreferredId(event: H3Event): number | null {
    const raw = getQuery(event).id;

    if (typeof raw !== 'string' || raw.length === 0) {
        return null;
    }

    const id = Number(raw);

    return Number.isInteger(id) && id > 0 ? id : null;
}

export default defineEventHandler(async (event: H3Event): Promise<void | AccessErrorResponse> => {
    assertSameOrigin(event);
    setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
    setHeader(event, 'Cache-Control', 'private, no-store');

    const log = logger.forRequest(event);
    const userId = Number(getRouterParam(event, 'userId'));
    const sheetName = readSheetName(event);
    const preferredId = readPreferredId(event);

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
        const row = await findPublicSheet(userId, sheetName, preferredId);

        if (!row) {
            log.warn('Ficha pública não encontrada no acesso', {
                event: 'sheet.public.access.denied',
                error_code: 'sheet_not_found',
                auth_method: 'anonymous',
                sheet_owner_id: userId
            });
            setResponseStatus(event, 404);
            return { message: 'Ficha não encontrada.', code: 'sheet_not_found' };
        }

        if (!sheetRequiresPassword(row)) {
            log.info('Acesso a ficha pública liberado', {
                event: 'sheet.public.access.granted',
                auth_method: 'anonymous',
                has_password: false,
                sheet_owner_id: userId,
                sheet_id: row.id
            });
            setResponseStatus(event, 204);
            return;
        }

        const limit = consumeSheetAccess(getClientIp(event), row.id);

        if (!limit.allowed) {
            log.warn('Acesso a ficha pública limitado', {
                event: 'sheet.public.access.denied',
                error_code: 'rate_limited',
                auth_method: 'password',
                has_password: true,
                sheet_owner_id: userId,
                sheet_id: row.id
            });
            setHeader(event, 'Retry-After', limit.retryAfterSeconds);
            setResponseStatus(event, 429);
            return {
                message: 'Muitas tentativas. Tente novamente mais tarde.',
                retryAfterSeconds: limit.retryAfterSeconds
            };
        }

        const valid = await verifySheetPassword(row.sheet_password, parsed.data.password);

        if (!valid) {
            log.warn('Senha de ficha pública recusada', {
                event: 'sheet.public.access.denied',
                error_code: 'invalid_password',
                auth_method: 'password',
                has_password: true,
                sheet_owner_id: userId,
                sheet_id: row.id
            });
            setResponseStatus(event, 403);
            return { message: 'Senha incorreta.', code: 'invalid_password' };
        }

        setSheetAccessCookie(event, row.id, row.sheet_password);
        log.info('Acesso a ficha pública liberado', {
            event: 'sheet.public.access.granted',
            auth_method: 'password',
            has_password: true,
            sheet_owner_id: userId,
            sheet_id: row.id
        });
        setResponseStatus(event, 204);
    } catch (error) {
        log.error('Falha ao liberar acesso à ficha pública', {
            event: 'sheet.public.access.failed',
            error,
            sheet_owner_id: userId
        });
        setResponseStatus(event, 503);
        return { message: 'Ficha indisponível. Tente novamente em instantes.' };
    }
});
