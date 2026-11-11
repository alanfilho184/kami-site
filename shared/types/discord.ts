export type DiscordLinkStatus = 'unlinked' | 'pending' | 'claimed' | 'linked';

export interface DiscordMergePreview {
    siteUsername: string;
    discordId: string;
    discordUsername: string | null;
    botAccountExists: boolean;
    botUserId: number | null;
    botSheets: number;
    botLiveSheets: number;
    siteSheets: number;
    combinedSheets: number;
    sheetLimit: number | null;
    exceedsSheetLimit: boolean;
    duplicateSheetNames: string[];
    canMerge: boolean;
    blockedReason: 'full_account' | null;
}

export interface DiscordLinkState {
    status: DiscordLinkStatus;
    discordId: string | null;
    discordUsername: string | null;
    expiresAt: string | null;
    preview: DiscordMergePreview | null;
}

export interface DiscordCodeResponse {
    code: string;
    formattedCode: string;
    command: string;
    expiresAt: string;
}

export interface DiscordClaimRequest {
    code: string;
    discordId: string;
    discordUsername?: string;
}

export interface DiscordClaimResponse {
    ok: true;
    siteUsername: string;
}

export interface DiscordLinkErrorResponse {
    message: string;
    code?:
        | 'discord_code_invalid'
        | 'discord_already_linked'
        | 'discord_full_account'
        | 'discord_duplicate_sheet_names'
        | 'discord_link_unavailable';
    duplicateSheetNames?: string[];
}
