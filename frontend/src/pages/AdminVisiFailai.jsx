// src/pages/AdminVisiFailai.jsx
import { useEffect, useMemo, useState } from "react";
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

export default function AdminVisiFailai() {
  const [docs, setDocs] = useState([]);
  const [filters, setFilters] = useState({ status: "", dateFrom: "", dateTo: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [user, setUser] = useState(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

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

  // тянем все страницы с бэка
  const fetchDocs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      params.set("page_size", "200"); // крупная страница, чтобы реже листать

      let url = `/admin/visi-failai/?${params.toString()}`;
      const acc = [];

      while (url) {
        const { data } = await api.get(url, { withCredentials: true });
        if (Array.isArray(data?.results)) acc.push(...data.results);
        // DRF отдаёт абсолютный next или относительный — поддержим оба варианта:
        url = data?.next
          ? (data.next.startsWith("http") ? data.next : data.next.replace(api.defaults.baseURL, ""))
          : null;
      }

      setDocs(acc);
    } catch (e) {
      console.error("Nepavyko gauti dokumentų:", e);
      setDocs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userLoaded && user?.is_superuser) fetchDocs();
  }, [userLoaded]); // initial load

  // локальные фильтры дат (клиент-сайд)
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
        // первые два столбца:
        user_id: d.user_id ?? null,
        owner_email: d.owner_email ?? "",
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

  const programLabel =
    ACCOUNTING_PROGRAMS.find((p) => p.value === user?.default_accounting_program)?.label || "eksporto programa";

  return (
    <Box p={4}>
      <Helmet>
        <title>Visi failai (Admin)</title>
      </Helmet>

      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="h5">Visi failai</Typography>
          <Chip size="small" label="Visi dokumentai (visi laikotarpiai)" />
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
          showOwnerColumns // <— новый проп, чтобы показать первые 2 столбца
        />
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
