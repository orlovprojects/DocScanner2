import React, { useEffect, useState } from "react";
import {
  Box, Typography, FormControl, InputLabel, Select, MenuItem,
  Button, Alert, Tabs, Tab, Paper, TextField, Stack, RadioGroup,
  FormControlLabel, Radio, IconButton, Tooltip, Switch, Table, TableContainer,
  TableHead, TableRow, TableCell, TableBody, Grid2, Chip,
} from "@mui/material";
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

  const [importTab, setImportTab] = useState(0);

  const [defaultsMode, setDefaultsMode] = useState("pirkimas");
  const [purchaseDefaultsForm, setPurchaseDefaultsForm] = useState({
    imones_pavadinimas: "",
    imones_kodas: "",
    imones_pvm_kodas: "",
    pavadinimas: "",
    kodas: "",
    barkodas: "",
    tipas: "Prekė",
    kodas_kaip: "",
  });
  const [salesDefaultsForm, setSalesDefaultsForm] = useState({
    imones_pavadinimas: "",
    imones_kodas: "",
    imones_pvm_kodas: "",
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
    pirkimas_prekes_grupe: "",
    pardavimas_padalinys: "",
    pardavimas_objektas: "",
    pardavimas_serija: "",
    pardavimas_centras: "",
    pardavimas_atskaitingas_asmuo: "",
    pardavimas_prekes_grupe: "",
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
    pardavimas_sandelis: "",
    pardavimas_tipas: "",
    pardavimas_zurnalas: "",
  });
  const [savingFinvalda, setSavingFinvalda] = useState(false);
  const [successFinvalda, setSuccessFinvalda] = useState(false);
  const [errorFinvalda, setErrorFinvalda] = useState("");

  // --- Centas ---
  const [centasFields, setCentasFields] = useState({
    pirkimas_sandelis: "",
    pirkimas_objektas: "",
    pardavimas_sandelis: "",
    pardavimas_objektas: "",
  });
  const [savingCentas, setSavingCentas] = useState(false);
  const [successCentas, setSuccessCentas] = useState(false);
  const [errorCentas, setErrorCentas] = useState("");

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
        pirkimas_prekes_grupe: gama.pirkimas_prekes_grupe || "",
        pardavimas_padalinys: gama.pardavimas_padalinys || "",
        pardavimas_objektas: gama.pardavimas_objektas || "",
        pardavimas_serija: gama.pardavimas_serija || "",
        pardavimas_centras: gama.pardavimas_centras || "",
        pardavimas_atskaitingas_asmuo: gama.pardavimas_atskaitingas_asmuo || "",
        pardavimas_prekes_grupe: gama.pardavimas_prekes_grupe || "",
      });

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
        pardavimas_sandelis: fin.pardavimas_sandelis || "",
        pardavimas_tipas: fin.pardavimas_tipas || "",
        pardavimas_zurnalas: fin.pardavimas_zurnalas || "",
      });

      const cent = data.centas_extra_fields || {};
      setCentasFields({
        pirkimas_sandelis: cent.pirkimas_sandelis || "",
        pirkimas_objektas: cent.pirkimas_objektas || "",
        pardavimas_sandelis: cent.pardavimas_sandelis || "",
        pardavimas_objektas: cent.pardavimas_objektas || "",
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
    setTouchedDefaults(false);
    setErrorDefaults("");
  }, [defaultsMode]);

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
      const form = defaultsMode === "pirkimas" ? purchaseDefaultsForm : salesDefaultsForm;

      if (!form.imones_kodas?.trim() || !form.pavadinimas?.trim() || !form.kodas?.trim() || !form.tipas) {
        setErrorDefaults("Įmonės kodas, Pavadinimas, Kodas ir Tipas yra privalomi.");
        setSavingDefaults(false);
        return;
      }
      if ((form.tipas || "").toLowerCase() === "kodas" && !form.kodas_kaip) {
        setErrorDefaults("Pasirinkus Kodas, būtina nurodyti Nustatyti PVM klasifikatorių kaip.");
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
      await api.patch(
        "/profile/",
        { rivile_gama_extra_fields: rivileGamaFields },
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

  return (
    <Box p={4} maxWidth={900}>
      <Helmet><title>Nustatymai - DokSkenas</title></Helmet>
      <Typography variant="h4" sx={{ fontWeight: 600 }}>Nustatymai</Typography>

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

      <AccountingProgramExtraSettings
        program={program}
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

      {/* 5. Defaults for sumiskai */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0, mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 500 }}>
            Numatytosios reikšmės (skaitmenizuojant sumiškai)
          </Typography>
          {/* <Typography variant="subtitle1" sx={{ mr: 0 }}>
            Numatytosios reikšmės (skaitmenizuojant sumiškai)
          </Typography> */}
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

        <Typography variant="subtitle2" sx={{ mt: 3 }}>
          Išsaugoti profiliai ({defaultsMode === "pirkimas" ? "Pirkimas" : "Pardavimas"})
        </Typography>
        <DefaultsTable
          rows={defaultsMode === "pirkimas" ? purchaseList : salesList}
          onDelete={(idx) => deleteProfile(defaultsMode, idx)}
        />
      </Paper>

      {/* 6. Automatinės taisyklės detalioms eilutėms */}

      <Paper sx={{ p: 3, mt: 6 }}>
        {/* Заголовок секции */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 500 }}>
            Numatytosios prekių reikšmės (skaitmenizuojant detaliai)
          </Typography>
          <Tooltip
            title="Kai taisyklių sąlygos įvykdytos, sistema automatiškai priskiria prekės pavadinimą, kodą, barkodą ir tipą kiekvienai eilutei skaitmenizuojant detaliai"
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
                    border: "2px solid",
                    borderColor: r.enabled ? "success.main" : "grey.300",
                    borderRadius: 2,
                    overflow: "hidden",
                    transition: "all 0.2s",
                    "&:hover": {
                      boxShadow: 2,
                    },
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      p: 2,
                      backgroundColor: r.enabled ? "success.50" : "grey.50",
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
    </Box>
  );
}
















// import React, { useEffect, useState } from "react";
// import {
//   Box, Typography, FormControl, InputLabel, Select, MenuItem,
//   Button, Alert, Tabs, Tab, Paper, TextField, Stack, RadioGroup,
//   FormControlLabel, Radio, IconButton, Tooltip, Switch, Table, TableContainer,
//   TableHead, TableRow, TableCell, TableBody, Grid2, Chip,
// } from "@mui/material";
// import EditIcon from '@mui/icons-material/Edit';
// import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
// import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
// import Autocomplete from "@mui/material/Autocomplete";
// import { api } from "../api/endpoints";
// import { COUNTRY_OPTIONS } from "../page_elements/Countries";
// import { ACCOUNTING_PROGRAMS } from "../page_elements/AccountingPrograms";
// import { Helmet } from "react-helmet";

// /** ===== PVM copy text (tab-separated), for Apskaita5 button ===== */
// const PVM_COPY_TEXT = [
//   "PVM1\t21% — Pirkimas, Pardavimas — Prekė, Paslauga",
//   "PVM2\t9% — Pirkimas, Pardavimas — Prekė, Paslauga",
//   "PVM3\t5% — Pirkimas, Pardavimas — Prekė, Paslauga",
//   "PVM49\t6% — Pirkimas, Pardavimas — Prekė, Paslauga",
//   "PVM5\t0% — Pirkimas, Pardavimas — Prekė, Paslauga",
//   "PVM12\t0% — Pirkimas, Pardavimas — Prekė",
//   "PVM13\t0% — Pirkimas, Pardavimas — Prekė",
//   "PVM14\t0% — Pirkimas, Pardavimas — Paslauga",
//   "PVM21\t0% — Pirkimas, Pardavimas — Paslauga",
// ].join("\n");

// /** ===== Reusable: import tab for XLSX ===== */
// function ImportTab({ label, url, templateFileName }) {
//   const [file, setFile] = useState(null);
//   const [result, setResult] = useState(null);
//   const [error,   setError] = useState(null);
//   const inputRef  = React.useRef(null);

//   const handleFile = (e) => {
//     setFile(e.target.files[0] || null);
//     setResult(null);
//     setError(null);
//   };

//   const handleImport = async () => {
//     if (!file) return;
//     const formData = new FormData();
//     formData.append("file", file);
//     try {
//       const { data } = await api.post(url, formData, {
//         withCredentials: true,
//         headers: { "Content-Type": "multipart/form-data" },
//       });
//       if (data?.error) {
//         setError(data.error);
//         setResult({ imported: 0, processed: 0 });
//       } else {
//         setResult({
//           imported: Number(data?.imported) || 0,
//           processed: Number(data?.processed) || 0,
//         });
//         setError(null);
//       }
//     } catch (err) {
//       setError(err?.response?.data?.error || "Importo klaida");
//       setResult({ imported: 0, processed: 0 });
//     } finally {
//       if (inputRef.current) inputRef.current.value = "";
//       setFile(null);
//     }
//   };

//   const handleDownloadTemplate = () =>
//     window.open(`/templates/${templateFileName || "imones_sablonas.xlsx"}`, "_blank");

//   return (
//     <Paper sx={{ p: 2, mb: 2 }}>
//       <Typography gutterBottom variant="subtitle1">{label}</Typography>

//       <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
//         <Button variant="outlined" component="label">
//           Pasirinkite failą
//           <input type="file" accept=".xlsx" hidden ref={inputRef} onChange={handleFile} />
//         </Button>
//         <Typography variant="body2">
//           {file ? file.name : "Niekas nepasirinkta"}
//         </Typography>
//       </Stack>

//       <Button variant="contained" disabled={!file} onClick={handleImport}>Importuoti</Button>
//       <Button variant="outlined" size="small" sx={{ ml: 2 }} onClick={handleDownloadTemplate}>
//         Atsisiųsti Excel šabloną
//       </Button>

//       {result && (
//         <Alert severity="success" sx={{ mt: 2 }}>
//           Importuota įrašų: {result?.imported ?? 0} iš {result?.processed ?? 0}
//         </Alert>
//       )}
//       {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
//     </Paper>
//   );
// }

// /** ===== Defaults fieldset (with company fields) ===== */
// const DefaultsFields = React.memo(function DefaultsFields({ mode, program, state, setState, touched }) {
//   const isPurchase = mode === "pirkimas";
//   const showKodas = program === "rivile";

//   React.useEffect(() => {
//     if (!showKodas && String(state.tipas || "").toLowerCase() === "kodas") {
//       setState((prev) => ({ ...prev, tipas: "Prekė", kodas_kaip: "" }));
//     }
//   }, [showKodas, state.tipas, setState]);

//   const labels = React.useMemo(
//     () =>
//       isPurchase
//         ? {
//             title: "Pirkimas",
//             imones_pavadinimas: "Įmonės pavadinimas",
//             imones_kodas: "Įmonės kodas",
//             imones_pvm_kodas: "Įmonės PVM kodas",
//             pavadinimas: "Išlaidos pavadinimas",
//             kodas: "Išlaidos kodas",
//             barkodas: "Išlaidos barkodas",
//             tipas: "Išlaidos tipas",
//           }
//         : {
//             title: "Pardavimas",
//             imones_pavadinimas: "Įmonės pavadinimas",
//             imones_kodas: "Įmonės kodas",
//             imones_pvm_kodas: "Įmonės PVM kodas",
//             pavadinimas: "Pajamų pavadinimas",
//             kodas: "Pajamų kodas",
//             barkodas: "Pajamų barkodas",
//             tipas: "Pajamų tipas",
//           },
//     [isPurchase]
//   );

//   const onChangeField = (field) => (e) =>
//     setState((prev) => ({ ...prev, [field]: e.target.value }));

//   const isKodas = String(state.tipas || "").toLowerCase() === "kodas";

//   return (
//     <Stack spacing={2} direction="column">
//       <TextField
//         label={labels.imones_pavadinimas}
//         value={state.imones_pavadinimas}
//         onChange={onChangeField("imones_pavadinimas")}
//         fullWidth
//       />
//       <TextField
//         label={labels.imones_kodas}
//         value={state.imones_kodas}
//         onChange={onChangeField("imones_kodas")}
//         fullWidth
//         required
//         error={touched && !state.imones_kodas?.trim()}
//         helperText={touched && !state.imones_kodas?.trim() ? "Privalomas laukas" : ""}
//       />
//       <TextField
//         label={labels.imones_pvm_kodas}
//         value={state.imones_pvm_kodas}
//         onChange={onChangeField("imones_pvm_kodas")}
//         fullWidth
//       />

//       <TextField
//         label={labels.pavadinimas}
//         value={state.pavadinimas}
//         onChange={onChangeField("pavadinimas")}
//         fullWidth
//         required
//         error={touched && !state.pavadinimas?.trim()}
//         helperText={touched && !state.pavadinimas?.trim() ? "Privalomas laukas" : ""}
//       />
//       <TextField
//         label={labels.kodas}
//         value={state.kodas}
//         onChange={onChangeField("kodas")}
//         fullWidth
//         required
//         error={touched && !state.kodas?.trim()}
//         helperText={touched && !state.kodas?.trim() ? "Privalomas laukas" : ""}
//       />
//       <TextField
//         label={labels.barkodas}
//         value={state.barkodas}
//         onChange={onChangeField("barkodas")}
//         fullWidth
//       />
//       <FormControl fullWidth required error={touched && !state.tipas}>
//         <InputLabel>{labels.tipas}</InputLabel>
//         <Select
//           label={labels.tipas}
//           value={state.tipas}
//           onChange={(e) => setState((prev) => ({ ...prev, tipas: e.target.value }))}
//         >
//           <MenuItem value="Prekė">Prekė</MenuItem>
//           <MenuItem value="Paslauga">Paslauga</MenuItem>
//           {showKodas && <MenuItem value="Kodas">Kodas</MenuItem>}
//         </Select>
//       </FormControl>

//       {isKodas && (
//         <FormControl
//           fullWidth
//           required
//           error={touched && !state.kodas_kaip}
//           sx={{ mt: 1 }}
//         >
//           <InputLabel>Nustatyti PVM klasifikatorių kaip</InputLabel>
//           <Select
//             label="Nustatyti PVM klasifikatorių kaip"
//             value={state.kodas_kaip || ""}
//             onChange={(e) => setState((prev) => ({ ...prev, kodas_kaip: e.target.value }))}
//           >
//             <MenuItem value="Prekei">Prekei</MenuItem>
//             <MenuItem value="Paslaugai">Paslaugai</MenuItem>
//           </Select>
//         </FormControl>
//       )}
//     </Stack>
//   );
// });

// /** ===== Table of saved defaults with delete ===== */
// function DefaultsTable({ rows, onDelete }) {
//   if (!rows?.length) {
//     return (
//       <Typography variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
//         Nėra išsaugotų profilių.
//       </Typography>
//     );
//   }

//   const tipasLabel = (t) => {
//     const s = String(t).toLowerCase();
//     if (t === 2 || s === "paslauga") return "Paslauga";
//     if (t === 3) return "Kodas (Prekei)";
//     if (t === 4) return "Kodas (Paslaugai)";
//     if (s === "kodas") return "Kodas";
//     return "Prekė";
//   };

