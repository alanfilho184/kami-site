import { describe, expect, it } from 'vitest';
import {
    createRateLimiter,
    consumeReport,
    consumeSheetWrite,
    hashRateLimitKey,
    REPORT_LIMIT,
    SHEET_WRITE_LIMIT
} from '../../server/utils/rate-limit';

function createClock(initial = 1_000_000) {
    let instant = initial;

    return {
        now: () => instant,
        advance: (milliseconds: number) => {
            instant += milliseconds;
        }
    };
}

describe('rate limit', () => {
    it('permite até o limite e bloqueia a próxima tentativa', () => {
        const clock = createClock();
        const limiter = createRateLimiter({
            limit: 2,
            windowMs: 60_000,
            now: clock.now
        });

        expect(limiter.consume('ip:127.0.0.1').allowed).toBe(true);
        expect(limiter.consume('ip:127.0.0.1').allowed).toBe(true);

        const blocked = limiter.consume('ip:127.0.0.1');

        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfterSeconds).toBe(60);
    });

    it('libera a chave depois da janela', () => {
        const clock = createClock();
        const limiter = createRateLimiter({
            limit: 1,
            windowMs: 1000,
            now: clock.now
        });

        expect(limiter.consume('email:teste').allowed).toBe(true);
        expect(limiter.consume('email:teste').allowed).toBe(false);

        clock.advance(1001);

        expect(limiter.consume('email:teste').allowed).toBe(true);
    });

    it('separa as chaves por IP e por e-mail', () => {
        const clock = createClock();
        const limiter = createRateLimiter({
            limit: 1,
            windowMs: 60_000,
            now: clock.now
        });

        expect(limiter.consume('ip:1.1.1.1').allowed).toBe(true);
        expect(limiter.consume('ip:2.2.2.2').allowed).toBe(true);
        expect(limiter.consume('email:um').allowed).toBe(true);
        expect(limiter.consume('email:dois').allowed).toBe(true);
    });

    it('reset libera a chave imediatamente', () => {
        const clock = createClock();
        const limiter = createRateLimiter({
            limit: 1,
            windowMs: 60_000,
            now: clock.now
        });

        limiter.consume('email:teste');
        expect(limiter.consume('email:teste').allowed).toBe(false);

        limiter.reset('email:teste');

        expect(limiter.consume('email:teste').allowed).toBe(true);
    });

    it('gera uma chave estável e sem o e-mail em texto puro', () => {
        const key = hashRateLimitKey('lyra@example.com');

        expect(key).toMatch(/^[a-f0-9]{64}$/);
        expect(key).not.toContain('lyra');
    });

    it('limita as mutações de ficha por usuário', () => {
        const userId = 987654;

        for (let index = 0; index < SHEET_WRITE_LIMIT; index += 1) {
            expect(consumeSheetWrite(userId).allowed).toBe(true);
        }

        expect(consumeSheetWrite(userId).allowed).toBe(false);
        expect(consumeSheetWrite(userId + 1).allowed).toBe(true);
    });

    it('limita os reportes de problema por usuário', () => {
        const userId = 123123;

        for (let index = 0; index < REPORT_LIMIT; index += 1) {
            expect(consumeReport(userId).allowed).toBe(true);
        }

        expect(consumeReport(userId).allowed).toBe(false);
        expect(consumeReport(userId + 1).allowed).toBe(true);
    });
});
