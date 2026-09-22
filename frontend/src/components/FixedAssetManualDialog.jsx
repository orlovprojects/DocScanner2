import { useEffect, useMemo, useState } from "react";
import {
  Alert,
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
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import WeekendIcon from "@mui/icons-material/Weekend";
import { fixedAssetsApi } from "../api/fixedAssetsApi";
import { ILT_COLORS } from "./IltBanner";
import { getAccountName } from "./KorespondencijaComponents";
import LtDatePicker from "./LtDatePicker";
import {
  MoneyField,
  errorText,
  fmtEur,
  nextMonthStart,
  sanitizeInt,
  todayIso,
  toNumber,
} from "./fixedAssetsUtils";

const CREDIT_OPTIONS = [
  { code: "308", label: "Savininkų įnašai", hint: "Savininkas perdavė turtą įmonei" },
  { code: "3011", label: "Paprastosios akcijos", hint: "Įnašas į įstatinį kapitalą" },
  { code: "401", label: "Su turtu susijusios dotacijos", hint: "Dotacija, ES parama" },
  { code: "272", label: "Kasa", hint: "Pirkta grynaisiais be sąskaitos" },
  { code: "4494", label: "Kitos mokėtinos sumos", hint: "Pirko darbuotojas, įmonė grąžins" },
  { code: "5401", label: "Kitos pajamos", hint: "Gauta neatlygintinai" },
  { code: "2010", label: "Žaliavos ir medžiagos", hint: "Perkelta iš atsargų" },
  { code: "2040", label: "Pirktos prekės", hint: "Perkelta iš atsargų" },
];

const EMPTY_FORM = {
  name: "",
  group_id: "",
  acquisition_cost: "",
  purchase_date: "",
  operation_start_date: "",
  useful_life_months: "",
  credit_account: "308",
  inventory_number: "",
  description: "",
};

function DkRow({ side, code, name, amount }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "32px 1fr 110px", alignItems: "center", py: 0.5 }}>
      <Box
        component="span"
        sx={{
          fontSize: 10,
          fontWeight: 700,
          px: 0.5,
          py: 0.15,
          borderRadius: 0.75,
          width: "fit-content",
          bgcolor: side === "D" ? "#EFF6FF" : "#FEF2F2",
          color: side === "D" ? "#2563EB" : "#DC2626",
        }}
      >
        {side}
      </Box>
      <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
        {code} {name || getAccountName(code) || ""}
      </Typography>
      <Typography sx={{ fontSize: 12, fontWeight: 700, textAlign: "right" }}>{fmtEur(amount)}</Typography>
    </Box>
  );
}

