<script lang="ts">
import { defineNuxtComponent } from '#app';
import { termsEnUs } from '~~/shared/content/legal/en-us';

export default defineNuxtComponent({
    name: 'TermsPageEn',
    data() {
        return {
            document: termsEnUs
        };
    }
});
</script>

<template>
    <div class="site-container">
        <KamiLegalDocument
            :document="document"
            route="/terms"
        />
    </div>
</template>
