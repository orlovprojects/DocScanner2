import { useEffect, useState } from "react";
import {
  Box, Typography, FormControl, InputLabel, Select, MenuItem,
  Button, Alert, Tabs, Tab, Paper, TextField, Stack
} from "@mui/material";
import Autocomplete from "@mui/material/Autocomplete";
import { api } from "../api/endpoints"; // поправь путь к api если нужно
import { COUNTRY_OPTIONS } from "../page_elements/Countries";
import { ACCOUNTING_PROGRAMS } from "../page_elements/AccountingPrograms";

// Новый ImportTab только для xlsx
function ImportTab({ label, url, templateFileName }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFile = (e) => {
    setFile(e.target.files[0]);
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
      setResult(data);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.error || "Importo klaida");
      setResult(null);
    }
  };

  // XLSX шаблон должен лежать в /public/templates/ на фронте
  const handleDownloadTemplate = () => {
    window.open(`/templates/${templateFileName || "imones_sablonas.xlsx"}`, "_blank");
  };

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography gutterBottom variant="subtitle1">{label}</Typography>
      <input
        type="file"
        accept=".xlsx"
        onChange={handleFile}
        style={{ marginBottom: 12 }}
      />
      <Button
        variant="contained"
        disabled={!file}
        onClick={handleImport}
        sx={{ ml: 2 }}
      >
        Importuoti
      </Button>
      <Button
        variant="outlined"
        size="small"
        sx={{ ml: 2, mt: 2 }}
        onClick={handleDownloadTemplate}
      >
        Atsisiųsti Excel šabloną
      </Button>
      {result && (
        <Alert severity="success" sx={{ mt: 2 }}>
          Importuota įrašų: {result.imported} iš {result.processed}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </Paper>
  );
}

