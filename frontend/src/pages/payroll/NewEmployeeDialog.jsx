import { useEffect, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, Collapse, Dialog, Divider, FormControl, FormControlLabel, IconButton,
  InputAdornment, InputLabel, Link, MenuItem, Select, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import MarkEmailReadOutlinedIcon from "@mui/icons-material/MarkEmailReadOutlined";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import BeachAccessOutlinedIcon from "@mui/icons-material/BeachAccessOutlined";
import { MuiTelInput } from "mui-tel-input";

import LtDatePicker from "../../components/LtDatePicker"; // ⚠ pataisyk kelią, jei komponentas kitur
import { CONTRACT_TYPES, NPD_MODES, apiError, money, payrollApi } from "../../api/payroll";
import { estimateNet } from "./payrollEstimate";
import { parsePersonalCode } from "./personalCode";
import { anchorLabel, cap, iso, norm, periodsFrom } from "./SuminePeriodSection";

const MENU_PROPS = { disableScrollLock: true };
const today = () => new Date().toISOString().slice(0, 10);
const QUICK_HOURS = [40, 30, 20, 10];
const DAYS = ["Pr", "An", "Tr", "Kt", "Pn", "Š", "S"];
const STD_DAYS = [true, true, true, true, true, false, false];
const DAY_TEMPLATES = [["Pr–Pn", STD_DAYS], ["An–Š", [false, true, true, true, true, true, false]], ["Pr–Š", [true, true, true, true, true, true, false]]];
const r2 = (x) => Math.round(x * 100) / 100;
const fmtH = (x) => String(r2(Number(x) || 0)).replace(".", ",");

// Savaitės valandos tolygiai pasirinktoms dienoms (likutis - paskutinei)
function spread(total, days) {
  const idx = days.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
  const out = days.map(() => 0);
  if (!idx.length) return out;
  const each = r2(total / idx.length);
  idx.forEach((i) => { out[i] = each; });
  out[idx[idx.length - 1]] = r2(total - each * (idx.length - 1));
  return out;
}

// „Pr–Pn po 8 val.“, „An–Š po 8 val.“, „Pr, Tr, Pn · 20 val.“
function weekLabel(days, week) {
  const runs = [];
  days.forEach((on, i) => {
    if (!on) return;
    const last = runs[runs.length - 1];
    if (last && last[1] === i - 1) last[1] = i; else runs.push([i, i]);
  });
  if (!runs.length) return "–";
  const names = runs.map(([a, b]) => (a === b ? DAYS[a] : b - a === 1 ? `${DAYS[a]}, ${DAYS[b]}` : `${DAYS[a]}–${DAYS[b]}`)).join(", ");
  const hrs = week.filter((_, i) => days[i]).map(Number);
  return hrs.every((h) => Math.abs(h - hrs[0]) < 0.01) ? `${names} po ${fmtH(hrs[0])} val.` : `${names} · skirtingai`;
}

const isStdWeek = (days, week) => days.every((on, i) => on === STD_DAYS[i])
  && week.slice(0, 5).every((h) => Math.abs(Number(h) - Number(week[0])) < 0.01);

function SummedPeriodBox({ startDate, months, anchor, custom, onCustom, onReset, onMonths, onAnchor }) {
  const start = startDate ? new Date(`${startDate}T12:00:00`) : new Date();
  const [p1, p2] = periodsFrom(start, months, anchor, 1);
  const from = startDate && startDate > iso(p1.start) ? startDate : iso(p1.start);
  return (
    <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: "#F8FAFC", border: "1px solid #EAECF0" }}>
      <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
        <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: "#101828" }}>Apskaitinis laikotarpis</Typography>
        {custom ? (
          <>
            <TextField select size="small" value={months} sx={{ width: 120, bgcolor: "#FFFFFF" }}
              onChange={(e) => onMonths(Number(e.target.value))} SelectProps={{ MenuProps: MENU_PROPS }}>
              {[1, 2, 3].map((m) => <MenuItem key={m} value={m}>{m} mėn.</MenuItem>)}
            </TextField>
            {months > 1 && (
              <TextField select size="small" value={anchor} sx={{ flex: 1, minWidth: 220, bgcolor: "#FFFFFF" }}
                onChange={(e) => onAnchor(Number(e.target.value))}
                SelectProps={{ MenuProps: MENU_PROPS, renderValue: (v) => cap(anchorLabel(months, v, true)) }}>
                {Array.from({ length: months }, (_, i) => i + 1).map((a) => (
                  <MenuItem key={a} value={a}>{cap(anchorLabel(months, a))}</MenuItem>
                ))}
              </TextField>
            )}
            <Link component="button" type="button" variant="body2" onClick={onReset} sx={{ ml: "auto" }}>Kaip įmonėje</Link>
          </>
        ) : (
          <>
            <Typography sx={{ fontSize: 13.5, color: "#475467" }}>
              <b style={{ fontWeight: 600, color: "#101828" }}>{months} mėn.</b> · pagal įmonės nustatymus
            </Typography>
            <Link component="button" type="button" variant="body2" onClick={onCustom} sx={{ ml: "auto" }}>Keisti</Link>
          </>
        )}
      </Stack>
      <Typography sx={{ fontSize: 12.5, color: "#667085", mt: .75 }}>
        Pirmasis: {from} – {iso(p1.end)}, kitas nuo {iso(p2.start)}
      </Typography>
    </Box>
  );
}

