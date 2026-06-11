import { useState, useCallback } from "react";
import {
  Dialog, DialogTitle, DialogContent, Box, Typography, Divider, Stack,
  Grid2, IconButton, Chip, useTheme, useMediaQuery,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import DescriptionIcon from "@mui/icons-material/Description";
import BusinessIcon from "@mui/icons-material/Business";
import FlightIcon from "@mui/icons-material/Flight";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import RouteIcon from "@mui/icons-material/Route";
import SpeedIcon from "@mui/icons-material/Speed";
import PersonIcon from "@mui/icons-material/Person";
import OpacityIcon from "@mui/icons-material/Opacity";

import { api } from "../api/endpoints";
import EditableCell from "../components/EditableCell";
import ZoomableImage from "../pages/ZoomableImage";

const PAYMENT_OPTS = [
  { value: "invoice", label: "Invoice" },
  { value: "fuelling_card", label: "Fuelling card" },
  { value: "cash", label: "Cash" },
  { value: "credit_card", label: "Credit card" },
  { value: "other", label: "Other" },
];

const NATURE_OPTS = [
  { value: "commercial", label: "Commercial" },
  { value: "private", label: "Private" },
  { value: "other", label: "Other" },
];

const BOOL_OPTS = [
  { label: "Taip", value: true },
  { label: "Ne", value: false },
];

const normVal = (v) => {
  if (v === "" || v === undefined) return null;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) {
    const t = v.trim();
    if (t.length > 1 && t[0] === "0" && t[1] !== ".") return t;
    return Number(v);
  }
  return v;
};

const ensureNumber = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error("Turi būti skaičius");
  return n;
};

const ensureDate = (v) => {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) throw new Error("Formatas: YYYY-MM-DD");
  return s.slice(0, 10);
};

const fmtNum = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  const num = Number(value);
  if (isNaN(num)) return value;
  const [int, dec = ""] = num.toFixed(4).split(".");
  if (dec[2] === "0" && dec[3] === "0") return `${int}.${dec.slice(0, 2)}`;
  return `${int}.${dec}`;
};

// Section header
const Sec = ({ icon, children }) => (
  <Typography variant="subtitle2" sx={{ mt: 2.5, mb: 1, display: "flex", alignItems: "center", gap: 0.5, fontWeight: 600 }}>
    {icon}{children}
  </Typography>
);

// Field row
const F = ({ label, children }) => (
  <Typography sx={{ fontSize: "0.875rem" }}>
    <Box component="span" sx={{ color: "text.secondary", mr: 0.5 }}>{label}:</Box>
    {children}
  </Typography>
);

