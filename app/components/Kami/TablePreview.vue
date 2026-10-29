<script lang="ts">
import { defineComponent } from 'vue';

/**
 * Prévia da mesa no hero. O arquivo em public/exemplos/exemplo-discord.webp é
 * uma captura real do Kami no Discord, em proporção quase quadrada.
 */
export default defineComponent({
    name: 'KamiTablePreview'
});
</script>

<template>
    <figure class="site-previa">
        <img
            src="/exemplos/exemplo-discord.webp"
            alt="Captura do Discord com o Kami respondendo a #ficha_enviar com a ficha de Lyra Voss e a #roll com o resultado de 2d6 + 3."
            width="607"
            height="659"
            fetchpriority="high"
        />
    </figure>
</template>
