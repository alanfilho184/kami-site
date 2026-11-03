<script lang="ts">
import { defineNuxtComponent, useRequestEvent, useRequestFetch } from '#app';
import { landing } from '~~/shared/content/landing/pt-br';
import type { AuthResponse, AuthUser } from '~~/shared/types/auth';
import type { FooterLink } from '~/components/Kami/Footer.vue';

export default defineNuxtComponent({
    name: 'DefaultLayout',
    async asyncData() {
        if (import.meta.server) {
            const event = useRequestEvent();
            return {
                user: event?.context.auth?.user ?? null
            };
        }

        const requestFetch = useRequestFetch();
        const session = await requestFetch<AuthResponse>('/api/auth/session').catch(() => null);

        return {
            user: session?.user ?? null
        };
    },
    data() {
        const config = useRuntimeConfig();

        return {
            user: null as AuthUser | null,
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
            :discord-url="discordUrl"
            :subtitle="topbarSubtitle"
            :cta="user ? 'PAINEL' : topbarCta"
            :short-cta="user ? 'PAINEL' : topbarShortCta"
            :cta-to="user ? '/painel' : '/entrar'"
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
