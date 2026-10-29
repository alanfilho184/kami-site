<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
    name: 'KamiLoading',
    props: {
        text: {
            type: String,
            default: 'CARREGANDO'
        }
    }
});
</script>

<template>
    <div
        class="kami-loading"
        role="status"
    >
        <span
            class="kami-spinner"
            aria-hidden="true"
        ></span>
        <span>{{ text }}</span>
    </div>
</template>
