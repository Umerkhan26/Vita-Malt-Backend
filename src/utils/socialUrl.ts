import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export const isShareStyleUrl = (url: string) =>
  /facebook\.com\/share\//i.test(url) ||
  /fb\.watch\//i.test(url) ||
  /instagram\.com\/share\//i.test(url) ||
  /instagram\.com\/s\//i.test(url) ||
  /vm\.tiktok\.com\//i.test(url) ||
  /vt\.tiktok\.com\//i.test(url);

const refererFor = (url: string) => {
  if (/instagram|cdninstagram/i.test(url)) return 'https://www.instagram.com/';
  if (/tiktok/i.test(url)) return 'https://www.tiktok.com/';
  return 'https://www.facebook.com/';
};

const canonicalize = (raw: string) => {
  try {
    const u = new URL(raw);
    u.hash = '';
    u.searchParams.delete('rdid');
    u.searchParams.delete('share_url');
    u.searchParams.delete('mibextid');
    if (/instagram\.com$/i.test(u.hostname) || u.hostname.endsWith('.instagram.com')) {
      u.search = '';
    }
    let out = u.toString();
    if (out.endsWith('/')) out = out.slice(0, -1);
    return out;
  } catch {
    return raw.trim();
  }
};

const curlResolve = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml',
        Referer: refererFor(url),
      },
      signal: AbortSignal.timeout(10000),
    });
    const finalUrl = String(res.url || '').trim();
    if (!finalUrl || /^https?:\/\//i.test(finalUrl) === false) return null;
    if (/\/login/i.test(finalUrl) || /checkpoint/i.test(finalUrl)) return null;
    return finalUrl;
  } catch {
    return null;
  }
};

export const resolvePublicPostUrl = async (raw: string): Promise<string> => {
  const url = raw.trim();
  if (!url) return url;
  if (!isShareStyleUrl(url)) return canonicalize(url);
  const resolved = await curlResolve(url);
  return canonicalize(resolved || url);
};

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/');

const metaContent = (html: string, prop: string) => {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1].trim());
  }
  return '';
};

const pageNameFromUrl = (url: string) => {
  try {
    const path = new URL(url).pathname.split('/').filter(Boolean);
    const skip = new Set(['posts', 'videos', 'reel', 'reels', 'watch', 'share', 'p', 'tv', 'photo', 'permalink.php']);
    return (
      path.find((part, i) => {
        if (skip.has(part.toLowerCase()) || /^pfbid/i.test(part) || /^\d+$/.test(part)) return false;
        if (i > 0 && /^(p|reel|reels|tv)$/i.test(path[i - 1])) return false;
        return true;
      }) || ''
    );
  } catch {
    return '';
  }
};

export type LinkPreview = {
  previewTitle?: string;
  previewDescription?: string;
  previewImage?: string;
};

const curlHtml = async (url: string): Promise<string> => {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml',
        Referer: refererFor(url),
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  }
};

const saveRemoteImage = async (imageUrl: string): Promise<string | undefined> => {
  const dir = path.join(process.cwd(), 'uploads', 'social');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `social-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
  const dest = path.join(dir, filename);
  try {
    const res = await fetch(imageUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        Referer: refererFor(imageUrl),
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 800) return undefined;
    fs.writeFileSync(dest, buf);
    return `/uploads/social/${filename}`;
  } catch {
    return undefined;
  }
};

const pickFacebookImage = (html: string) => {
  const urls = [...html.matchAll(/https:\/\/scontent[^"'\\\s]+/g)].map((m) => decodeHtml(m[0]));
  const media = urls.filter((u) => !/s50x50|s40x40|s100x100|rsrc\.php/i.test(u));
  return (
    media.find((u) => /t39\.30808-6|p\d{3,4}x\d{3,4}/i.test(u)) ||
    media[media.length - 1] ||
    urls[urls.length - 1]
  );
};

const facebookCaption = (html: string) => {
  const match = html.match(/data-testid="post_message"[^>]*>([\s\S]*?)<\/div>\s*(?:<div|<\/div>)/i);
  if (!match?.[1]) return '';
  return decodeHtml(match[1].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
};

const facebookPluginPreview = async (url: string): Promise<LinkPreview> => {
  const plugin = `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(url)}&show_text=true&width=500`;
  const html = await curlHtml(plugin);
  const remoteImage = pickFacebookImage(html);
  const previewImage = remoteImage ? (await saveRemoteImage(remoteImage)) || remoteImage : undefined;
  const previewTitle = pageNameFromUrl(url).replace(/\./g, ' ') || metaContent(html, 'og:title');
  const previewDescription = facebookCaption(html) || undefined;
  return {
    previewTitle: previewTitle || undefined,
    previewDescription,
    previewImage,
  };
};

const oembedPreview = async (endpoint: string, url: string): Promise<LinkPreview> => {
  const res = await fetch(`${endpoint}${encodeURIComponent(url)}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': BROWSER_UA,
      Referer: refererFor(url),
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return {};
  const data = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
  const previewImage = data.thumbnail_url
    ? (await saveRemoteImage(data.thumbnail_url)) || data.thumbnail_url
    : undefined;
  return {
    previewTitle: data.author_name || data.title,
    previewDescription: data.title,
    previewImage,
  };
};

const instagramOembedPreview = async (url: string): Promise<LinkPreview> => {
  let preview: LinkPreview = {};
  try {
    preview = await oembedPreview('https://www.instagram.com/api/v1/oembed/?url=', url);
  } catch {
    preview = {};
  }
  if (!preview.previewImage) {
    preview.previewImage = await saveRemoteImage(`${canonicalize(url)}/media/?size=l`);
  }
  if (!preview.previewTitle) {
    preview.previewTitle = pageNameFromUrl(url) || undefined;
  }
  return preview;
};

export const fetchLinkPreview = async (url: string, platform: string): Promise<LinkPreview> => {
  if (platform === 'tiktok') {
    try {
      const preview = await oembedPreview('https://www.tiktok.com/oembed?url=', url);
      if (preview.previewTitle || preview.previewImage) return preview;
    } catch {
      /* fall through */
    }
  }

  if (platform === 'facebook') {
    return facebookPluginPreview(url);
  }

  if (platform === 'instagram') {
    return instagramOembedPreview(url);
  }

  const html = await curlHtml(url);
  const remoteImage = metaContent(html, 'og:image') || metaContent(html, 'twitter:image');
  const previewImage = remoteImage ? (await saveRemoteImage(remoteImage)) || remoteImage : undefined;
  const previewTitle = metaContent(html, 'og:title') || pageNameFromUrl(url).replace(/\./g, ' ');
  const previewDescription = metaContent(html, 'og:description');
  return {
    previewTitle: previewTitle || undefined,
    previewDescription: previewDescription || undefined,
    previewImage,
  };
};
