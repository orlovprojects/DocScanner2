import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Badge, Box, Button, Checkbox, Chip, Collapse, FormControlLabel, ListItemIcon, Menu, MenuItem, Popover, Radio, RadioGroup, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton,
  Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import FilterListIcon from "@mui/icons-material/FilterList";
import CloseIcon from "@mui/icons-material/Close";
import ScheduleIcon from "@mui/icons-material/Schedule";
import BlockIcon from "@mui/icons-material/Block";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import BloodtypeOutlinedIcon from "@mui/icons-material/BloodtypeOutlined";
import HowToVoteOutlinedIcon from "@mui/icons-material/HowToVoteOutlined";
import DoNotDisturbOnOutlinedIcon from "@mui/icons-material/DoNotDisturbOnOutlined";
import HotelOutlinedIcon from "@mui/icons-material/HotelOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import ViewListOutlinedIcon from "@mui/icons-material/ViewListOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import GavelOutlinedIcon from "@mui/icons-material/GavelOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CheckIcon from "@mui/icons-material/Check";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import FlightTakeoffIcon from "@mui/icons-material/FlightTakeoff";
import BeachAccessOutlinedIcon from "@mui/icons-material/BeachAccessOutlined";
import SickOutlinedIcon from "@mui/icons-material/SickOutlined";
import MoneyOffOutlinedIcon from "@mui/icons-material/MoneyOffOutlined";
import ChildCareOutlinedIcon from "@mui/icons-material/ChildCareOutlined";
import FamilyRestroomOutlinedIcon from "@mui/icons-material/FamilyRestroomOutlined";
import PregnantWomanOutlinedIcon from "@mui/icons-material/PregnantWomanOutlined";
import PersonOffOutlinedIcon from "@mui/icons-material/PersonOffOutlined";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import "dayjs/locale/lt";
import { useNavigate } from "react-router-dom";

import { MONTHS, apiError, payrollApi } from "../../api/payroll";
import { GridSkeleton, ListSkeleton } from "./PayrollSkeletons";
import { PALETTE, shiftColor, shiftText } from "./GrafikaiPage";
import { TripChoiceBanner, tripExcess } from "./TripPeriodChoice";
import SodraReportsDialog from "./SodraReportsDialog";

const WD = ["Pr", "An", "Tr", "Kt", "Pn", "Št", "Sk"];
const num = (v) => Number(v || 0);
const fmt = (v) => {
  const n = num(v);
  return n ? n.toLocaleString("lt-LT", { maximumFractionDigits: 2 }) : "";
};
const toDot = (v) => String(v ?? "").replace(/\s/g, "").replace(",", ".");

// nebuvimai - tos pačios ikonos ir spalvos kaip grafike (be fono ir dryžių)
const ABS = {
  // Spalvos ir piktogramos suderintos su Grafikai žymėjimais.
  vacation: { l: "Kasmetinės atostogos", col: "#0876B9", bg: "#E9F7FF", Icon: BeachAccessOutlinedIcon },
  vacation_prepaid: { l: "Kasmetinės atostogos (apmokėtos anksčiau)", col: "#0876B9", bg: "#E9F7FF", Icon: BeachAccessOutlinedIcon },
  sick: { l: "Liga", col: "#C03664", bg: "#FFF0F5", Icon: SickOutlinedIcon },
  parent_day: { l: "Mamadienis / tėvadienis", col: "#087E80", bg: "#E4F8F6", Icon: ChildCareOutlinedIcon },
  unpaid: { l: "Nemokamos atostogos", col: "#BA7013", bg: "#FFF2DD", Icon: MoneyOffOutlinedIcon },
  childcare: { l: "Vaiko priežiūros atostogos", col: "#7350C7", bg: "#F2EDFF", Icon: FamilyRestroomOutlinedIcon },
  maternity: { l: "Nėštumo ir gimdymo atostogos", col: "#B2459D", bg: "#FCEFFC", Icon: PregnantWomanOutlinedIcon },
  paternity: { l: "Tėvystės atostogos", col: "#7350C7", bg: "#F2EDFF", Icon: FamilyRestroomOutlinedIcon },
  truancy: { l: "Pravaikšta", col: "#BE3F35", bg: "#FFF0EE", Icon: PersonOffOutlinedIcon },
  downtime: { l: "Prastova", col: "#52647B", bg: "#EEF2F7", Icon: PauseCircleOutlineIcon },
  study: { l: "Mokymosi atostogos", col: "#3E5BA9", bg: "#EAF0FB", Icon: SchoolOutlinedIcon },
  donor: { l: "Donorystė", col: "#B42318", bg: "#FEF0EF", Icon: BloodtypeOutlinedIcon },
  civic: { l: "Valstybinės pareigos", col: "#52647B", bg: "#EEF2F7", Icon: HowToVoteOutlinedIcon },
  suspension: { l: "Nušalinimas", col: "#7A4B1F", bg: "#F8F0E6", Icon: DoNotDisturbOnOutlinedIcon },
  comp_rest: { l: "Kompensacinis poilsis", col: "#0E7090", bg: "#E6F6FA", Icon: HotelOutlinedIcon },
  business_trip: { l: "Komandiruotė", col: "#1E3A6E", bg: "#EDF3FB", Icon: FlightTakeoffIcon },
};
const LEGEND = ["vacation", "sick", "parent_day", "unpaid", "childcare", "maternity", "truancy", "downtime", "business_trip"];
// greitas meniu: [rūšis, ar reikia laikotarpio]
// [rūšis, ar laikotarpis] - 8 dažniausi rodomi iškart, kiti - paspaudus „Kiti“
const QUICK_ABS = [["vacation", true], ["sick", true], ["parent_day", false], ["unpaid", true], ["childcare", true],
  ["maternity", true], ["truancy", false], ["downtime", false]];
const OTHER_ABS = [["study", true], ["paternity", true], ["donor", false], ["civic", true], ["suspension", true], ["comp_rest", false],
  ["none", false]];
// „Nedirbo“ - ne nebuvimo įrašas, o 0 val. tą dieną (be priežasties)
const NONE_ABS = { l: "Klaida grafike – nedirbo (0 val.)", col: "#475467", bg: "#F2F4F7", Icon: BlockIcon };
const OT = ["overtime", "ot_night", "ot_rest", "ot_holiday"];

function marks(d) {
  const e = d.extra || {};
  const out = [];
  if (num(e.night) || num(e.ot_night)) out.push({ t: "N", col: "#6941C6" });
  if (num(e.holiday) || num(e.ot_holiday)) out.push({ t: "Š", col: "#6941C6" });
  if (num(e.rest_day) || num(e.ot_rest)) out.push({ t: "P", col: "#6941C6" });
  const ot = OT.reduce((a, k) => a + num(e[k]), 0);
  if (ot) out.push({ t: `V ${fmt(ot)}`, col: "#B54708" });
  return out;
}

function NumField({ label, value, onChange }) {
  return (
    <TextField size="small" label={label} value={value} placeholder="0" InputLabelProps={{ shrink: true }}
      inputProps={{ inputMode: "decimal", style: { fontWeight: 700, fontSize: 15 } }}
      onChange={(e) => onChange(e.target.value.replace(".", ",").replace(/[^\d,]/g, ""))}
      sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5, bgcolor: "white" }, "& .MuiInputLabel-root": { fontSize: 13 } }}
      InputProps={{ endAdornment: <Typography sx={{ fontSize: 11.5, color: "#98A2B3", ml: .5 }}>val.</Typography> }} />
  );
}

// Pamainų spalvos kaip grafike: aktyvios pagal eilę, neaktyvios - pirma paletės spalva
function typeColorMap(shiftTypes) {
  const m = {};
  (shiftTypes || []).filter((t) => t.active !== false).forEach((t, i) => { m[t.id] = shiftColor(t.color) || PALETTE[i % PALETTE.length]; });
  (shiftTypes || []).filter((t) => t.active === false).forEach((t) => { m[t.id] = shiftColor(t.color) || PALETTE[0]; });
  return m;
}

