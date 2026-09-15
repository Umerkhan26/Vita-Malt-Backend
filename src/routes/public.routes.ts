import { Router } from 'express';
import { publicWinners, publicSocial, contactHandler } from '../controllers/publicController';
import { contactLimiter } from '../middlewares/rateLimit';

const router = Router();

router.get('/winners', publicWinners);
router.get('/social', publicSocial);
router.post('/contact', contactLimiter, contactHandler);

export default router;
