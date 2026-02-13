import { Router } from 'express';
import { login, refreshToken, register } from '../controllers/auth.controller';

export const authRoutes = Router();

authRoutes.post('/login', login);
authRoutes.post('/register', register);
authRoutes.post('/refresh', refreshToken);
