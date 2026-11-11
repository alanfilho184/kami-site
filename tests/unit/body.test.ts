import { describe, expect, it } from 'vitest';
import { captureJsonValue, shouldCaptureHttpPayloads } from '../../server/logs/body';

describe('logs/body', () => {
    it('captura e mantém objetos pequenos', () => {
        const captured = captureJsonValue({ sheetId: 10, ok: true }, 1024);

        expect(captured).toEqual({
            value: { sheetId: 10, ok: true },
            bytes: Buffer.byteLength(JSON.stringify({ sheetId: 10, ok: true }), 'utf8'),
            truncated: false
        });
    });

    it('trunca valores acima do limite e informa o tamanho original', () => {
        const captured = captureJsonValue({ text: 'x'.repeat(2000) }, 128);

        expect(captured.truncated).toBe(true);
        expect(captured.bytes).toBeGreaterThan(128);
        expect(typeof captured.value).toBe('string');
        expect(String(captured.value)).toContain('…');
    });

    it('degrada valores não serializáveis sem quebrar o log', () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;

        const captured = captureJsonValue(circular, 1024);

        expect(captured.truncated).toBe(true);
        expect(captured.value).toBe('[não serializável]');
    });

    it('só captura APIs JSON fora da deny list', () => {
        expect(shouldCaptureHttpPayloads('/api/fichas/10')).toBe(true);
        expect(shouldCaptureHttpPayloads('/api/fichas/10/')).toBe(true);
        expect(shouldCaptureHttpPayloads('/api/auth/login')).toBe(true);
        expect(shouldCaptureHttpPayloads('/api/conta/discord/codigo')).toBe(false);
        expect(shouldCaptureHttpPayloads('/api/internal/discord/claim')).toBe(false);
        expect(shouldCaptureHttpPayloads('/api/suporte/reportar')).toBe(false);
        expect(shouldCaptureHttpPayloads('/painel')).toBe(false);
        expect(shouldCaptureHttpPayloads('/socket.io/')).toBe(false);
    });
});
