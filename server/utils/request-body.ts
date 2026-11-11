import { readRawBody, type H3Event } from 'h3';

export const SHEET_BODY_MAX_BYTES = 512_000;

export class RequestBodyTooLargeError extends Error {
    constructor() {
        super('Corpo da requisição muito grande');
        this.name = 'RequestBodyTooLargeError';
    }
}

/**
 * Lê o JSON com um teto de bytes antes do parse. O limite protege o editor de
 * payloads grandes sem mudar o formato aceito pelas rotas.
 */
export async function readLimitedJsonBody(event: H3Event, maxBytes: number = SHEET_BODY_MAX_BYTES): Promise<unknown> {
    const raw = await readRawBody(event, false);

    if (!raw) {
        return null;
    }

    if (raw.byteLength > maxBytes) {
        throw new RequestBodyTooLargeError();
    }

    try {
        return JSON.parse(raw.toString('utf8'));
    } catch {
        return null;
    }
}
