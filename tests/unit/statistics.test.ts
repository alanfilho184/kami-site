import { describe, expect, it, vi } from 'vitest';
import {
    LEGACY_INTERACTIONS,
    REFRESH_INTERVAL_MS,
    RETRY_COOLDOWN_MS,
    STALE_LIMIT_MS,
    createStatisticsService,
    type StatisticsRow
} from '../../server/services/statistics.service';

function createRow(overrides: Partial<StatisticsRow> = {}): StatisticsRow {
    return {
        users: '120',
        active_users: '74',
        sheets: '348',
        commands: '1520',
        components: '240',
        ...overrides
    };
}

function createClock(initial = 1_000_000) {
    let instant = initial;

    return {
        now: () => instant,
        advance: (milliseconds: number) => {
            instant += milliseconds;
        }
    };
}

describe('estatísticas', () => {
    it('converte as contagens do Postgres e registra o horário da leitura', async () => {
        const query = vi.fn().mockResolvedValue(createRow());
        const clock = createClock();
        const service = createStatisticsService({ query, now: clock.now });

        const result = await service.get();

        expect(result).toEqual({
            available: true,
            data: {
                users: 120,
                activeUsers: 74,
                sheets: 348,
                interactions: 1520 + 240 + LEGACY_INTERACTIONS
            },
            updatedAt: new Date(1_000_000).toISOString(),
            expired: false,
            source: 'query'
        });
        expect(query).toHaveBeenCalledTimes(1);
    });

    it('calcula interações como comandos + componentes + legado do bot antigo', async () => {
        const query = vi.fn().mockResolvedValue(createRow({ commands: '10', components: '5' }));
        const clock = createClock();
        const service = createStatisticsService({ query, now: clock.now });

        const result = await service.get();

        expect(result.data?.interactions).toBe(15 + LEGACY_INTERACTIONS);
    });

    it('serve o cache fresco sem consultar o banco de novo', async () => {
        const query = vi.fn().mockResolvedValue(createRow());
        const clock = createClock();
        const service = createStatisticsService({ query, now: clock.now });

        await service.get();
        clock.advance(REFRESH_INTERVAL_MS - 1);
        const result = await service.get();

        expect(result.source).toBe('cache');
        expect(result.expired).toBe(false);
        expect(query).toHaveBeenCalledTimes(1);
    });

    it('consulta de novo depois da janela fresca', async () => {
        const query = vi.fn().mockResolvedValue(createRow());
        const clock = createClock();
        const service = createStatisticsService({ query, now: clock.now });

        await service.get();
        clock.advance(REFRESH_INTERVAL_MS);
        const result = await service.get();

        expect(result.source).toBe('query');
        expect(query).toHaveBeenCalledTimes(2);
    });

    it('serve o último valor por até 15 minutos quando o banco falha', async () => {
        const query = vi.fn().mockResolvedValueOnce(createRow()).mockRejectedValueOnce(new Error('banco fora'));
        const clock = createClock();
        const warn = vi.fn();
        const service = createStatisticsService({ query, now: clock.now, warn });

        await service.get();
        clock.advance(5 * 60_000);
        const result = await service.get();

        expect(result.available).toBe(true);
        expect(result.expired).toBe(true);
        expect(result.source).toBe('stale-cache');
        expect(result.updatedAt).toBe(new Date(1_000_000).toISOString());
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('fica indisponível quando o cache passou de 15 minutos', async () => {
        const query = vi.fn().mockResolvedValueOnce(createRow()).mockRejectedValueOnce(new Error('banco fora'));
        const clock = createClock();
        const service = createStatisticsService({
            query,
            now: clock.now,
            warn: vi.fn()
        });

        await service.get();
        clock.advance(STALE_LIMIT_MS + 1);
        const result = await service.get();

        expect(result).toEqual({
            available: false,
            data: null,
            updatedAt: null,
            expired: false,
            source: 'unavailable'
        });
    });

    it('evita martelar o banco durante a espera após uma falha', async () => {
        const query = vi.fn().mockRejectedValue(new Error('banco fora'));
        const clock = createClock();
        const service = createStatisticsService({
            query,
            now: clock.now,
            warn: vi.fn()
        });

        await service.get();
        clock.advance(RETRY_COOLDOWN_MS - 1);
        const result = await service.get();

        expect(result.available).toBe(false);
        expect(query).toHaveBeenCalledTimes(1);
    });

    it('trata contagem inválida como falha, nunca como zero', async () => {
        const query = vi.fn().mockResolvedValue(createRow({ sheets: 'invalido' }));
        const clock = createClock();
        const service = createStatisticsService({
            query,
            now: clock.now,
            warn: vi.fn()
        });

        const result = await service.get();

        expect(result.available).toBe(false);
        expect(result.data).toBeNull();
    });
});
