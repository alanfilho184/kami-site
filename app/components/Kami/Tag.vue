<script lang="ts">
import { defineComponent, type PropType } from 'vue';

type Variant = 'default' | 'accent' | 'warn' | 'danger';

const variants: Record<Variant, string> = {
    default: '',
    accent: 'kami-tag--accent',
    warn: 'kami-tag--warn',
    danger: 'kami-tag--danger'
};

export default defineComponent({
    name: 'KamiTag',
    props: {
        variant: {
            type: String as PropType<Variant>,
            default: 'default'
        }
    },
    computed: {
        classes(): string[] {
            return ['kami-tag', variants[this.variant]].filter(Boolean);
        }
    }
});
</script>

<template>
    <span :class="classes">
        <slot />
    </span>
</template>
