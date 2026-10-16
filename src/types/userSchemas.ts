import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  email: z.string().trim().email('email must be a valid email address'),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  email: z.string().trim().email('email must be a valid email address'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
