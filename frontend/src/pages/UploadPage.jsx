import { useEffect, useMemo, useState } from "react";
import { Helmet } from 'react-helmet';
import {
  Box, Button, Typography, Alert, TextField, MenuItem, Dialog, DialogTitle, DialogContent, LinearProgress,
  List, ListItemButton, ListItemText, IconButton, Divider, InputAdornment, Tooltip, Modal
} from "@mui/material";
import {
  CloudUpload, HourglassEmpty, Cancel, CheckCircleOutline,
} from "@mui/icons-material";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import MenuIcon from "@mui/icons-material/Menu";
import SearchIcon from "@mui/icons-material/Search";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";

import { api } from "../api/endpoints";
import DocumentsTable from "../page_elements/DocumentsTable";
import PreviewDialog from "../page_elements/PreviewDialog";
import DocumentsFilters from "../components/DocumentsFilters";
import { usePollingDocumentStatus } from "../page_elements/Polling";
import { ACCOUNTING_PROGRAMS } from "../page_elements/AccountingPrograms";

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
  // Add more programs as needed
};

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
  const [docs, setDocs] = useState([]);
  const [filters, setFilters] = useState({ status: "", dateFrom: "", dateTo: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [creditError, setCreditError] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);
  const [user, setUser] = useState(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [scanType, setScanType] = useState("sumiskai");

  // прогресс аплоада
  const [progressOpen, setProgressOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

  // video tutorial modal
  const [tutorialOpen, setTutorialOpen] = useState(false);

  // sidebar (multi)
  const [openSidebar, setOpenSidebar] = useState(() => {
    try { return localStorage.getItem("sv_open") !== "0"; } catch { return true; }
  });
  const [cpSearch, setCpSearch] = useState("");
  // одиночный выбор контрагента
  const [selectedCpKey, setSelectedCpKey] = useState("");

  // сбрасываем выбор при первом рендере страницы
  useEffect(() => {
    setSelectedCpKey("");
    setSelectedRows([]);
    try { localStorage.removeItem("sv_selected_key"); } catch {}
  }, []);

  // если вдруг меняется view_mode — тоже сбросим
  useEffect(() => {
    if (user?.view_mode) {
      setSelectedCpKey("");
      setSelectedRows([]);
      try { localStorage.removeItem("sv_selected_key"); } catch {}
    }
  }, [user?.view_mode]);

  // persist ui
  useEffect(() => {
    try { localStorage.setItem("sv_open", openSidebar ? "1" : "0"); } catch {}
  }, [openSidebar]);

  // load user
  useEffect(() => {
    api.get("/profile/", { withCredentials: true })
      .then(res => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setUserLoaded(true));
  }, []);

  // load docs
  useEffect(() => {
    fetchDocs();
    // eslint-disable-next-line
  }, []);

  const fetchDocs = async () => {
    try {
      const { data } = await api.get("/documents/", { withCredentials: true });
      setDocs(data);
    } catch (e) {
      console.error("Nepavyko gauti dokumentų:", e);
    }
  };

  // polling — важно, чтобы внутри хука использовался функциональный setDocs(prev => ...)
  usePollingDocumentStatus({ docs, setDocs });

  const programLabel =
    ACCOUNTING_PROGRAMS.find(
      (p) => p.value === user?.default_accounting_program
    )?.label || "eksporto programa";

  // Get tutorial info for current program
  const currentTutorial = useMemo(() => {
    const programKey = user?.default_accounting_program;
    if (!programKey) return null;
    return EXPORT_TUTORIALS[programKey] || null;
  }, [user?.default_accounting_program]);

  // upload
  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadProgress({ current: 0, total: files.length });
    setProgressOpen(true);

    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    formData.append("scan_type", scanType);

    try {
      // 🔄 Сразу сбрасываем выбор контрагента, чтобы новые документы были видны
      setSelectedCpKey("");
      setSelectedRows([]);
      setCpSearch("");
      try { localStorage.removeItem("sv_selected_key"); } catch {}
      
      await api.post("/scan/", formData, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.lengthComputable) {
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
    setTimeout(() => setProgressOpen(false), 700);
  };

  // counterparties without duplicates
  const counterparties = useMemo(() => {
    const map = new Map();
    for (const d of docs || []) {
      // seller
      if (d.seller_name || d.seller_vat_code || d.seller_id) {
        const key = companyKey(d.seller_name, d.seller_vat_code, d.seller_id);
        if (!map.has(key)) {
          map.set(key, {
            key,
            id:  d.seller_id ?? null,
            name: d.seller_name ?? "",
            vat: d.seller_vat_code ?? "",
            docs_count: 0,
          });
        }
        map.get(key).docs_count += 1;
      }
      // buyer
      if (d.buyer_name || d.buyer_vat_code || d.buyer_id) {
        const key = companyKey(d.buyer_name, d.buyer_vat_code, d.buyer_id);
        if (!map.has(key)) {
          map.set(key, {
            key,
            id:  d.buyer_id ?? null,
            name: d.buyer_name ?? "",
            vat: d.buyer_vat_code ?? "",
            docs_count: 0,
          });
        }
        map.get(key).docs_count += 1;
      }
    }
    return Array.from(map.values()).sort((a,b)=> (b.docs_count||0) - (a.docs_count||0));
  }, [docs]);

  // search in counterparties
  const cpFiltered = useMemo(() => {
    const q = cpSearch.trim().toLowerCase();
    if (!q) return counterparties;
    return counterparties.filter(c => {
      const byName = (c.name || "").toLowerCase().includes(q);
      const byId   = c.id != null && String(c.id).toLowerCase().includes(q);
      const byVat  = (c.vat || "").toLowerCase().includes(q);
      return byName || byId || byVat;
    });
  }, [counterparties, cpSearch]);

  // base filter by status/dates (+ защита от "мягко удалённых" при необходимости)
  const baseFiltered = useMemo(() => {
    if (!Array.isArray(docs)) return [];
    return docs.filter((d) => {
      if (d.status === 'deleted' || d.is_deleted === true) return false;
      if (filters.status && d.status !== filters.status) return false;
      const created = new Date(d.uploaded_at);
      if (filters.dateFrom && created < new Date(filters.dateFrom)) return false;
      if (filters.dateTo && created > new Date(filters.dateTo + "T23:59:59")) return false;
      return true;
    });
  }, [docs, filters]);

  // apply single counterparty filter (multi)
  const docsByCounterparty = useMemo(() => {
    if (user?.view_mode !== "multi" || !selectedCpKey) return baseFiltered;
    return baseFiltered.filter(d => {
      const sKey = companyKey(d.seller_name, d.seller_vat_code, d.seller_id);
      const bKey = companyKey(d.buyer_name,  d.buyer_vat_code,  d.buyer_id);
      return selectedCpKey === sKey || selectedCpKey === bKey;
    });
  }, [baseFiltered, selectedCpKey, user?.view_mode]);

  // table data decorate + "визуальное" направление
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
      (docsByCounterparty || []).map((d) => {
        // multi: пусто в колонке Pirkimas/Pardavimas, пока контрагент не выбран
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
    [docsByCounterparty, user?.view_mode, selectedCpKey]
  );

  // export logic
  const isRowExportable = (row) => row.status === "completed" || row.status === "exported";

  const canExport = (d) => {
    if (!isRowExportable(d)) return false;
    if (user?.view_mode === "multi") return true;
    return !!d.pirkimas_pardavimas && d.pirkimas_pardavimas.toLowerCase() !== "nezinoma";
  };

  const exportableRows = tableData.filter(canExport);

  const handleSelectRow = (id) => () => {
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // "выбрать всё": сюда теперь приходит МАССИВ id
  const handleSelectAll = (ids) => {
    setSelectedRows(ids);
  };

  const handleFilter = (f) => (e) => setFilters((p) => ({ ...p, [f]: e.target.value }));

  const isCompanyReady =
    !!user?.company_name &&
    !!user?.company_code &&
    !!user?.company_country_iso &&
    !!user?.default_accounting_program;

  const handleExport = async () => {
    if (selectedRows.length === 0) {
      alert("Pasirinkite bent vieną dokumentą eksportui!");
      return;
    }
    const mode = user?.view_mode === "multi" ? "multi" : "single";

    if (mode === "multi" && !selectedCpKey) {
      alert("Pasirinkite kontrahentą kairėje pusėje, kad nustatyti pirkimą/pardavimą eksportui.");
      return;
    }

    try {
      const payload = { ids: selectedRows, mode };

      if (mode === "multi") {
        const overrides = {};
        for (const id of selectedRows) {
          const d = tableData.find((x) => x.id === id);
          if (!d) continue;
          let dir = resolveDirection(d, selectedCpKey);

          // fallback — если не вычислилось
          if (!dir) {
            const dbDir = (d.pirkimas_pardavimas || "").toLowerCase();
            dir = dbDir === "pirkimas" || dbDir === "pardavimas" ? dbDir : "pirkimas";
          }
          overrides[String(id)] = dir;
        }
        payload.overrides = overrides;
      }

      const res = await api.post("/documents/export_xml/", payload, {
        withCredentials: true,
        responseType: "blob",
      });

      let filename = "";
      const contentDisposition = res.headers["content-disposition"];
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }
      if (!filename) {
        filename = selectedRows.length === 1 ? "dokumentas.xml" : "dokumentai.zip";
      }

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setDocs((prev) =>
        prev.map((d) =>
          selectedRows.includes(d.id) ? { ...d, status: "exported" } : d
        )
      );
    } catch (err) {
      alert("Eksportas nepavyko: " + (err?.message || "Klaida"));
      console.error(err);
    }
  };


  // helpers
  const toggleSidebar = () => setOpenSidebar(v => !v);

  const chooseCounterparty = (key) => () => {
    setSelectedCpKey(prev => (prev === key ? "" : key));
    setSelectedRows([]);
  };

  const clearCpSelection = () => {
    setSelectedCpKey("");
    setSelectedRows([]);
  };

  const progressPercent =
    uploadProgress.total > 0
      ? Math.round((uploadProgress.current / uploadProgress.total) * 100)
      : 0;

  return (
    <Box p={4}>
      <Helmet>
        <title>Suvestinė - DokSkenas</title>
        <meta name="description" content="Įkelkite dokumentus skaitmenizavimui" />
      </Helmet>

      {/* Popup progress */}
      <Dialog open={progressOpen} maxWidth="xs" fullWidth>
        <DialogTitle>Įkeliami failai</DialogTitle>
        <DialogContent>
          <Box mb={1}>
            {`Įkelta: ${uploadProgress.current} iš ${uploadProgress.total}`}
          </Box>
          <LinearProgress variant="determinate" value={progressPercent} />
        </DialogContent>
      </Dialog>

      {/* Video tutorial modal - styled like Dokskenas.jsx */}
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
              height="450px"
              sx={{ border: 'none' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          )}
        </Box>
      </Modal>

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
        <Typography variant="h5">Sąskaitų faktūrų suvestinė</Typography>

        {(() => {
          // причина дизейбла (показываем в tooltip)
          let disabledReason = "";
          if (!isCompanyReady) {
            disabledReason = "Pirmiausia užpildykite savo įmonės duomenis ir pasirinkite buhalterinę programą nustatymuose";
          } else if (user?.view_mode === "multi" && !selectedCpKey) {
            disabledReason = "Pasirinkite kontrahentą iš sąrašo, tada pažymėkite failus ir tik tada spauskite Eksportuoti";
          } else if (selectedRows.length === 0) {
            disabledReason = "Pažymėkite bent vieną dokumentą eksportui";
          }

          const exportDisabled = Boolean(disabledReason);
          const selectedExportableCount = selectedRows.filter(
            id => exportableRows.some(row => row.id === id)
          ).length;

          return (
            <Box display="flex" flexDirection="column" alignItems="center">
              <Tooltip
                title={exportDisabled ? disabledReason : ""}
                placement="bottom"
                disableHoverListener={!exportDisabled}
              >
                {/* span нужен, чтобы Tooltip работал поверх disabled Button */}
                <span style={{ display: "inline-flex" }}>
                  <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleExport}
                    disabled={exportDisabled}
                  >
                    Eksportuoti
                    {selectedExportableCount ? ` (${selectedExportableCount})` : ""} į {programLabel}
                  </Button>
                </span>
              </Tooltip>

              {/* Video tutorial link - centered under button, with text wrap */}
              {currentTutorial && (
                <Box
                  onClick={() => setTutorialOpen(true)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 0.5,
                    mt: 1.5,
                    cursor: "pointer",
                    color: "#1b1b1b",
                    maxWidth: "100%",
                    textAlign: "center",
                    "&:hover": {
                      color: "#555",
                    },
                  }}
                >
                  <PlayCircleIcon sx={{ fontSize: "1rem", flexShrink: 0 }} />
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: "0.8rem",
                      lineHeight: 1.2,
                      wordBreak: "break-word",
                      "&:hover": {
                        textDecoration: "underline",
                      },
                    }}
                  >
                    Kaip eksportuoti į {currentTutorial.label}?
                  </Typography>
                </Box>
              )}
            </Box>
          );
        })()}
      </Box>

      {/* ===== Здесь продолжается оставшаяся часть вашего компонента ===== */}
      {/* Upload section, filters, sidebar, DocumentsTable, PreviewDialog и т.д. */}
      {/* Скопируйте оставшийся JSX из вашего оригинального файла */}
      


      {/* ===== Здесь продолжается оставшаяся часть вашего компонента ===== */}
      {/* Upload section, filters, sidebar, DocumentsTable, PreviewDialog и т.д. */}
      {/* Скопируйте оставшийся JSX из вашего оригинального файла */}

      {/* Верхняя панель: скан-тип + аплоад */}
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
          disabled={progressOpen || !isCompanyReady}
        >
          Įkelti failus
          <input type="file" hidden multiple onChange={handleFileChange} />
        </Button>
      </Box>

      {/* Фильтры статуса/дат */}
      <DocumentsFilters filters={filters} onFilterChange={handleFilter} />

      {/* GRID */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: (user?.view_mode === "multi")
            ? (openSidebar ? "300px 1fr" : "44px 1fr")
            : "1fr",
          gap: 2,
          mt: 2
        }}
      >
        {/* LEFT: counterparties (collapsible, single-select) */}
        <Box
          sx={{
            borderRight: (user?.view_mode === "multi" && openSidebar) ? "1px solid #eee" : "none",
            overflow: "hidden",
            transition: "all .2s ease"
          }}
        >
          {user?.view_mode === "multi" && (
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
                      {cpFiltered.map((c) => {
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
        <Box sx={{ overflow: "hidden" }}>
          <DocumentsTable
            filtered={tableData}
            selectedRows={selectedRows}
            isRowExportable={isRowExportable}
            handleSelectRow={handleSelectRow}
            handleSelectAll={handleSelectAll}
            loading={false}
            allowUnknownDirection={user?.view_mode === "multi"}
            reloadDocuments={fetchDocs}
            onDeleteDoc={(id) => setDocs(prev => prev.filter(d => d.id !== id))} // ключевая строка
          />
        </Box>
      </Box>

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
//   List, ListItemButton, ListItemText, IconButton, Divider, InputAdornment, Tooltip
// } from "@mui/material";
// import {
//   CloudUpload, HourglassEmpty, Cancel, CheckCircleOutline,
// } from "@mui/icons-material";
// import MenuOpenIcon from "@mui/icons-material/MenuOpen";
// import MenuIcon from "@mui/icons-material/Menu";
// import SearchIcon from "@mui/icons-material/Search";
// import ClearAllIcon from "@mui/icons-material/ClearAll";

// import { api } from "../api/endpoints";
// import DocumentsTable from "../page_elements/DocumentsTable";
// import PreviewDialog from "../page_elements/PreviewDialog";
// import DocumentsFilters from "../components/DocumentsFilters";
// import { usePollingDocumentStatus } from "../page_elements/Polling";
// import { ACCOUNTING_PROGRAMS } from "../page_elements/AccountingPrograms";

// const SCAN_TYPES = [
//   { value: "sumiskai", label: "Sumiškai (be eilučių) – 1 kreditas" },
//   { value: "detaliai", label: "Detaliai (su eilutėmis) – 1.3 kredito" },
// ];

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
//   const [filters, setFilters] = useState({ status: "", dateFrom: "", dateTo: "" });
//   const [dialogOpen, setDialogOpen] = useState(false);
//   const [selected, setSelected] = useState(null);
//   const [creditError, setCreditError] = useState(null);
//   const [selectedRows, setSelectedRows] = useState([]);
//   const [user, setUser] = useState(null);
//   const [userLoaded, setUserLoaded] = useState(false);
//   const [scanType, setScanType] = useState("sumiskai");

//   // прогресс аплоада
//   const [progressOpen, setProgressOpen] = useState(false);
//   const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

//   // sidebar (multi)
//   const [openSidebar, setOpenSidebar] = useState(() => {
//     try { return localStorage.getItem("sv_open") !== "0"; } catch { return true; }
//   });
//   const [cpSearch, setCpSearch] = useState("");
//   // одиночный выбор контрагента
//   const [selectedCpKey, setSelectedCpKey] = useState("");

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

//   // load docs
//   useEffect(() => {
//     fetchDocs();
//     // eslint-disable-next-line
//   }, []);

//   const fetchDocs = async () => {
//     try {
//       const { data } = await api.get("/documents/", { withCredentials: true });
//       setDocs(data);
//     } catch (e) {
//       console.error("Nepavyko gauti dokumentų:", e);
//     }
//   };

//   // polling — важно, чтобы внутри хука использовался функциональный setDocs(prev => ...)
//   usePollingDocumentStatus({ docs, setDocs });

//   const programLabel =
//     ACCOUNTING_PROGRAMS.find(
//       (p) => p.value === user?.default_accounting_program
//     )?.label || "eksporto programa";

//   // upload
//   const handleFileChange = async (e) => {
//     const files = Array.from(e.target.files || []);
//     if (!files.length) return;
//     setUploadProgress({ current: 0, total: files.length });
//     setProgressOpen(true);

//     const formData = new FormData();
//     files.forEach((f) => formData.append("files", f));
//     formData.append("scan_type", scanType);

//     try {
//       // 🔄 Сразу сбрасываем выбор контрагента, чтобы новые документы были видны
//       setSelectedCpKey("");
//       setSelectedRows([]);
//       setCpSearch("");
//       try { localStorage.removeItem("sv_selected_key"); } catch {}
      
//       await api.post("/scan/", formData, {
//         withCredentials: true,
//         headers: { "Content-Type": "multipart/form-data" },
//         onUploadProgress: (progressEvent) => {
//           if (progressEvent.lengthComputable) {
//             const percent = progressEvent.loaded / progressEvent.total;
//             setUploadProgress((prev) => ({
//               ...prev,
//               current: Math.round(percent * files.length)
//             }));
//           }
//         }
//       });
//       setUploadProgress({ current: files.length, total: files.length });
//       await fetchDocs();
//     } catch (err) {
//       const serverError = err?.response?.data?.error;
//       if (serverError && serverError.toLowerCase().includes("kredit")) {
//         setCreditError(serverError);
//       } else {
//         alert("Nepavyko įkelti failų");
//       }
//     }
//     setTimeout(() => setProgressOpen(false), 700);
//   };

//   // counterparties without duplicates
//   const counterparties = useMemo(() => {
//     const map = new Map();
//     for (const d of docs || []) {
//       // seller
//       if (d.seller_name || d.seller_vat_code || d.seller_id) {
//         const key = companyKey(d.seller_name, d.seller_vat_code, d.seller_id);
//         if (!map.has(key)) {
//           map.set(key, {
//             key,
//             id:  d.seller_id ?? null,
//             name: d.seller_name ?? "",
//             vat: d.seller_vat_code ?? "",
//             docs_count: 0,
//           });
//         }
//         map.get(key).docs_count += 1;
//       }
//       // buyer
//       if (d.buyer_name || d.buyer_vat_code || d.buyer_id) {
//         const key = companyKey(d.buyer_name, d.buyer_vat_code, d.buyer_id);
//         if (!map.has(key)) {
//           map.set(key, {
//             key,
//             id:  d.buyer_id ?? null,
//             name: d.buyer_name ?? "",
//             vat: d.buyer_vat_code ?? "",
//             docs_count: 0,
//           });
//         }
//         map.get(key).docs_count += 1;
//       }
//     }
//     return Array.from(map.values()).sort((a,b)=> (b.docs_count||0) - (a.docs_count||0));
//   }, [docs]);

//   // search in counterparties
//   const cpFiltered = useMemo(() => {
//     const q = cpSearch.trim().toLowerCase();
//     if (!q) return counterparties;
//     return counterparties.filter(c => {
//       const byName = (c.name || "").toLowerCase().includes(q);
//       const byId   = c.id != null && String(c.id).toLowerCase().includes(q);
//       const byVat  = (c.vat || "").toLowerCase().includes(q);
//       return byName || byId || byVat;
//     });
//   }, [counterparties, cpSearch]);

//   // base filter by status/dates (+ защита от "мягко удалённых" при необходимости)
//   const baseFiltered = useMemo(() => {
//     if (!Array.isArray(docs)) return [];
//     return docs.filter((d) => {
//       if (d.status === 'deleted' || d.is_deleted === true) return false;
//       if (filters.status && d.status !== filters.status) return false;
//       const created = new Date(d.uploaded_at);
//       if (filters.dateFrom && created < new Date(filters.dateFrom)) return false;
//       if (filters.dateTo && created > new Date(filters.dateTo + "T23:59:59")) return false;
//       return true;
//     });
//   }, [docs, filters]);

//   // apply single counterparty filter (multi)
//   const docsByCounterparty = useMemo(() => {
//     if (user?.view_mode !== "multi" || !selectedCpKey) return baseFiltered;
//     return baseFiltered.filter(d => {
//       const sKey = companyKey(d.seller_name, d.seller_vat_code, d.seller_id);
//       const bKey = companyKey(d.buyer_name,  d.buyer_vat_code,  d.buyer_id);
//       return selectedCpKey === sKey || selectedCpKey === bKey;
//     });
//   }, [baseFiltered, selectedCpKey, user?.view_mode]);

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
//       (docsByCounterparty || []).map((d) => {
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
//     [docsByCounterparty, user?.view_mode, selectedCpKey]
//   );

//   // export logic
//   const isRowExportable = (row) => row.status === "completed" || row.status === "exported";

//   const canExport = (d) => {
//     if (!isRowExportable(d)) return false;
//     if (user?.view_mode === "multi") return true;
//     return !!d.pirkimas_pardavimas && d.pirkimas_pardavimas.toLowerCase() !== "nezinoma";
//   };

//   const exportableRows = tableData.filter(canExport);

//   const handleSelectRow = (id) => () => {
//     setSelectedRows((prev) =>
//       prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
//     );
//   };

//   // "выбрать всё": сюда теперь приходит МАССИВ id
//   const handleSelectAll = (ids) => {
//     setSelectedRows(ids);
//   };

//   const handleFilter = (f) => (e) => setFilters((p) => ({ ...p, [f]: e.target.value }));

//   const isCompanyReady =
//     !!user?.company_name &&
//     !!user?.company_code &&
//     !!user?.company_country_iso &&
//     !!user?.default_accounting_program;

//   const handleExport = async () => {
//     if (selectedRows.length === 0) {
//       alert("Pasirinkite bent vieną dokumentą eksportui!");
//       return;
//     }
//     const mode = user?.view_mode === "multi" ? "multi" : "single";

//     if (mode === "multi" && !selectedCpKey) {
//       alert("Pasirinkite kontrahentą kairėje pusėje, kad nustatyti pirkimą/pardavimą eksportui.");
//       return;
//     }

//     try {
//       const payload = { ids: selectedRows, mode };

//       if (mode === "multi") {
//         const overrides = {};
//         for (const id of selectedRows) {
//           const d = tableData.find((x) => x.id === id);
//           if (!d) continue;
//           let dir = resolveDirection(d, selectedCpKey);

//           // fallback — если не вычислилось
//           if (!dir) {
//             const dbDir = (d.pirkimas_pardavimas || "").toLowerCase();
//             dir = dbDir === "pirkimas" || dbDir === "pardavimas" ? dbDir : "pirkimas";
//           }
//           overrides[String(id)] = dir;
//         }
//         payload.overrides = overrides;
//       }

//       const res = await api.post("/documents/export_xml/", payload, {
//         withCredentials: true,
//         responseType: "blob",
//       });

//       let filename = "";
//       const contentDisposition = res.headers["content-disposition"];
//       if (contentDisposition) {
//         const match = contentDisposition.match(/filename="?([^"]+)"?/);
//         if (match) filename = match[1];
//       }
//       if (!filename) {
//         filename = selectedRows.length === 1 ? "dokumentas.xml" : "dokumentai.zip";
//       }

//       const url = window.URL.createObjectURL(new Blob([res.data]));
//       const link = document.createElement("a");
//       link.href = url;
//       link.setAttribute("download", filename);
//       document.body.appendChild(link);
//       link.click();
//       document.body.removeChild(link);

//       setDocs((prev) =>
//         prev.map((d) =>
//           selectedRows.includes(d.id) ? { ...d, status: "exported" } : d
//         )
//       );
//     } catch (err) {
//       alert("Eksportas nepavyko: " + (err?.message || "Klaida"));
//       console.error(err);
//     }
//   };


//   // helpers
//   const toggleSidebar = () => setOpenSidebar(v => !v);

//   const chooseCounterparty = (key) => () => {
//     setSelectedCpKey(prev => (prev === key ? "" : key));
//     setSelectedRows([]);
//   };

//   const clearCpSelection = () => {
//     setSelectedCpKey("");
//     setSelectedRows([]);
//   };

//   const progressPercent =
//     uploadProgress.total > 0
//       ? Math.round((uploadProgress.current / uploadProgress.total) * 100)
//       : 0;

//   return (
//     <Box p={4}>
//       <Helmet>
//         <title>Suvestinė - DokSkenas</title>
//         <meta name="description" content="Įkelkite dokumentus skaitmenizavimui" />
//       </Helmet>

//       {/* Popup progress */}
//       <Dialog open={progressOpen} maxWidth="xs" fullWidth>
//         <DialogTitle>Įkeliami failai</DialogTitle>
//         <DialogContent>
//           <Box mb={1}>
//             {`Įkelta: ${uploadProgress.current} iš ${uploadProgress.total}`}
//           </Box>
//           <LinearProgress variant="determinate" value={progressPercent} />
//         </DialogContent>
//       </Dialog>

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
//           Prieš įkeliant failus apdorojimui, įveskite savo įmonės duomenis ir pasirinkite buhalterinę programą eksportui.
//           <Button
//             variant="contained"
//             size="small"
//             sx={{ ml: 2 }}
//             onClick={() => window.location = "/nustatymai"}
//           >
//             Pasirinkti
//           </Button>
//         </Alert>
//       )}
//       <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
//         <Typography variant="h5">Sąskaitų faktūrų suvestinė</Typography>

//         {(() => {
//           // причина дизейбла (показываем в tooltip)
//           let disabledReason = "";
//           if (!isCompanyReady) {
//             disabledReason = "Pirmiausia užpildykite savo įmonės duomenis ir pasirinkite buhalterinę programą nustatymuose";
//           } else if (user?.view_mode === "multi" && !selectedCpKey) {
//             disabledReason = "Pasirinkite kontrahentą iš sąrašo, tada pažymėkite failus ir tik tada spauskite „Eksportuoti“";
//           } else if (selectedRows.length === 0) {
//             disabledReason = "Pažymėkite bent vieną dokumentą eksportui";
//           }

//           const exportDisabled = Boolean(disabledReason);
//           const selectedExportableCount = selectedRows.filter(
//             id => exportableRows.some(row => row.id === id)
//           ).length;

//           return (
//             <Tooltip
//               title={exportDisabled ? disabledReason : ""}
//               placement="bottom"
//               disableHoverListener={!exportDisabled}
//             >
//               {/* span нужен, чтобы Tooltip работал поверх disabled Button */}
//               <span style={{ display: "inline-flex" }}>
//                 <Button
//                   variant="outlined"
//                   color="primary"
//                   sx={{ ml: 2 }}
//                   onClick={handleExport}
//                   disabled={exportDisabled}
//                 >
//                   Eksportuoti
//                   {selectedExportableCount ? ` (${selectedExportableCount})` : ""} į {programLabel}
//                 </Button>
//               </span>
//             </Tooltip>
//           );
//         })()}
//       </Box>

//       {/* <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
//         <Typography variant="h5">Sąskaitų faktūrų suvestinė</Typography>
//         <Button
//           variant="outlined"
//           color="primary"
//           sx={{ ml: 2 }}
//           onClick={handleExport}
//           disabled={
//             selectedRows.length === 0 ||
//             !isCompanyReady ||
//             (user?.view_mode === "multi" && !selectedCpKey)
//           }
//         >
//           Eksportuoti
//           {selectedRows.filter(id => exportableRows.some(row => row.id === id)).length
//             ? ` (${selectedRows.filter(id => exportableRows.some(row => row.id === id)).length})`
//             : ''
//           } į {programLabel}
//         </Button>
//       </Box> */}

//       {/* Верхняя панель: скан-тип + аплоад */}
//       <Box mb={2} display="flex" alignItems="center" gap={2}>
//         <TextField
//           select
//           size="small"
//           label="Skenavimo tipas"
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
//           disabled={progressOpen || !isCompanyReady}
//         >
//           Įkelti failus
//           <input type="file" hidden multiple onChange={handleFileChange} />
//         </Button>
//       </Box>

//       {/* Фильтры статуса/дат */}
//       <DocumentsFilters filters={filters} onFilterChange={handleFilter} />

//       {/* GRID */}
//       <Box
//         sx={{
//           display: "grid",
//           gridTemplateColumns: (user?.view_mode === "multi")
//             ? (openSidebar ? "300px 1fr" : "44px 1fr")
//             : "1fr",
//           gap: 2,
//           mt: 2
//         }}
//       >
//         {/* LEFT: counterparties (collapsible, single-select) */}
//         <Box
//           sx={{
//             borderRight: (user?.view_mode === "multi" && openSidebar) ? "1px solid #eee" : "none",
//             overflow: "hidden",
//             transition: "all .2s ease"
//           }}
//         >
//           {user?.view_mode === "multi" && (
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
//                       {cpFiltered.map((c) => {
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
//         <Box sx={{ overflow: "hidden" }}>
//           <DocumentsTable
//             filtered={tableData}
//             selectedRows={selectedRows}
//             isRowExportable={isRowExportable}
//             handleSelectRow={handleSelectRow}
//             handleSelectAll={handleSelectAll}
//             loading={false}
//             allowUnknownDirection={user?.view_mode === "multi"}
//             reloadDocuments={fetchDocs}
//             onDeleteDoc={(id) => setDocs(prev => prev.filter(d => d.id !== id))} // ключевая строка
//           />
//         </Box>
//       </Box>

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







