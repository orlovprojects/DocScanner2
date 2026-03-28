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
} from '@mui/material';
import DateField from './DateField';

const MarkPaidDialog = ({ open, onClose, invoice, onConfirm }) => {
  const [loading, setLoading] = useState(false);
  const [paymentDate, setPaymentDate] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const invoiceTotal = useMemo(() => {
    if (!invoice) return 0;
    return parseFloat(invoice.amount_with_vat || 0);
  }, [invoice]);

  const paidAlready = useMemo(() => {
    if (!invoice) return 0;
    return parseFloat(invoice.paid_amount || 0);
  }, [invoice]);

  const remaining = useMemo(() => {
    return Math.max(invoiceTotal - paidAlready, 0);
  }, [invoiceTotal, paidAlready]);

  useEffect(() => {
    if (open && invoice) {
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setAmount(remaining.toFixed(2));
      setNote('');
      setLoading(false);
    }
  }, [open, invoice, remaining]);

  const parsedAmount = parseFloat(amount) || 0;
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
          {invoice.full_number || 'Sąskaita'} · Suma: {remaining.toFixed(2)} €
          {paidAlready > 0 && (
            <Typography component="span" variant="body2" color="text.secondary">
              {' '}(jau apmokėta: {paidAlready.toFixed(2)} €)
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
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              InputProps={{
                endAdornment: <InputAdornment position="end">€</InputAdornment>,
                inputProps: { min: 0, step: 0.01 },
              }}
            />

            {isPartial && (
              <Box sx={{ mt: 1 }}>
                <Alert severity="info" sx={{ py: 0.25, fontSize: 13 }}>
                  Dalinė suma — sąskaita bus pažymėta kaip <strong>dalinai apmokėta</strong>
                </Alert>
                <Button
                  size="small"
                  onClick={() => setAmount(remaining.toFixed(2))}
                  sx={{ mt: 0.5, fontSize: 12 }}
                >
                  Visa suma: {remaining.toFixed(2)} €
                </Button>
              </Box>
            )}

            {isOverpay && (
              <Alert severity="warning" sx={{ mt: 1, py: 0.25, fontSize: 13 }}>
                Suma viršija likutį ({remaining.toFixed(2)} €)
              </Alert>
            )}
          </Box>

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