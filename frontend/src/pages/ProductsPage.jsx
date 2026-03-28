import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Button, TextField, IconButton, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, Stack,
  Snackbar, Alert, CircularProgress, Tooltip, useTheme, useMediaQuery,
  InputAdornment, ToggleButtonGroup, ToggleButton, MenuItem,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  ArrowBack as BackIcon, Search as SearchIcon,
  Inventory as InventoryIcon,
  Upload as UploadIcon, FileDownload as DownloadIcon,
  Close as CloseIcon, CheckCircle as SuccessIcon, Error as ErrorIcon,
} from '@mui/icons-material';
import { invoicingApi } from '../api/invoicingApi';

const P = { primary: '#1976d2', bg: '#fafafa', border: '#e0e0e0' };

const TYPE_LABELS = { preke: 'Prekė', paslauga: 'Paslauga' };
const TYPE_COLORS = { preke: 'primary', paslauga: 'secondary' };

const PAGE_SIZE = 25;

const EMPTY_FORM = {
  preke_paslauga: 'preke',
  pavadinimas: '',
  kodas: '',
  barkodas: '',
  measurement_unit: '',
  pardavimo_kaina: '',
  pvm_procentas: '',
};

// FIX #2: 4 decimal places for price display
const fmtPrice = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? '—' : n.toLocaleString('lt-LT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
};

const normalizePriceInput = (raw) => {
  let v = raw.replace('.', ',');
  const parts = v.split(',');
  if (parts.length > 2) v = parts[0] + ',' + parts.slice(1).join('');
  if (parts.length === 2 && parts[1].length > 4) {
    v = parts[0] + ',' + parts[1].slice(0, 4);
  }
  v = v.replace(/[^\d,]/g, '');
  return v;
};

