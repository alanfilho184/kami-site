<script lang="ts">
import { defineComponent, type PropType } from 'vue';

export interface FooterLink {
    label: string;
    href: string;
    external?: boolean;
}

export default defineComponent({
    name: 'KamiFooter',
    props: {
        links: {
            type: Array as PropType<FooterLink[]>,
            default: () => []
        },
        tagline: {
            type: String,
            default: 'FICHAS DE RPG PERSONALIZÁVEIS'
        }
    },
    computed: {
        year(): number {
            return new Date().getFullYear();
        }
    }
});
</script>

<template>
    <footer class="site-rodape">
        <div class="site-container site-rodape__interno">
            <div class="site-rodape__marca">
                <p class="site-rodape__assinatura">
                    <span class="kami-accent">KAMI</span>
                    <span class="site-rodape__separador">/</span>
                    {{ tagline }}
                </p>
                <p class="site-rodape__nota">FEITO PARA A SUA MESA</p>
            </div>

            <nav
                v-if="links.length"
                class="site-rodape__links"
                aria-label="Links do rodapé"
            >
                <template
                    v-for="link in links"
                    :key="link.href"
                >
                    <a
                        v-if="link.external"
                        :href="link.href"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {{ link.label }}
                        <span class="kami-sr-only">&nbsp;(abre em nova aba)</span>
                    </a>
                    <NuxtLink
                        v-else
                        :to="link.href"
                    >
                        {{ link.label }}
                    </NuxtLink>
                </template>
            </nav>

            <p class="site-rodape__meta kami-mono">© {{ year }}</p>
        </div>
    </footer>
</template>
