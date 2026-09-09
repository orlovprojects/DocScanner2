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
  Collapse,
  Divider,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DateField from './DateField';
import { invoicingApi } from '../api/invoicingApi';

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

const MarkPaidDialog = ({ open, onClose, invoice, purchase, onConfirm }) => {
  // Dialogas naudojamas ir pardavimams, ir pirkimams.
  const doc = invoice || purchase;
  const isPurchase = !invoice && !!purchase;

  const [loading, setLoading] = useState(false);
  const [paymentDate, setPaymentDate] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [paymentAccount, setPaymentAccount] = useState('');
  const [customAccount, setCustomAccount] = useState('');
  const [amountEur, setAmountEur] = useState('');
  const [lbRate, setLbRate] = useState(null);
  const [showExtra, setShowExtra] = useState(false);

  const docCurrency = (doc?.currency || 'EUR').toUpperCase();
  const isForeign = docCurrency !== 'EUR';

  // „Kita sąskaita…" — imam ranka įvestą kodą.
  const effectiveAccount =
    paymentAccount === '__other__' ? customAccount.trim() : paymentAccount;

  const isCredit = !!doc?.is_credit_invoice;

  // Kreditinių sumos saugomos neigiamos — dialoge rodom moduliu.
  const invoiceTotal = useMemo(() => {
    if (!doc) return 0;
    return Math.abs(parseFloat(doc.amount_with_vat || 0));
  }, [doc]);

  const paidAlready = useMemo(() => {
    if (!doc) return 0;
    return Math.abs(parseFloat(doc.paid_amount || 0));
  }, [doc]);

  // Užkrauti banko sąskaitas
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    invoicingApi.getBankAccounts()
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

  // Kursas LB pagal mokėjimo datą (jei užsienio valiuta)
  useEffect(() => {
    if (!open || !isForeign || !paymentDate) return;
    let cancelled = false;
    invoicingApi.getCurrencyRate(docCurrency, paymentDate)
      .then((r) => {
        if (cancelled) return;
        const rate = parseFloat(r.data?.rate) || null;
        setLbRate(rate);
      })
      .catch(() => { if (!cancelled) setLbRate(null); });
    return () => { cancelled = true; };
  }, [open, isForeign, docCurrency, paymentDate]);

  // Kai keičiasi suma ar kursas — pasiūlom EUR pagal LB.
  useEffect(() => {
    if (!isForeign || !lbRate) return;
    const val = parseAmount(amount);
    if (val > 0) setAmountEur(fmtNum(val / lbRate));
  }, [amount, lbRate, isForeign]);

  const remaining = useMemo(() => {
    return Math.max(invoiceTotal - paidAlready, 0);
  }, [invoiceTotal, paidAlready]);

  useEffect(() => {
    if (open && doc) {
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setAmount(fmtNum(remaining));
      setNote('');
      setPaymentAccount('');
      setCustomAccount('');
      setAmountEur('');
      setLbRate(null);
      setShowExtra(false);
      setLoading(false);
    }
  }, [open, doc, remaining]);

  const parsedAmount = parseAmount(amount);
  const parsedEur = isForeign ? parseAmount(amountEur) : parsedAmount;

  // Skola registruota dokumento kursu — su juo lyginam realiai gautus EUR.
  const docRate = parseFloat(doc?.doc_rate) || lbRate;
  const debtEur = isForeign && docRate ? parsedAmount / docRate : parsedAmount;
  const fxDiff = isForeign ? parsedEur - debtEur : 0;

  // LB kursas tik orientyras — bankas visada duoda kitokį. Tikrinam tik grubias klaidas.
  const lbEur = isForeign && lbRate ? parsedAmount / lbRate : 0;
  const eurDeviation = lbEur > 0 ? Math.abs(parsedEur - lbEur) / lbEur : 0;

  const isPartial = parsedAmount > 0 && parsedAmount < remaining - 0.01;
  const isOverpay = parsedAmount > remaining + 0.05;
  const isValid =
    parsedAmount > 0 && paymentDate && !isOverpay &&
    (!isForeign || parsedEur > 0);

  const handleConfirm = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      await onConfirm({
        amount: parsedAmount.toFixed(2),
        payment_date: paymentDate,
        note: note.trim(),
        payment_account: effectiveAccount,
        amount_eur: isForeign ? parsedEur.toFixed(2) : undefined,
      });
      onClose();
    } catch {
      // error handled by parent
    } finally {
      setLoading(false);
    }
  };

  if (!doc) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth disableScrollLock>
      <DialogTitle sx={{ pb: 1 }}>Pažymėti kaip apmokėtą</DialogTitle>

      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {doc.full_number || `${doc.document_series || ''}${doc.document_number || ''}` || 'Dokumentas'}
          {' '}· Suma: {fmtNum(invoiceTotal)} {docCurrency}
          {remaining !== invoiceTotal && (
            <Typography component="span" variant="body2" color="text.secondary">
              {' '}· liko {fmtNum(remaining)} {docCurrency}
            </Typography>
          )}
          {paidAlready > 0 && (
            <Typography component="span" variant="body2" color="text.secondary">
              {' '}(jau apmokėta: {fmtNum(paidAlready)} {docCurrency})
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
                endAdornment: <InputAdornment position="end">{docCurrency}</InputAdornment>,
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
                  Visa suma: {fmtNum(remaining)} {docCurrency}
                </Button>
              </Box>
            )}

            {isOverpay && (
              <Alert severity="warning" sx={{ mt: 1, py: 0.25, fontSize: 13 }}>
                Suma viršija likutį ({fmtNum(remaining)} {docCurrency})
              </Alert>
            )}
          </Box>

          {isForeign && (
            <Box>
              <TextField
                fullWidth
                size="small"
                label="Realiai gauta / sumokėta"
                value={amountEur}
                onChange={(e) => setAmountEur(normalizeAmountInput(e.target.value))}
                onBlur={() => setAmountEur(amountEur ? fmtNum(parseAmount(amountEur)) : '')}
                helperText={
                  lbRate
                    ? `LB kursas ${lbRate.toFixed(4)} → ${fmtNum(lbEur)} €. Įrašykite sumą iš banko išrašo.`
                    : 'Įrašykite sumą, kuri realiai atėjo į banką.'
                }
                InputProps={{
                  endAdornment: <InputAdornment position="end">€</InputAdornment>,
                  inputProps: { inputMode: 'decimal' },
                }}
              />

              {parsedEur > 0 && Math.abs(fxDiff) >= 0.01 && (
                <Alert
                  severity={eurDeviation > 0.15 ? 'warning' : 'info'}
                  sx={{ mt: 1, py: 0.25, fontSize: 13 }}
                >
                  Kursų skirtumas: {fxDiff > 0 ? '+' : '−'}{fmtNum(Math.abs(fxDiff))} €
                  {fxDiff > 0 ? ' (pajamos, 5803)' : ' (sąnaudos, 6803)'}
                  {eurDeviation > 0.15 && (
                    <> · Skirtumas didelis — ar tai nėra dalinis mokėjimas? Patikrinkite sumą {docCurrency}.</>
                  )}
                </Alert>
              )}
            </Box>
          )}

          <Divider sx={{ mt: 0.5 }} />

          <Box
            onClick={() => setShowExtra((v) => !v)}
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.5,
              cursor: 'pointer', color: 'text.secondary',
              userSelect: 'none', mt: -0.5,
            }}
          >
            <ExpandMoreIcon
              sx={{
                fontSize: 18,
                transform: showExtra ? 'rotate(180deg)' : 'none',
                transition: 'transform .2s',
              }}
            />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              Papildomai (neprivaloma)
            </Typography>
            {!showExtra && effectiveAccount && (
              <Typography variant="caption" sx={{ ml: 0.5 }}>
                · {effectiveAccount}
              </Typography>
            )}
          </Box>

          <Collapse in={showExtra} unmountOnExit>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}>
              <TextField
                select
                fullWidth
                size="small"
                label={
                  isPurchase
                    ? (isCredit ? 'Kur gauta grąža' : 'Iš kur sumokėta')
                    : (isCredit ? 'Iš kur grąžinta' : 'Iš kur sumokėta')
                }
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
          </Collapse>
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