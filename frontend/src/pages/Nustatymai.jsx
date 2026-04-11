// import React, { useEffect, useState, useCallback, useRef } from "react";
// import {
//   Box, Typography, FormControl, InputLabel, Select, MenuItem,
//   Button, Alert, Tabs, Tab, Paper, TextField, Stack, RadioGroup,
//   FormControlLabel, Radio, IconButton, Tooltip, Switch, Table, TableContainer,
//   TableHead, TableRow, TableCell, TableBody, Grid2, Chip, Divider, List,
//   ListItem, ListItemButton, ListItemIcon, ListItemText, useMediaQuery,
// } from "@mui/material";

// import DeleteIcon from "@mui/icons-material/Delete";
// import { alpha, useTheme } from "@mui/material/styles";
// import EditIcon from '@mui/icons-material/Edit';
// import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
// import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
// import BusinessIcon from "@mui/icons-material/Business";
// import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
// import SettingsIcon from "@mui/icons-material/Settings";
// import UploadFileIcon from "@mui/icons-material/UploadFile";
// import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
// import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
// import CloudIcon from "@mui/icons-material/Cloud";
// import ApiIcon from "@mui/icons-material/Api";
// import TuneIcon from "@mui/icons-material/Tune";
// import CheckCircleIcon from "@mui/icons-material/CheckCircle";
// import KeyIcon from "@mui/icons-material/Key";
// import Autocomplete from "@mui/material/Autocomplete";
// import { api } from "../api/endpoints";
// import { COUNTRY_OPTIONS } from "../page_elements/Countries";
// import { ACCOUNTING_PROGRAMS } from "../page_elements/AccountingPrograms";
// import { AccountingProgramExtraSettings } from "../page_elements/AccountingProgramExtraSettings";
// import { Helmet } from "react-helmet";
// import CloudIntegrationSettings from '../components/CloudIntegrationSettings';
// import RivileGamaAPIKeys from "../components/RivileGamaAPIKeys";
// import ExtraFieldsManager from '../components/ExtraFieldsManager';

// // ═══════════════════════════════════════════════════════════════════════════
// // NAVIGATION SECTIONS CONFIG
// // ═══════════════════════════════════════════════════════════════════════════

// const SECTIONS = [
//   { id: "company", label: "Įmonės informacija", icon: BusinessIcon },
//   { id: "accounting", label: "Apskaitos programa", icon: AccountBalanceIcon },
//   { id: "api", label: "API nustatymai", icon: ApiIcon },
//   { id: "extra", label: "Papildomi nustatymai", icon: TuneIcon },
//   { id: "import", label: "Duomenų importas", icon: UploadFileIcon },
//   { id: "automation", label: "Automatizacijos", icon: AutoFixHighIcon },
//   { id: "mobile", label: "Mobilūs kvietimai", icon: PhoneIphoneIcon },
//   { id: "cloud", label: "Debesų integracija", icon: CloudIcon },
// ];

// // ═══════════════════════════════════════════════════════════════════════════
// // STYLED COMPONENTS & HELPERS
// // ═══════════════════════════════════════════════════════════════════════════

// const SectionCard = ({ children, sx = {} }) => (
//   <Paper
//     elevation={0}
//     sx={{
//       p: { xs: 2.5, md: 3.5 },
//       borderRadius: 3,
//       border: "1px solid",
//       borderColor: "divider",
//       backgroundColor: "background.paper",
//       ...sx,
//     }}
//   >
//     {children}
//   </Paper>
// );

// const SectionHeader = ({ icon: Icon, title, subtitle, action }) => (
//   <Box sx={{ mb: 3 }}>
//     <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mb: subtitle ? 1 : 0 }}>
//       <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
//         {Icon && (
//           <Box
//             sx={{
//               width: 40,
//               height: 40,
//               borderRadius: 2,
//               background: (theme) => `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.primary.main, 0.05)} 100%)`,
//               display: "flex",
//               alignItems: "center",
//               justifyContent: "center",
//             }}
//           >
//             <Icon sx={{ fontSize: 22, color: "primary.main" }} />
//           </Box>
//         )}
//         <Typography variant="h6" sx={{ fontWeight: 600, fontSize: { xs: "1.1rem", md: "1.25rem" } }}>
//           {title}
//         </Typography>
//       </Box>
//       {action}
//     </Box>
//     {subtitle && (
//       <Typography variant="body2" sx={{ color: "text.secondary", ml: Icon ? 7 : 0 }}>
//         {subtitle}
//       </Typography>
//     )}
//   </Box>
// );

// const FieldGroup = ({ title, children, sx = {} }) => (
//   <Box sx={{ mb: 3, ...sx }}>
//     {title && (
//       <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 600, letterSpacing: 1, display: "block", mb: 1.5 }}>
//         {title}
//       </Typography>
//     )}
//     {children}
//   </Box>
// );

// const StatusChip = ({ status, label }) => {
//   const colors = {
//     success: { bg: "success.50", color: "success.dark", border: "success.200" },
//     error: { bg: "error.50", color: "error.dark", border: "error.200" },
//     warning: { bg: "warning.50", color: "warning.dark", border: "warning.200" },
//   };
//   const c = colors[status] || colors.warning;
  
//   return (
//     <Chip
//       size="small"
//       label={label}
//       sx={{
//         fontWeight: 600,
//         fontSize: "0.75rem",
//         backgroundColor: c.bg,
//         color: c.color,
//         border: "1px solid",
//         borderColor: c.border,
//       }}
//     />
//   );
// };

// // ═══════════════════════════════════════════════════════════════════════════
// // PVM COPY TEXT
// // ═══════════════════════════════════════════════════════════════════════════

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

// const PREKES_ASSEMBLY_OPTIONS = [
//   { value: 1, label: "Paprasta" },
//   { value: 2, label: "Komplektuojama" },
//   { value: 3, label: "Išskaidoma" },
//   { value: 4, label: "Generavimai" },
//   { value: 5, label: "Sudėtinė" },
//   { value: 6, label: "Komplektuojama/Išskaidoma" },
//   { value: 7, label: "Mišri" },
//   { value: 8, label: "Tara" },
// ];

// // ═══════════════════════════════════════════════════════════════════════════
// // IMPORT TAB COMPONENT
// // ═══════════════════════════════════════════════════════════════════════════

// function ImportTab({ label, url, templateFileName }) {
//   const [file, setFile] = useState(null);
//   const [result, setResult] = useState(null);
//   const [error, setError] = useState(null);
//   const inputRef = React.useRef(null);

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
//     <Box
//       sx={{
//         p: 3,
//         borderRadius: 2,
//         backgroundColor: "grey.50",
//         border: "1px dashed",
//         borderColor: "grey.300",
//       }}
//     >
//       <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>{label}</Typography>

//       <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "stretch", sm: "center" }} sx={{ mb: 2 }}>
//         <Button variant="outlined" component="label" sx={{ flexShrink: 0 }}>
//           Pasirinkti failą
//           <input type="file" accept=".xlsx" hidden ref={inputRef} onChange={handleFile} />
//         </Button>
//         <Typography variant="body2" sx={{ color: file ? "text.primary" : "text.secondary" }}>
//           {file ? file.name : "Niekas nepasirinkta"}
//         </Typography>
//       </Stack>

//       <Stack direction="row" spacing={2}>
//         <Button variant="contained" disabled={!file} onClick={handleImport}>
//           Importuoti
//         </Button>
//         <Button variant="text" size="small" onClick={handleDownloadTemplate}>
//           Atsisiųsti šabloną
//         </Button>
//       </Stack>

//       {result && (
//         <Alert severity="success" sx={{ mt: 2 }}>
//           Importuota įrašų: {result?.imported ?? 0} iš {result?.processed ?? 0}
//         </Alert>
//       )}
//       {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
//     </Box>
//   );
// }

// // ═══════════════════════════════════════════════════════════════════════════
// // DEFAULTS FIELDS COMPONENT
// // ═══════════════════════════════════════════════════════════════════════════

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
//         size="small"
//       />
//       <TextField
//         label={labels.imones_kodas}
//         value={state.imones_kodas}
//         onChange={onChangeField("imones_kodas")}
//         fullWidth
//         size="small"
//         required
//         error={touched && !state.imones_kodas?.trim()}
//         helperText={touched && !state.imones_kodas?.trim() ? "Privalomas laukas" : ""}
//       />
//       <TextField
//         label={labels.imones_pvm_kodas}
//         value={state.imones_pvm_kodas}
//         onChange={onChangeField("imones_pvm_kodas")}
//         fullWidth
//         size="small"
//       />

//       <TextField
//         label={labels.pavadinimas}
//         value={state.pavadinimas}
//         onChange={onChangeField("pavadinimas")}
//         fullWidth
//         size="small"
//         required
//         error={touched && !state.pavadinimas?.trim()}
//         helperText={touched && !state.pavadinimas?.trim() ? "Privalomas laukas" : ""}
//       />
//       <TextField
//         label={labels.kodas}
//         value={state.kodas}
//         onChange={onChangeField("kodas")}
//         fullWidth
//         size="small"
//         required
//         error={touched && !state.kodas?.trim()}
//         helperText={touched && !state.kodas?.trim() ? "Privalomas laukas" : ""}
//       />
//       <TextField
//         label={labels.barkodas}
//         value={state.barkodas}
//         onChange={onChangeField("barkodas")}
//         fullWidth
//         size="small"
//       />
//       <FormControl fullWidth required error={touched && !state.tipas} size="small">
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
//           size="small"
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

// // ═══════════════════════════════════════════════════════════════════════════
// // DEFAULTS CARDS LIST
// // ═══════════════════════════════════════════════════════════════════════════

// function DefaultsCards({ rows, onDelete, onEdit }) {
//   if (!rows?.length) {
//     return (
//       <Box
//         sx={{
//           textAlign: "center",
//           py: 5,
//           px: 3,
//           border: "2px dashed",
//           borderColor: "grey.300",
//           borderRadius: 2,
//           backgroundColor: "grey.50",
//         }}
//       >
//         <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 500 }}>
//           Nėra išsaugotų profilių
//         </Typography>
//         <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mt: 0.5 }}>
//           Sukurkite pirmąjį profilį aukščiau
//         </Typography>
//       </Box>
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
//     <Stack spacing={1.5}>
//       {rows.map((r, idx) => {
//         const role = r.__role === "buyer" ? "buyer" : "seller";
//         const roleLabel = role === "buyer" ? "Pirkėjas" : "Pardavėjas";
//         const roleColor = role === "buyer" ? "success" : "primary";

//         return (
//           <Box
//             key={`${role}-${idx}`}
//             sx={{
//               border: "1px solid",
//               borderColor: "grey.200",
//               borderRadius: 2,
//               overflow: "hidden",
//               transition: "all 0.15s ease",
//               "&:hover": {
//                 borderColor: "grey.300",
//                 boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
//               },
//             }}
//           >
//             <Box
//               sx={{
//                 display: "flex",
//                 alignItems: "center",
//                 justifyContent: "space-between",
//                 px: 2,
//                 py: 1.25,
//                 backgroundColor: "grey.50",
//                 borderBottom: "1px solid",
//                 borderColor: "grey.200",
//               }}
//             >
//               <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
//                 <Chip
//                   label={roleLabel}
//                   size="small"
//                   color={roleColor}
//                   sx={{ fontWeight: 600, fontSize: "0.7rem" }}
//                 />
//                 <Typography variant="body2" sx={{ fontWeight: 500, color: "text.secondary" }}>
//                   #{idx + 1}
//                 </Typography>
//               </Box>

//               <Stack direction="row" spacing={0.5}>
//                 <IconButton size="small" onClick={() => onEdit(idx)}>
//                   <EditIcon fontSize="small" sx={{ color: "text.secondary" }} />
//                 </IconButton>
//                 <IconButton size="small" onClick={() => onDelete(idx)}>
//                   <DeleteOutlineIcon fontSize="small" sx={{ color: "error.main" }} />
//                 </IconButton>
//               </Stack>
//             </Box>

//             <Box sx={{ p: 2, backgroundColor: "white" }}>
//               <Grid2 container spacing={2}>
//                 <Grid2 size={{ xs: 12, sm: 6 }}>
//                   <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 0.75 }}>
//                     Sąlygos
//                   </Typography>
//                   <Stack spacing={0.25}>
//                     {r.imones_pavadinimas && (
//                       <Typography variant="body2">Įmonė: <strong>{r.imones_pavadinimas}</strong></Typography>
//                     )}
//                     {r.imones_kodas && (
//                       <Typography variant="body2">Kodas: <strong>{r.imones_kodas}</strong></Typography>
//                     )}
//                     {r.imones_pvm_kodas && (
//                       <Typography variant="body2">PVM: <strong>{r.imones_pvm_kodas}</strong></Typography>
//                     )}
//                     {!r.imones_pavadinimas && !r.imones_kodas && !r.imones_pvm_kodas && (
//                       <Typography variant="body2" color="text.disabled">—</Typography>
//                     )}
//                   </Stack>
//                 </Grid2>

//                 <Grid2 size={{ xs: 12, sm: 6 }}>
//                   <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 0.75 }}>
//                     Taikyti
//                   </Typography>
//                   <Stack spacing={0.25}>
//                     {r.pavadinimas && (
//                       <Typography variant="body2">Pavadinimas: <strong>{r.pavadinimas}</strong></Typography>
//                     )}
//                     <Typography variant="body2">Kodas: <strong>{r.kodas || "—"}</strong></Typography>
//                     <Typography variant="body2">Tipas: <strong>{tipasLabel(r.tipas)}</strong></Typography>
//                   </Stack>
//                 </Grid2>
//               </Grid2>
//             </Box>
//           </Box>
//         );
//       })}
//     </Stack>
//   );
// }

// // ═══════════════════════════════════════════════════════════════════════════
// // SIDEBAR NAVIGATION
// // ═══════════════════════════════════════════════════════════════════════════

// function SidebarNav({ activeSection, onNavigate }) {
//   return (
//     <Paper
//       elevation={0}
//       sx={{
//         position: "sticky",
//         top: 24,
//         borderRadius: 3,
//         border: "1px solid",
//         borderColor: "divider",
//         overflow: "hidden",
//       }}
//     >
//       <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
//         <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.primary" }}>
//           Nustatymai
//         </Typography>
//       </Box>
//       <List sx={{ p: 1 }}>
//         {SECTIONS.map((section) => {
//           const Icon = section.icon;
//           const isActive = activeSection === section.id;
          
