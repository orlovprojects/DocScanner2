import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  InputAdornment,
  Radio,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { fixedAssetsApi } from "../api/fixedAssetsApi";
import { ILT_COLORS } from "./IltBanner";
import { errorText, fmtDate, fmtEur } from "./fixedAssetsUtils";

function fmtMoney(val, currency) {
  const num = Number(val);
  if (val == null || Number.isNaN(num)) return "—";
  return `${num.toLocaleString("lt-LT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || "EUR"}`;
}

function OptionRow({ checked, disabled, onSelect, title, subtitle, amount }) {
  return (
    <Box
      onClick={disabled ? undefined : onSelect}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1,
        py: 0.5,
        borderRadius: 1,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        bgcolor: checked ? ILT_COLORS.bg : "transparent",
        "&:hover": disabled ? undefined : { bgcolor: ILT_COLORS.bg },
      }}
    >
      <Radio size="small" checked={checked} disabled={disabled} sx={{ p: 0.5 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600 }} noWrap>{title}</Typography>
        {subtitle && <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{subtitle}</Typography>}
      </Box>
      <Typography sx={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{amount}</Typography>
    </Box>
  );
}

export default function FixedAssetSaleDialog({ open, asset, onClose, onConfirm, busy }) {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (open) {
      setSearch("");
      setSelected(null);
      setError("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await fixedAssetsApi.getSaleCandidates(search.trim());
        if (!cancelled) setItems(data || []);
      } catch (e) {
        if (!cancelled) setError(errorText(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search.trim() ? 400 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, search]);

  const isSelected = (invoiceId, lineId) =>
    selected?.invoice.id === invoiceId && (selected?.line?.id ?? null) === lineId;

  const amount = selected
    ? Number(selected.line ? selected.line.subtotal : selected.invoice.amount_wo_vat)
    : 0;
  const currency = selected?.invoice.currency || "EUR";
  const residual = Number(asset?.residual || 0);
  const diff = amount - residual;

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      disableScrollLock
      PaperProps={{ sx: { borderRadius: "12px" } }}
    >
      <Box sx={{ px: 2.5, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700 }}>Parduoti turtą</Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          Pasirinkite išrašytą pardavimo sąskaitą ir eilutę
        </Typography>
      </Box>

      <DialogContent sx={{ pt: 2 }}>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <TextField
            size="small"
            placeholder="Ieškoti pagal numerį ar pirkėją..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 20, color: "text.disabled" }} />
                </InputAdornment>
              ),
            }}
          />

          {error && <Alert severity="error">{error}</Alert>}

          <Box sx={{ maxHeight: 340, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1.5, p: 0.5 }}>
            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress size={24} />
              </Box>
            ) : items.length === 0 ? (
              <Typography sx={{ fontSize: 13, color: "text.secondary", textAlign: "center", py: 4 }}>
                Sąskaitų nerasta
              </Typography>
            ) : (
              items.map((inv) => (
                <Box key={inv.id} sx={{ mb: 0.5, pb: 0.5, borderBottom: "1px solid", borderColor: "divider" }}>
                  {inv.lines.length === 0 ? (
                    <OptionRow
                      checked={isSelected(inv.id, null)}
                      disabled={inv.used}
                      onSelect={() => setSelected({ invoice: inv, line: null })}
                      title={`${inv.number} · ${inv.buyer_name || "—"}`}
                      subtitle={`${fmtDate(inv.invoice_date)}${inv.used ? " · jau panaudota" : ""}`}
                      amount={fmtMoney(inv.amount_wo_vat, inv.currency)}
                    />
                  ) : (
                    <>
                      <Typography sx={{ fontSize: 12, fontWeight: 700, px: 1, pt: 0.5 }}>
                        {inv.number} · {inv.buyer_name || "—"}
                        <Typography component="span" sx={{ fontSize: 11, color: "text.secondary", ml: 1 }}>
                          {fmtDate(inv.invoice_date)}
                        </Typography>
                      </Typography>
                      {inv.lines.map((line) => (
                        <OptionRow
                          key={line.id}
                          checked={isSelected(inv.id, line.id)}
                          disabled={line.used}
                          onSelect={() => setSelected({ invoice: inv, line })}
                          title={line.name || "Eilutė"}
                          subtitle={line.used ? "jau panaudota" : null}
                          amount={fmtMoney(line.subtotal, inv.currency)}
                        />
                      ))}
                    </>
                  )}
                </Box>
              ))
            )}
          </Box>

          {selected && (
            <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: ILT_COLORS.bg, border: `1px solid ${ILT_COLORS.border}` }}>
              <Typography sx={{ fontSize: 13, color: ILT_COLORS.text }}>
                Pardavimo suma (be PVM): <b>{fmtMoney(amount, currency)}</b>
              </Typography>
              <Typography sx={{ fontSize: 13, color: ILT_COLORS.text }}>
                Likutinė vertė: <b>{fmtEur(residual)}</b>
              </Typography>
              {currency === "EUR" && (
                <Typography sx={{ fontSize: 13, color: diff >= 0 ? "#2E7D32" : "#B42318", fontWeight: 700 }}>
                  {diff >= 0 ? "Pelnas" : "Nuostolis"} apytiksliai: {fmtEur(Math.abs(diff))}
                </Typography>
              )}
            </Box>
          )}

          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            Pasirinktos eilutės pajamų sąskaita bus pakeista į 5400. Jei trūksta nusidėvėjimo iki
            pardavimo mėnesio, jis bus priskaičiuotas automatiškai.
          </Typography>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: "none" }}>
          Atšaukti
        </Button>
        <Button
          variant="contained"
          disabled={busy || !selected}
          onClick={() =>
            onConfirm({
              invoice_id: selected.invoice.id,
              invoice_line_id: selected.line?.id ?? null,
            })
          }
          sx={{ textTransform: "none", borderRadius: 3, background: "linear-gradient(135deg, #FF9800, #F57C00)" }}
        >
          {busy ? <CircularProgress size={18} sx={{ color: "#fff" }} /> : "Parduoti"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}