function WeekEditor({ days, week, total, onToggle, onHour, onTemplate }) {
  const sum = week.reduce((a, h, i) => a + (days[i] ? Number(h) || 0 : 0), 0);
  const off = Math.abs(sum - total) > 0.01;
  const tooLong = week.some((h, i) => days[i] && Number(h) > 12);
  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>Darbo dienos ir valandos</Typography>
        <Stack direction="row" gap={.75}>
          {DAY_TEMPLATES.map(([l, d]) => (
            <Chip key={l} size="small" label={l} clickable onClick={() => onTemplate(d)}
              variant={d.every((x, i) => x === days[i]) ? "filled" : "outlined"}
              color={d.every((x, i) => x === days[i]) ? "primary" : "default"} />
          ))}
        </Stack>
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 1, maxWidth: 520 }}>
        {DAYS.map((d, i) => (
          <Box key={d}>
            <Box onClick={() => onToggle(i)} sx={{
              height: 34, borderRadius: 2, display: "grid", placeItems: "center", cursor: "pointer", userSelect: "none",
              fontSize: 13.5, fontWeight: 600, border: "1.5px solid", borderColor: days[i] ? "#1570EF" : "#EAECF0",
              bgcolor: days[i] ? "#1570EF" : "#FFFFFF", color: days[i] ? "#FFFFFF" : i > 4 ? "#98A2B3" : "#475467",
            }}>{d}</Box>
            <TextField size="small" fullWidth disabled={!days[i]} placeholder="–"
              value={days[i] ? String(week[i]).replace(".", ",") : ""}
              onChange={(e) => onHour(i, e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))}
              inputProps={{ inputMode: "decimal", style: { textAlign: "center", padding: "6px 2px", fontSize: 13 } }}
              sx={{ mt: .75 }} />
          </Box>
        ))}
      </Box>
      <Typography sx={{ fontSize: 12, color: off || tooLong ? "#B42318" : "#667085", mt: .75 }}>
        {off ? `Dienų suma ${fmtH(sum)} val., o turi būti ${fmtH(total)} val. per savaitę`
          : tooLong ? "Ne daugiau kaip 12 val. per dieną (DK 114 str.)"
            : "Valandos per dieną. Paspauskite dieną, kad ją įjungtumėte ar išjungtumėte."}
      </Typography>
    </Box>
  );
}
const LONG_PROBATION_FROM = "2026-11-01";   // DK 36 str. 2 d. (įst. XV-1058): iki 6 mėn., kai alga >= 2 VDU
const CARD_SX = { border: "1px solid #EAECF0", borderRadius: 2.5, p: 2.25, bgcolor: "#FFFFFF" };
const BTN_SX = { textTransform: "none", fontWeight: 600, borderRadius: 2, boxShadow: "none", "&:hover": { boxShadow: "none" } };

const EMPTY = {
  first_name: "", last_name: "", personal_code: "", is_foreigner: false, birth_date: "", gender: "",
  email: "", phone: "+370",
  position_id: null, position_name: "", lpk_code: "", lpk_title: "", custom_title: "",
  start_date: today(), sodra_contract_type: "01", sodra_contract_subtype: "", end_date: "", probation_months: "0",
  work_regime: "standard", days: STD_DAYS, week: [8, 8, 8, 8, 8, 0, 0],
  period_custom: false, period_months: 3, period_anchor: 1,
  pay_form: "monthly", base_amount: "", weekly_hours: 40, full_time_hours: 40, shortened: false,
  extended_leave_days: "", extra_leave_days: "",
  fill_mode: "invite",
  iban: "", address: "", npd_mode: "standard", pension_accumulation: false, single_parent: false,
};

// 1-SD - ne vėliau kaip prieš 1 darbo dieną iki darbo pradžios (savaitgaliai praleidžiami; šventes tikrina Sodros forma)
function prevWorkday(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  do { d.setDate(d.getDate() - 1); } while (d.getDay() === 0 || d.getDay() === 6);
  return d.toISOString().slice(0, 10);
}

function Section({ title, desc, children, sx }) {
  return (
    <Box sx={{ ...CARD_SX, ...sx }}>
      <Typography sx={{ fontSize: 14.5, fontWeight: 600, color: "#101828" }}>{title}</Typography>
      {desc && <Typography sx={{ fontSize: 12.5, color: "#667085", mt: .2 }}>{desc}</Typography>}
      <Stack gap={2} mt={1.75}>{children}</Stack>
    </Box>
  );
}

// ---------- Pareigos: įmonės pareigos + LPK paieška ----------
export function PositionPicker({ c, set }) {
  const [input, setInput] = useState("");
  const [opts, setOpts] = useState({ positions: [], lpk: [] });
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => payrollApi.searchPositions(input).then(setOpts).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [input]);

  const options = [
    ...opts.positions.map((p) => ({ kind: "pos", key: `p${p.id}`, label: p.name, sub: p.lpk_code ? `LPK ${p.lpk_code}` : "", p })),
    ...opts.lpk.map((l) => ({ kind: "lpk", key: `l${l.code}`, label: l.title, sub: `${l.name} · ${l.code}`, l })),
  ];
  const value = c.position_id
    ? { kind: "pos", key: `p${c.position_id}`, label: c.position_name, sub: "" }
    : c.lpk_code ? { kind: "lpk", key: `l${c.lpk_code}`, label: c.lpk_title, sub: "" } : null;
  const sameCode = c.lpk_code && !c.position_id ? opts.positions.filter((p) => p.lpk_code === c.lpk_code) : [];

  const pick = (o) => {
    if (!o) return set({ position_id: null, position_name: "", lpk_code: "", lpk_title: "", custom_title: "" });
    if (o.kind === "pos") return set({ position_id: o.p.id, position_name: o.p.name, lpk_code: o.p.lpk_code, lpk_title: "", custom_title: "" });
    set({ position_id: null, position_name: "", lpk_code: o.l.code, lpk_title: o.l.title, custom_title: "" });
  };

  return (
    <Box>
      <Autocomplete
        fullWidth options={options} value={value} filterOptions={(x) => x}
        groupBy={(o) => (o.kind === "pos" ? "Jūsų įmonės pareigos" : "Profesijų klasifikatorius")}
        getOptionLabel={(o) => o.label || ""} isOptionEqualToValue={(a, b) => a.key === b.key}
        onInputChange={(_, v, reason) => reason === "input" && setInput(v)}
        onChange={(_, o) => { pick(o); setCustom(false); }}
        noOptionsText={input.length < 2 ? "Įveskite bent 2 raides" : "Nerasta"}
        renderOption={(props, o) => (
          <li {...props} key={o.key}>
            <Box>
              <Typography fontSize={14}>{o.label}</Typography>
              {o.sub && <Typography variant="caption" color="text.secondary">{o.sub}</Typography>}
            </Box>
          </li>
        )}
        renderInput={(params) => <TextField {...params} label="Pareigos" required placeholder="Pradėkite rašyti, pvz. buhalt" />}
      />
      {sameCode.length > 0 && (
        <Alert severity="info" sx={{ mt: 1 }}
          action={<Button color="inherit" size="small" onClick={() => pick({ kind: "pos", p: sameCode[0] })}>Naudoti</Button>}>
          Įmonėje jau yra „{sameCode[0].name}“ su šiuo kodu. Ar tai ta pati pareigybė?
        </Alert>
      )}
      {c.lpk_code && !c.position_id && (
        custom ? (
          <TextField size="small" fullWidth sx={{ mt: 1 }} label="Pavadinimas sutartyje" value={c.custom_title}
            onChange={(e) => set({ custom_title: e.target.value })}
            helperText={`Profesija pagal klasifikatorių: ${c.lpk_title} (${c.lpk_code})`} autoFocus />
        ) : (
          <Button size="small" sx={{ mt: 0.5, px: 0, textTransform: "none" }} onClick={() => setCustom(true)}>+ Kitas pavadinimas sutartyje</Button>
        )
      )}
    </Box>
  );
}

