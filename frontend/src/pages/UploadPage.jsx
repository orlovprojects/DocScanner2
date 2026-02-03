import { useEffect, useMemo, useState } from "react";
import { Helmet } from 'react-helmet';
import {
  Box, Button, Typography, Alert, TextField, MenuItem, Dialog, DialogTitle, DialogContent, LinearProgress,
  List, ListItemButton, ListItemText, IconButton, Divider, InputAdornment, Tooltip, Modal, Snackbar, Skeleton, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  useTheme, useMediaQuery, Autocomplete, Chip,
} from "@mui/material";
import {
  CloudUpload, HourglassEmpty, Cancel, CheckCircleOutline,
} from "@mui/icons-material";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import MenuIcon from "@mui/icons-material/Menu";
import SearchIcon from "@mui/icons-material/Search";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import PersonIcon from "@mui/icons-material/Person";
import CloseIcon from "@mui/icons-material/Close";

import { api } from "../api/endpoints";
import DocumentsTable from "../page_elements/DocumentsTable";
import PreviewDialog from "../page_elements/PreviewDialog";
import DocumentsFilters from "../components/DocumentsFilters";
import { ACCOUNTING_PROGRAMS } from "../page_elements/AccountingPrograms";

import { useUploadSession } from "../components/useUploadSession";
import UploadProgressDialog from "../components/UploadProgressDialog";
import ProcessingStatusBar from "../components/ProcessingStatusBar";

const SCAN_TYPES = [
  { value: "sumiskai", label: "Sumiškai (be eilučių) – 1 kreditas" },
  { value: "detaliai", label: "Detaliai (su eilutėmis) – 1.3 kredito" },
];

// YouTube video tutorials for each accounting program
const EXPORT_TUTORIALS = {
  rivile: {
    label: "Rivilę Gamą",
    url: "https://www.youtube.com/embed/7uwLLA3uTQ0",
  },
  rivile_erp: {
    label: "Rivilę ERP",
    url: "https://www.youtube.com/embed/2ENROTqWfYw",
  },
  finvalda: {
    label: "Finvaldą",
    url: "https://www.youtube.com/embed/n1OGeQ9quEk",
  },
  apskaita5: {
    label: "Apskaita5",
    url: "https://www.youtube.com/embed/_HeD_TKUsl0",
  },
};

// Onboarding video URL
const ONBOARDING_VIDEO_URL = "https://www.youtube.com/embed/ByViuilYxZA";

// Минимальная высота контента для предотвращения layout shift
const MIN_CONTENT_HEIGHT = '700px';

// стабильный ключ контрагента
const companyKey = (name, vat, id) => {
  if (id != null && id !== "") return `id:${String(id)}`;
  const normVat  = (vat  || "").trim().toLowerCase();
  const normName = (name || "").trim().toLowerCase();
  return normVat || normName;
};

function resolveDirection(doc, selectedCpKey) {
  const mkKey = (id, vat, name) => {
    const idStr = id == null ? "" : String(id).trim();
    if (idStr) return `id:${idStr}`;
    const normVat  = (vat  || "").trim().toLowerCase();
    const normName = (name || "").trim().toLowerCase();
    return normVat || normName;
  };

  const sKey = mkKey(doc.seller_id, doc.seller_vat_code, doc.seller_name);
  const bKey = mkKey(doc.buyer_id,  doc.buyer_vat_code,  doc.buyer_name);

  if (selectedCpKey === sKey) return "pardavimas";
  if (selectedCpKey === bKey) return "pirkimas";
  return null;
}

