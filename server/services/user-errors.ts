export class EmailAlreadyRegisteredError extends Error {
    constructor() {
        super('E-mail já cadastrado');
        this.name = 'EmailAlreadyRegisteredError';
    }
}

export class UsernameAlreadyTakenError extends Error {
    constructor() {
        super('Nome de usuário já cadastrado');
        this.name = 'UsernameAlreadyTakenError';
    }
}

export class InvalidCurrentPasswordError extends Error {
    constructor() {
        super('Senha atual incorreta');
        this.name = 'InvalidCurrentPasswordError';
    }
}
