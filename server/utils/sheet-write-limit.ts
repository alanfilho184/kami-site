import type { H3Event } from 'h3';
import type { SheetErrorResponse } from '~~/shared/types/sheet';
import { consumeSheetWrite } from './rate-limit';

/**
 * Limite por usuário para mutações de ficha. O auto-save do editor usa
 * debounce de 700 ms, então 300 operações/minuto dá folga para uso normal e
 * contém rajadas de criação/edição/exclusão.
 */
export function enforceSheetWriteLimit(event: H3Event, userId: number): SheetErrorResponse | null {
    const rate = consumeSheetWrite(userId);

    if (rate.allowed) {
        return null;
    }

    setHeader(event, 'retry-after', rate.retryAfterSeconds);
    setResponseStatus(event, 429);

    return {
        message: 'Muitas alterações em pouco tempo. Aguarde alguns segundos e tente novamente.',
        code: 'rate_limited'
    };
}
