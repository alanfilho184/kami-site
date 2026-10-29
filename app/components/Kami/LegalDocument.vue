<script lang="ts">
import { defineNuxtComponent, useHead, useRuntimeConfig } from '#app';
import type { PropType } from 'vue';
import { legalReviewPending, type LegalDocument } from '~~/shared/content/legal/types';

export default defineNuxtComponent({
    name: 'KamiLegalDocument',
    props: {
        document: {
            type: Object as PropType<LegalDocument>,
            required: true
        },
        route: {
            type: String,
            required: true
        }
    },
    setup(props) {
        const config = useRuntimeConfig();
        const siteUrl = String(config.public.siteUrl || 'https://kamiapp.com.br').replace(/\/+$/, '');
        const url = `${siteUrl}${props.route}`;
        const locale = props.document.language === 'PT-BR' ? 'pt_BR' : 'en_US';

        useHead({
            title: `${props.document.title} - Kami`,
            htmlAttrs: { lang: props.document.language === 'PT-BR' ? 'pt-BR' : 'en-US' },
            link: [{ rel: 'canonical', href: url }],
            meta: [
                { name: 'description', content: props.document.summary },
                { name: 'robots', content: 'index, follow' },
                { property: 'og:type', content: 'article' },
                { property: 'og:site_name', content: 'Kami' },
                { property: 'og:title', content: `${props.document.title} - Kami` },
                { property: 'og:description', content: props.document.summary },
                { property: 'og:url', content: url },
                { property: 'og:locale', content: locale }
            ]
        });
    },
    data() {
        const config = useRuntimeConfig();

        return {
            discordUrl: String(config.public.discordInvite ?? ''),
            reviewPending: legalReviewPending
        };
    }
});
</script>

<template>
    <article class="site-documento">
        <header class="site-documento__cabecalho">
            <div class="site-documento__topo">
                <p class="site-eyebrow">KAMI / {{ document.language }}</p>
                <KamiButton
                    class="site-documento__idioma"
                    :to="document.languageRoute"
                    :lang="document.language === 'PT-BR' ? 'en-US' : 'pt-BR'"
                    size="sm"
                >
                    {{ document.languageLabel }}
                </KamiButton>
            </div>
            <h1 class="site-documento__titulo">{{ document.title }}</h1>
            <p class="site-prosa">{{ document.summary }}</p>
            <div class="site-documento__meta">
                <span>ATUALIZADO EM {{ document.updatedAt }}</span>
                <span aria-hidden="true">·</span>
                <span>{{ document.language }}</span>
            </div>
            <p
                v-if="reviewPending"
                class="site-documento__aviso"
            >
                {{
                    document.language === 'PT-BR'
                        ? 'DOCUMENTO EM REVISÃO EDITORIAL. SE PRECISAR DA VERSÃO VIGENTE, FALE COM O SUPORTE.'
                        : 'EDITORIAL REVIEW PENDING. IF YOU NEED THE CURRENT VERSION, CONTACT SUPPORT.'
                }}
            </p>
        </header>

        <div class="site-documento__secoes">
            <section
                v-for="section in document.sections"
                :key="section.title"
                class="site-documento__secao"
            >
                <h2>{{ section.title }}</h2>
                <p
                    v-for="paragraph in section.paragraphs"
                    :key="paragraph"
                >
                    {{ paragraph }}
                </p>
            </section>
        </div>

        <footer
            v-if="discordUrl"
            class="site-documento__rodape"
        >
            <KamiButton
                :href="discordUrl"
                external
            >
                SUPORTE
            </KamiButton>
        </footer>
    </article>
</template>
