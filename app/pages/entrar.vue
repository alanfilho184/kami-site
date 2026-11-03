<script lang="ts">
import { defineNuxtComponent, useHead, useRoute } from '#app';

const allowedRedirects = ['/painel', '/fichas', '/ao-vivo', '/macros', '/configuracoes'];

function sanitizeRedirect(value: unknown): string {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
        return '/painel';
    }

    const allowed = allowedRedirects.some(
        prefix => value === prefix || value.startsWith(`${prefix}/`) || value.startsWith(`${prefix}?`)
    );

    return allowed ? value : '/painel';
}

function errorStatus(error: unknown): number | null {
    if (!error || typeof error !== 'object' || !('statusCode' in error)) {
        return null;
    }

    const status = Number((error as { statusCode?: unknown }).statusCode);
    return Number.isFinite(status) ? status : null;
}

export default defineNuxtComponent({
    name: 'LoginPage',
    setup() {
        const route = useRoute();

        useHead({
            title: 'Entrar - Kami',
            meta: [
                {
                    name: 'description',
                    content: 'Entre na sua conta do Kami com e-mail e senha.'
                },
                { name: 'robots', content: 'noindex, nofollow' }
            ]
        });

        return {
            redirectTarget: sanitizeRedirect(route.query.redirecionar)
        };
    },
    data() {
        return {
            email: '',
            password: '',
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
            this.isSubmitting = true;

            try {
                await $fetch('/api/auth/login', {
                    method: 'POST',
                    body: {
                        email: this.email,
                        password: this.password
                    }
                });

                window.location.assign(this.redirectTarget);
            } catch (error) {
                const status = errorStatus(error);

                if (status === 429) {
                    this.errorMessage = 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
                } else if (status === 503) {
                    this.errorMessage = 'Serviço indisponível. Tente novamente em instantes.';
                } else {
                    this.errorMessage = 'E-mail ou senha inválidos.';
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
                <h1 class="site-auth__titulo">ENTRE NA SUA CONTA.</h1>
                <p class="site-prosa site-auth__descricao">
                    Use o e-mail e a senha da sua conta do Kami. A sessão fica neste navegador e pode ser encerrada a
                    qualquer momento.
                </p>
                <p class="site-auth__nota">
                    Sua conta foi criada pelo Discord e ainda não tem senha? O primeiro acesso pelo site será liberado
                    em uma próxima etapa.
                </p>
            </div>

            <KamiPanel
                label="ACESSO"
                code="AUTH"
            >
                <div
                    class="site-auth__form"
                    role="form"
                    aria-label="Acesso à conta"
                >
                    <div :class="['kami-field', { 'kami-field--invalid': errorMessage }]">
                        <label
                            class="kami-field__label kami-field__label--required"
                            for="entrar-email"
                        >
                            E-MAIL
                        </label>
                        <input
                            id="entrar-email"
                            v-model="email"
                            class="kami-input"
                            type="email"
                            name="email"
                            autocomplete="email"
                            required
                            :aria-invalid="Boolean(errorMessage)"
                            :aria-describedby="errorMessage ? 'entrar-erro' : undefined"
                            @keydown.enter.prevent="handleSubmit"
                        />
                    </div>

                    <div :class="['kami-field', { 'kami-field--invalid': errorMessage }]">
                        <label
                            class="kami-field__label kami-field__label--required"
                            for="entrar-senha"
                        >
                            SENHA
                        </label>
                        <input
                            id="entrar-senha"
                            v-model="password"
                            class="kami-input"
                            type="password"
                            name="password"
                            autocomplete="current-password"
                            required
                            :aria-invalid="Boolean(errorMessage)"
                            :aria-describedby="errorMessage ? 'entrar-erro' : undefined"
                            @keydown.enter.prevent="handleSubmit"
                        />
                    </div>

                    <p
                        v-if="errorMessage"
                        id="entrar-erro"
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
                        {{ isSubmitting ? 'ENTRANDO...' : 'ENTRAR' }}
                    </KamiButton>

                    <NuxtLink
                        class="site-auth__link"
                        to="/cadastrar"
                    >
                        AINDA NÃO TEM CONTA? CRIAR CONTA
                    </NuxtLink>
                </div>
            </KamiPanel>
        </div>
    </div>
</template>