export default function UploadPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [docs, setDocs] = useState([]);
  const [nextUrl, setNextUrl] = useState(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [filters, setFilters] = useState(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    
    return {
      status: "",
      dateFrom: thirtyDaysAgo.toISOString().split('T')[0],
      dateTo: now.toISOString().split('T')[0],
      search: "",
    };
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [creditError, setCreditError] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);

  const [selectionMode, setSelectionMode] = useState("none");
  const [excludedIds, setExcludedIds] = useState([]);
  const [exportableTotal, setExportableTotal] = useState(0);

  const [user, setUser] = useState(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [scanType, setScanType] = useState("sumiskai");

  const [counterparties, setCounterparties] = useState([]);
  const [cpLoading, setCpLoading] = useState(false);

  const [initialDocsLoaded, setInitialDocsLoaded] = useState(false);
  const [initialCpLoaded, setInitialCpLoaded] = useState(false);

  const [cpToastOpen, setCpToastOpen] = useState(false);

  const pingChooseCp = () => {
    if (user?.view_mode === "multi" && !selectedCpKey) {
      setCpToastOpen(true);
    }
  };

  // video tutorial modal (for export)
  const [tutorialOpen, setTutorialOpen] = useState(false);

  // onboarding video modal (for new users)
  const [onboardingVideoOpen, setOnboardingVideoOpen] = useState(false);

  // sidebar (multi) - only for desktop
  const [openSidebar, setOpenSidebar] = useState(() => {
    // По умолчанию открыт, но можно восстановить из localStorage
    try { 
      const saved = localStorage.getItem("sv_open");
      return saved !== "0"; // открыт если не сохранено "0"
    } catch { 
      return true; 
    }
  });
  const [cpSearch, setCpSearch] = useState("");
  // одиночный выбор контрагента
  const [selectedCpKey, setSelectedCpKey] = useState("");

  const [archiveWarnings, setArchiveWarnings] = useState([]);

  const {
    isUploading,
    uploadProgress,
    error: uploadError,
    skippedFiles,
    clearSkipped,
    startUpload,
    cancelUpload,
  } = useUploadSession({
    onUploadComplete: (finalized) => {
      console.log("Upload complete, processing started:", finalized.stage);
    },
    onError: (msg) => {
      if (msg?.toLowerCase().includes("kredit")) {
        setCreditError(msg);
      }
    },
  });

  const fetchDocs = async () => {
    setLoadingDocs(true);
    try {
      const cpParam =
        user?.view_mode === "multi" && selectedCpKey
          ? selectedCpKey
          : undefined;

      const params = {
        status: filters.status || undefined,
        from: filters.dateFrom || undefined,
        to: filters.dateTo || undefined,
        search: (filters.search || "").trim() || undefined,
        cp: cpParam,
      };

      const { data } = await api.get("/documents/", { withCredentials: true, params });
      setDocs(data.results || []);
      setNextUrl(data.next || null);
      setExportableTotal(Number(data.exportable_total || 0));
    } catch (e) {
      console.error("Nepavyko gauti dokumentų:", e);
    } finally {
      setLoadingDocs(false);
      setInitialDocsLoaded(true);
    }
  };

  const fetchCounterparties = async (qText = "") => {
    setCpLoading(true);
    try {
      const params = {
        status: filters.status || undefined,
        from: filters.dateFrom || undefined,
        to: filters.dateTo || undefined,
        q: qText.trim() || undefined,
        limit: 200,
      };
      const { data } = await api.get("/documents/counterparties/", { withCredentials: true, params });
      setCounterparties(data.results || []);
    } catch (e) {
      console.error("Nepavyko gauti kontrahentų:", e);
    } finally {
      setCpLoading(false);
      setInitialCpLoaded(true);
    }
  };  

  useEffect(() => {
    if (!filters.dateFrom || !filters.dateTo) return;
    setSelectedRows([]);
    setSelectionMode("none");
    setExcludedIds([]);
    fetchDocs();
  }, [filters.status, filters.dateFrom, filters.dateTo, filters.search, selectedCpKey]);

  useEffect(() => {
    if (!filters.dateFrom || !filters.dateTo) return;
    const t = setTimeout(() => {
      fetchCounterparties(cpSearch);
    }, 300);
    return () => clearTimeout(t);
  }, [cpSearch, filters.status, filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    setSelectedCpKey("");
    setSelectedRows([]);
    try { localStorage.removeItem("sv_selected_key"); } catch {}
  }, []);

  useEffect(() => {
    if (user?.view_mode) {
      setSelectedCpKey("");
      setSelectedRows([]);
      try { localStorage.removeItem("sv_selected_key"); } catch {}
    }
  }, [user?.view_mode]);

  // persist sidebar state - only save, don't trigger requests
  useEffect(() => {
    if (!isMobile) {
      try { localStorage.setItem("sv_open", openSidebar ? "1" : "0"); } catch {}
    }
  }, [openSidebar, isMobile]);

  useEffect(() => {
    api.get("/profile/", { withCredentials: true })
      .then(res => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setUserLoaded(true));
  }, []);

  const loadMore = async () => {
    if (!nextUrl || loadingMore || loadingDocs) return;
    setLoadingMore(true);
    try {
      const url = new URL(nextUrl, window.location.origin);
      url.searchParams.delete('include_archive_warnings');
      url.searchParams.delete('session_id');
      
      const { data } = await api.get(url.href, { withCredentials: true });
      setDocs((prev) => [...prev, ...(data.results || [])]);
      setNextUrl(data.next || null);
    } catch (e) {
      console.error("Nepavyko įkelti daugiau dokumentų:", e);
    } finally {
      setLoadingMore(false);
    }
  };

  const programLabel =
    ACCOUNTING_PROGRAMS.find(
      (p) => p.value === user?.default_accounting_program
    )?.label || "...";

  const currentTutorial = useMemo(() => {
    const programKey = user?.default_accounting_program;
    if (!programKey) return null;
    return EXPORT_TUTORIALS[programKey] || null;
  }, [user?.default_accounting_program]);

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setSelectedCpKey("");
    setSelectedRows([]);
    setSelectionMode("none");
    setExcludedIds([]);
    setCpSearch("");
    try { localStorage.removeItem("sv_selected_key"); } catch {}

    startUpload(files, scanType);
  };

  const baseFiltered = useMemo(() => {
    if (!Array.isArray(docs)) return [];
    return docs.filter((d) => {
      if (d.status === "deleted" || d.is_deleted === true) return false;
      return true;
    });
  }, [docs]);

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
      (baseFiltered || []).map((d) => {
        let effective = "";
        if (user?.view_mode === "multi") {
          if (selectedCpKey) {
            const dir = resolveDirection(d, selectedCpKey);
            effective = dir || (d.pirkimas_pardavimas || "").toLowerCase() || "nezinoma";
          } else {
            effective = "";
          }
        } else {
          effective = (d.pirkimas_pardavimas || "").toLowerCase() || "nezinoma";
        }

        return {
          ...d,
          effective_direction: effective,
          onClickPreview: (doc) => {
            setSelected(doc);
            setDialogOpen(true);
          },
          iconForStatus,
          statusLabel,
          fmt,
        };
      }),
    [baseFiltered, user?.view_mode, selectedCpKey]
  );

  const isRowExportable = (row) => row.status === "completed" || row.status === "exported";

  const canExport = (d) => {
    if (!isRowExportable(d)) return false;
    if (user?.view_mode === "multi") return true;
    return !!d.pirkimas_pardavimas && d.pirkimas_pardavimas.toLowerCase() !== "nezinoma";
  };

  const exportableRows = tableData.filter(canExport);

  const selectedRowsForTable = useMemo(() => {
    if (selectionMode !== "filtered") return selectedRows;

    const ex = new Set((excludedIds || []).map(String));

    return exportableRows
      .map(r => String(r.id))
      .filter(id => !ex.has(id));
  }, [selectionMode, selectedRows, excludedIds, exportableRows]);

  const handleSelectRow = (id) => () => {
    const sid = String(id);

    if (selectionMode === "filtered") {
      setExcludedIds(prev =>
        prev.includes(sid) ? prev.filter(x => x !== sid) : [...prev, sid]
      );
      return;
    }

    setSelectionMode("ids");
    setExcludedIds([]);
    setSelectedRows((prev) =>
      prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]
    );
  };

  const handleSelectRowWithHint = (id) => () => {
    pingChooseCp();
    handleSelectRow(id)();
  };  

  const toggleSelectAllFiltered = () => {
    if (selectionMode === "filtered" && excludedIds.length === 0) {
      setSelectionMode("none");
      setExcludedIds([]);
      setSelectedRows([]);
      return;
    }

    if (selectionMode === "filtered" && excludedIds.length > 0) {
      setExcludedIds([]);
      return;
    }

    setSelectionMode("filtered");
    setExcludedIds([]);
    setSelectedRows([]);
  };

  const handleSelectAllWithHint = (ids) => {
    pingChooseCp();
    toggleSelectAllFiltered();
  };

  const handleFilter = (f) => (e) => setFilters((p) => ({ ...p, [f]: e.target.value }));

  const isCompanyReady =
    !!user?.company_name &&
    !!user?.company_code &&
    !!user?.company_country_iso &&
    !!user?.default_accounting_program;

  const handleExport = async () => {
    const mode = user?.view_mode === "multi" ? "multi" : "single";

    if (mode === "multi" && !selectedCpKey) {
      alert("Pasirinkite kontrahentą kairėje pusėje, kad nustatyti pirkimą/pardavimą eksportui.");
      return;
    }

    const excludedCount = excludedIds.length;
    const selectedExportableCount = selectedRows.filter(
      id => exportableRows.some(row => String(row.id) === String(id))
    ).length;

    const exportCountToShow =
      selectionMode === "filtered"
        ? Math.max(0, exportableTotal - excludedCount)
        : selectedExportableCount;

    if (exportCountToShow === 0) {
      alert("Pasirinkite bent vieną dokumentą eksportui!");
      return;
    }

    try {
      const payload =
        selectionMode === "filtered"
          ? {
              scope: "filtered",
              mode,
              export_type: user?.default_accounting_program,
              cp_key: selectedCpKey || "",
              excluded_ids: excludedIds,
              filters: {
                status: filters.status || "",
                from: filters.dateFrom || "",
                to: filters.dateTo || "",
                search: (filters.search || "").trim() || "",
              },
            }
          : {
              scope: "ids",
              mode,
              export_type: user?.default_accounting_program,
              cp_key: selectedCpKey || "",
              ids: selectedRows.map(Number).filter(Number.isFinite),
            };

      const res = await api.post("/documents/export_xml/", payload, {
        withCredentials: true,
        responseType: "blob",
      });

      let filename = "";
      const cd = res.headers?.["content-disposition"];
      if (cd) {
        const match = cd.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }
      if (!filename) filename = "eksportas.zip";

      const blob = new Blob([res.data], {
        type: res.headers?.["content-type"] || "application/octet-stream",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setSelectedRows([]);
      setSelectionMode("none");
      setExcludedIds([]);
      await fetchDocs();
    } catch (err) {
      console.error(err);
      alert("Eksportas nepavyko: " + (err?.message || "Klaida"));
    }
  };

  const toggleSidebar = () => setOpenSidebar(v => !v);

  const chooseCounterparty = (key) => () => {
    setSelectedRows([]);
    setSelectionMode("none");
    setExcludedIds([]);

    setSelectedCpKey(prev => {
      const next = (prev === key ? "" : key);
      setFilters(p => ({ ...p, search: "" }));
      return next;
    });
  };

  const clearCpSelection = () => {
    setSelectedCpKey("");
    setSelectedRows([]);
    setSelectionMode("none");
    setExcludedIds([]);
  };

  // Для мобильного Autocomplete
  const handleCpAutocompleteChange = (event, newValue) => {
    setSelectedRows([]);
    setSelectionMode("none");
    setExcludedIds([]);
    setFilters(p => ({ ...p, search: "" }));
    setSelectedCpKey(newValue?.key || "");
  };

  const selectedCpOption = useMemo(() => {
    if (!selectedCpKey) return null;
    return counterparties.find(c => c.key === selectedCpKey) || null;
  }, [selectedCpKey, counterparties]);

  const dataLoading = !userLoaded || (
    (filters.dateFrom && filters.dateTo) && (
      !initialDocsLoaded || 
      (user?.view_mode === "multi" && !initialCpLoaded)
    )
  );

  // Export button logic
  const exportButtonContent = useMemo(() => {
    const selectedExportableCount = selectedRows.filter(
      id => exportableRows.some(row => String(row.id) === String(id))
    ).length;

    const excludedCount = excludedIds.length;

    const exportCountToShow =
      selectionMode === "filtered"
        ? Math.max(0, exportableTotal - excludedCount)
        : selectedExportableCount;

    let disabledReason = "";
    if (!userLoaded) {
      disabledReason = "Kraunama...";
    } else if (!isCompanyReady) {
      disabledReason = "Pirmiausia užpildykite savo įmonės duomenis ir pasirinkite buhalterinę programą nustatymuose";
    } else if (user?.view_mode === "multi" && !selectedCpKey) {
      disabledReason = "Pasirinkite kontrahentą iš sąrašo, tada pažymėkite failus ir tik tada spauskite Eksportuoti";
    } else if (exportCountToShow === 0) {
      disabledReason = "Pažymėkite bent vieną dokumentą eksportui";
    }

    return { exportCountToShow, disabledReason, exportDisabled: Boolean(disabledReason) };
  }, [selectedRows, exportableRows, excludedIds, selectionMode, exportableTotal, userLoaded, isCompanyReady, user?.view_mode, selectedCpKey]);

  return (
    <Box sx={{ p: isMobile ? 2 : 4 }}>
      <Helmet>
        <title>Suvestinė - DokSkenas</title>
        <meta name="description" content="Įkelkite dokumentus skaitmenizavimui" />
      </Helmet>

      {/* Upload dialog */}
      <UploadProgressDialog
        open={isUploading}
        uploadProgress={uploadProgress}
        error={uploadError}
        onCancel={cancelUpload}
      />

      {/* Video tutorial modal */}
      <Modal
        open={tutorialOpen}
        onClose={() => setTutorialOpen(false)}
        aria-labelledby="tutorial-modal-title"
      >
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            bgcolor: '#1b1b1b',
            boxShadow: 24,
            p: 2,
            borderRadius: 2,
            maxWidth: '800px',
            width: '90%',
            outline: 'none',
          }}
        >
          {currentTutorial?.url && (
            <Box
              component="iframe"
              src={currentTutorial.url}
              title={`Kaip eksportuoti į ${currentTutorial.label}`}
              width="100%"
              height={isMobile ? "250px" : "450px"}
              sx={{ border: 'none' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          )}
        </Box>
      </Modal>

      {/* Onboarding video modal */}
      <Modal
        open={onboardingVideoOpen}
        onClose={() => setOnboardingVideoOpen(false)}
        aria-labelledby="onboarding-modal-title"
      >
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            bgcolor: '#1b1b1b',
            boxShadow: 24,
            p: 2,
            borderRadius: 2,
            maxWidth: '800px',
            width: '90%',
            outline: 'none',
          }}
        >
          <Box
            component="iframe"
            src={ONBOARDING_VIDEO_URL}
            title="Kaip pradėti darbą su DokSkenu"
            width="100%"
            height={isMobile ? "250px" : "450px"}
            sx={{ border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </Box>
      </Modal>

      {/* Header section */}
      <Box 
        sx={{ 
          display: "flex", 
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "center", 
          justifyContent: "space-between", 
          mb: 2, 
          gap: isMobile ? 2 : 0,
        }}
      >
        <Typography variant={isMobile ? "h6" : "h5"}>
          Sąskaitų faktūrų suvestinė
        </Typography>

        {/* Export button area */}
        {!isMobile && (
          <Box display="flex" flexDirection="column" alignItems="center" sx={{ minHeight: 70 }}>
            <Tooltip
              title={exportButtonContent.exportDisabled ? exportButtonContent.disabledReason : ""}
              placement="bottom"
              disableHoverListener={!exportButtonContent.exportDisabled}
            >
              <span style={{ display: "inline-flex" }}>
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={handleExport}
                  disabled={exportButtonContent.exportDisabled}
                >
                  Eksportuoti{exportButtonContent.exportCountToShow ? ` (${exportButtonContent.exportCountToShow})` : ""} į {programLabel}
                </Button>
              </span>
            </Tooltip>

            <Box
              onClick={currentTutorial ? () => setTutorialOpen(true) : undefined}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 0.5,
                mt: 1.5,
                cursor: currentTutorial ? "pointer" : "default",
                color: "#1b1b1b",
                maxWidth: "100%",
                textAlign: "center",
                visibility: currentTutorial ? "visible" : "hidden",
                "&:hover": currentTutorial ? { color: "#555" } : {},
              }}
            >
              <PlayCircleIcon sx={{ fontSize: "1rem", flexShrink: 0 }} />
              <Typography
                variant="body2"
                sx={{
                  fontSize: "0.8rem",
                  lineHeight: 1.2,
                  wordBreak: "break-word",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                {currentTutorial ? `Kaip eksportuoti į ${currentTutorial.label}?` : "Kaip eksportuoti?"}
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      {/* Alerts */}
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

      {userLoaded && !isCompanyReady && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
              <Typography variant="body2">
                Prieš įkeliant failus apdorojimui, įveskite savo įmonės duomenis ir pasirinkite buhalterinę programą eksportui.
              </Typography>
              <Button
                variant="contained"
                size="small"
                onClick={() => window.location = "/nustatymai"}
              >
                Pasirinkti
              </Button>
            </Box>
            <Box
              onClick={() => setOnboardingVideoOpen(true)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                cursor: "pointer",
                color: "#1b1b1b",
                "&:hover": { color: "#555" },
              }}
            >
              <PlayCircleIcon sx={{ fontSize: "1.1rem", color: "error.main" }} />
              <Typography
                variant="body2"
                sx={{
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                Žiūrėti video kaip pradėti darbą
              </Typography>
            </Box>
          </Box>
        </Alert>
      )}

      {/* Upload controls - Mobile: stacked, Desktop: inline */}
      {isMobile ? (
        <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {/* Scan type - full width */}
          <TextField
            select
            size="small"
            label="Skaitmenizavimo tipas"
            value={scanType}
            onChange={e => setScanType(e.target.value)}
            fullWidth
          >
            {SCAN_TYPES.map((type) => (
              <MenuItem key={type.value} value={type.value}>
                {type.label}
              </MenuItem>
            ))}
          </TextField>

          {/* Upload button - full width */}
          <Button
            variant="contained"
            component="label"
            startIcon={<CloudUpload />}
            disabled={isUploading || !userLoaded || !isCompanyReady}
            fullWidth
            sx={{ py: 1.5 }}
          >
            Įkelti failus
            <input type="file" hidden multiple onChange={handleFileChange} />
          </Button>
          
          {/* Export button with program name */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
            <Tooltip
              title={exportButtonContent.exportDisabled ? exportButtonContent.disabledReason : ""}
              disableHoverListener={!exportButtonContent.exportDisabled}
            >
              <span style={{ display: "inline-flex", width: '100%' }}>
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={handleExport}
                  disabled={exportButtonContent.exportDisabled}
                  fullWidth
                  sx={{ py: 1.25 }}
                >
                  Eksportuoti{exportButtonContent.exportCountToShow ? ` (${exportButtonContent.exportCountToShow})` : ""} į {programLabel}
                </Button>
              </span>
            </Tooltip>

            {/* Video tutorial link */}
            {currentTutorial && (
              <Box
                onClick={() => setTutorialOpen(true)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.5,
                  mt: 0.5,
                  cursor: "pointer",
                  color: "#1b1b1b",
                  "&:hover": { color: "#555" },
                }}
              >
                <PlayCircleIcon sx={{ fontSize: "1rem", flexShrink: 0 }} />
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: "0.8rem",
                    lineHeight: 1.2,
                    "&:hover": { textDecoration: "underline" },
                  }}
                >
                  Kaip eksportuoti į {currentTutorial.label}?
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      ) : (
        <Box mb={2} display="flex" alignItems="center" gap={2}>
          <TextField
            select
            size="small"
            label="Skaitmenizavimo tipas"
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
            disabled={isUploading || !userLoaded || !isCompanyReady}
          >
            Įkelti failus
            <input type="file" hidden multiple onChange={handleFileChange} />
          </Button>
        </Box>
      )}

      <ProcessingStatusBar
        onSessionComplete={async (sessionId) => {
          try {
            const cpParam =
              user?.view_mode === "multi" && selectedCpKey
                ? selectedCpKey
                : undefined;

            const params = {
              status: filters.status || undefined,
              from: filters.dateFrom || undefined,
              to: filters.dateTo || undefined,
              search: (filters.search || "").trim() || undefined,
              cp: cpParam,
              include_archive_warnings: "true",
              session_id: sessionId,
            };

            const { data } = await api.get("/documents/", { withCredentials: true, params });
            setDocs(data.results || []);
            setNextUrl(data.next || null);
            setExportableTotal(Number(data.exportable_total || 0));
            
            if (data.archive_warnings?.length > 0) {
              setArchiveWarnings(data.archive_warnings);
            }
          } catch (e) {
            console.error("Nepavyko gauti dokumentų:", e);
          }
          
          if (user?.view_mode === "multi") {
            await fetchCounterparties(cpSearch);
          }
        }}
      />

      {/* Skipped files alert */}
      {(skippedFiles.length > 0 || archiveWarnings.length > 0) && (
        <Alert 
          severity="warning" 
          sx={{ mb: 2 }}
          onClose={() => {
            clearSkipped();
            setArchiveWarnings([]);
          }}
        >
          <Typography variant="body2" fontWeight={600} gutterBottom>
            Kai kurie failai buvo praleisti:
          </Typography>
          
          {skippedFiles.map((f, idx) => (
            <Typography key={`skip-${idx}`} variant="body2" sx={{ ml: 1 }}>
              • {f.name} — {f.reason}
            </Typography>
          ))}
          
          {archiveWarnings.map((arch, idx) => (
            <Typography key={`arch-${idx}`} variant="body2" sx={{ ml: 1 }}>
              • <strong>{arch.original_filename}</strong>: {arch.error_message}
            </Typography>
          ))}
        </Alert>
      )}

      {/* Filters */}
      <DocumentsFilters filters={filters} onFilterChange={handleFilter} />

      {/* Counterparty selector for mobile (if multi mode) */}
      {isMobile && user?.view_mode === "multi" && (
        <Box sx={{ mb: 2 }}>
          <Autocomplete
            value={selectedCpOption}
            onChange={handleCpAutocompleteChange}
            options={counterparties}
            getOptionLabel={(option) => option?.name || "(Be pavadinimo)"}
            loading={cpLoading}
            noOptionsText="Kontrahentų nerasta"
            loadingText="Kraunama..."
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                label="Kontrahentai"
                placeholder="Pasirinkite kontrahentą"
                InputProps={{
                  ...params.InputProps,
                  startAdornment: (
                    <>
                      <InputAdornment position="start">
                        <PersonIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                      </InputAdornment>
                      {params.InputProps.startAdornment}
                    </>
                  ),
                }}
              />
            )}
            renderOption={(props, option) => (
              <li {...props} key={option.key}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <Typography variant="body2">{option.name || "(Be pavadinimo)"}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {option.docs_count} dok.
                  </Typography>
                </Box>
              </li>
            )}
            clearOnEscape
            sx={{
              '& .MuiAutocomplete-clearIndicator': {
                visibility: selectedCpKey ? 'visible' : 'hidden',
              },
            }}
          />
          {selectedCpKey && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Iš viso: {counterparties.length} įmonių
              </Typography>
              <Button size="small" startIcon={<ClearAllIcon />} onClick={clearCpSelection}>
                Išvalyti
              </Button>
            </Box>
          )}
        </Box>
      )}

      {/* Main content grid */}
      {isMobile ? (
        // Mobile: single column
        <Box sx={{ minHeight: '400px' }}>
          {dataLoading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 2 }} />
              ))}
            </Box>
          ) : (
            <DocumentsTable
              filtered={tableData}
              selectedRows={selectedRowsForTable}
              selectAllIndeterminate={selectionMode === "filtered" && excludedIds.length > 0}
              selectAllChecked={selectionMode === "filtered" && excludedIds.length === 0 && exportableTotal > 0}
              isRowExportable={isRowExportable}
              handleSelectRow={handleSelectRowWithHint}
              handleSelectAll={handleSelectAllWithHint}
              loading={loadingDocs}
              loadingMore={loadingMore}
              hasMore={Boolean(nextUrl)}
              loadMore={loadMore}
              onSearchChange={(q) => {
                const qq = (q || "").trim();
                if (qq) setSelectedCpKey("");
                setSelectedRows([]);
                setSelectionMode("none");
                setExcludedIds([]);
                setFilters((p) => ({ ...p, search: q }));
              }}
              allowUnknownDirection={user?.view_mode === "multi"}
              reloadDocuments={fetchDocs}
              onDeleteDoc={(id) => setDocs(prev => prev.filter(d => d.id !== id))}
            />
          )}
        </Box>
      ) : (
        // Desktop: two-column grid with sidebar
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: openSidebar ? "300px 1fr" : "44px 1fr",
            gap: 2,
            mt: 2,
            minHeight: MIN_CONTENT_HEIGHT,
          }}
        >
          {/* LEFT: counterparties sidebar */}
          <Box
            sx={{
              borderRight: openSidebar ? "1px solid #eee" : "none",
              overflow: "hidden",
              transition: "all .2s ease",
              minHeight: MIN_CONTENT_HEIGHT,
            }}
          >
            {dataLoading ? (
              openSidebar ? (
                <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <Skeleton variant="text" width="60%" sx={{ mb: 1, height: 28 }} />
                  <Skeleton variant="rectangular" height={40} sx={{ mb: 2, borderRadius: 1 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Skeleton variant="text" width="40%" height={20} />
                    <Skeleton variant="text" width="30%" height={20} />
                  </Box>
                  <Box sx={{ borderTop: '1px solid #eee', pt: 1 }}>
                    {[...Array(18)].map((_, i) => (
                      <Skeleton
                        key={i}
                        variant="rectangular"
                        height={48}
                        sx={{ mb: 0.5, borderRadius: 0.5 }}
                      />
                    ))}
                  </Box>
                </Box>
              ) : (
                <Box sx={{ height: "100%", display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
                  <Skeleton variant="circular" width={40} height={40} sx={{ m: 1 }} />
                </Box>
              )
            ) : (
              <>
                {openSidebar ? (
                  <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1, py: 1 }}>
                      <Typography variant="subtitle2" sx={{ opacity: 0.7 }}>Kontrahentai</Typography>
                      <IconButton size="small" onClick={() => setOpenSidebar(false)} aria-label="collapse">
                        <MenuOpenIcon />
                      </IconButton>
                    </Box>

                    <Box sx={{ px: 2, pb: 1 }}>
                      <TextField
                        size="small"
                        fullWidth
                        placeholder="Paieška"
                        value={cpSearch}
                        onChange={(e) => setCpSearch(e.target.value)}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <SearchIcon fontSize="small" />
                            </InputAdornment>
                          ),
                        }}
                      />
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 1 }}>
                        <Typography variant="caption" sx={{ opacity: 0.7 }}>
                          Iš viso: {counterparties.length}
                        </Typography>
                        <Button size="small" startIcon={<ClearAllIcon />} onClick={clearCpSelection}>
                          Išvalyti
                        </Button>
                      </Box>
                    </Box>
                    <Divider />

                    <Box sx={{ overflow: "auto", flex: 1 }}>
                      <List dense disablePadding>
                        {counterparties.map((c) => {
                          const active = selectedCpKey === c.key;
                          return (
                            <ListItemButton
                              key={c.key}
                              dense
                              onClick={chooseCounterparty(c.key)}
                              selected={active}
                              sx={active ? { bgcolor: "action.selected", "& .MuiListItemText-primary": { fontWeight: 700 } } : {}}
                            >
                              <ListItemText
                                primary={<span>{c.name || "(Be pavadinimo)"}</span>}
                                secondary={c.docs_count ? `${c.docs_count} dok.` : null}
                              />
                            </ListItemButton>
                          );
                        })}
                      </List>
                    </Box>
                  </Box>
                ) : (
                  <Box sx={{ height: "100%", display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
                    <IconButton onClick={() => setOpenSidebar(true)} sx={{ m: 1 }} aria-label="expand">
                      <MenuIcon />
                    </IconButton>
                  </Box>
                )}
              </>
            )}
          </Box>

          {/* RIGHT: table */}
          <Box sx={{ overflow: "visible", minHeight: MIN_CONTENT_HEIGHT }}>
            {dataLoading ? (
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox"><Skeleton variant="circular" width={20} height={20} /></TableCell>
                      <TableCell><Skeleton variant="text" width={80} /></TableCell>
                      <TableCell><Skeleton variant="text" width={120} /></TableCell>
                      <TableCell><Skeleton variant="text" width={100} /></TableCell>
                      <TableCell><Skeleton variant="text" width={80} /></TableCell>
                      <TableCell><Skeleton variant="text" width={60} /></TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[...Array(18)].map((_, i) => (
                      <TableRow key={i}>
                        <TableCell padding="checkbox"><Skeleton variant="circular" width={20} height={20} /></TableCell>
                        <TableCell><Skeleton variant="text" /></TableCell>
                        <TableCell><Skeleton variant="text" /></TableCell>
                        <TableCell><Skeleton variant="text" /></TableCell>
                        <TableCell><Skeleton variant="text" /></TableCell>
                        <TableCell><Skeleton variant="text" /></TableCell>
                        <TableCell><Skeleton variant="circular" width={24} height={24} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <DocumentsTable
                filtered={tableData}
                selectedRows={selectedRowsForTable}
                selectAllIndeterminate={selectionMode === "filtered" && excludedIds.length > 0}
                selectAllChecked={selectionMode === "filtered" && excludedIds.length === 0 && exportableTotal > 0}
                isRowExportable={isRowExportable}
                handleSelectRow={handleSelectRowWithHint}
                handleSelectAll={handleSelectAllWithHint}
                loading={loadingDocs}
                loadingMore={loadingMore}
                hasMore={Boolean(nextUrl)}
                loadMore={loadMore}
                onSearchChange={(q) => {
                  const qq = (q || "").trim();
                  if (qq) setSelectedCpKey("");
                  setSelectedRows([]);
                  setSelectionMode("none");
                  setExcludedIds([]);
                  setFilters((p) => ({ ...p, search: q }));
                }}
                allowUnknownDirection={user?.view_mode === "multi"}
                reloadDocuments={fetchDocs}
                onDeleteDoc={(id) => setDocs(prev => prev.filter(d => d.id !== id))}
              />
            )}
          </Box>
        </Box>
      )}

      <Snackbar
        open={cpToastOpen}
        autoHideDuration={2500}
        onClose={() => setCpToastOpen(false)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        sx={{ top: { xs: 70, sm: 80 } }}
      >
        <Alert
          severity="warning"
          onClose={() => setCpToastOpen(false)}
          sx={{ 
            width: "100%",
            backgroundColor: "#2a88faff",
            color: "#fff",
            "& .MuiAlert-icon": { color: "#fff" },
            "& .MuiAlert-action .MuiIconButton-root": { color: "#fff" },
          }}
        >
          Pasirinkite kontrahentą iš sąrašo
        </Alert>
      </Snackbar>

      <PreviewDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        selected={selected}
        setSelected={setSelected}
        setDocs={setDocs}
        user={user}
        selectedCpKey={selectedCpKey}
        showRawPanels={false}
      />
    </Box>
  );
}