const STEPS = ["Asmuo", "Darbas", "Kiti duomenys"];

// ---------- Dialogas ----------
export default function NewEmployeeDialog({ open, onClose, onCreated }) {
  const [f, setF] = useState(EMPTY);
  const [step, setStep] = useState(0);
  const [positions, setPositions] = useState([]);
  const [leave, setLeave] = useState(null);
  const [leaveEdit, setLeaveEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [co, setCo] = useState({ m: 3, a: 1 });   // įmonės apskaitinis laikotarpis (DU nustatymai)
  const set = (v) => setF((s) => ({ ...s, ...v }));
  const setHours = (h) => setF((s) => {
    const full = Number(s.full_time_hours) || 40;
    const v = h !== "" && Number(h) > full ? full : h;             // vienoje sutartyje - daugiausia 1 etatas
    return { ...s, weekly_hours: v, week: spread(Number(v) || 0, s.days) };
  });
  const setFull = (h) => setF((s) => {
    const wasFull = Number(s.weekly_hours) === Number(s.full_time_hours);
    const wk = h !== "" && (wasFull || Number(s.weekly_hours) > Number(h)) ? h : s.weekly_hours;
    return { ...s, full_time_hours: h, weekly_hours: wk, week: spread(Number(wk) || 0, s.days) };
  });
  const fullH = Number(f.full_time_hours) || 40;
  const setDays = (days) => setF((s) => ({ ...s, days, week: spread(Number(s.weekly_hours) || 0, days) }));
  const toggleDay = (i) => setDays(f.days.map((x, j) => (j === i ? !x : x)));
  const setDayHours = (i, v) => setF((s) => ({ ...s, week: s.week.map((h, j) => (j === i ? v : h)) }));

  useEffect(() => {
    if (!open) return;
    setF({ ...EMPTY, start_date: today() }); setError(""); setLeaveEdit(false); setStep(0);
    payrollApi.positions().then(setPositions).catch(() => {});
    payrollApi.settings().then((st) => setCo({ m: st.summed_period_months || 3, a: st.summed_period_anchor || 1 })).catch(() => {});
  }, [open]);

  const pc = f.is_foreigner ? null : f.personal_code ? parsePersonalCode(f.personal_code) : null;
  const type = CONTRACT_TYPES.find((t) => t.value === f.sodra_contract_type);
  const fixedTerm = ["02", "04", "05"].includes(f.sodra_contract_type) || f.sodra_contract_subtype?.endsWith("1");
  const needsEnd = f.sodra_contract_type === "02" || f.sodra_contract_subtype?.endsWith("1");
  const workload = Number(f.weekly_hours || 0) / Number(f.full_time_hours || 40);
  const workDays = f.days.filter(Boolean).length;
  const weekSum = f.week.reduce((a, h, i) => a + (f.days[i] ? Number(h) || 0 : 0), 0);
  const pm = f.period_custom ? Number(f.period_months) : co.m;
  const pa = f.period_custom ? norm(pm, f.period_anchor) : norm(co.m, co.a);
  const monthlyGross = f.pay_form === "monthly" ? Number(f.base_amount) : Number(f.base_amount) * Number(f.weekly_hours || 0) * 52 / 12;

  // atostogų trukmė iš backend (viena taisyklių vieta)
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => {
      payrollApi.leavePreview({
        personal_code: f.is_foreigner ? "" : f.personal_code, birth_date: f.is_foreigner ? f.birth_date : "",
        start_date: f.start_date, weekly_days: f.work_regime === "standard" && workDays >= 6 ? 6 : 5,
        has_disability: ["d30_55", "d0_25"].includes(f.npd_mode), single_parent: f.single_parent,
        extended_leave_days: f.extended_leave_days, extra_leave_days: f.extra_leave_days,
      }).then(setLeave).catch(() => setLeave(null));
    }, 250);
    return () => clearTimeout(t);
  }, [open, f.personal_code, f.is_foreigner, f.birth_date, f.start_date, f.npd_mode, f.single_parent, f.extended_leave_days, f.extra_leave_days, f.work_regime, workDays]);

  // trūkstami laukai pagal žingsnį
  const missing = [[], [], []];
  if (!f.first_name || !f.last_name) missing[0].push("vardas ir pavardė");
  if (!f.is_foreigner && !pc?.valid) missing[0].push("teisingas asmens kodas");
  if (f.is_foreigner && (!f.birth_date || !f.gender)) missing[0].push("gimimo data ir lytis");
  if (!f.position_id && !f.lpk_code) missing[1].push("pareigos");
  if (!f.start_date) missing[1].push("darbo pradžia");
  if (!(Number(f.base_amount) > 0)) missing[1].push("atlyginimas");
  if (!(Number(f.weekly_hours) > 0)) missing[1].push("darbo valandos");
  if (f.shortened && !(fullH >= 20 && fullH < 40)) missing[1].push("sutrumpinta norma – nuo 20 iki 39 val.");
  if (f.work_regime === "standard" && Number(f.weekly_hours) > 0) {
    if (!workDays || Math.abs(weekSum - Number(f.weekly_hours)) > 0.01) missing[1].push("darbo dienų valandos (suma nesutampa)");
    if (f.week.some((h, i) => f.days[i] && Number(h) > 12)) missing[1].push("ne daugiau 12 val. per dieną");
  }
  if (type?.subtypes && !f.sodra_contract_subtype) missing[1].push("ar sutartis terminuota");
  if (needsEnd && !f.end_date) missing[1].push("darbo pabaiga");
  if (Number(f.probation_months) > 3 && f.start_date < LONG_PROBATION_FROM) missing[1].push("išbandymas iki 3 mėn. (ilgesnis – nuo 2026-11-01)");
  if (f.fill_mode === "invite" && !f.email) missing[2].push("el. paštas kvietimui");
  const allMissing = missing.flat();

  const save = async () => {
    setSaving(true); setError("");
    try {
      const manual = f.fill_mode === "manual";
      const emp = await payrollApi.createEmployee({
        first_name: f.first_name.trim(), last_name: f.last_name.trim(),
        personal_code: f.is_foreigner ? "" : f.personal_code, is_foreigner: f.is_foreigner,
        ...(f.is_foreigner ? { birth_date: f.birth_date, gender: f.gender } : {}),
        email: f.email, phone: f.phone.replace(/\D/g, "").length > 6 ? f.phone.replace(/\s/g, "") : "",
        data_status: manual ? "complete" : "awaiting_employee",
        ...(manual ? {
          iban: f.iban, address: f.address, npd_mode: f.npd_mode, pension_accumulation: f.pension_accumulation,
          single_parent: f.single_parent, has_disability: ["d30_55", "d0_25"].includes(f.npd_mode),
        } : {}),
      });
      let pos = f.position_id ? { id: f.position_id } : null;
      if (!pos) {
        const name = (f.custom_title || f.lpk_title).trim();
        pos = positions.find((p) => p.lpk_code === f.lpk_code && p.name.toLowerCase() === name.toLowerCase())
          || await payrollApi.createPosition({ name, lpk_code: f.lpk_code });
      }
      const c = await payrollApi.createContract({
        employee: emp.id, start_date: f.start_date, end_date: f.end_date || null,
        sodra_contract_type: f.sodra_contract_type, sodra_contract_subtype: f.sodra_contract_subtype, status: "active",
        probation_months: Number(f.probation_months) || 0, work_time_mode: f.work_regime === "summed" ? "02" : "01",
        extra_leave_days: Number(f.extra_leave_days) || 0,
        extended_leave_days: f.extended_leave_days ? Number(f.extended_leave_days) : null,
        ...(f.work_regime === "summed" && f.period_custom
          ? { summed_period_months: Number(f.period_months), summed_period_anchor: norm(Number(f.period_months), f.period_anchor) } : {}),
      });
      await payrollApi.createTerms({
        contract: c.id, valid_from: f.start_date, position: pos.id, pay_form: f.pay_form, base_amount: f.base_amount,
        workload: workload.toFixed(3), full_time_hours: f.full_time_hours, work_regime: f.work_regime,
        week_hours: f.work_regime === "standard" && !isStdWeek(f.days, f.week) ? f.week.map((h, i) => (f.days[i] ? Number(h) || 0 : 0)) : null,
      });
      onCreated(emp.id);
    } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  };

  const est = f.fill_mode === "manual" ? estimateNet({
    gross: monthlyGross, npdMode: f.npd_mode, pension: f.pension_accumulation, fixedTerm, date: f.start_date,
  }) : estimateNet({ gross: monthlyGross, fixedTerm, date: f.start_date });
  const minWage = f.pay_form === "monthly" && Number(f.base_amount) > 0 && Number(f.base_amount) < (est?.mma || 1153) * workload;
  const positionLabel = f.position_name || f.custom_title || f.lpk_title;
  const sd1 = prevWorkday(f.start_date);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" disableScrollLock
      PaperProps={{ sx: { borderRadius: 3, overflow: "hidden", bgcolor: "#F8FAFC", height: { md: "88vh" } } }}>
      {/* antraštė su žingsniais */}
      <Stack direction="row" alignItems="center" gap={2} sx={{ px: 3, py: 1.75, bgcolor: "#FFFFFF", borderBottom: "1px solid #EAECF0" }}>
        <Box sx={{ width: 38, height: 38, borderRadius: 2, bgcolor: "#EFF8FF", display: "grid", placeItems: "center" }}>
          <PersonAddAltOutlinedIcon sx={{ color: "#1570EF" }} />
        </Box>
        <Typography sx={{ fontSize: 17, fontWeight: 600, mr: 2 }}>Naujas darbuotojas</Typography>
        <Stack direction="row" alignItems="center" gap={1} sx={{ flex: 1, display: { xs: "none", md: "flex" } }}>
          {STEPS.map((s, i) => {
            const done = i < step && !missing[i].length;
            const cur = i === step;
            return (
              <Stack key={s} direction="row" alignItems="center" gap={1}>
                {i > 0 && <Box sx={{ width: 28, height: 2, bgcolor: i <= step ? "#1570EF" : "#EAECF0", borderRadius: 1 }} />}
                <Stack direction="row" alignItems="center" gap={.8} onClick={() => setStep(i)} sx={{ cursor: "pointer" }}>
                  <Box sx={{ width: 24, height: 24, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 600,
                    bgcolor: done ? "#1570EF" : cur ? "#EFF8FF" : "#F2F4F7", color: done ? "#FFFFFF" : cur ? "#1570EF" : "#667085",
                    border: cur ? "1.5px solid #1570EF" : "none" }}>
                    {done ? <CheckIcon sx={{ fontSize: 15 }} /> : i + 1}
                  </Box>
                  <Typography sx={{ fontSize: 13.5, fontWeight: cur ? 600 : 500, color: cur ? "#101828" : "#667085" }}>{s}</Typography>
                </Stack>
              </Stack>
            );
          })}
        </Stack>
        <IconButton onClick={onClose} aria-label="Uždaryti"><CloseIcon /></IconButton>
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0,1fr) 300px" }, flex: 1, minHeight: 0 }}>
        <Box sx={{ overflowY: "auto", p: 2.5 }}>
          <Stack gap={2}>
            {/* ---------- 1. Asmuo ---------- */}
            {step === 0 && (
              <>
                <Section title="Asmuo" desc="Kaip nurodyta asmens dokumente">
                  <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                    <TextField label="Vardas" value={f.first_name} onChange={(e) => set({ first_name: e.target.value })} fullWidth required autoFocus />
                    <TextField label="Pavardė" value={f.last_name} onChange={(e) => set({ last_name: e.target.value })} fullWidth required />
                  </Stack>
                  <Stack direction={{ xs: "column", sm: "row" }} gap={2} alignItems={{ sm: "flex-start" }}>
                    {!f.is_foreigner ? (
                      <TextField label="Asmens kodas" value={f.personal_code} required sx={{ width: { sm: 420 } }}
                        inputProps={{ inputMode: "numeric", maxLength: 11 }}
                        onChange={(e) => set({ personal_code: e.target.value.replace(/\D/g, "") })}
                        error={!!f.personal_code && f.personal_code.length === 11 && !pc?.valid}
                        FormHelperTextProps={{ sx: { color: pc?.valid && pc.warning ? "#B54708" : undefined } }}
                        helperText={!f.personal_code ? "11 skaitmenų" : pc?.valid
                          ? `${pc.birth_date ? `Gimė ${pc.birth_date} · ` : ""}${pc.gender === "M" ? "vyras" : "moteris"}${pc.warning ? `. ⚠ ${pc.warning}` : ""}`
                          : f.personal_code.length === 11 ? pc?.error : `Įvesta ${f.personal_code.length} iš 11 skaitmenų`} />
                    ) : (
                      <>
                        <Box sx={{ width: { sm: 200 } }}>
                          <LtDatePicker label="Gimimo data *" value={f.birth_date} onChange={(v) => set({ birth_date: v })} size="medium" />
                        </Box>
                        <FormControl sx={{ minWidth: 160 }}>
                          <InputLabel>Lytis *</InputLabel>
                          <Select label="Lytis *" value={f.gender} MenuProps={MENU_PROPS} onChange={(e) => set({ gender: e.target.value })}>
                            <MenuItem value="M">Vyras</MenuItem><MenuItem value="F">Moteris</MenuItem>
                          </Select>
                        </FormControl>
                      </>
                    )}
                    <FormControlLabel sx={{ mt: 1 }} control={<Checkbox checked={f.is_foreigner} onChange={(e) => set({ is_foreigner: e.target.checked })} />}
                      label={<Typography sx={{ fontSize: 14 }}>Užsienietis (neturi LT asmens kodo)</Typography>} />
                  </Stack>
                </Section>
                <Section title="Kontaktai" desc="El. paštu siunčiamas kvietimas į eSavitarną ir algalapiai">
                  <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                    <TextField label="El. paštas" type="email" value={f.email} onChange={(e) => set({ email: e.target.value.trim() })} fullWidth />
                    <MuiTelInput label="Telefonas" value={f.phone} onChange={(v) => set({ phone: v })} defaultCountry="LT"
                      preferredCountries={["LT", "LV", "PL", "UA"]} fullWidth MenuProps={MENU_PROPS} />
                  </Stack>
                </Section>
              </>
            )}

            {/* ---------- 2. Darbas ---------- */}
            {step === 1 && (
              <>
                <Section title="Pareigos ir sutartis">
                  <PositionPicker c={f} set={set} />
                  <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                    <Box sx={{ width: { sm: 200 }, flexShrink: 0 }}>
                      <LtDatePicker label="Darbo pradžia *" value={f.start_date} onChange={(v) => set({ start_date: v })} size="medium" />
                    </Box>
                    <FormControl fullWidth>
                      <InputLabel>Sutarties rūšis</InputLabel>
                      <Select label="Sutarties rūšis" value={f.sodra_contract_type} MenuProps={MENU_PROPS}
                        onChange={(e) => set({ sodra_contract_type: e.target.value, sodra_contract_subtype: "" })}>
                        {CONTRACT_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <FormControl sx={{ minWidth: 200 }}>
                      <InputLabel>Bandomasis laikotarpis</InputLabel>
                      <Select label="Bandomasis laikotarpis" value={f.probation_months} MenuProps={MENU_PROPS} onChange={(e) => set({ probation_months: e.target.value })}>
                        {["0", "1", "2", "3", "4", "5", "6"].map((m) => (
                          <MenuItem key={m} value={m} disabled={Number(m) > 3 && f.start_date < LONG_PROBATION_FROM}>
                            {m === "0" ? "Nėra" : `${m} mėn.`}{Number(m) > 3 ? " (tik didelė alga)" : ""}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Stack>
                  {Number(f.probation_months) > 3 && (
                    <Alert severity="info" sx={{ py: 0 }}>
                      Ilgesnis nei 3 mėn. išbandymas (iki 6 mėn.) leidžiamas nuo 2026-11-01, kai sutartyje nustatyta mėnesinė alga ne mažesnė
                      kaip 2 šalies vidutiniai darbo užmokesčiai (paskutinis VDA paskelbtas). DK 36 str., įst. Nr. XV-1058.
                    </Alert>
                  )}
                  {fixedTerm && Number(f.probation_months) > 0 && (
                    <Typography sx={{ fontSize: 12.5, color: "#667085" }}>
                      Terminuotoje sutartyje išbandymas turi būti proporcingas sutarties trukmei.
                    </Typography>
                  )}
                  {(type?.subtypes || needsEnd) && (
                    <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                      {type?.subtypes && (
                        <FormControl fullWidth>
                          <InputLabel>Ar terminuota?</InputLabel>
                          <Select label="Ar terminuota?" value={f.sodra_contract_subtype} MenuProps={MENU_PROPS}
                            onChange={(e) => set({ sodra_contract_subtype: e.target.value })}>
                            <MenuItem value={`${f.sodra_contract_type}1`}>Terminuota</MenuItem>
                            <MenuItem value={`${f.sodra_contract_type}2`}>Neterminuota</MenuItem>
                          </Select>
                        </FormControl>
                      )}
                      {needsEnd && (
                        <Box sx={{ width: { sm: 200 }, flexShrink: 0 }}>
                          <LtDatePicker label="Darbo pabaiga *" value={f.end_date} onChange={(v) => set({ end_date: v })} size="medium" />
                        </Box>
                      )}
                    </Stack>
                  )}
                </Section>

                <Section title="Atlyginimas ir darbo laikas">
                  <Stack direction={{ xs: "column", sm: "row" }} gap={2} alignItems={{ sm: "center" }}>
                    <ToggleButtonGroup exclusive size="small" value={f.pay_form} onChange={(_, v) => v && set({ pay_form: v })}
                      sx={{ "& .MuiToggleButton-root": { textTransform: "none", px: 1.75 } }}>
                      <ToggleButton value="monthly">Mėnesinė alga</ToggleButton>
                      <ToggleButton value="hourly">Valandinis</ToggleButton>
                    </ToggleButtonGroup>
                    <TextField label={f.pay_form === "monthly" ? "Alga „ant popieriaus“" : "Už valandą „ant popieriaus“"} required
                      type="number" value={f.base_amount} onChange={(e) => set({ base_amount: e.target.value })} sx={{ flex: 1 }}
                      InputProps={{ endAdornment: <InputAdornment position="end">{f.pay_form === "monthly" ? "€ / mėn." : "€ / val."}</InputAdornment> }} />
                  </Stack>
                  <Box>
                    <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
                      <TextField label="Valandų per savaitę" type="number" value={f.weekly_hours} sx={{ width: 170 }} required
                        onChange={(e) => setHours(e.target.value)} inputProps={{ min: 1, max: fullH }} />
                      <Stack direction="row" gap={1}>
                        {[fullH, ...QUICK_HOURS.filter((h) => h < fullH)].map((h) => (
                          <Chip key={h} label={h} clickable color={Number(f.weekly_hours) === h ? "primary" : "default"}
                            variant={Number(f.weekly_hours) === h ? "filled" : "outlined"} onClick={() => setHours(h)} />
                        ))}
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        = {workload === 1 ? "visas etatas" : `${String(Math.round(workload * 1000) / 1000).replace(".", ",")} etato`}
                      </Typography>
                    </Stack>
                    <Typography sx={{ fontSize: 12, color: "#667085", mt: .75 }}>
                      Vienoje sutartyje – daugiausia 1 etatas ({fullH} val./sav.). Papildomas darbas toje pačioje įmonėje įforminamas atskiru susitarimu.
                    </Typography>
                    {!f.shortened ? (
                      <Link component="button" type="button" variant="caption" onClick={() => { set({ shortened: true }); setFull(36); }} sx={{ mt: 0.5 }}>
                        Pareigybei taikoma sutrumpinta darbo laiko norma
                      </Link>
                    ) : (
                      <Box sx={{ mt: 1.25, p: 1.5, borderRadius: 2, bgcolor: "#F8FAFC", border: "1px solid #EAECF0" }}>
                        <Stack direction="row" gap={1.5} alignItems="center" flexWrap="wrap">
                          <TextField size="small" label="Visas etatas, val./sav." type="number" value={f.full_time_hours} sx={{ width: 170, bgcolor: "#FFFFFF" }}
                            onChange={(e) => setFull(e.target.value)} inputProps={{ min: 20, max: 39 }}
                            error={!(fullH >= 20 && fullH < 40)} />
                          {[38, 36, 30, 24].map((h) => (
                            <Chip key={h} size="small" label={h} clickable onClick={() => setFull(h)}
                              color={fullH === h ? "primary" : "default"} variant={fullH === h ? "filled" : "outlined"} />
                          ))}
                          <Button size="small" onClick={() => { set({ shortened: false }); setFull(40); }} sx={{ textTransform: "none", ml: "auto" }}>Atšaukti</Button>
                        </Stack>
                        <Typography sx={{ fontSize: 12, color: "#667085", mt: 1 }}>
                          Tik jei teisės aktai šiai pareigybei nustato trumpesnį visą darbo laiką (pvz. pedagogams – 36 val.).
                          Tai ne nepilnas etatas – nepilnam etatui sumažinkite „Valandų per savaitę“.
                        </Typography>
                      </Box>
                    )}
                  </Box>
                  {minWage && <Alert severity="warning">Alga mažesnė už minimalią (MMA) šiam darbo laikui.</Alert>}
                  <Box>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 500, mb: 1 }}>Darbo laiko apskaita</Typography>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
                      {[["standard", "Standartinė", "Darbo dienomis pagal kalendorių (pvz. Pr–Pn po 8 val.). Darbo laikas – pagal sutartį."],
                        ["summed", "Suminė", "Pamainomis pagal grafiką. Valandų norma skaičiuojama per apskaitinį laikotarpį (pvz. 3 mėn.)."]].map(([v, t, d]) => {
                        const on = f.work_regime === v;
                        return (
                          <Box key={v} onClick={() => set({ work_regime: v })}
                            sx={{ p: 1.5, borderRadius: 2, cursor: "pointer", border: "1.5px solid", borderColor: on ? "#1570EF" : "#EAECF0", bgcolor: on ? "#F5F8FF" : "#FFFFFF" }}>
                            <Stack direction="row" alignItems="center" gap={1}>
                              <Box sx={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid", borderColor: on ? "#1570EF" : "#D0D5DD", display: "grid", placeItems: "center" }}>
                                {on && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#1570EF" }} />}
                              </Box>
                              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{t}</Typography>
                            </Stack>
                            <Typography sx={{ fontSize: 12.5, color: "#667085", mt: .4, ml: 3 }}>{d}</Typography>
                          </Box>
                        );
                      })}
                    </Box>
                    {f.work_regime === "standard" && (
                      <Box mt={2}>
                        <WeekEditor days={f.days} week={f.week} total={Number(f.weekly_hours) || 0}
                          onToggle={toggleDay} onHour={setDayHours} onTemplate={setDays} />
                      </Box>
                    )}
                    {f.work_regime === "summed" && (
                      <SummedPeriodBox startDate={f.start_date} months={pm} anchor={pa} custom={f.period_custom}
                        onCustom={() => set({ period_custom: true, period_months: co.m, period_anchor: norm(co.m, co.a) })}
                        onReset={() => set({ period_custom: false })}
                        onMonths={(m) => set({ period_months: m, period_anchor: 1 })}
                        onAnchor={(a) => set({ period_anchor: a })} />
                    )}
                  </Box>
                </Section>

                <Section title="Kasmetinės atostogos" desc={leave ? `${leave.total} d. d. per metus` : "Skaičiuojama…"}>
                  {leave?.parts?.map((p, i) => (
                    <Stack key={i} direction="row" gap={1} alignItems="center">
                      <BeachAccessOutlinedIcon sx={{ fontSize: 17, color: "#0E7490" }} />
                      <Typography sx={{ fontSize: 13.5 }}><b style={{ fontWeight: 500 }}>{p.days} d. d.</b> – {p.reason}</Typography>
                    </Stack>
                  ))}
                  <Box>
                    <Link component="button" type="button" variant="caption" onClick={() => setLeaveEdit(!leaveEdit)}>
                      {leaveEdit ? "Paslėpti" : "Pailgintos ar papildomos atostogos"}
                    </Link>
                    <Collapse in={leaveEdit}>
                      <Stack direction={{ xs: "column", sm: "row" }} gap={2} mt={1.5}>
                        <TextField size="small" label="Pailgintos pagal profesiją, d.d." type="number" value={f.extended_leave_days}
                          onChange={(e) => set({ extended_leave_days: e.target.value })} helperText="Pvz. mokytojams, medikams (iki 41 d.d.)" fullWidth />
                        <TextField size="small" label="Papildomai pagal sutartį, d.d." type="number" value={f.extra_leave_days}
                          onChange={(e) => set({ extra_leave_days: e.target.value })} helperText="Jei įmonė suteikia daugiau" fullWidth />
                      </Stack>
                    </Collapse>
                  </Box>
                </Section>
              </>
            )}

            {/* ---------- 3. Kiti duomenys ---------- */}
            {step === 2 && (
              <>
                <Section title="Kas suves adresą, banko sąskaitą, NPD ir vaikus?">
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
                    {[["invite", MarkEmailReadOutlinedIcon, "Darbuotojas pats", "Gaus kvietimą į eSavitarną el. paštu ir užpildys duomenis", "Rekomenduojama"],
                      ["manual", EditNoteOutlinedIcon, "Suvesiu pats", "Jei darbuotojas neturi el. pašto ar duomenis jau turite"]].map(([v, I, t, d, tag]) => {
                      const on = f.fill_mode === v;
                      return (
                        <Box key={v} onClick={() => set({ fill_mode: v })}
                          sx={{ p: 1.75, borderRadius: 2, cursor: "pointer", border: "1.5px solid", borderColor: on ? "#1570EF" : "#EAECF0", bgcolor: on ? "#F5F8FF" : "#FFFFFF" }}>
                          <Stack direction="row" gap={1.25} alignItems="flex-start">
                            <Box sx={{ width: 34, height: 34, borderRadius: 2, bgcolor: on ? "#1570EF" : "#F2F4F7", display: "grid", placeItems: "center", flexShrink: 0 }}>
                              <I sx={{ fontSize: 19, color: on ? "#FFFFFF" : "#475467" }} />
                            </Box>
                            <Box>
                              <Stack direction="row" gap={1} alignItems="center">
                                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{t}</Typography>
                                {tag && <Chip size="small" label={tag} sx={{ height: 20, fontSize: 11, bgcolor: "#ECFDF3", color: "#027A48" }} />}
                              </Stack>
                              <Typography sx={{ fontSize: 12.5, color: "#667085", mt: .3 }}>{d}</Typography>
                            </Box>
                          </Stack>
                        </Box>
                      );
                    })}
                  </Box>
                  {f.fill_mode === "invite" && !f.email && (
                    <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => setStep(0)}>Įvesti</Button>}>
                      Kvietimui išsiųsti reikia darbuotojo el. pašto.
                    </Alert>
                  )}
                </Section>
                <Collapse in={f.fill_mode === "manual"}>
                  <Section title="Duomenys">
                    <TextField label="Banko sąskaita (IBAN)" value={f.iban} onChange={(e) => set({ iban: e.target.value.toUpperCase().replace(/\s/g, "") })} />
                    <TextField label="Gyvenamoji vieta" value={f.address} onChange={(e) => set({ address: e.target.value })} />
                    <FormControl fullWidth>
                      <InputLabel>Neapmokestinamasis pajamų dydis (NPD)</InputLabel>
                      <Select label="Neapmokestinamasis pajamų dydis (NPD)" value={f.npd_mode} MenuProps={MENU_PROPS} onChange={(e) => set({ npd_mode: e.target.value })}>
                        {NPD_MODES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <Divider />
                    <FormControlLabel control={<Switch checked={f.pension_accumulation} onChange={(e) => set({ pension_accumulation: e.target.checked })} />}
                      label={<Typography sx={{ fontSize: 14 }}>Kaupia pensiją II pakopoje (+3 %)</Typography>} />
                    <FormControlLabel control={<Switch checked={f.single_parent} onChange={(e) => set({ single_parent: e.target.checked })} />}
                      label={<Typography sx={{ fontSize: 14 }}>Vienas (-a) augina vaiką iki 14 m. arba vaiką su negalia iki 18 m.</Typography>} />
                    <Typography sx={{ fontSize: 12.5, color: "#667085" }}>Vaikus pridėsite darbuotojo kortelėje („Šeima“).</Typography>
                  </Section>
                </Collapse>
              </>
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </Box>

        {/* ---------- santrauka ---------- */}
        <Box sx={{ bgcolor: "#FFFFFF", borderLeft: { md: "1px solid #EAECF0" }, p: 2.5, overflowY: "auto" }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#667085", letterSpacing: .4 }}>SANTRAUKA</Typography>
          <Typography sx={{ fontSize: 16, fontWeight: 600, mt: 1, color: f.first_name ? "#101828" : "#98A2B3" }}>
            {`${f.first_name} ${f.last_name}`.trim() || "Vardas Pavardė"}
          </Typography>
          <Typography sx={{ fontSize: 13, color: "#667085" }}>{positionLabel || "Pareigos"}</Typography>
          <Stack gap={1} mt={2}>
            {[["Darbo pradžia", f.start_date || "–"],
              ["Sutartis", `${type?.label || ""}${needsEnd && f.end_date ? ` iki ${f.end_date}` : ""}`],
              ["Darbo laikas", `${f.weekly_hours || 0} val./sav. · ${workload === 1 ? "visas etatas" : `${String(Math.round(workload * 1000) / 1000).replace(".", ",")} etato`}`],
              ["Apskaita", f.work_regime === "summed" ? `Suminė · ${pm} mėn.` : "Standartinė"],
              ...(f.work_regime === "standard" ? [["Darbo dienos", weekLabel(f.days, f.week)]] : []),
              ...(Number(f.probation_months) ? [["Išbandymas", `${f.probation_months} mėn.`]] : []),
              ["Atlyginimas", Number(f.base_amount) > 0 ? `${money(f.base_amount)} ${f.pay_form === "monthly" ? "/ mėn." : "/ val."}` : "–"],
              ["Atostogos", leave ? `${leave.total} d. d. per metus` : "–"],
            ].map(([l, v]) => (
              <Stack key={l} direction="row" justifyContent="space-between" gap={1}>
                <Typography sx={{ fontSize: 13, color: "#667085" }}>{l}</Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 500, textAlign: "right" }}>{v}</Typography>
              </Stack>
            ))}
          </Stack>
          {est && Number(f.base_amount) > 0 && (
            <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: "#F5F8FF" }}>
              <Typography sx={{ fontSize: 12, color: "#475467" }}>Į rankas apytiksliai</Typography>
              <Typography sx={{ fontSize: 22, fontWeight: 600, color: "#1D4ED8" }}>{money(est.net)}</Typography>
              <Typography sx={{ fontSize: 12, color: "#475467" }}>Įmonei kainuos {money(est.cost)} per mėnesį</Typography>
            </Box>
          )}
          <Divider sx={{ my: 2 }} />
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#667085", letterSpacing: .4, mb: 1 }}>KAS BUS PADARYTA</Typography>
          <Stack gap={1.25}>
            <Stack direction="row" gap={1}><DescriptionOutlinedIcon sx={{ fontSize: 18, color: "#475467" }} />
              <Typography sx={{ fontSize: 12.5, color: "#344054" }}>Sukurta darbo sutartis – dokumentą paruošite kortelėje</Typography></Stack>
            <Stack direction="row" gap={1}><AccountBalanceOutlinedIcon sx={{ fontSize: 18, color: "#475467" }} />
              <Typography sx={{ fontSize: 12.5, color: "#344054" }}>Paruoštas <b style={{ fontWeight: 500 }}>1-SD</b> – pateikti Sodrai iki <b style={{ fontWeight: 500 }}>{sd1 || "–"}</b></Typography></Stack>
            {f.fill_mode === "invite" && (
              <Stack direction="row" gap={1}><MarkEmailReadOutlinedIcon sx={{ fontSize: 18, color: "#475467" }} />
                <Typography sx={{ fontSize: 12.5, color: "#344054" }}>Kvietimas į eSavitarną – {f.email || "nurodykite el. paštą"}</Typography></Stack>
            )}
          </Stack>
        </Box>
      </Box>

      {/* apačia */}
      <Stack direction="row" alignItems="center" gap={1} sx={{ px: 3, py: 1.75, bgcolor: "#FFFFFF", borderTop: "1px solid #EAECF0" }}>
        <Typography sx={{ fontSize: 12.5, color: "#667085", mr: "auto" }}>
          {missing[step].length ? `Šiame žingsnyje trūksta: ${missing[step].join(", ")}` : allMissing.length ? `Dar trūksta: ${allMissing.join(", ")}` : "Viskas užpildyta"}
        </Typography>
        {step > 0 && <Button onClick={() => setStep(step - 1)} sx={{ ...BTN_SX, fontWeight: 500, color: "#344054" }}>Atgal</Button>}
        {step < STEPS.length - 1 ? (
          <Button variant="contained" disabled={missing[step].length > 0} onClick={() => setStep(step + 1)} sx={BTN_SX}>Toliau</Button>
        ) : (
          <Button variant="contained" disabled={saving || allMissing.length > 0} onClick={save} sx={BTN_SX}>Sukurti darbuotoją</Button>
        )}
      </Stack>
    </Dialog>
  );
}
