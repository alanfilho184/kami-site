<script lang="ts">
import { defineNuxtComponent, type NuxtError } from '#app';
import { landing } from '~~/shared/content/landing/pt-br';
import type { FooterLink } from '~/components/Kami/Footer.vue';

export default defineNuxtComponent({
    name: 'ErrorPage',
    props: {
        error: {
            type: Object as () => NuxtError,
            required: true
        }
    },
    data() {
        const config = useRuntimeConfig();

        return {
            botInvite: String(config.public.botInvite ?? ''),
            discordUrl: String(config.public.discordInvite ?? ''),
            topbarLinks: landing.topbar.links,
            topbarSubtitle: landing.topbar.subtitle,
            topbarCta: landing.topbar.cta
        };
    },
    head() {
        return {
            title: 'Erro - Kami'
        };
    },
    computed: {
        statusCode(): number {
            return this.error.statusCode || 500;
        },
        title(): string {
            if (this.statusCode === 404) {
                return 'ROTA NÃO ENCONTRADA';
            }

            if (this.statusCode === 410) {
                return 'CONTEÚDO REMOVIDO';
            }

            return 'FALHA NO SITE';
        },
        description(): string {
            if (this.statusCode === 404) {
                return 'O endereço que você tentou abrir não existe ou mudou de lugar. Volte para a página inicial para conhecer o Kami.';
            }

            if (this.statusCode === 410) {
                return 'Esta página foi retirada permanentemente. As informações do Kami agora estão na página inicial.';
            }

            return 'O site encontrou um problema ao processar esta requisição. Tente novamente em alguns instantes.';
        },
        footerLinks(): FooterLink[] {
            const links: FooterLink[] = [
                { label: 'TERMOS', href: '/termos' },
                { label: 'PRIVACIDADE', href: '/privacidade' }
            ];

            if (this.discordUrl) {
                links.push({ label: 'SUPORTE', href: this.discordUrl, external: true });
            }

            return links;
        }
    },
    methods: {
        backToHome(): void {
            clearError({ redirect: '/' });
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
        <KamiTopbar
            :bot-invite="botInvite"
            :subtitle="topbarSubtitle"
            :cta="topbarCta"
            :links="topbarLinks"
        />
        <main class="site-container site-erro">
            <p class="site-eyebrow">ERRO / {{ statusCode }}</p>
            <h1 class="site-erro__titulo">{{ title }}</h1>
            <p class="site-prosa site-erro__texto">{{ description }}</p>
            <KamiButton
                variant="primary"
                size="lg"
                @click="backToHome"
            >
                VOLTAR AO INÍCIO
            </KamiButton>
        </main>
        <KamiFooter
            :links="footerLinks"
            :tagline="topbarSubtitle"
        />
    </div>
</template>