// import { useEffect, useMemo, useState } from "react";
// import { Helmet } from 'react-helmet';
// import {
//   Box, Button, Typography, Alert, TextField, MenuItem, Dialog, DialogTitle, DialogContent, LinearProgress,
//   List, ListItemButton, ListItemText, IconButton, Divider, InputAdornment, Tooltip, Modal, Snackbar, Skeleton, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow
// } from "@mui/material";
// import {
//   CloudUpload, HourglassEmpty, Cancel, CheckCircleOutline,
// } from "@mui/icons-material";
// import MenuOpenIcon from "@mui/icons-material/MenuOpen";
// import MenuIcon from "@mui/icons-material/Menu";
// import SearchIcon from "@mui/icons-material/Search";
// import ClearAllIcon from "@mui/icons-material/ClearAll";
// import PlayCircleIcon from "@mui/icons-material/PlayCircle";

// import { api } from "../api/endpoints";
// import DocumentsTable from "../page_elements/DocumentsTable";
// import PreviewDialog from "../page_elements/PreviewDialog";
// import DocumentsFilters from "../components/DocumentsFilters";
// import { ACCOUNTING_PROGRAMS } from "../page_elements/AccountingPrograms";

// import { useUploadSession } from "../components/useUploadSession";
// import UploadProgressDialog from "../components/UploadProgressDialog";
// import ProcessingStatusBar from "../components/ProcessingStatusBar";

