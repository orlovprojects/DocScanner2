import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Helmet } from "react-helmet";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Chip,
  CircularProgress,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
  Checkbox,
  TextField,
  InputAdornment,
  Select,
  FormControl,
  useTheme,
  useMediaQuery,
  Card,
  CardContent,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import PurchasePreviewDialog from "../page_elements/PurchasePreviewDialog";

import MoreVertIcon from "@mui/icons-material/MoreVert";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import WarningIcon from "@mui/icons-material/Warning";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import FeedIcon from "@mui/icons-material/Feed";
import {
  CreditInvoiceIcon,
  DebitInvoiceIcon,
} from "../components/Icons";
import BalanceIcon from "@mui/icons-material/Balance";
import LockIcon from "@mui/icons-material/Lock";
import SearchIcon from "@mui/icons-material/Search";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";

import { api } from "../api/endpoints";
import { useCompanyProfiles } from "../contexts/useCompanyProfiles";


/* ═══════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════ */

const PAGE_LIMIT = 50;

const PAYMENT_STATUS_MAP = {
  unpaid: { label: "Neapmokėta", color: "default" },
  partially_paid: { label: "Dalinai", color: "warning" },
  paid: { label: "Apmokėta", color: "success" },
};

const LT_MONTHS = [
  "sausis", "vasaris", "kovas", "balandis", "gegužė", "birželis",
  "liepa", "rugpjūtis", "rugsėjis", "spalis", "lapkritis", "gruodis",
];

const fmtDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("lt-LT", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const fmtAmount = (val, currency) => {
  if (val == null) return "—";
  const num = Number(val);
  if (isNaN(num)) return "—";
  return `${num.toLocaleString("lt-LT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency || "EUR"}`;
};

/* ── Period options (last 6 months) ── */
function buildPeriodOptions() {
  const now = new Date();
  const options = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-based
    const label = `${year} ${LT_MONTHS[month]}`;
    const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    options.push({ label, value: `${from}|${to}` });
  }
  return options;
}

/* ── Computed status ── */
function getComputedStatus(p) {
  if (p.status === "accounted") return "uzregistruota";
  if (p.ready_for_export === false || p.math_validation_passed === false || p.kor_balanced === false) {
    return "reikia_perziuros";
  }
  return "nauja";
}

function isOverdue(p) {
  if (!p.due_date || p.payment_status === "paid") return false;
  return new Date(p.due_date) < new Date(new Date().toDateString());
}

/* ═══════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════ */

