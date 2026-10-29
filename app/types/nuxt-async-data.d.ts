import type { NuxtApp } from '#app';

/**
 * O hook `asyncData` continua disponível em `defineNuxtComponent`, mas o Nuxt 4
 * não o declara em `ComponentCustomOptions`. Esta augmentation devolve o tipo
 * para que o Options API consiga usar o hook sem recorrer a `any`.
 */
declare module 'vue' {
    interface ComponentCustomOptions {
        asyncData?(nuxtApp: NuxtApp): Promise<Record<string, unknown> | void> | Record<string, unknown> | void;
    }
}

export {};
