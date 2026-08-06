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
  PostAdd as DKIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { invoicingApi } from '../api/invoicingApi';
import { useCompanyProfiles } from '../contexts/useCompanyProfiles';
import RegisterDKDialog from '../components/RegisterDKDialog';

// ── Config ──

const STATUS_MAP = {
  auto_matched:     { label: 'Susieta',               color: 'success' },
  confirmed:        { label: 'Susieta',               color: 'success' },
  manually_matched: { label: 'Susieta',               color: 'info' },
  likely_matched:   { label: 'Laukia patvirtinimo',   color: 'warning' },
  classified:       { label: 'Atpažinta',             color: 'info' },
  unmatched:        { label: 'Nesusieta',             color: 'default' },
};

const CAT_CFG = {
  supplier_payment:  { label: 'Mokėjimas tiekėjui',      color: '#1565c0' },
  customer_receipt:  { label: 'Įplauka iš pirkėjo',      color: '#2e7d32' },
  bank_fee:          { label: 'Banko mokestis',           color: '#795548' },
  tax_vmi:           { label: 'VMI mokestis',             color: '#d32f2f' },
  tax_sodra:         { label: 'Sodra / VSDFV',           color: '#c62828' },
  salary:            { label: 'Darbo užmokestis',         color: '#6a1b9a' },
  owner_withdrawal:  { label: 'Savininko lėšų paėmimas', color: '#37474f' },
  owner_deposit:     { label: 'Savininko įnašas',        color: '#37474f' },
  loan_payment:      { label: 'Paskolos grąžinimas',     color: '#4527a0' },
  loan_received:     { label: 'Gauta paskola',           color: '#4527a0' },
  provider_payout:   { label: 'Tarpininko išmoka',       color: '#00695c' },
  refund_received:   { label: 'Gautas grąžinimas',       color: '#ff6f00' },
  other_expense:     { label: 'Kitos sąnaudos',          color: '#757575' },
  other_income:      { label: 'Kitos pajamos',           color: '#757575' },
};

const MANUAL_CATS = [
  'bank_fee', 'tax_vmi', 'tax_sodra', 'salary',
  'owner_withdrawal', 'owner_deposit',
  'loan_payment', 'loan_received',
  'provider_payout', 'refund_received',
  'other_expense', 'other_income',
];

const BANK_CFG = {
  swedbank: 'Swedbank', seb: 'SEB', luminor: 'Luminor',
  siauliu: 'Artea', revolut: 'Revolut', other: 'Kitas',
};

const fmt = (v, c = 'EUR') => v == null ? '—' : `${parseFloat(v).toFixed(2).replace('.', ',')} ${c === 'EUR' ? '€' : c}`;
const fmtD = (d) => { if (!d) return '—'; const p = String(d).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d; };

const isMatchedStatus = (s) => ['auto_matched', 'confirmed', 'manually_matched', 'likely_matched'].includes(s);

// ══════════════════════════════════════════

