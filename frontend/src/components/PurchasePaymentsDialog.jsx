import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, Alert, Chip, Divider,
  CircularProgress, TextField, MenuItem, IconButton, Tooltip,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { api } from '../api/endpoints';
import { invoicingApi } from '../api/invoicingApi';

const fmtNum = (n) => (Number(n) || 0).toFixed(2).replace('.', ',');
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('lt-LT') : '—');

const PurchasePaymentsDialog = ({ open, onClose, purchaseId, onChanged }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [accountDraft, setAccountDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!purchaseId) return;
    setLoading(true);
    try {
      const { data: d } = await api.get(`/purchases/${purchaseId}/payments/`, {
        withCredentials: true,
      });
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [purchaseId]);

  useEffect(() => {
    if (!open) return;
    load();
    invoicingApi.getBankAccounts()
      .then((r) => setAccounts(Array.isArray(r.data) ? r.data : []))
      .catch(() => setAccounts([]));
  }, [open, load]);

  const handleSaveAccount = async (allocId) => {
    if (!accountDraft) return;
    setBusy(true);
    try {
      await api.post(
        `/payments/${allocId}/set-account/`,
        { payment_account: accountDraft },
        { withCredentials: true },
      );
      setEditingId(null);
      setAccountDraft('');
      await load();
      onChanged?.();
    } catch (e) {
      alert(e?.response?.data?.detail || 'Nepavyko išsaugoti');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (allocId) => {
    if (!window.confirm('Pašalinti šį mokėjimą? DK įrašas taip pat bus ištrintas.')) return;
    setBusy(true);
    try {
      await api.post(
        `/purchases/${purchaseId}/remove-payment/${allocId}/`,
        {},
        { withCredentials: true },
      );
      await load();
      onChanged?.();
    } catch (e) {
      alert(e?.response?.data?.detail || 'Nepavyko pašalinti');
    } finally {
      setBusy(false);
    }
  };

  const cur = data?.currency || 'EUR';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth disableScrollLock>
      <DialogTitle sx={{ pb: 1 }}>
        Mokėjimai
        {data?.document_number && (
          <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
            {data.document_number}
          </Typography>
        )}
      </DialogTitle>

      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : !data ? (
          <Alert severity="error">Nepavyko gauti duomenų</Alert>
        ) : (
          <>
            <Box sx={{ display: 'flex', gap: 3, mb: 2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">Suma</Typography>
                <Typography sx={{ fontWeight: 600 }}>{fmtNum(data.total)} {cur}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Apmokėta</Typography>
                <Typography sx={{ fontWeight: 600, color: 'success.main' }}>
                  {fmtNum(data.paid_amount)} {cur}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Liko</Typography>
                <Typography sx={{ fontWeight: 600 }}>{fmtNum(data.remaining)} {cur}</Typography>
              </Box>
            </Box>

            <Divider sx={{ mb: 1.5 }} />

            {data.allocations.length === 0 && (
              <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                Mokėjimų dar nėra
              </Typography>
            )}

            {data.allocations.map((a) => (
              <Box
                key={a.id}
                sx={{
                  border: '1px solid', borderColor: 'divider',
                  borderRadius: 2, p: 1.5, mb: 1.5,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography sx={{ fontWeight: 600 }}>
                    {fmtNum(a.amount)} {cur}
                  </Typography>
                  {a.amount_eur && Number(a.amount_eur) !== Number(a.amount) && (
                    <Typography variant="caption" color="text.secondary">
                      ({fmtNum(a.amount_eur)} €)
                    </Typography>
                  )}
                  <Chip
                    size="small"
                    label={a.is_manual ? 'Rankinis' : (a.source_display || 'Bankas')}
                    color={a.is_manual ? 'default' : 'info'}
                    variant="outlined"
                    sx={{ height: 20, fontSize: 11 }}
                  />
                  <Box sx={{ flex: 1 }} />
                  <Typography variant="caption" color="text.secondary">
                    {fmtDate(a.payment_date)}
                  </Typography>
                  {a.is_manual && (
                    <Tooltip title="Pašalinti mokėjimą">
                      <IconButton size="small" onClick={() => handleRemove(a.id)} disabled={busy}>
                        <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>

                {a.transaction && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {a.transaction.bank_name} · {a.transaction.counterparty_name}
                    {a.transaction.payment_purpose ? ` · ${a.transaction.payment_purpose}` : ''}
                  </Typography>
                )}

                {a.note && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {a.note}
                  </Typography>
                )}

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75 }}>
                  <ReceiptLongIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                  {a.journal_entry_id ? (
                    <Typography variant="caption" color="text.secondary">
                      DK #{a.journal_entry_id} · sąskaita {a.payment_account || '—'}
                    </Typography>
                  ) : editingId === a.id ? (
                    <>
                      <TextField
                        select size="small" value={accountDraft}
                        onChange={(e) => setAccountDraft(e.target.value)}
                        sx={{ minWidth: 220 }}
                        SelectProps={{ MenuProps: { disableScrollLock: true } }}
                      >
                        {accounts.map((acc) => (
                          <MenuItem key={acc.key} value={acc.account}>
                            {`${acc.account} · ${acc.label || acc.bank || acc.iban || acc.key}`}
                          </MenuItem>
                        ))}
                        <MenuItem value="2721">2721 · Kasa</MenuItem>
                      </TextField>
                      <Button size="small" onClick={() => handleSaveAccount(a.id)} disabled={busy || !accountDraft}>
                        Išsaugoti
                      </Button>
                      <Button size="small" onClick={() => setEditingId(null)} disabled={busy}>
                        Atšaukti
                      </Button>
                    </>
                  ) : (
                    <>
                      <Typography variant="caption" color="warning.main">
                        DK įrašo nėra — nenurodyta pinigų sąskaita
                      </Typography>
                      <Button
                        size="small"
                        onClick={() => { setEditingId(a.id); setAccountDraft(''); }}
                        sx={{ fontSize: 12 }}
                      >
                        Nurodyti
                      </Button>
                    </>
                  )}
                </Box>
              </Box>
            ))}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Uždaryti</Button>
      </DialogActions>
    </Dialog>
  );
};

export default PurchasePaymentsDialog;