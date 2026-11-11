import { describe, expect, it } from 'vitest';
import {
    buildReportWebhookPayload,
    isDiscordWebhookUrl,
    normalizeOwnerDiscordId
} from '../../server/utils/report-webhook';

const now = new Date('2026-11-07T18:00:00.000Z');

describe('webhook de reporte de problema', () => {
    it('menciona o owner e inclui usuário, página e mensagem', () => {
        const payload = buildReportWebhookPayload(
            {
                userId: 42,
                username: 'lyra',
                message: 'A ficha não salvou.',
                page: 'https://kamiapp.com.br/42/ficha/Imak',
                ownerDiscordId: '123456789012345678'
            },
            now
        );

        expect(payload).toMatchObject({
            content: '<@123456789012345678> Novo reporte de problema recebido.',
            allowed_mentions: {
                parse: [],
                users: ['123456789012345678']
            },
            embeds: [
                {
                    title: 'Reporte de problema',
                    color: 0xff2b1d,
                    description: 'A ficha não salvou.',
                    fields: [
                        { name: 'Usuário', value: '@lyra (ID 42)', inline: true },
                        {
                            name: 'Página',
                            value: 'https://kamiapp.com.br/42/ficha/Imak',
                            inline: false
                        }
                    ],
                    timestamp: now.toISOString()
                }
            ]
        });
    });

    it('não menciona ninguém quando o owner não está configurado', () => {
        const payload = buildReportWebhookPayload(
            {
                userId: 42,
                username: null,
                message: 'Problema no editor.',
                page: '',
                ownerDiscordId: null
            },
            now
        );

        expect(payload).toMatchObject({
            content: 'Novo reporte de problema recebido.',
            allowed_mentions: { parse: [], users: [] }
        });
        expect(payload.embeds).toEqual([
            expect.objectContaining({
                fields: expect.arrayContaining([
                    expect.objectContaining({ name: 'Usuário', value: '@sem username (ID 42)' }),
                    expect.objectContaining({ name: 'Página', value: 'não informada' })
                ])
            })
        ]);
    });

    it('valida o owner ID e a URL de webhook do Discord', () => {
        expect(normalizeOwnerDiscordId('123456789012345678')).toBe('123456789012345678');
        expect(normalizeOwnerDiscordId('123')).toBeNull();
        expect(normalizeOwnerDiscordId(null)).toBeNull();
        expect(isDiscordWebhookUrl('https://discord.com/api/webhooks/123/token')).toBe(true);
        expect(isDiscordWebhookUrl('https://discordapp.com/api/webhooks/123/token')).toBe(true);
        expect(isDiscordWebhookUrl('https://example.com/api/webhooks/123/token')).toBe(false);
        expect(isDiscordWebhookUrl('http://discord.com/api/webhooks/123/token')).toBe(false);
        expect(isDiscordWebhookUrl(null)).toBe(false);
    });
});
