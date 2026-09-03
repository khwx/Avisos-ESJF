import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return res.status(500).json({ error: 'VAPID_PUBLIC_KEY not configured' });
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).json({ publicKey });
}