const ProductsPage = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [units, setUnits] = useState([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });
  const [dialog, setDialog] = useState({ open: false, mode: 'add', id: null });
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null, name: '' });
  const [importDialog, setImportDialog] = useState({ open: false });
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  // Refs for stable access in async callbacks
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef(null);

  const showMsg = (msg, sev = 'success') => setSnack({ open: true, msg, severity: sev });

  // ── Load units ────────────────────────────────────────
  useEffect(() => {
    invoicingApi.getUnits()
      .then(({ data }) => setUnits(data || []))
      .catch(() => {});
  }, []);

  // ── Load products (initial / reset) ───────────────────
  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: PAGE_SIZE, offset: 0 };
      if (search.trim()) params.q = search.trim();
      if (typeFilter) params.type = typeFilter;
      const { data } = await invoicingApi.getProducts(params);
      // Support both { results, count } and plain array responses
      const results = data?.results ?? data ?? [];
      const count = data?.count;
      setItems(results);
      setTotalCount(count ?? results.length);
      setHasMore(count != null ? results.length < count : results.length >= PAGE_SIZE);
    } catch {
      showMsg('Nepavyko įkelti prekių/paslaugų', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // ── Load more (infinite scroll) ───────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const currentLen = itemsRef.current.length;
      const params = { limit: PAGE_SIZE, offset: currentLen };
      if (search.trim()) params.q = search.trim();
      if (typeFilter) params.type = typeFilter;
      const { data } = await invoicingApi.getProducts(params);
      const results = data?.results ?? data ?? [];
      const count = data?.count;
      setItems((prev) => [...prev, ...results]);
      const newLen = currentLen + results.length;
      if (count != null) {
        setTotalCount(count);
        setHasMore(newLen < count);
      } else {
        setTotalCount(newLen);
        setHasMore(results.length >= PAGE_SIZE);
      }
    } catch {
      showMsg('Klaida kraunant daugiau', 'error');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [search, typeFilter]);

  // ── IntersectionObserver for sentinel ─────────────────
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  // ── Debounced search ──────────────────────────────────
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Dialog helpers ────────────────────────────────────
  const openAdd = () => {
    setForm({ ...EMPTY_FORM });
    setDialog({ open: true, mode: 'add', id: null });
  };

  const openEdit = (p) => {
    setForm({
      preke_paslauga: p.preke_paslauga || 'preke',
      pavadinimas: p.pavadinimas || '',
      kodas: p.kodas || '',
      barkodas: p.barkodas || '',
      measurement_unit: p.measurement_unit ?? '',
      pardavimo_kaina: p.pardavimo_kaina != null ? String(p.pardavimo_kaina).replace('.', ',') : '',
      pvm_procentas: p.pvm_procentas != null ? String(p.pvm_procentas) : '',
    });
    setDialog({ open: true, mode: 'edit', id: p.id });
  };

  const setField = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSave = async () => {
    if (!form.pavadinimas.trim()) { showMsg('Įveskite pavadinimą', 'error'); return; }
    if (!form.kodas.trim()) { showMsg('Įveskite kodą', 'error'); return; }

    setSaving(true);
    try {
      const priceForApi = form.pardavimo_kaina
        ? parseFloat(form.pardavimo_kaina.replace(',', '.'))
        : 0;

      const payload = {
        ...form,
        pavadinimas: form.pavadinimas.trim(),
        kodas: form.kodas.trim(),
        barkodas: form.barkodas.trim(),
        measurement_unit: form.measurement_unit || null,
        pardavimo_kaina: priceForApi,
        // FIX #4: send null when PVM not entered (not 0)
        pvm_procentas: form.pvm_procentas !== '' ? parseInt(form.pvm_procentas, 10) : null,
      };

      if (dialog.mode === 'add') {
        await invoicingApi.createProduct(payload);
        showMsg('Prekė/paslauga sukurta');
      } else {
        await invoicingApi.updateProduct(dialog.id, payload);
        showMsg('Prekė/paslauga atnaujinta');
      }
      setDialog({ open: false, mode: 'add', id: null });
      // FIX #1: just reload current view, don't reset filter
      loadItems();
    } catch (e) {
      const detail = e.response?.data?.detail
        || e.response?.data?.kodas?.[0]
        || 'Klaida';
      showMsg(detail, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await invoicingApi.deleteProduct(deleteDialog.id);
      showMsg('Prekė/paslauga pašalinta');
      setDeleteDialog({ open: false, id: null, name: '' });
      loadItems();
    } catch {
      showMsg('Klaida šalinant', 'error');
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await invoicingApi.downloadProductTemplate();
      const blob = new Blob([res.data], { type: res.headers['content-type'] });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'prekiu_sablonas.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      showMsg('Nepavyko atsisiųsti šabloną', 'error');
    }
  };

  const handleImport = async () => {
    if (!importFile) { showMsg('Pasirinkite failą', 'error'); return; }
    setImportLoading(true);
    setImportResult(null);
    try {
      const { data } = await invoicingApi.importProducts(importFile);
      setImportResult(data);
      if (data.errors?.length === 0) {
        showMsg(`Importuota: ${data.created} nauji, ${data.updated} atnaujinti`);
      }
      loadItems();
    } catch (e) {
      showMsg(e.response?.data?.detail || 'Importas nepavyko', 'error');
    } finally {
      setImportLoading(false);
    }
  };

  const resetImport = () => {
    setImportFile(null);
    setImportResult(null);
    setImportDialog({ open: false });
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000, mx: 'auto' }}>
      <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 4 }}>

        {/* ── Header ─────────────────────────────────────── */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton onClick={() => navigate('/israsymas/nustatymai')} size="small"><BackIcon /></IconButton>
            <Typography variant="h1" sx={{ color: P.primary, fontWeight: 500, fontSize: 22 }}>
              Prekės ir paslaugos
            </Typography>
            {!loading && <Chip label={totalCount} size="small" sx={{ fontSize: 11, height: 20 }} />}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="Importuoti iš Excel">
              <IconButton onClick={() => setImportDialog({ open: true })}
                sx={{ border: `1px solid ${P.border}`, borderRadius: 1.5 }}>
                <UploadIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
              Nauja prekė / paslauga
            </Button>
          </Box>
        </Box>

        {/* ── Search + type filter ───────────────────────── */}
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small" placeholder="Ieškoti pagal pavadinimą, kodą, barkodą…"
            value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            sx={{ flex: 1, minWidth: 220 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: '#9e9e9e' }} /></InputAdornment>
              ),
            }}
          />
          <ToggleButtonGroup
            size="small" exclusive value={typeFilter}
            onChange={(_, val) => setTypeFilter(val || '')}
          >
            <ToggleButton value="">Visi</ToggleButton>
            <ToggleButton value="preke">Prekės</ToggleButton>
            <ToggleButton value="paslauga">Paslaugos</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* ── Content ────────────────────────────────────── */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : items.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
            <InventoryIcon sx={{ fontSize: 48, color: '#bdbdbd', mb: 1 }} />
            <Typography variant="h6" gutterBottom>
              {search ? 'Nieko nerasta' : 'Nėra prekių / paslaugų'}
            </Typography>
            {!search && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>Sukurti</Button>
            )}
          </Box>
        ) : !isMobile ? (
          /* ── Desktop table ─── */
          <TableContainer sx={{ borderRadius: 2, border: `1px solid ${P.border}` }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, py: 1.2, backgroundColor: P.bg } }}>
                  <TableCell sx={{ width: 36 }}>#</TableCell>
                  <TableCell>Tipas</TableCell>
                  <TableCell>Kodas</TableCell>
                  <TableCell>Pavadinimas</TableCell>
                  <TableCell>Mato vnt.</TableCell>
                  <TableCell align="right">Kaina be PVM</TableCell>
                  <TableCell align="right">PVM %</TableCell>
                  {/* FIX #3: "Kaina su PVM" column removed */}
                  <TableCell align="right">Veiksmai</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((p, idx) => {
                  const base = parseFloat(p.pardavimo_kaina) || 0;
                  const pvmRaw = p.pvm_procentas;
                  const pvmIsSet = pvmRaw != null && pvmRaw !== '';
                  return (
                    <TableRow key={p.id} hover sx={{ '& td': { borderBottom: `1px solid ${P.border}` } }}>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">{idx + 1}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={TYPE_LABELS[p.preke_paslauga] || p.preke_paslauga}
                          size="small" color={TYPE_COLORS[p.preke_paslauga] || 'default'}
                          variant="outlined" sx={{ fontSize: 11, height: 22 }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600 }}>
                          {p.kodas}
                        </Typography>
                        {p.barkodas && (
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontFamily: 'monospace', fontSize: 11 }}>
                            {p.barkodas}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{p.pavadinimas}</Typography>
                      </TableCell>
                      <TableCell>
                        {p.measurement_unit_code ? (
                          <Chip label={p.measurement_unit_code} size="small" variant="outlined"
                            sx={{ fontFamily: 'monospace', fontSize: 12, height: 22 }} />
                        ) : (
                          <Typography variant="body2" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                      {/* FIX #2: 4 decimal places */}
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{fmtPrice(base)} €</Typography>
                      </TableCell>
                      {/* FIX #4: show — when PVM not set */}
                      <TableCell align="right">
                        <Typography variant="body2" color={pvmIsSet ? 'text.primary' : 'text.disabled'}>
                          {pvmIsSet ? `${pvmRaw}%` : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Tooltip title="Redaguoti">
                            <IconButton size="small" onClick={() => openEdit(p)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Pašalinti">
                            <IconButton size="small" color="error"
                              onClick={() => setDeleteDialog({ open: true, id: p.id, name: p.pavadinimas })}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          /* ── Mobile cards ─── */
          <Stack spacing={1}>
            {items.map((p, idx) => {
              const base = parseFloat(p.pardavimo_kaina) || 0;
              const pvmRaw = p.pvm_procentas;
              const pvmIsSet = pvmRaw != null && pvmRaw !== '';
              return (
                <Paper key={p.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.3 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 18 }}>{idx + 1}.</Typography>
                        <Chip label={TYPE_LABELS[p.preke_paslauga]} size="small"
                          color={TYPE_COLORS[p.preke_paslauga]} variant="outlined"
                          sx={{ fontSize: 10, height: 20 }} />
                        <Typography variant="body2" sx={{
                          fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {p.pavadinimas}
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 3, fontFamily: 'monospace' }}>
                        {p.kodas}{p.barkodas ? ` · ${p.barkodas}` : ''}
                        {p.measurement_unit_code ? ` · ${p.measurement_unit_code}` : ''}
                      </Typography>
                      {/* FIX #2 + #3 + #4: 4 decimals, no VAT total, dash if no PVM */}
                      <Typography variant="body2" sx={{ ml: 3, mt: 0.3, fontFamily: 'monospace' }}>
                        {fmtPrice(base)} €
                        {pvmIsSet && (
                          <span style={{ color: '#9e9e9e' }}> · PVM {pvmRaw}%</span>
                        )}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.5} sx={{ ml: 1, flexShrink: 0 }}>
                      <IconButton size="small" onClick={() => openEdit(p)}><EditIcon fontSize="small" /></IconButton>
                      <IconButton size="small" color="error"
                        onClick={() => setDeleteDialog({ open: true, id: p.id, name: p.pavadinimas })}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Box>
                </Paper>
              );
            })}
          </Stack>
        )}

        {/* ── FIX #5: Infinite scroll sentinel ───────────── */}
        {hasMore && (
          <Box ref={sentinelRef} sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            {loadingMore && <CircularProgress size={24} />}
          </Box>
        )}
        {!loading && items.length > 0 && !hasMore && totalCount > PAGE_SIZE && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', py: 1 }}>
            Rodoma viskas: {items.length} iš {totalCount}
          </Typography>
        )}
      </Paper>

      {/* ═══ Add / Edit Dialog ═══════════════════════════ */}
      <Dialog open={dialog.open} onClose={() => setDialog({ open: false, mode: 'add', id: null })}
        maxWidth="sm" fullWidth fullScreen={isMobile}
        disableScrollLock>
        <DialogTitle>
          {dialog.mode === 'add' ? 'Nauja prekė / paslauga' : 'Redaguoti prekę / paslaugą'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>

            <TextField select fullWidth label="Tipas" value={form.preke_paslauga}
              onChange={setField('preke_paslauga')} required>
              <MenuItem value="preke">Prekė</MenuItem>
              <MenuItem value="paslauga">Paslauga</MenuItem>
            </TextField>

            <TextField fullWidth label="Pavadinimas" value={form.pavadinimas}
              onChange={setField('pavadinimas')} required autoFocus
              placeholder="Pvz. Konsultacija, Laptop HP ProBook" />

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField fullWidth label="Kodas" value={form.kodas}
                onChange={setField('kodas')} required
                placeholder="Pvz. KONS-001"
                helperText="Unikalus prekės/paslaugos kodas"
                inputProps={{ style: { fontFamily: 'monospace', fontWeight: 700 } }} />
              <TextField fullWidth label="Barkodas" value={form.barkodas}
                onChange={setField('barkodas')}
                placeholder="EAN / UPC"
                inputProps={{ style: { fontFamily: 'monospace' } }} />
            </Box>

            <TextField select fullWidth label="Mato vienetas" value={form.measurement_unit}
              onChange={setField('measurement_unit')}
              helperText={units.length === 0 ? 'Pirmiau sukurkite mato vienetą' : ''}>
              <MenuItem value="">
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  —
                </Typography>
              </MenuItem>
              {units.map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <strong style={{ fontFamily: 'monospace' }}>{u.code}</strong>
                    {u.name && <span style={{ color: '#888' }}>({u.name})</span>}
                  </Box>
                </MenuItem>
              ))}
            </TextField>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField fullWidth label="Pardavimo kaina (be PVM)"
                value={form.pardavimo_kaina}
                onChange={(e) => {
                  const normalized = normalizePriceInput(e.target.value);
                  setForm((prev) => ({ ...prev, pardavimo_kaina: normalized }));
                }}
                inputProps={{ inputMode: 'decimal' }}
                InputProps={{
                  endAdornment: <InputAdornment position="end">€</InputAdornment>,
                }}
                placeholder="0,00"
              />
              <TextField label="PVM %"
                value={form.pvm_procentas}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, '');
                  const num = parseInt(raw, 10);
                  if (raw === '') {
                    setForm((prev) => ({ ...prev, pvm_procentas: '' }));
                  } else if (!isNaN(num) && num >= 0 && num <= 100) {
                    setForm((prev) => ({ ...prev, pvm_procentas: String(num) }));
                  }
                }}
                inputProps={{ inputMode: 'numeric', maxLength: 3 }}
                InputProps={{
                  endAdornment: <InputAdornment position="end">%</InputAdornment>,
                }}
                sx={{ minWidth: 110 }}
                placeholder="21"
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialog({ open: false, mode: 'add', id: null })}>Atšaukti</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : (dialog.mode === 'add' ? 'Sukurti' : 'Išsaugoti')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══ Import Dialog ═══════════════════════════════ */}
      <Dialog open={importDialog.open} onClose={resetImport}
        maxWidth="sm" fullWidth disableScrollLock>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Importuoti prekes / paslaugas
          <IconButton size="small" onClick={resetImport}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, backgroundColor: '#f5f5f5' }}>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>1. Atsisiųskite šabloną</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
                Užpildykite šabloną savo prekių/paslaugų duomenimis. Privalomi laukai pažymėti *.
                Mato vienetų kodai turi atitikti jūsų sukurtus mato vienetus.
              </Typography>
              <Button variant="outlined" size="small" startIcon={<DownloadIcon />}
                onClick={handleDownloadTemplate}>
                Atsisiųsti šabloną (.xlsx)
              </Button>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, backgroundColor: '#f5f5f5' }}>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>2. Įkelkite užpildytą failą</Typography>
              <input
                type="file"
                accept=".xlsx,.xls"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={(e) => {
                  setImportFile(e.target.files[0] || null);
                  setImportResult(null);
                }}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button variant="outlined" size="small"
                  onClick={() => fileInputRef.current?.click()}>
                  Pasirinkti failą
                </Button>
                {importFile && (
                  <Chip
                    label={importFile.name}
                    size="small"
                    onDelete={() => { setImportFile(null); setImportResult(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    sx={{ maxWidth: 250 }}
                  />
                )}
              </Box>
            </Paper>

            {importResult && (
              <Paper variant="outlined" sx={{
                p: 2, borderRadius: 2,
                border: importResult.errors?.length > 0 ? '1px solid #f44336' : '1px solid #4caf50',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  {importResult.errors?.length > 0
                    ? <ErrorIcon color="error" sx={{ fontSize: 20 }} />
                    : <SuccessIcon color="success" sx={{ fontSize: 20 }} />
                  }
                  <Typography variant="body2" fontWeight={600}>Rezultatas</Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 3, mb: 1.5 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Sukurta</Typography>
                    <Typography fontWeight={700} color="success.main">{importResult.created}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Atnaujinta</Typography>
                    <Typography fontWeight={700} color="info.main">{importResult.updated}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Klaidų</Typography>
                    <Typography fontWeight={700} color={importResult.errors?.length > 0 ? 'error.main' : 'text.primary'}>
                      {importResult.errors?.length || 0}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Iš viso eilučių</Typography>
                    <Typography fontWeight={700}>{importResult.total_rows}</Typography>
                  </Box>
                </Box>

                {importResult.errors?.length > 0 && (
                  <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700, fontSize: 11, py: 0.5 }}>Eilutė</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 11, py: 0.5 }}>Pavadinimas</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 11, py: 0.5 }}>Klaida</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {importResult.errors.map((err, i) => (
                          <TableRow key={i}>
                            <TableCell sx={{ py: 0.5, fontSize: 12 }}>{err.row}</TableCell>
                            <TableCell sx={{ py: 0.5, fontSize: 12 }}>{err.name}</TableCell>
                            <TableCell sx={{ py: 0.5, fontSize: 12, color: 'error.main' }}>
                              {err.errors.join('; ')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                )}
              </Paper>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={resetImport}>
            {importResult ? 'Uždaryti' : 'Atšaukti'}
          </Button>
          {!importResult && (
            <Button variant="contained" onClick={handleImport}
              disabled={!importFile || importLoading}
              startIcon={importLoading ? <CircularProgress size={16} /> : <UploadIcon />}>
              Importuoti
            </Button>
          )}
          {importResult?.errors?.length > 0 && (
            <Button variant="contained"
              onClick={() => { setImportResult(null); setImportFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
              Bandyti dar kartą
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ═══ Delete Dialog ═══════════════════════════════ */}
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, id: null, name: '' })}
        disableScrollLock>
        <DialogTitle>Pašalinti prekę / paslaugą?</DialogTitle>
        <DialogContent>
          <Typography>
            Ar tikrai norite pašalinti <strong>{deleteDialog.name}</strong>?
            Jau išrašytos sąskaitos nebus paveiktos.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, id: null, name: '' })}>Atšaukti</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Pašalinti</Button>
        </DialogActions>
      </Dialog>

      {/* ═══ Snackbar ════════════════════════════════════ */}
      <Snackbar open={snack.open} autoHideDuration={3000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        disableWindowBlurListener>
        <Alert severity={snack.severity} variant="filled"
          onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ProductsPage;