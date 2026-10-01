import { Fragment, useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, IconButton, InputAdornment, InputLabel, ListSubheader, MenuItem, Paper, Popover, Select, Stack,
  Step, StepButton, Stepper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";

import { ABSENCE_KINDS, EXTRA_HOURS, MONTHS, apiError, money, payrollApi } from "../../api/payroll";
import { AbsenceForm } from "./DarbuotojaiPage";

const MENU_PROPS = { disableScrollLock: true };
const WEEKDAYS = ["S", "Pr", "A", "T", "K", "Pn", "Š"];
const CODE_TO_KIND = Object.fromEntries(Object.entries(ABSENCE_KINDS).map(([k, v]) => [v.short, k]));

const EARNING_CODES = {
  "Priedai ir premijos": {
    PRV: "Vienkartinė premija, priedas ar priemoka",
    PRM: "Mėnesio premija",
    PRK: "Ketvirčio premija",
    PRT: "Metinė premija",
  },
  "Dovanos ir naudos": {
    DOV: "Dovana (iki 200 € per metus neapmokestinama)",
    SVD: "Papildomas sveikatos draudimas (iki 350 € per metus neapmokestinama)",
    NAT: "Kita nauda natūra (maitinimas, kelionė ir pan.)",
  },
  "Kompensacijos ir pašalpos": {
    DPN: "Dienpinigiai (komandiruotės)",
    AUK: "Kompensacija už asmeninį automobilį",
    NUO: "Nuotolinio darbo priemonių kompensacija",
    PSM: "Pašalpa dėl šeimos nario mirties",
    PSK: "Kita materialinė pašalpa",
  },
};
const DEDUCTION_CODES = {
  "Išskaitos": {
    AVN: "Jau išmokėtas avansas",
    ANT: "Išskaita pagal antstolio patvarkymą",
    PRF: "Profsąjungos nario mokestis",
    III: "Įmoka į III pakopos pensijų fondą",
    ZAL: "Žalos atlyginimas įmonei",
    ISK: "Kita išskaita",
  },
};

function defaultMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

const sum = (rows, f) => rows.reduce((a, r) => a + Number(typeof f === "function" ? f(r) : r[f] || 0), 0);

// ============================================================
// Puslapis
// ============================================================
export default function MenesioDUPage() {
  const [{ year, month }, setYm] = useState(defaultMonth);
  const [run, setRun] = useState(null);
  const [results, setResults] = useState([]);
  const [timesheet, setTimesheet] = useState([]);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const locked = run && run.status !== "draft";

  const loadAll = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await payrollApi.prepareRun(year, month);
      const [res, ts] = await Promise.all([payrollApi.runResults(r.id), payrollApi.timesheet(year, month)]);
      setRun(r); setResults(res); setTimesheet(ts);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const recalc = async () => {
    if (!run || locked) return;
    setBusy(true);
    try {
      const r = await payrollApi.recalcRun(run.id);
      const [res, ts] = await Promise.all([payrollApi.runResults(r.id), payrollApi.timesheet(year, month)]);
      setRun(r); setResults(res); setTimesheet(ts); setError("");
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };

  const shiftMonth = (delta) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYm({ year: d.getFullYear(), month: d.getMonth() + 1 });
    setStep(0);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400 }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={2} mb={2}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Atlyginimai</Typography>
          <Typography variant="body2" color="text.secondary">Trys žingsniai: patikrinti darbo laiką, peržiūrėti atlyginimus ir patvirtinti.</Typography>
        </Box>
        <Stack direction="row" alignItems="center" gap={1}>
          <IconButton onClick={() => shiftMonth(-1)} aria-label="Ankstesnis mėnuo"><ChevronLeftIcon /></IconButton>
          <Typography fontWeight={700} sx={{ minWidth: 150, textAlign: "center" }}>{year} m. {MONTHS[month - 1].toLowerCase()}</Typography>
          <IconButton onClick={() => shiftMonth(1)} aria-label="Kitas mėnuo"><ChevronRightIcon /></IconButton>
          {run && <Chip size="small" sx={{ ml: 1 }} color={locked ? "success" : "default"} label={locked ? "Patvirtinta" : "Juodraštis"} />}
          {busy && <CircularProgress size={18} sx={{ ml: 1 }} />}
        </Stack>
      </Stack>

      <Stepper nonLinear activeStep={step} sx={{ mb: 3 }}>
        {["Darbo laikas", "Atlyginimai", "Patvirtinimas"].map((l, i) => (
          <Step key={l} completed={locked && i < 2}><StepButton onClick={() => setStep(i)}>{l}</StepButton></Step>
        ))}
      </Stepper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {run?.warnings?.length > 0 && step < 2 && <Warnings items={run.warnings} />}

      {loading ? (
        <Box sx={{ py: 8, textAlign: "center" }}><CircularProgress /></Box>
      ) : timesheet.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: "center" }}>
          <Typography fontWeight={600}>Šį mėnesį darbuotojų nėra</Typography>
          <Typography variant="body2" color="text.secondary">Pirmiausia pridėkite darbuotojus ir jų darbo sutartis skiltyje „Darbuotojai“.</Typography>
        </Paper>
      ) : (
        <>
          {step === 0 && <TimesheetStep rows={timesheet} year={year} month={month} locked={locked} onChanged={recalc} onNext={() => setStep(1)} />}
          {step === 1 && <ResultsStep run={run} rows={results} locked={locked} onChanged={recalc} onNext={() => setStep(2)} />}
          {step === 2 && <ApproveStep run={run} rows={results} onDone={loadAll} setError={setError} />}
        </>
      )}
    </Box>
  );
}