export default function FixedAssetManualDialog({ open, onClose, onCreated }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [nextNumber, setNextNumber] = useState("");

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setForm({ ...EMPTY_FORM, purchase_date: todayIso() });
    setError("");
    setSubmitted(false);
    setLoading(true);

    Promise.all([fixedAssetsApi.getGroups(), fixedAssetsApi.getAssets()])
      .then(([groupsRes, assetsRes]) => {
        if (cancelled) return;
        setGroups(groupsRes.data || []);

        const numbers = (assetsRes.data || [])
          .map((a) => /^IT-(\d+)$/.exec(a.inventory_number || ""))
          .filter(Boolean)
          .map((m) => Number(m[1]));
        const last = numbers.length ? Math.max(...numbers) : 0;
        setNextNumber(`IT-${String(last + 1).padStart(6, "0")}`);
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

  const setField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleGroupChange = (e) => {
    const g = groups.find((x) => String(x.id) === String(e.target.value));
    setForm((prev) => ({
      ...prev,
      group_id: e.target.value,
      useful_life_months: g?.useful_life_months ? String(g.useful_life_months) : "",
    }));
  };

  const cost = toNumber(form.acquisition_cost);
  const life = Number(form.useful_life_months);
  const creditAccount = form.credit_account.trim();
  const creditOption = CREDIT_OPTIONS.find((o) => o.code === creditAccount);
  const depreciationStart = nextMonthStart(form.operation_start_date);

  const errors = {};
  if (!form.name.trim()) errors.name = "Nurodykite pavadinimą";
  if (!group) errors.group_id = "Pasirinkite turto grupę";
  else if (!group.asset_account) errors.group_id = "Turto grupei nenurodyta turto DK sąskaita";
  if (!form.acquisition_cost) errors.acquisition_cost = "Nurodykite savikainą";
  if (!form.purchase_date) errors.purchase_date = "Nurodykite įsigijimo datą";
  if (!form.useful_life_months) errors.useful_life_months = "Nurodykite laiką";
  if (!creditAccount) errors.credit_account = "Pasirinkite kredito sąskaitą";

  const liveErrors = {};
  if (form.acquisition_cost && (!Number.isFinite(cost) || cost <= 0))
    liveErrors.acquisition_cost = "Suma turi būti didesnė už 0";
  if (form.useful_life_months && (!Number.isInteger(life) || life < 1))
    liveErrors.useful_life_months = "Turi būti ne mažiau 1 mėn.";
  if (
    form.operation_start_date &&
    form.purchase_date &&
    form.operation_start_date < form.purchase_date
  )
    liveErrors.operation_start_date = "Negali būti ankstesnė už įsigijimo datą";

  const fieldError = (f) => liveErrors[f] || (submitted ? errors[f] : "");
  const hasErrors = Object.keys(errors).length > 0 || Object.keys(liveErrors).length > 0;
  const costValid = !liveErrors.acquisition_cost && Number.isFinite(cost) && cost > 0;

  const handleSubmit = async () => {
    setSubmitted(true);
    if (loading || saving || hasErrors) return;

    setSaving(true);
    setError("");
    try {
      const { data } = await fixedAssetsApi.createManual({
        source: "other",
        group_id: group.id,
        name: form.name.trim(),
        acquisition_cost: cost.toFixed(2),
        purchase_date: form.purchase_date,
        operation_start_date: form.operation_start_date || null,
        useful_life_months: life,
        salvage_value: "0.00",
        accumulated_depreciation: "0.00",
        credit_account: creditAccount,
        inventory_number: "",
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
      PaperProps={{ sx: { borderRadius: "14px", maxWidth: 560 } }}
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

      <DialogContent sx={{ pt: 2.5, overflowX: "hidden" }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <Stack spacing={2}>
            <Alert severity="info" sx={{ fontSize: 13 }}>
              Turtas be pirkimo sąskaitos: įnašas į kapitalą, dotacija, pirkimas grynaisiais.
              Jei turite tiekėjo sąskaitą, turtą kurkite iš Pirkimų. Turtą, įsigytą iki perėjimo
              datos, įkelkite per Pradinius likučius.
            </Alert>

            <TextField
              label="Pavadinimas"
              size="small"
              value={form.name}
              onChange={setField("name")}
              error={Boolean(fieldError("name"))}
              helperText={fieldError("name")}
              fullWidth
            />

            <TextField
              select
              label="Turto grupė"
              size="small"
              value={form.group_id}
              onChange={handleGroupChange}
              error={Boolean(fieldError("group_id"))}
              helperText={fieldError("group_id")}
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

            <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
              <MoneyField
                label="Įsigijimo savikaina, EUR"
                size="small"
                value={form.acquisition_cost}
                onChange={(v) => setForm((prev) => ({ ...prev, acquisition_cost: v }))}
                error={Boolean(fieldError("acquisition_cost"))}
                helperText={fieldError("acquisition_cost")}
                fullWidth
              />
              <TextField
                label="Naudingo tarnavimo laikas, mėn."
                size="small"
                value={form.useful_life_months}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, useful_life_months: sanitizeInt(e.target.value) }))
                }
                error={Boolean(fieldError("useful_life_months"))}
                helperText={fieldError("useful_life_months")}
                inputProps={{ inputMode: "numeric" }}
                fullWidth
              />
            </Box>

            <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
              <LtDatePicker
                label="Įsigijimo data"
                value={form.purchase_date}
                onChange={(v) => setForm((prev) => ({ ...prev, purchase_date: v }))}
                error={Boolean(fieldError("purchase_date"))}
                helperText={fieldError("purchase_date")}
              />
              <LtDatePicker
                label="Eksploatacijos pradžia"
                value={form.operation_start_date}
                onChange={(v) => setForm((prev) => ({ ...prev, operation_start_date: v }))}
                minDate={form.purchase_date || undefined}
                error={Boolean(fieldError("operation_start_date"))}
                helperText={
                  fieldError("operation_start_date") ||
                  (depreciationStart
                    ? `Nusidėvėjimas nuo ${depreciationStart}`
                    : "Tuščia - juodraštis")
                }
              />
            </Box>

            <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
              <TextField
                select
                label="Kredito sąskaita"
                size="small"
                value={form.credit_account}
                onChange={setField("credit_account")}
                error={Boolean(fieldError("credit_account"))}
                helperText={fieldError("credit_account") || creditOption?.hint || ""}
                sx={{ flex: 2 }}
                SelectProps={{ MenuProps: { disableScrollLock: true } }}
              >
                {CREDIT_OPTIONS.map((o) => (
                  <MenuItem key={o.code} value={o.code}>
                    {o.code} {o.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Inventorinis nr."
                size="small"
                value={nextNumber}
                disabled
                helperText="Suteikiamas automatiškai"
                sx={{ flex: 1 }}
              />
            </Box>

            <TextField
              label="Aprašymas"
              size="small"
              value={form.description}
              onChange={setField("description")}
              multiline
              minRows={2}
              fullWidth
            />

            {group?.asset_account && creditAccount && costValid && (
              <Box sx={{ p: 1.25, borderRadius: 1.5, border: "1px solid", borderColor: "divider" }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, mb: 0.5 }}>DK įrašas</Typography>
                <DkRow side="D" code={group.asset_account} name={group.asset_account_name} amount={cost} />
                <DkRow side="K" code={creditAccount} amount={cost} />
              </Box>
            )}

            {submitted && hasErrors && (
              <Alert severity="warning" sx={{ fontSize: 13 }}>Užpildykite pažymėtus laukus</Alert>
            )}

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
          disabled={loading || saving}
          sx={{ textTransform: "none", borderRadius: 3, background: "linear-gradient(135deg, #FF9800, #F57C00)" }}
        >
          {saving ? <CircularProgress size={18} sx={{ color: "#fff" }} /> : "Sukurti"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}