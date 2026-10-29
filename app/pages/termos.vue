<script lang="ts">
import { defineNuxtComponent } from '#app';
import { termsPtBr } from '~~/shared/content/legal/pt-br';

export default defineNuxtComponent({
    name: 'TermsPage',
    data() {
        return {
            document: termsPtBr
        };
    }
});
</script>

<template>
    <div class="site-container">
        <KamiLegalDocument
            :document="document"
            route="/termos"
        />
    </div>
</template>
