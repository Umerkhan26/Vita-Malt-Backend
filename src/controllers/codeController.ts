import { Response } from 'express';
import { submitCode, lookupEntries, getDashboard } from '../services/codeService';
import { AuthRequest } from '../middlewares/authMiddleware';

const handleError = (res: Response, error: unknown) => {
  const err = error as { status?: number; message?: string };
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
};

export const submitCodeHandler = async (req: AuthRequest, res: Response) => {
  try {
    const result = await submitCode({
      code: req.body.code,
      userId: req.userId,
      fullName: req.body.fullName,
      phone: req.body.phone,
      email: req.body.email,
      dateOfBirth: req.body.dateOfBirth || req.body.dob,
      isOver18: req.body.isOver18,
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
    });
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error);
  }
};

export const lookupHandler = async (req: AuthRequest, res: Response) => {
  try {
    const result = await lookupEntries({
      fullName: req.body.fullName,
      phone: req.body.phone,
      email: req.body.email,
    });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

export const dashboardHandler = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const result = await getDashboard(req.userId);
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};
