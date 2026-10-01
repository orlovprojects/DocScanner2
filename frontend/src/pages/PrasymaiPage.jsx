import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";

import { apiError, payrollApi } from "../../api/payroll";

const STATUS_COLOR = { pending: "warning", approved: "success", rejected: "error", cancelled: "default" };

function openHtml(html) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open(); w.document.write(html); w.document.close();
}

export default function PrasymaiPage() {
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState([]);
  const [reject, setReject] = useState(null); // {id, reason}
  const [answer, setAnswer] = useState(null); // {id, text}
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    payrollApi.requests({ status: status === "all" ? undefined : status })
      .then((r) => { setRows(r); setError(""); }).catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const approve = async (id) => {
    setBusy(id);
    try { const r = await payrollApi.approveRequest(id); setInfo(r.warnings || []); load(); }
    catch (e) { setError(apiError(e)); } finally { setBusy(null); }
  };
  const openAnswer = async (id) => {
    try { const r = await payrollApi.requestAnswerPreview(id); setAnswer({ id, text: r.answer }); }
    catch (e) { setError(apiError(e)); }
  };
  const sendAnswer = async () => {
    try { await payrollApi.approveRequest(answer.id, answer.text); setAnswer(null); load(); }
    catch (e) { setError(apiError(e)); }
  };
  const due = (created) => { const d = new Date(created); d.setMonth(d.getMonth() + 2); return d.toLocaleDateString("lt-LT"); };

  const doReject = async () => {
    try { await payrollApi.rejectRequest(reject.id, reject.reason); setReject(null); load(); }
    catch (e) { setError(apiError(e)); }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900 }}>
      <Stack direction="row" alignItems="center" gap={1}>
        <Typography variant="h5" fontWeight={700}>Darbuotojų prašymai</Typography>
        <Tooltip title="Atnaujinti">
          <IconButton onClick={load} disabled={loading} sx={{ border: 1, borderColor: "divider", borderRadius: "50%" }}>
            <RefreshIcon sx={{ animation: loading ? "spin 1s linear infinite" : "none", "@keyframes spin": { to: { transform: "rotate(360deg)" } } }} />
          </IconButton>
        </Tooltip>
      </Stack>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Prašymai iš esavitarna.lt. Patvirtinus atostogos automatiškai atsiranda tabelyje ir atlyginimo skaičiavime.
      </Typography>

      <ToggleButtonGroup size="small" exclusive value={status} onChange={(_, v) => v && setStatus(v)} sx={{ mb: 2 }}>
        <ToggleButton value="pending">Laukia</ToggleButton>
        <ToggleButton value="approved">Patvirtinti</ToggleButton>
        <ToggleButton value="rejected">Atmesti</ToggleButton>
        <ToggleButton value="all">Visi</ToggleButton>
      </ToggleButtonGroup>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {info.map((w, i) => <Alert key={i} severity="warning" sx={{ mb: 1 }} onClose={() => setInfo([])}>{w}</Alert>)}

      {rows.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">{status === "pending" ? "Naujų prašymų nėra." : "Prašymų nėra."}</Typography>
        </Paper>
      ) : (
        <Stack gap={1.5}>
          {rows.map((r) => (
            <Paper key={r.id} variant="outlined" sx={{ p: 2 }}>
              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1.5}>
                <Box>
                  <Stack direction="row" gap={1} alignItems="center">
                    <Typography fontWeight={700}>{r.employee_name}</Typography>
                    <Chip size="small" label={r.status_label} color={STATUS_COLOR[r.status]} variant="outlined" />
                  </Stack>
                  <Typography>{r.kind_label}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {r.kind === "pay_info" ? (r.status === "pending" ? `Atsakyti iki ${due(r.created_at)}` : "")
                      : r.kind === "dismissal" ? `Paskutinė darbo diena: ${r.end_date}`
                      : `${r.start_date === r.end_date ? r.start_date : `${r.start_date} – ${r.end_date}`} · ${Number(r.work_days)} d.d.`}
                  </Typography>
                  {r.answer && <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-line", color: "text.secondary" }}>{r.answer}</Typography>}
                  {r.comment && <Typography variant="body2" sx={{ mt: 0.5 }}>„{r.comment}“</Typography>}
                  {r.reject_reason && <Typography variant="body2" color="error">Atmesta: {r.reject_reason}</Typography>}
                  <Typography variant="caption" color="text.secondary">Pateikta {new Date(r.created_at).toLocaleString("lt-LT")}</Typography>
                </Box>
                <Stack direction="row" gap={1} alignItems="flex-start" flexWrap="wrap">
                  <Button size="small" onClick={() => payrollApi.requestHtml(r.id).then(openHtml)}>Prašymas</Button>
                  {r.status === "pending" && (
                    <>
                      <Button size="small" color="error" onClick={() => setReject({ id: r.id, reason: "" })}>Atmesti</Button>
                      {r.kind === "pay_info"
                        ? <Button size="small" variant="contained" onClick={() => openAnswer(r.id)}>Paruošti atsakymą</Button>
                        : <Button size="small" variant="contained" disabled={busy === r.id} onClick={() => approve(r.id)}>Patvirtinti</Button>}
                    </>
                  )}
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      <Dialog open={!!answer} onClose={() => setAnswer(null)} fullWidth maxWidth="sm" disableScrollLock>
        <DialogTitle>Atsakymas darbuotojui</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={1}>
            Atsakymas paruoštas automatiškai iš atlyginimų duomenų. Galite jį pataisyti. Darbuotojas matys jį savitarnoje.
          </Typography>
          <TextField fullWidth multiline minRows={6} value={answer?.text || ""} onChange={(e) => setAnswer({ ...answer, text: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAnswer(null)}>Atšaukti</Button>
          <Button variant="contained" onClick={sendAnswer} disabled={!answer?.text?.trim()}>Siųsti atsakymą</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!reject} onClose={() => setReject(null)} fullWidth maxWidth="xs" disableScrollLock>
        <DialogTitle>Atmesti prašymą</DialogTitle>
        <DialogContent>
          <TextField fullWidth multiline minRows={2} sx={{ mt: 1 }} label="Priežastis (darbuotojas ją matys)"
            value={reject?.reason || ""} onChange={(e) => setReject({ ...reject, reason: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReject(null)}>Atšaukti</Button>
          <Button color="error" variant="contained" onClick={doReject}>Atmesti</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