//   return (
//     <TableContainer sx={{ mt: 2, overflowX: "auto" }}>
//       <Table size="small" stickyHeader sx={{ minWidth: 900 }}>
//         <TableHead>
//           <TableRow>
//             <TableCell>#</TableCell>
//             <TableCell>Įmonės pavadinimas</TableCell>
//             <TableCell>Įmonės kodas</TableCell>
//             <TableCell>PVM kodas</TableCell>
//             <TableCell>Pavadinimas</TableCell>
//             <TableCell>Kodas</TableCell>
//             <TableCell>Barkodas</TableCell>
//             <TableCell>Tipas</TableCell>
//             <TableCell align="right">Veiksmai</TableCell>
//           </TableRow>
//         </TableHead>
//         <TableBody>
//           {rows.map((r, idx) => (
//             <TableRow key={idx}>
//               <TableCell sx={{ whiteSpace: "nowrap" }}>{idx}</TableCell>
//               <TableCell>{r.imones_pavadinimas || "—"}</TableCell>
//               <TableCell>{r.imones_kodas || "—"}</TableCell>
//               <TableCell>{r.imones_pvm_kodas || "—"}</TableCell>
//               <TableCell>{r.pavadinimas || "—"}</TableCell>
//               <TableCell>{r.kodas || "—"}</TableCell>
//               <TableCell>{r.barkodas || "—"}</TableCell>
//               <TableCell>{tipasLabel(r.tipas)}</TableCell>
//               <TableCell align="right">
//                 <IconButton color="error" size="small" onClick={() => onDelete(idx)} aria-label="Ištrinti">
//                   <DeleteOutlineIcon fontSize="small" />
//                 </IconButton>
//               </TableCell>
//             </TableRow>
//           ))}
//         </TableBody>
//       </Table>
//     </TableContainer>
//   );
// }

// export default function NustatymaiPage() {
//   const [user, setUser] = useState(null);
//   const [program, setProgram] = useState("");
//   const [saving, setSaving] = useState(false);
//   const [success, setSuccess] = useState(false);
//   const [rivileSaved, setRivileSaved] = useState(false);

//   const [companyName, setCompanyName] = useState("");
//   const [companyNameTouched, setCompanyNameTouched] = useState(false);
//   const [companyCode, setCompanyCode] = useState("");
//   const [vatCode, setVatCode] = useState("");
//   const [companyIban, setCompanyIban] = useState("");
//   const [companyAddress, setCompanyAddress] = useState("");
//   const [companyCountryIso, setCompanyCountryIso] = useState("LT");
//   const [savingCompany, setSavingCompany] = useState(false);
//   const [successCompany, setSuccessCompany] = useState(false);
//   const [companyError, setCompanyError] = useState("");

//   const [importTab, setImportTab] = useState(0);

//   const [defaultsMode, setDefaultsMode] = useState("pirkimas");
//   const [purchaseDefaultsForm, setPurchaseDefaultsForm] = useState({
//     imones_pavadinimas: "",
//     imones_kodas: "",
//     imones_pvm_kodas: "",
//     pavadinimas: "",
//     kodas: "",
//     barkodas: "",
//     tipas: "Prekė",
//     kodas_kaip: "",
//   });
//   const [salesDefaultsForm, setSalesDefaultsForm] = useState({
//     imones_pavadinimas: "",
//     imones_kodas: "",
//     imones_pvm_kodas: "",
//     pavadinimas: "",
//     kodas: "",
//     barkodas: "",
//     tipas: "Prekė",
//     kodas_kaip: "",
//   });

//   const [lineitemRules, setLineitemRules] = useState([]);
//   const [ruleForm, setRuleForm] = useState({
//     id: null,
//     enabled: true,
//     vat_op: "=",
//     vat_value: "",
//     name_contains: "",
//     buyer_id: "",
//     buyer_vat_code: "",
//     seller_id: "",
//     seller_vat_code: "",
//     apply_to_all: false,
//     result_kodas: "",
//     result_tipas: "Prekė",
//     result_kodas_kaip: "",
//     result_pavadinimas: "",
//     result_barkodas: "",
//   });
//   const [savingRules, setSavingRules] = useState(false);
//   const [rulesError, setRulesError] = useState("");
//   const [rulesSuccess, setRulesSuccess] = useState(false);

//   const [purchaseList, setPurchaseList] = useState([]);
//   const [salesList, setSalesList] = useState([]);

//   const [savingDefaults, setSavingDefaults] = useState(false);
//   const [successDefaults, setSuccessDefaults] = useState(false);
//   const [errorDefaults, setErrorDefaults] = useState("");

//   const [viewMode, setViewMode] = useState("single");
//   const [savingViewMode, setSavingViewMode] = useState(false);

//   const [extraSettings, setExtraSettings] = useState({});

//   const [touchedDefaults, setTouchedDefaults] = useState(false);

//   const [copiedPvm, setCopiedPvm] = useState(false);
//   const handleCopyPvm = async () => {
//     try {
//       await navigator.clipboard.writeText(PVM_COPY_TEXT);
//       setCopiedPvm(true);
//       setTimeout(() => setCopiedPvm(false), 2000);
//     } catch {
//       alert("Nepavyko nukopijuoti į iškarpinę.");
//     }
//   };

//   const tipasToNum = (t, kodasKaip) => {
//     const v = (t || "").toString().trim().toLowerCase();
//     if (v === "paslauga") return 2;
//     if (v === "kodas") {
//       const kk = (kodasKaip || "").toString().trim().toLowerCase();
//       if (kk.startsWith("paslaug")) return 4;
//       return 3;
//     }
//     return 1;
//   };

//   useEffect(() => {
//     api.get("/profile/", { withCredentials: true }).then(({ data }) => {
//       setUser(data);
//       setProgram(data.default_accounting_program || "");

//       setCompanyName(data.company_name || "");
//       setCompanyCode(data.company_code || "");
//       setVatCode(data.vat_code || "");
//       setCompanyIban(data.company_iban || "");
//       setCompanyAddress(data.company_address || "");
//       setCompanyCountryIso(data.company_country_iso || "LT");

//       const pdList = Array.isArray(data.purchase_defaults)
//         ? data.purchase_defaults
//         : data.purchase_defaults
//         ? [data.purchase_defaults]
//         : [];
//       const sdList = Array.isArray(data.sales_defaults)
//         ? data.sales_defaults
//         : data.sales_defaults
//         ? [data.sales_defaults]
//         : [];
//       setPurchaseList(pdList);
//       setSalesList(sdList);

//       setViewMode(data.view_mode || "single");
//       setExtraSettings(data.extra_settings || {});

//       const lrList = Array.isArray(data.lineitem_rules)
//         ? data.lineitem_rules
//         : data.lineitem_rules
//         ? [data.lineitem_rules]
//         : [];
//       setLineitemRules(lrList);
//     });
//   }, []);

//   useEffect(() => {
//     setTouchedDefaults(false);
//     setErrorDefaults("");
//   }, [defaultsMode]);

//   useEffect(() => {
//     setRuleForm(prev => {
//       if (program !== "rivile" && prev.result_tipas === "Kodas") {
//         return { ...prev, result_tipas: "Prekė", result_kodas_kaip: "" };
//       }
//       return prev;
//     });
//   }, [program]);

//   const handleChange = async (e) => {
//     const newProgram = e.target.value;
//     setProgram(newProgram);
//     setSaving(true);
//     try {
//       await api.patch("/profile/", { default_accounting_program: newProgram }, { withCredentials: true });
//       setSuccess(true);
//       setTimeout(() => setSuccess(false), 2000);
//     } catch (err) {
//       console.error("Failed to save program:", err);
//     } finally {
//       setSaving(false);
//     }
//   };

//   const saveCompanyDetails = async () => {
//     setSavingCompany(true);
//     setCompanyError("");

//     setCompanyNameTouched(true);
//     const missingName    = !companyName || !companyName.trim();
//     const missingCode    = !companyCode || !companyCode.trim();
//     const missingCountry = !companyCountryIso;

//     if (missingName || missingCode || missingCountry) {
//       setCompanyError("Įmonės pavadinimas, Įmonės kodas ir Įmonės šalis yra privalomi.");
//       setSavingCompany(false);
//       return;
//     }

//     try {
//       await api.patch(
//         "/profile/",
//         {
//           company_name: companyName,
//           company_code: companyCode,
//           vat_code: vatCode,
//           company_iban: companyIban,
//           company_address: companyAddress,
//           company_country_iso: companyCountryIso,
//         },
//         { withCredentials: true }
//       );
//       setSuccessCompany(true);
//       setTimeout(() => setSuccessCompany(false), 2000);
//     } finally {
//       setSavingCompany(false);
//     }
//   };

//   const mergeProfileIntoList = (list, item) => {
//     const norm = (s) => (s || "").toString().trim().toUpperCase();
//     const key = (x) => [norm(x.imones_kodas), norm(x.imones_pvm_kodas), norm(x.imones_pavadinimas)].join("|");
//     const k = key(item);
//     const idx = list.findIndex((x) => key(x) === k && k !== "||");
//     if (idx >= 0) {
//       const next = [...list];
//       next[idx] = { ...next[idx], ...item };
//       return next;
//     }
//     return [...list, item];
//   };

//   const saveDefaults = async () => {
//     setSavingDefaults(true);
//     setErrorDefaults("");
//     setTouchedDefaults(true);

//     try {
//       const form = defaultsMode === "pirkimas" ? purchaseDefaultsForm : salesDefaultsForm;

//       if (!form.imones_kodas?.trim() || !form.pavadinimas?.trim() || !form.kodas?.trim() || !form.tipas) {
//         setErrorDefaults("Įmonės kodas, Pavadinimas, Kodas ir Tipas yra privalomi.");
//         setSavingDefaults(false);
//         return;
//       }
//       if ((form.tipas || "").toLowerCase() === "kodas" && !form.kodas_kaip) {
//         setErrorDefaults("Pasirinkus Kodas, būtina nurodyti Nustatyti PVM klasifikatorių kaip.");
//         setSavingDefaults(false);
//         return;
//       }

//       const payloadItem = {
//         imones_pavadinimas: form.imones_pavadinimas || "",
//         imones_kodas:       form.imones_kodas || "",
//         imones_pvm_kodas:   form.imones_pvm_kodas || "",
//         pavadinimas:        form.pavadinimas.trim(),
//         kodas:              form.kodas.trim(),
//         barkodas:           form.barkodas || "",
//         tipas:              tipasToNum(form.tipas, form.kodas_kaip),
//       };

//       const payload = defaultsMode === "pirkimas"
//         ? { purchase_defaults: [payloadItem] }
//         : { sales_defaults:    [payloadItem] };

//       await api.patch("/profile/", payload, { withCredentials: true });

//       if (defaultsMode === "pirkimas") {
//         setPurchaseList((prev) => mergeProfileIntoList(prev, payloadItem));
//         setPurchaseDefaultsForm({
//           imones_pavadinimas: "", imones_kodas: "", imones_pvm_kodas: "",
//           pavadinimas: "", kodas: "", barkodas: "", tipas: "Prekė", kodas_kaip: "",
//         });
//       } else {
//         setSalesList((prev) => mergeProfileIntoList(prev, payloadItem));
//         setSalesDefaultsForm({
//           imones_pavadinimas: "", imones_kodas: "", imones_pvm_kodas: "",
//           pavadinimas: "", kodas: "", barkodas: "", tipas: "Prekė", kodas_kaip: "",
//         });
//       }

//       setTouchedDefaults(false);
//       setErrorDefaults("");
//       setSuccessDefaults(true);
//       setTimeout(() => setSuccessDefaults(false), 2000);
//     } catch (e) {
//       setErrorDefaults(e?.response?.data?.detail || "Nepavyko išsaugoti numatytųjų reikšmių.");
//     } finally {
//       setSavingDefaults(false);
//     }
//   };

//   const deleteProfile = async (mode, index) => {
//     try {
//       const payload = mode === "pirkimas"
//         ? { purchase_defaults: { "__delete_index__": index } }
//         : { sales_defaults:    { "__delete_index__": index } };

//     await api.patch("/profile/", payload, { withCredentials: true });

//       if (mode === "pirkimas") setPurchaseList((prev) => prev.filter((_, i) => i !== index));
//       else                     setSalesList((prev) => prev.filter((_, i) => i !== index));
//     } catch (e) {
//       alert(e?.response?.data?.detail || "Nepavyko ištrinti įrašo.");
//     }
//   };

//   const saveLineitemRule = async () => {
//     setSavingRules(true);
//     setRulesError("");
//     setRulesSuccess(false);

//     try {
//       if (!ruleForm.result_kodas?.trim()) {
//         setRulesError("Prekės kodas yra privalomas.");
//         setSavingRules(false);
//         return;
//       }

//       // Проверка: при Rivilė + Kodas нужно выбрать „kaip“
//       if (
//         program === "rivile" &&
//         ruleForm.result_tipas === "Kodas" &&
//         !ruleForm.result_kodas_kaip
//       ) {
//         setRulesError("Pasirinkus „Kodas“, būtina nurodyti „Nustatyti PVM klasifikatorių kaip“.");
//         setSavingRules(false);
//         return;
//       }

//       // Проверка что хотя бы одна sąlyga выбрана
//       const hasAnyCondition =
//         ruleForm.apply_to_all ||
//         (ruleForm.vat_value !== "" &&
//           ruleForm.vat_value !== null &&
//           ruleForm.vat_value !== undefined) ||
//         (ruleForm.name_contains !== "" &&
//           ruleForm.name_contains !== null &&
//           ruleForm.name_contains !== undefined) ||
//         (ruleForm.buyer_id !== "" && ruleForm.buyer_id !== null) ||
//         (ruleForm.buyer_vat_code !== "" && ruleForm.buyer_vat_code !== null) ||
//         (ruleForm.seller_id !== "" && ruleForm.seller_id !== null) ||
//         (ruleForm.seller_vat_code !== "" && ruleForm.seller_vat_code !== null);

//       if (!hasAnyCondition) {
//         setRulesError("Pasirinkite bent vieną sąlygą.");
//         setSavingRules(false);
//         return;
//       }

//       const nextId =
//         ruleForm.id ??
//         (lineitemRules.reduce(
//           (max, r) => (typeof r.id === "number" && r.id > max ? r.id : max),
//           0
//         ) + 1);

//       const payloadRule = {
//         id: nextId,
//         enabled: !!ruleForm.enabled,
//         apply_to_all: !!ruleForm.apply_to_all,
//         vat_percent: ruleForm.apply_to_all
//           ? null
//           : ruleForm.vat_value
//           ? { op: ruleForm.vat_op, value: Number(ruleForm.vat_value) }
//           : null,
//         name_contains: ruleForm.apply_to_all ? "" : (ruleForm.name_contains || ""),
//         buyer_id: ruleForm.apply_to_all ? "" : (ruleForm.buyer_id || ""),
//         buyer_vat_code: ruleForm.apply_to_all ? "" : (ruleForm.buyer_vat_code || ""),
//         seller_id: ruleForm.apply_to_all ? "" : (ruleForm.seller_id || ""),
//         seller_vat_code: ruleForm.apply_to_all ? "" : (ruleForm.seller_vat_code || ""),

//         result_kodas: ruleForm.result_kodas.trim(),
//         result_tipas: ruleForm.result_tipas || "Prekė",

//         // Naujas laukas Rivile atvejui (back-end jo nebreakina, tiesiog ignoruos/naudos vėliau)
//         result_kodas_kaip:
//           program === "rivile" && ruleForm.result_tipas === "Kodas"
//             ? ruleForm.result_kodas_kaip || ""
//             : "",

//         // Nauji, papildomi laukai (nebūtini)
//         result_pavadinimas: ruleForm.result_pavadinimas || "",
//         result_barkodas: ruleForm.result_barkodas || "",
//       };

//       const newList = (() => {
//         const idx = lineitemRules.findIndex((r) => r.id === nextId);
//         if (idx === -1) return [...lineitemRules, payloadRule];
//         const copy = [...lineitemRules];
//         copy[idx] = payloadRule;
//         return copy;
//       })();

