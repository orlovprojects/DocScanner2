import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import { useNavigate, useSearchParams } from "react-router-dom";

import { api, apiError } from "../api";

const MONTHS = ["sausis", "vasaris", "kovas", "balandis", "gegužė", "birželis", "liepa", "rugpjūtis", "rugsėjis", "spalis", "lapkritis", "gruodis"];
const WD = ["Pr", "An", "Tr", "Kt", "Pn", "Št", "Sk"];
const PREF = { day_off: "Prašau laisvos dienos", avoid: "Nenoriu dirbti", want: "Noriu dirbti" };

const ABS_COLORS = {
  vacation: { bg: "#E9F9EF", fg: "#16A965" },
  parent_day: { bg: "#FDECEF", fg: "#EF476F" },
  sick: { bg: "#F1F3F6", fg: "#667085" },
};

function BackButton({ onClick }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        border: 0, bgcolor: "transparent", p: 0, display: "inline-flex", alignItems: "center", gap: 0.25,
        color: "text.secondary", cursor: "pointer", font: "inherit", fontSize: "0.8rem", fontWeight: 600, width: "fit-content",
      }}
    >
      <ChevronLeftRoundedIcon sx={{ fontSize: 20 }} />
      Atgal
    </Box>
  );
}

const cardSx = {
  bgcolor: "#fff",
  border: "1px solid #e8edf4",
  borderRadius: 1.5,
  boxShadow: "0 8px 24px rgba(20, 52, 90, .04)",
};

