import { removeResponseHeader } from 'h3';
import { closeDatabase } from '../utils/database';
import { logger } from '../utils/logger';

/**
 * Fecha o pool quando o processo recebe SIGINT/SIGTERM. O PM2 espera até 8
 * segundos (kill_timeout) antes de forçar o encerramento.
 */
export default defineNitroPlugin(nitroApp => {
    nitroApp.hooks.hook('close', async () => {
        try {
            await closeDatabase();
            logger.info('Pool do Postgres encerrado');
        } catch (error) {
            logger.error('Falha ao encerrar o pool do Postgres', { error });
        }
    });

    // O renderer do Nuxt assina toda resposta com `x-powered-by: Nuxt`. O
    // cabeçalho não é necessário e entrega a stack para qualquer visitante.
    nitroApp.hooks.hook('beforeResponse', event => {
        removeResponseHeader(event, 'x-powered-by');
    });
});
