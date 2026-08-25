import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAvisos } from '../src/lib/scraper';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const avisos = await getAvisos();
    res.status(200).json(avisos);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch avisos' });
  }
}
