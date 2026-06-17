import React, { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, FormControl, InputLabel, Select, MenuItem,
  Button, Alert, Paper, TextField, Stack, FormControlLabel,
  Switch, IconButton, Tooltip, Grid2, Chip,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import RuleIcon from "@mui/icons-material/Rule";
import SearchIcon from "@mui/icons-material/Search";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import ToggleOnIcon from "@mui/icons-material/ToggleOn";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import Autocomplete from "@mui/material/Autocomplete";
import { api } from "../api/endpoints";
import { COUNTRY_OPTIONS } from "../page_elements/Countries";

const EMPTY_FORM = {
  id: null,
  enabled: true,
  match_pavadinimas: "",
  match_kodas: "",
  match_pvm_kodas: "",
  match_salies_kodas: "",
  match_tipas: "",
  change_target: "",
  result_pavadinimas: "",
  result_kodas: "",
  result_pvm_kodas: "",
  result_salies_kodas: "",
  result_tipas: "",
};

const getRulesCountLabel = (count) => {
  if (count === 1) return "1 taisyklė";
  if (count > 1 && count < 10) return `${count} taisyklės`;
  return `${count} taisyklių`;
};

/* ─── Saved rules list ─── */
const RulesList = React.memo(({ rules, onEdit, onDelete }) => {
  const countryName = useCallback(
    (code) => COUNTRY_OPTIONS.find((c) => c.code === code)?.name || code,
    [],
  );

  if (!rules || rules.length === 0) {
    return (
      <Box
        sx={{
          textAlign: "center", py: 6, px: 2,
          border: "1px dashed", borderColor: "divider",
          borderRadius: 3, backgroundColor: "grey.50",
        }}
      >
        <RuleIcon sx={{ fontSize: 42, color: "text.disabled", mb: 1 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Taisyklių dar nėra
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
          Sukurkite pirmą taisyklę, kad sistema galėtų automatiškai pataisyti kontrahentų duomenis.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={1.5}>
      {rules.map((r, idx) => {
        const targetLabel =
          r.change_target === "buyer_only" ? "Tik pirkėją"
          : r.change_target === "seller_only" ? "Tik pardavėją"
          : "Pirkėją ir pardavėją";

        const hasResult =
          r.result_pavadinimas || r.result_kodas || r.result_pvm_kodas ||
          r.result_salies_kodas || r.result_tipas;

        return (
          <Paper
            key={r.id || idx}
            elevation={0}
            sx={{
              p: 2, borderRadius: 3,
              border: "1px solid", borderColor: "divider",
              backgroundColor: r.enabled ? "background.paper" : "grey.50",
              transition: "0.2s ease",
              "&:hover": { borderColor: "primary.light", boxShadow: "0 8px 24px rgba(15,23,42,0.08)" },
            }}
          >
            {/* header */}
            <Box sx={{ display: "flex", alignItems: { xs: "flex-start", md: "center" }, justifyContent: "space-between", gap: 2, mb: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip label={`#${idx + 1}`} size="small" sx={{ fontWeight: 700, borderRadius: 1.5 }} />
                <Chip
                  label={r.enabled ? "Aktyvi" : "Išjungta"}
                  size="small"
                  sx={{
                    fontWeight: 700, borderRadius: 1.5,
                    backgroundColor: r.enabled ? "rgba(46,125,50,0.12)" : "rgba(211,47,47,0.10)",
                    color: r.enabled ? "success.dark" : "error.dark",
                    border: "1px solid",
                    borderColor: r.enabled ? "rgba(46,125,50,0.24)" : "rgba(211,47,47,0.18)",
                  }}
                />
                <Chip label={targetLabel} size="small" variant="outlined" sx={{ fontWeight: 600, borderRadius: 1.5 }} />
              </Stack>
              <Stack direction="row" spacing={0.75}>
                <IconButton
                  size="small" onClick={() => onEdit(r)}
                  sx={{ border: "1px solid", borderColor: "divider", backgroundColor: "white", "&:hover": { backgroundColor: "rgba(25,118,210,0.08)", borderColor: "primary.light" } }}
                >
                  <EditIcon fontSize="small" color="primary" />
                </IconButton>
                <IconButton
                  size="small" onClick={() => onDelete(r.id)}
                  sx={{ border: "1px solid", borderColor: "divider", backgroundColor: "white", "&:hover": { backgroundColor: "rgba(211,47,47,0.08)", borderColor: "error.light" } }}
                >
                  <DeleteOutlineIcon fontSize="small" color="error" />
                </IconButton>
              </Stack>
            </Box>

            {/* body */}
            <Grid2 container spacing={2} alignItems="stretch">
              <Grid2 size={{ xs: 12, md: 5.5 }}>
                <Box sx={{ height: "100%", p: 1.5, borderRadius: 2.5, backgroundColor: "grey.50", border: "1px solid", borderColor: "divider" }}>
                  <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1 }}>
                    Jei rasta
                  </Typography>
                  <Stack spacing={0.75}>
                    {r.match_pavadinimas && <Typography variant="body2"><strong>Pavadinimas:</strong> {r.match_pavadinimas}</Typography>}
                    {r.match_kodas && <Typography variant="body2"><strong>Kodas:</strong> {r.match_kodas}</Typography>}
                    {r.match_pvm_kodas && <Typography variant="body2"><strong>PVM kodas:</strong> {r.match_pvm_kodas}</Typography>}
                    {r.match_salies_kodas && <Typography variant="body2"><strong>Šalis:</strong> {countryName(r.match_salies_kodas)}</Typography>}
                    {r.match_tipas && <Typography variant="body2"><strong>Tipas:</strong> {r.match_tipas === "juridinis" ? "Juridinis" : "Fizinis"}</Typography>}
                  </Stack>
                </Box>
              </Grid2>

              <Grid2 size={{ xs: 12, md: 1 }} sx={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Box sx={{ width: 34, height: 34, borderRadius: "50%", backgroundColor: "rgba(25,118,210,0.10)", color: "primary.main", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ArrowForwardIcon fontSize="small" />
                </Box>
              </Grid2>

              <Grid2 size={{ xs: 12, md: 5.5 }}>
                <Box sx={{ height: "100%", p: 1.5, borderRadius: 2.5, backgroundColor: "rgba(46,125,50,0.08)", border: "1px solid", borderColor: "rgba(46,125,50,0.18)" }}>
                  <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1 }}>
                    Pakeisti į
                  </Typography>
                  {hasResult ? (
                    <Stack spacing={0.75}>
                      {r.result_pavadinimas && <Typography variant="body2"><strong>Pavadinimas:</strong> {r.result_pavadinimas}</Typography>}
                      {r.result_kodas && <Typography variant="body2"><strong>Kodas:</strong> {r.result_kodas}</Typography>}
                      {r.result_pvm_kodas && <Typography variant="body2"><strong>PVM kodas:</strong> {r.result_pvm_kodas}</Typography>}
                      {r.result_salies_kodas && <Typography variant="body2"><strong>Šalis:</strong> {countryName(r.result_salies_kodas)}</Typography>}
                      {r.result_tipas && <Typography variant="body2"><strong>Tipas:</strong> {r.result_tipas === "juridinis" ? "Juridinis" : "Fizinis"}</Typography>}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">Nenurodyta</Typography>
                  )}
                </Box>
              </Grid2>
            </Grid2>
          </Paper>
        );
      })}
    </Stack>
  );
});

/* ─── Main section component ─── */
export default function CompanyReplaceRulesSection({ companyReplaceRules, setCompanyReplaceRules }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const getCountryOptionLabel = useCallback((option) => option.name, []);
  const isCountryOptionEqualToValue = useCallback((option, value) => option.code === value.code, []);

  const clearForm = useCallback(() => {
    setForm(EMPTY_FORM);
    setError("");
  }, []);

  const handleEdit = useCallback((rule) => {
    setForm({
      id: rule.id || null,
      enabled: rule.enabled !== false,
      match_pavadinimas: rule.match_pavadinimas || "",
      match_kodas: rule.match_kodas || "",
      match_pvm_kodas: rule.match_pvm_kodas || "",
      match_salies_kodas: rule.match_salies_kodas || "",
      match_tipas: rule.match_tipas || "",
      change_target: rule.change_target || "",
      result_pavadinimas: rule.result_pavadinimas || "",
      result_kodas: rule.result_kodas || "",
      result_pvm_kodas: rule.result_pvm_kodas || "",
      result_salies_kodas: rule.result_salies_kodas || "",
      result_tipas: rule.result_tipas || "",
    });
    setError("");
  }, []);

  const handleDelete = useCallback(async (id) => {
    const newList = companyReplaceRules.filter((r) => r.id !== id);
    try {
      await api.patch("/profile/", { company_replace_rules: newList }, { withCredentials: true });
      setCompanyReplaceRules(newList);
    } catch (e) {
      alert(e?.response?.data?.detail || "Nepavyko ištrinti taisyklės.");
    }
  }, [companyReplaceRules, setCompanyReplaceRules]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const hasCondition =
        form.match_pavadinimas?.trim() || form.match_kodas?.trim() ||
        form.match_pvm_kodas?.trim() || form.match_salies_kodas || form.match_tipas;

      if (!hasCondition) {
        setError("Nurodykite bent vieną taikymo sąlygą.");
        setSaving(false);
        return;
      }

      const hasResult =
        form.result_pavadinimas?.trim() || form.result_kodas?.trim() ||
        form.result_pvm_kodas?.trim() || form.result_salies_kodas || form.result_tipas;

      if (!hasResult) {
        setError("Nurodykite bent vieną taikytiną reikšmę.");
        setSaving(false);
        return;
      }

      const nextId = form.id ?? (companyReplaceRules.reduce(
        (max, r) => (typeof r.id === "number" && r.id > max ? r.id : max), 0,
      ) + 1);

      const payloadRule = {
        id: nextId,
        enabled: !!form.enabled,
        match_pavadinimas: (form.match_pavadinimas || "").trim(),
        match_kodas: (form.match_kodas || "").trim(),
        match_pvm_kodas: (form.match_pvm_kodas || "").trim(),
        match_salies_kodas: form.match_salies_kodas || "",
        match_tipas: form.match_tipas || "",
        change_target: form.change_target || "",
        result_pavadinimas: (form.result_pavadinimas || "").trim(),
        result_kodas: (form.result_kodas || "").trim(),
        result_pvm_kodas: (form.result_pvm_kodas || "").trim(),
        result_salies_kodas: form.result_salies_kodas || "",
        result_tipas: form.result_tipas || "",
      };

      const newList = (() => {
        const idx = companyReplaceRules.findIndex((r) => r.id === nextId);
        if (idx === -1) return [...companyReplaceRules, payloadRule];
        const copy = [...companyReplaceRules];
        copy[idx] = payloadRule;
        return copy;
      })();

      await api.patch("/profile/", { company_replace_rules: newList }, { withCredentials: true });
      setCompanyReplaceRules(newList);
      setForm(EMPTY_FORM);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      const data = e?.response?.data;
      let msg = data?.company_replace_rules || data?.detail || "Nepavyko išsaugoti taisyklės.";
      if (typeof msg === "object") { try { msg = JSON.stringify(msg); } catch { msg = "Nepavyko išsaugoti taisyklės."; } }
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [form, companyReplaceRules, setCompanyReplaceRules]);

  return (
    <Paper
      elevation={0}
      sx={{ p: { xs: 2, md: 3 }, mt: 6, borderRadius: 4, border: "1px solid", borderColor: "divider", backgroundColor: "background.paper" }}
    >
      {/* ── Header ── */}
      <Box sx={{ display: "flex", alignItems: { xs: "flex-start", sm: "center" }, justifyContent: "space-between", gap: 2, mb: 3 }}>
        <Box sx={{ display: "flex", gap: 1.5 }}>
          <Box sx={{ width: 44, height: 44, borderRadius: 3, backgroundColor: "rgba(25,118,210,0.10)", color: "primary.main", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <RuleIcon />
          </Box>
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Kontrahentų keitimo taisyklės</Typography>
              <Tooltip title="Skaitmenizuojant dokumentą, sistema patikrina rastą pirkėją arba pardavėją. Jei jis atitinka nurodytas sąlygas, duomenys automatiškai pakeičiami į jūsų nustatytas reikšmes." arrow enterTouchDelay={0} leaveTouchDelay={4000}>
                <HelpOutlineIcon sx={{ fontSize: 20, color: "text.secondary" }} />
              </Tooltip>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 720 }}>
              Sukurkite taisykles, pagal kurias sistema automatiškai pataisys pirkėjo arba pardavėjo duomenis skaitmenizuojant dokumentus.
            </Typography>
          </Box>
        </Box>
        <Chip icon={<ToggleOnIcon />} label={getRulesCountLabel(companyReplaceRules?.length || 0)} size="small" sx={{ fontWeight: 600, borderRadius: 2, flexShrink: 0 }} />
      </Box>

      {/* ── Form ── */}
      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 4, overflow: "hidden", backgroundColor: "background.paper" }}>
        <Box sx={{ p: { xs: 2, md: 3 }, backgroundColor: "grey.50", borderBottom: "1px solid", borderColor: "divider" }}>
          <Grid2 container spacing={2.5}>
            {/* Left: conditions */}
            <Grid2 size={{ xs: 12, lg: 6 }}>
              <Box sx={{ height: "100%", p: { xs: 2, md: 2.5 }, borderRadius: 3, border: "1px solid", borderColor: "divider", backgroundColor: "white" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1 }}>
                  <Box sx={{ width: 34, height: 34, borderRadius: 2, backgroundColor: "rgba(25,118,210,0.10)", color: "primary.main", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <SearchIcon fontSize="small" />
                  </Box>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>1. Jei dokumente rasta</Typography>
                    <Typography variant="caption" color="text.secondary">Pakanka užpildyti bent vieną atpažinimo sąlygą</Typography>
                  </Box>
                </Box>
                <Grid2 container spacing={2} sx={{ mt: 2.5 }}>
                  <Grid2 size={{ xs: 12 }}>
                    <TextField size="small" label="Kontrahento pavadinimas" value={form.match_pavadinimas} onChange={(e) => setForm((p) => ({ ...p, match_pavadinimas: e.target.value }))} fullWidth placeholder="pvz.: UAB Pavyzdys" />
                  </Grid2>
                  <Grid2 size={{ xs: 12, md: 6 }}>
                    <TextField size="small" label="Įmonės kodas" value={form.match_kodas} onChange={(e) => setForm((p) => ({ ...p, match_kodas: e.target.value }))} fullWidth />
                  </Grid2>
                  <Grid2 size={{ xs: 12, md: 6 }}>
                    <TextField size="small" label="PVM kodas" value={form.match_pvm_kodas} onChange={(e) => setForm((p) => ({ ...p, match_pvm_kodas: e.target.value }))} fullWidth />
                  </Grid2>
                  <Grid2 size={{ xs: 12, md: 6 }}>
                    <Autocomplete
                      disablePortal size="small" options={COUNTRY_OPTIONS}
                      getOptionLabel={getCountryOptionLabel}
                      value={COUNTRY_OPTIONS.find((opt) => opt.code === form.match_salies_kodas) || null}
                      onChange={(_, v) => setForm((p) => ({ ...p, match_salies_kodas: v ? v.code : "" }))}
                      renderInput={(params) => <TextField {...params} label="Šalis" />}
                      isOptionEqualToValue={isCountryOptionEqualToValue}
                    />
                  </Grid2>
                  <Grid2 size={{ xs: 12, md: 6 }}>
                    <FormControl size="small" fullWidth>
                      <InputLabel shrink>Tipas</InputLabel>
                      <Select displayEmpty label="Tipas" value={form.match_tipas} onChange={(e) => setForm((p) => ({ ...p, match_tipas: e.target.value }))}>
                        <MenuItem value="">Nesvarbu</MenuItem>
                        <MenuItem value="juridinis">Juridinis asmuo</MenuItem>
                        <MenuItem value="fizinis">Fizinis asmuo</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid2>
                </Grid2>
              </Box>
            </Grid2>

            {/* Right: results */}
            <Grid2 size={{ xs: 12, lg: 6 }}>
              <Box sx={{ height: "100%", p: { xs: 2, md: 2.5 }, borderRadius: 3, border: "1px solid", borderColor: "divider", backgroundColor: "white" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1 }}>
                  <Box sx={{ width: 34, height: 34, borderRadius: 2, backgroundColor: "rgba(46,125,50,0.10)", color: "success.main", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <AutoFixHighIcon fontSize="small" />
                  </Box>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>2. Pakeisti į</Typography>
                    <Typography variant="caption" color="text.secondary">Tušti laukai nebus keičiami</Typography>
                  </Box>
                </Box>
                <Grid2 container spacing={2} sx={{ mt: 2.5 }}>
                  <Grid2 size={{ xs: 12 }}>
                    <TextField size="small" label="Naujas pavadinimas" value={form.result_pavadinimas} onChange={(e) => setForm((p) => ({ ...p, result_pavadinimas: e.target.value }))} fullWidth />
                  </Grid2>
                  <Grid2 size={{ xs: 12, md: 6 }}>
                    <TextField size="small" label="Naujas įmonės kodas" value={form.result_kodas} onChange={(e) => setForm((p) => ({ ...p, result_kodas: e.target.value }))} fullWidth />
                  </Grid2>
                  <Grid2 size={{ xs: 12, md: 6 }}>
                    <TextField size="small" label="Naujas PVM kodas" value={form.result_pvm_kodas} onChange={(e) => setForm((p) => ({ ...p, result_pvm_kodas: e.target.value }))} fullWidth />
                  </Grid2>
                  <Grid2 size={{ xs: 12, md: 6 }}>
                    <Autocomplete
                      disablePortal size="small" options={COUNTRY_OPTIONS}
                      getOptionLabel={getCountryOptionLabel}
                      value={COUNTRY_OPTIONS.find((opt) => opt.code === form.result_salies_kodas) || null}
                      onChange={(_, v) => setForm((p) => ({ ...p, result_salies_kodas: v ? v.code : "" }))}
                      renderInput={(params) => <TextField {...params} label="Nauja šalis" />}
                      isOptionEqualToValue={isCountryOptionEqualToValue}
                    />
                  </Grid2>
                  <Grid2 size={{ xs: 12, md: 6 }}>
                    <FormControl size="small" fullWidth>
                      <InputLabel shrink>Naujas tipas</InputLabel>
                      <Select displayEmpty label="Naujas tipas" value={form.result_tipas} onChange={(e) => setForm((p) => ({ ...p, result_tipas: e.target.value }))}>
                        <MenuItem value="">Nekeisti</MenuItem>
                        <MenuItem value="juridinis">Juridinis asmuo</MenuItem>
                        <MenuItem value="fizinis">Fizinis asmuo</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid2>
                </Grid2>
              </Box>
            </Grid2>
          </Grid2>
        </Box>

        {/* Bottom bar */}
        <Box sx={{ p: { xs: 2, md: 3 }, backgroundColor: "white" }}>
          <Grid2 container spacing={2} alignItems="center">
            <Grid2 size={{ xs: 12, md: 7 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Ką tikrinti ir keisti?</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 1, mb: 2 }}>
                Pasirinkite, kurį kontrahentą tikrinti ir keisti
                <Tooltip
                  arrow
                  enterTouchDelay={0}
                  leaveTouchDelay={4000}
                  title='Pasirinkus "Tik pirkėją", taisyklė tikrins tik pirkėjo duomenis ir keis tik pirkėją. Pardavėjas nebus tikrinamas ir keičiamas, net jei atitinka sąlygą.'
                >
                  <HelpOutlineIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                </Tooltip>
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                {["", "buyer_only", "seller_only"].map((target) => {
                  const label = target === "" ? "Pirkėją ir pardavėją" : target === "buyer_only" ? "Tik pirkėją" : "Tik pardavėją";
                  return (
                    <Chip
                      key={target} clickable label={label}
                      color={form.change_target === target ? "primary" : "default"}
                      variant={form.change_target === target ? "filled" : "outlined"}
                      onClick={() => setForm((p) => ({ ...p, change_target: target }))}
                      sx={{ fontWeight: 600, borderRadius: 2 }}
                    />
                  );
                })}
              </Stack>
            </Grid2>
            <Grid2 size={{ xs: 12, md: 5 }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: { xs: "flex-start", md: "flex-end" } }}>
                <FormControlLabel
                  control={<Switch checked={form.enabled} onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))} />}
                  label={<Typography variant="body2" sx={{ fontWeight: 600 }}>Taisyklė aktyvi</Typography>}
                />
              </Box>
            </Grid2>
          </Grid2>

          {error && <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" icon={<CheckCircleOutlineIcon fontSize="inherit" />} sx={{ mt: 2, borderRadius: 2 }}>Išsaugota!</Alert>}

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 5 }}>
            <Button variant="contained" onClick={handleSave} disabled={saving} size="large" startIcon={<RuleIcon />} sx={{ px: 3, borderRadius: 2, fontWeight: 700, boxShadow: "none" }}>
              {form.id ? "Atnaujinti taisyklę" : "Išsaugoti taisyklę"}
            </Button>
            <Button variant="outlined" size="large" onClick={clearForm} sx={{ px: 3, borderRadius: 2, fontWeight: 700 }}>
              Išvalyti
            </Button>
          </Stack>
        </Box>
      </Box>

      {/* ── Saved rules ── */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 4, mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Išsaugotos taisyklės</Typography>
          <Typography variant="body2" color="text.secondary">Taisyklės taikomos automatiškai skaitmenizuojant dokumentus</Typography>
        </Box>
      </Box>

      <RulesList rules={companyReplaceRules} onEdit={handleEdit} onDelete={handleDelete} />
    </Paper>
  );
}