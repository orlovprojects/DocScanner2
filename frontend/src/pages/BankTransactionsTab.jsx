// Ne israso Importas a tab transakcij

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Paper, Typography, Button, IconButton, Chip, TextField, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tooltip, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, LinearProgress, InputAdornment,
  Divider, Switch, FormControlLabel, Skeleton, Select,
} from '@mui/material';
import {
  Search as SearchIcon,
  CheckCircle as CheckCircleIcon,
  HelpOutline as LikelyIcon,
  LinkOff as UnmatchedIcon,
  Close as CloseIcon, Link as LinkIcon,
  Check as CheckIcon, Clear as RejectIcon,
  AccountBalance as BankIcon,
  ArrowDownward as IncomingIcon, ArrowUpward as OutgoingIcon,
  Edit as EditIcon, OpenInNew as OpenIcon,
  Description as DocIcon,
  Warning as WarningIcon,
  HourglassEmpty as HourglassIcon,
  CheckCircle as DoneIcon,
  PriorityHigh as ExclaimIcon,
  UndoRounded as PaymentReturnedIcon,
  PauseCircleOutline as DeferIcon,
  VisibilityOff as IgnoredIcon,
  ReplayRounded as RestoreIcon,
  DonutLarge as PartialIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { invoicingApi } from '../api/invoicingApi';
import { useCompanyProfiles } from '../contexts/useCompanyProfiles';
import ResolveTransactionDialog from '../components/ResolveTransactionDialog';
import TransactionInfoDialog from '../components/TransactionInfoDialog';

// ── Config ──

const ACTION_STATE_CFG = {
  apdorota:            { label: 'Apdorota',             bg: '#e8f5e9', fg: '#2e7d32', Icon: DoneIcon },
  dalinai_apdorota:    { label: 'Dalinai apdorota',     bg: '#fff8e1', fg: '#e65100', Icon: PartialIcon },  
  reikia_patvirtinimo: { label: 'Reikia patvirtinimo',  bg: '#fff3e0', fg: '#ed6c02', Icon: ExclaimIcon },
  atideta:             { label: 'Atidėta',              bg: '#ede7f6', fg: '#5e35b1', Icon: DeferIcon },
  ignoruota:           { label: 'Ignoruojama',          bg: '#eceff1', fg: '#90a4ae', Icon: IgnoredIcon },
  laukia_dokumento:    { label: 'Laukia dokumento',     bg: '#f5f5f5', fg: '#757575', Icon: HourglassIcon },
};

const PAYMENT_RETURN_CFG = {
  full: {
    label: 'Mokėjimas grąžintas',
    bg: '#fff3e0',
    fg: '#ef6c00',
    border: '#ffcc80',
  },
  partial: {
    label: 'Dalis mokėjimo grąžinta',
    bg: '#fff8e1',
    fg: '#f57c00',
    border: '#ffe082',
  },
};

const CAT_CFG = {
  supplier_payment:    { label: 'Mokėjimas tiekėjui',         color: '#1565c0' },
  customer_receipt:    { label: 'Įplauka iš pirkėjo',         color: '#2e7d32' },
  bank_fee:            { label: 'Banko mokestis',             color: '#795548' },
  tax_vmi:             { label: 'VMI mokestis',               color: '#d32f2f' },
  tax_sodra:           { label: 'Sodra / VSDFV',              color: '#c62828' },
  salary:              { label: 'Darbo užmokestis',           color: '#6a1b9a' },
  owner_withdrawal:    { label: 'Savininko lėšų paėmimas',    color: '#37474f' },
  owner_deposit:       { label: 'Savininko įnašas',           color: '#37474f' },
  loan_payment:        { label: 'Paskolos grąžinimas',        color: '#4527a0' },
  loan_received:       { label: 'Gauta paskola',              color: '#4527a0' },
  provider_payout:     { label: 'Tarpininko išmoka',          color: '#00695c' },
  refund_received:     { label: 'Gautas grąžinimas',          color: '#ff6f00' },
  payment_refund:      { label: 'Mokėjimo grąžinimas',        color: '#fb8c00' },
  payment_reversal:    { label: 'Mokėjimo atšaukimas',        color: '#ef6c00' },
  chargeback:          { label: 'Chargeback',                 color: '#e65100' },
  tax_customs:         { label: 'Muitinės mokestis',        color: '#5d4037' },
  paypal_card_funding: { label: 'PayPal sąskaitos papildymas', color: '#0070ba' },
  manual_dk:           { label: 'Apdorota rankiniu būdu',     color: '#00695c' },
  other_expense:       { label: 'Kitos sąnaudos',             color: '#757575' },
  other_income:        { label: 'Kitos pajamos',              color: '#757575' },
  shopify_pardavimas:  { label: 'Shopify pardavimas',         color: '#4F7D28', bg: '#95BF4724', border: '#95BF477A' },
};

const MANUAL_CATS = [
  'bank_fee', 'tax_vmi', 'tax_sodra', 'salary',
  'owner_withdrawal', 'owner_deposit',
  'loan_payment', 'loan_received',
  'provider_payout', 'refund_received',
  'payment_refund', 'payment_reversal', 'chargeback', 'paypal_card_funding',
  'other_expense', 'other_income',
];

const BANK_CFG = {
  swedbank: 'Swedbank', seb: 'SEB', luminor: 'Luminor',
  siauliu: 'Artea', revolut: 'Revolut', paypal: 'PayPal', other: 'Kitas',
};

const fmt = (v, c = 'EUR') => v == null ? '—' : `${parseFloat(v).toFixed(2).replace('.', ',')} ${c === 'EUR' ? '€' : c}`;
const fmtD = (d) => { if (!d) return '—'; const p = String(d).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d; };

const isMatchedStatus = (s) =>
  ['auto_matched', 'confirmed', 'manually_matched', 'likely_matched'].includes(s);

const getPaymentReturnStatus = (txn) =>
  txn?.payment_return_status || txn?.match_details?.payment_return_status || '';

const getPaymentReturnedAmount = (txn) =>
  txn?.payment_returned_amount || txn?.match_details?.payment_returned_amount || '';

// ══════════════════════════════════════════

const BankTransactionsTab = ({ statements = [], initialStatementId = '', onClearStatementFilter, showSnack }) => {
  const navigate = useNavigate();
  const show = showSnack || (() => {});
  const { activeId } = useCompanyProfiles();

  // ── Table state ──
  const [txns, setTxns] = useState([]);
  const [txnTotal, setTxnTotal] = useState(0);
  const [apiStats, setApiStats] = useState({ total: 0, apdorota: 0, reikia_veiksmu: 0, atideta: 0, dalinai: 0 });
  const [txnLoad, setTxnLoad] = useState(true);
  const [txnMore, setTxnMore] = useState(false);
  const txnOff = useRef(0), txnHas = useRef(true), txnSen = useRef(null), txnObs = useRef(null);
  const [txnF, setTxnF] = useState({ statement_id: initialStatementId, direction: '', match_status: '', category: '', q: '' });
  const [actLoad, setActLoad] = useState(null);

  // ── Detail dialog ──
  const [dtlOpen, setDtlOpen] = useState(false);
  const [dtlTxn, setDtlTxn] = useState(null);
  const [dtlLoad, setDtlLoad] = useState(false);
  const [dtlAlloc, setDtlAlloc] = useState(null);
  const [dtlAllocLoad, setDtlAllocLoad] = useState(false);

  // ── Inline category edit ──
  const [editCatId, setEditCatId] = useState(null);
  const [catSaving, setCatSaving] = useState(null);

  // ── Match dialog ──
  const [mtDlg, setMtDlg] = useState({ open: false, txn: null });
  const [infoDlg, setInfoDlg] = useState({ open: false, txn: null });

  useEffect(() => { setTxnF(p => ({ ...p, statement_id: initialStatementId })); }, [initialStatementId]);

  // ── Load ──
  const loadTxns = useCallback(async (reset = true) => {
    if (reset) { setTxnLoad(true); txnOff.current = 0; txnHas.current = true; }
    else setTxnMore(true);
    try {
      const p = { limit: 50, offset: reset ? 0 : txnOff.current };
      Object.entries(txnF).forEach(([k, v]) => { if (v) p[k] = v; });
      const { data } = await invoicingApi.getBankTransactions(p);
      const r = data.results || [];
      if (reset) {
        setTxns(r); setTxnTotal(data.count || 0); txnOff.current = r.length;
        if (data.stats) setApiStats(data.stats);
      } else {
        setTxns(prev => [...prev, ...r]); txnOff.current += r.length;
      }
      txnHas.current = txnOff.current < (data.count || 0);
    } catch { show('Nepavyko', 'error'); }
    finally { if (reset) setTxnLoad(false); else setTxnMore(false); }
  }, [txnF]);

  useEffect(() => { loadTxns(true); }, [loadTxns, activeId]);

  useEffect(() => {
    if (txnObs.current) txnObs.current.disconnect();
    txnObs.current = new IntersectionObserver(
      (e) => { if (e[0].isIntersecting && txnHas.current && !txnMore && !txnLoad) loadTxns(false); },
      { rootMargin: '300px' },
    );
    if (txnSen.current) txnObs.current.observe(txnSen.current);
    return () => txnObs.current?.disconnect();
  }, [loadTxns, txnMore, txnLoad]);

  // ── Detail dialog ──
  const openDetail = (txn) => {
    // Dalinai paskirstyta — tęsiam paskirstymą, o ne rodom detales.
    if (txn.action_state === 'dalinai_apdorota') {
      openMt(txn, 'match');
      return;
    }

    const isRaw =
      !isMatchedStatus(txn.match_status) &&
      txn.match_status !== 'classified' &&
      !['deferred', 'ignored'].includes(txn.match_status) &&
      !txn.journal_entry_id;

    if (isRaw) {
      openMt(txn, txn.transaction_category ? 'dk' : 'match');
      return;
    }
    setInfoDlg({ open: true, txn });
  };

  const closeDetail = () => { setDtlOpen(false); setDtlTxn(null); setDtlAlloc(null); };

  // ── Actions ──
  const doConfirm = async (id) => {
    setActLoad(id);
    try { await invoicingApi.confirmAllocation(id); show('Patvirtinta'); closeDetail(); loadTxns(true); }
    catch { show('Nepavyko', 'error'); } finally { setActLoad(null); }
  };
  const doReject = async (id) => {
    setActLoad(id);
    try { await invoicingApi.rejectAllocation(id); show('Atmesta'); closeDetail(); loadTxns(true); }
    catch { show('Nepavyko', 'error'); } finally { setActLoad(null); }
  };
  const doRestore = async (t) => {
    setActLoad(`r-${t.id}`);
    try {
      const api = t.match_status === 'ignored'
        ? invoicingApi.ignoreTransaction
        : invoicingApi.deferTransaction;
      await api(t.id, { undo: true });
      show('Grąžinta į apdorojimą');
      loadTxns(true);
    } catch { show('Nepavyko', 'error'); }
    finally { setActLoad(null); }
  };
  const handleUnlink = async (allocId) => {
    try { await invoicingApi.rejectAllocation(allocId); show('Susiejimas panaikintas'); closeDetail(); loadTxns(true); }
    catch { show('Nepavyko', 'error'); }
  };

  // ── Inline category ──
  const handleInlineCat = async (txnId, category) => {
    setEditCatId(null);
    if (!category) return;
    setCatSaving(txnId);
    try { await invoicingApi.classifyTransaction(txnId, { category, debit_account: '', credit_account: '' }); loadTxns(true); }
    catch { show('Nepavyko', 'error'); } finally { setCatSaving(null); }
  };

  // ── Match dialog ──
  const openMt = (txn, tab = 'match') => { setMtDlg({ open: true, txn, tab }); };

  const doMt = async (doc) => {
    setMtLoad(true);
    try {
      await invoicingApi.matchTransaction(mtDlg.txn.id, doc.type === 'invoice' ? { invoice_id: doc.id } : { purchase_id: doc.id });
      show('Susieta'); setMtDlg({ open: false, txn: null }); loadTxns(true);
    } catch (e) { show(e.response?.data?.detail || 'Nepavyko', 'error'); } finally { setMtLoad(false); }
  };

  // ── Stats card click ──
  const handleStatClick = (filter) => {
    setTxnF(p => ({ ...p, match_status: p.match_status === filter ? '' : filter }));
  };

  // ── Renders ──
  const rDir = (d) => (
    <Tooltip title={d === 'incoming' ? 'Įplauka' : 'Išlaida'}>
      <Box sx={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: d === 'incoming' ? '#e8f5e9' : '#ffebee' }}>
        {d === 'incoming' ? <IncomingIcon sx={{ fontSize: 16, color: '#2e7d32' }} /> : <OutgoingIcon sx={{ fontSize: 16, color: '#d32f2f' }} />}
      </Box>
    </Tooltip>
  );

  const rPaymentReturn = (txn) => {
    const status = getPaymentReturnStatus(txn);

    if (!status) {
      return null;
    }

    const amount = getPaymentReturnedAmount(txn);
    const formattedAmount = amount ? fmt(amount, txn.currency) : '';
    const isPartial = status === 'partial';

    const title = isPartial
      ? `Dalis mokėjimo grąžinta${formattedAmount ? ` · ${formattedAmount}` : ''}`
      : `Mokėjimas grąžintas${formattedAmount ? ` · ${formattedAmount}` : ''}`;

    return (
      <Tooltip title={title}>
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: isPartial ? '#fff8e1' : '#fff3e0',
            border: '1px solid',
            borderColor: isPartial ? '#ffe082' : '#ffcc80',
            flexShrink: 0,
          }}
        >
          <PaymentReturnedIcon
            sx={{
              fontSize: 15,
              color: isPartial ? '#f9a825' : '#ef6c00',
            }}
          />
        </Box>
      </Tooltip>
    );
  };

  const rSts = (txn) => {
    const config =
      ACTION_STATE_CFG[txn.action_state] || ACTION_STATE_CFG.laukia_dokumento;
    const StatusIcon = config.Icon;

    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          flexWrap: 'wrap',
        }}
      >
        <Chip
          icon={
            <StatusIcon
              sx={{
                fontSize: 15,
                color: `${config.fg} !important`,
              }}
            />
          }
          label={config.label}
          size="small"
          sx={{
            fontSize: 11,
            height: 22,
            fontWeight: 600,
            bgcolor: config.bg,
            color: config.fg,
            '& .MuiChip-icon': {
              ml: 0.5,
            },
          }}
        />

        {rPaymentReturn(txn)}

        {txn.action_state === 'dalinai_apdorota' && txn.remaining_amount != null && (
          <Typography fontSize={11} fontWeight={700} color="#e65100">
            liko {fmt(txn.remaining_amount, txn.currency)}
          </Typography>
        )}
      </Box>
    );
  };

  const rCat = (t) => {
    if (catSaving === t.id) return <CircularProgress size={16} />;
    if (editCatId === t.id) {
      return (
        <Select size="small" value="" autoFocus displayEmpty open onClose={() => setEditCatId(null)}
          onChange={(e) => handleInlineCat(t.id, e.target.value)} onClick={e => e.stopPropagation()}
          MenuProps={{ disableScrollLock: true }} sx={{ fontSize: 12, height: 28, minWidth: 160 }}>
          <MenuItem value="" disabled><em>Pasirinkite...</em></MenuItem>
          {MANUAL_CATS.map(k => <MenuItem key={k} value={k} sx={{ fontSize: 13 }}>{CAT_CFG[k].label}</MenuItem>)}
        </Select>
      );
    }
    if (!t.transaction_category) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, '&:hover .edit-icon': { opacity: 1 } }}>
          <Typography variant="caption" color="text.disabled">—</Typography>
          <IconButton size="small" className="edit-icon" sx={{ opacity: 0, transition: 'opacity 0.15s', p: 0.25 }}
            onClick={e => { e.stopPropagation(); openMt(t, 'type'); }}>
            <EditIcon sx={{ fontSize: 14, color: '#bdbdbd' }} />
          </IconButton>
        </Box>
      );
    }
    const c = CAT_CFG[t.transaction_category];
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, '&:hover .edit-icon': { opacity: 1 } }}>
        <Chip label={c?.label || t.category_display} size="small" sx={{
          fontSize: 11,
          height: 22,
          fontWeight: 700,
          backgroundColor: c?.bg || `${c?.color || '#757575'}14`,
          color: c?.color || '#757575',
          border: `1px solid ${c?.border || `${c?.color || '#757575'}40`}`,
        }} />
        {t.match_status === 'unmatched' && (
          <IconButton size="small" className="edit-icon" sx={{ opacity: 0, transition: 'opacity 0.15s', p: 0.25 }}
            onClick={e => { e.stopPropagation(); openMt(t, 'type'); }}>
            <EditIcon sx={{ fontSize: 14, color: '#bdbdbd' }} />
          </IconButton>
        )}
      </Box>
    );
  };

  const rDoc = (t) => {
    if (!t.matched_document_number) return <Typography variant="caption" color="text.disabled">—</Typography>;
    return (
      <Typography fontSize={13} fontWeight={700} color="primary.main"
        sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
        onClick={e => { e.stopPropagation(); openDetail(t); }}>
        {t.matched_document_number}
      </Typography>
    );
  };

  const rActs = (t) => {
    if (['atideta', 'ignoruota'].includes(t.action_state)) {
      return (
        <Tooltip title="Grąžinti į apdorojimą">
          <IconButton size="small" color="primary" disabled={actLoad === `r-${t.id}`}
            onClick={e => { e.stopPropagation(); doRestore(t); }}>
            {actLoad === `r-${t.id}`
              ? <CircularProgress size={16} />
              : <RestoreIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      );
    }
    if (t.action_state === 'dalinai_apdorota') {
      return (
        <Tooltip title="Tęsti paskirstymą">
          <IconButton size="small" sx={{ color: '#e65100' }}
            onClick={e => { e.stopPropagation(); openMt(t, 'match'); }}>
            <PartialIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      );
    }
    if (t.match_status === 'unmatched' && !t.transaction_category) {
      return (
        <Tooltip title="Apdoroti">
          <IconButton size="small" color="primary" onClick={e => { e.stopPropagation(); openMt(t); }}>
            <LinkIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      );
    }
    return null;
  };

  // ── Dialog mode helpers ──
  const dtlHasDoc = dtlTxn && isMatchedStatus(dtlTxn.match_status) && dtlTxn.allocations?.length > 0;
  const dtlIsLikely = dtlTxn?.match_status === 'likely_matched';
  const dtlIsClassified = dtlTxn?.match_status === 'classified';
  const dtlIsUnmatched = dtlTxn?.match_status === 'unmatched' && !dtlTxn?.transaction_category;
  const dtlFirstAlloc = dtlTxn?.allocations?.[0];

  // ══════════════════════════════════════════

  return (
    <>
      {/* ══ 3 STAT CARDS ══ */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <SC icon={<BankIcon sx={{ color: '#1565c0' }} />} label="Iš viso" value={apiStats.total}
          active={txnF.match_status === ''} onClick={() => handleStatClick('')} />
        <SC icon={<CheckCircleIcon sx={{ color: '#2e7d32' }} />} label="Apdorota" value={apiStats.apdorota} color="#2e7d32"
          active={txnF.match_status === 'apdorota'} onClick={() => handleStatClick('apdorota')} />
        <SC icon={<WarningIcon sx={{ color: '#ed6c02' }} />} label="Reikia veiksmų" value={apiStats.reikia_veiksmu} color="#ed6c02"
          active={txnF.match_status === 'reikia_veiksmu'} onClick={() => handleStatClick('reikia_veiksmu')} />
        <SC icon={<DeferIcon sx={{ color: '#5e35b1' }} />} label="Atidėta / ignoruota" value={apiStats.atideta || 0} color="#5e35b1"
          active={txnF.match_status === 'atideta'} onClick={() => handleStatClick('atideta')} />
      </Box>

      {/* ══ FILTERS ══ */}
      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField size="small" placeholder="Ieškoti..." value={txnF.q} onChange={e => setTxnF(p => ({ ...p, q: e.target.value }))} sx={{ minWidth: 200 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
          <TextField size="small" select label="Išrašas" value={txnF.statement_id} onChange={e => setTxnF(p => ({ ...p, statement_id: e.target.value }))} sx={{ minWidth: 180 }}
            SelectProps={{ MenuProps: { disableScrollLock: true } }} InputLabelProps={{ shrink: true }}>
            <MenuItem value="">Visi</MenuItem>
            {statements.map(s => <MenuItem key={s.id} value={String(s.id)}>{(BANK_CFG[s.bank_name] || 'Kitas')} {fmtD(s.period_from)} ({s.total_entries})</MenuItem>)}
          </TextField>
          <TextField size="small" select label="Kryptis" value={txnF.direction} onChange={e => setTxnF(p => ({ ...p, direction: e.target.value }))} sx={{ minWidth: 130 }}
            SelectProps={{ MenuProps: { disableScrollLock: true } }} InputLabelProps={{ shrink: true }}>
            <MenuItem value="">Visos</MenuItem><MenuItem value="incoming">Įplaukos</MenuItem><MenuItem value="outgoing">Išlaidos</MenuItem>
          </TextField>
          <TextField size="small" select label="Kategorija" value={txnF.category} onChange={e => setTxnF(p => ({ ...p, category: e.target.value }))} sx={{ minWidth: 170 }}
            SelectProps={{ MenuProps: { disableScrollLock: true } }} InputLabelProps={{ shrink: true }}>
            <MenuItem value="">Visos</MenuItem><MenuItem value="uncategorized">Nekategorizuota</MenuItem>
            {Object.entries(CAT_CFG).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
          </TextField>
          {(apiStats.dalinai || 0) > 0 && (
            <Chip
              icon={<PartialIcon sx={{ fontSize: 15, color: '#e65100 !important' }} />}
              label={`Dalinai paskirstyta (${apiStats.dalinai})`}
              size="small"
              onClick={() => handleStatClick('dalinai')}
              variant={txnF.match_status === 'dalinai' ? 'filled' : 'outlined'}
              sx={{
                fontSize: 11, height: 28, fontWeight: 600,
                color: '#e65100', borderColor: 'rgba(230,81,0,0.4)',
                bgcolor: txnF.match_status === 'dalinai' ? 'rgba(255,152,0,0.12)' : undefined,
              }} />
          )}
          {txnF.statement_id && <Chip label="Rodyti visus" size="small" onDelete={() => { setTxnF(p => ({ ...p, statement_id: '' })); onClearStatementFilter?.(); }} />}
        </Box>
      </Paper>

      {/* ══ TABLE ══ */}
      {txnLoad ? <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
      : txns.length === 0 ? <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}><Typography variant="h6" color="text.secondary">Operacijų nerasta</Typography></Paper>
      : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
          <Table size="small">
            <TableHead><TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, py: 1.5, backgroundColor: '#f5f5f5' } }}>
              <TableCell sx={{ width: 36 }} /><TableCell>Data</TableCell><TableCell>Kontrahentas</TableCell>
              <TableCell align="right">Suma</TableCell><TableCell>Statusas</TableCell>
              <TableCell>Kategorija</TableCell><TableCell>Dokumentas</TableCell><TableCell sx={{ width: 48 }} />
            </TableRow></TableHead>
            <TableBody>
              {txns.map(t => (
                <TableRow key={`${t.direction}-${t.id}`} hover sx={{
                  '& td': { py: 1.2 }, cursor: 'pointer',
                  backgroundColor: t.action_state === 'ignoruota'
                    ? '#fafafa'
                    : t.action_state === 'dalinai_apdorota'
                      ? 'rgba(255,152,0,0.06)'
                      : (t.match_status === 'unmatched' && !t.transaction_category ? 'rgba(255,152,0,0.04)' : undefined),
                  opacity: t.action_state === 'ignoruota' ? 0.5 : 1,
                  '& td:not(:last-child)': t.action_state === 'ignoruota'
                    ? { filter: 'grayscale(1)' }
                    : undefined,
                }}
                  onClick={() => openDetail(t)}>
                  <TableCell>{rDir(t.direction)}</TableCell>
                  <TableCell><Typography fontSize={13}>{fmtD(t.transaction_date)}</Typography></TableCell>
                  <TableCell>
                    <Typography fontSize={13} fontWeight={600} sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.counterparty_name || '—'}</Typography>
                    {t.counterparty_code && <Typography variant="caption" color="text.secondary">{t.counterparty_code}</Typography>}
                  </TableCell>
                  <TableCell align="right"><Typography fontSize={13} fontWeight={700} color={t.direction === 'incoming' ? 'success.main' : 'text.primary'}>{t.direction === 'incoming' ? '+' : '-'}{fmt(t.amount, t.currency)}</Typography></TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                      {rSts(t)}
                      {t.match_confidence > 0 && t.match_confidence < 1 && (
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                          {Math.round(t.match_confidence * 100)}%
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>{rCat(t)}</TableCell>
                  <TableCell>{rDoc(t)}</TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>{rActs(t)}</TableCell>
                </TableRow>
              ))}
              <TableRow ref={txnSen}><TableCell colSpan={8} sx={{ p: 0, border: 0, height: 1 }} /></TableRow>
              {txnMore && <TableRow><TableCell colSpan={8} align="center" sx={{ py: 2 }}><LinearProgress sx={{ maxWidth: 200, mx: 'auto' }} /></TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ══ DETAIL DIALOG ══ */}
      <Dialog open={dtlOpen} onClose={closeDetail} maxWidth={dtlHasDoc ? 'md' : 'sm'} fullWidth disableScrollLock>
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Typography variant="h6" fontWeight={700}>Banko operacijos detalės</Typography>
            <IconButton onClick={closeDetail} size="small"><CloseIcon /></IconButton>
          </Box>

          {dtlTxn && (
            <Paper variant="outlined" sx={{ p: 1.5, mt: 1, borderRadius: 2, bgcolor: '#fafafa' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                {rDir(dtlTxn.direction)}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontSize={14} fontWeight={600} noWrap>{dtlTxn.counterparty_name || '—'}</Typography>
                  {dtlTxn.counterparty_code && <Typography variant="caption" color="text.secondary">{dtlTxn.counterparty_code}</Typography>}
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography fontSize={18} fontWeight={700} color={dtlTxn.direction === 'incoming' ? 'success.main' : 'text.primary'}>
                    {dtlTxn.direction === 'incoming' ? '+' : '-'}{fmt(dtlTxn.amount, dtlTxn.currency)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{fmtD(dtlTxn.transaction_date)}</Typography>
                </Box>
              </Box>
              {!dtlLoad && dtlTxn.payment_purpose && (
                <Typography fontSize={12} color="text.secondary" sx={{ mt: 1, wordBreak: 'break-word' }}>{dtlTxn.payment_purpose}</Typography>
              )}

              {!dtlLoad &&
                getPaymentReturnStatus(dtlTxn) &&
                PAYMENT_RETURN_CFG[getPaymentReturnStatus(dtlTxn)] && (
                  <Box sx={{ mt: 1 }}>
                    <Chip
                      icon={
                        <PaymentReturnedIcon
                          sx={{
                            fontSize: 15,
                            color: `${
                              PAYMENT_RETURN_CFG[getPaymentReturnStatus(dtlTxn)].fg
                            } !important`,
                          }}
                        />
                      }
                      label={
                        getPaymentReturnStatus(dtlTxn) === 'partial' &&
                        getPaymentReturnedAmount(dtlTxn)
                          ? `${PAYMENT_RETURN_CFG.partial.label} (${fmt(
                              getPaymentReturnedAmount(dtlTxn),
                              dtlTxn.currency,
                            )})`
                          : PAYMENT_RETURN_CFG[getPaymentReturnStatus(dtlTxn)].label
                      }
                      size="small"
                      sx={{
                        fontSize: 11,
                        height: 22,
                        fontWeight: 600,
                        bgcolor:
                          PAYMENT_RETURN_CFG[getPaymentReturnStatus(dtlTxn)].bg,
                        color:
                          PAYMENT_RETURN_CFG[getPaymentReturnStatus(dtlTxn)].fg,
                        border: `1px solid ${
                          PAYMENT_RETURN_CFG[getPaymentReturnStatus(dtlTxn)].border
                        }`,
                        '& .MuiChip-icon': {
                          ml: 0.5,
                        },
                      }}
                    />
                  </Box>
                )}
            </Paper>
          )}

          {/* Patvirtinti/Atmesti — для likely_matched */}
          {!dtlLoad && dtlIsLikely && dtlFirstAlloc && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5 }}>
              <ConfidenceRing value={parseFloat(dtlFirstAlloc.confidence || 0)} />
              <Typography fontSize={14} fontWeight={600} sx={{ flex: 1 }}>Laukia patvirtinimo</Typography>
              <Button variant="outlined" color="error" size="small" startIcon={<RejectIcon />}
                disabled={actLoad === dtlFirstAlloc.id} onClick={() => doReject(dtlFirstAlloc.id)}>Atmesti</Button>
              <Button variant="contained" color="success" size="small" startIcon={<CheckIcon />}
                disabled={actLoad === dtlFirstAlloc.id} onClick={() => doConfirm(dtlFirstAlloc.id)}>
                {actLoad === dtlFirstAlloc.id ? <CircularProgress size={18} /> : 'Patvirtinti'}
              </Button>
            </Box>
          )}
        </DialogTitle>

        <Divider />

        <DialogContent sx={{ pt: 2 }}>
          {dtlLoad ? <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress /></Box>

          : dtlTxn && dtlHasDoc ? (
            /* ═══ MATCHED / LIKELY ═══ */
            <Box sx={{ display: 'flex', gap: 3, flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
              {/* Left: Document preview */}
              <Box sx={{ flex: '0 0 48%', minWidth: 260 }}>
                {dtlAllocLoad ? <Skeleton variant="rounded" height={420} sx={{ borderRadius: 2 }} />
                : dtlFirstAlloc?.document_preview_url ? <DocumentPreview url={dtlFirstAlloc.document_preview_url} />
                : (
                  <Box sx={{ height: 320, borderRadius: 2, border: '2px dashed', borderColor: 'divider',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, bgcolor: '#fafafa' }}>
                    <DocIcon sx={{ fontSize: 48, color: '#bdbdbd' }} />
                    <Typography variant="body2" color="text.secondary">Peržiūra nepasiekiama</Typography>
                  </Box>
                )}
                {dtlTxn.allocations?.length > 1 && (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                      Susieti dokumentai ({dtlTxn.allocations.length})
                    </Typography>
                    {dtlTxn.allocations.map((a, i) => (
                      <Paper key={i} variant="outlined" sx={{ p: 1, mb: 0.5, borderRadius: 1.5, cursor: 'pointer',
                        borderColor: i === 0 ? 'primary.main' : 'divider', '&:hover': { bgcolor: '#f5f5f5' } }}
                        onClick={async () => {
                          setDtlAllocLoad(true);
                          try { const { data: ad } = await invoicingApi.getAllocationPreview(a.id); setDtlAlloc(ad); } catch {}
                          setDtlAllocLoad(false);
                        }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography fontSize={12} fontWeight={600}>{a.invoice_number || a.purchase_number || '?'}</Typography>
                          <Typography fontSize={12} fontWeight={700}>{fmt(a.amount)}</Typography>
                        </Box>
                      </Paper>
                    ))}
                  </Box>
                )}
              </Box>
              {/* Right: Confidence + criteria + document info */}
              <Box sx={{ flex: 1, minWidth: 240 }}>
                {dtlAllocLoad ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Skeleton variant="rounded" height={60} /><Skeleton variant="rounded" height={140} /><Skeleton variant="rounded" height={200} />
                  </Box>
                ) : (<>
                  {!dtlIsLikely && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                      <ConfidenceRing value={parseFloat(dtlFirstAlloc?.confidence || dtlAlloc?.confidence || 0)} />
                      <Box>
                        <Typography fontWeight={700} fontSize={15}>Patikimumas</Typography>
                        <Chip label={(ACTION_STATE_CFG[dtlTxn.action_state] || ACTION_STATE_CFG.laukia_dokumento).label}
                          size="small" variant="outlined" sx={{ fontSize: 11, height: 20, mt: 0.25,
                            color: (ACTION_STATE_CFG[dtlTxn.action_state] || ACTION_STATE_CFG.laukia_dokumento).fg,
                            borderColor: (ACTION_STATE_CFG[dtlTxn.action_state] || ACTION_STATE_CFG.laukia_dokumento).fg }} />
                      </Box>
                    </Box>
                  )}
                  {dtlAlloc?.match_reasons && (
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
                      <Typography fontSize={13} fontWeight={700} sx={{ mb: 1 }}>Susiejimo kriterijai</Typography>
                      {Object.entries(dtlAlloc.match_reasons).map(([key, val]) => {
                        const isNeg = key.toLowerCase().includes('nesutampa') || key.toLowerCase().includes('vėluoja') || key.toLowerCase().includes('per toli');
                        return (
                          <Box key={key} sx={{ display: 'flex', gap: 1, py: 0.4 }}>
                            <Typography sx={{ color: isNeg ? '#ed6c02' : '#2e7d32', fontSize: 14 }}>{isNeg ? '⚠' : '✅'}</Typography>
                            <Box>
                              <Typography fontSize={13} fontWeight={600}>{key}</Typography>
                              {val !== true && val !== false && <Typography variant="caption" color="text.secondary">{String(val)}</Typography>}
                            </Box>
                          </Box>
                        );
                      })}
                    </Paper>
                  )}
                  {dtlAlloc?.document && (
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                      <Typography fontSize={14} fontWeight={700} sx={{ mb: 1 }}>
                        {dtlAlloc.document_type === 'invoice' ? 'Pardavimo dokumentas' : 'Pirkimo dokumentas'}
                      </Typography>
                      <DRp label="Nr." value={dtlAlloc.document?.full_number} bold />
                      <DRp label={dtlAlloc.document_type === 'invoice' ? 'Pirkėjas' : 'Tiekėjas'}
                        value={dtlAlloc.document_type === 'invoice' ? dtlAlloc.document?.buyer_name : dtlAlloc.document?.seller_name} />
                      <DRp label="Kodas" value={dtlAlloc.document_type === 'invoice' ? dtlAlloc.document?.buyer_id : dtlAlloc.document?.seller_id} />
                      <DRp label="Data" value={fmtD(dtlAlloc.document?.invoice_date)} />
                      {dtlAlloc.document?.due_date && <DRp label="Terminas" value={fmtD(dtlAlloc.document.due_date)} />}
                      <Divider sx={{ my: 0.75 }} />
                      <DRp label="Be PVM" value={fmt(dtlAlloc.document?.amount_wo_vat)} />
                      <DRp label="PVM" value={fmt(dtlAlloc.document?.vat_amount)} />
                      <DRp label="Su PVM" value={fmt(dtlAlloc.document?.amount_with_vat)} bold />
                      <Divider sx={{ my: 0.75 }} />
                      <DRp label="Susieta suma" value={fmt(dtlAlloc?.amount)} bold />
                    </Paper>
                  )}
                </>)}
              </Box>
            </Box>

          ) : dtlTxn && dtlIsClassified ? (
            /* ═══ CLASSIFIED ═══ */
            <Box>
              {dtlTxn.transaction_category && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" color="text.secondary">Tipas</Typography>
                  <Box sx={{ mt: 0.5 }}>{rCat(dtlTxn)}</Box>
                </Box>
              )}
              {dtlTxn.counterparty_account && <DR label="IBAN" value={dtlTxn.counterparty_account} />}
              {dtlTxn.doc_number && <DR label="Dok. Nr." value={dtlTxn.doc_number} />}
              {dtlTxn.reference_number && <DR label="Nuoroda" value={dtlTxn.reference_number} />}
              <DR label="Bankas" value={dtlTxn.bank_name} />

              {dtlTxn.category_account_debit && (<>
                <Divider sx={{ my: 1.5 }} />
                <Typography fontSize={14} fontWeight={700} sx={{ mb: 1 }}>Korespondencija</Typography>
                <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                  <Box sx={{ display: 'flex', py: 0.75, px: 1.5, bgcolor: '#f5f5f5', borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Typography fontSize={12} fontWeight={700} sx={{ width: 40 }}>Pusė</Typography>
                    <Typography fontSize={12} fontWeight={700} sx={{ flex: 1 }}>Sąskaita</Typography>
                    <Typography fontSize={12} fontWeight={700} sx={{ width: 100, textAlign: 'right' }}>Suma</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', py: 0.75, px: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Typography fontSize={13} sx={{ width: 40 }}>D</Typography>
                    <Typography fontSize={13} fontWeight={600} sx={{ flex: 1 }}>{dtlTxn.category_account_debit}</Typography>
                    <Typography fontSize={13} fontWeight={700} sx={{ width: 100, textAlign: 'right' }}>{fmt(dtlTxn.amount, dtlTxn.currency)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', py: 0.75, px: 1.5 }}>
                    <Typography fontSize={13} sx={{ width: 40 }}>K</Typography>
                    <Typography fontSize={13} fontWeight={600} sx={{ flex: 1 }}>{dtlTxn.category_account_credit || '2710'}</Typography>
                    <Typography fontSize={13} fontWeight={700} sx={{ width: 100, textAlign: 'right' }}>{fmt(dtlTxn.amount, dtlTxn.currency)}</Typography>
                  </Box>
                </Paper>
                {dtlTxn.journal_entry_id && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                    DK įrašas #{dtlTxn.journal_entry_id} (Juodraštis)
                  </Typography>
                )}
              </>)}
            </Box>

          ) : dtlTxn && (
            /* ═══ UNMATCHED / DEFERRED / IGNORED ═══ */
            <Box>
              {dtlTxn.match_status === 'deferred' ? (
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 2, p: 1.5, borderRadius: 2,
                  bgcolor: 'rgba(94,53,177,0.06)', border: '1px solid rgba(94,53,177,0.2)' }}>
                  <DeferIcon sx={{ color: '#5e35b1', fontSize: 20, mt: 0.25 }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography fontSize={13} fontWeight={600} color="#5e35b1">
                      Atidėta iki {fmtD(dtlTxn.deferred_until)}
                    </Typography>
                    {dtlTxn.match_details?.deferred?.note && (
                      <Typography fontSize={12} color="text.secondary" sx={{ mt: 0.25 }}>
                        {dtlTxn.match_details.deferred.note}
                      </Typography>
                    )}
                  </Box>
                  <Button size="small" startIcon={<RestoreIcon />} onClick={() => doRestore(dtlTxn)}>
                    Grąžinti
                  </Button>
                </Box>
              ) : dtlTxn.match_status === 'ignored' ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, p: 1.5, borderRadius: 2,
                  bgcolor: '#f5f5f5', border: '1px solid #e0e0e0' }}>
                  <IgnoredIcon sx={{ color: '#90a4ae', fontSize: 20 }} />
                  <Typography fontSize={13} color="text.secondary" sx={{ flex: 1 }}>
                    Operacija ignoruojama — DK įrašas nebus kuriamas
                  </Typography>
                  <Button size="small" startIcon={<RestoreIcon />} onClick={() => doRestore(dtlTxn)}>
                    Grąžinti
                  </Button>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, p: 1.5, borderRadius: 2,
                  bgcolor: 'rgba(255,152,0,0.06)', border: '1px solid rgba(255,152,0,0.2)' }}>
                  <WarningIcon sx={{ color: '#ed6c02', fontSize: 20 }} />
                  <Typography fontSize={13} color="text.secondary">Ši operacija dar neapdorota</Typography>
                </Box>
              )}
              {dtlTxn.counterparty_account && <DR label="IBAN" value={dtlTxn.counterparty_account} />}
              {dtlTxn.doc_number && <DR label="Dok. Nr." value={dtlTxn.doc_number} />}
              {dtlTxn.reference_number && <DR label="Nuoroda" value={dtlTxn.reference_number} />}
              <DR label="Bankas" value={dtlTxn.bank_name} />
            </Box>
          )}
        </DialogContent>

        {/* Actions */}
        {!dtlLoad && dtlTxn && (
          <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
            {dtlHasDoc && !dtlIsLikely ? (<>
              <Button color="error" size="small" onClick={() => dtlFirstAlloc && handleUnlink(dtlFirstAlloc.id)}>Panaikinti susiejimą</Button>
              <Button variant="contained" size="small" startIcon={<OpenIcon />}
                onClick={() => {
                  if (dtlAlloc?.document_type === 'invoice') navigate(`/israsymas/${dtlAlloc.document?.id}`);
                  else if (dtlAlloc?.document_type === 'purchase') navigate(`/pirkimai/${dtlAlloc.document?.id}`);
                  closeDetail();
                }}>Atidaryti dokumentą</Button>
            </>) : dtlIsLikely ? (<>
              <Button color="error" size="small" onClick={() => dtlFirstAlloc && handleUnlink(dtlFirstAlloc.id)}>Panaikinti susiejimą</Button>
              <Button variant="outlined" size="small" startIcon={<OpenIcon />}
                onClick={() => {
                  if (dtlAlloc?.document_type === 'invoice') navigate(`/israsymas/${dtlAlloc.document?.id}`);
                  else if (dtlAlloc?.document_type === 'purchase') navigate(`/pirkimai/${dtlAlloc.document?.id}`);
                  closeDetail();
                }}>Atidaryti dokumentą</Button>
            </>) : dtlIsClassified ? (<>
              <Box />
              <Button variant="outlined" size="small" onClick={() => { closeDetail(); openMt(dtlTxn, 'dk'); }}>Keisti D/K</Button>
            </>) : dtlIsUnmatched ? (
              <Button fullWidth variant="contained" size="small" startIcon={<LinkIcon />}
                onClick={() => { closeDetail(); openMt(dtlTxn); }}>Apdoroti operaciją</Button>
            ) : <Box />}
          </DialogActions>
        )}
      </Dialog>

      {/* ══ REGISTER DK DIALOG ══
      <RegisterDKDialog
        open={dkDlg.open}
        txn={dkDlg.txn}
        onClose={() => setDkDlg({ open: false, txn: null })}
        onSuccess={() => loadTxns(true)}
        showSnack={show}
      /> */}

      {/* ══ MATCH DIALOG ══ */}
      <ResolveTransactionDialog
        open={mtDlg.open}
        txn={mtDlg.txn}
        initialTab={mtDlg.tab || 'match'}
        onClose={() => setMtDlg({ open: false, txn: null, tab: 'match' })}
        onSuccess={() => loadTxns(true)}
        showSnack={show}
        onOpenDkDialog={(t) => setDkDlg({ open: true, txn: t })}
      />
      <TransactionInfoDialog
        open={infoDlg.open}
        txn={infoDlg.txn}
        onClose={() => setInfoDlg({ open: false, txn: null })}
        onSuccess={() => loadTxns(true)}
        showSnack={show}
        onEdit={(t, tab) => openMt(t, tab)}
      />
    </>
  );
};

