import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    emit: vi.fn(),
    close: vi.fn(),
    handlers: {} as Record<string, (...args: unknown[]) => void>
}));

vi.mock('socket.io-client', () => ({
    io: () => ({
        on: (event: string, handler: (...args: unknown[]) => void) => {
            mocks.handlers[event] = handler;
        },
        emit: mocks.emit,
        close: mocks.close
    })
}));

import { createLoggerClient } from '../../server/logs/client';

function createClient(overrides: { maxQueue?: number; maxQueueBytes?: number } = {}) {
    return createLoggerClient({
        url: 'https://logger.example.com',
        token: `klp_${'x'.repeat(32)}`,
        instance: 'test-instance',
        onError: vi.fn(),
        ...overrides
    });
}

describe('logs/client', () => {
    beforeEach(() => {
        mocks.emit.mockClear();
        mocks.close.mockClear();
        mocks.handlers = {};
    });

    it('enfileira enquanto desconectado e envia ao conectar', () => {
        const client = createClient();

        client.send('log-texto', { mensagem: 'antes' });
        expect(mocks.emit).not.toHaveBeenCalled();
        expect(client.pending()).toBe(1);

        mocks.handlers.connect?.();

        expect(mocks.emit).toHaveBeenCalledWith('log-texto', { mensagem: 'antes' });
        expect(client.pending()).toBe(0);
        expect(client.isConnected()).toBe(true);
    });

    it('descarta os eventos mais antigos ao estourar a fila', () => {
        const client = createClient({ maxQueue: 2 });

        client.send('log-texto', { n: 1 });
        client.send('log-texto', { n: 2 });
        client.send('log-texto', { n: 3 });

        expect(client.pending()).toBe(2);

        mocks.handlers.connect?.();

        expect(mocks.emit.mock.calls.map(call => call[1])).toEqual([{ n: 2 }, { n: 3 }]);
    });

    it('envia direto quando conectado e reporta connect_error', () => {
        const onError = vi.fn();
        const client = createLoggerClient({
            url: 'https://logger.example.com',
            token: `klp_${'x'.repeat(32)}`,
            instance: 'test-instance',
            onError
        });

        mocks.handlers.connect?.();
        client.send('log-ws', { event: 'sheet.updated' });

        expect(mocks.emit).toHaveBeenCalledWith('log-ws', { event: 'sheet.updated' });

        mocks.handlers.connect_error?.(new Error('offline'));

        expect(onError).toHaveBeenCalledTimes(1);
        expect(client.isConnected()).toBe(false);
    });

    it('fecha o socket e ignora novos eventos após close', async () => {
        const client = createClient();

        await client.close();
        client.send('log-texto', { n: 1 });

        expect(mocks.close).toHaveBeenCalledTimes(1);
        expect(mocks.emit).not.toHaveBeenCalled();
        expect(client.pending()).toBe(0);
    });
});
