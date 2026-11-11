import { z } from 'zod';

export const discordClaimSchema = z.object({
    code: z.string().trim().min(1).max(32),
    discordId: z
        .string()
        .trim()
        .regex(/^\d{15,22}$/, 'discordId inválido'),
    discordUsername: z.string().trim().max(64).optional()
});
