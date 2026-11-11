<script lang="ts">
import { defineNuxtComponent, useHead } from '#app';

function errorStatus(error: unknown): number | null {
    if (!error || typeof error !== 'object' || !('statusCode' in error)) {
        return null;
    }

    const status = Number((error as { statusCode?: unknown }).statusCode);
    return Number.isFinite(status) ? status : null;
}

function serverErrorMessage(error: unknown): string | null {
    if (!error || typeof error !== 'object' || !('data' in error)) {
        return null;
    }

    const data = (error as { data?: unknown }).data;

    if (!data || typeof data !== 'object' || !('message' in data)) {
        return null;
    }

    const message = (data as { message?: unknown }).message;
    return typeof message === 'string' ? message : null;
}

export default defineNuxtComponent({
    name: 'RegisterPage',
    setup() {
        useHead({
            title: 'Criar conta - Kami',
            meta: [
                {
                    name: 'description',
                    content: 'Crie sua conta no Kami com e-mail e senha.'
                },
                { name: 'robots', content: 'noindex, nofollow' }
            ]
        });
    },
    data() {
        return {
            username: '',
            email: '',
            password: '',
            passwordConfirmation: '',
            acceptedTerms: false,
            isSubmitting: false,
            errorMessage: ''
        };
    },
    methods: {
        async handleSubmit(): Promise<void> {
            if (this.isSubmitting) {
                return;
            }

            this.errorMessage = '';

            const username = this.username.trim();

            if (username.length < 3 || username.length > 32) {
                this.errorMessage = 'O nome de usuário deve ter entre 3 e 32 caracteres.';
                return;
            }

            if (!/^[a-zA-Z0-9_]+$/.test(username)) {
                this.errorMessage = 'Use apenas letras, números e underline no nome de usuário.';
                return;
            }

            if (this.password.length < 8) {
                this.errorMessage = 'A senha precisa ter pelo menos 8 caracteres.';
                return;
            }

            if (this.password !== this.passwordConfirmation) {
                this.errorMessage = 'As senhas não coincidem.';
                return;
            }

            if (!this.acceptedTerms) {
                this.errorMessage = 'Aceite os termos e a política de privacidade para criar a conta.';
                return;
            }

            this.isSubmitting = true;

            try {
                await $fetch('/api/auth/register', {
                    method: 'POST',
                    body: {
                        username: username,
                        email: this.email,
                        password: this.password,
                        acceptedTerms: true
                    }
                });

                window.location.assign('/painel');
            } catch (error) {
                const status = errorStatus(error);

                if (status === 409) {
                    this.errorMessage = serverErrorMessage(error) ?? 'Este e-mail ou nome de usuário já está em uso.';
                } else if (status === 429) {
                    this.errorMessage = 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
                } else if (status === 503) {
                    this.errorMessage = 'Serviço indisponível. Tente novamente em instantes.';
                } else {
                    this.errorMessage = 'Confira os dados e tente novamente.';
                }
            } finally {
                this.isSubmitting = false;
            }
        }
    }
});
</script>

