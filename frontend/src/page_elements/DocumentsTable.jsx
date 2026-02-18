import { useEffect, useState, useRef, useCallback } from "react";
import { api } from "../api/endpoints";
import {
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  Checkbox,
  CircularProgress,
  Tooltip,
  IconButton,
  Menu,
  MenuItem,
  Box,
  InputBase,
  Chip,
  Typography,
  Card,
  CardContent,
  useTheme,
  useMediaQuery,
  Dialog,
  DialogTitle,
  DialogContent,
  Divider,
} from "@mui/material";
import { alpha, styled } from "@mui/material/styles";
import WarningIcon from "@mui/icons-material/Warning";
import PersonOffIcon from "@mui/icons-material/PersonOff";
import FeedIcon from "@mui/icons-material/Feed";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import PercentIcon from "@mui/icons-material/Percent";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import CancelIcon from "@mui/icons-material/Cancel";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import SellIcon from "@mui/icons-material/Sell";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";

// Стилизованный контейнер поиска
const SearchWrapper = styled(Box, {
  shouldForwardProp: (prop) => prop !== "focused",
})(({ theme, focused }) => ({
  display: "inline-flex",
  alignItems: "center",
  backgroundColor: focused
    ? theme.palette.background.paper
    : alpha(theme.palette.action.hover, 0.04),
  borderRadius: 12,
  padding: "8px 14px",
  gap: 10,
  cursor: "text",
  transition: "all 0.01s ease-out",
  border: `1.5px solid ${focused ? theme.palette.primary.main : "transparent"}`,
  boxShadow: focused
    ? `0 0 0 3px ${alpha(theme.palette.primary.main, 0.1)}`
    : "none",
  width: focused ? 340 : 280,
  "&:hover": {
    backgroundColor: focused
      ? theme.palette.background.paper
      : alpha(theme.palette.action.hover, 0.08),
    borderColor: focused ? theme.palette.primary.main : alpha(theme.palette.divider, 0.3),
  },
  [theme.breakpoints.down('md')]: {
    width: '100%',
  },
}));

const StyledInputBase = styled(InputBase)(({ theme }) => ({
  flex: 1,
  fontSize: 14,
  "& input": {
    padding: 0,
    "&::placeholder": {
      color: theme.palette.text.secondary,
      opacity: 0.7,
    },
  },
}));

const ResultsChip = styled(Chip)(({ theme }) => ({
  height: 22,
  fontSize: 12,
  fontWeight: 500,
  backgroundColor: alpha(theme.palette.primary.main, 0.1),
  color: theme.palette.primary.main,
  "& .MuiChip-label": {
    padding: "0 8px",
  },
}));

// Стилизованная карточка документа для мобильных
const DocumentCard = styled(Card)(({ theme }) => ({
  marginBottom: theme.spacing(1.5),
  borderRadius: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
  '&:active': {
    backgroundColor: alpha(theme.palette.action.hover, 0.04),
  },
}));

// ── API status icon colors ──
const API_STATUS_COLORS = {
  success: "#4caf50",
  partial_success: "#ff9800",
  error: "#f44336",
};