// const SCAN_TYPES = [
//   { value: "sumiskai", label: "Sumiškai (be eilučių) – 1 kreditas" },
//   { value: "detaliai", label: "Detaliai (su eilutėmis) – 1.3 kredito" },
// ];

// // YouTube video tutorials for each accounting program
// const EXPORT_TUTORIALS = {
//   rivile: {
//     label: "Rivilę Gamą",
//     url: "https://www.youtube.com/embed/7uwLLA3uTQ0",
//   },
//   rivile_erp: {
//     label: "Rivilę ERP",
//     url: "https://www.youtube.com/embed/2ENROTqWfYw",
//   },
//   finvalda: {
//     label: "Finvaldą",
//     url: "https://www.youtube.com/embed/n1OGeQ9quEk",
//   },
//   apskaita5: {
//     label: "Apskaita5",
//     url: "https://www.youtube.com/embed/_HeD_TKUsl0",
//   },
//   // Add more programs as needed
// };

// // Onboarding video URL
// const ONBOARDING_VIDEO_URL = "https://www.youtube.com/embed/ByViuilYxZA";

// // Минимальная высота контента для предотвращения layout shift
// const MIN_CONTENT_HEIGHT = '700px';

// // стабильный ключ контрагента
// const companyKey = (name, vat, id) => {
//   if (id != null && id !== "") return `id:${String(id)}`;
//   const normVat  = (vat  || "").trim().toLowerCase();
//   const normName = (name || "").trim().toLowerCase();
//   return normVat || normName;
// };

