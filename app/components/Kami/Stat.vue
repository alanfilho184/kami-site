<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import { formatNumber } from '~~/shared/utils/formatting';

type Status = 'ok' | 'warn' | 'danger' | 'dim';

export default defineComponent({
    name: 'KamiStat',
    props: {
        code: {
            type: String,
            required: true
        },
        label: {
            type: String,
            required: true
        },
        value: {
            type: [String, Number] as PropType<string | number | null>,
            default: null
        },
        unit: {
            type: String,
            default: ''
        },
        sub: {
            type: String,
            default: ''
        },
        status: {
            type: String as PropType<Status>,
            default: 'ok'
        }
    },
    computed: {
        displayValue(): string {
            if (this.value === null || this.value === undefined || this.value === '') {
                return '-';
            }

            return typeof this.value === 'number' ? formatNumber(this.value) : String(this.value);
        },
        valueClass(): string {
            return `site-estatistica__valor--${this.status}`;
        }
    }
});
</script>

<template>
    <article class="kami-stat site-estatistica">
        <span class="kami-stat__code">{{ code }}</span>
        <p class="kami-stat__label">{{ label }}</p>
        <p :class="['kami-stat__value', 'site-estatistica__valor', valueClass]">
            {{ displayValue
            }}<span
                v-if="unit"
                class="kami-stat__unit"
                >{{ unit }}</span
            >
        </p>
        <p
            v-if="sub"
            class="kami-stat__sub"
        >
            {{ sub }}
        </p>
        <div
            v-if="$slots.footer"
            class="kami-stat__foot"
        >
            <slot name="footer"></slot>
        </div>
    </article>
</template>
