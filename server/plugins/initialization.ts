import { getConfig } from '../utils/config';
import { logger } from '../logs';

/**
 * Valida o ambiente antes de aceitar tráfego. Um deploy com variável faltando
 * deve falhar no boot, não na primeira requisição do usuário.
 */
export default defineNitroPlugin(() => {
    const config = getConfig();

    logger.info('Configuração carregada', {
        event: 'app.started',
        environment: config.environment,
        log_level: config.logLevel,
        pool_max: config.dbPoolMax,
        logger_enabled: config.loggerEnabled,
        instance_name: config.instanceName
    });
});