export default function NustatymaiPage() {
  const [user, setUser] = useState(null);
  const [program, setProgram] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Company details
  const [companyName, setCompanyName] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [vatCode, setVatCode] = useState("");
  const [companyIban, setCompanyIban] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyCountryIso, setCompanyCountryIso] = useState("LT");
  const [savingCompany, setSavingCompany] = useState(false);
  const [successCompany, setSuccessCompany] = useState(false);
  const [companyError, setCompanyError] = useState("");

  // Для табов импорта
  const [importTab, setImportTab] = useState(0);

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
    });
  }, []);

  const handleChange = (e) => setProgram(e.target.value);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(
        "/profile/",
        { default_accounting_program: program },
        { withCredentials: true }
      );
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  // Обновление company details
  const saveCompanyDetails = async () => {
    setSavingCompany(true);
    setCompanyError("");
    // Минимальная клиентская валидация
    if (!companyName || !companyCode || !companyCountryIso) {
      setCompanyError("Prašome užpildyti visus privalomus laukus.");
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

  // Показываем ли вкладки импорта для Centas
  const showCentasImport =
    program === "centas" || (user && user.default_accounting_program === "centas");

  return (
    <Box p={4} maxWidth={600}>
      <Typography variant="h5" gutterBottom>
        Nustatymai
      </Typography>

      {/* === Форма для company details === */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>
          1. Įvesk savo įmonės informaciją
        </Typography>
        <Stack spacing={2} direction="column">
          <TextField
            label="Įmonės pavadinimas"
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            fullWidth
            required
          />
          <TextField
            label="Įmonės kodas"
            value={companyCode}
            onChange={e => setCompanyCode(e.target.value)}
            fullWidth
            required
          />
          <TextField
            label="PVM kodas"
            value={vatCode}
            onChange={e => setVatCode(e.target.value)}
            fullWidth
          />
          <TextField
            label="Įmonės IBAN"
            value={companyIban}
            onChange={e => setCompanyIban(e.target.value)}
            fullWidth
          />
          <TextField
            label="Įmonės adresas"
            value={companyAddress}
            onChange={e => setCompanyAddress(e.target.value)}
            fullWidth
          />
          <Autocomplete
            disablePortal
            options={COUNTRY_OPTIONS}
            getOptionLabel={option => option.name}
            value={COUNTRY_OPTIONS.find(opt => opt.code === companyCountryIso) || null}
            onChange={(_, newValue) => {
              setCompanyCountryIso(newValue ? newValue.code : "");
            }}
            renderInput={(params) => (
              <TextField {...params} label="Įmonės šalis" required fullWidth />
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
      {/* === Конец формы company details === */}

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
        >
          {ACCOUNTING_PROGRAMS.map((p) => (
            <MenuItem key={p.value} value={p.value}>
              {p.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Button
        variant="contained"
        disabled={!program || saving}
        onClick={save}
      >
        Išsaugoti
      </Button>
      {success && <Alert severity="success" sx={{ mt: 2 }}>Išsaugota!</Alert>}

      {/* --- Tabs для centas (только если выбрана) --- */}
      {showCentasImport && (
        <Box mt={6}>
          <Typography variant="h6" gutterBottom>
            Centas — duomenų importas
          </Typography>
          <Tabs
            value={importTab}
            onChange={(_, v) => setImportTab(v)}
            sx={{ mb: 2 }}
          >
            <Tab label="Prekės" />
            <Tab label="Įmonės" />
          </Tabs>
          {importTab === 0 && (
            <ImportTab
              label="Importuoti prekes iš Excel"
              url="/data/import-products/"
              templateFileName="prekes_sablonas.xlsx"
            />
          )}
          {importTab === 1 && (
            <ImportTab
              label="Importuoti įmones iš Excel"
              url="/data/import-clients/"
              templateFileName="imones_sablonas.xlsx"
            />
          )}
        </Box>
      )}
    </Box>
  );
}




// import { useEffect, useState } from "react";
// import {
//   Box, Typography, FormControl, InputLabel, Select, MenuItem,
//   Button, Alert, Tabs, Tab, Paper, TextField, Stack
// } from "@mui/material";
// import Autocomplete from "@mui/material/Autocomplete";
// import { api } from "../api/endpoints"; // поправь путь к api если нужно
// import { COUNTRY_OPTIONS } from "../page_elements/Countries";
// import { ACCOUNTING_PROGRAMS } from "../page_elements/AccountingPrograms";

// function ImportTab({ label, url, templateHeader, templateExample, templateFileName }) {
//   const [file, setFile] = useState(null);
//   const [result, setResult] = useState(null);
//   const [error, setError] = useState(null);

//   const handleFile = (e) => {
//     setFile(e.target.files[0]);
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
//       setResult(data);
//       setError(null);
//     } catch (err) {
//       setError(err?.response?.data?.error || "Importo klaida");
//       setResult(null);
//     }
//   };

//   const handleDownloadTemplate = () => {
//     const csvContent =
//       '\uFEFF' + templateHeader + "\r\n" + (templateExample || "") + "\r\n";
//     const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
//     const link = document.createElement("a");
//     link.href = URL.createObjectURL(blob);
//     link.download = templateFileName || "template.csv";
//     link.click();
//     setTimeout(() => URL.revokeObjectURL(link.href), 1000);
//   };

//   return (
//     <Paper sx={{ p: 2, mb: 2 }}>
//       <Typography gutterBottom variant="subtitle1">
//         {label}
//       </Typography>
//       <input
//         type="file"
//         accept=".csv"
//         onChange={handleFile}
//         style={{ marginBottom: 12 }}
//       />
//       <Button
//         variant="contained"
//         disabled={!file}
//         onClick={handleImport}
//         sx={{ ml: 2 }}
//       >
//         Importuoti
//       </Button>
//       <Button
//         variant="outlined"
//         size="small"
//         sx={{ ml: 2, mt: 2 }}
//         onClick={handleDownloadTemplate}
//       >
//         Atsisiųsti CSV šabloną
//       </Button>
//       {result && (
//         <Alert severity="success" sx={{ mt: 2 }}>
//           Importuota įrašų: {result.imported} iš {result.processed}
//         </Alert>
//       )}
//       {error && (
//         <Alert severity="error" sx={{ mt: 2 }}>
//           {error}
//         </Alert>
//       )}
//     </Paper>
//   );
// }

// export default function NustatymaiPage() {
//   const [user, setUser] = useState(null);
//   const [program, setProgram] = useState("");
//   const [saving, setSaving] = useState(false);
//   const [success, setSuccess] = useState(false);

//   // Company details
//   const [companyName, setCompanyName] = useState("");
//   const [companyCode, setCompanyCode] = useState("");
//   const [vatCode, setVatCode] = useState("");
//   const [companyIban, setCompanyIban] = useState("");
//   const [companyAddress, setCompanyAddress] = useState("");
//   const [companyCountryIso, setCompanyCountryIso] = useState("LT");
//   const [savingCompany, setSavingCompany] = useState(false);
//   const [successCompany, setSuccessCompany] = useState(false);
//   const [companyError, setCompanyError] = useState("");

//   // Для табов импорта
//   const [importTab, setImportTab] = useState(0);

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
//     });
//   }, []);

//   const handleChange = (e) => setProgram(e.target.value);

//   const save = async () => {
//     setSaving(true);
//     try {
//       await api.patch(
//         "/profile/",
//         { default_accounting_program: program },
//         { withCredentials: true }
//       );
//       setSuccess(true);
//       setTimeout(() => setSuccess(false), 2000);
//     } finally {
//       setSaving(false);
//     }
//   };

//   // Обновление company details
//   const saveCompanyDetails = async () => {
//     setSavingCompany(true);
//     setCompanyError("");
//     // Минимальная клиентская валидация
//     if (!companyName || !companyCode || !companyCountryIso) {
//       setCompanyError("Prašome užpildyti visus privalomus laukus.");
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

//   // Показываем ли вкладки импорта для Centas
//   const showCentasImport =
//     program === "centas" || (user && user.default_accounting_program === "centas");

//   return (
//     <Box p={4} maxWidth={600}>
//       <Typography variant="h5" gutterBottom>
//         Nustatymai
//       </Typography>

//       {/* === Форма для company details === */}
//       <Paper sx={{ p: 3, mb: 3 }}>
//         <Typography variant="subtitle1" sx={{ mb: 2 }}>
//           1. Įvesk savo įmonės informaciją
//         </Typography>
//         <Stack spacing={2} direction="column">
//           <TextField
//             label="Įmonės pavadinimas"
//             value={companyName}
//             onChange={e => setCompanyName(e.target.value)}
//             fullWidth
//             required
//           />
//           <TextField
//             label="Įmonės kodas"
//             value={companyCode}
//             onChange={e => setCompanyCode(e.target.value)}
//             fullWidth
//             required
//           />
//           <TextField
//             label="PVM kodas"
//             value={vatCode}
//             onChange={e => setVatCode(e.target.value)}
//             fullWidth
//           />
//           <TextField
//             label="Įmonės IBAN"
//             value={companyIban}
//             onChange={e => setCompanyIban(e.target.value)}
//             fullWidth
//           />
//           <TextField
//             label="Įmonės adresas"
//             value={companyAddress}
//             onChange={e => setCompanyAddress(e.target.value)}
//             fullWidth
//           />
//           <Autocomplete
//             disablePortal
//             options={COUNTRY_OPTIONS}
//             getOptionLabel={option => option.name}
//             value={COUNTRY_OPTIONS.find(opt => opt.code === companyCountryIso) || null}
//             onChange={(_, newValue) => {
//               setCompanyCountryIso(newValue ? newValue.code : "");
//             }}
//             renderInput={(params) => (
//               <TextField {...params} label="Įmonės šalis" required fullWidth />
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
//       {/* === Конец формы company details === */}

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
//         >
//           {ACCOUNTING_PROGRAMS.map((p) => (
//             <MenuItem key={p.value} value={p.value}>
//               {p.label}
//             </MenuItem>
//           ))}
//         </Select>
//       </FormControl>
//       <Button
//         variant="contained"
//         disabled={!program || saving}
//         onClick={save}
//       >
//         Išsaugoti
//       </Button>
//       {success && <Alert severity="success" sx={{ mt: 2 }}>Išsaugota!</Alert>}

//       {/* --- Tabs для centas (только если выбрана) --- */}
//       {showCentasImport && (
//         <Box mt={6}>
//           <Typography variant="h6" gutterBottom>
//             Centas — duomenų importas
//           </Typography>
//           <Tabs
//             value={importTab}
//             onChange={(_, v) => setImportTab(v)}
//             sx={{ mb: 2 }}
//           >
//             <Tab label="Prekės" />
//             <Tab label="Įmonės" />
//           </Tabs>
//           {importTab === 0 && (
//             <ImportTab
//               label="Importuoti prekes iš CSV"
//               url="/data/import-products/"
//               templateHeader="prekes_pavadinimas;prekes_kodas;prekes_barkodas"
//               templateExample="preke1;P-001;123456789"
//               templateFileName="prekes_sablonas.csv"
//             />
//           )}
//           {importTab === 1 && (
//             <ImportTab
//               label="Importuoti įmones iš CSV"
//               url="/data/import-clients/"
//               templateHeader="kodas_buh_programoje;imones_pavadinimas;imones_kodas;imones_pvm_kodas;imones_IBAN;imones_adresas;imones_salies_kodas"
//               templateExample="CC-001;UAB Demo;'300000123;LT123456789;LT121234567890123456;Vilnius, Vilniaus g. 1;LT"
//               templateFileName="imones_sablonas.csv"
//             />
//           )}
//         </Box>
//       )}
//     </Box>
//   );
// }



// import { useEffect, useState } from "react";
// import {
//   Box, Typography, FormControl, InputLabel, Select, MenuItem,
//   Button, Alert, Tabs, Tab, Paper, TextField, Stack
// } from "@mui/material";
// import { api } from "../api/endpoints"; // поправь путь к api если нужно
// import { COUNTRY_OPTIONS } from "../page_elements/Countries";

// const ACCOUNTING_PROGRAMS = [
//   { value: "rivile", label: "Rivile GAMA/ERP" },
//   { value: "bss", label: "BSS Buhalterija" },
//   { value: "finvalda", label: "Finvalda" },
//   { value: "centas", label: "Centas" },
//   { value: "apskaita5", label: "Apskaita5" },
// ];

// function ImportTab({ label, url, templateHeader, templateExample, templateFileName }) {
//   const [file, setFile] = useState(null);
//   const [result, setResult] = useState(null);
//   const [error, setError] = useState(null);

//   const handleFile = (e) => {
//     setFile(e.target.files[0]);
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
//       setResult(data);
//       setError(null);
//     } catch (err) {
//       setError(err?.response?.data?.error || "Importo klaida");
//       setResult(null);
//     }
//   };

//   // Кнопка скачивания CSV-шаблона
//   const handleDownloadTemplate = () => {
//     // Используем ; всегда
//     const csvContent =
//       '\uFEFF' + templateHeader + "\r\n" + (templateExample || "") + "\r\n";
//     const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
//     const link = document.createElement("a");
//     link.href = URL.createObjectURL(blob);
//     link.download = templateFileName || "template.csv";
//     link.click();
//     setTimeout(() => URL.revokeObjectURL(link.href), 1000);
//   };

//   return (
//     <Paper sx={{ p: 2, mb: 2 }}>
//       <Typography gutterBottom variant="subtitle1">
//         {label}
//       </Typography>
//       <input
//         type="file"
//         accept=".csv"
//         onChange={handleFile}
//         style={{ marginBottom: 12 }}
//       />
//       <Button
//         variant="contained"
//         disabled={!file}
//         onClick={handleImport}
//         sx={{ ml: 2 }}
//       >
//         Importuoti
//       </Button>
//       <Button
//         variant="outlined"
//         size="small"
//         sx={{ ml: 2, mt: 2 }}
//         onClick={handleDownloadTemplate}
//       >
//         Atsisiųsti CSV šabloną
//       </Button>
//       {result && (
//         <Alert severity="success" sx={{ mt: 2 }}>
//           Importuota įrašų: {result.imported} iš {result.processed}
//         </Alert>
//       )}
//       {error && (
//         <Alert severity="error" sx={{ mt: 2 }}>
//           {error}
//         </Alert>
//       )}
//     </Paper>
//   );
// }

// export default function NustatymaiPage() {
//   const [user, setUser] = useState(null);
//   const [program, setProgram] = useState("");
//   const [saving, setSaving] = useState(false);
//   const [success, setSuccess] = useState(false);

//   // Для company details
//   const [companyName, setCompanyName] = useState("");
//   const [companyCode, setCompanyCode] = useState("");
//   const [vatCode, setVatCode] = useState("");
//   const [savingCompany, setSavingCompany] = useState(false);
//   const [successCompany, setSuccessCompany] = useState(false);

//   // Для табов импорта
//   const [importTab, setImportTab] = useState(0);

//   useEffect(() => {
//     api.get("/profile/", { withCredentials: true }).then(({ data }) => {
//       setUser(data);
//       setProgram(data.default_accounting_program || "");
//       setCompanyName(data.company_name || "");
//       setCompanyCode(data.company_code || "");
//       setVatCode(data.vat_code || "");
//     });
//   }, []);

//   const handleChange = (e) => setProgram(e.target.value);

//   const save = async () => {
//     setSaving(true);
//     try {
//       await api.patch(
//         "/profile/",
//         { default_accounting_program: program },
//         { withCredentials: true }
//       );
//       setSuccess(true);
//       setTimeout(() => setSuccess(false), 2000);
//     } finally {
//       setSaving(false);
//     }
//   };

//   // Обновление company details
//   const saveCompanyDetails = async () => {
//     setSavingCompany(true);
//     try {
//       await api.patch(
//         "/profile/update-company/",
//         {
//           company_name: companyName,
//           company_code: companyCode,
//           vat_code: vatCode,
//         },
//         { withCredentials: true }
//       );
//       setSuccessCompany(true);
//       setTimeout(() => setSuccessCompany(false), 2000);
//     } finally {
//       setSavingCompany(false);
//     }
//   };

//   // Показываем ли вкладки импорта для Centas
//   const showCentasImport =
//     program === "centas" || (user && user.default_accounting_program === "centas");

//   return (
//     <Box p={4} maxWidth={600}>
//       <Typography variant="h5" gutterBottom>
//         Nustatymai
//       </Typography>

//       {/* === Форма для company details === */}
//       <Paper sx={{ p: 3, mb: 3 }}>
//         <Typography variant="subtitle1" sx={{ mb: 2 }}>
//           Įmonės informacija
//         </Typography>
//         <Stack spacing={2} direction="column">
//           <TextField
//             label="Įmonės pavadinimas"
//             value={companyName}
//             onChange={e => setCompanyName(e.target.value)}
//             fullWidth
//           />
//           <TextField
//             label="Įmonės kodas"
//             value={companyCode}
//             onChange={e => setCompanyCode(e.target.value)}
//             fullWidth
//           />
//           <TextField
//             label="PVM kodas"
//             value={vatCode}
//             onChange={e => setVatCode(e.target.value)}
//             fullWidth
//           />
//           <Button
//             variant="contained"
//             onClick={saveCompanyDetails}
//             disabled={savingCompany}
//             sx={{ alignSelf: "flex-start", mt: 1 }}
//           >
//             Išsaugoti
//           </Button>
//           {successCompany && <Alert severity="success">Išsaugota!</Alert>}
//         </Stack>
//       </Paper>
//       {/* === Конец формы company details === */}

//       <FormControl fullWidth sx={{ mb: 3 }}>
//         <InputLabel id="acc-prog-label">Numatytoji programa</InputLabel>
//         <Select
//           labelId="acc-prog-label"
//           value={program}
//           label="Numatytoji programa"
//           onChange={handleChange}
//         >
//           {ACCOUNTING_PROGRAMS.map((p) => (
//             <MenuItem key={p.value} value={p.value}>
//               {p.label}
//             </MenuItem>
//           ))}
//         </Select>
//       </FormControl>
//       <Button
//         variant="contained"
//         disabled={!program || saving}
//         onClick={save}
//       >
//         Išsaugoti
//       </Button>
//       {success && <Alert severity="success" sx={{ mt: 2 }}>Išsaugota!</Alert>}

//       {/* --- Tabs для centas (только если выбрана) --- */}
//       {showCentasImport && (
//         <Box mt={6}>
//           <Typography variant="h6" gutterBottom>
//             Centas — duomenų importas
//           </Typography>
//           <Tabs
//             value={importTab}
//             onChange={(_, v) => setImportTab(v)}
//             sx={{ mb: 2 }}
//           >
//             <Tab label="Prekės" />
//             <Tab label="Įmonės" />
//           </Tabs>
//           {importTab === 0 && (
//             <ImportTab
//               label="Importuoti prekes iš CSV"
//               url="/data/import-products/"
//               templateHeader="prekes_pavadinimas;prekes_kodas;prekes_barkodas"
//               templateExample="preke1;P-001;123456789"
//               templateFileName="prekes_sablonas.csv"
//             />
//           )}
//           {importTab === 1 && (
//             <ImportTab
//               label="Importuoti įmones iš CSV"
//               url="/data/import-clients/"
//               templateHeader="kodas_buh_programoje;imones_pavadinimas;imones_kodas;imones_pvm_kodas;imones_IBAN;imones_adresas;imones_salis"
//               templateExample="CC-001;UAB Demo;300000123;LT123456789;LT121234567890123456;Vilnius, Vilniaus g. 1;Lietuva"
//               templateFileName="imones_sablonas.csv"
//             />
//           )}
//         </Box>
//       )}
//     </Box>
//   );
// }