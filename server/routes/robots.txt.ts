import type { H3Event } from 'h3';

export default defineEventHandler((event: H3Event) => {
    const config = useRuntimeConfig(event);
    const siteUrl = String(config.public.siteUrl || 'https://kamiapp.com.br').replace(/\/+$/, '');

    setHeader(event, 'content-type', 'text/plain; charset=utf-8');
    setHeader(event, 'cache-control', 'public, max-age=3600');

    return [
        'User-agent: *',
        'Allow: /',
        'Disallow: /api/',
        'Disallow: /entrar',
        'Disallow: /login',
        'Disallow: /sair',
        'Disallow: /logout',
        'Disallow: /painel',
        'Disallow: /fichas',
        'Disallow: /configuracoes',
        'Disallow: /ficha',
        'Disallow: /comandos',
        '',
        `Sitemap: ${siteUrl}/sitemap.xml`,
        ''
    ].join('\n');
});
