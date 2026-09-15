import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  Stack,
  TextField,
  MenuItem,
  Typography,
  IconButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import { fixedAssetsApi } from "../api/fixedAssetsApi";
import { getAccountName } from "../components/KorespondencijaComponents";

const EMPTY_FORM = {
  name: "",
  group_id: "",
  acquisition_cost: "",
  operation_start_date: "",
  useful_life_months: "",
  inventory_number: "",
};

function fmtEur(val) {
  const num = Number(val);
  if (val == null || val === "" || Number.isNaN(num)) return "—";
  return `${num.toLocaleString("lt-LT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} EUR`;
}

function errorText(e) {
  const d = e?.response?.data;
  if (!d) return e?.message || "Klaida";
  if (typeof d === "string") return d;
  if (d.detail) return d.detail;
  const first = Object.values(d)[0];
  return Array.isArray(first) ? first[0] : String(first);
}

function DkRow({ side, code, amount }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "32px 1fr 110px",
        alignItems: "center",
        py: 0.5,
      }}
    >
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
        {code} {getAccountName(code) || ""}
      </Typography>
      <Typography sx={{ fontSize: 12, fontWeight: 700, textAlign: "right" }}>
        {fmtEur(amount)}
      </Typography>
    </Box>
  );
}

export default function FixedAssetCreateDialog({
  open,
  onClose,
  purchaseId,
  lineId = null,
  onCreated,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [groups, setGroups] = useState([]);
  const [source, setSource] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open || !purchaseId) return;

    let cancelled = false;
    setLoading(true);
    setError("");
    setSource(null);
    setForm(EMPTY_FORM);

    Promise.all([
      fixedAssetsApi.getGroups(),
      fixedAssetsApi.getPurchaseSource(purchaseId, lineId),
    ])
      .then(([groupsRes, sourceRes]) => {
        if (cancelled) return;
        const src = sourceRes.data;
        setGroups(groupsRes.data || []);
        setSource(src);
        setForm({
          ...EMPTY_FORM,
          name: src.name || "",
          acquisition_cost: src.available_amount ?? "",
          operation_start_date: src.purchase_date || "",
        });
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
  }, [open, purchaseId, lineId]);

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

  const cost = Number(form.acquisition_cost);
  const available = Number(source?.available_amount || 0);
  const costInvalid = !cost || cost <= 0 || cost > available + 0.0001;
  const needsReclass = Boolean(
    group && source && group.asset_account !== source.source_account,
  );
  const canSubmit =
    !loading &&
    !saving &&
    source &&
    group &&
    group.asset_account &&
    form.name.trim() &&
    !costInvalid;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      const { data } = await fixedAssetsApi.createFromPurchase({
        purchase_id: purchaseId,
        purchase_line_id: lineId,
        group_id: group.id,
        name: form.name.trim(),
        acquisition_cost: cost.toFixed(2),
        operation_start_date: form.operation_start_date || null,
        useful_life_months: form.useful_life_months
          ? Number(form.useful_life_months)
          : null,
        inventory_number: form.inventory_number.trim(),
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
          bgcolor: "#FFF3E0",
          borderBottom: "1px solid #FFD8A8",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Inventory2OutlinedIcon sx={{ color: "#F57C00" }} />
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
            Sukurti ilgalaikį turtą
          </Typography>
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
        ) : !source ? (
          error && <Alert severity="error">{error}</Alert>
        ) : (
          <Stack spacing={2}>
            <Box
              sx={{
                p: 1.25,
                borderRadius: 1.5,
                bgcolor: "#fafafa",
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                Tiekėjas: <b>{source.seller_name || "—"}</b>
              </Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                Pirkimo suma (be PVM): <b>{fmtEur(source.source_amount)}</b>
                {" · "}Galima: <b>{fmtEur(source.available_amount)}</b>
              </Typography>
            </Box>

            {available <= 0 && (
              <Alert severity="info">
                Visa šio pirkimo suma jau paversta ilgalaikiu turtu
              </Alert>
            )}

            <TextField
              label="Pavadinimas"
              size="small"
              value={form.name}
              onChange={setField("name")}
              fullWidth
            />

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
                  <Typography
                    component="span"
                    sx={{ ml: 1, fontSize: 12, color: "text.secondary" }}
                  >
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
                error={Boolean(form.acquisition_cost) && costInvalid}
                helperText={
                  Boolean(form.acquisition_cost) && costInvalid
                    ? `Daugiausiai ${fmtEur(available)}`
                    : " "
                }
                inputProps={{ step: "0.01", min: 0 }}
                fullWidth
              />
              <TextField
                label="Naudingo tarnavimo laikas, mėn."
                size="small"
                type="number"
                value={form.useful_life_months}
                onChange={setField("useful_life_months")}
                helperText=" "
                inputProps={{ min: 1 }}
                fullWidth
              />
            </Box>

            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField
                label="Eksploatacijos pradžia"
                size="small"
                type="date"
                value={form.operation_start_date}
                onChange={setField("operation_start_date")}
                InputLabelProps={{ shrink: true }}
                helperText="Tuščia - juodraštis, nusidėvėjimas neskaičiuojamas"
                fullWidth
              />
              <TextField
                label="Inventorinis nr."
                size="small"
                value={form.inventory_number}
                onChange={setField("inventory_number")}
                helperText=" "
                fullWidth
              />
            </Box>

            {group && !group.asset_account && (
              <Alert severity="warning">
                Turto grupei nenurodyta turto DK sąskaita
              </Alert>
            )}

            {group && group.asset_account && (
              <Box
                sx={{
                  p: 1.25,
                  borderRadius: 1.5,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Typography sx={{ fontSize: 12, fontWeight: 700, mb: 0.5 }}>
                  DK įrašas
                </Typography>
                {needsReclass ? (
                  <>
                    <DkRow side="D" code={group.asset_account} amount={cost} />
                    <DkRow side="K" code={source.source_account} amount={cost} />
                  </>
                ) : (
                  <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                    Pirkimas jau užregistruotas turto sąskaitoje - DK įrašas nekuriamas
                  </Typography>
                )}
              </Box>
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
          disabled={!canSubmit}
          sx={{
            textTransform: "none",
            borderRadius: 3,
            background: "linear-gradient(135deg, #FF9800, #F57C00)",
          }}
        >
          {saving ? <CircularProgress size={18} sx={{ color: "#fff" }} /> : "Sukurti"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}