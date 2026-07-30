import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import {
  Box,
  Typography,
  TextField,
  FormControlLabel,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  CircularProgress,
  Alert,
  useTheme,
  useMediaQuery,
  InputAdornment,
  IconButton,
  Collapse,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  Button,
  Divider,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Popover,
  Tooltip,
  Autocomplete,
} from "@mui/material";

import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import PaymentsIcon from "@mui/icons-material/Payments";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import PersonIcon from "@mui/icons-material/Person";
import BusinessIcon from "@mui/icons-material/Business";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import SellIcon from "@mui/icons-material/Sell";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import BackHandIcon from "@mui/icons-material/BackHand";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";
import DashboardIcon from "@mui/icons-material/Dashboard";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import AddIcon from "@mui/icons-material/Add";
import LockIcon from "@mui/icons-material/Lock";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

import { api } from "../api/endpoints";
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import 'dayjs/locale/lt';

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

const VIEW = {
  OVERVIEW: "overview",
  DEBTS: "debts",
  BALANCES: "balances",
  ENTRIES: "entries",
};

const PAYMENT_STATUS_MAP = {
  unpaid: { label: "Neapmokėta", color: "error" },
  partially_paid: { label: "Dalinai", color: "warning" },
  paid: { label: "Apmokėta", color: "success" },
};

const SOURCE_MAP = {
  purchase: {
    label: "Pirkimas",
    color: "#2563EB",
    bg: "#EFF6FF",
    icon: <ShoppingCartIcon sx={{ fontSize: 14 }} />,
  },
  sale: {
    label: "Pardavimas",
    color: "#16A34A",
    bg: "#F0FDF4",
    icon: <SellIcon sx={{ fontSize: 14 }} />,
  },
  bank: {
    label: "Bankas",
    color: "#7C3AED",
    bg: "#F5F3FF",
    icon: <AccountBalanceIcon sx={{ fontSize: 14 }} />,
  },
  manual: {
    label: "Rankinis",
    color: "#92400E",
    bg: "#FEF3C7",
    icon: <BackHandIcon sx={{ fontSize: 14 }} />,
  },
  opening: {
    label: "Pradiniai",
    color: "#D97706",
    bg: "#FFFBEB",
    icon: <LockIcon sx={{ fontSize: 14 }} />,
  },
};

const STATUS_MAP = {
  draft: { label: "Juodraštis", color: "default" },
  posted: { label: "Užregistruotas", color: "success" },
  needs_review: { label: "Reikia peržiūros", color: "warning" },
  unbalanced: { label: "Nesubalansuotas", color: "error" },
  void: { label: "Anuliuotas", color: "default" },
};

const currentPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const getPeriodEndDate = (period) => {
  if (!period) return null;
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return null;

  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("lt-LT", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const fmtAmount = (val, currency = "EUR") => {
  if (val == null) return "—";
  const num = Number(val);
  if (Number.isNaN(num)) return "—";
  return `${num.toFixed(2)} ${currency}`;
};

const fmtAbsAmount = (val, currency = "EUR") => {
  if (val == null) return "—";
  const num = Math.abs(Number(val));
  if (Number.isNaN(num)) return "—";
  return `${num.toFixed(2)} ${currency}`;
};

const fmtAmountPlain = (val) => {
  if (val == null || val === "0" || val === "0.0000") return "—";
  const num = Number(val);
  if (Number.isNaN(num) || num === 0) return "—";
  return num.toFixed(2);
};

const fmtMoney = (val) => {
  if (val == null) return "—";

  const num = Number(val);
  if (Number.isNaN(num)) return "—";

  return new Intl.NumberFormat("lt-LT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const LT_MONTHS = [
  'sausis', 'vasaris', 'kovas', 'balandis', 'gegužė', 'birželis',
  'liepa', 'rugpjūtis', 'rugsėjis', 'spalis', 'lapkritis', 'gruodis',
];

const buildPeriodOptions = () => {
  const now = new Date();
  const opts = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    opts.push({
      value: `${y}-${String(m + 1).padStart(2, '0')}`,
      label: `${y} m. ${LT_MONTHS[m]}`,
    });
  }
  opts.push({ value: 'custom', label: 'Pagal datas' });
  return opts;
};

const PERIOD_OPTIONS = buildPeriodOptions();

const buildKorSummary = (lines) => {
  if (!lines?.length) return "—";
  const debits = [...new Set(lines.filter((l) => l.side === "D").map((l) => l.account_code).filter(Boolean))];
  const credits = [...new Set(lines.filter((l) => l.side === "K").map((l) => l.account_code).filter(Boolean))];
  if (!debits.length && !credits.length) return "—";
  return `D ${debits.join(", ")} → K ${credits.join(", ")}`;
};

const DK_ACCOUNT_OPTIONS = [
  { group: "Turtas", accounts: [
    { code: "1130", name: "Programinės įrangos įsigijimo savikaina" },
    { code: "1220", name: "Mašinų ir įrangos įsigijimo savikaina" },
    { code: "1230", name: "Transporto priemonių įsigijimo savikaina" },
    { code: "1240", name: "Kitų įrenginių, prietaisų įsigijimo savikaina" },
    { code: "2010", name: "Žaliavos, medžiagos" },
    { code: "2040", name: "Prekės perpardavimui" },
    { code: "2080", name: "Avansai tiekėjams" },
    { code: "291", name: "Ateinančių laikotarpių sąnaudos" },
  ]},
  { group: "Pajamos", accounts: [
    { code: "5000", name: "Parduotų prekių pajamos" },
    { code: "5001", name: "Suteiktų paslaugų pajamos" },
    { code: "509", name: "Nuolaidos, grąžinimas" },
    { code: "5009", name: "Apvalinimas" },
    { code: "5400", name: "Ilgalaikio turto perleidimo pelnas" },
    { code: "5401", name: "Kitos veiklos pajamos" },
  ]},
  { group: "Sąnaudos", accounts: [
    { code: "6000", name: "Parduotų prekių savikaina" },
    { code: "6001", name: "Suteiktų paslaugų savikaina" },
    { code: "6002", name: "Įsigytų prekių ir paslaugų savikaina" },
    { code: "6003", name: "Tiesioginės gamybos išlaidos" },
    { code: "6004", name: "Netiesioginės gamybos išlaidos" },
    { code: "6200", name: "Komisiniai mokesčiai" },
    { code: "6202", name: "Reklamos sąnaudos" },
    { code: "6208", name: "Kitos pardavimo sąnaudos" },
    { code: "6300", name: "Nuomos sąnaudos" },
    { code: "6301", name: "Remonto ir eksploatacijos sąnaudos" },
    { code: "6302", name: "Išmokos tretiesiems asmenims" },
    { code: "6303", name: "Draudimo sąnaudos" },
    { code: "6304", name: "Darbuotojų darbo užmokestis" },
    { code: "6308", name: "Veiklos mokesčių sąnaudos" },
    { code: "6311", name: "Baudos ir delspinigiai" },
    { code: "6312", name: "Kitos bendrosios sąnaudos" },
    { code: "6401", name: "Kitos sąnaudos" },
    { code: "6802", name: "Palūkanų sąnaudos" },
    { code: "6803", name: "Valiutų kursų nuostoliai" },
    { code: "6810", name: "Kitos finansinės sąnaudos" },
  ]},
];

const MANUAL_DK_ACCOUNT_OPTIONS = [
  {
    group: "Turtas",
    accounts: [
      ...(
        DK_ACCOUNT_OPTIONS.find(
          (group) => group.group === "Turtas"
        )?.accounts || []
      ),
      {
        code: "2410",
        name: "Pirkėjų skolos",
      },
      {
        code: "2441",
        name: "Gautinas PVM",
      },
      {
        code: "271",
        name: "Sąskaitos bankuose",
      },
      {
        code: "272",
        name: "Kasa",
      },
    ],
  },
  {
    group: "Nuosavas kapitalas",
    accounts: [
      {
        code: "3010",
        name: "Įstatinis kapitalas",
      },
    ],
  },
  {
    group: "Įsipareigojimai",
    accounts: [
      {
        code: "4430",
        name: "Skolos tiekėjams",
      },
      {
        code: "4480",
        name: "Kitos mokėtinos sumos",
      },
      {
        code: "4481",
        name: "Mokėtini mokesčiai",
      },
      {
        code: "4492",
        name: "Mokėtinas PVM",
      },
    ],
  },
  {
    group: "Pajamos",
    accounts:
      DK_ACCOUNT_OPTIONS.find(
        (group) => group.group === "Pajamos"
      )?.accounts || [],
  },
  {
    group: "Sąnaudos",
    accounts:
      DK_ACCOUNT_OPTIONS.find(
        (group) => group.group === "Sąnaudos"
      )?.accounts || [],
  },
];

function getEditableAccountOptions(line) {
  const sourceType =
    line?.entry?.source_type;

  if (sourceType === "purchase") {
    return DK_ACCOUNT_OPTIONS.filter(
      (group) =>
        group.group === "Turtas" ||
        group.group === "Sąnaudos"
    );
  }

  if (sourceType === "sale") {
    return DK_ACCOUNT_OPTIONS
      .filter(
        (group) =>
          group.group === "Pajamos"
      )
      .map((group) => ({
        ...group,
        accounts: group.accounts.filter(
          (account) =>
            account.code !== "509"
        ),
      }));
  }

  if (sourceType === "bank") {
    /*
     * Banko sąskaita 271x jau yra užrakinta.
     * Leidžiama redaguoti tik kitą korespondencijos pusę.
     */
    if (line?.side === "D") {
      return DK_ACCOUNT_OPTIONS.filter(
        (group) =>
          group.group === "Turtas" ||
          group.group === "Sąnaudos"
      );
    }

    if (line?.side === "K") {
      return DK_ACCOUNT_OPTIONS.filter(
        (group) =>
          group.group === "Pajamos"
      );
    }
  }

  return DK_ACCOUNT_OPTIONS;
}

function SideChip({ side }) {
  return (
    <Box
      component="span"
      sx={{
        fontSize: 10,
        fontWeight: 800,
        px: 0.7,
        py: 0.15,
        borderRadius: "5px",
        bgcolor: side === "D" ? "#EFF6FF" : "#FEF2F2",
        color: side === "D" ? "#2563EB" : "#DC2626",
        lineHeight: 1.4,
      }}
    >
      {side}
    </Box>
  );
}

function SmallValueRow({ label, value, bold = false, color }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{label}</Typography>
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: bold ? 800 : 600,
          color: color || "text.primary",
          textAlign: "right",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════
// Visual navigation tabs
// ═══════════════════════════════════════════════════════════

function VisualTabs({ value, onChange }) {
  const tabs = [
    {
      value: VIEW.OVERVIEW,
      label: "Apžvalga",
      description: "Svarbiausi skaičiai ir ką reikia sutvarkyti",
      icon: <DashboardIcon />,
      color: "#2563EB",
      bg: "#EFF6FF",
    },
    {
      value: VIEW.DEBTS,
      label: "Skolos",
      description: "Pirkėjų ir tiekėjų neapmokėtos sąskaitos",
      icon: <PaymentsIcon />,
      color: "#DC2626",
      bg: "#FEF2F2",
    },
    {
      value: VIEW.BALANCES,
      label: "Sąskaitų likučiai",
      description: "Pradinis, debetas, kreditas ir galutinis likutis",
      icon: <AccountBalanceWalletIcon />,
      color: "#16A34A",
      bg: "#F0FDF4",
    },
    {
      value: VIEW.ENTRIES,
      label: "DK įrašai",
      description: "Visos korespondencijos pagal dokumentus",
      icon: <FormatListBulletedIcon />,
      color: "#7C3AED",
      bg: "#F5F3FF",
    },
  ];

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          sm: "1fr 1fr",
          lg: "repeat(4, 1fr)",
        },
        gap: 1.5,
        mb: 3,
      }}
    >
      {tabs.map((tab) => {
        const active = value === tab.value;

        return (
          <Paper
            key={tab.value}
            onClick={() => onChange(tab.value)}
            sx={{
              p: 1.75,
              borderRadius: 2,
              cursor: "pointer",
              boxShadow: active ? "0 8px 24px rgba(15, 23, 42, 0.08)" : "none",
              border: "1px solid",
              borderColor: active ? tab.color : "divider",
              bgcolor: active ? tab.bg : "background.paper",
              transition: "all 0.15s ease",
              "&:hover": {
                borderColor: tab.color,
                boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
              },
            }}
          >
            <Box sx={{ display: "flex", gap: 1.25, alignItems: "flex-start" }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: "10px",
                  bgcolor: active ? "background.paper" : tab.bg,
                  color: tab.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {tab.icon}
              </Box>

              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 800, lineHeight: 1.2 }}>
                  {tab.label}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 12,
                    color: "text.secondary",
                    mt: 0.35,
                    lineHeight: 1.35,
                  }}
                >
                  {tab.description}
                </Typography>
              </Box>
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════
// Apžvalga
// ═══════════════════════════════════════════════════════════

function OverviewMetricCard({ label, value, subtitle, icon, color, bg, onClick }) {
  return (
    <Paper
      onClick={onClick}
      sx={{
        p: 2,
        borderRadius: 2,
        border: "0.5px solid",
        borderColor: "divider",
        boxShadow: "none",
        cursor: onClick ? "pointer" : "default",
        "&:hover": onClick
          ? {
              borderColor: color,
              boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
            }
          : undefined,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1 }}>
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            bgcolor: bg,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </Box>
        <Typography sx={{ fontSize: 12, color: "text.secondary", fontWeight: 600 }}>
          {label}
        </Typography>
      </Box>

      <Typography sx={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>
        {value}
      </Typography>

      {subtitle && (
        <Typography sx={{ fontSize: 11.5, color: "text.secondary", mt: 0.5 }}>
          {subtitle}
        </Typography>
      )}
    </Paper>
  );
}

function ApzvalgaTab({ summary, loading, setView }) {
  const vatNet = Number(summary?.vat_net || 0);
  const vatDirection = vatNet >= 0 ? "Mokėtinas" : "Gautinas";
  const reviewCount = summary?.review_count ?? summary?.unbalanced_entries ?? 0;

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(4, 1fr)" },
          gap: 1.5,
          mb: 2,
        }}
      >
        <OverviewMetricCard
          label="Pirkėjų skolos"
          value={fmtAmount(summary?.customer_debt)}
          subtitle="Kiek pirkėjai dar skolingi įmonei"
          icon={<PaymentsIcon />}
          color="#2563EB"
          bg="#EFF6FF"
          onClick={() => setView(VIEW.DEBTS)}
        />

        <OverviewMetricCard
          label="Skolos tiekėjams"
          value={fmtAmount(summary?.supplier_debt)}
          subtitle="Kiek įmonė dar skolinga tiekėjams"
          icon={<ReceiptLongIcon />}
          color="#DC2626"
          bg="#FEF2F2"
          onClick={() => setView(VIEW.DEBTS)}
        />

        <OverviewMetricCard
          label="PVM grynasis"
          value={fmtAbsAmount(summary?.vat_net)}
          subtitle={vatDirection}
          icon={<AccountBalanceWalletIcon />}
          color={vatNet >= 0 ? "#D97706" : "#16A34A"}
          bg={vatNet >= 0 ? "#FFFBEB" : "#F0FDF4"}
        />

        <OverviewMetricCard
          label="Reikia peržiūros"
          value={reviewCount}
          subtitle="DK įrašai arba dokumentai su problemomis"
          icon={<WarningAmberIcon />}
          color={reviewCount > 0 ? "#DC2626" : "#16A34A"}
          bg={reviewCount > 0 ? "#FEF2F2" : "#F0FDF4"}
          onClick={() => setView(VIEW.ENTRIES)}
        />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1.5fr 1fr" },
          gap: 2,
          mt: 2,
        }}
      >
        <Paper
          sx={{
            p: 2,
            borderRadius: 2,
            border: "0.5px solid",
            borderColor: "divider",
            boxShadow: "none",
          }}
        >
          <Typography sx={{ fontSize: 15, fontWeight: 800, mb: 1 }}>
            Ką reikia sutvarkyti
          </Typography>

          {reviewCount > 0 ? (
            <Alert
              severity="warning"
              sx={{
                borderRadius: 2,
                "& .MuiAlert-message": { fontSize: 13 },
              }}
            >
              Yra {reviewCount} DK įrašai, kuriuos reikia peržiūrėti.
            </Alert>
          ) : (
            <Alert
              severity="success"
              sx={{
                borderRadius: 2,
                "& .MuiAlert-message": { fontSize: 13 },
              }}
            >
              Šiame periode DK problemų nerasta.
            </Alert>
          )}

          <Box sx={{ mt: 2, display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setView(VIEW.ENTRIES)}
              sx={{ textTransform: "none" }}
            >
              Atidaryti DK įrašus
            </Button>

            <Button
              size="small"
              variant="outlined"
              onClick={() => setView(VIEW.DEBTS)}
              sx={{ textTransform: "none" }}
            >
              Peržiūrėti skolas
            </Button>

            <Button
              size="small"
              variant="outlined"
              onClick={() => setView(VIEW.BALANCES)}
              sx={{ textTransform: "none" }}
            >
              Sąskaitų likučiai
            </Button>
          </Box>
        </Paper>

        <Paper
          sx={{
            p: 2,
            borderRadius: 2,
            border: "0.5px solid",
            borderColor: "divider",
            boxShadow: "none",
          }}
        >
          <Typography sx={{ fontSize: 15, fontWeight: 800, mb: 1.5 }}>
            PVM šį periodą
          </Typography>

          <Box sx={{ display: "grid", gap: 1 }}>
            <SmallValueRow label="Gautinas PVM" value={fmtAmount(summary?.vat_receivable)} />
            <SmallValueRow label="Mokėtinas PVM" value={fmtAmount(summary?.vat_payable)} />

            <Divider sx={{ my: 0.5 }} />

            <SmallValueRow
              label="Grynasis PVM"
              value={`${fmtAbsAmount(summary?.vat_net)} ${vatDirection}`}
              bold
              color={vatNet >= 0 ? "#D97706" : "#16A34A"}
            />
          </Box>
        </Paper>
      </Box>

      <Paper
        sx={{
          mt: 2,
          p: 2,
          borderRadius: 2,
          border: "0.5px solid",
          borderColor: "divider",
          boxShadow: "none",
        }}
      >
        <Typography sx={{ fontSize: 15, fontWeight: 800, mb: 1 }}>
          Greiti veiksmai
        </Typography>

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            size="small"
            variant="contained"
            startIcon={<AddIcon />}
            disabled
            sx={{ textTransform: "none" }}
          >
            Rankinė DK operacija
          </Button>

          <Button
            size="small"
            variant="outlined"
            disabled
            sx={{ textTransform: "none" }}
          >
            Pradiniai likučiai
          </Button>

          <Button
            size="small"
            variant="outlined"
            disabled
            sx={{ textTransform: "none" }}
          >
            Užrakinti periodą
          </Button>
        </Box>

        <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1.25 }}>
          Šie veiksmai gali būti prijungti vėliau, kai bus rankinių DK įrašų ir pradinių likučių API.
        </Typography>
      </Paper>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════
