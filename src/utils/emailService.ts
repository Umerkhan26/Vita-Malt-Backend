import nodemailer from 'nodemailer';

const smtpUser = () => (process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
/** Gmail app passwords are often copied with spaces — strip them. */
const smtpPass = () =>
  (process.env.SMTP_PASS || process.env.EMAIL_PASS || '').replace(/\s+/g, '').trim();
const hasSmtp = () => Boolean(smtpUser() && smtpPass());

const getTransporter = () =>
  nodemailer.createTransport({
    service: 'gmail',
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    requireTLS: true,
    auth: {
      user: smtpUser(),
      pass: smtpPass(),
    },
  });

const fromAddress = () => process.env.EMAIL_FROM || process.env.SMTP_FROM || smtpUser();

export const generateOTP = (length: number = 6): string => {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
};

const wrapHtml = (title: string, body: string): string => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f3faf5;">
    <div style="background-color: #006B3F; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
      <h1 style="color: #F37021; margin: 0; font-size: 22px;">Vitalize Your Game</h1>
      <p style="color:#fff;margin:6px 0 0;font-size:13px;">Vita Malt 2026</p>
    </div>
    <div style="background-color: white; padding: 28px; border-radius: 0 0 8px 8px;">
      <h2 style="color: #122018; margin-top: 0;">${title}</h2>
      ${body}
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
      <p style="color: #999; font-size: 12px; margin: 0;">Campaign Support: drinkvitamalt@gmail.com</p>
    </div>
  </div>
`;

export const sendMail = async (to: string, subject: string, text: string, html: string): Promise<boolean> => {
  if (!hasSmtp()) {
    console.warn(`[EMAIL SKIPPED] SMTP not configured. Subject="${subject}" To=${to}`);
    console.warn(text);
    return false;
  }
  try {
    await getTransporter().sendMail({ from: fromAddress(), to, subject, text, html });
    console.log(`[EMAIL SENT] ${subject} -> ${to}`);
    return true;
  } catch (error) {
    console.error('[EMAIL FAILED]', error);
    return false;
  }
};

export const sendOTPEmail = async (email: string, otp: string, name: string): Promise<{ sent: boolean }> => {
  const text = `Hello ${name},\n\nYour verification code is: ${otp}\n\nThis code expires in 10 minutes.`;
  const sent = await sendMail(
    email,
    'Your Vita Malt verification code',
    text,
    wrapHtml(
      'Verify your email',
      `<p>Hello ${name},</p><p>Use this code to verify your Vita Malt account:</p>
       <div style="background:#e8f6ee;border:2px dashed #006B3F;border-radius:8px;padding:16px;text-align:center;font-size:32px;letter-spacing:8px;color:#006B3F;font-weight:bold;">${otp}</div>
       <p>This code expires in <strong>10 minutes</strong>.</p>`
    )
  );
  if (!sent) {
    console.log(`[DEV OTP] ${email} => ${otp}`);
  }
  return { sent };
};

export const sendPasswordResetOtpEmail = async (
  email: string,
  otp: string,
  name: string
): Promise<{ sent: boolean }> => {
  const text = `Hello ${name},\n\nYour password reset code is: ${otp}\n\nThis code expires in 10 minutes.`;
  const sent = await sendMail(
    email,
    'Your Vita Malt password reset code',
    text,
    wrapHtml(
      'Password reset code',
      `<p>Hello ${name},</p><p>Use this code to reset your Vita Malt account password:</p>
       <div style="background:#e8f6ee;border:2px dashed #006B3F;border-radius:8px;padding:16px;text-align:center;font-size:32px;letter-spacing:8px;color:#006B3F;font-weight:bold;">${otp}</div>
       <p>This code expires in <strong>10 minutes</strong>. If you did not request this, ignore this email.</p>`
    )
  );
  if (!sent) {
    console.log(`[DEV RESET OTP] ${email} => ${otp}`);
  }
  return { sent };
};

export const sendPasswordResetEmail = async (
  email: string,
  resetUrl: string,
  name: string
): Promise<{ sent: boolean }> => {
  const text = `Hello ${name},\n\nReset your password: ${resetUrl}\n\nThis link expires in 30 minutes.`;
  const sent = await sendMail(
    email,
    'Reset your Vita Malt password',
    text,
    wrapHtml(
      'Password reset',
      `<p>Hello ${name},</p><p>Click the button below to set a new password.</p>
       <p style="text-align:center;margin:24px 0;"><a href="${resetUrl}" style="background:#F37021;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Reset password</a></p>
       <p>This link expires in 30 minutes. If you did not request this, ignore this email.</p>`
    )
  );
  if (!sent) {
    console.log(`[DEV RESET LINK] ${email} => ${resetUrl}`);
  }
  return { sent };
};

export const sendWinnerEmail = async (
  email: string,
  name: string,
  tier: string,
  prizeLabel: string
): Promise<void> => {
  await sendMail(
    email,
    `Congratulations — Vita Malt ${tier} prize`,
    `Hello ${name},\n\nYou have been selected as a ${tier} winner for: ${prizeLabel}.\nSVBL will contact you to verify eligibility and arrange fulfillment.`,
    wrapHtml(
      'You are a winner!',
      `<p>Hello ${name},</p><p>You have been selected as a <strong>${tier}</strong> winner.</p>
       <p>Prize: <strong>${prizeLabel}</strong></p>
       <p>SVBL will contact you to verify eligibility (18+) and arrange prize fulfillment.</p>`
    )
  );
};
