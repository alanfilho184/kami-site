<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { SheetBarValue } from '~~/shared/types/sheet';

/** Acima disso a barra segmentada volta para o preenchimento liso. */
const BAR_SEGMENTS_MAX = 60;

/**
 * Trilho de barra compartilhado pelo editor e pela ficha. Concentra cor,
 * fundo, preenchimento liso/segmentado e o alerta piscante.
 */
export default defineComponent({
    name: 'KamiBarTrack',
    props: {
        value: {
            type: Object as PropType<SheetBarValue>,
            required: true
        },
        label: {
            type: String,
            default: ''
        }
    },
    computed: {
        percent(): number {
            const span = this.value.max - this.value.min;

            if (!Number.isFinite(span) || span <= 0) {
                return 0;
            }

            return Math.min(100, Math.max(0, ((this.value.actual - this.value.min) / span) * 100));
        },
        segmentCount(): number {
            const total = Math.trunc(this.value.max - this.value.min);

            if (!Number.isFinite(total) || total < 1 || total > BAR_SEGMENTS_MAX) {
                return 0;
            }

            return total;
        },
        filled(): number {
            return Math.max(0, Math.min(this.segmentCount, Math.trunc(this.value.actual - this.value.min)));
        },
        segmented(): boolean {
            return this.value.pattern === 'segmented' && this.segmentCount > 0;
        },
        alert(): boolean {
            if (this.value.blink === false) {
                return false;
            }

            const below = typeof this.value.flashBelow === 'number' ? this.value.flashBelow : 25;

            return this.percent < below;
        },
        style(): Record<string, string> {
            const style: Record<string, string> = {};

            if (typeof this.value.color === 'string' && /^#[0-9a-f]{6}$/i.test(this.value.color)) {
                style['--bar-color'] = this.value.color.toLowerCase();
            }

            if (typeof this.value.background === 'string' && /^#[0-9a-f]{6}$/i.test(this.value.background)) {
                style['--bar-bg'] = this.value.background.toLowerCase();
            }

            return style;
        }
    }
});
</script>

<template>
    <div
        class="site-sheetview__barra-trilho"
        :class="{ 'site-sheetview__barra-trilho--alerta': alert }"
        :style="style"
        role="meter"
        :aria-label="label"
        :aria-valuemin="value.min"
        :aria-valuemax="value.max"
        :aria-valuenow="value.actual"
    >
        <div
            v-if="segmented"
            class="site-sheetview__barra-segmentos"
            aria-hidden="true"
        >
            <span
                v-for="segment in segmentCount"
                :key="segment"
                class="site-sheetview__barra-segmento"
                :class="{ 'site-sheetview__barra-segmento--cheio': segment <= filled }"
            ></span>
        </div>
        <span
            v-else
            class="site-sheetview__barra-preenchimento"
            :style="{ width: `${percent}%` }"
        ></span>
    </div>
</template>
