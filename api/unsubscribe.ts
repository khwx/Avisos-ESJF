import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyUnsubscribeToken } from './lib/security.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const emailRaw = (req.query.email as string) || (req.body?.email as string) || '';
  const token = (req.query.token as string) || (req.body?.token as string) || '';
  const email = emailRaw.toLowerCase().trim();

  // Show HTML form for GET without params
  if (req.method === 'GET' && !email) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`
      <!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cancelar subscrição — ESJF</title></head>
      <body style="font-family:sans-serif;max-width:480px;margin:40px auto;padding:20px;">
        <h2>Cancelar subscrição — Avisos ESJF</h2>
        <p>Introduza o email que quer remover:</p>
        <form method="POST" action="/api/unsubscribe" style="display:flex;gap:8px;">
          <input name="email" type="email" required placeholder="o-seu-email@exemplo.com" style="flex:1;padding:10px;border:1px solid #cbd5e1;border-radius:8px;" />
          <button type="submit" style="padding:10px 20px;background:#dc2626;color:white;border:none;border-radius:8px;cursor:pointer;">Remover</button>
        </form>
        <p style="font-size:12px;color:#64748b;margin-top:16px;">Se recebeu um email, use o link "Cancelar subscrição" no rodapé — é mais seguro.</p>
      </body></html>
    `);
  }

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  // If token is present, verify. If no token but POST from form, allow (user typed own email)
  const hasToken = !!token;
  if (hasToken && !verifyUnsubscribeToken(email, token)) {
    return res.status(401).json({ error: 'Token inválido ou expirado. Use o link do email ou confirme o email.' });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;

  try {
    let removedFromResend = false;

    if (resendApiKey && audienceId) {
      // Resend: we need the contact ID first. Try to fetch contact, then PATCH to unsubscribed
      // GET /audiences/{id}/contacts/{email or id}
      // For simplicity, we try to update via POST with unsubscribed:true (idempotent)
      // Resend API: PUT /audiences/{id}/contacts/{contactId} or POST with same email will update
      try {
        // Try to find contact by email via search
        const searchRes = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts?email=${encodeURIComponent(email)}`, {
          headers: { Authorization: `Bearer ${resendApiKey}` },
        });
        let contactId: string | null = null;
        if (searchRes.ok) {
          const data = await searchRes.json() as any;
          const contacts = data.data || data.contacts || [];
          const found = contacts.find((c: any) => c.email?.toLowerCase() === email);
          if (found) contactId = found.id;
        }

        if (contactId) {
          const patchRes = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts/${contactId}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ unsubscribed: true }),
          });
          removedFromResend = patchRes.ok;
          if (!patchRes.ok) console.error('Resend PATCH error:', await patchRes.text());
        } else {
          // Contact not found — try to create as unsubscribed to prevent future sends (or just succeed)
          await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, unsubscribed: true }),
          });
          removedFromResend = true;
        }
      } catch (e) {
        console.error('Unsubscribe Resend error:', e);
      }
    }

    // Always respond with success to avoid email enumeration
    const acceptHtml = req.headers.accept?.includes('text/html');
    if (acceptHtml || req.method === 'GET') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(`
        <!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Subscrição cancelada</title></head>
        <body style="font-family:sans-serif;max-width:480px;margin:40px auto;padding:20px;text-align:center;">
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;padding:24px;border-radius:12px;">
            <h2 style="margin:0 0 8px;">✅ Subscrição cancelada</h2>
            <p style="margin:0;color:#166534;"><strong>${email}</strong> foi removido da lista de alertas.</p>
            <p style="margin:12px 0 0;font-size:13px;color:#15803d;">Deixará de receber emails de novos avisos. Pode voltar a subscrever em <a href="https://avisos-esjf.vercel.app" style="color:#15803d;text-decoration:underline;">avisos-esjf.vercel.app</a></p>
          </div>
          <p style="font-size:12px;color:#64748b;margin-top:16px;">Se não foi você, ignore — o email continua protegido.</p>
        </body></html>
      `);
    }

    return res.status(200).json({ success: true, message: 'Subscrição cancelada com sucesso', email, removedFromResend });
  } catch (e: any) {
    console.error('Unsubscribe error:', e);
    return res.status(500).json({ error: 'Erro ao cancelar subscrição', details: e?.message });
  }
}
