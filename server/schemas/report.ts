import { z } from 'zod';

export const reportProblemSchema = z.object({
    message: z
        .string()
        .trim()
        .min(10, 'Descreva o problema com pelo menos 10 caracteres.')
        .max(2000, 'O reporte deve ter no máximo 2000 caracteres.'),
    page: z.string().trim().max(2048).optional().default('')
});
