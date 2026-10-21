import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Autocomplete, Badge, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControlLabel, IconButton, LinearProgress, ListItemIcon, Menu, MenuItem, Paper, Popover, Slider, Stack, Switch, Tab, Tabs,
  Collapse, ListSubheader, Radio, RadioGroup, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import { GridSkeleton, RulesSkeleton } from "./PayrollSkeletons";
import { PublishPreviewDialog, RepairPreviewDialog, RepairStartDialog, StaleBanner, StaleMonthChips, repairRunning } from "./RosterRepair";
import "dayjs/locale/lt";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import AddIcon from "@mui/icons-material/Add";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import SearchIcon from "@mui/icons-material/Search";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import BeachAccessOutlinedIcon from "@mui/icons-material/BeachAccessOutlined";
import SickOutlinedIcon from "@mui/icons-material/SickOutlined";
import MoneyOffOutlinedIcon from "@mui/icons-material/MoneyOffOutlined";
import ChildCareOutlinedIcon from "@mui/icons-material/ChildCareOutlined";
import FamilyRestroomOutlinedIcon from "@mui/icons-material/FamilyRestroomOutlined";
import PregnantWomanOutlinedIcon from "@mui/icons-material/PregnantWomanOutlined";
import PersonOffOutlinedIcon from "@mui/icons-material/PersonOffOutlined";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import CloseIcon from "@mui/icons-material/Close";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import FlightTakeoffIcon from "@mui/icons-material/FlightTakeoff";
import BedtimeOutlinedIcon from "@mui/icons-material/BedtimeOutlined";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import BalanceOutlinedIcon from "@mui/icons-material/BalanceOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import CheckIcon from "@mui/icons-material/Check";
import FilterListIcon from "@mui/icons-material/FilterList";
import { alpha } from "@mui/material/styles";

import { MONTHS, apiError, payrollApi } from "../../api/payroll";
import LtDatePicker from "../../components/LtDatePicker"; // ⚠ pataisyk kelią, jei komponentas kitur

const WD = ["Pr", "An", "Tr", "Kt", "Pn", "Št", "Sk"];
// Tik 10 iš anksto apibrėžtų pamainų spalvų. Viena spalva = viena pamaina.
// Pamainos - švelnios, bet ryškios (pilnas fonas, tamsus tos pačios spalvos kodas);
// nebuvimai - dryžuoti su ikona; pilka - tik „Kiti nebuvimai“
export const PALETTE = ["#7DB4FF", "#5FD39A", "#FFA762", "#B69CFF", "#FF8DC3", "#4DD4E8", "#FFD255", "#FF8A8A", "#B8E06A", "#D9A77E"];
const SHIFT_TEXT = {
  "#7DB4FF": "#0B3B8C", "#5FD39A": "#06512F", "#FFA762": "#7A3205", "#B69CFF": "#3F1F99", "#FF8DC3": "#7D0F45",
  "#4DD4E8": "#04505C", "#FFD255": "#6B4A00", "#FF8A8A": "#7F1414", "#B8E06A": "#3B5205", "#D9A77E": "#5C3412",
};
// ankstesnės paletės -> nauja
const LEGACY_COLORS = {
  "#4C8BF5": "#7DB4FF", "#7C3AED": "#B69CFF", "#12A594": "#5FD39A", "#F76B15": "#FFA762", "#E5484D": "#FF8A8A",
  "#B08A3E": "#D9A77E", "#0284C7": "#4DD4E8", "#C026D3": "#FF8DC3", "#65A30D": "#B8E06A", "#475569": "#7DB4FF",
  "#2563EB": "#7DB4FF", "#059669": "#5FD39A", "#EA580C": "#FFA762", "#E11D48": "#FF8A8A", "#0891B2": "#4DD4E8",
  "#A16207": "#FFD255", "#4D7C0F": "#B8E06A", "#334155": "#D9A77E",
};
export const shiftColor = (c) => LEGACY_COLORS[String(c || "").toUpperCase()] || c;
export const shiftText = (c) => SHIFT_TEXT[String(shiftColor(c) || "").toUpperCase()] || "#101828";
const SHIFT_NAME_MAX = 40;
const SHIFT_CODE_MAX = 3;
const time24 = (value) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || "").slice(0, 5));
const normalizedColor = (value) => String(value || "").trim().toUpperCase();

