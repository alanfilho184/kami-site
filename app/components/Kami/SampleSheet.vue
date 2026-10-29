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

        <div class="site-ficha__topo">
            <div class="site-ficha__identidade">
                <h3 class="site-ficha__nome">{{ data.name }}</h3>
                <p class="site-ficha__resumo">{{ data.summary }}</p>

                <dl class="site-ficha__campos">
                    <div>
                        <dt>ORIGEM</dt>
                        <dd>{{ data.origin }}</dd>
                    </div>
                    <div>
                        <dt>CONCEITO</dt>
                        <dd>{{ data.concept }}</dd>
                    </div>
                </dl>

                <span class="site-ficha__tipo">DESCRIÇÃO</span>
                <p class="site-ficha__descricao">{{ data.description }}</p>
            </div>

            <figure class="site-ficha__retrato">
                <img
                    :src="data.portrait.src"
                    :alt="data.portrait.alt"
                    width="720"
                    height="900"
                    loading="lazy"
                />
                <figcaption>IMAGEM</figcaption>
            </figure>
        </div>

        <div class="site-ficha__grade">
            <section class="site-ficha__bloco site-ficha__bloco--atributos">
                <header class="site-ficha__bloco-topo">
                    <h4>ATRIBUTOS</h4>
                    <span>NÚMERO</span>
                </header>
                <dl class="site-ficha__atributos">
                    <div
                        v-for="attribute in data.attributes"
                        :key="attribute.name"
                    >
                        <dt>{{ attribute.name }}</dt>
                        <dd>{{ attribute.value }}</dd>
                    </div>
                </dl>
            </section>

            <section class="site-ficha__bloco">
                <header class="site-ficha__bloco-topo">
                    <h4>RECURSOS</h4>
                    <span>BARRA</span>
                </header>
                <div class="site-ficha__recursos">
                    <div
                        v-for="bar in data.resources"
                        :key="bar.name"
                        class="kami-gauge kami-gauge--compact"
                    >
                        <div class="kami-gauge__head">
                            <span class="kami-gauge__caption">{{ bar.name }}</span>
                            <span class="kami-gauge__value">{{ bar.current }} / {{ bar.max }}</span>
                        </div>
                        <div
                            class="kami-gauge__track"
                            role="meter"
                            :aria-label="bar.name"
                            :aria-valuemin="bar.min"
                            :aria-valuemax="bar.max"
                            :aria-valuenow="bar.current"
                        >
                            <div class="kami-gauge__cells">
                                <span
                                    v-for="cell in bar.max"
                                    :key="cell"
                                    :class="['kami-gauge__cell', cell <= bar.current ? 'kami-gauge__cell--on' : '']"
                                ></span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section class="site-ficha__bloco">
                <header class="site-ficha__bloco-topo">
                    <h4>INVENTÁRIO</h4>
                    <span>LISTA</span>
                </header>
                <ul class="site-ficha__inventario">
                    <li
                        v-for="item in data.inventory"
                        :key="item.name"
                    >
                        <span>{{ item.name }}</span>
                        <span class="site-ficha__quantidade">{{ item.quantity }}</span>
                    </li>
                </ul>
            </section>

            <section class="site-ficha__bloco site-ficha__bloco--notas">
                <header class="site-ficha__bloco-topo">
                    <h4>ANOTAÇÕES</h4>
                    <span>TEXTO</span>
                </header>
                <p class="site-ficha__anotacao">{{ data.notes }}</p>
            </section>
        </div>

        <footer class="site-ficha__rodape">
            <span>{{ data.footer }}</span>
            <span>FICHA DE EXEMPLO</span>
        </footer>
    </KamiPanel>
</template>
