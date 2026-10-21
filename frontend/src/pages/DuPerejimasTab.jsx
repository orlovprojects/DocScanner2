import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, IconButton, LinearProgress, MenuItem, Paper, Radio, RadioGroup, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
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
  profession: "Profesija iš Lietuvos profesijų klasifikatoriaus. Pagal ją sudaromos pareigybių grupės (SDUP ir darbo apmokėjimo sistema).",
  salary: "Pareiginė alga pagal darbo sutartį už mėnesį (bruto, be premijų). Valandiniam apmokėjimui – įkainis už valandą. Pasiūlyta iš S50 – patikrinkite.",
  norm: "Vidutinė savaitės norma iš darbo sutarties: visu etatu – 40, puse etato – 20. Jei sutartyje nurodyta per mėnesį ar apskaitinį laikotarpį – padalinkite valandas iš to laikotarpio savaičių skaičiaus (pvz. 488 val. per 3 mėn. ≈ 40 val.).",
  mode: "Darbo laiko režimas pagal darbo sutartį ar darbo tvarkos taisykles. Kodai – kaip Sodros SDUP.",
  vacation: "Kiek kasmetinių atostogų dienų liko dieną prieš perėjimą (iš senos programos), pvz. 12,5.",
  unpaid: "Kiek DU (į rankas) perėjimo dienai dar neišmokėta, pvz. praėjusio mėnesio atlyginimas. Pasiūlyta automatiškai, jei DU mokamas kitą mėnesį.",
  npd: "Nustatyta pagal GPM313: jei GPM lygus 20 % nuo išmokų – NPD netaikytas.",
  disability: "Ar darbuotojui nustatytas 0–55 % dalyvumo lygis (neįgalumas). Nuo jo priklauso atostogų trukmė (25 d.). Nepriklauso nuo NPD taikymo.",
  vdu: "Nebūtina. Paprastai VDU apskaičiuojame iš S50. Jei paskutiniais 3 mėnesiais buvo atostogų, didelių premijų – įrašykite VDU iš senos programos: standartiniam režimui – dienos, suminei apskaitai ar valandiniam apmokėjimui – valandos. Naudojamas pirmus 3 mėnesius.",
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
  const income = s.checklist?.income || [];
  const gpm = s.checklist?.gpm313 || [];
  const from = s.history_from;
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
                  {r.name}{r.optional && <Chip size="small" label="nebūtina" variant="outlined" sx={{ ml: 0.75, height: 18, fontSize: 10.5 }} />}
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
function Num({ value, onSave, disabled, width = 90, error, suffix }) {
  const [v, setV] = useState(toComma(value));
  useEffect(() => setV(toComma(value)), [value]);
  const bad = v !== "" && Number.isNaN(Number(toDot(v)));
  return (
    <TextField size="small" value={v} disabled={disabled} error={error || bad} sx={{ width }} inputProps={{ inputMode: "decimal" }}
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

function ProfessionPicker({ p, locked, onPerson }) {
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
    <Box sx={{ width: 250 }}>
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
      <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.25 }}>
        {inCategory ? <>Grupė {p.lpk4}{!locked && <> · <Box component="span" onClick={() => onPerson(p.id, { lpk4: "", lpk_code: "" })}
          sx={{ color: "primary.main", cursor: "pointer", "&:hover": { textDecoration: "underline" } }}>kita profesija</Box></>}</>
          : "Visas profesijų sąrašas"}
      </Typography>
    </Box>
  );
}

function AddPersonDialog({ open, onClose, onAdd, busy }) {
  const empty = { first_name: "", last_name: "", person_code: "", weekly_hours: "40", work_time_mode: "01" };
  const [f, setF] = useState(empty);
  useEffect(() => { if (open) setF(empty); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const ok = f.first_name.trim() && f.last_name.trim() && /^\d{11}$/.test(f.person_code.trim());
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" disableScrollLock>
      <DialogTitle>Pridėti darbuotoją</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 1.5, pt: "8px !important" }}>
        <TextField size="small" label="Vardas" value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} />
        <TextField size="small" label="Pavardė" value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} />
        <TextField size="small" label="Asmens kodas" value={f.person_code} inputProps={{ inputMode: "numeric", maxLength: 11 }}
          onChange={(e) => setF({ ...f, person_code: e.target.value.replace(/\D/g, "") })} />
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Kitus duomenis užpildysite lentelėje.</Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Atšaukti</Button>
        <Button variant="contained" disableElevation disabled={!ok || busy} onClick={() => onAdd(f)}>Pridėti</Button>
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
  ].filter(([, n]) => n > 0);
  return { active: act.length, parts };
}

