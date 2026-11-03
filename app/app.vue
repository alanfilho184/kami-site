<script lang="ts">
import { computed, defineComponent } from 'vue';

const panelPrefixes = ['/painel', '/fichas', '/ao-vivo', '/macros', '/configuracoes'];

export default defineComponent({
    name: 'App',
    setup() {
        const route = useRoute();
        const layout = computed(() => {
            const isPanel = panelPrefixes.some(prefix => route.path === prefix || route.path.startsWith(`${prefix}/`));

            return isPanel ? 'painel' : 'default';
        });

        return { layout };
    }
});
</script>

<template>
    <NuxtLayout :name="layout">
        <NuxtPage />
    </NuxtLayout>
</template>