//       await api.patch(
//         "/profile/",
//         { lineitem_rules: newList },
//         { withCredentials: true }
//       );

//       setLineitemRules(newList);
//       setRuleForm({
//         id: null,
//         enabled: true,
//         vat_op: "=",
//         vat_value: "",
//         name_contains: "",
//         buyer_id: "",
//         buyer_vat_code: "",
//         seller_id: "",
//         seller_vat_code: "",
//         apply_to_all: false,
//         result_kodas: "",
//         result_tipas: "Prekė",
//         result_kodas_kaip: "",
//         result_pavadinimas: "",
//         result_barkodas: "",
//       });
//       setRulesSuccess(true);
//       setTimeout(() => setRulesSuccess(false), 2000);
//     } catch (e) {
//       const data = e?.response?.data;
//       let msg =
//         data?.lineitem_rules ||
//         data?.detail ||
//         "Nepavyko išsaugoti taisyklės.";
//       if (typeof msg === "object") {
//         try {
//           msg = JSON.stringify(msg);
//         } catch {
//           msg = "Nepavyko išsaugoti taisyklės.";
//         }
//       }
//       setRulesError(msg);
//     } finally {
//       setSavingRules(false);
//     }
//   };

//   const deleteLineitemRule = async (id) => {
//     const newList = lineitemRules.filter((r) => r.id !== id);
//     try {
//       await api.patch(
//         "/profile/",
//         { lineitem_rules: newList },
//         { withCredentials: true }
//       );
//       setLineitemRules(newList);
//     } catch (e) {
//       alert(e?.response?.data?.detail || "Nepavyko ištrinti taisyklės.");
//     }
//   };

//   const toggleViewMode = async (e) => {
//     const nextMode = e.target.checked ? "multi" : "single";
//     const prevMode = viewMode;
//     setViewMode(nextMode);
//     setSavingViewMode(true);
//     try {
//       await api.patch("/view-mode/", { view_mode: nextMode }, { withCredentials: true });
//     } catch {
//       setViewMode(prevMode);
//       alert("Nepavyko pakeisti režimo.");
//     } finally {
//       setSavingViewMode(false);
//     }
//   };

//   const opDateKey = "operation_date=document_date";
//   const isOpDateFromDoc = Boolean(extraSettings && Object.prototype.hasOwnProperty.call(extraSettings, opDateKey));
//   const toggleOpDateFromDoc = async (e) => {
//     const checked = e.target.checked;
//     const next = { ...(extraSettings || {}) };
//     if (checked) next[opDateKey] = 1; else if (opDateKey in next) delete next[opDateKey];
//     setExtraSettings(next);
//     try {
//       await api.patch("/profile/", { extra_settings: next }, { withCredentials: true });
//     } catch {
//       setExtraSettings(extraSettings || {});
//       alert("Nepavyko išsaugoti papildomų nustatymų.");
//     }
//   };

//   const rivileFracKey = "rivile_fraction";
//   const rivileFraction = Number(extraSettings?.[rivileFracKey] ?? 1);

//   const rivileStripLtKey = "rivile_strip_lt_letters";
//   const isRivileStripLt = Boolean(
//     extraSettings && Object.prototype.hasOwnProperty.call(extraSettings, rivileStripLtKey)
//   );

//   const setRivileFraction = async (value) => {
//     const prev = extraSettings || {};
//     const next = { ...prev };

//     if (value === 1) {
//       if (rivileFracKey in next) delete next[rivileFracKey];
//     } else {
//       next[rivileFracKey] = value;
//     }

//     setExtraSettings(next);
//     try {
//       await api.patch("/profile/", { extra_settings: next }, { withCredentials: true });
//       setRivileSaved(true);
//       setTimeout(() => setRivileSaved(false), 1800);
//     } catch {
//       setExtraSettings(prev);
//       alert("Nepavyko išsaugoti frakcijos.");
//     }
//   };

//   const toggleRivileStripLt = async (e) => {
//     const checked = e.target.checked;
//     const prev = extraSettings || {};
//     const next = { ...prev };

//     if (checked) {
//       next[rivileStripLtKey] = 1;
//     } else if (rivileStripLtKey in next) {
//       delete next[rivileStripLtKey];
//     }

//     setExtraSettings(next);
//     try {
//       await api.patch("/profile/", { extra_settings: next }, { withCredentials: true });
//       setRivileSaved(true);
//       setTimeout(() => setRivileSaved(false), 1800);
//     } catch {
//       setExtraSettings(prev);
//       alert("Nepavyko išsaugoti nustatymo dėl lietuviškų raidžių.");
//     }
//   };

//   return (
//     <Box p={4} maxWidth={900}>
//       <Helmet><title>Nustatymai - DokSkenas</title></Helmet>

//       <Typography variant="h5" gutterBottom>Nustatymai</Typography>

//       {/* 1. Company details */}
//       <Paper sx={{ p: 3, mb: 3 }}>
//         <Typography variant="subtitle1" sx={{ mb: 2 }}>
//           1. Įvesk savo įmonės informaciją
//         </Typography>
//         <Stack spacing={2} direction="column">
//           <TextField
//             label="Įmonės pavadinimas *"
//             value={companyName}
//             onChange={(e) => setCompanyName(e.target.value)}
//             onBlur={() => setCompanyNameTouched(true)}
//             fullWidth
//             required
//             error={companyNameTouched && !companyName.trim()}
//             helperText={companyNameTouched && !companyName.trim() ? "Privalomas laukas" : ""}
//           />
//           <TextField
//             label="Įmonės kodas *"
//             value={companyCode}
//             onChange={(e) => setCompanyCode(e.target.value)}
//             onBlur={() => setCompanyNameTouched(true)}
//             fullWidth
//             required
//             error={companyNameTouched && !companyCode.trim()}
//             helperText={companyNameTouched && !companyCode.trim() ? "Privalomas laukas" : ""}
//           />
//           <TextField label="PVM kodas" value={vatCode} onChange={(e) => setVatCode(e.target.value)} fullWidth />
//           <TextField label="Įmonės IBAN" value={companyIban} onChange={(e) => setCompanyIban(e.target.value)} fullWidth />
//           <TextField label="Įmonės adresas" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} fullWidth />
//           <Autocomplete
//             disablePortal
//             options={COUNTRY_OPTIONS}
//             getOptionLabel={(option) => option.name}
//             value={COUNTRY_OPTIONS.find((opt) => opt.code === companyCountryIso) || null}
//             onChange={(_, newValue) => setCompanyCountryIso(newValue ? newValue.code : "")}
//             renderInput={(params) => (
//               <TextField
//                 {...params}
//                 label="Įmonės šalis *"
//                 fullWidth
//                 required
//                 error={companyNameTouched && !companyCountryIso}
//                 helperText={companyNameTouched && !companyCountryIso ? "Privalomas laukas" : ""}
//               />
//             )}
//             isOptionEqualToValue={(option, value) => option.code === value.code}
//           />
//           <Button
//             variant="contained"
//             onClick={saveCompanyDetails}
//             disabled={savingCompany}
//             sx={{ alignSelf: "flex-start", mt: 1 }}
//           >
//             Išsaugoti
//           </Button>
//           {companyError && <Alert severity="error">{companyError}</Alert>}
//           {successCompany && <Alert severity="success">Išsaugota!</Alert>}
//         </Stack>
//       </Paper>

//       {/* 2. Accounting program + multi switch */}
//       <Typography variant="subtitle1" sx={{ mb: 2 }}>
//         2. Pasirink savo buhalterinę programą
//       </Typography>
//       <FormControl fullWidth sx={{ mb: 3 }}>
//         <InputLabel id="acc-prog-label">Numatytoji programa</InputLabel>
//         <Select 
//           labelId="acc-prog-label" 
//           value={program} 
//           label="Numatytoji programa" 
//           onChange={handleChange}
//           disabled={saving}
//         >
//           {ACCOUNTING_PROGRAMS.map((p) => (
//             <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
//           ))}
//         </Select>

//         <Box sx={{ mt: 2 }}>
//           <FormControlLabel
//             control={<Switch checked={viewMode === "multi"} onChange={toggleViewMode} disabled={savingViewMode} />}
//             label={
//               <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
//                 <span>Kelių įmonių režimas</span>
//                 <Tooltip
//                   title="Pasirinkus šį režimą, galėsite vesti kelių įmonių apskaitą. Matysite visų kontrahentų sąrašą suvestinėje."
//                   arrow enterTouchDelay={0} leaveTouchDelay={4000}
//                 >
//                   <HelpOutlineIcon fontSize="small" />
//                 </Tooltip>
//               </Box>
//             }
//           />
//         </Box>
//       </FormControl>

//       {success && <Alert severity="success" sx={{ mb: 2 }}>Išsaugota!</Alert>}

//       {program === "apskaita5" && (
//         <Box sx={{ mb: 3 }}>
//           <Stack direction="row" spacing={1} alignItems="center">
//             <Button
//               variant="outlined"
//               component="a"
//               href="/api/download/apskaita5-adapter/"
//             >
//               Atsisiųsti Apskaita5 adapterį
//             </Button>

//             <Button variant="outlined" onClick={handleCopyPvm}>
//               Kopijuoti PVM kodus
//             </Button>
//           </Stack>

//           {copiedPvm && (
//             <Alert severity="success" sx={{ mt: 1, py: 0.5 }}>
//               Nukopijuota į iškarpinę.
//             </Alert>
//           )}
//         </Box>
//       )}

//       {/* 3. Papildomi nustatymai */}
//       <Paper sx={{ p: 3, mb: 3 }}>
//         <Typography variant="subtitle1" sx={{ mb: 1 }}>
//           Papildomi nustatymai
//         </Typography>
//         <FormControlLabel
//           control={<Switch checked={isOpDateFromDoc} onChange={toggleOpDateFromDoc} />}
//           label="Operacijos datą imti iš sąskaitos datos"
//         />

//         {program === "rivile" && (
//           <Box sx={{ mt: 2 }}>
//             <FormControlLabel
//               sx={{ mb: 1 }}
//               control={
//                 <Switch
//                   checked={isRivileStripLt}
//                   onChange={toggleRivileStripLt}
//                 />
//               }
//               label={
//                 <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
//                   <span>Pakeisti lietuviškas raides</span>
//                   <Tooltip
//                     arrow
//                     enterTouchDelay={0}
//                     leaveTouchDelay={4000}
//                     title="Pakeisime visas lietuviškas raides į angliškas, pvz. š -> s. Naudokite, kai importuodami duomenis matote hieroglifus."
//                   >
//                     <HelpOutlineIcon fontSize="small" />
//                   </Tooltip>
//                 </Box>
//               }
//             />

//             <Typography
//               variant="body1"
//               sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
//             >
//               Matavimo vienetų frakcija
//               <Tooltip
//                 arrow
//                 enterTouchDelay={0}
//                 leaveTouchDelay={4000}
//                 title="Frakcija turi atitikti nustatytai frakcijai matavimo vienetams jūsų Rivilė Gama programoje (Kortelės -> Matavimo vienetai). Kitaip kiekis gali būti apvalinamas."
//               >
//                 <HelpOutlineIcon fontSize="small" sx={{ color: "text.secondary" }} />
//               </Tooltip>
//             </Typography>

//             <FormControl sx={{ mt: 1.5, minWidth: 240 }} size="small">
//               <Select
//                 value={rivileFraction}
//                 onChange={(e) => setRivileFraction(Number(e.target.value))}
//               >
//                 <MenuItem value={1}>1</MenuItem>
//                 <MenuItem value={10}>10</MenuItem>
//                 <MenuItem value={100}>100</MenuItem>
//                 <MenuItem value={1000}>1000</MenuItem>
//               </Select>
//             </FormControl>

//             {rivileSaved && (
//               <Alert severity="success" sx={{ mt: 1, py: 0.5 }}>
//                 Išsaugota!
//               </Alert>
//             )}
//           </Box>
//         )}        
//       </Paper>

//       {/* 4. Duomenų importas */}
//       <Box mb={3}>
//         <Typography variant="h6" gutterBottom>Duomenų importas</Typography>
//         <Tabs value={importTab} onChange={(_, v) => setImportTab(v)} sx={{ mb: 2 }}>
//           <Tab label="Prekės" /><Tab label="Įmonės" />
//         </Tabs>
//         {importTab === 0 && (
//           <ImportTab label="Importuoti prekes iš Excel" url="/data/import-products/" templateFileName="prekes_sablonas.xlsx" />
//         )}
//         {importTab === 1 && (
//           <ImportTab label="Importuoti įmones iš Excel" url="/data/import-clients/" templateFileName="imones_sablonas.xlsx" />
//         )}
//       </Box>

//       {/* 5. Defaults for sumiskai */}
//       <Paper sx={{ p: 3, mb: 3 }}>
//         <Box sx={{ display: "flex", alignItems: "center", gap: 0, mb: 2 }}>
//           <Typography variant="h6" sx={{ fontWeight: 600 }}>
//             Numatytosios reikšmės (skaitmenizuojant sumiškai)
//           </Typography>
//           {/* <Typography variant="subtitle1" sx={{ mr: 0 }}>
//             Numatytosios reikšmės (skaitmenizuojant sumiškai)
//           </Typography> */}
//           <Tooltip
//             title="Skaitmenizuojant sumiškai, bus automatiškai priskirtos jūsų nustatytos numatytosios reikšmės, jei sistema atpažins jūsų nustatytą įmonę kaip pirkėją arba pardavėją dokumente."
//             arrow enterTouchDelay={0} leaveTouchDelay={4000}
//           >
//             <IconButton size="small" aria-label="Informacija"><HelpOutlineIcon fontSize="small" /></IconButton>
//           </Tooltip>
//         </Box>

//         <FormControl component="fieldset" sx={{ mb: 2 }}>
//           <RadioGroup row value={defaultsMode} onChange={(_, v) => setDefaultsMode(v)} name="defaults-mode">
//             <FormControlLabel value="pirkimas" control={<Radio />} label="Pirkimas" />
//             <FormControlLabel value="pardavimas" control={<Radio />} label="Pardavimas" />
//           </RadioGroup>
//         </FormControl>

//         {defaultsMode === "pirkimas" ? (
//           <DefaultsFields
//             mode="pirkimas"
//             program={program}
//             state={purchaseDefaultsForm}
//             setState={setPurchaseDefaultsForm}
//             touched={touchedDefaults}
//           />
//         ) : (
//           <DefaultsFields
//             mode="pardavimas"
//             program={program}
//             state={salesDefaultsForm}
//             setState={setSalesDefaultsForm}
//             touched={touchedDefaults}
//           />
//         )}

//         <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
//           <Button variant="contained" onClick={saveDefaults} disabled={savingDefaults}>Išsaugoti</Button>
//           {successDefaults && <Alert severity="success">Išsaugota!</Alert>}
//           {errorDefaults && <Alert severity="error">{errorDefaults}</Alert>}
//         </Stack>

//         <Typography variant="subtitle2" sx={{ mt: 3 }}>
//           Išsaugoti profiliai ({defaultsMode === "pirkimas" ? "Pirkimas" : "Pardavimas"})
//         </Typography>
//         <DefaultsTable
//           rows={defaultsMode === "pirkimas" ? purchaseList : salesList}
//           onDelete={(idx) => deleteProfile(defaultsMode, idx)}
//         />
//       </Paper>

//       {/* 6. Automatinės taisyklės detalioms eilutėms */}

