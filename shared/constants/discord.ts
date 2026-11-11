/** Tempo de vida do código de vínculo entre site e Discord. */
export const DISCORD_LINK_CODE_TTL_MS = 10 * 60 * 1000;

/** Quantidade de caracteres do código, sem separadores. */
export const DISCORD_LINK_CODE_LENGTH = 8;

/** Alfabeto sem caracteres ambíguos (O/0, I/1). */
export const DISCORD_LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Tamanho de cada grupo na exibição do código. */
export const DISCORD_LINK_CODE_BLOCK = 4;

/** Comando sugerido ao usuário no Discord. */
export const DISCORD_LINK_COMMAND = 'vincular';
