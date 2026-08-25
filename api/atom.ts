import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateRSS } from './lib/scraper.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const feed = await generateRSS();
    res.setHeader('Content-Type', 'application/atom+xml');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    res.status(200).send(feed.atom1());
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to generate Atom', details: error?.message });
  }
}