// Skolos tab
// ═══════════════════════════════════════════════════════════

function SkolosTab({ activeProfileId, period, dateFrom, dateTo }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const LIMIT = 25;

  const [activeType, setActiveType] = useState("customer");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ total_balance: "0" });
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);

  const [expandedKey, setExpandedKey] = useState(null);
  const [invoicesByKey, setInvoicesByKey] = useState({});
  const [loadingInvoicesKey, setLoadingInvoicesKey] = useState(null);

  const loadMoreRef = useRef(null);

  const typeConfig = {
    customer: {
      label: "Pirkėjų skolos",
      description: "Kas dar skolingas įmonei pagal pardavimo sąskaitas.",
      searchPlaceholder: "Ieškoti pirkėjo...",
      empty: "Pirkėjų skolų nėra",
      counterpartyLabel: "Pirkėjas",
      color: "#2563EB",
      icon: <PersonIcon sx={{ fontSize: 20 }} />,
    },
    supplier: {
      label: "Skolos tiekėjams",
      description: "Kam įmonė dar skolinga pagal pirkimo sąskaitas.",
      searchPlaceholder: "Ieškoti tiekėjo...",
      empty: "Skolų tiekėjams nėra",
      counterpartyLabel: "Tiekėjas",
      color: "#DC2626",
      icon: <BusinessIcon sx={{ fontSize: 20 }} />,
    },
  };

  const currentCfg = typeConfig[activeType];

  const getRowKey = (row) => {
    return `${row.counterparty_code || ""}__${row.counterparty_name || ""}`;
  };

  const fetchDebts = useCallback(
    async ({ offset = 0, append = false } = {}) => {
      if (!activeProfileId) return;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const params = {
        type: activeType,
        limit: LIMIT,
        offset,
      };

      if (period !== "custom") {
        const asOf = getPeriodEndDate(period);
        if (asOf) params.as_of = asOf;
      } else {
        if (dateFrom) params.date_from = dateFrom;
        if (dateTo) params.as_of = dateTo;
      }

      if (search.trim()) {
        params.search = search.trim();
      }

      try {
        const { data } = await api.get("/apskaita/skolos/", {
          params,
          withCredentials: true,
        });

        const newRows = data.results || [];

        setRows((prev) => (append ? [...prev, ...newRows] : newRows));
        setSummary(data.summary || { total_balance: "0" });
        setHasMore(Boolean(data.has_more));
        setNextOffset(data.next_offset ?? null);
      } catch (e) {
        console.error(e);

        if (!append) {
          setRows([]);
          setSummary({ total_balance: "0" });
          setHasMore(false);
          setNextOffset(null);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [activeProfileId, activeType, period, search, dateFrom, dateTo]
  );

  useEffect(() => {
    setExpandedKey(null);
    setInvoicesByKey({});
    fetchDebts({ offset: 0, append: false });
  }, [fetchDebts]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    if (!hasMore || loading || loadingMore || nextOffset == null) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];

        if (first.isIntersecting && hasMore && !loading && !loadingMore) {
          fetchDebts({ offset: nextOffset, append: true });
        }
      },
      { threshold: 0.4 }
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, [fetchDebts, hasMore, loading, loadingMore, nextOffset]);

  const fetchInvoices = async (row) => {
    const key = getRowKey(row);

    if (invoicesByKey[key]) return;

    setLoadingInvoicesKey(key);

    const params = {
      type: activeType,
      counterparty_name: row.counterparty_name || "",
    };

    if (row.counterparty_code) {
      params.counterparty_code = row.counterparty_code;
    }

    if (period !== "custom") {
      const asOf = getPeriodEndDate(period);
      if (asOf) params.as_of = asOf;
    } else {
      if (dateTo) params.as_of = dateTo;
    }

    try {
      const { data } = await api.get("/apskaita/skolos/invoices/", {
        params,
        withCredentials: true,
      });

      setInvoicesByKey((prev) => ({
        ...prev,
        [key]: data.results || [],
      }));
    } catch (e) {
      console.error(e);
      setInvoicesByKey((prev) => ({
        ...prev,
        [key]: [],
      }));
    } finally {
      setLoadingInvoicesKey(null);
    }
  };

  const handleToggleRow = async (row) => {
    const key = getRowKey(row);

    if (expandedKey === key) {
      setExpandedKey(null);
      return;
    }

    setExpandedKey(key);
    await fetchInvoices(row);
  };

  const handleTypeChange = (_, value) => {
    setActiveType(value);
    setSearch("");
  };

  const renderInvoiceRows = (row) => {
    const key = getRowKey(row);
    const invoices = invoicesByKey[key] || [];
    const loadingInvoices = loadingInvoicesKey === key;

    return (
      <TableRow>
        <TableCell
          colSpan={isMobile ? 4 : 6}
          sx={{
            p: 0,
            borderBottom: expandedKey === key ? undefined : "none",
          }}
        >
          <Collapse in={expandedKey === key} timeout="auto" unmountOnExit>
            <Box
              sx={{
                p: 2,
                bgcolor: "action.hover",
                borderTop: "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: "text.secondary",
                  mb: 1,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                Neapmokėtos sąskaitos
              </Typography>

              {loadingInvoices ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}>
                  <CircularProgress size={18} />
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                    Kraunama...
                  </Typography>
                </Box>
              ) : invoices.length === 0 ? (
                <Typography sx={{ fontSize: 13, color: "text.disabled", py: 1 }}>
                  Neapmokėtų sąskaitų nerasta
                </Typography>
              ) : (
                <TableContainer
                  component={Paper}
                  sx={{
                    borderRadius: 2,
                    boxShadow: "none",
                    border: "0.5px solid",
                    borderColor: "divider",
                  }}
                >
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontSize: 11, fontWeight: 800 }}>Dokumentas</TableCell>
                        <TableCell sx={{ fontSize: 11, fontWeight: 800 }}>Data</TableCell>
                        {!isMobile && <TableCell sx={{ fontSize: 11, fontWeight: 800 }} align="right">Suma</TableCell>}
                        {!isMobile && <TableCell sx={{ fontSize: 11, fontWeight: 800 }} align="right">Apmokėta</TableCell>}
                        <TableCell sx={{ fontSize: 11, fontWeight: 800 }} align="right">Likutis</TableCell>
                        <TableCell sx={{ fontSize: 11, fontWeight: 800 }}>Statusas</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {invoices.map((invoice) => {
                        const cfg = PAYMENT_STATUS_MAP[invoice.payment_status] || { label: "?", color: "default" };
                        return (
                          <TableRow key={`${invoice.source_type}-${invoice.id}`} hover>
                            <TableCell>
                              <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{invoice.document_number || "—"}</Typography>
                            </TableCell>
                            <TableCell sx={{ fontSize: 13 }}>{fmtDate(invoice.invoice_date)}</TableCell>
                            {!isMobile && <TableCell align="right" sx={{ fontSize: 13 }}>{fmtMoney(invoice.amount_with_vat)}</TableCell>}
                            {!isMobile && <TableCell align="right" sx={{ fontSize: 13 }}>{fmtMoney(invoice.paid_amount)}</TableCell>}
                            <TableCell align="right" sx={{ fontSize: 13, fontWeight: 800 }}>{fmtMoney(invoice.balance)}</TableCell>
                            <TableCell>
                              <Chip label={cfg.label} color={cfg.color} size="small" variant="outlined" />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography sx={{ fontSize: 18, fontWeight: 800 }}>Skolos</Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.25 }}>
          Atviros pirkėjų ir tiekėjų sąskaitos periodo pabaigai.
        </Typography>
      </Box>

      <Paper sx={{ p: 1, mb: 2, borderRadius: 2, border: "0.5px solid", borderColor: "divider", boxShadow: "none" }}>
        <Tabs
          value={activeType}
          onChange={handleTypeChange}
          variant={isMobile ? "fullWidth" : "standard"}
          sx={{
            minHeight: 40,
            "& .MuiTabs-indicator": { display: "none" },
            "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 800, fontSize: 13, borderRadius: 1.5, px: 2, mr: isMobile ? 0 : 1 },
            "& .Mui-selected": { bgcolor: "action.selected" },
          }}
        >
          <Tab value="customer" label="Pirkėjų skolos" />
          <Tab value="supplier" label="Skolos tiekėjams" />
        </Tabs>
      </Paper>

      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box sx={{ color: currentCfg.color, display: "flex" }}>{currentCfg.icon}</Box>
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 800 }}>{currentCfg.label}</Typography>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{currentCfg.description}</Typography>
          </Box>
        </Box>
        <Chip size="small" variant="outlined" label={`Atvira suma: ${fmtMoney(summary.total_balance)}`} sx={{ fontWeight: 800 }} />
      </Box>

      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          size="small"
          placeholder={currentCfg.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 260, flex: 1, maxWidth: 460 }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: "text.disabled" }} /></InputAdornment>,
            endAdornment: search && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearch("")}><ClearIcon sx={{ fontSize: 16 }} /></IconButton>
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}><CircularProgress size={28} /></Box>
      ) : rows.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography sx={{ fontSize: 13, color: "text.disabled" }}>{currentCfg.empty}</Typography>
        </Box>
      ) : (
        <>
          <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: "none", border: "0.5px solid", borderColor: "divider" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 36 }} />
                  <TableCell sx={{ fontWeight: 800, fontSize: 12 }}>{currentCfg.counterpartyLabel}</TableCell>
                  {!isMobile && <TableCell sx={{ fontWeight: 800, fontSize: 12 }}>Naujausia sąskaita</TableCell>}
                  {!isMobile && <TableCell sx={{ fontWeight: 800, fontSize: 12 }} align="right">Sąskaitų</TableCell>}
                  {!isMobile && <TableCell sx={{ fontWeight: 800, fontSize: 12 }} align="right">Suma</TableCell>}
                  {!isMobile && <TableCell sx={{ fontWeight: 800, fontSize: 12 }} align="right">Apmokėta</TableCell>}
                  <TableCell sx={{ fontWeight: 800, fontSize: 12 }} align="right">Likutis</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const key = getRowKey(row);
                  const expanded = expandedKey === key;
                  return (
                    <>
                      <TableRow key={key} hover onClick={() => handleToggleRow(row)} sx={{ cursor: "pointer" }}>
                        <TableCell sx={{ width: 36 }}>
                          <IconButton size="small">
                            {expanded ? <KeyboardArrowDownIcon sx={{ fontSize: 18 }} /> : <KeyboardArrowRightIcon sx={{ fontSize: 18 }} />}
                          </IconButton>
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontSize: 13, fontWeight: 800 }}>{row.counterparty_name || "—"}</Typography>
                          {row.counterparty_code && <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{row.counterparty_code}</Typography>}
                          {isMobile && (
                            <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.35 }}>
                              {fmtDate(row.newest_invoice_date)} · {row.invoice_count} sąsk.
                            </Typography>
                          )}
                        </TableCell>
                        {!isMobile && <TableCell sx={{ fontSize: 13 }}>{fmtDate(row.newest_invoice_date)}</TableCell>}
                        {!isMobile && <TableCell align="right" sx={{ fontSize: 13 }}>{row.invoice_count}</TableCell>}
                        {!isMobile && <TableCell align="right" sx={{ fontSize: 13 }}>{fmtMoney(row.total_invoiced)}</TableCell>}
                        {!isMobile && <TableCell align="right" sx={{ fontSize: 13 }}>{fmtMoney(row.total_paid)}</TableCell>}
                        <TableCell align="right" sx={{ fontSize: 13, fontWeight: 900 }}>{fmtMoney(row.balance)}</TableCell>
                      </TableRow>
                      {renderInvoiceRows(row)}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <Box ref={loadMoreRef} sx={{ minHeight: 48, display: "flex", justifyContent: "center", py: 2 }}>
            {loadingMore && <CircularProgress size={22} />}
            {!loadingMore && hasMore && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Slinkite žemyn, kad įkelti daugiau</Typography>}
            {!loadingMore && !hasMore && rows.length > 0 && <Typography sx={{ fontSize: 12, color: "text.disabled" }}>Daugiau įrašų nėra</Typography>}
          </Box>
        </>
      )}
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════
// Sąskaitų likučiai tab
// ═══════════════════════════════════════════════════════════

