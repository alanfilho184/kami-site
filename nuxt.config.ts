import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version: string;
};
const rawEnvironment = process.env.NUXT_PUBLIC_ENVIRONMENT ?? process.env.NUXT_PUBLIC_AMBIENTE ?? 'development';
const publicEnvironment =
    rawEnvironment === 'desenvolvimento'
        ? 'development'
        : rawEnvironment === 'producao'
          ? 'production'
          : rawEnvironment === 'teste'
            ? 'test'
            : rawEnvironment;

export default defineNuxtConfig({
    compatibilityDate: '2026-10-28',
    devtools: { enabled: false },
    ssr: true,
    telemetry: false,
    css: ['~/assets/css/kami.css', '~/assets/css/site.css'],
    app: {
        head: {
            htmlAttrs: { lang: 'pt-BR' },
            title: 'Kami - Fichas de RPG Personalizáveis',
            meta: [
                { charset: 'utf-8' },
                { name: 'viewport', content: 'width=device-width, initial-scale=1' },
                { name: 'theme-color', content: '#000000' },
                {
                    name: 'description',
                    content:
                        'Crie fichas de personagem do seu jeito, role dados e mantenha a ficha atualizada durante a sessão. Gratuito, em português e inglês.'
                }
            ],
            link: [
                { rel: 'icon', type: 'image/png', href: '/marca/favicon.png' },
                { rel: 'apple-touch-icon', href: '/marca/favicon.png' },
                {
                    rel: 'preload',
                    as: 'font',
                    type: 'font/woff2',
                    href: '/fonts/Oswald-SemiBold.woff2',
                    crossorigin: 'anonymous'
                },
                {
                    rel: 'preload',
                    as: 'font',
                    type: 'font/woff2',
                    href: '/fonts/FiraCode-Regular.woff2',
                    crossorigin: 'anonymous'
                }
            ]
        }
    },
    runtimeConfig: {
        public: {
            siteUrl: '',
            environment: publicEnvironment,
            discordInvite: '',
            botInvite: '',
            version: packageJson.version
        }
    },
    nitro: {
        compressPublicAssets: true
    },
    // Dev aberto para túneis e links externos (Discord). Não afeta o build.
    vite: {
        server: {
            allowedHosts: true
        }
    },
    routeRules: {
        '/api/**': { headers: { 'cache-control': 'no-store' } },
        '/fonts/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
        '/marca/**': { headers: { 'cache-control': 'public, max-age=604800' } }
    },
    typescript: {
        strict: true,
        typeCheck: false
    }
});
