import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Paper, Typography, Button, IconButton, Chip, TextField,
  Dialog, DialogTitle, DialogContent, CircularProgress, Divider,
  Skeleton, Tooltip, InputAdornment, List, ListItemButton,
  DialogActions, useMediaQuery, useTheme,
} from '@mui/material';
import {
  Close as CloseIcon,
  ArrowDownward as IncomingIcon,
  ArrowUpward as OutgoingIcon,
  Check as ConfirmIcon,
  Clear as RejectIcon,
  LinkOff as UnlinkIcon,
  CheckCircle as OkIcon,
  ErrorOutline as WarnIcon,
  Edit as EditIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { invoicingApi } from '../api/invoicingApi';
import { api } from '../api/endpoints';
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

const NEG_HINTS = ['nesutampa', 'vėluoja', 'per toli', 'nerasta', 'prieš dokumentą'];
const isNeg = (k) => NEG_HINTS.some(h => String(k).toLowerCase().includes(h));

const reconLabel = (r, docType) => {
  const who = docType === 'invoice' ? 'Pirkėjo' : 'Tiekėjo';
  const diff = parseFloat(r.diff) || 0;

  if (r.ok) return `${who} skola pilnai padengta`;
  if (diff > 0) return `${who} skolos likutis: ${fmt(diff)}`;
  return `${who} permoka: ${fmt(Math.abs(diff))}`;
};

// ── Confidence ring ──

const Ring = ({ value, size = 52 }) => {
  const pct = Math.round((parseFloat(value) || 0) * 100);
  const c = pct >= 80 ? '#2e7d32' : pct >= 50 ? '#ed6c02' : '#d32f2f';
  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <CircularProgress variant="determinate" value={pct} size={size}
        sx={{ color: c, '& .MuiCircularProgress-circle': { strokeLinecap: 'round' } }} />
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography fontSize={13} fontWeight={700} color={c}>{pct}%</Typography>
      </Box>
    </Box>
  );
};

// ── Sąskaitos pasirinkimo dialogas ──

const AccountPickerDialog = ({ open, line, onClose, onPicked, showSnack }) => {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQ(''); setOpts([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) { setOpts([]); return; }
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/apskaita/chart-accounts/', {
          params: { q: q.trim() }, withCredentials: true,
        });
        if (alive) setOpts(data.results || []);
      } catch { if (alive) setOpts([]); }
      finally { if (alive) setLoading(false); }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q, open]);

  const pick = async (opt) => {
    if (!line || opt.code === line.account_code) { onClose(); return; }
    setBusy(true);
    try {
      const { data } = await invoicingApi.patchDkLine(line.id, { account_code: opt.code });
      onPicked?.(data);
      onClose();
    } catch (e) {
      showSnack?.(e.response?.data?.detail || 'Nepavyko pakeisti sąskaitos', 'error');
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth disableScrollLock>
      <DialogTitle sx={{ pb: 1 }}>
        <Typography fontSize={15} fontWeight={700}>Pasirinkti sąskaitą</Typography>
        {line && (
          <Typography fontSize={12} color="text.secondary" sx={{ mt: 0.25 }}>
            Dabar: <b>{line.account_code}</b> {line.account_name}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <TextField fullWidth size="small" autoFocus value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Kodas arba pavadinimas, pvz. 6300 arba nuoma"
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            endAdornment: loading ? <CircularProgress size={16} /> : null,
          }} />

        <List dense sx={{ mt: 1, maxHeight: 340, overflowY: 'auto' }}>
          {opts.map(o => (
            <ListItemButton key={o.code} disabled={busy} onClick={() => pick(o)}
              sx={{ borderRadius: 1.5, mb: 0.25 }}>
              <Typography fontSize={13} fontWeight={700} sx={{ width: 62, flexShrink: 0 }}>
                {o.code}
              </Typography>
              <Typography fontSize={13} color="text.secondary">{o.name}</Typography>
            </ListItemButton>
          ))}
          {q.trim().length >= 2 && !loading && opts.length === 0 && (
            <Typography fontSize={12} color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              Nieko nerasta
            </Typography>
          )}
          {q.trim().length < 2 && (
            <Typography fontSize={12} color="text.disabled" sx={{ py: 2, textAlign: 'center' }}>
              Įveskite bent 2 simbolius
            </Typography>
          )}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Atšaukti</Button>
      </DialogActions>
    </Dialog>
  );
};

// ── DK eilutė ──