// Pasirinkimo kortelė (radio stiliaus)
function ChoiceCard({ active, onClick, title, subtitle, icon, color = "#2E6BE6", children }) {
  return (
    <Box role="radio" aria-checked={active} tabIndex={0} onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      sx={{ borderRadius: 2, border: `1.5px solid ${active ? color : "#E4E7EC"}`, bgcolor: active ? `${color}0D` : "#FFFFFF",
        cursor: "pointer", transition: "all .12s", "&:hover": { borderColor: active ? color : "#B9C3D3" }, outline: "none",
        "&:focus-visible": { boxShadow: `0 0 0 3px ${color}33` } }}>
      <Stack direction="row" alignItems="center" gap={1.3} sx={{ px: 1.5, py: 1.2 }}>
        <Box sx={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
          bgcolor: active ? color : "#F2F4F7", color: active ? "#FFFFFF" : "#667085", transition: "all .12s" }}>{icon}</Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: "#101828" }}>{title}</Typography>
          {subtitle && <Typography sx={{ fontSize: 12, color: "#667085" }}>{subtitle}</Typography>}
        </Box>
        <Box sx={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${active ? color : "#D0D5DD"}`, display: "grid", placeItems: "center" }}>
          {active && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color }} />}
        </Box>
      </Stack>
      {active && children && <Box sx={{ px: 1.5, pb: 1.5 }} onClick={(e) => e.stopPropagation()}>{children}</Box>}
    </Box>
  );
}

// Dienos keitimo langas: „Darbo laikas“ (kaip grafike / kitu laiku / nedirbo / rankiniu būdu) arba „Nebuvimas“
function DayDialog({ value, info, typeColor, onClose, onChanged, onOpenTrip }) {
  const { row, day } = value;
  const e = day.extra || {};
  const ev = day.event_kind ? ABS[day.event_kind] : null;
  const trip = day.event_kind === "business_trip";
  const hours = num(day.hours);
  const planned = day.planned;
  const planLabel = planned ? `${planned.time} · ${fmt(planned.hours)} val.`
    : !row.summed && num(day.scheduled_hours) > 0 ? `Pagal darbo kalendorių · ${fmt(day.scheduled_hours)} val.` : "Laisvadienis";

  const wasNone = Boolean(day.manual && hours === 0 && !ev);
  const initMode = day.actual ? "other" : day.manual && !wasNone ? "manual" : "plan";
  const [tab, setTab] = useState((ev && !trip) || wasNone ? "absence" : "work");
  const [mode, setMode] = useState(initMode);
  const src = day.actual || planned || {};
  const [tm, setTm] = useState({ start: src.start || "08:00", end: src.end || "17:00",
    brk: String(src.break ?? (planned ? planned.break ?? 0 : 60)), bs: src.break_start || "" });
  const bsOk = !tm.bs || /^([01]\d|2[0-3]):[0-5]\d$/.test(tm.bs);
  const initManual = { normal: fmt(day.hours), night: fmt(e.night), overtime: fmt(e.overtime), holiday: fmt(e.holiday), rest_day: fmt(e.rest_day) };
  const [mf, setMf] = useState(initManual);
  const [preview, setPreview] = useState(null);
  const [abs, setAbs] = useState({ kind: wasNone ? "none" : "", start: day.date, end: day.date });
  const [moreAbs, setMoreAbs] = useState(wasNone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const okTime = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v || "");

  useEffect(() => {
    if (mode !== "other" || !okTime(tm.start) || !okTime(tm.end) || !bsOk) { setPreview(null); return undefined; }
    const t = setTimeout(() => {
      payrollApi.setTimesheetHours({ action: "preview_actual", employee: row.employee, date: day.date,
        start: tm.start, end: tm.end, break_minutes: Number(tm.brk || 0), break_start: Number(tm.brk || 0) && tm.bs ? tm.bs : null })
        .then(setPreview).catch((err) => setPreview({ error: apiError(err) }));
    }, 250);
    return () => clearTimeout(t);
  }, [tm, mode, row.employee, day.date]);

  const run = async (fn) => {
    setBusy(true); setError("");
    try { await fn(); onChanged(); } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  };
  const saveWork = () => run(async () => {
    if (mode === "plan") {
      if (day.manual) await payrollApi.setTimesheetHours({ action: "reset_day", employee: row.employee, date: day.date });
    } else if (mode === "other") {
      await payrollApi.setTimesheetHours({ action: "set_actual", employee: row.employee, date: day.date,
        start: tm.start, end: tm.end, break_minutes: Number(tm.brk || 0), break_start: Number(tm.brk || 0) && tm.bs ? tm.bs : null });
    } else {
      for (const k of Object.keys(initManual)) {
        if (mf[k] === initManual[k]) continue;
        const v = num(toDot(mf[k]));
        if (k === "normal") await payrollApi.setTimesheetHours({ employee: row.employee, date: day.date, code: v > 0 ? "FD" : "P", hours: toDot(mf[k]) || 0, hour_type: "normal" });
        else if (v > 0) await payrollApi.setTimesheetHours({ employee: row.employee, date: day.date, code: "FD", hours: toDot(mf[k]), hour_type: k });
        else await payrollApi.clearTimesheetHours({ employee: row.employee, date: day.date, hour_type: k });
      }
    }
  });
  const RANGE = new Set([...QUICK_ABS, ...OTHER_ABS].filter(([, r]) => r).map(([k]) => k));
  const saveAbsence = () => run(() => (abs.kind === "none"
    ? payrollApi.setTimesheetHours({ employee: row.employee, date: day.date, code: "P", hours: 0, hour_type: "normal" })
    : payrollApi.createAbsence({ employee: row.employee, kind: abs.kind,
      start_date: abs.start, end_date: RANGE.has(abs.kind) ? abs.end : abs.start, status: "approved" })));

  const timeField = (label, key, optional = false, extra = {}) => (
    <TextField size="small" label={label} value={tm[key]} placeholder="HH:MM" error={optional ? !bsOk : !okTime(tm[key])} {...extra}
      inputProps={{ inputMode: "numeric", maxLength: 5, style: { fontWeight: 700, fontSize: 15 } }} InputLabelProps={{ shrink: true }}
      onChange={(ev2) => {
        let v = ev2.target.value.replace(/[^\d:]/g, "").slice(0, 5);
        if (/^\d{3,4}$/.test(v)) v = `${v.slice(0, v.length - 2).padStart(2, "0")}:${v.slice(-2)}`;
        setTm({ ...tm, [key]: v });
      }} sx={{ "& .MuiOutlinedInput-root": { bgcolor: "#FFFFFF", borderRadius: 1.5 } }} />
  );
  const pv = preview && !preview.error ? {
    total: num(preview.hours), night: num(preview.night) + num(preview.ot_night), holiday: num(preview.holiday),
    rest: num(preview.rest_day), ot: num(preview.overtime) + num(preview.ot_night),
  } : null;
  const pChip = (label, v, c) => v > 0 && (
    <Box key={label} component="span" sx={{ px: .9, py: .3, borderRadius: 1, bgcolor: `${c}14`, color: c, fontSize: 12, fontWeight: 650 }}>
      {label} {fmt(v)}
    </Box>
  );
  const sc = planned ? typeColor[planned.shift_type_id] || "#F2F4F7" : null;
  const m = MONTHS_GEN[Number(day.date.slice(5, 7)) - 1];
  const canSaveWork = !busy && (mode !== "other" || (pv && !preview?.error)) && !(mode === "plan" && !day.manual && initMode === "plan");

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" disableScrollLock PaperProps={{ sx: { borderRadius: 3, overflow: "hidden" } }}>
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="lt">
        {/* Antraštė: diena, darbuotojas, grafikas ir dabartinė būsena */}
        <Box sx={{ px: 2.5, pt: 2.25, pb: 1.75, bgcolor: "#F8FAFC", borderBottom: "1px solid #EAECF0" }}>
          <Stack direction="row" alignItems="center" gap={1.5}>
            <DayTile iso={day.date} weekday={info.weekday} holiday={info.holiday} holidayName={info.holiday_name} today="" />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: 17, fontWeight: 750, color: "#101828" }}>{row.employee_name}</Typography>
              <Typography sx={{ fontSize: 12.5, color: "#475467" }}>
                {m.charAt(0).toUpperCase() + m.slice(1)} {Number(day.date.slice(8))} d., {WD_FULL[info.weekday ?? 0]}
                {info.holiday_name ? ` · ${info.holiday_name}` : ""}
              </Typography>
            </Box>
            <IconButton onClick={onClose} aria-label="Uždaryti" sx={{ alignSelf: "flex-start", mt: -.5, mr: -1 }}><CloseIcon /></IconButton>
          </Stack>
          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1.5 }}>
            <Stack direction="row" alignItems="center" gap={.8} sx={{ px: 1.1, py: .6, borderRadius: 1.5, bgcolor: "#FFFFFF", border: "1px solid #EAECF0" }}>
              <Typography sx={{ fontSize: 11.5, color: "#667085" }}>Grafike</Typography>
              {planned && (
                <Box component="span" sx={{ minWidth: 24, height: 20, px: .6, borderRadius: .8, display: "inline-grid", placeItems: "center",
                  bgcolor: sc, color: shiftText(sc), fontSize: 10.5, fontWeight: 800 }}>{planned.code}</Box>
              )}
              <Typography sx={{ fontSize: 12.5, fontWeight: 650, color: "#344054" }}>{planLabel}</Typography>
            </Stack>
            <Stack direction="row" alignItems="center" gap={.8} sx={{ px: 1.1, py: .6, borderRadius: 1.5, bgcolor: "#FFFFFF", border: "1px solid #EAECF0" }}>
              <Typography sx={{ fontSize: 11.5, color: "#667085" }}>Dabar tabelyje</Typography>
              <Typography sx={{ fontSize: 12.5, fontWeight: 750, color: day.manual ? "#B54708" : "#1D3FA8" }}>
                {ev && !trip ? ev.l : hours ? `${fmt(hours)} val.` : "0 val."}{day.manual ? " · redaguota" : ""}
              </Typography>
            </Stack>
          </Stack>
        </Box>

        <Box sx={{ px: 2.5, pt: 2 }}>
          <ToggleButtonGroup exclusive fullWidth size="small" value={tab} onChange={(ev2, v) => v && setTab(v)}
            sx={{ mb: 2, "& .MuiToggleButton-root": { textTransform: "none", fontWeight: 650, fontSize: 13, py: .8, gap: .7, color: "#475467",
              "&.Mui-selected": { bgcolor: "#EEF4FF", color: "#1D3FA8", "&:hover": { bgcolor: "#E0EAFF" } } } }}>
            <ToggleButton value="work" disabled={Boolean(ev && !trip)}><ScheduleIcon sx={{ fontSize: 18 }} />Darbo laikas</ToggleButton>
            <ToggleButton value="absence"><EventBusyOutlinedIcon sx={{ fontSize: 18 }} />Nebuvimas</ToggleButton>
          </ToggleButtonGroup>

          {tab === "work" ? (
            <Stack gap={1}>
              <ChoiceCard active={mode === "plan"} onClick={() => setMode("plan")} color="#12B76A" icon={<CheckIcon sx={{ fontSize: 19 }} />}
                title={planned ? "Dirbo kaip grafike" : row.summed ? "Kaip grafike – laisvadienis" : "Pagal darbo kalendorių"}
                subtitle={planned ? planLabel : !row.summed ? planLabel : "Dirbtų valandų nėra"} />
              <ChoiceCard active={mode === "other"} onClick={() => setMode("other")} icon={<ScheduleIcon sx={{ fontSize: 19 }} />}
                title="Dirbo kitu laiku" subtitle="Nurodykite, nuo kada iki kada">
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, minmax(0, 1fr))" }, gap: 1, mt: .5 }}>
                  {timeField("Nuo", "start")}
                  {timeField("Iki", "end")}
                  <TextField size="small" label="Pertrauka, min." value={tm.brk} InputLabelProps={{ shrink: true }}
                    inputProps={{ inputMode: "numeric", style: { fontWeight: 700, fontSize: 15 } }}
                    onChange={(ev2) => setTm({ ...tm, brk: ev2.target.value.replace(/\D/g, "").slice(0, 4) })}
                    sx={{ "& .MuiOutlinedInput-root": { bgcolor: "#FFFFFF", borderRadius: 1.5 } }} />
                  {timeField("Pertrauka nuo", "bs", true, {
                    disabled: !Number(tm.brk || 0), placeholder: "nebūtina",
                    InputProps: { endAdornment: (
                      <Tooltip arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: "#101828", p: 1.1, maxWidth: 300 } } }} title={
                        <Box sx={{ fontSize: 12, lineHeight: 1.55 }}>
                          <b>Nebūtina.</b> Jei nenurodysite, laikoma, kad pertrauka buvo pagal grafiką (o jei grafike jos nėra – pamainos viduryje).
                          <Box sx={{ mt: .5 }}>Svarbu, kai pertrauka patenka į naktį (22–06 val.) ar šventinę dieną – nuo to priklauso naktinių ir šventinių valandų skaičius.</Box>
                        </Box>}>
                        <HelpOutlineIcon sx={{ fontSize: 17, color: "#98A2B3", cursor: "help" }} />
                      </Tooltip>
                    ) },
                  })}
                </Box>
                {pv && (
                  <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ mt: 1.25 }}>
                    <Box sx={{ px: 1.2, py: .45, borderRadius: 1.5, bgcolor: "#C7D7FE", color: "#1E3A8A", fontWeight: 800, fontSize: 14 }}>
                      {fmt(pv.total) || 0} val.
                    </Box>
                    {planned && Math.abs(pv.total - num(planned.hours)) >= .01 && (
                      <Box sx={{ px: .9, py: .3, borderRadius: 1, bgcolor: "#FEDF89", color: "#93370D", fontSize: 12, fontWeight: 700 }}>
                        {pv.total > num(planned.hours) ? "+" : "−"}{fmt(Math.abs(pv.total - num(planned.hours)))} val. nuo grafiko
                      </Box>
                    )}
                    {pChip("Naktinės", pv.night, "#6941C6")}
                    {pChip("Šventinių d.", pv.holiday, "#C11574")}
                    {pChip("Poilsio d.", pv.rest, "#0E7090")}
                    {pChip("Viršvalandžiai", pv.ot, "#C4320A")}
                  </Stack>
                )}
                {num(preview?.rest_day) > 0 && <Typography sx={{ mt: .75, fontSize: 12, color: "#0E7090" }}>Poilsio diena pagal grafiką – apmokama dvigubai.</Typography>}
                {preview?.error && <Alert severity="error" sx={{ mt: 1, py: 0 }}>{preview.error}</Alert>}
              </ChoiceCard>
              <ChoiceCard active={mode === "manual"} onClick={() => setMode("manual")} color="#7A5AF8" icon={<EditOutlinedIcon sx={{ fontSize: 18 }} />}
                title="Valandos rankiniu būdu" subtitle="Kai laikas nežinomas – įveskite valandas pagal rūšis">
                <Box sx={{ mt: 1, maxWidth: 200 }}>
                  <NumField label="Dirbta iš viso" value={mf.normal} onChange={(v) => setMf({ ...mf, normal: v })} />
                </Box>
                <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: "#667085", mt: 1.5, mb: 1 }}>Iš jų</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, minmax(0, 1fr))" }, gap: 1 }}>
                  <NumField label="Naktį" value={mf.night} onChange={(v) => setMf({ ...mf, night: v })} />
                  <NumField label="Šventinę d." value={mf.holiday} onChange={(v) => setMf({ ...mf, holiday: v })} />
                  <NumField label="Poilsio d." value={mf.rest_day} onChange={(v) => setMf({ ...mf, rest_day: v })} />
                  <NumField label="Viršvaland." value={mf.overtime} onChange={(v) => setMf({ ...mf, overtime: v })} />
                </Box>
              </ChoiceCard>
            </Stack>
          ) : ev ? (
            // Jau pažymėtas nebuvimas / komandiruotė
            <Stack direction="row" alignItems="center" gap={1.5} sx={{ p: 1.75, borderRadius: 2, bgcolor: ev.bg }}>
              <Box sx={{ width: 40, height: 40, borderRadius: "50%", bgcolor: ev.col, display: "grid", placeItems: "center", flexShrink: 0 }}>
                <ev.Icon sx={{ fontSize: 22, color: "#FFFFFF" }} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 750, color: ev.col }}>{ev.l}</Typography>
                <Typography sx={{ fontSize: 12, color: "#475467" }}>
                  {trip ? "Komandiruotė keičiama skiltyje „Komandiruotės“." : "Jei nebuvimas trunka kelias dienas – bus pašalintas visas."}
                </Typography>
              </Box>
              {trip ? (
                <Button variant="contained" disableElevation size="small" onClick={onOpenTrip}
                  sx={{ textTransform: "none", fontWeight: 650, borderRadius: 1.5 }}>Atidaryti</Button>
              ) : (
                <Button variant="outlined" color="error" size="small" disabled={busy || !day.event_id} startIcon={<DeleteOutlineIcon />}
                  onClick={() => run(() => payrollApi.deleteAbsence(day.event_id))}
                  sx={{ textTransform: "none", fontWeight: 650, borderRadius: 1.5, bgcolor: "#FFFFFF" }}>Pašalinti</Button>
              )}
            </Stack>
          ) : (
            <Stack gap={1.5}>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1 }}>
                {[...QUICK_ABS, ...(moreAbs ? OTHER_ABS.filter(([k]) => k !== "none" || row.summed || wasNone) : [])].map(([k]) => {
                  const a = k === "none" ? NONE_ABS : ABS[k];
                  const sel = abs.kind === k;
                  return (
                    <Box key={k} role="radio" aria-checked={sel} tabIndex={0} onClick={() => setAbs({ ...abs, kind: k })}
                      onKeyDown={(ev2) => { if (ev2.key === "Enter" || ev2.key === " ") { ev2.preventDefault(); setAbs({ ...abs, kind: k }); } }}
                      sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, borderRadius: 1.75, cursor: "pointer", minWidth: 0,
                        border: `1.5px solid ${sel ? a.col : "#E4E7EC"}`, bgcolor: sel ? a.bg : "#FFFFFF", outline: "none",
                        "&:hover": { borderColor: a.col }, "&:focus-visible": { boxShadow: `0 0 0 3px ${a.col}33` } }}>
                      <Box sx={{ width: 30, height: 30, borderRadius: 1.25, bgcolor: sel ? a.col : a.bg, display: "grid", placeItems: "center", flexShrink: 0 }}>
                        <a.Icon sx={{ fontSize: 18, color: sel ? "#FFFFFF" : a.col }} />
                      </Box>
                      <Typography sx={{ fontSize: 12, fontWeight: 650, color: "#344054", lineHeight: 1.25 }}>{a.l}</Typography>
                    </Box>
                  );
                })}
                {!moreAbs && (
                  <Box role="button" tabIndex={0} onClick={() => setMoreAbs(true)}
                    onKeyDown={(ev2) => { if (ev2.key === "Enter" || ev2.key === " ") { ev2.preventDefault(); setMoreAbs(true); } }}
                    sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, borderRadius: 1.75, cursor: "pointer", border: "1.5px dashed #D0D5DD",
                      color: "#475467", outline: "none", "&:hover": { borderColor: "#98A2B3", bgcolor: "#F9FAFB" } }}>
                    <Box sx={{ width: 30, height: 30, borderRadius: 1.25, bgcolor: "#F2F4F7", display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <ExpandMoreIcon sx={{ fontSize: 20 }} />
                    </Box>
                    <Typography sx={{ fontSize: 12, fontWeight: 650, lineHeight: 1.25 }}>Kiti ({OTHER_ABS.length - (row.summed ? 0 : 1)})</Typography>
                  </Box>
                )}
              </Box>
              {abs.kind === "none" ? (
                <Typography sx={{ fontSize: 12.5, color: "#475467" }}>
                  Grafike pamaina įrašyta per klaidą – darbuotojas šią dieną neturėjo dirbti. Bus įrašyta 0 val., be apmokėjimo ir pranešimų Sodrai.
                  Jei darbuotojas turėjo dirbti, bet neatvyko – žymėkite pravaikštą, ligą ar kitą priežastį.
                </Typography>
              ) : abs.kind && (RANGE.has(abs.kind) ? (
                <Stack direction="row" gap={1}>
                  <DatePicker label="Nuo" value={dayjs(abs.start)} format="YYYY-MM-DD"
                    onChange={(v) => v && v.isValid() && setAbs({ ...abs, start: v.format("YYYY-MM-DD"), end: abs.end < v.format("YYYY-MM-DD") ? v.format("YYYY-MM-DD") : abs.end })}
                    slotProps={{ textField: { size: "small", fullWidth: true }, popper: { disablePortal: false } }} />
                  <DatePicker label="Iki" value={dayjs(abs.end)} format="YYYY-MM-DD" minDate={dayjs(abs.start)}
                    onChange={(v) => v && v.isValid() && setAbs({ ...abs, end: v.format("YYYY-MM-DD") })}
                    slotProps={{ textField: { size: "small", fullWidth: true } }} />
                </Stack>
              ) : (
                <Typography sx={{ fontSize: 12.5, color: "#475467" }}>Bus pažymėta tik šiai dienai.</Typography>
              ))}
              {abs.kind === "truancy" && (
                <Typography sx={{ fontSize: 12, color: "#B42318" }}>Pravaikšta – bus paruoštas 12-SD pranešimas Sodrai.</Typography>
              )}
            </Stack>
          )}
          {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
        </Box>

        <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ px: 2.5, py: 2, mt: 1 }}>
          <Button onClick={onClose} sx={{ textTransform: "none", fontWeight: 650, color: "#475467" }}>Atšaukti</Button>
          {tab === "work" ? (
            <Button variant="contained" disableElevation disabled={!canSaveWork} onClick={saveWork}
              sx={{ textTransform: "none", fontWeight: 700, borderRadius: 1.75, px: 2.5 }}>
              {mode === "plan" && day.manual ? (row.summed ? "Grąžinti kaip grafike" : "Grąžinti pagal kalendorių") : "Išsaugoti"}
            </Button>
          ) : !ev && (
            <Button variant="contained" disableElevation disabled={busy || !abs.kind} onClick={saveAbsence}
              sx={{ textTransform: "none", fontWeight: 700, borderRadius: 1.75, px: 2.5 }}>{abs.kind === "none" ? "Išsaugoti" : "Pažymėti nebuvimą"}</Button>
          )}
        </Stack>
      </LocalizationProvider>
    </Dialog>
  );
}

// ---------- Sąrašo vaizdas: kairėje darbuotojai, dešinėje pasirinkto darbuotojo mėnuo dienomis ----------
const STATE = {
  bad: { dot: "#D92D20", bg: "#FEF3F2", fg: "#B42318", l: "DK pažeidimai" },
  warn: { dot: "#F79009", bg: "#FFFAEB", fg: "#B54708", l: "Įspėjimai" },
  changed: { dot: "#2E90FA", bg: "#EFF8FF", fg: "#175CD3", l: "Pakeista rankiniu būdu" },
  ok: { dot: "#12B76A", bg: "#ECFDF3", fg: "#027A48", l: "Atitinka grafiką" },
  wait: { dot: "#98A2B3", bg: "#F2F4F7", fg: "#475467", l: "Laukia grafiko" },
};
function rowState(r, issues) {
  if (r.needs_roster) return "wait";
  const own = issues.filter((i) => i.employee_id === r.employee);
  if (own.some((i) => i.level !== "warning")) return "bad";
  if (own.length) return "warn";
  if ((r.days || []).some((d) => d.manual)) return "changed";
  return "ok";
}
const stateLabel = (st, r) => (st === "ok" && !r.summed ? "Pagal darbo kalendorių" : STATE[st].l);
const initials = (name) => String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
const dash = <Box component="span" sx={{ color: "#D0D5DD" }}>–</Box>;
const SMALL = { textAlign: "right", fontSize: "11.5px !important", color: "#667085 !important" };   // „Iš jų“ stulpeliai
const MONTHS_NOM_LT = ["sausis", "vasaris", "kovas", "balandis", "gegužė", "birželis", "liepa", "rugpjūtis", "rugsėjis", "spalis", "lapkritis", "gruodis"];
const MONTHS_GEN = ["sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio", "liepos", "rugpjūčio", "rugsėjo", "spalio", "lapkričio", "gruodžio"];
const isoWeek = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));            // tos savaitės ketvirtadienis
  const jan4 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
};
const WD_FULL = ["pirmadienis", "antradienis", "trečiadienis", "ketvirtadienis", "penktadienis", "šeštadienis", "sekmadienis"];
// Dienos „kalendoriaus lapelis“: savaitės diena, skaičius ir (šventei / šiandienai) užrašas apačioje
function DayTile({ iso, weekday, holiday, holidayName, today, dim, issue }) {
  const isToday = iso === today;
  const c = isToday ? { bg: "#2E6BE6", fg: "#FFFFFF", w: "rgba(255,255,255,.85)" }
    : holiday ? { bg: "#F1EBFF", fg: "#5B21B6", w: "#7C3AED" }
      : weekday >= 5 ? { bg: "#FEEFEE", fg: "#B42318", w: "#D92D20" }
        : { bg: "#F2F4F7", fg: "#101828", w: "#667085" };
  const label = isToday ? "šiandien" : holiday ? "šventė" : "";
  const m = MONTHS_GEN[Number(iso.slice(5, 7)) - 1];
  const tip = (
    <Box sx={{ fontSize: 12, lineHeight: 1.5 }}>
      <Box sx={{ fontWeight: 700 }}>{m.charAt(0).toUpperCase() + m.slice(1)} {Number(iso.slice(8))} d., {WD_FULL[weekday ?? 0]}</Box>
      {holiday && <Box sx={{ color: "#D6BBFB" }}>{holidayName || "Šventinė diena"}</Box>}
      {isToday && <Box sx={{ color: "#B2CCFF" }}>Šiandien</Box>}
      {issue && <Box sx={{ color: issue === "warning" ? "#FEC84B" : "#FDA29B" }}>{issue === "warning" ? "Įspėjimas" : "DK pažeidimas"}</Box>}
    </Box>
  );
  return (
    <Tooltip title={tip} arrow placement="right" slotProps={{ tooltip: { sx: { bgcolor: "#101828", p: 1 } } }}>
      <Box sx={{ position: "relative", width: 42, height: 42, borderRadius: 1.5, bgcolor: c.bg, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", lineHeight: 1.05, opacity: dim && !isToday ? .7 : 1, cursor: "help" }}>
        <Box sx={{ fontSize: 9, fontWeight: 650, letterSpacing: ".05em", color: c.w }}>{WD[weekday ?? 0].toUpperCase()}</Box>
        <Box sx={{ fontSize: 15, fontWeight: 700, color: c.fg }}>{Number(iso.slice(8))}</Box>
        {label && <Box sx={{ fontSize: 7.5, fontWeight: 650, color: c.w, mt: .15 }}>{label}</Box>}
        {issue && (
          <Box sx={{ position: "absolute", top: -3, right: -3, width: 9, height: 9, borderRadius: "50%", border: "2px solid #FFFFFF",
            bgcolor: issue === "warning" ? "#F79009" : "#D92D20" }} />
        )}
      </Box>
    </Tooltip>
  );
}
// Nebuvimo ženkliukas - visur tas pats: rūšies spalvos kvadratėlis su balta ikona (kaip lentelės langelyje)
function AbsBadge({ a, size = 22, label }) {
  const I = a.Icon;
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: .75, minWidth: 0 }}>
      <Box component="span" sx={{ width: size, height: size, borderRadius: .9, bgcolor: a.col, display: "inline-grid", placeItems: "center", flexShrink: 0 }}>
        <I sx={{ fontSize: size * .66, color: "#FFFFFF" }} />
      </Box>
      {label && <Box component="span" sx={{ fontSize: 12.5, fontWeight: 650, color: a.col, whiteSpace: "nowrap" }}>{label}</Box>}
    </Box>
  );
}
// Spalvotas kampelis „Redaguota“ (darbuotojų sąraše ir dienos eilutėje)
function EditedCorner({ title = "Redaguota", side = "right" }) {
  return (
    <Tooltip title={title} arrow placement="top">
      <Box onClick={(e) => e.stopPropagation()} sx={{ position: "absolute", top: 0, [side]: 0, width: 0, height: 0, cursor: "help", zIndex: 1,
        borderTop: "12px solid #F79009", [side === "right" ? "borderLeft" : "borderRight"]: "12px solid transparent" }} />
    </Tooltip>
  );
}
// Valandų išskaidymas stulpeliams „Iš jų“: viršvalandžiai, šventinių ir poilsio dienų, naktinės - atskirai, likusios - įprastos
function splitHours(total, x = {}) {
  const ot = OT.reduce((a, k) => a + num(x[k]), 0);
  const holiday = num(x.holiday), rest = num(x.rest_day), night = num(x.night);
  return { normal: Math.max(num(total) - ot - holiday - rest - night, 0), night, holiday, rest, ot };
}

function ListView({ rows, days, today, locked, issues, issueDays, onCell, selected, onSelect, shiftTypes, year, month, onReload }) {
  // pamainų spalvos - tos pačios kaip grafike (aktyvios pagal eilę, neaktyvios - pirma paletės spalva)
  const typeColor = useMemo(() => {
    const m = {};
    (shiftTypes || []).filter((t) => t.active !== false).forEach((t, i) => { m[t.id] = shiftColor(t.color) || PALETTE[i % PALETTE.length]; });
    (shiftTypes || []).filter((t) => t.active === false).forEach((t) => { m[t.id] = shiftColor(t.color) || PALETTE[0]; });
    return m;
  }, [shiftTypes]);
  const states = useMemo(() => new Map(rows.map((x) => [x.employee, rowState(x, issues)])), [rows, issues]);
  const shown = rows;
  const idx = Math.max(0, rows.findIndex((x) => x.employee === selected));
  const r = rows[idx];
  const st = states.get(r.employee);
  const own = issues.filter((i) => i.employee_id === r.employee);
  const diff = num(r.worked_hours) - num(r.norm_hours);
  const ab = r.absence_days || {};
  const abTotal = Object.values(ab).reduce((a, v) => a + Number(v || 0), 0);
  // apskaitinis laikotarpis (suminė): kiek dirbta per visą laikotarpį, įskaitant šį mėnesį
  const per = r.summed && r.period?.period_from ? (() => {
    const p = r.period;
    const mon = (ym) => MONTHS_NOM_LT[Number(ym.slice(5)) - 1];
    const before = num(p.worked_before);
    const worked = before + num(r.worked_hours);
    const norm = num(p.period_norm);
    const cur = `${today.slice(0, 4)}-${today.slice(5, 7)}`;
    const thisYm = (r.days || [])[0]?.date?.slice(0, 7) || cur;
    return { before, worked, norm, left: norm - worked, last: p.period_to === thisYm,
      label: p.period_from === p.period_to ? mon(p.period_from) : `${mon(p.period_from)}–${mon(p.period_to)}` };
  })() : null;
  const plannedTotal = (r.days || []).reduce((a, d) => a + (d.planned ? num(d.planned.hours) : r.summed || d.code === "-" ? 0 : num(d.scheduled_hours)), 0);

  const metric = (label, value, color, tip, extra) => (
    <Tooltip title={tip || ""} disableHoverListener={!tip} arrow slotProps={{ tooltip: { sx: { bgcolor: "#101828", p: 1 } } }}>
      <Box sx={{ px: 1.3, py: .9, borderRadius: 1.75, bgcolor: "#F8FAFC", border: "1px solid #EEF1F6", cursor: tip ? "help" : "default", minWidth: 0 }}>
        <Typography sx={{ fontSize: 11, color: "#667085", lineHeight: 1.25, minHeight: 14 }}>{label}</Typography>
        <Typography noWrap sx={{ fontSize: 18, fontWeight: 700, lineHeight: 1.35, color: color || "#101828", fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
        {extra && <Box sx={{ mt: .4 }}>{extra}</Box>}
      </Box>
    </Tooltip>
  );
  const th = (label, align = "left", extra = {}) => (
    <Box component="th" {...extra} sx={{ textAlign: align, px: 1.25, py: .7, fontSize: 11, fontWeight: 600, color: "#667085",
      bgcolor: "#F8FAFC", borderBottom: "1px solid #E4E7EC", whiteSpace: "nowrap", verticalAlign: "bottom" }}>{label}</Box>
  );
  const tot = splitHours(r.worked_hours, r.totals || {});

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", md: "264px minmax(0,1fr)" }, gap: 1.5, alignItems: "start" }}>
      {/* Darbuotojų sąrašas */}
      <Box sx={{ border: "1px solid #E4E7EC", borderRadius: 2.5, bgcolor: "#FFFFFF", overflow: "hidden", position: { md: "sticky" }, top: { md: 12 } }}>
        <Box sx={{ p: 1.1, borderBottom: "1px solid #EAECF0" }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#475467", px: .4 }}>Darbuotojai ({rows.length})</Typography>
        </Box>
        <Box sx={{ maxHeight: { md: "min(72vh, 780px)" }, overflow: "auto" }}>
          {shown.map((e) => {
            const s = states.get(e.employee);
            const sel = e.employee === r.employee;
            const edited = (e.days || []).some((d) => d.manual);
            return (
              <Box key={e.employee} role="button" tabIndex={0} onClick={() => onSelect(e.employee)}
                onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onSelect(e.employee); } }}
                sx={{ position: "relative", display: "flex", alignItems: "center", gap: 1.1, px: 1.4, py: 1, cursor: "pointer", borderBottom: "1px solid #F2F4F7",
                  bgcolor: sel ? "#EEF4FF" : "transparent", boxShadow: sel ? "inset 3px 0 0 #3B6FE0" : "none",
                  "&:hover": { bgcolor: sel ? "#EEF4FF" : "#F9FAFB" }, outline: "none", "&:focus-visible": { boxShadow: "inset 0 0 0 2px #84ADFF" } }}>
                <Box sx={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
                  bgcolor: sel ? "#D1E0FF" : "#F2F4F7", color: sel ? "#2958BD" : "#475467", fontSize: 11, fontWeight: 650 }}>{initials(e.employee_name)}</Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 600, color: "#101828", lineHeight: 1.3 }}>{e.employee_name}</Typography>
                  <Typography noWrap sx={{ fontSize: 11, color: "#667085", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(e.worked_hours) || 0} / {fmt(e.norm_hours) || 0} val.
                  </Typography>
                </Box>
                <Tooltip title={stateLabel(s, e)} arrow placement="right">
                  <Box sx={{ width: 9, height: 9, borderRadius: "50%", flexShrink: 0, bgcolor: STATE[s].dot, boxShadow: `0 0 0 3px ${STATE[s].dot}1A` }} />
                </Tooltip>
                {edited && <EditedCorner title="Redaguota – yra rankinių pakeitimų" />}
              </Box>
            );
          })}
          {!shown.length && <Typography sx={{ p: 2, fontSize: 12.5, color: "#98A2B3" }}>Darbuotojų nerasta</Typography>}
        </Box>
      </Box>

      {/* Pasirinkto darbuotojo mėnuo */}
      <Box sx={{ border: "1px solid #E4E7EC", borderRadius: 2.5, bgcolor: "#FFFFFF", overflow: "hidden", minWidth: 0 }}>
        <Box sx={{ px: { xs: 1.5, md: 2 }, pt: 1.6, pb: 1.5, borderBottom: "1px solid #EAECF0" }}>
          <Stack direction="row" alignItems="center" gap={1.2} flexWrap="wrap">
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography noWrap sx={{ fontSize: 16, fontWeight: 650, color: "#101828" }}>{r.employee_name}</Typography>
              <Stack direction="row" alignItems="center" gap={.9} sx={{ mt: .35, minWidth: 0 }}>
                {r.position && <Typography noWrap sx={{ fontSize: 12.5, color: "#475467" }}>{r.position}</Typography>}
                <Box component="span" sx={{ px: 1, py: .25, borderRadius: 99, fontSize: 11.5, fontWeight: 650, whiteSpace: "nowrap",
                  bgcolor: r.summed ? "#E0F2FE" : "#DDF4F1", color: r.summed ? "#075985" : "#0B6B5F" }}>
                  {r.summed ? "Suminė darbo laiko apskaita" : "Standartinė darbo laiko apskaita"}
                </Box>
              </Stack>
            </Box>
            <Chip size="small" label={stateLabel(st, r)}
              sx={{ height: 26, borderRadius: 1.5, fontWeight: 600, fontSize: 12, bgcolor: STATE[st].bg, color: STATE[st].fg }} />
            <Stack direction="row" gap={.5}>
              <Tooltip title="Ankstesnis darbuotojas">
                <span><IconButton size="small" disabled={idx === 0} onClick={() => onSelect(rows[idx - 1].employee)}
                  sx={{ border: "1px solid #E4E7EC", borderRadius: 1.4, width: 30, height: 30 }}><ChevronLeftIcon fontSize="small" /></IconButton></span>
              </Tooltip>
              <Tooltip title="Kitas darbuotojas">
                <span><IconButton size="small" disabled={idx >= rows.length - 1} onClick={() => onSelect(rows[idx + 1].employee)}
                  sx={{ border: "1px solid #E4E7EC", borderRadius: 1.4, width: 30, height: 30 }}><ChevronRightIcon fontSize="small" /></IconButton></span>
              </Tooltip>
            </Stack>
          </Stack>

          <Box sx={{ mt: 1.4, display: "grid", gap: 1, gridTemplateColumns: { xs: "repeat(2, minmax(0,1fr))", sm: "1.5fr repeat(3, minmax(0,1fr))",
            lg: per ? "1.9fr 1.4fr repeat(7, minmax(0,1fr))" : "1.5fr repeat(7, minmax(0,1fr))" } }}>
            {per && (
              <Tooltip arrow slotProps={{ tooltip: { sx: { bgcolor: "#101828", p: 1.1 } } }} title={
                <Box sx={{ fontSize: 12, lineHeight: 1.7, minWidth: 230 }}>
                  <Box sx={{ fontWeight: 700, mb: .3 }}>Apskaitinis laikotarpis: {per.label}</Box>
                  {[["Laikotarpio norma", per.norm], ["Dirbta iki šio mėnesio", per.before], ["Dirbta šį mėnesį", num(r.worked_hours)],
                    ["Iš viso dirbta", per.worked]].map(([l, v]) => (
                    <Stack key={l} direction="row" justifyContent="space-between" gap={2}><span>{l}</span><b>{fmt(v) || 0} val.</b></Stack>
                  ))}
                  <Box sx={{ mt: .4, color: per.left >= 0 ? "#A6F4C5" : "#FEC84B", fontWeight: 600 }}>
                    {per.last
                      ? (per.left >= 0 ? `Laikotarpio pabaiga: trūksta ${fmt(per.left) || 0} val.` : `Laikotarpio pabaiga: +${fmt(-per.left)} val. – viršvalandžiai`)
                      : (per.left >= 0 ? `Iki laikotarpio pabaigos liko ${fmt(per.left) || 0} val.` : `Jau viršyta ${fmt(-per.left)} val. – išlyginkite kitais mėnesiais`)}
                  </Box>
                </Box>}>
                <Box sx={{ px: 1.3, py: .9, borderRadius: 1.75, bgcolor: "#F7F4FF", border: "1px solid #E4DBFF", cursor: "help", minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 11, color: "#5B34C8", fontWeight: 600 }}>Apskaitinis laikotarpis</Typography>
                  <Typography noWrap sx={{ fontSize: 18, fontWeight: 700, lineHeight: 1.35, color: "#101828", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(per.worked) || 0} <Box component="span" sx={{ fontSize: 13, fontWeight: 600, color: "#667085" }}>/ {fmt(per.norm) || 0} val.</Box>
                  </Typography>
                  <Box sx={{ mt: .5, height: 5, borderRadius: 99, bgcolor: "#E4DBFF", overflow: "hidden" }}>
                    <Box sx={{ height: "100%", width: `${Math.min(100, per.norm ? (per.worked / per.norm) * 100 : 0)}%`, borderRadius: 99,
                      bgcolor: per.left < 0 ? "#F79009" : "#7A5AF8" }} />
                  </Box>
                  <Typography sx={{ fontSize: 11, mt: .4, fontWeight: 600, lineHeight: 1.3, color: per.left < 0 ? "#B54708" : "#475467" }}>
                    <Box component="span" sx={{ color: "#5B34C8" }}>{per.label}</Box>{" · "}
                    {per.left >= 0 ? `liko ${fmt(per.left) || 0} val.` : `viršyta ${fmt(-per.left)} val.`}{per.last ? " · paskutinis mėn." : ""}
                  </Typography>
                </Box>
              </Tooltip>
            )}
            {/* Pagrindinė kortelė: kiek dirbta, po ja - grafikas ir norma */}
            <Box sx={{ px: 1.4, py: .9, borderRadius: 1.75, bgcolor: "#EEF4FF", border: "1px solid #D1E0FF", minWidth: 0, gridRow: { lg: "span 1" } }}>
              <Typography noWrap sx={{ fontSize: 11, color: "#3B5BDB", fontWeight: 600 }}>Dirbta</Typography>
              <Typography noWrap sx={{ fontSize: 20, fontWeight: 750, color: "#1D3FA8", lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>
                {fmt(r.worked_hours) || 0} val.
              </Typography>
              <Typography noWrap sx={{ fontSize: 11.5, color: "#475467", mt: .3, fontVariantNumeric: "tabular-nums" }}>
                Grafike <b style={{ color: "#344054" }}>{fmt(plannedTotal) || 0} val.</b>
              </Typography>
              <Tooltip title="Mėnesio norma, atėmus nebuvimų dienas" arrow>
                <Typography noWrap sx={{ fontSize: 11.5, color: "#475467", cursor: "help", width: "fit-content", fontVariantNumeric: "tabular-nums" }}>
                  Norma <b style={{ color: "#344054" }}>{fmt(r.norm_hours) || 0} val.</b>
                </Typography>
              </Tooltip>
            </Box>
            {metric("Nuo normos", Math.abs(diff) < .01 ? "0 val." : `${diff > 0 ? "+" : "−"}${fmt(Math.abs(diff))} val.`,
              Math.abs(diff) < .01 ? "#027A48" : diff > 0 ? "#B54708" : "#175CD3",
              r.summed ? "Suminėje apskaitoje mėnesio skirtumas išlyginamas per apskaitinį laikotarpį" : "")}
            {metric("Dienos", r.worked_days || 0)}
            {metric("Naktinės val.", fmt(tot.night) || "–")}
            {metric("Šventinių d. val.", fmt(tot.holiday) || "–")}
            {metric("Poilsio d. val.", fmt(tot.rest) || "–")}
            {metric("Viršvalandžiai", fmt(tot.ot) || "–", tot.ot ? "#B54708" : null)}
            {metric("Nebuvimai", abTotal ? `${abTotal} d.` : "–", null, abTotal ? (
              <Box sx={{ fontSize: 12, lineHeight: 1.7 }}>
                {Object.entries(ab).map(([k, v]) => {
                  const I = ABS[k]?.Icon || EventBusyOutlinedIcon;
                  return (
                    <Stack key={k} direction="row" alignItems="center" gap={.8}>
                      <I sx={{ fontSize: 15, color: "#FFFFFF" }} /><Box sx={{ flex: 1 }}>{ABS[k]?.l || k}</Box><b>{v} d.</b>
                    </Stack>
                  );
                })}
              </Box>
            ) : "", abTotal ? (
              <Stack direction="row" gap={.4}>
                {Object.keys(ab).map((k) => <AbsBadge key={k} a={ABS[k] || { Icon: EventBusyOutlinedIcon, col: "#52647B" }} size={20} />)}
              </Stack>
            ) : null)}
          </Box>

          {own.length > 0 && (
            <Stack gap={.75} sx={{ mt: 1.3 }}>
              {own.map((i, k) => {
                const warn = i.level === "warning";
                const c = warn ? { bg: "#FEF0DB", fg: "#7A2E0E", ic: "#F79009", l: "Įspėjimas" }
                  : { bg: "#FDE6E4", fg: "#7A1A12", ic: "#E0352B", l: i.level === "error" ? "Klaida" : "DK pažeidimas" };
                const Ic = warn ? WarningAmberRoundedIcon : ErrorOutlineRoundedIcon;
                return (
                  <Stack key={k} direction="row" gap={1.2} alignItems="center"
                    sx={{ px: 1.25, py: .8, borderRadius: 2, bgcolor: c.bg, boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
                    <Box sx={{ width: 28, height: 28, borderRadius: "50%", bgcolor: c.ic, display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <Ic sx={{ fontSize: 17, color: "#FFFFFF" }} />
                    </Box>
                    <Typography sx={{ fontSize: 12.5, color: c.fg, lineHeight: 1.5 }}>
                      <b>{c.l}:</b> {i.message}
                    </Typography>
                  </Stack>
                );
              })}
            </Stack>
          )}
          {tripExcess(r) && (
            <Box sx={{ mt: own.length ? .75 : 1.3 }}>
              <TripChoiceBanner row={r} year={year} month={month} onChanged={onReload} disabled={locked} />
            </Box>
          )}
          {r.needs_roster && (
            <Typography sx={{ mt: 1.2, fontSize: 12.5, color: "#B54708" }}>Darbo laikas bus užpildytas, kai paskelbsite šio mėnesio grafiką.</Typography>
          )}
        </Box>

        <Box sx={{ overflow: "auto", maxHeight: "min(70vh, 780px)", overscrollBehavior: "contain" }}>
          <Box component="table" sx={{ width: "100%", minWidth: 1080,
            "& thead tr:first-of-type th": { position: "sticky", top: 0, zIndex: 3 },
            "& thead tr:nth-of-type(2) th": { position: "sticky", top: 25, zIndex: 3 }, borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", fontVariantNumeric: "tabular-nums" }}>
            <colgroup>
              <col style={{ width: 70 }} /><col style={{ width: 160 }} /><col style={{ width: 300 }} />
              <col style={{ width: 82 }} />
              <col style={{ width: 72 }} /><col style={{ width: 72 }} /><col style={{ width: 86 }} /><col style={{ width: 76 }} /><col style={{ width: 98 }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                {th("Diena", "left", { rowSpan: 2 })}{th("Grafikas", "left", { rowSpan: 2 })}{th("Faktiškai", "left", { rowSpan: 2 })}
                <Box component="th" rowSpan={2} sx={{ textAlign: "center", px: 1, py: .7, fontSize: 11.5, fontWeight: 800, color: "#1E3A8A",
                  bgcolor: "#D9E4FF", borderBottom: "2px solid #6F93F5", whiteSpace: "nowrap", verticalAlign: "bottom" }}>Viso val.</Box>
                <Box component="th" colSpan={5} sx={{ textAlign: "center", height: 25, py: 0, fontSize: 10.5, fontWeight: 600, color: "#98A2B3",
                  bgcolor: "#F8FAFC", borderBottom: "1px solid #EAECF0", borderLeft: "1px solid #EAECF0", boxSizing: "border-box" }}>Iš jų</Box>
                <Box component="th" rowSpan={2} sx={{ bgcolor: "#F8FAFC", borderBottom: "1px solid #E4E7EC" }} />
              </tr>
              <tr>
                <Tooltip title="Be naktinių, šventinių ir poilsio dienų valandų bei viršvalandžių"><Box component="th" sx={{ textAlign: "right", px: 1.25, py: .7, fontSize: 11, fontWeight: 600, color: "#667085",
                  bgcolor: "#F8FAFC", borderBottom: "1px solid #E4E7EC", borderLeft: "1px solid #EAECF0", whiteSpace: "nowrap", cursor: "help" }}>Įprastos</Box></Tooltip>
                {th("Naktinės", "right")}{th("Šventinių d.", "right")}{th("Poilsio d.", "right")}{th("Viršvalandžiai", "right")}
              </tr>
            </thead>
            <tbody>
              {(r.days || []).map((d, i) => {
                const info = days[i] || {};
                const ev = d.event_kind && ABS[d.event_kind];
                const trip = d.event_kind === "business_trip";
                const notEmployed = d.code === "-";
                const hours = num(d.hours);
                const x = d.extra || {};
                const future = today && d.date > today;
                const clickable = !locked && !notEmployed && !r.needs_roster;
                const pd = d.manual && d.planned ? hours - num(d.planned.hours) : 0;
                const issue = issueDays.get(`${r.employee}|${d.date}`);
                const weekend = info.weekday >= 5;
                const bg = issue && issue !== "warning" ? "#FFF6F5" : Math.abs(pd) >= .01 ? "#FFFBF2" : weekend || info.holiday ? "#FCFCFD" : "#FFFFFF";
                // savaitės skirtukas: pirmadienį ir mėnesio pirmą dieną
                let sep = null;
                if (i === 0 || info.weekday === 0) {
                  let j = i;
                  while (j + 1 < r.days.length && (days[j + 1]?.weekday ?? 0) !== 0) j += 1;
                  const a = Number(d.date.slice(8)), b = Number(r.days[j].date.slice(8));
                  sep = (
                    <Box component="tr" key={`w-${d.date}`}>
                      <Box component="td" colSpan={10} sx={{ px: 1.5, py: .6, bgcolor: "#F8FAFC", borderBottom: "1px solid #EEF1F6",
                        borderTop: i ? "1px solid #E4E7EC" : 0, fontSize: 11.5, color: "#667085" }}>
                        <Box component="span" sx={{ fontWeight: 650, color: "#344054" }}>{isoWeek(d.date)} savaitė</Box>
                        {" · "}{MONTHS_GEN[Number(d.date.slice(5, 7)) - 1]} {a === b ? a : `${a}–${b}`}
                      </Box>
                    </Box>
                  );
                }
                const n = (v) => (num(v) ? fmt(v) : dash);
                const sp = splitHours(hours, x);
                const free = <Box component="span" sx={{ color: "#98A2B3" }}>Laisvadienis</Box>;
                let fact;
                if (notEmployed) fact = <Box component="span" sx={{ color: "#98A2B3" }}>Nedirbo įmonėje</Box>;
                else if (r.needs_roster) fact = <Box component="span" sx={{ color: "#98A2B3" }}>Laukia grafiko</Box>;
                else if (ev && !trip) {
                  fact = <AbsBadge a={ev} label={ev.l} />;
                } else {
                  fact = (
                    <Stack direction="row" alignItems="center" gap={.8} sx={{ minWidth: 0 }}>
                      {trip && (
                        <AbsBadge a={ABS.business_trip} label="Komandiruotė" />
                      )}
                      {hours > 0 ? (
                        d.actual ? <Box component="span" sx={{ fontWeight: 650, color: future ? "#98A2B3" : "#101828", fontSize: 13 }}>{d.actual.start}–{d.actual.end}</Box>
                          : d.manual ? <Box component="span" sx={{ fontWeight: 600, color: "#101828" }}>Įvesta rankiniu būdu</Box>
                            : !trip && (
                              <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: .7, color: "#344054", fontWeight: 500 }}>
                                <Box component="span" sx={{ width: 18, height: 18, borderRadius: "50%", bgcolor: "#12B76A", display: "inline-grid", placeItems: "center",
                                  boxShadow: "0 0 0 3px #D1FADF" }}>
                                  <CheckIcon sx={{ fontSize: 13, color: "#FFFFFF" }} />
                                </Box>
                                {d.planned ? "kaip grafike" : "pagal kalendorių"}
                              </Box>
                            )
                      ) : !trip && (
                        <Box component="span" sx={{ color: "#98A2B3" }}>{d.manual ? "Nedirbo" : "Laisvadienis"}</Box>
                      )}
                      {d.actual?.break > 0 && <Box component="span" sx={{ fontSize: 11.5, color: "#98A2B3" }}>pert. {d.actual.break} min.</Box>}
                      {Math.abs(pd) >= .01 && (
                        <Box component="span" sx={{ fontSize: 11.5, fontWeight: 600, color: "#B54708" }}>
                          {pd > 0 ? "+" : "−"}{fmt(Math.abs(pd))} val. nuo grafiko
                        </Box>
                      )}
                    </Stack>
                  );
                }
                return [sep, (
                  <Box component="tr" key={d.date} onClick={clickable ? (e) => onCell(e.currentTarget, r, d) : undefined}
                    sx={{ cursor: clickable ? "pointer" : "default",
                      "& td": { bgcolor: bg, borderBottom: "1px solid #F2F4F7", px: 1.25, py: .4, fontSize: 12.5, height: 50,
                        color: future ? "#98A2B3" : "#344054", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
                      "& td:first-of-type": { position: "relative" },
                      "& .edit": { opacity: 0, transition: "opacity .12s" },
                      ...(clickable ? { "&:hover td": { bgcolor: "#F5F8FF" }, "&:hover .edit": { opacity: 1 } } : {}) }}>
                    <Box component="td" sx={{ overflow: "visible !important" }}>
                      <DayTile iso={d.date} weekday={info.weekday} holiday={info.holiday} holidayName={info.holiday_name}
                        today={today} dim={future} issue={issue} />
                      {d.manual && (
                        <EditedCorner side="left" title={Math.abs(pd) >= .01
                          ? `Redaguota: ${pd > 0 ? "+" : "−"}${fmt(Math.abs(pd))} val. nuo grafiko` : "Redaguota"} />
                      )}
                    </Box>
                    <td>
                      {d.planned ? (
                        <Stack direction="row" alignItems="center" gap={.75}>
                          {(() => {
                            const c = typeColor[d.planned.shift_type_id] || "#F2F4F7";
                            return (
                              <Box component="span" sx={{ minWidth: 26, height: 22, px: .7, borderRadius: 1, display: "inline-grid", placeItems: "center",
                                bgcolor: c, color: shiftText(c), border: `1px solid ${shiftText(c)}1F`, fontSize: 11, fontWeight: 800 }}>{d.planned.code}</Box>
                            );
                          })()}
                          <Box component="span" sx={{ color: "#667085" }}>{d.planned.time}</Box>
                        </Stack>
                      ) : notEmployed ? dash
                        : !r.summed && num(d.scheduled_hours) > 0 ? <Box component="span" sx={{ color: "#667085" }}>{fmt(d.scheduled_hours)} val.</Box>
                          : free}
                    </td>
                    <td>{fact}</td>
                    <Box component="td" sx={{ textAlign: "center", px: ".5rem !important" }}>
                      {hours > 0 ? (
                        <Box component="span" sx={{ display: "inline-block", minWidth: 46, px: 1, py: .35, borderRadius: 1.5, fontSize: 15, fontWeight: 800,
                          bgcolor: Math.abs(pd) >= .01 ? "#FEDF89" : "#C7D7FE", color: Math.abs(pd) >= .01 ? "#93370D" : "#1E3A8A",
                          border: `1px solid ${Math.abs(pd) >= .01 ? "#FDB022" : "#98B4FA"}`, opacity: future ? .6 : 1 }}>{fmt(hours)}</Box>
                      ) : dash}
                    </Box>
                    <Box component="td" sx={{ ...SMALL, borderLeft: "1px solid #F2F4F7" }}>{n(sp.normal)}</Box>
                    <Box component="td" sx={SMALL}>{n(sp.night)}</Box>
                    <Box component="td" sx={SMALL}>{n(sp.holiday)}</Box>
                    <Box component="td" sx={SMALL}>{n(sp.rest)}</Box>
                    <Box component="td" sx={{ ...SMALL, color: sp.ot ? "#B54708 !important" : SMALL.color, fontWeight: sp.ot ? 650 : 400 }}>{n(sp.ot)}</Box>
                    <Box component="td" sx={{ textAlign: "left", px: "10px !important" }}>
                      {clickable && <EditOutlinedIcon className="edit" sx={{ fontSize: 16, color: "#667085", verticalAlign: "middle" }} />}
                    </Box>
                  </Box>
                )];
              })}
            </tbody>
            <tfoot>
              <Box component="tr" sx={{ "& td": { bgcolor: "#F8FAFC", borderTop: "1px solid #E4E7EC", px: 1.25, py: 1, fontSize: 12.5, fontWeight: 650, color: "#101828", whiteSpace: "nowrap" } }}>
                <td>Iš viso</td>
                <td>{plannedTotal ? `${fmt(plannedTotal)} val.` : dash}</td>
                <td>{r.worked_days || 0} d.</td>
                <Box component="td" sx={{ textAlign: "center", px: ".5rem !important" }}>
                  <Box component="span" sx={{ display: "inline-block", minWidth: 44, px: 1, py: .3, borderRadius: 1.5, fontSize: 15, fontWeight: 750,
                    bgcolor: "#1D3FA8", color: "#FFFFFF" }}>{fmt(r.worked_hours) || 0}</Box>
                </Box>
                <Box component="td" sx={{ textAlign: "right" }}>{fmt(tot.normal) || dash}</Box>
                <Box component="td" sx={{ textAlign: "right" }}>{fmt(tot.night) || dash}</Box>
                <Box component="td" sx={{ textAlign: "right" }}>{fmt(tot.holiday) || dash}</Box>
                <Box component="td" sx={{ textAlign: "right" }}>{fmt(tot.rest) || dash}</Box>
                <Box component="td" sx={{ textAlign: "right", color: tot.ot ? "#B54708 !important" : undefined }}>{fmt(tot.ot) || dash}</Box>
                <td />
              </Box>
            </tfoot>
          </Box>
        </Box>
        <Typography sx={{ px: 2, py: 1.1, fontSize: 11.5, color: "#98A2B3", borderTop: "1px solid #F2F4F7" }}>
          Spauskite dieną, kad pakeistumėte darbo laiką arba pažymėtumėte nebuvimą.
        </Typography>
      </Box>
    </Box>
  );
}

// ---------- Darbuotojų filtrai (abiem vaizdams): paieška, būsena, apskaitos tipas, pareigos ----------
const STATUS_FILTERS = [["all", "Visi"], ["ok", "Atitinka"], ["issues", "Su pažeidimais ar įspėjimais"], ["changed", "Redaguoti"]];
const REGIME_FILTERS = [["all", "Visos"], ["summed", "Suminė"], ["standard", "Standartinė"]];
const EMPTY_FILTER = { q: "", status: "all", regime: "all", positions: [] };
function applyFilter(rows, f, issues) {
  const needle = f.q.trim().toLocaleLowerCase("lt-LT");
  return rows.filter((r) => {
    if (needle && !`${r.employee_name || ""} ${r.position || ""}`.toLocaleLowerCase("lt-LT").includes(needle)) return false;
    if (f.regime === "summed" && !r.summed) return false;
    if (f.regime === "standard" && r.summed) return false;
    if (f.positions.length && !f.positions.includes(r.position || "")) return false;
    if (f.status !== "all") {
      const st = rowState(r, issues);
      if (f.status === "ok" && st !== "ok") return false;
      if (f.status === "issues" && st !== "bad" && st !== "warn") return false;
      if (f.status === "changed" && !(r.days || []).some((d) => d.manual)) return false;
    }
    return true;
  });
}
function EmployeeFilterBar({ value, onChange, positions, shown, total }) {
  const [anchor, setAnchor] = useState(null);
  const active = (value.status !== "all" ? 1 : 0) + (value.regime !== "all" ? 1 : 0) + value.positions.length;
  const head = (t) => <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: "#667085", mb: .3 }}>{t}</Typography>;
  const radios = (key, opts) => (
    <RadioGroup value={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.value })}>
      {opts.map(([v, l]) => (
        <FormControlLabel key={v} value={v} control={<Radio size="small" sx={{ py: .35 }} />} label={l}
          sx={{ m: 0, "& .MuiFormControlLabel-label": { fontSize: 13 } }} />
      ))}
    </RadioGroup>
  );
  const chip = (label, clear) => (
    <Chip key={label} size="small" label={label} onDelete={clear}
      sx={{ height: 24, borderRadius: 1.25, bgcolor: "#EEF4FF", color: "#1D3FA8", fontWeight: 600, fontSize: 11.5,
        "& .MuiChip-deleteIcon": { color: "#6F93F5", fontSize: 16 } }} />
  );
  return (
    <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ mb: 1.5 }}>
      <TextField size="small" placeholder="Ieškoti darbuotojo ar pareigų" value={value.q} onChange={(e) => onChange({ ...value, q: e.target.value })}
        InputProps={{ startAdornment: <SearchIcon sx={{ fontSize: 18, color: "#98A2B3", mr: .75 }} /> }}
        sx={{ width: { xs: "100%", sm: 280 }, "& .MuiOutlinedInput-root": { height: 34, fontSize: 13, borderRadius: 1.6, bgcolor: "#FFFFFF" } }} />
      <Tooltip title="Filtrai">
        <IconButton aria-label="Filtrai" onClick={(e) => setAnchor(e.currentTarget)}
          sx={{ width: 34, height: 34, borderRadius: 1.6, border: `1px solid ${active ? "#B2CCFF" : "#D0D5DD"}`,
            bgcolor: active ? "#EEF4FF" : "#FFFFFF", color: active ? "#1D3FA8" : "#475467", "&:hover": { bgcolor: active ? "#E0EAFF" : "#F9FAFB" } }}>
          <Badge badgeContent={active} color="primary" invisible={!active}
            sx={{ "& .MuiBadge-badge": { fontSize: 9.5, height: 15, minWidth: 15, px: .4, top: -3, right: -4 } }}>
            <FilterListIcon sx={{ fontSize: 19 }} />
          </Badge>
        </IconButton>
      </Tooltip>
      {value.status !== "all" && chip(STATUS_FILTERS.find(([v]) => v === value.status)[1], () => onChange({ ...value, status: "all" }))}
      {value.regime !== "all" && chip(`${REGIME_FILTERS.find(([v]) => v === value.regime)[1]} apskaita`, () => onChange({ ...value, regime: "all" }))}
      {value.positions.map((p) => chip(p, () => onChange({ ...value, positions: value.positions.filter((x) => x !== p) })))}
      {shown !== total && (
        <Typography sx={{ fontSize: 12.5, color: "#667085", ml: .5 }}>
          Rodoma <b style={{ color: "#344054" }}>{shown}</b> iš {total}
          <Box component="button" type="button" onClick={() => onChange(EMPTY_FILTER)}
            sx={{ ml: 1, border: 0, p: 0, bgcolor: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, color: "primary.main",
              "&:hover": { textDecoration: "underline" } }}>Išvalyti</Box>
        </Typography>
      )}
      <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)} disableScrollLock
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }} transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { mt: .75, borderRadius: 2, border: "1px solid #EAECF0", boxShadow: "0 12px 32px rgba(16,24,40,.12)" } } }}>
        <Box sx={{ p: 1.75, width: 280 }}>
          {head("Būsena")}
          {radios("status", STATUS_FILTERS)}
          <Divider sx={{ my: 1.25 }} />
          {head("Darbo laiko apskaita")}
          {radios("regime", REGIME_FILTERS)}
          <Divider sx={{ my: 1.25 }} />
          {head("Pareigos")}
          {!positions.length && <Typography sx={{ fontSize: 12, color: "#98A2B3" }}>Pareigos nenurodytos</Typography>}
          <Box sx={{ maxHeight: 200, overflow: "auto", mx: -.5 }}>
            {positions.map((p) => (
              <FormControlLabel key={p} label={p} sx={{ display: "flex", m: 0, "& .MuiFormControlLabel-label": { fontSize: 13 } }}
                control={<Checkbox size="small" sx={{ py: .35 }} checked={value.positions.includes(p)}
                  onChange={() => onChange({ ...value, positions: value.positions.includes(p) ? value.positions.filter((x) => x !== p) : [...value.positions, p] })} />} />
            ))}
          </Box>
          {active > 0 && (
            <Button fullWidth size="small" onClick={() => onChange({ ...EMPTY_FILTER, q: value.q })}
              sx={{ mt: 1.25, textTransform: "none", fontWeight: 600, color: "#475467", border: "1px solid #E4E7EC", borderRadius: 1.5 }}>
              Atstatyti filtrus
            </Button>
          )}
        </Box>
      </Popover>
    </Stack>
  );
}

// ---------- Lentelės vaizdas: visi darbuotojai × dienos (tie patys elementai kaip sąraše, tik horizontaliai) ----------
const MARK_COL = { N: "#6941C6", Š: "#C11574", P: "#0E7090", V: "#C4320A" };
const DAY_W = 40;
const SUM = { bgcolor: "#E9EEF7", borderRight: "1px solid #D5DCE8" };      // mėnesio sumų blokas - tamsesnis fonas
const NAME_W = 236;
const TOT = [
  ["viso", "Viso val.", 74], ["norma", "Norma", 66], ["diff", "Nuo normos", 76],
  ["night", "Naktinės val.", 78], ["holiday", "Šventinių d. val.", 86], ["rest", "Poilsio d. val.", 78], ["ot", "Viršvalandžiai", 96], ["abs", "Nebuvimai", 82],
];

function MiniDayHead({ d, today }) {
  const isToday = d.date === today;
  const c = isToday ? { bg: "#2E6BE6", fg: "#FFFFFF", w: "rgba(255,255,255,.85)" }
    : d.holiday ? { bg: "#F1EBFF", fg: "#5B21B6", w: "#7C3AED" }
      : d.weekday >= 5 ? { bg: "#FEEFEE", fg: "#B42318", w: "#D92D20" }
        : { bg: "#F2F4F7", fg: "#101828", w: "#667085" };
  const m = MONTHS_GEN[Number(d.date.slice(5, 7)) - 1];
  return (
    <Tooltip arrow slotProps={{ tooltip: { sx: { bgcolor: "#101828", p: 1 } } }} title={
      <Box sx={{ fontSize: 12, lineHeight: 1.5 }}>
        <Box sx={{ fontWeight: 700 }}>{m.charAt(0).toUpperCase() + m.slice(1)} {Number(d.date.slice(8))} d., {WD_FULL[d.weekday ?? 0]}</Box>
        {d.holiday && <Box sx={{ color: "#D6BBFB" }}>{d.holiday_name || "Šventinė diena"}</Box>}
        {isToday && <Box sx={{ color: "#B2CCFF" }}>Šiandien</Box>}
      </Box>}>
      <Box sx={{ width: 34, height: 40, mx: "auto", borderRadius: 1.25, bgcolor: c.bg, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", lineHeight: 1.05, cursor: "help" }}>
        <Box sx={{ fontSize: 8.5, fontWeight: 650, letterSpacing: ".04em", color: c.w }}>{WD[d.weekday ?? 0].toUpperCase()}</Box>
        <Box sx={{ fontSize: 13.5, fontWeight: 700, color: c.fg }}>{Number(d.date.slice(8))}</Box>
        {(isToday || d.holiday) && <Box sx={{ fontSize: 6.5, fontWeight: 650, color: c.w }}>{isToday ? "šiandien" : "šventė"}</Box>}
      </Box>
    </Tooltip>
  );
}

function TableLegend() {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem("faktas.legend") === "1"; } catch { return false; } });
  const toggle = () => setOpen((v) => { try { localStorage.setItem("faktas.legend", v ? "0" : "1"); } catch { /* nesvarbu */ } return !v; });
  const item = (el, label) => (
    <Stack direction="row" alignItems="center" gap={.8} sx={{ minWidth: 0 }}>
      {el}<Typography sx={{ fontSize: 11.75, color: "#475467" }}>{label}</Typography>
    </Stack>
  );
  const pill = (txt, bg, fg, bd) => (
    <Box sx={{ minWidth: 30, height: 22, px: .6, borderRadius: 1.25, display: "grid", placeItems: "center", bgcolor: bg, color: fg,
      border: `1px solid ${bd}`, fontSize: 12, fontWeight: 750 }}>{txt}</Box>
  );
  return (
    <Box sx={{ mt: 1.5, border: "1px solid #E4E7EC", borderRadius: 2.5, bgcolor: "#FFFFFF", overflow: "hidden" }}>
      <Box component="button" type="button" onClick={toggle} aria-expanded={open}
        sx={{ width: "100%", display: "flex", alignItems: "center", gap: 1, px: 2, py: 1.1, border: 0, bgcolor: "transparent", cursor: "pointer",
          fontFamily: "inherit", "&:hover": { bgcolor: "#FAFBFC" } }}>
        <Typography sx={{ fontSize: 13, fontWeight: 750, color: "#344054", flex: 1, textAlign: "left" }}>Žymėjimai</Typography>
        <ExpandMoreIcon sx={{ fontSize: 20, color: "#667085", transition: "transform .15s", transform: open ? "rotate(180deg)" : "none" }} />
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 2, pb: 1.75, pt: .25, display: "grid", gap: 1.5 }}>
          <Box>
            <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: "#667085", mb: .8 }}>Darbo laikas</Typography>
            <Stack direction="row" flexWrap="wrap" columnGap={2.5} rowGap={1}>
              {item(pill("11", "#C7D7FE", "#1E3A8A", "#98B4FA"), "Dirbta valandų")}
              {item(pill("13", "#FEDF89", "#93370D", "#FDB022"), "Skiriasi nuo grafiko")}
              {Object.entries({ N: "Naktinės", Š: "Šventinių d.", P: "Poilsio d.", V: "Viršvalandžiai" }).map(([k, l]) => (
                <Box key={k}>{item(<Box sx={{ fontSize: 11, fontWeight: 800, color: MARK_COL[k], width: 14, textAlign: "center" }}>{k}</Box>, l)}</Box>
              ))}
              {item(<Box sx={{ position: "relative", width: 22, height: 20, borderRadius: .6, border: "1px solid #EAECF0" }}>
                <Box sx={{ position: "absolute", top: 0, left: 0, borderTop: "8px solid #F79009", borderRight: "8px solid transparent" }} />
              </Box>, "Redaguota")}
              {item(<Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#D92D20", mx: .75 }} />, "DK pažeidimas")}
              {item(<Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#F79009", mx: .75 }} />, "Įspėjimas")}
            </Stack>
          </Box>
          <Box>
            <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: "#667085", mb: .8 }}>Nebuvimai ir komandiruotės</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0,1fr))", sm: "repeat(3, minmax(0,1fr))", lg: "repeat(5, minmax(0,1fr))" }, columnGap: 1.5, rowGap: 1 }}>
              {[...LEGEND, "study", "paternity", "donor", "civic", "suspension", "comp_rest"].filter((k, i, a) => ABS[k] && a.indexOf(k) === i).map((k) => {
                const a = ABS[k];
                return (
                  <Box key={k}>{item(
                    <AbsBadge a={a} size={24} />, a.l)}</Box>
                );
              })}
            </Box>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}

function TableView({ rows, days, today, locked, issues, issueDays, onCell, shiftTypes }) {
  const typeColor = useMemo(() => typeColorMap(shiftTypes), [shiftTypes]);
  const states = useMemo(() => new Map(rows.map((x) => [x.employee, rowState(x, issues)])), [rows, issues]);
  const base = { borderBottom: "1px solid #EDF0F5", borderRight: "1px solid #F2F4F7", p: 0, textAlign: "center", fontVariantNumeric: "tabular-nums" };
  const weekEdge = (d) => (d.weekday === 0 ? "2px solid #D5DCE6" : undefined);   // savaitės pradžia - ryškesnė linija
  const colBg = (d) => (d.date === today ? "#F5F8FF" : d.holiday ? "#FBF8FF" : d.weekday >= 5 ? "#FFFBFB" : "#FFFFFF");
  const dayTotals = days.map((d, i) => rows.reduce((a, r) => a + num(r.days[i]?.hours), 0));
  const totW = TOT.reduce((a, [, , w]) => a + w, 0);

  return (
    <>
      <Box sx={{ border: "1px solid #E4E7EC", borderRadius: 2.5, bgcolor: "#FFFFFF", overflow: "hidden" }}>
        <Box sx={{ overflow: "auto", width: "100%", maxHeight: "min(75vh, 820px)", overscrollBehavior: "contain" }}>
          <Box component="table" sx={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed",
            width: NAME_W + days.length * DAY_W + totW, minWidth: "100%" }}>
            <colgroup>
              <col style={{ width: NAME_W }} />
              {days.map((d) => <col key={d.date} style={{ width: DAY_W }} />)}
              {TOT.map(([k, , w]) => <col key={k} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr>
                <Box component="th" sx={{ ...base, position: "sticky", top: 0, left: 0, zIndex: 8, textAlign: "left", px: 1.75, height: 56,
                  bgcolor: "#F8FAFC", borderBottom: "1px solid #E4E7EC", boxShadow: "2px 0 4px rgba(16,24,40,.04)",
                  fontSize: 11, fontWeight: 600, color: "#667085" }}>Darbuotojas</Box>
                {days.map((d) => (
                  <Box component="th" key={d.date} sx={{ ...base, position: "sticky", top: 0, zIndex: 5, height: 56, bgcolor: "#F8FAFC",
                    borderBottom: "1px solid #E4E7EC", borderLeft: weekEdge(d) }}>
                    <MiniDayHead d={d} today={today} />
                  </Box>
                ))}
                {TOT.map(([k, l]) => (
                  <Box component="th" key={k} sx={{ ...base, position: "sticky", top: 0, zIndex: 5, height: 56, px: .75, fontSize: 11, lineHeight: 1.2,
                    fontWeight: k === "viso" ? 800 : 700,
                    bgcolor: k === "viso" ? "#1D4ED8" : "#334155", color: "#FFFFFF",
                    borderBottom: k === "viso" ? "2px solid #1D4ED8" : "2px solid #334155", borderRight: "1px solid #475569",
                    borderLeft: k === "viso" ? "3px solid #0F172A" : undefined }}>{l}</Box>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = states.get(r.employee);
                const edited = (r.days || []).some((d) => d.manual);
                const tot = splitHours(r.worked_hours, r.totals || {});
                const diff = num(r.worked_hours) - num(r.norm_hours);
                const ab = r.absence_days || {};
                const abTotal = Object.values(ab).reduce((a, v) => a + Number(v || 0), 0);
                const small = (v, c) => (num(v)
                  ? <Box component="span" sx={{ fontSize: 12.5, fontWeight: 650, color: c || "#344054" }}>{fmt(v)}</Box>
                  : <Box component="span" sx={{ color: "#D0D5DD" }}>–</Box>);
                return (
                  <Box component="tr" key={r.employee} sx={{ "&:hover > *": { boxShadow: "inset 0 9999px 0 rgba(46,107,230,.035)" } }}>
                    <Box component="th" scope="row" sx={{ ...base, position: "sticky", left: 0, zIndex: 3, textAlign: "left", px: 1.25, height: 52,
                      bgcolor: "#FFFFFF", boxShadow: "2px 0 4px rgba(16,24,40,.04)" }}>
                      <Stack direction="row" alignItems="center" gap={1} sx={{ position: "relative", minWidth: 0 }}>
                        <Box sx={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
                          bgcolor: "#F2F4F7", color: "#475467", fontSize: 10.5, fontWeight: 650 }}>{initials(r.employee_name)}</Box>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography noWrap title={r.employee_name} sx={{ fontSize: 12.5, fontWeight: 650, color: "#101828", lineHeight: 1.3 }}>{r.employee_name}</Typography>
                          <Typography noWrap sx={{ fontSize: 11, color: "#667085" }}>
                            {r.position || (r.summed ? "Suminė apskaita" : "Standartinė apskaita")}
                          </Typography>
                        </Box>
                        <Tooltip title={stateLabel(s, r)} arrow placement="right">
                          <Box sx={{ width: 9, height: 9, borderRadius: "50%", flexShrink: 0, bgcolor: STATE[s].dot, boxShadow: `0 0 0 3px ${STATE[s].dot}1A` }} />
                        </Tooltip>
                      </Stack>
                      {edited && <EditedCorner title="Redaguota – yra rankinių pakeitimų" />}
                    </Box>
                    {r.days.map((d, i) => {
                      const info = days[i] || {};
                      const future = today && d.date > today;
                      const ev = d.event_kind && ABS[d.event_kind];
                      const trip = d.event_kind === "business_trip";
                      const notEmployed = d.code === "-";
                      const hours = num(d.hours);
                      const clickable = !locked && !notEmployed && !r.needs_roster;
                      const pd = d.manual && d.planned ? hours - num(d.planned.hours) : 0;
                      const dev = Math.abs(pd) >= .01;
                      const issue = issueDays.get(`${r.employee}|${d.date}`);
                      const mk = marks(d).map((m) => m.t.split(" ")[0]);
                      const x = d.extra || {};
                      const parts = [["naktį", num(x.night) + num(x.ot_night)], ["šventinę dieną", num(x.holiday) + num(x.ot_holiday)],
                        ["poilsio dieną", num(x.rest_day) + num(x.ot_rest)], ["viršvalandžiai", OT.reduce((a, k) => a + num(x[k]), 0)]].filter(([, v]) => v);
                      const mg = MONTHS_GEN[Number(d.date.slice(5, 7)) - 1];
                      const sc = d.planned ? typeColor[d.planned.shift_type_id] || "#F2F4F7" : null;
                      const tRow = (l, v) => (
                        <Stack direction="row" justifyContent="space-between" gap={2}>
                          <Box sx={{ color: "#98A2B3" }}>{l}</Box><Box sx={{ fontWeight: 650, textAlign: "right" }}>{v}</Box>
                        </Stack>
                      );
                      const tip = (
                        <Box sx={{ fontSize: 12, lineHeight: 1.6, minWidth: 220 }}>
                          <Box sx={{ fontSize: 13, fontWeight: 750 }}>{r.employee_name}</Box>
                          <Box sx={{ color: "#D0D5DD", mb: .75 }}>
                            {mg.charAt(0).toUpperCase() + mg.slice(1)} {Number(d.date.slice(8))} d., {WD_FULL[info.weekday ?? 0]}
                            {info.holiday_name ? <Box component="span" sx={{ color: "#D6BBFB" }}> · {info.holiday_name}</Box> : null}
                          </Box>
                          {tRow("Grafike", d.planned ? (
                            <Stack direction="row" alignItems="center" gap={.6} component="span">
                              <Box component="span" sx={{ minWidth: 22, height: 18, px: .5, borderRadius: .7, display: "inline-grid", placeItems: "center",
                                bgcolor: sc, color: shiftText(sc), fontSize: 10, fontWeight: 800 }}>{d.planned.code}</Box>
                              <span>{d.planned.time} · {fmt(d.planned.hours)} val.</span>
                            </Stack>
                          ) : notEmployed ? "–" : "Laisvadienis")}
                          {ev && tRow(trip ? "Komandiruotė" : "Nebuvimas", (
                            <Stack direction="row" alignItems="center" gap={.5} component="span">
                              <Box component="span" sx={{ width: 18, height: 18, borderRadius: .7, display: "inline-grid", placeItems: "center", bgcolor: ev.col }}>
                                <ev.Icon sx={{ fontSize: 12, color: "#FFFFFF" }} />
                              </Box>
                              <span>{ev.l}</span>
                            </Stack>
                          ))}
                          {d.actual && tRow("Faktiškai", `${d.actual.start}–${d.actual.end}${d.actual.break ? ` (pert. ${d.actual.break} min.)` : ""}`)}
                          {hours > 0 && tRow("Dirbta", <Box component="span" sx={{ color: dev ? "#FEC84B" : "#B2CCFF" }}>{fmt(hours)} val.</Box>)}
                          {parts.map(([l, v]) => <Box key={l}>{tRow(`iš jų ${l}`, `${fmt(v)} val.`)}</Box>)}
                          {(d.manual || issue) && <Box sx={{ borderTop: "1px solid rgba(255,255,255,.15)", mt: .6, pt: .5 }} />}
                          {d.manual && <Box sx={{ color: "#FEC84B", fontWeight: 600 }}>Redaguota{dev ? `: ${pd > 0 ? "+" : "−"}${fmt(Math.abs(pd))} val. nuo grafiko` : ""}</Box>}
                          {issue && <Box sx={{ color: issue === "warning" ? "#FEC84B" : "#FDA29B", fontWeight: 600 }}>{issue === "warning" ? "Įspėjimas" : "DK pažeidimas"}</Box>}
                        </Box>
                      );
                      return (
                        <Tooltip key={d.date} title={tip} disableInteractive placement="top" arrow slotProps={{ tooltip: { sx: { bgcolor: "#101828", maxWidth: 340, p: 1.25, borderRadius: 2 } } }}>
                          <Box component="td" onClick={clickable ? (e) => onCell(e.currentTarget, r, d) : undefined}
                            sx={{ ...base, position: "relative", height: 52, borderLeft: weekEdge(info), cursor: clickable ? "pointer" : "default",
                              bgcolor: notEmployed ? "#F9FAFB" : ev && !trip ? ev.col : colBg(info), opacity: future ? .75 : 1,
                              boxShadow: ev && !trip ? "inset 0 0 0 1px rgba(255,255,255,.55)" : "none",
                              "&:hover": clickable ? { outline: "2px solid #6484E6", outlineOffset: -2, zIndex: 1 } : undefined }}>
                            {notEmployed ? <Box sx={{ color: "#D0D5DD" }}>–</Box>
                              : r.needs_roster ? <Box sx={{ color: "#D0D5DD" }}>·</Box>
                                : ev && !trip ? (
                                  <Stack alignItems="center" justifyContent="center" sx={{ color: "#FFFFFF", lineHeight: 1 }}>
                                    <ev.Icon sx={{ fontSize: 18 }} />
                                    {d.code && d.code !== "FD" && <Box sx={{ fontSize: 9, fontWeight: 800, mt: .25, letterSpacing: ".02em" }}>{d.code}</Box>}
                                  </Stack>
                                ) : hours > 0 ? (
                                  <Stack alignItems="center" gap={.2}>
                                    {trip && <FlightTakeoffIcon sx={{ fontSize: 12, color: "#1E3A6E", mb: -.2 }} />}
                                    <Box sx={{ width: 30, height: 21, borderRadius: 1.1, display: "grid", placeItems: "center",
                                      bgcolor: dev ? "#FEDF89" : "#C7D7FE", color: dev ? "#93370D" : "#1E3A8A",
                                      border: `1px solid ${dev ? "#FDB022" : "#98B4FA"}`, fontSize: hours >= 10 && hours % 1 ? 10 : 11.5, fontWeight: 800,
                                      letterSpacing: "-.02em" }}>
                                      {fmt(hours)}
                                    </Box>
                                    {mk.length > 0 && (
                                      <Stack direction="row" gap={.3} sx={{ lineHeight: 1 }}>
                                        {mk.map((t) => <Box key={t} sx={{ fontSize: 8.5, fontWeight: 800, color: MARK_COL[t] || "#475467" }}>{t}</Box>)}
                                      </Stack>
                                    )}
                                  </Stack>
                                ) : null}
                            {d.manual && (
                              <Box sx={{ position: "absolute", top: 0, right: 0, width: 0, height: 0,
                                borderTop: "9px solid #F79009", borderLeft: "9px solid transparent" }} />
                            )}
                            {issue && (
                              <Box sx={{ position: "absolute", bottom: 3, left: 3, width: 6, height: 6, borderRadius: "50%",
                                bgcolor: issue === "warning" ? "#F79009" : "#D92D20" }} />
                            )}
                          </Box>
                        </Tooltip>
                      );
                    })}
                    {/* Mėnesio sumos - tos pačios kaip sąrašo kortelėse */}
                    <Box component="td" sx={{ ...base, borderLeft: "3px solid #0F172A", bgcolor: "#DCE6FF" }}>
                      <Box sx={{ display: "inline-block", minWidth: 44, px: .75, py: .3, borderRadius: 1.5, fontSize: 14, fontWeight: 800,
                        bgcolor: "#C7D7FE", color: "#1E3A8A", border: "1px solid #98B4FA" }}>{fmt(r.worked_hours) || 0}</Box>
                    </Box>
                    <Box component="td" sx={{ ...base, ...SUM }}>{small(r.norm_hours, "#475467")}</Box>
                    <Box component="td" sx={{ ...base, ...SUM }}>
                      <Box component="span" sx={{ fontSize: 12.5, fontWeight: 750, color: Math.abs(diff) < .01 ? "#027A48" : diff > 0 ? "#B54708" : "#175CD3" }}>
                        {Math.abs(diff) < .01 ? "0" : `${diff > 0 ? "+" : "−"}${fmt(Math.abs(diff))}`}
                      </Box>
                    </Box>
                    <Box component="td" sx={{ ...base, ...SUM }}>{small(tot.night, "#6941C6")}</Box>
                    <Box component="td" sx={{ ...base, ...SUM }}>{small(tot.holiday, "#C11574")}</Box>
                    <Box component="td" sx={{ ...base, ...SUM }}>{small(tot.rest, "#0E7090")}</Box>
                    <Box component="td" sx={{ ...base, ...SUM }}>{small(tot.ot, "#C4320A")}</Box>
                    <Tooltip arrow slotProps={{ tooltip: { sx: { bgcolor: "#101828", p: 1.1 } } }} title={abTotal ? (
                      <Box sx={{ fontSize: 12, lineHeight: 1.6, minWidth: 190 }}>
                        {Object.entries(ab).map(([k, v]) => {
                          const I = ABS[k]?.Icon || EventBusyOutlinedIcon;
                          return (
                            <Stack key={k} direction="row" alignItems="center" gap={.9} sx={{ py: .2 }}>
                              <Box sx={{ width: 20, height: 20, borderRadius: .75, display: "grid", placeItems: "center", bgcolor: ABS[k]?.col || "#52647B", flexShrink: 0 }}>
                                <I sx={{ fontSize: 13, color: "#FFFFFF" }} />
                              </Box>
                              <Box sx={{ flex: 1 }}>{ABS[k]?.l || k}</Box><b>{v} d.</b>
                            </Stack>
                          );
                        })}
                      </Box>
                    ) : ""}>
                      <Box component="td" sx={{ ...base, ...SUM, cursor: abTotal ? "help" : "default" }}>
                        {abTotal ? <Box component="span" sx={{ fontSize: 12.5, fontWeight: 700, color: "#1F2937" }}>{abTotal} d.</Box>
                          : <Box component="span" sx={{ color: "#B9C0CC" }}>–</Box>}
                      </Box>
                    </Tooltip>
                  </Box>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <Box component="td" sx={{ ...base, position: "sticky", left: 0, bottom: 0, zIndex: 6, textAlign: "left", px: 1.75, height: 40,
                  bgcolor: "#F8FAFC", borderTop: "1px solid #E4E7EC", fontSize: 12, fontWeight: 700, color: "#344054" }}>Iš viso valandų per dieną</Box>
                {days.map((d, i) => (
                  <Box component="td" key={d.date} sx={{ ...base, position: "sticky", bottom: 0, zIndex: 4, bgcolor: "#F8FAFC", borderTop: "1px solid #E4E7EC",
                    borderLeft: weekEdge(d), fontSize: 11, fontWeight: 650, color: dayTotals[i] ? "#344054" : "#D0D5DD" }}>
                    {dayTotals[i] ? fmt(dayTotals[i]) : "–"}
                  </Box>
                ))}
                <Box component="td" sx={{ ...base, position: "sticky", bottom: 0, zIndex: 4, bgcolor: "#CFDCFF", borderTop: "1px solid #B7C8F0",
                  borderLeft: "3px solid #0F172A" }}>
                  <Box sx={{ display: "inline-block", minWidth: 44, px: .75, py: .3, borderRadius: 1.5, fontSize: 13, fontWeight: 800,
                    bgcolor: "#1D3FA8", color: "#FFFFFF" }}>{fmt(rows.reduce((a, r) => a + num(r.worked_hours), 0)) || 0}</Box>
                </Box>
                {TOT.slice(1).map(([k]) => {
                  const v = rows.reduce((a, r) => {
                    const t = splitHours(r.worked_hours, r.totals || {});
                    return a + ({ norma: num(r.norm_hours), diff: num(r.worked_hours) - num(r.norm_hours), night: t.night, holiday: t.holiday,
                      rest: t.rest, ot: t.ot, abs: Object.values(r.absence_days || {}).reduce((s2, x2) => s2 + Number(x2 || 0), 0) }[k] || 0);
                  }, 0);
                  return (
                    <Box component="td" key={k} sx={{ ...base, position: "sticky", bottom: 0, zIndex: 4, bgcolor: "#DDE3EE", borderTop: "1px solid #C9D2E3",
                      borderRight: "1px solid #D5DCE8",
                      fontSize: 12, fontWeight: 700, color: k === "ot" && v ? "#B54708" : "#344054" }}>
                      {Math.abs(v) < .01 ? <Box component="span" sx={{ color: "#D0D5DD" }}>–</Box>
                        : k === "diff" ? `${v > 0 ? "+" : "−"}${fmt(Math.abs(v))}` : k === "abs" ? `${v} d.` : fmt(v)}
                    </Box>
                  );
                })}
              </tr>
            </tfoot>
          </Box>
        </Box>
      </Box>
      <TableLegend />
    </>
  );
}

export default function TabelisView({ year, month, onShift }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [dlg, setDlg] = useState(null);             // {row, day} - dienos keitimo langas
  const [view, setView] = useState("list");         // "list" | "table" - atidarius visada sąrašas
  const [selected, setSelected] = useState(null);   // pasirinkto darbuotojo id (sąraše)
  const [flt, setFlt] = useState(EMPTY_FILTER);       // darbuotojų filtrai (bendri abiem vaizdams)
  const openCell = (anchor, row, day) => setDlg({ row, day });
  const [busy, setBusy] = useState(false);
  const [moreMenu, setMoreMenu] = useState(null);   // „⋯“ meniu
  const [s15Open, setS15Open] = useState(false);    // S15 importas

  const load = useCallback(() => {
    payrollApi.timesheetFull(year, month).then((d) => { setData(d); setError(""); }).catch((e) => setError(apiError(e)));
  }, [year, month]);
  useEffect(() => { setData(null); load(); }, [load]);

  const meta = data?.meta || {};
  const rows = data?.rows || [];
  const days = meta.days || [];
  const locked = meta.status === "approved" || meta.status === "locked" || meta.payroll_closed;
  const anySummed = rows.some((r) => r.summed);
  const needRoster = rows.filter((r) => r.needs_roster);
  const changes = meta.changes || [];                 // pakeista po patvirtinimo (nauja liga, prašymas, grafikas)
  const today = meta.today || "";

  const [approveDlg, setApproveDlg] = useState(null);   // {issues, need_note, note}
  const [issuesOpen, setIssuesOpen] = useState(false);
  const setStatus = async (approve, note = "") => {
    if (approve && !note && !window.confirm(meta.status === "approved"
      ? "Patvirtinti pakeitimus? Atlyginimai bus perskaičiuoti pagal naują tabelį."
      : "Patvirtinti tabelį? Po patvirtinimo jo keisti nebus galima, kol neatšauksite. Atlyginimai bus apskaičiuoti pagal jį.")) return;
    setBusy(true);
    try {
      await payrollApi.setTimesheetHours({ action: approve ? "approve" : "reopen", year, month, note });
      setApproveDlg(null); load();
    } catch (e) {
      const d = e?.response?.data;
      if (e?.response?.status === 409 && d?.issues) setApproveDlg({ issues: d.issues, need_note: d.need_note, note: "" });
      else setError(apiError(e));
    } finally { setBusy(false); }
  };
  const issues = meta.issues || [];
  const positionsList = useMemo(() => [...new Set(rows.map((r) => r.position).filter(Boolean))].sort((a, b) => a.localeCompare(b, "lt")), [rows]);
  const shownRows = useMemo(() => applyFilter(rows, flt, issues), [rows, flt, issues]);
  const filterBar = <EmployeeFilterBar value={flt} onChange={setFlt} positions={positionsList} shown={shownRows.length} total={rows.length} />;
  const issueDays = useMemo(() => {
    const m = new Map();
    issues.forEach((i) => (i.dates || []).forEach((d) => {
      const k = `${i.employee_id}|${d}`;
      if (!m.has(k) || i.level === "error" || (i.level === "violation" && m.get(k) === "warning")) m.set(k, i.level);
    }));
    return m;
  }, [issues]);
  const nViol = issues.filter((i) => i.level !== "warning").length;
  const nWarn = issues.filter((i) => i.level === "warning").length;

  const statusChip = useMemo(() => {
    if (meta.payroll_closed) return <Chip size="small" icon={<LockOutlinedIcon />} label="DU patvirtintas" sx={{ fontWeight: 700, bgcolor: "#F2F4F7", borderRadius: 1.6, height: 29 }} />;
    if (meta.status === "approved") return <Chip size="small" icon={<CheckCircleOutlineIcon />} label="Patvirtintas" sx={{ fontWeight: 700, bgcolor: "#ECFDF3", color: "#027A48", borderRadius: 1.6, height: 29, "& .MuiChip-icon": { color: "inherit" } }} />;
    return <Chip size="small" label="Nepatvirtintas" sx={{ fontWeight: 700, bgcolor: "#F2F4F7", color: "#475467", borderRadius: 1.6, height: 29 }} />;
  }, [meta.payroll_closed, meta.status]);

  return (
    <Box>
      <Menu open={Boolean(moreMenu)} anchorEl={moreMenu} onClose={() => setMoreMenu(null)} disableScrollLock
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{ sx: { mt: .5, borderRadius: 2, minWidth: 290 } }}>
        <Tooltip placement="left" title={locked ? "Tabelis patvirtintas – pirmiausia atšaukite patvirtinimą" : ""}>
          <span>
            <MenuItem disabled={locked} onClick={() => { setMoreMenu(null); setS15Open(true); }} sx={{ py: 1.1, alignItems: "flex-start" }}>
              <ListItemIcon sx={{ mt: .25 }}><UploadFileOutlinedIcon fontSize="small" /></ListItemIcon>
              <Box>
                <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>Įkelti ligos pažymėjimus (S15)</Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Nedarbingumai iš Sodros bus įrašyti į tabelį ir grafiką</Typography>
              </Box>
            </MenuItem>
          </span>
        </Tooltip>
      </Menu>
      <SodraReportsDialog s15Only open={s15Open} onClose={() => setS15Open(false)} onDone={load} />
      <Box sx={{ mb: 2.1 }}>
        <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", lg: "center" }} gap={1.4}>
          <Stack direction="row" alignItems="center" gap={1.1}>
            <Box sx={{ display: "flex", alignItems: "center", gap: .35, px: .6, py: .45, border: "1px solid #E4E7EC", borderRadius: 2, bgcolor: "#FFFFFF" }}>
              <IconButton size="small" aria-label="Ankstesnis mėnuo" onClick={() => onShift(-1)} sx={{ borderRadius: 1.35, width: 31, height: 31 }}><ChevronLeftIcon fontSize="small" /></IconButton>
              <Box sx={{ minWidth: { xs: 135, sm: 162 }, textAlign: "center" }}>
                <Typography sx={{ fontSize: 10, color: "#98A2B3", lineHeight: 1.15, fontWeight: 700 }}>LAIKOTARPIS</Typography>
                <Typography sx={{ fontSize: 15, fontWeight: 800, color: "#101828", textTransform: "capitalize", lineHeight: 1.5 }}>
                  {MONTHS[month - 1]} {year}
                </Typography>
              </Box>
              <IconButton size="small" aria-label="Kitas mėnuo" onClick={() => onShift(1)} sx={{ borderRadius: 1.35, width: 31, height: 31 }}><ChevronRightIcon fontSize="small" /></IconButton>
            </Box>
            {data && statusChip}
            {data && meta.roster_stale && (
              <Tooltip arrow title="Po grafiko sudarymo pasikeitė nebuvimai – grafikas (ir „kaip grafike“ dienos) gali būti netikslus. Atidaryti grafiką ir pataisyti.">
                <Chip size="small" icon={<WarningAmberRoundedIcon />} label="Grafikas nebeatitinka"
                  onClick={() => navigate(`/grafikai-ir-tabeliai?m=${year}-${String(month).padStart(2, "0")}`)}
                  sx={{ fontWeight: 700, height: 29, borderRadius: 1.6, bgcolor: "#FFFAEB", color: "#B54708", border: "1px solid #FEC84B",
                    cursor: "pointer", "& .MuiChip-icon": { color: "#F79009" } }} />
              </Tooltip>
            )}
          </Stack>

          <Stack direction="row" alignItems="center" flexWrap="wrap" gap={1}>
            {data && issues.length > 0 && (
              <Chip size="small" icon={<GavelOutlinedIcon />} onClick={() => setIssuesOpen(!issuesOpen)}
                label={[nViol ? `${nViol} pažeidimai` : "", nWarn ? `${nWarn} įspėjimai` : ""].filter(Boolean).join(" · ")}
                sx={{ fontWeight: 750, height: 32, borderRadius: 1.6, bgcolor: nViol ? "#FEF3F2" : "#FFFAEB", color: nViol ? "#B42318" : "#B54708", cursor: "pointer", "& .MuiChip-icon": { color: "inherit" } }} />
            )}
            {data && changes.length > 0 && (
              <Tooltip arrow title={<Box sx={{ fontSize: 12.5 }}>
                Po patvirtinimo pasikeitė (pvz. įkelta liga, patvirtintas prašymas, pakeistas grafikas). Atlyginimai skaičiuojami pagal
                anksčiau patvirtintą tabelį, kol nepatvirtinsite pakeitimų:
                {changes.slice(0, 6).map((c) => <div key={c.employee}>• {c.name}{c.dates?.length ? ` (${c.dates.length} d.)` : ""}</div>)}
              </Box>}>
                <Chip size="small" icon={<WarningAmberRoundedIcon />} label={`Pakeista po patvirtinimo: ${changes.length}`}
                  sx={{ fontWeight: 700, height: 32, borderRadius: 1.6, bgcolor: "#FFFAEB", color: "#B54708", border: "1px solid #FEC84B", "& .MuiChip-icon": { color: "#F79009" } }} />
              </Tooltip>
            )}
            {data && meta.status === "approved" && meta.approval_note && (
              <Tooltip title={`Patvirtinta su pažeidimais: ${meta.approval_note}`}><Chip size="small" variant="outlined" color="warning" label="Su paaiškinimu" /></Tooltip>
            )}
            {data && (
              <IconButton size="small" aria-label="Daugiau veiksmų" onClick={(e) => setMoreMenu(e.currentTarget)}
                sx={{ width: 36, height: 36, borderRadius: 1.8, border: "1px solid #D0D5DD", bgcolor: "#FFFFFF" }}>
                <MoreHorizIcon fontSize="small" />
              </IconButton>
            )}
            {data && !meta.payroll_closed && meta.status === "approved" && changes.length > 0 && (
              <Button size="small" variant="contained" startIcon={<CheckCircleOutlineIcon />} disableElevation disabled={busy}
                onClick={() => setStatus(true)} sx={{ textTransform: "none", fontWeight: 750, borderRadius: 1.8, minHeight: 36, px: 2.1 }}>Patvirtinti pakeitimus</Button>
            )}
            {data && !meta.payroll_closed && (
              meta.status === "approved"
                ? <Button size="small" variant="outlined" disabled={busy} onClick={() => setStatus(false)}
                    sx={{ textTransform: "none", fontWeight: 700, borderRadius: 1.8, minHeight: 36 }}>Atšaukti patvirtinimą</Button>
                : (
                  <Tooltip arrow title={meta.too_early ? `Mėnuo dar nesibaigė – tabelį patvirtinti bus galima nuo ${meta.approve_from}. Iki tol darbo laikas dar gali keistis.`
                    : needRoster.length ? `Pirmiausia paskelbkite darbo grafiką (suminė apskaita): ${needRoster.slice(0, 3).map((r) => r.employee_name).join(", ")}${needRoster.length > 3 ? "…" : ""}` : ""}>
                    <span>
                      <Button size="small" variant="contained" startIcon={<CheckCircleOutlineIcon />} disableElevation disabled={busy || !rows.length || needRoster.length > 0 || !!meta.too_early}
                        onClick={() => setStatus(true)} sx={{ textTransform: "none", fontWeight: 750, borderRadius: 1.8, minHeight: 36, px: 2.1 }}>Patvirtinti tabelį</Button>
                    </span>
                  </Tooltip>
                )
            )}
          </Stack>
        </Stack>
        {data && (
          <Stack direction="row" alignItems="center" flexWrap="wrap" gap={1.5} sx={{ mt: 1.35, color: "#667085" }}>
            <Typography sx={{ fontSize: 12.5 }}><b style={{ color: "#344054" }}>{rows.length}</b> darbuotojų</Typography>
            <Box sx={{ height: 13, borderLeft: "1px solid #D0D5DD" }} />
            <Typography sx={{ fontSize: 12.5 }}><b style={{ color: "#344054" }}>{rows.reduce((sum, row) => sum + num(row.worked_hours), 0).toLocaleString("lt-LT", { maximumFractionDigits: 1 })}</b> dirbtų val.</Typography>
            {anySummed && (
              <>
                <Box sx={{ height: 13, borderLeft: "1px solid #D0D5DD" }} />
                <Typography sx={{ fontSize: 12.5, color: "#667085" }}>
                  {meta.roster_version ? `Pagal paskelbtą grafiką v${meta.roster_version}` : "Grafikas nepaskelbtas"}
                </Typography>
                {meta.roster_editing && (
                  <Tooltip arrow title="Grafikas šiuo metu keičiamas – tabelyje lieka paskelbta versija, kol pakeitimai nebus paskelbti.">
                    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: .5, px: .9, py: .2, borderRadius: 99, cursor: "help",
                      bgcolor: "#FEF0C7", color: "#93370D", fontSize: 11.5, fontWeight: 700 }}>
                      <Box component="span" sx={{ width: 15, height: 15, borderRadius: "50%", bgcolor: "#F79009", color: "#FFFFFF",
                        display: "inline-grid", placeItems: "center", fontSize: 10.5, fontWeight: 800 }}>!</Box>
                      Keičiamas
                    </Box>
                  </Tooltip>
                )}
              </>
            )}
            <Box sx={{ flexGrow: 1 }} />
            <ToggleButtonGroup size="small" exclusive value={view} onChange={(e, v) => v && setView(v)}
              sx={{ "& .MuiToggleButton-root": { textTransform: "none", fontWeight: 600, fontSize: 12.5, height: 32, px: 1.4, gap: .6,
                color: "#475467", borderColor: "#E4E7EC", "&.Mui-selected": { bgcolor: "#EEF4FF", color: "#2958BD", "&:hover": { bgcolor: "#E0EAFF" } } } }}>
              <ToggleButton value="list"><ViewListOutlinedIcon sx={{ fontSize: 17 }} />Sąrašas</ToggleButton>
              <ToggleButton value="table"><TableChartOutlinedIcon sx={{ fontSize: 17 }} />Lentelė</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError("")}>{error}</Alert>}
      <Collapse in={issuesOpen && issues.length > 0}>
        <Box sx={{ mb: 1.75, border: "1px solid #FECACA", borderRadius: 2.5, bgcolor: "#FFFBFA", p: 2 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 13.5, mb: .75 }}>Darbo laiko patikra pagal DK</Typography>
          <Stack gap={.75}>
            {issues.map((i, k) => (
              <Stack key={k} direction="row" gap={1.1} alignItems="flex-start"
                sx={{ py: .55, px: 1.1, bgcolor: "#FFFFFF", borderRadius: 1.4, border: "1px solid #FEE4E2" }}>
                <Box sx={{ width: 7, height: 7, borderRadius: "50%", mt: .65, flexShrink: 0,
                  bgcolor: i.level === "warning" ? "#F79009" : "#D92D20" }} />
                <Typography sx={{ fontSize: 12.5, lineHeight: 1.45 }}><b>{i.employee}</b> – {i.message}</Typography>
              </Stack>
            ))}
          </Stack>
          <Typography sx={{ fontSize: 11.5, color: "text.secondary", mt: 1 }}>
            Raudoni – pažeidimai (tvirtinti galima tik su paaiškinimu), oranžiniai – įspėjimai. Atlyginimas už dirbtą laiką vis tiek apskaičiuojamas.
          </Typography>
        </Box>
      </Collapse>
      {needRoster.length > 0 && (
        <Alert severity="warning" sx={{ mb: 1.5 }}
          action={<Button size="small" color="inherit" onClick={() => navigate(`/grafikai-ir-tabeliai?m=${year}-${String(month).padStart(2, "0")}`)}>Į grafiką</Button>}>
          {needRoster.length} darbuotojų darbo laikas skaičiuojamas pagal grafiką, bet {MONTHS[month - 1].toLowerCase()} grafikas dar nepaskelbtas.
          Pirmiausia paskelbkite grafiką.
        </Alert>
      )}

      {!data ? (view === "list" ? <ListSkeleton /> : <GridSkeleton toolbar={false} rows={6} days={new Date(year, month, 0).getDate()} totals={8} />)
        : !rows.length ? (
          <Alert severity="info">Šį mėnesį darbuotojų nėra.</Alert>
        ) : !shownRows.length ? (
          <>
            {filterBar}
            <Alert severity="info" sx={{ borderRadius: 2 }}>Pagal pasirinktus filtrus darbuotojų nerasta.</Alert>
          </>
        ) : view === "list" ? (
          <>
          {filterBar}
          <ListView rows={shownRows} days={days} today={today} locked={locked} issues={issues} issueDays={issueDays}
            onCell={openCell} selected={selected} onSelect={setSelected} shiftTypes={meta.shift_types}
            year={year} month={month} onReload={load} />
          </>
        ) : (
          <>
            {filterBar}
            <TableView rows={shownRows} days={days} today={today} locked={locked} issues={issues} issueDays={issueDays} onCell={openCell} shiftTypes={meta.shift_types} />
          </>
        )}

      {dlg && (
        <DayDialog value={dlg} info={days.find((x) => x.date === dlg.day.date) || {}} typeColor={typeColorMap(meta.shift_types)}
          onClose={() => setDlg(null)} onChanged={() => { setDlg(null); load(); }}
          onOpenTrip={() => { setDlg(null); navigate(`/grafikai-ir-tabeliai/komandiruotes?m=${year}-${String(month).padStart(2, "0")}`); }} />
      )}
      <Dialog open={!!approveDlg} onClose={() => setApproveDlg(null)} fullWidth maxWidth="sm" disableScrollLock
        PaperProps={{ sx: { borderRadius: 2.7 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>{approveDlg?.need_note ? "Tabelyje yra darbo laiko pažeidimų" : "Pataisykite tabelį"}</DialogTitle>
        <DialogContent>
          <Stack gap={.75} sx={{ mb: 2 }}>
            {(approveDlg?.issues || []).map((i, k) => (
              <Typography key={k} sx={{ fontSize: 13 }}>• <b>{i.employee}</b> – {i.message}</Typography>
            ))}
          </Stack>
          {approveDlg?.need_note ? (
            <>
              <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1 }}>
                Jei taip iš tiesų buvo dirbta, tabelį galima patvirtinti – atlyginimas bus apskaičiuotas už visą dirbtą laiką.
                Nurodykite priežastį: ji bus išsaugota (VDI patikrinimo atvejui).
              </Typography>
              <TextField fullWidth multiline minRows={2} label="Paaiškinimas" value={approveDlg?.note || ""}
                onChange={(e) => setApproveDlg({ ...approveDlg, note: e.target.value })}
                placeholder="pvz. avarija sandėlyje 11-05, darbuotojų sutikimai gauti" />
            </>
          ) : (
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Tai duomenų klaidos – pataisykite valandas ir bandykite dar kartą.</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setApproveDlg(null)}>{approveDlg?.need_note ? "Atšaukti" : "Gerai"}</Button>
          {approveDlg?.need_note && (
            <Button variant="contained" color="warning" disableElevation disabled={busy || !(approveDlg?.note || "").trim()}
              onClick={() => setStatus(true, approveDlg.note)}>Patvirtinti su paaiškinimu</Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
