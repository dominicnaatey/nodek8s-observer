import { Router, Request, Response, NextFunction } from 'express';
import { userStore } from '../store/userStore.js';
import { createUserSchema, updateUserSchema } from '../types/userSchemas.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

/**
 * FR-1.1 — GET /api/v1/users
 * List all users
 */
router.get('/', (_req: Request, res: Response) => {
  const users = userStore.getAll();
  res.status(200).json(users);
});

/**
 * FR-1.2 — GET /api/v1/users/:id
 * Get one user by ID
 */
router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  const id = req.params['id'] as string;
  const user = userStore.getById(id);

  if (!user) {
    const error: AppError = new Error(`User with id ${id} does not exist`);
    error.statusCode = 404;
    error.code = 'USER_NOT_FOUND';
    return next(error);
  }

  res.status(200).json(user);
});

/**
 * FR-1.3 — POST /api/v1/users
 * Create a user
 */
router.post('/', (req: Request, res: Response, next: NextFunction) => {
  const result = createUserSchema.safeParse(req.body);

  if (!result.success) {
    const error: AppError = new Error('Invalid request body');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    (error as any).details = result.error.flatten().fieldErrors;
    return next(error);
  }

  const user = userStore.create(result.data);
  res.status(201).json(user);
});

/**
 * FR-1.4 — PUT /api/v1/users/:id
 * Update a user
 */
router.put('/:id', (req: Request, res: Response, next: NextFunction) => {
  const id = req.params['id'] as string;
  const result = updateUserSchema.safeParse(req.body);

  if (!result.success) {
    const error: AppError = new Error('Invalid request body');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    (error as any).details = result.error.flatten().fieldErrors;
    return next(error);
  }

  const updatedUser = userStore.update(id, result.data);

  if (!updatedUser) {
    const error: AppError = new Error(`User with id ${id} does not exist`);
    error.statusCode = 404;
    error.code = 'USER_NOT_FOUND';
    return next(error);
  }

  res.status(200).json(updatedUser);
});

/**
 * FR-1.5 — DELETE /api/v1/users/:id
 * Delete a user
 */
router.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
  const id = req.params['id'] as string;
  const deleted = userStore.delete(id);

  if (!deleted) {
    const error: AppError = new Error(`User with id ${id} does not exist`);
    error.statusCode = 404;
    error.code = 'USER_NOT_FOUND';
    return next(error);
  }

  res.status(204).send();
});

export default router;