function rowMissing(p) {
  if (!p.employed) return 0;
  return [!p.lpk_code, !p.start_date, !(Number(p.base_amount) > 0), !(Number(p.weekly_hours) > 0),
    p.vacation_balance === null || p.vacation_balance === "",
    p.summed_mid_period && (p.summed_worked_hours === null || p.summed_worked_hours === ""),
    (p.transition_state || "work") !== "work" && !p.transition_until].filter(Boolean).length;
}

function Section({ title, children }) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5, bgcolor: "background.paper" }}>
      <Typography sx={{ fontSize: 13, fontWeight: 800, mb: 1 }}>{title}</Typography>
      <Box sx={{ display: "grid", gap: 1.25 }}>{children}</Box>
    </Box>
  );
}

function Field({ label, help, note, children }) {
  return (
    <Box>
      <Typography component="div" sx={{ fontSize: 12, color: "text.secondary", mb: 0.4 }}>{help ? <HeadHelp label={label} help={help} /> : label}</Typography>
      {children}
      {note && <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.3 }}>{note}</Typography>}
    </Box>
  );
}

function PersonDetails({ p, data, locked, set, onKids }) {
  const def = data.summed_default || {};
  const summed = p.work_time_mode === "02";
  const state = p.transition_state || "work";
  const duMonth = dayjs(data.du_start).locale("lt").format("MMMM");
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0,1fr))" }, gap: 1.5 }}>
      <Section title="Sutartis">
        <Field label="Darbo pradžia"><DateField value={p.start_date} disabled={locked} error={!p.start_date} onChange={(v) => set({ start_date: v })} width="100%" /></Field>
        <Field label="Sutarties rūšis"><Sel value={p.contract_type === "02" ? "02" : "01"} options={[["01", "Neterminuota"], ["02", "Terminuota"]]} width="100%"
          disabled={locked} onChange={(v) => set({ contract_type: v })} /></Field>
        <Field label="Apmokėjimas"><Sel value={p.pay_form} options={[["monthly", "Mėnesinė alga"], ["hourly", "Valandinis įkainis"]]} width="100%"
          disabled={locked} onChange={(v) => set({ pay_form: v })} /></Field>
      </Section>
      <Section title="Mokesčiai ir lengvatos">
        <Field label="NPD" help={HELP.npd}><Sel value={p.npd_mode} options={NPD} width="100%" disabled={locked} onChange={(v) => set({ npd_mode: v })} /></Field>
        <Field label="Pensijų kaupimas"><Sel value={String(p.pension)} options={[["true", "Taip"], ["false", "Ne"]]} width="100%" disabled={locked}
          onChange={(v) => set({ pension: v === "true" })} /></Field>
        <Field label="Dalyvumo lygis" help={HELP.disability}><Sel value={String(!!p.has_disability)} options={[["false", "Ne"], ["true", "Taip"]]} width="100%"
          disabled={locked} onChange={(v) => set({ has_disability: v === "true" })} /></Field>
      </Section>
      <Section title="Išmokėjimas">
        <Field label="DU kartą per mėnesį"><Sel value={String(!!p.pay_once_a_month)} options={[["false", "Ne"], ["true", "Taip (darbuotojo prašymu)"]]}
          width="100%" disabled={locked} onChange={(v) => set({ pay_once_a_month: v === "true" })} /></Field>
        {!p.pay_once_a_month && <Field label="Avanso suma, €" note="Tuščia – pagal įmonės nustatymus">
          <Num value={p.advance_amount} width="100%" disabled={locked} onSave={(v) => set({ advance_amount: v })} /></Field>}
        <Field label="IBAN"><TextField size="small" fullWidth defaultValue={p.iban} disabled={locked}
          onBlur={(e) => e.target.value !== p.iban && set({ iban: e.target.value.replace(/\s/g, "").toUpperCase() })} /></Field>
      </Section>
      <Section title={`Perėjimo dieną (${data.du_start})`}>
        <Field label="Būsena"><Sel value={state} options={TRANSITION} width="100%" disabled={locked} onChange={(v) => set({ transition_state: v })} /></Field>
        {state !== "work" && <Field label="Iki"><DateField value={p.transition_until} disabled={locked} error={!p.transition_until}
          onChange={(v) => set({ transition_until: v })} width="100%" /></Field>}
        {state === "vacation" && <Field label={`Atostoginiai už ${duMonth} dienas jau išmokėti, €`}
          note="Jau sumokėta ankstesnėje programoje – DokSkenas jų nemokės dar kartą">
          <Num value={p.vacation_prepaid_amount} width="100%" disabled={locked} onSave={(v) => set({ vacation_prepaid_amount: v })} /></Field>}
        {state === "sick" && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Liga prasidėjo iki perėjimo – darbdavio 2 dienos jau apmokėtos.</Typography>}
        {["childcare", "maternity", "paternity"].includes(state) && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Išmoką moka Sodra – tik pažymime tabelyje.</Typography>}
      </Section>
      {summed && <Section title="Suminė apskaita">
        <Field label="Apskaitinis laikotarpis"><Sel value={String(p.summed_period_months || def.months || 3)}
          options={[["1", "1 mėn."], ["2", "2 mėn."], ["3", "3 mėn."]]} width="100%" disabled={locked} onChange={(v) => set({ summed_period_months: v })} /></Field>
        <Field label="Dabartinis laikotarpis prasidėjo"><DateField month value={p.summed_period_start || def.start} disabled={locked}
          onChange={(v) => set({ summed_period_start: v })} width="100%" /></Field>
        {p.summed_mid_period ? <>
          <Field label="Dirbta iki perėjimo, val." help={HELP.summedWorked}><Num value={p.summed_worked_hours} width="100%" disabled={locked}
            error={p.summed_worked_hours === null || p.summed_worked_hours === ""} onSave={(v) => set({ summed_worked_hours: v })} /></Field>
          <Field label="Nebuvimai, val." help={HELP.summedAbsence}><Num value={p.summed_absence_hours} width="100%" disabled={locked}
            onSave={(v) => set({ summed_absence_hours: v })} /></Field>
          <Field label="Jau apmokėta viršvalandžių, val." help={HELP.summedPaidOt}><Num value={p.summed_paid_overtime} width="100%" disabled={locked}
            onSave={(v) => set({ summed_paid_overtime: v })} /></Field>
        </> : <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Laikotarpis prasideda kartu su DU – likučių nereikia.</Typography>}
      </Section>}
      <Section title="Kita">
        <Field label="VDU iš senos programos" help={HELP.vdu} note="Tuščia – apskaičiuosime iš S50">
          <Num value={p.vdu_override} width="100%" disabled={locked} suffix={summed || p.pay_form === "hourly" ? "€/val." : "€/d."}
            onSave={(v) => set({ vdu_override: v })} /></Field>
        <Field label="Vaikai" help={HELP.children}>
          <Button size="small" variant="outlined" disabled={locked} onClick={onKids} sx={{ textTransform: "none", justifySelf: "start" }}>
            {(p.children || []).length ? `${p.children.length} · keisti` : "Pridėti"}
          </Button>
        </Field>
        <Field label="Vienas augina vaiką"><Sel value={String(!!p.single_parent)} options={[["false", "Ne"], ["true", "Taip"]]} width="100%"
          disabled={locked} onChange={(v) => set({ single_parent: v === "true" })} /></Field>
      </Section>
    </Box>
  );
}

