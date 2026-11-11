export function readCookieValue(header: string | string[] | undefined, name: string): string | null {
    const source = Array.isArray(header) ? header.join(';') : header;

    if (!source) {
        return null;
    }

    for (const part of source.split(';')) {
        const separator = part.indexOf('=');

        if (separator <= 0) {
            continue;
        }

        if (part.slice(0, separator).trim() !== name) {
            continue;
        }

        const value = part.slice(separator + 1).trim();

        if (!value) {
            return null;
        }

        try {
            return decodeURIComponent(value);
        } catch {
            return value;
        }
    }

    return null;
}
