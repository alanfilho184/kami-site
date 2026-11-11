import { getRequestHeader, readRawBody, type H3Event } from 'h3';
import { SHEET_BODY_MAX_BYTES } from '../utils/request-body';

const JSON_CONTENT_TYPE = /^application\/(?:[\w.+-]+\+)?json\b/i;
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_RESPONSE_CAPTURE_BYTES = 64 * 1024;
const MAX_ERROR_TEXT_BYTES = 4 * 1024;

const BODY_CAPTURE_DENY = new Set([
    '/api/conta/discord/codigo',
    '/api/internal/discord/claim',
    '/api/suporte/reportar'
]);

export interface CapturedBody {
    value?: unknown;
    bytes?: number;
    truncated?: boolean;
    skipped?: 'not_json' | 'too_large' | 'unknown_length' | 'encoded' | 'empty' | 'read_error';
}

function normalizeRoute(route: string): string {
    const withoutQuery = route.split('?')[0] ?? route;
    return withoutQuery.length > 1 && withoutQuery.endsWith('/') ? withoutQuery.slice(0, -1) : withoutQuery;
}

/** O body só é capturado em APIs JSON e fora das rotas que carregam segredos. */
export function shouldCaptureHttpPayloads(route: string): boolean {
    const normalized = normalizeRoute(route);

    if (!normalized.startsWith('/api/')) {
        return false;
    }

    return !BODY_CAPTURE_DENY.has(normalized);
}

function truncateText(text: string, maxBytes: number): string {
    const buffer = Buffer.from(text, 'utf8');

    if (buffer.byteLength <= maxBytes) {
        return text;
    }

    return `${buffer.subarray(0, maxBytes).toString('utf8')}…`;
}

function captureRaw(raw: Buffer, maxBytes: number, sourceTruncated = false): CapturedBody {
    const bytes = raw.byteLength;
    const text = raw.toString('utf8');

    try {
        const parsed: unknown = JSON.parse(text);
        const serialized = JSON.stringify(parsed);

        if (Buffer.byteLength(serialized, 'utf8') <= maxBytes) {
            return { value: parsed, bytes, truncated: sourceTruncated };
        }

        return { value: truncateText(serialized, maxBytes), bytes, truncated: true };
    } catch {
        return {
            value: truncateText(text, maxBytes),
            bytes,
            truncated: sourceTruncated || Buffer.byteLength(text, 'utf8') > maxBytes
        };
    }
}

/** Captura um valor já parseado, como o payload de um evento de WebSocket. */
export function captureJsonValue(value: unknown, maxBytes: number): CapturedBody {
    try {
        const serialized = JSON.stringify(value);

        if (serialized === undefined) {
            return { value, bytes: 0 };
        }

        const bytes = Buffer.byteLength(serialized, 'utf8');

        if (bytes <= maxBytes) {
            return { value, bytes, truncated: false };
        }

        return { value: truncateText(serialized, maxBytes), bytes, truncated: true };
    } catch {
        return { value: '[não serializável]', truncated: true };
    }
}

/**
 * Lê o body para o log sem consumir a requisição: o h3 guarda a promise em
 * `event.node.req[RawBodySymbol]`, então `readBody`/`readRawBody` do handler
 * recebem o mesmo buffer depois.
 */
export async function readRequestBodyForLog(event: H3Event, maxBytes: number): Promise<CapturedBody | null> {
    if (!BODY_METHODS.has(event.method)) {
        return null;
    }

    const contentType = getRequestHeader(event, 'content-type') ?? '';

    if (!JSON_CONTENT_TYPE.test(contentType)) {
        return null;
    }

    const lengthHeader = getRequestHeader(event, 'content-length');

    if (!lengthHeader) {
        return { skipped: 'unknown_length' };
    }

    const length = Number(lengthHeader);

    if (!Number.isFinite(length) || length < 0) {
        return { skipped: 'unknown_length' };
    }

    if (length > SHEET_BODY_MAX_BYTES) {
        return { skipped: 'too_large' };
    }

    if (length === 0) {
        return null;
    }

    try {
        const raw = await readRawBody(event, false);

        if (!raw) {
            return null;
        }

        return captureRaw(raw, maxBytes);
    } catch {
        return { skipped: 'read_error' };
    }
}

export interface ResponseCapture {
    finish(): CapturedBody | null;
}

/**
 * Envolve write/end para guardar até 64 KB da resposta. A captura preserva os
 * argumentos e o retorno originais; qualquer falha nela não pode afetar a resposta.
 */
export function captureResponseBody(event: H3Event, maxBytes: number): ResponseCapture {
    const response = event.node.res;
    const chunks: Buffer[] = [];
    const originalWrite = response.write;
    const originalEnd = response.end;

    let capturedBytes = 0;
    let totalBytes = 0;
    let overflow = false;
    let finished = false;

    function collect(chunk: unknown): void {
        if (chunk === undefined || chunk === null) {
            return;
        }

        const buffer = Buffer.isBuffer(chunk)
            ? chunk
            : chunk instanceof Uint8Array
              ? Buffer.from(chunk)
              : Buffer.from(String(chunk));

        totalBytes += buffer.byteLength;

        if (overflow) {
            return;
        }

        const remaining = MAX_RESPONSE_CAPTURE_BYTES - capturedBytes;

        if (remaining <= 0) {
            overflow = true;
            return;
        }

        const slice = buffer.byteLength > remaining ? buffer.subarray(0, remaining) : buffer;
        chunks.push(slice);
        capturedBytes += slice.byteLength;

        if (slice.byteLength < buffer.byteLength) {
            overflow = true;
        }
    }

    response.write = function (this: typeof response, chunk: unknown, ...args: unknown[]): boolean {
        collect(chunk);
        return Reflect.apply(originalWrite, this, [chunk, ...args]) as boolean;
    } as typeof response.write;

    response.end = function (this: typeof response, chunk?: unknown, ...args: unknown[]): typeof response {
        collect(chunk);
        return Reflect.apply(originalEnd, this, [chunk, ...args]) as typeof response;
    } as typeof response.end;

    return {
        finish(): CapturedBody | null {
            if (finished) {
                return null;
            }

            finished = true;

            const status = response.statusCode;

            if (status === 204 || status === 304) {
                return { skipped: 'empty' };
            }

            if (response.getHeader('content-encoding')) {
                return { skipped: 'encoded' };
            }

            const contentType = String(response.getHeader('content-type') ?? '');

            if (JSON_CONTENT_TYPE.test(contentType)) {
                return captureRaw(Buffer.concat(chunks), maxBytes, overflow);
            }

            if (status >= 500 && chunks.length > 0) {
                const text = truncateText(
                    Buffer.concat(chunks).toString('utf8'),
                    Math.min(maxBytes, MAX_ERROR_TEXT_BYTES)
                );

                return {
                    value: text,
                    bytes: totalBytes,
                    truncated: overflow || totalBytes > MAX_ERROR_TEXT_BYTES
                };
            }

            return { skipped: 'not_json' };
        }
    };
}
