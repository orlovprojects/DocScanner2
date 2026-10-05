import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem,
  Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useSearchParams } from "react-router-dom";

import { api, apiError } from "../api";

const MONTHS = ["sausis", "vasaris", "kovas", "balandis", "gegužė", "birželis", "liepa", "rugpjūtis", "rugsėjis", "spalis", "lapkritis", "gruodis"];
const WD = ["Pr", "An", "Tr", "Kt", "Pn", "Št", "Sk"];
const PREF = { day_off: "Prašau laisvos dienos", avoid: "Nenoriu dirbti", want: "Noriu dirbti" };

export default function Grafikas() {
  const [sp] = useSearchParams();
  const now = new Date();
  const [ym, setYm] = useState({ y: Number(sp.get("y")) || now.getFullYear(), m: Number(sp.get("m")) || now.getMonth() + 1 });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [pref, setPref] = useState(null); // {date, kind, shift_type_id, comment}

  const load = useCallback(() => {
    setData(null);
    api.get("roster/", { params: { year: ym.y, month: ym.m } }).then((r) => setData(r.data)).catch((e) => setError(apiError(e)));
  }, [ym]);
  useEffect(load, [load]);

  const post = async (body) => {
    setError("");
    try { const r = await api.post("roster/", { year: ym.y, month: ym.m, ...body }); setData(r.data); return true; }
    catch (e) { setError(apiError(e)); return false; }
  };
  const shift = (d) => setYm(({ y, m }) => { const x = new Date(y, m - 1 + d, 1); return { y: x.getFullYear(), m: x.getMonth() + 1 }; });

  const days = [];
  const last = new Date(ym.y, ym.m, 0).getDate();
  for (let i = 1; i <= last; i++) days.push(`${ym.y}-${String(ym.m).padStart(2, "0")}-${String(i).padStart(2, "0")}`);
  const offset = (new Date(ym.y, ym.m - 1, 1).getDay() + 6) % 7;
  const byDate = Object.fromEntries((data?.shifts || []).map((s) => [s.date, s]));
  const prefBy = Object.fromEntries((data?.preferences || []).map((p) => [p.date, p]));
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <Stack gap={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <IconButton onClick={() => shift(-1)}><ChevronLeftIcon /></IconButton>
        <Typography variant="h6" fontWeight={700}>{ym.y} m. {MONTHS[ym.m - 1]}</Typography>
        <IconButton onClick={() => shift(1)}><ChevronRightIcon /></IconButton>
      </Stack>
      {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
      {!data ? <CircularProgress sx={{ mx: "auto" }} /> : (
        <>
          {data.published ? (
            data.acknowledged
              ? <Alert icon={<CheckCircleOutlineIcon />} severity="success">Su grafiku susipažinote</Alert>
              : (
                <Paper variant="outlined" sx={{ p: 2, borderColor: "warning.main" }}>
                  <Typography fontWeight={600} mb={1}>{data.version > 1 ? "Grafikas pakeistas" : "Paskelbtas naujas grafikas"}</Typography>
                  <Button variant="contained" size="large" fullWidth onClick={() => post({ action: "ack", roster_id: data.roster_id })}>
                    Susipažinau
                  </Button>
                </Paper>
              )
          ) : (
            <Alert severity="info">
              Šio mėnesio grafikas dar neparengtas.{data.can_add_preferences ? " Paspauskite dieną ir pateikite pageidavimą - į jį bus atsižvelgta sudarant grafiką." : ""}
            </Alert>
          )}

          {data.changes?.length > 0 && (
            <Alert severity="warning">
              <b>Pakeitimai:</b>
              {data.changes.map((c) => <div key={c.date}>{c.date.slice(5)}: {c.change}</div>)}
              {data.changes[0].reason && <Typography variant="caption" display="block" mt={0.5}>Priežastis: {data.changes[0].reason}</Typography>}
            </Alert>
          )}

          <Paper variant="outlined" sx={{ p: 1 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.5 }}>
              {WD.map((w) => <Typography key={w} variant="caption" textAlign="center" color="text.secondary">{w}</Typography>)}
              {Array.from({ length: offset }).map((_, i) => <Box key={`e${i}`} />)}
              {days.map((d) => {
                const s = byDate[d];
                const p = prefBy[d];
                const absent = data.absences.includes(d);
                const canPref = data.can_add_preferences && d >= todayIso;
                return (
                  <Box key={d} onClick={() => canPref && setPref({ date: d, kind: p?.kind || "day_off", shift_type_id: "", comment: p?.comment || "" })}
                    sx={{ minHeight: 58, borderRadius: 1.5, p: 0.5, textAlign: "center", cursor: canPref ? "pointer" : "default",
                          bgcolor: absent ? "action.disabledBackground" : s ? (s.color || "primary.main") : d === todayIso ? "action.selected" : "action.hover",
                          color: s && !absent ? "#fff" : "text.primary", outline: p ? "2px dashed" : "none", outlineColor: "warning.main" }}>
                    <Typography fontSize={12} fontWeight={600}>{Number(d.slice(8))}</Typography>
                    {s && <Typography fontSize={13} fontWeight={700}>{s.code}</Typography>}
                    {s && <Typography fontSize={10}>{s.start}–{s.end}</Typography>}
                    {absent && <Typography fontSize={10}>nėra</Typography>}
                  </Box>
                );
              })}
            </Box>
          </Paper>

          {data.published && <Typography variant="body2" color="text.secondary">Šį mėnesį pagal grafiką: <b>{Number(data.total_hours).toLocaleString("lt-LT")} val.</b></Typography>}

          {data.preferences.length > 0 && (
            <Box>
              <Typography fontWeight={700} mb={1}>Mano pageidavimai</Typography>
              <Stack gap={1}>
                {data.preferences.map((p) => (
                  <Paper key={p.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack direction="row" alignItems="center" gap={1}>
                      <Box flex={1}>
                        <Typography fontWeight={600}>{p.date} · {p.kind_label}{p.shift ? ` (${p.shift})` : ""}</Typography>
                        {p.comment && <Typography variant="body2" color="text.secondary">{p.comment}</Typography>}
                      </Box>
                      {data.can_add_preferences && <IconButton onClick={() => post({ action: "pref_delete", id: p.id })}><DeleteOutlineIcon /></IconButton>}
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Box>
          )}

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography fontWeight={700}>Jei dirbsiu daugiau nei norma</Typography>
            <Typography variant="body2" color="text.secondary" mb={1.5}>
              Apskaitinis laikotarpis {data.period}. Viršytas laikas apmokamas kaip viršvalandžiai arba, jūsų prašymu, x1,5 pridedamas prie atostogų.
            </Typography>
            <ToggleButtonGroup exclusive fullWidth value={data.overtime_to_vacation ? "vac" : "pay"}
              onChange={(_, v) => v && post({ action: "overtime_choice", to_vacation: v === "vac" })}>
              <ToggleButton value="pay">Išmokėti</ToggleButton>
              <ToggleButton value="vac">Pridėti prie atostogų</ToggleButton>
            </ToggleButtonGroup>
          </Paper>
        </>
      )}

      <Dialog open={!!pref} onClose={() => setPref(null)} fullWidth>
        <DialogTitle>Pageidavimas {pref?.date}</DialogTitle>
        <DialogContent>
          {pref && (
            <Stack gap={2} mt={1}>
              <TextField select label="Ko pageidaujate" value={pref.kind} onChange={(e) => setPref({ ...pref, kind: e.target.value })}>
                {Object.entries(PREF).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
              </TextField>
              {pref.kind !== "day_off" && data.shift_types.length > 1 && (
                <TextField select label="Pamaina (nebūtina)" value={pref.shift_type_id} onChange={(e) => setPref({ ...pref, shift_type_id: e.target.value })}>
                  <MenuItem value="">Bet kuri</MenuItem>
                  {data.shift_types.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                </TextField>
              )}
              <TextField label="Komentaras (nebūtina)" value={pref.comment} onChange={(e) => setPref({ ...pref, comment: e.target.value })} />
              <Typography variant="caption" color="text.secondary">Pageidavimai nėra garantuoti - į juos atsižvelgiama, jei leidžia darbo poreikis.</Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          {pref && prefBy[pref.date] && <Button color="error" onClick={async () => { await post({ action: "pref_delete", id: prefBy[pref.date].id }); setPref(null); }}>Ištrinti</Button>}
          <Box flex={1} />
          <Button onClick={() => setPref(null)}>Atšaukti</Button>
          <Button variant="contained" onClick={async () => {
            if (await post({ action: "pref_add", date: pref.date, kind: pref.kind, shift_type_id: pref.shift_type_id || null, comment: pref.comment })) setPref(null);
          }}>Išsaugoti</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
