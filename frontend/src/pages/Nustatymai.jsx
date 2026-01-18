import React, { useEffect, useState, useCallback } from "react";
import {
  Box, Typography, FormControl, InputLabel, Select, MenuItem,
  Button, Alert, Tabs, Tab, Paper, TextField, Stack, RadioGroup,
  FormControlLabel, Radio, IconButton, Tooltip, Switch, Table, TableContainer,
  TableHead, TableRow, TableCell, TableBody, Grid2, Chip,
} from "@mui/material";

import DeleteIcon from "@mui/icons-material/Delete";
import { alpha } from "@mui/material/styles";
import EditIcon from '@mui/icons-material/Edit';
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import Autocomplete from "@mui/material/Autocomplete";
import { api } from "../api/endpoints";
import { COUNTRY_OPTIONS } from "../page_elements/Countries";
import { ACCOUNTING_PROGRAMS } from "../page_elements/AccountingPrograms";
import { AccountingProgramExtraSettings } from "../page_elements/AccountingProgramExtraSettings";
import { Helmet } from "react-helmet";

/** ===== PVM copy text (tab-separated), for Apskaita5 button ===== */
const PVM_COPY_TEXT = [
  "PVM1\t21% — Pirkimas, Pardavimas — Prekė, Paslauga",
  "PVM2\t9% — Pirkimas, Pardavimas — Prekė, Paslauga",
  "PVM3\t5% — Pirkimas, Pardavimas — Prekė, Paslauga",
  "PVM49\t6% — Pirkimas, Pardavimas — Prekė, Paslauga",
  "PVM5\t0% — Pirkimas, Pardavimas — Prekė, Paslauga",
  "PVM12\t0% — Pirkimas, Pardavimas — Prekė",
  "PVM13\t0% — Pirkimas, Pardavimas — Prekė",
  "PVM14\t0% — Pirkimas, Pardavimas — Paslauga",
  "PVM21\t0% — Pirkimas, Pardavimas — Paslauga",
].join("\n");

const PREKES_ASSEMBLY_OPTIONS = [
  { value: 1, label: "Paprasta" },
  { value: 2, label: "Komplektuojama" },
  { value: 3, label: "Išskaidoma" },
  { value: 4, label: "Generavimai" },
  { value: 5, label: "Sudėtinė" },
  { value: 6, label: "Komplektuojama/Išskaidoma" },
  { value: 7, label: "Mišri" },
  { value: 8, label: "Tara" },
];

/** ===== Reusable: import tab for XLSX ===== */
function ImportTab({ label, url, templateFileName }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error,   setError] = useState(null);
  const inputRef  = React.useRef(null);

  const handleFile = (e) => {
    setFile(e.target.files[0] || null);
    setResult(null);
    setError(null);
  };

  const handleImport = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const { data } = await api.post(url, formData, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (data?.error) {
        setError(data.error);
        setResult({ imported: 0, processed: 0 });
      } else {
        setResult({
          imported: Number(data?.imported) || 0,
          processed: Number(data?.processed) || 0,
        });
        setError(null);
      }
    } catch (err) {
      setError(err?.response?.data?.error || "Importo klaida");
      setResult({ imported: 0, processed: 0 });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
      setFile(null);
    }
  };

  const extractErrorMessage = (e, fallback) => {
    const data = e?.response?.data;
    let msg = data?.detail || data?.non_field_errors || data?.error || fallback;
    if (Array.isArray(msg)) msg = msg.join(", ");
    if (typeof msg === "object") {
      try { msg = JSON.stringify(msg); } catch { msg = fallback; }
    }
    return String(msg || fallback);
  };

  const handleDownloadTemplate = () =>
    window.open(`/templates/${templateFileName || "imones_sablonas.xlsx"}`, "_blank");

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography gutterBottom variant="subtitle1">{label}</Typography>

      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <Button variant="outlined" component="label">
          Pasirinkite failą
          <input type="file" accept=".xlsx" hidden ref={inputRef} onChange={handleFile} />
        </Button>
        <Typography variant="body2">
          {file ? file.name : "Niekas nepasirinkta"}
        </Typography>
      </Stack>

      <Button variant="contained" disabled={!file} onClick={handleImport}>Importuoti</Button>
      <Button variant="outlined" size="small" sx={{ ml: 2 }} onClick={handleDownloadTemplate}>
        Atsisiųsti Excel šabloną
      </Button>

      {result && (
        <Alert severity="success" sx={{ mt: 2 }}>
          Importuota įrašų: {result?.imported ?? 0} iš {result?.processed ?? 0}
        </Alert>
      )}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </Paper>
  );
}

/** ===== Defaults fieldset (with company fields) ===== */
const DefaultsFields = React.memo(function DefaultsFields({ mode, program, state, setState, touched }) {
  const isPurchase = mode === "pirkimas";
  const showKodas = program === "rivile";

  React.useEffect(() => {
    if (!showKodas && String(state.tipas || "").toLowerCase() === "kodas") {
      setState((prev) => ({ ...prev, tipas: "Prekė", kodas_kaip: "" }));
    }
  }, [showKodas, state.tipas, setState]);

  const labels = React.useMemo(
    () =>
      isPurchase
        ? {
            title: "Pirkimas",
            imones_pavadinimas: "Įmonės pavadinimas",
            imones_kodas: "Įmonės kodas",
            imones_pvm_kodas: "Įmonės PVM kodas",
            pavadinimas: "Išlaidos pavadinimas",
            kodas: "Išlaidos kodas",
            barkodas: "Išlaidos barkodas",
            tipas: "Išlaidos tipas",
          }
        : {
            title: "Pardavimas",
            imones_pavadinimas: "Įmonės pavadinimas",
            imones_kodas: "Įmonės kodas",
            imones_pvm_kodas: "Įmonės PVM kodas",
            pavadinimas: "Pajamų pavadinimas",
            kodas: "Pajamų kodas",
            barkodas: "Pajamų barkodas",
            tipas: "Pajamų tipas",
          },
    [isPurchase]
  );

  const onChangeField = (field) => (e) =>
    setState((prev) => ({ ...prev, [field]: e.target.value }));

  const isKodas = String(state.tipas || "").toLowerCase() === "kodas";

  return (
    <Stack spacing={2} direction="column">
      <TextField
        label={labels.imones_pavadinimas}
        value={state.imones_pavadinimas}
        onChange={onChangeField("imones_pavadinimas")}
        fullWidth
      />
      <TextField
        label={labels.imones_kodas}
        value={state.imones_kodas}
        onChange={onChangeField("imones_kodas")}
        fullWidth
        required
        error={touched && !state.imones_kodas?.trim()}
        helperText={touched && !state.imones_kodas?.trim() ? "Privalomas laukas" : ""}
      />
      <TextField
        label={labels.imones_pvm_kodas}
        value={state.imones_pvm_kodas}
        onChange={onChangeField("imones_pvm_kodas")}
        fullWidth
      />

      <TextField
        label={labels.pavadinimas}
        value={state.pavadinimas}
        onChange={onChangeField("pavadinimas")}
        fullWidth
        required
        error={touched && !state.pavadinimas?.trim()}
        helperText={touched && !state.pavadinimas?.trim() ? "Privalomas laukas" : ""}
      />
      <TextField
        label={labels.kodas}
        value={state.kodas}
        onChange={onChangeField("kodas")}
        fullWidth
        required
        error={touched && !state.kodas?.trim()}
        helperText={touched && !state.kodas?.trim() ? "Privalomas laukas" : ""}
      />
      <TextField
        label={labels.barkodas}
        value={state.barkodas}
        onChange={onChangeField("barkodas")}
        fullWidth
      />
      <FormControl fullWidth required error={touched && !state.tipas}>
        <InputLabel>{labels.tipas}</InputLabel>
        <Select
          label={labels.tipas}
          value={state.tipas}
          onChange={(e) => setState((prev) => ({ ...prev, tipas: e.target.value }))}
        >
          <MenuItem value="Prekė">Prekė</MenuItem>
          <MenuItem value="Paslauga">Paslauga</MenuItem>
          {showKodas && <MenuItem value="Kodas">Kodas</MenuItem>}
        </Select>
      </FormControl>

      {isKodas && (
        <FormControl
          fullWidth
          required
          error={touched && !state.kodas_kaip}
          sx={{ mt: 1 }}
        >
          <InputLabel>Nustatyti PVM klasifikatorių kaip</InputLabel>
          <Select
            label="Nustatyti PVM klasifikatorių kaip"
            value={state.kodas_kaip || ""}
            onChange={(e) => setState((prev) => ({ ...prev, kodas_kaip: e.target.value }))}
          >
            <MenuItem value="Prekei">Prekei</MenuItem>
            <MenuItem value="Paslaugai">Paslaugai</MenuItem>
          </Select>
        </FormControl>
      )}
    </Stack>
  );
});

