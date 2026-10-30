import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, IconButton, LinearProgress, MenuItem, Paper, Radio, RadioGroup, Table, TableBody,
  Switch, TableCell, TableContainer, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CheckIcon from "@mui/icons-material/Check";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DownloadIcon from "@mui/icons-material/Download";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import { useNavigate } from "react-router-dom";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import "dayjs/locale/lt";

import { apiError, payrollApi } from "../api/payroll";

const STEPS = ["Ataskaitos", "Darbuotojai", "Patvirtinimas"];
const SHOW_ACCOUNTING = false;                       // DK įrašai perėjimui - kai bus pilna apskaita
const surfaceSx = { borderRadius: 3, border: "1px solid", borderColor: "divider", boxShadow: "none" };
const ym = (d) => String(d || "").slice(0, 7);
const money = (v) => new Intl.NumberFormat("lt-LT", { style: "currency", currency: "EUR" }).format(Number(v || 0));
const menuProps = { MenuProps: { disableScrollLock: true } };

const WORK_MODES = [
  ["01", "Nekintanti darbo dienos (pamainos) trukmė"],
  ["02", "Suminė darbo laiko apskaita"],
  ["03", "Lankstus darbo grafikas"],
  ["04", "Suskaidytos darbo dienos laiko režimas"],
  ["05", "Individualus darbo laiko režimas"],
];
const NPD = [["standard", "Taikomas"], ["none", "Netaikomas"], ["d30_55", "30–55 % dalyvumo"], ["d0_25", "0–25 % dalyvumo"]];

const HELP = {
  profession: "Profesija iš Lietuvos profesijų klasifikatoriaus (6 skaitmenys). Pagal ją sudaromos pareigybių grupės – SDUP ir darbo apmokėjimo sistemai.",
  salary: "Pareiginė alga pagal darbo sutartį už mėnesį (bruto, be premijų). Valandiniam apmokėjimui – įkainis už valandą. Pasiūlyta pagal Sodrą – patikrinkite.",
  sickFrom: "Kada prasidėjo nedarbingumas. Darbdavys moka už 2 pirmąsias ligos dienas, toliau – Sodra. Jei kuri iš jų patenka į DU pradžią, DokSkenas ją apmokės automatiškai.",
  sickPaid: "Ligos išmoka iš darbdavio lėšų už dienas iki DU pradžios, kurią išmokėjo sena programa. Reikalinga NP-SD2 pranešimui Sodrai (jei jo dar nepateikė sena programa).",
  week: "Kuriomis dienomis ir kiek valandų dirba. Numatytoji – Pr–Pn po lygiai pagal normą. Norma = dienų valandų suma.",
  regime: "Standartinė – kiekvieną darbo dieną tiek pat valandų. Suminė – dirbama pagal grafikus, valandos sumuojamos per apskaitinį laikotarpį.",
  leaveDays: "Įstatymo minimumas – 20 darbo dienų (6 d. savaitei – 24). Pakeiskite tik jei sutartyje daugiau. Papildomos dienos už vaikus, neįgalumą ar stažą pridedamos automatiškai.",
  gpmYtd: "Išskaičiuotas GPM už šių metų mėnesius iki perėjimo – iš senos programos. Reikia metinei GPM312: iš GPM313 matome tik visos įmonės sumą, o darbuotojams NPD taikomas skirtingai.",
  transition: "Kur darbuotojas yra pirmą DU dieną DokSkene. Jei atostogose ar serga – nurodykite iki kada, kad nebūtų apmokėta dar kartą.",
  prepaid: "Atostoginiai už DU mėnesio dienas, kuriuos jau išmokėjo sena programa – DokSkenas jų nemokės dar kartą.",
  pension: "Kaupia pensijai II pakopoje – nustatyta pagal Sodros įmokų tarifą.",
  singleParent: "Vienas augina vaiką iki 14 m. – teisė į ilgesnes atostogas ir papildomas poilsio dienas.",
  payOnce: "Darbuotojo prašymu DU mokamas vieną kartą per mėnesį (DK 139 str.) – avansas nemokamas.",
  advance: "Tuščia – pagal įmonės nustatymus (avanso procentas).",
  email: "Reikalingas kvietimui į eSavitarną. Galite įvesti ir vėliau kortelėje.",
  norm: "Vidutinė savaitės norma iš darbo sutarties: visu etatu – 40, puse etato – 20. Jei sutartyje nurodyta per mėnesį ar apskaitinį laikotarpį – padalinkite valandas iš to laikotarpio savaičių skaičiaus (pvz. 488 val. per 3 mėn. ≈ 40 val.).",
  mode: "Darbo laiko režimas pagal darbo sutartį ar darbo tvarkos taisykles. Kodai – kaip Sodros SDUP.",
  vacation: "Kiek kasmetinių atostogų dienų liko dieną prieš perėjimą (iš senos programos), pvz. 12,5.",
  unpaid: "Kiek DU (į rankas) perėjimo dienai dar neišmokėta, pvz. praėjusio mėnesio atlyginimas. Pasiūlyta automatiškai, jei DU mokamas kitą mėnesį.",
  npd: "Nustatyta pagal GPM313: jei GPM lygus 20 % nuo išmokų – NPD netaikytas.",
  disability: "Ar darbuotojui nustatytas 0–55 % dalyvumo lygis (neįgalumas). Nuo jo priklauso atostogų trukmė (25 d.). Nepriklauso nuo NPD taikymo.",
  vdu: "Vidutinis darbo užmokestis iš senos programos – rasite atostoginių skaičiavime arba VDU pažymoje. Standartinei apskaitai – už dieną, suminei ar valandiniam – už valandą. Neįvedus skaičiuosime iš Sodros duomenų: į juos patenka atostoginiai ir premijos, todėl pirmų 3 mėn. atostoginiai ir ligos išmoka gali būti netikslūs.",
  children: "Vaikai reikalingi papildomoms poilsio dienoms (mamadieniams), papildomoms atostogoms ir vaiko priežiūros atostogoms.",
  summedWorked: "Visos faktiškai dirbtos valandos šio apskaitinio laikotarpio mėnesiais iki perėjimo (įskaitant viršvalandžius, naktinį darbą, darbą poilsio ir švenčių dienomis, komandiruotes).",
  summedAbsence: "Atostogos, liga, mamadieniai, nemokamos ir mokymosi atostogos ir pan. – pagal grafiko valandas (atostogos savaitėmis – po 40 val. per savaitę). Prastovos neįskaitykite. Šios valandos sumažina normą.",
  summedPaidOt: "Tik jei sena programa šiame laikotarpyje jau sumokėjo viršvalandžius (pvz. dirbta ilgiau nei pamaina). Kitaip – 0.",
};

// ----------------------------------------------------------------------------------------------------
// Ataskaitos
// ----------------------------------------------------------------------------------------------------

function reportRows(data) {
  const s = data.summary || {};
  const files = s.files || [];
  const forms = (...f) => files.filter((x) => f.includes(String(x.form || "").replace(/-/g, "")));
  const sd = s.sdup_check || {};
  // dar neanalizuota (nėra failų / po „Pradėti iš naujo“) - reikalingi mėnesiai pagal DU pradžią
  const du = dayjs(data.du_start).startOf("month");
  const defFrom = du.subtract(1, "year").month(9).startOf("month");      // nuo praeitų metų spalio
  const monthsBetween = (a, b) => {
    const out = [];
    for (let d = a; d.isBefore(b); d = d.add(1, "month")) out.push({ ym: d.format("YYYY-MM"), ok: false });
    return out;
  };
  const income = s.checklist?.income || monthsBetween(defFrom, du);
  const gpm = s.checklist?.gpm313 || monthsBetween(du.startOf("year"), du);
  const from = s.history_from || (income.length ? defFrom.format("YYYY-MM-DD") : null);
  const period = from ? `${from} – šiandien` : "Kol kas nereikia";
  const year = Number(String(data.du_start).slice(0, 4));
  const months = (items, codes) => {
    if (!items.length) return { state: "notneeded", text: "Kol kas nereikia" };
    const missing = items.filter((x) => !x.ok).map((x) => x.ym);
    if (!missing.length) return { state: "ok", text: "Įkelta" };
    if (!forms(...codes).length) return { state: "missing", text: "Neįkelta" };
    return { state: "partial", text: `${items.length - missing.length} iš ${items.length} mėn.`, issue: `Trūksta: ${missing.join(", ")}.` };
  };
  const s29 = !forms("S29").length ? { state: "missing", text: "Neįkelta" }
    : sd.s29_fresh ? { state: "ok", text: "Įkelta" }
      : { state: "partial", text: "Pasenusi", issue: `Įkelta ataskaita ${sd.s29_date || ""} datai. Atsisiųskite šiandienos datai – kitaip sąrašas gali būti netikslus.` };
  return [
    { code: "S29", name: "S29 – apdraustųjų sąrašas", src: "Sodra · XML", why: "Darbuotojai, darbo pradžia, profesijos",
      period: "Šiandienos datai", ...s29, files: forms("S29") },
    { code: "S50", name: "S50 – SD įmokos", src: "Sodra · XML", why: "Atlyginimai, VDU, metų sumos", period,
      ...months(income, ["S50", "SAM"]), files: forms("S50", "SAM") },
    { code: "S31", name: "S31 – apdraustųjų laikotarpiai", src: "Sodra · XML", why: "Priėmimo ir atleidimo datos", period,
      ...(forms("S31", "1SD").length ? { state: "ok", text: "Įkelta" } : { state: "missing", text: "Neįkelta" }), files: forms("S31", "1SD") },
    { code: "GPM313", name: "GPM313 – mėnesio deklaracijos", src: "VMI EDS · FFDATA", why: "Išmokėtos sumos ir GPM",
      period: `Kiekvienas ${year} m. mėnuo iki DU pradžios`, ...months(gpm, ["GPM313"]), files: forms("GPM313") },
    { code: "S4S5", name: "S4, S5 – vaiko priežiūra, nemokamos atostogos", src: "Sodra · XML", why: "Tik jei tokių laikotarpių buvo",
      period, optional: true, ...(forms("S4", "S5", "9SD", "12SD").length ? { state: "ok", text: "Įkelta" } : { state: "optional", text: "Neįkelta" }),
      files: forms("S4", "S5", "9SD", "12SD") },
    { code: "S15", name: "S15 – nedarbingumo pažymėjimai", src: "Sodra · XML", why: "Tikslesnis VDU, liga perėjimo dieną",
      period: `${du.subtract(3, "month").format("YYYY-MM-DD")} – šiandien`, optional: true, recommended: true,
      ...(forms("S15").length ? { state: "ok", text: "Įkelta" } : { state: "optional", text: "Neįkelta" }),
      issue: !forms("S15").length && s.sick_suspect?.length
        ? `GPM313 rodo darbdavio apmokėtas ligos dienas (${s.sick_suspect.join(", ")}) – įkelkite S15, kad ligos dienos nebūtų įskaičiuotos į VDU.`
        : undefined,
      files: forms("S15") },
    { code: "GPM312", name: "GPM312 – metinė deklaracija", src: "VMI EDS · FFDATA", why: "Kitos išmokos gyventojams (nuoma ir pan.)",
      period: `${year - 1} m.`, optional: true,
      ...(forms("GPM312").length ? { state: "ok", text: "Įkelta" } : { state: "optional", text: "Neįkelta" }), files: forms("GPM312") },
  ];
}

