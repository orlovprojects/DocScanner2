import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Helmet } from 'react-helmet';
import {
  Box, Button, Typography, Alert, LinearProgress, Chip,
} from "@mui/material";
import { api } from "../api/endpoints";
import DocumentsTable from "../page_elements/DocumentsTable";
import PreviewDialog from "../page_elements/PreviewDialog";
import DocumentsFilters from "../components/DocumentsFilters";
import { ACCOUNTING_PROGRAMS } from "../page_elements/AccountingPrograms";
import { HourglassEmpty, Cancel, CheckCircleOutline } from "@mui/icons-material";

export default function AdminSuvestine() {
  const [docs, setDocs] = useState([]);
  const [filters, setFilters] = useState({ status: "", dateFrom: "", dateTo: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [user, setUser] = useState(null);
  const [userLoaded, setUserLoaded] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);

  const observerRef = useRef(null);
  const sentinelRef = useRef(null);

  // load profile
  useEffect(() => {
    api.get("/profile/", { withCredentials: true })
      .then(res => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setUserLoaded(true));
  }, []);

  const fmt = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString("lt-LT", {
          year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit",
        })
      : "—";

  const statusLabel = (d) =>
    d.status === "completed"
      ? d.exported ? "Atliktas (Eksportuotas)" : "Atliktas (Neeksportuotas)"
      : ({"processing":"Vykdomas","rejected":"Atmestas","pending":"Vykdomas"}[d.status] || "—");

  const iconForStatus = (st) =>
    st === "processing" || st === "pending" ? (
      <HourglassEmpty color="warning" />
    ) : st === "rejected" ? (
      <Cancel color="error" />
    ) : (
      <CheckCircleOutline color="success" />
    );

  // Извлечение cursor из next URL
  const extractCursor = (nextUrl) => {
    if (!nextUrl) return null;
    try {
      const url = new URL(nextUrl, window.location.origin);
      return url.searchParams.get("cursor");
    } catch {
      return null;
    }
  };

  // Построение URL с фильтрами
  const buildUrl = useCallback((cursor = null) => {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (cursor) params.set("cursor", cursor);
    return `/admin/documents_with_errors/?${params.toString()}`;
  }, [filters.status]);

  // Первоначальная загрузка
  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(buildUrl(), { withCredentials: true });
      setDocs(data.results || []);
      setNextCursor(extractCursor(data.next));
    } catch (e) {
      console.error("Nepavyko gauti dokumentų:", e);
      setDocs([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  // Подгрузка следующей страницы
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);
    try {
      const { data } = await api.get(buildUrl(nextCursor), { withCredentials: true });
      setDocs(prev => [...prev, ...(data.results || [])]);
      setNextCursor(extractCursor(data.next));
    } catch (e) {
      console.error("Nepavyko įkelti daugiau:", e);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, buildUrl]);

  // Initial load
  useEffect(() => {
    if (userLoaded && user?.is_superuser) fetchDocs();
  }, [userLoaded, user?.is_superuser, fetchDocs]);

  // Перезагрузка при изменении фильтра статуса
  useEffect(() => {
    if (userLoaded && user?.is_superuser) fetchDocs();
  }, [filters.status]);

  // IntersectionObserver для infinite scroll
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

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [nextCursor, loadingMore, loading, loadMore]);

  // Локальные фильтры дат (клиент-сайд)
  const baseFiltered = useMemo(() => {
    if (!Array.isArray(docs)) return [];
    const df = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const dt = filters.dateTo ? new Date(filters.dateTo + "T23:59:59") : null;

    return docs.filter(d => {
      const up = d.uploaded_at ? new Date(d.uploaded_at) : null;
      if (df && up && up < df) return false;
      if (dt && up && up > dt) return false;
      return true;
    });
  }, [docs, filters.dateFrom, filters.dateTo]);

  const handleFilter = (f) => (e) => setFilters((p) => ({ ...p, [f]: e.target.value }));

  // подготовка данных для таблицы
  const tableData = useMemo(
    () =>
      (baseFiltered || []).map((d) => ({
        ...d,
        effective_direction: (d.pirkimas_pardavimas || "").toLowerCase() || "nezinoma",
        onClickPreview: (doc) => { setSelected(doc); setDialogOpen(true); },
        iconForStatus,
        statusLabel,
        fmt,
      })),
    [baseFiltered]
  );

  if (userLoaded && !user?.is_superuser) {
    return (
      <Box p={4}>
        <Alert severity="error">Neturite prieigos prie administratoriaus suvestinės.</Alert>
      </Box>
    );
  }

  return (
    <Box p={4}>
      <Helmet>
        <title>Admin suvestinė</title>
      </Helmet>

      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="h5">Administratoriaus suvestinė</Typography>
          <Chip 
            size="small" 
            label={`Su klaidomis: ${docs.length}${nextCursor ? '+' : ''}`} 
            color="error"
            variant="outlined"
          />
        </Box>
        <Button variant="outlined" onClick={fetchDocs} disabled={loading}>
          Atnaujinti
        </Button>
      </Box>

      <DocumentsFilters filters={filters} onFilterChange={handleFilter} />

      {loading && <LinearProgress sx={{ mt: 2 }} />}

      <Box sx={{ mt: 2, overflow: "hidden" }}>
        <DocumentsTable
          filtered={tableData}
          selectedRows={[]}
          isRowExportable={() => false}
          handleSelectRow={() => () => {}}
          handleSelectAll={() => {}}
          loading={loading}
          allowUnknownDirection={true}
          reloadDocuments={fetchDocs}
          onDeleteDoc={(id) => setDocs(prev => prev.filter(d => d.id !== id))}
          showOwnerColumns
        />

        {/* Sentinel для infinite scroll */}
        <Box ref={sentinelRef} sx={{ height: 1 }} />

        {loadingMore && (
          <Box sx={{ py: 2 }}>
            <LinearProgress />
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 1 }}>
              Kraunama daugiau...
            </Typography>
          </Box>
        )}

        {!nextCursor && docs.length > 0 && !loading && (
          <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 2 }}>
            Visi dokumentai su klaidomis įkelti ({docs.length})
          </Typography>
        )}
      </Box>

      <PreviewDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        selected={selected}
        setSelected={setSelected}
        setDocs={setDocs}
        user={user}
        selectedCpKey=""
        showRawPanels={true}
      />
    </Box>
  );
}