import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogContent, Button, Typography, Box,
  CircularProgress, IconButton, Tooltip, LinearProgress,
  TextField, MenuItem,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { api } from '../api/endpoints';
import { invoicingApi } from '../api/invoicingApi';

const REASON_LABELS = {
  invoice_number_in_purpose: 'Sąskaitos Nr. rastas paskirtyje',
  amount_exact_remaining:    'Suma sutampa su likučiu',
  amount_exact_total:        'Suma tiksliai sutampa',
  amount_close_remaining:    'Suma artima likučiui',
  amount_close_total:        'Suma artima bendrai sumai',
  counterparty_code_match:   'Įmonės kodas sutampa',
  counterparty_name_exact:   'Mokėtojo pavadinimas sutampa',
  counterparty_name_partial: 'Mokėtojo pavadinimas panašus',
  partial_payment:           'Dalinė įmoka',
  multi_invoice:             'Vienas mokėjimas kelioms sąskaitoms',
  manual:                    'Rankinis pažymėjimas',
  manual_match:              'Rankiniu būdu susieta',
};

const SKIP_REASON_KEYS = new Set([
  'method', 'provider', 'provider_payment_id',
  'Apmokėta pagal išankstinę sąskaitą',
]);

const CUSTOM = '__custom__';

const fmtNum = (n) =>
  Math.abs(Number(n) || 0).toFixed(2).replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const fmtDate = (d) => (d ? String(d).slice(0, 10) : '—');

const sourceLabel = (a) => {
  if (a.source === 'payment_link') {
    const p = a.match_reasons?.provider || '';
    const n = p.charAt(0).toUpperCase() + p.slice(1);
    return n ? `Mokėjimo nuoroda · ${n}` : 'Mokėjimo nuoroda';
  }
  if (a.source === 'bank_import') return 'Banko išrašas';
  if (a.source === 'manual') return 'Rankinis pažymėjimas';
  if (a.source === 'api') return 'API';
  return a.source_display || a.source || '—';
};

