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
import { ILT_COLORS } from "./IltBanner";
import { getAccountName } from "./KorespondencijaComponents";
import DocumentImagePane from "./DocumentImagePane";
import {
  MoneyField,
  addMonthsPeriod,
  errorText,
  fmtEur,
  fmtPeriod,
  sanitizeInt,
  toCommaInput,
  toNumber,
} from "./fixedAssetsUtils";

function monthsBetween(a, b) {
  const [y1, m1] = String(a).slice(0, 7).split("-").map(Number);
  const [y2, m2] = String(b).slice(0, 7).split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

function buildProjection(asset, amount, extra) {
  const base = Number(asset.base_cost || 0);
  const accumulated = Number(asset.accumulated || 0);
  const salvage = Number(asset.salvage_value || 0);
  const life = Number(asset.useful_life_months || 0);

  if (!life) return null;

  const start = asset.depreciation_start;
  const next = asset.last_depreciation_period
    ? addMonthsPeriod(asset.last_depreciation_period, 1)
    : start
      ? String(start).slice(0, 7)
      : null;

  const elapsed = start && next ? Math.max(0, monthsBetween(start, next)) : 0;
  const remaining = Math.max(1, life - elapsed);
  const newRemaining = remaining + extra;
  const residual = Math.max(0, base - accumulated);

  return {
    started: Boolean(asset.last_depreciation_period),
    hasStart: Boolean(start),
    fullyDepreciated: life - elapsed <= 0,
    base,
    newBase: base + amount,
    residual,
    newResidual: residual + amount,
    life,
    newLife: life + extra,
    remaining,
    newRemaining,
    current: Math.max(0, residual - salvage) / remaining,
    monthly: Math.max(0, residual + amount - salvage) / newRemaining,
    endPeriod: next ? addMonthsPeriod(next, newRemaining - 1) : null,
  };
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

function CompareRow({ label, from, to }) {
  const changed = from !== to;
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 1, py: 0.4 }}>
      <Typography sx={{ fontSize: 13, color: ILT_COLORS.text }}>{label}</Typography>
      <Typography sx={{ fontSize: 13, textAlign: "right", whiteSpace: "nowrap" }}>
        {changed ? (
          <>
            <Box component="span" sx={{ color: "text.secondary" }}>{from}</Box>
            {"  →  "}
            <Box component="span" sx={{ fontWeight: 700, color: ILT_COLORS.title }}>{to}</Box>
          </>
        ) : (
          <Box component="span" sx={{ fontWeight: 700 }}>{to}</Box>
        )}
      </Typography>
    </Box>
  );
}

