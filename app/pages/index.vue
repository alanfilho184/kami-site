<script lang="ts">
import { defineNuxtComponent, useHead, useRequestURL, useRuntimeConfig } from '#app';
import { landing, type StatItem } from '~~/shared/content/landing/pt-br';
import type { StatisticsData, StatisticsResponse } from '~~/shared/types/statistics';
import { formatDateTime, formatNumber } from '~~/shared/utils/formatting';

export default defineNuxtComponent({
    name: 'HomePage',
    setup() {
        const requestUrl = useRequestURL();
        const siteUrl = requestUrl.origin.replace(/\/+$/, '');
        const url = `${siteUrl}/`;
        const image = `${siteUrl}/og/kami-site.png`;

        useHead({
            title: landing.meta.title,
            link: [{ rel: 'canonical', href: url }],
            meta: [
                { name: 'description', content: landing.meta.description },
                { property: 'og:type', content: 'website' },
                { property: 'og:site_name', content: 'Kami' },
                { property: 'og:title', content: landing.meta.ogTitle },
                { property: 'og:description', content: landing.meta.ogDescription },
                { property: 'og:url', content: url },
                { property: 'og:image', content: image },
                { property: 'og:image:type', content: 'image/png' },
                { property: 'og:image:width', content: '1200' },
                { property: 'og:image:height', content: '630' },
                { property: 'og:image:alt', content: 'Kami - fichas de RPG personalizáveis' },
                { property: 'og:locale', content: 'pt_BR' },
                { name: 'twitter:card', content: 'summary_large_image' },
                { name: 'twitter:title', content: landing.meta.ogTitle },
                { name: 'twitter:description', content: landing.meta.ogDescription },
                { name: 'twitter:image', content: image }
            ]
        });
    },
    async asyncData() {
        const config = useRuntimeConfig();
        const statistics = await $fetch<StatisticsResponse>('/api/estatisticas', {
            ignoreResponseError: true
        }).catch(() => null);

        return {
            statistics,
            botInvite: String(config.public.botInvite ?? ''),
            discordUrl: String(config.public.discordInvite ?? ''),
            content: landing
        };
    },
    data() {
        return {
            statistics: null as StatisticsResponse | null,
            botInvite: '',
            discordUrl: '',
            content: landing
        };
    },
    computed: {
        statisticsData(): StatisticsData | null {
            if (!this.statistics?.available || !this.statistics.data) {
                return null;
            }

            return this.statistics.data;
        },
        statisticsUnavailable(): boolean {
            return this.statisticsData === null;
        },
        updateText(): string {
            if (!this.statistics?.available || !this.statistics.updatedAt) {
                return this.content.stats.unavailableNote;
            }

            const prefix = this.statistics.expired ? 'ÚLTIMA LEITURA VÁLIDA EM' : this.content.stats.updatedNote;

            return `${prefix} ${formatDateTime(this.statistics.updatedAt)}`;
        },
        statisticsLegend(): string {
            if (this.statistics?.expired) {
                return `${this.content.stats.legend} · CACHE DE EMERGÊNCIA`;
            }

            return this.content.stats.legend;
        }
    },
    methods: {
        statisticValue(key: StatItem['key']): string {
            if (!this.statisticsData) {
                return '-';
            }

            return formatNumber(this.statisticsData[key]);
        }
    }
});
</script>

