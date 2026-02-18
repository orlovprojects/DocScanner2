import { useState } from 'react';
import { Helmet } from "react-helmet";
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  IconButton,
  MenuItem,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  InputAdornment,
  Grid2,
  Stack,
  useTheme,
  useMediaQuery,
  Container,
  Dialog,
  DialogContent,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Download as DownloadIcon, Close as CloseIcon } from '@mui/icons-material';
import { PDFDownloadLink } from '@react-pdf/renderer';
import InvoicePDF from '../page_elements/InvoicePDF';
import AdSection from '../page_elements/AdSection';

// ---- helpers ----
const parseLocale = (v) => {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n) => n.toFixed(2).replace('.', ',');
// Разрешаем только цифры и одну запятую
const allowDec = (v) => v === '' || /^[0-9]*([,]?[0-9]*)?$/.test(v);
// Убираем ведущие нули: "045" -> "45". Но оставляем "0", "0,", "0."
const stripLeadingZeros = (v) => {
  if (v == null) return '';
  const s = String(v);
  if (s === '0' || s === '0,' || s === '0.') return s;
  return s.replace(/^0+(?=\d)/, '');
};

// Currency symbol mapping
const CURRENCY_SYMBOLS = {
  'EUR': '€',
  'USD': '$',
  'GBP': '£',
  'PLN': 'zł',
  'JPY': '¥',
  'CNY': '¥',
  'KRW': '₩',
  'INR': '₹',
  'TRY': '₺',
  'VND': '₫',
  'ILS': '₪',
  'PHP': '₱',
  'NGN': '₦',
  'CRC': '₡',
  'PYG': '₲',
  'LAK': '₭',
  'GHS': '₵',
  'KZT': '₸',
  'AZN': '₼',
  'UAH': '₴',
  'BRL': 'R$',
  'RUB': '₽',
  'AUD': 'A$',
  'CAD': 'C$',
  'NZD': 'NZ$',
  'HKD': 'HK$',
  'SGD': 'S$',
  'TWD': 'NT$',
  'MXN': 'Mex$',
  'CZK': 'Kč',
  'BGN': 'лв',
  'ZAR': 'R',
  'SEK': 'kr',
  'NOK': 'kr',
  'DKK': 'kr',
  'ISK': 'kr',
};

const getCurrencySymbol = (currencyCode) => {
  return CURRENCY_SYMBOLS[currencyCode] || currencyCode;
};

// ---- UI tokens ----
const palette = {
  primary: '#1976d2',
  bgSection: '#fafafa',
  border: '#e0e0e0',
};
const sectionSx = {
  p: 2.5,
  backgroundColor: palette.bgSection,
  borderRadius: 3,
  border: `1px solid ${palette.border}`,
};
const titleSx = {
  fontSize: 18,
  fontWeight: 700,
  mb: 1.5,
  color: '#333',
};