//       <Paper sx={{ p: 3, mt: 6 }}>
//         {/* Заголовок секции */}
//         <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
//           <Typography variant="h6" sx={{ fontWeight: 600 }}>
//             Numatytosios prekių reikšmės (skaitmenizuojant detaliai)
//           </Typography>
//           <Tooltip
//             title="Kai taisyklių sąlygos įvykdytos, sistema automatiškai priskiria prekės kodą ir tipą kiekvienai eilutei skaitmenizuojant detaliai"
//             arrow
//             enterTouchDelay={0}
//             leaveTouchDelay={4000}
//           >
//             <HelpOutlineIcon sx={{ fontSize: 20, color: "text.secondary" }} />
//           </Tooltip>
//         </Box>

//         {/* Forma создания правила */}
//         <Box
//           sx={{
//             border: "1px solid",
//             borderColor: "divider",
//             borderRadius: 2,
//             overflow: "hidden",
//             mb: 3,
//           }}
//         >
//           {/* Секция условий */}
//           <Box sx={{ p: 3, backgroundColor: "grey.50" }}>
//             <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
//               <Box
//                 sx={{
//                   width: 32,
//                   height: 32,
//                   borderRadius: 1,
//                   backgroundColor: "primary.main",
//                   display: "flex",
//                   alignItems: "center",
//                   justifyContent: "center",
//                   color: "white",
//                 }}
//               >
//                 🔍
//               </Box>
//               <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
//                 Taikymo sąlygos
//               </Typography>
//             </Box>

//             <Stack spacing={2.5}>
//               {/* PVM проценты */}
//               <Box>
//                 <FormControlLabel
//                   control={
//                     <Switch
//                       checked={ruleForm.vat_value !== "" && ruleForm.vat_value !== null && ruleForm.vat_value !== undefined}
//                       onChange={(e) => {
//                         if (e.target.checked) {
//                           setRuleForm((prev) => ({ ...prev, vat_value: "0" }));
//                         } else {
//                           setRuleForm((prev) => ({ ...prev, vat_value: "" }));
//                         }
//                       }}
//                       disabled={ruleForm.apply_to_all}
//                     />
//                   }
//                   label={
//                     <Typography variant="body2" sx={{ fontWeight: 500 }}>
//                       PVM procentas
//                     </Typography>
//                   }
//                 />
//                 {ruleForm.vat_value !== "" && ruleForm.vat_value !== null && ruleForm.vat_value !== undefined && !ruleForm.apply_to_all && (
//                   <Stack direction="row" spacing={1.5} sx={{ ml: 5, mt: 1.5 }}>
//                     <FormControl size="small" sx={{ minWidth: 90 }}>
//                       <Select
//                         value={ruleForm.vat_op}
//                         onChange={(e) =>
//                           setRuleForm((prev) => ({ ...prev, vat_op: e.target.value }))
//                         }
//                         sx={{ backgroundColor: "white" }}
//                       >
//                         <MenuItem value="<">&lt;</MenuItem>
//                         <MenuItem value="<=">&le;</MenuItem>
//                         <MenuItem value="=">=</MenuItem>
//                         <MenuItem value=">=">&ge;</MenuItem>
//                         <MenuItem value=">">&gt;</MenuItem>
//                       </Select>
//                     </FormControl>
//                     <TextField
//                       type="number"
//                       size="small"
//                       value={ruleForm.vat_value}
//                       onChange={(e) => {
//                         const val = e.target.value;
//                         if (val === "" || (Number.isInteger(Number(val)) && Number(val) >= 0 && Number(val) <= 100)) {
//                           setRuleForm((prev) => ({ ...prev, vat_value: val }));
//                         }
//                       }}
//                       sx={{ width: 120, backgroundColor: "white" }}
//                       InputProps={{ 
//                         endAdornment: <Typography variant="body2" sx={{ color: "text.secondary" }}>%</Typography>,
//                         inputProps: { min: 0, max: 100, step: 1 }
//                       }}
//                     />
//                   </Stack>
//                 )}
//               </Box>

//               {/* Название товара */}
//               <Box>
//                 <FormControlLabel
//                   control={
//                     <Switch
//                       checked={ruleForm.name_contains !== "" && ruleForm.name_contains !== null && ruleForm.name_contains !== undefined}
//                       onChange={(e) => {
//                         if (e.target.checked) {
//                           setRuleForm((prev) => ({ ...prev, name_contains: " " }));
//                         } else {
//                           setRuleForm((prev) => ({ ...prev, name_contains: "" }));
//                         }
//                       }}
//                       disabled={ruleForm.apply_to_all}
//                     />
//                   }
//                   label={
//                     <Typography variant="body2" sx={{ fontWeight: 500 }}>
//                       Pavadinimas turi frazę
//                     </Typography>
//                   }
//                 />
//                 {ruleForm.name_contains !== "" && ruleForm.name_contains !== null && ruleForm.name_contains !== undefined && !ruleForm.apply_to_all && (
//                   <TextField
//                     size="small"
//                     fullWidth
//                     value={ruleForm.name_contains}
//                     onChange={(e) =>
//                       setRuleForm((prev) => ({
//                         ...prev,
//                         name_contains: e.target.value,
//                       }))
//                     }
//                     sx={{ ml: 5, mt: 1.5, maxWidth: 400, backgroundColor: "white" }}
//                     placeholder="pvz.: paslaugos"
//                   />
//                 )}
//               </Box>

//               {/* Покупатель */}
//               <Box>
//                 <FormControlLabel
//                   control={
//                     <Switch
//                       checked={
//                         (ruleForm.buyer_id !== "" && ruleForm.buyer_id !== null && ruleForm.buyer_id !== undefined) ||
//                         (ruleForm.buyer_vat_code !== "" && ruleForm.buyer_vat_code !== null && ruleForm.buyer_vat_code !== undefined)
//                       }
//                       onChange={(e) => {
//                         if (e.target.checked) {
//                           setRuleForm((prev) => ({
//                             ...prev,
//                             buyer_id: " ",
//                             buyer_vat_code: "",
//                           }));
//                         } else {
//                           setRuleForm((prev) => ({
//                             ...prev,
//                             buyer_id: "",
//                             buyer_vat_code: "",
//                           }));
//                         }
//                       }}
//                       disabled={ruleForm.apply_to_all}
//                     />
//                   }
//                   label={
//                     <Typography variant="body2" sx={{ fontWeight: 500 }}>
//                       Pirkėjas
//                     </Typography>
//                   }
//                 />
//                 {((ruleForm.buyer_id !== "" && ruleForm.buyer_id !== null) || 
//                   (ruleForm.buyer_vat_code !== "" && ruleForm.buyer_vat_code !== null)) && !ruleForm.apply_to_all && (
//                   <Stack direction="row" spacing={1.5} sx={{ ml: 5, mt: 1.5 }}>
//                     <TextField
//                       label="Įmonės kodas"
//                       size="small"
//                       value={ruleForm.buyer_id.trim()}
//                       onChange={(e) =>
//                         setRuleForm((prev) => ({ ...prev, buyer_id: e.target.value }))
//                       }
//                       sx={{ width: 200, backgroundColor: "white" }}
//                     />
//                     <TextField
//                       label="PVM kodas"
//                       size="small"
//                       value={ruleForm.buyer_vat_code}
//                       onChange={(e) =>
//                         setRuleForm((prev) => ({
//                           ...prev,
//                           buyer_vat_code: e.target.value,
//                         }))
//                       }
//                       sx={{ width: 200, backgroundColor: "white" }}
//                     />
//                   </Stack>
//                 )}
//               </Box>

//               {/* Продавец */}
//               <Box>
//                 <FormControlLabel
//                   control={
//                     <Switch
//                       checked={
//                         (ruleForm.seller_id !== "" && ruleForm.seller_id !== null && ruleForm.seller_id !== undefined) ||
//                         (ruleForm.seller_vat_code !== "" && ruleForm.seller_vat_code !== null && ruleForm.seller_vat_code !== undefined)
//                       }
//                       onChange={(e) => {
//                         if (e.target.checked) {
//                           setRuleForm((prev) => ({
//                             ...prev,
//                             seller_id: " ",
//                             seller_vat_code: "",
//                           }));
//                         } else {
//                           setRuleForm((prev) => ({
//                             ...prev,
//                             seller_id: "",
//                             seller_vat_code: "",
//                           }));
//                         }
//                       }}
//                       disabled={ruleForm.apply_to_all}
//                     />
//                   }
//                   label={
//                     <Typography variant="body2" sx={{ fontWeight: 500 }}>
//                       Pardavėjas
//                     </Typography>
//                   }
//                 />
//                 {((ruleForm.seller_id !== "" && ruleForm.seller_id !== null) || 
//                   (ruleForm.seller_vat_code !== "" && ruleForm.seller_vat_code !== null)) && !ruleForm.apply_to_all && (
//                   <Stack direction="row" spacing={1.5} sx={{ ml: 5, mt: 1.5 }}>
//                     <TextField
//                       label="Įmonės kodas"
//                       size="small"
//                       value={ruleForm.seller_id.trim()}
//                       onChange={(e) =>
//                         setRuleForm((prev) => ({
//                           ...prev,
//                           seller_id: e.target.value,
//                         }))
//                       }
//                       sx={{ width: 200, backgroundColor: "white" }}
//                     />
//                     <TextField
//                       label="PVM kodas"
//                       size="small"
//                       value={ruleForm.seller_vat_code}
//                       onChange={(e) =>
//                         setRuleForm((prev) => ({
//                           ...prev,
//                           seller_vat_code: e.target.value,
//                         }))
//                       }
//                       sx={{ width: 200, backgroundColor: "white" }}
//                     />
//                   </Stack>
//                 )}
//               </Box>

//               {/* Разделитель */}
//               <Box sx={{ borderTop: "1px solid", borderColor: "divider", my: 1 }} />

//               {/* Всем остальным строкам */}
//               <Box>
//                 <FormControlLabel
//                   control={
//                     <Switch
//                       checked={ruleForm.apply_to_all}
//                       onChange={(e) => {
//                         const checked = e.target.checked;
//                         setRuleForm((prev) => ({
//                           ...prev,
//                           apply_to_all: checked,
//                           ...(checked && {
//                             vat_value: "",
//                             name_contains: "",
//                             buyer_id: "",
//                             buyer_vat_code: "",
//                             seller_id: "",
//                             seller_vat_code: "",
//                           })
//                         }));
//                       }}
//                     />
//                   }
//                   label={
//                     <Box>
//                       <Typography variant="body2" sx={{ fontWeight: 600, color: "primary.main" }}>
//                         Taikyti visoms kitoms eilutėms
//                       </Typography>
//                       <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
//                         Numatytoji taisyklė, jei kitos netiko
//                       </Typography>
//                     </Box>
//                   }
//                 />
//               </Box>
//             </Stack>
//           </Box>

//           {/* Секция действий */}
//           <Box sx={{ p: 3, backgroundColor: "white" }}>
//             <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
//               <Box
//                 sx={{
//                   width: 32,
//                   height: 32,
//                   borderRadius: 1,
//                   backgroundColor: "success.main",
//                   display: "flex",
//                   alignItems: "center",
//                   justifyContent: "center",
//                   color: "white",
//                 }}
//               >
//                 ✓
//               </Box>
//               <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
//                 Taikyti reikšmes
//               </Typography>
//             </Box>

//             <Stack direction="row" spacing={2}>
//               <TextField
//                 label="Prekės kodas"
//                 size="small"
//                 value={ruleForm.result_kodas}
//                 onChange={(e) =>
//                   setRuleForm((prev) => ({
//                     ...prev,
//                     result_kodas: e.target.value,
//                   }))
//                 }
//                 sx={{ width: 220 }}
//                 required
//                 placeholder="Įveskite kodą"
//               />

//               <FormControl size="small" sx={{ width: 220 }} required>
//                 <InputLabel>Tipas</InputLabel>
//                 <Select
//                   label="Tipas"
//                   value={ruleForm.result_tipas}
//                   onChange={(e) =>
//                     setRuleForm((prev) => ({
//                       ...prev,
//                       result_tipas: e.target.value,
//                       // jei perjungiam nuo Kodas – išvalom „kaip“
//                       ...(e.target.value !== "Kodas" && { result_kodas_kaip: "" }),
//                     }))
//                   }
//                 >
//                   <MenuItem value="Prekė">Prekė</MenuItem>
//                   <MenuItem value="Paslauga">Paslauga</MenuItem>
//                   {program === "rivile" && (
//                     <MenuItem value="Kodas">Kodas</MenuItem>
//                   )}
//                 </Select>
//               </FormControl>
//             </Stack>
//             <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
//               <TextField
//                 label="Pavadinimas"
//                 size="small"
//                 value={ruleForm.result_pavadinimas}
//                 onChange={(e) =>
//                   setRuleForm((prev) => ({
//                     ...prev,
//                     result_pavadinimas: e.target.value,
//                   }))
//                 }
//                 sx={{ width: 320 }}
//               />

//               <TextField
//                 label="Barkodas"
//                 size="small"
//                 value={ruleForm.result_barkodas}
//                 onChange={(e) =>
//                   setRuleForm((prev) => ({
//                     ...prev,
//                     result_barkodas: e.target.value,
//                   }))
//                 }
//                 sx={{ width: 220 }}
//               />
//             </Stack>

//             {/* Papildomas dropdown tik Rivilė + Kodas */}
//             {program === "rivile" && ruleForm.result_tipas === "Kodas" && (
//               <FormControl
//                 size="small"
//                 sx={{ width: 260, mt: 2 }}
//                 required
//               >
//                 <InputLabel>Nustatyti PVM klasifikatorių kaip</InputLabel>
//                 <Select
//                   label="Nustatyti PVM klasifikatorių kaip"
//                   value={ruleForm.result_kodas_kaip || ""}
//                   onChange={(e) =>
//                     setRuleForm((prev) => ({
//                       ...prev,
//                       result_kodas_kaip: e.target.value,
//                     }))
//                   }
//                 >
//                   <MenuItem value="Prekei">Prekei</MenuItem>
//                   <MenuItem value="Paslaugai">Paslaugai</MenuItem>
//                 </Select>
//               </FormControl>
//             )}

//             <Box sx={{ mt: 2.5 }}>
//               <FormControlLabel
//                 control={
//                   <Switch
//                     checked={ruleForm.enabled}
//                     onChange={(e) =>
//                       setRuleForm((prev) => ({
//                         ...prev,
//                         enabled: e.target.checked,
//                       }))
//                     }
//                   />
//                 }
//                 label={
//                   <Typography variant="body2" sx={{ fontWeight: 500 }}>
//                     Taisyklė aktyvi
//                   </Typography>
//                 }
//               />
//             </Box>

//             <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
//               <Button
//                 variant="contained"
//                 onClick={saveLineitemRule}
//                 disabled={savingRules}
//                 size="large"
//                 sx={{ px: 3 }}
//               >
//                 {ruleForm.id ? "Atnaujinti taisyklę" : "Išsaugoti taisyklę"}
//               </Button>
//               <Button
//                 variant="outlined"
//                 onClick={() =>
//                   setRuleForm({
//                     id: null,
//                     enabled: true,
//                     vat_op: "=",
//                     vat_value: "",
//                     name_contains: "",
//                     buyer_id: "",
//                     buyer_vat_code: "",
//                     seller_id: "",
//                     seller_vat_code: "",
//                     apply_to_all: false,
//                     result_kodas: "",
//                     result_tipas: "Prekė",
//                     result_kodas_kaip: "",
//                     result_pavadinimas: "",
//                     result_barkodas: "",
//                   })
//                 }
//                 size="large"
//               >
//                 Išvalyti
//               </Button>
//             </Stack>
//             {rulesError && (
//               <Alert severity="error" sx={{ mt: 2 }}>
//                 {rulesError}
//               </Alert>
//             )}
//             {rulesSuccess && (
//               <Alert severity="success" sx={{ mt: 2 }}>
//                 Išsaugota!
//               </Alert>
//             )}
//           </Box>
//         </Box>