const DKLine = ({ line, onEdit }) => {
  const sideChip = (
    <Box component="span" sx={{
      fontSize: 10, fontWeight: 700, px: 0.75, py: 0.15, borderRadius: 0.75,
      bgcolor: line.side === 'D' ? '#EFF6FF' : '#FEF2F2',
      color: line.side === 'D' ? '#2563EB' : '#DC2626',
    }}>{line.side}</Box>
  );

  return (
    <Tooltip title={`${line.account_code} · ${line.account_name || 'be pavadinimo'}`}
      placement="top-start" enterDelay={400}>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, py: 0.6, px: 1.25,
        borderBottom: '1px solid', borderColor: 'divider',
        '&:last-child': { borderBottom: 'none' },
        bgcolor: line.is_editable ? undefined : '#fafafa',
        '&:hover .edit-btn': { opacity: line.is_editable ? 1 : 0 },
      }}>
        <Box sx={{ width: 24, flexShrink: 0 }}>{sideChip}</Box>

        <Typography fontSize={12} fontWeight={700} sx={{ width: 48, flexShrink: 0 }}>
          {line.account_code}
        </Typography>

        <Typography fontSize={11} color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }}>
          {line.account_name || '—'}
        </Typography>

        <Box sx={{ width: 22, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
          {line.is_editable && (
            <IconButton size="small" className="edit-btn"
              onClick={() => onEdit(line)}
              sx={{ p: 0.25, opacity: 0, transition: 'opacity 0.15s' }}>
              <EditIcon sx={{ fontSize: 14, color: '#9e9e9e' }} />
            </IconButton>
          )}
        </Box>

        <Typography fontSize={12} fontWeight={700} sx={{ width: 76, textAlign: 'right', flexShrink: 0 }}>
          {fmt(line.amount)}
        </Typography>
      </Box>
    </Tooltip>
  );
};

// ── DK blokas ──

const DKBlock = ({ title, entry, onEdit }) => {
  if (!entry) return null;
  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
        <Typography fontSize={13} fontWeight={700} sx={{ flex: 1, minWidth: 0 }}>{title}</Typography>
        <Tooltip title={`${entry.document_number || ''} · ${entry.status_display || ''}`}>
          <Typography fontSize={10} color="text.disabled" noWrap sx={{ maxWidth: 90 }}>
            {entry.status_display || ''}
          </Typography>
        </Tooltip>
      </Box>
      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        {(entry.lines || []).map(l => (
          <DKLine key={l.id} line={l} onEdit={onEdit} />
        ))}
      </Paper>
    </Box>
  );
};

// ══════════════════════════════════════════

