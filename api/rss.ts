import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateRSS } from './_lib/scraper';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const feed = await generateRSS();
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    res.status(200).send(feed.rss2());
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate RSS' });
  }
}
