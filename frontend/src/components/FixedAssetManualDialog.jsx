import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import WeekendIcon from "@mui/icons-material/Weekend";
import { fixedAssetsApi } from "../api/fixedAssetsApi";
import { ILT_COLORS } from "./IltBanner";
import { errorText, fmtEur, nextMonthStart } from "./fixedAssetsUtils";

const CREDIT_OPTIONS = [
  { code: "308", label: "Savininkų įnašai" },
  { code: "3011", label: "Paprastosios akcijos (įnašas į kapitalą)" },
  { code: "401", label: "Su turtu susijusios dotacijos" },
  { code: "5401", label: "Kitos pajamos" },
  { code: "272", label: "Kasa" },
];

const EMPTY_FORM = {
  source: "opening",
  name: "",
  group_id: "",
  acquisition_cost: "",
  purchase_date: "",
  operation_start_date: "",
  useful_life_months: "",
  salvage_value: "",
  accumulated_depreciation: "",
  credit_account: "308",
  inventory_number: "",
  description: "",
};

export default function FixedAssetManualDialog({ open, onClose, onCreated }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setForm(EMPTY_FORM);
    setError("");
    setLoading(true);

    fixedAssetsApi
      .getGroups()
      .then(({ data }) => {
        if (!cancelled) setGroups(data || []);
      })
      .catch((e) => {
        if (!cancelled) setError(errorText(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const group = useMemo(
    () => groups.find((g) => String(g.id) === String(form.group_id)) || null,
    [groups, form.group_id],
  );

  const setField = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleGroupChange = (e) => {
    const g = groups.find((x) => String(x.id) === String(e.target.value));
    setForm((prev) => ({
      ...prev,
      group_id: e.target.value,
      useful_life_months: g?.useful_life_months ?? "",
    }));
  };

  const isOpening = form.source === "opening";
  const cost = Number(form.acquisition_cost);
  const salvage = Number(form.salvage_value || 0);
  const accumulated = Number(form.accumulated_depreciation || 0);
  const life = Number(form.useful_life_months);

  const costInvalid = !cost || cost <= 0;
  const salvageInvalid = salvage < 0 || (!costInvalid && salvage >= cost);
  const accumulatedInvalid =
    isOpening && (accumulated < 0 || (!costInvalid && accumulated > cost - salvage + 0.0001));
  const needsStart = isOpening && accumulated > 0 && !form.operation_start_date;
  const creditOption = CREDIT_OPTIONS.find((o) => o.code === form.credit_account.trim());

  const depreciationStart = nextMonthStart(form.operation_start_date);

  const canSubmit =
    !loading &&
    !saving &&
    group &&
    group.asset_account &&
    form.name.trim() &&
    form.purchase_date &&
    !costInvalid &&
    !salvageInvalid &&
    !accumulatedInvalid &&
    !needsStart &&
    life >= 1 &&
    (isOpening || form.credit_account.trim());

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      const { data } = await fixedAssetsApi.createManual({
        source: form.source,
        group_id: group.id,
        name: form.name.trim(),
        acquisition_cost: cost.toFixed(2),
        purchase_date: form.purchase_date,
        operation_start_date: form.operation_start_date || null,
        useful_life_months: life,
        salvage_value: salvage.toFixed(2),
        accumulated_depreciation: isOpening ? accumulated.toFixed(2) : "0.00",
        credit_account: isOpening ? "" : form.credit_account.trim(),
        inventory_number: form.inventory_number.trim(),
        description: form.description,
      });
      await onCreated?.(data);
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      disableScrollLock
      PaperProps={{ sx: { borderRadius: "14px" } }}
    >
      <Box
        sx={{
          px: 2.5,
          py: 1.4,
          bgcolor: ILT_COLORS.bg,
          borderBottom: `1px solid ${ILT_COLORS.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <WeekendIcon sx={{ color: ILT_COLORS.icon }} />
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>Naujas ilgalaikis turtas</Typography>
        </Box>
        <IconButton onClick={onClose} disabled={saving}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent sx={{ pt: 2.5 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <Stack spacing={2}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={form.source}
              onChange={(_, v) => v && setForm((prev) => ({ ...prev, source: v }))}
              sx={{ "& .MuiToggleButton-root": { textTransform: "none", flex: 1 } }}
            >
              <ToggleButton value="opening">Pradiniai likučiai</ToggleButton>
              <ToggleButton value="other">Kita (be pirkimo sąskaitos)</ToggleButton>
            </ToggleButtonGroup>

            <Alert severity="info" sx={{ fontSize: 13 }}>
              {isOpening
                ? "Turtas, įsigytas iki perėjimo datos. Savikainą ir sukauptą nusidėvėjimą perėjimo datai paimkite iš ankstesnės programos. DK įrašas nekuriamas - vertės jau yra pradiniuose likučiuose."
                : "Įnašas į kapitalą, dotacija, pirkimas grynaisiais be sąskaitos ir pan. Bus sukurtas DK įrašas. Turtą su tiekėjo sąskaita kurkite iš Pirkimų."}
            </Alert>

            <TextField label="Pavadinimas" size="small" value={form.name} onChange={setField("name")} fullWidth />

            <TextField
              select
              label="Turto grupė"
              size="small"
              value={form.group_id}
              onChange={handleGroupChange}
              fullWidth
              SelectProps={{ MenuProps: { disableScrollLock: true } }}
            >
              {groups.map((g) => (
                <MenuItem key={g.id} value={g.id}>
                  {g.category_display}
                  <Typography component="span" sx={{ ml: 1, fontSize: 12, color: "text.secondary" }}>
                    {g.asset_account || "—"} · {g.useful_life_months || "—"} mėn.
                  </Typography>
                </MenuItem>
              ))}
            </TextField>

            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField
                label="Įsigijimo savikaina, EUR"
                size="small"
                type="number"
                value={form.acquisition_cost}
                onChange={setField("acquisition_cost")}
                inputProps={{ step: "0.01", min: 0 }}
                fullWidth
              />
              <TextField
                label="Likvidacinė vertė, EUR"
                size="small"
                type="number"
                value={form.salvage_value}
                onChange={setField("salvage_value")}
                error={salvageInvalid}
                inputProps={{ step: "0.01", min: 0 }}
                fullWidth
              />
            </Box>

            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField
                label="Įsigijimo data"
                size="small"
                type="date"
                value={form.purchase_date}
                onChange={setField("purchase_date")}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                label="Eksploatacijos pradžia"
                size="small"
                type="date"
                value={form.operation_start_date}
                onChange={setField("operation_start_date")}
                InputLabelProps={{ shrink: true }}
                error={needsStart}
                helperText={
                  depreciationStart
                    ? `Nusidėvėjimas skaičiuojamas nuo ${depreciationStart}`
                    : "Tuščia - juodraštis"
                }
                fullWidth
              />
            </Box>

            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField
                label="Naudingo tarnavimo laikas, mėn."
                size="small"
                type="number"
                value={form.useful_life_months}
                onChange={setField("useful_life_months")}
                inputProps={{ min: 1 }}
                fullWidth
              />
              <TextField
                label="Inventorinis nr."
                size="small"
                value={form.inventory_number}
                onChange={setField("inventory_number")}
                helperText="Tuščia - suteikiamas automatiškai"
                fullWidth
              />
            </Box>

            {isOpening ? (
              <Box
                sx={{
                  p: 1.25,
                  borderRadius: 1.5,
                  bgcolor: ILT_COLORS.bg,
                  border: `1px solid ${ILT_COLORS.border}`,
                }}
              >
                <TextField
                  label="Sukauptas nusidėvėjimas perėjimo datai, EUR"
                  size="small"
                  type="number"
                  value={form.accumulated_depreciation}
                  onChange={setField("accumulated_depreciation")}
                  error={accumulatedInvalid}
                  helperText={accumulatedInvalid ? "Negali viršyti savikainos atėmus likvidacinę vertę" : " "}
                  inputProps={{ step: "0.01", min: 0 }}
                  sx={{ bgcolor: "#fff" }}
                  fullWidth
                />
                {!costInvalid && (
                  <Typography sx={{ fontSize: 12, color: ILT_COLORS.text }}>
                    Likutinė vertė perėjimo datai: <b>{fmtEur(cost - accumulated)}</b>
                  </Typography>
                )}
              </Box>
            ) : (
              <Box>
                <Autocomplete
                  freeSolo
                  options={CREDIT_OPTIONS}
                  getOptionLabel={(o) => (typeof o === "string" ? o : `${o.code} ${o.label}`)}
                  inputValue={form.credit_account}
                  onInputChange={(_, value) =>
                    setForm((prev) => ({ ...prev, credit_account: (value || "").split(" ")[0] }))
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Kredito sąskaita"
                      size="small"
                      helperText={creditOption ? creditOption.label : "Įveskite sąskaitos kodą"}
                    />
                  )}
                />
                {group?.asset_account && form.credit_account.trim() && !costInvalid && (
                  <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>
                    DK: D {group.asset_account} / K {form.credit_account.trim()} - {fmtEur(cost)}
                  </Typography>
                )}
              </Box>
            )}

            <TextField
              label="Aprašymas"
              size="small"
              value={form.description}
              onChange={setField("description")}
              multiline
              minRows={2}
              fullWidth
            />

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: "none" }}>
          Atšaukti
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit}
          sx={{ textTransform: "none", borderRadius: 3, background: "linear-gradient(135deg, #FF9800, #F57C00)" }}
        >
          {saving ? <CircularProgress size={18} sx={{ color: "#fff" }} /> : "Sukurti"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}