// function resolveDirection(doc, selectedCpKey) {
//   const mkKey = (id, vat, name) => {
//     const idStr = id == null ? "" : String(id).trim();
//     if (idStr) return `id:${idStr}`;
//     const normVat  = (vat  || "").trim().toLowerCase();
//     const normName = (name || "").trim().toLowerCase();
//     return normVat || normName;
//   };

//   const sKey = mkKey(doc.seller_id, doc.seller_vat_code, doc.seller_name);
//   const bKey = mkKey(doc.buyer_id,  doc.buyer_vat_code,  doc.buyer_name);

//   if (selectedCpKey === sKey) return "pardavimas";
//   if (selectedCpKey === bKey) return "pirkimas";
//   return null;
// }

// export default function UploadPage() {
//   const [docs, setDocs] = useState([]);
//   const [nextUrl, setNextUrl] = useState(null);
//   const [loadingDocs, setLoadingDocs] = useState(false);
//   const [loadingMore, setLoadingMore] = useState(false);

//   const [filters, setFilters] = useState(() => {
//     const now = new Date();
//     const thirtyDaysAgo = new Date(now);
//     thirtyDaysAgo.setDate(now.getDate() - 30);
    
//     return {
//       status: "",
//       dateFrom: thirtyDaysAgo.toISOString().split('T')[0],
//       dateTo: now.toISOString().split('T')[0],
//       search: "",
//     };
//   });
//   const [dialogOpen, setDialogOpen] = useState(false);
//   const [selected, setSelected] = useState(null);
//   const [creditError, setCreditError] = useState(null);
//   const [selectedRows, setSelectedRows] = useState([]);

//   const [selectionMode, setSelectionMode] = useState("none");
//   const [excludedIds, setExcludedIds] = useState([]); // исключения из "filtered"
//   const [exportableTotal, setExportableTotal] = useState(0); // пришло с backend

//   const [user, setUser] = useState(null);
//   const [userLoaded, setUserLoaded] = useState(false);
//   const [scanType, setScanType] = useState("sumiskai");

//   const [counterparties, setCounterparties] = useState([]);
//   const [cpLoading, setCpLoading] = useState(false);

//   const [initialDocsLoaded, setInitialDocsLoaded] = useState(false);
//   const [initialCpLoaded, setInitialCpLoaded] = useState(false);

//   const [cpToastOpen, setCpToastOpen] = useState(false);

//   const pingChooseCp = () => {
//     if (user?.view_mode === "multi" && !selectedCpKey) {
//       setCpToastOpen(true);
//     }
//   };

//   // video tutorial modal (for export)
//   const [tutorialOpen, setTutorialOpen] = useState(false);

//   // onboarding video modal (for new users)
//   const [onboardingVideoOpen, setOnboardingVideoOpen] = useState(false);

//   // sidebar (multi)
//   const [openSidebar, setOpenSidebar] = useState(() => {
//     try { return localStorage.getItem("sv_open") !== "0"; } catch { return true; }
//   });
//   const [cpSearch, setCpSearch] = useState("");
//   // одиночный выбор контрагента
//   const [selectedCpKey, setSelectedCpKey] = useState("");

//   const [archiveWarnings, setArchiveWarnings] = useState([]);

//   const {
//     isUploading,
//     uploadProgress,
//     error: uploadError,
//     skippedFiles,
//     clearSkipped,
//     startUpload,
//     cancelUpload,
//   } = useUploadSession({
//     onUploadComplete: (finalized) => {
//       // НЕ обновляем таблицу здесь — пусть ProcessingStatusBar обновит когда сессия завершится
//       console.log("Upload complete, processing started:", finalized.stage);
//     },
//     onError: (msg) => {
//       if (msg?.toLowerCase().includes("kredit")) {
//         setCreditError(msg);
//       }
//     },
//   });

//   const fetchDocs = async () => {
//     setLoadingDocs(true);
//     try {
//       const cpParam =
//         user?.view_mode === "multi" && selectedCpKey
//           ? selectedCpKey
//           : undefined;

//       const params = {
//         status: filters.status || undefined,
//         from: filters.dateFrom || undefined,
//         to: filters.dateTo || undefined,
//         search: (filters.search || "").trim() || undefined,
//         cp: cpParam,
//       };

//       const { data } = await api.get("/documents/", { withCredentials: true, params });
//       setDocs(data.results || []);
//       setNextUrl(data.next || null);
//       setExportableTotal(Number(data.exportable_total || 0));
//     } catch (e) {
//       console.error("Nepavyko gauti dokumentų:", e);
//     } finally {
//       setLoadingDocs(false);
//       setInitialDocsLoaded(true);
//     }
//   };

//   const fetchCounterparties = async (qText = "") => {
//     setCpLoading(true);
//     try {
//       const params = {
//         status: filters.status || undefined,
//         from: filters.dateFrom || undefined,
//         to: filters.dateTo || undefined,
//         q: qText.trim() || undefined,
//         limit: 200,
//       };
//       const { data } = await api.get("/documents/counterparties/", { withCredentials: true, params });
//       setCounterparties(data.results || []);
//     } catch (e) {
//       console.error("Nepavyko gauti kontrahentų:", e);
//     } finally {
//       setCpLoading(false);
//       setInitialCpLoaded(true);
//     }
//   };  

//   useEffect(() => {
//     if (!filters.dateFrom || !filters.dateTo) return;
//     setSelectedRows([]);
//     setSelectionMode("none");
//     setExcludedIds([]);
//     fetchDocs();
//     // eslint-disable-next-line
//   }, [filters.status, filters.dateFrom, filters.dateTo, filters.search, selectedCpKey]);

//   useEffect(() => {
//     if (!filters.dateFrom || !filters.dateTo) return;
//     const t = setTimeout(() => {
//       fetchCounterparties(cpSearch);
//     }, 300);
//     return () => clearTimeout(t);
//     // eslint-disable-next-line
//   }, [cpSearch, filters.status, filters.dateFrom, filters.dateTo]);

//   // сбрасываем выбор при первом рендере страницы
//   useEffect(() => {
//     setSelectedCpKey("");
//     setSelectedRows([]);
//     try { localStorage.removeItem("sv_selected_key"); } catch {}
//   }, []);

//   // если вдруг меняется view_mode — тоже сбросим
//   useEffect(() => {
//     if (user?.view_mode) {
//       setSelectedCpKey("");
//       setSelectedRows([]);
//       try { localStorage.removeItem("sv_selected_key"); } catch {}
//     }
//   }, [user?.view_mode]);


//   // persist ui
//   useEffect(() => {
//     try { localStorage.setItem("sv_open", openSidebar ? "1" : "0"); } catch {}
//   }, [openSidebar]);

//   // load user
//   useEffect(() => {
//     api.get("/profile/", { withCredentials: true })
//       .then(res => setUser(res.data))
//       .catch(() => setUser(null))
//       .finally(() => setUserLoaded(true));
//   }, []);

//   const loadMore = async () => {
//     if (!nextUrl || loadingMore || loadingDocs) return;
//     setLoadingMore(true);
//     try {
//       // Убираем include_archive_warnings и session_id из URL
//       const url = new URL(nextUrl, window.location.origin);
//       url.searchParams.delete('include_archive_warnings');
//       url.searchParams.delete('session_id');
      
//       // Используем полный URL напрямую
//       const { data } = await api.get(url.href, { withCredentials: true });
//       setDocs((prev) => [...prev, ...(data.results || [])]);
//       setNextUrl(data.next || null);
//     } catch (e) {
//       console.error("Nepavyko įkelti daugiau dokumentų:", e);
//     } finally {
//       setLoadingMore(false);
//     }
//   };

//   const programLabel =
//     ACCOUNTING_PROGRAMS.find(
//       (p) => p.value === user?.default_accounting_program
//     )?.label || "...";