//           return (
//             <ListItem key={section.id} disablePadding sx={{ mb: 0.25 }}>
//               <ListItemButton
//                 onClick={() => onNavigate(section.id)}
//                 sx={{
//                   borderRadius: 1.5,
//                   py: 1,
//                   px: 1.5,
//                   backgroundColor: isActive ? "primary.50" : "transparent",
//                   "&:hover": {
//                     backgroundColor: isActive ? "primary.50" : "grey.100",
//                   },
//                 }}
//               >
//                 <ListItemIcon sx={{ minWidth: 36 }}>
//                   <Icon sx={{ fontSize: 20, color: isActive ? "primary.main" : "text.secondary" }} />
//                 </ListItemIcon>
//                 <ListItemText
//                   primary={section.label}
//                   primaryTypographyProps={{
//                     variant: "body2",
//                     fontWeight: isActive ? 600 : 400,
//                     color: isActive ? "primary.main" : "text.primary",
//                   }}
//                 />
//               </ListItemButton>
//             </ListItem>
//           );
//         })}
//       </List>
//     </Paper>
//   );
// }

// // ═══════════════════════════════════════════════════════════════════════════
// // MAIN PAGE COMPONENT
// // ═══════════════════════════════════════════════════════════════════════════

// export default function NustatymaiPage() {
//   const theme = useTheme();
//   const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  
//   const [activeSection, setActiveSection] = useState("company");
//   const sectionRefs = useRef({});

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
  
//   const [dinetaSettings, setDinetaSettings] = useState({
//     url: "",
//     username: "",
//     password: "",
//   });
//   const [dinetaLoading, setDinetaLoading] = useState(false);
//   const [dinetaSaving, setDinetaSaving] = useState(false);
//   const [dinetaSuccess, setDinetaSuccess] = useState(false);
//   const [dinetaError, setDinetaError] = useState("");

//   // --- Optimum ---
//   const [optimumSettings, setOptimumSettings] = useState({ key: "" });
//   const [optimumSaving, setOptimumSaving] = useState(false);
//   const [optimumSuccess, setOptimumSuccess] = useState(false);
//   const [optimumError, setOptimumError] = useState("");

//   const [optimumMeta, setOptimumMeta] = useState({
//     has_key: false,
//     key_suffix: "",
//     verified_at: null,
//     last_ok: null,
//     last_error_at: null,
//     last_error: "",
//   });
//   const [optimumTesting, setOptimumTesting] = useState(false);
//   const [optimumDeleting, setOptimumDeleting] = useState(false);
//   const [showOptimumKeyInput, setShowOptimumKeyInput] = useState(false);

//   // ---- DokSkenas mobile keys ----
//   const [mobileKeys, setMobileKeys] = useState([]);

//   const [mobileInviteForm, setMobileInviteForm] = useState({
//     email: "",
//     label: "",
//   });

//   const [mobileInviteLoading, setMobileInviteLoading] = useState(false);
//   const [mobileInviteSuccess, setMobileInviteSuccess] = useState(false);
//   const [mobileInviteError, setMobileInviteError] = useState("");

//   const formatMobileKeyMasked = (keyLast4) => {
//     if (!keyLast4) return "—";
//     return "••••••••" + String(keyLast4).slice(-4);
//   };

//   const [importTab, setImportTab] = useState(0);

//   const [sumiskaiRole, setSumiskaiRole] = useState("buyer");
//   const [editingIndex, setEditingIndex] = useState(null);

//   const [sumiskaiCompany, setSumiskaiCompany] = useState({
//     imones_pavadinimas: "",
//     imones_kodas: "",
//     imones_pvm_kodas: "",
//   });

//   const [sumiskaiApply, setSumiskaiApply] = useState({
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
//     vat_value: null,
//     name_contains: null,
//     buyer_id: null,
//     buyer_vat_code: null,
//     seller_id: null,
//     seller_vat_code: null,
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

//   const [rivileErpFields, setRivileErpFields] = useState({
//     pirkimas_zurnalo_kodas: "",
//     pirkimas_padalinio_kodas: "",
//     pirkimas_objekto_kodas: "",
//     pardavimas_zurnalo_kodas: "",
//     pardavimas_padalinio_kodas: "",
//     pardavimas_objekto_kodas: "",
//   });

//   const [savingRivileErp, setSavingRivileErp] = useState(false);
//   const [successRivileErp, setSuccessRivileErp] = useState(false);
//   const [errorRivileErp, setErrorRivileErp] = useState("");

//   const [rivileGamaFields, setRivileGamaFields] = useState({
//     pirkimas_padalinys: "",
//     pirkimas_objektas: "",
//     pirkimas_serija: "",
//     pirkimas_centras: "",
//     pirkimas_atskaitingas_asmuo: "",
//     pirkimas_logistika: "",
//     pirkimas_pinigu_saskaitos_kodas: "",
//     pirkimas_saskaitos_rysio_kodas: "",
//     pirkimas_prekes_grupe: "",
//     pirkimas_paslaugos_grupe: "",
//     pirkimas_kodo_grupe: "",
//     pardavimas_padalinys: "",
//     pardavimas_objektas: "",
//     pardavimas_serija: "",
//     pardavimas_centras: "",
//     pardavimas_atskaitingas_asmuo: "",
//     pardavimas_logistika: "",
//     pardavimas_pinigu_saskaitos_kodas: "",
//     pardavimas_saskaitos_rysio_kodas: "",
//     pardavimas_prekes_grupe: "",
//     pardavimas_paslaugos_grupe: "",
//     pardavimas_kodo_grupe: "",
//   });

//   const [savingRivileGama, setSavingRivileGama] = useState(false);
//   const [successRivileGama, setSuccessRivileGama] = useState(false);
//   const [errorRivileGama, setErrorRivileGama] = useState("");

//   // --- Butent ---
//   const [butentFields, setButentFields] = useState({
//     pirkimas_sandelis: "",
//     pirkimas_operacija: "",
//     pardavimas_sandelis: "",
//     pardavimas_operacija: "",
//   });
//   const [savingButent, setSavingButent] = useState(false);
//   const [successButent, setSuccessButent] = useState(false);
//   const [errorButent, setErrorButent] = useState("");

//   // --- Finvalda ---
//   const [finvaldaFields, setFinvaldaFields] = useState({
//     pirkimas_sandelis: "",
//     pirkimas_tipas: "",
//     pirkimas_zurnalas: "",
//     pirkimas_padalinys: "",
//     pirkimas_darbuotojas: "",
//     pardavimas_sandelis: "",
//     pardavimas_tipas: "",
//     pardavimas_zurnalas: "",
//     pardavimas_padalinys: "",
//     pardavimas_darbuotojas: "",
//   });
//   const [savingFinvalda, setSavingFinvalda] = useState(false);
//   const [successFinvalda, setSuccessFinvalda] = useState(false);
//   const [errorFinvalda, setErrorFinvalda] = useState("");

//   // --- Centas ---
//   const [centasFields, setCentasFields] = useState({
//     pirkimas_sandelis: "",
//     pirkimas_kastu_centras: "",
//     pardavimas_sandelis: "",
//     pardavimas_kastu_centras: "",
//   });
//   const [savingCentas, setSavingCentas] = useState(false);
//   const [successCentas, setSuccessCentas] = useState(false);
//   const [errorCentas, setErrorCentas] = useState("");

//   // --- Pragma4 ---
//   const [pragma4Fields, setPragma4Fields] = useState({
//     pirk_sandelio_kodas: "",
//     pirk_projekto_kodas: "",
//     pirk_centro_kodas: "",
//     pirk_dk_schemos_kodas: "",
//     pard_sandelio_kodas: "",
//     pard_projekto_kodas: "",
//     pard_centro_kodas: "",
//     pard_dk_schemos_kodas: "",
//   });
//   const [savingPragma4, setSavingPragma4] = useState(false);
//   const [successPragma4, setSuccessPragma4] = useState(false);
//   const [errorPragma4, setErrorPragma4] = useState("");

//   // --- Dineta ---
//   const [dinetaFields, setDinetaFields] = useState({
//     pirk_sandelio_kodas: "",
//     pard_sandelio_kodas: "",
//   });
//   const [savingDineta, setSavingDineta] = useState(false);
//   const [successDineta, setSuccessDineta] = useState(false);
//   const [errorDineta, setErrorDineta] = useState("");

//   // --- Optimum ---
//   const [optimumFields, setOptimumFields] = useState({
//     pirk_prekes_tipas: "",
//     pirk_prekes_grupe: "",
//     pirk_sandelio_kodas: "",
//     pirk_skyriaus_kodas: "",
//     pirk_projekto_kodas: "",
//     pirk_atsakingo_darb_kodas: "",
//     tiekejo_grupe: "",
//     pard_prekes_tipas: "",
//     pard_prekes_grupe: "",
//     pard_sandelio_kodas: "",
//     pard_skyriaus_kodas: "",
//     pard_projekto_kodas: "",
//     pard_atsakingo_darb_kodas: "",
//     pirkejo_grupe: "",
//   });
//   const [savingOptimum, setSavingOptimum] = useState(false);
//   const [successOptimum, setSuccessOptimum] = useState(false);
//   const [errorOptimum, setErrorOptimum] = useState("");

//   // --- Pragma 3 ---
//   const [pragma3Fields, setPragma3Fields] = useState({
//     pirkimas_sandelis: "",
//     pirkimas_korespondencija: "",
//     pirkimas_projektas: "",
//     pardavimas_sandelis: "",
//     pardavimas_korespondencija: "",
//     pardavimas_projektas: "",
//   });
//   const [savingPragma3, setSavingPragma3] = useState(false);
//   const [successPragma3, setSuccessPragma3] = useState(false);
//   const [errorPragma3, setErrorPragma3] = useState("");

//   // --- Site.pro ---
//   const [siteProFields, setSiteProFields] = useState({
//     pirkimas_prekes_grupe: "",
//     pirkimas_sandelis: "",
//     pirkimas_darbuotojas: "",
//     pirkimas_kastu_centras: "",
//     pardavimas_prekes_grupe: "",
//     pardavimas_sandelis: "",
//     pardavimas_darbuotojas: "",
//     pardavimas_kastu_centras: "",
//   });
//   const [savingSitePro, setSavingSitePro] = useState(false);
//   const [successSitePro, setSuccessSitePro] = useState(false);
//   const [errorSitePro, setErrorSitePro] = useState("");

//   // --- Debetas ---
//   const [debetasFields, setDebetasFields] = useState({
//     pirkimas_filialas: "",
//     pirkimas_padalinys: "",
//     pirkimas_objektas: "",
//     pirkimas_materialiai_atsakingas_asmuo: "",
//     pirkimas_atskaitingas_asmuo: "",
//     pardavimas_filialas: "",
//     pardavimas_padalinys: "",
//     pardavimas_objektas: "",
//     pardavimas_materialiai_atsakingas_asmuo: "",
//     pardavimas_atskaitingas_asmuo: "",
//   });
//   const [savingDebetas, setSavingDebetas] = useState(false);
//   const [successDebetas, setSuccessDebetas] = useState(false);
//   const [errorDebetas, setErrorDebetas] = useState("");

//   // --- Agnum ---
//   const [agnumFields, setAgnumFields] = useState({
//     pirkimas_sandelis: "",
//     pirkimas_grupe: "",
//     pirkimas_objektas: "",
//     pardavimas_sandelis: "",
//     pardavimas_grupe: "",
//     pardavimas_objektas: "",
//   });
//   const [savingAgnum, setSavingAgnum] = useState(false);
//   const [successAgnum, setSuccessAgnum] = useState(false);
//   const [errorAgnum, setErrorAgnum] = useState("");

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

//   const [prekesAssemblyPirkimas, setPrekesAssemblyPirkimas] = useState(1);
//   const [prekesAssemblyPardavimas, setPrekesAssemblyPardavimas] = useState(1);
//   const [paslaugosAssemblyPirkimas, setPaslaugosAssemblyPirkimas] = useState(1);
//   const [paslaugosAssemblyPardavimas, setPaslaugosAssemblyPardavimas] = useState(1);

//   const [savingPrekesAssembly, setSavingPrekesAssembly] = useState(false);
//   const [successPrekesAssembly, setSuccessPrekesAssembly] = useState(false);

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

//   // ═══════════════════════════════════════════════════════════════════════════
//   // NAVIGATION HANDLER
//   // ═══════════════════════════════════════════════════════════════════════════

//   const handleNavigate = useCallback((sectionId) => {
//     setActiveSection(sectionId);
//     const element = sectionRefs.current[sectionId];
//     if (element) {
//       const yOffset = -24;
//       const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
//       window.scrollTo({ top: y, behavior: "smooth" });
//     }
//   }, []);

//   // ═══════════════════════════════════════════════════════════════════════════
//   // DATA LOADING
//   // ═══════════════════════════════════════════════════════════════════════════

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

//       const ref = data.rivile_erp_extra_fields || {};
//       setRivileErpFields({
//         pirkimas_zurnalo_kodas: ref.pirkimas_zurnalo_kodas || "",
//         pirkimas_padalinio_kodas: ref.pirkimas_padalinio_kodas || "",
//         pirkimas_objekto_kodas: ref.pirkimas_objekto_kodas || "",
//         pardavimas_zurnalo_kodas: ref.pardavimas_zurnalo_kodas || "",
//         pardavimas_padalinio_kodas: ref.pardavimas_padalinio_kodas || "",
//         pardavimas_objekto_kodas: ref.pardavimas_objekto_kodas || "",
//       });

//       const gama = data.rivile_gama_extra_fields || {};
//       setRivileGamaFields({
//         pirkimas_padalinys: gama.pirkimas_padalinys || "",
//         pirkimas_objektas: gama.pirkimas_objektas || "",
//         pirkimas_serija: gama.pirkimas_serija || "",
//         pirkimas_centras: gama.pirkimas_centras || "",
//         pirkimas_atskaitingas_asmuo: gama.pirkimas_atskaitingas_asmuo || "",
//         pirkimas_logistika: gama.pirkimas_logistika || "",
//         pirkimas_pinigu_saskaitos_kodas: gama.pirkimas_pinigu_saskaitos_kodas || "",
//         pirkimas_saskaitos_rysio_kodas: gama.pirkimas_saskaitos_rysio_kodas || "",
//         pirkimas_prekes_grupe: gama.pirkimas_prekes_grupe || "",
//         pirkimas_paslaugos_grupe: gama.pirkimas_paslaugos_grupe || "",
//         pirkimas_kodo_grupe: gama.pirkimas_kodo_grupe || "",
//         pardavimas_padalinys: gama.pardavimas_padalinys || "",
//         pardavimas_objektas: gama.pardavimas_objektas || "",
//         pardavimas_serija: gama.pardavimas_serija || "",
//         pardavimas_centras: gama.pardavimas_centras || "",
//         pardavimas_atskaitingas_asmuo: gama.pardavimas_atskaitingas_asmuo || "",
//         pardavimas_logistika: gama.pardavimas_logistika || "",
//         pardavimas_pinigu_saskaitos_kodas: gama.pardavimas_pinigu_saskaitos_kodas || "",
//         pardavimas_saskaitos_rysio_kodas: gama.pardavimas_saskaitos_rysio_kodas || "",
//         pardavimas_prekes_grupe: gama.pardavimas_prekes_grupe || "",
//         pardavimas_paslaugos_grupe: gama.pardavimas_paslaugos_grupe || "",
//         pardavimas_kodo_grupe: gama.pardavimas_kodo_grupe || "",
//       });

