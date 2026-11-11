import { z } from 'zod';
import { passwordSchema, usernameSchema } from './auth';

export const updateAccountSchema = z.object({
    username: usernameSchema
});

export const changePasswordSchema = z
    .object({
        currentPassword: z.string().min(1).max(256),
        newPassword: passwordSchema,
        confirmation: z.string().min(1).max(256)
    })
    .refine(data => data.newPassword === data.confirmation, {
        path: ['confirmation'],
        message: 'As senhas não coincidem'
    });

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
