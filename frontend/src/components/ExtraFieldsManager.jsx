import React, { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, Alert, Paper, TextField, Stack, Switch,
  FormControlLabel, IconButton, Tooltip, Grid2, Chip, Dialog,
  DialogTitle, DialogContent, DialogActions, CircularProgress,
  FormControl, InputLabel, Select, MenuItem,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { api } from "../api/endpoints";


// ──── Assembly dropdown options (shared with Rivile Gama) ────
const PREKES_ASSEMBLY_OPTIONS = [
  { value: 1, label: "Paprasta" },
  { value: 2, label: "Komplektuojama" },
  { value: 3, label: "Išskaidoma" },
  { value: 4, label: "Generavimai" },
  { value: 5, label: "Sudėtinė" },
  { value: 6, label: "Komplektuojama/Išskaidoma" },
  { value: 7, label: "Mišri" },
  { value: 8, label: "Tara" },
];

// Поля, которые рендерятся как Select вместо TextField
const SELECT_FIELDS = {
  prekes_assembly_pirkimas: PREKES_ASSEMBLY_OPTIONS,
  prekes_assembly_pardavimas: PREKES_ASSEMBLY_OPTIONS,
  paslaugos_assembly_pirkimas: PREKES_ASSEMBLY_OPTIONS,
  paslaugos_assembly_pardavimas: PREKES_ASSEMBLY_OPTIONS,
};


// ──── Маппинг program (Select value) → program_key для API ────
const PROGRAM_TO_KEY = {
  rivile: "rivile",
  rivile_erp: "rivile_erp",
  rivile_gama: "rivile",
  rivile_gama_api: "rivile_gama_api",
  butent: "butent",
  finvalda: "finvalda",
  centas: "centas",
  pragma4: "pragma4",
  dineta: "dineta",
  optimum: "optimum",
  debetas: "debetas",
  pragma3: "pragma3",
  site_pro: "site_pro",
  agnum: "agnum",
};


// ──── Конфигурация полей для каждой программы ────
const PROGRAM_FIELDS_CONFIG = {
  rivile_erp: {
    programLabel: "Rivilė ERP",
    description: "Čia gali nurodyti numatytuosius žurnalo, padalinio ir objekto kodus Rivilė ERP sistemai atskirai pirkimams ir pardavimams.",
    sections: [
      {
        title: "Pirkimams",
        fields: [
          { key: "pirkimas_zurnalo_kodas", label: "Žurnalo kodas" },
          { key: "pirkimas_padalinio_kodas", label: "Padalinio kodas" },
          { key: "pirkimas_objekto_kodas", label: "Objekto kodas" },
        ],
      },
      {
        title: "Pardavimams",
        fields: [
          { key: "pardavimas_zurnalo_kodas", label: "Žurnalo kodas" },
          { key: "pardavimas_padalinio_kodas", label: "Padalinio kodas" },
          { key: "pardavimas_objekto_kodas", label: "Objekto kodas" },
        ],
      },
    ],
  },
  rivile: {
    programLabel: "Rivilė Gama",
    description: "Čia gali nurodyti numatytuosius padalinio, objekto, serijos ir kitus laukus Rivilė Gama programai.",
    sections: [
      {
        title: "Pirkimams",
        fields: [
          { key: "pirkimas_padalinys", label: "Padalinys" },
          { key: "pirkimas_objektas", label: "Objektas" },
          { key: "pirkimas_serija", label: "Serija" },
          { key: "pirkimas_centras", label: "Centras" },
          { key: "pirkimas_atskaitingas_asmuo", label: "Atskaitingas asmuo" },
          { key: "pirkimas_logistika", label: "Logistika" },
          { key: "pirkimas_pinigu_saskaitos_kodas", label: "Apmokėjimo sąskaitos kodas" },
          { key: "pirkimas_saskaitos_rysio_kodas", label: "Sąskaitos ryšio kodas" },
          { key: "pirkimas_prekes_grupe", label: "Prekės grupė" },
          { key: "pirkimas_paslaugos_grupe", label: "Paslaugos grupė" },
          { key: "pirkimas_kodo_grupe", label: "Kodo grupė" },
          { key: "prekes_assembly_pirkimas", label: "Prekės tipas" },
          { key: "paslaugos_assembly_pirkimas", label: "Paslaugos tipas" },
        ],
      },
      {
        title: "Pardavimams",
        fields: [
          { key: "pardavimas_padalinys", label: "Padalinys" },
          { key: "pardavimas_objektas", label: "Objektas" },
          { key: "pardavimas_serija", label: "Serija" },
          { key: "pardavimas_centras", label: "Centras" },
          { key: "pardavimas_atskaitingas_asmuo", label: "Atskaitingas asmuo" },
          { key: "pardavimas_logistika", label: "Logistika" },
          { key: "pardavimas_pinigu_saskaitos_kodas", label: "Apmokėjimo sąskaitos kodas" },
          { key: "pardavimas_saskaitos_rysio_kodas", label: "Sąskaitos ryšio kodas" },
          { key: "pardavimas_prekes_grupe", label: "Prekės grupė" },
          { key: "pardavimas_paslaugos_grupe", label: "Paslaugos grupė" },
          { key: "pardavimas_kodo_grupe", label: "Kodo grupė" },
          { key: "prekes_assembly_pardavimas", label: "Prekės tipas" },
          { key: "paslaugos_assembly_pardavimas", label: "Paslaugos tipas" },
        ],
      },
    ],
  },
  butent: {
    programLabel: "Būtent",
    description: "Nurodykite numatytuosius sandėlio ir operacijos kodus pirkimams ir pardavimams.",
    sections: [
      {
        title: "Pirkimams",
        fields: [
          { key: "pirkimas_sandelis", label: "Sandėlis" },
          { key: "pirkimas_operacija", label: "Operacija" },
        ],
      },
      {
        title: "Pardavimams",
        fields: [
          { key: "pardavimas_sandelis", label: "Sandėlis" },
          { key: "pardavimas_operacija", label: "Operacija" },
        ],
      },
    ],
  },
  finvalda: {
    programLabel: "Finvalda",
    description: "Nurodykite numatytuosius sandėlio, tipo ir žurnalo kodus pirkimams ir pardavimams.",
    sections: [
      {
        title: "Pirkimams",
        fields: [
          { key: "pirkimas_sandelis", label: "Sandėlis" },
          { key: "pirkimas_zurnalas", label: "Žurnalas" },
          { key: "pirkimas_tipas", label: "Tipas" },
          { key: "pirkimas_padalinys", label: "Padalinys" },
          { key: "pirkimas_darbuotojas", label: "Darbuotojas" },
        ],
      },
      {
        title: "Pardavimams",
        fields: [
          { key: "pardavimas_sandelis", label: "Sandėlis" },
          { key: "pardavimas_zurnalas", label: "Žurnalas" },
          { key: "pardavimas_tipas", label: "Tipas" },
          { key: "pardavimas_padalinys", label: "Padalinys" },
          { key: "pardavimas_darbuotojas", label: "Darbuotojas" },
        ],
      },
    ],
  },
  centas: {
    programLabel: "Centas",
    description: "Nurodykite numatytuosius sandėlio ir kaštų centro laukus pirkimams ir pardavimams.",
    sections: [
      {
        title: "Pirkimams",
        fields: [
          { key: "pirkimas_sandelis", label: "Sandėlis" },
          { key: "pirkimas_kastu_centras", label: "Kaštų centras" },
        ],
      },
      {
        title: "Pardavimams",
        fields: [
          { key: "pardavimas_sandelis", label: "Sandėlis" },
          { key: "pardavimas_kastu_centras", label: "Kaštų centras" },
        ],
      },
    ],
  },
  pragma4: {
    programLabel: "Pragma 4.0",
    description: "Nurodykite numatytuosius sandėlio ir kitus laukus pirkimams ir pardavimams.",
    sections: [
      {
        title: "Pirkimams",
        fields: [
          { key: "pirk_sandelio_kodas", label: "Sandėlio kodas" },
          { key: "pirk_projekto_kodas", label: "Projekto kodas" },
          { key: "pirk_centro_kodas", label: "Centro kodas" },
          { key: "pirk_dk_schemos_kodas", label: "DK schemos kodas" },
        ],
      },
      {
        title: "Pardavimams",
        fields: [
          { key: "pard_sandelio_kodas", label: "Sandėlio kodas" },
          { key: "pard_projekto_kodas", label: "Projekto kodas" },
          { key: "pard_centro_kodas", label: "Centro kodas" },
          { key: "pard_dk_schemos_kodas", label: "DK schemos kodas" },
        ],
      },
    ],
  },
  dineta: {
    programLabel: "Dineta",
    description: "Nurodykite numatytuosius sandėlio laukus pirkimams ir pardavimams.",
    sections: [
      {
        title: "Pirkimams",
        fields: [{ key: "pirk_sandelio_kodas", label: "Sandėlio kodas" }],
      },
      {
        title: "Pardavimams",
        fields: [{ key: "pard_sandelio_kodas", label: "Sandėlio kodas" }],
      },
    ],
  },
  optimum: {
    programLabel: "Optimum",
    description: "Nurodykite numatytuosius laukus pirkimams ir pardavimams.",
    sections: [
      {
        title: "Pirkimams",
        fields: [
          { key: "pirk_prekes_tipas", label: "Prekės tipas" },
          { key: "pirk_prekes_grupe", label: "Prekės grupė" },
          { key: "pirk_sandelio_kodas", label: "Sandėlio kodas" },
          { key: "tiekejo_grupe", label: "Tiekėjo grupė" },
          { key: "pirk_skyriaus_kodas", label: "Skyriaus kodas" },
          { key: "pirk_projekto_kodas", label: "Projekto kodas" },
          { key: "pirk_atsakingo_darb_kodas", label: "Atsakingo darbuotojo kodas" },
        ],
      },
      {
        title: "Pardavimams",
        fields: [
          { key: "pard_prekes_tipas", label: "Prekės tipas" },
          { key: "pard_prekes_grupe", label: "Prekės grupė" },
          { key: "pard_sandelio_kodas", label: "Sandėlio kodas" },
          { key: "pirkejo_grupe", label: "Pirkėjo grupė" },
          { key: "pard_skyriaus_kodas", label: "Skyriaus kodas" },
          { key: "pard_projekto_kodas", label: "Projekto kodas" },
          { key: "pard_atsakingo_darb_kodas", label: "Atsakingo darbuotojo kodas" },
        ],
      },
    ],
  },
  debetas: {
    programLabel: "Debetas",
    description: "Nurodykite numatytuosius filialo, padalinio, objekto ir atsakingų asmenų laukus.",
    sections: [
      {
        title: "Pirkimams",
        fields: [
          { key: "pirkimas_filialas", label: "Filialas" },
          { key: "pirkimas_padalinys", label: "Padalinys" },
          { key: "pirkimas_objektas", label: "Objektas" },
          { key: "pirkimas_materialiai_atsakingas_asmuo", label: "Materialiai atsakingas asmuo" },
          { key: "pirkimas_atskaitingas_asmuo", label: "Atskaitingas asmuo" },
        ],
      },
      {
        title: "Pardavimams",
        fields: [
          { key: "pardavimas_filialas", label: "Filialas" },
          { key: "pardavimas_padalinys", label: "Padalinys" },
          { key: "pardavimas_objektas", label: "Objektas" },
          { key: "pardavimas_materialiai_atsakingas_asmuo", label: "Materialiai atsakingas asmuo" },
          { key: "pardavimas_atskaitingas_asmuo", label: "Atskaitingas asmuo" },
        ],
      },
    ],
  },
  pragma3: {
    programLabel: "Pragma 3.2",
    description: "Nurodykite numatytuosius sandėlio, korespondencijos schemos ir projekto kodus.",
    sections: [
      {
        title: "Pirkimams",
        fields: [
          { key: "pirkimas_sandelis", label: "Sandėlis" },
          { key: "pirkimas_korespondencija", label: "Korespondencijos schema" },
          { key: "pirkimas_projektas", label: "Projekto kodas" },
        ],
      },
      {
        title: "Pardavimams",
        fields: [
          { key: "pardavimas_sandelis", label: "Sandėlis" },
          { key: "pardavimas_korespondencija", label: "Korespondencijos schema" },
          { key: "pardavimas_projektas", label: "Projekto kodas" },
        ],
      },
    ],
  },
  site_pro: {
    programLabel: "Site.pro (B1)",
    description: "Nurodykite numatytuosius sandėlio ir objekto laukus pirkimams ir pardavimams.",
    sections: [
      {
        title: "Pirkimams",
        fields: [
          { key: "pirkimas_prekes_grupe", label: "Prekės grupė" },
          { key: "pirkimas_sandelis", label: "Sandėlis" },
          { key: "pirkimas_darbuotojas", label: "Darbuotojas" },
          { key: "pirkimas_kastu_centras", label: "Kaštų centras" },
        ],
      },
      {
        title: "Pardavimams",
        fields: [
          { key: "pardavimas_prekes_grupe", label: "Prekės grupė" },
          { key: "pardavimas_sandelis", label: "Sandėlis" },
          { key: "pardavimas_darbuotojas", label: "Darbuotojas" },
          { key: "pardavimas_kastu_centras", label: "Kaštų centras" },
        ],
      },
    ],
  },
  agnum: {
    programLabel: "Agnum",
    description: "Nurodykite numatytuosius sandėlio ir grupės laukus pirkimams ir pardavimams.",
    sections: [
      {
        title: "Pirkimams",
        fields: [
          { key: "pirkimas_grupe", label: "Prekės grupė" },
          { key: "pirkimas_sandelis", label: "Sandėlio kodas" },
          { key: "pirkimas_objektas", label: "Objekto kodas" },
        ],
      },
      {
        title: "Pardavimams",
        fields: [
          { key: "pardavimas_grupe", label: "Prekės grupė" },
          { key: "pardavimas_sandelis", label: "Sandėlio kodas" },
          { key: "pardavimas_objektas", label: "Objekto kodas" },
        ],
      },
    ],
  },
};

// Алиасы
PROGRAM_FIELDS_CONFIG.rivile_gama = PROGRAM_FIELDS_CONFIG.rivile;
PROGRAM_FIELDS_CONFIG.rivile_gama_api = PROGRAM_FIELDS_CONFIG.rivile;


// ──── Helpers ────
function getTotalFieldsCount(programKey) {
  const config = PROGRAM_FIELDS_CONFIG[programKey];
  if (!config) return 0;
  return config.sections.reduce((sum, s) => sum + s.fields.length, 0);
}

function emptyFieldsFor(programKey) {
  const config = PROGRAM_FIELDS_CONFIG[programKey];
  if (!config) return {};
  const result = {};
  for (const sec of config.sections) {
    for (const f of sec.fields) {
      if (SELECT_FIELDS[f.key]) {
        result[f.key] = SELECT_FIELDS[f.key][0]?.value ?? "";
      } else {
        result[f.key] = "";
      }
    }
  }
  return result;
}


// ════════════════════════════════════════════════════════════════
// Модальное окно ТОЛЬКО для редактирования
// ════════════════════════════════════════════════════════════════
function ProfileEditDialog({ open, onClose, programKey, editData, onSaved }) {
  const config = PROGRAM_FIELDS_CONFIG[programKey];

  const [forAll, setForAll] = useState(false);
  const [companyCode, setCompanyCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [fields, setFields] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !editData) return;
    setError("");
    setSaving(false);

    setForAll(editData.company_code === "__all__");
    setCompanyCode(editData.company_code === "__all__" ? "" : editData.company_code);
    setCompanyName(editData.company_name || "");
    setFields({ ...emptyFieldsFor(programKey), ...(editData.fields || {}) });
  }, [open, editData, programKey]);

  const handleFieldChange = (key) => (e) => {
    setFields((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const handleSave = async () => {
    setError("");

    const targetCode = forAll ? "__all__" : companyCode.trim();

    setSaving(true);
    try {
      await api.patch(
        `/extra-fields/${PROGRAM_TO_KEY[programKey]}/${targetCode}/`,
        {
          company_name: forAll ? "" : companyName.trim(),
          fields,
        },
        { withCredentials: true }
      );

      onSaved();
      onClose();
    } catch (e) {
      const resp = e?.response?.data;
      let msg = resp?.detail || resp?.non_field_errors || "Nepavyko išsaugoti.";
      if (typeof msg === "object") {
        try { msg = JSON.stringify(msg); } catch { msg = "Nepavyko išsaugoti."; }
      }
      if (Array.isArray(msg)) msg = msg.join(", ");
      setError(String(msg));
    } finally {
      setSaving(false);
    }
  };

  if (!config) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth disableScrollLock>
      <DialogTitle sx={{ fontWeight: 600 }}>
        Redaguoti profilį
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
          {config.programLabel}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {/* Toggle: visoms įmonėms (disabled in edit mode) */}
        <FormControlLabel
          control={<Switch checked={forAll} disabled />}
          label={
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Taikyti visų kontrahentų dokumentams
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Nustatymai bus priskiriami visų kontrahentų dokumentams eksporto metu
              </Typography>
            </Box>
          }
          sx={{ mb: 2 }}
        />

        {/* Контрагент */}
        <Box
          sx={{
            opacity: forAll ? 0.4 : 1,
            pointerEvents: forAll ? "none" : "auto",
            mb: 3, p: 2,
            border: "1px solid", borderColor: "divider", borderRadius: 2,
            backgroundColor: forAll ? "grey.100" : "grey.50",
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
            Taikyti tik šio kontrahento dokumentams
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Įmonės kodas"
              value={companyCode}
              size="small"
              disabled
              sx={{ minWidth: 200 }}
            />
            <TextField
              label="Įmonės pavadinimas"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              size="small"
              disabled={forAll}
              sx={{ flexGrow: 1 }}
            />
          </Stack>
        </Box>

        {/* Поля программы — 2 колонки: Pirkimas / Pardavimas */}
        <Grid2 container spacing={3}>
          {config.sections.map((section) => (
            <Grid2 key={section.title} size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
                {section.title}
              </Typography>
              <Stack spacing={1.5}>
                {section.fields.map((f) => {
                  const selectOptions = SELECT_FIELDS[f.key];
                  if (selectOptions) {
                    return (
                      <FormControl key={f.key} size="small" fullWidth disabled={saving}>
                        <InputLabel>{f.label}</InputLabel>
                        <Select
                          label={f.label}
                          value={fields[f.key] ?? selectOptions[0]?.value ?? ""}
                          onChange={handleFieldChange(f.key)}
                          MenuProps={{ disableScrollLock: true }}
                        >
                          {selectOptions.map((opt) => (
                            <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    );
                  }
                  return (
                    <TextField key={f.key} label={f.label}
                      value={fields[f.key] || ""} onChange={handleFieldChange(f.key)}
                      fullWidth size="small" disabled={saving} />
                  );
                })}
              </Stack>
            </Grid2>
          ))}
        </Grid2>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving}>Atšaukti</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? <CircularProgress size={20} /> : "Išsaugoti"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}


// ════════════════════════════════════════════════════════════════
// Карточка профиля
// ════════════════════════════════════════════════════════════════
function ProfileCard({ profile, programKey, onEdit, onDelete }) {
  const totalFields = getTotalFieldsCount(programKey);

  return (
    <Box
      sx={{
        border: "1px solid", borderColor: "divider", borderRadius: 2,
        overflow: "hidden", transition: "all 0.2s", "&:hover": { boxShadow: 2 },
      }}
    >
      <Box
        sx={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          px: 2, py: 1.5, backgroundColor: "grey.50",
          borderBottom: "1px solid", borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          {profile.company_code === "__all__" ? (
            <Chip label="Visos įmonės" size="small"
              sx={{ fontWeight: 700, backgroundColor: "primary.main", color: "white" }} />
          ) : (
            <Chip label={profile.company_code} size="small"
              sx={{ fontWeight: 700, backgroundColor: "success.main", color: "white" }} />
          )}
          {profile.company_code !== "__all__" && profile.company_name && (
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: "text.primary" }}>
              {profile.company_name}
            </Typography>
          )}
        </Box>

        <Stack direction="row" spacing={1} alignItems="center">
          <Chip label={`${profile.fields_count || 0} / ${totalFields}`}
            size="small" variant="outlined" sx={{ fontWeight: 600, fontSize: "0.75rem" }} />
          <IconButton size="small" onClick={() => onEdit(profile)}
            sx={{ backgroundColor: "white", "&:hover": { backgroundColor: "grey.100" } }}>
            <EditIcon fontSize="small" color="primary" />
          </IconButton>
          <IconButton size="small" onClick={() => onDelete(profile)}
            sx={{ backgroundColor: "white", "&:hover": { backgroundColor: "error.50" } }}
            aria-label="Ištrinti">
            <DeleteOutlineIcon fontSize="small" color="error" />
          </IconButton>
        </Stack>
      </Box>
    </Box>
  );
}


// ════════════════════════════════════════════════════════════════
// ГЛАВНЫЙ КОМПОНЕНТ
// ════════════════════════════════════════════════════════════════
export default function ExtraFieldsManager({ program }) {
  const programKey = PROGRAM_TO_KEY[program] || null;
  const config = programKey ? PROGRAM_FIELDS_CONFIG[programKey] : null;

  const [profiles, setProfiles] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // ──── Inline create form state ────
  const [createForAll, setCreateForAll] = useState(false);
  const [createCompanyCode, setCreateCompanyCode] = useState("");
  const [createCompanyName, setCreateCompanyName] = useState("");
  const [createFields, setCreateFields] = useState({});
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [overwriteWarning, setOverwriteWarning] = useState(null);

  const INITIAL_LIMIT = 5;
  const MORE_LIMIT = 20;

  // ──── Reset create form ────
  const resetCreateForm = useCallback(() => {
    setCreateForAll(false);
    setCreateCompanyCode("");
    setCreateCompanyName("");
    setCreateFields(emptyFieldsFor(programKey));
    setCreateError("");
    setOverwriteWarning(null);
  }, [programKey]);

  // ──── Загрузка списка ────
  const loadProfiles = useCallback(async (offset = 0, limit = INITIAL_LIMIT, append = false) => {
    if (!programKey) { setProfiles([]); setTotal(0); return; }

    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");

    try {
      const { data } = await api.get(
        `/extra-fields/${programKey}/?offset=${offset}&limit=${limit}`,
        { withCredentials: true }
      );
      if (append) {
        setProfiles((prev) => [...prev, ...(data.items || [])]);
      } else {
        setProfiles(data.items || []);
      }
      setTotal(data.total || 0);
    } catch (e) {
      console.error("Failed to load extra-fields profiles:", e);
      setError("Nepavyko užkrauti profilių.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [programKey]);

  useEffect(() => {
    loadProfiles(0, INITIAL_LIMIT, false);
    resetCreateForm();
  }, [loadProfiles, resetCreateForm]);

  const handleLoadMore = () => {
    loadProfiles(profiles.length, MORE_LIMIT, true);
  };

  // ──── Create form handlers ────
  const handleCreateFieldChange = (key) => (e) => {
    setCreateFields((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const handleCreateSave = async () => {
    setCreateError("");

    if (!createForAll && !createCompanyCode.trim()) {
      setCreateError("Įmonės kodas privalomas.");
      return;
    }

    const targetCode = createForAll ? "__all__" : createCompanyCode.trim();

    setCreateSaving(true);
    try {
      // Проверка дубликатов
      const { data: dupCheck } = await api.post(
        `/extra-fields/${PROGRAM_TO_KEY[programKey]}/check-duplicate/`,
        { company_code: targetCode },
        { withCredentials: true }
      );

      if (dupCheck.exists && !overwriteWarning) {
        setOverwriteWarning({
          fields_count: dupCheck.fields_count,
          non_empty_fields: dupCheck.non_empty_fields || [],
          company_name: dupCheck.company_name || "",
        });
        setCreateSaving(false);
        return;
      }

      await api.patch(
        `/extra-fields/${PROGRAM_TO_KEY[programKey]}/${targetCode}/`,
        {
          company_name: createForAll ? "" : createCompanyName.trim(),
          fields: createFields,
        },
        { withCredentials: true }
      );

      // Refresh list and reset form
      loadProfiles(0, Math.max(profiles.length, INITIAL_LIMIT), false);
      resetCreateForm();
      setSuccess("Išsaugota!");
      setTimeout(() => setSuccess(""), 2500);
    } catch (e) {
      const resp = e?.response?.data;
      let msg = resp?.detail || resp?.non_field_errors || "Nepavyko išsaugoti.";
      if (typeof msg === "object") {
        try { msg = JSON.stringify(msg); } catch { msg = "Nepavyko išsaugoti."; }
      }
      if (Array.isArray(msg)) msg = msg.join(", ");
      setCreateError(String(msg));
    } finally {
      setCreateSaving(false);
    }
  };

  // ──── Edit handlers ────
  const handleEdit = async (profile) => {
    setLoadingDetail(true);
    try {
      const { data } = await api.get(
        `/extra-fields/${programKey}/${profile.company_code}/`,
        { withCredentials: true }
      );
      setEditData(data);
      setDialogOpen(true);
    } catch (e) {
      console.error("Failed to load profile detail:", e);
      setError("Nepavyko užkrauti profilio.");
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleDelete = async (profile) => {
    const label = profile.company_code === "__all__"
      ? '"visoms įmonėms"'
      : `"${profile.company_name || profile.company_code}"`;
    if (!window.confirm(`Ar tikrai norite ištrinti profilį ${label}?`)) return;

    try {
      await api.delete(`/extra-fields/${programKey}/${profile.company_code}/`, { withCredentials: true });
      setProfiles((prev) => prev.filter((p) => p.company_code !== profile.company_code));
      setTotal((prev) => Math.max(0, prev - 1));
      setSuccess("Profilis ištrintas.");
      setTimeout(() => setSuccess(""), 2500);
    } catch (e) {
      console.error("Failed to delete profile:", e);
      setError("Nepavyko ištrinti profilio.");
    }
  };

  const handleSaved = useCallback(() => {
    loadProfiles(0, Math.max(profiles.length, INITIAL_LIMIT), false);
    setSuccess("Išsaugota!");
    setTimeout(() => setSuccess(""), 2500);
  }, [loadProfiles, profiles.length]);

  if (!config) return null;

  const hasMore = profiles.length < total;

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      {/* ──── Header ──── */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {config.programLabel} papildomi laukai
        </Typography>
        <Tooltip arrow enterTouchDelay={0} leaveTouchDelay={4000}
          title="Galite nusistatyti papildomus laukus atskirai tam tikroms įmonėms arba bendrai visoms įmonėms. Reišmės dokumentams priskiriamos eksporto metu. Sistema pirma ieškos profilio pagal kontrahento kodą, o jei neras, naudos bendrą 'visoms įmonėms' profilį.">
          <HelpOutlineIcon fontSize="small" sx={{ color: "text.secondary" }} />
        </Tooltip>
        {total > 0 && (
          <Chip label={total} size="small" sx={{ fontWeight: 600 }} />
        )}
      </Box>

      <Typography variant="body2" sx={{ mb: 3, color: "text.secondary" }}>
        {config.description}
      </Typography>

      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* INLINE CREATE FORM */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <Box
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          overflow: "hidden",
          mb: 4,
        }}
      >
        {/* Toggle: visoms įmonėms */}
        <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider", backgroundColor: "grey.50" }}>
          <FormControlLabel
            control={
              <Switch
                checked={createForAll}
                onChange={(e) => { setCreateForAll(e.target.checked); setOverwriteWarning(null); }}
                disabled={createSaving}
              />
            }
            label={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Taikyti visų kontrahentų dokumentams
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Nustatymai bus priskiriami visų kontrahentų dokumentams eksporto metu
                </Typography>
              </Box>
            }
          />
        </Box>

        {/* Контрагент */}
        <Box
          sx={{
            p: 2,
            borderBottom: "1px solid",
            borderColor: "divider",
            opacity: createForAll ? 0.4 : 1,
            pointerEvents: createForAll ? "none" : "auto",
            backgroundColor: createForAll ? "grey.100" : "white",
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
            Taikyti tik šio kontrahento dokumentams
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Įmonės kodas"
              value={createCompanyCode}
              onChange={(e) => { setCreateCompanyCode(e.target.value); setOverwriteWarning(null); }}
              size="small"
              required={!createForAll}
              disabled={createForAll || createSaving}
              sx={{ minWidth: 200 }}
            />
            <TextField
              label="Įmonės pavadinimas"
              value={createCompanyName}
              onChange={(e) => setCreateCompanyName(e.target.value)}
              size="small"
              disabled={createForAll || createSaving}
              sx={{ flexGrow: 1 }}
            />
          </Stack>
        </Box>

        {/* Предупреждение о перезаписи */}
        {overwriteWarning && (
          <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
            <Alert severity="warning" icon={<WarningAmberIcon />}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {createForAll
                  ? 'Profilis „visoms įmonėms" jau egzistuoja ir visi laukai bus perrašyti naujomis reikšmėmis.'
                  : `Profilis įmonei „${overwriteWarning.company_name || createCompanyCode}" jau egzistuoja ir visi laukai bus perrašyti naujomis reikšmėmis.`}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary", mb: 1.5 }}>
                Jei nenorite perrašinėti visų laukų, tiesiog suraskite reikiamą profilį žemiau ir redaguokite jį.
              </Typography>
              <Button variant="contained" color="warning" size="small"
                onClick={handleCreateSave} disabled={createSaving}>
                Perrašyti
              </Button>
            </Alert>
          </Box>
        )}

        {/* Поля программы — 2 колонки */}
        <Box sx={{ p: 2, backgroundColor: "white" }}>
          <Grid2 container spacing={3}>
            {config.sections.map((section) => (
              <Grid2 key={section.title} size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
                  {section.title}
                </Typography>
                <Stack spacing={1.5}>
                  {section.fields.map((f) => {
                    const selectOptions = SELECT_FIELDS[f.key];
                    if (selectOptions) {
                      return (
                        <FormControl key={f.key} size="small" fullWidth disabled={createSaving}>
                          <InputLabel>{f.label}</InputLabel>
                          <Select
                            label={f.label}
                            value={createFields[f.key] ?? selectOptions[0]?.value ?? ""}
                            onChange={handleCreateFieldChange(f.key)}
                            MenuProps={{ disableScrollLock: true }}
                          >
                            {selectOptions.map((opt) => (
                              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      );
                    }
                    return (
                      <TextField key={f.key} label={f.label}
                        value={createFields[f.key] || ""} onChange={handleCreateFieldChange(f.key)}
                        fullWidth size="small" disabled={createSaving} />
                    );
                  })}
                </Stack>
              </Grid2>
            ))}
          </Grid2>

          {createError && <Alert severity="error" sx={{ mt: 2 }}>{createError}</Alert>}

          {/* Actions */}
          <Stack direction="row" spacing={2} sx={{ mt: 3, justifyContent: "flex-end" }}>
            <Button onClick={resetCreateForm} disabled={createSaving}>
              Atšaukti
            </Button>
            <Button variant="contained" onClick={handleCreateSave} disabled={createSaving}>
              {createSaving ? <CircularProgress size={20} /> : "Sukurti"}
            </Button>
          </Stack>
        </Box>
      </Box>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* SAVED PROFILES LIST */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <Typography variant="h6" sx={{ fontWeight: 400, fontSize: 18, mb: 2 }}>
        Išsaugoti profiliai
      </Typography>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : profiles.length === 0 ? (
        <Box
          sx={{
            textAlign: "center", py: 5,
            border: "2px dashed", borderColor: "divider", borderRadius: 2,
            backgroundColor: "grey.50",
          }}
        >
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Nėra išsaugotų profilių
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
            Sukurkite pirmąjį profilį aukščiau
          </Typography>
        </Box>
      ) : (
        <>
          <Stack spacing={1.5}>
            {profiles.map((p) => (
              <ProfileCard key={p.company_code} profile={p} programKey={programKey}
                onEdit={handleEdit} onDelete={handleDelete} />
            ))}
          </Stack>

          {hasMore && (
            <Box sx={{ textAlign: "center", mt: 2 }}>
              <Button variant="outlined" onClick={handleLoadMore}
                disabled={loadingMore} size="small">
                {loadingMore && <CircularProgress size={16} sx={{ mr: 1 }} />}
                Rodyti daugiau ({total - profiles.length})
              </Button>
            </Box>
          )}
        </>
      )}

      {/* Edit modal (only for editing) */}
      <ProfileEditDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditData(null); }}
        programKey={programKey}
        editData={editData}
        onSaved={handleSaved}
      />
    </Paper>
  );
}