function Warnings({ items }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, 3);
  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      <Typography variant="body2" fontWeight={600} mb={0.5}>Atkreipkite dėmesį</Typography>
      {shown.map((w, i) => <Typography key={i} variant="body2">{w}</Typography>)}
      {items.length > 3 && <Button size="small" onClick={() => setOpen(!open)} sx={{ mt: 0.5, p: 0 }}>{open ? "Rodyti mažiau" : `Rodyti visus (${items.length})`}</Button>}
    </Alert>
  );
}

// ============================================================
// 1. Darbo laikas (tabelis)
// ============================================================
function TimesheetStep({ rows, year, month, locked, onChanged, onNext }) {
  const [pop, setPop] = useState(null); // {anchor, row, day}
  const days = rows[0]?.days || [];

  return (
    <Stack gap={2}>
      <Typography variant="body2" color="text.secondary" maxWidth={760}>
        Darbo laikas užpildytas automatiškai pagal grafiką ir šventes. Pažymėkite tik tai, kas buvo kitaip –
        atostogas, ligą, viršvalandžius. Spauskite ant dienos.
      </Typography>

      <Stack direction="row" gap={1} flexWrap="wrap">
        {["vacation", "sick", "parent_day", "unpaid", "business_trip"].map((k) => (
          <Chip key={k} size="small" label={ABSENCE_KINDS[k].label} sx={{ bgcolor: ABSENCE_KINDS[k].color, color: "#fff" }} />
        ))}
        <Chip size="small" variant="outlined" label="Poilsio ar šventės diena" sx={{ bgcolor: "action.hover" }} />
      </Stack>

      <Paper variant="outlined" sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ "& td, & th": { px: 0.5, py: 0.75, textAlign: "center", fontSize: 12 } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ position: "sticky", left: 0, bgcolor: "background.paper", zIndex: 2, textAlign: "left !important", minWidth: 170 }}>Darbuotojas</TableCell>
              {days.map((d) => {
                const dt = new Date(d.date);
                const off = d.code === "P" || d.code === "S";
                return (
                  <TableCell key={d.date} sx={{ minWidth: 30, bgcolor: off ? "action.hover" : undefined, color: off ? "text.secondary" : undefined }}>
                    <div>{dt.getDate()}</div><div style={{ opacity: 0.6 }}>{WEEKDAYS[dt.getDay()]}</div>
                  </TableCell>
                );
              })}
              <TableCell sx={{ minWidth: 80 }}>Dirbo</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.employee}>
                <TableCell sx={{ position: "sticky", left: 0, bgcolor: "background.paper", zIndex: 1, textAlign: "left !important", fontWeight: 600, fontSize: "13px !important" }}>
                  {r.employee_name}
                </TableCell>
                {r.days.map((d) => (
                  <DayCell key={d.date} d={d} locked={locked} onClick={(e) => setPop({ anchor: e.currentTarget, row: r, day: d })} />
                ))}
                <TableCell>{r.worked_days} d.<br /><span style={{ opacity: 0.6 }}>{Number(r.worked_hours)} val.</span></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Box><Button variant="contained" onClick={onNext}>Darbo laikas teisingas – toliau</Button></Box>

      {pop && (
        <DayPopover pop={pop} year={year} month={month} onClose={() => setPop(null)}
          onChanged={() => { setPop(null); onChanged(); }} />
      )}
    </Stack>
  );
}