function LikuciaiTab({ activeProfileId, period, dateFrom, dateTo }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeProfileId) return;
    setLoading(true);
    api
      .get("/apskaita/likuciai/", {
        params: period !== "custom" ? { period } : { date_from: dateFrom, date_to: dateTo },
        withCredentials: true,
      })
      .then(({ data }) => setAccounts(data.accounts || []))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [activeProfileId, period, dateFrom, dateTo]);

  const groups = useMemo(() => {
    const result = {
      "1-2": { label: "Turtas", accounts: [] },
      "3": { label: "Nuosavas kapitalas", accounts: [] },
      "4": { label: "Įsipareigojimai", accounts: [] },
      "5": { label: "Pajamos", accounts: [] },
      "6-7": { label: "Sąnaudos", accounts: [] },
    };
    for (const acc of accounts) {
      const firstDigit = String(acc.code || "")[0];
      if (firstDigit === "1" || firstDigit === "2") result["1-2"].accounts.push(acc);
      else if (firstDigit === "3") result["3"].accounts.push(acc);
      else if (firstDigit === "4") result["4"].accounts.push(acc);
      else if (firstDigit === "5") result["5"].accounts.push(acc);
      else result["6-7"].accounts.push(acc);
    }
    return result;
  }, [accounts]);

  const renderGroup = (group) => {
    if (group.accounts.length === 0) return null;
    return (
      <Box sx={{ mb: 3 }} key={group.label}>
        <Typography sx={{ fontSize: 12, fontWeight: 800, color: "text.secondary", mb: 1, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {group.label}
        </Typography>
        <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: "none", border: "0.5px solid", borderColor: "divider" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, fontSize: 11, width: 80 }}>Kodas</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Sąskaita</TableCell>
                {!isMobile && <TableCell sx={{ fontWeight: 700, fontSize: 11 }} align="right">Pradinis</TableCell>}
                {!isMobile && <TableCell sx={{ fontWeight: 700, fontSize: 11 }} align="right">Debetas</TableCell>}
                {!isMobile && <TableCell sx={{ fontWeight: 700, fontSize: 11 }} align="right">Kreditas</TableCell>}
                <TableCell sx={{ fontWeight: 700, fontSize: 11 }} align="right">Galutinis</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {group.accounts.map((acc) => {
                const openingIsZero = Number(acc.opening_balance) === 0;
                const closingIsZero = Number(acc.closing_balance) === 0;
                return (
                  <TableRow key={acc.code} hover>
                    <TableCell sx={{ fontSize: 13, fontWeight: 800 }}>{acc.code}</TableCell>
                    <TableCell sx={{ fontSize: 13 }}>{acc.name || "—"}</TableCell>
                    {!isMobile && (
                      <TableCell align="right" sx={{ fontSize: 13 }}>
                        {openingIsZero ? "—" : (
                          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                            <SideChip side={acc.opening_side} />
                            {fmtAmountPlain(acc.opening_balance)}
                          </Box>
                        )}
                      </TableCell>
                    )}
                    {!isMobile && <TableCell align="right" sx={{ fontSize: 13, color: "#2563EB" }}>{fmtAmountPlain(acc.period_debit)}</TableCell>}
                    {!isMobile && <TableCell align="right" sx={{ fontSize: 13, color: "#DC2626" }}>{fmtAmountPlain(acc.period_credit)}</TableCell>}
                    <TableCell align="right" sx={{ fontSize: 13, fontWeight: 800 }}>
                      {closingIsZero ? "—" : (
                        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                          <SideChip side={acc.closing_side} />
                          {fmtAmountPlain(acc.closing_balance)}
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  };

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography sx={{ fontSize: 18, fontWeight: 800 }}>Sąskaitų likučiai</Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.25 }}>
          Pradinis likutis, periodo apyvarta ir galutinis likutis pagal DK sąskaitas.
        </Typography>
      </Box>
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress size={28} /></Box>
      ) : accounts.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography sx={{ fontSize: 13, color: "text.disabled" }}>Nėra sąskaitų su judesiais</Typography>
        </Box>
      ) : (
        <Box>{Object.values(groups).map(renderGroup)}</Box>
      )}
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════
// DK įrašai tab
// ═══════════════════════════════════════════════════════════

function DocumentPreviewDialog({ open, onClose, entry }) {
  if (!entry) return null;

  const url = entry.document_preview_url;
  const isPdf = url?.toLowerCase().endsWith(".pdf");
  const docNumber = entry.document_number || "—";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth disableScrollLock>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", px: 2.5, pt: 2, pb: 1 }}>
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 800 }}>{docNumber}</Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            {entry.counterparty_name || "—"} · {fmtDate(entry.entry_date)}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <ClearIcon fontSize="small" />
        </IconButton>
      </Box>
      <Divider />
      <Box sx={{ p: 2, minHeight: 400 }}>
        {url ? (
          isPdf ? (
            <Box component="iframe" src={url} sx={{ width: "100%", height: 560, border: "none", borderRadius: 2 }} />
          ) : (
            <Box component="img" src={url} alt={docNumber} sx={{ width: "100%", maxHeight: 560, objectFit: "contain", borderRadius: 2 }} />
          )
        ) : (
          <Box sx={{ height: 320, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: 2, border: "2px dashed", borderColor: "divider", bgcolor: "action.hover" }}>
            <Typography sx={{ fontSize: 14, color: "text.disabled" }}>Dokumento peržiūra nepasiekiama</Typography>
          </Box>
        )}
      </Box>
    </Dialog>
  );
}