const STATE_ICON = {
  ok: <CheckCircleIcon sx={{ fontSize: 18, color: "success.main" }} />,
  notneeded: <CheckCircleIcon sx={{ fontSize: 18, color: "text.disabled" }} />,
  partial: <WarningAmberOutlinedIcon sx={{ fontSize: 18, color: "warning.main" }} />,
  missing: <CancelOutlinedIcon sx={{ fontSize: 18, color: "error.main" }} />,
  optional: <RadioButtonUncheckedIcon sx={{ fontSize: 18, color: "text.disabled" }} />,
};
const STATE_COLOR = { ok: "success.main", notneeded: "text.secondary", partial: "warning.dark", missing: "error.main", optional: "text.secondary" };

function ReportsStep({ data, busy, locked, onUpload, onAction, issues }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [howTo, setHowTo] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [start, setStart] = useState(ym(data.du_start));
  useEffect(() => setStart(ym(data.du_start)), [data.du_start]);
  const rows = reportRows(data);
  const files = data.summary?.files || [];
  const grid = { display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0,1.4fr) minmax(0,1.3fr) minmax(0,1.1fr) 130px" }, columnGap: 2, rowGap: 0.5 };
  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, flexWrap: "wrap", mb: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: 17, fontWeight: 800 }}>Ataskaitos iš Sodros ir VMI</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.25 }}>Iš jų užpildysime darbuotojus, atlyginimus ir DU istoriją.</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <DateField month label="DU skaičiuosite nuo" value={start ? `${start}-01` : null} disabled={locked}
            onChange={(v) => setStart(ym(v))} width={190} />
          {!locked && start && start !== ym(data.du_start) && (
            <Button size="small" variant="contained" disableElevation disabled={busy}
              onClick={() => onAction({ action: "start", du_start: `${start}-01` })} sx={{ textTransform: "none" }}>Išsaugoti</Button>
          )}
        </Box>
      </Box>

      <Paper sx={{ ...surfaceSx, overflow: "hidden" }}>
        <Box sx={{ ...grid, px: 2, py: 1, bgcolor: "#F6F8FB", display: { xs: "none", md: "grid" } }}>
          {["Ataskaita", "Kam reikia", "Laikotarpis", "Būsena"].map((h) => (
            <Typography key={h} sx={{ fontSize: 12, color: "text.secondary", fontWeight: 600 }}>{h}</Typography>
          ))}
        </Box>
        {rows.map((r) => (
          <Box key={r.code} sx={{ px: 2, py: 1.25, borderTop: "1px solid", borderColor: "divider" }}>
            <Box sx={grid}>
              <Box>
                <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>
                  {r.name}{r.optional && <Chip size="small" label={r.recommended ? "rekomenduojama" : "nebūtina"} variant="outlined"
                    color={r.recommended ? "primary" : "default"} sx={{ ml: 0.75, height: 18, fontSize: 10.5 }} />}
                </Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{r.src}</Typography>
              </Box>
              <Typography sx={{ fontSize: 13 }}>{r.why}</Typography>
              <Typography sx={{ fontSize: 13 }}>{r.period}</Typography>
              <Tooltip arrow title={r.files.length ? r.files.map((f) => f.name).join(", ") : ""}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, color: STATE_COLOR[r.state] }}>
                  {STATE_ICON[r.state]}<Typography sx={{ fontSize: 13, color: "inherit" }}>{r.text}</Typography>
                </Box>
              </Tooltip>
            </Box>
            {r.issue && (
              <Box sx={{ mt: 0.75, px: 1.25, py: 0.75, borderRadius: 1.5, bgcolor: "#FFF4E5", color: "#7A4A00", fontSize: 12.5 }}>{r.issue}</Box>
            )}
          </Box>
        ))}
      </Paper>

      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 0.75 }}>
        <Button size="small" onClick={() => setHowTo((v) => !v)} endIcon={howTo ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          sx={{ textTransform: "none", fontSize: 12.5 }}>Kaip atsisiųsti?</Button>
      </Box>
      <Collapse in={howTo}>
        <Box sx={{ mb: 1, p: 1.5, borderRadius: 2, bgcolor: "#F6F8FB", fontSize: 12.5, lineHeight: 1.7 }}>
          <div><b>Sodra:</b> <a href="https://draudejai.sodra.lt/" target="_blank" rel="noopener noreferrer">draudejai.sodra.lt</a> → Ataskaitos → pasirinkite ataskaitą → formatas XML → laikotarpis kaip lentelėje.</div>
          <div><b>VMI:</b> <a href="https://deklaravimas.vmi.lt/" target="_blank" rel="noopener noreferrer">EDS</a> → Pateikti dokumentai ir formos → Pateiktos formos → GPM313 → Atsisiųsti.</div>
        </Box>
      </Collapse>

      {!locked && (
        <Box onDragEnter={(e) => { e.preventDefault(); setDrag(true); }} onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={(e) => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false); }}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) onUpload(e.dataTransfer.files); }}
          sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 1.75, py: 1.25, borderRadius: 2,
            border: "1.5px dashed", borderColor: drag ? "primary.main" : "#B8CDF4", bgcolor: drag ? "action.selected" : "transparent" }}>
          {busy ? <CircularProgress size={20} /> : <UploadFileIcon sx={{ color: "primary.main" }} />}
          <Typography sx={{ flex: 1, fontSize: 13 }}>Nutempkite visus failus čia – atpažinsime patys</Typography>
          <Button size="small" variant="outlined" disabled={busy} onClick={() => inputRef.current?.click()} sx={{ textTransform: "none" }}>Pasirinkti failus</Button>
          <input hidden ref={inputRef} multiple type="file" accept=".xml,.ffdata,.zip" onChange={(e) => { onUpload(e.target.files); e.target.value = ""; }} />
        </Box>
      )}

      {(files.length > 0 || issues.length > 0) && (
        <Box sx={{ mt: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography sx={{ fontSize: 12.5, color: issues.length ? "error.main" : "text.secondary" }}>
              Įkelta failų: {files.length}{issues.length ? ` · netiko: ${issues.length}` : ""}
            </Typography>
            <Button size="small" onClick={() => setShowFiles((v) => !v)} sx={{ textTransform: "none", fontSize: 12.5, minWidth: 0 }}>
              {showFiles || issues.length ? "slėpti" : "rodyti"}
            </Button>
          </Box>
          <Collapse in={showFiles || issues.length > 0}>
            <Box sx={{ mt: 0.5, display: "grid", gap: 0.25 }}>
              {issues.map((x, i) => (
                <Typography key={`i${i}`} sx={{ fontSize: 12.5, color: "error.main" }}>✕ {x.name} – {x.reason}</Typography>
              ))}
              {files.map((f) => (
                <Box key={f.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Chip size="small" label={f.form} sx={{ height: 20, fontSize: 10.5, minWidth: 52 }} />
                  <Typography sx={{ fontSize: 12.5, flex: 1 }} noWrap>
                    {f.name}{f.period ? ` · ${f.period[0] ? `${f.period[0]} – ` : ""}${f.period[1]}` : f.year ? ` · ${f.year}-${String(f.month || "").padStart(2, "0")}` : ""}
                  </Typography>
                  {!locked && <IconButton size="small" onClick={() => onAction({ action: "remove_file", id: f.id })}><DeleteOutlineIcon sx={{ fontSize: 16 }} /></IconButton>}
                </Box>
              ))}
            </Box>
          </Collapse>
        </Box>
      )}
    </Box>
  );
}

// ----------------------------------------------------------------------------------------------------
// Darbuotojai
// ----------------------------------------------------------------------------------------------------

function HeadHelp({ label, help }) {
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, whiteSpace: "nowrap" }}>
      {label}
      {help && <Tooltip arrow title={<Typography sx={{ fontSize: 12.5, lineHeight: 1.5 }}>{help}</Typography>}>
        <HelpOutlineIcon sx={{ fontSize: 15, color: "text.secondary", cursor: "help" }} />
      </Tooltip>}
    </Box>
  );
}

const toComma = (v) => (v === null || v === undefined || v === "" ? "" : String(v).replace(".", ","));
const toDot = (v) => String(v ?? "").replace(/\s/g, "").replace(",", ".");

// Skaičiai visada su kableliu: vartotojas gali įvesti ir taškelį – rodoma „1850,50“, į serverį siunčiama „1850.50“
function Num({ value, onSave, disabled, width = 90, error, suffix, placeholder }) {
  const [v, setV] = useState(toComma(value));
  useEffect(() => setV(toComma(value)), [value]);
  const bad = v !== "" && Number.isNaN(Number(toDot(v)));
  return (
    <TextField size="small" value={v} disabled={disabled} error={error || bad} sx={{ width }} placeholder={placeholder}
      inputProps={{ inputMode: "decimal" }}
      onChange={(e) => setV(e.target.value.replace(".", ",").replace(/[^\d,\s-]/g, ""))}
      onBlur={() => { if (bad) return; const out = v === "" ? "" : toDot(v); if (out !== String(value ?? "")) onSave(out); }}
      InputProps={suffix ? { endAdornment: <Typography sx={{ fontSize: 12, color: "text.secondary", whiteSpace: "nowrap" }}>{suffix}</Typography> } : undefined} />
  );
}

function DateField({ value, onChange, disabled, error, month = false, width = 160, label }) {
  return (
    <DatePicker label={label} value={value ? dayjs(value) : null} disabled={disabled}
      views={month ? ["year", "month"] : ["year", "month", "day"]} format={month ? "YYYY-MM" : "YYYY-MM-DD"}
      onChange={(d) => d && d.isValid() && onChange(month ? d.startOf("month").format("YYYY-MM-DD") : d.format("YYYY-MM-DD"))}
      slotProps={{ textField: { size: "small", error, sx: { width } }, popper: { disablePortal: false } }} />
  );
}

