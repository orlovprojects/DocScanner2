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
  Popover,
  Tabs,
  Tab,
  useTheme,
  useMediaQuery,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import {
  Search as SearchIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import { CalendarMonth as CalendarMonthIcon } from "@mui/icons-material";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import MarkEmailReadIcon from "@mui/icons-material/MarkEmailRead";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import LoopIcon from "@mui/icons-material/Loop";
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

const RECURRING_STATUS = {
  active:    { label: "Aktyvi",       color: "success" },
  paused:    { label: "Pristabdyta",  color: "warning" },
  finished:  { label: "Baigta",       color: "default" },
  cancelled: { label: "Atšaukta",     color: "default" },
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

const fmtFrequency = (rec) => {
  if (rec.first_day_of_month) return "Kas pirma mėn. diena";
  if (rec.last_day_of_month) return "Kas paskutinė mėn. diena";
  const labels = {
    daily:     { 1: "Kasdien",      default: (n) => `Kas ${n} d.` },
    weekly:    { 1: "Kas savaitę",   default: (n) => `Kas ${n} sav.` },
    monthly:   { 1: "Kas mėnesį",   default: (n) => `Kas ${n} mėn.` },
    quarterly: { 1: "Kas ketvirtį",  default: (n) => `Kas ${n} ketv.` },
    yearly:    { 1: "Kas metus",     default: (n) => `Kas ${n} m.` },
  };
  const group = labels[rec.frequency];
  if (!group) return rec.frequency;
  if (rec.interval === 1) return group[1];
  return group.default(rec.interval);
};

const LIMIT = 50;

// ══════════════════════════════════════════
// Component
// ══════════════════════════════════════════

export default function AdminIsrasytosSaskaitos() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  // ── Auth ──
  const [user, setUser] = useState(null);
  const [userLoaded, setUserLoaded] = useState(false);

  // ── Tab: 0 = Išrašytos, 1 = Periodinės ──
  const [activeTab, setActiveTab] = useState(0);

  // ── Invoices ──
  const [invoices, setInvoices] = useState([]);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // ── Recurring ──
  const [recurring, setRecurring] = useState([]);
  const [recurringTotal, setRecurringTotal] = useState(0);
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [recurringLoadingMore, setRecurringLoadingMore] = useState(false);

    const [planDialog, setPlanDialog] = useState({ open: false, recurringId: null, data: null, loading: false });

  // ── Filters ──
  const defaultDates = useMemo(() => getDefaultDates(), []);
  const [filters, setFilters] = useState({
    q: "",
    status: "",
    invoice_type: "",
    date_from: defaultDates.date_from,
    date_to: defaultDates.date_to,
  });
  const [recurringStatusFilter, setRecurringStatusFilter] = useState("");

  // ── Infinite scroll ──
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const abortRef = useRef(null);
  const sentinelRef = useRef(null);
  const observerRef = useRef(null);

  // ── Preview ──
  const [previewInvoiceId, setPreviewInvoiceId] = useState(null);
  const { downloadPdf, pdfLoading } = useInvoicePdf();

  // ── Email popover ──
  const [emailPopover, setEmailPopover] = useState({
    anchorEl: null, invoiceId: null, emails: [], loading: false,
  });

  // ── Load user ──
  useEffect(() => {
    api.get("/profile/", { withCredentials: true })
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setUserLoaded(true));
  }, []);

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  // ════════════════════════════════════════
  // Invoices
  // ════════════════════════════════════════

  const buildInvoiceParams = useCallback((offset) => {
    const p = { limit: LIMIT, offset };
    if (filters.q) p.q = filters.q;
    if (filters.status) p.status = filters.status;
    if (filters.invoice_type) p.invoice_type = filters.invoice_type;
    if (filters.date_from) p.date_from = filters.date_from;
    if (filters.date_to) p.date_to = filters.date_to;
    return p;
  }, [filters]);

  const loadInvoices = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    offsetRef.current = 0;
    hasMoreRef.current = true;

    try {
      const { data } = await api.get("/admin/visos-saskaitos/", {
        params: buildInvoiceParams(0), withCredentials: true, signal: ctrl.signal,
      });
      const r = data.results || [];
      setInvoices(r);
      setInvoiceTotal(data.count || 0);
      offsetRef.current = r.length;
      hasMoreRef.current = r.length < (data.count || 0);
    } catch (e) {
      if (e.name === "AbortError" || e.name === "CanceledError") return;
      setInvoices([]); setInvoiceTotal(0);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [buildInvoiceParams]);

  const loadMoreInvoices = useCallback(async () => {
    if (!hasMoreRef.current || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const { data } = await api.get("/admin/visos-saskaitos/", {
        params: buildInvoiceParams(offsetRef.current), withCredentials: true,
      });
      const r = data.results || [];
      setInvoices((prev) => [...prev, ...r]);
      offsetRef.current += r.length;
      hasMoreRef.current = offsetRef.current < (data.count || 0);
    } catch {}
    finally { setLoadingMore(false); }
  }, [buildInvoiceParams, loadingMore, loading]);

  // ════════════════════════════════════════
  // Recurring
  // ════════════════════════════════════════

  const loadRecurring = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setRecurringLoading(true);
    offsetRef.current = 0;
    hasMoreRef.current = true;

    try {
      const params = { limit: LIMIT, offset: 0 };
      if (filters.q) params.q = filters.q;
      if (recurringStatusFilter) params.status = recurringStatusFilter;
      const { data } = await api.get("/admin/visos-periodines/", {
        params, withCredentials: true, signal: ctrl.signal,
      });
      const r = data.results || [];
      setRecurring(r);
      setRecurringTotal(data.count || 0);
      offsetRef.current = r.length;
      hasMoreRef.current = r.length < (data.count || 0);
    } catch (e) {
      if (e.name === "AbortError" || e.name === "CanceledError") return;
      setRecurring([]); setRecurringTotal(0);
    } finally {
      if (!ctrl.signal.aborted) setRecurringLoading(false);
    }
  }, [filters.q, recurringStatusFilter]);

  const loadMoreRecurring = useCallback(async () => {
    if (!hasMoreRef.current || recurringLoadingMore || recurringLoading) return;
    setRecurringLoadingMore(true);
    try {
      const params = { limit: LIMIT, offset: offsetRef.current };
      if (filters.q) params.q = filters.q;
      if (recurringStatusFilter) params.status = recurringStatusFilter;
      const { data } = await api.get("/admin/visos-periodines/", {
        params, withCredentials: true,
      });
      const r = data.results || [];
      setRecurring((prev) => [...prev, ...r]);
      offsetRef.current += r.length;
      hasMoreRef.current = offsetRef.current < (data.count || 0);
    } catch {}
    finally { setRecurringLoadingMore(false); }
  }, [filters.q, recurringStatusFilter, recurringLoadingMore, recurringLoading]);

  // ── Effects ──

  useEffect(() => {
    if (!userLoaded || !user?.is_superuser) return;
    if (activeTab === 0) loadInvoices();
    else loadRecurring();
  }, [userLoaded, user?.is_superuser, activeTab]);

  // Invoices filter reload
  useEffect(() => {
    if (!userLoaded || !user?.is_superuser || activeTab !== 0) return;
    loadInvoices();
  }, [filters.status, filters.invoice_type, filters.date_from, filters.date_to, filters.q]);

  // Recurring filter reload
  useEffect(() => {
    if (!userLoaded || !user?.is_superuser || activeTab !== 1) return;
    loadRecurring();
  }, [recurringStatusFilter, filters.q]);

  // ── IntersectionObserver ──

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    const isRec = activeTab === 1;
    const busy = isRec ? (recurringLoading || recurringLoadingMore) : (loading || loadingMore);

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current && !busy) {
          if (isRec) loadMoreRecurring(); else loadMoreInvoices();
        }
      },
      { rootMargin: "300px" },
    );

    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [activeTab, loadMoreInvoices, loadMoreRecurring, loadingMore, loading, recurringLoadingMore, recurringLoading]);

  // ── Helpers ──

  const updateFilter = (field, value) => setFilters((p) => ({ ...p, [field]: value }));

  const isOverdue = (inv) => {
    if (inv.is_overdue) return true;
    if (!["issued", "sent"].includes(inv.status) || !inv.due_date) return false;
    return inv.due_date < new Date().toISOString().split("T")[0];
  };

  const handlePdfDownload = async (inv) => {
    try { await downloadPdf(inv.id, `${inv.full_number || inv.id}.pdf`); } catch {}
  };

  const handleRefresh = () => { if (activeTab === 0) loadInvoices(); else loadRecurring(); };

    const openPlanDialog = async (recurringId) => {
    setPlanDialog({ open: true, recurringId, data: null, loading: true });
    try {
        const { data } = await invoicingApi.getRecurringPlanHistory(recurringId);
        setPlanDialog((p) => ({ ...p, data, loading: false }));
    } catch {
        setPlanDialog((p) => ({ ...p, loading: false }));
    }
    };

  // ── Email popover ──

  const handleEmailIconClick = async (e, inv) => {
    e.stopPropagation();
    setEmailPopover({ anchorEl: e.currentTarget, invoiceId: inv.id, emails: [], loading: true });
    try {
      const { data } = await invoicingApi.getInvoiceEmails(inv.id);
      setEmailPopover((p) => ({ ...p, emails: data || [], loading: false }));
    } catch {
      setEmailPopover((p) => ({ ...p, loading: false }));
    }
  };

  // ── Render helpers ──

  const renderStatusChip = (inv) => {
    if (isOverdue(inv) && !["paid", "partially_paid"].includes(inv.status)) {
      return <Chip label="Vėluojanti" color="error" size="small" variant="outlined" />;
    }
    if (inv.status === "partially_paid") {
      const paid = parseFloat(inv.paid_amount || 0);
      const tot = parseFloat(inv.amount_with_vat || 0);
      return <Chip label={`Dalinai ${paid.toFixed(0)}/${tot.toFixed(0)} €`} color="warning" size="small" variant="outlined" />;
    }
    return (
      <Chip
        label={STATUS_CONFIG[inv.status]?.label || inv.status}
        color={STATUS_CONFIG[inv.status]?.color || "default"}
        size="small" variant="outlined"
      />
    );
  };

  const renderNumberLink = (inv) => {
    const display = inv.full_number || "—";
    if (inv.status === "draft") return <Typography fontWeight={700} fontSize={13}>{display}</Typography>;
    return (
      <Typography
        fontWeight={700} fontSize={13}
        sx={{ color: "#1976d2", cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
        onClick={(e) => { e.stopPropagation(); setPreviewInvoiceId(inv.id); }}
      >
        {display}
      </Typography>
    );
  };

  const renderEmailIcon = (inv) => {
    if (inv.status === "draft" || !inv.email_sent_count) {
      return <Typography variant="caption" color="text.disabled">—</Typography>;
    }
    let icon, color;
    if (inv.email_last_status === "opened") {
      icon = <MarkEmailReadIcon sx={{ fontSize: 18 }} />; color = "success.main";
    } else if (inv.email_last_status === "failed") {
      icon = <ErrorOutlineIcon sx={{ fontSize: 18 }} />; color = "error.main";
    } else {
      icon = <MailOutlineIcon sx={{ fontSize: 18 }} />; color = "text.secondary";
    }
    return (
      <Tooltip title={`${inv.email_sent_count} el. laiškų`}>
        <IconButton size="small" sx={{ color }} onClick={(e) => handleEmailIconClick(e, inv)}>
          {icon}
        </IconButton>
      </Tooltip>
    );
  };

  const renderSentinel = (colSpan, isTable, isLoading, isLoadingMore, count) => {
    if (isTable) {
      return (
        <>
          <TableRow ref={sentinelRef}>
            <TableCell colSpan={colSpan} sx={{ p: 0, border: 0, height: 1 }} />
          </TableRow>
          {isLoadingMore && (
            <TableRow>
              <TableCell colSpan={colSpan} align="center" sx={{ py: 2 }}>
                <LinearProgress sx={{ maxWidth: 200, mx: "auto", mb: 1 }} />
                <Typography variant="body2" color="text.secondary">Kraunama daugiau...</Typography>
              </TableCell>
            </TableRow>
          )}
          {!hasMoreRef.current && !isLoading && !isLoadingMore && count > 0 && (
            <TableRow>
              <TableCell colSpan={colSpan} align="center" sx={{ py: 1.5, color: "text.disabled" }}>
                <Typography variant="body2">Visi dokumentai įkelti ({count})</Typography>
              </TableCell>
            </TableRow>
          )}
        </>
      );
    }
    return (
      <>
        <Box ref={sentinelRef} sx={{ height: 1 }} />
        {isLoadingMore && (
          <Box sx={{ py: 2, textAlign: "center" }}>
            <LinearProgress sx={{ maxWidth: 200, mx: "auto", mb: 1 }} />
            <Typography variant="body2" color="text.secondary">Kraunama daugiau...</Typography>
          </Box>
        )}
        {!hasMoreRef.current && !isLoading && !isLoadingMore && count > 0 && (
          <Typography variant="body2" color="text.disabled" textAlign="center" sx={{ py: 1.5 }}>
            Visi dokumentai įkelti ({count})
          </Typography>
        )}
      </>
    );
  };

  // ── Access check ──

  if (userLoaded && !user?.is_superuser) {
    return (
      <Box p={4}>
        <Alert severity="error">Neturite prieigos prie administratoriaus suvestinės.</Alert>
      </Box>
    );
  }

  const isInv = activeTab === 0;
  const curLoading = isInv ? loading : recurringLoading;
  const curCount = isInv ? invoices.length : recurring.length;
  const curTotal = isInv ? invoiceTotal : recurringTotal;

  // ══════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1500, mx: "auto", overflowX: "hidden" }}>
      <Helmet><title>Visos sąskaitos (Admin)</title></Helmet>

      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="h5" fontWeight={600}>Visos sąskaitos</Typography>
          <Chip size="small" label={`Įkelta: ${curCount}${hasMoreRef.current ? "+" : ""} / ${curTotal}`} />
        </Box>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={handleRefresh} disabled={curLoading}>
          Atnaujinti
        </Button>
      </Box>

      {/* Tabs */}
      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        <Tab label="Išrašytos sąskaitos" />
        <Tab label="Periodinės sąskaitos" icon={<LoopIcon sx={{ fontSize: 18 }} />} iconPosition="start" />
      </Tabs>

      {/* Filters */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
          <TextField
            size="small"
            placeholder="Ieškoti (pirkėjas, numeris, el. paštas...)"
            value={filters.q}
            onChange={(e) => updateFilter("q", e.target.value)}
            sx={{ minWidth: 260, flex: 1 }}
            slotProps={{
              input: {
                startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
              },
            }}
          />

          {isInv ? (
            <>
              <TextField
                size="small" select label="Statusas" value={filters.status}
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
                size="small" select label="Tipas" value={filters.invoice_type}
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
            </>
          ) : (
            <TextField
              size="small" select label="Statusas" value={recurringStatusFilter}
              onChange={(e) => setRecurringStatusFilter(e.target.value)}
              sx={{ minWidth: 160 }}
              SelectProps={{ MenuProps: { disableScrollLock: true }, displayEmpty: true }}
              InputLabelProps={{ shrink: true }}
            >
              <MenuItem value="">Visi</MenuItem>
              <MenuItem value="active">Aktyvi</MenuItem>
              <MenuItem value="paused">Pristabdyta</MenuItem>
              <MenuItem value="finished">Baigta</MenuItem>
              <MenuItem value="cancelled">Atšaukta</MenuItem>
            </TextField>
          )}
        </Box>
      </Paper>

      {curLoading && <LinearProgress sx={{ mb: 2 }} />}

      {/* ═══ Invoices Tab ═══ */}
      {isInv && (
        <>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}><CircularProgress /></Box>
          ) : invoices.length === 0 && !loadingMore ? (
            <Paper sx={{ p: 6, textAlign: "center", borderRadius: 3 }}>
              <Typography variant="h6" color="text.secondary">Sąskaitų nerasta</Typography>
            </Paper>
          ) : isMobile ? (
            <Box>
              {invoices.map((inv) => (
                <Paper key={inv.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 1 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                    <Box>
                      {renderNumberLink(inv)}
                      <Typography variant="caption" color="text.secondary">{TYPE_CONFIG[inv.invoice_type]?.label}</Typography>
                    </Box>
                    {renderStatusChip(inv)}
                  </Box>
                  <Typography variant="caption" color="primary" fontWeight={600}>
                    ID: {inv.user_id ?? "—"} · {inv.owner_email || "—"}
                  </Typography>
                  <Typography variant="body2">{inv.buyer_name || "—"}</Typography>
                  <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1 }}>
                    <Typography variant="body2" color="text.secondary">{fmtDate(inv.invoice_date)}</Typography>
                    <Typography fontWeight={700}>{fmtAmount(inv.amount_with_vat || inv.amount_wo_vat, inv.currency)}</Typography>
                  </Box>
                  <Box sx={{ mt: 1, display: "flex", justifyContent: "flex-end", gap: 0.5 }}>
                    {renderEmailIcon(inv)}
                    <Tooltip title="Parsisiųsti PDF">
                      <IconButton size="small" onClick={() => handlePdfDownload(inv)} disabled={pdfLoading || inv.status === "draft"}>
                        {pdfLoading ? <CircularProgress size={16} /> : <DownloadIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Paper>
              ))}
              {renderSentinel(null, false, loading, loadingMore, invoices.length)}
            </Box>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ "& th": { fontWeight: 700, fontSize: 12, py: 1.5, backgroundColor: "#f5f5f5" } }}>
                    <TableCell>User ID</TableCell>
                    <TableCell>Vartotojo el. paštas</TableCell>
                    <TableCell>Tipas</TableCell>
                    <TableCell>Serija-Numeris</TableCell>
                    <TableCell>Statusas</TableCell>
                    <TableCell>Pirkėjas</TableCell>
                    <TableCell>Išrašymo data</TableCell>
                    <TableCell>Mokėti iki</TableCell>
                    <TableCell align="right">Suma</TableCell>
                    <TableCell align="left">Veiksmai</TableCell>
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
                      <TableCell><Typography variant="caption" fontWeight={600}>{inv.user_id ?? "—"}</Typography></TableCell>
                      <TableCell>
                        <Typography variant="body2" fontSize={12} noWrap sx={{ maxWidth: 200 }}>{inv.owner_email || "—"}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" fontWeight={600}>{TYPE_CONFIG[inv.invoice_type]?.label || inv.invoice_type}</Typography>
                      </TableCell>
                      <TableCell>{renderNumberLink(inv)}</TableCell>
                      <TableCell>{renderStatusChip(inv)}</TableCell>
                      <TableCell>{inv.buyer_name || "—"}</TableCell>
                      <TableCell>{fmtDate(inv.invoice_date)}</TableCell>
                      <TableCell>
                        <Typography fontSize={13} color={isOverdue(inv) ? "error.main" : "text.primary"} fontWeight={isOverdue(inv) ? 600 : 400}>
                          {fmtDate(inv.due_date)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography fontWeight={700} fontSize={13}>
                          {fmtAmount(inv.pvm_tipas === "taikoma" ? inv.amount_with_vat : inv.amount_wo_vat, inv.currency)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        {inv.exported ? (
                          <Tooltip title={inv.exported_at ? `Eksportuota: ${fmtDate((inv.exported_at || "").split("T")[0])}` : "Eksportuota"}>
                            <Chip label="✓" size="small" color="success" variant="outlined" sx={{ minWidth: 32, fontSize: 12 }} />
                          </Tooltip>
                        ) : <Typography variant="caption" color="text.disabled">—</Typography>}
                      </TableCell>
                      <TableCell align="center" sx={{ width: 44, px: 0.5 }}>{renderEmailIcon(inv)}</TableCell>
                      <TableCell align="center">
                        <Tooltip title="Parsisiųsti PDF">
                          <IconButton size="small" onClick={() => handlePdfDownload(inv)} disabled={pdfLoading || inv.status === "draft"}>
                            {pdfLoading ? <CircularProgress size={16} /> : <DownloadIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {renderSentinel(12, true, loading, loadingMore, invoices.length)}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* ═══ Recurring Tab ═══ */}
      {!isInv && (
        <>
          {recurringLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}><CircularProgress /></Box>
          ) : recurring.length === 0 && !recurringLoadingMore ? (
            <Paper sx={{ p: 6, textAlign: "center", borderRadius: 3 }}>
              <Typography variant="h6" color="text.secondary">Periodinių sąskaitų nerasta</Typography>
            </Paper>
          ) : isMobile ? (
            <Box>
              {recurring.map((rec) => (
                <Paper key={rec.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 1 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                    <Box>
                      <Typography fontWeight={700} fontSize={13}>
                        {rec.document_series} · {TYPE_CONFIG[rec.invoice_type]?.label}
                      </Typography>
                      <Typography variant="body2">{rec.buyer_name || "—"}</Typography>
                    </Box>
                    <Chip
                      label={RECURRING_STATUS[rec.status]?.label}
                      color={RECURRING_STATUS[rec.status]?.color}
                      size="small" variant="outlined"
                    />
                  </Box>
                  <Typography variant="caption" color="primary" fontWeight={600}>
                    ID: {rec.user_id ?? "—"} · {rec.owner_email || "—"}
                  </Typography>
                  <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">{fmtFrequency(rec)}</Typography>
                    <Typography fontWeight={700} fontSize={13}>{fmtAmount(rec.estimated_amount, rec.currency)}</Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Sekanti: {rec.next_run_at ? fmtDate(rec.next_run_at.split("T")[0]) : "—"}
                  </Typography>
                  <Box sx={{ mt: 1, display: "flex", justifyContent: "flex-end" }}>
                    <Tooltip title="Planas ir istorija">
                        <IconButton size="small" onClick={() => openPlanDialog(rec.id)}>
                        <CalendarMonthIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                  </Box>
                </Paper>
              ))}
              {renderSentinel(null, false, recurringLoading, recurringLoadingMore, recurring.length)}
            </Box>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ "& th": { fontWeight: 700, fontSize: 12, py: 1.5, backgroundColor: "#f5f5f5" } }}>
                    <TableCell>User ID</TableCell>
                    <TableCell>Vartotojo el. paštas</TableCell>
                    <TableCell>Tipas</TableCell>
                    <TableCell>Serija</TableCell>
                    <TableCell>Pirkėjas</TableCell>
                    <TableCell>Dažnumas</TableCell>
                    <TableCell>Statusas</TableCell>
                    <TableCell>Sekanti sąskaita</TableCell>
                    <TableCell align="center">Išrašyta</TableCell>
                    <TableCell align="right">Suma</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recurring.map((rec) => (
                    <TableRow key={rec.id} hover sx={{ "& td": { py: 1.2 } }}>
                      <TableCell><Typography variant="caption" fontWeight={600}>{rec.user_id ?? "—"}</Typography></TableCell>
                      <TableCell>
                        <Typography variant="body2" fontSize={12} noWrap sx={{ maxWidth: 200 }}>{rec.owner_email || "—"}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" fontWeight={600}>{TYPE_CONFIG[rec.invoice_type]?.label}</Typography>
                      </TableCell>
                      <TableCell><Typography fontWeight={700} fontSize={13}>{rec.document_series || "—"}</Typography></TableCell>
                      <TableCell>{rec.buyer_name || "—"}</TableCell>
                      <TableCell><Typography variant="body2" fontSize={13}>{fmtFrequency(rec)}</Typography></TableCell>
                      <TableCell>
                        <Chip
                          label={RECURRING_STATUS[rec.status]?.label || rec.status}
                          color={RECURRING_STATUS[rec.status]?.color || "default"}
                          size="small" variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography fontSize={13}>{rec.next_run_at ? fmtDate(rec.next_run_at.split("T")[0]) : "—"}</Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography fontSize={13} fontWeight={600}>{rec.generation_count}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography fontWeight={700} fontSize={13}>{fmtAmount(rec.estimated_amount, rec.currency)}</Typography>
                      </TableCell>
                        <TableCell align="left" onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="Planas ir istorija">
                            <IconButton size="small" onClick={() => openPlanDialog(rec.id)}>
                            <CalendarMonthIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        </TableCell>
                    </TableRow>
                  ))}
                  {renderSentinel(11, true, recurringLoading, recurringLoadingMore, recurring.length)}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* Invoice Preview */}
      <InvoicePreviewDialog
        open={!!previewInvoiceId}
        onClose={() => setPreviewInvoiceId(null)}
        invoiceId={previewInvoiceId}
        disableScrollLock
      />

        {/* Plan & History Dialog */}
        <Dialog
        open={planDialog.open}
        onClose={() => setPlanDialog({ open: false, recurringId: null, data: null, loading: false })}
        maxWidth="sm" fullWidth disableScrollLock
        >
        <DialogTitle>Siuntimo planas ir istorija</DialogTitle>
        <DialogContent>
            {planDialog.loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress /></Box>
            ) : planDialog.data ? (
            <Box>
                {planDialog.data.past?.length > 0 && (
                <>
                    <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>Istorija</Typography>
                    <Box sx={{ mb: 2 }}>
                    {planDialog.data.past.map((run, i) => (
                        <Box key={i} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", py: 0.5, borderBottom: "1px solid #f0f0f0" }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Typography variant="body2" fontSize={13}>{fmtDate(run.date)}</Typography>
                            <Chip
                            label={run.status === "success" ? "Sėkminga" : run.status === "failed" ? "Nepavyko" : "Vykdoma"}
                            color={run.status === "success" ? "success" : run.status === "failed" ? "error" : "default"}
                            size="small" variant="outlined" sx={{ fontSize: 11, height: 20 }}
                            />
                        </Box>
                        </Box>
                    ))}
                    </Box>
                </>
                )}
                {planDialog.data.future?.length > 0 && (
                <>
                    <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>Būsimos sąskaitos</Typography>
                    <Box>
                    {planDialog.data.future.map((date, i) => (
                        <Box key={i} sx={{ py: 0.5, borderBottom: "1px solid #f0f0f0" }}>
                        <Typography variant="body2" fontSize={13}>{fmtDate(date)}</Typography>
                        </Box>
                    ))}
                    </Box>
                </>
                )}
                {!planDialog.data.past?.length && !planDialog.data.future?.length && (
                <Typography color="text.secondary" sx={{ py: 2, textAlign: "center" }}>Nėra duomenų</Typography>
                )}
            </Box>
            ) : null}
        </DialogContent>
        <DialogActions>
            <Button onClick={() => setPlanDialog({ open: false, recurringId: null, data: null, loading: false })}>
            Uždaryti
            </Button>
        </DialogActions>
        </Dialog>

      {/* Email History Popover */}
      <Popover
        open={Boolean(emailPopover.anchorEl)}
        anchorEl={emailPopover.anchorEl}
        onClose={() => setEmailPopover({ anchorEl: null, invoiceId: null, emails: [], loading: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        disableScrollLock
        slotProps={{ paper: { sx: { borderRadius: 2, minWidth: 320, maxWidth: 420 } } }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>El. laiškų siuntimo istorija</Typography>
          {emailPopover.loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}><CircularProgress size={24} /></Box>
          ) : emailPopover.emails.length === 0 ? (
            <Typography variant="body2" color="text.secondary">Nėra išsiųstų laiškų</Typography>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {emailPopover.emails.map((em) => (
                <Box key={em.id} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", py: 0.75, borderBottom: "1px solid #f0f0f0" }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontSize={13} fontWeight={600} noWrap>{em.email_type_display}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>{em.to_email}</Typography>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0, ml: 1 }}>
                    <Chip
                      label={
                        em.status === "sent" && em.opened_at ? `Atidaryta (${em.open_count})`
                        : em.status === "sent" ? "Išsiųsta"
                        : em.status === "pending" ? "Laukiama"
                        : em.status === "failed" ? "Nepavyko"
                        : em.status === "bounced" ? "Atmesta"
                        : em.status
                      }
                      size="small"
                      color={
                        em.opened_at ? "success"
                        : em.status === "sent" ? "primary"
                        : em.status === "failed" || em.status === "bounced" ? "error"
                        : "default"
                      }
                      variant="outlined" sx={{ fontSize: 11, height: 22 }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                      {em.sent_at ? new Date(em.sent_at).toLocaleString("lt-LT", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Popover>
    </Box>
  );
}