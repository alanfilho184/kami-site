// O .env da raiz do projeto é o padrão em dev e produção. KAMI_ENV_FILE aponta
// outro arquivo quando explicitamente definido (override opcional); sem ele, o
// fallback é /etc/kami/kami-site.env. Só um arquivo é carregado, para não
// misturar configuração de dois lugares. O arquivo precisa ser UTF-8 sem BOM.
const { existsSync } = require('node:fs');
const path = require('node:path');

const ARQUIVO_ENV_LOCAL = path.join(__dirname, '.env');
const ARQUIVO_ENV_PRODUCAO = '/etc/kami/kami-site.env';

function resolveEnvFile() {
    const arquivoPedido = process.env.KAMI_ENV_FILE;

    if (arquivoPedido) {
        // Caminho pedido à mão não cai no .env por engano: falhar alto é melhor
        // do que subir com o banco errado.
        if (!existsSync(arquivoPedido)) {
            throw new Error(`KAMI_ENV_FILE aponta para um arquivo inexistente: ${arquivoPedido}`);
        }

        return arquivoPedido;
    }

    if (existsSync(ARQUIVO_ENV_LOCAL)) {
        return ARQUIVO_ENV_LOCAL;
    }

    if (!existsSync(ARQUIVO_ENV_PRODUCAO)) {
        console.warn(`Nenhum arquivo de ambiente encontrado em ${ARQUIVO_ENV_LOCAL} nem em ${ARQUIVO_ENV_PRODUCAO}.`);
    }

    return ARQUIVO_ENV_PRODUCAO;
}

const arquivoEnv = resolveEnvFile();
// PORT e HOST vêm do arquivo, carregado pelo Node via --env-file-if-exists.
// Não coloque defaults aqui: o PM2 injetaria 3000/127.0.0.1 no child antes de o
// Node ler o arquivo e, como o Node não sobrescreve variável existente, o .env
// nunca teria efeito.

module.exports = {
    apps: [
        {
            name: 'kami-site',
            script: './.output/server/index.mjs',
            cwd: __dirname,
            exec_mode: 'fork',
            instances: 1,
            node_args: `--env-file-if-exists=${arquivoEnv}`,
            env: {
                NODE_ENV: 'production'
            },
            max_memory_restart: '512M',
            kill_timeout: 8000,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 3000,
            time: true,
            merge_logs: true,
            out_file: '/var/log/kami-site/out.log',
            error_file: '/var/log/kami-site/error.log'
        }
    ]
};
