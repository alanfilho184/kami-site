<script lang="ts">
import { computed, defineComponent, type DeepReadonly } from 'vue';
import { notify, type ToastItem, type ToastType } from '~/utils/notify';

type ToastView = DeepReadonly<ToastItem>;

const typeIcons: Record<ToastType, 'check' | 'info' | 'alert' | 'x'> = {
    success: 'check',
    info: 'info',
    warning: 'alert',
    error: 'x'
};

const typeTitles: Record<ToastType, string> = {
    success: 'SUCESSO',
    info: 'INFORMAÇÃO',
    warning: 'ATENÇÃO',
    error: 'ERRO'
};

export default defineComponent({
    name: 'KamiToastHost',
    computed: {
        toasts(): readonly ToastView[] {
            return notify.state.items;
        }
    },
    methods: {
        iconFor(type: ToastType): 'check' | 'info' | 'alert' | 'x' {
            return typeIcons[type];
        },
        titleFor(toast: ToastView): string {
            return toast.title || typeTitles[toast.type];
        },
        roleFor(type: ToastType): 'alert' | 'status' {
            return type === 'error' ? 'alert' : 'status';
        },
        progressStyle(toast: ToastView): Record<string, string> {
            return {
                animationDuration: `${toast.duration}ms`,
                animationPlayState: toast.paused ? 'paused' : 'running'
            };
        },
        pauseToast(id: number): void {
            notify.pause(id);
        },
        resumeToast(id: number): void {
            notify.resume(id);
        },
        dismissToast(id: number): void {
            notify.dismiss(id);
        },
        async runToastAction(id: number): Promise<void> {
            await notify.runAction(id);
        }
    }
});
</script>

<template>
    <Teleport to="body">
        <div
            v-if="toasts.length"
            class="kami-toasts"
            role="region"
            aria-label="Notificações"
        >
            <article
                v-for="toast in toasts"
                :key="toast.id"
                class="kami-toast"
                :class="[`kami-toast--${toast.type}`, { 'kami-toast--fechando': toast.closing }]"
                :role="roleFor(toast.type)"
                @mouseenter="pauseToast(toast.id)"
                @mouseleave="resumeToast(toast.id)"
                @focusin="pauseToast(toast.id)"
                @focusout="resumeToast(toast.id)"
            >
                <span
                    class="kami-toast__faixa"
                    aria-hidden="true"
                ></span>

                <span
                    class="kami-toast__icone"
                    aria-hidden="true"
                >
                    <KamiIcon
                        :name="iconFor(toast.type)"
                        :size="18"
                    />
                </span>

                <div class="kami-toast__corpo">
                    <p class="kami-toast__titulo">
                        {{ titleFor(toast) }}
                    </p>
                    <p class="kami-toast__mensagem">{{ toast.message }}</p>
                    <ul
                        v-if="toast.items.length"
                        class="kami-toast__lista"
                    >
                        <li
                            v-for="(item, index) in toast.items"
                            :key="`${toast.id}-${index}`"
                        >
                            {{ item }}
                        </li>
                    </ul>
                    <div
                        v-if="toast.action"
                        class="kami-toast__acoes"
                    >
                        <button
                            type="button"
                            class="kami-toast__acao"
                            :disabled="toast.actionRunning"
                            @click="runToastAction(toast.id)"
                        >
                            {{ toast.action.label }}
                            <span aria-hidden="true">→</span>
                        </button>
                    </div>
                </div>

                <button
                    v-if="toast.dismissible"
                    type="button"
                    class="kami-toast__fechar"
                    aria-label="Fechar notificação"
                    @click="dismissToast(toast.id)"
                >
                    <KamiIcon
                        name="x"
                        :size="16"
                    />
                </button>

                <div
                    v-if="toast.duration > 0"
                    class="kami-toast__progresso"
                    aria-hidden="true"
                >
                    <span
                        :key="toast.timerVersion"
                        :style="progressStyle(toast)"
                    ></span>
                </div>
            </article>
        </div>
    </Teleport>
</template>
