<script lang="ts">
import { defineComponent, type PropType } from 'vue';

type Status = 'ok' | 'warn' | 'danger' | 'live' | 'dim';

export default defineComponent({
    name: 'KamiChip',
    props: {
        status: {
            type: String as PropType<Status>,
            default: 'dim'
        },
        text: {
            type: String,
            default: ''
        }
    }
});
</script>

<template>
    <span :class="['kami-chip', `kami-chip--${status}`]">
        <span
            class="kami-chip__dot"
            aria-hidden="true"
        ></span>
        <slot>{{ text }}</slot>
    </span>
</template>
