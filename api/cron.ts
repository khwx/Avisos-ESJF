import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAvisos } from './lib/scraper.js';
import { getNewAvisos, markAvisosAsSent, sendBroadcastEmails, sendTelegram, sendDiscord, sendWebPush, sendGenericWebhook } from './lib/notify.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization;
    const querySecret = req.query.secret as string | undefined;
    if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
      const isVercelCron = req.headers['x-vercel-cron'] === '1' || req.headers['x-vercel-cron'] === 'true';
      if (!isVercelCron) {
        return res.status(401).json({ error: 'Unauthorized - invalid CRON_SECRET' });
      }
    }
  }

  try {
    const avisos = await getAvisos();

    if (!avisos || avisos.length === 0) {
      return res.status(200).json({ ok: true, message: 'Nenhum aviso encontrado', count: 0 });
    }

    // Detect what's actually new (with deduplication via store/KV)
    const newAvisos = await getNewAvisos(avisos);
    const force = req.query.force === 'true' || req.query.force === '1';

    // If ?force=true, send regardless (useful for testing)
    const toSend = force ? avisos.slice(0, 3) : newAvisos;

    if (toSend.length === 0) {
      return res.status(200).json({
        ok: true,
        checkedAt: new Date().toISOString(),
        count: avisos.length,
        newCount: 0,
        message: 'Nenhum aviso novo desde a última verificação',
      });
    }

    // Send to all channels in parallel
    const results: any = {};
    const [emailRes, telegramRes, discordRes, pushRes, webhookRes] = await Promise.all([
      sendBroadcastEmails(toSend).catch(e => ({ sent: 0, error: String(e) })),
      sendTelegram(toSend).catch(e => ({ sent: 0, error: String(e) })),
      sendDiscord(toSend).catch(e => ({ sent: 0, error: String(e) })),
      sendWebPush(toSend).catch(e => ({ sent: 0, error: String(e) })),
      sendGenericWebhook(toSend).catch(e => ({ sent: 0, error: String(e) })),
    ]);

    results.email = emailRes;
    results.telegram = telegramRes;
    results.discord = discordRes;
    results.webpush = pushRes;
    results.webhook = webhookRes;

    // Only mark as sent after attempting delivery (avoid missing on failure)
    // If at least one channel succeeded or no channels configured, mark as sent to avoid loops
    const anySent = emailRes.sent > 0 || telegramRes.sent > 0 || discordRes.sent > 0 || pushRes.sent > 0 || webhookRes.sent > 0;
    const noChannelsConfigured = [emailRes, telegramRes, discordRes, pushRes, webhookRes].every(r => r.error?.includes('not configured'));

    if (anySent || noChannelsConfigured || force) {
      await markAvisosAsSent(avisos);
    }

    return res.status(200).json({
      ok: true,
      checkedAt: new Date().toISOString(),
      count: avisos.length,
      newCount: toSend.length,
      newAvisos: toSend.map(a => ({ id: a.id, title: a.title, date: a.date })),
      results,
      note: noChannelsConfigured
        ? 'Nenhum canal configurado. Configure RESEND_AUDIENCE_ID, VAPID keys, TELEGRAM_BOT_TOKEN ou DISCORD_WEBHOOK_URL.'
        : anySent ? 'Notificações enviadas com sucesso' : 'Tentativa de envio falhou, ver logs',
    });
  } catch (error: any) {
    console.error('Cron error:', error);
    return res.status(500).json({ error: 'Erro no cron job', details: error?.message });
  }
}
