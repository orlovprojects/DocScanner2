import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box, Paper, Typography, Button, IconButton, Chip, TextField, MenuItem,
  Dialog, DialogTitle, DialogContent, CircularProgress, InputAdornment,
  Divider, Skeleton, LinearProgress, Tabs, Tab, Checkbox, FormControlLabel,
  Tooltip, useMediaQuery, useTheme, Autocomplete,
} from '@mui/material';
import {
  Search as SearchIcon,
  Close as CloseIcon,
  ArrowBack as BackIcon,
  Link as LinkIcon,
  LocalOffer as TagIcon,
  AutoAwesome as SuggestIcon,
  ArrowDownward as IncomingIcon,
  ArrowUpward as OutgoingIcon,
  PauseCircleOutline as DeferIcon,
  VisibilityOff as IgnoreIcon,
  Add as AddIcon,
  AccountBalance as BankFeeIcon,
  ReceiptLong as VmiIcon,
  Shield as SodraIcon,
  Groups as SalaryIcon,
  SwapHoriz as TransferIcon,
  Wallet as OwnerIcon,
  LocalShipping as CustomsIcon,
  Description as TplIcon,
  Delete as DeleteIcon,
  CheckCircle as BalancedIcon,
  ErrorOutline as UnbalancedIcon,
  Edit as EditIcon,
  MoreHoriz as MoreIcon,
  TableRows as TableIcon,
  Savings as AdvanceIcon,
  RemoveCircleOutline as WriteoffIcon,
  Autorenew as AgainIcon,
  LinkOff as UnlinkIcon,
  Visibility as ViewIcon,
  ExpandMore as ExpandIcon,
  ChevronRight as CollapsedIcon,
  Save as SaveIcon,
  PanTool as ManualIcon,
  CheckCircle as DoneIcon,
} from '@mui/icons-material';
import { invoicingApi } from '../api/invoicingApi';
import DocumentPreviewPane from './DocumentPreviewPane';

// ── Helpers ──

const fmt = (v, c = 'EUR') =>
  v == null || v === '' ? '—'
    : `${parseFloat(v).toFixed(2).replace('.', ',')} ${c === 'EUR' ? '€' : c}`;

const fmtD = (d) => {
  if (!d) return '—';
  const p = String(d).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
};

const toISO = (d) => {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 10);
};

const shiftDays = (iso, days) => {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
};

const STATUS_OPTS = [
  { v: 'open', l: 'Visi neapmokėti' },
  { v: 'unpaid', l: 'Neapmokėti' },
  { v: 'partial', l: 'Dalinai apmokėti' },
  { v: 'all', l: 'Visi' },
];

const PAY_STATUS_CFG = {
  unpaid: { label: 'Neapmokėta', bg: '#fff3e0', fg: '#e65100' },
  partial: { label: 'Dalinai', bg: '#e3f2fd', fg: '#1565c0' },
  paid: { label: 'Apmokėta', bg: '#e8f5e9', fg: '#2e7d32' },
};

// Įmontuotos kategorijos — atitinka CATEGORY_DEFAULTS backend'e
const BUILTIN_CATS = [
  { key: 'bank_fee',         label: 'Banko mokestis',        acct: '6810',  Icon: BankFeeIcon,  dir: 'outgoing' },
  { key: 'tax_vmi',          label: 'VMI mokestis',          acct: '4481',  Icon: VmiIcon,      dir: 'outgoing' },
  { key: 'tax_sodra',        label: 'Sodra / VSDFV',         acct: '4482',  Icon: SodraIcon,    dir: 'outgoing' },
  { key: 'tax_customs',      label: 'Muitinės mokestis',     acct: '4493',  Icon: CustomsIcon,  dir: 'outgoing' },
  { key: 'salary',           label: 'Darbo užmokestis',      acct: '4480',  Icon: SalaryIcon,   dir: 'outgoing' },
  { key: 'owner_withdrawal', label: 'Savininko paėmimas',    acct: '24472', Icon: OwnerIcon,    dir: 'outgoing' },
  { key: 'owner_deposit',    label: 'Savininko įnašas',      acct: '308',   Icon: OwnerIcon,    dir: 'incoming' },
  { key: 'loan_payment',     label: 'Paskolos grąžinimas',   acct: '4410',  Icon: TransferIcon, dir: 'outgoing' },
  { key: 'loan_received',    label: 'Gauta paskola',         acct: '4410',  Icon: TransferIcon, dir: 'incoming' },
  { key: 'other_expense',    label: 'Kitos sąnaudos',        acct: '6401',  Icon: TagIcon,      dir: 'outgoing' },
  { key: 'other_income',     label: 'Kitos pajamos',         acct: '5401',  Icon: TagIcon,      dir: 'incoming' },
];

const norm = (s) => String(s || '').toLowerCase().trim();

// ── Score ring ──

const ScoreRing = ({ value, size = 40 }) => {
  const pct = Math.round((value || 0) * 100);
  const c = pct >= 70 ? '#2e7d32' : pct >= 45 ? '#ed6c02' : '#9e9e9e';
  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <CircularProgress variant="determinate" value={pct} size={size}
        sx={{ color: c, '& .MuiCircularProgress-circle': { strokeLinecap: 'round' } }} />
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography fontSize={11} fontWeight={700} color={c}>{pct}%</Typography>
      </Box>
    </Box>
  );
};

// ── Document row ──

const DocRow = ({ doc, onOpen, highlight }) => {
  const cfg = PAY_STATUS_CFG[doc.payment_status] || PAY_STATUS_CFG.unpaid;
  const reasons = Object.entries(doc.match_reasons || {});

  return (
    <Paper variant="outlined" onClick={() => onOpen(doc)}
      sx={{
        p: 1.5, mb: 1, borderRadius: 2, cursor: 'pointer',
        borderColor: highlight ? '#2e7d32' : 'divider',
        bgcolor: highlight ? 'rgba(46,125,50,0.03)' : undefined,
        transition: 'all 0.15s',
        '&:hover': { bgcolor: '#f5f5f5', borderColor: highlight ? '#2e7d32' : '#bdbdbd' },
      }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {highlight && <ScoreRing value={doc.score} />}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Typography fontSize={13} fontWeight={700}>{doc.full_number || '—'}</Typography>
            <Chip label={cfg.label} size="small"
              sx={{ fontSize: 10, height: 18, fontWeight: 700, bgcolor: cfg.bg, color: cfg.fg }} />
          </Box>
          <Typography fontSize={12} color="text.secondary" noWrap>
            {doc.counterparty_name || '—'}
            {doc.counterparty_code ? ` · ${doc.counterparty_code}` : ''}
          </Typography>
          <Typography fontSize={11} color="text.disabled">
            {fmtD(doc.invoice_date)}
            {doc.due_date ? ` · terminas ${fmtD(doc.due_date)}` : ''}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography fontSize={14} fontWeight={700}>
            {fmt(doc.amount_with_vat, doc.currency)}
          </Typography>
          {parseFloat(doc.allocated_amount || 0) > 0 && (
            <Typography fontSize={11} color="text.secondary">
              likutis {fmt(doc.remaining_amount, doc.currency)}
            </Typography>
          )}
        </Box>
      </Box>

      {highlight && reasons.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
          {reasons.slice(0, 4).map(([k, v]) => (
            <Chip key={k} size="small"
              label={v === true || v === 'True' ? k : `${k}: ${v}`}
              sx={{ fontSize: 10, height: 20, bgcolor: '#f1f8e9', color: '#33691e', fontWeight: 600 }} />
          ))}
        </Box>
      )}
    </Paper>
  );
};

// ── Type tile ──

