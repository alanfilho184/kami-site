<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
    name: 'KamiSection',
    props: {
        label: {
            type: String,
            required: true
        },
        meta: {
            type: String,
            default: ''
        }
    }
});
</script>

<template>
    <div class="kami-section">
        <span
            class="kami-section__mark"
            aria-hidden="true"
        ></span>
        <h2 class="kami-section__label">
            {{ label }}
        </h2>
        <span
            class="kami-section__rule"
            aria-hidden="true"
        ></span>
        <span
            v-if="meta"
            class="kami-section__meta"
        >
            {{ meta }}
        </span>
    </div>
</template>