function DayCell({ d, locked, onClick }) {
  const kind = d.event_kind || CODE_TO_KIND[d.code];
  const off = d.code === "P" || d.code === "S" || d.code === "-";
  const extra = Object.values(d.extra || {}).reduce((a, v) => a + Number(v), 0);
  const color = kind ? ABSENCE_KINDS[kind]?.color : null;
  const clickable = !locked && d.code !== "-";
  return (
    <TableCell
      onClick={clickable ? onClick : undefined}
      sx={{
        cursor: clickable ? "pointer" : "default",
        bgcolor: color || (off ? "action.hover" : undefined),
        color: color ? "#fff" : off ? "text.disabled" : "text.secondary",
        fontWeight: color ? 700 : 400,
        position: "relative",
        "&:hover": clickable ? { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 } : undefined,
      }}
    >
      {color ? ABSENCE_KINDS[kind].short : d.code === "FD" ? Number(d.hours) : ""}
      {extra > 0 && <Box component="span" sx={{ position: "absolute", top: 1, right: 2, fontSize: 9, color: "warning.main", fontWeight: 700 }}>+{extra}</Box>}
    </TableCell>
  );
}

function DayPopover({ pop, onClose, onChanged }) {
  const { row, day } = pop;
  const [mode, setMode] = useState(day.event_kind ? "event" : "menu");
  const [hours, setHours] = useState({ hour_type: "overtime", hours: "" });
  const [error, setError] = useState("");
  const dt = new Date(day.date);

  const saveHours = async () => {
    try {
      await payrollApi.setTimesheetHours({ employee: row.employee, date: day.date, code: "FD", ...hours });
      onChanged();
    } catch (e) { setError(apiError(e)); }
  };
  const removeHours = async (hour_type) => {
    try { await payrollApi.clearTimesheetHours({ employee: row.employee, date: day.date, hour_type }); onChanged(); }
    catch (e) { setError(apiError(e)); }
  };
  const removeEvent = async () => {
    try { await payrollApi.deleteAbsence(day.event_id); onChanged(); }
    catch (e) { setError(apiError(e)); }
  };

  return (
    <Popover open anchorEl={pop.anchor} onClose={onClose} disableScrollLock
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }} transformOrigin={{ vertical: "top", horizontal: "center" }}>
      <Box sx={{ p: 2, width: 340 }}>
        <Typography fontWeight={700}>{row.employee_name}</Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>{MONTHS[dt.getMonth()]} {dt.getDate()} d.</Typography>

        {mode === "event" && (
          <Stack gap={1.5}>
            <Chip label={ABSENCE_KINDS[day.event_kind]?.label} sx={{ alignSelf: "flex-start", bgcolor: ABSENCE_KINDS[day.event_kind]?.color, color: "#fff" }} />
            <Typography variant="body2" color="text.secondary">Įvykis gali apimti kelias dienas – bus ištrintas visas.</Typography>
            <Stack direction="row" gap={1}>
              <Button color="error" variant="outlined" size="small" onClick={removeEvent} disabled={!day.event_id}>Ištrinti įvykį</Button>
              <Button size="small" onClick={onClose}>Uždaryti</Button>
            </Stack>
          </Stack>
        )}

        {mode === "menu" && (
          <Stack gap={1}>
            <Button variant="outlined" onClick={() => setMode("absence")}>Nedirbo (atostogos, liga…)</Button>
            <Button variant="outlined" onClick={() => setMode("hours")}>Dirbo papildomai (viršvalandžiai, naktis…)</Button>
            {Object.entries(day.extra || {}).map(([k, v]) => (
              <Stack key={k} direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1 }}>
                <Typography variant="body2">{EXTRA_HOURS[k]}: {Number(v)} val.</Typography>
                <IconButton size="small" onClick={() => removeHours(k)}><DeleteOutlineIcon fontSize="small" /></IconButton>
              </Stack>
            ))}
          </Stack>
        )}

        {mode === "absence" && (
          <AbsenceForm employee={row.employee} defaults={{ start_date: day.date, end_date: day.date }}
            onSaved={onChanged} onCancel={() => setMode("menu")} />
        )}

        {mode === "hours" && (
          <Stack gap={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>Kokios valandos</InputLabel>
              <Select label="Kokios valandos" value={hours.hour_type} MenuProps={MENU_PROPS} onChange={(e) => setHours({ ...hours, hour_type: e.target.value })}>
                {Object.entries(EXTRA_HOURS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField size="small" label="Valandų" type="number" value={hours.hours} autoFocus
              onChange={(e) => setHours({ ...hours, hours: e.target.value })}
              InputProps={{ endAdornment: <InputAdornment position="end">val.</InputAdornment> }} />
            <Stack direction="row" gap={1}>
              <Button variant="contained" size="small" disabled={!(Number(hours.hours) > 0)} onClick={saveHours}>Išsaugoti</Button>
              <Button size="small" onClick={() => setMode("menu")}>Atgal</Button>
            </Stack>
          </Stack>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </Box>
    </Popover>
  );
}

// ============================================================
// 2. Atlyginimai
// ============================================================
const taxesOf = (r) => Number(r.gpm) + Number(r.gpm15) + Number(r.vsd) + Number(r.psd) + Number(r.kaupimas);

function ResultsStep({ run, rows, locked, onChanged, onNext }) {
  const [open, setOpen] = useState(null);
  const [addFor, setAddFor] = useState(null); // {employee, kind}
  const [codes, setCodes] = useState([]);

  useEffect(() => { payrollApi.payCodes().then(setCodes).catch(() => {}); }, []);

  return (
    <Stack gap={2}>
      <Typography variant="body2" color="text.secondary" maxWidth={760}>
        Atlyginimai apskaičiuoti automatiškai pagal sutartis ir darbo laiką. Jei reikia, pridėkite premiją, dovaną ar išskaitą –
        mokesčiai persiskaičiuos patys.
      </Typography>

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell width={40} />
              <TableCell>Darbuotojas</TableCell>
              <TableCell align="right">Priskaičiuota</TableCell>
              <TableCell align="right">Mokesčiai</TableCell>
              <TableCell align="right">Į rankas</TableCell>
              <TableCell align="right">Išmokėti</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <TableRow hover sx={{ cursor: "pointer", "& > td": { borderBottom: open === r.employee ? "none" : undefined } }}
                  onClick={() => setOpen(open === r.employee ? null : r.employee)}>
                  <TableCell>{open === r.employee ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}</TableCell>
                  <TableCell>
                    <Typography fontWeight={600} fontSize={14}>{r.employee_name}</Typography>
                    {r.warnings?.length > 0 && <Typography variant="caption" color="warning.main">Yra pastabų</Typography>}
                  </TableCell>
                  <TableCell align="right">{money(r.gross)}</TableCell>
                  <TableCell align="right">{money(taxesOf(r))}</TableCell>
                  <TableCell align="right">{money(r.net)}</TableCell>
                  <TableCell align="right"><Typography fontWeight={700} fontSize={14}>{money(r.payable)}</Typography></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={6} sx={{ p: 0 }}>
                    <Collapse in={open === r.employee} unmountOnExit>
                      <EmployeeLines run={run} result={r} locked={locked} onChanged={onChanged}
                        onAdd={(kind) => setAddFor({ employee: r.employee, name: r.employee_name, kind })} />
                    </Collapse>
                  </TableCell>
                </TableRow>
              </Fragment>
            ))}
            <TableRow sx={{ "& td": { fontWeight: 700, borderTop: 2, borderColor: "divider" } }}>
              <TableCell /><TableCell>Iš viso</TableCell>
              <TableCell align="right">{money(sum(rows, "gross"))}</TableCell>
              <TableCell align="right">{money(sum(rows, taxesOf))}</TableCell>
              <TableCell align="right">{money(sum(rows, "net"))}</TableCell>
              <TableCell align="right">{money(sum(rows, "payable"))}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Paper>

      <Box><Button variant="contained" onClick={onNext}>Viskas teisinga – toliau</Button></Box>

      <AddLineDialog open={!!addFor} target={addFor} run={run} codes={codes}
        onClose={() => setAddFor(null)} onSaved={() => { setAddFor(null); onChanged(); }} />
    </Stack>
  );
}

