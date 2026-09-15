import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import Entrant from '../models/entrant.model';
import { getJwtSecret } from '../utils/validators';
import { AuthRequest } from './authMiddleware';

export const adminMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.header('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) {
      res.status(401).json({ message: 'Authorization token required' });
      return;
    }

    const decoded = jwt.verify(token, getJwtSecret()) as { userId?: string };
    const user = await Entrant.findById(decoded.userId);
    if (!user) {
      res.status(401).json({ message: 'User not found' });
      return;
    }
    if (user.role !== 'admin') {
      res.status(403).json({ message: 'Admin access required' });
      return;
    }

    req.userId = user._id.toString();
    req.userRole = 'admin';
    (req as AuthRequest & { user?: typeof user }).user = user;
    next();
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err.name === 'JsonWebTokenError') {
      res.status(401).json({ message: 'Invalid token' });
      return;
    }
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ message: 'Token expired' });
      return;
    }
    res.status(500).json({ message: 'Server error' });
  }
};
