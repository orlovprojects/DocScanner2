import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Alert,
  InputAdornment,
  CircularProgress,
  MenuItem,
} from '@mui/material';
import DateField from './DateField';
import { api } from '../api/endpoints';

const fmtNum = (n) => (Number(n) || 0).toFixed(2).replace('.', ',');

// Vartotojas gali vesti ir tašką, ir kablelį — rodom visada kablelį.
const normalizeAmountInput = (raw) => {
  let s = String(raw).replace(/[^\d.,]/g, '').replace(/\./g, ',');
  const first = s.indexOf(',');
  if (first !== -1) {
    s = s.slice(0, first + 1) + s.slice(first + 1).replace(/,/g, '');
  }
  const [int, dec] = s.split(',');
  if (dec !== undefined) s = `${int},${dec.slice(0, 2)}`;
  return s;
};

const parseAmount = (raw) => parseFloat(String(raw).replace(',', '.')) || 0;

const MarkPaidDialog = ({ open, onClose, invoice, onConfirm }) => {
  const [loading, setLoading] = useState(false);
  const [paymentDate, setPaymentDate] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [paymentAccount, setPaymentAccount] = useState('');
  const [customAccount, setCustomAccount] = useState('');

  // „Kita sąskaita…" — imam ranka įvestą kodą.
  const effectiveAccount =
    paymentAccount === '__other__' ? customAccount.trim() : paymentAccount;

  const isCredit = !!invoice?.is_credit_invoice;

  // Kreditinių sumos saugomos neigiamos — dialoge rodom moduliu.
  const invoiceTotal = useMemo(() => {
    if (!invoice) return 0;
    return Math.abs(parseFloat(invoice.amount_with_vat || 0));
  }, [invoice]);

  const paidAlready = useMemo(() => {
    if (!invoice) return 0;
    return Math.abs(parseFloat(invoice.paid_amount || 0));
  }, [invoice]);

  // Užkrauti banko sąskaitas
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api.get('invoicing/bank-accounts/')
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r.data) ? r.data : [];
        setAccounts(list);
        // Vienintelė sąskaita — parenkam iš karto.
        if (list.length === 1) setPaymentAccount(list[0].account || '');
      })
      .catch(() => { if (!cancelled) setAccounts([]); });
    return () => { cancelled = true; };
  }, [open]);

  const remaining = useMemo(() => {
    return Math.max(invoiceTotal - paidAlready, 0);
  }, [invoiceTotal, paidAlready]);

  useEffect(() => {
    if (open && invoice) {
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setAmount(fmtNum(remaining));
      setNote('');
      setPaymentAccount('');
      setCustomAccount('');
      setLoading(false);
    }
  }, [open, invoice, remaining]);

  const parsedAmount = parseAmount(amount);
  const isPartial = parsedAmount > 0 && parsedAmount < remaining - 0.01;
  const isOverpay = parsedAmount > remaining + 0.05;
  const isValid = parsedAmount > 0 && paymentDate && !isOverpay;

  const handleConfirm = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      await onConfirm({
        amount: parsedAmount.toFixed(2),
        payment_date: paymentDate,
        note: note.trim(),
        payment_account: effectiveAccount,
      });
      onClose();
    } catch {
      // error handled by parent
    } finally {
      setLoading(false);
    }
  };

  if (!invoice) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth disableScrollLock>
      <DialogTitle sx={{ pb: 1 }}>Pažymėti kaip apmokėtą</DialogTitle>

      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {invoice.full_number || 'Sąskaita'} · Suma: {fmtNum(invoiceTotal)} €
          {remaining !== invoiceTotal && (
            <Typography component="span" variant="body2" color="text.secondary">
              {' '}· liko {fmtNum(remaining)} €
            </Typography>
          )}
          {paidAlready > 0 && (
            <Typography component="span" variant="body2" color="text.secondary">
              {' '}(jau apmokėta: {fmtNum(paidAlready)} €)
            </Typography>
          )}
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <DateField
            label="Mokėjimo data"
            value={paymentDate}
            onChange={setPaymentDate}
            size="small"
          />

          <Box>
            <TextField
              fullWidth
              size="small"
              label="Suma"
              value={amount}
              onChange={(e) => setAmount(normalizeAmountInput(e.target.value))}
              onBlur={() => setAmount(amount ? fmtNum(parseAmount(amount)) : '')}
              InputProps={{
                endAdornment: <InputAdornment position="end">€</InputAdornment>,
                inputProps: { inputMode: 'decimal' },
              }}
            />

            {isPartial && (
              <Box sx={{ mt: 1 }}>
                <Alert severity="info" sx={{ py: 0.25, fontSize: 13 }}>
                  Dalinė suma — sąskaita bus pažymėta kaip <strong>dalinai apmokėta</strong>
                </Alert>
                <Button
                  size="small"
                  onClick={() => setAmount(fmtNum(remaining))}
                  sx={{ mt: 0.5, fontSize: 12 }}
                >
                  Visa suma: {fmtNum(remaining)} €
                </Button>
              </Box>
            )}

            {isOverpay && (
              <Alert severity="warning" sx={{ mt: 1, py: 0.25, fontSize: 13 }}>
                Suma viršija likutį ({fmtNum(remaining)} €)
              </Alert>
            )}
          </Box>

          <TextField
            select
            fullWidth
            size="small"
            label={isCredit ? 'Iš kur grąžinta' : 'Iš kur sumokėta'}
            value={paymentAccount}
            onChange={(e) => setPaymentAccount(e.target.value)}
            helperText={
              effectiveAccount
                ? ' '
                : 'Nenurodžius — DK įrašas nebus sukurtas, nurodysite vėliau'
            }
            SelectProps={{ MenuProps: { disableScrollLock: true } }}
          >
            <MenuItem value="">
              <em>Nenurodyta</em>
            </MenuItem>
            {accounts.map((a) => (
              <MenuItem key={a.key} value={a.account}>
                {`${a.account} · ${a.label || a.bank || a.iban || a.key}`}
                {a.currency && a.currency !== 'EUR' ? ` (${a.currency})` : ''}
              </MenuItem>
            ))}
            <MenuItem value="2721">2721 · Kasa</MenuItem>
            <MenuItem value="__other__">Kita sąskaita…</MenuItem>
          </TextField>

          {paymentAccount === '__other__' && (
            <TextField
              fullWidth
              size="small"
              autoFocus
              label="Korespondencinė sąskaita"
              value={customAccount}
              onChange={(e) => setCustomAccount(e.target.value.replace(/[^\d]/g, '').slice(0, 10))}
              placeholder="pvz. 2712"
              InputProps={{ inputProps: { inputMode: 'numeric' } }}
            />
          )}

          <TextField
            fullWidth
            size="small"
            label="Pastaba (neprivaloma)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            minRows={1}
            maxRows={3}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>Atšaukti</Button>
        <Button
          variant="contained"
          color="success"
          onClick={handleConfirm}
          disabled={!isValid || loading}
          startIcon={loading ? <CircularProgress size={16} /> : null}
        >
          Patvirtinti
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MarkPaidDialog;