//       setPrekesAssemblyPirkimas(gama.prekes_assembly_pirkimas != null ? Number(gama.prekes_assembly_pirkimas) : 1);
//       setPrekesAssemblyPardavimas(gama.prekes_assembly_pardavimas != null ? Number(gama.prekes_assembly_pardavimas) : 1);
//       setPaslaugosAssemblyPirkimas(gama.paslaugos_assembly_pirkimas != null ? Number(gama.paslaugos_assembly_pirkimas) : 1);
//       setPaslaugosAssemblyPardavimas(gama.paslaugos_assembly_pardavimas != null ? Number(gama.paslaugos_assembly_pardavimas) : 1);

//       const butent = data.butent_extra_fields || {};
//       setButentFields({
//         pirkimas_sandelis: butent.pirkimas_sandelis || "",
//         pirkimas_operacija: butent.pirkimas_operacija || "",
//         pardavimas_sandelis: butent.pardavimas_sandelis || "",
//         pardavimas_operacija: butent.pardavimas_operacija || "",
//       });

//       const fin = data.finvalda_extra_fields || {};
//       setFinvaldaFields({
//         pirkimas_sandelis: fin.pirkimas_sandelis || "",
//         pirkimas_tipas: fin.pirkimas_tipas || "",
//         pirkimas_zurnalas: fin.pirkimas_zurnalas || "",
//         pirkimas_padalinys: fin.pirkimas_padalinys || "",
//         pirkimas_darbuotojas: fin.pirkimas_darbuotojas || "",
//         pardavimas_sandelis: fin.pardavimas_sandelis || "",
//         pardavimas_tipas: fin.pardavimas_tipas || "",
//         pardavimas_zurnalas: fin.pardavimas_zurnalas || "",
//         pardavimas_padalinys: fin.pardavimas_padalinys || "",
//         pardavimas_darbuotojas: fin.pardavimas_darbuotojas || "",
//       });

//       const cent = data.centas_extra_fields || {};
//       setCentasFields({
//         pirkimas_sandelis: cent.pirkimas_sandelis || "",
//         pirkimas_kastu_centras: cent.pirkimas_kastu_centras || "",
//         pardavimas_sandelis: cent.pardavimas_sandelis || "",
//         pardavimas_kastu_centras: cent.pardavimas_kastu_centras || "",
//       });

//       const pragma4 = data.pragma4_extra_fields || {};
//       setPragma4Fields({
//         pirk_sandelio_kodas: pragma4.pirk_sandelio_kodas || "",
//         pirk_projekto_kodas: pragma4.pirk_projekto_kodas || "",
//         pirk_centro_kodas: pragma4.pirk_centro_kodas || "",
//         pirk_dk_schemos_kodas: pragma4.pirk_dk_schemos_kodas || "",
//         pard_sandelio_kodas: pragma4.pard_sandelio_kodas || "",
//         pard_projekto_kodas: pragma4.pard_projekto_kodas || "",
//         pard_centro_kodas: pragma4.pard_centro_kodas || "",
//         pard_dk_schemos_kodas: pragma4.pard_dk_schemos_kodas || "",
//       });

//       const dineta = data.dineta_extra_fields || {};
//       setDinetaFields({
//         pirk_sandelio_kodas: dineta.pirk_sandelio_kodas || "",
//         pard_sandelio_kodas: dineta.pard_sandelio_kodas || "",
//       });

//       const optimum = data.optimum_extra_fields || {};
//       setOptimumFields({
//         pirk_prekes_tipas: optimum.pirk_prekes_tipas || "",
//         pirk_prekes_grupe: optimum.pirk_prekes_grupe || "",
//         pirk_sandelio_kodas: optimum.pirk_sandelio_kodas || "",
//         pirk_skyriaus_kodas: optimum.pirk_skyriaus_kodas || "",
//         pirk_projekto_kodas: optimum.pirk_projekto_kodas || "",
//         pirk_atsakingo_darb_kodas: optimum.pirk_atsakingo_darb_kodas || "",
//         tiekejo_grupe: optimum.tiekejo_grupe || "",
//         pard_prekes_tipas: optimum.pard_prekes_tipas || "",
//         pard_prekes_grupe: optimum.pard_prekes_grupe || "",
//         pard_sandelio_kodas: optimum.pard_sandelio_kodas || "",
//         pard_skyriaus_kodas: optimum.pard_skyriaus_kodas || "",
//         pard_projekto_kodas: optimum.pard_projekto_kodas || "",
//         pard_atsakingo_darb_kodas: optimum.pard_atsakingo_darb_kodas || "",
//         pirkejo_grupe: optimum.pirkejo_grupe || "",
//       });

//       const debetas = data.debetas_extra_fields || {};
//       setDebetasFields({
//         pirkimas_filialas: debetas.pirkimas_filialas || "",
//         pirkimas_padalinys: debetas.pirkimas_padalinys || "",
//         pirkimas_objektas: debetas.pirkimas_objektas || "",
//         pirkimas_materialiai_atsakingas_asmuo: debetas.pirkimas_materialiai_atsakingas_asmuo || "",
//         pirkimas_atskaitingas_asmuo: debetas.pirkimas_atskaitingas_asmuo || "",
//         pardavimas_filialas: debetas.pardavimas_filialas || "",
//         pardavimas_padalinys: debetas.pardavimas_padalinys || "",
//         pardavimas_objektas: debetas.pardavimas_objektas || "",
//         pardavimas_materialiai_atsakingas_asmuo: debetas.pardavimas_materialiai_atsakingas_asmuo || "",
//         pardavimas_atskaitingas_asmuo: debetas.pardavimas_atskaitingas_asmuo || "",
//       });

//       const pragma3 = data.pragma3_extra_fields || {};
//       setPragma3Fields({
//         pirkimas_sandelis: pragma3.pirkimas_sandelis || "",
//         pirkimas_korespondencija: pragma3.pirkimas_korespondencija || "",
//         pirkimas_projektas: pragma3.pirkimas_projektas || "",
//         pardavimas_sandelis: pragma3.pardavimas_sandelis || "",
//         pardavimas_korespondencija: pragma3.pardavimas_korespondencija || "",
//         pardavimas_projektas: pragma3.pardavimas_projektas || "",
//       });

//       const sitePro = data.site_pro_extra_fields || {};
//       setSiteProFields({
//         pirkimas_prekes_grupe: sitePro.pirkimas_prekes_grupe || "",
//         pirkimas_sandelis: sitePro.pirkimas_sandelis || "",
//         pirkimas_darbuotojas: sitePro.pirkimas_darbuotojas || "",
//         pirkimas_kastu_centras: sitePro.pirkimas_kastu_centras || "",
//         pardavimas_prekes_grupe: sitePro.pardavimas_prekes_grupe || "",
//         pardavimas_sandelis: sitePro.pardavimas_sandelis || "",
//         pardavimas_darbuotojas: sitePro.pardavimas_darbuotojas || "",
//         pardavimas_kastu_centras: sitePro.pardavimas_kastu_centras || "",
//       });

//       const agn = data.agnum_extra_fields || {};
//       setAgnumFields({
//         pirkimas_sandelis: agn.pirkimas_sandelis || "",
//         pirkimas_grupe: agn.pirkimas_grupe || "",
//         pirkimas_objektas: agn.pirkimas_objektas || "",
//         pardavimas_sandelis: agn.pardavimas_sandelis || "",
//         pardavimas_grupe: agn.pardavimas_grupe || "",
//         pardavimas_objektas: agn.pardavimas_objektas || "",
//       });

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

//   const loadMobileKeys = useCallback(async () => {
//     try {
//       const { data } = await api.get("/mobile/keys/", { withCredentials: true });
//       setMobileKeys(Array.isArray(data) ? data : []);
//     } catch (e) {
//       console.error("Failed to load mobile keys", e);
//     }
//   }, []);

//   useEffect(() => {
//     loadMobileKeys();
//   }, [loadMobileKeys]);

//   useEffect(() => {
//     if (program !== "dineta") return;

//     setDinetaLoading(true);
//     setDinetaError("");
//     api
//       .get("/settings/dineta/", { withCredentials: true })
//       .then(({ data }) => {
//         setDinetaSettings((prev) => ({
//           ...prev,
//           url: data?.url || "",
//           username: data?.username || "",
//           password: data?.password || "",
//         }));
//       })
//       .catch((err) => {
//         console.error("Failed to load Dineta settings:", err);
//       })
//       .finally(() => setDinetaLoading(false));
//   }, [program]);

//   useEffect(() => {
//     if (program !== "optimum") return;
//     refreshOptimumMeta();
//   }, [program]);

//   useEffect(() => {
//     setRuleForm((prev) => {
//       if (program !== "rivile" && prev.result_tipas === "Kodas") {
//         return { ...prev, result_tipas: "Prekė", result_kodas_kaip: "" };
//       }
//       return prev;
//     });
//   }, [program]);

//   // ═══════════════════════════════════════════════════════════════════════════
//   // HANDLERS (unchanged from original)
//   // ═══════════════════════════════════════════════════════════════════════════

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

//     const missingName = !companyName || !companyName.trim();
//     const missingCode = !companyCode || !companyCode.trim();
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
//       if (!sumiskaiCompany.imones_kodas?.trim() || !sumiskaiApply.kodas?.trim() || !sumiskaiApply.tipas) {
//         setErrorDefaults("Įmonės kodas, Kodas ir Tipas yra privalomi.");
//         setSavingDefaults(false);
//         return;
//       }

//       if ((sumiskaiApply.tipas || "").toLowerCase() === "kodas" && program === "rivile" && !sumiskaiApply.kodas_kaip) {
//         setErrorDefaults("Pasirinkus Kodas, būtina nurodyti Nustatyti PVM klasifikatorių kaip.");
//         setSavingDefaults(false);
//         return;
//       }

//       const payloadItem = {
//         imones_pavadinimas: sumiskaiCompany.imones_pavadinimas || "",
//         imones_kodas: sumiskaiCompany.imones_kodas || "",
//         imones_pvm_kodas: sumiskaiCompany.imones_pvm_kodas || "",
//         pavadinimas: (sumiskaiApply.pavadinimas || "").trim(),
//         kodas: (sumiskaiApply.kodas || "").trim(),
//         barkodas: sumiskaiApply.barkodas || "",
//         tipas: tipasToNum(sumiskaiApply.tipas, sumiskaiApply.kodas_kaip),
//       };

//       const payload =
//         sumiskaiRole === "buyer"
//           ? { purchase_defaults: [payloadItem] }
//           : { sales_defaults: [payloadItem] };

//       await api.patch("/profile/", payload, { withCredentials: true });

//       if (sumiskaiRole === "buyer") {
//         const next =
//           editingIndex !== null
//             ? purchaseList.map((x, i) => (i === editingIndex ? payloadItem : x))
//             : mergeProfileIntoList(purchaseList, payloadItem);

//         await api.patch("/profile/", { purchase_defaults: next }, { withCredentials: true });
//         setPurchaseList(next);
//       } else {
//         const next =
//           editingIndex !== null
//             ? salesList.map((x, i) => (i === editingIndex ? payloadItem : x))
//             : mergeProfileIntoList(salesList, payloadItem);

//         await api.patch("/profile/", { sales_defaults: next }, { withCredentials: true });
//         setSalesList(next);
//       }

//       setSumiskaiCompany({ imones_pavadinimas: "", imones_kodas: "", imones_pvm_kodas: "" });
//       setSumiskaiApply({ pavadinimas: "", kodas: "", barkodas: "", tipas: "Prekė", kodas_kaip: "" });
//       setEditingIndex(null);
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

//   const saveDinetaSettings = async () => {
//     setDinetaSaving(true);
//     setDinetaError("");
//     setDinetaSuccess(false);

//     const { url, username, password } = dinetaSettings;

//     if (!url.trim() || !username.trim() || !password) {
//       setDinetaError("Visi API laukai yra privalomi.");
//       setDinetaSaving(false);
//       return;
//     }

//     try {
//       const { data: resData } = await api.put("/settings/dineta/", { url, username, password }, { withCredentials: true });

//       setDinetaSettings((prev) => ({
//         ...prev,
//         url: resData?.url || prev.url,
//         username: resData?.username || prev.username,
//         password: resData?.password || "••••••••",
//       }));

//       if (resData?.connection_status === "warning") {
//         setDinetaError(resData.connection_message || "Prisijungimo patikrinimas nepavyko.");
//       }

//       setDinetaSuccess(true);
//       setTimeout(() => setDinetaSuccess(false), 3000);
//     } catch (e) {
//       const data = e?.response?.data;
//       let msg = data?.detail || data?.non_field_errors || data?.error || "Nepavyko išsaugoti Dineta nustatymų.";
//       if (typeof msg === "object") {
//         try { msg = JSON.stringify(msg); } catch { msg = "Nepavyko išsaugoti Dineta nustatymų."; }
//       }
//       setDinetaError(msg);
//     } finally {
//       setDinetaSaving(false);
//     }
//   };

//   const refreshOptimumMeta = async () => {
//     try {
//       const { data } = await api.get("/settings/optimum/", { withCredentials: true });
//       setOptimumMeta({
//         has_key: !!data?.has_key,
//         key_suffix: data?.key_suffix ?? "",
//         verified_at: data?.verified_at ?? null,
//         last_ok: data?.last_ok ?? null,
//         last_error_at: data?.last_error_at ?? null,
//         last_error: data?.last_error ?? "",
//       });
//     } catch (err) {
//       console.warn("Failed to refresh optimum meta:", err);
//     }
//   };

//   const saveOptimumSettings = async () => {
//     setOptimumSaving(true);
//     setOptimumError("");
//     setOptimumSuccess(false);

//     const key = (optimumSettings.key || "").trim();
//     if (!key) {
//       setOptimumError("API Key yra privalomas.");
//       setOptimumSaving(false);
//       return;
//     }

//     try {
//       const { data } = await api.put("/settings/optimum/", { key }, { withCredentials: true });