//         {/* Список сохраненных правил */}
//         <Box>
//           <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 7, mb: 2 }}>
//             <Typography variant="h6" sx={{ fontWeight: 400, fontSize: 18 }}>
//               Išsaugotos taisyklės
//             </Typography>
//             <Chip 
//               label={lineitemRules?.length || 0} 
//               size="small" 
//               sx={{ fontWeight: 600 }}
//             />
//           </Box>

//           {lineitemRules && lineitemRules.length > 0 ? (
//             <Stack spacing={2}>
//               {lineitemRules.map((r, idx) => (
//                 <Box
//                   key={r.id || idx}
//                   sx={{
//                     border: "2px solid",
//                     borderColor: r.enabled ? "success.main" : "grey.300",
//                     borderRadius: 2,
//                     overflow: "hidden",
//                     transition: "all 0.2s",
//                     "&:hover": {
//                       boxShadow: 2,
//                     },
//                   }}
//                 >
//                   <Box
//                     sx={{
//                       display: "flex",
//                       alignItems: "center",
//                       justifyContent: "space-between",
//                       p: 2,
//                       backgroundColor: r.enabled ? "success.50" : "grey.50",
//                     }}
//                   >
//                     <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
//                       <Chip
//                         label={`#${idx + 1}`}
//                         size="small"
//                         sx={{
//                           fontWeight: 600,
//                           backgroundColor: r.enabled ? "success.main" : "grey.400",
//                           color: "white",
//                         }}
//                       />
//                       <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
//                         {r.enabled ? "Aktyvi" : "Išjungta"}
//                       </Typography>
//                     </Box>

//                     <Stack direction="row" spacing={1}>
//                       <IconButton
//                         size="small"
//                         onClick={() =>
//                           setRuleForm({
//                             id: r.id || null,
//                             enabled: r.enabled !== false,
//                             vat_op: r.vat_percent?.op || "=",
//                             vat_value:
//                               r.vat_percent && r.vat_percent.value != null
//                                 ? String(r.vat_percent.value)
//                                 : "",
//                             name_contains: r.name_contains || "",
//                             buyer_id: r.buyer_id || "",
//                             buyer_vat_code: r.buyer_vat_code || "",
//                             seller_id: r.seller_id || "",
//                             seller_vat_code: r.seller_vat_code || "",
//                             apply_to_all: r.apply_to_all || false,
//                             result_kodas: r.result_kodas || "",
//                             result_tipas: r.result_tipas || "Prekė",
//                             result_kodas_kaip: r.result_kodas_kaip || "",
//                             result_pavadinimas: r.result_pavadinimas || "",
//                             result_barkodas: r.result_barkodas || "",
//                           })
//                         }
//                         sx={{
//                           backgroundColor: "white",
//                           "&:hover": { backgroundColor: "grey.100" },
//                         }}
//                       >
//                         <EditIcon fontSize="small" color="primary" />
//                       </IconButton>
//                       <IconButton
//                         size="small"
//                         onClick={() => deleteLineitemRule(r.id)}
//                         sx={{
//                           backgroundColor: "white",
//                           "&:hover": { backgroundColor: "error.50" },
//                         }}
//                       >
//                         <DeleteOutlineIcon fontSize="small" color="error" />
//                       </IconButton>
//                     </Stack>
//                   </Box>

//                   <Box sx={{ p: 2, backgroundColor: "white" }}>
//                     <Grid2 container spacing={3}>
//                       <Grid2 size={{ xs: 12, md: 6 }}>
//                         <Typography
//                           variant="caption"
//                           sx={{
//                             color: "text.secondary",
//                             textTransform: "uppercase",
//                             fontWeight: 600,
//                             letterSpacing: 0.5,
//                           }}
//                         >
//                           Sąlygos
//                         </Typography>
//                         <Box sx={{ mt: 1 }}>
//                           {r.apply_to_all ? (
//                             <Chip
//                               label="Visos kitos eilutės"
//                               color="primary"
//                               size="small"
//                               sx={{ fontWeight: 500 }}
//                             />
//                           ) : (
//                             <Stack spacing={0.5}>
//                               {r.vat_percent && (
//                                 <Typography variant="body2">
//                                   • PVM {r.vat_percent.op} {r.vat_percent.value}%
//                                 </Typography>
//                               )}
//                               {r.name_contains && (
//                                 <Typography variant="body2">
//                                   • Pavadinimas: "{r.name_contains}"
//                                 </Typography>
//                               )}
//                               {(r.buyer_id || r.buyer_vat_code) && (
//                                 <Typography variant="body2">
//                                   • Pirkėjas: {[r.buyer_id, r.buyer_vat_code].filter(Boolean).join(", ")}
//                                 </Typography>
//                               )}
//                               {(r.seller_id || r.seller_vat_code) && (
//                                 <Typography variant="body2">
//                                   • Pardavėjas: {[r.seller_id, r.seller_vat_code].filter(Boolean).join(", ")}
//                                 </Typography>
//                               )}
//                               {!r.vat_percent &&
//                                 !r.name_contains &&
//                                 !r.buyer_id &&
//                                 !r.buyer_vat_code &&
//                                 !r.seller_id &&
//                                 !r.seller_vat_code && (
//                                   <Typography variant="body2" color="text.secondary">
//                                     • Visos eilutės
//                                   </Typography>
//                                 )}
//                             </Stack>
//                           )}
//                         </Box>
//                       </Grid2>

//                       <Grid2 size={{ xs: 12, md: 6 }}>
//                         <Typography
//                           variant="caption"
//                           sx={{
//                             color: "text.secondary",
//                             textTransform: "uppercase",
//                             fontWeight: 600,
//                             letterSpacing: 0.5,
//                           }}
//                         >
//                           Taikyti
//                         </Typography>
//                         <Box sx={{ mt: 1 }}>
//                           <Stack spacing={0.5}>

//                             {r.result_pavadinimas && (
//                               <Typography variant="body2">
//                                 <strong>Pavadinimas:</strong> {r.result_pavadinimas}
//                               </Typography>
//                             )}

//                             <Typography variant="body2">
//                               <strong>Kodas:</strong> {r.result_kodas}
//                             </Typography>

//                             {r.result_barkodas && (
//                               <Typography variant="body2">
//                                 <strong>Barkodas:</strong> {r.result_barkodas}
//                               </Typography>
//                             )}

//                             <Typography variant="body2">
//                               <strong>Tipas:</strong>{" "}
//                               {r.result_tipas === "Kodas" && r.result_kodas_kaip
//                                 ? `Kodas (${r.result_kodas_kaip})`
//                                 : (r.result_tipas || "Prekė")}
//                             </Typography>

//                           </Stack>
//                         </Box>
//                       </Grid2>
//                     </Grid2>
//                   </Box>
//                 </Box>
//               ))}
//             </Stack>
//           ) : (
//             <Box
//               sx={{
//                 textAlign: "center",
//                 py: 6,
//                 border: "2px dashed",
//                 borderColor: "divider",
//                 borderRadius: 2,
//                 backgroundColor: "grey.50",
//               }}
//             >
//               <Typography variant="body2" sx={{ color: "text.secondary" }}>
//                 Nėra išsaugotų taisyklių
//               </Typography>
//               <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
//                 Sukurkite pirmąją taisyklę aukščiau
//               </Typography>
//             </Box>
//           )}
//         </Box>
//       </Paper>
//     </Box>
//   );
// }












// import React, { useEffect, useState } from "react";
// import {
//   Box, Typography, FormControl, InputLabel, Select, MenuItem,
//   Button, Alert, Tabs, Tab, Paper, TextField, Stack, RadioGroup,
//   FormControlLabel, Radio, IconButton, Tooltip, Switch, Table, TableContainer,
//   TableHead, TableRow, TableCell, TableBody, Grid2
// } from "@mui/material";
// import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
// import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
// import Autocomplete from "@mui/material/Autocomplete";
// import { api } from "../api/endpoints"; // поправь путь jei reikia
// import { COUNTRY_OPTIONS } from "../page_elements/Countries";
// import { ACCOUNTING_PROGRAMS } from "../page_elements/AccountingPrograms";
// import { Helmet } from "react-helmet";

// /** ===== PVM copy text (tab-separated), for Apskaita5 button ===== */
// const PVM_COPY_TEXT = [
//   "PVM1\t21% — Pirkimas, Pardavimas — Prekė, Paslauga",
//   "PVM2\t9% — Pirkimas, Pardavimas — Prekė, Paslauga",
//   "PVM3\t5% — Pirkimas, Pardavimas — Prekė, Paslauga",
//   "PVM49\t6% — Pirkimas, Pardavimas — Prekė, Paslauga",
//   "PVM5\t0% — Pirkimas, Pardavimas — Prekė, Paslauga",
//   "PVM12\t0% — Pirkimas, Pardavimas — Prekė",
//   "PVM13\t0% — Pirkimas, Pardavimas — Prekė",
//   "PVM14\t0% — Pirkimas, Pardavimas — Paslauga",
//   "PVM21\t0% — Pirkimas, Pardavimas — Paslauga",
// ].join("\n");

// /** ===== Reusable: import tab for XLSX ===== */
// function ImportTab({ label, url, templateFileName }) {
//   const [file, setFile] = useState(null);
//   const [result, setResult] = useState(null);
//   const [error,   setError] = useState(null);
//   const inputRef  = React.useRef(null);

//   const handleFile = (e) => {
//     setFile(e.target.files[0] || null);
//     setResult(null);
//     setError(null);
//   };

//   const handleImport = async () => {
//     if (!file) return;
//     const formData = new FormData();
//     formData.append("file", file);
//     try {
//       const { data } = await api.post(url, formData, {
//         withCredentials: true,
//         headers: { "Content-Type": "multipart/form-data" },
//       });
//       if (data?.error) {
//         setError(data.error);
//         setResult({ imported: 0, processed: 0 });
//       } else {
//         setResult({
//           imported: Number(data?.imported) || 0,
//           processed: Number(data?.processed) || 0,
//         });
//         setError(null);
//       }
//     } catch (err) {
//       setError(err?.response?.data?.error || "Importo klaida");
//       setResult({ imported: 0, processed: 0 });
//     } finally {
//       if (inputRef.current) inputRef.current.value = "";
//       setFile(null);
//     }
//   };

//   const handleDownloadTemplate = () =>
//     window.open(`/templates/${templateFileName || "imones_sablonas.xlsx"}`, "_blank");

//   return (
//     <Paper sx={{ p: 2, mb: 2 }}>
//       <Typography gutterBottom variant="subtitle1">{label}</Typography>

//       <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
//         <Button variant="outlined" component="label">
//           Pasirinkite failą
//           <input type="file" accept=".xlsx" hidden ref={inputRef} onChange={handleFile} />
//         </Button>
//         <Typography variant="body2">
//           {file ? file.name : "Niekas nepasirinkta"}
//         </Typography>
//       </Stack>

//       <Button variant="contained" disabled={!file} onClick={handleImport}>Importuoti</Button>
//       <Button variant="outlined" size="small" sx={{ ml: 2 }} onClick={handleDownloadTemplate}>
//         Atsisiųsti Excel šabloną
//       </Button>

//       {result && (
//         <Alert severity="success" sx={{ mt: 2 }}>
//           Importuota įrašų: {result?.imported ?? 0} iš {result?.processed ?? 0}
//         </Alert>
//       )}
//       {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
//     </Paper>
//   );
// }

// /** ===== Defaults fieldset (with company fields) ===== */
// // const DefaultsFields = React.memo(function DefaultsFields({ mode, state, setState, touched }) {
// //   const isPurchase = mode === "pirkimas";

// const DefaultsFields = React.memo(function DefaultsFields({ mode, program, state, setState, touched }) {
//   const isPurchase = mode === "pirkimas";
//   const showKodas = program === "rivile"; // 👈 показываем "Kodas" только для Rivilė

//   // если "Kodas" выбран, а программа больше не Rivilė — откат на "Prekė"
//   React.useEffect(() => {
//     if (!showKodas && String(state.tipas || "").toLowerCase() === "kodas") {
//       setState((prev) => ({ ...prev, tipas: "Prekė", kodas_kaip: "" }));
//     }
//   }, [showKodas, state.tipas, setState]);

//   const labels = React.useMemo(
//     () =>
//       isPurchase
//         ? {
//             title: "Pirkimas",
//             imones_pavadinimas: "Įmonės pavadinimas",
//             imones_kodas: "Įmonės kodas",
//             imones_pvm_kodas: "Įmonės PVM kodas",
//             pavadinimas: "Išlaidos pavadinimas",
//             kodas: "Išlaidos kodas",
//             barkodas: "Išlaidos barkodas",
//             tipas: "Išlaidos tipas",
//           }
//         : {
//             title: "Pardavimas",
//             imones_pavadinimas: "Įmonės pavadinimas",
//             imones_kodas: "Įmonės kodas",
//             imones_pvm_kodas: "Įmonės PVM kodas",
//             pavadinimas: "Pajamų pavadinimas",
//             kodas: "Pajamų kodas",
//             barkodas: "Pajamų barkodas",
//             tipas: "Pajamų tipas",
//           },
//     [isPurchase]
//   );

//   const onChangeField = (field) => (e) =>
//     setState((prev) => ({ ...prev, [field]: e.target.value }));

//   const isKodas = String(state.tipas || "").toLowerCase() === "kodas";

//   return (
//     <Stack spacing={2} direction="column">
//       {/* Company match fields */}
//       <TextField
//         label={labels.imones_pavadinimas}
//         value={state.imones_pavadinimas}
//         onChange={onChangeField("imones_pavadinimas")}
//         fullWidth
//       />
//       <TextField
//         label={labels.imones_kodas}
//         value={state.imones_kodas}
//         onChange={onChangeField("imones_kodas")}
//         fullWidth
//         required
//         error={touched && !state.imones_kodas?.trim()}
//         helperText={touched && !state.imones_kodas?.trim() ? "Privalomas laukas" : ""}
//       />
//       <TextField
//         label={labels.imones_pvm_kodas}
//         value={state.imones_pvm_kodas}
//         onChange={onChangeField("imones_pvm_kodas")}
//         fullWidth
//       />

//       {/* Product/service defaults */}
//       <TextField
//         label={labels.pavadinimas}
//         value={state.pavadinimas}
//         onChange={onChangeField("pavadinimas")}
//         fullWidth
//         required
//         error={touched && !state.pavadinimas?.trim()}
//         helperText={touched && !state.pavadinimas?.trim() ? "Privalomas laukas" : ""}
//       />
//       <TextField
//         label={labels.kodas}
//         value={state.kodas}
//         onChange={onChangeField("kodas")}
//         fullWidth
//         required
//         error={touched && !state.kodas?.trim()}
//         helperText={touched && !state.kodas?.trim() ? "Privalomas laukas" : ""}
//       />
//       <TextField
//         label={labels.barkodas}
//         value={state.barkodas}
//         onChange={onChangeField("barkodas")}
//         fullWidth
//       />
//       <FormControl fullWidth required error={touched && !state.tipas}>
//         <InputLabel>{labels.tipas}</InputLabel>
//         <Select
//           label={labels.tipas}
//           value={state.tipas}
//           onChange={(e) => setState((prev) => ({ ...prev, tipas: e.target.value }))}
//         >
//           <MenuItem value="Prekė">Prekė</MenuItem>
//           <MenuItem value="Paslauga">Paslauga</MenuItem>
//           {/* <MenuItem value="Kodas">Kodas</MenuItem> */}
//           {showKodas && <MenuItem value="Kodas">Kodas</MenuItem>} {/* 👈 условно */}
//         </Select>
//       </FormControl>