//   // Get tutorial info for current program
//   const currentTutorial = useMemo(() => {
//     const programKey = user?.default_accounting_program;
//     if (!programKey) return null;
//     return EXPORT_TUTORIALS[programKey] || null;
//   }, [user?.default_accounting_program]);

//   // upload
//   const handleFileChange = async (e) => {
//     const files = Array.from(e.target.files || []);
//     if (!files.length) return;

//     // Сбросить выбор
//     setSelectedCpKey("");
//     setSelectedRows([]);
//     setSelectionMode("none");
//     setExcludedIds([]);
//     setCpSearch("");
//     try { localStorage.removeItem("sv_selected_key"); } catch {}

//     // Запустить загрузку через новую систему
//     startUpload(files, scanType);
//   };

//   const baseFiltered = useMemo(() => {
//     if (!Array.isArray(docs)) return [];
//     return docs.filter((d) => {
//       if (d.status === "deleted" || d.is_deleted === true) return false;
//       return true;
//     });
//   }, [docs]);

//   // table data decorate + "визуальное" направление
//   const statusLabel = (d) =>
//     d.status === "completed"
//       ? d.exported
//         ? "Atliktas (Eksportuotas)"
//         : "Atliktas (Neeksportuotas)"
//       : ({"processing": "Vykdomas", "rejected": "Atmestas", "pending": "Vykdomas"}[d.status] || "—");

//   const iconForStatus = (st) =>
//     st === "processing" || st === "pending" ? (
//       <HourglassEmpty color="warning" />
//     ) : st === "rejected" ? (
//       <Cancel color="error" />
//     ) : (
//       <CheckCircleOutline color="success" />
//     );

//   const fmt = (iso) =>
//     iso
//       ? new Date(iso).toLocaleDateString("lt-LT", {
//           year: "numeric",
//           month: "2-digit",
//           day: "2-digit",
//           hour: "2-digit",
//           minute: "2-digit",
//         })
//       : "—";

//   const tableData = useMemo(
//     () =>
//       (baseFiltered || []).map((d) => {
//         // multi: пусто в колонке Pirkimas/Pardavimas, пока контрагент не выбран
//         let effective = "";
//         if (user?.view_mode === "multi") {
//           if (selectedCpKey) {
//             const dir = resolveDirection(d, selectedCpKey);
//             effective = dir || (d.pirkimas_pardavimas || "").toLowerCase() || "nezinoma";
//           } else {
//             effective = "";
//           }
//         } else {
//           effective = (d.pirkimas_pardavimas || "").toLowerCase() || "nezinoma";
//         }

//         return {
//           ...d,
//           effective_direction: effective,
//           onClickPreview: (doc) => {
//             setSelected(doc);
//             setDialogOpen(true);
//           },
//           iconForStatus,
//           statusLabel,
//           fmt,
//         };
//       }),
//     [baseFiltered, user?.view_mode, selectedCpKey]
//   );

//   // export logic
//   const isRowExportable = (row) => row.status === "completed" || row.status === "exported";

//   const canExport = (d) => {
//     if (!isRowExportable(d)) return false;
//     if (user?.view_mode === "multi") return true;
//     return !!d.pirkimas_pardavimas && d.pirkimas_pardavimas.toLowerCase() !== "nezinoma";
//   };

//   const exportableRows = tableData.filter(canExport);

//   const selectedRowsForTable = useMemo(() => {
//     if (selectionMode !== "filtered") return selectedRows;

//     const ex = new Set((excludedIds || []).map(String));

//     // показываем "выбрано всё экспортируемое на текущей странице, кроме excluded"
//     return exportableRows
//       .map(r => String(r.id))
//       .filter(id => !ex.has(id));
//   }, [selectionMode, selectedRows, excludedIds, exportableRows]);

//   const handleSelectRow = (id) => () => {
//     const sid = String(id);

//     // если мы были в "select all filtered" — то клики по строкам становятся исключениями
//     if (selectionMode === "filtered") {
//       setExcludedIds(prev =>
//         prev.includes(sid) ? prev.filter(x => x !== sid) : [...prev, sid]
//       );
//       return;
//     }

//     // обычный ручной режим
//     setSelectionMode("ids");
//     setExcludedIds([]);
//     setSelectedRows((prev) =>
//       prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]
//     );
//   };

//   const handleSelectRowWithHint = (id) => () => {
//     pingChooseCp();
//     handleSelectRow(id)();
//   };  

//   const toggleSelectAllFiltered = () => {
//     // если сейчас filtered и нет исключений => снять всё
//     if (selectionMode === "filtered" && excludedIds.length === 0) {
//       setSelectionMode("none");
//       setExcludedIds([]);
//       setSelectedRows([]);
//       return;
//     }

//     // если сейчас filtered и есть исключения => вернуть полный filtered (очистить исключения)
//     if (selectionMode === "filtered" && excludedIds.length > 0) {
//       setExcludedIds([]);
//       return;
//     }

//     // иначе включаем select-all-filtered
//     setSelectionMode("filtered");
//     setExcludedIds([]);
//     setSelectedRows([]); // ids не нужны
//   };

//   const handleSelectAllWithHint = (ids) => {
//     pingChooseCp();
//     // ids тут не используем — логика "верхнего" чекбокса управляет режимом filtered
//     toggleSelectAllFiltered();
//   };

//   const handleFilter = (f) => (e) => setFilters((p) => ({ ...p, [f]: e.target.value }));

//   const isCompanyReady =
//     !!user?.company_name &&
//     !!user?.company_code &&
//     !!user?.company_country_iso &&
//     !!user?.default_accounting_program;

//   const handleExport = async () => {
//     const mode = user?.view_mode === "multi" ? "multi" : "single";

//     if (mode === "multi" && !selectedCpKey) {
//       alert("Pasirinkite kontrahentą kairėje pusėje, kad nustatyti pirkimą/pardavimą eksportui.");
//       return;
//     }

//     const excludedCount = excludedIds.length;
//     const selectedExportableCount = selectedRows.filter(
//       id => exportableRows.some(row => String(row.id) === String(id))
//     ).length;

//     const exportCountToShow =
//       selectionMode === "filtered"
//         ? Math.max(0, exportableTotal - excludedCount)
//         : selectedExportableCount;

//     if (exportCountToShow === 0) {
//       alert("Pasirinkite bent vieną dokumentą eksportui!");
//       return;
//     }

//     try {
//       const payload =
//         selectionMode === "filtered"
//           ? {
//               scope: "filtered",
//               mode,
//               export_type: user?.default_accounting_program,
//               cp_key: selectedCpKey || "",
//               excluded_ids: excludedIds,
//               filters: {
//                 status: filters.status || "",
//                 from: filters.dateFrom || "",
//                 to: filters.dateTo || "",
//                 search: (filters.search || "").trim() || "",
//               },
//             }
//           : {
//               scope: "ids",
//               mode,
//               export_type: user?.default_accounting_program,
//               cp_key: selectedCpKey || "",
//               ids: selectedRows.map(Number).filter(Number.isFinite),
//             };

//       const res = await api.post("/documents/export_xml/", payload, {
//         withCredentials: true,
//         responseType: "blob",
//       });

//       // filename из заголовка
//       let filename = "";
//       const cd = res.headers?.["content-disposition"];
//       if (cd) {
//         const match = cd.match(/filename="?([^"]+)"?/);
//         if (match) filename = match[1];
//       }
//       if (!filename) filename = "eksportas.zip";

//       // скачать
//       const blob = new Blob([res.data], {
//         type: res.headers?.["content-type"] || "application/octet-stream",
//       });
//       const url = window.URL.createObjectURL(blob);
//       const link = document.createElement("a");
//       link.href = url;
//       link.setAttribute("download", filename);
//       document.body.appendChild(link);
//       link.click();
//       link.remove();
//       window.URL.revokeObjectURL(url);

//       // сброс выбора + обновить список
//       setSelectedRows([]);
//       setSelectionMode("none");
//       setExcludedIds([]);
//       await fetchDocs();
//     } catch (err) {
//       console.error(err);
//       alert("Eksportas nepavyko: " + (err?.message || "Klaida"));
//     }
//   };

//   // helpers
//   const toggleSidebar = () => setOpenSidebar(v => !v);

//   const chooseCounterparty = (key) => () => {
//     setSelectedRows([]);
//     setSelectionMode("none");
//     setExcludedIds([]);

//     setSelectedCpKey(prev => {
//       const next = (prev === key ? "" : key);

//       // поиск по документам должен сбрасывать контрагента, а тут наоборот:
//       // при выборе контрагента сбрасываем doc-search
//       setFilters(p => ({ ...p, search: "" }));

//       return next;
//     });
//   };

//   const clearCpSelection = () => {
//     setSelectedCpKey("");
//     setSelectedRows([]);
//     setSelectionMode("none");
//     setExcludedIds([]);
//   };

//   // Skeleton только для данных (sidebar + table), не для header
//   const dataLoading = !userLoaded || (
//     (filters.dateFrom && filters.dateTo) && (
//       !initialDocsLoaded || 
//       (user?.view_mode === "multi" && !initialCpLoaded)
//     )
//   );

