import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import "dayjs/locale/lt";

import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import ZoomableImage from "../pages/ZoomableImage";
import EditableCell from "../components/EditableCell";
import EditableAutoCell from "../components/EditableAutoCell";
import { api } from "../api/endpoints";
import { EXTRA_FIELDS_CONFIG } from "../pages/extraFieldsConfig";
import {
  getAccountName,
  PIRKIMO_OPTIONS,
} from "../components/KorespondencijaComponents";

/* ═══════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════ */

const CREDIT_OPTIONS = [
  { label: "4430 Skolos tiekėjams", value: "4430" },
  { label: "4480 Kitos mokėtinos sumos", value: "4480" },
  { label: "2080 Avansai tiekėjams", value: "2080" },
];

const PVM_OPTIONS = [
  { label: "2441 Gautinas PVM", value: "2441" },
  { label: "2442 Atskaitomas PVM", value: "2442" },
  { label: "— Be PVM sąskaitos", value: "" },
];

const FIELD_FALLBACKS = {
  debeto_saskaita: "6312",
  kredito_saskaita: "4430",
  pvm_saskaita: "2441",
};

const LINE_ITEMS_LIMIT = 30;

const CURRENCIES = [
  "EUR", "USD", "GBP", "AED", "AUD", "BGN", "CAD", "CHF", "CNY", "CZK",
  "DKK", "GEL", "HUF", "ILS", "INR", "ISK", "JPY", "KRW", "MXN", "NOK",
  "NZD", "PLN", "RON", "RSD", "RUB", "SEK", "SGD", "THB", "TRY", "UAH", "ZAR",
];

const PVM_KLASE_OPTIONS = [
  "PVM1", "PVM2", "PVM3", "PVM25", "PVM26", "PVM27",
  "PVM5", "PVM6", "PVM7", "PVM8", "PVM28", "PVM29",
  "PVM9", "PVM30", "PVM31", "PVM32", "PVM33",
  "PVM12", "PVM13", "PVM14", "PVM15", "PVM34",
  "PVM16", "PVM17", "PVM18", "PVM35", "PVM36",
  "PVM19", "PVM20", "PVM37", "PVM38", "PVM39",
  "PVM21", "PVM40", "PVM41", "PVM42", "PVM43",
  "PVM44", "PVM45", "PVM46", "PVM47",
  "PVM23", "PVM24", "PVM48", "PVM49", "PVM100",
  "PVM50", "PVM51", "PVM52", "PVM53", "PVM54",
  "PVM55", "PVM56", "PVM57", "PVM58", "PVM59", "PVM60",
];

const SEPARATE_VAT_LABEL = "Keli skirtingi PVM %";

const ltEilutes = (n) => {
  const num = Math.abs(Number(n) || 0);
  const last2 = num % 100;
  const last1 = num % 10;
  if (last2 >= 11 && last2 <= 19) return "eilučių";
  if (last1 === 1) return "eilutė";
  if (last1 >= 2 && last1 <= 9) return "eilutės";
  return "eilučių";
};

const errorFieldSx = {
  border: "1.5px solid #d32f2f",
  borderRadius: "4px",
  boxShadow: "0 0 4px 1px rgba(211, 47, 47, 0.25)",
  px: 0.5,
};

/* ═══════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════ */

function fmtAmount(val, currency = "EUR") {
  if (val == null || val === "") return "—";
  const num = Number(val);
  if (Number.isNaN(num)) return "—";
  return `${num.toLocaleString("lt-LT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency || "EUR"}`;
}

function fmtNum(value) {
  if (value === null || value === undefined || value === "") return "—";
  let num = Number(value);
  if (isNaN(num)) return value;
  let [int, dec = ""] = num.toFixed(4).split(".");
  if (dec.length < 4) dec = dec.padEnd(4, "0");
  if (dec[2] === "0" && dec[3] === "0") {
    return `${int}.${dec.slice(0, 2)}`;
  }
  return `${int}.${dec}`;
}

function normalizeSelectValue(raw) {
  if (raw && typeof raw === "object") return raw.value ?? "";
  return raw ?? "";
}

function accountLabel(code) {
  if (!code) return "—";
  return `${code} ${getAccountName(code) || ""}`.trim();
}

const ensureDate = (v) => {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Formatas: YYYY-MM-DD");
  return s;
};

const ensureNumber = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error("Turi būti skaičius");
  return n;
};

const normVal = (v) => {
  if (v === "" || v === undefined) return null;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) {
    const t = v.trim();
    if (t.length > 1 && t[0] === "0" && t[1] !== ".") return t;
    return Number(v);
  }
  return v;
};

const isFieldFilled = (value, allowZero = true) => {
  if (value == null) return false;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (!allowZero) {
      const num = parseFloat(trimmed);
      if (!isNaN(num) && num === 0) return false;
    }
    return true;
  }
  if (typeof value === "number") {
    if (!allowZero && value === 0) return false;
    return true;
  }
  return Boolean(value);
};

const getMissingDocFields = (doc) => {
  if (!doc) return new Set();
  const missing = new Set();
  const canBeZero = [
    "seller_name", "invoice_date", "currency",
    "document_number", "vat_amount",
  ];
  if (!doc.separate_vat) canBeZero.push("vat_percent");
  const cannotBeZero = ["amount_wo_vat", "amount_with_vat"];
  for (const f of canBeZero) {
    if (!isFieldFilled(doc[f], true)) missing.add(f);
  }
  for (const f of cannotBeZero) {
    if (!isFieldFilled(doc[f], false)) missing.add(f);
  }
  return missing;
};

const getMissingLineFields = (line) => {
  if (!line) return new Set();
  const missing = new Set();
  for (const f of ["price", "quantity", "vat"]) {
    if (!isFieldFilled(line[f], true)) missing.add(f);
  }
  for (const f of ["subtotal", "total"]) {
    if (!isFieldFilled(line[f], false)) missing.add(f);
  }
  return missing;
};

const hasAnyLineItemErrors = (items) => {
  if (!items || items.length === 0) return false;
  return items.some((l) => getMissingLineFields(l).size > 0);
};

const mapVatStatus = (s) => {
  if (s === "valid")
    return { label: "PVM galioja", color: "success", icon: <CheckCircleIcon /> };
  if (s === "invalid")
    return { label: "PVM negalioja", color: "error", icon: <ErrorIcon /> };
  return null;
};

/* ═══════════════════════════════════════════════════════════
   Korespondencija helpers
   ═══════════════════════════════════════════════════════════ */

function groupByAccount(lines, field, amountField, fallback) {
  const groups = {};

  for (const line of lines || []) {
    // Korespondencijoje suma visada rodoma teigiama.
    // Kreditinės kryptis valdoma per D/K, o ne minuso ženklu.
    const amount = Math.abs(
      Number(line?.[amountField] || 0)
    );

    if (!amount) continue;

    const code = line?.[field] || fallback;

    if (!groups[code]) {
      groups[code] = {
        code,
        suma: 0,
        count: 0,
      };
    }

    groups[code].suma += amount;
    groups[code].count += 1;
  }

  return Object.values(groups).sort((a, b) =>
    String(a.code).localeCompare(String(b.code))
  );
}

