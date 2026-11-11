import { randomBytes } from 'node:crypto';

/**
 * Cabeçalhos de segurança aplicados a toda resposta. A CSP usa um nonce por
 * requisição; o `app/plugins/csp-nonce.server.ts` publica o mesmo nonce no head
 * para o Nuxt assinar os scripts inline do bootstrap. Em desenvolvimento a CSP
 * fica desligada para não conflitar com o Vite/HMR.
 */
const CSP_NONCE_BYTES = 16;

function contentSecurityPolicy(nonce: string, https: boolean): string {
    const directives = [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        `script-src 'self' 'nonce-${nonce}'`,
        "script-src-attr 'none'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self'",
        "connect-src 'self' ws: wss:",
        "media-src 'self' https:",
        "manifest-src 'self'",
        "worker-src 'self'"
    ];

    if (https) {
        directives.push('upgrade-insecure-requests');
    }

    return directives.join('; ');
}

export default defineEventHandler(event => {
    const response = event.node.res;
    const protocol = getRequestHeader(event, 'x-forwarded-proto');

    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('x-frame-options', 'DENY');
    response.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
    response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    response.setHeader('cross-origin-opener-policy', 'same-origin');

    if (!import.meta.dev) {
        const nonce = randomBytes(CSP_NONCE_BYTES).toString('base64');

        event.context.securityNonce = nonce;
        response.setHeader('content-security-policy', contentSecurityPolicy(nonce, protocol === 'https'));
    }

    if (protocol === 'https') {
        response.setHeader('strict-transport-security', 'max-age=15552000; includeSubDomains');
    }
});
