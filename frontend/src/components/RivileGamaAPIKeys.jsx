/**
 * RivileGamaAPIKeys — компонент управления API ключами Rivile GAMA.
 *
 * Показывается в Nustatymai когда program === "rivile_gama_api".
 * Форма создания + список карточек с действиями.
 *
 * Использование в NustatymaiPage:
 *   import RivileGamaAPIKeys from "../components/RivileGamaAPIKeys";
 *   ...
 *   {program === "rivile_gama_api" && <RivileGamaAPIKeys />}
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
import { api } from "../api/endpoints";

const BASE_URL = "/settings/rivile-gama-api/keys/";

export default function RivileGamaAPIKeys() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);

  // Форма
  const [form, setForm] = useState({ label: "", company_code: "", api_key: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Редактирование
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ label: "", company_code: "", api_key: "" });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Проверка/удаление
  const [verifyingId, setVerifyingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // ─── Загрузка списка ───
  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(BASE_URL, { withCredentials: true });
      setKeys(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load Rivile GAMA API keys:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  // ─── Создание ───
  const handleCreate = async () => {
    setError("");
    setSuccess(false);

    const code = (form.company_code || "").trim();
    const key = (form.api_key || "").trim();

    if (!code) {
      setError("Įmonės kodas yra privalomas.");
      return;
    }
    if (!key) {
      setError("API raktas yra privalomas.");
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.post(
        BASE_URL,
        {
          label: (form.label || "").trim(),
          company_code: code,
          api_key: key,
        },
        { withCredentials: true }
      );

      setKeys((prev) => [...prev, data]);
      setForm({ label: "", company_code: "", api_key: "" });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      const resp = e?.response?.data;
      let msg = resp?.detail || resp?.company_code?.[0] || resp?.api_key?.[0] || "Nepavyko sukurti.";
      if (typeof msg === "object") {
        try { msg = JSON.stringify(msg); } catch { msg = "Klaida."; }
      }
      setError(String(msg));
    } finally {
      setSaving(false);
    }
  };

  // ─── Проверка ───
  const handleVerify = async (id) => {
    setVerifyingId(id);
    try {
      const { data } = await api.post(`${BASE_URL}${id}/verify/`, {}, { withCredentials: true });
      setKeys((prev) => prev.map((k) => (k.id === id ? data : k)));
    } catch (e) {
      console.error("Verify failed:", e);
    } finally {
      setVerifyingId(null);
    }
  };

  // ─── Удаление ───
  const handleDelete = async (id) => {
    if (!window.confirm("Ar tikrai norite ištrinti šį API raktą?")) return;
    setDeletingId(id);
    try {
      await api.delete(`${BASE_URL}${id}/`, { withCredentials: true });
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (e) {
      console.error("Delete failed:", e);
      alert(e?.response?.data?.detail || "Nepavyko ištrinti.");
    } finally {
      setDeletingId(null);
    }
  };

  // ─── Toggle active ───
  const handleToggleActive = async (id, isActive) => {
    try {
      const { data } = await api.patch(
        `${BASE_URL}${id}/`,
        { is_active: !isActive },
        { withCredentials: true }
      );
      setKeys((prev) => prev.map((k) => (k.id === id ? data : k)));
    } catch (e) {
      console.error("Toggle failed:", e);
    }
  };

  // ─── Редактирование ───
  const openEdit = (item) => {
    setEditingId(item.id);
    setEditForm({
      label: item.label || "",
      company_code: item.company_code || "",
      api_key: "",  // пустой = не менять
    });
    setEditError("");
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    setEditError("");

    const code = (editForm.company_code || "").trim();
    if (!code) {
      setEditError("Įmonės kodas yra privalomas.");
      return;
    }

    setEditSaving(true);
    try {
      const payload = {
        label: (editForm.label || "").trim(),
        company_code: code,
      };
      const rawKey = (editForm.api_key || "").trim();
      if (rawKey) {
        payload.api_key = rawKey;
      }

      const { data } = await api.patch(
        `${BASE_URL}${editingId}/`,
        payload,
        { withCredentials: true }
      );

      setKeys((prev) => prev.map((k) => (k.id === editingId ? data : k)));
      setEditDialogOpen(false);
    } catch (e) {
      const resp = e?.response?.data;
      let msg = resp?.detail || "Nepavyko atnaujinti.";
      if (typeof msg === "object") {
        try { msg = JSON.stringify(msg); } catch { msg = "Klaida."; }
      }
      setEditError(String(msg));
    } finally {
      setEditSaving(false);
    }
  };

  // ─── Status chip ───
  const StatusChip = ({ item }) => {
    if (item.last_ok === true) {
      return (
        <Chip
          size="small"
          label="Patikrintas ✓"
          sx={{
            fontWeight: 600,
            backgroundColor: alpha("#4caf50", 0.1),
            color: "success.dark",
            border: "1px solid",
            borderColor: "success.main",
          }}
        />
      );
    }
    if (item.last_ok === false) {
      return (
        <Chip
          size="small"
          label="Klaida ✗"
          sx={{
            fontWeight: 600,
            backgroundColor: alpha("#f44336", 0.1),
            color: "error.dark",
            border: "1px solid",
            borderColor: "error.main",
          }}
        />
      );
    }
    return (
      <Chip
        size="small"
        label="Nepatikrintas"
        sx={{
          fontWeight: 600,
          backgroundColor: alpha("#ff9800", 0.1),
          color: "warning.dark",
          border: "1px solid",
          borderColor: "warning.main",
        }}
      />
    );
  };

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      {/* Заголовок */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Rivile GAMA API sąsajos nustatymai
        </Typography>
        <Tooltip
          arrow
          enterTouchDelay={0}
          leaveTouchDelay={4000}
          title="Kiekvienai įmonei (duomenų bazei) reikia atskiro API rakto. API raktą gausite iš savo Rivile GAMA administratoriaus arba ManoRivile portale."
        >
          <HelpOutlineIcon fontSize="small" sx={{ color: "text.secondary" }} />
        </Tooltip>
      </Box>

      {/* ─── Форма создания ─── */}
      <Box
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          p: 2.5,
          mb: 3,
          backgroundColor: "grey.50",
        }}
      >
        <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
          Naujas API raktas
        </Typography>

        <Grid2 container spacing={2}>
          <Grid2 size={{ xs: 12, md: 4 }}>
            <TextField
              label="Pavadinimas"
              size="small"
              fullWidth
              value={form.label}
              onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
              placeholder='pvz. "UAB Mano Įmonė"'
              disabled={saving}
            />
          </Grid2>
          <Grid2 size={{ xs: 12, md: 4 }}>
            <TextField
              label="Įmonės kodas"
              size="small"
              fullWidth
              required
              value={form.company_code}
              onChange={(e) => setForm((p) => ({ ...p, company_code: e.target.value }))}
              placeholder="pvz. 123456789"
              disabled={saving}
            />
          </Grid2>
          <Grid2 size={{ xs: 12, md: 4 }}>
            <TextField
              label="API raktas"
              size="small"
              fullWidth
              required
              value={form.api_key}
              onChange={(e) => setForm((p) => ({ ...p, api_key: e.target.value }))}
              placeholder="Įveskite API raktą"
              disabled={saving}
              type="password"
            />
          </Grid2>
        </Grid2>

        <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 2 }}>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={saving}
          >
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

      {/* ─── Список карточек ─── */}
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
            textAlign: "center",
            py: 5,
            border: "2px dashed",
            borderColor: "divider",
            borderRadius: 2,
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
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 2,
                overflow: "hidden",
                transition: "all 0.2s",
                opacity: item.is_active ? 1 : 0.6,
                "&:hover": { boxShadow: 2 },
              }}
            >
              {/* Header */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  px: 2,
                  py: 1.5,
                  backgroundColor: "grey.50",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <StatusChip item={item} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {item.label || item.company_code}
                  </Typography>
                </Box>

                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Tooltip title={item.is_active ? "Išjungti" : "Įjungti"}>
                    <Switch
                      size="small"
                      checked={!!item.is_active}
                      onChange={() => handleToggleActive(item.id, item.is_active)}
                    />
                  </Tooltip>
                  <Tooltip title="Patikrinti">
                    <IconButton
                      size="small"
                      onClick={() => handleVerify(item.id)}
                      disabled={verifyingId === item.id}
                      sx={{ backgroundColor: "white", "&:hover": { backgroundColor: "grey.100" } }}
                    >
                      {verifyingId === item.id ? (
                        <CircularProgress size={16} />
                      ) : (
                        <VerifiedIcon fontSize="small" color="primary" />
                      )}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Redaguoti">
                    <IconButton
                      size="small"
                      onClick={() => openEdit(item)}
                      sx={{ backgroundColor: "white", "&:hover": { backgroundColor: "grey.100" } }}
                    >
                      <EditIcon fontSize="small" color="primary" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Ištrinti">
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      sx={{ backgroundColor: "white", "&:hover": { backgroundColor: "error.50" } }}
                    >
                      <DeleteOutlineIcon fontSize="small" color="error" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Box>

              {/* Body */}
              <Box sx={{ px: 2, py: 1.5, backgroundColor: "white" }}>
                <Grid2 container spacing={2}>
                  <Grid2 size={{ xs: 12, sm: 4 }}>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Įmonės kodas
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {item.company_code}
                    </Typography>
                  </Grid2>
                  <Grid2 size={{ xs: 12, sm: 4 }}>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      API raktas
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600 }}>
                      {"••••••••" + (item.key_suffix || "****")}
                    </Typography>
                  </Grid2>
                  <Grid2 size={{ xs: 12, sm: 4 }}>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Patikrintas
                    </Typography>
                    <Typography variant="body2">
                      {item.verified_at
                        ? new Date(item.verified_at).toLocaleString("lt-LT")
                        : "—"}
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
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Redaguoti API raktą</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Pavadinimas"
              fullWidth
              value={editForm.label}
              onChange={(e) => setEditForm((p) => ({ ...p, label: e.target.value }))}
              disabled={editSaving}
            />
            <TextField
              label="Įmonės kodas"
              fullWidth
              required
              value={editForm.company_code}
              onChange={(e) => setEditForm((p) => ({ ...p, company_code: e.target.value }))}
              disabled={editSaving}
            />
            <TextField
              label="Naujas API raktas (palikite tuščią jei nekeičiate)"
              fullWidth
              value={editForm.api_key}
              onChange={(e) => setEditForm((p) => ({ ...p, api_key: e.target.value }))}
              disabled={editSaving}
              type="password"
              placeholder="Palikite tuščią jei nekeičiate"
            />
          </Stack>
          {editError && <Alert severity="error" sx={{ mt: 2 }}>{editError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)} disabled={editSaving}>
            Atšaukti
          </Button>
          <Button variant="contained" onClick={handleEditSave} disabled={editSaving}>
            {editSaving ? "Saugoma..." : "Išsaugoti"}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}