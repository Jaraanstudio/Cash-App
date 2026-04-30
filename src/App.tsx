/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { 
  LayoutDashboard, 
  Receipt, 
  PieChart as LucidePieChart, 
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
  BarChart as ReBarChart, 
  Bar, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  XAxis,
  YAxis
} from 'recharts';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO, startOfDay, endOfDay, eachDayOfInterval, subDays, startOfWeek } from 'date-fns';
import { id } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  receiptUrl?: string;
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
  dueDay: number;
  status: 'pending' | 'paid' | 'overdue';
  lastPaidMonth?: string; // e.g. "2024-05"
}

const DEFAULT_CATEGORIES = [
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
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [activeCategory, setActiveCategory] = useState('Semua');
  const [isRecording, setIsRecording] = useState(false);
  const [voiceLog, setVoiceLog] = useState('');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'tx' | 'report' | 'settings'>('home');
  const [activeType, setActiveType] = useState<'all' | 'income' | 'expense'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  
  const [reportFilter, setReportFilter] = useState<'week' | 'month' | 'custom'>('month');
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [googleConfig, setGoogleConfig] = useState<{ googleClientId: string } | null>(null);
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [newTx, setNewTx] = useState({
    title: '',
    amount: '',
    type: 'expense' as 'expense' | 'income',
    category: ''
  });
  
  const tokenClientRef = useRef<any>(null);

  const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file email profile openid';

  // Memoized Calculations
  const filteredTransactions = useMemo(() => {
    let list = transactions;
    if (activeCategory !== 'Semua') {
      list = list.filter(t => t.category === activeCategory);
    }
    if (activeType !== 'all') {
      list = list.filter(t => t.type === activeType);
    }
    return list;
  }, [transactions, activeCategory, activeType]);

  const reportTransactions = useMemo(() => {
    let start = startOfMonth(new Date());
    let end = endOfMonth(new Date());

    if (reportFilter === 'week') {
      start = startOfWeek(new Date(), { weekStartsOn: 1 });
      end = endOfDay(new Date());
    } else if (reportFilter === 'custom') {
      start = startOfDay(parseISO(customStart));
      end = endOfDay(parseISO(customEnd));
    }

    return transactions.filter(t => {
      try {
        const date = parseISO(t.date);
        return isWithinInterval(date, { start, end });
      } catch {
        return false;
      }
    });
  }, [transactions, reportFilter, customStart, customEnd]);

  const reportStats = useMemo(() => {
    const income = reportTransactions
      .filter(t => t.type === 'income')
      .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    const expense = reportTransactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    return { income, expense, balance: income - expense };
  }, [reportTransactions]);

  const totalBalance = useMemo(() => {
    return transactions.reduce((acc, t) => {
      const amount = Number(t.amount) || 0;
      return t.type === 'income' ? acc + amount : acc - amount;
    }, 0);
  }, [transactions]);

  const monthlyIncome = useMemo(() => {
    try {
      const start = startOfMonth(new Date());
      const end = endOfMonth(new Date());
      return transactions
        .filter(t => {
          if (t.type !== 'income') return false;
          try {
            const date = parseISO(t.date);
            return isWithinInterval(date, { start, end });
          } catch {
            return false;
          }
        })
        .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    } catch (err) {
      return 0;
    }
  }, [transactions]);

  const monthlyExpense = useMemo(() => {
    try {
      const start = startOfMonth(new Date());
      const end = endOfMonth(new Date());
      return transactions
        .filter(t => {
          if (t.type !== 'expense') return false;
          try {
            const date = parseISO(t.date);
            return isWithinInterval(date, { start, end });
          } catch {
            return false;
          }
        })
        .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    } catch (err) {
      return 0;
    }
  }, [transactions]);

  const chartData = useMemo(() => {
    const last7Days = eachDayOfInterval({
      start: subDays(new Date(), 6),
      end: new Date()
    });

    return last7Days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayExpense = transactions
        .filter(t => t.date === dateStr && t.type === 'expense')
        .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
      
      return {
        name: format(day, 'EEE', { locale: id }),
        value: dayExpense,
        fullDate: dateStr
      };
    });
  }, [transactions]);

  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {};
    const monthlyExps = transactions.filter(t => {
      if (t.type !== 'expense') return false;
      const start = startOfMonth(new Date());
      const end = endOfMonth(new Date());
      try {
        return isWithinInterval(parseISO(t.date), { start, end });
      } catch { return false; }
    });

    monthlyExps.forEach(t => {
      stats[t.category] = (stats[t.category] || 0) + (Number(t.amount) || 0);
    });

    const COLORS = ['#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#059669', '#4B5563', '#B45309'];
    
    return Object.entries(stats)
      .map(([name, value], i) => ({
        name,
        value,
        color: COLORS[i % COLORS.length]
      }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  const formatCurrency = useCallback((val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
  }, []);

  // Notifications Logic
  const activeReminders = useMemo(() => {
    const currentMonth = format(new Date(), 'yyyy-MM');
    const dayOfMonth = new Date().getDate();

    return reminders.map(rem => {
      const isPaidThisMonth = rem.lastPaidMonth === currentMonth;
      const status: 'pending' | 'paid' | 'overdue' = isPaidThisMonth 
        ? 'paid' 
        : (dayOfMonth > rem.dueDay ? 'overdue' : 'pending');
      
      return { ...rem, status };
    });
  }, [reminders]);

  const notifications = useMemo(() => {
    const dayOfMonth = new Date().getDate();
    return activeReminders.filter(rem => {
      // Show if today is >= rem.dueDay (e.g. 10) and not paid yet, OR if it's due soon (within 3 days)
      return rem.status !== 'paid' && (dayOfMonth >= rem.dueDay || rem.dueDay - dayOfMonth <= 3);
    });
  }, [activeReminders]);

  // Effects
  useEffect(() => {
    if (categories.length > 0 && !newTx.category) {
      setNewTx(prev => ({ ...prev, category: categories[0] }));
    }
  }, [categories]);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const h = await fetch('/api/health');
        const data = await h.json();
        console.log("Server Health:", data);
      } catch (e) {
        console.error("Health check failed:", e);
      }
    };
    checkHealth();

    const fetchConfig = async (retries = 3) => {
      try {
        setIsConfigLoading(true);
        const resp = await fetch('/api/config');
        if (resp.ok) {
          const data = await resp.json();
          if (!data.googleClientId) {
            setConfigError("Client ID tidak ditemukan di Secrets.");
          } else {
            setConfigError(null);
          }
          setGoogleConfig(data);
          setIsConfigLoading(false);
        } else if (retries > 0) {
          console.warn(`Config fetch failed with status ${resp.status}, retrying... (${retries} left)`);
          setTimeout(() => fetchConfig(retries - 1), 1500);
        } else {
          setConfigError(`Koneksi Server Gagal (Status: ${resp.status}). Silakan Refresh.`);
          setIsConfigLoading(false);
        }
      } catch (err) {
        if (retries > 0) {
          console.warn(`Config fetch error, retrying... (${retries} left)`, err);
          setTimeout(() => fetchConfig(retries - 1), 1500);
        } else {
          console.error('Final config fetch error:', err);
          setConfigError("Server tidak merespon. Periksa koneksi internet Anda.");
          setIsConfigLoading(false);
        }
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    const initGis = () => {
      if (!(window as any).google || !googleConfig?.googleClientId) return;
      tokenClientRef.current = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: googleConfig.googleClientId,
        scope: SCOPES,
        callback: async (resp: any) => {
          if (resp.error) {
            setError('Gagal mendapatkan izin akses.');
            return;
          }
          setAccessToken(resp.access_token);
          localStorage.setItem('google_access_token', resp.access_token);
          await handleUserInfo(resp.access_token);
        },
      });
      
      const savedToken = localStorage.getItem('google_access_token');
      const savedUser = localStorage.getItem('google_user_info');
      if (savedToken && savedUser) {
        setAccessToken(savedToken);
        setUser(JSON.parse(savedUser));
        handleUserInfo(savedToken);
      }
    };

    if ((window as any).google && googleConfig?.googleClientId) {
      initGis();
    } else if (googleConfig?.googleClientId) {
      const script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (script) {
        script.addEventListener('load', initGis);
      }
    }
  }, [googleConfig, SCOPES]);

  // Logic Functions
  const handleUserInfo = async (token: string) => {
    try {
      const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resp.status === 401) {
        // Token expired
        handleLogout();
        return;
      }
      const data = await resp.json();
      const userInfo = {
        email: data.email,
        name: data.name,
        picture: data.picture
      };
      setUser(userInfo);
      localStorage.setItem('google_user_info', JSON.stringify(userInfo));
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
      
      const [txs, cats, rems] = await Promise.all([
        sheetService.fetchTransactionsFromSheet(token, sheet.id),
        sheetService.fetchCategoriesFromSheet(token, sheet.id),
        sheetService.fetchRemindersFromSheet(token, sheet.id)
      ]);
      
      setTransactions(txs.reverse());
      if (cats && cats.length > 0) {
        setCategories(cats);
      }
      if (rems && rems.length > 0) {
        setReminders(rems);
      }
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
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_user_info');
  };

  const handleAddCategory = async () => {
    if (!newCategoryName || !accessToken || !spreadsheetId) return;
    const updated = [...categories, newCategoryName];
    setCategories(updated);
    setIsSyncing(true);
    try {
      await sheetService.updateCategoriesInSheet(accessToken, spreadsheetId, updated);
      setNewCategoryName('');
      setShowCategoryModal(false);
    } catch (err) {
      setError('Gagal menyimpan kategori baru.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteCategory = async (cat: string) => {
    if (!accessToken || !spreadsheetId) return;
    const updated = categories.filter(c => c !== cat);
    setCategories(updated);
    setIsSyncing(true);
    try {
      await sheetService.updateCategoriesInSheet(accessToken, spreadsheetId, updated);
    } catch (err) {
      setError('Gagal menghapus kategori.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Manual Input Logic
  const handleAddTransaction = async () => {
    if (!newTx.title || !newTx.amount || !accessToken || !spreadsheetId) return;
    
    const amountVal = parseInt(newTx.amount.replace(/\D/g, ''));
    if (isNaN(amountVal)) return;

    setIsSyncing(true);
    try {
      let receiptUrl = '';
      if (selectedFile) {
        receiptUrl = await sheetService.uploadFileToDrive(accessToken, selectedFile);
      }

      const tx: sheetService.GoogleTransaction = {
        id: Math.random().toString(36).substr(2, 9),
        title: newTx.title,
        amount: amountVal,
        type: newTx.type,
        category: newTx.category,
        date: format(new Date(), 'yyyy-MM-dd'),
        receiptUrl
      };

      await sheetService.appendTransaction(accessToken, spreadsheetId, tx);
      setTransactions([tx, ...transactions]);

      // Handle Automatic Reminder Creation if category is "Tagihan Rutin"
      if (tx.category === 'Tagihan Rutin') {
        const existingRem = reminders.find(r => r.title.toLowerCase() === tx.title.toLowerCase());
        if (!existingRem) {
          const newRem: BillReminder = {
            id: Math.random().toString(36).substr(2, 9),
            title: tx.title,
            amount: tx.amount,
            dueDay: 10, // Default to 10 as requested
            status: 'paid',
            lastPaidMonth: format(new Date(), 'yyyy-MM')
          };
          await sheetService.addOrUpdateReminderInSheet(accessToken, spreadsheetId, newRem);
          setReminders([...reminders, newRem]);
        }
      }

      setShowAddModal(false);
      setSelectedFile(null);
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
    
    const transcript = text.toLowerCase();
    
    // Indonesian word numbers and multipliers
    const multipliers: Record<string, number> = {
      'triliun': 1000000000000,
      'miliar': 1000000000,
      'juta': 1000000,
      'ribu': 1000,
    };

    const indonesianNumbers: Record<string, number> = {
      'sepuluh': 10, 'sebelas': 11, 'dua belas': 12, 'tiga belas': 13,
      'dua puluh': 20, 'tiga puluh': 30, 'empat puluh': 40, 'lima puluh': 50,
      'seratus': 100, 'dua ratus': 200, 'tiga ratus': 300, 'lima ratus': 500,
      'ribu': 1000, 'seribu': 1000, 'sejuta': 1000000,
      'satu': 1, 'dua': 2, 'tiga': 3, 'empat': 4, 'lima': 5,
      'enam': 6, 'tujuh': 7, 'delapan': 8, 'sembilan': 9
    };

    let amount = 0;
    let foundAmount = false;

    // 1. Check for digits (handle formats like "10.000", "15,000", or "10 ribu")
    const cleanTranscript = transcript.replace(/\./g, '');
    const digitsMatch = cleanTranscript.match(/(\d+)/);
    
    if (digitsMatch) {
      amount = parseInt(digitsMatch[0]);
      foundAmount = true;
      
      // Check for multipliers after digits
      for (const [m, factor] of Object.entries(multipliers)) {
        if (cleanTranscript.includes(m)) {
          if (amount < factor) amount *= factor;
          break;
        }
      }
    } else {
      // 2. Check for word-based numbers
      const sortedWords = Object.keys(indonesianNumbers).sort((a, b) => b.length - a.length);
      for (const word of sortedWords) {
        if (transcript.includes(word)) {
          amount = indonesianNumbers[word];
          foundAmount = true;
          // Check for additional multipliers (e.g. "sepuluh ribu")
          for (const [m, factor] of Object.entries(multipliers)) {
            if (transcript.includes(m) && !word.includes(m)) {
              amount *= factor;
              break;
            }
          }
          break;
        }
      }
    }

    if (foundAmount && accessToken && spreadsheetId) {
      const type = transcript.includes('bayar') || 
                   transcript.includes('beli') || 
                   transcript.includes('makan') || 
                   transcript.includes('keluar') ||
                   transcript.includes('pengeluaran') ? 'expense' : 'income';
      
      // Clean up title
      let title = text;
      if (digitsMatch) title = title.replace(digitsMatch[0], '');
      
      const wordsToRemove = [
        ...Object.keys(multipliers), 
        ...Object.keys(indonesianNumbers), 
        'rupiah', 'rp', 'bayar', 'beli', 'makan', 'pemasukan', 'pengeluaran', 'nominal'
      ];
      
      wordsToRemove.forEach(w => {
        const reg = new RegExp(`\\b${w}\\b`, 'gi');
        title = title.replace(reg, '');
      });

      title = title.replace(/\s+/g, ' ').trim();
      if (!title || title.length < 2) title = type === 'expense' ? 'Pengeluaran Suara' : 'Pemasukan Suara';

      const tx: sheetService.GoogleTransaction = {
        id: Math.random().toString(36).substr(2, 9),
        title: title,
        amount,
        type,
        category: 'Lainnya',
        date: format(new Date(), 'yyyy-MM-dd')
      };
      
      setIsSyncing(true);
      try {
        await sheetService.appendTransaction(accessToken, spreadsheetId, tx);
        setTransactions([tx, ...transactions]);
        setVoiceLog(`Berhasil: ${title} (${formatCurrency(amount)})`);
      } catch (err) {
        setError('Gagal menyimpan transaksi suara.');
      } finally {
        setIsSyncing(false);
      }
    } else {
      setVoiceLog(`Gagal mengenali nominal: "${text}"`);
    }
  };

  const deleteTx = async (id: string) => {
    if (!accessToken || !spreadsheetId) return;
    if (!window.confirm('Apakah Anda yakin ingin menghapus transaksi ini?')) return;
    
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

  const handleUpdateTransaction = async () => {
    if (!editTx || !accessToken || !spreadsheetId) return;
    
    setIsSyncing(true);
    try {
      let receiptUrl = editTx.receiptUrl || '';
      if (selectedFile) {
        receiptUrl = await sheetService.uploadFileToDrive(accessToken, selectedFile);
      }

      const updatedTx: Transaction = {
        ...editTx,
        receiptUrl
      };

      await sheetService.updateTransactionInSheet(accessToken, spreadsheetId, updatedTx);
      
      setTransactions(transactions.map(t => t.id === updatedTx.id ? updatedTx : t));
      setEditTx(null);
      setSelectedTx(null);
      setSelectedFile(null);
    } catch (err) {
      setError('Gagal memperbarui transaksi.');
    } finally {
      setIsSyncing(false);
    }
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const currentMonth = format(new Date(), 'MMMM yyyy', { locale: id });
    
    doc.setFontSize(18);
    doc.text('Laporan Keuangan', 14, 20);
    doc.setFontSize(11);
    doc.text(`Periode: ${reportFilter === 'week' ? 'Minggu Ini' : reportFilter === 'month' ? currentMonth : `${customStart} s/d ${customEnd}`}`, 14, 30);
    doc.text(`Nama: ${user?.name || '-'}`, 14, 35);
    
    doc.text(`Total Pemasukan: ${formatCurrency(reportStats.income)}`, 14, 45);
    doc.text(`Total Pengeluaran: ${formatCurrency(reportStats.expense)}`, 14, 50);
    doc.text(`Saldo: ${formatCurrency(reportStats.balance)}`, 14, 55);

    const tableData = reportTransactions.map(t => [
      t.date,
      t.title,
      t.category,
      t.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
      formatCurrency(t.amount)
    ]);

    autoTable(doc, {
      startY: 65,
      head: [['Tanggal', 'Judul', 'Kategori', 'Tipe', 'Jumlah']],
      body: tableData,
    });

    doc.save(`Laporan_Keuangan_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  // Calculations
  // MOVED UP TO ENSURE HOOK ORDER CONSISTENCY

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

          {isConfigLoading ? (
            <div className="flex flex-col items-center gap-3 p-4 mb-4">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest italic">Menyiapkan Google Login...</p>
            </div>
          ) : configError ? (
            <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 mb-6 text-left">
              <p className="text-[10px] text-orange-700 font-bold uppercase tracking-widest leading-relaxed">{configError}</p>
            </div>
          ) : (
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
          )}
          
          <div className="text-[9px] text-slate-300 font-bold uppercase tracking-widest">
            Tanpa database terpusat • Data milik Anda
          </div>
        </motion.div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="mb-4"
        >
          <Loader2 className="w-10 h-10 text-blue-600" />
        </motion.div>
        <h3 className="text-lg font-bold text-slate-900 mb-1">Menyiapkan Spreadsheet...</h3>
        <p className="text-sm text-slate-400">Silakan tunggu sebentar sambil kami memuat data Anda.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex justify-center font-sans sm:py-10">
      <div className="w-full max-w-[480px] h-[100dvh] sm:h-[844px] flex flex-col bg-[#F8FAFC] overflow-hidden relative sm:rounded-[48px] shadow-2xl border-4 border-slate-300">
        {/* Header Mobile Style */}
        <header className="px-6 py-6 pb-2 bg-white flex justify-between items-center z-10 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900 leading-tight">Cash App</h1>
          <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Personal Finance by Mas Pur</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            {notifications.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
            )}
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
            {/* Notifications Alert */}
            {notifications.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-orange-50 border border-orange-100 p-4 rounded-[24px] flex items-center gap-4"
              >
                <div className="w-10 h-10 bg-orange-500 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20">
                  <Bell className="text-white w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-orange-900">Tagihan Rutin Menanti!</div>
                  <div className="text-[10px] text-orange-700 font-medium">Ada {notifications.length} tagihan yang harus dibayar bulan ini.</div>
                </div>
                <TrendingUp size={16} className="text-orange-400 rotate-90" />
              </motion.div>
            )}

            {/* Balance Card */}
            <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-6 text-white shadow-xl shadow-blue-500/20">
              <div className="relative z-10">
                <span className="text-[10px] text-blue-100 uppercase font-bold tracking-widest opacity-80">Saldo Tersedia</span>
                <div className="text-3xl font-bold tracking-tight mt-1 mb-6">{formatCurrency(totalBalance)}</div>
                <div className="flex gap-4">
                  <button 
                    onClick={() => {
                      setActiveTab('tx');
                      setActiveType('income');
                      setActiveCategory('Semua');
                    }}
                    className="flex-1 bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10 transition-transform active:scale-95"
                  >
                    <TrendingUp className="w-4 h-4 text-green-400 mb-1" />
                    <div className="text-[9px] text-blue-100 uppercase font-bold">Pemasukan</div>
                    <div className="text-sm font-bold">{formatCurrency(monthlyIncome)}</div>
                  </button>
                  <button 
                    onClick={() => {
                      setActiveTab('tx');
                      setActiveType('expense');
                      setActiveCategory('Semua');
                    }}
                    className="flex-1 bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10 transition-transform active:scale-95"
                  >
                    <TrendingDown className="w-4 h-4 text-red-400 mb-1" />
                    <div className="text-[9px] text-blue-100 uppercase font-bold">Pengeluaran</div>
                    <div className="text-sm font-bold">{formatCurrency(monthlyExpense)}</div>
                  </button>
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
                  <ReBarChart data={chartData}>
                    <Tooltip cursor={{ fill: '#F1F5F9' }} content={() => null} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {chartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={index === 3 ? '#2563EB' : '#DBEAFE'} />
                      ))}
                    </Bar>
                  </ReBarChart>
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
                {activeReminders.map(reminder => (
                  <div key={reminder.id} className={`min-w-[160px] bg-white rounded-2xl p-4 shadow-sm border shrink-0 ${reminder.status === 'overdue' ? 'border-red-100 bg-red-50/10' : 'border-slate-100'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-3 ${reminder.status === 'paid' ? 'bg-green-100' : 'bg-orange-100'}`}>
                      <Calendar className={`w-4 h-4 ${reminder.status === 'paid' ? 'text-green-600' : 'text-orange-500'}`} />
                    </div>
                    <div className="text-xs font-bold text-slate-800 mb-1 line-clamp-1">{reminder.title}</div>
                    <div className={`text-[10px] font-bold mb-2 ${reminder.status === 'overdue' ? 'text-red-500' : 'text-slate-400'}`}>
                      {reminder.status === 'paid' ? 'Sudah Dibayar' : `Tiap Tanggal ${reminder.dueDay}`}
                    </div>
                    <div className="text-xs font-bold text-blue-600">{formatCurrency(reminder.amount)}</div>
                  </div>
                ))}
                {activeReminders.length === 0 && (
                  <div className="text-[10px] text-slate-300 font-bold uppercase tracking-widest py-8 text-center w-full">Belum ada tagihan rutin</div>
                )}
              </div>
            </div>

            {/* Transaction List Summary */}
            <div className="space-y-4 pb-32">
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

            <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide -mx-1 px-1">
              <button 
                onClick={() => setActiveType('all')}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${activeType === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-100'}`}
              >
                Semua Tipe
              </button>
              <button 
                onClick={() => setActiveType('income')}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${activeType === 'income' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-400 border-slate-100'}`}
              >
                Pemasukan
              </button>
              <button 
                onClick={() => setActiveType('expense')}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${activeType === 'expense' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-slate-400 border-slate-100'}`}
              >
                Pengeluaran
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide -mx-2 px-2">
              {['Semua', ...categories].map(cat => (
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

        {activeTab === 'report' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 pb-32">
            <header className="flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-900">Statistik</h2>
                <button 
                  onClick={generatePDF}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-blue-600/20 active:scale-95 transition-all"
                >
                  <FileText size={16} />
                  Download PDF
                </button>
              </div>

              {/* Filters */}
              <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl">
                {(['week', 'month', 'custom'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setReportFilter(f)}
                    className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all ${reportFilter === f ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                  >
                    {f === 'week' ? 'Minggu' : f === 'month' ? 'Bulan' : 'Custom'}
                  </button>
                ))}
              </div>

              {reportFilter === 'custom' && (
                <div className="flex gap-4 items-center">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Mulai</label>
                    <input 
                      type="date" 
                      value={customStart} 
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="w-full bg-white border border-slate-100 rounded-xl px-4 py-2 text-sm font-medium"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Selesai</label>
                    <input 
                      type="date" 
                      value={customEnd} 
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="w-full bg-white border border-slate-100 rounded-xl px-4 py-2 text-sm font-medium"
                    />
                  </div>
                </div>
              )}
            </header>

            {/* Income vs Expense Ring */}
            <div className="grid grid-cols-1 gap-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-[24px] border border-slate-100 shadow-sm">
                    <div className="w-8 h-8 bg-green-50 rounded-xl flex items-center justify-center mb-3">
                      <TrendingUp size={16} className="text-green-600" />
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Masuk</div>
                    <div className="text-sm font-bold text-slate-900">{formatCurrency(reportStats.income)}</div>
                  </div>
                  <div className="bg-white p-4 rounded-[24px] border border-slate-100 shadow-sm">
                    <div className="w-8 h-8 bg-red-50 rounded-xl flex items-center justify-center mb-3">
                      <TrendingDown size={16} className="text-red-600" />
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Keluar</div>
                    <div className="text-sm font-bold text-slate-900">{formatCurrency(reportStats.expense)}</div>
                  </div>
                </div>
               <div className="card text-center p-8">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">Distribusi Pengeluaran</h3>
              <div className="h-[240px] w-full flex items-center justify-center relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryStats}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {categoryStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: any) => formatCurrency(value)}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Total</div>
                  <div className="text-lg font-bold text-slate-900">{formatCurrency(monthlyExpense)}</div>
                </div>
              </div>
               </div>

               <div className="space-y-3">
                  {categoryStats.map(stat => (
                    <div key={stat.name} className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-50">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stat.color }}></div>
                      <div className="flex-1 text-sm font-bold text-slate-700">{stat.name}</div>
                      <div className="text-sm font-bold text-slate-900">{formatCurrency(stat.value)}</div>
                      <div className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded">
                        {Math.round((stat.value / (monthlyExpense || 1)) * 100)}%
                      </div>
                    </div>
                  ))}
               </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'settings' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
             <header>
                <h2 className="text-xl font-bold text-slate-900">Pengaturan</h2>
             </header>

             <div className="space-y-6">
                <div className="card">
                   <div className="flex items-center gap-4 mb-6">
                      <img src={user?.picture} className="w-12 h-12 rounded-2xl" alt="" />
                      <div>
                         <div className="text-sm font-bold text-slate-900">{user?.name}</div>
                         <div className="text-xs text-slate-400">{user?.email}</div>
                      </div>
                   </div>
                   <button 
                    onClick={handleLogout}
                    className="w-full py-3 rounded-xl border border-red-100 text-red-500 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2"
                   >
                     <LogOut size={14} /> Keluar Akun
                   </button>
                </div>

                <div className="card">
                   <div className="flex justify-between items-center mb-6">
                      <h3 className="text-sm font-bold text-slate-900">Kategori Transaksi</h3>
                      <button 
                        onClick={() => setShowCategoryModal(true)}
                        className="p-1.5 bg-blue-50 text-blue-600 rounded-lg"
                      >
                        <Plus size={16} />
                      </button>
                   </div>
                   <div className="space-y-2">
                      {categories.map(cat => (
                        <div key={cat} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                           <span className="text-xs font-bold text-slate-600">{cat}</span>
                           <button 
                            onClick={() => handleDeleteCategory(cat)}
                            className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                           >
                              <Trash2 size={14} />
                           </button>
                        </div>
                      ))}
                   </div>
                </div>
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
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50"
            />
            <motion.div 
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute inset-x-0 bottom-0 bg-white rounded-t-[40px] z-50 p-8 shadow-2xl max-h-[85%] overflow-y-auto"
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

                {selectedTx.receiptUrl && (
                  <div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                      <FileSpreadsheet size={14} /> Nota / Bukti
                    </label>
                    <a 
                      href={selectedTx.receiptUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm active:scale-95 transition-transform"
                    >
                      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                        <FileText size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-bold text-slate-800">Lihat Nota</div>
                        <div className="text-[10px] text-slate-400 font-medium tracking-tight">Klik untuk membuka di tab baru</div>
                      </div>
                    </a>
                  </div>
                )}

                <div className="flex gap-4">
                  <button 
                    onClick={() => setEditTx(selectedTx)} 
                    className="flex-1 bg-slate-100 text-slate-900 rounded-2xl py-4 font-bold text-sm active:scale-95 transition-all"
                  >
                    Edit
                  </button>
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
      <div className="absolute bottom-24 right-6 flex flex-col gap-3 z-40">
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

      {/* Edit Transaction Modal */}
      <AnimatePresence>
        {editTx && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setEditTx(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md z-[60] px-6 py-12"
            />
            <motion.div 
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              className="absolute inset-x-0 bottom-0 bg-white rounded-t-[40px] z-[70] p-8 shadow-2xl max-h-[90%] overflow-y-auto"
            >
              <div className="w-12 h-1.5 bg-slate-100 rounded-full mx-auto mb-8"></div>
              
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-bold text-slate-900">Edit Transaksi</h3>
                <button onClick={() => setEditTx(null)} className="p-2 bg-slate-50 rounded-xl text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                  <button 
                    onClick={() => setEditTx({ ...editTx, type: 'expense' })}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${editTx.type === 'expense' ? 'bg-white shadow-sm text-red-500' : 'text-slate-400'}`}
                  >
                    Pengeluaran
                  </button>
                  <button 
                    onClick={() => setEditTx({ ...editTx, type: 'income' })}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${editTx.type === 'income' ? 'bg-white shadow-sm text-green-600' : 'text-slate-400'}`}
                  >
                    Pemasukan
                  </button>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 px-1">Deskripsi</label>
                  <input 
                    type="text" 
                    value={editTx.title}
                    onChange={(e) => setEditTx({ ...editTx, title: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 px-1">Jumlah (Rp)</label>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    value={editTx.amount.toLocaleString('id-ID')}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setEditTx({ ...editTx, amount: val ? parseInt(val) : 0 });
                    }}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 px-1">Kategori</label>
                  <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide -mx-1 px-1">
                    {categories.map(cat => (
                      <button 
                        key={cat}
                        onClick={() => setEditTx({ ...editTx, category: cat })}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${editTx.category === cat ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 px-1">Catatan</label>
                  <textarea 
                    value={editTx.notes || ''}
                    onChange={(e) => setEditTx({ ...editTx, notes: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all min-h-[100px]"
                    placeholder="Tambahkan catatan..."
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 px-1">Nota / Bukti (Opsional)</label>
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="hidden" 
                    id="edit-receipt-upload"
                  />
                  <label 
                    htmlFor="edit-receipt-upload"
                    className={`w-full flex items-center gap-3 p-4 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${selectedFile || editTx.receiptUrl ? 'border-blue-600 bg-blue-50/50' : 'border-slate-100 bg-slate-50'}`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedFile || editTx.receiptUrl ? 'bg-blue-600 text-white' : 'bg-white text-slate-400 shadow-sm'}`}>
                      {(selectedFile || editTx.receiptUrl) ? <FileText size={18} /> : <Plus size={18} />}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className={`text-[10px] font-bold uppercase tracking-widest ${selectedFile || editTx.receiptUrl ? 'text-blue-600' : 'text-slate-400'}`}>
                        {selectedFile ? selectedFile.name : editTx.receiptUrl ? 'Sudah ada nota' : 'Tambahkan Nota'}
                      </div>
                      <div className="text-[9px] text-slate-400 font-medium truncate">
                        {selectedFile ? 'File baru siap diupload' : editTx.receiptUrl ? 'Klik untuk ganti nota' : 'Format gambar (JPG, PNG)'}
                      </div>
                    </div>
                  </label>
                </div>

                <button 
                  onClick={handleUpdateTransaction}
                  disabled={!editTx.title || !editTx.amount || isSyncing}
                  className="w-full bg-blue-600 text-white rounded-2xl py-4 font-bold text-sm shadow-xl shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2"
                >
                  {isSyncing && <Loader2 size={18} className="animate-spin" />}
                  {isSyncing ? 'Memperbarui...' : 'Simpan Perubahan'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Manual Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md z-50 px-6 py-12"
            />
            <motion.div 
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              className="absolute inset-x-0 bottom-0 bg-white rounded-t-[40px] z-50 p-8 shadow-2xl max-h-[90%] overflow-y-auto"
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
                    {categories.map(cat => (
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

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 px-1">Nota / Bukti (Opsional)</label>
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="hidden" 
                    id="receipt-upload-manual"
                  />
                  <label 
                    htmlFor="receipt-upload-manual"
                    className={`w-full flex items-center gap-3 p-4 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${selectedFile ? 'border-blue-600 bg-blue-50/50' : 'border-slate-100 bg-slate-50'}`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedFile ? 'bg-blue-600 text-white' : 'bg-white text-slate-400 shadow-sm'}`}>
                      {selectedFile ? <FileText size={18} /> : <Plus size={18} />}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className={`text-[10px] font-bold uppercase tracking-widest ${selectedFile ? 'text-blue-600' : 'text-slate-400'}`}>
                        {selectedFile ? selectedFile.name : 'Tambahkan Nota'}
                      </div>
                      <div className="text-[9px] text-slate-400 font-medium truncate">
                        {selectedFile ? 'File siap diupload' : 'Format gambar (JPG, PNG)'}
                      </div>
                    </div>
                    {selectedFile && (
                      <button 
                        onClick={(e) => { e.preventDefault(); setSelectedFile(null); }}
                        className="p-1 bg-red-50 text-red-500 rounded-lg"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </label>
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
      <nav className="absolute bottom-0 inset-x-0 bg-white border-t border-slate-100 flex items-center justify-around py-4 pb-8 z-30">
        <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-blue-600' : 'text-slate-400'}`}>
          <LayoutDashboard size={22} className={activeTab === 'home' ? 'fill-blue-600/10' : ''} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Home</span>
        </button>
        <button onClick={() => setActiveTab('tx')} className={`flex flex-col items-center gap-1 ${activeTab === 'tx' ? 'text-blue-600' : 'text-slate-400'}`}>
          <Receipt size={22} className={activeTab === 'tx' ? 'fill-blue-600/10' : ''} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">List</span>
        </button>
        <button onClick={() => setActiveTab('report')} className={`flex flex-col items-center gap-1 ${activeTab === 'report' ? 'text-blue-600' : 'text-slate-400'}`}>
          <LucidePieChart size={22} className={activeTab === 'report' ? 'fill-blue-600/10' : ''} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Stats</span>
        </button>
        <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 ${activeTab === 'settings' ? 'text-blue-600' : 'text-slate-400'}`}>
          <Settings size={22} className={activeTab === 'settings' ? 'fill-blue-600/10' : ''} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Menu</span>
        </button>
      </nav>

      {/* Add Category Modal */}
      <AnimatePresence>
        {showCategoryModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowCategoryModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-3xl p-8 shadow-2xl z-[70] w-[85%] max-w-sm"
            >
              <h3 className="text-lg font-bold text-slate-900 mb-6">Tambah Kategori</h3>
              <input 
                type="text" 
                placeholder="Nama kategori"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 mb-6"
                autoFocus
              />
              <div className="flex gap-4">
                 <button onClick={() => setShowCategoryModal(false)} className="flex-1 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Batal</button>
                 <button 
                  onClick={handleAddCategory}
                  disabled={!newCategoryName || isSyncing}
                  className="flex-1 bg-blue-600 text-white rounded-2xl py-3 text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                 >
                   Simpan
                 </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
    </div>
  );
}

