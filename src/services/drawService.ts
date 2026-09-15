import crypto from 'crypto';
import DrawEntry from '../models/drawEntry.model';
import Winner from '../models/winner.model';
import Entrant from '../models/entrant.model';
import { writeAudit } from '../utils/audit';
import { notifyWinner } from '../utils/notificationService';

const GRAND_PRIZE = '85" Smart TV, PS5 Pro, Surround Sound System, Entertainment TV Stand';
const SECONDARY_PRIZES = ['1-Year Supply of Vita Malt', 'Nintendo Switch + 5 Cases of Vita Malt'];

const pickRandomIndex = (length: number): number => {
  if (length <= 0) throw new Error('No eligible entries');
  return crypto.randomInt(0, length);
};

export const runElectronicDraw = async (adminId: string, ip?: string) => {
  const existing = await Winner.find({ tier: { $in: ['grand', 'secondary'] } });
  if (existing.length > 0) {
    throw Object.assign(new Error('A draw has already been run. Disqualify winners first to re-run.'), {
      status: 409,
    });
  }

  const pool = await DrawEntry.find({ isWinner: false }).populate('entrant');
  const eligible = pool.filter((entry) => {
    const entrant = entry.entrant as unknown as { isActive?: boolean; role?: string } | null;
    return entrant && entrant.isActive !== false && entrant.role !== 'admin';
  });

  if (eligible.length < 3) {
    throw Object.assign(new Error('Need at least 3 eligible draw entries to pick 1 grand + 2 secondary winners'), {
      status: 400,
    });
  }

  const remaining = [...eligible];
  const grandEntry = remaining.splice(pickRandomIndex(remaining.length), 1)[0];
  const grandEntrantId = (grandEntry.entrant as { _id: { toString(): string } })._id.toString();
  const withoutGrand = remaining.filter((entry) => {
    const id = (entry.entrant as { _id: { toString(): string } })._id.toString();
    return id !== grandEntrantId;
  });

  if (withoutGrand.length < 2) {
    throw Object.assign(new Error('Not enough distinct entrants for secondary prizes'), { status: 400 });
  }

  const secondary1 = withoutGrand.splice(pickRandomIndex(withoutGrand.length), 1)[0];
  const secondary1Id = (secondary1.entrant as { _id: { toString(): string } })._id.toString();
  const withoutFirstSecondary = withoutGrand.filter((entry) => {
    const id = (entry.entrant as { _id: { toString(): string } })._id.toString();
    return id !== secondary1Id;
  });
  const secondary2 = withoutFirstSecondary.splice(pickRandomIndex(withoutFirstSecondary.length), 1)[0];

  const picks = [
    { entry: grandEntry, tier: 'grand' as const, prize: GRAND_PRIZE },
    { entry: secondary1, tier: 'secondary' as const, prize: SECONDARY_PRIZES[0] },
    { entry: secondary2, tier: 'secondary' as const, prize: SECONDARY_PRIZES[1] },
  ];

  const winners = [];
  for (const pick of picks) {
    const populatedEntrant = pick.entry.entrant as unknown as { _id: { toString(): string } };
    const entrant = await Entrant.findById(populatedEntrant._id);
    if (!entrant) continue;
    pick.entry.isWinner = true;
    pick.entry.prizeTier = pick.tier;
    await pick.entry.save();

    const winner = await Winner.create({
      tier: pick.tier,
      status: 'pending_verification',
      entrant: entrant._id,
      drawEntry: pick.entry._id,
      displayName: entrant.fullName,
      prizeLabel: pick.prize,
    });
    winners.push(winner);
  }

  await writeAudit({
    action: 'electronic_draw_run',
    actor: adminId,
    actorType: 'admin',
    metadata: {
      winnerIds: winners.map((w) => w._id.toString()),
      poolSize: eligible.length,
    },
    ip,
  });

  return winners;
};

export const verifyAndPublishWinner = async (
  winnerId: string,
  adminId: string,
  action: 'verify' | 'publish' | 'disqualify',
  notes?: string
) => {
  const winner = await Winner.findById(winnerId).populate('entrant');
  if (!winner) throw Object.assign(new Error('Winner not found'), { status: 404 });

  if (action === 'disqualify') {
    winner.status = 'disqualified';
    winner.notes = notes;
    await winner.save();
    if (winner.drawEntry) {
      await DrawEntry.findByIdAndUpdate(winner.drawEntry, { $unset: { prizeTier: 1 }, isWinner: false });
    }
    await writeAudit({ action: 'winner_disqualified', actor: adminId, actorType: 'admin', metadata: { winnerId } });
    return winner;
  }

  if (action === 'verify') {
    winner.status = 'verified';
    winner.verifiedByAdmin = adminId as unknown as typeof winner.verifiedByAdmin;
    winner.notes = notes;
    await winner.save();
    await writeAudit({ action: 'winner_verified', actor: adminId, actorType: 'admin', metadata: { winnerId } });
    return winner;
  }

  winner.status = 'published';
  winner.announcedAt = new Date();
  winner.notes = notes || winner.notes;
  await winner.save();

  const entrant = winner.entrant as unknown as { email?: string; phone?: string; fullName: string } | null;
  if (entrant && winner.tier !== 'instant') {
    await notifyWinner({
      email: entrant.email,
      phone: entrant.phone,
      name: entrant.fullName,
      tier: winner.tier,
      prizeLabel: winner.prizeLabel,
    });
  }

  await writeAudit({ action: 'winner_published', actor: adminId, actorType: 'admin', metadata: { winnerId } });
  return winner;
};
