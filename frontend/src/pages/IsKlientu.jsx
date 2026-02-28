import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "../api/endpoints";
import { Helmet } from "react-helmet";
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  IconButton,
  Tooltip,
  Chip,
  Button,
  CircularProgress,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  TextField,
  LinearProgress,
  Card,
  CardContent,
  Alert,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningIcon from "@mui/icons-material/Warning";
import DeleteIcon from "@mui/icons-material/Delete";
import DocumentScannerIcon from "@mui/icons-material/DocumentScanner";
import RefreshIcon from "@mui/icons-material/Refresh";
import FilterListIcon from "@mui/icons-material/FilterList";

import FailuPreviewDialog from "../page_elements/FailuPreviewDialog";

const SCAN_TYPES = [
  { value: "sumiskai", label: "Sumiškai (be eilučių) – 1 kreditas" },
  { value: "detaliai", label: "Detaliai (su eilutėmis) – 1.3 kredito" },
];

const SOURCE_LABELS = {
  mob: "Mob. programėlė",
  email: "El. paštas",
  google_drive: "Google Drive",
  dropbox: "Dropbox",
};

const SOURCE_COLORS = {
  mob: "default",
  email: "info",
  google_drive: "primary",
  dropbox: "secondary",
};

const SELECT_PROPS = {
  MenuProps: { disableScrollLock: true },
};

