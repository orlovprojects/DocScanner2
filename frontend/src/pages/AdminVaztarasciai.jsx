// src/pages/AdminVaztarasciai.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Helmet } from "react-helmet";
import {
  Box, Button, Typography, Alert, LinearProgress, Chip, TextField, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  IconButton, Menu, Skeleton, Tooltip,
  useTheme, useMediaQuery,
} from "@mui/material";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SearchIcon from "@mui/icons-material/Search";
import InputAdornment from "@mui/material/InputAdornment";
import { api } from "../api/endpoints";
import WaybillPreviewDialog from "../page_elements/WaybillPreviewDialog";

const STATUS_OPTIONS = [
  { value: "", label: "Visi" },
  { value: "completed", label: "Atlikti" },
  { value: "exported", label: "Eksportuoti" },
  { value: "processing", label: "Vykdomi" },
  { value: "rejected", label: "Atmesti" },
];

const statusIcon = (st) => {
  if (st === "processing" || st === "pending") return <HourglassEmptyIcon color="warning" fontSize="small" />;
  if (st === "rejected") return <CancelIcon color="error" fontSize="small" />;
  if (st === "exported") return <CheckCircleIcon color="success" fontSize="small" />;
  return <CheckCircleOutlineIcon color="success" fontSize="small" />;
};

const statusText = (st) => ({
  completed: "Atliktas (Neeksportuotas)",
  exported: "Atliktas (Eksportuotas)",
  rejected: "Atmestas",
  processing: "Vykdomas",
  pending: "Vykdomas",
}[st] || "-");

const statusColor = (st) => {
  if (st === "completed" || st === "exported") return "success.main";
  if (st === "rejected") return "error.main";
  return "warning.main";
};

const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleDateString("lt-LT", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }) : "-";

const extractCursor = (nextUrl) => {
  if (!nextUrl) return null;
  try {
    const url = new URL(nextUrl, window.location.origin);
    return url.searchParams.get("cursor");
  } catch { return null; }
};

