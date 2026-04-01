// src/pages/AdminIsrasytosSaskaitos.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Helmet } from "react-helmet";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  IconButton,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  MenuItem,
  Tooltip,
  CircularProgress,
  Alert,
  LinearProgress,
  InputAdornment,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import {
  Search as SearchIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import MarkEmailReadIcon from "@mui/icons-material/MarkEmailRead";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { useNavigate } from "react-router-dom";
import { invoicingApi } from "../api/invoicingApi";
import { api } from "../api/endpoints";
import DateField from "../components/DateField";
import { InvoicePreviewDialog, useInvoicePdf } from "../components/InvoicePreview";

// ── Config ──

const STATUS_CONFIG = {
  draft:          { label: "Juodraštis",       color: "default" },
  issued:         { label: "Išrašyta",          color: "info" },
  sent:           { label: "Išsiųsta",          color: "primary" },
  partially_paid: { label: "Dalinai apmokėta", color: "warning" },
  paid:           { label: "Apmokėta",          color: "success" },
  cancelled:      { label: "Atšaukta",          color: "default" },
};

const TYPE_CONFIG = {
  isankstine:   { label: "Išankstinė SF" },
  pvm_saskaita: { label: "PVM SF" },
  saskaita:     { label: "SF" },
  kreditine:    { label: "Kreditinė SF" },
};

const fmtAmount = (val, currency = "EUR") => {
  if (val == null) return "—";
  const n = parseFloat(val);
  return `${n.toFixed(2).replace(".", ",")} ${currency === "EUR" ? "€" : currency}`;
};

const fmtDate = (d) => {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
};

const toInputDate = (d) => {
  if (!d) return "";
  return d instanceof Date ? d.toISOString().split("T")[0] : d;
};

const getDefaultDates = () => {
  const now = new Date();
  const ago = new Date(now);
  ago.setDate(now.getDate() - 90);
  return { date_from: toInputDate(ago), date_to: toInputDate(now) };
};

const LIMIT = 50;

// ══════════════════════════════════════════
// Component
// ══════════════════════════════════════════

export default function AdminIsrasytosSaskaitos() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  // ── Auth ──
  const [user, setUser] = useState(null);
  const [userLoaded, setUserLoaded] = useState(false);

  // ── Data ──
  const [invoices, setInvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // ── Filters ──
  const defaultDates = useMemo(() => getDefaultDates(), []);
  const [filters, setFilters] = useState({
    q: "",
    status: "",
    invoice_type: "",
    date_from: defaultDates.date_from,
    date_to: defaultDates.date_to,
  });

  // ── Infinite scroll ──
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const abortRef = useRef(null);
  const sentinelRef = useRef(null);
  const observerRef = useRef(null);

  // ── Preview ──
  const [previewInvoiceId, setPreviewInvoiceId] = useState(null);
  const { downloadPdf, pdfLoading } = useInvoicePdf();

  // ── Load user ──
  useEffect(() => {
    api
      .get("/profile/", { withCredentials: true })
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setUserLoaded(true));
  }, []);

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // ── Build params ──
  const buildParams = useCallback(
    (offset) => {
      const params = { limit: LIMIT, offset };
      if (filters.q) params.q = filters.q;
      if (filters.status) params.status = filters.status;
      if (filters.invoice_type) params.invoice_type = filters.invoice_type;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      return params;
    },
    [filters]
  );

  // ── Load initial ──
  const loadInvoices = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    offsetRef.current = 0;
    hasMoreRef.current = true;

    try {
      const params = buildParams(0);
      const { data } = await api.get("/admin/visos-saskaitos/", {
        params,
        withCredentials: true,
        signal: controller.signal,
      });
      const results = data.results || [];
      setInvoices(results);
      setTotal(data.count || 0);
      offsetRef.current = results.length;
      hasMoreRef.current = results.length < (data.count || 0);
    } catch (e) {
      if (e.name === "AbortError" || e.name === "CanceledError") return;
      console.error("Nepavyko įkelti sąskaitų:", e);
      setInvoices([]);
      setTotal(0);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [buildParams]);

  // ── Load more ──
  const loadMore = useCallback(async () => {
    if (!hasMoreRef.current || loadingMore || loading) return;

    setLoadingMore(true);
    try {
      const params = buildParams(offsetRef.current);
      const { data } = await api.get("/admin/visos-saskaitos/", {
        params,
        withCredentials: true,
      });
      const results = data.results || [];
      setInvoices((prev) => [...prev, ...results]);
      offsetRef.current += results.length;
      hasMoreRef.current = offsetRef.current < (data.count || 0);
    } catch (e) {
      if (e.name === "AbortError" || e.name === "CanceledError") return;
      console.error("Nepavyko įkelti daugiau:", e);
    } finally {
      setLoadingMore(false);
    }
  }, [buildParams, loadingMore, loading]);

  // ── Initial load ──
  useEffect(() => {
    if (userLoaded && user?.is_superuser) loadInvoices();
  }, [userLoaded, user?.is_superuser, loadInvoices]);

  // ── Reload on filter change ──
  useEffect(() => {
    if (userLoaded && user?.is_superuser) loadInvoices();
  }, [filters.status, filters.invoice_type, filters.date_from, filters.date_to, filters.q]);

  // ── IntersectionObserver ──
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current && !loadingMore && !loading) {
          loadMore();
        }
      },
      { rootMargin: "300px" }
    );

    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [loadMore, loadingMore, loading]);

  // ── Helpers ──
  const updateFilter = (field, value) => setFilters((prev) => ({ ...prev, [field]: value }));

  const isOverdue = (inv) => {
    if (inv.is_overdue) return true;
    if (!["issued", "sent"].includes(inv.status) || !inv.due_date) return false;
    return inv.due_date < new Date().toISOString().split("T")[0];
  };

  const handlePdfDownload = async (inv) => {
    try {
      await downloadPdf(inv.id, `${inv.full_number || inv.id}.pdf`);
    } catch {
      // silent
    }
  };

  // ── Render helpers ──

  const renderStatusChip = (inv) => {
    if (isOverdue(inv) && !["paid", "partially_paid"].includes(inv.status)) {
      return <Chip label="Vėluojanti" color="error" size="small" variant="outlined" />;
    }
    if (inv.status === "partially_paid") {
      const paid = parseFloat(inv.paid_amount || 0);
      const totalAmt = parseFloat(inv.amount_with_vat || 0);
      return (
        <Chip
          label={`Dalinai ${paid.toFixed(0)}/${totalAmt.toFixed(0)} €`}
          color="warning"
          size="small"
          variant="outlined"
        />
      );
    }
    return (
      <Chip
        label={STATUS_CONFIG[inv.status]?.label || inv.status}
        color={STATUS_CONFIG[inv.status]?.color || "default"}
        size="small"
        variant="outlined"
      />
    );
  };

  const renderNumberLink = (inv) => {
    const display = inv.full_number || "—";
    if (inv.status === "draft") {
      return (
        <Typography fontWeight={700} fontSize={13}>
          {display}
        </Typography>
      );
    }
    return (
      <Typography
        fontWeight={700}
        fontSize={13}
        sx={{ color: "#1976d2", cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
        onClick={(e) => {
          e.stopPropagation();
          setPreviewInvoiceId(inv.id);
        }}
      >
        {display}
      </Typography>
    );
  };

  const renderEmailIcon = (inv) => {
    if (inv.status === "draft" || !inv.email_sent_count) {
      return (
        <Typography variant="caption" color="text.disabled">
          —
        </Typography>
      );
    }
    let icon, color;
    if (inv.email_last_status === "opened") {
      icon = <MarkEmailReadIcon sx={{ fontSize: 18 }} />;
      color = "success.main";
    } else if (inv.email_last_status === "failed") {
      icon = <ErrorOutlineIcon sx={{ fontSize: 18 }} />;
      color = "error.main";
    } else {
      icon = <MailOutlineIcon sx={{ fontSize: 18 }} />;
      color = "text.secondary";
    }
    return (
      <Tooltip title={`${inv.email_sent_count} el. laiškų`}>
        <IconButton size="small" sx={{ color }}>
          {icon}
        </IconButton>
      </Tooltip>
    );
  };

  // ── Mobile card ──

  const renderMobileCard = (inv) => (
    <Paper key={inv.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 1 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
        <Box>
          {renderNumberLink(inv)}
          <Typography variant="caption" color="text.secondary">
            {TYPE_CONFIG[inv.invoice_type]?.label}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {inv.exported && (
            <Chip label="Eksp." size="small" color="secondary" variant="outlined" sx={{ fontSize: 10, height: 20 }} />
          )}
          {renderStatusChip(inv)}
        </Box>
      </Box>
      <Typography variant="caption" color="primary" fontWeight={600}>
        ID: {inv.user_id ?? "—"} · {inv.owner_email || "—"}
      </Typography>
      <Typography variant="body2">{inv.buyer_name || "—"}</Typography>
      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {fmtDate(inv.invoice_date)}
        </Typography>
        <Typography fontWeight={700}>
          {fmtAmount(inv.amount_with_vat || inv.amount_wo_vat, inv.currency)}
        </Typography>
      </Box>
      <Box sx={{ mt: 1, display: "flex", justifyContent: "flex-end" }}>
        <Tooltip title="Parsisiųsti PDF">
          <IconButton size="small" onClick={() => handlePdfDownload(inv)} disabled={pdfLoading}>
            {pdfLoading ? <CircularProgress size={16} /> : <DownloadIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
    </Paper>
  );

  // ── Access check ──

  if (userLoaded && !user?.is_superuser) {
    return (
      <Box p={4}>
        <Alert severity="error">Neturite prieigos prie administratoriaus suvestinės.</Alert>
      </Box>
    );
  }

  // ══════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1500, mx: "auto", overflowX: "hidden" }}>
      <Helmet>
        <title>Visos sąskaitos (Admin)</title>
      </Helmet>

      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="h5" fontWeight={600}>
            Visos sąskaitos
          </Typography>
          <Chip size="small" label={`Įkelta: ${invoices.length}${hasMoreRef.current ? "+" : ""} / ${total}`} />
        </Box>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadInvoices} disabled={loading}>
          Atnaujinti
        </Button>
      </Box>

      {/* Filters */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 1.5,
            alignItems: "center",
          }}
        >
          <TextField
            size="small"
            placeholder="Ieškoti (pirkėjas, numeris, el. paštas...)"
            value={filters.q}
            onChange={(e) => updateFilter("q", e.target.value)}
            sx={{ minWidth: 260, flex: 1 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
          <TextField
            size="small"
            select
            label="Statusas"
            value={filters.status}
            onChange={(e) => updateFilter("status", e.target.value)}
            sx={{ minWidth: 160 }}
            SelectProps={{ MenuProps: { disableScrollLock: true }, displayEmpty: true }}
            InputLabelProps={{ shrink: true }}
          >
            <MenuItem value="">Visi</MenuItem>
            <MenuItem value="draft">Juodraštis</MenuItem>
            <MenuItem value="issued">Išrašyta</MenuItem>
            <MenuItem value="sent">Išsiųsta</MenuItem>
            <MenuItem value="partially_paid">Dalinai apmokėta</MenuItem>
            <MenuItem value="paid">Apmokėta</MenuItem>
            <MenuItem value="cancelled">Atšaukta</MenuItem>
          </TextField>
          <TextField
            size="small"
            select
            label="Tipas"
            value={filters.invoice_type}
            onChange={(e) => updateFilter("invoice_type", e.target.value)}
            sx={{ minWidth: 150 }}
            SelectProps={{ MenuProps: { disableScrollLock: true }, displayEmpty: true }}
            InputLabelProps={{ shrink: true }}
          >
            <MenuItem value="">Visi</MenuItem>
            <MenuItem value="isankstine">Išankstinė SF</MenuItem>
            <MenuItem value="pvm_saskaita">PVM SF</MenuItem>
            <MenuItem value="saskaita">SF (be PVM)</MenuItem>
            <MenuItem value="kreditine">Kreditinė SF</MenuItem>
          </TextField>
          <DateField size="small" label="Nuo" value={filters.date_from} onChange={(v) => updateFilter("date_from", v)} />
          <DateField size="small" label="Iki" value={filters.date_to} onChange={(v) => updateFilter("date_to", v)} />
        </Box>
      </Paper>

      {/* Loading */}
      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Content */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
          <CircularProgress />
        </Box>
      ) : invoices.length === 0 && !loadingMore ? (
        <Paper sx={{ p: 6, textAlign: "center", borderRadius: 3 }}>
          <Typography variant="h6" color="text.secondary">
            Sąskaitų nerasta
          </Typography>
        </Paper>
      ) : isMobile ? (
        <Box>
          {invoices.map((inv) => renderMobileCard(inv))}
          <Box ref={sentinelRef} sx={{ height: 1 }} />
          {loadingMore && (
            <Box sx={{ py: 2, textAlign: "center" }}>
              <LinearProgress sx={{ maxWidth: 200, mx: "auto", mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                Kraunama daugiau...
              </Typography>
            </Box>
          )}
          {!hasMoreRef.current && !loading && !loadingMore && invoices.length > 0 && (
            <Typography variant="body2" color="text.disabled" textAlign="center" sx={{ py: 1.5 }}>
              Visi dokumentai įkelti ({invoices.length})
            </Typography>
          )}
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow
                sx={{ "& th": { fontWeight: 700, fontSize: 12, py: 1.5, backgroundColor: "#f5f5f5" } }}
              >
                <TableCell>User ID</TableCell>
                <TableCell>Vartotojo el. paštas</TableCell>
                <TableCell>Tipas</TableCell>
                <TableCell>Serija-Numeris</TableCell>
                <TableCell>Statusas</TableCell>
                <TableCell>Pirkėjas</TableCell>
                <TableCell>Išrašymo data</TableCell>
                <TableCell>Mokėti iki</TableCell>
                <TableCell align="right">Suma</TableCell>
                <TableCell align="center">Eksp.</TableCell>
                <TableCell align="center" sx={{ width: 44 }}>
                  <MailOutlineIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                </TableCell>
                <TableCell align="center">PDF</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id} hover sx={{ "& td": { py: 1.2 } }}>
                  <TableCell>
                    <Typography variant="caption" fontWeight={600}>
                      {inv.user_id ?? "—"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontSize={12} noWrap sx={{ maxWidth: 200 }}>
                      {inv.owner_email || "—"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" fontWeight={600}>
                      {TYPE_CONFIG[inv.invoice_type]?.label || inv.invoice_type}
                    </Typography>
                  </TableCell>
                  <TableCell>{renderNumberLink(inv)}</TableCell>
                  <TableCell>{renderStatusChip(inv)}</TableCell>
                  <TableCell>{inv.buyer_name || "—"}</TableCell>
                  <TableCell>{fmtDate(inv.invoice_date)}</TableCell>
                  <TableCell>
                    <Typography
                      fontSize={13}
                      color={isOverdue(inv) ? "error.main" : "text.primary"}
                      fontWeight={isOverdue(inv) ? 600 : 400}
                    >
                      {fmtDate(inv.due_date)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography fontWeight={700} fontSize={13}>
                      {fmtAmount(
                        inv.pvm_tipas === "taikoma" ? inv.amount_with_vat : inv.amount_wo_vat,
                        inv.currency
                      )}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    {inv.exported ? (
                      <Tooltip
                        title={
                          inv.exported_at
                            ? `Eksportuota: ${fmtDate((inv.exported_at || "").split("T")[0])}`
                            : "Eksportuota"
                        }
                      >
                        <Chip
                          label="✓"
                          size="small"
                          color="success"
                          variant="outlined"
                          sx={{ minWidth: 32, fontSize: 12 }}
                        />
                      </Tooltip>
                    ) : (
                      <Typography variant="caption" color="text.disabled">
                        —
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="center" sx={{ width: 44, px: 0.5 }}>
                    {renderEmailIcon(inv)}
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Parsisiųsti PDF">
                      <IconButton
                        size="small"
                        onClick={() => handlePdfDownload(inv)}
                        disabled={pdfLoading || inv.status === "draft"}
                      >
                        {pdfLoading ? (
                          <CircularProgress size={16} />
                        ) : (
                          <DownloadIcon fontSize="small" />
                        )}
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}

              {/* Sentinel for infinite scroll */}
              <TableRow ref={sentinelRef}>
                <TableCell colSpan={12} sx={{ p: 0, border: 0, height: 1 }} />
              </TableRow>
              {loadingMore && (
                <TableRow>
                  <TableCell colSpan={12} align="center" sx={{ py: 2 }}>
                    <LinearProgress sx={{ maxWidth: 200, mx: "auto", mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Kraunama daugiau...
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {!hasMoreRef.current && !loading && !loadingMore && invoices.length > 0 && (
                <TableRow>
                  <TableCell colSpan={12} align="center" sx={{ py: 1.5, color: "text.disabled" }}>
                    <Typography variant="body2">
                      Visi dokumentai įkelti ({invoices.length})
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Invoice Preview Dialog */}
      <InvoicePreviewDialog
        open={!!previewInvoiceId}
        onClose={() => setPreviewInvoiceId(null)}
        invoiceId={previewInvoiceId}
        disableScrollLock
      />
    </Box>
  );
}