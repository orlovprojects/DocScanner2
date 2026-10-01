import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";

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
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    payrollApi.requests({ status: status === "all" ? undefined : status })
      .then((r) => { setRows(r); setError(""); }).catch((e) => setError(apiError(e)));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const approve = async (id) => {
    setBusy(id);
    try { const r = await payrollApi.approveRequest(id); setInfo(r.warnings || []); load(); }
    catch (e) { setError(apiError(e)); } finally { setBusy(null); }
  };
  const doReject = async () => {
    try { await payrollApi.rejectRequest(reject.id, reject.reason); setReject(null); load(); }
    catch (e) { setError(apiError(e)); }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900 }}>
      <Typography variant="h5" fontWeight={700}>Darbuotojų prašymai</Typography>
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
                    {r.kind === "dismissal" ? `Paskutinė darbo diena: ${r.end_date}`
                      : `${r.start_date === r.end_date ? r.start_date : `${r.start_date} – ${r.end_date}`} · ${Number(r.work_days)} d.d.`}
                  </Typography>
                  {r.comment && <Typography variant="body2" sx={{ mt: 0.5 }}>„{r.comment}“</Typography>}
                  {r.reject_reason && <Typography variant="body2" color="error">Atmesta: {r.reject_reason}</Typography>}
                  <Typography variant="caption" color="text.secondary">Pateikta {new Date(r.created_at).toLocaleString("lt-LT")}</Typography>
                </Box>
                <Stack direction="row" gap={1} alignItems="flex-start" flexWrap="wrap">
                  <Button size="small" onClick={() => payrollApi.requestHtml(r.id).then(openHtml)}>Prašymas</Button>
                  {r.status === "pending" && (
                    <>
                      <Button size="small" color="error" onClick={() => setReject({ id: r.id, reason: "" })}>Atmesti</Button>
                      <Button size="small" variant="contained" disabled={busy === r.id} onClick={() => approve(r.id)}>Patvirtinti</Button>
                    </>
                  )}
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

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