function SourceChip({ sourceType, isCredit }) {
  const cfg = SOURCE_MAP[sourceType] || SOURCE_MAP.manual;
  const label = isCredit ? `${cfg.label} (kred.)` : cfg.label;
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        fontSize: 11,
        fontWeight: 800,
        px: 0.75,
        py: 0.25,
        borderRadius: "5px",
        bgcolor: cfg.bg,
        color: cfg.color,
      }}
    >
      {cfg.icon}
      {label}
    </Box>
  );
}

const createEmptyManualDkLine = (side) => ({
  side,
  account_code: "",
  account_name: "",
  amount: "",
  description: "",
});

const parseManualDkAmount = (value) => {
  const normalized = String(
    value ?? ""
  )
    .trim()
    .replace(",", ".");

  const number = Number(normalized);

  return Number.isFinite(number)
    ? number
    : 0;
};

function ManualDkDialog({
  open,
  entry,
  copyMode,
  onClose,
  onSaved,
  onDeleted,
  onCopy,
}) {
  const isEditing = Boolean(
    entry?.id && !copyMode
  );

  const [entryDate, setEntryDate] = useState(
    dayjs()
  );
  const [documentNumber, setDocumentNumber] =
    useState("");
  const [description, setDescription] =
    useState("");

  const [counterpartyMode, setCounterpartyMode] =
    useState("search");
  const [selectedCompany, setSelectedCompany] =
    useState(null);
  const [companyOptions, setCompanyOptions] =
    useState([]);
  const [companySearch, setCompanySearch] =
    useState("");
  const [companyLoading, setCompanyLoading] =
    useState(false);

  const [counterpartyName, setCounterpartyName] =
    useState("");
  const [counterpartyCode, setCounterpartyCode] =
    useState("");
  const [
    counterpartyVatCode,
    setCounterpartyVatCode,
  ] = useState("");

  const [lines, setLines] = useState([
    createEmptyManualDkLine("D"),
    createEmptyManualDkLine("K"),
  ]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [accountPicker, setAccountPicker] =
    useState({
      lineIndex: null,
      anchorEl: null,
    });

  useEffect(() => {
    if (!open) return;

    setError("");
    setSaving(false);

    setEntryDate(
      isEditing && entry?.entry_date
        ? dayjs(entry.entry_date)
        : dayjs()
    );

    setDescription(
      entry?.description || ""
    );

    const initialCounterpartyName =
      entry?.counterparty_name || "";
    const initialCounterpartyCode =
      entry?.counterparty_code || "";
    const initialCounterpartyVatCode =
      entry?.counterparty_vat_code || "";

    setCounterpartyMode("search");
    setCounterpartyName(initialCounterpartyName);
    setCounterpartyCode(initialCounterpartyCode);
    setCounterpartyVatCode(initialCounterpartyVatCode);
    setCompanySearch(initialCounterpartyName);
    setCompanyOptions([]);

    setSelectedCompany(
      initialCounterpartyName
        ? {
            id: null,
            pavadinimas: initialCounterpartyName,
            im_kodas: initialCounterpartyCode,
            pvm_kodas: initialCounterpartyVatCode,
          }
        : null
    );

    const sourceLines =
      entry?.lines?.length
        ? entry.lines.map((line) => ({
            side: line.side || "D",
            account_code:
              line.account_code || "",
            account_name:
              line.account_name || "",
            amount: String(
              line.amount ?? ""
            ),
            description:
              line.description || "",
          }))
        : [
            createEmptyManualDkLine("D"),
            createEmptyManualDkLine("K"),
          ];

    setLines(sourceLines);

    if (isEditing) {
      setDocumentNumber(
        entry.document_number || ""
      );
    } else {
      setDocumentNumber("Kraunama...");

      api
        .get("/apskaita/rankiniai-dk/", {
          withCredentials: true,
        })
        .then(({ data }) => {
          setDocumentNumber(
            data.next_number ||
            "Bus suteiktas automatiškai"
          );
        })
        .catch(() => {
          setDocumentNumber(
            "Bus suteiktas automatiškai"
          );
        });
    }
  }, [
    open,
    entry,
    copyMode,
    isEditing,
  ]);

  useEffect(() => {
    if (!open || counterpartyMode !== "search") {
      return undefined;
    }

    const query = companySearch.trim();

    if (query.length < 2) {
      setCompanyOptions([]);
      setCompanyLoading(false);
      return undefined;
    }

    const timer = setTimeout(() => {
      setCompanyLoading(true);

      api
        .get("/apskaita/rankiniai-dk/company-search/", {
          params: { q: query },
          withCredentials: true,
        })
        .then(({ data }) => {
          setCompanyOptions(data.results || []);
        })
        .catch((requestError) => {
          console.error(requestError);
          setCompanyOptions([]);
        })
        .finally(() => {
          setCompanyLoading(false);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [open, counterpartyMode, companySearch]);

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;

    for (const line of lines) {
      const amount = parseManualDkAmount(
        line.amount
      );

      if (line.side === "D") {
        debit += amount;
      } else if (line.side === "K") {
        credit += amount;
      }
    }

    return {
      debit,
      credit,
      difference: debit - credit,
    };
  }, [lines]);

  const hasDebit = lines.some(
    (line) => line.side === "D"
  );

  const hasCredit = lines.some(
    (line) => line.side === "K"
  );

  const requiresCounterparty = lines.some(
    (line) =>
      ["2080", "2410", "4430"].includes(
        String(line.account_code || "").trim()
      )
  );

  const allLinesValid = lines.every(
    (line) =>
      ["D", "K"].includes(line.side) &&
      Boolean(line.account_code) &&
      parseManualDkAmount(line.amount) > 0
  );

  const isBalanced =
    Math.abs(totals.difference) < 0.01;

  const canSave =
    Boolean(entryDate?.isValid()) &&
    lines.length >= 2 &&
    hasDebit &&
    hasCredit &&
    allLinesValid &&
    isBalanced &&
    (
      !requiresCounterparty ||
      Boolean(counterpartyName.trim())
    ) &&
    !saving;

  const updateLine = (
    index,
    field,
    value,
  ) => {
    setLines((previous) =>
      previous.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              [field]: value,
            }
          : line
      )
    );
  };

  const closeAccountPicker = () => {
    setAccountPicker({
      lineIndex: null,
      anchorEl: null,
    });
  };

  const handleAccountSelect = (
    accountCode,
  ) => {
    const account =
      MANUAL_DK_ACCOUNT_OPTIONS
        .flatMap(
          (group) => group.accounts
        )
        .find(
          (item) =>
            item.code === accountCode
        );

    if (
      accountPicker.lineIndex == null ||
      !account
    ) {
      closeAccountPicker();
      return;
    }

    setLines((previous) =>
      previous.map((line, index) =>
        index === accountPicker.lineIndex
          ? {
              ...line,
              account_code: account.code,
              account_name: account.name,
            }
          : line
      )
    );

    closeAccountPicker();
  };

  const addLine = () => {
    const debitCount = lines.filter(
      (line) => line.side === "D"
    ).length;

    const creditCount = lines.filter(
      (line) => line.side === "K"
    ).length;

    setLines((previous) => [
      ...previous,
      createEmptyManualDkLine(
        debitCount <= creditCount
          ? "D"
          : "K"
      ),
    ]);
  };

  const removeLine = (index) => {
    if (lines.length <= 2) return;

    setLines((previous) =>
      previous.filter(
        (_, lineIndex) =>
          lineIndex !== index
      )
    );
  };

  const extractError = (requestError) => {
    const data =
      requestError.response?.data;

    if (typeof data === "string") {
      return data;
    }

    if (data?.detail) {
      return data.detail;
    }

    if (
      data &&
      typeof data === "object"
    ) {
      return Object.values(data)
        .flat()
        .join(", ");
    }

    return "Nepavyko išsaugoti DK įrašo.";
  };

  const handleSave = async () => {
    if (!canSave) return;

    setSaving(true);
    setError("");

    const payload = {
      entry_date:
        entryDate.format("YYYY-MM-DD"),

      description:
        description.trim(),

      counterparty_name:
        counterpartyName.trim(),
      counterparty_code:
        counterpartyCode.trim(),
      counterparty_vat_code:
        counterpartyVatCode.trim(),

      lines: lines.map((line) => ({
        side: line.side,
        account_code:
          line.account_code,
        amount: String(
          line.amount
        ).replace(",", "."),
        description:
          line.description.trim(),
      })),
    };

    try {
      const response = isEditing
        ? await api.put(
            `/apskaita/rankiniai-dk/${entry.id}/`,
            payload,
            {
              withCredentials: true,
            }
          )
        : await api.post(
            "/apskaita/rankiniai-dk/",
            payload,
            {
              withCredentials: true,
            }
          );

      onSaved?.(response.data);
      onClose();
    } catch (requestError) {
      console.error(requestError);
      setError(
        extractError(requestError)
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEditing) return;

    const confirmed = window.confirm(
      `Ištrinti ${entry.document_number}?`
    );

    if (!confirmed) return;

    setSaving(true);
    setError("");

    try {
      await api.delete(
        `/apskaita/rankiniai-dk/${entry.id}/`,
        {
          withCredentials: true,
        }
      );

      onDeleted?.(entry.id);
      onClose();
    } catch (requestError) {
      console.error(requestError);
      setError(
        extractError(requestError)
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    onCopy?.({
      ...entry,
      entry_date:
        entryDate.format("YYYY-MM-DD"),
      description,
      lines: lines.map((line) => ({
        ...line,
      })),
    });
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={
          saving
            ? undefined
            : onClose
        }
        maxWidth="lg"
        fullWidth
        disableScrollLock
      >
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            pr: 1,
          }}
        >
          <Box>
            <Typography
              sx={{
                fontSize: 17,
                fontWeight: 800,
              }}
            >
              {isEditing
                ? "Redaguoti rankinį DK įrašą"
                : copyMode
                  ? "Kopijuoti rankinį DK įrašą"
                  : "Naujas rankinis DK įrašas"}
            </Typography>

            <Typography
              sx={{
                fontSize: 12,
                color: "text.secondary",
                mt: 0.25,
              }}
            >
              Įrašas išsaugomas iš karto kaip
              užregistruotas.
            </Typography>
          </Box>

          <IconButton
            size="small"
            onClick={onClose}
            disabled={saving}
          >
            <ClearIcon />
          </IconButton>
        </DialogTitle>

        <Divider />

        <DialogContent>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: "180px 220px 1fr",
              },
              gap: 1.5,
              mb: 2,
              mt: 0.5,
            }}
          >
            <DatePicker
              label="Data"
              value={entryDate}
              onChange={setEntryDate}
              format="YYYY-MM-DD"
              slotProps={{
                textField: {
                  size: "small",
                  required: true,
                },
              }}
            />

            <TextField
              size="small"
              label="Dokumento numeris"
              value={documentNumber}
              InputProps={{
                readOnly: true,
              }}
            />

            <TextField
              size="small"
              label="Aprašymas"
              placeholder="Neprivaloma"
              value={description}
              onChange={(event) =>
                setDescription(
                  event.target.value
                )
              }
              inputProps={{
                maxLength: 255,
              }}
            />
          </Box>

          <Paper
            variant="outlined"
            sx={{
              p: 1.5,
              mb: 2,
              borderRadius: 2,
              boxShadow: "none",
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
                mb: 1,
              }}
            >
              <Box>
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  Kontrahentas
                  {requiresCounterparty ? " *" : ""}
                </Typography>

                <Typography
                  sx={{
                    fontSize: 11.5,
                    color: requiresCounterparty
                      ? "warning.dark"
                      : "text.secondary",
                  }}
                >
                  {requiresCounterparty
                    ? "Privalomas, nes naudojama skolų sąskaita."
                    : "Neprivaloma."}
                </Typography>
              </Box>

              <Button
                size="small"
                onClick={() => {
                  if (counterpartyMode === "search") {
                    setCounterpartyMode("manual");
                    return;
                  }

                  setCounterpartyMode("search");
                  setCompanySearch(counterpartyName);

                  setSelectedCompany(
                    counterpartyName
                      ? {
                          id: null,
                          pavadinimas: counterpartyName,
                          im_kodas: counterpartyCode,
                          pvm_kodas: counterpartyVatCode,
                        }
                      : null
                  );
                }}
                sx={{ textTransform: "none" }}
              >
                {counterpartyMode === "search"
                  ? "Įvesti rankiniu būdu"
                  : "Ieškoti įmonės"}
              </Button>
            </Box>

            {counterpartyMode === "search" ? (
              <Autocomplete
                fullWidth
                size="small"
                value={selectedCompany}
                inputValue={companySearch}
                options={companyOptions}
                loading={companyLoading}
                filterOptions={(options) => options}
                isOptionEqualToValue={(option, value) =>
                  String(
                    option.id ||
                    option.im_kodas ||
                    option.pavadinimas
                  ) ===
                  String(
                    value.id ||
                    value.im_kodas ||
                    value.pavadinimas
                  )
                }
                getOptionLabel={(option) =>
                  option?.pavadinimas || ""
                }
                onInputChange={(_, value, reason) => {
                  if (reason === "input") {
                    setCompanySearch(value);
                  }

                  if (reason === "clear") {
                    setCompanySearch("");
                    setSelectedCompany(null);
                    setCounterpartyName("");
                    setCounterpartyCode("");
                    setCounterpartyVatCode("");
                  }
                }}
                onChange={(_, company) => {
                  setSelectedCompany(company);

                  if (!company) {
                    setCompanySearch("");
                    setCounterpartyName("");
                    setCounterpartyCode("");
                    setCounterpartyVatCode("");
                    return;
                  }

                  setCompanySearch(
                    company.pavadinimas || ""
                  );
                  setCounterpartyName(
                    company.pavadinimas || ""
                  );
                  setCounterpartyCode(
                    company.im_kodas || ""
                  );
                  setCounterpartyVatCode(
                    company.pvm_kodas || ""
                  );
                }}
                noOptionsText={
                  companySearch.trim().length < 2
                    ? "Įveskite bent 2 simbolius"
                    : "Įmonių nerasta"
                }
                loadingText="Ieškoma..."
                slotProps={{
                  paper: {
                    sx: {
                      mt: 0.5,
                      p: 0.5,
                      borderRadius: 2,
                      border: "1px solid",
                      borderColor: "divider",
                      boxShadow: "0 12px 32px rgba(15, 23, 42, 0.14)",
                    },
                  },
                  listbox: {
                    sx: {
                      p: 0,
                      "& .MuiAutocomplete-option": {
                        minHeight: 54,
                        "&[aria-selected='true']": {
                          bgcolor: "#FFF7E6",
                        },
                        "&[aria-selected='true'].Mui-focused": {
                          bgcolor: "#FFEDD5",
                        },
                        "&.Mui-focused": {
                          bgcolor: "action.hover",
                        },
                      },
                    },
                  },
                }}
                renderOption={(props, company) => {
                  const { key, ...optionProps } = props;

                  return (
                    <Box
                      component="li"
                      key={key}
                      {...optionProps}
                      sx={{
                        px: 1.5,
                        py: 1,
                        alignItems: "flex-start !important",
                        borderRadius: 1,
                        mb: 0.25,
                      }}
                    >
                      <Box
                        sx={{
                          width: "100%",
                          minWidth: 0,
                          display: "flex",
                          flexDirection: "column",
                          gap: 0.35,
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: 13,
                            fontWeight: 800,
                            lineHeight: 1.3,
                            color: "text.primary",
                          }}
                        >
                          {company.pavadinimas || "—"}
                        </Typography>

                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1.5,
                            flexWrap: "wrap",
                          }}
                        >
                          {company.im_kodas && (
                            <Typography
                              sx={{
                                fontSize: 11.5,
                                lineHeight: 1.3,
                                color: "text.secondary",
                              }}
                            >
                              Įmonės kodas:{" "}
                              <Box component="span" sx={{ fontWeight: 700 }}>
                                {company.im_kodas}
                              </Box>
                            </Typography>
                          )}

                          {company.pvm_kodas && (
                            <Typography
                              sx={{
                                fontSize: 11.5,
                                lineHeight: 1.3,
                                color: "text.secondary",
                              }}
                            >
                              PVM kodas:{" "}
                              <Box component="span" sx={{ fontWeight: 700 }}>
                                {company.pvm_kodas}
                              </Box>
                            </Typography>
                          )}

                          {!company.im_kodas && !company.pvm_kodas && (
                            <Typography
                              sx={{
                                fontSize: 11.5,
                                lineHeight: 1.3,
                                color: "text.disabled",
                              }}
                            >
                              Įmonės ir PVM kodai nenurodyti
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </Box>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Ieškoti kontrahento"
                    placeholder="Pavadinimas, įmonės arba PVM kodas"
                    error={
                      requiresCounterparty &&
                      !counterpartyName.trim()
                    }
                  />
                )}
              />
            ) : (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    md: "1fr 180px 180px",
                  },
                  gap: 1.25,
                }}
              >
                <TextField
                  size="small"
                  label={
                    requiresCounterparty
                      ? "Pavadinimas *"
                      : "Pavadinimas"
                  }
                  value={counterpartyName}
                  onChange={(event) =>
                    setCounterpartyName(
                      event.target.value
                    )
                  }
                  error={
                    requiresCounterparty &&
                    !counterpartyName.trim()
                  }
                  inputProps={{
                    maxLength: 255,
                  }}
                />

                <TextField
                  size="small"
                  label="Įmonės kodas"
                  value={counterpartyCode}
                  onChange={(event) =>
                    setCounterpartyCode(
                      event.target.value
                    )
                  }
                  inputProps={{
                    maxLength: 50,
                  }}
                />

                <TextField
                  size="small"
                  label="PVM kodas"
                  value={counterpartyVatCode}
                  onChange={(event) =>
                    setCounterpartyVatCode(
                      event.target.value
                    )
                  }
                  inputProps={{
                    maxLength: 32,
                  }}
                />
              </Box>
            )}

            {requiresCounterparty &&
              !counterpartyName.trim() && (
                <Typography
                  sx={{
                    mt: 0.75,
                    fontSize: 11.5,
                    color: "error.main",
                  }}
                >
                  Pasirinkite arba įveskite kontrahentą
                </Typography>
              )}
          </Paper>

          {error && (
            <Alert
              severity="error"
              sx={{ mb: 2 }}
            >
              {error}
            </Alert>
          )}

          <TableContainer
            component={Paper}
            sx={{
              borderRadius: 2,
              border: "0.5px solid",
              borderColor: "divider",
              boxShadow: "none",
              overflowX: "auto",
            }}
          >
            <Table
              size="small"
              sx={{ minWidth: 850 }}
            >
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      width: 80,
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    D/K
                  </TableCell>

                  <TableCell
                    sx={{
                      width: 190,
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    Sąskaita
                  </TableCell>

                  <TableCell
                    sx={{
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    Pavadinimas
                  </TableCell>

                  <TableCell
                    sx={{
                      width: 150,
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    Suma
                  </TableCell>

                  <TableCell
                    sx={{
                      width: 220,
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    Eilutės aprašymas
                  </TableCell>

                  <TableCell
                    sx={{ width: 44 }}
                  />
                </TableRow>
              </TableHead>

              <TableBody>
                {lines.map(
                  (line, index) => (
                    <TableRow
                      key={index}
                    >
                      <TableCell>
                        <Select
                          size="small"
                          value={line.side}
                          onChange={(event) =>
                            updateLine(
                              index,
                              "side",
                              event.target.value
                            )
                          }
                          sx={{
                            width: 64,
                            fontSize: 12,
                          }}
                          MenuProps={{
                            disableScrollLock:
                              true,
                          }}
                        >
                          <MenuItem value="D">
                            D
                          </MenuItem>
                          <MenuItem value="K">
                            K
                          </MenuItem>
                        </Select>
                      </TableCell>

                      <TableCell>
                        <Button
                          fullWidth
                          variant="outlined"
                          onClick={(event) => {
                            setAccountPicker({
                              lineIndex:
                                index,
                              anchorEl:
                                event.currentTarget,
                            });
                          }}
                          sx={{
                            justifyContent:
                              "flex-start",
                            textTransform:
                              "none",
                            fontSize: 12,
                            fontWeight: 800,
                            minHeight: 40,
                          }}
                        >
                          {line.account_code ||
                            "Pasirinkti"}
                        </Button>
                      </TableCell>

                      <TableCell>
                        <Typography
                          sx={{
                            fontSize: 12,
                            color:
                              line.account_name
                                ? "text.primary"
                                : "text.disabled",
                          }}
                        >
                          {line.account_name ||
                            "Sąskaita nepasirinkta"}
                        </Typography>
                      </TableCell>

                      <TableCell>
                        <TextField
                          size="small"
                          value={line.amount}
                          onChange={(event) =>
                            updateLine(
                              index,
                              "amount",
                              event.target.value
                            )
                          }
                          placeholder="0,00"
                          inputProps={{
                            inputMode:
                              "decimal",
                          }}
                          fullWidth
                        />
                      </TableCell>

                      <TableCell>
                        <TextField
                          size="small"
                          value={
                            line.description
                          }
                          onChange={(event) =>
                            updateLine(
                              index,
                              "description",
                              event.target.value
                            )
                          }
                          placeholder="Neprivaloma"
                          inputProps={{
                            maxLength: 255,
                          }}
                          fullWidth
                        />
                      </TableCell>

                      <TableCell>
                        <IconButton
                          size="small"
                          disabled={
                            lines.length <= 2
                          }
                          onClick={() =>
                            removeLine(index)
                          }
                        >
                          <DeleteOutlineIcon
                            sx={{
                              fontSize: 18,
                            }}
                          />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  )
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={addLine}
            sx={{
              mt: 1.25,
              textTransform: "none",
              fontWeight: 700,
            }}
          >
            Pridėti eilutę
          </Button>

          <Paper
            variant="outlined"
            sx={{
              mt: 2,
              p: 1.5,
              borderRadius: 2,
              display: "flex",
              justifyContent:
                "flex-end",
              gap: 3,
              flexWrap: "wrap",
            }}
          >
            <SmallValueRow
              label="Debetas"
              value={fmtMoney(
                totals.debit
              )}
              bold
              color="#2563EB"
            />

            <SmallValueRow
              label="Kreditas"
              value={fmtMoney(
                totals.credit
              )}
              bold
              color="#DC2626"
            />

            <SmallValueRow
              label="Skirtumas"
              value={fmtMoney(
                Math.abs(
                  totals.difference
                )
              )}
              bold
              color={
                isBalanced
                  ? "#16A34A"
                  : "#DC2626"
              }
            />
          </Paper>

          {!isBalanced && (
            <Alert
              severity="warning"
              sx={{ mt: 1.5 }}
            >
              DK įrašas nesubalansuotas.
            </Alert>
          )}
        </DialogContent>

        <Divider />

        <DialogActions
          sx={{
            px: 3,
            py: 1.5,
            justifyContent:
              "space-between",
          }}
        >
          <Box
            sx={{
              display: "flex",
              gap: 1,
            }}
          >
            {isEditing && (
              <>
                <Button
                  color="error"
                  startIcon={
                    <DeleteOutlineIcon />
                  }
                  onClick={handleDelete}
                  disabled={saving}
                  sx={{
                    textTransform:
                      "none",
                  }}
                >
                  Ištrinti
                </Button>

                <Button
                  startIcon={
                    <ContentCopyIcon />
                  }
                  onClick={handleCopy}
                  disabled={saving}
                  sx={{
                    textTransform:
                      "none",
                  }}
                >
                  Kopijuoti
                </Button>
              </>
            )}
          </Box>

          <Box
            sx={{
              display: "flex",
              gap: 1,
            }}
          >
            <Button
              onClick={onClose}
              disabled={saving}
              sx={{
                textTransform: "none",
              }}
            >
              Atšaukti
            </Button>

            <Button
              variant="contained"
              onClick={handleSave}
              disabled={!canSave}
              disableElevation
              sx={{
                textTransform: "none",
                fontWeight: 800,
              }}
            >
              {saving
                ? "Saugoma..."
                : isEditing
                  ? "Išsaugoti pakeitimus"
                  : "Užregistruoti"}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      {accountPicker.anchorEl && (
        <AccountPickerPopover
          open
          anchorEl={
            accountPicker.anchorEl
          }
          options={
            MANUAL_DK_ACCOUNT_OPTIONS
          }
          onClose={
            closeAccountPicker
          }
          onSelect={
            handleAccountSelect
          }
        />
      )}
    </>
  );
}

function DkIrasasRow({
  entry,
  isMobile,
  onOpenManual,
}) {
  const [expanded, setExpanded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const statusCfg = STATUS_MAP[entry.status] || STATUS_MAP.draft;

  const difference = Number(entry.difference || 0);
  const hasDifference = Math.abs(difference) > 0.009;

  const isManual =
    entry.source_type === "manual";

  const canOpenDocument =
    isManual ||
    Boolean(entry.document_preview_url);

  return (
    <>
      <TableRow hover onClick={() => setExpanded(!expanded)} sx={{ cursor: "pointer" }}>
        <TableCell sx={{ p: 1, width: 32 }}>
          <IconButton size="small">
            {expanded ? <KeyboardArrowDownIcon sx={{ fontSize: 18 }} /> : <KeyboardArrowRightIcon sx={{ fontSize: 18 }} />}
          </IconButton>
        </TableCell>

        <TableCell sx={{ fontSize: 13 }}>{fmtDate(entry.entry_date)}</TableCell>

        <TableCell>
          <SourceChip sourceType={entry.source_type} isCredit={entry.is_credit} />
        </TableCell>

        {!isMobile && (
          <TableCell>
            {entry.document_number ? (
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: canOpenDocument
                    ? "primary.main"
                    : "text.primary",
                  cursor: canOpenDocument
                    ? "pointer"
                    : "default",
                  "&:hover": canOpenDocument
                    ? {
                        textDecoration: "underline",
                      }
                    : undefined,
                }}
                onClick={(event) => {
                  if (isManual) {
                    event.stopPropagation();
                    onOpenManual?.(entry);
                    return;
                  }

                  if (entry.document_preview_url) {
                    event.stopPropagation();
                    setPreviewOpen(true);
                  }
                }}
              >
                {entry.document_number}
              </Typography>
            ) : (
              <Typography sx={{ fontSize: 13, color: "text.disabled" }}>—</Typography>
            )}
          </TableCell>
        )}

        <TableCell>
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
            {entry.counterparty_name || "—"}
          </Typography>
          {entry.counterparty_code && !isMobile && (
            <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{entry.counterparty_code}</Typography>
          )}
        </TableCell>

        <TableCell align="right" sx={{ fontSize: 13, fontWeight: 700 }}>
          {fmtMoney(entry.total_debit)}
        </TableCell>

        {!isMobile && (
          <TableCell sx={{ fontSize: 12, fontFamily: "monospace", color: "text.secondary", whiteSpace: "nowrap" }}>
            {buildKorSummary(entry.lines)}
          </TableCell>
        )}

        <TableCell>
          <Chip
            label={statusCfg.label}
            color={statusCfg.color}
            size="small"
            variant={entry.status === "posted" ? "filled" : "outlined"}
          />
          {hasDifference && (
            <Typography sx={{ fontSize: 11, color: "error.main", mt: 0.5 }}>
              Skirtumas: {fmtMoney(entry.difference)}
            </Typography>
          )}
        </TableCell>
      </TableRow>

      <TableRow>
        <TableCell
          colSpan={isMobile ? 6 : 8}
          sx={{ p: 0, borderBottom: expanded ? undefined : "none" }}
        >
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ p: 2, bgcolor: "rgba(0, 0, 0, 0.012)" }}>
              {entry.original_currency && entry.original_currency !== "EUR" && (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    mb: 1.5,
                    borderRadius: 1.5,
                    bgcolor: "background.paper",
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                    gap: 0.75,
                  }}
                >
                  <SmallValueRow label="Suma valiuta" value={fmtAmount(entry.original_amount, entry.original_currency)} />
                  <SmallValueRow label="Suma eurais" value={fmtMoney(entry.total_debit)} />
                  {entry.exchange_rate && (
                    <SmallValueRow label="Valiutos kursas" value={`1 EUR = ${Number(entry.exchange_rate).toFixed(4)} ${entry.original_currency}`} />
                  )}
                  {entry.exchange_rate_date && (
                    <SmallValueRow label="Valiutos kurso data" value={fmtDate(entry.exchange_rate_date)} />
                  )}
                </Paper>
              )}

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1,
                  mb: 1,
                }}
              >
                <Typography
                  sx={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: "text.secondary",
                  }}
                >
                  DK eilutės
                </Typography>

                {isManual && (
                  <Button
                    size="small"
                    startIcon={<EditOutlinedIcon />}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenManual?.(entry);
                    }}
                    sx={{
                      textTransform: "none",
                      fontSize: 12,
                    }}
                  >
                    Redaguoti
                  </Button>
                )}
              </Box>

              <Table size="small" sx={{ maxWidth: 520 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontSize: 11, fontWeight: 700, width: 80, py: 0.5 }}>Kodas</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 700, py: 0.5 }}>Pavadinimas</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 700, py: 0.5 }} align="right">Debetas</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 700, py: 0.5 }} align="right">Kreditas</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entry.lines?.length ? (
                    <>
                      {entry.lines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell
                            sx={{
                              fontSize: 12,
                              fontWeight: 800,
                              py: 0.5,
                            }}
                          >
                            {line.account_code}
                          </TableCell>
                          <TableCell
                            sx={{
                              fontSize: 11.5,
                              color: "text.secondary",
                              py: 0.5,
                            }}
                          >
                            <Box
                              sx={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 0.75,
                              }}
                            >
                              <Box component="span">
                                {line.account_name || "—"}
                              </Box>

                              {line.is_user_modified && (
                                <Tooltip title="Kor. sąskaita pakeista rankiniu būdu">
                                  <EditNoteOutlinedIcon
                                    sx={{
                                      fontSize: 21,
                                      color: "#b206d9",
                                      flexShrink: 0,
                                    }}
                                  />
                                </Tooltip>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell sx={{ fontSize: 12, fontWeight: 700, py: 0.5, color: "#2563EB" }} align="right">
                            {line.side === "D" ? fmtMoney(line.amount) : ""}
                          </TableCell>
                          <TableCell sx={{ fontSize: 12, fontWeight: 700, py: 0.5, color: "#DC2626" }} align="right">
                            {line.side === "K" ? fmtMoney(line.amount) : ""}
                          </TableCell>
                        </TableRow>
                      ))}

                      <TableRow>
                        <TableCell colSpan={2} sx={{ fontSize: 11, fontWeight: 700, py: 0.75, borderBottom: "none" }} align="right">Iš viso</TableCell>
                        <TableCell sx={{ fontSize: 12, fontWeight: 800, py: 0.75, color: "#2563EB", borderBottom: "none" }} align="right">{fmtMoney(entry.total_debit)}</TableCell>
                        <TableCell sx={{ fontSize: 12, fontWeight: 800, py: 0.75, color: "#DC2626", borderBottom: "none" }} align="right">{fmtMoney(entry.total_credit)}</TableCell>
                      </TableRow>

                      {hasDifference && (
                        <TableRow>
                          <TableCell colSpan={2} sx={{ fontSize: 11, fontWeight: 700, py: 0.5, color: "error.main", borderBottom: "none" }} align="right">Skirtumas</TableCell>
                          <TableCell colSpan={2} sx={{ fontSize: 12, fontWeight: 800, py: 0.5, color: "error.main", borderBottom: "none" }} align="right">{fmtMoney(entry.difference)}</TableCell>
                        </TableRow>
                      )}
                    </>
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ fontSize: 12, color: "text.disabled" }}>DK eilučių nėra</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>

      <DocumentPreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)} entry={entry} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// DK eilutės flat view
