// InvoiceExtraFields.jsx
import React, { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, TextField, Stack, Grid2, Button, Alert,
  CircularProgress, FormControl, InputLabel, Select, MenuItem,
  Tooltip,
} from "@mui/material";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { api } from "../api/endpoints";

// Только pardavimas поля для каждой программы
const PARDAVIMAS_FIELDS = {
  rivile: [
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
    { key: "prekes_assembly_pardavimas", label: "Prekės tipas", type: "assembly" },
    { key: "paslaugos_assembly_pardavimas", label: "Paslaugos tipas", type: "assembly" },
  ],
  rivile_erp: [
    { key: "pardavimas_zurnalo_kodas", label: "Žurnalo kodas" },
    { key: "pardavimas_padalinio_kodas", label: "Padalinio kodas" },
    { key: "pardavimas_objekto_kodas", label: "Objekto kodas" },
  ],
  butent: [
    { key: "pardavimas_sandelis", label: "Sandėlis" },
    { key: "pardavimas_operacija", label: "Operacija" },
  ],
  finvalda: [
    { key: "pardavimas_sandelis", label: "Sandėlis" },
    { key: "pardavimas_zurnalas", label: "Žurnalas" },
    { key: "pardavimas_tipas", label: "Tipas" },
    { key: "pardavimas_padalinys", label: "Padalinys" },
    { key: "pardavimas_darbuotojas", label: "Darbuotojas" },
  ],
  centas: [
    { key: "pardavimas_sandelis", label: "Sandėlis" },
    { key: "pardavimas_kastu_centras", label: "Kaštų centras" },
  ],
  pragma4: [
    { key: "pard_sandelio_kodas", label: "Sandėlio kodas" },
    { key: "pard_projekto_kodas", label: "Projekto kodas" },
    { key: "pard_centro_kodas", label: "Centro kodas" },
    { key: "pard_dk_schemos_kodas", label: "DK schemos kodas" },
  ],
  dineta: [
    { key: "pard_sandelio_kodas", label: "Sandėlio kodas" },
  ],
  optimum: [
    { key: "pard_prekes_tipas", label: "Prekės tipas" },
    { key: "pard_prekes_grupe", label: "Prekės grupė" },
    { key: "pard_sandelio_kodas", label: "Sandėlio kodas" },
    { key: "pirkejo_grupe", label: "Pirkėjo grupė" },
    { key: "pard_skyriaus_kodas", label: "Skyriaus kodas" },
    { key: "pard_projekto_kodas", label: "Projekto kodas" },
    { key: "pard_atsakingo_darb_kodas", label: "Atsakingo darbuotojo kodas" },
  ],
  debetas: [
    { key: "pardavimas_filialas", label: "Filialas" },
    { key: "pardavimas_padalinys", label: "Padalinys" },
    { key: "pardavimas_objektas", label: "Objektas" },
    { key: "pardavimas_materialiai_atsakingas_asmuo", label: "Materialiai atsakingas asmuo" },
    { key: "pardavimas_atskaitingas_asmuo", label: "Atskaitingas asmuo" },
  ],
  pragma3: [
    { key: "pardavimas_sandelis", label: "Sandėlis" },
    { key: "pardavimas_korespondencija", label: "Korespondencijos schema" },
    { key: "pardavimas_projektas", label: "Projekto kodas" },
  ],
  site_pro: [
    { key: "pardavimas_prekes_grupe", label: "Prekės grupė" },
    { key: "pardavimas_sandelis", label: "Sandėlis" },
    { key: "pardavimas_darbuotojas", label: "Darbuotojas" },
    { key: "pardavimas_kastu_centras", label: "Kaštų centras" },
  ],
  agnum: [
    { key: "pardavimas_grupe", label: "Prekės grupė" },
    { key: "pardavimas_sandelis", label: "Sandėlio kodas" },
    { key: "pardavimas_objektas", label: "Objekto kodas" },
  ],
};

