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
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import WeekendIcon from "@mui/icons-material/Weekend";
import { api } from "../api/endpoints";
import { fixedAssetsApi } from "../api/fixedAssetsApi";
import { getAccountName } from "./KorespondencijaComponents";
import DocumentImagePane from "./DocumentImagePane";
import { errorText, fmtEur, nextMonthStart } from "./fixedAssetsUtils";

const MAX_CARDS = 500;

const EMPTY_FORM = {
  name: "",
  group_id: "",
  quantity: "1",
  acquisition_cost: "",
  costTouched: false,
  operation_start_date: "",
  useful_life_months: "",
  inventory_number: "",
};

const round2 = (n) => Math.round(n * 100) / 100;

function inventoryRange(first, count) {
  const match = /^(.*?)(\d+)$/.exec(first || "");
  if (!match) return "";
  const last = String(Number(match[2]) + count - 1).padStart(match[2].length, "0");
  return `${first} - ${match[1]}${last}`;
}

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

export default function FixedAssetCreateDialog({
  open,
  onClose,
  purchaseId,
  lineId = null,
  suggestedCategory = "",
  previewUrl = null,
  onCreated,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [groups, setGroups] = useState([]);
  const [source, setSource] = useState(null);
  const [imageUrl, setImageUrl] = useState(previewUrl);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open || !purchaseId) return;

    let cancelled = false;
    setLoading(true);
    setError("");
    setSource(null);
    setForm(EMPTY_FORM);
    setImageUrl(previewUrl);

    Promise.all([
      fixedAssetsApi.getGroups(),
      fixedAssetsApi.getPurchaseSource(purchaseId, lineId),
      previewUrl ? Promise.resolve(null) : api.get(`/purchases/${purchaseId}/`, { withCredentials: true }),
    ])
      .then(([groupsRes, sourceRes, purchaseRes]) => {
        if (cancelled) return;

        const src = sourceRes.data;
        const suggested = (groupsRes.data || []).find((g) => g.category === suggestedCategory);

        const lineQty = Number(src.quantity);
        const sourceAmount = Number(src.source_amount || 0);
        const available = Number(src.available_amount || 0);
        const unitCost =
          lineId && Number.isInteger(lineQty) && lineQty > 0 ? sourceAmount / lineQty : null;
        const defaultQty = unitCost
          ? Math.max(1, Math.min(lineQty, Math.round(available / unitCost) || 1))
          : 1;

        setGroups(groupsRes.data || []);
        setSource({ ...src, unitCost });
        if (purchaseRes?.data) setImageUrl(purchaseRes.data.preview_url || null);

        setForm({
          ...EMPTY_FORM,
          name: src.name || "",
          group_id: suggested?.id ?? "",
          useful_life_months: suggested?.useful_life_months ?? "",
          quantity: String(defaultQty),
          acquisition_cost: available > 0 ? String(round2(available)) : "",
          operation_start_date: src.purchase_date || "",
          inventory_number: src.next_inventory_number || "",
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
  }, [open, purchaseId, lineId, suggestedCategory, previewUrl]);

  const group = useMemo(
    () => groups.find((g) => String(g.id) === String(form.group_id)) || null,
    [groups, form.group_id],
  );

  const available = Number(source?.available_amount || 0);

  const setField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleGroupChange = (e) => {
    const g = groups.find((x) => String(x.id) === String(e.target.value));
    setForm((prev) => ({ ...prev, group_id: e.target.value, useful_life_months: g?.useful_life_months ?? "" }));
  };

  const handleQuantityChange = (e) => {
    const value = e.target.value;
    setForm((prev) => {
      const next = { ...prev, quantity: value };
      const qty = Number(value);
      if (source?.unitCost && !prev.costTouched && Number.isInteger(qty) && qty > 0) {
        const amount = source.unitCost * qty;
        next.acquisition_cost = String(amount >= available - 0.01 ? round2(available) : round2(amount));
      }
      return next;
    });
  };

  const handleCostChange = (e) =>
    setForm((prev) => ({ ...prev, acquisition_cost: e.target.value, costTouched: true }));

  const qty = Number(form.quantity);
  const qtyInvalid = !Number.isInteger(qty) || qty < 1 || qty > MAX_CARDS;

  const cost = Number(form.acquisition_cost);
  const costInvalid = !cost || cost <= 0 || cost > available + 0.0001;
  const perCard = !qtyInvalid && !costInvalid ? cost / qty : 0;

  const lifeInvalid = !form.useful_life_months || Number(form.useful_life_months) < 1;
  const needsReclass = Boolean(group && source && group.asset_account !== source.source_account);
  const depreciationStart = nextMonthStart(form.operation_start_date);

  const canSubmit =
    !loading && !saving && source && group && group.asset_account &&
    form.name.trim() && !costInvalid && !qtyInvalid && !lifeInvalid;

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
        useful_life_months: Number(form.useful_life_months),
        inventory_number: qty === 1 ? form.inventory_number.trim() : "",
        split_count: qty,
      });
      await onCreated?.(data);
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const renderForm = () => (
    <Stack spacing={2}>
      <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: "#fafafa", border: "1px solid", borderColor: "divider" }}>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          Tiekėjas: <b>{source.seller_name || "—"}</b>
        </Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          {lineId ? "Eilutės suma" : "Pirkimo suma"} (be PVM): <b>{fmtEur(source.source_amount)}</b>
          {" · "}Galima: <b>{fmtEur(source.available_amount)}</b>
          {source.unitCost && <>{" · "}Kiekis: <b>{Number(source.quantity)}</b> po <b>{fmtEur(source.unitCost)}</b></>}
        </Typography>
      </Box>

      {available <= 0 && <Alert severity="info">Visa suma jau paversta ilgalaikiu turtu</Alert>}

      {!lineId && (
        <Alert severity="info" sx={{ fontSize: 12 }}>
          Sumiškai sąskaita: pagal dokumentą kairėje įveskite tik ilgalaikio turto dalies sumą be PVM ir kiekį.
        </Alert>
      )}

      <TextField
        label="Pavadinimas"
        size="small"
        value={form.name}
        onChange={setField("name")}
        helperText={!qtyInvalid && qty > 1 ? "Kortelės bus pavadintos „Pavadinimas #1“, „#2“..." : " "}
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
            <Typography component="span" sx={{ ml: 1, fontSize: 12, color: "text.secondary" }}>
              {g.asset_account || "—"} · {g.useful_life_months || "—"} mėn.
            </Typography>
          </MenuItem>
        ))}
      </TextField>

      <Box sx={{ display: "flex", gap: 2 }}>
        <TextField
          label="Kiekis, vnt."
          size="small"
          type="number"
          value={form.quantity}
          onChange={handleQuantityChange}
          error={qtyInvalid}
          helperText={!qtyInvalid && qty > 1 ? `${qty} kortelės` : "Kortelių skaičius"}
          inputProps={{ min: 1, max: MAX_CARDS }}
          sx={{ width: 150, flexShrink: 0 }}
        />
        <TextField
          label={qty > 1 ? "Bendra savikaina, EUR" : "Įsigijimo savikaina, EUR"}
          size="small"
          type="number"
          value={form.acquisition_cost}
          onChange={handleCostChange}
          error={Boolean(form.acquisition_cost) && costInvalid}
          helperText={
            Boolean(form.acquisition_cost) && costInvalid
              ? `Daugiausiai ${fmtEur(available)}`
              : !qtyInvalid && qty > 1 && perCard
                ? `Vienos kortelės: ${fmtEur(perCard)}`
                : " "
          }
          inputProps={{ step: "0.01", min: 0 }}
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
        {qty > 1 ? (
          <TextField
            label="Inventoriniai nr."
            size="small"
            value={qtyInvalid ? "" : inventoryRange(source.next_inventory_number, qty)}
            disabled
            fullWidth
          />
        ) : (
          <TextField
            label="Inventorinis nr."
            size="small"
            value={form.inventory_number}
            onChange={setField("inventory_number")}
            fullWidth
          />
        )}
      </Box>

      <TextField
        label="Eksploatacijos pradžia"
        size="small"
        type="date"
        value={form.operation_start_date}
        onChange={setField("operation_start_date")}
        InputLabelProps={{ shrink: true }}
        helperText={
          depreciationStart
            ? `Nusidėvėjimas bus skaičiuojamas nuo ${depreciationStart}`
            : "Tuščia - juodraštis, nusidėvėjimas neskaičiuojamas"
        }
        fullWidth
      />

      {group && !group.asset_account && <Alert severity="warning">Turto grupei nenurodyta turto DK sąskaita</Alert>}

      {group && group.asset_account && !costInvalid && (
        <Box sx={{ p: 1.25, borderRadius: 1.5, border: "1px solid", borderColor: "divider" }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, mb: 0.5 }}>DK įrašas</Typography>
          {needsReclass ? (
            <>
              <DkRow side="D" code={group.asset_account} name={group.asset_account_name} amount={cost} />
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
  );

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="lg"
      fullScreen={isMobile}
      disableScrollLock
      PaperProps={{ sx: isMobile ? {} : { borderRadius: "14px", height: "90vh" } }}
    >
      <Box
        sx={{
          px: 2.5,
          py: 1.4,
          bgcolor: "#FFF8EE",
          borderBottom: "1px solid #F0D7B1",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <WeekendIcon sx={{ color: "#e08d21" }} />
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>Sukurti ilgalaikį turtą</Typography>
        </Box>
        <IconButton onClick={onClose} disabled={saving}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent sx={{ p: 0, display: "flex", flexDirection: isMobile ? "column" : "row", minHeight: 0 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1, py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : !source ? (
          <Box sx={{ p: 3, flex: 1 }}>{error && <Alert severity="error">{error}</Alert>}</Box>
        ) : (
          <>
            <Box
              sx={{
                width: isMobile ? "100%" : "55%",
                height: isMobile ? 260 : "auto",
                flexShrink: 0,
                p: 2,
                borderRight: isMobile ? "none" : "1px solid",
                borderBottom: isMobile ? "1px solid" : "none",
                borderColor: "divider",
              }}
            >
              <DocumentImagePane src={imageUrl} maxHeight={isMobile ? "220px" : "calc(90vh - 170px)"} minHeight={isMobile ? 220 : 300} />
            </Box>
            <Box sx={{ flex: 1, overflowY: "auto", p: 2.5 }}>{renderForm()}</Box>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: "none" }}>
          Atšaukti
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit}
          sx={{ textTransform: "none", borderRadius: 3, background: "linear-gradient(135deg, #FF9800, #F57C00)" }}
        >
          {saving ? (
            <CircularProgress size={18} sx={{ color: "#fff" }} />
          ) : !qtyInvalid && qty > 1 ? (
            `Sukurti ${qty} korteles`
          ) : (
            "Sukurti"
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}