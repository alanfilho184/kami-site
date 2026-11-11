import { watch } from 'vue';
import { defineNuxtPlugin, useRoute } from '#app';
import { connectRealtime, isRealtimeConnected } from '~/utils/realtime';

const privatePrefixes = ['/painel', '/fichas', '/ao-vivo', '/macros', '/configuracoes'];
const sheetPagePattern = /^\/\d+\/ficha(?:\/|$)/;

function needsRealtime(path: string): boolean {
    return (
        privatePrefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`)) || sheetPagePattern.test(path)
    );
}

export default defineNuxtPlugin(() => {
    const route = useRoute();

    async function ensureRealtime(path: string): Promise<void> {
        if (!needsRealtime(path) || isRealtimeConnected()) {
            return;
        }

        try {
            await $fetch('/api/auth/session');
            connectRealtime();
        } catch {
            // Visitante anônimo: a ficha pública não abre socket.
        }
    }

    watch(
        () => route.path,
        path => void ensureRealtime(path),
        { immediate: true }
    );
});