export default function IsKlientu() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [totalCount, setTotalCount] = useState(0);

  // ─── Selection state ───
  // selectMode: "none" | "page" | "all"
  //   "none"  — ничего не выбрано (или ручной выбор через selectedIds)
  //   "page"  — выбраны все загруженные строки
  //   "all"   — выбраны ВСЕ подходящие под фильтр (даже не загруженные)
  const [selectMode, setSelectMode] = useState("none");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [excludedIds, setExcludedIds] = useState(new Set());

  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [menuRowId, setMenuRowId] = useState(null);

  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [promoteInProgress, setPromoteInProgress] = useState(false);
  const [promoteError, setPromoteError] = useState(null);
  const [promoteCount, setPromoteCount] = useState(0);

  const [scanType, setScanType] = useState("sumiskai");

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null); // {ids, selectAll, excludeIds}
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [sourceFilter, setSourceFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("");
  const [cloudClients, setCloudClients] = useState([]);

  const observerRef = useRef(null);
  const sentinelRef = useRef(null);

  // ─── Helpers ───

  const extractCursor = (nextUrl) => {
    if (!nextUrl) return null;
    try {
      return new URL(nextUrl, window.location.origin).searchParams.get("cursor");
    } catch {
      return null;
    }
  };

  const buildUrl = useCallback(
    (cursor = null) => {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (clientFilter) params.set("client_id", clientFilter);
      const qs = params.toString();
      return `/cloud/inbox/${qs ? `?${qs}` : ""}`;
    },
    [sourceFilter, clientFilter]
  );

  // ─── Data loading ───

  const loadInbox = useCallback(async () => {
    setLoading(true);
    resetSelection();
    try {
      const { data } = await api.get(buildUrl(), { withCredentials: true });
      setRows(data.results || []);
      setNextCursor(extractCursor(data.next));
      setTotalCount(data.total_count ?? data.results?.length ?? 0);
    } catch (e) {
      console.error("Failed to load inbox", e);
      setRows([]);
      setNextCursor(null);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { data } = await api.get(buildUrl(nextCursor), { withCredentials: true });
      setRows((prev) => [...prev, ...(data.results || [])]);
      setNextCursor(extractCursor(data.next));
    } catch (e) {
      console.error("Failed to load more", e);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, buildUrl]);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  // Infinite scroll
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && nextCursor && !loadingMore && !loading) {
          loadMore();
        }
      },
      { rootMargin: "200px" }
    );
    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [nextCursor, loadingMore, loading, loadMore]);

  // Load cloud clients for filter — из отдельного endpoint
  useEffect(() => {
    api
      .get("/cloud/inbox/clients/", { withCredentials: true })
      .then(({ data }) => setCloudClients(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const formatDate = (isoString) => {
    if (!isoString) return "";
    try {
      return new Date(isoString).toLocaleString("lt-LT");
    } catch {
      return isoString;
    }
  };

  // ─── Selection logic ───

  const resetSelection = () => {
    setSelectMode("none");
    setSelectedIds(new Set());
    setExcludedIds(new Set());
  };

  const isRowSelected = (id) => {
    if (selectMode === "all") return !excludedIds.has(id);
    return selectedIds.has(id);
  };

  const getEffectiveCount = () => {
    if (selectMode === "all") return totalCount - excludedIds.size;
    return selectedIds.size;
  };

  const handleToggleRow = (id) => () => {
    if (selectMode === "all") {
      // В режиме "все выбраны" — toggle = добавить/убрать из исключений
      setExcludedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        // Если исключили все — переключаем в none
        if (next.size >= totalCount) {
          setSelectMode("none");
          setSelectedIds(new Set());
          return new Set();
        }
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      // Если выбрали все загруженные — переключаем в page mode
      setSelectMode((prev) => (prev === "page" ? "page" : "none"));
    }
  };

  const handleToggleAll = () => {
    if (selectMode === "all") {
      // Снять всё
      resetSelection();
    } else if (selectMode === "none" && selectedIds.size === 0) {
      // Выбрать все загруженные
      setSelectMode("page");
      setSelectedIds(new Set(rows.map((r) => r.id)));
      setExcludedIds(new Set());
    } else if (selectMode === "page" || selectedIds.size > 0) {
      // Снять всё
      resetSelection();
    }
  };

  const handleSelectAllMatching = () => {
    setSelectMode("all");
    setSelectedIds(new Set());
    setExcludedIds(new Set());
  };

  const effectiveCount = getEffectiveCount();
  const allLoadedSelected =
    rows.length > 0 &&
    (selectMode === "all"
      ? rows.every((r) => !excludedIds.has(r.id))
      : rows.every((r) => selectedIds.has(r.id)));
  const someSelected = effectiveCount > 0 && !allLoadedSelected;

  // ─── Menu ───

  const handleMenuOpen = (event, rowId) => {
    setMenuAnchorEl(event.currentTarget);
    setMenuRowId(rowId);
  };
  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setMenuRowId(null);
  };

  // ─── Build payload для promote/delete ───

  const buildActionPayload = (overrideIds = null) => {
    if (overrideIds) {
      return { ids: overrideIds };
    }
    if (selectMode === "all") {
      const payload = { select_all: true, exclude_ids: Array.from(excludedIds) };
      if (sourceFilter !== "all") payload.source = sourceFilter;
      if (clientFilter) payload.client_id = clientFilter;
      return payload;
    }
    return { ids: Array.from(selectedIds) };
  };

  // ─── Delete ───

  const handleDelete = async (payload) => {
    try {
      await api.delete("/web/mobile-inbox/bulk-delete/", { data: payload });
      if (payload.select_all) {
        // Убираем всё что не excluded
        setRows((prev) =>
          prev.filter((r) => payload.exclude_ids?.includes(r.id))
        );
      } else {
        const idsSet = new Set(payload.ids);
        setRows((prev) => prev.filter((r) => !idsSet.has(r.id)));
      }
      resetSelection();
      // Перезагружаем чтобы обновить total_count
      setTimeout(() => loadInbox(), 300);
    } catch (e) {
      console.error("Failed to delete", e);
      alert("Įvyko klaida trinant failus.");
    }
  };

  const openConfirmDelete = (payload) => {
    setConfirmTarget(payload);
    setConfirmOpen(true);
  };
  const handleConfirmClose = () => {
    if (confirmLoading) return;
    setConfirmOpen(false);
    setConfirmTarget(null);
  };
  const handleConfirmSubmit = async () => {
    if (!confirmTarget) return;
    setConfirmLoading(true);
    await handleDelete(confirmTarget);
    setConfirmLoading(false);
    setConfirmOpen(false);
    setConfirmTarget(null);
  };

  const handleDeleteSingleFromMenu = (id) => {
    handleMenuClose();
    openConfirmDelete({ ids: [id] });
  };
  const handleDeleteSelectedClick = () => {
    openConfirmDelete(buildActionPayload());
  };

  // ─── Promote ───

  const openPromoteDialog = (count) => {
    setPromoteCount(count);
    setPromoteError(null);
    setPromoteInProgress(true);
    setPromoteDialogOpen(true);
  };
  const closePromoteDialog = () => {
    setPromoteDialogOpen(false);
    setPromoteInProgress(false);
    setPromoteError(null);
    setPromoteCount(0);
  };

  const doPromote = async (payload) => {
    const count = payload.select_all
      ? totalCount - (payload.exclude_ids?.length || 0)
      : payload.ids?.length || 0;
    if (count === 0) return;

    openPromoteDialog(count);
    try {
      const { data } = await api.post("/web/mobile-inbox/promote/", {
        ...payload,
        scan_type: scanType,
      });

      // Убираем promoted файлы из списка
      const promoted = data.processed_ids || [];
      if (payload.select_all) {
        setRows((prev) =>
          prev.filter((r) => payload.exclude_ids?.includes(r.id))
        );
      } else if (promoted.length > 0) {
        const idsSet = new Set(promoted);
        setRows((prev) => prev.filter((r) => !idsSet.has(r.id)));
      } else {
        const idsSet = new Set(payload.ids);
        setRows((prev) => prev.filter((r) => !idsSet.has(r.id)));
      }
      resetSelection();

      if (data.session_stage === "blocked") {
        setPromoteError(data.error_message || "Nepakanka kreditų.");
      }

      setPromoteInProgress(false);
      setTimeout(() => loadInbox(), 300);
    } catch (e) {
      console.error("Failed to promote", e);
      const resp = e?.response;
      if (resp?.status === 409 && resp?.data?.error === "BLOCKED_SESSION_EXISTS") {
        setPromoteError(resp.data.detail || "Turite neapmokėtą užduotį.");
      } else {
        setPromoteError("Įvyko klaida perkeliant failus į suvestinę.");
      }
      setPromoteInProgress(false);
    }
  };

  const handlePromoteSelected = () => doPromote(buildActionPayload());

  // ─── Preview ───

  const handlePreview = (row) => {
    if (!row?.preview_url) return;
    setPreviewRow(row);
    setPreviewOpen(true);
  };
  const handlePreviewClose = () => {
    setPreviewOpen(false);
    setPreviewRow(null);
  };

  // ─── Render helpers ───

  const renderSender = (row) => {
    const primary = row.sender_primary;
    const secondary = row.sender_secondary;
    if (primary) {
      return (
        <>
          <Typography variant="body2" noWrap>{primary}</Typography>
          {secondary && (
            <Typography variant="caption" color="text.secondary" noWrap display="block">
              {secondary}
            </Typography>
          )}
        </>
      );
    }
    return <Typography variant="body2" color="text.disabled">Nenurodytas</Typography>;
  };

  const renderSourceChip = (row) => (
    <Chip
      label={SOURCE_LABELS[row.source] || row.source}
      size="small"
      color={SOURCE_COLORS[row.source] || "default"}
      variant="outlined"
      sx={{ fontSize: 12, height: 22 }}
    />
  );

  // ─── "Select all matching" banner ───

  const showSelectAllBanner =
    selectMode === "page" && totalCount > rows.length;
  const showAllSelectedBanner = selectMode === "all";

  // ─── Mobile card ───

  const renderMobileCard = (row) => {
    const checked = isRowSelected(row.id);
    return (
      <Card
        key={row.id}
        variant="outlined"
        sx={{
          mb: 1,
          borderColor: checked ? "primary.main" : "divider",
          backgroundColor: checked ? "action.selected" : "background.paper",
        }}
      >
        <CardContent sx={{ px: 1.5, py: 1.5, "&:last-child": { pb: 1.5 } }}>
          <Box display="flex" alignItems="flex-start" gap={1}>
            <Checkbox
              size="small"
              checked={checked}
              onChange={handleToggleRow(row.id)}
              sx={{ mt: -0.5, ml: -0.5, p: 0.5 }}
            />
            <Box flex={1} minWidth={0}>
              <Typography
                variant="body2"
                fontWeight={600}
                noWrap
                sx={{
                  cursor: row.preview_url ? "pointer" : "default",
                  color: row.preview_url ? "primary.main" : "text.primary",
                }}
                onClick={() => handlePreview(row)}
              >
                {row.original_filename || "—"}
              </Typography>
              <Box display="flex" alignItems="center" gap={1} mt={0.5} flexWrap="wrap">
                {renderSourceChip(row)}
                <Typography variant="caption" color="text.secondary">
                  {formatDate(row.created_at)}
                </Typography>
              </Box>
              <Box mt={0.5}>{renderSender(row)}</Box>
            </Box>
            <IconButton size="small" onClick={(e) => handleMenuOpen(e, row.id)}>
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </Box>
        </CardContent>
      </Card>
    );
  };

  // ─── Confirm count for dialog ───
  const confirmCount = confirmTarget
    ? confirmTarget.select_all
      ? totalCount - (confirmTarget.exclude_ids?.length || 0)
      : confirmTarget.ids?.length || 0
    : 0;

  return (
    <Box sx={{ px: { xs: 2, md: 6 }, py: { xs: 2, md: 4 } }}>
      <Helmet>
        <title>Failai iš klientų</title>
        <meta name="description" content="Čia rasite failus atsiųstus jūsų klientų." />
      </Helmet>

      {/* ═══ Row 1: Veiksmai ═══ */}
      <Box
        sx={{
          mb: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
          flexWrap: "wrap",
        }}
      >
        <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
          <TextField
            select
            size="small"
            label="Skaitmenizavimo tipas"
            value={scanType}
            onChange={(e) => setScanType(e.target.value)}
            sx={{ minWidth: { xs: "100%", sm: 270 } }}
            SelectProps={SELECT_PROPS}
          >
            {SCAN_TYPES.map((t) => (
              <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
            ))}
          </TextField>

          <Button
            variant="contained"
            startIcon={<DocumentScannerIcon />}
            disabled={effectiveCount === 0 || loading}
            onClick={handlePromoteSelected}
            size={isMobile ? "small" : "medium"}
            sx={{
              whiteSpace: "nowrap",
              ...(effectiveCount > 0 && {
                backgroundColor: "#7c4dff",
                "&:hover": { backgroundColor: "#651fff" },
              }),
            }}
          >
            {isMobile ? "Skaitmenizuoti" : "Skaitmenizuoti"}
          </Button>

          <Tooltip title="Ištrinti pasirinktus">
            <span>
              <Button
                variant="outlined"
                size={isMobile ? "small" : "medium"}
                color="error"
                startIcon={<DeleteIcon />}
                disabled={effectiveCount === 0 || loading}
                onClick={handleDeleteSelectedClick}
              >
                Ištrinti
              </Button>
            </span>
          </Tooltip>

          {effectiveCount > 0 && (
            <Typography variant="body2" color="text.secondary">
              Pasirinkta: {effectiveCount}
            </Typography>
          )}
        </Box>

        <Box display="flex" alignItems="center" gap={1.5}>
          <Typography variant="body2" color="text.secondary">
            Iš viso: {totalCount}
          </Typography>
          <Tooltip title="Atnaujinti">
            <IconButton
              onClick={loadInbox}
              disabled={loading}
              size="small"
              sx={{ border: "1px solid", borderColor: "divider" }}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* ═══ Row 2: Filtrai ═══ */}
      <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <FilterListIcon fontSize="small" color="action" />
        <TextField
          select
          size="small"
          label="Šaltinis"
          value={sourceFilter}
          onChange={(e) => {
            setSourceFilter(e.target.value);
            setClientFilter("");
          }}
          sx={{ minWidth: { xs: 140, sm: 160 } }}
          SelectProps={SELECT_PROPS}
        >
          <MenuItem value="all">Visi šaltiniai</MenuItem>
          <MenuItem value="mob">Mob. programėlė</MenuItem>
          <MenuItem value="email">El. paštas</MenuItem>
          <MenuItem value="google_drive">Google Drive</MenuItem>
          <MenuItem value="dropbox">Dropbox</MenuItem>
        </TextField>

        {cloudClients.length > 0 && (
          <TextField
            select
            size="small"
            label="Klientas"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            sx={{ minWidth: { xs: 140, sm: 200 } }}
            SelectProps={SELECT_PROPS}
          >
            <MenuItem value="">Visi klientai</MenuItem>
            {cloudClients.map((c) => (
              <MenuItem key={c.id} value={String(c.id)}>
                {c.name}{c.company_code ? ` (${c.company_code})` : ""}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Box>

      {/* ═══ "Select all matching" banner ═══ */}
      {showSelectAllBanner && (
        <Alert
          severity="info"
          sx={{ mb: 1.5 }}
          action={
            <Button color="inherit" size="small" onClick={handleSelectAllMatching}>
              Pasirinkti visus {totalCount}
            </Button>
          }
        >
          Pasirinkta {rows.length} failų šiame puslapyje.
        </Alert>
      )}
      {showAllSelectedBanner && (
        <Alert
          severity="success"
          sx={{ mb: 1.5 }}
          action={
            <Button color="inherit" size="small" onClick={resetSelection}>
              Atšaukti
            </Button>
          }
        >
          Pasirinkti visi {totalCount - excludedIds.size} failai
          {excludedIds.size > 0 && ` (${excludedIds.size} neįtraukti)`}.
        </Alert>
      )}

      {loading && <LinearProgress sx={{ mb: 1 }} />}

      {/* ═══ Desktop: Table ═══ */}
      {!isMobile ? (
        <TableContainer component={Paper} sx={{ maxHeight: 580 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={someSelected}
                    checked={allLoadedSelected && rows.length > 0}
                    onChange={handleToggleAll}
                    inputProps={{ "aria-label": "select all" }}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Failas</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Siuntėjas</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Šaltinis</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Gavimo data</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center"><CircularProgress size={24} /></TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      Nėra naujų failų iš klientų
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {rows.map((row) => {
                    const checked = isRowSelected(row.id);
                    return (
                      <TableRow key={row.id} hover selected={checked}>
                        <TableCell padding="checkbox">
                          <Checkbox checked={checked} onChange={handleToggleRow(row.id)} />
                        </TableCell>
                        <TableCell
                          sx={{
                            cursor: row.preview_url ? "pointer" : "default",
                            color: row.preview_url ? "primary.main" : "inherit",
                            maxWidth: 260,
                          }}
                          onClick={() => handlePreview(row)}
                        >
                          <Tooltip title={row.original_filename || ""}>
                            <span style={{
                              display: "inline-block", overflow: "hidden",
                              textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
                            }}>
                              {row.original_filename || "—"}
                            </span>
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 220 }}>{renderSender(row)}</TableCell>
                        <TableCell>{renderSourceChip(row)}</TableCell>
                        <TableCell>
                          <Typography variant="body2">{formatDate(row.created_at)}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <IconButton size="small" onClick={(e) => handleMenuOpen(e, row.id)}>
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  <TableRow ref={sentinelRef}>
                    <TableCell colSpan={6} sx={{ p: 0, border: 0, height: 1 }} />
                  </TableRow>

                  {loadingMore && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 2 }}>
                        <LinearProgress sx={{ maxWidth: 200, mx: "auto", mb: 1 }} />
                        <Typography variant="body2" color="text.secondary">Kraunama daugiau...</Typography>
                      </TableCell>
                    </TableRow>
                  )}

                  {!nextCursor && rows.length > 0 && !loading && !loadingMore && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 2, color: "text.disabled" }}>
                        <Typography variant="body2">Visi failai įkelti ({rows.length})</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        /* ═══ Mobile: Cards ═══ */
        <Box>
          {loading && rows.length === 0 ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress size={24} /></Box>
          ) : rows.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">Nėra naujų failų iš klientų</Typography>
            </Paper>
          ) : (
            <>
              <Box display="flex" alignItems="center" mb={1} gap={0.5}>
                <Checkbox
                  size="small"
                  indeterminate={someSelected}
                  checked={allLoadedSelected && rows.length > 0}
                  onChange={handleToggleAll}
                  sx={{ p: 0.5 }}
                />
                <Typography variant="body2" color="text.secondary">Pasirinkti visus</Typography>
              </Box>

              {rows.map(renderMobileCard)}
              <Box ref={sentinelRef} sx={{ height: 1 }} />

              {loadingMore && (
                <Box py={2} textAlign="center">
                  <LinearProgress sx={{ maxWidth: 200, mx: "auto", mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">Kraunama daugiau...</Typography>
                </Box>
              )}
              {!nextCursor && rows.length > 0 && !loading && !loadingMore && (
                <Typography variant="body2" color="text.disabled" textAlign="center" py={2}>
                  Visi failai įkelti ({rows.length})
                </Typography>
              )}
            </>
          )}
        </Box>
      )}

      {/* ═══ Context menu — только Ištrinti ═══ */}
      <Menu anchorEl={menuAnchorEl} open={Boolean(menuAnchorEl)} onClose={handleMenuClose} disableScrollLock>
        <MenuItem onClick={() => menuRowId != null && handleDeleteSingleFromMenu(menuRowId)}>
          Ištrinti
        </MenuItem>
      </Menu>

      {/* ═══ Promote dialog ═══ */}
      <Dialog open={promoteDialogOpen} onClose={promoteInProgress ? undefined : closePromoteDialog} disableScrollLock>
        <DialogTitle>Skaitmenizavimas</DialogTitle>
        <DialogContent sx={{ pt: 2, minWidth: { xs: 260, sm: 320 } }}>
          {promoteInProgress && (
            <Box display="flex" alignItems="center" gap={2} py={1}>
              <CircularProgress size={24} />
              <Typography variant="body2">Failai perkeliami į suvestinę ir ruošiami skaitmenizuoti...</Typography>
            </Box>
          )}
          {!promoteInProgress && !promoteError && (
            <Box display="flex" alignItems="center" gap={1.5} py={1}>
              <CheckCircleIcon color="success" />
              <Typography variant="body2">
                {promoteCount === 1
                  ? "1 failas buvo perkeltas į suvestinę ir skaitmenizuojamas"
                  : `${promoteCount} failai buvo perkelti į suvestinę ir skaitmenizuojami`}
              </Typography>
            </Box>
          )}
          {!promoteInProgress && promoteError && (
            <Box display="flex" alignItems="center" gap={1.5} py={1}>
              <WarningIcon color="error" />
              <Typography variant="body2" color="error.main">{promoteError}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {!promoteInProgress && <Button onClick={closePromoteDialog}>Uždaryti</Button>}
        </DialogActions>
      </Dialog>

      {/* ═══ Delete confirm dialog ═══ */}
      <Dialog open={confirmOpen} onClose={confirmLoading ? undefined : handleConfirmClose} disableScrollLock>
        <DialogTitle>Patvirtinkite ištrynimą</DialogTitle>
        <DialogContent sx={{ pt: 1, minWidth: { xs: 260, sm: 320 } }}>
          <Typography variant="body2">
            {confirmCount === 1
              ? "Ar tikrai norite ištrinti šį failą?"
              : `Ar tikrai norite ištrinti pasirinktus failus (${confirmCount})?`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleConfirmClose} disabled={confirmLoading}>Atšaukti</Button>
          <Button
            onClick={handleConfirmSubmit}
            color="error"
            variant="contained"
            disabled={confirmLoading}
            startIcon={confirmLoading ? <CircularProgress size={14} /> : <DeleteIcon />}
          >
            Ištrinti
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══ Preview dialog ═══ */}
      <FailuPreviewDialog open={previewOpen} onClose={handlePreviewClose} file={previewRow} />
    </Box>
  );
}





// import { useEffect, useState, useCallback, useRef } from "react";
// import { api } from "../api/endpoints";
// import { Helmet } from "react-helmet";
// import {
//   Box,
//   Paper,
//   Table,
//   TableBody,
//   TableCell,
//   TableContainer,
//   TableHead,
//   TableRow,
//   Checkbox,
//   IconButton,
//   Tooltip,
//   Chip,
//   Button,
//   CircularProgress,
//   Menu,
//   MenuItem,
//   Dialog,
//   DialogTitle,
//   DialogContent,
//   DialogActions,
//   Typography,
//   TextField,
//   LinearProgress,
// } from "@mui/material";
// import MoreVertIcon from "@mui/icons-material/MoreVert";
// import CheckCircleIcon from "@mui/icons-material/CheckCircle";
// import WarningIcon from "@mui/icons-material/Warning";
// import DeleteIcon from "@mui/icons-material/Delete";
// import DocumentScannerIcon from "@mui/icons-material/DocumentScanner";
// import RefreshIcon from "@mui/icons-material/Refresh";

// import FailuPreviewDialog from "../page_elements/FailuPreviewDialog";

// const SCAN_TYPES = [
//   { value: "sumiskai", label: "Sumiškai (be eilučių) – 1 kreditas" },
//   { value: "detaliai", label: "Detaliai (su eilutėmis) – 1.3 kredito" },
// ];

// export default function IsKlientu() {
//   const [rows, setRows] = useState([]);
//   const [loading, setLoading] = useState(false);
//   const [loadingMore, setLoadingMore] = useState(false);
//   const [nextCursor, setNextCursor] = useState(null);

//   const [selectedIds, setSelectedIds] = useState([]);

//   const [menuAnchorEl, setMenuAnchorEl] = useState(null);
//   const [menuRowId, setMenuRowId] = useState(null);

//   const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
//   const [promoteInProgress, setPromoteInProgress] = useState(false);
//   const [promoteError, setPromoteError] = useState(null);
//   const [promoteCount, setPromoteCount] = useState(0);

//   const [scanType, setScanType] = useState("sumiskai");

//   const [previewOpen, setPreviewOpen] = useState(false);
//   const [previewRow, setPreviewRow] = useState(null);

//   const [confirmOpen, setConfirmOpen] = useState(false);
//   const [confirmIds, setConfirmIds] = useState([]);
//   const [confirmLoading, setConfirmLoading] = useState(false);

//   const [sourceFilter, setSourceFilter] = useState("all");
//   const [clientFilter, setClientFilter] = useState("");
//   const [cloudClients, setCloudClients] = useState([]);

//   const observerRef = useRef(null);
//   const sentinelRef = useRef(null);

//   // ==== helpers ====

//   const extractCursor = (nextUrl) => {
//     if (!nextUrl) return null;
//     try {
//       const url = new URL(nextUrl, window.location.origin);
//       return url.searchParams.get("cursor");
//     } catch {
//       return null;
//     }
//   };

//   const buildUrl = useCallback((cursor = null) => {
//     const params = new URLSearchParams();
//     if (cursor) params.set("cursor", cursor);
//     if (sourceFilter !== "all") params.set("source", sourceFilter);
//     if (clientFilter) params.set("client_id", clientFilter);
//     const qs = params.toString();
//     return `/cloud/inbox/${qs ? `?${qs}` : ""}`;
//   }, [sourceFilter, clientFilter]);

//   const loadInbox = useCallback(async () => {
//     setLoading(true);
//     try {
//       const { data } = await api.get(buildUrl(), { withCredentials: true });
//       setRows(data.results || []);
//       setNextCursor(extractCursor(data.next));
//     } catch (e) {
//       console.error("Failed to load mobile inbox", e);
//       setRows([]);
//       setNextCursor(null);
//     } finally {
//       setLoading(false);
//     }
//   }, [buildUrl]);

//   const loadMore = useCallback(async () => {
//     if (!nextCursor || loadingMore) return;

//     setLoadingMore(true);
//     try {
//       const { data } = await api.get(buildUrl(nextCursor), { withCredentials: true });
//       setRows((prev) => [...prev, ...(data.results || [])]);
//       setNextCursor(extractCursor(data.next));
//     } catch (e) {
//       console.error("Failed to load more", e);
//     } finally {
//       setLoadingMore(false);
//     }
//   }, [nextCursor, loadingMore, buildUrl]);

//   useEffect(() => {
//     loadInbox();
//   }, [loadInbox]);

//   // IntersectionObserver для infinite scroll
//   useEffect(() => {
//     if (observerRef.current) observerRef.current.disconnect();

//     observerRef.current = new IntersectionObserver(
//       (entries) => {
//         if (entries[0].isIntersecting && nextCursor && !loadingMore && !loading) {
//           loadMore();
//         }
//       },
//       { rootMargin: "200px" }
//     );

//     if (sentinelRef.current) {
//       observerRef.current.observe(sentinelRef.current);
//     }

//     return () => observerRef.current?.disconnect();
//   }, [nextCursor, loadingMore, loading, loadMore]);

//   useEffect(() => {
//     api.get("/cloud/clients/", { withCredentials: true })
//       .then(({ data }) => setCloudClients(data || []))
//       .catch(() => {});
//   }, []);

//   const formatDate = (isoString) => {
//     if (!isoString) return "";
//     try {
//       const d = new Date(isoString);
//       return d.toLocaleString("lt-LT");
//     } catch {
//       return isoString;
//     }
//   };

//   // ==== selection ====

//   const handleToggleRow = (id) => () => {
//     setSelectedIds((prev) =>
//       prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
//     );
//   };

//   const handleToggleAll = () => {
//     if (selectedIds.length === rows.length) {
//       setSelectedIds([]);
//     } else {
//       setSelectedIds(rows.map((r) => r.id));
//     }
//   };

//   const allSelected = rows.length > 0 && selectedIds.length === rows.length;
//   const someSelected =
//     selectedIds.length > 0 && selectedIds.length < rows.length;

//   // ==== menu ====

//   const handleMenuOpen = (event, rowId) => {
//     setMenuAnchorEl(event.currentTarget);
//     setMenuRowId(rowId);
//   };

//   const handleMenuClose = () => {
//     setMenuAnchorEl(null);
//     setMenuRowId(null);
//   };

//   // ==== delete core ====

//   const handleDelete = async (ids) => {
//     if (!ids || ids.length === 0) return;
//     try {
//       await api.delete("/web/mobile-inbox/bulk-delete/", {
//         data: { ids },
//       });
//       // Удаляем локально вместо полной перезагрузки
//       setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
//       setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
//     } catch (e) {
//       console.error("Failed to delete mobile inbox docs", e);
//       alert("Įvyko klaida trinant failus iš klientų.");
//     }
//   };

//   const openConfirmDelete = (ids) => {
//     if (!ids || ids.length === 0) return;
//     setConfirmIds(ids);
//     setConfirmOpen(true);
//   };

//   const handleConfirmClose = () => {
//     if (confirmLoading) return;
//     setConfirmOpen(false);
//     setConfirmIds([]);
//   };

//   const handleConfirmSubmit = async () => {
//     if (!confirmIds.length) return;
//     setConfirmLoading(true);
//     await handleDelete(confirmIds);
//     setConfirmLoading(false);
//     setConfirmOpen(false);
//     setConfirmIds([]);
//   };

//   const handleDeleteSingleFromMenu = (id) => {
//     handleMenuClose();
//     openConfirmDelete([id]);
//   };

//   const handleDeleteSelectedClick = () => {
//     openConfirmDelete(selectedIds);
//   };

//   // ==== promote / skaitmenizavimas ====

//   const openPromoteDialog = (count) => {
//     setPromoteCount(count);
//     setPromoteError(null);
//     setPromoteInProgress(true);
//     setPromoteDialogOpen(true);
//   };

//   const closePromoteDialog = () => {
//     setPromoteDialogOpen(false);
//     setPromoteInProgress(false);
//     setPromoteError(null);
//     setPromoteCount(0);
//   };

//   const doPromote = async (ids) => {
//     if (!ids || ids.length === 0) return;
//     openPromoteDialog(ids.length);

//     try {
//       await api.post("/web/mobile-inbox/promote/", { ids, scan_type: scanType });
//       // Удаляем promoted локально
//       setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
//       setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
//       setPromoteInProgress(false);
//     } catch (e) {
//       console.error("Failed to promote mobile docs", e);
//       setPromoteError("Įvyko klaida perkeliant failus į suvestinę.");
//       setPromoteInProgress(false);
//     }
//   };

//   const handlePromoteSelected = () => {
//     if (selectedIds.length === 0) return;
//     doPromote(selectedIds);
//   };

//   const handlePromoteSingle = (id) => {
//     handleMenuClose();
//     doPromote([id]);
//   };

//   // ==== preview ====

//   const handlePreview = (row) => {
//     if (!row?.preview_url) return;
//     setPreviewRow(row);
//     setPreviewOpen(true);
//   };

//   const handlePreviewClose = () => {
//     setPreviewOpen(false);
//     setPreviewRow(null);
//   };

//   return (
//     <Box px={6} py={4}>
//       <Helmet>
//         <title>Failai iš klientų</title>
//         <meta
//           name="description"
//           content="Čia rasite failus atsiųstus jūsų klientų."
//         />
//       </Helmet>

//       {/* Верхняя панель */}
//       <Box
//         sx={{
//           mb: 2,
//           display: "flex",
//           alignItems: "center",
//           justifyContent: "space-between",
//           gap: 2,
//           flexWrap: "wrap",
//         }}
//       >
//         <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
//           {/* Šaltinio filtras */}
//           <TextField
//             select
//             size="small"
//             label="Šaltinis"
//             value={sourceFilter}
//             onChange={(e) => setSourceFilter(e.target.value)}
//             sx={{ minWidth: 150 }}
//           >
//             <MenuItem value="all">Visi šaltiniai</MenuItem>
//             <MenuItem value="mob">Mob. programa</MenuItem>
//             <MenuItem value="email">El. paštas</MenuItem>
//             <MenuItem value="google_drive">Google Drive</MenuItem>
//             <MenuItem value="dropbox">Dropbox</MenuItem>
//           </TextField>

//           {cloudClients.length > 0 && (
//             <TextField
//               select
//               size="small"
//               label="Klientas"
//               value={clientFilter}
//               onChange={(e) => setClientFilter(e.target.value)}
//               sx={{ minWidth: 180 }}
//             >
//               <MenuItem value="">Visi klientai</MenuItem>
//               {cloudClients.map((c) => (
//                 <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>
//               ))}
//             </TextField>
//           )}    

//           {/* Scan type dropdown */}
//           <TextField
//             select
//             size="small"
//             label="Skaitmenizavimo tipas"
//             value={scanType}
//             onChange={(e) => setScanType(e.target.value)}
//             sx={{ minWidth: 270 }}
//           >
//             {SCAN_TYPES.map((type) => (
//               <MenuItem key={type.value} value={type.value}>
//                 {type.label}
//               </MenuItem>
//             ))}
//           </TextField>

//           {/* Skaitmenizuoti button */}
//           <Button
//             variant="contained"
//             startIcon={<DocumentScannerIcon />}
//             disabled={selectedIds.length === 0 || loading}
//             onClick={handlePromoteSelected}
//             sx={{
//               ...(selectedIds.length > 0 && {
//                 backgroundColor: "#7c4dff",
//                 "&:hover": {
//                   backgroundColor: "#651fff",
//                 },
//               }),
//             }}
//           >
//             Skaitmenizuoti pasirinktus
//           </Button>

//           {/* Delete button */}
//           <Tooltip title="Ištrinti pasirinktus">
//             <span>
//               <Button
//                 variant="outlined"
//                 size="medium"
//                 color="error"
//                 startIcon={<DeleteIcon />}
//                 disabled={selectedIds.length === 0 || loading}
//                 onClick={handleDeleteSelectedClick}
//               >
//                 Ištrinti
//               </Button>
//             </span>
//           </Tooltip>

//           {selectedIds.length > 0 && (
//             <Typography variant="body2" sx={{ color: "text.secondary" }}>
//               Pasirinkta: {selectedIds.length}
//             </Typography>
//           )}
//         </Box>

//         <Box display="flex" alignItems="center" gap={2}>
//           <Typography variant="body2" sx={{ color: "text.secondary" }}>
//             Įkelta: {rows.length}{nextCursor ? "+" : ""}
//           </Typography>
//           <Tooltip title="Atnaujinti">
//             <IconButton
//               onClick={loadInbox}
//               disabled={loading}
//               size="small"
//               sx={{
//                 border: "1px solid",
//                 borderColor: "divider",
//               }}
//             >
//               <RefreshIcon fontSize="small" />
//             </IconButton>
//           </Tooltip>
//         </Box>
//       </Box>

//       {loading && <LinearProgress sx={{ mb: 1 }} />}

//       <TableContainer component={Paper} sx={{ maxHeight: 580 }}>
//         <Table stickyHeader size="small">
//           <TableHead>
//             <TableRow>
//               <TableCell padding="checkbox">
//                 <Checkbox
//                   indeterminate={someSelected}
//                   checked={allSelected}
//                   onChange={handleToggleAll}
//                   inputProps={{ "aria-label": "select all" }}
//                 />
//               </TableCell>
//               <TableCell sx={{ fontWeight: 600 }}>Failas</TableCell>
//               <TableCell sx={{ fontWeight: 600 }}>Siuntėjas</TableCell>
//               <TableCell sx={{ fontWeight: 600 }}>Siuntimo tipas</TableCell>
//               <TableCell sx={{ fontWeight: 600 }}>Gavimo data</TableCell>
//               <TableCell align="right" sx={{ fontWeight: 600 }} />
//             </TableRow>
//           </TableHead>

//           <TableBody>
//             {loading && rows.length === 0 ? (
//               <TableRow>
//                 <TableCell colSpan={6} align="center">
//                   <CircularProgress size={24} />
//                 </TableCell>
//               </TableRow>
//             ) : rows.length === 0 ? (
//               <TableRow>
//                 <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
//                   <Typography variant="body2" sx={{ color: "text.secondary" }}>
//                     Nėra naujų failų iš klientų
//                   </Typography>
//                 </TableCell>
//               </TableRow>
//             ) : (
//               <>
//                 {rows.map((row) => {
//                   const isSelected = selectedIds.includes(row.id);
//                   const senderLabel = row.sender_label;
//                   const senderEmail = row.sender_email;

//                   return (
//                     <TableRow key={row.id} hover>
//                       <TableCell padding="checkbox">
//                         <Checkbox
//                           checked={isSelected}
//                           onChange={handleToggleRow(row.id)}
//                           inputProps={{ "aria-label": "select row" }}
//                         />
//                       </TableCell>

//                       <TableCell
//                         sx={{
//                           cursor: row.preview_url ? "pointer" : "default",
//                           color: row.preview_url ? "primary.main" : "inherit",
//                           maxWidth: 260,
//                         }}
//                         onClick={() => handlePreview(row)}
//                       >
//                         <Tooltip title={row.original_filename || ""}>
//                           <span
//                             style={{
//                               display: "inline-block",
//                               overflow: "hidden",
//                               textOverflow: "ellipsis",
//                               whiteSpace: "nowrap",
//                               maxWidth: "100%",
//                             }}
//                           >
//                             {row.original_filename || "—"}
//                           </span>
//                         </Tooltip>
//                       </TableCell>

//                       <TableCell>
//                         {senderLabel ? (
//                           <>
//                             <Typography variant="body2">{senderLabel}</Typography>
//                             {senderEmail && (
//                               <Typography
//                                 variant="caption"
//                                 sx={{ color: "text.secondary" }}
//                               >
//                                 {senderEmail}
//                               </Typography>
//                             )}
//                           </>
//                         ) : senderEmail ? (
//                           <Typography variant="body2">{senderEmail}</Typography>
//                         ) : (
//                           <Typography
//                             variant="body2"
//                             sx={{ color: "text.disabled" }}
//                           >
//                             Nenurodytas
//                           </Typography>
//                         )}
//                       </TableCell>

//                       <TableCell>
//                         <Chip
//                           label={
//                             row.source === "email" ? "El. paštas" :
//                             row.source === "google_drive" ? "Google Drive" :
//                             row.source === "dropbox" ? "Dropbox" :
//                             "Mob. progr."
//                           }
//                           size="small"
//                           color={
//                             row.source === "email" ? "info" :
//                             row.source === "google_drive" ? "primary" :
//                             row.source === "dropbox" ? "secondary" :
//                             "default"
//                           }
//                           variant="outlined"
//                           sx={{ fontSize: 12, height: 22 }}
//                         />
//                         {row.client_name && (
//                           <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.3 }}>
//                             {row.client_name}
//                           </Typography>
//                         )}
//                       </TableCell>

//                       <TableCell>
//                         <Typography variant="body2">
//                           {formatDate(row.created_at)}
//                         </Typography>
//                       </TableCell>

//                       <TableCell align="right">
//                         <IconButton
//                           size="small"
//                           onClick={(e) => handleMenuOpen(e, row.id)}
//                         >
//                           <MoreVertIcon fontSize="small" />
//                         </IconButton>
//                       </TableCell>
//                     </TableRow>
//                   );
//                 })}

//                 {/* Sentinel row для infinite scroll */}
//                 <TableRow ref={sentinelRef}>
//                   <TableCell colSpan={6} sx={{ p: 0, border: 0, height: 1 }} />
//                 </TableRow>

//                 {loadingMore && (
//                   <TableRow>
//                     <TableCell colSpan={6} align="center" sx={{ py: 2 }}>
//                       <LinearProgress sx={{ maxWidth: 200, mx: "auto", mb: 1 }} />
//                       <Typography variant="body2" color="text.secondary">
//                         Kraunama daugiau...
//                       </Typography>
//                     </TableCell>
//                   </TableRow>
//                 )}

//                 {!nextCursor && rows.length > 0 && !loading && !loadingMore && (
//                   <TableRow>
//                     <TableCell colSpan={6} align="center" sx={{ py: 2, color: "text.disabled" }}>
//                       <Typography variant="body2">
//                         Visi failai įkelti ({rows.length})
//                       </Typography>
//                     </TableCell>
//                   </TableRow>
//                 )}
//               </>
//             )}
//           </TableBody>
//         </Table>
//       </TableContainer>

//       {/* Меню по 3 точкам */}
//       <Menu
//         anchorEl={menuAnchorEl}
//         open={Boolean(menuAnchorEl)}
//         onClose={handleMenuClose}
//       >
//         <MenuItem
//           onClick={() => {
//             if (menuRowId != null) {
//               handlePromoteSingle(menuRowId);
//             }
//           }}
//         >
//           Skaitmenizuoti
//         </MenuItem>
//         <MenuItem
//           onClick={() => {
//             if (menuRowId != null) {
//               handleDeleteSingleFromMenu(menuRowId);
//             }
//           }}
//         >
//           Ištrinti
//         </MenuItem>
//       </Menu>

//       {/* Диалог прогресса skaitmenizavimo */}
//       <Dialog
//         open={promoteDialogOpen}
//         onClose={promoteInProgress ? undefined : closePromoteDialog}
//       >
//         <DialogTitle>Skaitmenizavimas</DialogTitle>
//         <DialogContent sx={{ pt: 2, minWidth: 320 }}>
//           {promoteInProgress && (
//             <Box
//               sx={{
//                 display: "flex",
//                 alignItems: "center",
//                 gap: 2,
//                 py: 1,
//               }}
//             >
//               <CircularProgress size={24} />
//               <Typography variant="body2">
//                 Failai perkeliami į suvestinę ir ruošiami skaitmenizavimui...
//               </Typography>
//             </Box>
//           )}

//           {!promoteInProgress && !promoteError && (
//             <Box
//               sx={{
//                 display: "flex",
//                 alignItems: "center",
//                 gap: 1.5,
//                 py: 1,
//               }}
//             >
//               <CheckCircleIcon color="success" />
//               <Typography variant="body2">
//                 {promoteCount === 1
//                   ? "1 failas buvo perkeltas į suvestinę ir skaitmenizuojamas"
//                   : `${promoteCount} failai buvo perkelti į suvestinę ir skaitmenizuojami`}
//               </Typography>
//             </Box>
//           )}

//           {!promoteInProgress && promoteError && (
//             <Box
//               sx={{
//                 display: "flex",
//                 alignItems: "center",
//                 gap: 1.5,
//                 py: 1,
//               }}
//             >
//               <WarningIcon color="error" />
//               <Typography variant="body2" sx={{ color: "error.main" }}>
//                 {promoteError}
//               </Typography>
//             </Box>
//           )}
//         </DialogContent>
//         <DialogActions>
//           {!promoteInProgress && (
//             <Button onClick={closePromoteDialog}>Uždaryti</Button>
//           )}
//         </DialogActions>
//       </Dialog>

//       {/* Диалог подтверждения удаления */}
//       <Dialog
//         open={confirmOpen}
//         onClose={confirmLoading ? undefined : handleConfirmClose}
//       >
//         <DialogTitle>Patvirtinkite ištrynimą</DialogTitle>
//         <DialogContent sx={{ pt: 1, minWidth: 320 }}>
//           <Typography variant="body2">
//             {confirmIds.length === 1
//               ? "Ar tikrai norite ištrinti šį failą?"
//               : `Ar tikrai norite ištrinti pasirinktus failus (${confirmIds.length})?`}
//           </Typography>
//         </DialogContent>
//         <DialogActions>
//           <Button onClick={handleConfirmClose} disabled={confirmLoading}>
//             Atšaukti
//           </Button>
//           <Button
//             onClick={handleConfirmSubmit}
//             color="error"
//             variant="contained"
//             disabled={confirmLoading}
//             startIcon={
//               confirmLoading ? <CircularProgress size={14} /> : <DeleteIcon />
//             }
//           >
//             Ištrinti
//           </Button>
//         </DialogActions>
//       </Dialog>

//       {/* Диалог превью файлов (PDF) */}
//       <FailuPreviewDialog
//         open={previewOpen}
//         onClose={handlePreviewClose}
//         file={previewRow}
//       />
//     </Box>
//   );
// }