const defaultTimeZone = 'America/Sao_Paulo';

const environmentLabels: Record<string, string> = {
    development: 'DESENVOLVIMENTO',
    production: 'PRODUÇÃO',
    test: 'TESTE'
};

function toDate(value: Date | string | number): Date | null {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function formatNumber(value: number): string {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
}

export function formatDate(value: Date | string | number, timeZone: string = defaultTimeZone): string {
    const date = toDate(value);

    if (!date) {
        return '-';
    }

    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeZone
    }).format(date);
}

export function formatTime(value: Date | string | number, timeZone: string = defaultTimeZone): string {
    const date = toDate(value);

    if (!date) {
        return '--:--:--';
    }

    return new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
        timeZone
    }).format(date);
}

export function formatDateTime(value: Date | string | number, timeZone: string = defaultTimeZone): string {
    const date = toDate(value);

    if (!date) {
        return '-';
    }

    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone
    }).format(date);
}

export function environmentLabel(environment: string): string {
    return environmentLabels[environment.toLowerCase()] ?? environment.toUpperCase();
}
