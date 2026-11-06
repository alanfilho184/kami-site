import { reactive, readonly } from 'vue';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface ToastAction {
    label: string;
    onClick: () => void | Promise<void>;
    /** Mantém o toast aberto depois da ação. */
    keepOpen?: boolean;
}

export interface ToastInput {
    type?: ToastType;
    title?: string;
    message: string;
    items?: string[];
    /** Milissegundos; `0` mantém o toast até o usuário fechar. */
    duration?: number;
    action?: ToastAction | null;
    dismissible?: boolean;
    /** Evita repetir o mesmo aviso enquanto ele estiver na tela ou na fila. */
    dedupeKey?: string;
}

export interface ToastItem {
    id: number;
    type: ToastType;
    title: string;
    message: string;
    items: string[];
    duration: number;
    remaining: number;
    action: ToastAction | null;
    dismissible: boolean;
    dedupeKey: string | null;
    startedAt: number;
    paused: boolean;
    closing: boolean;
    actionRunning: boolean;
    timerVersion: number;
    timer: ReturnType<typeof setTimeout> | null;
}

export interface ToastStoreOptions {
    client?: boolean;
    maxVisible?: number;
    now?: () => number;
    setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
    clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

const TOAST_REMOVE_DELAY = 220;
const MAX_VISIBLE_DEFAULT = 4;
const ACTION_EXTRA_MS = 5000;
const LONG_MESSAGE_MS = 3000;
const VERY_LONG_MESSAGE_MS = 6000;

const typeDurations: Record<ToastType, number> = {
    success: 4000,
    info: 5000,
    warning: 8000,
    error: 12000
};

function normalizeType(value: ToastInput['type']): ToastType {
    return value === 'success' || value === 'info' || value === 'warning' || value === 'error' ? value : 'info';
}

function textLengthOf(input: ToastInput): number {
    const items = input.items?.join('') ?? '';

    return (input.title?.length ?? 0) + input.message.length + items.length;
}

function resolveDuration(input: ToastInput, type: ToastType): number {
    if (typeof input.duration === 'number' && Number.isFinite(input.duration) && input.duration >= 0) {
        return Math.trunc(input.duration);
    }

    const length = textLengthOf(input);
    let duration = typeDurations[type];

    if (length > 120) {
        duration += LONG_MESSAGE_MS;
    }

    if (length > 240) {
        duration += VERY_LONG_MESSAGE_MS;
    }

    if (input.action) {
        duration += ACTION_EXTRA_MS;
    }

    return duration;
}

export function createToastStore(options: ToastStoreOptions = {}) {
    const client = options.client ?? typeof window !== 'undefined';
    const maxVisible = Math.max(1, options.maxVisible ?? MAX_VISIBLE_DEFAULT);
    const now = options.now ?? (() => Date.now());
    const setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
    const clearTimer = options.clearTimer ?? (timer => clearTimeout(timer));
    const state = reactive<{ items: ToastItem[] }>({ items: [] });
    const queue: ToastItem[] = [];
    let nextId = 1;

    function clearItemTimer(item: ToastItem): void {
        if (item.timer !== null) {
            clearTimer(item.timer);
            item.timer = null;
        }
    }

    function startTimer(item: ToastItem): void {
        clearItemTimer(item);

        if (item.duration === 0 || item.closing) {
            return;
        }

        if (item.remaining <= 0) {
            item.remaining = item.duration;
        }

        item.startedAt = now();
        item.paused = false;
        item.timer = setTimer(() => dismiss(item.id), item.remaining);
    }

    function removeFromQueue(id: number): boolean {
        const index = queue.findIndex(item => item.id === id);

        if (index < 0) {
            return false;
        }

        queue.splice(index, 1);
        return true;
    }

    function flushQueue(): void {
        while (state.items.length < maxVisible && queue.length > 0) {
            const item = queue.shift();

            if (!item) {
                return;
            }

            state.items.push(item);
            startTimer(item);
        }
    }

    function findVisible(id: number): ToastItem | null {
        return state.items.find(item => item.id === id) ?? null;
    }

    function buildItem(input: ToastInput, type: ToastType): ToastItem {
        const duration = resolveDuration(input, type);

        return {
            id: nextId++,
            type,
            title: input.title?.trim() ?? '',
            message: input.message.trim(),
            items: (input.items ?? []).map(item => item.trim()).filter(Boolean),
            duration,
            remaining: duration,
            action: input.action ?? null,
            dismissible: input.dismissible ?? true,
            dedupeKey: input.dedupeKey ?? null,
            startedAt: 0,
            paused: false,
            closing: false,
            actionRunning: false,
            timerVersion: 0,
            timer: null
        };
    }

    function findDuplicate(key: string | null): ToastItem | null {
        if (!key) {
            return null;
        }

        return (
            state.items.find(item => item.dedupeKey === key && !item.closing) ??
            queue.find(item => item.dedupeKey === key) ??
            null
        );
    }

    function refreshDuplicate(item: ToastItem, input: ToastInput, type: ToastType): number {
        item.type = type;
        item.title = input.title?.trim() ?? '';
        item.message = input.message.trim();
        item.items = (input.items ?? []).map(entry => entry.trim()).filter(Boolean);
        item.duration = resolveDuration(input, type);
        item.remaining = item.duration;
        item.action = input.action ?? null;
        item.dismissible = input.dismissible ?? true;
        item.timerVersion += 1;

        if (state.items.includes(item)) {
            startTimer(item);
        }

        return item.id;
    }

    function show(input: ToastInput): number {
        if (!client || !input.message.trim()) {
            return 0;
        }

        const type = normalizeType(input.type);
        const duplicate = findDuplicate(input.dedupeKey ?? null);

        if (duplicate) {
            return refreshDuplicate(duplicate, input, type);
        }

        const item = buildItem(input, type);

        queue.push(item);
        flushQueue();

        return item.id;
    }

    function dismiss(id: number): void {
        const item = findVisible(id);

        if (!item) {
            removeFromQueue(id);
            return;
        }

        if (item.closing) {
            return;
        }

        clearItemTimer(item);
        item.closing = true;
        item.paused = false;

        setTimer(() => {
            const index = state.items.findIndex(entry => entry.id === id);

            if (index >= 0) {
                state.items.splice(index, 1);
            }

            flushQueue();
        }, TOAST_REMOVE_DELAY);
    }

    function dismissAll(): void {
        queue.length = 0;

        for (const item of state.items) {
            clearItemTimer(item);
        }

        state.items.splice(0, state.items.length);
    }

    function pause(id: number): void {
        const item = findVisible(id);

        if (!item || item.closing || item.duration === 0 || item.timer === null) {
            return;
        }

        item.remaining = Math.max(0, item.remaining - (now() - item.startedAt));
        clearItemTimer(item);
        item.paused = true;
    }

    function resume(id: number): void {
        const item = findVisible(id);

        if (!item || item.closing || item.duration === 0 || !item.paused) {
            return;
        }

        if (item.remaining <= 0) {
            dismiss(id);
            return;
        }

        startTimer(item);
    }

    async function runAction(id: number): Promise<void> {
        const item = findVisible(id);

        if (!item?.action || item.actionRunning) {
            return;
        }

        item.actionRunning = true;
        pause(id);

        try {
            await item.action.onClick();
        } catch (error) {
            console.error('Falha ao executar a ação da notificação', error);
        } finally {
            item.actionRunning = false;

            if (item.action && !item.action.keepOpen) {
                dismiss(id);
            } else {
                resume(id);
            }
        }
    }

    function success(message: string, options: Omit<ToastInput, 'type' | 'message'> = {}): number {
        return show({ ...options, type: 'success', message });
    }

    function info(message: string, options: Omit<ToastInput, 'type' | 'message'> = {}): number {
        return show({ ...options, type: 'info', message });
    }

    function warning(message: string, options: Omit<ToastInput, 'type' | 'message'> = {}): number {
        return show({ ...options, type: 'warning', message });
    }

    function error(message: string, options: Omit<ToastInput, 'type' | 'message'> = {}): number {
        return show({ ...options, type: 'error', message });
    }

    function critical(message: string, options: Omit<ToastInput, 'type' | 'message' | 'duration'> = {}): number {
        return show({ ...options, type: 'error', message, duration: 0 });
    }

    return {
        state: readonly(state),
        show,
        success,
        info,
        warning,
        error,
        critical,
        dismiss,
        dismissAll,
        pause,
        resume,
        runAction
    };
}

export const notify = createToastStore();