// ── Sub-components ──

const SC = ({ icon, label, value, color, active, onClick }) => (
  <Paper variant="outlined" onClick={onClick} sx={{
    px: 2, py: 1.5, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1.5,
    minWidth: 140, flex: '1 1 0', cursor: 'pointer', transition: 'all 0.15s',
    borderColor: active ? (color || '#1565c0') : undefined,
    backgroundColor: active ? `${color || '#1565c0'}08` : undefined,
    '&:hover': { backgroundColor: `${color || '#1565c0'}08` },
  }}>
    {icon}
    <Box>
      <Typography fontWeight={700} fontSize={22} lineHeight={1.2} color={color || 'text.primary'}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  </Paper>
);

const DR = ({ label, value, bold, color }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, alignItems: 'center' }}>
    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120, flexShrink: 0 }}>{label}</Typography>
    {typeof value === 'string' || typeof value === 'number'
      ? <Typography variant="body2" sx={{ fontWeight: bold ? 700 : 400, color: color || 'text.primary', textAlign: 'right', wordBreak: 'break-word' }}>{value || '—'}</Typography>
      : value}
  </Box>
);

const DRp = ({ label, value, bold }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant="body2" sx={{ fontWeight: bold ? 700 : 400 }}>{value || '—'}</Typography>
  </Box>
);

const ConfidenceRing = ({ value }) => {
  const pct = Math.round(value * 100);
  const c = pct >= 80 ? '#2e7d32' : pct >= 50 ? '#ed6c02' : '#d32f2f';
  return (
    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
      <CircularProgress variant="determinate" value={pct} size={48}
        sx={{ color: c, '& .MuiCircularProgress-circle': { strokeLinecap: 'round' } }} />
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography fontSize={13} fontWeight={700} color={c}>{pct}%</Typography>
      </Box>
    </Box>
  );
};

const DocumentPreview = ({ url }) => {
  const isPdf = url?.toLowerCase().endsWith('.pdf');
  return (
    <Box sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden', bgcolor: '#f8f8f8', minHeight: 320 }}>
      {isPdf
        ? <Box component="iframe" src={url} sx={{ width: '100%', height: 500, border: 'none', display: 'block' }} />
        : <Box component="img" src={url} alt="Dokumentas" sx={{ width: '100%', display: 'block', objectFit: 'contain', maxHeight: 500 }}
            onError={(e) => { e.target.style.display = 'none'; }} />
      }
    </Box>
  );
};

export default BankTransactionsTab;