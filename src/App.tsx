/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef, type FormEvent } from "react";
import { NavLink, Routes, Route, Link } from "react-router-dom";
import { Bell, BellRing, Rss, ExternalLink, Calendar, RefreshCcw, Moon, Sun, Search, X, CheckCircle, Circle, Mail, Send, Volume2, AlertTriangle, Settings } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import NotificationsPage from "./pages/Notifications.tsx";

interface Aviso {
  id: string;
  title: string;
  category: string;
  date: string;
  content: string;
  link: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { 
    opacity: 1, 
    y: 0, 
    transition: { type: "spring", stiffness: 300, damping: 24 } 
  }
};

export default function App() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todas");
  const [toast, setToast] = useState<{ id: number, message: string } | null>(null);
  
  // Email Subscription State
  const [subEmail, setSubEmail] = useState("");
  const [subStatus, setSubStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubscribe = async (e: FormEvent) => {
    e.preventDefault();
    if (!subEmail) return;
    
    setSubStatus('loading');
    
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: subEmail })
      });
      
      if (res.ok) {
        setSubStatus('success');
        setSubEmail("");
        setTimeout(() => setSubStatus('idle'), 3000);
      } else {
        setSubStatus('error');
      }
    } catch (err) {
      setSubStatus('error');
    }
  };
  
  const [readAvisos, setReadAvisos] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('readAvisos');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    localStorage.setItem('readAvisos', JSON.stringify(Array.from(readAvisos)));
  }, [readAvisos]);
  
  // Notification state
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [lastCheck, setLastCheck] = useState<Date>(new Date());
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Web Push state
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  
  // Keep track of known IDs to detect new ones
  const knownAvisosRef = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);

  const initAudio = () => {
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          audioCtxRef.current = new AudioContextClass();
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    } catch (e) {
      console.error("Audio init error", e);
    }
  };

  const playNotificationSound = () => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15); // E5

      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);

      gainNode.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.2);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1);
    } catch (e) {
      console.error("Erro ao tocar som", e);
    }
  };

  const showNativeNotification = async (title: string, body: string, url?: string) => {
    if (Notification.permission !== 'granted') return;
    try {
      // Prefer Service Worker notification (works even if tab is in background / PWA)
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        // Use SW if available, otherwise fallback to window.Notification
        if (reg && (reg as any).showNotification) {
          await reg.showNotification(title, {
            body,
            icon: 'https://esjf.edu.pt/assets/img/favicon-esjf.png',
            badge: 'https://esjf.edu.pt/assets/img/favicon-esjf.png',
            data: { url: url || '/' },
            vibrate: [200, 100, 200],
          } as any);
          return;
        }
      }
      new Notification(title, {
        body,
        icon: 'https://esjf.edu.pt/assets/img/favicon-esjf.png',
      });
    } catch (e) {
      // Fallback
      try {
        new Notification(title, { body });
      } catch {}
    }
  };

  const fetchAvisos = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/avisos");
      if (!res.ok) throw new Error("Falha ao carregar avisos.");
      const data: Aviso[] = await res.json();
      setAvisos(data);
      
      // Check for new avisos if silent (polling)
      if (silent && knownAvisosRef.current.size > 0) {
        const newAvisos = data.filter(a => !knownAvisosRef.current.has(a.id));
        if (newAvisos.length > 0) {
          playNotificationSound();
          
          // Show Toast Notification
          const msg = `Novo aviso: ${newAvisos[0].title}${newAvisos.length > 1 ? ` (e mais ${newAvisos.length - 1})` : ''}`;
          setToast({ id: Date.now(), message: msg });
          setTimeout(() => setToast(null), 6000);

          // Native OS Notification
          if (notificationsEnabled && Notification.permission === "granted") {
            for (const aviso of newAvisos) {
              await showNativeNotification("Novo Aviso: ESJF", aviso.title, aviso.link);
            }
          }
        }
      }
      
      // Update known avisos
      data.forEach(a => knownAvisosRef.current.add(a.id));
      setLastCheck(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchAvisosRef = useRef(fetchAvisos);
  useEffect(() => {
    fetchAvisosRef.current = fetchAvisos;
  });

  useEffect(() => {
    fetchAvisos();
    
    // Check Notification permission on load
    let removeClickListener: (() => void) | undefined;
    if (!("Notification" in window)) {
      setNotificationPermission('unsupported');
    } else {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === "granted") {
        setNotificationsEnabled(true);
      }
      const handleFirstClick = () => {
        initAudio();
        window.removeEventListener('click', handleFirstClick);
      };
      window.addEventListener('click', handleFirstClick);
      removeClickListener = () => window.removeEventListener('click', handleFirstClick);
    }

    // Initialize Theme
    const storedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (storedTheme === 'dark' || (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    } else {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    }

    return () => {
      if (removeClickListener) removeClickListener();
    };
  }, []);

  // Global polling for notifications and toast (every 3 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAvisosRef.current(true);
    }, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', next);
      if (next === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return next;
    });
  };

  const toggleNotifications = async () => {
    if (!("Notification" in window)) {
      alert("O seu navegador não suporta notificações de ambiente de trabalho.");
      return;
    }

    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      return;
    }

    if (Notification.permission === 'denied') {
      alert("As notificações estão bloqueadas no seu navegador. Vá a Definições do site > Notificações > Permitir para ativar.");
      setNotificationPermission('denied');
      return;
    }

    initAudio();
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted") {
      setNotificationsEnabled(true);
      await showNativeNotification("Notificações Ativadas! ✅", "Receberá um alerta com som quando houver novos avisos.");
      // Also toast for feedback
      setToast({ id: Date.now(), message: "Notificações ativadas com sucesso!" });
      setTimeout(() => setToast(null), 4000);
    } else if (permission === "denied") {
      alert("Permissão para notificações negada. Pode reativar nas definições do navegador.");
    }
  };

  const testNotification = async () => {
    initAudio();
    playNotificationSound();
    setToast({ id: Date.now(), message: "🔔 Notificação de teste enviada!" });
    setTimeout(() => setToast(null), 4000);
    if (Notification.permission === 'granted') {
      await showNativeNotification("Teste de Notificação 🔔", "Se viu este alerta e ouviu o som, as notificações estão a funcionar!");
    } else {
      alert("Ative primeiro as notificações para testar.");
    }
  };

  // ---- Web Push helpers ----
  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setPushSupported(supported);
    if (supported) {
      navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription()).then(sub => {
        setPushEnabled(!!sub);
      }).catch(() => {});
    }
  }, [notificationsEnabled]);

  const subscribePush = async () => {
    if (!pushSupported) {
      alert('Web Push não suportado neste navegador.');
      return;
    }
    setPushLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      if (perm !== 'granted') {
        alert('Permissão negada.');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const vapidRes = await fetch('/api/push/vapid');
      if (!vapidRes.ok) throw new Error('VAPID não configurado no servidor');
      const { publicKey } = await vapidRes.json();
      const existing = await reg.pushManager.getSubscription();
      const sub = existing || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as any,
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error('Falha ao registar no servidor');
      setPushEnabled(true);
      setNotificationsEnabled(true);
      initAudio();
      setToast({ id: Date.now(), message: '✅ Web Push ativado! Vais receber avisos mesmo com o browser fechado.' });
      setTimeout(() => setToast(null), 5000);
      await showNativeNotification('Web Push Ativado! ✅', 'Vais receber notificações mesmo com o browser fechado.');
    } catch (e: any) {
      console.error(e);
      alert('Erro ao ativar Web Push: ' + (e?.message || e));
    } finally {
      setPushLoading(false);
    }
  };

  const unsubscribePush = async () => {
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPushEnabled(false);
      setToast({ id: Date.now(), message: 'Web Push desativado.' });
      setTimeout(() => setToast(null), 3000);
    } catch (e: any) {
      alert('Erro ao desativar: ' + e?.message);
    } finally {
      setPushLoading(false);
    }
  };

  const toggleReadStatus = (id: string) => {
    setReadAvisos(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredAvisos = avisos.filter((aviso) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = aviso.title.toLowerCase().includes(query) || aviso.content.toLowerCase().includes(query);
    const matchesCategory = selectedCategory === "Todas" || (aviso.category || "Geral") === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const availableCategories = ["Todas", ...Array.from(new Set(avisos.map(a => a.category || "Geral"))).sort()];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-slate-100 font-sans transition-colors duration-200">
      <header className="bg-slate-900 text-white shadow-lg sticky top-0 z-10 border-b border-transparent dark:border-slate-800 transition-colors duration-200">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div>
                <Link to="/" className="hover:opacity-90 transition-opacity">
                  <h1 className="text-2xl font-bold tracking-tight">Avisos ESJF</h1>
                  <p className="text-slate-400 text-sm mt-1">Escola Secundária José Falcão - Portal Não Oficial</p>
                </Link>
              </div>
              <nav className="hidden sm:flex items-center gap-1 ml-2">
                <NavLink to="/" end className={({ isActive }) => `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-white text-slate-900' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                  Avisos
                </NavLink>
                <NavLink to="/notificacoes" className={({ isActive }) => `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${isActive ? 'bg-white text-slate-900' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                  <Settings className="w-4 h-4" /> Notificações
                </NavLink>
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors tooltip"
                aria-label="Alternar Tema"
                title="Alternar Tema"
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              
              <button 
                onClick={() => fetchAvisos()} 
                className="p-2 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors tooltip"
                aria-label="Atualizar"
                title="Atualizar"
              >
                <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleNotifications}
                  title={
                    notificationPermission === 'denied'
                      ? 'Notificações bloqueadas - clique para ver instruções'
                      : notificationPermission === 'unsupported'
                      ? 'Navegador não suporta notificações'
                      : notificationsEnabled
                      ? 'Desativar alertas'
                      : 'Ativar alertas no navegador'
                  }
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    notificationPermission === 'denied'
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      : notificationsEnabled
                      ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {notificationPermission === 'denied' ? (
                    <AlertTriangle className="w-5 h-5" />
                  ) : notificationsEnabled ? (
                    <BellRing className="w-5 h-5" />
                  ) : (
                    <Bell className="w-5 h-5" />
                  )}
                  <span className="hidden sm:inline">
                    {notificationPermission === 'denied'
                      ? 'Bloqueadas'
                      : notificationsEnabled
                      ? 'Notificações Ativas'
                      : 'Ativar Alertas'}
                  </span>
                </button>
                {notificationsEnabled && (
                  <button
                    onClick={testNotification}
                    className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                    title="Testar som e notificação"
                    aria-label="Testar notificação"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <Routes>
        <Route path="/" element={
          <main className="max-w-5xl mx-auto px-4 py-8">
            {notificationPermission === 'denied' && (
              <div className="mb-6 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-amber-800 dark:text-amber-200 text-sm">Notificações bloqueadas</h3>
                  <p className="text-amber-700 dark:text-amber-300/80 text-sm mt-1 leading-relaxed">
                    O seu navegador está a bloquear notificações. <Link to="/notificacoes" className="underline font-medium">Ir para Notificações</Link> para ver alternativas (Email/RSS).
                  </p>
                </div>
                <button onClick={() => setNotificationPermission(Notification.permission as any)} className="text-amber-600 dark:text-amber-400 hover:text-amber-800 p-1"><X className="w-4 h-4" /></button>
              </div>
            )}
            {notificationPermission === 'unsupported' && (
              <div className="mb-6 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex items-start gap-3">
                <Bell className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Notificações não suportadas</h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Use <Link to="/notificacoes" className="text-blue-600 dark:text-blue-400 underline">Email ou RSS</Link> para não perder avisos.</p>
                </div>
              </div>
            )}
            {notificationsEnabled && (
              <div className="mb-6 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30 rounded-xl p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-500/10 p-2 rounded-full"><BellRing className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /></div>
                  <div>
                    <h3 className="font-semibold text-emerald-800 dark:text-emerald-200 text-sm">Notificações ativas ✓</h3>
                    <p className="text-emerald-700 dark:text-emerald-300/80 text-xs mt-0.5">Verificação a cada 3 min. <Link to="/notificacoes" className="underline">Gerir em Notificações</Link></p>
                  </div>
                </div>
                <button onClick={testNotification} className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white"><Volume2 className="w-4 h-4" /> Testar</button>
              </div>
            )}
            
            {/* CTA leve para página dedicada */}
            <Link to="/notificacoes" className="mb-8 flex items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:shadow-md transition-shadow group">
              <div className="flex items-center gap-3">
                <div className="bg-violet-100 dark:bg-violet-900/30 p-2.5 rounded-lg group-hover:bg-violet-200 dark:group-hover:bg-violet-900/50 transition-colors">
                  <Settings className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">Receba avisos frescos</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Email • Push (browser fechado) • RSS • Telegram</p>
                </div>
              </div>
              <span className="text-sm font-medium text-violet-600 dark:text-violet-400 flex items-center gap-1">Gerir <span className="hidden sm:inline">notificações</span> →</span>
            </Link>

        {loading && avisos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
            <RefreshCcw className="w-8 h-8 animate-spin mb-4" />
            <p>A carregar os avisos mais recentes...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-red-700 dark:text-red-400 p-6 rounded-xl transition-colors duration-200">
            <h3 className="font-bold mb-1">Erro</h3>
            <p>{error}</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 px-1">
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-1">Últimos Avisos</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Atualizado às {lastCheck.toLocaleTimeString()}</p>
              </div>
              
              <div className="relative w-full sm:w-72 flex-shrink-0">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  placeholder="Pesquisar avisos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors duration-200"
                />
              </div>
            </div>

            {availableCategories.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto px-1 pb-2 scrollbar-hide">
                {availableCategories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                      selectedCategory === cat 
                        ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 border-slate-800 dark:border-slate-200' 
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
            
            {filteredAvisos.length === 0 ? (
              <p className="text-center text-slate-500 dark:text-slate-400 py-10">
                {searchQuery || selectedCategory !== "Todas" ? 'Nenhum aviso encontrado para este filtro.' : 'Nenhum aviso encontrado.'}
              </p>
            ) : (
              <motion.div 
                className="grid gap-6"
                variants={containerVariants}
                initial="hidden"
                animate="show"
                key={searchQuery + selectedCategory} // Forces re-animation when search or category changes
              >
                {filteredAvisos.map((aviso) => {
                  const isRead = readAvisos.has(aviso.id);
                  return (
                  <motion.article 
                    key={aviso.id} 
                    variants={itemVariants}
                    layout // Smoothly adjust layout when items are filtered
                    className={`bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden hover:shadow-md transition-all duration-200 ${isRead ? 'opacity-60 bg-slate-50 dark:bg-slate-900/50' : ''}`}
                  >
                    <div className="p-6">
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider border border-blue-100 dark:border-blue-800/50">
                            {aviso.category || 'Geral'}
                          </span>
                          <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                            <Calendar className="w-4 h-4" />
                            <time>{aviso.date}</time>
                          </div>
                        </div>
                        <button
                          onClick={() => toggleReadStatus(aviso.id)}
                          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md transition-colors ${
                            isRead 
                              ? 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800' 
                              : 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                          }`}
                          title={isRead ? "Marcar como não lido" : "Marcar como lido"}
                        >
                          {isRead ? <CheckCircle className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                          <span className="hidden sm:inline">{isRead ? 'Lido' : 'Marcar como lido'}</span>
                        </button>
                      </div>
                      
                      <h3 className={`text-xl font-bold mb-3 leading-snug ${isRead ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-slate-100'}`}>
                        {aviso.title}
                      </h3>
                      
                      <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-5">
                        {aviso.content}
                      </p>
                      
                      {aviso.link && (
                        <a 
                          href={aviso.link} 
                          target="_blank" 
                          rel="noreferrer"
                          onClick={() => {
                            if (!isRead) toggleReadStatus(aviso.id);
                          }}
                          className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium text-sm transition-colors"
                        >
                          Ver documento original
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </motion.article>
                )})}
              </motion.div>
            )}
          </div>
        )}
          </main>
        } />
        <Route path="/notificacoes" element={
          <NotificationsPage
            subEmail={subEmail}
            setSubEmail={setSubEmail}
            subStatus={subStatus}
            handleSubscribe={handleSubscribe}
            pushSupported={pushSupported}
            pushEnabled={pushEnabled}
            pushLoading={pushLoading}
            subscribePush={subscribePush}
            unsubscribePush={unsubscribePush}
          />
        } />
        <Route path="*" element={
          <main className="max-w-5xl mx-auto px-4 py-16 text-center">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Página não encontrada</h2>
            <Link to="/" className="inline-block mt-4 text-blue-600 dark:text-blue-400 hover:underline">Voltar aos avisos →</Link>
          </main>
        } />
      </Routes>

      {/* Mobile nav */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex z-20">
        <NavLink to="/" end className={({ isActive }) => `flex-1 py-3 text-center text-sm font-medium ${isActive ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30' : 'text-slate-600 dark:text-slate-400'}`}>Avisos</NavLink>
        <NavLink to="/notificacoes" className={({ isActive }) => `flex-1 py-3 text-center text-sm font-medium flex items-center justify-center gap-1.5 ${isActive ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30' : 'text-slate-600 dark:text-slate-400'}`}><Settings className="w-4 h-4" /> Notificações</NavLink>
      </nav>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-50 max-w-sm w-full bg-slate-900 dark:bg-slate-800 text-white rounded-xl shadow-2xl p-4 flex items-start gap-3 border border-slate-700/50"
          >
            <div className="bg-blue-500/20 text-blue-400 p-2 rounded-full shrink-0 mt-0.5">
              <BellRing className="w-5 h-5" />
            </div>
            <div className="flex-1 pt-0.5">
              <h4 className="font-semibold text-sm mb-1 text-slate-100">Nova Atualização</h4>
              <p className="text-sm text-slate-300 leading-snug">{toast.message}</p>
            </div>
            <button 
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-white transition-colors p-1"
              aria-label="Fechar notificação"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

