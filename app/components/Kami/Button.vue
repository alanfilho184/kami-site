<script lang="ts">
import { defineComponent, type PropType } from 'vue';

type Variant = 'default' | 'primary' | 'solid' | 'danger';
type Size = 'md' | 'sm' | 'lg';

const variantClasses: Record<Variant, string> = {
    default: '',
    primary: 'kami-btn--primary',
    solid: 'kami-btn--solid',
    danger: 'kami-btn--danger'
};

export default defineComponent({
    name: 'KamiButton',
    inheritAttrs: false,
    props: {
        variant: {
            type: String as PropType<Variant>,
            default: 'default'
        },
        size: {
            type: String as PropType<Size>,
            default: 'md'
        },
        block: {
            type: Boolean,
            default: false
        },
        disabled: {
            type: Boolean,
            default: false
        },
        type: {
            type: String as PropType<'button' | 'submit' | 'reset'>,
            default: 'button'
        },
        to: {
            type: String as PropType<string | null>,
            default: null
        },
        href: {
            type: String as PropType<string | null>,
            default: null
        },
        external: {
            type: Boolean,
            default: false
        }
    },
    computed: {
        classes(): string[] {
            return [
                'kami-btn',
                variantClasses[this.variant],
                this.size === 'sm' ? 'kami-btn--sm' : '',
                this.size === 'lg' ? 'kami-btn--lg' : '',
                this.block ? 'kami-btn--block' : ''
            ].filter(Boolean);
        },
        isExternal(): boolean {
            return this.external || Boolean(this.href && /^https?:\/\//.test(this.href));
        }
    }
});
</script>

<template>
    <NuxtLink
        v-if="to"
        :to="to"
        :class="classes"
        v-bind="$attrs"
    >
        <slot />
    </NuxtLink>
    <a
        v-else-if="href"
        :href="href"
        :class="classes"
        :target="isExternal ? '_blank' : undefined"
        :rel="isExternal ? 'noopener noreferrer' : undefined"
        v-bind="$attrs"
    >
        <slot />
        <span
            v-if="isExternal"
            class="kami-sr-only"
        >
            &nbsp;(abre em nova aba)
        </span>
    </a>
    <button
        v-else
        :type="type"
        :class="classes"
        :disabled="disabled"
        v-bind="$attrs"
    >
        <slot />
    </button>
</template>