function Sel({ value, options, onChange, disabled, width = 120, error }) {
  return (
    <TextField select size="small" value={value ?? ""} disabled={disabled} error={error} sx={{ width }}
      onChange={(e) => onChange(e.target.value)} SelectProps={menuProps}>
      {options.map(([v, l]) => <MenuItem key={v} value={v} sx={{ fontSize: 13 }}>{l}</MenuItem>)}
    </TextField>
  );
}

function ProfessionPicker({ p, locked, onPerson, width = 250 }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState([]);
  const inCategory = !!p.lpk4 && (p.lpk_options || []).length > 0;
  useEffect(() => {
    if (inCategory || q.trim().length < 2) { setFound([]); return undefined; }
    const t = setTimeout(() => {
      payrollApi.searchPositions(q).then((r) => setFound((r.lpk || []).map((x) => ({ code: x.code, name: x.name })))).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q, inCategory]);
  const value = p.lpk_code ? { code: p.lpk_code, name: p.lpk_name || p.lpk_code } : null;
  return (
    <Box sx={{ width }}>
      <Autocomplete size="small" disabled={locked} value={value} options={inCategory ? p.lpk_options : found}
        isOptionEqualToValue={(a, b) => a.code === b.code} getOptionLabel={(o) => o?.name || ""}
        filterOptions={inCategory ? undefined : (x) => x}
        onInputChange={(_, v, reason) => reason === "input" && setQ(v)}
        onChange={(_, v) => v && onPerson(p.id, { lpk_code: v.code })}
        renderOption={(props, o) => (
          <li {...props} key={o.code}><Box>
            <Typography sx={{ fontSize: 13 }}>{o.name}</Typography>
            <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{o.code}</Typography>
          </Box></li>
        )}
        noOptionsText={inCategory ? "Nėra" : "Įveskite pavadinimą arba kodą"}
        renderInput={(params) => <TextField {...params} placeholder={inCategory ? "Pasirinkite" : "Ieškoti: pavadinimas ar kodas"} error={!p.lpk_code} />} />
      {inCategory && <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.25 }}>
        Sodroje: grupė {p.lpk4}{!locked && <> · <Box component="span" onClick={() => onPerson(p.id, { lpk4: "", lpk_code: "" })}
          sx={{ color: "primary.main", cursor: "pointer", "&:hover": { textDecoration: "underline" } }}>kita profesija</Box></>}
      </Typography>}
    </Box>
  );
}

const isForeign = (p) => String(p?.person_code || "").startsWith("SD");
const codeLabel = (p) => (isForeign(p) ? `SD ${p.person_code.slice(2)} · užsienietis`
  : `${p.person_code.slice(0, 3)}••••${p.person_code.slice(-2)}`);
const SD_RE = /^[A-Z]{2}\d{7}$/;
const MONTHS_GEN = ["sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio", "liepos", "rugpjūčio", "rugsėjo", "spalio",
  "lapkričio", "gruodžio"];
const WEEK_DAYS = ["Pr", "An", "Tr", "Kt", "Pn", "Š", "S"];
const num2 = (v) => Number(v || 0).toLocaleString("lt-LT", { maximumFractionDigits: 2 });

// Savaitės grafikas: įvestas Pr–S arba tolygiai Pr–Pn pagal normą
function weekOf(p) {
  if (Array.isArray(p.week_hours) && p.week_hours.length === 7) return p.week_hours.map(Number);
  const d = Number(p.weekly_hours || 40) / 5;
  return [d, d, d, d, d, 0, 0];
}

function weekLabel(w) {
  const on = w.map((h, i) => [i, h]).filter(([, h]) => h > 0);
  if (!on.length) return "";
  const same = on.every(([, h]) => h === on[0][1]);
  const consecutive = on.every(([i], k) => k === 0 || i === on[k - 1][0] + 1);
  if (same) return `${consecutive && on.length > 1 ? `${WEEK_DAYS[on[0][0]]}–${WEEK_DAYS[on[on.length - 1][0]]}` : on.map(([i]) => WEEK_DAYS[i]).join(", ")} po ${num2(on[0][1])} val.`;
  return on.map(([i, h]) => `${WEEK_DAYS[i]} ${num2(h)}`).join(", ");
}

function weekShort(w) {
  const on = w.filter((h) => h > 0);
  return on.every((h) => h === on[0]) ? weekLabel(w) : `${on.length} d. · skirtingai`;
}

function AddPersonDialog({ open, onClose, onAdd, busy }) {
  const empty = { first_name: "", last_name: "", person_code: "", weekly_hours: "40", work_time_mode: "01",
    is_foreigner: false, sd_number: "", birth_date: "", gender: "" };
  const [f, setF] = useState(empty);
  useEffect(() => { if (open) setF(empty); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const names = f.first_name.trim() && f.last_name.trim();
  const ok = names && (f.is_foreigner ? SD_RE.test(f.sd_number) && f.birth_date && f.gender : /^\d{11}$/.test(f.person_code.trim()));
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" disableScrollLock>
      <DialogTitle>Naujas darbuotojas</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 1.75, pt: "8px !important" }}>
        <TextField size="small" label="Vardas" value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} />
        <TextField size="small" label="Pavardė" value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} />
        <Sw label="Užsienietis – neturi Lietuvos asmens kodo" checked={f.is_foreigner}
          help="Užsieniečiui Sodra suteikia socialinio draudimo (SD) numerį, pvz. AB1234567 – jis naudojamas SAM, 1-SD ir kitose ataskaitose vietoj asmens kodo."
          onChange={(v) => setF({ ...f, is_foreigner: v })} />
        {f.is_foreigner ? (
          <>
            <TextField size="small" label="SD numeris" placeholder="AB1234567" value={f.sd_number} inputProps={{ maxLength: 9 }}
              error={!!f.sd_number && !SD_RE.test(f.sd_number)} helperText="2 raidės ir 7 skaitmenys – iš Sodros"
              onChange={(e) => setF({ ...f, sd_number: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} />
            <DateField label="Gimimo data" value={f.birth_date || null} width="100%" onChange={(v) => setF({ ...f, birth_date: v })} />
            <FL label="Lytis" help="Reikalinga SDUP ataskaitai (lietuviams nustatoma pagal asmens kodą).">
              <Seg value={f.gender} options={[["M", "Vyras"], ["F", "Moteris"]]} onChange={(v) => setF({ ...f, gender: v })} />
            </FL>
          </>
        ) : (
          <TextField size="small" label="Asmens kodas" value={f.person_code} inputProps={{ inputMode: "numeric", maxLength: 11 }}
            onChange={(e) => setF({ ...f, person_code: e.target.value.replace(/\D/g, "") })} />
        )}
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Kitus duomenis užpildysite atidarę darbuotoją.</Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ textTransform: "none" }}>Atšaukti</Button>
        <Button variant="contained" disableElevation disabled={!ok || busy} onClick={() => onAdd(f)} sx={{ textTransform: "none" }}>Pridėti</Button>
      </DialogActions>
    </Dialog>
  );
}

function ChildrenDialog({ person, onClose, onSave }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { setRows(person ? (person.children || []).map((c) => ({ ...c })) : []); }, [person]);
  if (!person) return null;
  const upd = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" disableScrollLock>
      <DialogTitle>Vaikai – {person.first_name} {person.last_name}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 1.25, pt: "8px !important" }}>
        {rows.map((r, i) => (
          <Box key={i} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <TextField size="small" label="Vardas" value={r.first_name || ""} onChange={(e) => upd(i, { first_name: e.target.value })} sx={{ flex: 1 }} />
            <DateField label="Gimimo data" value={r.birth_date} onChange={(v) => upd(i, { birth_date: v })} width={170} />
            <IconButton size="small" onClick={() => setRows(rows.filter((_, j) => j !== i))}><DeleteOutlineIcon sx={{ fontSize: 18 }} /></IconButton>
          </Box>
        ))}
        <Button size="small" startIcon={<AddIcon />} onClick={() => setRows([...rows, { first_name: "", birth_date: "" }])}
          sx={{ textTransform: "none", justifySelf: "start" }}>Pridėti vaiką</Button>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Atšaukti</Button>
        <Button variant="contained" disableElevation onClick={() => onSave(rows.filter((r) => r.birth_date))}>Išsaugoti</Button>
      </DialogActions>
    </Dialog>
  );
}

const TRANSITION = [
  ["work", "Dirba"], ["vacation", "Kasmetinės atostogos"], ["sick", "Liga"], ["childcare", "Vaiko priežiūros atostogos"],
  ["maternity", "Nėštumo ir gimdymo atostogos"], ["paternity", "Tėvystės atostogos"], ["unpaid", "Nemokamos atostogos"],
];

export function peopleMissing(people) {
  const act = people.filter((p) => p.include && p.employed);
  const cnt = (fn) => act.filter(fn).length;
  const parts = [
    ["profesija", cnt((p) => !p.lpk_code)], ["darbo pradžia", cnt((p) => !p.start_date)],
    ["alga", cnt((p) => !(Number(p.base_amount) > 0))], ["norma", cnt((p) => !(Number(p.weekly_hours) > 0))],
    ["atostogų likutis", cnt((p) => p.vacation_balance === null || p.vacation_balance === "")],
    ["suminės apskaitos dirbtos val.", cnt((p) => p.summed_mid_period && (p.summed_worked_hours === null || p.summed_worked_hours === ""))],
    ["nebuvimo pabaiga", cnt((p) => (p.transition_state || "work") !== "work" && !p.transition_until)],
    ["ligos pradžia", cnt((p) => p.transition_state === "sick" && !p.transition_from)],
    ["gimimo data, lytis", cnt((p) => isForeign(p) && (!p.birth_date || !p.gender))],
  ].filter(([, n]) => n > 0);
  return { active: act.length, parts };
}

function rowMissing(p) {
  if (!p.employed) return 0;
  return [!p.lpk_code, !p.start_date, !(Number(p.base_amount) > 0), !(Number(p.weekly_hours) > 0),
    p.vacation_balance === null || p.vacation_balance === "",
    p.summed_mid_period && (p.summed_worked_hours === null || p.summed_worked_hours === ""),
    (p.transition_state || "work") !== "work" && !p.transition_until,
    p.transition_state === "sick" && !p.transition_from,
    isForeign(p) && !p.birth_date, isForeign(p) && !p.gender].filter(Boolean).length;
}

// Dialogo blokas ir laukas: * - būtina, ? - paaiškinimas
function Block({ title, chip, children, sx }) {
  return (
    <Box sx={{ bgcolor: "#FFFFFF", border: "1px solid #EAECF0", borderRadius: 2.5, overflow: "hidden", flexShrink: 0, ...sx }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, py: 1.1, bgcolor: "#F5F6F8", borderBottom: "1px solid #EAECF0" }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: "#101828" }}>{title}</Typography>
        {chip}
      </Box>
      <Box sx={{ p: 2 }}>{children}</Box>
    </Box>
  );
}

