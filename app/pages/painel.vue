<script lang="ts">
import { defineNuxtComponent, useHead, useRequestFetch } from '#app';
import type { PanelResponse } from '~~/shared/types/panel';
import { errorStatus } from '~~/shared/utils/http-error';
import { formatDate, formatNumber } from '~~/shared/utils/formatting';

export default defineNuxtComponent({
    name: 'PanelPage',
    setup() {
        useHead({
            title: 'Painel - Kami',
            meta: [
                {
                    name: 'description',
                    content: 'Área do jogador no Kami.'
                },
                { name: 'robots', content: 'noindex, nofollow' }
            ]
        });
    },
    async asyncData() {
        const requestFetch = useRequestFetch();

        try {
            const panel = await requestFetch<PanelResponse>('/api/painel');
            return { panel, needsLogin: false, isUnavailable: false };
        } catch (error) {
            const status = errorStatus(error);
            return {
                panel: null,
                needsLogin: status === 401,
                isUnavailable: status !== 401
            };
        }
    },
    data() {
        return {
            panel: null as PanelResponse | null,
            needsLogin: false,
            isUnavailable: false,
            isLoggingOut: false
        };
    },
    computed: {
        displayName(): string {
            return this.panel?.account.username || this.panel?.account.email || 'jogador';
        },
        initials(): string {
            const source = this.panel?.account.username || this.panel?.account.email || 'K';
            return source.slice(0, 2).toUpperCase();
        },
        memberSince(): string {
            return this.panel ? formatDate(this.panel.account.createdAt) : '-';
        },
        summaryItems(): Array<{ code: string; label: string; value: string; sub: string }> {
            if (!this.panel) {
                return [];
            }

            return [
                {
                    code: '01',
                    label: 'FICHAS',
                    value: formatNumber(this.panel.summary.sheets),
                    sub: 'no site'
                },
                {
                    code: '02',
                    label: 'PÚBLICAS',
                    value: formatNumber(this.panel.summary.publicSheets),
                    sub: 'compartilhadas'
                },
                {
                    code: '03',
                    label: 'AO VIVO',
                    value: formatNumber(this.panel.summary.liveSheets),
                    sub: 'vinculadas ao Discord'
                },
                {
                    code: '04',
                    label: 'MACROS',
                    value: formatNumber(this.panel.summary.macros),
                    sub: 'em desenvolvimento'
                }
            ];
        }
    },
    methods: {
        formatUpdatedAt(value: string): string {
            return formatDate(value);
        },
        async handleLogout(): Promise<void> {
            if (this.isLoggingOut) {
                return;
            }

            this.isLoggingOut = true;

            try {
                await $fetch('/api/auth/logout', { method: 'POST' });
                window.location.assign('/');
            } finally {
                this.isLoggingOut = false;
            }
        },
        reloadPage(): void {
            window.location.reload();
        }
    }
});
</script>

