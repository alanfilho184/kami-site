const arquivoEnv = process.env.KAMI_ENV_FILE || '/etc/kami/kami-site.env';
const porta = process.env.PORT || '3000';
const host = process.env.HOST || '127.0.0.1';

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
                NODE_ENV: 'production',
                PORT: porta,
                HOST: host
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
