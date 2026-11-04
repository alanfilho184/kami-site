<script lang="ts">
import { defineNuxtComponent, useHead } from '#app';
import { computed, type PropType } from 'vue';
import type { SheetDetail } from '~~/shared/types/sheet';
import { errorStatus } from '~~/shared/utils/http-error';

export default defineNuxtComponent({
    name: 'KamiPublicSheetView',
    props: {
        sheet: {
            type: Object as PropType<SheetDetail | null>,
            default: null
        },
        requiresPassword: {
            type: Boolean,
            default: false
        },
        unavailable: {
            type: Boolean,
            default: false
        },
        userId: {
            type: Number,
            required: true
        },
        sheetName: {
            type: String,
            required: true
        },
        preferredId: {
            type: Number as PropType<number | null>,
            default: null
        }
    },
    setup(props) {
        useHead({
            title: computed(() => (props.sheet ? `${props.sheet.name} - Kami` : 'Ficha - Kami')),
            meta: [
                {
                    name: 'description',
                    content: 'Ficha de personagem compartilhada no Kami.'
                },
                { name: 'robots', content: 'noindex, nofollow' }
            ]
        });
    },
    data() {
        return {
            password: '',
            passwordError: '',
            submitting: false
        };
    },
    methods: {
        accessUrl(): string {
            const path = `/api/ficha/${this.userId}/${encodeURIComponent(this.sheetName)}/acesso`;

            return this.preferredId ? `${path}?id=${this.preferredId}` : path;
        },
        async submitPassword(): Promise<void> {
            if (this.submitting || !this.password) {
                return;
            }

            this.submitting = true;
            this.passwordError = '';

            try {
                await $fetch(this.accessUrl(), {
                    method: 'POST',
                    body: { password: this.password }
                });

                window.location.reload();
            } catch (error) {
                const status = errorStatus(error);

                if (status === 429) {
                    this.passwordError = 'Muitas tentativas. Aguarde alguns minutos.';
                } else if (status === 403) {
                    this.passwordError = 'Senha incorreta.';
                } else if (status === 404) {
                    this.passwordError = 'Ficha não encontrada.';
                } else {
                    this.passwordError = 'Não foi possível liberar a ficha. Tente novamente.';
                }
            } finally {
                this.submitting = false;
            }
        }
    }
});
</script>

<template>
    <div class="site-container site-ficha-publica">
        <KamiEmptyState
            v-if="unavailable"
            title="FICHA INDISPONÍVEL"
            description="Não foi possível carregar esta ficha agora. Tente novamente em instantes."
            error
        >
            <template #action>
                <KamiButton
                    to="/"
                    size="lg"
                >
                    VOLTAR AO KAMI
                </KamiButton>
            </template>
        </KamiEmptyState>

        <section
            v-else-if="requiresPassword"
            class="site-ficha-publica__acesso"
            aria-labelledby="ficha-protegida-titulo"
        >
            <p class="site-eyebrow">FICHA PROTEGIDA</p>
            <h1
                id="ficha-protegida-titulo"
                class="site-ficha-publica__titulo"
            >
                Esta ficha precisa de senha.
            </h1>
            <p class="site-prosa site-ficha-publica__texto">
                Peça a senha a quem compartilhou o link. O acesso fica liberado por uma hora neste navegador.
            </p>

            <form
                class="site-ficha-publica__form"
                @submit.prevent="submitPassword"
            >
                <label
                    class="kami-field__label"
                    for="ficha-senha"
                >
                    SENHA
                </label>
                <input
                    id="ficha-senha"
                    v-model="password"
                    class="kami-input"
                    type="password"
                    autocomplete="current-password"
                    maxlength="128"
                    required
                />
                <p
                    v-if="passwordError"
                    class="site-ficha-publica__erro"
                    role="alert"
                >
                    {{ passwordError }}
                </p>
                <KamiButton
                    type="submit"
                    variant="primary"
                    size="lg"
                    :disabled="submitting || !password"
                >
                    {{ submitting ? 'VERIFICANDO...' : 'ABRIR FICHA' }}
                </KamiButton>
            </form>
        </section>

        <template v-else-if="sheet">
            <header class="site-ficha-publica__topo">
                <div>
                    <p class="site-eyebrow">FICHA PÚBLICA</p>
                    <h1 class="site-ficha-publica__titulo">{{ sheet.name }}</h1>
                </div>
                <KamiChip
                    v-if="sheet.isLive"
                    status="live"
                >
                    AO VIVO
                </KamiChip>
            </header>

            <KamiSheetView
                :name="sheet.name"
                :attributes="sheet.attributes"
                :layout="sheet.layout"
                view-mode="documento"
                :show-toggle="false"
            />

            <footer class="site-ficha-publica__rodape">
                <span>FICHA COMPARTILHADA NO KAMI</span>
                <KamiButton
                    to="/"
                    size="sm"
                >
                    CONHECER O KAMI
                </KamiButton>
            </footer>
        </template>
    </div>
</template>
