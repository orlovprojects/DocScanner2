import { useEffect, useState } from "react";
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";

import { api, apiError, days } from "../api";

const TITLES = {
  vacation: { title: "Noriu atostogų", hint: "Pasirinkite pirmą ir paskutinę atostogų dieną." },
  parent_day: { title: "Mamadienis / tėvadienis", hint: "Pasirinkite dieną. Jei priklauso 2 dienos – galite pasirinkti dvi iš eilės." },
  unpaid: { title: "Nemokamos atostogos", hint: "Už šias dienas atlyginimas nemokamas." },
  dismissal: { title: "Noriu išeiti iš darbo", hint: "Nurodykite paskutinę darbo dieną. Pagal DK apie išėjimą įspėjama prieš 20 kalendorinių dienų." },
  pay_info: {
    title: "Informacija apie mano atlyginimą",
    hint: "Turite teisę sužinoti savo vidutinį valandinį atlyginimą ir vidutinį vyrų bei moterų atlyginimą savo pareigybių grupėje. Kolegų atskirų atlyginimų nematysite. Darbdavys atsakys per 2 mėnesius.",
  },
};

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

export default function RequestForm() {
  const { kind } = useParams();
  const meta = TITLES[kind] || TITLES.vacation;
  const single = kind === "dismissal";
  const noDates = kind === "pay_info";
  const [start, setStart] = useState(kind === "dismissal" ? addDays(today(), 20) : kind === "pay_info" ? today() : "");
  const [end, setEnd] = useState(kind === "dismissal" ? addDays(today(), 20) : kind === "pay_info" ? today() : "");
  const [comment, setComment] = useState("");
  const [pre, setPre] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    if (!start || !end) { setPre(null); return; }
    const t = setTimeout(() => {
      api.post("requests/preview/", { kind, start_date: start, end_date: end }).then((r) => setPre(r.data)).catch(() => setPre(null));
    }, 250);
    return () => clearTimeout(t);
  }, [kind, start, end]);

  const submit = async () => {
    setBusy(true); setError("");
    try {
      await api.post("requests/", { kind, start_date: start, end_date: end, comment });
      nav("/", { replace: true, state: { sent: true } });
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };

  const blocked = !start || !end || pre?.errors?.length > 0;

  return (
    <Stack gap={2}>
      <Button onClick={() => nav(-1)} sx={{ alignSelf: "flex-start", minHeight: 36 }}>← Atgal</Button>
      <Box>
        <Typography variant="h5" fontWeight={700}>{meta.title}</Typography>
        <Typography color="text.secondary">{meta.hint}</Typography>
      </Box>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack gap={2}>
          {noDates ? null : single ? (
            <TextField label="Paskutinė darbo diena" type="date" value={end} InputLabelProps={{ shrink: true }}
              onChange={(e) => { setEnd(e.target.value); setStart(e.target.value); }} inputProps={{ min: today() }} />
          ) : (
            <>
              <TextField label={kind === "parent_day" ? "Diena" : "Nuo"} type="date" value={start} InputLabelProps={{ shrink: true }}
                inputProps={{ min: today() }}
                onChange={(e) => { setStart(e.target.value); if (!end || end < e.target.value || kind === "parent_day") setEnd(e.target.value); }} />
              <TextField label={kind === "parent_day" ? "Iki (jei 2 dienos)" : "Iki (imtinai)"} type="date" value={end}
                InputLabelProps={{ shrink: true }} inputProps={{ min: start || today() }} onChange={(e) => setEnd(e.target.value)} />
            </>
          )}
          <TextField label="Pastaba (nebūtina)" value={comment} onChange={(e) => setComment(e.target.value)} multiline minRows={2} />
        </Stack>
      </Paper>

      {pre && !single && !noDates && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between"><Typography>Darbo dienų</Typography><Typography fontWeight={700}>{days(pre.work_days)}</Typography></Stack>
          {pre.balance != null && (
            <>
              <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Priklauso</Typography><Typography>{days(pre.balance)}</Typography></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Liks</Typography>
                <Typography fontWeight={700} color={Number(pre.remaining) < 0 ? "warning.main" : "success.main"}>{days(pre.remaining)}</Typography></Stack>
            </>
          )}
        </Paper>
      )}
      {pre?.errors?.map((e, i) => <Alert key={i} severity="error">{e}</Alert>)}
      {pre?.warnings?.map((e, i) => <Alert key={i} severity="warning">{e}</Alert>)}
      {error && <Alert severity="error">{error}</Alert>}

      <Button variant="contained" size="large" disabled={busy || blocked} onClick={submit}>Pateikti prašymą</Button>
      <Typography variant="caption" color="text.secondary" textAlign="center">
        Prašymą gaus darbdavys. Apie sprendimą pranešime el. paštu.
      </Typography>
    </Stack>
  );
}
