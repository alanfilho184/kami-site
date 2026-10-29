import { describe, expect, it } from 'vitest';
import { environmentLabel, formatDate, formatDateTime, formatNumber, formatTime } from '../../shared/utils/formatting';

describe('formatting', () => {
    it('formata números no padrão pt-BR', () => {
        expect(formatNumber(1234567)).toBe('1.234.567');
        expect(formatNumber(0)).toBe('0');
    });

    it('formata datas e horários no fuso de São Paulo', () => {
        expect(formatDateTime('2026-10-28T18:30:00.000Z')).toMatch(/28\/10\/2026/);
        expect(formatDateTime('2026-10-28T18:30:00.000Z')).toMatch(/15:30/);
        expect(formatTime('2026-10-28T18:30:05.000Z')).toBe('15:30:05');
        expect(formatDate('2026-10-28T02:00:00.000Z')).toBe('27/10/2026');
    });

    it('devolve um marcador quando a data é inválida', () => {
        expect(formatDate('não é data')).toBe('-');
        expect(formatDateTime('não é data')).toBe('-');
        expect(formatTime('não é data')).toBe('--:--:--');
    });

    it('traduz o ambiente para o rótulo da interface', () => {
        expect(environmentLabel('development')).toBe('DESENVOLVIMENTO');
        expect(environmentLabel('production')).toBe('PRODUÇÃO');
        expect(environmentLabel('staging')).toBe('STAGING');
    });
});