//       setOptimumSettings({ key: "" });
//       setOptimumMeta({
//         has_key: !!data?.has_key,
//         key_suffix: data?.key_suffix ?? "",
//         verified_at: data?.verified_at ?? null,
//         last_ok: data?.last_ok ?? null,
//         last_error_at: data?.last_error_at ?? null,
//         last_error: data?.last_error ?? "",
//       });
//       setShowOptimumKeyInput(false);
//       setOptimumSuccess(true);
//       setTimeout(() => setOptimumSuccess(false), 2500);
//     } catch (e) {
//       const data = e?.response?.data;
//       let msg = data?.detail || data?.last_error || "Nepavyko patikrinti Optimum API Key.";
//       if (typeof msg === "object") {
//         try { msg = JSON.stringify(msg); } catch { msg = "Nepavyko patikrinti Optimum API Key."; }
//       }
//       setOptimumError(String(msg));
//       await refreshOptimumMeta();
//     } finally {
//       setOptimumSaving(false);
//     }
//   };

//   const testOptimumKey = async () => {
//     setOptimumTesting(true);
//     setOptimumError("");
//     setOptimumSuccess(false);

//     try {
//       const { data } = await api.post("/settings/optimum/", {}, { withCredentials: true });
//       setOptimumMeta({
//         has_key: !!data?.has_key,
//         key_suffix: data?.key_suffix ?? "",
//         verified_at: data?.verified_at ?? null,
//         last_ok: data?.last_ok ?? null,
//         last_error_at: data?.last_error_at ?? null,
//         last_error: data?.last_error ?? "",
//       });
//       setOptimumSuccess(true);
//       setTimeout(() => setOptimumSuccess(false), 2500);
//     } catch (e) {
//       const data = e?.response?.data;
//       let msg = data?.detail || data?.last_error || "Nepavyko patikrinti Optimum API Key.";
//       if (typeof msg === "object") {
//         try { msg = JSON.stringify(msg); } catch { msg = "Nepavyko patikrinti."; }
//       }
//       setOptimumError(String(msg));
//       await refreshOptimumMeta();
//     } finally {
//       setOptimumTesting(false);
//     }
//   };

//   const deleteOptimumKey = async () => {
//     if (!window.confirm("Ar tikrai norite ištrinti Optimum API raktą?")) return;
//     setOptimumDeleting(true);
//     setOptimumError("");
//     setOptimumSuccess(false);

//     try {
//       await api.delete("/settings/optimum/", { withCredentials: true });
//       setOptimumMeta({ has_key: false, key_suffix: "", verified_at: null, last_ok: null, last_error_at: null, last_error: "" });
//       setShowOptimumKeyInput(false);
//       setOptimumSettings({ key: "" });
//     } catch (e) {
//       const data = e?.response?.data;
//       setOptimumError(data?.detail || "Nepavyko ištrinti rakto.");
//     } finally {
//       setOptimumDeleting(false);
//     }
//   };

//   const deleteProfile = async (mode, index) => {
//     try {
//       const payload =
//         mode === "pirkimas"
//           ? { purchase_defaults: { __delete_index__: index } }
//           : { sales_defaults: { __delete_index__: index } };

//       await api.patch("/profile/", payload, { withCredentials: true });

//       if (mode === "pirkimas") setPurchaseList((prev) => prev.filter((_, i) => i !== index));
//       else setSalesList((prev) => prev.filter((_, i) => i !== index));
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

//       if (program === "rivile" && ruleForm.result_tipas === "Kodas" && !ruleForm.result_kodas_kaip) {
//         setRulesError("Pasirinkus Kodas, būtina nurodyti Nustatyti PVM klasifikatorių kaip.");
//         setSavingRules(false);
//         return;
//       }

//       const hasAnyCondition =
//         ruleForm.apply_to_all ||
//         ruleForm.vat_value !== null ||
//         ruleForm.name_contains !== null ||
//         ruleForm.buyer_id !== null ||
//         ruleForm.buyer_vat_code !== null ||
//         ruleForm.seller_id !== null ||
//         ruleForm.seller_vat_code !== null;

//       if (!hasAnyCondition) {
//         setRulesError("Pasirinkite bent vieną sąlygą.");
//         setSavingRules(false);
//         return;
//       }

//       const nextId =
//         ruleForm.id ??
//         (lineitemRules.reduce((max, r) => (typeof r.id === "number" && r.id > max ? r.id : max), 0) + 1);

//       const payloadRule = {
//         id: nextId,
//         enabled: !!ruleForm.enabled,
//         apply_to_all: !!ruleForm.apply_to_all,
//         vat_percent: ruleForm.apply_to_all ? null : ruleForm.vat_value !== null ? { op: ruleForm.vat_op, value: Number(ruleForm.vat_value) } : null,
//         name_contains: ruleForm.apply_to_all ? "" : ruleForm.name_contains || "",
//         buyer_id: ruleForm.apply_to_all ? "" : ruleForm.buyer_id || "",
//         buyer_vat_code: ruleForm.apply_to_all ? "" : ruleForm.buyer_vat_code || "",
//         seller_id: ruleForm.apply_to_all ? "" : ruleForm.seller_id || "",
//         seller_vat_code: ruleForm.apply_to_all ? "" : ruleForm.seller_vat_code || "",
//         result_kodas: ruleForm.result_kodas.trim(),
//         result_tipas: ruleForm.result_tipas || "Prekė",
//         result_kodas_kaip: program === "rivile" && ruleForm.result_tipas === "Kodas" ? ruleForm.result_kodas_kaip || "" : "",
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

//       await api.patch("/profile/", { lineitem_rules: newList }, { withCredentials: true });

//       setLineitemRules(newList);
//       setRuleForm({
//         id: null,
//         enabled: true,
//         vat_op: "=",
//         vat_value: null,
//         name_contains: null,
//         buyer_id: null,
//         buyer_vat_code: null,
//         seller_id: null,
//         seller_vat_code: null,
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
//       let msg = data?.lineitem_rules || data?.detail || "Nepavyko išsaugoti taisyklės.";
//       if (typeof msg === "object") {
//         try { msg = JSON.stringify(msg); } catch { msg = "Nepavyko išsaugoti taisyklės."; }
//       }
//       setRulesError(msg);
//     } finally {
//       setSavingRules(false);
//     }
//   };

//   const deleteLineitemRule = async (id) => {
//     const newList = lineitemRules.filter((r) => r.id !== id);
//     try {
//       await api.patch("/profile/", { lineitem_rules: newList }, { withCredentials: true });
//       setLineitemRules(newList);
//     } catch (e) {
//       alert(e?.response?.data?.detail || "Nepavyko ištrinti taisyklės.");
//     }
//   };

//   // Extra settings toggles
//   const opDateKey = "operation_date=document_date";
//   const isOpDateFromDoc = Boolean(extraSettings && Object.prototype.hasOwnProperty.call(extraSettings, opDateKey));
//   const toggleOpDateFromDoc = async (e) => {
//     const checked = e.target.checked;
//     const next = { ...(extraSettings || {}) };
//     if (checked) next[opDateKey] = 1;
//     else if (opDateKey in next) delete next[opDateKey];
//     setExtraSettings(next);
//     try {
//       await api.patch("/profile/", { extra_settings: next }, { withCredentials: true });
//     } catch {
//       setExtraSettings(extraSettings || {});
//       alert("Nepavyko išsaugoti papildomų nustatymų.");
//     }
//   };

//   const fixDeltaKey = "fix_delta";
//   const isFixDeltaEnabled = Boolean(extraSettings && extraSettings[fixDeltaKey] === 1);
//   const toggleFixDelta = async (e) => {
//     const checked = e.target.checked;
//     const next = { ...(extraSettings || {}) };
//     if (checked) next[fixDeltaKey] = 1;
//     else if (fixDeltaKey in next) delete next[fixDeltaKey];
//     setExtraSettings(next);
//     try {
//       await api.patch("/profile/", { extra_settings: next }, { withCredentials: true });
//     } catch {
//       setExtraSettings(extraSettings || {});
//       alert("Nepavyko išsaugoti papildomų nustatymų.");
//     }
//   };

//   const exportMergeVatKey = "merge_vat";
//   const isExportMergeVat = Boolean(extraSettings && Object.prototype.hasOwnProperty.call(extraSettings, exportMergeVatKey));
//   const toggleExportMergeVat = async (e) => {
//     const checked = e.target.checked;
//     const prev = extraSettings || {};
//     const next = { ...prev };

//     if (checked) next[exportMergeVatKey] = 1;
//     else if (exportMergeVatKey in next) delete next[exportMergeVatKey];

//     setExtraSettings(next);
//     try {
//       await api.patch("/profile/", { extra_settings: next }, { withCredentials: true });
//     } catch {
//       setExtraSettings(prev);
//       alert("Nepavyko išsaugoti papildomų nustatymų.");
//     }
//   };

//   const rivileFracKey = "rivile_fraction";
//   const rivileFraction = Number(extraSettings?.[rivileFracKey] ?? 1);

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

//   const handleCreateMobileKey = async () => {
//     setMobileInviteError("");
//     setMobileInviteSuccess(false);

//     const email = (mobileInviteForm.email || "").trim();
//     const label = (mobileInviteForm.label || "").trim();

//     if (!email) {
//       setMobileInviteError("El. paštas yra privalomas.");
//       return;
//     }
//     if (!label) {
//       setMobileInviteError("Pavadinimas yra privalomas.");
//       return;
//     }

//     setMobileInviteLoading(true);
//     try {
//       const { data } = await api.post("/mobile/keys/", { email, label }, { withCredentials: true });
//       setMobileKeys((prev) => [data, ...prev]);
//       setMobileInviteSuccess(true);
//       setMobileInviteForm({ email: "", label: "" });
//       setTimeout(() => setMobileInviteSuccess(false), 2500);
//     } catch (e) {
//       const resp = e?.response?.data;
//       let msg = resp?.detail || resp?.error || "Nepavyko sukurti ir išsiųsti kvietimo.";
//       if (typeof msg === "object") {
//         try { msg = JSON.stringify(msg); } catch { msg = "Nepavyko sukurti ir išsiųsti kvietimo."; }
//       }
//       setMobileInviteError(String(msg));
//     } finally {
//       setMobileInviteLoading(false);
//     }
//   };

//   const handleToggleMobileKey = async (id, isActive) => {
//     try {
//       const { data } = await api.patch(`/mobile/keys/${id}/`, { is_active: !isActive }, { withCredentials: true });
//       setMobileKeys((prev) => prev.map((item) => (item.id === id ? { ...item, ...(data || { is_active: !isActive }) } : item)));
//     } catch (e) {
//       console.error("Failed to toggle mobile key", e);
//     }
//   };

//   const handleDeleteMobileKey = async (id) => {
//     if (!window.confirm("Ar tikrai ištrinti šį kvietimą?")) return;
//     try {
//       await api.delete(`/mobile/keys/${id}/`, { withCredentials: true });
//       setMobileKeys((prev) => prev.filter((item) => item.id !== id));
//     } catch (e) {
//       console.error("Failed to delete mobile key", e);
//     }
//   };

//   const handleSumiskaiRole = (nextRole) => {
//     if (nextRole === sumiskaiRole) return;
//     setSumiskaiRole(nextRole);
//     setSumiskaiCompany({ imones_pavadinimas: "", imones_kodas: "", imones_pvm_kodas: "" });
//     setTouchedDefaults(false);
//     setErrorDefaults("");
//   };

//   const handleEditSumiskai = (role, index) => {
//     const list = role === "buyer" ? purchaseList : salesList;
//     const item = list[index];
//     if (!item) return;

//     setSumiskaiRole(role);
//     setSumiskaiCompany({
//       imones_pavadinimas: item.imones_pavadinimas || "",
//       imones_kodas: item.imones_kodas || "",
//       imones_pvm_kodas: item.imones_pvm_kodas || "",
//     });
//     setSumiskaiApply({
//       pavadinimas: item.pavadinimas || "",
//       kodas: item.kodas || "",
//       barkodas: item.barkodas || "",
//       tipas: item.tipas === 2 ? "Paslauga" : item.tipas === 3 || item.tipas === 4 ? "Kodas" : "Prekė",
//       kodas_kaip: item.tipas === 4 ? "Paslaugai" : item.tipas === 3 ? "Prekei" : "",
//     });
//     setEditingIndex(index);
//   };

//   const combinedProfiles = [
//     ...purchaseList.map((x) => ({ ...x, __role: "buyer" })),
//     ...salesList.map((x) => ({ ...x, __role: "seller" })),
//   ];

//   // ═══════════════════════════════════════════════════════════════════════════
//   // RENDER
//   // ═══════════════════════════════════════════════════════════════════════════

//   return (
//     <Box sx={{ minHeight: "100vh", backgroundColor: "grey.50" }}>
//       <Helmet>
//         <title>Nustatymai - DokSkenas</title>
//       </Helmet>

//       <Box sx={{ maxWidth: 1400, mx: "auto", px: { xs: 2, md: 4 }, py: { xs: 3, md: 4 } }}>
//         {/* Header */}
//         <Box sx={{ mb: 4 }}>
//           <Typography variant="h4" sx={{ fontWeight: 700, color: "text.primary", mb: 0.5 }}>
//             Nustatymai
//           </Typography>
//           <Typography variant="body1" sx={{ color: "text.secondary" }}>
//             Valdykite savo paskyros ir integracijos nustatymus
//           </Typography>
//         </Box>

//         <Box sx={{ display: "flex", gap: 4 }}>
//           {/* Sidebar - desktop only */}
//           {!isMobile && (
//             <Box sx={{ width: 260, flexShrink: 0 }}>
//               <SidebarNav activeSection={activeSection} onNavigate={handleNavigate} />
//             </Box>
//           )}

//           {/* Main content */}
//           <Box sx={{ flex: 1, minWidth: 0 }}>
//             <Stack spacing={4}>
//               {/* ═══════════════════════════════════════════════════════════════════════════ */}
//               {/* SECTION: Company Information */}
//               {/* ═══════════════════════════════════════════════════════════════════════════ */}
//               <Box ref={(el) => (sectionRefs.current["company"] = el)} id="company">
//                 <SectionCard>
//                   <SectionHeader
//                     icon={BusinessIcon}
//                     title="Įmonės informacija"
//                     subtitle="Pagrindiniai jūsų įmonės duomenys"
//                   />

