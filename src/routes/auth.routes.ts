import { Router } from 'express';
import {
  optionalRegister,
  registerHandler,
  verifyOtpHandler,
  resendOtpHandler,
  loginHandler,
  forgotPasswordHandler,
  verifyResetOtpHandler,
  resetPasswordHandler,
} from '../controllers/authController';
import { optionalAuth } from '../middlewares/authMiddleware';
import { authLimiter } from '../middlewares/rateLimit';

const router = Router();

router.post('/auth/register', authLimiter, registerHandler);
router.post('/auth/register-optional', authLimiter, optionalAuth, optionalRegister);
router.post('/auth/verify-otp', authLimiter, verifyOtpHandler);
router.post('/auth/resend-otp', authLimiter, resendOtpHandler);
router.post('/auth/login', authLimiter, loginHandler);
router.post('/auth/forgot-password', authLimiter, forgotPasswordHandler);
router.post('/auth/verify-reset-otp', authLimiter, verifyResetOtpHandler);
router.post('/auth/reset-password', authLimiter, resetPasswordHandler);

export default router;
