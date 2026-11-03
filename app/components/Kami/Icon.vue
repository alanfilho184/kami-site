<script lang="ts">
import { defineComponent, type PropType } from 'vue';

export type KamiIconName =
    | 'arrow-down'
    | 'arrow-left'
    | 'arrow-up'
    | 'check'
    | 'chevron-left'
    | 'chevron-right'
    | 'copy'
    | 'dashboard'
    | 'eye'
    | 'file'
    | 'grip'
    | 'minus'
    | 'plus'
    | 'radio'
    | 'rotate-ccw'
    | 'search'
    | 'settings'
    | 'terminal'
    | 'trash'
    | 'x';

/**
 * Ícones internos em SVG 24x24. O traço usa `currentColor`, então a cor vem do
 * botão ou do texto ao redor. Não use `v-html`: os caminhos são estáticos e
 * ficam no bundle.
 */
const iconPaths: Record<KamiIconName, string[]> = {
    'arrow-down': ['M12 5v14', 'm19 12-7 7-7-7'],
    'arrow-left': ['M19 12H5', 'm12 19-7-7 7-7'],
    'arrow-up': ['M12 19V5', 'm5 12 7-7 7 7'],
    check: ['M20 6 9 17l-5-5'],
    'chevron-left': ['m15 18-6-6 6-6'],
    'chevron-right': ['m9 18 6-6-6-6'],
    copy: ['M8 8h12v12H8z', 'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2'],
    dashboard: ['M3 3h7v9H3z', 'M14 3h7v5h-7z', 'M14 12h7v9h-7z', 'M3 16h7v5H3z'],
    eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
    file: [
        'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
        'M14 2v6h6',
        'M16 13H8',
        'M16 17H8',
        'M10 9H8'
    ],
    grip: ['M9 5h.01', 'M9 12h.01', 'M9 19h.01', 'M15 5h.01', 'M15 12h.01', 'M15 19h.01'],
    minus: ['M5 12h14'],
    plus: ['M12 5v14', 'M5 12h14'],
    radio: [
        'M4.9 19.1a10 10 0 0 1 0-14.2',
        'M7.8 16.2a6 6 0 0 1 0-8.4',
        'M16.2 7.8a6 6 0 0 1 0 8.4',
        'M19.1 4.9a10 10 0 0 1 0 14.2',
        'M12 12h.01'
    ],
    'rotate-ccw': ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
    search: ['M21 21l-4.34-4.34', 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z'],
    settings: [
        'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
        'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'
    ],
    terminal: ['m4 17 6-6-6-6', 'M12 19h8'],
    trash: [
        'M3 6h18',
        'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
        'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
        'M10 11v6',
        'M14 11v6'
    ],
    x: ['M18 6 6 18', 'M6 6l12 12']
};

export default defineComponent({
    name: 'KamiIcon',
    props: {
        name: {
            type: String as PropType<KamiIconName>,
            required: true
        },
        size: {
            type: Number,
            default: 24
        },
        label: {
            type: String,
            default: ''
        }
    },
    computed: {
        paths(): string[] {
            return iconPaths[this.name] ?? [];
        }
    }
});
</script>

<template>
    <svg
        class="kami-icon"
        :width="size"
        :height="size"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        :role="label ? 'img' : undefined"
        :aria-label="label || undefined"
        :aria-hidden="label ? undefined : 'true'"
    >
        <path
            v-for="(path, index) in paths"
            :key="index"
            :d="path"
        />
    </svg>
</template>
