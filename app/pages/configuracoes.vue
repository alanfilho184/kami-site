<script lang="ts">
import { defineNuxtComponent, useHead, useRequestFetch } from '#app';
import type { AccountResponse, PanelAccount } from '~~/shared/types/panel';
import { formatDate } from '~~/shared/utils/formatting';
import { errorStatus, serverErrorMessage } from '~~/shared/utils/http-error';

const usernamePattern = /^[a-zA-Z0-9_]+$/;

export default defineNuxtComponent({
    name: 'SettingsPage',
    setup() {
        useHead({
            title: 'Configurações - Kami',
            meta: [
                {
                    name: 'description',
                    content: 'Configurações da sua conta no Kami.'
                },
                { name: 'robots', content: 'noindex, nofollow' }
            ]
        });
    },
    async asyncData() {
        const requestFetch = useRequestFetch();

        try {
            const response = await requestFetch<AccountResponse>('/api/conta');
            return {
                account: response.account,
                username: response.account.username ?? '',
                needsLogin: false,
                isUnavailable: false
            };
        } catch (error) {
            const status = errorStatus(error);
            return {
                account: null,
                username: '',
                needsLogin: status === 401,
                isUnavailable: status !== 401
            };
        }
    },
    data() {
        return {
            account: null as PanelAccount | null,
            username: '',
            needsLogin: false,
            isUnavailable: false,
            isSaving: false,
            profileMessage: '',
            profileError: '',
            currentPassword: '',
            newPassword: '',
            confirmation: '',
            isChangingPassword: false,
            passwordMessage: '',
            passwordError: ''
        };
    },
    computed: {
        memberSince(): string {
            return this.account ? formatDate(this.account.createdAt) : '-';
        },
        discordLabel(): string {
            return this.account?.discordLinked ? 'VINCULADO' : 'NÃO VINCULADO';
        }
    },
    methods: {
        async handleProfileSubmit(): Promise<void> {
            if (this.isSaving) {
                return;
            }

            this.profileMessage = '';
            this.profileError = '';
            const username = this.username.trim();

            if (username.length < 3 || username.length > 32) {
                this.profileError = 'O nome de usuário deve ter entre 3 e 32 caracteres.';
                return;
            }

            if (!usernamePattern.test(username)) {
                this.profileError = 'Use apenas letras, números e underline no nome de usuário.';
                return;
            }

            this.isSaving = true;

            try {
                const response = await $fetch<AccountResponse>('/api/conta', {
                    method: 'PATCH',
                    body: { username }
                });

                this.account = response.account;
                this.username = response.account.username ?? '';
                this.profileMessage = 'Nome de usuário atualizado.';
            } catch (error) {
                const status = errorStatus(error);

                if (status === 409 || status === 400) {
                    this.profileError = serverErrorMessage(error) ?? 'Não foi possível atualizar o nome de usuário.';
                } else if (status === 503) {
                    this.profileError = 'Serviço indisponível. Tente novamente em instantes.';
                } else {
                    this.profileError = 'Não foi possível atualizar a conta.';
                }
            } finally {
                this.isSaving = false;
            }
        },
        async handlePasswordSubmit(): Promise<void> {
            if (this.isChangingPassword) {
                return;
            }

            this.passwordMessage = '';
            this.passwordError = '';

            if (!this.currentPassword) {
                this.passwordError = 'Informe a senha atual.';
                return;
            }

            if (this.newPassword.length < 8) {
                this.passwordError = 'A nova senha precisa ter pelo menos 8 caracteres.';
                return;
            }

            if (this.newPassword !== this.confirmation) {
                this.passwordError = 'As senhas não coincidem.';
                return;
            }

            this.isChangingPassword = true;

            try {
                await $fetch('/api/conta/senha', {
                    method: 'POST',
                    body: {
                        currentPassword: this.currentPassword,
                        newPassword: this.newPassword,
                        confirmation: this.confirmation
                    }
                });

                this.currentPassword = '';
                this.newPassword = '';
                this.confirmation = '';
                this.passwordMessage = 'Senha alterada.';
            } catch (error) {
                const status = errorStatus(error);

                if (status === 400 || status === 429) {
                    this.passwordError = serverErrorMessage(error) ?? 'Não foi possível alterar a senha.';
                } else if (status === 503) {
                    this.passwordError = 'Serviço indisponível. Tente novamente em instantes.';
                } else {
                    this.passwordError = 'Não foi possível alterar a senha.';
                }
            } finally {
                this.isChangingPassword = false;
            }
        }
    }
});
</script>

