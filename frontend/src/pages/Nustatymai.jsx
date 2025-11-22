import React, { useEffect, useState } from "react";
import {
  Box, Typography, FormControl, InputLabel, Select, MenuItem,
  Button, Alert, Tabs, Tab, Paper, TextField, Stack, RadioGroup,
  FormControlLabel, Radio, IconButton, Tooltip, Switch, Table, TableContainer,
  TableHead, TableRow, TableCell, TableBody
} from "@mui/material";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import Autocomplete from "@mui/material/Autocomplete";
import { api } from "../api/endpoints"; // поправь путь jei reikia
import { COUNTRY_OPTIONS } from "../page_elements/Countries";
import { ACCOUNTING_PROGRAMS } from "../page_elements/AccountingPrograms";
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
// const DefaultsFields = React.memo(function DefaultsFields({ mode, state, setState, touched }) {
//   const isPurchase = mode === "pirkimas";

const DefaultsFields = React.memo(function DefaultsFields({ mode, program, state, setState, touched }) {
  const isPurchase = mode === "pirkimas";
  const showKodas = program === "rivile"; // 👈 показываем "Kodas" только для Rivilė

  // если "Kodas" выбран, а программа больше не Rivilė — откат на "Prekė"
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
      {/* Company match fields */}
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

      {/* Product/service defaults */}
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
          {/* <MenuItem value="Kodas">Kodas</MenuItem> */}
          {showKodas && <MenuItem value="Kodas">Kodas</MenuItem>} {/* 👈 условно */}
        </Select>
      </FormControl>

      {/* Появляется только если выбран "Kodas" */}
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

/** ===== Table of saved defaults with delete ===== */
function DefaultsTable({ rows, onDelete }) {
  if (!rows?.length) {
    return (
      <Typography variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
        Nėra išsaugotų profilių.
      </Typography>
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
    <TableContainer sx={{ mt: 2, overflowX: "auto" }}>
      <Table size="small" stickyHeader sx={{ minWidth: 900 }}>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Įmonės pavadinimas</TableCell>
            <TableCell>Įmonės kodas</TableCell>
            <TableCell>PVM kodas</TableCell>
            <TableCell>Pavadinimas</TableCell>
            <TableCell>Kodas</TableCell>
            <TableCell>Barkodas</TableCell>
            <TableCell>Tipas</TableCell>
            <TableCell align="right">Veiksmai</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r, idx) => (
            <TableRow key={idx}>
              <TableCell sx={{ whiteSpace: "nowrap" }}>{idx}</TableCell>
              <TableCell>{r.imones_pavadinimas || "—"}</TableCell>
              <TableCell>{r.imones_kodas || "—"}</TableCell>
              <TableCell>{r.imones_pvm_kodas || "—"}</TableCell>
              <TableCell>{r.pavadinimas || "—"}</TableCell>
              <TableCell>{r.kodas || "—"}</TableCell>
              <TableCell>{r.barkodas || "—"}</TableCell>
              <TableCell>{tipasLabel(r.tipas)}</TableCell>
              <TableCell align="right">
                <IconButton color="error" size="small" onClick={() => onDelete(idx)} aria-label="Ištrinti">
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default function NustatymaiPage() {
  const [user, setUser] = useState(null);
  const [program, setProgram] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [rivileSaved, setRivileSaved] = useState(false);


  // Company details
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

  // Import tabs
  const [importTab, setImportTab] = useState(0);

  // === Defaults state (sumiskai) ===
  const [defaultsMode, setDefaultsMode] = useState("pirkimas"); // 'pirkimas' | 'pardavimas'
  const [purchaseDefaultsForm, setPurchaseDefaultsForm] = useState({
    imones_pavadinimas: "",
    imones_kodas: "",
    imones_pvm_kodas: "",
    pavadinimas: "",
    kodas: "",
    barkodas: "",
    tipas: "Prekė",
    kodas_kaip: "", // "Prekei" | "Paslaugai"
  });
  const [salesDefaultsForm, setSalesDefaultsForm] = useState({
    imones_pavadinimas: "",
    imones_kodas: "",
    imones_pvm_kodas: "",
    pavadinimas: "",
    kodas: "",
    barkodas: "",
    tipas: "Prekė",
    kodas_kaip: "", // "Prekei" | "Paslaugai"
  });

  // Списки профилей (мульти-компания)
  const [purchaseList, setPurchaseList] = useState([]); // array of profiles
  const [salesList, setSalesList] = useState([]);       // array of profiles

  const [savingDefaults, setSavingDefaults] = useState(false);
  const [successDefaults, setSuccessDefaults] = useState(false);
  const [errorDefaults, setErrorDefaults] = useState("");

  // === NEW: Kelių įmonių režimas ===
  const [viewMode, setViewMode] = useState("single"); // "single" | "multi"
  const [savingViewMode, setSavingViewMode] = useState(false);

  // Papildomi nustatymai (флаг-ключи)
  const [extraSettings, setExtraSettings] = useState({}); // dict of flags-keys

  // NEW: валидатор-подсветка для defaults формы
  const [touchedDefaults, setTouchedDefaults] = useState(false);

  // NEW: Copy-to-clipboard success flag + handler
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

  const tipasToNum = (t, kodasKaip) => {
    const v = (t || "").toString().trim().toLowerCase();
    if (v === "paslauga") return 2; // Paslauga
    if (v === "kodas") {
      const kk = (kodasKaip || "").toString().trim().toLowerCase();
      // Kodas + Paslaugai => 4, иначе (Prekei) => 3
      if (kk.startsWith("paslaug")) return 4;
      return 3;
    }
    return 1; // Prekė
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

      // NEW: списки профилей (back-compat: dict -> [dict])
      const pdList = Array.isArray(data.purchase_defaults) ? data.purchase_defaults : (data.purchase_defaults ? [data.purchase_defaults] : []);
      const sdList = Array.isArray(data.sales_defaults) ? data.sales_defaults : (data.sales_defaults ? [data.sales_defaults] : []);
      setPurchaseList(pdList);
      setSalesList(sdList);

      setViewMode(data.view_mode || "single");
      setExtraSettings(data.extra_settings || {});
    });
  }, []);

  // сбрасывать подсветку при смене режима
  useEffect(() => {
    setTouchedDefaults(false);
    setErrorDefaults("");
  }, [defaultsMode]);

  const handleChange = (e) => setProgram(e.target.value);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch("/profile/", { default_accounting_program: program }, { withCredentials: true });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const saveCompanyDetails = async () => {
    setSavingCompany(true);
    setCompanyError("");

    // включаем подсветку всех требуемых полей
    setCompanyNameTouched(true);
    const missingName    = !companyName || !companyName.trim();
    const missingCode    = !companyCode || !companyCode.trim();
    const missingCountry = !companyCountryIso;

    if (missingName || missingCode || missingCountry) {
      setCompanyError("„Įmonės pavadinimas“, „Įmonės kodas“ ir „Įmonės šalis“ yra privalomi.");
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

  // optimistic merge helper for lists
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
    setTouchedDefaults(true); // включаем подсветку на форме defaults

    try {
      const form = defaultsMode === "pirkimas" ? purchaseDefaultsForm : salesDefaultsForm;

      // обязательные: įmonės kodas, pavadinimas, kodas, tipas
      if (!form.imones_kodas?.trim() || !form.pavadinimas?.trim() || !form.kodas?.trim() || !form.tipas) {
        setErrorDefaults("„Įmonės kodas“, „Pavadinimas“, „Kodas“ ir „Tipas“ yra privalomi.");
        setSavingDefaults(false);
        return;
      }
      if ((form.tipas || "").toLowerCase() === "kodas" && !form.kodas_kaip) {
        setErrorDefaults("Pasirinkus „Kodas“, būtina nurodyti „Nustatyti PVM klasifikatorių kaip“.");
        setSavingDefaults(false);
        return;
      }

      const payloadItem = {
        imones_pavadinimas: form.imones_pavadinimas || "",
        imones_kodas:       form.imones_kodas || "",
        imones_pvm_kodas:   form.imones_pvm_kodas || "",
        pavadinimas:        form.pavadinimas.trim(),
        kodas:              form.kodas.trim(),
        barkodas:           form.barkodas || "",
        tipas:              tipasToNum(form.tipas, form.kodas_kaip),
      };

      const payload = defaultsMode === "pirkimas"
        ? { purchase_defaults: [payloadItem] }
        : { sales_defaults:    [payloadItem] };

      await api.patch("/profile/", payload, { withCredentials: true });

      if (defaultsMode === "pirkimas") {
        setPurchaseList((prev) => mergeProfileIntoList(prev, payloadItem));
        setPurchaseDefaultsForm({
          imones_pavadinimas: "", imones_kodas: "", imones_pvm_kodas: "",
          pavadinimas: "", kodas: "", barkodas: "", tipas: "Prekė", kodas_kaip: "",
        });
      } else {
        setSalesList((prev) => mergeProfileIntoList(prev, payloadItem));
        setSalesDefaultsForm({
          imones_pavadinimas: "", imones_kodas: "", imones_pvm_kodas: "",
          pavadinimas: "", kodas: "", barkodas: "", tipas: "Prekė", kodas_kaip: "",
        });
      }

      // после успеха — очистить подсветку и сообщение
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

  // NEW: toggle kelių įmonių režimas
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

  // Papildomi nustatymai: „Operacijos datą imti iš sąskaitos datos“
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

  // Papildomi nustatymai: Rivilė: frakcija
  const rivileFracKey = "rivile_fraction";
  const rivileFraction = Number(extraSettings?.[rivileFracKey] ?? 1);

  // Papildomi nustatymai: Rivilė: pakeisti lietuviškas raides
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


  // NEW: Rivilė – pakeisti lietuviškas raides
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

  return (
    <Box p={4} maxWidth={900}>
      <Helmet><title>Nustatymai - DokSkenas</title></Helmet>

      <Typography variant="h5" gutterBottom>Nustatymai</Typography>

      {/* 1. Company details */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>
          1. Įvesk savo įmonės informaciją
        </Typography>
        <Stack spacing={2} direction="column">
          <TextField
            label="Įmonės pavadinimas *"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            onBlur={() => setCompanyNameTouched(true)}
            fullWidth
            required
            error={companyNameTouched && !companyName.trim()}
            helperText={companyNameTouched && !companyName.trim() ? "Privalomas laukas" : ""}
          />
          <TextField
            label="Įmonės kodas *"
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
        <Select labelId="acc-prog-label" value={program} label="Numatytoji programa" onChange={handleChange}>
          {ACCOUNTING_PROGRAMS.map((p) => (
            <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
          ))}
        </Select>

        <Box sx={{ mt: 2 }}>
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
        </Box>
      </FormControl>

      <Button variant="contained" disabled={!program || saving} onClick={save}>Išsaugoti</Button>
      {success && <Alert severity="success" sx={{ mt: 2 }}>Išsaugota!</Alert>}

      {/* Atsisiųsti adapterį — rodoma tik pasirinkus Apskaita5 */}
      {program === "apskaita5" && (
        <Box sx={{ mt: 2 }}>
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

      {/* 3. Duomenų importas */}
      <Box mt={6}>
        <Typography variant="h6" gutterBottom>Duomenų importas</Typography>
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

      {/* 4. Defaults for sumiskai: form + table */}
      <Paper sx={{ p: 3, mt: 6 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ mr: 0 }}>
            Numatytosios reikšmės (tik skaitmenizuojant sumiškai)
          </Typography>
          <Tooltip
            title="Skaitmenizuojant sumiškai, bus automatiškai priskirtos jūsų nustatytos numatytosios reikšmės, jei sistema atpažins jūsų nustatytą įmonę kaip pirkėją arba pardavėją dokumente."
            arrow enterTouchDelay={0} leaveTouchDelay={4000}
          >
            <IconButton size="small" aria-label="Informacija"><HelpOutlineIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Box>

        <FormControl component="fieldset" sx={{ mb: 2 }}>
          <RadioGroup row value={defaultsMode} onChange={(_, v) => setDefaultsMode(v)} name="defaults-mode">
            <FormControlLabel value="pirkimas" control={<Radio />} label="Pirkimas" />
            <FormControlLabel value="pardavimas" control={<Radio />} label="Pardavimas" />
          </RadioGroup>
        </FormControl>

        {defaultsMode === "pirkimas" ? (
          <DefaultsFields
            mode="pirkimas"
            program={program}
            state={purchaseDefaultsForm}
            setState={setPurchaseDefaultsForm}
            touched={touchedDefaults}
          />
        ) : (
          <DefaultsFields
            mode="pardavimas"
            program={program}
            state={salesDefaultsForm}
            setState={setSalesDefaultsForm}
            touched={touchedDefaults}
          />
        )}

        <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
          <Button variant="contained" onClick={saveDefaults} disabled={savingDefaults}>Išsaugoti</Button>
          {successDefaults && <Alert severity="success">Išsaugota!</Alert>}
          {errorDefaults && <Alert severity="error">{errorDefaults}</Alert>}
        </Stack>

        {/* Saved profiles table for current mode */}
        <Typography variant="subtitle2" sx={{ mt: 3 }}>
          Išsaugoti profiliai ({defaultsMode === "pirkimas" ? "Pirkimas" : "Pardavimas"})
        </Typography>
        <DefaultsTable
          rows={defaultsMode === "pirkimas" ? purchaseList : salesList}
          onDelete={(idx) => deleteProfile(defaultsMode, idx)}
        />
      </Paper>

      {/* 5. Papildomi nustatymai */}
      <Paper sx={{ p: 3, mt: 6 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Papildomi nustatymai
        </Typography>
        <FormControlLabel
          control={<Switch checked={isOpDateFromDoc} onChange={toggleOpDateFromDoc} />}
          label="Operacijos datą imti iš sąskaitos datos"
        />

        {program === "rivile" && (
          <Box sx={{ mt: 2 }}>
            {/* NEW: Pakeisti lietuviškas raides */}
            <FormControlLabel
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
            />

            {/* Matavimo vienetų frakcija */}
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
    </Box>
  );
};

