import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, InputAdornment, MenuItem, Paper, Radio, RadioGroup, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import FlightTakeoffIcon from "@mui/icons-material/FlightTakeoff";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import Tooltip from "@mui/material/Tooltip";
import BlockIcon from "@mui/icons-material/Block";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";

import { DatePicker, DateTimePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import "dayjs/locale/lt";

import { MONTHS, apiError, money, payrollApi } from "../../api/payroll";
import { AffectedRosters } from "./RosterRepair";
import { monthName, useDuStart, ymKey } from "./DuStart";

const dt = (v) => (v ? dayjs(v) : null);

const LT = "Lietuvos Respublika";
const STATUS_COLOR = { draft: "default", approved: "success", cancelled: "warning" };

function openHtml(html) {
  const w = window.open("", "_blank");
  w.document.open(); w.document.write(html); w.document.close();
}

const emptyTrip = () => {
  const d = new Date(); d.setDate(d.getDate() + 7);
  const day = d.toISOString().slice(0, 10);
  return { employee: "", start_at: `${day}T08:00`, end_at: `${day}T18:00`, destination: "", purpose: "",
    per_diem_pct: 100, advance_pct: 50, legs: [{ country: LT, date_from: day, date_to: day }],
    travel_out_hours: "", travel_back_hours: "", day_edits: {}, comp_rest_mode: "accrue" };
};
const comma = (v) => (v === null || v === undefined || v === "" ? "" : String(v).replace(".", ","));
const dot = (v) => String(v ?? "").replace(/\s/g, "").replace(",", ".");
// valandos: tik skaičiai, kablelis, ne daugiau 2 skaičių po kablelio (taškas paverčiamas kableliu)
const cleanNum = (v) => {
  const t = String(v).replace(".", ",").replace(/[^\d,]/g, "");
  const [a, ...rest] = t.split(",");
  return rest.length ? `${a},${rest.join("").slice(0, 2)}` : a;
};
const intOnly = (v, max = 100) => {
  const t = String(v).replace(/\D/g, "").slice(0, 3);
  return t === "" ? "" : String(Math.min(Number(t), max));
};
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// Valstybės eina iš eilės: pirmoji - nuo išvykimo, kiekviena kita - nuo savo „Nuo“, „Iki“ = kitos „Nuo“ arba grįžimas
function chainLegs(legs, startAt, endAt) {
  const start = (startAt || "").slice(0, 10);
  const end = (endAt || "").slice(0, 10);
  return legs.map((l, i) => ({
    ...l,
    date_from: i === 0 ? start : l.date_from,
    date_to: i < legs.length - 1 ? legs[i + 1].date_from : end,
  }));
}
function legsError(legs, startAt, endAt) {
  const start = (startAt || "").slice(0, 10);
  const end = (endAt || "").slice(0, 10);
  if (end < start) return "Grįžimas negali būti anksčiau už išvykimą";
  for (let i = 1; i < legs.length; i += 1) {
    if (!legs[i].date_from) return "Nurodykite, nuo kada vykstama į kitą valstybę";
    if (legs[i].date_from < legs[i - 1].date_from) return "Valstybių datos turi eiti iš eilės";
    if (legs[i].date_from > end) return `${legs[i].country || "Valstybė"}: data vėlesnė nei grįžimas`;
  }
  if (legs.some((l) => !l.country)) return "Pasirinkite valstybę";
  for (let i = 1; i < legs.length; i += 1) {
    if (legs[i].country === legs[i - 1].country) return `${legs[i].country} nurodyta du kartus iš eilės – palikite vieną`;
  }
  return "";
}
const WDN = ["Sk", "Pr", "An", "Tr", "Kt", "Pn", "Št"];
const md = (iso) => String(iso || "").slice(5);
const rng = (a, b) => (a === b ? md(a) : `${md(a)}–${md(b)}`);

// Užpildoma automatiškai - pilkas langelis be rėmelio, kad būtų aišku, jog jo keisti nereikia
function AutoDate({ label, value, hint }) {
  return (
    <Tooltip title={`Užpildoma automatiškai – ${hint}`}>
      <Box sx={{ flex: 1, minWidth: 0, px: 1.5, py: .55, borderRadius: 1, bgcolor: "#F2F4F7", cursor: "default" }}>
        <Typography sx={{ fontSize: 11, color: "#667085", lineHeight: 1.3 }}>{label} · automatiškai</Typography>
        <Typography sx={{ fontSize: 14, color: "#475467", fontWeight: 600, lineHeight: 1.45 }}>{value || "–"}</Typography>
        <Typography sx={{ fontSize: 11, color: "#98A2B3", lineHeight: 1.3 }}>{hint}</Typography>
      </Box>
    </Tooltip>
  );
}

// Nebuvimai komandiruotės dienomis: liga ir pan. - patvirtinti negalima; atostogos ir kt. - tik darbuotojui sutikus
function ConflictsBox({ conflicts, agree, onAgree }) {
  if (!conflicts) return null;
  const { block = [], resolve = [], pending = [] } = conflicts;
  if (!block.length && !resolve.length && !pending.length) return null;
  const row = (icon, title, text, color) => (
    <Stack direction="row" gap={1} alignItems="flex-start" sx={{ py: .4 }}>
      {icon}
      <Typography sx={{ fontSize: 13, color: "#344054" }}><b style={{ color }}>{title}</b> {text}</Typography>
    </Stack>
  );
  return (
    <Stack gap={1}>
      {block.length > 0 && (
        <Box sx={{ px: 1.5, py: 1.1, borderRadius: 2, bgcolor: "#FEF3F2" }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: "#912018", mb: .3 }}>Šiomis dienomis komandiruoti negalima</Typography>
          {block.map((x) => row(<BlockIcon key="i" sx={{ fontSize: 17, color: "#D92D20", mt: .2 }} />,
            `${x.label} ${rng(x.start, x.end)}`, `– ${x.reason}. Pakeiskite komandiruotės datas.`, "#B42318"))}
        </Box>
      )}
      {resolve.length > 0 && (
        <Box sx={{ px: 1.5, py: 1.1, borderRadius: 2, bgcolor: "#FFFAEB" }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: "#7A2E0E", mb: .3 }}>Komandiruotės dienomis darbuotojas turi nebuvimų</Typography>
          {resolve.map((x) => (
            <Box key={x.id}>
              {row(<EventBusyOutlinedIcon sx={{ fontSize: 17, color: "#DC6803", mt: .2 }} />,
                `${x.label} ${rng(x.start, x.end)}`, `– patvirtinus ${x.result}.`, "#B54708")}
              {x.note && <Typography sx={{ fontSize: 12, color: "#B54708", ml: 3.2 }}>{x.note}</Typography>}
            </Box>
          ))}
          <FormControlLabel sx={{ mt: .5, ml: -.5 }}
            control={<Checkbox size="small" checked={agree} onChange={(e) => onAgree(e.target.checked)} />}
            label={<Typography sx={{ fontSize: 13, fontWeight: 650 }}>Darbuotojas sutinka – patvirtinus komandiruotę šie nebuvimai bus sutrumpinti / atšaukti</Typography>} />
          <Typography sx={{ fontSize: 11.5, color: "#93370D", ml: 3.6 }}>
            Atšaukti iš kasmetinių atostogų galima tik darbuotojo sutikimu. Atšaukus komandiruotę, nebuvimai atkuriami.
          </Typography>
        </Box>
      )}
      {pending.length > 0 && (
        <Box sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: "#F2F4F7" }}>
          {pending.map((x) => row(<HourglassEmptyOutlinedIcon key="i" sx={{ fontSize: 17, color: "#667085", mt: .2 }} />,
            `Laukiantis prašymas: ${x.label.toLowerCase()} ${rng(x.start, x.end)}`, "– dar nepatvirtintas, apsvarstykite prieš siųsdami.", "#475467"))}
        </Box>
      )}
    </Stack>
  );
}