const TypeTile = ({ icon, label, sub, active, isTpl, onClick }) => {
  const accent = isTpl ? '#00695c' : '#1565c0';
  return (
    <Paper variant="outlined" onClick={onClick}
      sx={{
        p: 1.25, borderRadius: 2, cursor: 'pointer', display: 'flex',
        alignItems: 'center', gap: 1, transition: 'all 0.15s', minWidth: 0,
        borderColor: active ? accent : (isTpl ? 'rgba(0,105,92,0.25)' : 'divider'),
        bgcolor: active
          ? (isTpl ? 'rgba(0,105,92,0.06)' : 'rgba(21,101,192,0.05)')
          : (isTpl ? 'rgba(0,105,92,0.02)' : undefined),
        '&:hover': { bgcolor: isTpl ? 'rgba(0,105,92,0.07)' : '#f5f5f5' },
      }}>
      <Box sx={{ display: 'flex', flexShrink: 0, color: active ? accent : (isTpl ? '#4db6ac' : 'text.secondary') }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography fontSize={12} fontWeight={600} noWrap
          color={active ? accent : 'text.primary'}>{label}</Typography>
        <Typography fontSize={10} color="text.disabled" noWrap>{sub}</Typography>
      </Box>
    </Paper>
  );
};

// ══════════════════════════════════════════

const ResolveTransactionDialog = ({
  open, txn, initialTab = 'match', onClose, onSuccess, showSnack,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const show = showSnack || (() => {});

  const [tab, setTab] = useState(initialTab);

  // ── Match tab ──
  const [txnInfo, setTxnInfo] = useState(null);
  const [suggested, setSuggested] = useState([]);
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [q, setQ] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState('open');
  const [sameCurrency, setSameCurrency] = useState(true);

  const [sel, setSel] = useState(null);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Likučio uždarymas ──
  const [remMode, setRemMode] = useState(null);       // null | 'advance' | 'writeoff'
  const [remRows, setRemRows] = useState([]);         // [{_id, cpty, name, code, amount}]
  const [cptyOpts, setCptyOpts] = useState([]);
  const [cptyQ, setCptyQ] = useState('');
  const remIdRef = useRef(0);
  const [unlinking, setUnlinking] = useState(null);

  // ── DK: esami įrašai ──
  const [jeData, setJeData] = useState(null);
  const [jeLoad, setJeLoad] = useState(false);
  const [jeOpen, setJeOpen] = useState({});       // { [jeId]: true }
  const [jeEdit, setJeEdit] = useState(null);      // { id, lines: [...] }
  const [jeSaving, setJeSaving] = useState(false);

  // ── DK tab ──
  const [tplQ, setTplQ] = useState('');
  const [templates, setTemplates] = useState([]);
  const [tplLoad, setTplLoad] = useState(false);
  const [pick, setPick] = useState(null);   // { kind:'cat'|'tpl', key/id, label, acct }
  const [rememberRule, setRememberRule] = useState(false);
  const [showAllTypes, setShowAllTypes] = useState(false);

  const [dkLines, setDkLines] = useState([]);
  const [dkDesc, setDkDesc] = useState('');
  const [dkBank, setDkBank] = useState({ code: '2711', name: 'Bankas' });
  const [saveAsTpl, setSaveAsTpl] = useState(false);
  const [tplName, setTplName] = useState('');
  const lineIdRef = useRef(0);
  const dkInitRef = useRef(false);
  const bankLoadedRef = useRef(false);

  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const senRef = useRef(null);
  const obsRef = useRef(null);
  const listRef = useRef(null);

  const txnDate = txn?.transaction_date ? toISO(txn.transaction_date) : '';
  const direction = txnInfo?.direction || txn?.direction || 'outgoing';
  const isIncoming = direction === 'incoming';

  // ── Helpers (perkelti aukštyn) ──
  const num = (v) => {
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };
  const f2 = (n) => n.toFixed(2).replace('.', ',');
  const normAmount = (v) =>
    String(v ?? '').replace('.', ',').replace(/[^\d,]/g, '').replace(/(,.*),/g, '$1');

  const src = () => txnInfo || txn || {};

  // ── Reset ──
  useEffect(() => {
    if (!open || !txn) return;
    setTab(initialTab);
    setQ(''); setTplQ('');
    setStatus('open'); setSameCurrency(true);
    setSel(null); setAmount(''); setPick(null);
    setRemMode(null); setRemRows([]); setCptyQ('');
    setJeData(null); setJeOpen({}); setJeEdit(null);
    setRememberRule(false); setShowAllTypes(false);
    setDkLines([]); setDkDesc('');
    setSaveAsTpl(false); setTplName('');
    dkInitRef.current = false;
    bankLoadedRef.current = false;
    setDateFrom(txnDate ? shiftDays(txnDate, -30) : '');
    setDateTo(txnDate ? shiftDays(txnDate, 5) : '');
  }, [open, txn?.id, initialTab]);

  // ── Load candidates ──
  const load = useCallback(async (reset = true) => {
    if (!open || !txn || tab !== 'match') return;
    if (reset) { setLoading(true); offsetRef.current = 0; hasMoreRef.current = true; }
    else setLoadingMore(true);

    try {
      const params = {
        limit: 30, offset: reset ? 0 : offsetRef.current,
        status, same_currency: sameCurrency ? 1 : 0,
      };
      if (q) params.q = q;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const { data } = await invoicingApi.getMatchCandidates(txn.id, params);
      const r = data.results || [];

      if (reset) {
        setTxnInfo(data.transaction || null);
        setSuggested(data.suggested || []);
        setResults(r);
        setTotal(data.count || 0);
        offsetRef.current = r.length;
        if (listRef.current) listRef.current.scrollTop = 0;
      } else {
        setResults(prev => [...prev, ...r]);
        offsetRef.current += r.length;
      }
      hasMoreRef.current = offsetRef.current < (data.count || 0);
    } catch {
      show('Nepavyko įkelti dokumentų', 'error');
    } finally {
      if (reset) setLoading(false); else setLoadingMore(false);
    }
  }, [open, txn?.id, tab, q, dateFrom, dateTo, status, sameCurrency]);

  useEffect(() => {
    if (!open || tab !== 'match') return;
    const t = setTimeout(() => load(true), q ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, open, tab]);

  // ── Load templates + bank account ──
  useEffect(() => {
    if (!open || tab !== 'dk' || !txn?.id) return;
    let alive = true;
    setTplLoad(true);

    Promise.all([
      invoicingApi.getUserDKTemplates({ direction }).catch(() => ({ data: {} })),
      invoicingApi.getDKTemplates(txn.id).catch(() => ({ data: {} })),
    ])
      .then(([tplRes, bankRes]) => {
        if (!alive) return;
        setTemplates(tplRes.data?.results || []);
        const bank = bankRes.data?.bank_account;
        if (bank?.code) setDkBank(bank);
        bankLoadedRef.current = true;
      })
      .finally(() => { if (alive) setTplLoad(false); });

    return () => { alive = false; };
  }, [open, tab, txn?.id, direction]);

  // Užpildom eilutes tik kai realus banko sąskaitos kodas jau atėjo.
  useEffect(() => {
    if (!open || tab !== 'dk' || dkInitRef.current) return;
    if (!bankLoadedRef.current || tplLoad) return;
    dkInitRef.current = true;
    setDkLines(emptyLines());
    setDkDesc(txnInfo?.counterparty_name || txn?.counterparty_name || '');
  }, [open, tab, tplLoad, dkBank.code, jeData]);

  // ── Infinite scroll ──
  useEffect(() => {
    if (!open || sel || tab !== 'match') return;
    obsRef.current?.disconnect();
    obsRef.current = new IntersectionObserver(
      (e) => { if (e[0].isIntersecting && hasMoreRef.current && !loadingMore && !loading) load(false); },
      { root: listRef.current, rootMargin: '200px' },
    );
    if (senRef.current) obsRef.current.observe(senRef.current);
    return () => obsRef.current?.disconnect();
  }, [open, sel, tab, load, loading, loadingMore]);

  // ── Kontrahentų sąrašas avansui ──
  useEffect(() => {
    if (!open || remMode !== 'advance') return;
    let alive = true;
    const t = setTimeout(() => {
      invoicingApi.getCounterpartyOptions({ q: cptyQ, direction })
        .then(({ data }) => { if (alive) setCptyOpts(data.results || []); })
        .catch(() => {});
    }, cptyQ ? 300 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [open, remMode, cptyQ, direction]);

  // ── Esami DK įrašai ──
  const loadJE = useCallback(async () => {
    if (!open || !txn?.id) return;
    setJeLoad(true);
    try {
      const { data } = await invoicingApi.getTransactionJournalEntries(txn.id);
      setJeData(data);
      const first = {};
      if (data.document_entries?.[0]) first[`d${data.document_entries[0].id}`] = true;
      if (data.payment_entries?.[0]) first[`p${data.payment_entries[0].id}`] = true;
      setJeOpen(first);
    } catch {
      setJeData(null);
    } finally { setJeLoad(false); }
  }, [open, txn?.id]);

  useEffect(() => {
    if (!open || tab !== 'dk') return;
    loadJE();
  }, [open, tab, loadJE]);

  // ── DK: esamų įrašų redagavimas ──
  const startEditJE = (e) => {
    setJeEdit({
      id: e.id,
      lines: e.lines.map((l, i) => ({
        _id: `e_${e.id}_${i}`,
        side: l.side === 'D' ? 'debit' : 'credit',
        account_code: l.account_code,
        account_name: l.account_name,
        amount: f2(num(l.amount)),
      })),
    });
  };

  const updEditLine = (lid, f, v) =>
    setJeEdit(prev => ({
      ...prev,
      lines: prev.lines.map(l => l._id === lid ? { ...l, [f]: v } : l),
    }));

  const addEditLine = () =>
    setJeEdit(prev => ({
      ...prev,
      lines: [...prev.lines, {
        _id: `e_${prev.id}_${Date.now()}`,
        side: 'debit', account_code: '', account_name: '', amount: '',
      }],
    }));

  const delEditLine = (lid) =>
    setJeEdit(prev => prev.lines.length <= 2 ? prev : {
      ...prev,
      lines: prev.lines.filter(l => l._id !== lid),
    });

  const editTotals = useMemo(() => {
    if (!jeEdit) return { d: 0, k: 0, ok: false };
    let d = 0, k = 0;
    for (const l of jeEdit.lines) {
      const a = num(l.amount);
      if (l.side === 'debit') d += a; else k += a;
    }
    return {
      d, k,
      ok: Math.abs(d - k) < 0.01 && d > 0
        && jeEdit.lines.every(l => String(l.account_code).trim() && num(l.amount) > 0),
    };
  }, [jeEdit]);

  const saveJE = async () => {
    if (!jeEdit || !editTotals.ok) return;
    setJeSaving(true);
    try {
      await invoicingApi.updateJournalEntry(jeEdit.id, {
        lines: jeEdit.lines.map(l => ({
          side: l.side,
          account_code: String(l.account_code).trim(),
          account_name: l.account_name,
          amount: String(l.amount).replace(',', '.'),
        })),
      });
      show('DK įrašas atnaujintas');
      setJeEdit(null);
      await loadJE();
      onSuccess?.();
    } catch (e) {
      show(e.response?.data?.detail || 'Nepavyko išsaugoti', 'error');
    } finally { setJeSaving(false); }
  };

  // ── Filtered types ──
  const visibleCats = useMemo(() => {
    const dirOk = (c) => c.dir === direction || c.dir === 'both';
    let list = BUILTIN_CATS.filter(dirOk);
    if (tplQ) list = list.filter(c => norm(c.label).includes(norm(tplQ)) || c.acct.includes(tplQ));
    return list;
  }, [direction, tplQ]);

  const visibleTpls = useMemo(() => {
    let list = templates;
    if (tplQ) list = list.filter(t => norm(t.name).includes(norm(tplQ)));
    return list;
  }, [templates, tplQ]);

  // Šablonai pirmi (pagal times_used), kategorijos užpildo likusias vietas.
  const allTiles = useMemo(() => [
    ...visibleTpls.map(t => ({
      kind: 'tpl', id: t.id, label: t.name,
      sub: (t.lines || []).map(l => l.code === '[bank]' ? dkBank.code : l.code).join(' / '),
    })),
    ...visibleCats.map(c => ({
      kind: 'cat', key: c.key, label: c.label, sub: c.acct, acct: c.acct, Icon: c.Icon,
    })),
  ], [visibleTpls, visibleCats, dkBank.code]);

  const TILES_COLLAPSED = 5;
  const TILES_EXPANDED = 9;

  const tilesShown = tplQ
    ? allTiles
    : allTiles.slice(0, showAllTypes ? TILES_EXPANDED : TILES_COLLAPSED);

  const hiddenCount = allTiles.length - tilesShown.length;

  const openDoc = (doc) => {
    setSel(doc);
    // Operacijos likutis, perskaičiuotas į dokumento valiutą
    const txnRemInDoc = num(txnInfo?.remaining_amount) * docToTxnRatio(doc, true);
    const docRemaining = num(doc.remaining_amount || doc.amount_with_vat);
    setAmount(f2(Math.min(txnRemInDoc, docRemaining)));
  };

  /**
   * Kursas tarp dokumento ir operacijos valiutų.
   * remaining_txn / remaining_amount duoda santykį iš backend'o.
   * inverse=true → operacijos valiuta → dokumento valiuta
   */
  const docToTxnRatio = (doc, inverse = false) => {
    if (!doc) return 1;
    const rd = num(doc.remaining_amount);
    const rt = num(doc.remaining_txn);
    if (rd <= 0 || rt <= 0) return 1;
    return inverse ? rd / rt : rt / rd;
  };

  // Susiejama suma (dokumento valiuta) → operacijos valiuta
  const amountInTxnCur = () => {
    if (!sel) return 0;
    return num(amount) * docToTxnRatio(sel);
  };

  const isCrossCurrency = () =>
    !!sel && (sel.currency || 'EUR') !== (txnInfo?.currency || 'EUR');

  // ── Likutis ──
  const txnRemaining = () =>
    num(txnInfo?.remaining_amount ?? txnInfo?.amount ?? txn?.amount);

  const hasRemainder = () =>
    num(txnInfo?.allocated_amount) > 0 && txnRemaining() > 0.005;

  const remTotal = remRows.reduce((s, r) => s + num(r.amount), 0);
  const remDiff = txnRemaining() - remTotal;
  const remValid =
    remRows.length > 0 &&
    Math.abs(remDiff) < 0.005 &&
    remRows.every(r => num(r.amount) > 0) &&
    (remMode !== 'advance' || remRows.every(r => (r.name || '').trim()));

  const openRemainder = (mode) => {
    setRemMode(mode);
    setRemRows([{
      _id: `r_${++remIdRef.current}`,
      cpty: null,
      name: mode === 'advance'
        ? (txnInfo?.counterparty_name || txn?.counterparty_name || '')
        : '',
      code: txnInfo?.counterparty_code || '',
      amount: f2(txnRemaining()),
    }]);
  };

  const updRem = (id, f, v) =>
    setRemRows(prev => prev.map(r => r._id === id ? { ...r, [f]: v } : r));

  const addRemRow = () =>
    setRemRows(prev => [...prev, {
      _id: `r_${++remIdRef.current}`, cpty: null, name: '', code: '',
      amount: f2(Math.max(remDiff, 0)),
    }]);

  const delRemRow = (id) =>
    setRemRows(prev => prev.length <= 1 ? prev : prev.filter(r => r._id !== id));

  const doAllocateRemainder = async () => {
    if (!remValid) return;
    setSaving(true);
    try {
      await invoicingApi.allocateRemainder(txn.id, {
        kind: remMode,
        items: remRows.map(r => ({
          amount: String(r.amount).replace(',', '.'),
          counterparty_id: r.cpty?.id || null,
          counterparty_name: r.name || '',
          counterparty_code: r.code || '',
        })),
      });
      show(remMode === 'advance' ? 'Likutis perkeltas į avansą' : 'Likutis nurašytas');
      onSuccess?.(); onClose();
    } catch (e) {
      show(e.response?.data?.detail || 'Nepavyko', 'error');
    } finally { setSaving(false); }
  };

  const doUnlink = async (allocId) => {
    if (!window.confirm('Panaikinti šį susiejimą? DK įrašas bus ištrintas.')) return;
    setUnlinking(allocId);
    try {
      await invoicingApi.rejectAllocation(allocId);
      show('Susiejimas panaikintas');
      onSuccess?.();
      await load(true);
    } catch (e) {
      show(e.response?.data?.detail || 'Nepavyko', 'error');
    } finally { setUnlinking(null); }
  };

  const openAllocDoc = (a) => {
    if (!a.document_id) return;
    setSel({
      type: a.type,
      id: a.document_id,
      full_number: a.full_number,
      counterparty_name: a.counterparty_name,
      currency: a.currency,
      preview_url: a.preview_url,
      amount_with_vat: a.amount,
      allocated_amount: a.amount,
      remaining_amount: 0,
      match_reasons: a.match_reasons,
      score: num(a.confidence),
      _allocStatus: a.alloc_status,
      _readonly: true,
    });
  };

  // ── DK editor helpers ──
  const nextLineId = () => `l_${++lineIdRef.current}`;

  // DK visada EUR. Jei operacija kita valiuta — imam amount_eur.
  const eurAmount = () => {
    // Jei operacija dalinai paskirstyta — DK kuriamas tik likučiui.
    if (jeData && num(jeData.remaining_eur) > 0.005
        && num(jeData.remaining_eur) < num(jeData.txn_amount_eur) - 0.005) {
      return num(jeData.remaining_eur);
    }
    const s = src();
    const cur = (s.currency || 'EUR').toUpperCase();
    if (cur === 'EUR') return num(s.amount);
    return num(s.amount_eur);
  };

  const isPartialDk = () =>
    !!jeData && num(jeData.remaining_eur) > 0.005
    && num(jeData.remaining_eur) < num(jeData.txn_amount_eur) - 0.005;

  const feeEur = () => {
    // Komisinis jau įtrauktas į pirmąjį įrašą — likučiui jo nekartojam.
    if (isPartialDk()) return 0;
    const s = src();
    const cur = (s.currency || 'EUR').toUpperCase();
    const fee = cur === 'EUR' ? num(s.fee_amount) : num(s.fee_amount_eur);
    return fee + num(s.exchange_fee);
  };

  const isForeign = () => (src().currency || 'EUR').toUpperCase() !== 'EUR';
  const noRate = () => isForeign() && eurAmount() <= 0;

  // Modified mkLine with locked parameter
  const mkLine = (side, code, name, amount, locked = null) => ({
    _id: nextLineId(), side, account_code: code, account_name: name,
    amount: f2(amount), locked,   // 'bank' | 'fee' | null
  });

  /**
   * Bankinė pusė = kiek realiai judėjo sąskaitoje.
   * Antra pusė = suma be komisinio.
   * Komisinis (valiutos keitimo / PayPal) — atskira D eilutė 6810.
   */
  function baseLines(otherCode = '', otherName = '') {
    const total = eurAmount();
    const fee = feeEur();
    const lines = [];

    if (isIncoming) {
      // Gavome neto, komisinis išskaičiuotas iš sumos.
      lines.push(mkLine('debit', dkBank.code, dkBank.name, total - fee, 'bank'));
      if (fee > 0) lines.push(mkLine('debit', '6810', 'Kitos finansinės sąnaudos', fee, 'fee'));
      lines.push(mkLine('credit', otherCode, otherName, total));
    } else {
      // Sumokėjome, komisinis nurašytas papildomai.
      lines.push(mkLine('debit', otherCode, otherName, total - fee));
      if (fee > 0) lines.push(mkLine('debit', '6810', 'Kitos finansinės sąnaudos', fee, 'fee'));
      lines.push(mkLine('credit', dkBank.code, dkBank.name, total, 'bank'));
    }
    return lines;
  }

  function emptyLines() {
    return baseLines('', '');
  }

  /**
   * Šablono eilutės. Banko ir komisinio eilutes visada dedam mes patys —
   * šablonas atsakingas tik už "savo" sąskaitas.
   */
  const buildLines = (raw) => {
    const total = eurAmount();
    const fee = feeEur();

    // Iš šablono imam viską, išskyrus banko ir komisinio eilutes.
    const own = (raw || []).filter(l => {
      const code = l.code === '[bank]' ? dkBank.code : (l.code || l.account_code || '');
      return code !== dkBank.code && code !== '6810';
    });

    if (own.length === 0) return baseLines('', '');

    const ownAmount = (total - fee) / own.length;
    const ownLines = own.map(l => mkLine(
      l.side,
      l.code || l.account_code || '',
      l.name || l.account_name || '',
      ownAmount,
    ));

    const bankSide = isIncoming ? 'debit' : 'credit';
    const bankAmount = isIncoming ? total - fee : total;
    const bankLine = mkLine(bankSide, dkBank.code, dkBank.name, bankAmount, 'bank');
    const feeLine = fee > 0
      ? mkLine('debit', '6810', 'Kitos finansinės sąnaudos', fee, 'fee')
      : null;

    return isIncoming
      ? [bankLine, ...(feeLine ? [feeLine] : []), ...ownLines]
      : [...ownLines, ...(feeLine ? [feeLine] : []), bankLine];
  };

  const resetDk = () => {
    setPick(null);
    setDkLines(emptyLines());
    setDkDesc(txnInfo?.counterparty_name || txn?.counterparty_name || '');
    setSaveAsTpl(false);
    setTplName('');
  };

  const applyPick = (p) => {
    // Antras paspaudimas ant to paties — išvalom.
    const same = pick
      && pick.kind === p.kind
      && (p.kind === 'tpl' ? pick.id === p.id : pick.key === p.key);
    if (same) { resetDk(); return; }

    setPick(p);
    const cp = txnInfo?.counterparty_name || txn?.counterparty_name || '';

    if (p.kind === 'tpl') {
      const tpl = templates.find(t => t.id === p.id);
      setDkLines(buildLines(tpl?.lines));
      setDkDesc(cp ? `${p.label}: ${cp}` : p.label);
      return;
    }

    setDkLines(baseLines(p.acct, p.label));
    setDkDesc(cp ? `${p.label}: ${cp}` : p.label);
  };

  const updLine = (id, f, v) =>
    setDkLines(prev => prev.map(l => l._id === id ? { ...l, [f]: v } : l));

  const addLine = () =>
    setDkLines(prev => [...prev, {
      _id: nextLineId(), side: 'debit', account_code: '', account_name: '', amount: '',
    }]);

  const delLine = (id) =>
    setDkLines(prev => {
      const editable = prev.filter(l => !l.locked);
      if (editable.length <= 1) return prev;
      return prev.filter(l => l._id !== id);
    });

  const dkTotals = useMemo(() => {
    let d = 0, k = 0, bank = 0;
    for (const l of dkLines) {
      const a = num(l.amount);
      if (l.side === 'debit') d += a; else k += a;
      if (String(l.account_code).trim() === String(dkBank.code)) bank += a;
    }
    const target = eurAmount();
    return {
      d, k, bank, target,
      balanced: Math.abs(d - k) < 0.01 && d > 0,
      full: target > 0 && Math.abs(bank - target) < 0.01,
    };
  }, [dkLines, dkBank.code, txnInfo, txn]);

  const dkError = useMemo(() => {
    if (noRate()) return 'Nėra valiutos kurso — DK įrašo sukurti negalima';
    if (!dkLines.every(l => String(l.account_code).trim())) return '';
    if (!dkLines.every(l => num(l.amount) > 0)) return '';
    if (!dkTotals.balanced) return 'Debetas ir kreditas turi sutapti';
    if (!dkTotals.full) {
      return `Banko sąskaitos (${dkBank.code}) suma turi būti ${f2(dkTotals.target)} €`;
    }
    if (saveAsTpl && tplName.trim().length < 2) return '';
    return '';
  }, [dkLines, dkTotals, saveAsTpl, tplName, dkBank.code]);

  const dkValid =
    !noRate() &&
    dkTotals.balanced &&
    dkTotals.full &&
    dkLines.every(l => String(l.account_code).trim() && num(l.amount) > 0) &&
    (!saveAsTpl || tplName.trim().length >= 2);

  const doRegisterDK = async () => {
    if (!dkValid) return;
    setSaving(true);
    try {
      await invoicingApi.registerDK(txn.id, {
        direction,
        description: dkDesc,
        lines: dkLines.map(l => ({
          side: l.side,
          account_code: String(l.account_code).trim(),
          account_name: l.account_name,
          amount: String(l.amount).replace(',', '.'),
        })),
        category: pick?.kind === 'cat' ? pick.key : '',
        create_rule: rememberRule,
        apply_to_similar: rememberRule,
        save_as_template: saveAsTpl,
        template_name: tplName.trim(),
        template_id: pick?.kind === 'tpl' ? pick.id : null,
      });
      show(saveAsTpl ? 'DK sukurtas, šablonas išsaugotas' : 'DK įrašas sukurtas');
      onSuccess?.(); onClose();
    } catch (e) {
      show(e.response?.data?.detail || 'Nepavyko sukurti DK', 'error');
    } finally { setSaving(false); }
  };

  const doMatch = async () => {
    if (!sel) return;
    setSaving(true);
    try {
      const amt = String(amount).replace(',', '.');
      const payload = sel.type === 'invoice'
        ? { invoice_id: sel.id, amount: amt }
        : { purchase_id: sel.id, amount: amt };
      if (isCrossCurrency()) {
        payload.amount_txn = amountInTxnCur().toFixed(2);
      }
      const { data } = await invoicingApi.matchTransaction(txn.id, payload);
      const left = num(data?.remaining_amount);

      if (left > 0.005) {
        show(`Susieta. Liko paskirstyti ${f2(left)}`);
        setSel(null);
        setRemMode(null);
        onSuccess?.();
        await load(true);
      } else {
        show('Susieta');
        onSuccess?.(); onClose();
      }
    } catch (e) {
      show(e.response?.data?.detail || 'Nepavyko susieti', 'error');
    } finally { setSaving(false); }
  };

  const doDefer = async () => {
    setSaving(true);
    try {
      await invoicingApi.deferTransaction(txn.id, { days: 30 });
      show('Atidėta 30 d.');
      onSuccess?.(); onClose();
    } catch (e) {
      show(e.response?.data?.detail || 'Nepavyko', 'error');
    } finally { setSaving(false); }
  };

  const doIgnore = async () => {
    if (!window.confirm('Ignoruoti šią operaciją? DK įrašas nebus kuriamas.')) return;
    setSaving(true);
    try {
      await invoicingApi.ignoreTransaction(txn.id, {});
      show('Operacija ignoruojama');
      onSuccess?.(); onClose();
    } catch (e) {
      show(e.response?.data?.detail || 'Nepavyko', 'error');
    } finally { setSaving(false); }
  };

  const quickRange = (days) => {
    if (!txnDate) return;
    setDateFrom(days ? shiftDays(txnDate, -days) : '');
    setDateTo(days ? shiftDays(txnDate, 5) : '');
  };

  const diff = sel ? num(txnInfo?.remaining_amount) - amountInTxnCur() : 0;

  // ── TXN panel ──
  const txnPanel = (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Box sx={{
          width: 30, height: 30, borderRadius: '50%', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          bgcolor: isIncoming ? '#e8f5e9' : '#ffebee',
        }}>
          {isIncoming
            ? <IncomingIcon sx={{ fontSize: 17, color: '#2e7d32' }} />
            : <OutgoingIcon sx={{ fontSize: 17, color: '#d32f2f' }} />}
        </Box>
        <Typography fontSize={13} fontWeight={700}>{isIncoming ? 'Įplauka' : 'Išlaida'}</Typography>
      </Box>

      <Typography fontSize={22} fontWeight={700}
        color={isIncoming ? 'success.main' : 'text.primary'}>
        {fmt(txnInfo?.amount ?? txn?.amount, txnInfo?.currency || txn?.currency)}
      </Typography>
      <Typography fontSize={12} color="text.secondary" sx={{ mb: 2 }}>
        {fmtD(txnInfo?.transaction_date || txn?.transaction_date)}
      </Typography>

      <Divider sx={{ mb: 1.5 }} />

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <Field label="Kontrahentas" value={txnInfo?.counterparty_name || txn?.counterparty_name} bold />
        <Field label="Kodas" value={txnInfo?.counterparty_code} />
        <Field label="IBAN" value={txnInfo?.counterparty_account} small />
        <Field label="Dok. nr." value={txnInfo?.doc_number} />
        <Field label="Nuoroda" value={txnInfo?.reference_number} />
        <Field label="Bankas" value={txnInfo?.bank_name} />

        {txnInfo?.payment_purpose && (
          <Box sx={{ mt: 1.5 }}>
            <Typography fontSize={11} color="text.secondary">Paskirtis</Typography>
            <Typography fontSize={12} sx={{ wordBreak: 'break-word', mt: 0.25 }}>
              {txnInfo.payment_purpose}
            </Typography>
          </Box>
        )}

        {num(txnInfo?.allocated_amount) > 0 && (
          txnRemaining() <= 0.005 ? (
            <Paper variant="outlined" sx={{
              mt: 2, p: 1.25, borderRadius: 2, bgcolor: '#e8f5e9',
              borderColor: 'rgba(46,125,50,0.3)',
              display: 'flex', alignItems: 'center', gap: 1,
            }}>
              <DoneIcon sx={{ fontSize: 20, color: '#2e7d32' }} />
              <Box>
                <Typography fontSize={12} fontWeight={700} color="#2e7d32">
                  Operacija pilnai sudengta
                </Typography>
                <Typography fontSize={11} color="text.secondary">
                  Paskirstyta {fmt(txnInfo.allocated_amount, txnInfo.currency)}
                </Typography>
              </Box>
            </Paper>
          ) : (
            <Paper variant="outlined" sx={{
              mt: 2, p: 1.25, borderRadius: 2, bgcolor: 'rgba(255,152,0,0.05)',
              borderColor: 'rgba(230,81,0,0.35)',
            }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Typography fontSize={11} color="text.secondary">Paskirstyta</Typography>
                <Typography fontSize={12} fontWeight={700}>
                  {fmt(txnInfo.allocated_amount, txnInfo.currency)}
                </Typography>
              </Box>

              <Box sx={{ my: 0.75, height: 5, borderRadius: 3, bgcolor: '#eee', overflow: 'hidden' }}>
                <Box sx={{
                  height: '100%', bgcolor: '#e65100', borderRadius: 3,
                  width: `${Math.min(100, Math.max(2,
                    num(txnInfo.allocated_amount) / num(txnInfo.amount) * 100))}%`,
                }} />
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Typography fontSize={11} color="text.secondary">Liko</Typography>
                <Typography fontSize={14} fontWeight={700} color="#e65100">
                  {fmt(txnRemaining(), txnInfo.currency)}
                </Typography>
              </Box>

              {!remMode ? (
                <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Button size="small" variant="outlined" startIcon={<AdvanceIcon sx={{ fontSize: 15 }} />}
                    onClick={() => openRemainder('advance')}
                    sx={{ fontSize: 11, textTransform: 'none', justifyContent: 'flex-start' }}>
                    Likutį į avansą
                  </Button>
                  <Button size="small" variant="outlined" startIcon={<WriteoffIcon sx={{ fontSize: 15 }} />}
                    onClick={() => openRemainder('writeoff')}
                    sx={{ fontSize: 11, textTransform: 'none', justifyContent: 'flex-start' }}>
                    Nurašyti likutį
                  </Button>
                </Box>
              ) : (
                <Box sx={{ mt: 1 }}>
                  {remRows.map(r => (
                    <Box key={r._id} sx={{ mb: 0.75 }}>
                      {remMode === 'advance' ? (
                        <Autocomplete freeSolo size="small" options={cptyOpts}
                          sx={{ mb: 0.5, bgcolor: '#fff' }}
                          value={r.cpty} inputValue={r.name}
                          onInputChange={(_, v, reason) => {
                            if (reason !== 'reset') { updRem(r._id, 'name', v); setCptyQ(v); }
                          }}
                          onChange={(_, v) => {
                            if (typeof v === 'string') { updRem(r._id, 'name', v); return; }
                            setRemRows(prev => prev.map(x => x._id === r._id
                              ? { ...x, cpty: v, name: v?.name || '', code: v?.code || '' } : x));
                          }}
                          getOptionLabel={(o) => typeof o === 'string' ? o : (o?.name || '')}
                          isOptionEqualToValue={(o, v) => o?.name === v?.name}
                          renderOption={(props, o) => (
                            <li {...props} key={`${o.id || 'x'}-${o.name}`}>
                              <Box sx={{ minWidth: 0 }}>
                                <Typography fontSize={12} noWrap>{o.name}</Typography>
                                <Typography fontSize={10} color="text.disabled" noWrap>
                                  {o.code || '—'}{o.in_directory ? '' : ' · iš dokumentų'}
                                </Typography>
                              </Box>
                            </li>
                          )}
                          renderInput={(p) => <TextField {...p} placeholder="Kontrahentas" />}
                          slotProps={{ popper: { disableScrollLock: true } }} />
                      ) : (
                        <Typography fontSize={10} color="text.secondary" sx={{ mb: 0.5 }}>
                          Nurašoma į {isIncoming ? '6401 Kitos sąnaudos' : '5401 Kitos pajamos'}
                        </Typography>
                      )}

                      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                        <TextField size="small" value={r.amount} fullWidth
                          onChange={e => updRem(r._id, 'amount', normAmount(e.target.value))}
                          inputProps={{ inputMode: 'decimal',
                            style: { textAlign: 'right', fontSize: 12, fontWeight: 700 } }}
                          sx={{ bgcolor: '#fff' }}
                          InputProps={{ endAdornment: (
                            <InputAdornment position="end" sx={{ '& p': { fontSize: 11 } }}>
                              {txnInfo?.currency === 'EUR' ? '€' : txnInfo?.currency}
                            </InputAdornment>
                          ) }} />
                        {remMode === 'advance' && remRows.length > 1 && (
                          <IconButton size="small" onClick={() => delRemRow(r._id)}
                            sx={{ p: 0.25, color: '#bdbdbd', '&:hover': { color: 'error.main' } }}>
                            <DeleteIcon sx={{ fontSize: 15 }} />
                          </IconButton>
                        )}
                      </Box>

                      {(txnInfo?.currency || 'EUR') !== 'EUR' && num(r.amount) > 0 && (
                        <Typography fontSize={10} color="text.disabled" sx={{ mt: 0.25 }}>
                          ≈ {f2(num(r.amount) * num(txnInfo?.amount_eur) / num(txnInfo?.amount))} €
                        </Typography>
                      )}
                    </Box>
                  ))}

                  {remMode === 'advance' && (
                    <Button size="small" startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                      onClick={addRemRow} sx={{ fontSize: 10, textTransform: 'none' }}>
                      Pridėti kontrahentą
                    </Button>
                  )}

                  <Typography fontSize={10} sx={{ mt: 0.5 }} fontWeight={600}
                    color={Math.abs(remDiff) < 0.005 ? 'success.main' : 'error.main'}>
                    {Math.abs(remDiff) < 0.005
                      ? `Paskirstyta ${f2(remTotal)} ✓`
                      : `Skirtumas ${f2(remDiff)}`}
                  </Typography>

                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75 }}>
                    <Button size="small" color="inherit" onClick={() => setRemMode(null)}
                      sx={{ fontSize: 10, textTransform: 'none', color: 'text.disabled' }}>
                      Atšaukti
                    </Button>
                    <Button size="small" variant="contained" fullWidth
                      disabled={saving || !remValid} onClick={doAllocateRemainder}
                      sx={{ fontSize: 11, textTransform: 'none' }}>
                      {saving ? <CircularProgress size={14} color="inherit" /> : 'Išsaugoti'}
                    </Button>
                  </Box>
                </Box>
              )}
            </Paper>
          )
        )}
      </Box>

      <Box sx={{ pt: 1.5, mt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button fullWidth size="small" variant="outlined" startIcon={<DeferIcon />}
          disabled={saving} onClick={doDefer}
          sx={{ mb: 0.75, fontSize: 12, textTransform: 'none', justifyContent: 'flex-start' }}>
          Atidėti 30 d.
        </Button>
        <Button fullWidth size="small" color="inherit" startIcon={<IgnoreIcon />}
          disabled={saving} onClick={doIgnore}
          sx={{ fontSize: 12, textTransform: 'none', justifyContent: 'flex-start', color: 'text.disabled' }}>
          Ignoruoti operaciją
        </Button>
      </Box>
    </Box>
  );

  // ── Match tab content ──
  const matchFilters = (
    <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#fafafa' }}>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField size="small" placeholder="Ieškoti pagal nr., pavadinimą, kodą..."
          value={q} onChange={e => setQ(e.target.value)}
          sx={{ flex: '1 1 220px', minWidth: 180, bgcolor: '#fff' }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
        <TextField size="small" select value={status} onChange={e => setStatus(e.target.value)}
          sx={{ minWidth: 150, bgcolor: '#fff' }}
          SelectProps={{ MenuProps: { disableScrollLock: true } }}>
          {STATUS_OPTS.map(o => <MenuItem key={o.v} value={o.v}>{o.l}</MenuItem>)}
        </TextField>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mt: 1 }}>
        <TextField size="small" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          sx={{ width: 145, bgcolor: '#fff' }} />
        <TextField size="small" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          sx={{ width: 145, bgcolor: '#fff' }} />
        {[30, 90, 180].map(d => (
          <Chip key={d} label={`${d} d.`} size="small" onClick={() => quickRange(d)}
            variant={dateFrom === shiftDays(txnDate, -d) ? 'filled' : 'outlined'}
            color={dateFrom === shiftDays(txnDate, -d) ? 'primary' : 'default'}
            sx={{ fontSize: 11, height: 24 }} />
        ))}
        <Chip label="Visos datos" size="small" onClick={() => quickRange(0)}
          variant={!dateFrom && !dateTo ? 'filled' : 'outlined'}
          color={!dateFrom && !dateTo ? 'primary' : 'default'}
          sx={{ fontSize: 11, height: 24 }} />
        <Chip label={sameCurrency ? `Tik ${txnInfo?.currency || txn?.currency || 'EUR'}` : 'Bet kokia valiuta'}
          size="small" onClick={() => setSameCurrency(v => !v)}
          variant={sameCurrency ? 'filled' : 'outlined'}
          color={sameCurrency ? 'primary' : 'default'}
          sx={{ fontSize: 11, height: 24 }} />
      </Box>
    </Box>
  );

  // ── Susieti dokumentai ──
  const allocList = txnInfo?.allocations || [];

  const linkedBlock = allocList.length > 0 && (
    <Box sx={{ px: 1.5, pt: 1.5 }}>
      <Typography fontSize={12} fontWeight={700} color="text.secondary" sx={{ mb: 0.75 }}>
        Susieta ({allocList.length})
      </Typography>

      {allocList.map(a => {
        const isDoc = a.kind === 'document';
        const label = isDoc
          ? (a.full_number || '—')
          : (a.kind === 'advance' ? 'Avansas' : 'Nurašymas');
        const sub = isDoc
          ? a.counterparty_name
          : (a.counterparty_name || (a.kind === 'advance' ? '2080 / 4420' : '6401 / 5401'));

        return (
          <Paper key={a.id} variant="outlined" sx={{
            p: 1, mb: 0.75, borderRadius: 2, display: 'flex',
            alignItems: 'center', gap: 1,
            bgcolor: isDoc ? '#f1f8e9' : '#f5f5f5',
            borderColor: isDoc ? 'rgba(46,125,50,0.25)' : 'divider',
          }}>
            {isDoc && (
              <Tooltip title={a.alloc_status === 'manual'
                ? 'Susieta rankiniu būdu'
                : `Susieta automatiškai · ${Math.round(num(a.confidence) * 100)}%`}>
                <Box sx={{ display: 'flex', flexShrink: 0 }}>
                  {a.alloc_status === 'manual'
                    ? <ManualIcon sx={{ fontSize: 16, color: '#78909c' }} />
                    : <SuggestIcon sx={{ fontSize: 16, color: '#2e7d32' }} />}
                </Box>
              </Tooltip>
            )}

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography fontSize={12} fontWeight={700} noWrap>{label}</Typography>
              <Typography fontSize={11} color="text.secondary" noWrap>{sub || '—'}</Typography>
            </Box>

            <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
              <Typography fontSize={13} fontWeight={700}>
                {fmt(a.amount, a.currency)}
              </Typography>
              {a.currency !== (txnInfo?.currency || 'EUR') && (
                <Typography fontSize={10} color="text.disabled">
                  {fmt(a.amount_txn, txnInfo?.currency)}
                  {a.doc_rate ? ` · kursas ${parseFloat(a.doc_rate).toFixed(4)}` : ''}
                </Typography>
              )}
            </Box>

            {isDoc && a.preview_url && (
              <Tooltip title="Peržiūrėti dokumentą">
                <IconButton size="small" onClick={() => openAllocDoc(a)}
                  sx={{ p: 0.5, color: 'text.secondary' }}>
                  <ViewIcon sx={{ fontSize: 17 }} />
                </IconButton>
              </Tooltip>
            )}

            <Tooltip title="Panaikinti susiejimą">
              <span>
                <IconButton size="small" disabled={unlinking === a.id}
                  onClick={() => doUnlink(a.id)}
                  sx={{ p: 0.5, color: '#bdbdbd', '&:hover': { color: 'error.main' } }}>
                  {unlinking === a.id
                    ? <CircularProgress size={15} />
                    : <UnlinkIcon sx={{ fontSize: 17 }} />}
                </IconButton>
              </span>
            </Tooltip>
          </Paper>
        );
      })}
    </Box>
  );

  const matchList = (
    <Box ref={listRef} sx={{ flex: 1, overflowY: 'auto', p: 1.5, minHeight: 0 }}>
      {loading ? (
        [1, 2, 3, 4].map(i => <Skeleton key={i} variant="rounded" height={78} sx={{ mb: 1, borderRadius: 2 }} />)
      ) : (
        <>
          {suggested.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                <SuggestIcon sx={{ fontSize: 16, color: '#2e7d32' }} />
                <Typography fontSize={12} fontWeight={700} color="#2e7d32">Labiausiai tikėtini</Typography>
              </Box>
              {suggested.map(d => <DocRow key={`s-${d.type}-${d.id}`} doc={d} onOpen={openDoc} highlight />)}
            </Box>
          )}

          <Typography fontSize={12} fontWeight={700} color="text.secondary" sx={{ mb: 1 }}>
            Visi dokumentai ({total})
          </Typography>

          {results.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Dokumentų nerasta. Pabandykite išplėsti datų intervalą.
              </Typography>
            </Paper>
          ) : results.map(d => <DocRow key={`r-${d.type}-${d.id}`} doc={d} onOpen={openDoc} />)}

          <Box ref={senRef} sx={{ height: 1 }} />
          {loadingMore && <LinearProgress sx={{ maxWidth: 200, mx: 'auto', mt: 1 }} />}
        </>
      )}
    </Box>
  );

  // ── DK: JeRow komponentas ──
  const JeRow = ({ e, prefix, editable }) => {
    const key = `${prefix}${e.id}`;
    const isOpen = !!jeOpen[key];
    const editing = jeEdit?.id === e.id;
    const bad = Math.abs(num(e.difference)) > 0.009;

    return (
      <Paper variant="outlined" sx={{ mb: 0.75, borderRadius: 2, overflow: 'hidden' }}>
        <Box onClick={() => setJeOpen(p => ({ ...p, [key]: !p[key] }))}
          sx={{
            display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.75,
            cursor: 'pointer', bgcolor: isOpen ? '#fafafa' : undefined,
            '&:hover': { bgcolor: '#f5f5f5' },
          }}>
          {isOpen
            ? <ExpandIcon sx={{ fontSize: 17, color: 'text.disabled' }} />
            : <CollapsedIcon sx={{ fontSize: 17, color: 'text.disabled' }} />}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography fontSize={12} fontWeight={700} noWrap>{e.label}</Typography>
            {e.sublabel && (
              <Typography fontSize={11} color="text.secondary" noWrap>{e.sublabel}</Typography>
            )}
          </Box>
          {bad && <UnbalancedIcon sx={{ fontSize: 15, color: '#d32f2f' }} />}
          <Typography fontSize={10} color="text.disabled" sx={{ flexShrink: 0 }}>
            #{e.id}
          </Typography>
        </Box>

        {isOpen && (
          <Box sx={{ px: 1, pb: 1 }}>
            {(editing ? jeEdit.lines : e.lines).map(l => {
              const side = editing ? l.side : (l.side === 'D' ? 'debit' : 'credit');
              return (
                <Box key={l._id || l.id} sx={{
                  display: 'flex', alignItems: 'center', gap: 0.75, py: 0.4,
                  borderBottom: '1px solid', borderColor: 'divider',
                  '&:last-of-type': { borderBottom: 'none' },
                }}>
                  <Chip label={side === 'debit' ? 'D' : 'K'} size="small"
                    color={side === 'debit' ? 'primary' : 'secondary'}
                    onClick={editing
                      ? () => updEditLine(l._id, 'side', side === 'debit' ? 'credit' : 'debit')
                      : undefined}
                    sx={{ fontSize: 10, height: 18, minWidth: 24, fontWeight: 700,
                      cursor: editing ? 'pointer' : 'default' }} />

                  {editing ? (
                    <TextField size="small" variant="standard" value={l.account_code}
                      onChange={ev => updEditLine(l._id, 'account_code', ev.target.value)}
                      sx={{ width: 58, '& input': { fontSize: 11, fontWeight: 700 } }} />
                  ) : (
                    <Typography fontSize={11} fontWeight={700} sx={{ width: 58 }}>
                      {l.account_code}
                    </Typography>
                  )}

                  {editing ? (
                    <TextField size="small" variant="standard" value={l.account_name}
                      onChange={ev => updEditLine(l._id, 'account_name', ev.target.value)}
                      sx={{ flex: 1, minWidth: 0, '& input': { fontSize: 11 } }} />
                  ) : (
                    <Typography fontSize={11} color="text.secondary"
                      sx={{ flex: 1, minWidth: 0 }} noWrap>
                      {l.account_name}
                    </Typography>
                  )}

                  {editing ? (
                    <TextField size="small" variant="standard" value={l.amount}
                      onChange={ev => updEditLine(l._id, 'amount', normAmount(ev.target.value))}
                      inputProps={{ inputMode: 'decimal',
                        style: { textAlign: 'right', fontSize: 11, fontWeight: 700 } }}
                      sx={{ width: 76 }} />
                  ) : (
                    <Typography fontSize={11} fontWeight={700}
                      sx={{ width: 76, textAlign: 'right' }}>
                      {f2(num(l.amount))}
                    </Typography>
                  )}

                  <Box sx={{ width: 20 }}>
                    {editing && jeEdit.lines.length > 2 && (
                      <IconButton size="small" onClick={() => delEditLine(l._id)}
                        sx={{ p: 0.2, color: '#bdbdbd', '&:hover': { color: 'error.main' } }}>
                        <DeleteIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                  </Box>
                </Box>
              );
            })}

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 1, mt: 0.75 }}>
              {editing ? (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Button size="small" startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                      onClick={addEditLine} sx={{ fontSize: 10, textTransform: 'none' }}>
                      Eilutė
                    </Button>
                    <Typography fontSize={10}
                      color={editTotals.ok ? 'success.main' : 'error.main'} fontWeight={600}>
                      D {f2(editTotals.d)} / K {f2(editTotals.k)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Button size="small" color="inherit" onClick={() => setJeEdit(null)}
                      sx={{ fontSize: 10, textTransform: 'none', color: 'text.disabled' }}>
                      Atšaukti
                    </Button>
                    <Button size="small" variant="contained" disabled={jeSaving || !editTotals.ok}
                      onClick={saveJE} startIcon={<SaveIcon sx={{ fontSize: 14 }} />}
                      sx={{ fontSize: 10, textTransform: 'none' }}>
                      Išsaugoti
                    </Button>
                  </Box>
                </>
              ) : (
                <>
                  <Typography fontSize={10} color="text.disabled">
                    {e.status_display} · {fmtD(e.entry_date)}
                  </Typography>
                  {editable && (
                    <Button size="small" startIcon={<EditIcon sx={{ fontSize: 14 }} />}
                      onClick={() => startEditJE(e)}
                      sx={{ fontSize: 10, textTransform: 'none' }}>
                      Redaguoti
                    </Button>
                  )}
                </>
              )}
            </Box>
          </Box>
        )}
      </Paper>
    );
  };

  // ── DK: kairė kolona (esami įrašai) ──
  const jeColumn = (
    <Box sx={{ flex: '0 0 46%', overflowY: 'auto', p: 1.5, minHeight: 0,
      borderRight: '1px solid', borderColor: 'divider', bgcolor: '#fcfcfc' }}>
      {jeLoad ? (
        [1, 2, 3].map(i => <Skeleton key={i} variant="rounded" height={54}
          sx={{ mb: 0.75, borderRadius: 2 }} />)
      ) : !jeData ? (
        <Typography fontSize={12} color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          DK įrašų nėra
        </Typography>
      ) : (
        <>
          {jeData.document_entries?.length > 0 && (
            <>
              <Typography fontSize={11} fontWeight={700} color="text.secondary"
                sx={{ mb: 0.25, letterSpacing: 0.3 }}>
                DOKUMENTŲ ĮRAŠAI
              </Typography>
              <Typography fontSize={10} color="text.disabled" sx={{ mb: 1 }}>
                Sukurti užpajamavus dokumentus
              </Typography>
              {jeData.document_entries.map(e =>
                <JeRow key={`d${e.id}`} e={e} prefix="d" editable={false} />)}
              <Divider sx={{ my: 1.5 }} />
            </>
          )}

          <Typography fontSize={11} fontWeight={700} color="text.secondary"
            sx={{ mb: 0.25, letterSpacing: 0.3 }}>
            OPERACIJOS ĮRAŠAI
          </Typography>
          <Typography fontSize={10} color="text.disabled" sx={{ mb: 1 }}>
            Sukurti susiejus operaciją
          </Typography>

          {jeData.payment_entries?.length > 0
            ? jeData.payment_entries.map(e =>
                <JeRow key={`p${e.id}`} e={e} prefix="p" editable />)
            : (
              <Typography fontSize={11} color="text.disabled" sx={{ py: 1 }}>
                Dar nėra
              </Typography>
            )}

          {jeData.payment_entries?.length > 0 && (
            <Paper variant="outlined" sx={{
              mt: 1.5, p: 1, borderRadius: 2,
              bgcolor: jeData.balanced ? '#e8f5e9' : '#fff8e1',
              borderColor: jeData.balanced ? 'rgba(46,125,50,0.3)' : 'rgba(230,81,0,0.3)',
            }}>
              <Typography fontSize={11} fontWeight={600}
                color={jeData.balanced ? '#2e7d32' : '#e65100'}>
                Banko pusė: {f2(num(jeData.bank_total))} iš {f2(num(jeData.txn_amount_eur))} €
              </Typography>
              {!jeData.balanced && (
                <Typography fontSize={10} color="#e65100">
                  Nepadengta {f2(num(jeData.txn_amount_eur) - num(jeData.bank_total))} €
                </Typography>
              )}
            </Paper>
          )}
        </>
      )}
    </Box>
  );

  // ── DK tab content ──
  const dkForm = (
    <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, minHeight: 0 }}>
      {isPartialDk() && (
        <Paper variant="outlined" sx={{
          p: 1, mb: 1.5, borderRadius: 2, bgcolor: 'rgba(255,152,0,0.06)',
          borderColor: 'rgba(230,81,0,0.3)',
        }}>
          <Typography fontSize={11} fontWeight={600} color="#e65100">
            Likutis: {fmt(jeData.remaining_amount, jeData.currency)}
            {jeData.currency !== 'EUR' ? ` (${f2(num(jeData.remaining_eur))} €)` : ''}
          </Typography>
          <Typography fontSize={10} color="text.secondary">
            DK įrašas kuriamas tik likučiui
          </Typography>
        </Paper>
      )}

      <TextField size="small" fullWidth placeholder="Ieškoti tipo arba šablono..."
        value={tplQ} onChange={e => setTplQ(e.target.value)} sx={{ mb: 1.5 }}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />

      {tplLoad ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.75 }}>
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} variant="rounded" height={46} sx={{ borderRadius: 2 }} />)}
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.75 }}>
          {tilesShown.map(t => t.kind === 'tpl' ? (
            <TypeTile key={`t-${t.id}`} isTpl icon={<TplIcon sx={{ fontSize: 17 }} />}
              label={t.label} sub={t.sub}
              active={pick?.kind === 'tpl' && pick.id === t.id}
              onClick={() => applyPick({ kind: 'tpl', id: t.id, label: t.label })} />
          ) : (
            <TypeTile key={`c-${t.key}`} icon={<t.Icon sx={{ fontSize: 17 }} />}
              label={t.label} sub={t.sub}
              active={pick?.kind === 'cat' && pick.key === t.key}
              onClick={() => applyPick({ kind: 'cat', key: t.key, acct: t.acct, label: t.label })} />
          ))}
          {(hiddenCount > 0 || showAllTypes) && !tplQ && (
            <TypeTile icon={<MoreIcon sx={{ fontSize: 17 }} />}
              label={showAllTypes ? 'Rodyti mažiau' : 'Rodyti kitus'}
              sub={showAllTypes ? '' : `+${hiddenCount}`}
              onClick={() => setShowAllTypes(v => !v)} />
          )}
        </Box>
      )}

      {tplQ && allTiles.length === 0 && (
        <Typography fontSize={12} color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          Nieko nerasta
        </Typography>
      )}

      {/* ── Korespondencija ── */}
      <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75, gap: 1 }}>
          <Typography fontSize={13} fontWeight={700}>Korespondencija</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {dkTotals.balanced && dkTotals.full
              ? <BalancedIcon sx={{ fontSize: 15, color: '#2e7d32' }} />
              : <UnbalancedIcon sx={{ fontSize: 15, color: '#d32f2f' }} />}
            <Typography fontSize={11} fontWeight={600}
              color={dkTotals.balanced && dkTotals.full ? '#2e7d32' : '#d32f2f'}>
              D {f2(dkTotals.d)} / K {f2(dkTotals.k)} €
            </Typography>
          </Box>
        </Box>

        {isForeign() && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75, px: 1, py: 0.5,
            borderRadius: 1.5, bgcolor: noRate() ? 'rgba(211,47,47,0.06)' : '#f5f5f5' }}>
            <Typography fontSize={11} color={noRate() ? 'error.main' : 'text.secondary'}>
              {noRate()
                ? `Operacija ${fmt(src().amount, src().currency)} — nėra valiutos kurso`
                : `${fmt(src().amount, src().currency)} → ${f2(eurAmount())} € (DK visada EUR)`}
            </Typography>
          </Box>
        )}

        {feeEur() > 0 && (
          <Typography fontSize={10} color="text.disabled" sx={{ mb: 0.75, display: 'block' }}>
            Įskaičiuotas mokestis: {f2(feeEur())} €
          </Typography>
        )}

        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', gap: 1, py: 0.5, px: 1, bgcolor: '#f5f5f5',
            borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography fontSize={10} color="text.secondary" sx={{ width: 30 }}>Pusė</Typography>
            <Typography fontSize={10} color="text.secondary" sx={{ width: 62 }}>Kodas</Typography>
            <Typography fontSize={10} color="text.secondary" sx={{ flex: 1 }}>Pavadinimas</Typography>
            <Typography fontSize={10} color="text.secondary" sx={{ width: 84, textAlign: 'right' }}>Suma</Typography>
            <Box sx={{ width: 24 }} />
          </Box>

          {dkLines.map(l => {
            const isBank = l.locked === 'bank';
            const isFee = l.locked === 'fee';
            const lockCode = isBank || isFee;
            return (
              <Box key={l._id} sx={{
                display: 'flex', alignItems: 'center', gap: 1, py: 0.5, px: 1,
                borderBottom: '1px solid', borderColor: 'divider',
                bgcolor: lockCode ? '#fafafa' : undefined,
                '&:last-child': { borderBottom: 'none' },
              }}>
                <Box sx={{ width: 30 }}>
                  <Chip label={l.side === 'debit' ? 'D' : 'K'} size="small"
                    color={l.side === 'debit' ? 'primary' : 'secondary'}
                    onClick={lockCode ? undefined : () =>
                      updLine(l._id, 'side', l.side === 'debit' ? 'credit' : 'debit')}
                    sx={{ fontSize: 11, height: 20, minWidth: 26, fontWeight: 700,
                      cursor: lockCode ? 'default' : 'pointer',
                      opacity: lockCode ? 0.7 : 1 }} />
                </Box>

                {lockCode ? (
                  <Tooltip title={isBank
                    ? 'Banko sąskaita parenkama automatiškai pagal išrašą'
                    : 'Valiutos keitimo / komisinis mokestis iš banko išrašo'}>
                    <Typography fontSize={12} fontWeight={700} sx={{ width: 62, color: 'text.secondary' }}>
                      {l.account_code}
                    </Typography>
                  </Tooltip>
                ) : (
                  <TextField size="small" variant="standard" value={l.account_code}
                    onChange={e => updLine(l._id, 'account_code', e.target.value)}
                    placeholder="Kodas"
                    sx={{ width: 62, '& input': { fontSize: 12, fontWeight: 700 } }} />
                )}

                {lockCode ? (
                  <Typography fontSize={12} noWrap sx={{ flex: 1, minWidth: 0, color: 'text.secondary' }}>
                    {l.account_name}
                  </Typography>
                ) : (
                  <TextField size="small" variant="standard" value={l.account_name}
                    onChange={e => updLine(l._id, 'account_name', e.target.value)}
                    placeholder="Pavadinimas"
                    sx={{ flex: 1, minWidth: 0, '& input': { fontSize: 12 } }} />
                )}

                {isBank ? (
                  <Typography fontSize={12} fontWeight={700}
                    sx={{ width: 84, textAlign: 'right', color: 'text.secondary' }}>
                    {l.amount}
                  </Typography>
                ) : (
                  <TextField size="small" variant="standard" value={l.amount}
                    onChange={e => updLine(l._id, 'amount', normAmount(e.target.value))}
                    placeholder="0,00"
                    inputProps={{ inputMode: 'decimal',
                      style: { textAlign: 'right', fontSize: 12, fontWeight: 700 } }}
                    sx={{ width: 84 }} />
                )}

                <Box sx={{ width: 24, display: 'flex', justifyContent: 'center' }}>
                  {!lockCode && dkLines.length > 2 && (
                    <IconButton size="small" onClick={() => delLine(l._id)}
                      sx={{ p: 0.25, color: '#bdbdbd', '&:hover': { color: 'error.main' } }}>
                      <DeleteIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  )}
                </Box>
              </Box>
            );
          })}
        </Paper>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.75 }}>
          <Button size="small" startIcon={<AddIcon sx={{ fontSize: 15 }} />} onClick={addLine}
            sx={{ fontSize: 11, textTransform: 'none' }}>Pridėti eilutę</Button>
          {pick && (
            <Typography fontSize={10} color="text.disabled"
              sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
              onClick={resetDk}>
              {pick.kind === 'tpl' ? 'Šablonas' : 'Tipas'}: {pick.label} · išvalyti
            </Typography>
          )}
        </Box>

        <TextField fullWidth size="small" label="Aprašymas" value={dkDesc}
          onChange={e => setDkDesc(e.target.value)} sx={{ mt: 1.5 }} />

        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          <FormControlLabel
            control={<Checkbox size="small" checked={saveAsTpl}
              onChange={e => {
                setSaveAsTpl(e.target.checked);
                if (e.target.checked && !tplName) setTplName(dkDesc.slice(0, 40));
              }} />}
            label={<Typography fontSize={12}>Išsaugoti kaip šabloną</Typography>}
            sx={{ ml: -0.5, mr: 0 }} />

          {saveAsTpl && (
            <TextField fullWidth size="small" placeholder="Šablono pavadinimas"
              value={tplName} onChange={e => setTplName(e.target.value)}
              error={tplName.trim().length > 0 && tplName.trim().length < 2}
              sx={{ mt: 0.5, mb: 0.5 }} />
          )}

          <FormControlLabel
            control={<Checkbox size="small" checked={rememberRule}
              onChange={e => setRememberRule(e.target.checked)} />}
            label={<Typography fontSize={12}>Įsiminti taisyklę šiam kontrahentui</Typography>}
            sx={{ ml: -0.5, mr: 0 }} />
        </Box>

        {dkError && (
          <Typography fontSize={11} color="error.main" sx={{ mt: 1 }}>
            {dkError}
          </Typography>
        )}

        <Button fullWidth variant="contained" sx={{ mt: 1.5 }}
          disabled={saving || !dkValid} onClick={doRegisterDK}>
          {saving ? <CircularProgress size={20} color="inherit" /> : 'Sukurti DK įrašą'}
        </Button>
      </Box>
    </Box>
  );

  const dkTab = (
    <Box sx={{ flex: 1, display: 'flex', minHeight: 0,
      flexDirection: isMobile ? 'column' : 'row' }}>
      {!isMobile && jeColumn}
      {dkForm}
      {isMobile && jeColumn}
    </Box>
  );

  // ── Overlay ──
  const overlay = sel && tab === 'match' && (
    <Box sx={{ position: 'absolute', inset: 0, bgcolor: '#fff', zIndex: 5, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{
        px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider',
        display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, bgcolor: '#fafafa',
      }}>
        <IconButton size="small" onClick={() => setSel(null)}><BackIcon fontSize="small" /></IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography fontSize={14} fontWeight={700} noWrap>{sel.full_number || '—'}</Typography>
          <Typography fontSize={11} color="text.secondary" noWrap>{sel.counterparty_name}</Typography>
        </Box>
        <Typography fontSize={15} fontWeight={700}>{fmt(sel.amount_with_vat, sel.currency)}</Typography>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: 'hidden' }}>
        <Box sx={{
          flex: isMobile ? '0 0 45%' : '1 1 60%', p: 1.5, overflow: 'auto', minHeight: 0,
          borderRight: isMobile ? 'none' : '1px solid',
          borderBottom: isMobile ? '1px solid' : 'none', borderColor: 'divider',
        }}>
          <DocumentPreviewPane url={sel.preview_url}
            maxHeight={isMobile ? 'calc(45vh - 60px)' : 'calc(85vh - 200px)'} />
        </Box>

        <Box sx={{ flex: isMobile ? 1 : '0 0 300px', p: 2, overflowY: 'auto', minHeight: 0 }}>
          <Field label="Data" value={fmtD(sel.invoice_date)} />
          {sel.due_date && <Field label="Terminas" value={fmtD(sel.due_date)} />}
          <Field label="Kontrahentas" value={sel.counterparty_name} />
          <Field label="Kodas" value={sel.counterparty_code} />
          <Divider sx={{ my: 1 }} />
          <Field label="Suma" value={fmt(sel.amount_with_vat, sel.currency)} bold />
          <Field label="Apmokėta" value={fmt(sel.allocated_amount, sel.currency)} />
          <Field label="Likutis" value={fmt(sel.remaining_amount, sel.currency)} bold />

          <Divider sx={{ my: 2 }} />

          {sel._readonly ? (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                {sel._allocStatus === 'manual'
                  ? <ManualIcon sx={{ fontSize: 18, color: '#78909c' }} />
                  : <ScoreRing value={sel.score} size={36} />}
                <Typography fontSize={12} fontWeight={600}>
                  {sel._allocStatus === 'manual'
                    ? 'Susieta rankiniu būdu'
                    : 'Susieta automatiškai'}
                </Typography>
              </Box>

              {Object.entries(sel.match_reasons || {}).length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {Object.entries(sel.match_reasons).map(([k, v]) => (
                    <Chip key={k} size="small"
                      label={v === true || v === 'True' ? k : `${k}: ${v}`}
                      sx={{ fontSize: 10, height: 20, bgcolor: '#f1f8e9',
                        color: '#33691e', fontWeight: 600 }} />
                  ))}
                </Box>
              )}
            </Box>
          ) : (<>
          <Typography fontSize={12} fontWeight={700} sx={{ mb: 1 }}>Susiejama suma</Typography>
          <TextField size="small" fullWidth value={amount}
            onChange={e => setAmount(normAmount(e.target.value))}
            InputProps={{ endAdornment: <InputAdornment position="end">{sel.currency}</InputAdornment> }}
            inputProps={{ inputMode: 'decimal', style: { textAlign: 'right', fontWeight: 700 } }} />

          {isCrossCurrency() && num(amount) > 0 && (
            <Box sx={{ mt: 0.75, px: 1, py: 0.5, borderRadius: 1.5, bgcolor: '#f5f5f5' }}>
              <Typography fontSize={11} color="text.secondary">
                Nuo operacijos nurašoma {fmt(amountInTxnCur(), txnInfo?.currency)}
                {sel.doc_rate && parseFloat(sel.doc_rate) !== 1
                  ? ` · dok. kursas ${parseFloat(sel.doc_rate).toFixed(4)}`
                  : ''}
              </Typography>
            </Box>
          )}

          {Math.abs(diff) > 0.005 && (
            <Typography fontSize={11} color="warning.dark" sx={{ mt: 0.75 }}>
              Liks nepaskirstyta: {fmt(diff, txnInfo?.currency)}
            </Typography>
          )}

          <Button fullWidth variant="contained" startIcon={<LinkIcon />}
            disabled={saving || num(amount) <= 0}
            onClick={doMatch} sx={{ mt: 2 }}>
            {saving ? <CircularProgress size={20} color="inherit" /> : 'Susieti'}
          </Button>
          </>)}
        </Box>
      </Box>
    </Box>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth
      fullScreen={isMobile} disableScrollLock
      PaperProps={{
        sx: isMobile
          ? { m: 0, height: '100dvh', borderRadius: 0 }
          : { height: '85vh', borderRadius: 3, overflow: 'hidden' },
      }}>
      <DialogTitle sx={{
        py: 1.25, px: 2, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider',
      }}>
        <Typography fontSize={16} fontWeight={700}>Apdoroti operaciją</Typography>
        <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: 'flex', overflow: 'hidden', flexDirection: isMobile ? 'column' : 'row' }}>
        <Box sx={{
          flex: isMobile ? '0 0 auto' : '0 0 320px',
          borderRight: isMobile ? 'none' : '1px solid',
          borderBottom: isMobile ? '1px solid' : 'none',
          borderColor: 'divider', bgcolor: '#fcfcfc',
          maxHeight: isMobile ? '40vh' : 'none', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          {txnPanel}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}
            sx={{ minHeight: 40, borderBottom: '1px solid', borderColor: 'divider', px: 1 }}>
            <Tab value="match" label="Susieti su dokumentu" icon={<LinkIcon sx={{ fontSize: 16 }} />}
              iconPosition="start" sx={{ minHeight: 40, fontSize: 12, textTransform: 'none' }} />
            <Tab value="dk" label="Priskirti D/K" icon={<TableIcon sx={{ fontSize: 16 }} />}
              iconPosition="start" sx={{ minHeight: 40, fontSize: 12, textTransform: 'none' }} />
          </Tabs>

          {tab === 'match' ? <>{matchFilters}{linkedBlock}{matchList}</> : dkTab}
          {overlay}
        </Box>
      </DialogContent>
    </Dialog>
  );
};

// ── Small field ──

const Field = ({ label, value, bold, small }) => {
  if (!value) return null;
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, py: 0.4 }}>
      <Typography fontSize={11} color="text.secondary" sx={{ flexShrink: 0 }}>{label}</Typography>
      <Typography fontSize={small ? 10 : 12} fontWeight={bold ? 700 : 400}
        sx={{ textAlign: 'right', wordBreak: 'break-all' }}>{value}</Typography>
    </Box>
  );
};

export default ResolveTransactionDialog;