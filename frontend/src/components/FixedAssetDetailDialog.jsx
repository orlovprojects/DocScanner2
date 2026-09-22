import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import WeekendIcon from "@mui/icons-material/Weekend";
import { fixedAssetsApi } from "../api/fixedAssetsApi";
import DocumentImageDialog from "./DocumentImageDialog";
import FixedAssetSaleDialog from "./FixedAssetSaleDialog";
import {
  AssetStatusChip,
  WRITE_OFF_REASONS,
  errorText,
  fmtDate,
  fmtEur,
  fmtPeriod,
  todayIso,
  MoneyField,
  sanitizeInt,
  toCommaInput,
  toNumber,
} from "./fixedAssetsUtils";
import LtDatePicker from "./LtDatePicker";

const headCellSx = { fontWeight: 600, bgcolor: "#f3f4f6", fontSize: 12 };
const cellSx = { fontSize: 13 };

function InfoRow({ label, children }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "220px 1fr",
        gap: 1,
        py: 0.6,
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{label}</Typography>
      <Box sx={{ fontSize: 13, fontWeight: 600 }}>{children}</Box>
    </Box>
  );
}

function WriteOffDialog({ open, onClose, onConfirm, busy }) {
  const [form, setForm] = useState({ disposal_date: todayIso(), reason: "sugedo", comment: "" });

  useEffect(() => {
    if (open) setForm({ disposal_date: todayIso(), reason: "sugedo", comment: "" });
  }, [open]);

  const setField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      disableScrollLock
      PaperProps={{ sx: { borderRadius: "12px" } }}
    >
      <Box sx={{ px: 2.5, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700 }}>Nurašyti turtą</Typography>
      </Box>
      <DialogContent sx={{ pt: 2 }}>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <LtDatePicker
            label="Nurašymo data"
            value={form.disposal_date}
            onChange={(v) => setForm((prev) => ({ ...prev, disposal_date: v }))}
          />
          <TextField
            select
            label="Priežastis"
            size="small"
            value={form.reason}
            onChange={setField("reason")}
            SelectProps={{ MenuProps: { disableScrollLock: true } }}
          >
            {WRITE_OFF_REASONS.map((r) => (
              <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Komentaras"
            size="small"
            value={form.comment}
            onChange={setField("comment")}
            multiline
            minRows={2}
          />
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            Jei trūksta nusidėvėjimo iki nurašymo mėnesio, jis bus priskaičiuotas automatiškai.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: "none" }}>
          Atšaukti
        </Button>
        <Button
          variant="contained"
          color="error"
          disabled={busy || !form.disposal_date}
          onClick={() => onConfirm(form)}
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          {busy ? <CircularProgress size={18} sx={{ color: "#fff" }} /> : "Nurašyti"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function FixedAssetDetailDialog({
  open,
  assetId,
  onClose,
  onChanged,
  activeProfileId,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [asset, setAsset] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState(0);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);

  const load = useCallback(async () => {
    if (!assetId) return;
    setLoading(true);
    setError("");
    try {
      const [a, s, o] = await Promise.all([
        fixedAssetsApi.getAsset(assetId),
        fixedAssetsApi.getSchedule(assetId),
        fixedAssetsApi.getOperations(assetId),
      ]);
      setAsset(a.data);
      setSchedule(s.data || []);
      setOperations(o.data || []);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    if (open) {
      setTab(0);
      setEditing(false);
      load();
    } else {
      setAsset(null);
      setSchedule([]);
      setOperations([]);
      setError("");
    }
  }, [open, load]);

  const hasDepreciation = operations.some(
    (op) => op.operation_type === "depreciation" && op.reason !== "pradiniai_likuciai",
  );
  const hasBlockingOps = operations.some(
    (op) => op.operation_type !== "acquisition" && op.reason !== "pradiniai_likuciai",
  );
  const isClosed = asset?.status === "sold" || asset?.status === "written_off";

  const runAction = async (fn, { close = false } = {}) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onChanged?.();
      if (close) onClose();
      else await load();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    setForm({
      name: asset.name || "",
      description: asset.description || "",
      operation_start_date: asset.operation_start_date || "",
      useful_life_months: asset.useful_life_months ? String(asset.useful_life_months) : "",
      salvage_value: toCommaInput(Number(asset.salvage_value || 0)),
    });
    setEditing(true);
  };

  const setField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const saveEdit = async () => {
    const life = Number(form.useful_life_months);
    const salvage = toNumber(form.salvage_value || "0");

    if (!form.name.trim()) {
      setError("Nurodykite pavadinimą");
      return;
    }
    if (!Number.isInteger(life) || life < 1) {
      setError("Nurodykite naudingo tarnavimo laiką");
      return;
    }
    if (!Number.isFinite(salvage) || salvage < 0) {
      setError("Neteisinga likvidacinė vertė");
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description,
      useful_life_months: life,
      salvage_value: salvage.toFixed(2),
    };

    if (!hasDepreciation) {
      payload.operation_start_date = form.operation_start_date || null;
    }

    const ok = await runAction(() => fixedAssetsApi.updateAsset(asset.id, payload));
    if (ok) setEditing(false);
  };

  const handleDelete = () => {
    if (!window.confirm("Ar tikrai norite ištrinti šį ilgalaikį turtą? Reklasifikacijos DK įrašas bus pašalintas.")) return;
    runAction(() => fixedAssetsApi.deleteAsset(asset.id), { close: true });
  };

  const handleWriteOff = async (data) => {
    const ok = await runAction(() => fixedAssetsApi.writeOff(asset.id, data));
    if (ok) setWriteOffOpen(false);
  };

  const handleCreateInvoice = () => {
    window.open(`/israsymas/nauja?fixed_asset=${asset.id}`, "_blank");
  };

  const handleSell = async (data) => {
    const ok = await runAction(() => fixedAssetsApi.sell(asset.id, data));
    if (ok) setSaleOpen(false);
  };

  const handleCancelImprovement = (op) => {
    if (!window.confirm(`Atšaukti pagerinimą ${fmtEur(op.amount)}? Reklasifikacijos DK įrašas bus pašalintas.`)) return;
    runAction(() => fixedAssetsApi.cancelImprovement(op.id));
  };

  const handleCancelDisposal = () => {
    const isSale = asset.status === "sold";
    if (!window.confirm(isSale ? "Atšaukti pardavimą?" : "Atšaukti nurašymą?")) return;
    runAction(() =>
      isSale ? fixedAssetsApi.cancelSale(asset.id) : fixedAssetsApi.cancelWriteOff(asset.id),
    );
  };

  const renderInfo = () => {
    if (editing) {
      return (
        <Stack spacing={2} sx={{ mt: 2 }}>
          <TextField label="Pavadinimas" size="small" value={form.name} onChange={setField("name")} />

          <Box sx={{ display: "flex", gap: 2, flexDirection: isMobile ? "column" : "row" }}>
            <TextField
              label="Inventorinis nr."
              size="small"
              value={asset.inventory_number || ""}
              disabled
              fullWidth
            />
            <LtDatePicker
              label="Eksploatacijos pradžia"
              value={form.operation_start_date}
              onChange={(v) => setForm((prev) => ({ ...prev, operation_start_date: v }))}
              minDate={asset.purchase_date}
              disabled={hasDepreciation}
              helperText={hasDepreciation ? "Jau nudėvimas - keisti negalima" : ""}
            />
          </Box>

          <Box sx={{ display: "flex", gap: 2, flexDirection: isMobile ? "column" : "row" }}>
            <TextField
              label="Naudingo tarnavimo laikas, mėn."
              size="small"
              value={form.useful_life_months}
              onChange={(e) => setForm((prev) => ({ ...prev, useful_life_months: sanitizeInt(e.target.value) }))}
              inputProps={{ inputMode: "numeric" }}
              fullWidth
            />
            <MoneyField
              label="Likvidacinė vertė, EUR"
              size="small"
              value={form.salvage_value}
              onChange={(v) => setForm((prev) => ({ ...prev, salvage_value: v }))}
              helperText="Suma, kurią tikitės gauti pabaigoje. Dažniausiai 0"
              fullWidth
            />
          </Box>

          <TextField
            label="Aprašymas"
            size="small"
            value={form.description}
            onChange={setField("description")}
            multiline
            minRows={2}
          />

          {hasDepreciation && (
            <Alert severity="info" sx={{ fontSize: 12 }}>
              Pakeitus tarnavimo laiką ar likvidacinę vertę, jau užregistruotas nusidėvėjimas nekeičiamas -
              perskaičiuojami tik būsimi mėnesiai.
            </Alert>
          )}
        </Stack>
      );
    }

    return (
      <Box sx={{ mt: 1 }}>
        <InfoRow label="Inventorinis nr.">{asset.inventory_number || "—"}</InfoRow>
        <InfoRow label="Turto grupė">{asset.group_display || "—"}</InfoRow>
        <InfoRow label="Statusas"><AssetStatusChip asset={asset} /></InfoRow>
        <InfoRow label="Įsigijimo data">{fmtDate(asset.purchase_date)}</InfoRow>
        <InfoRow label="Eksploatacijos pradžia">{fmtDate(asset.operation_start_date)}</InfoRow>
        <InfoRow label="Nusidėvėjimas nuo">{fmtDate(asset.depreciation_start)}</InfoRow>
        <InfoRow label="Naudingo tarnavimo laikas">
          {asset.useful_life_months ? `${asset.useful_life_months} mėn.` : "—"}
        </InfoRow>
        <InfoRow label="Įsigijimo savikaina">{fmtEur(asset.base_cost)}</InfoRow>
        <InfoRow label="Likvidacinė vertė">{fmtEur(asset.salvage_value)}</InfoRow>
        <InfoRow label="Sukauptas nusidėvėjimas">{fmtEur(asset.accumulated)}</InfoRow>
        <InfoRow label="Likutinė vertė">{fmtEur(asset.residual)}</InfoRow>
        {asset.disposal_date && (
          <InfoRow label={asset.status === "sold" ? "Pardavimo data" : "Nurašymo data"}>
            {fmtDate(asset.disposal_date)}
          </InfoRow>
        )}
        <InfoRow label="Pirkimo dokumentas">
          {asset.purchase ? (
            <Typography
              component="span"
              onClick={() => setPurchaseOpen(true)}
              sx={{
                fontSize: 13,
                fontWeight: 700,
                color: "primary.main",
                cursor: "pointer",
                "&:hover": { textDecoration: "underline" },
              }}
            >
              {asset.purchase_document || `#${asset.purchase}`}
            </Typography>
          ) : (
            "—"
          )}
        </InfoRow>
        {asset.description && <InfoRow label="Aprašymas">{asset.description}</InfoRow>}
      </Box>
    );
  };

  const renderSchedule = () => {
    if (schedule.length === 0) {
      return (
        <Typography sx={{ fontSize: 13, color: "text.secondary", py: 3, textAlign: "center" }}>
          Grafikas nesudarytas - nurodykite eksploatacijos pradžią ir tarnavimo laiką
        </Typography>
      );
    }

    return (
      <TableContainer sx={{ maxHeight: 420, mt: 1 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={headCellSx}>Periodas</TableCell>
              <TableCell sx={headCellSx} align="right">Nusidėvėjimas</TableCell>
              <TableCell sx={headCellSx} align="right">Sukauptas</TableCell>
              <TableCell sx={headCellSx} align="right">Likutinė vertė</TableCell>
              <TableCell sx={headCellSx} />
            </TableRow>
          </TableHead>
          <TableBody>
            {schedule.map((row) => (
              <TableRow key={row.period} sx={row.registered ? { bgcolor: "#F6FBF6" } : undefined}>
                <TableCell sx={cellSx}>{fmtPeriod(row.period)}</TableCell>
                <TableCell sx={cellSx} align="right">{fmtEur(row.amount)}</TableCell>
                <TableCell sx={cellSx} align="right">{fmtEur(row.accumulated)}</TableCell>
                <TableCell sx={cellSx} align="right">{fmtEur(row.residual)}</TableCell>
                <TableCell sx={cellSx}>
                  {row.opening ? (
                    <Chip label="Pradiniai likučiai" size="small" sx={{ bgcolor: "#FFF8EE", color: "#7A4A12", fontWeight: 600, height: 20, fontSize: 11 }} />
                  ) : row.registered ? (
                    <Chip label="Užregistruota" size="small" sx={{ bgcolor: "#E8F5E9", color: "#2E7D32", fontWeight: 600, height: 20, fontSize: 11 }} />
                  ) : (
                    <Chip label="Planuojama" size="small" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  const renderOperations = () => (
    <TableContainer sx={{ maxHeight: 420, mt: 1 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={headCellSx}>Data</TableCell>
            <TableCell sx={headCellSx}>Operacija</TableCell>
            <TableCell sx={headCellSx}>Periodas</TableCell>
            <TableCell sx={headCellSx} align="right">Suma</TableCell>
            <TableCell sx={headCellSx}>DK</TableCell>
            <TableCell sx={headCellSx}>Aprašymas</TableCell>
            <TableCell sx={headCellSx} />
          </TableRow>
        </TableHead>
        <TableBody>
          {operations.map((op) => (
            <TableRow key={op.id}>
              <TableCell sx={cellSx}>{fmtDate(op.operation_date)}</TableCell>
              <TableCell sx={{ ...cellSx, fontWeight: 600 }}>
                {op.operation_type_display}
                {op.reason === "pradiniai_likuciai" && (
                  <Typography component="span" sx={{ fontSize: 11, color: "text.secondary", ml: 0.5 }}>
                    (pradiniai likučiai)
                  </Typography>
                )}
              </TableCell>
              <TableCell sx={cellSx}>{op.period ? fmtPeriod(op.period) : "—"}</TableCell>
              <TableCell sx={cellSx} align="right">{fmtEur(op.amount)}</TableCell>
              <TableCell sx={cellSx}>{op.journal_entry_number || (op.journal_entry ? `#${op.journal_entry}` : "—")}</TableCell>
              <TableCell sx={{ ...cellSx, color: "text.secondary" }}>
                {op.description || "—"}
                {op.extra_months > 0 && ` (+${op.extra_months} mėn.)`}
              </TableCell>
              <TableCell sx={cellSx}>
                {op.operation_type === "improvement" && !isClosed && (
                  <Button
                    size="small"
                    color="error"
                    onClick={() => handleCancelImprovement(op)}
                    disabled={busy}
                    sx={{ textTransform: "none", minWidth: 0 }}
                  >
                    Atšaukti
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {operations.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} align="center" sx={{ ...cellSx, color: "text.secondary", py: 3 }}>
                Operacijų nėra
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <>
      <Dialog
        open={open}
        onClose={busy ? undefined : onClose}
        fullWidth
        maxWidth="md"
        fullScreen={isMobile}
        disableScrollLock
        PaperProps={{ sx: isMobile ? {} : { borderRadius: "14px", minHeight: "70vh" } }}
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
            gap: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
            <WeekendIcon sx={{ color: "#e08d21" }} />
            <Typography sx={{ fontSize: 16, fontWeight: 700 }} noWrap>
              {asset ? asset.name : "Ilgalaikis turtas"}
            </Typography>
            {asset?.inventory_number && (
              <Chip label={asset.inventory_number} size="small" variant="outlined" sx={{ fontWeight: 600 }} />
            )}
          </Box>
          <IconButton onClick={onClose} disabled={busy}>
            <CloseIcon />
          </IconButton>
        </Box>

        <DialogContent sx={{ pt: 1 }}>
          {loading && !asset ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress size={28} />
            </Box>
          ) : !asset ? (
            error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
          ) : (
            <>
              <Tabs
                value={tab}
                onChange={(_, v) => setTab(v)}
                sx={{ borderBottom: "1px solid", borderColor: "divider", minHeight: 40, "& .MuiTab-root": { textTransform: "none", minHeight: 40 } }}
              >
                <Tab label="Informacija" />
                <Tab label={`Nusidėvėjimo grafikas (${schedule.length})`} />
                <Tab label={`Operacijos (${operations.length})`} />
              </Tabs>

              {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

              {tab === 0 && renderInfo()}
              {tab === 1 && renderSchedule()}
              {tab === 2 && renderOperations()}
            </>
          )}
        </DialogContent>

        {asset && (
          <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
            <Box>
              {!hasBlockingOps && !isClosed && !editing && (
                <Button color="error" onClick={handleDelete} disabled={busy} sx={{ textTransform: "none" }}>
                  Ištrinti
                </Button>
              )}
            </Box>

            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {editing ? (
                <>
                  <Button onClick={() => setEditing(false)} disabled={busy} sx={{ textTransform: "none" }}>
                    Atšaukti
                  </Button>
                  <Button
                    variant="contained"
                    onClick={saveEdit}
                    disabled={busy}
                    sx={{ textTransform: "none", borderRadius: 3, background: "linear-gradient(135deg, #FF9800, #F57C00)" }}
                  >
                    Išsaugoti
                  </Button>
                </>
              ) : (
                <>
                  {isClosed ? (
                    <Button onClick={handleCancelDisposal} disabled={busy} sx={{ textTransform: "none" }}>
                      {asset.status === "sold" ? "Atšaukti pardavimą" : "Atšaukti nurašymą"}
                    </Button>
                  ) : (
                    <>
                      <Button
                        color="error"
                        variant="outlined"
                        onClick={() => setWriteOffOpen(true)}
                        disabled={busy}
                        sx={{ textTransform: "none" }}
                      >
                        Nurašyti
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => setSaleOpen(true)}
                        disabled={busy}
                        sx={{ textTransform: "none", color: "#A0590F", borderColor: "#F0D7B1" }}
                      >
                        Parduoti
                      </Button>
                      {tab === 0 && (
                        <Button
                          variant="contained"
                          onClick={startEdit}
                          disabled={busy}
                          sx={{ textTransform: "none", borderRadius: 3, background: "linear-gradient(135deg, #FF9800, #F57C00)" }}
                        >
                          Redaguoti
                        </Button>
                      )}
                    </>
                  )}
                </>
              )}
            </Box>
          </DialogActions>
        )}
      </Dialog>

      <FixedAssetSaleDialog
        open={saleOpen}
        asset={asset}
        onClose={() => setSaleOpen(false)}
        onConfirm={handleSell}
        onCreateInvoice={handleCreateInvoice}
        busy={busy}
      />

      <WriteOffDialog
        open={writeOffOpen}
        onClose={() => setWriteOffOpen(false)}
        onConfirm={handleWriteOff}
        busy={busy}
      />

      {asset?.purchase && (
        <DocumentImageDialog
          open={purchaseOpen}
          onClose={() => setPurchaseOpen(false)}
          purchaseId={asset.purchase}
        />
      )}
    </>
  );
}