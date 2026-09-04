import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPushSubscriptions, removePushSubscription } from '../lib/store.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:avisos@esjf.edu.pt';

  if (!publicKey || !privateKey) {
    return res.status(500).json({ error: 'VAPID_PUBLIC_KEY ou VAPID_PRIVATE_KEY não configuradas no Vercel (Settings > Environment Variables).' });
  }

  let webpush: any;
  try {
    const imported = await import('web-push');
    webpush = imported.default?.setVapidDetails ? imported.default : imported;
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch (e: any) {
    return res.status(500).json({ error: 'Módulo web-push indisponível: ' + e?.message });
  }

  const bodySub = req.body?.subscription || (req.body?.endpoint ? req.body : null);
  const subs = bodySub ? [bodySub] : await getPushSubscriptions();

  if (!subs || subs.length === 0) {
    return res.status(400).json({ error: 'Nenhum dispositivo subscrito encontrado. Ative primeiro o Push no Chrome.' });
  }

  const payload = JSON.stringify({
    title: '🔔 Teste de Notificação Web Push — ESJF',
    body: 'O Chrome está pronto para receber notificações mesmo com o navegador fechado!',
    url: '/',
    icon: 'https://esjf.edu.pt/assets/img/favicon-esjf.png',
  });

  let sent = 0;
  const errors: string[] = [];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, payload);
      sent++;
    } catch (err: any) {
      errors.push(err?.message || String(err));
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await removePushSubscription(sub.endpoint);
      }
    }
  }

  return res.status(200).json({
    success: sent > 0,
    sent,
    total: subs.length,
    errors: errors.length > 0 ? errors : undefined
  });
}