// ═══════════════════════════════════════════════════════════

function DkDocsScrollLoader({ hasMore, loadingMore, onLoadMore, totalLoaded, totalCount }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore || loadingMore) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting && hasMore && !loadingMore) onLoadMore(); },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  return (
    <Box ref={ref} sx={{ display: "flex", justifyContent: "center", py: 1.5, minHeight: 40 }}>
      {loadingMore && <CircularProgress size={22} />}
      {!loadingMore && hasMore && (
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          Rodoma {totalLoaded} iš {totalCount} · slinkite žemyn
        </Typography>
      )}
      {!loadingMore && !hasMore && totalLoaded > 0 && (
        <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
          Iš viso {totalCount} dokumentų
        </Typography>
      )}
    </Box>
  );
}

function AccountPickerPopover({
  open,
  anchorEl,
  onClose,
  onSelect,
  line,
  options = null,
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQ("");

      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);

      return () => clearTimeout(timer);
    }

    return undefined;
  }, [open]);

  const availableOptions = useMemo(
    () =>
      options ||
      getEditableAccountOptions(line),
    [line, options],
  );

  const filtered = useMemo(() => {
    if (!q.trim()) {
      return availableOptions;
    }

    const lower = q.trim().toLowerCase();

    return availableOptions
      .map((group) => ({
        ...group,
        accounts: group.accounts.filter(
          (account) =>
            account.code.toLowerCase().includes(lower) ||
            account.name.toLowerCase().includes(lower),
        ),
      }))
      .filter((group) => group.accounts.length > 0);
  }, [q, availableOptions]);

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{
        vertical: "bottom",
        horizontal: "left",
      }}
      transformOrigin={{
        vertical: "top",
        horizontal: "left",
      }}
      disableScrollLock
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            width: 320,
            display: "flex",
            flexDirection: "column",
            maxHeight: 420,
          },
        },
      }}
    >
      <Box
        sx={{
          p: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <TextField
          inputRef={inputRef}
          size="small"
          fullWidth
          placeholder="Ieškoti pagal kodą arba pavadinimą..."
          value={q}
          onChange={(event) => setQ(event.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon
                  sx={{
                    fontSize: 16,
                    color: "text.disabled",
                  }}
                />
              </InputAdornment>
            ),
            sx: {
              fontSize: 12,
            },
          }}
        />
      </Box>

      <Box
        sx={{
          overflow: "auto",
          flex: 1,
        }}
      >
        {filtered.length === 0 ? (
          <Typography
            sx={{
              fontSize: 12,
              color: "text.disabled",
              p: 2,
              textAlign: "center",
            }}
          >
            Nerasta
          </Typography>
        ) : (
          filtered.map((group) => (
            <Box key={group.group}>
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "text.secondary",
                  px: 2,
                  pt: 1,
                  pb: 0.25,
                }}
              >
                {group.group}
              </Typography>

              {group.accounts.map((account) => (
                <MenuItem
                  key={account.code}
                  onClick={() => onSelect(account.code)}
                  sx={{
                    fontSize: 12,
                    py: 0.5,
                    px: 2,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 700,
                      width: 44,
                      flexShrink: 0,
                    }}
                  >
                    {account.code}
                  </Typography>

                  <Typography
                    sx={{
                      fontSize: 12,
                      color: "text.secondary",
                    }}
                  >
                    {account.name}
                  </Typography>
                </MenuItem>
              ))}
            </Box>
          ))
        )}
      </Box>
    </Popover>
  );
}

