export interface StatisticsData {
    users: number;
    activeUsers: number;
    sheets: number;
    interactions: number;
}

export type StatisticsSource = 'query' | 'cache' | 'stale-cache' | 'unavailable';

export interface StatisticsResponse {
    available: boolean;
    data: StatisticsData | null;
    updatedAt: string | null;
    expired: boolean;
    source: StatisticsSource;
}
