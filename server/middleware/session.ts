import { createSessionService } from '../services/session.service';
import { logger } from '../utils/logger';
import { clearSessionCookie, readSessionToken } from '../utils/session-cookie';

const ignoredPrefixes = ['/_nuxt/', '/__nuxt', '/fonts/', '/marca/', '/favicon.ico', '/robots.txt', '/sitemap.xml'];
const privatePrefixes = ['/painel', '/fichas', '/ao-vivo', '/macros', '/configuracoes'];
const noindexPrefixes = [
    '/entrar',
    '/cadastrar',
    '/painel',
    '/fichas',
    '/ao-vivo',
    '/macros',
    '/configuracoes',
    '/sair',
    '/ficha'
];

const sessionService = createSessionService();

function matchesPrefix(path: string, prefixes: string[]): boolean {
    return prefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Valida a sessão opaca uma vez por requisição, anexa o usuário ao contexto e
 * protege as páginas privadas. Sem cookie, nenhuma consulta é feita.
 */
export default defineEventHandler(async event => {
    const path = event.path.split('?')[0] ?? '/';

    if (matchesPrefix(path, ignoredPrefixes)) {
        return;
    }

    if (matchesPrefix(path, noindexPrefixes)) {
        setHeader(event, 'x-robots-tag', 'noindex, nofollow');
        setHeader(event, 'cache-control', 'private, no-store');
    }

    const token = readSessionToken(event);
    let session = null;
    let validationFailed = false;

    if (token) {
        try {
            session = await sessionService.find(token);
        } catch (error) {
            validationFailed = true;
            logger.warn('Falha ao validar sessão', { error });
        }

        if (session) {
            event.context.auth = session;
        } else if (!validationFailed) {
            clearSessionCookie(event);
        }
    }

    if ((path === '/entrar' || path === '/cadastrar') && session) {
        return sendRedirect(event, '/painel', 302);
    }

    if (matchesPrefix(path, privatePrefixes) && !session) {
        const target = `/entrar?redirecionar=${encodeURIComponent(event.path)}`;
        return sendRedirect(event, target, 302);
    }
});
