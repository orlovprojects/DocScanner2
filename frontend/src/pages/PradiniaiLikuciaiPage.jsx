import { useCallback, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import {
  Alert, Box, Button, Chip, CircularProgress, IconButton, Paper, Step,
  StepLabel, Stepper, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DownloadIcon from "@mui/icons-material/Download";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import WeekendIcon from "@mui/icons-material/Weekend";
import MenuItem from "@mui/material/MenuItem";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import "dayjs/locale/lt";
import { useNavigate } from "react-router-dom";

import { api } from "../api/endpoints";
import { useCompanyProfiles } from "../contexts/useCompanyProfiles";

const BASE = "/apskaita/pradiniai-likuciai";

const SECTION_KEYS = ["balance", "bank", "buyer", "supplier", "fixed_asset"];

const STEPS = [
  { key: "date", label: "Perėjimo data" },
  { key: "balance", label: "Balansas" },
  { key: "bank", label: "Banko sąskaitos" },
  { key: "buyer", label: "Pirkėjų skolos" },
  { key: "supplier", label: "Tiekėjų skolos" },
  { key: "fixed_asset", label: "Ilgalaikis turtas" },
  { key: "review", label: "Patikrinimas" },
];

const SECTION_INFO = {
  balance: {
    title: "Įkelkite bandomąjį balansą",
    hint: "Sąskaitų likučiai perėjimo dienai. Banko sąskaitas ir kontrahentų skolas įkelsite kituose žingsniuose.",
    required: true,
  },
  bank: {
    title: "Įkelkite banko sąskaitų likučius",
    hint: "Kiekvienos sąskaitos likutis su IBAN. Valiutinėms nurodykite ir sumą valiuta.",
    required: false,
  },
  buyer: {
    title: "Įkelkite pirkėjų skolas",
    hint: "Kiek pirkėjai skolingi jums. Permoka — kai pirkėjas sumokėjo daugiau.",
    required: false,
  },
  supplier: {
    title: "Įkelkite tiekėjų skolas",
    hint: "Kiek jūs skolingi tiekėjams. Avansas — kai sumokėjote iš anksto.",
    required: false,
  },
  fixed_asset: {
    title: "Įkelkite ilgalaikio turto registrą",
    hint: "Kiekvieno turto savikaina ir sukauptas nusidėvėjimas perėjimo dienai. Kortelės bus sukurtos patvirtinus likučius, DK įrašas nekuriamas — sumos jau yra balanse.",
    required: false,
  },
};

const KIND_LABELS = {
  "2410": "Pirkėjo skola",
  "4420": "Pirkėjo permoka",
  "4430": "Skola tiekėjui",
  "2080": "Avansas tiekėjui",
};

const MATCH_CHIP = {
  exact: { label: "Sutampa", color: "success" },
  saved: { label: "Iš ankstesnio", color: "success" },
  prefix: { label: "Pagal kodą", color: "warning" },
  name: { label: "Pagal pavadinimą", color: "warning" },
  manual: { label: "Rankinis", color: "info" },
  none: { label: "Nesusieta", color: "error" },
};

const fmtMoney = (val) => {
  const num = Number(val || 0);
  if (Number.isNaN(num)) return "—";
  return new Intl.NumberFormat("lt-LT", {
    style: "currency", currency: "EUR",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(num);
};

const fmtAmount = (val, currency = "EUR") => {
  const num = Number(val || 0);
  if (Number.isNaN(num)) return "—";
  return new Intl.NumberFormat("lt-LT", {
    style: "currency", currency: (currency || "EUR").toUpperCase(),
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(num);
};

// ════════════════════════════════════════════════════════
// Vieno žingsnio failo įkėlimas + lentelė
// ════════════════════════════════════════════════════════

function SectionStep({ sectionKey, batch, lines, onUploaded, onLineChanged, disabled, categories }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");

  const cfg = SECTION_INFO[sectionKey];
  const info = batch?.sections?.[sectionKey];
  const isCounterparty = sectionKey === "buyer" || sectionKey === "supplier";
  const isAsset = sectionKey === "fixed_asset";

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    setWarnings([]);

    const form = new FormData();
    form.append("file", file);

    try {
      const { data } = await api.post(`${BASE}/upload/${sectionKey}/`, form, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" },
      });
      setWarnings(data.warnings || []);
      onUploaded(sectionKey, data.lines || [], data.summary);
    } catch (e) {
      setError(e.response?.data?.detail || "Nepavyko įkelti failo.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const saveMapping = async (lineId) => {
    const code = editValue.trim();
    setEditingId(null);
    if (!code) return;
    try {
      const { data } = await api.patch(
        `${BASE}/line/${lineId}/`, { mapped_account: code }, { withCredentials: true },
      );
      onLineChanged(sectionKey, data.line, data.summary);
    } catch (e) {
      setError(e.response?.data?.detail || "Nepavyko priskirti sąskaitos.");
    }
  };

  const saveCategory = async (lineId, category) => {
    try {
      const { data } = await api.patch(
        `${BASE}/line/${lineId}/`, { category }, { withCredentials: true },
      );
      onLineChanged(sectionKey, data.line, data.summary);
    } catch (e) {
      setError(e.response?.data?.detail || "Nepavyko priskirti grupės.");
    }
  };

  const downloadTemplate = async () => {
    setError("");
    try {
      const { data } = await api.get(`${BASE}/template/${sectionKey}/`, {
        responseType: "blob", withCredentials: true,
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      const fileNames = {
        balance: "balansas",
        bank: "banko_saskaitos",
        buyer: "pirkejai",
        supplier: "tiekejai",
        fixed_asset: "ilgalaikis_turtas",
      };
      a.download = `pradiniai_likuciai_${fileNames[sectionKey] || sectionKey}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError("Nepavyko atsisiųsti šablono.");
    }
  };

  const totalD = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalK = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const unmapped = isAsset
    ? lines.filter((l) => !l.category).length
    : lines.filter((l) => !isCounterparty && !l.mapped_account).length;

  return (
    <Box>
      <Typography sx={{ fontSize: 17, fontWeight: 800 }}>{cfg.title}</Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.5, mb: 2 }}>
        {cfg.hint}
        {!cfg.required && " Šį žingsnį galite praleisti."}
      </Typography>

      {lines.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{
            p: 4, borderRadius: 2, borderStyle: "dashed", borderWidth: 2,
            textAlign: "center", bgcolor: "action.hover",
          }}
        >
          <UploadFileIcon sx={{ fontSize: 36, color: "text.disabled", mb: 1 }} />
          <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 0.5 }}>
            Failas dar neįkeltas
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: "text.secondary", mb: 2 }}>
            Paruoškite .xlsx pagal mūsų šabloną
          </Typography>
          <Box sx={{ display: "flex", gap: 1, justifyContent: "center", flexWrap: "wrap" }}>
            <Button size="small" startIcon={<DownloadIcon />} onClick={downloadTemplate} sx={{ textTransform: "none" }}>
              Atsisiųsti šabloną
            </Button>
            <Button
              size="small" variant="contained" disableElevation
              startIcon={uploading ? <CircularProgress size={14} color="inherit" /> : <UploadFileIcon />}
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
              sx={{ textTransform: "none", fontWeight: 700 }}
            >
              Pasirinkti failą
            </Button>
          </Box>
        </Paper>
      ) : (
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, mb: 1.5, flexWrap: "wrap" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Chip
              size="small" color={unmapped > 0 ? "warning" : "success"} variant="outlined"
              label={unmapped > 0 ? `${unmapped} nesusieta` : `${lines.length} eilutės`}
            />
            <Typography sx={{ fontSize: 12, color: "text.disabled" }}>{info?.file_name}</Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button size="small" startIcon={<DownloadIcon />} onClick={downloadTemplate} sx={{ textTransform: "none" }}>
              Šablonas
            </Button>
            <Button
              size="small" variant="outlined"
              startIcon={uploading ? <CircularProgress size={14} /> : <UploadFileIcon />}
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
              sx={{ textTransform: "none" }}
            >
              Įkelti iš naujo
            </Button>
          </Box>
        </Box>
      )}

      <input ref={inputRef} type="file" accept=".xlsx,.xlsm" hidden onChange={(e) => handleFile(e.target.files?.[0])} />

      {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}

      {warnings.length > 0 && (
        <Alert severity="warning" sx={{ mt: 1.5, "& .MuiAlert-message": { fontSize: 12.5 } }}>
          {warnings.slice(0, 5).map((w, i) => <div key={i}>{w}</div>)}
          {warnings.length > 5 && <div>…ir dar {warnings.length - 5}</div>}
        </Alert>
      )}

      {unmapped > 0 && (
        <Alert severity="warning" sx={{ mt: 1.5, "& .MuiAlert-message": { fontSize: 13 } }}>
          {isAsset
            ? `Priskirkite turto grupę ${unmapped} eilutėms — be jos kortelė nebus sukurta.`
            : `Priskirkite mūsų sąskaitą ${unmapped} eilutėms — spustelėkite brūkšnelį stulpelyje „Mūsų sąskaita“.`}
        </Alert>
      )}

      {lines.length > 0 && isAsset && (
        <TableContainer component={Paper} sx={{ mt: 1.5, maxHeight: 440, borderRadius: 2, boxShadow: "none", border: "0.5px solid", borderColor: "divider" }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontSize: 11, fontWeight: 800, width: 110 }}>Inv. nr.</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 800 }}>Pavadinimas</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 800, width: 210 }}>Turto grupė</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 800, width: 100 }}>Eksploatacija</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 800, width: 70 }} align="right">Mėn.</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 800, width: 120 }} align="right">Savikaina</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 800, width: 130 }} align="right">Sukaupta</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 800, width: 120 }} align="right">Likutinė</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((line) => {
                const extra = line.extra || {};
                const cost = Number(line.debit || 0);
                const accumulated = Number(line.credit || 0);
                return (
                  <TableRow key={line.id} hover sx={!line.category ? { bgcolor: "#FFFBF5" } : undefined}>
                    <TableCell sx={{ fontSize: 12 }}>{extra.inventory_number || "—"}</TableCell>
                    <TableCell sx={{ fontSize: 12.5, fontWeight: 600 }}>{line.account_name}</TableCell>
                    <TableCell>
                      <TextField
                        select size="small" value={line.category || ""}
                        disabled={disabled}
                        onChange={(e) => saveCategory(line.id, e.target.value)}
                        SelectProps={{ MenuProps: { disableScrollLock: true } }}
                        error={!line.category}
                        sx={{ width: 195, "& .MuiInputBase-root": { fontSize: 12, height: 30 } }}
                      >
                        {categories.map((c) => (
                          <MenuItem key={c.value} value={c.value} sx={{ fontSize: 12.5 }}>
                            {c.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{extra.operation_start_date || "—"}</TableCell>
                    <TableCell align="right" sx={{ fontSize: 12 }}>{extra.useful_life_months || "—"}</TableCell>
                    <TableCell align="right" sx={{ fontSize: 12.5, color: "#2563EB" }}>{fmtMoney(cost)}</TableCell>
                    <TableCell align="right" sx={{ fontSize: 12.5, color: "#DC2626" }}>{fmtMoney(accumulated)}</TableCell>
                    <TableCell align="right" sx={{ fontSize: 12.5, fontWeight: 700 }}>{fmtMoney(cost - accumulated)}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow>
                <TableCell colSpan={5} align="right" sx={{ fontSize: 11.5, fontWeight: 800 }}>
                  Iš viso {lines.length} vnt.
                </TableCell>
                <TableCell align="right" sx={{ fontSize: 12.5, fontWeight: 800, color: "#2563EB" }}>{fmtMoney(totalD)}</TableCell>
                <TableCell align="right" sx={{ fontSize: 12.5, fontWeight: 800, color: "#DC2626" }}>{fmtMoney(totalK)}</TableCell>
                <TableCell align="right" sx={{ fontSize: 12.5, fontWeight: 800 }}>{fmtMoney(totalD - totalK)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {lines.length > 0 && !isAsset && (
        <TableContainer component={Paper} sx={{ mt: 1.5, maxHeight: 420, borderRadius: 2, boxShadow: "none", border: "0.5px solid", borderColor: "divider" }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {isCounterparty ? (
                  <>
                    <TableCell sx={{ fontSize: 11, fontWeight: 800 }}>Kontrahentas</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 800, width: 120 }}>Kodas</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 800, width: 150 }}>Tipas</TableCell>
                  </>
                ) : (
                  <>
                    <TableCell sx={{ fontSize: 11, fontWeight: 800, width: 100 }}>Jūsų kodas</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 800 }}>Pavadinimas</TableCell>
                  </>
                )}
                <TableCell sx={{ fontSize: 11, fontWeight: 800, width: 120 }} align="right">Debetas</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 800, width: 120 }} align="right">Kreditas</TableCell>
                {!isCounterparty && <TableCell sx={{ fontSize: 11, fontWeight: 800, width: 210 }}>Mūsų sąskaita</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((line) => {
                const chip = MATCH_CHIP[line.match_type] || MATCH_CHIP.none;
                return (
                  <TableRow key={line.id} hover>
                    {isCounterparty ? (
                      <>
                        <TableCell sx={{ fontSize: 12.5, fontWeight: 600 }}>{line.counterparty_name || "—"}</TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{line.counterparty_code || "—"}</TableCell>
                        <TableCell sx={{ fontSize: 12 }}>
                          <Box component="span" sx={{ fontWeight: 700, mr: 0.75 }}>{line.account_code}</Box>
                          <Box component="span" sx={{ color: "text.secondary" }}>
                            {KIND_LABELS[line.account_code] || ""}
                          </Box>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell sx={{ fontSize: 12.5, fontWeight: 700 }}>{line.account_code || "—"}</TableCell>
                        <TableCell sx={{ fontSize: 12, color: "text.secondary" }}>{line.account_name || "—"}</TableCell>
                      </>
                    )}
                    <TableCell align="right" sx={{ fontSize: 12.5, color: "#2563EB" }}>
                      {Number(line.debit) ? fmtAmount(line.debit, line.currency) : ""}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: 12.5, color: "#DC2626" }}>
                      {Number(line.credit) ? fmtAmount(line.credit, line.currency) : ""}
                    </TableCell>
                    {!isCounterparty && (
                      <TableCell>
                        {editingId === line.id ? (
                          <TextField
                            size="small" autoFocus value={editValue} placeholder="pvz. 2410"
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => saveMapping(line.id)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveMapping(line.id); }}
                            sx={{ width: 130, "& .MuiInputBase-root": { fontSize: 12, height: 30 } }}
                          />
                        ) : (
                          <Box
                            onClick={() => { if (!disabled) { setEditingId(line.id); setEditValue(line.mapped_account || ""); } }}
                            sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, cursor: disabled ? "default" : "pointer" }}
                          >
                            <Typography sx={{ fontSize: 12.5, fontWeight: 800, minWidth: 42 }}>
                              {line.mapped_account || "—"}
                            </Typography>
                            <Chip label={chip.label} color={chip.color} size="small" variant="outlined" sx={{ height: 19, fontSize: 10.5 }} />
                          </Box>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              <TableRow>
                <TableCell colSpan={isCounterparty ? 3 : 2} align="right" sx={{ fontSize: 11.5, fontWeight: 800 }}>
                  {isCounterparty ? `Iš viso ${lines.length} eilutės` : "Iš viso"}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: 12.5, fontWeight: 800, color: "#2563EB" }}>
                  {isCounterparty ? "" : fmtMoney(totalD)}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: 12.5, fontWeight: 800, color: "#DC2626" }}>
                  {isCounterparty ? "" : fmtMoney(totalK)}
                </TableCell>
                {!isCounterparty && <TableCell />}
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

// ════════════════════════════════════════════════════════
// Paskutinis žingsnis
// ════════════════════════════════════════════════════════

function ReviewStep({ summary, batch, onConfirm, onReopen, confirming, onGoTo }) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const confirmed = batch?.status === "confirmed";
  const hasDiff = (summary?.control_accounts || []).some((r) => !r.matches);
  const unmapped = summary?.unmapped || [];
  const assets = summary?.fixed_assets;
  const assetDiff = (assets?.accounts || []).some((r) => !r.cost_matches || !r.accumulated_matches);

  const run = async (fn, arg) => {
    setError("");
    try {
      await fn(arg);
    } catch (e) {
      setError(e.response?.data?.detail || "Nepavyko įvykdyti veiksmo.");
    }
  };

  if (confirmed) {
    return (
      <Box sx={{ textAlign: "center", py: 3 }}>
        <CheckCircleIcon sx={{ fontSize: 48, color: "success.main", mb: 1 }} />
        <Typography sx={{ fontSize: 18, fontWeight: 800 }}>Likučiai patvirtinti</Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.5, mb: 3 }}>
          Įrašyti {batch.entry_date} · {summary?.line_count} eilutės · {summary?.counterparty_count} kontrahentai
          {assets?.created ? ` · ${assets.created} ilgalaikio turto kortelės` : ""}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, justifyContent: "center", flexWrap: "wrap" }}>
          <Button
            size="small" variant="outlined" startIcon={<ReceiptLongIcon />}
            onClick={() => navigate("/apskaitos-centras")}
            sx={{ textTransform: "none" }}
          >
            Peržiūrėti DK įrašą
          </Button>
          <Button size="small" color="error" startIcon={<LockOpenIcon />} onClick={() => run(onReopen)} sx={{ textTransform: "none" }}>
            Atšaukti likučius
          </Button>
        </Box>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </Box>
    );
  }

  return (
    <Box>
      <Typography sx={{ fontSize: 17, fontWeight: 800 }}>Patikrinkite ir patvirtinkite</Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.5, mb: 2 }}>
        Patvirtinus bus sukurtas DK įrašas {batch?.entry_date} dienai.
      </Typography>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 1.5, mb: 2 }}>
        {[
          { label: "Debetas", value: fmtMoney(summary?.total_debit), color: "text.primary" },
          { label: "Kreditas", value: fmtMoney(summary?.total_credit), color: "text.primary" },
          { label: "Skirtumas", value: fmtMoney(summary?.balance_difference), color: summary?.balanced ? "success.main" : "error.main" },
        ].map((m) => (
          <Paper key={m.label} sx={{ p: 1.5, borderRadius: 2, boxShadow: "none", bgcolor: "action.hover" }}>
            <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>{m.label}</Typography>
            <Typography sx={{ fontSize: 18, fontWeight: 800, color: m.color }}>{m.value}</Typography>
          </Paper>
        ))}
      </Box>

      {(summary?.control_accounts || []).length > 0 && (
        <TableContainer component={Paper} sx={{ mb: 2, borderRadius: 2, boxShadow: "none", border: "0.5px solid", borderColor: "divider" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontSize: 11, fontWeight: 800 }}>Sąskaita</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 800 }} align="right">Balanse</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 800 }} align="right">Kontrahentai</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 800 }} align="right">Skirtumas</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {summary.control_accounts.map((row) => (
                <TableRow key={row.account_code}>
                  <TableCell sx={{ fontSize: 12.5, fontWeight: 700 }}>
                    {row.account_code}
                    <Typography component="span" sx={{ fontSize: 11.5, color: "text.secondary", ml: 1 }}>
                      {row.account_name}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: 12.5 }}>{fmtMoney(row.in_balance)}</TableCell>
                  <TableCell align="right" sx={{ fontSize: 12.5 }}>{fmtMoney(row.in_counterparties)}</TableCell>
                  <TableCell align="right" sx={{ fontSize: 12.5, fontWeight: 800, color: row.matches ? "success.main" : "error.main" }}>
                    {row.matches ? "0,00 €" : fmtMoney(row.difference)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {assets && (
        <Paper sx={{ mb: 2, p: 1.75, borderRadius: 2, boxShadow: "none", bgcolor: "#FFF8EE", border: "1px solid #F0D7B1" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
            <WeekendIcon sx={{ fontSize: 18, color: "#e08d21" }} />
            <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: "#7A4A12" }}>
              Ilgalaikis turtas: {assets.count} vnt.
            </Typography>
          </Box>

          <Typography sx={{ fontSize: 12.5, color: "#5F513A", mb: 1 }}>
            Savikaina {fmtMoney(assets.total_cost)} · Sukauptas nusidėvėjimas {fmtMoney(assets.total_accumulated)} ·
            Likutinė vertė <b>{fmtMoney(assets.total_residual)}</b>
          </Typography>

          {(assets.accounts || []).length > 0 && (
            <Table size="small" sx={{ bgcolor: "#fff", borderRadius: 1 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontSize: 11, fontWeight: 800 }}>Sąskaita</TableCell>
                  <TableCell sx={{ fontSize: 11, fontWeight: 800 }} align="right">Registre</TableCell>
                  <TableCell sx={{ fontSize: 11, fontWeight: 800 }} align="right">Balanse</TableCell>
                  <TableCell sx={{ fontSize: 11, fontWeight: 800 }} align="right">Skirtumas</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {assets.accounts.map((row) => [
                  <TableRow key={`${row.asset_account}-cost`}>
                    <TableCell sx={{ fontSize: 12.5, fontWeight: 700 }}>
                      {row.asset_account}
                      <Typography component="span" sx={{ fontSize: 11.5, color: "text.secondary", ml: 1 }}>
                        savikaina · {row.count} vnt.
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: 12.5 }}>{fmtMoney(row.cost)}</TableCell>
                    <TableCell align="right" sx={{ fontSize: 12.5 }}>{fmtMoney(row.balance_cost)}</TableCell>
                    <TableCell align="right" sx={{ fontSize: 12.5, fontWeight: 800, color: row.cost_matches ? "success.main" : "error.main" }}>
                      {row.cost_matches ? "0,00 €" : fmtMoney(Number(row.cost) - Number(row.balance_cost))}
                    </TableCell>
                  </TableRow>,
                  <TableRow key={`${row.asset_account}-acc`}>
                    <TableCell sx={{ fontSize: 12.5, fontWeight: 700 }}>
                      {row.accumulated_account || "—"}
                      <Typography component="span" sx={{ fontSize: 11.5, color: "text.secondary", ml: 1 }}>
                        nusidėvėjimas
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: 12.5 }}>{fmtMoney(row.accumulated)}</TableCell>
                    <TableCell align="right" sx={{ fontSize: 12.5 }}>{fmtMoney(row.balance_accumulated)}</TableCell>
                    <TableCell align="right" sx={{ fontSize: 12.5, fontWeight: 800, color: row.accumulated_matches ? "success.main" : "error.main" }}>
                      {row.accumulated_matches ? "0,00 €" : fmtMoney(Number(row.accumulated) - Number(row.balance_accumulated))}
                    </TableCell>
                  </TableRow>,
                ])}
              </TableBody>
            </Table>
          )}

          {assets.unmapped > 0 && (
            <Alert severity="warning" sx={{ mt: 1.5, "& .MuiAlert-message": { fontSize: 12.5 } }}
              action={<Button size="small" onClick={() => onGoTo("fixed_asset")} sx={{ textTransform: "none" }}>Taisyti</Button>}
            >
              {assets.unmapped} turto eilutėms nepriskirta grupė — kortelės nebus sukurtos.
            </Alert>
          )}

          {assetDiff && (
            <Alert severity="warning" sx={{ mt: 1.5, "& .MuiAlert-message": { fontSize: 12.5 } }}>
              Turto registro sumos nesutampa su balansu. Patikslinkite failus — kitaip DK ir turto
              registras nuo pradžių skirsis.
            </Alert>
          )}
        </Paper>
      )}

      {summary?.fixed_asset_errors?.length > 0 && (
        <Alert severity="error" sx={{ mb: 1.5, "& .MuiAlert-message": { fontSize: 12.5 } }}>
          Dalis turto kortelių nesukurta:
          {summary.fixed_asset_errors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
        </Alert>
      )}

      {unmapped.length > 0 && (
        <Alert
          severity="warning" sx={{ mb: 1.5, "& .MuiAlert-message": { fontSize: 13 } }}
          action={<Button size="small" onClick={() => onGoTo(unmapped[0].section)} sx={{ textTransform: "none" }}>Taisyti</Button>}
        >
          Nesusietos {unmapped.length} sąskaitos.
        </Alert>
      )}

      {!summary?.balanced && (
        <Alert severity="warning" sx={{ mb: 1.5, "& .MuiAlert-message": { fontSize: 13 } }}>
          Debetas nelygus kreditui. Skirtumas {fmtMoney(summary?.balance_difference)} bus
          įrašytas į techninę sąskaitą {summary?.technical_account || "999"}.
          Vėliau ištaisykite jį rankiniu DK įrašu.
        </Alert>
      )}

      {hasDiff && (
        <Alert severity="warning" sx={{ mb: 1.5, "& .MuiAlert-message": { fontSize: 13 } }}>
          Balanse ir kontrahentų faile sumos skiriasi. Patikslinkite failą arba priskirkite skirtumą be kontrahento.
        </Alert>
      )}

      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        {hasDiff && (
          <Button
            size="small" variant="outlined"
            disabled={confirming || unmapped.length > 0}
            onClick={() => run(onConfirm, "unassigned")}
            sx={{ textTransform: "none" }}
          >
            Priskirti skirtumą ir patvirtinti
          </Button>
        )}
        <Button
          size="small" variant="contained" disableElevation
          disabled={confirming || !summary?.can_confirm}
          onClick={() => run(onConfirm, "ask")}
          sx={{ textTransform: "none", fontWeight: 800 }}
        >
          {confirming ? "Tvirtinama..." : "Patvirtinti likučius"}
        </Button>
      </Box>
    </Box>
  );
}

// ════════════════════════════════════════════════════════
// Puslapis
// ════════════════════════════════════════════════════════

export default function PradiniaiLikuciaiPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const navigate = useNavigate();
  const { activeId, initialized, loading: profilesLoading } = useCompanyProfiles();

  const [activeStep, setActiveStep] = useState(0);
  const [batch, setBatch] = useState(null);
  const [summary, setSummary] = useState(null);
  const [linesBySection, setLinesBySection] = useState({ balance: [], bank: [], buyer: [], supplier: [], fixed_asset: [] });
  const [assetCategories, setAssetCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingDate, setSavingDate] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cutover, setCutover] = useState(dayjs().startOf("year"));
  const [dateError, setDateError] = useState("");

  const loadAll = useCallback(async () => {
    if (!activeId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`${BASE}/`, { withCredentials: true });
      setBatch(data.batch);
      setSummary(data.summary || null);

      if (data.batch) {
        setCutover(dayjs(data.batch.cutover_date));
        const results = await Promise.all(
          SECTION_KEYS.map((s) => api.get(`${BASE}/lines/${s}/`, { withCredentials: true })),
        );
        const next = {};
        SECTION_KEYS.forEach((s, i) => { next[s] = results[i].data.lines || []; });
        setLinesBySection(next);
        if (data.batch.status === "confirmed") setActiveStep(STEPS.length - 1);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  useEffect(() => {
    setActiveStep(0);
    setBatch(null);
    setSummary(null);
    setLinesBySection({ balance: [], bank: [], buyer: [], supplier: [], fixed_asset: [] });
    setCutover(dayjs().startOf("year"));
    loadAll();
    api.get(`${BASE}/asset-categories/`, { withCredentials: true })
      .then(({ data }) => setAssetCategories(data.categories || []))
      .catch(() => setAssetCategories([]));
  }, [loadAll]);

  const saveDate = async () => {
    if (!cutover?.isValid()) return;
    setSavingDate(true);
    setDateError("");
    try {
      const { data } = await api.post(
        `${BASE}/`, { cutover_date: cutover.format("YYYY-MM-DD") }, { withCredentials: true },
      );
      setBatch(data.batch);
      setSummary(data.summary);
      setActiveStep(1);
    } catch (e) {
      setDateError(e.response?.data?.detail || "Nepavyko išsaugoti datos.");
    } finally {
      setSavingDate(false);
    }
  };

  const handleUploaded = (key, lines, newSummary) => {
    setLinesBySection((prev) => ({ ...prev, [key]: lines }));
    setSummary(newSummary);
    api.get(`${BASE}/`, { withCredentials: true })
      .then(({ data }) => setBatch(data.batch))
      .catch(() => {});
  };

  const handleLineChanged = (key, line, newSummary) => {
    setLinesBySection((prev) => ({
      ...prev, [key]: prev[key].map((l) => (l.id === line.id ? line : l)),
    }));
    setSummary(newSummary);
  };

  const confirmBatch = async (policy) => {
    setConfirming(true);
    try {
      const { data } = await api.post(`${BASE}/confirm/`, { diff_policy: policy }, { withCredentials: true });
      setBatch(data.batch);
      setSummary(data.summary);
    } finally {
      setConfirming(false);
    }
  };

  const reopenBatch = async () => {
    const { data } = await api.post(`${BASE}/reopen/`, {}, { withCredentials: true });
    setBatch(data.batch);
    setSummary(data.summary);
    setActiveStep(1);
  };

  const goToSection = (sectionKey) => {
    const idx = STEPS.findIndex((s) => s.key === sectionKey);
    if (idx >= 0) setActiveStep(idx);
  };

  if (!initialized || profilesLoading || loading) {
    return <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}><CircularProgress size={28} /></Box>;
  }

  if (!activeId) {
    return <Box sx={{ p: 4 }}><Alert severity="info">Pasirinkite įmonės profilį.</Alert></Box>;
  }

  const locked = batch?.status === "confirmed";
  const step = STEPS[activeStep];
  const canGoNext =
    activeStep === 0
      ? Boolean(batch)
      : activeStep === 1
        ? (linesBySection.balance || []).length > 0
        : true;

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="lt">
      <Box sx={{ p: isMobile ? 2 : 4, maxWidth: 1100, mx: "auto" }}>
        <Helmet><title>Pradiniai likučiai - DokSkenas</title></Helmet>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
          <IconButton size="small" onClick={() => navigate("/apskaitos-centras")}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Typography variant={isMobile ? "h6" : "h5"} sx={{ fontWeight: 800 }}>Pradiniai likučiai</Typography>
        </Box>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 3, ml: 5 }}>
          Perkelkite likučius iš ankstesnės apskaitos programos
        </Typography>

        <Stepper
          activeStep={activeStep}
          alternativeLabel={!isMobile}
          orientation={isMobile ? "vertical" : "horizontal"}
          sx={{ mb: 3 }}
        >
          {STEPS.map((s, i) => (
            <Step key={s.key} completed={locked || i < activeStep}>
              <StepLabel
                onClick={() => { if (batch || i === 0) setActiveStep(i); }}
                sx={{ cursor: "pointer", "& .MuiStepLabel-label": { fontSize: 13 } }}
              >
                {s.label}
              </StepLabel>
            </Step>
          ))}
        </Stepper>

        <Paper sx={{ p: isMobile ? 2 : 3, borderRadius: 2, border: "0.5px solid", borderColor: "divider", boxShadow: "none", minHeight: 320 }}>
          {step.key === "date" && (
            <Box>
              <Typography sx={{ fontSize: 17, fontWeight: 800 }}>Nuo kada dirbate DokSkenas ERP?</Typography>
              <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.5, mb: 2 }}>
                Visos operacijos nuo šios dienos vedamos čia. Likučiai įrašomi viena diena anksčiau.
              </Typography>

              <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
                <DatePicker
                  label="Perėjimo data" value={cutover} onChange={setCutover}
                  format="YYYY-MM-DD" disabled={locked}
                  slotProps={{ textField: { size: "small", sx: { width: 200 } } }}
                />
                {!locked && (
                  <Button variant="contained" size="small" disableElevation onClick={saveDate} disabled={savingDate} sx={{ textTransform: "none", fontWeight: 700 }}>
                    {batch ? "Išsaugoti" : "Tęsti"}
                  </Button>
                )}
              </Box>

              {batch && (
                <Alert severity="info" sx={{ mt: 2, "& .MuiAlert-message": { fontSize: 13 } }}>
                  Likučiai bus įrašyti <b>{batch.entry_date}</b>. Dokumentai, ankstesni už perėjimo datą, į DK nepateks.
                </Alert>
              )}
              {dateError && <Alert severity="error" sx={{ mt: 2 }}>{dateError}</Alert>}
            </Box>
          )}

          {SECTION_KEYS.includes(step.key) && (
            <SectionStep
              sectionKey={step.key}
              batch={batch}
              lines={linesBySection[step.key] || []}
              onUploaded={handleUploaded}
              onLineChanged={handleLineChanged}
              disabled={locked}
              categories={assetCategories}
            />
          )}

          {step.key === "review" && (
            <ReviewStep
              summary={summary} batch={batch} onConfirm={confirmBatch}
              onReopen={reopenBatch} confirming={confirming} onGoTo={goToSection}
            />
          )}
        </Paper>

        {!(step.key === "review" && locked) && (
          <Box sx={{ display: "flex", justifyContent: "space-between", mt: 2 }}>
            <Button
              onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
              disabled={activeStep === 0}
              startIcon={<ArrowBackIcon />}
              sx={{ textTransform: "none" }}
            >
              Atgal
            </Button>
            {activeStep < STEPS.length - 1 && (
              <Button
                variant="outlined"
                onClick={() => setActiveStep((s) => s + 1)}
                disabled={!canGoNext}
                endIcon={<ArrowForwardIcon />}
                sx={{ textTransform: "none" }}
              >
                Toliau
              </Button>
            )}
          </Box>
        )}
      </Box>
    </LocalizationProvider>
  );
}