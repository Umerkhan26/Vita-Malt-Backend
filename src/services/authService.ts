import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Entrant, { IEntrant } from '../models/entrant.model';
import { getJwtSecret, validateEmail, validateName, validatePassword } from '../utils/validators';
import { normalizePhone, validatePhone } from '../utils/phone';
import { isAtLeast18 } from '../utils/age';
import { generateOTP, sendOTPEmail, sendPasswordResetOtpEmail, sendWelcomeEmail } from '../utils/emailService';
import { writeAudit } from '../utils/audit';

const signToken = (userId: string, role: string, fullName: string) =>
  jwt.sign({ userId, role, username: fullName }, getJwtSecret(), { expiresIn: '7d' });

const publicEntrant = (entrant: {
  _id: { toString(): string };
  fullName: string;
  phone: string;
  email?: string;
  validCodeCount: number;
  drawEntryCount: number;
  hasAccount: boolean;
  role: string;
}) => ({
  _id: entrant._id.toString(),
  fullName: entrant.fullName,
  phone: entrant.phone,
  email: entrant.email,
  validCodeCount: entrant.validCodeCount,
  drawEntryCount: entrant.drawEntryCount,
  hasAccount: entrant.hasAccount,
  role: entrant.role,
});

export const registerEntrant = async (params: {
  fullName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  isOver18: boolean;
  password: string;
}) => {
  assertGuestIdentity({ ...params, isNew: true });
  if (!params.email || !validateEmail(params.email)) {
    throw Object.assign(new Error('Valid email is required to sign up'), { status: 400 });
  }
  if (!validatePassword(params.password)) {
    throw Object.assign(new Error('Password must be 8+ chars with a letter, number, and special character'), {
      status: 400,
    });
  }

  const phoneNormalized = normalizePhone(params.phone);
  const existingPhone = await Entrant.findOne({ phoneNormalized });
  const existingEmail = await Entrant.findOne({ email: params.email.toLowerCase() });

  if (existingEmail && existingEmail.hasAccount) {
    throw Object.assign(new Error('An account with this email already exists'), { status: 409 });
  }
  if (existingPhone && existingPhone.hasAccount) {
    throw Object.assign(new Error('An account with this phone already exists'), { status: 409 });
  }

  const passwordHash = await bcrypt.hash(params.password, 10);
  const otp = generateOTP();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

  let entrant = existingPhone || existingEmail;
  if (entrant) {
    if (existingEmail && existingPhone && String(existingEmail._id) !== String(existingPhone._id)) {
      throw Object.assign(new Error('Email and phone belong to different entries. Contact support.'), { status: 409 });
    }
    entrant.fullName = params.fullName.trim();
    entrant.email = params.email.toLowerCase();
    entrant.phone = params.phone.trim();
    entrant.phoneNormalized = phoneNormalized;
    entrant.dateOfBirth = new Date(params.dateOfBirth);
    entrant.isOver18 = true;
    entrant.passwordHash = passwordHash;
    entrant.hasAccount = true;
    entrant.isVerified = false;
    entrant.verificationOTP = otp;
    entrant.verificationOTPExpiry = otpExpiry;
    await entrant.save();
  } else {
    entrant = await Entrant.create({
      fullName: params.fullName.trim(),
      phone: params.phone.trim(),
      phoneNormalized,
      email: params.email.toLowerCase(),
      dateOfBirth: new Date(params.dateOfBirth),
      isOver18: true,
      passwordHash,
      hasAccount: true,
      isVerified: false,
      verificationOTP: otp,
      verificationOTPExpiry: otpExpiry,
      role: 'user',
    });
  }

  const otpMail = await sendOTPEmail(entrant.email!, otp, entrant.fullName);
  const welcomeMail = await sendWelcomeEmail(entrant.email!, entrant.fullName);
  await writeAudit({ action: 'account_registered', actor: entrant._id, actorType: 'entrant' });
  return {
    requiresVerification: true,
    email: entrant.email,
    emailSent: otpMail.sent,
    welcomeEmailSent: welcomeMail.sent,
    ...(otpMail.sent ? {} : { devOtp: otp }),
    entrant: publicEntrant(entrant),
  };
};

