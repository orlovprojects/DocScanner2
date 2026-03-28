import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Button, TextField, IconButton, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, Stack,
  Snackbar, Alert, CircularProgress, Tooltip, useTheme, useMediaQuery,
  InputAdornment, ToggleButtonGroup, ToggleButton, Divider,
  FormControlLabel, Checkbox, Autocomplete,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  ArrowBack as BackIcon, Search as SearchIcon, People as PeopleIcon,
  Business as BusinessIcon, Person as PersonIcon, ContentCopy as CopyIcon,
  Phone as PhoneIcon, Email as EmailIcon, AccountBalance as BankIcon,
  Upload as UploadIcon, FileDownload as DownloadIcon, Close as CloseIcon,
  CheckCircle as SuccessIcon, Error as ErrorIcon,
} from '@mui/icons-material';
import { invoicingApi } from '../api/invoicingApi';
import { COUNTRY_OPTIONS } from '../page_elements/Countries';

const P = { primary: '#1976d2', bg: '#fafafa', border: '#e0e0e0' };
const PAGE_SIZE = 25;

const ROLE_LABELS = { buyer: 'Pirkėjas', seller: 'Pardavėjas', both: 'Abu' };
const ROLE_COLORS = { buyer: 'info', seller: 'warning', both: 'default' };

// Default country — Lithuania
const DEFAULT_COUNTRY = COUNTRY_OPTIONS.find((c) => c.code === 'LT') || null;

const EMPTY_FORM = {
  name: '', company_code: '', vat_code: '', address: '', country_obj: DEFAULT_COUNTRY,
  phone: '', email: '', bank_name: '', iban: '', swift: '',
  is_person: false, default_role: 'buyer', extra_info: '',
  delivery_address: '',
};