// ---- component ----
const InvoiceGenerator = () => {
  const [logo, setLogo] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);

  const [invoiceData, setInvoiceData] = useState({
    buyer: {
      pavadinimas: '',
      imonesKodas: '',
      pvmKodas: '',
      adresas: '',
      telefonas: '+',
      bankoPavadinimas: '',
      iban: '',
      swift: '',
    },
    seller: {
      pavadinimas: '',
      imonesKodas: '',
      pvmKodas: '',
      adresas: '',
      telefonas: '+',
      bankoPavadinimas: '',
      iban: '',
      swift: '',
    },
    saskaitosData: new Date().toISOString().split('T')[0],
    moketiIki: '',
    saskaitosSerija: '',
    saskaitosNumeris: '',
    uzsakymoNumeris: '',
    valiuta: 'EUR',
    eilutes: [{ pavadinimas: '', kodas: '', barkodas: '', kiekis: '1', matoVnt: 'vnt', kainaBePvm: '0' }],
    nuolaida: '0',
    pristatymoMokestis: '0',
    pvmProcent: '21',
    pvmTipas: 'taikoma',
  });

  // ---- logo ----
  const handleLogoUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setLogo(reader.result);
    reader.readAsDataURL(file);
  };
  const handleLogoDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onloadend = () => setLogo(reader.result);
    reader.readAsDataURL(file);
  };

  // ---- state updaters ----
  const updateField = (section, field, value) => {
    setInvoiceData((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
  };
  const updateRootField = (field, value) => {
    setInvoiceData((prev) => ({ ...prev, [field]: value }));
  };
  const addEilute = () => {
    setInvoiceData((prev) => ({
      ...prev,
      eilutes: [
        ...prev.eilutes,
        { pavadinimas: '', kodas: '', barkodas: '', kiekis: '1', matoVnt: 'vnt', kainaBePvm: '0' },
      ],
    }));
  };
  const removeEilute = (index) => {
    setInvoiceData((prev) => ({
      ...prev,
      eilutes: prev.eilutes.filter((_, i) => i !== index),
    }));
  };
  const updateEilute = (index, field, value) => {
    setInvoiceData((prev) => ({
      ...prev,
      eilutes: prev.eilutes.map((e, i) => (i === index ? { ...e, [field]: value } : e)),
    }));
  };

  // ---- sums ----
  const calculateSums = () => {
    const tarpineSuma = invoiceData.eilutes.reduce(
      (sum, e) => sum + parseLocale(e.kiekis) * parseLocale(e.kainaBePvm),
      0
    );
    const nuolaida = parseLocale(invoiceData.nuolaida);
    const pristatymas = parseLocale(invoiceData.pristatymoMokestis);
    const pvmProcent = parseLocale(invoiceData.pvmProcent);

    const sumaBePvm = tarpineSuma - nuolaida + pristatymas;
    const pvmSuma = invoiceData.pvmTipas === 'taikoma' ? (sumaBePvm * pvmProcent) / 100 : 0;
    const sumaSuPvm = sumaBePvm + pvmSuma;

    return {
      tarpineSuma: fmt(tarpineSuma),
      nuolaida: fmt(nuolaida),
      pristatymoMokestis: fmt(pristatymas),
      sumaBePvm: fmt(sumaBePvm),
      pvmSuma: fmt(pvmSuma),
      sumaSuPvm: fmt(sumaSuPvm),
    };
  };
  const sumos = calculateSums();
  const nuolaidaNum = parseLocale(invoiceData.nuolaida);
  const pristatymasNum = parseLocale(invoiceData.pristatymoMokestis);
  const hasDiscount = nuolaidaNum > 0;
  const hasDelivery = pristatymasNum > 0;
  const currencySymbol = getCurrencySymbol(invoiceData.valiuta);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const isVatApplied = invoiceData.pvmTipas === 'taikoma';
  const priceLabel = isVatApplied ? 'Kaina be PVM' : 'Kaina';
  const sumLabel = isVatApplied ? 'Suma be PVM' : 'Suma';

  return (
    <>
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
        <Helmet>
          <title>Nemokamas sąskaitos-faktūros generatorius – DokSkenas</title>
          <meta
            name="description"
            content="Nemokamai sugeneruokite gražią PDF sąskaitą-faktūrą, suvedę reikiamus duomenis. Rinkitės iš kelių skirtingų šablonų."
          />
        </Helmet>
        <Paper
          sx={{
            p: { xs: 2, md: 3 },
            borderRadius: 4,
            '& .MuiOutlinedInput-root': { backgroundColor: '#fff' },
          }}
        >
          <Typography variant="h1" gutterBottom sx={{ color: palette.primary, fontWeight: 500, fontSize: 24 }}>
            Sąskaitos faktūros generatorius
          </Typography>

          {/* Logo */}
          <Box sx={{ ...sectionSx, mb: 3 }}>
            <Typography sx={titleSx}>Logotipas</Typography>
            <Box
              onDrop={handleLogoDrop}
              onDragOver={(e) => {
                e.preventDefault();
                if (!isDragging) setIsDragging(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                if (e.currentTarget === e.target) setIsDragging(false);
              }}
              sx={{
                border: isDragging ? `2px dashed ${palette.primary}` : '2px dashed #ddd',
                borderRadius: 3,
                textAlign: 'center',
                p: 3,
              }}
            >
              <input accept="image/*" type="file" onChange={handleLogoUpload} id="logo-upload" style={{ display: 'none' }} />
              {!logo ? (
                <label htmlFor="logo-upload" style={{ display: 'block', cursor: 'pointer' }}>
                  <Typography>📁 Įkelti logotipą (PNG, JPG)</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                    Arba tempkite failą čia
                  </Typography>
                </label>
              ) : (
                <Box sx={{ mt: 2, position: 'relative', display: 'inline-block' }}>
                  <img src={logo} alt="Logo" style={{ maxHeight: 100 }} />
                  <IconButton
                    onClick={() => setLogo(null)}
                    sx={{ position: 'absolute', top: -10, right: -10, backgroundColor: '#fff' }}
                    size="small"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              )}
            </Box>
          </Box>

          {/* Buyer / Seller */}
          <Grid2 container spacing={2} sx={{ mb: 3 }}>
            <Grid2 size={{ xs: 12, md: 6 }}>
              <Box sx={{ ...sectionSx, height: '100%' }}>
                <Typography sx={{ ...titleSx, color: '#dc004e' }}>PIRKĖJAS</Typography>
                <Grid2 container spacing={1.5}>
                  <Grid2 size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      label="Pavadinimas"
                      value={invoiceData.buyer.pavadinimas}
                      onChange={(e) => updateField('buyer', 'pavadinimas', e.target.value)}
                    />
                  </Grid2>
                  <Grid2 size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      label="Įmonės kodas"
                      value={invoiceData.buyer.imonesKodas}
                      onChange={(e) => updateField('buyer', 'imonesKodas', e.target.value)}
                    />
                  </Grid2>
                  <Grid2 size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      label="PVM kodas"
                      value={invoiceData.buyer.pvmKodas}
                      onChange={(e) => updateField('buyer', 'pvmKodas', e.target.value)}
                    />
                  </Grid2>
                  <Grid2 size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      label="Adresas"
                      multiline
                      rows={2}
                      value={invoiceData.buyer.adresas}
                      onChange={(e) => updateField('buyer', 'adresas', e.target.value)}
                    />
                  </Grid2>
                  <Grid2 size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      label="Telefonas"
                      placeholder="+370..."
                      value={invoiceData.buyer.telefonas}
                      onChange={(e) => {
                        let v = e.target.value;
                        if (!v.startsWith('+')) v = '+' + v.replace(/\+/g, '');
                        v = '+' + v.slice(1).replace(/\D/g, '');
                        updateField('buyer', 'telefonas', v);
                      }}
                    />
                  </Grid2>
                  <Grid2 size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      label="Banko pavadinimas"
                      value={invoiceData.buyer.bankoPavadinimas}
                      onChange={(e) => updateField('buyer', 'bankoPavadinimas', e.target.value)}
                    />
                  </Grid2>
                  <Grid2 size={{ xs: 12, sm: 8 }}>
                    <TextField
                      fullWidth
                      label="IBAN"
                      value={invoiceData.buyer.iban}
                      onChange={(e) => updateField('buyer', 'iban', e.target.value)}
                    />
                  </Grid2>
                  <Grid2 size={{ xs: 12, sm: 4 }}>
                    <TextField
                      fullWidth
                      label="SWIFT"
                      value={invoiceData.buyer.swift}
                      onChange={(e) => updateField('buyer', 'swift', e.target.value)}
                    />
                  </Grid2>
                </Grid2>
              </Box>
            </Grid2>

            <Grid2 size={{ xs: 12, md: 6 }}>
              <Box sx={{ ...sectionSx, height: '100%' }}>
                <Typography sx={{ ...titleSx, color: palette.primary }}>PARDAVĖJAS</Typography>
                <Grid2 container spacing={1.5}>
                  <Grid2 size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      label="Pavadinimas"
                      value={invoiceData.seller.pavadinimas}
                      onChange={(e) => updateField('seller', 'pavadinimas', e.target.value)}
                    />
                  </Grid2>
                  <Grid2 size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      label="Įmonės kodas"
                      value={invoiceData.seller.imonesKodas}
                      onChange={(e) => updateField('seller', 'imonesKodas', e.target.value)}
                    />
                  </Grid2>
                  <Grid2 size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      label="PVM kodas"
                      value={invoiceData.seller.pvmKodas}
                      onChange={(e) => updateField('seller', 'pvmKodas', e.target.value)}
                    />
                  </Grid2>
                  <Grid2 size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      label="Adresas"
                      multiline
                      rows={2}
                      value={invoiceData.seller.adresas}
                      onChange={(e) => updateField('seller', 'adresas', e.target.value)}
                    />
                  </Grid2>
                  <Grid2 size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      label="Telefonas"
                      placeholder="+370..."
                      value={invoiceData.seller.telefonas}
                      onChange={(e) => {
                        let v = e.target.value;
                        if (!v.startsWith('+')) v = '+' + v.replace(/\+/g, '');
                        v = '+' + v.slice(1).replace(/\D/g, '');
                        updateField('seller', 'telefonas', v);
                      }}
                    />
                  </Grid2>
                  <Grid2 size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      label="Banko pavadinimas"
                      value={invoiceData.seller.bankoPavadinimas}
                      onChange={(e) => updateField('seller', 'bankoPavadinimas', e.target.value)}
                    />
                  </Grid2>
                  <Grid2 size={{ xs: 12, sm: 8 }}>
                    <TextField
                      fullWidth
                      label="IBAN"
                      value={invoiceData.seller.iban}
                      onChange={(e) => updateField('seller', 'iban', e.target.value)}
                    />
                  </Grid2>
                  <Grid2 size={{ xs: 12, sm: 4 }}>
                    <TextField
                      fullWidth
                      label="SWIFT"
                      value={invoiceData.seller.swift}
                      onChange={(e) => updateField('seller', 'swift', e.target.value)}
                    />
                  </Grid2>
                </Grid2>
              </Box>
            </Grid2>
          </Grid2>

          {/* Invoice info */}
          <Box sx={{ ...sectionSx, mb: 3 }}>
            <Typography sx={titleSx}>Sąskaitos informacija</Typography>
            <Grid2 container spacing={1.5}>
              <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="Sąskaitos data"
                  type="date"
                  value={invoiceData.saskaitosData}
                  onChange={(e) => updateRootField('saskaitosData', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid2>
              <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="Mokėti iki"
                  type="date"
                  value={invoiceData.moketiIki}
                  onChange={(e) => updateRootField('moketiIki', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid2>
              <Grid2 size={{ xs: 12, sm: 4, md: 2 }}>
                <TextField
                  fullWidth
                  label="Serija"
                  value={invoiceData.saskaitosSerija}
                  onChange={(e) => updateRootField('saskaitosSerija', e.target.value)}
                />
              </Grid2>
              <Grid2 size={{ xs: 12, sm: 4, md: 2 }}>
                <TextField
                  fullWidth
                  label="Numeris"
                  value={invoiceData.saskaitosNumeris}
                  onChange={(e) => updateRootField('saskaitosNumeris', e.target.value)}
                />
              </Grid2>
              <Grid2 size={{ xs: 12, sm: 4, md: 2 }}>
                <TextField
                  fullWidth
                  label="Užsakymo Nr."
                  value={invoiceData.uzsakymoNumeris}
                  onChange={(e) => updateRootField('uzsakymoNumeris', e.target.value)}
                />
              </Grid2>
              <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  select
                  label="Valiuta"
                  value={invoiceData.valiuta}
                  onChange={(e) => updateRootField('valiuta', e.target.value)}
                >
                  <MenuItem value="EUR">EUR (€)</MenuItem>
                  <MenuItem value="USD">USD ($)</MenuItem>
                  <MenuItem value="GBP">GBP (£)</MenuItem>
                  <MenuItem value="PLN">PLN (zł)</MenuItem>
                  <MenuItem value="JPY">JPY (¥)</MenuItem>
                  <MenuItem value="CNY">CNY (¥)</MenuItem>
                  <MenuItem value="KRW">KRW (₩)</MenuItem>
                  <MenuItem value="INR">INR (₹)</MenuItem>
                  <MenuItem value="TRY">TRY (₺)</MenuItem>
                  <MenuItem value="VND">VND (₫)</MenuItem>
                  <MenuItem value="ILS">ILS (₪)</MenuItem>
                  <MenuItem value="PHP">PHP (₱)</MenuItem>
                  <MenuItem value="NGN">NGN (₦)</MenuItem>
                  <MenuItem value="CRC">CRC (₡)</MenuItem>
                  <MenuItem value="PYG">PYG (₲)</MenuItem>
                  <MenuItem value="LAK">LAK (₭)</MenuItem>
                  <MenuItem value="GHS">GHS (₵)</MenuItem>
                  <MenuItem value="KZT">KZT (₸)</MenuItem>
                  <MenuItem value="AZN">AZN (₼)</MenuItem>
                  <MenuItem value="UAH">UAH (₴)</MenuItem>
                  <MenuItem value="RUB">RUB (₽)</MenuItem>
                  <MenuItem value="BRL">BRL (R$)</MenuItem>
                  <MenuItem value="AUD">AUD (A$)</MenuItem>
                  <MenuItem value="CAD">CAD (C$)</MenuItem>
                  <MenuItem value="NZD">NZD (NZ$)</MenuItem>
                  <MenuItem value="HKD">HKD (HK$)</MenuItem>
                  <MenuItem value="SGD">SGD (S$)</MenuItem>
                  <MenuItem value="TWD">TWD (NT$)</MenuItem>
                  <MenuItem value="MXN">MXN (Mex$)</MenuItem>
                  <MenuItem value="CZK">CZK (Kč)</MenuItem>
                  <MenuItem value="BGN">BGN (лв)</MenuItem>
                  <MenuItem value="ZAR">ZAR (R)</MenuItem>
                  <MenuItem value="CHF">CHF</MenuItem>
                  <MenuItem value="SEK">SEK (kr)</MenuItem>
                  <MenuItem value="NOK">NOK (kr)</MenuItem>
                  <MenuItem value="DKK">DKK (kr)</MenuItem>
                  <MenuItem value="ISK">ISK (kr)</MenuItem>
                </TextField>
              </Grid2>
            </Grid2>
          </Box>

          {/* Lines */}
          <Box sx={{ ...sectionSx, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography sx={{ ...titleSx, mb: 0 }}>Prekės / Paslaugos</Typography>
              <Button startIcon={<AddIcon />} onClick={addEilute} variant="contained">
                Pridėti eilutę
              </Button>
            </Box>

            {isMobile && (
              <Stack spacing={1.5}>
                {invoiceData.eilutes.map((eilute, index) => {
                  const lineSum = fmt(parseLocale(eilute.kiekis) * parseLocale(eilute.kainaBePvm));
                  return (
                    <Paper
                      key={index}
                      variant="outlined"
                      sx={{ p: 1.5, borderRadius: 2, borderColor: palette.border, background: '#fff' }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography fontWeight={700}>Eilutė #{index + 1}</Typography>
                        <IconButton
                          size="small"
                          onClick={() => removeEilute(index)}
                          disabled={invoiceData.eilutes.length === 1}
                          aria-label="Delete row"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>

                      <Grid2 container spacing={1}>
                        <Grid2 size={{ xs: 12 }}>
                          <TextField
                            size="small"
                            fullWidth
                            label="Pavadinimas"
                            value={eilute.pavadinimas}
                            onChange={(e) => updateEilute(index, 'pavadinimas', e.target.value)}
                          />
                        </Grid2>

                        <Grid2 size={{ xs: 12 }}>
                          <TextField
                            size="small"
                            fullWidth
                            label="Kodas"
                            value={eilute.kodas}
                            onChange={(e) => updateEilute(index, 'kodas', e.target.value)}
                          />
                        </Grid2>

                        <Grid2 size={{ xs: 12 }}>
                          <TextField
                            size="small"
                            fullWidth
                            label="Barkodas"
                            value={eilute.barkodas}
                            onChange={(e) => updateEilute(index, 'barkodas', e.target.value)}
                          />
                        </Grid2>

                        <Grid2 size={{ xs: 6 }}>
                          <TextField
                            size="small"
                            fullWidth
                            label="Kiekis"
                            type="text"
                            inputProps={{ inputMode: 'decimal', pattern: '[0-9,]*' }}
                            value={eilute.kiekis ?? ''}
                            onFocus={() => {
                              if (eilute.kiekis === '0') updateEilute(index, 'kiekis', '');
                            }}
                            onChange={(e) => {
                              let v = e.target.value.replace('.', ',');
                              if (!allowDec(v)) return;
                              updateEilute(index, 'kiekis', stripLeadingZeros(v));
                            }}
                          />
                        </Grid2>

                        <Grid2 size={{ xs: 6 }}>
                          <TextField
                            size="small"
                            fullWidth
                            label="Mato vnt."
                            value={eilute.matoVnt}
                            onChange={(e) => updateEilute(index, 'matoVnt', e.target.value)}
                          />
                        </Grid2>

                        <Grid2 size={{ xs: 12 }}>
                          <TextField
                            size="small"
                            fullWidth
                            label={priceLabel}
                            type="text"
                            inputProps={{ inputMode: 'decimal', pattern: '[0-9,]*' }}
                            value={eilute.kainaBePvm ?? ''}
                            onFocus={() => {
                              if (eilute.kainaBePvm === '0') updateEilute(index, 'kainaBePvm', '');
                            }}
                            onChange={(e) => {
                              let v = e.target.value.replace('.', ',');
                              if (!allowDec(v)) return;
                              updateEilute(index, 'kainaBePvm', stripLeadingZeros(v));
                            }}
                          />
                        </Grid2>

                        <Grid2 size={{ xs: 12 }}>
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              p: 1,
                              borderRadius: 1.5,
                              border: `1px dashed ${palette.border}`,
                              background: palette.bgSection,
                            }}
                          >
                            <Typography fontSize={14}>{sumLabel}</Typography>
                            <Typography fontWeight={800}>
                              {lineSum} {currencySymbol}
                            </Typography>
                          </Box>
                        </Grid2>
                      </Grid2>
                    </Paper>
                  );
                })}
              </Stack>
            )}

            {!isMobile && (
              <TableContainer sx={{ overflow: 'visible' }}>
                <Table size="small" sx={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                  <TableHead>
                    <TableRow
                      sx={{
                        '& th': {
                          background: palette.primary,
                          color: '#fff',
                          py: 1.4,
                          fontSize: 12,
                          borderBottom: 'none',
                        },
                        '& th:first-of-type': { borderTopLeftRadius: 10 },
                        '& th:last-of-type': { borderTopRightRadius: 10 },
                      }}
                    >
                      <TableCell>Pavadinimas</TableCell>
                      <TableCell>Kodas</TableCell>
                      <TableCell>Barkodas</TableCell>
                      <TableCell>Kiekis</TableCell>
                      <TableCell>Mato vnt.</TableCell>
                      <TableCell>{priceLabel}</TableCell>
                      <TableCell>{sumLabel}</TableCell>
                      <TableCell />
                    </TableRow>

                    <TableRow>
                      <TableCell colSpan={8} sx={{ p: 0, height: 10, background: 'transparent', borderBottom: 'none' }} />
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {invoiceData.eilutes.map((eilute, index) => (
                      <TableRow key={index} sx={{ '& td': { borderBottom: `1px solid ${palette.border}` } }}>
                        <TableCell sx={{ minWidth: 180 }}>
                          <TextField
                            size="small"
                            value={eilute.pavadinimas}
                            onChange={(e) => updateEilute(index, 'pavadinimas', e.target.value)}
                            fullWidth
                          />
                        </TableCell>

                        <TableCell sx={{ minWidth: 120 }}>
                          <TextField
                            size="small"
                            value={eilute.kodas}
                            onChange={(e) => updateEilute(index, 'kodas', e.target.value)}
                            fullWidth
                          />
                        </TableCell>

                        <TableCell sx={{ minWidth: 160 }}>
                          <TextField
                            size="small"
                            value={eilute.barkodas}
                            onChange={(e) => updateEilute(index, 'barkodas', e.target.value)}
                            fullWidth
                          />
                        </TableCell>

                        <TableCell sx={{ minWidth: 100 }}>
                          <TextField
                            size="small"
                            type="text"
                            inputProps={{ inputMode: 'decimal', pattern: '[0-9,]*' }}
                            value={eilute.kiekis ?? ''}
                            onFocus={() => {
                              if (eilute.kiekis === '0') updateEilute(index, 'kiekis', '');
                            }}
                            onChange={(e) => {
                              let v = e.target.value.replace('.', ',');
                              if (!allowDec(v)) return;
                              updateEilute(index, 'kiekis', stripLeadingZeros(v));
                            }}
                            fullWidth
                          />
                        </TableCell>

                        <TableCell sx={{ minWidth: 100 }}>
                          <TextField
                            size="small"
                            value={eilute.matoVnt}
                            onChange={(e) => updateEilute(index, 'matoVnt', e.target.value)}
                            fullWidth
                          />
                        </TableCell>

                        <TableCell sx={{ minWidth: 140 }}>
                          <TextField
                            size="small"
                            type="text"
                            inputProps={{ inputMode: 'decimal', pattern: '[0-9,]*' }}
                            value={eilute.kainaBePvm ?? ''}
                            onFocus={() => {
                              if (eilute.kainaBePvm === '0') updateEilute(index, 'kainaBePvm', '');
                            }}
                            onChange={(e) => {
                              let v = e.target.value.replace('.', ',');
                              if (!allowDec(v)) return;
                              updateEilute(index, 'kainaBePvm', stripLeadingZeros(v));
                            }}
                            fullWidth
                          />
                        </TableCell>

                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {fmt(parseLocale(eilute.kiekis) * parseLocale(eilute.kainaBePvm))} {currencySymbol}
                        </TableCell>

                        <TableCell align="center" width={56}>
                          <IconButton
                            size="small"
                            onClick={() => removeEilute(index)}
                            disabled={invoiceData.eilutes.length === 1}
                            aria-label="Delete row"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>

          {/* Totals */}
          <Box sx={{ ...sectionSx }}>
            <Typography sx={titleSx}>Sumos</Typography>

            <Grid2 container spacing={1.5} sx={{ mb: 2 }}>
              <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="Nuolaida"
                  type="text"
                  inputProps={{ inputMode: 'decimal', pattern: '[0-9,]*' }}
                  value={invoiceData.nuolaida}
                  onFocus={() => {
                    if (invoiceData.nuolaida === '0') updateRootField('nuolaida', '');
                  }}
                  onChange={(e) => {
                    let v = e.target.value;
                    v = v.replace('.', ',');
                    if (!allowDec(v)) return;
                    updateRootField('nuolaida', stripLeadingZeros(v));
                  }}
                  InputProps={{ endAdornment: <InputAdornment position="end">{currencySymbol}</InputAdornment> }}
                />
              </Grid2>

              <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="Pristatymo mokestis"
                  type="text"
                  inputProps={{ inputMode: 'decimal', pattern: '[0-9,]*' }}
                  value={invoiceData.pristatymoMokestis}
                  onFocus={() => {
                    if (invoiceData.pristatymoMokestis === '0') updateRootField('pristatymoMokestis', '');
                  }}
                  onChange={(e) => {
                    let v = e.target.value;
                    v = v.replace('.', ',');
                    if (!allowDec(v)) return;
                    updateRootField('pristatymoMokestis', stripLeadingZeros(v));
                  }}
                  InputProps={{ endAdornment: <InputAdornment position="end">{currencySymbol}</InputAdornment> }}
                />
              </Grid2>

              <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  select
                  label="PVM"
                  value={invoiceData.pvmTipas}
                  onChange={(e) => updateRootField('pvmTipas', e.target.value)}
                >
                  <MenuItem value="taikoma">Taikoma</MenuItem>
                  <MenuItem value="netaikoma">Netaikoma</MenuItem>
                </TextField>
              </Grid2>

              {invoiceData.pvmTipas === 'taikoma' && (
                <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                  <TextField
                    fullWidth
                    label="PVM %"
                    type="text"
                    inputProps={{ inputMode: 'decimal', pattern: '[0-9,]*' }}
                    value={invoiceData.pvmProcent}
                    onFocus={() => {
                      if (invoiceData.pvmProcent === '0') updateRootField('pvmProcent', '');
                    }}
                    onChange={(e) => {
                      let v = e.target.value;
                      v = v.replace('.', ',');
                      if (!allowDec(v)) return;
                      updateRootField('pvmProcent', stripLeadingZeros(v));
                    }}
                    InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                  />
                </Grid2>
              )}
            </Grid2>

            <Divider sx={{ my: 2 }} />

            {invoiceData.pvmTipas === 'taikoma' ? (
              <Box
                sx={{
                  ml: 'auto',
                  maxWidth: 420,
                  background: '#fff',
                  p: 2,
                  borderRadius: 2,
                  border: `1px solid ${palette.border}`,
                }}
              >
                {(hasDiscount || hasDelivery) && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                    <Typography>Tarpinė suma:</Typography>
                    <Typography fontWeight={700}>
                      {sumos.tarpineSuma} {currencySymbol}
                    </Typography>
                  </Box>
                )}

                {hasDiscount && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                    <Typography>Nuolaida:</Typography>
                    <Typography fontWeight={700}>
                      -{sumos.nuolaida} {currencySymbol}
                    </Typography>
                  </Box>
                )}

                {hasDelivery && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                    <Typography>Pristatymo mokestis:</Typography>
                    <Typography fontWeight={700}>
                      +{sumos.pristatymoMokestis} {currencySymbol}
                    </Typography>
                  </Box>
                )}

                <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                  <Typography>Suma be PVM:</Typography>
                  <Typography fontWeight={700}>
                    {sumos.sumaBePvm} {currencySymbol}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                  <Typography>PVM {parseLocale(invoiceData.pvmProcent)}%:</Typography>
                  <Typography fontWeight={700}>
                    {sumos.pvmSuma} {currencySymbol}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, pt: 1, borderTop: '2px solid #333' }}>
                  <Typography fontWeight={800}>SUMA SU PVM:</Typography>
                  <Typography fontWeight={800} sx={{ color: palette.primary }}>
                    {sumos.sumaSuPvm} {currencySymbol}
                  </Typography>
                </Box>
              </Box>
            ) : (
              <Box
                sx={{
                  ml: 'auto',
                  maxWidth: 420,
                  background: '#fff',
                  p: 2,
                  borderRadius: 2,
                  border: `1px solid ${palette.border}`,
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                  <Typography>Tarpinė suma:</Typography>
                  <Typography fontWeight={700}>
                    {sumos.tarpineSuma} {currencySymbol}
                  </Typography>
                </Box>

                {hasDiscount && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                    <Typography>Nuolaida:</Typography>
                    <Typography fontWeight={700}>
                      -{sumos.nuolaida} {currencySymbol}
                    </Typography>
                  </Box>
                )}

                {hasDelivery && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                    <Typography>Pristatymo mokestis:</Typography>
                    <Typography fontWeight={700}>
                      +{sumos.pristatymoMokestis} {currencySymbol}
                    </Typography>
                  </Box>
                )}

                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, pt: 1, borderTop: '2px solid #333' }}>
                  <Typography fontWeight={800}>BENDRA SUMA:</Typography>
                  <Typography fontWeight={800} sx={{ color: palette.primary }}>
                    {sumos.sumaBePvm} {currencySymbol}
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>

          {/* Download */}
          <Box sx={{ textAlign: 'center', mt: 3 }}>
            <PDFDownloadLink
              document={<InvoicePDF data={invoiceData} logo={logo} sumos={sumos} />}
              fileName={`saskaita-${invoiceData.saskaitosSerija}${invoiceData.saskaitosNumeris}.pdf`}
              style={{ textDecoration: 'none' }}
            >
              {({ loading }) => (
                <Button variant="contained" size="large" startIcon={<DownloadIcon />} disabled={loading}>
                  {loading ? 'Generuojama...' : 'Atsisiųsti PDF'}
                </Button>
              )}
            </PDFDownloadLink>
          </Box>

          {/* Ad Section */}
          <AdSection onOpenVideo={() => setVideoOpen(true)} />
        </Paper>
      </Box>

      {/* Video Modal */}
      <Dialog
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { backgroundColor: 'transparent', boxShadow: 'none' },
        }}
      >
        <DialogContent sx={{ p: 0, position: 'relative' }}>
          <IconButton
            onClick={() => setVideoOpen(false)}
            sx={{
              position: 'absolute',
              top: -40,
              right: 0,
              color: '#fff',
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
            }}
          >
            <CloseIcon />
          </IconButton>
          <Box
            component="iframe"
            src="https://www.youtube.com/embed/ByViuilYxZA?autoplay=1"
            title="DokSkenas demo"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            sx={{
              width: '100%',
              aspectRatio: '16/9',
              border: 'none',
              borderRadius: 2,
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Content Section */}
      <InvoiceGeneratorInfo />
    </>
  );
};

// Content Component
function InvoiceGeneratorInfo() {
  return (
    <Container maxWidth="md" sx={{ mt: 8, mb: 10 }}>
      {/* Nemokamas sąskaitų išrašymas */}
      <Typography
        variant="h2"
        sx={{
          mt: 5,
          mb: 2,
          fontSize: { xs: '20px', sm: '26px' },
          fontFamily: 'Helvetica',
          fontWeight: 'bold',
          color: '#000',
        }}
      >
        Nemokamas sąskaitų išrašymas
      </Typography>

      <Box sx={{ lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
        <Typography sx={{ mb: 2 }}>
          Sugeneruokite profesionalią sąskaitą faktūrą vos keliais paspaudimais. Mūsų įrankis sukurtas tiems,
          kuriems reikia paprasto, greito ir nemokamo sąskaitų išrašymo.
        </Typography>
        <Typography sx={{ mb: 2 }}>
          Tiesiog suveskite reikiamus duomenis, įkelkite logotipą (jei reikia) ir spauskite generuoti PDF.
          Jūsų sąskaita faktūra automatiškai susigeneruos ir parsisiųs į jūsų kompiuterį ar mobilųjį telefoną.
        </Typography>
      </Box>

      {/* Kam skirtas įrankis? */}
      <Typography
        variant="h2"
        sx={{
          mt: 5,
          mb: 2,
          fontSize: { xs: '20px', sm: '26px' },
          fontFamily: 'Helvetica',
          fontWeight: 'bold',
          color: '#000',
        }}
      >
        Kam skirtas įrankis?
      </Typography>

      <Box sx={{ lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
        <Typography sx={{ mb: 2 }}>
          Mūsų online sąskaitos faktūros generatorius, tinka tiek individualiai dirbantiems asmenims, tiek mažoms
          įmonėms, freelanceriams ir visiems, kuriems reikia greitai išrašyti tvarkingą PVM ar ne PVM sąskaitą.
        </Typography>
        <Typography sx={{ mb: 2 }}>
          Pagrindinis privalumas – paprastumas: įrankis yra greitas, visiškai nemokamas ir generuoja profesionalų
          PDF, kurį galite siųsti savo klientams.
        </Typography>
      </Box>

      {/* Kaip tai veikia? */}
      <Typography
        variant="h2"
        sx={{
          mt: 5,
          mb: 2,
          fontSize: { xs: '20px', sm: '26px' },
          fontFamily: 'Helvetica',
          fontWeight: 'bold',
          color: '#000',
        }}
      >
        Kaip tai veikia?
      </Typography>

      <Box component="ul" sx={{ pl: 3, lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
        <li>Užpildykite reikiamus laukus: pardavėją, pirkėją, sąskaitos duomenis, eilutes su prekėmis ar paslaugomis</li>
        <li>Pridėkite savo logotipą (jei reikia)</li>
        <li>Patikrinkite suvestą informaciją</li>
        <li>Atsisiųskite sugeneruotą PDF sąskaitą faktūrą</li>
      </Box>

      {/* Sąskaitos faktūros šablono privalumai */}
      <Typography
        variant="h2"
        sx={{
          mt: 5,
          mb: 2,
          fontSize: { xs: '20px', sm: '26px' },
          fontFamily: 'Helvetica',
          fontWeight: 'bold',
          color: '#000',
        }}
      >
        Sąskaitos faktūros šablono privalumai
      </Typography>

      <Box component="ul" sx={{ pl: 3, lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
        <li>Rinkitės tarp PVM ir ne PVM sąskaitos šablonų</li>
        <li>Automatinis sumų ir PVM apskaičiavimas</li>
        <li>Palaikymo daugiau nei 30 valiutų</li>
        <li>Galimybė pridėti savo logotipą</li>
        <li>Automatiškai generuoja sumą žodžiais lietuvių kalba</li>
        <li>Puikiai tinka Lietuvos įmonėms, mažosioms bendrijoms ir individualioms veikloms</li>
      </Box>

      {/* Derinkite su DokSkenu */}
      <Typography
        variant="h2"
        sx={{
          mt: 5,
          mb: 2,
          fontSize: { xs: '20px', sm: '26px' },
          fontFamily: 'Helvetica',
          fontWeight: 'bold',
          color: '#000',
        }}
      >
        Derinkite su DokSkenu
      </Typography>

      <Box sx={{ lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
        <Typography sx={{ mb: 2 }}>
          Jei pavargote sąskaitas į apskaitos programą vesti ranka, išbandykite DokSkeną. Skaitmenizuoja sumiškai ir
          detaliai su eilutėmis. Nuskaitytus duomenis galėsite importuoti į savo apskaitos programą.
        </Typography>
        <Typography sx={{ mb: 2 }}>
          Integruojamos apskaitos programos:
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 0.5,
            maxWidth: 500,
            mb: 2,
          }}
        >
          {[
            { name: "Finvalda", href: null },
            { name: "Rivilė GAMA", href: 'https://atlyginimoskaiciuokle.com/rivile' },
            { name: "Rivilė ERP", href: 'https://atlyginimoskaiciuokle.com/rivile' },
            { name: "Agnum", href: null },
            { name: "Centas", href: null },
            { name: "Apskaita5", href: null },
            { name: "Pragma 3.2", href: null },
            { name: "Pragma 4", href: null },
            { name: "Būtenta", href: null },
            { name: "Site.pro", href: null },
            { name: "Debetas", href: null },
            { name: "APSA", href: null },
            { name: "Paulita", href: null },
            { name: "Optimum", href: null },
            { name: "Dineta", href: null },
            { name: "iSAF", href: null },
          ].map((item) => (
            <Box key={item.name} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.3 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#333', flexShrink: 0 }} />
              {item.href ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#003366',
                    fontSize: '15px',
                    fontFamily: 'Helvetica',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  {item.name}
                </a>
              ) : (
                <Typography sx={{ color: '#000', fontSize: '15px', fontFamily: 'Helvetica' }}>
                  {item.name}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      </Box>

      {/* CTA Button */}
      <Box sx={{ textAlign: 'center', mt: 5 }}>
        <Button
          variant="contained"
          size="large"
          href={`${import.meta.env.VITE_BASE_URL}registruotis`}
          sx={{
            backgroundColor: '#F4B400',
            color: '#000',
            fontWeight: '500',
            fontSize: '16px',
            px: 4,
            py: 1.5,
            textTransform: 'uppercase',
            '&:hover': {
              backgroundColor: '#E5A700',
            },
          }}
        >
          Išbandyti nemokamai
        </Button>
      </Box>
    </Container>
  );
}

export default InvoiceGenerator;




// import { useState } from 'react';
// import { Helmet } from "react-helmet";
// import {
//   Box,
//   Paper,
//   TextField,
//   Button,
//   Typography,
//   IconButton,
//   MenuItem,
//   Divider,
//   Table,
//   TableBody,
//   TableCell,
//   TableContainer,
//   TableHead,
//   TableRow,
//   InputAdornment,
//   Grid2,
//   Stack,
//   useTheme,
//   useMediaQuery,
//   Container,
// } from '@mui/material';
// import { Add as AddIcon, Delete as DeleteIcon, Download as DownloadIcon } from '@mui/icons-material';
// import { PDFDownloadLink } from '@react-pdf/renderer';
// import InvoicePDF from '../page_elements/InvoicePDF';

// // ---- helpers ----
// const parseLocale = (v) => {
//   if (typeof v === 'number') return v;
//   if (!v) return 0;
//   const n = parseFloat(String(v).replace(',', '.'));
//   return Number.isFinite(n) ? n : 0;
// };
// const fmt = (n) => n.toFixed(2).replace('.', ',');
// // Разрешаем только цифры и одну запятую
// const allowDec = (v) => v === '' || /^[0-9]*([,]?[0-9]*)?$/.test(v);
// // Убираем ведущие нули: "045" -> "45". Но оставляем "0", "0,", "0."
// const stripLeadingZeros = (v) => {
//   if (v == null) return '';
//   const s = String(v);
//   if (s === '0' || s === '0,' || s === '0.') return s;
//   return s.replace(/^0+(?=\d)/, '');
// };

// // Currency symbol mapping
// const CURRENCY_SYMBOLS = {
//   'EUR': '€',
//   'USD': '$',
//   'GBP': '£',
//   'PLN': 'zł',
//   'JPY': '¥',
//   'CNY': '¥',
//   'KRW': '₩',
//   'INR': '₹',
//   'TRY': '₺',
//   'VND': '₫',
//   'ILS': '₪',
//   'PHP': '₱',
//   'NGN': '₦',
//   'CRC': '₡',
//   'PYG': '₲',
//   'LAK': '₭',
//   'GHS': '₵',
//   'KZT': '₸',
//   'AZN': '₼',
//   'UAH': '₴',
//   'BRL': 'R$',
//   'RUB': '₽',
//   'AUD': 'A$',
//   'CAD': 'C$',
//   'NZD': 'NZ$',
//   'HKD': 'HK$',
//   'SGD': 'S$',
//   'TWD': 'NT$',
//   'MXN': 'Mex$',
//   'CZK': 'Kč',
//   'BGN': 'лв',
//   'ZAR': 'R',
//   'SEK': 'kr',
//   'NOK': 'kr',
//   'DKK': 'kr',
//   'ISK': 'kr',
// };

// const getCurrencySymbol = (currencyCode) => {
//   return CURRENCY_SYMBOLS[currencyCode] || currencyCode;
// };

// // ---- UI tokens ----
// const palette = {
//   primary: '#1976d2',
//   bgSection: '#fafafa',
//   border: '#e0e0e0',
// };
// const sectionSx = {
//   p: 2.5,
//   backgroundColor: palette.bgSection,
//   borderRadius: 3,
//   border: `1px solid ${palette.border}`,
// };
// const titleSx = {
//   fontSize: 18,
//   fontWeight: 700,
//   mb: 1.5,
//   color: '#333',
// };

// // ---- component ----
// const InvoiceGenerator = () => {
//   const [logo, setLogo] = useState(null);
//   const [isDragging, setIsDragging] = useState(false);

//   const [invoiceData, setInvoiceData] = useState({
//     buyer: {
//       pavadinimas: '',
//       imonesKodas: '',
//       pvmKodas: '',
//       adresas: '',
//       telefonas: '+',
//       bankoPavadinimas: '',
//       iban: '',
//       swift: '',
//     },
//     seller: {
//       pavadinimas: '',
//       imonesKodas: '',
//       pvmKodas: '',
//       adresas: '',
//       telefonas: '+',
//       bankoPavadinimas: '',
//       iban: '',
//       swift: '',
//     },
//     saskaitosData: new Date().toISOString().split('T')[0],
//     moketiIki: '',
//     saskaitosSerija: '',
//     saskaitosNumeris: '',
//     uzsakymoNumeris: '',
//     valiuta: 'EUR',
//     eilutes: [{ pavadinimas: '', kodas: '', barkodas: '', kiekis: '1', matoVnt: 'vnt', kainaBePvm: '0' }],
//     nuolaida: '0',
//     pristatymoMokestis: '0',
//     pvmProcent: '21',
//     pvmTipas: 'taikoma',
//   });

//   // ---- logo ----
//   const handleLogoUpload = (e) => {
//     const file = e.target.files && e.target.files[0];
//     if (!file) return;
//     const reader = new FileReader();
//     reader.onloadend = () => setLogo(reader.result);
//     reader.readAsDataURL(file);
//   };
//   const handleLogoDrop = (e) => {
//     e.preventDefault();
//     setIsDragging(false);
//     const file = e.dataTransfer.files && e.dataTransfer.files[0];
//     if (!file || !file.type.startsWith('image/')) return;
//     const reader = new FileReader();
//     reader.onloadend = () => setLogo(reader.result);
//     reader.readAsDataURL(file);
//   };

//   // ---- state updaters ----
//   const updateField = (section, field, value) => {
//     setInvoiceData((prev) => ({
//       ...prev,
//       [section]: { ...prev[section], [field]: value },
//     }));
//   };
//   const updateRootField = (field, value) => {
//     setInvoiceData((prev) => ({ ...prev, [field]: value }));
//   };
//   const addEilute = () => {
//     setInvoiceData((prev) => ({
//       ...prev,
//       eilutes: [
//         ...prev.eilutes,
//         { pavadinimas: '', kodas: '', barkodas: '', kiekis: '1', matoVnt: 'vnt', kainaBePvm: '0' },
//       ],
//     }));
//   };
//   const removeEilute = (index) => {
//     setInvoiceData((prev) => ({
//       ...prev,
//       eilutes: prev.eilutes.filter((_, i) => i !== index),
//     }));
//   };
//   const updateEilute = (index, field, value) => {
//     setInvoiceData((prev) => ({
//       ...prev,
//       eilutes: prev.eilutes.map((e, i) => (i === index ? { ...e, [field]: value } : e)),
//     }));
//   };

//   // ---- sums ----
//   const calculateSums = () => {
//     const tarpineSuma = invoiceData.eilutes.reduce(
//       (sum, e) => sum + parseLocale(e.kiekis) * parseLocale(e.kainaBePvm),
//       0
//     );
//     const nuolaida = parseLocale(invoiceData.nuolaida);
//     const pristatymas = parseLocale(invoiceData.pristatymoMokestis);
//     const pvmProcent = parseLocale(invoiceData.pvmProcent);

//     const sumaBePvm = tarpineSuma - nuolaida + pristatymas;
//     const pvmSuma = invoiceData.pvmTipas === 'taikoma' ? (sumaBePvm * pvmProcent) / 100 : 0;
//     const sumaSuPvm = sumaBePvm + pvmSuma;

//     return {
//       tarpineSuma: fmt(tarpineSuma),
//       nuolaida: fmt(nuolaida),
//       pristatymoMokestis: fmt(pristatymas),
//       sumaBePvm: fmt(sumaBePvm),
//       pvmSuma: fmt(pvmSuma),
//       sumaSuPvm: fmt(sumaSuPvm),
//     };
//   };
//   const sumos = calculateSums();
//   const nuolaidaNum = parseLocale(invoiceData.nuolaida);
//   const pristatymasNum = parseLocale(invoiceData.pristatymoMokestis);
//   const hasDiscount = nuolaidaNum > 0;
//   const hasDelivery = pristatymasNum > 0;
//   const currencySymbol = getCurrencySymbol(invoiceData.valiuta);

//   const theme = useTheme();
//   const isMobile = useMediaQuery(theme.breakpoints.down('md'));

//   const isVatApplied = invoiceData.pvmTipas === 'taikoma';
//   const priceLabel = isVatApplied ? 'Kaina be PVM' : 'Kaina';
//   const sumLabel = isVatApplied ? 'Suma be PVM' : 'Suma';

//   return (
//     <>
//       <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
//         <Helmet>
//           <title>Nemokamas sąskaitos-faktūros generatorius – DokSkenas</title>
//           <meta
//             name="description"
//             content="Nemokamai sugeneruokite gražią PDF sąskaitą-faktūrą, suvedę reikiamus duomenis. Rinkitės iš kelių skirtingų šablonų."
//           />
//         </Helmet>
//         <Paper
//           sx={{
//             p: { xs: 2, md: 3 },
//             borderRadius: 4,
//             '& .MuiOutlinedInput-root': { backgroundColor: '#fff' },
//           }}
//         >
//           <Typography variant="h1" gutterBottom sx={{ color: palette.primary, fontWeight: 500, fontSize: 24 }}>
//             Sąskaitos faktūros generatorius
//           </Typography>

//           {/* Logo */}
//           <Box sx={{ ...sectionSx, mb: 3 }}>
//             <Typography sx={titleSx}>Logotipas</Typography>
//             <Box
//               onDrop={handleLogoDrop}
//               onDragOver={(e) => {
//                 e.preventDefault();
//                 if (!isDragging) setIsDragging(true);
//               }}
//               onDragEnter={(e) => {
//                 e.preventDefault();
//                 setIsDragging(true);
//               }}
//               onDragLeave={(e) => {
//                 e.preventDefault();
//                 if (e.currentTarget === e.target) setIsDragging(false);
//               }}
//               sx={{
//                 border: isDragging ? `2px dashed ${palette.primary}` : '2px dashed #ddd',
//                 borderRadius: 3,
//                 textAlign: 'center',
//                 p: 3,
//               }}
//             >
//               <input accept="image/*" type="file" onChange={handleLogoUpload} id="logo-upload" style={{ display: 'none' }} />
//               {!logo ? (
//                 <label htmlFor="logo-upload" style={{ display: 'block', cursor: 'pointer' }}>
//                   <Typography>📁 Įkelti logotipą (PNG, JPG)</Typography>
//                   <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
//                     Arba tempkite failą čia
//                   </Typography>
//                 </label>
//               ) : (
//                 <Box sx={{ mt: 2, position: 'relative', display: 'inline-block' }}>
//                   <img src={logo} alt="Logo" style={{ maxHeight: 100 }} />
//                   <IconButton
//                     onClick={() => setLogo(null)}
//                     sx={{ position: 'absolute', top: -10, right: -10, backgroundColor: '#fff' }}
//                     size="small"
//                   >
//                     <DeleteIcon fontSize="small" />
//                   </IconButton>
//                 </Box>
//               )}
//             </Box>
//           </Box>

//           {/* Buyer / Seller */}
//           <Grid2 container spacing={2} sx={{ mb: 3 }}>
//             <Grid2 size={{ xs: 12, md: 6 }}>
//               <Box sx={{ ...sectionSx, height: '100%' }}>
//                 <Typography sx={{ ...titleSx, color: '#dc004e' }}>PIRKĖJAS</Typography>
//                 <Grid2 container spacing={1.5}>
//                   <Grid2 size={{ xs: 12 }}>
//                     <TextField
//                       fullWidth
//                       label="Pavadinimas"
//                       value={invoiceData.buyer.pavadinimas}
//                       onChange={(e) => updateField('buyer', 'pavadinimas', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12, sm: 6 }}>
//                     <TextField
//                       fullWidth
//                       label="Įmonės kodas"
//                       value={invoiceData.buyer.imonesKodas}
//                       onChange={(e) => updateField('buyer', 'imonesKodas', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12, sm: 6 }}>
//                     <TextField
//                       fullWidth
//                       label="PVM kodas"
//                       value={invoiceData.buyer.pvmKodas}
//                       onChange={(e) => updateField('buyer', 'pvmKodas', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12 }}>
//                     <TextField
//                       fullWidth
//                       label="Adresas"
//                       multiline
//                       rows={2}
//                       value={invoiceData.buyer.adresas}
//                       onChange={(e) => updateField('buyer', 'adresas', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12 }}>
//                     <TextField
//                       fullWidth
//                       label="Telefonas"
//                       placeholder="+370..."
//                       value={invoiceData.buyer.telefonas}
//                       onChange={(e) => {
//                         let v = e.target.value;
//                         if (!v.startsWith('+')) v = '+' + v.replace(/\+/g, '');
//                         v = '+' + v.slice(1).replace(/\D/g, '');
//                         updateField('buyer', 'telefonas', v);
//                       }}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12 }}>
//                     <TextField
//                       fullWidth
//                       label="Banko pavadinimas"
//                       value={invoiceData.buyer.bankoPavadinimas}
//                       onChange={(e) => updateField('buyer', 'bankoPavadinimas', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12, sm: 8 }}>
//                     <TextField
//                       fullWidth
//                       label="IBAN"
//                       value={invoiceData.buyer.iban}
//                       onChange={(e) => updateField('buyer', 'iban', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12, sm: 4 }}>
//                     <TextField
//                       fullWidth
//                       label="SWIFT"
//                       value={invoiceData.buyer.swift}
//                       onChange={(e) => updateField('buyer', 'swift', e.target.value)}
//                     />
//                   </Grid2>
//                 </Grid2>
//               </Box>
//             </Grid2>

//             <Grid2 size={{ xs: 12, md: 6 }}>
//               <Box sx={{ ...sectionSx, height: '100%' }}>
//                 <Typography sx={{ ...titleSx, color: palette.primary }}>PARDAVĖJAS</Typography>
//                 <Grid2 container spacing={1.5}>
//                   <Grid2 size={{ xs: 12 }}>
//                     <TextField
//                       fullWidth
//                       label="Pavadinimas"
//                       value={invoiceData.seller.pavadinimas}
//                       onChange={(e) => updateField('seller', 'pavadinimas', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12, sm: 6 }}>
//                     <TextField
//                       fullWidth
//                       label="Įmonės kodas"
//                       value={invoiceData.seller.imonesKodas}
//                       onChange={(e) => updateField('seller', 'imonesKodas', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12, sm: 6 }}>
//                     <TextField
//                       fullWidth
//                       label="PVM kodas"
//                       value={invoiceData.seller.pvmKodas}
//                       onChange={(e) => updateField('seller', 'pvmKodas', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12 }}>
//                     <TextField
//                       fullWidth
//                       label="Adresas"
//                       multiline
//                       rows={2}
//                       value={invoiceData.seller.adresas}
//                       onChange={(e) => updateField('seller', 'adresas', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12 }}>
//                     <TextField
//                       fullWidth
//                       label="Telefonas"
//                       placeholder="+370..."
//                       value={invoiceData.seller.telefonas}
//                       onChange={(e) => {
//                         let v = e.target.value;
//                         if (!v.startsWith('+')) v = '+' + v.replace(/\+/g, '');
//                         v = '+' + v.slice(1).replace(/\D/g, '');
//                         updateField('seller', 'telefonas', v);
//                       }}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12 }}>
//                     <TextField
//                       fullWidth
//                       label="Banko pavadinimas"
//                       value={invoiceData.seller.bankoPavadinimas}
//                       onChange={(e) => updateField('seller', 'bankoPavadinimas', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12, sm: 8 }}>
//                     <TextField
//                       fullWidth
//                       label="IBAN"
//                       value={invoiceData.seller.iban}
//                       onChange={(e) => updateField('seller', 'iban', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12, sm: 4 }}>
//                     <TextField
//                       fullWidth
//                       label="SWIFT"
//                       value={invoiceData.seller.swift}
//                       onChange={(e) => updateField('seller', 'swift', e.target.value)}
//                     />
//                   </Grid2>
//                 </Grid2>
//               </Box>
//             </Grid2>
//           </Grid2>

//           {/* Invoice info */}
//           <Box sx={{ ...sectionSx, mb: 3 }}>
//             <Typography sx={titleSx}>Sąskaitos informacija</Typography>
//             <Grid2 container spacing={1.5}>
//               <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                 <TextField
//                   fullWidth
//                   label="Sąskaitos data"
//                   type="date"
//                   value={invoiceData.saskaitosData}
//                   onChange={(e) => updateRootField('saskaitosData', e.target.value)}
//                   InputLabelProps={{ shrink: true }}
//                 />
//               </Grid2>
//               <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                 <TextField
//                   fullWidth
//                   label="Mokėti iki"
//                   type="date"
//                   value={invoiceData.moketiIki}
//                   onChange={(e) => updateRootField('moketiIki', e.target.value)}
//                   InputLabelProps={{ shrink: true }}
//                 />
//               </Grid2>
//               <Grid2 size={{ xs: 12, sm: 4, md: 2 }}>
//                 <TextField
//                   fullWidth
//                   label="Serija"
//                   value={invoiceData.saskaitosSerija}
//                   onChange={(e) => updateRootField('saskaitosSerija', e.target.value)}
//                 />
//               </Grid2>
//               <Grid2 size={{ xs: 12, sm: 4, md: 2 }}>
//                 <TextField
//                   fullWidth
//                   label="Numeris"
//                   value={invoiceData.saskaitosNumeris}
//                   onChange={(e) => updateRootField('saskaitosNumeris', e.target.value)}
//                 />
//               </Grid2>
//               <Grid2 size={{ xs: 12, sm: 4, md: 2 }}>
//                 <TextField
//                   fullWidth
//                   label="Užsakymo Nr."
//                   value={invoiceData.uzsakymoNumeris}
//                   onChange={(e) => updateRootField('uzsakymoNumeris', e.target.value)}
//                 />
//               </Grid2>
//               <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                 <TextField
//                   fullWidth
//                   select
//                   label="Valiuta"
//                   value={invoiceData.valiuta}
//                   onChange={(e) => updateRootField('valiuta', e.target.value)}
//                 >
//                   <MenuItem value="EUR">EUR (€)</MenuItem>
//                   <MenuItem value="USD">USD ($)</MenuItem>
//                   <MenuItem value="GBP">GBP (£)</MenuItem>
//                   <MenuItem value="PLN">PLN (zł)</MenuItem>
//                   <MenuItem value="JPY">JPY (¥)</MenuItem>
//                   <MenuItem value="CNY">CNY (¥)</MenuItem>
//                   <MenuItem value="KRW">KRW (₩)</MenuItem>
//                   <MenuItem value="INR">INR (₹)</MenuItem>
//                   <MenuItem value="TRY">TRY (₺)</MenuItem>
//                   <MenuItem value="VND">VND (₫)</MenuItem>
//                   <MenuItem value="ILS">ILS (₪)</MenuItem>
//                   <MenuItem value="PHP">PHP (₱)</MenuItem>
//                   <MenuItem value="NGN">NGN (₦)</MenuItem>
//                   <MenuItem value="CRC">CRC (₡)</MenuItem>
//                   <MenuItem value="PYG">PYG (₲)</MenuItem>
//                   <MenuItem value="LAK">LAK (₭)</MenuItem>
//                   <MenuItem value="GHS">GHS (₵)</MenuItem>
//                   <MenuItem value="KZT">KZT (₸)</MenuItem>
//                   <MenuItem value="AZN">AZN (₼)</MenuItem>
//                   <MenuItem value="UAH">UAH (₴)</MenuItem>
//                   <MenuItem value="RUB">RUB (₽)</MenuItem>
//                   <MenuItem value="BRL">BRL (R$)</MenuItem>
//                   <MenuItem value="AUD">AUD (A$)</MenuItem>
//                   <MenuItem value="CAD">CAD (C$)</MenuItem>
//                   <MenuItem value="NZD">NZD (NZ$)</MenuItem>
//                   <MenuItem value="HKD">HKD (HK$)</MenuItem>
//                   <MenuItem value="SGD">SGD (S$)</MenuItem>
//                   <MenuItem value="TWD">TWD (NT$)</MenuItem>
//                   <MenuItem value="MXN">MXN (Mex$)</MenuItem>
//                   <MenuItem value="CZK">CZK (Kč)</MenuItem>
//                   <MenuItem value="BGN">BGN (лв)</MenuItem>
//                   <MenuItem value="ZAR">ZAR (R)</MenuItem>
//                   <MenuItem value="CHF">CHF</MenuItem>
//                   <MenuItem value="SEK">SEK (kr)</MenuItem>
//                   <MenuItem value="NOK">NOK (kr)</MenuItem>
//                   <MenuItem value="DKK">DKK (kr)</MenuItem>
//                   <MenuItem value="ISK">ISK (kr)</MenuItem>
//                 </TextField>
//               </Grid2>
//             </Grid2>
//           </Box>

//           {/* Lines */}
//           <Box sx={{ ...sectionSx, mb: 3 }}>
//             <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
//               <Typography sx={{ ...titleSx, mb: 0 }}>Prekės / Paslaugos</Typography>
//               <Button startIcon={<AddIcon />} onClick={addEilute} variant="contained">
//                 Pridėti eilutę
//               </Button>
//             </Box>

//             {isMobile && (
//               <Stack spacing={1.5}>
//                 {invoiceData.eilutes.map((eilute, index) => {
//                   const lineSum = fmt(parseLocale(eilute.kiekis) * parseLocale(eilute.kainaBePvm));
//                   return (
//                     <Paper
//                       key={index}
//                       variant="outlined"
//                       sx={{ p: 1.5, borderRadius: 2, borderColor: palette.border, background: '#fff' }}
//                     >
//                       <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
//                         <Typography fontWeight={700}>Eilutė #{index + 1}</Typography>
//                         <IconButton
//                           size="small"
//                           onClick={() => removeEilute(index)}
//                           disabled={invoiceData.eilutes.length === 1}
//                           aria-label="Delete row"
//                         >
//                           <DeleteIcon fontSize="small" />
//                         </IconButton>
//                       </Box>

//                       <Grid2 container spacing={1}>
//                         <Grid2 size={{ xs: 12 }}>
//                           <TextField
//                             size="small"
//                             fullWidth
//                             label="Pavadinimas"
//                             value={eilute.pavadinimas}
//                             onChange={(e) => updateEilute(index, 'pavadinimas', e.target.value)}
//                           />
//                         </Grid2>

//                         <Grid2 size={{ xs: 12 }}>
//                           <TextField
//                             size="small"
//                             fullWidth
//                             label="Kodas"
//                             value={eilute.kodas}
//                             onChange={(e) => updateEilute(index, 'kodas', e.target.value)}
//                           />
//                         </Grid2>

//                         <Grid2 size={{ xs: 12 }}>
//                           <TextField
//                             size="small"
//                             fullWidth
//                             label="Barkodas"
//                             value={eilute.barkodas}
//                             onChange={(e) => updateEilute(index, 'barkodas', e.target.value)}
//                           />
//                         </Grid2>

//                         <Grid2 size={{ xs: 6 }}>
//                           <TextField
//                             size="small"
//                             fullWidth
//                             label="Kiekis"
//                             type="text"
//                             inputProps={{ inputMode: 'decimal', pattern: '[0-9,]*' }}
//                             value={eilute.kiekis ?? ''}
//                             onFocus={() => {
//                               if (eilute.kiekis === '0') updateEilute(index, 'kiekis', '');
//                             }}
//                             onChange={(e) => {
//                               let v = e.target.value.replace('.', ',');
//                               if (!allowDec(v)) return;
//                               updateEilute(index, 'kiekis', stripLeadingZeros(v));
//                             }}
//                           />
//                         </Grid2>

//                         <Grid2 size={{ xs: 6 }}>
//                           <TextField
//                             size="small"
//                             fullWidth
//                             label="Mato vnt."
//                             value={eilute.matoVnt}
//                             onChange={(e) => updateEilute(index, 'matoVnt', e.target.value)}
//                           />
//                         </Grid2>

//                         <Grid2 size={{ xs: 12 }}>
//                           <TextField
//                             size="small"
//                             fullWidth
//                             label={priceLabel}
//                             type="text"
//                             inputProps={{ inputMode: 'decimal', pattern: '[0-9,]*' }}
//                             value={eilute.kainaBePvm ?? ''}
//                             onFocus={() => {
//                               if (eilute.kainaBePvm === '0') updateEilute(index, 'kainaBePvm', '');
//                             }}
//                             onChange={(e) => {
//                               let v = e.target.value.replace('.', ',');
//                               if (!allowDec(v)) return;
//                               updateEilute(index, 'kainaBePvm', stripLeadingZeros(v));
//                             }}
//                           />
//                         </Grid2>

//                         <Grid2 size={{ xs: 12 }}>
//                           <Box
//                             sx={{
//                               display: 'flex',
//                               justifyContent: 'space-between',
//                               alignItems: 'center',
//                               p: 1,
//                               borderRadius: 1.5,
//                               border: `1px dashed ${palette.border}`,
//                               background: palette.bgSection,
//                             }}
//                           >
//                             <Typography fontSize={14}>{sumLabel}</Typography>
//                             <Typography fontWeight={800}>
//                               {lineSum} {currencySymbol}
//                             </Typography>
//                           </Box>
//                         </Grid2>
//                       </Grid2>
//                     </Paper>
//                   );
//                 })}
//               </Stack>
//             )}

//             {!isMobile && (
//               <TableContainer sx={{ overflow: 'visible' }}>
//                 <Table size="small" sx={{ borderCollapse: 'separate', borderSpacing: 0 }}>
//                   <TableHead>
//                     <TableRow
//                       sx={{
//                         '& th': {
//                           background: palette.primary,
//                           color: '#fff',
//                           py: 1.4,
//                           fontSize: 12,
//                           borderBottom: 'none',
//                         },
//                         '& th:first-of-type': { borderTopLeftRadius: 10 },
//                         '& th:last-of-type': { borderTopRightRadius: 10 },
//                       }}
//                     >
//                       <TableCell>Pavadinimas</TableCell>
//                       <TableCell>Kodas</TableCell>
//                       <TableCell>Barkodas</TableCell>
//                       <TableCell>Kiekis</TableCell>
//                       <TableCell>Mato vnt.</TableCell>
//                       <TableCell>{priceLabel}</TableCell>
//                       <TableCell>{sumLabel}</TableCell>
//                       <TableCell />
//                     </TableRow>

//                     <TableRow>
//                       <TableCell colSpan={8} sx={{ p: 0, height: 10, background: 'transparent', borderBottom: 'none' }} />
//                     </TableRow>
//                   </TableHead>

//                   <TableBody>
//                     {invoiceData.eilutes.map((eilute, index) => (
//                       <TableRow key={index} sx={{ '& td': { borderBottom: `1px solid ${palette.border}` } }}>
//                         <TableCell sx={{ minWidth: 180 }}>
//                           <TextField
//                             size="small"
//                             value={eilute.pavadinimas}
//                             onChange={(e) => updateEilute(index, 'pavadinimas', e.target.value)}
//                             fullWidth
//                           />
//                         </TableCell>

//                         <TableCell sx={{ minWidth: 120 }}>
//                           <TextField
//                             size="small"
//                             value={eilute.kodas}
//                             onChange={(e) => updateEilute(index, 'kodas', e.target.value)}
//                             fullWidth
//                           />
//                         </TableCell>

//                         <TableCell sx={{ minWidth: 160 }}>
//                           <TextField
//                             size="small"
//                             value={eilute.barkodas}
//                             onChange={(e) => updateEilute(index, 'barkodas', e.target.value)}
//                             fullWidth
//                           />
//                         </TableCell>

//                         <TableCell sx={{ minWidth: 100 }}>
//                           <TextField
//                             size="small"
//                             type="text"
//                             inputProps={{ inputMode: 'decimal', pattern: '[0-9,]*' }}
//                             value={eilute.kiekis ?? ''}
//                             onFocus={() => {
//                               if (eilute.kiekis === '0') updateEilute(index, 'kiekis', '');
//                             }}
//                             onChange={(e) => {
//                               let v = e.target.value.replace('.', ',');
//                               if (!allowDec(v)) return;
//                               updateEilute(index, 'kiekis', stripLeadingZeros(v));
//                             }}
//                             fullWidth
//                           />
//                         </TableCell>

//                         <TableCell sx={{ minWidth: 100 }}>
//                           <TextField
//                             size="small"
//                             value={eilute.matoVnt}
//                             onChange={(e) => updateEilute(index, 'matoVnt', e.target.value)}
//                             fullWidth
//                           />
//                         </TableCell>

//                         <TableCell sx={{ minWidth: 140 }}>
//                           <TextField
//                             size="small"
//                             type="text"
//                             inputProps={{ inputMode: 'decimal', pattern: '[0-9,]*' }}
//                             value={eilute.kainaBePvm ?? ''}
//                             onFocus={() => {
//                               if (eilute.kainaBePvm === '0') updateEilute(index, 'kainaBePvm', '');
//                             }}
//                             onChange={(e) => {
//                               let v = e.target.value.replace('.', ',');
//                               if (!allowDec(v)) return;
//                               updateEilute(index, 'kainaBePvm', stripLeadingZeros(v));
//                             }}
//                             fullWidth
//                           />
//                         </TableCell>

//                         <TableCell sx={{ whiteSpace: 'nowrap' }}>
//                           {fmt(parseLocale(eilute.kiekis) * parseLocale(eilute.kainaBePvm))} {currencySymbol}
//                         </TableCell>

//                         <TableCell align="center" width={56}>
//                           <IconButton
//                             size="small"
//                             onClick={() => removeEilute(index)}
//                             disabled={invoiceData.eilutes.length === 1}
//                             aria-label="Delete row"
//                           >
//                             <DeleteIcon fontSize="small" />
//                           </IconButton>
//                         </TableCell>
//                       </TableRow>
//                     ))}
//                   </TableBody>
//                 </Table>
//               </TableContainer>
//             )}
//           </Box>

//           {/* Totals */}
//           <Box sx={{ ...sectionSx }}>
//             <Typography sx={titleSx}>Sumos</Typography>

//             <Grid2 container spacing={1.5} sx={{ mb: 2 }}>
//               <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                 <TextField
//                   fullWidth
//                   label="Nuolaida"
//                   type="text"
//                   inputProps={{ inputMode: 'decimal', pattern: '[0-9,]*' }}
//                   value={invoiceData.nuolaida}
//                   onFocus={() => {
//                     if (invoiceData.nuolaida === '0') updateRootField('nuolaida', '');
//                   }}
//                   onChange={(e) => {
//                     let v = e.target.value;
//                     v = v.replace('.', ',');
//                     if (!allowDec(v)) return;
//                     updateRootField('nuolaida', stripLeadingZeros(v));
//                   }}
//                   InputProps={{ endAdornment: <InputAdornment position="end">{currencySymbol}</InputAdornment> }}
//                 />
//               </Grid2>

//               <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                 <TextField
//                   fullWidth
//                   label="Pristatymo mokestis"
//                   type="text"
//                   inputProps={{ inputMode: 'decimal', pattern: '[0-9,]*' }}
//                   value={invoiceData.pristatymoMokestis}
//                   onFocus={() => {
//                     if (invoiceData.pristatymoMokestis === '0') updateRootField('pristatymoMokestis', '');
//                   }}
//                   onChange={(e) => {
//                     let v = e.target.value;
//                     v = v.replace('.', ',');
//                     if (!allowDec(v)) return;
//                     updateRootField('pristatymoMokestis', stripLeadingZeros(v));
//                   }}
//                   InputProps={{ endAdornment: <InputAdornment position="end">{currencySymbol}</InputAdornment> }}
//                 />
//               </Grid2>

//               <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                 <TextField
//                   fullWidth
//                   select
//                   label="PVM"
//                   value={invoiceData.pvmTipas}
//                   onChange={(e) => updateRootField('pvmTipas', e.target.value)}
//                 >
//                   <MenuItem value="taikoma">Taikoma</MenuItem>
//                   <MenuItem value="netaikoma">Netaikoma</MenuItem>
//                 </TextField>
//               </Grid2>

//               {invoiceData.pvmTipas === 'taikoma' && (
//                 <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                   <TextField
//                     fullWidth
//                     label="PVM %"
//                     type="text"
//                     inputProps={{ inputMode: 'decimal', pattern: '[0-9,]*' }}
//                     value={invoiceData.pvmProcent}
//                     onFocus={() => {
//                       if (invoiceData.pvmProcent === '0') updateRootField('pvmProcent', '');
//                     }}
//                     onChange={(e) => {
//                       let v = e.target.value;
//                       v = v.replace('.', ',');
//                       if (!allowDec(v)) return;
//                       updateRootField('pvmProcent', stripLeadingZeros(v));
//                     }}
//                     InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
//                   />
//                 </Grid2>
//               )}
//             </Grid2>

//             <Divider sx={{ my: 2 }} />

//             {invoiceData.pvmTipas === 'taikoma' ? (
//               <Box
//                 sx={{
//                   ml: 'auto',
//                   maxWidth: 420,
//                   background: '#fff',
//                   p: 2,
//                   borderRadius: 2,
//                   border: `1px solid ${palette.border}`,
//                 }}
//               >
//                 {(hasDiscount || hasDelivery) && (
//                   <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
//                     <Typography>Tarpinė suma:</Typography>
//                     <Typography fontWeight={700}>
//                       {sumos.tarpineSuma} {currencySymbol}
//                     </Typography>
//                   </Box>
//                 )}

//                 {hasDiscount && (
//                   <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
//                     <Typography>Nuolaida:</Typography>
//                     <Typography fontWeight={700}>
//                       -{sumos.nuolaida} {currencySymbol}
//                     </Typography>
//                   </Box>
//                 )}

//                 {hasDelivery && (
//                   <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
//                     <Typography>Pristatymo mokestis:</Typography>
//                     <Typography fontWeight={700}>
//                       +{sumos.pristatymoMokestis} {currencySymbol}
//                     </Typography>
//                   </Box>
//                 )}

//                 <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
//                   <Typography>Suma be PVM:</Typography>
//                   <Typography fontWeight={700}>
//                     {sumos.sumaBePvm} {currencySymbol}
//                   </Typography>
//                 </Box>

//                 <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
//                   <Typography>PVM {parseLocale(invoiceData.pvmProcent)}%:</Typography>
//                   <Typography fontWeight={700}>
//                     {sumos.pvmSuma} {currencySymbol}
//                   </Typography>
//                 </Box>

//                 <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, pt: 1, borderTop: '2px solid #333' }}>
//                   <Typography fontWeight={800}>SUMA SU PVM:</Typography>
//                   <Typography fontWeight={800} sx={{ color: palette.primary }}>
//                     {sumos.sumaSuPvm} {currencySymbol}
//                   </Typography>
//                 </Box>
//               </Box>
//             ) : (
//               <Box
//                 sx={{
//                   ml: 'auto',
//                   maxWidth: 420,
//                   background: '#fff',
//                   p: 2,
//                   borderRadius: 2,
//                   border: `1px solid ${palette.border}`,
//                 }}
//               >
//                 <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
//                   <Typography>Tarpinė suma:</Typography>
//                   <Typography fontWeight={700}>
//                     {sumos.tarpineSuma} {currencySymbol}
//                   </Typography>
//                 </Box>

//                 {hasDiscount && (
//                   <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
//                     <Typography>Nuolaida:</Typography>
//                     <Typography fontWeight={700}>
//                       -{sumos.nuolaida} {currencySymbol}
//                     </Typography>
//                   </Box>
//                 )}

//                 {hasDelivery && (
//                   <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
//                     <Typography>Pristatymo mokestis:</Typography>
//                     <Typography fontWeight={700}>
//                       +{sumos.pristatymoMokestis} {currencySymbol}
//                     </Typography>
//                   </Box>
//                 )}

//                 <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, pt: 1, borderTop: '2px solid #333' }}>
//                   <Typography fontWeight={800}>BENDRA SUMA:</Typography>
//                   <Typography fontWeight={800} sx={{ color: palette.primary }}>
//                     {sumos.sumaBePvm} {currencySymbol}
//                   </Typography>
//                 </Box>
//               </Box>
//             )}
//           </Box>

//           {/* Download */}
//           <Box sx={{ textAlign: 'center', mt: 3 }}>
//             <PDFDownloadLink
//               document={<InvoicePDF data={invoiceData} logo={logo} sumos={sumos} />}
//               fileName={`saskaita-${invoiceData.saskaitosSerija}${invoiceData.saskaitosNumeris}.pdf`}
//               style={{ textDecoration: 'none' }}
//             >
//               {({ loading }) => (
//                 <Button variant="contained" size="large" startIcon={<DownloadIcon />} disabled={loading}>
//                   {loading ? 'Generuojama...' : 'Atsisiųsti PDF'}
//                 </Button>
//               )}
//             </PDFDownloadLink>
//           </Box>
//         </Paper>
//       </Box>

//       {/* Content Section */}
//       <InvoiceGeneratorInfo />
//     </>
//   );
// };

// // Content Component
// function InvoiceGeneratorInfo() {
//   return (
//     <Container maxWidth="md" sx={{ mt: 8, mb: 10 }}>
//       {/* Nemokamas sąskaitų išrašymas */}
//       <Typography
//         variant="h2"
//         sx={{
//           mt: 5,
//           mb: 2,
//           fontSize: { xs: '20px', sm: '26px' },
//           fontFamily: 'Helvetica',
//           fontWeight: 'bold',
//           color: '#000',
//         }}
//       >
//         Nemokamas sąskaitų išrašymas
//       </Typography>

//       <Box sx={{ lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
//         <Typography sx={{ mb: 2 }}>
//           Sugeneruokite profesionalią sąskaitą faktūrą vos keliais paspaudimais. Mūsų įrankis sukurtas tiems,
//           kuriems reikia paprasto, greito ir nemokamo sąskaitų išrašymo.
//         </Typography>
//         <Typography sx={{ mb: 2 }}>
//           Tiesiog suveskite reikiamus duomenis, įkelkite logotipą (jei reikia) ir spauskite generuoti PDF.
//           Jūsų sąskaita faktūra automatiškai susigeneruos ir parsisiųs į jūsų kompiuterį ar mobilųjį telefoną.
//         </Typography>
//       </Box>

//       {/* Kam skirtas įrankis? */}
//       <Typography
//         variant="h2"
//         sx={{
//           mt: 5,
//           mb: 2,
//           fontSize: { xs: '20px', sm: '26px' },
//           fontFamily: 'Helvetica',
//           fontWeight: 'bold',
//           color: '#000',
//         }}
//       >
//         Kam skirtas įrankis?
//       </Typography>

//       <Box sx={{ lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
//         <Typography sx={{ mb: 2 }}>
//           Mūsų online sąskaitos faktūros generatorius, tinka tiek individualiai dirbantiems asmenims, tiek mažoms
//           įmonėms, freelanceriams ir visiems, kuriems reikia greitai išrašyti tvarkingą PVM ar ne PVM sąskaitą.
//         </Typography>
//         <Typography sx={{ mb: 2 }}>
//           Pagrindinis privalumas – paprastumas: įrankis yra greitas, visiškai nemokamas ir generuoja profesionalų
//           PDF, kurį galite siųsti savo klientams.
//         </Typography>
//       </Box>

//       {/* Kaip tai veikia? */}
//       <Typography
//         variant="h2"
//         sx={{
//           mt: 5,
//           mb: 2,
//           fontSize: { xs: '20px', sm: '26px' },
//           fontFamily: 'Helvetica',
//           fontWeight: 'bold',
//           color: '#000',
//         }}
//       >
//         Kaip tai veikia?
//       </Typography>

//       <Box component="ul" sx={{ pl: 3, lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
//         <li>Užpildykite reikiamus laukus: pardavėją, pirkėją, sąskaitos duomenis, eilutes su prekėmis ar paslaugomis</li>
//         <li>Pridėkite savo logotipą (jei reikia)</li>
//         <li>Patikrinkite suvestą informaciją</li>
//         <li>Atsisiųskite sugeneruotą PDF sąskaitą faktūrą</li>
//       </Box>

//       {/* Sąskaitos faktūros šablono privalumai */}
//       <Typography
//         variant="h2"
//         sx={{
//           mt: 5,
//           mb: 2,
//           fontSize: { xs: '20px', sm: '26px' },
//           fontFamily: 'Helvetica',
//           fontWeight: 'bold',
//           color: '#000',
//         }}
//       >
//         Sąskaitos faktūros šablono privalumai
//       </Typography>

//       <Box component="ul" sx={{ pl: 3, lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
//         <li>Rinkitės tarp PVM ir ne PVM sąskaitos šablonų</li>
//         <li>Automatinis sumų ir PVM apskaičiavimas</li>
//         <li>Palaikymo daugiau nei 30 valiutų</li>
//         <li>Galimybė pridėti savo logotipą</li>
//         <li>Automatiškai generuoja sumą žodžiais lietuvių kalba</li>
//         <li>Puikiai tinka Lietuvos įmonėms, mažosioms bendrijoms ir individualioms veikloms</li>
//       </Box>

//       {/* Derinkite su DokSkenu */}
//       <Typography
//         variant="h2"
//         sx={{
//           mt: 5,
//           mb: 2,
//           fontSize: { xs: '20px', sm: '26px' },
//           fontFamily: 'Helvetica',
//           fontWeight: 'bold',
//           color: '#000',
//         }}
//       >
//         Derinkite su DokSkenu
//       </Typography>

//       <Box sx={{ lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
//         <Typography sx={{ mb: 2 }}>
//           Jei pavargote sąskaitas į apskaitos programą vesti ranka, išbandykite DokSkeną. Skaitmenizuoja sumiškai ir
//           detaliai su eilutėmis. Nuskaitytus duomenis galėsite importuoti į savo apskaitos programą (Rivilę, Centą,
//           Finvaldą ir kitas).
//         </Typography>
//       </Box>

//       {/* CTA Button */}
//       <Box sx={{ textAlign: 'center', mt: 5 }}>
//         <Button
//           variant="contained"
//           size="large"
//           href={`${import.meta.env.VITE_BASE_URL}registruotis`}
//           sx={{
//             backgroundColor: '#F4B400',
//             color: '#000',
//             fontWeight: '500',
//             fontSize: '16px',
//             px: 4,
//             py: 1.5,
//             textTransform: 'uppercase',
//             '&:hover': {
//               backgroundColor: '#E5A700',
//             },
//           }}
//         >
//           Išbandyti nemokamai
//         </Button>
//       </Box>
//     </Container>
//   );
// }

// export default InvoiceGenerator;

