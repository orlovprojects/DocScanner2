import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Button, TextField, IconButton, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, Stack,
  Snackbar, Alert, CircularProgress, Tooltip, useTheme, useMediaQuery,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  ArrowBack as BackIcon, Star as StarIcon, StarBorder as StarBorderIcon,
  Straighten as UnitIcon,
} from '@mui/icons-material';
import { invoicingApi } from '../api/invoicingApi';

const P = { primary: '#1976d2', bg: '#fafafa', border: '#e0e0e0' };

const MeasurementUnitsPage = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState([]);
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });
  const [dialog, setDialog] = useState({ open: false, mode: 'add', id: null });
  const [form, setForm] = useState({ code: '', name: '' });
  const [saving, setSaving] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null, code: '' });

  const showMsg = (msg, sev = 'success') => setSnack({ open: true, msg, severity: sev });

  const loadUnits = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await invoicingApi.getUnits();
      setUnits(data || []);
    } catch {
      showMsg('Nepavyko įkelti matavimo vienetų', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUnits(); }, [loadUnits]);

  const openAdd = () => {
    setForm({ code: '', name: '' });
    setDialog({ open: true, mode: 'add', id: null });
  };

  const openEdit = (unit) => {
    setForm({ code: unit.code, name: unit.name });
    setDialog({ open: true, mode: 'edit', id: unit.id });
  };

  const handleSave = async () => {
    if (!form.code.trim()) { showMsg('Įveskite trumpą kodą', 'error'); return; }
    setSaving(true);
    try {
      const payload = { code: form.code.trim(), name: form.name.trim() };
      if (dialog.mode === 'add') {
        await invoicingApi.createUnit(payload);
        showMsg('Matavimo vienetas sukurtas');
      } else {
        await invoicingApi.updateUnit(dialog.id, payload);
        showMsg('Matavimo vienetas atnaujintas');
      }
      setDialog({ open: false, mode: 'add', id: null });
      loadUnits();
    } catch (e) {
      showMsg(e.response?.data?.detail || 'Klaida', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleDefault = async (unit) => {
    try {
      await invoicingApi.updateUnit(unit.id, { is_default: !unit.is_default });
      loadUnits();
    } catch {
      showMsg('Klaida', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await invoicingApi.deleteUnit(deleteDialog.id);
      showMsg('Matavimo vienetas pašalintas');
      setDeleteDialog({ open: false, id: null, code: '' });
      loadUnits();
    } catch {
      showMsg('Klaida šalinant', 'error');
    }
  };

  // Find current default
  const defaultUnit = units.find((u) => u.is_default);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 800, mx: 'auto' }}>
      <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 4 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton onClick={() => navigate('/israsymas/nustatymai')} size="small"><BackIcon /></IconButton>
            <Typography variant="h1" sx={{ color: P.primary, fontWeight: 500, fontSize: 22 }}>
              Matavimo vienetai
            </Typography>
            {!loading && <Chip label={units.length} size="small" sx={{ fontSize: 11, height: 20 }} />}
          </Box>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
            Naujas vienetas
          </Button>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : units.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
            <UnitIcon sx={{ fontSize: 48, color: '#bdbdbd', mb: 1 }} />
            <Typography variant="h6" gutterBottom>Nėra matavimo vienetų</Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>Sukurti</Button>
          </Box>
        ) : (
          <>
            {/* Default info */}
            <Box sx={{ mb: 2, p: 1.5, borderRadius: 2, backgroundColor: '#e3f2fd', border: '1px solid #bbdefb' }}>
              <Typography variant="body2">
                Numatytasis vienetas: <strong>{defaultUnit ? `${defaultUnit.code} (${defaultUnit.name})` : 'nenustatytas'}</strong>
                {' '} — bus automatiškai įterpiamas naujose sąskaitos eilutėse.
                Paspauskite ★ norėdami pakeisti.
              </Typography>
            </Box>

            {!isMobile ? (
              <TableContainer sx={{ borderRadius: 2, border: `1px solid ${P.border}` }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, py: 1.2, backgroundColor: P.bg } }}>
                      <TableCell sx={{ width: 40 }}>#</TableCell>
                      <TableCell>Kodas</TableCell>
                      <TableCell>Pavadinimas</TableCell>
                      <TableCell align="center">Numatytasis</TableCell>
                      <TableCell align="right">Veiksmai</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {units.map((unit, idx) => (
                      <TableRow key={unit.id} hover sx={{
                        '& td': { borderBottom: `1px solid ${P.border}` },
                        ...(unit.is_default ? { backgroundColor: '#e3f2fd' } : {}),
                      }}>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">{idx + 1}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={unit.code} size="small" variant="outlined"
                            sx={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 13, letterSpacing: 0.5 }} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{unit.name || '—'}</Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title={unit.is_default ? 'Numatytasis vienetas' : 'Nustatyti kaip numatytąjį'}>
                            <IconButton size="small" onClick={() => toggleDefault(unit)}
                              sx={{ color: unit.is_default ? '#f9a825' : '#bdbdbd' }}>
                              {unit.is_default ? <StarIcon /> : <StarBorderIcon />}
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Tooltip title="Redaguoti">
                              <IconButton size="small" onClick={() => openEdit(unit)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Pašalinti">
                              <IconButton size="small" color="error"
                                onClick={() => setDeleteDialog({ open: true, id: unit.id, code: unit.code })}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Stack spacing={1}>
                {units.map((unit, idx) => (
                  <Paper key={unit.id} variant="outlined" sx={{
                    p: 1.5, borderRadius: 2,
                    ...(unit.is_default ? { backgroundColor: '#e3f2fd', borderColor: P.primary } : {}),
                  }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 20 }}>{idx + 1}.</Typography>
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Chip label={unit.code} size="small" variant="outlined"
                              sx={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 13 }} />
                            {unit.is_default && <Chip label="Numatytasis" size="small" color="primary" sx={{ fontSize: 10, height: 20 }} />}
                          </Box>
                          {unit.name && (
                            <Typography variant="caption" display="block" color="text.secondary">{unit.name}</Typography>
                          )}
                        </Box>
                      </Box>
                      <Stack direction="row" spacing={0.5}>
                        <IconButton size="small" onClick={() => toggleDefault(unit)}
                          sx={{ color: unit.is_default ? '#f9a825' : '#bdbdbd' }}>
                          {unit.is_default ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
                        </IconButton>
                        <IconButton size="small" onClick={() => openEdit(unit)}><EditIcon fontSize="small" /></IconButton>
                        <IconButton size="small" color="error"
                          onClick={() => setDeleteDialog({ open: true, id: unit.id, code: unit.code })}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Box>
                  </Paper>
                ))}
              </Stack>
            )}
          </>
        )}
      </Paper>

      {/* Add/Edit Dialog */}
      <Dialog open={dialog.open} onClose={() => setDialog({ open: false, mode: 'add', id: null })} maxWidth="xs" fullWidth>
        <DialogTitle>{dialog.mode === 'add' ? 'Naujas matavimo vienetas' : 'Redaguoti matavimo vienetą'}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField fullWidth label="Kodas (trumpinys)" value={form.code}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              placeholder="Pvz. vnt, kg, val" helperText="Trumpas kodas sąskaitoje"
              inputProps={{ style: { fontWeight: 700, fontFamily: 'monospace' } }} autoFocus />
            <TextField fullWidth label="Pilnas pavadinimas" value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Pvz. Vienetas, Kilogramas" helperText="Neprivalomas aprašymas" />
            {form.code && (
              <Box sx={{ p: 2, borderRadius: 2, textAlign: 'center', backgroundColor: P.bg, border: `1px solid ${P.border}` }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                  Sąskaitoje atrodys taip:
                </Typography>
                <Typography sx={{ fontSize: 16 }}>
                  <span style={{ color: '#888' }}>2 </span>
                  <strong style={{ fontFamily: 'monospace', color: P.primary }}>{form.code}</strong>
                  <span style={{ color: '#888' }}> × 100,00 € = 200,00 €</span>
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialog({ open: false, mode: 'add', id: null })}>Atšaukti</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : (dialog.mode === 'add' ? 'Sukurti' : 'Išsaugoti')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, id: null, code: '' })}>
        <DialogTitle>Pašalinti matavimo vienetą?</DialogTitle>
        <DialogContent>
          <Typography>
            Ar tikrai norite pašalinti <strong>{deleteDialog.code}</strong>?
            Jau išrašytos sąskaitos nebus paveiktos.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, id: null, code: '' })}>Atšaukti</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Pašalinti</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={3000} onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.severity} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default MeasurementUnitsPage;