import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Button, TextField, MenuItem, IconButton, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, Grid2, Stack,
  Switch, FormControlLabel, Snackbar, Alert, CircularProgress, Tooltip,
  InputAdornment, useTheme, useMediaQuery,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  ArrowBack as BackIcon, Star as StarIcon, StarBorder as StarBorderIcon,
  Warning as WarningIcon, CheckCircle as CheckIcon,
} from '@mui/icons-material';
import { invoicingApi } from '../api/invoicingApi';
import { api } from '../api/endpoints';

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════

const P = { primary: '#1976d2', accent: '#dc004e', bg: '#fafafa', border: '#e0e0e0' };

const TYPE_LABELS = {
  isankstine: 'Išankstinė SF',
  pvm_saskaita: 'PVM SF',
  saskaita: 'SF',
  kreditine: 'Kreditinė SF',
};

const TYPE_COLORS = {
  isankstine: '#ed6c02',
  pvm_saskaita: '#1976d2',
  saskaita: '#2e7d32',
  kreditine: '#9c27b0',
};

const EMPTY_FORM = {
  invoice_type: 'pvm_saskaita',
  prefix: '',
  next_number: 1,
  padding: 3,
  is_default: false,
};

// ═══════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════

const InvoiceSeriesPage = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [loading, setLoading] = useState(true);
  const [series, setSeries] = useState([]);
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });

  // Dialog
  const [dialog, setDialog] = useState({ open: false, mode: 'add', id: null });
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Number validation
  const [numberCheck, setNumberCheck] = useState({ checking: false, exists: false, invoiceId: null });

  // Delete confirm
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null, prefix: '' });

  const showMsg = (msg, sev = 'success') => setSnack({ open: true, msg, severity: sev });

  // ── Load ──
  const loadSeries = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await invoicingApi.getSeries();
      setSeries(data || []);
    } catch {
      showMsg('Nepavyko įkelti serijų', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSeries(); }, [loadSeries]);

  // ── Number check (debounced) ──
  useEffect(() => {
    if (!form.prefix || !form.next_number) {
      setNumberCheck({ checking: false, exists: false, invoiceId: null });
      return;
    }
    const formatted = String(form.next_number).padStart(form.padding || 3, '0');
    const t = setTimeout(async () => {
      setNumberCheck((p) => ({ ...p, checking: true }));
      try {
        const { data } = await api.get('/invoicing/series/check-number/', {
          params: { prefix: form.prefix, number: formatted },
          withCredentials: true,
        });
        setNumberCheck({ checking: false, exists: data.exists, invoiceId: data.invoice_id });
      } catch {
        setNumberCheck({ checking: false, exists: false, invoiceId: null });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [form.prefix, form.next_number, form.padding]);

  // ── Form helpers ──
  const u = (f, v) => setForm((p) => ({ ...p, [f]: v }));

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setNumberCheck({ checking: false, exists: false, invoiceId: null });
    setDialog({ open: true, mode: 'add', id: null });
  };

  const openEdit = (s) => {
    setForm({
      invoice_type: s.invoice_type,
      prefix: s.prefix,
      next_number: s.next_number,
      padding: s.padding,
      is_default: s.is_default,
    });
    setNumberCheck({ checking: false, exists: false, invoiceId: null });
    setDialog({ open: true, mode: 'edit', id: s.id });
  };

  // ── Save ──
  const handleSave = async () => {
    if (!form.prefix.trim()) {
      showMsg('Įveskite serijos prefiksą', 'error');
      return;
    }
    if (numberCheck.exists) {
      showMsg('Šis numeris jau egzistuoja', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        invoice_type: form.invoice_type,
        prefix: form.prefix.trim().toUpperCase(),
        next_number: parseInt(form.next_number) || 1,
        padding: parseInt(form.padding) || 3,
        is_default: form.is_default,
      };

      if (dialog.mode === 'add') {
        await invoicingApi.createSeries(payload);
        showMsg('Serija sukurta');
      } else {
        await invoicingApi.updateSeries(dialog.id, payload);
        showMsg('Serija atnaujinta');
      }
      setDialog({ open: false, mode: 'add', id: null });
      loadSeries();
    } catch (e) {
      const detail = e.response?.data?.detail;
      showMsg(detail || 'Klaida', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle default ──
  const toggleDefault = async (s) => {
    try {
      await invoicingApi.updateSeries(s.id, { is_default: !s.is_default });
      loadSeries();
    } catch {
      showMsg('Klaida', 'error');
    }
  };

  // ── Delete ──
  const handleDelete = async () => {
    try {
      await invoicingApi.deleteSeries(deleteDialog.id);
      showMsg('Serija pašalinta');
      setDeleteDialog({ open: false, id: null, prefix: '' });
      loadSeries();
    } catch {
      showMsg('Klaida šalinant', 'error');
    }
  };

  // ── Preview ──
  const getPreview = () => {
    if (!form.prefix) return '—';
    const num = String(form.next_number || 1).padStart(form.padding || 3, '0');
    return `${form.prefix.toUpperCase()}-${num}`;
  };

  // ── Group by type ──
  const grouped = {};
  Object.keys(TYPE_LABELS).forEach((t) => { grouped[t] = []; });
  series.forEach((s) => {
    if (grouped[s.invoice_type]) grouped[s.invoice_type].push(s);
  });

  // ═══════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000, mx: 'auto' }}>
      <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 4 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton onClick={() => navigate('/israsymas/nustatymai')} size="small"><BackIcon /></IconButton>
            <Typography variant="h1" sx={{ color: P.primary, fontWeight: 500, fontSize: 22 }}>
              Serijos ir numeracijos
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
            Nauja serija
          </Button>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : series.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
            <Typography variant="h6" gutterBottom>Nėra sukurtų serijų</Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Sukurkite pirmą seriją, kad galėtumėte išrašyti sąskaitas.
            </Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>Sukurti seriją</Button>
          </Box>
        ) : (
          /* Grouped tables */
          Object.entries(grouped).map(([type, items]) => {
            if (!items.length) return null;
            return (
              <Box key={type} sx={{ mb: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Box sx={{ width: 4, height: 24, borderRadius: 2, backgroundColor: TYPE_COLORS[type] }} />
                  <Typography sx={{ fontWeight: 700, fontSize: 16, color: TYPE_COLORS[type] }}>
                    {TYPE_LABELS[type]}
                  </Typography>
                  <Chip label={`${items.length}`} size="small" sx={{ fontSize: 11, height: 20 }} />
                </Box>

                {!isMobile ? (
                  <TableContainer sx={{ borderRadius: 2, border: `1px solid ${P.border}` }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, py: 1.2, backgroundColor: P.bg } }}>
                          <TableCell>Serija</TableCell>
                          <TableCell>Sekantis numeris</TableCell>
                          <TableCell>Peržiūra</TableCell>
                          <TableCell>Numerio ilgis</TableCell>
                          <TableCell align="center">Numatytoji</TableCell>
                          <TableCell align="right">Veiksmai</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {items.map((s) => (
                          <TableRow key={s.id} hover sx={{
                            '& td': { borderBottom: `1px solid ${P.border}` },
                            ...(s.is_default ? { backgroundColor: '#e3f2fd' } : {}),
                          }}>
                            <TableCell>
                              <Typography fontWeight={700} fontSize={15}>{s.prefix}</Typography>
                            </TableCell>
                            <TableCell>{s.next_number}</TableCell>
                            <TableCell>
                              <Chip label={s.preview} size="small" variant="outlined"
                                sx={{ fontWeight: 600, fontFamily: 'monospace', letterSpacing: 0.5 }} />
                            </TableCell>
                            <TableCell>{s.padding} skaitmenys</TableCell>
                            <TableCell align="center">
                              <IconButton size="small" onClick={() => toggleDefault(s)}
                                sx={{ color: s.is_default ? '#f9a825' : '#bdbdbd' }}>
                                {s.is_default ? <StarIcon /> : <StarBorderIcon />}
                              </IconButton>
                            </TableCell>
                            <TableCell align="right">
                              <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                <IconButton size="small" onClick={() => openEdit(s)}><EditIcon fontSize="small" /></IconButton>
                                <IconButton size="small" color="error"
                                  onClick={() => setDeleteDialog({ open: true, id: s.id, prefix: s.prefix })}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  /* Mobile cards */
                  <Stack spacing={1}>
                    {items.map((s) => (
                      <Paper key={s.id} variant="outlined" sx={{
                        p: 2, borderRadius: 2,
                        ...(s.is_default ? { backgroundColor: '#e3f2fd', borderColor: P.primary } : {}),
                      }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography fontWeight={700} fontSize={18}>{s.prefix}</Typography>
                            {s.is_default && <Chip label="Numatytoji" size="small" color="primary" sx={{ fontSize: 10, height: 20 }} />}
                          </Box>
                          <Stack direction="row" spacing={0.5}>
                            <IconButton size="small" onClick={() => toggleDefault(s)}
                              sx={{ color: s.is_default ? '#f9a825' : '#bdbdbd' }}>
                              {s.is_default ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
                            </IconButton>
                            <IconButton size="small" onClick={() => openEdit(s)}><EditIcon fontSize="small" /></IconButton>
                            <IconButton size="small" color="error"
                              onClick={() => setDeleteDialog({ open: true, id: s.id, prefix: s.prefix })}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 2 }}>
                          <Typography variant="body2" color="text.secondary">Kitas: <strong>{s.next_number}</strong></Typography>
                          <Typography variant="body2" color="text.secondary">
                            Peržiūra: <Chip label={s.preview} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: 11 }} />
                          </Typography>
                        </Box>
                      </Paper>
                    ))}
                  </Stack>
                )}
              </Box>
            );
          })
        )}
      </Paper>

      {/* ─── Add/Edit Dialog ─── */}
      <Dialog open={dialog.open} onClose={() => setDialog({ open: false, mode: 'add', id: null })} maxWidth="sm" fullWidth>
        <DialogTitle>{dialog.mode === 'add' ? 'Nauja serija' : 'Redaguoti seriją'}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Type (only for new) */}
            <TextField fullWidth select label="Dokumento tipas" value={form.invoice_type}
              onChange={(e) => u('invoice_type', e.target.value)}
              disabled={dialog.mode === 'edit'}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <MenuItem key={k} value={k}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: TYPE_COLORS[k] }} />
                    {v}
                  </Box>
                </MenuItem>
              ))}
            </TextField>

            {/* Prefix */}
            <TextField fullWidth label="Serijos prefiksas" value={form.prefix}
              onChange={(e) => u('prefix', e.target.value.toUpperCase())}
              placeholder="Pvz. AA, BB, ISF"
              helperText="Unikalus prefiksas. Bus rodomas prieš numerį."
              inputProps={{ style: { fontWeight: 700, letterSpacing: 1, fontFamily: 'monospace' } }} />

            {/* Next number + Padding */}
            <Grid2 container spacing={2}>
              <Grid2 size={{ xs: 6 }}>
                <TextField fullWidth label="Sekantis numeris" type="number" value={form.next_number}
                  onChange={(e) => u('next_number', Math.max(1, parseInt(e.target.value) || 1))}
                  inputProps={{ min: 1 }}
                  InputProps={{
                    endAdornment: numberCheck.checking ? (
                      <InputAdornment position="end"><CircularProgress size={16} /></InputAdornment>
                    ) : numberCheck.exists ? (
                      <InputAdornment position="end">
                        <Tooltip title={`Numeris jau naudojamas (ID: ${numberCheck.invoiceId})`}>
                          <WarningIcon color="error" fontSize="small" />
                        </Tooltip>
                      </InputAdornment>
                    ) : form.prefix && form.next_number ? (
                      <InputAdornment position="end"><CheckIcon color="success" fontSize="small" /></InputAdornment>
                    ) : null,
                  }}
                  error={numberCheck.exists}
                  helperText={numberCheck.exists ? 'Šis numeris jau užimtas!' : 'Sekantis naudojamas numeris'} />
              </Grid2>
              <Grid2 size={{ xs: 6 }}>
                <TextField fullWidth select label="Skaitmenų skaičius" value={form.padding}
                  onChange={(e) => u('padding', parseInt(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <MenuItem key={n} value={n}>{n} → {'1'.padStart(n, '0')}</MenuItem>
                  ))}
                </TextField>
              </Grid2>
            </Grid2>

            {/* Preview */}
            <Box sx={{
              p: 2, borderRadius: 2, textAlign: 'center',
              background: 'linear-gradient(135deg, #e3f2fd, #f3e5f5)',
              border: `1px solid ${P.border}`,
            }}>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                Kito dokumento numeris:
              </Typography>
              <Typography sx={{ fontWeight: 800, fontSize: 28, fontFamily: 'monospace', letterSpacing: 2, color: P.primary }}>
                {getPreview()}
              </Typography>
            </Box>

            {/* Default toggle */}
            <FormControlLabel
              control={<Switch checked={form.is_default} onChange={(e) => u('is_default', e.target.checked)} />}
              label="Numatytoji serija šiam dokumento tipui" />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialog({ open: false, mode: 'add', id: null })}>Atšaukti</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving || numberCheck.exists}>
            {saving ? <CircularProgress size={20} /> : (dialog.mode === 'add' ? 'Sukurti' : 'Išsaugoti')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Delete Dialog ─── */}
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, id: null, prefix: '' })}>
        <DialogTitle>Pašalinti seriją?</DialogTitle>
        <DialogContent>
          <Typography>
            Ar tikrai norite pašalinti seriją <strong>{deleteDialog.prefix}</strong>?
            Jau išrašytos sąskaitos su šia serija nebus paveiktos.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, id: null, prefix: '' })}>Atšaukti</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Pašalinti</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snack.open} autoHideDuration={3000} onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.severity} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default InvoiceSeriesPage;