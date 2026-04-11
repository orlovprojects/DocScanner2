import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, TextField, Button, Typography, Grid2, IconButton,
  Snackbar, Alert, CircularProgress, InputAdornment, Autocomplete,
  ToggleButton, ToggleButtonGroup, Chip,
} from '@mui/material';
import {
  Save as SaveIcon, Delete as DeleteIcon, Upload as UploadIcon,
  Person as PersonIcon, Business as BusinessIcon,
  FormatListNumbered as SeriesIcon, Straighten as UnitIcon,
} from '@mui/icons-material';
import { invoicingApi } from '../api/invoicingApi';
import { api } from '../api/endpoints';
import PaymentProvidersSection from '../components/PaymentProvidersSection';
import AccountingProgramBlock from '../components/AccountingProgramBlock';
import { useInvSubscription } from '../contexts/InvSubscriptionContext';
import LockIcon from '@mui/icons-material/Lock';
import InvoiceExtraFields from '../components/InvoiceExtraFields';
import APIProviderKeys from "../components/APIProviderKeys";



const P = { primary: '#1976d2', bg: '#fafafa', border: '#e0e0e0' };
const secSx = {
  p: 2.5, backgroundColor: P.bg, borderRadius: 3,
  border: `1px solid ${P.border}`, mb: 3,
  '& .MuiInputBase-root': { backgroundColor: '#fff' },
};
const titleSx = { fontSize: 18, fontWeight: 700, mb: 1.5, color: '#333' };

