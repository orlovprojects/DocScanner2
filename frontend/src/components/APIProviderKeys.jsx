/**
 * APIProviderKeys — универсальный компонент управления API ключами.
 *
 * Работает для: rivile_gama_api, dineta, optimum.
 * Props:
 *   provider: "rivile_gama_api" | "dineta" | "optimum"
 *   mode: "default" | "israsymas"
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  Box, Typography, Paper, TextField, Button, Stack, Alert,
  IconButton, Chip, Tooltip, Switch, Dialog, DialogTitle,
  DialogContent, DialogActions, Grid2, CircularProgress,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import VerifiedIcon from "@mui/icons-material/Verified";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import CloseIcon from "@mui/icons-material/Close";
import { api } from "../api/endpoints";

// ──── Конфигурация провайдеров ────
const PROVIDER_CONFIG = {
  rivile_gama_api: {
    title: "Rivile GAMA API sąsajos nustatymai",
    tooltip: "Priskirkite API raktą tam tikrai įmonei, jei vedate kelių įmonių apskaitą, arba pasirinkite \"Naudoti visoms įmonėms\" opciją, jei vedate vienos įmonės apskaitą. API raktą gausite iš savo Rivilės administratoriaus arba ManoRivile portale.",
    israsymasTooltip: "Įveskite API raktą, kuris bus naudojamas eksportuojant sąskaitas į Rivile GAMA. API raktą gausite iš savo Rivilės administratoriaus arba ManoRivile portale.",
    videoUrl: "https://www.youtube.com/embed/mUTdwZDsGWQ",
    israsymasVideoUrl: "https://www.youtube.com/embed/fCHcX3jHYcM",
    showInstructions: false,
    fields: [
      { key: "api_key", label: "API raktas", type: "password", required: true, placeholder: "Įveskite API raktą" },
    ],
    maskField: "api_key",
  },
  dineta: {
    title: "Dineta API sąsajos nustatymai",
    tooltip: "Priskirkite API raktą tam tikrai įmonei, jei vedate kelių įmonių apskaitą, arba pasirinkite \"Naudoti visoms įmonėms\" opciją, jei vedate vienos įmonės apskaitą.",
    israsymasTooltip: "Įveskite Dineta API prisijungimo duomenis, kurie bus naudojami eksportuojant sąskaitas.",
    showInstructions: true,
    israsymasShowInstructions: true,
    videoUrl: "https://www.youtube.com/embed/MLCPSPmcupE",
    israsymasVideoUrl: "",
    fields: [
      { key: "url", label: "Dineta nuoroda", type: "text", required: true, placeholder: "https://lt4.dineta.eu/dokskenas/", fullWidth: true },
      { key: "username", label: "Vartotojo vardas", type: "text", required: true },
      { key: "password", label: "Slaptažodis", type: "password", required: true },
    ],
    maskField: "username",
  },
  optimum: {
    title: "Optimum API sąsajos nustatymai",
    tooltip: "Priskirkite API raktą tam tikrai įmonei, jei vedate kelių įmonių apskaitą, arba pasirinkite \"Naudoti visoms įmonėms\" opciją, jei vedate vienos įmonės apskaitą. API raktą rasite savo Optimum programoje (Pagalba -> API raktas).",
    israsymasTooltip: "Įveskite Optimum API raktą, kuris bus naudojamas eksportuojant sąskaitas. API raktą rasite savo Optimum programoje (Pagalba -> API raktas).",
    showInstructions: false,
    videoUrl: "",
    israsymasVideoUrl: "",
    fields: [
      { key: "api_key", label: "API raktas", type: "password", required: true, placeholder: "Įveskite Optimum API raktą" },
    ],
    maskField: "api_key",
  },
};

const BASE_URL = (provider) => `/settings/api-keys/${provider}/`;

export default function APIProviderKeys({ provider, mode = "default" }) {
  const config = PROVIDER_CONFIG[provider];
  if (!config) return null;

  return <APIProviderKeysInner provider={provider} config={config} mode={mode} />;
}

function APIProviderKeysInner({ provider, config, mode }) {
  const isIsrasymas = mode === "israsymas";
  const activeTooltip = isIsrasymas && config.israsymasTooltip ? config.israsymasTooltip : config.tooltip;
  const activeVideoUrl = isIsrasymas ? config.israsymasVideoUrl : config.videoUrl;
  const activeShowInstructions = isIsrasymas ? !!config.israsymasShowInstructions : !!config.showInstructions;

  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [instrOpen, setInstrOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);

  // Форма создания
  const [form, setForm] = useState({});
  const [useForAll, setUseForAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Редактирование
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editUseForAll, setEditUseForAll] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Actions
  const [verifyingId, setVerifyingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // ─── Пустая форма ───
  const emptyForm = useCallback(() => {
    const f = { label: "", company_code: "" };
    config.fields.forEach((fd) => { f[fd.key] = ""; });
    return f;
  }, [config]);

  // ─── Load ───
  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(BASE_URL(provider), { withCredentials: true });
      const all = Array.isArray(data) ? data : [];
      setKeys(isIsrasymas ? all.filter((k) => k.company_code === "__israsymas__") : all.filter((k) => k.company_code !== "__israsymas__"));
    } catch (e) {
      console.error(`Failed to load ${provider} keys:`, e);
    } finally {
      setLoading(false);
    }
  }, [provider, isIsrasymas]);

  useEffect(() => {
    loadKeys();
    setForm(emptyForm());
    setUseForAll(false);
    setError("");
    setSuccess(false);
  }, [loadKeys, emptyForm]);

  // ─── Create ───
  const handleCreate = async () => {
    setError("");
    setSuccess(false);

    if (isIsrasymas && keys.length > 0) {
      setError("Jau turite sukurtą API raktą išrašomoms sąskaitoms. Redaguokite arba ištrinkite ir sukurkite naują.");
      return;
    }

    const code = isIsrasymas ? "__israsymas__" : (useForAll ? "__all__" : (form.company_code || "").trim());
    if (!isIsrasymas && !useForAll && !code) {
      setError("Įmonės kodas yra privalomas.");
      return;
    }

    for (const fd of config.fields) {
      if (fd.required && !(form[fd.key] || "").trim()) {
        setError(`${fd.label} yra privalomas.`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        label: isIsrasymas ? "Sąskaitų išrašymas" : (form.label || "").trim(),
        company_code: code,
        use_for_all: isIsrasymas ? false : useForAll,
      };
      config.fields.forEach((fd) => {
        payload[fd.key] = (form[fd.key] || "").trim();
      });

      const { data } = await api.post(BASE_URL(provider), payload, { withCredentials: true });
      setKeys((prev) => [...prev, data]);
      setForm(emptyForm());
      setUseForAll(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      const resp = e?.response?.data;
      let msg = resp?.detail || "Nepavyko sukurti.";
      if (typeof msg === "object") try { msg = JSON.stringify(msg); } catch { msg = "Klaida."; }
      setError(String(msg));
    } finally {
      setSaving(false);
    }
  };

  // ─── Verify ───
  const handleVerify = async (id) => {
    setVerifyingId(id);
    try {
      const { data } = await api.post(`${BASE_URL(provider)}${id}/verify/`, {}, { withCredentials: true });
      setKeys((prev) => prev.map((k) => (k.id === id ? data : k)));
    } catch (e) {
      console.error("Verify failed:", e);
    } finally {
      setVerifyingId(null);
    }
  };

  // ─── Delete ───
  const handleDelete = async (id) => {
    if (!window.confirm("Ar tikrai norite ištrinti šį API raktą?")) return;
    setDeletingId(id);
    try {
      await api.delete(`${BASE_URL(provider)}${id}/`, { withCredentials: true });
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (e) {
      alert(e?.response?.data?.detail || "Nepavyko ištrinti.");
    } finally {
      setDeletingId(null);
    }
  };

  // ─── Toggle active ───
  const handleToggleActive = async (id, isActive) => {
    try {
      const { data } = await api.patch(
        `${BASE_URL(provider)}${id}/`,
        { is_active: !isActive },
        { withCredentials: true }
      );
      setKeys((prev) => prev.map((k) => (k.id === id ? data : k)));
    } catch (e) {
      console.error("Toggle failed:", e);
    }
  };

  // ─── Edit ───
  const openEdit = (item) => {
    setEditingId(item.id);
    const f = {
      label: item.label || "",
      company_code: item.company_code === "__all__" ? "" : (item.company_code || ""),
    };
    config.fields.forEach((fd) => { f[fd.key] = ""; });
    setEditForm(f);
    setEditUseForAll(item.use_for_all || item.company_code === "__all__");
    setEditError("");
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    setEditError("");

    const code = isIsrasymas ? "__israsymas__" : (editUseForAll ? "__all__" : (editForm.company_code || "").trim());
    if (!isIsrasymas && !editUseForAll && !code) {
      setEditError("Įmonės kodas yra privalomas.");
      return;
    }

    setEditSaving(true);
    try {
      const payload = {
        label: (editForm.label || "").trim(),
        company_code: code,
        use_for_all: editUseForAll,
      };
      config.fields.forEach((fd) => {
        const val = (editForm[fd.key] || "").trim();
        if (val) payload[fd.key] = val;
      });

      const { data } = await api.patch(
        `${BASE_URL(provider)}${editingId}/`,
        payload,
        { withCredentials: true }
      );
      setKeys((prev) => prev.map((k) => (k.id === editingId ? data : k)));
      setEditDialogOpen(false);
    } catch (e) {
      const resp = e?.response?.data;
      let msg = resp?.detail || "Nepavyko atnaujinti.";
      if (typeof msg === "object") try { msg = JSON.stringify(msg); } catch { msg = "Klaida."; }
      setEditError(String(msg));
    } finally {
      setEditSaving(false);
    }
  };

  // ─── Status chip ───
  const StatusChip = ({ item }) => {
    if (item.last_ok === true) {
      return (
        <Chip size="small" label="Patikrintas ✓"
          sx={{ fontWeight: 600, backgroundColor: alpha("#4caf50", 0.1), color: "success.dark",
                border: "1px solid", borderColor: "success.main" }} />
      );
    }
    if (item.last_ok === false) {
      return (
        <Chip size="small" label="Klaida ✗"
          sx={{ fontWeight: 600, backgroundColor: alpha("#f44336", 0.1), color: "error.dark",
                border: "1px solid", borderColor: "error.main" }} />
      );
    }
    return (
      <Chip size="small" label="Nepatikrintas"
        sx={{ fontWeight: 600, backgroundColor: alpha("#ff9800", 0.1), color: "warning.dark",
              border: "1px solid", borderColor: "warning.main" }} />
    );
  };

  // ─── Credential fields renderer ───
  const renderCredFields = (fields, values, onChange, disabled, isEdit = false) => (
    <Grid2 container spacing={2}>
      {fields.map((fd) => (
        <Grid2 key={fd.key} size={{ xs: 12, md: fd.fullWidth ? 12 : Math.max(4, Math.floor(12 / fields.length)) }}>
          <TextField
            label={isEdit ? `${fd.label} (palikite tuščią jei nekeičiate)` : fd.label}
            size="small"
            fullWidth
            required={!isEdit && fd.required}
            value={values[fd.key] || ""}
            onChange={(e) => onChange((p) => ({ ...p, [fd.key]: e.target.value }))}
            placeholder={isEdit ? "Palikite tuščią jei nekeičiate" : (fd.placeholder || "")}
            disabled={disabled}
            type={fd.type || "text"}
            autoComplete={fd.type === "password" ? "new-password" : "off"}
            sx={{ backgroundColor: "#fff" }}
          />
        </Grid2>
      ))}
    </Grid2>
  );

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      {/* Заголовок */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, flexWrap: "wrap" }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {config.title}
        </Typography>
        <Tooltip arrow enterTouchDelay={0} leaveTouchDelay={4000} title={activeTooltip}>
          <HelpOutlineIcon fontSize="small" sx={{ color: "text.secondary" }} />
        </Tooltip>
        {(activeShowInstructions || activeVideoUrl) && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, ml: 1 }}>
            {activeShowInstructions && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ textDecoration: "none", cursor: "pointer", fontWeight: 600, "&:hover": { textDecoration: "underline" } }}
                  onClick={() => setInstrOpen(true)}
                >
                  Kur rasti?
                </Typography>
              </Box>
            )}
            {activeVideoUrl && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <PlayCircleIcon sx={{ fontSize: 20, color: "error.main" }} />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ textDecoration: "none", cursor: "pointer", fontWeight: 600, "&:hover": { textDecoration: "underline" } }}
                  onClick={() => setVideoOpen(true)}
                >
                  Video instrukcija
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* ─── Форма создания ─── */}
      <Box
        sx={{
          border: "1px solid", borderColor: "divider", borderRadius: 2,
          p: 2.5, mb: 3, backgroundColor: "grey.50",
        }}
      >
        <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
          Naujas API raktas
        </Typography>

        {!isIsrasymas && (
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 2 }}>
            <Switch
              checked={useForAll}
              onChange={(e) => {
                const checked = e.target.checked;
                setUseForAll(checked);
                setForm((p) => ({ ...p, label: checked ? "Visoms įmonėms" : "" }));
              }}
              disabled={saving}
            />
            <Box sx={{ pt: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Naudoti visoms įmonėms
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Šis bendras raktas bus naudojamas, kai nėra atskiro rakto įmonei, kurios dokumentus eksportuojate
              </Typography>
            </Box>
          </Box>
        )}

        {!isIsrasymas && (
          <Grid2 container spacing={2} sx={{ mb: 2 }}>
            <Grid2 size={{ xs: 12, md: 4 }}>
              <TextField
                label="Įmonės pavadinimas"
                size="small"
                fullWidth
                value={form.label || ""}
                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                placeholder='pvz. "UAB Mano Įmonė"'
                disabled={saving || useForAll}
                autoComplete="off"
                sx={{ backgroundColor: useForAll ? "grey.200" : "#fff", opacity: useForAll ? 0.5 : 1 }}
              />
            </Grid2>
            <Grid2 size={{ xs: 12, md: 4 }}>
              <TextField
                label="Įmonės kodas"
                size="small"
                fullWidth
                required={!useForAll}
                value={form.company_code || ""}
                onChange={(e) => setForm((p) => ({ ...p, company_code: e.target.value }))}
                placeholder="pvz. 123456789"
                disabled={saving || useForAll}
                autoComplete="off"
                sx={{ backgroundColor: useForAll ? "grey.200" : "#fff", opacity: useForAll ? 0.5 : 1 }}
              />
            </Grid2>
          </Grid2>
        )}

        {renderCredFields(config.fields, form, setForm, saving)}

        <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 2 }}>
          <Button variant="contained" onClick={handleCreate} disabled={saving}>
            {saving ? "Tikrinama..." : "Išsaugoti ir patikrinti"}
          </Button>
        </Box>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        {success && (
          <Alert severity="success" sx={{ mt: 2 }}>
            API raktas sėkmingai išsaugotas ir patikrintas!
          </Alert>
        )}
      </Box>

      {/* ─── Список ─── */}
      <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
        Išsaugoti API raktai
      </Typography>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : keys.length === 0 ? (
        <Box
          sx={{
            textAlign: "center", py: 5,
            border: "2px dashed", borderColor: "divider", borderRadius: 2,
            backgroundColor: "grey.50",
          }}
        >
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Nėra išsaugotų API raktų
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
            Sukurkite pirmąjį raktą aukščiau
          </Typography>
        </Box>
      ) : (
        <Stack spacing={2}>
          {keys.map((item) => (
            <Box
              key={item.id}
              sx={{
                border: "1px solid", borderColor: "divider", borderRadius: 2,
                overflow: "hidden", transition: "all 0.2s",
                opacity: item.is_active ? 1 : 0.6, "&:hover": { boxShadow: 2 },
              }}
            >
              {/* Header */}
              <Box
                sx={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  px: 2, py: 1.5, backgroundColor: "grey.50",
                  borderBottom: "1px solid", borderColor: "divider",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <StatusChip item={item} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {item.label || item.company_code}
                  </Typography>
                  {!isIsrasymas && item.use_for_all && (
                    <Chip label="Visoms įmonėms" size="small" color="primary" variant="outlined" sx={{ fontWeight: 600, fontSize: 10 }} />
                  )}
                </Box>

                <Stack direction="row" spacing={0.5} alignItems="center">
                  {!isIsrasymas && (
                    <Tooltip title={item.is_active ? "Išjungti" : "Įjungti"}>
                      <Switch
                        size="small"
                        checked={!!item.is_active}
                        onChange={() => handleToggleActive(item.id, item.is_active)}
                      />
                    </Tooltip>
                  )}
                  <Tooltip title="Patikrinti">
                    <IconButton size="small" onClick={() => handleVerify(item.id)}
                      disabled={verifyingId === item.id}
                      sx={{ backgroundColor: "white", "&:hover": { backgroundColor: "grey.100" } }}>
                      {verifyingId === item.id ? <CircularProgress size={16} /> : <VerifiedIcon fontSize="small" color="primary" />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Redaguoti">
                    <IconButton size="small" onClick={() => openEdit(item)}
                      sx={{ backgroundColor: "white", "&:hover": { backgroundColor: "grey.100" } }}>
                      <EditIcon fontSize="small" color="primary" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Ištrinti">
                    <IconButton size="small" onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      sx={{ backgroundColor: "white", "&:hover": { backgroundColor: "error.50" } }}>
                      <DeleteOutlineIcon fontSize="small" color="error" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Box>

              {/* Body */}
              <Box sx={{ px: 2, py: 1.5, backgroundColor: "white" }}>
                <Grid2 container spacing={2}>
                  {!isIsrasymas && (
                    <Grid2 size={{ xs: 12, sm: 4 }}>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>Įmonės kodas</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {item.company_code === "__all__" ? "Visos įmonės" : item.company_code}
                      </Typography>
                    </Grid2>
                  )}
                  <Grid2 size={{ xs: 12, sm: 4 }}>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>Raktas / Prisijungimas</Typography>
                    <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600 }}>
                      {"••••••••" + (item.key_suffix || "****")}
                    </Typography>
                  </Grid2>
                  <Grid2 size={{ xs: 12, sm: 4 }}>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>Patikrintas</Typography>
                    <Typography variant="body2">
                      {item.verified_at ? new Date(item.verified_at).toLocaleString("lt-LT") : "—"}
                    </Typography>
                  </Grid2>
                </Grid2>

                {item.last_ok === false && item.last_error && (
                  <Alert severity="error" sx={{ mt: 1.5, py: 0.5 }} variant="outlined">
                    {item.last_error}
                  </Alert>
                )}
              </Box>
            </Box>
          ))}
        </Stack>
      )}

      {/* ─── Edit Dialog ─── */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth disableScrollLock>
        <DialogTitle>Redaguoti API raktą</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {!isIsrasymas && (
              <>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Switch
                    checked={editUseForAll}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setEditUseForAll(checked);
                      setEditForm((p) => ({ ...p, label: checked ? "Visoms įmonėms" : "" }));
                    }}
                    disabled={editSaving}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Naudoti visoms įmonėms
                  </Typography>
                </Box>
                <TextField
                  label="Įmonės pavadinimas"
                  fullWidth
                  value={editForm.label || ""}
                  onChange={(e) => setEditForm((p) => ({ ...p, label: e.target.value }))}
                  disabled={editSaving}
                />
                <TextField
                  label="Įmonės kodas"
                  fullWidth
                  required={!editUseForAll}
                  value={editForm.company_code || ""}
                  onChange={(e) => setEditForm((p) => ({ ...p, company_code: e.target.value }))}
                  disabled={editSaving || editUseForAll}
                  autoComplete="off"
                />
              </>
            )}
            {renderCredFields(config.fields, editForm, setEditForm, editSaving, true)}
          </Stack>
          {editError && <Alert severity="error" sx={{ mt: 2 }}>{editError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)} disabled={editSaving}>Atšaukti</Button>
          <Button variant="contained" onClick={handleEditSave} disabled={editSaving}>
            {editSaving ? "Saugoma..." : "Išsaugoti"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Instructions Dialog (Dineta) ─── */}
      {activeShowInstructions && (
        <Dialog open={instrOpen} onClose={() => setInstrOpen(false)} maxWidth="md" disableScrollLock>
          <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            Kur rasti Dineta API duomenis?
            <IconButton size="small" onClick={() => setInstrOpen(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </DialogTitle>
          <DialogContent>
            <Box component="img" src="/Dineta_instrukcija.jpg" alt="Dineta instrukcija"
              sx={{ width: "100%", borderRadius: 2 }} />
          </DialogContent>
        </Dialog>
      )}

      {/* ─── Video Dialog ─── */}
      {activeVideoUrl && (
        <Dialog open={videoOpen} onClose={() => setVideoOpen(false)} maxWidth="md" fullWidth disableScrollLock>
          <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            Video instrukcija
            <IconButton size="small" onClick={() => setVideoOpen(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </DialogTitle>
          <DialogContent>
            <Box sx={{ position: "relative", paddingTop: "56.25%", width: "100%" }}>
              <Box
                component="iframe"
                src={videoOpen ? activeVideoUrl : ""}
                title="Video instrukcija"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                sx={{
                  position: "absolute", top: 0, left: 0,
                  width: "100%", height: "100%", border: "none", borderRadius: 2,
                }}
              />
            </Box>
          </DialogContent>
        </Dialog>
      )}
    </Paper>
  );
}