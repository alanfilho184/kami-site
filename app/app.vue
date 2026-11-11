<script lang="ts">
import { computed, defineComponent } from 'vue';

const panelPrefixes = ['/painel', '/fichas', '/ao-vivo', '/macros', '/configuracoes'];
const sheetPagePattern = /^\/\d+\/ficha(?:\/|$)/;

export default defineComponent({
    name: 'App',
    setup() {
        const route = useRoute();
        const layout = computed(() => {
            if (sheetPagePattern.test(route.path)) {
                return null;
            }

            const isPanel = panelPrefixes.some(prefix => route.path === prefix || route.path.startsWith(`${prefix}/`));

            return isPanel ? 'painel' : 'default';
        });

        return { layout };
    }
});
</script>

<template>
    <NuxtLayout
        v-if="layout"
        :name="layout"
    >
        <NuxtPage />
    </NuxtLayout>
    <NuxtPage v-else />

    <ClientOnly>
        <KamiToastHost />
    </ClientOnly>
</template>
