import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import * as adminService from '../services/adminService';
import { runElectronicDraw, verifyAndPublishWinner } from '../services/drawService';
import { parseCodesFromCsv } from '../utils/parseCodesCsv';

const handleError = (res: Response, error: unknown) => {
  const err = error as { status?: number; message?: string };
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
};

const pageLimit = (req: AuthRequest, fallback = 100) => {
  const n = Number(req.query.limit);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), 200);
};

const param = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value || '');

const bodyIds = (req: AuthRequest) => (Array.isArray(req.body?.ids) ? req.body.ids.map(String) : []);

export const entrantsHandler = async (req: AuthRequest, res: Response) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = pageLimit(req);
    const search = String(req.query.search || '');
    const accountType = String(req.query.accountType || '');
    const status = String(req.query.status || '');
    const sortBy = String(req.query.sortBy || 'codes');
    const minCodes = Number(req.query.minCodes) || 0;
    res.json(await adminService.listEntrants(page, limit, search, accountType, status, sortBy, minCodes));
  } catch (error) {
    handleError(res, error);
  }
};

export const entrantDetailHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await adminService.getEntrantDetail(param(req.params.entrantId)));
  } catch (error) {
    handleError(res, error);
  }
};

export const blockHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await adminService.setEntrantBlocked(param(req.params.entrantId), true, req.userId!));
  } catch (error) {
    handleError(res, error);
  }
};

export const unblockHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await adminService.setEntrantBlocked(param(req.params.entrantId), false, req.userId!));
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteEntrantHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await adminService.deleteEntrantKeepCodes(param(req.params.entrantId), req.userId!));
  } catch (error) {
    handleError(res, error);
  }
};

export const bulkDeleteEntrantsHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await adminService.bulkDeleteEntrants(bodyIds(req), req.userId!));
  } catch (error) {
    handleError(res, error);
  }
};

export const importCodesHandler = async (req: AuthRequest, res: Response) => {
  try {
    const codes: string[] = Array.isArray(req.body.codes)
      ? req.body.codes.map((c: string) => String(c).trim().toUpperCase()).filter(Boolean)
      : parseCodesFromCsv(String(req.body.csv || ''));
    if (!codes.length) {
      res.status(400).json({ message: 'No valid codes found in upload' });
      return;
    }
    const batch = req.body.batch || `batch-${Date.now()}`;
    res.json(await adminService.importCodes(codes, batch, req.userId!));
  } catch (error) {
    handleError(res, error);
  }
};

export const codeStatsHandler = async (_req: AuthRequest, res: Response) => {
  try {
    res.json(await adminService.codeStats());
  } catch (error) {
    handleError(res, error);
  }
};

export const submissionsHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(
      await adminService.listSubmissions(
        Number(req.query.page) || 1,
        pageLimit(req),
        req.query.result as string | undefined,
        String(req.query.search || '')
      )
    );
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteSubmissionHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await adminService.deleteSubmission(param(req.params.id)));
  } catch (error) {
    handleError(res, error);
  }
};

export const bulkDeleteSubmissionsHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await adminService.bulkDeleteSubmissions(bodyIds(req)));
  } catch (error) {
    handleError(res, error);
  }
};

export const flaggedHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(
      await adminService.flaggedCodes(
        Number(req.query.page) || 1,
        pageLimit(req),
        String(req.query.search || ''),
        String(req.query.kind || '')
      )
    );
  } catch (error) {
    handleError(res, error);
  }
};

export const exportEntriesHandler = async (_req: AuthRequest, res: Response) => {
  try {
    const csv = await adminService.exportEntriesCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="vita-malt-entries.csv"');
    res.send(csv);
  } catch (error) {
    handleError(res, error);
  }
};

export const exportEntrantsHandler = async (_req: AuthRequest, res: Response) => {
  try {
    const csv = await adminService.exportEntrantsCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="vita-malt-users.csv"');
    res.send(csv);
  } catch (error) {
    handleError(res, error);
  }
};

export const exportWinnersHandler = async (_req: AuthRequest, res: Response) => {
  try {
    const csv = await adminService.exportWinnersCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="vita-malt-winners.csv"');
    res.send(csv);
  } catch (error) {
    handleError(res, error);
  }
};

export const createInstantWinnerHandler = async (req: AuthRequest, res: Response) => {
  try {
    const photoUrl = req.file ? adminService.saveUpload(req.file) : req.body.photoUrl;
    res.status(201).json(await adminService.upsertInstantWinner({ ...req.body, photoUrl }));
  } catch (error) {
    handleError(res, error);
  }
};

