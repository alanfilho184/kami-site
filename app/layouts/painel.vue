<script lang="ts">
import { defineComponent } from 'vue';
import type { FooterLink } from '~/components/Kami/Footer.vue';
import type { KamiIconName } from '~/components/Kami/Icon.vue';

interface PanelNavLink {
    label: string;
    shortLabel: string;
    href: string;
    icon: KamiIconName;
}

const panelLinks: PanelNavLink[] = [
    { label: 'VISÃO GERAL', shortLabel: 'PAINEL', href: '/painel', icon: 'dashboard' },
    { label: 'FICHAS', shortLabel: 'FICHAS', href: '/fichas', icon: 'file' },
    { label: 'AO VIVO', shortLabel: 'AO VIVO', href: '/ao-vivo', icon: 'radio' },
    { label: 'MACROS', shortLabel: 'MACROS', href: '/macros', icon: 'terminal' },
    { label: 'CONFIGURAÇÕES', shortLabel: 'AJUSTES', href: '/configuracoes', icon: 'settings' }
];

export default defineComponent({
    name: 'PanelLayout',
    data() {
        const config = useRuntimeConfig();

        return {
            discordUrl: String(config.public.discordInvite ?? ''),
            panelLinks
        };
    },
    computed: {
        isEditor(): boolean {
            return this.$route.path.startsWith('/fichas/') || /^\/\d+\/ficha(?:\/|$)/.test(this.$route.path);
        },
        isReading(): boolean {
            return this.isEditor && this.$route.query.ver === '1';
        },
        footerLinks(): FooterLink[] {
            const links: FooterLink[] = [
                { label: 'PAINEL', href: '/painel' },
                { label: 'TERMOS', href: '/termos' },
                { label: 'PRIVACIDADE', href: '/privacidade' }
            ];

            if (this.discordUrl) {
                links.push({ label: 'SUPORTE', href: this.discordUrl, external: true });
            }

            return links;
        }
    }
});
</script>

<template>
    <div
        class="kami-shell site-painel-shell"
        :class="{ 'site-painel-shell--editor': isEditor && !isReading }"
    >
        <div
            class="kami-topline"
            aria-hidden="true"
        ></div>
        <a
            class="site-pular"
            href="#content"
        >
            IR PARA O CONTEÚDO
        </a>
        <KamiTopbar
            :class="{ 'site-topbar--editor': isEditor }"
            :links="[]"
            support="SUPORTE"
            :discord-url="discordUrl"
            cta="SAIR"
            short-cta="SAIR"
            cta-to="/sair"
            cta-variant="default"
        />

        <nav
            class="site-painel-nav"
            :class="{ 'site-painel-nav--editor': isEditor }"
            aria-label="Navegação do painel"
        >
            <div
                class="site-container site-painel-nav__interno"
                :class="{ 'site-painel-nav__interno--editor': isEditor }"
            >
                <NuxtLink
                    v-for="link in panelLinks"
                    :key="link.href"
                    :to="link.href"
                    class="site-painel-nav__link"
                    active-class="site-painel-nav__link--ativo"
                >
                    <KamiIcon
                        :name="link.icon"
                        :size="20"
                    />
                    <span class="site-painel-nav__label">{{ link.label }}</span>
                    <span class="site-painel-nav__short">{{ link.shortLabel }}</span>
                </NuxtLink>
            </div>
        </nav>

        <main
            id="content"
            :class="[
                'site-conteudo',
                'site-container',
                'site-painel-conteudo',
                { 'site-painel-conteudo--editor': isEditor }
            ]"
            tabindex="-1"
        >
            <slot />
        </main>

        <KamiFooter
            :links="footerLinks"
            tagline="FICHAS DE RPG PERSONALIZÁVEIS"
        />
    </div>
</template>
