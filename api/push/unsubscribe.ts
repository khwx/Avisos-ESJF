import type { VercelRequest, VercelResponse } from '@vercel/node';
import { removePushSubscription } from '../lib/store.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });

  try {
    await removePushSubscription(endpoint);
    return res.status(200).json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
}
