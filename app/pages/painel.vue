<script lang="ts">
import { defineNuxtComponent, useHead, useRequestFetch } from '#app';
import type { KamiIconName } from '~/components/Kami/Icon.vue';
import { SHEET_LIMIT_FREE } from '~~/shared/constants/sheet';
import type { PanelResponse } from '~~/shared/types/panel';
import { errorStatus } from '~~/shared/utils/http-error';
import { formatDate, formatNumber } from '~~/shared/utils/formatting';

interface PanelAccessItem {
    code: string;
    label: string;
    value: string;
    sub: string;
    href: string;
    icon: KamiIconName;
}

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
        sheetLimitLabel(): string {
            return this.panel?.account.isPremium ? 'ILIMITADO' : `${SHEET_LIMIT_FREE} FICHAS`;
        },
        accessItems(): PanelAccessItem[] {
            if (!this.panel) {
                return [];
            }

            return [
                {
                    code: '01',
                    label: 'FICHAS',
                    value: formatNumber(this.panel.summary.sheets),
                    sub: this.panel.account.isPremium ? 'sem limite' : `limite de ${SHEET_LIMIT_FREE}`,
                    href: '/fichas',
                    icon: 'file'
                },
                {
                    code: '02',
                    label: 'PÚBLICAS',
                    value: formatNumber(this.panel.summary.publicSheets),
                    sub: 'compartilhadas',
                    href: '/fichas?filtro=publicas',
                    icon: 'eye'
                },
                {
                    code: '03',
                    label: 'AO VIVO',
                    value: formatNumber(this.panel.summary.liveSheets),
                    sub: 'vinculadas ao Discord',
                    href: '/ao-vivo',
                    icon: 'radio'
                },
                {
                    code: '04',
                    label: 'MACROS',
                    value: formatNumber(this.panel.summary.macros),
                    sub: 'em desenvolvimento',
                    href: '/macros',
                    icon: 'terminal'
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
            <header class="site-painel-hero site-painel-hero--comando">
                <div class="site-painel-hero__conteudo">
                    <p class="site-eyebrow">ÁREA DO JOGADOR</p>
                    <h1 class="site-painel__titulo">PAINEL.</h1>
                    <p class="site-prosa site-painel__descricao">
                        Bem-vindo de volta, {{ displayName }}. Acompanhe suas fichas, o que está ao vivo e os próximos
                        passos do Kami.
                    </p>
                </div>

                <div class="site-painel-hero__acoes">
                    <KamiButton
                        variant="primary"
                        to="/fichas?nova=1"
                    >
                        NOVA FICHA
                    </KamiButton>
                    <KamiButton to="/fichas">VER TODAS AS FICHAS</KamiButton>
                </div>
            </header>

            <section
                class="site-painel-acessos"
                aria-label="Acessos rápidos"
            >
                <NuxtLink
                    v-for="item in accessItems"
                    :key="item.code"
                    :to="item.href"
                    class="site-painel-acesso"
                >
                    <span class="site-painel-acesso__topo">
                        <span class="site-painel-acesso__icone">
                            <KamiIcon
                                :name="item.icon"
                                :size="18"
                            />
                        </span>
                        <span class="site-painel-acesso__codigo">{{ item.code }}</span>
                    </span>
                    <span class="site-painel-acesso__label">{{ item.label }}</span>
                    <span class="site-painel-acesso__valor">{{ item.value }}</span>
                    <span class="site-painel-acesso__sub">{{ item.sub }}</span>
                    <span
                        class="site-painel-acesso__seta"
                        aria-hidden="true"
                    >
                        →
                    </span>
                </NuxtLink>
            </section>

            <div class="site-painel-grid">
                <KamiPanel label="CONTINUAR DE ONDE PAROU">
                    <template #header>
                        <NuxtLink
                            to="/fichas"
                            class="site-painel-panel-link"
                        >
                            VER TODAS
                            <span aria-hidden="true">→</span>
                        </NuxtLink>
                    </template>

                    <ul
                        v-if="panel.recentSheets.length"
                        class="site-painel-lista site-painel-lista--recentes"
                    >
                        <li
                            v-for="sheet in panel.recentSheets"
                            :key="sheet.id"
                            class="site-painel-lista__item site-painel-lista__item--link"
                        >
                            <NuxtLink
                                :to="`/fichas/${sheet.id}`"
                                class="site-painel-lista__link"
                            >
                                <div class="site-painel-lista__principal">
                                    <p class="site-painel-lista__nome">{{ sheet.name }}</p>
                                    <p class="site-painel-lista__meta">
                                        ATUALIZADA EM {{ formatUpdatedAt(sheet.updatedAt) }}
                                    </p>
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
                                <span class="site-painel-lista__abrir">
                                    ABRIR
                                    <span aria-hidden="true">→</span>
                                </span>
                            </NuxtLink>
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
                                to="/fichas?nova=1"
                            >
                                CRIAR PRIMEIRA FICHA
                            </KamiButton>
                        </template>
                    </KamiEmptyState>
                </KamiPanel>

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
                        <KamiChip
                            v-if="panel.account.isPremium"
                            status="ok"
                        >
                            PREMIUM · SEM LIMITE
                        </KamiChip>
                    </div>

                    <dl class="site-conta__dados">
                        <div>
                            <dt>MEMBRO DESDE</dt>
                            <dd>{{ memberSince }}</dd>
                        </div>
                        <div>
                            <dt>DISCORD</dt>
                            <dd>{{ panel.account.discordLinked ? 'VINCULADO' : 'NÃO VINCULADO' }}</dd>
                        </div>
                        <div>
                            <dt>LIMITE DE FICHAS</dt>
                            <dd>{{ sheetLimitLabel }}</dd>
                        </div>
                    </dl>

                    <div class="site-conta__acoes">
                        <KamiButton
                            size="sm"
                            to="/configuracoes"
                        >
                            CONFIGURAÇÕES
                        </KamiButton>
                        <KamiButton
                            size="sm"
                            variant="danger"
                            :disabled="isLoggingOut"
                            @click="handleLogout"
                        >
                            {{ isLoggingOut ? 'SAINDO...' : 'SAIR DA CONTA' }}
                        </KamiButton>
                    </div>
                </KamiPanel>
            </div>
        </template>
    </div>
</template>
