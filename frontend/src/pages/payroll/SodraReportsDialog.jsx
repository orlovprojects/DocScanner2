import { useRef, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";

import { apiError, payrollApi } from "../../api/payroll";
import { AffectedRosters } from "./RosterRepair";

const ACTION = {
  create: { label: "Bus sukurtas", color: "success" },
  update: { label: "Bus atnaujintas", color: "info" },
  merge: { label: "Bus sujungtas", color: "info" },
  annul: { label: "Bus pašalintas", color: "error" },
  same: { label: "Jau yra", color: "default" },
  skip: { label: "Praleista", color: "default" },
  conflict: { label: "Konfliktas", color: "warning" },
};

export default function SodraReportsDialog({ open, onClose, onDone, s15Only = false }) {
  const inputRef = useRef(null);
  const [files, setFiles] = useState(null);
  const [data, setData] = useState(null);
  const [fixed, setFixed] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reset = () => { setFiles(null); setData(null); setFixed({}); setError(""); };
  const close = () => { reset(); onClose(); };
  const send = async (fs, apply) => {
    setBusy(true); setError("");
    try {
      const r = await payrollApi.sodraReports(fs, apply);
      setData(r);
      if (apply) onDone?.();
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };
  const pick = (fs) => { if (!fs?.length) return; setFiles(fs); send(fs, false); };
  const fix = async (i, issue) => {
    try {
      await payrollApi.sodraFix(issue.employee_id, issue.fix.field, issue.fix.value);
      setFixed({ ...fixed, [i]: true });
      onDone?.();
    } catch (e) { setError(apiError(e)); }
  };

  const s15 = data?.s15;
  const s47 = data?.s47;
  const toApply = s15 ? s15.summary.create + s15.summary.update + (s15.summary.merge || 0) + (s15.summary.annul || 0) : 0;
  const parts = (x) => [
    x.create && `sukurta ${x.create}`, x.update && `atnaujinta ${x.update}`, x.merge && `sujungta su rankiniais ${x.merge}`,
    x.annul && `pašalinta anuliuotų ${x.annul}`,
  ].filter(Boolean).join(", ") || "pakeitimų nėra";

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="md" disableScrollLock>
      <DialogTitle>{s15Only ? "Ligos pažymėjimai iš Sodros (S15)" : "Sodros ataskaitos (nebūtina)"}</DialogTitle>
      <DialogContent>
        {!data && (
          <Box>
            <Typography variant="body2" color="text.secondary" mb={1}>
              Sodra → Draudėjo paskyra → Ataskaitos, formatas <b>XML</b>:
            </Typography>
            <Typography variant="body2" mb={0.5}>
              • <b>S15</b> – ligos ir nėštumo pažymėjimai: laikotarpis nuo praėjusio mėnesio 1 d. iki šiandien. Nedarbingumai bus įrašyti į tabelį.
            </Typography>
            {!s15Only && <Typography variant="body2" mb={2}>
              • <b>S47</b> – įmokų tarifai už mėnesį, kurio DU skaičiuojate. Patikrinsime, ar pensijų kaupimas ir sutarčių rūšys sutampa su Sodra.
            </Typography>}
            <Box onClick={() => inputRef.current?.click()}
              sx={{ mt: s15Only ? 2 : 0, p: 3, textAlign: "center", border: "2px dashed", borderColor: "divider", borderRadius: 2, cursor: "pointer", bgcolor: "action.hover" }}>
              {busy ? <CircularProgress size={26} /> : <UploadFileIcon sx={{ fontSize: 34, color: "text.disabled" }} />}
              <Typography fontWeight={700}>{s15Only ? "Pasirinkite S15 failą" : "Pasirinkite S15 ir (ar) S47 failus"}</Typography>
            </Box>
            <input ref={inputRef} hidden multiple type="file" accept=".xml" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
          </Box>
        )}

        {data?.unknown?.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>Neatpažinti failai: {data.unknown.join(", ")} (tinka tik S15 ir S47).</Alert>
        )}

        {s15 && (
          <Box mb={3}>
            <Typography fontWeight={700} mb={1}>Ligos pažymėjimai (S15)</Typography>
            {s15.applied ? (
              <>
                <Alert severity="success" sx={{ mb: 1 }}>Įkelta: {parts(s15.summary)}. Nebuvimai jau matomi tabelyje ir grafike – perskaičiuokite mėnesį.</Alert>
                <AffectedRosters items={data.rosters} onNavigate={close} sx={{ mb: 1.5 }} />
              </>
            ) : s15.rows.length === 0 ? (
              <Alert severity="info" sx={{ mb: 1 }}>Šiuo laikotarpiu pažymėjimų nėra.</Alert>
            ) : (
              <Alert severity="info" sx={{ mb: 1 }}>
                Bus {parts(s15.summary)}
                {s15.summary.conflict ? `, konfliktų ${s15.summary.conflict}` : ""}{s15.summary.skip ? `, praleista ${s15.summary.skip}` : ""}.
                {" "}Nebuvimai bus įrašyti į tabelį ir grafiką (pamainos tomis dienomis – pašalintos arba perbrauktos).
              </Alert>
            )}
            {s15.rows.length > 0 && (
              <Table size="small">
                <TableHead><TableRow>{["Darbuotojas", "Pažymėjimas", "Laikotarpis", "Priežastis", ""].map((h) => <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>)}</TableRow></TableHead>
                <TableBody>
                  {s15.rows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.employee}</TableCell>
                      <TableCell>{r.document}{r.continuation && <Typography variant="caption" color="text.secondary" display="block">tęsinys</Typography>}</TableCell>
                      <TableCell>{r.start} – {r.end}</TableCell>
                      <TableCell>{r.kind}</TableCell>
                      <TableCell>
                        <Chip size="small" color={ACTION[r.action].color} label={ACTION[r.action].label} />
                        {r.reason && r.reason.split("; ").map((t) => (
                          <Typography key={t} variant="caption" display="block"
                            sx={{ color: t.startsWith("Liga atostogų") ? "#B54708" : "text.secondary", fontWeight: t.startsWith("Liga atostogų") ? 600 : 400, mt: .3 }}>
                            {t}
                          </Typography>
                        ))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Box>
        )}

        {s47 && (
          <Box>
            <Typography fontWeight={700} mb={1}>Įmokų tarifai (S47){s47.month ? ` – ${s47.month}` : ""}</Typography>
            {s47.issues.length === 0 ? (
              <Alert severity="success">Tarifai sutampa su Sodra ✓ (patikrinta darbuotojų: {s47.checked})</Alert>
            ) : (
              <Table size="small">
                <TableHead><TableRow>{["Darbuotojas", "Kas skiriasi", "Sodroje", "DokSkenas", ""].map((h) => <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>)}</TableRow></TableHead>
                <TableBody>
                  {s47.issues.map((x, i) => (
                    <TableRow key={i}>
                      <TableCell>{x.employee}</TableCell>
                      <TableCell>{x.issue}</TableCell>
                      <TableCell>{x.sodra}</TableCell>
                      <TableCell>{x.ours}</TableCell>
                      <TableCell>
                        {x.fix && (fixed[i]
                          ? <Chip size="small" color="success" label="Pritaikyta" />
                          : <Button size="small" variant="outlined" onClick={() => fix(i, x)}>Pritaikyti</Button>)}
                        {!x.fix && x.employee_id && <Typography variant="caption" color="text.secondary">Pataisykite kortelėje</Typography>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        {data && !s15?.applied && <Button onClick={reset}>Kiti failai</Button>}
        <Button onClick={close}>Uždaryti</Button>
        {s15 && !s15.applied && toApply > 0 && (
          <Button variant="contained" disabled={busy} onClick={() => send(files, true)}>Įkelti pažymėjimus ({toApply})</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