<template>
    <div class="site-painel-pagina">
        <header class="site-painel-hero">
            <p class="site-eyebrow">SUA CONTA</p>
            <h1 class="site-painel__titulo">CONFIGURAÇÕES.</h1>
            <p class="site-prosa site-painel__descricao">
                Ajuste o nome de usuário e a senha da sua conta do site. O e-mail e o vínculo com o Discord ficam
                somente leitura por enquanto.
            </p>
        </header>

        <KamiEmptyState
            v-if="needsLogin"
            title="SESSÃO EXPIRADA"
            description="Entre novamente para acessar as configurações."
        >
            <template #action>
                <KamiButton
                    variant="primary"
                    to="/entrar"
                >
                    ENTRAR
                </KamiButton>
            </template>
        </KamiEmptyState>

        <KamiEmptyState
            v-else-if="isUnavailable"
            title="CONFIGURAÇÕES INDISPONÍVEIS"
            description="Não foi possível carregar sua conta agora. Tente novamente em instantes."
            error
        >
            <template #action>
                <KamiButton href="/configuracoes">TENTAR NOVAMENTE</KamiButton>
            </template>
        </KamiEmptyState>

        <template v-else-if="account">
            <div class="site-config__grade">
                <KamiPanel
                    label="PERFIL"
                    code="CONTA"
                >
                    <dl class="site-config__dados">
                        <div>
                            <dt>E-MAIL</dt>
                            <dd>{{ account.email || '-' }}</dd>
                        </div>
                        <div>
                            <dt>MEMBRO DESDE</dt>
                            <dd>{{ memberSince }}</dd>
                        </div>
                        <div>
                            <dt>DISCORD</dt>
                            <dd>{{ discordLabel }}</dd>
                        </div>
                    </dl>

                    <div
                        class="site-config__form"
                        role="form"
                        aria-label="Perfil"
                    >
                        <div class="kami-field">
                            <label
                                class="kami-field__label kami-field__label--required"
                                for="config-usuario"
                            >
                                NOME DE USUÁRIO
                            </label>
                            <input
                                id="config-usuario"
                                v-model="username"
                                class="kami-input"
                                type="text"
                                name="username"
                                autocomplete="username"
                                minlength="3"
                                maxlength="32"
                                pattern="[A-Za-z0-9_]+"
                                required
                                aria-describedby="config-usuario-dica"
                            />
                            <p
                                id="config-usuario-dica"
                                class="kami-field__hint"
                            >
                                3 a 32 caracteres: letras, números e underline.
                            </p>
                        </div>

                        <p
                            v-if="profileError"
                            class="kami-field__error"
                            role="alert"
                        >
                            {{ profileError }}
                        </p>
                        <p
                            v-if="profileMessage"
                            class="site-config__sucesso"
                            role="status"
                        >
                            {{ profileMessage }}
                        </p>

                        <KamiButton
                            variant="primary"
                            :disabled="isSaving"
                            @click="handleProfileSubmit"
                        >
                            {{ isSaving ? 'SALVANDO...' : 'SALVAR PERFIL' }}
                        </KamiButton>
                    </div>
                </KamiPanel>

                <KamiPanel
                    label="SENHA"
                    code="AUTH"
                >
                    <div
                        class="site-config__form"
                        role="form"
                        aria-label="Alterar senha"
                    >
                        <div class="kami-field">
                            <label
                                class="kami-field__label kami-field__label--required"
                                for="config-senha-atual"
                            >
                                SENHA ATUAL
                            </label>
                            <input
                                id="config-senha-atual"
                                v-model="currentPassword"
                                class="kami-input"
                                type="password"
                                name="currentPassword"
                                autocomplete="current-password"
                                required
                            />
                        </div>

                        <div class="kami-field">
                            <label
                                class="kami-field__label kami-field__label--required"
                                for="config-senha-nova"
                            >
                                NOVA SENHA
                            </label>
                            <input
                                id="config-senha-nova"
                                v-model="newPassword"
                                class="kami-input"
                                type="password"
                                name="newPassword"
                                autocomplete="new-password"
                                minlength="8"
                                required
                            />
                        </div>

                        <div class="kami-field">
                            <label
                                class="kami-field__label kami-field__label--required"
                                for="config-senha-confirmacao"
                            >
                                CONFIRME A NOVA SENHA
                            </label>
                            <input
                                id="config-senha-confirmacao"
                                v-model="confirmation"
                                class="kami-input"
                                type="password"
                                name="confirmation"
                                autocomplete="new-password"
                                minlength="8"
                                required
                            />
                        </div>

                        <p
                            v-if="passwordError"
                            class="kami-field__error"
                            role="alert"
                        >
                            {{ passwordError }}
                        </p>
                        <p
                            v-if="passwordMessage"
                            class="site-config__sucesso"
                            role="status"
                        >
                            {{ passwordMessage }}
                        </p>

                        <KamiButton
                            variant="primary"
                            :disabled="isChangingPassword"
                            @click="handlePasswordSubmit"
                        >
                            {{ isChangingPassword ? 'ALTERANDO...' : 'ALTERAR SENHA' }}
                        </KamiButton>
                    </div>
                </KamiPanel>
            </div>

            <KamiPanel
                label="DISCORD"
                code="D5"
            >
                <p class="site-prosa">
                    {{
                        account.discordLinked
                            ? 'Sua conta do site está vinculada a uma conta do Discord.'
                            : 'Sua conta do site ainda não está vinculada a uma conta do Discord.'
                    }}
                    O vínculo e o merge de contas chegam na D5.
                </p>
            </KamiPanel>
        </template>
    </div>
</template>
