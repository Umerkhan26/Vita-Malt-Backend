import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";

const smtpUser = () =>
  (process.env.SMTP_USER || process.env.EMAIL_USER || "").trim();
/** Gmail app passwords are often copied with spaces — strip them. */
const smtpPass = () =>
  (process.env.SMTP_PASS || process.env.EMAIL_PASS || "")
    .replace(/\s+/g, "")
    .trim();
const hasSmtp = () => Boolean(smtpUser() && smtpPass());

const getTransporter = () =>
  nodemailer.createTransport({
    service: "gmail",
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    requireTLS: true,
    auth: {
      user: smtpUser(),
      pass: smtpPass(),
    },
  });

const fromAddress = () =>
  process.env.EMAIL_FROM || process.env.SMTP_FROM || smtpUser();

const getLogoAttachment = (): {
  filename: string;
  path: string;
  cid: string;
} | null => {
  const candidates = [
    path.resolve(process.cwd(), "../frontend/public/logo.png"),
    path.resolve(process.cwd(), "frontend/public/logo.png"),
    path.resolve(__dirname, "../../../frontend/public/logo.png"),
    path.resolve(__dirname, "../../frontend/public/logo.png"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return {
        filename: "vita-malt-logo.png",
        path: candidate,
        cid: "vita-malt-logo",
      };
    }
  }

  return null;
};

export const generateOTP = (length: number = 6): string => {
  const digits = "0123456789";
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
};

