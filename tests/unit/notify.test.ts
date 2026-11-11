import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createToastStore } from '../../app/utils/notify';

function createStore(maxVisible = 4) {
    return createToastStore({ client: true, maxVisible });
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('store de notificações', () => {
    it('adiciona um toast com duração padrão por tipo', () => {
        const store = createStore();

        const id = store.success('Ficha salva.');

        expect(id).toBeGreaterThan(0);
        expect(store.state.items).toHaveLength(1);
        expect(store.state.items[0]).toMatchObject({ type: 'success', message: 'Ficha salva.', duration: 4000 });
    });

    it('usa durações diferentes para erro e mantém toast persistente', () => {
        const store = createStore();

        store.error('Falhou.');
        store.info('Persistente.', { duration: 0 });
        store.critical('Erro crítico.');

        expect(store.state.items[0]?.duration).toBe(12000);
        expect(store.state.items[1]?.duration).toBe(0);
        expect(store.state.items[2]?.duration).toBe(0);

        vi.advanceTimersByTime(60000);

        expect(store.state.items).toHaveLength(2);
        expect(store.state.items[0]?.message).toBe('Persistente.');
        expect(store.state.items[1]?.message).toBe('Erro crítico.');
    });

    it('remove o toast automaticamente depois do tempo e da animação', () => {
        const store = createStore();

        store.success('Some depois.');

        vi.advanceTimersByTime(4000);
        expect(store.state.items[0]?.closing).toBe(true);

        vi.advanceTimersByTime(220);
        expect(store.state.items).toHaveLength(0);
    });

    it('aumenta o tempo de mensagens longas e de ações', () => {
        const store = createStore();

        store.success('x'.repeat(200));

        expect(store.state.items[0]?.duration).toBe(7000);

        store.dismissAll();
        store.success('Com ação.', { action: { label: 'ABRIR', onClick: () => undefined } });

        expect(store.state.items[0]?.duration).toBe(9000);
    });

    it('deduplica pelo dedupeKey e reinicia o tempo', () => {
        const store = createStore();

        const first = store.error('Falhou.', { dedupeKey: 'salvar' });

        vi.advanceTimersByTime(5000);
        const second = store.error('Falhou de novo.', { dedupeKey: 'salvar' });

        expect(second).toBe(first);
        expect(store.state.items).toHaveLength(1);
        expect(store.state.items[0]?.message).toBe('Falhou de novo.');
        expect(store.state.items[0]?.remaining).toBe(12000);
    });

    it('limita os visíveis e mostra a fila quando um sai', () => {
        const store = createStore(2);

        store.info('Primeiro');
        store.info('Segundo');
        store.info('Terceiro');

        expect(store.state.items.map(item => item.message)).toEqual(['Primeiro', 'Segundo']);

        store.dismiss(store.state.items[0]!.id);
        vi.advanceTimersByTime(220);

        expect(store.state.items.map(item => item.message)).toEqual(['Segundo', 'Terceiro']);
    });

    it('pausa no hover/foco e retoma de onde parou', () => {
        const store = createStore();

        const id = store.success('Pausável.');

        vi.advanceTimersByTime(1000);
        store.pause(id);

        vi.advanceTimersByTime(10000);
        expect(store.state.items).toHaveLength(1);

        store.resume(id);
        vi.advanceTimersByTime(2999);
        expect(store.state.items[0]?.closing).toBe(false);

        vi.advanceTimersByTime(1);
        expect(store.state.items[0]?.closing).toBe(true);
    });

    it('executa a ação e fecha, ou mantém aberto com keepOpen', async () => {
        const store = createStore();
        const dismissedAction = vi.fn();
        const keptAction = vi.fn();

        const first = store.success('Ação.', { action: { label: 'IR', onClick: dismissedAction } });
        const second = store.success('Manter.', {
            action: { label: 'MANTER', onClick: keptAction, keepOpen: true }
        });

        await store.runAction(first);
        expect(dismissedAction).toHaveBeenCalledTimes(1);
        expect(store.state.items[0]?.closing).toBe(true);

        await store.runAction(second);
        expect(keptAction).toHaveBeenCalledTimes(1);
        expect(store.state.items[1]?.closing).toBe(false);
    });

    it('dismissAll limpa visíveis e fila', () => {
        const store = createStore(1);

        store.info('Primeiro');
        store.info('Segundo');
        store.info('Terceiro');
        store.dismissAll();

        expect(store.state.items).toHaveLength(0);

        store.info('Depois');
        expect(store.state.items[0]?.message).toBe('Depois');
    });

    it('não cria toasts no servidor', () => {
        const store = createToastStore({ client: false });

        expect(store.success('Não deve aparecer.')).toBe(0);
        expect(store.state.items).toHaveLength(0);
    });
});
