/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Receipt, 
  PieChart, 
  Wallet, 
  Settings, 
  Mic, 
  TrendingUp, 
  TrendingDown, 
  Calendar,
  Bell,
  Search,
  Filter,
  Plus,
  Trash2,
  X,
  FileText,
  LogOut,
  Loader2,
  FileSpreadsheet
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import * as sheetService from './services/googleSheetsService';

// Types
interface Transaction {
  id: string;
  title: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  date: string;
  notes?: string;
}

interface GoogleUser {
  email: string;
  name: string;
  picture: string;
}

interface BillReminder {
  id: string;
  title: string;
  amount: number;
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue';
}

const CATEGORIES = [
  'Semua',
  'Makanan & Minuman',
  'Transportasi',
  'Belanja',
  'Tagihan Rutin',
  'Hiburan',
  'Lainnya'
];

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [reminders, setReminders] = useState<BillReminder[]>([]);

  const [activeCategory, setActiveCategory] = useState('Semua');
  const [isRecording, setIsRecording] = useState(false);
  const [voiceLog, setVoiceLog] = useState('');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'tx' | 'report' | 'settings'>('home');
  const [showAddModal, setShowAddModal] = useState(false);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const tokenClientRef = useRef<any>(null);

  const [newTx, setNewTx] = useState({
    title: '',
    amount: '',
    type: 'expense' as 'expense' | 'income',
    category: 'Makanan & Minuman'
  });

  const CLIENT_ID = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID;
  const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file email profile openid';

  useEffect(() => {
    const initGis = () => {
      if (!(window as any).google) return;
      tokenClientRef.current = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (resp: any) => {
          if (resp.error) {
            setError('Gagal mendapatkan izin akses.');
            return;
          }
          setAccessToken(resp.access_token);
          await handleUserInfo(resp.access_token);
        },
      });
    };

    // Check if script is already loaded
    if ((window as any).google) {
      initGis();
    } else {
      const script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (script) {
        script.addEventListener('load', initGis);
      }
    }
  }, [CLIENT_ID]);

  const handleUserInfo = async (token: string) => {
    try {
      const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await resp.json();
      setUser({
        email: data.email,
        name: data.name,
        picture: data.picture
      });
      await syncSpreadsheet(token);
    } catch (err) {
      console.error('User Info Error:', err);
    }
  };

  const syncSpreadsheet = async (token: string) => {
    setIsLoading(true);
    try {
      let sheet = await sheetService.findSpreadsheet(token);
      if (!sheet) {
        sheet = await sheetService.createSpreadsheet(token);
      }
      setSpreadsheetId(sheet.id);
      const data = await sheetService.fetchTransactionsFromSheet(token, sheet.id);
      setTransactions(data.reverse()); // Show newest first
    } catch (err: any) {
      setError('Gagal sinkronisasi dengan Google Sheets.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = () => {
    if (tokenClientRef.current) {
      tokenClientRef.current.requestAccessToken();
    } else {
      setError('Google Sign In belum siap. Silakan refresh halaman.');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setAccessToken(null);
    setSpreadsheetId(null);
    setTransactions([]);
  };

  // Manual Input Logic
  const handleAddTransaction = async () => {
    if (!newTx.title || !newTx.amount || !accessToken || !spreadsheetId) return;
    
    const amountVal = parseInt(newTx.amount.replace(/\D/g, ''));
    if (isNaN(amountVal)) return;

    const tx: sheetService.GoogleTransaction = {
      id: Math.random().toString(36).substr(2, 9),
      title: newTx.title,
      amount: amountVal,
      type: newTx.type,
      category: newTx.category,
      date: format(new Date(), 'yyyy-MM-dd')
    };

    setIsSyncing(true);
    try {
      await sheetService.appendTransaction(accessToken, spreadsheetId, tx);
      setTransactions([tx, ...transactions]);
      setShowAddModal(false);
      setNewTx({ title: '', amount: '', type: 'expense', category: 'Makanan & Minuman' });
    } catch (err) {
      setError('Gagal menyimpan transaksi ke Google Sheets.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Voice Input Logic
  const startVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Browser Anda tidak mendukung Input Suara.');
      return;
    }

    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      processVoiceCommand(transcript);
    };

    recognition.start();
  };

  const processVoiceCommand = async (text: string) => {
    setVoiceLog(`Diproses: "${text}"`);
    
    const numberMatch = text.match(/\d+/);
    if (numberMatch && accessToken && spreadsheetId) {
      const amount = parseInt(numberMatch[0]);
      const title = text.replace(numberMatch[0], '').trim();
      const type = text.toLowerCase().includes('bayar') || text.toLowerCase().includes('beli') || text.toLowerCase().includes('makan') ? 'expense' : 'income';
      
      const tx: sheetService.GoogleTransaction = {
        id: Math.random().toString(36).substr(2, 9),
        title: title || 'Transaksi Baru',
        amount,
        type,
        category: 'Lainnya',
        date: format(new Date(), 'yyyy-MM-dd')
      };
      
      setIsSyncing(true);
      try {
        await sheetService.appendTransaction(accessToken, spreadsheetId, tx);
        setTransactions([tx, ...transactions]);
      } catch (err) {
        setError('Gagal menyimpan transaksi suara.');
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const deleteTx = async (id: string) => {
    if (!accessToken || !spreadsheetId) return;
    setIsSyncing(true);
    try {
      await sheetService.deleteTransactionFromSheet(accessToken, spreadsheetId, id);
      setTransactions(transactions.filter(t => t.id !== id));
      setSelectedTx(null);
    } catch (err) {
      setError('Gagal menghapus transaksi dari Google Sheets.');
    } finally {
      setIsSyncing(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[40px] p-8 shadow-xl border border-slate-100 max-w-sm mx-auto w-full text-center"
        >
          <div className="w-16 h-16 bg-blue-600 rounded-[22px] flex items-center justify-center mb-6 shadow-lg shadow-blue-500/20 mx-auto">
            <Wallet className="w-8 h-8 text-white" />
          </div>
          
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Cash App</h2>
          <p className="text-sm text-slate-400 mb-8 font-medium">
            Simpan catatan keuangan Anda langsung ke Google Sheets secara aman.
          </p>

          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 text-[10px] font-bold rounded-2xl border border-red-100 uppercase tracking-widest leading-relaxed">
              {error}
            </div>
          )}

          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-100 rounded-2xl py-4 font-bold text-sm shadow-sm active:scale-95 transition-all mb-4 hover:bg-slate-50"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Lanjutkan dengan Google
          </button>
          
          <div className="text-[9px] text-slate-300 font-bold uppercase tracking-widest">
            Tanpa database terpusat • Data milik Anda
          </div>
        </motion.div>
      </div>
    );
  }

  // Calculations
  const filteredTransactions = useMemo(() => {
    let list = activeCategory === 'Semua' ? transactions : transactions.filter(t => t.category === activeCategory);
    return list;
  }, [transactions, activeCategory]);

  const totalBalance = useMemo(() => {
    return transactions.reduce((acc, t) => t.type === 'income' ? acc + t.amount : acc - t.amount, 0);
  }, [transactions]);

  const monthlyIncome = useMemo(() => {
    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());
    return transactions
      .filter(t => t.type === 'income' && isWithinInterval(parseISO(t.date), { start, end }))
      .reduce((acc, t) => acc + t.amount, 0);
  }, [transactions]);

  const monthlyExpense = useMemo(() => {
    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());
    return transactions
      .filter(t => t.type === 'expense' && isWithinInterval(parseISO(t.date), { start, end }))
      .reduce((acc, t) => acc + t.amount, 0);
  }, [transactions]);

  const chartData = useMemo(() => {
    const days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
    return days.map(day => ({
      name: day,
      value: Math.floor(Math.random() * 500000) + 50000
    }));
  }, []);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC] overflow-hidden font-sans">
      {/* Header Mobile Style */}
      <header className="px-6 py-6 pb-2 bg-white flex justify-between items-center z-10 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900 leading-tight">Cash App</h1>
          <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Personal Finance</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            <Bell className="w-5 h-5 text-slate-400" />
          </div>
          <button onClick={handleLogout} className="p-2 bg-slate-50 rounded-xl text-slate-400">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-6 pb-24 pt-4 space-y-6">
        {activeTab === 'home' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            {/* Balance Card */}
            <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-6 text-white shadow-xl shadow-blue-500/20">
              <div className="relative z-10">
                <span className="text-[10px] text-blue-100 uppercase font-bold tracking-widest opacity-80">Saldo Tersedia</span>
                <div className="text-3xl font-bold tracking-tight mt-1 mb-6">{formatCurrency(totalBalance)}</div>
                <div className="flex gap-4">
                  <div className="flex-1 bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10 transition-transform active:scale-95">
                    <TrendingUp className="w-4 h-4 text-green-400 mb-1" />
                    <div className="text-[9px] text-blue-100 uppercase font-bold">Pemasukan</div>
                    <div className="text-sm font-bold">{formatCurrency(monthlyIncome)}</div>
                  </div>
                  <div className="flex-1 bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10 transition-transform active:scale-95">
                    <TrendingDown className="w-4 h-4 text-red-400 mb-1" />
                    <div className="text-[9px] text-blue-100 uppercase font-bold">Pengeluaran</div>
                    <div className="text-sm font-bold">{formatCurrency(monthlyExpense)}</div>
                  </div>
                </div>
              </div>
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-12 translate-x-8 blur-3xl"></div>
            </div>

            {/* Quick Chart */}
            <div className="card">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-bold text-slate-800">Tren Mingguan</h3>
                <div className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">Mei 2024</div>
              </div>
              <div className="h-[120px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <Tooltip cursor={{ fill: '#F1F5F9' }} content={() => null} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {chartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={index === 3 ? '#2563EB' : '#DBEAFE'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Reminders Slider Horizontal style for Mobile */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-800">Tagihan Terdekat</h3>
                <button className="text-[10px] font-bold text-blue-600 hover:underline">Lihat Semua</button>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-2 px-2">
                {reminders.slice(0, 3).map(reminder => (
                  <div key={reminder.id} className="min-w-[160px] bg-white rounded-2xl p-4 shadow-sm border border-slate-100 shrink-0">
                    <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center mb-3">
                      <Calendar className="w-4 h-4 text-orange-500" />
                    </div>
                    <div className="text-xs font-bold text-slate-800 mb-1 line-clamp-1">{reminder.title}</div>
                    <div className="text-[10px] text-slate-500 font-medium mb-2">{reminder.dueDate}</div>
                    <div className="text-xs font-bold text-blue-600">{formatCurrency(reminder.amount)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Transaction List Summary */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-800">Transaksi Terakhir</h3>
              <div className="space-y-3">
                {transactions.slice(0, 5).map(t => (
                  <button 
                    key={t.id} 
                    onClick={() => setSelectedTx(t)}
                    className="w-full text-left flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-50 shadow-sm active:scale-[0.98] transition-transform"
                  >
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${t.type === 'income' ? 'bg-green-50 text-green-600' : 'bg-slate-50 text-slate-600'}`}>
                      {t.type === 'income' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="text-sm font-bold text-slate-800 truncate">{t.title}</div>
                      <div className="text-[10px] text-slate-400 font-medium">{t.date} • {t.category}</div>
                    </div>
                    <div className={`text-sm font-bold ${t.type === 'income' ? 'text-green-600' : 'text-slate-800'}`}>
                      {t.type === 'income' ? '+' : '-'} {formatCurrency(t.amount)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'tx' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Semua Transaksi</h2>
              <Filter className="w-5 h-5 text-slate-400" />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide -mx-2 px-2">
              {CATEGORIES.map(cat => (
                <button 
                  key={cat} 
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${activeCategory === cat ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-100'}`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="space-y-3 pb-32">
              {filteredTransactions.map(t => (
                <button 
                  key={t.id} 
                  onClick={() => setSelectedTx(t)}
                  className="w-full text-left flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-50 shadow-sm active:scale-[0.98] transition-transform"
                >
                   <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${t.type === 'income' ? 'bg-green-50 text-green-600' : 'bg-slate-50 text-slate-600'}`}>
                      {t.type === 'income' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                    </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="text-sm font-bold text-slate-800 truncate">{t.title}</div>
                    <div className="text-[10px] text-slate-400 font-medium">{t.date}</div>
                  </div>
                  <div className={`text-sm font-bold ${t.type === 'income' ? 'text-green-600' : 'text-slate-800'}`}>
                    {formatCurrency(t.amount)}
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </main>

      {/* Detail Transaction Modal / Side Panel for Mobile */}
      <AnimatePresence>
        {selectedTx && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelectedTx(null)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50"
            />
            <motion.div 
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-x-0 bottom-0 bg-white rounded-t-[40px] z-50 p-8 shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              <div className="w-12 h-1.5 bg-slate-100 rounded-full mx-auto mb-8"></div>
              
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-1">{selectedTx.title}</h3>
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-400">
                    <span className="px-2 py-0.5 rounded-md bg-slate-50 text-[10px] font-bold uppercase tracking-widest">{selectedTx.category}</span>
                    <span>•</span>
                    <span>{selectedTx.date}</span>
                  </div>
                </div>
                <button onClick={() => setSelectedTx(null)} className="p-2 bg-slate-50 rounded-full text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 text-center mb-8">
                <div className="text-[11px] text-slate-400 uppercase font-bold tracking-widest mb-1">Jumlah Transaksi</div>
                <div className={`text-3xl font-bold ${selectedTx.type === 'income' ? 'text-green-600' : 'text-slate-900'}`}>
                  {selectedTx.type === 'income' ? '+' : '-'} {formatCurrency(selectedTx.amount)}
                </div>
              </div>

              <div className="space-y-6">
                <div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                      <FileText size={14} /> Catatan
                    </label>
                    <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium text-slate-700 min-h-[60px]">
                      {selectedTx.notes || 'Tidak ada catatan'}
                    </div>
                </div>

                <div className="flex gap-4">
                  <button onClick={() => setSelectedTx(null)} className="flex-1 bg-blue-600 text-white rounded-2xl py-4 font-bold text-sm shadow-lg shadow-blue-500/20 active:scale-95 transition-all">
                    Selesai
                  </button>
                  <button 
                    onClick={() => deleteTx(selectedTx.id)}
                    disabled={isSyncing}
                    className="w-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isSyncing ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} />}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating Action Button for Adding (Manual/Voice) */}
      <div className="fixed bottom-24 right-6 flex flex-col gap-3 z-40">
        <AnimatePresence>
          {isRecording && (
            <motion.div 
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="bg-red-500 text-white px-4 py-2 rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-lg flex items-center gap-2"
            >
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              Mendengarkan...
            </motion.div>
          )}
        </AnimatePresence>
        
        <div className="flex gap-3 items-end">
          <button 
            onClick={startVoiceInput}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl transition-all active:scale-90 ${isRecording ? 'bg-red-500' : 'bg-slate-800 text-white shadow-slate-900/20'}`}
          >
            <Mic size={24} />
          </button>
          
          <button 
            onClick={() => setShowAddModal(true)}
            className="w-16 h-16 rounded-[24px] bg-blue-600 flex items-center justify-center shadow-2xl shadow-blue-500/30 text-white active:scale-90 transition-all"
          >
            <Plus size={32} />
          </button>
        </div>
      </div>

      {/* Manual Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 px-6 py-12"
            />
            <motion.div 
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              className="fixed inset-x-0 bottom-0 bg-white rounded-t-[40px] z-50 p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="w-12 h-1.5 bg-slate-100 rounded-full mx-auto mb-8"></div>
              
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-bold text-slate-900">Catat Transaksi</h3>
                <button onClick={() => setShowAddModal(false)} className="p-2 bg-slate-50 rounded-xl text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                  <button 
                    onClick={() => setNewTx({ ...newTx, type: 'expense' })}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${newTx.type === 'expense' ? 'bg-white shadow-sm text-red-500' : 'text-slate-400'}`}
                  >
                    Pengeluaran
                  </button>
                  <button 
                    onClick={() => setNewTx({ ...newTx, type: 'income' })}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${newTx.type === 'income' ? 'bg-white shadow-sm text-green-600' : 'text-slate-400'}`}
                  >
                    Pemasukan
                  </button>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 px-1">Deskripsi</label>
                  <input 
                    type="text" 
                    placeholder="Makan siang, Gaji, dll"
                    value={newTx.title}
                    onChange={(e) => setNewTx({ ...newTx, title: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 px-1">Jumlah (Rp)</label>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    placeholder="Contoh: 50.000"
                    value={newTx.amount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setNewTx({ ...newTx, amount: val ? parseInt(val).toLocaleString('id-ID') : '' });
                    }}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 px-1">Kategori</label>
                  <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide -mx-1 px-1">
                    {CATEGORIES.slice(1).map(cat => (
                      <button 
                        key={cat}
                        onClick={() => setNewTx({ ...newTx, category: cat })}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${newTx.category === cat ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={handleAddTransaction}
                  disabled={!newTx.title || !newTx.amount || isSyncing}
                  className="w-full bg-blue-600 text-white rounded-2xl py-4 font-bold text-sm shadow-xl shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2"
                >
                  {isSyncing && <Loader2 size={18} className="animate-spin" />}
                  {isSyncing ? 'Menyimpan...' : 'Simpan Transaksi'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating Action Button for Voice */}
      {/* (Removed redundant FAB logic replacement above) */}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 flex items-center justify-around py-4 pb-8 z-30">
        <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-blue-600' : 'text-slate-400'}`}>
          <LayoutDashboard size={22} className={activeTab === 'home' ? 'fill-blue-600/10' : ''} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Home</span>
        </button>
        <button onClick={() => setActiveTab('tx')} className={`flex flex-col items-center gap-1 ${activeTab === 'tx' ? 'text-blue-600' : 'text-slate-400'}`}>
          <Receipt size={22} className={activeTab === 'tx' ? 'fill-blue-600/10' : ''} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">List</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-slate-400">
          <PieChart size={22} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Stats</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-slate-400">
          <Settings size={22} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Menu</span>
        </button>
      </nav>

      {/* Voice Prompt Overlay */}
      <AnimatePresence>
        {voiceLog && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="fixed top-24 left-6 right-6 bg-slate-900/90 backdrop-blur-md text-white p-4 rounded-2xl z-50 text-xs font-semibold flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              {voiceLog}
            </div>
            <button onClick={() => setVoiceLog('')} className="p-1"><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

