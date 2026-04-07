import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Paper, TextField, Button, Typography, IconButton, MenuItem,
  Divider, InputAdornment, Grid2, Stack, Switch, FormControlLabel,
  ToggleButton, ToggleButtonGroup, Chip, CircularProgress, Snackbar,
  Alert, Dialog, DialogTitle, DialogContent, DialogContentText,
  DialogActions, Autocomplete, Collapse, useTheme, useMediaQuery, Tooltip,
} from '@mui/material';
import {
  Add as AddIcon, Delete as DeleteIcon, Save as SaveIcon,
  Send as SendIcon, CheckCircle as CheckIcon, Cancel as CancelIcon,
  ContentCopy as DuplicateIcon, Receipt as PvmSfIcon,
  ArrowBack as BackIcon, PictureAsPdf as PdfIcon,
  OpenInNew as OpenIcon, Person as PersonIcon,
  Business as BusinessIcon, Edit as EditIcon,
  AutoMode as AutoIcon, Close as CloseIcon,
  CalendarToday as CalendarIcon, Search as SearchIcon,
  KeyboardArrowUp as ArrowUpIcon, KeyboardArrowDown as ArrowDownIcon,
  DragIndicator as DragIcon, Paid as PaidIcon,
  HelpOutline as HelpIcon, Warning as WarningIcon
} from '@mui/icons-material';
import { invoicingApi } from '../api/invoicingApi';
import { api } from '../api/endpoints';
import DateField from '../components/DateField';
import { COUNTRY_OPTIONS } from '../page_elements/Countries';
import PaymentLinkToggle from '../components/PaymentLinkToggle';
import { useInvSubscription } from '../contexts/InvSubscriptionContext';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════
const parseNum = (v) => {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  return parseFloat(String(v).replace(',', '.')) || 0;
};
const fmt2 = (n) => n.toFixed(2).replace('.', ',');
const round2 = (n) => Math.round(n * 100) / 100;
const allowDec = (v) => v === '' || /^[0-9]*[,.]?[0-9]*$/.test(v);
const cleanNum = (v) => {
  if (v == null) return '';
  const s = String(v);
  if (s === '0' || s.startsWith('0,') || s.startsWith('0.')) return s;
  return s.replace(/^0+(?=\d)/, '');
};

const CURRENCY_SYMBOLS = {
  'EUR': '€', 'USD': '$', 'GBP': '£', 'PLN': 'zł', 'JPY': '¥',
  'CNY': '¥', 'KRW': '₩', 'INR': '₹', 'TRY': '₺', 'VND': '₫',
  'ILS': '₪', 'PHP': '₱', 'NGN': '₦', 'CRC': '₡', 'PYG': '₲',
  'LAK': '₭', 'GHS': '₵', 'KZT': '₸', 'AZN': '₼', 'UAH': '₴',
  'BRL': 'R$', 'RUB': '₽', 'AUD': 'A$', 'CAD': 'C$', 'NZD': 'NZ$',
  'HKD': 'HK$', 'SGD': 'S$', 'TWD': 'NT$', 'MXN': 'Mex$', 'CZK': 'Kč',
  'BGN': 'лв', 'ZAR': 'R', 'SEK': 'kr', 'NOK': 'kr', 'DKK': 'kr',
  'ISK': 'kr', 'CHF': 'CHF', 'THB': '฿', 'MYR': 'RM', 'IDR': 'Rp',
  'AED': 'د.إ', 'SAR': '﷼', 'EGP': 'E£', 'RON': 'lei', 'HUF': 'Ft',
  'CLP': 'CLP$', 'ARS': 'AR$', 'COP': 'COL$', 'PEN': 'S/', 'GEL': '₾',
};
const CURRENCIES = Object.keys(CURRENCY_SYMBOLS);
const POPULAR_CURRENCIES = ['EUR', 'USD', 'GBP', 'PLN', 'CZK', 'CHF', 'SEK', 'NOK', 'DKK', 'UAH', 'RUB', 'BGN', 'RON', 'HUF'];
const getSym = (c) => CURRENCY_SYMBOLS[c] || c;
const sortedCurrencies = [
  ...POPULAR_CURRENCIES,
  ...CURRENCIES.filter((c) => !POPULAR_CURRENCIES.includes(c)).sort(),
];

const findCountry = (code) => COUNTRY_OPTIONS.find((c) => c.code === code);

const STATUS_CFG = {
  draft:     { label: 'Juodraštis', color: 'default' },
  issued:    { label: 'Išrašyta',   color: 'info'    },
  sent:      { label: 'Išsiųsta',   color: 'primary' },
  paid:      { label: 'Apmokėta',   color: 'success' },
  overdue:   { label: 'Vėluojanti', color: 'error'   },
  cancelled: { label: 'Atšaukta',   color: 'default' },
};

const TYPE_LABELS = {
  isankstine:   'Išankstinė sąskaita faktūra',
  pvm_saskaita: 'PVM sąskaita faktūra',
  saskaita:     'Sąskaita faktūra',
  kreditine:    'Kreditinė sąskaita faktūra',
};

