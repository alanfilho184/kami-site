<script lang="ts">
import { defineNuxtComponent, useHead, useRequestFetch } from '#app';
import type { AuthResponse, AuthUser } from '~~/shared/types/auth';

export default defineNuxtComponent({
    name: 'LogoutPage',
    setup() {
        useHead({
            title: 'Sair - Kami',
            meta: [
                {
                    name: 'description',
                    content: 'Encerrar a sessão no Kami.'
                },
                { name: 'robots', content: 'noindex, nofollow' }
            ]
        });
    },
    async asyncData() {
        const requestFetch = useRequestFetch();
        const session = await requestFetch<AuthResponse>('/api/auth/session').catch(() => null);

        return {
            user: session?.user ?? null
        };
    },
    data() {
        return {
            user: null as AuthUser | null,
            isLoggingOut: false,
            errorMessage: ''
        };
    },
    methods: {
        async handleLogout(): Promise<void> {
            if (this.isLoggingOut) {
                return;
            }

            this.errorMessage = '';
            this.isLoggingOut = true;

            try {
                await $fetch('/api/auth/logout', { method: 'POST' });
                window.location.assign('/');
            } catch {
                this.errorMessage = 'Não foi possível encerrar a sessão. Tente novamente.';
            } finally {
                this.isLoggingOut = false;
            }
        }
    }
});
</script>

<template>
    <div class="site-container site-auth site-sair">
        <KamiPanel
            label="SESSÃO"
            code="AUTH"
        >
            <template v-if="user">
                <h1 class="site-sair__titulo">SAIR DA CONTA?</h1>
                <p class="site-prosa site-sair__texto">
                    Você está conectado como <strong>{{ user.username || user.email }}</strong
                    >. A sessão será encerrada neste navegador.
                </p>

                <p
                    v-if="errorMessage"
                    class="kami-field__error site-sair__erro"
                    role="alert"
                >
                    {{ errorMessage }}
                </p>

                <div class="site-sair__acoes">
                    <KamiButton
                        variant="danger"
                        :disabled="isLoggingOut"
                        @click="handleLogout"
                    >
                        {{ isLoggingOut ? 'SAINDO...' : 'SAIR DA CONTA' }}
                    </KamiButton>
                    <KamiButton to="/painel">VOLTAR AO PAINEL</KamiButton>
                </div>
            </template>

            <template v-else>
                <h1 class="site-sair__titulo">VOCÊ NÃO ESTÁ CONECTADO.</h1>
                <p class="site-prosa site-sair__texto">Entre na sua conta para acessar o painel do Kami.</p>

                <div class="site-sair__acoes">
                    <KamiButton
                        variant="primary"
                        to="/entrar"
                    >
                        ENTRAR
                    </KamiButton>
                    <KamiButton to="/">VOLTAR AO INÍCIO</KamiButton>
                </div>
            </template>
        </KamiPanel>
    </div>
</template>