export const createOptionalAccount = async (params: {
  entrantId: string;
  password: string;
  email?: string;
  accountSetupToken?: string;
}) => {
  const entrant = await Entrant.findById(params.entrantId);
  if (!entrant) throw Object.assign(new Error('Entrant not found'), { status: 404 });
  if (!entrant.isActive) throw Object.assign(new Error('Account is blocked'), { status: 403 });
  if (
    !params.accountSetupToken ||
    entrant.accountSetupToken !== params.accountSetupToken ||
    !entrant.accountSetupTokenExpiry ||
    entrant.accountSetupTokenExpiry < new Date()
  ) {
    throw Object.assign(new Error('Account setup session expired. Submit a code again to create an account.'), {
      status: 400,
    });
  }
  if (!validatePassword(params.password)) {
    throw Object.assign(new Error('Password must be 8+ chars with a letter, number, and special character'), {
      status: 400,
    });
  }

  if (params.email) {
    if (!validateEmail(params.email)) throw Object.assign(new Error('Invalid email'), { status: 400 });
    const existing = await Entrant.findOne({ email: params.email.toLowerCase(), _id: { $ne: entrant._id } });
    if (existing) throw Object.assign(new Error('Email already in use'), { status: 409 });
    entrant.email = params.email.toLowerCase();
  }

  if (!entrant.email) {
    throw Object.assign(new Error('Email is required to create an account'), { status: 400 });
  }

  entrant.passwordHash = await bcrypt.hash(params.password, 10);
  entrant.hasAccount = true;
  entrant.accountSetupToken = undefined;
  entrant.accountSetupTokenExpiry = null;

  const otp = generateOTP();
  entrant.verificationOTP = otp;
  entrant.verificationOTPExpiry = new Date(Date.now() + 10 * 60 * 1000);
  entrant.isVerified = false;
  await entrant.save();
  const otpMail = await sendOTPEmail(entrant.email, otp, entrant.fullName);
  const welcomeMail = await sendWelcomeEmail(entrant.email, entrant.fullName);
  await writeAudit({ action: 'optional_account_created', actor: entrant._id, actorType: 'entrant' });

  return {
    requiresVerification: true,
    email: entrant.email,
    emailSent: otpMail.sent,
    welcomeEmailSent: welcomeMail.sent,
    ...(otpMail.sent ? {} : { devOtp: otp }),
    entrant: publicEntrant(entrant),
  };
};

export const verifyOtp = async (email: string, otp: string) => {
  const entrant = await Entrant.findOne({ email: email.toLowerCase() });
  if (!entrant || !entrant.verificationOTP) {
    throw Object.assign(new Error('Invalid verification request'), { status: 400 });
  }
  if (!entrant.verificationOTPExpiry || entrant.verificationOTPExpiry < new Date()) {
    throw Object.assign(new Error('OTP expired'), { status: 400 });
  }
  if (entrant.verificationOTP !== otp) {
    throw Object.assign(new Error('Invalid OTP'), { status: 400 });
  }
  entrant.isVerified = true;
  entrant.verificationOTP = undefined;
  entrant.verificationOTPExpiry = null;
  await entrant.save();
  return { message: 'Email verified. You can sign in now.' };
};

export const resendOtp = async (email: string) => {
  const entrant = await Entrant.findOne({ email: email.toLowerCase() });
  if (!entrant || !entrant.email) throw Object.assign(new Error('Account not found'), { status: 404 });
  const otp = generateOTP();
  entrant.verificationOTP = otp;
  entrant.verificationOTPExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await entrant.save();
  const mail = await sendOTPEmail(entrant.email, otp, entrant.fullName);
  return {
    message: mail.sent ? 'OTP resent' : 'OTP generated (email not configured)',
    emailSent: mail.sent,
    ...(mail.sent ? {} : { devOtp: otp }),
  };
};

export const loginEntrant = async (identifier: string, password: string) => {
  const normalizedPhone = normalizePhone(identifier);
  const query = identifier.includes('@')
    ? { email: identifier.toLowerCase() }
    : { $or: [{ phoneNormalized: normalizedPhone }, { email: identifier.toLowerCase() }] };

  const entrant = await Entrant.findOne(query);
  if (!entrant || !entrant.passwordHash || !entrant.hasAccount) {
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  }
  if (!entrant.isActive) throw Object.assign(new Error('Account is blocked'), { status: 403 });
  if (!entrant.isVerified) throw Object.assign(new Error('Please verify your email first'), { status: 403 });

  const ok = await bcrypt.compare(password, entrant.passwordHash);
  if (!ok) throw Object.assign(new Error('Invalid credentials'), { status: 401 });

  const token = signToken(entrant._id.toString(), entrant.role, entrant.fullName);
  return { token, user: publicEntrant(entrant) };
};