//       {/* Появляется только если выбран "Kodas" */}
//       {isKodas && (
//         <FormControl
//           fullWidth
//           required
//           error={touched && !state.kodas_kaip}
//           sx={{ mt: 1 }}
//         >
//           <InputLabel>Nustatyti PVM klasifikatorių kaip</InputLabel>
//           <Select
//             label="Nustatyti PVM klasifikatorių kaip"
//             value={state.kodas_kaip || ""}
//             onChange={(e) => setState((prev) => ({ ...prev, kodas_kaip: e.target.value }))}
//           >
//             <MenuItem value="Prekei">Prekei</MenuItem>
//             <MenuItem value="Paslaugai">Paslaugai</MenuItem>
//           </Select>
//         </FormControl>
//       )}
//     </Stack>
//   );
// });

// /** ===== Table of saved defaults with delete ===== */
// function DefaultsTable({ rows, onDelete }) {
//   if (!rows?.length) {
//     return (
//       <Typography variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
//         Nėra išsaugotų profilių.
//       </Typography>
//     );
//   }

//   const tipasLabel = (t) => {
//     const s = String(t).toLowerCase();
//     if (t === 2 || s === "paslauga") return "Paslauga";
//     if (t === 3) return "Kodas (Prekei)";
//     if (t === 4) return "Kodas (Paslaugai)";
//     if (s === "kodas") return "Kodas";
//     return "Prekė";
//   };

//   return (
//     <TableContainer sx={{ mt: 2, overflowX: "auto" }}>
//       <Table size="small" stickyHeader sx={{ minWidth: 900 }}>
//         <TableHead>
//           <TableRow>
//             <TableCell>#</TableCell>
//             <TableCell>Įmonės pavadinimas</TableCell>
//             <TableCell>Įmonės kodas</TableCell>
//             <TableCell>PVM kodas</TableCell>
//             <TableCell>Pavadinimas</TableCell>
//             <TableCell>Kodas</TableCell>
//             <TableCell>Barkodas</TableCell>
//             <TableCell>Tipas</TableCell>
//             <TableCell align="right">Veiksmai</TableCell>
//           </TableRow>
//         </TableHead>
//         <TableBody>
//           {rows.map((r, idx) => (
//             <TableRow key={idx}>
//               <TableCell sx={{ whiteSpace: "nowrap" }}>{idx}</TableCell>
//               <TableCell>{r.imones_pavadinimas || "—"}</TableCell>
//               <TableCell>{r.imones_kodas || "—"}</TableCell>
//               <TableCell>{r.imones_pvm_kodas || "—"}</TableCell>
//               <TableCell>{r.pavadinimas || "—"}</TableCell>
//               <TableCell>{r.kodas || "—"}</TableCell>
//               <TableCell>{r.barkodas || "—"}</TableCell>
//               <TableCell>{tipasLabel(r.tipas)}</TableCell>
//               <TableCell align="right">
//                 <IconButton color="error" size="small" onClick={() => onDelete(idx)} aria-label="Ištrinti">
//                   <DeleteOutlineIcon fontSize="small" />
//                 </IconButton>
//               </TableCell>
//             </TableRow>
//           ))}
//         </TableBody>
//       </Table>
//     </TableContainer>
//   );
// }

// export default function NustatymaiPage() {
//   const [user, setUser] = useState(null);
//   const [program, setProgram] = useState("");
//   const [saving, setSaving] = useState(false);
//   const [success, setSuccess] = useState(false);
//   const [rivileSaved, setRivileSaved] = useState(false);


//   // Company details
//   const [companyName, setCompanyName] = useState("");
//   const [companyNameTouched, setCompanyNameTouched] = useState(false);
//   const [companyCode, setCompanyCode] = useState("");
//   const [vatCode, setVatCode] = useState("");
//   const [companyIban, setCompanyIban] = useState("");
//   const [companyAddress, setCompanyAddress] = useState("");
//   const [companyCountryIso, setCompanyCountryIso] = useState("LT");
//   const [savingCompany, setSavingCompany] = useState(false);
//   const [successCompany, setSuccessCompany] = useState(false);
//   const [companyError, setCompanyError] = useState("");

//   // Import tabs
//   const [importTab, setImportTab] = useState(0);

//   // === Defaults state (sumiskai) ===
//   const [defaultsMode, setDefaultsMode] = useState("pirkimas"); // 'pirkimas' | 'pardavimas'
//   const [purchaseDefaultsForm, setPurchaseDefaultsForm] = useState({
//     imones_pavadinimas: "",
//     imones_kodas: "",
//     imones_pvm_kodas: "",
//     pavadinimas: "",
//     kodas: "",
//     barkodas: "",
//     tipas: "Prekė",
//     kodas_kaip: "", // "Prekei" | "Paslaugai"
//   });
//   const [salesDefaultsForm, setSalesDefaultsForm] = useState({
//     imones_pavadinimas: "",
//     imones_kodas: "",
//     imones_pvm_kodas: "",
//     pavadinimas: "",
//     kodas: "",
//     barkodas: "",
//     tipas: "Prekė",
//     kodas_kaip: "", // "Prekei" | "Paslaugai"
//   });

//   // === Lineitem rules (detaliai) ===
//   const [lineitemRules, setLineitemRules] = useState([]);
//   const [ruleForm, setRuleForm] = useState({
//     id: null,
//     enabled: true,
//     vat_op: "=",
//     vat_value: "",
//     name_contains: "",
//     buyer_id: "",
//     buyer_vat_code: "",
//     seller_id: "",
//     seller_vat_code: "",
//     result_kodas: "",
//     result_tipas: "Prekė", // Prekė / Paslauga / kodas_prekei / kodas_paslaugai
//     stop_after_match: true,
//   });
//   const [savingRules, setSavingRules] = useState(false);

//   // Списки профилей (мульти-компания)
//   const [purchaseList, setPurchaseList] = useState([]); // array of profiles
//   const [salesList, setSalesList] = useState([]);       // array of profiles

//   const [savingDefaults, setSavingDefaults] = useState(false);
//   const [successDefaults, setSuccessDefaults] = useState(false);
//   const [errorDefaults, setErrorDefaults] = useState("");

//   // === NEW: Kelių įmonių režimas ===
//   const [viewMode, setViewMode] = useState("single"); // "single" | "multi"
//   const [savingViewMode, setSavingViewMode] = useState(false);

//   // Papildomi nustatymai (флаг-ключи)
//   const [extraSettings, setExtraSettings] = useState({}); // dict of flags-keys

//   // NEW: валидатор-подсветка для defaults формы
//   const [touchedDefaults, setTouchedDefaults] = useState(false);

//   // NEW: Copy-to-clipboard success flag + handler
//   const [copiedPvm, setCopiedPvm] = useState(false);
//   const handleCopyPvm = async () => {
//     try {
//       await navigator.clipboard.writeText(PVM_COPY_TEXT);
//       setCopiedPvm(true);
//       setTimeout(() => setCopiedPvm(false), 2000);
//     } catch {
//       alert("Nepavyko nukopijuoti į iškarpinę.");
//     }
//   };

//   const tipasToNum = (t, kodasKaip) => {
//     const v = (t || "").toString().trim().toLowerCase();
//     if (v === "paslauga") return 2; // Paslauga
//     if (v === "kodas") {
//       const kk = (kodasKaip || "").toString().trim().toLowerCase();
//       // Kodas + Paslaugai => 4, иначе (Prekei) => 3
//       if (kk.startsWith("paslaug")) return 4;
//       return 3;
//     }
//     return 1; // Prekė
//   };

//   useEffect(() => {
//     api.get("/profile/", { withCredentials: true }).then(({ data }) => {
//       setUser(data);
//       setProgram(data.default_accounting_program || "");

//       setCompanyName(data.company_name || "");
//       setCompanyCode(data.company_code || "");
//       setVatCode(data.vat_code || "");
//       setCompanyIban(data.company_iban || "");
//       setCompanyAddress(data.company_address || "");
//       setCompanyCountryIso(data.company_country_iso || "LT");

//       // NEW: списки профилей (back-compat: dict -> [dict])
//       const pdList = Array.isArray(data.purchase_defaults)
//         ? data.purchase_defaults
//         : data.purchase_defaults
//         ? [data.purchase_defaults]
//         : [];
//       const sdList = Array.isArray(data.sales_defaults)
//         ? data.sales_defaults
//         : data.sales_defaults
//         ? [data.sales_defaults]
//         : [];
//       setPurchaseList(pdList);
//       setSalesList(sdList);

//       setViewMode(data.view_mode || "single");
//       setExtraSettings(data.extra_settings || {});

//       // NEW: lineitem_rules (detaliai taisyklės)
//       const lrList = Array.isArray(data.lineitem_rules)
//         ? data.lineitem_rules
//         : data.lineitem_rules
//         ? [data.lineitem_rules]
//         : [];
//       setLineitemRules(lrList);
//     });
//   }, []);


//   // сбрасывать подсветку при смене режима
//   useEffect(() => {
//     setTouchedDefaults(false);
//     setErrorDefaults("");
//   }, [defaultsMode]);

//   const handleChange = (e) => setProgram(e.target.value);

//   const save = async () => {
//     setSaving(true);
//     try {
//       await api.patch("/profile/", { default_accounting_program: program }, { withCredentials: true });
//       setSuccess(true);
//       setTimeout(() => setSuccess(false), 2000);
//     } finally {
//       setSaving(false);
//     }
//   };

//   const saveCompanyDetails = async () => {
//     setSavingCompany(true);
//     setCompanyError("");

//     // включаем подсветку всех требуемых полей
//     setCompanyNameTouched(true);
//     const missingName    = !companyName || !companyName.trim();
//     const missingCode    = !companyCode || !companyCode.trim();
//     const missingCountry = !companyCountryIso;

//     if (missingName || missingCode || missingCountry) {
//       setCompanyError("„Įmonės pavadinimas“, „Įmonės kodas“ ir „Įmonės šalis“ yra privalomi.");
//       setSavingCompany(false);
//       return;
//     }

//     try {
//       await api.patch(
//         "/profile/",
//         {
//           company_name: companyName,
//           company_code: companyCode,
//           vat_code: vatCode,
//           company_iban: companyIban,
//           company_address: companyAddress,
//           company_country_iso: companyCountryIso,
//         },
//         { withCredentials: true }
//       );
//       setSuccessCompany(true);
//       setTimeout(() => setSuccessCompany(false), 2000);
//     } finally {
//       setSavingCompany(false);
//     }
//   };

//   // optimistic merge helper for lists
//   const mergeProfileIntoList = (list, item) => {
//     const norm = (s) => (s || "").toString().trim().toUpperCase();
//     const key = (x) => [norm(x.imones_kodas), norm(x.imones_pvm_kodas), norm(x.imones_pavadinimas)].join("|");
//     const k = key(item);
//     const idx = list.findIndex((x) => key(x) === k && k !== "||");
//     if (idx >= 0) {
//       const next = [...list];
//       next[idx] = { ...next[idx], ...item };
//       return next;
//     }
//     return [...list, item];
//   };

//   const saveDefaults = async () => {
//     setSavingDefaults(true);
//     setErrorDefaults("");
//     setTouchedDefaults(true); // включаем подсветку на форме defaults

//     try {
//       const form = defaultsMode === "pirkimas" ? purchaseDefaultsForm : salesDefaultsForm;

//       // обязательные: įmonės kodas, pavadinimas, kodas, tipas
//       if (!form.imones_kodas?.trim() || !form.pavadinimas?.trim() || !form.kodas?.trim() || !form.tipas) {
//         setErrorDefaults("„Įmonės kodas“, „Pavadinimas“, „Kodas“ ir „Tipas“ yra privalomi.");
//         setSavingDefaults(false);
//         return;
//       }
//       if ((form.tipas || "").toLowerCase() === "kodas" && !form.kodas_kaip) {
//         setErrorDefaults("Pasirinkus „Kodas“, būtina nurodyti „Nustatyti PVM klasifikatorių kaip“.");
//         setSavingDefaults(false);
//         return;
//       }

//       const payloadItem = {
//         imones_pavadinimas: form.imones_pavadinimas || "",
//         imones_kodas:       form.imones_kodas || "",
//         imones_pvm_kodas:   form.imones_pvm_kodas || "",
//         pavadinimas:        form.pavadinimas.trim(),
//         kodas:              form.kodas.trim(),
//         barkodas:           form.barkodas || "",
//         tipas:              tipasToNum(form.tipas, form.kodas_kaip),
//       };

//       const payload = defaultsMode === "pirkimas"
//         ? { purchase_defaults: [payloadItem] }
//         : { sales_defaults:    [payloadItem] };

//       await api.patch("/profile/", payload, { withCredentials: true });

//       if (defaultsMode === "pirkimas") {
//         setPurchaseList((prev) => mergeProfileIntoList(prev, payloadItem));
//         setPurchaseDefaultsForm({
//           imones_pavadinimas: "", imones_kodas: "", imones_pvm_kodas: "",
//           pavadinimas: "", kodas: "", barkodas: "", tipas: "Prekė", kodas_kaip: "",
//         });
//       } else {
//         setSalesList((prev) => mergeProfileIntoList(prev, payloadItem));
//         setSalesDefaultsForm({
//           imones_pavadinimas: "", imones_kodas: "", imones_pvm_kodas: "",
//           pavadinimas: "", kodas: "", barkodas: "", tipas: "Prekė", kodas_kaip: "",
//         });
//       }

//       // после успеха — очистить подсветку и сообщение
//       setTouchedDefaults(false);
//       setErrorDefaults("");
//       setSuccessDefaults(true);
//       setTimeout(() => setSuccessDefaults(false), 2000);
//     } catch (e) {
//       setErrorDefaults(e?.response?.data?.detail || "Nepavyko išsaugoti numatytųjų reikšmių.");
//     } finally {
//       setSavingDefaults(false);
//     }
//   };

//   const deleteProfile = async (mode, index) => {
//     try {
//       const payload = mode === "pirkimas"
//         ? { purchase_defaults: { "__delete_index__": index } }
//         : { sales_defaults:    { "__delete_index__": index } };

//     await api.patch("/profile/", payload, { withCredentials: true });

//       if (mode === "pirkimas") setPurchaseList((prev) => prev.filter((_, i) => i !== index));
//       else                     setSalesList((prev) => prev.filter((_, i) => i !== index));
//     } catch (e) {
//       alert(e?.response?.data?.detail || "Nepavyko ištrinti įrašo.");
//     }
//   };


//   const saveLineitemRule = async () => {
//     setSavingRules(true);
//     try {
//       if (!ruleForm.result_kodas?.trim()) {
//         alert("„Prekės kodas“ yra privalomas.");
//         setSavingRules(false);
//         return;
//       }

//       const nextId =
//         ruleForm.id ??
//         (lineitemRules.reduce(
//           (max, r) => (typeof r.id === "number" && r.id > max ? r.id : max),
//           0
//         ) + 1);