export default function WaybillPreviewDialog({ open, onClose, doc, setDoc, setDocs, isMobile: isMobileProp }) {
  const theme = useTheme();
  const isMobile = isMobileProp ?? useMediaQuery(theme.breakpoints.down("md"));
  const [previewFullscreen, setPreviewFullscreen] = useState(false);

  const save = useCallback(async (field, raw) => {
    if (!doc?.id) return;
    const value = normVal(raw);
    try {
      const { data } = await api.patch(`/waybills/${doc.id}/update/`, { [field]: value }, { withCredentials: true });
      setDoc(data);
      setDocs((p) => p.map((d) => (String(d.id) === String(doc.id) ? { ...data } : d)));
    } catch (e) {
      console.error("Save failed:", e);
    }
  }, [doc?.id, setDoc, setDocs]);

  const handleClose = useCallback(() => { setPreviewFullscreen(false); onClose(); }, [onClose]);

  if (!doc) return null;

  const renderFields = () => (
    <Box sx={{ "& .MuiTypography-root": { fontSize: isMobile ? "0.85rem" : "0.875rem" } }}>

      {/* Status */}
      <Box sx={{ mb: 2, display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Chip size="small"
          icon={doc.status === "completed" || doc.status === "exported" ? <CheckCircleIcon /> : doc.status === "rejected" ? <ErrorIcon /> : <HourglassEmptyIcon />}
          label={doc.status === "completed" ? "Atliktas" : doc.status === "exported" ? "Eksportuotas" : doc.status === "rejected" ? "Atmestas" : "Vykdomas"}
          color={doc.status === "completed" || doc.status === "exported" ? "success" : doc.status === "rejected" ? "error" : "default"}
          variant={doc.status === "processing" || doc.status === "pending" ? "outlined" : "filled"} />
      </Box>

      {doc.error_message && <Typography color="error" sx={{ mb: 2 }}>{doc.error_message}</Typography>}

      {!doc.error_message && <>

      {/* ── Dokumento duomenys ── */}
      <Sec icon={<DescriptionIcon sx={{ fontSize: 18 }} />}>Dokumento duomenys</Sec>
      <Stack spacing={0.5}>
        <F label="Oro uostas"><EditableCell value={doc.airport} onSave={(v) => save("airport", v)} /></F>
        <F label="Numeris"><EditableCell value={doc.document_number} onSave={(v) => save("document_number", v)} /></F>
        <F label="Data"><EditableCell value={doc.document_date} inputType="date" onSave={(v) => save("document_date", ensureDate(v))} /></F>
        <F label="Mokėjimo būdas">
          <EditableCell value={doc.payment_type} inputType="select" options={PAYMENT_OPTS}
            getOptionLabel={(o) => o.label} onSave={(v) => save("payment_type", v)}
            renderDisplay={(v) => <b>{PAYMENT_OPTS.find((o) => o.value === v)?.label || v || "-"}</b>} />
        </F>
        <F label="Važtaraštis kurui užpilti">
          <EditableCell value={doc.delivery_receipt} inputType="select" options={BOOL_OPTS}
            getOptionLabel={(o) => o.label} onSave={(v) => save("delivery_receipt", v)}
            renderDisplay={(v) => <b>{v === true ? "Taip" : v === false ? "Ne" : "-"}</b>} />
        </F>
        <F label="Važtaraštis kurui išpilti">
          <EditableCell value={doc.defuelling_receipt} inputType="select" options={BOOL_OPTS}
            getOptionLabel={(o) => o.label} onSave={(v) => save("defuelling_receipt", v)}
            renderDisplay={(v) => <b>{v === true ? "Taip" : v === false ? "Ne" : "-"}</b>} />
        </F>
      </Stack>

      <Divider sx={{ my: 1.5 }} />

      {/* ── Pirkėjas ── */}
      <Sec icon={<BusinessIcon sx={{ fontSize: 18 }} />}>Pirkėjas / Customer</Sec>
      <Stack spacing={0.5}>
        <F label="IATA kodas"><EditableCell value={doc.buyer_iata_code} onSave={(v) => save("buyer_iata_code", v)} /></F>
        <F label="Pavadinimas"><EditableCell value={doc.buyer_name} onSave={(v) => save("buyer_name", v)} /></F>
        <F label="Adresas"><EditableCell value={doc.buyer_address} onSave={(v) => save("buyer_address", v)} /></F>
        <F label="PVM kodas"><EditableCell value={doc.buyer_vat_code} onSave={(v) => save("buyer_vat_code", v)} /></F>
        <F label="Aviakompanija su > 1/2 pajamų iš keleivių/krovinių vežimo">
          <EditableCell value={doc.buyer_remark_half_income} inputType="select" options={BOOL_OPTS}
            getOptionLabel={(o) => o.label} onSave={(v) => save("buyer_remark_half_income", v)}
            renderDisplay={(v) => <b>{v === true ? "Taip" : v === false ? "Ne" : "-"}</b>} />
        </F>
        <F label="Kita"><EditableCell value={doc.buyer_remark_other} onSave={(v) => save("buyer_remark_other", v)} /></F>
      </Stack>

      <Divider sx={{ my: 1.5 }} />

      {/* ── Orlaivis ── */}
      <Sec icon={<FlightIcon sx={{ fontSize: 18 }} />}>Orlaivis ir skrydis</Sec>
      <Stack spacing={0.5}>
        <F label="Orlaivio tipas"><EditableCell value={doc.aircraft_type} onSave={(v) => save("aircraft_type", v)} /></F>
        <F label="Tipas"><EditableCell value={doc.flight_type} onSave={(v) => save("flight_type", v)} /></F>
        <F label="Už ES ribų">
          <EditableCell value={doc.outside_eu} inputType="select" options={BOOL_OPTS}
            getOptionLabel={(o) => o.label} onSave={(v) => save("outside_eu", v)}
            renderDisplay={(v) => <b>{v === true ? "Taip" : v === false ? "Ne" : "-"}</b>} />
        </F>
        <F label="Skrydžio pobūdis">
          <EditableCell value={doc.flight_nature} inputType="select" options={NATURE_OPTS}
            getOptionLabel={(o) => o.label} onSave={(v) => save("flight_nature", v)}
            renderDisplay={(v) => <b>{NATURE_OPTS.find((o) => o.value === v)?.label || v || "-"}</b>} />
        </F>
      </Stack>

      <Divider sx={{ my: 1.5 }} />

      {/* ── Laikas ── */}
      <Sec icon={<AccessTimeIcon sx={{ fontSize: 18 }} />}>Laikas</Sec>
      <Stack spacing={0.5}>
        <F label="Išvykimas"><EditableCell value={doc.time_departure} onSave={(v) => save("time_departure", v)} /></F>
        <F label="Atvykimas"><EditableCell value={doc.time_arrival} onSave={(v) => save("time_arrival", v)} /></F>
        <F label="Pradžia"><EditableCell value={doc.time_start} onSave={(v) => save("time_start", v)} /></F>
        <F label="Pabaiga"><EditableCell value={doc.time_finish} onSave={(v) => save("time_finish", v)} /></F>
        <F label="Grįžimas"><EditableCell value={doc.time_return} onSave={(v) => save("time_return", v)} /></F>
      </Stack>

      <Divider sx={{ my: 1.5 }} />

      {/* ── Marsrutas ── */}
      <Sec icon={<RouteIcon sx={{ fontSize: 18 }} />}>Skrydžio maršrutas</Sec>
      {isMobile ? (
        <Stack spacing={0.5}>
          <Typography variant="caption" sx={{ fontWeight: 500, color: "text.secondary", mt: 0.5 }}>Iš</Typography>
          <F label="Miestas"><EditableCell value={doc.from_city} onSave={(v) => save("from_city", v)} /></F>
          <F label="Oro uostas"><EditableCell value={doc.from_airport_code} onSave={(v) => save("from_airport_code", v)} /></F>
          <F label="Šalies kodas"><EditableCell value={doc.from_country_iso} onSave={(v) => save("from_country_iso", v)} /></F>
          <Typography variant="caption" sx={{ fontWeight: 500, color: "text.secondary", mt: 1 }}>Į</Typography>
          <F label="Miestas"><EditableCell value={doc.to_city} onSave={(v) => save("to_city", v)} /></F>
          <F label="Oro uostas"><EditableCell value={doc.to_airport_code} onSave={(v) => save("to_airport_code", v)} /></F>
          <F label="Šalies kodas"><EditableCell value={doc.to_country_iso} onSave={(v) => save("to_country_iso", v)} /></F>
        </Stack>
      ) : (
        <Grid2 container spacing={3}>
          <Grid2 size={5}>
            <Typography variant="caption" sx={{ fontWeight: 500, color: "text.secondary" }}>Iš:</Typography>
            <Stack spacing={0.5} sx={{ mt: 0.5 }}>
              <F label="Miestas"><EditableCell value={doc.from_city} onSave={(v) => save("from_city", v)} /></F>
              <F label="Oro uostas"><EditableCell value={doc.from_airport_code} onSave={(v) => save("from_airport_code", v)} /></F>
              <F label="Šalies kodas"><EditableCell value={doc.from_country_iso} onSave={(v) => save("from_country_iso", v)} /></F>
            </Stack>
          </Grid2>
          <Grid2 size={2} sx={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography sx={{ fontSize: 20, color: "text.secondary" }}>→</Typography>
          </Grid2>
          <Grid2 size={5}>
            <Typography variant="caption" sx={{ fontWeight: 500, color: "text.secondary" }}>Į:</Typography>
            <Stack spacing={0.5} sx={{ mt: 0.5 }}>
              <F label="Miestas"><EditableCell value={doc.to_city} onSave={(v) => save("to_city", v)} /></F>
              <F label="Oro uostas"><EditableCell value={doc.to_airport_code} onSave={(v) => save("to_airport_code", v)} /></F>
              <F label="Šalies kodas"><EditableCell value={doc.to_country_iso} onSave={(v) => save("to_country_iso", v)} /></F>
            </Stack>
          </Grid2>
        </Grid2>
      )}

      <Divider sx={{ my: 1.5 }} />

      {/* ── Skaitikliai ── */}
      <Sec icon={<SpeedIcon sx={{ fontSize: 18 }} />}>Skaitiklio parodymai</Sec>
      <Stack spacing={0.5}>
        <F label="Autocisternos Nr."><EditableCell value={doc.refueller_number} onSave={(v) => save("refueller_number", v)} /></F>
        <F label="Prieš užpylimą"><EditableCell value={doc.reading_before} inputType="number" onSave={(v) => save("reading_before", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} /></F>
        <F label="Po užpylimo"><EditableCell value={doc.reading_after} inputType="number" onSave={(v) => save("reading_after", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} /></F>
        <F label="Skirtumas"><EditableCell value={doc.reading_difference} inputType="number" onSave={(v) => save("reading_difference", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} /></F>
      </Stack>

      <Divider sx={{ my: 1.5 }} />

      {/* ── Operatorius ── */}
      <Sec icon={<PersonIcon sx={{ fontSize: 18 }} />}>Operatorius</Sec>
      <Stack spacing={0.5}>
        <F label="Įmonės įgaliotas asmuo"><EditableCell value={doc.company_representative} onSave={(v) => save("company_representative", v)} /></F>
      </Stack>

      <Divider sx={{ my: 1.5 }} />

      {/* ── Degalų matavimai ── */}
      <Sec icon={<OpacityIcon sx={{ fontSize: 18 }} />}>Degalų matavimai</Sec>

      <Typography variant="caption" sx={{ fontWeight: 500, color: "text.secondary", display: "block", mb: 0.5 }}>Faktinis (observed)</Typography>
      {isMobile ? (
        <Stack spacing={0.5} sx={{ mb: 2 }}>
          <F label="Tankis"><EditableCell value={doc.density_observed} inputType="number" onSave={(v) => save("density_observed", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} /></F>
          <F label="Temp. C"><EditableCell value={doc.temperature_observed} inputType="number" onSave={(v) => save("temperature_observed", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} /></F>
          <F label="Litrai"><EditableCell value={doc.quantity_liters_observed} inputType="number" onSave={(v) => save("quantity_liters_observed", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} /></F>
          <F label="Kilogramai"><EditableCell value={doc.quantity_kg_observed} inputType="number" onSave={(v) => save("quantity_kg_observed", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} /></F>
        </Stack>
      ) : (
        <Grid2 container spacing={1} sx={{ mb: 2 }}>
          <Grid2 size={3}><Box sx={{ bgcolor: "action.hover", borderRadius: 1, p: 1 }}><Typography variant="caption" color="text.secondary">Tankis</Typography><br /><EditableCell value={doc.density_observed} inputType="number" onSave={(v) => save("density_observed", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} /></Box></Grid2>
          <Grid2 size={3}><Box sx={{ bgcolor: "action.hover", borderRadius: 1, p: 1 }}><Typography variant="caption" color="text.secondary">Temp. C</Typography><br /><EditableCell value={doc.temperature_observed} inputType="number" onSave={(v) => save("temperature_observed", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} /></Box></Grid2>
          <Grid2 size={3}><Box sx={{ bgcolor: "action.hover", borderRadius: 1, p: 1 }}><Typography variant="caption" color="text.secondary">Litrai</Typography><br /><EditableCell value={doc.quantity_liters_observed} inputType="number" onSave={(v) => save("quantity_liters_observed", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} /></Box></Grid2>
          <Grid2 size={3}><Box sx={{ bgcolor: "action.hover", borderRadius: 1, p: 1 }}><Typography variant="caption" color="text.secondary">Kilogramai</Typography><br /><EditableCell value={doc.quantity_kg_observed} inputType="number" onSave={(v) => save("quantity_kg_observed", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} /></Box></Grid2>
        </Grid2>
      )}

      <Typography variant="caption" sx={{ fontWeight: 500, color: "text.secondary", display: "block", mb: 0.5 }}>Standartinis (+15 C)</Typography>
      {isMobile ? (
        <Stack spacing={0.5}>
          <F label="Tankis"><EditableCell value={doc.density_standard} inputType="number" onSave={(v) => save("density_standard", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} /></F>
          <F label="Temp. C"><EditableCell value={doc.temperature_standard} inputType="number" onSave={(v) => save("temperature_standard", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} /></F>
          <F label="Litrai"><EditableCell value={doc.quantity_liters_standard} inputType="number" onSave={(v) => save("quantity_liters_standard", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} /></F>
        </Stack>
      ) : (
        <Grid2 container spacing={1}>
          <Grid2 size={3}><Box sx={{ bgcolor: "action.hover", borderRadius: 1, p: 1 }}><Typography variant="caption" color="text.secondary">Tankis</Typography><br /><EditableCell value={doc.density_standard} inputType="number" onSave={(v) => save("density_standard", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} /></Box></Grid2>
          <Grid2 size={3}><Box sx={{ bgcolor: "action.hover", borderRadius: 1, p: 1 }}><Typography variant="caption" color="text.secondary">Temp. C</Typography><br /><EditableCell value={doc.temperature_standard} inputType="number" onSave={(v) => save("temperature_standard", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} /></Box></Grid2>
          <Grid2 size={3}><Box sx={{ bgcolor: "action.hover", borderRadius: 1, p: 1 }}><Typography variant="caption" color="text.secondary">Litrai</Typography><br /><EditableCell value={doc.quantity_liters_standard} inputType="number" onSave={(v) => save("quantity_liters_standard", ensureNumber(v))} renderDisplay={(v) => <b>{fmtNum(v)}</b>} /></Box></Grid2>
          <Grid2 size={3}><Box sx={{ bgcolor: "action.hover", borderRadius: 1, p: 1, opacity: 0.4 }}><Typography variant="caption" color="text.secondary">Kilogramai</Typography><br /><b>-</b></Box></Grid2>
        </Grid2>
      )}

      </>}
    </Box>
  );

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xl" fullWidth fullScreen={isMobile}
      disableScrollLock={false} TransitionProps={{ timeout: 0.1 }}
      PaperProps={{ sx: isMobile ? { m: 0, height: "100dvh", borderRadius: 0 } : { overflowX: "hidden" } }}>

      <DialogTitle sx={{ fontWeight: 500, fontSize: isMobile ? 16 : 18, pr: 5, py: isMobile ? 1 : 1.5, position: "relative", display: "flex", alignItems: "center", flexShrink: 0 }}>
        Važtaraščio peržiūra
        <IconButton onClick={handleClose} sx={{ position: "absolute", right: isMobile ? 4 : 10, top: "50%", transform: "translateY(-50%)", color: "grey.500" }}>
          <CloseIcon sx={{ fontSize: isMobile ? 28 : 24 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0, overflowX: "hidden", overflowY: isMobile ? "hidden" : "auto", flex: 1, display: "flex", flexDirection: "column" }}>
        {isMobile ? (
          <Box sx={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            <Box sx={{ flexShrink: 0, height: 140, bgcolor: "#f8f8f8", borderBottom: "1px solid #eee", p: 1, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              onClick={() => setPreviewFullscreen(true)}>
              {doc.preview_url ? (
                <Box sx={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <img src={doc.preview_url} alt="Preview" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  <Typography sx={{ position: "absolute", bottom: 4, right: 4, bgcolor: "rgba(0,0,0,0.55)", color: "white", px: 1, py: 0.5, borderRadius: 1, fontSize: "0.7rem" }}>
                    Paspauskite, kad padidintumėte
                  </Typography>
                </Box>
              ) : <Typography color="text.secondary">Peržiūra negalima</Typography>}
            </Box>
            <Box sx={{ flex: 1, overflowY: "auto", px: 2, py: 1.5, WebkitOverflowScrolling: "touch" }}>
              {renderFields()}
            </Box>
            <Dialog open={previewFullscreen} onClose={() => setPreviewFullscreen(false)} fullScreen PaperProps={{ sx: { bgcolor: "#000" } }}>
              <IconButton onClick={() => setPreviewFullscreen(false)} sx={{ position: "absolute", top: 8, right: 8, zIndex: 10, color: "white", bgcolor: "rgba(0,0,0,0.5)", width: 48, height: 48 }}>
                <CloseIcon sx={{ fontSize: 28 }} />
              </IconButton>
              <Box sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", p: 1 }}>
                {doc.preview_url && <ZoomableImage src={doc.preview_url} buttonSize={48} maxHeight="calc(100vh - 100px)" />}
              </Box>
            </Dialog>
          </Box>
        ) : (
          <Box sx={{ display: "flex", gap: 3, p: 3, minHeight: 400 }}>
            <Box sx={{ width: "50%", flexShrink: 0, position: "sticky", top: 0, alignSelf: "flex-start", maxHeight: "calc(80vh - 48px)" }}>
              {doc.preview_url ? <ZoomableImage src={doc.preview_url} buttonSize={36} maxHeight="calc(75vh - 60px)" /> : <Typography color="text.secondary">Peržiūra negalima</Typography>}
            </Box>
            <Box sx={{ width: "50%", flexShrink: 0, minWidth: 0, overflowX: "hidden" }}>
              {renderFields()}
            </Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}