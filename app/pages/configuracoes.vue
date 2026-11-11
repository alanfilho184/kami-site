<script lang="ts">
import { defineNuxtComponent, useHead, useRequestFetch, useRuntimeConfig } from '#app';
import { SHEET_LIMIT_FREE } from '~~/shared/constants/sheet';
import type { DiscordCodeResponse, DiscordLinkState } from '~~/shared/types/discord';
import type { AccountResponse, PanelAccount } from '~~/shared/types/panel';
import { formatDate, formatDateTime } from '~~/shared/utils/formatting';
import { errorStatus, serverErrorMessage } from '~~/shared/utils/http-error';
import { notify } from '~/utils/notify';

const usernamePattern = /^[a-zA-Z0-9_]+$/;

export default defineNuxtComponent({
    name: 'SettingsPage',
    setup() {
        const config = useRuntimeConfig();

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

        return {
            supportUrl: String(config.public.discordInvite ?? '')
        };
    },
    async asyncData() {
        const requestFetch = useRequestFetch();

        try {
            const [response, discord] = await Promise.all([
                requestFetch<AccountResponse>('/api/conta'),
                requestFetch<DiscordLinkState>('/api/conta/discord').catch(() => null)
            ]);

            return {
                account: response.account,
                discord,
                username: response.account.username ?? '',
                needsLogin: false,
                isUnavailable: false
            };
        } catch (error) {
            const status = errorStatus(error);
            return {
                account: null,
                discord: null,
                username: '',
                needsLogin: status === 401,
                isUnavailable: status !== 401
            };
        }
    },
    data() {
        return {
            account: null as PanelAccount | null,
            discord: null as DiscordLinkState | null,
            discordCode: '',
            discordCommand: '',
            discordError: '',
            discordBusy: false,
            discordPollTimer: null as number | null,
            username: '',
            needsLogin: false,
            isUnavailable: false,
            isSaving: false,
            profileError: '',
            currentPassword: '',
            newPassword: '',
            confirmation: '',
            isChangingPassword: false,
            passwordError: ''
        };
    },
    computed: {
        memberSince(): string {
            return this.account ? formatDate(this.account.createdAt) : '-';
        },
        discordLabel(): string {
            return this.account?.discordLinked ? 'VINCULADO' : 'NÃO VINCULADO';
        },
        planLabel(): string {
            return this.account?.isPremium ? 'PREMIUM · SEM LIMITE' : `GRATUITO · ${SHEET_LIMIT_FREE} FICHAS`;
        },
        discordLinked(): boolean {
            return Boolean(this.account?.discordLinked);
        },
        discordPreview() {
            return this.discord?.preview ?? null;
        },
        discordHasCode(): boolean {
            return this.discord?.status === 'pending' || this.discord?.status === 'claimed';
        },
        discordExpiresLabel(): string {
            return this.discord?.expiresAt ? formatDateTime(this.discord.expiresAt) : '-';
        },
        discordCanConfirm(): boolean {
            return Boolean(this.discordPreview?.canMerge) && !this.discordBusy;
        },
        discordBlockedMessage(): string {
            const preview = this.discordPreview;

            if (!preview) {
                return '';
            }

            if (preview.blockedReason === 'full_account') {
                return 'Essa conta do bot também é uma conta do site. Peça ajuda no servidor de suporte para fazer o merge manualmente.';
            }

            if (preview.duplicateSheetNames.length > 0) {
                return 'Renomeie uma das fichas abaixo no site ou no bot e gere um novo código antes de vincular as contas.';
            }

            return '';
        },
        discordLimitWarning(): string {
            const preview = this.discordPreview;

            if (!preview?.exceedsSheetLimit || preview.sheetLimit === null) {
                return '';
            }

            return `A conta ficará com ${preview.combinedSheets} fichas, acima do limite de ${preview.sheetLimit}. Você poderá manter todas, mas não criará novas até ficar abaixo do limite.`;
        }
    },
    methods: {
        startDiscordPolling(): void {
            this.stopDiscordPolling();

            if (!this.discordHasCode) {
                return;
            }

            this.discordPollTimer = window.setInterval(() => {
                void this.refreshDiscord(true);
            }, 2000);
        },
        stopDiscordPolling(): void {
            if (this.discordPollTimer !== null) {
                window.clearInterval(this.discordPollTimer);
                this.discordPollTimer = null;
            }
        },
        async refreshDiscord(silent = true): Promise<void> {
            try {
                const state = await $fetch<DiscordLinkState>('/api/conta/discord');
                this.discord = state;

                if (state.status === 'linked') {
                    this.stopDiscordPolling();
                    this.discordCode = '';
                    this.discordCommand = '';

                    if (this.account) {
                        this.account = { ...this.account, discordLinked: true };
                    }
                } else if (state.status !== 'pending' && state.status !== 'claimed') {
                    this.stopDiscordPolling();
                }
            } catch (error) {
                if (!silent) {
                    this.discordError = serverErrorMessage(error) ?? 'Não foi possível atualizar o vínculo do Discord.';
                }
            }
        },
        async generateDiscordCode(): Promise<void> {
            if (this.discordBusy) {
                return;
            }

            this.discordBusy = true;
            this.discordError = '';

            try {
                const response = await $fetch<DiscordCodeResponse>('/api/conta/discord/codigo', {
                    method: 'POST'
                });

                this.discordCode = response.formattedCode;
                this.discordCommand = response.command;
                await this.refreshDiscord(false);
                this.startDiscordPolling();
                notify.success('CÓDIGO GERADO.');
            } catch (error) {
                const status = errorStatus(error);
                this.discordError =
                    serverErrorMessage(error) ??
                    (status === 429
                        ? 'Muitos códigos gerados. Aguarde alguns minutos e tente novamente.'
                        : 'Não foi possível gerar o código. Tente novamente.');
            } finally {
                this.discordBusy = false;
            }
        },
        async cancelDiscordCode(): Promise<void> {
            if (this.discordBusy) {
                return;
            }

            this.discordBusy = true;
            this.discordError = '';

            try {
                await $fetch('/api/conta/discord/codigo', { method: 'DELETE' });
                this.discordCode = '';
                this.discordCommand = '';
                await this.refreshDiscord(false);
                this.stopDiscordPolling();
                notify.success('CÓDIGO CANCELADO.');
            } catch (error) {
                this.discordError = serverErrorMessage(error) ?? 'Não foi possível cancelar o código.';
            } finally {
                this.discordBusy = false;
            }
        },
        async confirmDiscordMerge(): Promise<void> {
            if (!this.discordCanConfirm) {
                return;
            }

            this.discordBusy = true;
            this.discordError = '';

            try {
                const state = await $fetch<DiscordLinkState>('/api/conta/discord/confirmar', {
                    method: 'POST'
                });

                this.discord = state;
                this.discordCode = '';
                this.discordCommand = '';
                this.stopDiscordPolling();

                const accountResponse = await $fetch<AccountResponse>('/api/conta');
                this.account = accountResponse.account;
                this.username = accountResponse.account.username ?? '';

                notify.success('CONTA VINCULADA AO DISCORD.');
            } catch (error) {
                this.discordError = serverErrorMessage(error) ?? 'Não foi possível confirmar o vínculo.';
                await this.refreshDiscord(true);
            } finally {
                this.discordBusy = false;
            }
        },
        async copyDiscordCommand(): Promise<void> {
            if (!this.discordCommand) {
                return;
            }

            try {
                await navigator.clipboard.writeText(this.discordCommand);
                notify.success('COMANDO COPIADO.');
            } catch {
                this.discordError = 'Não foi possível copiar o comando. Copie manualmente.';
            }
        },
        async handleProfileSubmit(): Promise<void> {
            if (this.isSaving) {
                return;
            }

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
                notify.success('Nome de usuário atualizado.');
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
                notify.success('Senha alterada.');
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
    },
    mounted() {
        this.startDiscordPolling();
    },
    beforeUnmount() {
        this.stopDiscordPolling();
    }
});
</script>

<template>
    <div class="site-painel-pagina">
        <header class="site-painel-hero">
            <p class="site-eyebrow">SUA CONTA</p>
            <h1 class="site-painel__titulo">CONFIGURAÇÕES.</h1>
            <p class="site-prosa site-painel__descricao">
                Ajuste o nome de usuário e a senha da sua conta do site. O e-mail fica somente leitura; o vínculo com o
                Discord pode ser gerenciado abaixo.
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
                        <div>
                            <dt>PLANO</dt>
                            <dd>{{ planLabel }}</dd>
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

                        <p class="kami-field__hint">
                            Ao trocar a senha, as outras sessões e abas conectadas serão encerradas.
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
                <div class="site-config__discord">
                    <p
                        v-if="discordError"
                        class="site-config__discord-erro"
                        role="alert"
                    >
                        {{ discordError }}
                    </p>

                    <template v-if="discordLinked || discord?.status === 'linked'">
                        <p class="site-prosa">
                            Sua conta do site está vinculada
                            <template v-if="discord?.discordUsername">
                                ao Discord <strong>@{{ discord.discordUsername }}</strong>
                            </template>
                            <template v-else-if="discord?.discordId">
                                ao Discord <strong>{{ discord.discordId }}</strong>
                            </template>
                            .
                        </p>
                        <p class="site-config__discord-aviso">
                            O desvínculo ainda não está disponível. Para trocar de conta, peça ajuda no servidor de
                            suporte.
                        </p>
                    </template>

                    <template v-else-if="discord === null">
                        <p class="site-prosa">Não foi possível carregar o estado do vínculo do Discord.</p>
                        <div class="site-config__discord-acoes">
                            <KamiButton @click="refreshDiscord(false)">TENTAR NOVAMENTE</KamiButton>
                        </div>
                    </template>

                    <template v-else-if="discord.status === 'claimed' && discordPreview">
                        <p class="site-eyebrow">DISCORD DETECTADO</p>
                        <p class="site-prosa">
                            A conta do Discord
                            <strong v-if="discord.discordUsername">@{{ discord.discordUsername }}</strong>
                            <strong v-else>{{ discord.discordId }}</strong>
                            reivindicou o código. Confira o resumo antes de confirmar.
                        </p>

                        <dl class="site-config__discord-cards">
                            <div class="site-config__discord-card">
                                <dt>CONTA DO SITE</dt>
                                <dd>{{ discordPreview.siteUsername }}</dd>
                            </div>
                            <div class="site-config__discord-card">
                                <dt>CONTA DO BOT</dt>
                                <dd>{{ discordPreview.botAccountExists ? 'ENCONTRADA' : 'NÃO ENCONTRADA' }}</dd>
                            </div>
                            <div class="site-config__discord-card site-config__discord-card--numero">
                                <dt>FICHAS DO SITE</dt>
                                <dd>{{ discordPreview.siteSheets }}</dd>
                            </div>
                            <div class="site-config__discord-card site-config__discord-card--numero">
                                <dt>FICHAS DO BOT</dt>
                                <dd>{{ discordPreview.botSheets }}</dd>
                            </div>
                            <div class="site-config__discord-card site-config__discord-card--numero">
                                <dt>FICHAS AO VIVO</dt>
                                <dd>{{ discordPreview.botLiveSheets }}</dd>
                            </div>
                            <div
                                class="site-config__discord-card site-config__discord-card--numero site-config__discord-card--total"
                            >
                                <dt>TOTAL DE FICHAS</dt>
                                <dd>
                                    {{ discordPreview.combinedSheets }}
                                    <span class="site-config__discord-card-unit">
                                        {{
                                            discordPreview.sheetLimit !== null
                                                ? `/ ${discordPreview.sheetLimit}`
                                                : '· ILIMITADO'
                                        }}
                                    </span>
                                </dd>
                            </div>
                        </dl>

                        <p
                            v-if="discordPreview.exceedsSheetLimit"
                            class="site-config__discord-aviso"
                        >
                            {{ discordLimitWarning }}
                        </p>

                        <template v-if="discordPreview.duplicateSheetNames.length">
                            <p class="site-config__discord-aviso">{{ discordBlockedMessage }}</p>
                            <ul class="site-config__discord-lista">
                                <li
                                    v-for="name in discordPreview.duplicateSheetNames"
                                    :key="name"
                                >
                                    {{ name }}
                                </li>
                            </ul>
                        </template>
                        <p
                            v-else-if="discordPreview.blockedReason === 'full_account'"
                            class="site-config__discord-aviso"
                        >
                            {{ discordBlockedMessage }}
                        </p>

                        <div class="site-config__discord-acoes">
                            <KamiButton
                                variant="primary"
                                :disabled="!discordCanConfirm"
                                @click="confirmDiscordMerge"
                            >
                                {{ discordBusy ? 'CONFIRMANDO...' : 'CONFIRMAR VÍNCULO' }}
                            </KamiButton>
                            <KamiButton
                                :disabled="discordBusy"
                                @click="cancelDiscordCode"
                            >
                                CANCELAR
                            </KamiButton>
                        </div>
                    </template>

                    <template v-else-if="discord.status === 'pending'">
                        <p class="site-prosa">
                            Abra o Discord e execute o comando abaixo para confirmar que a conta é sua.
                        </p>

                        <template v-if="discordCode">
                            <p class="site-eyebrow">SEU CÓDIGO</p>
                            <p class="site-config__discord-codigo">{{ discordCode }}</p>
                        </template>
                        <p
                            v-else
                            class="site-prosa"
                        >
                            Você tem um código ativo, mas ele não é exibido novamente. Gere um novo código para ver o
                            comando.
                        </p>

                        <p
                            v-if="discordCommand"
                            class="site-config__discord-comando"
                        >
                            NO DISCORD: <code>{{ discordCommand }}</code>
                        </p>
                        <p class="site-config__discord-aviso">O código expira em {{ discordExpiresLabel }}.</p>

                        <div class="site-config__discord-acoes">
                            <KamiButton
                                v-if="discordCommand"
                                @click="copyDiscordCommand"
                            >
                                COPIAR COMANDO
                            </KamiButton>
                            <KamiButton
                                variant="primary"
                                :disabled="discordBusy"
                                @click="generateDiscordCode"
                            >
                                {{ discordCode ? 'GERAR NOVO CÓDIGO' : 'GERAR CÓDIGO' }}
                            </KamiButton>
                            <KamiButton
                                :disabled="discordBusy"
                                @click="cancelDiscordCode"
                            >
                                CANCELAR
                            </KamiButton>
                        </div>
                    </template>

                    <template v-else>
                        <p class="site-prosa">
                            Vincule sua conta do Discord para usar a mesma conta no site e no bot. O site gera um código
                            e o bot confirma que o Discord é seu.
                        </p>
                        <div class="site-config__discord-acoes">
                            <KamiButton
                                variant="primary"
                                :disabled="discordBusy"
                                @click="generateDiscordCode"
                            >
                                {{ discordBusy ? 'GERANDO...' : 'GERAR CÓDIGO DE VÍNCULO' }}
                            </KamiButton>
                        </div>
                    </template>
                </div>
            </KamiPanel>

            <KamiPanel
                id="config-exclusao-conta"
                label="EXCLUSÃO DE CONTA"
                code="SUPORTE"
            >
                <p class="site-prosa">
                    Quer apagar sua conta do Kami? Por enquanto, o pedido precisa ser feito manualmente no servidor de
                    suporte no Discord.
                </p>
                <p class="site-config__discord-aviso">
                    A exclusão remove a conta e os dados vinculados. Um fluxo pelo próprio site será adicionado
                    futuramente; até lá, o suporte confirma a identidade antes de apagar.
                </p>
                <div class="site-config__discord-acoes">
                    <KamiButton
                        v-if="supportUrl"
                        :href="supportUrl"
                        external
                        variant="danger"
                    >
                        PEDIR EXCLUSÃO NO SUPORTE
                    </KamiButton>
                </div>
            </KamiPanel>
        </template>
    </div>
</template>