//                   <Grid2 container spacing={2.5}>
//                     <Grid2 size={{ xs: 12, md: 6 }}>
//                       <TextField
//                         label="Įmonės pavadinimas"
//                         value={companyName}
//                         onChange={(e) => setCompanyName(e.target.value)}
//                         onBlur={() => setCompanyNameTouched(true)}
//                         fullWidth
//                         size="small"
//                         required
//                         error={companyNameTouched && !companyName.trim()}
//                         helperText={companyNameTouched && !companyName.trim() ? "Privalomas laukas" : ""}
//                       />
//                     </Grid2>
//                     <Grid2 size={{ xs: 12, md: 6 }}>
//                       <TextField
//                         label="Įmonės kodas"
//                         value={companyCode}
//                         onChange={(e) => setCompanyCode(e.target.value)}
//                         onBlur={() => setCompanyNameTouched(true)}
//                         fullWidth
//                         size="small"
//                         required
//                         error={companyNameTouched && !companyCode.trim()}
//                         helperText={companyNameTouched && !companyCode.trim() ? "Privalomas laukas" : ""}
//                       />
//                     </Grid2>
//                     <Grid2 size={{ xs: 12, md: 6 }}>
//                       <TextField
//                         label="PVM kodas"
//                         value={vatCode}
//                         onChange={(e) => setVatCode(e.target.value)}
//                         fullWidth
//                         size="small"
//                       />
//                     </Grid2>
//                     <Grid2 size={{ xs: 12, md: 6 }}>
//                       <TextField
//                         label="Įmonės IBAN"
//                         value={companyIban}
//                         onChange={(e) => setCompanyIban(e.target.value)}
//                         fullWidth
//                         size="small"
//                       />
//                     </Grid2>
//                     <Grid2 size={{ xs: 12, md: 6 }}>
//                       <TextField
//                         label="Įmonės adresas"
//                         value={companyAddress}
//                         onChange={(e) => setCompanyAddress(e.target.value)}
//                         fullWidth
//                         size="small"
//                       />
//                     </Grid2>
//                     <Grid2 size={{ xs: 12, md: 6 }}>
//                       <Autocomplete
//                         disablePortal
//                         options={COUNTRY_OPTIONS}
//                         getOptionLabel={(option) => option.name}
//                         value={COUNTRY_OPTIONS.find((opt) => opt.code === companyCountryIso) || null}
//                         onChange={(_, newValue) => setCompanyCountryIso(newValue ? newValue.code : "")}
//                         renderInput={(params) => (
//                           <TextField
//                             {...params}
//                             label="Įmonės šalis"
//                             fullWidth
//                             size="small"
//                             required
//                             error={companyNameTouched && !companyCountryIso}
//                             helperText={companyNameTouched && !companyCountryIso ? "Privalomas laukas" : ""}
//                           />
//                         )}
//                         isOptionEqualToValue={(option, value) => option.code === value.code}
//                       />
//                     </Grid2>
//                   </Grid2>

//                   <Box sx={{ mt: 3, display: "flex", alignItems: "center", gap: 2 }}>
//                     <Button variant="contained" onClick={saveCompanyDetails} disabled={savingCompany}>
//                       Išsaugoti
//                     </Button>
//                     {successCompany && <StatusChip status="success" label="Išsaugota!" />}
//                   </Box>

//                   {companyError && <Alert severity="error" sx={{ mt: 2 }}>{companyError}</Alert>}
//                 </SectionCard>
//               </Box>

//               {/* ═══════════════════════════════════════════════════════════════════════════ */}
//               {/* SECTION: Accounting Program */}
//               {/* ═══════════════════════════════════════════════════════════════════════════ */}
//               <Box ref={(el) => (sectionRefs.current["accounting"] = el)} id="accounting">
//                 <SectionCard>
//                   <SectionHeader
//                     icon={AccountBalanceIcon}
//                     title="Apskaitos programa"
//                     subtitle="Pasirinkite naudojamą buhalterinę programą"
//                   />

//                   <FormControl fullWidth size="small" sx={{ maxWidth: 400 }}>
//                     <InputLabel>Numatytoji programa</InputLabel>
//                     <Select
//                       value={program}
//                       label="Numatytoji programa"
//                       onChange={handleChange}
//                       disabled={saving}
//                     >
//                       {ACCOUNTING_PROGRAMS.map((p) => (
//                         <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
//                       ))}
//                     </Select>
//                   </FormControl>

//                   {success && <Alert severity="success" sx={{ mt: 2 }}>Išsaugota!</Alert>}

//                   {program === "apskaita5" && (
//                     <Box sx={{ mt: 3, p: 2.5, borderRadius: 2, backgroundColor: "grey.50", border: "1px solid", borderColor: "grey.200" }}>
//                       <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
//                         Apskaita5 įrankiai
//                       </Typography>
//                       <Stack direction="row" spacing={2}>
//                         <Button variant="outlined" size="small" component="a" href="/api/download/apskaita5-adapter/">
//                           Atsisiųsti adapterį
//                         </Button>
//                         <Button variant="outlined" size="small" onClick={handleCopyPvm}>
//                           Kopijuoti PVM kodus
//                         </Button>
//                       </Stack>
//                       {copiedPvm && <Alert severity="success" sx={{ mt: 1.5 }}>Nukopijuota į iškarpinę.</Alert>}
//                     </Box>
//                   )}

//                   {program === "rivile_gama_api" && (
//                     <Box sx={{ mt: 3 }}>
//                       <RivileGamaAPIKeys />
//                     </Box>
//                   )}

//                   {/* Extra Fields Manager */}
//                   <Box sx={{ mt: 3 }}>
//                     <ExtraFieldsManager program={program} />
//                   </Box>
//                 </SectionCard>
//               </Box>

//               {/* ═══════════════════════════════════════════════════════════════════════════ */}
//               {/* SECTION: API Settings */}
//               {/* ═══════════════════════════════════════════════════════════════════════════ */}
//               {(program === "dineta" || program === "optimum") && (
//                 <Box ref={(el) => (sectionRefs.current["api"] = el)} id="api">
//                   <SectionCard>
//                     <SectionHeader
//                       icon={ApiIcon}
//                       title="API nustatymai"
//                       subtitle="Konfigūruokite išorinių sistemų integraciją"
//                     />

//                     {/* Dineta API */}
//                     {program === "dineta" && (
//                       <Box>
//                         <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
//                           Dineta API sąsaja
//                         </Typography>
//                         <Grid2 container spacing={2}>
//                           <Grid2 size={{ xs: 12 }}>
//                             <TextField
//                               label="Dineta nuoroda"
//                               value={dinetaSettings.url}
//                               onChange={(e) => setDinetaSettings((prev) => ({ ...prev, url: e.target.value }))}
//                               fullWidth
//                               size="small"
//                               required
//                               disabled={dinetaLoading || dinetaSaving}
//                               placeholder="https://lt4.dineta.eu/dokskenas/login.php"
//                               helperText="Nukopijuokite nuorodą iš savo Dineta.web naršyklės adreso juostos"
//                             />
//                           </Grid2>
//                           <Grid2 size={{ xs: 12, md: 6 }}>
//                             <TextField
//                               label="API naudotojo vardas"
//                               value={dinetaSettings.username}
//                               onChange={(e) => setDinetaSettings((prev) => ({ ...prev, username: e.target.value }))}
//                               fullWidth
//                               size="small"
//                               required
//                               disabled={dinetaLoading || dinetaSaving}
//                             />
//                           </Grid2>
//                           <Grid2 size={{ xs: 12, md: 6 }}>
//                             <TextField
//                               label="API slaptažodis"
//                               type="password"
//                               value={dinetaSettings.password}
//                               onChange={(e) => setDinetaSettings((prev) => ({ ...prev, password: e.target.value }))}
//                               onFocus={(e) => { if (e.target.value === "••••••••") setDinetaSettings((prev) => ({ ...prev, password: "" })); }}
//                               onBlur={(e) => { if (!e.target.value) setDinetaSettings((prev) => ({ ...prev, password: "••••••••" })); }}
//                               fullWidth
//                               size="small"
//                               required
//                               disabled={dinetaLoading || dinetaSaving}
//                             />
//                           </Grid2>
//                         </Grid2>

//                         <Box sx={{ mt: 2.5, display: "flex", alignItems: "center", gap: 2 }}>
//                           <Button variant="contained" onClick={saveDinetaSettings} disabled={dinetaSaving || dinetaLoading}>
//                             Išsaugoti
//                           </Button>
//                           {dinetaLoading && <Typography variant="body2" color="text.secondary">Kraunama...</Typography>}
//                         </Box>

//                         {dinetaError && <Alert severity={dinetaSuccess ? "warning" : "error"} sx={{ mt: 2 }}>{dinetaError}</Alert>}
//                         {dinetaSuccess && <Alert severity="success" sx={{ mt: 2 }}>Dineta nustatymai išsaugoti!</Alert>}
//                       </Box>
//                     )}

//                     {/* Optimum API */}
//                     {program === "optimum" && (
//                       <Box>
//                         <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
//                           <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
//                             Optimum API raktas
//                           </Typography>
//                           <Tooltip arrow title="Įveskite Optimum API Key, kurį rasite savo Optimum programoje (Pagalba -> API raktas).">
//                             <HelpOutlineIcon fontSize="small" sx={{ color: "text.secondary" }} />
//                           </Tooltip>
//                         </Box>

//                         {optimumMeta.has_key && !showOptimumKeyInput ? (
//                           <Box>
//                             <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2, flexWrap: "wrap" }}>
//                               <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
//                                 <KeyIcon sx={{ fontSize: 18, color: "text.secondary" }} />
//                                 <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600 }}>
//                                   {"••••••••" + (optimumMeta.key_suffix || "****")}
//                                 </Typography>
//                               </Box>
//                               <StatusChip
//                                 status={optimumMeta.last_ok === true ? "success" : optimumMeta.last_ok === false ? "error" : "warning"}
//                                 label={optimumMeta.last_ok === true ? "Patikrintas ✓" : optimumMeta.last_ok === false ? "Klaida ✗" : "Nepatikrintas"}
//                               />
//                             </Box>

//                             {optimumMeta.verified_at && (
//                               <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 2 }}>
//                                 Paskutinis patikrinimas: {new Date(optimumMeta.verified_at).toLocaleString("lt-LT")}
//                               </Typography>
//                             )}

//                             {optimumMeta.last_ok === false && optimumMeta.last_error && (
//                               <Alert severity="error" sx={{ mb: 2 }}>{optimumMeta.last_error}</Alert>
//                             )}

//                             <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
//                               <Button variant="outlined" size="small" onClick={testOptimumKey} disabled={optimumTesting || optimumDeleting}>
//                                 {optimumTesting ? "Tikrinama..." : "Patikrinti"}
//                               </Button>
//                               <Button variant="outlined" size="small" onClick={() => { setShowOptimumKeyInput(true); setOptimumError(""); setOptimumSuccess(false); }} disabled={optimumTesting || optimumDeleting}>
//                                 Pakeisti
//                               </Button>
//                               <Button variant="outlined" size="small" color="error" onClick={deleteOptimumKey} disabled={optimumTesting || optimumDeleting}>
//                                 {optimumDeleting ? "Trinama..." : "Ištrinti"}
//                               </Button>
//                             </Stack>
//                           </Box>
//                         ) : (
//                           <Box>
//                             <TextField
//                               label="API Key"
//                               value={optimumSettings.key}
//                               onChange={(e) => { setOptimumSettings((prev) => ({ ...prev, key: e.target.value })); setOptimumSuccess(false); setOptimumError(""); }}
//                               fullWidth
//                               size="small"
//                               required
//                               disabled={optimumSaving}
//                               placeholder="Įveskite Optimum API raktą"
//                               sx={{ maxWidth: 400 }}
//                             />

//                             <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
//                               <Button variant="contained" onClick={saveOptimumSettings} disabled={optimumSaving}>
//                                 {optimumSaving ? "Tikrinama..." : "Išsaugoti ir patikrinti"}
//                               </Button>
//                               {showOptimumKeyInput && optimumMeta.has_key && (
//                                 <Button variant="outlined" onClick={() => { setShowOptimumKeyInput(false); setOptimumSettings({ key: "" }); setOptimumError(""); }}>
//                                   Atšaukti
//                                 </Button>
//                               )}
//                             </Stack>
//                           </Box>
//                         )}

//                         {optimumError && <Alert severity="error" sx={{ mt: 2 }}>{optimumError}</Alert>}
//                         {optimumSuccess && <Alert severity="success" sx={{ mt: 2 }}>Optimum API raktas patikrintas sėkmingai!</Alert>}
//                       </Box>
//                     )}
//                   </SectionCard>
//                 </Box>
//               )}

//               {/* ═══════════════════════════════════════════════════════════════════════════ */}
//               {/* SECTION: Additional Settings */}
//               {/* ═══════════════════════════════════════════════════════════════════════════ */}
//               <Box ref={(el) => (sectionRefs.current["extra"] = el)} id="extra">
//                 <SectionCard>
//                   <SectionHeader
//                     icon={TuneIcon}
//                     title="Papildomi nustatymai"
//                     subtitle="Pritaikykite sistemą pagal savo poreikius"
//                   />

//                   <Stack spacing={2}>
//                     <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1 }}>
//                       <Box>
//                         <Typography variant="body2" sx={{ fontWeight: 500 }}>
//                           Operacijos datą imti iš sąskaitos datos
//                         </Typography>
//                         <Typography variant="caption" sx={{ color: "text.secondary" }}>
//                           Sistema automatiškai naudos dokumento datą kaip operacijos datą
//                         </Typography>
//                       </Box>
//                       <Switch checked={isOpDateFromDoc} onChange={toggleOpDateFromDoc} />
//                     </Box>

//                     <Divider />

//                     <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1 }}>
//                       <Box>
//                         <Typography variant="body2" sx={{ fontWeight: 500 }}>
//                           Taisyti dokumento sumas kai skiriasi &lt;0,20
//                         </Typography>
//                         <Typography variant="caption" sx={{ color: "text.secondary" }}>
//                           Sistema pataisys apvalinimo skirtumus automatiškai
//                         </Typography>
//                       </Box>
//                       <Switch checked={isFixDeltaEnabled} onChange={toggleFixDelta} />
//                     </Box>

//                     <Divider />

//                     <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1 }}>
//                       <Box>
//                         <Typography variant="body2" sx={{ fontWeight: 500 }}>
//                           Neišskirti PVM eksportuojant
//                         </Typography>
//                         <Typography variant="caption" sx={{ color: "text.secondary" }}>
//                           Tinka ne PVM mokėtojų apskaitai
//                         </Typography>
//                       </Box>
//                       <Switch checked={isExportMergeVat} onChange={toggleExportMergeVat} />
//                     </Box>
//                   </Stack>

//                   {program === "rivile" && (
//                     <Box sx={{ mt: 3, p: 2.5, borderRadius: 2, backgroundColor: "grey.50", border: "1px solid", borderColor: "grey.200" }}>
//                       <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
//                         Rivilė nustatymai
//                       </Typography>
//                       <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
//                         <Typography variant="body2">Matavimo vienetų frakcija:</Typography>
//                         <FormControl size="small" sx={{ minWidth: 100 }}>
//                           <Select value={rivileFraction} onChange={(e) => setRivileFraction(Number(e.target.value))}>
//                             <MenuItem value={1}>1</MenuItem>
//                             <MenuItem value={10}>10</MenuItem>
//                             <MenuItem value={100}>100</MenuItem>
//                             <MenuItem value={1000}>1000</MenuItem>
//                           </Select>
//                         </FormControl>
//                         {rivileSaved && <StatusChip status="success" label="Išsaugota!" />}
//                       </Box>
//                     </Box>
//                   )}
//                 </SectionCard>
//               </Box>

