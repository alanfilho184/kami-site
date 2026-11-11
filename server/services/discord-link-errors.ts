import type { DiscordLinkErrorResponse } from '~~/shared/types/discord';

export type DiscordLinkErrorCode = NonNullable<DiscordLinkErrorResponse['code']>;

export class DiscordLinkError extends Error {
    readonly code: DiscordLinkErrorCode;
    readonly statusCode: number;
    readonly duplicateSheetNames: string[];

    constructor(code: DiscordLinkErrorCode, statusCode: number, message: string, duplicateSheetNames: string[] = []) {
        super(message);
        this.name = 'DiscordLinkError';
        this.code = code;
        this.statusCode = statusCode;
        this.duplicateSheetNames = duplicateSheetNames;
    }
}

export interface DiscordLinkErrorDetails {
    statusCode: number;
    response: DiscordLinkErrorResponse;
}

export function resolveDiscordLinkError(error: unknown): DiscordLinkErrorDetails | null {
    if (!(error instanceof DiscordLinkError)) {
        return null;
    }

    return {
        statusCode: error.statusCode,
        response: {
            message: error.message,
            code: error.code,
            duplicateSheetNames: error.duplicateSheetNames.length ? error.duplicateSheetNames : undefined
        }
    };
}
