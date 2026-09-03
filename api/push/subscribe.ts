import type { VercelRequest, VercelResponse } from '@vercel/node';
import { addPushSubscription } from '../lib/store.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const subscription = req.body;

  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: 'Invalid push subscription' });
  }

  try {
    await addPushSubscription(subscription);
    return res.status(200).json({ success: true });
  } catch (e: any) {
    console.error('Push subscribe error:', e);
    return res.status(500).json({ error: e?.message });
  }
}
