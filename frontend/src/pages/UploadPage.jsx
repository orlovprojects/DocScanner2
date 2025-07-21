import { useEffect, useMemo, useState } from "react";
import {
  Box, Button, Typography, Alert, TextField, MenuItem, Dialog, DialogTitle, DialogContent, LinearProgress
} from "@mui/material";
import { CloudUpload, HourglassEmpty, Cancel, CheckCircleOutline } from "@mui/icons-material";
import { api } from "../api/endpoints";
import DocumentsTable from "../page_elements/DocumentsTable";
import PreviewDialog from "../page_elements/PreviewDialog";
import DocumentsFilters from "../components/DocumentsFilters";
import { usePollingDocumentStatus } from "../page_elements/Polling";
import { ACCOUNTING_PROGRAMS } from "../page_elements/AccountingPrograms";

const SCAN_TYPES = [
  { value: "sumiskai", label: "Sumiskai (be eiluciu) – 1 kreditas" },
  { value: "detaliai", label: "Detaliai (su eilutemis) – 1.3 kredito" },
];

export default function UploadPage() {
  const [docs, setDocs] = useState([]);
  const [filters, setFilters] = useState({ status: "", dateFrom: "", dateTo: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [creditError, setCreditError] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);
  const [user, setUser] = useState(null);
  const [scanType, setScanType] = useState("sumiskai");
  // --- Для прогресс-бара:
  const [progressOpen, setProgressOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

  // Получаем юзера
  useEffect(() => {
    api.get("/profile/", { withCredentials: true })
      .then(res => setUser(res.data))
      .catch(() => setUser(null));
  }, []);

  // Получаем документы при загрузке страницы
  useEffect(() => {
    fetchDocs();
    // eslint-disable-next-line
  }, []);

  // Получение документов
  const fetchDocs = async () => {
    try {
      const { data } = await api.get("/documents/", { withCredentials: true });
      setDocs(data);
    } catch (e) {
      console.error("Nepavyko gauti dokumentų:", e);
    }
  };

  // Polling статусов документов (автообновление статусов)
  usePollingDocumentStatus({ docs, setDocs });

  const programLabel =
    ACCOUNTING_PROGRAMS.find(
      (p) => p.value === user?.default_accounting_program
    )?.label || "eksporto programa";

  // --- Функция для загрузки файлов с прогресс-баром
  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadProgress({ current: 0, total: files.length });
    setProgressOpen(true);

    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    formData.append("scan_type", scanType);

    try {
      // Можно добавить setUploadProgress({ current: x, total: files.length }); на реальный progress
      await api.post("/scan/", formData, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" },
        // Прогресс: можно прокидывать сюда если бек поддерживает onUploadProgress (например через axios)
        onUploadProgress: (progressEvent) => {
          if (progressEvent.lengthComputable) {
            // Просто вычисляем текущий шаг (на глаз, 1 раз = 1 файл)
            const percent = progressEvent.loaded / progressEvent.total;
            setUploadProgress((prev) => ({
              ...prev,
              current: Math.round(percent * files.length)
            }));
          }
        }
      });
      setUploadProgress({ current: files.length, total: files.length });
      await fetchDocs();
    } catch (err) {
      const serverError = err?.response?.data?.error;
      if (serverError && serverError.toLowerCase().includes("kredit")) {
        setCreditError(serverError);
      } else {
        alert("Nepavyko įkelti failų");
      }
    }
    setTimeout(() => setProgressOpen(false), 700); // Чуть задержки для UX
  };

  // Фильтрация для таблицы (по статусу, дате и т.д.)
  const filtered = useMemo(() => {
    if (!Array.isArray(docs)) return [];
    return docs.filter((d) => {
      // Фильтр по статусу
      if (filters.status && d.status !== filters.status) return false;

      // Фильтр по дате
      const created = new Date(d.uploaded_at);
      if (filters.dateFrom && created < new Date(filters.dateFrom)) return false;
      if (filters.dateTo && created > new Date(filters.dateTo + "T23:59:59")) return false;

      return true;
    });
  }, [docs, filters]);

  const isCompanyReady =
  !!user?.company_name &&
  !!user?.company_code &&
  !!user?.company_country_iso &&
  !!user?.default_accounting_program;

  // Табличные helpers
  const statusLabel = (d) =>
    d.status === "completed"
      ? d.exported
        ? "Atliktas (Eksportuotas)"
        : "Atliktas (Neeksportuotas)"
      : ({"processing": "Vykdomas", "rejected": "Atmestas", "pending": "Vykdomas"}[d.status] || "—");

  const iconForStatus = (st) =>
    st === "processing" || st === "pending" ? (
      <HourglassEmpty color="warning" />
    ) : st === "rejected" ? (
      <Cancel color="error" />
    ) : (
      <CheckCircleOutline color="success" />
    );

  const fmt = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString("lt-LT", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  const tableData = useMemo(
    () =>
      filtered.map((d) => ({
        ...d,
        onClickPreview: (doc) => {
          setSelected(doc);
          setDialogOpen(true);
        },
        iconForStatus,
        statusLabel,
        fmt,
      })),
    [filtered]
  );

  const isRowExportable = (row) => row.status === "completed" || row.status === "exported";

  const handleSelectRow = (id) => (e) => {
    if (!isRowExportable(tableData.find((d) => d.id === id))) return;
    setSelectedRows((prev) =>
      e.target.checked ? [...prev, id] : prev.filter((rowId) => rowId !== id)
    );
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedRows(tableData.filter(isRowExportable).map((d) => d.id));
    } else {
      setSelectedRows([]);
    }
  };

  const handleFilter = (f) => (e) => setFilters((p) => ({ ...p, [f]: e.target.value }));

  if (!user) return null;

  // Экспорт выбранных документов
  const handleExport = async () => {
    if (selectedRows.length === 0) {
      alert("Pasirinkite bent vieną dokumentą eksportui!");
      return;
    }
    try {
      const res = await api.post(
        "/documents/export_xml/",
        { ids: selectedRows },
        {
          withCredentials: true,
          responseType: "blob",
        }
      );
      let filename = "";
      const contentDisposition = res.headers["content-disposition"];
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }
      if (!filename) {
        filename = selectedRows.length === 1 ? "dokumentas.xml" : "dokumentai.zip";
      }
      // --- Скачать файл ---
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // --- После экспорта обновляем статусы выбранных документов ---
      // Если setDocs передан через пропсы/контекст:
      setDocs &&
        setDocs((prev) =>
          prev.map((d) =>
            selectedRows.includes(d.id)
              ? { ...d, status: "exported" }
              : d
          )
        );
    } catch (err) {
      alert("Eksportas nepavyko: " + (err?.message || "Klaida"));
      console.error(err);
    }
  };


  // --- ВОТ ЗДЕСЬ — POPUP ПРОГРЕССА ЗАГРУЗКИ ---
  const progressPercent =
    uploadProgress.total > 0
      ? Math.round((uploadProgress.current / uploadProgress.total) * 100)
      : 0;

  return (
    <Box p={4}>
      {/* Popup прогресса */}
      <Dialog open={progressOpen} maxWidth="xs" fullWidth>
        <DialogTitle>Įkeliami failai</DialogTitle>
        <DialogContent>
          <Box mb={1}>
            {`Įkelta: ${uploadProgress.current} iš ${uploadProgress.total}`}
          </Box>
          <LinearProgress variant="determinate" value={progressPercent} />
        </DialogContent>
      </Dialog>

      {creditError && (
        <Alert
          severity="warning"
          sx={{ mb: 2, alignItems: "center" }}
          action={
            <Button
              color="warning"
              variant="contained"
              size="small"
              onClick={() => (window.location = "/papildyti/")}
            >
              Papildyti
            </Button>
          }
          onClose={() => setCreditError(null)}
        >
          {creditError}
        </Alert>
      )}
      {!isCompanyReady && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Prieš įkeliant failus apdorojimui, įveskite savo įmonės duomenis ir pasirinkite buhalterinę programą eksportui.
          <Button
            variant="contained"
            size="small"
            sx={{ ml: 2 }}
            onClick={() => window.location = "/nustatymai"}
          >
            Pasirinkti
          </Button>
        </Alert>
      )}

      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography variant="h5">Saskaitų faktūrų suvestinė</Typography>
        <Button
          variant="outlined"
          color="primary"
          sx={{ ml: 2 }}
          onClick={handleExport}
          disabled={selectedRows.length === 0 || !isCompanyReady}
        >
          Eksportuoti į {programLabel}
        </Button>
      </Box>

      <Box mb={2} display="flex" alignItems="center" gap={2}>
        <TextField
          select
          size="small"
          label="Skenavimo tipas"
          value={scanType}
          onChange={e => setScanType(e.target.value)}
          sx={{ minWidth: 270 }}
        >
          {SCAN_TYPES.map((type) => (
            <MenuItem key={type.value} value={type.value}>
              {type.label}
            </MenuItem>
          ))}
        </TextField>

        <Button
          variant="contained"
          component="label"
          startIcon={<CloudUpload />}
          disabled={progressOpen || !isCompanyReady} // <--- добавлено условие!
        >
          Įkelti failus
          <input type="file" hidden multiple onChange={handleFileChange} />
        </Button>
      </Box>

      <DocumentsFilters filters={filters} onFilterChange={handleFilter} />

      <DocumentsTable
        filtered={tableData}
        selectedRows={selectedRows}
        isRowExportable={isRowExportable}
        handleSelectRow={handleSelectRow}
        handleSelectAll={handleSelectAll}
      />

      <PreviewDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        selected={selected}
        setSelected={setSelected}
        setDocs={setDocs}
        user={user}
      />
    </Box>
  );
}

