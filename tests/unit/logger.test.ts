import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, redactContext } from '../../server/utils/logger';

describe('logger', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('emite uma linha JSON no stdout', () => {
        const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const logger = createLogger('info');

        logger.info('Requisição concluída', { request_id: 'abc12345' });

        expect(output).toHaveBeenCalledTimes(1);

        const record = JSON.parse(String(output.mock.calls[0]?.[0]));

        expect(record).toMatchObject({
            level: 'info',
            service: 'kami-site',
            message: 'Requisição concluída',
            context: { request_id: 'abc12345' }
        });
        expect(typeof record.timestamp).toBe('string');
    });

    it('não emite registros abaixo do nível mínimo', () => {
        const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const logger = createLogger('warn');

        logger.info('IGNORADO');
        logger.debug('IGNORADO');

        expect(output).not.toHaveBeenCalled();
    });

    it('envia avisos e erros para o stderr', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const logger = createLogger('info');

        logger.warn('Atenção');
        logger.error('Falha');

        expect(error).toHaveBeenCalledTimes(2);
    });

    it('mascara chaves sensíveis em qualquer profundidade', () => {
        const context = redactContext({
            token: 'valor-do-token',
            password: 'valor-da-senha',
            nested: {
                cookie: 'valor-do-cookie',
                safe: 'visível'
            }
        });

        expect(context).toEqual({
            token: '***',
            password: '***',
            nested: {
                cookie: '***',
                safe: 'visível'
            }
        });
    });

    it('mascara a senha embutida em URLs de conexão', () => {
        const context = redactContext({
            url: 'postgresql://kami_app:segredo@127.0.0.1:5432/kami_prod'
        });

        expect(context).toEqual({
            url: 'postgresql://kami_app:***@127.0.0.1:5432/kami_prod'
        });
    });
});
