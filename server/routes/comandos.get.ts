/**
 * A página antiga de comandos foi retirada. O 410 evita que buscadores
 * continuem indexando uma lista que não existe mais.
 */
export default defineEventHandler(() => {
    throw createError({
        statusCode: 410,
        statusMessage: 'Gone',
        message: 'A página de comandos foi removida permanentemente.'
    });
});
