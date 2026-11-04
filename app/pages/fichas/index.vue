<script lang="ts">
import { defineNuxtComponent, navigateTo, useHead, useRequestFetch } from '#app';
import type { SheetDetail } from '~~/shared/types/sheet';
import type { SheetListItem } from '~~/shared/types/panel';
import { formatDate } from '~~/shared/utils/formatting';
import { errorStatus, serverErrorCode, serverErrorMessage } from '~~/shared/utils/http-error';
import { sheetPath, sheetUrl } from '~~/shared/utils/sheet-url';

const forbiddenName = /['$%]/;

function validateSheetName(value: string): string | null {
    const name = value.trim();

    if (!name) {
        return 'Informe o nome da ficha.';
    }

    if (name.length > 32) {
        return 'O nome da ficha deve ter no máximo 32 caracteres.';
    }

    if (forbiddenName.test(name)) {
        return 'O nome da ficha não pode conter aspas simples, cifrão ou porcentagem.';
    }

    return null;
}

function toListItem(sheet: SheetDetail): SheetListItem {
    return {
        id: sheet.id,
        userId: sheet.userId,
        name: sheet.name,
        isPublic: sheet.isPublic,
        isLegacy: sheet.isLegacy,
        isLive: sheet.isLive,
        updatedAt: sheet.updatedAt
    };
}

export default defineNuxtComponent({
    name: 'SheetsPage',
    setup() {
        useHead({
            title: 'Fichas - Kami',
            meta: [
                {
                    name: 'description',
                    content: 'Crie, edite e organize suas fichas no Kami.'
                },
                { name: 'robots', content: 'noindex, nofollow' }
            ]
        });
    },
    async asyncData() {
        const requestFetch = useRequestFetch();

        try {
            const sheets = await requestFetch<SheetListItem[]>('/api/fichas');
            return { sheets, needsLogin: false, isUnavailable: false };
        } catch (error) {
            const status = errorStatus(error);
            return {
                sheets: [],
                needsLogin: status === 401,
                isUnavailable: status !== 401
            };
        }
    },
    data() {
        return {
            sheets: [] as SheetListItem[],
            needsLogin: false,
            isUnavailable: false,
            newSheetName: '',
            isCreating: false,
            busyId: null as number | null,
            editingId: null as number | null,
            renameValue: '',
            confirmDeleteId: null as number | null,
            errorMessage: '',
            successMessage: ''
        };
    },
    methods: {
        formatUpdatedAt(value: string): string {
            return formatDate(value);
        },
        clearMessages(): void {
            this.errorMessage = '';
            this.successMessage = '';
        },
        handleError(error: unknown, fallback: string): void {
            this.errorMessage = serverErrorMessage(error) ?? fallback;
        },
        sheetHref(sheet: SheetListItem): string {
            const duplicated = this.sheets.filter(item => item.name === sheet.name).length > 1;

            return sheetUrl(sheet.userId, sheet.name, duplicated ? sheet.id : undefined);
        },
        async handleCreate(): Promise<void> {
            if (this.isCreating) {
                return;
            }

            this.clearMessages();
            const validation = validateSheetName(this.newSheetName);

            if (validation) {
                this.errorMessage = validation;
                return;
            }

            this.isCreating = true;

            try {
                const sheet = await $fetch<SheetDetail>('/api/fichas', {
                    method: 'POST',
                    body: { name: this.newSheetName.trim() }
                });

                await navigateTo(sheetPath(sheet.userId, sheet.name));
            } catch (error) {
                const status = errorStatus(error);
                this.handleError(
                    error,
                    status === 503
                        ? 'Não foi possível criar a ficha agora. Tente novamente em instantes.'
                        : 'Não foi possível criar a ficha.'
                );
            } finally {
                this.isCreating = false;
            }
        },
        startRename(sheet: SheetListItem): void {
            if (this.busyId !== null) {
                return;
            }

            this.clearMessages();
            this.editingId = sheet.id;
            this.renameValue = sheet.name;
            this.confirmDeleteId = null;
        },
        cancelRename(): void {
            this.editingId = null;
            this.renameValue = '';
        },
        async submitRename(sheet: SheetListItem): Promise<void> {
            if (this.busyId !== null) {
                return;
            }

            this.clearMessages();
            const validation = validateSheetName(this.renameValue);

            if (validation) {
                this.errorMessage = validation;
                return;
            }

            this.busyId = sheet.id;

            try {
                const updated = await $fetch<SheetDetail>(`/api/fichas/${sheet.id}`, {
                    method: 'PATCH',
                    body: {
                        name: this.renameValue.trim(),
                        version: sheet.updatedAt
                    }
                });

                const index = this.sheets.findIndex(item => item.id === sheet.id);

                if (index >= 0) {
                    this.sheets.splice(index, 1, toListItem(updated));
                }

                this.editingId = null;
                this.renameValue = '';
                this.successMessage = 'NOME DA FICHA ATUALIZADO.';
            } catch (error) {
                const code = serverErrorCode(error);
                this.handleError(error, 'Não foi possível renomear a ficha.');

                if (code === 'sheet_conflict') {
                    await this.refreshSheets();
                }
            } finally {
                this.busyId = null;
            }
        },
        async duplicateSheet(sheet: SheetListItem): Promise<void> {
            if (this.busyId !== null) {
                return;
            }

            this.clearMessages();
            this.busyId = sheet.id;

            try {
                const duplicated = await $fetch<SheetDetail>(`/api/fichas/${sheet.id}/duplicar`, {
                    method: 'POST'
                });

                this.sheets.unshift(toListItem(duplicated));
                this.successMessage = 'CÓPIA CRIADA.';
            } catch (error) {
                this.handleError(error, 'Não foi possível duplicar a ficha.');
            } finally {
                this.busyId = null;
            }
        },
        requestDelete(sheet: SheetListItem): void {
            if (this.busyId !== null) {
                return;
            }

            this.clearMessages();
            this.editingId = null;
            this.confirmDeleteId = sheet.id;
        },
        cancelDelete(): void {
            this.confirmDeleteId = null;
        },
        async deleteSheet(sheet: SheetListItem): Promise<void> {
            if (this.busyId !== null) {
                return;
            }

            this.clearMessages();
            this.busyId = sheet.id;

            try {
                await $fetch(`/api/fichas/${sheet.id}`, {
                    method: 'DELETE',
                    body: { version: sheet.updatedAt }
                });

                this.sheets = this.sheets.filter(item => item.id !== sheet.id);
                this.confirmDeleteId = null;
                this.successMessage = 'FICHA EXCLUÍDA.';
            } catch (error) {
                const code = serverErrorCode(error);
                this.handleError(error, 'Não foi possível excluir a ficha.');

                if (code === 'sheet_conflict') {
                    await this.refreshSheets();
                }
            } finally {
                this.busyId = null;
            }
        },
        async refreshSheets(): Promise<void> {
            try {
                this.sheets = await $fetch<SheetListItem[]>('/api/fichas');
            } catch (error) {
                this.handleError(error, 'Não foi possível atualizar a lista de fichas.');
            }
        },
        reloadPage(): void {
            window.location.reload();
        }
    }
});
</script>

<template>
    <div class="site-painel-pagina">
        <header class="site-painel-hero">
            <p class="site-eyebrow">SUAS FICHAS</p>
            <h1 class="site-painel__titulo">FICHAS.</h1>
            <p class="site-prosa site-painel__descricao">
                Crie, edite e organize suas fichas. As fichas vinculadas ao Discord aparecem ao vivo e ficam somente
                leitura até a D5.
            </p>
        </header>

        <KamiEmptyState
            v-if="needsLogin"
            title="SESSÃO EXPIRADA"
            description="Entre novamente para acessar suas fichas."
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
            title="FICHAS INDISPONÍVEIS"
            description="Não foi possível carregar suas fichas agora. Tente novamente em instantes."
            error
        >
            <template #action>
                <KamiButton @click="reloadPage">TENTAR NOVAMENTE</KamiButton>
            </template>
        </KamiEmptyState>

        <template v-else>
            <KamiPanel
                label="NOVA FICHA"
                code="D3"
            >
                <form
                    class="site-fichas__criar"
                    @submit.prevent="handleCreate"
                >
                    <label
                        class="kami-field__label kami-field__label--required site-fichas__criar-label"
                        for="nova-ficha"
                    >
                        NOME DA FICHA
                    </label>
                    <input
                        id="nova-ficha"
                        v-model="newSheetName"
                        class="kami-input site-fichas__criar-input"
                        type="text"
                        name="sheetName"
                        maxlength="32"
                        autocomplete="off"
                        required
                        aria-describedby="nova-ficha-dica"
                    />

                    <KamiButton
                        class="site-fichas__criar-btn"
                        type="submit"
                        variant="primary"
                        :disabled="isCreating"
                    >
                        {{ isCreating ? 'CRIANDO...' : 'CRIAR FICHA' }}
                    </KamiButton>

                    <p
                        id="nova-ficha-dica"
                        class="kami-field__hint site-fichas__criar-dica"
                    >
                        1 a 32 caracteres, sem aspas simples, cifrão ou porcentagem.
                    </p>
                </form>
            </KamiPanel>

            <p
                v-if="successMessage"
                class="site-config__sucesso"
                role="status"
            >
                {{ successMessage }}
            </p>
            <p
                v-if="errorMessage"
                class="kami-field__error"
                role="alert"
            >
                {{ errorMessage }}
            </p>

            <KamiPanel
                label="MINHAS FICHAS"
                code="LISTA"
            >
                <ul
                    v-if="sheets.length"
                    class="site-painel-lista site-fichas__lista"
                >
                    <li
                        v-for="sheet in sheets"
                        :key="sheet.id"
                        class="site-painel-lista__item site-fichas__item"
                    >
                        <div class="site-painel-lista__principal site-fichas__principal">
                            <template v-if="editingId === sheet.id">
                                <form
                                    class="site-fichas__renomear"
                                    @submit.prevent="submitRename(sheet)"
                                >
                                    <label
                                        class="kami-sr-only"
                                        :for="`renomear-${sheet.id}`"
                                    >
                                        Novo nome da ficha
                                    </label>
                                    <input
                                        :id="`renomear-${sheet.id}`"
                                        v-model="renameValue"
                                        class="kami-input"
                                        type="text"
                                        maxlength="32"
                                        @keydown.esc="cancelRename"
                                    />
                                    <KamiButton
                                        type="submit"
                                        size="sm"
                                        variant="primary"
                                        :disabled="busyId === sheet.id"
                                    >
                                        SALVAR
                                    </KamiButton>
                                    <KamiButton
                                        size="sm"
                                        @click="cancelRename"
                                    >
                                        CANCELAR
                                    </KamiButton>
                                </form>
                            </template>
                            <template v-else>
                                <p class="site-painel-lista__nome">{{ sheet.name }}</p>
                                <p class="site-painel-lista__meta">
                                    ATUALIZADA EM {{ formatUpdatedAt(sheet.updatedAt) }}
                                </p>
                            </template>

                            <p
                                v-if="confirmDeleteId === sheet.id"
                                class="site-fichas__confirmar"
                                role="alert"
                            >
                                EXCLUIR “{{ sheet.name }}”? ESSA AÇÃO NÃO PODE SER DESFEITA.
                            </p>
                            <div
                                v-if="confirmDeleteId === sheet.id"
                                class="site-fichas__acoes"
                            >
                                <KamiButton
                                    variant="danger"
                                    size="sm"
                                    :disabled="busyId === sheet.id"
                                    @click="deleteSheet(sheet)"
                                >
                                    {{ busyId === sheet.id ? 'EXCLUINDO...' : 'CONFIRMAR EXCLUSÃO' }}
                                </KamiButton>
                                <KamiButton
                                    size="sm"
                                    @click="cancelDelete"
                                >
                                    CANCELAR
                                </KamiButton>
                            </div>
                        </div>

                        <div class="site-fichas__lado">
                            <div class="site-painel-lista__selos">
                                <KamiChip
                                    v-if="sheet.isLive"
                                    status="live"
                                >
                                    AO VIVO
                                </KamiChip>
                                <KamiChip
                                    v-if="sheet.isPublic"
                                    status="dim"
                                >
                                    PÚBLICA
                                </KamiChip>
                                <KamiChip
                                    v-if="sheet.isLegacy"
                                    status="warn"
                                >
                                    LEGADA
                                </KamiChip>
                                <span
                                    v-if="sheet.isLive"
                                    class="site-fichas__somente-leitura"
                                >
                                    SOMENTE LEITURA
                                </span>
                            </div>

                            <div class="site-fichas__acoes">
                                <KamiButton
                                    size="sm"
                                    variant="primary"
                                    :to="sheetHref(sheet)"
                                >
                                    ABRIR
                                </KamiButton>
                                <KamiButton
                                    v-if="!sheet.isLive"
                                    size="sm"
                                    :disabled="busyId !== null"
                                    @click="startRename(sheet)"
                                >
                                    RENOMEAR
                                </KamiButton>
                                <KamiButton
                                    size="sm"
                                    :disabled="busyId === sheet.id"
                                    @click="duplicateSheet(sheet)"
                                >
                                    DUPLICAR
                                </KamiButton>
                                <KamiButton
                                    v-if="!sheet.isLive"
                                    size="sm"
                                    variant="danger"
                                    :disabled="busyId !== null"
                                    @click="requestDelete(sheet)"
                                >
                                    EXCLUIR
                                </KamiButton>
                            </div>
                        </div>
                    </li>
                </ul>

                <KamiEmptyState
                    v-else
                    title="NENHUMA FICHA AINDA"
                    description="Crie sua primeira ficha acima. As fichas feitas no Discord também aparecem aqui."
                />
            </KamiPanel>
        </template>
    </div>
</template>
