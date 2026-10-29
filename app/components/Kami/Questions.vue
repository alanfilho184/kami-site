<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { FaqItem } from '~~/shared/content/landing/pt-br';

export default defineComponent({
    name: 'KamiQuestions',
    props: {
        items: {
            type: Array as PropType<FaqItem[]>,
            required: true
        }
    }
});
</script>

<template>
    <div class="site-faq">
        <details
            v-for="item in items"
            :key="item.question"
            class="site-faq__item"
        >
            <summary class="site-faq__pergunta">
                <span>{{ item.question }}</span>
                <span
                    class="site-faq__sinal"
                    aria-hidden="true"
                ></span>
            </summary>
            <p class="site-faq__resposta">{{ item.answer }}</p>
        </details>
    </div>
</template>
