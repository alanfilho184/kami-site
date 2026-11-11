import { z } from 'zod';

/**
 * O e-mail é normalizado antes de validar para que espaços acidentais e
 * diferenças de caixa não impeçam o cadastro ou o login. A senha não sofre
 * trim: espaços fazem parte do valor original.
 */
const emailSchema = z.preprocess(
    value => (typeof value === 'string' ? value.trim().toLowerCase() : value),
    z.string().email().max(254)
);

export const usernameSchema = z.preprocess(
    value => (typeof value === 'string' ? value.trim() : value),
    z
        .string()
        .min(3, 'O nome de usuário deve ter pelo menos 3 caracteres')
        .max(32, 'O nome de usuário deve ter no máximo 32 caracteres')
        .regex(/^[a-zA-Z0-9_]+$/, 'O nome de usuário deve conter apenas letras, números e underline')
);

export const passwordSchema = z
    .string()
    .min(8, 'A senha deve ter pelo menos 8 caracteres')
    .max(256)
    .refine(value => Buffer.byteLength(value, 'utf8') <= 72, {
        message: 'A senha deve ter no máximo 72 bytes'
    });

export const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1).max(256)
});

export const registerSchema = z.object({
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    acceptedTerms: z.literal(true)
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
