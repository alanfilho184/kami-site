const sensitiveKeys =
    /senha|password|token|secret|authorization|cookie|sessao|session|sync_code|formattedcode|discord_?id|api_key/i;
const credentialUrl = /(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi;
const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const MAX_DEPTH = 6;

/**
 * Redige a senha embutida em URLs de conexão, mascara e-mails e remove
 * quebras de linha para manter uma linha JSON por evento.
 */
export function maskEmails(text: string): string {
    return text.replace(emailPattern, match => {
        const at = match.indexOf('@');
        return `${match.slice(0, 1)}***@${match.slice(at + 1)}`;
    });
}

function redactText(text: string): string {
    return maskEmails(text.replace(credentialUrl, '$1***@')).replace(/\s+/g, ' ');
}

function redactValue(value: unknown, depth = 0): unknown {
    if (depth > MAX_DEPTH) {
        return '[limit]';
    }

    if (typeof value === 'string') {
        return redactText(value);
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (Buffer.isBuffer(value)) {
        return `[buffer: ${value.byteLength} bytes]`;
    }

    if (value instanceof Error) {
        const code = (value as NodeJS.ErrnoException).code;

        return {
            name: value.name,
            message: redactText(value.message),
            stack: value.stack ? redactText(value.stack) : undefined,
            code: code === undefined ? undefined : redactText(String(code))
        };
    }

    if (Array.isArray(value)) {
        return value.map(item => redactValue(item, depth + 1));
    }

    if (value && typeof value === 'object') {
        const output: Record<string, unknown> = {};

        for (const [key, content] of Object.entries(value as Record<string, unknown>)) {
            output[key] = sensitiveKeys.test(key) ? '***' : redactValue(content, depth + 1);
        }

        return output;
    }

    return value;
}

export function redactContext(context: unknown): unknown {
    return redactValue(context);
}