function DkEilutesTable({ entries, isMobile, onRefresh, onLineUpdated, hasMore, loadingMore, onLoadMore, totalCount, onOpenManual }) {  
  const [previewEntry, setPreviewEntry] = useState(null);
  const editingRef = useRef({
    lineId: null,
    line: null,
    anchor: null,
  });
  const savingLockRef = useRef(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [savingLineId, setSavingLineId] = useState(null);

  const flatLines = useMemo(() => {
    const result = [];
    let entryIdx = 0;
    for (const entry of entries) {
      if (!entry.lines?.length) continue;
      for (const line of entry.lines) {
        result.push({ ...line, entry, entryIdx });
      }
      entryIdx++;
    }
    return result;
  }, [entries]);

  const closePopover = () => {
    editingRef.current = {
      lineId: null,
      line: null,
      anchor: null,
    };

    setPopoverOpen(false);
  };

  const handleAccountChange = async (
    lineId,
    newCode,
  ) => {
    closePopover();

    if (!lineId || !newCode) {
      return;
    }

    setSavingLineId(lineId);

    try {
      const { data } = await api.patch(
        `/apskaita/dk-eilutes/${lineId}/`,
        {
          account_code: newCode,
        },
        {
          withCredentials: true,
        },
      );

      const isUserModified =
        data.is_user_modified ??
        data.status === "updated";

      onLineUpdated?.(
        lineId,
        data.account_code,
        data.account_name,
        isUserModified,
      );
    } catch (error) {
      console.error(error);
    } finally {
      setSavingLineId(null);
    }
  };

  if (flatLines.length === 0) {
    return (
      <Box sx={{ textAlign: "center", py: 6 }}>
        <Typography sx={{ fontSize: 13, color: "text.disabled" }}>DK eilučių nėra</Typography>
      </Box>
    );
  }

  const bandBg = "rgba(0, 0, 0, 0.04)";
  const hoverBg = "rgba(0, 0, 0, 0.07)";
  const groupBorder = "1.5px solid rgba(0, 0, 0, 0.12)";

  const withFlags = flatLines.map((line, idx) => ({
    ...line,
    isFirstInGroup: idx === 0 || flatLines[idx - 1].entry.id !== line.entry.id,
  }));

  return (
    <>
      <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: "none", border: "0.5px solid", borderColor: "divider" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Data</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Tipas</TableCell>
              {!isMobile && <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Dokumentas</TableCell>}
              {!isMobile && <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Kontrahentas</TableCell>}
              <TableCell sx={{ fontWeight: 700, fontSize: 12, width: 42 }}>D/K</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: 12, width: 80 }}>Kodas</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Pavadinimas</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Debetas</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Kreditas</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {withFlags.map((line, idx) => {
              const isOdd = line.entryIdx % 2 === 1;
              const isSaving = savingLineId === line.id;
              const isManual = line.entry.source_type === "manual";
              const canOpenDocument = isManual || Boolean(line.entry.document_preview_url);
              const canEdit =
                !isManual &&
                line.is_editable &&
                !isSaving;

              return (
                <TableRow
                  key={`${line.entry.id}-${line.id}-${idx}`}
                  sx={{
                    bgcolor: isOdd ? bandBg : "transparent",
                    "&:hover": { bgcolor: hoverBg },
                    ...(line.isFirstInGroup && idx > 0 ? { "& td": { borderTop: groupBorder } } : {}),
                  }}
                >
                  <TableCell sx={{ fontSize: 13, color: "text.primary" }}>{fmtDate(line.entry.entry_date)}</TableCell>
                  <TableCell><SourceChip sourceType={line.entry.source_type} isCredit={line.entry.is_credit} /></TableCell>
                  {!isMobile && (
                    <TableCell>
                      {line.entry.document_number ? (
                        <Typography
                          sx={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: canOpenDocument ? "primary.main" : "text.primary",
                            cursor: canOpenDocument ? "pointer" : "default",
                            "&:hover": canOpenDocument ? { textDecoration: "underline" } : undefined,
                          }}
                          onClick={() => { if (isManual) onOpenManual?.(line.entry); else if (line.entry.document_preview_url) setPreviewEntry(line.entry); }}
                        >
                          {line.entry.document_number}
                        </Typography>
                      ) : (
                        <Typography sx={{ fontSize: 13, color: "text.disabled" }}>—</Typography>
                      )}
                    </TableCell>
                  )}
                  {!isMobile && <TableCell sx={{ fontSize: 12, color: "text.primary" }}>{line.entry.counterparty_name || "—"}</TableCell>}
                  <TableCell><SideChip side={line.side} /></TableCell>

                  <TableCell sx={{ fontSize: 12, fontWeight: 800, color: "text.primary" }}>
                    {isSaving ? (
                      <CircularProgress size={14} />
                    ) : (
                      <Box
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 0.5,
                        }}
                      >
                        {line.account_code}

                        {canEdit && (
                          <IconButton
                            size="small"
                            sx={{ p: 0.25 }}
                            onClick={(event) => {
                              event.stopPropagation();

                              editingRef.current = {
                                lineId: line.id,
                                line,
                                anchor: event.currentTarget,
                              };

                              setPopoverOpen(true);
                            }}
                          >
                            <EditOutlinedIcon
                              sx={{
                                fontSize: 13,
                                color: "text.disabled",
                              }}
                            />
                          </IconButton>
                        )}
                      </Box>
                    )}
                  </TableCell>

                  <TableCell
                    sx={{
                      fontSize: 12,
                      color: "text.primary",
                    }}
                  >
                    <Box
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.75,
                      }}
                    >
                      <Box component="span">
                        {line.account_name || "—"}
                      </Box>

                      {line.is_user_modified && (
                        <Tooltip title="Kor. sąskaita pakeista rankiniu būdu">
                          <EditNoteOutlinedIcon
                            sx={{
                              fontSize: 21,
                              color: "#b206d9",
                              flexShrink: 0,
                            }}
                          />
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontSize: 12, fontWeight: 700, color: "#2563EB" }}>
                    {line.side === "D" ? fmtMoney(line.amount) : ""}
                  </TableCell>
                  <TableCell sx={{ fontSize: 12, fontWeight: 700, color: "#DC2626" }}>
                    {line.side === "K" ? fmtMoney(line.amount) : ""}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <DkDocsScrollLoader hasMore={hasMore} loadingMore={loadingMore} onLoadMore={onLoadMore} totalLoaded={entries.length} totalCount={totalCount} />

      {popoverOpen && (
        <AccountPickerPopover
          open
          anchorEl={editingRef.current.anchor}
          line={editingRef.current.line}
          onClose={closePopover}
          onSelect={(code) =>
            handleAccountChange(
              editingRef.current.lineId,
              code,
            )
          }
        />
      )}

      <DocumentPreviewDialog open={!!previewEntry} onClose={() => setPreviewEntry(null)} entry={previewEntry} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// DK tab wrapper
