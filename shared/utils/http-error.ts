export function errorStatus(error: unknown): number | null {
    if (!error || typeof error !== 'object' || !('statusCode' in error)) {
        return null;
    }

    const status = Number((error as { statusCode?: unknown }).statusCode);
    return Number.isFinite(status) ? status : null;
}

export function serverErrorMessage(error: unknown): string | null {
    if (!error || typeof error !== 'object' || !('data' in error)) {
        return null;
    }

    const data = (error as { data?: unknown }).data;

    if (!data || typeof data !== 'object' || !('message' in data)) {
        return null;
    }

    const message = (data as { message?: unknown }).message;
    return typeof message === 'string' ? message : null;
}

export function serverErrorCode(error: unknown): string | null {
    if (!error || typeof error !== 'object' || !('data' in error)) {
        return null;
    }

    const data = (error as { data?: unknown }).data;

    if (!data || typeof data !== 'object' || !('code' in data)) {
        return null;
    }

    const code = (data as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
}
