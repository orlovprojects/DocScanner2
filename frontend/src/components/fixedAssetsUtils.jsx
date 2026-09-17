import { Box, Chip } from "@mui/material";
import { ILT_COLORS } from "./IltBanner";

export const ASSET_STATUS = {
  draft: { label: "Juodraštis", bg: "#F3F4F6", color: "#4B5563" },
  active: { label: "Eksploatuojamas", bg: "#E8F5E9", color: "#2E7D32" },
  sold: { label: "Parduotas", bg: "#E3F2FD", color: "#1565C0" },
  written_off: { label: "Nurašytas", bg: "#FDECEA", color: "#B42318" },
};

export const WRITE_OFF_REASONS = [
  { value: "sugedo", label: "Sugedo" },
  { value: "sunaikintas", label: "Sunaikintas" },
  { value: "prarastas", label: "Prarastas" },
  { value: "netinkamas", label: "Netinkamas naudoti" },
  { value: "kita", label: "Kita" },
];

export function fmtEur(val) {
  const num = Number(val);
  if (val == null || val === "" || Number.isNaN(num)) return "—";
  return `${num.toLocaleString("lt-LT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} EUR`;
}

export function fmtDate(iso) {
  if (!iso) return "—";
  return String(iso).slice(0, 10);
}

export function fmtPeriod(iso) {
  if (!iso) return "—";
  return String(iso).slice(0, 7);
}

export function todayIso() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function addMonthsPeriod(period, n) {
  const [y, m] = String(period).slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export function nextMonthStart(dateStr) {
  if (!dateStr) return null;
  return `${addMonthsPeriod(dateStr, 1)}-01`;
}

export function errorText(e) {
  const d = e?.response?.data;
  if (!d) return e?.message || "Klaida";
  if (typeof d === "string") return d;
  if (d.detail) return d.detail;
  const first = Object.values(d)[0];
  return Array.isArray(first) ? first[0] : String(first);
}

export function isFullyDepreciated(asset) {
  if (!asset || asset.status !== "active") return false;
  const accumulated = Number(asset.accumulated || 0);
  const residual = Number(asset.residual || 0);
  const salvage = Number(asset.salvage_value || 0);
  return accumulated > 0 && residual <= salvage + 0.001;
}

export function AssetStatusChip({ asset }) {
  const cfg = ASSET_STATUS[asset?.status] || ASSET_STATUS.draft;

  return (
    <Box sx={{ display: "inline-flex", gap: 0.5, flexWrap: "wrap" }}>
      <Chip
        label={cfg.label}
        size="small"
        sx={{ bgcolor: cfg.bg, color: cfg.color, fontWeight: 600 }}
      />
      {isFullyDepreciated(asset) && (
        <Chip
          label="Visiškai nudėvėtas"
          size="small"
          sx={{
            bgcolor: ILT_COLORS.bg,
            color: ILT_COLORS.title,
            border: `1px solid ${ILT_COLORS.border}`,
            fontWeight: 600,
          }}
        />
      )}
    </Box>
  );
}