// ═══════════════════════════════════════════════════════════

function DkIrasaiTab({
  activeProfileId,
  period,
  dateFrom,
  dateTo,
  onChanged,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const BATCH = 50;
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [accountCode, setAccountCode] = useState("");
  const [viewMode, setViewMode] = useState("docs");
  const [totalCount, setTotalCount] = useState(0);
  const [manualDialog, setManualDialog] =
    useState({
      open: false,
      entry: null,
      copyMode: false,
    });

  const openNewManualDk = () => {
    setManualDialog({
      open: true,
      entry: null,
      copyMode: false,
    });
  };

  const openManualDk = (entry) => {
    setManualDialog({
      open: true,
      entry,
      copyMode: false,
    });
  };

  const copyManualDk = (entry) => {
    setManualDialog({
      open: true,
      entry,
      copyMode: true,
    });
  };

  const closeManualDk = () => {
    setManualDialog({
      open: false,
      entry: null,
      copyMode: false,
    });
  };

  const buildParams = useCallback(() => {
    const params = { limit: BATCH };
    if (period !== "custom") {
      params.period = period;
    } else {
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
    }
    if (search) params.counterparty = search;
    if (sourceType) params.source_type = sourceType;
    if (onlyProblems) params.only_problems = "true";
    if (accountCode) params.account_code = accountCode;
    return params;
  }, [period, dateFrom, dateTo, search, sourceType, onlyProblems, accountCode]);

  const loadEntries = useCallback(() => {
    if (!activeProfileId) return;
    if (period === "custom" && (!dateFrom || !dateTo)) return;
    setLoading(true);

    const params = { ...buildParams(), offset: 0 };

    return api
      .get("/apskaita/operacijos/", { params, withCredentials: true })
      .then(({ data }) => {
        const results = Array.isArray(data) ? data : (data.results || []);
        const count = Array.isArray(data) ? results.length : (data.count || results.length);
        setEntries(results);
        setTotalCount(count);
        setHasMore(!Array.isArray(data) && results.length < count);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [activeProfileId, buildParams]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    const params = { ...buildParams(), offset: entries.length };

    api
      .get("/apskaita/operacijos/", { params, withCredentials: true })
      .then(({ data }) => {
        const results = Array.isArray(data) ? data : (data.results || []);
        const count = Array.isArray(data) ? 0 : (data.count || 0);
        setEntries((prev) => [...prev, ...results]);
        setTotalCount(count);
        setHasMore(count > 0 && (entries.length + results.length) < count);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoadingMore(false));
  }, [loadingMore, hasMore, entries.length, buildParams]);

  const handleLineUpdated = useCallback(
    (
      lineId,
      accountCode,
      accountName,
      isUserModified,
    ) => {
      setEntries((prev) =>
        prev.map((entry) => ({
          ...entry,
          lines: entry.lines?.map((line) =>
            line.id === lineId
              ? {
                  ...line,
                  account_code: accountCode,
                  account_name: accountName,
                  is_user_modified:
                    isUserModified ??
                    line.is_user_modified,
                }
              : line,
          ),
        })),
      );
    },
    [],
  );

  useEffect(() => { loadEntries(); }, [loadEntries]);

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2, flexWrap: "wrap", gap: 1 }}>
        <Box>
          <Typography sx={{ fontSize: 18, fontWeight: 800 }}>DK įrašai</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.25 }}>
            Visi debeto ir kredito įrašai pagal pirkimus, pardavimus, banką ir rankines operacijas.
          </Typography>
        </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={openNewManualDk} disableElevation sx={{ textTransform: "none", fontWeight: 800 }}>
            Naujas rankinis DK įrašas
          </Button>

          <Paper
            sx={{
              p: 0.5,
              bgcolor: "#F3F4F6",
              borderRadius: 1.5,
              border: "0.5px solid",
              borderColor: "divider",
              boxShadow: "none",
              display: "flex",
            }}
          >
            <Button
              size="small"
              variant="text"
              onClick={() => {
                setViewMode("docs");
                if (entries.length > BATCH) {
                  setEntries((prev) => prev.slice(0, BATCH));
                  setHasMore(true);
                }
              }}
              sx={{ textTransform: "none", fontWeight: 700, fontSize: 12, px: 1.5, minWidth: 0, borderRadius: 1, bgcolor: viewMode === "docs" ? "#111827" : "transparent", color: viewMode === "docs" ? "#fff" : "text.secondary", "&:hover": { bgcolor: viewMode === "docs" ? "#1F2937" : "action.hover" } }}
              disableElevation
            >
              Dokumentai
            </Button>

            <Button
              size="small"
              variant="text"
              onClick={() => setViewMode("lines")}
               sx={{ textTransform: "none", fontWeight: 700, fontSize: 12, px: 1.5, minWidth: 0, borderRadius: 1, bgcolor: viewMode === "lines" ? "#111827" : "transparent", color: viewMode === "lines" ? "#fff" : "text.secondary", "&:hover": { bgcolor: viewMode === "lines" ? "#1F2937" : "action.hover" } }}
              disableElevation
            >
              DK eilutės
            </Button>
          </Paper>
        </Box>
      </Box>

      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          size="small"
          placeholder="Ieškoti pagal kontrahentą..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 220, flex: 1, maxWidth: 340 }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: "text.disabled" }} /></InputAdornment>,
            endAdornment: search && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearch("")}><ClearIcon sx={{ fontSize: 16 }} /></IconButton>
              </InputAdornment>
            ),
          }}
        />

        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Šaltinio tipas</InputLabel>
          <Select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            label="Šaltinio tipas"
            MenuProps={{ disableScrollLock: true }}
          >
            <MenuItem value="">Visi</MenuItem>
            <MenuItem value="purchase">Pirkimas</MenuItem>
            <MenuItem value="sale">Pardavimas</MenuItem>
            <MenuItem value="bank">Bankas</MenuItem>
            <MenuItem value="manual">Rankinis</MenuItem>
            <MenuItem value="opening">Pradiniai likučiai</MenuItem>
          </Select>
        </FormControl>

        <TextField
          size="small"
          placeholder="Sąskaita, pvz. 6200"
          value={accountCode}
          onChange={(e) => setAccountCode(e.target.value)}
          sx={{ width: 160 }}
          InputProps={{
            endAdornment: accountCode && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setAccountCode("")}><ClearIcon sx={{ fontSize: 16 }} /></IconButton>
              </InputAdornment>
            ),
          }}
        />

        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={onlyProblems}
              onChange={(e) => setOnlyProblems(e.target.checked)}
            />
          }
          label={<Typography sx={{ fontSize: 13 }}>Tik problemos</Typography>}
        />
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress size={28} /></Box>
      ) : entries.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography sx={{ fontSize: 13, color: "text.disabled" }}>DK įrašų nėra</Typography>
        </Box>
      ) : viewMode === "lines" ? (
        <DkEilutesTable entries={entries} isMobile={isMobile} onRefresh={loadEntries} onLineUpdated={handleLineUpdated} hasMore={hasMore} loadingMore={loadingMore} onLoadMore={loadMore} totalCount={totalCount} onOpenManual={openManualDk} />
      ) : (
        <>
        <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: "none", border: "0.5px solid", borderColor: "divider" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 32 }} />
                <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Data</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Tipas</TableCell>
                {!isMobile && <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Dokumentas</TableCell>}
                <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Kontrahentas</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12 }} align="right">Suma</TableCell>
                {!isMobile && <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Korespondencija</TableCell>}
                <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Statusas</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => (
                <DkIrasasRow key={entry.id} entry={entry} isMobile={isMobile} onOpenManual={openManualDk} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <DkDocsScrollLoader hasMore={hasMore} loadingMore={loadingMore} onLoadMore={loadMore} totalLoaded={entries.length} totalCount={totalCount} />
        </>
      )}

      <ManualDkDialog
        open={manualDialog.open}
        entry={manualDialog.entry}
        copyMode={manualDialog.copyMode}
        onClose={closeManualDk}
        onCopy={copyManualDk}
        onSaved={async () => {
          await loadEntries();
          onChanged?.();
        }}
        onDeleted={async () => {
          await loadEntries();
          onChanged?.();
        }}
      />
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════
// Main page
// ═══════════════════════════════════════════════════════════