export default function PurchasesPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [purchases, setPurchases] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const { profiles, activeId, initialized } = useCompanyProfiles();

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("visi");
  const [paymentFilter, setPaymentFilter] = useState("visi");
  const [periodFilter, setPeriodFilter] = useState("visi");

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [excludeIds, setExcludeIds] = useState(new Set());

  // Menu
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuPurchaseId, setMenuPurchaseId] = useState(null);

  // Delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingIds, setDeletingIds] = useState([]);
  const [deleting, setDeleting] = useState(false);

  // Preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState(null);

  const searchTimerRef = useRef(null);
  const scrollSentinelRef = useRef(null);

  const periodOptions = useMemo(() => buildPeriodOptions(), []);

  const activeProfileId = activeId;
  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  /* ── Fetch ── */

  const buildParams = useCallback(
    (offset = 0) => {
      const params = { limit: PAGE_LIMIT, offset };
      if (activeProfileId) params.company_profile = activeProfileId;
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== "visi") params.status_filter = statusFilter;
      if (paymentFilter !== "visi") params.payment_status = paymentFilter;
      if (periodFilter !== "visi") {
        const [from, to] = periodFilter.split("|");
        if (from) params.period_from = from;
        if (to) params.period_to = to;
      }
      return params;
    },
    [activeProfileId, search, statusFilter, paymentFilter, periodFilter],
  );

  const fetchPurchases = useCallback(
    async (offset = 0, append = false) => {
      if (!activeProfileId) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const { data } = await api.get("/purchases/", {
          withCredentials: true,
          params: buildParams(offset),
        });

        const results = data.results || data || [];
        const total = data.count ?? results.length;

        if (append) {
          setPurchases((prev) => {
            const map = new Map(prev.map((p) => [p.id, p]));
            for (const p of results) map.set(p.id, p);
            return Array.from(map.values());
          });
        } else {
          setPurchases(results);
        }
        setCount(total);
      } catch (e) {
        console.error("Failed to load purchases:", e);
        setError("Nepavyko gauti pirkimų sąrašo");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [activeProfileId, buildParams],
  );

  // Initial load + filter change
  useEffect(() => {
    if (activeProfileId) {
      setSelectedIds(new Set());
      setSelectAllMatching(false);
      setExcludeIds(new Set());
      fetchPurchases(0, false);
    }
  }, [activeProfileId, statusFilter, paymentFilter, periodFilter]);

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      if (activeProfileId) {
        setSelectedIds(new Set());
        setSelectAllMatching(false);
        fetchPurchases(0, false);
      }
    }, 400);
    return () => clearTimeout(searchTimerRef.current);
  }, [search]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = scrollSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          !loading &&
          !loadingMore &&
          purchases.length < count
        ) {
          fetchPurchases(purchases.length, true);
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, loadingMore, purchases.length, count, fetchPurchases]);

  /* ── Selection ── */

  const allLoadedSelected = purchases.length > 0 && purchases.every((p) => selectedIds.has(p.id));

  const handleToggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (selectAllMatching) {
          setExcludeIds((ex) => new Set(ex).add(id));
        }
      } else {
        next.add(id);
        if (selectAllMatching) {
          setExcludeIds((ex) => {
            const n = new Set(ex);
            n.delete(id);
            return n;
          });
        }
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    if (allLoadedSelected) {
      setSelectedIds(new Set());
      setSelectAllMatching(false);
      setExcludeIds(new Set());
    } else {
      setSelectedIds(new Set(purchases.map((p) => p.id)));
    }
  };

  const handleSelectAllMatching = () => {
    setSelectAllMatching(true);
    setSelectedIds(new Set(purchases.map((p) => p.id)));
    setExcludeIds(new Set());
  };

  const effectiveSelectedCount = selectAllMatching
    ? count - excludeIds.size
    : selectedIds.size;

  /* ── Menu ── */

  const handleMenuOpen = (e, id) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
    setMenuPurchaseId(id);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuPurchaseId(null);
  };

  /* ── Preview ── */

  const handlePreviewOpen = (id) => {
    if (!id) return;
    handleMenuClose();
    setSelectedPurchaseId(id);
    setPreviewOpen(true);
  };

  const handlePreviewClose = () => {
    setPreviewOpen(false);
    setSelectedPurchaseId(null);
  };

  const handlePurchaseUpdated = useCallback(
    async (updatedOrId) => {
      const id =
        updatedOrId?.id ??
        updatedOrId ??
        selectedPurchaseId;

      if (!id) return;

      try {
        const { data } = await api.get(
          `/purchases/${id}/`,
          {
            withCredentials: true,
            params: activeProfileId
              ? { company_profile: activeProfileId }
              : {},
          },
        );

        setPurchases((prev) =>
          prev.map((p) =>
            String(p.id) === String(id)
              ? { ...p, ...data }
              : p,
          ),
        );
      } catch (e) {
        console.error("Failed to refresh purchase in table:", e);

        // Atsarginis variantas
        await fetchPurchases(0, false);
      }
    },
    [
      selectedPurchaseId,
      activeProfileId,
      fetchPurchases,
    ],
  );

  /* ── Delete ── */

  const handleDeleteClick = (id) => {
    handleMenuClose();
    setDeletingIds([id]);
    setDeleteDialogOpen(true);
  };

  const handleBulkDelete = () => {
    const ids = selectAllMatching
      ? purchases.map((p) => p.id).filter((id) => !excludeIds.has(id))
      : Array.from(selectedIds);
    if (ids.length === 0) return;
    setDeletingIds(ids);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (deletingIds.length === 0) return;
    setDeleting(true);
    try {
      for (const id of deletingIds) {
        await api.delete(`/purchases/${id}/`, { withCredentials: true });
      }
      setPurchases((prev) =>
        prev.filter((p) => !deletingIds.includes(p.id)),
      );
      setCount((prev) => prev - deletingIds.length);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of deletingIds) next.delete(id);
        return next;
      });
      setDeleteDialogOpen(false);
      setDeletingIds([]);
    } catch (e) {
      alert(
        "Nepavyko ištrinti: " + (e?.response?.data?.detail || e.message),
      );
    } finally {
      setDeleting(false);
    }
  };

  /* ── Render icons column ── */

  const renderIcons = (p) => {
    const icons = [];

    const iconSx = isMobile
      ? {
          fontSize: 16,
          verticalAlign: "middle",
          cursor: "pointer",
        }
      : {
          verticalAlign: "middle",
          cursor: "pointer",
        };

    const iconFontSize = isMobile ? undefined : "small";

    const invoiceIconWrapSx = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      lineHeight: 1,
    };

    const invoiceIconSx = isMobile
      ? {
          fontSize: 18,
          display: "block",
          transform: "translateY(-1px)",
        }
      : {
          fontSize: 21,
          display: "block",
          transform: "translateY(-1px)",
        };

    const tooltipProps = isMobile
      ? {
          enterTouchDelay: 50,
          leaveTouchDelay: 1500,
        }
      : {};

    if (p.ready_for_export === false) {
      icons.push(
        <Tooltip
          key="rfe"
          title="Trūksta duomenų"
          {...tooltipProps}
        >
          <FeedIcon
            fontSize={iconFontSize}
            sx={{
              ...iconSx,
              color: "#8136c1",
            }}
          />
        </Tooltip>,
      );
    }

    if (p.math_validation_passed === false) {
      icons.push(
        <Tooltip
          key="mv"
          title="Sumos nesutampa"
          {...tooltipProps}
        >
          <WarningIcon
            fontSize={iconFontSize}
            sx={{
              ...iconSx,
              color: "#f17e67",
            }}
          />
        </Tooltip>,
      );
    }

    if (p.kor_balanced === false) {
      icons.push(
        <Tooltip
          key="kb"
          title="Korespondencija nesubalansuota"
          {...tooltipProps}
        >
          <BalanceIcon
            fontSize={iconFontSize}
            sx={{
              ...iconSx,
              color: "#ff9800",
            }}
          />
        </Tooltip>,
      );
    }

    if (p.is_credit_invoice) {
      icons.push(
        <Tooltip
          key="cr"
          title="Kreditinė sąskaita"
          {...tooltipProps}
        >
          <Box component="span" sx={invoiceIconWrapSx}>
            <CreditInvoiceIcon sx={invoiceIconSx} />
          </Box>
        </Tooltip>,
      );
    }

    if (p.is_debit_invoice) {
      icons.push(
        <Tooltip
          key="db"
          title="Debetinė sąskaita"
          {...tooltipProps}
        >
          <Box component="span" sx={invoiceIconWrapSx}>
            <DebitInvoiceIcon sx={invoiceIconSx} />
          </Box>
        </Tooltip>,
      );
    }

    if (icons.length === 0) return null;

    return (
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.25,
          lineHeight: 1,
        }}
      >
        {icons}
      </Box>
    );
  };

  /* ── Render status chip ── */

  const renderStatusChip = (p) => {
    const computed = getComputedStatus(p);

    if (computed === "uzregistruota") {
      return (
        <Tooltip title="Periodas uždarytas">
          <Chip
            icon={<LockIcon sx={{ fontSize: "0.85rem !important" }} />}
            label="Užregistruota"
            size="small"
            sx={{
              fontSize: "0.75rem",
              fontWeight: 600,
              bgcolor: "#E8F5E9",
              color: "#2E7D32",
              "& .MuiChip-icon": { color: "#2E7D32" },
            }}
          />
        </Tooltip>
      );
    }

    if (computed === "reikia_perziuros") {
      return (
        <Chip
          label="Reikia peržiūros"
          size="small"
          color="warning"
          variant="filled"
          clickable
          onClick={() => handlePreviewOpen(p.id)}
          sx={{
            fontSize: "0.75rem",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.15s ease",
            "&:hover": {
              filter: "brightness(0.95)",
              transform: "translateY(-1px)",
            },
          }}
        />
      );
    }

    return (
      <Chip
        label="Nauja"
        size="small"
        color="info"
        variant="filled"
        sx={{ fontSize: "0.75rem", fontWeight: 600 }}
      />
    );
  };

  /* ── Filter bar ── */

  const renderFilterBar = () => (
    <Paper
      elevation={0}
      sx={{
        mb: 2,
        p: isMobile ? 1.5 : 2,

        // Розовый фон всей секции
        bgcolor: "#FFF4F6",
        borderRadius: 2,
        border: "1px solid #F5C2CB",
      }}
    >
      <Box
        sx={{
          display: isMobile ? "flex" : "grid",
          flexDirection: isMobile ? "column" : undefined,

          // Левая часть растягивается, справа всегда зарезервировано место
          gridTemplateColumns: isMobile
            ? undefined
            : "minmax(0, 1fr) 360px",

          alignItems: "center",
          gap: isMobile ? 1.5 : 2,
        }}
      >
        {/* Filters */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: isMobile ? 1.5 : 2,
            flexWrap: "wrap",
            width: "100%",
            minWidth: 0,
          }}
        >
          {/* Search */}
          <TextField
            size="small"
            placeholder="Ieškoti pagal dok. nr., tiekėją, kodą..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon
                    sx={{
                      fontSize: 20,
                      color: "text.disabled",
                    }}
                  />
                </InputAdornment>
              ),
            }}
            sx={{
              flex: isMobile ? "1" : "1 1 280px",
              maxWidth: isMobile ? "100%" : 360,
              bgcolor: "white",
              "& .MuiOutlinedInput-root": {
                borderRadius: 1.5,
              },
            }}
          />

          {/* Statusas */}
          <FormControl
            size="small"
            sx={{
              minWidth: 160,
              flex: isMobile ? 1 : "none",
            }}
          >
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              displayEmpty
              MenuProps={{ disableScrollLock: true }}
              sx={{
                bgcolor: "white",
                borderRadius: 1.5,
                fontSize: "0.85rem",
              }}
            >
              <MenuItem value="visi">Statusas: Visi</MenuItem>
              <MenuItem value="nauja">Nauja</MenuItem>
              <MenuItem value="reikia_perziuros">
                Reikia peržiūros
              </MenuItem>
              <MenuItem value="uzregistruota">
                Užregistruota
              </MenuItem>
            </Select>
          </FormControl>

          {/* Apmokėjimas */}
          <FormControl
            size="small"
            sx={{
              minWidth: 160,
              flex: isMobile ? 1 : "none",
            }}
          >
            <Select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              displayEmpty
              MenuProps={{ disableScrollLock: true }}
              sx={{
                bgcolor: "white",
                borderRadius: 1.5,
                fontSize: "0.85rem",
              }}
            >
              <MenuItem value="visi">Mokėjimas: Visi</MenuItem>
              <MenuItem value="unpaid">Neapmokėta</MenuItem>
              <MenuItem value="partially_paid">
                Dalinai apmokėta
              </MenuItem>
              <MenuItem value="paid">Apmokėta</MenuItem>
            </Select>
          </FormControl>

          {/* Periodas */}
          <FormControl
            size="small"
            sx={{
              minWidth: 180,
              flex: isMobile ? 1 : "none",
            }}
          >
            <Select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              displayEmpty
              MenuProps={{ disableScrollLock: true }}
              sx={{
                bgcolor: "white",
                borderRadius: 1.5,
                fontSize: "0.85rem",
              }}
            >
              <MenuItem value="visi">Periodas: Visi</MenuItem>

              {periodOptions.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* Selection actions — место всегда зарезервировано на desktop */}
        <Box
          sx={{
            width: "100%",
            minHeight: 40,

            display:
              isMobile && effectiveSelectedCount === 0
                ? "none"
                : "flex",

            visibility:
              !isMobile && effectiveSelectedCount === 0
                ? "hidden"
                : "visible",

            pointerEvents:
              effectiveSelectedCount === 0
                ? "none"
                : "auto",

            alignItems: "center",
            justifyContent: "flex-end",
            gap: 1.5,
            whiteSpace: "nowrap",
          }}
        >
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            {selectAllMatching
              ? `Pasirinkta ${effectiveSelectedCount} dokumentų pagal filtrą`
              : `Pasirinkta ${effectiveSelectedCount} dokumentų`}
          </Typography>

          {!selectAllMatching &&
            allLoadedSelected &&
            count > purchases.length && (
              <Button
                size="small"
                onClick={handleSelectAllMatching}
                sx={{
                  textTransform: "none",
                  fontSize: 13,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                Pasirinkti visus {count}
              </Button>
            )}

          <Button
            size="small"
            color="error"
            onClick={handleBulkDelete}
            startIcon={
              <DeleteOutlineIcon sx={{ fontSize: 16 }} />
            }
            sx={{
              textTransform: "none",
              fontSize: 13,
              whiteSpace: "nowrap",
            }}
          >
            Pašalinti ({effectiveSelectedCount})
          </Button>
        </Box>
      </Box>
    </Paper>
  );

  /* ── Mobile cards ── */

  const renderMobile = () => (
    <Box>
      {purchases.map((p) => {
        const payCfg = PAYMENT_STATUS_MAP[p.payment_status] || { label: "—", color: "default" };
        const overdue = isOverdue(p);

        return (
          <Card
            key={p.id}
            sx={{
              mb: 1.5,
              borderRadius: 2,
              border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
          >
            <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 0.75 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                    {p.seller_name || "—"}
                  </Typography>
                  {p.seller_id && (
                    <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                      {p.seller_id}
                    </Typography>
                  )}
                </Box>
                <IconButton size="small" onClick={(e) => handleMenuOpen(e, p.id)}>
                  <MoreVertIcon fontSize="small" />
                </IconButton>
              </Box>

              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
                <Typography
                  onClick={() => handlePreviewOpen(p.id)}
                  sx={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "primary.main",
                    cursor: "pointer",
                    "&:hover": { textDecoration: "underline" },
                  }}
                >
                  {p.document_series || ""}{p.document_number || "—"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {fmtDate(p.invoice_date)}
                </Typography>
                {overdue && (
                  <Tooltip title="Mokėjimo terminas praėjęs">
                    <FiberManualRecordIcon sx={{ fontSize: 10, color: "error.main" }} />
                  </Tooltip>
                )}
              </Box>

              {/* Icons row */}
              <Box sx={{ mb: 0.75 }}>{renderIcons(p)}</Box>

              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Box sx={{ display: "flex", gap: 0.75 }}>
                  {renderStatusChip(p)}
                  <Chip
                    label={payCfg.label}
                    color={payCfg.color}
                    size="small"
                    variant={p.payment_status === "unpaid" ? "outlined" : "filled"}
                  />
                </Box>
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                  {fmtAmount(p.amount_with_vat, p.currency)}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );

  /* ── Desktop table ── */

  const renderDesktop = () => (
    <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: "#f3f4f6" }}>
            <TableCell padding="checkbox" sx={{ bgcolor: "#f3f4f6" }}>
              <Checkbox
                checked={allLoadedSelected && purchases.length > 0}
                indeterminate={selectedIds.size > 0 && !allLoadedSelected}
                onChange={handleToggleAll}
                size="small"
              />
            </TableCell>
            <TableCell sx={{ fontWeight: 600, bgcolor: "#f3f4f6" }}>Tiekėjas</TableCell>
            <TableCell sx={{ fontWeight: 600, bgcolor: "#f3f4f6" }}>Dok. nr.</TableCell>
            <TableCell sx={{ fontWeight: 600, bgcolor: "#f3f4f6" }}>Sąskaitos data</TableCell>
            <TableCell sx={{ fontWeight: 600, bgcolor: "#f3f4f6" }}>Mokėjimo terminas</TableCell>
            <TableCell sx={{ fontWeight: 600, bgcolor: "#f3f4f6" }} align="right">Be PVM</TableCell>
            <TableCell sx={{ fontWeight: 600, bgcolor: "#f3f4f6" }} align="right">PVM</TableCell>
            <TableCell sx={{ fontWeight: 600, bgcolor: "#f3f4f6" }} align="right">Su PVM</TableCell>
            <TableCell sx={{ fontWeight: 600, bgcolor: "#f3f4f6", width: 100 }} />
            <TableCell sx={{ fontWeight: 600, bgcolor: "#f3f4f6" }}>Statusas</TableCell>
            <TableCell sx={{ fontWeight: 600, bgcolor: "#f3f4f6" }}>Mokėjimas</TableCell>
            <TableCell sx={{ bgcolor: "#f3f4f6", width: 40 }} />
          </TableRow>
        </TableHead>

        <TableBody>
          {purchases.map((p) => {
            const payCfg = PAYMENT_STATUS_MAP[p.payment_status] || { label: "—", color: "default" };
            const overdue = isOverdue(p);
            const isSelected = selectAllMatching
              ? !excludeIds.has(p.id)
              : selectedIds.has(p.id);

            return (
              <TableRow key={p.id} hover>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={isSelected}
                    onChange={() => handleToggleOne(p.id)}
                    size="small"
                  />
                </TableCell>

                <TableCell>
                  <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                    {p.seller_name || "—"}
                  </Typography>
                  {p.seller_id && (
                    <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                      {p.seller_id}
                    </Typography>
                  )}
                </TableCell>

                <TableCell>
                  <Typography
                    onClick={() => handlePreviewOpen(p.id)}
                    sx={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "primary.main",
                      cursor: "pointer",
                      display: "inline-block",
                      "&:hover": { textDecoration: "underline" },
                    }}
                  >
                    {p.document_series || ""}{p.document_number || "—"}
                  </Typography>
                </TableCell>

                <TableCell sx={{ fontSize: 13 }}>{fmtDate(p.invoice_date)}</TableCell>

                <TableCell sx={{ fontSize: 13 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    {fmtDate(p.due_date)}
                    {overdue && (
                      <Tooltip title="Mokėjimo terminas praėjęs">
                        <FiberManualRecordIcon sx={{ fontSize: 12, color: "error.main" }} />
                      </Tooltip>
                    )}
                  </Box>
                </TableCell>

                <TableCell align="right" sx={{ fontSize: 13 }}>
                  {fmtAmount(p.amount_wo_vat, p.currency)}
                </TableCell>

                <TableCell align="right" sx={{ fontSize: 13 }}>
                  {fmtAmount(p.vat_amount, p.currency)}
                </TableCell>

                <TableCell align="right" sx={{ fontSize: 13, fontWeight: 600 }}>
                  {fmtAmount(p.amount_with_vat, p.currency)}
                </TableCell>

                {/* Icons column */}
                <TableCell>{renderIcons(p)}</TableCell>

                {/* Status */}
                <TableCell>{renderStatusChip(p)}</TableCell>

                {/* Payment */}
                <TableCell>
                  <Chip
                    label={payCfg.label}
                    color={payCfg.color}
                    size="small"
                    variant={p.payment_status === "unpaid" ? "outlined" : "filled"}
                  />
                </TableCell>

                <TableCell align="right">
                  <IconButton size="small" onClick={(e) => handleMenuOpen(e, p.id)}>
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );

  /* ── Kol dar nežinom aktyvaus profilio – rodom tik spinnerį ── */
  if (!initialized || (activeProfileId && loading && purchases.length === 0)) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  const hasActiveFilters =
    Boolean(search) ||
    statusFilter !== "visi" ||
    paymentFilter !== "visi" ||
    periodFilter !== "visi";

  /* ── Main render ── */

  return (
    <Box sx={{ p: isMobile ? 2 : 4 }}>
      <Helmet>
        <title>Pirkimo sąskaitos - DokSkenas</title>
      </Helmet>

      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2.5 }}>
        <Typography variant={isMobile ? "h6" : "h5"}>Pirkimo sąskaitos</Typography>
        {activeProfile && (
          <Chip
            label={activeProfile.name}
            size="small"
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      {renderFilterBar()}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : purchases.length === 0 ? (
        hasActiveFilters ? (
          <Box sx={{ textAlign: "center", py: 6 }}>
            <Typography color="text.secondary">
              Pagal pasirinktus filtrus dokumentų nerasta
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              textAlign: "center",
              py: 8,
              px: 3,
              bgcolor: "#FFF4F6",
              borderRadius: 3,
              border: "1px dashed #F5C2CB",
            }}
          >
            <ShoppingCartIcon sx={{ fontSize: 48, color: "#f6a9b7", mb: 2, opacity: 0.5 }} />
            <Typography sx={{ fontSize: 16, fontWeight: 500, color: "text.secondary", mb: 1 }}>
              Dar nėra pirkimo sąskaitų
            </Typography>
            <Typography sx={{ fontSize: 14, color: "text.disabled" }}>
              Eikite į skaitmenizavimo suvestinę, pažymėkite dokumentus ir spauskite „Perkelti į apskaitą"
            </Typography>
          </Box>
        )
      ) : isMobile ? (
        renderMobile()
      ) : (
        renderDesktop()
      )}

      {/* Infinite scroll sentinel */}
      {!loading && purchases.length < count && (
        <Box
          ref={scrollSentinelRef}
          sx={{
            display: "flex",
            justifyContent: "center",
            py: 2,
          }}
        >
          {loadingMore && <CircularProgress size={24} />}
        </Box>
      )}

      {/* Row menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        disableScrollLock
      >
        <MenuItem onClick={() => handlePreviewOpen(menuPurchaseId)}>
          <VisibilityOutlinedIcon sx={{ fontSize: 18, mr: 1 }} />
          Peržiūrėti
        </MenuItem>
        <MenuItem
          onClick={() => handleDeleteClick(menuPurchaseId)}
          sx={{ color: "error.main" }}
        >
          <DeleteOutlineIcon sx={{ fontSize: 18, mr: 1 }} />
          Pašalinti iš apskaitos
        </MenuItem>
      </Menu>

      {/* Preview dialog */}
      <PurchasePreviewDialog
        open={previewOpen}
        onClose={handlePreviewClose}
        purchaseId={selectedPurchaseId}
        activeProfileId={activeProfileId}
        onUpdated={handlePurchaseUpdated}
      />

      {/* Delete dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setDeletingIds([]);
        }}
        disableScrollLock
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: "12px" } }}
      >
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>
          Pašalinti iš apskaitos?
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
            <WarningAmberIcon sx={{ color: "warning.main", mt: 0.25 }} />
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
              {deletingIds.length === 1
                ? "Dokumentas bus pašalintas iš pirkimų, bet liks skaitmenizavimo suvestinėje. Galėsite perkelti jį dar kartą."
                : `${deletingIds.length} dokumentai bus pašalinti iš pirkimų, bet liks skaitmenizavimo suvestinėje.`}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => {
              setDeleteDialogOpen(false);
              setDeletingIds([]);
            }}
            sx={{ textTransform: "none", color: "#6B7280" }}
          >
            Atšaukti
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteConfirm}
            disabled={deleting}
            sx={{ textTransform: "none", fontWeight: 600 }}
            startIcon={deleting ? <CircularProgress size={16} /> : null}
          >
            {deleting ? "Šalinama..." : `Pašalinti (${deletingIds.length})`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}