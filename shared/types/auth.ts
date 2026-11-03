export interface AuthUser {
    id: number;
    username: string | null;
    email: string | null;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface RegisterRequest {
    username: string;
    email: string;
    password: string;
    acceptedTerms: true;
}

export interface AuthResponse {
    user: AuthUser;
}

export interface AuthErrorResponse {
    message: string;
}