const PaymentsDialog = ({
  open, onClose, docType = 'invoice', docId,
  onConfirmAllocation, onRejectAllocation, onRemoveManualPayment,
  onRefresh,
}) => {
  const isPurchase = docType === 'purchase';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [accountDraft, setAccountDraft] = useState('');
  const [customDraft, setCustomDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!docId) return;
    setLoading(true);
    try {
      const res = isPurchase
        ? await api.get(`/purchases/${docId}/payments/`, { withCredentials: true })
        : await invoicingApi.getInvoicePayments(docId);
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [docId, isPurchase]);

  useEffect(() => {
    if (!open || !docId) { setData(null); return; }
    load();
    invoicingApi.getBankAccounts()
      .then((r) => setAccounts(Array.isArray(r.data) ? r.data : []))
      .catch(() => setAccounts([]));
  }, [open, docId, load]);

  const withAction = async (id, fn) => {
    if (!fn) return;
    setActionLoading(id);
    try {
      await fn(id);
      await load();
      onRefresh?.();
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async (allocId) => {
    if (!window.confirm('Pašalinti šį mokėjimą? DK įrašas taip pat bus ištrintas.')) return;
    if (!isPurchase && onRemoveManualPayment) {
      return withAction(allocId, onRemoveManualPayment);
    }
    setBusy(true);
    try {
      await api.post(`/purchases/${docId}/remove-payment/${allocId}/`, {}, { withCredentials: true });
      await load();
      onRefresh?.();
    } catch (e) {
      alert(e?.response?.data?.detail || 'Nepavyko pašalinti');
    } finally {
      setBusy(false);
    }
  };

  const effectiveAccount = accountDraft === CUSTOM ? customDraft.trim() : accountDraft;

  const handleSaveAccount = async (allocId) => {
    if (!effectiveAccount) return;
    setBusy(true);
    try {
      await api.post(
        `/payments/${allocId}/set-account/`,
        { payment_account: effectiveAccount },
        { withCredentials: true },
      );
      setEditingId(null);
      setAccountDraft('');
      setCustomDraft('');
      await load();
      onRefresh?.();
    } catch (e) {
      alert(e?.response?.data?.detail || 'Nepavyko išsaugoti');
    } finally {
      setBusy(false);
    }
  };

  // Abu endpointai grąžina skirtingus laukų vardus — suvienodinam.
  const cur = (isPurchase ? data?.currency : data?.currency) || 'EUR';
  const isForeign = cur !== 'EUR';
  const total = parseFloat(isPurchase ? data?.total : data?.invoice_total) || 0;
  const paid = parseFloat(data?.paid_amount) || 0;
  const remaining = parseFloat(data?.remaining) || 0;
  const docNumber = isPurchase ? data?.document_number : data?.invoice_number;
  const allocations = data?.allocations || [];

  const paidPct = total > 0 ? Math.min((paid / total) * 100, 100) : 0;
  const isFullyPaid = remaining < 0.01 && paid > 0;
  const isPartially = paid > 0 && !isFullyPaid;

  // EUR ekvivalentai — sumuojam iš aliokacijų.
  const paidEur = allocations.reduce(
    (s, a) => s + (parseFloat(a.amount_eur) || parseFloat(a.amount) || 0), 0,
  );

  return (
    <Dialog
      open={open} onClose={onClose} maxWidth="sm" fullWidth disableScrollLock
      PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
    >
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 2.5, py: 1.75, borderBottom: '1px solid #E5E7EB',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
            Mokėjimo informacija
          </Typography>
          {docNumber && (
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#6B7280' }}>
              {docNumber}
            </Typography>
          )}
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ color: '#9CA3AF' }}>
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>

      <DialogContent sx={{ px: 2.5, py: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={32} />
          </Box>
        ) : !data ? (
          <Typography sx={{ py: 2, textAlign: 'center', fontSize: 14, color: '#9CA3AF' }}>
            Nepavyko įkelti mokėjimo informacijos
          </Typography>
        ) : (
          <Box>
            {/* Summary */}
            <Box sx={{
              p: 2, borderRadius: 2.5, mb: 2,
              backgroundColor: isFullyPaid ? '#F0FDF4' : '#F9FAFB',
              border: `1px solid ${isFullyPaid ? '#BBF7D0' : '#E5E7EB'}`,
            }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.25 }}>
                <Box>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', mb: 0.25 }}>
                    {isPurchase ? 'Dokumento suma' : 'Sąskaitos suma'}
                  </Typography>
                  <Typography sx={{ fontSize: 22, fontWeight: 700, color: '#111827', lineHeight: 1 }}>
                    {fmtNum(total)} {cur}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', mb: 0.25 }}>
                    {isPartially ? 'Dalinai apmokėta' : 'Apmokėta'}
                  </Typography>
                  <Typography sx={{
                    fontSize: 18, fontWeight: 700, lineHeight: 1,
                    color: isFullyPaid ? '#16A34A' : paid > 0 ? '#D97706' : '#9CA3AF',
                  }}>
                    {fmtNum(paid)} {cur}
                  </Typography>
                  {isForeign && paidEur > 0 && (
                    <Typography sx={{ fontSize: 11, color: '#9CA3AF', mt: 0.25 }}>
                      ≈ {fmtNum(paidEur)} €
                    </Typography>
                  )}
                </Box>
              </Box>

              <LinearProgress
                variant="determinate" value={paidPct}
                sx={{
                  height: 6, borderRadius: 3,
                  backgroundColor: isFullyPaid ? '#BBF7D0' : '#E5E7EB',
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 3,
                    backgroundColor: isFullyPaid ? '#16A34A' : paid > 0 ? '#F59E0B' : '#D1D5DB',
                  },
                }}
              />

              {remaining > 0.01 && (
                <Typography sx={{ fontSize: 12, color: '#6B7280', mt: 0.75, textAlign: 'right' }}>
                  Likutis: <strong>{fmtNum(remaining)} {cur}</strong>
                </Typography>
              )}
            </Box>

            {allocations.length === 0 ? (
              <Typography sx={{ py: 3, textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>
                Mokėjimų dar nėra
              </Typography>
            ) : (
              allocations.map((a) => {
                const isManual = a.source === 'manual';
                const isProposed = a.status === 'proposed';
                const isBank = a.source === 'bank_import';
                const isLoading = actionLoading === a.id;
                const txn = a.transaction;
                const reasons = Object.entries(a.match_reasons || {})
                  .filter(([k, v]) => v !== false && !SKIP_REASON_KEYS.has(k));
                const eurVal = parseFloat(a.amount_eur);
                const showEur = isForeign && eurVal && eurVal !== Math.abs(parseFloat(a.amount));

                return (
                  <Box key={a.id} sx={{
                    border: '1px solid', borderColor: isProposed ? '#FDE68A' : '#F3F4F6',
                    backgroundColor: isProposed ? '#FFFBEB' : 'transparent',
                    borderRadius: 2, p: 1.5, mb: 1.25,
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#111827', flex: 1 }}>
                        {sourceLabel(a)}
                      </Typography>
                      <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                        {fmtNum(a.amount)} {cur}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: '#9CA3AF', minWidth: 82, textAlign: 'right' }}>
                        {fmtDate(a.payment_date)}
                      </Typography>
                      {isLoading ? (
                        <CircularProgress size={16} />
                      ) : isManual ? (
                        <Tooltip title="Pašalinti" arrow>
                          <IconButton size="small" onClick={() => handleRemove(a.id)} disabled={busy}
                            sx={{ p: 0.25, color: '#D1D5DB', '&:hover': { color: '#DC2626' } }}>
                            <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      ) : <Box sx={{ width: 22 }} />}
                    </Box>

                    {showEur && (
                      <Typography sx={{ fontSize: 11, color: '#9CA3AF', textAlign: 'right' }}>
                        ≈ {fmtNum(eurVal)} €
                      </Typography>
                    )}

                    {txn && (
                      <Typography sx={{ fontSize: 11.5, color: '#6B7280', mt: 0.25 }}>
                        {[txn.bank_name, txn.counterparty_name, txn.payment_purpose]
                          .filter(Boolean).join(' · ')}
                      </Typography>
                    )}

                    {a.note && (
                      <Typography sx={{ fontSize: 11.5, color: '#6B7280', fontStyle: 'italic', mt: 0.25 }}>
                        {a.note}
                      </Typography>
                    )}

                    {isBank && reasons.length > 0 && (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                        {reasons.map(([k]) => (
                          <Typography key={k} sx={{
                            fontSize: 11, color: '#6B7280', backgroundColor: '#F3F4F6',
                            borderRadius: 1, px: 0.75, py: 0.15,
                          }}>
                            <span style={{ color: '#22C55E', marginRight: 3 }}>✓</span>
                            {REASON_LABELS[k] || k}
                          </Typography>
                        ))}
                      </Box>
                    )}

                    {/* DK */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.75, flexWrap: 'wrap' }}>
                      {a.journal_entry_id ? (
                        <>
                          <ReceiptLongIcon sx={{ fontSize: 15, color: '#D1D5DB' }} />
                          <Typography sx={{ fontSize: 11.5, color: '#6B7280' }}>
                            DK #{a.journal_entry_id}
                            {a.payment_account ? ` · ${a.payment_account}` : ''}
                          </Typography>
                        </>
                      ) : editingId === a.id ? (
                        <>
                          <TextField
                            select size="small" value={accountDraft}
                            onChange={(e) => setAccountDraft(e.target.value)}
                            sx={{ minWidth: 200 }}
                            SelectProps={{ MenuProps: { disableScrollLock: true } }}
                          >
                            {accounts.map((acc) => (
                              <MenuItem key={acc.key} value={acc.account}>
                                {`${acc.account} · ${acc.label || acc.bank || acc.iban || acc.key}`}
                              </MenuItem>
                            ))}
                            <MenuItem value="2721">2721 · Kasa</MenuItem>
                            <MenuItem value={CUSTOM}>Kita sąskaita…</MenuItem>
                          </TextField>
                          {accountDraft === CUSTOM && (
                            <TextField
                              size="small" autoFocus placeholder="pvz. 2712"
                              value={customDraft} sx={{ width: 120 }}
                              onChange={(e) => setCustomDraft(e.target.value.replace(/[^\d]/g, '').slice(0, 10))}
                            />
                          )}
                          <Button size="small" disabled={busy || !effectiveAccount}
                            onClick={() => handleSaveAccount(a.id)}>
                            Išsaugoti
                          </Button>
                          <Button size="small" disabled={busy} onClick={() => setEditingId(null)}>
                            Atšaukti
                          </Button>
                        </>
                      ) : (
                        <>
                          <WarningAmberIcon sx={{ fontSize: 15, color: '#D97706' }} />
                          <Typography sx={{ fontSize: 11.5, color: '#D97706' }}>
                            DK įrašo nėra — nenurodyta pinigų sąskaita
                          </Typography>
                          <Button size="small" sx={{ fontSize: 12 }}
                            onClick={() => { setEditingId(a.id); setAccountDraft(''); setCustomDraft(''); }}>
                            Nurodyti
                          </Button>
                        </>
                      )}
                    </Box>

                    {isProposed && !isLoading && (
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.75, mt: 1 }}>
                        <Button size="small" startIcon={<CancelIcon sx={{ fontSize: 15 }} />}
                          onClick={() => withAction(a.id, onRejectAllocation)}
                          sx={{ fontSize: 12, color: '#6B7280', textTransform: 'none', fontWeight: 600 }}>
                          Atmesti
                        </Button>
                        <Button size="small" variant="contained" disableElevation
                          startIcon={<CheckCircleIcon sx={{ fontSize: 15 }} />}
                          onClick={() => withAction(a.id, onConfirmAllocation)}
                          sx={{
                            fontSize: 12, textTransform: 'none', fontWeight: 600,
                            backgroundColor: '#16A34A', borderRadius: 2,
                            '&:hover': { backgroundColor: '#15803D' },
                          }}>
                          Patvirtinti
                        </Button>
                      </Box>
                    )}
                  </Box>
                );
              })
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PaymentsDialog;