export default function FixedAssetImprovementDialog({
  open,
  onClose,
  purchaseId,
  lineId = null,
  previewUrl = null,
  onCreated,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState(null);
  const [assets, setAssets] = useState([]);
  const [groups, setGroups] = useState([]);
  const [imageUrl, setImageUrl] = useState(previewUrl);
  const [asset, setAsset] = useState(null);
  const [amount, setAmount] = useState("");
  const [extraMonths, setExtraMonths] = useState("");

  useEffect(() => {
    if (!open || !purchaseId) return;

    let cancelled = false;
    setLoading(true);
    setError("");
    setSubmitted(false);
    setSource(null);
    setAsset(null);
    setExtraMonths("");
    setImageUrl(previewUrl);

    Promise.all([
      fixedAssetsApi.getPurchaseSource(purchaseId, lineId),
      fixedAssetsApi.getAssets({ active_only: 1 }),
      fixedAssetsApi.getGroups(),
      previewUrl ? Promise.resolve(null) : api.get(`/purchases/${purchaseId}/`, { withCredentials: true }),
    ])
      .then(([src, list, grp, purchaseRes]) => {
        if (cancelled) return;
        setSource(src.data);
        const available = Number(src.data.available_amount || 0);
        setAmount(available > 0 ? toCommaInput(available) : "");
        setAssets(list.data || []);
        setGroups(grp.data || []);
        if (purchaseRes?.data) setImageUrl(purchaseRes.data.preview_url || null);
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
  }, [open, purchaseId, lineId, previewUrl]);

  const group = useMemo(
    () => (asset ? groups.find((g) => g.id === asset.group) || null : null),
    [asset, groups],
  );

  const available = Number(source?.available_amount || 0);
  const cost = toNumber(amount);
  const extra = Number(extraMonths || 0);

  const errors = {};
  if (!asset) errors.asset = "Pasirinkite turtą";
  if (!amount) errors.amount = "Nurodykite sumą";

  const liveErrors = {};
  if (amount) {
    if (!Number.isFinite(cost) || cost <= 0) liveErrors.amount = "Suma turi būti didesnė už 0";
    else if (cost > available + 0.0001) liveErrors.amount = `Viršija likutį ${fmtEur(available)}`;
  }

  const fieldError = (f) => liveErrors[f] || (submitted ? errors[f] : "");
  const hasErrors = Object.keys(errors).length > 0 || Object.keys(liveErrors).length > 0;

  const costValid = !liveErrors.amount && Number.isFinite(cost) && cost > 0;
  const projection = asset && costValid ? buildProjection(asset, cost, extra) : null;
  const needsReclass = Boolean(group && source && group.asset_account !== source.source_account);

  const handleSubmit = async () => {
    setSubmitted(true);
    if (loading || saving || !source || hasErrors) return;

    setSaving(true);
    setError("");
    try {
      const { data } = await fixedAssetsApi.createImprovement({
        asset_id: asset.id,
        purchase_id: purchaseId,
        purchase_line_id: lineId,
        amount: cost.toFixed(2),
        extra_months: extra,
      });
      await onCreated?.(data);
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const renderProjection = () => {
    if (!projection) return null;
    const p = projection;

    return (
      <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: ILT_COLORS.bg, border: `1px solid ${ILT_COLORS.border}` }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: ILT_COLORS.title, mb: 0.5 }}>
          Kaip pasikeis nusidėvėjimas
        </Typography>

        <CompareRow label="Savikaina" from={fmtEur(p.base)} to={fmtEur(p.newBase)} />
        <CompareRow label="Likutinė vertė" from={fmtEur(p.residual)} to={fmtEur(p.newResidual)} />
        <CompareRow label="Naudingo tarnavimo laikas" from={`${p.life} mėn.`} to={`${p.newLife} mėn.`} />

        {p.hasStart && (
          <>
            <CompareRow label="Liko nudėvėti mėnesių" from={`${p.remaining}`} to={`${p.newRemaining}`} />
            <CompareRow
              label="Mėnesinis nusidėvėjimas"
              from={fmtEur(p.current)}
              to={fmtEur(p.monthly)}
            />
            {p.endPeriod && <CompareRow label="Paskutinis mėnuo" from={fmtPeriod(p.endPeriod)} to={fmtPeriod(p.endPeriod)} />}
          </>
        )}

        <Typography sx={{ fontSize: 12, color: ILT_COLORS.text, mt: 1 }}>
          {!p.hasStart
            ? "Nusidėvėjimas dar neprasidėjo - bus skaičiuojamas nuo naujos savikainos."
            : p.started
              ? "Jau užregistruotas nusidėvėjimas nekeičiamas. Nauja likutinė vertė paskirstoma likusiems mėnesiams."
              : "Nusidėvėjimas dar neregistruotas - bus skaičiuojamas nuo naujos savikainos."}
          {" "}Sumos apytikslės, tikslus skaičiavimas registruojant nusidėvėjimą.
        </Typography>

        {p.fullyDepreciated && extra === 0 && (
          <Alert severity="warning" sx={{ mt: 1, fontSize: 12 }}>
            Turtas jau visiškai nudėvėtas. Be pailginimo visa pagerinimo suma bus nudėvėta per 1 mėnesį -
            nurodykite, kiek mėnesių pagerinimas pratęsia naudojimą.
          </Alert>
        )}
      </Box>
    );
  };

  const renderForm = () => (
    <Stack spacing={2}>
      <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: "#fafafa", border: "1px solid", borderColor: "divider" }}>
        <Typography sx={{ fontSize: 13, color: "text.secondary", lineHeight: 1.7 }}>
          Tiekėjas: <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>{source.seller_name || "—"}</Box>
        </Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary", lineHeight: 1.7 }}>
          {source.is_sumiskai ? "Dokumento" : "Eilutės"} suma (be PVM):{" "}
          <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>{fmtEur(source.source_amount)}</Box>
        </Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary", lineHeight: 1.7 }}>
          Likutis (be PVM):{" "}
          <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>{fmtEur(source.available_amount)}</Box>
        </Typography>
      </Box>

      <Alert severity="info" sx={{ fontSize: 12 }}>
        Pagerinimas - modernizacija ar rekonstrukcija, kuri padidina turto vertę ar pailgina naudojimą.
        Įprastas remontas nėra pagerinimas.
      </Alert>

      <Autocomplete
        options={assets}
        value={asset}
        onChange={(_, v) => setAsset(v)}
        getOptionLabel={(a) => `${a.inventory_number ? `${a.inventory_number} · ` : ""}${a.name}`}
        isOptionEqualToValue={(o, v) => o.id === v.id}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Pagerinamas turtas"
            size="small"
            error={Boolean(fieldError("asset"))}
            helperText={fieldError("asset")}
          />
        )}
      />

      <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
        <MoneyField
          label="Pagerinimo suma, EUR"
          size="small"
          value={amount}
          onChange={setAmount}
          error={Boolean(fieldError("amount"))}
          helperText={fieldError("amount")}
          fullWidth
        />
        <TextField
          label="Pailginti naudojimą, mėn."
          size="small"
          value={extraMonths}
          onChange={(e) => setExtraMonths(sanitizeInt(e.target.value))}
          helperText="Neprivaloma"
          inputProps={{ inputMode: "numeric" }}
          fullWidth
        />
      </Box>

      {renderProjection()}

      {group && costValid && (
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

      {submitted && hasErrors && (
        <Alert severity="warning" sx={{ fontSize: 13 }}>Užpildykite pažymėtus laukus</Alert>
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
          bgcolor: ILT_COLORS.bg,
          borderBottom: `1px solid ${ILT_COLORS.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <WeekendIcon sx={{ color: ILT_COLORS.icon }} />
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>Turto pagerinimas</Typography>
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
              <DocumentImagePane
                src={imageUrl}
                maxHeight={isMobile ? "220px" : "calc(90vh - 170px)"}
                minHeight={isMobile ? 220 : 300}
              />
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
          disabled={loading || saving || !source}
          sx={{ textTransform: "none", borderRadius: 3, background: "linear-gradient(135deg, #FF9800, #F57C00)" }}
        >
          {saving ? <CircularProgress size={18} sx={{ color: "#fff" }} /> : "Pridėti pagerinimą"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}