// ── Popup for export log details ──
function ExportLogPopup({ open, onClose, documentId, program }) {
  const [loading, setLoading] = useState(false);
  const [logData, setLogData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !documentId) return;
    setLoading(true);
    setError(null);
    setLogData(null);

    api
      .get(`/documents/${documentId}/export-log/`, {
        withCredentials: true,
        params: { program: program || "optimum" },
      })
      .then(({ data }) => setLogData(data))
      .catch((e) => {
        console.error("Failed to load export log:", e);
        setError("Nepavyko gauti eksporto detalių");
      })
      .finally(() => setLoading(false));
  }, [open, documentId, program]);

  const fmtDate = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("lt-LT", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const statusChip = (status) => {
    const map = {
      success: { label: "Sėkmingai", color: "success" },
      partial_success: { label: "Su pastabomis", color: "warning" },
      error: { label: "Klaida", color: "error" },
    };
    const cfg = map[status] || { label: status, color: "default" };
    return <Chip label={cfg.label} color={cfg.color} size="small" sx={{ fontWeight: 600 }} />;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h6" component="span">Eksporto detalės</Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        )}

        {error && (
          <Typography color="error" sx={{ py: 2 }}>{error}</Typography>
        )}

        {logData && (
          <Box>
            {/* Overall status */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
              {statusChip(logData.status)}
              <Typography variant="body2" color="text.secondary">
                {fmtDate(logData.created_at)}
              </Typography>
            </Box>

            {/* Partner section (Dineta only) */}
            {logData.partner_status && (
              <>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Kontrahentas
                </Typography>
                <Box
                  sx={{
                    p: 1.5,
                    mb: 2,
                    borderRadius: 1,
                    bgcolor: logData.partner_status === "success"
                      ? alpha(API_STATUS_COLORS.success, 0.06)
                      : alpha(API_STATUS_COLORS.error, 0.06),
                    border: `1px solid ${
                      logData.partner_status === "success"
                        ? alpha(API_STATUS_COLORS.success, 0.2)
                        : alpha(API_STATUS_COLORS.error, 0.2)
                    }`,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    {logData.partner_status === "success" ? (
                      <CheckCircleIcon sx={{ color: API_STATUS_COLORS.success, fontSize: 18 }} />
                    ) : (
                      <CancelIcon sx={{ color: API_STATUS_COLORS.error, fontSize: 18 }} />
                    )}
                    <Typography variant="body2" fontWeight={500}>
                      {logData.partner_status === "success" ? "Sėkmingai" : "Klaida"}
                    </Typography>
                  </Box>
                  {logData.partner_error && (
                    <Typography
                      variant="body2"
                      sx={{ mt: 1, color: "error.main", wordBreak: "break-word" }}
                    >
                      {logData.partner_error}
                    </Typography>
                  )}
                </Box>
              </>
            )}

            {/* Invoice / Operation section */}
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {logData.invoice_type?.startsWith("setOperation")
                ? `Operacija (${logData.invoice_type})`
                : `Sąskaita faktūra (${logData.invoice_type || "—"})`}
            </Typography>

            <Box
              sx={{
                p: 1.5,
                mb: 2,
                borderRadius: 1,
                bgcolor: logData.invoice_status === "success"
                  ? alpha(API_STATUS_COLORS.success, 0.06)
                  : alpha(API_STATUS_COLORS.error, 0.06),
                border: `1px solid ${
                  logData.invoice_status === "success"
                    ? alpha(API_STATUS_COLORS.success, 0.2)
                    : alpha(API_STATUS_COLORS.error, 0.2)
                }`,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {logData.invoice_status === "success" ? (
                  <CheckCircleIcon sx={{ color: API_STATUS_COLORS.success, fontSize: 18 }} />
                ) : (
                  <CancelIcon sx={{ color: API_STATUS_COLORS.error, fontSize: 18 }} />
                )}
                <Typography variant="body2" fontWeight={500}>
                  {logData.invoice_status === "success" ? "Sėkmingai" : "Klaida"}
                </Typography>
                {logData.invoice_result != null && (
                  <Typography variant="caption" color="text.secondary">
                    (Result: {logData.invoice_result})
                  </Typography>
                )}
              </Box>
              {logData.invoice_error && (
                <Typography
                  variant="body2"
                  sx={{ mt: 1, color: "error.main", wordBreak: "break-word" }}
                >
                  {logData.invoice_error}
                </Typography>
              )}
            </Box>

            {/* Articles section */}
            {logData.articles && logData.articles.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Prekės / paslaugos ({logData.articles.length})
                </Typography>

                {logData.articles.map((a, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      p: 1.25,
                      mb: 0.75,
                      borderRadius: 1,
                      bgcolor: a.status === "success"
                        ? alpha(API_STATUS_COLORS.success, 0.04)
                        : alpha(API_STATUS_COLORS.error, 0.04),
                      border: `1px solid ${
                        a.status === "success"
                          ? alpha(API_STATUS_COLORS.success, 0.15)
                          : alpha(API_STATUS_COLORS.error, 0.15)
                      }`,
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      {a.status === "success" ? (
                        <CheckCircleIcon sx={{ color: API_STATUS_COLORS.success, fontSize: 16 }} />
                      ) : (
                        <CancelIcon sx={{ color: API_STATUS_COLORS.error, fontSize: 16 }} />
                      )}
                      <Typography variant="body2" fontWeight={500} sx={{ flex: 1 }}>
                        {a.article_name || "—"}
                      </Typography>
                      {a.article_code && (
                        <Chip label={a.article_code} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                      )}
                    </Box>
                    {a.error && (
                      <Typography
                        variant="caption"
                        sx={{ mt: 0.5, display: "block", color: "error.main", wordBreak: "break-word" }}
                      >
                        {a.error}
                      </Typography>
                    )}
                  </Box>
                ))}
              </>
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}


export default function DocumentsTable({
  filtered,
  loading,
  loadingMore = false,
  hasMore = false,
  loadMore,
  onSearchChange,
  selectedRows,
  handleSelectRow,
  handleSelectAll,
  isRowExportable,
  reloadDocuments,
  allowUnknownDirection = false,
  onDeleteDoc,
  showOwnerColumns = false,
  selectAllChecked,
  selectAllIndeterminate,
  accountingProgram = "",
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [anchorEl, setAnchorEl] = useState(null);
  const [menuRowId, setMenuRowId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  // Export log popup state
  const [logPopupOpen, setLogPopupOpen] = useState(false);
  const [logPopupDocId, setLogPopupDocId] = useState(null);

  const inputRef = useRef(null);
  const onSearchChangeRef = useRef(onSearchChange);
  const loadMoreTriggerRef = useRef(null);

  // Показывать столбец API status? (для API-программ)
  const showApiStatusCol = accountingProgram === "optimum" || accountingProgram === "dineta";

  useEffect(() => {
    onSearchChangeRef.current = onSearchChange;
  }, [onSearchChange]);

  useEffect(() => {
    const t = setTimeout(() => {
      onSearchChangeRef.current?.(searchQuery);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // IntersectionObserver для подгрузки ещё документов при прокрутке страницы
  useEffect(() => {
    if (!hasMore) return;
    const el = loadMoreTriggerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMore && !loadingMore && !loading) {
          loadMore?.();
        }
      },
      {
        root: null,
        threshold: 0.1,
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, loadMore]);

  const rows = filtered || [];

  const handleMenuOpen = (event, rowId) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setMenuRowId(rowId);
  };
  const handleMenuClose = () => {
    setAnchorEl(null);
    setMenuRowId(null);
  };
  const handleDeleteRow = async (rowId) => {
    handleMenuClose();
    onDeleteDoc?.(rowId);
    try {
      await api.delete("/documents/bulk-delete/", { data: { ids: [rowId] } });
      reloadDocuments?.();
    } catch (e) {
      alert("Įvyko klaida trinant dokumentą.");
      reloadDocuments?.();
    }
  };

  const clearSearch = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSearchQuery("");
    inputRef.current?.focus();
  };

  const handleWrapperClick = () => {
    inputRef.current?.focus();
  };

  // ── API status rendering (unified for Optimum & Dineta) ──
  const fmtApiDate = (iso) => {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("lt-LT", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleApiStatusClick = useCallback((docId, status) => {
    if (status === "partial_success" || status === "error") {
      setLogPopupDocId(docId);
      setLogPopupOpen(true);
    }
  }, []);

  const renderApiStatus = (d) => {
    const status = accountingProgram === "dineta"
      ? d.dineta_api_status
      : d.optimum_api_status;
    const date = accountingProgram === "dineta"
      ? d.dineta_last_try_date
      : d.optimum_last_try_date;
    const dateStr = fmtApiDate(date);
    const iconSx = isMobile ? { fontSize: 18 } : { fontSize: 20 };

    if (status === "success") {
      return (
        <Tooltip title={`Išsiųsta sėkmingai${dateStr ? ` (${dateStr})` : ""}`} arrow>
          <CheckBoxIcon sx={{ ...iconSx, color: API_STATUS_COLORS.success }} />
        </Tooltip>
      );
    }

    if (status === "partial_success") {
      return (
        <Tooltip title={`Išsiųsta su pastabomis${dateStr ? ` (${dateStr})` : ""}`} arrow>
          <CheckBoxIcon
            sx={{ ...iconSx, color: API_STATUS_COLORS.partial_success, cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              handleApiStatusClick(d.id, status);
            }}
          />
        </Tooltip>
      );
    }

    if (status === "error") {
      return (
        <Tooltip title={`Siuntimo klaida${dateStr ? ` (${dateStr})` : ""}`} arrow>
          <CancelIcon
            sx={{ ...iconSx, color: API_STATUS_COLORS.error, cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              handleApiStatusClick(d.id, status);
            }}
          />
        </Tooltip>
      );
    }

    // no status yet — dash
    return (
      <RemoveCircleOutlineIcon sx={{ ...iconSx, color: "text.disabled" }} />
    );
  };

  const getDirectionToShow = (d) => {
    const raw =
      typeof d.effective_direction !== "undefined"
        ? d.effective_direction
        : (d.pirkimas_pardavimas || "").toLowerCase();
    if (raw === "") return "";
    const v = (raw || "").toLowerCase();
    if (!v || v === "nezinoma") return "nezinoma";
    if (v === "pirkimas" || v === "pardavimas") return v;
    return "nezinoma";
  };

  const canExport = (d) => {
    if (!isRowExportable(d)) return false;
    if (d.ready_for_export === false || d.math_validation_passed === false) return false;
    if (allowUnknownDirection) return true;
    const dir = getDirectionToShow(d);
    return dir === "pirkimas" || dir === "pardavimas";
  };

  const exportableRows = rows.filter(canExport);
  const exportableIds = exportableRows.map((r) => String(r.id));

  const allExportableSelected =
    exportableIds.length > 0 &&
    exportableIds.every((id) => selectedRows.includes(id));

  const someExportableSelected =
    exportableIds.some((id) => selectedRows.includes(id)) && !allExportableSelected;

  const statusLabel = (d) => {
    if (d.status === "exported") return "Eksportuotas";
    if (d.status === "completed") return "Atliktas";
    if (d.status === "processing" || d.status === "pending") return "Vykdomas";
    if (d.status === "rejected") return "Atmestas";
    if (typeof d.statusLabel === "function") return d.statusLabel(d);
    return d.status || "";
  };

  const statusLabelFull = (d) => {
    if (d.status === "exported") return "Atliktas (Eksportuotas)";
    if (d.status === "completed") return "Atliktas (Neeksportuotas)";
    if (d.status === "processing" || d.status === "pending") return "Vykdomas";
    if (d.status === "rejected") return "Atmestas";
    if (typeof d.statusLabel === "function") return d.statusLabel(d);
    return d.status || "";
  };

  const iconForStatus = (d) => {
    const sxProps = isMobile ? { fontSize: 18, verticalAlign: 'middle' } : { verticalAlign: 'middle' };
    
    if (d.status === "exported") {
      return <CheckCircleIcon color="success" sx={sxProps} />;
    }
    if (d.status === "completed") {
      return <CheckCircleOutlineIcon color="success" sx={sxProps} />;
    }
    if (d.status === "processing" || d.status === "pending") {
      return <HourglassEmptyIcon color="warning" sx={sxProps} />;
    }
    if (d.status === "rejected") {
      return <CancelIcon color="error" sx={sxProps} />;
    }
    if (typeof d.iconForStatus === "function") return d.iconForStatus(d.status);
    return null;
  };

  const renderScanType = (d) => {
    const t = d?.scan_type;
    if (!t) return "Nežinomas";
    const mapping = { sumiskai: "Sumiškai", detaliai: "Detaliai" };
    if (mapping[t]) return mapping[t];
    const label = String(t).replace(/_/g, " ").toLowerCase();
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const renderDirectionCell = (d) => {
    const dir = getDirectionToShow(d);
    if (dir === "") {
      return <span>&nbsp;</span>;
    }
    if (dir === "nezinoma") {
      return (
        <Tooltip title="Nežinomas tipas. Atnaujinkite pirkėjo ar pardavėjo duomenis.">
          <span style={{ color: "#bdbdbd", display: "flex", alignItems: "center" }}>
            <HelpOutlineIcon fontSize="small" style={{ marginRight: 4 }} /> Nežinomas
          </span>
        </Tooltip>
      );
    }
    return dir.charAt(0).toUpperCase() + dir.slice(1);
  };

  const renderDirectionShort = (d) => {
    const dir = getDirectionToShow(d);
    if (dir === "" || dir === "nezinoma") {
      return (
        <Box component="span" sx={{ color: 'text.disabled', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <HelpOutlineIcon sx={{ fontSize: 14 }} />
          <span>—</span>
        </Box>
      );
    }
    if (dir === "pirkimas") {
      return (
        <Box component="span" sx={{ color: 'info.main', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <ShoppingCartIcon sx={{ fontSize: 14 }} />
          <span>Pirk.</span>
        </Box>
      );
    }
    if (dir === "pardavimas") {
      return (
        <Box component="span" sx={{ color: 'success.main', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <SellIcon sx={{ fontSize: 14 }} />
          <span>Pard.</span>
        </Box>
      );
    }
    return dir;
  };

  const hasSeparateVatWarning = (d) => {
    return d.scan_type === "sumiskai" && d.separate_vat === true;
  };

  const renderWarningIcons = (d) => {
    if (d.status !== "completed" && d.status !== "exported") return null;
    
    const icons = [];
    const iconSx = isMobile 
      ? { fontSize: 16, verticalAlign: 'middle', cursor: 'pointer' }
      : { verticalAlign: 'middle', cursor: 'pointer' };
    const iconFontSize = isMobile ? undefined : "small";
    const tooltipProps = isMobile ? { enterTouchDelay: 50, leaveTouchDelay: 1500 } : {};
    
    if (d.ready_for_export === false) {
      icons.push(
        <Tooltip key="missing" title="Dokumente trūksta duomenų" {...tooltipProps}>
          <FeedIcon fontSize={iconFontSize} sx={{ ...iconSx, color: "#8136c1" }} />
        </Tooltip>
      );
    }
    if (d.math_validation_passed === false) {
      icons.push(
        <Tooltip key="math" title="Sumos nesutampa" {...tooltipProps}>
          <WarningIcon fontSize={iconFontSize} sx={{ ...iconSx, color: "#f17e67" }} />
        </Tooltip>
      );
    }
    if (hasSeparateVatWarning(d)) {
      icons.push(
        <Tooltip key="vat" title="Keli skirtingi PVM %" {...tooltipProps}>
          <PercentIcon fontSize={iconFontSize} sx={{ ...iconSx, color: "#ff9800" }} />
        </Tooltip>
      );
    }
    if (d.buyer_vat_val === "invalid") {
      icons.push(
        <Tooltip key="buyer-vat" title="Negalioja pirkėjo PVM kodas" {...tooltipProps}>
          <PersonOffIcon fontSize={iconFontSize} sx={{ ...iconSx, color: "#f44336" }} />
        </Tooltip>
      );
    }
    if (d.seller_vat_val === "invalid") {
      icons.push(
        <Tooltip key="seller-vat" title="Negalioja pardavėjo PVM kodas" {...tooltipProps}>
          <PersonOffIcon fontSize={iconFontSize} sx={{ ...iconSx, color: "#f44336" }} />
        </Tooltip>
      );
    }
    if (
      (d.buyer_id && d.seller_id && d.buyer_id === d.seller_id) ||
      (d.buyer_name && d.seller_name && d.buyer_name.trim() === d.seller_name.trim()) ||
      (d.buyer_vat_code && d.seller_vat_code && d.buyer_vat_code === d.seller_vat_code)
    ) {
      icons.push(
        <Tooltip key="same" title="Pirkėjo rekvizitai sutampa su pardavėjo" {...tooltipProps}>
          <FeedIcon fontSize={iconFontSize} sx={{ ...iconSx, color: "#ff9800" }} />
        </Tooltip>
      );
    }
    
    return icons.length > 0 ? (
      <Box sx={{ display: 'inline-flex', gap: 0.25, ml: 0.5 }}>
        {icons}
      </Box>
    ) : null;
  };

  const formatDateShort = (iso) => {
    if (!iso) return "—";
    const date = new Date(iso);
    return date.toLocaleDateString("lt-LT", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const baseColCount = 7 + (showApiStatusCol ? 1 : 0);
  const extraOwnerCols = showOwnerColumns ? 2 : 0;

  // Mobile: Card-based layout
  const renderMobileList = () => (
    <Box>
      {/* Select All Row */}
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          py: 1.5, 
          px: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          borderRadius: '12px 12px 0 0',
        }}
      >
        <Checkbox
          size="small"
          indeterminate={
            typeof selectAllIndeterminate === "boolean"
              ? selectAllIndeterminate
              : someExportableSelected
          }
          checked={
            typeof selectAllChecked === "boolean"
              ? selectAllChecked
              : allExportableSelected
          }
          onChange={() => {
            if (
              (typeof selectAllChecked === "boolean" ? selectAllChecked : allExportableSelected)
            ) {
              handleSelectAll([]);
            } else {
              handleSelectAll(exportableIds);
            }
          }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
          Pasirinkti visus ({exportableIds.length})
        </Typography>
      </Box>

      {/* Document Cards */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : rows.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
          {searchQuery ? (
            <>
              <Typography variant="body2" gutterBottom>Dokumentų nerasta</Typography>
              <Typography variant="caption">Pabandykite kitą paieškos užklausą</Typography>
            </>
          ) : (
            <Typography variant="body2">Nėra dokumentų</Typography>
          )}
        </Box>
      ) : (
        <>
          {rows.map((d) => {
            const rowDisabled = !canExport(d);
            const isSelected = !rowDisabled && selectedRows.includes(String(d.id));

            return (
              <DocumentCard 
                key={String(d.id)}
                sx={{
                  borderColor: isSelected ? 'primary.main' : alpha(theme.palette.divider, 0.5),
                  bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.04) : 'background.paper',
                }}
              >
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  {/* Row 1: Checkbox + Filename + Menu */}
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.75 }}>
                    <Checkbox
                      size="small"
                      checked={isSelected}
                      onChange={handleSelectRow(String(d.id))}
                      disabled={rowDisabled}
                      sx={{ p: 0.5, mr: 1 }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        flex: 1,
                        fontWeight: 500,
                        color: 'primary.main',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '0.85rem',
                      }}
                      onClick={() => d.onClickPreview?.(d)}
                    >
                      {d.original_filename}
                    </Typography>
                    <IconButton 
                      size="small" 
                      onClick={(e) => handleMenuOpen(e, d.id)}
                      sx={{ ml: 0.5, p: 0.5 }}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </Box>

                  {/* Owner email (admin only) */}
                  {showOwnerColumns && d.owner_email && (
                    <Box sx={{ pl: 4, mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        {d.owner_email}
                      </Typography>
                    </Box>
                  )}

                  {/* Row 2: Scan type + Direction */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5, pl: 4 }}>
                    <Typography variant="caption" color="text.secondary">
                      {renderScanType(d)}
                    </Typography>
                    <Typography variant="caption" component="span">
                      {renderDirectionShort(d)}
                    </Typography>
                  </Box>

                  {/* Row 3: Status + Icons + API status + Date */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pl: 4 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {iconForStatus(d)}
                      <Typography variant="caption" sx={{ fontWeight: 500 }}>
                        {statusLabel(d)}
                      </Typography>
                      {renderWarningIcons(d)}
                      {/* API status icon inline on mobile */}
                      {showApiStatusCol && (
                        accountingProgram === "dineta"
                          ? d.dineta_api_status
                          : d.optimum_api_status
                      ) && (
                        <Box sx={{ ml: 0.75, display: 'inline-flex', alignItems: 'center' }}>
                          {renderApiStatus(d)}
                        </Box>
                      )}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {formatDateShort(d.uploaded_at)}
                    </Typography>
                  </Box>
                </CardContent>
              </DocumentCard>
            );
          })}

          {/* Load more trigger */}
          {hasMore && (
            <>
              {loadingMore && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              )}
              <Box ref={loadMoreTriggerRef} sx={{ height: 8 }} />
            </>
          )}
        </>
      )}

      {/* Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => handleDeleteRow(menuRowId)}>Ištrinti</MenuItem>
      </Menu>
    </Box>
  );

  // Desktop: Table layout
  const renderDesktopTable = () => (
    <TableContainer component={Paper}>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox">
              <Checkbox
                indeterminate={
                  typeof selectAllIndeterminate === "boolean"
                    ? selectAllIndeterminate
                    : someExportableSelected
                }
                checked={
                  typeof selectAllChecked === "boolean"
                    ? selectAllChecked
                    : allExportableSelected
                }
                onChange={() => {
                  if (
                    (typeof selectAllChecked === "boolean" ? selectAllChecked : allExportableSelected)
                  ) {
                    handleSelectAll([]);
                  } else {
                    handleSelectAll(exportableIds);
                  }
                }}
                inputProps={{ "aria-label": "select all exportable" }}
              />
            </TableCell>

            {showOwnerColumns && (
              <>
                <TableCell sx={{ fontWeight: 600 }}>User ID</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
              </>
            )}

            <TableCell sx={{ fontWeight: 600 }}>Failas</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Skaitmenizavimo tipas</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Pirkimas / pardavimas</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Statusas</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Įkėlimo data</TableCell>

            {showApiStatusCol && (
              <TableCell sx={{ fontWeight: 600, textAlign: "center" }}>
                {accountingProgram === "dineta" ? "Dineta API" : "Optimum API"}
              </TableCell>
            )}

            <TableCell align="right"></TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={baseColCount + extraOwnerCols} align="center">
                <CircularProgress size={24} />
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={baseColCount + extraOwnerCols}
                align="center"
                sx={{ py: 4, color: "text.secondary" }}
              >
                {searchQuery ? (
                  <Box>
                    <Box sx={{ fontSize: 14, mb: 0.5 }}>Dokumentų nerasta</Box>
                    <Box sx={{ fontSize: 12, opacity: 0.7 }}>
                      Pabandykite kitą paieškos užklausą
                    </Box>
                  </Box>
                ) : (
                  "Nėra dokumentų"
                )}
              </TableCell>
            </TableRow>
          ) : (
            <>
              {rows.map((d) => {
                const rowDisabled = !canExport(d);

                const shouldShowTooltip =
                  rowDisabled && (d.status === "completed" || d.status === "exported");

                const tooltipTitle = shouldShowTooltip
                  ? "Ištaisykite klaidas prieš eksportuojant"
                  : "";

                return (
                  <TableRow key={String(d.id)} hover>
                    <TableCell padding="checkbox">
                      <Tooltip title={tooltipTitle}>
                        <span>
                          <Checkbox
                            checked={!rowDisabled && selectedRows.includes(String(d.id))}
                            onChange={handleSelectRow(String(d.id))}
                            disabled={rowDisabled}
                            inputProps={{ "aria-label": "select row" }}
                          />
                        </span>
                      </Tooltip>
                    </TableCell>

                    {showOwnerColumns && (
                      <>
                        <TableCell>{d.user_id ?? "—"}</TableCell>
                        <TableCell>{d.owner_email || "—"}</TableCell>
                      </>
                    )}

                    <TableCell
                      sx={{ cursor: "pointer", color: "primary.main" }}
                      onClick={() => d.onClickPreview?.(d)}
                    >
                      {d.original_filename}
                    </TableCell>

                    <TableCell>
                      {(() => {
                        const t = d?.scan_type;
                        if (!t) {
                          return (
                            <Tooltip title="Nežinomas skaitmenizavimo tipas">
                              <span style={{ color: "#bdbdbd", display: "flex", alignItems: "center" }}>
                                <HelpOutlineIcon fontSize="small" style={{ marginRight: 4 }} /> Nežinomas
                              </span>
                            </Tooltip>
                          );
                        }
                        const mapping = { sumiskai: "Sumiškai" };
                        if (mapping[t]) return mapping[t];
                        const label = String(t).replace(/_/g, " ").toLowerCase();
                        return label.charAt(0).toUpperCase() + label.slice(1);
                      })()}
                    </TableCell>
                    <TableCell>{renderDirectionCell(d)}</TableCell>

                    <TableCell sx={{ verticalAlign: "middle", minHeight: 44 }}>
                      <Box display="flex" alignItems="center">
                        {iconForStatus(d)}&nbsp;{statusLabelFull(d)}
                        {renderWarningIcons(d)}
                      </Box>
                    </TableCell>

                    <TableCell>{d.fmt?.(d.uploaded_at) || ""}</TableCell>

                    {showApiStatusCol && (
                      <TableCell align="center">
                        {renderApiStatus(d)}
                      </TableCell>
                    )}

                    <TableCell align="right">
                      <IconButton onClick={(e) => handleMenuOpen(e, d.id)}>
                        <MoreVertIcon />
                      </IconButton>
                      <Menu
                        anchorEl={anchorEl}
                        open={Boolean(anchorEl) && menuRowId === d.id}
                        onClose={handleMenuClose}
                      >
                        <MenuItem onClick={() => handleDeleteRow(d.id)}> Ištrinti </MenuItem>
                      </Menu>
                    </TableCell>
                  </TableRow>
                );
              })}

              {hasMore && (
                <>
                  {loadingMore && (
                    <TableRow>
                      <TableCell
                        colSpan={baseColCount + extraOwnerCols}
                        align="center"
                      >
                        <CircularProgress size={20} />
                      </TableCell>
                    </TableRow>
                  )}

                  <TableRow>
                    <TableCell
                      colSpan={baseColCount + extraOwnerCols}
                      align="center"
                    >
                      <Box
                        ref={loadMoreTriggerRef}
                        sx={{ height: 8 }}
                      />
                    </TableCell>
                  </TableRow>
                </>
              )}
            </>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <Box>
      {/* Search field */}
      <Box sx={{ mb: 2.5, display: "flex", alignItems: "center", gap: 1.5, flexWrap: 'wrap' }}>
        <SearchWrapper focused={searchFocused} onClick={handleWrapperClick}>
          <SearchIcon
            sx={{
              color: searchFocused ? "primary.main" : "text.secondary",
              fontSize: 20,
              transition: "color 0.01s ease-out",
              cursor: "text",
            }}
          />
          <StyledInputBase
            inputRef={inputRef}
            placeholder="Ieškoti pagal dok. numerį..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {searchQuery && (
            <IconButton
              size="small"
              onMouseDown={clearSearch}
              sx={{
                p: 0.25,
                color: "text.secondary",
                "&:hover": {
                  color: "text.primary",
                  backgroundColor: "action.hover",
                },
              }}
            >
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
        </SearchWrapper>

        {searchQuery && (
          <ResultsChip
            label={`${rows.length}`}
            size="small"
          />
        )}
      </Box>

      {/* Conditional rendering based on screen size */}
      {isMobile ? renderMobileList() : renderDesktopTable()}

      {/* Export log popup */}
      <ExportLogPopup
        open={logPopupOpen}
        onClose={() => { setLogPopupOpen(false); setLogPopupDocId(null); }}
        documentId={logPopupDocId}
        program={accountingProgram}
      />
    </Box>
  );
}







// import { useEffect, useState, useRef, useCallback } from "react";
// import { api } from "../api/endpoints";
// import {
//   TableContainer,
//   Table,
//   TableHead,
//   TableRow,
//   TableCell,
//   TableBody,
//   Paper,
//   Checkbox,
//   CircularProgress,
//   Tooltip,
//   IconButton,
//   Menu,
//   MenuItem,
//   Box,
//   InputBase,
//   Chip,
//   Typography,
//   Card,
//   CardContent,
//   useTheme,
//   useMediaQuery,
//   Dialog,
//   DialogTitle,
//   DialogContent,
//   Divider,
// } from "@mui/material";
// import { alpha, styled } from "@mui/material/styles";
// import WarningIcon from "@mui/icons-material/Warning";
// import PersonOffIcon from "@mui/icons-material/PersonOff";
// import FeedIcon from "@mui/icons-material/Feed";
// import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
// import CheckCircleIcon from "@mui/icons-material/CheckCircle";
// import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
// import CheckBoxIcon from "@mui/icons-material/CheckBox";
// import MoreVertIcon from "@mui/icons-material/MoreVert";
// import SearchIcon from "@mui/icons-material/Search";
// import CloseIcon from "@mui/icons-material/Close";
// import PercentIcon from "@mui/icons-material/Percent";
// import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
// import CancelIcon from "@mui/icons-material/Cancel";
// import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
// import SellIcon from "@mui/icons-material/Sell";
// import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";

// // Стилизованный контейнер поиска
// const SearchWrapper = styled(Box, {
//   shouldForwardProp: (prop) => prop !== "focused",
// })(({ theme, focused }) => ({
//   display: "inline-flex",
//   alignItems: "center",
//   backgroundColor: focused
//     ? theme.palette.background.paper
//     : alpha(theme.palette.action.hover, 0.04),
//   borderRadius: 12,
//   padding: "8px 14px",
//   gap: 10,
//   cursor: "text",
//   transition: "all 0.01s ease-out",
//   border: `1.5px solid ${focused ? theme.palette.primary.main : "transparent"}`,
//   boxShadow: focused
//     ? `0 0 0 3px ${alpha(theme.palette.primary.main, 0.1)}`
//     : "none",
//   width: focused ? 340 : 280,
//   "&:hover": {
//     backgroundColor: focused
//       ? theme.palette.background.paper
//       : alpha(theme.palette.action.hover, 0.08),
//     borderColor: focused ? theme.palette.primary.main : alpha(theme.palette.divider, 0.3),
//   },
//   [theme.breakpoints.down('md')]: {
//     width: '100%',
//   },
// }));

// const StyledInputBase = styled(InputBase)(({ theme }) => ({
//   flex: 1,
//   fontSize: 14,
//   "& input": {
//     padding: 0,
//     "&::placeholder": {
//       color: theme.palette.text.secondary,
//       opacity: 0.7,
//     },
//   },
// }));

// const ResultsChip = styled(Chip)(({ theme }) => ({
//   height: 22,
//   fontSize: 12,
//   fontWeight: 500,
//   backgroundColor: alpha(theme.palette.primary.main, 0.1),
//   color: theme.palette.primary.main,
//   "& .MuiChip-label": {
//     padding: "0 8px",
//   },
// }));

// // Стилизованная карточка документа для мобильных
// const DocumentCard = styled(Card)(({ theme }) => ({
//   marginBottom: theme.spacing(1.5),
//   borderRadius: 12,
//   boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
//   border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
//   '&:active': {
//     backgroundColor: alpha(theme.palette.action.hover, 0.04),
//   },
// }));

// // ── Optimum status icon colors ──
// const OPT_COLORS = {
//   success: "#4caf50",
//   partial_success: "#ff9800",
//   error: "#f44336",
// };

// // ── Popup for export log details ──
// function ExportLogPopup({ open, onClose, documentId, program }) {
//   const [loading, setLoading] = useState(false);
//   const [logData, setLogData] = useState(null);
//   const [error, setError] = useState(null);

//   useEffect(() => {
//     if (!open || !documentId) return;
//     setLoading(true);
//     setError(null);
//     setLogData(null);

//     api
//       .get(`/documents/${documentId}/export-log/`, {
//         withCredentials: true,
//         params: { program: program || "optimum" },
//       })
//       .then(({ data }) => setLogData(data))
//       .catch((e) => {
//         console.error("Failed to load export log:", e);
//         setError("Nepavyko gauti eksporto detalių");
//       })
//       .finally(() => setLoading(false));
//   }, [open, documentId, program]);

//   const fmtDate = (iso) => {
//     if (!iso) return "—";
//     return new Date(iso).toLocaleDateString("lt-LT", {
//       year: "numeric",
//       month: "2-digit",
//       day: "2-digit",
//       hour: "2-digit",
//       minute: "2-digit",
//       second: "2-digit",
//     });
//   };

//   const statusChip = (status) => {
//     const map = {
//       success: { label: "Sėkmingai", color: "success" },
//       partial_success: { label: "Su pastabomis", color: "warning" },
//       error: { label: "Klaida", color: "error" },
//     };
//     const cfg = map[status] || { label: status, color: "default" };
//     return <Chip label={cfg.label} color={cfg.color} size="small" sx={{ fontWeight: 600 }} />;
//   };

//   return (
//     <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
//       <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
//         <Typography variant="h6" component="span">Eksporto detalės</Typography>
//         <IconButton size="small" onClick={onClose}>
//           <CloseIcon />
//         </IconButton>
//       </DialogTitle>

//       <DialogContent>
//         {loading && (
//           <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
//             <CircularProgress size={28} />
//           </Box>
//         )}

//         {error && (
//           <Typography color="error" sx={{ py: 2 }}>{error}</Typography>
//         )}

//         {logData && (
//           <Box>
//             {/* Overall status */}
//             <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
//               {statusChip(logData.status)}
//               <Typography variant="body2" color="text.secondary">
//                 {fmtDate(logData.created_at)}
//               </Typography>
//             </Box>

//             {/* Invoice section */}
//             <Typography variant="subtitle2" sx={{ mb: 1 }}>
//               Sąskaita faktūra ({logData.invoice_type || "—"})
//             </Typography>

//             <Box
//               sx={{
//                 p: 1.5,
//                 mb: 2,
//                 borderRadius: 1,
//                 bgcolor: logData.invoice_status === "success"
//                   ? alpha(OPT_COLORS.success, 0.06)
//                   : alpha(OPT_COLORS.error, 0.06),
//                 border: `1px solid ${
//                   logData.invoice_status === "success"
//                     ? alpha(OPT_COLORS.success, 0.2)
//                     : alpha(OPT_COLORS.error, 0.2)
//                 }`,
//               }}
//             >
//               <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
//                 {logData.invoice_status === "success" ? (
//                   <CheckCircleIcon sx={{ color: OPT_COLORS.success, fontSize: 18 }} />
//                 ) : (
//                   <CancelIcon sx={{ color: OPT_COLORS.error, fontSize: 18 }} />
//                 )}
//                 <Typography variant="body2" fontWeight={500}>
//                   {logData.invoice_status === "success" ? "Sėkmingai" : "Klaida"}
//                 </Typography>
//                 {logData.invoice_result != null && (
//                   <Typography variant="caption" color="text.secondary">
//                     (Result: {logData.invoice_result})
//                   </Typography>
//                 )}
//               </Box>
//               {logData.invoice_error && (
//                 <Typography
//                   variant="body2"
//                   sx={{ mt: 1, color: "error.main", wordBreak: "break-word" }}
//                 >
//                   {logData.invoice_error}
//                 </Typography>
//               )}
//             </Box>

//             {/* Articles section */}
//             {logData.articles && logData.articles.length > 0 && (
//               <>
//                 <Typography variant="subtitle2" sx={{ mb: 1 }}>
//                   Prekės / paslaugos ({logData.articles.length})
//                 </Typography>

//                 {logData.articles.map((a, idx) => (
//                   <Box
//                     key={idx}
//                     sx={{
//                       p: 1.25,
//                       mb: 0.75,
//                       borderRadius: 1,
//                       bgcolor: a.status === "success"
//                         ? alpha(OPT_COLORS.success, 0.04)
//                         : alpha(OPT_COLORS.error, 0.04),
//                       border: `1px solid ${
//                         a.status === "success"
//                           ? alpha(OPT_COLORS.success, 0.15)
//                           : alpha(OPT_COLORS.error, 0.15)
//                       }`,
//                     }}
//                   >
//                     <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
//                       {a.status === "success" ? (
//                         <CheckCircleIcon sx={{ color: OPT_COLORS.success, fontSize: 16 }} />
//                       ) : (
//                         <CancelIcon sx={{ color: OPT_COLORS.error, fontSize: 16 }} />
//                       )}
//                       <Typography variant="body2" fontWeight={500} sx={{ flex: 1 }}>
//                         {a.article_name || "—"}
//                       </Typography>
//                       {a.article_code && (
//                         <Chip label={a.article_code} size="small" variant="outlined" sx={{ fontSize: 11 }} />
//                       )}
//                     </Box>
//                     {a.error && (
//                       <Typography
//                         variant="caption"
//                         sx={{ mt: 0.5, display: "block", color: "error.main", wordBreak: "break-word" }}
//                       >
//                         {a.error}
//                       </Typography>
//                     )}
//                   </Box>
//                 ))}
//               </>
//             )}
//           </Box>
//         )}
//       </DialogContent>
//     </Dialog>
//   );
// }


// export default function DocumentsTable({
//   filtered,
//   loading,
//   loadingMore = false,
//   hasMore = false,
//   loadMore,
//   onSearchChange,
//   selectedRows,
//   handleSelectRow,
//   handleSelectAll,
//   isRowExportable,
//   reloadDocuments,
//   allowUnknownDirection = false,
//   onDeleteDoc,
//   showOwnerColumns = false,
//   selectAllChecked,
//   selectAllIndeterminate,
//   accountingProgram = "",           // ← NEW PROP
// }) {
//   const theme = useTheme();
//   const isMobile = useMediaQuery(theme.breakpoints.down('md'));

//   const [anchorEl, setAnchorEl] = useState(null);
//   const [menuRowId, setMenuRowId] = useState(null);
//   const [searchQuery, setSearchQuery] = useState("");
//   const [searchFocused, setSearchFocused] = useState(false);

//   // Export log popup state
//   const [logPopupOpen, setLogPopupOpen] = useState(false);
//   const [logPopupDocId, setLogPopupDocId] = useState(null);

//   const inputRef = useRef(null);
//   const onSearchChangeRef = useRef(onSearchChange);
//   const loadMoreTriggerRef = useRef(null);

//   // Показывать столбец Optimum API i Dineta?
//   const showApiStatusCol = accountingProgram === "optimum" || accountingProgram === "dineta";

//   useEffect(() => {
//     onSearchChangeRef.current = onSearchChange;
//   }, [onSearchChange]);

//   useEffect(() => {
//     const t = setTimeout(() => {
//       onSearchChangeRef.current?.(searchQuery);
//     }, 300);
//     return () => clearTimeout(t);
//   }, [searchQuery]);

//   // IntersectionObserver для подгрузки ещё документов при прокрутке страницы
//   useEffect(() => {
//     if (!hasMore) return;
//     const el = loadMoreTriggerRef.current;
//     if (!el) return;

//     const observer = new IntersectionObserver(
//       (entries) => {
//         const entry = entries[0];
//         if (entry.isIntersecting && hasMore && !loadingMore && !loading) {
//           loadMore?.();
//         }
//       },
//       {
//         root: null,
//         threshold: 0.1,
//       }
//     );

//     observer.observe(el);
//     return () => observer.disconnect();
//   }, [hasMore, loadingMore, loading, loadMore]);

//   const rows = filtered || [];

//   const handleMenuOpen = (event, rowId) => {
//     event.stopPropagation();
//     setAnchorEl(event.currentTarget);
//     setMenuRowId(rowId);
//   };
//   const handleMenuClose = () => {
//     setAnchorEl(null);
//     setMenuRowId(null);
//   };
//   const handleDeleteRow = async (rowId) => {
//     handleMenuClose();
//     onDeleteDoc?.(rowId);
//     try {
//       await api.delete("/documents/bulk-delete/", { data: { ids: [rowId] } });
//       reloadDocuments?.();
//     } catch (e) {
//       alert("Įvyko klaida trinant dokumentą.");
//       reloadDocuments?.();
//     }
//   };

//   const clearSearch = (e) => {
//     e.preventDefault();
//     e.stopPropagation();
//     setSearchQuery("");
//     inputRef.current?.focus();
//   };

//   const handleWrapperClick = () => {
//     inputRef.current?.focus();
//   };

//   // ── Optimum API status rendering ──
//   const fmtOptDate = (iso) => {
//     if (!iso) return "";
//     return new Date(iso).toLocaleDateString("lt-LT", {
//       month: "2-digit",
//       day: "2-digit",
//       hour: "2-digit",
//       minute: "2-digit",
//     });
//   };

//   const handleOptimumClick = useCallback((docId, status) => {
//     if (status === "partial_success" || status === "error") {
//       setLogPopupDocId(docId);
//       setLogPopupOpen(true);
//     }
//   }, []);

//   const renderOptimumStatus = (d) => {
//     const status = d.optimum_api_status;
//     const date = d.optimum_last_try_date;
//     const dateStr = fmtOptDate(date);
//     const iconSx = isMobile ? { fontSize: 18 } : { fontSize: 20 };
//     const clickable = status === "partial_success" || status === "error";

//     if (status === "success") {
//       return (
//         <Tooltip title={`Išsiųsta sėkmingai${dateStr ? ` (${dateStr})` : ""}`} arrow>
//           <CheckBoxIcon sx={{ ...iconSx, color: OPT_COLORS.success }} />
//         </Tooltip>
//       );
//     }

//     if (status === "partial_success") {
//       return (
//         <Tooltip title={`Išsiųsta su pastabomis${dateStr ? ` (${dateStr})` : ""}`} arrow>
//           <CheckBoxIcon
//             sx={{ ...iconSx, color: OPT_COLORS.partial_success, cursor: "pointer" }}
//             onClick={(e) => {
//               e.stopPropagation();
//               handleOptimumClick(d.id, status);
//             }}
//           />
//         </Tooltip>
//       );
//     }

//     if (status === "error") {
//       return (
//         <Tooltip title={`Siuntimo klaida${dateStr ? ` (${dateStr})` : ""}`} arrow>
//           <CancelIcon
//             sx={{ ...iconSx, color: OPT_COLORS.error, cursor: "pointer" }}
//             onClick={(e) => {
//               e.stopPropagation();
//               handleOptimumClick(d.id, status);
//             }}
//           />
//         </Tooltip>
//       );
//     }

//     // no status yet — dash
//     return (
//       <RemoveCircleOutlineIcon sx={{ ...iconSx, color: "text.disabled" }} />
//     );
//   };

//   const getDirectionToShow = (d) => {
//     const raw =
//       typeof d.effective_direction !== "undefined"
//         ? d.effective_direction
//         : (d.pirkimas_pardavimas || "").toLowerCase();
//     if (raw === "") return "";
//     const v = (raw || "").toLowerCase();
//     if (!v || v === "nezinoma") return "nezinoma";
//     if (v === "pirkimas" || v === "pardavimas") return v;
//     return "nezinoma";
//   };

//   const canExport = (d) => {
//     if (!isRowExportable(d)) return false;
//     if (d.ready_for_export === false || d.math_validation_passed === false) return false;
//     if (allowUnknownDirection) return true;
//     const dir = getDirectionToShow(d);
//     return dir === "pirkimas" || dir === "pardavimas";
//   };

//   const exportableRows = rows.filter(canExport);
//   const exportableIds = exportableRows.map((r) => String(r.id));

//   const allExportableSelected =
//     exportableIds.length > 0 &&
//     exportableIds.every((id) => selectedRows.includes(id));

//   const someExportableSelected =
//     exportableIds.some((id) => selectedRows.includes(id)) && !allExportableSelected;

//   const statusLabel = (d) => {
//     if (d.status === "exported") return "Eksportuotas";
//     if (d.status === "completed") return "Atliktas";
//     if (d.status === "processing" || d.status === "pending") return "Vykdomas";
//     if (d.status === "rejected") return "Atmestas";
//     if (typeof d.statusLabel === "function") return d.statusLabel(d);
//     return d.status || "";
//   };

//   const statusLabelFull = (d) => {
//     if (d.status === "exported") return "Atliktas (Eksportuotas)";
//     if (d.status === "completed") return "Atliktas (Neeksportuotas)";
//     if (d.status === "processing" || d.status === "pending") return "Vykdomas";
//     if (d.status === "rejected") return "Atmestas";
//     if (typeof d.statusLabel === "function") return d.statusLabel(d);
//     return d.status || "";
//   };

//   const iconForStatus = (d) => {
//     const sxProps = isMobile ? { fontSize: 18, verticalAlign: 'middle' } : { verticalAlign: 'middle' };
    
//     if (d.status === "exported") {
//       return <CheckCircleIcon color="success" sx={sxProps} />;
//     }
//     if (d.status === "completed") {
//       return <CheckCircleOutlineIcon color="success" sx={sxProps} />;
//     }
//     if (d.status === "processing" || d.status === "pending") {
//       return <HourglassEmptyIcon color="warning" sx={sxProps} />;
//     }
//     if (d.status === "rejected") {
//       return <CancelIcon color="error" sx={sxProps} />;
//     }
//     if (typeof d.iconForStatus === "function") return d.iconForStatus(d.status);
//     return null;
//   };

//   const renderScanType = (d) => {
//     const t = d?.scan_type;
//     if (!t) return "Nežinomas";
//     const mapping = { sumiskai: "Sumiškai", detaliai: "Detaliai" };
//     if (mapping[t]) return mapping[t];
//     const label = String(t).replace(/_/g, " ").toLowerCase();
//     return label.charAt(0).toUpperCase() + label.slice(1);
//   };

//   const renderDirectionCell = (d) => {
//     const dir = getDirectionToShow(d);
//     if (dir === "") {
//       return <span>&nbsp;</span>;
//     }
//     if (dir === "nezinoma") {
//       return (
//         <Tooltip title="Nežinomas tipas. Atnaujinkite pirkėjo ar pardavėjo duomenis.">
//           <span style={{ color: "#bdbdbd", display: "flex", alignItems: "center" }}>
//             <HelpOutlineIcon fontSize="small" style={{ marginRight: 4 }} /> Nežinomas
//           </span>
//         </Tooltip>
//       );
//     }
//     return dir.charAt(0).toUpperCase() + dir.slice(1);
//   };

//   const renderDirectionShort = (d) => {
//     const dir = getDirectionToShow(d);
//     if (dir === "" || dir === "nezinoma") {
//       return (
//         <Box component="span" sx={{ color: 'text.disabled', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
//           <HelpOutlineIcon sx={{ fontSize: 14 }} />
//           <span>—</span>
//         </Box>
//       );
//     }
//     if (dir === "pirkimas") {
//       return (
//         <Box component="span" sx={{ color: 'info.main', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
//           <ShoppingCartIcon sx={{ fontSize: 14 }} />
//           <span>Pirk.</span>
//         </Box>
//       );
//     }
//     if (dir === "pardavimas") {
//       return (
//         <Box component="span" sx={{ color: 'success.main', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
//           <SellIcon sx={{ fontSize: 14 }} />
//           <span>Pard.</span>
//         </Box>
//       );
//     }
//     return dir;
//   };

//   const hasSeparateVatWarning = (d) => {
//     return d.scan_type === "sumiskai" && d.separate_vat === true;
//   };

//   const renderWarningIcons = (d) => {
//     if (d.status !== "completed" && d.status !== "exported") return null;
    
//     const icons = [];
//     const iconSx = isMobile 
//       ? { fontSize: 16, verticalAlign: 'middle', cursor: 'pointer' }
//       : { verticalAlign: 'middle', cursor: 'pointer' };
//     const iconFontSize = isMobile ? undefined : "small";
//     const tooltipProps = isMobile ? { enterTouchDelay: 50, leaveTouchDelay: 1500 } : {};
    
//     if (d.ready_for_export === false) {
//       icons.push(
//         <Tooltip key="missing" title="Dokumente trūksta duomenų" {...tooltipProps}>
//           <FeedIcon fontSize={iconFontSize} sx={{ ...iconSx, color: "#8136c1" }} />
//         </Tooltip>
//       );
//     }
//     if (d.math_validation_passed === false) {
//       icons.push(
//         <Tooltip key="math" title="Sumos nesutampa" {...tooltipProps}>
//           <WarningIcon fontSize={iconFontSize} sx={{ ...iconSx, color: "#f17e67" }} />
//         </Tooltip>
//       );
//     }
//     if (hasSeparateVatWarning(d)) {
//       icons.push(
//         <Tooltip key="vat" title="Keli skirtingi PVM %" {...tooltipProps}>
//           <PercentIcon fontSize={iconFontSize} sx={{ ...iconSx, color: "#ff9800" }} />
//         </Tooltip>
//       );
//     }
//     if (d.buyer_vat_val === "invalid") {
//       icons.push(
//         <Tooltip key="buyer-vat" title="Negalioja pirkėjo PVM kodas" {...tooltipProps}>
//           <PersonOffIcon fontSize={iconFontSize} sx={{ ...iconSx, color: "#f44336" }} />
//         </Tooltip>
//       );
//     }
//     if (d.seller_vat_val === "invalid") {
//       icons.push(
//         <Tooltip key="seller-vat" title="Negalioja pardavėjo PVM kodas" {...tooltipProps}>
//           <PersonOffIcon fontSize={iconFontSize} sx={{ ...iconSx, color: "#f44336" }} />
//         </Tooltip>
//       );
//     }
//     if (
//       (d.buyer_id && d.seller_id && d.buyer_id === d.seller_id) ||
//       (d.buyer_name && d.seller_name && d.buyer_name.trim() === d.seller_name.trim()) ||
//       (d.buyer_vat_code && d.seller_vat_code && d.buyer_vat_code === d.seller_vat_code)
//     ) {
//       icons.push(
//         <Tooltip key="same" title="Pirkėjo rekvizitai sutampa su pardavėjo" {...tooltipProps}>
//           <FeedIcon fontSize={iconFontSize} sx={{ ...iconSx, color: "#ff9800" }} />
//         </Tooltip>
//       );
//     }
    
//     return icons.length > 0 ? (
//       <Box sx={{ display: 'inline-flex', gap: 0.25, ml: 0.5 }}>
//         {icons}
//       </Box>
//     ) : null;
//   };

//   const formatDateShort = (iso) => {
//     if (!iso) return "—";
//     const date = new Date(iso);
//     return date.toLocaleDateString("lt-LT", {
//       month: "2-digit",
//       day: "2-digit",
//       hour: "2-digit",
//       minute: "2-digit",
//     });
//   };

//   const baseColCount = 7 + (showOptimumCol ? 1 : 0);
//   const extraOwnerCols = showOwnerColumns ? 2 : 0;

//   // Mobile: Card-based layout
//   const renderMobileList = () => (
//     <Box>
//       {/* Select All Row */}
//       <Box 
//         sx={{ 
//           display: 'flex', 
//           alignItems: 'center', 
//           py: 1.5, 
//           px: 1,
//           borderBottom: '1px solid',
//           borderColor: 'divider',
//           bgcolor: 'background.paper',
//           borderRadius: '12px 12px 0 0',
//         }}
//       >
//         <Checkbox
//           size="small"
//           indeterminate={
//             typeof selectAllIndeterminate === "boolean"
//               ? selectAllIndeterminate
//               : someExportableSelected
//           }
//           checked={
//             typeof selectAllChecked === "boolean"
//               ? selectAllChecked
//               : allExportableSelected
//           }
//           onChange={() => {
//             if (
//               (typeof selectAllChecked === "boolean" ? selectAllChecked : allExportableSelected)
//             ) {
//               handleSelectAll([]);
//             } else {
//               handleSelectAll(exportableIds);
//             }
//           }}
//         />
//         <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
//           Pasirinkti visus ({exportableIds.length})
//         </Typography>
//       </Box>

//       {/* Document Cards */}
//       {loading ? (
//         <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
//           <CircularProgress size={28} />
//         </Box>
//       ) : rows.length === 0 ? (
//         <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
//           {searchQuery ? (
//             <>
//               <Typography variant="body2" gutterBottom>Dokumentų nerasta</Typography>
//               <Typography variant="caption">Pabandykite kitą paieškos užklausą</Typography>
//             </>
//           ) : (
//             <Typography variant="body2">Nėra dokumentų</Typography>
//           )}
//         </Box>
//       ) : (
//         <>
//           {rows.map((d) => {
//             const rowDisabled = !canExport(d);
//             const isSelected = !rowDisabled && selectedRows.includes(String(d.id));

//             return (
//               <DocumentCard 
//                 key={String(d.id)}
//                 sx={{
//                   borderColor: isSelected ? 'primary.main' : alpha(theme.palette.divider, 0.5),
//                   bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.04) : 'background.paper',
//                 }}
//               >
//                 <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
//                   {/* Row 1: Checkbox + Filename + Menu */}
//                   <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.75 }}>
//                     <Checkbox
//                       size="small"
//                       checked={isSelected}
//                       onChange={handleSelectRow(String(d.id))}
//                       disabled={rowDisabled}
//                       sx={{ p: 0.5, mr: 1 }}
//                     />
//                     <Typography
//                       variant="body2"
//                       sx={{
//                         flex: 1,
//                         fontWeight: 500,
//                         color: 'primary.main',
//                         cursor: 'pointer',
//                         overflow: 'hidden',
//                         textOverflow: 'ellipsis',
//                         whiteSpace: 'nowrap',
//                         fontSize: '0.85rem',
//                       }}
//                       onClick={() => d.onClickPreview?.(d)}
//                     >
//                       {d.original_filename}
//                     </Typography>
//                     <IconButton 
//                       size="small" 
//                       onClick={(e) => handleMenuOpen(e, d.id)}
//                       sx={{ ml: 0.5, p: 0.5 }}
//                     >
//                       <MoreVertIcon fontSize="small" />
//                     </IconButton>
//                   </Box>

//                   {/* Row 2: Scan type + Direction */}
//                   <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5, pl: 4 }}>
//                     <Typography variant="caption" color="text.secondary">
//                       {renderScanType(d)}
//                     </Typography>
//                     <Typography variant="caption" component="span">
//                       {renderDirectionShort(d)}
//                     </Typography>
//                   </Box>

//                   {/* Row 3: Status + Icons + Optimum + Date */}
//                   <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pl: 4 }}>
//                     <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
//                       {iconForStatus(d)}
//                       <Typography variant="caption" sx={{ fontWeight: 500 }}>
//                         {statusLabel(d)}
//                       </Typography>
//                       {renderWarningIcons(d)}
//                       {/* Optimum status icon inline on mobile */}
//                       {showOptimumCol && d.optimum_api_status && (
//                         <Box sx={{ ml: 0.75, display: 'inline-flex', alignItems: 'center' }}>
//                           {renderOptimumStatus(d)}
//                         </Box>
//                       )}
//                     </Box>
//                     <Typography variant="caption" color="text.secondary">
//                       {formatDateShort(d.uploaded_at)}
//                     </Typography>
//                   </Box>
//                 </CardContent>
//               </DocumentCard>
//             );
//           })}

//           {/* Load more trigger */}
//           {hasMore && (
//             <>
//               {loadingMore && (
//                 <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
//                   <CircularProgress size={24} />
//                 </Box>
//               )}
//               <Box ref={loadMoreTriggerRef} sx={{ height: 8 }} />
//             </>
//           )}
//         </>
//       )}

//       {/* Menu */}
//       <Menu
//         anchorEl={anchorEl}
//         open={Boolean(anchorEl)}
//         onClose={handleMenuClose}
//       >
//         <MenuItem onClick={() => handleDeleteRow(menuRowId)}>Ištrinti</MenuItem>
//       </Menu>
//     </Box>
//   );

//   // Desktop: Table layout
//   const renderDesktopTable = () => (
//     <TableContainer component={Paper}>
//       <Table stickyHeader size="small">
//         <TableHead>
//           <TableRow>
//             <TableCell padding="checkbox">
//               <Checkbox
//                 indeterminate={
//                   typeof selectAllIndeterminate === "boolean"
//                     ? selectAllIndeterminate
//                     : someExportableSelected
//                 }
//                 checked={
//                   typeof selectAllChecked === "boolean"
//                     ? selectAllChecked
//                     : allExportableSelected
//                 }
//                 onChange={() => {
//                   if (
//                     (typeof selectAllChecked === "boolean" ? selectAllChecked : allExportableSelected)
//                   ) {
//                     handleSelectAll([]);
//                   } else {
//                     handleSelectAll(exportableIds);
//                   }
//                 }}
//                 inputProps={{ "aria-label": "select all exportable" }}
//               />
//             </TableCell>

//             {showOwnerColumns && (
//               <>
//                 <TableCell sx={{ fontWeight: 600 }}>User ID</TableCell>
//                 <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
//               </>
//             )}

//             <TableCell sx={{ fontWeight: 600 }}>Failas</TableCell>
//             <TableCell sx={{ fontWeight: 600 }}>Skaitmenizavimo tipas</TableCell>
//             <TableCell sx={{ fontWeight: 600 }}>Pirkimas / pardavimas</TableCell>
//             <TableCell sx={{ fontWeight: 600 }}>Statusas</TableCell>
//             <TableCell sx={{ fontWeight: 600 }}>Įkėlimo data</TableCell>

//             {showOptimumCol && (
//               <TableCell sx={{ fontWeight: 600, textAlign: "center" }}>Optimum API</TableCell>
//             )}

//             <TableCell align="right"></TableCell>
//           </TableRow>
//         </TableHead>

//         <TableBody>
//           {loading ? (
//             <TableRow>
//               <TableCell colSpan={baseColCount + extraOwnerCols} align="center">
//                 <CircularProgress size={24} />
//               </TableCell>
//             </TableRow>
//           ) : rows.length === 0 ? (
//             <TableRow>
//               <TableCell
//                 colSpan={baseColCount + extraOwnerCols}
//                 align="center"
//                 sx={{ py: 4, color: "text.secondary" }}
//               >
//                 {searchQuery ? (
//                   <Box>
//                     <Box sx={{ fontSize: 14, mb: 0.5 }}>Dokumentų nerasta</Box>
//                     <Box sx={{ fontSize: 12, opacity: 0.7 }}>
//                       Pabandykite kitą paieškos užklausą
//                     </Box>
//                   </Box>
//                 ) : (
//                   "Nėra dokumentų"
//                 )}
//               </TableCell>
//             </TableRow>
//           ) : (
//             <>
//               {rows.map((d) => {
//                 const rowDisabled = !canExport(d);

//                 const shouldShowTooltip =
//                   rowDisabled && (d.status === "completed" || d.status === "exported");

//                 const tooltipTitle = shouldShowTooltip
//                   ? "Ištaisykite klaidas prieš eksportuojant"
//                   : "";

//                 return (
//                   <TableRow key={String(d.id)} hover>
//                     <TableCell padding="checkbox">
//                       <Tooltip title={tooltipTitle}>
//                         <span>
//                           <Checkbox
//                             checked={!rowDisabled && selectedRows.includes(String(d.id))}
//                             onChange={handleSelectRow(String(d.id))}
//                             disabled={rowDisabled}
//                             inputProps={{ "aria-label": "select row" }}
//                           />
//                         </span>
//                       </Tooltip>
//                     </TableCell>

//                     {showOwnerColumns && (
//                       <>
//                         <TableCell>{d.user_id ?? "—"}</TableCell>
//                         <TableCell>{d.owner_email || "—"}</TableCell>
//                       </>
//                     )}

//                     <TableCell
//                       sx={{ cursor: "pointer", color: "primary.main" }}
//                       onClick={() => d.onClickPreview?.(d)}
//                     >
//                       {d.original_filename}
//                     </TableCell>

//                     <TableCell>
//                       {(() => {
//                         const t = d?.scan_type;
//                         if (!t) {
//                           return (
//                             <Tooltip title="Nežinomas skaitmenizavimo tipas">
//                               <span style={{ color: "#bdbdbd", display: "flex", alignItems: "center" }}>
//                                 <HelpOutlineIcon fontSize="small" style={{ marginRight: 4 }} /> Nežinomas
//                               </span>
//                             </Tooltip>
//                           );
//                         }
//                         const mapping = { sumiskai: "Sumiškai" };
//                         if (mapping[t]) return mapping[t];
//                         const label = String(t).replace(/_/g, " ").toLowerCase();
//                         return label.charAt(0).toUpperCase() + label.slice(1);
//                       })()}
//                     </TableCell>
//                     <TableCell>{renderDirectionCell(d)}</TableCell>

//                     <TableCell sx={{ verticalAlign: "middle", minHeight: 44 }}>
//                       <Box display="flex" alignItems="center">
//                         {iconForStatus(d)}&nbsp;{statusLabelFull(d)}
//                         {renderWarningIcons(d)}
//                       </Box>
//                     </TableCell>

//                     <TableCell>{d.fmt?.(d.uploaded_at) || ""}</TableCell>

//                     {showOptimumCol && (
//                       <TableCell align="center">
//                         {renderOptimumStatus(d)}
//                       </TableCell>
//                     )}

//                     <TableCell align="right">
//                       <IconButton onClick={(e) => handleMenuOpen(e, d.id)}>
//                         <MoreVertIcon />
//                       </IconButton>
//                       <Menu
//                         anchorEl={anchorEl}
//                         open={Boolean(anchorEl) && menuRowId === d.id}
//                         onClose={handleMenuClose}
//                       >
//                         <MenuItem onClick={() => handleDeleteRow(d.id)}> Ištrinti </MenuItem>
//                       </Menu>
//                     </TableCell>
//                   </TableRow>
//                 );
//               })}

//               {hasMore && (
//                 <>
//                   {loadingMore && (
//                     <TableRow>
//                       <TableCell
//                         colSpan={baseColCount + extraOwnerCols}
//                         align="center"
//                       >
//                         <CircularProgress size={20} />
//                       </TableCell>
//                     </TableRow>
//                   )}

//                   <TableRow>
//                     <TableCell
//                       colSpan={baseColCount + extraOwnerCols}
//                       align="center"
//                     >
//                       <Box
//                         ref={loadMoreTriggerRef}
//                         sx={{ height: 8 }}
//                       />
//                     </TableCell>
//                   </TableRow>
//                 </>
//               )}
//             </>
//           )}
//         </TableBody>
//       </Table>
//     </TableContainer>
//   );

//   return (
//     <Box>
//       {/* Search field */}
//       <Box sx={{ mb: 2.5, display: "flex", alignItems: "center", gap: 1.5, flexWrap: 'wrap' }}>
//         <SearchWrapper focused={searchFocused} onClick={handleWrapperClick}>
//           <SearchIcon
//             sx={{
//               color: searchFocused ? "primary.main" : "text.secondary",
//               fontSize: 20,
//               transition: "color 0.01s ease-out",
//               cursor: "text",
//             }}
//           />
//           <StyledInputBase
//             inputRef={inputRef}
//             placeholder="Ieškoti pagal dok. numerį..."
//             value={searchQuery}
//             onChange={(e) => setSearchQuery(e.target.value)}
//             onFocus={() => setSearchFocused(true)}
//             onBlur={() => setSearchFocused(false)}
//           />
//           {searchQuery && (
//             <IconButton
//               size="small"
//               onMouseDown={clearSearch}
//               sx={{
//                 p: 0.25,
//                 color: "text.secondary",
//                 "&:hover": {
//                   color: "text.primary",
//                   backgroundColor: "action.hover",
//                 },
//               }}
//             >
//               <CloseIcon sx={{ fontSize: 18 }} />
//             </IconButton>
//           )}
//         </SearchWrapper>

//         {searchQuery && (
//           <ResultsChip
//             label={`${rows.length}`}
//             size="small"
//           />
//         )}
//       </Box>

//       {/* Conditional rendering based on screen size */}
//       {isMobile ? renderMobileList() : renderDesktopTable()}

//       {/* Export log popup */}
//       <ExportLogPopup
//         open={logPopupOpen}
//         onClose={() => { setLogPopupOpen(false); setLogPopupDocId(null); }}
//         documentId={logPopupDocId}
//         program="optimum"
//       />
//     </Box>
//   );
// }