//               {/* ═══════════════════════════════════════════════════════════════════════════ */}
//               {/* SECTION: Data Import */}
//               {/* ═══════════════════════════════════════════════════════════════════════════ */}
//               <Box ref={(el) => (sectionRefs.current["import"] = el)} id="import">
//                 <SectionCard>
//                   <SectionHeader
//                     icon={UploadFileIcon}
//                     title="Duomenų importas"
//                     subtitle="Importuokite prekes ir įmones iš Excel failų"
//                   />

//                   <Tabs
//                     value={importTab}
//                     onChange={(_, v) => setImportTab(v)}
//                     sx={{
//                       mb: 3,
//                       "& .MuiTab-root": { textTransform: "none", fontWeight: 500 },
//                     }}
//                   >
//                     <Tab label="Prekės" />
//                     <Tab label="Įmonės" />
//                   </Tabs>

//                   {importTab === 0 && (
//                     <ImportTab label="Importuoti prekes iš Excel" url="/data/import-products/" templateFileName="prekes_sablonas.xlsx" />
//                   )}
//                   {importTab === 1 && (
//                     <ImportTab label="Importuoti įmones iš Excel" url="/data/import-clients/" templateFileName="imones_sablonas.xlsx" />
//                   )}
//                 </SectionCard>
//               </Box>

//               {/* ═══════════════════════════════════════════════════════════════════════════ */}
//               {/* SECTION: Automations */}
//               {/* ═══════════════════════════════════════════════════════════════════════════ */}
//               <Box ref={(el) => (sectionRefs.current["automation"] = el)} id="automation">
//                 {/* Sumiskai defaults */}
//                 <SectionCard sx={{ mb: 3 }}>
//                   <SectionHeader
//                     icon={AutoFixHighIcon}
//                     title="Numatytosios reikšmės (sumiškai)"
//                     subtitle="Automatiškai priskiriamos reikšmės skaitmenizuojant sumiškai"
//                   />

//                   <Box sx={{ borderRadius: 2, border: "1px solid", borderColor: "grey.200", overflow: "hidden", mb: 3 }}>
//                     {/* Conditions */}
//                     <Box sx={{ p: 3, backgroundColor: "grey.50" }}>
//                       <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
//                         <Box sx={{ width: 24, height: 24, borderRadius: 1, backgroundColor: "primary.main", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem" }}>1</Box>
//                         Taikymo sąlygos
//                       </Typography>

//                       <Stack direction="row" spacing={3} sx={{ mb: 2 }}>
//                         <FormControlLabel
//                           control={<Switch checked={sumiskaiRole === "buyer"} onChange={() => handleSumiskaiRole("buyer")} color="success" />}
//                           label={<Typography variant="body2" sx={{ fontWeight: 500 }}>Pirkėjas</Typography>}
//                         />
//                         <FormControlLabel
//                           control={<Switch checked={sumiskaiRole === "seller"} onChange={() => handleSumiskaiRole("seller")} />}
//                           label={<Typography variant="body2" sx={{ fontWeight: 500 }}>Pardavėjas</Typography>}
//                         />
//                       </Stack>

//                       <Grid2 container spacing={2}>
//                         <Grid2 size={{ xs: 12, md: 4 }}>
//                           <TextField
//                             size="small"
//                             label="Įmonės pavadinimas"
//                             value={sumiskaiCompany.imones_pavadinimas}
//                             onChange={(e) => setSumiskaiCompany((prev) => ({ ...prev, imones_pavadinimas: e.target.value }))}
//                             fullWidth
//                           />
//                         </Grid2>
//                         <Grid2 size={{ xs: 12, md: 4 }}>
//                           <TextField
//                             size="small"
//                             label="Įmonės kodas"
//                             value={sumiskaiCompany.imones_kodas}
//                             onChange={(e) => setSumiskaiCompany((prev) => ({ ...prev, imones_kodas: e.target.value }))}
//                             fullWidth
//                             required
//                             error={touchedDefaults && !sumiskaiCompany.imones_kodas?.trim()}
//                           />
//                         </Grid2>
//                         <Grid2 size={{ xs: 12, md: 4 }}>
//                           <TextField
//                             size="small"
//                             label="Įmonės PVM kodas"
//                             value={sumiskaiCompany.imones_pvm_kodas}
//                             onChange={(e) => setSumiskaiCompany((prev) => ({ ...prev, imones_pvm_kodas: e.target.value }))}
//                             fullWidth
//                           />
//                         </Grid2>
//                       </Grid2>
//                     </Box>

//                     {/* Apply values */}
//                     <Box sx={{ p: 3, backgroundColor: "white" }}>
//                       <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
//                         <Box sx={{ width: 24, height: 24, borderRadius: 1, backgroundColor: "success.main", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem" }}>2</Box>
//                         Taikyti reikšmes
//                       </Typography>

//                       <Grid2 container spacing={2}>
//                         <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                           <TextField
//                             label="Kodas"
//                             size="small"
//                             value={sumiskaiApply.kodas}
//                             onChange={(e) => setSumiskaiApply((prev) => ({ ...prev, kodas: e.target.value }))}
//                             fullWidth
//                             required
//                             error={touchedDefaults && !sumiskaiApply.kodas?.trim()}
//                           />
//                         </Grid2>
//                         <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                           <FormControl size="small" fullWidth required>
//                             <InputLabel>Tipas</InputLabel>
//                             <Select
//                               label="Tipas"
//                               value={sumiskaiApply.tipas}
//                               onChange={(e) => setSumiskaiApply((prev) => ({ ...prev, tipas: e.target.value, ...(e.target.value !== "Kodas" && { kodas_kaip: "" }) }))}
//                             >
//                               <MenuItem value="Prekė">Prekė</MenuItem>
//                               <MenuItem value="Paslauga">Paslauga</MenuItem>
//                               {program === "rivile" && <MenuItem value="Kodas">Kodas</MenuItem>}
//                             </Select>
//                           </FormControl>
//                         </Grid2>
//                         <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                           <TextField
//                             label="Pavadinimas"
//                             size="small"
//                             value={sumiskaiApply.pavadinimas}
//                             onChange={(e) => setSumiskaiApply((prev) => ({ ...prev, pavadinimas: e.target.value }))}
//                             fullWidth
//                           />
//                         </Grid2>
//                         <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                           <TextField
//                             label="Barkodas"
//                             size="small"
//                             value={sumiskaiApply.barkodas}
//                             onChange={(e) => setSumiskaiApply((prev) => ({ ...prev, barkodas: e.target.value }))}
//                             fullWidth
//                           />
//                         </Grid2>
//                       </Grid2>

//                       {program === "rivile" && sumiskaiApply.tipas === "Kodas" && (
//                         <FormControl size="small" sx={{ width: 260, mt: 2 }} required>
//                           <InputLabel>Nustatyti PVM klasifikatorių kaip</InputLabel>
//                           <Select
//                             label="Nustatyti PVM klasifikatorių kaip"
//                             value={sumiskaiApply.kodas_kaip || ""}
//                             onChange={(e) => setSumiskaiApply((prev) => ({ ...prev, kodas_kaip: e.target.value }))}
//                           >
//                             <MenuItem value="Prekei">Prekei</MenuItem>
//                             <MenuItem value="Paslaugai">Paslaugai</MenuItem>
//                           </Select>
//                         </FormControl>
//                       )}

//                       <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
//                         <Button variant="contained" onClick={saveDefaults} disabled={savingDefaults}>
//                           {editingIndex !== null ? "Atnaujinti" : "Išsaugoti"}
//                         </Button>
//                         <Button
//                           variant="outlined"
//                           onClick={() => {
//                             setTouchedDefaults(false);
//                             setErrorDefaults("");
//                             setSumiskaiCompany({ imones_pavadinimas: "", imones_kodas: "", imones_pvm_kodas: "" });
//                             setSumiskaiApply({ pavadinimas: "", kodas: "", barkodas: "", tipas: "Prekė", kodas_kaip: "" });
//                             setEditingIndex(null);
//                           }}
//                         >
//                           Išvalyti
//                         </Button>
//                       </Stack>

//                       {successDefaults && <Alert severity="success" sx={{ mt: 2 }}>Išsaugota!</Alert>}
//                       {errorDefaults && <Alert severity="error" sx={{ mt: 2 }}>{errorDefaults}</Alert>}
//                     </Box>
//                   </Box>

//                   {/* Saved profiles */}
//                   <Box>
//                     <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
//                       <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
//                         Išsaugotos taisyklės
//                       </Typography>
//                       <Chip label={combinedProfiles.length} size="small" />
//                     </Box>
//                     <DefaultsCards
//                       rows={combinedProfiles}
//                       onDelete={(idx) => {
//                         const item = combinedProfiles[idx];
//                         const realIndex = item.__role === "buyer" ? idx : idx - purchaseList.length;
//                         deleteProfile(item.__role === "buyer" ? "pirkimas" : "pardavimas", realIndex);
//                       }}
//                       onEdit={(idx) => {
//                         const item = combinedProfiles[idx];
//                         const realIndex = item.__role === "buyer" ? idx : idx - purchaseList.length;
//                         handleEditSumiskai(item.__role, realIndex);
//                       }}
//                     />
//                   </Box>
//                 </SectionCard>

//                 {/* Detaliai rules */}
//                 <SectionCard>
//                   <SectionHeader
//                     icon={SettingsIcon}
//                     title="Numatytosios prekių reikšmės (detaliai)"
//                     subtitle="Automatiškai priskiriamos reikšmės skaitmenizuojant detaliai"
//                   />

//                   <Box sx={{ borderRadius: 2, border: "1px solid", borderColor: "grey.200", overflow: "hidden", mb: 3 }}>
//                     {/* Conditions */}
//                     <Box sx={{ p: 3, backgroundColor: "grey.50" }}>
//                       <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
//                         <Box sx={{ width: 24, height: 24, borderRadius: 1, backgroundColor: "primary.main", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem" }}>1</Box>
//                         Taikymo sąlygos
//                       </Typography>

//                       <Stack spacing={2}>
//                         <FormControlLabel
//                           control={
//                             <Switch
//                               checked={ruleForm.vat_value !== null}
//                               onChange={(e) => {
//                                 if (e.target.checked) setRuleForm((prev) => ({ ...prev, vat_value: "" }));
//                                 else setRuleForm((prev) => ({ ...prev, vat_value: null }));
//                               }}
//                               disabled={ruleForm.apply_to_all}
//                               size="small"
//                             />
//                           }
//                           label={<Typography variant="body2">PVM procentas</Typography>}
//                         />
//                         {ruleForm.vat_value !== null && !ruleForm.apply_to_all && (
//                           <Stack direction="row" spacing={1.5} sx={{ ml: 5 }}>
//                             <FormControl size="small" sx={{ minWidth: 80 }}>
//                               <Select value={ruleForm.vat_op} onChange={(e) => setRuleForm((prev) => ({ ...prev, vat_op: e.target.value }))}>
//                                 <MenuItem value="<">&lt;</MenuItem>
//                                 <MenuItem value="<=">&le;</MenuItem>
//                                 <MenuItem value="=">=</MenuItem>
//                                 <MenuItem value=">=">&ge;</MenuItem>
//                                 <MenuItem value=">">&gt;</MenuItem>
//                               </Select>
//                             </FormControl>
//                             <TextField
//                               size="small"
//                               value={ruleForm.vat_value}
//                               onChange={(e) => {
//                                 const val = e.target.value;
//                                 if (val === "") setRuleForm((prev) => ({ ...prev, vat_value: "" }));
//                                 else if (/^\d+$/.test(val)) {
//                                   const num = parseInt(val, 10);
//                                   if (num >= 0 && num <= 100) setRuleForm((prev) => ({ ...prev, vat_value: val }));
//                                 }
//                               }}
//                               sx={{ width: 100 }}
//                               InputProps={{ endAdornment: <Typography variant="body2" color="text.secondary">%</Typography> }}
//                             />
//                           </Stack>
//                         )}

//                         <FormControlLabel
//                           control={
//                             <Switch
//                               checked={ruleForm.name_contains !== null}
//                               onChange={(e) => {
//                                 if (e.target.checked) setRuleForm((prev) => ({ ...prev, name_contains: "" }));
//                                 else setRuleForm((prev) => ({ ...prev, name_contains: null }));
//                               }}
//                               disabled={ruleForm.apply_to_all}
//                               size="small"
//                             />
//                           }
//                           label={<Typography variant="body2">Pavadinimas turi frazę</Typography>}
//                         />
//                         {ruleForm.name_contains !== null && !ruleForm.apply_to_all && (
//                           <TextField
//                             size="small"
//                             fullWidth
//                             value={ruleForm.name_contains}
//                             onChange={(e) => setRuleForm((prev) => ({ ...prev, name_contains: e.target.value }))}
//                             sx={{ ml: 5, maxWidth: 300 }}
//                             placeholder="pvz.: paslaugos"
//                           />
//                         )}

//                         <FormControlLabel
//                           control={
//                             <Switch
//                               checked={ruleForm.buyer_id !== null || ruleForm.buyer_vat_code !== null}
//                               onChange={(e) => {
//                                 if (e.target.checked) setRuleForm((prev) => ({ ...prev, buyer_id: "", buyer_vat_code: "" }));
//                                 else setRuleForm((prev) => ({ ...prev, buyer_id: null, buyer_vat_code: null }));
//                               }}
//                               disabled={ruleForm.apply_to_all}
//                               size="small"
//                             />
//                           }
//                           label={<Typography variant="body2">Pirkėjas</Typography>}
//                         />
//                         {(ruleForm.buyer_id !== null || ruleForm.buyer_vat_code !== null) && !ruleForm.apply_to_all && (
//                           <Stack direction="row" spacing={1.5} sx={{ ml: 5 }}>
//                             <TextField label="Įmonės kodas" size="small" value={ruleForm.buyer_id || ""} onChange={(e) => setRuleForm((prev) => ({ ...prev, buyer_id: e.target.value }))} sx={{ width: 180 }} />
//                             <TextField label="PVM kodas" size="small" value={ruleForm.buyer_vat_code || ""} onChange={(e) => setRuleForm((prev) => ({ ...prev, buyer_vat_code: e.target.value }))} sx={{ width: 180 }} />
//                           </Stack>
//                         )}