export const loginAdmin = async (identifier: string, password: string) => {
  const result = await loginEntrant(identifier, password);
  if (result.user.role !== 'admin') {
    throw Object.assign(new Error('Admin access required'), { status: 403 });
  }
  return result;
};

export const requestPasswordReset = async (email: string) => {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    throw Object.assign(new Error('Enter a valid email address'), { status: 400 });
  }

  const entrant = await Entrant.findOne({ email: normalized, hasAccount: true });
  const generic = {
    message: 'If that email exists, a reset code was sent.',
    emailSent: false as boolean,
  };

  if (!entrant || !entrant.email) return generic;

  const otp = generateOTP();
  entrant.resetToken = otp;
  entrant.resetTokenExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await entrant.save();

  const mail = await sendPasswordResetOtpEmail(entrant.email, otp, entrant.fullName);

  return {
    message: mail.sent
      ? 'If that email exists, a reset code was sent.'
      : 'Reset code generated (email delivery unavailable).',
    emailSent: mail.sent,
    ...(mail.sent ? {} : { devOtp: otp }),
  };
};

export const verifyResetOtp = async (email: string, otp: string) => {
  const normalized = String(email || '').trim().toLowerCase();
  const code = String(otp || '').trim();
  if (!normalized || !code) {
    throw Object.assign(new Error('Email and code are required'), { status: 400 });
  }

  const entrant = await Entrant.findOne({ email: normalized, hasAccount: true });
  if (!entrant || !entrant.resetToken) {
    throw Object.assign(new Error('Invalid or expired code'), { status: 400 });
  }
  if (!entrant.resetTokenExpiry || entrant.resetTokenExpiry < new Date()) {
    throw Object.assign(new Error('Code expired. Request a new one.'), { status: 400 });
  }
  if (entrant.resetToken !== code) {
    throw Object.assign(new Error('Invalid code'), { status: 400 });
  }

  return { message: 'Code verified. Set your new password.', verified: true };
};

export const resetPassword = async (params: {
  token?: string;
  email?: string;
  otp?: string;
  password: string;
}) => {
  if (!validatePassword(params.password)) {
    throw Object.assign(new Error('Password must be 8+ chars with a letter, number, and special character'), {
      status: 400,
    });
  }

  let entrant: IEntrant | null = null;

  if (params.email && params.otp) {
    entrant = await Entrant.findOne({
      email: String(params.email).trim().toLowerCase(),
      hasAccount: true,
      resetToken: String(params.otp).trim(),
      resetTokenExpiry: { $gt: new Date() },
    });
  } else if (params.token) {
    entrant = await Entrant.findOne({
      resetToken: params.token,
      resetTokenExpiry: { $gt: new Date() },
    });
  }

  if (!entrant) throw Object.assign(new Error('Invalid or expired reset code'), { status: 400 });

  entrant.passwordHash = await bcrypt.hash(params.password, 10);
  entrant.resetToken = undefined;
  entrant.resetTokenExpiry = null;
  entrant.isVerified = true;
  await entrant.save();
  return { message: 'Password updated. You can sign in now.' };
};

export const assertGuestIdentity = (params: {
  fullName?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  isOver18?: boolean;
  isNew: boolean;
}) => {
  if (!params.fullName || !validateName(params.fullName)) {
    throw Object.assign(new Error('Valid full name is required'), { status: 400 });
  }
  if (!params.phone || !validatePhone(params.phone)) {
    throw Object.assign(new Error('Valid phone number is required'), { status: 400 });
  }
  if (params.email && !validateEmail(params.email)) {
    throw Object.assign(new Error('Invalid email'), { status: 400 });
  }
  if (params.isNew) {
    if (!params.dateOfBirth || !isAtLeast18(params.dateOfBirth)) {
      throw Object.assign(new Error('Entrants must be 18 or older'), { status: 400 });
    }
    if (params.isOver18 !== true) {
      throw Object.assign(new Error('You must confirm you are 18 or older'), { status: 400 });
    }
  }
};