// Алиасы
PARDAVIMAS_FIELDS.rivile_gama = PARDAVIMAS_FIELDS.rivile;
PARDAVIMAS_FIELDS.rivile_gama_api = PARDAVIMAS_FIELDS.rivile;

const ASSEMBLY_OPTIONS = [
  { value: 1, label: "Paprasta" },
  { value: 2, label: "Komplektuojama" },
  { value: 3, label: "Išskaidoma" },
  { value: 4, label: "Generavimai" },
  { value: 5, label: "Sudėtinė" },
  { value: 6, label: "Komplektuojama/Išskaidoma" },
  { value: 7, label: "Mišri" },
  { value: 8, label: "Tara" },
];

// program → API program_key
const PROGRAM_TO_API_KEY = {
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

const PROFILE_KEY = "__israsymas__";

export default function InvoiceExtraFields({ program }) {
  const [fields, setFields] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const apiKey = PROGRAM_TO_API_KEY[program];
  const fieldsDef = PARDAVIMAS_FIELDS[program];

  const loadFields = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get(
        `/extra-fields/${apiKey}/${PROFILE_KEY}/`,
        { withCredentials: true }
      );
      setFields(data.fields || {});
    } catch (e) {
      if (e?.response?.status === 404) {
        setFields({});
      } else {
        setError("Nepavyko užkrauti papildomų laukų.");
      }
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    setFields({});
    setSuccess("");
    setError("");
    loadFields();
  }, [loadFields]);

  const handleChange = (key) => (e) => {
    setFields((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const handleSave = async () => {
    if (!apiKey) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.patch(
        `/extra-fields/${apiKey}/${PROFILE_KEY}/`,
        { company_name: "Išrašymas", fields },
        { withCredentials: true }
      );
      setSuccess("Išsaugota!");
      setTimeout(() => setSuccess(""), 2500);
    } catch (e) {
      const resp = e?.response?.data;
      let msg = resp?.detail || "Nepavyko išsaugoti.";
      if (Array.isArray(msg)) msg = msg.join(", ");
      setError(String(msg));
    } finally {
      setSaving(false);
    }
  };

  if (!fieldsDef || !fieldsDef.length || !apiKey) return null;

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Papildomi laukai
        </Typography>
        <Tooltip arrow enterTouchDelay={0} leaveTouchDelay={4000}
          title="Eksportuojant išrašytas sąskaitas į savo apskaitos programą, šios reikšmės automatiškai prisiskirs jūsų dokumentams">
          <HelpOutlineIcon fontSize="small" sx={{ color: "text.secondary" }} />
        </Tooltip>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <>
          <Grid2 container spacing={1.5}>
            {fieldsDef.map((f) => {
              if (f.type === "assembly") {
                return (
                  <Grid2 key={f.key} size={{ xs: 12, sm: 6 }}>
                    <FormControl size="small" fullWidth disabled={saving}>
                      <InputLabel>{f.label}</InputLabel>
                      <Select
                        label={f.label}
                        value={fields[f.key] ?? 1}
                        onChange={handleChange(f.key)}
                        MenuProps={{ disableScrollLock: true }}
                        sx={{ backgroundColor: "#fff" }}
                      >
                        {ASSEMBLY_OPTIONS.map((opt) => (
                          <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid2>
                );
              }
              return (
                <Grid2 key={f.key} size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label={f.label}
                    value={fields[f.key] || ""}
                    onChange={handleChange(f.key)}
                    fullWidth size="small" disabled={saving}
                    sx={{ backgroundColor: "#fff" }}
                  />
                </Grid2>
              );
            })}
          </Grid2>

          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mt: 2 }}>{success}</Alert>}

          <Box sx={{ mt: 2 }}>
            <Button variant="contained" onClick={handleSave} disabled={saving} size="medium">
              {saving ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
              Išsaugoti papildomus laukus
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}