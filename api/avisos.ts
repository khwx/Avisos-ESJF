import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAvisos } from './lib/scraper';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const avisos = await getAvisos();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    res.status(200).json(avisos);
  } catch (error: any) {
    res.status(500).json({ 
      error: 'Failed to fetch avisos', 
      details: error?.message, 
      stack: error?.stack 
    });
  }
}
