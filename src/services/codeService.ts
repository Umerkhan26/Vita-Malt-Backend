import crypto from 'crypto';
import mongoose from 'mongoose';
import Entrant from '../models/entrant.model';
import CampaignCode from '../models/campaignCode.model';
import CodeSubmission from '../models/codeSubmission.model';
import DrawEntry from '../models/drawEntry.model';
import { validateCodeFormat } from '../utils/validators';
import { normalizePhone } from '../utils/phone';
import { writeAudit } from '../utils/audit';
import { assertGuestIdentity } from './authService';

const maskCode = (code: string): string => {
  if (code.length <= 4) return '****';
  return `${code.slice(0, 2)}****${code.slice(-2)}`;
};

const logSubmission = async (params: {
  codeAttempted: string;
  result: 'success' | 'invalid' | 'duplicate' | 'blocked' | 'validation_error';
  reason?: string;
  entrant?: mongoose.Types.ObjectId;
  ip?: string;
  userAgent?: string;
}) => {
  await CodeSubmission.create(params);
};

export const submitCode = async (params: {
  code: string;
  userId?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  isOver18?: boolean;
  ip?: string;
  userAgent?: string;
}) => {
  const code = params.code.trim().toUpperCase();
  if (!validateCodeFormat(code)) {
    await logSubmission({
      codeAttempted: code,
      result: 'validation_error',
      reason: 'Invalid code format',
      ip: params.ip,
      userAgent: params.userAgent,
    });
    throw Object.assign(new Error('Invalid code format'), { status: 400 });
  }

  const start = process.env.CAMPAIGN_START;
  const end = process.env.CAMPAIGN_END;
  const now = new Date();
  if (start) {
    const open = new Date(`${start}T00:00:00`);
    if (!Number.isNaN(open.getTime()) && now < open) {
      throw Object.assign(new Error('Campaign has not started yet'), { status: 403 });
    }
  }
  if (end) {
    const close = new Date(`${end}T23:59:59`);
    if (!Number.isNaN(close.getTime()) && now > close) {
      throw Object.assign(new Error('Campaign has ended. Code entry is closed'), { status: 403 });
    }
  }

  let entrant = params.userId ? await Entrant.findById(params.userId) : null;

  if (entrant) {
    if (!entrant.isActive) {
      await logSubmission({
        codeAttempted: code,
        result: 'blocked',
        reason: 'Blocked entrant',
        entrant: entrant._id,
        ip: params.ip,
        userAgent: params.userAgent,
      });
      throw Object.assign(new Error('Account is blocked'), { status: 403 });
    }
  } else {
    if (!params.phone || !params.fullName) {
      throw Object.assign(new Error('Name and phone are required to submit a code'), { status: 400 });
    }
    const phoneNormalized = normalizePhone(params.phone);
    entrant = await Entrant.findOne({ phoneNormalized });

    if (!entrant) {
      assertGuestIdentity({ ...params, isNew: true });
      entrant = await Entrant.create({
        fullName: params.fullName.trim(),
        phone: params.phone.trim(),
        phoneNormalized,
        email: params.email?.toLowerCase(),
        dateOfBirth: new Date(params.dateOfBirth as string),
        isOver18: true,
        hasAccount: false,
        validCodeCount: 0,
        drawEntryCount: 0,
        pendingCodeIds: [],
        role: 'user',
      });
    } else {
      if (!entrant.isActive) {
        await logSubmission({
          codeAttempted: code,
          result: 'blocked',
          reason: 'Blocked entrant',
          entrant: entrant._id,
          ip: params.ip,
          userAgent: params.userAgent,
        });
        throw Object.assign(new Error('This phone number is blocked from entering'), { status: 403 });
      }
      assertGuestIdentity({ ...params, isNew: false });
      const incomingName = params.fullName.trim().toLowerCase();
      if (incomingName !== entrant.fullName.trim().toLowerCase()) {
        throw Object.assign(new Error('Name does not match the phone number on file'), { status: 400 });
      }
      if (params.email && !entrant.email) {
        entrant.email = params.email.toLowerCase();
        await entrant.save();
      }
    }
  }

  const existing = await CampaignCode.findOne({ code });
  if (!existing) {
    await logSubmission({
      codeAttempted: code,
      result: 'invalid',
      reason: 'Code not in master list',
      entrant: entrant._id,
      ip: params.ip,
      userAgent: params.userAgent,
    });
    throw Object.assign(new Error('This code is not valid'), { status: 400 });
  }

  if (existing.status !== 'unused') {
    existing.duplicateAttemptCount += 1;
    if (existing.duplicateAttemptCount >= 3) {
      existing.status = existing.status === 'used' ? 'used' : 'flagged';
    }
    await existing.save();
    await logSubmission({
      codeAttempted: code,
      result: 'duplicate',
      reason: 'Code already used',
      entrant: entrant._id,
      ip: params.ip,
      userAgent: params.userAgent,
    });
    throw Object.assign(new Error('This code has already been used'), { status: 409 });
  }

  const redeemed = await CampaignCode.findOneAndUpdate(
    { _id: existing._id, status: 'unused' },
    { $set: { status: 'used', usedBy: entrant._id, usedAt: new Date() } },
    { new: true }
  );

  if (!redeemed) {
    await CampaignCode.updateOne({ _id: existing._id }, { $inc: { duplicateAttemptCount: 1 } });
    await logSubmission({
      codeAttempted: code,
      result: 'duplicate',
      reason: 'Concurrent duplicate',
      entrant: entrant._id,
      ip: params.ip,
      userAgent: params.userAgent,
    });
    throw Object.assign(new Error('This code has already been used'), { status: 409 });
  }

  entrant.validCodeCount += 1;
  entrant.pendingCodeIds.push(redeemed._id);

  let createdDrawEntry = false;
  if (entrant.pendingCodeIds.length >= 4) {
    const batch = entrant.pendingCodeIds.splice(0, 4);
    await DrawEntry.create({
      entrant: entrant._id,
      codeIds: batch,
    });
    entrant.drawEntryCount += 1;
    createdDrawEntry = true;
  }

  let accountSetupToken: string | undefined;
  if (!entrant.hasAccount) {
    accountSetupToken = crypto.randomBytes(24).toString('hex');
    entrant.accountSetupToken = accountSetupToken;
    entrant.accountSetupTokenExpiry = new Date(Date.now() + 30 * 60 * 1000);
  }

  await entrant.save();
  await logSubmission({
    codeAttempted: code,
    result: 'success',
    entrant: entrant._id,
    ip: params.ip,
    userAgent: params.userAgent,
  });
  await writeAudit({
    action: 'code_submitted',
    actor: entrant._id,
    actorType: 'entrant',
    metadata: { code: maskCode(code), createdDrawEntry },
    ip: params.ip,
  });

  const progress = entrant.validCodeCount % 4;
  return {
    success: true,
    message: createdDrawEntry
      ? 'Code accepted. You earned 1 draw entry!'
      : 'Code accepted.',
    createdDrawEntry,
    progressTowardNextEntry: progress === 0 ? 4 : progress,
    codesUntilNextEntry: progress === 0 ? 0 : 4 - progress,
    validCodeCount: entrant.validCodeCount,
    drawEntryCount: entrant.drawEntryCount,
    promptCreateAccount: !entrant.hasAccount,
    accountSetupToken,
    entrant: {
      _id: entrant._id.toString(),
      fullName: entrant.fullName,
      phone: entrant.phone,
      email: entrant.email,
      hasAccount: entrant.hasAccount,
    },
  };
};