<template>
    <div>
        <section class="site-hero">
            <div class="site-container site-hero__interno">
                <div class="site-hero__grade">
                    <div class="site-hero__texto">
                        <header class="site-hero__cabecalho">
                            <p class="site-eyebrow">{{ content.hero.eyebrow }}</p>
                            <h1 class="site-hero__titulo">
                                <span
                                    v-for="line in content.hero.titleLines"
                                    :key="line"
                                >
                                    {{ line }}
                                </span>
                            </h1>
                        </header>

                        <p class="site-prosa site-hero__descricao">{{ content.hero.description }}</p>

                        <div class="site-hero__acoes">
                            <KamiButton
                                v-if="botInvite"
                                variant="primary"
                                size="lg"
                                :href="botInvite"
                                external
                            >
                                {{ content.hero.primaryCta }}
                            </KamiButton>
                            <KamiButton
                                size="lg"
                                href="#ficha"
                            >
                                {{ content.hero.secondaryCta }}
                            </KamiButton>
                        </div>

                        <p class="site-hero__nota">{{ content.hero.note }}</p>
                    </div>

                    <KamiTablePreview class="site-hero__previa" />
                </div>
            </div>
        </section>

        <section
            class="site-faixa"
            aria-labelledby="statistics-title"
        >
            <div class="site-container">
                <div class="site-faixa__topo">
                    <p
                        id="statistics-title"
                        class="site-eyebrow"
                    >
                        {{ content.stats.label }}
                    </p>
                    <p class="site-faixa__meta">{{ updateText }}</p>
                </div>

                <dl class="site-faixa__numeros">
                    <div
                        v-for="item in content.stats.items"
                        :key="item.key"
                    >
                        <dt>{{ item.label }}</dt>
                        <dd>
                            <span
                                :class="[
                                    'site-faixa__valor',
                                    { 'site-faixa__valor--indisponivel': statisticsUnavailable }
                                ]"
                            >
                                {{ statisticValue(item.key) }}
                            </span>
                            <span class="site-faixa__sub">{{ item.sub }}</span>
                        </dd>
                    </div>
                </dl>

                <p class="site-faixa__legenda">{{ statisticsLegend }}</p>
            </div>
        </section>

        <section
            id="recursos"
            class="site-container site-bloco"
        >
            <header class="site-secao">
                <div class="site-secao__linha">
                    <p class="site-eyebrow">{{ content.features.label }}</p>
                    <span class="site-secao__meta">{{ content.features.meta }}</span>
                </div>
                <h2 class="site-secao__titulo">{{ content.features.title }}</h2>
                <p class="site-prosa site-secao__texto">{{ content.features.description }}</p>
            </header>

            <div class="site-recursos">
                <article
                    v-for="feature in content.features.items"
                    :key="feature.code"
                    class="site-recurso"
                >
                    <div class="site-recurso__topo">
                        <span class="site-recurso__codigo">{{ feature.code }}</span>
                        <span class="site-recurso__rotulo">{{ feature.label }}</span>
                    </div>
                    <h3 class="site-recurso__titulo">{{ feature.title }}</h3>
                    <p class="site-recurso__texto">{{ feature.text }}</p>
                    <ul class="site-recurso__detalhes">
                        <li
                            v-for="detail in feature.details"
                            :key="detail"
                        >
                            {{ detail }}
                        </li>
                    </ul>
                </article>
            </div>

            <div class="site-roadmap">
                <div class="site-roadmap__topo">
                    <KamiChip status="warn">ROADMAP</KamiChip>
                    <span class="site-roadmap__meta">{{ content.features.roadmap.label }}</span>
                </div>

                <div class="site-roadmap__itens">
                    <article
                        v-for="item in content.features.roadmap.items"
                        :key="item.title"
                        class="site-roadmap__item"
                    >
                        <div class="site-roadmap__item-topo">
                            <span :class="['site-roadmap__status', `site-roadmap__status--${item.state}`]">
                                {{ item.status }}
                            </span>
                            <span class="site-roadmap__codigo">{{ item.code }}</span>
                        </div>
                        <h3 class="site-roadmap__titulo">{{ item.title }}</h3>
                        <p class="site-roadmap__texto">{{ item.text }}</p>
                        <ul class="site-roadmap__detalhes">
                            <li
                                v-for="detail in item.details"
                                :key="detail"
                            >
                                {{ detail }}
                            </li>
                        </ul>
                    </article>
                </div>
            </div>
        </section>

        <section
            id="ficha"
            class="site-container site-bloco"
        >
            <header class="site-secao site-secao--split">
                <div class="site-secao">
                    <div class="site-secao__linha">
                        <p class="site-eyebrow">{{ content.sample.label }}</p>
                        <span class="site-secao__meta">{{ content.sample.meta }}</span>
                    </div>
                    <h2 class="site-secao__titulo">Veja como é uma ficha por dentro.</h2>
                </div>
                <p class="site-prosa">
                    Uma ficha fictícia, montada com os cinco tipos de atributo. Os dados são demonstrativos; a sua ficha
                    começa em branco e cresce do jeito que o seu sistema pede.
                </p>
            </header>

            <KamiSampleSheet :data="content.sample" />
        </section>

        <section
            id="como-funciona"
            class="site-container site-bloco"
        >
            <header class="site-secao">
                <div class="site-secao__linha">
                    <p class="site-eyebrow">{{ content.howItWorks.label }}</p>
                    <span class="site-secao__meta">{{ content.howItWorks.meta }}</span>
                </div>
                <h2 class="site-secao__titulo">{{ content.howItWorks.title }}</h2>
            </header>

            <ol class="site-passos">
                <li
                    v-for="step in content.howItWorks.steps"
                    :key="step.code"
                >
                    <span class="site-passos__codigo">{{ step.code }}</span>
                    <h3>{{ step.title }}</h3>
                    <p>{{ step.text }}</p>
                </li>
            </ol>

            <p class="site-passos__nota">{{ content.howItWorks.note }}</p>
        </section>

        <section
            id="perguntas"
            class="site-container site-bloco"
        >
            <div class="site-faq-grade">
                <header class="site-secao">
                    <div class="site-secao__linha">
                        <p class="site-eyebrow">{{ content.faq.label }}</p>
                        <span class="site-secao__meta">{{ content.faq.meta }}</span>
                    </div>
                    <h2 class="site-secao__titulo">{{ content.faq.title }}</h2>
                </header>

                <KamiQuestions :items="content.faq.items" />
            </div>
        </section>

        <section class="site-container site-bloco">
            <div class="site-cta">
                <div>
                    <p class="site-eyebrow">{{ content.finalCta.label }}</p>
                    <h2 class="site-cta__titulo">{{ content.finalCta.title }}</h2>
                    <p class="site-cta__texto">{{ content.finalCta.text }}</p>
                </div>
                <div class="site-cta__acoes">
                    <KamiButton
                        v-if="botInvite"
                        variant="primary"
                        size="lg"
                        :href="botInvite"
                        external
                    >
                        {{ content.finalCta.cta }}
                    </KamiButton>
                    <KamiButton
                        v-if="discordUrl"
                        size="lg"
                        :href="discordUrl"
                        external
                    >
                        {{ content.finalCta.secondaryCta }}
                    </KamiButton>
                </div>
            </div>
        </section>
    </div>
</template>
