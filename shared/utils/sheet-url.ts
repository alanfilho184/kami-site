/**
 * URL canônica de uma ficha. O `id` só entra como desambiguador para nomes
 * duplicados históricos; fichas novas e nomes únicos usam a URL limpa.
 */
export function sheetPath(userId: number, sheetName: string): string {
    return `/${userId}/ficha/${encodeURIComponent(sheetName)}`;
}

export function sheetUrl(userId: number, sheetName: string, sheetId?: number): string {
    const path = sheetPath(userId, sheetName);

    if (typeof sheetId !== 'number' || !Number.isInteger(sheetId) || sheetId <= 0) {
        return path;
    }

    return `${path}?id=${sheetId}`;
}