function TripDialog({ open, trip, onClose, onSaved, employees, norms, duStart }) {
  const [f, setF] = useState(emptyTrip());
  const [pre, setPre] = useState(null);
  const [showDays, setShowDays] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const conflictKey = JSON.stringify((pre?.conflicts?.resolve || []).map((x) => [x.id, x.start, x.end]));
  useEffect(() => { setAgree(false); }, [conflictKey]);
  const blocked = (pre?.conflicts?.block || []).length > 0;
  const needAgree = (pre?.conflicts?.resolve || []).length > 0 && !agree;
  useEffect(() => {
    if (!open) return;
    setError("");
    setF(trip ? { ...emptyTrip(), ...trip, start_at: trip.start_at.slice(0, 16), end_at: trip.end_at.slice(0, 16),
      per_diem_pct: String(Math.round(Number(trip.per_diem_pct))), advance_pct: String(Math.round(Number(trip.advance_pct))),
      travel_out_hours: comma(trip.travel_out_hours), travel_back_hours: comma(trip.travel_back_hours), day_edits: trip.day_edits || {} } : emptyTrip());
    setShowDays(false);
  }, [open, trip]);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => {
      payrollApi.tripPreview({ legs: f.legs, start_at: f.start_at, end_at: f.end_at, per_diem_pct: f.per_diem_pct,
        employee: f.employee || null, travel_out_hours: dot(f.travel_out_hours) || 0, travel_back_hours: dot(f.travel_back_hours) || 0,
        day_edits: f.day_edits || {} })
        .then(setPre).catch(() => setPre(null));
    }, 300);
    return () => clearTimeout(t);
  }, [open, f.legs, f.start_at, f.end_at, f.per_diem_pct, f.employee, f.travel_out_hours, f.travel_back_hours, f.day_edits]);
  const editDay = (date, key, value) => setF((s) => {
    const row = (pre?.plan || []).find((r) => r.date === date) || {};
    const cur = s.day_edits?.[date] || { travel: row.travel, work: row.work };
    return { ...s, day_edits: { ...(s.day_edits || {}), [date]: { ...cur, [key]: dot(value) || 0 } } };
  });

  const setLeg = (i, v) => setF((s) => ({ ...s, legs: chainLegs(s.legs.map((l, j) => (j === i ? { ...l, ...v } : l)), s.start_at, s.end_at) }));
  const setDates = (key, value) => setF((s) => {
    const n = { ...s, [key]: value };
    if (key === "start_at" && n.end_at < value) n.end_at = `${value.slice(0, 10)}${n.end_at.slice(10)}`;
    n.legs = chainLegs(s.legs, n.start_at, n.end_at);
    return n;
  });
  const addLeg = () => setF((s) => {
    const last = s.legs.at(-1);
    const from = last.date_from < s.end_at.slice(0, 10) ? addDays(last.date_from, 1) : s.end_at.slice(0, 10);
    return { ...s, legs: chainLegs([...s.legs, { country: "", date_from: from, date_to: "" }], s.start_at, s.end_at) };
  });
  const removeLeg = (i) => setF((s) => ({ ...s, legs: chainLegs(s.legs.filter((_, j) => j !== i), s.start_at, s.end_at) }));
  const legErr = legsError(f.legs, f.start_at, f.end_at);

  const save = async (approve) => {
    setBusy(true); setError("");
    try {
      const saved = await payrollApi.saveTrip({ ...f, employee: f.employee || null, legs: chainLegs(f.legs, f.start_at, f.end_at),
        per_diem_pct: Number(f.per_diem_pct) || 100, advance_pct: Number(f.advance_pct) || 0,
        travel_out_hours: dot(f.travel_out_hours) || 0, travel_back_hours: dot(f.travel_back_hours) || 0 });
      const r = approve ? await payrollApi.approveTrip(saved.id, { resolve_absences: agree }) : null;
      onSaved(r); onClose();
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" disableScrollLock>
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="lt">
      <DialogTitle>{trip ? "Komandiruotė" : "Siųsti į komandiruotę"}</DialogTitle>
      <DialogContent>
        <Stack gap={2} mt={1}>
          <Autocomplete options={employees} value={employees.find((e) => e.id === f.employee) || null}
            getOptionLabel={(e) => e.full_name || `${e.first_name} ${e.last_name}`} isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_, v) => setF({ ...f, employee: v ? v.id : "" })}
            renderOption={(props, e) => (
              <li {...props} key={e.id}>
                <Box>
                  <Typography fontSize={14}>{e.full_name || `${e.first_name} ${e.last_name}`}</Typography>
                  {e.position && <Typography fontSize={12} color="text.secondary">{e.position}</Typography>}
                </Box>
              </li>
            )}
            renderInput={(p) => <TextField {...p} label="Darbuotojas" placeholder="Ieškoti pagal vardą ar pavardę" />} />
          <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
            <DateTimePicker label="Išvykimas" value={dt(f.start_at)} ampm={false} format="YYYY-MM-DD HH:mm"
              onChange={(v) => v && v.isValid() && setDates("start_at", v.format("YYYY-MM-DDTHH:mm"))}
              slotProps={{ textField: { fullWidth: true } }} />
            <DateTimePicker label="Grįžimas" value={dt(f.end_at)} ampm={false} format="YYYY-MM-DD HH:mm"
              minDate={duStart ? dayjs(`${ymKey(duStart.year, duStart.month)}-01`) : undefined}
              onChange={(v) => v && v.isValid() && setDates("end_at", v.format("YYYY-MM-DDTHH:mm"))}
              slotProps={{ textField: { fullWidth: true } }} />
          </Stack>
          {duStart && f.start_at && f.start_at.slice(0, 7) < ymKey(duStart.year, duStart.month) && (
            <Alert severity="warning" sx={{ py: 0 }}>
              Išvykimas – anksčiau, nei DU pradėtas vesti DokSkene ({monthName(duStart.year, duStart.month)}). Dienpinigiai bus apskaičiuoti už visą
              komandiruotę – patikrinkite, ar dalis jų nebuvo išmokėta ankstesnėje programoje.
            </Alert>
          )}
          <Box>
            <Typography fontWeight={600}>Kur vyksta</Typography>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary", mb: 1.25 }}>
              {f.legs.length > 1
                ? "Nurodykite tik dieną, kai pervažiuojate į kitą valstybę – pilkos datos užpildomos automatiškai."
                : "Datos imamos iš išvykimo ir grįžimo. Jei vykstate į kelias valstybes – pridėkite kitą."}
            </Typography>
            <Stack gap={1.25}>
              {f.legs.map((l, i) => (
                <Stack key={i} direction={{ xs: "column", sm: "row" }} gap={1} alignItems={{ sm: "flex-start" }}>
                  <Box sx={{ width: 24, height: 24, mt: 1, borderRadius: "50%", bgcolor: "#EEF4FF", color: "primary.main", fontSize: 12.5,
                    fontWeight: 700, display: { xs: "none", sm: "grid" }, placeItems: "center", flexShrink: 0 }}>{i + 1}</Box>
                  <Autocomplete options={norms.map((n) => n.name).filter((n) => n !== f.legs[i - 1]?.country && n !== f.legs[i + 1]?.country)}
                    value={l.country || null} disableClearable sx={{ flex: 2 }}
                    onChange={(_, v) => setLeg(i, { country: v })}
                    renderOption={(props, o) => <li {...props} key={o}>{o} · {String(norms.find((n) => n.name === o)?.amount ?? "").replace(".", ",")} €</li>}
                    renderInput={(p) => <TextField {...p} size="small" label="Valstybė" />} />
                  {i === 0 ? (
                    <AutoDate label="Nuo" value={l.date_from} hint="išvykimo diena" />
                  ) : (
                    <DatePicker label="Nuo (pervažiavimo diena)" value={dt(l.date_from)} format="YYYY-MM-DD"
                      minDate={dt(f.legs[i - 1].date_from)} maxDate={dt(f.end_at.slice(0, 10))}
                      onChange={(v) => v && v.isValid() && setLeg(i, { date_from: v.format("YYYY-MM-DD") })}
                      slotProps={{ textField: { size: "small", sx: { flex: 1 } } }} />
                  )}
                  <AutoDate label="Iki" value={l.date_to}
                    hint={i === f.legs.length - 1 ? "grįžimo diena" : `kai išvykstama į ${f.legs[i + 1]?.country ? f.legs[i + 1].country.replace(" Respublika", "") : "kitą valstybę"}`} />
                  {f.legs.length > 1 ? (
                    <IconButton size="small" onClick={() => removeLeg(i)} sx={{ mt: .6 }}><DeleteOutlineIcon fontSize="small" /></IconButton>
                  ) : <Box sx={{ width: 34, display: { xs: "none", sm: "block" } }} />}
                </Stack>
              ))}
              {legErr && <Alert severity="error" sx={{ py: 0 }}>{legErr}</Alert>}
              <Button size="small" startIcon={<AddIcon />} sx={{ alignSelf: "flex-start" }} onClick={addLeg}>
                Kita valstybė
              </Button>
            </Stack>
          </Box>
          <ConflictsBox conflicts={pre?.conflicts} agree={agree} onAgree={setAgree} />
          <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
            <TextField label="Kelionė pirmyn" value={f.travel_out_hours} onChange={(e) => setF({ ...f, travel_out_hours: cleanNum(e.target.value) })}
              inputProps={{ inputMode: "decimal" }} InputProps={{ endAdornment: <InputAdornment position="end">val.</InputAdornment> }}
              helperText="Kiek truko kelionė į vietą" fullWidth />
            <TextField label="Kelionė atgal" value={f.travel_back_hours} onChange={(e) => setF({ ...f, travel_back_hours: cleanNum(e.target.value) })}
              inputProps={{ inputMode: "decimal" }} InputProps={{ endAdornment: <InputAdornment position="end">val.</InputAdornment> }}
              helperText="Kiek truko kelionė grįžtant" fullWidth />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
            <TextField label="Miestas / įmonė (nebūtina)" value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} fullWidth />
            <TextField label="Dienpinigiai, % normos" value={f.per_diem_pct === "" ? "" : String(Math.round(Number(f.per_diem_pct)))}
              inputProps={{ inputMode: "numeric" }} onChange={(e) => setF({ ...f, per_diem_pct: intOnly(e.target.value) })}
              error={f.per_diem_pct !== "" && Number(f.per_diem_pct) < 50} helperText="50–100 %" sx={{ width: { sm: 200 } }} />
            <TextField label="Avansas, %" value={f.advance_pct === "" ? "" : String(Math.round(Number(f.advance_pct)))}
              inputProps={{ inputMode: "numeric" }} onChange={(e) => setF({ ...f, advance_pct: intOnly(e.target.value) })}
              helperText="0–100 %" sx={{ width: { sm: 150 } }} />
          </Stack>
          <TextField label="Tikslas (nebūtina)" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} multiline minRows={2} />

          {pre?.plan && (
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
              <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
                <Box sx={{ flex: 1, minWidth: 220 }}>
                  <Typography fontWeight={700} fontSize={14}>Darbo laikas komandiruotėje</Typography>
                  <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
                    Iš viso {comma(pre.plan_totals.total)} val. (kelionė {comma(pre.plan_totals.travel)}, darbas {comma(pre.plan_totals.work)})
                    {Number(pre.plan_totals.comp_rest) > 0 ? ` · kompensacinis poilsis ${comma(pre.plan_totals.comp_rest)} val.` : ""}
                  </Typography>
                </Box>
                <Button size="small" onClick={() => setShowDays(!showDays)} endIcon={showDays ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  sx={{ textTransform: "none" }}>{showDays ? "Suskleisti" : "Detaliau"}</Button>
              </Stack>
              {!pre.roster_exists && (
                <Alert severity="info" sx={{ mt: 1 }}>Grafikas dar nesudarytas – darbo valandos priskirtos pagal darbo dienas. Patikslinkite, jei reikia.</Alert>
              )}
              <Collapse in={showDays}>
                <Table size="small" sx={{ mt: 1, "& td, & th": { px: 1, fontSize: 12.5 } }}>
                  <TableHead><TableRow>
                    <TableCell>Diena</TableCell><TableCell>Pagal grafiką</TableCell><TableCell align="center">Kelionė, val.</TableCell>
                    <TableCell align="center">Darbas, val.</TableCell><TableCell align="right">Iš viso</TableCell><TableCell align="right">Kompens. poilsis</TableCell>
                  </TableRow></TableHead>
                  <TableBody>
                    {pre.plan.map((r) => {
                      const d = new Date(r.date);
                      const inp = (key) => (
                        <TextField size="small" value={comma(f.day_edits?.[r.date]?.[key] ?? r[key])} onChange={(e) => editDay(r.date, key, cleanNum(e.target.value))}
                          inputProps={{ inputMode: "decimal", style: { textAlign: "center", padding: "4px 6px", width: 44 } }} />
                      );
                      return (
                        <TableRow key={r.date} sx={{ bgcolor: r.edited ? "#FFFAEB" : undefined }}>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>{WDN[d.getDay()]} {r.date.slice(5)}</TableCell>
                          <TableCell sx={{ color: r.off ? "text.secondary" : undefined }}>
                            {r.planned ? `${r.planned.code ? `${r.planned.code} ` : ""}${r.planned.time} · ${comma(r.planned.hours)} val.` : "poilsio diena"}
                          </TableCell>
                          <TableCell align="center">{inp("travel")}</TableCell>
                          <TableCell align="center">{inp("work")}</TableCell>
                          <TableCell align="right">{comma(r.total)}</TableCell>
                          <TableCell align="right">{Number(r.comp_rest) > 0 ? `+${comma(r.comp_rest)} val.` : ""}
                            {Number(r.rest_day_work) > 0 && <Typography sx={{ fontSize: 11, color: "warning.dark" }}>darbas poilsio dieną ×2</Typography>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {Object.keys(f.day_edits || {}).length > 0 && (
                  <Button size="small" onClick={() => setF({ ...f, day_edits: {} })} sx={{ textTransform: "none", mt: .5 }}>Atstatyti automatinį paskirstymą</Button>
                )}
              </Collapse>
              {Number(pre.plan_totals.comp_rest) > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>Kompensacinis poilsis už kelionę ne darbo laiku (DK 107 str.)</Typography>
                  <RadioGroup row value={f.comp_rest_mode || "accrue"} onChange={(e) => setF({ ...f, comp_rest_mode: e.target.value })}>
                    <FormControlLabel value="accrue" control={<Radio size="small" />} label={<Typography fontSize={13}>Kaupti (suteiksite vėliau)</Typography>} />
                    <FormControlLabel value="vacation" control={<Radio size="small" />} label={<Typography fontSize={13}>Prijungti prie kasmetinių atostogų</Typography>} />
                  </RadioGroup>
                </Box>
              )}
            </Paper>
          )}

          {pre?.errors?.map((e) => <Alert key={e} severity="error">{e}</Alert>)}
          {pre && !pre.errors?.length && (
            <Paper variant="outlined">
              <Table size="small">
                <TableHead><TableRow><TableCell>Data</TableCell><TableCell>Valstybė</TableCell><TableCell align="right">Norma</TableCell><TableCell align="right">Dydis</TableCell><TableCell align="right">Suma</TableCell></TableRow></TableHead>
                <TableBody>
                  {pre.days.map((d) => (
                    <TableRow key={d.date}>
                      <TableCell>{d.date}</TableCell>
                      <TableCell>{d.country}{d.note && <Typography variant="caption" color="text.secondary" display="block">{d.note}</Typography>}</TableCell>
                      <TableCell align="right">{String(d.norm).replace(".", ",")} €</TableCell>
                      <TableCell align="right">{Number(d.pct)} %</TableCell>
                      <TableCell align="right">{money(d.amount)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow><TableCell colSpan={4}><b>Dienpinigiai iš viso</b></TableCell><TableCell align="right"><b>{money(pre.total)}</b></TableCell></TableRow>
                </TableBody>
              </Table>
            </Paper>
          )}
          <Typography variant="caption" color="text.secondary">
            Patvirtinus: įsakymas, tabelyje „K“, avansas – skiltyje „Išmokėjimai“ (iki paskutinės darbo dienos prieš komandiruotę).
            Likusi dalis išmokama su DU; neapmokestinama dalis – GPM312 kodas 05, viršijanti ribas – apmokestinama kaip DU.
            Kelionės ir nakvynės išlaidos apmokamos pagal dokumentus.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>Atšaukti</Button>
        <Button disabled={busy || !f.employee || !!legErr} onClick={() => save(false)}>Išsaugoti juodraštį</Button>
        <Tooltip title={blocked ? "Šiomis dienomis darbuotojas negali vykti – pakeiskite datas" : needAgree ? "Pažymėkite, kad darbuotojas sutinka sutrumpinti nebuvimus" : ""}>
          <span>
            <Button variant="contained" disabled={busy || !f.employee || !!legErr || pre?.errors?.length > 0 || Number(f.per_diem_pct) < 50 || blocked || needAgree}
              onClick={() => save(true)}>Patvirtinti</Button>
          </span>
        </Tooltip>
      </DialogActions>
      </LocalizationProvider>
    </Dialog>
  );
}

// Komandiruotės kopija kitam mėnesiui: tos pačios dienos (jei mėnesyje jų nėra - paskutinė diena), tas pats laikas
function shiftIso(iso, months) {
  const d = dayjs(iso);
  const t = d.add(months, "month");
  return iso.length > 10 ? t.format("YYYY-MM-DDTHH:mm") : t.format("YYYY-MM-DD");
}

function CopyTripDialog({ trip, onClose, onCopied, duStart }) {
  const [target, setTarget] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setError(""); setTarget(trip ? dayjs(trip.start_at).add(1, "month").startOf("month") : null); }, [trip]);
  if (!trip) return null;
  const save = async () => {
    setBusy(true); setError("");
    try {
      const months = target.diff(dayjs(trip.start_at).startOf("month"), "month");
      const legs = trip.legs.map((l) => ({ country: l.country, date_from: shiftIso(String(l.date_from), months), date_to: shiftIso(String(l.date_to), months) }));
      const saved = await payrollApi.saveTrip({
        employee: trip.employee, start_at: shiftIso(trip.start_at.slice(0, 16), months), end_at: shiftIso(trip.end_at.slice(0, 16), months),
        legs, destination: trip.destination || "", purpose: trip.purpose || "", per_diem_pct: trip.per_diem_pct, advance_pct: trip.advance_pct,
        travel_out_hours: trip.travel_out_hours || 0, travel_back_hours: trip.travel_back_hours || 0, comp_rest_mode: trip.comp_rest_mode || "accrue",
      });
      onCopied(saved, target);
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" disableScrollLock>
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="lt">
        <DialogTitle>Kopijuoti komandiruotę</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {trip.employee_name}: bus sukurtas juodraštis pasirinktame mėnesyje su tomis pačiomis dienomis ir laiku (jei tokios dienos nėra – paskutinė mėnesio diena).
          </Typography>
          <DatePicker label="Į mėnesį" views={["year", "month"]} format="YYYY-MM" value={target}
            minDate={duStart ? dayjs(`${ymKey(duStart.year, duStart.month)}-01`) : undefined}
            onChange={(v) => v && v.isValid() && setTarget(v.startOf("month"))} slotProps={{ textField: { fullWidth: true } }} />
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose}>Atšaukti</Button>
          <Button variant="contained" disabled={busy || !target} onClick={save}>Kopijuoti</Button>
        </DialogActions>
      </LocalizationProvider>
    </Dialog>
  );
}

// ym / onYmChange - mėnuo valdomas iš „Grafikai ir tabeliai“ (adrese ?m=), kitaip - savas
export default function KomandiruotesPage({ embedded = false, ym: ymProp = null, onYmChange = null } = {}) {
  const now = new Date();
  const [ownYm, setOwnYm] = useState(() => {
    const q = /[?&]m=(\d{4})-(\d{2})/.exec(window.location.search);         // ?m=2026-11 - iš grafiko / tabelio
    return q ? { y: Number(q[1]), m: Number(q[2]) } : { y: now.getFullYear(), m: now.getMonth() + 1 };
  });
  const ym = ymProp ? { y: ymProp.year, m: ymProp.month } : ownYm;
  const setYm = (v) => {
    const next = typeof v === "function" ? v(ym) : v;
    if (onYmChange) onYmChange({ year: next.y, month: next.m }); else setOwnYm(next);
  };
  const { start: duStart } = useDuStart();     // komandiruotės, pasibaigusios iki DU pradžios, - kitoje programoje
  const [rows, setRows] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [norms, setNorms] = useState([]);
  const [dlg, setDlg] = useState(null);
  const [copy, setCopy] = useState(null);
  const [error, setError] = useState("");
  const [rosters, setRosters] = useState([]);        // paveikti grafikai (po patvirtinimo / atšaukimo)
  const [warn, setWarn] = useState([]);

  const load = useCallback(() => {
    payrollApi.trips({ year: ym.y, month: ym.m }).then((r) => setRows(Array.isArray(r) ? r : r.results || [])).catch((e) => setError(apiError(e)));
  }, [ym.y, ym.m]);
  useEffect(load, [load]);
  useEffect(() => {
    payrollApi.employees({ status: "active" }).then((r) => setEmployees(Array.isArray(r) ? r : r.results || [])).catch(() => {});
    payrollApi.tripNorms().then(setNorms).catch(() => {});
  }, []);
  const shift = (d) => setYm(({ y, m }) => { const x = new Date(y, m - 1 + d, 1); return { y: x.getFullYear(), m: x.getMonth() + 1 }; });
  const act = async (fn, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setError("");
    try {
      const r = await fn();
      if (r?.rosters) setRosters(r.rosters);
      setWarn(r?.warnings || []);
      load();
    } catch (e) { setError(apiError(e)); }
  };
  const total = useMemo(() => (rows || []).filter((r) => r.status === "approved").reduce((a, r) => a + Number(r.total), 0), [rows]);

  return (
    <Box sx={{ p: embedded ? 0 : { xs: 2, md: 3 } }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={2} mb={2}>
        {!embedded && <Typography variant="h5" fontWeight={700}>Komandiruotės</Typography>}
        <Stack direction="row" alignItems="center" gap={1}>
          <IconButton onClick={() => shift(-1)}><ChevronLeftIcon /></IconButton>
          <Typography fontWeight={700} sx={{ minWidth: 150, textAlign: "center" }}>{ym.y} m. {MONTHS[ym.m - 1].toLowerCase()}</Typography>
          <IconButton onClick={() => shift(1)}><ChevronRightIcon /></IconButton>
          <Button variant="contained" startIcon={<FlightTakeoffIcon />} onClick={() => setDlg({ trip: null })}>Siųsti į komandiruotę</Button>
        </Stack>
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {warn.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setWarn([])}>
          {warn.map((w) => <Typography key={w} variant="body2">{w}</Typography>)}
        </Alert>
      )}
      <AffectedRosters items={rosters} onClose={() => setRosters([])} sx={{ mb: 2 }} />
      {!rows ? <CircularProgress /> : rows.length === 0 ? (
        <Alert severity="info">Šį mėnesį komandiruočių nėra.</Alert>
      ) : (
        <Stack gap={1.5}>
          {rows.map((t) => (
            <Paper key={t.id} variant="outlined" sx={{ p: 2 }}>
              <Stack direction={{ xs: "column", md: "row" }} gap={1.5} alignItems={{ md: "center" }}>
                <Box flex={1}>
                  <Typography fontWeight={700}>{t.employee_name} · {t.legs.map((l) => l.country.replace(" Respublika", "")).join(" → ")}{t.destination ? ` (${t.destination})` : ""}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t.start_at.slice(0, 16).replace("T", " ")} – {t.end_at.slice(0, 16).replace("T", " ")}
                    {t.order_number ? ` · įsakymas ${t.order_number}` : ""} · dienpinigiai {money(t.total)}
                    {t.advance_status ? ` · avansas ${money(t.advance_status.amount)} (${t.advance_status.status === "paid" ? "sumokėtas" : "nesumokėtas"})` : ""}
                  </Typography>
                </Box>
                <Chip size="small" color={STATUS_COLOR[t.status]} label={t.status_label} />
                <Tooltip title="Kopijuoti į kitą mėnesį">
                  <IconButton size="small" onClick={() => setCopy(t)}><ContentCopyOutlinedIcon fontSize="small" /></IconButton>
                </Tooltip>
                {t.status === "draft" && (
                  <>
                    <Button size="small" onClick={() => setDlg({ trip: t })}>Redaguoti</Button>
                    <Button size="small" variant="contained" onClick={() => setDlg({ trip: t })}>Patvirtinti…</Button>
                    <IconButton size="small" onClick={() => act(() => payrollApi.deleteTrip(t.id), "Ištrinti juodraštį?")}><DeleteOutlineIcon fontSize="small" /></IconButton>
                  </>
                )}
                {t.status === "approved" && (
                  <>
                    <Button size="small" onClick={() => payrollApi.tripOrderHtml(t.id).then(openHtml)}>Įsakymas</Button>
                    <Button size="small" color="warning" onClick={() => act(() => payrollApi.cancelTrip(t.id), "Atšaukti komandiruotę? Bus pašalintas avansas ir tabelio žyma, o patvirtinant sutrumpinti nebuvimai (atostogos ir kt.) – atkurti.")}>Atšaukti</Button>
                  </>
                )}
              </Stack>
            </Paper>
          ))}
          <Typography variant="body2" color="text.secondary">Patvirtintų komandiruočių dienpinigiai šį mėnesį: <b>{money(total)}</b></Typography>
        </Stack>
      )}
      <TripDialog open={!!dlg} trip={dlg?.trip} onClose={() => setDlg(null)}
        onSaved={(r) => { if (r?.rosters) setRosters(r.rosters); load(); }} employees={employees} norms={norms} duStart={duStart} />
      <CopyTripDialog trip={copy} onClose={() => setCopy(null)} duStart={duStart}
        onCopied={(saved, target) => { setCopy(null); setYm({ y: target.year(), m: target.month() + 1 }); setDlg({ trip: saved }); }} />
    </Box>
  );
}
