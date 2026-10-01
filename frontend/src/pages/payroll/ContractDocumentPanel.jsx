import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  IconButton, Paper, Stack, Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";

import LtDatePicker from "../../components/LtDatePicker"; // ⚠ pataisyk kelią, jei komponentas kitur
import { apiError, payrollApi } from "../../api/payroll";
import PayrollSettingsDialog from "./PayrollSettingsDialog";

const today = () => new Date().toISOString().slice(0, 10);
const STATUS = {
  ready: { label: "Paruošta pasirašyti", color: "warning" },
  partly_signed: { label: "Pasirašė viena šalis", color: "warning" },
  signed: { label: "Pasirašyta", color: "success" },
};

function printHtml(html) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open(); w.document.write(html); w.document.close();
  w.focus(); setTimeout(() => w.print(), 300);
}

export default function ContractDocumentPanel({ contract }) {
  const [docs, setDocs] = useState(null);
  const [missing, setMissing] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // {url, type, name}
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileInput = useRef(null);
  const uploadTarget = useRef(null);

  const load = useCallback(() => {
    payrollApi.documents({ contract: contract.id, kind: "contract" }).then(setDocs).catch((e) => setError(apiError(e)));
  }, [contract.id]);
  useEffect(() => { load(); }, [load]);

  const doc = docs?.[0];

  const generate = async () => {
    setBusy(true); setError("");
    try { const r = await payrollApi.generateContract(contract.id); setMissing(r.missing); load(); }
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
    <Paper variant="outlined" sx={{ p: 2 }}>
      <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png" hidden onChange={onFile} />
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
        <Stack direction="row" gap={1} alignItems="center">
          <DescriptionOutlinedIcon fontSize="small" color="action" />
          <Typography fontWeight={700}>Darbo sutarties dokumentas</Typography>
          {st && <Chip size="small" label={st.label} color={st.color} variant="outlined" />}
          {!doc && <Chip size="small" label="Neįkelta" variant="outlined" />}
        </Stack>
        <Button size="small" onClick={() => setSettingsOpen(true)}>Įmonės duomenys</Button>
      </Stack>

      {!doc && (
        <Stack direction={{ xs: "column", sm: "row" }} gap={1}>
          <Button variant="contained" disabled={busy} onClick={generate}>Sugeneruoti sutartį</Button>
          <Button variant="outlined" startIcon={<UploadFileOutlinedIcon />} disabled={busy} onClick={() => pickFile("new")}>
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
              <Button size="small" startIcon={<PrintOutlinedIcon />} onClick={() => payrollApi.documentHtml(doc.id).then(printHtml)}>
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
              <FormControlLabel control={<Checkbox checked={doc.employee_signed}
                onChange={(e) => update({ employee_signed: e.target.checked, signed_date: doc.signed_date || today() })} />}
                label="Pasirašė darbuotojas" />
              <FormControlLabel control={<Checkbox checked={doc.employer_signed}
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
          Sutartyje liko tuščių vietų: {missing.join(", ")}. Užpildykite ir spauskite „Atnaujinti iš kortelės“.
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

      <PayrollSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Paper>
  );
}