//                         <FormControlLabel
//                           control={
//                             <Switch
//                               checked={ruleForm.seller_id !== null || ruleForm.seller_vat_code !== null}
//                               onChange={(e) => {
//                                 if (e.target.checked) setRuleForm((prev) => ({ ...prev, seller_id: "", seller_vat_code: "" }));
//                                 else setRuleForm((prev) => ({ ...prev, seller_id: null, seller_vat_code: null }));
//                               }}
//                               disabled={ruleForm.apply_to_all}
//                               size="small"
//                             />
//                           }
//                           label={<Typography variant="body2">Pardavėjas</Typography>}
//                         />
//                         {(ruleForm.seller_id !== null || ruleForm.seller_vat_code !== null) && !ruleForm.apply_to_all && (
//                           <Stack direction="row" spacing={1.5} sx={{ ml: 5 }}>
//                             <TextField label="Įmonės kodas" size="small" value={ruleForm.seller_id || ""} onChange={(e) => setRuleForm((prev) => ({ ...prev, seller_id: e.target.value }))} sx={{ width: 180 }} />
//                             <TextField label="PVM kodas" size="small" value={ruleForm.seller_vat_code || ""} onChange={(e) => setRuleForm((prev) => ({ ...prev, seller_vat_code: e.target.value }))} sx={{ width: 180 }} />
//                           </Stack>
//                         )}

//                         <Divider />

//                         <FormControlLabel
//                           control={
//                             <Switch
//                               checked={ruleForm.apply_to_all}
//                               onChange={(e) => {
//                                 const checked = e.target.checked;
//                                 setRuleForm((prev) => ({
//                                   ...prev,
//                                   apply_to_all: checked,
//                                   ...(checked && { vat_value: null, name_contains: null, buyer_id: null, buyer_vat_code: null, seller_id: null, seller_vat_code: null }),
//                                 }));
//                               }}
//                               size="small"
//                             />
//                           }
//                           label={
//                             <Box>
//                               <Typography variant="body2" sx={{ fontWeight: 600, color: "primary.main" }}>Taikyti visoms kitoms eilutėms</Typography>
//                               <Typography variant="caption" sx={{ color: "text.secondary" }}>Numatytoji taisyklė, jei kitos netiko</Typography>
//                             </Box>
//                           }
//                         />
//                       </Stack>
//                     </Box>

//                     {/* Apply values */}
//                     <Box sx={{ p: 3, backgroundColor: "white" }}>
//                       <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
//                         <Box sx={{ width: 24, height: 24, borderRadius: 1, backgroundColor: "success.main", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem" }}>2</Box>
//                         Taikyti reikšmes
//                       </Typography>

//                       <Grid2 container spacing={2}>
//                         <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                           <TextField label="Prekės kodas" size="small" value={ruleForm.result_kodas} onChange={(e) => setRuleForm((prev) => ({ ...prev, result_kodas: e.target.value }))} fullWidth required />
//                         </Grid2>
//                         <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                           <FormControl size="small" fullWidth required>
//                             <InputLabel>Tipas</InputLabel>
//                             <Select
//                               label="Tipas"
//                               value={ruleForm.result_tipas}
//                               onChange={(e) => setRuleForm((prev) => ({ ...prev, result_tipas: e.target.value, ...(e.target.value !== "Kodas" && { result_kodas_kaip: "" }) }))}
//                             >
//                               <MenuItem value="Prekė">Prekė</MenuItem>
//                               <MenuItem value="Paslauga">Paslauga</MenuItem>
//                               {program === "rivile" && <MenuItem value="Kodas">Kodas</MenuItem>}
//                             </Select>
//                           </FormControl>
//                         </Grid2>
//                         <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                           <TextField label="Pavadinimas" size="small" value={ruleForm.result_pavadinimas} onChange={(e) => setRuleForm((prev) => ({ ...prev, result_pavadinimas: e.target.value }))} fullWidth />
//                         </Grid2>
//                         <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                           <TextField label="Barkodas" size="small" value={ruleForm.result_barkodas} onChange={(e) => setRuleForm((prev) => ({ ...prev, result_barkodas: e.target.value }))} fullWidth />
//                         </Grid2>
//                       </Grid2>

//                       {program === "rivile" && ruleForm.result_tipas === "Kodas" && (
//                         <FormControl size="small" sx={{ width: 260, mt: 2 }} required>
//                           <InputLabel>Nustatyti PVM klasifikatorių kaip</InputLabel>
//                           <Select label="Nustatyti PVM klasifikatorių kaip" value={ruleForm.result_kodas_kaip || ""} onChange={(e) => setRuleForm((prev) => ({ ...prev, result_kodas_kaip: e.target.value }))}>
//                             <MenuItem value="Prekei">Prekei</MenuItem>
//                             <MenuItem value="Paslaugai">Paslaugai</MenuItem>
//                           </Select>
//                         </FormControl>
//                       )}

//                       <Box sx={{ mt: 2.5 }}>
//                         <FormControlLabel
//                           control={<Switch checked={ruleForm.enabled} onChange={(e) => setRuleForm((prev) => ({ ...prev, enabled: e.target.checked }))} size="small" />}
//                           label={<Typography variant="body2">Taisyklė aktyvi</Typography>}
//                         />
//                       </Box>

//                       <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
//                         <Button variant="contained" onClick={saveLineitemRule} disabled={savingRules}>
//                           {ruleForm.id ? "Atnaujinti" : "Išsaugoti"}
//                         </Button>
//                         <Button
//                           variant="outlined"
//                           onClick={() =>
//                             setRuleForm({
//                               id: null,
//                               enabled: true,
//                               vat_op: "=",
//                               vat_value: null,
//                               name_contains: null,
//                               buyer_id: null,
//                               buyer_vat_code: null,
//                               seller_id: null,
//                               seller_vat_code: null,
//                               apply_to_all: false,
//                               result_kodas: "",
//                               result_tipas: "Prekė",
//                               result_kodas_kaip: "",
//                               result_pavadinimas: "",
//                               result_barkodas: "",
//                             })
//                           }
//                         >
//                           Išvalyti
//                         </Button>
//                       </Stack>

//                       {rulesError && <Alert severity="error" sx={{ mt: 2 }}>{rulesError}</Alert>}
//                       {rulesSuccess && <Alert severity="success" sx={{ mt: 2 }}>Išsaugota!</Alert>}
//                     </Box>
//                   </Box>

//                   {/* Saved rules */}
//                   <Box>
//                     <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
//                       <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
//                         Išsaugotos taisyklės
//                       </Typography>
//                       <Chip label={lineitemRules?.length || 0} size="small" />
//                     </Box>

//                     {lineitemRules && lineitemRules.length > 0 ? (
//                       <Stack spacing={1.5}>
//                         {lineitemRules.map((r, idx) => (
//                           <Box
//                             key={r.id || idx}
//                             sx={{
//                               border: "1px solid",
//                               borderColor: "grey.200",
//                               borderRadius: 2,
//                               overflow: "hidden",
//                               transition: "all 0.15s ease",
//                               "&:hover": { borderColor: "grey.300", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
//                             }}
//                           >
//                             <Box
//                               sx={{
//                                 display: "flex",
//                                 alignItems: "center",
//                                 justifyContent: "space-between",
//                                 px: 2,
//                                 py: 1.25,
//                                 backgroundColor: "grey.50",
//                                 borderBottom: "1px solid",
//                                 borderColor: "grey.200",
//                               }}
//                             >
//                               <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
//                                 <Chip
//                                   label={`#${idx + 1}`}
//                                   size="small"
//                                   sx={{ fontWeight: 600, backgroundColor: r.enabled ? "success.main" : "grey.400", color: "white" }}
//                                 />
//                                 <Typography variant="body2" sx={{ fontWeight: 500, color: r.enabled ? "text.primary" : "text.disabled" }}>
//                                   {r.enabled ? "Aktyvi" : "Išjungta"}
//                                 </Typography>
//                               </Box>

//                               <Stack direction="row" spacing={0.5}>
//                                 <IconButton
//                                   size="small"
//                                   onClick={() =>
//                                     setRuleForm({
//                                       id: r.id || null,
//                                       enabled: r.enabled !== false,
//                                       vat_op: r.vat_percent?.op || "=",
//                                       vat_value: r.vat_percent && r.vat_percent.value != null ? String(r.vat_percent.value) : null,
//                                       name_contains: r.name_contains !== "" ? r.name_contains : null,
//                                       buyer_id: r.buyer_id !== "" ? r.buyer_id : null,
//                                       buyer_vat_code: r.buyer_vat_code !== "" ? r.buyer_vat_code : null,
//                                       seller_id: r.seller_id !== "" ? r.seller_id : null,
//                                       seller_vat_code: r.seller_vat_code !== "" ? r.seller_vat_code : null,
//                                       apply_to_all: r.apply_to_all || false,
//                                       result_kodas: r.result_kodas || "",
//                                       result_tipas: r.result_tipas || "Prekė",
//                                       result_kodas_kaip: r.result_kodas_kaip || "",
//                                       result_pavadinimas: r.result_pavadinimas || "",
//                                       result_barkodas: r.result_barkodas || "",
//                                     })
//                                   }
//                                 >
//                                   <EditIcon fontSize="small" sx={{ color: "text.secondary" }} />
//                                 </IconButton>
//                                 <IconButton size="small" onClick={() => deleteLineitemRule(r.id)}>
//                                   <DeleteOutlineIcon fontSize="small" sx={{ color: "error.main" }} />
//                                 </IconButton>
//                               </Stack>
//                             </Box>

//                             <Box sx={{ p: 2, backgroundColor: "white" }}>
//                               <Grid2 container spacing={2}>
//                                 <Grid2 size={{ xs: 12, sm: 6 }}>
//                                   <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 0.75 }}>
//                                     Sąlygos
//                                   </Typography>
//                                   {r.apply_to_all ? (
//                                     <Chip label="Visos kitos eilutės" color="primary" size="small" sx={{ fontWeight: 500 }} />
//                                   ) : (
//                                     <Stack spacing={0.25}>
//                                       {r.vat_percent && <Typography variant="body2">PVM {r.vat_percent.op} {r.vat_percent.value}%</Typography>}
//                                       {r.name_contains && <Typography variant="body2">Pavadinimas: "{r.name_contains}"</Typography>}
//                                       {(r.buyer_id || r.buyer_vat_code) && <Typography variant="body2">Pirkėjas: {[r.buyer_id, r.buyer_vat_code].filter(Boolean).join(", ")}</Typography>}
//                                       {(r.seller_id || r.seller_vat_code) && <Typography variant="body2">Pardavėjas: {[r.seller_id, r.seller_vat_code].filter(Boolean).join(", ")}</Typography>}
//                                     </Stack>
//                                   )}
//                                 </Grid2>
//                                 <Grid2 size={{ xs: 12, sm: 6 }}>
//                                   <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 0.75 }}>
//                                     Taikyti
//                                   </Typography>
//                                   <Stack spacing={0.25}>
//                                     {r.result_pavadinimas && <Typography variant="body2">Pavadinimas: <strong>{r.result_pavadinimas}</strong></Typography>}
//                                     <Typography variant="body2">Kodas: <strong>{r.result_kodas}</strong></Typography>
//                                     <Typography variant="body2">
//                                       Tipas: <strong>{r.result_tipas === "Kodas" && r.result_kodas_kaip ? `Kodas (${r.result_kodas_kaip})` : r.result_tipas || "Prekė"}</strong>
//                                     </Typography>
//                                   </Stack>
//                                 </Grid2>
//                               </Grid2>
//                             </Box>
//                           </Box>
//                         ))}
//                       </Stack>
//                     ) : (
//                       <Box sx={{ textAlign: "center", py: 5, px: 3, border: "2px dashed", borderColor: "grey.300", borderRadius: 2, backgroundColor: "grey.50" }}>
//                         <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 500 }}>Nėra išsaugotų taisyklių</Typography>
//                         <Typography variant="caption" sx={{ color: "text.disabled" }}>Sukurkite pirmąją taisyklę aukščiau</Typography>
//                       </Box>
//                     )}
//                   </Box>
//                 </SectionCard>
//               </Box>

//               {/* ═══════════════════════════════════════════════════════════════════════════ */}
//               {/* SECTION: Mobile Invitations */}
//               {/* ═══════════════════════════════════════════════════════════════════════════ */}
//               <Box ref={(el) => (sectionRefs.current["mobile"] = el)} id="mobile">
//                 <SectionCard>
//                   <SectionHeader
//                     icon={PhoneIphoneIcon}
//                     title="Mobilūs kvietimai"
//                     subtitle="Pakvieskite naudotojus siųsti dokumentus per DokSkeno programėlę"
//                   />

//                   <Box sx={{ p: 2.5, borderRadius: 2, backgroundColor: "primary.50", border: "1px solid", borderColor: "primary.100", mb: 3 }}>
//                     <Typography variant="body2" sx={{ color: "primary.dark" }}>
//                       Sukurkite kvietimą ir gavėjas galės fotografuoti bei siųsti jums dokumentus tiesiai iš savo telefono.
//                     </Typography>
//                   </Box>

//                   <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
//                     Naujas kvietimas
//                   </Typography>

//                   <Grid2 container spacing={2} sx={{ mb: 2 }}>
//                     <Grid2 size={{ xs: 12, sm: 5 }}>
//                       <TextField
//                         label="El. paštas"
//                         type="email"
//                         fullWidth
//                         size="small"
//                         value={mobileInviteForm.email}
//                         onChange={(e) => setMobileInviteForm((prev) => ({ ...prev, email: e.target.value }))}
//                       />
//                     </Grid2>
//                     <Grid2 size={{ xs: 12, sm: 5 }}>
//                       <TextField
//                         label="Pavadinimas"
//                         fullWidth
//                         size="small"
//                         value={mobileInviteForm.label}
//                         onChange={(e) => setMobileInviteForm((prev) => ({ ...prev, label: e.target.value }))}
//                       />
//                     </Grid2>
//                     <Grid2 size={{ xs: 12, sm: 2 }}>
//                       <Button variant="contained" onClick={handleCreateMobileKey} disabled={mobileInviteLoading} fullWidth sx={{ height: "100%" }}>
//                         Išsiųsti
//                       </Button>
//                     </Grid2>
//                   </Grid2>

//                   {mobileInviteSuccess && <Alert severity="success" sx={{ mb: 2 }}>Kvietimas sėkmingai sukurtas ir išsiųstas.</Alert>}
//                   {mobileInviteError && <Alert severity="error" sx={{ mb: 2 }}>{mobileInviteError}</Alert>}

//                   <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, mt: 3 }}>
//                     Sukurti raktai
//                   </Typography>

