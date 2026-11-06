import type { SheetErrorResponse } from '~~/shared/types/sheet';
import { SHEET_LIMIT_FREE } from '~~/shared/constants/sheet';

export type SheetErrorCode = NonNullable<SheetErrorResponse['code']>;

export class SheetError extends Error {
    readonly code: SheetErrorCode;
    readonly statusCode: number;

    constructor(code: SheetErrorCode, statusCode: number, message: string) {
        super(message);
        this.name = 'SheetError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

export class InvalidSheetError extends SheetError {
    constructor(message = 'Confira os dados da ficha.') {
        super('invalid_sheet', 400, message);
        this.name = 'InvalidSheetError';
    }
}

export class SheetNotFoundError extends SheetError {
    constructor() {
        super('sheet_not_found', 404, 'Ficha não encontrada.');
        this.name = 'SheetNotFoundError';
    }
}

export class SheetConflictError extends SheetError {
    constructor() {
        super('sheet_conflict', 409, 'A ficha foi alterada em outra janela. Recarregue e tente novamente.');
        this.name = 'SheetConflictError';
    }
}

export class SheetNameTakenError extends SheetError {
    constructor() {
        super('sheet_name_taken', 409, 'Você já tem uma ficha com esse nome. Escolha outro.');
        this.name = 'SheetNameTakenError';
    }
}

export class SheetLiveError extends SheetError {
    constructor() {
        super(
            'sheet_live',
            423,
            'Esta ficha está ao vivo no Discord e só poderá ser editada na D5. Enquanto isso, ela é somente leitura.'
        );
        this.name = 'SheetLiveError';
    }
}

export class SheetLimitError extends SheetError {
    constructor() {
        super(
            'sheet_limit_reached',
            403,
            `Você atingiu o limite de ${SHEET_LIMIT_FREE} fichas da conta. Exclua uma ficha para criar outra.`
        );
        this.name = 'SheetLimitError';
    }
}

export interface SheetErrorDetails {
    statusCode: number;
    response: SheetErrorResponse;
}

export function resolveSheetError(error: unknown): SheetErrorDetails | null {
    if (!(error instanceof SheetError)) {
        return null;
    }

    return {
        statusCode: error.statusCode,
        response: {
            message: error.message,
            code: error.code
        }
    };
}
