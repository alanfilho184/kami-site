<script lang="ts">
import { defineNuxtComponent, useHead, useRuntimeConfig } from '#app';

export default defineNuxtComponent({
    name: 'FichaPage',
    setup() {
        useHead({
            title: 'Ficha em desenvolvimento - Kami',
            meta: [
                {
                    name: 'description',
                    content: 'A ficha pública do Kami ainda está em desenvolvimento.'
                },
                { name: 'robots', content: 'noindex, nofollow' }
            ]
        });
    },
    data() {
        const config = useRuntimeConfig();

        return {
            botInvite: String(config.public.botInvite ?? '')
        };
    }
});
</script>

<template>
    <div class="site-container site-ficha-dev">
        <p class="site-eyebrow">FICHA PÚBLICA</p>

        <div class="site-ficha-dev__selo">
            <KamiChip status="warn">EM DESENVOLVIMENTO</KamiChip>
            <span class="site-ficha-dev__meta">A ficha pública ainda não está disponível</span>
        </div>

        <h1 class="site-ficha-dev__titulo">Em desenvolvimento.</h1>
        <p class="site-prosa site-ficha-dev__texto">
            Estamos construindo a leitura pública das fichas. Enquanto isso, você pode ver como uma ficha é por dentro
            na página inicial ou adicionar o Kami ao seu servidor para montar a sua.
        </p>

        <div class="site-ficha-dev__acoes">
            <KamiButton
                v-if="botInvite"
                variant="primary"
                size="lg"
                :href="botInvite"
                external
            >
                ADICIONAR O KAMI
            </KamiButton>
            <KamiButton
                size="lg"
                to="/#ficha"
            >
                VER A FICHA DE AMOSTRA
            </KamiButton>
        </div>

        <p class="site-ficha-dev__nota">A ficha de amostra mostra os cinco tipos de atributo na página inicial.</p>
    </div>
</template>