function employeePosition(employee) {
  if (!employee) return "";
  const candidates = [
    typeof employee.position === "string" ? employee.position : null,
    employee.position_name, employee.job_title, employee.role_name, employee.pareigos,
    employee.position?.name, employee.position_details?.name, employee.role?.name,
    employee.current_contract?.position_name, employee.current_contract?.position?.name,
    employee.contract?.position_name, employee.contract?.position?.name,
    employee.employment?.position_name, employee.employment?.position?.name,
  ];
  return String(candidates.find((x) => typeof x === "string" && x.trim()) || "").trim();
}
const eur = (v) => `${Number(v || 0).toLocaleString("lt-LT", { maximumFractionDigits: 0 })} €`;
const hrs = (v) => `${Number(v || 0).toLocaleString("lt-LT", { maximumFractionDigits: 1 })} val.`;
const MONTHS_GEN_LT = ["sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio", "liepos", "rugpjūčio", "rugsėjo", "spalio", "lapkričio", "gruodžio"];
const WEEKDAYS_LT = ["pirmadienis", "antradienis", "trečiadienis", "ketvirtadienis", "penktadienis", "šeštadienis", "sekmadienis"];
const dayTitle = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  const m = MONTHS_GEN_LT[d.getMonth()];
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${d.getDate()} (${WEEKDAYS_LT[(d.getDay() + 6) % 7]})`;
};
// valdymo juostos mygtukai - lengvesnis šriftas, vienodas aukštis
const TB_BTN = { textTransform: "none", whiteSpace: "nowrap", fontWeight: 600, fontSize: 13, letterSpacing: 0,
  lineHeight: 1.2, height: 34, px: 1.6, borderRadius: 1.5, "& .MuiButton-startIcon": { mr: .7 } };
const MONTHS_NOM = ["sausis", "vasaris", "kovas", "balandis", "gegužė", "birželis", "liepa", "rugpjūtis", "rugsėjis", "spalis", "lapkritis", "gruodis"];

// Valandų būklė: žalia - atitinka / trūksta iki 8 val.; oranžinė - viršyta arba trūksta daugiau;
// raudona - nuokrypis didesnis nei 10 % mėnesio normos (bet ne mažiau kaip 12 val. - viena ilga pamaina)
const HOURS_LEVEL = {
  ok: { dark: "#A6F4C5", light: "#027A48" },
  warn: { dark: "#FDB022", light: "#B54708" },
  bad: { dark: "#FDA29B", light: "#D92D20" },
};
function hoursLevel(e) {
  const n = (v) => Number(v || 0);
  const diff = n(e.hours) - n(e.target);
  const norm = n(e.target_info?.month_norm ?? e.target);
  const limit = Math.max(norm * 0.1, 12);
  const big = Math.abs(diff) > limit;
  const pct = norm ? Math.round((Math.abs(diff) / norm) * 100) : 0;
  if (Math.abs(diff) < 1) return { level: "ok", diff, text: "Atitinka normą" };
  if (diff > 0) return big
    ? { level: "bad", diff, text: `Viršyta ${hrs(diff)} (+${pct} % normos)` }
    : { level: "warn", diff, text: `Viršyta ${hrs(diff)} – bus viršvalandžiai, jei neišlyginsite kitą mėnesį` };
  if (-diff <= 8) return { level: "ok", diff, text: `Trūksta ${hrs(-diff)} – perkeliama į kitą laikotarpio mėnesį` };
  return big
    ? { level: "bad", diff, text: `Trūksta ${hrs(-diff)} (−${pct} % normos)` }
    : { level: "warn", diff, text: `Trūksta ${hrs(-diff)} – suplanuokite daugiau pamainų` };
}

// Valandų paaiškinimas grafiko eilutėje: iš ko susideda šio mėnesio tikslas ir kaip sekasi visame laikotarpyje
function HoursTip({ e }) {
  const i = e.target_info || {};
  const n = (v) => Number(v || 0);
  const carry = n(i.carry);
  const pm = (ym) => (ym ? MONTHS_NOM[Number(ym.slice(5)) - 1] : "");
  const row = (l, v) => (
    <Stack direction="row" justifyContent="space-between" gap={3}>
      <Typography sx={{ fontSize: 12, color: "#D0D5DD" }}>{l}</Typography>
      <Typography sx={{ fontSize: 12, color: "#FFFFFF", fontWeight: 700, whiteSpace: "nowrap" }}>{v}</Typography>
    </Stack>
  );
  const head = (t, mt = 0) => <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: "#FFFFFF", mt, mb: .25 }}>{t}</Typography>;
  const lv = hoursLevel(e);
  const status = { c: HOURS_LEVEL[lv.level].dark, t: lv.text };
  return (
    <Stack gap={.35} sx={{ minWidth: 230 }}>
      {head("Šio mėnesio valandos")}
      {row("Mėnesio norma", hrs(i.month_norm ?? e.target))}
      {Math.abs(carry) >= .1 && row(carry > 0 ? "Trūko ankstesniais mėnesiais" : "Viršyta ankstesniais mėnesiais",
        `${carry > 0 ? "+" : "−"}${hrs(Math.abs(carry))}`)}
      {row("Suplanuota grafike", hrs(e.hours))}
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: status.c, mt: .25 }}>{status.t}</Typography>
      {i.period_from && (
        <Box sx={{ mt: .75, pt: .75, borderTop: "1px solid rgba(255,255,255,.18)" }}>
          {head("Apskaitinis laikotarpis")}
          {row("Laikotarpis", i.period_from === i.period_to ? pm(i.period_from) : `${pm(i.period_from)}–${pm(i.period_to)}`)}
          {row("Laikotarpio norma", hrs(i.period_norm))}
          {row("Išdirbta iki šio mėnesio", hrs(i.worked_before))}
        </Box>
      )}
    </Stack>
  );
}
const list = (d) => (Array.isArray(d) ? d : d?.results || []);

function nextMonth() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

// Platiems ekranams mėnuo telpa pilnai; siauriems leidžiamas horizontalus slinkimas.
const ROSTER_PERSON_WIDTH = 198;
const ROSTER_DAY_MIN_WIDTH = 34;

function shiftClock(type) {
  return `${String(type?.start || type?.start_time || "").slice(0, 5)}–${String(type?.end || type?.end_time || "").slice(0, 5)}`;
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
}

// Nebuvimų žymės turi aiškias piktogramas, kad nesusilietų su spalvotomis pamainomis.
// Mamadienis ir tėvadienis kalendoriuje rodomi kaip viena rūšis.
const ABSENCE_KINDS = {
  annual: { code: "AT", label: "Atostogos", Icon: BeachAccessOutlinedIcon, color: "#0A84D6", bg: "#DCF0FF" },
  sick: { code: "LG", label: "Liga", Icon: SickOutlinedIcon, color: "#E0245E", bg: "#FFE1EA" },
  unpaid: { code: "NA", label: "Nemokamos atostogos", Icon: MoneyOffOutlinedIcon, color: "#C27803", bg: "#FFF1CC" },
  family_day: { code: "MT", label: "Mamadienis / tėvadienis", Icon: ChildCareOutlinedIcon, color: "#12A150", bg: "#DDF8E7" },
  childcare: { code: "VP", label: "Vaiko priežiūros atostogos", Icon: FamilyRestroomOutlinedIcon, color: "#7C4DFF", bg: "#ECE6FF" },
  maternity: { code: "NG", label: "Nėštumo ir gimdymo atostogos", Icon: PregnantWomanOutlinedIcon, color: "#D6339C", bg: "#FCE4F4" },
  truancy: { code: "PR", label: "Pravaikšta", Icon: PersonOffOutlinedIcon, color: "#E8590C", bg: "#FFE8D9" },
  other: { code: "KT", label: "Kiti nebuvimai", Icon: EventBusyOutlinedIcon, color: "#5B6577", bg: "#EEF1F5" },
  trip: { code: "KM", label: "Komandiruotė", Icon: FlightTakeoffIcon, color: "#FFFFFF", bg: "#1E3A6E", solid: true },
  unknown: { code: "NB", label: "Nebuvimas", Icon: HelpOutlineOutlinedIcon, color: "#5B6577", bg: "#EEF1F5" },
};

function absenceKind(raw) {
  const value = String(raw || "").toLocaleLowerCase("lt-LT").replace(/[ _-]+/g, " ").trim();
  if (!value) return "unknown";
  if (value === "trip" || /komandiruot|business trip/.test(value)) return "trip";
  if (/mamadien|mother.?day|maternity day|mother day|tėvadien|tevadien|father.?day|paternity day|family day|parent day/.test(value)) return "family_day";
  if (/nemokam|unpaid|unpaid leave/.test(value)) return "unpaid";
  if (/nėštum|nestum|gimdym|maternity leave/.test(value)) return "maternity";
  if (/vaiko priežiūr|vaiko prieziur|childcare|parental leave/.test(value)) return "childcare";
  if (/lig|sick|illness|nedarbing|sickness/.test(value)) return "sick";
  if (/atostog|annual|vacation|holiday|leave/.test(value)) return "annual";
  if (/pravaikšt|pravaikst|truancy|unexcused/.test(value)) return "truancy";
  return "other";
}

// Nebuvimai grafike: [backend rūšis, UI žymėjimas, ar galima pasirinkti laikotarpį]
const ABSENCE_MENU = [
  ["vacation", "annual", true], ["sick", "sick", true], ["unpaid", "unpaid", true], ["parent_day", "family_day", false],
  ["childcare", "childcare", true], ["maternity", "maternity", true], ["truancy", "truancy", false], ["other", "other", true],
];
const OTHER_KINDS = [["downtime", "Prastova"], ["study", "Mokymosi atostogos"], ["paternity", "Tėvystės atostogos"],
  ["donor", "Donorystė"], ["civic", "Valstybinės pareigos"], ["suspension", "Nušalinimas"]];
// su šiais nebuvimais pamaina tą dieną lieka (mamadienis - pamainos dieną, pravaikšta - praleista pamaina ir pan.)
const WITH_SHIFT = new Set(["parent_day", "truancy", "downtime", "business_trip"]);

function AbsenceRangeDialog({ value, onClose, onSaved }) {
  const [f, setF] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setError("");
    setF(value ? { kind: value.kind === "other" ? "downtime" : value.kind, start: value.date, end: value.date } : null);
  }, [value]);
  if (!value || !f) return null;
  const p = ABSENCE_KINDS[value.ui];
  const save = async () => {
    setBusy(true); setError("");
    try {
      await payrollApi.createAbsence({ employee: value.emp.id, kind: f.kind, start_date: f.start, end_date: f.end, status: "approved" });
      onSaved();
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  };
  const pick = (key) => (d) => d && d.isValid() && setF((x) => {
    const v = d.format("YYYY-MM-DD");
    const n = { ...x, [key]: v };
    if (key === "start" && n.end < v) n.end = v;
    return n;
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" disableScrollLock>
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="lt">
        <DialogTitle sx={{ fontWeight: 800 }}>{p.label} – {value.emp.name}</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ pt: 1 }}>
            {value.kind === "other" && (
              <TextField select size="small" label="Rūšis" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}
                SelectProps={{ MenuProps: { disableScrollLock: true } }}>
                {OTHER_KINDS.map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
              </TextField>
            )}
            <Stack direction="row" gap={1.5}>
              <DatePicker label="Nuo" value={dayjs(f.start)} format="YYYY-MM-DD" onChange={pick("start")} slotProps={{ textField: { size: "small", fullWidth: true } }} />
              <DatePicker label="Iki (imtinai)" value={dayjs(f.end)} format="YYYY-MM-DD" minDate={dayjs(f.start)} onChange={pick("end")}
                slotProps={{ textField: { size: "small", fullWidth: true } }} />
            </Stack>
            {value.kind === "sick" && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              Ligos pažymėjimus patogiau įkelti iš Sodros S15 – tada datos ir tęsiniai užsipildo patys.</Typography>}
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              Neskelbtame grafike pamainos šiomis dienomis bus pašalintos automatiškai.</Typography>
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose}>Atšaukti</Button>
          <Button variant="contained" disableElevation onClick={save} disabled={busy || !f.start || !f.end}>Pažymėti</Button>
        </DialogActions>
      </LocalizationProvider>
    </Dialog>
  );
}

function createAbsenceIndex(data) {
  const result = {};
  const days = (data?.days || []).map((day) => day.date);
  function put(employeeId, entry) {
    if (employeeId == null || entry == null) return;
    const obj = typeof entry === "string" ? { date: entry } : entry;
    const start = obj.date || obj.start_date || obj.start || obj.from;
    const end = obj.end_date || obj.end || obj.to || start;
    if (!start) return;
    const rawKind = obj.kind || obj.type || obj.absence_kind || obj.reason_code || obj.reason || "";
    const kind = absenceKind(rawKind);
    const item = { kind, label: obj.label || obj.kind_label || obj.type_label || ABSENCE_KINDS[kind].label,
      id: obj.id ?? null, raw: obj.raw || "", start: String(start).slice(0, 10), end: String(end).slice(0, 10) };
    days.filter((date) => date >= String(start).slice(0, 10) && date <= String(end).slice(0, 10)).forEach((date) => {
      const key = `${employeeId}|${date}`;
      // Įrašas su konkrečiu tipu pakeičia seną datų masyvo žymą „NB“.
      if (!result[key] || (result[key].kind === "unknown" && kind !== "unknown")) result[key] = item;
    });
  }
  [...(data?.employees || []), ...(data?.fixed_employees || [])].forEach((employee) => {
    (employee.absences || []).forEach((entry) => put(employee.id, entry));
    (employee.absence_details || []).forEach((entry) => put(employee.id, entry));
  });
  (data?.absences || []).forEach((entry) => put(entry.employee_id ?? entry.employee, entry));
  return result;
}

function AbsenceBadge({ absence }) {
  const palette = ABSENCE_KINDS[absence?.kind] || ABSENCE_KINDS.unknown;
  const Icon = palette.Icon;
  return (
    <Box title={absence?.label || palette.label} sx={{
      height: 22, width: "100%", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: .2,
      bgcolor: palette.bg, color: palette.color,
      border: palette.solid ? `1px solid ${palette.bg}` : `1px dashed ${alpha(palette.color, .45)}`,
      backgroundImage: palette.solid ? "none" : `repeating-linear-gradient(135deg, ${alpha(palette.color, .16)} 0 3px, transparent 3px 7px)`,
      borderRadius: 1.2, px: .15, lineHeight: 1,
      whiteSpace: "nowrap", overflow: "hidden",
    }}>
      <Icon sx={{ fontSize: 15, flexShrink: 0 }} />
    </Box>
  );
}

// Vienodos patikros sujungiamos: viena priežastis + datos, o ne daugybė Alert kortelių.
function groupRosterNotices(data) {
  const groups = new Map();
  const employees = new Map((data?.employees || []).map((e) => [String(e.id), e.name]));
  function add(kind, message, date, employeeId) {
    if (!message) return;
    const text = String(message).trim();
    const key = `${kind}|${text}`;
    if (!groups.has(key)) groups.set(key, { kind, message: text, dates: new Set(), people: new Set(), count: 0 });
    const group = groups.get(key);
    group.count += 1;
    if (date) group.dates.add(String(date).slice(0, 10));
    if (employeeId != null) group.people.add(employees.get(String(employeeId)) || String(employeeId));
  }
  (data?.hints || []).forEach((h) => add(h.level || "info", h.message, h.date, h.employee_id));
  (data?.violations || []).forEach((v) => add("error", v.message, v.date, v.employee_id));
  (data?.rule_violations || []).forEach((v) => add("warning", v.message, v.date, v.employee_id));
  (data?.absence_conflicts || []).forEach((c) => add("warning",
    `Pamaina perbraukta – darbuotojas nedirbs (${c.label}). Paskirkite pakaitinį.`, c.date, c.employee_id));
  const priority = { error: 0, warning: 1, info: 2 };
  return [...groups.values()].map((g) => ({
    ...g,
    dates: [...g.dates].sort(),
    people: [...g.people].sort((a,b) => a.localeCompare(b, "lt")),
  })).sort((a, b) => (priority[a.kind] ?? 3) - (priority[b.kind] ?? 3));
}

function ShiftBadge({ type, tint, cancelled = false }) {
  return (
    <Box
      title={`${type.name}: ${shiftClock(type)}`}
      sx={{
        width: "100%", height: 21, minWidth: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        bgcolor: cancelled ? "#FFFFFF" : tint, border: cancelled ? "1px dashed #F04438" : `1px solid ${alpha(shiftText(tint), .12)}`,
        borderRadius: .85, color: cancelled ? "#B42318" : shiftText(tint), textDecoration: cancelled ? "line-through" : "none",
        fontSize: 10, fontWeight: 800, lineHeight: 1, letterSpacing: .2,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}
    >
      {type.code}
    </Box>
  );
}

// Darbuotojų filtras: apskaitos režimas ir pareigos (piktograma su skaičiumi, kiek filtrų įjungta)
const REGIMES = [["summed", "Suminė"], ["fixed", "Standartinė"], ["all", "Visi"]];
const DEFAULT_FILTERS = { regime: "summed", positions: [] };
function RosterFilter({ filters, onChange, positions }) {
  const [anchor, setAnchor] = useState(null);
  const active = (filters.regime !== "summed" ? 1 : 0) + filters.positions.length;
  const togglePos = (p) => onChange({ ...filters,
    positions: filters.positions.includes(p) ? filters.positions.filter((x) => x !== p) : [...filters.positions, p] });
  const head = (t) => <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: "#667085", mb: .4 }}>{t}</Typography>;
  return (
    <>
      <Tooltip title="Filtrai">
        <IconButton size="small" aria-label="Filtrai" onClick={(e) => setAnchor(e.currentTarget)}
          sx={{ width: 32, height: 32, bgcolor: active ? "#EEF4FF" : "white", border: `1px solid ${active ? "#B2CCFF" : "#D0D5DD"}`, borderRadius: 1.3,
            color: active ? "#2958BD" : "#475467", "&:hover": { bgcolor: active ? "#E0EAFF" : "#F9FAFB" } }}>
          <Badge badgeContent={active} color="primary" invisible={!active}
            sx={{ "& .MuiBadge-badge": { fontSize: 9.5, height: 15, minWidth: 15, px: .4, top: -3, right: -4 } }}>
            <FilterListIcon sx={{ fontSize: 18 }} />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)} disableScrollLock
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }} transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { mt: .75, borderRadius: 2, border: "1px solid #EAECF0", boxShadow: "0 12px 32px rgba(16,24,40,.12)" } } }}>
        <Box sx={{ p: 1.75, width: 260 }}>
          {head("Darbo laiko apskaita")}
          <RadioGroup value={filters.regime} onChange={(e) => onChange({ ...filters, regime: e.target.value })}>
            {REGIMES.map(([v, l]) => (
              <FormControlLabel key={v} value={v} control={<Radio size="small" sx={{ py: .4 }} />} label={l}
                sx={{ m: 0, "& .MuiFormControlLabel-label": { fontSize: 13 } }} />
            ))}
          </RadioGroup>
          <Typography sx={{ fontSize: 11, color: "#98A2B3", mt: .3, lineHeight: 1.4 }}>
            Standartinės apskaitos darbuotojai rodomi sąrašo apačioje – tik peržiūrai ir nebuvimams žymėti.
          </Typography>
          <Divider sx={{ my: 1.25 }} />
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            {head("Pareigos")}
            {filters.positions.length > 0 && (
              <Box component="button" type="button" onClick={() => onChange({ ...filters, positions: [] })}
                sx={{ border: 0, bgcolor: "transparent", p: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, color: "primary.main", mb: .4 }}>
                Išvalyti
              </Box>
            )}
          </Stack>
          {!positions.length && <Typography sx={{ fontSize: 12, color: "#98A2B3" }}>Pareigos nenurodytos</Typography>}
          <Box sx={{ maxHeight: 220, overflow: "auto", mx: -.5 }}>
            {positions.map((p) => (
              <FormControlLabel key={p} control={<Checkbox size="small" checked={filters.positions.includes(p)} onChange={() => togglePos(p)} sx={{ py: .35 }} />}
                label={p} sx={{ display: "flex", m: 0, "& .MuiFormControlLabel-label": { fontSize: 13 } }} />
            ))}
          </Box>
          {active > 0 && (
            <Button fullWidth size="small" onClick={() => onChange(DEFAULT_FILTERS)}
              sx={{ mt: 1.25, textTransform: "none", fontWeight: 600, color: "#475467", border: "1px solid #E4E7EC", borderRadius: 1.5 }}>
              Atstatyti filtrus
            </Button>
          )}
        </Box>
      </Popover>
    </>
  );
}

function RosterCalendar({ data, types, color, slots, shifts, absences, violations, ruleViolations, locked, busy, onSlot, onCell, search, onSearchChange, filters, onFiltersChange, positionMap }) {
  const [needsExpanded, setNeedsExpanded] = useState(true);
  const days = data.days || [];
  const summedList = data.employees || [];
  const fixedList = data.fixed_employees || [];
  const getPosition = (e) => employeePosition(e) || positionMap[String(e.id)] || "";
  const positions = [...new Set([...summedList, ...fixedList].map(getPosition).filter(Boolean))].sort((a, b) => a.localeCompare(b, "lt"));
  // suminės apskaitos darbuotojai visada viršuje, standartinės - apačioje
  const byRegime = filters.regime === "summed" ? summedList : filters.regime === "fixed" ? fixedList : [...summedList, ...fixedList];
  const needle = search.trim().toLocaleLowerCase("lt-LT");
  const filtered = byRegime.filter((e) =>
    String(e.name || "").toLocaleLowerCase("lt-LT").includes(needle) &&
    (!filters.positions.length || filters.positions.includes(getPosition(e)))
  );
  const firstFixed = filtered.find((e) => e.fixed);
  const today = localToday();
  const DATE_HEADER_HEIGHT = 56;
  const SHIFT_HEADER_HEIGHT = 35;
  const SHIFT_LINE_HEIGHT = 33;
  const weekendBg = (day) => day.holiday ? "#F7F3FF" : day.weekday >= 5 ? "#FFF8F7" : "#FFFFFF";
  const dayColor = (day, strong) => day.holiday ? (strong ? "#5B21B6" : "#6D28D9") : day.weekday >= 5 ? (strong ? "#B42318" : "#C23B38") : (strong ? "#344054" : "#667085");
  const standardCell = { p: 0, borderBottom: "1px solid #EDF0F5", borderRight: "1px solid #EDF0F5", textAlign: "center" };

  return (
    <Paper variant="outlined" sx={{ minWidth: 0, overflow: "hidden", borderRadius: 2.5, borderColor: "#DDE3EB", bgcolor: "#FFFFFF", boxShadow: "0 2px 9px rgba(16,24,40,.025)" }}>
      {/* Tame pačiame konteineryje vyksta abi slinktys: sticky top veikia ir dideliam darbuotojų skaičiui. */}
      <Box sx={{ overflow: "auto", width: "100%", maxHeight: "min(73vh, 780px)", overscrollBehavior: "contain", scrollbarGutter: "stable" }}>
        <Box component="table" sx={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", width: "100%", minWidth: ROSTER_PERSON_WIDTH + days.length * ROSTER_DAY_MIN_WIDTH }}>
          <colgroup>
            <col style={{ width: ROSTER_PERSON_WIDTH }} />
            {days.map((d) => <col key={d.date} />)}
          </colgroup>
          <thead>
            <tr>
              <Box component="th" scope="col" sx={{ ...standardCell, position: "sticky", top: 0, left: 0, zIndex: 10, textAlign: "left", bgcolor: "#F8FAFC", p: "9px 10px !important", borderBottom: "2px solid #CAD5E2", boxShadow: "2px 0 3px rgba(16,24,40,.03)" }} />
              {days.map((day) => (
                <Box component="th" scope="col" key={day.date} title={day.holiday ? day.holiday_name : day.pre_holiday ? "Prieššventinė diena (−1 val.)" : day.date}
                  sx={{ ...standardCell, position: "sticky", top: 0, zIndex: 8, bgcolor: day.holiday ? "#EFE8FF" : weekendBg(day),
                    borderBottom: day.holiday ? "2px solid #8B5CF6" : "2px solid #CAD5E2", height: 56, fontWeight: 600 }}>
                  <Typography sx={{ fontSize: 10, color: dayColor(day, false), lineHeight: 1.4 }}>{WD[day.weekday]}</Typography>
                  <Typography sx={{ mt: .4, fontSize: 12.5, fontWeight: 800, lineHeight: 1.2, color: dayColor(day, true) }}>
                    {Number(day.date.slice(-2))}
                  </Typography>
                  {day.holiday && <Typography sx={{ fontSize: 7.5, lineHeight: 1.1, fontWeight: 700, color: "#6D28D9", letterSpacing: .2 }}>šventė</Typography>}
                  {day.pre_holiday && <Typography sx={{ fontSize: 7.5, lineHeight: 1.1, color: "#B54708" }}>−1h</Typography>}
                </Box>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <Box component="th" scope="rowgroup" sx={{ ...standardCell, position: "sticky", top: DATE_HEADER_HEIGHT, left: 0, zIndex: 9, textAlign: "left", bgcolor: "#F8FAFC", height: SHIFT_HEADER_HEIGHT, borderBottom: "1px solid #DBE2EC" }}>
                <Box component="button" type="button" onClick={() => setNeedsExpanded((x) => !x)} aria-expanded={needsExpanded}
                  sx={{ width: "100%", height: "100%", p: "0 8px", border: 0, background: "transparent", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", color: "#344054" }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 750 }}>Pamainos</Typography>
                  {needsExpanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
                </Box>
              </Box>
              <Box component="td" colSpan={days.length} onClick={() => setNeedsExpanded((x) => !x)}
                sx={{ ...standardCell, position: "sticky", top: DATE_HEADER_HEIGHT, zIndex: 7, height: SHIFT_HEADER_HEIGHT, cursor: "pointer", textAlign: "left", bgcolor: "#F8FAFC", borderBottom: "1px solid #DBE2EC", pl: "10px !important", fontSize: 11, fontWeight: 400, color: "#667085" }}>
                {needsExpanded ? `${types.length} pamainų tipai - pasirinkite kiek darbuotojų reikia kiekvienai pamainai` : `${types.length} pamainų tipai - spauskite, kad išskleistumėte`}
              </Box>
            </tr>
            {needsExpanded && types.map((type, typeIndex) => (
              <tr key={`needed-${type.id}`}>
                <Box component="th" scope="row" sx={{ ...standardCell, position: "sticky", top: DATE_HEADER_HEIGHT + SHIFT_HEADER_HEIGHT + typeIndex * SHIFT_LINE_HEIGHT, left: 0, zIndex: 8, bgcolor: "#F8FAFC", height: SHIFT_LINE_HEIGHT, px: "9px !important", textAlign: "left" }}>
                  <Stack direction="row" gap={.7} alignItems="center" minWidth={0}>
                    <Box sx={{ bgcolor: color(type.id), border: `1px solid ${alpha(shiftText(color(type.id)), .12)}`, color: shiftText(color(type.id)), minWidth: 28, height: 21, px: .3, borderRadius: 1, display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 800 }}>{type.code}</Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 10.8, color: "#344054", fontWeight: 700, lineHeight: 1.15 }}>{type.name}</Typography>
                      <Typography noWrap sx={{ fontSize: 9.5, color: "#667085", lineHeight: 1.15 }}>{shiftClock(type)}</Typography>
                    </Box>
                  </Stack>
                </Box>
                {days.map((day) => {
                  const slot = slots[`${day.date}|${type.id}`];
                  const short = Boolean(slot && slot.assigned < slot.min);
                  const excess = Boolean(slot && slot.max != null && slot.assigned > slot.max);
                  return (
                    <Box component="td" key={day.date} sx={{ ...standardCell, position: "sticky", top: DATE_HEADER_HEIGHT + SHIFT_HEADER_HEIGHT + typeIndex * SHIFT_LINE_HEIGHT, zIndex: 6, bgcolor: (short || excess) ? "#FEF3F2" : slot ? "#F4F8F4" : "#F8FAFC", height: SHIFT_LINE_HEIGHT }}>
                      <Tooltip arrow slotProps={{ tooltip: { sx: { bgcolor: "#101828", p: 1 } } }} title={
                        <Box sx={{ fontSize: 12, lineHeight: 1.55 }}>
                          <Box sx={{ fontWeight: 800, fontSize: 12.5 }}>{dayTitle(day.date)}</Box>
                          <Box>{type.name} {shiftClock(type)}</Box>
                          <Box sx={{ color: "#D0D5DD" }}>{slot ? `Paskirta ${slot.assigned}, reikia ${slot.min}${slot.max != null && slot.max !== slot.min ? `–${slot.max}` : ""}` : "Darbuotojų poreikis nenustatytas"}</Box>
                        </Box>}>
                        <Box role="button" tabIndex={locked || busy ? -1 : 0}
                          aria-label={`${day.date} ${type.name}: ${slot ? `${slot.assigned} iš ${slot.min}` : "nustatyti poreikį"}`}
                          onClick={(ev) => onSlot(ev, day, type, slot)}
                          onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onSlot(ev, day, type, slot); } }}
                          sx={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 33, cursor: locked || busy ? "default" : "pointer", fontSize: 10.5, fontWeight: 800,
                            color: (short || excess) ? "#B42318" : slot ? "#027A48" : "#B6C0CC", "&:hover": { bgcolor: locked || busy ? "transparent" : "rgba(21,94,239,.07)" } }}>
                          {slot ? `${slot.assigned}/${slot.min}` : "+"}
                        </Box>
                      </Tooltip>
                    </Box>
                  );
                })}
              </tr>
            ))}
            <tr>
              <Box component="th" scope="rowgroup" sx={{ ...standardCell, position: "sticky", left: 0, zIndex: 4, textAlign: "left", bgcolor: "#F3F5F8", borderTop: "2px solid #CBD5E1", borderBottom: "1px solid #DBE2EC", height: 31, pl: "11px !important" }}>
                <Typography noWrap sx={{ fontSize: 11, fontWeight: 800, color: "#344054" }}>Darbuotojų grafikas</Typography>
              </Box>
              <Box component="td" colSpan={days.length} sx={{ ...standardCell, bgcolor: "#F3F5F8", borderTop: "2px solid #CBD5E1", borderBottom: "1px solid #DBE2EC", textAlign: "left", px: "8px !important", py: "5px !important" }}>
                <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                  <TextField size="small" placeholder="Ieškoti darbuotojo..." aria-label="Ieškoti darbuotojo"
                    value={search} onChange={(e) => onSearchChange(e.target.value)}
                    InputProps={{ startAdornment: <SearchIcon sx={{ fontSize: 16, color: "#98A2B3", mr: .5 }} /> }}
                    sx={{ width: 195, "& .MuiOutlinedInput-root": { bgcolor: "white", height: 32, fontSize: 11.5, borderRadius: 1.3 } }} />
                  <RosterFilter filters={filters} onChange={onFiltersChange} positions={positions} />
                </Stack>
              </Box>
            </tr>
            {filtered.map((employee) => {
              if (employee.fixed) {
                // Standartinė apskaita: darbo dienos pagal sutartį (be pamainų), tik nebuvimai
                const sep = employee === firstFixed && filters.regime === "all" && (
                  <tr key="fixed-sep">
                    <Box component="th" scope="rowgroup" sx={{ ...standardCell, position: "sticky", left: 0, zIndex: 4, textAlign: "left", bgcolor: "#F3F5F8",
                      borderTop: "2px solid #CBD5E1", height: 30, pl: "11px !important" }}>
                      <Typography noWrap sx={{ fontSize: 11, fontWeight: 800, color: "#344054" }}>Standartinė apskaita</Typography>
                    </Box>
                    <Box component="td" colSpan={days.length} sx={{ ...standardCell, bgcolor: "#F3F5F8", borderTop: "2px solid #CBD5E1", textAlign: "left",
                      pl: "10px !important", fontSize: 11, color: "#667085" }}>
                      Darbo laikas nustatytas darbo sutartyje – čia galite žymėti nebuvimus
                    </Box>
                  </tr>
                );
                const fixedTotal = Object.values(employee.fixed_days || {}).reduce((a, v) => a + Number(v || 0), 0);
                return [sep, (
                  <tr key={employee.id}>
                    <Box component="th" scope="row" sx={{ ...standardCell, position: "sticky", left: 0, zIndex: 3, textAlign: "left", bgcolor: "#FCFCFD", px: "8px !important", height: 50, boxShadow: "2px 0 3px rgba(16,24,40,.03)" }}>
                      <Stack direction="row" alignItems="center" gap={.75} minWidth={0}>
                        <Box sx={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: "#F2F4F7", color: "#475467", fontSize: 11, fontWeight: 800 }}>{initials(employee.name)}</Box>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography noWrap title={employee.name} sx={{ fontSize: 11.5, color: "#344054", fontWeight: 750, lineHeight: 1.25 }}>{employee.name}</Typography>
                          {employee.position && <Typography noWrap title={employee.position} sx={{ fontSize: 10, color: "#667085", lineHeight: 1.25 }}>{employee.position}</Typography>}
                          <Tooltip arrow placement="right" title="Standartinė darbo laiko apskaita: darbo laikas nustatytas darbo sutartyje, grafiko jam sudaryti nereikia. Generatorius, poreikis ir normos šio darbuotojo neliečia.">
                            <Typography noWrap sx={{ fontSize: 10, fontWeight: 600, color: "#667085", cursor: "help", width: "fit-content" }}>
                              Pagal sutartį · {hrs(fixedTotal)}
                            </Typography>
                          </Tooltip>
                        </Box>
                      </Stack>
                    </Box>
                    {days.map((day) => {
                      const key = `${employee.id}|${day.date}`;
                      const absence = absences[key];
                      const h = Number((employee.fixed_days || {})[day.date] || 0);
                      const past = day.date <= today;
                      const tip = (
                        <Box sx={{ fontSize: 12, lineHeight: 1.55 }}>
                          <Box sx={{ fontWeight: 800, fontSize: 12.5, mb: .3 }}>{dayTitle(day.date)}</Box>
                          {day.holiday && <Box sx={{ color: "#D6BBFB" }}>{day.holiday_name || "Šventinė diena"}</Box>}
                          {absence ? <Box sx={{ fontWeight: 700 }}>{absence.label || ABSENCE_KINDS[absence.kind]?.label}</Box>
                            : h ? <Box>Darbo diena pagal sutartį · {hrs(h)}</Box>
                              : <Box sx={{ color: "#D0D5DD" }}>Poilsio diena</Box>}
                        </Box>
                      );
                      return (
                        <Box component="td" key={day.date} sx={{ ...standardCell, height: 50, bgcolor: absence ? "#F9FAFB" : day.holiday ? "#F7F3FF" : day.weekday >= 5 ? "#FDFAFA" : "#FCFCFD" }}>
                          <Tooltip title={tip} arrow disableInteractive slotProps={{ tooltip: { sx: { bgcolor: "#101828", maxWidth: 300, p: 1 } } }}>
                            <Box role="button" tabIndex={busy ? -1 : 0} aria-label={`${employee.name}, ${dayTitle(day.date)}`}
                              onClick={(ev) => onCell(ev, employee, day, [], Boolean(absence), past)}
                              onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onCell(ev, employee, day, [], Boolean(absence), past); } }}
                              sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", px: "2px",
                                cursor: busy ? "wait" : "pointer", "&:hover": { bgcolor: "rgba(21,94,239,.055)" } }}>
                              {absence ? <AbsenceBadge absence={absence} />
                                : h ? (
                                  <Box sx={{ width: "100%", height: 22, borderRadius: 1, border: "1px solid #E4E7EC", bgcolor: "#FFFFFF",
                                    color: "#667085", fontSize: 10.5, fontWeight: 600, display: "grid", placeItems: "center" }}>
                                    {h.toLocaleString("lt-LT", { maximumFractionDigits: 1 })}
                                  </Box>
                                ) : <Typography sx={{ color: "#CBD5E1", fontSize: 10 }}>·</Typography>}
                            </Box>
                          </Tooltip>
                        </Box>
                      );
                    })}
                  </tr>
                )];
              }
              const lv = hoursLevel(employee);
              const difference = lv.diff;
              const maxDailyShifts = days.reduce((n, day) => Math.max(n, (shifts[`${employee.id}|${day.date}`] || []).length + (absences[`${employee.id}|${day.date}`] ? 1 : 0)), 0);
              const rowHeight = Math.max(54, maxDailyShifts * 24 + 9);
              return (
                <tr key={employee.id}>
                  <Box component="th" scope="row" sx={{ ...standardCell, position: "sticky", left: 0, zIndex: 3, textAlign: "left", bgcolor: "#FFFFFF", px: "8px !important", height: rowHeight, boxShadow: "2px 0 3px rgba(16,24,40,.03)" }}>
                    <Stack direction="row" alignItems="center" gap={.75} minWidth={0}>
                      <Box sx={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: "#EEF4FF", color: "#2958BD", fontSize: 11, fontWeight: 800 }}>{initials(employee.name)}</Box>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography noWrap title={employee.name} sx={{ fontSize: 11.5, color: "#182230", fontWeight: 750, lineHeight: 1.25 }}>{employee.name}</Typography>
                        {employeePosition(employee) && (
                          <Typography noWrap title={employeePosition(employee)} sx={{ fontSize: 10, color: "#667085", lineHeight: 1.25 }}>
                            {employeePosition(employee)}
                          </Typography>
                        )}
                        <Tooltip arrow placement="right" title={<HoursTip e={employee} />} slotProps={{ tooltip: { sx: { bgcolor: "#101828", maxWidth: 300, p: 1.25 } } }}>
                          <Stack direction="row" alignItems="center" gap={.35} sx={{ cursor: "help", width: "fit-content" }}>
                            <Typography noWrap sx={{ fontSize: 10, fontWeight: 600, color: lv.level === "bad" ? "#D92D20" : "#344054" }}>{hrs(employee.hours)} / {hrs(employee.target)}</Typography>
                            {Math.abs(difference) >= 1 && <Typography sx={{ fontSize: 10, fontWeight: 600, color: HOURS_LEVEL[lv.level].light }}>{difference > 0 ? "+" : ""}{Math.round(difference)}</Typography>}
                          </Stack>
                        </Tooltip>
                      </Box>
                    </Stack>
                  </Box>
                  {days.map((day) => {
                    const key = `${employee.id}|${day.date}`;
                    const assigned = shifts[key] || [];
                    const absence = absences[key];
                    const absent = Boolean(absence);
                    const problems = [...(violations[key] || []), ...(ruleViolations[key] || [])];
                    // nebuvimas, su kuriuo pamaina negalima (ne mamadienis / pravaikšta / prastova / komandiruotė)
                    const cancelled = absent && assigned.length > 0 && !WITH_SHIFT.has(absence.raw);
                    const assignedTypes = assigned.map((s) => types.find((t) => t.id === s.shift_type_id)).filter(Boolean);
                    const title = [absent ? (absence.label || ABSENCE_KINDS[absence.kind]?.label) : "", ...assignedTypes.map((t) => `${t.name} ${shiftClock(t)}`), ...problems].filter(Boolean).join(" · ") || "Laisva pagal grafiką";
                    const tip = (
                      <Box sx={{ fontSize: 12, lineHeight: 1.55 }}>
                        <Box sx={{ fontWeight: 800, fontSize: 12.5, mb: .3 }}>{dayTitle(day.date)}</Box>
                        {day.holiday && <Box sx={{ color: "#D6BBFB" }}>{day.holiday_name || "Šventinė diena"}</Box>}
                        {day.pre_holiday && <Box sx={{ color: "#FEC84B" }}>Prieššventinė diena (−1 val.)</Box>}
                        {absent && <Box sx={{ fontWeight: 700 }}>{absence.label || ABSENCE_KINDS[absence.kind]?.label}</Box>}
                        {assignedTypes.map((t) => (
                          <Stack key={t.id} direction="row" alignItems="center" gap={.75}>
                            <Box sx={{ px: .5, borderRadius: .5, fontSize: 10, fontWeight: 800, bgcolor: color(t.id), color: shiftText(color(t.id)) }}>{t.code}</Box>
                            <span>{t.name} {shiftClock(t)}</span>
                          </Stack>
                        ))}
                        {!absent && !assignedTypes.length && <Box sx={{ color: "#D0D5DD" }}>Laisva pagal grafiką</Box>}
                        {cancelled && <Box sx={{ color: "#FDA29B" }}>⚠ Darbuotojas nedirbs – pamainą reikia perduoti kitam</Box>}
                        {problems.map((p) => <Box key={p} sx={{ color: "#FDA29B" }}>⚠ {p}</Box>)}
                      </Box>
                    );
                    const warning = Boolean(problems.length) || cancelled;
                    const past = day.date <= today;
                    return (
                      <Box component="td" key={day.date} sx={{ ...standardCell, height: rowHeight, position: "relative", bgcolor: absent ? "#F9FAFB" : weekendBg(day),
                        backgroundImage: "none",
                        boxShadow: warning ? `inset 0 0 0 1.5px ${violations[key]?.length || cancelled ? "#F04438" : "#F79009"}` : "none" }}>
                        <Tooltip title={tip} arrow disableInteractive slotProps={{ tooltip: { sx: { bgcolor: "#101828", maxWidth: 300, p: 1 } } }}>
                          <Box role="button" tabIndex={busy ? -1 : 0} aria-label={`${employee.name}, ${dayTitle(day.date)}: ${title}`}
                            onClick={(ev) => onCell(ev, employee, day, assigned, absent, past)}
                            onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onCell(ev, employee, day, assigned, absent, past); } }}
                            sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "2px", px: "2px", py: "4px",
                              cursor: absent && !assigned.length ? "default" : busy ? "wait" : "pointer", "&:hover": { bgcolor: absent ? "transparent" : "rgba(21,94,239,.055)" } }}>
                            {assignedTypes.map((type, i) => <ShiftBadge key={`${type.id}-${i}`} type={type} tint={color(type.id)} cancelled={cancelled} />)}
                            {absent && <AbsenceBadge absence={absence} />}
                            {!assignedTypes.length && !absent && <Typography sx={{ color: "#CBD5E1", fontSize: 10 }}>·</Typography>}
                            {assigned.some((s) => s.locked) && <LockIcon sx={{ position: "absolute", right: 1, top: 1, fontSize: 8, color: "#475467" }} />}
                          </Box>
                        </Tooltip>
                      </Box>
                    );
                  })}
                </tr>
              );
            })}
            {!filtered.length && <tr><Box component="td" colSpan={days.length + 1} sx={{ p: 2, textAlign: "center", color: "text.secondary" }}>Darbuotojų pagal pasirinktus filtrus nerasta</Box></tr>}
          </tbody>
        </Box>
      </Box>
    </Paper>
  );
}

// Suskleidžiamas šoninis blokas (būsena prisimenama naršyklėje)
function SidePanel({ id, title, extra, children }) {
  const key = `roster.side.${id}`;
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(key) === "1"; } catch { return false; }      // pagal nutylėjimą suskleista
  });
  const toggle = () => setOpen((v) => {
    try { localStorage.setItem(key, v ? "0" : "1"); } catch { /* nesvarbu */ }
    return !v;
  });
  return (
    <Paper variant="outlined" sx={{ borderRadius: 2.5, borderColor: "#E4E7EC", overflow: "hidden", width: "100%", minWidth: 0 }}>
      <Stack direction="row" alignItems="center" gap={1} onClick={toggle} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
        sx={{ px: 1.6, py: 1.2, cursor: "pointer", userSelect: "none", "&:hover": { bgcolor: "#FAFBFC" } }}>
        <Stack direction="row" alignItems="center" gap={.75} sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 800 }}>{title}</Typography>
          {extra}
        </Stack>
        <ExpandMoreIcon sx={{ fontSize: 20, color: "#667085", transition: "transform .15s", transform: open ? "rotate(180deg)" : "none" }} />
      </Stack>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 1.6, pb: 1.6 }}>{children}</Box>
      </Collapse>
    </Paper>
  );
}

// Grafiko sudarymo visam laikotarpiui eiga: kiekvieno mėnesio būsena + bendra juosta
function PeriodProgress({ items }) {
  const chain = items.filter((x) => x.gen);
  const done = chain.filter((x) => x.gen === "done").length;
  const runningNow = chain.some((x) => x.gen === "running");
  const pct = chain.length ? ((done + (runningNow ? .5 : 0)) / chain.length) * 100 : 0;
  const mn = (ym) => MONTHS[Number(ym.slice(5)) - 1];
  return (
    <Box sx={{ mt: 1.25, p: 1.5, borderRadius: 2, bgcolor: "#F5F8FF", border: "1px solid #D1E0FF" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} mb={.9}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#1D3FA8" }}>Sudaromas grafikas visam apskaitiniam laikotarpiui</Typography>
        <Typography sx={{ fontSize: 12.5, fontWeight: 650, color: "#344054" }}>{done} iš {chain.length} mėn.</Typography>
      </Stack>
      <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 99, bgcolor: "#D9E4FF" }} />
      <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1.1 }}>
        {chain.map((x) => {
          const st = { done: ["#027A48", "#ECFDF3", "sudarytas"], running: ["#1D3FA8", "#FFFFFF", "sudaroma…"],
            queued: ["#667085", "#FFFFFF", "laukia"], error: ["#B42318", "#FEF3F2", "nepavyko"] }[x.gen] || ["#667085", "#FFFFFF", ""];
          return (
            <Tooltip key={x.ym} title={x.gen === "error" ? x.gen_error : ""} disableHoverListener={x.gen !== "error"}>
              <Stack direction="row" alignItems="center" gap={.7} sx={{ px: 1.1, py: .5, borderRadius: 1.5, bgcolor: st[1], border: `1px solid ${st[0]}33` }}>
                {x.gen === "done" ? <CheckIcon sx={{ fontSize: 15, color: st[0] }} />
                  : x.gen === "running" ? <CircularProgress size={12} thickness={6} />
                    : x.gen === "error" ? <ErrorOutlineIcon sx={{ fontSize: 15, color: st[0] }} />
                      : <ScheduleOutlinedIcon sx={{ fontSize: 15, color: st[0] }} />}
                <Typography sx={{ fontSize: 12, fontWeight: 650, color: "#344054" }}>{mn(x.ym)}</Typography>
                <Typography sx={{ fontSize: 11.5, color: st[0] }}>{st[2]}</Typography>
              </Stack>
            </Tooltip>
          );
        })}
      </Stack>
      <Typography sx={{ fontSize: 11.5, color: "#475467", mt: 1 }}>
        Kiekvienam mėnesiui ieškoma geriausio varianto (apie 30 s). Puslapį galite uždaryti – sudarymas tęsis fone.
      </Typography>
    </Box>
  );
}

// Prieš sudarant visam laikotarpiui - aiškiai parodoma, kurie mėnesiai bus sudaryti, o kurie ne ir kodėl
function PeriodGenerateDialog({ open, period, onClose, onConfirm }) {
  const mn = (ym) => MONTHS[Number(ym.slice(5)) - 1];
  const todo = (period || []).filter((x) => x.state === "todo");
  const row = (x) => {
    const cfg = {
      todo: ["Bus sudarytas", "#027A48", "#ECFDF3",
        `${x.has_shifts ? `Esamos pamainos bus perrašytos${x.locked_shifts ? ` (${x.locked_shifts} užrakintos liks)` : ""}.` : "Grafikas dar tuščias."} `
        + `Paskelbti darbuotojams iki ${x.publish_deadline} (DK 115 str.).`],
      published: ["Paskelbtas – nekeičiamas", "#475467", "#F2F4F7", "Jo valandos įskaitomos į laikotarpio normą."],
      started: ["Jau prasidėjo – nekeičiamas", "#B54708", "#FFFAEB",
        "Einamojo mėnesio grafikas iš naujo nesudaromas – dalis dienų jau dirbta. Jei reikia, sudarykite jį atskirai („Šiam mėnesiui“)."],
      past: ["Praėjęs – nekeičiamas", "#475467", "#F2F4F7", "Faktiškai dirbtos valandos įskaitomos į laikotarpio normą."],
    }[x.state];
    return (
      <Stack key={x.ym} direction="row" gap={1.5} alignItems="flex-start" sx={{ py: 1.1, borderBottom: "1px solid #F2F4F7" }}>
        <Typography sx={{ width: 92, flexShrink: 0, fontSize: 13.5, fontWeight: 700, color: "#101828", pt: .2 }}>{mn(x.ym)}</Typography>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box component="span" sx={{ display: "inline-block", px: .9, py: .2, borderRadius: 1, bgcolor: cfg[2], color: cfg[1], fontSize: 12, fontWeight: 700 }}>{cfg[0]}</Box>
          <Typography sx={{ fontSize: 12.5, color: "#475467", mt: .4, lineHeight: 1.5 }}>{cfg[3]}</Typography>
        </Box>
      </Stack>
    );
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" disableScrollLock PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 800, pb: .5 }}>Sudaryti grafiką visam apskaitiniam laikotarpiui</DialogTitle>
      <DialogContent>
        {period?.length > 0 && (
          <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1 }}>
            Laikotarpis: {mn(period[0].ym).toLowerCase()}–{mn(period[period.length - 1].ym).toLowerCase()}
          </Typography>
        )}
        <Box sx={{ mb: 1.75 }}>{(period || []).map(row)}</Box>
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: "#F8FAFC", border: "1px solid #EAECF0" }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "#344054", mb: .5 }}>Kaip tai veikia</Typography>
          {[
            "Mėnesiai sudaromi iš eilės: kiekvieno kito mėnesio valandų tikslas įvertina ankstesnių perteklių ar trūkumą, todėl laikotarpio norma išlyginama.",
            "Kiekvienam mėnesiui automatiškai pritaikomas geriausias variantas – vėliau jį galite pakeisti („Rodyti variantus“).",
            "Darbuotojai grafiko nemato, kol jo nepaskelbsite. Kiekvieną mėnesį skelbiate atskirai.",
            "Sudarymas užtrunka apie 30 s kiekvienam mėnesiui – eigą matysite viršuje.",
          ].map((t) => (
            <Stack key={t} direction="row" gap={.8} sx={{ mt: .4 }}>
              <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: "#98A2B3", mt: .9, flexShrink: 0 }} />
              <Typography sx={{ fontSize: 12.5, color: "#475467", lineHeight: 1.5 }}>{t}</Typography>
            </Stack>
          ))}
        </Box>
        {!todo.length && (
          <Alert severity="info" sx={{ mt: 1.5 }}>Šiame laikotarpyje nėra ateities mėnesių, kuriuos būtų galima sudaryti.</Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ textTransform: "none", fontWeight: 650 }}>Atšaukti</Button>
        <Button variant="contained" disableElevation disabled={!todo.length} onClick={onConfirm}
          sx={{ textTransform: "none", fontWeight: 700, borderRadius: 1.75 }}>
          Sudaryti {todo.length} mėn. ({todo.map((x) => mn(x.ym).toLowerCase()).join(", ")})
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RosterSidebar({ data, types, color, cell, absences }) {
  const employees = data.employees || [];
  const slots = data.slots || [];
  const n = (v) => Number(v || 0);

  // Pamainos - skaičiuojama taip pat, kaip rodoma tinklelyje: langelis su pamaina, kai darbuotojas tą dieną dirba
  const typeIds = new Set(types.map((t) => t.id));
  let shiftCount = 0;
  employees.forEach((e) => (data.days || []).forEach((day) => {
    const key = `${e.id}|${day.date}`;
    if (!absences[key]) shiftCount += (cell[key] || []).filter((s) => typeIds.has(s.shift_type_id)).length;
  }));
  const fmtH = (v) => n(v).toLocaleString("lt-LT", { maximumFractionDigits: 1 });

  // poreikio padengimas pagal pamainas: kiek dienų padengta iš dienų, kai darbuotojų reikia
  const coverage = types.map((t) => {
    const need = slots.filter((x) => x.shift_type_id === t.id && n(x.min) > 0);
    const short = need.filter((x) => n(x.assigned) < n(x.min));
    return { t, total: need.length, ok: need.length - short.length, short: short.map((x) => Number(x.date.slice(8))) };
  });

  // nebuvimai: kalendorinės dienos pagal rūšį ir kiek darbuotojų
  const absByLabel = new Map();
  const absPeople = new Set();
  employees.forEach((e) => (e.absence_details || []).forEach((a) => {
    const d = Math.round((new Date(a.end_date) - new Date(a.start_date)) / 86400000) + 1;
    const k = a.raw === "business_trip" ? "trip" : absenceKind(a.kind);
    const label = a.raw === "business_trip" ? "Komandiruotės" : (ABSENCE_KINDS[k]?.label || a.label);
    const cur = absByLabel.get(label) || { days: 0, people: new Set(), k };
    cur.days += d; cur.people.add(e.name); absByLabel.set(label, cur);
    absPeople.add(e.name);
  }));
  const absDays = [...absByLabel.values()].reduce((a, x) => a + x.days, 0);
  const hours = employees.reduce((a, e) => a + n(e.hours), 0);
  const target = employees.reduce((a, e) => a + n(e.target), 0);
  // darbuotojai, kurių valandos labai nukrypsta nuo normos (> 10 %) - „Valandos“ rodoma raudonai
  const badHours = employees.map((e) => ({ e, lv: hoursLevel(e) })).filter((x) => x.lv.level === "bad");
  const hoursTip = (
    <Box sx={{ fontSize: 12, lineHeight: 1.6 }}>
      <Box>Suplanuota / reikia išdirbti pagal normas</Box>
      {badHours.length > 0 && <Box sx={{ color: "#FDA29B", fontWeight: 700, mt: .5 }}>Nuokrypis daugiau nei 10 % normos:</Box>}
      {badHours.map(({ e, lv }) => (
        <Stack key={e.id} direction="row" justifyContent="space-between" gap={2}>
          <span>{e.name}</span>
          <b style={{ whiteSpace: "nowrap" }}>{lv.diff > 0 ? "+" : "−"}{fmtH(Math.abs(lv.diff))} val.</b>
        </Stack>
      ))}
    </Box>
  );

  const line = (label, value, tip, valueColor = "#101828") => (
    <Tooltip title={tip || ""} arrow placement="left" disableHoverListener={!tip}
      slotProps={{ tooltip: { sx: { bgcolor: "#101828", p: 1, maxWidth: 380 } } }}>
      <Stack direction="row" justifyContent="space-between" gap={1} sx={{ py: .35, cursor: tip ? "help" : "default" }}>
        <Typography sx={{ fontSize: 12, color: "#667085" }}>{label}</Typography>
        <Typography sx={{ fontSize: 12.5, fontWeight: 750, color: valueColor, whiteSpace: "nowrap" }}>{value}</Typography>
      </Stack>
    </Tooltip>
  );

  return (
    <Box sx={{ minWidth: 0, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5, alignItems: "start",
      "@container (min-width: 1530px)": { display: "flex", flexDirection: "column", alignItems: "stretch" } }}>
      <SidePanel id="legend" title="Žymėjimai">
        <Stack gap={1.1}>
          {types.map((type) => (
            <Stack key={type.id} direction="row" alignItems="center" gap={1} minWidth={0}>
              <Box sx={{ width: 33, height: 26, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 1.1, bgcolor: color(type.id), border: `1px solid ${alpha(shiftText(color(type.id)), .12)}`, color: shiftText(color(type.id)), fontWeight: 800, fontSize: 11 }}>
                {type.code}
              </Box>
              <Box minWidth={0}>
                <Typography noWrap sx={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.3 }}>{type.name}</Typography>
                <Typography noWrap sx={{ fontSize: 10.5, color: "#667085" }}>{shiftClock(type)}</Typography>
              </Box>
            </Stack>
          ))}
          <Divider sx={{ my: .3 }} />
          <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: "#475467" }}>Nebuvimai</Typography>
          {Object.entries(ABSENCE_KINDS).filter(([key]) => key !== "unknown").map(([key, item]) => {
            const Icon = item.Icon;
            return (
              <Stack key={key} direction="row" alignItems="center" gap={1} minWidth={0}>
                <Box sx={{ width: 34, height: 26, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 1.1, bgcolor: item.bg,
                  border: item.solid ? `1px solid ${item.bg}` : `1px dashed ${alpha(item.color, .45)}`, color: item.color,
                  backgroundImage: item.solid ? "none" : `repeating-linear-gradient(135deg, ${alpha(item.color, .16)} 0 3px, transparent 3px 7px)` }}>
                  <Icon sx={{ fontSize: 18 }} />
                </Box>
                <Typography sx={{ fontSize: 11.5, color: "#344054", lineHeight: 1.3, fontWeight: 650 }}>{item.label}</Typography>
              </Stack>
            );
          })}
          <Stack direction="row" gap={1} alignItems="center">
            <Box sx={{ width: 33, height: 26, borderRadius: 1.1, border: "1px dashed #D0D5DD", bgcolor: "#F8FAFC" }} />
            <Typography sx={{ fontSize: 11.5, color: "#475467" }}>Nepriskirta pamaina</Typography>
          </Stack>
        </Stack>
      </SidePanel>

      <SidePanel id="summary" title="Mėnesio suvestinė">
        <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: "#475467", mb: .9 }}>Poreikio padengimas</Typography>
        <Stack gap={1}>
          {coverage.map(({ t, total, ok, short }) => {
            const full = total > 0 && ok === total;
            const pct = total ? Math.round((ok / total) * 100) : 0;
            return (
              <Tooltip key={t.id} arrow placement="left" slotProps={{ tooltip: { sx: { bgcolor: "#101828", p: 1 } } }}
                title={!total ? "Darbuotojų poreikis šiai pamainai nenustatytas"
                  : short.length ? `Trūksta darbuotojų: ${short.join(", ")} d.` : "Visos dienos padengtos"}>
                <Box sx={{ cursor: "help" }}>
                  <Stack direction="row" alignItems="center" gap={1}>
                    <Box sx={{ width: 30, height: 20, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: .8,
                      bgcolor: color(t.id), color: shiftText(color(t.id)), fontWeight: 800, fontSize: 10 }}>{t.code}</Box>
                    <Typography noWrap sx={{ fontSize: 11.5, color: "#344054", flex: 1, minWidth: 0 }}>{t.name}</Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap",
                      color: !total ? "#98A2B3" : full ? "#027A48" : "#B42318" }}>
                      {total ? `${ok} / ${total} d.` : "–"}
                    </Typography>
                  </Stack>
                  {total > 0 && (
                    <Box sx={{ mt: .55, ml: "38px", height: 4, borderRadius: 99, bgcolor: "#F2F4F7", overflow: "hidden" }}>
                      <Box sx={{ width: `${pct}%`, height: "100%", borderRadius: 99, bgcolor: full ? "#12B76A" : "#F04438" }} />
                    </Box>
                  )}
                </Box>
              </Tooltip>
            );
          })}
        </Stack>
        <Divider sx={{ my: 1.25 }} />
        {line("Darbuotojai", employees.length)}
        {line("Pamainos", shiftCount, "Viso pamainų pagal grafiką")}
        {line("Valandos", `${fmtH(hours)} / ${fmtH(target)}`, hoursTip, badHours.length ? "#D92D20" : "#101828")}
        {line("Nebuvimai", absDays ? `${absDays} d.` : "–", absDays ? (
          <Box sx={{ fontSize: 12, lineHeight: 1.6 }}>
            {[...absByLabel.entries()].sort((x, y) => y[1].days - x[1].days).map(([label, v]) => {
              const kind = ABSENCE_KINDS[v.k] || ABSENCE_KINDS.other;
              const I = kind.Icon;
              const ppl = v.people.size;
              return (
                <Stack key={label} direction="row" alignItems="center" gap={.9} sx={{ py: .2 }}>
                  <Box sx={{ width: 22, height: 18, borderRadius: .6, flexShrink: 0, display: "grid", placeItems: "center",
                    bgcolor: kind.solid ? kind.bg : "#FFFFFF", color: kind.color }}>
                    <I sx={{ fontSize: 14 }} />
                  </Box>
                  <Box sx={{ flex: 1 }}>{label}</Box>
                  <Box sx={{ fontWeight: 700, whiteSpace: "nowrap", ml: 1.5 }}>{v.days} d.</Box>
                  <Box sx={{ color: "#D0D5DD", whiteSpace: "nowrap", minWidth: 74, textAlign: "right" }}>
                    {ppl} {ppl === 1 ? "darbuotojas" : "darbuotojai"}
                  </Box>
                </Stack>
              );
            })}
            <Box sx={{ color: "#D0D5DD", mt: .6, pt: .6, borderTop: "1px solid rgba(255,255,255,.15)" }}>
              Iš viso {absDays} d. · darbuotojų su nebuvimais: {absPeople.size}
            </Box>
          </Box>
        ) : "")}
      </SidePanel>
    </Box>
  );
}

// ============================================================
// Grafikas
// ============================================================

function RosterTab({ year, month, onMonthShift, onOpenSettings }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [menu, setMenu] = useState(null); // {anchor, emp, date, shift}
  const [slotPop, setSlotPop] = useState(null); // {anchor, date, shift_type_id, min, max}
  const [tplMenu, setTplMenu] = useState(null);
  const [planMenu, setPlanMenu] = useState(null);
  const [genMenu, setGenMenu] = useState(null);       // „Sudaryti“: šiam mėnesiui / visam apskaitiniam laikotarpiui
  const [periodDlg, setPeriodDlg] = useState(false);
  const [starting, setStarting] = useState(false);    // paspausta „Sudaryti“ - krautuvas rodomas iškart
  const [repairStart, setRepairStart] = useState(false); // grafiko taisymas po nebuvimų - paleidimo langas
  const [repairOpen, setRepairOpen] = useState(false);   // pataisymų peržiūra
  const [pubPrev, setPubPrev] = useState(null);          // paskelbimas: kam bus pranešta
  const [discardDlg, setDiscardDlg] = useState(null);    // „Panaikinti pakeitimus“: nepaskelbti pakeitimai
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [filters, setFiltersState] = useState(() => {
    try { return { ...DEFAULT_FILTERS, ...JSON.parse(localStorage.getItem("roster.filters") || "{}") }; } catch { return DEFAULT_FILTERS; }
  });
  const setFilters = (f) => {
    setFiltersState(f);
    try { localStorage.setItem("roster.filters", JSON.stringify(f)); } catch { /* nesvarbu */ }
  };
  const [positionMap, setPositionMap] = useState({});
  const [variantsOpen, setVariantsOpen] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  useEffect(() => { if (!flash) return undefined; const t = setTimeout(() => setFlash(false), 2400); return () => clearTimeout(t); }, [flash]);
  useEffect(() => { if (!info) return undefined; const t = setTimeout(() => setInfo(""), 6000); return () => clearTimeout(t); }, [info]);
  // naujų įspėjimų atsiradus (pvz. pažymėjus nebuvimą ant pamainos) - „Įspėjimai“ mygtukas sumirksi
  const noticeCount = useRef(null);
  useEffect(() => {
    if (!data) return;
    const n = (data.violations || []).length + (data.rule_violations || []).length + (data.absence_conflicts || []).length;
    if (noticeCount.current != null && n > noticeCount.current) setFlash(true);
    noticeCount.current = n;
  }, [data]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [tplDlg, setTplDlg] = useState(null); // {name, week_start}
  const [unlockDlg, setUnlockDlg] = useState(null); // {reason, comment}
  const [lateDlg, setLateDlg] = useState(null); // [{employee_id, date}]
  const [lawDlg, setLawDlg] = useState(null);   // [{employee, date, message}]
  const [sugg, setSugg] = useState(null); // {date, shift_type_id, from, items}
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  // Užpildome pareigybes iš esamo darbuotojų API, jei roster jų nepateikia.
  useEffect(() => {
    let active = true;
    Promise.allSettled([payrollApi.employees({ status: "active" }), payrollApi.positions()]).then(([employeeResult, positionsResult]) => {
      if (!active || employeeResult.status !== "fulfilled") return;
      const positions = positionsResult.status === "fulfilled" ? list(positionsResult.value) : [];
      const byId = new Map(positions.map((p) => [String(p.id), p.name]));
      const map = {};
      list(employeeResult.value).forEach((employee) => {
        const posId = employee.position_id ?? employee.position ?? employee.current_contract?.position_id ?? employee.contract?.position_id;
        const label = employeePosition(employee) || byId.get(String(typeof posId === "object" ? posId?.id : posId));
        if (employee.id != null && label) map[String(employee.id)] = String(label);
      });
      setPositionMap(map);
    });
    return () => { active = false; };
  }, []);

  const load = useCallback(() => payrollApi.roster(year, month).then(setData).catch((e) => setError(apiError(e))), [year, month]);

  useEffect(() => { setData(null); load(); }, [load]);

  const [rulesCount, setRulesCount] = useState(null);
  const [copyFrom, setCopyFrom] = useState(null);       // "YYYY-MM" - poreikio kopijavimo dialogas
  const [absDlg, setAbsDlg] = useState(null);           // {emp, date, kind, ui} - nebuvimo laikotarpis
  useEffect(() => {
    payrollApi.rules().then((r) => setRulesCount(list(r).filter((x) => x.is_active !== false).length)).catch(() => setRulesCount(null));
  }, []);

  const gen = data?.generation || {};
  const startedAt = gen.started_at || gen.queued_at;
  const stale = startedAt && Date.now() - new Date(startedAt).getTime() > (gen.state === "queued" ? 2 : 10) * 60000;
  const running = (gen.state === "queued" || gen.state === "running") && !stale;
  const periodRunning = (data?.period || []).some((x) => x.gen === "queued" || x.gen === "running");
  const periodErrors = (data?.period || []).filter((x) => x.gen === "error");
  const repRunning = repairRunning(data?.repair);
  useEffect(() => {
    clearInterval(timer.current);
    if (running || periodRunning || repRunning) timer.current = setInterval(load, 4000);
    return () => clearInterval(timer.current);
  }, [running, periodRunning, repRunning, load]);
  // pataisymai paruošti - peržiūra atidaroma iškart
  const wasRepairing = useRef(false);
  useEffect(() => {
    if (wasRepairing.current && !repRunning && data?.repair?.state === "done") setRepairOpen(true);
    wasRepairing.current = repRunning;
  }, [repRunning, data?.repair?.state]);
  const applyRepair = async (months) => {
    setBusy(true); setError("");
    try {
      const r = await payrollApi.rosterAction({ year, month, action: "repair_apply", months });
      setData(r.roster);
      setRepairOpen(false);
      setInfo(r.unlocked?.length
        ? `Pritaikyta ${r.changes} pakeitimų. Atrakinta: ${r.unlocked.map((ym) => MONTHS[Number(ym.slice(5)) - 1].toLowerCase()).join(", ")} – peržiūrėkite ir spauskite „Paskelbti pakeitimus“ (atskirai kiekvienam mėnesiui), tada darbuotojai gaus pranešimą.`
        : `Pritaikyta ${r.changes} pakeitimų.`);
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };
  const openDiscard = async () => {
    setBusy(true); setError("");
    try {
      setDiscardDlg(await payrollApi.rosterAction({ year, month, action: "publish_preview" }));
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };
  const openPublish = async () => {
    setBusy(true); setError("");
    try {
      setPubPrev(await payrollApi.rosterAction({ year, month, action: "publish_preview" }));
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };
  const startGenerate = async (action) => {
    setStarting(true);
    try { await act({ action }); } finally { setStarting(false); }
  };

  // Sudarius grafiką - variantai parodomi iškart (atskiro mygtuko „Variantai“ nebereikia)
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running && gen.state === "done") {
      if (gen.auto_applied != null) {                   // sudaryta visam laikotarpiui - geriausias variantas jau pritaikytas
        const chain = (gen.period_chain || []).map((ym) => MONTHS[Number(ym.slice(5)) - 1].toLowerCase()).join(", ");
        setInfo(`Grafikas sudarytas visam apskaitiniam laikotarpiui (${chain}). Kiekvienam mėnesiui pritaikytas geriausias variantas – jį galite pakeisti „Rodyti variantus“.`);
      } else if ((gen.variants || []).length > 1) setVariantsOpen(true);
    }
    wasRunning.current = running;
  }, [running, gen.state, gen.variants]);

  const act = async (payload, okMsg) => {
    setBusy(true); setError("");
    try {
      const r = await payrollApi.rosterAction({ year, month, ...payload });
      if (r.roster) {
        setData(r.roster);
        const sent = r.no_changes ? " Pakeitimų nebuvo." : r.notified ? ` Pranešimai išsiųsti ${r.notified} darbuotojams.` : "";
        setInfo(r.late ? `Paskelbta vėliau nei likus 7 dienoms iki mėnesio pradžios (DK 115 str.).${sent}` : `${okMsg || ""}${sent}`);
      }
      else if (r.state === "queued") await load();
      else {
        setData(r);
        if (payload.action === "cell" && payload.shift_type_id) {
          const v = (r.rule_violations || []).filter((x) => x.date === payload.date && (x.employee_id === payload.employee_id || x.employee_id == null));
          if (v.length) { setFlash(true); return; }          // įspėjimas - „Įspėjimai“ mygtuke (sumirksi)
        }
        if (okMsg) setInfo(okMsg);
      }
    } catch (e) {
      if (e?.response?.status === 409 && e.response.data?.law_violations) {
        setData(e.response.data.roster);
        setLawDlg(e.response.data.law_violations);
      } else if (e?.response?.status === 409 && e.response.data?.late_changes) {
        setData(e.response.data.roster);
        setLateDlg(e.response.data.late_changes);
      } else setError(apiError(e));
    } finally { setBusy(false); }
  };

  const openSuggest = async (date, shiftTypeId, fromEmp) => {
    setError("");
    try {
      const r = await payrollApi.rosterAction({ year, month, action: "suggest", date, shift_type_id: shiftTypeId, exclude_employee_id: fromEmp || null });
      setSugg({ date, shift_type_id: shiftTypeId, from: fromEmp || null, items: r.candidates });
    } catch (e) { setError(apiError(e)); }
  };

  const types = data?.shift_types || [];
  const color = (id) => shiftColor(types.find((t) => t.id === id)?.color) || PALETTE[Math.max(0, types.findIndex((t) => t.id === id)) % PALETTE.length];
  const cell = useMemo(() => {
    const m = {};
    (data?.shifts || []).forEach((s) => { (m[`${s.employee_id}|${s.date}`] ||= []).push(s); });
    return m;
  }, [data]);
  const viol = useMemo(() => {
    const m = {};
    (data?.violations || []).forEach((v) => { (m[`${v.employee_id}|${v.date}`] ||= []).push(v.message); });
    return m;
  }, [data]);
  const absences = useMemo(() => createAbsenceIndex(data), [data]);

  const ruleViol = {};
  (data?.rule_violations || []).forEach((v) => { if (v.employee_id) (ruleViol[`${v.employee_id}|${v.date}`] ||= []).push(v.message); });
  const slotMap = {};
  (data?.slots || []).forEach((x) => { slotMap[`${x.date}|${x.shift_type_id}`] = x; });
  const mondays = (data?.days || []).filter((d) => d.weekday === 0).map((d) => d.date);

  const chooseSlot = (ev, day, type, slot) => {
    if (busy) return;
    if (locked) { setInfo("Paskelbtas grafikas užrakintas – spauskite „Atrakinti“."); return; }
    setSlotPop({ anchor: ev.currentTarget, date: day.date, shift_type_id: type.id,
      min: slot?.min ?? 1, max: slot?.max ?? "", short: slot && slot.assigned < slot.min });
  };

  const chooseCell = (ev, employee, day, shiftsForDay, absent, past) => {
    if (busy) return;
    if (employee.fixed) {                     // standartinė apskaita - tik nebuvimai (grafiko užrakinimas netaikomas)
      setMenu({ anchor: ev.currentTarget, emp: employee, date: day.date, shift: null, past, lockedOnly: false, fixed: true,
        fixedHours: Number((employee.fixed_days || {})[day.date] || 0), absence: absent ? absences[`${employee.id}|${day.date}`] || null : null });
      return;
    }
    if (shiftsForDay.length > 1) {
      setInfo("Šiai dienai priskirtos kelios pamainos. Jų atskiram redagavimui reikia kelių pamainų palaikymo rosterAction API.");
      return;
    }
    const shiftForDay = shiftsForDay[0] || null;
    if (locked && !(past && shiftForDay && !absent)) {
      setInfo("Paskelbtas grafikas užrakintas – spauskite „Atrakinti“.");
      return;
    }
    setMenu({ anchor: ev.currentTarget, emp: employee, date: day.date,
      shift: shiftForDay, past, lockedOnly: locked, absence: absent ? absences[`${employee.id}|${day.date}`] || null : null });
  };

  if (!data) return error ? <Alert severity="error">{error}</Alert> : <GridSkeleton withPlan rows={6} days={new Date(year, month, 0).getDate()} />;

  const published = data.status === "published";
  const editing = data.status === "editing";
  const locked = published;
  const variants = gen.variants || [];
  const bestVariant = variants.length ? [...variants].sort((a, b) =>
    ((a.stats?.coverage?.short_total || 0) - (b.stats?.coverage?.short_total || 0))
    || ((a.unmet || []).length - (b.unmet || []).length)
    || (((a.stats?.hours?.over || 0) + (a.stats?.hours?.under || 0)) - ((b.stats?.hours?.over || 0) + (b.stats?.hours?.under || 0)))
    || (Number(a.cost) - Number(b.cost)))[0].index : null;

  const notices = groupRosterNotices(data);

  if (!types.length) {
    const steps = [
      { n: 1, title: "Sukurkite pamainas", text: "Pamainų laikas, pertraukos ir kiek darbuotojų reikia kiekvieną savaitės dieną.",
        button: "Kurti pamainas", onClick: () => onOpenSettings(2), done: false },
      { n: 2, title: "Nustatykite taisykles (nebūtina)", text: "Pvz. ne daugiau kaip 2 naktinės pamainos iš eilės, poilsis po naktinės.",
        button: "Taisyklės", onClick: () => onOpenSettings(1), done: false },
      { n: 3, title: "Sudarykite grafiką", text: "Programa pasiūlys kelis variantus – pasirinkite ir pakoreguokite.", disabled: true },
    ];
    return (
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 3, maxWidth: 760 }}>
        <Typography sx={{ fontSize: 18, fontWeight: 800 }}>Pradėkime nuo pamainų</Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: .5, mb: 2.5 }}>
          Grafikas sudaromas automatiškai pagal jūsų pamainas ir taisykles. Tai nustatoma vieną kartą.
        </Typography>
        <Stack gap={1.5}>
          {steps.map((st) => (
            <Stack key={st.n} direction="row" gap={1.5} alignItems="center"
              sx={{ p: 1.5, borderRadius: 2, border: "1px solid", borderColor: st.disabled ? "divider" : "#C7D7FE", opacity: st.disabled ? .6 : 1 }}>
              <Box sx={{ width: 30, height: 30, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14,
                bgcolor: st.disabled ? "#F2F4F7" : "#EEF4FF", color: st.disabled ? "text.secondary" : "primary.main", flexShrink: 0 }}>{st.n}</Box>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 750 }}>{st.title}</Typography>
                <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{st.text}</Typography>
              </Box>
              {st.button && <Button size="small" variant={st.n === 1 ? "contained" : "outlined"} disableElevation onClick={st.onClick}
                sx={{ textTransform: "none", fontWeight: 700, borderRadius: 1.5, whiteSpace: "nowrap" }}>{st.button}</Button>}
            </Stack>
          ))}
        </Stack>
      </Paper>
    );
  }

  return (
    <Box sx={{ minWidth: 0 }}>
      {error && <Alert severity="error" sx={{ mb: 1.2, borderRadius: 1.5 }} onClose={() => setError("")}>{error}</Alert>}
      {info && <Alert severity="success" variant="outlined" sx={{ mb: 1.2, borderRadius: 1.5, py: 0, bgcolor: "#FFFFFF" }} onClose={() => setInfo("")}>{info}</Alert>}

      {/* Valdymo juosta: kairėje mėnuo, būsena ir įspėjimai; dešinėje nustatymai ir pagrindiniai veiksmai */}
      <Paper variant="outlined" sx={{ px: { xs: 1.1, md: 1.6 }, pt: 1.1, pb: (variants.length > 0 && !running) || editing ? 2.9 : 1.1, mb: 1.6,
        borderColor: "#E4E7EC", borderRadius: 2.5, boxShadow: "0 1px 4px rgba(16,24,40,.025)" }}>
        <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
          <Stack direction="row" alignItems="center" sx={{ flexShrink: 0 }}>
            <IconButton size="small" aria-label="Ankstesnis mėnuo" onClick={() => onMonthShift(-1)} sx={{ border: "1px solid #E4E7EC", borderRadius: 1.25, width: 32, height: 32, mr: .45 }}>
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" aria-label="Kitas mėnuo" onClick={() => onMonthShift(1)} sx={{ border: "1px solid #E4E7EC", borderRadius: 1.25, width: 32, height: 32, mr: 1.2 }}>
              <ChevronRightIcon fontSize="small" />
            </IconButton>
            <Typography sx={{ fontSize: 15.5, fontWeight: 650, color: "#101828", minWidth: 118, whiteSpace: "nowrap", textTransform: "capitalize" }}>
              {MONTHS[month - 1]} {year}
            </Typography>
          </Stack>
          <Tooltip arrow title={published
            ? `Paskelbtas${data.published_at ? ` ${String(data.published_at).slice(0, 10)}` : ""}. Norėdami keisti – „Atrakinti“.`
            : editing ? `Grafikas keičiamas (${data.pending_reason || "–"}). Darbuotojai iki paskelbimo mato ankstesnę versiją.`
              : `Juodraštis – darbuotojai jo nemato. Paskelbti iki ${data.publish_deadline || "–"}.`}>
            <Chip size="small" sx={{ height: 26, borderRadius: 1.5, bgcolor: published ? "#ECFDF3" : editing ? "#FFF6ED" : "#F2F4F7",
              color: published ? "#027A48" : editing ? "#B54708" : "#475467", fontWeight: 600, fontSize: 12, cursor: "help" }}
              label={published ? `Paskelbtas · v${data.version}` : editing ? `Keičiamas · v${data.version}` : "Juodraštis"} />
          </Tooltip>
          <StaleMonthChips period={data.period} year={year} month={month} onGo={onMonthShift} />
          {notices.length > 0 && (() => {
            const hasErr = notices.some((n) => n.kind === "error");
            const hasWarn = notices.some((n) => n.kind === "warning");
            const c = hasErr ? "#D92D20" : hasWarn ? "#DC6803" : "#475467";
            return (
              <Button size="small" startIcon={<WarningAmberIcon sx={{ fontSize: "15px !important" }} />}
                onClick={() => setNoticesOpen(true)}
                sx={{ ...TB_BTN, height: 26, px: 1.1, ml: .25, fontSize: 12, color: c, border: `1px solid ${alpha(c, .28)}`,
                  bgcolor: alpha(c, flash ? .16 : .06), transition: "background-color .3s",
                  "& .MuiButton-startIcon": { mr: .5 }, "&:hover": { bgcolor: alpha(c, .12) },
                  animation: flash ? "noticePulse .8s ease-in-out 3" : "none",
                  "@keyframes noticePulse": { "0%,100%": { boxShadow: `0 0 0 0 ${alpha(c, 0)}` }, "50%": { boxShadow: `0 0 0 4px ${alpha(c, .25)}` } } }}>
                Įspėjimai ({notices.length})
              </Button>
            );
          })()}
          <Box sx={{ flexGrow: 1 }} />
          <Tooltip title="Pamainos ir taisyklės">
            <IconButton size="small" aria-label="Pamainos ir taisyklės" onClick={() => onOpenSettings(2)}
              sx={{ border: "1px solid #E4E7EC", borderRadius: 1.5, width: 34, height: 34, color: "#475467" }}>
              <SettingsOutlinedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Daugiau veiksmų">
            <IconButton size="small" aria-label="Veiksmai" disabled={busy}
              onClick={(e) => setPlanMenu(e.currentTarget)} sx={{ border: "1px solid #E4E7EC", borderRadius: 1.5, width: 34, height: 34, color: "#475467" }}>
              <MoreHorizIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          {published && (
            <Button size="small" variant="outlined" startIcon={<LockOpenIcon sx={{ fontSize: "17px !important" }} />} onClick={() => setUnlockDlg({ reason: "illness", comment: "" })}
              sx={{ ...TB_BTN, color: "#344054", borderColor: "#D0D5DD", "&:hover": { borderColor: "#98A2B3", bgcolor: "#F9FAFB" } }}>Atrakinti</Button>
          )}
          <Box sx={{ position: "relative" }}>
            <Button size="small" variant="outlined" startIcon={running || periodRunning || starting ? <CircularProgress size={14} thickness={6} /> : <AutoAwesomeIcon sx={{ fontSize: "17px !important" }} />}
              disabled={running || periodRunning || starting || busy || locked}
              onClick={(e) => {
                const todo = (data.period || []).filter((x) => x.state === "todo");
                if ((data.period || []).length > 1 && todo.length > 0) setGenMenu(e.currentTarget);
                else startGenerate("generate");
              }} sx={TB_BTN}>
              {running || periodRunning || starting ? "Sudaroma…" : (data.shifts || []).length ? "Sudaryti iš naujo" : "Sudaryti grafiką"}
            </Button>
            {variants.length > 0 && !running && !periodRunning && !starting && (
              <Typography component="button" type="button" onClick={() => setVariantsOpen(true)}
                sx={{ position: "absolute", top: "100%", left: 0, right: 0, mt: .45, p: 0, border: 0, bgcolor: "transparent",
                  fontSize: 11.5, fontWeight: 500, color: "#475467", textAlign: "center", whiteSpace: "nowrap", cursor: "pointer",
                  fontFamily: "inherit", "&:hover": { color: "primary.main", textDecoration: "underline" } }}>
                Rodyti variantus ({variants.length})
              </Typography>
            )}
          </Box>
          <Box sx={{ position: "relative" }}>
            <Button size="small" variant="contained" startIcon={<CampaignOutlinedIcon sx={{ fontSize: "17px !important" }} />} disabled={busy || running || periodRunning || starting || !(data.shifts || []).length || locked}
              onClick={openPublish}
              sx={{ ...TB_BTN, boxShadow: "none", "&:hover": { boxShadow: "none" } }}>
              {editing ? "Paskelbti pakeitimus" : "Paskelbti"}
            </Button>
            {editing && (
              <Typography component="button" type="button" disabled={busy} onClick={openDiscard}
                sx={{ position: "absolute", top: "100%", left: 0, right: 0, mt: .45, p: 0, border: 0, bgcolor: "transparent",
                  fontSize: 11.5, fontWeight: 500, color: "#475467", textAlign: "center", whiteSpace: "nowrap", cursor: "pointer",
                  fontFamily: "inherit", "&:hover": { color: "error.main", textDecoration: "underline" } }}>
                Panaikinti pakeitimus
              </Typography>
            )}
          </Box>
        </Stack>
        {periodRunning ? <PeriodProgress items={data.period || []} />
          : (running || starting) && <LinearProgress sx={{ mt: 1.1, borderRadius: 2 }} />}
        {!periodRunning && periodErrors.length > 0 && (
          <Alert severity="error" sx={{ mt: 1 }}>
            Ne visi laikotarpio mėnesiai sudaryti: {periodErrors.map((x) => `${MONTHS[Number(x.ym.slice(5)) - 1].toLowerCase()} – ${x.gen_error}`).join("; ")}
          </Alert>
        )}
        {stale && (gen.state === "queued" || gen.state === "running") && (
          <Typography color="warning.main" sx={{ mt: .8, fontSize: 11.5 }}>Generavimas užtruko ilgiau nei įprasta. Galite bandyti dar kartą.</Typography>
        )}
        {gen.state === "error" && <Alert severity="error" sx={{ mt: 1 }}>{gen.error}</Alert>}
      </Paper>

      <StaleBanner stale={data.stale} repair={data.repair} busy={busy}
        onRepair={() => setRepairStart(true)} onPreview={() => setRepairOpen(true)}
        onIgnore={() => act({ action: "stale_ignore" }, "Pažymėta, kad grafikas atitinka duomenis")} />
      <RepairStartDialog open={repairStart} period={data.period} ym={`${year}-${String(month).padStart(2, "0")}`}
        onClose={() => setRepairStart(false)}
        onStart={(mode) => { setRepairStart(false); act({ action: "repair_start", mode }); }} />
      <RepairPreviewDialog open={repairOpen && data.repair?.state === "done"} repair={data.repair} types={types} color={color}
        textColor={(id) => shiftText(types.find((t) => t.id === id)?.color)} busy={busy}
        onClose={() => setRepairOpen(false)} onApply={applyRepair}
        onDiscard={() => { setRepairOpen(false); act({ action: "repair_discard" }, "Pataisymai atmesti"); }} />
      <Dialog open={!!discardDlg} onClose={() => setDiscardDlg(null)} fullWidth maxWidth="sm" disableScrollLock PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 800, pb: .5 }}>Panaikinti pakeitimus?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5, color: "#344054", mb: 1.25 }}>
            Grafikas bus grąžintas į paskelbtą versiją <b>v{data.version}</b> ir vėl užrakintas. Darbuotojams niekas nesiunčiama –
            jie ir taip mato paskelbtą versiją.
          </Typography>
          {(discardDlg?.employees || []).length > 0 ? (
            <Box sx={{ px: 1.5, py: 1.1, borderRadius: 2, bgcolor: "#FEF3F2" }}>
              <Typography sx={{ fontSize: 13, color: "#912018" }}>
                Bus prarasti nepaskelbti pakeitimai: <b>{discardDlg.employees.reduce((n, e) => n + e.lines.length, 0)}</b> pamainų,{" "}
                <b>{discardDlg.employees.length}</b> darbuotojų.
              </Typography>
            </Box>
          ) : (
            <Typography sx={{ fontSize: 12.5, color: "#667085" }}>Pakeitimų dar nepadaryta.</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDiscardDlg(null)} sx={{ textTransform: "none", fontWeight: 650 }}>Atšaukti</Button>
          <Button variant="contained" color="error" disableElevation disabled={busy}
            onClick={() => { setDiscardDlg(null); act({ action: "discard_changes" }, `Pakeitimai panaikinti – grąžinta paskelbta versija v${data.version}`); }}
            sx={{ textTransform: "none", fontWeight: 700, borderRadius: 1.75 }}>Panaikinti ir užrakinti</Button>
        </DialogActions>
      </Dialog>
      <PublishPreviewDialog open={!!pubPrev} preview={pubPrev} busy={busy} onClose={() => setPubPrev(null)}
        onConfirm={(late) => {
          setPubPrev(null);
          act({ action: "publish", confirm_late: late }, editing ? "Pakeitimai paskelbti" : "Grafikas paskelbtas darbuotojams");
        }} />

      {(data.employees || []).length === 0 ? (
        <Alert severity="info">Nėra darbuotojų su sumine darbo laiko apskaita. Ją nustatykite darbuotojo sutarties sąlygose.</Alert>
      ) : (
        <Box sx={{ containerType: "inline-size", minWidth: 0 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 1.5,
            "@container (min-width: 1530px)": { gridTemplateColumns: "minmax(0,1fr) 210px" } }}>
            <RosterCalendar data={data} types={types} color={color} slots={slotMap} shifts={cell} absences={absences}
              violations={viol} ruleViolations={ruleViol} locked={locked} busy={busy}
              onSlot={chooseSlot} onCell={chooseCell} search={employeeSearch} onSearchChange={setEmployeeSearch}
              filters={filters} onFiltersChange={setFilters} positionMap={positionMap} />
            <RosterSidebar data={data} types={types} color={color} cell={cell} absences={absences} />
          </Box>
        </Box>
      )}

      {/* Variantai ir detalūs pranešimai atidaromi tik paspaudus. */}
      <Dialog open={copyFrom !== null} onClose={() => setCopyFrom(null)} fullWidth maxWidth="xs" disableScrollLock>
        <DialogTitle sx={{ fontWeight: 800 }}>Kopijuoti poreikį</DialogTitle>
        <DialogContent>
          <TextField select fullWidth size="small" label="Iš mėnesio" value={copyFrom || ""} onChange={(e) => setCopyFrom(e.target.value)}
            sx={{ mt: 1 }} SelectProps={{ MenuProps: { disableScrollLock: true } }}>
            {(data.plan_months || []).map((ym) => (
              <MenuItem key={ym} value={ym}>{ym.slice(0, 4)} m. {MONTHS[Number(ym.slice(5)) - 1].toLowerCase()}</MenuItem>
            ))}
          </TextField>
          <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: 1.5, lineHeight: 1.55 }}>
            Kiekviena diena paima tą pačią savaitės dieną tuo pačiu eilės numeriu (1-as pirmadienis ← 1-as pirmadienis).
            Šventės nekopijuojamos – jų poreikis iš pamainų nustatymų. Esamas {MONTHS[month - 1].toLowerCase()} poreikis bus pakeistas.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCopyFrom(null)}>Atšaukti</Button>
          <Button variant="contained" disableElevation disabled={!copyFrom || busy}
            onClick={() => { const from = copyFrom; setCopyFrom(null); act({ action: "copy_prev_plan", from }, `Poreikis nukopijuotas iš ${from}`); }}>
            Kopijuoti
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={variantsOpen} onClose={() => setVariantsOpen(false)} maxWidth="lg" fullWidth disableScrollLock>
        <DialogTitle sx={{ fontWeight: 800 }}>
          Pasirinkite grafiko variantą
          <Typography sx={{ fontSize: 13, color: "text.secondary", fontWeight: 400, mt: .3 }}>
            Poreikis paimtas iš pamainų nustatymų (reikia / daugiausia pagal savaitės dienas). Pasirinktą variantą galėsite koreguoti langeliuose.
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {variants.length > 0 && variants.every((v) => (v.stats?.coverage?.short_total || 0) > 0) && (() => {
            const c = variants[0].stats.coverage;
            return (
              <Alert severity="warning" sx={{ mb: 1.5, borderRadius: 2 }}>
                <b>Darbuotojų per mažai poreikiui:</b> reikia {c.needed} pamainų, o turimi darbuotojai, neviršydami normų ir taisyklių,
                gali padengti tik {c.filled}. Todėl visi variantai panašūs. Sumažinkite poreikį pamainų nustatymuose arba pridėkite darbuotojų.
              </Alert>
            );
          })()}
          {variants.length === 1 && (
            <Alert severity="info" sx={{ mb: 1.5, borderRadius: 2 }}>Rastas tik vienas tinkamas variantas – kitų, pakankamai besiskiriančių, nėra.</Alert>
          )}
          <Stack direction={{ xs: "column", md: "row" }} gap={1.5} sx={{ pt: .5 }}>
            {variants.map((v) => {
              const st = v.stats || {};
              const cov = st.coverage || {};
              const hrs = st.hours || {};
              const unmet = v.unmet || [];
              const best = v.index === bestVariant;
              const line = (ok, title, detail) => (
                <Stack direction="row" gap={1} alignItems="flex-start" sx={{ py: .75, borderTop: "1px solid #F2F4F7" }}>
                  {ok ? <CheckIcon sx={{ fontSize: 17, color: "success.main", mt: "1px" }} /> : <WarningAmberIcon sx={{ fontSize: 17, color: "warning.main", mt: "1px" }} />}
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 650 }}>{title}</Typography>
                    {detail && <Typography sx={{ fontSize: 11.5, color: "text.secondary", mt: .2 }}>{detail}</Typography>}
                  </Box>
                </Stack>
              );
              return (
                <Paper key={v.index} variant="outlined" sx={{ p: 2, flex: 1, borderRadius: 2.5, minWidth: 0, display: "flex", flexDirection: "column",
                  borderColor: best ? "primary.main" : "#E4E7EC", borderWidth: best ? 2 : 1 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                    <Typography sx={{ fontWeight: 800, fontSize: 16 }}>Variantas {v.index + 1}</Typography>
                    {best && <Chip size="small" color="primary" label="Rekomenduojamas" sx={{ fontWeight: 700 }} />}
                  </Stack>
                  {line(!cov.short_total, cov.needed ? `Poreikis padengtas: ${cov.filled} iš ${cov.needed} pamainų` : "Poreikis nenurodytas",
                    cov.short_total ? `Trūksta darbuotojų: ${(cov.short_days || []).slice(0, 6).map((d) => d.slice(5)).join(", ")}${(cov.short_days || []).length > 6 ? "…" : ""}` : null)}
                  {line(!hrs.over && !hrs.under, !hrs.over && !hrs.under ? "Valandos atitinka normas (±4 val.)"
                      : `Nukrypimai nuo normos: ${hrs.over ? `${hrs.over} viršija` : ""}${hrs.over && hrs.under ? ", " : ""}${hrs.under ? `${hrs.under} trūksta` : ""}`,
                    (hrs.worst || []).length ? hrs.worst.map((w) => `${w.employee} ${w.diff > 0 ? "+" : ""}${String(w.diff).replace(".", ",")} val.`).join(" · ") : null)}
                  {line(!unmet.length, unmet.length ? `Neįvykdytos taisyklės: ${unmet.length}` : "Visos taisyklės įvykdytos",
                    unmet.length ? unmet.slice(0, 3).map((u) => `${u.label} (${(u.dates || []).slice(0, 3).map((d) => d.slice(8)).join(", ")}${(u.dates || []).length > 3 ? "…" : ""} d.)`).join(" · ") : null)}
                  {line(true, `Savaitgalio pamainų vienam: ${st.weekends ? `${st.weekends.min}–${st.weekends.max}` : "–"}`,
                    `Daugiausiai naktinių vienam: ${st.nights_max ?? 0}`)}
                  {v.diff && (
                    <Box sx={{ mt: .75, p: 1, borderRadius: 1.5, bgcolor: "#F5F8FF", border: "1px solid #E0E7FF" }}>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "#1D4ED8" }}>
                        Skiriasi nuo 1 varianto: {v.diff.cells} {v.diff.cells === 1 ? "langelis" : "langeliai"}
                      </Typography>
                      {(v.diff.people || []).length > 0 && (
                        <Typography sx={{ fontSize: 11.5, color: "text.secondary", mt: .2 }}>
                          {v.diff.people.map((x) => `${x.name} (${x.n})`).join(" · ")}
                        </Typography>
                      )}
                    </Box>
                  )}
                  <Box sx={{ flex: 1 }} />
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mt={1.5}>
                    <Typography sx={{ fontSize: 12, color: "text.secondary" }}>DU kaina ~{eur(v.cost)}</Typography>
                    <Button variant={best ? "contained" : "outlined"} disableElevation size="small" disabled={busy || locked}
                      onClick={() => { setVariantsOpen(false); act({ action: "apply", index: v.index }, "Variantas pritaikytas — galite koreguoti langelius"); }}
                      sx={{ textTransform: "none", fontWeight: 700, borderRadius: 1.5 }}>
                      Pasirinkti
                    </Button>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setVariantsOpen(false)}>Uždaryti</Button></DialogActions>
      </Dialog>

      <Dialog open={noticesOpen} onClose={() => setNoticesOpen(false)} maxWidth="md" fullWidth disableScrollLock>
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, pr: 1.5 }}>
          <Typography component="span" sx={{ fontSize: 19, fontWeight: 800, lineHeight: 1.4 }}>
            Sudaryto grafiko įspėjimai ir klaidos
          </Typography>
          <IconButton aria-label="Uždaryti" size="small" onClick={() => setNoticesOpen(false)} sx={{ color: "text.secondary", flexShrink: 0 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ px: { xs: 2, sm: 3 } }}>
          <Stack gap={1.1} py={.5}>
            {(data.absence_conflicts || []).length > 0 && (
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, borderColor: "#FEC84B", bgcolor: "#FFFCF5" }}>
                <Stack direction={{ xs: "column", sm: "row" }} gap={1.25} alignItems={{ sm: "center" }}>
                  <Typography sx={{ fontSize: 13, flex: 1 }}>
                    <b>{data.absence_conflicts.length} pamain. perbrauktos dėl nebuvimų.</b>{" "}
                    {!data.version ? "Pašalinus jos bus įsimintos – ištrynus nebuvimą grąžinamos automatiškai."
                      : published ? "Atrakinkite grafiką, paskirkite pakaitinius ir paskelbkite iš naujo."
                        : "Paskirkite pakaitinius. Ištrynus nebuvimą pamaina vėl galios."}
                  </Typography>
                  {!data.version ? (
                    <Button size="small" variant="outlined" onClick={() => { setNoticesOpen(false); act({ action: "remove_absence_shifts" }); }}
                      sx={{ textTransform: "none", fontWeight: 700, whiteSpace: "nowrap" }}>Pašalinti šias pamainas</Button>
                  ) : published ? (
                    <Button size="small" variant="outlined" startIcon={<LockOpenIcon />}
                      onClick={() => { setNoticesOpen(false); setUnlockDlg({ reason: "illness", comment: "" }); }}
                      sx={{ textTransform: "none", fontWeight: 700, whiteSpace: "nowrap" }}>Atrakinti</Button>
                  ) : null}
                </Stack>
              </Paper>
            )}
            {notices.map((notice, index) => (
              <Alert
                key={index}
                severity={notice.kind === "error" ? "error" : notice.kind === "warning" ? "warning" : "info"}
                sx={{ borderRadius: 1.7, alignItems: "center", ".MuiAlert-message": { width: "100%", py: .5 } }}
              >
                <Stack gap={.4}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.5, color: "inherit" }}>{notice.message}</Typography>
                  {notice.dates.length > 0 && (
                    <Typography sx={{ fontSize: 12, lineHeight: 1.4, color: "inherit", opacity: .9 }}>
                      Datos: {notice.dates.map((date) => date.slice(8)).join(", ")} d.
                    </Typography>
                  )}
                  {notice.people.length > 0 && (
                    <Typography sx={{ fontSize: 12, lineHeight: 1.4, color: "inherit", opacity: .9 }}>
                      Darbuotojai: {notice.people.join(", ")}
                    </Typography>
                  )}
                </Stack>
              </Alert>
            ))}
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} maxWidth="sm" fullWidth disableScrollLock>
        <DialogTitle sx={{ fontWeight: 800 }}>Pakeitimų istorija</DialogTitle>
        <DialogContent dividers>
          {(data.history || []).map((h) => (
            <Box key={h.version} sx={{ mb: 2 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 13.5 }}>
                v{h.version} · {String(h.at).slice(0, 16).replace("T", " ")} · {h.reason}{h.by ? ` · ${h.by}` : ""}
              </Typography>
              {(h.items || []).map((it, i) => (
                <Typography key={i} color={it.late ? "warning.main" : "text.secondary"} sx={{ fontSize: 12.5, mt: .3 }}>
                  {it.date} · {it.employee}: {it.change}{it.late ? " (įspėta vėliau nei prieš 2 d. d.)" : ""}
                </Typography>
              ))}
            </Box>
          ))}
        </DialogContent>
        <DialogActions><Button onClick={() => setHistoryOpen(false)}>Uždaryti</Button></DialogActions>
      </Dialog>

      <Dialog open={!!unlockDlg} onClose={() => setUnlockDlg(null)} fullWidth maxWidth="xs" disableScrollLock>
        <DialogTitle>Kodėl keičiamas paskelbtas grafikas?</DialogTitle>
        <DialogContent>
          {unlockDlg && (
            <Stack gap={1.5} mt={1}>
              {Object.entries(data.reasons || {}).map(([k, v]) => (
                <Paper key={k} variant="outlined" onClick={() => setUnlockDlg({ ...unlockDlg, reason: k })}
                  sx={{ p: 1.5, cursor: "pointer", borderColor: unlockDlg.reason === k ? "primary.main" : "divider", bgcolor: unlockDlg.reason === k ? "action.selected" : undefined }}>
                  <Typography fontSize={14}>{v}</Typography>
                </Paper>
              ))}
              <TextField label="Komentaras (nebūtina)" value={unlockDlg.comment} onChange={(e) => setUnlockDlg({ ...unlockDlg, comment: e.target.value })} />

              <Typography variant="caption" color="text.secondary">
                Pagal DK paskelbtas grafikas keičiamas tik dėl nuo darbdavio nepriklausančių priežasčių, įspėjus darbuotoją
                ne vėliau kaip prieš 2 jo darbo dienas. Priežastis įrašoma į pakeitimų istoriją.
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setUnlockDlg(null)}>Atšaukti</Button>
          <Button variant="contained" onClick={() => { act({ action: "unlock", reason: unlockDlg.reason, comment: unlockDlg.comment }); setUnlockDlg(null); }}>Atrakinti</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!lawDlg} onClose={() => setLawDlg(null)} fullWidth maxWidth="sm" disableScrollLock>
        <DialogTitle>Grafike yra Darbo kodekso pažeidimų</DialogTitle>
        <DialogContent>
          {(lawDlg || []).map((v, i) => (
            <Typography key={i} variant="body2">• {v.employee || v.employee_id} – {v.message}</Typography>
          ))}
          <Alert severity="error" sx={{ mt: 2 }}>
            Rekomenduojame pataisyti grafiką (raudonai pažymėti langeliai). Paskelbus su pažeidimais, atsakomybė tenka darbdaviui.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button variant="contained" onClick={() => setLawDlg(null)}>Grįžti ir taisyti</Button>
          <Button color="error" onClick={() => { setLawDlg(null); act({ action: "publish", confirm_violations: true }, editing ? "Pakeitimai paskelbti" : "Grafikas paskelbtas darbuotojams"); }}>
            Vis tiek paskelbti
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!lateDlg} onClose={() => setLateDlg(null)} fullWidth maxWidth="sm" disableScrollLock>
        <DialogTitle>Įspėjama vėliau nei prieš 2 darbo dienas</DialogTitle>
        <DialogContent>
          <Typography variant="body2" mb={1}>Šie pakeitimai įsigalioja greičiau nei po 2 darbuotojo darbo dienų:</Typography>
          {(lateDlg || []).map((x, i) => (
            <Typography key={i} variant="body2">• {data.employees.find((e) => e.id === x.employee_id)?.name || x.employee_id} - {x.date}</Typography>
          ))}
          <Alert severity="warning" sx={{ mt: 2 }}>Tęskite tik jei darbuotojai su pakeitimu sutinka (pvz. patys paprašė). Tai bus pažymėta istorijoje.</Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setLateDlg(null)}>Grįžti</Button>
          <Button variant="contained" color="warning" onClick={() => { setLateDlg(null); act({ action: "publish", confirm_late: true, confirm_violations: true }, "Pakeitimai paskelbti"); }}>Darbuotojai sutinka - paskelbti</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!sugg} onClose={() => setSugg(null)} fullWidth maxWidth="sm" disableScrollLock>
        <DialogTitle>{sugg?.from ? "Pakaitinis darbuotojas" : "Kas galėtų dirbti"} · {sugg?.date} · {types.find((t) => t.id === sugg?.shift_type_id)?.name}</DialogTitle>
        <DialogContent>
          {sugg && sugg.items.length === 0 && <Alert severity="info">Laisvų darbuotojų, kurie nepažeistų DK ir būtinų taisyklių, nėra.</Alert>}
          <Stack gap={1}>
            {sugg?.items.map((c) => (
              <Paper key={c.employee_id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" alignItems="center" gap={1.5}>
                  <Box flex={1}>
                    <Typography fontWeight={600}>{c.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {hrs(c.hours)} / {hrs(c.target)} · po pakeitimo {Number(c.after_diff) > 0 ? `+${Math.round(c.after_diff)} val. virš normos` : `${Math.round(c.after_diff)} val. iki normos`}
                    </Typography>
                    {c.warnings.map((w) => <Typography key={w} variant="caption" color="warning.main" display="block">⚠ {w}</Typography>)}
                  </Box>
                  <Button size="small" variant="contained" onClick={() => {
                    act({ action: "replace", date: sugg.date, shift_type_id: sugg.shift_type_id, to_employee_id: c.employee_id, from_employee_id: sugg.from },
                      "Pamaina perkelta - nepamirškite paskelbti pakeitimų");
                    setSugg(null);
                  }}>Paskirti</Button>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setSugg(null)}>Uždaryti</Button></DialogActions>
      </Dialog>

      <Menu open={Boolean(genMenu)} anchorEl={genMenu} onClose={() => setGenMenu(null)} disableScrollLock
        PaperProps={{ sx: { borderRadius: 2, border: "1px solid #EAECF0", boxShadow: "0 12px 32px rgba(16,24,40,.12)", maxWidth: 380 } }}>
        {(() => {
          const per = data.period || [];
          const mn = (ym) => MONTHS[Number(ym.slice(5)) - 1].toLowerCase();
          const todo = per.filter((x) => x.state === "todo");
          const skipped = per.filter((x) => x.state !== "todo");
          return [
            <MenuItem key="m" onClick={() => { setGenMenu(null); startGenerate("generate"); }} sx={{ py: 1.1, alignItems: "flex-start", whiteSpace: "normal" }}>
              <Box>
                <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>Šiam mėnesiui ({mn(`${year}-${String(month).padStart(2, "0")}`)})</Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Bus pasiūlyti keli variantai – pasirinksite patys.</Typography>
              </Box>
            </MenuItem>,
            <MenuItem key="p" onClick={() => { setGenMenu(null); setPeriodDlg(true); }} sx={{ py: 1.1, alignItems: "flex-start", whiteSpace: "normal" }}>
              <Box>
                <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>
                  Visam apskaitiniam laikotarpiui ({mn(per[0].ym)}–{mn(per[per.length - 1].ym)})…
                </Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                  Bus sudaryti: {todo.map((x) => mn(x.ym)).join(", ")}
                  {skipped.length > 0 && ` · nekeičiami: ${skipped.map((x) => mn(x.ym)).join(", ")}`}. Prieš pradedant parodysime detaliau.
                </Typography>
              </Box>
            </MenuItem>,
          ];
        })()}
      </Menu>
      <PeriodGenerateDialog open={periodDlg} period={data.period} onClose={() => setPeriodDlg(false)}
        onConfirm={() => { setPeriodDlg(false); startGenerate("generate_period"); }} />
      <Menu open={Boolean(planMenu)} anchorEl={planMenu} onClose={() => setPlanMenu(null)} disableScrollLock>
        {(data.history || []).length > 0 && (
          <MenuItem onClick={() => { setPlanMenu(null); setHistoryOpen(true); }}>Pakeitimų istorija</MenuItem>
        )}
        {(data.history || []).length > 0 && <Divider />}
        <MenuItem disabled={busy || locked || !(data.plan_months || []).length} onClick={() => { setPlanMenu(null); setCopyFrom((data.plan_months || [])[0] || ""); }}>
          Kopijuoti poreikį iš kito mėnesio…
        </MenuItem>
        <MenuItem onClick={() => { const anchor = planMenu; setPlanMenu(null); setTplMenu(anchor); }}>
          Poreikio šablonai…
        </MenuItem>
        <MenuItem disabled={busy || locked} onClick={() => { setPlanMenu(null); act({ action: "plan_from_rules" }, "Poreikis atstatytas pagal pamainų nustatymus (rankiniai pakeitimai palikti)"); }}>
          Atstatyti poreikį pagal pamainų nustatymus
        </MenuItem>
        <Divider />
        <MenuItem disabled={busy || locked || !(data.shifts || []).length} sx={{ color: "error.main" }}
          onClick={() => { setPlanMenu(null); if (window.confirm("Išvalyti grafiką? Bus pašalintos visos šio mėnesio pamainos (poreikis liks).")) act({ action: "clear_shifts" }, "Grafikas išvalytas"); }}>
          Išvalyti grafiką
        </MenuItem>
        <MenuItem disabled={busy || locked} sx={{ color: "error.main" }}
          onClick={() => { setPlanMenu(null); if (window.confirm("Išvalyti darbuotojų poreikį? Bus pašalinti ir rankiniai dienų pakeitimai. Sudarant grafiką poreikis vėl bus paimtas iš pamainų nustatymų.")) act({ action: "clear_plan" }, "Darbuotojų poreikis išvalytas"); }}>
          Išvalyti darbuotojų poreikį
        </MenuItem>
      </Menu>

      <Menu open={!!tplMenu} anchorEl={tplMenu} onClose={() => setTplMenu(null)} disableScrollLock>
        {(data.templates || []).map((t) => (
          <MenuItem key={t.id} onClick={() => { setTplMenu(null); act({ action: "template_apply", template_id: t.id }, `Šablonas „${t.name}“ pritaikytas visam mėnesiui`); }}>
            Pritaikyti visam mėnesiui: {t.name}
          </MenuItem>
        ))}
        {(data.templates || []).length > 0 && <Divider />}
        <MenuItem onClick={() => { setTplMenu(null); setTplDlg({ name: "", week_start: mondays[0] || "" }); }}>Išsaugoti savaitę kaip šabloną…</MenuItem>
      </Menu>

      <Dialog open={!!tplDlg} onClose={() => setTplDlg(null)} fullWidth maxWidth="xs" disableScrollLock>
        <DialogTitle>Savaitės šablonas</DialogTitle>
        <DialogContent>
          {tplDlg && (
            <Stack gap={2} mt={1}>
              <TextField label="Pavadinimas" value={tplDlg.name} onChange={(e) => setTplDlg({ ...tplDlg, name: e.target.value })} placeholder="pvz. Įprasta savaitė" />
              <TextField select label="Savaitė (nuo pirmadienio)" value={tplDlg.week_start} onChange={(e) => setTplDlg({ ...tplDlg, week_start: e.target.value })}
                SelectProps={{ MenuProps: { disableScrollLock: true } }}>
                {mondays.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </TextField>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setTplDlg(null)}>Atšaukti</Button>
          <Button variant="contained" disabled={!tplDlg?.week_start}
            onClick={() => { act({ action: "template_save", name: tplDlg.name, week_start: tplDlg.week_start }, "Šablonas išsaugotas"); setTplDlg(null); }}>Išsaugoti</Button>
        </DialogActions>
      </Dialog>

      <Popover open={!!slotPop} anchorEl={slotPop?.anchor} onClose={() => setSlotPop(null)} disableScrollLock
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }} transformOrigin={{ vertical: "top", horizontal: "center" }}>
        {slotPop && (
          <Stack gap={1.5} sx={{ p: 2, width: 230 }}>
            <Typography fontWeight={700} fontSize={14}>
              {slotPop.date} · {types.find((t) => t.id === slotPop.shift_type_id)?.name}
            </Typography>
            <Stack direction="row" gap={1}>
              <TextField size="small" type="number" label="Reikia nuo" value={slotPop.min} onChange={(e) => setSlotPop({ ...slotPop, min: e.target.value })} inputProps={{ min: 0 }} />
              <TextField size="small" type="number" label="iki" value={slotPop.max} onChange={(e) => setSlotPop({ ...slotPop, max: e.target.value })} inputProps={{ min: 0 }} />
            </Stack>
            {slotPop.short && (
              <Button size="small" variant="outlined" onClick={() => { openSuggest(slotPop.date, slotPop.shift_type_id, null); setSlotPop(null); }}>
                Siūlyti darbuotojų
              </Button>
            )}
            <Stack direction="row" gap={1}>
              <Button size="small" color="error" onClick={() => { act({ action: "slot", date: slotPop.date, shift_type_id: slotPop.shift_type_id, min: 0 }); setSlotPop(null); }}>Pašalinti</Button>
              <Box flex={1} />
              <Button size="small" variant="contained" onClick={() => { act({ action: "slot", date: slotPop.date, shift_type_id: slotPop.shift_type_id, min: Number(slotPop.min || 0), max: slotPop.max === "" ? null : Number(slotPop.max) }); setSlotPop(null); }}>Išsaugoti</Button>
            </Stack>
          </Stack>
        )}
      </Popover>

      <Menu open={!!menu} anchorEl={menu?.anchor} onClose={() => setMenu(null)} disableScrollLock
        MenuListProps={{ dense: true, sx: { minWidth: 270 } }}>
        {(() => {
          if (!menu) return null;
          const m = menu;
          const blocking = m.absence && !WITH_SHIFT.has(m.absence.raw);
          const items = [];
          if (!m.lockedOnly && !blocking && !m.fixed) {
            items.push(<ListSubheader key="h-s" sx={{ lineHeight: "30px", fontWeight: 800 }}>Pamaina</ListSubheader>);
            types.forEach((t) => items.push(
              <MenuItem key={`t${t.id}`} selected={m.shift?.shift_type_id === t.id}
                onClick={() => { act({ action: "cell", employee_id: m.emp.id, date: m.date, shift_type_id: t.id }); setMenu(null); }}>
                <ListItemIcon><Box sx={{ width: 26, height: 18, borderRadius: .6, bgcolor: color(t.id), color: shiftText(color(t.id)),
                  fontSize: 9.5, fontWeight: 800, display: "grid", placeItems: "center" }}>{t.code}</Box></ListItemIcon>
                {t.name} ({t.start}–{t.end})
              </MenuItem>));
            items.push(
              <MenuItem key="free" onClick={() => { act({ action: "cell", employee_id: m.emp.id, date: m.date, shift_type_id: null }); setMenu(null); }}>
                <ListItemIcon><Box sx={{ width: 26, height: 18, borderRadius: .6, border: "1px solid #D0D5DD" }} /></ListItemIcon>
                Laisva diena
              </MenuItem>);
          }
          if (!m.lockedOnly) {
            if (items.length) items.push(<Divider key="d1" />);
            items.push(<ListSubheader key="h-a" sx={{ lineHeight: "30px", fontWeight: 800 }}>Nebuvimas</ListSubheader>);
            if (m.absence && m.absence.raw === "business_trip") {
              items.push(
                <MenuItem key="trip" onClick={() => { setMenu(null); window.location.assign(`/grafikai-ir-tabeliai/komandiruotes?m=${year}-${String(month).padStart(2, "0")}`); }}>
                  <ListItemIcon><FlightTakeoffIcon fontSize="small" sx={{ color: "#1E3A6E" }} /></ListItemIcon>
                  Atidaryti komandiruotę
                </MenuItem>);
              items.push(
                <MenuItem key="trip-info" disabled sx={{ whiteSpace: "normal", maxWidth: 280, fontSize: 12 }}>
                  Komandiruotė keičiama ar atšaukiama skiltyje „Komandiruotės“.
                </MenuItem>);
            } else if (m.absence) {
              items.push(
                <MenuItem key="rm" onClick={async () => {
                  setMenu(null);
                  if (!m.absence.id) { setInfo("Šį nebuvimą pakeiskite darbuotojo kortelėje."); return; }
                  const range = m.absence.start !== m.absence.end ? ` (${m.absence.start} – ${m.absence.end})` : "";
                  if (!window.confirm(`Pašalinti nebuvimą „${m.absence.label}“${range}? Pasikeis tabelis ir DU.`)) return;
                  try { await payrollApi.deleteAbsence(m.absence.id); load(); } catch (err) { setError(apiError(err)); }
                }}>
                  <ListItemIcon><DeleteOutlineIcon fontSize="small" /></ListItemIcon>
                  Pašalinti – {m.absence.label}
                </MenuItem>);
            } else {
              ABSENCE_MENU.forEach(([kind, ui, range]) => {
                if (kind === "truancy" && !(m.past && (m.shift || m.fixedHours))) return;          // pravaikšta - tik praėjusiai pamainai
                const p = ABSENCE_KINDS[ui];
                const Icon = p.Icon;
                items.push(
                  <MenuItem key={`a-${kind}`} onClick={async () => {
                    setMenu(null);
                    if (range) { setAbsDlg({ emp: m.emp, date: m.date, kind, ui }); return; }
                    try {
                      await payrollApi.createAbsence({ employee: m.emp.id, kind, start_date: m.date, end_date: m.date, status: "approved" });
                      if (kind === "truancy") setInfo(`${m.emp.name}: pažymėta pravaikšta ${m.date}. Paruoštas 12-SD pranešimas Sodrai (skiltis „Deklaracijos“).`);
                      load();
                    } catch (err) { setError(apiError(err)); }
                  }}>
                    <ListItemIcon><Icon fontSize="small" sx={{ color: p.color }} /></ListItemIcon>
                    {p.label}{range ? "…" : ""}
                  </MenuItem>);
              });
            }
          }
          if (m.shift && !m.lockedOnly) {
            items.push(<Divider key="d2" />);
            items.push(
              <MenuItem key="sugg" onClick={() => { openSuggest(m.date, m.shift.shift_type_id, m.emp.id); setMenu(null); }}>
                Siūlyti pakaitinį darbuotoją
              </MenuItem>);
            items.push(
              <MenuItem key="lock" onClick={() => { act({ action: "cell", employee_id: m.emp.id, date: m.date, locked: !m.shift.locked }); setMenu(null); }}>
                <ListItemIcon>{m.shift.locked ? <LockOpenIcon fontSize="small" /> : <LockIcon fontSize="small" />}</ListItemIcon>
                {m.shift.locked ? "Atrakinti" : "Užrakinti (perplanuojant nekeisti)"}
              </MenuItem>);
          }
          return items;
        })()}
      </Menu>
      <AbsenceRangeDialog value={absDlg} onClose={() => setAbsDlg(null)} onSaved={() => { setAbsDlg(null); load(); }} />
    </Box>
  );
}

// ============================================================
// Taisyklės
// ============================================================

function useRefs() {
  const [refs, setRefs] = useState({ employees: [], positions: [], groups: [], tags: [], shifts: [] });
  useEffect(() => {
    Promise.all([
      payrollApi.employees({ status: "active" }), payrollApi.positions(), payrollApi.positionGroups(),
      payrollApi.tags(), payrollApi.shiftTypes(),
    ]).then(([e, p, g, t, s]) => setRefs({
      employees: list(e), positions: list(p), groups: list(g), tags: list(t), shifts: list(s),
    })).catch(() => {});
  }, []);
  return refs;
}

const TARGET_KEYS = [["employees", "Darbuotojai"], ["positions", "Pareigos"], ["position_groups", "Pareigų grupės"], ["tags", "Žymos"]];

function targetOptions(refs) {
  return [
    ...refs.employees.map((x) => ({ type: "employees", id: x.id, label: x.full_name || `${x.first_name} ${x.last_name}` })),
    ...refs.positions.map((x) => ({ type: "positions", id: x.id, label: x.name })),
    ...refs.groups.map((x) => ({ type: "position_groups", id: x.id, label: `${x.code} ${x.name}` })),
    ...refs.tags.map((x) => ({ type: "tags", id: x.id, label: x.name })),
  ];
}

const toTarget = (vals) => Object.fromEntries(TARGET_KEYS.map(([k]) => [k, vals.filter((v) => v.type === k).map((v) => v.id)]));
const fromTarget = (t, opts) => opts.filter((o) => (t?.[o.type] || []).includes(o.id));

function TargetPicker({ label, value, onChange, options }) {
  return (
    <Autocomplete multiple options={options} value={value} onChange={(_, v) => onChange(v)}
      groupBy={(o) => TARGET_KEYS.find(([k]) => k === o.type)[1]} getOptionLabel={(o) => o.label}
      isOptionEqualToValue={(a, b) => a.type === b.type && a.id === b.id}
      renderInput={(p) => <TextField {...p} label={label} placeholder="Darbuotojai, pareigos, grupės ar žymos" />}
      slotProps={{ popper: { disablePortal: false } }} />
  );
}

// ============================================================
// Taisyklės - sakiniai su įrašomais laukais
// ============================================================

const RULE_GROUP_UI = {
  load: { Icon: BedtimeOutlinedIcon, color: "#4F46E5", bg: "#EEF2FF", hint: "Kad darbuotojai nepervargtų" },
  availability: { Icon: EventAvailableOutlinedIcon, color: "#0E7490", bg: "#ECFEFF", hint: "Kas, kada ir kokias pamainas gali dirbti" },
  coverage: { Icon: GroupsOutlinedIcon, color: "#B45309", bg: "#FFFBEB", hint: "Kokių žmonių reikia pamainoje" },
  pairs: { Icon: PeopleAltOutlinedIcon, color: "#BE185D", bg: "#FDF2F8", hint: "Kas su kuo gali ar negali dirbti" },
  fairness: { Icon: BalanceOutlinedIcon, color: "#15803D", bg: "#F0FDF4", hint: "Tolygumas ir pageidavimai" },
};

// pavyzdžiai ir numatytos reikšmės katalogo kortelėms
const RULE_UI = {
  max_consecutive_nights: { ex: "pvz. ne daugiau 2 naktų, po jų 2 laisvos", def: { n: 2, rest: 2 } },
  max_consecutive_days: { ex: "pvz. ne daugiau 5 dienų iš eilės", def: { n: 5 } },
  no_day_after_night: { ex: "po nakties – poilsis" },
  free_weekends: { ex: "pvz. bent 1 laisvas savaitgalis per mėnesį", def: { n: 1 } },
  min_days_off_block: { ex: "pvz. laisvos dienos bent po 2", def: { n: 2 } },
  shifts_per_period: { ex: "pvz. 3–5 pamainos per savaitę", def: { per: "week", min: 3, max: 5 } },
  only_shifts: { ex: "pvz. studentai – tik vakarinės" },
  never_shifts: { ex: "pvz. Ona nedirba naktinių" },
  not_on_weekdays: { ex: "pvz. Jonas nedirba sekmadieniais" },
  only_on_weekdays: { ex: "pvz. tik savaitgaliais" },
  fixed_shift: { ex: "pvz. pirmadieniais visada RYT" },
  cycle: { ex: "pvz. 2 dirba / 2 ilsisi", def: { work: 2, rest: 2 } },
  unavailable: { ex: "pvz. egzaminų sesija" },
  at_least_of: { ex: "pvz. bent 1 vyr. kasininkas", def: { n: 1 } },
  at_most_of: { ex: "pvz. ne daugiau 1 naujoko", def: { n: 1 } },
  not_all_of: { ex: "pvz. ne visi vadovai vienu metu" },
  only_with_one_of: { ex: "pvz. naujokas – tik su patyrusiu" },
  never_together: { ex: "pvz. du giminaičiai ne kartu" },
  always_together: { ex: "pvz. mokinys su mentoriumi" },
  no_two_of: { ex: "pvz. jokie du naujokai kartu" },
  balance_shifts: { ex: "naktys ir savaitgaliai po lygiai" },
  prefer_shifts: { ex: "pvz. Petrui – rytinės" },
};

const NUM_LABEL = { n: "skaičius", rest: "laisvos dienos", work: "darbo dienos", min: "nuo", max: "iki" };

function Pill({ children, onClick, empty, readOnly }) {
  return (
    <Box component={readOnly ? "span" : "button"} type={readOnly ? undefined : "button"} onClick={readOnly ? undefined : onClick}
      sx={{ appearance: "none", font: "inherit", display: "inline-flex", alignItems: "center", gap: .3, verticalAlign: "baseline",
        mx: .3, my: .25, px: 1, py: .15, borderRadius: 1.5, cursor: readOnly ? "default" : "pointer", lineHeight: 1.6,
        border: readOnly ? 0 : "1px solid", borderColor: empty ? "#FDA29B" : "#C7D7FE",
        bgcolor: readOnly ? "transparent" : empty ? "#FEF3F2" : "#EEF4FF",
        color: readOnly ? "#101828" : empty ? "#B42318" : "#1D4ED8", fontWeight: readOnly ? 750 : 700,
        "&:hover": readOnly ? {} : { borderColor: "#2563EB" } }}>
      {children}{!readOnly && <ExpandMoreIcon sx={{ fontSize: 15, opacity: .7 }} />}
    </Box>
  );
}

function tokens(template) {
  return String(template || "").split(/(\{\w+\})/g).filter(Boolean)
    .map((t) => (/^\{\w+\}$/.test(t) ? { key: t.slice(1, -1) } : { text: t }));
}

function RuleSentence({ meta, f, set, refs, opts, readOnly }) {
  const [pop, setPop] = useState(null); // {anchor, key}
  const P = f.params || {};
  const setP = (k, v) => set({ params: { ...P, [k]: v } });
  const targetLabel = (t) => {
    const sel = Array.isArray(t) ? t : fromTarget(t, opts);
    if (!sel.length) return "Visi darbuotojai";
    const s = sel.map((o) => o.label).join(", ");
    return s.length > 42 ? `${sel.length} pasirinkti` : s;
  };
  const shiftLabel = (ids) => (ids || []).length
    ? refs.shifts.filter((s) => ids.includes(s.id)).map((s) => s.code).join(", ") : "visos";
  const wdLabel = (w) => ((w || []).length ? [...w].sort().map((i) => WD[i]).join(", ") : "visos dienos");
  const open = (key) => (e) => setPop({ anchor: e.currentTarget, key });

  const render = (key) => {
    if (key === "target" || key === "target2") return <Pill readOnly={readOnly} onClick={open(key)}>{targetLabel(f[key])}</Pill>;
    if (key === "shifts") return <Pill readOnly={readOnly} onClick={open(key)}>{shiftLabel(P.shifts)}</Pill>;
    if (key === "weekdays") return <Pill readOnly={readOnly} onClick={open(key)}>{wdLabel(P.weekdays)}</Pill>;
    if (key === "per") {
      const v = P.per || "week";
      return readOnly ? <Pill readOnly>{v === "month" ? "mėnesį" : "savaitę"}</Pill>
        : <Pill onClick={() => setP("per", v === "month" ? "week" : "month")}>{v === "month" ? "mėnesį" : "savaitę"}</Pill>;
    }
    if (key === "date_from" || key === "date_to") {
      if (readOnly) return <Pill readOnly>{P[key] || "–"}</Pill>;
      return (
        <Box component="span" sx={{ display: "inline-block", verticalAlign: "middle", mx: .3, width: 150 }}>
          <LtDatePicker label="" value={P[key] || null} onChange={(v) => setP(key, v)} />
        </Box>
      );
    }
    const v = P[key];
    if (readOnly) return <Pill readOnly>{v ?? "–"}</Pill>;
    return (
      <Box component="input" type="text" inputMode="numeric" value={v ?? ""} aria-label={NUM_LABEL[key] || key}
        onChange={(e) => { const c = e.target.value.replace(/\D/g, ""); setP(key, c === "" ? "" : Number(c)); }}
        sx={{ width: 46, mx: .3, my: .25, px: .5, py: .3, textAlign: "center", font: "inherit", fontWeight: 800, color: "#1D4ED8",
          border: "1px solid", borderColor: v === "" || v == null ? "#FDA29B" : "#C7D7FE", borderRadius: 1.5,
          bgcolor: v === "" || v == null ? "#FEF3F2" : "#EEF4FF", outline: "none", "&:focus": { borderColor: "#2563EB" } }} />
    );
  };

  return (
    <>
      <Typography component="div" sx={{ fontSize: readOnly ? 13.5 : 15.5, lineHeight: readOnly ? 1.6 : 2.15, color: "#344054" }}>
        {tokens(meta?.template).map((t, i) => (t.text ? <span key={i}>{t.text}</span> : <span key={i}>{render(t.key)}</span>))}
      </Typography>
      <Popover open={!!pop} anchorEl={pop?.anchor} onClose={() => setPop(null)} disableScrollLock
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }} slotProps={{ paper: { sx: { p: 1.5, borderRadius: 2, width: 360 } } }}>
        {(pop?.key === "target" || pop?.key === "target2") && (
          <Stack gap={1}>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Tuščia – visi darbuotojai. Galima rinktis kelis.</Typography>
            <TargetPicker label={pop.key === "target2" ? "Su kuo" : "Kam taikoma"} value={f[pop.key] || []}
              onChange={(v) => set({ [pop.key]: v })} options={opts} />
          </Stack>
        )}
        {pop?.key === "shifts" && (
          <Stack gap={.75}>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Nepasirinkus – visos pamainos</Typography>
            <Stack direction="row" flexWrap="wrap" gap={.75}>
              {refs.shifts.map((s) => {
                const on = (P.shifts || []).includes(s.id);
                const c = shiftColor(s.color);
                return (
                  <Box key={s.id} component="button" type="button"
                    onClick={() => setP("shifts", on ? (P.shifts || []).filter((x) => x !== s.id) : [...(P.shifts || []), s.id])}
                    sx={{ appearance: "none", font: "inherit", cursor: "pointer", px: 1.1, py: .5, borderRadius: 1.5, fontSize: 12.5, fontWeight: 800,
                      border: on ? `2px solid ${shiftText(c)}` : "2px solid transparent", bgcolor: c, color: shiftText(c), opacity: on ? 1 : .55 }}>
                    {s.code} <Box component="span" sx={{ fontWeight: 600 }}>{s.name}</Box>
                  </Box>
                );
              })}
            </Stack>
          </Stack>
        )}
        {pop?.key === "weekdays" && (
          <Stack gap={.75}>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Nepasirinkus – visos dienos</Typography>
            <ToggleButtonGroup size="small" value={P.weekdays || []} onChange={(_, v) => setP("weekdays", v)} sx={{ display: "flex" }}>
              {WD.map((w, i) => <ToggleButton key={i} value={i} sx={{ flex: 1, fontWeight: 700 }}>{w}</ToggleButton>)}
            </ToggleButtonGroup>
          </Stack>
        )}
      </Popover>
    </>
  );
}

function StrengthToggle({ hard, onChange }) {
  return (
    <Stack direction="row" sx={{ p: .4, bgcolor: "#F2F4F7", borderRadius: 99, gap: .4, display: "inline-flex" }}>
      {[[true, "Privaloma", "Visada įvykdoma"], [false, "Pageidautina", "Jei įmanoma"]].map(([v, l, t]) => (
        <Tooltip key={l} title={t}>
          <Box component="button" type="button" onClick={() => onChange(v)}
            sx={{ appearance: "none", border: 0, font: "inherit", cursor: "pointer", px: 1.6, py: .55, borderRadius: 99, fontSize: 12.5,
              fontWeight: hard === v ? 800 : 600, bgcolor: hard === v ? "#FFFFFF" : "transparent",
              color: hard === v ? (v ? "#B42318" : "#B54708") : "#667085", boxShadow: hard === v ? "0 1px 3px rgba(16,24,40,.12)" : "none" }}>
            {l}
          </Box>
        </Tooltip>
      ))}
    </Stack>
  );
}

function RuleEditor({ open, onClose, onSaved, catalog, refs, rule }) {
  const opts = useMemo(() => targetOptions(refs), [refs]);
  const [kind, setKind] = useState(null);
  const [f, setF] = useState({});
  const [period, setPeriod] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setError("");
    setKind(rule?.kind || null);
    setPeriod(Boolean(rule?.valid_from || rule?.valid_to));
    setF(rule ? { ...rule, target: fromTarget(rule.target, opts), target2: fromTarget(rule.target2, opts), params: rule.params || {} }
      : { hard: true, weight: 3, is_active: true, target: [], target2: [], params: {} });
  }, [open, rule, opts]);
  const meta = catalog.rules.find((r) => r.kind === kind);
  const set = (patch) => setF((s) => ({ ...s, ...patch }));
  const choose = (k) => { setKind(k); setF((s) => ({ ...s, params: { ...(RULE_UI[k]?.def || {}) } })); };
  const missing = (meta?.params || []).filter((k) => ["n", "rest", "work", "min", "max", "date_from", "date_to"].includes(k)
    && (f.params?.[k] === "" || f.params?.[k] == null) && !(k === "min" && f.params?.max) && !(k === "max" && f.params?.min));
  const save = async () => {
    setBusy(true); setError("");
    try {
      await payrollApi.saveRule({ id: rule?.id, kind, hard: f.hard, weight: f.weight || 3, is_active: f.is_active !== false, note: f.note || "",
        valid_from: period ? f.valid_from || null : null, valid_to: period ? f.valid_to || null : null,
        target: toTarget(f.target || []), target2: toTarget(f.target2 || []), params: f.params });
      onSaved(); onClose();
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth={kind ? "sm" : "md"} disableScrollLock>
      <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
        {kind ? meta?.label : "Pridėti taisyklę"}
        {!kind && <Typography sx={{ fontSize: 13, color: "text.secondary", fontWeight: 400, mt: .3 }}>Pasirinkite, ką norite nustatyti</Typography>}
      </DialogTitle>
      <DialogContent dividers sx={{ bgcolor: kind ? "#FFFFFF" : "#FAFBFC" }}>
        {!kind ? (
          <Stack gap={2.5}>
            {catalog.groups.map((g) => {
              const ui = RULE_GROUP_UI[g.key] || {};
              const GIcon = ui.Icon || AssignmentOutlinedIcon;
              return (
                <Box key={g.key}>
                  <Stack direction="row" alignItems="center" gap={1} mb={1}>
                    <Box sx={{ width: 28, height: 28, borderRadius: 1.5, display: "grid", placeItems: "center", bgcolor: ui.bg, color: ui.color }}>
                      <GIcon sx={{ fontSize: 18 }} />
                    </Box>
                    <Typography sx={{ fontWeight: 800, fontSize: 14.5 }}>{g.label}</Typography>
                    <Typography sx={{ fontSize: 12, color: "text.secondary" }}>· {ui.hint}</Typography>
                  </Stack>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" }, gap: 1 }}>
                    {catalog.rules.filter((r) => r.group === g.key).map((r) => (
                      <Paper key={r.kind} variant="outlined" onClick={() => choose(r.kind)}
                        sx={{ p: 1.4, cursor: "pointer", borderRadius: 2, transition: "all .12s",
                          "&:hover": { borderColor: ui.color, boxShadow: "0 4px 14px rgba(16,24,40,.08)", transform: "translateY(-1px)" } }}>
                        <Typography sx={{ fontWeight: 750, fontSize: 13.5 }}>{r.label}</Typography>
                        <Typography sx={{ fontSize: 12, color: "text.secondary", mt: .3 }}>{RULE_UI[r.kind]?.ex || ""}</Typography>
                      </Paper>
                    ))}
                  </Box>
                </Box>
              );
            })}
          </Stack>
        ) : (
          <Stack gap={2.5}>
            <Box sx={{ p: 2, borderRadius: 2, bgcolor: "#F8FAFF", border: "1px solid #E0E7FF" }}>
              <RuleSentence meta={meta} f={f} set={set} refs={refs} opts={opts} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "#475467", mb: .75 }}>Kaip griežtai</Typography>
              <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap">
                <StrengthToggle hard={!!f.hard} onChange={(v) => set({ hard: v })} />
                {!f.hard && (
                  <Stack direction="row" alignItems="center" gap={1.5} sx={{ minWidth: 220 }}>
                    <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Svarba</Typography>
                    <Slider size="small" min={1} max={5} step={1} marks value={f.weight || 3} onChange={(_, v) => set({ weight: v })} sx={{ flex: 1 }} />
                  </Stack>
                )}
              </Stack>
              <Typography sx={{ fontSize: 11.5, color: "text.secondary", mt: .6 }}>
                {f.hard ? "Grafikas visada sudaromas taip, kad taisyklė būtų įvykdyta." : "Programa stengsis įvykdyti, bet gali nukrypti, jei kitaip grafiko nesudaryti."}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "#475467", mb: .75 }}>Galioja</Typography>
              <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
                <ToggleButtonGroup exclusive size="small" value={period ? "period" : "always"} onChange={(_, v) => v && setPeriod(v === "period")}>
                  <ToggleButton value="always" sx={{ textTransform: "none", fontWeight: 700, px: 1.5 }}>Visada</ToggleButton>
                  <ToggleButton value="period" sx={{ textTransform: "none", fontWeight: 700, px: 1.5 }}>Laikotarpiu</ToggleButton>
                </ToggleButtonGroup>
                {period && <>
                  <Box sx={{ width: 160 }}><LtDatePicker label="Nuo" value={f.valid_from || null} onChange={(v) => set({ valid_from: v })} /></Box>
                  <Box sx={{ width: 160 }}><LtDatePicker label="Iki" value={f.valid_to || null} onChange={(v) => set({ valid_to: v })} /></Box>
                </>}
              </Stack>
            </Box>
            <TextField size="small" label="Pastaba (nebūtina)" value={f.note || ""} onChange={(e) => set({ note: e.target.value })} />
            {missing.length > 0 && <Typography sx={{ fontSize: 12, color: "error.main" }}>Užpildykite raudonai pažymėtus laukus.</Typography>}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.75 }}>
        {kind && !rule && <Button startIcon={<ChevronLeftIcon />} onClick={() => setKind(null)} sx={{ textTransform: "none" }}>Kitos taisyklės</Button>}
        <Box flex={1} />
        <Button onClick={onClose} sx={{ textTransform: "none" }}>Atšaukti</Button>
        {kind && <Button variant="contained" disableElevation disabled={busy || missing.length > 0} onClick={save}
          sx={{ textTransform: "none", fontWeight: 700 }}>Išsaugoti</Button>}
      </DialogActions>
    </Dialog>
  );
}

function RulesTab() {
  const refs = useRefs();
  const opts = useMemo(() => targetOptions(refs), [refs]);
  const [catalog, setCatalog] = useState(null);
  const [rules, setRules] = useState(null);
  const [dlg, setDlg] = useState(null); // {rule}
  const [lawOpen, setLawOpen] = useState(false);
  const [menu, setMenu] = useState(null); // {anchor, rule}
  const [error, setError] = useState("");
  const load = useCallback(() => payrollApi.rules().then((r) => setRules(list(r))).catch((e) => setError(apiError(e))), []);
  useEffect(() => { payrollApi.rosterCatalog().then(setCatalog); load(); }, [load]);
  if (!catalog || rules === null) return <RulesSkeleton />;

  const toggle = async (r) => {
    setRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: !r.is_active } : x)));
    try { await payrollApi.saveRule({ id: r.id, is_active: !r.is_active }); } catch (e) { setError(apiError(e)); load(); }
  };
  const duplicate = async (r) => {
    const { id, label, ...rest } = r;
    try { await payrollApi.saveRule({ ...rest, is_active: false, note: `${r.note || ""} (kopija)`.trim() }); load(); } catch (e) { setError(apiError(e)); }
  };

  return (
    <Box sx={{ maxWidth: 980, mx: "auto" }}>
      <Paper variant="outlined" sx={{ px: 2, py: 1.25, borderRadius: 2.5, mb: 2, bgcolor: "#FAFBFC" }}>
        <Stack direction="row" alignItems="center" gap={1.25} flexWrap="wrap">
          <LockIcon sx={{ fontSize: 18, color: "#667085" }} />
          <Typography sx={{ fontSize: 13.5, fontWeight: 750 }}>Įstatymo reikalavimai taikomi visada</Typography>
          <Typography sx={{ fontSize: 12.5, color: "text.secondary", flex: 1, minWidth: 200 }} noWrap={!lawOpen}>
            {lawOpen ? "" : catalog.law.slice(0, 3).join(" · ")}
          </Typography>
          <Button size="small" onClick={() => setLawOpen(!lawOpen)} sx={{ textTransform: "none" }}>{lawOpen ? "Suskleisti" : "Plačiau"}</Button>
        </Stack>
        {lawOpen && <Stack component="ul" sx={{ m: 0, mt: 1, pl: 3 }} gap={.4}>
          {catalog.law.map((l) => <Typography component="li" key={l} sx={{ fontSize: 13, color: "#475467" }}>{l}</Typography>)}
        </Stack>}
      </Paper>

      <Stack direction="row" justifyContent="space-between" alignItems="flex-end" mb={1.5} gap={2} flexWrap="wrap">
        <Box>
          <Typography sx={{ fontSize: 17, fontWeight: 800 }}>Jūsų taisyklės</Typography>
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
            Nustatomos vieną kartą – kiekvieno mėnesio grafikas sudaromas jų laikantis.
          </Typography>
        </Box>
        <Button variant="contained" disableElevation startIcon={<AddIcon />} onClick={() => setDlg({ rule: null })}
          sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2 }}>Pridėti taisyklę</Button>
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError("")}>{error}</Alert>}

      {rules.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, textAlign: "center" }}>
          <Typography sx={{ fontWeight: 800, mb: .5 }}>Taisyklių dar nėra</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 2 }}>
            Dažniausiai pradedama nuo „Naktys iš eilės“ ir „Darbo dienos iš eilės“.
          </Typography>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setDlg({ rule: null })} sx={{ textTransform: "none", fontWeight: 700 }}>
            Pridėti pirmą taisyklę
          </Button>
        </Paper>
      ) : catalog.groups.map((g) => {
        const items = rules.filter((r) => catalog.rules.find((x) => x.kind === r.kind)?.group === g.key);
        if (!items.length) return null;
        const ui = RULE_GROUP_UI[g.key] || {};
        const GIcon = ui.Icon || AssignmentOutlinedIcon;
        return (
          <Box key={g.key} sx={{ mb: 2.25 }}>
            <Stack direction="row" alignItems="center" gap={1} mb={1}>
              <Box sx={{ width: 26, height: 26, borderRadius: 1.4, display: "grid", placeItems: "center", bgcolor: ui.bg, color: ui.color }}>
                <GIcon sx={{ fontSize: 17 }} />
              </Box>
              <Typography sx={{ fontWeight: 800, fontSize: 13.5, color: "#344054" }}>{g.label}</Typography>
              <Typography sx={{ fontSize: 12, color: "#98A2B3" }}>{items.length}</Typography>
            </Stack>
            <Stack gap={.85}>
              {items.map((r) => {
                const meta = catalog.rules.find((x) => x.kind === r.kind);
                return (
                  <Paper key={r.id} variant="outlined" sx={{ px: 1.75, py: 1.1, borderRadius: 2, borderLeft: `3px solid ${r.is_active ? ui.color : "#D0D5DD"}`,
                    opacity: r.is_active ? 1 : .6, transition: "opacity .15s" }}>
                    <Stack direction="row" alignItems="center" gap={1.5}>
                      <Switch size="small" checked={!!r.is_active} onChange={() => toggle(r)}
                        sx={{ "& .MuiSwitch-switchBase, & .MuiSwitch-thumb, & .MuiSwitch-track": { transitionDuration: "120ms" } }} />
                      <Box sx={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setDlg({ rule: r })}>
                        <RuleSentence meta={meta} f={{ ...r, target: fromTarget(r.target, opts), target2: fromTarget(r.target2, opts) }}
                          set={() => {}} refs={refs} opts={opts} readOnly />
                        <Typography sx={{ fontSize: 11.5, color: "#98A2B3", mt: .2 }}>
                          {meta?.label}{r.valid_from || r.valid_to ? ` · galioja ${r.valid_from || "…"} – ${r.valid_to || "…"}` : ""}{r.note ? ` · ${r.note}` : ""}
                        </Typography>
                      </Box>
                      <Chip size="small" label={r.hard ? "Privaloma" : "Pageidautina"} sx={{ fontWeight: 700, fontSize: 11,
                        bgcolor: r.hard ? "#FEF3F2" : "#FFFAEB", color: r.hard ? "#B42318" : "#B54708" }} />
                      <IconButton size="small" onClick={(e) => setMenu({ anchor: e.currentTarget, rule: r })}><MoreHorizIcon fontSize="small" /></IconButton>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          </Box>
        );
      })}

      <Menu open={!!menu} anchorEl={menu?.anchor} onClose={() => setMenu(null)} disableScrollLock>
        <MenuItem onClick={() => { const r = menu.rule; setMenu(null); setDlg({ rule: r }); }}>
          <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>Redaguoti
        </MenuItem>
        <MenuItem onClick={() => { const r = menu.rule; setMenu(null); duplicate(r); }}>
          <ListItemIcon><ContentCopyOutlinedIcon fontSize="small" /></ListItemIcon>Kopijuoti
        </MenuItem>
        <Divider />
        <MenuItem sx={{ color: "error.main" }} onClick={() => {
          const r = menu.rule; setMenu(null);
          if (window.confirm("Ištrinti taisyklę?")) payrollApi.deleteRule(r.id).then(load).catch((e) => setError(apiError(e)));
        }}>
          <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>Ištrinti
        </MenuItem>
      </Menu>
      <RuleEditor open={!!dlg} rule={dlg?.rule} onClose={() => setDlg(null)} onSaved={load} catalog={catalog} refs={refs} />
    </Box>
  );
}

// ============================================================
// Pamainos ir žymos
// ============================================================

function SetupTab() {
  const [types, setTypes] = useState([]);
  const [tags, setTags] = useState([]);
  const [dlg, setDlg] = useState(null);
  const [tagName, setTagName] = useState("");
  const [error, setError] = useState("");
  const [shiftSavingId, setShiftSavingId] = useState(null);
  const [shiftNotice, setShiftNotice] = useState("");
  const [shiftError, setShiftError] = useState("");
  const TAG_NAME_MAX = 24;
  const weekdayLabels = ["Pr", "An", "Tr", "Kt", "Pn", "Št", "Sk"];

  const normalizeDemand = (source) => {
    if (Array.isArray(source)) return weekdayLabels.map((_, i) => Number(source[i] ?? (i < 5 ? 1 : 0)));
    if (source && typeof source === "object") {
      return weekdayLabels.map((_, i) => Number(source[i] ?? source[String(i)] ?? (i < 5 ? 1 : 0)));
    }
    return weekdayLabels.map((_, i) => (i < 5 ? 1 : 0));
  };

  const normalizeMax = (source) => weekdayLabels.map((_, i) => {
    const v = Array.isArray(source) ? source[i] : undefined;
    return v === null || v === undefined || v === "" ? "" : Number(v);
  });
  const withDefaults = (shift) => {
    const need = normalizeDemand(shift?.default_staff_need_by_weekday || shift?.default_staff_need || shift?.weekday_staff_need);
    return {
      ...shift,
      break_minutes: shift?.break_minutes ?? 0,
      color: shiftColor(shift?.color) || PALETTE[0],
      default_staff_need_by_weekday: need,
      // naujai pamainai daugiausia = kiek reikia; esamai - kaip išsaugota (tuščia = be ribos)
      default_staff_max_by_weekday: shift?.id ? normalizeMax(shift?.default_staff_max_by_weekday) : [...need],
    };
  };

  const allUsedColors = new Set(types.map((t) => normalizedColor(t.color)));
  const usedColors = new Set(types.filter((t) => String(t.id) !== String(dlg?.id)).map((t) => normalizedColor(t.color)));
  const noFreeColors = PALETTE.every((color) => allUsedColors.has(normalizedColor(color)));
  const nameValid = Boolean(dlg && dlg.name?.trim().length >= 2 && dlg.name.trim().length <= SHIFT_NAME_MAX);
  const codeValid = Boolean(dlg && /^[A-ZĄČĘĖĮŠŲŪŽ0-9]{1,3}$/.test(dlg.code || ""));
  const breakValid = Boolean(dlg && /^(?:0|[1-9]\d*)$/.test(String(dlg.break_minutes)) && Number(dlg.break_minutes) <= 1440);
  const colorValid = Boolean(dlg && PALETTE.includes(normalizedColor(dlg.color)) && !usedColors.has(normalizedColor(dlg.color)));
  const maxValid = Boolean(dlg && weekdayLabels.every((_, i) => {
    const mx = dlg.default_staff_max_by_weekday?.[i];
    return mx === "" || mx === undefined || Number(mx) >= Number(dlg.default_staff_need_by_weekday?.[i] || 0);
  }));
  const canSaveShift = nameValid && codeValid && breakValid && time24(dlg?.start_time) && time24(dlg?.end_time) && colorValid && maxValid
    && (!dlg?.break_start || time24(dlg.break_start));
  const tagValid = tagName.trim().length >= 2 && tagName.trim().length <= TAG_NAME_MAX;

  const openNewShift = () => {
    const firstAvailable = PALETTE.find((color) => !allUsedColors.has(normalizedColor(color)));
    if (!firstAvailable) return;
    setError("");
    setDlg(withDefaults({ name: "", code: "", start_time: "07:00", end_time: "19:00", break_minutes: 0, color: firstAvailable }));
  };

  const updateTime = (field, raw) => {
    const value = raw.replace(/[^0-9:]/g, "").slice(0, 5);
    setDlg((current) => ({ ...current, [field]: value }));
  };

  const updateDemand = (index, value, field = "default_staff_need_by_weekday") => {
    const cleaned = String(value).replace(/\D/g, "");
    setDlg((current) => {
      const next = [...(current?.[field] || [])];
      next[index] = cleaned === "" ? "" : Number(cleaned);
      return { ...current, [field]: next };
    });
  };

  const demandSummary = (shift) => {
    const values = normalizeDemand(shift?.default_staff_need_by_weekday || shift?.default_staff_need || shift?.weekday_staff_need);
    const max = normalizeMax(shift?.default_staff_max_by_weekday);
    return weekdayLabels.map((label, i) => {
      const mx = max[i];
      const v = mx === "" ? (values[i] ? `${values[i]}+` : "0") : mx === values[i] ? `${values[i]}` : `${values[i]}–${mx}`;
      return `${label} ${v}`;
    }).join(" · ");
  };

  const load = () => {
    payrollApi.shiftTypes().then((r) => setTypes(list(r)));
    payrollApi.tags().then((r) => setTags(list(r)));
  };
  useEffect(load, []);

  const save = async () => {
    if (!canSaveShift) {
      setError("Patikrinkite pavadinimą, trumpinį, laiką, pertrauką ir pasirinktą spalvą.");
      return;
    }
    setError("");
    try {
      await payrollApi.saveShiftType({
        ...dlg,
        name: dlg.name.trim(),
        color: normalizedColor(dlg.color),
        break_minutes: Number(dlg.break_minutes),
        break_start: Number(dlg.break_minutes) > 0 && dlg.break_start ? String(dlg.break_start).slice(0, 5) : null,
        break_paid: Number(dlg.break_minutes) > 0 ? Boolean(dlg.break_paid) : false,
        default_staff_need_by_weekday: normalizeDemand(dlg.default_staff_need_by_weekday),
        default_staff_max_by_weekday: normalizeMax(dlg.default_staff_max_by_weekday).map((v) => (v === "" ? null : v)),
      });
      setDlg(null);
      load();
    } catch (e) { setError(apiError(e)); }
  };

  // Statusas privalo būti saugomas API. Netriname pamainos ir nekeičiame senų grafikų.
  const toggleShiftActive = async (shift, nextActive) => {
    if (shiftSavingId === shift.id) return;
    setShiftSavingId(shift.id);
    setShiftError("");
    setShiftNotice("");
    setTypes((prev) => prev.map((t) => (t.id === shift.id ? { ...t, is_active: nextActive } : t)));   // iškart, be perkrovimo
    try {
      const saved = await payrollApi.saveShiftType({ id: shift.id, is_active: nextActive });
      if (saved && saved.id) setTypes((prev) => prev.map((t) => (t.id === saved.id ? { ...t, ...saved } : t)));
      if (!nextActive) {
        setShiftNotice(`Pamaina „${shift.name}“ išjungta. Ji nebus naudojama naujiems grafikams. Anksčiau grafikuose priskirtos šios pamainos išlieka ir nėra ištrinamos.`);
      }
    } catch (e) {
      setShiftError(e?.response ? apiError(e) : (e?.message || "Nepavyko pakeisti pamainos būsenos."));
      payrollApi.shiftTypes().then((result) => setTypes(list(result))).catch(() => {});
    } finally {
      setShiftSavingId(null);
    }
  };

  const createTag = async () => {
    if (!tagValid) return;
    try {
      await payrollApi.saveTag({ name: tagName.trim() });
      setTagName("");
      load();
    } catch (e) { setError(apiError(e)); }
  };

  return (
    <Stack gap={4}>
      <Paper variant="outlined" sx={{ p: { xs: 1.6, md: 2 }, borderRadius: 2.5, borderColor: "#E4E7EC" }}>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} gap={1.2} mb={1.8}>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 18 }}>Pamainos</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: .25 }}>
              Sukurkite pamainas, kurios bus naudojamos grafikuose ir automatiniame sudaryme.
            </Typography>
          </Box>
          <Tooltip title={noFreeColors ? "Visos 10 pamainų spalvų jau naudojamos" : "Pridėti naują pamainą"}>
            <span>
              <Button variant="contained" startIcon={<AddIcon />} onClick={openNewShift} disabled={noFreeColors}
                sx={{ textTransform: "none", fontWeight: 700, borderRadius: 1.8, boxShadow: "none", "&:hover": { boxShadow: "none" } }}>
                Nauja pamaina
              </Button>
            </span>
          </Tooltip>
        </Stack>

        {shiftError && <Alert severity="error" onClose={() => setShiftError("")} sx={{ mb: 1.5, borderRadius: 1.8 }}>{shiftError}</Alert>}
        {shiftNotice && <Alert severity="warning" onClose={() => setShiftNotice("")} sx={{ mb: 1.5, borderRadius: 1.8 }}>{shiftNotice}</Alert>}

        <Stack gap={1.25}>
          {types.map((t, i) => {
            const tint = shiftColor(t.color) || PALETTE[i % PALETTE.length];
            const active = t.is_active !== false;
            return (
              <Paper key={t.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2.2, borderColor: "#E4E7EC", bgcolor: active ? "#FFF" : "#F9FAFB" }}>
                <Stack direction={{ xs: "column", md: "row" }} alignItems={{ xs: "flex-start", md: "center" }} gap={1.25}>
                  <Box sx={{ minWidth: 52, height: 34, px: 1, borderRadius: 1.6, bgcolor: tint, color: shiftText(tint), border: `1px solid ${alpha(shiftText(tint), .12)}`, fontWeight: 800, display: "grid", placeItems: "center", fontSize: 15, lineHeight: 1 }}>
                    {t.code}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction={{ xs: "column", lg: "row" }} gap={{ xs: .35, lg: 1.4 }} alignItems={{ xs: "flex-start", lg: "center" }} flexWrap="wrap">
                      <Typography sx={{ fontWeight: 700, color: "#101828" }}>{t.name}</Typography>
                      <Typography sx={{ color: "#475467", fontSize: 14 }}>{String(t.start_time || "").slice(0, 5)}–{String(t.end_time || "").slice(0, 5)}</Typography>
                      <Typography sx={{ color: "#667085", fontSize: 13.5 }}>
                        Pertrauka {t.break_minutes || 0} min.{t.break_start ? ` nuo ${String(t.break_start).slice(0, 5)}` : ""}{t.break_paid ? " · apmokama" : ""}
                      </Typography>
                    </Stack>
                    <Typography sx={{ mt: .45, color: "#667085", fontSize: 12.5 }}>
                      Darbuotojų reikia: {demandSummary(t)}
                    </Typography>
                  </Box>
                  <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ ml: { md: "auto" } }}>
                    <FormControlLabel
                      sx={{ m: 0, gap: .15, "& .MuiFormControlLabel-label": { fontSize: 12.5, fontWeight: 650, color: active ? "#027A48" : "#667085" } }}
                      control={<Switch size="small" checked={active} disabled={shiftSavingId === t.id} onChange={(_, checked) => toggleShiftActive(t, checked)}
                        sx={{ "& .MuiSwitch-switchBase, & .MuiSwitch-thumb, & .MuiSwitch-track": { transitionDuration: "120ms" },
                          "& .MuiSwitch-switchBase.Mui-disabled + .MuiSwitch-track": { opacity: .5 } }}
                        inputProps={{ "aria-label": `${active ? "Išjungti" : "Įjungti"} pamainą ${t.name}` }} />}
                      label={active ? "Aktyvi" : "Neaktyvi"}
                    />
                    <Tooltip title="Redaguoti pamainą">
                      <IconButton size="small" onClick={() => { setError(""); setDlg(withDefaults(t)); }} sx={{ border: "1px solid #E4E7EC", borderRadius: 1.5 }}>
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Ištrinti pamainą">
                      <IconButton size="small" onClick={() => window.confirm(`Ištrinti pamainą „${t.name}“? Jei ji jau naudojama grafikuose, ten ji liks be tipo.`) && payrollApi.deleteShiftType(t.id).then(load)}
                        sx={{ border: "1px solid #E4E7EC", borderRadius: 1.5 }}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>
              </Paper>
            );
          })}
          {types.length === 0 && <Alert severity="info" sx={{ borderRadius: 2 }}>Sukurkite pirmą pamainą, pvz. „Diena 07:00–19:00“ arba „Naktis 19:00–07:00“.</Alert>}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: { xs: 1.6, md: 2 }, borderRadius: 2.5, borderColor: "#E4E7EC" }}>
        <Box mb={1.6}>
          <Typography sx={{ fontWeight: 800, fontSize: 18 }}>Žymos</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: .25 }}>
            Žymos priskiriamos darbuotojo kortelėje ir vėliau naudojamos taisyklėse.
          </Typography>
        </Box>

        <Stack direction={{ xs: "column", sm: "row" }} gap={1} alignItems={{ xs: "stretch", sm: "flex-start" }}>
          <TextField
            size="small"
            label="Nauja žyma"
            value={tagName}
            onChange={(e) => setTagName(e.target.value.slice(0, TAG_NAME_MAX))}
            inputProps={{ maxLength: TAG_NAME_MAX }}
            helperText={`2–${TAG_NAME_MAX} simboliai (${tagName.length}/${TAG_NAME_MAX})`}
            sx={{ width: { xs: "100%", sm: 280 } }}
          />
          <Button variant="contained" disabled={!tagValid} onClick={createTag}
            sx={{ textTransform: "none", fontWeight: 700, minWidth: 120, borderRadius: 1.8, boxShadow: "none", "&:hover": { boxShadow: "none" } }}>
            Pridėti žymą
          </Button>
        </Stack>

        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#344054", mb: 1 }}>Esamos žymos</Typography>
          <Stack direction="row" gap={1} flexWrap="wrap">
            {tags.map((t) => (
              <Chip
                key={t.id}
                label={t.name}
                onDelete={() => window.confirm(`Ištrinti žymą „${t.name}“? Ji bus pašalinta iš darbuotojų ir taisyklių.`) && payrollApi.deleteTag(t.id).then(load)}
                sx={{ borderRadius: 1.5, height: 32, fontWeight: 600 }}
              />
            ))}
            {tags.length === 0 && <Typography sx={{ color: "#98A2B3", fontSize: 13 }}>Kol kas žymų nėra</Typography>}
          </Stack>
        </Box>
      </Paper>

      <Dialog open={!!dlg} onClose={() => setDlg(null)} fullWidth maxWidth="md" disableScrollLock>
        <DialogTitle>{dlg?.id ? "Redaguoti pamainą" : "Nauja pamaina"}</DialogTitle>
        <DialogContent>
          {dlg && (
            <Stack gap={2.1} mt={1}>
              <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                <TextField fullWidth label="Pavadinimas" size="small" value={dlg.name || ""}
                  onChange={(e) => setDlg({ ...dlg, name: e.target.value.slice(0, SHIFT_NAME_MAX) })}
                  inputProps={{ maxLength: SHIFT_NAME_MAX }}
                  error={Boolean(dlg.name && !nameValid)}
                  helperText={`2–${SHIFT_NAME_MAX} simbolių (${String(dlg.name || "").length}/${SHIFT_NAME_MAX})`} />
                <TextField fullWidth label="Trumpinys grafike" size="small" value={dlg.code || ""}
                  onChange={(e) => setDlg({ ...dlg, code: e.target.value.toLocaleUpperCase("lt-LT").replace(/[^A-ZĄČĘĖĮŠŲŪŽ0-9]/g, "").slice(0, SHIFT_CODE_MAX) })}
                  inputProps={{ maxLength: SHIFT_CODE_MAX }}
                  helperText="Iki 3 raidžių arba skaitmenų" />
              </Stack>

              <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                <TextField fullWidth size="small" label="Pradžia" type="text" value={String(dlg.start_time || "").slice(0, 5)}
                  onChange={(e) => updateTime("start_time", e.target.value)} placeholder="07:00" error={!time24(dlg.start_time)}
                  inputProps={{ inputMode: "numeric", maxLength: 5, lang: "lt-LT" }} InputLabelProps={{ shrink: true }} helperText="24 val. formatas (HH:MM)" />
                <TextField fullWidth size="small" label="Pabaiga" type="text" value={String(dlg.end_time || "").slice(0, 5)}
                  onChange={(e) => updateTime("end_time", e.target.value)} placeholder="19:00" error={!time24(dlg.end_time)}
                  inputProps={{ inputMode: "numeric", maxLength: 5, lang: "lt-LT" }} InputLabelProps={{ shrink: true }}
                  helperText={time24(dlg.start_time) && time24(dlg.end_time) && dlg.end_time <= dlg.start_time ? "Baigiasi kitą dieną" : "24 val. formatas (HH:MM)"} />
                <TextField size="small" label="Pertrauka, min." type="number" value={dlg.break_minutes}
                  onChange={(e) => { if (/^\d*$/.test(e.target.value)) setDlg({ ...dlg, break_minutes: e.target.value }); }}
                  inputProps={{ min: 0, max: 1440, step: 1, inputMode: "numeric" }} error={!breakValid}
                  helperText="Tik sveikieji skaičiai" sx={{ minWidth: { sm: 170 } }} />
              </Stack>

              {Number(dlg.break_minutes) > 0 && (
                <Stack direction={{ xs: "column", sm: "row" }} gap={2} alignItems={{ sm: "flex-start" }}>
                  <Stack direction="row" alignItems="flex-start" gap={.75} sx={{ flex: 1 }}>
                    <TextField fullWidth size="small" label="Pertraukos pradžia (nebūtina)" type="text"
                      value={String(dlg.break_start || "").slice(0, 5)} placeholder="pvz. 12:00"
                      onChange={(e) => updateTime("break_start", e.target.value)}
                      error={Boolean(dlg.break_start) && !time24(dlg.break_start)}
                      inputProps={{ inputMode: "numeric", maxLength: 5 }} InputLabelProps={{ shrink: true }}
                      helperText={dlg.break_start ? `Pertrauka ${String(dlg.break_start).slice(0, 5)}–${(() => {
                        const [h, m] = String(dlg.break_start).slice(0, 5).split(":").map(Number);
                        const t = (h * 60 + m + Number(dlg.break_minutes || 0)) % 1440;
                        return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
                      })()}` : "Tuščia – pertrauka laikoma paskirstyta per visą pamainą"} />
                    <Tooltip arrow title={
                      <Box sx={{ fontSize: 12, lineHeight: 1.55 }}>
                        <b>Kam to reikia.</b> Neapmokama pertrauka neįskaitoma į darbo laiką, todėl jos laikas lemia, kiek valandų bus naktinės
                        (22:00–06:00, mokama ≥ 1,5×) ir šventinės (mokama 2×).<br /><br />
                        <b>Pvz.</b> pamaina 19:00–07:00, pertrauka 60 min.: jei pertrauka 20:00 – naktinės 8 val., jei 02:00 – 7 val.<br /><br />
                        <b>Jei nenurodyta</b> – pertrauka paskirstoma proporcingai per visą pamainą (pvz. 7,5 naktinės val.).<br /><br />
                        Pertrauka turi būti suteikta ne vėliau kaip po 5 val. darbo (DK 122 str.).
                      </Box>}>
                      <HelpOutlineOutlinedIcon sx={{ fontSize: 18, color: "#667085", mt: 1 }} />
                    </Tooltip>
                  </Stack>
                  <Stack direction="row" alignItems="center" gap={.5} sx={{ flex: 1, minHeight: 40 }}>
                    <FormControlLabel sx={{ mr: 0 }}
                      control={<Switch size="small" checked={Boolean(dlg.break_paid)} onChange={(e) => setDlg({ ...dlg, break_paid: e.target.checked })} />}
                      label={<Typography sx={{ fontSize: 13.5 }}>Pertrauka apmokama</Typography>} />
                    <Tooltip arrow title={
                      <Box sx={{ fontSize: 12, lineHeight: 1.55 }}>
                        Paprastai pertrauka pailsėti ir pavalgyti <b>neapmokama</b> ir neįskaitoma į darbo laiką (DK 122 str.).<br /><br />
                        Įjunkite, jei darbuotojas pertraukos metu <b>negali palikti darbo vietos</b> (pvz. vienintelis budintis, apsauga)
                        arba tai <b>specialioji pertrauka</b> (darbas kompiuteriu, šaltyje, sunkus fizinis darbas) – tada visa pamaina
                        įskaitoma į darbo laiką ir apmokama (pvz. 19:00–07:00 = 12 val.).
                      </Box>}>
                      <HelpOutlineOutlinedIcon sx={{ fontSize: 18, color: "#667085" }} />
                    </Tooltip>
                  </Stack>
                </Stack>
              )}

              <Paper variant="outlined" sx={{ p: 1.6, borderRadius: 2, borderColor: "#E4E7EC", bgcolor: "#FCFCFD" }}>
                <Stack direction="row" alignItems="center" gap={1} mb={1.2}>
                  <Typography sx={{ fontSize: 14, fontWeight: 800 }}>Kiek darbuotojų reikia</Typography>
                  <Tooltip title="Sudarant grafiką pamainoje bus ne mažiau nei „reikia“ ir ne daugiau nei „daugiausia“. Tuščia „daugiausia“ – be ribos: papildomi darbuotojai skiriami, kad išdirbtų normą. Konkrečios dienos poreikį galima pakeisti grafike.">
                    <HelpOutlineOutlinedIcon sx={{ fontSize: 18, color: "#667085" }} />
                  </Tooltip>
                </Stack>
                <Box sx={{ display: "grid", gridTemplateColumns: "72px repeat(7, minmax(0, 1fr))", gap: .75, alignItems: "center" }}>
                  <Box />
                  {weekdayLabels.map((label, index) => (
                    <Typography key={label} sx={{ fontSize: 12, fontWeight: 700, textAlign: "center", color: index >= 5 ? "#B42318" : "#475467" }}>{label}</Typography>
                  ))}
                  {[["default_staff_need_by_weekday", "Reikia", "0"], ["default_staff_max_by_weekday", "Daugiausia", "∞"]].map(([field, label, ph]) => (
                    <Box key={field} sx={{ display: "contents" }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#475467" }}>{label}</Typography>
                      {weekdayLabels.map((wd, index) => {
                        const v = dlg[field]?.[index] ?? "";
                        const bad = field === "default_staff_max_by_weekday" && v !== "" && Number(v) < Number(dlg.default_staff_need_by_weekday?.[index] || 0);
                        return (
                          <TextField key={wd} size="small" value={v} placeholder={ph} error={bad}
                            onChange={(e) => updateDemand(index, e.target.value, field)}
                            inputProps={{ inputMode: "numeric", style: { textAlign: "center" }, "aria-label": `${label} ${wd}` }}
                            sx={{ "& .MuiOutlinedInput-root": { height: 34, borderRadius: 1.5 }, "& input": { textAlign: "center", p: 0, fontWeight: 700 } }} />
                        );
                      })}
                    </Box>
                  ))}
                </Box>
                {!maxValid && <Typography sx={{ mt: 1, fontSize: 12, color: "error.main" }}>„Daugiausia“ negali būti mažiau nei „reikia“.</Typography>}
              </Paper>

              <Box>
                <Typography sx={{ mb: 1, fontSize: 13, fontWeight: 700 }}>Spalva</Typography>
                <Stack direction="row" flexWrap="wrap" gap={1.1}>
                  {PALETTE.map((hex, i) => {
                    const isUsed = usedColors.has(normalizedColor(hex));
                    const isSelected = normalizedColor(dlg.color) === normalizedColor(hex);
                    return (
                      <Tooltip key={hex} title={isUsed ? "Šią spalvą jau naudoja kita pamaina" : `Spalva ${i + 1}`}>
                        <span>
                          <Box component="button" type="button" disabled={isUsed} aria-label={`Spalva ${i + 1}${isUsed ? " - užimta" : ""}`}
                            aria-pressed={isSelected} onClick={() => setDlg({ ...dlg, color: hex })}
                            sx={{ width: 32, height: 32, bgcolor: hex, borderRadius: "50%", cursor: isUsed ? "not-allowed" : "pointer",
                              border: "3px solid white", boxShadow: isSelected ? `0 0 0 2px ${hex}` : "0 0 0 1px #D0D5DD",
                              opacity: isUsed ? .22 : 1, display: "grid", placeItems: "center",
                              "&:focus-visible": { outline: "3px solid #344054", outlineOffset: 3 } }}>
                            {isSelected && <CheckIcon sx={{ fontSize: 19, color: shiftText(hex) }} />}
                          </Box>
                        </span>
                      </Tooltip>
                    );
                  })}
                </Stack>
                {!colorValid && <Typography color="error.main" sx={{ mt: .5, fontSize: 11.5 }}>Pasirinkite laisvą spalvą.</Typography>}
              </Box>

              {error && <Alert severity="error" sx={{ borderRadius: 1.7 }}>{error}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDlg(null)}>Atšaukti</Button>
          <Button variant="contained" onClick={save} disabled={!canSaveShift}>Išsaugoti</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

// ============================================================

// ym / onYmChange - kai mėnuo valdomas iš viršaus (Grafikai ir tabeliai: tas pats mėnuo abiejuose skirtukuose)
export default function GrafikaiPage({ embedded = false, ym = null, onYmChange = null } = {}) {
  const [own, setOwn] = useState(nextMonth);
  const { year, month } = ym || own;
  const [tab, setTab] = useState(0);
  const shift = (d) => {
    const x = new Date(year, month - 1 + d, 1);
    const next = { year: x.getFullYear(), month: x.getMonth() + 1 };
    if (onYmChange) onYmChange(next); else setOwn(next);
  };
  return (
    <Box sx={{ p: embedded ? 0 : { xs: 1.5, md: 2 }, minWidth: 0 }}>
      {!embedded && <Typography variant="h5" fontWeight={800} sx={{ mb: 2 }}>Darbo grafikai</Typography>}
      {tab === 0 && (
        <RosterTab key={`${year}-${month}`} year={year} month={month} onMonthShift={shift} onOpenSettings={setTab} />
      )}
      {tab !== 0 && (
        <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} gap={1.5} sx={{ mb: 2, mt: .5 }}>
          <Button onClick={() => setTab(0)} startIcon={<ChevronLeftIcon />} variant="text" color="inherit"
            sx={{ textTransform: "none", fontWeight: 700, alignSelf: "flex-start", minWidth: { sm: 170 } }}>Grįžti į grafiką</Button>
          <Box sx={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <Box role="tablist" sx={{ position: "relative", display: "inline-grid", gridTemplateColumns: "1fr 1fr", p: .5,
              bgcolor: "#F2F4F7", borderRadius: 99, border: "1px solid #E4E7EC", minWidth: { xs: 300, sm: 380 } }}>
              <Box sx={{ position: "absolute", top: 4, bottom: 4, left: 4, width: "calc(50% - 4px)", borderRadius: 99, bgcolor: "#FFFFFF",
                boxShadow: "0 1px 3px rgba(16,24,40,.12)", transform: tab === 1 ? "translateX(100%)" : "none", transition: "transform .2s ease" }} />
              {[[2, "Pamainos ir žymos"], [1, "Taisyklės"]].map(([v, l]) => (
                <Box key={v} component="button" type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
                  sx={{ position: "relative", zIndex: 1, appearance: "none", border: 0, bgcolor: "transparent", cursor: "pointer",
                    font: "inherit", fontSize: 14, fontWeight: tab === v ? 800 : 600, color: tab === v ? "#101828" : "#667085",
                    py: 1, px: 2.5, borderRadius: 99, whiteSpace: "nowrap" }}>{l}</Box>
              ))}
            </Box>
          </Box>
          <Box sx={{ minWidth: { sm: 170 } }} />
        </Stack>
      )}
      {tab === 1 && <RulesTab />}
      {tab === 2 && <SetupTab />}
    </Box>
  );
}