function EmployeeLines({ run, result, locked, onChanged, onAdd }) {
  const [lines, setLines] = useState(null);
  useEffect(() => { payrollApi.runLines(run.id, result.employee).then(setLines).catch(() => setLines([])); }, [run.id, result.employee, result.id]);
  if (!lines) return <Box sx={{ p: 2 }}><CircularProgress size={18} /></Box>;

  const groups = [
    ["Priskaičiuota", (l) => ["earning", "compensation", "in_kind"].includes(l.category)],
    ["Išskaičiuota iš atlyginimo", (l) => l.category === "deduction"],
    ["Įmonė papildomai moka Sodrai", (l) => l.category === "employer"],
  ];
  const remove = (id) => payrollApi.deleteRunLine(id).then(onChanged);

  return (
    <Box sx={{ px: 7, py: 2, bgcolor: "action.hover" }}>
      <Stack direction={{ xs: "column", md: "row" }} gap={4}>
        {groups.map(([title, f]) => {
          const g = lines.filter(f);
          if (!g.length) return null;
          return (
            <Box key={title} sx={{ flex: 1, minWidth: 220 }}>
              <Typography variant="body2" fontWeight={700} mb={1}>{title}</Typography>
              {g.map((l) => (
                <Stack key={l.id} direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.25 }}>
                  <Tooltip title={l.comment || ""}>
                    <Typography variant="body2">
                      {l.code_name}
                      {Number(l.quantity) > 0 && <span style={{ opacity: 0.6 }}> · {Number(l.quantity)} {["ALG", "VAL", "VRS", "NAK", "POI", "SVN", "VRP", "VRN", "VRF"].includes(l.code) ? "val." : "d."}</span>}
                    </Typography>
                  </Tooltip>
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    <Typography variant="body2">{money(l.amount)}</Typography>
                    {l.is_manual && !locked && <IconButton size="small" onClick={() => remove(l.id)}><DeleteOutlineIcon sx={{ fontSize: 16 }} /></IconButton>}
                  </Stack>
                </Stack>
              ))}
            </Box>
          );
        })}
      </Stack>
      {Number(result.daily_vdu) > 0 && (
        <Typography variant="caption" color="text.secondary" display="block" mt={1.5}>
          Vidutinis dienos uždarbis (atostoginiams ir ligai): {money(result.daily_vdu)}
        </Typography>
      )}
      {!locked && (
        <Stack direction="row" gap={1} mt={2}>
          <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={() => onAdd("earning")}>Pridėti išmoką</Button>
          <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={() => onAdd("deduction")}>Pridėti išskaitą</Button>
        </Stack>
      )}
    </Box>
  );
}