<template>
    <div class="site-painel-pagina">
        <KamiEmptyState
            v-if="needsLogin"
            title="SESSÃO EXPIRADA"
            description="Entre novamente para acessar o painel."
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
            title="PAINEL INDISPONÍVEL"
            description="Não foi possível carregar os dados agora. Tente novamente em instantes."
            error
        >
            <template #action>
                <KamiButton @click="reloadPage">TENTAR NOVAMENTE</KamiButton>
            </template>
        </KamiEmptyState>

        <template v-else-if="panel">
            <header class="site-painel-hero">
                <p class="site-eyebrow">ÁREA DO JOGADOR</p>
                <h1 class="site-painel__titulo">PAINEL.</h1>
                <p class="site-prosa site-painel__descricao">
                    Bem-vindo de volta, {{ displayName }}. Acompanhe suas fichas, o que está ao vivo e os próximos
                    passos do Kami.
                </p>
            </header>

            <section
                class="site-painel-resumo"
                aria-label="Conta e resumo"
            >
                <KamiPanel
                    label="CONTA"
                    code="D2"
                >
                    <div class="site-conta">
                        <div
                            class="site-conta__avatar"
                            aria-hidden="true"
                        >
                            {{ initials }}
                        </div>
                        <div class="site-conta__identidade">
                            <p class="site-conta__nome">{{ displayName }}</p>
                            <p class="site-conta__email">{{ panel.account.email || 'sem e-mail cadastrado' }}</p>
                        </div>
                        <KamiChip :status="panel.account.discordLinked ? 'ok' : 'dim'">
                            {{ panel.account.discordLinked ? 'DISCORD VINCULADO' : 'SEM VÍNCULO DISCORD' }}
                        </KamiChip>
                    </div>

                    <div class="site-conta__rodape">
                        <dl class="site-conta__dados">
                            <div>
                                <dt>MEMBRO DESDE</dt>
                                <dd>{{ memberSince }}</dd>
                            </div>
                            <div>
                                <dt>DISCORD</dt>
                                <dd>{{ panel.account.discordLinked ? 'VINCULADO' : 'NÃO VINCULADO' }}</dd>
                            </div>
                        </dl>

                        <KamiButton
                            variant="danger"
                            :disabled="isLoggingOut"
                            @click="handleLogout"
                        >
                            {{ isLoggingOut ? 'SAINDO...' : 'SAIR DA CONTA' }}
                        </KamiButton>
                    </div>
                </KamiPanel>

                <KamiPanel
                    label="RESUMO"
                    code="DADOS"
                >
                    <div class="site-painel-stats">
                        <KamiStat
                            v-for="item in summaryItems"
                            :key="item.code"
                            :code="item.code"
                            :label="item.label"
                            :value="item.value"
                            :sub="item.sub"
                        />
                    </div>
                </KamiPanel>
            </section>

            <KamiPanel
                label="ÚLTIMAS FICHAS"
                code="FICHAS"
            >
                <ul
                    v-if="panel.recentSheets.length"
                    class="site-painel-lista"
                >
                    <li
                        v-for="sheet in panel.recentSheets"
                        :key="sheet.id"
                        class="site-painel-lista__item"
                    >
                        <div class="site-painel-lista__principal">
                            <p class="site-painel-lista__nome">{{ sheet.name }}</p>
                            <p class="site-painel-lista__meta">ATUALIZADA EM {{ formatUpdatedAt(sheet.updatedAt) }}</p>
                        </div>
                        <div class="site-painel-lista__selos">
                            <KamiChip
                                v-if="sheet.isLive"
                                status="live"
                            >
                                AO VIVO
                            </KamiChip>
                            <KamiChip
                                v-if="sheet.isPublic"
                                status="dim"
                            >
                                PÚBLICA
                            </KamiChip>
                            <KamiChip
                                v-if="sheet.isLegacy"
                                status="warn"
                            >
                                LEGADA
                            </KamiChip>
                        </div>
                    </li>
                </ul>
                <KamiEmptyState
                    v-else
                    title="NENHUMA FICHA AINDA"
                    description="Crie sua primeira ficha no site. As fichas criadas no Discord também aparecerão aqui."
                >
                    <template #action>
                        <KamiButton
                            variant="primary"
                            to="/fichas"
                        >
                            CRIAR PRIMEIRA FICHA
                        </KamiButton>
                    </template>
                </KamiEmptyState>
            </KamiPanel>

            <section
                class="site-painel-atalhos"
                aria-label="Atalhos do painel"
            >
                <article class="site-painel-atalho">
                    <p class="site-eyebrow">FICHAS</p>
                    <h2 class="site-painel-atalho__titulo">Suas fichas, em um só lugar.</h2>
                    <p class="site-painel-atalho__texto">Crie, edite e organize suas fichas em um só lugar.</p>
                    <KamiButton to="/fichas">VER FICHAS</KamiButton>
                </article>

                <article class="site-painel-atalho">
                    <p class="site-eyebrow">AO VIVO</p>
                    <h2 class="site-painel-atalho__titulo">O que está na mesa.</h2>
                    <p class="site-painel-atalho__texto">
                        As fichas vinculadas ao Discord aparecem aqui. A sincronização em tempo real chega na D5.
                    </p>
                    <KamiButton to="/ao-vivo">VER AO VIVO</KamiButton>
                </article>

                <article class="site-painel-atalho">
                    <p class="site-eyebrow">MACROS</p>
                    <h2 class="site-painel-atalho__titulo">Rolagens salvas.</h2>
                    <p class="site-painel-atalho__texto">
                        O editor de macros ainda está em desenvolvimento. Por enquanto, veja o que já existe.
                    </p>
                    <KamiButton to="/macros">VER MACROS</KamiButton>
                </article>

                <article class="site-painel-atalho">
                    <p class="site-eyebrow">CONFIGURAÇÕES</p>
                    <h2 class="site-painel-atalho__titulo">Sua conta.</h2>
                    <p class="site-painel-atalho__texto">Atualize o nome de usuário e a senha da sua conta do site.</p>
                    <KamiButton to="/configuracoes">ABRIR CONFIGURAÇÕES</KamiButton>
                </article>
            </section>
        </template>
    </div>
</template>
