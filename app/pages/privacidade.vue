<script lang="ts">
import { defineNuxtComponent } from '#app';
import { privacyPtBr } from '~~/shared/content/legal/pt-br';

export default defineNuxtComponent({
    name: 'PrivacyPage',
    data() {
        return {
            document: privacyPtBr
        };
    }
});
</script>

<template>
    <div class="site-container">
        <KamiLegalDocument
            :document="document"
            route="/privacidade"
        />
    </div>
</template>
