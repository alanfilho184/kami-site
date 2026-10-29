<script lang="ts">
import { defineComponent } from 'vue';
import { landing } from '~~/shared/content/landing/pt-br';
import type { FooterLink } from '~/components/Kami/Footer.vue';

export default defineComponent({
    name: 'DefaultLayout',
    data() {
        const config = useRuntimeConfig();

        return {
            botInvite: String(config.public.botInvite ?? ''),
            discordUrl: String(config.public.discordInvite ?? ''),
            topbarLinks: landing.topbar.links,
            topbarSubtitle: landing.topbar.subtitle,
            topbarCta: landing.topbar.cta,
            topbarShortCta: landing.topbar.shortCta,
            topbarSupport: landing.topbar.support
        };
    },
    computed: {
        footerLinks(): FooterLink[] {
            const links: FooterLink[] = [
                { label: 'RECURSOS', href: '/#recursos' },
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
    <div class="kami-shell">
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
            :bot-invite="botInvite"
            :discord-url="discordUrl"
            :subtitle="topbarSubtitle"
            :cta="topbarCta"
            :short-cta="topbarShortCta"
            :support="topbarSupport"
            :links="topbarLinks"
        />
        <main
            id="content"
            class="site-conteudo"
            tabindex="-1"
        >
            <slot />
        </main>
        <KamiFooter
            :links="footerLinks"
            :tagline="topbarSubtitle"
        />
    </div>
</template>