export default function AdminVaztarasciai() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);

  const [filters, setFilters] = useState({ status: "", dateFrom: "", dateTo: "", search: "", owner: "" });

  const [user, setUser] = useState(null);
  const [userLoaded, setUserLoaded] = useState(false);

  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuDocId, setMenuDocId] = useState(null);

  const sentinelRef = useRef(null);
  const observerRef = useRef(null);

  // Profile
  useEffect(() => {
    api.get("/profile/", { withCredentials: true })
      .then((r) => setUser(r.data))
      .catch(() => setUser(null))
      .finally(() => setUserLoaded(true));
  }, []);

  // Build URL
  const buildUrl = useCallback((cursor = null) => {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.dateFrom) params.set("date_from", filters.dateFrom);
    if (filters.dateTo) params.set("date_to", filters.dateTo);
    if (filters.search) params.set("search", filters.search);
    if (filters.owner) params.set("owner", filters.owner);
    if (cursor) params.set("cursor", cursor);
    return `/admin/vaztarasciai/?${params.toString()}`;
  }, [filters]);

  // Fetch
  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(buildUrl(), { withCredentials: true });
      setDocs(data.results || []);
      setNextCursor(extractCursor(data.next));
    } catch (e) {
      console.error("Fetch failed:", e);
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { data } = await api.get(buildUrl(nextCursor), { withCredentials: true });
      setDocs((p) => [...p, ...(data.results || [])]);
      setNextCursor(extractCursor(data.next));
    } catch (e) { console.error(e); }
    finally { setLoadingMore(false); }
  }, [nextCursor, loadingMore, buildUrl]);

  // Load on mount + filter change
  useEffect(() => {
    if (userLoaded && user?.is_superuser) fetchDocs();
  }, [userLoaded, user?.is_superuser, fetchDocs]);

  useEffect(() => {
    if (userLoaded && user?.is_superuser) fetchDocs();
  }, [filters.status, filters.dateFrom, filters.dateTo, filters.search, filters.owner]);

  // Infinite scroll
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && nextCursor && !loadingMore && !loading) loadMore();
      },
      { rootMargin: "200px" },
    );
    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [nextCursor, loadingMore, loading, loadMore]);

  // Preview
  const openPreview = async (doc) => {
    setPreviewDoc(doc);
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const { data } = await api.get(`/waybills/${doc.id}/`, { withCredentials: true });
      setPreviewDoc(data);
    } catch (e) { console.error(e); }
    finally { setPreviewLoading(false); }
  };

  // Menu
  const handleMenuOpen = (e, docId) => { e.stopPropagation(); setMenuAnchor(e.currentTarget); setMenuDocId(docId); };
  const handleMenuClose = () => { setMenuAnchor(null); setMenuDocId(null); };

  const handleDelete = async () => {
    const id = menuDocId;
    handleMenuClose();
    if (!id || !window.confirm("Ar tikrai norite ištrinti?")) return;
    try {
      await api.delete(`/waybills/${id}/delete/`, { withCredentials: true });
      setDocs((p) => p.filter((d) => d.id !== id));
    } catch (e) { console.error(e); }
  };

  const handleFilter = (f) => (e) => setFilters((p) => ({ ...p, [f]: e.target.value }));

  if (userLoaded && !user?.is_superuser) {
    return <Box p={4}><Alert severity="error">Neturite prieigos.</Alert></Box>;
  }

  return (
    <Box sx={{ p: isMobile ? 2 : 4 }}>
      <Helmet><title>Važtaraščiai (Admin) - DokSkenas</title></Helmet>

      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="h5">Važtaraščiai (Admin)</Typography>
          <Chip size="small" label={`Įkelta: ${docs.length}${nextCursor ? "+" : ""}`} />
        </Box>
        <Button variant="outlined" onClick={fetchDocs} disabled={loading}>Atnaujinti</Button>
      </Box>

      {/* Filters */}
      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        <TextField select size="small" label="Statusas" value={filters.status} onChange={handleFilter("status")}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ MenuProps: { disableScrollLock: true }, displayEmpty: true, renderValue: (v) => STATUS_OPTIONS.find((o) => o.value === v)?.label || "Visi" }}
          sx={{ minWidth: 140 }}>
          {STATUS_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
        </TextField>
        <TextField size="small" type="date" label="Nuo" value={filters.dateFrom} onChange={handleFilter("dateFrom")} InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
        <TextField size="small" type="date" label="Iki" value={filters.dateTo} onChange={handleFilter("dateTo")} InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
        <TextField size="small" placeholder="Dok. numeris..." value={filters.search} onChange={handleFilter("search")}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} sx={{ minWidth: 160 }} />
        <TextField size="small" placeholder="Vartotojas (email)..." value={filters.owner} onChange={handleFilter("owner")}
          sx={{ minWidth: 200 }} />
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Table */}
      <TableContainer component={Paper} sx={{ maxHeight: "75vh", overflow: "auto" }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Failas</TableCell>
              <TableCell>Vartotojas</TableCell>
              <TableCell>Numeris</TableCell>
              <TableCell>Statusas</TableCell>
              <TableCell>Maršrutas</TableCell>
              <TableCell>Pirkėjas</TableCell>
              {!isMobile && <TableCell>Įkėlimo data</TableCell>}
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {!loading && docs.length === 0 && (
              <TableRow>
                <TableCell colSpan={isMobile ? 7 : 8} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">Dokumentų nerasta</Typography>
                </TableCell>
              </TableRow>
            )}
            {docs.map((d) => (
              <TableRow key={d.id} hover>
                <TableCell>
                  <Typography variant="body2" noWrap onClick={() => openPreview(d)}
                    sx={{ maxWidth: 200, color: "primary.main", cursor: "pointer", "&:hover": { textDecoration: "underline" } }}>
                    {d.original_filename || "-"}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" noWrap sx={{ maxWidth: 160 }}>{d.owner_email || "-"}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" noWrap>{d.document_number || "-"}</Typography>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    {statusIcon(d.status)}
                    <Typography variant="caption" sx={{ color: statusColor(d.status), whiteSpace: "nowrap" }}>{statusText(d.status)}</Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" noWrap>
                    {d.from_airport_code || d.from_city || "-"} → {d.to_airport_code || d.to_city || "-"}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" noWrap>{d.buyer_name || "-"}</Typography>
                </TableCell>
                {!isMobile && <TableCell><Typography variant="caption" color="text.secondary">{fmtDateTime(d.uploaded_at)}</Typography></TableCell>}
                <TableCell align="right" sx={{ width: 40 }}>
                  <IconButton size="small" onClick={(e) => handleMenuOpen(e, d.id)}><MoreVertIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Sentinel */}
      <Box ref={sentinelRef} sx={{ height: 1 }} />

      {loadingMore && (
        <Box sx={{ py: 2 }}>
          <LinearProgress />
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 1 }}>Kraunama daugiau...</Typography>
        </Box>
      )}
      {!nextCursor && docs.length > 0 && !loading && (
        <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 2 }}>
          Visi dokumentai ({docs.length})
        </Typography>
      )}

      {/* Menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleMenuClose} disableScrollLock
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
        <MenuItem onClick={handleDelete} sx={{ color: "error.main", fontSize: "0.875rem" }}>Ištrinti</MenuItem>
      </Menu>

      {/* Preview */}
      <WaybillPreviewDialog open={previewOpen} onClose={() => { setPreviewOpen(false); setPreviewDoc(null); }}
        doc={previewDoc} setDoc={setPreviewDoc} setDocs={setDocs} loading={previewLoading} isMobile={isMobile} />
    </Box>
  );
}