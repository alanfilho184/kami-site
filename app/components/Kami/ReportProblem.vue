<script lang="ts">
import { defineComponent } from 'vue';
import {
    focusDialog,
    lockDialogScroll,
    rememberDialogFocus,
    restoreDialogFocus,
    trapDialogTab,
    unlockDialogScroll
} from '~/utils/dialog';
import { notify } from '~/utils/notify';
import { errorStatus, serverErrorMessage } from '~~/shared/utils/http-error';

export default defineComponent({
    name: 'KamiReportProblem',
    data() {
        return {
            open: false,
            message: '',
            error: '',
            sending: false
        };
    },
    beforeUnmount() {
        if (this.open) {
            unlockDialogScroll();
            restoreDialogFocus();
        }
    },
    methods: {
        openDialog(): void {
            if (this.open) {
                return;
            }

            rememberDialogFocus();
            lockDialogScroll();
            this.open = true;
            this.error = '';

            void this.$nextTick(() => {
                const dialog = this.$refs.dialog as HTMLElement | undefined;

                focusDialog(dialog ?? null);
                document.getElementById('report-message')?.focus();
            });
        },
        closeDialog(): void {
            if (!this.open || this.sending) {
                return;
            }

            this.open = false;
            this.error = '';
            unlockDialogScroll();
            restoreDialogFocus();
        },
        handleKeydown(event: KeyboardEvent): void {
            if (event.key === 'Escape') {
                event.preventDefault();
                this.closeDialog();
                return;
            }

            const dialog = this.$refs.dialog as HTMLElement | undefined;

            if (dialog) {
                trapDialogTab(event, dialog);
            }
        },
        async submit(): Promise<void> {
            if (this.sending) {
                return;
            }

            const message = this.message.trim();

            if (message.length < 10) {
                this.error = 'Descreva o problema com pelo menos 10 caracteres.';
                return;
            }

            this.sending = true;
            this.error = '';

            try {
                await $fetch('/api/suporte/reportar', {
                    method: 'POST',
                    body: {
                        message,
                        page: window.location.href
                    }
                });

                this.message = '';
                this.sending = false;
                this.closeDialog();
                notify.success('REPORTE ENVIADO.');
            } catch (error) {
                const status = errorStatus(error);
                this.sending = false;
                this.error =
                    serverErrorMessage(error) ??
                    (status === 429
                        ? 'Muitos reportes em pouco tempo. Aguarde alguns minutos.'
                        : 'Não foi possível enviar o reporte. Tente novamente em instantes.');
            }
        }
    }
});
</script>

<template>
    <KamiButton
        class="site-topbar__reportar"
        size="sm"
        @click="openDialog"
    >
        <span class="site-topbar__label-longo">REPORTAR PROBLEMA</span>
        <span class="site-topbar__label-curto">REPORTAR</span>
    </KamiButton>

    <Teleport to="body">
        <template v-if="open">
            <div
                class="site-report__fundo"
                aria-hidden="true"
                @click="closeDialog"
            ></div>
            <section
                ref="dialog"
                class="site-report"
                role="dialog"
                aria-modal="true"
                aria-labelledby="report-titulo"
                tabindex="-1"
                @keydown="handleKeydown"
            >
                <header class="site-report__topo">
                    <div>
                        <p class="site-eyebrow">SUPORTE</p>
                        <h2
                            id="report-titulo"
                            class="site-report__titulo"
                        >
                            REPORTAR PROBLEMA
                        </h2>
                    </div>
                    <button
                        type="button"
                        class="site-report__fechar"
                        aria-label="Fechar reporte"
                        :disabled="sending"
                        @click="closeDialog"
                    >
                        <KamiIcon
                            name="x"
                            :size="16"
                        />
                    </button>
                </header>

                <p class="site-prosa">
                    Descreva o que aconteceu. A página atual será incluída no reporte para facilitar a análise.
                </p>

                <div class="kami-field">
                    <label
                        class="kami-field__label kami-field__label--required"
                        for="report-message"
                    >
                        O QUE ACONTECEU?
                    </label>
                    <textarea
                        id="report-message"
                        v-model="message"
                        class="kami-input site-report__texto"
                        rows="6"
                        maxlength="2000"
                        aria-describedby="report-dica"
                        :disabled="sending"
                    ></textarea>
                    <p
                        id="report-dica"
                        class="kami-field__hint"
                    >
                        {{ message.length }} / 2000
                    </p>
                </div>

                <p
                    v-if="error"
                    class="kami-field__error"
                    role="alert"
                >
                    {{ error }}
                </p>

                <p class="site-report__aviso">O texto será enviado para a equipe do Kami no Discord.</p>

                <div class="site-report__acoes">
                    <KamiButton
                        variant="primary"
                        :disabled="sending || message.trim().length < 10"
                        @click="submit"
                    >
                        {{ sending ? 'ENVIANDO...' : 'ENVIAR REPORTE' }}
                    </KamiButton>
                    <KamiButton
                        :disabled="sending"
                        @click="closeDialog"
                    >
                        CANCELAR
                    </KamiButton>
                </div>
            </section>
        </template>
    </Teleport>
</template>
