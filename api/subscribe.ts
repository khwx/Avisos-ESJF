import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit, getUnsubscribeUrl } from './lib/security.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit: 5 subscrições por IP por minuto
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.headers['x-real-ip'] as string || 'unknown';
  const rl = await checkRateLimit(`subscribe:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(rl.resetIn / 1000)));
    return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em alguns segundos.' });
  }
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  
  const rawEmail = (req.body?.email as string) || '';
  const normalizedEmail = typeof rawEmail === 'string' ? rawEmail.toLowerCase().trim() : '';
  
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const webhookUrl = process.env.EMAIL_WEBHOOK_URL;
  const emailFrom = process.env.EMAIL_FROM || 'ESJF Avisos <onboarding@resend.dev>';
  const adminEmail = process.env.ADMIN_EMAIL;
  const resendAudienceId = process.env.RESEND_AUDIENCE_ID;

  const email = normalizedEmail;
  const unsubscribeUrl = getUnsubscribeUrl(email);

  try {
    // 1. Resend API (Se a chave RESEND_API_KEY estiver configurada no Vercel)
    if (resendApiKey) {
      // Se tiver Audience ID configurado, adiciona aos contactos do Resend
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

      // Envia email de confirmação para o utilizador (com List-Unsubscribe e link seguro)
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
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
              <h2 style="color: #2563eb;">Subscrição Confirmada!</h2>
              <p>Olá,</p>
              <p>O seu email foi registado com sucesso para receber notificações dos novos avisos da <strong>Escola Secundária José Falcão</strong>.</p>
              <p>Sempre que um novo aviso for publicado no portal da escola, será notificado por este meio.</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="font-size: 12px; color: #64748b;">Este é um serviço independente de agregação de avisos da ESJF.</p>
              <p style="font-size: 11px; color: #94a3b8; text-align:center; margin-top:16px;">
                Não quer receber mais? <a href="${unsubscribeUrl}" style="color:#2563eb;text-decoration:underline;">Cancelar subscrição</a>
              </p>
            </div>
          `,
        })
      });

      // Se tiver email de administrador configurado, notifica o administrador
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

    // 2. Webhook URL (Se estiver configurado um Webhook ex: Zapier, Make, Discord, Google Sheets)
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

    // Se nenhuma chave estiver configurada, simula um pequeno delay e responde sucesso
    if (!resendApiKey && !webhookUrl) {
      await new Promise(resolve => setTimeout(resolve, 600));
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Subscrição registada com sucesso!' 
    });
  } catch (error: any) {
    console.error('Erro na subscrição:', error);
    return res.status(500).json({ 
      error: 'Ocorreu um erro ao processar a subscrição.',
      details: error?.message 
    });
  }
}

