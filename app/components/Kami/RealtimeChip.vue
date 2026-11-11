<script lang="ts">
import { computed, defineComponent } from 'vue';
import { realtimeStatus, type RealtimeStatus } from '~/utils/realtime';

const labels: Record<RealtimeStatus, string> = {
    connecting: 'CONECTANDO...',
    connected: 'TEMPO REAL',
    reconnecting: 'RECONECTANDO...',
    offline: 'SEM TEMPO REAL'
};

const icons: Record<RealtimeStatus, 'info' | 'radio' | 'alert' | 'x'> = {
    connecting: 'info',
    connected: 'radio',
    reconnecting: 'alert',
    offline: 'x'
};

export default defineComponent({
    name: 'KamiRealtimeChip',
    computed: {
        status(): RealtimeStatus {
            return realtimeStatus.value;
        },
        label(): string {
            return labels[this.status];
        },
        icon(): 'info' | 'radio' | 'alert' | 'x' {
            return icons[this.status];
        },
        role(): 'alert' | 'status' {
            return this.status === 'offline' ? 'alert' : 'status';
        }
    },
    methods: {
        reload(): void {
            window.location.reload();
        }
    }
});
</script>

<template>
    <div
        class="kami-realtime-chip"
        :class="`kami-realtime-chip--${status}`"
        :data-realtime-status="status"
        :role="role"
        aria-live="polite"
    >
        <span
            class="kami-realtime-chip__icone"
            aria-hidden="true"
        >
            <KamiIcon
                :name="icon"
                :size="14"
            />
        </span>
        <span class="kami-realtime-chip__texto">{{ label }}</span>
        <button
            v-if="status === 'offline'"
            type="button"
            class="kami-realtime-chip__acao"
            @click="reload"
        >
            RECARREGAR
        </button>
    </div>
</template>