<template>
    <div class="site-container site-auth">
        <div class="site-auth__interno">
            <div class="site-auth__texto">
                <p class="site-eyebrow">ÁREA DO JOGADOR</p>
                <h1 class="site-auth__titulo">CRIE SUA CONTA.</h1>
                <p class="site-prosa site-auth__descricao">
                    É rápido: escolha um e-mail e uma senha para acessar o painel. A verificação de e-mail será
                    adicionada em uma próxima etapa.
                </p>
                <p class="site-auth__nota">
                    A conta do site pode ser vinculada à sua conta do Discord no futuro. Por enquanto, ela serve para
                    entrar e acompanhar a área do jogador.
                </p>
            </div>

            <KamiPanel
                label="CADASTRO"
                code="AUTH"
            >
                <div
                    class="site-auth__form"
                    role="form"
                    aria-label="Criar conta"
                >
                    <div :class="['kami-field', { 'kami-field--invalid': errorMessage }]">
                        <label
                            class="kami-field__label kami-field__label--required"
                            for="cadastro-usuario"
                        >
                            NOME DE USUÁRIO
                        </label>
                        <input
                            id="cadastro-usuario"
                            v-model="username"
                            class="kami-input"
                            type="text"
                            name="username"
                            autocomplete="username"
                            minlength="3"
                            maxlength="32"
                            pattern="[A-Za-z0-9_]+"
                            required
                            aria-describedby="cadastro-usuario-dica"
                            :aria-invalid="Boolean(errorMessage)"
                            @keydown.enter.prevent="handleSubmit"
                        />
                        <p
                            id="cadastro-usuario-dica"
                            class="kami-field__hint"
                        >
                            3 a 32 caracteres: letras, números e underline.
                        </p>
                    </div>

                    <div :class="['kami-field', { 'kami-field--invalid': errorMessage }]">
                        <label
                            class="kami-field__label kami-field__label--required"
                            for="cadastro-email"
                        >
                            E-MAIL
                        </label>
                        <input
                            id="cadastro-email"
                            v-model="email"
                            class="kami-input"
                            type="email"
                            name="email"
                            autocomplete="email"
                            required
                            :aria-invalid="Boolean(errorMessage)"
                            :aria-describedby="errorMessage ? 'cadastro-erro' : undefined"
                            @keydown.enter.prevent="handleSubmit"
                        />
                    </div>

                    <div :class="['kami-field', { 'kami-field--invalid': errorMessage }]">
                        <label
                            class="kami-field__label kami-field__label--required"
                            for="cadastro-senha"
                        >
                            SENHA
                        </label>
                        <input
                            id="cadastro-senha"
                            v-model="password"
                            class="kami-input"
                            type="password"
                            name="password"
                            autocomplete="new-password"
                            minlength="8"
                            required
                            aria-describedby="cadastro-senha-dica"
                            :aria-invalid="Boolean(errorMessage)"
                            @keydown.enter.prevent="handleSubmit"
                        />
                        <p
                            id="cadastro-senha-dica"
                            class="kami-field__hint"
                        >
                            Mínimo de 8 caracteres.
                        </p>
                    </div>

                    <div :class="['kami-field', { 'kami-field--invalid': errorMessage }]">
                        <label
                            class="kami-field__label kami-field__label--required"
                            for="cadastro-senha-confirmacao"
                        >
                            CONFIRME A SENHA
                        </label>
                        <input
                            id="cadastro-senha-confirmacao"
                            v-model="passwordConfirmation"
                            class="kami-input"
                            type="password"
                            name="passwordConfirmation"
                            autocomplete="new-password"
                            minlength="8"
                            required
                            :aria-invalid="Boolean(errorMessage)"
                            @keydown.enter.prevent="handleSubmit"
                        />
                    </div>

                    <label class="site-auth__termos">
                        <input
                            v-model="acceptedTerms"
                            type="checkbox"
                            name="acceptedTerms"
                        />
                        <span>
                            Li e aceito os
                            <a
                                href="/termos"
                                target="_blank"
                                rel="noopener noreferrer"
                                >TERMOS</a
                            >
                            e a
                            <a
                                href="/privacidade"
                                target="_blank"
                                rel="noopener noreferrer"
                                >POLÍTICA DE PRIVACIDADE</a
                            ><span class="kami-sr-only"> (abre em nova aba)</span>.
                        </span>
                    </label>

                    <p
                        v-if="errorMessage"
                        id="cadastro-erro"
                        class="kami-field__error site-auth__erro"
                        role="alert"
                    >
                        {{ errorMessage }}
                    </p>

                    <KamiButton
                        variant="primary"
                        size="lg"
                        type="button"
                        block
                        :disabled="isSubmitting"
                        @click="handleSubmit"
                    >
                        {{ isSubmitting ? 'CRIANDO...' : 'CRIAR CONTA' }}
                    </KamiButton>

                    <NuxtLink
                        class="site-auth__link"
                        to="/entrar"
                    >
                        JÁ TENHO CONTA? ENTRAR
                    </NuxtLink>
                </div>
            </KamiPanel>
        </div>
    </div>
</template>
