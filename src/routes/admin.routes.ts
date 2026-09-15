import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { adminMiddleware } from '../middlewares/adminMiddleware';
import { adminLoginHandler } from '../controllers/authController';
import { authLimiter } from '../middlewares/rateLimit';
import { uploadsDir } from '../services/adminService';
import {
  entrantsHandler,
  entrantDetailHandler,
  blockHandler,
  unblockHandler,
  deleteEntrantHandler,
  importCodesHandler,
  codeStatsHandler,
  listCodesHandler,
  submissionsHandler,
  flaggedHandler,
  exportEntriesHandler,
  exportWinnersHandler,
  exportEntrantsHandler,
  createInstantWinnerHandler,
  updateWinnerHandler,
  deleteWinnerHandler,
  listWinnersHandler,
  runDrawHandler,
  winnerActionHandler,
  contactListHandler,
  contactReadHandler,
  socialListHandler,
  socialCreateHandler,
  socialUpdateHandler,
  socialDeleteHandler,
  overviewHandler,
  auditHandler,
  drawPreviewHandler,
  drawEntriesHandler,
} from '../controllers/adminController';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir()),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '.jpg');
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

router.post('/login', authLimiter, adminLoginHandler);
router.use(adminMiddleware);

router.get('/overview', overviewHandler);
router.get('/audit', auditHandler);
router.get('/draw/preview', drawPreviewHandler);
router.get('/draw/entries', drawEntriesHandler);

router.get('/entrants', entrantsHandler);
router.get('/entrants/:entrantId', entrantDetailHandler);
router.patch('/entrants/:entrantId/block', blockHandler);
router.patch('/entrants/:entrantId/unblock', unblockHandler);
router.delete('/entrants/:entrantId', deleteEntrantHandler);

router.post('/codes/import', importCodesHandler);
router.get('/codes/stats', codeStatsHandler);
router.get('/codes', listCodesHandler);
router.get('/codes/flagged', flaggedHandler);
router.get('/submissions', submissionsHandler);

router.get('/export/entries', exportEntriesHandler);
router.get('/export/winners', exportWinnersHandler);
router.get('/export/entrants', exportEntrantsHandler);

router.get('/winners', listWinnersHandler);
router.post('/winners/instant', upload.single('photo'), createInstantWinnerHandler);
router.patch('/winners/:winnerId', upload.single('photo'), updateWinnerHandler);
router.delete('/winners/:winnerId', deleteWinnerHandler);
router.post('/winners/:winnerId/action', winnerActionHandler);
router.post('/draw/run', runDrawHandler);

router.get('/contact', contactListHandler);
router.patch('/contact/:id/read', contactReadHandler);

router.get('/social', socialListHandler);
router.post('/social', socialCreateHandler);
router.patch('/social/:id', socialUpdateHandler);
router.delete('/social/:id', socialDeleteHandler);

export default router;
