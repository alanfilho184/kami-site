<script lang="ts">
import { defineNuxtComponent } from '#app';
import { privacyEnUs } from '~~/shared/content/legal/en-us';

export default defineNuxtComponent({
    name: 'PrivacyPageEn',
    data() {
        return {
            document: privacyEnUs
        };
    }
});
</script>

<template>
    <div class="site-container">
        <KamiLegalDocument
            :document="document"
            route="/privacy"
        />
    </div>
</template>
