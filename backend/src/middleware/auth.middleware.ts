import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { CustomError } from './errorHandler';
import { prisma } from '../config/database';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  organizationId?: string;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new CustomError('Authentication required', 401);
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    const decoded = jwt.verify(token, jwtSecret) as {
      userId: string;
      role: string;
      organizationId?: string;
    };

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, isActive: true, organizationId: true }
    });

    if (!user || !user.isActive) {
      throw new CustomError('User not found or inactive', 401);
    }

    req.userId = user.id;
    req.userRole = user.role;
    req.organizationId = user.organizationId || undefined;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new CustomError('Invalid token', 401));
    } else {
      next(error);
    }
  }
};

export const authorize = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userRole) {
      return next(new CustomError('Authentication required', 401));
    }

    if (!allowedRoles.includes(req.userRole)) {
      return next(new CustomError('Insufficient permissions', 403));
    }

    next();
  };
};