function buildKorLines(purchase, loadedLineItems) {
  if (!purchase) return [];

  const items =
    loadedLineItems?.length > 0
      ? loadedLineItems
      : Array.isArray(purchase.line_items)
        ? purchase.line_items
        : [];

  const hasLines = items.length > 0;

  const isCredit =
    purchase.is_credit_invoice === true;

  /*
   * Įprastas pirkimas:
   * D sąnaudos
   * D gautinas PVM
   * K skola tiekėjui
   *
   * Kreditinis pirkimas:
   * K sąnaudos
   * K gautinas PVM
   * D skola tiekėjui
   */
  const debitAccountSide = isCredit ? "K" : "D";
  const creditAccountSide = isCredit ? "D" : "K";

  const docDebit =
    purchase.debeto_saskaita ||
    FIELD_FALLBACKS.debeto_saskaita;

  const docCredit =
    purchase.kredito_saskaita ||
    FIELD_FALLBACKS.kredito_saskaita;

  const docPvm =
    purchase.pvm_saskaita ||
    (
      Number(purchase.vat_amount || 0) !== 0
        ? FIELD_FALLBACKS.pvm_saskaita
        : null
    );

  const lines = [];

  if (hasLines) {
    groupByAccount(
      items,
      "debeto_saskaita",
      "subtotal",
      docDebit,
    ).forEach((group) => {
      lines.push({
        side: debitAccountSide,
        code: group.code,
        name: getAccountName(group.code),
        suma: group.suma,
        count: group.count,
      });
    });

    if (docPvm) {
      groupByAccount(
        items,
        "pvm_saskaita",
        "vat",
        docPvm,
      ).forEach((group) => {
        if (!group.code) return;

        lines.push({
          side: debitAccountSide,
          code: group.code,
          name: getAccountName(group.code),
          suma: group.suma,
          count: group.count,
        });
      });
    }

    groupByAccount(
      items,
      "kredito_saskaita",
      "total",
      docCredit,
    ).forEach((group) => {
      lines.push({
        side: creditAccountSide,
        code: group.code,
        name: getAccountName(group.code),
        suma: group.suma,
        count: group.count,
      });
    });

    return lines;
  }

  const woVat = Math.abs(
    Number(purchase.amount_wo_vat || 0)
  );

  const vatAmt = Math.abs(
    Number(purchase.vat_amount || 0)
  );

  const withVat = Math.abs(
    Number(purchase.amount_with_vat || 0)
  );

  if (woVat) {
    lines.push({
      side: debitAccountSide,
      code: docDebit,
      name: getAccountName(docDebit),
      suma: woVat,
      count: null,
    });
  }

  if (vatAmt && docPvm) {
    lines.push({
      side: debitAccountSide,
      code: docPvm,
      name: getAccountName(docPvm),
      suma: vatAmt,
      count: null,
    });
  }

  if (withVat) {
    lines.push({
      side: creditAccountSide,
      code: docCredit,
      name: getAccountName(docCredit),
      suma: withVat,
      count: null,
    });
  }

  return lines;
}

function calcBalance(entries) {
  const totalD = entries
    .filter((e) => e.side === "D")
    .reduce((s, e) => s + Number(e.amount || e.suma || 0), 0);
  const totalK = entries
    .filter((e) => e.side === "K")
    .reduce((s, e) => s + Number(e.amount || e.suma || 0), 0);
  return Math.abs(totalD - totalK) < 0.02;
}

/* ═══════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════ */

function BalanceChip({ balanced, sx = {} }) {
  return (
    <Chip
      icon={balanced ? <CheckCircleIcon /> : <ErrorIcon />}
      label={balanced ? "Subalansuota" : "Nesubalansuota"}
      color={balanced ? "success" : "warning"}
      size="small"
      variant="outlined"
      sx={{
        fontSize: "0.68rem",
        height: 20,
        "& .MuiChip-icon": { fontSize: "0.85rem" },
        "& .MuiChip-label": { px: 0.75 },
        ...sx,
      }}
    />
  );
}

/* ─── Kor Mini Table (editable D/K rows with header) ──── */

