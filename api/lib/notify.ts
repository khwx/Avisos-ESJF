import { getLastSentIds, setLastSentIds, getPushSubscriptions } from './store.js';
import { getUnsubscribeUrl } from './security.js';

export interface Aviso {
  id: string;
  title: string;
  category: string;
  date: string;
  content: string;
  link: string;
}

export function isAvisoToday(aviso: Aviso): boolean {
  // Parse pt date like "12 set 2025" or fallback to false if unknown
  try {
    const ptMonths: Record<string, string> = {
      'jan': 'Jan', 'fev': 'Feb', 'mar': 'Mar', 'abr': 'Apr', 'mai': 'May', 'jun': 'Jun',
      'jul': 'Jul', 'ago': 'Aug', 'set': 'Sep', 'out': 'Oct', 'nov': 'Nov', 'dez': 'Dec'
    };
    const parts = aviso.date.split(' ');
    if (parts.length === 3) {
      const [day, ptMonth, year] = parts;
      const enMonth = ptMonths[ptMonth.toLowerCase()] || ptMonth;
      const parsed = new Date(`${day} ${enMonth} ${year}`);
      if (!isNaN(parsed.getTime())) {
        const today = new Date();
        return parsed.getDate() === today.getDate() &&
               parsed.getMonth() === today.getMonth() &&
               parsed.getFullYear() === today.getFullYear();
      }
    }
  } catch {}
  // If we can't parse, consider it potentially new (so we don't miss)
  return false;
}

export async function getNewAvisos(allAvisos: Aviso[]): Promise<Aviso[]> {
  if (!allAvisos.length) return [];
  const lastIds = await getLastSentIds();

  // If we have no history, we don't know what's new — treat none as new on first run
  // to avoid spamming all subscribers on first cron execution.
  // Instead, store current ids and return empty.
  if (lastIds.length === 0) {
    await setLastSentIds(allAvisos.map(a => a.id));
    return [];
  }

  const newOnes = allAvisos.filter(a => !lastIds.includes(a.id));
  return newOnes;
}

export async function markAvisosAsSent(allAvisos: Aviso[]): Promise<void> {
  await setLastSentIds(allAvisos.map(a => a.id));
}

// ---- Resend helpers ----
async function fetchResendContacts(): Promise<string[]> {
  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!apiKey || !audienceId) return [];

  const emails: string[] = [];
  let page = 1;
  // Resend audience contacts: GET /audiences/{id}/contacts
  // Paginated, but we try to fetch up to 1000 by looping
  try {
    while (true) {
      const url = `https://api.resend.com/audiences/${audienceId}/contacts?page=${page}&per_page=100`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        const txt = await res.text();
        console.error('Resend fetch contacts error:', txt);
        break;
      }
      const data = await res.json() as any;
      const contacts = data.data || data.contacts || [];
      if (!Array.isArray(contacts) || contacts.length === 0) break;
      for (const c of contacts) {
        if (c.email && !c.unsubscribed) emails.push(c.email);
      }
      if (contacts.length < 100) break;
      page++;
      if (page > 10) break; // safety: max 1000
    }
  } catch (e) {
    console.error('fetchResendContacts error:', e);
  }
  return emails;
}

