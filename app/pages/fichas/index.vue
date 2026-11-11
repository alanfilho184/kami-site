<script lang="ts">
import { defineNuxtComponent, navigateTo, useHead, useRequestFetch, useRoute } from '#app';
import type { SheetDetail, SheetQuota } from '~~/shared/types/sheet';
import type { SheetListItem } from '~~/shared/types/panel';
import { formatDate } from '~~/shared/utils/formatting';
import { errorStatus, serverErrorCode, serverErrorMessage } from '~~/shared/utils/http-error';
import { sheetPath, sheetUrl } from '~~/shared/utils/sheet-url';
import { notify } from '~/utils/notify';
import { connectRealtime, type RealtimeSocket } from '~/utils/realtime';

type SheetFilter = 'todas' | 'publicas' | 'vivas' | 'legadas';

const sheetFilters: Array<{ value: SheetFilter; label: string }> = [
    { value: 'todas', label: 'TODAS' },
    { value: 'publicas', label: 'PÚBLICAS' },
    { value: 'vivas', label: 'AO VIVO' },
    { value: 'legadas', label: 'LEGADAS' }
];

function parseSheetFilter(value: unknown): SheetFilter {
    const raw = Array.isArray(value) ? value[0] : value;

    return sheetFilters.some(filter => filter.value === raw) ? (raw as SheetFilter) : 'todas';
}

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
        const route = useRoute();
        const filter = parseSheetFilter(route.query.filtro);
        const requestFetch = useRequestFetch();

        try {
            const [sheets, quota] = await Promise.all([
                requestFetch<SheetListItem[]>('/api/fichas'),
                requestFetch<SheetQuota>('/api/fichas/limite').catch(() => null)
            ]);

            return { sheets, quota, filter, needsLogin: false, isUnavailable: false };
        } catch (error) {
            const status = errorStatus(error);
            return {
                sheets: [],
                quota: null,
                filter,
                needsLogin: status === 401,
                isUnavailable: status !== 401
            };
        }
    },
    data() {
        return {
            sheets: [] as SheetListItem[],
            quota: null as SheetQuota | null,
            filter: 'todas' as SheetFilter,
            filters: sheetFilters,
            search: '',
            needsLogin: false,
            isUnavailable: false,
            newSheetName: '',
            isCreating: false,
            busyId: null as number | null,
            editingId: null as number | null,
            renameValue: '',
            confirmDeleteId: null as number | null,
            realtimeSocket: null as RealtimeSocket | null,
            realtimeRefreshTimer: null as number | null,
            errorMessage: ''
        };
    },
    mounted() {
        this.startRealtime();

        if (this.$route.query.nova === '1') {
            void this.$nextTick(() => {
                const input = document.getElementById('nova-ficha');

                input?.scrollIntoView({ block: 'center' });
                input?.focus();
            });
        }
    },
    beforeUnmount() {
        this.stopRealtime();
    },
    computed: {
        filteredSheets(): SheetListItem[] {
            const term = this.search.trim().toLocaleLowerCase('pt-BR');
            const matchesSearch = term
                ? this.sheets.filter(sheet => sheet.name.toLocaleLowerCase('pt-BR').includes(term))
                : this.sheets;

            switch (this.filter) {
                case 'publicas':
                    return matchesSearch.filter(sheet => sheet.isPublic);
                case 'vivas':
                    return matchesSearch.filter(sheet => sheet.isLive);
                case 'legadas':
                    return matchesSearch.filter(sheet => sheet.isLegacy);
                default:
                    return matchesSearch;
            }
        },
        filterCounts(): Record<SheetFilter, number> {
            return {
                todas: this.sheets.length,
                publicas: this.sheets.filter(sheet => sheet.isPublic).length,
                vivas: this.sheets.filter(sheet => sheet.isLive).length,
                legadas: this.sheets.filter(sheet => sheet.isLegacy).length
            };
        },
        quotaLabel(): string {
            if (!this.quota) {
                return 'D3';
            }

            if (this.quota.isPremium) {
                return 'PREMIUM · ILIMITADO';
            }

            return `${this.quota.used} / ${this.quota.limit}`;
        },
        isAtLimit(): boolean {
            return Boolean(this.quota && !this.quota.isPremium && this.quota.used >= (this.quota.limit ?? 0));
        },
        createHint(): string {
            if (this.quota?.isPremium) {
                return '1 a 32 caracteres, sem aspas simples, cifrão ou porcentagem. Sua conta premium não tem limite de fichas.';
            }

            if (this.isAtLimit) {
                return `Você atingiu o limite de ${this.quota?.limit} fichas. Exclua uma ficha para criar outra.`;
            }

            if (this.quota) {
                const remaining = this.quota.remaining ?? 0;
                const label = remaining === 1 ? 'Resta 1 ficha' : `Restam ${remaining} fichas`;

                return `1 a 32 caracteres, sem aspas simples, cifrão ou porcentagem. ${label}.`;
            }

            return '1 a 32 caracteres, sem aspas simples, cifrão ou porcentagem.';
        }
    },
    methods: {
        formatUpdatedAt(value: string): string {
            return formatDate(value);
        },
        setFilter(filter: SheetFilter): void {
            this.filter = filter;

            if (typeof window === 'undefined') {
                return;
            }

            const url = new URL(window.location.href);

            if (filter === 'todas') {
                url.searchParams.delete('filtro');
            } else {
                url.searchParams.set('filtro', filter);
            }

            window.history.replaceState(window.history.state, '', url);
        },
        clearFilters(): void {
            this.search = '';
            this.setFilter('todas');
        },
        clearMessages(): void {
            this.errorMessage = '';
        },
        handleError(error: unknown, fallback: string): void {
            notify.error(serverErrorMessage(error) ?? fallback);
        },
        startRealtime(): void {
            const socket = connectRealtime();

            if (!socket) {
                return;
            }

            this.realtimeSocket = socket;
            socket.on('sheet.created', this.handleRealtimeSheetChange);
            socket.on('sheet.updated', this.handleRealtimeSheetChange);
            socket.on('sheet.deleted', this.handleRealtimeSheetChange);
        },
        stopRealtime(): void {
            if (this.realtimeRefreshTimer !== null) {
                window.clearTimeout(this.realtimeRefreshTimer);
                this.realtimeRefreshTimer = null;
            }

            if (this.realtimeSocket) {
                this.realtimeSocket.off('sheet.created', this.handleRealtimeSheetChange);
                this.realtimeSocket.off('sheet.updated', this.handleRealtimeSheetChange);
                this.realtimeSocket.off('sheet.deleted', this.handleRealtimeSheetChange);
                this.realtimeSocket = null;
            }
        },
        handleRealtimeSheetChange(): void {
            if (this.realtimeRefreshTimer !== null) {
                return;
            }

            this.realtimeRefreshTimer = window.setTimeout(() => {
                this.realtimeRefreshTimer = null;
                void Promise.all([this.refreshSheets(), this.refreshQuota()]);
            }, 250);
        },
        adjustQuota(delta: number): void {
            if (!this.quota || this.quota.isPremium) {
                return;
            }

            const used = Math.max(0, this.quota.used + delta);
            const remaining = Math.max(0, (this.quota.limit ?? 0) - used);

            this.quota = {
                ...this.quota,
                used,
                remaining,
                canCreate: remaining > 0
            };
        },
        async refreshQuota(): Promise<void> {
            try {
                this.quota = await $fetch<SheetQuota>('/api/fichas/limite');
            } catch (error) {
                this.handleError(error, 'Não foi possível atualizar o limite de fichas.');
            }
        },
        sheetHref(sheet: SheetListItem): string {
            const duplicated = this.sheets.filter(item => item.name === sheet.name).length > 1;

            return sheetUrl(sheet.userId, sheet.name, duplicated ? sheet.id : undefined);
        },
        async handleCreate(): Promise<void> {
            if (this.isCreating) {
                return;
            }

            if (this.isAtLimit) {
                notify.warning(
                    `Você atingiu o limite de ${this.quota?.limit} fichas. Exclua uma ficha para criar outra.`
                );
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

                notify.success('FICHA CRIADA.');
                await navigateTo(sheetPath(sheet.userId, sheet.name));
            } catch (error) {
                const status = errorStatus(error);
                const code = serverErrorCode(error);

                if (code === 'sheet_limit_reached') {
                    await this.refreshQuota();
                }

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
                notify.success('NOME DA FICHA ATUALIZADO.');
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

            if (this.isAtLimit) {
                notify.warning(
                    `Você atingiu o limite de ${this.quota?.limit} fichas. Exclua uma ficha para criar outra.`
                );
                return;
            }

            this.clearMessages();
            this.busyId = sheet.id;

            try {
                const duplicated = await $fetch<SheetDetail>(`/api/fichas/${sheet.id}/duplicar`, {
                    method: 'POST'
                });

                this.sheets.unshift(toListItem(duplicated));
                this.adjustQuota(1);
                notify.success('CÓPIA CRIADA.');
            } catch (error) {
                if (serverErrorCode(error) === 'sheet_limit_reached') {
                    await this.refreshQuota();
                }

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
                this.adjustQuota(-1);
                this.confirmDeleteId = null;
                notify.success('FICHA EXCLUÍDA.');
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
            <div class="site-painel-hero__selo">
                <p class="site-eyebrow">SUAS FICHAS</p>
                <KamiRealtimeChip />
            </div>
            <h1 class="site-painel__titulo">FICHAS.</h1>
            <p class="site-prosa site-painel__descricao">
                Crie, edite e organize suas fichas. As fichas vinculadas ao Discord aparecem ao vivo e podem ser
                editadas normalmente.
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
                :code="quotaLabel"
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
                        :disabled="isCreating || isAtLimit"
                    >
                        {{ isCreating ? 'CRIANDO...' : 'CRIAR FICHA' }}
                    </KamiButton>

                    <p
                        id="nova-ficha-dica"
                        class="kami-field__hint site-fichas__criar-dica"
                        :class="{ 'site-fichas__criar-dica--limite': isAtLimit }"
                    >
                        {{ createHint }}
                    </p>
                </form>
            </KamiPanel>

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
                <div class="site-fichas__filtros">
                    <div class="site-fichas__busca">
                        <label
                            class="kami-sr-only"
                            for="fichas-busca"
                        >
                            Buscar ficha
                        </label>
                        <input
                            id="fichas-busca"
                            v-model="search"
                            class="kami-input"
                            type="search"
                            placeholder="BUSCAR FICHA"
                            autocomplete="off"
                        />
                    </div>
                    <div
                        class="site-fichas__filtros-botoes"
                        role="group"
                        aria-label="Filtrar fichas"
                    >
                        <KamiButton
                            v-for="option in filters"
                            :key="option.value"
                            size="sm"
                            :variant="filter === option.value ? 'primary' : 'default'"
                            :aria-pressed="filter === option.value"
                            @click="setFilter(option.value)"
                        >
                            {{ option.label }} ({{ filterCounts[option.value] }})
                        </KamiButton>
                    </div>
                </div>

                <div
                    v-if="filteredSheets.length"
                    class="site-fichas__grade"
                >
                    <article
                        v-for="sheet in filteredSheets"
                        :key="sheet.id"
                        class="site-fichas__card"
                    >
                        <header class="site-fichas__card-topo">
                            <div class="site-fichas__card-identidade">
                                <span class="site-fichas__card-codigo">FICHA #{{ sheet.id }}</span>
                                <h3 class="site-fichas__card-nome">{{ sheet.name }}</h3>
                            </div>
                            <div class="site-fichas__card-selos">
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
                            </div>
                        </header>

                        <div class="site-fichas__card-corpo">
                            <p class="site-fichas__card-meta">ATUALIZADA EM {{ formatUpdatedAt(sheet.updatedAt) }}</p>

                            <form
                                v-if="editingId === sheet.id"
                                class="site-fichas__card-renomear"
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
                                <div class="site-fichas__card-acoes">
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
                                </div>
                            </form>

                            <div
                                v-else-if="confirmDeleteId === sheet.id"
                                class="site-fichas__card-confirmar"
                            >
                                <p
                                    class="site-fichas__confirmar"
                                    role="alert"
                                >
                                    EXCLUIR “{{ sheet.name }}”? ESSA AÇÃO NÃO PODE SER DESFEITA.
                                </p>
                                <div class="site-fichas__card-acoes">
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
                        </div>

                        <footer
                            v-if="editingId !== sheet.id && confirmDeleteId !== sheet.id"
                            class="site-fichas__card-acoes"
                        >
                            <KamiButton
                                size="sm"
                                variant="primary"
                                :to="sheetHref(sheet)"
                            >
                                ABRIR
                            </KamiButton>
                            <KamiButton
                                size="sm"
                                :disabled="busyId !== null"
                                @click="startRename(sheet)"
                            >
                                RENOMEAR
                            </KamiButton>
                            <KamiButton
                                size="sm"
                                :disabled="busyId === sheet.id || isAtLimit"
                                @click="duplicateSheet(sheet)"
                            >
                                DUPLICAR
                            </KamiButton>
                            <KamiButton
                                size="sm"
                                variant="danger"
                                :disabled="busyId !== null"
                                @click="requestDelete(sheet)"
                            >
                                EXCLUIR
                            </KamiButton>
                        </footer>
                    </article>
                </div>

                <KamiEmptyState
                    v-else-if="sheets.length"
                    title="NENHUMA FICHA NESTE FILTRO"
                    description="Ajuste a busca ou o filtro para encontrar suas fichas."
                >
                    <template #action>
                        <KamiButton @click="clearFilters">LIMPAR FILTROS</KamiButton>
                    </template>
                </KamiEmptyState>

                <KamiEmptyState
                    v-else
                    title="NENHUMA FICHA AINDA"
                    description="Crie sua primeira ficha acima. As fichas feitas no Discord também aparecem aqui."
                />
            </KamiPanel>
        </template>
    </div>
</template>