function KorMiniTable({ entries, currency, disabled, title }) {
  const balanced = calcBalance(entries);

  return (
    <Box sx={{ mt: 1.5 }}>
      {title && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mb: 0.75,
          }}
        >
          <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
            {title}
          </Typography>
          <BalanceChip balanced={balanced} />
        </Box>
      )}

      <Box
        sx={{
          borderRadius: 1.5,
          border: "1px solid",
          borderColor: "divider",
          overflow: "hidden",
        }}
      >
        {entries.map((entry, idx) => (
          <Box
            key={`${entry.side}-${entry.field}-${idx}`}
            sx={{
              display: "grid",
              gridTemplateColumns: "36px 1fr 100px",
              px: 1,
              py: 0.6,
              alignItems: "center",
              borderBottom: idx < entries.length - 1 ? "1px solid" : "none",
              borderColor: "divider",
            }}
          >
            <Box>
              <Box
                component="span"
                sx={{
                  fontSize: 10,
                  fontWeight: 700,
                  px: 0.5,
                  py: 0.15,
                  borderRadius: 0.75,
                  bgcolor: entry.side === "D" ? "#EFF6FF" : "#FEF2F2",
                  color: entry.side === "D" ? "#2563EB" : "#DC2626",
                }}
              >
                {entry.side}
              </Box>
            </Box>

            <EditableCell
              value={entry.code || ""}
              inputType="select"
              options={entry.options}
              getOptionLabel={(o) => o.label}
              onSave={async (raw) => {
                await entry.onSave(normalizeSelectValue(raw) || null);
              }}
              renderDisplay={() => (
                <Typography
                  component="span"
                  sx={{ fontSize: 12, fontWeight: 600 }}
                >
                  {accountLabel(entry.code)}
                </Typography>
              )}
              sx={{
                minWidth: 200,
                pointerEvents: disabled ? "none" : "auto",
                opacity: disabled ? 0.65 : 1,
                "& .MuiAutocomplete-root": { minWidth: 200 },
              }}
            />

            <Typography
              sx={{ fontSize: 12, fontWeight: 700, textAlign: "right" }}
            >
              {fmtAmount(entry.amount, currency)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/* ─── Kor Summary Table (read-only aggregated) ──────────── */

function KorSummaryTable({ purchase, loadedLineItems }) {
  const lines = useMemo(
    () => buildKorLines(purchase, loadedLineItems),
    [purchase, loadedLineItems],
  );

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "42px 72px 1fr 100px",
          px: 1.25,
          py: 0.65,
          bgcolor: "#fafafa",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography sx={{ fontSize: 10, fontWeight: 700, color: "text.secondary" }}>D/K</Typography>
        <Typography sx={{ fontSize: 10, fontWeight: 700, color: "text.secondary" }}>Kodas</Typography>
        <Typography sx={{ fontSize: 10, fontWeight: 700, color: "text.secondary" }}>Pavadinimas</Typography>
        <Typography sx={{ fontSize: 10, fontWeight: 700, color: "text.secondary", textAlign: "right" }}>Suma</Typography>
      </Box>

      {lines.length === 0 ? (
        <Box sx={{ px: 1.25, py: 1.25 }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            Nėra korespondencijų
          </Typography>
        </Box>
      ) : (
        lines.map((line, idx) => (
          <Box
            key={`${line.side}-${line.code}-${idx}`}
            sx={{
              display: "grid",
              gridTemplateColumns: "42px 72px 1fr 100px",
              px: 1.25,
              py: 0.8,
              alignItems: "center",
              borderBottom: idx < lines.length - 1 ? "1px solid" : "none",
              borderColor: "divider",
            }}
          >
            <Box>
              <Box
                component="span"
                sx={{
                  fontSize: 10, fontWeight: 700, px: 0.6, py: 0.2,
                  borderRadius: 0.75,
                  bgcolor: line.side === "D" ? "#EFF6FF" : "#FEF2F2",
                  color: line.side === "D" ? "#2563EB" : "#DC2626",
                }}
              >
                {line.side}
              </Box>
            </Box>
            <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{line.code}</Typography>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              {line.name}
              {line.count != null && (
                <Box component="span" sx={{ ml: 0.5, fontSize: 10, fontWeight: 700, color: "text.secondary" }}>
                  ({line.count} eil.)
                </Box>
              )}
            </Typography>
            <Typography sx={{ fontSize: 12, fontWeight: 700, textAlign: "right" }}>
              {fmtAmount(line.suma, purchase.currency)}
            </Typography>
          </Box>
        ))
      )}
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════ */

export default function PurchasePreviewDialog({
  open,
  onClose,
  purchaseId,
  activeProfileId,
  onUpdated,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [purchase, setPurchase] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [savingKey, setSavingKey] = useState(null);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);

  const [lineItemsExpanded, setLineItemsExpanded] = useState(false);
  const [lineItemsLoaded, setLineItemsLoaded] = useState([]);
  const [lineItemsOffset, setLineItemsOffset] = useState(0);
  const [lineItemsTotal, setLineItemsTotal] = useState(0);
  const [lineItemsLoading, setLineItemsLoading] = useState(false);
  const [lineItemsLoadingMore, setLineItemsLoadingMore] = useState(false);

  const lineItemsContainerRef = useRef(null);
  const accordionRef = useRef(null);
  const lineItemsReqLockRef = useRef(false);

  const lineItemsCount = lineItemsTotal || purchase?.line_items_count || purchase?.line_items?.length || 0;
  const hasLineItems = lineItemsCount > 0;

  /* ── Validation ── */

  const showFieldErrors = purchase?.ready_for_export === false;

  const missingDocFields = useMemo(() => {
    if (!showFieldErrors) return new Set();
    return getMissingDocFields(purchase);
  }, [
    showFieldErrors, purchase?.seller_name, purchase?.invoice_date,
    purchase?.currency, purchase?.document_number, purchase?.vat_amount,
    purchase?.vat_percent, purchase?.amount_wo_vat, purchase?.amount_with_vat,
    purchase?.separate_vat,
  ]);

  const lineItemsHaveErrors = useMemo(() => {
    if (!showFieldErrors) return false;
    return hasAnyLineItemErrors(lineItemsLoaded);
  }, [showFieldErrors, lineItemsLoaded]);

  const getDocErrSx = useCallback(
    (fieldName) =>
      showFieldErrors && missingDocFields.has(fieldName) ? errorFieldSx : {},
    [showFieldErrors, missingDocFields],
  );

  /* ── Overall balance ── */

  const overallBalanced = useMemo(() => {
    const korLines = buildKorLines(purchase, lineItemsLoaded);
    return calcBalance(korLines);
  }, [purchase, lineItemsLoaded]);

  /* ── Aggregated PVM klasė / PVM % from line items ── */

  const aggregatedPvmKlase = useMemo(() => {
    if (!hasLineItems) return null;
    if (lineItemsLoaded.length === 0) return purchase?.pvm_kodas || null;
    const codes = new Set(
      lineItemsLoaded.map((l) => l.pvm_kodas).filter(Boolean)
    );
    if (codes.size === 0) return null;
    if (codes.size === 1) return [...codes][0];
    return SEPARATE_VAT_LABEL;
  }, [hasLineItems, lineItemsLoaded, purchase?.pvm_kodas]);

  const aggregatedVatPercent = useMemo(() => {
    if (!hasLineItems) return null;
    if (lineItemsLoaded.length === 0) return purchase?.vat_percent;
    const percents = new Set(
      lineItemsLoaded
        .map((l) => (l.vat_percent != null ? String(l.vat_percent) : null))
        .filter(Boolean)
    );
    if (percents.size === 0) return null;
    if (percents.size === 1) return lineItemsLoaded[0].vat_percent;
    return "SEPARATE";
  }, [hasLineItems, lineItemsLoaded, purchase?.vat_percent]);

  /* ── Load purchase ── */

  const loadPurchase = useCallback(async () => {
    if (!open || !purchaseId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await api.get(`/purchases/${purchaseId}/`, {
        withCredentials: true,
        params: activeProfileId ? { company_profile: activeProfileId } : {},
      });
      setPurchase(data);
      setLineItemsTotal(data.line_items_count || data.line_items?.length || 0);
    } catch (e) {
      console.error("Failed to load purchase:", e);
      setLoadError("Nepavyko gauti pirkimo dokumento");
    } finally {
      setLoading(false);
    }
  }, [open, purchaseId, activeProfileId]);

  useEffect(() => {
    if (open) {
      loadPurchase();
      setLineItemsExpanded(false);
      setLineItemsLoaded([]);
      setLineItemsOffset(0);
      setLineItemsTotal(0);
    } else {
      setPurchase(null);
      setLoadError(null);
      setPreviewFullscreen(false);
      setLineItemsExpanded(false);
      setLineItemsLoaded([]);
      setLineItemsOffset(0);
      setLineItemsTotal(0);
    }
  }, [open, loadPurchase]);

  /* ── Line items lazy loading ── */

  const loadLineItems = useCallback(async (pid, offset = 0, append = false) => {
    if (lineItemsReqLockRef.current) return;
    lineItemsReqLockRef.current = true;
    if (append) setLineItemsLoadingMore(true);
    else setLineItemsLoading(true);

    try {
      const res = await api.get(`/purchases/${pid}/line-items/`, {
        params: { limit: LINE_ITEMS_LIMIT, offset },
        withCredentials: true,
      });
      const { results = [], count = 0 } = res.data || {};
      setLineItemsTotal(count);
      setLineItemsLoaded((prev) => {
        const next = append ? [...prev, ...results] : results;
        const map = new Map();
        for (const x of next) map.set(String(x.id), x);
        return Array.from(map.values());
      });
      setLineItemsOffset((prev) =>
        append ? prev + results.length : results.length,
      );
    } catch (e) {
      console.error("Failed to load line items:", e);
    } finally {
      lineItemsReqLockRef.current = false;
      setLineItemsLoading(false);
      setLineItemsLoadingMore(false);
    }
  }, []);

  const loadMore = useCallback(() => {
    if (!purchase?.id || lineItemsOffset >= lineItemsTotal) return;
    loadLineItems(purchase.id, lineItemsOffset, true);
  }, [purchase?.id, lineItemsOffset, lineItemsTotal, loadLineItems]);

  useEffect(() => {
    const container = lineItemsContainerRef.current;
    if (!container || !lineItemsExpanded) return;
    const handleScroll = () => {
      if (lineItemsLoading || lineItemsLoadingMore) return;
      if (lineItemsLoaded.length >= lineItemsTotal) return;
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop - clientHeight < 200) loadMore();
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [lineItemsExpanded, loadMore, lineItemsLoading, lineItemsLoadingMore, lineItemsLoaded.length, lineItemsTotal]);

  /* ── Save helpers ── */

  const saveDocField = async (field, rawValue) => {
    if (!purchase?.id) return;
    const value = normVal(rawValue);
    try {
      const { data } = await api.patch(
        `/purchases/${purchase.id}/inline/`,
        { field, value },
        { withCredentials: true },
      );
      setPurchase((prev) => ({
        ...prev,
        [field]: data[field],

        ...(data.ready_for_export !== undefined && {
          ready_for_export: data.ready_for_export,
        }),

        ...(data.math_validation_passed !== undefined && {
          math_validation_passed: data.math_validation_passed,
        }),

        ...(data.kor_balanced !== undefined && {
          kor_balanced: data.kor_balanced,
        }),

        ...(data.separate_vat !== undefined && {
          separate_vat: data.separate_vat,
        }),
      }));

      await onUpdated?.(purchase.id);
    } catch (e) {
      console.error("Failed to save field:", e);
      alert("Nepavyko išsaugoti: " + (e?.response?.data?.detail || e.message));
    }
  };

  const saveLineField = async (lineId, field, rawValue) => {
    if (!purchase?.id || !lineId) return;

    const value = normVal(rawValue);

    try {
      const { data } = await api.patch(
        `/purchases/${purchase.id}/line-items/${lineId}/inline/`,
        { field, value },
        { withCredentials: true },
      );

      // Обновляем изменённую строку внутри preview
      setLineItemsLoaded((prev) =>
        prev.map((li) =>
          String(li.id) === String(lineId)
            ? {
                ...li,
                [field]: data[field],
              }
            : li,
        ),
      );

      // Обновляем в preview статусы, если backend их вернул
      if (
        data.math_validation_passed !== undefined ||
        data.ready_for_export !== undefined ||
        data.kor_balanced !== undefined ||
        data.separate_vat !== undefined
      ) {
        setPurchase((prev) => ({
          ...prev,

          ...(data.math_validation_passed !== undefined && {
            math_validation_passed: data.math_validation_passed,
          }),

          ...(data.ready_for_export !== undefined && {
            ready_for_export: data.ready_for_export,
          }),

          ...(data.kor_balanced !== undefined && {
            kor_balanced: data.kor_balanced,
          }),

          ...(data.separate_vat !== undefined && {
            separate_vat: data.separate_vat,
          }),
        }));
      }

      // Обновляем строку документа в основной таблице
      await onUpdated?.(purchase.id);
    } catch (e) {
      console.error("Failed to save line field:", e);

      alert(
        "Nepavyko išsaugoti eilutės: " +
          (e?.response?.data?.detail || e.message),
      );
    }
  };

  const patchBulk = async (patch) => {
    if (!purchase?.id) return;
    setSavingKey("bulk");
    try {
      const { data } = await api.patch(
        `/purchases/${purchase.id}/`,
        patch,
        {
          withCredentials: true,
        },
      );

      setPurchase(data);

      await onUpdated?.(purchase.id);
    } catch (e) {
      console.error("Failed to update purchase:", e);
      alert("Nepavyko išsaugoti: " + (e?.response?.data?.detail || e.message));
    } finally {
      setSavingKey(null);
    }
  };

  /* ── Seller autocomplete ── */

  const handleSellerSelect = async (valueObj) => {
    if (!valueObj || !purchase?.id) return;
    await patchBulk({
      seller_name: valueObj.pavadinimas,
      seller_id: valueObj.imones_kodas,
      seller_vat_code: valueObj.pvm_kodas,
      seller_iban: valueObj.ibans,
    });
  };

  const handleSellerClear = async () => {
    if (!purchase?.id) return;
    await patchBulk({ seller_name: "", seller_id: "", seller_vat_code: "", seller_iban: "" });
  };

  /* ── Add / delete line items ── */

  const addLineItem = async () => {
    if (!purchase?.id) return;

    try {
      const { data } = await api.post(
        `/purchases/${purchase.id}/add-line-item/`,
        {},
        {
          withCredentials: true,
        },
      );

      setLineItemsLoaded((prev) => [...prev, data]);
      setLineItemsTotal((prev) => prev + 1);

      setPurchase((prev) => ({
        ...prev,
        line_items_count: (prev.line_items_count || 0) + 1,
      }));

      // Обновляем основную таблицу
      await onUpdated?.(purchase.id);

      setTimeout(() => {
        const el = lineItemsContainerRef.current;

        if (el) {
          el.scrollTop = el.scrollHeight;
        }
      }, 0);
    } catch (e) {
      console.error("Failed to add line:", e);

      alert(
        "Nepavyko pridėti eilutės: " +
          (e?.response?.data?.detail || e.message),
      );
    }
  };

  const deleteLineItem = async (lineId) => {
    if (!purchase?.id || lineItemsLoaded.length <= 1) return;

    if (!window.confirm("Ar tikrai norite ištrinti eilutę?")) {
      return;
    }

    try {
      await api.delete(
        `/purchases/${purchase.id}/delete-line-item/${lineId}/`,
        {
          withCredentials: true,
        },
      );

      setLineItemsLoaded((prev) =>
        prev.filter((li) => String(li.id) !== String(lineId)),
      );

      setLineItemsTotal((prev) =>
        Math.max(0, prev - 1),
      );

      setLineItemsOffset((prev) =>
        Math.max(0, prev - 1),
      );

      setPurchase((prev) => ({
        ...prev,
        line_items_count: Math.max(
          0,
          (prev.line_items_count || 1) - 1,
        ),
      }));

      // Обновляем основную таблицу
      await onUpdated?.(purchase.id);
    } catch (e) {
      console.error("Failed to delete line:", e);

      alert(
        "Nepavyko ištrinti eilutės: " +
          (e?.response?.data?.detail || e.message),
      );
    }
  };

  /* ── Accordion handler ── */

  const handleAccordionChange = (_, expanded) => {
    setLineItemsExpanded(expanded);
    if (!expanded) { setLineItemsLoaded([]); setLineItemsOffset(0); return; }
    setLineItemsLoaded([]);
    setLineItemsOffset(0);
    if (purchase?.id && lineItemsCount > 0) loadLineItems(purchase.id, 0, false);
    if (accordionRef.current) {
      setTimeout(() => accordionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    }
  };

  /* ── Build kor entries ── */

  const buildLineKorEntries = (line) => {
    const isCredit =
      purchase?.is_credit_invoice === true;

    const debitAccountSide = isCredit ? "K" : "D";
    const creditAccountSide = isCredit ? "D" : "K";

    const entries = [
      {
        side: debitAccountSide,
        field: "debeto_saskaita",
        code:
          line.debeto_saskaita ||
          FIELD_FALLBACKS.debeto_saskaita,
        options: PIRKIMO_OPTIONS,
        amount: Math.abs(
          Number(line.subtotal || 0)
        ),
        onSave: (value) =>
          saveLineField(
            line.id,
            "debeto_saskaita",
            value,
          ),
      },
    ];

    if (Number(line.vat || 0) !== 0) {
      entries.push({
        side: debitAccountSide,
        field: "pvm_saskaita",
        code:
          line.pvm_saskaita ||
          FIELD_FALLBACKS.pvm_saskaita,
        options: PVM_OPTIONS,
        amount: Math.abs(
          Number(line.vat || 0)
        ),
        onSave: (value) =>
          saveLineField(
            line.id,
            "pvm_saskaita",
            value,
          ),
      });
    }

    entries.push({
      side: creditAccountSide,
      field: "kredito_saskaita",
      code:
        line.kredito_saskaita ||
        FIELD_FALLBACKS.kredito_saskaita,
      options: CREDIT_OPTIONS,
      amount: Math.abs(
        Number(line.total || 0)
      ),
      onSave: (value) =>
        saveLineField(
          line.id,
          "kredito_saskaita",
          value,
        ),
    });

    return entries;
  };

  const buildDocKorEntries = () => {
    if (!purchase) return [];

    const isCredit =
      purchase.is_credit_invoice === true;

    const debitAccountSide = isCredit ? "K" : "D";
    const creditAccountSide = isCredit ? "D" : "K";

    const entries = [
      {
        side: debitAccountSide,
        field: "debeto_saskaita",
        code:
          purchase.debeto_saskaita ||
          FIELD_FALLBACKS.debeto_saskaita,
        options: PIRKIMO_OPTIONS,
        amount: Math.abs(
          Number(purchase.amount_wo_vat || 0)
        ),
        onSave: (value) =>
          saveDocField(
            "debeto_saskaita",
            value,
          ),
      },
    ];

    if (Number(purchase.vat_amount || 0) !== 0) {
      entries.push({
        side: debitAccountSide,
        field: "pvm_saskaita",
        code:
          purchase.pvm_saskaita ||
          FIELD_FALLBACKS.pvm_saskaita,
        options: PVM_OPTIONS,
        amount: Math.abs(
          Number(purchase.vat_amount || 0)
        ),
        onSave: (value) =>
          saveDocField(
            "pvm_saskaita",
            value,
          ),
      });
    }

    entries.push({
      side: creditAccountSide,
      field: "kredito_saskaita",
      code:
        purchase.kredito_saskaita ||
        FIELD_FALLBACKS.kredito_saskaita,
      options: CREDIT_OPTIONS,
      amount: Math.abs(
        Number(purchase.amount_with_vat || 0)
      ),
      onSave: (value) =>
        saveDocField(
          "kredito_saskaita",
          value,
        ),
    });

    return entries;
  };

  /* ── Render helpers ── */

  const renderValidationFlags = () => {
    const r = purchase?.ready_for_export;
    const m = purchase?.math_validation_passed;
    return (
      <Box sx={{ mb: 2, display: "flex", gap: 1.5, flexWrap: "wrap" }}>
        <Chip
          icon={r === true ? <CheckCircleIcon /> : r === false ? <ErrorIcon /> : <HourglassEmptyIcon />}
          label={r === true ? "Duomenų pakanka" : r === false ? "Trūksta duomenų" : "Laukiama patvirtinimo"}
          color={r === true ? "success" : r === false ? "error" : "default"}
          variant={r == null ? "outlined" : "filled"}
          size="small"
          sx={{ fontSize: "0.8125rem", "& .MuiChip-icon": { fontSize: "1.1rem" } }}
        />
        <Chip
          icon={m === true ? <CheckCircleIcon /> : m === false ? <ErrorIcon /> : <HourglassEmptyIcon />}
          label={m === true ? "Sumos sutampa" : m === false ? "Sumos nesutampa" : "Laukiama patikrinimo"}
          color={m === true ? "success" : m === false ? "warning" : "default"}
          variant={m == null ? "outlined" : "filled"}
          size="small"
          sx={{ fontSize: "0.8125rem", "& .MuiChip-icon": { fontSize: "1.1rem" } }}
        />
        {purchase?.is_credit_invoice && (
          <Chip label="Kreditinė" size="small" sx={{ fontWeight: 700, height: 24, bgcolor: "#B7BDF7", color: "#2D3282" }} />
        )}
        {purchase?.is_debit_invoice && (
          <Chip label="Debetinė" size="small" sx={{ fontWeight: 700, height: 24, bgcolor: "#BBDCE5", color: "#1B4D5C" }} />
        )}
      </Box>
    );
  };

  const SELLER_FIELDS = [
    { name: "seller_name", label: "Pavadinimas" },
    { name: "seller_id", label: "Įmonės kodas" },
    { name: "seller_vat_code", label: "PVM kodas" },
  ];

  const renderSellerFields = () => {
    const vatMeta = mapVatStatus(purchase?.seller_vat_val);
    return (
      <Box sx={{ mb: 1 }}>
        <Typography sx={{ mb: 1, fontWeight: 700, fontSize: "0.95rem" }}>Tiekėjas</Typography>
        {SELLER_FIELDS.map((f) => {
          const isVatField = f.name === "seller_vat_code";
          const hasError = showFieldErrors && missingDocFields.has(f.name);
          return (
            <Box key={f.name} sx={{ mb: 1, ...(hasError && errorFieldSx) }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.25 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.75rem" }}>{f.label}</Typography>
                {isVatField && vatMeta && (
                  <Chip
                    icon={vatMeta.icon} label={vatMeta.label} color={vatMeta.color} size="small"
                    sx={{ height: 18, fontSize: "0.65rem", "& .MuiChip-label": { px: 0.5, pr: 1 }, "& .MuiChip-icon": { fontSize: "0.85rem", ml: 0.5, mr: 0.025 } }}
                  />
                )}
              </Box>
              <EditableAutoCell
                fieldName={f.name} label={f.label} value={purchase[f.name] || ""}
                searchUrl={EXTRA_FIELDS_CONFIG.client.find((c) => c.name === f.name.replace("seller_", "buyer_"))?.search}
                onSelect={handleSellerSelect}
                onManualSave={(text) => saveDocField(f.name, text || null)}
                onClear={handleSellerClear}
                sx={{ width: "100%", "& .MuiInputBase-root": { fontSize: "0.875rem" }, "& input": { fontSize: "0.875rem" } }}
              />
            </Box>
          );
        })}
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.75rem" }}>IBAN</Typography>
          <Typography component="div" sx={{ fontSize: 13 }}>
            <EditableCell value={purchase?.seller_iban} onSave={(v) => saveDocField("seller_iban", v)} />
          </Typography>
        </Box>
      </Box>
    );
  };

  /* ── Determine displayed PVM % and PVM klasė for doc level ── */

  const isSeparateVat = hasLineItems
    ? aggregatedVatPercent === "SEPARATE"
    : Boolean(purchase?.separate_vat);

  const displayedPvmKlase = hasLineItems
    ? aggregatedPvmKlase
    : purchase?.pvm_kodas;

  /* ── renderContent ── */

  const renderContent = () => {
    if (!purchase) return null;

    return (
      <>
        {renderValidationFlags()}

        <Typography gutterBottom sx={{ fontSize: "0.85rem" }}>
          Dokumento tipas: <b>{purchase.document_type || "PVM sąskaita faktūra"}</b>
        </Typography>

        {/* ── Korespondencija accordion ── */}
        <Accordion
          sx={{
            my: 1, boxShadow: "none", border: "0.5px solid", borderColor: "divider",
            borderRadius: "10px !important", "&:before": { display: "none" },
            "&.Mui-expanded": { my: 1 }, overflow: "hidden", bgcolor: "transparent",
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon sx={{ fontSize: 18 }} />}
            sx={{
              minHeight: 38, "&.Mui-expanded": { minHeight: 38 },
              "& .MuiAccordionSummary-content": { my: 0.5 },
              "& .MuiAccordionSummary-content.Mui-expanded": { my: 0.5 },
              px: 1.5, bgcolor: "#f3f3f3ab",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.secondary" }}>
                Korespondencija
              </Typography>
              <BalanceChip balanced={overallBalanced} />
            </Box>
          </AccordionSummary>

          <AccordionDetails sx={{ pt: 1, pb: 1.5, px: 1.5, bgcolor: "transparent" }}>
            {!hasLineItems ? (
              <KorMiniTable
                entries={buildDocKorEntries()}
                currency={purchase.currency}
                disabled={Boolean(savingKey)}
                title="Dokumento korespondencija"
              />
            ) : (
              <KorSummaryTable purchase={purchase} loadedLineItems={lineItemsLoaded} />
            )}
          </AccordionDetails>
        </Accordion>

        <Divider sx={{ my: 1.5 }} />

        {renderSellerFields()}

        <Divider sx={{ my: 1.5 }} />

        {/* ── Document fields ── */}
        <Stack spacing={0.5} mt={1} mb={1}>
          <Typography component="div">
            Sąskaitos data:{" "}
            <EditableCell
              value={purchase.invoice_date} inputType="date"
              onSave={(v) => saveDocField("invoice_date", ensureDate(v))}
              sx={getDocErrSx("invoice_date")}
            />
          </Typography>

          <Typography component="div">
            Mokėti iki:{" "}
            <EditableCell value={purchase.due_date} inputType="date" onSave={(v) => saveDocField("due_date", ensureDate(v))} />
          </Typography>

          <Typography component="div">
            Operacijos data:{" "}
            <EditableCell value={purchase.operation_date} inputType="date" onSave={(v) => saveDocField("operation_date", ensureDate(v))} />
          </Typography>

          <Typography component="div">
            Sąskaitos serija:{" "}
            <EditableCell value={purchase.document_series} onSave={(v) => saveDocField("document_series", v)} />
          </Typography>

          <Typography component="div">
            Sąskaitos numeris:{" "}
            <EditableCell value={purchase.document_number} onSave={(v) => saveDocField("document_number", v)} sx={getDocErrSx("document_number")} />
          </Typography>

          <Typography component="div">
            Užsakymo numeris:{" "}
            <EditableCell value={purchase.order_number} onSave={(v) => saveDocField("order_number", v)} />
          </Typography>

          <Typography component="div">
            Nuolaida sąskaitai (be PVM):{" "}
            <EditableCell value={purchase.invoice_discount_wo_vat} inputType="number" onSave={(v) => saveDocField("invoice_discount_wo_vat", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} />
          </Typography>

          <Typography component="div">
            Nuolaida sąskaitai (su PVM):{" "}
            <EditableCell value={purchase.invoice_discount_with_vat} inputType="number" onSave={(v) => saveDocField("invoice_discount_with_vat", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} />
          </Typography>

          <Typography component="div">
            Suma (be PVM):{" "}
            <EditableCell value={purchase.amount_wo_vat} inputType="number" onSave={(v) => saveDocField("amount_wo_vat", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} sx={getDocErrSx("amount_wo_vat")} />
          </Typography>

          <Typography component="div">
            PVM:{" "}
            <EditableCell value={purchase.vat_amount} inputType="number" onSave={(v) => saveDocField("vat_amount", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} sx={getDocErrSx("vat_amount")} />
          </Typography>

          <Typography component="div">
            PVM %:{" "}
            {isSeparateVat ? (
              <b>{SEPARATE_VAT_LABEL}</b>
            ) : (
              <EditableCell
                value={hasLineItems ? aggregatedVatPercent : purchase.vat_percent}
                inputType="number"
                onSave={(v) => saveDocField("vat_percent", ensureNumber(v))}
                renderDisplay={(v) => <b>{fmtNum(v)}</b>}
                sx={{
                  ...getDocErrSx("vat_percent"),
                  ...(hasLineItems && { pointerEvents: "none", opacity: 0.65 }),
                }}
              />
            )}
          </Typography>

          <Typography component="div">
            PVM klasė:{" "}
            {isSeparateVat ? (
              <b>{SEPARATE_VAT_LABEL}</b>
            ) : hasLineItems ? (
              <b>{displayedPvmKlase || "—"}</b>
            ) : (
              <EditableCell
                value={purchase.pvm_kodas || ""}
                inputType="select"
                options={PVM_KLASE_OPTIONS}
                onSave={(v) => saveDocField("pvm_kodas", v || null)}
                renderDisplay={() => (
                  <b>{purchase.pvm_kodas || "—"}</b>
                )}
              />
            )}
          </Typography>

          <Typography component="div">
            Suma (su PVM):{" "}
            <EditableCell value={purchase.amount_with_vat} inputType="number" onSave={(v) => saveDocField("amount_with_vat", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} sx={getDocErrSx("amount_with_vat")} />
          </Typography>

          <Typography component="div">
            Valiuta:{" "}
            <EditableCell value={purchase.currency} inputType="select" options={CURRENCIES} onSave={(v) => saveDocField("currency", v)} sx={getDocErrSx("currency")} />
          </Typography>

          {/* Product fields when no line items — below Valiuta */}
          {!hasLineItems && (
            <Box sx={{ mt: 1 }}>
              <Typography component="div" sx={{ mb: 0.5 }}>
                Prekės pavadinimas:{" "}
                <EditableCell value={purchase.prekes_pavadinimas} onSave={(v) => saveDocField("prekes_pavadinimas", v)} renderDisplay={(v) => <b>{v || "—"}</b>} />
              </Typography>
              <Typography component="div" sx={{ mb: 0.5 }}>
                Prekės kodas:{" "}
                <EditableCell value={purchase.prekes_kodas} onSave={(v) => saveDocField("prekes_kodas", v)} renderDisplay={(v) => <b>{v || "—"}</b>} />
              </Typography>
              <Typography component="div" sx={{ mb: 0.5 }}>
                Prekės barkodas:{" "}
                <EditableCell value={purchase.prekes_barkodas} onSave={(v) => saveDocField("prekes_barkodas", v)} renderDisplay={(v) => <b>{v || "—"}</b>} />
              </Typography>
            </Box>
          )}
        </Stack>

        <Divider sx={{ my: 2 }} />

        {/* ── Line items accordion ── */}
        {hasLineItems && (
          <Accordion
            ref={accordionRef} expanded={lineItemsExpanded} onChange={handleAccordionChange}
            disableGutters elevation={0}
            sx={{
              mt: 1, border: "1px solid", borderColor: "divider",
              borderRadius: "10px !important", overflow: "hidden",
              "&:before": { display: "none" }, bgcolor: "#fafafa",
              ...(lineItemsHaveErrors && {
                border: "1.5px solid #d32f2f",
                boxShadow: "0 0 6px 2px rgba(211, 47, 47, 0.3)",
                "& .MuiAccordionSummary-root": { backgroundColor: "rgba(211, 47, 47, 0.08)" },
              }),
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{
                minHeight: 48, "&.Mui-expanded": { minHeight: 48 },
                "& .MuiAccordionSummary-content": { my: 1 },
                "& .MuiAccordionSummary-content.Mui-expanded": { my: 1 },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
                  Prekė(s): {lineItemsCount} {ltEilutes(lineItemsCount)}
                </Typography>
                {lineItemsExpanded && lineItemsLoading && (
                  <CircularProgress size={22} thickness={8} sx={{ ml: 0.5 }} />
                )}
              </Box>
            </AccordionSummary>

            <AccordionDetails sx={{ p: 0 }}>
              <Box sx={{ display: "flex", justifyContent: "flex-end", px: 1.5, pt: 1 }}>
                <Button variant="outlined" size="small" onClick={addLineItem} sx={{ fontSize: "13px", textTransform: "none" }}>
                  + Pridėti eilutę
                </Button>
              </Box>

              <Box
                ref={lineItemsContainerRef}
                sx={{
                  maxHeight: isMobile ? 400 : 500,
                  overflowY: "auto", px: 1.5, pb: 3, pt: 1,
                  scrollbarGutter: "stable", WebkitOverflowScrolling: "touch",
                }}
              >
                <Stack spacing={1.5}>
                  {lineItemsLoaded.map((line, index) => {
                    const lineMissing = showFieldErrors ? getMissingLineFields(line) : new Set();
                    const getLineErrSx = (f) => (lineMissing.has(f) ? errorFieldSx : {});
                    const canDelete = lineItemsLoaded.length > 1;
                    const korEntries = buildLineKorEntries(line);

                    return (
                      <Box
                        key={line.id}
                        sx={{
                          p: isMobile ? 1.5 : 2, border: "1px solid",
                          borderColor: "divider", borderRadius: 2,
                          bgcolor: "#fff", position: "relative",
                        }}
                      >
                        <Tooltip title={canDelete ? "Ištrinti eilutę" : "Negalima ištrinti vienintelės eilutės"}>
                          <IconButton
                            size="small"
                            onClick={() => canDelete && deleteLineItem(line.id)}
                            disabled={!canDelete}
                            sx={{
                              position: "absolute", top: 6, right: 6,
                              color: "text.secondary",
                              "&:hover": canDelete ? { color: "error.main" } : undefined,
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>

                        <Typography sx={{ fontWeight: 100, mb: isMobile ? 2 : 2.5, fontStyle: "italic", fontSize: isMobile ? "0.9rem" : "inherit" }}>
                          {`Prekė #${index + 1}`}
                        </Typography>

                        {/* Product fields */}
                        <Typography component="div" sx={{ mb: 0.5 }}>
                          Prekės pavadinimas:{" "}
                          <EditableCell value={line.prekes_pavadinimas} onSave={(v) => saveLineField(line.id, "prekes_pavadinimas", v)} renderDisplay={(v) => <b>{v || "—"}</b>} />
                        </Typography>
                        <Typography component="div" sx={{ mb: 0.5 }}>
                          Prekės kodas:{" "}
                          <EditableCell value={line.prekes_kodas} onSave={(v) => saveLineField(line.id, "prekes_kodas", v)} renderDisplay={(v) => <b>{v || "—"}</b>} />
                        </Typography>
                        <Typography component="div" sx={{ mb: 1 }}>
                          Prekės barkodas:{" "}
                          <EditableCell value={line.prekes_barkodas} onSave={(v) => saveLineField(line.id, "prekes_barkodas", v)} renderDisplay={(v) => <b>{v || "—"}</b>} />
                        </Typography>

                        {/* Numeric fields */}
                        <Stack spacing={0.5} sx={{ mb: 1 }}>
                          <Typography component="div">
                            Mato vnt: <EditableCell value={line.unit} onSave={(v) => saveLineField(line.id, "unit", v)} />
                          </Typography>
                          <Typography component="div">
                            Kiekis: <EditableCell value={line.quantity} inputType="number" onSave={(v) => saveLineField(line.id, "quantity", v)} renderDisplay={(v) => <b>{fmtNum(v)}</b>} sx={getLineErrSx("quantity")} />
                          </Typography>
                          <Typography component="div">
                            Kaina: <EditableCell value={line.price} inputType="number" onSave={(v) => saveLineField(line.id, "price", v)} renderDisplay={(v) => <b>{fmtNum(v)}</b>} sx={getLineErrSx("price")} />
                          </Typography>
                          <Typography component="div">
                            Suma (be PVM): <EditableCell value={line.subtotal} inputType="number" onSave={(v) => saveLineField(line.id, "subtotal", v)} renderDisplay={(v) => <b>{fmtNum(v)}</b>} sx={getLineErrSx("subtotal")} />
                          </Typography>
                          <Typography component="div">
                            PVM: <EditableCell value={line.vat} inputType="number" onSave={(v) => saveLineField(line.id, "vat", v)} renderDisplay={(v) => <b>{fmtNum(v)}</b>} sx={getLineErrSx("vat")} />
                          </Typography>
                          <Typography component="div">
                            PVM %: <EditableCell value={line.vat_percent} inputType="number" onSave={(v) => saveLineField(line.id, "vat_percent", v)} renderDisplay={(v) => <b>{fmtNum(v)}</b>} />
                          </Typography>
                          <Typography component="div">
                            PVM klasė:{" "}
                            <EditableCell
                              value={line.pvm_kodas || ""}
                              inputType="select"
                              options={PVM_KLASE_OPTIONS}
                              onSave={(v) => saveLineField(line.id, "pvm_kodas", v || null)}
                              renderDisplay={() => <b>{line.pvm_kodas || "—"}</b>}
                            />
                          </Typography>
                          <Typography component="div">
                            Suma (su PVM): <EditableCell value={line.total} inputType="number" onSave={(v) => saveLineField(line.id, "total", v)} renderDisplay={(v) => <b>{fmtNum(v)}</b>} sx={getLineErrSx("total")} />
                          </Typography>
                          <Typography component="div">
                            Nuolaida (be PVM): <b>{fmtNum(line.discount_wo_vat)}</b>
                          </Typography>
                          <Typography component="div">
                            Nuolaida (su PVM): <b>{fmtNum(line.discount_with_vat)}</b>
                          </Typography>
                        </Stack>

                        {/* Korespondencija mini-table per line */}
                        <KorMiniTable
                          entries={korEntries}
                          currency={purchase.currency}
                          disabled={Boolean(savingKey)}
                          title="Eilutės korespondencija"
                        />
                      </Box>
                    );
                  })}

                  {lineItemsLoading && lineItemsLoaded.length === 0 && (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                      <CircularProgress size={24} />
                    </Box>
                  )}

                  {!lineItemsLoading && lineItemsLoaded.length === 0 && lineItemsTotal === 0 && (
                    <Typography color="text.secondary" sx={{ textAlign: "center", py: 2 }}>Nėra eilučių</Typography>
                  )}

                  {lineItemsLoaded.length > 0 && lineItemsLoaded.length < lineItemsTotal && (
                    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 1, py: 1 }}>
                      <Button onClick={loadMore} variant="text" disabled={lineItemsLoadingMore} sx={{ textTransform: "none", fontSize: 13 }}>
                        Įkelti daugiau ({lineItemsTotal - lineItemsLoaded.length} liko)
                      </Button>
                      {lineItemsLoadingMore && <CircularProgress size={22} thickness={8} />}
                    </Box>
                  )}
                </Stack>
              </Box>
            </AccordionDetails>
          </Accordion>
        )}
      </>
    );
  };

  /* ── Main render ── */

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="lt">
      <Dialog
        open={open} onClose={onClose} fullWidth maxWidth="xl"
        fullScreen={isMobile} disableScrollLock
        TransitionProps={{ timeout: 0.1 }}
        PaperProps={{
          sx: isMobile
            ? { m: 0, height: "100dvh", borderRadius: 0, display: "flex", flexDirection: "column" }
            : { borderRadius: "14px", overflowX: "hidden", height: "85vh", display: "flex", flexDirection: "column" },
        }}
      >
        <Box
          sx={{
            px: 2.5,
            py: 1.4,
            bgcolor: "#FFF4F6",
            borderBottom: "1px solid #F5C2CB",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
              Peržiūra
            </Typography>

            <Chip
              label="Pirkimas"
              size="small"
              sx={{
                bgcolor: "#F5C2CB",
                color: "#8A3D4B",
                fontWeight: 700,
                border: "1px solid #E8AAB5",
              }}
            />
          </Box>

          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>

        <DialogContent sx={{ p: 0, overflow: "hidden", flex: 1, display: "flex", flexDirection: "column" }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1 }}><CircularProgress size={32} /></Box>
          ) : loadError ? (
            <Box sx={{ p: 3 }}><Alert severity="error">{loadError}</Alert></Box>
          ) : !purchase ? (
            <Box sx={{ p: 3 }}><Typography color="text.secondary">Dokumentas nerastas</Typography></Box>
          ) : isMobile ? (
            <Box sx={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <Box
                sx={{
                  flexShrink: 0, height: 120, minHeight: 120, bgcolor: "#f8f8f8",
                  borderBottom: "1px solid #eee", p: 1,
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                }}
                onClick={() => setPreviewFullscreen(true)}
              >
                {purchase.preview_url ? (
                  <Box sx={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <img src={purchase.preview_url} alt="Preview" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                    <Typography sx={{ position: "absolute", bottom: 4, right: 4, bgcolor: "rgba(0,0,0,0.55)", color: "white", px: 1, py: 0.5, borderRadius: 1, fontSize: "0.7rem" }}>
                      Paspauskite, kad padidintumėte
                    </Typography>
                  </Box>
                ) : (
                  <Typography color="text.secondary">Peržiūra negalima</Typography>
                )}
              </Box>
              <Box sx={{ flex: 1, overflowY: "auto", overflowX: "hidden", px: 2, py: 1.5, WebkitOverflowScrolling: "touch" }}>
                {renderContent()}
              </Box>
            </Box>
          ) : (
            <Box sx={{ display: "flex", gap: 3, p: 3, overflowY: "auto", overflowX: "hidden", flex: 1, scrollbarGutter: "stable" }}>
              <Box sx={{ width: "50%", flexShrink: 0, position: "sticky", top: 0, alignSelf: "flex-start", maxHeight: "calc(85vh - 120px)", minHeight: 300, minWidth: 0 }}>
                {purchase.preview_url ? (
                  <ZoomableImage src={purchase.preview_url} buttonSize={36} maxHeight="calc(80vh - 120px)" fitOnLoad fitRatio={0.8} />
                ) : (
                  <Box sx={{ height: "100%", minHeight: 300, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "#fafafa", borderRadius: 2, border: "1px dashed", borderColor: "divider" }}>
                    <Typography sx={{ color: "text.secondary" }}>Peržiūra negalima</Typography>
                  </Box>
                )}
              </Box>
              <Box sx={{ width: "50%", flexShrink: 0, minWidth: 0, overflowX: "hidden" }}>
                {renderContent()}
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={previewFullscreen} onClose={() => setPreviewFullscreen(false)} fullScreen disableScrollLock PaperProps={{ sx: { bgcolor: "#000" } }}>
        <IconButton onClick={() => setPreviewFullscreen(false)} sx={{ position: "absolute", top: 8, right: 8, zIndex: 10, color: "white", bgcolor: "rgba(0,0,0,0.5)", "&:hover": { bgcolor: "rgba(0,0,0,0.7)" }, width: 48, height: 48 }}>
          <CloseIcon sx={{ fontSize: 28 }} />
        </IconButton>
        <Box sx={{ width: "100%", height: "100%", p: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {purchase?.preview_url && <ZoomableImage src={purchase.preview_url} buttonSize={48} maxHeight="calc(100vh - 100px)" />}
        </Box>
      </Dialog>
    </LocalizationProvider>
  );
}