const InvoiceSettingsPage = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });
  const [accountingProgram, setAccountingProgram] = useState("");

  // Logo
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [deleteLogo, setDeleteLogo] = useState(false);

  // Seller type
  const [sellerType, setSellerType] = useState('juridinis');

  // Seller hybrid search
  const [sellerSearchInput, setSellerSearchInput] = useState('');
  const [sellerOptions, setSellerOptions] = useState([]);
  const [sellerSearchLoading, setSellerSearchLoading] = useState(false);

  const showMsg = (msg, sev = 'success') => setSnack({ open: true, msg, severity: sev });
  const { isFeatureLocked } = useInvSubscription();
  const paymentLinksLocked = isFeatureLocked("payment_links");

  // ── Load ──
  useEffect(() => {
    (async () => {
      try {
        const { data } = await invoicingApi.getSettings();
        setSettings(data);
        if (data.logo_url) setLogoPreview(data.logo_url);
      } catch {
        showMsg('Nepavyko įkelti nustatymų', 'error');
      } finally {
        setLoading(false);
      }
      try {
        const { data: profile } = await api.get('/profile/', { withCredentials: true });
        setAccountingProgram(profile.default_accounting_program || "");
      } catch {}
    })();
  }, []);

  // ── Seller search (debounced) ──
  useEffect(() => {
    if (sellerSearchInput.length < 2) { setSellerOptions([]); return; }
    const t = setTimeout(async () => {
      setSellerSearchLoading(true);
      try {
        const { data } = await api.get('/invoicing/search-companies/', {
          params: { q: sellerSearchInput, limit: 15 },
          withCredentials: true,
        });
        setSellerOptions(data || []);
      } catch { setSellerOptions([]); }
      finally { setSellerSearchLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [sellerSearchInput]);

  // ── Helpers ──
  const u = (field, value) => setSettings((p) => ({ ...p, [field]: value }));

  const selectSeller = (option) => {
    if (!option) return;
    setSettings((p) => ({
      ...p,
      seller_name: option.name || '',
      seller_company_code: option.company_code || '',
      seller_vat_code: option.vat_code || '',
      seller_address: option.address || '',
      seller_phone: option.phone || p.seller_phone || '',
      seller_email: option.email || p.seller_email || '',
      seller_bank_name: option.bank_name || p.seller_bank_name || '',
      seller_iban: option.iban || p.seller_iban || '',
      seller_swift: option.swift || p.seller_swift || '',
    }));
    setSellerType(option.is_person ? 'fizinis' : 'juridinis');
  };

  // ── Logo ──
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showMsg('Logotipas per didelis. Maksimalus dydis: 2 MB.', 'error');
      return;
    }
    setLogoFile(file);
    setDeleteLogo(false);
    const reader = new FileReader();
    reader.onloadend = () => setLogoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setDeleteLogo(true);
  };

  // ── Save (single FormData request — logo не затирается) ──
  const handleSave = async () => {
    setSaving(true);
    try {
      const fd = new FormData();

      const textFields = [
        'seller_name', 'seller_company_code', 'seller_vat_code',
        'seller_address', 'seller_phone', 'seller_email',
        'seller_bank_name', 'seller_iban', 'seller_swift',
        'default_currency', 'default_vat_percent', 'default_payment_days',
        'email_subject_template', 'email_body_template',
      ];
      textFields.forEach((f) => {
        const val = settings[f];
        if (val !== undefined && val !== null) fd.append(f, val);
      });

      if (logoFile) {
        fd.append('logo', logoFile);
      } else if (deleteLogo) {
        fd.append('logo', '');
      }
      // Если ни logoFile ни deleteLogo — не отправляем logo поле,
      // бэкенд оставит текущий файл

      await api.put('/invoicing/settings/', fd, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setLogoFile(null);
      setDeleteLogo(false);

      // Перезагружаем для актуального logo_url
      const { data } = await invoicingApi.getSettings();
      setSettings(data);
      setLogoPreview(data.logo_url || null);

      showMsg('Nustatymai išsaugoti');
    } catch (e) {
      showMsg(e.response?.data?.detail || 'Klaida saugant nustatymus', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ═══════════════════════════════════════════════════
  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (!settings) return null;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: 'auto' }}>
      <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 4 }}>
        <Typography variant="h1" sx={{ color: P.primary, fontWeight: 500, fontSize: 24, mb: 3 }}>
          Sąskaitų nustatymai
        </Typography>

        {/* ─── 1. Logotipas ─── */}
        <Box sx={secSx}>
          <Typography sx={titleSx}>Logotipas</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Rekomenduojamas dydis: 300×100 px arba didesnis (proporcija ~3:1). Maksimalus failo dydis: 2 MB. Formatai: PNG, JPG, SVG.
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {logoPreview ? (
              <Box sx={{ position: 'relative', display: 'inline-block' }}>
                <Box component="img" src={logoPreview} alt="Logo" sx={{
                  maxHeight: 80, maxWidth: 300, borderRadius: 2,
                  border: `1px solid ${P.border}`, p: 0.5, backgroundColor: '#fff',
                }} />
                <IconButton onClick={removeLogo} size="small" sx={{
                  position: 'absolute', top: -8, right: -8,
                  backgroundColor: '#fff', boxShadow: 1,
                  '&:hover': { backgroundColor: '#ffebee' },
                }}>
                  <DeleteIcon fontSize="small" color="error" />
                </IconButton>
              </Box>
            ) : (
              <Button variant="outlined" component="label" startIcon={<UploadIcon />}>
                Įkelti logotipą
                <input type="file" accept="image/png,image/jpeg,image/svg+xml" hidden onChange={handleLogoUpload} />
              </Button>
            )}
          </Box>
        </Box>

        {/* ─── 2. Buhalterinė programa ir papildomi laukai ─── */}
        <Box sx={secSx}>
          <Typography sx={{ ...titleSx, color: P.primary }}>Buhalterinė programa</Typography>
          <AccountingProgramBlock onProgramChange={setAccountingProgram} />
          {["rivile_gama_api", "dineta", "optimum"].includes(accountingProgram) && (
            <APIProviderKeys provider={accountingProgram} mode="israsymas" />
          )}
          <InvoiceExtraFields program={accountingProgram} />
        </Box>


        {/* ─── 3. Pardavėjo duomenys ─── */}
        <Box sx={secSx}>
          <Typography sx={{ ...titleSx, color: P.primary }}>Pardavėjo duomenys (numatytieji)</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Šie duomenys automatiškai įrašomi kuriant naują sąskaitą.
          </Typography>

          {/* Hybrid search */}
          <Autocomplete
            freeSolo
            options={sellerOptions}
            getOptionLabel={(o) => typeof o === 'string' ? o : `${o.name}${o.company_code ? ` (${o.company_code})` : ''}`}
            onInputChange={(_, v) => setSellerSearchInput(v)}
            onChange={(_, v) => { if (v && typeof v !== 'string') selectSeller(v); }}
            loading={sellerSearchLoading}
            noOptionsText={sellerSearchInput.length < 2 ? 'Įveskite bent 2 simbolius' : 'Nerasta'}
            filterOptions={(x) => x}
            renderOption={(props, o) => (
              <li {...props} key={`${o.source}-${o.id}`}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>{o.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {o.company_code}{o.vat_code ? ` · ${o.vat_code}` : ''}
                    </Typography>
                  </Box>
                  {o.source === 'saved' && (
                    <Chip label="Klientas" size="small" color="primary" variant="outlined" sx={{ ml: 1, fontSize: 10, height: 20 }} />
                  )}
                </Box>
              </li>
            )}
            renderInput={(params) => (
              <TextField {...params} label="Ieškoti įmonės / asmens..." size="small" sx={{ mb: 2 }}
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (<>{sellerSearchLoading ? <CircularProgress size={18} /> : null}{params.InputProps.endAdornment}</>),
                }}
              />
            )}
          />

          {/* Fizinis / Juridinis */}
          <Box sx={{ mb: 2 }}>
            <ToggleButtonGroup size="small" exclusive value={sellerType}
              onChange={(_, v) => { if (v) setSellerType(v); }}>
              <ToggleButton value="juridinis"><BusinessIcon sx={{ fontSize: 18, mr: 0.5 }} />Juridinis asmuo</ToggleButton>
              <ToggleButton value="fizinis"><PersonIcon sx={{ fontSize: 18, mr: 0.5 }} />Fizinis asmuo</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Grid2 container spacing={1.5}>
            <Grid2 size={12}>
              <TextField fullWidth label={sellerType === 'fizinis' ? 'Vardas Pavardė' : 'Pavadinimas'}
                value={settings.seller_name || ''} onChange={(e) => u('seller_name', e.target.value)} />
            </Grid2>
            <Grid2 size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label={sellerType === 'fizinis' ? 'Ind. veiklos / asmens kodas' : 'Įmonės kodas'}
                value={settings.seller_company_code || ''} onChange={(e) => u('seller_company_code', e.target.value)} />
            </Grid2>
            <Grid2 size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="PVM kodas"
                value={settings.seller_vat_code || ''}
                onChange={(e) => u('seller_vat_code', e.target.value)} />
            </Grid2>
            <Grid2 size={12}>
              <TextField fullWidth label="Adresas"
                value={settings.seller_address || ''} onChange={(e) => u('seller_address', e.target.value)} />
            </Grid2>
            <Grid2 size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Telefonas"
                value={settings.seller_phone || ''} onChange={(e) => u('seller_phone', e.target.value)} />
            </Grid2>
            <Grid2 size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="El. paštas"
                value={settings.seller_email || ''} onChange={(e) => u('seller_email', e.target.value)} />
            </Grid2>
            <Grid2 size={12}>
              <TextField fullWidth label="Banko pavadinimas"
                value={settings.seller_bank_name || ''} onChange={(e) => u('seller_bank_name', e.target.value)} />
            </Grid2>
            <Grid2 size={{ xs: 12, sm: 8 }}>
              <TextField fullWidth label="IBAN"
                value={settings.seller_iban || ''} onChange={(e) => u('seller_iban', e.target.value)} />
            </Grid2>
            <Grid2 size={{ xs: 12, sm: 4 }}>
              <TextField fullWidth label="SWIFT"
                value={settings.seller_swift || ''} onChange={(e) => u('seller_swift', e.target.value)} />
            </Grid2>
          </Grid2>
        </Box>

        {/* ─── 4. Numatytosios reikšmės ─── */}
        <Box sx={secSx}>
          <Typography sx={titleSx}>Numatytosios reikšmės</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Šios reikšmės automatiškai naudojamos kuriant naują sąskaitą.
          </Typography>
          <Grid2 container spacing={1.5}>
            <Grid2 size={{ xs: 12, sm: 4 }}>
              <TextField fullWidth select label="Valiuta"
                value={settings.default_currency || 'EUR'}
                onChange={(e) => u('default_currency', e.target.value)}
                SelectProps={{ native: true }}>
                {['EUR', 'USD', 'GBP', 'PLN', 'CZK', 'SEK', 'NOK', 'DKK', 'CHF'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </TextField>
            </Grid2>
            <Grid2 size={{ xs: 12, sm: 4 }}>
              <TextField fullWidth label="PVM %" type="number"
                value={settings.default_vat_percent ?? 21}
                onChange={(e) => u('default_vat_percent', e.target.value)}
                InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} />
            </Grid2>
            <Grid2 size={{ xs: 12, sm: 4 }}>
              <TextField fullWidth label="Mokėjimo terminas" type="number"
                value={settings.default_payment_days ?? 14}
                onChange={(e) => u('default_payment_days', parseInt(e.target.value) || 0)}
                InputProps={{ endAdornment: <InputAdornment position="end">d.</InputAdornment> }} />
            </Grid2>
          </Grid2>
        </Box>

        <PaymentProvidersSection
          value={settings.payment_providers || {}}
          onChange={(providers) => u('payment_providers', providers)}
          showMsg={showMsg}
          locked={paymentLinksLocked}
        />

        {/* ─── Save ─── */}
        <Box sx={{ textAlign: 'right' }}>
          <Button variant="contained" size="large"
            startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
            onClick={handleSave} disabled={saving}>
            {saving ? 'Saugoma...' : 'Išsaugoti nustatymus'}
          </Button>
        </Box>
      </Paper>

      <Snackbar open={snack.open} autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.severity} variant="filled"
          onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default InvoiceSettingsPage;