//   return (
//     <Box style={{ padding: 32 }}>
//       <Helmet>
//         <title>Suvestinė - DokSkenas</title>
//         <meta name="description" content="Įkelkite dokumentus skaitmenizavimui" />
//       </Helmet>

//       {/* Upload dialog — только во время загрузки */}
//       <UploadProgressDialog
//         open={isUploading}
//         uploadProgress={uploadProgress}
//         error={uploadError}
//         onCancel={cancelUpload}
//       />

//       {/* Video tutorial modal - for export tutorials */}
//       <Modal
//         open={tutorialOpen}
//         onClose={() => setTutorialOpen(false)}
//         aria-labelledby="tutorial-modal-title"
//       >
//         <Box
//           sx={{
//             position: 'absolute',
//             top: '50%',
//             left: '50%',
//             transform: 'translate(-50%, -50%)',
//             bgcolor: '#1b1b1b',
//             boxShadow: 24,
//             p: 2,
//             borderRadius: 2,
//             maxWidth: '800px',
//             width: '90%',
//             outline: 'none',
//           }}
//         >
//           {currentTutorial?.url && (
//             <Box
//               component="iframe"
//               src={currentTutorial.url}
//               title={`Kaip eksportuoti į ${currentTutorial.label}`}
//               width="100%"
//               height="450px"
//               sx={{ border: 'none' }}
//               allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
//               allowFullScreen
//             />
//           )}
//         </Box>
//       </Modal>

//       {/* Onboarding video modal - for new users */}
//       <Modal
//         open={onboardingVideoOpen}
//         onClose={() => setOnboardingVideoOpen(false)}
//         aria-labelledby="onboarding-modal-title"
//       >
//         <Box
//           sx={{
//             position: 'absolute',
//             top: '50%',
//             left: '50%',
//             transform: 'translate(-50%, -50%)',
//             bgcolor: '#1b1b1b',
//             boxShadow: 24,
//             p: 2,
//             borderRadius: 2,
//             maxWidth: '800px',
//             width: '90%',
//             outline: 'none',
//           }}
//         >
//           <Box
//             component="iframe"
//             src={ONBOARDING_VIDEO_URL}
//             title="Kaip pradėti darbą su DokSkenu"
//             width="100%"
//             height="450px"
//             sx={{ border: 'none' }}
//             allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
//             allowFullScreen
//           />
//         </Box>
//       </Modal>

//       {/* Header section - always visible immediately */}
//       <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} sx={{ minHeight: 70 }}>
//         <Typography variant="h5">Sąskaitų faktūrų suvestinė</Typography>

//         {(() => {
//           const selectedExportableCount = selectedRows.filter(
//             id => exportableRows.some(row => String(row.id) === String(id))
//           ).length;

//           const excludedCount = excludedIds.length;

//           const exportCountToShow =
//             selectionMode === "filtered"
//               ? Math.max(0, exportableTotal - excludedCount)
//               : selectedExportableCount;

//           let disabledReason = "";
//           if (!userLoaded) {
//             disabledReason = "Kraunama...";
//           } else if (!isCompanyReady) {
//             disabledReason = "Pirmiausia užpildykite savo įmonės duomenis ir pasirinkite buhalterinę programą nustatymuose";
//           } else if (user?.view_mode === "multi" && !selectedCpKey) {
//             disabledReason = "Pasirinkite kontrahentą iš sąrašo, tada pažymėkite failus ir tik tada spauskite Eksportuoti";
//           } else if (exportCountToShow === 0) {
//             disabledReason = "Pažymėkite bent vieną dokumentą eksportui";
//           }

//           const exportDisabled = Boolean(disabledReason);

//           return (
//             <Box display="flex" flexDirection="column" alignItems="center" sx={{ minHeight: 70 }}>
//               <Tooltip
//                 title={exportDisabled ? disabledReason : ""}
//                 placement="bottom"
//                 disableHoverListener={!exportDisabled}
//               >
//                 <span style={{ display: "inline-flex" }}>
//                   <Button
//                     variant="outlined"
//                     color="primary"
//                     onClick={handleExport}
//                     disabled={exportDisabled}
//                   >
//                     Eksportuoti{exportCountToShow ? ` (${exportCountToShow})` : ""} į {programLabel}
//                   </Button>
//                 </span>
//               </Tooltip>

//               {/* Always render container to prevent layout shift, hide content until loaded */}
//               <Box
//                 onClick={currentTutorial ? () => setTutorialOpen(true) : undefined}
//                 sx={{
//                   display: "flex",
//                   alignItems: "center",
//                   justifyContent: "center",
//                   gap: 0.5,
//                   mt: 1.5,
//                   cursor: currentTutorial ? "pointer" : "default",
//                   color: "#1b1b1b",
//                   maxWidth: "100%",
//                   textAlign: "center",
//                   visibility: currentTutorial ? "visible" : "hidden",
//                   "&:hover": currentTutorial ? { color: "#555" } : {},
//                 }}
//               >
//                 <PlayCircleIcon sx={{ fontSize: "1rem", flexShrink: 0 }} />
//                 <Typography
//                   variant="body2"
//                   sx={{
//                     fontSize: "0.8rem",
//                     lineHeight: 1.2,
//                     wordBreak: "break-word",
//                     "&:hover": { textDecoration: "underline" },
//                   }}
//                 >
//                   {currentTutorial ? `Kaip eksportuoti į ${currentTutorial.label}?` : "Kaip eksportuoti?"}
//                 </Typography>
//               </Box>
//             </Box>
//           );
//         })()}
//       </Box>

//       {/* Alerts after header - won't cause layout shift for main content */}
//       {creditError && (
//         <Alert
//           severity="warning"
//           sx={{ mb: 2, alignItems: "center" }}
//           action={
//             <Button
//               color="warning"
//               variant="contained"
//               size="small"
//               onClick={() => (window.location = "/papildyti/")}
//             >
//               Papildyti
//             </Button>
//           }
//           onClose={() => setCreditError(null)}
//         >
//           {creditError}
//         </Alert>
//       )}

//       {userLoaded && !isCompanyReady && (
//         <Alert severity="warning" sx={{ mb: 2 }}>
//           <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
//             <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
//               <Typography variant="body2">
//                 Prieš įkeliant failus apdorojimui, įveskite savo įmonės duomenis ir pasirinkite buhalterinę programą eksportui.
//               </Typography>
//               <Button
//                 variant="contained"
//                 size="small"
//                 onClick={() => window.location = "/nustatymai"}
//               >
//                 Pasirinkti
//               </Button>
//             </Box>
//             <Box
//               onClick={() => setOnboardingVideoOpen(true)}
//               sx={{
//                 display: "flex",
//                 alignItems: "center",
//                 gap: 0.5,
//                 cursor: "pointer",
//                 color: "#1b1b1b",
//                 "&:hover": {
//                   color: "#555",
//                 },
//               }}
//             >
//               <PlayCircleIcon sx={{ fontSize: "1.1rem", color: "error.main" }} />
//               <Typography
//                 variant="body2"
//                 sx={{
//                   fontSize: "0.85rem",
//                   fontWeight: 600,
//                   "&:hover": {
//                     textDecoration: "underline",
//                   },
//                 }}
//               >
//                 Žiūrėti video kaip pradėti darbą
//               </Typography>
//             </Box>
//           </Box>
//         </Alert>
//       )}

//       {/* Upload controls - always visible */}
//       <Box mb={2} display="flex" alignItems="center" gap={2}>
//         <TextField
//           select
//           size="small"
//           label="Skaitmenizavimo tipas"
//           value={scanType}
//           onChange={e => setScanType(e.target.value)}
//           sx={{ minWidth: 270 }}
//         >
//           {SCAN_TYPES.map((type) => (
//             <MenuItem key={type.value} value={type.value}>
//               {type.label}
//             </MenuItem>
//           ))}
//         </TextField>

//         <Button
//           variant="contained"
//           component="label"
//           startIcon={<CloudUpload />}
//           disabled={isUploading || !userLoaded || !isCompanyReady}
//         >
//           Įkelti failus
//           <input type="file" hidden multiple onChange={handleFileChange} />
//         </Button>
//       </Box>

//       <ProcessingStatusBar
//         onSessionComplete={async (sessionId) => {
//           try {
//             const cpParam =
//               user?.view_mode === "multi" && selectedCpKey
//                 ? selectedCpKey
//                 : undefined;

//             const params = {
//               status: filters.status || undefined,
//               from: filters.dateFrom || undefined,
//               to: filters.dateTo || undefined,
//               search: (filters.search || "").trim() || undefined,
//               cp: cpParam,
//               include_archive_warnings: "true",
//               session_id: sessionId,
//             };

//             const { data } = await api.get("/documents/", { withCredentials: true, params });
//             setDocs(data.results || []);
//             setNextUrl(data.next || null);
//             setExportableTotal(Number(data.exportable_total || 0));
            
//             // Показываем archive_warnings если есть
//             if (data.archive_warnings?.length > 0) {
//               setArchiveWarnings(data.archive_warnings);
//             }
//           } catch (e) {
//             console.error("Nepavyko gauti dokumentų:", e);
//           }
          
//           if (user?.view_mode === "multi") {
//             await fetchCounterparties(cpSearch);
//           }
//         }}
//       />