function FL({ label, req, help, children, note, sx }) {
  return (
    <Box sx={{ minWidth: 0, ...sx }}>
      <Typography component="div" sx={{ fontSize: 12.5, fontWeight: 500, color: "#344054", mb: 0.6, display: "flex", alignItems: "center", gap: 0.5 }}>
        <span>{label}{req && <Box component="span" sx={{ color: "error.main", ml: 0.25 }}>*</Box>}</span>
        {help && <Tooltip arrow placement="top" title={<Typography sx={{ fontSize: 12.5, lineHeight: 1.5 }}>{help}</Typography>}>
          <HelpOutlineIcon sx={{ fontSize: 15, color: "text.disabled", cursor: "help" }} />
        </Tooltip>}
      </Typography>
      {children}
      {note && <Typography sx={{ fontSize: 11.5, color: "text.secondary", mt: 0.4 }}>{note}</Typography>}
    </Box>
  );
}

function Seg({ value, options, onChange, disabled, size = "small" }) {
  return (
    <ToggleButtonGroup exclusive size={size} value={value} disabled={disabled} onChange={(_, v) => v && v !== value && onChange(v)}
      sx={{ "& .MuiToggleButton-root": { textTransform: "none", px: 1.25, py: 0.5, fontSize: 13, lineHeight: 1.5 },
        "& .Mui-selected": { color: "primary.main", fontWeight: 700, bgcolor: "#EFF4FF !important" } }}>
      {options.map(([v, l]) => <ToggleButton key={v} value={v}>{l}</ToggleButton>)}
    </ToggleButtonGroup>
  );
}

function Sw({ label, help, checked, onChange, disabled, src }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 0.5 }}>
      <Typography component="div" onClick={() => !disabled && onChange(!checked)}
        sx={{ fontSize: 13.5, display: "flex", alignItems: "center", gap: 0.5, cursor: disabled ? "default" : "pointer" }}>
        {label}
        {src && <Chip size="small" label={src} sx={{ height: 18, fontSize: 10.5, bgcolor: "#F2F4F7" }} />}
        {help && <Tooltip arrow title={<Typography sx={{ fontSize: 12.5, lineHeight: 1.5 }}>{help}</Typography>}>
          <HelpOutlineIcon sx={{ fontSize: 15, color: "text.disabled", cursor: "help" }} />
        </Tooltip>}
      </Typography>
      <Switch size="small" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </Box>
  );
}

