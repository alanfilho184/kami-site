import type { H3Event } from 'h3';

const lastModified = '2026-10-28';

export default defineEventHandler((event: H3Event) => {
    const config = useRuntimeConfig(event);
    const siteUrl = String(config.public.siteUrl || 'https://kamiapp.com.br').replace(/\/+$/, '');

    const routes = [
        { path: '/', priority: '1.0', frequency: 'weekly' },
        { path: '/termos', priority: '0.4', frequency: 'yearly' },
        { path: '/privacidade', priority: '0.4', frequency: 'yearly' },
        { path: '/terms', priority: '0.3', frequency: 'yearly' },
        { path: '/privacy', priority: '0.3', frequency: 'yearly' }
    ];

    const urls = routes
        .map(
            route => `    <url>
        <loc>${siteUrl}${route.path}</loc>
        <lastmod>${lastModified}</lastmod>
        <changefreq>${route.frequency}</changefreq>
        <priority>${route.priority}</priority>
    </url>`
        )
        .join('\n');

    setHeader(event, 'content-type', 'application/xml; charset=utf-8');
    setHeader(event, 'cache-control', 'public, max-age=3600');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
});
