import fs from 'fs';
import path from 'path';
import Entrant from '../models/entrant.model';
import CampaignCode from '../models/campaignCode.model';
import CodeSubmission from '../models/codeSubmission.model';
import DrawEntry from '../models/drawEntry.model';
import Winner from '../models/winner.model';
import ContactMessage from '../models/contactMessage.model';
import SocialPost from '../models/socialPost.model';
import AuditLog from '../models/auditLog.model';
import { writeAudit } from '../utils/audit';

const pageMeta = (page: number, limit: number, totalCount: number) => ({
  page,
  limit,
  totalCount,
  totalPages: Math.ceil(totalCount / limit) || 1,
  hasNextPage: page * limit < totalCount,
  hasPrevPage: page > 1,
});

export const listEntrants = async (
  page = 1,
  limit = 100,
  search = '',
  accountType = '',
  status = '',
  sortBy = 'codes',
  minCodes = 0
) => {
  const filter: Record<string, unknown> = { role: 'user' };
  if (accountType === 'guest') filter.hasAccount = false;
  if (accountType === 'account') filter.hasAccount = true;
  if (status === 'active') filter.isActive = true;
  if (status === 'blocked') filter.isActive = false;
  if (minCodes > 0) filter.validCodeCount = { $gte: minCodes };
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const sort: Record<string, 1 | -1> =
    sortBy === 'entries'
      ? { drawEntryCount: -1, validCodeCount: -1, created_at: -1 }
      : sortBy === 'newest'
        ? { created_at: -1 }
        : { validCodeCount: -1, drawEntryCount: -1, created_at: -1 };

  const skip = (page - 1) * limit;
  const [rawItems, totalCount] = await Promise.all([
    Entrant.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Entrant.countDocuments(filter),
  ]);

  const items = rawItems.map((e, index) => ({
    ...e,
    pendingTowardNext: Array.isArray(e.pendingCodeIds) ? e.pendingCodeIds.length % 4 : 0,
    rank: skip + index + 1,
  }));

  return { items, sortBy, ...pageMeta(page, limit, totalCount) };
};

export const getEntrantDetail = async (entrantId: string) => {
  const entrant = await Entrant.findById(entrantId).lean();
  if (!entrant) throw Object.assign(new Error('Entrant not found'), { status: 404 });
  const codes = await CampaignCode.find({ usedBy: entrantId }).sort({ usedAt: -1 }).lean();
  const entries = await DrawEntry.find({ entrant: entrantId }).sort({ createdAt: -1 }).lean();
  const submissions = await CodeSubmission.find({ entrant: entrantId }).sort({ createdAt: -1 }).limit(100).lean();
  return { entrant, codes, entries, submissions };
};

export const setEntrantBlocked = async (entrantId: string, blocked: boolean, adminId: string) => {
  const entrant = await Entrant.findByIdAndUpdate(entrantId, { isActive: !blocked }, { new: true });
  if (!entrant) throw Object.assign(new Error('Entrant not found'), { status: 404 });
  await writeAudit({
    action: blocked ? 'entrant_blocked' : 'entrant_unblocked',
    actor: adminId,
    actorType: 'admin',
    metadata: { entrantId },
  });
  return entrant;
};

export const deleteEntrantKeepCodes = async (entrantId: string, adminId: string) => {
  const entrant = await Entrant.findById(entrantId);
  if (!entrant) throw Object.assign(new Error('Entrant not found'), { status: 404 });
  if (entrant.role === 'admin') throw Object.assign(new Error('Cannot delete admin'), { status: 400 });

  await DrawEntry.deleteMany({ entrant: entrantId });
  await CodeSubmission.deleteMany({ entrant: entrantId });
  await Entrant.deleteOne({ _id: entrantId });
  await writeAudit({
    action: 'entrant_deleted_codes_retained',
    actor: adminId,
    actorType: 'admin',
    metadata: { entrantId },
  });
  return { message: 'Entrant deleted. Redeemed codes remain used and are not recycled.' };
};

