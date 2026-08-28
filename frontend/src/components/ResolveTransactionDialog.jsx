import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box, Paper, Typography, Button, IconButton, Chip, TextField, MenuItem,
  Dialog, DialogTitle, DialogContent, CircularProgress, InputAdornment,
  Divider, Skeleton, LinearProgress, Tabs, Tab, Checkbox, FormControlLabel,
  useMediaQuery, useTheme,
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

const TypeTile = ({ icon, label, sub, active, onClick }) => (
  <Paper variant="outlined" onClick={onClick}
    sx={{
      p: 1.25, borderRadius: 2, cursor: 'pointer', display: 'flex',
      alignItems: 'center', gap: 1, transition: 'all 0.15s',
      borderColor: active ? 'primary.main' : 'divider',
      bgcolor: active ? 'rgba(21,101,192,0.05)' : undefined,
      '&:hover': { bgcolor: active ? 'rgba(21,101,192,0.08)' : '#f5f5f5' },
    }}>
    <Box sx={{ display: 'flex', color: active ? 'primary.main' : 'text.secondary' }}>{icon}</Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography fontSize={12} fontWeight={600} noWrap
        color={active ? 'primary.main' : 'text.primary'}>{label}</Typography>
      <Typography fontSize={10} color="text.disabled" noWrap>{sub}</Typography>
    </Box>
  </Paper>
);

// ══════════════════════════════════════════

