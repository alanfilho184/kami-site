<script lang="ts">
import { defineComponent, type PropType } from 'vue';

export interface TopbarLink {
    label: string;
    href: string;
}

export default defineComponent({
    name: 'KamiTopbar',
    props: {
        subtitle: {
            type: String,
            default: 'FICHAS DE RPG PERSONALIZÁVEIS'
        },
        cta: {
            type: String,
            default: 'ADICIONAR O KAMI'
        },
        shortCta: {
            type: String,
            default: 'ADICIONAR'
        },
        support: {
            type: String,
            default: 'SUPORTE'
        },
        botInvite: {
            type: String,
            default: ''
        },
        discordUrl: {
            type: String,
            default: ''
        },
        links: {
            type: Array as PropType<TopbarLink[]>,
            default: () => []
        }
    }
});
</script>

<template>
    <header class="kami-topbar site-topbar">
        <div class="site-container kami-topbar__inner">
            <NuxtLink
                to="/"
                class="kami-topbar__brand site-marca"
            >
                <img
                    src="/marca/logo-120.webp"
                    alt=""
                    width="40"
                    height="40"
                    class="site-marca__imagem"
                    fetchpriority="high"
                />
                <span>
                    <span class="kami-topbar__title">KAMI</span>
                    <span class="kami-topbar__sub">{{ subtitle }}</span>
                </span>
            </NuxtLink>

            <nav
                v-if="links.length"
                class="site-topbar__nav"
                aria-label="Navegação principal"
            >
                <NuxtLink
                    v-for="link in links"
                    :key="link.href"
                    :to="link.href"
                    class="site-topbar__link"
                >
                    {{ link.label }}
                </NuxtLink>
            </nav>

            <div class="kami-topbar__actions">
                <KamiButton
                    v-if="discordUrl"
                    class="site-topbar__suporte"
                    size="sm"
                    :href="discordUrl"
                    external
                >
                    {{ support }}
                </KamiButton>
                <KamiButton
                    v-if="botInvite"
                    variant="primary"
                    size="sm"
                    :href="botInvite"
                    external
                >
                    <span class="site-topbar__cta-longo">{{ cta }}</span>
                    <span class="site-topbar__cta-curto">{{ shortCta }}</span>
                </KamiButton>
            </div>
        </div>
    </header>
</template>
