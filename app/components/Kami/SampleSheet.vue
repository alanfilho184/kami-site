<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { LandingContent } from '~~/shared/content/landing/pt-br';

type SampleData = LandingContent['sample'];

export default defineComponent({
    name: 'KamiSampleSheet',
    props: {
        data: {
            type: Object as PropType<SampleData>,
            required: true
        }
    }
});
</script>

<template>
    <KamiPanel class="site-ficha">
        <div class="site-ficha__selo">
            <KamiTag class="site-ficha__tag">AMOSTRA</KamiTag>
            <span class="site-ficha__etiqueta">{{ data.tag }}</span>
        </div>

        <KamiSheetView
            :name="data.name"
            :attributes="data.attributes"
            :layout="data.layout"
            view-mode="documento"
            :show-toggle="false"
        />

        <footer class="site-ficha__rodape">
            <span>{{ data.footer }}</span>
            <span>FICHA DE EXEMPLO</span>
        </footer>
    </KamiPanel>
</template>