const ResolveTransactionDialog = ({
  open, txn, initialTab = 'match', onClose, onSuccess, showSnack, onOpenDkDialog,
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

  // ── Type tab ──
  const [tplQ, setTplQ] = useState('');
  const [templates, setTemplates] = useState([]);
  const [tplLoad, setTplLoad] = useState(false);
  const [pick, setPick] = useState(null);   // { kind:'cat'|'tpl', key/id, label }
  const [rememberRule, setRememberRule] = useState(true);
  const [showAllTypes, setShowAllTypes] = useState(false);

  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const senRef = useRef(null);
  const obsRef = useRef(null);
  const listRef = useRef(null);

  const txnDate = txn?.transaction_date ? toISO(txn.transaction_date) : '';
  const direction = txnInfo?.direction || txn?.direction || 'outgoing';
  const isIncoming = direction === 'incoming';

  // ── Reset ──
  useEffect(() => {
    if (!open || !txn) return;
    setTab(initialTab);
    setQ(''); setTplQ('');
    setStatus('open'); setSameCurrency(true);
    setSel(null); setAmount(''); setPick(null);
    setRememberRule(true); setShowAllTypes(false);
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

  // ── Load templates ──
  useEffect(() => {
    if (!open || tab !== 'type') return;
    let alive = true;
    setTplLoad(true);
    invoicingApi.getUserDKTemplates({ direction })
      .then(({ data }) => { if (alive) setTemplates(data.results || []); })
      .catch(() => { if (alive) setTemplates([]); })
      .finally(() => { if (alive) setTplLoad(false); });
    return () => { alive = false; };
  }, [open, tab, direction]);

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

  const catsShown = tplQ || showAllTypes ? visibleCats : visibleCats.slice(0, 4);
  const tplsShown = tplQ || showAllTypes ? visibleTpls : visibleTpls.slice(0, 2);
  const hiddenCount =
    (visibleCats.length - catsShown.length) + (visibleTpls.length - tplsShown.length);

  // ── Actions ──
  const openDoc = (doc) => {
    setSel(doc);
    const txnRemaining = parseFloat(txnInfo?.remaining_amount || txn?.amount || 0);
    const docRemaining = parseFloat(doc.remaining_amount || doc.amount_with_vat || 0);
    setAmount(Math.min(txnRemaining, docRemaining).toFixed(2));
  };

  const doMatch = async () => {
    if (!sel) return;
    setSaving(true);
    try {
      const payload = sel.type === 'invoice'
        ? { invoice_id: sel.id, amount }
        : { purchase_id: sel.id, amount };
      await invoicingApi.matchTransaction(txn.id, payload);
      show('Susieta');
      onSuccess?.(); onClose();
    } catch (e) {
      show(e.response?.data?.detail || 'Nepavyko susieti', 'error');
    } finally { setSaving(false); }
  };

  const doClassify = async () => {
    if (!pick) return;
    setSaving(true);
    try {
      if (pick.kind === 'cat') {
        await invoicingApi.classifyTransaction(txn.id, {
          category: pick.key,
          debit_account: pick.acct || '',
          credit_account: '',
          create_rule: rememberRule,
          apply_to_similar: rememberRule,
        });
      } else {
        const tpl = templates.find(t => t.id === pick.id);
        const lines = (tpl?.lines || []).map(l => ({
          side: l.side,
          account_code: l.code,
          account_name: l.name,
          amount: String(txnInfo?.amount ?? txn?.amount ?? 0),
        }));
        await invoicingApi.registerDK(txn.id, { direction, lines, template_id: tpl?.id });
      }
      show('Priskirta');
      onSuccess?.(); onClose();
    } catch (e) {
      show(e.response?.data?.detail || 'Nepavyko priskirti', 'error');
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

  const diff = sel
    ? parseFloat(txnInfo?.remaining_amount || 0) - parseFloat(amount || 0)
    : 0;

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

        {parseFloat(txnInfo?.allocated_amount || 0) > 0 && (
          <Paper variant="outlined" sx={{ mt: 2, p: 1.25, borderRadius: 2, bgcolor: '#fffde7' }}>
            <Typography fontSize={11} color="text.secondary">Jau paskirstyta</Typography>
            <Typography fontSize={13} fontWeight={700}>
              {fmt(txnInfo.allocated_amount, txnInfo.currency)}
            </Typography>
            <Typography fontSize={11} color="text.secondary" sx={{ mt: 0.5 }}>Likutis</Typography>
            <Typography fontSize={13} fontWeight={700} color="warning.dark">
              {fmt(txnInfo.remaining_amount, txnInfo.currency)}
            </Typography>
          </Paper>
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

  // ── Type tab content ──
  const typeTab = (
    <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, minHeight: 0 }}>
      <TextField size="small" fullWidth placeholder="Ieškoti tipo arba šablono..."
        value={tplQ} onChange={e => setTplQ(e.target.value)} sx={{ mb: 1.5 }}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />

      {catsShown.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1, mb: 1.5 }}>
          {catsShown.map(c => (
            <TypeTile key={c.key} icon={<c.Icon sx={{ fontSize: 18 }} />}
              label={c.label} sub={c.acct}
              active={pick?.kind === 'cat' && pick.key === c.key}
              onClick={() => setPick({ kind: 'cat', key: c.key, acct: c.acct, label: c.label })} />
          ))}
        </Box>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 1.5 }}>
        <Divider sx={{ flex: 1 }} />
        <Typography fontSize={11} color="text.disabled">Mano šablonai</Typography>
        <Divider sx={{ flex: 1 }} />
      </Box>

      {tplLoad ? <Skeleton variant="rounded" height={48} sx={{ borderRadius: 2 }} /> : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
          {tplsShown.map(t => (
            <TypeTile key={t.id} icon={<TplIcon sx={{ fontSize: 18 }} />}
              label={t.name}
              sub={(t.lines || []).map(l => l.code).join(' / ')}
              active={pick?.kind === 'tpl' && pick.id === t.id}
              onClick={() => setPick({ kind: 'tpl', id: t.id, label: t.name })} />
          ))}
          <TypeTile icon={<AddIcon sx={{ fontSize: 18 }} />}
            label="Naujas šablonas" sub="Sukurti savo"
            onClick={() => { onClose(); onOpenDkDialog?.(txn); }} />
        </Box>
      )}

      {hiddenCount > 0 && !tplQ && (
        <Button size="small" onClick={() => setShowAllTypes(v => !v)}
          sx={{ mt: 1, fontSize: 12, textTransform: 'none' }}>
          {showAllTypes ? 'Rodyti mažiau' : `Rodyti visus (+${hiddenCount})`}
        </Button>
      )}

      {pick && (
        <Paper variant="outlined" sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: '#fafafa' }}>
          <FormControlLabel
            control={<Checkbox size="small" checked={rememberRule}
              onChange={e => setRememberRule(e.target.checked)} />}
            label={<Typography fontSize={12}>Įsiminti taisyklę šiam kontrahentui</Typography>}
            sx={{ ml: 0 }} />
          <Button fullWidth variant="contained" size="small" sx={{ mt: 1 }}
            disabled={saving} onClick={doClassify}>
            {saving ? <CircularProgress size={18} color="inherit" /> : `Priskirti: ${pick.label}`}
          </Button>
        </Paper>
      )}
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

          <Typography fontSize={12} fontWeight={700} sx={{ mb: 1 }}>Susiejama suma</Typography>
          <TextField size="small" fullWidth type="number" value={amount}
            onChange={e => setAmount(e.target.value)}
            InputProps={{ endAdornment: <InputAdornment position="end">{sel.currency}</InputAdornment> }}
            inputProps={{ step: '0.01', min: '0' }} />

          {Math.abs(diff) > 0.005 && (
            <Typography fontSize={11} color="warning.dark" sx={{ mt: 0.75 }}>
              Liks nepaskirstyta: {fmt(diff, txnInfo?.currency)}
            </Typography>
          )}

          <Button fullWidth variant="contained" startIcon={<LinkIcon />}
            disabled={saving || !amount || parseFloat(amount) <= 0}
            onClick={doMatch} sx={{ mt: 2 }}>
            {saving ? <CircularProgress size={20} color="inherit" /> : 'Susieti'}
          </Button>
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
            <Tab value="match" label="Susieti" icon={<LinkIcon sx={{ fontSize: 16 }} />}
              iconPosition="start" sx={{ minHeight: 40, fontSize: 12, textTransform: 'none' }} />
            <Tab value="type" label="Priskirti tipą" icon={<TagIcon sx={{ fontSize: 16 }} />}
              iconPosition="start" sx={{ minHeight: 40, fontSize: 12, textTransform: 'none' }} />
          </Tabs>

          {tab === 'match' ? <>{matchFilters}{matchList}</> : typeTab}
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