export default function Grafikas() {
  const [sp] = useSearchParams();
  const now = new Date();
  const [ym, setYm] = useState({ y: Number(sp.get("y")) || now.getFullYear(), m: Number(sp.get("m")) || now.getMonth() + 1 });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [pref, setPref] = useState(null); // {date, kind, shift_type_id, comment}
  const nav = useNavigate();

  const load = useCallback(() => {
    setData(null);
    api.get("roster/", { params: { year: ym.y, month: ym.m } }).then((r) => setData(r.data)).catch((e) => setError(apiError(e)));
  }, [ym]);
  useEffect(load, [load]);

  const post = async (body) => {
    setError("");
    try {
      const r = await api.post("roster/", { year: ym.y, month: ym.m, ...body });
      setData(r.data);
      return true;
    } catch (e) {
      setError(apiError(e));
      return false;
    }
  };

  const shift = (d) => setYm(({ y, m }) => {
    const x = new Date(y, m - 1 + d, 1);
    return { y: x.getFullYear(), m: x.getMonth() + 1 };
  });

  const days = [];
  const last = new Date(ym.y, ym.m, 0).getDate();
  for (let i = 1; i <= last; i++) days.push(`${ym.y}-${String(ym.m).padStart(2, "0")}-${String(i).padStart(2, "0")}`);
  const offset = (new Date(ym.y, ym.m - 1, 1).getDay() + 6) % 7;
  const byDate = Object.fromEntries((data?.shifts || []).map((s) => [s.date, s]));
  const prefBy = Object.fromEntries((data?.preferences || []).map((p) => [p.date, p]));
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <Stack gap={1.8} sx={{ pb: 2 }}>
      <BackButton onClick={() => nav(-1)} />
      <Box>
        <Typography sx={{ fontSize: "1.35rem", fontWeight: 850, color: "#101828", letterSpacing: "-.025em" }}>
          Mano grafikas
        </Typography>
        <Typography sx={{ mt: 0.25, color: "#667085", fontSize: ".86rem" }}>
          Darbo laikas, pamainos ir pageidavimai
        </Typography>
      </Box>

      <Paper elevation={0} sx={{ ...cardSx, px: 1, py: 0.7 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <IconButton onClick={() => shift(-1)} aria-label="Ankstesnis mėnuo" sx={{ color: "#526079" }}>
            <ChevronLeftIcon />
          </IconButton>
          <Stack direction="row" alignItems="center" gap={0.8}>
            <CalendarMonthOutlinedIcon sx={{ color: "#1476ff", fontSize: 21 }} />
            <Typography sx={{ fontWeight: 800, color: "#101828", fontSize: ".98rem" }}>
              {ym.y} m. {MONTHS[ym.m - 1]}
            </Typography>
          </Stack>
          <IconButton onClick={() => shift(1)} aria-label="Kitas mėnuo" sx={{ color: "#526079" }}>
            <ChevronRightIcon />
          </IconButton>
        </Stack>
      </Paper>

      {error && <Alert severity="error" onClose={() => setError("")} sx={{ borderRadius: 1.5 }}>{error}</Alert>}

      {!data ? (
        <Box sx={{ display: "grid", placeItems: "center", py: 7 }}>
          <CircularProgress size={30} />
        </Box>
      ) : (
        <>
          {data.published ? (
            data.acknowledged ? (
              <Paper elevation={0} sx={{ ...cardSx, px: 1.8, py: 1.4 }}>
                <Stack direction="row" alignItems="center" gap={1.1}>
                  <Box sx={{ width: 38, height: 38, borderRadius: "50%", bgcolor: "#e7f8ee", color: "#079455", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <CheckCircleOutlineIcon sx={{ fontSize: 22 }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 750, fontSize: ".92rem", color: "#101828" }}>Grafikas patvirtintas</Typography>
                    <Typography sx={{ color: "#667085", fontSize: ".8rem" }}>Su šio mėnesio grafiku susipažinote.</Typography>
                  </Box>
                </Stack>
              </Paper>
            ) : (
              <Paper elevation={0} sx={{ ...cardSx, p: 1.8, borderColor: "#f4d58d", bgcolor: "#fffdf8" }}>
                <Typography sx={{ fontWeight: 800, color: "#101828", fontSize: ".95rem" }}>
                  {data.version > 1 ? "Grafikas pakeistas" : "Paskelbtas naujas grafikas"}
                </Typography>
                <Typography sx={{ mt: 0.35, mb: 1.3, color: "#667085", fontSize: ".82rem" }}>
                  Peržiūrėkite grafiką ir patvirtinkite, kad susipažinote.
                </Typography>
                <Button variant="contained" fullWidth onClick={() => post({ action: "ack", roster_id: data.roster_id })} sx={{ minHeight: 44 }}>
                  Susipažinau
                </Button>
              </Paper>
            )
          ) : (
            <Alert severity="info" sx={{ borderRadius: 1.5 }}>
              Šio mėnesio grafikas dar neparengtas.{data.can_add_preferences ? " Paspauskite dieną ir pateikite pageidavimą – į jį bus atsižvelgta sudarant grafiką." : ""}
            </Alert>
          )}

          {data.changes?.length > 0 && (
            <Alert severity="warning" sx={{ borderRadius: 1.5 }}>
              <Typography sx={{ fontWeight: 750, mb: 0.4, fontSize: ".88rem" }}>Pakeitimai</Typography>
              {data.changes.map((c) => (
                <Typography key={c.date} sx={{ fontSize: ".8rem" }}>{c.date.slice(5)}: {c.change}</Typography>
              ))}
              {data.changes[0].reason && (
                <Typography sx={{ mt: 0.5, fontSize: ".75rem" }}>Priežastis: {data.changes[0].reason}</Typography>
              )}
            </Alert>
          )}

          <Paper elevation={0} sx={{ ...cardSx, p: { xs: 1, sm: 1.35 }, overflow: "hidden" }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: { xs: 0.35, sm: 0.55 } }}>
              {WD.map((w, i) => (
                <Typography
                  key={w}
                  sx={{
                    py: 0.25,
                    textAlign: "center",
                    color: i > 4 ? "#e5484d" : "#7b8799",
                    fontSize: ".68rem",
                    fontWeight: 750,
                  }}
                >
                  {w}
                </Typography>
              ))}
              {Array.from({ length: offset }).map((_, i) => <Box key={`e${i}`} />)}
              {days.map((d) => {
                const s = byDate[d];
                const p = prefBy[d];
                const abs = data.absence_info?.[d] || (data.absences.includes(d) ? { kind: "other", short: "Nėra" } : null);
                const absent = !!abs;
                const req = data.requested?.[d];
                const ac = abs ? ABS_COLORS[abs.kind] || { bg: "#f2f4f7", fg: "#667085" } : null;
                const canPref = data.can_add_preferences && d >= todayIso;
                const isToday = d === todayIso;
                return (
                  <Box
                    key={d}
                    onClick={() => canPref && setPref({ date: d, kind: p?.kind || "day_off", shift_type_id: "", comment: p?.comment || "" })}
                    sx={{
                      minHeight: { xs: 51, sm: 58 },
                      borderRadius: 1,
                      px: 0.25,
                      py: 0.45,
                      textAlign: "center",
                      cursor: canPref ? "pointer" : "default",
                      border: "1px solid",
                      borderColor: p || req ? "#f2b84b" : isToday && !s ? "#8abcfb" : "transparent",
                      borderStyle: req && !p ? "dashed" : "solid",
                      bgcolor: absent ? ac.bg : s ? (s.color || "#1476ff") : isToday ? "#eef6ff" : "#f8fafc",
                      color: s && !absent ? "#fff" : "#101828",
                      boxShadow: p ? "inset 0 0 0 1px #f2b84b" : "none",
                      transition: "transform .12s ease",
                      "&:active": canPref ? { transform: "scale(.97)" } : undefined,
                    }}
                  >
                    <Typography sx={{ fontSize: { xs: 10.5, sm: 11.5 }, fontWeight: 750, lineHeight: 1.1, color: data.holidays?.[d] && !s ? "#e5484d" : "inherit" }}>
                      {Number(d.slice(8))}
                    </Typography>
                    {data.holidays?.[d] && !s && <Typography sx={{ fontSize: 7.5, lineHeight: 1.05, color: "#e5484d", mt: 0.25 }}>šventė</Typography>}
                    {s && <Typography sx={{ fontSize: { xs: 11.5, sm: 12.5 }, fontWeight: 850, lineHeight: 1.1, mt: 0.25 }}>{s.code}</Typography>}
                    {s && <Typography sx={{ fontSize: { xs: 7.6, sm: 8.6 }, lineHeight: 1.05, mt: 0.2 }}>{s.start}–{s.end}</Typography>}
                    {absent && <Typography sx={{ fontSize: { xs: 8, sm: 9 }, fontWeight: 750, color: ac.fg, mt: 0.35, lineHeight: 1.1 }}>{abs.short}</Typography>}
                    {!absent && req && <Typography sx={{ fontSize: 7.5, color: "#b54708", mt: 0.3, lineHeight: 1.05 }}>laukia</Typography>}
                  </Box>
                );
              })}
            </Box>
          </Paper>

          {(Object.keys(data.absence_info || {}).length > 0 || Object.keys(data.requested || {}).length > 0) && (
            <Paper elevation={0} sx={{ ...cardSx, px: 1.6, py: 1.2 }}>
              {Object.entries(data.absence_info || {}).map(([d, a]) => (
                <Typography key={`a${d}`} sx={{ fontSize: ".78rem", color: "#344054", lineHeight: 1.6 }}>
                  <Box component="span" sx={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", mr: 0.8, bgcolor: (ABS_COLORS[a.kind] || { fg: "#98a2b3" }).fg }} />
                  {Number(d.slice(8))} d. – {a.label}
                </Typography>
              ))}
              {Object.entries(data.requested || {}).map(([d, r]) => (
                <Typography key={`r${d}`} sx={{ fontSize: ".78rem", color: "#b54708", lineHeight: 1.6 }}>
                  <Box component="span" sx={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", mr: 0.8, border: "1px dashed #f2b84b" }} />
                  {Number(d.slice(8))} d. – {r.label}
                </Typography>
              ))}
            </Paper>
          )}

          {Object.keys(data.holidays || {}).length > 0 && (
            <Typography sx={{ color: "#667085", fontSize: ".72rem", lineHeight: 1.4, px: 0.2 }}>
              Šventės: {Object.entries(data.holidays).map(([d, n]) => `${Number(d.slice(8))} d. – ${n}`).join("; ")}
            </Typography>
          )}

          {data.published && (
            <Paper elevation={0} sx={{ ...cardSx, px: 1.6, py: 1.2 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                <Typography sx={{ color: "#667085", fontSize: ".82rem" }}>Šį mėnesį pagal grafiką</Typography>
                <Chip label={`${Number(data.total_hours).toLocaleString("lt-LT")} val.`} size="small" sx={{ bgcolor: "#eaf4ff", color: "#1476ff", fontWeight: 800 }} />
              </Stack>
            </Paper>
          )}

          {data.preferences.length > 0 && (
            <Box>
              <Typography sx={{ fontWeight: 850, color: "#101828", mb: 1, fontSize: "1.05rem" }}>Mano pageidavimai</Typography>
              <Paper elevation={0} sx={{ ...cardSx, overflow: "hidden" }}>
                {data.preferences.map((p, i) => (
                  <Box key={p.id} sx={{ px: 1.6, py: 1.25, borderBottom: i < data.preferences.length - 1 ? "1px solid #edf1f5" : 0 }}>
                    <Stack direction="row" alignItems="center" gap={1}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 750, color: "#101828", fontSize: ".86rem", lineHeight: 1.25 }}>
                          {p.kind_label}{p.shift ? ` (${p.shift})` : ""}
                        </Typography>
                        <Typography sx={{ mt: 0.25, color: "#667085", fontSize: ".76rem" }}>{p.date}</Typography>
                        {p.comment && <Typography sx={{ mt: 0.35, color: "#667085", fontSize: ".76rem" }}>{p.comment}</Typography>}
                      </Box>
                      {data.can_add_preferences && (
                        <IconButton size="small" aria-label="Ištrinti pageidavimą" onClick={() => post({ action: "pref_delete", id: p.id })} sx={{ color: "#98a2b3" }}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Stack>
                  </Box>
                ))}
              </Paper>
            </Box>
          )}

        </>
      )}

      <Dialog open={!!pref} onClose={() => setPref(null)} fullWidth PaperProps={{ sx: { borderRadius: 2, m: 1.5 } }}>
        <DialogTitle sx={{ fontWeight: 850, pb: 1 }}>Pageidavimas {pref?.date}</DialogTitle>
        <DialogContent>
          {pref && (
            <Stack gap={1.6} mt={0.5}>
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
              <Typography sx={{ color: "#667085", fontSize: ".72rem", lineHeight: 1.4 }}>
                Pageidavimai nėra garantuoti – į juos atsižvelgiama, jei leidžia darbo poreikis.
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2.2, pb: 2 }}>
          {pref && prefBy[pref.date] && (
            <Button color="error" onClick={async () => { await post({ action: "pref_delete", id: prefBy[pref.date].id }); setPref(null); }}>
              Ištrinti
            </Button>
          )}
          <Box flex={1} />
          <Button onClick={() => setPref(null)}>Atšaukti</Button>
          <Button
            variant="contained"
            onClick={async () => {
              if (await post({ action: "pref_add", date: pref.date, kind: pref.kind, shift_type_id: pref.shift_type_id || null, comment: pref.comment })) setPref(null);
            }}
          >
            Išsaugoti
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
