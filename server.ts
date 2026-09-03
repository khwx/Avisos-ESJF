import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import { getAvisos, generateRSS } from "./src/lib/scraper";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

// API Routes
app.get("/api/avisos", async (req, res) => {
  try {
    const avisos = await getAvisos();
    res.json(avisos);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch avisos" });
  }
});

app.get("/api/rss", async (req, res) => {
  try {
    const feed = await generateRSS();
    res.type('application/xml');
    res.send(feed.rss2());
  } catch (error) {
    res.status(500).json({ error: "Failed to generate RSS" });
  }
});

app.get("/api/atom", async (req, res) => {
  try {
    const feed = await generateRSS();
    res.type('application/atom+xml');
    res.send(feed.atom1());
  } catch (error) {
    res.status(500).json({ error: "Failed to generate Atom" });
  }
});

app.post("/api/subscribe", async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: "Email inválido" });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const webhookUrl = process.env.EMAIL_WEBHOOK_URL;
  const emailFrom = process.env.EMAIL_FROM || 'ESJF Avisos <onboarding@resend.dev>';
  const adminEmail = process.env.ADMIN_EMAIL;
  const resendAudienceId = process.env.RESEND_AUDIENCE_ID;

  try {
    if (resendApiKey) {
      if (resendAudienceId) {
        await fetch(`https://api.resend.com/audiences/${resendAudienceId}/contacts`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, unsubscribed: false })
        }).catch(err => console.error('Erro ao adicionar contacto ao Resend:', err));
      }

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: emailFrom,
          to: [email],
          subject: '✅ Subscrição de Avisos - Escola Secundária José Falcão',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
              <h2 style="color: #2563eb;">Subscrição Confirmada!</h2>
              <p>Olá,</p>
              <p>O seu email foi registado com sucesso para receber notificações dos novos avisos da <strong>Escola Secundária José Falcão</strong>.</p>
              <p>Sempre que um novo aviso for publicado no portal da escola, será notificado por este meio.</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="font-size: 12px; color: #64748b;">Este é um serviço independente de agregação de avisos da ESJF.</p>
            </div>
          `,
        })
      });

      if (adminEmail) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: emailFrom,
            to: [adminEmail],
            subject: '🔔 Novo subscritor nos Avisos ESJF',
            text: `Novo email subscrito: ${email} em ${new Date().toLocaleString('pt-PT')}`,
          })
        }).catch(err => console.error('Erro ao notificar admin:', err));
      }
    }

    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          subscribedAt: new Date().toISOString(),
          source: 'ESJF Avisos Portal'
        })
      }).catch(err => console.error('Erro ao enviar para o webhook:', err));
    }

    if (!resendApiKey && !webhookUrl) {
      await new Promise(resolve => setTimeout(resolve, 600));
    }

    return res.status(200).json({ success: true, message: 'Subscrição registada com sucesso!' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Erro ao processar subscrição', details: error?.message });
  }
});

// Cron - deteta novos avisos e dispara todos os canais (email broadcast, telegram, discord, web push)
app.all("/api/cron", async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization;
    const querySecret = req.query.secret as string | undefined;
    if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
      const isVercelCron = req.headers['x-vercel-cron'] === '1' || req.headers['x-vercel-cron'] === 'true';
      if (!isVercelCron) return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  try {
    const { getNewAvisos, markAvisosAsSent, sendBroadcastEmails, sendTelegram, sendDiscord, sendWebPush, sendGenericWebhook } = await import("./api/lib/notify.js");
    const avisos = await getAvisos();
    if (!avisos || avisos.length === 0) return res.status(200).json({ ok: true, count: 0, message: 'Nenhum aviso encontrado' });
    const force = req.query.force === 'true' || req.query.force === '1';
    const newAvisos = force ? avisos.slice(0, 3) : await getNewAvisos(avisos);
    if (newAvisos.length === 0) {
      return res.status(200).json({ ok: true, checkedAt: new Date().toISOString(), count: avisos.length, newCount: 0, message: 'Nenhum aviso novo' });
    }
    const [emailRes, telegramRes, discordRes, pushRes, webhookRes] = await Promise.all([
      sendBroadcastEmails(newAvisos).catch(e => ({ sent: 0, error: String(e) })),
      sendTelegram(newAvisos).catch(e => ({ sent: 0, error: String(e) })),
      sendDiscord(newAvisos).catch(e => ({ sent: 0, error: String(e) })),
      sendWebPush(newAvisos).catch(e => ({ sent: 0, error: String(e) })),
      sendGenericWebhook(newAvisos).catch(e => ({ sent: 0, error: String(e) })),
    ]);
    const anySent = emailRes.sent > 0 || telegramRes.sent > 0 || discordRes.sent > 0 || pushRes.sent > 0 || webhookRes.sent > 0;
    const noChannels = [emailRes, telegramRes, discordRes, pushRes, webhookRes].every(r => (r as any).error?.includes('not configured'));
    if (anySent || noChannels || force) {
      await markAvisosAsSent(avisos);
    }
    return res.status(200).json({ ok: true, checkedAt: new Date().toISOString(), count: avisos.length, newCount: newAvisos.length, newAvisos: newAvisos.map(a => ({ id: a.id, title: a.title, date: a.date })), results: { email: emailRes, telegram: telegramRes, discord: discordRes, webpush: pushRes, webhook: webhookRes } });
  } catch (error: any) {
    console.error('Cron error:', error);
    return res.status(500).json({ error: 'Erro no cron job', details: error?.message });
  }
});

// Web Push endpoints (dev mirror of /api/push/*)
app.get("/api/push/vapid", async (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return res.status(500).json({ error: 'VAPID_PUBLIC_KEY not configured' });
  res.json({ publicKey });
});
app.post("/api/push/subscribe", async (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Invalid subscription' });
  const { addPushSubscription } = await import("./api/lib/store.js");
  await addPushSubscription(sub);
  res.json({ success: true });
});
app.post("/api/push/unsubscribe", async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
  const { removePushSubscription } = await import("./api/lib/store.js");
  await removePushSubscription(endpoint);
  res.json({ success: true });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();

export default app;