/** ===== Cards list of saved defaults (Detaliai-like) ===== */
function DefaultsCards({ rows, onDelete, onEdit }) {
  if (!rows?.length) {
    return (
      <Box
        sx={{
          textAlign: "center",
          py: 6,
          border: "2px dashed",
          borderColor: "divider",
          borderRadius: 2,
          backgroundColor: "grey.50",
          mt: 2,
        }}
      >
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Nėra išsaugotų profilių
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
          Sukurkite pirmąjį profilį aukščiau
        </Typography>
      </Box>
    );
  }

  const tipasLabel = (t) => {
    const s = String(t).toLowerCase();
    if (t === 2 || s === "paslauga") return "Paslauga";
    if (t === 3) return "Kodas (Prekei)";
    if (t === 4) return "Kodas (Paslaugai)";
    if (s === "kodas") return "Kodas";
    return "Prekė";
  };

  return (
    <Stack spacing={2} sx={{ mt: 2 }}>
      {rows.map((r, idx) => {
        const role = r.__role === "buyer" ? "buyer" : "seller";
        const roleLabel = role === "buyer" ? "Pirkėjas" : "Pardavėjas";
        const roleGenitive = role === "buyer" ? "Pirkėjo" : "Pardavėjo";
        const numBg = role === "buyer" ? "success.main" : "primary.main";

        return (
          <Box
            key={`${role}-${idx}`}
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              overflow: "hidden",
              transition: "all 0.2s",
              "&:hover": { boxShadow: 2 },
            }}
          >
            {/* header */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: 2,
                py: 1.5,
                backgroundColor: "grey.50",
                borderBottom: "1px solid",
                borderColor: "divider",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                <Chip
                  label={`#${idx + 1}`}
                  size="small"
                  sx={{
                    fontWeight: 700,
                    backgroundColor: numBg, // buyer->success.main, seller->primary.main
                    color: "white",
                  }}
                />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.primary" }}>
                  Aktyvi
                </Typography>
              </Box>

              {/* icons together (edit рядом с delete) */}
              <Stack direction="row" spacing={1}>
                <IconButton
                  size="small"
                  onClick={() => onEdit(idx)}
                  sx={{ backgroundColor: "white", "&:hover": { backgroundColor: "grey.100" } }}
                >
                  <EditIcon fontSize="small" color="primary" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => onDelete(idx)}
                  sx={{ backgroundColor: "white", "&:hover": { backgroundColor: "error.50" } }}
                  aria-label="Ištrinti"
                >
                  <DeleteOutlineIcon fontSize="small" color="error" />
                </IconButton>
              </Stack>
            </Box>

            {/* body */}
            <Box sx={{ p: 2, backgroundColor: "white" }}>
              <Grid2 container spacing={3}>
                <Grid2 size={{ xs: 12, md: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      textTransform: "uppercase",
                      fontWeight: 700,
                      letterSpacing: 0.5,
                    }}
                  >
                    Sąlygos
                  </Typography>

                  <Box sx={{ mt: 1 }}>
                    <Stack spacing={0.5}>
                      {r.imones_pavadinimas && (
                        <Typography variant="body2">
                          • <strong>{roleGenitive} įmonė:</strong> {r.imones_pavadinimas}
                        </Typography>
                      )}
                      {r.imones_kodas && (
                        <Typography variant="body2">
                          • <strong>{roleGenitive} įmonės kodas:</strong> {r.imones_kodas}
                        </Typography>
                      )}
                      {r.imones_pvm_kodas && (
                        <Typography variant="body2">
                          • <strong>{roleGenitive} PVM kodas:</strong> {r.imones_pvm_kodas}
                        </Typography>
                      )}
                      {!r.imones_pavadinimas && !r.imones_kodas && !r.imones_pvm_kodas && (
                        <Typography variant="body2" color="text.secondary">
                          • —
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                </Grid2>

                <Grid2 size={{ xs: 12, md: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      textTransform: "uppercase",
                      fontWeight: 700,
                      letterSpacing: 0.5,
                    }}
                  >
                    Taikyti
                  </Typography>

                  <Box sx={{ mt: 1 }}>
                    <Stack spacing={0.5}>
                      {r.pavadinimas && (
                        <Typography variant="body2">
                          <strong>Pavadinimas:</strong> {r.pavadinimas}
                        </Typography>
                      )}
                      <Typography variant="body2">
                        <strong>Kodas:</strong> {r.kodas || "—"}
                      </Typography>
                      {r.barkodas && (
                        <Typography variant="body2">
                          <strong>Barkodas:</strong> {r.barkodas}
                        </Typography>
                      )}
                      <Typography variant="body2">
                        <strong>Tipas:</strong> {tipasLabel(r.tipas)}
                      </Typography>
                    </Stack>
                  </Box>
                </Grid2>
              </Grid2>
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}


export default function NustatymaiPage() {
  const [user, setUser] = useState(null);
  const [program, setProgram] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [rivileSaved, setRivileSaved] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [companyNameTouched, setCompanyNameTouched] = useState(false);
  const [companyCode, setCompanyCode] = useState("");
  const [vatCode, setVatCode] = useState("");
  const [companyIban, setCompanyIban] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyCountryIso, setCompanyCountryIso] = useState("LT");
  const [savingCompany, setSavingCompany] = useState(false);
  const [successCompany, setSuccessCompany] = useState(false);
  const [companyError, setCompanyError] = useState("");
  const [dinetaSettings, setDinetaSettings] = useState({
    server: "",
    client: "",
    username: "",
    password: "",
  });
  const [dinetaLoading, setDinetaLoading] = useState(false);
  const [dinetaSaving, setDinetaSaving] = useState(false);
  const [dinetaSuccess, setDinetaSuccess] = useState(false);
  const [dinetaError, setDinetaError] = useState("");

  // --- Optimum ---
  const [optimumSettings, setOptimumSettings] = useState({ key: "" });
  const [optimumSaving, setOptimumSaving] = useState(false);
  const [optimumSuccess, setOptimumSuccess] = useState(false);
  const [optimumError, setOptimumError] = useState("");

  // meta iš backend (key niekada nelaikom)
  const [optimumMeta, setOptimumMeta] = useState({
    verified_at: null,
    last_ok: null,
    last_error_at: null,
    last_error: "",
  });

  // ---- DokSkenas mobile keys ----
  const [mobileKeys, setMobileKeys] = useState([]); // sąrašas visų kvietimų / raktų

  const [mobileInviteForm, setMobileInviteForm] = useState({
    email: "",
    label: "",
  });

  const [mobileInviteLoading, setMobileInviteLoading] = useState(false);
  const [mobileInviteSuccess, setMobileInviteSuccess] = useState(false);
  const [mobileInviteError, setMobileInviteError] = useState("");

  const formatMobileKeyMasked = (keyLast4) => {
    if (!keyLast4) return "—";
    // 8 звёздочек + последние 4 символа
    return "********" + String(keyLast4).slice(-4);
  };

  const [importTab, setImportTab] = useState(0);

  const [sumiskaiRole, setSumiskaiRole] = useState("buyer");

  const [editingIndex, setEditingIndex] = useState(null);

  // поля įmonės (очищаются при смене роли)
  const [sumiskaiCompany, setSumiskaiCompany] = useState({
    imones_pavadinimas: "",
    imones_kodas: "",
    imones_pvm_kodas: "",
  });

  // поля "Taikyti reikšmes" (остаются при смене роли)
  const [sumiskaiApply, setSumiskaiApply] = useState({
    pavadinimas: "",
    kodas: "",
    barkodas: "",
    tipas: "Prekė",
    kodas_kaip: "",
  });

  const [lineitemRules, setLineitemRules] = useState([]);
  const [ruleForm, setRuleForm] = useState({
    id: null,
    enabled: true,
    vat_op: "=",
    vat_value: null,
    name_contains: null,
    buyer_id: null,
    buyer_vat_code: null,
    seller_id: null,
    seller_vat_code: null,
    apply_to_all: false,
    result_kodas: "",
    result_tipas: "Prekė",
    result_kodas_kaip: "",
    result_pavadinimas: "",
    result_barkodas: "",
  });
  const [savingRules, setSavingRules] = useState(false);
  const [rulesError, setRulesError] = useState("");
  const [rulesSuccess, setRulesSuccess] = useState(false);

  const [purchaseList, setPurchaseList] = useState([]);
  const [salesList, setSalesList] = useState([]);

  const [savingDefaults, setSavingDefaults] = useState(false);
  const [successDefaults, setSuccessDefaults] = useState(false);
  const [errorDefaults, setErrorDefaults] = useState("");

  const [viewMode, setViewMode] = useState("single");
  const [savingViewMode, setSavingViewMode] = useState(false);

  const [extraSettings, setExtraSettings] = useState({});

  const [rivileErpFields, setRivileErpFields] = useState({
    pirkimas_zurnalo_kodas: "",
    pirkimas_padalinio_kodas: "",
    pirkimas_objekto_kodas: "",
    pardavimas_zurnalo_kodas: "",
    pardavimas_padalinio_kodas: "",
    pardavimas_objekto_kodas: "",
  });

  const [savingRivileErp, setSavingRivileErp] = useState(false);
  const [successRivileErp, setSuccessRivileErp] = useState(false);
  const [errorRivileErp, setErrorRivileErp] = useState("");

  const [rivileGamaFields, setRivileGamaFields] = useState({
    pirkimas_padalinys: "",
    pirkimas_objektas: "",
    pirkimas_serija: "",
    pirkimas_centras: "",
    pirkimas_atskaitingas_asmuo: "",
    pirkimas_logistika: "",
    pirkimas_pinigu_saskaitos_kodas: "",
    pirkimas_saskaitos_rysio_kodas: "",
    pirkimas_prekes_grupe: "",
    pirkimas_paslaugos_grupe: "",
    pirkimas_kodo_grupe: "",
    pardavimas_padalinys: "",
    pardavimas_objektas: "",
    pardavimas_serija: "",
    pardavimas_centras: "",
    pardavimas_atskaitingas_asmuo: "",
    pardavimas_logistika: "",
    pardavimas_pinigu_saskaitos_kodas: "",
    pardavimas_saskaitos_rysio_kodas: "",
    pardavimas_prekes_grupe: "",
    pardavimas_paslaugos_grupe: "",
    pardavimas_kodo_grupe: "",
  });

  const [savingRivileGama, setSavingRivileGama] = useState(false);
  const [successRivileGama, setSuccessRivileGama] = useState(false);
  const [errorRivileGama, setErrorRivileGama] = useState("");

  // --- Butent ---
  const [butentFields, setButentFields] = useState({
    pirkimas_sandelis: "",
    pirkimas_operacija: "",
    pardavimas_sandelis: "",
    pardavimas_operacija: "",
  });
  const [savingButent, setSavingButent] = useState(false);
  const [successButent, setSuccessButent] = useState(false);
  const [errorButent, setErrorButent] = useState("");

  // --- Finvalda ---
  const [finvaldaFields, setFinvaldaFields] = useState({
    pirkimas_sandelis: "",
    pirkimas_tipas: "",
    pirkimas_zurnalas: "",
    pirkimas_padalinys: "",
    pirkimas_darbuotojas: "",
    pardavimas_sandelis: "",
    pardavimas_tipas: "",
    pardavimas_zurnalas: "",
    pardavimas_padalinys: "",
    pardavimas_darbuotojas: "",
  });
  const [savingFinvalda, setSavingFinvalda] = useState(false);
  const [successFinvalda, setSuccessFinvalda] = useState(false);
  const [errorFinvalda, setErrorFinvalda] = useState("");

  // --- Centas ---
  const [centasFields, setCentasFields] = useState({
    pirkimas_sandelis: "",
    pirkimas_kastu_centras: "",
    pardavimas_sandelis: "",
    pardavimas_kastu_centras: "",
  });
  const [savingCentas, setSavingCentas] = useState(false);
  const [successCentas, setSuccessCentas] = useState(false);
  const [errorCentas, setErrorCentas] = useState("");


  // --- Pragma 3 ---
  const [pragma3Fields, setPragma3Fields] = useState({
    pirkimas_sandelis: "",
    pirkimas_korespondencija: "",
    pirkimas_projektas: "",
    pardavimas_sandelis: "",
    pardavimas_korespondencija: "",
    pardavimas_projektas: "",
  });
  const [savingPragma3, setSavingPragma3] = useState(false);
  const [successPragma3, setSuccessPragma3] = useState(false);
  const [errorPragma3, setErrorPragma3] = useState("");

  // --- Site.pro ---
  const [siteProFields, setSiteProFields] = useState({
    pirkimas_prekes_grupe: "",
    pirkimas_sandelis: "",
    pirkimas_darbuotojas: "",
    pirkimas_kastu_centras: "",
    pardavimas_prekes_grupe: "",
    pardavimas_sandelis: "",
    pardavimas_darbuotojas: "",
    pardavimas_kastu_centras: "",
  });
  const [savingSitePro, setSavingSitePro] = useState(false);
  const [successSitePro, setSuccessSitePro] = useState(false);
  const [errorSitePro, setErrorSitePro] = useState("");

  // --- Debetas ---
  const [debetasFields, setDebetasFields] = useState({
    pirkimas_filialas: "",
    pirkimas_padalinys: "",
    pirkimas_objektas: "",
    pirkimas_materialiai_atsakingas_asmuo: "",
    pirkimas_atskaitingas_asmuo: "",
    pardavimas_filialas: "",
    pardavimas_padalinys: "",
    pardavimas_objektas: "",
    pardavimas_materialiai_atsakingas_asmuo: "",
    pardavimas_atskaitingas_asmuo: "",
  });
  const [savingDebetas, setSavingDebetas] = useState(false);
  const [successDebetas, setSuccessDebetas] = useState(false);
  const [errorDebetas, setErrorDebetas] = useState("");

  // --- Agnum ---
  const [agnumFields, setAgnumFields] = useState({
    pirkimas_sandelis: "",
    pirkimas_grupe: "",
    pirkimas_objektas: "",
    pardavimas_sandelis: "",
    pardavimas_grupe: "",
    pardavimas_objektas: "",
  });
  const [savingAgnum, setSavingAgnum] = useState(false);
  const [successAgnum, setSuccessAgnum] = useState(false);
  const [errorAgnum, setErrorAgnum] = useState("");

  const [touchedDefaults, setTouchedDefaults] = useState(false);

  const [copiedPvm, setCopiedPvm] = useState(false);
  const handleCopyPvm = async () => {
    try {
      await navigator.clipboard.writeText(PVM_COPY_TEXT);
      setCopiedPvm(true);
      setTimeout(() => setCopiedPvm(false), 2000);
    } catch {
      alert("Nepavyko nukopijuoti į iškarpinę.");
    }
  };

  const [prekesAssemblyPirkimas, setPrekesAssemblyPirkimas] = useState(1);
  const [prekesAssemblyPardavimas, setPrekesAssemblyPardavimas] = useState(1);
  const [paslaugosAssemblyPirkimas, setPaslaugosAssemblyPirkimas] = useState(1);
  const [paslaugosAssemblyPardavimas, setPaslaugosAssemblyPardavimas] = useState(1);

  const [savingPrekesAssembly, setSavingPrekesAssembly] = useState(false);
  const [successPrekesAssembly, setSuccessPrekesAssembly] = useState(false);

  const tipasToNum = (t, kodasKaip) => {
    const v = (t || "").toString().trim().toLowerCase();
    if (v === "paslauga") return 2;
    if (v === "kodas") {
      const kk = (kodasKaip || "").toString().trim().toLowerCase();
      if (kk.startsWith("paslaug")) return 4;
      return 3;
    }
    return 1;
  };

  useEffect(() => {
    api.get("/profile/", { withCredentials: true }).then(({ data }) => {
      setUser(data);
      setProgram(data.default_accounting_program || "");

      setCompanyName(data.company_name || "");
      setCompanyCode(data.company_code || "");
      setVatCode(data.vat_code || "");
      setCompanyIban(data.company_iban || "");
      setCompanyAddress(data.company_address || "");
      setCompanyCountryIso(data.company_country_iso || "LT");

      const ref = data.rivile_erp_extra_fields || {};
      setRivileErpFields({
        pirkimas_zurnalo_kodas: ref.pirkimas_zurnalo_kodas || "",
        pirkimas_padalinio_kodas: ref.pirkimas_padalinio_kodas || "",
        pirkimas_objekto_kodas: ref.pirkimas_objekto_kodas || "",
        pardavimas_zurnalo_kodas: ref.pardavimas_zurnalo_kodas || "",
        pardavimas_padalinio_kodas: ref.pardavimas_padalinio_kodas || "",
        pardavimas_objekto_kodas: ref.pardavimas_objekto_kodas || "",
      });

      const gama = data.rivile_gama_extra_fields || {};
      setRivileGamaFields({
        pirkimas_padalinys: gama.pirkimas_padalinys || "",
        pirkimas_objektas: gama.pirkimas_objektas || "",
        pirkimas_serija: gama.pirkimas_serija || "",
        pirkimas_centras: gama.pirkimas_centras || "",
        pirkimas_atskaitingas_asmuo: gama.pirkimas_atskaitingas_asmuo || "",
        pirkimas_logistika: gama.pirkimas_logistika || "",
        pirkimas_pinigu_saskaitos_kodas: gama.pirkimas_pinigu_saskaitos_kodas || "",
        pirkimas_saskaitos_rysio_kodas: gama.pirkimas_saskaitos_rysio_kodas || "",
        pirkimas_prekes_grupe: gama.pirkimas_prekes_grupe || "",
        pirkimas_paslaugos_grupe: gama.pirkimas_paslaugos_grupe || "",
        pirkimas_kodo_grupe: gama.pirkimas_kodo_grupe || "",
        pardavimas_padalinys: gama.pardavimas_padalinys || "",
        pardavimas_objektas: gama.pardavimas_objektas || "",
        pardavimas_serija: gama.pardavimas_serija || "",
        pardavimas_centras: gama.pardavimas_centras || "",
        pardavimas_atskaitingas_asmuo: gama.pardavimas_atskaitingas_asmuo || "",
        pardavimas_logistika: gama.pardavimas_logistika || "",
        pardavimas_pinigu_saskaitos_kodas: gama.pardavimas_pinigu_saskaitos_kodas || "",
        pardavimas_saskaitos_rysio_kodas: gama.pardavimas_saskaitos_rysio_kodas || "",
        pardavimas_prekes_grupe: gama.pardavimas_prekes_grupe || "",
        pardavimas_paslaugos_grupe: gama.pardavimas_paslaugos_grupe || "",
        pardavimas_kodo_grupe: gama.pardavimas_kodo_grupe || "",
      });

      setPrekesAssemblyPirkimas(
        gama.prekes_assembly_pirkimas != null
          ? Number(gama.prekes_assembly_pirkimas)
          : 1
      );

      setPrekesAssemblyPardavimas(
        gama.prekes_assembly_pardavimas != null
          ? Number(gama.prekes_assembly_pardavimas)
          : 1
      );

      // ДОБАВИТЬ ЗАГРУЗКУ PASLAUGOS:
      setPaslaugosAssemblyPirkimas(
        gama.paslaugos_assembly_pirkimas != null
          ? Number(gama.paslaugos_assembly_pirkimas)
          : 1
      );

      setPaslaugosAssemblyPardavimas(
        gama.paslaugos_assembly_pardavimas != null
          ? Number(gama.paslaugos_assembly_pardavimas)
          : 1
      );

      const butent = data.butent_extra_fields || {};
      setButentFields({
        pirkimas_sandelis: butent.pirkimas_sandelis || "",
        pirkimas_operacija: butent.pirkimas_operacija || "",
        pardavimas_sandelis: butent.pardavimas_sandelis || "",
        pardavimas_operacija: butent.pardavimas_operacija || "",
      });

      const fin = data.finvalda_extra_fields || {};
      setFinvaldaFields({
        pirkimas_sandelis: fin.pirkimas_sandelis || "",
        pirkimas_tipas: fin.pirkimas_tipas || "",
        pirkimas_zurnalas: fin.pirkimas_zurnalas || "",
        pirkimas_padalinys: fin.pirkimas_padalinys || "",
        pirkimas_darbuotojas: fin.pirkimas_darbuotojas || "",
        pardavimas_sandelis: fin.pardavimas_sandelis || "",
        pardavimas_tipas: fin.pardavimas_tipas || "",
        pardavimas_zurnalas: fin.pardavimas_zurnalas || "",
        pardavimas_padalinys: fin.pardavimas_padalinys || "",
        pardavimas_darbuotojas: fin.pardavimas_darbuotojas || "",
      });

      const cent = data.centas_extra_fields || {};
      setCentasFields({
        pirkimas_sandelis: cent.pirkimas_sandelis || "",
        pirkimas_kastu_centras: cent.pirkimas_kastu_centras || "",
        pardavimas_sandelis: cent.pardavimas_sandelis || "",
        pardavimas_kastu_centras: cent.pardavimas_kastu_centras || "",
      });

      const debetas = data.debetas_extra_fields || {};
      setDebetasFields({
        pirkimas_filialas: debetas.pirkimas_filialas || "",
        pirkimas_padalinys: debetas.pirkimas_padalinys || "",
        pirkimas_objektas: debetas.pirkimas_objektas || "",
        pirkimas_materialiai_atsakingas_asmuo: debetas.pirkimas_materialiai_atsakingas_asmuo || "",
        pirkimas_atskaitingas_asmuo: debetas.pirkimas_atskaitingas_asmuo || "",
        pardavimas_filialas: debetas.pardavimas_filialas || "",
        pardavimas_padalinys: debetas.pardavimas_padalinys || "",
        pardavimas_objektas: debetas.pardavimas_objektas || "",
        pardavimas_materialiai_atsakingas_asmuo: debetas.pardavimas_materialiai_atsakingas_asmuo || "",
        pardavimas_atskaitingas_asmuo: debetas.pardavimas_atskaitingas_asmuo || "",
      });

      const pragma3 = data.pragma3_extra_fields || {};
      setPragma3Fields({
        pirkimas_sandelis: pragma3.pirkimas_sandelis || "",
        pirkimas_korespondencija: pragma3.pirkimas_korespondencija || "",
        pirkimas_projektas: pragma3.pirkimas_projektas || "",
        pardavimas_sandelis: pragma3.pardavimas_sandelis || "",
        pardavimas_korespondencija: pragma3.pardavimas_korespondencija || "",
        pardavimas_projektas: pragma3.pardavimas_projektas || "",
      });

      const sitePro = data.site_pro_extra_fields || {};
      setSiteProFields({
        pirkimas_prekes_grupe: sitePro.pirkimas_prekes_grupe || "",
        pirkimas_sandelis: sitePro.pirkimas_sandelis || "",
        pirkimas_darbuotojas: sitePro.pirkimas_darbuotojas || "",
        pirkimas_kastu_centras: sitePro.pirkimas_kastu_centras || "",
        pardavimas_prekes_grupe: sitePro.pardavimas_prekes_grupe || "",
        pardavimas_sandelis: sitePro.pardavimas_sandelis || "",
        pardavimas_darbuotojas: sitePro.pardavimas_darbuotojas || "",
        pardavimas_kastu_centras: sitePro.pardavimas_kastu_centras || "",
      });

      const agn = data.agnum_extra_fields || {};
      setAgnumFields({
        pirkimas_sandelis: agn.pirkimas_sandelis || "",
        pirkimas_grupe: agn.pirkimas_grupe || "",
        pirkimas_objektas: agn.pirkimas_objektas || "",
        pardavimas_sandelis: agn.pardavimas_sandelis || "",
        pardavimas_grupe: agn.pardavimas_grupe || "",
        pardavimas_objektas: agn.pardavimas_objektas || "",
      });

      const pdList = Array.isArray(data.purchase_defaults)
        ? data.purchase_defaults
        : data.purchase_defaults
        ? [data.purchase_defaults]
        : [];
      const sdList = Array.isArray(data.sales_defaults)
        ? data.sales_defaults
        : data.sales_defaults
        ? [data.sales_defaults]
        : [];
      setPurchaseList(pdList);
      setSalesList(sdList);

      setViewMode(data.view_mode || "single");
      setExtraSettings(data.extra_settings || {});

      const lrList = Array.isArray(data.lineitem_rules)
        ? data.lineitem_rules
        : data.lineitem_rules
        ? [data.lineitem_rules]
        : [];
      setLineitemRules(lrList);
    });
  }, []);

  const loadMobileKeys = useCallback(async () => {
    try {
      const { data } = await api.get("/mobile/keys/", {
        withCredentials: true,
      });

      // ожидаем, что backend вернёт массив объектов:
      // [{ id, email, label, link, is_active, created_at, ... }, ...]
      setMobileKeys(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load mobile keys", e);
    }
  }, []);

  useEffect(() => {
    loadMobileKeys();
  }, [loadMobileKeys]);



  useEffect(() => {
    if (program !== "dineta") return;

    setDinetaLoading(true);
    setDinetaError("");
    api
      .get("/settings/dineta/", { withCredentials: true })
      .then(({ data }) => {
        // сервер пароль не возвращает — поле оставляем пустым
        setDinetaSettings((prev) => ({
          ...prev,
          server:  data?.server  || "",
          client:  data?.client  || "",
          username:data?.username|| "",
          password: "", // всегда пустое для безопасности
        }));
      })
      .catch((err) => {
        console.error("Failed to load Dineta settings:", err);
        // при желании можно показать ошибку
      })
      .finally(() => setDinetaLoading(false));
  }, [program]);


  useEffect(() => {
    setRuleForm(prev => {
      if (program !== "rivile" && prev.result_tipas === "Kodas") {
        return { ...prev, result_tipas: "Prekė", result_kodas_kaip: "" };
      }
      return prev;
    });
  }, [program]);

  const handleChange = async (e) => {
    const newProgram = e.target.value;
    setProgram(newProgram);
    setSaving(true);
    try {
      await api.patch("/profile/", { default_accounting_program: newProgram }, { withCredentials: true });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      console.error("Failed to save program:", err);
    } finally {
      setSaving(false);
    }
  };

  const saveCompanyDetails = async () => {
    setSavingCompany(true);
    setCompanyError("");

    setCompanyNameTouched(true);
    const missingName    = !companyName || !companyName.trim();
    const missingCode    = !companyCode || !companyCode.trim();
    const missingCountry = !companyCountryIso;

    if (missingName || missingCode || missingCountry) {
      setCompanyError("Įmonės pavadinimas, Įmonės kodas ir Įmonės šalis yra privalomi.");
      setSavingCompany(false);
      return;
    }

    try {
      await api.patch(
        "/profile/",
        {
          company_name: companyName,
          company_code: companyCode,
          vat_code: vatCode,
          company_iban: companyIban,
          company_address: companyAddress,
          company_country_iso: companyCountryIso,
        },
        { withCredentials: true }
      );
      setSuccessCompany(true);
      setTimeout(() => setSuccessCompany(false), 2000);
    } finally {
      setSavingCompany(false);
    }
  };

  const mergeProfileIntoList = (list, item) => {
    const norm = (s) => (s || "").toString().trim().toUpperCase();
    const key = (x) => [norm(x.imones_kodas), norm(x.imones_pvm_kodas), norm(x.imones_pavadinimas)].join("|");
    const k = key(item);
    const idx = list.findIndex((x) => key(x) === k && k !== "||");
    if (idx >= 0) {
      const next = [...list];
      next[idx] = { ...next[idx], ...item };
      return next;
    }
    return [...list, item];
  };

  const saveDefaults = async () => {
    setSavingDefaults(true);
    setErrorDefaults("");
    setTouchedDefaults(true);

    try {
      // Валидация: в sumiškai обязателен только įmonės kodas + kodas + tipas
      if (!sumiskaiCompany.imones_kodas?.trim() || !sumiskaiApply.kodas?.trim() || !sumiskaiApply.tipas) {
        setErrorDefaults("Įmonės kodas, Kodas ir Tipas yra privalomi.");
        setSavingDefaults(false);
        return;
      }

      // Rivilė + Kodas -> kodas_kaip обязателен
      if ((sumiskaiApply.tipas || "").toLowerCase() === "kodas" && program === "rivile" && !sumiskaiApply.kodas_kaip) {
        setErrorDefaults("Pasirinkus Kodas, būtina nurodyti Nustatyti PVM klasifikatorių kaip.");
        setSavingDefaults(false);
        return;
      }

      const payloadItem = {
        imones_pavadinimas: sumiskaiCompany.imones_pavadinimas || "",
        imones_kodas:       sumiskaiCompany.imones_kodas || "",
        imones_pvm_kodas:   sumiskaiCompany.imones_pvm_kodas || "",
        pavadinimas:        (sumiskaiApply.pavadinimas || "").trim(),
        kodas:              (sumiskaiApply.kodas || "").trim(),
        barkodas:           sumiskaiApply.barkodas || "",
        tipas:              tipasToNum(sumiskaiApply.tipas, sumiskaiApply.kodas_kaip),
      };

      const payload =
        sumiskaiRole === "buyer"
          ? { purchase_defaults: [payloadItem] }
          : { sales_defaults: [payloadItem] };

      await api.patch("/profile/", payload, { withCredentials: true });

      if (sumiskaiRole === "buyer") {
        const next =
          editingIndex !== null
            ? purchaseList.map((x, i) => (i === editingIndex ? payloadItem : x))
            : mergeProfileIntoList(purchaseList, payloadItem);

        await api.patch(
          "/profile/",
          { purchase_defaults: next },
          { withCredentials: true }
        );
        setPurchaseList(next);
      } else {
        const next =
          editingIndex !== null
            ? salesList.map((x, i) => (i === editingIndex ? payloadItem : x))
            : mergeProfileIntoList(salesList, payloadItem);

        await api.patch(
          "/profile/",
          { sales_defaults: next },
          { withCredentials: true }
        );
        setSalesList(next);
      }

      setSumiskaiCompany({
        imones_pavadinimas: "",
        imones_kodas: "",
        imones_pvm_kodas: "",
      });

      setSumiskaiApply({
        pavadinimas: "",
        kodas: "",
        barkodas: "",
        tipas: "Prekė",
        kodas_kaip: "",
      });

      setEditingIndex(null);

      setTouchedDefaults(false);
      setErrorDefaults("");
      setSuccessDefaults(true);
      setTimeout(() => setSuccessDefaults(false), 2000);
    } catch (e) {
      setErrorDefaults(e?.response?.data?.detail || "Nepavyko išsaugoti numatytųjų reikšmių.");
    } finally {
      setSavingDefaults(false);
    }
  };


  const saveDinetaSettings = async () => {
    setDinetaSaving(true);
    setDinetaError("");
    setDinetaSuccess(false);

    const { server, client, username, password } = dinetaSettings;

    if (!server.trim() || !client.trim() || !username.trim() || !password.trim()) {
      setDinetaError("Visi API laukai yra privalomi.");
      setDinetaSaving(false);
      return;
    }

    try {
      await api.put(
        "/settings/dineta/",
        { server, client, username, password },
        { withCredentials: true }
      );

      // пароль в стейте чистим, чтобы его не хранить в явном виде
      setDinetaSettings((prev) => ({ ...prev, password: "" }));

      setDinetaSuccess(true);
      setTimeout(() => setDinetaSuccess(false), 2000);
    } catch (e) {
      const data = e?.response?.data;
      let msg =
        data?.detail ||
        data?.non_field_errors ||
        data?.error ||
        "Nepavyko išsaugoti Dineta nustatymų.";
      if (typeof msg === "object") {
        try {
          msg = JSON.stringify(msg);
        } catch {
          msg = "Nepavyko išsaugoti Dineta nustatymų.";
        }
      }
      setDinetaError(msg);
    } finally {
      setDinetaSaving(false);
    }
  };


  const refreshOptimumMeta = async () => {
    try {
      const { data } = await api.get("/settings/optimum/", { withCredentials: true });
      // data bus be key (serializer to_representation)
      setOptimumMeta({
        verified_at: data?.verified_at ?? null,
        last_ok: data?.last_ok ?? null,
        last_error_at: data?.last_error_at ?? null,
        last_error: data?.last_error ?? "",
      });
    } catch (err) {
      // čia tyčia tyliai — meta nėra kritiška
      console.warn("Failed to refresh optimum meta:", err);
    }
  };

  const saveOptimumSettings = async () => {
    setOptimumSaving(true);
    setOptimumError("");
    setOptimumSuccess(false);

    const key = (optimumSettings.key || "").trim();

    if (!key) {
      setOptimumError("API Key yra privalomas.");
      setOptimumSaving(false);
      return;
    }

    try {
      const { data } = await api.put(
        "/settings/optimum/",
        { key },
        { withCredentials: true }
      );

      // key nepaliekam state
      setOptimumSettings((prev) => ({ ...prev, key: "" }));

      // meta kaip grąžino backend (NE default true)
      setOptimumMeta({
        verified_at: data?.verified_at ?? null,
        last_ok: data?.last_ok ?? null,
        last_error_at: data?.last_error_at ?? null,
        last_error: data?.last_error ?? "",
      });

      // JEI raktas blogas, backend dažnai grąžina 200 su last_ok=false
      if (data?.last_ok === false) {
        setOptimumError(data?.last_error || "Netinkamas API raktas.");
        setOptimumSuccess(false);
        return;
      }

      setOptimumSuccess(true);
      setTimeout(() => setOptimumSuccess(false), 2500);
    } catch (e) {
      const data = e?.response?.data;
      let msg =
        data?.last_error ||
        data?.detail ||
        data?.non_field_errors ||
        data?.error ||
        "Nepavyko patikrinti Optimum API Key.";

      if (typeof msg === "object") {
        try { msg = JSON.stringify(msg); } catch { msg = "Nepavyko patikrinti Optimum API Key."; }
      }

      setOptimumError(String(msg));
      await refreshOptimumMeta();
    } finally {
      setOptimumSaving(false);
    }
  };






  const saveRivileErpFields = async () => {
    setSavingRivileErp(true);
    setErrorRivileErp("");
    setSuccessRivileErp(false);

    try {
      await api.patch(
        "/profile/",
        { rivile_erp_extra_fields: rivileErpFields },
        { withCredentials: true }
      );
      setSuccessRivileErp(true);
      setTimeout(() => setSuccessRivileErp(false), 2000);
    } catch (e) {
      const data = e?.response?.data;
      let msg =
        data?.rivile_erp_extra_fields ||
        data?.detail ||
        "Nepavyko išsaugoti Rivilė ERP nustatymų.";
      if (typeof msg === "object") {
        try {
          msg = JSON.stringify(msg);
        } catch {
          msg = "Nepavyko išsaugoti Rivilė ERP nustatymų.";
        }
      }
      setErrorRivileErp(msg);
    } finally {
      setSavingRivileErp(false);
    }
  };

  const saveRivileGamaFields = async () => {
    setSavingRivileGama(true);
    setErrorRivileGama("");
    setSuccessRivileGama(false);

    try {
      const combinedFields = {
        ...rivileGamaFields,
        prekes_assembly_pirkimas: prekesAssemblyPirkimas,
        prekes_assembly_pardavimas: prekesAssemblyPardavimas,
        paslaugos_assembly_pirkimas: paslaugosAssemblyPirkimas,
        paslaugos_assembly_pardavimas: paslaugosAssemblyPardavimas,
      };

      await api.patch(
        "/profile/",
        { 
          rivile_gama_extra_fields: combinedFields,
        },
        { withCredentials: true }
      );
      
      setSuccessRivileGama(true);
      setTimeout(() => setSuccessRivileGama(false), 2000);
    } catch (e) {
      const data = e?.response?.data;
      let msg =
        data?.rivile_gama_extra_fields ||
        data?.detail ||
        "Nepavyko išsaugoti Rivilė Gama nustatymų.";
      if (typeof msg === "object") {
        try {
          msg = JSON.stringify(msg);
        } catch {
          msg = "Nepavyko išsaugoti Rivilė Gama nustatymų.";
        }
      }
      setErrorRivileGama(msg);
    } finally {
      setSavingRivileGama(false);
    }
  };

  const saveButentFields = async () => {
    setSavingButent(true);
    setErrorButent("");
    setSuccessButent(false);

    try {
      await api.patch(
        "/profile/",
        { butent_extra_fields: butentFields },
        { withCredentials: true }
      );
      setSuccessButent(true);
      setTimeout(() => setSuccessButent(false), 2000);
    } catch (e) {
      const data = e?.response?.data;
      let msg =
        data?.butent_extra_fields ||
        data?.detail ||
        "Nepavyko išsaugoti Butent nustatymų.";
      if (typeof msg === "object") {
        try {
          msg = JSON.stringify(msg);
        } catch {
          msg = "Nepavyko išsaugoti Butent nustatymų.";
        }
      }
      setErrorButent(msg);
    } finally {
      setSavingButent(false);
    }
  };

  const saveFinvaldaFields = async () => {
    setSavingFinvalda(true);
    setErrorFinvalda("");
    setSuccessFinvalda(false);

    try {
      await api.patch(
        "/profile/",
        { finvalda_extra_fields: finvaldaFields },
        { withCredentials: true }
      );
      setSuccessFinvalda(true);
      setTimeout(() => setSuccessFinvalda(false), 2000);
    } catch (e) {
      const data = e?.response?.data;
      let msg =
        data?.finvalda_extra_fields ||
        data?.detail ||
        "Nepavyko išsaugoti Finvalda nustatymų.";
      if (typeof msg === "object") {
        try {
          msg = JSON.stringify(msg);
        } catch {
          msg = "Nepavyko išsaugoti Finvalda nustatymų.";
        }
      }
      setErrorFinvalda(msg);
    } finally {
      setSavingFinvalda(false);
    }
  };

  const saveCentasFields = async () => {
    setSavingCentas(true);
    setErrorCentas("");
    setSuccessCentas(false);

    try {
      await api.patch(
        "/profile/",
        { centas_extra_fields: centasFields },
        { withCredentials: true }
      );
      setSuccessCentas(true);
      setTimeout(() => setSuccessCentas(false), 2000);
    } catch (e) {
      const data = e?.response?.data;
      let msg =
        data?.centas_extra_fields ||
        data?.detail ||
        "Nepavyko išsaugoti Centas nustatymų.";
      if (typeof msg === "object") {
        try {
          msg = JSON.stringify(msg);
        } catch {
          msg = "Nepavyko išsaugoti Centas nustatymų.";
        }
      }
      setErrorCentas(msg);
    } finally {
      setSavingCentas(false);
    }
  };


  const saveDebetasFields = async () => {
      setSavingDebetas(true);
      setErrorDebetas("");
      setSuccessDebetas(false);

      try {
        await api.patch(
          "/profile/",
          { debetas_extra_fields: debetasFields },
          { withCredentials: true }
        );
        setSuccessDebetas(true);
        setTimeout(() => setSuccessDebetas(false), 2000);
      } catch (e) {
        const data = e?.response?.data;
        let msg =
          data?.debetas_extra_fields ||
          data?.detail ||
          "Nepavyko išsaugoti Debetas nustatymų.";
        if (typeof msg === "object") {
          try {
            msg = JSON.stringify(msg);
          } catch {
            msg = "Nepavyko išsaugoti Debetas nustatymų.";
          }
        }
        setErrorDebetas(msg);
      } finally {
        setSavingDebetas(false);
      }
    };


  const savePragma3Fields = async () => {
    setSavingPragma3(true);
    setErrorPragma3("");
    setSuccessPragma3(false);

    try {
      await api.patch(
        "/profile/",
        { pragma3_extra_fields: pragma3Fields },
        { withCredentials: true }
      );
      setSuccessPragma3(true);
      setTimeout(() => setSuccessPragma3(false), 2000);
    } catch (e) {
      const data = e?.response?.data;
      let msg =
        data?.pragma3_extra_fields ||
        data?.detail ||
        "Nepavyko išsaugoti Pragma 3 nustatymų.";
      if (typeof msg === "object") {
        try {
          msg = JSON.stringify(msg);
        } catch {
          msg = "Nepavyko išsaugoti Pragma 3 nustatymų.";
        }
      }
      setErrorPragma3(msg);
    } finally {
      setSavingPragma3(false);
    }
  };


  const saveSiteProFields = async () => {
    setSavingSitePro(true);
    setErrorSitePro("");
    setSuccessSitePro(false);

    try {
      await api.patch(
        "/profile/",
        { site_pro_extra_fields: siteProFields },
        { withCredentials: true }
      );
      setSuccessSitePro(true);
      setTimeout(() => setSuccessSitePro(false), 2000);
    } catch (e) {
      const data = e?.response?.data;
      let msg =
        data?.site_pro_extra_fields ||
        data?.detail ||
        "Nepavyko išsaugoti Site.pro nustatymų.";
      if (typeof msg === "object") {
        try {
          msg = JSON.stringify(msg);
        } catch {
          msg = "Nepavyko išsaugoti Site.pro nustatymų.";
        }
      }
      setErrorSitePro(msg);
    } finally {
      setSavingSitePro(false);
    }
  };


  const saveAgnumFields = async () => {
    setSavingAgnum(true);
    setErrorAgnum("");
    setSuccessAgnum(false);

    try {
      await api.patch(
        "/profile/",
        { agnum_extra_fields: agnumFields },
        { withCredentials: true }
      );
      setSuccessAgnum(true);
      setTimeout(() => setSuccessAgnum(false), 2000);
    } catch (e) {
      const data = e?.response?.data;
      let msg =
        data?.agnum_extra_fields ||
        data?.detail ||
        "Nepavyko išsaugoti Agnum nustatymų.";
      if (typeof msg === "object") {
        try {
          msg = JSON.stringify(msg);
        } catch {
          msg = "Nepavyko išsaugoti Agnum nustatymų.";
        }
      }
      setErrorAgnum(msg);
    } finally {
      setSavingAgnum(false);
    }
  };



  const deleteProfile = async (mode, index) => {
    try {
      const payload = mode === "pirkimas"
        ? { purchase_defaults: { "__delete_index__": index } }
        : { sales_defaults:    { "__delete_index__": index } };

    await api.patch("/profile/", payload, { withCredentials: true });

      if (mode === "pirkimas") setPurchaseList((prev) => prev.filter((_, i) => i !== index));
      else                     setSalesList((prev) => prev.filter((_, i) => i !== index));
    } catch (e) {
      alert(e?.response?.data?.detail || "Nepavyko ištrinti įrašo.");
    }
  };

  const saveLineitemRule = async () => {
    setSavingRules(true);
    setRulesError("");
    setRulesSuccess(false);

    try {
      if (!ruleForm.result_kodas?.trim()) {
        setRulesError("Prekės kodas yra privalomas.");
        setSavingRules(false);
        return;
      }

      // Проверка: при Rivilė + Kodas нужно выбрать „kaip"
      if (
        program === "rivile" &&
        ruleForm.result_tipas === "Kodas" &&
        !ruleForm.result_kodas_kaip
      ) {
        setRulesError("Pasirinkus Kodas, būtina nurodyti Nustatyti PVM klasifikatorių kaip.");
        setSavingRules(false);
        return;
      }

      // Проверка что хотя бы одна sąlyga выбрана
      const hasAnyCondition =
        ruleForm.apply_to_all ||
        ruleForm.vat_value !== null ||
        ruleForm.name_contains !== null ||
        ruleForm.buyer_id !== null ||
        ruleForm.buyer_vat_code !== null ||
        ruleForm.seller_id !== null ||
        ruleForm.seller_vat_code !== null;

      if (!hasAnyCondition) {
        setRulesError("Pasirinkite bent vieną sąlygą.");
        setSavingRules(false);
        return;
      }

      const nextId =
        ruleForm.id ??
        (lineitemRules.reduce(
          (max, r) => (typeof r.id === "number" && r.id > max ? r.id : max),
          0
        ) + 1);

      const payloadRule = {
        id: nextId,
        enabled: !!ruleForm.enabled,
        apply_to_all: !!ruleForm.apply_to_all,
        vat_percent: ruleForm.apply_to_all
          ? null
          : ruleForm.vat_value !== null
          ? { op: ruleForm.vat_op, value: Number(ruleForm.vat_value) }
          : null,
        name_contains: ruleForm.apply_to_all ? "" : (ruleForm.name_contains || ""),
        buyer_id: ruleForm.apply_to_all ? "" : (ruleForm.buyer_id || ""),
        buyer_vat_code: ruleForm.apply_to_all ? "" : (ruleForm.buyer_vat_code || ""),
        seller_id: ruleForm.apply_to_all ? "" : (ruleForm.seller_id || ""),
        seller_vat_code: ruleForm.apply_to_all ? "" : (ruleForm.seller_vat_code || ""),

        result_kodas: ruleForm.result_kodas.trim(),
        result_tipas: ruleForm.result_tipas || "Prekė",

        // Naujas laukas Rivile atvejui (back-end jo nebreakina, tiesiog ignoruos/naudos vėliau)
        result_kodas_kaip:
          program === "rivile" && ruleForm.result_tipas === "Kodas"
            ? ruleForm.result_kodas_kaip || ""
            : "",

        // Nauji, papildomi laukai (nebūtini)
        result_pavadinimas: ruleForm.result_pavadinimas || "",
        result_barkodas: ruleForm.result_barkodas || "",
      };

      const newList = (() => {
        const idx = lineitemRules.findIndex((r) => r.id === nextId);
        if (idx === -1) return [...lineitemRules, payloadRule];
        const copy = [...lineitemRules];
        copy[idx] = payloadRule;
        return copy;
      })();

      await api.patch(
        "/profile/",
        { lineitem_rules: newList },
        { withCredentials: true }
      );

      setLineitemRules(newList);
      setRuleForm({
        id: null,
        enabled: true,
        vat_op: "=",
        vat_value: null,
        name_contains: null,
        buyer_id: null,
        buyer_vat_code: null,
        seller_id: null,
        seller_vat_code: null,
        apply_to_all: false,
        result_kodas: "",
        result_tipas: "Prekė",
        result_kodas_kaip: "",
        result_pavadinimas: "",
        result_barkodas: "",
      });
      setRulesSuccess(true);
      setTimeout(() => setRulesSuccess(false), 2000);
    } catch (e) {
      const data = e?.response?.data;
      let msg =
        data?.lineitem_rules ||
        data?.detail ||
        "Nepavyko išsaugoti taisyklės.";
      if (typeof msg === "object") {
        try {
          msg = JSON.stringify(msg);
        } catch {
          msg = "Nepavyko išsaugoti taisyklės.";
        }
      }
      setRulesError(msg);
    } finally {
      setSavingRules(false);
    }
  };

  const deleteLineitemRule = async (id) => {
    const newList = lineitemRules.filter((r) => r.id !== id);
    try {
      await api.patch(
        "/profile/",
        { lineitem_rules: newList },
        { withCredentials: true }
      );
      setLineitemRules(newList);
    } catch (e) {
      alert(e?.response?.data?.detail || "Nepavyko ištrinti taisyklės.");
    }
  };

  const toggleViewMode = async (e) => {
    const nextMode = e.target.checked ? "multi" : "single";
    const prevMode = viewMode;
    setViewMode(nextMode);
    setSavingViewMode(true);
    try {
      await api.patch("/view-mode/", { view_mode: nextMode }, { withCredentials: true });
    } catch {
      setViewMode(prevMode);
      alert("Nepavyko pakeisti režimo.");
    } finally {
      setSavingViewMode(false);
    }
  };

  const opDateKey = "operation_date=document_date";
  const isOpDateFromDoc = Boolean(extraSettings && Object.prototype.hasOwnProperty.call(extraSettings, opDateKey));
  const toggleOpDateFromDoc = async (e) => {
    const checked = e.target.checked;
    const next = { ...(extraSettings || {}) };
    if (checked) next[opDateKey] = 1; else if (opDateKey in next) delete next[opDateKey];
    setExtraSettings(next);
    try {
      await api.patch("/profile/", { extra_settings: next }, { withCredentials: true });
    } catch {
      setExtraSettings(extraSettings || {});
      alert("Nepavyko išsaugoti papildomų nustatymų.");
    }
  };

  const handlePrekesAssemblyPirkimasChange = (e) => {
    setPrekesAssemblyPirkimas(Number(e.target.value));
  };

  const handlePrekesAssemblyPardavimasChange = (e) => {
    setPrekesAssemblyPardavimas(Number(e.target.value));
  };

  const handlePaslaugosAssemblyPirkimasChange = (e) => {
    setPaslaugosAssemblyPirkimas(Number(e.target.value));
  };

  const handlePaslaugosAssemblyPardavimasChange = (e) => {
    setPaslaugosAssemblyPardavimas(Number(e.target.value));
  };

  const handleCreateMobileKey = async () => {
    setMobileInviteError("");
    setMobileInviteSuccess(false);

    const email = (mobileInviteForm.email || "").trim();
    const label = (mobileInviteForm.label || "").trim();

    if (!email) {
      setMobileInviteError("El. paštas yra privalomas.");
      return;
    }
    if (!label) {
      setMobileInviteError("Pavadinimas yra privalomas.");
      return;
    }

    setMobileInviteLoading(true);
    try {
      const { data } = await api.post(
        "/mobile/keys/",
        { email, label },
        { withCredentials: true }
      );

      // ожидаем, что backend вернёт созданный объект key
      setMobileKeys((prev) => [data, ...prev]);

      setMobileInviteSuccess(true);
      setMobileInviteForm({ email: "", label: "" });
      setTimeout(() => setMobileInviteSuccess(false), 2500);
    } catch (e) {
      const resp = e?.response?.data;
      let msg =
        resp?.detail ||
        resp?.error ||
        "Nepavyko sukurti ir išsiųsti kvietimo.";

      if (typeof msg === "object") {
        try {
          msg = JSON.stringify(msg);
        } catch {
          msg = "Nepavyko sukurti ir išsiųsti kvietimo.";
        }
      }

      setMobileInviteError(String(msg));
    } finally {
      setMobileInviteLoading(false);
    }
  };

  const handleToggleMobileKey = async (id, isActive) => {
    try {
      const { data } = await api.patch(
        `/mobile/keys/${id}/`,
        { is_active: !isActive },
        { withCredentials: true }
      );

      // или просто вручную обновить is_active, если backend ничего не возвращает
      setMobileKeys((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, ...(data || { is_active: !isActive }) } : item
        )
      );
    } catch (e) {
      console.error("Failed to toggle mobile key", e);
      // можно при желании показать Alert
    }
  };

  const handleDeleteMobileKey = async (id) => {
    if (!window.confirm("Ar tikrai ištrinti šį kvietimą?")) return;

    try {
      await api.delete(`/mobile/keys/${id}/`, { withCredentials: true });
      setMobileKeys((prev) => prev.filter((item) => item.id !== id));
    } catch (e) {
      console.error("Failed to delete mobile key", e);
    }
  };

  const handleSumiskaiRole = (nextRole) => {
    if (nextRole === sumiskaiRole) return;
    setSumiskaiRole(nextRole);

    // очищаем только îmonės-поля
    setSumiskaiCompany({
      imones_pavadinimas: "",
      imones_kodas: "",
      imones_pvm_kodas: "",
    });

    // touched/ошибки тоже лучше сбросить
    setTouchedDefaults(false);
    setErrorDefaults("");
  };

  const handleEditSumiskai = (role, index) => {
    const list = role === "buyer" ? purchaseList : salesList;
    const item = list[index];
    if (!item) return;

    // переключаем роль
    setSumiskaiRole(role);

    // заполняем форму
    setSumiskaiCompany({
      imones_pavadinimas: item.imones_pavadinimas || "",
      imones_kodas: item.imones_kodas || "",
      imones_pvm_kodas: item.imones_pvm_kodas || "",
    });

    setSumiskaiApply({
      pavadinimas: item.pavadinimas || "",
      kodas: item.kodas || "",
      barkodas: item.barkodas || "",
      tipas:
        item.tipas === 2 ? "Paslauga"
        : item.tipas === 3 || item.tipas === 4 ? "Kodas"
        : "Prekė",
      kodas_kaip:
        item.tipas === 4 ? "Paslaugai"
        : item.tipas === 3 ? "Prekei"
        : "",
    });

    setEditingIndex(index);
  };

  const rivileFracKey = "rivile_fraction";
  const rivileFraction = Number(extraSettings?.[rivileFracKey] ?? 1);

  const rivileStripLtKey = "rivile_strip_lt_letters";
  const isRivileStripLt = Boolean(
    extraSettings && Object.prototype.hasOwnProperty.call(extraSettings, rivileStripLtKey)
  );

  const setRivileFraction = async (value) => {
    const prev = extraSettings || {};
    const next = { ...prev };

    if (value === 1) {
      if (rivileFracKey in next) delete next[rivileFracKey];
    } else {
      next[rivileFracKey] = value;
    }

    setExtraSettings(next);
    try {
      await api.patch("/profile/", { extra_settings: next }, { withCredentials: true });
      setRivileSaved(true);
      setTimeout(() => setRivileSaved(false), 1800);
    } catch {
      setExtraSettings(prev);
      alert("Nepavyko išsaugoti frakcijos.");
    }
  };

  const toggleRivileStripLt = async (e) => {
    const checked = e.target.checked;
    const prev = extraSettings || {};
    const next = { ...prev };

    if (checked) {
      next[rivileStripLtKey] = 1;
    } else if (rivileStripLtKey in next) {
      delete next[rivileStripLtKey];
    }

    setExtraSettings(next);
    try {
      await api.patch("/profile/", { extra_settings: next }, { withCredentials: true });
      setRivileSaved(true);
      setTimeout(() => setRivileSaved(false), 1800);
    } catch {
      setExtraSettings(prev);
      alert("Nepavyko išsaugoti nustatymo dėl lietuviškų raidžių.");
    }
  };

  const combinedProfiles = [
    ...purchaseList.map((x) => ({ ...x, __role: "buyer" })),
    ...salesList.map((x) => ({ ...x, __role: "seller" })),
  ];

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 4, maxWidth: 980, mx: "auto" }}>
      <Helmet><title>Nustatymai - DokSkenas</title></Helmet>
      <Typography variant="h4" sx={{ fontWeight: 600 }}>Nustatymai</Typography>

      {/* 1. Company details */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>
          1. Įvesk savo įmonės informaciją
        </Typography>
        <Stack spacing={2} direction="column">
          <TextField
            label="Įmonės pavadinimas"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            onBlur={() => setCompanyNameTouched(true)}
            fullWidth
            required
            error={companyNameTouched && !companyName.trim()}
            helperText={companyNameTouched && !companyName.trim() ? "Privalomas laukas" : ""}
          />
          <TextField
            label="Įmonės kodas"
            value={companyCode}
            onChange={(e) => setCompanyCode(e.target.value)}
            onBlur={() => setCompanyNameTouched(true)}
            fullWidth
            required
            error={companyNameTouched && !companyCode.trim()}
            helperText={companyNameTouched && !companyCode.trim() ? "Privalomas laukas" : ""}
          />
          <TextField label="PVM kodas" value={vatCode} onChange={(e) => setVatCode(e.target.value)} fullWidth />
          <TextField label="Įmonės IBAN" value={companyIban} onChange={(e) => setCompanyIban(e.target.value)} fullWidth />
          <TextField label="Įmonės adresas" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} fullWidth />
          <Autocomplete
            disablePortal
            options={COUNTRY_OPTIONS}
            getOptionLabel={(option) => option.name}
            value={COUNTRY_OPTIONS.find((opt) => opt.code === companyCountryIso) || null}
            onChange={(_, newValue) => setCompanyCountryIso(newValue ? newValue.code : "")}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Įmonės šalis *"
                fullWidth
                required
                error={companyNameTouched && !companyCountryIso}
                helperText={companyNameTouched && !companyCountryIso ? "Privalomas laukas" : ""}
              />
            )}
            isOptionEqualToValue={(option, value) => option.code === value.code}
          />
          <Button
            variant="contained"
            onClick={saveCompanyDetails}
            disabled={savingCompany}
            sx={{ alignSelf: "flex-start", mt: 1 }}
          >
            Išsaugoti
          </Button>
          {companyError && <Alert severity="error">{companyError}</Alert>}
          {successCompany && <Alert severity="success">Išsaugota!</Alert>}
        </Stack>
      </Paper>

      {/* 2. Accounting program + multi switch */}
      <Typography variant="subtitle1" sx={{ mb: 2 }}>
        2. Pasirink savo buhalterinę programą
      </Typography>
      <FormControl fullWidth sx={{ mb: 3 }}>
        <InputLabel id="acc-prog-label">Numatytoji programa</InputLabel>
        <Select 
          labelId="acc-prog-label" 
          value={program} 
          label="Numatytoji programa" 
          onChange={handleChange}
          disabled={saving}
        >
          {ACCOUNTING_PROGRAMS.map((p) => (
            <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
          ))}
        </Select>

        {/* <Box sx={{ mt: 2 }}>
          <FormControlLabel
            control={<Switch checked={viewMode === "multi"} onChange={toggleViewMode} disabled={savingViewMode} />}
            label={
              <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                <span>Kelių įmonių režimas</span>
                <Tooltip
                  title="Pasirinkus šį režimą, galėsite vesti kelių įmonių apskaitą. Matysite visų kontrahentų sąrašą suvestinėje."
                  arrow enterTouchDelay={0} leaveTouchDelay={4000}
                >
                  <HelpOutlineIcon fontSize="small" />
                </Tooltip>
              </Box>
            }
          />
        </Box> */}
      </FormControl>

      {success && <Alert severity="success" sx={{ mb: 2 }}>Išsaugota!</Alert>}

      {program === "apskaita5" && (
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              variant="outlined"
              component="a"
              href="/api/download/apskaita5-adapter/"
            >
              Atsisiųsti Apskaita5 adapterį
            </Button>

            <Button variant="outlined" onClick={handleCopyPvm}>
              Kopijuoti PVM kodus
            </Button>
          </Stack>

          {copiedPvm && (
            <Alert severity="success" sx={{ mt: 1, py: 0.5 }}>
              Nukopijuota į iškarpinę.
            </Alert>
          )}
        </Box>
      )}

      {program === "dineta" && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Dineta API sąsajos nustatymai
            </Typography>
            <Tooltip
              arrow
              enterTouchDelay={0}
              leaveTouchDelay={4000}
              title="Čia suvedami duomenys, naudojami jungiantis prie Dineta API (serveris, klientas ir naudotojas)."
            >
              <HelpOutlineIcon fontSize="small" sx={{ color: "text.secondary" }} />
            </Tooltip>
          </Box>

          <Grid2 container spacing={2}>
            <Grid2 size={{ xs: 12, md: 6 }}>
              <TextField
                label="Serveris (pvz. lt4)"
                value={dinetaSettings.server}
                onChange={(e) =>
                  setDinetaSettings((prev) => ({ ...prev, server: e.target.value }))
                }
                fullWidth
                required
                disabled={dinetaLoading || dinetaSaving}
              />
            </Grid2>
            <Grid2 size={{ xs: 12, md: 6 }}>
              <TextField
                label="Klientas (pvz. demo)"
                value={dinetaSettings.client}
                onChange={(e) =>
                  setDinetaSettings((prev) => ({ ...prev, client: e.target.value }))
                }
                fullWidth
                required
                disabled={dinetaLoading || dinetaSaving}
              />
            </Grid2>

            <Grid2 size={{ xs: 12, md: 6 }}>
              <TextField
                label="API naudotojo vardas"
                value={dinetaSettings.username}
                onChange={(e) =>
                  setDinetaSettings((prev) => ({ ...prev, username: e.target.value }))
                }
                fullWidth
                required
                disabled={dinetaLoading || dinetaSaving}
              />
            </Grid2>
            <Grid2 size={{ xs: 12, md: 6 }}>
              <TextField
                label="API slaptažodis"
                type="password"
                value={dinetaSettings.password}
                onChange={(e) =>
                  setDinetaSettings((prev) => ({ ...prev, password: e.target.value }))
                }
                fullWidth
                required
                disabled={dinetaLoading || dinetaSaving}
                helperText="Saugumo sumetimais slaptažodis nerodomas — įveskite jį iš naujo, kai norite pakeisti."
              />
            </Grid2>
          </Grid2>

          <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 2 }}>
            <Button
              variant="contained"
              onClick={saveDinetaSettings}
              disabled={dinetaSaving || dinetaLoading}
            >
              Išsaugoti API nustatymus
            </Button>
            {dinetaLoading && (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Kraunama...
              </Typography>
            )}
          </Box>

          {dinetaError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {dinetaError}
            </Alert>
          )}
          {dinetaSuccess && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Dineta nustatymai išsaugoti!
            </Alert>
          )}
        </Paper>
      )}

      {program === "optimum" && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Optimum API sąsajos nustatymai
            </Typography>
            <Tooltip
              arrow
              enterTouchDelay={0}
              leaveTouchDelay={4000}
              title="Įveskite Optimum API Key. Jis bus naudojamas autentifikacijai su jūsų Optimum duomenų baze."
            >
              <HelpOutlineIcon fontSize="small" sx={{ color: "text.secondary" }} />
            </Tooltip>
          </Box>

          <Grid2 container spacing={2}>
            <Grid2 size={{ xs: 12, md: 6 }}>
              <TextField
                label="API Key"
                type="password"
                value={optimumSettings.key}
                onChange={(e) => {
                  setOptimumSettings((prev) => ({ ...prev, key: e.target.value }));
                  setOptimumSuccess(false);
                  setOptimumError("");
                }}
                fullWidth
                required
                disabled={optimumSaving}
                helperText="Saugumo sumetimais raktas nerodomas — įveskite jį iš naujo, kai norite pakeisti."
              />
            </Grid2>
          </Grid2>

          <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 2 }}>
            <Button
              variant="contained"
              onClick={saveOptimumSettings}
              disabled={optimumSaving}
            >
              Išsaugoti API nustatymus
            </Button>

            {optimumSaving && (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Tikrinama...
              </Typography>
            )}
          </Box>

          {optimumError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {optimumError}
            </Alert>
          )}
          {optimumSuccess && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Optimum nustatymai išsaugoti!
            </Alert>
          )}

          {/* Meta info (optional, bet labai naudinga) */}
          <Box sx={{ mt: 2 }}>
            {optimumMeta?.last_ok === true && optimumMeta?.verified_at && (
              <Alert severity="info" sx={{ mb: 1 }}>
                Paskutinis patikrinimas: {optimumMeta.verified_at}
              </Alert>
            )}

            {optimumMeta?.last_ok === false &&
              (optimumMeta?.last_error || optimumMeta?.last_error_at) && (
                <Alert severity="warning" sx={{ mb: 1 }}>
                  {optimumMeta?.last_error
                    ? `Klaida: ${optimumMeta.last_error}`
                    : "Klaida tikrinant raktą."}
                  {optimumMeta?.last_error_at ? ` (${optimumMeta.last_error_at})` : ""}
                </Alert>
              )}
          </Box>
        </Paper>
      )}


      <AccountingProgramExtraSettings
        program={program}

        prekesAssemblyPirkimas={prekesAssemblyPirkimas}
        prekesAssemblyPardavimas={prekesAssemblyPardavimas}
        paslaugosAssemblyPirkimas={paslaugosAssemblyPirkimas}
        paslaugosAssemblyPardavimas={paslaugosAssemblyPardavimas}
        savingPrekesAssembly={savingPrekesAssembly}
        successPrekesAssembly={successPrekesAssembly}
        onChangePrekesAssemblyPirkimas={handlePrekesAssemblyPirkimasChange}
        onChangePrekesAssemblyPardavimas={handlePrekesAssemblyPardavimasChange}
        onChangePaslaugosAssemblyPirkimas={handlePaslaugosAssemblyPirkimasChange}
        onChangePaslaugosAssemblyPardavimas={handlePaslaugosAssemblyPardavimasChange}

        // Rivilė ERP
        rivileErpFields={rivileErpFields}
        setRivileErpFields={setRivileErpFields}
        savingRivileErp={savingRivileErp}
        successRivileErp={successRivileErp}
        errorRivileErp={errorRivileErp}
        onSaveRivileErp={saveRivileErpFields}
        // Rivilė Gama
        rivileGamaFields={rivileGamaFields}
        setRivileGamaFields={setRivileGamaFields}
        savingRivileGama={savingRivileGama}
        successRivileGama={successRivileGama}
        errorRivileGama={errorRivileGama}
        onSaveRivileGama={saveRivileGamaFields}
        // Butent
        butentFields={butentFields}
        setButentFields={setButentFields}
        savingButent={savingButent}
        successButent={successButent}
        errorButent={errorButent}
        onSaveButent={saveButentFields}
        // Finvalda
        finvaldaFields={finvaldaFields}
        setFinvaldaFields={setFinvaldaFields}
        savingFinvalda={savingFinvalda}
        successFinvalda={successFinvalda}
        errorFinvalda={errorFinvalda}
        onSaveFinvalda={saveFinvaldaFields}
        // Centas
        centasFields={centasFields}
        setCentasFields={setCentasFields}
        savingCentas={savingCentas}
        successCentas={successCentas}
        errorCentas={errorCentas}
        onSaveCentas={saveCentasFields}
        // Debetas
        debetasFields={debetasFields}
        setDebetasFields={setDebetasFields}
        savingDebetas={savingDebetas}
        successDebetas={successDebetas}
        errorDebetas={errorDebetas}
        onSaveDebetas={saveDebetasFields}
        // Pragma 3
        pragma3Fields={pragma3Fields}
        setPragma3Fields={setPragma3Fields}
        savingPragma3={savingPragma3}
        successPragma3={successPragma3}
        errorPragma3={errorPragma3}
        onSavePragma3={savePragma3Fields}
        // SitePro
        siteProFields={siteProFields}
        setSiteProFields={setSiteProFields}
        savingSitePro={savingSitePro}
        successSitePro={successSitePro}
        errorSitePro={errorSitePro}
        onSaveSitePro={saveSiteProFields}
        // Agnum
        agnumFields={agnumFields}
        setAgnumFields={setAgnumFields}
        savingAgnum={savingAgnum}
        successAgnum={successAgnum}
        errorAgnum={errorAgnum}
        onSaveAgnum={saveAgnumFields}
      />


      {/* 3. Papildomi nustatymai */}
      <Paper sx={{ p: 3, mb: 3, mt: 5 }}>
        <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>Papildomi nustatymai</Typography>
        <FormControlLabel
          control={<Switch checked={isOpDateFromDoc} onChange={toggleOpDateFromDoc} />}
          label="Operacijos datą imti iš sąskaitos datos"
        />

        {program === "rivile" && (
          <Box sx={{ mt: 2 }}>
            {/* <FormControlLabel
              sx={{ mb: 1 }}
              control={
                <Switch
                  checked={isRivileStripLt}
                  onChange={toggleRivileStripLt}
                />
              }
              label={
                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                  <span>Pakeisti lietuviškas raides</span>
                  <Tooltip
                    arrow
                    enterTouchDelay={0}
                    leaveTouchDelay={4000}
                    title="Pakeisime visas lietuviškas raides į angliškas, pvz. š -> s. Naudokite, kai importuodami duomenis matote hieroglifus."
                  >
                    <HelpOutlineIcon fontSize="small" />
                  </Tooltip>
                </Box>
              }
            /> */}

            <Typography
              variant="body1"
              sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
            >
              Matavimo vienetų frakcija
              <Tooltip
                arrow
                enterTouchDelay={0}
                leaveTouchDelay={4000}
                title="Frakcija turi atitikti nustatytai frakcijai matavimo vienetams jūsų Rivilė Gama programoje (Kortelės -> Matavimo vienetai). Kitaip kiekis gali būti apvalinamas."
              >
                <HelpOutlineIcon fontSize="small" sx={{ color: "text.secondary" }} />
              </Tooltip>
            </Typography>

            <FormControl sx={{ mt: 1.5, minWidth: 240 }} size="small">
              <Select
                value={rivileFraction}
                onChange={(e) => setRivileFraction(Number(e.target.value))}
              >
                <MenuItem value={1}>1</MenuItem>
                <MenuItem value={10}>10</MenuItem>
                <MenuItem value={100}>100</MenuItem>
                <MenuItem value={1000}>1000</MenuItem>
              </Select>
            </FormControl>

            {rivileSaved && (
              <Alert severity="success" sx={{ mt: 1, py: 0.5 }}>
                Išsaugota!
              </Alert>
            )}
          </Box>
        )}        
      </Paper>

      {/* 4. Duomenų importas */}
      <Box mb={3}>
        <Typography variant="h4" sx={{ mt: 10, fontWeight: 600 }}>Duomenų importas</Typography>
        <Tabs value={importTab} onChange={(_, v) => setImportTab(v)} sx={{ mb: 2 }}>
          <Tab label="Prekės" /><Tab label="Įmonės" />
        </Tabs>
        {importTab === 0 && (
          <ImportTab label="Importuoti prekes iš Excel" url="/data/import-products/" templateFileName="prekes_sablonas.xlsx" />
        )}
        {importTab === 1 && (
          <ImportTab label="Importuoti įmones iš Excel" url="/data/import-clients/" templateFileName="imones_sablonas.xlsx" />
        )}
      </Box>


      <Box mb={3}>
        <Typography variant="h4" sx={{ mt: 10, fontWeight: 600 }}>Automatizacijos</Typography>
      </Box>

      {/* 5. Defaults for sumiskai (Detaliai-like) */}
      <Paper sx={{ p: 3, mb: 3, backgroundColor: "#d8e2dc" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 500 }}>
            Numatytosios reikšmės (skaitmenizuojant sumiškai)
          </Typography>
          <Tooltip
            title="Skaitmenizuojant SUMIŠKAI, jei bus įvykdyta jūsų nustatyta sąlyga t.y. dokumente suras jūsų nustatyą pirkėją/pardavėją, sistema automatiškai priskirs jūsų nustatytas pajamų/išlaidų reikšmės."
            arrow
            enterTouchDelay={0}
            leaveTouchDelay={4000}
          >
            <HelpOutlineIcon sx={{ fontSize: 20, color: "text.secondary" }} />
          </Tooltip>
        </Box>

        <Box
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            overflow: "hidden",
            mb: 3,
          }}
        >
          {/* Taikymo sąlygos */}
          <Box sx={{ p: 3, backgroundColor: "grey.50" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1,
                  backgroundColor: "primary.main",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                }}
              >
                🔍
              </Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Taikymo sąlygos
              </Typography>
            </Box>

            {/* Два toggles, всегда один активен */}
            <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={sumiskaiRole === "buyer"}
                    onChange={() => handleSumiskaiRole("buyer")}
                  />
                }
                label={<Typography variant="body2" sx={{ fontWeight: 500 }}>Pirkėjas</Typography>}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={sumiskaiRole === "seller"}
                    onChange={() => handleSumiskaiRole("seller")}
                  />
                }
                label={<Typography variant="body2" sx={{ fontWeight: 500 }}>Pardavėjas</Typography>}
              />
            </Stack>

            <Grid2 container spacing={2}>
              <Grid2 size={{ xs: 12, md: 6 }}>
                <TextField
                  size="small"
                  label="Įmonės pavadinimas"
                  value={sumiskaiCompany.imones_pavadinimas}
                  onChange={(e) => setSumiskaiCompany((prev) => ({ ...prev, imones_pavadinimas: e.target.value }))}
                  fullWidth
                  sx={{ backgroundColor: "white" }}
                />
              </Grid2>

              <Grid2 size={{ xs: 12, md: 6 }}>
                <TextField
                  size="small"
                  label="Įmonės kodas"
                  value={sumiskaiCompany.imones_kodas}
                  onChange={(e) => setSumiskaiCompany((prev) => ({ ...prev, imones_kodas: e.target.value }))}
                  fullWidth
                  required
                  error={touchedDefaults && !sumiskaiCompany.imones_kodas?.trim()}
                  helperText={touchedDefaults && !sumiskaiCompany.imones_kodas?.trim() ? "Privalomas laukas" : ""}
                  sx={{ backgroundColor: "white" }}
                />
              </Grid2>

              <Grid2 size={{ xs: 12, md: 6 }}>
                <TextField
                  size="small"
                  label="Įmonės PVM kodas"
                  value={sumiskaiCompany.imones_pvm_kodas}
                  onChange={(e) => setSumiskaiCompany((prev) => ({ ...prev, imones_pvm_kodas: e.target.value }))}
                  fullWidth
                  sx={{ backgroundColor: "white" }}
                />
              </Grid2>
            </Grid2>
          </Box>

          {/* Taikyti reikšmes */}
          <Box sx={{ p: 3, backgroundColor: "white" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1,
                  backgroundColor: "success.main",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                }}
              >
                ✓
              </Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Taikyti reikšmes
              </Typography>
            </Box>

            <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
              <TextField
                label="Kodas"
                size="small"
                value={sumiskaiApply.kodas}
                onChange={(e) => setSumiskaiApply((prev) => ({ ...prev, kodas: e.target.value }))}
                sx={{ width: 220 }}
                required
                error={touchedDefaults && !sumiskaiApply.kodas?.trim()}
                helperText={touchedDefaults && !sumiskaiApply.kodas?.trim() ? "Privalomas laukas" : ""}
              />

              <FormControl size="small" sx={{ width: 220 }} required error={touchedDefaults && !sumiskaiApply.tipas}>
                <InputLabel>Tipas</InputLabel>
                <Select
                  label="Tipas"
                  value={sumiskaiApply.tipas}
                  onChange={(e) =>
                    setSumiskaiApply((prev) => ({
                      ...prev,
                      tipas: e.target.value,
                      ...(e.target.value !== "Kodas" && { kodas_kaip: "" }),
                    }))
                  }
                >
                  <MenuItem value="Prekė">Prekė</MenuItem>
                  <MenuItem value="Paslauga">Paslauga</MenuItem>
                  {program === "rivile" && <MenuItem value="Kodas">Kodas</MenuItem>}
                </Select>
              </FormControl>
            </Stack>

            <Stack direction="row" spacing={2} sx={{ mt: 2, flexWrap: "wrap" }}>
              <TextField
                label="Pavadinimas"
                size="small"
                value={sumiskaiApply.pavadinimas}
                onChange={(e) => setSumiskaiApply((prev) => ({ ...prev, pavadinimas: e.target.value }))}
                sx={{ width: 320 }}
              />
              <TextField
                label="Barkodas"
                size="small"
                value={sumiskaiApply.barkodas}
                onChange={(e) => setSumiskaiApply((prev) => ({ ...prev, barkodas: e.target.value }))}
                sx={{ width: 220 }}
              />
            </Stack>

            {program === "rivile" && sumiskaiApply.tipas === "Kodas" && (
              <FormControl size="small" sx={{ width: 260, mt: 2 }} required>
                <InputLabel>Nustatyti PVM klasifikatorių kaip</InputLabel>
                <Select
                  label="Nustatyti PVM klasifikatorių kaip"
                  value={sumiskaiApply.kodas_kaip || ""}
                  onChange={(e) => setSumiskaiApply((prev) => ({ ...prev, kodas_kaip: e.target.value }))}
                >
                  <MenuItem value="Prekei">Prekei</MenuItem>
                  <MenuItem value="Paslaugai">Paslaugai</MenuItem>
                </Select>
              </FormControl>
            )}

            <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
              <Button
                variant="contained"
                onClick={saveDefaults}
                disabled={savingDefaults}
                size="large"
                sx={{ px: 3 }}
              >
                {editingIndex !== null ? "Atnaujinti taisyklę" : "Išsaugoti taisyklę"}
              </Button>
              <Button
                variant="outlined"
                size="large"
                onClick={() => {
                  setTouchedDefaults(false);
                  setErrorDefaults("");
                  setSumiskaiCompany({ imones_pavadinimas: "", imones_kodas: "", imones_pvm_kodas: "" });
                  setSumiskaiApply({ pavadinimas: "", kodas: "", barkodas: "", tipas: "Prekė", kodas_kaip: "" });
                }}
              >
                Išvalyti
              </Button>
            </Stack>

            {successDefaults && <Alert severity="success" sx={{ mt: 2 }}>Išsaugota!</Alert>}
            {errorDefaults && <Alert severity="error" sx={{ mt: 2 }}>{errorDefaults}</Alert>}
          </Box>
        </Box>

        {/* Saved profiles list (cards) */}
        <Typography variant="h6" sx={{ fontWeight: 400, fontSize: 18, mt: 7, mb: 2 }}>
          Išsaugotos taisyklės
        </Typography>

        <DefaultsCards
          rows={combinedProfiles}
          onDelete={(idx) => {
            const item = combinedProfiles[idx];
            const realIndex = item.__role === "buyer" ? idx : idx - purchaseList.length;
            deleteProfile(item.__role === "buyer" ? "pirkimas" : "pardavimas", realIndex);
          }}
          onEdit={(idx) => {
            const item = combinedProfiles[idx];
            const realIndex = item.__role === "buyer" ? idx : idx - purchaseList.length;
            handleEditSumiskai(item.__role, realIndex);
          }}
        />

      </Paper>


      {/* 6. Automatinės taisyklės detalioms eilutėms */}

      <Paper sx={{ p: 3, mt: 6, backgroundColor: "#e7e2e2" }}>
        {/* Заголовок секции */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 500 }}>
            Numatytosios prekių reikšmės (skaitmenizuojant detaliai)
          </Typography>
          <Tooltip
            title="Skaitmenizuojant DETALIAI, kai taisyklių sąlygos įvykdytos, sistema automatiškai priskiria prekės pavadinimą, kodą, barkodą ir tipą eilutėms."
            arrow
            enterTouchDelay={0}
            leaveTouchDelay={4000}
          >
            <HelpOutlineIcon sx={{ fontSize: 20, color: "text.secondary" }} />
          </Tooltip>
        </Box>

        {/* Forma создания правила */}
        <Box
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            overflow: "hidden",
            mb: 3,
          }}
        >
          {/* Секция условий */}
          <Box sx={{ p: 3, backgroundColor: "grey.50" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1,
                  backgroundColor: "primary.main",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                }}
              >
                🔍
              </Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Taikymo sąlygos
              </Typography>
            </Box>

            <Stack spacing={2.5}>
              {/* PVM проценты */}
              <Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={ruleForm.vat_value !== null}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setRuleForm((prev) => ({ ...prev, vat_value: "" }));
                        } else {
                          setRuleForm((prev) => ({ ...prev, vat_value: null }));
                        }
                      }}
                      disabled={ruleForm.apply_to_all}
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      PVM procentas
                    </Typography>
                  }
                />
                {ruleForm.vat_value !== null && !ruleForm.apply_to_all && (
                  <Stack direction="row" spacing={1.5} sx={{ ml: 5, mt: 1.5 }}>
                    <FormControl size="small" sx={{ minWidth: 90 }}>
                      <Select
                        value={ruleForm.vat_op}
                        onChange={(e) =>
                          setRuleForm((prev) => ({ ...prev, vat_op: e.target.value }))
                        }
                        sx={{ backgroundColor: "white" }}
                      >
                        <MenuItem value="<">&lt;</MenuItem>
                        <MenuItem value="<=">&le;</MenuItem>
                        <MenuItem value="=">=</MenuItem>
                        <MenuItem value=">=">&ge;</MenuItem>
                        <MenuItem value=">">&gt;</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField
                      size="small"
                      value={ruleForm.vat_value}
                      onChange={(e) => {
                        const val = e.target.value;
                        // Разрешаем пустую строку или целые числа от 0 до 100
                        if (val === "") {
                          setRuleForm((prev) => ({ ...prev, vat_value: "" }));
                        } else if (/^\d+$/.test(val)) {
                          const num = parseInt(val, 10);
                          if (num >= 0 && num <= 100) {
                            setRuleForm((prev) => ({ ...prev, vat_value: val }));
                          }
                        }
                      }}
                      sx={{ width: 120, backgroundColor: "white" }}
                      InputProps={{ 
                        endAdornment: <Typography variant="body2" sx={{ color: "text.secondary" }}>%</Typography>,
                      }}
                      placeholder="0-100"
                    />
                  </Stack>
                )}
              </Box>

              {/* Название товара */}
              <Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={ruleForm.name_contains !== null}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setRuleForm((prev) => ({ ...prev, name_contains: "" }));
                        } else {
                          setRuleForm((prev) => ({ ...prev, name_contains: null }));
                        }
                      }}
                      disabled={ruleForm.apply_to_all}
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      Pavadinimas turi frazę
                    </Typography>
                  }
                />
                {ruleForm.name_contains !== null && !ruleForm.apply_to_all && (
                  <TextField
                    size="small"
                    fullWidth
                    value={ruleForm.name_contains}
                    onChange={(e) =>
                      setRuleForm((prev) => ({
                        ...prev,
                        name_contains: e.target.value,
                      }))
                    }
                    sx={{ ml: 5, mt: 1.5, maxWidth: 400, backgroundColor: "white" }}
                    placeholder="pvz.: paslaugos"
                  />
                )}
              </Box>

              {/* Покупатель */}
              <Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={ruleForm.buyer_id !== null || ruleForm.buyer_vat_code !== null}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setRuleForm((prev) => ({
                            ...prev,
                            buyer_id: "",
                            buyer_vat_code: "",
                          }));
                        } else {
                          setRuleForm((prev) => ({
                            ...prev,
                            buyer_id: null,
                            buyer_vat_code: null,
                          }));
                        }
                      }}
                      disabled={ruleForm.apply_to_all}
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      Pirkėjas
                    </Typography>
                  }
                />
                {(ruleForm.buyer_id !== null || ruleForm.buyer_vat_code !== null) && !ruleForm.apply_to_all && (
                  <Stack direction="row" spacing={1.5} sx={{ ml: 5, mt: 1.5 }}>
                    <TextField
                      label="Įmonės kodas"
                      size="small"
                      value={ruleForm.buyer_id || ""}
                      onChange={(e) =>
                        setRuleForm((prev) => ({ ...prev, buyer_id: e.target.value }))
                      }
                      sx={{ width: 200, backgroundColor: "white" }}
                    />
                    <TextField
                      label="PVM kodas"
                      size="small"
                      value={ruleForm.buyer_vat_code || ""}
                      onChange={(e) =>
                        setRuleForm((prev) => ({
                          ...prev,
                          buyer_vat_code: e.target.value,
                        }))
                      }
                      sx={{ width: 200, backgroundColor: "white" }}
                    />
                  </Stack>
                )}
              </Box>

              {/* Продавец */}
              <Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={ruleForm.seller_id !== null || ruleForm.seller_vat_code !== null}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setRuleForm((prev) => ({
                            ...prev,
                            seller_id: "",
                            seller_vat_code: "",
                          }));
                        } else {
                          setRuleForm((prev) => ({
                            ...prev,
                            seller_id: null,
                            seller_vat_code: null,
                          }));
                        }
                      }}
                      disabled={ruleForm.apply_to_all}
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      Pardavėjas
                    </Typography>
                  }
                />
                {(ruleForm.seller_id !== null || ruleForm.seller_vat_code !== null) && !ruleForm.apply_to_all && (
                  <Stack direction="row" spacing={1.5} sx={{ ml: 5, mt: 1.5 }}>
                    <TextField
                      label="Įmonės kodas"
                      size="small"
                      value={ruleForm.seller_id || ""}
                      onChange={(e) =>
                        setRuleForm((prev) => ({
                          ...prev,
                          seller_id: e.target.value,
                        }))
                      }
                      sx={{ width: 200, backgroundColor: "white" }}
                    />
                    <TextField
                      label="PVM kodas"
                      size="small"
                      value={ruleForm.seller_vat_code || ""}
                      onChange={(e) =>
                        setRuleForm((prev) => ({
                          ...prev,
                          seller_vat_code: e.target.value,
                        }))
                      }
                      sx={{ width: 200, backgroundColor: "white" }}
                    />
                  </Stack>
                )}
              </Box>

              {/* Разделитель */}
              <Box sx={{ borderTop: "1px solid", borderColor: "divider", my: 1 }} />

              {/* Всем остальным строкам */}
              <Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={ruleForm.apply_to_all}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setRuleForm((prev) => ({
                          ...prev,
                          apply_to_all: checked,
                          ...(checked && {
                            vat_value: null,
                            name_contains: null,
                            buyer_id: null,
                            buyer_vat_code: null,
                            seller_id: null,
                            seller_vat_code: null,
                          })
                        }));
                      }}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: "primary.main" }}>
                        Taikyti visoms kitoms eilutėms
                      </Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                        Numatytoji taisyklė, jei kitos netiko
                      </Typography>
                    </Box>
                  }
                />
              </Box>
            </Stack>
          </Box>

          {/* Секция действий */}
          <Box sx={{ p: 3, backgroundColor: "white" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1,
                  backgroundColor: "success.main",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                }}
              >
                ✓
              </Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Taikyti reikšmes
              </Typography>
            </Box>

            <Stack direction="row" spacing={2}>
              <TextField
                label="Prekės kodas"
                size="small"
                value={ruleForm.result_kodas}
                onChange={(e) =>
                  setRuleForm((prev) => ({
                    ...prev,
                    result_kodas: e.target.value,
                  }))
                }
                sx={{ width: 220 }}
                required
                placeholder="Įveskite kodą"
              />

              <FormControl size="small" sx={{ width: 220 }} required>
                <InputLabel>Tipas</InputLabel>
                <Select
                  label="Tipas"
                  value={ruleForm.result_tipas}
                  onChange={(e) =>
                    setRuleForm((prev) => ({
                      ...prev,
                      result_tipas: e.target.value,
                      // jei perjungiam nuo Kodas – išvalom „kaip"
                      ...(e.target.value !== "Kodas" && { result_kodas_kaip: "" }),
                    }))
                  }
                >
                  <MenuItem value="Prekė">Prekė</MenuItem>
                  <MenuItem value="Paslauga">Paslauga</MenuItem>
                  {program === "rivile" && (
                    <MenuItem value="Kodas">Kodas</MenuItem>
                  )}
                </Select>
              </FormControl>
            </Stack>
            <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
              <TextField
                label="Pavadinimas"
                size="small"
                value={ruleForm.result_pavadinimas}
                onChange={(e) =>
                  setRuleForm((prev) => ({
                    ...prev,
                    result_pavadinimas: e.target.value,
                  }))
                }
                sx={{ width: 320 }}
              />

              <TextField
                label="Barkodas"
                size="small"
                value={ruleForm.result_barkodas}
                onChange={(e) =>
                  setRuleForm((prev) => ({
                    ...prev,
                    result_barkodas: e.target.value,
                  }))
                }
                sx={{ width: 220 }}
              />
            </Stack>

            {/* Papildomas dropdown tik Rivilė + Kodas */}
            {program === "rivile" && ruleForm.result_tipas === "Kodas" && (
              <FormControl
                size="small"
                sx={{ width: 260, mt: 2 }}
                required
              >
                <InputLabel>Nustatyti PVM klasifikatorių kaip</InputLabel>
                <Select
                  label="Nustatyti PVM klasifikatorių kaip"
                  value={ruleForm.result_kodas_kaip || ""}
                  onChange={(e) =>
                    setRuleForm((prev) => ({
                      ...prev,
                      result_kodas_kaip: e.target.value,
                    }))
                  }
                >
                  <MenuItem value="Prekei">Prekei</MenuItem>
                  <MenuItem value="Paslaugai">Paslaugai</MenuItem>
                </Select>
              </FormControl>
            )}

            <Box sx={{ mt: 2.5 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={ruleForm.enabled}
                    onChange={(e) =>
                      setRuleForm((prev) => ({
                        ...prev,
                        enabled: e.target.checked,
                      }))
                    }
                  />
                }
                label={
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Taisyklė aktyvi
                  </Typography>
                }
              />
            </Box>

            <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
              <Button
                variant="contained"
                onClick={saveLineitemRule}
                disabled={savingRules}
                size="large"
                sx={{ px: 3 }}
              >
                {ruleForm.id ? "Atnaujinti taisyklę" : "Išsaugoti taisyklę"}
              </Button>
              <Button
                variant="outlined"
                onClick={() =>
                  setRuleForm({
                    id: null,
                    enabled: true,
                    vat_op: "=",
                    vat_value: null,
                    name_contains: null,
                    buyer_id: null,
                    buyer_vat_code: null,
                    seller_id: null,
                    seller_vat_code: null,
                    apply_to_all: false,
                    result_kodas: "",
                    result_tipas: "Prekė",
                    result_kodas_kaip: "",
                    result_pavadinimas: "",
                    result_barkodas: "",
                  })
                }
                size="large"
              >
                Išvalyti
              </Button>
            </Stack>
            {rulesError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {rulesError}
              </Alert>
            )}
            {rulesSuccess && (
              <Alert severity="success" sx={{ mt: 2 }}>
                Išsaugota!
              </Alert>
            )}
          </Box>
        </Box>

        {/* Список сохраненных правил */}
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 7, mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 400, fontSize: 18 }}>
              Išsaugotos taisyklės
            </Typography>
            <Chip 
              label={lineitemRules?.length || 0} 
              size="small" 
              sx={{ fontWeight: 600 }}
            />
          </Box>

          {lineitemRules && lineitemRules.length > 0 ? (
            <Stack spacing={2}>
              {lineitemRules.map((r, idx) => (
                <Box
                  key={r.id || idx}
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                    overflow: "hidden",
                    transition: "all 0.2s",
                    "&:hover": { boxShadow: 2 },
                  }}
                >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        p: 2,
                        backgroundColor: "grey.50",
                        borderBottom: "1px solid",
                        borderColor: "divider",
                      }}
                    >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Chip
                        label={`#${idx + 1}`}
                        size="small"
                        sx={{
                          fontWeight: 600,
                          backgroundColor: r.enabled ? "success.main" : "grey.400",
                          color: "white",
                        }}
                      />
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {r.enabled ? "Aktyvi" : "Išjungta"}
                      </Typography>
                    </Box>

                    <Stack direction="row" spacing={1}>
                      <IconButton
                        size="small"
                        onClick={() =>
                          setRuleForm({
                            id: r.id || null,
                            enabled: r.enabled !== false,
                            vat_op: r.vat_percent?.op || "=",
                            vat_value:
                              r.vat_percent && r.vat_percent.value != null
                                ? String(r.vat_percent.value)
                                : null,
                            name_contains: r.name_contains !== "" ? r.name_contains : null,
                            buyer_id: r.buyer_id !== "" ? r.buyer_id : null,
                            buyer_vat_code: r.buyer_vat_code !== "" ? r.buyer_vat_code : null,
                            seller_id: r.seller_id !== "" ? r.seller_id : null,
                            seller_vat_code: r.seller_vat_code !== "" ? r.seller_vat_code : null,
                            apply_to_all: r.apply_to_all || false,
                            result_kodas: r.result_kodas || "",
                            result_tipas: r.result_tipas || "Prekė",
                            result_kodas_kaip: r.result_kodas_kaip || "",
                            result_pavadinimas: r.result_pavadinimas || "",
                            result_barkodas: r.result_barkodas || "",
                          })
                        }
                        sx={{
                          backgroundColor: "white",
                          "&:hover": { backgroundColor: "grey.100" },
                        }}
                      >
                        <EditIcon fontSize="small" color="primary" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => deleteLineitemRule(r.id)}
                        sx={{
                          backgroundColor: "white",
                          "&:hover": { backgroundColor: "error.50" },
                        }}
                      >
                        <DeleteOutlineIcon fontSize="small" color="error" />
                      </IconButton>
                    </Stack>
                  </Box>

                  <Box sx={{ p: 2, backgroundColor: "white" }}>
                    <Grid2 container spacing={3}>
                      <Grid2 size={{ xs: 12, md: 6 }}>
                        <Typography
                          variant="caption"
                          sx={{
                            color: "text.secondary",
                            textTransform: "uppercase",
                            fontWeight: 600,
                            letterSpacing: 0.5,
                          }}
                        >
                          Sąlygos
                        </Typography>
                        <Box sx={{ mt: 1 }}>
                          {r.apply_to_all ? (
                            <Chip
                              label="Visos kitos eilutės"
                              color="primary"
                              size="small"
                              sx={{ fontWeight: 500 }}
                            />
                          ) : (
                            <Stack spacing={0.5}>
                              {r.vat_percent && (
                                <Typography variant="body2">
                                  • PVM {r.vat_percent.op} {r.vat_percent.value}%
                                </Typography>
                              )}
                              {r.name_contains && (
                                <Typography variant="body2">
                                  • Pavadinimas: "{r.name_contains}"
                                </Typography>
                              )}
                              {(r.buyer_id || r.buyer_vat_code) && (
                                <Typography variant="body2">
                                  • Pirkėjas: {[r.buyer_id, r.buyer_vat_code].filter(Boolean).join(", ")}
                                </Typography>
                              )}
                              {(r.seller_id || r.seller_vat_code) && (
                                <Typography variant="body2">
                                  • Pardavėjas: {[r.seller_id, r.seller_vat_code].filter(Boolean).join(", ")}
                                </Typography>
                              )}
                              {!r.vat_percent &&
                                !r.name_contains &&
                                !r.buyer_id &&
                                !r.buyer_vat_code &&
                                !r.seller_id &&
                                !r.seller_vat_code && (
                                  <Typography variant="body2" color="text.secondary">
                                    • Visos eilutės
                                  </Typography>
                                )}
                            </Stack>
                          )}
                        </Box>
                      </Grid2>

                      <Grid2 size={{ xs: 12, md: 6 }}>
                        <Typography
                          variant="caption"
                          sx={{
                            color: "text.secondary",
                            textTransform: "uppercase",
                            fontWeight: 600,
                            letterSpacing: 0.5,
                          }}
                        >
                          Taikyti
                        </Typography>
                        <Box sx={{ mt: 1 }}>
                          <Stack spacing={0.5}>
                            
                            {r.result_pavadinimas && (
                              <Typography variant="body2">
                                <strong>Pavadinimas:</strong> {r.result_pavadinimas}
                              </Typography>
                            )}

                            <Typography variant="body2">
                              <strong>Kodas:</strong> {r.result_kodas}
                            </Typography>

                            {r.result_barkodas && (
                              <Typography variant="body2">
                                <strong>Barkodas:</strong> {r.result_barkodas}
                              </Typography>
                            )}

                            <Typography variant="body2">
                              <strong>Tipas:</strong>{" "}
                              {r.result_tipas === "Kodas" && r.result_kodas_kaip
                                ? `Kodas (${r.result_kodas_kaip})`
                                : (r.result_tipas || "Prekė")}
                            </Typography>

                          </Stack>
                        </Box>
                      </Grid2>
                    </Grid2>
                  </Box>
                </Box>
              ))}
            </Stack>
          ) : (
            <Box
              sx={{
                textAlign: "center",
                py: 6,
                border: "2px dashed",
                borderColor: "divider",
                borderRadius: 2,
                backgroundColor: "grey.50",
              }}
            >
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Nėra išsaugotų taisyklių
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
                Sukurkite pirmąją taisyklę aukščiau
              </Typography>
            </Box>
          )}
        </Box>
      </Paper>
      <Box mb={3}>
        <Typography variant="h4" sx={{ mt: 10, fontWeight: 600 }}>Pakvietimai</Typography>
      </Box>
      {/* --- DokSkenas mobile app --- */}
      <Paper sx={{ p: 3, mt: 3, mb: 4 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 500 }}>
            Kvietimai naudotis DokSkeno mobiliąja programėle
          </Typography>
        </Box>

        <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
          Čia galite sukurti kvietimą naudotis DokSkeno mobiliąja programėle, per kurią gavėjas galės fotografuoti ir siųsti jums dokumentus. O jūs pasirinktus dokumentus lengvai perkelti į suvestinę skaitmenizuoti.
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 4 }}>
          Gavėjas gaus el. laišką su nuoroda parsisiųsti mobiliąja programėle, kuri jau bus priskirta prie jūsų DokSkeno paskyros.
        </Typography>

        {/* Forma naujam kvietimui */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Naujas kvietimas
          </Typography>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{ mb: 1 }}
          >
            <TextField
              label="El. paštas"
              type="email"
              fullWidth
              size="small"
              value={mobileInviteForm.email}
              onChange={(e) =>
                setMobileInviteForm((prev) => ({ ...prev, email: e.target.value }))
              }
            />
            <TextField
              label="Pavadinimas"
              fullWidth
              size="small"
              value={mobileInviteForm.label}
              onChange={(e) =>
                setMobileInviteForm((prev) => ({ ...prev, label: e.target.value }))
              }
            />
          <Button
            variant="contained"
            onClick={handleCreateMobileKey}
            disabled={mobileInviteLoading}
            sx={{ whiteSpace: "nowrap", px: 3 }} // px = padding-left + padding-right
          >
            Išsiųsti
          </Button>
          </Stack>

          {mobileInviteSuccess && (
            <Alert severity="success" sx={{ mt: 1 }}>
              Kvietimas sėkmingai sukurtas ir išsiųstas.
            </Alert>
          )}

          {mobileInviteError && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {mobileInviteError}
            </Alert>
          )}
        </Box>

        {/* Sąrašas sukurtų kvietimų / raktų */}
        <Box sx={{ mt: 5 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, }}>
            Sukurti raktai
          </Typography>

          {mobileKeys.length === 0 ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Kol kas nėra sukurtų raktų
            </Typography>
          ) : (
            <>
              {/* Desktop / tablet – lentelė */}
              <Box sx={{ display: { xs: "none", md: "block" } }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Pavadinimas</TableCell>
                      <TableCell>El. paštas</TableCell>
                      <TableCell>Raktas</TableCell>
                      <TableCell align="right">Veiksmai</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {mobileKeys.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.label || "—"}</TableCell>
                        <TableCell>{item.email}</TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                            {formatMobileKeyMasked(item.key_last4)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                            <Switch
                              size="small"
                              checked={!!item.is_active}
                              onChange={() =>
                                handleToggleMobileKey(item.id, !!item.is_active)
                              }
                            />
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteMobileKey(item.id)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>

              {/* Mobile – kortelės, kad būtų patogiau naudoti pirštais */}
              <Stack
                spacing={1.5}
                sx={{ mt: 1, display: { xs: "flex", md: "none" } }}
              >
                {mobileKeys.map((item) => (
                  <Box
                    key={item.id}
                    sx={{
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 2,
                      p: 1.5,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 1.5,
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        variant="subtitle2"
                        sx={{
                          fontWeight: 600,
                          mb: 0.25,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 200,
                        }}
                      >
                        {item.label || "—"}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          color: "text.secondary",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 200,
                        }}
                      >
                        {item.email}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          color: "text.secondary",
                          fontFamily: "monospace",
                          display: "block",
                          mt: 0.5,
                        }}
                      >
                        Raktas: {formatMobileKeyMasked(item.key_last4)}
                      </Typography>
                    </Box>

                    <Stack
                      direction="row"
                      spacing={0.5}
                      alignItems="center"
                      sx={{ flexShrink: 0 }}
                    >
                      <Switch
                        size="small"
                        checked={!!item.is_active}
                        onChange={() =>
                          handleToggleMobileKey(item.id, !!item.is_active)
                        }
                      />
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteMobileKey(item.id)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </>
          )}
        </Box>
      </Paper>
    </Box>
  );
}