const grid2 = { display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 };
const grid3 = { display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" }, gap: 2 };
const DALYV = ["d30_55", "d0_25"];                 // NPD su dalyvumo lygiu -> dalyvumo lygis nustatytas
const SDUP_MODES = WORK_MODES.filter(([v]) => v !== "02").map(([v, l]) => [v, `${v} – ${l}`]);

function requiredOf(p) {
  return [
    !!p.lpk_code, !!p.start_date, Number(p.base_amount) > 0, Number(p.weekly_hours) > 0,
    !(p.vacation_balance === null || p.vacation_balance === ""),
    ...(p.summed_mid_period ? [!(p.summed_worked_hours === null || p.summed_worked_hours === "")] : []),
    ...((p.transition_state || "work") !== "work" ? [!!p.transition_until] : []),
    ...(p.transition_state === "sick" ? [!!p.transition_from] : []),
    ...(isForeign(p) ? [!!p.birth_date, !!p.gender] : []),
  ];
}

function salaryWarn(p, data) {
  const chk = data.summary?.salary_check?.[p.person_code];
  return chk && p.base_amount !== null && p.base_amount !== "" && Number(p.base_amount) === Number(chk.suggested) ? chk.reason : "";
}

// Paprastas patikrinimas: ar panašu į el. paštą / telefoną (tuščia - gerai)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const checkEmail = (x) => (!x || EMAIL_RE.test(x) ? "" : "Neteisingas el. pašto adresas, pvz. vardas@imone.lt");
const cleanPhone = (x) => x.replace(/[\s\-()]/g, "");
const checkPhone = (x) => (!x || /^\+?\d{8,15}$/.test(cleanPhone(x)) ? "" : "Neteisingas telefono numeris, pvz. +37061234567");

function TextOnBlur({ value, onSave, disabled, placeholder, transform = (x) => x, validate }) {
  const [v, setV] = useState(value || "");
  const [err, setErr] = useState("");
  useEffect(() => { setV(value || ""); setErr(""); }, [value]);
  return (
    <TextField size="small" fullWidth value={v} disabled={disabled} placeholder={placeholder} error={!!err} helperText={err || undefined}
      onChange={(e) => { setV(e.target.value); if (err) setErr(validate ? validate(e.target.value.trim()) : ""); }}
      onBlur={() => {
        const e = validate ? validate(v.trim()) : "";
        setErr(e);
        if (e) return;                              // neteisinga - neišsaugoma
        const out = transform(v.trim());
        if (out !== (value || "")) onSave(out);
      }} />
  );
}

// VDU laikotarpis: 3 mėnesiai iki DU pradžios (arba nuo darbo pradžios, jei dirba trumpiau); null - nereikia (pradeda DokSkene)
const MONTHS_NOM = ["sausis", "vasaris", "kovas", "balandis", "gegužė", "birželis", "liepa", "rugpjūtis", "rugsėjis", "spalis",
  "lapkritis", "gruodis"];
function vduPeriod(p, data) {
  const du = dayjs(data.du_start).startOf("month");
  const from = du.subtract(3, "month");
  const to = du.subtract(1, "day");
  const start = p.start_date ? dayjs(p.start_date) : null;
  if (start && !start.isBefore(du)) return null;
  const short = !!(start && start.isAfter(from));
  const a = short ? start : from;
  const label = a.month() === to.month() ? MONTHS_NOM[to.month()] : `${MONTHS_NOM[a.month()]}–${MONTHS_NOM[to.month()]}`;
  return { from: a.format("YYYY-MM-DD"), to: to.format("YYYY-MM-DD"), label, short };
}

function vduHelp(v, hourly) {
  return `Vidutinis darbo užmokestis už ${v.from} – ${v.to}${v.short ? " (dirba trumpiau nei 3 mėn. – už dirbtą laiką)" : " (3 paskutiniai mėnesiai iki DU pradžios DokSkene)"}, `
    + `${hourly ? "už valandą" : "už dieną"}. Pagal jį pirmus mėnesius DokSkene skaičiuosime atostogines, ligos išmoką už 2 dienas, mamadienius. `
    + "Apskaičiuojame patys iš Sodros duomenų: pajamos (S50) / darbo dienos pagal grafiką, neįskaitant ligos (S15) ir nebuvimų (S4). "
    + "Sodra nemato premijų, atostoginių ir nemokamų atostogų – jei jų buvo, įveskite VDU iš senos programos "
    + "(Site.pro / B1: DU → DU spausdinimai → Mėnesinė atostogų kaupinių pažyma).";
}

const vduCheck = (p) => !p.vdu_override && p.vdu_auto?.status === "check";

// VDU iš Sodros duomenų: reikšmė, įspėjimai, skaičiavimas pagal mėnesius
function VduAuto({ p, locked, set, unit }) {
  const [open, setOpen] = useState(false);
  const a = p.vdu_auto;
  if (!a || !a.value) return null;
  const manual = p.vdu_override !== null && p.vdu_override !== undefined && p.vdu_override !== "";
  const check = !manual && a.status === "check";
  return (
    <Box sx={{ mt: 1, p: 1.25, borderRadius: 2, border: "1px solid", fontSize: 12.5,
      borderColor: manual ? "#EAECF0" : check ? "#FEDF89" : "#ABEFC6", bgcolor: manual ? "#F9FAFB" : check ? "#FFFAEB" : "#F6FEF9" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        {manual ? <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
          Įvesta ranka. Pagal Sodros duomenis būtų <b>{toComma(a.value)} {unit}</b>
          {!locked && <> · <Box component="span" onClick={() => set({ vdu_override: "" })}
            sx={{ color: "primary.main", cursor: "pointer", textDecoration: "underline" }}>naudoti apskaičiuotą</Box></>}
        </Typography> : <>
          {check ? <WarningAmberOutlinedIcon sx={{ fontSize: 17, color: "#B54708" }} /> : <CheckCircleIcon sx={{ fontSize: 17, color: "#079455" }} />}
          <Typography sx={{ fontSize: 12.5 }}>
            Apskaičiuota iš Sodros duomenų: <b>{toComma(a.value)} {unit}</b>
            {check ? " – patikrinkite" : " – atrodo tikslu, įvesti nereikia"}
          </Typography>
        </>}
        {a.months?.length > 0 && <Box component="span" onClick={() => setOpen(!open)}
          sx={{ ml: "auto", color: "primary.main", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>
          {open ? "slėpti skaičiavimą" : "kaip apskaičiuota"}</Box>}
      </Box>
      {!manual && a.flags?.map((f) => <Typography key={f} sx={{ fontSize: 12, color: "#B54708", mt: 0.5 }}>• {f}</Typography>)}
      {a.notes?.map((f) => <Typography key={f} sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>• {f}</Typography>)}
      <Collapse in={open}>
        <Table size="small" sx={{ mt: 1, "& td, & th": { fontSize: 12, py: 0.4, px: 1 } }}>
          <TableHead><TableRow>
            <TableCell>Mėnuo</TableCell><TableCell align="right">Pajamos (S50)</TableCell>
            <TableCell align="right">Darbo {a.unit === "hour" ? "val." : "d."}</TableCell>
            <TableCell align="right">Neįskaičiuota d.</TableCell><TableCell align="right">VDU</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {a.months.map((x) => (
              <TableRow key={x.ym}>
                <TableCell>{x.ym}</TableCell>
                <TableCell align="right">{x.income !== null ? `${toComma(x.income)} €` : "–"}</TableCell>
                <TableCell align="right">{toComma(x.units)}</TableCell>
                <TableCell align="right">{x.excluded || "–"}</TableCell>
                <TableCell align="right">{x.rate !== null ? `${toComma(x.rate)} €` : "–"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Collapse>
    </Box>
  );
}

function WeekEditor({ p, locked, set }) {
  const w = weekOf(p);
  const save = (i, v) => {
    const next = w.map((h, j) => (j === i ? Number(v || 0) : h));
    if (next.some((h, j) => h !== w[j])) set({ week_hours: next.map(String) });
  };
  return (
    <Box sx={{ mt: 2 }}>
      <FL label="Darbo dienos ir valandos" help={HELP.week} note={`${weekLabel(w)} · iš viso ${num2(w.reduce((a, b) => a + b, 0))} val. per savaitę`}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 1, maxWidth: 520 }}>
          {WEEK_DAYS.map((d, i) => (
            <Box key={d}>
              <Typography sx={{ fontSize: 11.5, color: i > 4 ? "error.main" : "text.secondary", textAlign: "center", mb: 0.25 }}>{d}</Typography>
              <Num value={w[i] ? String(w[i]) : ""} width="100%" disabled={locked} onSave={(v) => save(i, v)} />
            </Box>
          ))}
        </Box>
      </FL>
    </Box>
  );
}

function PersonDialog({ p, data, locked, onPerson, onClose, onNext, onKids }) {
  if (!p) return null;
  const set = (patch) => onPerson(p.id, patch);
  const def = data.summary?.summed_default || data.summed_default || {};
  const summed = p.work_time_mode === "02";
  const hourly = p.pay_form === "hourly";
  const state = p.transition_state || "work";
  const sickGap = p.transition_from ? dayjs(data.du_start).diff(dayjs(p.transition_from), "day") : null;
  const req = requiredOf(p);
  const done = req.filter(Boolean).length;
  const vacDate = data.summary?.vacation_date || dayjs(data.du_start).subtract(1, "day").format("YYYY-MM-DD");
  const warn = salaryWarn(p, data);
  const vdu = vduPeriod(p, data);
  const rec = vduCheck(p) ? <Chip size="small" label="patikrinkite" sx={{ height: 20, fontSize: 11, fontWeight: 600, bgcolor: "#FFFAEB", color: "#B54708" }} />
    : !vdu && data.summary?.gpm_split_estimated ? <Chip size="small" label="nebūtina" sx={{ height: 20, fontSize: 11, fontWeight: 600, bgcolor: "#F2F4F7", color: "#475467" }} /> : null;
  const vduUnit = summed || hourly ? "€/val." : "€/d.";
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" disableScrollLock PaperProps={{ sx: { borderRadius: 3 } }}>
      <Box sx={{ px: 3, pt: 2.5, pb: 2, borderBottom: "1px solid", borderColor: "divider", display: "flex", gap: 2, alignItems: "flex-start" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{p.first_name} {p.last_name}</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            {codeLabel(p)}{p.start_date ? ` · dirba nuo ${p.start_date}` : ""}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mt: 1 }}>
            <LinearProgress variant="determinate" value={(100 * done) / req.length} color={done === req.length ? "success" : "warning"}
              sx={{ width: 220, height: 6, borderRadius: 99, bgcolor: "#EAECF0" }} />
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Būtini laukai: {done} iš {req.length}</Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} aria-label="Uždaryti"><CloseIcon /></IconButton>
      </Box>

      <DialogContent sx={{ px: 3, py: 2.5, bgcolor: "#F8FAFC", display: "flex", flexDirection: "column", gap: 2 }}>
        {isForeign(p) && <Block title="Asmens duomenys (užsienietis)">
          <Box sx={grid3}>
            <FL label="SD numeris" help="Sodros socialinio draudimo numeris – naudojamas vietoj asmens kodo.">
              <TextField size="small" fullWidth value={p.person_code.slice(2)} disabled /></FL>
            <FL label="Gimimo data" req><DateField value={p.birth_date} disabled={locked} error={!p.birth_date} width="100%"
              onChange={(v) => set({ birth_date: v })} /></FL>
            <FL label="Lytis" req help="Reikalinga SDUP ataskaitai."><Seg value={p.gender || ""} disabled={locked}
              options={[["M", "Vyras"], ["F", "Moteris"]]} onChange={(v) => set({ gender: v })} /></FL>
          </Box>
        </Block>}
        <Block title="Darbo sutartis">
          <Box sx={grid2}>
            <FL label="Darbo pradžia" req><DateField value={p.start_date} disabled={locked} error={!p.start_date} width="100%"
              onChange={(v) => set({ start_date: v })} /></FL>
            <FL label="Sutarties rūšis" req><Sel value={p.contract_type === "02" ? "02" : "01"} width="100%" disabled={locked}
              options={[["01", "Neterminuota"], ["02", "Terminuota"]]} onChange={(v) => set({ contract_type: v })} /></FL>
            <FL label="Profesija (LPK)" req help={HELP.profession} sx={{ gridColumn: { sm: "span 2" } }}>
              <ProfessionPicker p={p} locked={locked} onPerson={onPerson} width="100%" />
            </FL>
          </Box>
        </Block>

        <Block title="Atlyginimas ir darbo laikas">
          <Box sx={grid3}>
            <FL label="Apmokėjimas" req><Seg value={hourly ? "hourly" : "monthly"} disabled={locked}
              options={[["monthly", "Mėnesinis"], ["hourly", "Valandinis"]]} onChange={(v) => set({ pay_form: v, base_amount: "" })} /></FL>
            <FL label={hourly ? "Įkainis, € per val." : "Alga, € per mėn."} req help={HELP.salary}
              note={warn ? <Box component="span" sx={{ color: "warning.dark" }}>⚠ Pagal Sodrą – patikrinkite: {warn}</Box> : null}>
              <Num value={p.base_amount} width="100%" disabled={locked} error={!(Number(p.base_amount) > 0)} suffix="€"
                onSave={(v) => set({ base_amount: v })} /></FL>
            <FL label="Norma, val. per sav." req help={HELP.norm}><Num value={p.weekly_hours} width="100%" disabled={locked}
              error={!(Number(p.weekly_hours) > 0)} onSave={(v) => set({ weekly_hours: v })} /></FL>
          </Box>
          <Box sx={{ ...grid2, mt: 2 }}>
            <FL label="Darbo laiko apskaita" req help={HELP.regime}
              note={!summed && data.summary?.summed_hint?.[p.person_code]
                ? <Box component="span" sx={{ color: "warning.dark" }}>Galbūt suminė: {data.summary.summed_hint[p.person_code]}. Patikrinkite darbo sutartyje</Box>
                : null}>
              <Seg value={summed ? "summed" : "standard"} disabled={locked}
              options={[["standard", "Standartinė"], ["summed", "Suminė"]]} onChange={(v) => set({ work_time_mode: v === "summed" ? "02" : "01" })} /></FL>
            {!summed && <FL label="Darbo laiko režimas (SDUP)" help={HELP.mode}><Sel value={p.work_time_mode || "01"} options={SDUP_MODES}
              width="100%" disabled={locked} onChange={(v) => set({ work_time_mode: v })} /></FL>}
          </Box>
          {!summed && <WeekEditor p={p} locked={locked} set={set} />}
          {summed && (
            <Box sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: "#F5F8FF", border: "1px solid #D1E0FF" }}>
              <Box sx={grid2}>
                <FL label="Apskaitinis laikotarpis"><Sel value={String(p.summed_period_months || def.months || 3)} width="100%" disabled={locked}
                  options={[["1", "1 mėn."], ["2", "2 mėn."], ["3", "3 mėn."]]} onChange={(v) => set({ summed_period_months: v })} /></FL>
                <FL label="Dabartinis laikotarpis prasidėjo"><DateField month value={p.summed_period_start || def.start} disabled={locked}
                  width="100%" onChange={(v) => set({ summed_period_start: v })} /></FL>
              </Box>
              {p.summed_mid_period ? (
                <>
                  <Typography sx={{ fontSize: 12.5, color: "#1849A9", mt: 1.75, mb: 1.25 }}>
                    Laikotarpis prasidėjo iki DU pradžios – įveskite jo valandas iki perėjimo iš senos programos.
                  </Typography>
                  <Box sx={grid3}>
                    <FL label="Dirbta, val." req help={HELP.summedWorked}><Num value={p.summed_worked_hours} width="100%" disabled={locked}
                      error={p.summed_worked_hours === null || p.summed_worked_hours === ""} onSave={(v) => set({ summed_worked_hours: v })} /></FL>
                    <FL label="Nebuvimai, val." help={HELP.summedAbsence}><Num value={p.summed_absence_hours} width="100%" disabled={locked}
                      onSave={(v) => set({ summed_absence_hours: v })} /></FL>
                    <FL label="Apmokėti viršvalandžiai, val." help={HELP.summedPaidOt}><Num value={p.summed_paid_overtime} width="100%"
                      disabled={locked} onSave={(v) => set({ summed_paid_overtime: v })} /></FL>
                  </Box>
                </>
              ) : (
                <Typography sx={{ fontSize: 12.5, color: "#1849A9", mt: 1.5 }}>Laikotarpis prasideda kartu su DU DokSkene – valandų iš senos programos nereikia.</Typography>
              )}
            </Box>
          )}
        </Block>

        <Block title="Atostogos">
          <Box sx={grid2}>
            <FL label={`Likutis ${vacDate}, d.`} req help={HELP.vacation}><Num value={p.vacation_balance} width="100%" disabled={locked}
              error={p.vacation_balance === null || p.vacation_balance === ""} onSave={(v) => set({ vacation_balance: v })} /></FL>
            <FL label="Priklauso per metus, d. d." help={HELP.leaveDays}><Num value={p.annual_leave_days || 20} width="100%" disabled={locked}
              onSave={(v) => set({ annual_leave_days: v || 20 })} /></FL>
          </Box>
        </Block>

        {(vdu || data.summary?.gpm_split_estimated) && (
          <Block title={vdu && data.summary?.gpm_split_estimated ? "VDU ir GPM" : vdu ? "VDU" : "GPM"} chip={rec}>
            <Box sx={grid2}>
              {vdu && <FL label={`VDU ${vdu.label}, € per ${summed || hourly ? "valandą" : "dieną"}`}
                help={vduHelp(vdu, summed || hourly)} sx={{ gridColumn: "1 / -1" }}>
                <Num value={p.vdu_override} width={200} disabled={locked} suffix={vduUnit}
                  placeholder={p.vdu_auto?.value ? toComma(p.vdu_auto.value) : ""}
                  onSave={(v) => set({ vdu_override: v })} />
                <VduAuto p={p} locked={locked} set={set} unit={vduUnit} /></FL>}
              {data.summary?.gpm_split_estimated && <FL label="GPM nuo sausio iki perėjimo, €" help={HELP.gpmYtd}>
                <Num value={p.gpm_ytd} width="100%" disabled={locked} suffix="€" onSave={(v) => set({ gpm_ytd: v })} /></FL>}
            </Box>
          </Block>
        )}

        <Block title={`Perėjimo dieną (${data.du_start})`}>
          <Box sx={grid2}>
            <FL label="Kur darbuotojas yra" help={HELP.transition}><Sel value={state} options={TRANSITION} width="100%" disabled={locked}
              onChange={(v) => set({ transition_state: v })} /></FL>
            {state === "sick" && <FL label="Liga nuo" req help={HELP.sickFrom}><DateField value={p.transition_from} disabled={locked}
              error={!p.transition_from || p.transition_from > data.du_start} width="100%" onChange={(v) => set({ transition_from: v })} /></FL>}
            {state !== "work" && <FL label="Iki" req><DateField value={p.transition_until} disabled={locked} error={!p.transition_until}
              width="100%" onChange={(v) => set({ transition_until: v })} /></FL>}
            {state === "vacation" && <FL label={`Jau išmokėti atostoginiai už ${MONTHS_GEN[dayjs(data.du_start).month()]} dienas, €`} help={HELP.prepaid}>
              <Num value={p.vacation_prepaid_amount} width="100%" disabled={locked} suffix="€" onSave={(v) => set({ vacation_prepaid_amount: v })} /></FL>}
            {state === "sick" && sickGap >= 1 && sickGap <= 14 && (
              <FL label={`Ligos išmoka už ${sickGap === 1 ? p.transition_from : `${p.transition_from} – ${dayjs(p.transition_from).add(1, "day").format("YYYY-MM-DD")}`}, išmokėta senoje programoje, €`}
                help={HELP.sickPaid}>
                <Num value={p.vacation_prepaid_amount} width="100%" disabled={locked} suffix="€" onSave={(v) => set({ vacation_prepaid_amount: v })} /></FL>)}
          </Box>
          {state === "sick" && p.transition_from && (sickGap < 0 ? (
            <Alert severity="error" sx={{ mt: 1.5, py: 0.25 }}>Liga prasidėjo jau DokSkene – čia pasirinkite „Dirba“, o ligą pažymėkite tabelyje.</Alert>
          ) : sickGap === 0 ? (
            <Alert severity="info" sx={{ mt: 1.5, py: 0.25 }}>
              Abi darbdavio apmokamas ligos dienas DokSkenas apmokės automatiškai {MONTHS_GEN[dayjs(data.du_start).month()]} atlyginimuose.
            </Alert>
          ) : sickGap === 1 ? (
            <Alert severity="info" sx={{ mt: 1.5, py: 0.25 }}>
              Antrą ligos dieną ({data.du_start}) DokSkenas apmokės automatiškai {MONTHS_GEN[dayjs(data.du_start).month()]} atlyginimuose
              (jei tai darbo diena pagal grafiką).
            </Alert>
          ) : (
            <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: 1 }}>Darbdavio apmokamos 2 pirmosios ligos dienos buvo iki perėjimo – jas apmokėjo sena programa.</Typography>
          ))}
          {["childcare", "maternity", "paternity"].includes(state) && <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: 1 }}>Išmoką moka Sodra – tik pažymime tabelyje.</Typography>}
        </Block>

        <Block title="Mokesčiai ir išmokėjimas">
          <Box sx={grid2}>
            <FL label="NPD" help={HELP.npd}><Sel value={p.npd_mode || "standard"} options={NPD} width="100%" disabled={locked}
              onChange={(v) => set({ npd_mode: v, has_disability: DALYV.includes(v) ? true : DALYV.includes(p.npd_mode) ? false : !!p.has_disability })} /></FL>
            <FL label="Dalyvumo lygis" help={HELP.disability} note={DALYV.includes(p.npd_mode) ? "Pagal pasirinktą NPD" : null}>
              <Sel value={String(!!p.has_disability || DALYV.includes(p.npd_mode))} width="100%" disabled={locked || DALYV.includes(p.npd_mode)}
                options={[["false", "Nenustatytas"], ["true", "Nustatytas (0–55 %)"]]} onChange={(v) => set({ has_disability: v === "true" })} /></FL>
            <FL label={`Neišmokėta perėjimo dienai, €`} help={HELP.unpaid}><Num value={p.unpaid_amount} width="100%" disabled={locked}
              suffix="€" onSave={(v) => set({ unpaid_amount: v })} /></FL>
            <FL label="IBAN"><TextOnBlur value={p.iban} disabled={locked} placeholder="LT…"
              transform={(x) => x.replace(/\s/g, "").toUpperCase()} onSave={(v) => set({ iban: v })} /></FL>
          </Box>
          <Box sx={{ mt: 1.5 }}>
            <Sw label="Pensijų kaupimas" src="iš Sodros" help={HELP.pension} checked={p.pension} disabled={locked} onChange={(v) => set({ pension: v })} />
            <Sw label="Vienas augina vaiką" help={HELP.singleParent} checked={p.single_parent} disabled={locked} onChange={(v) => set({ single_parent: v })} />
            <Sw label="Mokėti kartą per mėnesį (be avanso)" help={HELP.payOnce} checked={p.pay_once_a_month} disabled={locked}
              onChange={(v) => set({ pay_once_a_month: v })} />
            {!p.pay_once_a_month && <Box sx={{ ...grid2, mt: 1 }}>
              <FL label="Avanso suma, €" help={HELP.advance}><Num value={p.advance_amount} width="100%" disabled={locked} suffix="€"
                onSave={(v) => set({ advance_amount: v })} /></FL>
            </Box>}
          </Box>
        </Block>

        <Block title="Vaikai" chip={<Tooltip arrow title={<Typography sx={{ fontSize: 12.5 }}>{HELP.children}</Typography>}>
          <HelpOutlineIcon sx={{ fontSize: 15, color: "text.disabled", cursor: "help" }} /></Tooltip>}>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
            {(p.children || []).map((c, i) => <Chip key={i} size="small" label={`${c.first_name || "Vaikas"} · ${c.birth_date}`} />)}
            {!locked && <Button size="small" startIcon={<AddIcon />} onClick={onKids} sx={{ textTransform: "none" }}>
              {(p.children || []).length ? "Keisti" : "Pridėti vaiką"}</Button>}
          </Box>
        </Block>

        <Block title="Kontaktai">
          <Box sx={grid2}>
            <FL label="El. paštas" help={HELP.email}><TextOnBlur value={p.email} disabled={locked} placeholder="vardas@imone.lt" validate={checkEmail}
              transform={(x) => x.toLowerCase()} onSave={(v) => set({ email: v })} /></FL>
            <FL label="Telefonas"><TextOnBlur value={p.phone} disabled={locked} placeholder="+37061234567" validate={checkPhone}
              transform={cleanPhone} onSave={(v) => set({ phone: v })} /></FL>
          </Box>
        </Block>
      </DialogContent>

      <Box sx={{ px: 3, py: 1.5, borderTop: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", gap: 1 }}>
        {!locked && <Tooltip arrow title={<Typography sx={{ fontSize: 12.5 }}>Jei darbuotojas jau išėjo iš darbo – jis bus perkeltas tik metinei GPM312, pildyti nieko nereikės.</Typography>}>
          <Button size="small" color="inherit" sx={{ textTransform: "none", color: "text.secondary" }}
            onClick={() => window.confirm(`${p.first_name} ${p.last_name} jau nebedirba įmonėje?`) && (set({ employed: false }), onClose())}>
            Darbuotojas jau išėjo?
          </Button>
        </Tooltip>}
        <Typography sx={{ flex: 1, fontSize: 12.5, color: "text.secondary", textAlign: "right", pr: 1 }}>
          Išsaugoma iš karto · <Box component="span" sx={{ color: "error.main" }}>*</Box> – būtina
        </Typography>
        {onNext && <Button variant="contained" disableElevation endIcon={<ArrowForwardIcon />} onClick={onNext}
          sx={{ textTransform: "none", fontWeight: 700 }}>Kitas darbuotojas</Button>}
      </Box>
    </Dialog>
  );
}

function PeopleStep({ data, locked, busy, onPerson, onAction, onExcel }) {
  const fileRef = useRef(null);
  const [adding, setAdding] = useState(false);
  const [kids, setKids] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [showGone, setShowGone] = useState(false);
  const active = data.people.filter((p) => p.include && p.employed);
  const gone = data.people.filter((p) => p.include && !p.employed);
  const openP = data.people.find((p) => p.id === openId) || null;
  const download = async () => {
    const blob = await payrollApi.migrationExcel();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "darbuotojai_perejimas.xlsx"; a.click(); URL.revokeObjectURL(url);
  };
  const nextOf = (id) => {
    const i = active.findIndex((p) => p.id === id);
    const rest = [...active.slice(i + 1), ...active.slice(0, i)];
    return (rest.find((p) => rowMissing(p) > 0) || rest[0] || null);
  };
  const head = (label, help, w) => <TableCell sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", bgcolor: "#F9FAFB", width: w }}>
    <HeadHelp label={label} help={help} /></TableCell>;
  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, flexWrap: "wrap", mb: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: 17, fontWeight: 800 }}>Darbuotojai</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.25 }}>
            Užpildėme, ką radome Sodros ir VMI ataskaitose. Įveskite trūkstamus būtinus laukus – kitus rasite atidarę darbuotoją.
          </Typography>
        </Box>
        {!locked && (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setAdding(true)} sx={{ textTransform: "none" }}>Naujas darbuotojas</Button>
            <Tooltip arrow title={<Typography sx={{ fontSize: 12.5 }}>Visi laukai vienoje lentelėje: būtini – kairėje, nebūtini – dešinėje. Užpildykite ir įkelkite atgal.</Typography>}>
              <Button size="small" startIcon={<DownloadIcon />} onClick={download} sx={{ textTransform: "none" }}>Excel šablonas</Button>
            </Tooltip>
            <Button size="small" startIcon={<UploadFileIcon />} disabled={busy} onClick={() => fileRef.current?.click()} sx={{ textTransform: "none" }}>Įkelti Excel</Button>
            <input ref={fileRef} hidden type="file" accept=".xlsx" onChange={(e) => { onExcel(e.target.files?.[0]); e.target.value = ""; }} />
          </Box>
        )}
      </Box>

      {!active.length && !gone.length ? (
        <Alert severity="info">Darbuotojų dar nėra – įkelkite ataskaitas, Excel šabloną arba pridėkite rankiniu būdu.</Alert>
      ) : (
        <TableContainer component={Paper} sx={{ ...surfaceSx }}>
          <Table size="small" sx={{ minWidth: 960, "& td": { verticalAlign: "top", py: 1.25, px: 1.25 }, "& th": { px: 1.25 },
            "& td:first-of-type": { minWidth: 165 } }}>
            <TableHead><TableRow>
              {head("Darbuotojas", null, 170)}{head("Profesija", HELP.profession, 215)}{head("Atlyginimas", HELP.salary, 200)}
              {head("Val./sav.", HELP.norm, 80)}{head("Apskaita", HELP.regime, 140)}{head("Atostogų likutis", HELP.vacation, 100)}
              {head("Būsena", null, 130)}<TableCell sx={{ width: 36, bgcolor: "#F9FAFB" }} />
            </TableRow></TableHead>
            <TableBody>
              {!active.length && <TableRow><TableCell colSpan={8}><Typography sx={{ fontSize: 13, color: "text.secondary" }}>Dirbančių darbuotojų nėra.</Typography></TableCell></TableRow>}
              {active.map((p) => {
                const set = (patch) => onPerson(p.id, patch);
                const miss = rowMissing(p);
                const warn = salaryWarn(p, data);
                const hourly = p.pay_form === "hourly";
                return (
                  <TableRow key={p.id} hover>
                    <TableCell onClick={() => setOpenId(p.id)} sx={{ cursor: "pointer" }}>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{p.first_name} {p.last_name}</Typography>
                      <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
                        {codeLabel(p)}{p.start_date ? ` · nuo ${p.start_date}` : ""}
                      </Typography>
                      {p.s29_missing && <Typography sx={{ fontSize: 11.5, color: "warning.dark", mt: 0.5 }}>
                        Nebėra naujame S29 – {!locked ? <Box component="span" onClick={(e) => { e.stopPropagation(); set({ employed: false }); }}
                          sx={{ textDecoration: "underline", cursor: "pointer" }}>nebedirba?</Box> : "nebedirba?"}
                      </Typography>}
                    </TableCell>
                    <TableCell><ProfessionPicker p={p} locked={locked} onPerson={onPerson} width={205} /></TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
                        <Num value={p.base_amount} width={100} disabled={locked} error={!(Number(p.base_amount) > 0)}
                          suffix={hourly ? "€/val." : "€"} onSave={(v) => set({ base_amount: v })} />
                        <Seg value={hourly ? "hourly" : "monthly"} disabled={locked} options={[["monthly", "mėn."], ["hourly", "val."]]}
                          onChange={(v) => set({ pay_form: v, base_amount: "" })} />
                      </Box>
                      {warn && <Tooltip arrow title={<Typography sx={{ fontSize: 12.5 }}>Pasiūlyta pagal Sodrą: {warn}. Įveskite algą iš darbo sutarties.</Typography>}>
                        <Typography sx={{ fontSize: 11.5, color: "warning.dark", mt: 0.5, cursor: "help", display: "inline-block" }}>⚠ Pagal Sodrą – patikrinkite</Typography>
                      </Tooltip>}
                    </TableCell>
                    <TableCell><Num value={p.weekly_hours} width={70} disabled={locked} error={!(Number(p.weekly_hours) > 0)}
                      onSave={(v) => set({ weekly_hours: v })} />
                      {p.work_time_mode !== "02" && <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.4, whiteSpace: "nowrap" }}>
                        {weekShort(weekOf(p))}</Typography>}</TableCell>
                    <TableCell><Seg value={p.work_time_mode === "02" ? "summed" : "standard"} disabled={locked}
                      options={[["standard", "Stand."], ["summed", "Suminė"]]} onChange={(v) => set({ work_time_mode: v === "summed" ? "02" : "01" })} />
                      {p.work_time_mode !== "02" && data.summary?.summed_hint?.[p.person_code] && (
                        <Tooltip arrow title={<Typography sx={{ fontSize: 12.5 }}>{data.summary.summed_hint[p.person_code]}. Jei darbo sutartyje nustatyta suminė apskaita – perjunkite.</Typography>}>
                          <Typography sx={{ fontSize: 11.5, color: "warning.dark", mt: 0.5, cursor: "help", display: "inline-block" }}>⚠ Galbūt suminė?</Typography>
                        </Tooltip>)}</TableCell>
                    <TableCell><Num value={p.vacation_balance} width={80} disabled={locked} suffix="d."
                      error={p.vacation_balance === null || p.vacation_balance === ""} onSave={(v) => set({ vacation_balance: v })} /></TableCell>
                    <TableCell>
                      <Chip size="small" onClick={() => setOpenId(p.id)} sx={{ cursor: "pointer", fontWeight: 600 }}
                        label={miss ? `Trūksta ${miss}` : vduCheck(p) ? "Patikrinkite VDU" : "✓ Paruošta"}
                        color={miss ? "error" : vduCheck(p) ? "warning" : "success"} variant={miss ? "filled" : "outlined"} />
                      <Box onClick={() => setOpenId(p.id)} sx={{ fontSize: 12.5, color: "primary.main", fontWeight: 600, cursor: "pointer", mt: 0.75 }}>Atidaryti →</Box>
                    </TableCell>
                    <TableCell padding="checkbox">
                      {!locked && <Tooltip title="Pašalinti iš sąrašo">
                        <IconButton size="small" onClick={() => window.confirm(`Pašalinti ${p.first_name} ${p.last_name}?`) && onAction({ action: "remove_person", id: p.id })}>
                          <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {gone.length > 0 && (
        <Paper sx={{ ...surfaceSx, mt: 1.5 }}>
          <Box onClick={() => setShowGone((v) => !v)} sx={{ px: 2, py: 1.25, display: "flex", alignItems: "center", gap: 1, cursor: "pointer" }}>
            {showGone ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            <Typography sx={{ fontSize: 13.5 }}><b>Nebedirba ({gone.length})</b> – perkeliami tik metinei GPM312, nieko pildyti nereikia</Typography>
            {!showGone && <Typography noWrap sx={{ fontSize: 12.5, color: "text.secondary", ml: "auto", minWidth: 0 }}>
              {gone.map((p) => `${p.first_name} ${p.last_name}`).join(", ")}</Typography>}
          </Box>
          <Collapse in={showGone}>
            {gone.map((p) => (
              <Box key={p.id} sx={{ px: 2, py: 1, borderTop: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", gap: 2 }}>
                <Typography sx={{ fontSize: 13, flex: 1 }}>{p.first_name} {p.last_name}
                  <Box component="span" sx={{ color: "text.secondary", ml: 1, fontSize: 12 }}>
                    {p.start_date ? `${p.start_date} – ` : ""}{p.end_date || "?"}</Box></Typography>
                {!locked && <Button size="small" onClick={() => onPerson(p.id, { employed: true })} sx={{ textTransform: "none" }}>Dirba</Button>}
              </Box>
            ))}
          </Collapse>
        </Paper>
      )}

      {openP && <PersonDialog p={openP} data={data} locked={locked} onPerson={onPerson} onClose={() => setOpenId(null)}
        onKids={() => setKids(openP)} onNext={active.length > 1 ? () => setOpenId(nextOf(openP.id)?.id || null) : null} />}
      <ChildrenDialog person={kids} onClose={() => setKids(null)}
        onSave={(rows) => { const id = kids.id; setKids(null); onPerson(id, { children: rows }); }} />
      <AddPersonDialog open={adding} busy={busy} onClose={() => setAdding(false)}
        onAdd={(f) => { setAdding(false); onAction({ action: "add_person", data: f }); }} />
    </Box>
  );
}

// ----------------------------------------------------------------------------------------------------
// Patvirtinimas
// ----------------------------------------------------------------------------------------------------

function ConfirmStep({ data, busy, onAction }) {
  const navigate = useNavigate();
  const s = data.summary || {};
  const acct = s.accounting || {};
  const active = data.people.filter((p) => p.include && p.employed);
  const unpaid = active.reduce((a, p) => a + Number(p.unpaid_amount || 0), 0);
  const checks = s.checks || [];
  const bad = checks.filter((c) => !c.ok);
  const miss = peopleMissing(data.people);

  if (data.status === "confirmed") {
    return (
      <Box sx={{ textAlign: "center", py: 3 }}>
        <CheckCircleIcon sx={{ fontSize: 48, color: "success.main", mb: 1 }} />
        <Typography sx={{ fontSize: 18, fontWeight: 800 }}>DU perkeltas</Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.5, mb: 2.5 }}>DU DokSkenas skaičiuojamas nuo {data.du_start}.</Typography>
        <Box sx={{ display: "flex", gap: 1, justifyContent: "center", flexWrap: "wrap" }}>
          <Button variant="contained" disableElevation onClick={() => navigate("/darbo-uzmokestis/darbo-apmokejimo-sistema")} sx={{ textTransform: "none" }}>
            Pareigybių grupės ir DAS
          </Button>
          <Button variant="outlined" onClick={() => navigate("/darbo-uzmokestis/darbuotojai")} sx={{ textTransform: "none" }}>Darbuotojai</Button>
          <Button color="error" disabled={busy} onClick={() => window.confirm("Atšaukti perėjimą? Bus ištrinta perkelta istorija, įsipareigojimai ir DK įrašai.")
            && onAction({ action: "reopen" })} sx={{ textTransform: "none" }}>Atšaukti perėjimą</Button>
        </Box>
      </Box>
    );
  }
  const row = (label, value, ok) => (
    <TableRow key={label}>
      <TableCell sx={{ fontSize: 13 }}>{label}</TableCell>
      <TableCell sx={{ fontSize: 13, fontWeight: 800, color: ok === false ? "warning.dark" : "text.primary" }}>{value}</TableCell>
    </TableRow>
  );
  return (
    <Box>
      <Typography sx={{ fontSize: 17, fontWeight: 800 }}>Patikrinkite ir pradėkite</Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.25, mb: 2 }}>
        Patvirtinus bus sukurti darbuotojai, sutartys ir pareigybių grupės (jas vėliau galėsite keisti „Darbo apmokėjimo sistema“).
      </Typography>
      <Table size="small" sx={{ maxWidth: 560, mb: 2 }}>
        <TableBody>
          {row("DU skaičiuosite nuo", data.du_start)}
          {row("Dirbantys darbuotojai", `${active.length}`, active.length > 0)}
          {row("Trūkstami duomenys", miss.parts.length ? miss.parts.map(([n, c]) => `${n}: ${c}`).join(", ") : "Nėra", !miss.parts.length)}
          {row("GPM313 sutikrinta", checks.length ? `${checks.length - bad.length} iš ${checks.length} mėn.` : "Neįkelta", checks.length ? !bad.length : false)}
          {row("Neišmokėta perėjimo dienai", money(unpaid))}
        </TableBody>
      </Table>
      {bad.map((c) => (
        <Alert key={c.ym} severity="warning" sx={{ mb: 1, "& .MuiAlert-message": { fontSize: 12.5 } }}>
          GPM313 {c.ym}: išmokos {money(c.gpm313_income)}, pagal S50 {money(c.sam_income)} – trūksta failų arba duomenys skiriasi.
        </Alert>
      ))}
      {SHOW_ACCOUNTING && acct.mode === "gap" && (
        <Alert severity="info" sx={{ mb: 1.5, "& .MuiAlert-message": { fontSize: 12.5 } }}>
          Apskaita DokSkenas nuo {acct.cutover}. Tarpinių mėnesių ({(acct.gap_months || []).join(", ")}) DU įrašai DK:
          <RadioGroup row value={data.gap_mode} onChange={(e) => onAction({ action: "start", du_start: data.du_start, gap_mode: e.target.value })}>
            <FormControlLabel value="auto" control={<Radio size="small" />} label={<Typography sx={{ fontSize: 12.5 }}>Iš deklaracijų</Typography>} />
            <FormControlLabel value="manual" control={<Radio size="small" />} label={<Typography sx={{ fontSize: 12.5 }}>Įvesiu pats</Typography>} />
          </RadioGroup>
        </Alert>
      )}
      <Typography sx={{ fontSize: 12.5, color: "text.secondary", mb: 2 }}>
        SAM ir GPM313 už mėnesius iki {ym(data.du_start)} DokSkenas neteiks – jie pateikti ankstesnėje programoje.
      </Typography>
      <Button variant="contained" disableElevation disabled={busy || !active.length || miss.parts.length > 0}
        onClick={() => onAction({ action: "confirm" })} sx={{ textTransform: "none", fontWeight: 800 }}>
        {busy ? "Tvirtinama…" : "Pradėti DU apskaitą"}
      </Button>
    </Box>
  );
}

// ----------------------------------------------------------------------------------------------------

// Perėjimo eiga - horizontaliai virš turinio (turinys - per visą plotį)
function Progress({ data, step, maxStep, onGo }) {
  const rows = reportRows(data).filter((r) => !r.optional);
  const reportsOk = rows.every((r) => r.state === "ok" || r.state === "notneeded");
  const miss = peopleMissing(data.people || []);
  const confirmed = data.status === "confirmed";
  const done = [reportsOk, miss.active > 0 && !miss.parts.length, confirmed];
  const hints = [
    reportsOk ? "Visos įkeltos" : `Įkelta ${rows.filter((r) => r.state === "ok" || r.state === "notneeded").length} iš ${rows.length} rekomenduojamų`,
    !miss.active ? "Nėra darbuotojų" : miss.parts.length ? `Trūksta: ${miss.parts.map(([n]) => n).join(", ")}` : `${miss.active} dirbantys`,
    confirmed ? "DU galima skaičiuoti" : "Paskutinis žingsnis",
  ];
  return (
    <Paper sx={{ ...surfaceSx, overflow: "hidden", borderColor: "#D1E0FF", background: "linear-gradient(180deg, #F5F8FF 0%, #FFFFFF 100%)" }}>
      <Box sx={{ px: 2.25, pt: 1.5, display: "flex", alignItems: "center", gap: 1.5 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 800, color: "#1849A9", whiteSpace: "nowrap" }}>Perėjimo eiga</Typography>
        <LinearProgress variant="determinate" value={(100 * done.filter(Boolean).length) / STEPS.length}
          color={done.every(Boolean) ? "success" : "primary"} sx={{ flex: 1, height: 6, borderRadius: 99, bgcolor: "#DCE6FB" }} />
        <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "#1849A9", whiteSpace: "nowrap" }}>{done.filter(Boolean).length} iš {STEPS.length}</Typography>
      </Box>
      <Box sx={{ display: "flex", alignItems: "stretch", gap: 1, px: 1.5, py: 1.25, overflowX: "auto" }}>
        {STEPS.map((title, i) => {
          const can = i <= maxStep;
          const cur = i === step;
          const ok = done[i];
          return (
            <Fragment key={title}>
              {i > 0 && <Box sx={{ flex: "0 0 28px", alignSelf: "center", height: 2, borderRadius: 1, bgcolor: done[i - 1] ? "success.main" : "#C7D7F5" }} />}
              <Box component="button" type="button" disabled={!can} onClick={() => onGo(i)}
                sx={{ appearance: "none", font: "inherit", textAlign: "left", flex: 1, minWidth: 190,
                  display: "flex", alignItems: "center", gap: 1.25, px: 1.5, py: 1, borderRadius: 2.5, color: "text.primary",
                  border: "1.5px solid", borderColor: cur ? "primary.main" : ok ? "#ABEFC6" : "transparent",
                  bgcolor: cur ? "#FFFFFF" : ok ? "#ECFDF3" : "transparent",
                  boxShadow: cur ? "0 2px 8px rgba(21,94,239,.15)" : "none", cursor: can ? "pointer" : "default",
                  opacity: can ? 1 : 0.6, "&:hover": { bgcolor: can && !cur ? (ok ? "#DCFAE6" : "#EEF3FF") : undefined } }}>
                <Box sx={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", flexShrink: 0,
                  fontSize: 13, fontWeight: 800, fontFamily: "inherit",
                  bgcolor: ok ? "success.main" : cur ? "primary.main" : "#E4E9F2", color: ok || cur ? "#FFFFFF" : "#667085" }}>
                  {ok ? <CheckIcon sx={{ fontSize: 18 }} /> : i + 1}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: cur ? "primary.dark" : ok ? "success.dark" : "#344054" }}>{title}</Typography>
                  <Typography noWrap sx={{ fontSize: 12, color: ok ? "success.dark" : "text.secondary" }}>{hints[i]}</Typography>
                </Box>
              </Box>
            </Fragment>
          );
        })}
      </Box>
    </Paper>
  );
}

