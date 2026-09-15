import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { getJwtSecret } from '../utils/validators';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');

  if (!token) {
    res.status(401).json({ message: 'Access denied. No token provided.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { userId?: string; role?: string };
    if (!decoded.userId) {
      res.status(400).json({ message: 'Invalid token structure.' });
      return;
    }
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

export const optionalAuth = (req: AuthRequest, _res: Response, next: NextFunction): void => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    next();
    return;
  }
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { userId?: string; role?: string };
    if (decoded.userId) {
      req.userId = decoded.userId;
      req.userRole = decoded.role;
    }
  } catch {
    // ignore invalid token for optional auth
  }
  next();
};
