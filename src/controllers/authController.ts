import { Request, Response } from 'express';
import {
  createOptionalAccount,
  registerEntrant,
  verifyOtp,
  resendOtp,
  loginEntrant,
  loginAdmin,
  requestPasswordReset,
  verifyResetOtp,
  resetPassword,
} from '../services/authService';
import { AuthRequest } from '../middlewares/authMiddleware';

const handleError = (res: Response, error: unknown) => {
  const err = error as { status?: number; message?: string };
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
};

export const registerHandler = async (req: Request, res: Response) => {
  try {
    const result = await registerEntrant({
      fullName: req.body.fullName,
      phone: req.body.phone,
      email: req.body.email,
      dateOfBirth: req.body.dateOfBirth || req.body.dob,
      isOver18: req.body.isOver18,
      password: req.body.password,
    });
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error);
  }
};

export const optionalRegister = async (req: AuthRequest, res: Response) => {
  try {
    const entrantId = req.userId || req.body.entrantId;
    if (!entrantId) {
      res.status(400).json({ message: 'entrantId is required' });
      return;
    }
    const result = await createOptionalAccount({
      entrantId,
      password: req.body.password,
      email: req.body.email,
      accountSetupToken: req.body.accountSetupToken,
    });
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error);
  }
};

export const verifyOtpHandler = async (req: Request, res: Response) => {
  try {
    const result = await verifyOtp(req.body.email, req.body.otp);
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

export const resendOtpHandler = async (req: Request, res: Response) => {
  try {
    const result = await resendOtp(req.body.email);
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

export const loginHandler = async (req: Request, res: Response) => {
  try {
    const result = await loginEntrant(req.body.identifier || req.body.email || req.body.phone, req.body.password);
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

export const adminLoginHandler = async (req: Request, res: Response) => {
  try {
    const result = await loginAdmin(req.body.identifier || req.body.email, req.body.password);
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

export const forgotPasswordHandler = async (req: Request, res: Response) => {
  try {
    const result = await requestPasswordReset(req.body.email);
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

export const verifyResetOtpHandler = async (req: Request, res: Response) => {
  try {
    const result = await verifyResetOtp(req.body.email, req.body.otp);
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

export const resetPasswordHandler = async (req: Request, res: Response) => {
  try {
    const result = await resetPassword({
      token: req.body.token,
      email: req.body.email,
      otp: req.body.otp,
      password: req.body.password,
    });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};
