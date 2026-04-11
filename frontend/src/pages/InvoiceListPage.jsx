import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  IconButton,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  MenuItem,
  Tooltip,
  CircularProgress,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Stack,
  Grid2,
  InputAdornment,
  Checkbox,
  LinearProgress,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Send as SendIcon,
  Paid as PaidIcon,
  Cancel as CancelIcon,
  ContentCopy as DuplicateIcon,
  Receipt as PvmSfIcon,
  Download as DownloadIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  FileDownload as ExportIcon,
  Pause as PauseIcon,
  PlayArrow as PlayArrowIcon,
  CalendarMonth as CalendarMonthIcon,
  CheckCircle,
  WarningAmber,
} from '@mui/icons-material';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CloseIcon from '@mui/icons-material/Close';
import { Popover } from '@mui/material';
import LoopIcon from '@mui/icons-material/Loop';
import DrawIcon from '@mui/icons-material/Draw';
import DoNotDisturbIcon from '@mui/icons-material/DoNotDisturb';
import { HiDocumentCheck } from 'react-icons/hi2';
import { IoIosTimer } from 'react-icons/io';
import { MdOutlinePaid } from 'react-icons/md';
import { useNavigate } from 'react-router-dom';
import { invoicingApi } from '../api/invoicingApi';
import { api } from '../api/endpoints';
import { ACCOUNTING_PROGRAMS } from '../page_elements/AccountingPrograms';
import DateField from '../components/DateField';
import { InvoicePreviewDialog, useInvoicePdf } from '../components/InvoicePreview';
import MarkPaidDialog from '../components/MarkPaidDialog';
import PaymentProofDialog from '../components/PaymentProofDialog';
import { useInvSubscription } from '../contexts/InvSubscriptionContext';
import LockIcon from '@mui/icons-material/Lock';
import SettingsIcon from '@mui/icons-material/Settings';
import { getInvSubscription } from '../api/endpoints';
import ExportStatusBar from '../components/ExportStatusBar';
import { ExportLogPopup } from '../page_elements/DocumentsTable';


// ── Palette ──

const palette = {
  primary: '#1976d2',
  border: '#e0e0e0',
};

const STATUS_CONFIG = {
  draft:           { label: 'Juodraštis',       color: 'default' },
  issued:          { label: 'Išrašyta',          color: 'info' },
  sent:            { label: 'Išsiųsta',          color: 'primary' },
  partially_paid:  { label: 'Dalinai apmokėta', color: 'warning' },
  paid:            { label: 'Apmokėta',          color: 'success' },
  cancelled:       { label: 'Atšaukta',          color: 'default' },
};

const RECURRING_STATUS = {
  active:    { label: 'Aktyvi',       color: 'success' },
  paused:    { label: 'Pristabdyta',  color: 'warning' },
  finished:  { label: 'Baigta',       color: 'default' },
  cancelled: { label: 'Atšaukta',     color: 'default' },
};

const TYPE_CONFIG = {
  isankstine:   { label: 'Išankstinė SF' },
  pvm_saskaita: { label: 'PVM SF' },
  saskaita:     { label: 'SF' },
  kreditine:    { label: 'Kreditinė SF' },
};

// ── API export helpers ──

const API_PROGRAMS = new Set(["rivile_gama_api", "dineta", "optimum"]);

const API_STATUS_FIELD = {
  rivile_gama_api: "rivile_api_status",
  dineta: "dineta_api_status",
  optimum: "optimum_api_status",
};

const API_PROGRAM_LABEL = {
  rivile_gama_api: "Rivile API",
  dineta: "Dineta API",
  optimum: "Optimum API",
};

const fmtAmount = (val, currency = 'EUR') => {
  if (val == null) return '—';
  const n = parseFloat(val);
  return `${n.toFixed(2).replace('.', ',')} ${currency === 'EUR' ? '€' : currency}`;
};

const fmtDate = (d) => {
  if (!d) return '—';
  const parts = d.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
};

const toInputDate = (d) => {
  if (!d) return '';
  return d instanceof Date ? d.toISOString().split('T')[0] : d;
};

const getDefaultDates = () => {
  const now = new Date();
  const ago = new Date(now);
  ago.setDate(now.getDate() - 90);
  return { date_from: toInputDate(ago), date_to: toInputDate(now) };
};

const fmtFrequency = (rec) => {
  if (rec.first_day_of_month) return 'Kas pirma mėn. diena';
  if (rec.last_day_of_month) return 'Kas paskutinė mėn. diena';
  const labels = {
    daily:     { 1: 'Kasdien',      default: (n) => `Kas ${n} d.` },
    weekly:    { 1: 'Kas savaitę',   default: (n) => `Kas ${n} sav.` },
    monthly:   { 1: 'Kas mėnesį',   default: (n) => `Kas ${n} mėn.` },
    quarterly: { 1: 'Kas ketvirtį',  default: (n) => `Kas ${n} ketv.` },
    yearly:    { 1: 'Kas metus',     default: (n) => `Kas ${n} m.` },
  };
  const group = labels[rec.frequency];
  if (!group) return rec.frequency;
  if (rec.interval === 1) return group[1];
  return group.default(rec.interval);
};

// ── Categories (вынесены наружу — стабильные ссылки) ──

const MAIN_CATEGORIES = [
  { key: 'israsytos',    label: 'Išrašytos',    Icon: HiDocumentCheck, iconColor: '#546e7a' },
  { key: 'veluojancios', label: 'Vėluojančios', Icon: IoIosTimer,      iconColor: '#f9a825' },
  { key: 'apmoketos',    label: 'Apmokėtos',    Icon: MdOutlinePaid,   iconColor: '#43a047' },
];

const EXTRA_CATEGORIES = [
  { key: 'periodines',  label: 'Periodinės',  Icon: LoopIcon },
  { key: 'juodrasciai', label: 'Juodraščiai', Icon: DrawIcon },
  { key: 'cancelled',   label: 'Anuliuotos',  Icon: DoNotDisturbIcon },
];

const CATEGORY_THEME = {
  israsytos: {
    activeBorder: '#1976d2',
    activeBg: 'linear-gradient(180deg, #f2f7ff 0%, #e8f1ff 100%)',
    iconBg: 'rgba(25,118,210,0.10)',
    mutedIconBg: '#eef3f8',
  },
  veluojancios: {
    activeBorder: '#d32f2f',
    activeBg: 'linear-gradient(180deg, #fff5f5 0%, #ffeaea 100%)',
    iconBg: 'rgba(211,47,47,0.10)',
    mutedIconBg: '#f6f1ef',
  },
  apmoketos: {
    activeBorder: '#2e7d32',
    activeBg: 'linear-gradient(180deg, #f3fbf4 0%, #e8f6ea 100%)',
    iconBg: 'rgba(46,125,50,0.10)',
    mutedIconBg: '#eef6ef',
  },
};

// ══════════════════════════════════════════
// Component
// ══════════════════════════════════════════