const TransactionInfoDialog = ({ open, txn, onClose, onSuccess, showSnack, onEdit }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const show = showSnack || (() => {});

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [pickLine, setPickLine] = useState(null);

  const load = useCallback(async () => {
    if (!open || !txn?.id) return;
    setLoading(true);
    try {
      const { data: d } = await invoicingApi.getTransactionFullInfo(txn.id, txn.direction);
      setData(d);
    } catch {
      show('Nepavyko įkelti operacijos', 'error');
    } finally { setLoading(false); }
  }, [open, txn?.id, txn?.direction]);

  useEffect(() => { load(); }, [load]);

  const t = data?.transaction || txn || {};
  const alloc = data?.allocation;
  const doc = data?.document;
  const recon = data?.reconciliation;
  const isIncoming = (t.direction || 'outgoing') === 'incoming';
  const needsConfirm = t.match_status === 'likely_matched';
  const hasDoc = !!doc;

  const reasons = useMemo(
    () => Object.entries(alloc?.match_reasons || {}),
    [alloc],
  );

  const doConfirm = async () => {
    if (!alloc) return;
    setActing(true);
    try {
      await invoicingApi.confirmAllocation(alloc.id);
      show('Patvirtinta'); onSuccess?.(); onClose();
    } catch { show('Nepavyko', 'error'); } finally { setActing(false); }
  };

  const doReject = async () => {
    if (!alloc) return;
    setActing(true);
    try {
      await invoicingApi.rejectAllocation(alloc.id);
      show('Atmesta'); onSuccess?.(); onClose();
    } catch { show('Nepavyko', 'error'); } finally { setActing(false); }
  };

  const doUnlink = async () => {
    if (!alloc) return;
    if (!window.confirm('Panaikinti susiejimą su dokumentu?')) return;
    setActing(true);
    try {
      await invoicingApi.rejectAllocation(alloc.id);
      show('Susiejimas panaikintas'); onSuccess?.(); onClose();
    } catch { show('Nepavyko', 'error'); } finally { setActing(false); }
  };

  // ── Left: transaction ──
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

      <Typography fontSize={22} fontWeight={700} color={isIncoming ? 'success.main' : 'text.primary'}>
        {fmt(t.amount, t.currency)}
      </Typography>
      {(t.currency || 'EUR') !== 'EUR' && t.amount_eur && (
        <Typography fontSize={11} color="text.secondary">= {fmt(t.amount_eur)} </Typography>
      )}
      <Typography fontSize={12} color="text.secondary" sx={{ mb: 2 }}>
        {fmtD(t.transaction_date)}
      </Typography>

      <Divider sx={{ mb: 1.5 }} />

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <F label="Kontrahentas" value={t.counterparty_name} bold />
        <F label="Kodas" value={t.counterparty_code} />
        <F label="IBAN" value={t.counterparty_account} small />
        <F label="Dok. nr." value={t.doc_number} />
        <F label="Nuoroda" value={t.reference_number} />
        <F label="Bankas" value={t.bank_name} />
        {parseFloat(t.fee_amount || 0) > 0 && <F label="Komisinis" value={fmt(t.fee_amount, t.currency)} />}
        {parseFloat(t.exchange_fee || 0) > 0 && <F label="Keitimo mok." value={fmt(t.exchange_fee)} />}

        {t.payment_purpose && (
          <Box sx={{ mt: 1.5 }}>
            <Typography fontSize={11} color="text.secondary">Paskirtis</Typography>
            <Typography fontSize={12} sx={{ wordBreak: 'break-word', mt: 0.25 }}>
              {t.payment_purpose}
            </Typography>
          </Box>
        )}
      </Box>

      {t.category_display && (
        <Box sx={{ pt: 1.5, mt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography fontSize={11} color="text.secondary">Tipas</Typography>
          <Typography fontSize={12} fontWeight={600}>{t.category_display}</Typography>
        </Box>
      )}
    </Box>
  );

  // ── Right ──
  const content = loading ? (
    <Box sx={{ p: 2 }}>
      <Skeleton variant="rounded" height={70} sx={{ mb: 1.5, borderRadius: 2 }} />
      <Skeleton variant="rounded" height={180} sx={{ mb: 1.5, borderRadius: 2 }} />
      <Skeleton variant="rounded" height={140} sx={{ borderRadius: 2 }} />
    </Box>
  ) : (
    <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
      {needsConfirm && alloc && (
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5,
          bgcolor: 'rgba(237,108,2,0.06)', borderBottom: '1px solid rgba(237,108,2,0.2)',
        }}>
          <Ring value={alloc.confidence} size={44} />
          <Typography fontSize={13} fontWeight={600} sx={{ flex: 1 }}>
            Laukia patvirtinimo
          </Typography>
          <Button variant="outlined" color="error" size="small" startIcon={<RejectIcon />}
            disabled={acting} onClick={doReject}>Atmesti</Button>
          <Button variant="contained" color="success" size="small" startIcon={<ConfirmIcon />}
            disabled={acting} onClick={doConfirm}>
            {acting ? <CircularProgress size={18} color="inherit" /> : 'Patvirtinti'}
          </Button>
        </Box>
      )}

      <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: 0 }}>
        {hasDoc && (
          <Box sx={{
            flex: isMobile ? '0 0 auto' : '1 1 46%', p: 1.5, minWidth: 0,
            borderRight: isMobile ? 'none' : '1px solid',
            borderBottom: isMobile ? '1px solid' : 'none', borderColor: 'divider',
          }}>
            <DocumentPreviewPane url={doc.preview_url}
              maxHeight={isMobile ? '40vh' : 'calc(85vh - 220px)'} />
          </Box>
        )}

        <Box sx={{ flex: 1, minWidth: 0, p: 2 }}>
          {hasDoc && (
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                {!needsConfirm && alloc && <Ring value={alloc.confidence} />}
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontSize={14} fontWeight={700} noWrap>{doc.full_number}</Typography>
                  <Typography fontSize={12} color="text.secondary" noWrap>
                    {doc.counterparty_name}
                    {doc.counterparty_code ? ` · ${doc.counterparty_code}` : ''}
                  </Typography>
                </Box>
              </Box>
              <F label="Data" value={fmtD(doc.invoice_date)} />
              {doc.due_date && <F label="Terminas" value={fmtD(doc.due_date)} />}
              <F label="Be PVM" value={fmt(doc.amount_wo_vat, doc.currency)} />
              <F label="PVM" value={fmt(doc.vat_amount, doc.currency)} />
              <F label="Su PVM" value={fmt(doc.amount_with_vat, doc.currency)} bold />
              {alloc && <F label="Susieta suma" value={fmt(alloc.amount, doc.currency)} bold />}
            </Paper>
          )}

          {reasons.length > 0 && (
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 2 }}>
              <Typography fontSize={13} fontWeight={700} sx={{ mb: 0.75 }}>Susiejimo kriterijai</Typography>
              {reasons.map(([k, v]) => (
                <Box key={k} sx={{ display: 'flex', gap: 1, py: 0.3, alignItems: 'flex-start' }}>
                  {isNeg(k)
                    ? <WarnIcon sx={{ fontSize: 15, color: '#ed6c02', mt: 0.2 }} />
                    : <OkIcon sx={{ fontSize: 15, color: '#2e7d32', mt: 0.2 }} />}
                  <Box>
                    <Typography fontSize={12} fontWeight={600}>{k}</Typography>
                    {v !== true && v !== 'True' && v !== false && (
                      <Typography fontSize={11} color="text.secondary">{String(v)}</Typography>
                    )}
                  </Box>
                </Box>
              ))}
            </Paper>
          )}

          <DKBlock
            title={doc?.type === 'invoice' ? 'Pardavimo dokumentas' : 'Pirkimo dokumentas'}
            entry={data?.document_entry}
            onEdit={setPickLine}
          />

          <DKBlock
            title={hasDoc ? 'Mokėjimas' : 'Korespondencija'}
            entry={data?.payment_entry}
            onEdit={setPickLine}
          />

          {recon && (
            <Paper variant="outlined" sx={{
              p: 1.25, borderRadius: 2, mb: 2,
              bgcolor: recon.ok ? 'rgba(46,125,50,0.05)' : 'rgba(237,108,2,0.07)',
              borderColor: recon.ok ? 'rgba(46,125,50,0.3)' : 'rgba(237,108,2,0.35)',
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {recon.ok
                  ? <OkIcon sx={{ fontSize: 17, color: '#2e7d32' }} />
                  : <WarnIcon sx={{ fontSize: 17, color: '#ed6c02' }} />}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontSize={12} fontWeight={600}
                    color={recon.ok ? '#2e7d32' : '#e65100'}>
                    {reconLabel(recon, doc?.type)}
                  </Typography>
                  <Typography fontSize={10} color="text.disabled">
                    {recon.account} · dokumente {fmt(recon.doc_amount)} · mokėjime {fmt(recon.pay_amount)}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          )}

          {!data?.payment_entry && !hasDoc && (
            <Typography fontSize={12} color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              DK įrašo nėra
            </Typography>
          )}

          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            {hasDoc && !needsConfirm && (
              <Button size="small" color="error" startIcon={<UnlinkIcon />}
                disabled={acting} onClick={doUnlink} sx={{ fontSize: 12, textTransform: 'none' }}>
                Panaikinti susiejimą
              </Button>
            )}
            {!hasDoc && (
              <Button size="small" variant="outlined" disabled={acting}
                onClick={() => { onClose(); onEdit?.(t, 'dk'); }}
                sx={{ fontSize: 12, textTransform: 'none' }}>
                Keisti D/K
              </Button>
            )}
          </Box>
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
        <Typography fontSize={16} fontWeight={700}>Banko operacijos informacija</Typography>
        <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: 'flex', overflow: 'hidden', flexDirection: isMobile ? 'column' : 'row' }}>
        <Box sx={{
          flex: isMobile ? '0 0 auto' : '0 0 300px',
          borderRight: isMobile ? 'none' : '1px solid',
          borderBottom: isMobile ? '1px solid' : 'none',
          borderColor: 'divider', bgcolor: '#fcfcfc',
          maxHeight: isMobile ? '35vh' : 'none', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          {txnPanel}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {content}
        </Box>
      </DialogContent>

      <AccountPickerDialog
        open={!!pickLine}
        line={pickLine}
        onClose={() => setPickLine(null)}
        onPicked={() => load()}
        showSnack={show}
      />
    </Dialog>
  );
};

const F = ({ label, value, bold, small }) => {
  if (!value) return null;
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, py: 0.35 }}>
      <Typography fontSize={11} color="text.secondary" sx={{ flexShrink: 0 }}>{label}</Typography>
      <Typography fontSize={small ? 10 : 12} fontWeight={bold ? 700 : 400}
        sx={{ textAlign: 'right', wordBreak: 'break-all' }}>{value}</Typography>
    </Box>
  );
};

export default TransactionInfoDialog;