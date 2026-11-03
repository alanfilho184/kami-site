<script lang="ts">
import { defineNuxtComponent, useHead, useRequestFetch } from '#app';
import type { MacroListItem } from '~~/shared/types/panel';
import { formatDate } from '~~/shared/utils/formatting';
import { errorStatus } from '~~/shared/utils/http-error';

export default defineNuxtComponent({
    name: 'MacrosPage',
    setup() {
        useHead({
            title: 'Macros - Kami',
            meta: [
                {
                    name: 'description',
                    content: 'Suas macros no Kami.'
                },
                { name: 'robots', content: 'noindex, nofollow' }
            ]
        });
    },
    async asyncData() {
        const requestFetch = useRequestFetch();

        try {
            const macros = await requestFetch<MacroListItem[]>('/api/macros');
            return { macros, needsLogin: false, isUnavailable: false };
        } catch (error) {
            const status = errorStatus(error);
            return {
                macros: [],
                needsLogin: status === 401,
                isUnavailable: status !== 401
            };
        }
    },
    data() {
        return {
            macros: [] as MacroListItem[],
            needsLogin: false,
            isUnavailable: false
        };
    },
    methods: {
        formatUpdatedAt(value: string): string {
            return formatDate(value);
        }
    }
});
</script>

<template>
    <div class="site-painel-pagina">
        <header class="site-painel-hero">
            <div class="site-painel-hero__selo">
                <p class="site-eyebrow">SUAS MACROS</p>
                <KamiChip status="warn">EM DESENVOLVIMENTO</KamiChip>
            </div>
            <h1 class="site-painel__titulo">MACROS.</h1>
            <p class="site-prosa site-painel__descricao">
                As macros que você já tem no Kami. A edição pelo site ainda está em desenvolvimento; por enquanto, esta
                área é somente leitura.
            </p>
        </header>

        <KamiEmptyState
            v-if="needsLogin"
            title="SESSÃO EXPIRADA"
            description="Entre novamente para acessar suas macros."
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
            title="MACROS INDISPONÍVEIS"
            description="Não foi possível carregar suas macros agora. Tente novamente em instantes."
            error
        >
            <template #action>
                <KamiButton href="/macros">TENTAR NOVAMENTE</KamiButton>
            </template>
        </KamiEmptyState>

        <KamiPanel
            v-else
            label="MINHAS MACROS"
            code="ROADMAP"
        >
            <ul
                v-if="macros.length"
                class="site-painel-lista"
            >
                <li
                    v-for="macro in macros"
                    :key="macro.id"
                    class="site-painel-lista__item"
                >
                    <div class="site-painel-lista__principal">
                        <p class="site-painel-lista__nome">{{ macro.name }}</p>
                        <p class="site-painel-lista__meta">ATUALIZADA EM {{ formatUpdatedAt(macro.updatedAt) }}</p>
                    </div>
                    <div class="site-painel-lista__selos">
                        <KamiChip :status="macro.isPublic ? 'dim' : 'warn'">
                            {{ macro.isPublic ? 'PÚBLICA' : 'PRIVADA' }}
                        </KamiChip>
                        <KamiChip status="warn">EM DESENVOLVIMENTO</KamiChip>
                    </div>
                </li>
            </ul>
            <KamiEmptyState
                v-else
                title="NENHUMA MACRO AINDA"
                description="As macros criadas no Discord aparecerão aqui quando o editor de macros for definido."
            />
        </KamiPanel>
    </div>
</template>