//       const payloadRule = {
//         id: nextId,
//         enabled: !!ruleForm.enabled,
//         vat_percent: ruleForm.vat_value
//           ? { op: ruleForm.vat_op, value: Number(ruleForm.vat_value) }
//           : null,
//         name_contains: ruleForm.name_contains || "",
//         buyer_id: ruleForm.buyer_id || "",
//         buyer_vat_code: ruleForm.buyer_vat_code || "",
//         seller_id: ruleForm.seller_id || "",
//         seller_vat_code: ruleForm.seller_vat_code || "",
//         result_kodas: ruleForm.result_kodas.trim(),
//         result_tipas: ruleForm.result_tipas || "Prekė",
//         stop_after_match: !!ruleForm.stop_after_match,
//       };

//       const newList = (() => {
//         const idx = lineitemRules.findIndex((r) => r.id === nextId);
//         if (idx === -1) return [...lineitemRules, payloadRule];
//         const copy = [...lineitemRules];
//         copy[idx] = payloadRule;
//         return copy;
//       })();

//       await api.patch(
//         "/profile/",
//         { lineitem_rules: newList },
//         { withCredentials: true }
//       );

//       setLineitemRules(newList);
//       setRuleForm({
//         id: null,
//         enabled: true,
//         vat_op: "=",
//         vat_value: "",
//         name_contains: "",
//         buyer_id: "",
//         buyer_vat_code: "",
//         seller_id: "",
//         seller_vat_code: "",
//         result_kodas: "",
//         result_tipas: "Prekė",
//         stop_after_match: true,
//       });
//     } catch (e) {
//       alert(e?.response?.data?.detail || "Nepavyko išsaugoti taisyklės.");
//     } finally {
//       setSavingRules(false);
//     }
//   };

//   const deleteLineitemRule = async (id) => {
//     const newList = lineitemRules.filter((r) => r.id !== id);
//     try {
//       await api.patch(
//         "/profile/",
//         { lineitem_rules: newList },
//         { withCredentials: true }
//       );
//       setLineitemRules(newList);
//     } catch (e) {
//       alert(e?.response?.data?.detail || "Nepavyko ištrinti taisyklės.");
//     }
//   };


//   // NEW: toggle kelių įmonių režimas
//   const toggleViewMode = async (e) => {
//     const nextMode = e.target.checked ? "multi" : "single";
//     const prevMode = viewMode;
//     setViewMode(nextMode);
//     setSavingViewMode(true);
//     try {
//       await api.patch("/view-mode/", { view_mode: nextMode }, { withCredentials: true });
//     } catch {
//       setViewMode(prevMode);
//       alert("Nepavyko pakeisti režimo.");
//     } finally {
//       setSavingViewMode(false);
//     }
//   };

//   // Papildomi nustatymai: „Operacijos datą imti iš sąskaitos datos“
//   const opDateKey = "operation_date=document_date";
//   const isOpDateFromDoc = Boolean(extraSettings && Object.prototype.hasOwnProperty.call(extraSettings, opDateKey));
//   const toggleOpDateFromDoc = async (e) => {
//     const checked = e.target.checked;
//     const next = { ...(extraSettings || {}) };
//     if (checked) next[opDateKey] = 1; else if (opDateKey in next) delete next[opDateKey];
//     setExtraSettings(next);
//     try {
//       await api.patch("/profile/", { extra_settings: next }, { withCredentials: true });
//     } catch {
//       setExtraSettings(extraSettings || {});
//       alert("Nepavyko išsaugoti papildomų nustatymų.");
//     }
//   };

//   // Papildomi nustatymai: Rivilė: frakcija
//   const rivileFracKey = "rivile_fraction";
//   const rivileFraction = Number(extraSettings?.[rivileFracKey] ?? 1);

//   // Papildomi nustatymai: Rivilė: pakeisti lietuviškas raides
//   const rivileStripLtKey = "rivile_strip_lt_letters";
//   const isRivileStripLt = Boolean(
//     extraSettings && Object.prototype.hasOwnProperty.call(extraSettings, rivileStripLtKey)
//   );

//   const setRivileFraction = async (value) => {
//     const prev = extraSettings || {};
//     const next = { ...prev };

//     if (value === 1) {
//       if (rivileFracKey in next) delete next[rivileFracKey];
//     } else {
//       next[rivileFracKey] = value;
//     }

//     setExtraSettings(next);
//     try {
//       await api.patch("/profile/", { extra_settings: next }, { withCredentials: true });
//       setRivileSaved(true);
//       setTimeout(() => setRivileSaved(false), 1800);
//     } catch {
//       setExtraSettings(prev);
//       alert("Nepavyko išsaugoti frakcijos.");
//     }
//   };


//   // NEW: Rivilė – pakeisti lietuviškas raides
//   const toggleRivileStripLt = async (e) => {
//     const checked = e.target.checked;
//     const prev = extraSettings || {};
//     const next = { ...prev };

//     if (checked) {
//       next[rivileStripLtKey] = 1;
//     } else if (rivileStripLtKey in next) {
//       delete next[rivileStripLtKey];
//     }

//     setExtraSettings(next);
//     try {
//       await api.patch("/profile/", { extra_settings: next }, { withCredentials: true });
//       setRivileSaved(true);
//       setTimeout(() => setRivileSaved(false), 1800);
//     } catch {
//       setExtraSettings(prev);
//       alert("Nepavyko išsaugoti nustatymo dėl lietuviškų raidžių.");
//     }
//   };

//   return (
//     <Box p={4} maxWidth={900}>
//       <Helmet><title>Nustatymai - DokSkenas</title></Helmet>

//       <Typography variant="h5" gutterBottom>Nustatymai</Typography>

//       {/* 1. Company details */}
//       <Paper sx={{ p: 3, mb: 3 }}>
//         <Typography variant="subtitle1" sx={{ mb: 2 }}>
//           1. Įvesk savo įmonės informaciją
//         </Typography>
//         <Stack spacing={2} direction="column">
//           <TextField
//             label="Įmonės pavadinimas *"
//             value={companyName}
//             onChange={(e) => setCompanyName(e.target.value)}
//             onBlur={() => setCompanyNameTouched(true)}
//             fullWidth
//             required
//             error={companyNameTouched && !companyName.trim()}
//             helperText={companyNameTouched && !companyName.trim() ? "Privalomas laukas" : ""}
//           />
//           <TextField
//             label="Įmonės kodas *"
//             value={companyCode}
//             onChange={(e) => setCompanyCode(e.target.value)}
//             onBlur={() => setCompanyNameTouched(true)}
//             fullWidth
//             required
//             error={companyNameTouched && !companyCode.trim()}
//             helperText={companyNameTouched && !companyCode.trim() ? "Privalomas laukas" : ""}
//           />
//           <TextField label="PVM kodas" value={vatCode} onChange={(e) => setVatCode(e.target.value)} fullWidth />
//           <TextField label="Įmonės IBAN" value={companyIban} onChange={(e) => setCompanyIban(e.target.value)} fullWidth />
//           <TextField label="Įmonės adresas" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} fullWidth />
//           <Autocomplete
//             disablePortal
//             options={COUNTRY_OPTIONS}
//             getOptionLabel={(option) => option.name}
//             value={COUNTRY_OPTIONS.find((opt) => opt.code === companyCountryIso) || null}
//             onChange={(_, newValue) => setCompanyCountryIso(newValue ? newValue.code : "")}
//             renderInput={(params) => (
//               <TextField
//                 {...params}
//                 label="Įmonės šalis *"
//                 fullWidth
//                 required
//                 error={companyNameTouched && !companyCountryIso}
//                 helperText={companyNameTouched && !companyCountryIso ? "Privalomas laukas" : ""}
//               />
//             )}
//             isOptionEqualToValue={(option, value) => option.code === value.code}
//           />
//           <Button
//             variant="contained"
//             onClick={saveCompanyDetails}
//             disabled={savingCompany}
//             sx={{ alignSelf: "flex-start", mt: 1 }}
//           >
//             Išsaugoti
//           </Button>
//           {companyError && <Alert severity="error">{companyError}</Alert>}
//           {successCompany && <Alert severity="success">Išsaugota!</Alert>}
//         </Stack>
//       </Paper>

//       {/* 2. Accounting program + multi switch */}
//       <Typography variant="subtitle1" sx={{ mb: 2 }}>
//         2. Pasirink savo buhalterinę programą
//       </Typography>
//       <FormControl fullWidth sx={{ mb: 3 }}>
//         <InputLabel id="acc-prog-label">Numatytoji programa</InputLabel>
//         <Select labelId="acc-prog-label" value={program} label="Numatytoji programa" onChange={handleChange}>
//           {ACCOUNTING_PROGRAMS.map((p) => (
//             <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
//           ))}
//         </Select>

//         <Box sx={{ mt: 2 }}>
//           <FormControlLabel
//             control={<Switch checked={viewMode === "multi"} onChange={toggleViewMode} disabled={savingViewMode} />}
//             label={
//               <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
//                 <span>Kelių įmonių režimas</span>
//                 <Tooltip
//                   title="Pasirinkus šį režimą, galėsite vesti kelių įmonių apskaitą. Matysite visų kontrahentų sąrašą suvestinėje."
//                   arrow enterTouchDelay={0} leaveTouchDelay={4000}
//                 >
//                   <HelpOutlineIcon fontSize="small" />
//                 </Tooltip>
//               </Box>
//             }
//           />
//         </Box>
//       </FormControl>

//       <Button variant="contained" disabled={!program || saving} onClick={save}>Išsaugoti</Button>
//       {success && <Alert severity="success" sx={{ mt: 2 }}>Išsaugota!</Alert>}

//       {/* Atsisiųsti adapterį — rodoma tik pasirinkus Apskaita5 */}
//       {program === "apskaita5" && (
//         <Box sx={{ mt: 2 }}>
//           <Stack direction="row" spacing={1} alignItems="center">
//             <Button
//               variant="outlined"
//               component="a"
//               href="/api/download/apskaita5-adapter/"
//             >
//               Atsisiųsti Apskaita5 adapterį
//             </Button>

//             <Button variant="outlined" onClick={handleCopyPvm}>
//               Kopijuoti PVM kodus
//             </Button>
//           </Stack>

//           {copiedPvm && (
//             <Alert severity="success" sx={{ mt: 1, py: 0.5 }}>
//               Nukopijuota į iškarpinę.
//             </Alert>
//           )}
//         </Box>
//       )}

//       {/* 3. Duomenų importas */}
//       <Box mt={6}>
//         <Typography variant="h6" gutterBottom>Duomenų importas</Typography>
//         <Tabs value={importTab} onChange={(_, v) => setImportTab(v)} sx={{ mb: 2 }}>
//           <Tab label="Prekės" /><Tab label="Įmonės" />
//         </Tabs>
//         {importTab === 0 && (
//           <ImportTab label="Importuoti prekes iš Excel" url="/data/import-products/" templateFileName="prekes_sablonas.xlsx" />
//         )}
//         {importTab === 1 && (
//           <ImportTab label="Importuoti įmones iš Excel" url="/data/import-clients/" templateFileName="imones_sablonas.xlsx" />
//         )}
//       </Box>

//       {/* 4. Defaults for sumiskai: form + table */}
//       <Paper sx={{ p: 3, mt: 6 }}>
//         <Box sx={{ display: "flex", alignItems: "center", gap: 0, mb: 2 }}>
//           <Typography variant="subtitle1" sx={{ mr: 0 }}>
//             Numatytosios reikšmės (skaitmenizuojant sumiškai)
//           </Typography>
//           <Tooltip
//             title="Skaitmenizuojant sumiškai, bus automatiškai priskirtos jūsų nustatytos numatytosios reikšmės, jei sistema atpažins jūsų nustatytą įmonę kaip pirkėją arba pardavėją dokumente."
//             arrow enterTouchDelay={0} leaveTouchDelay={4000}
//           >
//             <IconButton size="small" aria-label="Informacija"><HelpOutlineIcon fontSize="small" /></IconButton>
//           </Tooltip>
//         </Box>

//         <FormControl component="fieldset" sx={{ mb: 2 }}>
//           <RadioGroup row value={defaultsMode} onChange={(_, v) => setDefaultsMode(v)} name="defaults-mode">
//             <FormControlLabel value="pirkimas" control={<Radio />} label="Pirkimas" />
//             <FormControlLabel value="pardavimas" control={<Radio />} label="Pardavimas" />
//           </RadioGroup>
//         </FormControl>

//         {defaultsMode === "pirkimas" ? (
//           <DefaultsFields
//             mode="pirkimas"
//             program={program}
//             state={purchaseDefaultsForm}
//             setState={setPurchaseDefaultsForm}
//             touched={touchedDefaults}
//           />
//         ) : (
//           <DefaultsFields
//             mode="pardavimas"
//             program={program}
//             state={salesDefaultsForm}
//             setState={setSalesDefaultsForm}
//             touched={touchedDefaults}
//           />
//         )}

//         <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
//           <Button variant="contained" onClick={saveDefaults} disabled={savingDefaults}>Išsaugoti</Button>
//           {successDefaults && <Alert severity="success">Išsaugota!</Alert>}
//           {errorDefaults && <Alert severity="error">{errorDefaults}</Alert>}
//         </Stack>

//         {/* Saved profiles table for current mode */}
//         <Typography variant="subtitle2" sx={{ mt: 3 }}>
//           Išsaugoti profiliai ({defaultsMode === "pirkimas" ? "Pirkimas" : "Pardavimas"})
//         </Typography>
//         <DefaultsTable
//           rows={defaultsMode === "pirkimas" ? purchaseList : salesList}
//           onDelete={(idx) => deleteProfile(defaultsMode, idx)}
//         />
//       </Paper>


//       {/* 5. Automatinės taisyklės detalioms eilutėms */}
//       <Paper sx={{ p: 3, mt: 6 }}>
//         <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 2 }}>
//           <Typography variant="subtitle1">
//             Numatytosios prekių reikšmės (skaitmenizuojant detaliai)
//           </Typography>
//           <Tooltip
//             title="Pagal jūsų nustatytas sąlygas automatiškai priskirsime prekės kodą ir tipą kiekvienai eilutei skaitmenizuojant detaliai su eilutėmis."
//             arrow
//             enterTouchDelay={0}
//             leaveTouchDelay={4000}
//           >
//             <HelpOutlineIcon fontSize="small" />
//           </Tooltip>
//         </Box>

//         {/* Nauja taisyklė */}
//         <Box
//           sx={{
//             border: "1px solid",
//             borderColor: "divider",
//             borderRadius: 1,
//             p: 2,
//             mb: 3,
//             backgroundColor: "background.default",
//           }}
//         >
//           <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
//             🔍 KAI (pasirinkite sąlygas):
//           </Typography>

//           <Stack spacing={2} sx={{ mt: 2 }}>
//             {/* PVM procentas */}
//             <Box>
//               <FormControlLabel
//                 control={
//                   <Switch
//                     checked={ruleForm.vat_value !== "" && ruleForm.vat_value !== null && ruleForm.vat_value !== undefined}
//                     onChange={(e) => {
//                       if (e.target.checked) {
//                         setRuleForm((prev) => ({ ...prev, vat_value: "0" }));
//                       } else {
//                         setRuleForm((prev) => ({ ...prev, vat_value: "" }));
//                       }
//                     }}
//                   />
//                 }
//                 label="PVM procentas:"
//               />
//               {ruleForm.vat_value !== "" && ruleForm.vat_value !== null && ruleForm.vat_value !== undefined && (
//                 <Stack direction="row" spacing={1} sx={{ ml: 5, mt: 1 }}>
//                   <FormControl size="small" sx={{ minWidth: 80 }}>
//                     <Select
//                       value={ruleForm.vat_op}
//                       onChange={(e) =>
//                         setRuleForm((prev) => ({ ...prev, vat_op: e.target.value }))
//                       }
//                     >
//                       <MenuItem value="<">&lt;</MenuItem>
//                       <MenuItem value="<=">&le;</MenuItem>
//                       <MenuItem value="=">=</MenuItem>
//                       <MenuItem value=">=">&ge;</MenuItem>
//                       <MenuItem value=">">&gt;</MenuItem>
//                     </Select>
//                   </FormControl>
//                   <TextField
//                     type="number"
//                     size="small"
//                     value={ruleForm.vat_value}
//                     onChange={(e) =>
//                       setRuleForm((prev) => ({ ...prev, vat_value: e.target.value }))
//                     }
//                     sx={{ width: 100 }}
//                     InputProps={{ endAdornment: "%" }}
//                   />
//                 </Stack>
//               )}
//             </Box>

