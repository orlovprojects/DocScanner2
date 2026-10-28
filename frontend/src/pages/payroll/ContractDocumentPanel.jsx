import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  IconButton, Paper, Stack, Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";

import LtDatePicker from "../../components/LtDatePicker"; // ⚠ pataisyk kelią, jei komponentas kitur
import { apiError, payrollApi } from "../../api/payroll";
import PayrollSettingsDialog from "./PayrollSettingsDialog";
import DocPreviewDialog from "./DocPreviewDialog";

const today = () => new Date().toISOString().slice(0, 10);
const STATUS = {
  ready: { label: "Paruošta pasirašyti", color: "warning" },
  partly_signed: { label: "Pasirašė viena šalis", color: "warning" },
  signed: { label: "Pasirašyta", color: "success" },
};


export default function ContractDocumentPanel({ contract, bare = false }) {
  const [docs, setDocs] = useState(null);
  const [missing, setMissing] = useState([]);
  const [warnings, setWarnings] = useState([]);    // 1-SD terminas, DU kartą per mėn. be prašymo, DAS neatitikimai
  const [payOnce, setPayOnce] = useState(false);      // darbuotojo kortelės „Mokėti kartą per mėnesį“ (tas pats laukas)
  useEffect(() => {
    payrollApi.employee(contract.employee).then((e) => setPayOnce(!!e.pay_once_a_month)).catch(() => {});
  }, [contract.employee]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // {url, type, name}
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState(null);        // sutarties peržiūra: {html} (null html - kraunama)
  const openView = () => {
    setView({ html: null });
    payrollApi.documentHtml(doc.id).then((html) => setView({ html })).catch((e) => { setView(null); setError(apiError(e)); });
  };
  const fileInput = useRef(null);
  const uploadTarget = useRef(null);

  const load = useCallback(() => {
    payrollApi.documents({ contract: contract.id, kind: "contract" }).then(setDocs).catch((e) => setError(apiError(e)));
  }, [contract.id]);
  useEffect(() => { load(); }, [load]);

  const doc = docs?.[0];

  // DK 139 str. 2 d.: DU kartą per mėnesį - tik darbuotojo prašymu (įrašoma į sutartį, darbuotojas patvirtina pasirašydamas)
  const togglePayOnce = async (v) => {
    setPayOnce(v);
    try {
      await payrollApi.updateEmployee(contract.employee, { pay_once_a_month: v });
      if (doc && doc.status !== "signed" && !doc.employee_signed && !doc.employer_signed) await generate();
    } catch (e) { setPayOnce(!v); setError(apiError(e)); }
  };

  const generate = async () => {
    setBusy(true); setError("");
    try { const r = await payrollApi.generateContract(contract.id); setMissing(r.missing); setWarnings(r.warnings || []); load(); }
    catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };

  const pickFile = (target) => { uploadTarget.current = target; fileInput.current?.click(); };
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true); setError("");
    try {
      if (uploadTarget.current === "new") {
        const fd = new FormData();
        fd.append("employee", contract.employee); fd.append("contract", contract.id); fd.append("kind", "contract");
        fd.append("title", "Darbo sutartis"); fd.append("sign_method", "external"); fd.append("file", file);
        await payrollApi.createDocument(fd);
      } else {
        await payrollApi.uploadDocument(doc.id, file);
      }
      load();
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  };

  const update = async (data) => {
    try { await payrollApi.updateDocument(doc.id, data); load(); } catch (e) { setError(apiError(e)); }
  };

  const showScan = async () => {
    try {
      const blob = await payrollApi.documentFile(doc.id);
      setPreview({ url: URL.createObjectURL(blob), type: blob.type, name: doc.file_name });
    } catch (e) { setError(apiError(e)); }
  };
  const closePreview = () => { if (preview?.url) URL.revokeObjectURL(preview.url); setPreview(null); };

  if (docs === null) return null;
  const st = doc ? STATUS[doc.status] : null;

  return (
    <Paper variant="outlined" sx={bare ? { p: 0, border: 0, bgcolor: "transparent", "& .MuiButton-root": { textTransform: "none" } } : { p: 2 }}>
      <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png" hidden onChange={onFile} />
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
        <Stack direction="row" gap={1} alignItems="center">
          <DescriptionOutlinedIcon fontSize="small" color="action" />
          <Typography sx={bare ? { fontSize: 13.5, fontWeight: 500 } : { fontWeight: 700 }}>{bare ? "Sutarties dokumentas" : "Darbo sutarties dokumentas"}</Typography>
          {st && <Chip size="small" label={st.label} color={st.color} variant="outlined" />}
          {!doc && <Chip size="small" label="Neįkelta" variant="outlined" />}
        </Stack>
        <Button size="small" onClick={() => setSettingsOpen(true)}>Įmonės duomenys</Button>
      </Stack>

      {(!doc || (doc.status !== "signed" && !doc.employee_signed && !doc.employer_signed)) && (
        <FormControlLabel sx={{ mb: 1, alignItems: "flex-start", "& .MuiFormControlLabel-label": { pt: "9px" } }}
          control={<Checkbox size="small" checked={payOnce} onChange={(e) => togglePayOnce(e.target.checked)} />}
          label={(
            <Box>
              <Typography sx={{ fontSize: 13.5 }}>Darbuotojas prašo DU mokėti kartą per mėnesį</Typography>
              <Typography variant="caption" color="text.secondary">
                Žymėkite tik jei darbuotojas to prašo – sutartyje bus įrašyta, kad jis tai patvirtina pasirašydamas (DK 139 str. 2 d.).
              </Typography>
            </Box>
          )} />
      )}

      {!doc && (
        <Stack direction={{ xs: "column", sm: "row" }} gap={1}>
          <Button variant="contained" size={bare ? "small" : "medium"} disableElevation disabled={busy} onClick={generate}>Sugeneruoti sutartį</Button>
          <Button variant="outlined" size={bare ? "small" : "medium"} startIcon={<UploadFileOutlinedIcon />} disabled={busy} onClick={() => pickFile("new")}>
            Įkelti jau pasirašytą
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
            Nebūtina – atlyginimas skaičiuojamas ir be dokumento.
          </Typography>
        </Stack>
      )}

      {doc && (
        <Stack gap={1.5}>
          <Stack direction="row" gap={1} flexWrap="wrap">
            {doc.has_html && (
              <Button size="small" startIcon={<VisibilityOutlinedIcon />} onClick={openView}>
                Peržiūrėti / spausdinti
              </Button>
            )}
            {doc.has_html && doc.status !== "signed" && (
              <Button size="small" disabled={busy} onClick={generate}>Atnaujinti iš kortelės</Button>
            )}
            {doc.has_file && (
              <Button size="small" startIcon={<VisibilityOutlinedIcon />} onClick={showScan}>Pasirašyta kopija</Button>
            )}
            <Button size="small" startIcon={<UploadFileOutlinedIcon />} disabled={busy} onClick={() => pickFile("existing")}>
              {doc.has_file ? "Pakeisti skenuotą" : "Įkelti pasirašytą (nebūtina)"}
            </Button>
          </Stack>

          <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: "action.hover" }}>
            <Typography variant="body2" fontWeight={600} mb={0.5}>Ar sutartis pasirašyta?</Typography>
            <Stack direction={{ xs: "column", sm: "row" }} gap={{ sm: 2 }} alignItems={{ sm: "center" }}>
              <FormControlLabel disabled={missing.length > 0 && !doc.employee_signed} control={<Checkbox checked={doc.employee_signed}
                onChange={(e) => update({ employee_signed: e.target.checked, signed_date: doc.signed_date || today() })} />}
                label="Pasirašė darbuotojas" />
              <FormControlLabel disabled={missing.length > 0 && !doc.employer_signed} control={<Checkbox checked={doc.employer_signed}
                onChange={(e) => update({ employer_signed: e.target.checked, signed_date: doc.signed_date || today() })} />}
                label="Pasirašė darbdavys" />
              {(doc.employee_signed || doc.employer_signed) && (
                <Box sx={{ width: 190 }}>
                  <LtDatePicker label="Pasirašymo data" value={doc.signed_date} onChange={(v) => v && update({ signed_date: v })} />
                </Box>
              )}
            </Stack>
          </Box>

          {doc.status === "signed" && (
            <Alert severity="info">
              Nepamirškite pateikti 1-SD pranešimo Sodrai ne vėliau kaip prieš darbo pradžią ({contract.start_date}).
            </Alert>
          )}
        </Stack>
      )}

      {missing.length > 0 && (
        <Alert severity="warning" sx={{ mt: 1.5 }}
          action={<Button color="inherit" size="small" onClick={() => setSettingsOpen(true)}>Užpildyti</Button>}>
          Sutartyje liko tuščių vietų: {missing.join(", ")}. Užpildykite ir spauskite „Atnaujinti iš kortelės“ – iki tol sutarties pažymėti pasirašyta negalima.
        </Alert>
      )}
      {warnings.length > 0 && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          {warnings.map((w) => <Box key={w} sx={{ "& + &": { mt: .75 } }}>{w}</Box>)}
        </Alert>
      )}
      {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}

      <Dialog open={!!preview} onClose={closePreview} fullWidth maxWidth="md" disableScrollLock>
        <DialogTitle sx={{ pr: 6 }}>
          {preview?.name || "Pasirašyta sutartis"}
          <IconButton onClick={closePreview} sx={{ position: "absolute", right: 12, top: 12 }}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ height: "75vh", p: 0 }}>
          {preview?.type?.startsWith("image/")
            ? <Box component="img" src={preview.url} alt="" sx={{ maxWidth: "100%", display: "block", mx: "auto" }} />
            : preview && <iframe title="scan" src={preview.url} style={{ width: "100%", height: "100%", border: 0 }} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { const a = document.createElement("a"); a.href = preview.url; a.download = preview.name || "sutartis"; a.click(); }}>
            Atsisiųsti
          </Button>
          <Button onClick={closePreview}>Uždaryti</Button>
        </DialogActions>
      </Dialog>

      <DocPreviewDialog open={!!view} html={view?.html} onClose={() => setView(null)}
        title={doc?.title || "Darbo sutartis"} sub={doc?.number ? `Nr. ${doc.number}` : ""} />
      <PayrollSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Paper>
  );
}