export const lookupEntries = async (params: { fullName?: string; phone?: string; email?: string }) => {
  let entrant = null;
  if (params.email) {
    entrant = await Entrant.findOne({ email: params.email.toLowerCase(), role: 'user' });
  } else if (params.phone && params.fullName) {
    entrant = await Entrant.findOne({
      phoneNormalized: normalizePhone(params.phone),
      role: 'user',
    });
    if (entrant && entrant.fullName.trim().toLowerCase() !== params.fullName.trim().toLowerCase()) {
      entrant = null;
    }
  }

  if (!entrant) {
    throw Object.assign(new Error('No entries found for that information'), { status: 404 });
  }

  const codes = await CampaignCode.find({ usedBy: entrant._id, status: 'used' }).sort({ usedAt: -1 });
  const drawEntries = await DrawEntry.find({ entrant: entrant._id }).sort({ createdAt: -1 });

  return {
    fullName: entrant.fullName,
    validCodeCount: entrant.validCodeCount,
    drawEntryCount: entrant.drawEntryCount,
    progressTowardNextEntry: entrant.validCodeCount % 4 === 0 && entrant.validCodeCount > 0 ? 4 : entrant.validCodeCount % 4,
    hasAccount: entrant.hasAccount,
    codes: codes.map((c) => ({
      code: maskCode(c.code),
      usedAt: c.usedAt,
    })),
    entries: drawEntries.map((e) => ({
      id: e._id.toString(),
      submittedAt: e.createdAt,
      isWinner: e.isWinner,
      prizeTier: e.prizeTier,
    })),
  };
};

export const getDashboard = async (userId: string) => {
  const entrant = await Entrant.findById(userId);
  if (!entrant) throw Object.assign(new Error('Entrant not found'), { status: 404 });
  return lookupEntries({ phone: entrant.phone, fullName: entrant.fullName });
};
