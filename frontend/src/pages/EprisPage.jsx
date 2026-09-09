/* eslint-disable react/prop-types -- Document payloads are validated by the EPRIS API. */
import { useEffect, useState, useCallback } from "react";
import {
  Alert, Box, Button, Checkbox, Chip,
  CircularProgress, Dialog, DialogContent, FormControl, FormHelperText,
  FormControlLabel, IconButton, InputLabel, MenuItem, Select, Stack,
  TextField,
  Typography, useMediaQuery, useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import EprisWorkspace from "../components/EprisWorkspace";
import ZoomableImage from "./ZoomableImage";
import { api } from "../api/endpoints";
import { amountFromPercent, decimalInput, decimalNumber, fixedInput, linkedDeduction, vatRateLabel } from "../components/eprisAmounts";
import { documentErrors, notificationText } from "../components/eprisFeedback";

const LANGUAGES = ["LT", "EN", "DE", "PL", "FR", "BG", "CS", "DA", "EL", "ES", "ET", "FI", "GA", "HR", "HU", "IT", "LV", "MT", "NL", "PT", "RO", "SK", "SL", "SV"];

const fmt = (v) =>
  parseFloat(v || 0).toLocaleString("lt-LT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/* ═══════════════════════════════════════════════════════════
   Kategorijų dialogas
   ═══════════════════════════════════════════════════════════ */

function EprisCodesDialog({ open, onClose, doc, onSaved, contractorKeys }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [categories, setCategories] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);

  const [details, setDetails] = useState({});
  const [amountError, setAmountError] = useState("");
  const country = details.refund_country || doc?.epris_details?.refund_country || doc?.seller_country_iso || "";

  useEffect(() => {
    if (!open || !country) return;
    const controller = new AbortController();
    setCategories([]);
    setLoading(true);
    api
      .get("/epris/code-options/", { params: { country }, signal: controller.signal })
      .then((res) => {
        setCategories(res.data.categories);
      })
      .catch(() => { if (!controller.signal.aborted) setErrors(["Nepavyko įkelti kategorijų. Bandykite dar kartą."]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, country]);

  useEffect(() => {
    if (!open) {
      setPreviewFullscreen(false);
      return;
    }
    setDetails({ ...doc?.epris_details,
      deduction_percent: decimalInput(doc?.epris_details?.deduction_percent ?? "100"),
      deductible_vat: decimalInput(doc?.epris_details?.deductible_vat ?? doc?.vat_amount ?? ""),
      prorata_rate: decimalInput(doc?.epris_details?.prorata_rate ?? "100"),
    });
    setAmountError("");
    const existing = doc?.epris_codes;
    setRows(
      existing?.length
        ? existing.map((r) => ({ ...r }))
        : [{ code: "", subcode: "", free_text: "", language: "EN" }],
    );
    setErrors([]);
  }, [open, doc]);

  const catByCode = useCallback(
    (code) => categories.find((c) => c.code === code) || null,
    [categories],
  );

  const updateRow = (idx, patch) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleCategoryChange = (idx, code) => {
    updateRow(idx, { code, subcode: "", free_text: "", language: "EN" });
  };

  const rowError = (row) => {
    if (!row.code) return "Pasirinkite kategoriją";
    const cat = catByCode(row.code);
    if (!cat) return null;
    if (cat.subcode_required && !row.subcode) {
      if (row.code === "10" && row.free_text) return null;
      return `${country} reikalauja subkodo`;
    }
    if (row.code === "10" && !row.free_text) {
      return "Būtinas prekių / paslaugų aprašymas";
    }
    if (row.free_text && !row.language) return "Nurodykite kalbą";
    return null;
  };

  const localErrors = rows.map(rowError);
  const subcodePending = rows.some(row => {
    const cat = catByCode(row.code);
    if (!row.code) return true;
    return !!cat?.subcode_required && !row.subcode && !(row.code === "10" && row.free_text);
  });
  const activityRate = decimalNumber(details.prorata_rate ?? 100);
  const validAmounts = decimalNumber(details.deductible_vat) > 0 && details.deduction_percent !== "" && details.deduction_percent !== "," &&
    decimalNumber(details.deduction_percent) >= 0 && Number.isInteger(activityRate) && activityRate > 0 && activityRate <= 100;
  const canSave = !loading && categories.length > 0 && rows.length > 0 && localErrors.every((e) => !e) && validAmounts && !amountError;
  const visibleErrors = [...new Set([...documentErrors(doc), ...errors, ...(amountError ? [amountError] : [])])];

  const changeDeduction = (field, value) => {
    const next = linkedDeduction(details, field, value, doc?.vat_amount);
    if (!next) {
      setAmountError(`Grąžintinas PVM negali viršyti ${fmt(amountFromPercent(doc?.vat_amount || 0, details.prorata_rate ?? 100))} ${doc?.currency || ""}. Įveskite teigiamą skaičių, iki 2 skaitmenų po kablelio.`);
      return;
    }
    setAmountError("");
    setDetails(next);
  };

  const formatDeduction = field => {
    if (details[field] !== "" && details[field] !== "," && Number.isFinite(decimalNumber(details[field]))) {
      setDetails(prev => ({ ...prev, [field]: fixedInput(decimalNumber(prev[field])) }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setErrors([]);
    try {
      const res = await api.patch(`/epris/documents/${doc.id}/codes/`, {
        codes: rows, details, contractor_keys: contractorKeys,
      });
      if (res.data.errors?.length) {
        setErrors(res.data.errors);
      } else {
        onSaved?.(res.data);
        onClose();
      }
    } catch (err) {
      setErrors([err.response?.data?.error || "Klaida išsaugant"]);
    } finally {
      setSaving(false);
    }
  };

  const renderCodes = () => (
    <>
      <Typography fontWeight={600}>{doc?.seller_name}</Typography>
      <Box component="dl" sx={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) minmax(0, 1.5fr)", gap: "5px 16px", mt: 1.5, mb: 2.5, fontSize: 13,
        "& dt": { color: "text.secondary", fontWeight: 700 }, "& dd": { m: 0, overflowWrap: "anywhere" } }}>
        {[
          ["Sąskaitos numeris", `${doc?.document_series || ""}${doc?.document_number || ""}`],
          ["Sąskaitos data", doc?.invoice_date],
          ["Tiekėjo kodas", doc?.seller_id],
          ["Tiekėjo PVM kodas", doc?.seller_vat_code],
          ["Tiekėjo adresas", doc?.seller_address],
          ["Tiekėjo šalis", doc?.seller_country_iso],
          ["Suma be PVM", `${fmt(doc?.amount_wo_vat)} ${doc?.currency || ""}`],
          ["PVM %", vatRateLabel(doc)],
          ["Sąskaitos PVM", `${fmt(doc?.vat_amount)} ${doc?.currency || ""}`],
        ].map(([label, value]) => <Box key={label} sx={{ display: "contents" }}><Box component="dt">{label}</Box><Box component="dd">{value || "—"}</Box></Box>)}
      </Box>
      {doc?.supplier_country_notice && <Alert severity="warning" sx={{ mb: 2 }}>{notificationText(doc.supplier_country_notice)}</Alert>}
      {categories.some(category => category.subcode_required) && subcodePending && <Alert severity="warning" sx={{ mb: 2 }}>
        Ši šalis reikalauja ir subkategorijų. Pasirinkus kategoriją, privalomi laukai rodomi žemiau
      </Alert>}

      <Stack spacing={2}>
        {rows.map((row, idx) => {
          const cat = catByCode(row.code);

          return (
            <Box
              key={idx}
              sx={{
                p: 1.5,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 2,
                bgcolor: "#fff",
              }}
            >
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <FormControl size="small" fullWidth>
                    <InputLabel id={`epris-category-${idx}`}>Kategorija</InputLabel>
                    <Select
                      labelId={`epris-category-${idx}`}
                      value={row.code}
                      label="Kategorija"
                      onChange={(e) => handleCategoryChange(idx, e.target.value)}
                      MenuProps={{ disableScrollLock: true }}
                    >
                      {categories.map((c) => (
                        <MenuItem key={c.code} value={c.code}>
                          {c.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <IconButton
                    size="small"
                    onClick={() => { setRows((p) => p.filter((_, i) => i !== idx)); }}
                    disabled={rows.length === 1}
                    sx={{ color: "text.secondary" }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>

                {cat?.subcode_required && (
                  <FormControl size="small" fullWidth required={!(row.code === "10" && row.free_text)}>
                    <InputLabel id={`epris-subcategory-${idx}`}>Subkategorija</InputLabel>
                    <Select
                      labelId={`epris-subcategory-${idx}`}
                      value={row.subcode}
                      label="Subkategorija"
                      onChange={(e) => updateRow(idx, { subcode: e.target.value })}
                      MenuProps={{ disableScrollLock: true, sx: { maxHeight: 420 } }}
                    >
                      {cat.options.map((o) => (
                        <MenuItem
                          key={o.value}
                          value={o.value}
                          sx={{ pl: 1 + (o.level - 2) * 2, whiteSpace: "normal" }}
                        >
                          <Typography sx={{ fontSize: 13 }}>{o.label}</Typography>
                        </MenuItem>
                      ))}
                    </Select>
                    <FormHelperText>{row.code === "10"
                      ? "Pasirinkite subkategoriją arba įrašykite prekių / paslaugų aprašymą"
                      : `${country} šalyje šiai kategorijai būtina subkategorija`}</FormHelperText>
                  </FormControl>
                )}

                {row.code === "10" && (
                  <Stack direction="row" spacing={1}>
                    <TextField
                      size="small"
                      fullWidth
                      label="Prekių / paslaugų aprašymas *"
                      value={row.free_text}
                      onChange={(e) => updateRow(idx, { free_text: e.target.value })}
                    />
                    <FormControl size="small" sx={{ width: 110 }}>
                      <InputLabel>Kalba</InputLabel>
                      <Select
                        value={row.language}
                        label="Kalba"
                        onChange={(e) => updateRow(idx, { language: e.target.value })}
                        MenuProps={{ disableScrollLock: true }}
                      >
                        {LANGUAGES.map((l) => (
                          <MenuItem key={l} value={l}>{l}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Stack>
                )}

              </Stack>
            </Box>
          );
        })}

        <Button
          size="small"
          startIcon={<AddIcon fontSize="small" />}
          onClick={() => {
            setRows((p) => [...p, { code: "", subcode: "", free_text: "", language: "EN" }]);
          }}
          sx={{ alignSelf: "flex-start", textTransform: "none" }}
        >
          Pridėti kategoriją
        </Button>

        <Box component="details" sx={{ pt: 1 }}>
          <Box component="summary" sx={{ cursor: "pointer", color: "text.secondary", fontSize: 14 }}>Papildomai</Box>
          <Stack spacing={2} sx={{ pt: 2 }}>
            <TextField select size="small" label="Grąžinimo šalis" value={country}
              onChange={e => { setDetails(prev => ({ ...prev, refund_country: e.target.value })); setRows([{ code: "", subcode: "", free_text: "", language: "EN" }]); }}>
              {["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"].map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
            <TextField size="small" label="Atskaita (%)" value={details.deduction_percent ?? "100"}
              onChange={e => changeDeduction("deduction_percent", e.target.value)} onBlur={() => formatDeduction("deduction_percent")} inputProps={{ inputMode: "decimal" }} />
            <TextField size="small" label={`Grąžintinas PVM (${doc?.currency || ""})`} value={details.deductible_vat ?? doc?.vat_amount ?? ""}
              onChange={e => changeDeduction("deductible_vat", e.target.value)} onBlur={() => formatDeduction("deductible_vat")} error={!!amountError} helperText={notificationText(amountError) || undefined} inputProps={{ inputMode: "decimal" }} />
            <FormControlLabel control={<Checkbox checked={details.simplified_invoice === true} onChange={e => setDetails(prev => ({ ...prev, simplified_invoice: e.target.checked }))} />} label="Supaprastinta sąskaita" />
          </Stack>
        </Box>

      </Stack>
    </>
  );

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        fullWidth
        maxWidth={doc?.preview_url ? "xl" : "sm"}
        fullScreen={isMobile}
        disableScrollLock
        TransitionProps={{ timeout: 0.1 }}
        PaperProps={{
          sx: isMobile
            ? { m: 0, height: "100dvh", borderRadius: 0, display: "flex", flexDirection: "column" }
            : { borderRadius: "14px", overflowX: "hidden", height: doc?.preview_url ? "85vh" : "auto", display: "flex", flexDirection: "column" },
        }}
      >
        <Box
          sx={{
            px: 2.5,
            py: 1.4,
            bgcolor: "#EEF3FF",
            borderBottom: "1px solid #C9D8F5",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
              Sąskaitos peržiūra
            </Typography>
            <Chip
              label={country}
              size="small"
              sx={{
                bgcolor: "#C9D8F5",
                color: "#22407A",
                fontWeight: 700,
                border: "1px solid #B0C6EE",
              }}
            />
          </Box>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>

        <DialogContent sx={{ p: 0, overflow: "hidden", flex: 1, display: "flex", flexDirection: "column" }}>
          {!!visibleErrors.length && <Alert severity="error" sx={{ m: 2, mb: 0, flexShrink: 0, maxHeight: "30vh", overflowY: "auto" }}>
            <Typography component="div" fontWeight={600}>Sąskaitos eksportuoti negalima</Typography>
            {visibleErrors.map(message => <div key={message}>{notificationText(message)}</div>)}
          </Alert>}
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1 }}>
              <CircularProgress size={32} />
            </Box>
          ) : isMobile ? (
            <Box sx={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <Box
                sx={{
                  flexShrink: 0,
                  height: doc?.preview_url ? 120 : 0,
                  minHeight: doc?.preview_url ? 120 : 0,
                  bgcolor: "#f8f8f8",
                  borderBottom: "1px solid #eee",
                  p: doc?.preview_url ? 1 : 0,
                  display: doc?.preview_url ? "flex" : "none",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
                onClick={() => setPreviewFullscreen(true)}
              >
                {doc?.preview_url ? (
                  <Box sx={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <img
                      src={doc.preview_url}
                      alt="Preview"
                      style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                    />
                    <Typography
                      sx={{
                        position: "absolute",
                        bottom: 4,
                        right: 4,
                        bgcolor: "rgba(0,0,0,0.55)",
                        color: "white",
                        px: 1,
                        py: 0.5,
                        borderRadius: 1,
                        fontSize: "0.7rem",
                      }}
                    >
                      Paspauskite, kad padidintumėte
                    </Typography>
                  </Box>
                ) : (
                  <Typography color="text.secondary">Peržiūra negalima</Typography>
                )}
              </Box>
              <Box sx={{ flex: 1, overflowY: "auto", overflowX: "hidden", px: 2, py: 1.5, WebkitOverflowScrolling: "touch" }}>
                {renderCodes()}
              </Box>
            </Box>
          ) : (
            <Box sx={{ display: "flex", gap: 3, p: 3, overflowY: "auto", overflowX: "hidden", flex: 1, scrollbarGutter: "stable" }}>
              <Box
                sx={{
                  width: "50%",
                  display: doc?.preview_url ? "block" : "none",
                  flexShrink: 0,
                  position: "sticky",
                  top: 0,
                  alignSelf: "flex-start",
                  maxHeight: "calc(85vh - 120px)",
                  minHeight: 300,
                  minWidth: 0,
                }}
              >
                {doc?.preview_url ? (
                  <ZoomableImage
                    src={doc.preview_url}
                    buttonSize={36}
                    maxHeight="calc(80vh - 120px)"
                    fitOnLoad
                    fitRatio={0.8}
                  />
                ) : (
                  <Box
                    sx={{
                      height: "100%",
                      minHeight: 300,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      bgcolor: "#fafafa",
                      borderRadius: 2,
                      border: "1px dashed",
                      borderColor: "divider",
                    }}
                  >
                    <Typography sx={{ color: "text.secondary" }}>Peržiūra negalima</Typography>
                  </Box>
                )}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0, overflowX: "hidden" }}>
                {renderCodes()}
              </Box>
            </Box>
          )}
        </DialogContent>

        <Box
          sx={{
            px: 2.5,
            py: 1.5,
            borderTop: "1px solid",
            borderColor: "divider",
            display: "flex",
            justifyContent: "flex-end",
            gap: 1,
            flexShrink: 0,
          }}
        >
          <Button onClick={onClose} size="small" sx={{ textTransform: "none" }}>
            Atšaukti
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={handleSave}
            disabled={!canSave || saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{ textTransform: "none" }}
          >
            Išsaugoti
          </Button>
        </Box>
      </Dialog>

      <Dialog
        open={previewFullscreen}
        onClose={() => setPreviewFullscreen(false)}
        fullScreen
        disableScrollLock
        PaperProps={{ sx: { bgcolor: "#000" } }}
      >
        <IconButton
          onClick={() => setPreviewFullscreen(false)}
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 10,
            color: "white",
            bgcolor: "rgba(0,0,0,0.5)",
            "&:hover": { bgcolor: "rgba(0,0,0,0.7)" },
            width: 48,
            height: 48,
          }}
        >
          <CloseIcon sx={{ fontSize: 28 }} />
        </IconButton>
        <Box sx={{ width: "100%", height: "100%", p: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {doc?.preview_url && (
            <ZoomableImage src={doc.preview_url} buttonSize={48} maxHeight="calc(100vh - 100px)" fitOnLoad fitRatio={1} />
          )}
        </Box>
      </Dialog>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   Puslapis
   ═══════════════════════════════════════════════════════════ */

export default function EprisPage() {
  return <EprisWorkspace CodesDialog={EprisCodesDialog} />;
}
