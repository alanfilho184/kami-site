const SCRIPT_TAG_PATTERN = /<script(?![^>]*\bnonce=)/gi;

/**
 * O renderer do Nuxt gera scripts inline (import map, configuração e payload)
 * depois de montar o head, então o nonce da CSP é aplicado no HTML final.
 * O conteúdo do payload é serializado com `<` como `\u003C`, portanto o padrão
 * não encontra tags dentro de strings de dados.
 */
export default defineNitroPlugin(nitroApp => {
    nitroApp.hooks.hook('render:html', (html, { event }) => {
        const nonce = event.context.securityNonce;

        if (!nonce) {
            return;
        }

        const nonceAttribute = ` nonce="${nonce}"`;
        const addNonce = (chunk: string) => chunk.replace(SCRIPT_TAG_PATTERN, `<script${nonceAttribute}`);

        html.head = html.head.map(addNonce);
        html.bodyPrepend = html.bodyPrepend.map(addNonce);
        html.body = html.body.map(addNonce);
        html.bodyAppend = html.bodyAppend.map(addNonce);
    });
});