export const importCodes = async (rawCodes: string[], batch: string, adminId: string) => {
  const unique = [...new Set(rawCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  let inserted = 0;
  let skipped = 0;
  for (const code of unique) {
    try {
      await CampaignCode.create({ code, status: 'unused', sourceBatch: batch });
      inserted += 1;
    } catch {
      skipped += 1;
    }
  }
  await writeAudit({
    action: 'codes_imported',
    actor: adminId,
    actorType: 'admin',
    metadata: { inserted, skipped, batch },
  });
  return { inserted, skipped, total: unique.length };
};

export const codeStats = async () => {
  const [total, unused, used, flagged, duplicateAttempts] = await Promise.all([
    CampaignCode.countDocuments(),
    CampaignCode.countDocuments({ status: 'unused' }),
    CampaignCode.countDocuments({ status: 'used' }),
    CampaignCode.countDocuments({ status: 'flagged' }),
    CampaignCode.aggregate([{ $group: { _id: null, total: { $sum: '$duplicateAttemptCount' } } }]),
  ]);
  return {
    total,
    unused,
    used,
    flagged,
    duplicateAttempts: duplicateAttempts[0]?.total || 0,
  };
};

export const listCodes = async (page = 1, limit = 100, search = '', status = '') => {
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { code: { $regex: search, $options: 'i' } },
      { sourceBatch: { $regex: search, $options: 'i' } },
    ];
  }
  const skip = (page - 1) * limit;
  const [items, totalCount] = await Promise.all([
    CampaignCode.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('usedBy', 'fullName phone')
      .lean(),
    CampaignCode.countDocuments(filter),
  ]);
  return { items, ...pageMeta(page, limit, totalCount) };
};

export const listSubmissions = async (page = 1, limit = 100, result?: string, search = '') => {
  const filter: Record<string, unknown> = {};
  if (result) filter.result = result;
  if (search) filter.codeAttempted = { $regex: search, $options: 'i' };
  const skip = (page - 1) * limit;
  const [items, totalCount] = await Promise.all([
    CodeSubmission.find(filter)
      .populate('entrant', 'fullName phone email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    CodeSubmission.countDocuments(filter),
  ]);
  return { items, ...pageMeta(page, limit, totalCount) };
};

export const flaggedCodes = async (page = 1, limit = 100, search = '', kind = '') => {
  const filter: Record<string, unknown> =
    kind === 'flagged'
      ? { status: 'flagged' }
      : kind === 'duplicates'
        ? { duplicateAttemptCount: { $gte: 1 } }
        : { $or: [{ status: 'flagged' }, { duplicateAttemptCount: { $gte: 1 } }] };
  if (search) filter.code = { $regex: search, $options: 'i' };
  const skip = (page - 1) * limit;
  const [items, totalCount] = await Promise.all([
    CampaignCode.find(filter).sort({ duplicateAttemptCount: -1, updatedAt: -1 }).skip(skip).limit(limit).lean(),
    CampaignCode.countDocuments(filter),
  ]);
  return { items, ...pageMeta(page, limit, totalCount) };
};

export const exportEntriesCsv = async (): Promise<string> => {
  const entries = await DrawEntry.find().populate('entrant').sort({ createdAt: 1 });
  const header = 'entryId,entrantName,phone,email,validCodeCount,drawEntryCount,isWinner,prizeTier,createdAt';
  const rows = entries.map((entry) => {
    const e = entry.entrant as unknown as {
      fullName?: string;
      phone?: string;
      email?: string;
      validCodeCount?: number;
      drawEntryCount?: number;
    } | null;
    return [
      entry._id.toString(),
      csv(e?.fullName),
      csv(e?.phone),
      csv(e?.email),
      e?.validCodeCount ?? '',
      e?.drawEntryCount ?? '',
      entry.isWinner,
      entry.prizeTier || '',
      (entry as unknown as { createdAt: Date }).createdAt?.toISOString?.() || '',
    ].join(',');
  });
  return [header, ...rows].join('\n');
};

export const exportWinnersCsv = async (): Promise<string> => {
  const winners = await Winner.find().populate('entrant').sort({ createdAt: 1 });
  const header = 'winnerId,tier,status,displayName,prizeLabel,phone,email,announcedAt';
  const rows = winners.map((w) => {
    const e = w.entrant as unknown as { phone?: string; email?: string } | null;
    return [
      w._id.toString(),
      w.tier,
      w.status,
      csv(w.displayName),
      csv(w.prizeLabel),
      csv(e?.phone),
      csv(e?.email),
      w.announcedAt?.toISOString() || '',
    ].join(',');
  });
  return [header, ...rows].join('\n');
};

export const exportEntrantsCsv = async (): Promise<string> => {
  const entrants = await Entrant.find({ role: 'user' }).sort({ createdAt: 1 }).lean();
  const header =
    'entrantId,fullName,phone,email,accountType,status,validCodeCount,drawEntryCount,createdAt';
  const rows = entrants.map((e) =>
    [
      String(e._id),
      csv(e.fullName),
      csv(e.phone),
      csv(e.email),
      e.hasAccount ? 'account' : 'guest',
      e.isActive === false ? 'blocked' : 'active',
      e.validCodeCount ?? 0,
      e.drawEntryCount ?? 0,
      e.created_at ? new Date(e.created_at as Date).toISOString() : '',
    ].join(',')
  );
  return [header, ...rows].join('\n');
};

const csv = (value?: string) => {
  if (!value) return '';
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
};

export const upsertInstantWinner = async (payload: {
  displayName: string;
  prizeLabel: string;
  photoUrl?: string;
  status?: 'published' | 'verified' | 'pending_verification';
  notes?: string;
}) => {
  return Winner.create({
    tier: 'instant',
    status: payload.status || 'published',
    displayName: payload.displayName,
    prizeLabel: payload.prizeLabel,
    photoUrl: payload.photoUrl,
    announcedAt: payload.status === 'published' || !payload.status ? new Date() : undefined,
    notes: payload.notes,
  });
};

export const updateWinner = async (
  winnerId: string,
  payload: Partial<{ displayName: string; prizeLabel: string; photoUrl: string; notes: string; status: string }>
) => {
  const winner = await Winner.findByIdAndUpdate(winnerId, payload, { new: true });
  if (!winner) throw Object.assign(new Error('Winner not found'), { status: 404 });
  return winner;
};

export const deleteWinner = async (winnerId: string) => {
  await Winner.findByIdAndDelete(winnerId);
};

export const listWinnersAdmin = async (
  page = 1,
  limit = 100,
  search = '',
  status = '',
  tier = ''
) => {
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (tier) filter.tier = tier;
  if (search) {
    filter.$or = [
      { displayName: { $regex: search, $options: 'i' } },
      { prizeLabel: { $regex: search, $options: 'i' } },
      { tier: { $regex: search, $options: 'i' } },
    ];
  }
  const skip = (page - 1) * limit;
  const [items, totalCount] = await Promise.all([
    Winner.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Winner.countDocuments(filter),
  ]);
  return { items, ...pageMeta(page, limit, totalCount) };
};

export const listContactMessages = async (page = 1, limit = 100, search = '', unreadOnly = false) => {
  const filter: Record<string, unknown> = {};
  if (unreadOnly) filter.isRead = false;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { message: { $regex: search, $options: 'i' } },
    ];
  }
  const skip = (page - 1) * limit;
  const [items, totalCount] = await Promise.all([
    ContactMessage.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ContactMessage.countDocuments(filter),
  ]);
  return { items, ...pageMeta(page, limit, totalCount) };
};