export default function ApskaitosCentrasPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [user, setUser] = useState(null);
  const [view, setView] = useState(VIEW.OVERVIEW);
  const [period, setPeriod] = useState(currentPeriod());
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [accountingRefreshKey, setAccountingRefreshKey] = useState(0);

  const resolvedDateFrom = period === "custom" && dateFrom && dayjs(dateFrom).isValid()
    ? dayjs(dateFrom).format("YYYY-MM-DD")
    : null;
  const resolvedDateTo = period === "custom" && dateTo && dayjs(dateTo).isValid()
    ? dayjs(dateTo).format("YYYY-MM-DD")
    : null;
  const customDatesReady = period !== "custom" || (resolvedDateFrom && resolvedDateTo);

  useEffect(() => {
    api
      .get("/me/", { withCredentials: true })
      .then(({ data }) => setUser(data))
      .catch(() => setUser(false));
  }, []);

  const activeProfileId = user?.active_company_profile_id;
  const activeProfile = user?.company_profiles?.find((p) => p.id === activeProfileId);

  useEffect(() => {
    if (!activeProfileId || !customDatesReady) return;

    setSummaryLoading(true);

    api
      .get("/apskaita/summary/", {
        params: period !== "custom"
          ? { period }
          : { date_from: resolvedDateFrom, date_to: resolvedDateTo },
        withCredentials: true,
      })
      .then(({ data }) => setSummary(data))
      .catch(() => setSummary(null))
      .finally(() => setSummaryLoading(false));
  }, [activeProfileId, period, resolvedDateFrom, resolvedDateTo, accountingRefreshKey]);

  if (user === null) {
    return (
      <Box sx={{ p: isMobile ? 2 : 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (!activeProfileId) {
    return (
      <Box sx={{ p: isMobile ? 2 : 4 }}>
        <Alert severity="info">Pasirinkite įmonės profilį, kad matyti apskaitą.</Alert>
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="lt">
    <Box sx={{ p: isMobile ? 2 : 4 }}>
      <Helmet>
        <title>Apskaitos centras - DokSkenas</title>
      </Helmet>

      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          mb: 2.5,
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Box>
          <Typography
            variant={isMobile ? "h6" : "h5"}
            sx={{ fontWeight: 800, lineHeight: 1.2 }}
          >
            Apskaitos centras
          </Typography>

          <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.5 }}>
            Skolos, sąskaitų likučiai ir DK įrašai vienoje vietoje
            {activeProfile?.name ? ` — ${activeProfile.name}` : ""}
          </Typography>
        </Box>

        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Laikotarpis</InputLabel>
            <Select
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                if (e.target.value !== "custom") {
                  setDateFrom(null);
                  setDateTo(null);
                } else {
                  setDateFrom(dayjs().startOf("year"));
                  setDateTo(dayjs());
                }
              }}
              label="Laikotarpis"
              MenuProps={{ disableScrollLock: true }}
            >
              {PERIOD_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {period === "custom" && (
            <>
              <DatePicker
                label="Nuo"
                value={dateFrom}
                onChange={setDateFrom}
                format="YYYY-MM-DD"
                slotProps={{
                  textField: { size: "small", sx: { width: 155 } },
                  popper: { disablePortal: false },
                }}
              />
              <DatePicker
                label="Iki"
                value={dateTo}
                onChange={setDateTo}
                format="YYYY-MM-DD"
                slotProps={{
                  textField: { size: "small", sx: { width: 155 } },
                  popper: { disablePortal: false },
                }}
              />
            </>
          )}
        </Box>
      </Box>

      <VisualTabs value={view} onChange={setView} />

      {view === VIEW.OVERVIEW && (
        <ApzvalgaTab summary={summary} loading={summaryLoading} setView={setView} />
      )}

      {view === VIEW.DEBTS && (
        <SkolosTab activeProfileId={activeProfileId} period={period} dateFrom={resolvedDateFrom} dateTo={resolvedDateTo} />
      )}

      {view === VIEW.BALANCES && (
        <LikuciaiTab activeProfileId={activeProfileId} period={period} dateFrom={resolvedDateFrom} dateTo={resolvedDateTo} />
      )}

      {view === VIEW.ENTRIES && (
        <DkIrasaiTab activeProfileId={activeProfileId} period={period} dateFrom={resolvedDateFrom} dateTo={resolvedDateTo} onChanged={() => setAccountingRefreshKey((prev) => prev + 1)} />
      )}
    </Box>
    </LocalizationProvider>
  );
}