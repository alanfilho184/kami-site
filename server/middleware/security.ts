/**
 * Cabeçalhos de segurança aplicados a toda resposta. A CSP entra na D5, quando
 * o conjunto de scripts inline e conexões de tempo real estiver fechado.
 */
export default defineEventHandler(event => {
    const response = event.node.res;

    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('x-frame-options', 'DENY');
    response.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
    response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    response.setHeader('cross-origin-opener-policy', 'same-origin');

    const protocol = getRequestHeader(event, 'x-forwarded-proto');

    if (protocol === 'https') {
        response.setHeader('strict-transport-security', 'max-age=15552000; includeSubDomains');
    }
});