export const markContactRead = async (id: string) =>
  ContactMessage.findByIdAndUpdate(id, { isRead: true }, { new: true });

export const listSocialPostsAdmin = async (page = 1, limit = 100, search = '', platform = '') => {
  const filter: Record<string, unknown> = {};
  if (platform) filter.platform = platform;
  if (search) {
    filter.$or = [
      { embedUrl: { $regex: search, $options: 'i' } },
      { caption: { $regex: search, $options: 'i' } },
      { platform: { $regex: search, $options: 'i' } },
    ];
  }
  const skip = (page - 1) * limit;
  const [items, totalCount] = await Promise.all([
    SocialPost.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    SocialPost.countDocuments(filter),
  ]);
  return { items, ...pageMeta(page, limit, totalCount) };
};

export const createSocialPost = async (payload: {
  platform: 'instagram' | 'facebook' | 'tiktok' | 'other';
  embedUrl: string;
  caption?: string;
  sortOrder?: number;
}) => SocialPost.create(payload);

export const updateSocialPost = async (id: string, payload: Record<string, unknown>) =>
  SocialPost.findByIdAndUpdate(id, payload, { new: true });

export const deleteSocialPost = async (id: string) => SocialPost.findByIdAndDelete(id);

export const saveUpload = (file: Express.Multer.File): string => {
  const rel = `/uploads/${file.filename}`;
  return rel;
};