export default function DuPerejimasTab({ onStatus }) {
  const [data, setData] = useState(null);
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [issues, setIssues] = useState([]);

  const apply = useCallback((d) => {
    setData(d);
    onStatus?.(d.status === "confirmed" ? "confirmed" : (d.people?.length || d.summary?.files?.length) ? "draft" : "none");
  }, [onStatus]);

  const run = async (fn) => {
    setBusy(true); setError(""); setInfo("");
    try { const d = await fn(); apply(d); return d; }
    catch (e) { setError(apiError(e)); return null; } finally { setBusy(false); }
  };

  useEffect(() => {
    payrollApi.migration().then(async (d) => {
      let cur = d;
      if (d.mode !== "full" && d.status !== "confirmed") cur = await payrollApi.migrationAction({ action: "mode", mode: "full" });
      apply(cur);
      if (cur.status === "confirmed") { setStep(2); setMaxStep(2); }
      else if (cur.people?.length) setMaxStep(1);
    }).catch((e) => setError(apiError(e)));
  }, [apply]);

  const onAction = (payload) => run(() => payrollApi.migrationAction(payload)).then((d) => {
    if (!d) return d;
    if (payload.action === "reopen" || payload.action === "reset") { setStep(0); setMaxStep(0); }
    return d;
  });
  const onPerson = (id, patch) => run(() => payrollApi.migrationAction({ action: "person", id, data: patch }));
  const onUpload = async (incoming) => {
    const all = Array.from(incoming || []);
    if (!all.length) return;
    const ok = all.filter((f) => /\.(xml|ffdata|zip)$/i.test(f.name));
    const bad = all.filter((f) => !/\.(xml|ffdata|zip)$/i.test(f.name)).map((f) => ({ name: f.name, reason: "netinkamas formatas (XML, FFDATA, ZIP)" }));
    if (!ok.length) { setIssues(bad); return; }
    const d = await run(() => payrollApi.migrationUpload(ok));
    if (!d) return;
    setIssues([...bad, ...(d.skipped || []).map((x) => ({ name: x.name, reason: x.reason }))]);
    if (d.uploaded) setInfo(`Įkelta: ${d.uploaded}.`);
  };
  const onExcel = async (file) => {
    if (!file) return;
    const d = await run(() => payrollApi.migrationExcelUpload(file));
    if (d?.excel) setInfo(`Excel: atnaujinta ${d.excel.updated}, pridėta ${d.excel.added}.${d.excel.errors?.length ? ` Klaidos: ${d.excel.errors.slice(0, 8).join("; ")}` : ""}`);
  };
  const go = (i) => { setStep(i); setMaxStep((x) => Math.max(x, i)); };

  if (!data) return error ? <Alert severity="error">{error}</Alert> : <Box sx={{ textAlign: "center", py: 5 }}><CircularProgress size={28} /></Box>;
  const locked = data.status === "confirmed";
  const miss = peopleMissing(data.people);

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="lt">
    <Box sx={{ pb: 6 }}>
      {!locked && (data.summary?.files?.length || data.people?.length) ? (
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
          <Button size="small" color="inherit" sx={{ textTransform: "none", fontSize: 12.5, color: "text.secondary" }}
            onClick={() => window.confirm("Pradėti iš naujo? Bus ištrintos įkeltos ataskaitos ir darbuotojų sąrašas.") && onAction({ action: "reset" })}>
            Pradėti iš naujo
          </Button>
        </Box>
      ) : null}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {info && <Alert severity="info" sx={{ mb: 2 }} onClose={() => setInfo("")}>{info}</Alert>}

      <Box sx={{ mb: 2 }}>
        <Progress data={data} step={step} maxStep={Math.max(maxStep, data.people?.length ? 1 : 0, locked ? 2 : 0)} onGo={setStep} />
      </Box>
      <Box>
        <Box sx={{ minWidth: 0 }}>
          <Paper sx={{ ...surfaceSx, p: { xs: 2, md: 3 } }}>
            {step === 0 && <ReportsStep data={data} busy={busy} locked={locked} onUpload={onUpload} onAction={onAction} issues={issues} />}
            {step === 1 && <PeopleStep data={data} busy={busy} locked={locked} onPerson={onPerson} onAction={onAction} onExcel={onExcel} />}
            {step === 2 && <ConfirmStep data={data} busy={busy} onAction={onAction} />}
          </Paper>
          {step < 2 && (
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1.5, flexWrap: "wrap", mt: 1.5 }}>
              <Typography sx={{ fontSize: 13, color: step === 1 && miss.parts.length ? "error.main" : "text.secondary" }}>
                {step === 0 ? "Trūkstamus duomenis galėsite įvesti kitame žingsnyje"
                  : !miss.active ? "Pridėkite bent vieną dirbantį darbuotoją"
                    : miss.parts.length ? `Trūksta: ${miss.parts.map(([n, c]) => `${n} – ${c}`).join(", ")}` : `Visi duomenys užpildyti (${miss.active} dirbantys)`}
              </Typography>
              <Button variant="contained" disableElevation endIcon={<ArrowForwardIcon />}
                disabled={busy || (step === 1 && (!miss.active || miss.parts.length > 0))}
                onClick={() => go(step + 1)} sx={{ textTransform: "none", fontWeight: 700 }}>
                Toliau: {STEPS[step + 1].toLowerCase()}
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
    </LocalizationProvider>
  );
}
