<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
    name: 'KamiPanel',
    props: {
        label: {
            type: String,
            default: ''
        },
        code: {
            type: String,
            default: ''
        },
        dense: {
            type: Boolean,
            default: false
        },
        flush: {
            type: Boolean,
            default: false
        }
    },
    computed: {
        classes(): string[] {
            return ['kami-panel', this.dense ? 'kami-panel--dense' : '', this.flush ? 'kami-panel--flush' : ''].filter(
                Boolean
            );
        },
        hasHeader(): boolean {
            return Boolean(this.label || this.code || this.$slots.header);
        }
    }
});
</script>

<template>
    <section :class="classes">
        <header
            v-if="hasHeader"
            class="kami-panel__head"
        >
            <span
                class="kami-panel__tick"
                aria-hidden="true"
            ></span>
            <h2
                v-if="label"
                class="kami-panel__label"
            >
                {{ label }}
            </h2>
            <slot name="header"></slot>
            <span
                v-if="code"
                class="kami-panel__code"
            >
                {{ code }}
            </span>
        </header>
        <div class="kami-panel__body">
            <slot />
        </div>
    </section>
</template>