export const buildWelcomeEmailHtml = (
  name: string,
  landingUrl: string = "https://www.vitamaltpromotionssvg.com/",
): string => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f6f9f7; border-radius: 18px; overflow: hidden; border: 1px solid #dfeee6;">
      <div style="background: linear-gradient(135deg, #006B3F 0%, #0b7d52 100%); padding: 26px 20px 22px; text-align: center;">
        <div style="display: inline-block; text-align: center;">
          <img src="cid:vita-malt-logo" alt="Vita Malt" width="62" height="62" style="display: block; margin: 0 auto 10px; width: 62px; height: 62px; border-radius: 12px; background: rgba(255,255,255,0.12); padding: 7px; box-sizing: border-box;" />
          <div style="color: #ffffff; font-size: 24px; line-height: 1.15; font-weight: 800; letter-spacing: -0.04em; white-space: normal; word-break: break-word; max-width: 100%;">Welcome to Vita Malt</div>
        </div>
        <p style="margin: 12px 0 0; color: #ecfdf5; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700;">Vita Malt 2026 campaign</p>
      </div>
      <div style="background: #ffffff; padding: 28px 24px 20px; color: #1f2d26;">
        <p style="margin: 0 0 12px; font-size: 18px;">Hi ${name},</p>
        <p style="margin: 0 0 18px; font-size: 15px; line-height: 1.7; color: #2f3d35;">
          Thank you for joining the Vita Malt experience. We’re excited to have you in the campaign and can’t wait for you to explore the latest offers, prize chances, and community moments waiting for you.
        </p>
        <div style="background: #eaf7f0; border: 1px solid #cfead9; border-radius: 12px; padding: 18px; margin: 20px 0;">
          <p style="margin: 0 0 12px; font-size: 15px; color: #1b3b2d; font-weight: 600;">What happens next?</p>
          <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #355141;">
            Start by exploring the campaign page, enter your codes, and keep an eye on your inbox for updates, winner announcements, and exclusive promotions.
          </p>
        </div>
        <div style="text-align: center; margin: 28px 0 22px;">
          <a href="${landingUrl}" style="display: inline-block; background: #F37021; color: #ffffff; text-decoration: none; padding: 14px 26px; border-radius: 999px; font-weight: 700; font-size: 15px;">Explore the campaign</a>
        </div>
        <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #496259;">
          Need help? Reach out to <a href="mailto:drinkvitamalt@gmail.com" style="color: #006B3F; font-weight: 600;">drinkvitamalt@gmail.com</a>
        </p>
      </div>
      <div style="background: #f3faf5; padding: 18px 24px; text-align: center; border-top: 1px solid #e3efe8;">
        <p style="margin: 0; color: #5d7168; font-size: 12px;">© 2026 Vita Malt. Good taste, great moments.</p>
      </div>
    </div>
  `;

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

export const sendMail = async (
  to: string,
  subject: string,
  text: string,
  html: string,
  attachments: Array<{ filename: string; path: string; cid?: string }> = [],
): Promise<boolean> => {
  if (!hasSmtp()) {
    console.warn(
      `[EMAIL SKIPPED] SMTP not configured. Subject="${subject}" To=${to}`,
    );
    console.warn(text);
    return false;
  }
  try {
    await getTransporter().sendMail({
      from: fromAddress(),
      to,
      subject,
      text,
      html,
      attachments: attachments.length ? attachments : undefined,
    });
    console.log(`[EMAIL SENT] ${subject} -> ${to}`);
    return true;
  } catch (error) {
    console.error("[EMAIL FAILED]", error);
    return false;
  }
};

export const sendOTPEmail = async (
  email: string,
  otp: string,
  name: string,
): Promise<{ sent: boolean }> => {
  const text = `Hello ${name},\n\nYour verification code is: ${otp}\n\nThis code expires in 10 minutes.`;
  const sent = await sendMail(
    email,
    "Your Vita Malt verification code",
    text,
    wrapHtml(
      "Verify your email",
      `<p>Hello ${name},</p><p>Use this code to verify your Vita Malt account:</p>
       <div style="background:#e8f6ee;border:2px dashed #006B3F;border-radius:8px;padding:16px;text-align:center;font-size:32px;letter-spacing:8px;color:#006B3F;font-weight:bold;">${otp}</div>
       <p>This code expires in <strong>10 minutes</strong>.</p>`,
    ),
  );
  if (!sent) {
    console.log(`[DEV OTP] ${email} => ${otp}`);
  }
  return { sent };
};

export const sendPasswordResetOtpEmail = async (
  email: string,
  otp: string,
  name: string,
): Promise<{ sent: boolean }> => {
  const text = `Hello ${name},\n\nYour password reset code is: ${otp}\n\nThis code expires in 10 minutes.`;
  const sent = await sendMail(
    email,
    "Your Vita Malt password reset code",
    text,
    wrapHtml(
      "Password reset code",
      `<p>Hello ${name},</p><p>Use this code to reset your Vita Malt account password:</p>
       <div style="background:#e8f6ee;border:2px dashed #006B3F;border-radius:8px;padding:16px;text-align:center;font-size:32px;letter-spacing:8px;color:#006B3F;font-weight:bold;">${otp}</div>
       <p>This code expires in <strong>10 minutes</strong>. If you did not request this, ignore this email.</p>`,
    ),
  );
  if (!sent) {
    console.log(`[DEV RESET OTP] ${email} => ${otp}`);
  }
  return { sent };
};

export const sendPasswordResetEmail = async (
  email: string,
  resetUrl: string,
  name: string,
): Promise<{ sent: boolean }> => {
  const text = `Hello ${name},\n\nReset your password: ${resetUrl}\n\nThis link expires in 30 minutes.`;
  const sent = await sendMail(
    email,
    "Reset your Vita Malt password",
    text,
    wrapHtml(
      "Password reset",
      `<p>Hello ${name},</p><p>Click the button below to set a new password.</p>
       <p style="text-align:center;margin:24px 0;"><a href="${resetUrl}" style="background:#F37021;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Reset password</a></p>
       <p>This link expires in 30 minutes. If you did not request this, ignore this email.</p>`,
    ),
  );
  if (!sent) {
    console.log(`[DEV RESET LINK] ${email} => ${resetUrl}`);
  }
  return { sent };
};

export const sendWelcomeEmail = async (
  email: string,
  name: string,
): Promise<{ sent: boolean }> => {
  const campaignUrl = process.env.CAMPAIGN_URL || "https://www.vitamaltpromotionssvg.com/";
  const text = `Hello ${name},\n\nWelcome to Vita Malt! We’re so happy you joined the campaign.\n\nStart exploring the latest offers, enter your codes, and keep an eye on your inbox for updates and prize announcements.\n\n${campaignUrl}`;
  const logoAttachment = getLogoAttachment();
  const sent = await sendMail(
    email,
    "Welcome to Vita Malt",
    text,
    buildWelcomeEmailHtml(name, campaignUrl),
    logoAttachment ? [logoAttachment] : [],
  );
  if (!sent) {
    console.log(`[DEV WELCOME] ${email} => welcome email`);
  }
  return { sent };
};

export const sendWinnerEmail = async (
  email: string,
  name: string,
  tier: string,
  prizeLabel: string,
): Promise<void> => {
  await sendMail(
    email,
    `Congratulations — Vita Malt ${tier} prize`,
    `Hello ${name},\n\nYou have been selected as a ${tier} winner for: ${prizeLabel}.\nSVBL will contact you to verify eligibility and arrange fulfillment.`,
    wrapHtml(
      "You are a winner!",
      `<p>Hello ${name},</p><p>You have been selected as a <strong>${tier}</strong> winner.</p>
       <p>Prize: <strong>${prizeLabel}</strong></p>
       <p>SVBL will contact you to verify eligibility (18+) and arrange prize fulfillment.</p>`,
    ),
  );
};
