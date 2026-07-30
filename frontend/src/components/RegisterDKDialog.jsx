import { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, IconButton, Chip, TextField,
  Paper, Divider, CircularProgress, Switch, FormControlLabel,
  Tooltip,
} from '@mui/material';
import {
  Close as CloseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { invoicingApi } from '../api/invoicingApi';

const fmt = (v, c = 'EUR') => v == null ? '—' : `${parseFloat(v).toFixed(2).replace('.', ',')} ${c === 'EUR' ? '€' : c}`;

let lineIdCounter = 0;
const nextLineId = () => `line_${++lineIdCounter}`;

const RegisterDKDialog = ({ open, onClose, txn, onSuccess, showSnack }) => {
  const show = showSnack || (() => {});

  // ── State ──
  const [templates, setTemplates] = useState([]);
  const [bankAccount, setBankAccount] = useState({ code: '2710', name: 'Bankas' });
  const [tplLoading, setTplLoading] = useState(false);

  const [selectedKey, setSelectedKey] = useState(null);
  const [lines, setLines] = useState([]);
  const [description, setDescription] = useState('');
  const [createRule, setCreateRule] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [applyToSimilar, setApplyToSimilar] = useState(false);

  const [saving, setSaving] = useState(false);

  // ── Load templates ──
  useEffect(() => {
    if (!open || !txn?.id) return;
    setSelectedKey(null);
    setLines([]);
    setDescription('');
    setCreateRule(false);
    setRuleName('');
    setApplyToSimilar(false);

    const loadTemplates = async () => {
      setTplLoading(true);
      try {
        const { data } = await invoicingApi.getDKTemplates(txn.id);
        setTemplates(data.templates || []);
        setBankAccount(data.bank_account || { code: '2710', name: 'Bankas' });
      } catch {
        setTemplates([]);
      }
      setTplLoading(false);
    };
    loadTemplates();
  }, [open, txn?.id]);

  // ── Select template ──
  const selectTemplate = (tpl) => {
    setSelectedKey(tpl.key);
    setLines(
      tpl.lines.map(l => ({
        _id: nextLineId(),
        side: l.side,
        account_code: l.account_code,
        account_name: l.account_name,
        amount: l.amount || '',
        editable: l.editable !== false,
      }))
    );

    // Description
    const cat = tpl.label || '';
    const name = txn?.counterparty_name || '';
    setDescription(name ? `${cat}: ${name}` : cat);
  };

  // ── Line editing ──
  const updateLine = (id, field, value) => {
    setLines(prev => prev.map(l => l._id === id ? { ...l, [field]: value } : l));
  };

  const addLine = () => {
    setLines(prev => [...prev, {
      _id: nextLineId(),
      side: 'debit',
      account_code: '',
      account_name: '',
      amount: '',
      editable: true,
    }]);
  };

  const removeLine = (id) => {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter(l => l._id !== id));
  };

  // ── D=K calculation ──
  const { totalDebit, totalCredit, isBalanced } = useMemo(() => {
    let d = 0, k = 0;
    for (const l of lines) {
      const a = parseFloat(l.amount) || 0;
      if (l.side === 'debit') d += a;
      else k += a;
    }
    return {
      totalDebit: d,
      totalCredit: k,
      isBalanced: Math.abs(d - k) < 0.01 && d > 0,
    };
  }, [lines]);

  // ── Can submit ──
  const canSubmit = isBalanced && lines.every(l => l.account_code.trim() && parseFloat(l.amount) > 0);

  // ── Submit ──
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);

    try {
      const tpl = templates.find(t => t.key === selectedKey);
      const { data } = await invoicingApi.registerDK(txn.id, {
        lines: lines.map(l => ({
          side: l.side,
          account_code: l.account_code,
          account_name: l.account_name,
          amount: l.amount,
        })),
        description,
        category: tpl?.category || '',
        create_rule: createRule,
        rule_name: ruleName,
        apply_to_similar: applyToSimilar,
      });
      show(data.applied_to_similar > 0
        ? `DK sukurtas (+${data.applied_to_similar})`
        : 'DK įrašas sukurtas'
      );
      onClose();
      onSuccess?.();
    } catch (e) {
      show(e.response?.data?.detail || 'Nepavyko sukurti DK', 'error');
    }
    setSaving(false);
  };

  // ══════════════════════════════════════════

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth disableScrollLock>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" fontWeight={700}>Sukurti DK įrašą</Typography>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent>
        {txn && (
          <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2, bgcolor: '#fafafa' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography fontSize={13} fontWeight={600}>{txn.counterparty_name || '—'}</Typography>
                {txn.counterparty_code && (
                  <Typography variant="caption" color="text.secondary">{txn.counterparty_code}</Typography>
                )}
              </Box>
              <Typography fontSize={16} fontWeight={700} color={txn.direction === 'incoming' ? 'success.main' : 'text.primary'}>
                {txn.direction === 'incoming' ? '+' : '-'}{fmt(txn.amount, txn.currency)}
              </Typography>
            </Box>
          </Paper>
        )}

        {/* ── Template selection ── */}
        {tplLoading ? (
          <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>
        ) : (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Pasirinkite šabloną:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {templates.map(tpl => (
                <Chip
                  key={tpl.key}
                  label={tpl.label}
                  variant={selectedKey === tpl.key ? 'filled' : 'outlined'}
                  color={selectedKey === tpl.key ? 'primary' : 'default'}
                  onClick={() => selectTemplate(tpl)}
                  sx={{ fontSize: 12, cursor: 'pointer' }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* ── DK lines table ── */}
        {selectedKey && (
          <>
            <Divider sx={{ my: 1.5 }} />

            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', mb: 1.5 }}>
              {/* Header */}
              <Box sx={{ display: 'flex', py: 0.75, px: 1.5, bgcolor: '#f5f5f5', borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography fontSize={12} fontWeight={700} sx={{ width: 50 }}>Pusė</Typography>
                <Typography fontSize={12} fontWeight={700} sx={{ flex: 1 }}>Sąskaita</Typography>
                <Typography fontSize={12} fontWeight={700} sx={{ width: 110, textAlign: 'right' }}>Suma</Typography>
                <Box sx={{ width: 32 }} />
              </Box>

              {/* Lines */}
              {lines.map(line => (
                <Box key={line._id} sx={{
                  display: 'flex', alignItems: 'center', py: 0.75, px: 1.5,
                  borderBottom: '1px solid', borderColor: 'divider',
                  '&:last-child': { borderBottom: 'none' },
                }}>
                  {/* Side toggle */}
                  <Box sx={{ width: 50 }}>
                    {line.editable ? (
                      <Chip
                        label={line.side === 'debit' ? 'D' : 'K'}
                        size="small"
                        color={line.side === 'debit' ? 'primary' : 'secondary'}
                        onClick={() => updateLine(line._id, 'side', line.side === 'debit' ? 'credit' : 'debit')}
                        sx={{ fontSize: 12, height: 24, cursor: 'pointer', fontWeight: 700 }}
                      />
                    ) : (
                      <Typography fontSize={13} fontWeight={700}>{line.side === 'debit' ? 'D' : 'K'}</Typography>
                    )}
                  </Box>

                  {/* Account */}
                  <Box sx={{ flex: 1, display: 'flex', gap: 0.5, alignItems: 'center' }}>
                    {line.editable ? (
                      <>
                        <TextField
                          size="small" variant="standard"
                          value={line.account_code}
                          onChange={e => updateLine(line._id, 'account_code', e.target.value)}
                          placeholder="Kodas"
                          sx={{ width: 70, '& input': { fontSize: 13, fontWeight: 700 } }}
                          InputProps={{ disableUnderline: false }}
                        />
                        <TextField
                          size="small" variant="standard"
                          value={line.account_name}
                          onChange={e => updateLine(line._id, 'account_name', e.target.value)}
                          placeholder="Pavadinimas"
                          sx={{ flex: 1, '& input': { fontSize: 13 } }}
                          InputProps={{ disableUnderline: false }}
                        />
                      </>
                    ) : (
                      <Typography fontSize={13}>
                        <strong>{line.account_code}</strong> {line.account_name}
                      </Typography>
                    )}
                  </Box>

                  {/* Amount */}
                  <Box sx={{ width: 110 }}>
                    <TextField
                      size="small" variant="standard"
                      value={line.amount}
                      onChange={e => updateLine(line._id, 'amount', e.target.value)}
                      placeholder="0,00"
                      type="number"
                      inputProps={{ step: '0.01', min: '0', style: { textAlign: 'right', fontSize: 13, fontWeight: 700 } }}
                      InputProps={{ disableUnderline: false }}
                      sx={{ width: '100%' }}
                    />
                  </Box>

                  {/* Delete */}
                  <Box sx={{ width: 32, display: 'flex', justifyContent: 'center' }}>
                    {lines.length > 2 && line.editable && (
                      <IconButton size="small" onClick={() => removeLine(line._id)}
                        sx={{ p: 0.25, color: '#bdbdbd', '&:hover': { color: '#d32f2f' } }}>
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    )}
                  </Box>
                </Box>
              ))}
            </Paper>

            {/* Add line + D=K */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Button size="small" startIcon={<AddIcon />} onClick={addLine} sx={{ fontSize: 12 }}>
                Pridėti eilutę
              </Button>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                {isBalanced ? (
                  <CheckIcon sx={{ fontSize: 18, color: '#2e7d32' }} />
                ) : (
                  <ErrorIcon sx={{ fontSize: 18, color: '#d32f2f' }} />
                )}
                <Typography fontSize={12} fontWeight={600} color={isBalanced ? '#2e7d32' : '#d32f2f'}>
                  D = K {isBalanced ? '✓' : '✗'} {totalDebit.toFixed(2)} / {totalCredit.toFixed(2)}
                </Typography>
              </Box>
            </Box>

            {/* Description */}
            <TextField
              fullWidth size="small" label="Aprašymas"
              value={description}
              onChange={e => setDescription(e.target.value)}
              sx={{ mb: 2 }}
            />

            {/* Options */}
            <FormControlLabel
              control={<Switch size="small" checked={applyToSimilar} onChange={e => setApplyToSimilar(e.target.checked)} />}
              label={<Typography variant="body2">Pritaikyti panašioms operacijoms</Typography>}
            />
            <FormControlLabel
              control={<Switch size="small" checked={createRule} onChange={e => setCreateRule(e.target.checked)} />}
              label={<Typography variant="body2">Sukurti taisyklę ateičiai</Typography>}
            />
            {createRule && (
              <TextField fullWidth size="small" label="Taisyklės pavadinimas"
                value={ruleName} onChange={e => setRuleName(e.target.value)}
                placeholder={txn?.counterparty_name || ''}
                sx={{ mt: 1 }}
              />
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Atšaukti</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving || !canSubmit}
        >
          {saving ? <CircularProgress size={20} /> : 'Registruoti'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RegisterDKDialog;