import { getConfig } from '../utils/config';
import { logger } from '../utils/logger';

/**
 * Valida o ambiente antes de aceitar tráfego. Um deploy com variável faltando
 * deve falhar no boot, não na primeira requisição do usuário.
 */
export default defineNitroPlugin(() => {
    const config = getConfig();

    logger.info('Configuração carregada', {
        environment: config.environment,
        log_level: config.logLevel,
        pool_max: config.dbPoolMax
    });
});
