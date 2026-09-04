import { useState, type FormEvent } from 'react';
import { Rss, Mail, Send, Bell, BellRing, Volume2, X, CheckCircle, RefreshCcw, MessageCircle, Hash, ShieldCheck, ExternalLink } from 'lucide-react';

interface Props {
  subEmail: string;
  setSubEmail: (v: string) => void;
  subStatus: 'idle' | 'loading' | 'success' | 'error';
  handleSubscribe: (e: FormEvent) => void;
  pushSupported: boolean;
  pushEnabled: boolean;
  pushLoading: boolean;
  subscribePush: () => void;
  unsubscribePush: () => void;
}

export default function NotificationsPage({ subEmail, setSubEmail, subStatus, handleSubscribe, pushSupported, pushEnabled, pushLoading, subscribePush, unsubscribePush }: Props) {
  const [unsubEmail, setUnsubEmail] = useState('');
  const [unsubStatus, setUnsubStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleUnsubscribe = async (e: FormEvent) => {
    e.preventDefault();
    if (!unsubEmail) return;
    setUnsubStatus('loading');
    try {
      const res = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: unsubEmail }),
      });
      setUnsubStatus(res.ok ? 'success' : 'error');
      if (res.ok) setUnsubEmail('');
      setTimeout(() => setUnsubStatus('idle'), 4000);
    } catch {
      setUnsubStatus('error');
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Gerir Notificações</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Escolha como quer receber os avisos da ESJF. Todos os métodos são gratuitos e pode desativar a qualquer momento.
        </p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/30 rounded-xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="text-sm leading-relaxed text-blue-900 dark:text-blue-200">
          <strong>Privacidade & RGPD:</strong> O seu email é guardado apenas na Audience do Resend (encriptado, UE) e usado só para enviar novos avisos. Nunca é partilhado. Cada email tem link <em>Cancelar subscrição</em> com token seguro + header <code>List-Unsubscribe</code>. Pode também cancelar abaixo.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* RSS */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <Rss className="w-5 h-5 text-orange-500" /> Feed RSS
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm mt-2">
              Ideal para Feedly, Inoreader ou automatizações. Funciona mesmo com o site fechado.
            </p>
          </div>
          <div className="flex gap-2">
            <a href="/api/rss" target="_blank" rel="noreferrer" className="flex-1 text-center bg-orange-100 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-500/20 px-3 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 border border-orange-200 dark:border-orange-500/20 text-sm">
              <Rss className="w-4 h-4" /> RSS
            </a>
            <a href="/api/atom" target="_blank" rel="noreferrer" className="flex-1 text-center bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 text-sm">
              Atom
            </a>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-500">Dica: copie o link RSS e cole no seu leitor.</p>
        </div>

        {/* Email */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <Mail className="w-5 h-5 text-blue-500" /> Alertas por Email
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm mt-2">
              Receba um email automático e personalizado assim que a escola publicar um aviso.
            </p>
          </div>
          <form onSubmit={handleSubscribe} className="flex flex-col gap-3">
            <input type="email" required placeholder="o-seu-email@exemplo.com" value={subEmail} onChange={(e) => setSubEmail(e.target.value)} disabled={subStatus === 'loading' || subStatus === 'success'} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
            <button type="submit" disabled={subStatus === 'loading' || subStatus === 'success'} className={`w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm ${subStatus === 'success' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : subStatus === 'error' ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-70`}>
              {subStatus === 'loading' ? <RefreshCcw className="w-4 h-4 animate-spin" /> : subStatus === 'success' ? <CheckCircle className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              <span>{subStatus === 'loading' ? 'A subscrever...' : subStatus === 'success' ? 'Subscrito!' : subStatus === 'error' ? 'Erro' : 'Subscrever por Email'}</span>
            </button>
          </form>
        </div>

        {/* Web Push */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              {pushEnabled ? <BellRing className="w-5 h-5 text-emerald-500" /> : <Bell className="w-5 h-5 text-violet-500" />}
              Push (browser fechado)
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm mt-2">
              {pushEnabled ? '✅ Ativo — vai receber mesmo com o browser fechado.' : 'Notificações nativas do Chrome/Android mesmo com o browser fechado.'}
            </p>
            {!pushSupported && <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">Web Push não suportado neste navegador. No iOS instale a PWA.</p>}
          </div>
          {pushEnabled ? (
            <button onClick={unsubscribePush} disabled={pushLoading} className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 disabled:opacity-60">
              {pushLoading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}<span>{pushLoading ? 'A processar...' : 'Desativar Push'}</span>
            </button>
          ) : (
            <button onClick={subscribePush} disabled={pushLoading || !pushSupported} className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-60">
              {pushLoading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}<span>{pushLoading ? 'A ativar...' : 'Ativar Push'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-4">
          <h3 className="font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
            <MessageCircle className="w-5 h-5 text-sky-500" /> Telegram
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Receba avisos instantâneos no Telegram. Requer que o administrador configure <code>TELEGRAM_BOT_TOKEN</code> e <code>TELEGRAM_CHAT_ID</code> no Vercel. Depois o cron envia automaticamente.
          </p>
          <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline">
            Criar bot com @BotFather <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-4">
          <h3 className="font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
            <Hash className="w-5 h-5 text-indigo-500" /> Discord / Webhook
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Configure <code>DISCORD_WEBHOOK_URL</code> ou <code>EMAIL_WEBHOOK_URL</code> (Make/Zapier) no Vercel para receber avisos no Discord ou encaminhar para WhatsApp Business via automação.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-500">WhatsApp direto requer Twilio/Meta Business — use Telegram ou Make→WhatsApp.</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-2">Cancelar subscrição por email</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          Se já não quer receber emails, insira o email abaixo ou use o link <em>Cancelar subscrição</em> no rodapé de qualquer email (link com token HMAC seguro).
        </p>
        <form onSubmit={handleUnsubscribe} className="flex flex-col sm:flex-row gap-3">
          <input type="email" required placeholder="o-seu-email@exemplo.com" value={unsubEmail} onChange={(e) => setUnsubEmail(e.target.value)} disabled={unsubStatus === 'loading' || unsubStatus === 'success'} className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
          <button type="submit" disabled={unsubStatus === 'loading' || unsubStatus === 'success'} className={`px-5 py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 ${unsubStatus === 'success' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : unsubStatus === 'error' ? 'bg-red-500/10 text-red-600 border border-red-500/20' : 'bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-900'}`}>
            {unsubStatus === 'loading' ? <RefreshCcw className="w-4 h-4 animate-spin" /> : unsubStatus === 'success' ? <CheckCircle className="w-4 h-4" /> : null}
            {unsubStatus === 'success' ? 'Removido!' : unsubStatus === 'error' ? 'Erro' : 'Cancelar'}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-slate-400 dark:text-slate-600">
        Dúvidas? <a href="https://esjf.edu.pt/avisos.php" target="_blank" rel="noreferrer" className="underline">Ver portal oficial da ESJF</a>
      </p>
    </main>
  );
}