//             {/* Prekės pavadinimas */}
//             <Box>
//               <FormControlLabel
//                 control={
//                   <Switch
//                     checked={ruleForm.name_contains !== "" && ruleForm.name_contains !== null && ruleForm.name_contains !== undefined}
//                     onChange={(e) => {
//                       if (e.target.checked) {
//                         setRuleForm((prev) => ({ ...prev, name_contains: " " }));
//                       } else {
//                         setRuleForm((prev) => ({ ...prev, name_contains: "" }));
//                       }
//                     }}
//                   />
//                 }
//                 label="Prekės pavadinimas turi žodį:"
//               />
//               {ruleForm.name_contains !== "" && ruleForm.name_contains !== null && ruleForm.name_contains !== undefined && (
//                 <TextField
//                   size="small"
//                   fullWidth
//                   value={ruleForm.name_contains.trim()}
//                   onChange={(e) =>
//                     setRuleForm((prev) => ({
//                       ...prev,
//                       name_contains: e.target.value,
//                     }))
//                   }
//                   sx={{ ml: 5, mt: 1, maxWidth: 400 }}
//                   placeholder="pvz. paslaugos"
//                 />
//               )}
//             </Box>

//             {/* Pirkėjas */}
//             <Box>
//               <FormControlLabel
//                 control={
//                   <Switch
//                     checked={
//                       (ruleForm.buyer_id !== "" && ruleForm.buyer_id !== null && ruleForm.buyer_id !== undefined) ||
//                       (ruleForm.buyer_vat_code !== "" && ruleForm.buyer_vat_code !== null && ruleForm.buyer_vat_code !== undefined)
//                     }
//                     onChange={(e) => {
//                       if (e.target.checked) {
//                         setRuleForm((prev) => ({
//                           ...prev,
//                           buyer_id: " ",
//                           buyer_vat_code: "",
//                         }));
//                       } else {
//                         setRuleForm((prev) => ({
//                           ...prev,
//                           buyer_id: "",
//                           buyer_vat_code: "",
//                         }));
//                       }
//                     }}
//                   />
//                 }
//                 label="Pirkėjas:"
//               />
//               {((ruleForm.buyer_id !== "" && ruleForm.buyer_id !== null) || 
//                 (ruleForm.buyer_vat_code !== "" && ruleForm.buyer_vat_code !== null)) && (
//                 <Stack direction="row" spacing={2} sx={{ ml: 5, mt: 1 }}>
//                   <TextField
//                     label="Įmonės kodas"
//                     size="small"
//                     value={ruleForm.buyer_id.trim()}
//                     onChange={(e) =>
//                       setRuleForm((prev) => ({ ...prev, buyer_id: e.target.value }))
//                     }
//                     sx={{ width: 200 }}
//                   />
//                   <TextField
//                     label="PVM kodas"
//                     size="small"
//                     value={ruleForm.buyer_vat_code}
//                     onChange={(e) =>
//                       setRuleForm((prev) => ({
//                         ...prev,
//                         buyer_vat_code: e.target.value,
//                       }))
//                     }
//                     sx={{ width: 200 }}
//                   />
//                 </Stack>
//               )}
//             </Box>

//             {/* Pardavėjas */}
//             <Box>
//               <FormControlLabel
//                 control={
//                   <Switch
//                     checked={
//                       (ruleForm.seller_id !== "" && ruleForm.seller_id !== null && ruleForm.seller_id !== undefined) ||
//                       (ruleForm.seller_vat_code !== "" && ruleForm.seller_vat_code !== null && ruleForm.seller_vat_code !== undefined)
//                     }
//                     onChange={(e) => {
//                       if (e.target.checked) {
//                         setRuleForm((prev) => ({
//                           ...prev,
//                           seller_id: " ",
//                           seller_vat_code: "",
//                         }));
//                       } else {
//                         setRuleForm((prev) => ({
//                           ...prev,
//                           seller_id: "",
//                           seller_vat_code: "",
//                         }));
//                       }
//                     }}
//                   />
//                 }
//                 label="Pardavėjas:"
//               />
//               {((ruleForm.seller_id !== "" && ruleForm.seller_id !== null) || 
//                 (ruleForm.seller_vat_code !== "" && ruleForm.seller_vat_code !== null)) && (
//                 <Stack direction="row" spacing={2} sx={{ ml: 5, mt: 1 }}>
//                   <TextField
//                     label="Įmonės kodas"
//                     size="small"
//                     value={ruleForm.seller_id.trim()}
//                     onChange={(e) =>
//                       setRuleForm((prev) => ({
//                         ...prev,
//                         seller_id: e.target.value,
//                       }))
//                     }
//                     sx={{ width: 200 }}
//                   />
//                   <TextField
//                     label="PVM kodas"
//                     size="small"
//                     value={ruleForm.seller_vat_code}
//                     onChange={(e) =>
//                       setRuleForm((prev) => ({
//                         ...prev,
//                         seller_vat_code: e.target.value,
//                       }))
//                     }
//                     sx={{ width: 200 }}
//                   />
//                 </Stack>
//               )}
//             </Box>
//           </Stack>

//           <Box
//             sx={{
//               borderTop: "1px solid",
//               borderColor: "divider",
//               mt: 3,
//               pt: 3,
//             }}
//           >
//             <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
//               ✅ TAI NUSTATYTI:
//             </Typography>

//             <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
//               <TextField
//                 label="Prekės kodas *"
//                 size="small"
//                 value={ruleForm.result_kodas}
//                 onChange={(e) =>
//                   setRuleForm((prev) => ({
//                     ...prev,
//                     result_kodas: e.target.value,
//                   }))
//                 }
//                 sx={{ width: 200 }}
//                 required
//               />
//               <FormControl size="small" sx={{ width: 200 }}>
//                 <InputLabel>Tipas *</InputLabel>
//                 <Select
//                   label="Tipas *"
//                   value={ruleForm.result_tipas}
//                   onChange={(e) =>
//                     setRuleForm((prev) => ({
//                       ...prev,
//                       result_tipas: e.target.value,
//                     }))
//                   }
//                 >
//                   <MenuItem value="Prekė">Prekė</MenuItem>
//                   <MenuItem value="Paslauga">Paslauga</MenuItem>
//                   <MenuItem value="Kodas">Kodas</MenuItem>
//                 </Select>
//               </FormControl>
//             </Stack>

//             <Box sx={{ mt: 2 }}>
//               <FormControlLabel
//                 control={
//                   <Switch
//                     checked={ruleForm.enabled}
//                     onChange={(e) =>
//                       setRuleForm((prev) => ({
//                         ...prev,
//                         enabled: e.target.checked,
//                       }))
//                     }
//                   />
//                 }
//                 label="Taisyklė įjungta"
//               />
//             </Box>
//           </Box>

//           <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
//             <Button
//               variant="contained"
//               onClick={saveLineitemRule}
//               disabled={savingRules}
//             >
//               {ruleForm.id ? "Atnaujinti taisyklę" : "+ Išsaugoti taisyklę"}
//             </Button>
//             <Button
//               variant="text"
//               onClick={() =>
//                 setRuleForm({
//                   id: null,
//                   enabled: true,
//                   vat_op: "=",
//                   vat_value: "",
//                   name_contains: "",
//                   buyer_id: "",
//                   buyer_vat_code: "",
//                   seller_id: "",
//                   seller_vat_code: "",
//                   result_kodas: "",
//                   result_tipas: "Prekė",
//                   stop_after_match: true,
//                 })
//               }
//             >
//               Išvalyti
//             </Button>
//           </Stack>
//         </Box>

//         {/* Išsaugotos taisyklės */}
//         <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
//           IŠSAUGOTOS TAISYKLĖS ({lineitemRules?.length || 0}):
//         </Typography>

//         {lineitemRules && lineitemRules.length > 0 ? (
//           <Stack spacing={2} sx={{ mt: 2 }}>
//             {lineitemRules.map((r, idx) => (
//               <Box
//                 key={r.id || idx}
//                 sx={{
//                   border: "1px solid",
//                   borderColor: r.enabled ? "success.main" : "grey.400",
//                   borderRadius: 1,
//                   p: 2,
//                   backgroundColor: r.enabled ? "success.50" : "grey.50",
//                   opacity: r.enabled ? 1 : 0.6,
//                 }}
//               >
//                 <Stack
//                   direction="row"
//                   justifyContent="space-between"
//                   alignItems="flex-start"
//                 >
//                   <Box sx={{ flex: 1 }}>
//                     <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
//                       {r.enabled ? "🟢" : "⚪"} Taisyklė #{idx + 1}
//                     </Typography>

//                     <Typography variant="body2" sx={{ mb: 1 }}>
//                       <strong>SĄLYGA:</strong>
//                     </Typography>
//                     <Box sx={{ ml: 2, mb: 1 }}>
//                       {r.vat_percent && (
//                         <Typography variant="body2">
//                           • PVM procentas {r.vat_percent.op} {r.vat_percent.value}%
//                         </Typography>
//                       )}
//                       {r.name_contains && (
//                         <Typography variant="body2">
//                           • Pavadinimas turi žodį: "{r.name_contains}"
//                         </Typography>
//                       )}
//                       {(r.buyer_id || r.buyer_vat_code) && (
//                         <Typography variant="body2">
//                           • Pirkėjas:{" "}
//                           {[r.buyer_id, r.buyer_vat_code].filter(Boolean).join(", ")}
//                         </Typography>
//                       )}
//                       {(r.seller_id || r.seller_vat_code) && (
//                         <Typography variant="body2">
//                           • Pardavėjas:{" "}
//                           {[r.seller_id, r.seller_vat_code]
//                             .filter(Boolean)
//                             .join(", ")}
//                         </Typography>
//                       )}
//                       {!r.vat_percent &&
//                         !r.name_contains &&
//                         !r.buyer_id &&
//                         !r.buyer_vat_code &&
//                         !r.seller_id &&
//                         !r.seller_vat_code && (
//                           <Typography variant="body2" color="text.secondary">
//                             • (visos eilutės)
//                           </Typography>
//                         )}
//                     </Box>

//                     <Typography variant="body2" sx={{ mb: 0.5 }}>
//                       <strong>VEIKSMAS:</strong>
//                     </Typography>
//                     <Box sx={{ ml: 2 }}>
//                       <Typography variant="body2">
//                         → Nustatyti prekės kodą: <strong>{r.result_kodas}</strong>
//                       </Typography>
//                       <Typography variant="body2">
//                         → Tipas: <strong>{r.result_tipas}</strong>
//                       </Typography>
//                     </Box>
//                   </Box>

//                   <Stack direction="row" spacing={1}>
//                     <IconButton
//                       size="small"
//                       onClick={() =>
//                         setRuleForm({
//                           id: r.id || null,
//                           enabled: r.enabled !== false,
//                           vat_op: r.vat_percent?.op || "=",
//                           vat_value:
//                             r.vat_percent && r.vat_percent.value != null
//                               ? String(r.vat_percent.value)
//                               : "",
//                           name_contains: r.name_contains || "",
//                           buyer_id: r.buyer_id || "",
//                           buyer_vat_code: r.buyer_vat_code || "",
//                           seller_id: r.seller_id || "",
//                           seller_vat_code: r.seller_vat_code || "",
//                           result_kodas: r.result_kodas || "",
//                           result_tipas: r.result_tipas || "Prekė",
//                           stop_after_match: r.stop_after_match !== false,
//                         })
//                       }
//                       aria-label="Redaguoti"
//                       sx={{ color: "primary.main" }}
//                     >
//                       <span style={{ fontSize: 18 }}>✏️</span>
//                     </IconButton>
//                     <IconButton
//                       color="error"
//                       size="small"
//                       onClick={() => deleteLineitemRule(r.id)}
//                       aria-label="Ištrinti"
//                     >
//                       <DeleteOutlineIcon fontSize="small" />
//                     </IconButton>
//                   </Stack>
//                 </Stack>
//               </Box>
//             ))}
//           </Stack>
//         ) : (
//           <Typography variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
//             Nėra išsaugotų taisyklių.
//           </Typography>
//         )}
//       </Paper>






//       {/* 5. Papildomi nustatymai */}
//       <Paper sx={{ p: 3, mt: 6 }}>
//         <Typography variant="subtitle1" sx={{ mb: 1 }}>
//           Papildomi nustatymai
//         </Typography>
//         <FormControlLabel
//           control={<Switch checked={isOpDateFromDoc} onChange={toggleOpDateFromDoc} />}
//           label="Operacijos datą imti iš sąskaitos datos"
//         />

//         {program === "rivile" && (
//           <Box sx={{ mt: 2 }}>
//             {/* NEW: Pakeisti lietuviškas raides */}
//             <FormControlLabel
//               sx={{ mb: 1 }}
//               control={
//                 <Switch
//                   checked={isRivileStripLt}
//                   onChange={toggleRivileStripLt}
//                 />
//               }
//               label={
//                 <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
//                   <span>Pakeisti lietuviškas raides</span>
//                   <Tooltip
//                     arrow
//                     enterTouchDelay={0}
//                     leaveTouchDelay={4000}
//                     title="Pakeisime visas lietuviškas raides į angliškas, pvz. š -> s. Naudokite, kai importuodami duomenis matote hieroglifus."
//                   >
//                     <HelpOutlineIcon fontSize="small" />
//                   </Tooltip>
//                 </Box>
//               }
//             />

//             {/* Matavimo vienetų frakcija */}
//             <Typography
//               variant="body1"
//               sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
//             >
//               Matavimo vienetų frakcija
//               <Tooltip
//                 arrow
//                 enterTouchDelay={0}
//                 leaveTouchDelay={4000}
//                 title="Frakcija turi atitikti nustatytai frakcijai matavimo vienetams jūsų Rivilė Gama programoje (Kortelės -> Matavimo vienetai). Kitaip kiekis gali būti apvalinamas."
//               >
//                 <HelpOutlineIcon fontSize="small" sx={{ color: "text.secondary" }} />
//               </Tooltip>
//             </Typography>

//             <FormControl sx={{ mt: 1.5, minWidth: 240 }} size="small">
//               <Select
//                 value={rivileFraction}
//                 onChange={(e) => setRivileFraction(Number(e.target.value))}
//               >
//                 <MenuItem value={1}>1</MenuItem>
//                 <MenuItem value={10}>10</MenuItem>
//                 <MenuItem value={100}>100</MenuItem>
//                 <MenuItem value={1000}>1000</MenuItem>
//               </Select>
//             </FormControl>

//             {rivileSaved && (
//               <Alert severity="success" sx={{ mt: 1, py: 0.5 }}>
//                 Išsaugota!
//               </Alert>
//             )}
//           </Box>
//         )}        
//       </Paper>
//     </Box>
//   );
// };

