const DISCORD_SNOWFLAKE = /^\d{17,20}$/;

export interface ReportWebhookInput {
    userId: number;
    username: string | null;
    message: string;
    page: string;
    ownerDiscordId: string | null;
}

export function normalizeOwnerDiscordId(value: string | null | undefined): string | null {
    const candidate = value?.trim() ?? '';

    return DISCORD_SNOWFLAKE.test(candidate) ? candidate : null;
}

export function isDiscordWebhookUrl(value: string | null | undefined): value is string {
    if (!value) {
        return false;
    }

    try {
        const url = new URL(value);

        return (
            url.protocol === 'https:' &&
            (url.hostname === 'discord.com' || url.hostname === 'discordapp.com') &&
            url.pathname.startsWith('/api/webhooks/')
        );
    } catch {
        return false;
    }
}

export function buildReportWebhookPayload(input: ReportWebhookInput, now = new Date()): Record<string, unknown> {
    const ownerDiscordId = normalizeOwnerDiscordId(input.ownerDiscordId);
    const username = input.username?.trim() || 'sem username';
    const page = input.page.trim().slice(0, 1000) || 'não informada';

    return {
        content: ownerDiscordId
            ? `<@${ownerDiscordId}> Novo reporte de problema recebido.`
            : 'Novo reporte de problema recebido.',
        allowed_mentions: {
            parse: [],
            users: ownerDiscordId ? [ownerDiscordId] : []
        },
        embeds: [
            {
                title: 'Reporte de problema',
                color: 0xff2b1d,
                description: input.message,
                fields: [
                    {
                        name: 'Usuário',
                        value: `@${username} (ID ${input.userId})`,
                        inline: true
                    },
                    {
                        name: 'Página',
                        value: page,
                        inline: false
                    }
                ],
                timestamp: now.toISOString()
            }
        ]
    };
}
