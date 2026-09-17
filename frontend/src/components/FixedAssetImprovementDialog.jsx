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
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import WeekendIcon from "@mui/icons-material/Weekend";
import { fixedAssetsApi } from "../api/fixedAssetsApi";
import { ILT_COLORS } from "./IltBanner";
import { errorText, fmtEur } from "./fixedAssetsUtils";

export default function FixedAssetImprovementDialog({ open, onClose, purchaseId, lineId = null, onCreated }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState(null);
  const [assets, setAssets] = useState([]);
  const [groups, setGroups] = useState([]);
  const [asset, setAsset] = useState(null);
  const [amount, setAmount] = useState("");
  const [extraMonths, setExtraMonths] = useState("");

  useEffect(() => {
    if (!open || !purchaseId) return;

    let cancelled = false;
    setLoading(true);
    setError("");
    setSource(null);
    setAsset(null);
    setExtraMonths("");

    Promise.all([
      fixedAssetsApi.getPurchaseSource(purchaseId, lineId),
      fixedAssetsApi.getAssets({ active_only: 1 }),
      fixedAssetsApi.getGroups(),
    ])
      .then(([src, list, grp]) => {
        if (cancelled) return;
        setSource(src.data);
        setAmount(src.data.available_amount ?? "");
        setAssets(list.data || []);
        setGroups(grp.data || []);
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
    () => (asset ? groups.find((g) => g.id === asset.group) || null : null),
    [asset, groups],
  );

  const cost = Number(amount);
  const available = Number(source?.available_amount || 0);
  const costInvalid = !cost || cost <= 0 || cost > available + 0.0001;
  const needsReclass = Boolean(group && source && group.asset_account !== source.source_account);

  const canSubmit = !loading && !saving && source && asset && !costInvalid;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      const { data } = await fixedAssetsApi.createImprovement({
        asset_id: asset.id,
        purchase_id: purchaseId,
        purchase_line_id: lineId,
        amount: cost.toFixed(2),
        extra_months: Number(extraMonths || 0),
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
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>Turto pagerinimas</Typography>
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
            <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: "#fafafa", border: "1px solid", borderColor: "divider" }}>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                Tiekėjas: <b>{source.seller_name || "—"}</b>
              </Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                Pirkimo suma (be PVM): <b>{fmtEur(source.source_amount)}</b> · Galima: <b>{fmtEur(source.available_amount)}</b>
              </Typography>
            </Box>

            <Autocomplete
              options={assets}
              value={asset}
              onChange={(_, v) => setAsset(v)}
              getOptionLabel={(a) => `${a.inventory_number ? `${a.inventory_number} · ` : ""}${a.name}`}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              renderInput={(params) => <TextField {...params} label="Pagerinamas turtas" size="small" />}
            />

            {asset && (
              <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: ILT_COLORS.bg, border: `1px solid ${ILT_COLORS.border}` }}>
                <Typography sx={{ fontSize: 12, color: ILT_COLORS.text }}>
                  Savikaina: <b>{fmtEur(asset.base_cost)}</b> · Likutinė vertė: <b>{fmtEur(asset.residual)}</b>
                </Typography>
                <Typography sx={{ fontSize: 12, color: ILT_COLORS.text }}>
                  Naudingo tarnavimo laikas: <b>{asset.useful_life_months || "—"} mėn.</b>
                  {!costInvalid && <> · Nauja savikaina: <b>{fmtEur(Number(asset.base_cost || 0) + cost)}</b></>}
                </Typography>
              </Box>
            )}

            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField
                label="Pagerinimo suma, EUR"
                size="small"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                error={Boolean(amount) && costInvalid}
                helperText={Boolean(amount) && costInvalid ? `Daugiausiai ${fmtEur(available)}` : " "}
                inputProps={{ step: "0.01", min: 0 }}
                fullWidth
              />
              <TextField
                label="Pailginti tarnavimo laiką, mėn."
                size="small"
                type="number"
                value={extraMonths}
                onChange={(e) => setExtraMonths(e.target.value)}
                helperText="Neprivaloma"
                inputProps={{ min: 0 }}
                fullWidth
              />
            </Box>

            {group && (
              <Box sx={{ p: 1.25, borderRadius: 1.5, border: "1px solid", borderColor: "divider" }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, mb: 0.5 }}>DK įrašas</Typography>
                {needsReclass ? (
                  <Typography sx={{ fontSize: 12 }}>
                    D {group.asset_account} {group.asset_account_name} / K {source.source_account} - {fmtEur(cost)}
                  </Typography>
                ) : (
                  <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                    Pirkimas jau užregistruotas turto sąskaitoje - DK įrašas nekuriamas
                  </Typography>
                )}
                <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.5 }}>
                  Būsimas nusidėvėjimas bus perskaičiuotas pagal naują savikainą.
                </Typography>
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
          sx={{ textTransform: "none", borderRadius: 3, background: "linear-gradient(135deg, #FF9800, #F57C00)" }}
        >
          {saving ? <CircularProgress size={18} sx={{ color: "#fff" }} /> : "Pridėti pagerinimą"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}