//                   {mobileKeys.length === 0 ? (
//                     <Box sx={{ textAlign: "center", py: 4, px: 3, border: "2px dashed", borderColor: "grey.300", borderRadius: 2, backgroundColor: "grey.50" }}>
//                       <Typography variant="body2" sx={{ color: "text.secondary" }}>Kol kas nėra sukurtų raktų</Typography>
//                     </Box>
//                   ) : (
//                     <Stack spacing={1}>
//                       {mobileKeys.map((item) => (
//                         <Box
//                           key={item.id}
//                           sx={{
//                             display: "flex",
//                             alignItems: "center",
//                             justifyContent: "space-between",
//                             p: 2,
//                             border: "1px solid",
//                             borderColor: "grey.200",
//                             borderRadius: 2,
//                             backgroundColor: "white",
//                           }}
//                         >
//                           <Box sx={{ minWidth: 0 }}>
//                             <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.label || "—"}</Typography>
//                             <Typography variant="caption" sx={{ color: "text.secondary" }}>{item.email}</Typography>
//                             <Typography variant="caption" sx={{ color: "text.disabled", fontFamily: "monospace", display: "block" }}>
//                               {formatMobileKeyMasked(item.key_last4)}
//                             </Typography>
//                           </Box>
//                           <Stack direction="row" spacing={1} alignItems="center">
//                             <Switch size="small" checked={!!item.is_active} onChange={() => handleToggleMobileKey(item.id, !!item.is_active)} />
//                             <IconButton size="small" onClick={() => handleDeleteMobileKey(item.id)}>
//                               <DeleteIcon fontSize="small" />
//                             </IconButton>
//                           </Stack>
//                         </Box>
//                       ))}
//                     </Stack>
//                   )}
//                 </SectionCard>
//               </Box>

//               {/* ═══════════════════════════════════════════════════════════════════════════ */}
//               {/* SECTION: Cloud Integration */}
//               {/* ═══════════════════════════════════════════════════════════════════════════ */}
//               <Box ref={(el) => (sectionRefs.current["cloud"] = el)} id="cloud">
//                 <SectionCard>
//                   <SectionHeader
//                     icon={CloudIcon}
//                     title="Debesų integracija"
//                     subtitle="Sujunkite Google Drive arba Dropbox paskyras"
//                   />
//                   <CloudIntegrationSettings />
//                 </SectionCard>
//               </Box>
//             </Stack>
//           </Box>
//         </Box>
//       </Box>
//     </Box>
//   );
// }



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
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import CloseIcon from "@mui/icons-material/Close";
import { Dialog, DialogTitle, DialogContent } from "@mui/material";
import { api } from "../api/endpoints";
import { COUNTRY_OPTIONS } from "../page_elements/Countries";
import { ACCOUNTING_PROGRAMS } from "../page_elements/AccountingPrograms";
import { Helmet } from "react-helmet";
import CloudIntegrationSettings from '../components/CloudIntegrationSettings';
import APIProviderKeys from "../components/APIProviderKeys";
import ExtraFieldsManager from '../components/ExtraFieldsManager';


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
function ImportTab({ label, url, templateFileName, videoUrl }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error,   setError] = useState(null);
  const [videoOpen, setVideoOpen] = useState(false);
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
    window.open(`/templates/${templateFileName || "klientu_sablonas.xlsx"}`, "_blank");

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <Typography variant="subtitle1">{label}</Typography>
        {videoUrl && (
          <Typography
            component="span"
            variant="caption"
            onClick={() => setVideoOpen(true)}
            sx={{
              display: "flex", alignItems: "center", gap: 0.5,
              color: "text.secondary", textDecoration: "none", cursor: "pointer",
              fontWeight: 600, "&:hover": { textDecoration: "underline" },
            }}
          >
            <PlayCircleIcon sx={{ fontSize: 20, color: "error.main" }} />
            Video instrukcija
          </Typography>
        )}
      </Box>

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

      {videoUrl && (
        <Dialog open={videoOpen} onClose={() => setVideoOpen(false)} maxWidth="md" fullWidth disableScrollLock>
          <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            Video instrukcija
            <IconButton size="small" onClick={() => setVideoOpen(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </DialogTitle>
          <DialogContent sx={{ p: 0 }}>
            <Box sx={{ position: "relative", paddingTop: "56.25%", width: "100%" }}>
              <Box
                component="iframe"
                src={videoOpen ? videoUrl : ""}
                title="Video instrukcija"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                sx={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none", borderRadius: 2 }}
              />
            </Box>
          </DialogContent>
        </Dialog>
      )}
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

  // --- Pragma4 ---
  const [pragma4Fields, setPragma4Fields] = useState({
    pirk_sandelio_kodas: "",
    pirk_projekto_kodas: "",
    pirk_centro_kodas: "",
    pirk_dk_schemos_kodas: "",
    pard_sandelio_kodas: "",
    pard_projekto_kodas: "",
    pard_centro_kodas: "",
    pard_dk_schemos_kodas: "",
  });
  const [savingPragma4, setSavingPragma4] = useState(false);
  const [successPragma4, setSuccessPragma4] = useState(false);
  const [errorPragma4, setErrorPragma4] = useState("");

  // --- Dineta ---
  const [dinetaFields, setDinetaFields] = useState({
    pirk_sandelio_kodas: "",
    pard_sandelio_kodas: "",
  });
  const [savingDineta, setSavingDineta] = useState(false);
  const [successDineta, setSuccessDineta] = useState(false);
  const [errorDineta, setErrorDineta] = useState("");


  // --- Optimum ---
  const [optimumFields, setOptimumFields] = useState({
    pirk_prekes_tipas: "",
    pirk_prekes_grupe: "",
    pirk_sandelio_kodas: "",
    pirk_skyriaus_kodas: "",
    pirk_projekto_kodas: "",
    pirk_atsakingo_darb_kodas: "",
    tiekejo_grupe: "",
    pard_prekes_tipas: "",
    pard_prekes_grupe: "",
    pard_sandelio_kodas: "",
    pard_skyriaus_kodas: "",
    pard_projekto_kodas: "",
    pard_atsakingo_darb_kodas: "",
    pirkejo_grupe: "",
  });
  const [savingOptimum, setSavingOptimum] = useState(false);
  const [successOptimum, setSuccessOptimum] = useState(false);
  const [errorOptimum, setErrorOptimum] = useState("");  

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
  const [autoVideoOpen, setAutoVideoOpen] = useState(false);
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

      const pragma4 = data.pragma4_extra_fields || {};
      setPragma4Fields({
        pirk_sandelio_kodas: pragma4.pirk_sandelio_kodas || "",
        pirk_projekto_kodas: pragma4.pirk_projekto_kodas || "",
        pirk_centro_kodas: pragma4.pirk_centro_kodas || "",
        pirk_dk_schemos_kodas: pragma4.pirk_dk_schemos_kodas || "",
        pard_sandelio_kodas: pragma4.pard_sandelio_kodas || "",
        pard_projekto_kodas: pragma4.pard_projekto_kodas || "",
        pard_centro_kodas: pragma4.pard_centro_kodas || "",
        pard_dk_schemos_kodas: pragma4.pard_dk_schemos_kodas || "",
      });

      const dineta = data.dineta_extra_fields || {};
      setDinetaFields({
        pirk_sandelio_kodas: dineta.pirk_sandelio_kodas || "",
        pard_sandelio_kodas: dineta.pard_sandelio_kodas || "",
      });

      const optimum = data.optimum_extra_fields || {};
      setOptimumFields({
        pirk_prekes_tipas: optimum.pirk_prekes_tipas || "",
        pirk_prekes_grupe: optimum.pirk_prekes_grupe || "",
        pirk_sandelio_kodas: optimum.pirk_sandelio_kodas || "",
        pirk_skyriaus_kodas: optimum.pirk_skyriaus_kodas || "",
        pirk_projekto_kodas: optimum.pirk_projekto_kodas || "",
        pirk_atsakingo_darb_kodas: optimum.pirk_atsakingo_darb_kodas || "",
        tiekejo_grupe: optimum.tiekejo_grupe || "",
        pard_prekes_tipas: optimum.pard_prekes_tipas || "",
        pard_prekes_grupe: optimum.pard_prekes_grupe || "",
        pard_sandelio_kodas: optimum.pard_sandelio_kodas || "",
        pard_skyriaus_kodas: optimum.pard_skyriaus_kodas || "",
        pard_projekto_kodas: optimum.pard_projekto_kodas || "",
        pard_atsakingo_darb_kodas: optimum.pard_atsakingo_darb_kodas || "",
        pirkejo_grupe: optimum.pirkejo_grupe || "",
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


  const savePragma4Fields = async () => {
    setSavingPragma4(true);
    setErrorPragma4("");
    setSuccessPragma4(false);

    try {
      await api.patch(
        "/profile/",
        { pragma4_extra_fields: pragma4Fields },
        { withCredentials: true }
      );
      setSuccessPragma4(true);
      setTimeout(() => setSuccessPragma4(false), 2000);
    } catch (e) {
      const data = e?.response?.data;
      let msg =
        data?.pragma4_extra_fields ||
        data?.detail ||
        "Nepavyko išsaugoti Pragma4 nustatymų.";
      if (typeof msg === "object") {
        try {
          msg = JSON.stringify(msg);
        } catch {
          msg = "Nepavyko išsaugoti Pragma4 nustatymų.";
        }
      }
      setErrorPragma4(msg);
    } finally {
      setSavingPragma4(false);
    }
  };


  const saveDinetaFields = async () => {
    setSavingDineta(true);
    setErrorDineta("");
    setSuccessDineta(false);

    try {
      await api.patch(
        "/profile/",
        { dineta_extra_fields: dinetaFields },
        { withCredentials: true }
      );
      setSuccessDineta(true);
      setTimeout(() => setSuccessDineta(false), 2000);
    } catch (e) {
      const data = e?.response?.data;
      let msg =
        data?.dineta_extra_fields ||
        data?.detail ||
        "Nepavyko išsaugoti Dineta nustatymų.";
      if (typeof msg === "object") {
        try {
          msg = JSON.stringify(msg);
        } catch {
          msg = "Nepavyko išsaugoti Dineta nustatymų.";
        }
      }
      setErrorDineta(msg);
    } finally {
      setSavingDineta(false);
    }
  };


  const saveOptimumFields = async () => {
    setSavingOptimum(true);
    setErrorOptimum("");
    setSuccessOptimum(false);

    try {
      await api.patch(
        "/profile/",
        { optimum_extra_fields: optimumFields },
        { withCredentials: true }
      );
      setSuccessOptimum(true);
      setTimeout(() => setSuccessOptimum(false), 2000);
    } catch (e) {
      const data = e?.response?.data;
      let msg =
        data?.optimum_extra_fields ||
        data?.detail ||
        "Nepavyko išsaugoti Optimum nustatymų.";
      if (typeof msg === "object") {
        try {
          msg = JSON.stringify(msg);
        } catch {
          msg = "Nepavyko išsaugoti Optimum nustatymų.";
        }
      }
      setErrorOptimum(msg);
    } finally {
      setSavingOptimum(false);
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

  const exportMergeVatKey = "merge_vat";
  const isExportMergeVat = Boolean(
    extraSettings && Object.prototype.hasOwnProperty.call(extraSettings, exportMergeVatKey)
  );
  const toggleExportMergeVat = async (e) => {
    const checked = e.target.checked;
    const prev = extraSettings || {};
    const next = { ...prev };

    if (checked) next[exportMergeVatKey] = 1;
    else if (exportMergeVatKey in next) delete next[exportMergeVatKey];

    setExtraSettings(next);
    try {
      await api.patch("/profile/", { extra_settings: next }, { withCredentials: true });
    } catch {
      setExtraSettings(prev);
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

      {["rivile_gama_api", "dineta", "optimum"].includes(program) && (
        <APIProviderKeys provider={program} />
      )}

      <ExtraFieldsManager program={program} videoUrl="https://www.youtube.com/embed/_AuMdOP66bE" />


      {/* 3. Papildomi nustatymai */}
      <Paper sx={{ p: 3, mb: 3, mt: 5 }}>
        <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>Papildomi nustatymai</Typography>
        <Stack spacing={1}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Switch checked={isOpDateFromDoc} onChange={toggleOpDateFromDoc} />
            <Typography variant="body2">Operacijos datą imti iš sąskaitos datos</Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Switch checked={isExportMergeVat} onChange={toggleExportMergeVat} />
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Typography variant="body2">Neišskirti PVM eksportuojant</Typography>
              <Tooltip
                arrow
                enterTouchDelay={0}
                leaveTouchDelay={4000}
                title="Eksportuojant duomenis nebus išskiriami PVM suma ir PVM klasifikatorius. Tinka ne PVM mokėtojų apskaitai, kai reikalingos tik bendros sumos."
              >
                <HelpOutlineIcon fontSize="small" sx={{ color: "text.secondary" }} />
              </Tooltip>
            </Box>
          </Box>
        </Stack>

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
          <ImportTab label="Importuoti įmones iš Excel" url="/data/import-clients/" templateFileName="klientu_sablonas.xlsx" videoUrl="https://www.youtube.com/embed/15v1CgS0Eaw" />
        )}
      </Box>


      <Box mb={3}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 10 }}>
          <Typography variant="h4" sx={{ fontWeight: 600 }}>Automatizacijos</Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <PlayCircleIcon sx={{ fontSize: 20, color: "error.main" }} />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ textDecoration: "none", cursor: "pointer", fontWeight: 600, "&:hover": { textDecoration: "underline" } }}
              onClick={() => setAutoVideoOpen(true)}
            >
              Video instrukcija
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* 5. Defaults for sumiskai (Detaliai-like) */}
      <Paper sx={{ p: 3, mb: 3, backgroundColor: "#d8e2dc" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 500 }}>
            Numatytosios reikšmės (skaitmenizuojant sumiškai)
          </Typography>
          <Tooltip
            title="Skaitmenizuojant SUMIŠKAI, jei bus įvykdyta jūsų nustatyta sąlyga t.y. dokumente suras jūsų nustatytą pirkėją/pardavėją, sistema automatiškai priskirs jūsų nustatytas pajamų/išlaidų reikšmės."
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
      {/* <Box mb={3}>
        <Typography variant="h4" sx={{ mt: 10, fontWeight: 600 }}>Pakvietimai</Typography>
      </Box> */}
      {/* --- DokSkenas mobile app --- */}
      {/* <Paper sx={{ p: 3, mt: 3, mb: 4 }}>
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
      </Paper> */}
      {/* ─── Cloud Integration ─── */}
      <Box mb={3}>
        <Typography variant="h4" sx={{ mt: 10, fontWeight: 600 }}>Google Drive / Dropbox integracija</Typography>
      </Box>
      <CloudIntegrationSettings />

      <Dialog open={autoVideoOpen} onClose={() => setAutoVideoOpen(false)} maxWidth="md" fullWidth disableScrollLock>
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Video instrukcija
          <IconButton size="small" onClick={() => setAutoVideoOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ position: "relative", paddingTop: "56.25%", width: "100%" }}>
            <Box
              component="iframe"
              src={autoVideoOpen ? "https://www.youtube.com/embed/MftJl0_4jOE?si=11ugrRDWgmDUWz49" : ""}
              title="Video instrukcija"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              sx={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none", borderRadius: 2 }}
            />
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