const CounterpartiesPage = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
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

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef(null);

  const showMsg = (msg, sev = 'success') => setSnack({ open: true, msg, severity: sev });

  // ── Load (initial / reset) ────────────────────────────
  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: PAGE_SIZE, offset: 0 };
      if (search.trim()) params.q = search.trim();
      if (roleFilter) params.role = roleFilter;
      const { data } = await invoicingApi.getCounterparties(params);
      const results = data?.results ?? data ?? [];
      const count = data?.count;
      setItems(results);
      setTotalCount(count ?? results.length);
      setHasMore(count != null ? results.length < count : results.length >= PAGE_SIZE);
    } catch {
      showMsg('Nepavyko įkelti kontrahentų', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

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
      if (roleFilter) params.role = roleFilter;
      const { data } = await invoicingApi.getCounterparties(params);
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
  }, [search, roleFilter]);

  // ── IntersectionObserver ──────────────────────────────
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

  const openEdit = (cp) => {
    // Resolve country object from country_iso or country name
    const countryObj = COUNTRY_OPTIONS.find((c) => c.code === cp.country_iso)
      || COUNTRY_OPTIONS.find((c) => c.name === cp.country)
      || null;
    setForm({
      name: cp.name || '',
      company_code: cp.company_code || '',
      vat_code: cp.vat_code || '',
      address: cp.address || '',
      country_obj: countryObj,
      phone: cp.phone || '',
      email: cp.email || '',
      bank_name: cp.bank_name || '',
      iban: cp.iban || '',
      swift: cp.swift || '',
      is_person: cp.is_person || false,
      default_role: cp.default_role || 'buyer',
      extra_info: cp.extra_info || '',
      delivery_address: cp.delivery_address || '',
    });
    setDialog({ open: true, mode: 'edit', id: cp.id });
  };

  const setField = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((p) => ({ ...p, [field]: val }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showMsg('Įveskite pavadinimą', 'error'); return; }
    if (!form.company_code.trim()) {
      showMsg(form.is_person ? 'Įveskite ind. veiklos / asmens kodą' : 'Įveskite įmonės kodą', 'error');
      return;
    }
    if (!form.country_obj) { showMsg('Pasirinkite šalį', 'error'); return; }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        company_code: form.company_code.trim(),
        vat_code: form.vat_code.trim(),
        address: form.address.trim(),
        country: form.country_obj?.name || '',
        country_iso: form.country_obj?.code || '',
        phone: form.phone.trim(),
        email: form.email.trim(),
        bank_name: form.bank_name.trim(),
        iban: form.iban.trim(),
        swift: form.swift.trim(),
        is_person: form.is_person,
        default_role: form.default_role,
        extra_info: form.extra_info.trim(),
        delivery_address: form.delivery_address.trim(),
      };
      if (dialog.mode === 'add') {
        await invoicingApi.createCounterparty(payload);
        showMsg('Kontrahentas sukurtas');
      } else {
        await invoicingApi.updateCounterparty(dialog.id, payload);
        showMsg('Kontrahentas atnaujintas');
      }
      setDialog({ open: false, mode: 'add', id: null });
      loadItems();
    } catch (e) {
      const detail = e.response?.data?.detail
        || e.response?.data?.company_code?.[0]
        || 'Klaida';
      showMsg(detail, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await invoicingApi.deleteCounterparty(deleteDialog.id);
      showMsg('Kontrahentas pašalintas');
      setDeleteDialog({ open: false, id: null, name: '' });
      loadItems();
    } catch {
      showMsg('Klaida šalinant', 'error');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showMsg('Nukopijuota');
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await invoicingApi.downloadCounterpartyTemplate();
      const blob = new Blob([res.data], { type: res.headers['content-type'] });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'kontrahentu_sablonas.xlsx');
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
      const { data } = await invoicingApi.importCounterparties(importFile);
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
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 4 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton onClick={() => navigate('/israsymas/nustatymai')} size="small"><BackIcon /></IconButton>
            <Typography variant="h1" sx={{ color: P.primary, fontWeight: 500, fontSize: 22 }}>
              Kontrahentai
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
              Naujas kontrahentas
            </Button>
          </Box>
        </Box>

        {/* Search + role filter */}
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small" placeholder="Ieškoti pagal pavadinimą, įm. kodą, PVM…"
            value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            sx={{ flex: 1, minWidth: 220 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: '#9e9e9e' }} /></InputAdornment>
              ),
            }}
          />
          <ToggleButtonGroup
            size="small" exclusive
            value={roleFilter}
            onChange={(_, val) => setRoleFilter(val || '')}
          >
            <ToggleButton value="">Visi</ToggleButton>
            <ToggleButton value="buyer">Pirkėjai</ToggleButton>
            <ToggleButton value="seller">Pardavėjai</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : items.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
            <PeopleIcon sx={{ fontSize: 48, color: '#bdbdbd', mb: 1 }} />
            <Typography variant="h6" gutterBottom>
              {search ? 'Nieko nerasta' : 'Nėra kontrahentų'}
            </Typography>
            {!search && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>Sukurti</Button>
            )}
          </Box>
        ) : !isMobile ? (
          /* ─── Desktop table ─── */
          <TableContainer sx={{ borderRadius: 2, border: `1px solid ${P.border}` }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, py: 1.2, backgroundColor: P.bg } }}>
                  <TableCell sx={{ width: 36 }}>#</TableCell>
                  <TableCell>Pavadinimas</TableCell>
                  <TableCell>Kodas</TableCell>
                  <TableCell>PVM kodas</TableCell>
                  <TableCell>Tipas</TableCell>
                  <TableCell>Kontaktai</TableCell>
                  <TableCell>Šalis</TableCell> 
                  <TableCell align="right">Veiksmai</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((cp, idx) => (
                  <TableRow key={cp.id} hover sx={{ '& td': { borderBottom: `1px solid ${P.border}` } }}>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{idx + 1}</Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {cp.is_person
                          ? <PersonIcon sx={{ fontSize: 16, color: '#9e9e9e' }} />
                          : <BusinessIcon sx={{ fontSize: 16, color: '#9e9e9e' }} />
                        }
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{cp.name}</Typography>
                      </Box>
                      {cp.address && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 2.5 }}>
                          {cp.address}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {cp.company_code ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                            {cp.company_code}
                          </Typography>
                          <Tooltip title="Kopijuoti">
                            <IconButton size="small" onClick={() => copyToClipboard(cp.company_code)}
                              sx={{ opacity: 0.4, '&:hover': { opacity: 1 } }}>
                              <CopyIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                        {cp.vat_code || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={ROLE_LABELS[cp.default_role] || cp.default_role}
                        size="small" color={ROLE_COLORS[cp.default_role] || 'default'}
                        variant="outlined" sx={{ fontSize: 11, height: 22 }} />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        {cp.email && (
                          <Tooltip title={cp.email}>
                            <EmailIcon sx={{ fontSize: 16, color: '#9e9e9e' }} />
                          </Tooltip>
                        )}
                        {cp.phone && (
                          <Tooltip title={cp.phone}>
                            <PhoneIcon sx={{ fontSize: 16, color: '#9e9e9e' }} />
                          </Tooltip>
                        )}
                        {cp.iban && (
                          <Tooltip title={cp.iban}>
                            <BankIcon sx={{ fontSize: 16, color: '#9e9e9e' }} />
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontSize={13}>
                        {cp.country_iso || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title="Redaguoti">
                          <IconButton size="small" onClick={() => openEdit(cp)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Pašalinti">
                          <IconButton size="small" color="error"
                            onClick={() => setDeleteDialog({ open: true, id: cp.id, name: cp.name })}>
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
          /* ─── Mobile cards ─── */
          <Stack spacing={1}>
            {items.map((cp, idx) => (
              <Paper key={cp.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.3 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 18 }}>{idx + 1}.</Typography>
                      {cp.is_person
                        ? <PersonIcon sx={{ fontSize: 16, color: '#9e9e9e' }} />
                        : <BusinessIcon sx={{ fontSize: 16, color: '#9e9e9e' }} />
                      }
                      <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cp.name}
                      </Typography>
                    </Box>
                    {cp.company_code && (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 3.5, fontFamily: 'monospace' }}>
                        {cp.company_code}{cp.vat_code ? ` · ${cp.vat_code}` : ''}
                      </Typography>
                    )}
                    {cp.address && (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 3.5 }}>
                        {cp.address}
                      </Typography>
                    )}
                    <Box sx={{ ml: 3.5, mt: 0.3, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      <Chip label={ROLE_LABELS[cp.default_role]} size="small" variant="outlined"
                        color={ROLE_COLORS[cp.default_role]} sx={{ fontSize: 10, height: 20 }} />
                      {cp.email && (
                        <Chip icon={<EmailIcon sx={{ fontSize: '14px !important' }} />} label={cp.email}
                          size="small" variant="outlined" sx={{ fontSize: 10, height: 20, maxWidth: 180 }} />
                      )}
                    </Box>
                  </Box>
                  <Stack direction="row" spacing={0.5} sx={{ ml: 1, flexShrink: 0 }}>
                    <IconButton size="small" onClick={() => openEdit(cp)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color="error"
                      onClick={() => setDeleteDialog({ open: true, id: cp.id, name: cp.name })}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Box>
              </Paper>
            ))}
          </Stack>
        )}

        {/* ── Infinite scroll sentinel ───────────────────── */}
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
          {dialog.mode === 'add' ? 'Naujas kontrahentas' : 'Redaguoti kontrahentą'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>

            {/* Tipas + rolė */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <FormControlLabel
                control={<Checkbox checked={form.is_person} onChange={setField('is_person')} size="small" />}
                label="Fizinis asmuo"
              />
              <ToggleButtonGroup
                size="small" exclusive value={form.default_role}
                onChange={(_, val) => val && setForm((p) => ({ ...p, default_role: val }))}
              >
                <ToggleButton value="buyer">Pirkėjas</ToggleButton>
                <ToggleButton value="seller">Pardavėjas</ToggleButton>
                <ToggleButton value="both">Abu</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Pagrindiniai */}
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Pagrindiniai duomenys
            </Typography>

            {/* Pavadinimas — label changes based on is_person */}
            <TextField fullWidth
              label={form.is_person ? 'Vardas Pavardė' : 'Pavadinimas'}
              value={form.name} onChange={setField('name')}
              placeholder={form.is_person ? 'Vardas Pavardė' : 'UAB Pavadinimas'}
              required autoFocus />

            <Box sx={{ display: 'flex', gap: 2 }}>
              {/* Įmonės kodas — label changes based on is_person */}
              <TextField fullWidth
                label={form.is_person ? 'Ind. veiklos / asmens kodas' : 'Įmonės kodas'}
                value={form.company_code} onChange={setField('company_code')}
                placeholder={form.is_person ? 'Asmens arba ind. veiklos kodas' : '123456789'}
                required
                inputProps={{ style: { fontFamily: 'monospace' } }} />
              <TextField fullWidth label="PVM kodas" value={form.vat_code} onChange={setField('vat_code')}
                placeholder="LT123456789" inputProps={{ style: { fontFamily: 'monospace' } }} />
            </Box>

            <TextField fullWidth label="Adresas" value={form.address} onChange={setField('address')}
              placeholder="Gatvė 1, Miestas" />

            {/* Šalis — Autocomplete dropdown with search */}
            <Autocomplete
              options={COUNTRY_OPTIONS}
              getOptionLabel={(opt) => opt.name || ''}
              value={form.country_obj}
              onChange={(_, newVal) => setForm((p) => ({ ...p, country_obj: newVal }))}
              isOptionEqualToValue={(opt, val) => opt.code === val?.code}
              renderOption={(props, opt) => (
                <li {...props} key={opt.code}>
                  <Typography variant="body2">
                    <strong style={{ fontFamily: 'monospace', marginRight: 8 }}>{opt.code}</strong>
                    {opt.name}
                  </Typography>
                </li>
              )}
              renderInput={(params) => (
                <TextField {...params} label="Šalis" required placeholder="Ieškoti šalies…" />
              )}
              disablePortal={false}
              fullWidth
            />

            <Divider />

            {/* Kontaktai */}
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Kontaktiniai duomenys
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField fullWidth label="Telefonas" value={form.phone} onChange={setField('phone')}
                placeholder="+370 600 00000" />
              <TextField fullWidth label="El. paštas" value={form.email} onChange={setField('email')}
                placeholder="info@imone.lt" type="email" />
            </Box>

            <Divider />

            {/* Bankas */}
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Banko rekvizitai
            </Typography>
            <TextField fullWidth label="Banko pavadinimas" value={form.bank_name} onChange={setField('bank_name')}
              placeholder="Swedbank, AB" />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField fullWidth label="IBAN" value={form.iban} onChange={setField('iban')}
                placeholder="LT00 0000 0000 0000 0000"
                inputProps={{ style: { fontFamily: 'monospace', letterSpacing: 1 } }} />
              <TextField sx={{ minWidth: 140 }} label="SWIFT/BIC" value={form.swift} onChange={setField('swift')}
                placeholder="HABALT22" inputProps={{ style: { fontFamily: 'monospace' } }} />
            </Box>

            <Divider />

            {/* Papildomai */}
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Papildomai
            </Typography>
            <TextField fullWidth label="Pristatymo adresas" value={form.delivery_address}
              onChange={setField('delivery_address')} placeholder="Jei skiriasi nuo pagrindinio" />
            <TextField fullWidth label="Papildoma informacija" value={form.extra_info}
              onChange={setField('extra_info')} multiline rows={2}
              placeholder="Pastabos, mokėjimo sąlygos ir kt." />
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
          Importuoti kontrahentus
          <IconButton size="small" onClick={resetImport}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>

            {/* Šablonas */}
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, backgroundColor: '#f5f5f5' }}>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>1. Atsisiųskite šabloną</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
                Užpildykite šabloną savo kontrahentų duomenimis. Privalomi laukai pažymėti *.
              </Typography>
              <Button variant="outlined" size="small" startIcon={<DownloadIcon />}
                onClick={handleDownloadTemplate}>
                Atsisiųsti šabloną (.xlsx)
              </Button>
            </Paper>

            {/* Failas */}
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

            {/* Rezultatas */}
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
        <DialogTitle>Pašalinti kontrahentą?</DialogTitle>
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

export default CounterpartiesPage;