const InvoiceListPage = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [invoices, setInvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [summary, setSummary] = useState(null);
  const [user, setUser] = useState(null);

  const [activeCategory, setActiveCategory] = useState('israsytos');
  const [israsytosSubFilter, setIsrasytosSubFilter] = useState('');
  const [exportedFilter, setExportedFilter] = useState('');

  const defaultDates = useMemo(() => getDefaultDates(), []);
  const [filters, setFilters] = useState({
    invoice_type: '',
    q: '',
    date_from: defaultDates.date_from,
    date_to: defaultDates.date_to,
  });
  const limit = 50;

  // ── Infinite scroll refs ──
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const abortRef = useRef(null);
  const sentinelRef = useRef(null);
  const observerRef = useRef(null);

  const [selectedRows, setSelectedRows] = useState([]);
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', text: '', onConfirm: null });
  const [actionLoading, setActionLoading] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);

  const [exportStarting, setExportStarting] = useState(false);

  // ── Recurring ──
  const [recurringInvoices, setRecurringInvoices] = useState([]);
  const [recurringTotal, setRecurringTotal] = useState(0);
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [planDialog, setPlanDialog] = useState({ open: false, recurringId: null, data: null, loading: false });

  // ── Preview & PDF ──
  const [previewInvoiceId, setPreviewInvoiceId] = useState(null);
  const { downloadPdf, pdfLoading } = useInvoicePdf();

  // ── Payment dialogs ──
  const [markPaidInvoice, setMarkPaidInvoice] = useState(null);
  const [paymentProofInvoiceId, setPaymentProofInvoiceId] = useState(null);

  // ── Email status ──
  const [emailPopover, setEmailPopover] = useState({ anchorEl: null, invoiceId: null, emails: [], loading: false });
  const [emailTypeDialog, setEmailTypeDialog] = useState({ open: false, invoiceId: null, email: '' });

  // ── API export status dialog ──
  const [apiErrorDialog, setApiErrorDialog] = useState({ open: false, invoice: null });

  const { isFeatureLocked } = useInvSubscription();
  const recurringLocked = isFeatureLocked("recurring");

  // ── Cleanup abort on unmount ──
  useEffect(() => {
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  // ── User ──
  useEffect(() => {
    api.get('/profile/', { withCredentials: true })
      .then((res) => setUser(res.data))
      .catch(() => setUser(null));
  }, []);

  const programKey = user?.default_accounting_program || '';
  const programLabel =
    ACCOUNTING_PROGRAMS.find((p) => p.value === programKey)?.label || programKey || '...';
  const isApiProgram = API_PROGRAMS.has(programKey);

  // ── Resolved backend params ──

  const resolvedParams = useMemo(() => {
    const p = {};
    if (activeCategory === 'israsytos') {
      p.category = 'israsytos';
      if (israsytosSubFilter === 'sent') p.status = 'sent';
      else if (israsytosSubFilter === 'not_sent') p.status = 'issued';
    } else if (activeCategory === 'juodrasciai') {
      p.category = 'juodrasciai';
    } else if (activeCategory === 'cancelled') {
      p.category = 'cancelled';
    } else if (activeCategory && activeCategory !== 'periodines') {
      p.category = activeCategory;
    }
    return p;
  }, [activeCategory, israsytosSubFilter]);

  // ── Build common params ──

  const buildParams = useCallback((offset) => {
    const params = { limit, offset, ...resolvedParams };
    if (filters.invoice_type) params.invoice_type = filters.invoice_type;
    if (filters.q) params.q = filters.q;
    if (filters.date_from) params.date_from = filters.date_from;
    if (filters.date_to) params.date_to = filters.date_to;
    if (exportedFilter === 'exported') params.exported = 'true';
    else if (exportedFilter === 'not_exported') params.exported = 'false';
    return params;
  }, [resolvedParams, filters, exportedFilter]);

  // ── Load invoices (initial) ──

  const loadInvoices = useCallback(async () => {
    if (activeCategory === 'periodines') return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    offsetRef.current = 0;
    hasMoreRef.current = true;

    try {
      const params = buildParams(0);
      const { data } = await invoicingApi.getInvoices(params, { signal: controller.signal });
      const results = data.results || [];
      setInvoices(results);
      setTotal(data.count || 0);
      offsetRef.current = results.length;
      hasMoreRef.current = results.length < (data.count || 0);
    } catch (e) {
      if (e.name === 'AbortError' || e.name === 'CanceledError') return;
      setSnack({ open: true, msg: 'Nepavyko įkelti sąskaitų', severity: 'error' });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [buildParams, activeCategory]);

  // ── Load more invoices (infinite scroll) ──

  const loadMoreInvoices = useCallback(async () => {
    if (!hasMoreRef.current || loadingMore || loading) return;

    setLoadingMore(true);
    try {
      const params = buildParams(offsetRef.current);
      const { data } = await invoicingApi.getInvoices(params);
      const results = data.results || [];
      setInvoices((prev) => [...prev, ...results]);
      offsetRef.current += results.length;
      hasMoreRef.current = offsetRef.current < (data.count || 0);
    } catch (e) {
      if (e.name === 'AbortError' || e.name === 'CanceledError') return;
    } finally {
      setLoadingMore(false);
    }
  }, [buildParams, loadingMore, loading]);

  // ── Load recurring (initial) ──

  const loadRecurringInvoices = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRecurringLoading(true);
    offsetRef.current = 0;
    hasMoreRef.current = true;

    try {
      const params = { limit, offset: 0 };
      if (filters.q) params.search = filters.q;
      const { data } = await invoicingApi.getRecurringInvoices(params, { signal: controller.signal });
      const results = data.results || data || [];
      setRecurringInvoices(results);
      setRecurringTotal(data.count || results.length);
      offsetRef.current = results.length;
      hasMoreRef.current = results.length < (data.count || results.length);
    } catch (e) {
      if (e.name === 'AbortError' || e.name === 'CanceledError') return;
      setSnack({ open: true, msg: 'Nepavyko įkelti periodinių sąskaitų', severity: 'error' });
    } finally {
      if (!controller.signal.aborted) setRecurringLoading(false);
    }
  }, [filters.q]);

  // ── Load more recurring (infinite scroll) ──

  const loadMoreRecurring = useCallback(async () => {
    if (!hasMoreRef.current || loadingMore || recurringLoading) return;

    setLoadingMore(true);
    try {
      const params = { limit, offset: offsetRef.current };
      if (filters.q) params.search = filters.q;
      const { data } = await invoicingApi.getRecurringInvoices(params);
      const results = data.results || data || [];
      setRecurringInvoices((prev) => [...prev, ...results]);
      offsetRef.current += results.length;
      hasMoreRef.current = offsetRef.current < (data.count || 0);
    } catch {
      // Silently fail
    } finally {
      setLoadingMore(false);
    }
  }, [filters.q, loadingMore, recurringLoading]);

  const loadSummary = async () => {
      try {
        const params = {};
        if (filters.date_from) params.date_from = filters.date_from;
        if (filters.date_to) params.date_to = filters.date_to;
        const { data } = await invoicingApi.getSummary(params);
        setSummary(data);
      } catch { /* ok */ }
    };

  const handleEmailIconClick = async (e, inv) => {
    e.stopPropagation();
    setEmailPopover({ anchorEl: e.currentTarget, invoiceId: inv.id, emails: [], loading: true });
    try {
      const { data } = await invoicingApi.getInvoiceEmails(inv.id);
      setEmailPopover((p) => ({ ...p, emails: data || [], loading: false }));
    } catch {
      setEmailPopover((p) => ({ ...p, loading: false }));
    }
  };

  useEffect(() => {
    if (activeCategory === 'periodines') loadRecurringInvoices();
    else loadInvoices();
  }, [activeCategory, loadInvoices, loadRecurringInvoices]);

  useEffect(() => { loadSummary(); }, [filters.date_from, filters.date_to]);

  useEffect(() => {
    const saved = sessionStorage.getItem('inv_snack');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSnack({ open: true, msg: parsed.msg, severity: parsed.severity || 'success' });
      } catch {}
      sessionStorage.removeItem('inv_snack');
    }
  }, []);

  // ── IntersectionObserver for infinite scroll ──

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current && !loadingMore && !loading) {
          if (activeCategory === 'periodines') loadMoreRecurring();
          else loadMoreInvoices();
        }
      },
      { rootMargin: '300px' },
    );

    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [loadMoreInvoices, loadMoreRecurring, loadingMore, loading, activeCategory]);

  // ── Handlers ──

  const resetFiltersForCategory = (key) => {
    setSelectedRows([]);
    setIsrasytosSubFilter('');
    if (['juodrasciai', 'cancelled', 'periodines'].includes(key)) setExportedFilter('');
  };

  const updateFilter = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setSelectedRows([]);
  };

  const handleCategoryClick = (key) => {
    setActiveCategory(key);
    setFilters((prev) => ({ ...prev, invoice_type: '' }));
    resetFiltersForCategory(key);
  };

  const handleTextCategoryClick = (key) => {
    setActiveCategory(key);
    resetFiltersForCategory(key);
  };

  const handleSubFilterClick = (sub) => {
    setIsrasytosSubFilter((prev) => (prev === sub ? '' : sub));
    setSelectedRows([]);
  };

  const handleExportedFilterClick = (val) => {
    setExportedFilter((prev) => (prev === val ? '' : val));
    setSelectedRows([]);
  };

  // ── Checkbox ──

  const isRowExportable = (inv) => {
    if (!['issued', 'sent', 'paid', 'partially_paid'].includes(inv.status)) return false;
    if (inv.invoice_type === 'kreditine') return false;
    return true;
  };
  const isIsankstine = (inv) => inv.invoice_type === 'isankstine';
  const canBeChecked = (inv) => isRowExportable(inv) && !isIsankstine(inv);

  const exportableRows = useMemo(() => invoices.filter(canBeChecked), [invoices]);
  const exportableIds = useMemo(() => exportableRows.map((r) => String(r.id)), [exportableRows]);

  const allSelected = exportableIds.length > 0 && exportableIds.every((id) => selectedRows.includes(id));
  const someSelected = exportableIds.some((id) => selectedRows.includes(id)) && !allSelected;

  const handleSelectRow = (id) => {
    const sid = String(id);
    setSelectedRows((prev) => prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]);
  };
  const handleSelectAll = () => { allSelected ? setSelectedRows([]) : setSelectedRows(exportableIds); };

  const selectedExportCount = selectedRows.filter((id) => exportableIds.includes(id)).length;

  // ── Export ──

  const handleExport = async () => {
    if (exportLoading) return;
    if (selectedExportCount === 0) {
      setSnack({ open: true, msg: 'Pasirinkite bent vieną sąskaitą eksportui', severity: 'warning' });
      return;
    }
    if (!programKey) {
      setSnack({ open: true, msg: 'Pasirinkite buhalterinę programą nustatymuose', severity: 'warning' });
      return;
    }

    const isApiExport = API_PROGRAMS.has(programKey);

    setExportLoading(true);
    try {
      const payload = {
        ids: selectedRows.map(Number).filter(Number.isFinite),
        source: 'invoice',
        export_type: programKey,
      };

      if (isApiExport) {
        setExportStarting(true);
        try {
          await api.post('/documents/export_xml/', payload, {
            withCredentials: true,
          });

          setSelectedRows([]);
          // setSnack({ open: true, msg: 'Eksportas pradėtas', severity: 'success' });
        } finally {
          setExportStarting(false);
        }

      } else {
        // --- File export (все остальные программы) ---
        const res = await api.post('/documents/export_xml/', payload, {
          withCredentials: true,
          responseType: 'blob',
        });

        let filename = '';
        const cd = res.headers?.['content-disposition'];
        if (cd) { const m = cd.match(/filename="?([^"]+)"?/); if (m) filename = m[1]; }
        if (!filename) filename = 'eksportas.zip';

        const blob = new Blob([res.data], { type: res.headers?.['content-type'] || 'application/octet-stream' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);

        setSelectedRows([]);

        // --- Inv subscription: show usage snackbar ---
        const invStatus = res.headers?.['x-inv-status'];
        const exportsUsed = parseInt(res.headers?.['x-inv-exports-used'], 10);
        const exportsMax = parseInt(res.headers?.['x-inv-exports-max'], 10);

        if (invStatus === 'free' && !isNaN(exportsUsed) && !isNaN(exportsMax)) {
          if (exportsUsed >= exportsMax) {
            setSnack({
              open: true,
              msg: `Pasiektas mėnesio eksporto limitas (${exportsUsed}/${exportsMax}). Įsigykite planą neribotam naudojimui.`,
              severity: 'warning',
            });
          } else if (exportsUsed >= exportsMax * 0.5) {
            setSnack({
              open: true,
              msg: `Šį mėnesį eksportuota ${exportsUsed}/${exportsMax} sąskaitų. Įsigykite mokamą planą neribotam naudojimui.`,
              severity: 'info',
            });
          } else {
            setSnack({ open: true, msg: 'Eksportas sėkmingas', severity: 'success' });
          }
        } else {
          setSnack({ open: true, msg: 'Eksportas sėkmingas', severity: 'success' });
        }

        loadInvoices();
        loadSummary();
      }
    } catch (err) {
      console.error(err);
      if (err?.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          if (json.error === 'limit_reached') {
            setSnack({
              open: true,
              msg: json.message || `Mėnesio eksporto limitas pasiektas (${json.exports_used}/${json.exports_max}).`,
              severity: 'error',
            });
          } else {
            setSnack({ open: true, msg: json.error || json.detail || 'Eksportas nepavyko', severity: 'error' });
          }
        } catch { setSnack({ open: true, msg: 'Eksportas nepavyko', severity: 'error' }); }
      } else {
        setSnack({ open: true, msg: err?.response?.data?.error || err?.message || 'Eksportas nepavyko', severity: 'error' });
      }
    } finally {
      setExportLoading(false);
    }
  };

  // ── Actions ──

  const showSnack = (msg, severity = 'success') => setSnack({ open: true, msg, severity });

  const openConfirm = (title, text, onConfirm) => {
    setConfirmDialog({ open: true, title, text, onConfirm });
  };

  const closeConfirm = () => {
    setConfirmDialog({ open: false, title: '', text: '', onConfirm: null });
  };

  const executeConfirm = async () => {
    const fn = confirmDialog.onConfirm;
    closeConfirm();
    if (fn) await fn();
  };

  const handleAction = async (action, invoice) => {
    if (action === 'duplicate') {
      navigate(`/israsymas/nauja?from=${invoice.id}`);
      return;
    }

    setActionLoading(invoice.id);
    try {
      switch (action) {
        case 'issue':    await invoicingApi.issueInvoice(invoice.id); showSnack(`Sąskaita ${invoice.full_number || ''} išrašyta`); break;
        case 'send':     await invoicingApi.sendInvoice(invoice.id); showSnack('Sąskaita išsiųsta'); break;
        case 'cancel':   await invoicingApi.cancelInvoice(invoice.id); showSnack('Sąskaita atšaukta'); break;
        case 'create_pvm_sf': await invoicingApi.createPvmSf(invoice.id); showSnack('SF sukurta'); break;
        case 'delete':   await invoicingApi.deleteInvoice(invoice.id); showSnack('Sąskaita ištrinta'); break;
        default: break;
      }
      loadInvoices();
      loadSummary();
    } catch (e) {
      const msg = e.response?.data?.detail
        || (typeof e.response?.data === 'object' ? Object.values(e.response.data).flat().join(', ') : '')
        || 'Klaida';
      showSnack(msg, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Recurring actions ──

  const openPlanDialog = async (recurringId) => {
    setPlanDialog({ open: true, recurringId, data: null, loading: true });
    try {
      const { data } = await invoicingApi.getRecurringPlanHistory(recurringId);
      setPlanDialog((p) => ({ ...p, data, loading: false }));
    } catch {
      setPlanDialog((p) => ({ ...p, loading: false }));
      showSnack('Nepavyko įkelti plano', 'error');
    }
  };

  const handleRecurringAction = async (action, recurring) => {
    setActionLoading(recurring.id);
    try {
      switch (action) {
        case 'pause':  await invoicingApi.pauseRecurring(recurring.id);  showSnack('Periodinė sąskaita pristabdyta'); break;
        case 'resume': await invoicingApi.resumeRecurring(recurring.id); showSnack('Periodinė sąskaita tęsiama'); break;
        case 'cancel': await invoicingApi.cancelRecurring(recurring.id); showSnack('Periodinė sąskaita atšaukta'); break;
        default: break;
      }
      loadRecurringInvoices();
    } catch (e) {
      showSnack(e.response?.data?.detail || 'Klaida', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // ── PDF download handler ──

  const handlePdfDownload = async (inv) => {
    try {
      await downloadPdf(inv.id, `${inv.full_number || inv.id}.pdf`);
    } catch {
      showSnack('Nepavyko atsisiųsti PDF', 'error');
    }
  };

  // ── Payment handlers ──

  const handleMarkPaidConfirm = async (data) => {
    try {
      const res = await invoicingApi.markPaid(markPaidInvoice.id, data);
      showSnack('Pažymėta kaip apmokėta');
      if (res.data?.auto_created_sf) {
        showSnack(`Automatiškai sukurta ${res.data.auto_created_sf.full_number}`, 'info');
      }
      loadInvoices();
      loadSummary();
    } catch (e) {
      showSnack(e.response?.data?.detail || 'Klaida', 'error');
      throw e;
    }
  };

  const handleConfirmAllocation = async (allocId) => {
    try {
      await invoicingApi.confirmAllocation(allocId);
      showSnack('Mokėjimas patvirtintas');
      loadInvoices();
      loadSummary();
    } catch {
      showSnack('Nepavyko patvirtinti', 'error');
    }
  };

  const handleRejectAllocation = async (allocId) => {
    try {
      await invoicingApi.rejectAllocation(allocId);
      showSnack('Mokėjimas atmestas');
      loadInvoices();
      loadSummary();
    } catch {
      showSnack('Nepavyko atmesti', 'error');
    }
  };

  const handleRemoveManualPayment = async (allocId) => {
    try {
      await invoicingApi.removeManualPayment(paymentProofInvoiceId, allocId);
      showSnack('Rankinis pažymėjimas pašalintas');
      loadInvoices();
      loadSummary();
    } catch {
      showSnack('Nepavyko pašalinti', 'error');
    }
  };

  // ══════════════════════════════════════════
  // Category cards — useMemo
  // ══════════════════════════════════════════

  const categoryCardsMemo = useMemo(() => {
    if (!summary) return null;

    return (
      <Box sx={{ mb: 2.5 }}>
        <Grid2 container spacing={2} sx={{ mb: 1.5 }}>
          {MAIN_CATEGORIES.map(({ key, label, Icon, iconColor }) => {
            const s = summary[key] || { count: 0, total: '0.00' };
            const active = activeCategory === key;
            const hasAmount = parseFloat(s.total) > 0;
            const isIsrasytos = key === 'israsytos';
            const themeCfg = CATEGORY_THEME[key];

            return (
              <Grid2 size={{ xs: 12, md: 4 }} key={key}>
                <Paper
                  variant="outlined"
                  onClick={() => handleCategoryClick(key)}
                  sx={{
                    minHeight: 152,
                    p: 2.25,
                    borderRadius: 3,
                    cursor: 'pointer',
                    userSelect: 'none',
                    borderColor: active ? themeCfg.activeBorder : '#e5e7eb',
                    borderWidth: active ? 2 : 1,
                    background: active ? themeCfg.activeBg : '#fff',
                    boxShadow: active
                      ? '0 6px 18px rgba(15,23,42,0.06)'
                      : '0 1px 6px rgba(15,23,42,0.03)',
                    transition: 'border-color 0.12s ease, background-color 0.12s ease, box-shadow 0.12s ease',
                    '&:hover': {
                      borderColor: active ? themeCfg.activeBorder : '#cfd8e3',
                      boxShadow: '0 4px 14px rgba(15,23,42,0.05)',
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.25 }}>
                    <Box
                      sx={{
                        width: 52,
                        height: 52,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: active ? themeCfg.iconBg : themeCfg.mutedIconBg,
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={22} color={iconColor} />
                    </Box>

                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap', mb: 0.3 }}>
                        <Typography sx={{ fontSize: 34, lineHeight: 1, fontWeight: 800, color: '#111827' }}>
                          {s.count}
                        </Typography>
                        {hasAmount && (
                          <Typography sx={{ fontSize: 14, color: 'text.secondary', whiteSpace: 'nowrap', fontWeight: 500 }}>
                            {fmtAmount(s.total)}
                          </Typography>
                        )}
                      </Box>
                      <Typography sx={{ fontSize: 14, lineHeight: 1.25, color: 'text.secondary', fontWeight: active ? 700 : 500 }}>
                        {label}
                      </Typography>
                    </Box>
                  </Box>

                  <Box
                    sx={{ minHeight: 34, display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}
                  >
                    {isIsrasytos && (
                      <>
                        <Chip
                          label="Išsiųstos"
                          size="small"
                          clickable
                          variant={israsytosSubFilter === 'sent' ? 'filled' : 'outlined'}
                          color={israsytosSubFilter === 'sent' ? 'primary' : 'default'}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (activeCategory !== 'israsytos') setActiveCategory('israsytos');
                            handleSubFilterClick('sent');
                          }}
                          sx={{
                            height: 28, borderRadius: 2, fontWeight: 600, px: 0.5,
                            backgroundColor: israsytosSubFilter === 'sent' ? undefined : active ? '#ffffff' : undefined,
                          }}
                        />
                        <Chip
                          label="Neišsiųstos"
                          size="small"
                          clickable
                          variant={israsytosSubFilter === 'not_sent' ? 'filled' : 'outlined'}
                          color={israsytosSubFilter === 'not_sent' ? 'primary' : 'default'}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (activeCategory !== 'israsytos') setActiveCategory('israsytos');
                            handleSubFilterClick('not_sent');
                          }}
                          sx={{
                            height: 28, borderRadius: 2, fontWeight: 600, px: 0.5,
                            backgroundColor: israsytosSubFilter === 'not_sent' ? undefined : active ? '#ffffff' : undefined,
                          }}
                        />
                      </>
                    )}
                  </Box>
                </Paper>
              </Grid2>
            );
          })}
        </Grid2>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          {EXTRA_CATEGORIES.map(({ key, label, Icon }) => {
            const active = activeCategory === key;
            return (
              <Chip
                key={key}
                icon={<Icon sx={{ fontSize: '18px !important' }} />}
                label={label}
                clickable
                onClick={() => handleTextCategoryClick(key)}
                variant={active ? 'filled' : 'outlined'}
                color={active ? 'primary' : 'default'}
                sx={{ height: 34, borderRadius: 2, fontWeight: active ? 700 : 500, px: 0.5 }}
              />
            );
          })}
        </Box>
      </Box>
    );
  }, [summary, activeCategory, israsytosSubFilter]);

  // ── Export button helpers ──

  const exportDisabledReason = useMemo(() => {
    if (!user) return 'Kraunama...';
    if (!programKey) return 'Pirmiausia pasirinkite buhalterinę programą nustatymuose';
    if (selectedExportCount === 0) return 'Pažymėkite bent vieną sąskaitą eksportui';
    return '';
  }, [user, programKey, selectedExportCount]);
  const exportDisabled = Boolean(exportDisabledReason);
  const showExportedFilter = ['israsytos', 'veluojancios', 'apmoketos'].includes(activeCategory);

  // ══════════════════════════════════════════
  // Render-функции
  // ══════════════════════════════════════════

  // ── renderApiStatus ──

  const renderApiStatus = (inv) => {
    if (!isApiProgram) return null;
    const field = API_STATUS_FIELD[programKey];
    const status = inv[field];
    if (!status) return <Typography variant="caption" color="text.disabled">—</Typography>;

    if (status === "success") {
      return (
        <Tooltip title="Eksportas sėkmingas">
          <CheckCircle sx={{ fontSize: 18, color: "success.main" }} />
        </Tooltip>
      );
    }
    if (status === "partial_success") {
      return (
        <Tooltip title="Dalinai eksportuota — paspauskite norėdami pamatyti detales">
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setApiErrorDialog({ open: true, invoice: inv }); }}>
            <WarningAmber sx={{ fontSize: 18, color: "warning.main" }} />
          </IconButton>
        </Tooltip>
      );
    }
    if (status === "error") {
      return (
        <Tooltip title="Eksporto klaida — paspauskite norėdami pamatyti detales">
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setApiErrorDialog({ open: true, invoice: inv }); }}>
            <ErrorOutlineIcon sx={{ fontSize: 18, color: "error.main" }} />
          </IconButton>
        </Tooltip>
      );
    }
    return <Typography variant="caption" color="text.disabled">—</Typography>;
  };

  // ── renderRowActions ──

  const renderRowActions = (inv) => {
    const isLoading = actionLoading === inv.id;
    if (isLoading) return <CircularProgress size={20} />;

    const cat = activeCategory;
    const a = [];

    if (cat === 'juodrasciai') {
      a.push('edit', 'duplicate', 'delete');
    } else if (cat === 'cancelled') {
      a.push('duplicate', 'pdf');
    } else if (cat === 'israsytos') {
      a.push('edit');
      if (inv.can_create_pvm_sf) a.push('convert_sf');
      if (['issued', 'sent'].includes(inv.status)) a.push('send_email');
      a.push('mark_paid', 'duplicate', 'pdf', 'cancel');
    } else if (cat === 'veluojancios') {
      a.push('edit');
      if (inv.can_create_pvm_sf) a.push('convert_sf');
      a.push('send_reminder', 'mark_paid', 'duplicate', 'pdf', 'cancel');
    } else if (cat === 'apmoketos') {
      a.push('edit');
      if (inv.can_create_pvm_sf) a.push('convert_sf');
      a.push('duplicate', 'pdf', 'cancel');
    } else {
      if (inv.status === 'draft') {
        a.push('edit');
        if (inv.can_create_pvm_sf) a.push('convert_sf');
        a.push('duplicate', 'delete');
      } else if (['issued', 'sent'].includes(inv.status)) {
        a.push('edit');
        if (inv.can_create_pvm_sf) a.push('convert_sf');
        a.push('send_email', 'mark_paid', 'duplicate', 'pdf', 'cancel');
      } else if (inv.status === 'paid') {
        a.push('edit');
        if (inv.can_create_pvm_sf) a.push('convert_sf');
        a.push('duplicate', 'pdf', 'cancel');
      } else if (inv.status === 'cancelled') {
        a.push('duplicate', 'pdf');
      }
    }

    const invoiceId = inv.id;

    const buttons = {
      convert_sf: (
        <Tooltip title="Konvertuoti į SF" key="convert_sf">
          <IconButton size="small" color="secondary" onClick={() => handleAction('create_pvm_sf', inv)}>
            <PvmSfIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
      send_email: (
        <Tooltip title="Siųsti el. paštu" key="send_email">
          <IconButton size="small" color="primary" onClick={async () => {
            const isFromIsankstine = inv.source_invoice && inv.invoice_type !== 'isankstine';
            const isUnpaid = !['paid'].includes(inv.status);

            if (isFromIsankstine && isUnpaid) {
              setEmailTypeDialog({ open: true, invoiceId: inv.id, email: inv.buyer_email });
              return;
            }

            setActionLoading(inv.id);
            try {
              const { data } = await invoicingApi.sendInvoiceEmail(inv.id, inv.buyer_email);
              if (data.needs_confirm) {
                setActionLoading(null);
                const sentDate = data.last_sent_at ? new Date(data.last_sent_at).toLocaleString('lt-LT') : '';
                openConfirm(
                  'Pakartotinis siuntimas',
                  `Ši sąskaita jau buvo išsiųsta${sentDate ? ` ${sentDate}` : ''} adresu ${data.last_sent_to || inv.buyer_email}. Išsiųsta: ${data.total_sent}/${data.max_count}. Ar tikrai norite siųsti dar kartą?`,
                  async () => {
                    setActionLoading(inv.id);
                    try {
                      const res = await api.post(`/invoicing/invoices/${inv.id}/send-email/`, { email: inv.buyer_email, force: true }, { withCredentials: true });
                      const sd = res.data || {};
                      if (sd.inv_status === 'free' && sd.emails_used != null) {
                        if (sd.emails_used >= sd.emails_max) {
                          showSnack(`Išsiųsta. Pasiektas mėnesio limitas (${sd.emails_used}/${sd.emails_max}).`, 'warning');
                        } else if (sd.emails_used >= sd.emails_max * 0.5) {
                          showSnack(`Išsiųsta. Šį mėnesį išsiųsta ${sd.emails_used}/${sd.emails_max} sąskaitų el. paštu.`, 'info');
                        } else {
                          showSnack('El. laiškas išsiųstas');
                        }
                      } else {
                        showSnack('El. laiškas išsiųstas');
                      }
                      setInvoices((prev) => prev.map((i) => i.id === inv.id ? { ...i, email_sent_count: (i.email_sent_count || 0) + 1, email_last_status: 'sent' } : i));
                    } catch (e) {
                      if (e.response?.status === 403 && e.response?.data?.error === 'limit_reached') {
                        showSnack(e.response.data.message, 'error');
                      } else {
                        showSnack(e.response?.data?.detail || 'Nepavyko išsiųsti', 'error');
                      }
                    } finally { setActionLoading(null); }
                  },
                );
                return;
              }
              const sd = data;
              if (sd.inv_status === 'free' && sd.emails_used != null) {
                if (sd.emails_used >= sd.emails_max) {
                  showSnack(`Išsiųsta. Pasiektas mėnesio limitas (${sd.emails_used}/${sd.emails_max}).`, 'warning');
                } else if (sd.emails_used >= sd.emails_max * 0.5) {
                  showSnack(`Išsiųsta. Šį mėnesį išsiųsta ${sd.emails_used}/${sd.emails_max} sąskaitų el. paštu.`, 'info');
                } else {
                  showSnack('El. laiškas išsiųstas');
                }
              } else {
                showSnack('El. laiškas išsiųstas');
              }
              setInvoices((prev) => prev.map((i) => i.id === inv.id ? { ...i, email_sent_count: (i.email_sent_count || 0) + 1, email_last_status: 'sent' } : i));
            } catch (e) {
              if (e.response?.status === 403 && e.response?.data?.error === 'limit_reached') {
                showSnack(e.response.data.message, 'error');
              } else {
                showSnack(e.response?.data?.detail || 'Nepavyko išsiųsti', 'error');
              }
            } finally { setActionLoading(null); }
          }}>
            <SendIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
      send_reminder: (
        <Tooltip title="Siųsti priminimą" key="send_reminder">
          <IconButton size="small" color="warning" onClick={async () => {
            setActionLoading(inv.id);
            try {
              const { data } = await invoicingApi.sendInvoiceReminder(inv.id, inv.buyer_email);
              const sd = data || {};
              if (sd.inv_status === 'free' && sd.emails_used != null) {
                if (sd.emails_used >= sd.emails_max) {
                  showSnack(`Priminimas išsiųstas. Pasiektas mėnesio limitas (${sd.emails_used}/${sd.emails_max}).`, 'warning');
                } else if (sd.emails_used >= sd.emails_max * 0.5) {
                  showSnack(`Priminimas išsiųstas. Šį mėnesį išsiųsta ${sd.emails_used}/${sd.emails_max} sąskaitų el. paštu.`, 'info');
                } else {
                  showSnack('Priminimas išsiųstas');
                }
              } else {
                showSnack('Priminimas išsiųstas');
              }
              setInvoices((prev) => prev.map((i) =>
                i.id === inv.id ? { ...i, email_sent_count: (i.email_sent_count || 0) + 1, email_last_status: 'sent' } : i
              ));
            } catch (e) {
              if (e.response?.status === 403 && e.response?.data?.error === 'limit_reached') {
                showSnack(e.response.data.message, 'error');
              } else {
                showSnack(e.response?.data?.detail || 'Nepavyko išsiųsti', 'error');
              }
            } finally { setActionLoading(null); }
          }}>
            <SendIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
      mark_paid: (
        <Tooltip title="Pažymėti apmokėta" key="mark_paid">
          <IconButton size="small" color="success" onClick={() => setMarkPaidInvoice(inv)}>
            <PaidIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
      edit: (
        <Tooltip title="Redaguoti" key="edit">
          <IconButton size="small" onClick={() => navigate(`/israsymas/${inv.id}`)}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
      duplicate: (
        <Tooltip title="Kopijuoti" key="duplicate">
          <IconButton size="small" onClick={() => navigate(`/israsymas/nauja?from=${inv.id}`)}>
            <DuplicateIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
      pdf: (
        <Tooltip title="Parsisiųsti PDF" key="pdf">
          <IconButton size="small" onClick={() => handlePdfDownload(inv)} disabled={pdfLoading}>
            {pdfLoading ? <CircularProgress size={16} /> : <DownloadIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      ),
      cancel: (
        <Tooltip title="Anuliuoti" key="cancel">
          <IconButton size="small" color="error"
            onClick={() => openConfirm(
              'Anuliuoti sąskaitą?',
              `${inv.full_number || 'Sąskaita'} bus anuliuota.`,
              () => handleAction('cancel', { id: invoiceId }),
            )}>
            <CancelIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
      delete: (
        <Tooltip title="Ištrinti" key="delete">
          <IconButton size="small" color="error"
            onClick={() => openConfirm(
              'Ištrinti juodraštį?',
              'Veiksmo anuliuoti nebus galima.',
              () => handleAction('delete', { id: invoiceId }),
            )}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    };

    return (
      <Stack direction="row" spacing={0.25} sx={{ flexWrap: 'nowrap' }}>
        {a.map((key) => buttons[key])}
      </Stack>
    );
  };

  // ── renderRecurringRowActions ──

  const renderRecurringRowActions = (rec) => {
    const isLoading = actionLoading === rec.id;
    if (isLoading) return <CircularProgress size={20} />;

    return (
      <Stack direction="row" spacing={0.25} sx={{ flexWrap: 'nowrap' }}>
        <Tooltip title="Planas ir istorija">
          <IconButton size="small" onClick={() => openPlanDialog(rec.id)}>
            <CalendarMonthIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {['active', 'paused'].includes(rec.status) && (
          <Tooltip title={recurringLocked ? "Redaguoti periodinę sąskaitą galima tik su mokamu planu" : "Redaguoti"}>
            <span>
              <IconButton
                size="small"
                disabled={recurringLocked}
                onClick={() => navigate(`/israsymas/nauja?recurring=${rec.id}`)}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
        <Tooltip title={recurringLocked ? "Kopijuoti periodinę sąskaitą galima tik su mokamu planu" : "Kopijuoti"}>
          <span>
            <IconButton
              size="small"
              disabled={recurringLocked}
              onClick={() => navigate(`/israsymas/nauja?recurring_from=${rec.id}`)}
            >
              <DuplicateIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        {rec.status === 'active' && (
          <Tooltip title="Pristabdyti">
            <IconButton size="small" color="warning" onClick={() => handleRecurringAction('pause', rec)}>
              <PauseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {rec.status === 'paused' && (
          <Tooltip title={recurringLocked ? "Tęsti periodinę sąskaitą galima tik su mokamu planu" : "Tęsti"}>
            <span>
              <IconButton
                size="small"
                color="success"
                disabled={recurringLocked}
                onClick={() => handleRecurringAction('resume', rec)}
              >
                <PlayArrowIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
        {['active', 'paused'].includes(rec.status) && (
          <Tooltip title="Atšaukti">
            <IconButton size="small" color="error"
              onClick={() => openConfirm(
                'Atšaukti periodinę sąskaitą?',
                'Naujos sąskaitos nebebus kuriamos.',
                () => handleRecurringAction('cancel', rec),
              )}>
              <CancelIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    );
  };

  const renderEmailIcon = (inv) => {
      if (inv.status === 'draft') return <Typography variant="caption" color="text.disabled">—</Typography>;

      if (!inv.email_sent_count) {
        return <Typography variant="caption" color="text.disabled">—</Typography>;
      }

      let icon, color;
      if (inv.email_last_status === 'opened') {
        icon = <MarkEmailReadIcon sx={{ fontSize: 18 }} />;
        color = 'success.main';
      } else if (inv.email_last_status === 'failed') {
        icon = <ErrorOutlineIcon sx={{ fontSize: 18 }} />;
        color = 'error.main';
      } else {
        icon = <MailOutlineIcon sx={{ fontSize: 18 }} />;
        color = 'text.secondary';
      }

      return (
        <Tooltip title={`${inv.email_sent_count} el. laiškų`}>
          <IconButton size="small" sx={{ color }} onClick={(e) => handleEmailIconClick(e, inv)}>
            {icon}
          </IconButton>
        </Tooltip>
      );
    };

  // ── renderRowCheckbox ──

  const renderRowCheckbox = (inv) => {
    const exportable = canBeChecked(inv);
    const isIsankt = isIsankstine(inv);
    const checked = exportable && selectedRows.includes(String(inv.id));

    if (isIsankt && isRowExportable(inv)) {
      return (
        <Tooltip title="Išankstinės sąskaitos neeksportuojamos. Konvertuokite į PVM SF/ SF arba pasirinkite jau išrašytą PVM SF/ SF pagal šią išankstinę, tada eksportuokite." arrow>
          <span><Checkbox size="small" disabled checked={false} /></span>
        </Tooltip>
      );
    }
    if (!isRowExportable(inv)) return <Checkbox size="small" disabled checked={false} />;
    return <Checkbox size="small" checked={checked} onChange={() => handleSelectRow(inv.id)} />;
  };

  // ── isOverdue helper ──

  const isOverdue = (inv) => {
    if (inv.is_overdue) return true;
    if (!['issued', 'sent'].includes(inv.status) || !inv.due_date) return false;
    return inv.due_date < new Date().toISOString().split('T')[0];
  };

  // ── renderStatusChip ──

  const renderStatusChip = (inv) => {
    if (isOverdue(inv) && !['paid', 'partially_paid'].includes(inv.status)) {
      return <Chip label="Vėluojanti" color="error" size="small" variant="outlined" />;
    }

    if (inv.status === 'paid') {
      return (
        <Chip
          label="Apmokėta"
          color="success"
          size="small"
          variant="outlined"
          onClick={(e) => { e.stopPropagation(); setPaymentProofInvoiceId(inv.id); }}
          sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'rgba(76,175,80,0.08)' } }}
        />
      );
    }

    if (inv.status === 'partially_paid') {
      return (
        <Chip
          label="Dalinai apmokėta"
          color="warning"
          size="small"
          variant="outlined"
          onClick={(e) => { e.stopPropagation(); setPaymentProofInvoiceId(inv.id); }}
          sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'rgba(237,108,2,0.08)' } }}
        />
      );
    }

    if (inv.has_proposed_payments) {
      return (
        <Chip
          label="Laukia patvirtinimo"
          color="info"
          size="small"
          variant="outlined"
          onClick={(e) => { e.stopPropagation(); setPaymentProofInvoiceId(inv.id); }}
          sx={{
            cursor: 'pointer',
            animation: 'pulse 2s ease-in-out infinite',
            '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
          }}
        />
      );
    }

    return (
      <Chip
        label={STATUS_CONFIG[inv.status]?.label || inv.status}
        color={STATUS_CONFIG[inv.status]?.color || 'default'}
        size="small"
        variant="outlined"
      />
    );
  };

  // ── renderNumberLink ──

  const renderNumberLink = (inv) => {
    const isDraft = inv.status === 'draft';
    const display = (inv.document_series && inv.document_number)
      ? `${inv.document_series}-${inv.document_number}`
      : inv.full_number || '—';

    if (isDraft) {
      return (
        <Typography
          fontWeight={700} fontSize={13}
          sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
          onClick={() => navigate(`/israsymas/${inv.id}`)}
        >
          {display}
        </Typography>
      );
    }

    return (
      <Typography
        fontWeight={700} fontSize={13}
        sx={{
          color: palette.primary,
          cursor: 'pointer',
          '&:hover': { textDecoration: 'underline' },
        }}
        onClick={(e) => {
          e.stopPropagation();
          setPreviewInvoiceId(inv.id);
        }}
      >
        {display}
      </Typography>
    );
  };

  // ── renderMobileCard ──

  const renderMobileCard = (inv) => (
    <Paper key={inv.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
        {renderRowCheckbox(inv)}
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
            <Box>
              {renderNumberLink(inv)}
              <Typography variant="caption" color="text.secondary">{TYPE_CONFIG[inv.invoice_type]?.label}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {inv.exported && <Chip label="Eksp." size="small" color="secondary" variant="outlined" sx={{ fontSize: 10, height: 20 }} />}
              {isApiProgram && inv[API_STATUS_FIELD[programKey]] && (
                <Box sx={{ display: 'inline-flex', ml: 0.5 }}>{renderApiStatus(inv)}</Box>
              )}
              {renderStatusChip(inv)}
            </Box>
          </Box>
          <Typography variant="body2">{inv.buyer_name || '—'}</Typography>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
            <Typography variant="body2" color="text.secondary">{fmtDate(inv.invoice_date)}</Typography>
            <Typography fontWeight={700}>{fmtAmount(inv.amount_with_vat || inv.amount_wo_vat, inv.currency)}</Typography>
          </Box>
          <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end' }}>{renderRowActions(inv)}</Box>
        </Box>
      </Box>
    </Paper>
  );

  // ── renderLoadMoreSentinel ──

  const renderLoadMoreSentinel = (colSpan, isTable = false) => {
    if (isTable) {
      return (
        <>
          <TableRow ref={sentinelRef}>
            <TableCell colSpan={colSpan} sx={{ p: 0, border: 0, height: 1 }} />
          </TableRow>
          {loadingMore && (
            <TableRow>
              <TableCell colSpan={colSpan} align="center" sx={{ py: 2 }}>
                <LinearProgress sx={{ maxWidth: 200, mx: 'auto', mb: 1 }} />
                <Typography variant="body2" color="text.secondary">Kraunama daugiau...</Typography>
              </TableCell>
            </TableRow>
          )}
          {!hasMoreRef.current && !loading && !loadingMore && (
            <TableRow>
              <TableCell colSpan={colSpan} align="center" sx={{ py: 1.5, color: 'text.disabled' }}>
                <Typography variant="body2">
                  Visi dokumentai įkelti ({invoices.length})
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </>
      );
    }

    return (
      <>
        <Box ref={sentinelRef} sx={{ height: 1 }} />
        {loadingMore && (
          <Box sx={{ py: 2, textAlign: 'center' }}>
            <LinearProgress sx={{ maxWidth: 200, mx: 'auto', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">Kraunama daugiau...</Typography>
          </Box>
        )}
        {!hasMoreRef.current && !loading && !loadingMore && (
          <Typography variant="body2" color="text.disabled" textAlign="center" sx={{ py: 1.5 }}>
            Visi dokumentai įkelti
          </Typography>
        )}
      </>
    );
  };

  // ── Table colSpan ──
  const tableColSpan = isApiProgram ? 12 : 11;

  // ══════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: isApiProgram ? 1500 : 1400, mx: 'auto', overflowX: 'hidden' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h1" sx={{ color: palette.primary, fontWeight: 500, fontSize: 24 }}>
          Sąskaitų išrašymas
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {activeCategory !== 'periodines' && (
            <>
              <Tooltip title="Išrašymo nustatymai">
                <IconButton onClick={() => navigate('/israsymas/nustatymai')} size="small">
                  <SettingsIcon sx={{ fontSize: 22, color: "text.secondary" }} />
                </IconButton>
              </Tooltip>

              <Tooltip
                title={exportDisabled ? exportDisabledReason : ''}
                placement="bottom"
                disableHoverListener={!exportDisabled}
              >
                <span>
                  <Button
                    variant="outlined"
                    color="primary"
                    startIcon={exportLoading ? <CircularProgress size={16} /> : <ExportIcon />}
                    onClick={handleExport}
                    disabled={exportDisabled || exportLoading}
                  >
                    Eksportuoti{selectedExportCount ? ` (${selectedExportCount})` : ''} į {programLabel}
                  </Button>
                </span>
              </Tooltip>
            </>
          )}

          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/israsymas/nauja')}
          >
            Nauja sąskaita
          </Button>
        </Box>
      </Box>

      {/* ExportStatusBar for API exports */}
      <ExportStatusBar
        source="invoice"
        onExportComplete={() => { loadInvoices(); loadSummary(); }}
      />

      {categoryCardsMemo}

      {/* Filters — hide date filters for periodines */}
      {activeCategory !== 'periodines' && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
          <Grid2 container spacing={1.5} alignItems="center">
            <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                sx={{ fontSize: 10 }}
                fullWidth size="small"
                placeholder="Ieškoti pagal pirkėją, numerį..."
                value={filters.q}
                onChange={(e) => updateFilter('q', e.target.value)}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
              />
            </Grid2>
            <Grid2 size={{ xs: 6, sm: 3, md: 2 }}>
              <TextField
                fullWidth size="small" select label="Tipas"
                value={filters.invoice_type}
                onChange={(e) => updateFilter('invoice_type', e.target.value)}
                SelectProps={{ MenuProps: { disableScrollLock: true }, displayEmpty: true }}
                InputLabelProps={{ shrink: true }}
              >
                <MenuItem value="">Visi</MenuItem>
                <MenuItem value="isankstine">Išankstinė SF</MenuItem>
                <MenuItem value="pvm_saskaita">PVM SF</MenuItem>
                <MenuItem value="saskaita">SF (be PVM)</MenuItem>
                <MenuItem value="kreditine">Kreditinė SF</MenuItem>
              </TextField>
            </Grid2>
            <Grid2 size={{ xs: 6, sm: 3, md: 2 }}>
              <DateField size="small" label="Nuo" value={filters.date_from} onChange={(v) => updateFilter('date_from', v)} />
            </Grid2>
            <Grid2 size={{ xs: 6, sm: 3, md: 2 }}>
              <DateField size="small" label="Iki" value={filters.date_to} onChange={(v) => updateFilter('date_to', v)} />
            </Grid2>
            {showExportedFilter && (
              <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                  <Chip
                    label="Eksportuotos" size="small" variant="filled"
                    onClick={() => handleExportedFilterClick('exported')}
                    sx={{
                      cursor: 'pointer', fontWeight: 500, fontSize: 12, borderRadius: 1.5,
                      backgroundColor: exportedFilter === 'exported' ? '#616161' : '#eeeeee',
                      color: exportedFilter === 'exported' ? '#fff' : '#555',
                      '&:hover': { backgroundColor: exportedFilter === 'exported' ? '#757575' : '#e0e0e0' },
                    }}
                  />
                  <Chip
                    label="Neeksportuotos" size="small" variant="filled"
                    onClick={() => handleExportedFilterClick('not_exported')}
                    sx={{
                      cursor: 'pointer', fontWeight: 500, fontSize: 12, borderRadius: 1.5,
                      backgroundColor: exportedFilter === 'not_exported' ? '#616161' : '#eeeeee',
                      color: exportedFilter === 'not_exported' ? '#fff' : '#555',
                      '&:hover': { backgroundColor: exportedFilter === 'not_exported' ? '#757575' : '#e0e0e0' },
                    }}
                  />
                </Box>
              </Grid2>
            )}
          </Grid2>
        </Paper>
      )}

      {/* ═══ Content ═══ */}
      {activeCategory === 'periodines' ? (
        // ── Periodinės sąskaitos ──
        <>
          {recurringLocked && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                px: 2.5,
                py: { xs: 1.5, md: 2 },
                mb: 2,
                borderRadius: 3,
                bgcolor: "rgba(255, 145, 0, 0.10)",
                border: "1px solid rgba(255, 145, 0, 0.28)",
                boxShadow: "0 10px 30px rgba(255, 145, 0, 0.10)",
                backdropFilter: "blur(8px)",
                flexWrap: "wrap",
              }}
            >
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: "rgba(255, 145, 0, 0.14)",
                  flexShrink: 0,
                }}
              >
                <LockIcon sx={{ color: "#F57C00", fontSize: 18 }} />
              </Box>
              <Typography
                variant="body2"
                sx={{ color: "#3B2A1A", fontWeight: 500, lineHeight: 1.5, flex: 1, minWidth: 200 }}
              >
                Periodinės sąskaitos prieinamos tik su mokamu planu arba bandomuoju laikotarpiu.
              </Typography>
              <Button
                size="small"
                href="/papildyti#planai"
                sx={{
                  textTransform: "none",
                  borderRadius: 2.5,
                  px: 2,
                  py: 0.75,
                  minWidth: "fit-content",
                  flexShrink: 0,
                  fontWeight: 600,
                  color: "#fff",
                  background: "linear-gradient(135deg, #FF9800 0%, #F57C00 100%)",
                  boxShadow: "none",
                  "&:hover": {
                    background: "linear-gradient(135deg, #FB8C00 0%, #EF6C00 100%)",
                    boxShadow: "none",
                  },
                }}
              >
                Įsigyti planą
              </Button>
            </Box>
          )}
          {recurringLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
        ) : recurringInvoices.length === 0 && !loadingMore ? (
          <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
            <Typography variant="h6" color="text.secondary">Periodinių sąskaitų nerasta</Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/israsymas/nauja')}
            sx={{ mt: 2 }}
            disabled={recurringLocked}
          >
            Sukurti periodinę sąskaitą
          </Button>
          </Paper>
        ) : isMobile ? (
          <Box>
            {recurringInvoices.map((rec) => (
              <Paper key={rec.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Box>
                    <Typography fontWeight={700} fontSize={13}>
                      {rec.document_series} · {TYPE_CONFIG[rec.invoice_type]?.label}
                    </Typography>
                    <Typography variant="body2">{rec.buyer_name || '—'}</Typography>
                  </Box>
                  <Chip label={RECURRING_STATUS[rec.status]?.label} color={RECURRING_STATUS[rec.status]?.color} size="small" variant="outlined" />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="caption" color="text.secondary">{fmtFrequency(rec)}</Typography>
                  <Typography fontWeight={700} fontSize={13}>{fmtAmount(rec.estimated_amount, rec.currency)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary">
                    Sekanti: {rec.next_run_at ? fmtDate(rec.next_run_at.split('T')[0]) : '—'}
                  </Typography>
                  {renderRecurringRowActions(rec)}
                </Box>
              </Paper>
            ))}
            {renderLoadMoreSentinel()}
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, py: 1.5, backgroundColor: '#f5f5f5' } }}>
                  <TableCell>Tipas</TableCell>
                  <TableCell>Serija</TableCell>
                  <TableCell>Pirkėjas</TableCell>
                  <TableCell>Dažnumas</TableCell>
                  <TableCell>Statusas</TableCell>
                  <TableCell>Sekanti sąskaita</TableCell>
                  <TableCell align="center">Išrašyta</TableCell>
                  <TableCell align="right">Suma</TableCell>
                  <TableCell align="left">Veiksmai</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recurringInvoices.map((rec) => (
                  <TableRow key={rec.id} hover sx={{ '& td': { py: 1.2 }, cursor: 'pointer' }}
                    onClick={() => {
                      if (rec.last_invoice) navigate(`/israsymas/${rec.last_invoice}`);
                      else openPlanDialog(rec.id);
                    }}
                  >
                    <TableCell>
                      <Typography variant="caption" fontWeight={600}>{TYPE_CONFIG[rec.invoice_type]?.label}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography fontWeight={700} fontSize={13}>{rec.document_series || '—'}</Typography>
                    </TableCell>
                    <TableCell>{rec.buyer_name || '—'}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontSize={13}>{fmtFrequency(rec)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={RECURRING_STATUS[rec.status]?.label || rec.status}
                        color={RECURRING_STATUS[rec.status]?.color || 'default'}
                        size="small" variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography fontSize={13}>
                        {rec.next_run_at ? fmtDate(rec.next_run_at.split('T')[0]) : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography fontSize={13} fontWeight={600}>{rec.generation_count}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography fontWeight={700} fontSize={13}>{fmtAmount(rec.estimated_amount, rec.currency)}</Typography>
                    </TableCell>
                    <TableCell align="left" onClick={(e) => e.stopPropagation()}>
                      {renderRecurringRowActions(rec)}
                    </TableCell>
                  </TableRow>
                ))}
                {renderLoadMoreSentinel(9, true)}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        </>
      ) : loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
      ) : invoices.length === 0 && !loadingMore ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
          <Typography variant="h6" color="text.secondary">Sąskaitų nerasta</Typography>
        </Paper>
      ) : isMobile ? (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', py: 1, px: 0.5, mb: 1 }}>
            <Checkbox size="small" indeterminate={someSelected} checked={allSelected} onChange={handleSelectAll} />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
              Pasirinkti visus ({exportableIds.length})
            </Typography>
          </Box>
          {invoices.map((inv) => renderMobileCard(inv))}
          {renderLoadMoreSentinel()}
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, py: 1.5, backgroundColor: '#f5f5f5' } }}>
                <TableCell padding="checkbox">
                  <Checkbox size="small" indeterminate={someSelected} checked={allSelected} onChange={handleSelectAll} />
                </TableCell>
                <TableCell>Tipas</TableCell>
                <TableCell>Serija-Numeris</TableCell>
                <TableCell>Statusas</TableCell>
                <TableCell>Pirkėjas</TableCell>
                <TableCell>Išrašymo data</TableCell>
                <TableCell>Mokėti iki</TableCell>
                <TableCell align="center">Suma</TableCell>
                <TableCell align="center">Eksp.</TableCell>
                {isApiProgram && (
                  <TableCell align="center" sx={{ width: 52 }}>
                    <Typography variant="caption" fontWeight={700}>{API_PROGRAM_LABEL[programKey]}</Typography>
                  </TableCell>
                )}
                <TableCell align="center" sx={{ width: 44 }}>
                  <MailOutlineIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                </TableCell>
                <TableCell align="left">Veiksmai</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id} hover sx={{ '& td': { py: 1.2 } }}>
                  <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                    {renderRowCheckbox(inv)}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      {TYPE_CONFIG[inv.invoice_type]?.label || inv.invoice_type}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {renderNumberLink(inv)}
                  </TableCell>
                  <TableCell>{renderStatusChip(inv)}</TableCell>
                  <TableCell>{inv.buyer_name || '—'}</TableCell>
                  <TableCell>{fmtDate(inv.invoice_date)}</TableCell>
                  <TableCell>
                    <Typography fontSize={13} color={isOverdue(inv) ? 'error.main' : 'text.primary'} fontWeight={isOverdue(inv) ? 600 : 400}>
                      {fmtDate(inv.due_date)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography fontWeight={700} fontSize={13}>
                      {fmtAmount(inv.pvm_tipas === 'taikoma' ? inv.amount_with_vat : inv.amount_wo_vat, inv.currency)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    {inv.exported ? (
                      <Tooltip title={inv.exported_at ? `Eksportuota: ${fmtDate((inv.exported_at || '').split('T')[0])}` : 'Eksportuota'}>
                        <Chip label="✓" size="small" color="success" variant="outlined" sx={{ minWidth: 32, fontSize: 12 }} />
                      </Tooltip>
                    ) : (
                      <Typography variant="caption" color="text.disabled">—</Typography>
                    )}
                  </TableCell>
                  {isApiProgram && (
                    <TableCell align="center" sx={{ width: 52, px: 0.5 }}>
                      {renderApiStatus(inv)}
                    </TableCell>
                  )}
                  <TableCell align="center" sx={{ width: 44, px: 0.5 }}>
                    {renderEmailIcon(inv)}
                  </TableCell>
                  <TableCell align="left">{renderRowActions(inv)}</TableCell>
                </TableRow>
              ))}
              {renderLoadMoreSentinel(tableColSpan, true)}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ── Invoice Preview Dialog ── */}
      <InvoicePreviewDialog
        open={!!previewInvoiceId}
        onClose={() => setPreviewInvoiceId(null)}
        invoiceId={previewInvoiceId}
        disableScrollLock
      />

      {/* ── Plan & History Dialog ── */}
      <Dialog
        open={planDialog.open}
        onClose={() => setPlanDialog({ open: false, recurringId: null, data: null, loading: false })}
        maxWidth="sm" fullWidth disableScrollLock
      >
        <DialogTitle>Siuntimo planas ir istorija</DialogTitle>
        <DialogContent>
          {planDialog.loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : planDialog.data ? (
            <Box>
              {planDialog.data.past?.length > 0 && (
                <>
                  <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>Istorija</Typography>
                  <Box sx={{ mb: 2 }}>
                    {planDialog.data.past.map((run, i) => (
                      <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5, borderBottom: '1px solid #f0f0f0' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" fontSize={13}>{fmtDate(run.date)}</Typography>
                          <Chip
                            label={run.status === 'success' ? 'Sėkminga' : run.status === 'failed' ? 'Nepavyko' : 'Vykdoma'}
                            color={run.status === 'success' ? 'success' : run.status === 'failed' ? 'error' : 'default'}
                            size="small" variant="outlined"
                            sx={{ fontSize: 11, height: 20 }}
                          />
                        </Box>
                        {run.invoice_id && (
                          <Typography
                            variant="body2" fontSize={12}
                            sx={{ color: palette.primary, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                            onClick={() => {
                              setPlanDialog((p) => ({ ...p, open: false }));
                              navigate(`/israsymas/${run.invoice_id}`);
                            }}
                          >
                            Peržiūrėti →
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Box>
                </>
              )}

              {planDialog.data.future?.length > 0 && (
                <>
                  <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>Būsimos sąskaitos</Typography>
                  <Box>
                    {planDialog.data.future.map((date, i) => (
                      <Box key={i} sx={{ py: 0.5, borderBottom: '1px solid #f0f0f0' }}>
                        <Typography variant="body2" fontSize={13}>{fmtDate(date)}</Typography>
                      </Box>
                    ))}
                  </Box>
                </>
              )}

              {!planDialog.data.past?.length && !planDialog.data.future?.length && (
                <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                  Nėra duomenų
                </Typography>
              )}
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlanDialog({ open: false, recurringId: null, data: null, loading: false })}>
            Uždaryti
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Mark Paid Dialog ── */}
      <MarkPaidDialog
        open={!!markPaidInvoice}
        onClose={() => setMarkPaidInvoice(null)}
        invoice={markPaidInvoice}
        onConfirm={handleMarkPaidConfirm}
      />

      {/* ── Payment Proof Dialog ── */}
      <PaymentProofDialog
        open={!!paymentProofInvoiceId}
        onClose={() => setPaymentProofInvoiceId(null)}
        invoiceId={paymentProofInvoiceId}
        onConfirmAllocation={handleConfirmAllocation}
        onRejectAllocation={handleRejectAllocation}
        onRemoveManualPayment={handleRemoveManualPayment}
        onRefresh={() => { loadInvoices(); loadSummary(); }}
      />

      {/* ── API Export Log Popup ── */}
      <ExportLogPopup
        open={apiErrorDialog.open}
        onClose={() => setApiErrorDialog({ open: false, invoice: null })}
        documentId={apiErrorDialog.invoice?.id}
        program={programKey}
      />

      {/* Confirm dialog */}
      <Dialog open={confirmDialog.open} onClose={closeConfirm} disableScrollLock>
        <DialogTitle>{confirmDialog.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{confirmDialog.text}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeConfirm}>Atšaukti</Button>
          <Button variant="contained" onClick={executeConfirm}>Patvirtinti</Button>
        </DialogActions>
      </Dialog>

      {/* ── Email History Popover ── */}
      <Popover
        open={Boolean(emailPopover.anchorEl)}
        anchorEl={emailPopover.anchorEl}
        onClose={() => setEmailPopover({ anchorEl: null, invoiceId: null, emails: [], loading: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        disableScrollLock
        slotProps={{ paper: { sx: { borderRadius: 2, minWidth: 320, maxWidth: 420 } } }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>El. laiškų siuntimo istorija</Typography>
          {emailPopover.loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>
          ) : emailPopover.emails.length === 0 ? (
            <Typography variant="body2" color="text.secondary">Nėra išsiųstų laiškų</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {emailPopover.emails.map((em) => (
                <Box key={em.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.75, borderBottom: '1px solid #f0f0f0' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontSize={13} fontWeight={600} noWrap>
                      {em.email_type_display}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {em.to_email}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, ml: 1 }}>
                    <Chip
                      label={
                        em.status === 'sent' && em.opened_at ? `Atidaryta (${em.open_count})`
                        : em.status === 'sent' ? 'Išsiųsta'
                        : em.status === 'pending' ? 'Laukiama'
                        : em.status === 'failed' ? 'Nepavyko'
                        : em.status === 'bounced' ? 'Atmesta'
                        : em.status
                      }
                      size="small"
                      color={
                        em.opened_at ? 'success'
                        : em.status === 'sent' ? 'primary'
                        : em.status === 'failed' || em.status === 'bounced' ? 'error'
                        : 'default'
                      }
                      variant="outlined"
                      sx={{ fontSize: 11, height: 22 }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                      {em.sent_at ? new Date(em.sent_at).toLocaleString('lt-LT', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Popover>

      {/* ── Email Type Choice Dialog ── */}
      <Dialog
        open={emailTypeDialog.open}
        onClose={() => setEmailTypeDialog({ open: false, invoiceId: null, email: '' })}
        maxWidth="xs" fullWidth disableScrollLock
      >
        <DialogTitle>Pasirinkite siuntimo būdą</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Button
              variant="outlined" fullWidth
              onClick={async () => {
                const { invoiceId, email } = emailTypeDialog;
                setEmailTypeDialog({ open: false, invoiceId: null, email: '' });
                setActionLoading(invoiceId);
                try {
                  const res = await api.post(`/invoicing/invoices/${invoiceId}/send-email/`, {
                    email, email_type: 'invoice_info', force: true,
                  }, { withCredentials: true });
                  const sd = res.data || {};
                  if (sd.inv_status === 'free' && sd.emails_used != null) {
                    if (sd.emails_used >= sd.emails_max) {
                      showSnack(`Išsiųsta. Pasiektas mėnesio limitas (${sd.emails_used}/${sd.emails_max}).`, 'warning');
                    } else if (sd.emails_used >= sd.emails_max * 0.5) {
                      showSnack(`Išsiųsta. Šį mėnesį išsiųsta ${sd.emails_used}/${sd.emails_max} sąskaitų el. paštu.`, 'info');
                    } else {
                      showSnack('El. laiškas išsiųstas');
                    }
                  } else {
                    showSnack('El. laiškas išsiųstas');
                  }
                  setInvoices((prev) => prev.map((i) => i.id === invoiceId ? { ...i, email_sent_count: (i.email_sent_count || 0) + 1, email_last_status: 'sent' } : i));
                } catch (e) {
                  if (e.response?.status === 403 && e.response?.data?.error === 'limit_reached') {
                    showSnack(e.response.data.message, 'error');
                  } else {
                    showSnack(e.response?.data?.detail || 'Nepavyko', 'error');
                  }
                } finally { setActionLoading(null); }
              }}
              sx={{ textTransform: 'none', justifyContent: 'flex-start', py: 1.5, px: 2 }}
            >
              <Box sx={{ textAlign: 'left' }}>
                <Typography fontWeight={600} fontSize={14}>Informacinė (tik PDF dokumentas)</Typography>
                <Typography variant="caption" color="text.secondary">Sąskaita bus išsiųsta kaip informacinis dokumentas</Typography>
              </Box>
            </Button>
            <Button
              variant="outlined" fullWidth
              onClick={async () => {
                const { invoiceId, email } = emailTypeDialog;
                setEmailTypeDialog({ open: false, invoiceId: null, email: '' });
                setActionLoading(invoiceId);
                try {
                  await api.post(`/invoicing/invoices/${invoiceId}/send-email/`, {
                    email, email_type: 'invoice_info', force: true,
                  }, { withCredentials: true });
                  showSnack('El. laiškas išsiųstas');
                  setInvoices((prev) => prev.map((i) => i.id === invoiceId ? { ...i, email_sent_count: (i.email_sent_count || 0) + 1, email_last_status: 'sent' } : i));
                } catch (e) { showSnack(e.response?.data?.detail || 'Nepavyko', 'error'); }
                finally { setActionLoading(null); }
              }}
              sx={{ textTransform: 'none', justifyContent: 'flex-start', py: 1.5, px: 2 }}
            >
              <Box sx={{ textAlign: 'left' }}>
                <Typography fontWeight={600} fontSize={14}>Informacinė (tik PDF dokumentas)</Typography>
                <Typography variant="caption" color="text.secondary">Sąskaita bus išsiųsta kaip informacinis dokumentas</Typography>
              </Box>
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailTypeDialog({ open: false, invoiceId: null, email: '' })}>
            Atšaukti
          </Button>
        </DialogActions>
      </Dialog>
      {/* Export starting popup */}
      <Dialog
        open={exportStarting}
        disableScrollLock
        PaperProps={{
          sx: { borderRadius: 3, px: 2, py: 1.5, minWidth: 280 },
        }}
      >
        <DialogContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2 }}>
          <CircularProgress size={24} sx={{ color: '#7c4dff' }} />
          <Typography variant="body2">
            Ruošiamas eksportas...
          </Typography>
        </DialogContent>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.severity} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default InvoiceListPage;



// import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
// import {
//   Box,
//   Paper,
//   Typography,
//   TextField,
//   Button,
//   IconButton,
//   Chip,
//   Table,
//   TableBody,
//   TableCell,
//   TableContainer,
//   TableHead,
//   TableRow,
//   MenuItem,
//   Tooltip,
//   CircularProgress,
//   Snackbar,
//   Alert,
//   Dialog,
//   DialogTitle,
//   DialogContent,
//   DialogContentText,
//   DialogActions,
//   Stack,
//   Grid2,
//   InputAdornment,
//   Checkbox,
//   LinearProgress,
//   useTheme,
//   useMediaQuery,
// } from '@mui/material';
// import {
//   Add as AddIcon,
//   Search as SearchIcon,
//   Send as SendIcon,
//   Paid as PaidIcon,
//   Cancel as CancelIcon,
//   ContentCopy as DuplicateIcon,
//   Receipt as PvmSfIcon,
//   Download as DownloadIcon,
//   Edit as EditIcon,
//   Delete as DeleteIcon,
//   FileDownload as ExportIcon,
//   Pause as PauseIcon,
//   PlayArrow as PlayArrowIcon,
//   CalendarMonth as CalendarMonthIcon,
// } from '@mui/icons-material';
// import LoopIcon from '@mui/icons-material/Loop';
// import DrawIcon from '@mui/icons-material/Draw';
// import DoNotDisturbIcon from '@mui/icons-material/DoNotDisturb';
// import { HiDocumentCheck } from 'react-icons/hi2';
// import { IoIosTimer } from 'react-icons/io';
// import { MdOutlinePaid } from 'react-icons/md';
// import { useNavigate } from 'react-router-dom';
// import { invoicingApi } from '../api/invoicingApi';
// import { api } from '../api/endpoints';
// import { ACCOUNTING_PROGRAMS } from '../page_elements/AccountingPrograms';
// import DateField from '../components/DateField';
// import { InvoicePreviewDialog, useInvoicePdf } from '../components/InvoicePreview';
// import MarkPaidDialog from '../components/MarkPaidDialog';
// import PaymentProofDialog from '../components/PaymentProofDialog';

// // ── Palette ──

// const palette = {
//   primary: '#1976d2',
//   border: '#e0e0e0',
// };

// const STATUS_CONFIG = {
//   draft:     { label: 'Juodraštis',  color: 'default' },
//   issued:    { label: 'Išrašyta',    color: 'info' },
//   sent:      { label: 'Išsiųsta',    color: 'primary' },
//   partially_paid:  { label: 'Dalinai apmokėta',  color: 'warning' },
//   paid:      { label: 'Apmokėta',    color: 'success' },
//   cancelled: { label: 'Atšaukta',    color: 'default' },
// };

// const RECURRING_STATUS = {
//   active:    { label: 'Aktyvi',       color: 'success' },
//   paused:    { label: 'Pristabdyta',  color: 'warning' },
//   finished:  { label: 'Baigta',       color: 'default' },
//   cancelled: { label: 'Atšaukta',     color: 'default' },
// };

// const TYPE_CONFIG = {
//   isankstine:   { label: 'Išankstinė SF' },
//   pvm_saskaita: { label: 'PVM SF' },
//   saskaita:     { label: 'SF' },
//   kreditine:    { label: 'Kreditinė SF' },
// };

// const fmtAmount = (val, currency = 'EUR') => {
//   if (val == null) return '—';
//   const n = parseFloat(val);
//   return `${n.toFixed(2).replace('.', ',')} ${currency === 'EUR' ? '€' : currency}`;
// };

// const fmtDate = (d) => {
//   if (!d) return '—';
//   const parts = d.split('-');
//   if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
//   return d;
// };

// const toInputDate = (d) => {
//   if (!d) return '';
//   return d instanceof Date ? d.toISOString().split('T')[0] : d;
// };

// const getDefaultDates = () => {
//   const now = new Date();
//   const ago = new Date(now);
//   ago.setDate(now.getDate() - 30);
//   return { date_from: toInputDate(ago), date_to: toInputDate(now) };
// };

// const fmtFrequency = (rec) => {
//   if (rec.first_day_of_month) return 'Kas pirma mėn. diena';
//   if (rec.last_day_of_month) return 'Kas paskutinė mėn. diena';
//   const labels = {
//     daily: { 1: 'Kasdien', default: (n) => `Kas ${n} d.` },
//     weekly: { 1: 'Kas savaitę', default: (n) => `Kas ${n} sav.` },
//     monthly: { 1: 'Kas mėnesį', default: (n) => `Kas ${n} mėn.` },
//     quarterly: { 1: 'Kas ketvirtį', default: (n) => `Kas ${n} ketv.` },
//     yearly: { 1: 'Kas metus', default: (n) => `Kas ${n} m.` },
//   };
//   const group = labels[rec.frequency];
//   if (!group) return rec.frequency;
//   if (rec.interval === 1) return group[1];
//   return group.default(rec.interval);
// };

// // ── Categories ──

// const MAIN_CATEGORIES = [
//   { key: 'israsytos',    label: 'Išrašytos',    Icon: HiDocumentCheck, iconColor: '#546e7a' },
//   { key: 'veluojancios', label: 'Vėluojančios', Icon: IoIosTimer,      iconColor: '#f9a825' },
//   { key: 'apmoketos',    label: 'Apmokėtos',    Icon: MdOutlinePaid,   iconColor: '#43a047' },
// ];

// // ══════════════════════════════════════════
// // Component
// // ══════════════════════════════════════════

// const InvoiceListPage = () => {
//   const navigate = useNavigate();
//   const theme = useTheme();
//   const isMobile = useMediaQuery(theme.breakpoints.down('md'));

//   const [invoices, setInvoices] = useState([]);
//   const [total, setTotal] = useState(0);
//   const [loading, setLoading] = useState(true);
//   const [loadingMore, setLoadingMore] = useState(false);
//   const [summary, setSummary] = useState(null);
//   const [user, setUser] = useState(null);

//   const [activeCategory, setActiveCategory] = useState('israsytos');
//   const [israsytosSubFilter, setIsrasytosSubFilter] = useState('');
//   const [exportedFilter, setExportedFilter] = useState('');

//   const defaultDates = useMemo(() => getDefaultDates(), []);
//   const [filters, setFilters] = useState({
//     invoice_type: '',
//     q: '',
//     date_from: defaultDates.date_from,
//     date_to: defaultDates.date_to,
//   });
//   const limit = 50;

//   // ── Infinite scroll refs ──
//   const offsetRef = useRef(0);
//   const hasMoreRef = useRef(true);
//   const abortRef = useRef(null);
//   const sentinelRef = useRef(null);
//   const observerRef = useRef(null);

//   const [selectedRows, setSelectedRows] = useState([]);
//   const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });
//   const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', text: '', onConfirm: null });
//   const [actionLoading, setActionLoading] = useState(null);
//   const [exportLoading, setExportLoading] = useState(false);

//   // ── Recurring ──
//   const [recurringInvoices, setRecurringInvoices] = useState([]);
//   const [recurringTotal, setRecurringTotal] = useState(0);
//   const [recurringLoading, setRecurringLoading] = useState(false);
//   const [planDialog, setPlanDialog] = useState({ open: false, recurringId: null, data: null, loading: false });

//   // ── Preview & PDF ──
//   const [previewInvoiceId, setPreviewInvoiceId] = useState(null);
//   const { downloadPdf, pdfLoading } = useInvoicePdf();

//   // ── Payment dialogs ──
//   const [markPaidInvoice, setMarkPaidInvoice] = useState(null);
//   const [paymentProofInvoiceId, setPaymentProofInvoiceId] = useState(null);

//   // ── Prevent body scroll-lock gap globally ──
//   useEffect(() => {
//     document.body.style.overflowY = 'scroll';
//     return () => { document.body.style.overflowY = ''; };
//   }, []);

//   // ── Cleanup abort on unmount ──
//   useEffect(() => {
//     return () => { if (abortRef.current) abortRef.current.abort(); };
//   }, []);

//   // ── User ──

//   useEffect(() => {
//     api.get('/profile/', { withCredentials: true })
//       .then((res) => setUser(res.data))
//       .catch(() => setUser(null));
//   }, []);

//   const programKey = user?.default_accounting_program || '';
//   const programLabel =
//     ACCOUNTING_PROGRAMS.find((p) => p.value === programKey)?.label || programKey || '...';

//   // ── Resolved backend params ──

//   const resolvedParams = useMemo(() => {
//     const p = {};
//     if (activeCategory === 'israsytos') {
//       p.category = 'israsytos';
//       if (israsytosSubFilter === 'sent') p.status = 'sent';
//       else if (israsytosSubFilter === 'not_sent') p.status = 'issued';
//     } else if (activeCategory === 'juodrasciai') {
//       p.category = 'juodrasciai';
//     } else if (activeCategory === 'cancelled') {
//       p.category = 'cancelled';
//     } else if (activeCategory && activeCategory !== 'periodines') {
//       p.category = activeCategory;
//     }
//     return p;
//   }, [activeCategory, israsytosSubFilter]);

//   // ── Build common params ──

//   const buildParams = useCallback((offset) => {
//     const params = { limit, offset, ...resolvedParams };
//     if (filters.invoice_type) params.invoice_type = filters.invoice_type;
//     if (filters.q) params.q = filters.q;
//     if (filters.date_from) params.date_from = filters.date_from;
//     if (filters.date_to) params.date_to = filters.date_to;
//     if (exportedFilter === 'exported') params.exported = 'true';
//     else if (exportedFilter === 'not_exported') params.exported = 'false';
//     return params;
//   }, [resolvedParams, filters, exportedFilter]);

//   // ── Load invoices (initial) ──

//   const loadInvoices = useCallback(async () => {
//     if (activeCategory === 'periodines') return;

//     // Abort previous request
//     if (abortRef.current) abortRef.current.abort();
//     const controller = new AbortController();
//     abortRef.current = controller;

//     setLoading(true);
//     offsetRef.current = 0;
//     hasMoreRef.current = true;

//     try {
//       const params = buildParams(0);
//       const { data } = await invoicingApi.getInvoices(params, { signal: controller.signal });
//       const results = data.results || [];
//       setInvoices(results);
//       setTotal(data.count || 0);
//       offsetRef.current = results.length;
//       hasMoreRef.current = results.length < (data.count || 0);
//     } catch (e) {
//       if (e.name === 'AbortError' || e.name === 'CanceledError') return;
//       setSnack({ open: true, msg: 'Nepavyko įkelti sąskaitų', severity: 'error' });
//     } finally {
//       if (!controller.signal.aborted) setLoading(false);
//     }
//   }, [buildParams, activeCategory]);

//   // ── Load more invoices (infinite scroll) ──

//   const loadMoreInvoices = useCallback(async () => {
//     if (!hasMoreRef.current || loadingMore || loading) return;

//     setLoadingMore(true);
//     try {
//       const params = buildParams(offsetRef.current);
//       const { data } = await invoicingApi.getInvoices(params);
//       const results = data.results || [];
//       setInvoices((prev) => [...prev, ...results]);
//       offsetRef.current += results.length;
//       hasMoreRef.current = offsetRef.current < (data.count || 0);
//     } catch (e) {
//       if (e.name === 'AbortError' || e.name === 'CanceledError') return;
//       // Silently fail — don't block UI
//     } finally {
//       setLoadingMore(false);
//     }
//   }, [buildParams, loadingMore, loading]);

//   // ── Load recurring (initial) ──

//   const loadRecurringInvoices = useCallback(async () => {
//     if (abortRef.current) abortRef.current.abort();
//     const controller = new AbortController();
//     abortRef.current = controller;

//     setRecurringLoading(true);
//     offsetRef.current = 0;
//     hasMoreRef.current = true;

//     try {
//       const params = { limit, offset: 0 };
//       if (filters.q) params.search = filters.q;
//       const { data } = await invoicingApi.getRecurringInvoices(params, { signal: controller.signal });
//       const results = data.results || data || [];
//       setRecurringInvoices(results);
//       setRecurringTotal(data.count || results.length);
//       offsetRef.current = results.length;
//       hasMoreRef.current = results.length < (data.count || results.length);
//     } catch (e) {
//       if (e.name === 'AbortError' || e.name === 'CanceledError') return;
//       setSnack({ open: true, msg: 'Nepavyko įkelti periodinių sąskaitų', severity: 'error' });
//     } finally {
//       if (!controller.signal.aborted) setRecurringLoading(false);
//     }
//   }, [filters.q]);

//   // ── Load more recurring (infinite scroll) ──

//   const loadMoreRecurring = useCallback(async () => {
//     if (!hasMoreRef.current || loadingMore || recurringLoading) return;

//     setLoadingMore(true);
//     try {
//       const params = { limit, offset: offsetRef.current };
//       if (filters.q) params.search = filters.q;
//       const { data } = await invoicingApi.getRecurringInvoices(params);
//       const results = data.results || data || [];
//       setRecurringInvoices((prev) => [...prev, ...results]);
//       offsetRef.current += results.length;
//       hasMoreRef.current = offsetRef.current < (data.count || 0);
//     } catch {
//       // Silently fail
//     } finally {
//       setLoadingMore(false);
//     }
//   }, [filters.q, loadingMore, recurringLoading]);

//   const loadSummary = async () => {
//     try {
//       const { data } = await invoicingApi.getSummary();
//       setSummary(data);
//     } catch { /* ok */ }
//   };

//   // ── Effects ──

//   useEffect(() => {
//     if (activeCategory === 'periodines') loadRecurringInvoices();
//     else loadInvoices();
//   }, [activeCategory, loadInvoices, loadRecurringInvoices]);

//   useEffect(() => { loadSummary(); }, []);
//   useEffect(() => { setSelectedRows([]); }, [activeCategory, israsytosSubFilter, filters, exportedFilter]);
//   useEffect(() => { if (activeCategory !== 'israsytos') setIsrasytosSubFilter(''); }, [activeCategory]);
//   useEffect(() => { if (['juodrasciai', 'cancelled', 'periodines'].includes(activeCategory)) setExportedFilter(''); }, [activeCategory]);

//   // ── IntersectionObserver for infinite scroll ──

//   useEffect(() => {
//     if (observerRef.current) observerRef.current.disconnect();

//     observerRef.current = new IntersectionObserver(
//       (entries) => {
//         if (entries[0].isIntersecting && hasMoreRef.current && !loadingMore && !loading) {
//           if (activeCategory === 'periodines') loadMoreRecurring();
//           else loadMoreInvoices();
//         }
//       },
//       { rootMargin: '300px' },
//     );

//     if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);
//     return () => observerRef.current?.disconnect();
//   }, [loadMoreInvoices, loadMoreRecurring, loadingMore, loading, activeCategory]);

//   // ── Handlers ──

//   const updateFilter = (field, value) => {
//     setFilters((prev) => ({ ...prev, [field]: value }));
//   };

//   const handleCategoryClick = (key) => {
//     setActiveCategory(key);
//     setFilters((prev) => ({ ...prev, invoice_type: '' }));
//   };

//   const handleTextCategoryClick = (key) => {
//     setActiveCategory(key);
//   };

//   const handleSubFilterClick = (sub) => {
//     setIsrasytosSubFilter((prev) => (prev === sub ? '' : sub));
//   };

//   const handleExportedFilterClick = (val) => {
//     setExportedFilter((prev) => (prev === val ? '' : val));
//   };

//   // ── Checkbox ──

//   const isRowExportable = (inv) => {
//     if (!['issued', 'sent', 'paid', 'partially_paid'].includes(inv.status)) return false;
//     if (inv.invoice_type === 'kreditine') return false;
//     return true;
//   };
//   const isIsankstine = (inv) => inv.invoice_type === 'isankstine';
//   const canBeChecked = (inv) => isRowExportable(inv) && !isIsankstine(inv);

//   const exportableRows = useMemo(() => invoices.filter(canBeChecked), [invoices]);
//   const exportableIds = useMemo(() => exportableRows.map((r) => String(r.id)), [exportableRows]);

//   const allSelected = exportableIds.length > 0 && exportableIds.every((id) => selectedRows.includes(id));
//   const someSelected = exportableIds.some((id) => selectedRows.includes(id)) && !allSelected;

//   const handleSelectRow = (id) => {
//     const sid = String(id);
//     setSelectedRows((prev) => prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]);
//   };
//   const handleSelectAll = () => { allSelected ? setSelectedRows([]) : setSelectedRows(exportableIds); };

//   const selectedExportCount = selectedRows.filter((id) => exportableIds.includes(id)).length;

//   // ── Export ──

//   const handleExport = async () => {
//     if (selectedExportCount === 0) {
//       setSnack({ open: true, msg: 'Pasirinkite bent vieną sąskaitą eksportui', severity: 'warning' });
//       return;
//     }
//     if (!programKey) {
//       setSnack({ open: true, msg: 'Pasirinkite buhalterinę programą nustatymuose', severity: 'warning' });
//       return;
//     }
//     setExportLoading(true);
//     try {
//       const payload = { ids: selectedRows.map(Number).filter(Number.isFinite), source: 'invoice', export_type: programKey };
//       const res = await api.post('/documents/export_xml/', payload, { withCredentials: true, responseType: 'blob' });

//       let filename = '';
//       const cd = res.headers?.['content-disposition'];
//       if (cd) { const m = cd.match(/filename="?([^"]+)"?/); if (m) filename = m[1]; }
//       if (!filename) filename = 'eksportas.zip';

//       const blob = new Blob([res.data], { type: res.headers?.['content-type'] || 'application/octet-stream' });
//       const url = window.URL.createObjectURL(blob);
//       const link = document.createElement('a');
//       link.href = url;
//       link.setAttribute('download', filename);
//       document.body.appendChild(link);
//       link.click();
//       link.remove();
//       window.URL.revokeObjectURL(url);

//       setSelectedRows([]);
//       setSnack({ open: true, msg: 'Eksportas sėkmingas', severity: 'success' });
//       loadInvoices();
//       loadSummary();
//     } catch (err) {
//       console.error(err);
//       if (err?.response?.data instanceof Blob) {
//         try {
//           const text = await err.response.data.text();
//           const json = JSON.parse(text);
//           setSnack({ open: true, msg: json.error || json.detail || 'Eksportas nepavyko', severity: 'error' });
//         } catch { setSnack({ open: true, msg: 'Eksportas nepavyko', severity: 'error' }); }
//       } else {
//         setSnack({ open: true, msg: err?.response?.data?.error || err?.message || 'Eksportas nepavyko', severity: 'error' });
//       }
//     } finally {
//       setExportLoading(false);
//     }
//   };

//   // ── Actions ──

//   const showSnack = (msg, severity = 'success') => setSnack({ open: true, msg, severity });

//   const openConfirm = (title, text, onConfirm) => {
//     setConfirmDialog({ open: true, title, text, onConfirm });
//   };

//   const closeConfirm = () => {
//     setConfirmDialog({ open: false, title: '', text: '', onConfirm: null });
//   };

//   const executeConfirm = async () => {
//     const fn = confirmDialog.onConfirm;
//     closeConfirm();
//     if (fn) await fn();
//   };

//   const handleAction = async (action, invoice) => {
//     if (action === 'duplicate') {
//       navigate(`/israsymas/nauja?from=${invoice.id}`);
//       return;
//     }

//     setActionLoading(invoice.id);
//     try {
//       switch (action) {
//         case 'issue':    await invoicingApi.issueInvoice(invoice.id); showSnack(`Sąskaita ${invoice.full_number || ''} išrašyta`); break;
//         case 'send':     await invoicingApi.sendInvoice(invoice.id); showSnack('Sąskaita išsiųsta'); break;
//         case 'cancel':   await invoicingApi.cancelInvoice(invoice.id); showSnack('Sąskaita atšaukta'); break;
//         case 'create_pvm_sf': await invoicingApi.createPvmSf(invoice.id); showSnack('SF sukurta'); break;
//         case 'delete':   await invoicingApi.deleteInvoice(invoice.id); showSnack('Sąskaita ištrinta'); break;
//         default: break;
//       }
//       loadInvoices();
//       loadSummary();
//     } catch (e) {
//       const msg = e.response?.data?.detail
//         || (typeof e.response?.data === 'object' ? Object.values(e.response.data).flat().join(', ') : '')
//         || 'Klaida';
//       showSnack(msg, 'error');
//     } finally {
//       setActionLoading(null);
//     }
//   };

//   // ── Recurring actions ──

//   const openPlanDialog = async (recurringId) => {
//     setPlanDialog({ open: true, recurringId, data: null, loading: true });
//     try {
//       const { data } = await invoicingApi.getRecurringPlanHistory(recurringId);
//       setPlanDialog((p) => ({ ...p, data, loading: false }));
//     } catch {
//       setPlanDialog((p) => ({ ...p, loading: false }));
//       showSnack('Nepavyko įkelti plano', 'error');
//     }
//   };

//   const handleRecurringAction = async (action, recurring) => {
//     setActionLoading(recurring.id);
//     try {
//       switch (action) {
//         case 'pause': await invoicingApi.pauseRecurring(recurring.id); showSnack('Periodinė sąskaita pristabdyta'); break;
//         case 'resume': await invoicingApi.resumeRecurring(recurring.id); showSnack('Periodinė sąskaita tęsiama'); break;
//         case 'cancel': await invoicingApi.cancelRecurring(recurring.id); showSnack('Periodinė sąskaita atšaukta'); break;
//         default: break;
//       }
//       loadRecurringInvoices();
//     } catch (e) {
//       showSnack(e.response?.data?.detail || 'Klaida', 'error');
//     } finally {
//       setActionLoading(null);
//     }
//   };

//   // ── PDF download handler ──

//   const handlePdfDownload = async (inv) => {
//     try {
//       await downloadPdf(inv.id, `${inv.full_number || inv.id}.pdf`);
//     } catch {
//       showSnack('Nepavyko atsisiųsti PDF', 'error');
//     }
//   };

//   // ── Payment handlers ──

//   const handleMarkPaidConfirm = async (data) => {
//     try {
//       const res = await invoicingApi.markPaid(markPaidInvoice.id, data);
//       showSnack('Pažymėta kaip apmokėta');
//       if (res.data?.auto_created_sf) {
//         showSnack(
//           `Automatiškai sukurta ${res.data.auto_created_sf.full_number}`,
//           'info'
//         );
//       }
//       loadInvoices();
//       loadSummary();
//     } catch (e) {
//       showSnack(e.response?.data?.detail || 'Klaida', 'error');
//       throw e;
//     }
//   };

//   const handleConfirmAllocation = async (allocId) => {
//     try {
//       await invoicingApi.confirmAllocation(allocId);
//       showSnack('Mokėjimas patvirtintas');
//       loadInvoices();
//       loadSummary();
//     } catch {
//       showSnack('Nepavyko patvirtinti', 'error');
//     }
//   };

//   const handleRejectAllocation = async (allocId) => {
//     try {
//       await invoicingApi.rejectAllocation(allocId);
//       showSnack('Mokėjimas atmestas');
//       loadInvoices();
//       loadSummary();
//     } catch {
//       showSnack('Nepavyko atmesti', 'error');
//     }
//   };

//   const handleRemoveManualPayment = async (allocId) => {
//     try {
//       await invoicingApi.removeManualPayment(paymentProofInvoiceId, allocId);
//       showSnack('Rankinis pažymėjimas pašalintas');
//       loadInvoices();
//       loadSummary();
//     } catch {
//       showSnack('Nepavyko pašalinti', 'error');
//     }
//   };

//   // ══════════════════════════════════════════
//   // Sub-components
//   // ══════════════════════════════════════════

//   // ── Category cards ──

//   const CategoryCards = () => {
//     if (!summary) return null;

//     const extraCategories = [
//       { key: 'periodines', label: 'Periodinės', Icon: LoopIcon },
//       { key: 'juodrasciai', label: 'Juodraščiai', Icon: DrawIcon },
//       { key: 'cancelled', label: 'Anuliuotos', Icon: DoNotDisturbIcon },
//     ];

//     const categoryTheme = {
//       israsytos: {
//         activeBorder: '#1976d2',
//         activeBg: 'linear-gradient(180deg, #f2f7ff 0%, #e8f1ff 100%)',
//         iconBg: 'rgba(25,118,210,0.10)',
//         mutedIconBg: '#eef3f8',
//       },
//       veluojancios: {
//         activeBorder: '#d32f2f',
//         activeBg: 'linear-gradient(180deg, #fff5f5 0%, #ffeaea 100%)',
//         iconBg: 'rgba(211,47,47,0.10)',
//         mutedIconBg: '#f6f1ef',
//       },
//       apmoketos: {
//         activeBorder: '#2e7d32',
//         activeBg: 'linear-gradient(180deg, #f3fbf4 0%, #e8f6ea 100%)',
//         iconBg: 'rgba(46,125,50,0.10)',
//         mutedIconBg: '#eef6ef',
//       },
//     };

//     return (
//       <Box sx={{ mb: 2.5 }}>
//         <Grid2 container spacing={2} sx={{ mb: 1.5 }}>
//           {MAIN_CATEGORIES.map(({ key, label, Icon, iconColor }) => {
//             const s = summary[key] || { count: 0, total: '0.00' };
//             const active = activeCategory === key;
//             const hasAmount = parseFloat(s.total) > 0;
//             const isIsrasytos = key === 'israsytos';
//             const themeCfg = categoryTheme[key];

//             return (
//               <Grid2 size={{ xs: 12, md: 4 }} key={key}>
//                 <Paper
//                   variant="outlined"
//                   onClick={() => handleCategoryClick(key)}
//                   sx={{
//                     minHeight: 152,
//                     p: 2.25,
//                     borderRadius: 3,
//                     cursor: 'pointer',
//                     userSelect: 'none',
//                     borderColor: active ? themeCfg.activeBorder : '#e5e7eb',
//                     borderWidth: active ? 2 : 1,
//                     background: active ? themeCfg.activeBg : '#fff',
//                     boxShadow: active
//                       ? '0 6px 18px rgba(15,23,42,0.06)'
//                       : '0 1px 6px rgba(15,23,42,0.03)',
//                     transition:
//                       'border-color 0.12s ease, background-color 0.12s ease, box-shadow 0.12s ease',
//                     '&:hover': {
//                       borderColor: active ? themeCfg.activeBorder : '#cfd8e3',
//                       boxShadow: '0 4px 14px rgba(15,23,42,0.05)',
//                     },
//                   }}
//                 >
//                   <Box
//                     sx={{
//                       display: 'flex',
//                       alignItems: 'center',
//                       gap: 1.5,
//                       mb: 2.25,
//                     }}
//                   >
//                     <Box
//                       sx={{
//                         width: 52,
//                         height: 52,
//                         borderRadius: '50%',
//                         display: 'flex',
//                         alignItems: 'center',
//                         justifyContent: 'center',
//                         backgroundColor: active ? themeCfg.iconBg : themeCfg.mutedIconBg,
//                         flexShrink: 0,
//                       }}
//                     >
//                       <Icon size={22} color={iconColor} />
//                     </Box>

//                     <Box sx={{ minWidth: 0 }}>
//                       <Box
//                         sx={{
//                           display: 'flex',
//                           alignItems: 'baseline',
//                           gap: 1,
//                           flexWrap: 'wrap',
//                           mb: 0.3,
//                         }}
//                       >
//                         <Typography
//                           sx={{
//                             fontSize: 34,
//                             lineHeight: 1,
//                             fontWeight: 800,
//                             color: '#111827',
//                           }}
//                         >
//                           {s.count}
//                         </Typography>

//                         {hasAmount && (
//                           <Typography
//                             sx={{
//                               fontSize: 14,
//                               color: 'text.secondary',
//                               whiteSpace: 'nowrap',
//                               fontWeight: 500,
//                             }}
//                           >
//                             {fmtAmount(s.total)}
//                           </Typography>
//                         )}
//                       </Box>

//                       <Typography
//                         sx={{
//                           fontSize: 14,
//                           lineHeight: 1.25,
//                           color: 'text.secondary',
//                           fontWeight: active ? 700 : 500,
//                         }}
//                       >
//                         {label}
//                       </Typography>
//                     </Box>
//                   </Box>

//                   <Box
//                     sx={{
//                       minHeight: 34,
//                       display: 'flex',
//                       alignItems: 'center',
//                       gap: 0.75,
//                       flexWrap: 'wrap',
//                     }}
//                     onClick={(e) => {
//                       if (isIsrasytos) e.stopPropagation();
//                     }}
//                   >
//                     {isIsrasytos ? (
//                       <>
//                         <Chip
//                           label="Išsiųstos"
//                           size="small"
//                           clickable
//                           variant={israsytosSubFilter === 'sent' ? 'filled' : 'outlined'}
//                           color={israsytosSubFilter === 'sent' ? 'primary' : 'default'}
//                           onClick={(e) => {
//                             e.stopPropagation();
//                             if (activeCategory !== 'israsytos') setActiveCategory('israsytos');
//                             handleSubFilterClick('sent');
//                           }}
//                           sx={{
//                             height: 28,
//                             borderRadius: 2,
//                             fontWeight: 600,
//                             px: 0.5,
//                             backgroundColor:
//                               israsytosSubFilter === 'sent'
//                                 ? undefined
//                                 : active
//                                 ? '#ffffff'
//                                 : undefined,
//                           }}
//                         />
//                         <Chip
//                           label="Neišsiųstos"
//                           size="small"
//                           clickable
//                           variant={israsytosSubFilter === 'not_sent' ? 'filled' : 'outlined'}
//                           color={israsytosSubFilter === 'not_sent' ? 'primary' : 'default'}
//                           onClick={(e) => {
//                             e.stopPropagation();
//                             if (activeCategory !== 'israsytos') setActiveCategory('israsytos');
//                             handleSubFilterClick('not_sent');
//                           }}
//                           sx={{
//                             height: 28,
//                             borderRadius: 2,
//                             fontWeight: 600,
//                             px: 0.5,
//                             backgroundColor:
//                               israsytosSubFilter === 'not_sent'
//                                 ? undefined
//                                 : active
//                                 ? '#ffffff'
//                                 : undefined,
//                           }}
//                         />
//                       </>
//                     ) : (
//                       <Typography
//                         variant="caption"
//                         sx={{
//                           color: 'text.secondary',
//                           fontSize: 12,
//                         }}
//                       >
//                         Peržiūrėti kategoriją
//                       </Typography>
//                     )}
//                   </Box>
//                 </Paper>
//               </Grid2>
//             );
//           })}
//         </Grid2>

//         <Box
//           sx={{
//             display: 'flex',
//             flexWrap: 'wrap',
//             gap: 1,
//             alignItems: 'center',
//           }}
//         >
//           {extraCategories.map(({ key, label, Icon }) => {
//             const active = activeCategory === key;

//             return (
//               <Chip
//                 key={key}
//                 icon={<Icon sx={{ fontSize: '18px !important' }} />}
//                 label={label}
//                 clickable
//                 onClick={() => handleTextCategoryClick(key)}
//                 variant={active ? 'filled' : 'outlined'}
//                 color={active ? 'primary' : 'default'}
//                 sx={{
//                   height: 34,
//                   borderRadius: 2,
//                   fontWeight: active ? 700 : 500,
//                   px: 0.5,
//                 }}
//               />
//             );
//           })}
//         </Box>
//       </Box>
//     );
//   };

//   // ── Export button helpers ──

//   const exportDisabledReason = useMemo(() => {
//     if (!user) return 'Kraunama...';
//     if (!programKey) return 'Pirmiausia pasirinkite buhalterinę programą nustatymuose';
//     if (selectedExportCount === 0) return 'Pažymėkite bent vieną sąskaitą eksportui';
//     return '';
//   }, [user, programKey, selectedExportCount]);
//   const exportDisabled = Boolean(exportDisabledReason);
//   const showExportedFilter = ['israsytos', 'veluojancios', 'apmoketos'].includes(activeCategory);

//   // ── RowActions (normal invoices) ──

//   const RowActions = ({ inv }) => {
//     const isLoading = actionLoading === inv.id;
//     if (isLoading) return <CircularProgress size={20} />;

//     const cat = activeCategory;
//     const notReady = () => showSnack('Funkcija ruošiama', 'info');
//     const a = [];

//     if (cat === 'juodrasciai') {
//       a.push('edit', 'duplicate', 'delete');
//     } else if (cat === 'cancelled') {
//       a.push('duplicate', 'pdf');
//     } else if (cat === 'israsytos') {
//       a.push('edit');
//       if (inv.can_create_pvm_sf) a.push('convert_sf');
//       if (inv.status === 'issued') a.push('send_email');
//       a.push('mark_paid', 'duplicate', 'pdf', 'cancel');
//     } else if (cat === 'veluojancios') {
//       a.push('edit');
//       if (inv.can_create_pvm_sf) a.push('convert_sf');
//       a.push('send_reminder', 'mark_paid', 'duplicate', 'pdf', 'cancel');
//     } else if (cat === 'apmoketos') {
//       a.push('edit');
//       if (inv.can_create_pvm_sf) a.push('convert_sf');
//       a.push('duplicate', 'pdf', 'cancel');
//     } else {
//       if (inv.status === 'draft') {
//         a.push('edit');
//         if (inv.can_create_pvm_sf) a.push('convert_sf');
//         a.push('duplicate', 'delete');
//       } else if (['issued', 'sent'].includes(inv.status)) {
//         a.push('edit');
//         if (inv.can_create_pvm_sf) a.push('convert_sf');
//         if (inv.status === 'issued') a.push('send_email');
//         a.push('mark_paid', 'duplicate', 'pdf', 'cancel');
//       } else if (inv.status === 'paid') {
//         a.push('edit');
//         if (inv.can_create_pvm_sf) a.push('convert_sf');
//         a.push('duplicate', 'pdf', 'cancel');
//       } else if (inv.status === 'cancelled') {
//         a.push('duplicate', 'pdf');
//       }
//     }

//     const invoiceId = inv.id;

//     const buttons = {
//       convert_sf: (
//         <Tooltip title="Konvertuoti į SF" key="convert_sf">
//           <IconButton size="small" color="secondary" onClick={() => handleAction('create_pvm_sf', inv)}>
//             <PvmSfIcon fontSize="small" />
//           </IconButton>
//         </Tooltip>
//       ),
//       send_email: (
//         <Tooltip title="Siųsti el. paštu" key="send_email">
//           <IconButton size="small" color="primary" onClick={notReady}>
//             <SendIcon fontSize="small" />
//           </IconButton>
//         </Tooltip>
//       ),
//       send_reminder: (
//         <Tooltip title="Siųsti priminimą" key="send_reminder">
//           <IconButton size="small" color="warning" onClick={notReady}>
//             <SendIcon fontSize="small" />
//           </IconButton>
//         </Tooltip>
//       ),
//       mark_paid: (
//         <Tooltip title="Pažymėti apmokėta" key="mark_paid">
//           <IconButton size="small" color="success" onClick={() => setMarkPaidInvoice(inv)}>
//             <PaidIcon fontSize="small" />
//           </IconButton>
//         </Tooltip>
//       ),
//       edit: (
//         <Tooltip title="Redaguoti" key="edit">
//           <IconButton size="small" onClick={() => navigate(`/israsymas/${inv.id}`)}>
//             <EditIcon fontSize="small" />
//           </IconButton>
//         </Tooltip>
//       ),
//       duplicate: (
//         <Tooltip title="Kopijuoti" key="duplicate">
//           <IconButton size="small" onClick={() => navigate(`/israsymas/nauja?from=${inv.id}`)}>
//             <DuplicateIcon fontSize="small" />
//           </IconButton>
//         </Tooltip>
//       ),
//       pdf: (
//         <Tooltip title="Parsisiųsti PDF" key="pdf">
//           <IconButton size="small" onClick={() => handlePdfDownload(inv)} disabled={pdfLoading}>
//             {pdfLoading ? <CircularProgress size={16} /> : <DownloadIcon fontSize="small" />}
//           </IconButton>
//         </Tooltip>
//       ),
//       cancel: (
//         <Tooltip title="Anuliuoti" key="cancel">
//           <IconButton size="small" color="error"
//             onClick={() => openConfirm(
//               'Anuliuoti sąskaitą?',
//               `${inv.full_number || 'Sąskaita'} bus anuliuota.`,
//               () => handleAction('cancel', { id: invoiceId }),
//             )}>
//             <CancelIcon fontSize="small" />
//           </IconButton>
//         </Tooltip>
//       ),
//       delete: (
//         <Tooltip title="Ištrinti" key="delete">
//           <IconButton size="small" color="error"
//             onClick={() => openConfirm(
//               'Ištrinti juodraštį?',
//               'Veiksmo anuliuoti nebus galima.',
//               () => handleAction('delete', { id: invoiceId }),
//             )}>
//             <DeleteIcon fontSize="small" />
//           </IconButton>
//         </Tooltip>
//       ),
//     };

//     return (
//       <Stack direction="row" spacing={0.25} sx={{ flexWrap: 'nowrap' }}>
//         {a.map((key) => buttons[key])}
//       </Stack>
//     );
//   };

//   // ── RecurringRowActions ──

//   const RecurringRowActions = ({ rec }) => {
//     const isLoading = actionLoading === rec.id;
//     if (isLoading) return <CircularProgress size={20} />;

//     return (
//       <Stack direction="row" spacing={0.25} sx={{ flexWrap: 'nowrap' }}>
//         <Tooltip title="Planas ir istorija">
//           <IconButton size="small" onClick={() => openPlanDialog(rec.id)}>
//             <CalendarMonthIcon fontSize="small" />
//           </IconButton>
//         </Tooltip>
//         {['active', 'paused'].includes(rec.status) && (
//           <Tooltip title="Redaguoti">
//             <IconButton size="small" onClick={() => navigate(`/israsymas/nauja?recurring=${rec.id}`)}>
//               <EditIcon fontSize="small" />
//             </IconButton>
//           </Tooltip>
//         )}
//         <Tooltip title="Kopijuoti">
//           <IconButton size="small" onClick={() => navigate(`/israsymas/nauja?recurring_from=${rec.id}`)}>
//             <DuplicateIcon fontSize="small" />
//           </IconButton>
//         </Tooltip>
//         {rec.status === 'active' && (
//           <Tooltip title="Pristabdyti">
//             <IconButton size="small" color="warning" onClick={() => handleRecurringAction('pause', rec)}>
//               <PauseIcon fontSize="small" />
//             </IconButton>
//           </Tooltip>
//         )}
//         {rec.status === 'paused' && (
//           <Tooltip title="Tęsti">
//             <IconButton size="small" color="success" onClick={() => handleRecurringAction('resume', rec)}>
//               <PlayArrowIcon fontSize="small" />
//             </IconButton>
//           </Tooltip>
//         )}
//         {['active', 'paused'].includes(rec.status) && (
//           <Tooltip title="Atšaukti">
//             <IconButton size="small" color="error"
//               onClick={() => openConfirm(
//                 'Atšaukti periodinę sąskaitą?',
//                 'Naujos sąskaitos nebebus kuriamos.',
//                 () => handleRecurringAction('cancel', rec),
//               )}>
//               <CancelIcon fontSize="small" />
//             </IconButton>
//           </Tooltip>
//         )}
//       </Stack>
//     );
//   };

//   // ── Row helpers ──

//   const RowCheckbox = ({ inv }) => {
//     const exportable = canBeChecked(inv);
//     const isIsankt = isIsankstine(inv);
//     const checked = exportable && selectedRows.includes(String(inv.id));

//     if (isIsankt && isRowExportable(inv)) {
//       return (
//         <Tooltip title="Konvertuokite į PVM sąskaitą, tada eksportuokite" arrow>
//           <span><Checkbox size="small" disabled checked={false} /></span>
//         </Tooltip>
//       );
//     }
//     if (!isRowExportable(inv)) return <Checkbox size="small" disabled checked={false} />;
//     return <Checkbox size="small" checked={checked} onChange={() => handleSelectRow(inv.id)} />;
//   };

//   const isOverdue = (inv) => {
//     if (inv.is_overdue) return true;
//     if (!['issued', 'sent'].includes(inv.status) || !inv.due_date) return false;
//     return inv.due_date < new Date().toISOString().split('T')[0];
//   };

//   const StatusChip = ({ inv }) => {
//     if (isOverdue(inv) && !['paid', 'partially_paid'].includes(inv.status)) {
//       return <Chip label="Vėluojanti" color="error" size="small" variant="outlined" />;
//     }

//     if (inv.status === 'paid') {
//       return (
//         <Chip
//           label="Apmokėta"
//           color="success"
//           size="small"
//           variant="outlined"
//           onClick={(e) => { e.stopPropagation(); setPaymentProofInvoiceId(inv.id); }}
//           sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'rgba(76,175,80,0.08)' } }}
//         />
//       );
//     }

//     if (inv.status === 'partially_paid') {
//       const paid = parseFloat(inv.paid_amount || 0);
//       const totalAmt = parseFloat(inv.amount_with_vat || 0);
//       return (
//         <Chip
//           label={`Dalinai ${paid.toFixed(0)}/${totalAmt.toFixed(0)} €`}
//           color="warning"
//           size="small"
//           variant="outlined"
//           onClick={(e) => { e.stopPropagation(); setPaymentProofInvoiceId(inv.id); }}
//           sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'rgba(237,108,2,0.08)' } }}
//         />
//       );
//     }

//     if (inv.has_proposed_payments) {
//       return (
//         <Chip
//           label="Laukia patvirtinimo"
//           color="info"
//           size="small"
//           variant="outlined"
//           onClick={(e) => { e.stopPropagation(); setPaymentProofInvoiceId(inv.id); }}
//           sx={{
//             cursor: 'pointer',
//             animation: 'pulse 2s ease-in-out infinite',
//             '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
//           }}
//         />
//       );
//     }

//     return (
//       <Chip
//         label={STATUS_CONFIG[inv.status]?.label || inv.status}
//         color={STATUS_CONFIG[inv.status]?.color || 'default'}
//         size="small"
//         variant="outlined"
//       />
//     );
//   };

//   const NumberLink = ({ inv }) => {
//     const isDraft = inv.status === 'draft';
//     const display = inv.full_number || '—';

//     if (isDraft) {
//       return (
//         <Typography
//           fontWeight={700} fontSize={13}
//           sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
//           onClick={() => navigate(`/israsymas/${inv.id}`)}
//         >
//           {display}
//         </Typography>
//       );
//     }

//     return (
//       <Typography
//         fontWeight={700} fontSize={13}
//         sx={{
//           color: palette.primary,
//           cursor: 'pointer',
//           '&:hover': { textDecoration: 'underline' },
//         }}
//         onClick={(e) => {
//           e.stopPropagation();
//           setPreviewInvoiceId(inv.id);
//         }}
//       >
//         {display}
//       </Typography>
//     );
//   };

//   // ── Mobile card ──

//   const MobileCard = ({ inv }) => (
//     <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 1 }}>
//       <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
//         <RowCheckbox inv={inv} />
//         <Box sx={{ flex: 1 }}>
//           <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
//             <Box>
//               <NumberLink inv={inv} />
//               <Typography variant="caption" color="text.secondary">{TYPE_CONFIG[inv.invoice_type]?.label}</Typography>
//             </Box>
//             <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
//               {inv.exported && <Chip label="Eksp." size="small" color="secondary" variant="outlined" sx={{ fontSize: 10, height: 20 }} />}
//               <StatusChip inv={inv} />
//             </Box>
//           </Box>
//           <Typography variant="body2">{inv.buyer_name || '—'}</Typography>
//           <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
//             <Typography variant="body2" color="text.secondary">{fmtDate(inv.invoice_date)}</Typography>
//             <Typography fontWeight={700}>{fmtAmount(inv.amount_with_vat || inv.amount_wo_vat, inv.currency)}</Typography>
//           </Box>
//           <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end' }}><RowActions inv={inv} /></Box>
//         </Box>
//       </Box>
//     </Paper>
//   );

//   // ── Sentinel component ──

//   const LoadMoreSentinel = ({ colSpan, isTable = false }) => {
//     if (isTable) {
//       return (
//         <>
//           <TableRow ref={sentinelRef}>
//             <TableCell colSpan={colSpan} sx={{ p: 0, border: 0, height: 1 }} />
//           </TableRow>
//           {loadingMore && (
//             <TableRow>
//               <TableCell colSpan={colSpan} align="center" sx={{ py: 2 }}>
//                 <LinearProgress sx={{ maxWidth: 200, mx: 'auto', mb: 1 }} />
//                 <Typography variant="body2" color="text.secondary">Kraunama daugiau...</Typography>
//               </TableCell>
//             </TableRow>
//           )}
//           {!hasMoreRef.current && !loading && !loadingMore && (
//             <TableRow>
//               <TableCell colSpan={colSpan} align="center" sx={{ py: 1.5, color: 'text.disabled' }}>
//                 <Typography variant="body2">
//                   Visi dokumentai įkelti ({isTable ? invoices.length : recurringInvoices.length})
//                 </Typography>
//               </TableCell>
//             </TableRow>
//           )}
//         </>
//       );
//     }

//     // For mobile / non-table layouts
//     return (
//       <>
//         <Box ref={sentinelRef} sx={{ height: 1 }} />
//         {loadingMore && (
//           <Box sx={{ py: 2, textAlign: 'center' }}>
//             <LinearProgress sx={{ maxWidth: 200, mx: 'auto', mb: 1 }} />
//             <Typography variant="body2" color="text.secondary">Kraunama daugiau...</Typography>
//           </Box>
//         )}
//         {!hasMoreRef.current && !loading && !loadingMore && (
//           <Typography variant="body2" color="text.disabled" textAlign="center" sx={{ py: 1.5 }}>
//             Visi dokumentai įkelti
//           </Typography>
//         )}
//       </>
//     );
//   };

//   // ══════════════════════════════════════════
//   // Render
//   // ══════════════════════════════════════════

//   return (
//     <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto', overflowX: 'hidden' }}>
//       {/* Header */}
//       <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
//         <Typography variant="h1" sx={{ color: palette.primary, fontWeight: 500, fontSize: 24 }}>Sąskaitų išrašymas</Typography>
//         <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
//           {activeCategory !== 'periodines' && (
//             <Tooltip title={exportDisabled ? exportDisabledReason : ''} placement="bottom" disableHoverListener={!exportDisabled}>
//               <span>
//                 <Button
//                   variant="outlined" color="primary"
//                   startIcon={exportLoading ? <CircularProgress size={16} /> : <ExportIcon />}
//                   onClick={handleExport}
//                   disabled={exportDisabled || exportLoading}
//                 >
//                   Eksportuoti{selectedExportCount ? ` (${selectedExportCount})` : ''} į {programLabel}
//                 </Button>
//               </span>
//             </Tooltip>
//           )}
//           <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/israsymas/nauja')}>Nauja sąskaita</Button>
//         </Box>
//       </Box>

//       {CategoryCards()}

//       {/* Filters — hide date filters for periodines */}
//       {activeCategory !== 'periodines' && (
//         <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
//           <Grid2 container spacing={1.5} alignItems="center">
//             <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//               <TextField sx={{ fontSize: 10 }}
//                 fullWidth size="small"
//                 placeholder="Ieškoti pagal pirkėją, numerį..."
//                 value={filters.q}
//                 onChange={(e) => updateFilter('q', e.target.value)}
//                 slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
//               />
//             </Grid2>
//             <Grid2 size={{ xs: 6, sm: 3, md: 2 }}>
//               <TextField
//                 fullWidth size="small" select label="Tipas"
//                 value={filters.invoice_type}
//                 onChange={(e) => updateFilter('invoice_type', e.target.value)}
//                 SelectProps={{ MenuProps: { disableScrollLock: true }, displayEmpty: true }}
//                 InputLabelProps={{ shrink: true }}
//               >
//                 <MenuItem value="">Visi</MenuItem>
//                 <MenuItem value="isankstine">Išankstinė SF</MenuItem>
//                 <MenuItem value="pvm_saskaita">PVM SF</MenuItem>
//                 <MenuItem value="saskaita">SF (be PVM)</MenuItem>
//                 <MenuItem value="kreditine">Kreditinė SF</MenuItem>
//               </TextField>
//             </Grid2>
//             <Grid2 size={{ xs: 6, sm: 3, md: 2 }}>
//               <DateField size="small" label="Nuo" value={filters.date_from} onChange={(v) => updateFilter('date_from', v)} />
//             </Grid2>
//             <Grid2 size={{ xs: 6, sm: 3, md: 2 }}>
//               <DateField size="small" label="Iki" value={filters.date_to} onChange={(v) => updateFilter('date_to', v)} />
//             </Grid2>
//             {showExportedFilter && (
//               <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                 <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
//                   <Chip
//                     label="Eksportuotos" size="small" variant="filled"
//                     onClick={() => handleExportedFilterClick('exported')}
//                     sx={{
//                       cursor: 'pointer', fontWeight: 500, fontSize: 12, borderRadius: 1.5,
//                       backgroundColor: exportedFilter === 'exported' ? '#616161' : '#eeeeee',
//                       color: exportedFilter === 'exported' ? '#fff' : '#555',
//                       '&:hover': { backgroundColor: exportedFilter === 'exported' ? '#757575' : '#e0e0e0' },
//                     }}
//                   />
//                   <Chip
//                     label="Neeksportuotos" size="small" variant="filled"
//                     onClick={() => handleExportedFilterClick('not_exported')}
//                     sx={{
//                       cursor: 'pointer', fontWeight: 500, fontSize: 12, borderRadius: 1.5,
//                       backgroundColor: exportedFilter === 'not_exported' ? '#616161' : '#eeeeee',
//                       color: exportedFilter === 'not_exported' ? '#fff' : '#555',
//                       '&:hover': { backgroundColor: exportedFilter === 'not_exported' ? '#757575' : '#e0e0e0' },
//                     }}
//                   />
//                 </Box>
//               </Grid2>
//             )}
//           </Grid2>
//         </Paper>
//       )}

//       {/* ═══ Content ═══ */}
//       {activeCategory === 'periodines' ? (
//         // ── Periodinės sąskaitos ──
//         recurringLoading ? (
//           <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
//         ) : recurringInvoices.length === 0 && !loadingMore ? (
//           <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
//             <Typography variant="h6" color="text.secondary">Periodinių sąskaitų nerasta</Typography>
//             <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/israsymas/nauja')} sx={{ mt: 2 }}>
//               Sukurti periodinę sąskaitą
//             </Button>
//           </Paper>
//         ) : isMobile ? (
//           <Box>
//             {recurringInvoices.map((rec) => (
//               <Paper key={rec.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 1 }}>
//                 <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
//                   <Box>
//                     <Typography fontWeight={700} fontSize={13}>{rec.document_series} · {TYPE_CONFIG[rec.invoice_type]?.label}</Typography>
//                     <Typography variant="body2">{rec.buyer_name || '—'}</Typography>
//                   </Box>
//                   <Chip label={RECURRING_STATUS[rec.status]?.label} color={RECURRING_STATUS[rec.status]?.color} size="small" variant="outlined" />
//                 </Box>
//                 <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
//                   <Typography variant="caption" color="text.secondary">{fmtFrequency(rec)}</Typography>
//                   <Typography fontWeight={700} fontSize={13}>{fmtAmount(rec.estimated_amount, rec.currency)}</Typography>
//                 </Box>
//                 <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                   <Typography variant="caption" color="text.secondary">
//                     Sekanti: {rec.next_run_at ? fmtDate(rec.next_run_at.split('T')[0]) : '—'}
//                   </Typography>
//                   <RecurringRowActions rec={rec} />
//                 </Box>
//               </Paper>
//             ))}
//             <LoadMoreSentinel />
//           </Box>
//         ) : (
//           <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
//             <Table size="small">
//               <TableHead>
//                 <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, py: 1.5, backgroundColor: '#f5f5f5' } }}>
//                   <TableCell>Tipas</TableCell>
//                   <TableCell>Serija</TableCell>
//                   <TableCell>Pirkėjas</TableCell>
//                   <TableCell>Dažnumas</TableCell>
//                   <TableCell>Statusas</TableCell>
//                   <TableCell>Sekanti sąskaita</TableCell>
//                   <TableCell align="center">Išrašyta</TableCell>
//                   <TableCell align="right">Suma</TableCell>
//                   <TableCell align="left">Veiksmai</TableCell>
//                 </TableRow>
//               </TableHead>
//               <TableBody>
//                 {recurringInvoices.map((rec) => (
//                   <TableRow key={rec.id} hover sx={{ '& td': { py: 1.2 }, cursor: 'pointer' }}
//                     onClick={() => {
//                       if (rec.last_invoice) navigate(`/israsymas/${rec.last_invoice}`);
//                       else openPlanDialog(rec.id);
//                     }}
//                   >
//                     <TableCell>
//                       <Typography variant="caption" fontWeight={600}>{TYPE_CONFIG[rec.invoice_type]?.label}</Typography>
//                     </TableCell>
//                     <TableCell>
//                       <Typography fontWeight={700} fontSize={13}>{rec.document_series || '—'}</Typography>
//                     </TableCell>
//                     <TableCell>{rec.buyer_name || '—'}</TableCell>
//                     <TableCell>
//                       <Typography variant="body2" fontSize={13}>{fmtFrequency(rec)}</Typography>
//                     </TableCell>
//                     <TableCell>
//                       <Chip
//                         label={RECURRING_STATUS[rec.status]?.label || rec.status}
//                         color={RECURRING_STATUS[rec.status]?.color || 'default'}
//                         size="small" variant="outlined"
//                       />
//                     </TableCell>
//                     <TableCell>
//                       <Typography fontSize={13}>
//                         {rec.next_run_at ? fmtDate(rec.next_run_at.split('T')[0]) : '—'}
//                       </Typography>
//                     </TableCell>
//                     <TableCell align="center">
//                       <Typography fontSize={13} fontWeight={600}>{rec.generation_count}</Typography>
//                     </TableCell>
//                     <TableCell align="right">
//                       <Typography fontWeight={700} fontSize={13}>{fmtAmount(rec.estimated_amount, rec.currency)}</Typography>
//                     </TableCell>
//                     <TableCell align="left" onClick={(e) => e.stopPropagation()}>
//                       <RecurringRowActions rec={rec} />
//                     </TableCell>
//                   </TableRow>
//                 ))}
//                 <LoadMoreSentinel colSpan={9} isTable />
//               </TableBody>
//             </Table>
//           </TableContainer>
//         )
//       ) : loading ? (
//         <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
//       ) : invoices.length === 0 && !loadingMore ? (
//         <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
//           <Typography variant="h6" color="text.secondary">Sąskaitų nerasta</Typography>
//         </Paper>
//       ) : isMobile ? (
//         <Box>
//           <Box sx={{ display: 'flex', alignItems: 'center', py: 1, px: 0.5, mb: 1 }}>
//             <Checkbox size="small" indeterminate={someSelected} checked={allSelected} onChange={handleSelectAll} />
//             <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>Pasirinkti visus ({exportableIds.length})</Typography>
//           </Box>
//           {invoices.map((inv) => <MobileCard key={inv.id} inv={inv} />)}
//           <LoadMoreSentinel />
//         </Box>
//       ) : (
//         <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
//           <Table size="small">
//             <TableHead>
//               <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, py: 1.5, backgroundColor: '#f5f5f5' } }}>
//                 <TableCell padding="checkbox">
//                   <Checkbox size="small" indeterminate={someSelected} checked={allSelected} onChange={handleSelectAll} />
//                 </TableCell>
//                 <TableCell>Tipas</TableCell>
//                 <TableCell>Serija-Numeris</TableCell>
//                 <TableCell>Statusas</TableCell>
//                 <TableCell>Pirkėjas</TableCell>
//                 <TableCell>Išrašymo data</TableCell>
//                 <TableCell>Mokėti iki</TableCell>
//                 <TableCell align="center">Suma</TableCell>
//                 <TableCell align="center">Eksp.</TableCell>
//                 <TableCell align="left">Veiksmai</TableCell>
//               </TableRow>
//             </TableHead>
//             <TableBody>
//               {invoices.map((inv) => (
//                 <TableRow key={inv.id} hover sx={{ '& td': { py: 1.2 } }}>
//                   <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
//                     <RowCheckbox inv={inv} />
//                   </TableCell>
//                   <TableCell>
//                     <Typography variant="caption" sx={{ fontWeight: 600 }}>{TYPE_CONFIG[inv.invoice_type]?.label || inv.invoice_type}</Typography>
//                   </TableCell>
//                   <TableCell>
//                     <NumberLink inv={inv} />
//                   </TableCell>
//                   <TableCell><StatusChip inv={inv} /></TableCell>
//                   <TableCell>{inv.buyer_name || '—'}</TableCell>
//                   <TableCell>{fmtDate(inv.invoice_date)}</TableCell>
//                   <TableCell>
//                     <Typography fontSize={13} color={isOverdue(inv) ? 'error.main' : 'text.primary'} fontWeight={isOverdue(inv) ? 600 : 400}>
//                       {fmtDate(inv.due_date)}
//                     </Typography>
//                   </TableCell>
//                   <TableCell align="right">
//                     <Typography fontWeight={700} fontSize={13}>
//                       {fmtAmount(inv.pvm_tipas === 'taikoma' ? inv.amount_with_vat : inv.amount_wo_vat, inv.currency)}
//                     </Typography>
//                   </TableCell>
//                   <TableCell align="center">
//                     {inv.exported ? (
//                       <Tooltip title={inv.exported_at ? `Eksportuota: ${fmtDate((inv.exported_at || '').split('T')[0])}` : 'Eksportuota'}>
//                         <Chip label="✓" size="small" color="success" variant="outlined" sx={{ minWidth: 32, fontSize: 12 }} />
//                       </Tooltip>
//                     ) : (
//                       <Typography variant="caption" color="text.disabled">—</Typography>
//                     )}
//                   </TableCell>
//                   <TableCell align="left"><RowActions inv={inv} /></TableCell>
//                 </TableRow>
//               ))}
//               <LoadMoreSentinel colSpan={10} isTable />
//             </TableBody>
//           </Table>
//         </TableContainer>
//       )}

//       {/* ── Invoice Preview Dialog ── */}
//       <InvoicePreviewDialog
//         open={!!previewInvoiceId}
//         onClose={() => setPreviewInvoiceId(null)}
//         invoiceId={previewInvoiceId}
//         disableScrollLock
//       />

//       {/* ── Plan & History Dialog ── */}
//       <Dialog
//         open={planDialog.open}
//         onClose={() => setPlanDialog({ open: false, recurringId: null, data: null, loading: false })}
//         maxWidth="sm" fullWidth disableScrollLock
//       >
//         <DialogTitle>Siuntimo planas ir istorija</DialogTitle>
//         <DialogContent>
//           {planDialog.loading ? (
//             <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
//           ) : planDialog.data ? (
//             <Box>
//               {planDialog.data.past?.length > 0 && (
//                 <>
//                   <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>Istorija</Typography>
//                   <Box sx={{ mb: 2 }}>
//                     {planDialog.data.past.map((run, i) => (
//                       <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5, borderBottom: '1px solid #f0f0f0' }}>
//                         <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
//                           <Typography variant="body2" fontSize={13}>{fmtDate(run.date)}</Typography>
//                           <Chip
//                             label={run.status === 'success' ? 'Sėkminga' : run.status === 'failed' ? 'Nepavyko' : 'Vykdoma'}
//                             color={run.status === 'success' ? 'success' : run.status === 'failed' ? 'error' : 'default'}
//                             size="small" variant="outlined"
//                             sx={{ fontSize: 11, height: 20 }}
//                           />
//                         </Box>
//                         {run.invoice_id && (
//                           <Typography
//                             variant="body2" fontSize={12}
//                             sx={{ color: palette.primary, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
//                             onClick={() => {
//                               setPlanDialog((p) => ({ ...p, open: false }));
//                               navigate(`/israsymas/${run.invoice_id}`);
//                             }}
//                           >
//                             Peržiūrėti →
//                           </Typography>
//                         )}
//                       </Box>
//                     ))}
//                   </Box>
//                 </>
//               )}

//               {planDialog.data.future?.length > 0 && (
//                 <>
//                   <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>Būsimos sąskaitos</Typography>
//                   <Box>
//                     {planDialog.data.future.map((date, i) => (
//                       <Box key={i} sx={{ py: 0.5, borderBottom: '1px solid #f0f0f0' }}>
//                         <Typography variant="body2" fontSize={13}>{fmtDate(date)}</Typography>
//                       </Box>
//                     ))}
//                   </Box>
//                 </>
//               )}

//               {!planDialog.data.past?.length && !planDialog.data.future?.length && (
//                 <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
//                   Nėra duomenų
//                 </Typography>
//               )}
//             </Box>
//           ) : null}
//         </DialogContent>
//         <DialogActions>
//           <Button onClick={() => setPlanDialog({ open: false, recurringId: null, data: null, loading: false })}>
//             Uždaryti
//           </Button>
//         </DialogActions>
//       </Dialog>

//       {/* ── Mark Paid Dialog ── */}
//       <MarkPaidDialog
//         open={!!markPaidInvoice}
//         onClose={() => setMarkPaidInvoice(null)}
//         invoice={markPaidInvoice}
//         onConfirm={handleMarkPaidConfirm}
//       />

//       {/* ── Payment Proof Dialog ── */}
//       <PaymentProofDialog
//         open={!!paymentProofInvoiceId}
//         onClose={() => setPaymentProofInvoiceId(null)}
//         invoiceId={paymentProofInvoiceId}
//         onConfirmAllocation={handleConfirmAllocation}
//         onRejectAllocation={handleRejectAllocation}
//         onRemoveManualPayment={handleRemoveManualPayment}
//         onRefresh={() => { loadInvoices(); loadSummary(); }}
//       />

//       {/* Confirm dialog */}
//       <Dialog open={confirmDialog.open} onClose={closeConfirm} disableScrollLock>
//         <DialogTitle>{confirmDialog.title}</DialogTitle>
//         <DialogContent><DialogContentText>{confirmDialog.text}</DialogContentText></DialogContent>
//         <DialogActions>
//           <Button onClick={closeConfirm}>Atšaukti</Button>
//           <Button variant="contained" onClick={executeConfirm}>Patvirtinti</Button>
//         </DialogActions>
//       </Dialog>

//       <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
//         <Alert severity={snack.severity} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
//       </Snackbar>
//     </Box>
//   );
// };

// export default InvoiceListPage;









// import { useState, useEffect, useCallback, useMemo } from 'react';
// import {
//   Box,
//   Paper,
//   Typography,
//   TextField,
//   Button,
//   IconButton,
//   Chip,
//   Table,
//   TableBody,
//   TableCell,
//   TableContainer,
//   TableHead,
//   TableRow,
//   MenuItem,
//   Tooltip,
//   CircularProgress,
//   Snackbar,
//   Alert,
//   Dialog,
//   DialogTitle,
//   DialogContent,
//   DialogContentText,
//   DialogActions,
//   Stack,
//   Grid2,
//   InputAdornment,
//   Checkbox,
//   useTheme,
//   useMediaQuery,
// } from '@mui/material';
// import {
//   Add as AddIcon,
//   Search as SearchIcon,
//   Send as SendIcon,
//   Paid as PaidIcon,
//   Cancel as CancelIcon,
//   ContentCopy as DuplicateIcon,
//   Receipt as PvmSfIcon,
//   Download as DownloadIcon,
//   Edit as EditIcon,
//   Delete as DeleteIcon,
//   FileDownload as ExportIcon,
//   Pause as PauseIcon,
//   PlayArrow as PlayArrowIcon,
//   CalendarMonth as CalendarMonthIcon,
// } from '@mui/icons-material';
// import LoopIcon from '@mui/icons-material/Loop';
// import DrawIcon from '@mui/icons-material/Draw';
// import DoNotDisturbIcon from '@mui/icons-material/DoNotDisturb';
// import { HiDocumentCheck } from 'react-icons/hi2';
// import { IoIosTimer } from 'react-icons/io';
// import { MdOutlinePaid } from 'react-icons/md';
// import { useNavigate } from 'react-router-dom';
// import { invoicingApi } from '../api/invoicingApi';
// import { api } from '../api/endpoints';
// import { ACCOUNTING_PROGRAMS } from '../page_elements/AccountingPrograms';
// import DateField from '../components/DateField';
// import { InvoicePreviewDialog, useInvoicePdf } from '../components/InvoicePreview';
// import MarkPaidDialog from '../components/MarkPaidDialog';
// import PaymentProofDialog from '../components/PaymentProofDialog';

// // ── Palette ──

// const palette = {
//   primary: '#1976d2',
//   border: '#e0e0e0',
// };

// const STATUS_CONFIG = {
//   draft:     { label: 'Juodraštis',  color: 'default' },
//   issued:    { label: 'Išrašyta',    color: 'info' },
//   sent:      { label: 'Išsiųsta',    color: 'primary' },
//   partially_paid:  { label: 'Dalinai apmokėta',  color: 'warning' },
//   paid:      { label: 'Apmokėta',    color: 'success' },
//   cancelled: { label: 'Atšaukta',    color: 'default' },
// };

// const RECURRING_STATUS = {
//   active:    { label: 'Aktyvi',       color: 'success' },
//   paused:    { label: 'Pristabdyta',  color: 'warning' },
//   finished:  { label: 'Baigta',       color: 'default' },
//   cancelled: { label: 'Atšaukta',     color: 'default' },
// };

// const TYPE_CONFIG = {
//   isankstine:   { label: 'Išankstinė SF' },
//   pvm_saskaita: { label: 'PVM SF' },
//   saskaita:     { label: 'SF' },
//   kreditine:    { label: 'Kreditinė SF' },
// };

// const fmtAmount = (val, currency = 'EUR') => {
//   if (val == null) return '—';
//   const n = parseFloat(val);
//   return `${n.toFixed(2).replace('.', ',')} ${currency === 'EUR' ? '€' : currency}`;
// };

// const fmtDate = (d) => {
//   if (!d) return '—';
//   const parts = d.split('-');
//   if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
//   return d;
// };

// const toInputDate = (d) => {
//   if (!d) return '';
//   return d instanceof Date ? d.toISOString().split('T')[0] : d;
// };

// const getDefaultDates = () => {
//   const now = new Date();
//   const ago = new Date(now);
//   ago.setDate(now.getDate() - 30);
//   return { date_from: toInputDate(ago), date_to: toInputDate(now) };
// };

// const fmtFrequency = (rec) => {
//   if (rec.first_day_of_month) return 'Kas pirma mėn. diena';
//   if (rec.last_day_of_month) return 'Kas paskutinė mėn. diena';
//   const labels = {
//     daily: { 1: 'Kasdien', default: (n) => `Kas ${n} d.` },
//     weekly: { 1: 'Kas savaitę', default: (n) => `Kas ${n} sav.` },
//     monthly: { 1: 'Kas mėnesį', default: (n) => `Kas ${n} mėn.` },
//     quarterly: { 1: 'Kas ketvirtį', default: (n) => `Kas ${n} ketv.` },
//     yearly: { 1: 'Kas metus', default: (n) => `Kas ${n} m.` },
//   };
//   const group = labels[rec.frequency];
//   if (!group) return rec.frequency;
//   if (rec.interval === 1) return group[1];
//   return group.default(rec.interval);
// };

// // ── Categories ──

// const MAIN_CATEGORIES = [
//   { key: 'israsytos',    label: 'Išrašytos',    Icon: HiDocumentCheck, iconColor: '#546e7a' },
//   { key: 'veluojancios', label: 'Vėluojančios', Icon: IoIosTimer,      iconColor: '#f9a825' },
//   { key: 'apmoketos',    label: 'Apmokėtos',    Icon: MdOutlinePaid,   iconColor: '#43a047' },
// ];

// const CARD_HEIGHT = { xs: 120, md: 140 };
// const CHIP_ZONE_HEIGHT = 30;

// // ══════════════════════════════════════════
// // Component
// // ══════════════════════════════════════════

// const InvoiceListPage = () => {
//   const navigate = useNavigate();
//   const theme = useTheme();
//   const isMobile = useMediaQuery(theme.breakpoints.down('md'));

//   const [invoices, setInvoices] = useState([]);
//   const [total, setTotal] = useState(0);
//   const [loading, setLoading] = useState(true);
//   const [summary, setSummary] = useState(null);
//   const [user, setUser] = useState(null);

//   const [activeCategory, setActiveCategory] = useState('israsytos');
//   const [israsytosSubFilter, setIsrasytosSubFilter] = useState('');
//   const [exportedFilter, setExportedFilter] = useState('');

//   const defaultDates = useMemo(() => getDefaultDates(), []);
//   const [filters, setFilters] = useState({
//     invoice_type: '',
//     q: '',
//     date_from: defaultDates.date_from,
//     date_to: defaultDates.date_to,
//   });
//   const [offset, setOffset] = useState(0);
//   const limit = 50;

//   const [selectedRows, setSelectedRows] = useState([]);
//   const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });
//   const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', text: '', onConfirm: null });
//   const [actionLoading, setActionLoading] = useState(null);
//   const [exportLoading, setExportLoading] = useState(false);

//   // ── Recurring ──
//   const [recurringInvoices, setRecurringInvoices] = useState([]);
//   const [recurringTotal, setRecurringTotal] = useState(0);
//   const [recurringLoading, setRecurringLoading] = useState(false);
//   const [planDialog, setPlanDialog] = useState({ open: false, recurringId: null, data: null, loading: false });

//   // ── Preview & PDF ──
//   const [previewInvoiceId, setPreviewInvoiceId] = useState(null);
//   const { downloadPdf, pdfLoading } = useInvoicePdf();

//   // ── Payment dialogs ──
//   const [markPaidInvoice, setMarkPaidInvoice] = useState(null);
//   const [paymentProofInvoiceId, setPaymentProofInvoiceId] = useState(null);

//   // ── Prevent body scroll-lock gap globally ──
//   useEffect(() => {
//     document.body.style.overflowY = 'scroll';
//     return () => { document.body.style.overflowY = ''; };
//   }, []);

//   // ── User ──

//   useEffect(() => {
//     api.get('/profile/', { withCredentials: true })
//       .then((res) => setUser(res.data))
//       .catch(() => setUser(null));
//   }, []);

//   const programKey = user?.default_accounting_program || '';
//   const programLabel =
//     ACCOUNTING_PROGRAMS.find((p) => p.value === programKey)?.label || programKey || '...';

//   // ── Resolved backend params ──

//   const resolvedParams = useMemo(() => {
//     const p = {};
//     if (activeCategory === 'israsytos') {
//       p.category = 'israsytos';
//       if (israsytosSubFilter === 'sent') p.status = 'sent';
//       else if (israsytosSubFilter === 'not_sent') p.status = 'issued';
//     } else if (activeCategory === 'juodrasciai') {
//       p.category = 'juodrasciai';
//     } else if (activeCategory === 'cancelled') {
//       p.category = 'cancelled';
//     } else if (activeCategory && activeCategory !== 'periodines') {
//       p.category = activeCategory;
//     }
//     return p;
//   }, [activeCategory, israsytosSubFilter]);

//   // ── Load ──

//   const loadInvoices = useCallback(async () => {
//     if (activeCategory === 'periodines') return;
//     setLoading(true);
//     try {
//       const params = { limit, offset, ...resolvedParams };
//       if (filters.invoice_type) params.invoice_type = filters.invoice_type;
//       if (filters.q) params.q = filters.q;
//       if (filters.date_from) params.date_from = filters.date_from;
//       if (filters.date_to) params.date_to = filters.date_to;
//       if (exportedFilter === 'exported') params.exported = 'true';
//       else if (exportedFilter === 'not_exported') params.exported = 'false';

//       const { data } = await invoicingApi.getInvoices(params);
//       setInvoices(data.results || []);
//       setTotal(data.count || 0);
//     } catch {
//       setSnack({ open: true, msg: 'Nepavyko įkelti sąskaitų', severity: 'error' });
//     } finally {
//       setLoading(false);
//     }
//   }, [resolvedParams, filters, offset, exportedFilter, activeCategory]);

//   const loadRecurringInvoices = useCallback(async () => {
//     setRecurringLoading(true);
//     try {
//       const params = { limit, offset };
//       if (filters.q) params.search = filters.q;
//       const { data } = await invoicingApi.getRecurringInvoices(params);
//       setRecurringInvoices(data.results || data || []);
//       setRecurringTotal(data.count || (data.results || data || []).length);
//     } catch {
//       setSnack({ open: true, msg: 'Nepavyko įkelti periodinių sąskaitų', severity: 'error' });
//     } finally {
//       setRecurringLoading(false);
//     }
//   }, [filters.q, offset]);

//   const loadSummary = async () => {
//     try {
//       const { data } = await invoicingApi.getSummary();
//       setSummary(data);
//     } catch { /* ok */ }
//   };

//   useEffect(() => {
//     if (activeCategory === 'periodines') loadRecurringInvoices();
//     else loadInvoices();
//   }, [activeCategory, loadInvoices, loadRecurringInvoices]);

//   useEffect(() => { loadSummary(); }, []);
//   useEffect(() => { setSelectedRows([]); }, [activeCategory, israsytosSubFilter, filters, offset, exportedFilter]);
//   useEffect(() => { if (activeCategory !== 'israsytos') setIsrasytosSubFilter(''); }, [activeCategory]);
//   useEffect(() => { if (['juodrasciai', 'cancelled', 'periodines'].includes(activeCategory)) setExportedFilter(''); }, [activeCategory]);

//   // ── Handlers ──

//   const updateFilter = (field, value) => {
//     setFilters((prev) => ({ ...prev, [field]: value }));
//     setOffset(0);
//   };

//   const handleCategoryClick = (key) => {
//     setActiveCategory((prev) => (prev === key ? '' : key));
//     setOffset(0);
//     setFilters((prev) => ({ ...prev, invoice_type: '' }));
//   };

//   const handleTextCategoryClick = (key) => {
//     setActiveCategory((prev) => (prev === key ? '' : key));
//     setOffset(0);
//   };

//   const handleSubFilterClick = (sub) => {
//     setIsrasytosSubFilter((prev) => (prev === sub ? '' : sub));
//     setOffset(0);
//   };

//   const handleExportedFilterClick = (val) => {
//     setExportedFilter((prev) => (prev === val ? '' : val));
//     setOffset(0);
//   };

//   // ── Checkbox ──

//   const isRowExportable = (inv) => {
//       if (!['issued', 'sent', 'paid', 'partially_paid'].includes(inv.status)) return false;
//       if (inv.invoice_type === 'kreditine') return false;
//       return true;
//     };
//   const isIsankstine = (inv) => inv.invoice_type === 'isankstine';
//   const canBeChecked = (inv) => isRowExportable(inv) && !isIsankstine(inv);

//   const exportableRows = useMemo(() => invoices.filter(canBeChecked), [invoices]);
//   const exportableIds = useMemo(() => exportableRows.map((r) => String(r.id)), [exportableRows]);

//   const allSelected = exportableIds.length > 0 && exportableIds.every((id) => selectedRows.includes(id));
//   const someSelected = exportableIds.some((id) => selectedRows.includes(id)) && !allSelected;

//   const handleSelectRow = (id) => {
//     const sid = String(id);
//     setSelectedRows((prev) => prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]);
//   };
//   const handleSelectAll = () => { allSelected ? setSelectedRows([]) : setSelectedRows(exportableIds); };

//   const selectedExportCount = selectedRows.filter((id) => exportableIds.includes(id)).length;

//   // ── Export ──

//   const handleExport = async () => {
//     if (selectedExportCount === 0) {
//       setSnack({ open: true, msg: 'Pasirinkite bent vieną sąskaitą eksportui', severity: 'warning' });
//       return;
//     }
//     if (!programKey) {
//       setSnack({ open: true, msg: 'Pasirinkite buhalterinę programą nustatymuose', severity: 'warning' });
//       return;
//     }
//     setExportLoading(true);
//     try {
//       const payload = { ids: selectedRows.map(Number).filter(Number.isFinite), source: 'invoice', export_type: programKey };
//       const res = await api.post('/documents/export_xml/', payload, { withCredentials: true, responseType: 'blob' });

//       let filename = '';
//       const cd = res.headers?.['content-disposition'];
//       if (cd) { const m = cd.match(/filename="?([^"]+)"?/); if (m) filename = m[1]; }
//       if (!filename) filename = 'eksportas.zip';

//       const blob = new Blob([res.data], { type: res.headers?.['content-type'] || 'application/octet-stream' });
//       const url = window.URL.createObjectURL(blob);
//       const link = document.createElement('a');
//       link.href = url;
//       link.setAttribute('download', filename);
//       document.body.appendChild(link);
//       link.click();
//       link.remove();
//       window.URL.revokeObjectURL(url);

//       setSelectedRows([]);
//       setSnack({ open: true, msg: 'Eksportas sėkmingas', severity: 'success' });
//       loadInvoices();
//       loadSummary();
//     } catch (err) {
//       console.error(err);
//       if (err?.response?.data instanceof Blob) {
//         try {
//           const text = await err.response.data.text();
//           const json = JSON.parse(text);
//           setSnack({ open: true, msg: json.error || json.detail || 'Eksportas nepavyko', severity: 'error' });
//         } catch { setSnack({ open: true, msg: 'Eksportas nepavyko', severity: 'error' }); }
//       } else {
//         setSnack({ open: true, msg: err?.response?.data?.error || err?.message || 'Eksportas nepavyko', severity: 'error' });
//       }
//     } finally {
//       setExportLoading(false);
//     }
//   };

//   // ── Actions ──

//   const showSnack = (msg, severity = 'success') => setSnack({ open: true, msg, severity });

//   const openConfirm = (title, text, onConfirm) => {
//     setConfirmDialog({ open: true, title, text, onConfirm });
//   };

//   const closeConfirm = () => {
//     setConfirmDialog({ open: false, title: '', text: '', onConfirm: null });
//   };

//   const executeConfirm = async () => {
//     const fn = confirmDialog.onConfirm;
//     closeConfirm();
//     if (fn) await fn();
//   };

//   const handleAction = async (action, invoice) => {
//     if (action === 'duplicate') {
//       navigate(`/israsymas/nauja?from=${invoice.id}`);
//       return;
//     }

//     setActionLoading(invoice.id);
//     try {
//       switch (action) {
//         case 'issue':    await invoicingApi.issueInvoice(invoice.id); showSnack(`Sąskaita ${invoice.full_number || ''} išrašyta`); break;
//         case 'send':     await invoicingApi.sendInvoice(invoice.id); showSnack('Sąskaita išsiųsta'); break;
//         case 'cancel':   await invoicingApi.cancelInvoice(invoice.id); showSnack('Sąskaita atšaukta'); break;
//         case 'create_pvm_sf': await invoicingApi.createPvmSf(invoice.id); showSnack('SF sukurta'); break;
//         case 'delete':   await invoicingApi.deleteInvoice(invoice.id); showSnack('Sąskaita ištrinta'); break;
//         default: break;
//       }
//       loadInvoices();
//       loadSummary();
//     } catch (e) {
//       const msg = e.response?.data?.detail
//         || (typeof e.response?.data === 'object' ? Object.values(e.response.data).flat().join(', ') : '')
//         || 'Klaida';
//       showSnack(msg, 'error');
//     } finally {
//       setActionLoading(null);
//     }
//   };

//   // ── Recurring actions ──

//   const openPlanDialog = async (recurringId) => {
//     setPlanDialog({ open: true, recurringId, data: null, loading: true });
//     try {
//       const { data } = await invoicingApi.getRecurringPlanHistory(recurringId);
//       setPlanDialog((p) => ({ ...p, data, loading: false }));
//     } catch {
//       setPlanDialog((p) => ({ ...p, loading: false }));
//       showSnack('Nepavyko įkelti plano', 'error');
//     }
//   };

//   const handleRecurringAction = async (action, recurring) => {
//     setActionLoading(recurring.id);
//     try {
//       switch (action) {
//         case 'pause': await invoicingApi.pauseRecurring(recurring.id); showSnack('Periodinė sąskaita pristabdyta'); break;
//         case 'resume': await invoicingApi.resumeRecurring(recurring.id); showSnack('Periodinė sąskaita tęsiama'); break;
//         case 'cancel': await invoicingApi.cancelRecurring(recurring.id); showSnack('Periodinė sąskaita atšaukta'); break;
//         default: break;
//       }
//       loadRecurringInvoices();
//     } catch (e) {
//       showSnack(e.response?.data?.detail || 'Klaida', 'error');
//     } finally {
//       setActionLoading(null);
//     }
//   };

//   // ── PDF download handler ──

//   const handlePdfDownload = async (inv) => {
//     try {
//       await downloadPdf(inv.id, `${inv.full_number || inv.id}.pdf`);
//     } catch {
//       showSnack('Nepavyko atsisiųsti PDF', 'error');
//     }
//   };

//   // ── Payment handlers ──

//   const handleMarkPaidConfirm = async (data) => {
//     try {
//       const res = await invoicingApi.markPaid(markPaidInvoice.id, data);
//       showSnack('Pažymėta kaip apmokėta');
//       if (res.data?.auto_created_sf) {
//         showSnack(
//           `Automatiškai sukurta ${res.data.auto_created_sf.full_number}`,
//           'info'
//         );
//       }
//       loadInvoices();
//       loadSummary();
//     } catch (e) {
//       showSnack(e.response?.data?.detail || 'Klaida', 'error');
//       throw e;
//     }
//   };

//   const handleConfirmAllocation = async (allocId) => {
//     try {
//       await invoicingApi.confirmAllocation(allocId);
//       showSnack('Mokėjimas patvirtintas');
//       loadInvoices();
//       loadSummary();
//     } catch {
//       showSnack('Nepavyko patvirtinti', 'error');
//     }
//   };

//   const handleRejectAllocation = async (allocId) => {
//     try {
//       await invoicingApi.rejectAllocation(allocId);
//       showSnack('Mokėjimas atmestas');
//       loadInvoices();
//       loadSummary();
//     } catch {
//       showSnack('Nepavyko atmesti', 'error');
//     }
//   };

//   const handleRemoveManualPayment = async (allocId) => {
//     try {
//       await invoicingApi.removeManualPayment(paymentProofInvoiceId, allocId);
//       showSnack('Rankinis pažymėjimas pašalintas');
//       loadInvoices();
//       loadSummary();
//     } catch {
//       showSnack('Nepavyko pašalinti', 'error');
//     }
//   };

//   // ══════════════════════════════════════════
//   // Sub-components
//   // ══════════════════════════════════════════

//   // ── Category cards ──

//   const CategoryCards = () => {
//     if (!summary) return null;

//     return (
//       <Box sx={{ mb: 2 }}>
//         <Grid2 container spacing={1.5} sx={{ mb: 1 }}>
//           {MAIN_CATEGORIES.map(({ key, label, Icon, iconColor }) => {
//             const s = summary[key] || { count: 0, total: '0.00' };
//             const active = activeCategory === key;
//             const hasAmount = parseFloat(s.total) > 0;
//             const isIsrasytos = key === 'israsytos';

//             return (
//               <Grid2 size={{ xs: 4 }} key={key}>
//                 <Paper
//                   variant="outlined"
//                   sx={{
//                     height: CARD_HEIGHT,
//                     borderRadius: 2.5,
//                     cursor: 'pointer',
//                     borderColor: active ? palette.primary : palette.border,
//                     borderWidth: active ? 2 : 1,
//                     backgroundColor: active ? '#e3f2fd' : '#fff',
//                     transition: 'all 0.15s',
//                     '&:hover': { borderColor: palette.primary, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
//                     display: 'flex',
//                     flexDirection: 'column',
//                     overflow: 'hidden',
//                   }}
//                   onClick={() => handleCategoryClick(key)}
//                 >
//                   <Box sx={{
//                     flex: 1,
//                     display: 'flex',
//                     flexDirection: 'row',
//                     alignItems: 'center',
//                     justifyContent: 'center',
//                     gap: { xs: 1, md: 1.5 },
//                     px: { xs: 1.5, md: 2.5 },
//                   }}>
//                     <Box sx={{
//                       width: { xs: 36, md: 44 },
//                       height: { xs: 36, md: 44 },
//                       borderRadius: '50%',
//                       display: 'flex',
//                       alignItems: 'center',
//                       justifyContent: 'center',
//                       backgroundColor: active ? 'rgba(25,118,210,0.1)' : '#f5f5f5',
//                       flexShrink: 0,
//                     }}>
//                       <Icon size={isMobile ? 18 : 22} color={iconColor} />
//                     </Box>
//                     <Box>
//                       <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
//                         <Typography fontWeight={700} fontSize={isMobile ? 20 : 24} lineHeight={1.2}>
//                           {s.count}
//                         </Typography>
//                         {hasAmount && (
//                           <>
//                             <Typography fontSize={11} color="text.disabled" sx={{ lineHeight: 1 }}>·</Typography>
//                             <Typography fontSize={12} color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
//                               {fmtAmount(s.total)}
//                             </Typography>
//                           </>
//                         )}
//                       </Box>
//                       <Typography
//                         variant="caption"
//                         color="text.secondary"
//                         sx={{ fontWeight: active ? 600 : 400 }}
//                       >
//                         {label}
//                       </Typography>
//                     </Box>
//                   </Box>

//                   <Box sx={{
//                     height: CHIP_ZONE_HEIGHT,
//                     display: 'flex',
//                     alignItems: 'center',
//                     justifyContent: 'center',
//                     gap: 0.5,
//                     flexShrink: 0,
//                     mb: 0.75,
//                   }}
//                     onClick={(e) => { if (isIsrasytos) e.stopPropagation(); }}
//                   >
//                     {isIsrasytos && (
//                       <>
//                         <Chip
//                           label="Išsiųstos" size="small"
//                           variant={israsytosSubFilter === 'sent' ? 'filled' : 'outlined'}
//                           color={israsytosSubFilter === 'sent' ? 'primary' : 'default'}
//                           onClick={(e) => {
//                             e.stopPropagation();
//                             if (activeCategory !== 'israsytos') setActiveCategory('israsytos');
//                             handleSubFilterClick('sent');
//                           }}
//                           sx={{
//                             cursor: 'pointer', fontSize: 11, height: 22,
//                             ...(israsytosSubFilter !== 'sent' && active ? { backgroundColor: '#fff' } : {}),
//                           }}
//                         />
//                         <Chip
//                           label="Neišsiųstos" size="small"
//                           variant={israsytosSubFilter === 'not_sent' ? 'filled' : 'outlined'}
//                           color={israsytosSubFilter === 'not_sent' ? 'primary' : 'default'}
//                           onClick={(e) => {
//                             e.stopPropagation();
//                             if (activeCategory !== 'israsytos') setActiveCategory('israsytos');
//                             handleSubFilterClick('not_sent');
//                           }}
//                           sx={{
//                             cursor: 'pointer', fontSize: 11, height: 22,
//                             ...(israsytosSubFilter !== 'not_sent' && active ? { backgroundColor: '#fff' } : {}),
//                           }}
//                         />
//                       </>
//                     )}
//                   </Box>
//                 </Paper>
//               </Grid2>
//             );
//           })}
//         </Grid2>

//         {/* Text categories with icons */}
//         <Box sx={{ display: 'flex', gap: 2.5, ml: 0.5, mt: 0.5 }}>
//           {[
//             { key: 'periodines', label: 'Periodinės', Icon: LoopIcon },
//             { key: 'juodrasciai', label: 'Juodraščiai', Icon: DrawIcon },
//             { key: 'cancelled', label: 'Anuliuotos', Icon: DoNotDisturbIcon },
//           ].map(({ key, label, Icon }) => (
//             <Box
//               key={key}
//               sx={{
//                 display: 'flex', alignItems: 'center', gap: 0.5,
//                 cursor: 'pointer', userSelect: 'none',
//                 color: activeCategory === key ? '#1a3b6e' : 'text.secondary',
//                 '&:hover': { color: '#1a3b6e' },
//               }}
//               onClick={() => handleTextCategoryClick(key)}
//             >
//               <Icon sx={{ fontSize: 16 }} />
//               <Typography
//                 variant="body2"
//                 sx={{
//                   fontWeight: activeCategory === key ? 700 : 400,
//                   fontSize: 13,
//                   transition: 'all 0.15s',
//                 }}
//               >
//                 {label}
//               </Typography>
//             </Box>
//           ))}
//         </Box>
//       </Box>
//     );
//   };

//   // ── Export button helpers ──

//   const exportDisabledReason = useMemo(() => {
//     if (!user) return 'Kraunama...';
//     if (!programKey) return 'Pirmiausia pasirinkite buhalterinę programą nustatymuose';
//     if (selectedExportCount === 0) return 'Pažymėkite bent vieną sąskaitą eksportui';
//     return '';
//   }, [user, programKey, selectedExportCount]);
//   const exportDisabled = Boolean(exportDisabledReason);
//   const showExportedFilter = ['israsytos', 'veluojancios', 'apmoketos'].includes(activeCategory);

//   // ── RowActions (normal invoices) ──

//   const RowActions = ({ inv }) => {
//     const isLoading = actionLoading === inv.id;
//     if (isLoading) return <CircularProgress size={20} />;

//     const cat = activeCategory;
//     const notReady = () => showSnack('Funkcija ruošiama', 'info');
//     const a = [];

//     if (cat === 'juodrasciai') {
//       a.push('edit', 'duplicate', 'delete');
//     } else if (cat === 'cancelled') {
//       a.push('duplicate', 'pdf');
//     } else if (cat === 'israsytos') {
//       a.push('edit');
//       if (inv.can_create_pvm_sf) a.push('convert_sf');
//       if (inv.status === 'issued') a.push('send_email');
//       a.push('mark_paid', 'duplicate', 'pdf', 'cancel');
//     } else if (cat === 'veluojancios') {
//       a.push('edit');
//       if (inv.can_create_pvm_sf) a.push('convert_sf');
//       a.push('send_reminder', 'mark_paid', 'duplicate', 'pdf', 'cancel');
//     } else if (cat === 'apmoketos') {
//       a.push('edit');
//       if (inv.can_create_pvm_sf) a.push('convert_sf');
//       a.push('duplicate', 'pdf', 'cancel');
//     } else {
//       if (inv.status === 'draft') {
//         a.push('edit');
//         if (inv.can_create_pvm_sf) a.push('convert_sf');
//         a.push('duplicate', 'delete');
//       } else if (['issued', 'sent'].includes(inv.status)) {
//         a.push('edit');
//         if (inv.can_create_pvm_sf) a.push('convert_sf');
//         if (inv.status === 'issued') a.push('send_email');
//         a.push('mark_paid', 'duplicate', 'pdf', 'cancel');
//       } else if (inv.status === 'paid') {
//         a.push('edit');
//         if (inv.can_create_pvm_sf) a.push('convert_sf');
//         a.push('duplicate', 'pdf', 'cancel');
//       } else if (inv.status === 'cancelled') {
//         a.push('duplicate', 'pdf');
//       }
//     }

//     const invoiceId = inv.id;

//     const buttons = {
//       convert_sf: (
//         <Tooltip title="Konvertuoti į SF" key="convert_sf">
//           <IconButton size="small" color="secondary" onClick={() => handleAction('create_pvm_sf', inv)}>
//             <PvmSfIcon fontSize="small" />
//           </IconButton>
//         </Tooltip>
//       ),
//       send_email: (
//         <Tooltip title="Siųsti el. paštu" key="send_email">
//           <IconButton size="small" color="primary" onClick={notReady}>
//             <SendIcon fontSize="small" />
//           </IconButton>
//         </Tooltip>
//       ),
//       send_reminder: (
//         <Tooltip title="Siųsti priminimą" key="send_reminder">
//           <IconButton size="small" color="warning" onClick={notReady}>
//             <SendIcon fontSize="small" />
//           </IconButton>
//         </Tooltip>
//       ),
//       mark_paid: (
//         <Tooltip title="Pažymėti apmokėta" key="mark_paid">
//           <IconButton size="small" color="success" onClick={() => setMarkPaidInvoice(inv)}>
//             <PaidIcon fontSize="small" />
//           </IconButton>
//         </Tooltip>
//       ),
//       edit: (
//         <Tooltip title="Redaguoti" key="edit">
//           <IconButton size="small" onClick={() => navigate(`/israsymas/${inv.id}`)}>
//             <EditIcon fontSize="small" />
//           </IconButton>
//         </Tooltip>
//       ),
//       duplicate: (
//         <Tooltip title="Kopijuoti" key="duplicate">
//           <IconButton size="small" onClick={() => navigate(`/israsymas/nauja?from=${inv.id}`)}>
//             <DuplicateIcon fontSize="small" />
//           </IconButton>
//         </Tooltip>
//       ),
//       pdf: (
//         <Tooltip title="Parsisiųsti PDF" key="pdf">
//           <IconButton size="small" onClick={() => handlePdfDownload(inv)} disabled={pdfLoading}>
//             {pdfLoading ? <CircularProgress size={16} /> : <DownloadIcon fontSize="small" />}
//           </IconButton>
//         </Tooltip>
//       ),
//       cancel: (
//         <Tooltip title="Anuliuoti" key="cancel">
//           <IconButton size="small" color="error"
//             onClick={() => openConfirm(
//               'Anuliuoti sąskaitą?',
//               `${inv.full_number || 'Sąskaita'} bus anuliuota.`,
//               () => handleAction('cancel', { id: invoiceId }),
//             )}>
//             <CancelIcon fontSize="small" />
//           </IconButton>
//         </Tooltip>
//       ),
//       delete: (
//         <Tooltip title="Ištrinti" key="delete">
//           <IconButton size="small" color="error"
//             onClick={() => openConfirm(
//               'Ištrinti juodraštį?',
//               'Veiksmo anuliuoti nebus galima.',
//               () => handleAction('delete', { id: invoiceId }),
//             )}>
//             <DeleteIcon fontSize="small" />
//           </IconButton>
//         </Tooltip>
//       ),
//     };

//     return (
//       <Stack direction="row" spacing={0.25} sx={{ flexWrap: 'nowrap' }}>
//         {a.map((key) => buttons[key])}
//       </Stack>
//     );
//   };

//   // ── RecurringRowActions ──

//   const RecurringRowActions = ({ rec }) => {
//     const isLoading = actionLoading === rec.id;
//     if (isLoading) return <CircularProgress size={20} />;

//     return (
//       <Stack direction="row" spacing={0.25} sx={{ flexWrap: 'nowrap' }}>
//         <Tooltip title="Planas ir istorija">
//           <IconButton size="small" onClick={() => openPlanDialog(rec.id)}>
//             <CalendarMonthIcon fontSize="small" />
//           </IconButton>
//         </Tooltip>
//         {['active', 'paused'].includes(rec.status) && (
//           <Tooltip title="Redaguoti">
//             <IconButton size="small" onClick={() => navigate(`/israsymas/nauja?recurring=${rec.id}`)}>
//               <EditIcon fontSize="small" />
//             </IconButton>
//           </Tooltip>
//         )}
//         <Tooltip title="Kopijuoti">
//           <IconButton size="small" onClick={() => navigate(`/israsymas/nauja?recurring_from=${rec.id}`)}>
//             <DuplicateIcon fontSize="small" />
//           </IconButton>
//         </Tooltip>
//         {rec.status === 'active' && (
//           <Tooltip title="Pristabdyti">
//             <IconButton size="small" color="warning" onClick={() => handleRecurringAction('pause', rec)}>
//               <PauseIcon fontSize="small" />
//             </IconButton>
//           </Tooltip>
//         )}
//         {rec.status === 'paused' && (
//           <Tooltip title="Tęsti">
//             <IconButton size="small" color="success" onClick={() => handleRecurringAction('resume', rec)}>
//               <PlayArrowIcon fontSize="small" />
//             </IconButton>
//           </Tooltip>
//         )}
//         {['active', 'paused'].includes(rec.status) && (
//           <Tooltip title="Atšaukti">
//             <IconButton size="small" color="error"
//               onClick={() => openConfirm(
//                 'Atšaukti periodinę sąskaitą?',
//                 'Naujos sąskaitos nebebus kuriamos.',
//                 () => handleRecurringAction('cancel', rec),
//               )}>
//               <CancelIcon fontSize="small" />
//             </IconButton>
//           </Tooltip>
//         )}
//       </Stack>
//     );
//   };

//   // ── Row helpers ──

//   const RowCheckbox = ({ inv }) => {
//     const exportable = canBeChecked(inv);
//     const isIsankt = isIsankstine(inv);
//     const checked = exportable && selectedRows.includes(String(inv.id));

//     if (isIsankt && isRowExportable(inv)) {
//       return (
//         <Tooltip title="Konvertuokite į PVM sąskaitą, tada eksportuokite" arrow>
//           <span><Checkbox size="small" disabled checked={false} /></span>
//         </Tooltip>
//       );
//     }
//     if (!isRowExportable(inv)) return <Checkbox size="small" disabled checked={false} />;
//     return <Checkbox size="small" checked={checked} onChange={() => handleSelectRow(inv.id)} />;
//   };

//   const isOverdue = (inv) => {
//     if (inv.is_overdue) return true;
//     if (!['issued', 'sent'].includes(inv.status) || !inv.due_date) return false;
//     return inv.due_date < new Date().toISOString().split('T')[0];
//   };

//   const StatusChip = ({ inv }) => {
//     // Overdue (но не для paid/partially_paid)
//     if (isOverdue(inv) && !['paid', 'partially_paid'].includes(inv.status)) {
//       return <Chip label="Vėluojanti" color="error" size="small" variant="outlined" />;
//     }

//     // Paid — кликабельный
//     if (inv.status === 'paid') {
//       return (
//         <Chip
//           label="Apmokėta"
//           color="success"
//           size="small"
//           variant="outlined"
//           onClick={(e) => { e.stopPropagation(); setPaymentProofInvoiceId(inv.id); }}
//           sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'rgba(76,175,80,0.08)' } }}
//         />
//       );
//     }

//     // Partially paid — кликабельный
//     if (inv.status === 'partially_paid') {
//       const paid = parseFloat(inv.paid_amount || 0);
//       const total = parseFloat(inv.amount_with_vat || 0);
//       return (
//         <Chip
//           label={`Dalinai ${paid.toFixed(0)}/${total.toFixed(0)} €`}
//           color="warning"
//           size="small"
//           variant="outlined"
//           onClick={(e) => { e.stopPropagation(); setPaymentProofInvoiceId(inv.id); }}
//           sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'rgba(237,108,2,0.08)' } }}
//         />
//       );
//     }

//     // Has proposed payments — мигающий
//     if (inv.has_proposed_payments) {
//       return (
//         <Chip
//           label="Laukia patvirtinimo"
//           color="info"
//           size="small"
//           variant="outlined"
//           onClick={(e) => { e.stopPropagation(); setPaymentProofInvoiceId(inv.id); }}
//           sx={{
//             cursor: 'pointer',
//             animation: 'pulse 2s ease-in-out infinite',
//             '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
//           }}
//         />
//       );
//     }

//     // Default
//     return (
//       <Chip
//         label={STATUS_CONFIG[inv.status]?.label || inv.status}
//         color={STATUS_CONFIG[inv.status]?.color || 'default'}
//         size="small"
//         variant="outlined"
//       />
//     );
//   };

//   const NumberLink = ({ inv }) => {
//     const isDraft = inv.status === 'draft';
//     const display = inv.full_number || '—';

//     if (isDraft) {
//       return (
//         <Typography
//           fontWeight={700} fontSize={13}
//           sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
//           onClick={() => navigate(`/israsymas/${inv.id}`)}
//         >
//           {display}
//         </Typography>
//       );
//     }

//     return (
//       <Typography
//         fontWeight={700} fontSize={13}
//         sx={{
//           color: palette.primary,
//           cursor: 'pointer',
//           '&:hover': { textDecoration: 'underline' },
//         }}
//         onClick={(e) => {
//           e.stopPropagation();
//           setPreviewInvoiceId(inv.id);
//         }}
//       >
//         {display}
//       </Typography>
//     );
//   };

//   // ── Mobile card ──

//   const MobileCard = ({ inv }) => (
//     <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 1 }}>
//       <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
//         <RowCheckbox inv={inv} />
//         <Box sx={{ flex: 1 }}>
//           <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
//             <Box>
//               <NumberLink inv={inv} />
//               <Typography variant="caption" color="text.secondary">{TYPE_CONFIG[inv.invoice_type]?.label}</Typography>
//             </Box>
//             <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
//               {inv.exported && <Chip label="Eksp." size="small" color="secondary" variant="outlined" sx={{ fontSize: 10, height: 20 }} />}
//               <StatusChip inv={inv} />
//             </Box>
//           </Box>
//           <Typography variant="body2">{inv.buyer_name || '—'}</Typography>
//           <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
//             <Typography variant="body2" color="text.secondary">{fmtDate(inv.invoice_date)}</Typography>
//             <Typography fontWeight={700}>{fmtAmount(inv.amount_with_vat || inv.amount_wo_vat, inv.currency)}</Typography>
//           </Box>
//           <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end' }}><RowActions inv={inv} /></Box>
//         </Box>
//       </Box>
//     </Paper>
//   );

//   const totalPages = Math.ceil((activeCategory === 'periodines' ? recurringTotal : total) / limit);
//   const currentPage = Math.floor(offset / limit) + 1;

//   // ══════════════════════════════════════════
//   // Render
//   // ══════════════════════════════════════════

//   return (
//     <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto', overflowX: 'hidden' }}>
//       {/* Header */}
//       <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
//         <Typography variant="h1" sx={{ color: palette.primary, fontWeight: 500, fontSize: 24 }}>Sąskaitų išrašymas</Typography>
//         <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
//           {activeCategory !== 'periodines' && (
//             <Tooltip title={exportDisabled ? exportDisabledReason : ''} placement="bottom" disableHoverListener={!exportDisabled}>
//               <span>
//                 <Button
//                   variant="outlined" color="primary"
//                   startIcon={exportLoading ? <CircularProgress size={16} /> : <ExportIcon />}
//                   onClick={handleExport}
//                   disabled={exportDisabled || exportLoading}
//                 >
//                   Eksportuoti{selectedExportCount ? ` (${selectedExportCount})` : ''} į {programLabel}
//                 </Button>
//               </span>
//             </Tooltip>
//           )}
//           <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/israsymas/nauja')}>Nauja sąskaita</Button>
//         </Box>
//       </Box>

//       <CategoryCards />

//       {/* Filters — hide date filters for periodines */}
//       {activeCategory !== 'periodines' && (
//         <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
//           <Grid2 container spacing={1.5} alignItems="center">
//             <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//               <TextField
//                 fullWidth size="small"
//                 placeholder="Ieškoti pagal pirkėją, numerį..."
//                 value={filters.q}
//                 onChange={(e) => updateFilter('q', e.target.value)}
//                 slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
//               />
//             </Grid2>
//             <Grid2 size={{ xs: 6, sm: 3, md: 2 }}>
//               <TextField
//                 fullWidth size="small" select label="Tipas"
//                 value={filters.invoice_type}
//                 onChange={(e) => updateFilter('invoice_type', e.target.value)}
//                 SelectProps={{ MenuProps: { disableScrollLock: true }, displayEmpty: true }}
//                 InputLabelProps={{ shrink: true }}
//               >
//                 <MenuItem value="">Visi</MenuItem>
//                 <MenuItem value="isankstine">Išankstinė SF</MenuItem>
//                 <MenuItem value="pvm_saskaita">PVM SF</MenuItem>
//                 <MenuItem value="saskaita">SF (be PVM)</MenuItem>
//                 <MenuItem value="kreditine">Kreditinė SF</MenuItem>
//               </TextField>
//             </Grid2>
//             <Grid2 size={{ xs: 6, sm: 3, md: 2 }}>
//               <DateField size="small" label="Nuo" value={filters.date_from} onChange={(v) => updateFilter('date_from', v)} />
//             </Grid2>
//             <Grid2 size={{ xs: 6, sm: 3, md: 2 }}>
//               <DateField size="small" label="Iki" value={filters.date_to} onChange={(v) => updateFilter('date_to', v)} />
//             </Grid2>
//             {showExportedFilter && (
//               <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                 <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
//                   <Chip
//                     label="Eksportuotos" size="small" variant="filled"
//                     onClick={() => handleExportedFilterClick('exported')}
//                     sx={{
//                       cursor: 'pointer', fontWeight: 500, fontSize: 12, borderRadius: 1.5,
//                       backgroundColor: exportedFilter === 'exported' ? '#616161' : '#eeeeee',
//                       color: exportedFilter === 'exported' ? '#fff' : '#555',
//                       '&:hover': { backgroundColor: exportedFilter === 'exported' ? '#757575' : '#e0e0e0' },
//                     }}
//                   />
//                   <Chip
//                     label="Neeksportuotos" size="small" variant="filled"
//                     onClick={() => handleExportedFilterClick('not_exported')}
//                     sx={{
//                       cursor: 'pointer', fontWeight: 500, fontSize: 12, borderRadius: 1.5,
//                       backgroundColor: exportedFilter === 'not_exported' ? '#616161' : '#eeeeee',
//                       color: exportedFilter === 'not_exported' ? '#fff' : '#555',
//                       '&:hover': { backgroundColor: exportedFilter === 'not_exported' ? '#757575' : '#e0e0e0' },
//                     }}
//                   />
//                 </Box>
//               </Grid2>
//             )}
//           </Grid2>
//         </Paper>
//       )}

//       {/* ═══ Content ═══ */}
//       {activeCategory === 'periodines' ? (
//         // ── Periodinės sąskaitos ──
//         recurringLoading ? (
//           <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
//         ) : recurringInvoices.length === 0 ? (
//           <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
//             <Typography variant="h6" color="text.secondary">Periodinių sąskaitų nerasta</Typography>
//             <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/israsymas/nauja')} sx={{ mt: 2 }}>
//               Sukurti periodinę sąskaitą
//             </Button>
//           </Paper>
//         ) : isMobile ? (
//           <Box>
//             {recurringInvoices.map((rec) => (
//               <Paper key={rec.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 1 }}>
//                 <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
//                   <Box>
//                     <Typography fontWeight={700} fontSize={13}>{rec.document_series} · {TYPE_CONFIG[rec.invoice_type]?.label}</Typography>
//                     <Typography variant="body2">{rec.buyer_name || '—'}</Typography>
//                   </Box>
//                   <Chip label={RECURRING_STATUS[rec.status]?.label} color={RECURRING_STATUS[rec.status]?.color} size="small" variant="outlined" />
//                 </Box>
//                 <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
//                   <Typography variant="caption" color="text.secondary">{fmtFrequency(rec)}</Typography>
//                   <Typography fontWeight={700} fontSize={13}>{fmtAmount(rec.estimated_amount, rec.currency)}</Typography>
//                 </Box>
//                 <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                   <Typography variant="caption" color="text.secondary">
//                     Sekanti: {rec.next_run_at ? fmtDate(rec.next_run_at.split('T')[0]) : '—'}
//                   </Typography>
//                   <RecurringRowActions rec={rec} />
//                 </Box>
//               </Paper>
//             ))}
//           </Box>
//         ) : (
//           <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
//             <Table size="small">
//               <TableHead>
//                 <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, py: 1.5, backgroundColor: '#f5f5f5' } }}>
//                   <TableCell>Tipas</TableCell>
//                   <TableCell>Serija</TableCell>
//                   <TableCell>Pirkėjas</TableCell>
//                   <TableCell>Dažnumas</TableCell>
//                   <TableCell>Statusas</TableCell>
//                   <TableCell>Sekanti sąskaita</TableCell>
//                   <TableCell align="center">Išrašyta</TableCell>
//                   <TableCell align="right">Suma</TableCell>
//                   <TableCell align="left">Veiksmai</TableCell>
//                 </TableRow>
//               </TableHead>
//               <TableBody>
//                 {recurringInvoices.map((rec) => (
//                   <TableRow key={rec.id} hover sx={{ '& td': { py: 1.2 }, cursor: 'pointer' }}
//                     onClick={() => {
//                       if (rec.last_invoice) navigate(`/israsymas/${rec.last_invoice}`);
//                       else openPlanDialog(rec.id);
//                     }}
//                   >
//                     <TableCell>
//                       <Typography variant="caption" fontWeight={600}>{TYPE_CONFIG[rec.invoice_type]?.label}</Typography>
//                     </TableCell>
//                     <TableCell>
//                       <Typography fontWeight={700} fontSize={13}>{rec.document_series || '—'}</Typography>
//                     </TableCell>
//                     <TableCell>{rec.buyer_name || '—'}</TableCell>
//                     <TableCell>
//                       <Typography variant="body2" fontSize={13}>{fmtFrequency(rec)}</Typography>
//                     </TableCell>
//                     <TableCell>
//                       <Chip
//                         label={RECURRING_STATUS[rec.status]?.label || rec.status}
//                         color={RECURRING_STATUS[rec.status]?.color || 'default'}
//                         size="small" variant="outlined"
//                       />
//                     </TableCell>
//                     <TableCell>
//                       <Typography fontSize={13}>
//                         {rec.next_run_at ? fmtDate(rec.next_run_at.split('T')[0]) : '—'}
//                       </Typography>
//                     </TableCell>
//                     <TableCell align="center">
//                       <Typography fontSize={13} fontWeight={600}>{rec.generation_count}</Typography>
//                     </TableCell>
//                     <TableCell align="right">
//                       <Typography fontWeight={700} fontSize={13}>{fmtAmount(rec.estimated_amount, rec.currency)}</Typography>
//                     </TableCell>
//                     <TableCell align="left" onClick={(e) => e.stopPropagation()}>
//                       <RecurringRowActions rec={rec} />
//                     </TableCell>
//                   </TableRow>
//                 ))}
//               </TableBody>
//             </Table>
//           </TableContainer>
//         )
//       ) : loading ? (
//         <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
//       ) : invoices.length === 0 ? (
//         <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
//           <Typography variant="h6" color="text.secondary">Sąskaitų nerasta</Typography>
//         </Paper>
//       ) : isMobile ? (
//         <Box>
//           <Box sx={{ display: 'flex', alignItems: 'center', py: 1, px: 0.5, mb: 1 }}>
//             <Checkbox size="small" indeterminate={someSelected} checked={allSelected} onChange={handleSelectAll} />
//             <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>Pasirinkti visus ({exportableIds.length})</Typography>
//           </Box>
//           {invoices.map((inv) => <MobileCard key={inv.id} inv={inv} />)}
//         </Box>
//       ) : (
//         <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
//           <Table size="small">
//             <TableHead>
//               <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, py: 1.5, backgroundColor: '#f5f5f5' } }}>
//                 <TableCell padding="checkbox">
//                   <Checkbox size="small" indeterminate={someSelected} checked={allSelected} onChange={handleSelectAll} />
//                 </TableCell>
//                 <TableCell>Tipas</TableCell>
//                 <TableCell>Serija-Numeris</TableCell>
//                 <TableCell>Statusas</TableCell>
//                 <TableCell>Pirkėjas</TableCell>
//                 <TableCell>Išrašymo data</TableCell>
//                 <TableCell>Mokėti iki</TableCell>
//                 <TableCell align="center">Suma</TableCell>
//                 <TableCell align="center">Eksp.</TableCell>
//                 <TableCell align="left">Veiksmai</TableCell>
//               </TableRow>
//             </TableHead>
//             <TableBody>
//               {invoices.map((inv) => (
//                 <TableRow key={inv.id} hover sx={{ '& td': { py: 1.2 } }}>
//                   <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
//                     <RowCheckbox inv={inv} />
//                   </TableCell>
//                   <TableCell>
//                     <Typography variant="caption" sx={{ fontWeight: 600 }}>{TYPE_CONFIG[inv.invoice_type]?.label || inv.invoice_type}</Typography>
//                   </TableCell>
//                   <TableCell>
//                     <NumberLink inv={inv} />
//                   </TableCell>
//                   <TableCell><StatusChip inv={inv} /></TableCell>
//                   <TableCell>{inv.buyer_name || '—'}</TableCell>
//                   <TableCell>{fmtDate(inv.invoice_date)}</TableCell>
//                   <TableCell>
//                     <Typography fontSize={13} color={isOverdue(inv) ? 'error.main' : 'text.primary'} fontWeight={isOverdue(inv) ? 600 : 400}>
//                       {fmtDate(inv.due_date)}
//                     </Typography>
//                   </TableCell>
//                   <TableCell align="right">
//                     <Typography fontWeight={700} fontSize={13}>
//                       {fmtAmount(inv.pvm_tipas === 'taikoma' ? inv.amount_with_vat : inv.amount_wo_vat, inv.currency)}
//                     </Typography>
//                   </TableCell>
//                   <TableCell align="center">
//                     {inv.exported ? (
//                       <Tooltip title={inv.exported_at ? `Eksportuota: ${fmtDate((inv.exported_at || '').split('T')[0])}` : 'Eksportuota'}>
//                         <Chip label="✓" size="small" color="success" variant="outlined" sx={{ minWidth: 32, fontSize: 12 }} />
//                       </Tooltip>
//                     ) : (
//                       <Typography variant="caption" color="text.disabled">—</Typography>
//                     )}
//                   </TableCell>
//                   <TableCell align="left"><RowActions inv={inv} /></TableCell>
//                 </TableRow>
//               ))}
//             </TableBody>
//           </Table>
//         </TableContainer>
//       )}

//       {/* Pagination */}
//       {totalPages > 1 && (
//         <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, gap: 1 }}>
//           <Button size="small" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>← Ankstesnis</Button>
//           <Typography sx={{ lineHeight: '32px', fontSize: 14 }}>{currentPage} / {totalPages}</Typography>
//           <Button size="small" disabled={offset + limit >= (activeCategory === 'periodines' ? recurringTotal : total)} onClick={() => setOffset(offset + limit)}>Kitas →</Button>
//         </Box>
//       )}

//       {/* ── Invoice Preview Dialog ── */}
//       <InvoicePreviewDialog
//         open={!!previewInvoiceId}
//         onClose={() => setPreviewInvoiceId(null)}
//         invoiceId={previewInvoiceId}
//         disableScrollLock
//       />

//       {/* ── Plan & History Dialog ── */}
//       <Dialog
//         open={planDialog.open}
//         onClose={() => setPlanDialog({ open: false, recurringId: null, data: null, loading: false })}
//         maxWidth="sm" fullWidth disableScrollLock
//       >
//         <DialogTitle>Siuntimo planas ir istorija</DialogTitle>
//         <DialogContent>
//           {planDialog.loading ? (
//             <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
//           ) : planDialog.data ? (
//             <Box>
//               {/* Istorija */}
//               {planDialog.data.past?.length > 0 && (
//                 <>
//                   <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>Istorija</Typography>
//                   <Box sx={{ mb: 2 }}>
//                     {planDialog.data.past.map((run, i) => (
//                       <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5, borderBottom: '1px solid #f0f0f0' }}>
//                         <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
//                           <Typography variant="body2" fontSize={13}>{fmtDate(run.date)}</Typography>
//                           <Chip
//                             label={run.status === 'success' ? 'Sėkminga' : run.status === 'failed' ? 'Nepavyko' : 'Vykdoma'}
//                             color={run.status === 'success' ? 'success' : run.status === 'failed' ? 'error' : 'default'}
//                             size="small" variant="outlined"
//                             sx={{ fontSize: 11, height: 20 }}
//                           />
//                         </Box>
//                         {run.invoice_id && (
//                           <Typography
//                             variant="body2" fontSize={12}
//                             sx={{ color: palette.primary, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
//                             onClick={() => {
//                               setPlanDialog((p) => ({ ...p, open: false }));
//                               navigate(`/israsymas/${run.invoice_id}`);
//                             }}
//                           >
//                             Peržiūrėti →
//                           </Typography>
//                         )}
//                       </Box>
//                     ))}
//                   </Box>
//                 </>
//               )}

//               {/* Planas */}
//               {planDialog.data.future?.length > 0 && (
//                 <>
//                   <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>Būsimos sąskaitos</Typography>
//                   <Box>
//                     {planDialog.data.future.map((date, i) => (
//                       <Box key={i} sx={{ py: 0.5, borderBottom: '1px solid #f0f0f0' }}>
//                         <Typography variant="body2" fontSize={13}>{fmtDate(date)}</Typography>
//                       </Box>
//                     ))}
//                   </Box>
//                 </>
//               )}

//               {!planDialog.data.past?.length && !planDialog.data.future?.length && (
//                 <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
//                   Nėra duomenų
//                 </Typography>
//               )}
//             </Box>
//           ) : null}
//         </DialogContent>
//         <DialogActions>
//           <Button onClick={() => setPlanDialog({ open: false, recurringId: null, data: null, loading: false })}>
//             Uždaryti
//           </Button>
//         </DialogActions>
//       </Dialog>

//       {/* ── Mark Paid Dialog ── */}
//       <MarkPaidDialog
//         open={!!markPaidInvoice}
//         onClose={() => setMarkPaidInvoice(null)}
//         invoice={markPaidInvoice}
//         onConfirm={handleMarkPaidConfirm}
//       />

//       {/* ── Payment Proof Dialog ── */}
//       <PaymentProofDialog
//         open={!!paymentProofInvoiceId}
//         onClose={() => setPaymentProofInvoiceId(null)}
//         invoiceId={paymentProofInvoiceId}
//         onConfirmAllocation={handleConfirmAllocation}
//         onRejectAllocation={handleRejectAllocation}
//         onRemoveManualPayment={handleRemoveManualPayment}
//         onRefresh={() => { loadInvoices(); loadSummary(); }}
//       />

//       {/* Confirm dialog */}
//       <Dialog open={confirmDialog.open} onClose={closeConfirm} disableScrollLock>
//         <DialogTitle>{confirmDialog.title}</DialogTitle>
//         <DialogContent><DialogContentText>{confirmDialog.text}</DialogContentText></DialogContent>
//         <DialogActions>
//           <Button onClick={closeConfirm}>Atšaukti</Button>
//           <Button variant="contained" onClick={executeConfirm}>Patvirtinti</Button>
//         </DialogActions>
//       </Dialog>

//       <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
//         <Alert severity={snack.severity} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
//       </Snackbar>
//     </Box>
//   );
// };

// export default InvoiceListPage;