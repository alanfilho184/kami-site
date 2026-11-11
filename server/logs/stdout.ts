import type { LogLevel } from './types';

export interface LogRecord {
    timestamp: string;
    level: LogLevel;
    service: 'kami-site';
    message: string;
    context?: unknown;
}

/**
 * Mantém o formato de uma linha JSON por evento que o PM2 já consome.
 * O `console` fica confinado a este módulo, como manda o guia do projeto.
 */
export function writeLogRecord(record: LogRecord): void {
    const line = JSON.stringify(record);

    if (record.level === 'warn' || record.level === 'error') {
        console.error(line);
        return;
    }

    console.log(line);
}
