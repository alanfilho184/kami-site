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
                As fichas vinculadas a mensagens do Discord. O vínculo é gerenciado pelo bot; a sincronização em tempo
                real chega na D5.
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
            <ul
                v-if="liveSheets.length"
                class="site-painel-lista site-painel-lista--viva"
            >
                <li
                    v-for="item in liveSheets"
                    :key="item.id"
                    class="site-painel-lista__item"
                >
                    <div class="site-painel-lista__principal">
                        <p class="site-painel-lista__nome">{{ item.sheetName }}</p>
                        <p class="site-painel-lista__meta">
                            CANAL {{ item.channelId }} · MENSAGEM {{ item.messageId }}
                        </p>
                        <p class="site-painel-lista__meta">ÚLTIMO USO EM {{ formatLastUse(item.lastUse) }}</p>
                    </div>
                    <div class="site-painel-lista__selos">
                        <KamiChip status="live">AO VIVO</KamiChip>
                    </div>
                </li>
            </ul>
            <KamiEmptyState
                v-else
                title="NENHUMA FICHA AO VIVO"
                description="Envie uma ficha para o Discord para vê-la aqui. A gestão de vínculos pelo site chega na D5."
            />

            <p class="site-painel__nota">
                Esta área é somente leitura. O bot continua sendo o dono do vínculo com o Discord; o tempo real e a fila
                de sincronização entram na D5.
            </p>
        </KamiPanel>
    </div>
</template>
