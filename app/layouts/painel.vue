<script lang="ts">
import { defineComponent } from 'vue';
import type { FooterLink } from '~/components/Kami/Footer.vue';

interface PanelNavLink {
    label: string;
    href: string;
}

const panelLinks: PanelNavLink[] = [
    { label: 'VISÃO GERAL', href: '/painel' },
    { label: 'FICHAS', href: '/fichas' },
    { label: 'AO VIVO', href: '/ao-vivo' },
    { label: 'MACROS', href: '/macros' },
    { label: 'CONFIGURAÇÕES', href: '/configuracoes' }
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
            return this.$route.path.startsWith('/fichas/');
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
    <div class="kami-shell site-painel-shell">
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
                    {{ link.label }}
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