function AddLineDialog({ open, target, run, codes, onClose, onSaved }) {
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const groups = target?.kind === "deduction" ? DEDUCTION_CODES : EARNING_CODES;

  useEffect(() => {
    if (open) { setCode(Object.keys(Object.values(groups)[0])[0]); setAmount(""); setComment(""); setError(""); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const pc = codes.find((c) => c.code === code);
    if (!pc) { setError("DU kodas nerastas – paleiskite payroll_seed"); return; }
    try {
      await payrollApi.addRunLine({ run: run.id, employee: target.employee, pay_code: pc.id, amount, comment });
      onSaved();
    } catch (e) { setError(apiError(e)); }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" disableScrollLock>
      <DialogTitle>{target?.kind === "deduction" ? "Nauja išskaita" : "Nauja išmoka"}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" mb={2}>{target?.name}</Typography>
        <Stack gap={2}>
          <FormControl fullWidth>
            <InputLabel>Kas tai?</InputLabel>
            <Select label="Kas tai?" value={code} MenuProps={MENU_PROPS} onChange={(e) => setCode(e.target.value)}>
              {Object.entries(groups).flatMap(([g, items]) => [
                <ListSubheader key={g}>{g}</ListSubheader>,
                ...Object.entries(items).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>),
              ])}
            </Select>
          </FormControl>
          <TextField label="Suma" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus
            InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }}
            helperText={target?.kind === "deduction" ? "Suma, kuri bus atimta iš išmokamos sumos" : "Suma „ant popieriaus“ – mokesčiai bus paskaičiuoti automatiškai"} />
          <TextField label="Pastaba (nebūtina)" value={comment} onChange={(e) => setComment(e.target.value)} />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Atšaukti</Button>
        <Button variant="contained" onClick={save} disabled={!(Number(amount) > 0)}>Pridėti</Button>
      </DialogActions>
    </Dialog>
  );
}