export const uploadsDir = () => {
  const dir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

export const overviewStats = async () => {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [
    entrants,
    accounts,
    codes,
    unusedCodes,
    usedCodes,
    flagged,
    submissions24h,
    success24h,
    duplicate24h,
    invalid24h,
    submissions7d,
    submissionsTotal,
    drawEntries,
    publishedWinners,
    pendingWinners,
    unreadMessages,
    recentSubmissions,
    topEntrants,
    guests,
    recentWinners,
  ] = await Promise.all([
    Entrant.countDocuments({ role: 'user' }),
    Entrant.countDocuments({ role: 'user', hasAccount: true }),
    CampaignCode.countDocuments(),
    CampaignCode.countDocuments({ status: 'unused' }),
    CampaignCode.countDocuments({ status: 'used' }),
    CampaignCode.countDocuments({ $or: [{ status: 'flagged' }, { duplicateAttemptCount: { $gte: 1 } }] }),
    CodeSubmission.countDocuments({ createdAt: { $gte: since24h } }),
    CodeSubmission.countDocuments({ createdAt: { $gte: since24h }, result: 'success' }),
    CodeSubmission.countDocuments({ createdAt: { $gte: since24h }, result: 'duplicate' }),
    CodeSubmission.countDocuments({ createdAt: { $gte: since24h }, result: 'invalid' }),
    CodeSubmission.countDocuments({ createdAt: { $gte: since7d } }),
    CodeSubmission.countDocuments(),
    DrawEntry.countDocuments(),
    Winner.countDocuments({ status: 'published' }),
    Winner.countDocuments({ status: 'pending_verification' }),
    ContactMessage.countDocuments({ isRead: false }),
    CodeSubmission.find().sort({ createdAt: -1 }).limit(8).populate('entrant', 'fullName phone').lean(),
    Entrant.find({ role: 'user', validCodeCount: { $gt: 0 } })
      .sort({ validCodeCount: -1, drawEntryCount: -1 })
      .limit(10)
      .select('fullName phone validCodeCount drawEntryCount hasAccount pendingCodeIds')
      .lean(),
    Entrant.countDocuments({ role: 'user', hasAccount: false }),
    Winner.find().sort({ createdAt: -1 }).limit(5).select('displayName prizeLabel tier status createdAt').lean(),
  ]);

  const start = process.env.CAMPAIGN_START || '2026-09-18';
  const end = process.env.CAMPAIGN_END || '2026-11-20';
  const usedPercent = codes ? Math.round((usedCodes / codes) * 1000) / 10 : 0;

  return {
    entrants,
    accounts,
    guests,
    codes: { total: codes, unused: unusedCodes, used: usedCodes, flagged, usedPercent },
    submissions24h: { total: submissions24h, success: success24h, duplicate: duplicate24h, invalid: invalid24h },
    submissions7d,
    submissionsTotal,
    drawEntries,
    expectedTickets: Math.floor(usedCodes / 4),
    leftoverCodes: usedCodes % 4,
    winners: { published: publishedWinners, pending: pendingWinners },
    unreadMessages,
    recentSubmissions,
    recentWinners,
    topEntrants: topEntrants.map((e, i) => ({
      ...e,
      rank: i + 1,
      pendingTowardNext: Array.isArray(e.pendingCodeIds) ? e.pendingCodeIds.length : 0,
    })),
    campaign: {
      start,
      end,
      draw: '2026-11-23',
    },
  };
};

export const listAuditLogs = async (page = 1, limit = 100, search = '', actorType = '') => {
  const filter: Record<string, unknown> = {};
  if (actorType === 'admin' || actorType === 'system' || actorType === 'entrant') {
    filter.actorType = actorType;
  } else if (actorType === 'user') {
    filter.actorType = 'entrant';
  }
  if (search) {
    filter.$or = [
      { action: { $regex: search, $options: 'i' } },
      { actorType: { $regex: search, $options: 'i' } },
    ];
  }
  const skip = (page - 1) * limit;
  const [rawItems, totalCount] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('actor', 'fullName phone email role hasAccount')
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  const winnerIds = new Set<string>();
  const targetEntrantIds = new Set<string>();
  for (const item of rawItems) {
    const meta = (item.metadata || {}) as Record<string, unknown>;
    if (typeof meta.winnerId === 'string') winnerIds.add(meta.winnerId);
    if (typeof meta.entrantId === 'string') targetEntrantIds.add(meta.entrantId);
    if (Array.isArray(meta.winnerIds)) {
      for (const id of meta.winnerIds) {
        if (typeof id === 'string') winnerIds.add(id);
      }
    }
  }

  const [winners, targets] = await Promise.all([
    winnerIds.size
      ? Winner.find({ _id: { $in: [...winnerIds] } })
          .select('displayName prizeLabel tier')
          .lean()
      : Promise.resolve([]),
    targetEntrantIds.size
      ? Entrant.find({ _id: { $in: [...targetEntrantIds] } })
          .select('fullName phone')
          .lean()
      : Promise.resolve([]),
  ]);

  const winnerMap = new Map(winners.map((w) => [String(w._id), w]));
  const targetMap = new Map(targets.map((e) => [String(e._id), e]));

  const actionLabel = (action: string) =>
    (
      {
        code_submitted: 'Code submitted',
        account_registered: 'Account registered',
        optional_account_created: 'Optional account created',
        entrant_blocked: 'User blocked',
        entrant_unblocked: 'User unblocked',
        entrant_deleted_codes_retained: 'User deleted',
        codes_imported: 'Codes imported',
        electronic_draw_run: 'Electronic draw run',
        winner_verified: 'Winner verified',
        winner_published: 'Winner published',
        winner_disqualified: 'Winner disqualified',
        winner_deleted: 'Winner deleted',
        social_post_added: 'Social post added',
        social_post_removed: 'Social post removed',
      } as Record<string, string>
    )[action] || action.replace(/_/g, ' ');

  const items = rawItems.map((item) => {
    const actor = item.actor as unknown as {
      fullName?: string;
      phone?: string;
      email?: string;
      hasAccount?: boolean;
    } | null;
    const meta = (item.metadata || {}) as Record<string, unknown>;

    let target = '—';
    let prize = '—';
    let tier = '—';
    const code = typeof meta.code === 'string' ? meta.code : '—';
    let detail = '—';

    const actorRoleLabel =
      item.actorType === 'admin'
        ? 'Admin'
        : item.actorType === 'system'
          ? 'System'
          : actor?.hasAccount
            ? 'Account'
            : 'Guest';

    if (typeof meta.winnerId === 'string') {
      const w = winnerMap.get(meta.winnerId);
      if (w) {
        target = w.displayName || '—';
        prize = w.prizeLabel ? String(w.prizeLabel) : '—';
        tier = w.tier ? String(w.tier) : '—';
      } else {
        target = 'Winner removed';
      }
    } else if (typeof meta.entrantId === 'string') {
      const e = targetMap.get(meta.entrantId);
      target = e?.fullName || 'User removed';
    } else if (item.actorType === 'entrant' && actor?.fullName) {
      if (
        item.action === 'code_submitted' ||
        item.action === 'account_registered' ||
        item.action === 'optional_account_created'
      ) {
        target = actor.fullName;
      }
    }

    if (typeof meta.createdDrawEntry === 'boolean') {
      detail = meta.createdDrawEntry ? 'Earned draw ticket' : 'No new ticket';
    } else if (typeof meta.batch === 'string' || typeof meta.inserted === 'number') {
      const bits: string[] = [];
      if (typeof meta.inserted === 'number') bits.push(`+${meta.inserted}`);
      if (typeof meta.skipped === 'number') bits.push(`${meta.skipped} skipped`);
      if (typeof meta.batch === 'string') bits.push(meta.batch);
      detail = bits.join(' · ') || '—';
    } else if (typeof meta.poolSize === 'number') {
      detail = `Pool ${meta.poolSize}${Array.isArray(meta.winnerIds) ? ` · ${meta.winnerIds.length} picked` : ''}`;
    } else if (prize !== '—') {
      detail = prize;
    }

    return {
      _id: item._id,
      action: item.action,
      eventLabel: actionLabel(item.action),
      actorType: item.actorType,
      actorName:
        actor?.fullName ||
        (item.actorType === 'system' ? 'System' : item.actorType === 'admin' ? 'Admin' : '—'),
      actorPhone: actor?.phone || '',
      actorRoleLabel,
      target,
      code,
      tier,
      detail,
      createdAt: (item as { createdAt?: Date }).createdAt,
    };
  });

  return { items, ...pageMeta(page, limit, totalCount) };
};

export const drawPoolPreview = async () => {
  const totalEntries = await DrawEntry.countDocuments({ isWinner: false });
  const distinctEntrants = await DrawEntry.distinct('entrant', { isWinner: false });
  const existingDrawWinners = await Winner.countDocuments({ tier: { $in: ['grand', 'secondary'] } });
  return {
    eligibleEntries: totalEntries,
    distinctEntrants: distinctEntrants.length,
    drawAlreadyRun: existingDrawWinners > 0,
    needsAtLeast: 3,
  };
};

export const listDrawEntries = async (
  page = 1,
  limit = 100,
  search = '',
  winnerFilter = ''
) => {
  const filter: Record<string, unknown> = {};
  if (winnerFilter === 'winner') filter.isWinner = true;
  if (winnerFilter === 'pool') filter.isWinner = false;
  if (search) {
    const entrants = await Entrant.find({
      $or: [
        { fullName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ],
    })
      .select('_id')
      .lean();
    filter.entrant = { $in: entrants.map((e) => e._id) };
  }
  const skip = (page - 1) * limit;
  const [items, totalCount] = await Promise.all([
    DrawEntry.find(filter)
      .populate('entrant', 'fullName phone email validCodeCount drawEntryCount')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DrawEntry.countDocuments(filter),
  ]);
  return { items, ...pageMeta(page, limit, totalCount) };
};
