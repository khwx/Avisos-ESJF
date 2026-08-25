/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef } from "react";
import { Bell, BellRing, Rss, ExternalLink, Calendar, RefreshCcw, Moon, Sun, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

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
  const [toast, setToast] = useState<{ id: number, message: string } | null>(null);
  
  // Notification state
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date>(new Date());
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  
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
          if (notificationsEnabled) {
            newAvisos.forEach(aviso => {
              if (Notification.permission === "granted") {
                new Notification("Novo Aviso: ESJF", {
                  body: aviso.title,
                  icon: "/favicon.ico"
                });
              }
            });
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
    if (("Notification" in window) && Notification.permission === "granted") {
      setNotificationsEnabled(true);
      
      const handleFirstClick = () => {
        initAudio();
        window.removeEventListener('click', handleFirstClick);
      };
      window.addEventListener('click', handleFirstClick);
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

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      initAudio();
      setNotificationsEnabled(true);
      new Notification("Notificações Ativadas!", {
        body: "Receberá um alerta quando houver novos avisos."
      });
    } else {
      alert("Permissão para notificações negada.");
    }
  };

  const filteredAvisos = avisos.filter((aviso) => {
    const query = searchQuery.toLowerCase();
    return aviso.title.toLowerCase().includes(query) || aviso.content.toLowerCase().includes(query);
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-slate-100 font-sans transition-colors duration-200">
      <header className="bg-slate-900 text-white shadow-lg sticky top-0 z-10 border-b border-transparent dark:border-slate-800 transition-colors duration-200">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Avisos ESJF</h1>
              <p className="text-slate-400 text-sm mt-1">Escola Secundária José Falcão - Portal Não Oficial</p>
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
              
              <button
                onClick={toggleNotifications}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  notificationsEnabled 
                    ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' 
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {notificationsEnabled ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
                <span className="hidden sm:inline">
                  {notificationsEnabled ? 'Notificações Ativas' : 'Ativar Alertas'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 transition-colors duration-200">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <Rss className="w-5 h-5 text-orange-500" />
              Feed RSS Disponível
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm mt-1 max-w-2xl">
              Como o site oficial não tem um feed RSS, criámos um para si. 
              Pode adicionar este link ao seu leitor de RSS preferido (Feedly, Inoreader, etc.) 
              para ser notificado sempre que houver novidades, mesmo com esta página fechada.
            </p>
          </div>
          <a 
            href="/api/rss" 
            target="_blank" 
            rel="noreferrer"
            className="flex-shrink-0 bg-orange-100 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-500/20 px-5 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors border border-orange-200 dark:border-orange-500/20"
          >
            <Rss className="w-4 h-4" />
            Copiar Link RSS
          </a>
        </div>

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
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4 px-1">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Últimos Avisos</h2>
              
              <div className="relative w-full sm:w-72">
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
            
            <p className="text-xs text-slate-500 dark:text-slate-400 px-1 -mt-2">Atualizado às {lastCheck.toLocaleTimeString()}</p>
            
            {filteredAvisos.length === 0 ? (
              <p className="text-center text-slate-500 dark:text-slate-400 py-10">
                {searchQuery ? 'Nenhum aviso encontrado para esta pesquisa.' : 'Nenhum aviso encontrado.'}
              </p>
            ) : (
              <motion.div 
                className="grid gap-6"
                variants={containerVariants}
                initial="hidden"
                animate="show"
                key={searchQuery} // Forces re-animation when search changes
              >
                {filteredAvisos.map((aviso) => (
                  <motion.article 
                    key={aviso.id} 
                    variants={itemVariants}
                    layout // Smoothly adjust layout when items are filtered
                    className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden hover:shadow-md transition-shadow transition-colors duration-200"
                  >
                    <div className="p-6">
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider border border-blue-100 dark:border-blue-800/50">
                          {aviso.category || 'Geral'}
                        </span>
                        <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                          <Calendar className="w-4 h-4" />
                          <time>{aviso.date}</time>
                        </div>
                      </div>
                      
                      <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-3 leading-snug">
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
                          className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium text-sm transition-colors"
                        >
                          Ver documento original
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </motion.article>
                ))}
              </motion.div>
            )}
          </div>
        )}
      </main>

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

