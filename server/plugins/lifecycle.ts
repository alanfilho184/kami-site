import { removeResponseHeader } from 'h3';
import { closeDatabase } from '../utils/database';
import { logger } from '../logs';
import { closeRealtimeServer } from '../services/realtime.service';

/**
 * Fecha o Socket.IO, o pool e o logger quando o processo recebe SIGINT/SIGTERM.
 * O PM2 espera até 8 segundos (kill_timeout) antes de forçar o encerramento.
 */
export default defineNitroPlugin(nitroApp => {
    nitroApp.hooks.hook('close', async () => {
        try {
            await closeRealtimeServer();
            logger.info('Socket.IO encerrado', { event: 'app.shutdown.socket' });
        } catch (error) {
            logger.error('Falha ao encerrar o Socket.IO', { event: 'app.shutdown.socket', error });
        }

        try {
            await closeDatabase();
            logger.info('Pool do Postgres encerrado', { event: 'app.shutdown.database' });
        } catch (error) {
            logger.error('Falha ao encerrar o pool do Postgres', { event: 'app.shutdown.database', error });
        }

        logger.info('Encerrando logger', { event: 'app.shutdown.logger' });
        await logger.close();
    });

    // O renderer do Nuxt assina toda resposta com `x-powered-by: Nuxt`. O
    // cabeçalho não é necessário e entrega a stack para qualquer visitante.
    nitroApp.hooks.hook('beforeResponse', event => {
        removeResponseHeader(event, 'x-powered-by');
    });
});