const parseLocalDate = (value) => {
  if (!value) return null;
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const startOfLocalDay = (date) => (
  new Date(date.getFullYear(), date.getMonth(), date.getDate())
);

const addDaysLocal = (date, days) => (
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
);

const daysInMonth = (year, monthIndex) => (
  new Date(year, monthIndex + 1, 0).getDate()
);

const addMonthsClamped = (date, months, anchorDay = date.getDate()) => {
  const targetFirst = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const maxDay = daysInMonth(targetFirst.getFullYear(), targetFirst.getMonth());

  return new Date(
    targetFirst.getFullYear(),
    targetFirst.getMonth(),
    Math.min(anchorDay, maxDay),
  );
};

const formatLtDate = (date) => (
  date
    ? date.toLocaleDateString('lt-LT', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—'
);

// ═══════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════
const P = {
  primary: '#1976d2',
  accent: '#dc004e',
  bg: '#fafafa',
  border: '#e0e0e0',
  softBlue: '#f4f7fb',
  softBlue2: '#eef3fa',
  softBlueBorder: '#d7e2f0',
  textMuted: '#667085',
};

const secSx = {
  p: 2.5,
  backgroundColor: P.bg,
  borderRadius: 3,
  border: `1px solid ${P.border}`,
  mb: 3,
};

const titleSx = { fontSize: 16, fontWeight: 700, mb: 1.5, color: '#333' };
const menuProps = { disableScrollLock: true, PaperProps: { sx: { maxHeight: 400 } } };

const segmentedGroupSx = {
  p: 0.5,
  gap: 0.5,
  borderRadius: 999,
  backgroundColor: '#eeeeef',
  border: '1px solid #dde3ea',
  width: 'fit-content',
  '& .MuiToggleButtonGroup-grouped': {
    border: 0,
    borderRadius: 999,
    px: 2,
    py: 0.9,
    minHeight: 40,
    textTransform: 'none',
    fontWeight: 600,
    fontSize: 14,
    color: '#667085',
    backgroundColor: 'transparent',
    transition: 'all 0.18s ease',
    '&:not(:first-of-type)': {
      ml: 0,
      borderLeft: 0,
    },
    '&:hover': {
      backgroundColor: '#eceff3',
    },
    '&.Mui-selected': {
      color: '#344054',
      backgroundColor: '#fff',
      boxShadow: '0 1px 4px rgba(16, 24, 40, 0.08)',
    },
    '&.Mui-selected:hover': {
      backgroundColor: '#fff',
    },
  },
};

const personTypeGroupSx = {
  ...segmentedGroupSx,
  '& .MuiToggleButtonGroup-grouped': {
    ...segmentedGroupSx['& .MuiToggleButtonGroup-grouped'],
    px: 1.5,
    minHeight: 38,
    fontSize: 13,
  },
};

const recurringWrapSx = {
  mt: 1.25,
  p: { xs: 1.5, sm: 2 },
  borderRadius: 4,
  background: 'linear-gradient(180deg, #f8fbff 0%, #eef4fb 100%)',
  border: `1px solid ${P.softBlueBorder}`,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.65)',
};

const recurringInnerCardSx = {
  p: 1.5,
  borderRadius: 3,
  backgroundColor: '#fff',
  border: `1px solid ${P.softBlueBorder}`,
  height: '100%',
};

const recurringSectionTitleSx = {
  fontSize: 13,
  fontWeight: 700,
  color: '#344054',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const emptyLine = () => ({
  prekes_pavadinimas: '',
  prekes_kodas: '',
  prekes_barkodas: '',
  quantity: '1',
  unit: 'vnt',
  price: '0',
  discount_value: '0',
  discount_type: 'percent',
  vat_percent: '',
  save_to_catalog: false,
  preke_paslauga: 'preke',
});

const PERIOD_TYPE_OPTIONS = [
  { value: 'daily',   label: 'Diena'   },
  { value: 'weekly',  label: 'Savaitė' },
  { value: 'monthly', label: 'Mėnuo'  },
];

const FREQUENCY_OPTIONS = {
  daily: [
    { value: 1, label: 'Kasdien' },
    { value: 2, label: 'Kas 2 dienas' },
    { value: 3, label: 'Kas 3 dienas' },
    { value: 4, label: 'Kas 4 dienas' },
    { value: 5, label: 'Kas 5 dienas' },
    { value: 6, label: 'Kas 6 dienas' },
  ],
  weekly: [
    { value: 1, label: 'Kas savaitę' },
    { value: 2, label: 'Kas 2 savaites' },
    { value: 3, label: 'Kas 3 savaites' },
    { value: 4, label: 'Kas 4 savaites' },
  ],
  monthly: [
    { value: 1, label: 'Kas mėnesį' },
    ...Array.from({ length: 11 }, (_, i) => ({
      value: i + 2,
      label: `Kas ${i + 2} mėn.`,
    })),
  ],
};

// ═══════════════════════════════════════════════════════════
// NumField — decimal input with optional maxDecimals
// ═══════════════════════════════════════════════════════════
const NumField = ({ value, onChange, maxDecimals, ...props }) => (
  <TextField
    {...props}
    value={value ?? ''}
    inputProps={{ inputMode: 'decimal', ...props.inputProps }}
    onFocus={() => { if (value === '0') onChange(''); }}
    onChange={(e) => {
      let v = e.target.value.replace('.', ',');
      if (!allowDec(v)) return;
      if (maxDecimals != null) {
        const parts = v.split(',');
        if (parts.length === 2 && parts[1].length > maxDecimals) return;
      }
      onChange(cleanNum(v));
    }}
  />
);

const IntField = ({ value, onChange, min = 0, max = 100, ...props }) => (
  <TextField
    {...props}
    value={value ?? ''}
    inputProps={{ inputMode: 'numeric', ...props.inputProps }}
    onFocus={() => { if (value === '0') onChange(''); }}
    onChange={(e) => {
      const v = e.target.value.replace(/[^0-9]/g, '');
      if (v === '') { onChange(''); return; }
      const n = parseInt(v, 10);
      if (n > max) return;
      onChange(String(n));
    }}
  />
);

// ═══════════════════════════════════════════════════════════
// DebouncedField — types locally, syncs parent on blur
// ═══════════════════════════════════════════════════════════
const DebouncedField = ({ value, onChange, ...props }) => {
  const [local, setLocal] = useState(value ?? '');
  const parentVal = useRef(value);
  useEffect(() => {
    if (value !== parentVal.current) {
      parentVal.current = value;
      setLocal(value ?? '');
    }
  }, [value]);
  const flush = () => {
    if (local !== parentVal.current) {
      parentVal.current = local;
      onChange(local);
    }
  };
  return (
    <TextField
      {...props}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={flush}
    />
  );
};

const DebouncedNumField = ({ value, onChange, maxDecimals, ...props }) => {
  const [local, setLocal] = useState(value ?? '');
  const parentVal = useRef(value);
  useEffect(() => {
    if (value !== parentVal.current) {
      parentVal.current = value;
      setLocal(value ?? '');
    }
  }, [value]);
  return (
    <TextField
      {...props}
      value={local}
      inputProps={{ inputMode: 'decimal', ...props.inputProps }}
      onFocus={() => { if (local === '0') setLocal(''); }}
      onChange={(e) => {
        let v = e.target.value.replace('.', ',');
        if (!allowDec(v)) return;
        if (maxDecimals != null) {
          const parts = v.split(',');
          if (parts.length === 2 && parts[1].length > maxDecimals) return;
        }
        setLocal(cleanNum(v));
      }}
      onBlur={() => {
        const cleaned = local === '' ? '0' : local;
        if (cleaned !== parentVal.current) {
          parentVal.current = cleaned;
          onChange(cleaned);
        }
      }}
    />
  );
};

const DebouncedIntField = ({ value, onChange, min = 0, max = 100, ...props }) => {
  const [local, setLocal] = useState(value ?? '');
  const parentVal = useRef(value);
  useEffect(() => {
    if (value !== parentVal.current) {
      parentVal.current = value;
      setLocal(value ?? '');
    }
  }, [value]);
  return (
    <TextField
      {...props}
      value={local}
      inputProps={{ inputMode: 'numeric', ...props.inputProps }}
      onFocus={() => { if (local === '0') setLocal(''); }}
      onChange={(e) => {
        const v = e.target.value.replace(/[^0-9]/g, '');
        if (v === '') { setLocal(''); return; }
        const n = parseInt(v, 10);
        if (n > max) return;
        setLocal(String(n));
      }}
      onBlur={() => {
        const val = local === '' ? '0' : local;
        if (val !== parentVal.current) {
          parentVal.current = val;
          onChange(val);
        }
      }}
    />
  );
};

// ═══════════════════════════════════════════════════════════
// CountryField — вынесен за пределы компонента
// ═══════════════════════════════════════════════════════════
const CountryField = ({ value, onChange, disabled, label = "Šalis" }) => (
  <Autocomplete
    value={findCountry(value) || null}
    onChange={(_, v) => onChange(v ? v.code : '')}
    options={COUNTRY_OPTIONS}
    getOptionLabel={(o) => o.name || ''}
    isOptionEqualToValue={(o, v) => o.code === v.code}
    disabled={disabled}
    disableClearable={!!value}
    renderOption={(props, o) => (
      <li {...props} key={o.code}>
        <Typography variant="body2">{o.name}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', pl: 1 }}>{o.code}</Typography>
      </li>
    )}
    renderInput={(params) => <TextField {...params} label={label} />}
    componentsProps={{ popper: { disablePortal: false } }}
  />
);

// ═══════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════
const InvoiceEditorPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const isNew = !id || id === 'nauja';
  const duplicateFromId = isNew ? searchParams.get('from') : null;
  const recurringEditId = isNew ? searchParams.get('recurring') : null;
  const recurringCopyId = isNew ? searchParams.get('recurring_from') : null;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', text: '', action: null });
  const [emailWarning, setEmailWarning] = useState({ open: false, action: null, reason: null });

  const [settings, setSettings] = useState(null);
  const [invoiceData, setInvoiceData] = useState(null);
  const [paymentLink, setPaymentLink] = useState({ enabled: false, provider: '' });

  const [form, setForm] = useState({
    invoice_type: 'pvm_saskaita',
    status: 'draft',
    document_series: '',
    document_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    order_number: '',
    currency: 'EUR',
    pvm_tipas: 'taikoma',
    vat_percent: '21',
    note: '',
    public_link_enabled: true,
    seller_name: '', seller_id: '', seller_vat_code: '', seller_address: '',
    seller_country: 'Lietuva', seller_country_iso: 'LT',
    seller_phone: '', seller_email: '',
    seller_bank_name: '', seller_iban: '', seller_swift: '',
    seller_extra_info: '', seller_type: 'juridinis',
    buyer_counterparty: null,
    buyer_type: 'juridinis',
    buyer_name: '', buyer_id: '', buyer_vat_code: '', buyer_address: '',
    buyer_country: 'Lietuva', buyer_country_iso: 'LT',
    buyer_phone: '', buyer_email: '',
    buyer_bank_name: '', buyer_iban: '', buyer_swift: '',
    buyer_extra_info: '', buyer_delivery_address: '',
    issued_by: '', received_by: '',
    full_number: '', uuid: '', pdf_url: null,
    is_editable: true, can_be_sent: false, can_create_pvm_sf: false,
    public_url: null,
    auto_create_sf_on_paid: false, auto_sf_series: '', auto_sf_send: false,
    send_payment_reminders: false,
  });

  const [lineItems, setLineItems] = useState([emptyLine()]);

  const [showSellerExtra, setShowSellerExtra] = useState(false);
  const [showBuyerExtra, setShowBuyerExtra] = useState(false);
  const [showBuyerDelivery, setShowBuyerDelivery] = useState(false);
  const [saveBuyerAsClient, setSaveBuyerAsClient] = useState(false);

  const [showLineDiscount, setShowLineDiscount] = useState(false);
  const [showTotalDiscount, setShowTotalDiscount] = useState(false);
  const [totalDiscountType, setTotalDiscountType] = useState('percent');
  const [totalDiscountValue, setTotalDiscountValue] = useState('0');
  const [showPerLineVat, setShowPerLineVat] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showOrderNumber, setShowOrderNumber] = useState(false);

  // ── Periodinė sąskaita ──
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringPlanLoading, setRecurringPlanLoading] = useState(false);
  const [recurringPlan, setRecurringPlan] = useState({ past: [], future: [] });
  const [recurringServerMeta, setRecurringServerMeta] = useState({
    status: '',
    generation_count: 0,
    next_run_at: '',
  });
  const [recurringForm, setRecurringForm] = useState({
    start_date: new Date().toISOString().split('T')[0],
    payment_term_days: '14',
    period_type: 'monthly',
    interval: 1,
    first_day_of_month: false,
    last_day_of_month: false,
    end_type: '',
    end_date: '',
    max_count: '',
  });
  const uRec = (field, value) => setRecurringForm((p) => ({ ...p, [field]: value }));

  const [availableSeries, setAvailableSeries] = useState([]);
  const [availableUnits, setAvailableUnits] = useState([]);

  const [autoNumber, setAutoNumber] = useState('');
  const [customNumberMode, setCustomNumberMode] = useState(false);
  const customNumberModeRef = useRef(false);
  const [numberChecking, setNumberChecking] = useState(false);
  const [numberError, setNumberError] = useState('');
  const numberCheckTimer = useRef(null);
  const originalNumberRef = useRef('');

  // ── Note template ──
  const noteIsTemplateRef = useRef(false);

  const [buyerSearchInput, setBuyerSearchInput] = useState('');
  const [buyerOptions, setBuyerOptions] = useState([]);
  const [buyerSearchLoading, setBuyerSearchLoading] = useState(false);

  const [searchActiveLine, setSearchActiveLine] = useState(null);
  const [productOptions, setProductOptions] = useState({});
  const [productSearchLoading, setProductSearchLoading] = useState({});
  const [linesFromSearch, setLinesFromSearch] = useState(new Set());
  const productSearchTimers = useRef({});
  const searchBtnRef = useRef(false);

  // ── Inline create dialogs ──
  const [newSeriesDialog, setNewSeriesDialog] = useState(false);
  const [newSeriesForm, setNewSeriesForm] = useState({
    invoice_type: 'pvm_saskaita', prefix: '', next_number: 1, padding: 3, is_default: false,
  });
  const [newSeriesSaving, setNewSeriesSaving] = useState(false);
  const [newSeriesNumberCheck, setNewSeriesNumberCheck] = useState({ checking: false, exists: false });

  const [newUnitDialog, setNewUnitDialog] = useState(false);
  const [newUnitForm, setNewUnitForm] = useState({ code: '', name: '' });
  const [newUnitSaving, setNewUnitSaving] = useState(false);
  const [newUnitForLine, setNewUnitForLine] = useState(null);

  // ── Required fields errors ──
  const [fieldErrors, setFieldErrors] = useState({});
  const lastSnackRef = useRef(null);

  const { invSub, isFeatureLocked } = useInvSubscription();
  const isFree = invSub?.status === "free";
  const recurringLocked = isFeatureLocked("recurring");
  const autoRemindersLocked = isFeatureLocked("auto_reminders");
  const paymentLinksLocked = isFeatureLocked("payment_links");

  // ── Buyer search ──
  useEffect(() => {
    if (buyerSearchInput.length < 2) { setBuyerOptions([]); return; }
    const t = setTimeout(async () => {
      setBuyerSearchLoading(true);
      try {
        const { data } = await api.get('/invoicing/search-companies/', {
          params: { q: buyerSearchInput, limit: 20 }, withCredentials: true,
        });
        setBuyerOptions(data || []);
      } catch { setBuyerOptions([]); }
      finally { setBuyerSearchLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [buyerSearchInput]);

  // ── Product search ──
  const searchProducts = useCallback((lineIndex, query) => {
    const key = `${lineIndex}_name`;
    if (query.length < 2) { setProductOptions((p) => ({ ...p, [key]: [] })); return; }
    if (productSearchTimers.current[key]) clearTimeout(productSearchTimers.current[key]);
    productSearchTimers.current[key] = setTimeout(async () => {
      setProductSearchLoading((p) => ({ ...p, [key]: true }));
      try {
        const { data } = await api.get('/invoicing/search-products/', {
          params: { q: query, field: 'name', limit: 15 }, withCredentials: true,
        });
        setProductOptions((p) => ({ ...p, [key]: data || [] }));
      } catch { setProductOptions((p) => ({ ...p, [key]: [] })); }
      finally { setProductSearchLoading((p) => ({ ...p, [key]: false })); }
    }, 300);
  }, []);

  const selectProduct = (lineIndex, product) => {
    if (!product) return;
    setLineItems((prev) => prev.map((li, idx) => {
      if (idx !== lineIndex) return li;
      return {
        ...li,
        prekes_pavadinimas: product.prekes_pavadinimas || product.name || '',
        prekes_kodas: product.prekes_kodas || product.code || '',
        prekes_barkodas: product.prekes_barkodas || product.barcode || '',
        price: String(product.price ?? li.price),
        unit: product.unit || li.unit,
        vat_percent: product.vat_percent != null ? String(product.vat_percent) : li.vat_percent,
      };
    }));
    setLinesFromSearch((prev) => new Set(prev).add(lineIndex));
  };

  const clearProductFields = (i) => {
    setLineItems((prev) => prev.map((li, idx) => {
      if (idx !== i) return li;
      return { ...li, prekes_pavadinimas: '', prekes_kodas: '', prekes_barkodas: '' };
    }));
    setLinesFromSearch((prev) => { const n = new Set(prev); n.delete(i); return n; });
    setProductOptions((p) => ({ ...p, [`${i}_name`]: [] }));
  };

  const activateSearch = (lineIndex) => {
    setSearchActiveLine(lineIndex);
    const currentName = lineItems[lineIndex].prekes_pavadinimas;
    if (currentName.length >= 2) searchProducts(lineIndex, currentName);
  };

  // ── Helpers ──
  const u = (field, value) => {
    setFieldErrors((p) => { if (p[field]) { const n = { ...p }; delete n[field]; return n; } return p; });
    setForm((p) => ({ ...p, [field]: value }));
  };

  const helpTooltipProps = {
    arrow: true,
    placement: 'top',
    componentsProps: {
      tooltip: {
        sx: {
          backgroundColor: 'rgba(52, 64, 84, 0.96)',
          color: '#fff',
          fontSize: 14,
          fontWeight: 400,
          lineHeight: 1.5,
          px: 1.5,
          py: 1.25,
          borderRadius: 2,
          maxWidth: 420,
          boxShadow: '0 10px 28px rgba(16, 24, 40, 0.22)',
        },
      },
      arrow: {
        sx: {
          color: 'rgba(52, 64, 84, 0.96)',
        },
      },
    },
  };

  const helpIconButtonSx = {
    ml: 0.25,
    p: 0.25,
    color: '#98a2b3',
    verticalAlign: 'middle',
    flexShrink: 0,
    '&:hover': {
      backgroundColor: 'transparent',
      color: '#667085',
    },
  };

  const InlineHelpTooltip = ({ title, iconSize = 18 }) => (
    <Tooltip title={title} {...helpTooltipProps}>
      <IconButton size="small" sx={helpIconButtonSx}>
        <HelpIcon sx={{ fontSize: iconSize }} />
      </IconButton>
    </Tooltip>
  );

  const setCustomNumber = (val) => {
    const newVal = typeof val === 'function' ? val(customNumberModeRef.current) : val;
    customNumberModeRef.current = newVal;
    setCustomNumberMode(newVal);
  };

  const getEmailIssue = (email) => {
    const trimmed = (email || '').trim();

    if (!trimmed) return 'missing';

    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    return isValid ? null : 'invalid';
  };

  // FIX #1: Editing allowed for all statuses except cancelled
  const isEditable = form.status !== 'cancelled';
  const sym = getSym(form.currency);
  const isPvm = form.pvm_tipas === 'taikoma';
  const showPvmSelector = form.invoice_type === 'isankstine';
  const showVatOptions = isPvm && form.invoice_type !== 'saskaita';

  const showNumberEditor = isEditable;
  const isAutoNumberMode = isNew || form.status === 'draft';

  // ── Note template builder ──
  const buildNoteTemplate = useCallback((series, number) => {
    const fullNum = series && number ? `${series}-${number}` : (series || number || '___');
    return `Apmokėdami paskirtyje būtinai nurodykite ${fullNum}`;
  }, []);

  const filteredSeries = useMemo(() => {
    return availableSeries.filter((s) => s.invoice_type === form.invoice_type);
  }, [availableSeries, form.invoice_type]);

  // ── Fetch next number ──
  const fetchNextNumber = useCallback(async (series, invoiceType) => {
    if (!series) { setAutoNumber(''); return; }
    try {
      const { data } = await api.get('/invoicing/next-number/', {
        params: { series, invoice_type: invoiceType }, withCredentials: true,
      });
      setAutoNumber(data.next_number || '');
      if (!customNumberModeRef.current) {
        setForm((p) => ({ ...p, document_number: data.next_number || '' }));
      }
    } catch { setAutoNumber(''); }
  }, []);

  const fetchAutoNumberOnly = useCallback(async (series, invoiceType) => {
    if (!series) { setAutoNumber(''); return ''; }
    try {
      const { data } = await api.get('/invoicing/next-number/', {
        params: { series, invoice_type: invoiceType }, withCredentials: true,
      });
      const next = data.next_number || '';
      setAutoNumber(next);
      return next;
    } catch { setAutoNumber(''); return ''; }
  }, []);

  const validateNumber = useCallback(async (number, series, invoiceType) => {
    if (!number || !series) { setNumberError(''); return; }
    setNumberChecking(true);
    try {
      const { data } = await api.get('/invoicing/check-number/', {
        params: { number, series, invoice_type: invoiceType }, withCredentials: true,
      });
      setNumberError(data.exists ? 'Šis numeris jau užimtas' : '');
    } catch { setNumberError(''); }
    finally { setNumberChecking(false); }
  }, []);

  // ── Load settings + series + units ──
  useEffect(() => {
    (async () => {
      try {
        const [settingsRes, seriesRes, unitsRes] = await Promise.allSettled([
          invoicingApi.getSettings(),
          api.get('/invoicing/series/', { withCredentials: true }),
          invoicingApi.getUnits(),
        ]);
        const settingsData = settingsRes.status === 'fulfilled' ? settingsRes.value.data : null;
        const seriesList = seriesRes.status === 'fulfilled' ? (seriesRes.value.data || []) : [];
        const unitsList = unitsRes.status === 'fulfilled' ? (unitsRes.value.data || []) : [];

        if (settingsData) setSettings(settingsData);
        setAvailableSeries(seriesList);
        setAvailableUnits(unitsList.filter(Boolean));

        if (isNew && unitsList.length > 0) {
          const defUnit = unitsList.find((u) => u.is_default);
          const defCode = defUnit ? defUnit.code : (unitsList[0]?.code || 'vnt');
          setLineItems((prev) => prev.map((li, idx) =>
            idx === 0 && li.unit === 'vnt' ? { ...li, unit: defCode } : li));
        }

        if (isNew && !duplicateFromId && settingsData) {
          const settingsSeriesMap = {
            isankstine: settingsData.isankstine_series,
            pvm_saskaita: settingsData.pvm_sf_series,
            saskaita: settingsData.sf_series,
            kreditine: settingsData.kreditine_series,
          };
          let defaultSeries = settingsSeriesMap['pvm_saskaita'] || '';
          if (!defaultSeries && seriesList.length > 0) {
            const match = seriesList.find((s) => s.invoice_type === 'pvm_saskaita');
            defaultSeries = match?.prefix || '';
          }
          setForm((p) => ({
            ...p,
            seller_name: settingsData.seller_name || '',
            seller_id: settingsData.seller_company_code || '',
            seller_vat_code: settingsData.seller_vat_code || '',
            seller_address: settingsData.seller_address || '',
            seller_phone: settingsData.seller_phone || '',
            seller_email: settingsData.seller_email || '',
            seller_bank_name: settingsData.seller_bank_name || '',
            seller_iban: settingsData.seller_iban || '',
            seller_swift: settingsData.seller_swift || '',
            seller_country: settingsData.seller_country || 'Lietuva',
            seller_country_iso: settingsData.seller_country_iso || 'LT',
            currency: settingsData.default_currency || 'EUR',
            vat_percent: String(settingsData.default_vat_percent ?? 21),
            document_series: defaultSeries,
          }));
          if (defaultSeries) fetchNextNumber(defaultSeries, 'pvm_saskaita');
          if (settingsData.default_payment_days) {
            const d = new Date();
            d.setDate(d.getDate() + settingsData.default_payment_days);
            setForm((p) => ({ ...p, due_date: d.toISOString().split('T')[0] }));
          }
        }

        if (isNew && duplicateFromId && settingsData) {
          setForm((p) => ({
            ...p,
            seller_name: settingsData.seller_name || '',
            seller_id: settingsData.seller_company_code || '',
            seller_vat_code: settingsData.seller_vat_code || '',
            seller_address: settingsData.seller_address || '',
            seller_phone: settingsData.seller_phone || '',
            seller_email: settingsData.seller_email || '',
            seller_bank_name: settingsData.seller_bank_name || '',
            seller_iban: settingsData.seller_iban || '',
            seller_swift: settingsData.seller_swift || '',
            seller_country: settingsData.seller_country || 'Lietuva',
            seller_country_iso: settingsData.seller_country_iso || 'LT',
            currency: settingsData.default_currency || 'EUR',
            vat_percent: String(settingsData.default_vat_percent ?? 21),
          }));
          if (settingsData.default_payment_days) {
            const d = new Date();
            d.setDate(d.getDate() + settingsData.default_payment_days);
            setForm((p) => ({ ...p, due_date: d.toISOString().split('T')[0] }));
          }
        }
      } catch { /* не критично */ }
    })();
  }, [isNew, duplicateFromId, fetchNextNumber]);

  // ── FIX #2: Load duplicate source invoice ──
  useEffect(() => {
    if (!duplicateFromId || !settings) return;
    (async () => {
      try {
        const { data } = await invoicingApi.getInvoice(duplicateFromId);
        const type = data.invoice_type || 'pvm_saskaita';
        const settingsSeriesMap = {
          isankstine: settings.isankstine_series,
          pvm_saskaita: settings.pvm_sf_series,
          saskaita: settings.sf_series,
          kreditine: settings.kreditine_series,
        };
        let series = settingsSeriesMap[type] || '';
        if (!series && availableSeries.length > 0) {
          const match = availableSeries.find((s) => s.invoice_type === type);
          series = match?.prefix || '';
        }
        setForm((prev) => ({
          ...prev,
          invoice_type: type,
          document_series: series,
          pvm_tipas: data.pvm_tipas || prev.pvm_tipas,
          vat_percent: String(data.vat_percent ?? prev.vat_percent),
          currency: data.currency || prev.currency,
          note: data.note || '',
          order_number: data.order_number || '',

          seller_name: data.seller_name || prev.seller_name,
          seller_id: data.seller_id || prev.seller_id,
          seller_vat_code: data.seller_vat_code || prev.seller_vat_code,
          seller_address: data.seller_address || prev.seller_address,
          seller_phone: data.seller_phone || prev.seller_phone,
          seller_email: data.seller_email || prev.seller_email,
          seller_bank_name: data.seller_bank_name || prev.seller_bank_name,
          seller_iban: data.seller_iban || prev.seller_iban,
          seller_swift: data.seller_swift || prev.seller_swift,
          seller_extra_info: data.seller_extra_info || '',
          seller_country: data.seller_country || prev.seller_country,
          seller_country_iso: data.seller_country_iso || prev.seller_country_iso,
          seller_type: data.seller_is_person ? 'fizinis' : 'juridinis',

          buyer_counterparty: data.buyer_counterparty || null,
          buyer_type: data.buyer_is_person ? 'fizinis' : 'juridinis',
          buyer_name: data.buyer_name || '', buyer_id: data.buyer_id || '',
          buyer_vat_code: data.buyer_vat_code || '',
          buyer_address: data.buyer_address || '',
          buyer_phone: data.buyer_phone || '', buyer_email: data.buyer_email || '',
          buyer_bank_name: data.buyer_bank_name || '',
          buyer_iban: data.buyer_iban || '', buyer_swift: data.buyer_swift || '',
          buyer_extra_info: data.buyer_extra_info || '',
          buyer_delivery_address: data.buyer_delivery_address || '',
          buyer_country: data.buyer_country || '',
          buyer_country_iso: data.buyer_country_iso || '',
          issued_by: data.issued_by || prev.issued_by,
          received_by: data.received_by || prev.received_by,
          auto_create_sf_on_paid: data.auto_create_sf_on_paid || false,
          auto_sf_series: data.auto_sf_series || '',
          auto_sf_send: data.auto_sf_send || false,
        }));
        if (data.line_items?.length) {
          setLineItems(data.line_items.map((li) => ({
            prekes_pavadinimas: li.prekes_pavadinimas || '',
            prekes_kodas: li.prekes_kodas || '',
            prekes_barkodas: li.prekes_barkodas || '',
            quantity: String(li.quantity ?? 1),
            unit: li.unit || 'vnt',
            price: String(li.price ?? 0),
            discount_value: String(li.discount_wo_vat || 0),
            discount_type: 'amount',
            vat_percent: li.vat_percent != null ? String(li.vat_percent) : '',
            save_to_catalog: false,
            preke_paslauga: li.preke_paslauga || 'preke',
          })));
          if (data.line_items.some((li) => parseFloat(li.discount_wo_vat || 0) > 0)) setShowLineDiscount(true);
          if (data.line_items.some((li) => li.vat_percent != null)) setShowPerLineVat(true);
        }
        if (data.note) setShowNote(true);
        if (data.buyer_delivery_address) setShowBuyerDelivery(true);
        if (data.buyer_extra_info) setShowBuyerExtra(true);
        if (data.seller_extra_info) setShowSellerExtra(true);
        if (data.order_number) setShowOrderNumber(true);

        if (data.payment_link_provider && data.payment_link_url) {
          setPaymentLink({ enabled: true, provider: data.payment_link_provider });
        }

        if (parseFloat(data.invoice_discount_wo_vat || 0) > 0) {
          setShowTotalDiscount(true);
          setTotalDiscountValue(String(data.invoice_discount_wo_vat));
          setTotalDiscountType('amount');
        }
        prevTypeRef.current = type;
        customNumberModeRef.current = false;
        setCustomNumberMode(false);
        setNumberError('');
        if (series) fetchNextNumber(series, type);
      } catch {
        setSnack({ open: true, msg: 'Nepavyko įkelti šaltinio sąskaitos', severity: 'error' });
      }
    })();
  }, [duplicateFromId, settings, availableSeries, fetchNextNumber]);

  // ── Load recurring invoice for edit / duplicate ──
  useEffect(() => {
    const loadId = recurringEditId || recurringCopyId;
    if (!loadId || !settings) return;
    // --- Block recurring copy/edit for free plan ---
    if (recurringLocked) {
      setSnack({ open: true, msg: 'Periodinės sąskaitos galimos tik su mokamu planu.', severity: 'warning' });
      navigate('/israsymas', { replace: true });
      return;
    }
    (async () => {
      try {
        const { data } = await invoicingApi.getRecurringInvoice(loadId);
        if (recurringEditId) {
          setRecurringServerMeta({
            status: data.status || '',
            generation_count: data.generation_count || 0,
            next_run_at: data.next_run_at || '',
          });
        } else {
          setRecurringServerMeta({
            status: '',
            generation_count: 0,
            next_run_at: '',
          });
        }
        setIsRecurring(true);
        setRecurringForm({
          start_date: data.start_date || new Date().toISOString().split('T')[0],
          payment_term_days: String(data.payment_term_days ?? 14),
          period_type: data.first_day_of_month || data.last_day_of_month ? 'monthly' : (data.frequency || 'monthly'),
          interval: data.interval || 1,
          first_day_of_month: data.first_day_of_month || false,
          last_day_of_month: data.last_day_of_month || false,
          end_type: data.max_count ? 'count' : (data.end_date ? 'date' : ''),
          end_date: data.end_date || '',
          max_count: data.max_count ? String(data.max_count) : '',
        });
        setForm((prev) => ({
          ...prev,
          invoice_type: data.invoice_type || 'pvm_saskaita',
          document_series: data.document_series || prev.document_series,
          currency: data.currency || prev.currency,
          pvm_tipas: data.pvm_tipas || prev.pvm_tipas,
          vat_percent: String(data.vat_percent ?? prev.vat_percent),
          note: data.note || '',
          order_number: data.order_number || '',
          public_link_enabled: data.public_link_enabled ?? true,
          send_payment_reminders: data.send_payment_reminders || false,
          auto_create_sf_on_paid: data.auto_create_sf_on_paid || false,
          auto_sf_series: data.auto_sf_series || '',
          auto_sf_send: data.auto_sf_send || false,
          seller_name: data.seller_name || prev.seller_name,
          seller_id: data.seller_id || prev.seller_id,
          seller_vat_code: data.seller_vat_code || prev.seller_vat_code,
          seller_address: data.seller_address || prev.seller_address,
          seller_country: data.seller_country || prev.seller_country,
          seller_country_iso: data.seller_country_iso || prev.seller_country_iso,
          seller_phone: data.seller_phone || prev.seller_phone,
          seller_email: data.seller_email || prev.seller_email,
          seller_bank_name: data.seller_bank_name || prev.seller_bank_name,
          seller_iban: data.seller_iban || prev.seller_iban,
          seller_swift: data.seller_swift || prev.seller_swift,
          seller_extra_info: data.seller_extra_info || '',
          seller_type: data.seller_is_person ? 'fizinis' : 'juridinis',
          buyer_counterparty: data.buyer_counterparty || null,
          buyer_name: data.buyer_name || '',
          buyer_id: data.buyer_id || '',
          buyer_vat_code: data.buyer_vat_code || '',
          buyer_address: data.buyer_address || '',
          buyer_country: data.buyer_country || 'Lietuva',
          buyer_country_iso: data.buyer_country_iso || 'LT',
          buyer_phone: data.buyer_phone || '',
          buyer_email: data.buyer_email || '',
          buyer_bank_name: data.buyer_bank_name || '',
          buyer_iban: data.buyer_iban || '',
          buyer_swift: data.buyer_swift || '',
          buyer_extra_info: data.buyer_extra_info || '',
          buyer_delivery_address: data.buyer_delivery_address || '',
          buyer_type: data.buyer_is_person ? 'fizinis' : 'juridinis',
          issued_by: data.issued_by || prev.issued_by,
          received_by: data.received_by || prev.received_by,
        }));
        if (data.line_items?.length) {
          setLineItems(data.line_items.map((li) => ({
            prekes_pavadinimas: li.prekes_pavadinimas || '',
            prekes_kodas: li.prekes_kodas || '',
            prekes_barkodas: li.prekes_barkodas || '',
            quantity: String(li.quantity ?? 1),
            unit: li.unit || 'vnt',
            price: String(li.price ?? 0),
            discount_value: String(li.discount_wo_vat || 0),
            discount_type: 'amount',
            vat_percent: li.vat_percent != null ? String(li.vat_percent) : '',
            save_to_catalog: false,
            preke_paslauga: li.preke_paslauga || 'preke',
          })));
          if (data.line_items.some((li) => parseFloat(li.discount_wo_vat || 0) > 0)) setShowLineDiscount(true);
          if (data.line_items.some((li) => li.vat_percent != null)) setShowPerLineVat(true);
        }
        if (data.note) setShowNote(true);
        if (data.buyer_delivery_address) setShowBuyerDelivery(true);
        if (data.buyer_extra_info) setShowBuyerExtra(true);
        if (data.seller_extra_info) setShowSellerExtra(true);
        if (data.order_number) setShowOrderNumber(true);
        prevTypeRef.current = data.invoice_type || 'pvm_saskaita';
        if (data.document_series) {
          fetchNextNumber(data.document_series, data.invoice_type || 'pvm_saskaita');
        }
      } catch {
        setSnack({ open: true, msg: 'Nepavyko įkelti periodinės sąskaitos', severity: 'error' });
      }
    })();
  }, [recurringEditId, recurringCopyId, settings, fetchNextNumber]);

  useEffect(() => {
    if (!recurringEditId || !isRecurring) {
      setRecurringPlan({ past: [], future: [] });
      setRecurringPlanLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setRecurringPlanLoading(true);
      try {
        const { data } = await api.get(
          `/invoicing/recurring-invoices/${recurringEditId}/plan_history/`,
          {
            params: { count: 6 },
            withCredentials: true,
          },
        );

        if (!cancelled) {
          setRecurringPlan({
            past: data?.past || [],
            future: data?.future || [],
          });
        }
      } catch {
        if (!cancelled) {
          setRecurringPlan({ past: [], future: [] });
        }
      } finally {
        if (!cancelled) {
          setRecurringPlanLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [recurringEditId, isRecurring]);

  // ── Auto-set pvm_tipas based on invoice type ──
  useEffect(() => {
    if (!isEditable) return;
    if (form.invoice_type === 'pvm_saskaita') u('pvm_tipas', 'taikoma');
    else if (form.invoice_type === 'saskaita') u('pvm_tipas', 'netaikoma');
  }, [form.invoice_type, isEditable]);

  // ── Auto-set series when type changes ──
  const prevTypeRef = useRef(form.invoice_type);
  useEffect(() => {
    if (loading) return;
    if (!isNew && form.status !== 'draft') return;
    if (prevTypeRef.current === form.invoice_type) return;
    prevTypeRef.current = form.invoice_type;
    const settingsSeriesMap = settings ? {
      isankstine: settings.isankstine_series,
      pvm_saskaita: settings.pvm_sf_series,
      saskaita: settings.sf_series,
      kreditine: settings.kreditine_series,
    } : {};
    let newSeries = settingsSeriesMap[form.invoice_type] || '';
    if (!newSeries && availableSeries.length > 0) {
      const match = availableSeries.find((s) => s.invoice_type === form.invoice_type);
      newSeries = match?.prefix || '';
    }
    u('document_series', newSeries);
    setCustomNumber(false);
    setNumberError('');
    if (newSeries) fetchNextNumber(newSeries, form.invoice_type);
    else setAutoNumber('');
  }, [loading, form.invoice_type, form.status, settings, availableSeries, isNew, fetchNextNumber]);

  const handleSeriesChange = (newSeries) => {
    u('document_series', newSeries);
    if (isAutoNumberMode) {
      setCustomNumber(false);
      setNumberError('');
      if (newSeries) fetchNextNumber(newSeries, form.invoice_type);
      else { setAutoNumber(''); setForm((p) => ({ ...p, document_number: '' })); }
    }
  };

  const handleCustomNumberChange = (val) => {
    const digits = val.replace(/[^0-9]/g, '');
    const padLen = (autoNumber || '').length || 3;
    let final;
    if (digits === '') { final = ''; }
    else if (digits.length <= padLen) { final = digits.padStart(padLen, '0'); }
    else { final = digits.slice(-padLen); }
    u('document_number', final);
    setNumberError('');
    if (numberCheckTimer.current) clearTimeout(numberCheckTimer.current);
    if (final) {
      numberCheckTimer.current = setTimeout(() => {
        validateNumber(final, form.document_series, form.invoice_type);
      }, 500);
    }
  };

  const openNewSeriesDialog = () => {
    setNewSeriesForm({
      invoice_type: form.invoice_type, prefix: '', next_number: 1, padding: 3, is_default: false,
    });
    setNewSeriesNumberCheck({ checking: false, exists: false });
    setNewSeriesDialog(true);
  };

  const handleCreateSeries = async () => {
    if (!newSeriesForm.prefix.trim()) { showMsg('Įveskite serijos prefiksą', 'error'); return; }
    if (newSeriesNumberCheck.exists) { showMsg('Šis numeris jau užimtas', 'error'); return; }
    setNewSeriesSaving(true);
    try {
      const { data } = await invoicingApi.createSeries({
        prefix: newSeriesForm.prefix.trim().toUpperCase(),
        invoice_type: newSeriesForm.invoice_type,
        next_number: parseInt(newSeriesForm.next_number) || 1,
        padding: parseInt(newSeriesForm.padding) || 3,
        is_default: newSeriesForm.is_default,
        is_active: true,
      });
      const seriesRes = await api.get('/invoicing/series/', { withCredentials: true });
      setAvailableSeries(seriesRes.data || []);
      if (newSeriesForm._autoSfMode) {
        u('auto_sf_series', data.prefix);
      } else {
        if (newSeriesForm.invoice_type !== form.invoice_type) {
          u('invoice_type', newSeriesForm.invoice_type);
          prevTypeRef.current = newSeriesForm.invoice_type;
        }
        handleSeriesChange(data.prefix);
      }
      setNewSeriesDialog(false);
      showMsg(`Serija "${data.prefix}" sukurta`);
    } catch (e) {
      const d = e.response?.data;
      const msg = d?.detail || d?.prefix?.[0] || (typeof d === 'object' ? Object.values(d).flat().join(', ') : 'Klaida');
      showMsg(msg, 'error');
    } finally { setNewSeriesSaving(false); }
  };

  const handleCreateUnit = async () => {
    if (!newUnitForm.code.trim()) { showMsg('Įveskite mato vienetą', 'error'); return; }
    setNewUnitSaving(true);
    try {
      await invoicingApi.createUnit({
        code: newUnitForm.code.trim(), name: newUnitForm.name.trim(), is_active: true,
      });
      const unitsRes = await invoicingApi.getUnits();
      setAvailableUnits((unitsRes.data || []).filter(Boolean));
      const newCode = newUnitForm.code.trim();
      if (newUnitForLine !== null) { uLine(newUnitForLine, 'unit', newCode); }
      setNewUnitDialog(false);
      showMsg(`Mato vienetas "${newUnitForm.code.trim()}" sukurtas`);
      setNewUnitForm({ code: '', name: '' });
    } catch (e) {
      const d = e.response?.data;
      const msg = d?.detail || d?.code?.[0] || (typeof d === 'object' ? Object.values(d).flat().join(', ') : 'Klaida');
      showMsg(msg, 'error');
    } finally { setNewUnitSaving(false); }
  };

  const getSeriesPreview = () => {
    if (!newSeriesForm.prefix) return '—';
    const num = String(newSeriesForm.next_number || 1).padStart(newSeriesForm.padding || 3, '0');
    return `${newSeriesForm.prefix.toUpperCase()}-${num}`;
  };

  // ── Load existing invoice ──
  useEffect(() => {
    if (isNew) return;
    (async () => {
      setLoading(true);
      try {
        const { data } = await invoicingApi.getInvoice(id);
        setInvoiceData(data);
        setForm({
          invoice_type: data.invoice_type || 'pvm_saskaita',
          status: data.status || 'draft',
          document_series: data.document_series || '',
          document_number: data.document_number || '',
          invoice_date: data.invoice_date || '',
          due_date: data.due_date || '',
          order_number: data.order_number || '',
          currency: data.currency || 'EUR',
          pvm_tipas: data.pvm_tipas || 'taikoma',
          vat_percent: String(data.vat_percent ?? 21),
          note: data.note || '',
          public_link_enabled: data.public_link_enabled ?? true,
          seller_name: data.seller_name || '', seller_id: data.seller_id || '',
          seller_vat_code: data.seller_vat_code || '',
          seller_address: data.seller_address || '',
          seller_phone: data.seller_phone || '', seller_email: data.seller_email || '',
          seller_bank_name: data.seller_bank_name || '',
          seller_iban: data.seller_iban || '', seller_swift: data.seller_swift || '',
          seller_extra_info: data.seller_extra_info || '',
          seller_type: data.seller_is_person ? 'fizinis' : 'juridinis',
          seller_country: data.seller_country || 'Lietuva',
          seller_country_iso: data.seller_country_iso || 'LT',
          buyer_counterparty: data.buyer_counterparty || null,
          buyer_type: data.buyer_is_person ? 'fizinis' : 'juridinis',
          buyer_name: data.buyer_name || '', buyer_id: data.buyer_id || '',
          buyer_vat_code: data.buyer_vat_code || '',
          buyer_address: data.buyer_address || '',
          buyer_phone: data.buyer_phone || '', buyer_email: data.buyer_email || '',
          buyer_bank_name: data.buyer_bank_name || '',
          buyer_iban: data.buyer_iban || '', buyer_swift: data.buyer_swift || '',
          buyer_extra_info: data.buyer_extra_info || '',
          buyer_delivery_address: data.buyer_delivery_address || '',
          buyer_country: data.buyer_country || '',
          buyer_country_iso: data.buyer_country_iso || '',
          issued_by: data.issued_by || '', received_by: data.received_by || '',
          full_number: data.full_number || '', uuid: data.uuid || '',
          pdf_url: data.pdf_url || null,
          is_editable: data.is_editable ?? true,
          can_be_sent: data.can_be_sent ?? false,
          can_create_pvm_sf: data.can_create_pvm_sf ?? false,
          public_url: data.public_url || null,
          auto_create_sf_on_paid: data.auto_create_sf_on_paid || false,
          auto_sf_series: data.auto_sf_series || '',
          auto_sf_send: data.auto_sf_send || false,
          send_payment_reminders: data.send_payment_reminders || false,
        });
        if (data.line_items?.length) {
          setLineItems(data.line_items.map((li) => ({
            prekes_pavadinimas: li.prekes_pavadinimas || '',
            prekes_kodas: li.prekes_kodas || '',
            prekes_barkodas: li.prekes_barkodas || '',
            quantity: String(li.quantity ?? 1),
            unit: li.unit || 'vnt',
            price: String(li.price ?? 0),
            discount_value: String(li.discount_wo_vat || 0),
            discount_type: 'amount',
            vat_percent: li.vat_percent != null ? String(li.vat_percent) : '',
            save_to_catalog: false,
            preke_paslauga: li.preke_paslauga || 'preke',
          })));
          if (data.line_items.some((li) => parseFloat(li.discount_wo_vat || 0) > 0)) setShowLineDiscount(true);
          if (data.line_items.some((li) => li.vat_percent != null)) setShowPerLineVat(true);
        }
        if (data.note) setShowNote(true);
        if (parseFloat(data.invoice_discount_wo_vat || 0) > 0) {
          setShowTotalDiscount(true);
          setTotalDiscountValue(String(data.invoice_discount_wo_vat));
          setTotalDiscountType('amount');
        }
        if (data.buyer_delivery_address) setShowBuyerDelivery(true);
        if (data.buyer_extra_info) setShowBuyerExtra(true);
        if (data.seller_extra_info) setShowSellerExtra(true);
        if (data.order_number) setShowOrderNumber(true);

        if (data.payment_link_provider && data.payment_link_url) {
          setPaymentLink({ enabled: true, provider: data.payment_link_provider });
        }

        originalNumberRef.current = data.document_number || '';
        prevTypeRef.current = data.invoice_type || 'pvm_saskaita';
        if (data.note) {
          const tmpl = `Apmokėdami paskirtąjai būtinai nurodykite ${data.full_number || `${data.document_series || ''}-${data.document_number || ''}`}`;
          noteIsTemplateRef.current = data.note === tmpl;
        }
        if (data.status === 'draft' && data.document_series) {
          const next = await fetchAutoNumberOnly(data.document_series, data.invoice_type || 'pvm_saskaita');
          if (data.document_number && data.document_number !== next) {
            setCustomNumber(true);
          } else if (!data.document_number && next) {
            setForm((p) => ({ ...p, document_number: next }));
          }
        }
      } catch {
        setSnack({ open: true, msg: 'Nepavyko įkelti sąskaitos', severity: 'error' });
      } finally { setLoading(false); }
    })();
  }, [id, isNew, fetchAutoNumberOnly]);

  // ── Auto-select SF series when enabled but empty ──
  useEffect(() => {
    if (!form.auto_create_sf_on_paid || form.auto_sf_series || availableSeries.length === 0) return;
    const targetType = form.pvm_tipas === 'taikoma' ? 'pvm_saskaita' : 'saskaita';
    const targetSeries = availableSeries.filter((s) => s.invoice_type === targetType);
    const defSeries = targetSeries.find((s) => s.is_default) || targetSeries[0];
    if (defSeries) u('auto_sf_series', defSeries.prefix);
  }, [form.auto_create_sf_on_paid, form.auto_sf_series, form.pvm_tipas, availableSeries]);

  // ── Auto-set series for existing drafts ──
  useEffect(() => {
    if (loading || isNew || form.status !== 'draft' || form.document_series || !settings) return;
    const settingsSeriesMap = {
      isankstine: settings.isankstine_series,
      pvm_saskaita: settings.pvm_sf_series,
      saskaita: settings.sf_series,
      kreditine: settings.kreditine_series,
    };
    let series = settingsSeriesMap[form.invoice_type] || '';
    if (!series && availableSeries.length > 0) {
      const match = availableSeries.find((s) => s.invoice_type === form.invoice_type);
      series = match?.prefix || '';
    }
    if (series) { u('document_series', series); fetchNextNumber(series, form.invoice_type); }
  }, [loading, isNew, form.status, form.document_series, form.invoice_type, settings, availableSeries, fetchNextNumber]);

  // ── Note template: auto-update ──
  useEffect(() => {
    if (!showNote || !noteIsTemplateRef.current) return;
    const newNote = buildNoteTemplate(form.document_series, form.document_number);
    setForm((p) => ({ ...p, note: newNote }));
  }, [form.document_series, form.document_number, showNote, buildNoteTemplate]);

  // ── Series number check ──
  useEffect(() => {
    if (!newSeriesDialog || !newSeriesForm.prefix || !newSeriesForm.next_number) {
      setNewSeriesNumberCheck({ checking: false, exists: false }); return;
    }
    const formatted = String(newSeriesForm.next_number).padStart(newSeriesForm.padding || 3, '0');
    const t = setTimeout(async () => {
      setNewSeriesNumberCheck((p) => ({ ...p, checking: true }));
      try {
        const { data } = await api.get('/invoicing/series/check-number/', {
          params: { prefix: newSeriesForm.prefix, number: formatted }, withCredentials: true,
        });
        setNewSeriesNumberCheck({ checking: false, exists: data.exists });
      } catch { setNewSeriesNumberCheck({ checking: false, exists: false }); }
    }, 400);
    return () => clearTimeout(t);
  }, [newSeriesDialog, newSeriesForm.prefix, newSeriesForm.next_number, newSeriesForm.padding]);

  const handleNoteToggle = (checked) => {
    setShowNote(checked);
    if (checked) {
      const tmpl = buildNoteTemplate(form.document_series, form.document_number);
      u('note', tmpl);
      noteIsTemplateRef.current = true;
    }
  };

  const handleNoteChange = (val) => {
    u('note', val);
    const tmpl = buildNoteTemplate(form.document_series, form.document_number);
    noteIsTemplateRef.current = val === tmpl;
  };

  const selectBuyer = (option) => {
    if (!option) {
      setForm((p) => ({
        ...p, buyer_counterparty: null,
        buyer_name: '', buyer_id: '', buyer_vat_code: '', buyer_address: '',
        buyer_phone: '', buyer_email: '', buyer_bank_name: '', buyer_iban: '',
        buyer_swift: '', buyer_type: 'juridinis', buyer_extra_info: '',
        buyer_delivery_address: '', buyer_country: 'Lietuva', buyer_country_iso: 'LT',
      }));
      return;
    }
    setForm((p) => ({
      ...p,
      buyer_counterparty: option.source === 'saved' ? option.id : null,
      buyer_name: option.name || '', buyer_id: option.company_code || '',
      buyer_vat_code: option.vat_code || '', buyer_address: option.address || '',
      buyer_phone: option.phone || '', buyer_email: option.email || '',
      buyer_bank_name: option.bank_name || '', buyer_iban: option.iban || '',
      buyer_swift: option.swift || '',
      buyer_type: option.is_person ? 'fizinis' : 'juridinis',
      buyer_extra_info: option.extra_info || option.notes || '',
      buyer_delivery_address: option.delivery_address || '',
      buyer_country: option.country || p.buyer_country || 'Lietuva',
      buyer_country_iso: option.country_iso || p.buyer_country_iso || 'LT',
    }));
    if (option.delivery_address) setShowBuyerDelivery(true);
    if (option.extra_info || option.notes) setShowBuyerExtra(true);
  };

  // ── Line items ──
  const getDefaultUnit = () => {
    const def = availableUnits.find((u) => u.is_default);
    return def ? def.code : (availableUnits[0]?.code || 'vnt');
  };

  const addLine = () => setLineItems((p) => [...p, { ...emptyLine(), unit: getDefaultUnit() }]);

  const moveLine = (from, to) => {
    if (to < 0 || to >= lineItems.length) return;
    setLineItems((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setLinesFromSearch((prev) => {
      const next = new Set();
      for (const idx of prev) {
        if (idx === from) next.add(to);
        else if (from < to && idx > from && idx <= to) next.add(idx - 1);
        else if (from > to && idx >= to && idx < from) next.add(idx + 1);
        else next.add(idx);
      }
      return next;
    });
  };

  const removeLine = (i) => {
    setLineItems((p) => p.filter((_, idx) => idx !== i));
    setProductOptions((p) => { const n = { ...p }; delete n[`${i}_name`]; return n; });
    setLinesFromSearch((prev) => {
      const next = new Set();
      for (const idx of prev) {
        if (idx < i) next.add(idx);
        else if (idx > i) next.add(idx - 1);
      }
      return next;
    });
    if (searchActiveLine === i) setSearchActiveLine(null);
    else if (searchActiveLine > i) setSearchActiveLine(searchActiveLine - 1);
  };

  const uLine = (i, f, v) => {
    const errorMap = { prekes_pavadinimas: 'name', prekes_kodas: 'code', quantity: 'qty', unit: 'unit', price: 'price' };
    if (errorMap[f]) {
      setFieldErrors((p) => { const n = { ...p }; delete n[`line_${i}_${errorMap[f]}`]; return n; });
    }
    setLineItems((p) => p.map((li, idx) => (idx === i ? { ...li, [f]: v } : li)));
  };

  // ── Calculations ──
  const lineSums = useMemo(() => {
    return lineItems.map((li) => {
      const qty = parseNum(li.quantity);
      const price = parseNum(li.price);
      const gross = qty * price;
      let lineDiscount = 0;
      if (showLineDiscount) {
        const dv = parseNum(li.discount_value);
        lineDiscount = li.discount_type === 'percent' ? gross * dv / 100 : dv;
      }
      const net = Math.max(0, gross - lineDiscount);
      const vatPct = showPerLineVat ? (li.vat_percent !== '' ? parseNum(li.vat_percent) : 0) : (isPvm ? parseNum(form.vat_percent) : 0);
      const vatAmt = isPvm ? net * vatPct / 100 : 0;
      return { gross: round2(gross), lineDiscount: round2(lineDiscount), net: round2(net), vatPct, vatAmt: round2(vatAmt), total: round2(net + vatAmt) };
    });
  }, [lineItems, showLineDiscount, showPerLineVat, isPvm, form.vat_percent]);

  const totals = useMemo(() => {
    const sumNet = lineSums.reduce((s, l) => s + l.net, 0);
    let totalDisc = 0;
    if (showTotalDiscount) {
      const dv = parseNum(totalDiscountValue);
      totalDisc = totalDiscountType === 'percent' ? sumNet * dv / 100 : dv;
    }
    totalDisc = round2(Math.min(totalDisc, sumNet));
    const afterDisc = round2(sumNet - totalDisc);
    const groups = {};
    lineSums.forEach((ls) => {
      const rate = ls.vatPct;
      if (!groups[rate]) groups[rate] = 0;
      groups[rate] += ls.net;
    });
    const vatBreakdown = Object.entries(groups)
      .map(([rate, groupNet]) => {
        const r = parseFloat(rate);
        const ratio = sumNet > 0 ? groupNet / sumNet : 0;
        const discountedNet = round2(groupNet - totalDisc * ratio);
        const vat = round2(discountedNet * r / 100);
        return { rate: r, discountedNet, vat };
      })
      .sort((a, b) => b.rate - a.rate);
    const vatTotal = round2(vatBreakdown.reduce((s, g) => s + g.vat, 0));
    return { sumLines: round2(sumNet), totalDiscount: totalDisc, base: afterDisc, vat: vatTotal, grand: round2(afterDisc + vatTotal), vatBreakdown };
  }, [lineSums, showTotalDiscount, totalDiscountValue, totalDiscountType, isPvm, form.vat_percent]);

  const buildPayload = () => ({
    invoice_type: form.invoice_type,
    document_series: form.document_series,
    document_number: (customNumberMode || !isAutoNumberMode) ? form.document_number : '',
    invoice_date: form.invoice_date || null,
    due_date: form.due_date || null,
    order_number: form.order_number,
    currency: form.currency,
    pvm_tipas: form.pvm_tipas,
    vat_percent: parseNum(form.vat_percent),
    note: showNote ? form.note : '',
    public_link_enabled: form.public_link_enabled,
    seller_name: form.seller_name, seller_id: form.seller_id,
    seller_type: form.seller_type,
    seller_vat_code: form.seller_vat_code,
    seller_address: form.seller_address,
    seller_phone: form.seller_phone, seller_email: form.seller_email,
    seller_bank_name: form.seller_bank_name,
    seller_iban: form.seller_iban, seller_swift: form.seller_swift,
    seller_extra_info: form.seller_extra_info,
    seller_country: form.seller_country, seller_country_iso: form.seller_country_iso,
    buyer_counterparty: form.buyer_counterparty || null,
    buyer_type: form.buyer_type,
    buyer_name: form.buyer_name, buyer_id: form.buyer_id,
    buyer_vat_code: form.buyer_vat_code,
    buyer_address: form.buyer_address,
    buyer_phone: form.buyer_phone, buyer_email: form.buyer_email,
    buyer_bank_name: form.buyer_bank_name,
    buyer_iban: form.buyer_iban, buyer_swift: form.buyer_swift,
    buyer_extra_info: form.buyer_extra_info,
    buyer_delivery_address: form.buyer_delivery_address,
    buyer_country: form.buyer_country, buyer_country_iso: form.buyer_country_iso,
    amount_wo_vat: round2(totals.base),
    vat_amount: round2(totals.vat),
    amount_with_vat: round2(totals.grand),
    invoice_discount_wo_vat: round2(totals.totalDiscount),
    issued_by: form.issued_by, received_by: form.received_by,
    auto_create_sf_on_paid: form.invoice_type === 'isankstine' ? form.auto_create_sf_on_paid : false,
    auto_sf_series: form.auto_create_sf_on_paid ? form.auto_sf_series : '',
    auto_sf_send: form.auto_create_sf_on_paid ? form.auto_sf_send : false,
    send_payment_reminders: form.send_payment_reminders,
    line_items: lineItems.map((li, i) => ({
      sort_order: i,
      prekes_pavadinimas: li.prekes_pavadinimas,
      prekes_kodas: li.prekes_kodas,
      prekes_barkodas: li.prekes_barkodas,
      quantity: parseNum(li.quantity),
      unit: li.unit,
      price: parseNum(li.price),
      subtotal: round2(lineSums[i]?.net || 0),
      vat_percent: showPerLineVat && li.vat_percent !== '' ? parseNum(li.vat_percent) : null,
      discount_wo_vat: round2(lineSums[i]?.lineDiscount || 0),
      preke_paslauga: li.preke_paslauga || '',
    })),
  });

  const buildRecurringPayload = () => ({
    invoice_type: form.invoice_type,
    document_series: form.document_series,
    currency: form.currency,
    pvm_tipas: form.pvm_tipas,
    vat_percent: parseNum(form.vat_percent),
    note: showNote ? form.note : '',
    order_number: form.order_number,
    public_link_enabled: form.public_link_enabled,
    start_date: recurringForm.start_date || null,
    end_date: recurringForm.end_type === 'date' ? (recurringForm.end_date || null) : null,
    frequency: recurringForm.first_day_of_month || recurringForm.last_day_of_month ? 'monthly' : recurringForm.period_type,
    interval: recurringForm.first_day_of_month || recurringForm.last_day_of_month ? 1 : (recurringForm.interval || 1),
    first_day_of_month: recurringForm.first_day_of_month,
    last_day_of_month: recurringForm.last_day_of_month,
    payment_term_days: parseInt(recurringForm.payment_term_days, 10) || 0,
    max_count: recurringForm.end_type === 'count' ? (parseInt(recurringForm.max_count, 10) || null) : null,
    auto_issue: true,
    auto_send: !!form.buyer_email,
    send_to_email: form.buyer_email || '',
    send_payment_reminders: form.send_payment_reminders,
    auto_create_sf_on_paid: form.invoice_type === 'isankstine' ? form.auto_create_sf_on_paid : false,
    auto_sf_series: form.auto_create_sf_on_paid ? form.auto_sf_series : '',
    auto_sf_send: form.auto_create_sf_on_paid ? form.auto_sf_send : false,
    seller_type: form.seller_type,
    seller_name: form.seller_name, seller_id: form.seller_id,
    seller_vat_code: form.seller_vat_code,
    seller_address: form.seller_address,
    seller_country: form.seller_country, seller_country_iso: form.seller_country_iso,
    seller_phone: form.seller_phone, seller_email: form.seller_email,
    seller_bank_name: form.seller_bank_name,
    seller_iban: form.seller_iban, seller_swift: form.seller_swift,
    seller_extra_info: form.seller_extra_info,
    buyer_type: form.buyer_type,
    buyer_counterparty: form.buyer_counterparty || null,
    buyer_name: form.buyer_name, buyer_id: form.buyer_id,
    buyer_vat_code: form.buyer_vat_code,
    buyer_address: form.buyer_address,
    buyer_country: form.buyer_country, buyer_country_iso: form.buyer_country_iso,
    buyer_phone: form.buyer_phone, buyer_email: form.buyer_email,
    buyer_bank_name: form.buyer_bank_name,
    buyer_iban: form.buyer_iban, buyer_swift: form.buyer_swift,
    buyer_extra_info: form.buyer_extra_info,
    buyer_delivery_address: form.buyer_delivery_address,
    issued_by: form.issued_by, received_by: form.received_by,
    line_items: lineItems.map((li, i) => ({
      sort_order: i,
      prekes_pavadinimas: li.prekes_pavadinimas,
      prekes_kodas: li.prekes_kodas,
      prekes_barkodas: li.prekes_barkodas,
      quantity: parseNum(li.quantity),
      unit: li.unit,
      price: parseNum(li.price),
      vat_percent: showPerLineVat && li.vat_percent !== '' ? parseNum(li.vat_percent) : null,
      discount_wo_vat: round2(lineSums[i]?.lineDiscount || 0),
      preke_paslauga: li.preke_paslauga || '',
    })),
  });

  const handleSave = async (andAction) => {
    setFieldErrors({});

    // ── Recurring flow ──
    if (isRecurring) {
      const errs = [];
      if (!form.document_series) errs.push('Serija');
      if (!recurringForm.start_date) errs.push('Pirmos sąskaitos data');
      const today = new Date().toISOString().split('T')[0];
      if (recurringForm.start_date && recurringForm.start_date < today) {
        errs.push('Pirmos sąskaitos data negali būti praeityje');
      }
      if (!form.seller_name) errs.push('Pardavėjo pavadinimas');
      if (!form.seller_id) errs.push('Pardavėjo įmonės kodas');
      if (!form.buyer_name) errs.push('Pirkėjo pavadinimas');
      if (!form.buyer_id) errs.push('Pirkėjo įmonės kodas');
      const hasValidLine = lineItems.some((li) => li.prekes_pavadinimas.trim() && parseNum(li.quantity) > 0 && li.unit.trim());
      if (!hasValidLine) errs.push('Bent viena užpildyta eilutė');
      if (recurringForm.end_type === 'date' && recurringForm.end_date && recurringForm.end_date < recurringForm.start_date) {
        errs.push('Pabaigos data negali būti ankstesnė už pradžios datą');
      }
      if (errs.length > 0) { showMsg(`Užpildykite: ${errs.join(', ')}`, 'error'); return; }
      setSaving(true);
      try {
        const payload = buildRecurringPayload();
        let res;
        if (recurringEditId) {
          res = await invoicingApi.updateRecurringInvoice(recurringEditId, payload);
          showMsg('Periodinė sąskaita atnaujinta');
        } else {
          res = await invoicingApi.createRecurringInvoice(payload);
          if (res.data?.first_invoice_generated) {
            if (res.data?.first_invoice_sent) {
              showMsg('Periodinė sąskaita sukurta. Pirmoji sąskaita išrašyta ir išsiųsta klientui.');
            } else {
              showMsg('Periodinė sąskaita sukurta. Pirmoji sąskaita išrašyta.');
            }
          } else {
            showMsg('Periodinė sąskaita sukurta');
          }
        }
        if (saveBuyerAsClient && form.buyer_name) {
          try {
            await invoicingApi.createCounterparty({
              name: form.buyer_name, company_code: form.buyer_id,
              vat_code: form.buyer_vat_code, address: form.buyer_address,
              phone: form.buyer_phone, email: form.buyer_email,
              bank_name: form.buyer_bank_name, iban: form.buyer_iban, swift: form.buyer_swift,
              default_role: 'buyer', extra_info: form.buyer_extra_info || '',
              notes: form.buyer_extra_info || '', delivery_address: form.buyer_delivery_address || '',
              is_person: form.buyer_type === 'fizinis',
            });
          } catch { /* дубликат — ок */ }
          setSaveBuyerAsClient(false);
        }
        for (const li of lineItems) {
          if (li.save_to_catalog && li.prekes_pavadinimas) {
            try {
              const unitObj = availableUnits.find((u) => u.code === li.unit);
              await invoicingApi.createProduct({
                pavadinimas: li.prekes_pavadinimas, kodas: li.prekes_kodas || '',
                barkodas: li.prekes_barkodas || '', pardavimo_kaina: parseNum(li.price),
                pvm_procentas: li.vat_percent !== '' ? parseNum(li.vat_percent) : null,
                measurement_unit: unitObj?.id || null,
                preke_paslauga: li.preke_paslauga || 'preke',
              });
            } catch { /* duplicate — ok */ }
          }
        }
        if (lastSnackRef.current) {
          sessionStorage.setItem('inv_snack', JSON.stringify(lastSnackRef.current));
        }
        navigate('/israsymas', { replace: true });
      } catch (e) {
        const d = e.response?.data;
        let msg = 'Klaida saugant periodinę sąskaitą';
        if (typeof d === 'string') msg = d;
        else if (d?.detail) msg = d.detail;
        else if (typeof d === 'object') msg = Object.values(d).flat().join(', ');
        showMsg(msg, 'error');
      } finally { setSaving(false); }
      return;
    }

    // ── Normal invoice flow ──
    if (!form.document_series) { showMsg('Pasirinkite seriją prieš saugant', 'error'); return; }
    if (customNumberMode && numberError) { showMsg('Numeris jau užimtas, pasirinkite kitą', 'error'); return; }

    if (andAction === 'issue' || andAction === 'issue_send') {
      const errs = [];
      const fe = {};
      if (!form.invoice_date) { errs.push('Sąskaitos data'); fe.invoice_date = true; }
      if (!form.seller_name) { errs.push('Pardavėjo pavadinimas'); fe.seller_name = true; }
      if (!form.seller_id) { errs.push('Pardavėjo įmonės kodas'); fe.seller_id = true; }
      if (!form.buyer_name) { errs.push('Pirkėjo pavadinimas'); fe.buyer_name = true; }
      if (!form.buyer_id) { errs.push('Pirkėjo įmonės kodas'); fe.buyer_id = true; }
      if (andAction === 'issue_send') {
        const emailIssue = getEmailIssue(form.buyer_email);

        if (emailIssue === 'missing') {
          errs.push('Pirkėjo el. paštas nenurodytas');
          fe.buyer_email = true;
        }

        if (emailIssue === 'invalid') {
          errs.push('Pirkėjo el. paštas neteisingas');
          fe.buyer_email = true;
        }
      }
      if (!form.document_series) { errs.push('Serija'); fe.document_series = true; }

      const lineErrors = [];
      lineItems.forEach((li, idx) => {
        const n = idx + 1;
        if (!li.prekes_pavadinimas.trim()) { lineErrors.push(`Eilutė ${n}: pavadinimas`); fe[`line_${idx}_name`] = true; }
        if (!li.prekes_kodas.trim()) { lineErrors.push(`Eilutė ${n}: prekės kodas`); fe[`line_${idx}_code`] = true; }
        if (parseNum(li.quantity) <= 0) { lineErrors.push(`Eilutė ${n}: kiekis`); fe[`line_${idx}_qty`] = true; }
        if (!li.unit.trim()) { lineErrors.push(`Eilutė ${n}: mato vienetas`); fe[`line_${idx}_unit`] = true; }
        if (li.price === '' || li.price === null || li.price === undefined) { lineErrors.push(`Eilutė ${n}: kaina`); fe[`line_${idx}_price`] = true; }
      });
      if (lineErrors.length > 0) { errs.push(...lineErrors); fe.line_items = true; }
      setFieldErrors(fe);
      if (errs.length > 0) { showMsg(`Užpildykite: ${errs.join(', ')}`, 'error'); return; }
    }

    if (showTotalDiscount && totals.totalDiscount > totals.sumLines) {
      showMsg('Nuolaida negali viršyti bendros sumos be PVM', 'error'); return;
    }

    setSaving(true);
    try {
      const payload = buildPayload();
      let res;
      if (isNew) res = await invoicingApi.createInvoice(payload);
      else res = await invoicingApi.updateInvoice(id, payload);
      const newId = res.data?.id;

      let paymentLinkError = false;
      if (!isRecurring && paymentLink.enabled && paymentLink.provider && (newId || id)) {
        try {
          await api.post(
            `/invoicing/invoices/${newId || id}/generate-payment-link/`,
            { provider: paymentLink.provider },
            { withCredentials: true },
          );
        } catch (e) { paymentLinkError = true; }
      }

      if (saveBuyerAsClient && form.buyer_name) {
        try {
          await invoicingApi.createCounterparty({
            name: form.buyer_name, company_code: form.buyer_id,
            vat_code: form.buyer_vat_code, address: form.buyer_address,
            phone: form.buyer_phone, email: form.buyer_email,
            bank_name: form.buyer_bank_name, iban: form.buyer_iban, swift: form.buyer_swift,
            default_role: 'buyer', extra_info: form.buyer_extra_info || '',
            notes: form.buyer_extra_info || '', delivery_address: form.buyer_delivery_address || '',
            is_person: form.buyer_type === 'fizinis',
          });
        } catch { /* дубликат — ок */ }
        setSaveBuyerAsClient(false);
      }

      for (const li of lineItems) {
        if (li.save_to_catalog && li.prekes_pavadinimas) {
          try {
            const unitObj = availableUnits.find((u) => u.code === li.unit);
            await invoicingApi.createProduct({
              pavadinimas: li.prekes_pavadinimas, kodas: li.prekes_kodas || '',
              barkodas: li.prekes_barkodas || '', pardavimo_kaina: parseNum(li.price),
              pvm_procentas: li.vat_percent !== '' ? parseNum(li.vat_percent) : null,
              measurement_unit: unitObj?.id || null,
              preke_paslauga: li.preke_paslauga || 'preke',
            });
          } catch { /* duplicate — ok */ }
        }
      }

      if (isNew && newId) {
        if (andAction === 'issue') {
          await invoicingApi.issueInvoice(newId);
          showMsg(paymentLinkError ? 'Sąskaita sukurta ir išrašyta, bet nepavyko sukurti mokėjimo nuorodos' : 'Sąskaita sukurta ir išrašyta', paymentLinkError ? 'warning' : 'success');
        } else if (andAction === 'issue_send') {
          await invoicingApi.issueInvoice(newId);
          if (form.buyer_email) {
            try {
              const sendRes = await invoicingApi.sendInvoiceEmail(newId, form.buyer_email);
              const sd = sendRes.data || {};
              if (sd.inv_status === 'free' && sd.emails_used != null && sd.was_new_email) {
                const { emails_used, emails_max } = sd;
                if (emails_used >= emails_max) {
                  showMsg(`Sąskaita išrašyta ir išsiųsta. Mėnesio limitas pasiektas: ${emails_used}/${emails_max}. Įsigykite planą neribotam naudojimui.`, 'warning');
                } else if (emails_used >= emails_max * 0.5) {
                  showMsg(`Sąskaita išrašyta ir išsiųsta. Šį mėnesį išsiųsta ${emails_used}/${emails_max} sąskaitų el. paštu.`, 'info');
                } else {
                  showMsg(paymentLinkError ? 'Sąskaita sukurta, išrašyta ir išsiųsta, bet nepavyko sukurti mokėjimo nuorodos' : 'Sąskaita sukurta, išrašyta ir išsiųsta', paymentLinkError ? 'warning' : 'success');
                }
              } else {
                showMsg(paymentLinkError ? 'Sąskaita sukurta, išrašyta ir išsiųsta, bet nepavyko sukurti mokėjimo nuorodos' : 'Sąskaita sukurta, išrašyta ir išsiųsta', paymentLinkError ? 'warning' : 'success');
              }
            } catch (sendErr) {
              if (sendErr.response?.status === 403 && sendErr.response?.data?.error === 'limit_reached') {
                showMsg(`Sąskaita išrašyta, bet neišsiųsta: ${sendErr.response.data.message}`, 'warning');
              } else {
                showMsg('Sąskaita išrašyta, bet nepavyko išsiųsti el. laišku', 'warning');
              }
            }
          } else {
            showMsg(paymentLinkError ? 'Sąskaita sukurta ir išrašyta, bet nepavyko sukurti mokėjimo nuorodos' : 'Sąskaita sukurta ir išrašyta', paymentLinkError ? 'warning' : 'success');
          }
        } else {
          showMsg(paymentLinkError ? 'Juodraštis išsaugotas, bet nepavyko sukurti mokėjimo nuorodos' : 'Juodraštis išsaugotas', paymentLinkError ? 'warning' : 'success');
        }
      if (lastSnackRef.current) {
          sessionStorage.setItem('inv_snack', JSON.stringify(lastSnackRef.current));
        }
        navigate('/israsymas', { replace: true });
      } else {
        if (andAction === 'issue') {
          const r = await invoicingApi.issueInvoice(newId || id);
          showMsg(paymentLinkError ? 'Sąskaita išrašyta, bet nepavyko sukurti mokėjimo nuorodos' : 'Sąskaita išrašyta', paymentLinkError ? 'warning' : 'success');
          refreshForm(r.data);

        } else if (andAction === 'issue_send') {
          const r = await invoicingApi.issueInvoice(newId || id);
          if (form.buyer_email) {
            try {
              const sendRes = await invoicingApi.sendInvoiceEmail(r.data?.id || id, form.buyer_email);
              const sd = sendRes.data || {};
              if (sd.inv_status === 'free' && sd.emails_used != null && sd.was_new_email) {
                const { emails_used, emails_max } = sd;
                if (emails_used >= emails_max) {
                  showMsg(`Sąskaita išrašyta ir išsiųsta. Mėnesio limitas pasiektas: ${emails_used}/${emails_max}. Įsigykite planą neribotam naudojimui.`, 'warning');
                } else if (emails_used >= emails_max * 0.5) {
                  showMsg(`Sąskaita išrašyta ir išsiųsta. Šį mėnesį išsiųsta ${emails_used}/${emails_max} sąskaitų el. paštu.`, 'info');
                } else {
                  showMsg(paymentLinkError ? 'Sąskaita sukurta, išrašyta ir išsiųsta, bet nepavyko sukurti mokėjimo nuorodos' : 'Sąskaita sukurta, išrašyta ir išsiųsta', paymentLinkError ? 'warning' : 'success');
                }
              } else {
                showMsg(paymentLinkError ? 'Sąskaita sukurta, išrašyta ir išsiųsta, bet nepavyko sukurti mokėjimo nuorodos' : 'Sąskaita sukurta, išrašyta ir išsiųsta', paymentLinkError ? 'warning' : 'success');
              }
            } catch (sendErr) {
              if (sendErr.response?.status === 403 && sendErr.response?.data?.error === 'limit_reached') {
                showMsg(`Sąskaita išrašyta, bet neišsiųsta: ${sendErr.response.data.message}`, 'warning');
              } else {
                showMsg('Sąskaita išrašyta, bet nepavyko išsiųsti el. laišku', 'warning');
              }
            }
          } else {
            showMsg(paymentLinkError ? 'Sąskaita išrašyta, bet nepavyko sukurti mokėjimo nuorodos' : 'Sąskaita išrašyta', paymentLinkError ? 'warning' : 'success');
          }
          refreshForm(r.data);
        } else {
          showMsg(paymentLinkError ? 'Išsaugota, bet nepavyko sukurti mokėjimo nuorodos' : 'Išsaugota', paymentLinkError ? 'warning' : 'success');
          refreshForm(res.data);
        }
      }
    } catch (e) {
      const d = e.response?.data;
      let msg = 'Klaida saugant';
      if (typeof d === 'string') msg = d;
      else if (d?.detail) msg = d.detail;
      else if (typeof d === 'object') msg = Object.values(d).flat().join(', ');
      showMsg(msg, 'error');
    } finally { setSaving(false); }
  };

  const showMsg = (msg, sev = 'success') => {
    lastSnackRef.current = { msg, severity: sev };
    setSnack({ open: true, msg, severity: sev });
  };

  const showLockedMsg = (feature) => {
    const messages = {
      recurring: "Periodinės sąskaitos veikia tik su mokamu planu.",
      auto_reminders: "Automatiniai apmokėjimo priminimai veikia tik su mokamu planu.",
      payment_links: "Mokėjimo nuorodos veikia tik su mokamu planu.",
      email_limit: "Pasiektas mėnesio el. pašto limitas. Įsigykite mokamą planą neribotam naudojimui.",
    };
    showMsg(messages[feature] || "Ši funkcija veikia tik su mokamu planu.", "warning");
  };

  const refreshForm = (data) => {
    if (!data) return;
    setInvoiceData(data);
    setForm((p) => ({
      ...p,
      status: data.status || p.status,
      full_number: data.full_number || p.full_number,
      document_series: data.document_series || p.document_series,
      document_number: data.document_number || p.document_number,
      is_editable: data.is_editable ?? false,
      can_be_sent: data.can_be_sent ?? false,
      can_create_pvm_sf: data.can_create_pvm_sf ?? false,
      pdf_url: data.pdf_url || null,
      public_url: data.public_url || null,
    }));
  };

  const doAction = async (action) => {
    if (action === 'duplicate') { navigate(`/israsymas/nauja?from=${id}`); return; }
    if (action === 'send') return; // handled inline in header button
    setSaving(true);
    try {
      let res;
      switch (action) {
        case 'paid': res = await invoicingApi.markPaid(id); break;
        case 'cancel': res = await invoicingApi.cancelInvoice(id); break;
        case 'create_pvm_sf':
          res = await invoicingApi.createPvmSf(id);
          if (res.data?.id) navigate(`/israsymas/${res.data.id}`);
          showMsg('SF sukurta'); return;
        default: return;
      }
      showMsg('Atlikta');
      refreshForm(res?.data);
    } catch (e) { showMsg(e.response?.data?.detail || 'Klaida', 'error'); }
    finally { setSaving(false); }
  };

  const confirm = (title, text, action) => setConfirmDialog({ open: true, title, text, action });

  const recurringMode = isRecurring ? 'recurring' : 'single';

  const handleRecurringModeChange = (_, value) => {
    if (!value) return;
    if (value === 'recurring' && recurringLocked) {
      showLockedMsg("recurring");
      return;
    }
    setIsRecurring(value === 'recurring');
  };

  const buildLocalRecurringDates = useCallback((count = 6) => {
    const start = parseLocalDate(recurringForm.start_date);
    if (!start) return [];

    const endDate = recurringForm.end_type === 'date'
      ? parseLocalDate(recurringForm.end_date)
      : null;

    const maxCount = recurringForm.end_type === 'count'
      ? (parseInt(recurringForm.max_count || '0', 10) || null)
      : null;

    const interval = Number(recurringForm.interval) || 1;
    const anchorDay = start.getDate();

    const dates = [start];
    let current = start;

    while (dates.length < count) {
      if (maxCount && dates.length >= maxCount) break;

      let next = null;

      if (recurringForm.first_day_of_month) {
        next = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      } else if (recurringForm.last_day_of_month) {
        next = new Date(current.getFullYear(), current.getMonth() + 2, 0);
      } else if (recurringForm.period_type === 'daily') {
        next = addDaysLocal(current, interval);
      } else if (recurringForm.period_type === 'weekly') {
        next = addDaysLocal(current, interval * 7);
      } else {
        next = addMonthsClamped(current, interval, anchorDay);
      }

      if (!next) break;

      if (
        endDate &&
        startOfLocalDay(next).getTime() > startOfLocalDay(endDate).getTime()
      ) {
        break;
      }

      dates.push(next);
      current = next;
    }

    return dates;
  }, [recurringForm]);

  const localRecurringDates = useMemo(
    () => buildLocalRecurringDates(6),
    [buildLocalRecurringDates],
  );

  const serverFutureDates = useMemo(
    () => (recurringPlan.future || [])
      .map(parseLocalDate)
      .filter(Boolean),
    [recurringPlan.future],
  );

  const isSavedRecurring = !!recurringEditId;

  const planNextDate = isSavedRecurring
    ? (serverFutureDates[0] || null)
    : (localRecurringDates[1] || null);

  const planPreviewDates = isSavedRecurring
    ? serverFutureDates
    : localRecurringDates;

  const remainingCount = recurringForm.end_type === 'count' && recurringForm.max_count
    ? Math.max(
        (parseInt(recurringForm.max_count, 10) || 0) - (recurringServerMeta.generation_count || 0),
        0,
      )
    : null;

  // ═══════════════════════════════════════════════════════════
  // Render helpers
  // ═══════════════════════════════════════════════════════════
  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  const priceLabel = isPvm ? 'Kaina be PVM *' : 'Kaina *';
  const sumLabel = isPvm ? 'Suma be PVM' : 'Suma';
  const noSeriesSelected = !form.document_series;

  const renderNameField = (i, li) => {
    const isSearchActive = searchActiveLine === i;
    if (isSearchActive && isEditable) {
      const key = `${i}_name`;
      return (
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <Tooltip title="Uždaryti paiešką">
            <IconButton size="small"
              onMouseDown={(e) => { e.preventDefault(); searchBtnRef.current = true; }}
              onClick={() => { setSearchActiveLine(null); searchBtnRef.current = false; }}
              sx={{
                width: 40,
                height: 40,
                border: `1px solid ${P.primary}`,
                borderRadius: 2,
                backgroundColor: P.primary,
                flexShrink: 0,
                alignSelf: 'stretch',
                '&:hover': { backgroundColor: '#1565c0' },
              }}>
              <SearchIcon sx={{ fontSize: 18, color: '#fff' }} />
            </IconButton>
          </Tooltip>
          <Autocomplete freeSolo size="small" open autoFocus fullWidth
            options={productOptions[key] || []}
            getOptionLabel={(o) => typeof o === 'string' ? o : o.prekes_pavadinimas || o.name || ''}
            inputValue={li.prekes_pavadinimas}
            onInputChange={(_, v, reason) => { if (reason === 'input') { uLine(i, 'prekes_pavadinimas', v); searchProducts(i, v); } }}
            onChange={(_, v) => { if (v && typeof v !== 'string') selectProduct(i, v); setSearchActiveLine(null); }}
            onClose={(_, reason) => { if (searchBtnRef.current) { searchBtnRef.current = false; return; } if (reason === 'escape') setSearchActiveLine(null); }}
            loading={productSearchLoading[key] || false}
            filterOptions={(x) => x}
            disableClearable
            componentsProps={{ popper: { disablePortal: false, sx: { zIndex: 1500 } } }}
            renderOption={(props, o) => (
              <li {...props} key={o.id || `${o.prekes_kodas}-${o.prekes_pavadinimas}`}>
                <Box>
                  <Typography variant="body2" fontWeight={600}>{o.prekes_pavadinimas || o.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {[o.prekes_kodas || o.code, o.prekes_barkodas || o.barcode].filter(Boolean).join(' · ')}
                    {o.price != null && ` · ${fmt2(parseNum(o.price))} ${sym}`}
                  </Typography>
                </Box>
              </li>
            )}
            renderInput={(params) => (
              <TextField {...params} autoFocus fullWidth placeholder="Ieškoti prekę / paslaugą..." />
            )}
          />
        </Box>
      );
    }

    const isFromSearch = linesFromSearch.has(i);
    return (
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
        {isEditable && (
          <Tooltip title="Ieškoti iš prekių katalogo">
            <IconButton size="small" onClick={() => activateSearch(i)}
              sx={{
                width: 40,
                height: 40,
                border: `1px solid ${P.border}`,
                borderRadius: 2,
                backgroundColor: '#fff',
                flexShrink: 0,
                alignSelf: 'stretch',
                '&:hover': {
                  backgroundColor: '#f3f7fb',
                  borderColor: '#c9d4e3',
                },
              }}>
              <SearchIcon sx={{ fontSize: 18, color: P.primary }} />
            </IconButton>
          </Tooltip>
        )}
        <DebouncedField size="small" fullWidth
          value={li.prekes_pavadinimas}
          onChange={(v) => uLine(i, 'prekes_pavadinimas', v)}
          disabled={!isEditable}
          placeholder="Pavadinimas *"
          error={!!fieldErrors[`line_${i}_name`]}
          InputProps={isFromSearch && li.prekes_pavadinimas ? {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => clearProductFields(i)} tabIndex={-1} sx={{ p: 0.25 }}>
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </InputAdornment>
            ),
          } : undefined}
        />
      </Box>
    );
  };

  const renderUnitField = (i, li, width) => (
    <TextField size="small" select label="Mato vnt. *"
      value={li.unit || ''}
      error={!!fieldErrors[`line_${i}_unit`]}
      onChange={(e) => {
        if (e.target.value === '__new_unit__') { setNewUnitForLine(i); setNewUnitDialog(true); return; }
        uLine(i, 'unit', e.target.value);
      }}
      disabled={!isEditable}
      SelectProps={{ MenuProps: { disableScrollLock: true, PaperProps: { sx: { maxHeight: 300, minWidth: 180 } } } }}
      sx={width ? { width, minWidth: width } : undefined}
    >
      <MenuItem value="__new_unit__" sx={{ borderBottom: '1px solid #eee', py: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'primary.main' }}>
          <AddIcon sx={{ fontSize: 18 }} />
          <Typography variant="body2" sx={{ fontWeight: 400 }}>Sukurti naują</Typography>
        </Box>
      </MenuItem>
      {availableUnits.filter((u) => u.is_active).map((u) => (
        <MenuItem key={u.id} value={u.code}>
          <strong>{u.code}</strong>&nbsp;<Typography component="span" variant="body2" color="text.secondary">({u.name})</Typography>
        </MenuItem>
      ))}
    </TextField>
  );

  // ═══════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════
  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 4, '& .MuiOutlinedInput-root': { backgroundColor: '#fff' } }}>

        {/* ─── Header ─── */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton onClick={() => navigate('/israsymas')} size="small"><BackIcon /></IconButton>
            <Typography variant="h1" sx={{ color: P.primary, fontWeight: 500, fontSize: 22 }}>
              {recurringEditId ? 'Redaguoti periodinę sąskaitą' : recurringCopyId ? 'Kopijuoti periodinę sąskaitą' : isNew ? 'Nauja sąskaita' : (form.full_number || 'Sąskaita')}
            </Typography>
            {!isNew && <Chip label={STATUS_CFG[form.status]?.label || form.status} color={STATUS_CFG[form.status]?.color || 'default'} size="small" />}
          </Box>
          {!isNew && form.status !== 'draft' && (
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {['issued', 'sent', 'paid', 'partially_paid', 'cancelled'].includes(form.status) && (
                <Button size="small" variant="outlined" startIcon={<PdfIcon />}
                  onClick={async () => {
                    try {
                      const response = await invoicingApi.getInvoicePdf(id);
                      const blob = new Blob([response.data], { type: 'application/pdf' });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${form.full_number || id}.pdf`;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      document.body.removeChild(a);
                    } catch {
                      showMsg('Nepavyko atsisiųsti PDF', 'error');
                    }
                  }}
                >
                  Atsisiųsti PDF
                </Button>
              )}
              {form.can_be_sent && (
                <Button size="small" variant="contained" startIcon={<SendIcon />}
                  onClick={async () => {
                    const emailIssue = getEmailIssue(form.buyer_email);
                    if (emailIssue) {
                      showMsg(emailIssue === 'missing' ? 'Nenurodytas gavėjo el. pašto adresas' : 'Neteisingas gavėjo el. pašto adresas', 'error');
                      return;
                    }
                    setSaving(true);
                    try {
                      const res = await invoicingApi.sendInvoiceEmail(id, form.buyer_email);
                      const sd = res.data || {};
                      if (sd.needs_confirm) {
                        setSaving(false);
                        const sentDate = sd.last_sent_at ? new Date(sd.last_sent_at).toLocaleString('lt-LT') : '';
                        setConfirmDialog({
                          open: true,
                          title: 'Pakartotinis siuntimas',
                          text: `Ši sąskaita jau buvo išsiųsta${sentDate ? ` ${sentDate}` : ''} adresu ${sd.last_sent_to || form.buyer_email}. Išsiųsta: ${sd.total_sent}/${sd.max_count}. Ar tikrai norite siųsti dar kartą?`,
                          action: async () => {
                            setSaving(true);
                            try {
                              const r2 = await invoicingApi.sendInvoiceEmail(id, form.buyer_email, true);
                              const sd2 = r2.data || {};
                              if (sd2.inv_status === 'free' && sd2.emails_used != null && sd2.was_new_email) {
                                if (sd2.emails_used >= sd2.emails_max) {
                                  showMsg(`Sąskaita išsiųsta. Mėnesio limitas pasiektas: ${sd2.emails_used}/${sd2.emails_max}. Įsigykite planą neribotam naudojimui.`, 'warning');
                                } else if (sd2.emails_used >= sd2.emails_max * 0.5) {
                                  showMsg(`Sąskaita išsiųsta. Šį mėnesį išsiųsta ${sd2.emails_used}/${sd2.emails_max} sąskaitų el. paštu.`, 'info');
                                } else {
                                  showMsg('El. laiškas išsiųstas klientui');
                                }
                              } else {
                                showMsg('El. laiškas išsiųstas klientui');
                              }
                              refreshForm(r2.data);
                            } catch (e) {
                              if (e.response?.status === 403 && e.response?.data?.error === 'limit_reached') {
                                showMsg(e.response.data.message, 'error');
                              } else {
                                showMsg(e.response?.data?.detail || 'Nepavyko išsiųsti', 'error');
                              }
                            } finally { setSaving(false); }
                          },
                        });
                        return;
                      }
                      if (sd.inv_status === 'free' && sd.emails_used != null && sd.was_new_email) {
                        if (sd.emails_used >= sd.emails_max) {
                          showMsg(`Sąskaita išsiųsta. Mėnesio limitas pasiektas: ${sd.emails_used}/${sd.emails_max}. Įsigykite planą neribotam naudojimui.`, 'warning');
                        } else if (sd.emails_used >= sd.emails_max * 0.5) {
                          showMsg(`Sąskaita išsiųsta. Šį mėnesį išsiųsta ${sd.emails_used}/${sd.emails_max} sąskaitų el. paštu.`, 'info');
                        } else {
                          showMsg('El. laiškas išsiųstas klientui');
                        }
                      } else {
                        showMsg('El. laiškas išsiųstas klientui');
                      }
                      refreshForm(res.data);
                    } catch (e) {
                      if (e.response?.status === 403 && e.response?.data?.error === 'limit_reached') {
                        showMsg(e.response.data.message, 'error');
                      } else {
                        showMsg(e.response?.data?.detail || 'Nepavyko išsiųsti', 'error');
                      }
                    } finally { setSaving(false); }
                  }}
                >
                  Siųsti klientui
                </Button>
              )}
              {['issued', 'sent'].includes(form.status) && (
                <Button size="small" variant="contained" color="success" startIcon={<PaidIcon />} onClick={() => doAction('paid')}>
                  Pažymėti apmokėta
                </Button>
              )}
              {form.can_create_pvm_sf && (
                <Button size="small" variant="contained" color="secondary" startIcon={<PvmSfIcon />} onClick={() => doAction('create_pvm_sf')}>
                  Konvertuoti į {form.pvm_tipas === 'taikoma' ? 'PVM SF' : 'SF'}
                </Button>
              )}
              {form.status !== 'cancelled' && (
                <Button size="small" variant="outlined" color="error" startIcon={<CancelIcon />}
                  onClick={() => confirm('Anuliuoti?', '', () => doAction('cancel'))}>
                  Anuliuoti
                </Button>
              )}
              <Button size="small" variant="outlined" startIcon={<DuplicateIcon />} onClick={() => doAction('duplicate')}>
                Kopijuoti į naują
              </Button>
            </Stack>
          )}
        </Box>

        {/* ─── Sąskaitos režimas ─── */}
        {isEditable && (isNew || form.status === 'draft') && (
          <Box sx={{ mb: 2.5 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.75 }}>
              <ToggleButtonGroup
                exclusive
                value={recurringMode}
                onChange={handleRecurringModeChange}
                size="small"
                sx={segmentedGroupSx}
              >
                <ToggleButton value="single">Vienkartinė sąskaita</ToggleButton>
                <ToggleButton value="recurring" sx={recurringLocked ? { opacity: 0.6 } : {}}>
                  {recurringLocked && <LockOutlinedIcon sx={{ fontSize: 15, mr: 0.5, color: '#d32f2f' }} />}
                  Periodinė sąskaita
                </ToggleButton>
              </ToggleButtonGroup>

              <Typography variant="caption" sx={{ color: P.textMuted, pl: 0.5 }}>
                Pasirinkite, ar sąskaita bus vienkartinė, ar periodinė
              </Typography>
            </Box>

            <Collapse in={isRecurring}>
              <Box sx={recurringWrapSx}>
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
                    <Typography sx={{ fontSize: 18, fontWeight: 700, color: P.primary }}>
                      Periodiškumo nustatymai
                    </Typography>
                    <InlineHelpTooltip
                      title="Periodinės sąskaitos bus išrašomos ir siunčiamos pasirinktu dažnumu jūsų klientui, priskiriant pasirinktą seriją ir sekantį laisvą sąskaitos numerį. Periodinės sąskaitos išsiunčiamos nuo 9:00 iki 10:00 ryto pasirinktą dieną."
                    />
                  </Box>

                  <Typography variant="body2" sx={{ color: P.textMuted, mt: 0.25 }}>
                    Nustatykite pirmą išrašymo datą, dažnumą ir kada siuntimą sustabdyti.
                  </Typography>
                </Box>

                <Grid2 container spacing={1.5}>
                  {/* Pirmoji sąskaita */}
                  <Grid2 size={{ xs: 12, md: 4 }}>
                    <Box sx={recurringInnerCardSx}>
                      <Typography sx={{ ...recurringSectionTitleSx, mb: 1.25 }}>
                        Pirmoji sąskaita
                      </Typography>

                      <Grid2 container spacing={1.25}>
                        <Grid2 size={12}>
                          <DateField
                            label="Pirmos sąskaitos data"
                            value={recurringForm.start_date}
                            onChange={(v) => uRec('start_date', v)}
                            disabled={!isEditable}
                          />
                        </Grid2>

                        <Grid2 size={12}>
                          <DebouncedIntField
                            fullWidth
                            label="Apmokėjimo terminas"
                            value={recurringForm.payment_term_days}
                            onChange={(v) => uRec('payment_term_days', v)}
                            disabled={!isEditable}
                            max={365}
                            InputProps={{
                              endAdornment: <InputAdornment position="end">d.</InputAdornment>,
                            }}
                          />
                        </Grid2>
                      </Grid2>
                    </Box>
                  </Grid2>

                  {/* Dažnumas */}
                  <Grid2 size={{ xs: 12, md: 4 }}>
                    <Box sx={recurringInnerCardSx}>
                      <Typography sx={{ ...recurringSectionTitleSx, mb: 1.25 }}>
                        Dažnumas
                      </Typography>

                      <Grid2 container spacing={1.25} sx={{ mb: 1 }}>
                        <Grid2 size={12}>
                          <TextField
                            fullWidth
                            select
                            label="Periodiškumas"
                            value={recurringForm.period_type}
                            onChange={(e) => {
                              const newType = e.target.value;
                              uRec('period_type', newType);
                              uRec('interval', 1);
                              uRec('first_day_of_month', false);
                              uRec('last_day_of_month', false);
                            }}
                            disabled={!isEditable || recurringForm.first_day_of_month || recurringForm.last_day_of_month}
                            SelectProps={{ MenuProps: menuProps }}
                          >
                            {PERIOD_TYPE_OPTIONS.map((o) => (
                              <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                            ))}
                          </TextField>
                        </Grid2>

                        <Grid2 size={12}>
                          <TextField
                            fullWidth
                            select
                            label="Dažnis"
                            value={recurringForm.interval}
                            onChange={(e) => uRec('interval', e.target.value)}
                            disabled={!isEditable || recurringForm.first_day_of_month || recurringForm.last_day_of_month}
                            SelectProps={{ MenuProps: menuProps }}
                          >
                            {(FREQUENCY_OPTIONS[recurringForm.period_type] || []).map((o) => (
                              <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                            ))}
                          </TextField>
                        </Grid2>
                      </Grid2>

                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Switch
                            checked={recurringForm.first_day_of_month}
                            onChange={(e) => {
                              uRec('first_day_of_month', e.target.checked);
                              if (e.target.checked) {
                                uRec('last_day_of_month', false);
                                uRec('period_type', 'monthly');
                                uRec('interval', 1);
                              }
                            }}
                            size="small"
                          />
                          <Typography variant="body2">Kas pirma mėnesio diena</Typography>
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Switch
                            checked={recurringForm.last_day_of_month}
                            onChange={(e) => {
                              uRec('last_day_of_month', e.target.checked);
                              if (e.target.checked) {
                                uRec('first_day_of_month', false);
                                uRec('period_type', 'monthly');
                                uRec('interval', 1);
                              }
                            }}
                            size="small"
                          />
                          <Typography variant="body2">Kas paskutinė mėnesio diena</Typography>
                        </Box>
                      </Box>
                    </Box>
                  </Grid2>

                  {/* Pabaiga */}
                  <Grid2 size={{ xs: 12, md: 4 }}>
                    <Box sx={recurringInnerCardSx}>
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, mb: 1.25 }}>
                        <Typography sx={{ ...recurringSectionTitleSx, mb: 0 }}>
                          Pabaiga
                        </Typography>
                        <InlineHelpTooltip
                          title='Nepasirinkus siuntimo pabaigos sąlygos, periodinės sąskaitos bus siunčiamos tol, kol nesustabdysite jų "Sąskaitos" puslapyje.'
                          iconSize={16}
                        />
                      </Box>

                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Switch
                            checked={recurringForm.end_type === 'date'}
                            onChange={(e) => uRec('end_type', e.target.checked ? 'date' : '')}
                            size="small"
                          />
                          <Typography variant="body2">Pabaigos data</Typography>
                        </Box>

                        <Collapse in={recurringForm.end_type === 'date'}>
                          <Box sx={{ pt: 0.5, pb: 0.5 }}>
                            <DateField
                              label="Pabaigos data"
                              value={recurringForm.end_date}
                              onChange={(v) => uRec('end_date', v)}
                              disabled={!isEditable}
                            />
                          </Box>
                        </Collapse>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Switch
                            checked={recurringForm.end_type === 'count'}
                            onChange={(e) => uRec('end_type', e.target.checked ? 'count' : '')}
                            size="small"
                          />
                          <Typography variant="body2">Po sąskaitų kiekio</Typography>
                        </Box>

                        <Collapse in={recurringForm.end_type === 'count'}>
                          <Box sx={{ pt: 0.5 }}>
                            <DebouncedIntField
                              fullWidth
                              label="Sąskaitų kiekis"
                              value={recurringForm.max_count}
                              onChange={(v) => uRec('max_count', v)}
                              disabled={!isEditable}
                              max={999}
                            />
                          </Box>
                        </Collapse>
                      </Box>
                    </Box>
                  </Grid2>
                </Grid2>
              </Box>
            </Collapse>
          </Box>
        )}

        {/* ─── 1. Tipas + Serija + Numeris ─── */}
        <Box sx={{ ...secSx, pb: 4 }}>
          <Grid2 container spacing={1.5} alignItems="center" sx={{ maxWidth: 780 }}>
            <Grid2 size={{ xs: 12, sm: 5 }}>
              <TextField fullWidth select label="Dokumento tipas *" value={form.invoice_type}
                onChange={(e) => u('invoice_type', e.target.value)} disabled={!isEditable}
                SelectProps={{ MenuProps: menuProps }}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <MenuItem key={k} value={k} disabled={k === 'kreditine'}>{v}{k === 'kreditine' ? ' (ruošiama)' : ''}</MenuItem>
                ))}
              </TextField>
            </Grid2>
            <Grid2 size={{ xs: 6, sm: 4 }}>
              {isEditable ? (
                <TextField fullWidth select label="Serija *" value={form.document_series}
                  error={!!fieldErrors.document_series}
                  onChange={(e) => { if (e.target.value === '__new__') { openNewSeriesDialog(); return; } handleSeriesChange(e.target.value); }}
                  disabled={!isEditable} SelectProps={{ MenuProps: menuProps }}>
                  <MenuItem value="__new__" sx={{ borderBottom: '1px solid #eee', py: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'primary.main' }}>
                      <AddIcon sx={{ fontSize: 18 }} />
                      <Typography variant="body2" sx={{ fontWeight: 400 }}>Sukurti naują seriją</Typography>
                    </Box>
                  </MenuItem>
                  {form.document_series && !filteredSeries.some((s) => s.prefix === form.document_series) && (
                    <MenuItem key={`_current_${form.document_series}`} value={form.document_series}>
                      <Typography variant="body2" fontWeight={600}>{form.document_series}</Typography>
                    </MenuItem>
                  )}
                  {filteredSeries.map((s) => (
                    <MenuItem key={s.id || s.prefix} value={s.prefix}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" fontWeight={600}>{s.prefix}</Typography>
                        {s.name && <Typography variant="caption" color="text.secondary">{s.name}</Typography>}
                      </Box>
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <TextField fullWidth label="Serija" value={form.document_series} onChange={(e) => handleSeriesChange(e.target.value)} disabled={!isEditable} />
              )}
            </Grid2>
            <Grid2 size={{ xs: 6, sm: 3 }} sx={{ position: 'relative' }}>
              {showNumberEditor && isAutoNumberMode ? (
                <TextField fullWidth label="Numeris *"
                  value={noSeriesSelected ? '' : (customNumberMode ? form.document_number : autoNumber)}
                  disabled={!isEditable || !customNumberMode || noSeriesSelected}
                  onChange={(e) => handleCustomNumberChange(e.target.value)}
                  error={!!numberError} inputProps={{ inputMode: 'numeric' }}
                  helperText={noSeriesSelected ? 'Iš karto pasirinkite seriją' : numberError || (customNumberMode ? `Formatas: ${autoNumber || '001'}` : 'Automatiškai')}
                  sx={{ '& .MuiFormHelperText-root': { position: 'absolute', bottom: -20, left: 0 } }}
                  InputProps={{
                    endAdornment: isEditable && !noSeriesSelected && (
                      <InputAdornment position="end">
                        {numberChecking && <CircularProgress size={16} sx={{ mr: 0.5 }} />}
                        <Tooltip title={customNumberMode ? 'Grąžinti automatinį' : 'Įvesti rankiniu būdu'}>
                          <IconButton sx={{ p: 0.5 }} size="small" onClick={() => {
                            if (!customNumberMode) setCustomNumber(true);
                            else { setForm((p) => ({ ...p, document_number: autoNumber })); setNumberError(''); setCustomNumber(false); }
                          }} edge="end">
                            {customNumberMode ? (
                              <AutoIcon sx={{ fontSize: 18 }} />
                            ) : (
                              <EditIcon sx={{ fontSize: 18 }} />
                            )}
                          </IconButton>
                        </Tooltip>
                      </InputAdornment>
                    ),
                  }}
                />
              ) : showNumberEditor && !isAutoNumberMode ? (
                <TextField fullWidth label="Numeris" value={form.document_number}
                  disabled={!customNumberMode}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^0-9]/g, '');
                    const padLen = originalNumberRef.current.length || 3;
                    let final = digits === '' ? '' : digits.length <= padLen ? digits.padStart(padLen, '0') : digits.slice(-padLen);
                    u('document_number', final); setNumberError('');
                    if (numberCheckTimer.current) clearTimeout(numberCheckTimer.current);
                    if (final && final !== originalNumberRef.current) {
                      numberCheckTimer.current = setTimeout(() => { validateNumber(final, form.document_series, form.invoice_type); }, 500);
                    }
                  }}
                  error={!!numberError} inputProps={{ inputMode: 'numeric' }}
                  helperText={numberError || (customNumberMode ? 'Pakeiskite arba grąžinkite' : '')}
                  sx={{ '& .MuiFormHelperText-root': { position: 'absolute', bottom: -20, left: 0 } }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        {numberChecking && <CircularProgress size={16} sx={{ mr: 0.5 }} />}
                        <Tooltip title={customNumberMode ? 'Grąžinti pradinį' : 'Redaguoti numerį'}>
                          <IconButton sx={{ p: 0.5 }} size="small" onClick={() => {
                            if (!customNumberMode) { setCustomNumber(true); }
                            else { setForm((p) => ({ ...p, document_number: originalNumberRef.current })); setNumberError(''); setCustomNumber(false); }
                          }} edge="end">
                            {customNumberMode ? (
                              <CloseIcon sx={{ fontSize: 18 }} />
                            ) : (
                              <EditIcon sx={{ fontSize: 18 }} />
                            )}
                          </IconButton >
                        </Tooltip>
                      </InputAdornment>
                    ),
                  }}
                />
              ) : (
                <TextField fullWidth label="Numeris" value={form.document_number} disabled />
              )}
            </Grid2>
          </Grid2>
          <Box sx={{ mt: 2 }}>
            <FormControlLabel
              control={<Switch checked={showOrderNumber} onChange={(e) => { setShowOrderNumber(e.target.checked); if (!e.target.checked) u('order_number', ''); }} size="small" />}
              label={<Typography variant="body2">Užsakymo numeris</Typography>}
            />
            <Collapse in={showOrderNumber}>
              <DebouncedField size="small" label="Užsakymo Nr." value={form.order_number} onChange={(v) => u('order_number', v)} disabled={!isEditable} sx={{ mt: 1, maxWidth: 300 }} />
            </Collapse>
          </Box>
        </Box>

        {/* ─── 2. Data + Apmoketi iki + PVM + Valiuta ─── */}
        <Box sx={secSx}>
          <Grid2 container spacing={1.5}>
            {!isRecurring && (
              <>
                <Grid2 size={{ xs: 6, sm: 3 }}>
                  <DateField label="Sąskaitos data *" value={form.invoice_date} onChange={(v) => u('invoice_date', v)} disabled={!isEditable} error={!!fieldErrors.invoice_date} />
                </Grid2>
                <Grid2 size={{ xs: 6, sm: 2 }}>
                  <DateField label="Apmokėti iki" value={form.due_date} onChange={(v) => u('due_date', v)} disabled={!isEditable} />
                </Grid2>
              </>
            )}
            {showPvmSelector && (
              <Grid2 size={{ xs: 6, sm: 2 }}>
                <TextField fullWidth select label="PVM" value={form.pvm_tipas} onChange={(e) => u('pvm_tipas', e.target.value)} disabled={!isEditable} SelectProps={{ MenuProps: menuProps }}>
                  <MenuItem value="taikoma">Taikoma</MenuItem>
                  <MenuItem value="netaikoma">Netaikoma</MenuItem>
                </TextField>
              </Grid2>
            )}
            {showVatOptions && !showPerLineVat && (
              <Grid2 size={{ xs: 6, sm: 2 }}>
                <DebouncedIntField fullWidth label="PVM % *" value={form.vat_percent} onChange={(v) => u('vat_percent', v)} disabled={!isEditable}
                  InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} />
              </Grid2>
            )}
            <Grid2 size={{ xs: 6, sm: 3 }}>
              <Autocomplete value={form.currency}
                onChange={(_, v) => { if (v) u('currency', v); }}
                options={sortedCurrencies} disableClearable disabled={!isEditable}
                groupBy={(option) => POPULAR_CURRENCIES.includes(option) ? 'Populiarios' : 'Visos valiutos'}
                getOptionLabel={(option) => `${option} (${getSym(option)})`}
                renderInput={(params) => <TextField {...params} label="Valiuta *" />}
                componentsProps={{ popper: { disablePortal: false, modifiers: [{ name: 'preventOverflow', enabled: true }] } }}
              />
            </Grid2>
          </Grid2>
        </Box>

        {/* ─── 3. Pardavėjas / Pirkėjas ─── */}
        <Grid2 container spacing={2} sx={{ mb: 3 }}>
          <Grid2 size={{ xs: 12, md: 6 }}>
            <Box sx={{ ...secSx, height: '100%', mb: 0 }}>
              <Typography sx={{ ...titleSx, color: P.primary }}>PARDAVĖJAS</Typography>
              <Box sx={{ mb: 2.5 }}>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={form.seller_type}
                  onChange={(_, v) => { if (v) u('seller_type', v); }}
                  disabled={!isEditable}
                  sx={personTypeGroupSx}
                >
                  <ToggleButton value="juridinis">
                    <BusinessIcon sx={{ fontSize: 17, mr: 0.75 }} />
                    Juridinis asmuo
                  </ToggleButton>
                  <ToggleButton value="fizinis">
                    <PersonIcon sx={{ fontSize: 17, mr: 0.75 }} />
                    Fizinis asmuo
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
              <Grid2 container spacing={1.5}>
                <Grid2 size={12}><DebouncedField fullWidth label={form.seller_type === 'fizinis' ? 'Vardas Pavardė' : 'Pavadinimas *'} value={form.seller_name} onChange={(v) => u('seller_name', v)} disabled={!isEditable} error={!!fieldErrors.seller_name} /></Grid2>
                <Grid2 size={6}><DebouncedField fullWidth label={form.seller_type === 'fizinis' ? 'Ind. veiklos / asmens kodas *' : 'Įmonės kodas *'} value={form.seller_id} onChange={(v) => u('seller_id', v)} disabled={!isEditable} error={!!fieldErrors.seller_id} /></Grid2>
                <Grid2 size={6}><DebouncedField fullWidth label="PVM kodas" value={form.seller_vat_code} onChange={(v) => u('seller_vat_code', v)} disabled={!isEditable} /></Grid2>
                <Grid2 size={12}><DebouncedField fullWidth label="Adresas" value={form.seller_address} onChange={(v) => u('seller_address', v)} disabled={!isEditable} /></Grid2>
                <Grid2 size={12}>
                  <CountryField value={form.seller_country_iso} onChange={(code) => { const c = findCountry(code); setForm((p) => ({ ...p, seller_country_iso: code, seller_country: c?.name || '' })); }} disabled={!isEditable} label="Šalis *" />
                </Grid2>
                <Grid2 size={6}><DebouncedField fullWidth label="Telefonas" value={form.seller_phone} onChange={(v) => u('seller_phone', v)} disabled={!isEditable} /></Grid2>
                <Grid2 size={6}><DebouncedField fullWidth label="El. paštas" value={form.seller_email} onChange={(v) => u('seller_email', v)} disabled={!isEditable} /></Grid2>
                <Grid2 size={12}><DebouncedField fullWidth label="Bankas" value={form.seller_bank_name} onChange={(v) => u('seller_bank_name', v)} disabled={!isEditable} /></Grid2>
                <Grid2 size={8}><DebouncedField fullWidth label="IBAN" value={form.seller_iban} onChange={(v) => u('seller_iban', v)} disabled={!isEditable} /></Grid2>
                <Grid2 size={4}><DebouncedField fullWidth label="SWIFT" value={form.seller_swift} onChange={(v) => u('seller_swift', v)} disabled={!isEditable} /></Grid2>
              </Grid2>
              <FormControlLabel
                control={<Switch checked={showSellerExtra} onChange={(e) => setShowSellerExtra(e.target.checked)} size="small" />}
                label={<Typography variant="body2">Papildoma informacija</Typography>} sx={{ mt: 1.5 }}
              />
              <Collapse in={showSellerExtra}>
                <DebouncedField fullWidth multiline rows={2} value={form.seller_extra_info} onChange={(v) => u('seller_extra_info', v)} placeholder="Papildoma pardavėjo informacija..." disabled={!isEditable} sx={{ mt: 1 }} />
              </Collapse>
            </Box>
          </Grid2>
          <Grid2 size={{ xs: 12, md: 6 }}>
            <Box sx={{ ...secSx, height: '100%', mb: 0 }}>
              <Typography sx={{ ...titleSx, color: P.accent }}>PIRKĖJAS</Typography>
              {isEditable && (
                <Autocomplete freeSolo options={buyerOptions}
                  getOptionLabel={(o) => typeof o === 'string' ? o : `${o.name}${o.company_code ? ` (${o.company_code})` : ''}`}
                  inputValue={buyerSearchInput}
                  onInputChange={(_, v, reason) => { if (reason === 'input') setBuyerSearchInput(v); else if (reason === 'clear') { setBuyerSearchInput(''); setBuyerOptions([]); } }}
                  onChange={(_, v) => { if (typeof v === 'string') selectBuyer(null); else selectBuyer(v); setBuyerSearchInput(''); setBuyerOptions([]); }}
                  loading={buyerSearchLoading}
                  noOptionsText={buyerSearchInput.length < 2 ? 'Įveskite bent 2 simbolius' : 'Nerasta'}
                  filterOptions={(x) => x}
                  componentsProps={{ popper: { disablePortal: false } }}
                  renderOption={(props, o) => (
                    <li {...props} key={`${o.source}-${o.id}`}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                        <Box>
                          <Typography variant="body2" fontWeight={600}>{o.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{o.company_code}{o.vat_code ? ` · ${o.vat_code}` : ''}</Typography>
                        </Box>
                        {o.source === 'saved' && <Chip label="Klientas" size="small" color="primary" variant="outlined" sx={{ ml: 1, fontSize: 10, height: 20 }} />}
                      </Box>
                    </li>
                  )}
                  renderInput={(params) => (
                    <TextField {...params} label="Ieškoti pirkėjo..." size="small" sx={{ mb: 1.5 }}
                      InputProps={{ ...params.InputProps, endAdornment: (<>{buyerSearchLoading ? <CircularProgress size={18} /> : null}{params.InputProps.endAdornment}</>) }}
                    />
                  )}
                />
              )}
              <Box sx={{ mb: 2.5 }}>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={form.buyer_type}
                  onChange={(_, v) => { if (v) u('buyer_type', v); }}
                  disabled={!isEditable}
                  sx={personTypeGroupSx}
                >
                  <ToggleButton value="juridinis">
                    <BusinessIcon sx={{ fontSize: 17, mr: 0.75 }} />
                    Juridinis asmuo
                  </ToggleButton>
                  <ToggleButton value="fizinis">
                    <PersonIcon sx={{ fontSize: 17, mr: 0.75 }} />
                    Fizinis asmuo
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
              <Grid2 container spacing={1.5}>
                <Grid2 size={12}><DebouncedField fullWidth label={form.buyer_type === 'fizinis' ? 'Vardas Pavardė *' : 'Pavadinimas *'} value={form.buyer_name} onChange={(v) => u('buyer_name', v)} disabled={!isEditable} error={!!fieldErrors.buyer_name} /></Grid2>
                <Grid2 size={6}><DebouncedField fullWidth label={form.buyer_type === 'fizinis' ? 'Ind. veiklos / asmens kodas *' : 'Įmonės kodas *'} value={form.buyer_id} onChange={(v) => u('buyer_id', v)} disabled={!isEditable} error={!!fieldErrors.buyer_id} /></Grid2>
                <Grid2 size={6}><DebouncedField fullWidth label="PVM kodas" value={form.buyer_vat_code} onChange={(v) => u('buyer_vat_code', v)} disabled={!isEditable} /></Grid2>
                <Grid2 size={12}><DebouncedField fullWidth label="Adresas" value={form.buyer_address} onChange={(v) => u('buyer_address', v)} disabled={!isEditable} /></Grid2>
                <Grid2 size={12}>
                  <CountryField value={form.buyer_country_iso} onChange={(code) => { const c = findCountry(code); setForm((p) => ({ ...p, buyer_country_iso: code, buyer_country: c?.name || '' })); }} disabled={!isEditable} label="Šalis *" />
                </Grid2>
                <Grid2 size={6}><DebouncedField fullWidth label="Telefonas" value={form.buyer_phone} onChange={(v) => u('buyer_phone', v)} disabled={!isEditable} /></Grid2>
                <Grid2 size={6}><DebouncedField fullWidth label="El. paštas *" value={form.buyer_email} onChange={(v) => u('buyer_email', v)} disabled={!isEditable} error={!!fieldErrors.buyer_email} /></Grid2>
                <Grid2 size={12}><DebouncedField fullWidth label="Bankas" value={form.buyer_bank_name} onChange={(v) => u('buyer_bank_name', v)} disabled={!isEditable} /></Grid2>
                <Grid2 size={8}><DebouncedField fullWidth label="IBAN" value={form.buyer_iban} onChange={(v) => u('buyer_iban', v)} disabled={!isEditable} /></Grid2>
                <Grid2 size={4}><DebouncedField fullWidth label="SWIFT" value={form.buyer_swift} onChange={(v) => u('buyer_swift', v)} disabled={!isEditable} /></Grid2>
              </Grid2>
              <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <FormControlLabel control={<Switch checked={showBuyerDelivery} onChange={(e) => setShowBuyerDelivery(e.target.checked)} size="small" />} label={<Typography variant="body2">Pristatymo adresas</Typography>} />
                <Collapse in={showBuyerDelivery}>
                  <DebouncedField fullWidth value={form.buyer_delivery_address} onChange={(v) => u('buyer_delivery_address', v)} placeholder="Pristatymo adresas..." disabled={!isEditable} size="small" sx={{ mb: 1 }} />
                </Collapse>
                <FormControlLabel control={<Switch checked={showBuyerExtra} onChange={(e) => setShowBuyerExtra(e.target.checked)} size="small" />} label={<Typography variant="body2">Papildoma informacija</Typography>} />
                <Collapse in={showBuyerExtra}>
                  <DebouncedField fullWidth multiline rows={2} value={form.buyer_extra_info} onChange={(v) => u('buyer_extra_info', v)} placeholder="Papildoma pirkėjo informacija..." disabled={!isEditable} sx={{ mb: 1 }} />
                </Collapse>
                <FormControlLabel control={<Switch checked={saveBuyerAsClient} onChange={(e) => setSaveBuyerAsClient(e.target.checked)} size="small" />} label={<Typography variant="body2">Išsaugoti klientą</Typography>} />
              </Box>
            </Box>
          </Grid2>
        </Grid2>

        {/* ─── 4. Prekės / Paslaugos — REDESIGNED ─── */}
        <Box sx={{ ...secSx, ...(fieldErrors.line_items ? { borderColor: '#d32f2f', borderWidth: 2 } : {}) }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography sx={{ ...titleSx, mb: 0 }}>Prekės / Paslaugos</Typography>
            {isEditable && <Button startIcon={<AddIcon />} onClick={addLine} variant="contained" size="small">Pridėti</Button>}
          </Box>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            <FormControlLabel control={<Switch checked={showLineDiscount} onChange={(e) => setShowLineDiscount(e.target.checked)} size="small" />} label={<Typography variant="body2">Nuolaida eilutei</Typography>} />
            {showVatOptions && (
              <FormControlLabel control={<Switch checked={showPerLineVat} onChange={(e) => setShowPerLineVat(e.target.checked)} size="small" />} label={<Typography variant="body2">Skirtingi PVM %</Typography>} />
            )}
          </Box>

          {!isMobile ? (
            <>
              {/* ── Desktop header — pastel, aligned ── */}
              <Box sx={{
                display: 'grid',
                gridTemplateColumns: '36px 3fr 1.5fr 1.5fr 68px',
                gap: 1,
                px: 1.5,
                py: 1,
                background: '#eef2f7',
                borderRadius: '10px 10px 0 0',
                border: '1px solid #d5dde6',
                borderBottom: '2px solid #cdd6e0',
              }}>
                <Typography variant="caption" sx={{ color: '#5a6a7a', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'center', lineHeight: '24px' }}>Nr.</Typography>
                <Typography variant="caption" sx={{ color: '#5a6a7a', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px', lineHeight: '24px' }}>Pavadinimas</Typography>
                <Typography variant="caption" sx={{ color: '#5a6a7a', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px', lineHeight: '24px' }}>Kodas</Typography>
                <Typography variant="caption" sx={{ color: '#5a6a7a', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px', lineHeight: '24px' }}>Barkodas</Typography>
                <Box />
              </Box>

              {lineItems.map((li, i) => {
                const ls = lineSums[i] || {};
                const isLast = i === lineItems.length - 1;
                const canMove = lineItems.length > 1 && isEditable;
                return (
                  <Box key={i} sx={{
                    border: `1px solid #d5dde6`,
                    borderTop: 'none',
                    borderRadius: isLast ? '0 0 10px 10px' : 0,
                    overflow: 'visible',
                    transition: 'background-color 0.15s',
                    '&:hover': { backgroundColor: '#f8fafb' },
                  }}>
                    {/* ── Row 1: Name, Code, Barcode ── */}
                    <Box sx={{
                      display: 'grid',
                      gridTemplateColumns: '36px 3fr 1.5fr 1.5fr 68px',
                      gap: 1,
                      px: 1.5,
                      pt: 1.5,
                      pb: 0.5,
                      alignItems: 'start',
                    }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 36, minHeight: 40 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: 13, color: '#8a97a8' }}>{i + 1}</Typography>
                      </Box>
                      {renderNameField(i, li)}
                      <DebouncedField size="small" fullWidth value={li.prekes_kodas} onChange={(v) => uLine(i, 'prekes_kodas', v)} disabled={!isEditable} placeholder="Kodas *" error={!!fieldErrors[`line_${i}_code`]} />
                      <DebouncedField size="small" fullWidth value={li.prekes_barkodas} onChange={(v) => uLine(i, 'prekes_barkodas', v)} disabled={!isEditable} placeholder="Barkodas" />
                      {isEditable ? (
                        <Box sx={{ display: 'flex', gap: 0.25, alignItems: 'center', justifyContent: 'center', pt: 0.5 }}>
                          <Tooltip title="Dubliuoti eilutę">
                            <IconButton size="small" onClick={() => {
                              setLineItems((p) => { const copy = { ...p[i] }; const next = [...p]; next.splice(i + 1, 0, copy); return next; });
                            }} sx={{ p: 0.5, color: '#8a97a8', '&:hover': { color: P.primary, backgroundColor: '#e3f2fd' } }}>
                              <DuplicateIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Ištrinti eilutę">
                            <span>
                              <IconButton size="small" onClick={() => removeLine(i)} disabled={lineItems.length === 1}
                                sx={{ p: 0.5, color: '#8a97a8', '&:hover': { color: '#d32f2f', backgroundColor: '#fdeaea' } }}>
                                <DeleteIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Box>
                      ) : <Box sx={{ width: 68 }} />}
                    </Box>

                    {/* ── Row 2: Qty, Unit, Price, Discount, VAT, Catalog, Sum ── */}
                    <Box sx={{
                      display: 'flex',
                      gap: 1,
                      px: 1.5,
                      pb: 1.5,
                      pt: 0.5,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      ml: '44px',
                    }}>
                      {/* ── Reorder buttons — compact, clear ── */}
                      {canMove && (
                        <Box sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1px',
                          mr: 0.5,
                          borderRadius: 1,
                          overflow: 'hidden',
                          border: `1px solid #d5dde6`,
                        }}>
                          <IconButton size="small" onClick={() => moveLine(i, i - 1)} disabled={i === 0}
                            sx={{ p: 0.15, borderRadius: 0, backgroundColor: '#f5f7fa', '&:hover': { backgroundColor: '#e3f2fd' } }}>
                            <ArrowUpIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                          <IconButton size="small" onClick={() => moveLine(i, i + 1)} disabled={i === lineItems.length - 1}
                            sx={{ p: 0.15, borderRadius: 0, backgroundColor: '#f5f7fa', '&:hover': { backgroundColor: '#e3f2fd' } }}>
                            <ArrowDownIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Box>
                      )}

                      <DebouncedNumField size="small" label="Kiekis *" sx={{ width: 90 }} value={li.quantity}
                        onChange={(v) => uLine(i, 'quantity', v)} disabled={!isEditable} maxDecimals={5}
                        error={!!fieldErrors[`line_${i}_qty`]} />
                      {renderUnitField(i, li, 120)}
                      <DebouncedNumField size="small" label={priceLabel} sx={{ width: 110 }} value={li.price}
                        onChange={(v) => uLine(i, 'price', v)} disabled={!isEditable} maxDecimals={4}
                        error={!!fieldErrors[`line_${i}_price`]} />

                      {showLineDiscount && (
                        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5 }}>
                          <DebouncedNumField size="small" label="Nuolaida" sx={{ width: 90 }} value={li.discount_value}
                            onChange={(v) => uLine(i, 'discount_value', v)} disabled={!isEditable} />
                          <ToggleButtonGroup size="small" exclusive value={li.discount_type}
                            onChange={(_, v) => { if (v) uLine(i, 'discount_type', v); }}
                            sx={{ height: 40, '& .MuiToggleButton-root': { height: 40, px: 1, fontSize: 12, fontWeight: 600 } }}>
                            <ToggleButton value="percent">%</ToggleButton>
                            <ToggleButton value="amount">{sym}</ToggleButton>
                          </ToggleButtonGroup>
                        </Box>
                      )}

                      {showPerLineVat && showVatOptions && (
                        <DebouncedIntField size="small" label="PVM %" sx={{ width: 90 }} value={li.vat_percent}
                          onChange={(v) => uLine(i, 'vat_percent', v)} disabled={!isEditable} placeholder={form.vat_percent}
                          InputProps={{ endAdornment: <InputAdornment position="end" sx={{ '& p': { fontSize: 11 } }}>%</InputAdornment> }} />
                      )}

                      {/* ── Catalog save — redesigned ── */}
                      {isEditable && (
                        <Box sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.75,
                          ml: 1.5,
                          pl: 2,
                          borderLeft: `1px solid ${P.border}`,
                        }}>
                          <FormControlLabel
                            control={<Switch checked={li.save_to_catalog || false} onChange={(e) => uLine(i, 'save_to_catalog', e.target.checked)} size="small" />}
                            label={<Typography variant="caption" sx={{ fontSize: 11, whiteSpace: 'nowrap' }}>Išsaugoti į katalogą</Typography>}
                            sx={{ mr: 0 }}
                          />
                          {li.save_to_catalog && (
                            <TextField size="small" select
                              label="Išsaugoti kaip"
                              value={li.preke_paslauga || 'preke'}
                              onChange={(e) => uLine(i, 'preke_paslauga', e.target.value)}
                              sx={{ width: 140, '& .MuiInputLabel-root': { fontSize: 12 } }}
                              SelectProps={{ MenuProps: { disableScrollLock: true } }}>
                              <MenuItem value="preke">Prekė</MenuItem>
                              <MenuItem value="paslauga">Paslauga</MenuItem>
                            </TextField>
                          )}
                        </Box>
                      )}

                      <Box sx={{ flex: 1 }} />
                      <Typography sx={{
                        fontWeight: 700,
                        fontSize: 14,
                        whiteSpace: 'nowrap',
                        pr: 1,
                        color: '#333',
                      }}>
                        {sumLabel}: {fmt2(ls.net || 0)} {sym}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </>
          ) : (
            /* ── Mobile view ── */
            <Stack spacing={1.5}>
              {lineItems.map((li, i) => {
                const ls = lineSums[i] || {};
                return (
                  <Paper key={i} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography fontWeight={700} sx={{ color: '#8a97a8' }}>#{i + 1}</Typography>
                        {lineItems.length > 1 && isEditable && (
                          <Box sx={{ display: 'flex', gap: '1px', borderRadius: 1, overflow: 'hidden', border: `1px solid #d5dde6` }}>
                            <IconButton size="small" onClick={() => moveLine(i, i - 1)} disabled={i === 0}
                              sx={{ p: 0.15, borderRadius: 0, backgroundColor: '#f5f7fa' }}>
                              <ArrowUpIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" onClick={() => moveLine(i, i + 1)} disabled={i === lineItems.length - 1}
                              sx={{ p: 0.15, borderRadius: 0, backgroundColor: '#f5f7fa' }}>
                              <ArrowDownIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        )}
                      </Box>
                      {isEditable && (
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <IconButton size="small" onClick={() => { setLineItems((p) => { const next = [...p]; next.splice(i + 1, 0, { ...p[i] }); return next; }); }}><DuplicateIcon fontSize="small" /></IconButton>
                          <IconButton size="small" onClick={() => removeLine(i)} disabled={lineItems.length === 1}><DeleteIcon fontSize="small" /></IconButton>
                        </Box>
                      )}
                    </Box>
                    <Grid2 container spacing={1}>
                      <Grid2 size={12}>{renderNameField(i, li)}</Grid2>
                      <Grid2 size={6}><DebouncedField size="small" fullWidth label="Kodas" value={li.prekes_kodas} onChange={(v) => uLine(i, 'prekes_kodas', v)} disabled={!isEditable} error={!!fieldErrors[`line_${i}_code`]} /></Grid2>
                      <Grid2 size={6}><DebouncedField size="small" fullWidth label="Barkodas" value={li.prekes_barkodas} onChange={(v) => uLine(i, 'prekes_barkodas', v)} disabled={!isEditable} /></Grid2>
                      <Grid2 size={4}><DebouncedNumField size="small" fullWidth label="Kiekis" value={li.quantity} onChange={(v) => uLine(i, 'quantity', v)} disabled={!isEditable} maxDecimals={5} error={!!fieldErrors[`line_${i}_qty`]} /></Grid2>
                      <Grid2 size={4}>{renderUnitField(i, li)}</Grid2>
                      <Grid2 size={4}><DebouncedNumField size="small" fullWidth label={priceLabel} value={li.price} onChange={(v) => uLine(i, 'price', v)} disabled={!isEditable} maxDecimals={4} error={!!fieldErrors[`line_${i}_price`]} /></Grid2>
                      {showLineDiscount && (
                        <Grid2 size={12}>
                          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-end' }}>
                            <DebouncedNumField size="small" fullWidth label="Nuolaida" value={li.discount_value} onChange={(v) => uLine(i, 'discount_value', v)} disabled={!isEditable} />
                            <ToggleButtonGroup size="small" exclusive value={li.discount_type} onChange={(_, v) => { if (v) uLine(i, 'discount_type', v); }}
                              sx={{ height: 40, '& .MuiToggleButton-root': { height: 40, px: 1, fontSize: 12, fontWeight: 600 } }}>
                              <ToggleButton value="percent">%</ToggleButton>
                              <ToggleButton value="amount">{sym}</ToggleButton>
                            </ToggleButtonGroup>
                          </Box>
                        </Grid2>
                      )}
                      {showPerLineVat && showVatOptions && (
                        <Grid2 size={12}><DebouncedIntField size="small" fullWidth label="PVM %" value={li.vat_percent} onChange={(v) => uLine(i, 'vat_percent', v)} disabled={!isEditable} placeholder={form.vat_percent} /></Grid2>
                      )}
                      {isEditable && (
                        <Grid2 size={12}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <FormControlLabel
                              control={<Switch checked={li.save_to_catalog || false} onChange={(e) => uLine(i, 'save_to_catalog', e.target.checked)} size="small" />}
                              label={<Typography variant="caption">Išsaugoti į katalogą</Typography>}
                            />
                            {li.save_to_catalog && (
                              <TextField size="small" select
                                label="Išsaugoti kaip"
                                value={li.preke_paslauga || 'preke'}
                                onChange={(e) => uLine(i, 'preke_paslauga', e.target.value)}
                                sx={{ width: 140 }}
                                SelectProps={{ MenuProps: { disableScrollLock: true } }}>
                                <MenuItem value="preke">Prekė</MenuItem>
                                <MenuItem value="paslauga">Paslauga</MenuItem>
                              </TextField>
                            )}
                          </Box>
                        </Grid2>
                      )}
                      <Grid2 size={12}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1, borderRadius: 1.5, border: `1px dashed ${P.border}`, background: P.bg }}>
                          <Typography fontSize={14}>{sumLabel}</Typography>
                          <Typography fontWeight={800}>{fmt2(ls.net || 0)} {sym}</Typography>
                        </Box>
                      </Grid2>
                    </Grid2>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </Box>

        {/* ─── 5. Totals ─── */}
        <Box sx={secSx}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            <FormControlLabel control={<Switch checked={showTotalDiscount} onChange={(e) => setShowTotalDiscount(e.target.checked)} size="small" />} label={<Typography variant="body2">Nuolaida visai sąskaitai</Typography>} />
          </Box>
          <Collapse in={showTotalDiscount}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, maxWidth: 350 }}>
              <Typography variant="body2" sx={{ minWidth: 90 }}>Nuolaida:</Typography>
              <DebouncedNumField size="small" fullWidth value={totalDiscountValue} onChange={setTotalDiscountValue} disabled={!isEditable} />
              <ToggleButtonGroup size="small" exclusive value={totalDiscountType} onChange={(_, v) => { if (v) setTotalDiscountType(v); }}
                sx={{ height: 40, '& .MuiToggleButton-root': { height: 40, px: 1.5, fontSize: 13, fontWeight: 600 } }}>
                <ToggleButton value="percent">%</ToggleButton>
                <ToggleButton value="amount">{sym}</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            {totals.totalDiscount > totals.sumLines && (
              <Typography variant="caption" color="error" sx={{ mb: 1, display: 'block' }}>
                Nuolaida negali viršyti sumos be PVM ({fmt2(totals.sumLines)} {sym})
              </Typography>
            )}
          </Collapse>
          <Divider sx={{ my: 2 }} />
          <Box sx={{ ml: 'auto', maxWidth: 460, background: '#fff', p: 2, borderRadius: 2, border: `1px solid ${P.border}` }}>
            {showTotalDiscount && totals.totalDiscount > 0 && (
              <>
                <SumRow label="Tarpinė suma:" value={`${fmt2(totals.sumLines)} ${sym}`} />
                <SumRow label="Nuolaida:" value={`-${fmt2(totals.totalDiscount)} ${sym}`} />
              </>
            )}
            {isPvm ? (
              <>
                <SumRow label="Suma be PVM:" value={`${fmt2(totals.base)} ${sym}`} />
                {totals.vatBreakdown.length > 1 ? (
                  <>
                    {totals.vatBreakdown.map((g) => (
                      <SumRow key={`base-${g.rate}`} indent label={`Suma apmokestinama PVM ${g.rate % 1 === 0 ? g.rate : fmt2(g.rate)}%:`} value={`${fmt2(g.discountedNet)} ${sym}`} />
                    ))}
                    {totals.vatBreakdown.filter((g) => g.rate > 0).map((g) => (
                      <SumRow key={`vat-${g.rate}`} label={`PVM ${g.rate % 1 === 0 ? g.rate : fmt2(g.rate)}%:`} value={`${fmt2(g.vat)} ${sym}`} />
                    ))}
                  </>
                ) : (
                  <SumRow label={`PVM ${totals.vatBreakdown[0]?.rate ?? form.vat_percent}%:`} value={`${fmt2(totals.vat)} ${sym}`} />
                )}
                <SumRow label="SUMA SU PVM:" value={`${fmt2(totals.grand)} ${sym}`} bold primary />
              </>
            ) : (
              <SumRow label="BENDRA SUMA:" value={`${fmt2(totals.base)} ${sym}`} bold primary />
            )}
          </Box>
        </Box>

        {/* ─── 6. Signatures + Note ─── */}
        <Box sx={secSx}>
          <Grid2 container spacing={1.5}>
            <Grid2 size={{ xs: 12, sm: 6 }}>
              <DebouncedField
                fullWidth
                label="Sąskaitą išrašė"
                value={form.issued_by}
                onChange={(v) => u('issued_by', v)}
                disabled={!isEditable}
              />
            </Grid2>

            <Grid2 size={{ xs: 12, sm: 6 }}>
              <DebouncedField
                fullWidth
                label="Sąskaitą priėmė"
                value={form.received_by}
                onChange={(v) => u('received_by', v)}
                disabled={!isEditable}
              />
            </Grid2>

            <Grid2 size={12}>
              <Box sx={{ pt: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0, flexWrap: 'wrap' }}>
                  <Switch
                    checked={showNote}
                    onChange={(e) => handleNoteToggle(e.target.checked)}
                    size="small"
                  />

                  <Typography variant="body2">
                    Pastaba
                  </Typography>
                </Box>

                <Collapse in={showNote}>
                  <Box sx={{ pt: 1.25, pl: { xs: 0, sm: 5.5 } }}>
                    <DebouncedField
                      fullWidth
                      multiline
                      rows={3}
                      value={form.note}
                      onChange={handleNoteChange}
                      disabled={!isEditable}
                      placeholder="Papildoma informacija pirkėjui..."
                    />
                  </Box>
                </Collapse>
              </Box>
            </Grid2>
          </Grid2>
        </Box>

        {/* ─── 7. Papildomi nustatymai ─── */}
        {isEditable && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0, flexWrap: 'wrap' }}>
              <Switch
                checked={autoRemindersLocked ? false : form.send_payment_reminders}
                onChange={(e) => {
                  if (autoRemindersLocked) {
                    showLockedMsg("auto_reminders");
                    return;
                  }
                  u('send_payment_reminders', e.target.checked);
                }}
                size="small"
                sx={autoRemindersLocked ? { opacity: 0.5 } : {}}
              />

              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, minWidth: 0 }}>
                {autoRemindersLocked && <LockOutlinedIcon sx={{ fontSize: 15, color: '#d32f2f', mr: 0.25 }} />}
                <Typography variant="body2" sx={autoRemindersLocked ? { color: '#999' } : {}}>
                  Siųsti automatinius apmokėjimo priminimus
                </Typography>
                <InlineHelpTooltip
                  title="Klientas gaus apmokėjimo priminimo el. laiškus 7 dienos prieš apmokėjimo terminą, 1 diena prieš apmokėjimo terminą ir 3 dienos po apmokėjimo termino. Gavus apmokėjimą, sekantys priminimai nebus siunčiami."
                />
              </Box>
            </Box>
          </Box>
        )}

        {/* ─── Siuntimo planas (tik periodinė) ─── */}
        {isRecurring && (
          <Box
            sx={{
              ...secSx,
              background: 'linear-gradient(180deg, #f8fbff 0%, #eef4fb 100%)',
              border: `1px solid ${P.softBlueBorder}`,
            }}
          >
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: P.primary }}>
                Siuntimo planas
              </Typography>
              <Typography variant="body2" sx={{ color: P.textMuted, mt: 0.25 }}>
                {isSavedRecurring
                  ? 'Rodomas realus backend planas pagal dabartinę būseną ir next_run_at.'
                  : 'Preview pagal dabartinius nustatymus prieš išsaugant.'}
              </Typography>
            </Box>

            <Grid2 container spacing={1.5}>
              <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                <Box sx={recurringInnerCardSx}>
                  <Typography variant="caption" sx={{ color: P.textMuted }}>
                    Pirmos sąskaitos data
                  </Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ mt: 0.5 }}>
                    {formatLtDate(parseLocalDate(recurringForm.start_date))}
                  </Typography>
                </Box>
              </Grid2>

              <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                <Box sx={recurringInnerCardSx}>
                  <Typography variant="caption" sx={{ color: P.textMuted }}>
                    Sekanti sąskaita
                  </Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ mt: 0.5 }}>
                    {isSavedRecurring && recurringPlanLoading
                      ? 'Kraunama...'
                      : planNextDate
                        ? formatLtDate(planNextDate)
                        : 'Nebus generuojama'}
                  </Typography>
                </Box>
              </Grid2>

              <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                <Box sx={recurringInnerCardSx}>
                  <Typography variant="caption" sx={{ color: P.textMuted }}>
                    Dažnumas
                  </Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ mt: 0.5 }}>
                    {recurringForm.first_day_of_month
                      ? 'Kas pirma mėnesio diena'
                      : recurringForm.last_day_of_month
                        ? 'Kas paskutinė mėnesio diena'
                        : (FREQUENCY_OPTIONS[recurringForm.period_type] || []).find((o) => Number(o.value) === Number(recurringForm.interval))?.label || '—'}
                  </Typography>
                </Box>
              </Grid2>

              <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                <Box sx={recurringInnerCardSx}>
                  <Typography variant="caption" sx={{ color: P.textMuted }}>
                    Pabaiga
                  </Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ mt: 0.5 }}>
                    {recurringForm.end_type === 'count' && recurringForm.max_count
                      ? isSavedRecurring
                        ? `Iš viso ${recurringForm.max_count}, liko ${remainingCount}`
                        : `Po ${recurringForm.max_count} sąsk.`
                      : recurringForm.end_type === 'date' && recurringForm.end_date
                        ? formatLtDate(parseLocalDate(recurringForm.end_date))
                        : 'Neterminuota'}
                  </Typography>
                </Box>
              </Grid2>
            </Grid2>

            <Box sx={{ mt: 2 }}>
              <Box sx={recurringInnerCardSx}>
                <Typography variant="caption" sx={{ color: P.textMuted }}>
                  {isSavedRecurring ? 'Artimiausios suplanuotos datos' : 'Preview datos'}
                </Typography>

                {isSavedRecurring && recurringPlanLoading ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                    <CircularProgress size={16} />
                    <Typography variant="body2">Kraunama...</Typography>
                  </Box>
                ) : planPreviewDates.length > 0 ? (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                    {planPreviewDates.map((dateObj, idx) => (
                      <Chip
                        key={`${dateObj.getFullYear()}-${dateObj.getMonth()}-${dateObj.getDate()}-${idx}`}
                        label={formatLtDate(dateObj)}
                        size="small"
                        color={idx === 0 ? 'primary' : 'default'}
                        variant={idx === 0 ? 'filled' : 'outlined'}
                      />
                    ))}
                  </Box>
                ) : (
                  <Typography variant="body2" sx={{ mt: 1, color: P.textMuted }}>
                    Daugiau suplanuotų siuntimų nėra.
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>
        )}

        {/* ─── Auto SF from išankstinė ─── */}
        {form.invoice_type === 'isankstine' && isEditable && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0, flexWrap: 'wrap' }}>
              <Switch
                checked={form.auto_create_sf_on_paid}
                onChange={(e) => {
                  u('auto_create_sf_on_paid', e.target.checked);
                  if (e.target.checked) {
                    // Auto-select series
                    const targetType = form.pvm_tipas === 'taikoma' ? 'pvm_saskaita' : 'saskaita';
                    const targetSeries = availableSeries.filter((s) => s.invoice_type === targetType);
                    const defaultSeries = targetSeries.find((s) => s.is_default) || targetSeries[0];
                    if (defaultSeries && !form.auto_sf_series) {
                      u('auto_sf_series', defaultSeries.prefix);
                    }
                  } else {
                    u('auto_sf_series', '');
                    u('auto_sf_send', false);
                  }
                }}
                size="small"
              />

              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, minWidth: 0 }}>
                <Typography variant="body2" sx={{ lineHeight: 1.35 }}>
                  Automatiškai išrašyti {form.pvm_tipas === 'taikoma' ? 'PVM sąskaitą faktūrą' : 'sąskaitą faktūrą'}, kai ši išankstinė bus apmokėta
                </Typography>
                <InlineHelpTooltip
                  title="Kai išankstinė sąskaita bus pažymėta kaip apmokėta, sistema automatiškai išrašys PVM sąskaitą faktūrą / sąskaitą faktūrą ir, jei pasirinkta, išsiųs klientui el. paštu."
                />
              </Box>
            </Box>

            <Collapse in={form.auto_create_sf_on_paid}>
              <Box sx={{ mt: 1.5, pl: { xs: 0, sm: 5.5 } }}>
                <Grid2 container spacing={1.5} alignItems="center">
                  <Grid2 size={{ xs: 12, sm: 5 }}>
                    <TextField fullWidth select label="Priskirti seriją" value={form.auto_sf_series}
                      onChange={(e) => {
                        if (e.target.value === '__new_auto_sf__') {
                          const targetType = form.pvm_tipas === 'taikoma' ? 'pvm_saskaita' : 'saskaita';
                          setNewSeriesForm({ invoice_type: targetType, prefix: '', next_number: 1, padding: 3, is_default: false, _autoSfMode: true });
                          setNewSeriesNumberCheck({ checking: false, exists: false });
                          setNewSeriesDialog(true); return;
                        }
                        u('auto_sf_series', e.target.value);
                      }}
                      SelectProps={{ MenuProps: menuProps }} size="small">
                      <MenuItem value="__new_auto_sf__" sx={{ borderBottom: '1px solid #eee', py: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'primary.main' }}>
                          <AddIcon sx={{ fontSize: 18 }} />
                          <Typography variant="body2" sx={{ fontWeight: 400 }}>Sukurti naują seriją</Typography>
                        </Box>
                      </MenuItem>
                      {availableSeries
                        .filter((s) => s.invoice_type === (form.pvm_tipas === 'taikoma' ? 'pvm_saskaita' : 'saskaita'))
                        .map((s) => (
                          <MenuItem key={s.id || s.prefix} value={s.prefix}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" fontWeight={600}>{s.prefix}</Typography>
                              {s.name && <Typography variant="caption" color="text.secondary">{s.name}</Typography>}
                              {s.is_default && <Chip label="Numatytoji" size="small" sx={{ fontSize: 10, height: 18 }} />}
                            </Box>
                          </MenuItem>
                        ))}
                    </TextField>
                  </Grid2>
                  <Grid2 size={{ xs: 12, sm: 5 }} sx={{ pl: { sm: 2 } }}>
                    <FormControlLabel
                      control={<Switch checked={form.auto_sf_send} onChange={(e) => u('auto_sf_send', e.target.checked)} size="small" />}
                      label={<Typography variant="body2">Išsiųsti klientui el. paštu</Typography>}
                    />
                  </Grid2>
                </Grid2>
              </Box>
            </Collapse>
          </Box>
        )}

            {paymentLinksLocked ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0, flexWrap: 'wrap' }}>
                <Switch
                  checked={false}
                  onChange={() => showLockedMsg("payment_links")}
                  size="small"
                  sx={{ opacity: 0.5 }}
                />
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, minWidth: 0 }}>
                  <LockOutlinedIcon sx={{ fontSize: 15, color: '#d32f2f', mr: 0.25 }} />
                  <Typography variant="body2" sx={{ color: '#999' }}>
                    Pridėti tiesioginio apmokėjimo nuorodą
                  </Typography>
                </Box>
              </Box>
            ) : (
              <PaymentLinkToggle value={paymentLink} onChange={setPaymentLink} />
            )} 

        {/* ─── 8. Buttons ─── */}
        {isEditable && (isNew || form.status === 'draft') && (
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 4, flexWrap: 'wrap' }}>
            {isRecurring ? (
              <>
                <Button variant="outlined" size="large" onClick={() => navigate('/israsymas')} disabled={saving}>Atšaukti</Button>
                <Button variant="contained" size="large"
                  startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                  onClick={() => handleSave(null)} disabled={saving}>
                  {recurringEditId ? 'Atnaujinti periodinę sąskaitą' : 'Sukurti periodinę sąskaitą'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outlined" size="large"
                  startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                  onClick={() => handleSave(null)} disabled={saving}>
                  Išsaugoti juodraštį
                </Button>
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => {
                    const emailIssue = getEmailIssue(form.buyer_email);

                    if (emailIssue) {
                      setEmailWarning({ open: true, action: 'issue', reason: emailIssue });
                    } else {
                      handleSave('issue');
                    }
                  }}
                  disabled={saving}
                >
                  Sukurti sąskaitą
                </Button>
                <Button
                  variant="contained"
                  size="large"
                  color="secondary"
                  startIcon={<SendIcon />}
                  onClick={() => {
                    const emailIssue = getEmailIssue(form.buyer_email);

                    if (emailIssue) {
                      setEmailWarning({ open: true, action: 'issue_send', reason: emailIssue });
                    } else {
                      handleSave('issue_send');
                    }
                  }}
                  disabled={saving}
                >
                  Sukurti ir išsiųsti
                </Button>
              </>
            )}
          </Box>
        )}

        {isEditable && !isNew && form.status !== 'draft' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 4 }}>
            <Button variant="contained" size="large"
              startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
              onClick={() => handleSave(null)} disabled={saving}>
              Išsaugoti pakeitimus
            </Button>
          </Box>
        )}
      </Paper>

      <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog((d) => ({ ...d, open: false }))} disableScrollLock>
        <DialogTitle>{confirmDialog.title}</DialogTitle>
        {confirmDialog.text && <DialogContent><DialogContentText>{confirmDialog.text}</DialogContentText></DialogContent>}
        <DialogActions>
          <Button onClick={() => setConfirmDialog((d) => ({ ...d, open: false }))}>Atšaukti</Button>
          <Button variant="contained" onClick={() => { confirmDialog.action?.(); setConfirmDialog((d) => ({ ...d, open: false })); }}>Patvirtinti</Button>
        </DialogActions>
      </Dialog>

      {/* Email warning dialog */}
      <Dialog
        open={emailWarning.open}
        onClose={() => setEmailWarning({ open: false, action: null, reason: null })}
        disableScrollLock
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>
          {emailWarning.action === 'issue_send'
            ? emailWarning.reason === 'missing'
              ? 'Trūksta pirkėjo el. pašto'
              : 'Neteisingas pirkėjo el. paštas'
            : emailWarning.reason === 'missing'
              ? 'Pirkėjo el. paštas nenurodytas'
              : 'Pirkėjo el. paštas neteisingas'}
        </DialogTitle>

        <DialogContent>
          <DialogContentText>
            {emailWarning.action === 'issue_send'
              ? emailWarning.reason === 'missing'
                ? 'Norint išsiųsti sąskaitą, reikia nurodyti pirkėjo el. pašto adresą.'
                : 'Norint išsiųsti sąskaitą, reikia įvesti teisingą pirkėjo el. pašto adresą.'
              : emailWarning.reason === 'missing'
                ? 'Sąskaitą galite išrašyti ir be pirkėjo el. pašto, tačiau ji nebus išsiųsta klientui.'
                : 'Įvestas pirkėjo el. pašto adresas atrodo neteisingas. Sąskaitą galite išrašyti, bet ji nebus išsiųsta klientui.'}
          </DialogContentText>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setEmailWarning({ open: false, action: null, reason: null })}>
            Grįžti ir pataisyti
          </Button>

          {emailWarning.action === 'issue' && (
            <Button
              variant="contained"
              onClick={() => {
                setEmailWarning({ open: false, action: null, reason: null });
                handleSave('issue');
              }}
            >
              Išrašyti be siuntimo
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ── New Series Dialog ── */}
      <Dialog open={newSeriesDialog} onClose={() => setNewSeriesDialog(false)} disableScrollLock maxWidth="sm" fullWidth>
        <DialogTitle>Nauja serija</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField fullWidth select label="Dokumento tipas" value={newSeriesForm.invoice_type}
              onChange={(e) => setNewSeriesForm((p) => ({ ...p, invoice_type: e.target.value }))}
              disabled={!!newSeriesForm._autoSfMode} SelectProps={{ MenuProps: menuProps }}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <MenuItem key={k} value={k} disabled={k === 'kreditine'}>{v}</MenuItem>
              ))}
            </TextField>
            <TextField fullWidth label="Serijos prefiksas" value={newSeriesForm.prefix}
              onChange={(e) => setNewSeriesForm((p) => ({ ...p, prefix: e.target.value.toUpperCase() }))}
              placeholder="Pvz. AA, BB, ISF"
              helperText="Unikalus prefiksas. Bus rodomas prieš numerį."
              inputProps={{ style: { fontWeight: 700, letterSpacing: 1, fontFamily: 'monospace' } }} autoFocus />
            <Grid2 container spacing={2}>
              <Grid2 size={{ xs: 6 }}>
                <TextField fullWidth label="Sekantis numeris" type="number" value={newSeriesForm.next_number}
                  onChange={(e) => setNewSeriesForm((p) => ({ ...p, next_number: Math.max(1, parseInt(e.target.value) || 1) }))}
                  inputProps={{ min: 1 }}
                  InputProps={{
                    endAdornment: newSeriesNumberCheck.checking ? (
                      <InputAdornment position="end"><CircularProgress size={16} /></InputAdornment>
                    ) : newSeriesNumberCheck.exists ? (
                      <InputAdornment position="end"><Tooltip title="Numeris jau naudojamas"><WarningIcon color="error" fontSize="small" /></Tooltip></InputAdornment>
                    ) : newSeriesForm.prefix && newSeriesForm.next_number ? (
                      <InputAdornment position="end"><CheckIcon sx={{ color: 'success.main', fontSize: 20 }} /></InputAdornment>
                    ) : null,
                  }}
                  error={newSeriesNumberCheck.exists}
                  helperText={newSeriesNumberCheck.exists ? 'Šis numeris jau užimtas!' : 'Sekantis naudojamas numeris'} />
              </Grid2>
              <Grid2 size={{ xs: 6 }}>
                <TextField fullWidth select label="Skaitmenų skaičius" value={newSeriesForm.padding}
                  onChange={(e) => setNewSeriesForm((p) => ({ ...p, padding: parseInt(e.target.value) }))}
                  SelectProps={{ MenuProps: menuProps }}>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <MenuItem key={n} value={n}>{n} → {'1'.padStart(n, '0')}</MenuItem>
                  ))}
                </TextField>
              </Grid2>
            </Grid2>
            <Box sx={{ p: 2, borderRadius: 2, textAlign: 'center', background: 'linear-gradient(135deg, #e3f2fd, #f3e5f5)', border: `1px solid ${P.border}` }}>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Kito dokumento numeris:</Typography>
              <Typography sx={{ fontWeight: 800, fontSize: 28, fontFamily: 'monospace', letterSpacing: 2, color: P.primary }}>{getSeriesPreview()}</Typography>
            </Box>
            <FormControlLabel
              control={<Switch checked={newSeriesForm.is_default} onChange={(e) => setNewSeriesForm((p) => ({ ...p, is_default: e.target.checked }))} size="small" />}
              label={<Typography variant="body2">Numatytoji serija šiam dokumento tipui</Typography>}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setNewSeriesDialog(false)}>Atšaukti</Button>
          <Button variant="contained" onClick={handleCreateSeries} disabled={newSeriesSaving || newSeriesNumberCheck.exists || !newSeriesForm.prefix.trim()}>
            {newSeriesSaving ? <CircularProgress size={20} /> : 'Sukurti'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── New Unit Dialog ── */}
      <Dialog open={newUnitDialog} onClose={() => setNewUnitDialog(false)} disableScrollLock maxWidth="xs" fullWidth>
        <DialogTitle>Naujas mato vienetas</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField fullWidth label="Kodas (trumpinys)" value={newUnitForm.code}
              onChange={(e) => setNewUnitForm((p) => ({ ...p, code: e.target.value }))}
              placeholder="Pvz. vnt, kg, val" helperText="Trumpas kodas sąskaitoje"
              inputProps={{ style: { fontWeight: 700, fontFamily: 'monospace' } }} autoFocus />
            <TextField fullWidth label="Pilnas pavadinimas" value={newUnitForm.name}
              onChange={(e) => setNewUnitForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Pvz. Vienetas, Kilogramas" helperText="Neprivalomas aprašymas" />
            {newUnitForm.code && (
              <Box sx={{ p: 2, borderRadius: 2, textAlign: 'center', backgroundColor: P.bg, border: `1px solid ${P.border}` }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Sąskaitoje atrodys taip:</Typography>
                <Typography sx={{ fontSize: 16 }}>
                  <span style={{ color: '#888' }}>2 </span>
                  <strong style={{ fontFamily: 'monospace', color: P.primary }}>{newUnitForm.code}</strong>
                  <span style={{ color: '#888' }}> × 100,00 € = 200,00 €</span>
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setNewUnitDialog(false)}>Atšaukti</Button>
          <Button variant="contained" onClick={handleCreateUnit} disabled={newUnitSaving || !newUnitForm.code.trim()}>
            {newUnitSaving ? <CircularProgress size={20} /> : 'Sukurti'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.severity} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

const SumRow = ({ label, value, bold, primary, indent }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5, ...(indent ? { pl: 3 } : {}), ...(bold ? { mt: 1, pt: 1, borderTop: '2px solid #333' } : {}) }}>
    <Typography sx={{ fontWeight: bold ? 800 : 400, fontSize: indent ? 13 : 14 }}>{label}</Typography>
    <Typography sx={{ fontWeight: bold ? 800 : 700, fontSize: indent ? 13 : 14, ...(primary ? { color: '#1976d2' } : {}) }}>{value}</Typography>
  </Box>
);

export default InvoiceEditorPage;





// import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
// import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
// import {
//   Box, Paper, TextField, Button, Typography, IconButton, MenuItem, Divider,
//   InputAdornment, Grid2, Stack, Switch, FormControlLabel, ToggleButton,
//   ToggleButtonGroup, Chip, CircularProgress, Snackbar, Alert, Dialog,
//   DialogTitle, DialogContent, DialogContentText, DialogActions, Autocomplete,
//   Collapse, useTheme, useMediaQuery, Tooltip,
// } from '@mui/material';
// import {
//   Add as AddIcon, Delete as DeleteIcon, Save as SaveIcon, Send as SendIcon,
//   CheckCircle as CheckIcon, Cancel as CancelIcon, ContentCopy as DuplicateIcon,
//   Receipt as PvmSfIcon, ArrowBack as BackIcon, PictureAsPdf as PdfIcon,
//   OpenInNew as OpenIcon, Person as PersonIcon, Business as BusinessIcon,
//   Edit as EditIcon, AutoMode as AutoIcon, Close as CloseIcon,
//   CalendarToday as CalendarIcon, Search as SearchIcon,
//   KeyboardArrowUp as ArrowUpIcon, KeyboardArrowDown as ArrowDownIcon,
//   DragIndicator as DragIcon, Paid as PaidIcon, HelpOutline as HelpIcon, Warning as WarningIcon
// } from '@mui/icons-material';
// import { invoicingApi } from '../api/invoicingApi';
// import { api } from '../api/endpoints';
// import DateField from '../components/DateField';
// import { COUNTRY_OPTIONS } from '../page_elements/Countries';
// import PaymentLinkToggle from '../components/PaymentLinkToggle';

// // ═══════════════════════════════════════════════════════════
// // Helpers
// // ═══════════════════════════════════════════════════════════

// const parseNum = (v) => {
//   if (typeof v === 'number') return v;
//   if (!v) return 0;
//   return parseFloat(String(v).replace(',', '.')) || 0;
// };
// const fmt2 = (n) => n.toFixed(2).replace('.', ',');
// const round2 = (n) => Math.round(n * 100) / 100;
// const allowDec = (v) => v === '' || /^[0-9]*[,.]?[0-9]*$/.test(v);
// const cleanNum = (v) => {
//   if (v == null) return '';
//   const s = String(v);
//   if (s === '0' || s.startsWith('0,') || s.startsWith('0.')) return s;
//   return s.replace(/^0+(?=\d)/, '');
// };

// const CURRENCY_SYMBOLS = {
//   'EUR': '€', 'USD': '$', 'GBP': '£', 'PLN': 'zł', 'JPY': '¥', 'CNY': '¥',
//   'KRW': '₩', 'INR': '₹', 'TRY': '₺', 'VND': '₫', 'ILS': '₪', 'PHP': '₱',
//   'NGN': '₦', 'CRC': '₡', 'PYG': '₲', 'LAK': '₭', 'GHS': '₵', 'KZT': '₸',
//   'AZN': '₼', 'UAH': '₴', 'BRL': 'R$', 'RUB': '₽', 'AUD': 'A$', 'CAD': 'C$',
//   'NZD': 'NZ$', 'HKD': 'HK$', 'SGD': 'S$', 'TWD': 'NT$', 'MXN': 'Mex$',
//   'CZK': 'Kč', 'BGN': 'лв', 'ZAR': 'R', 'SEK': 'kr', 'NOK': 'kr', 'DKK': 'kr',
//   'ISK': 'kr', 'CHF': 'CHF', 'THB': '฿', 'MYR': 'RM', 'IDR': 'Rp', 'AED': 'د.إ',
//   'SAR': '﷼', 'EGP': 'E£', 'RON': 'lei', 'HUF': 'Ft', 'CLP': 'CLP$', 'ARS': 'AR$',
//   'COP': 'COL$', 'PEN': 'S/', 'GEL': '₾',
// };

// const CURRENCIES = Object.keys(CURRENCY_SYMBOLS);
// const POPULAR_CURRENCIES = ['EUR', 'USD', 'GBP', 'PLN', 'CZK', 'CHF', 'SEK', 'NOK', 'DKK', 'UAH', 'RUB', 'BGN', 'RON', 'HUF'];
// const getSym = (c) => CURRENCY_SYMBOLS[c] || c;
// const sortedCurrencies = [
//   ...POPULAR_CURRENCIES,
//   ...CURRENCIES.filter((c) => !POPULAR_CURRENCIES.includes(c)).sort(),
// ];
// const findCountry = (code) => COUNTRY_OPTIONS.find((c) => c.code === code);

// const STATUS_CFG = {
//   draft: { label: 'Juodraštis', color: 'default' },
//   issued: { label: 'Išrašyta', color: 'info' },
//   sent: { label: 'Išsiųsta', color: 'primary' },
//   paid: { label: 'Apmokėta', color: 'success' },
//   overdue: { label: 'Vėluojanti', color: 'error' },
//   cancelled: { label: 'Atšaukta', color: 'default' },
// };

// const TYPE_LABELS = {
//   isankstine: 'Išankstinė sąskaita faktūra',
//   pvm_saskaita: 'PVM sąskaita faktūra',
//   saskaita: 'Sąskaita faktūra',
//   kreditine: 'Kreditinė sąskaita faktūra',
// };

// // ═══════════════════════════════════════════════════════════
// // Styles
// // ═══════════════════════════════════════════════════════════

// const P = { primary: '#1976d2', accent: '#dc004e', bg: '#fafafa', border: '#e0e0e0' };
// const secSx = { p: 2.5, backgroundColor: P.bg, borderRadius: 3, border: `1px solid ${P.border}`, mb: 3 };
// const titleSx = { fontSize: 16, fontWeight: 700, mb: 1.5, color: '#333' };
// const menuProps = { disableScrollLock: true, PaperProps: { sx: { maxHeight: 400 } } };

// const emptyLine = () => ({
//   prekes_pavadinimas: '', prekes_kodas: '', prekes_barkodas: '',
//   quantity: '1', unit: 'vnt', price: '0',
//   discount_value: '0', discount_type: 'percent',
//   vat_percent: '',
//   save_to_catalog: false, preke_paslauga: '',
// });

// const PERIOD_TYPE_OPTIONS = [
//   { value: 'daily', label: 'Diena' },
//   { value: 'weekly', label: 'Savaitė' },
//   { value: 'monthly', label: 'Mėnuo' },
// ];

// const FREQUENCY_OPTIONS = {
//   daily: [
//     { value: 1, label: 'Kasdien' },
//     { value: 2, label: 'Kas 2 dienas' },
//     { value: 3, label: 'Kas 3 dienas' },
//     { value: 4, label: 'Kas 4 dienas' },
//     { value: 5, label: 'Kas 5 dienas' },
//     { value: 6, label: 'Kas 6 dienas' },
//   ],
//   weekly: [
//     { value: 1, label: 'Kas savaitę' },
//     { value: 2, label: 'Kas 2 savaites' },
//     { value: 3, label: 'Kas 3 savaites' },
//     { value: 4, label: 'Kas 4 savaites' },
//   ],
//   monthly: [
//     { value: 1, label: 'Kas mėnesį' },
//     ...Array.from({ length: 11 }, (_, i) => ({
//       value: i + 2,
//       label: `Kas ${i + 2} mėn.`,
//     })),
//   ],
// };

// // ═══════════════════════════════════════════════════════════
// // NumField — decimal input with optional maxDecimals
// // ═══════════════════════════════════════════════════════════

// const NumField = ({ value, onChange, maxDecimals, ...props }) => (
//   <TextField
//     {...props}
//     value={value ?? ''}
//     inputProps={{ inputMode: 'decimal', ...props.inputProps }}
//     onFocus={() => { if (value === '0') onChange(''); }}
//     onChange={(e) => {
//       let v = e.target.value.replace('.', ',');
//       if (!allowDec(v)) return;
//       if (maxDecimals != null) {
//         const parts = v.split(',');
//         if (parts.length === 2 && parts[1].length > maxDecimals) return;
//       }
//       onChange(cleanNum(v));
//     }}
//   />
// );

// const IntField = ({ value, onChange, min = 0, max = 100, ...props }) => (
//   <TextField
//     {...props}
//     value={value ?? ''}
//     inputProps={{ inputMode: 'numeric', ...props.inputProps }}
//     onFocus={() => { if (value === '0') onChange(''); }}
//     onChange={(e) => {
//       const v = e.target.value.replace(/[^0-9]/g, '');
//       if (v === '') { onChange(''); return; }
//       const n = parseInt(v, 10);
//       if (n > max) return;
//       onChange(String(n));
//     }}
//   />
// );

// // ═══════════════════════════════════════════════════════════
// // DebouncedField — types locally, syncs parent on blur
// // ═══════════════════════════════════════════════════════════

// const DebouncedField = ({ value, onChange, ...props }) => {
//   const [local, setLocal] = useState(value ?? '');
//   const parentVal = useRef(value);

//   useEffect(() => {
//     if (value !== parentVal.current) {
//       parentVal.current = value;
//       setLocal(value ?? '');
//     }
//   }, [value]);

//   const flush = () => {
//     if (local !== parentVal.current) {
//       parentVal.current = local;
//       onChange(local);
//     }
//   };

//   return (
//     <TextField
//       {...props}
//       value={local}
//       onChange={(e) => setLocal(e.target.value)}
//       onBlur={flush}
//     />
//   );
// };

// const DebouncedNumField = ({ value, onChange, maxDecimals, ...props }) => {
//   const [local, setLocal] = useState(value ?? '');
//   const parentVal = useRef(value);

//   useEffect(() => {
//     if (value !== parentVal.current) {
//       parentVal.current = value;
//       setLocal(value ?? '');
//     }
//   }, [value]);

//   return (
//     <TextField
//       {...props}
//       value={local}
//       inputProps={{ inputMode: 'decimal', ...props.inputProps }}
//       onFocus={() => { if (local === '0') setLocal(''); }}
//       onChange={(e) => {
//         let v = e.target.value.replace('.', ',');
//         if (!allowDec(v)) return;
//         if (maxDecimals != null) {
//           const parts = v.split(',');
//           if (parts.length === 2 && parts[1].length > maxDecimals) return;
//         }
//         setLocal(cleanNum(v));
//       }}
//       onBlur={() => {
//         const cleaned = local === '' ? '0' : local;
//         if (cleaned !== parentVal.current) {
//           parentVal.current = cleaned;
//           onChange(cleaned);
//         }
//       }}
//     />
//   );
// };

// const DebouncedIntField = ({ value, onChange, min = 0, max = 100, ...props }) => {
//   const [local, setLocal] = useState(value ?? '');
//   const parentVal = useRef(value);

//   useEffect(() => {
//     if (value !== parentVal.current) {
//       parentVal.current = value;
//       setLocal(value ?? '');
//     }
//   }, [value]);

//   return (
//     <TextField
//       {...props}
//       value={local}
//       inputProps={{ inputMode: 'numeric', ...props.inputProps }}
//       onFocus={() => { if (local === '0') setLocal(''); }}
//       onChange={(e) => {
//         const v = e.target.value.replace(/[^0-9]/g, '');
//         if (v === '') { setLocal(''); return; }
//         const n = parseInt(v, 10);
//         if (n > max) return;
//         setLocal(String(n));
//       }}
//       onBlur={() => {
//         const val = local === '' ? '0' : local;
//         if (val !== parentVal.current) {
//           parentVal.current = val;
//           onChange(val);
//         }
//       }}
//     />
//   );
// };

// // ═══════════════════════════════════════════════════════════
// // CountryField — вынесен за пределы компонента
// // ═══════════════════════════════════════════════════════════

// const CountryField = ({ value, onChange, disabled, label = "Šalis" }) => (
//   <Autocomplete
//     value={findCountry(value) || null}
//     onChange={(_, v) => onChange(v ? v.code : '')}
//     options={COUNTRY_OPTIONS}
//     getOptionLabel={(o) => o.name || ''}
//     isOptionEqualToValue={(o, v) => o.code === v.code}
//     disabled={disabled}
//     disableClearable={!!value}
//     renderOption={(props, o) => (
//       <li {...props} key={o.code}>
//         <Typography variant="body2">{o.name}</Typography>
//         <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', pl: 1 }}>{o.code}</Typography>
//       </li>
//     )}
//     renderInput={(params) => <TextField {...params} label={label} />}
//     componentsProps={{ popper: { disablePortal: false } }}
//   />
// );

// // ═══════════════════════════════════════════════════════════
// // Component
// // ═══════════════════════════════════════════════════════════

// const InvoiceEditorPage = () => {
//   const { id } = useParams();
//   const navigate = useNavigate();
//   const [searchParams] = useSearchParams();
//   const theme = useTheme();
//   const isMobile = useMediaQuery(theme.breakpoints.down('md'));
//   const isNew = !id || id === 'nauja';
//   const duplicateFromId = isNew ? searchParams.get('from') : null;
//   const recurringEditId = isNew ? searchParams.get('recurring') : null;     
//   const recurringCopyId = isNew ? searchParams.get('recurring_from') : null;

//   const [loading, setLoading] = useState(!isNew);
//   const [saving, setSaving] = useState(false);
//   const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });
//   const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', text: '', action: null });
//   const [emailWarning, setEmailWarning] = useState({ open: false, action: null });
//   const [settings, setSettings] = useState(null);
//   const [invoiceData, setInvoiceData] = useState(null);
//   const [paymentLink, setPaymentLink] = useState({ enabled: false, provider: '' });

//   const [form, setForm] = useState({
//     invoice_type: 'pvm_saskaita', status: 'draft',
//     document_series: '', document_number: '',
//     invoice_date: new Date().toISOString().split('T')[0], due_date: '',
//     order_number: '', currency: 'EUR',
//     pvm_tipas: 'taikoma', vat_percent: '21',
//     note: '', public_link_enabled: true,
//     seller_name: '', seller_id: '', seller_vat_code: '', seller_address: '',
//     seller_country: 'Lietuva',      
//     seller_country_iso: 'LT',
//     seller_phone: '', seller_email: '', seller_bank_name: '', seller_iban: '', seller_swift: '',
//     seller_extra_info: '',
//     seller_type: 'juridinis',
//     buyer_counterparty: null, buyer_type: 'juridinis',
//     buyer_name: '', buyer_id: '', buyer_vat_code: '', buyer_address: '',
//     buyer_country: 'Lietuva',             
//     buyer_country_iso: 'LT',           
//     buyer_phone: '', buyer_email: '', buyer_bank_name: '', buyer_iban: '', buyer_swift: '',
//     buyer_extra_info: '', buyer_delivery_address: '',
//     issued_by: '', received_by: '',
//     full_number: '', uuid: '', pdf_url: null,
//     is_editable: true, can_be_sent: false, can_create_pvm_sf: false, public_url: null,
//     auto_create_sf_on_paid: false,
//     auto_sf_series: '',
//     auto_sf_send: false,
//     send_payment_reminders: false,
//   });

//   const [lineItems, setLineItems] = useState([emptyLine()]);

//   const [showSellerExtra, setShowSellerExtra] = useState(false);
//   const [showBuyerExtra, setShowBuyerExtra] = useState(false);
//   const [showBuyerDelivery, setShowBuyerDelivery] = useState(false);
//   const [saveBuyerAsClient, setSaveBuyerAsClient] = useState(false);
//   const [showLineDiscount, setShowLineDiscount] = useState(false);
//   const [showTotalDiscount, setShowTotalDiscount] = useState(false);
//   const [totalDiscountType, setTotalDiscountType] = useState('percent');
//   const [totalDiscountValue, setTotalDiscountValue] = useState('0');

//   const [showPerLineVat, setShowPerLineVat] = useState(false);
//   const [showNote, setShowNote] = useState(false);
//   const [showOrderNumber, setShowOrderNumber] = useState(false);

//   // ── Periodinė sąskaita ──
//   const [isRecurring, setIsRecurring] = useState(false);
//   const [recurringForm, setRecurringForm] = useState({
//     start_date: new Date().toISOString().split('T')[0],
//     payment_term_days: '14',
//     period_type: 'monthly',   // 'daily' | 'weekly' | 'monthly'
//     interval: 1,
//     first_day_of_month: false,
//     last_day_of_month: false,
//     end_type: '',              // '' | 'date' | 'count'
//     end_date: '',
//     max_count: '',
//   });
//   const uRec = (field, value) => setRecurringForm((p) => ({ ...p, [field]: value }));

//   const [availableSeries, setAvailableSeries] = useState([]);
//   const [availableUnits, setAvailableUnits] = useState([]);

//   const [autoNumber, setAutoNumber] = useState('');
//   const [customNumberMode, setCustomNumberMode] = useState(false);
//   const customNumberModeRef = useRef(false);
//   const [numberChecking, setNumberChecking] = useState(false);
//   const [numberError, setNumberError] = useState('');
//   const numberCheckTimer = useRef(null);
//   const originalNumberRef = useRef('');  // stores loaded number for existing invoices

//   // ── Note template ──
//   const noteIsTemplateRef = useRef(false);

//   const [buyerSearchInput, setBuyerSearchInput] = useState('');
//   const [buyerOptions, setBuyerOptions] = useState([]);
//   const [buyerSearchLoading, setBuyerSearchLoading] = useState(false);

//   const [searchActiveLine, setSearchActiveLine] = useState(null);
//   const [productOptions, setProductOptions] = useState({});
//   const [productSearchLoading, setProductSearchLoading] = useState({});
//   const [linesFromSearch, setLinesFromSearch] = useState(new Set());
//   const productSearchTimers = useRef({});
//   const searchBtnRef = useRef(false);

//   // ── Inline create dialogs ──
//   const [newSeriesDialog, setNewSeriesDialog] = useState(false);
//   const [newSeriesForm, setNewSeriesForm] = useState({
//     invoice_type: 'pvm_saskaita', prefix: '', next_number: 1, padding: 3, is_default: false,
//   });
//   const [newSeriesSaving, setNewSeriesSaving] = useState(false);
//   const [newSeriesNumberCheck, setNewSeriesNumberCheck] = useState({ checking: false, exists: false });

//   const [newUnitDialog, setNewUnitDialog] = useState(false);
//   const [newUnitForm, setNewUnitForm] = useState({ code: '', name: '' });
//   const [newUnitSaving, setNewUnitSaving] = useState(false);
//   const [newUnitForLine, setNewUnitForLine] = useState(null); // index строки

//   // ── Required fields errors ──
//   const [fieldErrors, setFieldErrors] = useState({});

//   // ── Buyer search ──
//   useEffect(() => {
//     if (buyerSearchInput.length < 2) { setBuyerOptions([]); return; }
//     const t = setTimeout(async () => {
//       setBuyerSearchLoading(true);
//       try {
//         const { data } = await api.get('/invoicing/search-companies/', {
//           params: { q: buyerSearchInput, limit: 20 }, withCredentials: true,
//         });
//         setBuyerOptions(data || []);
//       } catch { setBuyerOptions([]); }
//       finally { setBuyerSearchLoading(false); }
//     }, 300);
//     return () => clearTimeout(t);
//   }, [buyerSearchInput]);

//   // ── Product search ──
//   const searchProducts = useCallback((lineIndex, query) => {
//     const key = `${lineIndex}_name`;
//     if (query.length < 2) { setProductOptions((p) => ({ ...p, [key]: [] })); return; }
//     if (productSearchTimers.current[key]) clearTimeout(productSearchTimers.current[key]);
//     productSearchTimers.current[key] = setTimeout(async () => {
//       setProductSearchLoading((p) => ({ ...p, [key]: true }));
//       try {
//         const { data } = await api.get('/invoicing/search-products/', {
//           params: { q: query, field: 'name', limit: 15 }, withCredentials: true,
//         });
//         setProductOptions((p) => ({ ...p, [key]: data || [] }));
//       } catch { setProductOptions((p) => ({ ...p, [key]: [] })); }
//       finally { setProductSearchLoading((p) => ({ ...p, [key]: false })); }
//     }, 300);
//   }, []);

//   const selectProduct = (lineIndex, product) => {
//     if (!product) return;
//     setLineItems((prev) => prev.map((li, idx) => {
//       if (idx !== lineIndex) return li;
//       return {
//         ...li,
//         prekes_pavadinimas: product.prekes_pavadinimas || product.name || '',
//         prekes_kodas: product.prekes_kodas || product.code || '',
//         prekes_barkodas: product.prekes_barkodas || product.barcode || '',
//         price: String(product.price ?? li.price),
//         unit: product.unit || li.unit,
//         vat_percent: product.vat_percent != null ? String(product.vat_percent) : li.vat_percent,
//       };
//     }));
//     setLinesFromSearch((prev) => new Set(prev).add(lineIndex));
//   };

//   const clearProductFields = (i) => {
//     setLineItems((prev) => prev.map((li, idx) => {
//       if (idx !== i) return li;
//       return { ...li, prekes_pavadinimas: '', prekes_kodas: '', prekes_barkodas: '' };
//     }));
//     setLinesFromSearch((prev) => { const n = new Set(prev); n.delete(i); return n; });
//     setProductOptions((p) => ({ ...p, [`${i}_name`]: [] }));
//   };

//   const activateSearch = (lineIndex) => {
//     setSearchActiveLine(lineIndex);
//     const currentName = lineItems[lineIndex].prekes_pavadinimas;
//     if (currentName.length >= 2) searchProducts(lineIndex, currentName);
//   };

//   // ── Helpers ──
//   const u = (field, value) => {
//     setFieldErrors((p) => { if (p[field]) { const n = { ...p }; delete n[field]; return n; } return p; });
//     setForm((p) => ({ ...p, [field]: value }));
//   };

//   const setCustomNumber = (val) => {
//     const newVal = typeof val === 'function' ? val(customNumberModeRef.current) : val;
//     customNumberModeRef.current = newVal;
//     setCustomNumberMode(newVal);
//   };

//   // FIX #1: Editing allowed for all statuses except cancelled
//   const isEditable = form.status !== 'cancelled';

//   const sym = getSym(form.currency);
//   const isPvm = form.pvm_tipas === 'taikoma';
//   const showPvmSelector = form.invoice_type === 'isankstine';
//   const showVatOptions = isPvm && form.invoice_type !== 'saskaita';

//   // Whether to show editable number field (all editable statuses)
//   const showNumberEditor = isEditable;
//   // Whether this is a new/draft (auto-number available) vs existing issued
//   const isAutoNumberMode = isNew || form.status === 'draft';

//   // ── Note template builder ──
//   const buildNoteTemplate = useCallback((series, number) => {
//     const fullNum = series && number ? `${series}-${number}` : (series || number || '___');
//     return `Apmokėdami paskirtyje būtinai nurodykite ${fullNum}`;
//   }, []);

//   const filteredSeries = useMemo(() => {
//     return availableSeries.filter((s) => s.invoice_type === form.invoice_type);
//   }, [availableSeries, form.invoice_type]);

//   // ── Fetch next number (sets autoNumber + form.document_number if auto mode) ──
//   const fetchNextNumber = useCallback(async (series, invoiceType) => {
//     if (!series) { setAutoNumber(''); return; }
//     try {
//       const { data } = await api.get('/invoicing/next-number/', {
//         params: { series, invoice_type: invoiceType }, withCredentials: true,
//       });
//       setAutoNumber(data.next_number || '');
//       if (!customNumberModeRef.current) {
//         setForm((p) => ({ ...p, document_number: data.next_number || '' }));
//       }
//     } catch { setAutoNumber(''); }
//   }, []);

//   // ── Fetch auto number only (does NOT touch form.document_number) ──
//   const fetchAutoNumberOnly = useCallback(async (series, invoiceType) => {
//     if (!series) { setAutoNumber(''); return ''; }
//     try {
//       const { data } = await api.get('/invoicing/next-number/', {
//         params: { series, invoice_type: invoiceType }, withCredentials: true,
//       });
//       const next = data.next_number || '';
//       setAutoNumber(next);
//       return next;
//     } catch { setAutoNumber(''); return ''; }
//   }, []);

//   const validateNumber = useCallback(async (number, series, invoiceType) => {
//     if (!number || !series) { setNumberError(''); return; }
//     setNumberChecking(true);
//     try {
//       const { data } = await api.get('/invoicing/check-number/', {
//         params: { number, series, invoice_type: invoiceType }, withCredentials: true,
//       });
//       setNumberError(data.exists ? 'Šis numeris jau užimtas' : '');
//     } catch { setNumberError(''); }
//     finally { setNumberChecking(false); }
//   }, []);

//   // ── Load settings + series + units ──
//   useEffect(() => {
//     (async () => {
//       try {
//         const [settingsRes, seriesRes, unitsRes] = await Promise.allSettled([
//           invoicingApi.getSettings(),
//           api.get('/invoicing/series/', { withCredentials: true }),
//           invoicingApi.getUnits(),
//         ]);

//         const settingsData = settingsRes.status === 'fulfilled' ? settingsRes.value.data : null;
//         const seriesList = seriesRes.status === 'fulfilled' ? (seriesRes.value.data || []) : [];
//         const unitsList = unitsRes.status === 'fulfilled' ? (unitsRes.value.data || []) : [];

//         if (settingsData) setSettings(settingsData);
//         setAvailableSeries(seriesList);
//         setAvailableUnits(unitsList.filter(Boolean));

//         if (isNew && unitsList.length > 0) {
//           const defUnit = unitsList.find((u) => u.is_default);
//           const defCode = defUnit ? defUnit.code : (unitsList[0]?.code || 'vnt');
//           setLineItems((prev) => prev.map((li, idx) => idx === 0 && li.unit === 'vnt' ? { ...li, unit: defCode } : li));
//         }

//         // Only auto-set seller/series for truly new invoices (not duplicates — those get set by duplicate effect)
//         if (isNew && !duplicateFromId && settingsData) {
//           const settingsSeriesMap = {
//             isankstine: settingsData.isankstine_series,
//             pvm_saskaita: settingsData.pvm_sf_series,
//             saskaita: settingsData.sf_series,
//             kreditine: settingsData.kreditine_series,
//           };
//           let defaultSeries = settingsSeriesMap['pvm_saskaita'] || '';
//           if (!defaultSeries && seriesList.length > 0) {
//             const match = seriesList.find((s) => s.invoice_type === 'pvm_saskaita');
//             defaultSeries = match?.prefix || '';
//           }

//           setForm((p) => ({
//             ...p,
//             seller_name: settingsData.seller_name || '',
//             seller_id: settingsData.seller_company_code || '',
//             seller_vat_code: settingsData.seller_vat_code || '',
//             seller_address: settingsData.seller_address || '',
//             seller_phone: settingsData.seller_phone || '',
//             seller_email: settingsData.seller_email || '',
//             seller_bank_name: settingsData.seller_bank_name || '',
//             seller_iban: settingsData.seller_iban || '',
//             seller_swift: settingsData.seller_swift || '',
//             seller_country: settingsData.seller_country || 'Lietuva',
//             seller_country_iso: settingsData.seller_country_iso || 'LT',
//             currency: settingsData.default_currency || 'EUR',
//             vat_percent: String(settingsData.default_vat_percent ?? 21),
//             document_series: defaultSeries,
//           }));

//           if (defaultSeries) fetchNextNumber(defaultSeries, 'pvm_saskaita');

//           if (settingsData.default_payment_days) {
//             const d = new Date();
//             d.setDate(d.getDate() + settingsData.default_payment_days);
//             setForm((p) => ({ ...p, due_date: d.toISOString().split('T')[0] }));
//           }
//         }

//         // For duplicates: set seller from settings (buyer/lines come from duplicate effect)
//         if (isNew && duplicateFromId && settingsData) {
//           setForm((p) => ({
//             ...p,
//             seller_name: settingsData.seller_name || '',
//             seller_id: settingsData.seller_company_code || '',
//             seller_vat_code: settingsData.seller_vat_code || '',
//             seller_address: settingsData.seller_address || '',
//             seller_phone: settingsData.seller_phone || '',
//             seller_email: settingsData.seller_email || '',
//             seller_bank_name: settingsData.seller_bank_name || '',
//             seller_iban: settingsData.seller_iban || '',
//             seller_swift: settingsData.seller_swift || '',
//             seller_country: settingsData.seller_country || 'Lietuva',
//             seller_country_iso: settingsData.seller_country_iso || 'LT',
//             currency: settingsData.default_currency || 'EUR',
//             vat_percent: String(settingsData.default_vat_percent ?? 21),
//           }));
//           if (settingsData.default_payment_days) {
//             const d = new Date();
//             d.setDate(d.getDate() + settingsData.default_payment_days);
//             setForm((p) => ({ ...p, due_date: d.toISOString().split('T')[0] }));
//           }
//         }
//       } catch { /* не критично */ }
//     })();
//   }, [isNew, duplicateFromId, fetchNextNumber]);

//   // ── FIX #2: Load duplicate source invoice ──
//   useEffect(() => {
//     if (!duplicateFromId || !settings) return;
//     (async () => {
//       try {
//         const { data } = await invoicingApi.getInvoice(duplicateFromId);
//         const type = data.invoice_type || 'pvm_saskaita';

//         // Determine series from settings for this type
//         const settingsSeriesMap = {
//           isankstine: settings.isankstine_series, pvm_saskaita: settings.pvm_sf_series,
//           saskaita: settings.sf_series, kreditine: settings.kreditine_series,
//         };
//         let series = settingsSeriesMap[type] || '';
//         if (!series && availableSeries.length > 0) {
//           const match = availableSeries.find((s) => s.invoice_type === type);
//           series = match?.prefix || '';
//         }

//         setForm((prev) => ({
//           ...prev,
//           invoice_type: type,
//           document_series: series,
//           pvm_tipas: data.pvm_tipas || prev.pvm_tipas,
//           vat_percent: String(data.vat_percent ?? prev.vat_percent),
//           currency: data.currency || prev.currency,
//           note: data.note || '',
//           order_number: data.order_number || '',
//           buyer_counterparty: data.buyer_counterparty || null,
//           buyer_type: data.buyer_type || 'juridinis',
//           buyer_name: data.buyer_name || '',
//           buyer_id: data.buyer_id || '',
//           buyer_vat_code: data.buyer_vat_code || '',
//           buyer_address: data.buyer_address || '',
//           buyer_phone: data.buyer_phone || '',
//           buyer_email: data.buyer_email || '',
//           buyer_bank_name: data.buyer_bank_name || '',
//           buyer_iban: data.buyer_iban || '',
//           buyer_swift: data.buyer_swift || '',
//           buyer_extra_info: data.buyer_extra_info || '',
//           buyer_delivery_address: data.buyer_delivery_address || '',
//           buyer_country: data.buyer_country || '',                
//           buyer_country_iso: data.buyer_country_iso || '',
//           issued_by: data.issued_by || prev.issued_by,
//           received_by: data.received_by || prev.received_by,
//           auto_create_sf_on_paid: data.auto_create_sf_on_paid || false,
//           auto_sf_series: data.auto_sf_series || '',
//           auto_sf_send: data.auto_sf_send || false,
//         }));

//         if (data.line_items?.length) {
//           setLineItems(data.line_items.map((li) => ({
//             prekes_pavadinimas: li.prekes_pavadinimas || '',
//             prekes_kodas: li.prekes_kodas || '',
//             prekes_barkodas: li.prekes_barkodas || '',
//             quantity: String(li.quantity ?? 1), unit: li.unit || 'vnt',
//             price: String(li.price ?? 0),
//             discount_value: String(li.discount_wo_vat || 0), discount_type: 'amount',
//             vat_percent: li.vat_percent != null ? String(li.vat_percent) : '',
//             save_to_catalog: false, preke_paslauga: li.preke_paslauga || '',
//           })));
//         }

//         if (data.note) setShowNote(true);
//         if (data.buyer_delivery_address) setShowBuyerDelivery(true);
//         if (data.buyer_extra_info) setShowBuyerExtra(true);
//         if (data.order_number) setShowOrderNumber(true);
//         if (parseFloat(data.invoice_discount_wo_vat || 0) > 0) {
//           setShowTotalDiscount(true);
//           setTotalDiscountValue(String(data.invoice_discount_wo_vat));
//           setTotalDiscountType('amount');
//         }

//         prevTypeRef.current = type;
//         customNumberModeRef.current = false;
//         setCustomNumberMode(false);
//         setNumberError('');
//         if (series) fetchNextNumber(series, type);
//       } catch {
//         setSnack({ open: true, msg: 'Nepavyko įkelti šaltinio sąskaitos', severity: 'error' });
//       }
//     })();
//   }, [duplicateFromId, settings, availableSeries, fetchNextNumber]);

//   // ── Load recurring invoice for edit / duplicate ──
//   useEffect(() => {
//     const loadId = recurringEditId || recurringCopyId;
//     if (!loadId || !settings) return;
//     (async () => {
//       try {
//         const { data } = await invoicingApi.getRecurringInvoice(loadId);

//         // Включить toggle
//         setIsRecurring(true);

//         // Заполнить recurring form
//         setRecurringForm({
//           start_date: data.start_date || new Date().toISOString().split('T')[0],
//           payment_term_days: String(data.payment_term_days ?? 14),
//           period_type: data.first_day_of_month || data.last_day_of_month
//             ? 'monthly'
//             : (data.frequency || 'monthly'),
//           interval: data.interval || 1,
//           first_day_of_month: data.first_day_of_month || false,
//           last_day_of_month: data.last_day_of_month || false,
//           end_type: data.max_count ? 'count' : (data.end_date ? 'date' : ''),
//           end_date: data.end_date || '',
//           max_count: data.max_count ? String(data.max_count) : '',
//         });

//         // Заполнить основную форму
//         setForm((prev) => ({
//           ...prev,
//           invoice_type: data.invoice_type || 'pvm_saskaita',
//           document_series: data.document_series || prev.document_series,
//           currency: data.currency || prev.currency,
//           pvm_tipas: data.pvm_tipas || prev.pvm_tipas,
//           vat_percent: String(data.vat_percent ?? prev.vat_percent),
//           note: data.note || '',
//           order_number: data.order_number || '',
//           public_link_enabled: data.public_link_enabled ?? true,
//           // Seller
//           seller_name: data.seller_name || prev.seller_name,
//           seller_id: data.seller_id || prev.seller_id,
//           seller_vat_code: data.seller_vat_code || prev.seller_vat_code,
//           seller_address: data.seller_address || prev.seller_address,
//           seller_country: data.seller_country || prev.seller_country,
//           seller_country_iso: data.seller_country_iso || prev.seller_country_iso,
//           seller_phone: data.seller_phone || prev.seller_phone,
//           seller_email: data.seller_email || prev.seller_email,
//           seller_bank_name: data.seller_bank_name || prev.seller_bank_name,
//           seller_iban: data.seller_iban || prev.seller_iban,
//           seller_swift: data.seller_swift || prev.seller_swift,
//           seller_extra_info: data.seller_extra_info || '',
//           seller_type: data.seller_is_person ? 'fizinis' : 'juridinis',
//           // Buyer
//           buyer_counterparty: data.buyer_counterparty || null,
//           buyer_name: data.buyer_name || '',
//           buyer_id: data.buyer_id || '',
//           buyer_vat_code: data.buyer_vat_code || '',
//           buyer_address: data.buyer_address || '',
//           buyer_country: data.buyer_country || 'Lietuva',
//           buyer_country_iso: data.buyer_country_iso || 'LT',
//           buyer_phone: data.buyer_phone || '',
//           buyer_email: data.buyer_email || '',
//           buyer_bank_name: data.buyer_bank_name || '',
//           buyer_iban: data.buyer_iban || '',
//           buyer_swift: data.buyer_swift || '',
//           buyer_extra_info: data.buyer_extra_info || '',
//           buyer_delivery_address: data.buyer_delivery_address || '',
//           buyer_type: data.buyer_is_person ? 'fizinis' : 'juridinis',
//           // Подписи
//           issued_by: data.issued_by || prev.issued_by,
//           received_by: data.received_by || prev.received_by,
//         }));

//         // Line items
//         if (data.line_items?.length) {
//           setLineItems(data.line_items.map((li) => ({
//             prekes_pavadinimas: li.prekes_pavadinimas || '',
//             prekes_kodas: li.prekes_kodas || '',
//             prekes_barkodas: li.prekes_barkodas || '',
//             quantity: String(li.quantity ?? 1),
//             unit: li.unit || 'vnt',
//             price: String(li.price ?? 0),
//             discount_value: String(li.discount_wo_vat || 0),
//             discount_type: 'amount',
//             vat_percent: li.vat_percent != null ? String(li.vat_percent) : '',
//             save_to_catalog: false,
//             preke_paslauga: li.preke_paslauga || '',
//           })));
//         }

//         // Показать секции если есть данные
//         if (data.note) setShowNote(true);
//         if (data.buyer_delivery_address) setShowBuyerDelivery(true);
//         if (data.buyer_extra_info) setShowBuyerExtra(true);
//         if (data.seller_extra_info) setShowSellerExtra(true);
//         if (data.order_number) setShowOrderNumber(true);

//         // Установить серию и номер
//         prevTypeRef.current = data.invoice_type || 'pvm_saskaita';
//         if (data.document_series) {
//           fetchNextNumber(data.document_series, data.invoice_type || 'pvm_saskaita');
//         }
//       } catch {
//         setSnack({ open: true, msg: 'Nepavyko įkelti periodinės sąskaitos', severity: 'error' });
//       }
//     })();
//   }, [recurringEditId, recurringCopyId, settings, fetchNextNumber]);

//   // ── Auto-set pvm_tipas based on invoice type ──
//   useEffect(() => {
//     if (!isEditable) return;
//     if (form.invoice_type === 'pvm_saskaita') u('pvm_tipas', 'taikoma');
//     else if (form.invoice_type === 'saskaita') u('pvm_tipas', 'netaikoma');
//   }, [form.invoice_type, isEditable]);

//   // ── Auto-set series when type changes (new + drafts) ──
//   const prevTypeRef = useRef(form.invoice_type);
//   useEffect(() => {
//     if (loading) return;
//     // FIX #3: Also auto-set series for drafts
//     if (!isNew && form.status !== 'draft') return;
//     if (prevTypeRef.current === form.invoice_type) return;
//     prevTypeRef.current = form.invoice_type;

//     const settingsSeriesMap = settings ? {
//       isankstine: settings.isankstine_series, pvm_saskaita: settings.pvm_sf_series,
//       saskaita: settings.sf_series, kreditine: settings.kreditine_series,
//     } : {};
//     let newSeries = settingsSeriesMap[form.invoice_type] || '';
//     if (!newSeries && availableSeries.length > 0) {
//       const match = availableSeries.find((s) => s.invoice_type === form.invoice_type);
//       newSeries = match?.prefix || '';
//     }
//     u('document_series', newSeries);
//     setCustomNumber(false);
//     setNumberError('');
//     if (newSeries) fetchNextNumber(newSeries, form.invoice_type);
//     else setAutoNumber('');
//   }, [loading, form.invoice_type, form.status, settings, availableSeries, isNew, fetchNextNumber]);

//   const handleSeriesChange = (newSeries) => {
//     u('document_series', newSeries);
//     if (isAutoNumberMode) {
//       // New invoices / drafts: fetch auto number
//       setCustomNumber(false);
//       setNumberError('');
//       if (newSeries) fetchNextNumber(newSeries, form.invoice_type);
//       else { setAutoNumber(''); setForm((p) => ({ ...p, document_number: '' })); }
//     }
//   };

//   const handleCustomNumberChange = (val) => {
//     const digits = val.replace(/[^0-9]/g, '');
//     const padLen = (autoNumber || '').length || 3;

//     let final;
//     if (digits === '') {
//       final = '';
//     } else if (digits.length <= padLen) {
//       final = digits.padStart(padLen, '0');
//     } else {
//       final = digits.slice(-padLen);
//     }

//     u('document_number', final);
//     setNumberError('');
//     if (numberCheckTimer.current) clearTimeout(numberCheckTimer.current);
//     if (final) {
//       numberCheckTimer.current = setTimeout(() => {
//         validateNumber(final, form.document_series, form.invoice_type);
//       }, 500);
//     }
//   };

//   const openNewSeriesDialog = () => {
//     setNewSeriesForm({
//       invoice_type: form.invoice_type,
//       prefix: '', next_number: 1, padding: 3, is_default: false,
//     });
//     setNewSeriesNumberCheck({ checking: false, exists: false });
//     setNewSeriesDialog(true);
//   };

//   const handleCreateSeries = async () => {
//     if (!newSeriesForm.prefix.trim()) { showMsg('Įveskite serijos prefiksą', 'error'); return; }
//     if (newSeriesNumberCheck.exists) { showMsg('Šis numeris jau užimtas', 'error'); return; }
//     setNewSeriesSaving(true);
//     try {
//       const { data } = await invoicingApi.createSeries({
//         prefix: newSeriesForm.prefix.trim().toUpperCase(),
//         invoice_type: newSeriesForm.invoice_type,
//         next_number: parseInt(newSeriesForm.next_number) || 1,
//         padding: parseInt(newSeriesForm.padding) || 3,
//         is_default: newSeriesForm.is_default,
//         is_active: true,
//       });
//       const seriesRes = await api.get('/invoicing/series/', { withCredentials: true });
//       setAvailableSeries(seriesRes.data || []);

//       // Если открыли из auto-SF dropdown — обновить auto_sf_series
//       if (newSeriesForm._autoSfMode) {
//         u('auto_sf_series', data.prefix);
//       } else {
//         // Из основного dropdown — переключить тип и серию
//         if (newSeriesForm.invoice_type !== form.invoice_type) {
//           u('invoice_type', newSeriesForm.invoice_type);
//           prevTypeRef.current = newSeriesForm.invoice_type;
//         }
//         handleSeriesChange(data.prefix);
//       }

//       setNewSeriesDialog(false);
//       showMsg(`Serija "${data.prefix}" sukurta`);
//     } catch (e) {
//       const d = e.response?.data;
//       const msg = d?.detail || d?.prefix?.[0] || (typeof d === 'object' ? Object.values(d).flat().join(', ') : 'Klaida');
//       showMsg(msg, 'error');
//     } finally { setNewSeriesSaving(false); }
//   };

//   const handleCreateUnit = async () => {
//     if (!newUnitForm.code.trim()) { showMsg('Įveskite mato vienetą', 'error'); return; }
//     setNewUnitSaving(true);
//     try {
//       await invoicingApi.createUnit({
//         code: newUnitForm.code.trim(),
//         name: newUnitForm.name.trim(),
//         is_active: true,
//       });
//       const unitsRes = await invoicingApi.getUnits();
//       setAvailableUnits((unitsRes.data || []).filter(Boolean));

//       const newCode = newUnitForm.code.trim();
//       if (newUnitForLine !== null) {
//         uLine(newUnitForLine, 'unit', newCode);
//       }

//       setNewUnitDialog(false);
//       showMsg(`Mato vienetas "${newUnitForm.code.trim()}" sukurtas`);
//       setNewUnitForm({ code: '', name: '' });
//     } catch (e) {
//       const d = e.response?.data;
//       const msg = d?.detail || d?.code?.[0] || (typeof d === 'object' ? Object.values(d).flat().join(', ') : 'Klaida');
//       showMsg(msg, 'error');
//     } finally { setNewUnitSaving(false); }
//   };

//   const getSeriesPreview = () => {
//     if (!newSeriesForm.prefix) return '—';
//     const num = String(newSeriesForm.next_number || 1).padStart(newSeriesForm.padding || 3, '0');
//     return `${newSeriesForm.prefix.toUpperCase()}-${num}`;
//   };

//   // ── Load existing invoice ──
//   useEffect(() => {
//     if (isNew) return;
//     (async () => {
//       setLoading(true);
//       try {
//         const { data } = await invoicingApi.getInvoice(id);
//         setInvoiceData(data);
//         setForm({
//           invoice_type: data.invoice_type || 'pvm_saskaita',
//           status: data.status || 'draft',
//           document_series: data.document_series || '',
//           document_number: data.document_number || '',
//           invoice_date: data.invoice_date || '', due_date: data.due_date || '',
//           order_number: data.order_number || '', currency: data.currency || 'EUR',
//           pvm_tipas: data.pvm_tipas || 'taikoma',
//           vat_percent: String(data.vat_percent ?? 21),
//           note: data.note || '', public_link_enabled: data.public_link_enabled ?? true,
//           seller_name: data.seller_name || '', seller_id: data.seller_id || '',
//           seller_vat_code: data.seller_vat_code || '', seller_address: data.seller_address || '',
//           seller_phone: data.seller_phone || '', seller_email: data.seller_email || '',
//           seller_bank_name: data.seller_bank_name || '', seller_iban: data.seller_iban || '',
//           seller_swift: data.seller_swift || '', seller_extra_info: data.seller_extra_info || '',
//           seller_type: data.seller_type || 'juridinis',
//           seller_country: data.seller_country || 'Lietuva',      
//           seller_country_iso: data.seller_country_iso || 'LT',
//           buyer_counterparty: data.buyer_counterparty || null,
//           buyer_type: data.buyer_type || 'juridinis',
//           buyer_name: data.buyer_name || '', buyer_id: data.buyer_id || '',
//           buyer_vat_code: data.buyer_vat_code || '', buyer_address: data.buyer_address || '',
//           buyer_phone: data.buyer_phone || '', buyer_email: data.buyer_email || '',
//           buyer_bank_name: data.buyer_bank_name || '', buyer_iban: data.buyer_iban || '',
//           buyer_swift: data.buyer_swift || '', buyer_extra_info: data.buyer_extra_info || '',
//           buyer_delivery_address: data.buyer_delivery_address || '',
//           buyer_country: data.buyer_country || '',
//           buyer_country_iso: data.buyer_country_iso || '',  
//           issued_by: data.issued_by || '', received_by: data.received_by || '',
//           full_number: data.full_number || '', uuid: data.uuid || '',
//           pdf_url: data.pdf_url || null, is_editable: data.is_editable ?? true,
//           can_be_sent: data.can_be_sent ?? false, can_create_pvm_sf: data.can_create_pvm_sf ?? false,
//           public_url: data.public_url || null,
//           auto_create_sf_on_paid: data.auto_create_sf_on_paid || false,
//           auto_sf_series: data.auto_sf_series || '',
//           auto_sf_send: data.auto_sf_send || false,
//           send_payment_reminders: data.send_payment_reminders || false,
//         });
//         if (data.line_items?.length) {
//           setLineItems(data.line_items.map((li) => ({
//             prekes_pavadinimas: li.prekes_pavadinimas || '',
//             prekes_kodas: li.prekes_kodas || '',
//             prekes_barkodas: li.prekes_barkodas || '',
//             quantity: String(li.quantity ?? 1), unit: li.unit || 'vnt',
//             price: String(li.price ?? 0),
//             discount_value: String(li.discount_wo_vat || 0), discount_type: 'amount',
//             vat_percent: li.vat_percent != null ? String(li.vat_percent) : '',
//             save_to_catalog: false, preke_paslauga: li.preke_paslauga || '',
//           })));
//         }
//         if (data.note) setShowNote(true);
//         if (parseFloat(data.invoice_discount_wo_vat || 0) > 0) { setShowTotalDiscount(true); setTotalDiscountValue(String(data.invoice_discount_wo_vat)); setTotalDiscountType('amount'); }
//         if (data.buyer_delivery_address) setShowBuyerDelivery(true);
//         if (data.buyer_extra_info) setShowBuyerExtra(true);
//         if (data.seller_extra_info) setShowSellerExtra(true);
//         if (data.order_number) setShowOrderNumber(true);

//         // Store original number for existing invoices
//         originalNumberRef.current = data.document_number || '';
//         prevTypeRef.current = data.invoice_type || 'pvm_saskaita';

//         // Check if loaded note matches template
//         if (data.note) {
//           const tmpl = `Apmokėdami paskirtąjai būtinai nurodykite ${data.full_number || `${data.document_series || ''}-${data.document_number || ''}`}`;
//           noteIsTemplateRef.current = data.note === tmpl;
//         }

//         // FIX #3: For drafts — fetch auto number so the toggle works
//         if (data.status === 'draft' && data.document_series) {
//           const next = await fetchAutoNumberOnly(data.document_series, data.invoice_type || 'pvm_saskaita');
//           if (data.document_number && data.document_number !== next) {
//             // Saved number differs from auto → custom mode
//             setCustomNumber(true);
//           } else if (!data.document_number && next) {
//             // No saved number → set auto number
//             setForm((p) => ({ ...p, document_number: next }));
//           }
//         }
//       } catch {
//         setSnack({ open: true, msg: 'Nepavyko įkelti sąskaitos', severity: 'error' });
//       } finally { setLoading(false); }
//     })();
//   }, [id, isNew, fetchAutoNumberOnly]);

//   // ── FIX #3: Auto-set series for existing drafts that have no series ──
//   useEffect(() => {
//     if (loading || isNew || form.status !== 'draft' || form.document_series || !settings) return;
//     const settingsSeriesMap = {
//       isankstine: settings.isankstine_series, pvm_saskaita: settings.pvm_sf_series,
//       saskaita: settings.sf_series, kreditine: settings.kreditine_series,
//     };
//     let series = settingsSeriesMap[form.invoice_type] || '';
//     if (!series && availableSeries.length > 0) {
//       const match = availableSeries.find((s) => s.invoice_type === form.invoice_type);
//       series = match?.prefix || '';
//     }
//     if (series) {
//       u('document_series', series);
//       fetchNextNumber(series, form.invoice_type);
//     }
//   }, [loading, isNew, form.status, form.document_series, form.invoice_type, settings, availableSeries, fetchNextNumber]);

//   // ── Note template: auto-update when series/number changes ──
//   useEffect(() => {
//     if (!showNote || !noteIsTemplateRef.current) return;
//     const newNote = buildNoteTemplate(form.document_series, form.document_number);
//     setForm((p) => ({ ...p, note: newNote }));
//   }, [form.document_series, form.document_number, showNote, buildNoteTemplate]);

//   // ── Series number check (inline create) ──
//   useEffect(() => {
//     if (!newSeriesDialog || !newSeriesForm.prefix || !newSeriesForm.next_number) {
//       setNewSeriesNumberCheck({ checking: false, exists: false });
//       return;
//     }
//     const formatted = String(newSeriesForm.next_number).padStart(newSeriesForm.padding || 3, '0');
//     const t = setTimeout(async () => {
//       setNewSeriesNumberCheck((p) => ({ ...p, checking: true }));
//       try {
//         const { data } = await api.get('/invoicing/series/check-number/', {
//           params: { prefix: newSeriesForm.prefix, number: formatted }, withCredentials: true,
//         });
//         setNewSeriesNumberCheck({ checking: false, exists: data.exists });
//       } catch {
//         setNewSeriesNumberCheck({ checking: false, exists: false });
//       }
//     }, 400);
//     return () => clearTimeout(t);
//   }, [newSeriesDialog, newSeriesForm.prefix, newSeriesForm.next_number, newSeriesForm.padding]);

//   const handleNoteToggle = (checked) => {
//     setShowNote(checked);
//     if (checked) {
//       const tmpl = buildNoteTemplate(form.document_series, form.document_number);
//       u('note', tmpl);
//       noteIsTemplateRef.current = true;
//     }
//   };

//   const handleNoteChange = (val) => {
//     u('note', val);
//     const tmpl = buildNoteTemplate(form.document_series, form.document_number);
//     noteIsTemplateRef.current = val === tmpl;
//   };

//   const selectBuyer = (option) => {
//     if (!option) {
//       setForm((p) => ({ ...p, buyer_counterparty: null, buyer_name: '', buyer_id: '', buyer_vat_code: '', buyer_address: '', buyer_phone: '', buyer_email: '', buyer_bank_name: '', buyer_iban: '', buyer_swift: '', buyer_type: 'juridinis', buyer_extra_info: '', buyer_delivery_address: '',
//       buyer_country: 'Lietuva', buyer_country_iso: 'LT' }));
//       return;
//     }
//     setForm((p) => ({
//       ...p, buyer_counterparty: option.source === 'saved' ? option.id : null,
//       buyer_name: option.name || '', buyer_id: option.company_code || '',
//       buyer_vat_code: option.vat_code || '', buyer_address: option.address || '',
//       buyer_phone: option.phone || '', buyer_email: option.email || '',
//       buyer_bank_name: option.bank_name || '', buyer_iban: option.iban || '',
//       buyer_swift: option.swift || '',
//       buyer_type: option.is_person ? 'fizinis' : 'juridinis',
//       buyer_extra_info: option.extra_info || option.notes || '',
//       buyer_delivery_address: option.delivery_address || '',
//       buyer_country: option.country || p.buyer_country || 'Lietuva',
//       buyer_country_iso: option.country_iso || p.buyer_country_iso || 'LT',
//     }));
//     if (option.delivery_address) setShowBuyerDelivery(true);
//     if (option.extra_info || option.notes) setShowBuyerExtra(true);
//   };

//   // ── Line items ──
//   const getDefaultUnit = () => {
//     const def = availableUnits.find((u) => u.is_default);
//     return def ? def.code : (availableUnits[0]?.code || 'vnt');
//   };
//   const addLine = () => setLineItems((p) => [...p, { ...emptyLine(), unit: getDefaultUnit() }]);
//   const moveLine = (from, to) => {
//     if (to < 0 || to >= lineItems.length) return;
//     setLineItems((prev) => {
//       const next = [...prev];
//       const [item] = next.splice(from, 1);
//       next.splice(to, 0, item);
//       return next;
//     });
//     setLinesFromSearch((prev) => {
//       const next = new Set();
//       for (const idx of prev) {
//         if (idx === from) next.add(to);
//         else if (from < to && idx > from && idx <= to) next.add(idx - 1);
//         else if (from > to && idx >= to && idx < from) next.add(idx + 1);
//         else next.add(idx);
//       }
//       return next;
//     });
//   };
//   const removeLine = (i) => {
//     setLineItems((p) => p.filter((_, idx) => idx !== i));
//     setProductOptions((p) => { const n = { ...p }; delete n[`${i}_name`]; return n; });
//     setLinesFromSearch((prev) => {
//       const next = new Set();
//       for (const idx of prev) { if (idx < i) next.add(idx); else if (idx > i) next.add(idx - 1); }
//       return next;
//     });
//     if (searchActiveLine === i) setSearchActiveLine(null);
//     else if (searchActiveLine > i) setSearchActiveLine(searchActiveLine - 1);
//   };
//   const uLine = (i, f, v) => {
//       const errorMap = { prekes_pavadinimas: 'name', prekes_kodas: 'code', quantity: 'qty', unit: 'unit', price: 'price' };
//       if (errorMap[f]) {
//         setFieldErrors((p) => { const n = { ...p }; delete n[`line_${i}_${errorMap[f]}`]; return n; });
//       }
//       setLineItems((p) => p.map((li, idx) => (idx === i ? { ...li, [f]: v } : li)));
//     };

//   // ── Calculations ──
//   const lineSums = useMemo(() => {
//     return lineItems.map((li) => {
//       const qty = parseNum(li.quantity);
//       const price = parseNum(li.price);
//       const gross = qty * price;
//       let lineDiscount = 0;
//       if (showLineDiscount) {
//         const dv = parseNum(li.discount_value);
//         lineDiscount = li.discount_type === 'percent' ? gross * dv / 100 : dv;
//       }
//       const net = Math.max(0, gross - lineDiscount);
//       const vatPct = showPerLineVat
//         ? (li.vat_percent !== '' ? parseNum(li.vat_percent) : 0)
//         : (isPvm ? parseNum(form.vat_percent) : 0);
//       const vatAmt = isPvm ? net * vatPct / 100 : 0;
//       return { gross: round2(gross), lineDiscount: round2(lineDiscount), net: round2(net), vatPct, vatAmt: round2(vatAmt), total: round2(net + vatAmt) };
//     });
//   }, [lineItems, showLineDiscount, showPerLineVat, isPvm, form.vat_percent]);

//   const totals = useMemo(() => {
//     const sumNet = lineSums.reduce((s, l) => s + l.net, 0);
//     let totalDisc = 0;
//     if (showTotalDiscount) {
//       const dv = parseNum(totalDiscountValue);
//       totalDisc = totalDiscountType === 'percent' ? sumNet * dv / 100 : dv;
//     }
//     totalDisc = round2(Math.min(totalDisc, sumNet));
//     const afterDisc = round2(sumNet - totalDisc);
//     const groups = {};
//     lineSums.forEach((ls) => {
//       const rate = ls.vatPct;
//       if (!groups[rate]) groups[rate] = 0;
//       groups[rate] += ls.net;
//     });
//     const vatBreakdown = Object.entries(groups)
//       .map(([rate, groupNet]) => {
//         const r = parseFloat(rate);
//         const ratio = sumNet > 0 ? groupNet / sumNet : 0;
//         const discountedNet = round2(groupNet - totalDisc * ratio);
//         const vat = round2(discountedNet * r / 100);
//         return { rate: r, discountedNet, vat };
//       })
//       .sort((a, b) => b.rate - a.rate);
//     const vatTotal = round2(vatBreakdown.reduce((s, g) => s + g.vat, 0));
//     return { sumLines: round2(sumNet), totalDiscount: totalDisc, base: afterDisc, vat: vatTotal, grand: round2(afterDisc + vatTotal), vatBreakdown };
//   }, [lineSums, showTotalDiscount, totalDiscountValue, totalDiscountType, isPvm, form.vat_percent]);

//   const buildPayload = () => ({
//     invoice_type: form.invoice_type, document_series: form.document_series,
//     document_number: (customNumberMode || !isAutoNumberMode) ? form.document_number : '',
//     invoice_date: form.invoice_date || null, due_date: form.due_date || null,
//     order_number: form.order_number, currency: form.currency,
//     pvm_tipas: form.pvm_tipas, vat_percent: parseNum(form.vat_percent),
//     note: showNote ? form.note : '', public_link_enabled: form.public_link_enabled,
//     seller_name: form.seller_name, seller_id: form.seller_id,
//     seller_type: form.seller_type,
//     seller_vat_code: form.seller_vat_code, seller_address: form.seller_address,
//     seller_phone: form.seller_phone, seller_email: form.seller_email,
//     seller_bank_name: form.seller_bank_name, seller_iban: form.seller_iban,
//     seller_swift: form.seller_swift, seller_extra_info: form.seller_extra_info,
//     seller_country: form.seller_country,           
//     seller_country_iso: form.seller_country_iso,
//     buyer_counterparty: form.buyer_counterparty || null,
//     buyer_type: form.buyer_type,
//     buyer_name: form.buyer_name, buyer_id: form.buyer_id,
//     buyer_vat_code: form.buyer_vat_code, buyer_address: form.buyer_address,
//     buyer_phone: form.buyer_phone, buyer_email: form.buyer_email,
//     buyer_bank_name: form.buyer_bank_name, buyer_iban: form.buyer_iban,
//     buyer_swift: form.buyer_swift, buyer_extra_info: form.buyer_extra_info,
//     buyer_delivery_address: form.buyer_delivery_address,
//     buyer_country: form.buyer_country,            
//     buyer_country_iso: form.buyer_country_iso,
//     amount_wo_vat: round2(totals.base), vat_amount: round2(totals.vat),
//     amount_with_vat: round2(totals.grand),
//     invoice_discount_wo_vat: round2(totals.totalDiscount),
//     issued_by: form.issued_by, received_by: form.received_by,
//     auto_create_sf_on_paid: form.invoice_type === 'isankstine' ? form.auto_create_sf_on_paid : false,
//     auto_sf_series: form.auto_create_sf_on_paid ? form.auto_sf_series : '',
//     auto_sf_send: form.auto_create_sf_on_paid ? form.auto_sf_send : false,
//     send_payment_reminders: form.send_payment_reminders,
//     line_items: lineItems.map((li, i) => ({
//       sort_order: i,
//       prekes_pavadinimas: li.prekes_pavadinimas, prekes_kodas: li.prekes_kodas,
//       prekes_barkodas: li.prekes_barkodas,
//       quantity: parseNum(li.quantity), unit: li.unit, price: parseNum(li.price),
//       subtotal: round2(lineSums[i]?.net || 0),
//       vat_percent: showPerLineVat && li.vat_percent !== '' ? parseNum(li.vat_percent) : null,
//       discount_wo_vat: round2(lineSums[i]?.lineDiscount || 0),
//       preke_paslauga: li.preke_paslauga || '',
//     })),
//   });

//   const buildRecurringPayload = () => ({
//     // Что создавать
//     invoice_type: form.invoice_type,
//     document_series: form.document_series,
//     currency: form.currency,
//     pvm_tipas: form.pvm_tipas,
//     vat_percent: parseNum(form.vat_percent),
//     note: showNote ? form.note : '',
//     order_number: form.order_number,
//     public_link_enabled: form.public_link_enabled,

//     // Расписание
//     start_date: recurringForm.start_date || null,
//     end_date: recurringForm.end_type === 'date' ? (recurringForm.end_date || null) : null,
//     frequency: recurringForm.first_day_of_month || recurringForm.last_day_of_month
//       ? 'monthly'
//       : recurringForm.period_type,
//     interval: recurringForm.first_day_of_month || recurringForm.last_day_of_month
//       ? 1
//       : (recurringForm.interval || 1),
//     first_day_of_month: recurringForm.first_day_of_month,
//     last_day_of_month: recurringForm.last_day_of_month,
//     payment_term_days: parseInt(recurringForm.payment_term_days, 10) || 0,
//     max_count: recurringForm.end_type === 'count' ? (parseInt(recurringForm.max_count, 10) || null) : null,

//     // Автодействия
//     auto_issue: true,
//     auto_send: !!form.buyer_email,
//     send_to_email: form.buyer_email || '',

//     // Seller
//     seller_type: form.seller_type,
//     seller_name: form.seller_name,
//     seller_id: form.seller_id,
//     seller_vat_code: form.seller_vat_code,
//     seller_address: form.seller_address,
//     seller_country: form.seller_country,
//     seller_country_iso: form.seller_country_iso,
//     seller_phone: form.seller_phone,
//     seller_email: form.seller_email,
//     seller_bank_name: form.seller_bank_name,
//     seller_iban: form.seller_iban,
//     seller_swift: form.seller_swift,
//     seller_extra_info: form.seller_extra_info,

//     // Buyer
//     buyer_type: form.buyer_type,
//     buyer_counterparty: form.buyer_counterparty || null,
//     buyer_name: form.buyer_name,
//     buyer_id: form.buyer_id,
//     buyer_vat_code: form.buyer_vat_code,
//     buyer_address: form.buyer_address,
//     buyer_country: form.buyer_country,
//     buyer_country_iso: form.buyer_country_iso,
//     buyer_phone: form.buyer_phone,
//     buyer_email: form.buyer_email,
//     buyer_bank_name: form.buyer_bank_name,
//     buyer_iban: form.buyer_iban,
//     buyer_swift: form.buyer_swift,
//     buyer_extra_info: form.buyer_extra_info,
//     buyer_delivery_address: form.buyer_delivery_address,

//     // Подписи
//     issued_by: form.issued_by,
//     received_by: form.received_by,

//     // Line items
//     line_items: lineItems.map((li, i) => ({
//       sort_order: i,
//       prekes_pavadinimas: li.prekes_pavadinimas,
//       prekes_kodas: li.prekes_kodas,
//       prekes_barkodas: li.prekes_barkodas,
//       quantity: parseNum(li.quantity),
//       unit: li.unit,
//       price: parseNum(li.price),
//       vat_percent: showPerLineVat && li.vat_percent !== '' ? parseNum(li.vat_percent) : null,
//       discount_wo_vat: round2(lineSums[i]?.lineDiscount || 0),
//       preke_paslauga: li.preke_paslauga || '',
//     })),
//   });

//   const handleSave = async (andAction) => {
//     setFieldErrors({});
//     // ── Recurring flow ──
//     if (isRecurring) {
//       const errs = [];
//       if (!form.document_series) errs.push('Serija');
//       if (!recurringForm.start_date) errs.push('Pirmos sąskaitos data');
//       if (!form.seller_name) errs.push('Pardavėjo pavadinimas');
//       if (!form.seller_id) errs.push('Pardavėjo įmonės kodas');
//       if (!form.buyer_name) errs.push('Pirkėjo pavadinimas');
//       if (!form.buyer_id) errs.push('Pirkėjo įmonės kodas');
//       const hasValidLine = lineItems.some((li) => li.prekes_pavadinimas.trim() && parseNum(li.quantity) > 0 && li.unit.trim());
//       if (!hasValidLine) errs.push('Bent viena užpildyta eilutė');
//       if (recurringForm.end_type === 'date' && recurringForm.end_date && recurringForm.end_date < recurringForm.start_date) {
//         errs.push('Pabaigos data negali būti ankstesnė už pradžios datą');
//       }
//       if (errs.length > 0) {
//         showMsg(`Užpildykite: ${errs.join(', ')}`, 'error');
//         return;
//       }

//       setSaving(true);
//       try {
//         const payload = buildRecurringPayload();
//         let res;

//         if (recurringEditId) {
//           res = await invoicingApi.updateRecurringInvoice(recurringEditId, payload);
//           showMsg('Periodinė sąskaita atnaujinta');
//         } else {
//           res = await invoicingApi.createRecurringInvoice(payload);
//           showMsg('Periodinė sąskaita sukurta');
//         }

//         // Сохранить buyer как клиента
//         if (saveBuyerAsClient && form.buyer_name) {
//           try {
//             await invoicingApi.createCounterparty({
//               name: form.buyer_name, company_code: form.buyer_id,
//               vat_code: form.buyer_vat_code, address: form.buyer_address,
//               phone: form.buyer_phone, email: form.buyer_email,
//               bank_name: form.buyer_bank_name, iban: form.buyer_iban, swift: form.buyer_swift,
//               default_role: 'buyer', extra_info: form.buyer_extra_info || '',
//               notes: form.buyer_extra_info || '',
//               delivery_address: form.buyer_delivery_address || '',
//               is_person: form.buyer_type === 'fizinis',
//             });
//           } catch { /* дубликат — ок */ }
//           setSaveBuyerAsClient(false);
//         }

//         // Сохранить товары в каталог
//         for (const li of lineItems) {
//           if (li.save_to_catalog && li.prekes_pavadinimas) {
//             try {
//               const unitObj = availableUnits.find((u) => u.code === li.unit);
//               await invoicingApi.createProduct({
//                 pavadinimas: li.prekes_pavadinimas,
//                 kodas: li.prekes_kodas || '',
//                 barkodas: li.prekes_barkodas || '',
//                 pardavimo_kaina: parseNum(li.price),
//                 pvm_procentas: li.vat_percent !== '' ? parseNum(li.vat_percent) : null,
//                 measurement_unit: unitObj?.id || null,
//                 preke_paslauga: li.preke_paslauga || 'paslauga',
//               });
//             } catch { /* duplicate — ok */ }
//           }
//         }

//         navigate('/israsymas', { replace: true });
//       } catch (e) {
//         const d = e.response?.data;
//         let msg = 'Klaida saugant periodinę sąskaitą';
//         if (typeof d === 'string') msg = d;
//         else if (d?.detail) msg = d.detail;
//         else if (typeof d === 'object') msg = Object.values(d).flat().join(', ');
//         showMsg(msg, 'error');
//       } finally { setSaving(false); }
//       return;
//     }

//     // ── Normal invoice flow ──
//     if (!form.document_series) { showMsg('Pasirinkite seriją prieš saugant', 'error'); return; }
//     if (customNumberMode && numberError) { showMsg('Numeris jau užimtas, pasirinkite kitą', 'error'); return; }

//     if (andAction === 'issue' || andAction === 'issue_send') {
//       const errs = [];
//       const fe = {};
//       if (!form.invoice_date) { errs.push('Sąskaitos data'); fe.invoice_date = true; }
//       if (!form.seller_name) { errs.push('Pardavėjo pavadinimas'); fe.seller_name = true; }
//       if (!form.seller_id) { errs.push('Pardavėjo įmonės kodas'); fe.seller_id = true; }
//       if (!form.buyer_name) { errs.push('Pirkėjo pavadinimas'); fe.buyer_name = true; }
//       if (!form.buyer_id) { errs.push('Pirkėjo įmonės kodas'); fe.buyer_id = true; }
//       if (andAction === 'issue_send') {
//         const email = (form.buyer_email || '').trim();
//         if (!email || !email.includes('@') || !email.includes('.')) {
//           errs.push('Pirkėjo el. paštas'); fe.buyer_email = true;
//         }
//       }
//       if (!form.document_series) { errs.push('Serija'); fe.document_series = true; }
//       const lineErrors = [];
//       lineItems.forEach((li, idx) => {
//         const n = idx + 1;
//         if (!li.prekes_pavadinimas.trim()) { lineErrors.push(`Eilutė ${n}: pavadinimas`); fe[`line_${idx}_name`] = true; }
//         if (!li.prekes_kodas.trim()) { lineErrors.push(`Eilutė ${n}: prekės kodas`); fe[`line_${idx}_code`] = true; }
//         if (parseNum(li.quantity) <= 0) { lineErrors.push(`Eilutė ${n}: kiekis`); fe[`line_${idx}_qty`] = true; }
//         if (!li.unit.trim()) { lineErrors.push(`Eilutė ${n}: mato vienetas`); fe[`line_${idx}_unit`] = true; }
//         if (li.price === '' || li.price === null || li.price === undefined) { lineErrors.push(`Eilutė ${n}: kaina`); fe[`line_${idx}_price`] = true; }
//       });
//       if (lineErrors.length > 0) {
//         errs.push(...lineErrors);
//         fe.line_items = true;
//       }

//       setFieldErrors(fe);
//       if (errs.length > 0) { showMsg(`Užpildykite: ${errs.join(', ')}`, 'error'); return; }
//     }

//     if (showTotalDiscount && totals.totalDiscount > totals.sumLines) {
//       showMsg('Nuolaida negali viršyti bendros sumos be PVM', 'error');
//       return;
//     }

//     setSaving(true);
//     try {
//       const payload = buildPayload();
//       let res;
//       if (isNew) res = await invoicingApi.createInvoice(payload);
//       else res = await invoicingApi.updateInvoice(id, payload);
//       const newId = res.data?.id;

//       let paymentLinkError = false;

//       if (
//         !isRecurring &&
//         paymentLink.enabled &&
//         paymentLink.provider &&
//         (newId || id)
//       ) {
//         try {
//           await api.post(
//             `/invoicing/invoices/${newId || id}/generate-payment-link/`,
//             { provider: paymentLink.provider },
//             { withCredentials: true },
//           );
//         } catch (e) {
//           paymentLinkError = true;
//         }
//       }

//       if (saveBuyerAsClient && form.buyer_name) {
//         try {
//           await invoicingApi.createCounterparty({
//             name: form.buyer_name, company_code: form.buyer_id,
//             vat_code: form.buyer_vat_code, address: form.buyer_address,
//             phone: form.buyer_phone, email: form.buyer_email,
//             bank_name: form.buyer_bank_name, iban: form.buyer_iban, swift: form.buyer_swift,
//             default_role: 'buyer', extra_info: form.buyer_extra_info || '',
//             notes: form.buyer_extra_info || '',
//             delivery_address: form.buyer_delivery_address || '',
//             is_person: form.buyer_type === 'fizinis',
//           });
//         } catch { /* дубликат — ок */ }
//         setSaveBuyerAsClient(false);
//       }

//       for (const li of lineItems) {
//         if (li.save_to_catalog && li.prekes_pavadinimas) {
//           try {
//             const unitObj = availableUnits.find((u) => u.code === li.unit);
//             await invoicingApi.createProduct({
//               pavadinimas: li.prekes_pavadinimas,
//               kodas: li.prekes_kodas || '',
//               barkodas: li.prekes_barkodas || '',
//               pardavimo_kaina: parseNum(li.price),
//               pvm_procentas: li.vat_percent !== '' ? parseNum(li.vat_percent) : null,
//               measurement_unit: unitObj?.id || null,
//               preke_paslauga: li.preke_paslauga || 'paslauga',
//             });
//           } catch { /* duplicate — ok */ }
//         }
//       }

//       if (isNew && newId) {
//         if (andAction === 'issue') {
//           await invoicingApi.issueInvoice(newId);
//           showMsg(
//             paymentLinkError
//               ? 'Sąskaita sukurta ir išrašyta, bet nepavyko sukurti mokėjimo nuorodos'
//               : 'Sąskaita sukurta ir išrašyta',
//             paymentLinkError ? 'warning' : 'success',
//           );
//         } else if (andAction === 'issue_send') {
//           await invoicingApi.issueInvoice(newId);
//           if (form.buyer_email) await invoicingApi.sendInvoiceEmail(newId, form.buyer_email);
//           showMsg(
//             paymentLinkError
//               ? 'Sąskaita sukurta, išrašyta ir išsiųsta, bet nepavyko sukurti mokėjimo nuorodos'
//               : 'Sąskaita sukurta, išrašyta ir išsiųsta',
//             paymentLinkError ? 'warning' : 'success',
//           );
//         } else {
//           showMsg(
//             paymentLinkError
//               ? 'Juodraštis išsaugotas, bet nepavyko sukurti mokėjimo nuorodos'
//               : 'Juodraštis išsaugotas',
//             paymentLinkError ? 'warning' : 'success',
//           );
//         }
//         navigate('/israsymas', { replace: true });
//       } else {
//           if (andAction === 'issue') {
//             const r = await invoicingApi.issueInvoice(newId || id);
//             showMsg(
//               paymentLinkError
//                 ? 'Sąskaita išrašyta, bet nepavyko sukurti mokėjimo nuorodos'
//                 : 'Sąskaita išrašyta',
//               paymentLinkError ? 'warning' : 'success',
//             );
//             refreshForm(r.data);
//           } else if (andAction === 'issue_send') {
//             const r = await invoicingApi.issueInvoice(newId || id);
//             if (form.buyer_email) await invoicingApi.sendInvoiceEmail(r.data?.id || id, form.buyer_email);
//             showMsg(
//               paymentLinkError
//                 ? 'Sąskaita išrašyta ir išsiųsta, bet nepavyko sukurti mokėjimo nuorodos'
//                 : 'Sąskaita išrašyta ir išsiųsta',
//               paymentLinkError ? 'warning' : 'success',
//             );
//             refreshForm(r.data);
//           } else {
//             showMsg(
//               paymentLinkError
//                 ? 'Išsaugota, bet nepavyko sukurti mokėjimo nuorodos'
//                 : 'Išsaugota',
//               paymentLinkError ? 'warning' : 'success',
//             );
//             refreshForm(res.data);
//           }
//         }
//     } catch (e) {
//       const d = e.response?.data;
//       let msg = 'Klaida saugant';
//       if (typeof d === 'string') msg = d;
//       else if (d?.detail) msg = d.detail;
//       else if (typeof d === 'object') msg = Object.values(d).flat().join(', ');
//       showMsg(msg, 'error');
//     } finally { setSaving(false); }
//   };

//   const showMsg = (msg, sev = 'success') => setSnack({ open: true, msg, severity: sev });

//   const refreshForm = (data) => {
//     if (!data) return;
//     setInvoiceData(data);
//     setForm((p) => ({
//       ...p, status: data.status || p.status, full_number: data.full_number || p.full_number,
//       document_series: data.document_series || p.document_series,
//       document_number: data.document_number || p.document_number,
//       is_editable: data.is_editable ?? false, can_be_sent: data.can_be_sent ?? false,
//       can_create_pvm_sf: data.can_create_pvm_sf ?? false,
//       pdf_url: data.pdf_url || null, public_url: data.public_url || null,
//     }));
//   };

//   const doAction = async (action) => {
//     // FIX #2: Duplicate navigates instead of API call
//     if (action === 'duplicate') {
//       navigate(`/israsymas/nauja?from=${id}`);
//       return;
//     }
//     setSaving(true);
//     try {
//       let res;
//       switch (action) {
//         case 'send': res = await invoicingApi.sendInvoiceEmail(id, form.buyer_email); break;
//         case 'paid': res = await invoicingApi.markPaid(id); break;
//         case 'cancel': res = await invoicingApi.cancelInvoice(id); break;
//         case 'create_pvm_sf': res = await invoicingApi.createPvmSf(id); if (res.data?.id) navigate(`/israsymas/${res.data.id}`); showMsg('SF sukurta'); return;
//         default: return;
//       }
//       showMsg('Atlikta');
//       refreshForm(res?.data);
//     } catch (e) { showMsg(e.response?.data?.detail || 'Klaida', 'error'); }
//     finally { setSaving(false); }
//   };

//   const confirm = (title, text, action) => setConfirmDialog({ open: true, title, text, action });

//   // ═══════════════════════════════════════════════════════════
//   // Render helpers
//   // ═══════════════════════════════════════════════════════════

//   if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

//   const priceLabel = isPvm ? 'Kaina be PVM *' : 'Kaina *';
//   const sumLabel = isPvm ? 'Suma be PVM' : 'Suma';
//   const noSeriesSelected = !form.document_series;

//   const renderNameField = (i, li) => {
//     const isSearchActive = searchActiveLine === i;

//     if (isSearchActive && isEditable) {
//       const key = `${i}_name`;
//       return (
//         <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
//           <Tooltip title="Uždaryti paiešką">
//             <IconButton size="small"
//               onMouseDown={(e) => { e.preventDefault(); searchBtnRef.current = true; }}
//               onClick={() => { setSearchActiveLine(null); searchBtnRef.current = false; }}
//               sx={{
//                 border: `1px solid ${P.primary}`, borderRadius: 1.5,
//                 backgroundColor: P.primary, flexShrink: 0,
//                 '&:hover': { backgroundColor: '#1565c0' },
//               }}>
//               <SearchIcon sx={{ fontSize: 18, color: '#fff' }} />
//             </IconButton>
//           </Tooltip>
//           <Autocomplete
//             freeSolo size="small" open autoFocus fullWidth
//             options={productOptions[key] || []}
//             getOptionLabel={(o) => typeof o === 'string' ? o : o.prekes_pavadinimas || o.name || ''}
//             inputValue={li.prekes_pavadinimas}
//             onInputChange={(_, v, reason) => { if (reason === 'input') { uLine(i, 'prekes_pavadinimas', v); searchProducts(i, v); } }}
//             onChange={(_, v) => { if (v && typeof v !== 'string') selectProduct(i, v); setSearchActiveLine(null); }}
//             onClose={(_, reason) => {
//               if (searchBtnRef.current) { searchBtnRef.current = false; return; }
//               if (reason === 'escape') setSearchActiveLine(null);
//             }}
//             loading={productSearchLoading[key] || false}
//             filterOptions={(x) => x} disableClearable
//             componentsProps={{ popper: { disablePortal: false, sx: { zIndex: 1500 } } }}
//             renderOption={(props, o) => (
//               <li {...props} key={o.id || `${o.prekes_kodas}-${o.prekes_pavadinimas}`}>
//                 <Box>
//                   <Typography variant="body2" fontWeight={600}>{o.prekes_pavadinimas || o.name}</Typography>
//                   <Typography variant="caption" color="text.secondary">
//                     {[o.prekes_kodas || o.code, o.prekes_barkodas || o.barcode].filter(Boolean).join(' · ')}
//                     {o.price != null && ` · ${fmt2(parseNum(o.price))} ${sym}`}
//                   </Typography>
//                 </Box>
//               </li>
//             )}
//             renderInput={(params) => (
//               <TextField {...params} autoFocus fullWidth placeholder="Ieškoti prekę / paslaugą..." />
//             )}
//           />
//         </Box>
//       );
//     }

//     const isFromSearch = linesFromSearch.has(i);
//     return (
//       <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
//         {isEditable && (
//           <Tooltip title="Ieškoti iš prekių katalogo">
//             <IconButton size="small" onClick={() => activateSearch(i)}
//               sx={{
//                 border: `1px solid ${P.border}`, borderRadius: 1.5,
//                 backgroundColor: '#fff', flexShrink: 0,
//                 '&:hover': { backgroundColor: '#e3f2fd', borderColor: P.primary },
//               }}>
//               <SearchIcon sx={{ fontSize: 18, color: P.primary }} />
//             </IconButton>
//           </Tooltip>
//         )}
//         <DebouncedField size="small" fullWidth value={li.prekes_pavadinimas}
//           onChange={(v) => uLine(i, 'prekes_pavadinimas', v)}
//           disabled={!isEditable} placeholder="Pavadinimas *"
//           error={!!fieldErrors[`line_${i}_name`]}
//           InputProps={isFromSearch && li.prekes_pavadinimas ? {
//             endAdornment: (
//               <InputAdornment position="end">
//                 <IconButton size="small" onClick={() => clearProductFields(i)} tabIndex={-1} sx={{ p: 0.25 }}>
//                   <CloseIcon sx={{ fontSize: 16 }} />
//                 </IconButton>
//               </InputAdornment>
//             ),
//           } : undefined}
//         />
//       </Box>
//     );
//   };

//   const renderUnitField = (i, li, width) => (
//     <TextField
//       size="small" select label="Mato vnt. *"
//       value={li.unit || ''}
//       error={!!fieldErrors[`line_${i}_unit`]}
//       onChange={(e) => {
//         if (e.target.value === '__new_unit__') { setNewUnitForLine(i); setNewUnitDialog(true); return; }
//         uLine(i, 'unit', e.target.value);
//       }}
//       disabled={!isEditable}
//       SelectProps={{ MenuProps: { disableScrollLock: true, PaperProps: { sx: { maxHeight: 300, minWidth: 180 } } } }}
//       sx={width ? { width, minWidth: width } : undefined}
//     >
//       <MenuItem value="__new_unit__" sx={{ borderBottom: '1px solid #eee', py: 1 }}>
//         <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'primary.main' }}>
//           <AddIcon sx={{ fontSize: 18 }} />
//           <Typography variant="body2" sx={{ fontWeight: 400 }}>Sukurti naują</Typography>
//         </Box>
//       </MenuItem>
//       {availableUnits.filter((u) => u.is_active).map((u) => (
//         <MenuItem key={u.id} value={u.code}>
//           <strong>{u.code}</strong>&nbsp;<Typography component="span" variant="body2" color="text.secondary">({u.name})</Typography>
//         </MenuItem>
//       ))}
//     </TextField>
//   );

//   // ═══════════════════════════════════════════════════════════
//   // Render
//   // ═══════════════════════════════════════════════════════════

//   return (
//     <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
//       <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 4, '& .MuiOutlinedInput-root': { backgroundColor: '#fff' } }}>

//         {/* ─── Header ─── */}
//         <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
//           <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
//             <IconButton onClick={() => navigate('/israsymas')} size="small"><BackIcon /></IconButton>
//             <Typography variant="h1" sx={{ color: P.primary, fontWeight: 500, fontSize: 22 }}>
//               {recurringEditId ? 'Redaguoti periodinę sąskaitą'
//                 : recurringCopyId ? 'Kopijuoti periodinę sąskaitą'
//                 : isNew ? 'Nauja sąskaita'
//                 : (form.full_number || 'Sąskaita')}
//             </Typography>
//             {!isNew && <Chip label={STATUS_CFG[form.status]?.label || form.status} color={STATUS_CFG[form.status]?.color || 'default'} size="small" />}
//           </Box>
//           {!isNew && form.status !== 'draft' && (
//             <Stack direction="row" spacing={1} flexWrap="wrap">
//               {form.pdf_url && <Button size="small" variant="outlined" startIcon={<PdfIcon />} href={form.pdf_url} target="_blank">PDF</Button>}
//               {form.can_be_sent && <Button size="small" variant="contained" startIcon={<SendIcon />} onClick={() => doAction('send')}>Siųsti</Button>}
//               {['issued', 'sent'].includes(form.status) && <Button size="small" variant="contained" color="success" startIcon={<PaidIcon />} onClick={() => doAction('paid')}>Apmokėta</Button>}
//               {form.can_create_pvm_sf && <Button size="small" variant="contained" color="secondary" startIcon={<PvmSfIcon />} onClick={() => doAction('create_pvm_sf')}>Konvertuoti į SF</Button>}
//               {form.status !== 'cancelled' && <Button size="small" variant="outlined" color="error" startIcon={<CancelIcon />} onClick={() => confirm('Anuliuoti?', '', () => doAction('cancel'))}>Anuliuoti</Button>}
//               <Button size="small" variant="outlined" startIcon={<DuplicateIcon />} onClick={() => doAction('duplicate')}>Kopija</Button>
//             </Stack>
//           )}
//         </Box>

//         {/* ─── Periodinė sąskaita toggle ─── */}
//         {isEditable && (isNew || form.status === 'draft') && (
//           <Box sx={{ mb: 2 }}>
//             <FormControlLabel
//               control={
//                 <Switch checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} size="small" />
//               }
//               label={<Typography variant="body2" fontWeight={600}>Periodinė sąskaita</Typography>}
//             />

//             <Collapse in={isRecurring}>
//               <Box sx={{ ...secSx, mt: 1, backgroundColor: '#e8e5e5' }}>
//                 {/* ── Header ── */}
//                 <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
//                   <Typography sx={{ fontSize: 18, fontWeight: 700, color: P.primary }}>
//                     Periodiškumo nustatymai
//                   </Typography>
//                   <Tooltip title="Periodinės sąskaitos bus išrašomos ir siunčiamos pasirinktu dažnumu jūsų klientui, priskiriant pasirinktą seriją ir sekantį laisvą sąskaitos numerį. Periodinės sąskaitos išsiunčiamos nuo 9:00 iki 10:00 ryto pasirinktą dieną.">
//                     <IconButton size="small" sx={{ color: '#888' }}>
//                       <HelpIcon sx={{ fontSize: 20 }} />
//                     </IconButton>
//                   </Tooltip>
//                 </Box>

//                 {/* ── Pirmoji sąskaita ── */}
//                 <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>Pirmoji sąskaita</Typography>
//                 <Grid2 container spacing={1.5} sx={{ mb: 2.5 }}>
//                   <Grid2 size={{ xs: 6, sm: 4 }}>
//                     <DateField
//                       label="Pirmos sąskaitos data"
//                       value={recurringForm.start_date}
//                       onChange={(v) => uRec('start_date', v)}
//                       disabled={!isEditable}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 6, sm: 3 }}>
//                     <DebouncedIntField
//                       fullWidth
//                       label="Apmokėjimo terminas"
//                       value={recurringForm.payment_term_days}
//                       onChange={(v) => uRec('payment_term_days', v)}
//                       disabled={!isEditable}
//                       max={365}
//                       InputProps={{
//                         endAdornment: <InputAdornment position="end">d.</InputAdornment>,
//                       }}
//                     />
//                   </Grid2>
//                 </Grid2>

//                 <Divider sx={{ my: 2 }} />

//                 {/* ── Kaip dažnai išrašyti? ── */}
//                 <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>Kaip dažnai išrašyti?</Typography>

//                 <Grid2 container spacing={1.5} sx={{ mb: 1.5 }}>
//                   <Grid2 size={{ xs: 6, sm: 4 }}>
//                     <TextField
//                       fullWidth select label="Periodiškumas"
//                       value={recurringForm.period_type}
//                       onChange={(e) => {
//                         const newType = e.target.value;
//                         uRec('period_type', newType);
//                         uRec('interval', 1);
//                         uRec('first_day_of_month', false);
//                         uRec('last_day_of_month', false);
//                       }}
//                       disabled={!isEditable || recurringForm.first_day_of_month || recurringForm.last_day_of_month}
//                       SelectProps={{ MenuProps: menuProps }}
//                     >
//                       {PERIOD_TYPE_OPTIONS.map((o) => (
//                         <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
//                       ))}
//                     </TextField>
//                   </Grid2>
//                   <Grid2 size={{ xs: 6, sm: 4 }}>
//                     <TextField
//                       fullWidth select label="Dažnis"
//                       value={recurringForm.interval}
//                       onChange={(e) => uRec('interval', e.target.value)}
//                       disabled={!isEditable || recurringForm.first_day_of_month || recurringForm.last_day_of_month}
//                       SelectProps={{ MenuProps: menuProps }}
//                     >
//                       {(FREQUENCY_OPTIONS[recurringForm.period_type] || []).map((o) => (
//                         <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
//                       ))}
//                     </TextField>
//                   </Grid2>
//                 </Grid2>

//                 <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 2 }}>
//                   <FormControlLabel
//                     control={
//                       <Switch
//                         checked={recurringForm.first_day_of_month}
//                         onChange={(e) => {
//                           uRec('first_day_of_month', e.target.checked);
//                           if (e.target.checked) {
//                             uRec('last_day_of_month', false);
//                             uRec('period_type', 'monthly');
//                             uRec('interval', 1);
//                           }
//                         }}
//                         size="small"
//                       />
//                     }
//                     label={<Typography variant="body2">Kas pirma mėnesio diena</Typography>}
//                   />
//                   <FormControlLabel
//                     control={
//                       <Switch
//                         checked={recurringForm.last_day_of_month}
//                         onChange={(e) => {
//                           uRec('last_day_of_month', e.target.checked);
//                           if (e.target.checked) {
//                             uRec('first_day_of_month', false);
//                             uRec('period_type', 'monthly');
//                             uRec('interval', 1);
//                           }
//                         }}
//                         size="small"
//                       />
//                     }
//                     label={<Typography variant="body2">Kas paskutinė mėnesio diena</Typography>}
//                   />
//                 </Box>

//                 <Divider sx={{ my: 2 }} />

//                 {/* ── Kada baigti? ── */}
//                 <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
//                   <Typography variant="body2" fontWeight={600}>Kada baigti?</Typography>
//                   <Tooltip title='Nepasirinkus siuntimo pabaigos sąlygos, periodinės sąskaitos bus siunčiamos tol, kol nesustabdysite jų "Sąskaitos" puslapyje.'>
//                     <IconButton size="small" sx={{ color: '#888', p: 0.25 }}>
//                       <HelpIcon sx={{ fontSize: 18 }} />
//                     </IconButton>
//                   </Tooltip>
//                 </Box>
//                 <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
//                   <FormControlLabel
//                     control={
//                       <Switch
//                         checked={recurringForm.end_type === 'date'}
//                         onChange={(e) => uRec('end_type', e.target.checked ? 'date' : '')}
//                         size="small"
//                       />
//                     }
//                     label={<Typography variant="body2">Pabaigos data</Typography>}
//                   />
//                   <Collapse in={recurringForm.end_type === 'date'}>
//                     <Box sx={{ pl: 4, pb: 1, maxWidth: 250 }}>
//                       <DateField
//                         label="Pabaigos data"
//                         value={recurringForm.end_date}
//                         onChange={(v) => uRec('end_date', v)}
//                         disabled={!isEditable}
//                       />
//                     </Box>
//                   </Collapse>

//                   <FormControlLabel
//                     control={
//                       <Switch
//                         checked={recurringForm.end_type === 'count'}
//                         onChange={(e) => uRec('end_type', e.target.checked ? 'count' : '')}
//                         size="small"
//                       />
//                     }
//                     label={<Typography variant="body2">Po sąskaitų kiekio</Typography>}
//                   />
//                   <Collapse in={recurringForm.end_type === 'count'}>
//                     <Box sx={{ pl: 4, pb: 1 }}>
//                       <DebouncedIntField
//                         label="Sąskaitų kiekis"
//                         value={recurringForm.max_count}
//                         onChange={(v) => uRec('max_count', v)}
//                         disabled={!isEditable}
//                         max={999}
//                         sx={{ width: 200 }}
//                       />
//                     </Box>
//                   </Collapse>
//                 </Box>
//               </Box>
//             </Collapse>
//           </Box>
//         )}

//         {/* ─── 1. Tipas + Serija + Numeris ─── */}
//         <Box sx={{ ...secSx, pb: 4 }}>
//           <Grid2 container spacing={1.5} alignItems="center" sx={{ maxWidth: 780 }}>
//             <Grid2 size={{ xs: 12, sm: 5 }}>
//               <TextField fullWidth select label="Dokumento tipas *" value={form.invoice_type}
//                 onChange={(e) => u('invoice_type', e.target.value)} disabled={!isEditable}
//                 SelectProps={{ MenuProps: menuProps }}>
//                 {Object.entries(TYPE_LABELS).map(([k, v]) => (
//                   <MenuItem key={k} value={k} disabled={k === 'kreditine'}>
//                     {v}{k === 'kreditine' ? ' (ruošiama)' : ''}
//                   </MenuItem>
//                 ))}
//               </TextField>
//             </Grid2>
//             <Grid2 size={{ xs: 6, sm: 4 }}>
//               {isEditable ? (
//                 <TextField fullWidth select label="Serija *" value={form.document_series}
//                   error={!!fieldErrors.document_series}
//                   onChange={(e) => {
//                     if (e.target.value === '__new__') { openNewSeriesDialog(); return; }
//                     handleSeriesChange(e.target.value);
//                   }}
//                   disabled={!isEditable}
//                   SelectProps={{ MenuProps: menuProps }}>
//                   <MenuItem value="__new__" sx={{ borderBottom: '1px solid #eee', py: 1 }}>
//                     <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'primary.main' }}>
//                       <AddIcon sx={{ fontSize: 18 }} />
//                       <Typography variant="body2" sx={{ fontWeight: 400 }}>Sukurti naują seriją</Typography>
//                     </Box>
//                   </MenuItem>
//                   {form.document_series && !filteredSeries.some((s) => s.prefix === form.document_series) && (
//                     <MenuItem key={`_current_${form.document_series}`} value={form.document_series}>
//                       <Typography variant="body2" fontWeight={600}>{form.document_series}</Typography>
//                     </MenuItem>
//                   )}
//                   {filteredSeries.map((s) => (
//                     <MenuItem key={s.id || s.prefix} value={s.prefix}>
//                       <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
//                         <Typography variant="body2" fontWeight={600}>{s.prefix}</Typography>
//                         {s.name && <Typography variant="caption" color="text.secondary">{s.name}</Typography>}
//                       </Box>
//                     </MenuItem>
//                   ))}
//                 </TextField>
//               ) : (
//                 <TextField fullWidth label="Serija" value={form.document_series}
//                   onChange={(e) => handleSeriesChange(e.target.value)} disabled={!isEditable} />
//               )}
//             </Grid2>
//             <Grid2 size={{ xs: 6, sm: 3 }} sx={{ position: 'relative' }}>
//               {showNumberEditor && isAutoNumberMode ? (
//                 /* New invoices / Drafts — auto number with manual override */
//                 <TextField fullWidth label="Numeris *"
//                   value={noSeriesSelected ? '' : (customNumberMode ? form.document_number : autoNumber)}
//                   disabled={!isEditable || !customNumberMode || noSeriesSelected}
//                   onChange={(e) => handleCustomNumberChange(e.target.value)}
//                   error={!!numberError}
//                   inputProps={{ inputMode: 'numeric' }}
//                   helperText={noSeriesSelected ? 'Iš karto pasirinkite seriją' : numberError || (customNumberMode ? `Formatas: ${autoNumber || '001'}` : 'Automatiškai')}
//                   sx={{ '& .MuiFormHelperText-root': { position: 'absolute', bottom: -20, left: 0 } }}
//                   InputProps={{
//                     endAdornment: isEditable && !noSeriesSelected && (
//                       <InputAdornment position="end">
//                         {numberChecking && <CircularProgress size={16} sx={{ mr: 0.5 }} />}
//                         <Tooltip title={customNumberMode ? 'Grąžinti automatinį' : 'Įvesti rankiniu būdu'}>
//                           <IconButton size="small" onClick={() => {
//                             if (!customNumberMode) setCustomNumber(true);
//                             else { setForm((p) => ({ ...p, document_number: autoNumber })); setNumberError(''); setCustomNumber(false); }
//                           }} edge="end">
//                             <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 700 }}>{customNumberMode ? 'Auto' : '✎'}</Typography>
//                           </IconButton>
//                         </Tooltip>
//                       </InputAdornment>
//                     ),
//                   }}
//                 />
//               ) : showNumberEditor && !isAutoNumberMode ? (
//                 /* Existing issued/sent/paid — show current number, allow manual edit */
//                 <TextField fullWidth label="Numeris"
//                   value={form.document_number}
//                   disabled={!customNumberMode}
//                   onChange={(e) => {
//                     const digits = e.target.value.replace(/[^0-9]/g, '');
//                     const padLen = originalNumberRef.current.length || 3;
//                     let final = digits === '' ? '' : digits.length <= padLen ? digits.padStart(padLen, '0') : digits.slice(-padLen);
//                     u('document_number', final);
//                     setNumberError('');
//                     if (numberCheckTimer.current) clearTimeout(numberCheckTimer.current);
//                     if (final && final !== originalNumberRef.current) {
//                       numberCheckTimer.current = setTimeout(() => {
//                         validateNumber(final, form.document_series, form.invoice_type);
//                       }, 500);
//                     }
//                   }}
//                   error={!!numberError}
//                   inputProps={{ inputMode: 'numeric' }}
//                   helperText={numberError || (customNumberMode ? 'Pakeiskite arba grąžinkite' : '')}
//                   sx={{ '& .MuiFormHelperText-root': { position: 'absolute', bottom: -20, left: 0 } }}
//                   InputProps={{
//                     endAdornment: (
//                       <InputAdornment position="end">
//                         {numberChecking && <CircularProgress size={16} sx={{ mr: 0.5 }} />}
//                         <Tooltip title={customNumberMode ? 'Grąžinti pradinį' : 'Redaguoti numerį'}>
//                           <IconButton size="small" onClick={() => {
//                             if (!customNumberMode) { setCustomNumber(true); }
//                             else { setForm((p) => ({ ...p, document_number: originalNumberRef.current })); setNumberError(''); setCustomNumber(false); }
//                           }} edge="end">
//                             <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 700 }}>{customNumberMode ? '↺' : '✎'}</Typography>
//                           </IconButton>
//                         </Tooltip>
//                       </InputAdornment>
//                     ),
//                   }}
//                 />
//               ) : (
//                 /* Cancelled — fully disabled */
//                 <TextField fullWidth label="Numeris" value={form.document_number} disabled />
//               )}
//             </Grid2>
//           </Grid2>
//           {/* Užsakymo numeris */}
//           <Box sx={{ mt: 2 }}>
//             <FormControlLabel
//               control={<Switch checked={showOrderNumber} onChange={(e) => { setShowOrderNumber(e.target.checked); if (!e.target.checked) u('order_number', ''); }} size="small" />}
//               label={<Typography variant="body2">Užsakymo numeris</Typography>}
//             />
//             <Collapse in={showOrderNumber}>
//               <DebouncedField
//                 size="small" label="Užsakymo Nr."
//                 value={form.order_number}
//                 onChange={(v) => u('order_number', v)}
//                 disabled={!isEditable}
//                 sx={{ mt: 1, maxWidth: 300 }}
//               />
//             </Collapse>
//           </Box>
//         </Box>

//         {/* ─── 2. Data + Apmoketi iki + PVM + Valiuta ─── */}
//         <Box sx={secSx}>
//           <Grid2 container spacing={1.5}>
//             {!isRecurring && (
//               <>
//                 <Grid2 size={{ xs: 6, sm: 3 }}>
//                   <DateField label="Sąskaitos data *" value={form.invoice_date} onChange={(v) => u('invoice_date', v)} disabled={!isEditable} error={!!fieldErrors.invoice_date} />
//                 </Grid2>
//                 <Grid2 size={{ xs: 6, sm: 2 }}>
//                   <DateField label="Apmokėti iki" value={form.due_date} onChange={(v) => u('due_date', v)} disabled={!isEditable} />
//                 </Grid2>
//               </>
//             )}
//             {showPvmSelector && (
//               <Grid2 size={{ xs: 6, sm: 2 }}>
//                 <TextField fullWidth select label="PVM" value={form.pvm_tipas}
//                   onChange={(e) => u('pvm_tipas', e.target.value)} disabled={!isEditable}
//                   SelectProps={{ MenuProps: menuProps }}>
//                   <MenuItem value="taikoma">Taikoma</MenuItem>
//                   <MenuItem value="netaikoma">Netaikoma</MenuItem>
//                 </TextField>
//               </Grid2>
//             )}
//             {showVatOptions && !showPerLineVat && (
//               <Grid2 size={{ xs: 6, sm: 2 }}>
//                 <DebouncedIntField fullWidth label="PVM % *" value={form.vat_percent} onChange={(v) => u('vat_percent', v)}
//                   disabled={!isEditable}
//                   InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} />
//               </Grid2>
//             )}
//             <Grid2 size={{ xs: 6, sm: 3 }}>
//               <Autocomplete
//                 value={form.currency} onChange={(_, v) => { if (v) u('currency', v); }}
//                 options={sortedCurrencies} disableClearable disabled={!isEditable}
//                 groupBy={(option) => POPULAR_CURRENCIES.includes(option) ? 'Populiarios' : 'Visos valiutos'}
//                 getOptionLabel={(option) => `${option} (${getSym(option)})`}
//                 renderInput={(params) => <TextField {...params} label="Valiuta *" />}
//                 componentsProps={{ popper: { disablePortal: false, modifiers: [{ name: 'preventOverflow', enabled: true }] } }}
//               />
//             </Grid2>
//           </Grid2>
//         </Box>

//         {/* ─── 3. Pardavėjas / Pirkėjas ─── */}
//         <Grid2 container spacing={2} sx={{ mb: 3 }}>
//           <Grid2 size={{ xs: 12, md: 6 }}>
//             <Box sx={{ ...secSx, height: '100%', mb: 0 }}>
//               <Typography sx={{ ...titleSx, color: P.primary }}>PARDAVĖJAS</Typography>
//               <Box sx={{ mb: 1.5 }}>
//                 <ToggleButtonGroup size="small" exclusive value={form.seller_type}
//                   onChange={(_, v) => { if (v) u('seller_type', v); }} disabled={!isEditable}>
//                   <ToggleButton value="juridinis"><BusinessIcon sx={{ fontSize: 18, mr: 0.5 }} />Juridinis asmuo</ToggleButton>
//                   <ToggleButton value="fizinis"><PersonIcon sx={{ fontSize: 18, mr: 0.5 }} />Fizinis asmuo</ToggleButton>
//                 </ToggleButtonGroup>
//               </Box>
//               <Grid2 container spacing={1.5}>
//                 <Grid2 size={12}><DebouncedField fullWidth label={form.seller_type === 'fizinis' ? 'Vardas Pavardė' : 'Pavadinimas *'} value={form.seller_name} onChange={(v) => u('seller_name', v)} disabled={!isEditable} error={!!fieldErrors.seller_name} /></Grid2>
//                 <Grid2 size={6}><DebouncedField fullWidth label={form.seller_type === 'fizinis' ? 'Ind. veiklos / asmens kodas *' : 'Įmonės kodas *'} value={form.seller_id} onChange={(v) => u('seller_id', v)} disabled={!isEditable} error={!!fieldErrors.seller_id} /></Grid2>
//                 <Grid2 size={6}><DebouncedField fullWidth label="PVM kodas" value={form.seller_vat_code} onChange={(v) => u('seller_vat_code', v)} disabled={!isEditable} /></Grid2>
//                 <Grid2 size={12}><DebouncedField fullWidth label="Adresas" value={form.seller_address} onChange={(v) => u('seller_address', v)} disabled={!isEditable} /></Grid2>
//                 <Grid2 size={12}>
//                   <CountryField value={form.seller_country_iso} onChange={(code) => {
//                     const c = findCountry(code);
//                     setForm((p) => ({ ...p, seller_country_iso: code, seller_country: c?.name || '' }));
//                   }} disabled={!isEditable} label="Šalis *" />
//                 </Grid2>
//                 <Grid2 size={6}><DebouncedField fullWidth label="Telefonas" value={form.seller_phone} onChange={(v) => u('seller_phone', v)} disabled={!isEditable} /></Grid2>
//                 <Grid2 size={6}><DebouncedField fullWidth label="El. paštas" value={form.seller_email} onChange={(v) => u('seller_email', v)} disabled={!isEditable} /></Grid2>
//                 <Grid2 size={12}><DebouncedField fullWidth label="Bankas" value={form.seller_bank_name} onChange={(v) => u('seller_bank_name', v)} disabled={!isEditable} /></Grid2>
//                 <Grid2 size={8}><DebouncedField fullWidth label="IBAN" value={form.seller_iban} onChange={(v) => u('seller_iban', v)} disabled={!isEditable} /></Grid2>
//                 <Grid2 size={4}><DebouncedField fullWidth label="SWIFT" value={form.seller_swift} onChange={(v) => u('seller_swift', v)} disabled={!isEditable} /></Grid2>
//               </Grid2>
//               <FormControlLabel control={<Switch checked={showSellerExtra} onChange={(e) => setShowSellerExtra(e.target.checked)} size="small" />}
//                 label={<Typography variant="body2">Papildoma informacija</Typography>} sx={{ mt: 1.5 }} />
//               <Collapse in={showSellerExtra}>
//                 <DebouncedField fullWidth multiline rows={2} value={form.seller_extra_info}
//                   onChange={(v) => u('seller_extra_info', v)}
//                   placeholder="Papildoma pardavėjo informacija..." disabled={!isEditable} sx={{ mt: 1 }} />
//               </Collapse>
//             </Box>
//           </Grid2>
//           <Grid2 size={{ xs: 12, md: 6 }}>
//             <Box sx={{ ...secSx, height: '100%', mb: 0 }}>
//               <Typography sx={{ ...titleSx, color: P.accent }}>PIRKĖJAS</Typography>
//               {isEditable && (
//                 <Autocomplete freeSolo options={buyerOptions}
//                   getOptionLabel={(o) => typeof o === 'string' ? o : `${o.name}${o.company_code ? ` (${o.company_code})` : ''}`}
//                   inputValue={buyerSearchInput}
//                   onInputChange={(_, v, reason) => { if (reason === 'input') setBuyerSearchInput(v); else if (reason === 'clear') { setBuyerSearchInput(''); setBuyerOptions([]); } }}
//                   onChange={(_, v) => { if (typeof v === 'string') selectBuyer(null); else selectBuyer(v); setBuyerSearchInput(''); setBuyerOptions([]); }}
//                   loading={buyerSearchLoading}
//                   noOptionsText={buyerSearchInput.length < 2 ? 'Įveskite bent 2 simbolius' : 'Nerasta'}
//                   filterOptions={(x) => x}
//                   componentsProps={{ popper: { disablePortal: false } }}
//                   renderOption={(props, o) => (
//                     <li {...props} key={`${o.source}-${o.id}`}>
//                       <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
//                         <Box>
//                           <Typography variant="body2" fontWeight={600}>{o.name}</Typography>
//                           <Typography variant="caption" color="text.secondary">{o.company_code}{o.vat_code ? ` · ${o.vat_code}` : ''}</Typography>
//                         </Box>
//                         {o.source === 'saved' && <Chip label="Klientas" size="small" color="primary" variant="outlined" sx={{ ml: 1, fontSize: 10, height: 20 }} />}
//                       </Box>
//                     </li>
//                   )}
//                   renderInput={(params) => (
//                     <TextField {...params} label="Ieškoti pirkėjo..." size="small" sx={{ mb: 1.5 }}
//                       InputProps={{ ...params.InputProps, endAdornment: (<>{buyerSearchLoading ? <CircularProgress size={18} /> : null}{params.InputProps.endAdornment}</>) }} />
//                   )}
//                 />
//               )}
//               <Box sx={{ mb: 1.5 }}>
//                 <ToggleButtonGroup size="small" exclusive value={form.buyer_type}
//                   onChange={(_, v) => { if (v) u('buyer_type', v); }} disabled={!isEditable}>
//                   <ToggleButton value="juridinis"><BusinessIcon sx={{ fontSize: 18, mr: 0.5 }} />Juridinis asmuo</ToggleButton>
//                   <ToggleButton value="fizinis"><PersonIcon sx={{ fontSize: 18, mr: 0.5 }} />Fizinis asmuo</ToggleButton>
//                 </ToggleButtonGroup>
//               </Box>
//               <Grid2 container spacing={1.5}>
//                 <Grid2 size={12}><DebouncedField fullWidth label={form.buyer_type === 'fizinis' ? 'Vardas Pavardė *' : 'Pavadinimas *'} value={form.buyer_name} onChange={(v) => u('buyer_name', v)} disabled={!isEditable} error={!!fieldErrors.buyer_name} /></Grid2>
//                 <Grid2 size={6}><DebouncedField fullWidth label={form.buyer_type === 'fizinis' ? 'Ind. veiklos / asmens kodas *' : 'Įmonės kodas *'} value={form.buyer_id} onChange={(v) => u('buyer_id', v)} disabled={!isEditable} error={!!fieldErrors.buyer_id} /></Grid2>
//                 <Grid2 size={6}><DebouncedField fullWidth label="PVM kodas" value={form.buyer_vat_code} onChange={(v) => u('buyer_vat_code', v)} disabled={!isEditable} /></Grid2>
//                 <Grid2 size={12}><DebouncedField fullWidth label="Adresas" value={form.buyer_address} onChange={(v) => u('buyer_address', v)} disabled={!isEditable} /></Grid2>
//                 <Grid2 size={12}>
//                   <CountryField value={form.buyer_country_iso} onChange={(code) => {
//                     const c = findCountry(code);
//                     setForm((p) => ({ ...p, buyer_country_iso: code, buyer_country: c?.name || '' }));
//                   }} disabled={!isEditable} label="Šalis *" />
//                 </Grid2>
//                 <Grid2 size={6}><DebouncedField fullWidth label="Telefonas" value={form.buyer_phone} onChange={(v) => u('buyer_phone', v)} disabled={!isEditable} /></Grid2>
//                 <Grid2 size={6}><DebouncedField fullWidth label="El. paštas *" value={form.buyer_email} onChange={(v) => u('buyer_email', v)} disabled={!isEditable} error={!!fieldErrors.buyer_email} /></Grid2>
//                 <Grid2 size={12}><DebouncedField fullWidth label="Bankas" value={form.buyer_bank_name} onChange={(v) => u('buyer_bank_name', v)} disabled={!isEditable} /></Grid2>
//                 <Grid2 size={8}><DebouncedField fullWidth label="IBAN" value={form.buyer_iban} onChange={(v) => u('buyer_iban', v)} disabled={!isEditable} /></Grid2>
//                 <Grid2 size={4}><DebouncedField fullWidth label="SWIFT" value={form.buyer_swift} onChange={(v) => u('buyer_swift', v)} disabled={!isEditable} /></Grid2>
//               </Grid2>
//               <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
//                 <FormControlLabel control={<Switch checked={showBuyerDelivery} onChange={(e) => setShowBuyerDelivery(e.target.checked)} size="small" />}
//                   label={<Typography variant="body2">Pristatymo adresas</Typography>} />
//                 <Collapse in={showBuyerDelivery}>
//                   <DebouncedField fullWidth value={form.buyer_delivery_address} onChange={(v) => u('buyer_delivery_address', v)}
//                     placeholder="Pristatymo adresas..." disabled={!isEditable} size="small" sx={{ mb: 1 }} />
//                 </Collapse>
//                 <FormControlLabel control={<Switch checked={showBuyerExtra} onChange={(e) => setShowBuyerExtra(e.target.checked)} size="small" />}
//                   label={<Typography variant="body2">Papildoma informacija</Typography>} />
//                 <Collapse in={showBuyerExtra}>
//                   <DebouncedField fullWidth multiline rows={2} value={form.buyer_extra_info} onChange={(v) => u('buyer_extra_info', v)}
//                     placeholder="Papildoma pirkėjo informacija..." disabled={!isEditable} sx={{ mb: 1 }} />
//                 </Collapse>
//                 <FormControlLabel control={<Switch checked={saveBuyerAsClient} onChange={(e) => setSaveBuyerAsClient(e.target.checked)} size="small" />}
//                   label={<Typography variant="body2">Išsaugoti klientą</Typography>} />
//               </Box>
//             </Box>
//           </Grid2>
//         </Grid2>

//         {/* ─── 4. Prekės / Paslaugos ─── */}
//         <Box sx={{ ...secSx, ...(fieldErrors.line_items ? { borderColor: '#d32f2f', borderWidth: 2 } : {}) }}>
//           <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
//             <Typography sx={{ ...titleSx, mb: 0 }}>Prekės / Paslaugos</Typography>
//             {isEditable && <Button startIcon={<AddIcon />} onClick={addLine} variant="contained" size="small">Pridėti</Button>}
//           </Box>
//           <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
//             <FormControlLabel control={<Switch checked={showLineDiscount} onChange={(e) => setShowLineDiscount(e.target.checked)} size="small" />}
//               label={<Typography variant="body2">Nuolaida eilutei</Typography>} />
//             {showVatOptions && (
//               <FormControlLabel control={<Switch checked={showPerLineVat} onChange={(e) => setShowPerLineVat(e.target.checked)} size="small" />}
//                 label={<Typography variant="body2">Skirtingi PVM %</Typography>} />
//             )}
//           </Box>

//           {!isMobile ? (
//             <>
//               <Box sx={{
//                 display: 'grid', gridTemplateColumns: 'auto 3fr 1.5fr 1.5fr auto',
//                 gap: 1, px: 1.5, py: 1, background: P.primary, borderRadius: '10px 10px 0 0',
//                 '& > *': { color: '#fff', fontSize: 11, fontWeight: 700 },
//               }}>
//                 <Typography variant="caption" sx={{ color: '#fff', fontWeight: 700, width: 28, textAlign: 'center' }}>Nr.</Typography>
//                 <Typography variant="caption" sx={{ color: '#fff', fontWeight: 700 }}>Pavadinimas *</Typography>
//                 <Typography variant="caption" sx={{ color: '#fff', fontWeight: 700 }}>Kodas *</Typography>
//                 <Typography variant="caption" sx={{ color: '#fff', fontWeight: 700 }}>Barkodas</Typography>
//                 <Box sx={{ width: 68 }} />
//               </Box>
//               {lineItems.map((li, i) => {
//                 const ls = lineSums[i] || {};
//                 const isLast = i === lineItems.length - 1;
//                 const canMove = lineItems.length > 1 && isEditable;
//                 return (
//                   <Box key={i} sx={{
//                     border: `1px solid ${P.border}`,
//                     borderTop: i === 0 ? `1px solid ${P.border}` : 'none',
//                     borderRadius: isLast ? '0 0 10px 10px' : 0, overflow: 'visible',
//                   }}>
//                     <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 3fr 1.5fr 1.5fr auto', gap: 1, px: 1.5, pt: 1.5, pb: 0.5, alignItems: 'start' }}>
//                       <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 28, minHeight: 40 }}>
//                         <Typography sx={{ fontWeight: 700, fontSize: 13, color: '#666' }}>{i + 1}</Typography>
//                       </Box>
//                       {renderNameField(i, li)}
//                       <DebouncedField size="small" fullWidth value={li.prekes_kodas} onChange={(v) => uLine(i, 'prekes_kodas', v)} disabled={!isEditable} placeholder="Kodas *" error={!!fieldErrors[`line_${i}_code`]} />
//                       <DebouncedField size="small" fullWidth value={li.prekes_barkodas} onChange={(v) => uLine(i, 'prekes_barkodas', v)} disabled={!isEditable} placeholder="Barkodas" />
//                       {isEditable ? (
//                         <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
//                           <Tooltip title="Dubliuoti eilutę">
//                             <IconButton size="small" onClick={() => {
//                               setLineItems((p) => {
//                                 const copy = { ...p[i] };
//                                 const next = [...p];
//                                 next.splice(i + 1, 0, copy);
//                                 return next;
//                               });
//                             }} sx={{ p: 0.25 }}>
//                               <DuplicateIcon sx={{ fontSize: 16 }} />
//                             </IconButton>
//                           </Tooltip>
//                           <Tooltip title="Ištrinti eilutę">
//                             <span>
//                               <IconButton size="small" onClick={() => removeLine(i)} disabled={lineItems.length === 1} sx={{ p: 0.25 }}>
//                                 <DeleteIcon sx={{ fontSize: 16 }} />
//                               </IconButton>
//                             </span>
//                           </Tooltip>
//                         </Box>
//                       ) : <Box sx={{ width: 32 }} />}
//                     </Box>
//                     <Box sx={{ display: 'flex', gap: 1, px: 1.5, pb: 1.5, pt: 1, alignItems: 'center', flexWrap: 'wrap', ml: '36px' }}>
//                       {canMove && (
//                         <Box sx={{ display: 'flex', gap: 0.25, mr: 0.5 }}>
//                           <IconButton size="small" onClick={() => moveLine(i, i - 1)} disabled={i === 0}
//                             sx={{ p: 0.25, border: `1px solid ${P.border}`, borderRadius: 1 }}>
//                             <ArrowUpIcon sx={{ fontSize: 20 }} />
//                           </IconButton>
//                           <IconButton size="small" onClick={() => moveLine(i, i + 1)} disabled={i === lineItems.length - 1}
//                             sx={{ p: 0.25, border: `1px solid ${P.border}`, borderRadius: 1 }}>
//                             <ArrowDownIcon sx={{ fontSize: 20 }} />
//                           </IconButton>
//                         </Box>
//                       )}
//                       <DebouncedNumField size="small" label="Kiekis *" sx={{ width: 90 }} value={li.quantity} onChange={(v) => uLine(i, 'quantity', v)} disabled={!isEditable} maxDecimals={5} error={!!fieldErrors[`line_${i}_qty`]} />
//                       {renderUnitField(i, li, 120)}
//                       <DebouncedNumField size="small" label={priceLabel} sx={{ width: 110 }} value={li.price} onChange={(v) => uLine(i, 'price', v)} disabled={!isEditable} maxDecimals={4} error={!!fieldErrors[`line_${i}_price`]} />
//                       {showLineDiscount && (
//                         <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
//                           <DebouncedNumField size="small" label="Nuolaida" sx={{ width: 90 }} value={li.discount_value} onChange={(v) => uLine(i, 'discount_value', v)} disabled={!isEditable} />
//                           <ToggleButtonGroup size="small" exclusive value={li.discount_type} onChange={(_, v) => { if (v) uLine(i, 'discount_type', v); }} sx={{ minWidth: 52, mt: 1 }}>
//                             <ToggleButton value="percent" sx={{ px: 0.5, py: 0.1, fontSize: 11 }}>%</ToggleButton>
//                             <ToggleButton value="amount" sx={{ px: 0.5, py: 0.1, fontSize: 11 }}>{sym}</ToggleButton>
//                           </ToggleButtonGroup>
//                         </Box>
//                       )}
//                       {showPerLineVat && showVatOptions && (
//                         <DebouncedIntField size="small" label="PVM %" sx={{ width: 90 }} value={li.vat_percent} onChange={(v) => uLine(i, 'vat_percent', v)} disabled={!isEditable} placeholder={form.vat_percent}
//                           InputProps={{ endAdornment: <InputAdornment position="end" sx={{ '& p': { fontSize: 11 } }}>%</InputAdornment> }} />
//                       )}
//                       {isEditable && (
//                         <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
//                           <FormControlLabel
//                             control={<Switch checked={li.save_to_catalog || false} onChange={(e) => uLine(i, 'save_to_catalog', e.target.checked)} size="small" />}
//                             label={<Typography variant="caption" sx={{ fontSize: 11 }}>Į katalogą</Typography>}
//                             sx={{ mr: 0 }}
//                           />
//                           {li.save_to_catalog && (
//                             <TextField size="small" select value={li.preke_paslauga || ''} onChange={(e) => uLine(i, 'preke_paslauga', e.target.value)}
//                               sx={{ width: 110 }}
//                               SelectProps={{ MenuProps: { disableScrollLock: true } }}>
//                               <MenuItem value="preke">Prekė</MenuItem>
//                               <MenuItem value="paslauga">Paslauga</MenuItem>
//                             </TextField>
//                           )}
//                         </Box>
//                       )}
//                       <Box sx={{ flex: 1 }} />
//                       <Typography sx={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', pr: 1 }}>
//                         {sumLabel}: {fmt2(ls.net || 0)} {sym}
//                       </Typography>
//                     </Box>
//                   </Box>
//                 );
//               })}
//             </>
//           ) : (
//             <Stack spacing={1.5}>
//               {lineItems.map((li, i) => {
//                 const ls = lineSums[i] || {};
//                 return (
//                   <Paper key={i} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
//                     <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
//                       <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
//                         <Typography fontWeight={700}>#{i + 1}</Typography>
//                         {lineItems.length > 1 && isEditable && (
//                           <>
//                             <IconButton size="small" onClick={() => moveLine(i, i - 1)} disabled={i === 0} sx={{ p: 0.25 }}><ArrowUpIcon fontSize="small" /></IconButton>
//                             <IconButton size="small" onClick={() => moveLine(i, i + 1)} disabled={i === lineItems.length - 1} sx={{ p: 0.25 }}><ArrowDownIcon fontSize="small" /></IconButton>
//                           </>
//                         )}
//                       </Box>
//                       {isEditable && (
//                         <Box sx={{ display: 'flex', gap: 0.5 }}>
//                           <IconButton size="small" onClick={() => {
//                             setLineItems((p) => { const next = [...p]; next.splice(i + 1, 0, { ...p[i] }); return next; });
//                           }}><DuplicateIcon fontSize="small" /></IconButton>
//                           <IconButton size="small" onClick={() => removeLine(i)} disabled={lineItems.length === 1}><DeleteIcon fontSize="small" /></IconButton>
//                         </Box>
//                       )}
//                     </Box>
//                     <Grid2 container spacing={1}>
//                       <Grid2 size={12}>{renderNameField(i, li)}</Grid2>
//                       <Grid2 size={12}>{renderNameField(i, li)}</Grid2>
//                       <Grid2 size={6}><DebouncedField size="small" fullWidth label="Kodas" value={li.prekes_kodas} onChange={(v) => uLine(i, 'prekes_kodas', v)} disabled={!isEditable} error={!!fieldErrors[`line_${i}_code`]} /></Grid2>
//                       <Grid2 size={6}><DebouncedField size="small" fullWidth label="Barkodas" value={li.prekes_barkodas} onChange={(v) => uLine(i, 'prekes_barkodas', v)} disabled={!isEditable} /></Grid2>
//                       <Grid2 size={4}><DebouncedNumField size="small" fullWidth label="Kiekis" value={li.quantity} onChange={(v) => uLine(i, 'quantity', v)} disabled={!isEditable} maxDecimals={5} error={!!fieldErrors[`line_${i}_qty`]} /></Grid2>
//                       <Grid2 size={4}>{renderUnitField(i, li)}</Grid2>
//                       <Grid2 size={4}><DebouncedNumField size="small" fullWidth label={priceLabel} value={li.price} onChange={(v) => uLine(i, 'price', v)} disabled={!isEditable} maxDecimals={4} error={!!fieldErrors[`line_${i}_price`]} /></Grid2>
//                       {showLineDiscount && (
//                         <Grid2 size={12}>
//                           <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
//                             <DebouncedNumField size="small" fullWidth label="Nuolaida" value={li.discount_value} onChange={(v) => uLine(i, 'discount_value', v)} disabled={!isEditable} />
//                             <ToggleButtonGroup size="small" exclusive value={li.discount_type} onChange={(_, v) => { if (v) uLine(i, 'discount_type', v); }}>
//                               <ToggleButton value="percent" sx={{ px: 0.75 }}>%</ToggleButton>
//                               <ToggleButton value="amount" sx={{ px: 0.75 }}>{sym}</ToggleButton>
//                             </ToggleButtonGroup>
//                           </Box>
//                         </Grid2>
//                       )}
//                       {showPerLineVat && showVatOptions && (
//                         <Grid2 size={12}><DebouncedIntField size="small" fullWidth label="PVM %" value={li.vat_percent} onChange={(v) => uLine(i, 'vat_percent', v)} disabled={!isEditable} placeholder={form.vat_percent} /></Grid2>
//                       )}
//                       {isEditable && (
//                         <Grid2 size={12}>
//                           <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
//                             <FormControlLabel
//                               control={<Switch checked={li.save_to_catalog || false} onChange={(e) => uLine(i, 'save_to_catalog', e.target.checked)} size="small" />}
//                               label={<Typography variant="caption">Į katalogą</Typography>}
//                             />
//                             {li.save_to_catalog && (
//                               <TextField size="small" select value={li.preke_paslauga || ''} onChange={(e) => uLine(i, 'preke_paslauga', e.target.value)}
//                                 sx={{ width: 120 }} SelectProps={{ MenuProps: { disableScrollLock: true } }}>
//                                 <MenuItem value="preke">Prekė</MenuItem>
//                                 <MenuItem value="paslauga">Paslauga</MenuItem>
//                               </TextField>
//                             )}
//                           </Box>
//                         </Grid2>
//                       )}
//                       <Grid2 size={12}>
//                         <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1, borderRadius: 1.5, border: `1px dashed ${P.border}`, background: P.bg }}>
//                           <Typography fontSize={14}>{sumLabel}</Typography>
//                           <Typography fontWeight={800}>{fmt2(ls.net || 0)} {sym}</Typography>
//                         </Box>
//                       </Grid2>
//                     </Grid2>
//                   </Paper>
//                 );
//               })}
//             </Stack>
//           )}
//         </Box>

//         {/* ─── 5. Totals ─── */}
//         <Box sx={secSx}>
//           <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
//             <FormControlLabel control={<Switch checked={showTotalDiscount} onChange={(e) => setShowTotalDiscount(e.target.checked)} size="small" />}
//               label={<Typography variant="body2">Nuolaida visai sąskaitai</Typography>} />
//           </Box>
//           <Collapse in={showTotalDiscount}>
//             <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, maxWidth: 350 }}>
//               <Typography variant="body2" sx={{ minWidth: 90 }}>Nuolaida:</Typography>
//               <DebouncedNumField size="small" fullWidth value={totalDiscountValue} onChange={setTotalDiscountValue} disabled={!isEditable} />
//               <ToggleButtonGroup size="small" exclusive value={totalDiscountType} onChange={(_, v) => { if (v) setTotalDiscountType(v); }}>
//                 <ToggleButton value="percent" sx={{ px: 1, py: 0.25 }}>%</ToggleButton>
//                 <ToggleButton value="amount" sx={{ px: 1, py: 0.25 }}>{sym}</ToggleButton>
//               </ToggleButtonGroup>
//             </Box>
//             {totals.totalDiscount > totals.sumLines && (
//               <Typography variant="caption" color="error" sx={{ mb: 1, display: 'block' }}>
//                 Nuolaida negali viršyti sumos be PVM ({fmt2(totals.sumLines)} {sym})
//               </Typography>
//             )}
//           </Collapse>
//           <Divider sx={{ my: 2 }} />
//           <Box sx={{ ml: 'auto', maxWidth: 460, background: '#fff', p: 2, borderRadius: 2, border: `1px solid ${P.border}` }}>
//             {showTotalDiscount && totals.totalDiscount > 0 && (
//               <>
//                 <SumRow label="Tarpinė suma:" value={`${fmt2(totals.sumLines)} ${sym}`} />
//                 <SumRow label="Nuolaida:" value={`-${fmt2(totals.totalDiscount)} ${sym}`} />
//               </>
//             )}
//             {isPvm ? (
//               <>
//                 <SumRow label="Suma be PVM:" value={`${fmt2(totals.base)} ${sym}`} />
//                 {totals.vatBreakdown.length > 1 ? (
//                   <>
//                     {totals.vatBreakdown.map((g) => (
//                       <SumRow key={`base-${g.rate}`} indent
//                         label={`Suma apmokestinama PVM ${g.rate % 1 === 0 ? g.rate : fmt2(g.rate)}%:`}
//                         value={`${fmt2(g.discountedNet)} ${sym}`} />
//                     ))}
//                     {totals.vatBreakdown.filter((g) => g.rate > 0).map((g) => (
//                       <SumRow key={`vat-${g.rate}`}
//                         label={`PVM ${g.rate % 1 === 0 ? g.rate : fmt2(g.rate)}%:`}
//                         value={`${fmt2(g.vat)} ${sym}`} />
//                     ))}
//                   </>
//                 ) : (
//                   <SumRow label={`PVM ${totals.vatBreakdown[0]?.rate ?? form.vat_percent}%:`} value={`${fmt2(totals.vat)} ${sym}`} />
//                 )}
//                 <SumRow label="SUMA SU PVM:" value={`${fmt2(totals.grand)} ${sym}`} bold primary />
//               </>
//             ) : (
//               <SumRow label="BENDRA SUMA:" value={`${fmt2(totals.base)} ${sym}`} bold primary />
//             )}
//           </Box>
//         </Box>

//         {/* ─── 6. Signatures ─── */}
//         <Box sx={secSx}>
//           <Grid2 container spacing={1.5}>
//             <Grid2 size={{ xs: 12, sm: 6 }}><DebouncedField fullWidth label="Sąskaitą išrašė" value={form.issued_by} onChange={(v) => u('issued_by', v)} disabled={!isEditable} /></Grid2>
//             <Grid2 size={{ xs: 12, sm: 6 }}><DebouncedField fullWidth label="Sąskaitą priėmė" value={form.received_by} onChange={(v) => u('received_by', v)} disabled={!isEditable} /></Grid2>
//           </Grid2>
//         </Box>

//         {/* ─── 7. Note ─── */}
//         <FormControlLabel control={<Switch checked={showNote} onChange={(e) => handleNoteToggle(e.target.checked)} size="small" />}
//           label={<Typography variant="body2">Pastaba</Typography>} sx={{ mb: 1 }} />
//         <Collapse in={showNote}>
//           <Box sx={{ ...secSx, mt: 1 }}>
//             <DebouncedField fullWidth multiline rows={3} value={form.note} onChange={handleNoteChange} disabled={!isEditable}
//               placeholder="Papildoma informacija pirkėjui..." />
//           </Box>
//         </Collapse>

//         {/* ─── Siuntimo planas (tik periodinė) ─── */}
//         {isRecurring && (
//           <Box sx={{ ...secSx, backgroundColor: '#e8e5e5' }}>
//             <Typography sx={{ fontSize: 16, fontWeight: 700, mb: 2, color: P.primary }}>Siuntimo planas</Typography>
//             <Grid2 container spacing={2}>
//               <Grid2 size={{ xs: 12, sm: 6 }}>
//                 <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
//                   <Box>
//                     <Typography variant="caption" color="text.secondary">Pirmos periodinės sąskaitos išrašymo data</Typography>
//                     <Typography variant="body2" fontWeight={600}>
//                       {recurringForm.start_date
//                         ? new Date(recurringForm.start_date).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })
//                         : '—'}
//                     </Typography>
//                   </Box>
//                   <Box>
//                     <Typography variant="caption" color="text.secondary">Sekančios sąskaitos išrašymo data</Typography>
//                     <Typography variant="body2" fontWeight={600}>
//                       {(() => {
//                         if (!recurringForm.start_date) return '—';
//                         const start = new Date(recurringForm.start_date);
//                         let next = new Date(start);
//                         const interval = recurringForm.interval || 1;
//                         if (recurringForm.first_day_of_month) {
//                           next.setMonth(next.getMonth() + 1);
//                           next.setDate(1);
//                         } else if (recurringForm.last_day_of_month) {
//                           next.setMonth(next.getMonth() + 2, 0);
//                         } else if (recurringForm.period_type === 'daily') {
//                           next.setDate(next.getDate() + interval);
//                         } else if (recurringForm.period_type === 'weekly') {
//                           next.setDate(next.getDate() + interval * 7);
//                         } else {
//                           next.setMonth(next.getMonth() + interval);
//                         }
//                         return next.toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' });
//                       })()}
//                     </Typography>
//                   </Box>
//                 </Box>
//               </Grid2>
//               <Grid2 size={{ xs: 12, sm: 6 }}>
//                 <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
//                   <Box>
//                     <Typography variant="caption" color="text.secondary">Dažnumas</Typography>
//                     <Typography variant="body2" fontWeight={600}>
//                       {recurringForm.first_day_of_month
//                         ? 'Kas pirma mėnesio diena'
//                         : recurringForm.last_day_of_month
//                           ? 'Kas paskutinė mėnesio diena'
//                           : (FREQUENCY_OPTIONS[recurringForm.period_type] || []).find((o) => o.value === recurringForm.interval)?.label || '—'}
//                     </Typography>
//                   </Box>
//                   <Box>
//                     <Typography variant="caption" color="text.secondary">Iš viso bus išrašyta</Typography>
//                     <Typography variant="body2" fontWeight={600}>
//                       {recurringForm.end_type === 'count' && recurringForm.max_count
//                         ? `${recurringForm.max_count} sąsk.`
//                         : recurringForm.end_type === 'date' && recurringForm.end_date
//                           ? `Iki ${new Date(recurringForm.end_date).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })}`
//                           : 'Neterminuota'}
//                     </Typography>
//                   </Box>
//                 </Box>
//               </Grid2>
//             </Grid2>
//           </Box>
//         )}

//         {/* ─── Auto SF from išankstinė ─── */}
//         {form.invoice_type === 'isankstine' && isEditable && (
//           <Box sx={{ ...secSx, backgroundColor: '#e8f5e9', border: '1px solid #c8e6c9' }}>
//             <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
//               <FormControlLabel
//                 control={
//                   <Switch
//                     checked={form.auto_create_sf_on_paid}
//                     onChange={(e) => {
//                       u('auto_create_sf_on_paid', e.target.checked);
//                       if (!e.target.checked) {
//                         u('auto_sf_series', '');
//                         u('auto_sf_send', false);
//                       }
//                     }}
//                     size="small"
//                   />
//                 }
//                 label={
//                   <Typography variant="body2" fontWeight={600}>
//                     Automatiškai išrašyti {form.pvm_tipas === 'taikoma' ? 'PVM sąskaitą faktūrą' : 'sąskaitą faktūrą'}, kai ši išankstinė bus apmokėta
//                   </Typography>
//                 }
//               />
//               <Tooltip title="Kai išankstinė sąskaita bus pažymėta kaip apmokėta, sistema automatiškai išrašys PVM sąskaitą faktūrą / sąskaitą faktūrą ir, jei pasirinkta, išsiųs klientui el. paštu.">
//                 <IconButton size="small" sx={{ color: '#888', mt: 0.5 }}>
//                   <HelpIcon sx={{ fontSize: 18 }} />
//                 </IconButton>
//               </Tooltip>
//             </Box>

//             <Collapse in={form.auto_create_sf_on_paid}>
//               <Box sx={{ mt: 1.5, ml: 4 }}>
//                 <Grid2 container spacing={1.5} alignItems="center">
//                   <Grid2 size={{ xs: 12, sm: 5 }}>
//                     <TextField
//                       fullWidth select
//                       label="Priskirti seriją"
//                       value={form.auto_sf_series}
//                       onChange={(e) => {
//                         if (e.target.value === '__new_auto_sf__') {
//                           const targetType = form.pvm_tipas === 'taikoma' ? 'pvm_saskaita' : 'saskaita';
//                           setNewSeriesForm({
//                             invoice_type: targetType,
//                             prefix: '', next_number: 1, padding: 3, is_default: false,
//                             _autoSfMode: true,  // флаг чтобы знать откуда открыли
//                           });
//                           setNewSeriesNumberCheck({ checking: false, exists: false });
//                           setNewSeriesDialog(true);
//                           return;
//                         }
//                         u('auto_sf_series', e.target.value);
//                       }}
//                       SelectProps={{ MenuProps: menuProps }}
//                       size="small"
//                     >
//                       <MenuItem value="__new_auto_sf__" sx={{ borderBottom: '1px solid #eee', py: 1 }}>
//                         <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'primary.main' }}>
//                           <AddIcon sx={{ fontSize: 18 }} />
//                           <Typography variant="body2" sx={{ fontWeight: 400 }}>Sukurti naują seriją</Typography>
//                         </Box>
//                       </MenuItem>
//                       <MenuItem value="">
//                         <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>Numatytoji serija</Typography>
//                       </MenuItem>
//                       {availableSeries
//                         .filter((s) => s.invoice_type === (form.pvm_tipas === 'taikoma' ? 'pvm_saskaita' : 'saskaita'))
//                         .map((s) => (
//                           <MenuItem key={s.id || s.prefix} value={s.prefix}>
//                             <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
//                               <Typography variant="body2" fontWeight={600}>{s.prefix}</Typography>
//                               {s.name && <Typography variant="caption" color="text.secondary">{s.name}</Typography>}
//                             </Box>
//                           </MenuItem>
//                         ))
//                       }
//                     </TextField>
//                   </Grid2>
//                   <Grid2 size={{ xs: 12, sm: 5 }}>
//                     <FormControlLabel
//                       control={
//                         <Switch
//                           checked={form.auto_sf_send}
//                           onChange={(e) => u('auto_sf_send', e.target.checked)}
//                           size="small"
//                         />
//                       }
//                       label={<Typography variant="body2">Išsiųsti klientui el. paštu</Typography>}
//                     />
//                   </Grid2>
//                 </Grid2>
//               </Box>
//             </Collapse>
//           </Box>
//         )}

//         {/* ─── Payment reminders toggle ─── */}
//         {isEditable && (
//           <Box sx={{ mb: 2 }}>
//             <FormControlLabel
//               control={
//                 <Switch
//                   checked={form.send_payment_reminders}
//                   onChange={(e) => u('send_payment_reminders', e.target.checked)}
//                   size="small"
//                 />
//               }
//               label={
//                 <Typography variant="body2">
//                   Siųsti automatinius apmokėjimo priminimus
//                 </Typography>
//               }
//             />
//           </Box>
//         )}
//         {isEditable && !isRecurring && (
//           <Box sx={{ mb: 2 }}>
//             <PaymentLinkToggle value={paymentLink} onChange={setPaymentLink} />
//           </Box>
//         )}

//         {/* ─── 8. Buttons ─── */}
//         {isEditable && (isNew || form.status === 'draft') && (
//           <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 4, flexWrap: 'wrap' }}>
//             {isRecurring ? (
//               <>
//                 <Button variant="outlined" size="large" onClick={() => navigate('/israsymas')} disabled={saving}>
//                   Atšaukti
//                 </Button>
//                 <Button variant="contained" size="large"
//                   startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
//                   onClick={() => handleSave(null)} disabled={saving}>
//                   {recurringEditId ? 'Atnaujinti periodinę sąskaitą' : 'Sukurti periodinę sąskaitą'}
//                 </Button>
//               </>
//             ) : (
//               <>
//                 <Button variant="outlined" size="large"
//                   startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
//                   onClick={() => handleSave(null)} disabled={saving}>
//                   Išsaugoti juodraštį
//                 </Button>
//                 <Button variant="contained" size="large"
//                   onClick={() => {
//                     const email = (form.buyer_email || '').trim();
//                     const emailValid = email && email.includes('@') && email.includes('.');
//                     if (!emailValid) {
//                       setEmailWarning({ open: true, action: 'issue' });
//                     } else {
//                       handleSave('issue');
//                     }
//                   }}
//                   disabled={saving}>
//                   Sukurti sąskaitą
//                 </Button>
//                 <Button variant="contained" size="large" color="secondary" startIcon={<SendIcon />}
//                   onClick={() => {
//                     const email = (form.buyer_email || '').trim();
//                     const emailValid = email && email.includes('@') && email.includes('.');
//                     if (!emailValid) {
//                       setEmailWarning({ open: true, action: 'issue_send' });
//                     } else {
//                       handleSave('issue_send');
//                     }
//                   }}
//                   disabled={saving}>
//                   Sukurti ir išsiųsti
//                 </Button>
//               </>
//             )}
//           </Box>
//         )}
//         {isEditable && !isNew && form.status !== 'draft' && (
//           <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 4 }}>
//             <Button variant="contained" size="large"
//               startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
//               onClick={() => handleSave(null)} disabled={saving}>
//               Išsaugoti pakeitimus
//             </Button>
//           </Box>
//         )}
//       </Paper>

//       <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog((d) => ({ ...d, open: false }))} disableScrollLock>
//         <DialogTitle>{confirmDialog.title}</DialogTitle>
//         {confirmDialog.text && <DialogContent><DialogContentText>{confirmDialog.text}</DialogContentText></DialogContent>}
//         <DialogActions>
//           <Button onClick={() => setConfirmDialog((d) => ({ ...d, open: false }))}>Atšaukti</Button>
//           <Button variant="contained" onClick={() => { confirmDialog.action?.(); setConfirmDialog((d) => ({ ...d, open: false })); }}>Patvirtinti</Button>
//         </DialogActions>
//       </Dialog>
//       {/* Email warning dialog */}
//       <Dialog open={emailWarning.open}
//         onClose={() => setEmailWarning({ open: false, action: null })}
//         disableScrollLock maxWidth="xs" fullWidth>
//         <DialogTitle sx={{ pb: 1 }}>
//           {emailWarning.action === 'issue_send'
//             ? 'Negalima išsiųsti sąskaitos'
//             : 'Pirkėjo el. paštas nenurodytas'}
//         </DialogTitle>
//         <DialogContent>
//           <DialogContentText>
//             {emailWarning.action === 'issue_send'
//               ? 'Norint išsiųsti sąskaitą, būtina nurodyti teisingą pirkėjo el. pašto adresą.'
//               : 'Pirkėjo el. paštas nenurodytas arba neteisingas. Sąskaitą bus galima išrašyti, bet nebus galima išsiųsti el. paštu.'}
//           </DialogContentText>
//         </DialogContent>
//         <DialogActions>
//           <Button onClick={() => setEmailWarning({ open: false, action: null })}>
//             Grįžti ir pataisyti
//           </Button>
//           {emailWarning.action === 'issue' && (
//             <Button variant="contained"
//               onClick={() => {
//                 setEmailWarning({ open: false, action: null });
//                 handleSave('issue');
//               }}>
//               Išrašyti be el. pašto
//             </Button>
//           )}
//         </DialogActions>
//       </Dialog>

//       {/* ── New Series Dialog ── */}
//         <Dialog open={newSeriesDialog} onClose={() => setNewSeriesDialog(false)} disableScrollLock maxWidth="sm" fullWidth>
//           <DialogTitle>Nauja serija</DialogTitle>
//           <DialogContent>
//             <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
//               <TextField fullWidth select label="Dokumento tipas" value={newSeriesForm.invoice_type}
//                 onChange={(e) => setNewSeriesForm((p) => ({ ...p, invoice_type: e.target.value }))}
//                 disabled={!!newSeriesForm._autoSfMode}
//                 SelectProps={{ MenuProps: menuProps }}>
//                 {Object.entries(TYPE_LABELS).map(([k, v]) => (
//                   <MenuItem key={k} value={k} disabled={k === 'kreditine'}>{v}</MenuItem>
//                 ))}
//               </TextField>

//               <TextField fullWidth label="Serijos prefiksas" value={newSeriesForm.prefix}
//                 onChange={(e) => setNewSeriesForm((p) => ({ ...p, prefix: e.target.value.toUpperCase() }))}
//                 placeholder="Pvz. AA, BB, ISF"
//                 helperText="Unikalus prefiksas. Bus rodomas prieš numerį."
//                 inputProps={{ style: { fontWeight: 700, letterSpacing: 1, fontFamily: 'monospace' } }}
//                 autoFocus />

//               <Grid2 container spacing={2}>
//                 <Grid2 size={{ xs: 6 }}>
//                   <TextField fullWidth label="Sekantis numeris" type="number"
//                     value={newSeriesForm.next_number}
//                     onChange={(e) => setNewSeriesForm((p) => ({ ...p, next_number: Math.max(1, parseInt(e.target.value) || 1) }))}
//                     inputProps={{ min: 1 }}
//                     InputProps={{
//                       endAdornment: newSeriesNumberCheck.checking ? (
//                         <InputAdornment position="end"><CircularProgress size={16} /></InputAdornment>
//                       ) : newSeriesNumberCheck.exists ? (
//                         <InputAdornment position="end">
//                           <Tooltip title="Numeris jau naudojamas"><WarningIcon color="error" fontSize="small" /></Tooltip>
//                         </InputAdornment>
//                       ) : newSeriesForm.prefix && newSeriesForm.next_number ? (
//                         <InputAdornment position="end"><CheckIcon sx={{ color: 'success.main', fontSize: 20 }} /></InputAdornment>
//                       ) : null,
//                     }}
//                     error={newSeriesNumberCheck.exists}
//                     helperText={newSeriesNumberCheck.exists ? 'Šis numeris jau užimtas!' : 'Sekantis naudojamas numeris'} />
//                 </Grid2>
//                 <Grid2 size={{ xs: 6 }}>
//                   <TextField fullWidth select label="Skaitmenų skaičius" value={newSeriesForm.padding}
//                     onChange={(e) => setNewSeriesForm((p) => ({ ...p, padding: parseInt(e.target.value) }))}
//                     SelectProps={{ MenuProps: menuProps }}>
//                     {[1, 2, 3, 4, 5, 6].map((n) => (
//                       <MenuItem key={n} value={n}>{n} → {'1'.padStart(n, '0')}</MenuItem>
//                     ))}
//                   </TextField>
//                 </Grid2>
//               </Grid2>

//               <Box sx={{
//                 p: 2, borderRadius: 2, textAlign: 'center',
//                 background: 'linear-gradient(135deg, #e3f2fd, #f3e5f5)',
//                 border: `1px solid ${P.border}`,
//               }}>
//                 <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
//                   Kito dokumento numeris:
//                 </Typography>
//                 <Typography sx={{ fontWeight: 800, fontSize: 28, fontFamily: 'monospace', letterSpacing: 2, color: P.primary }}>
//                   {getSeriesPreview()}
//                 </Typography>
//               </Box>

//               <FormControlLabel
//                 control={<Switch checked={newSeriesForm.is_default}
//                   onChange={(e) => setNewSeriesForm((p) => ({ ...p, is_default: e.target.checked }))} size="small" />}
//                 label={<Typography variant="body2">Numatytoji serija šiam dokumento tipui</Typography>} />
//             </Box>
//           </DialogContent>
//           <DialogActions sx={{ px: 3, pb: 2 }}>
//             <Button onClick={() => setNewSeriesDialog(false)}>Atšaukti</Button>
//             <Button variant="contained" onClick={handleCreateSeries}
//               disabled={newSeriesSaving || newSeriesNumberCheck.exists || !newSeriesForm.prefix.trim()}>
//               {newSeriesSaving ? <CircularProgress size={20} /> : 'Sukurti'}
//             </Button>
//           </DialogActions>
//         </Dialog>

//         {/* ── New Unit Dialog ── */}
//         <Dialog open={newUnitDialog} onClose={() => setNewUnitDialog(false)} disableScrollLock maxWidth="xs" fullWidth>
//           <DialogTitle>Naujas mato vienetas</DialogTitle>
//           <DialogContent>
//             <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
//               <TextField fullWidth label="Kodas (trumpinys)" value={newUnitForm.code}
//                 onChange={(e) => setNewUnitForm((p) => ({ ...p, code: e.target.value }))}
//                 placeholder="Pvz. vnt, kg, val" helperText="Trumpas kodas sąskaitoje"
//                 inputProps={{ style: { fontWeight: 700, fontFamily: 'monospace' } }} autoFocus />
//               <TextField fullWidth label="Pilnas pavadinimas" value={newUnitForm.name}
//                 onChange={(e) => setNewUnitForm((p) => ({ ...p, name: e.target.value }))}
//                 placeholder="Pvz. Vienetas, Kilogramas" helperText="Neprivalomas aprašymas" />
//               {newUnitForm.code && (
//                 <Box sx={{ p: 2, borderRadius: 2, textAlign: 'center', backgroundColor: P.bg, border: `1px solid ${P.border}` }}>
//                   <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
//                     Sąskaitoje atrodys taip:
//                   </Typography>
//                   <Typography sx={{ fontSize: 16 }}>
//                     <span style={{ color: '#888' }}>2 </span>
//                     <strong style={{ fontFamily: 'monospace', color: P.primary }}>{newUnitForm.code}</strong>
//                     <span style={{ color: '#888' }}> × 100,00 € = 200,00 €</span>
//                   </Typography>
//                 </Box>
//               )}
//             </Box>
//           </DialogContent>
//           <DialogActions sx={{ px: 3, pb: 2 }}>
//             <Button onClick={() => setNewUnitDialog(false)}>Atšaukti</Button>
//             <Button variant="contained" onClick={handleCreateUnit} disabled={newUnitSaving || !newUnitForm.code.trim()}>
//               {newUnitSaving ? <CircularProgress size={20} /> : 'Sukurti'}
//             </Button>
//           </DialogActions>
//         </Dialog>

//       <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
//         <Alert severity={snack.severity} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
//       </Snackbar>
//     </Box>
//   );
// };

// const SumRow = ({ label, value, bold, primary, indent }) => (
//   <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5, ...(indent ? { pl: 3 } : {}), ...(bold ? { mt: 1, pt: 1, borderTop: '2px solid #333' } : {}) }}>
//     <Typography sx={{ fontWeight: bold ? 800 : 400, fontSize: indent ? 13 : 14 }}>{label}</Typography>
//     <Typography sx={{ fontWeight: bold ? 800 : 700, fontSize: indent ? 13 : 14, ...(primary ? { color: '#1976d2' } : {}) }}>{value}</Typography>
//   </Box>
// );

// export default InvoiceEditorPage;