function PeopleStep({ data, locked, busy, onPerson, onAction, onExcel }) {
  const fileRef = useRef(null);
  const [adding, setAdding] = useState(false);
  const [kids, setKids] = useState(null);
  const [open, setOpen] = useState({});
  const people = data.people.filter((p) => p.include);
  const download = async () => {
    const blob = await payrollApi.migrationExcel();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "darbuotojai_perejimas.xlsx"; a.click(); URL.revokeObjectURL(url);
  };
  const head = (label, help) => <TableCell sx={{ fontSize: 11.5, fontWeight: 800 }}><HeadHelp label={label} help={help} /></TableCell>;
  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, flexWrap: "wrap", mb: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: 17, fontWeight: 800 }}>Darbuotojai</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.25 }}>
            Pagrindiniai laukai – lentelėje, kiti – atidarius darbuotojo eilutę. Kas rasta ataskaitose – jau užpildyta.
          </Typography>
        </Box>
        {!locked && (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setAdding(true)} sx={{ textTransform: "none" }}>Pridėti</Button>
            <Button size="small" startIcon={<DownloadIcon />} onClick={download} sx={{ textTransform: "none" }}>Excel šablonas</Button>
            <Button size="small" startIcon={<UploadFileIcon />} disabled={busy} onClick={() => fileRef.current?.click()} sx={{ textTransform: "none" }}>Įkelti Excel</Button>
            <input ref={fileRef} hidden type="file" accept=".xlsx" onChange={(e) => { onExcel(e.target.files?.[0]); e.target.value = ""; }} />
          </Box>
        )}
      </Box>
      {!people.length ? (
        <Alert severity="info">Darbuotojų dar nėra – įkelkite ataskaitas, Excel šabloną arba pridėkite rankiniu būdu.</Alert>
      ) : (
        <TableContainer component={Paper} sx={{ ...surfaceSx }}>
          <Table size="small" sx={{ minWidth: 1100, "& td": { verticalAlign: "top", py: 1 } }}>
            <TableHead><TableRow>
              <TableCell sx={{ width: 36 }} />
              {head("Darbuotojas")}{head("Profesija", HELP.profession)}{head("Alga, €", HELP.salary)}{head("Norma, val./sav.", HELP.norm)}
              {head("Režimas", HELP.mode)}{head("Atostogų likutis, d.", HELP.vacation)}{head("Neišmokėta, €", HELP.unpaid)}{head("Būsena")}
              <TableCell sx={{ width: 40 }} />
            </TableRow></TableHead>
            <TableBody>
              {people.map((p) => {
                const set = (patch) => onPerson(p.id, patch);
                const miss = rowMissing(p);
                const isOpen = !!open[p.id];
                return (
                  <Fragment key={p.id}>
                    <TableRow sx={{ bgcolor: p.s29_missing && p.employed ? "#FFF8EE" : undefined, "& > td": { borderBottom: isOpen ? 0 : undefined } }}>
                      <TableCell padding="checkbox">
                        {p.employed && <IconButton size="small" onClick={() => setOpen({ ...open, [p.id]: !isOpen })}>
                          {isOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                        </IconButton>}
                      </TableCell>
                      <TableCell sx={{ minWidth: 190 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{p.first_name} {p.last_name}</Typography>
                        <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                          {p.person_code.slice(0, 3)}••••{p.person_code.slice(-2)}{p.start_date ? ` · nuo ${p.start_date}` : ""}
                        </Typography>
                        <Box sx={{ mt: 0.5 }}><Sel value={String(p.employed)} options={[["true", "Dirba"], ["false", "Nedirba"]]} width={110}
                          disabled={locked} onChange={(v) => set({ employed: v === "true" })} /></Box>
                        {p.s29_missing && p.employed && <Typography sx={{ fontSize: 11, color: "warning.dark", mt: 0.25 }}>Nebėra naujame S29 – nebedirba?</Typography>}
                      </TableCell>
                      {!p.employed ? (
                        <TableCell colSpan={7}><Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                          Nedirba{p.end_date ? ` nuo ${p.end_date}` : ""} – perkeliama tik istorija metinei GPM312</Typography></TableCell>
                      ) : <>
                        <TableCell><ProfessionPicker p={p} locked={locked} onPerson={onPerson} /></TableCell>
                        <TableCell>
                          <Num value={p.base_amount} width={120} disabled={locked} error={!(Number(p.base_amount) > 0)}
                            suffix={p.pay_form === "hourly" ? "€/val." : "€"} onSave={(v) => set({ base_amount: v })} />
                          <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.3 }}>{p.pay_form === "hourly" ? "Valandinis" : "Mėnesinė"}</Typography>
                        </TableCell>
                        <TableCell><Num value={p.weekly_hours} width={80} disabled={locked} error={!(Number(p.weekly_hours) > 0)}
                          onSave={(v) => set({ weekly_hours: v })} /></TableCell>
                        <TableCell><Sel value={p.work_time_mode || "01"} options={WORK_MODES.map(([v, l]) => [v, `${v} – ${l}`])} width={220}
                          disabled={locked} onChange={(v) => set({ work_time_mode: v })} /></TableCell>
                        <TableCell><Num value={p.vacation_balance} width={90} disabled={locked}
                          error={p.vacation_balance === null || p.vacation_balance === ""} onSave={(v) => set({ vacation_balance: v })} /></TableCell>
                        <TableCell><Num value={p.unpaid_amount} width={110} disabled={locked} onSave={(v) => set({ unpaid_amount: v })} /></TableCell>
                        <TableCell>
                          <Chip size="small" label={miss ? `Trūksta ${miss}` : "Užpildyta"} color={miss ? "error" : "success"} variant="outlined"
                            onClick={() => setOpen({ ...open, [p.id]: true })} sx={{ cursor: "pointer" }} />
                        </TableCell>
                      </>}
                      <TableCell padding="checkbox">
                        {!locked && <Tooltip title="Pašalinti iš sąrašo">
                          <IconButton size="small" onClick={() => window.confirm(`Pašalinti ${p.first_name} ${p.last_name}?`) && onAction({ action: "remove_person", id: p.id })}>
                            <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>}
                      </TableCell>
                    </TableRow>
                    {p.employed && isOpen && (
                      <TableRow>
                        <TableCell colSpan={10} sx={{ bgcolor: "#F6F8FB", py: 1.75 }}>
                          <PersonDetails p={p} data={data} locked={locked} set={set} onKids={() => setKids(p)} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
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
      {acct.mode === "gap" && (
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

function Progress({ data, step, maxStep, onGo }) {
  const rows = reportRows(data).filter((r) => !r.optional);
  const reportsOk = rows.every((r) => r.state === "ok" || r.state === "notneeded");
  const miss = peopleMissing(data.people || []);
  const confirmed = data.status === "confirmed";
  const done = [reportsOk, miss.active > 0 && !miss.parts.length, confirmed];
  const hints = [
    reportsOk ? "Įkeltos" : `${rows.filter((r) => r.state === "ok" || r.state === "notneeded").length} iš ${rows.length}`,
    !miss.active ? "Nėra darbuotojų" : miss.parts.length ? `Trūksta: ${miss.parts.map(([n]) => n).join(", ")}` : `${miss.active} dirbantys`,
    confirmed ? "DU galima skaičiuoti" : "Paskutinis žingsnis",
  ];
  const n = done.filter(Boolean).length;
  return (
    <Paper sx={{ ...surfaceSx, p: 2.25, position: { lg: "sticky" }, top: 24 }}>
      <Typography sx={{ fontSize: 14.5, fontWeight: 800 }}>Perėjimo eiga</Typography>
      <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1.25 }}>{n} iš {STEPS.length} atlikta</Typography>
      <LinearProgress variant="determinate" value={100 * n / STEPS.length} color="success" sx={{ height: 6, borderRadius: 99, bgcolor: "#EDF1F7", mb: 2 }} />
      <Box component="ol" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1.5 }}>
        {STEPS.map((title, i) => (
          <Box component="li" key={title}>
            <Box component="button" type="button" disabled={i > maxStep} onClick={() => onGo(i)}
              sx={{ appearance: "none", border: 0, bgcolor: "transparent", p: 0, font: "inherit", textAlign: "left", width: "100%",
                display: "flex", gap: 1.25, cursor: i > maxStep ? "default" : "pointer", color: "text.primary" }}>
              {done[i] ? <CheckCircleIcon sx={{ color: "success.main", fontSize: 19 }} />
                : <RadioButtonUncheckedIcon sx={{ color: i === step ? "primary.main" : "text.disabled", fontSize: 19 }} />}
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: i === step ? 800 : 650 }}>{i + 1}. {title}</Typography>
                <Typography sx={{ fontSize: 11.75, color: "text.secondary" }}>{hints[i]}</Typography>
              </Box>
            </Box>
          </Box>
        ))}
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

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", lg: "minmax(0,1fr) 250px" }, gap: 2.5, alignItems: "start" }}>
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
        <Box sx={{ order: { xs: -1, lg: 0 } }}>
          <Progress data={data} step={step} maxStep={Math.max(maxStep, data.people?.length ? 1 : 0, locked ? 2 : 0)} onGo={setStep} />
        </Box>
      </Box>
    </Box>
    </LocalizationProvider>
  );
}