// ============================================================
// 3. Patvirtinimas
// ============================================================
function SdupBlock({ run }) {
  const [state, setState] = useState(null);
  useEffect(() => { payrollApi.runSdup(run.id).then(setState).catch(() => setState(null)); }, [run.id, run.status]);
  if (!state) return null;
  const download = async () => {
    const blob = await payrollApi.runSdupFile(run.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `SDUP_${run.year}-${String(run.month).padStart(2, "0")}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Typography fontWeight={600} mb={0.5}>Skaidraus darbo užmokesčio pranešimas (SDUP)</Typography>
      <Typography variant="body2" color="text.secondary" mb={1.5}>
        Nuo 2027 m. teikiamas Sodrai kas mėnesį iki kito mėnesio paskutinės dienos. Failą įkelkite į EDAS.
      </Typography>
      {state.errors.length > 0 ? (
        <Alert severity="warning">
          {state.errors.map((e, i) => <div key={i}>{e}</div>)}
        </Alert>
      ) : (
        <Button variant="outlined" onClick={download}>Atsisiųsti SDUP (JSON)</Button>
      )}
    </Paper>
  );
}

function ApproveStep({ run, rows, onDone, setError }) {
  const [busy, setBusy] = useState(false);
  const locked = run.status !== "draft";

  const toEmployees = sum(rows, "payable");
  const toVmi = sum(rows, (r) => Number(r.gpm) + Number(r.gpm15));
  const toSodra = sum(rows, (r) => Number(r.sam_payment) + Number(r.grindys_vsd) + Number(r.grindys_psd));
  const cost = sum(rows, (r) => Number(r.gross) + Number(r.employer_vsd) + Number(r.gar) + Number(r.ilg) + Number(r.grindys_vsd) + Number(r.grindys_psd));

  const act = async (fn) => {
    setBusy(true);
    try { await fn(run.id); await onDone(); } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };

  const Tile = ({ title, value, note }) => (
    <Paper variant="outlined" sx={{ p: 2.5, flex: 1, minWidth: 200 }}>
      <Typography variant="body2" color="text.secondary">{title}</Typography>
      <Typography variant="h5" fontWeight={700} my={0.5}>{money(value)}</Typography>
      <Typography variant="caption" color="text.secondary">{note}</Typography>
    </Paper>
  );

  return (
    <Stack gap={3}>
      <Stack direction={{ xs: "column", md: "row" }} gap={2}>
        <Tile title="Išmokėti darbuotojams" value={toEmployees} note="Pervesti į darbuotojų banko sąskaitas" />
        <Tile title="Sumokėti VMI (pajamų mokestis)" value={toVmi} note="Iki kito mėnesio 15 d." />
        <Tile title="Sumokėti Sodrai" value={toSodra} note="Iki kito mėnesio 15 d." />
      </Stack>
      <Typography variant="body2" color="text.secondary">Įmonei šis mėnuo iš viso kainavo {money(cost)} (atlyginimai su visais mokesčiais).</Typography>

      {locked ? (
        <Alert severity="success" action={<Button color="inherit" size="small" disabled={busy} onClick={() => act(payrollApi.reopenRun)}>Atidaryti taisymui</Button>}>
          Atlyginimai patvirtinti, įrašas į didžiąją knygą sukurtas.
        </Alert>
      ) : null}
      {locked ? (
        <SdupBlock run={run} />
      ) : (
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography fontWeight={600} mb={0.5}>Ar viskas teisinga?</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Patvirtinus bus sukurtas įrašas didžiojoje knygoje. Jei vėliau rasite klaidą – atidarykite taisymui, pataisykite ir patvirtinkite iš naujo.
          </Typography>
          <Button variant="contained" size="large" disabled={busy || rows.length === 0} onClick={() => act(payrollApi.approveRun)}>
            Patvirtinti atlyginimus
          </Button>
        </Paper>
      )}
    </Stack>
  );
}
