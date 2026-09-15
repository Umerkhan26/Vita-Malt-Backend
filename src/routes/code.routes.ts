import { Router } from 'express';
import { submitCodeHandler, lookupHandler, dashboardHandler } from '../controllers/codeController';
import { authMiddleware, optionalAuth } from '../middlewares/authMiddleware';
import { submitLimiter, lookupLimiter } from '../middlewares/rateLimit';

const router = Router();

router.post('/submit-code', submitLimiter, optionalAuth, submitCodeHandler);
router.post('/lookup-entries', lookupLimiter, lookupHandler);
router.get('/me/dashboard', authMiddleware, dashboardHandler);

export default router;
