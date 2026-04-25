/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo } from 'react';
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
  FileText
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
  const [transactions, setTransactions] = useState<Transaction[]>([
    { id: '1', title: 'Gaji Bulanan', amount: 8000000, type: 'income', category: 'Lainnya', date: '2024-05-01', notes: 'Transfer dari kantor' },
    { id: '2', title: 'Internet Indihome', amount: 450000, type: 'expense', category: 'Tagihan Rutin', date: '2024-05-05' },
    { id: '3', title: 'Makan Siang', amount: 50000, type: 'expense', category: 'Makanan & Minuman', date: '2024-05-10' },
    { id: '4', title: 'Belanja Bulanan', amount: 1200000, type: 'expense', category: 'Belanja', date: '2024-05-12' },
  ]);

  const [reminders] = useState<BillReminder[]>([
    { id: '1', title: 'Internet Indihome', amount: 450000, dueDate: '2024-05-20', status: 'pending' },
    { id: '2', title: 'Listrik PLN', amount: 800000, dueDate: '2024-05-15', status: 'pending' },
    { id: '3', title: 'Netflix Premium', amount: 186000, dueDate: '2024-05-22', status: 'pending' },
  ]);

  const [activeCategory, setActiveCategory] = useState('Semua');
  const [isRecording, setIsRecording] = useState(false);
  const [voiceLog, setVoiceLog] = useState('');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'tx' | 'report' | 'settings'>('home');

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

  const processVoiceCommand = (text: string) => {
    setVoiceLog(`Diproses: "${text}"`);
    
    const numberMatch = text.match(/\d+/);
    if (numberMatch) {
      const amount = parseInt(numberMatch[0]);
      const title = text.replace(numberMatch[0], '').trim();
      const type = text.toLowerCase().includes('bayar') || text.toLowerCase().includes('beli') || text.toLowerCase().includes('makan') ? 'expense' : 'income';
      
      const newTransaction: Transaction = {
        id: Math.random().toString(36).substr(2, 9),
        title: title || 'Transaksi Baru',
        amount,
        type,
        category: 'Lainnya',
        date: format(new Date(), 'yyyy-MM-dd')
      };
      
      setTransactions([newTransaction, ...transactions]);
    }
  };

  const updateNotes = (id: string, notes: string) => {
    setTransactions(transactions.map(t => t.id === id ? { ...t, notes } : t));
    if (selectedTx?.id === id) {
      setSelectedTx({ ...selectedTx, notes });
    }
  };

  const deleteTx = (id: string) => {
    setTransactions(transactions.filter(t => t.id !== id));
    setSelectedTx(null);
  };

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
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs border-2 border-white shadow-sm">
            PA
          </div>
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
                    <textarea 
                      value={selectedTx.notes || ''}
                      onChange={(e) => updateNotes(selectedTx.id, e.target.value)}
                      placeholder="Tambahkan catatan di sini..."
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium text-slate-700 min-h-[100px] focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                </div>

                <div className="flex gap-4">
                  <button onClick={() => setSelectedTx(null)} className="flex-1 bg-blue-600 text-white rounded-2xl py-4 font-bold text-sm shadow-lg shadow-blue-500/20 active:scale-95 transition-all">
                    Selesai
                  </button>
                  <button 
                    onClick={() => deleteTx(selectedTx.id)}
                    className="w-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center active:scale-95 transition-all"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating Action Button for Voice */}
      <button 
        onClick={startVoiceInput}
        className={`fixed bottom-24 right-6 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl z-40 transition-all active:scale-90 ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-blue-600 shadow-blue-500/30'}`}
      >
        <Mic className="w-6 h-6 text-white" />
      </button>

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

