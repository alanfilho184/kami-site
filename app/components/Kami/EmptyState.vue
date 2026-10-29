<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
    name: 'KamiEmptyState',
    props: {
        title: {
            type: String,
            default: 'SEM DADOS'
        },
        description: {
            type: String,
            default: ''
        },
        error: {
            type: Boolean,
            default: false
        }
    }
});
</script>

<template>
    <div
        :class="['kami-empty', { 'kami-empty--danger': error }]"
        :role="error ? 'alert' : 'status'"
    >
        <p class="kami-empty__title">{{ title }}</p>
        <p v-if="description">{{ description }}</p>
        <slot name="action"></slot>
    </div>
</template>