export const updateWinnerHandler = async (req: AuthRequest, res: Response) => {
  try {
    const photoUrl = req.file ? adminService.saveUpload(req.file) : req.body.photoUrl;
    res.json(await adminService.updateWinner(param(req.params.winnerId), { ...req.body, photoUrl }));
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteWinnerHandler = async (req: AuthRequest, res: Response) => {
  try {
    await adminService.deleteWinner(param(req.params.winnerId));
    res.json({ message: 'Winner removed' });
  } catch (error) {
    handleError(res, error);
  }
};

export const listWinnersHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(
      await adminService.listWinnersAdmin(
        Number(req.query.page) || 1,
        pageLimit(req),
        String(req.query.search || ''),
        String(req.query.status || ''),
        String(req.query.tier || '')
      )
    );
  } catch (error) {
    handleError(res, error);
  }
};

export const runDrawHandler = async (req: AuthRequest, res: Response) => {
  try {
    const winners = await runElectronicDraw(req.userId!, req.ip);
    res.json({ winners });
  } catch (error) {
    handleError(res, error);
  }
};

export const winnerActionHandler = async (req: AuthRequest, res: Response) => {
  try {
    const winner = await verifyAndPublishWinner(
      param(req.params.winnerId),
      req.userId!,
      req.body.action,
      req.body.notes
    );
    res.json(winner);
  } catch (error) {
    handleError(res, error);
  }
};

export const contactListHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(
      await adminService.listContactMessages(
        Number(req.query.page) || 1,
        pageLimit(req),
        String(req.query.search || ''),
        String(req.query.unread || '') === '1' || String(req.query.unread || '') === 'true'
      )
    );
  } catch (error) {
    handleError(res, error);
  }
};

export const contactReadHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await adminService.markContactRead(param(req.params.id)));
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteContactHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await adminService.deleteContactMessage(param(req.params.id), req.userId!));
  } catch (error) {
    handleError(res, error);
  }
};

export const bulkDeleteContactHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await adminService.bulkDeleteContact(bodyIds(req), req.userId!));
  } catch (error) {
    handleError(res, error);
  }
};

export const socialListHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(
      await adminService.listSocialPostsAdmin(
        Number(req.query.page) || 1,
        pageLimit(req),
        String(req.query.search || ''),
        String(req.query.platform || '')
      )
    );
  } catch (error) {
    handleError(res, error);
  }
};

export const socialCreateHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.status(201).json(await adminService.createSocialPost(req.body));
  } catch (error) {
    handleError(res, error);
  }
};

export const socialUpdateHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await adminService.updateSocialPost(param(req.params.id), req.body));
  } catch (error) {
    handleError(res, error);
  }
};

export const socialDeleteHandler = async (req: AuthRequest, res: Response) => {
  try {
    await adminService.deleteSocialPost(param(req.params.id));
    res.json({ message: 'Removed' });
  } catch (error) {
    handleError(res, error);
  }
};

export const bulkDeleteSocialHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await adminService.bulkDeleteSocial(bodyIds(req)));
  } catch (error) {
    handleError(res, error);
  }
};

export const overviewHandler = async (_req: AuthRequest, res: Response) => {
  try {
    res.json(await adminService.overviewStats());
  } catch (error) {
    handleError(res, error);
  }
};

export const auditHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(
      await adminService.listAuditLogs(
        Number(req.query.page) || 1,
        pageLimit(req),
        String(req.query.search || ''),
        String(req.query.actorType || '')
      )
    );
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteAuditHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await adminService.deleteAuditLog(param(req.params.id)));
  } catch (error) {
    handleError(res, error);
  }
};

export const bulkDeleteAuditHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await adminService.bulkDeleteAudit(bodyIds(req)));
  } catch (error) {
    handleError(res, error);
  }
};

export const drawPreviewHandler = async (_req: AuthRequest, res: Response) => {
  try {
    res.json(await adminService.drawPoolPreview());
  } catch (error) {
    handleError(res, error);
  }
};

export const drawEntriesHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(
      await adminService.listDrawEntries(
        Number(req.query.page) || 1,
        pageLimit(req),
        String(req.query.search || ''),
        String(req.query.winner || '')
      )
    );
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteDrawEntryHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await adminService.deleteDrawEntry(param(req.params.id)));
  } catch (error) {
    handleError(res, error);
  }
};

export const bulkDeleteDrawEntriesHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await adminService.bulkDeleteDrawEntries(bodyIds(req)));
  } catch (error) {
    handleError(res, error);
  }
};

export const listCodesHandler = async (req: AuthRequest, res: Response) => {
  try {
    res.json(
      await adminService.listCodes(
        Number(req.query.page) || 1,
        pageLimit(req),
        String(req.query.search || ''),
        String(req.query.status || '')
      )
    );
  } catch (error) {
    handleError(res, error);
  }
};