//       {/* Объединённый Alert для всех пропущенных файлов */}
//       {(skippedFiles.length > 0 || archiveWarnings.length > 0) && (
//         <Alert 
//           severity="warning" 
//           sx={{ mb: 2 }}
//           onClose={() => {
//             clearSkipped();
//             setArchiveWarnings([]);
//           }}
//         >
//           <Typography variant="body2" fontWeight={600} gutterBottom>
//             Kai kurie failai buvo praleisti:
//           </Typography>
          
//           {/* Ошибки фронтенда (формат, размер при загрузке) */}
//           {skippedFiles.map((f, idx) => (
//             <Typography key={`skip-${idx}`} variant="body2" sx={{ ml: 1 }}>
//               • {f.name} — {f.reason}
//             </Typography>
//           ))}
          
//           {/* Ошибки из архивов (файлы >50MB внутри архивов) */}
//           {archiveWarnings.map((arch, idx) => (
//             <Typography key={`arch-${idx}`} variant="body2" sx={{ ml: 1 }}>
//               • <strong>{arch.original_filename}</strong>: {arch.error_message}
//             </Typography>
//           ))}
//         </Alert>
//       )}

//       {/* Фильтры статуса/дат - always visible */}
//       <DocumentsFilters filters={filters} onFilterChange={handleFilter} />

//       {/* GRID с фиксированной минимальной высотой */}
//       <Box
//         sx={{
//           display: "grid",
//           // Всегда двухколоночный layout для multi режима
//           gridTemplateColumns: openSidebar ? "300px 1fr" : "44px 1fr",
//           gap: 2,
//           mt: 2,
//           minHeight: MIN_CONTENT_HEIGHT,
//         }}
//       >
//         {/* LEFT: counterparties (collapsible, single-select) */}
//         <Box
//           sx={{
//             borderRight: openSidebar ? "1px solid #eee" : "none",
//             overflow: "hidden",
//             transition: "all .2s ease",
//             minHeight: MIN_CONTENT_HEIGHT,
//           }}
//         >
//           {dataLoading ? (
//             // Skeleton для сайдбара
//             openSidebar ? (
//               <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
//                 <Skeleton variant="text" width="60%" sx={{ mb: 1, height: 28 }} />
//                 <Skeleton variant="rectangular" height={40} sx={{ mb: 2, borderRadius: 1 }} />
//                 <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
//                   <Skeleton variant="text" width="40%" height={20} />
//                   <Skeleton variant="text" width="30%" height={20} />
//                 </Box>
//                 <Box sx={{ borderTop: '1px solid #eee', pt: 1 }}>
//                   {[...Array(18)].map((_, i) => (
//                     <Skeleton
//                       key={i}
//                       variant="rectangular"
//                       height={48}
//                       sx={{ mb: 0.5, borderRadius: 0.5 }}
//                     />
//                   ))}
//                 </Box>
//               </Box>
//             ) : (
//               <Box sx={{ height: "100%", display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
//                 <Skeleton variant="circular" width={40} height={40} sx={{ m: 1 }} />
//               </Box>
//             )
//           ) : (
//             <>
//               {openSidebar ? (
//                 <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
//                   <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1, py: 1 }}>
//                     <Typography variant="subtitle2" sx={{ opacity: 0.7 }}>Kontrahentai</Typography>
//                     <IconButton size="small" onClick={() => setOpenSidebar(false)} aria-label="collapse">
//                       <MenuOpenIcon />
//                     </IconButton>
//                   </Box>

//                   <Box sx={{ px: 2, pb: 1 }}>
//                     <TextField
//                       size="small"
//                       fullWidth
//                       placeholder="Paieška"
//                       value={cpSearch}
//                       onChange={(e) => setCpSearch(e.target.value)}
//                       InputProps={{
//                         startAdornment: (
//                           <InputAdornment position="start">
//                             <SearchIcon fontSize="small" />
//                           </InputAdornment>
//                         ),
//                       }}
//                     />
//                     <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 1 }}>
//                       <Typography variant="caption" sx={{ opacity: 0.7 }}>
//                         Iš viso: {counterparties.length}
//                       </Typography>
//                       <Button size="small" startIcon={<ClearAllIcon />} onClick={clearCpSelection}>
//                         Išvalyti
//                       </Button>
//                     </Box>
//                   </Box>
//                   <Divider />

//                   <Box sx={{ overflow: "auto", flex: 1 }}>
//                     <List dense disablePadding>
//                       {counterparties.map((c) => {
//                         const active = selectedCpKey === c.key;
//                         return (
//                           <ListItemButton
//                             key={c.key}
//                             dense
//                             onClick={chooseCounterparty(c.key)}
//                             selected={active}
//                             sx={active ? { bgcolor: "action.selected", "& .MuiListItemText-primary": { fontWeight: 700 } } : {}}
//                           >
//                             <ListItemText
//                               primary={<span>{c.name || "(Be pavadinimo)"}</span>}
//                               secondary={c.docs_count ? `${c.docs_count} dok.` : null}
//                             />
//                           </ListItemButton>
//                         );
//                       })}
//                     </List>
//                   </Box>
//                 </Box>
//               ) : (
//                 <Box sx={{ height: "100%", display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
//                   <IconButton onClick={() => setOpenSidebar(true)} sx={{ m: 1 }} aria-label="expand">
//                     <MenuIcon />
//                   </IconButton>
//                 </Box>
//               )}
//             </>
//           )}
//         </Box>

//         {/* RIGHT: table */}
//         <Box sx={{ overflow: "visible", minHeight: MIN_CONTENT_HEIGHT }}>
//           {dataLoading ? (
//             <TableContainer component={Paper}>
//               <Table size="small">
//                 <TableHead>
//                   <TableRow>
//                     <TableCell padding="checkbox"><Skeleton variant="circular" width={20} height={20} /></TableCell>
//                     <TableCell><Skeleton variant="text" width={80} /></TableCell>
//                     <TableCell><Skeleton variant="text" width={120} /></TableCell>
//                     <TableCell><Skeleton variant="text" width={100} /></TableCell>
//                     <TableCell><Skeleton variant="text" width={80} /></TableCell>
//                     <TableCell><Skeleton variant="text" width={60} /></TableCell>
//                     <TableCell />
//                   </TableRow>
//                 </TableHead>
//                 <TableBody>
//                   {[...Array(18)].map((_, i) => (
//                     <TableRow key={i}>
//                       <TableCell padding="checkbox"><Skeleton variant="circular" width={20} height={20} /></TableCell>
//                       <TableCell><Skeleton variant="text" /></TableCell>
//                       <TableCell><Skeleton variant="text" /></TableCell>
//                       <TableCell><Skeleton variant="text" /></TableCell>
//                       <TableCell><Skeleton variant="text" /></TableCell>
//                       <TableCell><Skeleton variant="text" /></TableCell>
//                       <TableCell><Skeleton variant="circular" width={24} height={24} /></TableCell>
//                     </TableRow>
//                   ))}
//                 </TableBody>
//               </Table>
//             </TableContainer>
//           ) : (
//             <DocumentsTable
//               filtered={tableData}
//               selectedRows={selectedRowsForTable}
//               selectAllIndeterminate={selectionMode === "filtered" && excludedIds.length > 0}
//               selectAllChecked={selectionMode === "filtered" && excludedIds.length === 0 && exportableTotal > 0}
//               isRowExportable={isRowExportable}
//               handleSelectRow={handleSelectRowWithHint}
//               handleSelectAll={handleSelectAllWithHint}
//               loading={loadingDocs}
//               loadingMore={loadingMore}
//               hasMore={Boolean(nextUrl)}
//               loadMore={loadMore}
//               onSearchChange={(q) => {
//                 const qq = (q || "").trim();
//                 if (qq) setSelectedCpKey("");
//                 setSelectedRows([]);
//                 setSelectionMode("none");
//                 setExcludedIds([]);
//                 setFilters((p) => ({ ...p, search: q }));
//               }}
//               allowUnknownDirection={user?.view_mode === "multi"}
//               reloadDocuments={fetchDocs}
//               onDeleteDoc={(id) => setDocs(prev => prev.filter(d => d.id !== id))}
//             />
//           )}
//         </Box>
//       </Box>

//       <Snackbar
//         open={cpToastOpen}
//         autoHideDuration={2500}
//         onClose={() => setCpToastOpen(false)}
//         anchorOrigin={{ vertical: "top", horizontal: "center" }}
//         sx={{ top: { xs: 70, sm: 80 } }}
//       >
//         <Alert
//           severity="warning"
//           onClose={() => setCpToastOpen(false)}
//           sx={{ 
//             width: "100%",
//             backgroundColor: "#2a88faff",
//             color: "#fff",
//             "& .MuiAlert-icon": { color: "#fff" },
//             "& .MuiAlert-action .MuiIconButton-root": { color: "#fff" },
//           }}
//         >
//           Pasirinkite kontrahentą iš sąrašo kairėje
//         </Alert>
//       </Snackbar>

//       <PreviewDialog
//         open={dialogOpen}
//         onClose={() => setDialogOpen(false)}
//         selected={selected}
//         setSelected={setSelected}
//         setDocs={setDocs}
//         user={user}
//         selectedCpKey={selectedCpKey}
//         showRawPanels={false}
//       />
//     </Box>
//   );
// }
