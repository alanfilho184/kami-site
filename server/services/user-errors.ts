export class EmailAlreadyRegisteredError extends Error {
    constructor() {
        super('E-mail já cadastrado');
        this.name = 'EmailAlreadyRegisteredError';
    }
}

export class InvalidCurrentPasswordError extends Error {
    constructor() {
        super('Senha atual incorreta');
        this.name = 'InvalidCurrentPasswordError';
    }
}
