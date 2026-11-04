export interface PanelAccount {
    id: number;
    username: string | null;
    email: string | null;
    avatar: string | null;
    createdAt: string;
    discordLinked: boolean;
}

export interface PanelSummary {
    sheets: number;
    publicSheets: number;
    liveSheets: number;
    macros: number;
}

export interface SheetListItem {
    id: number;
    userId: number;
    name: string;
    isPublic: boolean;
    isLegacy: boolean;
    isLive: boolean;
    updatedAt: string;
}

export interface LiveSheetItem {
    id: number;
    sheetId: number;
    sheetName: string;
    channelId: string;
    messageId: string;
    lastUse: string;
}

export interface MacroListItem {
    id: number;
    name: string;
    isPublic: boolean;
    updatedAt: string;
}

export interface PanelResponse {
    account: PanelAccount;
    summary: PanelSummary;
    recentSheets: SheetListItem[];
}

export interface AccountResponse {
    account: PanelAccount;
}

export interface PasswordChangeResponse {
    message: string;
}
