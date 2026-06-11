import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { Helmet } from "react-helmet";
import {
  Box, Button, Typography, Alert, TextField, MenuItem, IconButton,
  Tooltip, Snackbar, Skeleton, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Checkbox, CircularProgress,
  Menu, useTheme, useMediaQuery,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import SearchIcon from "@mui/icons-material/Search";
import InputAdornment from "@mui/material/InputAdornment";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

import { api } from "../api/endpoints";
import WaybillPreviewDialog from "../page_elements/WaybillPreviewDialog";

// Reuse existing upload components
import { useUploadSession } from "../components/useUploadSession";
import UploadProgressDialog from "../components/UploadProgressDialog";
import ProcessingStatusBar from "../components/ProcessingStatusBar";

// ── API endpoints config for waybills ──
const WAYBILL_API = {
  createSession: "/waybills/sessions/create/",
  uploadBatch: (sid) => `/waybills/sessions/${sid}/upload/`,
  finalize: (sid) => `/waybills/sessions/${sid}/finalize/`,
  chunksInit: (sid) => `/waybills/sessions/${sid}/chunks/init/`,
  chunksUpload: (sid, uid, idx) => `/waybills/sessions/${sid}/chunks/${uid}/${idx}/`,
  chunksComplete: (sid, uid) => `/waybills/sessions/${sid}/chunks/${uid}/complete/`,
  activeSessions: "/waybills/sessions/active/",
  retryBlocked: (sid) => `/waybills/sessions/${sid}/retry/`,
  cancelBlocked: (sid) => `/waybills/sessions/${sid}/cancel/`,
};

const SCAN_TYPES = [
  { value: "detaliai", label: "Detaliai (su eilutėmis) – 1.3 kredito" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Visi" },
  { value: "completed", label: "Atlikti" },
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
  if (st === "processing" || st === "pending") return "warning.main";
  return "text.secondary";
};

const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleDateString("lt-LT", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }) : "-";

export default function WaybillsPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [docs, setDocs] = useState([]);
  const [nextUrl, setNextUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [filters, setFilters] = useState(() => {
    const now = new Date();
    const ago = new Date(now);
    ago.setDate(now.getDate() - 30);
    return { status: "", dateFrom: ago.toISOString().split("T")[0], dateTo: now.toISOString().split("T")[0], search: "" };
  });

  const [user, setUser] = useState(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);

  // Preview
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [creditError, setCreditError] = useState(null);
  const [toast, setToast] = useState(null);

  // 3-dot menu
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuDocId, setMenuDocId] = useState(null);

  // Infinite scroll
  const tableContainerRef = useRef(null);

  // ── Upload hook (reuse existing with waybill endpoints) ──
  const {
    isUploading,
    uploadProgress,
    error: uploadError,
    skippedFiles,
    clearSkipped,
    startUpload,
    cancelUpload,
  } = useUploadSession({
    apiEndpoints: WAYBILL_API,
    onUploadComplete: () => {},
    onError: (msg) => {
      if (msg?.toLowerCase().includes("kredit")) setCreditError(msg);
    },
  });

  // ── Fetch user ──
  useEffect(() => {
    api.get("/profile/", { withCredentials: true })
      .then((r) => setUser(r.data))
      .catch(() => setUser(null))
      .finally(() => setUserLoaded(true));
  }, []);

  // ── Fetch docs ──
  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        status: filters.status || undefined,
        date_from: filters.dateFrom || undefined,
        date_to: filters.dateTo || undefined,
        search: filters.search?.trim() || undefined,
      };
      const { data } = await api.get("/waybills/", { withCredentials: true, params });
      setDocs(data.results || []);
      setNextUrl(data.next || null);
    } catch (e) {
      console.error("Nepavyko gauti važtaraščių:", e);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // ── Load more (infinite scroll) ──
  const loadMore = useCallback(async () => {
    if (!nextUrl || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const { data } = await api.get(nextUrl, { withCredentials: true });
      setDocs((p) => [...p, ...(data.results || [])]);
      setNextUrl(data.next || null);
    } catch (e) { console.error(e); }
    finally { setLoadingMore(false); }
  }, [nextUrl, loadingMore, loading]);

  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      if (loadingMore || !nextUrl) return;
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop - clientHeight < 300) loadMore();
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [loadMore, loadingMore, nextUrl]);

  // ── Open preview ──
  const openPreview = async (doc) => {
    setPreviewDoc(doc);
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const { data } = await api.get(`/waybills/${doc.id}/`, { withCredentials: true });
      setPreviewDoc(data);
    } catch (e) { console.error("Nepavyko gauti važtaraščio:", e); }
    finally { setPreviewLoading(false); }
  };

  // ── Upload handler ──
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = "";
    setSelectedRows([]);
    startUpload(files, "detaliai");
  };

  // ── Selection ──
  const exportableIds = useMemo(() =>
    docs.filter((d) => d.status === "completed" || d.status === "exported").map((d) => String(d.id)), [docs]);

  const toggleRow = (id) => {
    const sid = String(id);
    setSelectedRows((p) => p.includes(sid) ? p.filter((x) => x !== sid) : [...p, sid]);
  };

  const toggleAll = () => {
    setSelectedRows((p) => (p.length === exportableIds.length ? [] : [...exportableIds]));
  };

  // ── 3-dot menu ──
  const handleMenuOpen = (e, docId) => { e.stopPropagation(); setMenuAnchor(e.currentTarget); setMenuDocId(docId); };
  const handleMenuClose = () => { setMenuAnchor(null); setMenuDocId(null); };

  const handleDelete = async () => {
    const id = menuDocId;
    handleMenuClose();
    if (!id || !window.confirm("Ar tikrai norite ištrinti?")) return;
    try {
      await api.delete(`/waybills/${id}/delete/`, { withCredentials: true });
      setDocs((p) => p.filter((d) => d.id !== id));
      setSelectedRows((p) => p.filter((x) => x !== String(id)));
    } catch (e) { setToast({ severity: "error", message: "Nepavyko ištrinti" }); }
  };

  const handleBulkDelete = async () => {
    if (!selectedRows.length || !window.confirm(`Ar tikrai norite ištrinti ${selectedRows.length} dokumentų?`)) return;
    try {
      await api.post("/waybills/bulk-delete/", { ids: selectedRows.map(Number) }, { withCredentials: true });
      setDocs((p) => p.filter((d) => !selectedRows.includes(String(d.id))));
      setSelectedRows([]);
    } catch (e) { setToast({ severity: "error", message: "Nepavyko ištrinti" }); }
  };

  // ── Export XLS ──
  const handleExport = async () => {
    if (!selectedRows.length) return;
    try {
      const res = await api.post("/waybills/export-xls/", { ids: selectedRows.map(Number) },
        { withCredentials: true, responseType: "blob" });
      let filename = "vaztarasciai.xlsx";
      const cd = res.headers?.["content-disposition"];
      if (cd) { const m = cd.match(/filename="?([^"]+)"?/); if (m) filename = m[1]; }
      const blob = new Blob([res.data], { type: res.headers?.["content-type"] || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.setAttribute("download", filename);
      document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url);
      setSelectedRows([]);
      await fetchDocs();
    } catch (err) {
      console.error("Eksportas nepavyko:", err);
      setToast({ severity: "error", message: "Eksporto klaida" });
    }
  };

  const handleFilter = (f) => (e) => setFilters((p) => ({ ...p, [f]: e.target.value }));
  const filtered = useMemo(() => docs.filter((d) => !d.is_archive_container), [docs]);
  const allSelected = exportableIds.length > 0 && selectedRows.length === exportableIds.length;

  return (
    <Box sx={{ p: isMobile ? 2 : 4 }}>
      <Helmet>
        <title>Važtaraščiai - DokSkenas</title>
        <meta name="description" content="Važtaraščių skaitmenizavimas" />
      </Helmet>

      {/* Upload dialog (reuse existing) */}
      <UploadProgressDialog
        open={isUploading}
        uploadProgress={uploadProgress}
        error={uploadError}
        onCancel={cancelUpload}
      />

      {/* Header */}
      <Box sx={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", mb: 2, gap: 2 }}>
        <Typography variant={isMobile ? "h6" : "h5"}>Važtaraščių skaitmenizavimo suvestinė</Typography>
        {!isMobile && (
          <Box sx={{ display: "flex", gap: 1 }}>
            <Tooltip title={!selectedRows.length ? "Pažymėkite dokumentus eksportui" : ""}>
              <span>
                <Button variant="outlined" onClick={handleExport} disabled={!selectedRows.length}>
                  Eksportuoti{selectedRows.length ? ` (${selectedRows.length})` : ""} XLS
                </Button>
              </span>
            </Tooltip>
            {selectedRows.length > 0 && (
              <Button variant="outlined" color="error" onClick={handleBulkDelete} size="small">
                Ištrinti ({selectedRows.length})
              </Button>
            )}
          </Box>
        )}
      </Box>

      {/* Alerts */}
      {creditError && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setCreditError(null)}
          action={<Button color="warning" variant="contained" size="small" onClick={() => (window.location = "/papildyti/")}>Papildyti</Button>}>
          {creditError}
        </Alert>
      )}

      {/* Upload row */}
      <Box mb={2} display="flex" alignItems="center" gap={2} flexWrap="wrap">
        <TextField select size="small" label="Skaitmenizavimo tipas" value="detaliai"
          SelectProps={{ MenuProps: { disableScrollLock: true } }} sx={{ minWidth: 320 }} InputProps={{ readOnly: true }}>
          {SCAN_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
        </TextField>
        <Button variant="contained" component="label" startIcon={<CloudUploadIcon />} disabled={isUploading || !userLoaded}>
          Įkelti failus
          <input type="file" hidden multiple accept="image/*,.pdf,.zip,.rar,.7z" onChange={handleFileChange} />
        </Button>
      </Box>

      {/* Processing status bar (reuse existing with waybill endpoints) */}
      <ProcessingStatusBar
        apiEndpoints={WAYBILL_API}
        onSessionComplete={async () => { await fetchDocs(); }}
      />

      {/* Skipped files */}
      {skippedFiles.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={clearSkipped}>
          <Typography variant="body2" fontWeight={600} gutterBottom>Kai kurie failai buvo praleisti:</Typography>
          {skippedFiles.map((f, i) => (
            <Typography key={i} variant="body2" sx={{ ml: 1 }}>• {f.name} — {f.reason}</Typography>
          ))}
        </Alert>
      )}

      {/* Mobile buttons */}
      {isMobile && (
        <Box sx={{ mb: 2, display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Tooltip title={!selectedRows.length ? "Pažymėkite dokumentus eksportui" : ""}>
            <span style={{ flex: 1 }}>
              <Button variant="outlined" onClick={handleExport} disabled={!selectedRows.length} fullWidth>
                Eksportuoti{selectedRows.length ? ` (${selectedRows.length})` : ""} XLS
              </Button>
            </span>
          </Tooltip>
          {selectedRows.length > 0 && (
            <Button variant="outlined" color="error" onClick={handleBulkDelete} size="small">
              Ištrinti ({selectedRows.length})
            </Button>
          )}
        </Box>
      )}

      {/* Filters */}
      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        <TextField select size="small" label="Statusas" value={filters.status} onChange={handleFilter("status")}
        InputLabelProps={{ shrink: true }}
        SelectProps={{
            MenuProps: { disableScrollLock: true },
            displayEmpty: true,
            renderValue: (v) => STATUS_OPTIONS.find((o) => o.value === v)?.label || "Visi",
        }}
        sx={{ minWidth: 140 }}>
        {STATUS_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
        </TextField>
        <TextField size="small" type="date" label="Nuo" value={filters.dateFrom} onChange={handleFilter("dateFrom")} InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
        <TextField size="small" type="date" label="Iki" value={filters.dateTo} onChange={handleFilter("dateTo")} InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
        <TextField size="small" placeholder="Paieška pagal numerį..." value={filters.search} onChange={handleFilter("search")}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} sx={{ minWidth: 220 }} />
      </Box>

      {/* Table */}
      {loading ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {[...Array(10)].map((_, i) => <Skeleton key={i} variant="rectangular" height={48} sx={{ borderRadius: 1 }} />)}
        </Box>
      ) : (
        <TableContainer component={Paper} ref={tableContainerRef} sx={{ maxHeight: "70vh", overflow: "auto" }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox checked={allSelected} indeterminate={selectedRows.length > 0 && !allSelected} onChange={toggleAll} size="small" />
                </TableCell>
                <TableCell>Failas</TableCell>
                <TableCell>Statusas</TableCell>
                {!isMobile && <TableCell>Įkėlimo data</TableCell>}
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isMobile ? 4 : 5} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">Dokumentų nerasta</Typography>
                  </TableCell>
                </TableRow>
              ) : filtered.map((d) => {
                const isExportable = d.status === "completed" || d.status === "exported";
                const isSelected = selectedRows.includes(String(d.id));
                return (
                  <TableRow key={d.id} hover selected={isSelected}>
                    <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={isSelected} disabled={!isExportable} onChange={() => toggleRow(d.id)} size="small" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap onClick={() => openPreview(d)}
                        sx={{ maxWidth: isMobile ? 180 : 400, color: "primary.main", cursor: "pointer", "&:hover": { textDecoration: "underline" } }}>
                        {d.original_filename || "-"}
                      </Typography>
                      {isMobile && <Typography variant="caption" display="block" color="text.secondary">{fmtDateTime(d.uploaded_at)}</Typography>}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        {statusIcon(d.status)}
                        <Typography variant="caption" sx={{ color: statusColor(d.status), whiteSpace: "nowrap" }}>{statusText(d.status)}</Typography>
                      </Box>
                    </TableCell>
                    {!isMobile && <TableCell><Typography variant="body2" color="text.secondary">{fmtDateTime(d.uploaded_at)}</Typography></TableCell>}
                    <TableCell align="right" sx={{ width: 40 }}>
                      <IconButton size="small" onClick={(e) => handleMenuOpen(e, d.id)}><MoreVertIcon fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
              {loadingMore && (
                <TableRow><TableCell colSpan={isMobile ? 4 : 5} align="center" sx={{ py: 2 }}><CircularProgress size={24} /></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* 3-dot menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleMenuClose} disableScrollLock
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
        <MenuItem onClick={handleDelete} sx={{ color: "error.main", fontSize: "0.875rem" }}>Ištrinti</MenuItem>
      </Menu>

      {/* Preview */}
      <WaybillPreviewDialog open={previewOpen} onClose={() => { setPreviewOpen(false); setPreviewDoc(null); }}
        doc={previewDoc} setDoc={setPreviewDoc} setDocs={setDocs} loading={previewLoading} isMobile={isMobile} />

      {/* Toast */}
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}