const BankTransactionsTab = ({ statements = [], initialStatementId = '', onClearStatementFilter, showSnack }) => {
  const navigate = useNavigate();
  const show = showSnack || (() => {});
  const { activeId } = useCompanyProfiles();

  // ── Table state ──
  const [txns, setTxns] = useState([]);
  const [txnTotal, setTxnTotal] = useState(0);
  const [apiStats, setApiStats] = useState({ total: 0, processed: 0, needs_action: 0 });
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

  // ── Register DK dialog ──
  const [dkDlg, setDkDlg] = useState({ open: false, txn: null });

  // ── Match dialog ──
  const [mtDlg, setMtDlg] = useState({ open: false, txn: null });
  const [mtQ, setMtQ] = useState('');
  const [mtRes, setMtRes] = useState([]);
  const [mtSLoad, setMtSLoad] = useState(false);
  const [mtLoad, setMtLoad] = useState(false);

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
  const openDetail = async (txn) => {
    setDtlOpen(true);
    setDtlTxn(txn);
    setDtlAlloc(null);
    setDtlLoad(true);
    setDtlAllocLoad(false);

    try {
      const { data } = await invoicingApi.getBankTransactionDetail(txn.id, txn.direction);
      setDtlTxn(data);
      setDtlLoad(false);

      if (data.allocations?.length > 0) {
        setDtlAllocLoad(true);
        try { const { data: ad } = await invoicingApi.getAllocationPreview(data.allocations[0].id); setDtlAlloc(ad); } catch {}
        setDtlAllocLoad(false);
      }
    } catch { setDtlLoad(false); }
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
  const openMt = (txn) => { setMtDlg({ open: true, txn }); setMtQ(''); setMtRes([]); };
  useEffect(() => {
    if (!mtDlg.open || mtQ.length < 2) { setMtRes([]); return; }
    const t = setTimeout(async () => {
      setMtSLoad(true);
      try {
        if (mtDlg.txn.direction === 'incoming') {
          const { data } = await invoicingApi.getInvoices({ q: mtQ, limit: 10, category: 'israsytos' });
          setMtRes((data.results || []).map(i => ({ type: 'invoice', id: i.id, number: i.full_number || `${i.document_series}-${i.document_number}`, name: i.buyer_name, amount: i.amount_with_vat, date: i.invoice_date })));
        } else {
          const { data } = await invoicingApi.getPurchases({ q: mtQ, limit: 10 });
          setMtRes((data.results || []).map(p => ({ type: 'purchase', id: p.id, number: `${p.document_series || ''}${p.document_number || ''}`, name: p.seller_name, amount: p.amount_with_vat, date: p.invoice_date })));
        }
      } catch { setMtRes([]); } finally { setMtSLoad(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [mtQ, mtDlg.open]);

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

  const rSts = (t) => {
    const c = STATUS_MAP[t.match_status] || STATUS_MAP.unmatched;
    return <Chip label={c.label} color={c.color} size="small" variant="outlined" sx={{ fontSize: 11, height: 22 }} />;
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
            onClick={e => { e.stopPropagation(); setEditCatId(t.id); }}>
            <EditIcon sx={{ fontSize: 14, color: '#bdbdbd' }} />
          </IconButton>
        </Box>
      );
    }
    const c = CAT_CFG[t.transaction_category];
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, '&:hover .edit-icon': { opacity: 1 } }}>
        <Chip label={c?.label || t.category_display} size="small" sx={{
          fontSize: 11, height: 22, backgroundColor: `${c?.color || '#757575'}14`,
          color: c?.color || '#757575', border: `1px solid ${c?.color || '#757575'}40`,
        }} />
        {t.match_status === 'unmatched' && (
          <IconButton size="small" className="edit-icon" sx={{ opacity: 0, transition: 'opacity 0.15s', p: 0.25 }}
            onClick={e => { e.stopPropagation(); setEditCatId(t.id); }}>
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
    if (t.match_status === 'unmatched' && !t.transaction_category) {
      return (
        <Tooltip title="Susieti">
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
        <SC icon={<CheckCircleIcon sx={{ color: '#2e7d32' }} />} label="Apdorota" value={apiStats.processed} color="#2e7d32"
          active={txnF.match_status === 'processed'} onClick={() => handleStatClick('processed')} />
        <SC icon={<WarningIcon sx={{ color: '#d32f2f' }} />} label="Reikia veiksmų" value={apiStats.needs_action} color="#d32f2f"
          active={txnF.match_status === 'needs_action'} onClick={() => handleStatClick('needs_action')} />
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
                <TableRow key={`${t.direction}-${t.id}`} hover sx={{ '& td': { py: 1.2 }, cursor: 'pointer',
                  backgroundColor: t.match_status === 'unmatched' && !t.transaction_category ? 'rgba(255,152,0,0.04)' : undefined }}
                  onClick={() => openDetail(t)}>
                  <TableCell>{rDir(t.direction)}</TableCell>
                  <TableCell><Typography fontSize={13}>{fmtD(t.transaction_date)}</Typography></TableCell>
                  <TableCell>
                    <Typography fontSize={13} fontWeight={600} sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.counterparty_name || '—'}</Typography>
                    {t.counterparty_code && <Typography variant="caption" color="text.secondary">{t.counterparty_code}</Typography>}
                  </TableCell>
                  <TableCell align="right"><Typography fontSize={13} fontWeight={700} color={t.direction === 'incoming' ? 'success.main' : 'text.primary'}>{t.direction === 'incoming' ? '+' : '-'}{fmt(t.amount, t.currency)}</Typography></TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
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
                        <Chip label={STATUS_MAP[dtlTxn.match_status]?.label} color={STATUS_MAP[dtlTxn.match_status]?.color}
                          size="small" variant="outlined" sx={{ fontSize: 11, height: 20, mt: 0.25 }} />
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
            /* ═══ UNMATCHED ═══ */
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, p: 1.5, borderRadius: 2,
                bgcolor: 'rgba(255,152,0,0.06)', border: '1px solid rgba(255,152,0,0.2)' }}>
                <WarningIcon sx={{ color: '#ed6c02', fontSize: 20 }} />
                <Typography fontSize={13} color="text.secondary">Ši operacija dar neapdorota</Typography>
              </Box>
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
              <Button variant="outlined" size="small" onClick={() => { closeDetail(); setDkDlg({ open: true, txn: dtlTxn }); }}>Keisti tipą</Button>
            </>) : dtlIsUnmatched ? (
              <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
                <Button variant="outlined" size="small" sx={{ flex: 1 }} startIcon={<LinkIcon />}
                  onClick={() => { closeDetail(); openMt(dtlTxn); }}>Susieti su dokumentu</Button>
                <Button variant="outlined" size="small" sx={{ flex: 1 }} startIcon={<DKIcon />}
                  onClick={() => { closeDetail(); setDkDlg({ open: true, txn: dtlTxn }); }}>Sukurti DK įrašą</Button>
              </Box>
            ) : <Box />}
          </DialogActions>
        )}
      </Dialog>

      {/* ══ REGISTER DK DIALOG ══ */}
      <RegisterDKDialog
        open={dkDlg.open}
        txn={dkDlg.txn}
        onClose={() => setDkDlg({ open: false, txn: null })}
        onSuccess={() => loadTxns(true)}
        showSnack={show}
      />

      {/* ══ MATCH DIALOG ══ */}
      <Dialog open={mtDlg.open} onClose={() => setMtDlg({ open: false, txn: null })} maxWidth="sm" fullWidth disableScrollLock>
        <DialogTitle>Susieti su dokumentu</DialogTitle>
        <DialogContent>{mtDlg.txn && (<Box sx={{ mt: 1 }}>
          <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2, bgcolor: '#f9f9f9' }}>
            <Typography fontSize={13}><strong>{mtDlg.txn.counterparty_name}</strong></Typography>
            <Typography fontSize={14} fontWeight={700}>{fmt(mtDlg.txn.amount, mtDlg.txn.currency)}</Typography>
          </Paper>
          <TextField fullWidth size="small" placeholder="Ieškoti dokumento..." value={mtQ} onChange={e => setMtQ(e.target.value)} autoFocus
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
              endAdornment: mtSLoad ? <CircularProgress size={18} /> : null }} />
          <Box sx={{ mt: 1.5, maxHeight: 300, overflow: 'auto' }}>
            {mtRes.length === 0 && mtQ.length >= 2 && !mtSLoad && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>Nerasta</Typography>
            )}
            {mtRes.map(d => (
              <Paper key={`${d.type}-${d.id}`} variant="outlined" sx={{ p: 1.5, mb: 1, borderRadius: 2, cursor: 'pointer', '&:hover': { bgcolor: '#f5f5f5' } }}
                onClick={() => doMt(d)}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Chip label={d.type === 'invoice' ? 'SF' : 'Pirk.'} size="small"
                        color={d.type === 'invoice' ? 'primary' : 'secondary'} sx={{ fontSize: 10, height: 18 }} />
                      <Typography fontSize={13} fontWeight={700}>{d.number}</Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">{d.name} · {fmtD(d.date)}</Typography>
                  </Box>
                  <Typography fontWeight={700} fontSize={13}>{fmt(d.amount)}</Typography>
                </Box>
              </Paper>
            ))}
          </Box>
          {mtLoad && <LinearProgress sx={{ mt: 1 }} />}
        </Box>)}</DialogContent>
        <DialogActions><Button onClick={() => setMtDlg({ open: false, txn: null })}>Atšaukti</Button></DialogActions>
      </Dialog>
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