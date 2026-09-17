import { Request, Response } from 'express';
import Winner from '../models/winner.model';
import SocialPost from '../models/socialPost.model';
import ContactMessage from '../models/contactMessage.model';
import { sendMail } from '../utils/emailService';
import { validateEmail, validateName } from '../utils/validators';
import { fetchLinkPreview, isShareStyleUrl, resolvePublicPostUrl } from '../utils/socialUrl';

export const publicWinners = async (_req: Request, res: Response) => {
  const winners = await Winner.find({ status: 'published' }).sort({ announcedAt: -1, createdAt: -1 });
  res.json({
    instant: winners.filter((w) => w.tier === 'instant'),
    grand: winners.filter((w) => w.tier === 'grand'),
    secondary: winners.filter((w) => w.tier === 'secondary'),
  });
};

export const publicSocial = async (_req: Request, res: Response) => {
  const posts = await SocialPost.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 });
  const resolved = [];
  for (const post of posts) {
    let changed = false;
    const url = String(post.embedUrl || '');
    if (isShareStyleUrl(url)) {
      const embedUrl = await resolvePublicPostUrl(url);
      if (embedUrl && embedUrl !== url) {
        post.embedUrl = embedUrl;
        changed = true;
      }
    }
    if (!post.previewImage || !String(post.previewImage).startsWith('/uploads/')) {
      const preview = await fetchLinkPreview(String(post.embedUrl), String(post.platform));
      if (preview.previewTitle) post.previewTitle = preview.previewTitle;
      if (preview.previewDescription) post.previewDescription = preview.previewDescription;
      if (preview.previewImage) post.previewImage = preview.previewImage;
      changed = changed || Boolean(preview.previewTitle || preview.previewDescription || preview.previewImage);
    }
    if (changed) await post.save();
    resolved.push(post);
  }
  res.json({ posts: resolved });
};

export const contactHandler = async (req: Request, res: Response) => {
  const { name, email, phone, message } = req.body;
  if (!name || !validateName(name) || !email || !validateEmail(email) || !message || String(message).trim().length < 10) {
    res.status(400).json({ message: 'Please provide a valid name, email, and message.' });
    return;
  }
  const saved = await ContactMessage.create({ name, email, phone, message: String(message).trim() });
  const support = process.env.SUPPORT_EMAIL;
  if (support) {
    await sendMail(
      support,
      `Vita Malt support from ${name}`,
      `${message}\n\nFrom: ${name} <${email}> ${phone || ''}`,
      `<p>${message}</p><p>From: ${name} &lt;${email}&gt; ${phone || ''}</p>`
    );
  }
  res.status(201).json({ message: 'Thanks — we received your message.', id: saved._id });
};
