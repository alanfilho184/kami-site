<script lang="ts">
import { defineNuxtComponent, useHead, useRequestFetch } from '#app';
import type { LiveSheetItem } from '~~/shared/types/panel';
import { formatDateTime } from '~~/shared/utils/formatting';
import { errorStatus } from '~~/shared/utils/http-error';

export default defineNuxtComponent({
    name: 'LiveSheetsPage',
    setup() {
        useHead({
            title: 'Ao vivo - Kami',
            meta: [
                {
                    name: 'description',
                    content: 'Fichas vinculadas ao Discord e ao vivo no Kami.'
                },
                { name: 'robots', content: 'noindex, nofollow' }
            ]
        });
    },
    async asyncData() {
        const requestFetch = useRequestFetch();

        try {
            const liveSheets = await requestFetch<LiveSheetItem[]>('/api/ao-vivo');
            return { liveSheets, needsLogin: false, isUnavailable: false };
        } catch (error) {
            const status = errorStatus(error);
            return {
                liveSheets: [],
                needsLogin: status === 401,
                isUnavailable: status !== 401
            };
        }
    },
    data() {
        return {
            liveSheets: [] as LiveSheetItem[],
            needsLogin: false,
            isUnavailable: false
        };
    },
    methods: {
        formatLastUse(value: string): string {
            return formatDateTime(value);
        }
    }
});
</script>

<template>
    <div class="site-painel-pagina">
        <header class="site-painel-hero">
            <p class="site-eyebrow">FICHAS AO VIVO</p>
            <h1 class="site-painel__titulo">AO VIVO.</h1>
            <p class="site-prosa site-painel__descricao">
                As fichas vinculadas a mensagens do Discord. O vínculo é gerenciado pelo bot e as mensagens são
                sincronizadas automaticamente.
            </p>
        </header>

        <KamiEmptyState
            v-if="needsLogin"
            title="SESSÃO EXPIRADA"
            description="Entre novamente para acessar as fichas ao vivo."
        >
            <template #action>
                <KamiButton
                    variant="primary"
                    to="/entrar"
                >
                    ENTRAR
                </KamiButton>
            </template>
        </KamiEmptyState>

        <KamiEmptyState
            v-else-if="isUnavailable"
            title="FICHAS AO VIVO INDISPONÍVEIS"
            description="Não foi possível carregar os vínculos agora. Tente novamente em instantes."
            error
        >
            <template #action>
                <KamiButton href="/ao-vivo">TENTAR NOVAMENTE</KamiButton>
            </template>
        </KamiEmptyState>

        <KamiPanel
            v-else
            label="VÍNCULOS COM O DISCORD"
            code="IRT"
        >
            <div
                v-if="liveSheets.length"
                class="site-fichas__grade"
            >
                <article
                    v-for="item in liveSheets"
                    :key="item.id"
                    class="site-fichas__card"
                >
                    <header class="site-fichas__card-topo">
                        <div class="site-fichas__card-identidade">
                            <span class="site-fichas__card-codigo">FICHA #{{ item.sheetId }}</span>
                            <h3 class="site-fichas__card-nome">{{ item.sheetName }}</h3>
                        </div>
                        <div class="site-fichas__card-selos">
                            <KamiChip status="live">AO VIVO</KamiChip>
                        </div>
                    </header>

                    <div class="site-fichas__card-corpo">
                        <p class="site-fichas__card-meta">CANAL {{ item.channelId }}</p>
                        <p class="site-fichas__card-meta">MENSAGEM {{ item.messageId }}</p>
                        <p class="site-fichas__card-meta">ÚLTIMO USO EM {{ formatLastUse(item.lastUse) }}</p>
                    </div>

                    <footer class="site-fichas__card-acoes">
                        <KamiButton
                            size="sm"
                            variant="primary"
                            :to="`/fichas/${item.sheetId}`"
                        >
                            ABRIR
                        </KamiButton>
                    </footer>
                </article>
            </div>
            <KamiEmptyState
                v-else
                title="NENHUMA FICHA AO VIVO"
                description="Use o bot para enviar uma ficha ao Discord e ela aparecerá aqui."
            />

            <p class="site-painel__nota site-ao-vivo__nota">
                As fichas ao vivo podem ser editadas no site. O bot mantém as mensagens do Discord sincronizadas
                automaticamente.
            </p>
        </KamiPanel>
    </div>
</template>