export async function sendBroadcastEmails(newAvisos: Aviso[]): Promise<{ sent: number; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM || 'Avisos ESJF <onboarding@resend.dev>';
  if (!apiKey) return { sent: 0, error: 'RESEND_API_KEY not configured' };
  if (!newAvisos.length) return { sent: 0 };

  const audienceId = process.env.RESEND_AUDIENCE_ID;
  let recipients: string[] = [];

  if (audienceId) {
    recipients = await fetchResendContacts();
  }

  // Fallback: if no audience or empty, try ADMIN_EMAIL as minimal test
  // (We don't have a generic DB, so without audience we can't broadcast)
  if (recipients.length === 0) {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      console.warn('No audience contacts found, falling back to ADMIN_EMAIL only');
      recipients = [adminEmail];
    } else {
      return { sent: 0, error: 'No recipients: configure RESEND_AUDIENCE_ID and add contacts, or set ADMIN_EMAIL' };
    }
  }

  // Build email HTML for new avisos (shared part)
  const avisosHtml = newAvisos.map(a => `
    <div style="border:1px solid #e2e8f0; border-radius:8px; padding:16px; margin-bottom:12px; background:#f8fafc;">
      <span style="display:inline-block; background:#dbeafe; color:#1e40af; font-size:11px; font-weight:700; padding:2px 8px; border-radius:4px; text-transform:uppercase;">${a.category || 'Geral'}</span>
      <span style="font-size:12px; color:#64748b; margin-left:8px;">${a.date}</span>
      <h3 style="margin:8px 0 8px; color:#0f172a; font-size:16px;">${a.title}</h3>
      <p style="margin:0 0 12px; color:#334155; font-size:14px; line-height:1.5;">${a.content?.slice(0, 600) || ''}</p>
      <a href="${a.link}" style="display:inline-block; background:#2563eb; color:white; text-decoration:none; padding:8px 16px; border-radius:6px; font-size:13px; font-weight:600;">Ver aviso original →</a>
    </div>
  `).join('');

  const subject = newAvisos.length === 1
    ? `🔔 Novo aviso: ${newAvisos[0].title.slice(0, 60)}`
    : `🔔 ${newAvisos.length} novos avisos — ESJF`;

  // Send personalized per recipient (unsubscribe link com token único)
  let sent = 0;
  for (const to of recipients) {
    const unsubscribeUrl = getUnsubscribeUrl(to);
    const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
      <h2 style="color: #2563eb; margin-bottom:4px;">🔔 ${newAvisos.length === 1 ? 'Novo aviso' : `${newAvisos.length} novos avisos`} — ESJF</h2>
      <p style="color:#64748b; font-size:13px; margin-top:0;">Escola Secundária José Falcão • ${new Date().toLocaleString('pt-PT')}</p>
      <hr style="border:none; border-top:1px solid #e2e8f0; margin:16px 0;" />
      ${avisosHtml}
      <hr style="border:none; border-top:1px solid #e2e8f0; margin:20px 0;" />
      <p style="font-size:11px; color:#94a3b8; text-align:center;">Recebes este email porque subscreveste os alertas em Avisos ESJF.</p>
      <p style="font-size:11px; color:#94a3b8; text-align:center;"><a href="${unsubscribeUrl}" style="color:#2563eb;text-decoration:underline;">Cancelar subscrição</a> • <a href="https://esjf.edu.pt/avisos.php" style="color:#94a3b8;">Ver todos os avisos</a></p>
      <p style="font-size:10px; color:#cbd5e1; text-align:center; margin-top:8px;">Se não quiseres receber mais, clica em cancelar — é imediato e seguro.</p>
    </div>
  `;
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: emailFrom,
          to: [to],
          subject,
          html,
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }),
      });
      if (res.ok) sent++;
      else console.error('Resend send error for', to, await res.text());
      // Respeita rate limit da Resend (2 req/s no free)
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.error('sendBroadcastEmails error for', to, e);
    }
  }

  return { sent };
}

// ---- Telegram ----
export async function sendTelegram(newAvisos: Aviso[]): Promise<{ sent: number; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { sent: 0, error: 'TELEGRAM_BOT_TOKEN/CHAT_ID not configured' };
  if (!newAvisos.length) return { sent: 0 };

  let sent = 0;
  for (const aviso of newAvisos) {
    const text = `🔔 *${escapeMarkdown(aviso.title)}*\n_${escapeMarkdown(aviso.category || 'Geral')} • ${escapeMarkdown(aviso.date)}_\n\n${escapeMarkdown(aviso.content?.slice(0, 800) || '')}\n\n[Ver aviso](${aviso.link})`;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
          disable_web_page_preview: false,
        }),
      });
      if (res.ok) sent++;
      else console.error('Telegram error:', await res.text());
    } catch (e) {
      console.error('Telegram send error:', e);
    }
  }
  return { sent };
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

// ---- Discord ----
export async function sendDiscord(newAvisos: Aviso[]): Promise<{ sent: number; error?: string }> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return { sent: 0, error: 'DISCORD_WEBHOOK_URL not configured' };
  if (!newAvisos.length) return { sent: 0 };

  let sent = 0;
  for (const aviso of newAvisos) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: `🔔 ${aviso.title}`,
            description: (aviso.content || '').slice(0, 1000),
            color: 0x2563eb,
            fields: [
              { name: 'Categoria', value: aviso.category || 'Geral', inline: true },
              { name: 'Data', value: aviso.date || new Date().toLocaleDateString('pt-PT'), inline: true },
            ],
            url: aviso.link,
            timestamp: new Date().toISOString(),
            footer: { text: 'Avisos ESJF • Novo aviso' },
          }],
        }),
      });
      if (res.ok) sent++;
      else console.error('Discord error:', await res.text());
    } catch (e) {
      console.error('Discord send error:', e);
    }
  }
  return { sent };
}

// ---- Web Push ----
export async function sendWebPush(newAvisos: Aviso[]): Promise<{ sent: number; error?: string }> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:avisos@esjf.edu.pt';
  if (!publicKey || !privateKey) return { sent: 0, error: 'VAPID keys not configured' };
  if (!newAvisos.length) return { sent: 0 };

  let webpush: any;
  try {
    webpush = await import('web-push');
    webpush.default.setVapidDetails(subject, publicKey, privateKey);
  } catch (e) {
    return { sent: 0, error: 'web-push module not available' };
  }

  const subs = await getPushSubscriptions();
  if (!subs.length) return { sent: 0, error: 'No push subscriptions' };

  let sent = 0;
  const payload = JSON.stringify({
    title: newAvisos.length === 1 ? `🔔 ${newAvisos[0].title}` : `🔔 ${newAvisos.length} novos avisos — ESJF`,
    body: newAvisos.length === 1 ? (newAvisos[0].content?.slice(0, 120) || newAvisos[0].title) : `${newAvisos[0].title} e mais ${newAvisos.length - 1}`,
    url: newAvisos[0].link || '/',
    icon: 'https://esjf.edu.pt/assets/img/favicon-esjf.png',
  });

  for (const sub of subs) {
    try {
      await webpush.default.sendNotification(sub, payload);
      sent++;
    } catch (e: any) {
      console.error('Web Push send error:', e?.message || e);
      // If subscription expired (410), we could remove it
      if (e?.statusCode === 410 || e?.statusCode === 404) {
        const { removePushSubscription } = await import('./store.js');
        await removePushSubscription(sub.endpoint);
      }
    }
  }
  return { sent };
}

// ---- Generic Webhook ----
export async function sendGenericWebhook(newAvisos: Aviso[]): Promise<{ sent: number; error?: string }> {
  const url = process.env.EMAIL_WEBHOOK_URL;
  if (!url) return { sent: 0, error: 'EMAIL_WEBHOOK_URL not configured' };
  if (!newAvisos.length) return { sent: 0 };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'new_avisos',
        timestamp: new Date().toISOString(),
        count: newAvisos.length,
        avisos: newAvisos,
      }),
    });
    return { sent: res.ok ? 1 : 0, error: res.ok ? undefined : await res.text() };
  } catch (e: any) {
    return { sent: 0, error: e?.message };
  }
}
