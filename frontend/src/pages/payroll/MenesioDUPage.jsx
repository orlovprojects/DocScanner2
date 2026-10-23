import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, FormControlLabel, IconButton, InputAdornment, InputLabel, ListSubheader, MenuItem, Paper, Popover, Radio,
  RadioGroup, Select, Stack,
  Step, StepButton, Stepper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import RadioButtonUncheckedRoundedIcon from "@mui/icons-material/RadioButtonUncheckedRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import LockOpenOutlinedIcon from "@mui/icons-material/LockOpenOutlined";
import FlightTakeoffRoundedIcon from "@mui/icons-material/FlightTakeoffRounded";
import BeachAccessOutlinedIcon from "@mui/icons-material/BeachAccessOutlined";
import SickOutlinedIcon from "@mui/icons-material/SickOutlined";
import ChildCareOutlinedIcon from "@mui/icons-material/ChildCareOutlined";
import MoreTimeRoundedIcon from "@mui/icons-material/MoreTimeRounded";
import EmojiEventsOutlinedIcon from "@mui/icons-material/EmojiEventsOutlined";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import GavelRoundedIcon from "@mui/icons-material/GavelRounded";
import RemoveCircleOutlineRoundedIcon from "@mui/icons-material/RemoveCircleOutlineRounded";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import CardGiftcardOutlinedIcon from "@mui/icons-material/CardGiftcardOutlined";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import EditCalendarOutlinedIcon from "@mui/icons-material/EditCalendarOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import SearchIcon from "@mui/icons-material/Search";

import { ABSENCE_KINDS, EXTRA_HOURS, MONTHS, apiError, money, payrollApi } from "../../api/payroll";
import { AbsenceForm } from "./DarbuotojaiPage";
import SodraReportsDialog from "./SodraReportsDialog";
import { TripPeriodBlock } from "./TripPeriodChoice";
import { useNavigate, useSearchParams } from "react-router-dom";
import IsmokejimaiPage from "./IsmokejimaiPage";

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
// mode: "full" - visi žingsniai (senas puslapis); "timesheet" - tik tabelis (Grafikai ir tabeliai);
//       "payroll" - atlyginimai -> patvirtinimas -> išmokėjimai (Darbo užmokestis)
export default function MenesioDUPage({ mode = "full", embedded = false } = {}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // mėnuo: iš nuorodos (?m=YYYY-MM), kitaip - kurį siūlo serveris (seniausias nepatvirtintas nuo DU pradžios DokSkenas)
  const parseYm = (v) => { const m = /^(\d{4})-(\d{2})$/.exec(v || ""); return m ? { year: Number(m[1]), month: Number(m[2]) } : null; };
  const [ymState, setYm] = useState(() => parseYm(params.get("m")));
  const [period, setPeriod] = useState(null);        // {start: "YYYY-MM" | null, default: "YYYY-MM"}
  useEffect(() => {
    payrollApi.payrollPeriod()
      .then((p) => { setPeriod(p); setYm((cur) => cur || parseYm(p.default) || defaultMonth()); })
      .catch(() => setYm((cur) => cur || defaultMonth()));
  }, []);
  const { year, month } = ymState || { year: 0, month: 0 };
  const startYm = parseYm(period?.start);
  const atStart = !!startYm && (year < startYm.year || (year === startYm.year && month <= startYm.month));
  useEffect(() => {
    if (!year) return;
    const v = `${year}-${String(month).padStart(2, "0")}`;
    if (params.get("m") !== v) setParams((p) => { const n = new URLSearchParams(p); n.set("m", v); return n; }, { replace: true });
  }, [year, month]); // eslint-disable-line react-hooks/exhaustive-deps
  const [payItems, setPayItems] = useState(null);
  const [approveNotes, setApproveNotes] = useState([]);
  const [run, setRun] = useState(null);
  const [ready, setReady] = useState(null);      // grafikas -> tabelis -> atlyginimai (žr. readiness.py)
  const [results, setResults] = useState([]);
  const [timesheet, setTimesheet] = useState([]);
  const STEPS = mode === "payroll" ? ["Atlyginimai ir mokesčiai", "Išmokėjimai"]
    : mode === "timesheet" ? ["Darbo laikas"] : ["Darbo laikas", "Atlyginimai", "Patvirtinimas"];
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const locked = run && run.status !== "draft";
  const [sickOpen, setSickOpen] = useState(false);

  const inflight = useRef("");                   // tas pats mėnuo neperskaičiuojamas du kartus vienu metu
  const loadAll = useCallback(async () => {
    if (!year) return;
    const key = `${year}-${month}`;
    if (inflight.current === key) return;
    inflight.current = key;
    setLoading(true); setError("");
    try {
      const r = await payrollApi.prepareRun(year, month);
      const [res, ts, rd] = await Promise.all([payrollApi.runResults(r.id), payrollApi.timesheet(year, month),
        payrollApi.payrollReadiness(year, month).catch(() => null)]);
      setRun(r); setResults(res); setTimesheet(ts); setReady(rd);
    } catch (e) {
      setError(apiError(e));
    } finally {
      if (inflight.current === key) inflight.current = "";
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const recalc = async () => {
    if (!run || locked) return;
    setBusy(true);
    try {
      const r = await payrollApi.recalcRun(run.id);
      const [res, ts, rd] = await Promise.all([payrollApi.runResults(r.id), payrollApi.timesheet(year, month),
        payrollApi.payrollReadiness(year, month).catch(() => null)]);
      setRun(r); setResults(res); setTimesheet(ts); setReady(rd); setError("");
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };

  const shiftMonth = (delta) => {
    if (delta < 0 && atStart) return;
    const d = new Date(year, month - 1 + delta, 1);
    setYm({ year: d.getFullYear(), month: d.getMonth() + 1 });
    setStep(0);
  };

  if (!ymState) return <Box sx={{ py: 8, textAlign: "center" }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: embedded ? 0 : { xs: 2, md: 3 }, maxWidth: 1400 }}>
      {mode === "payroll" && (
        <Stack direction="row" alignItems="center" gap={1.25} mb={2} flexWrap="wrap">
          <Box sx={{ display: "flex", alignItems: "center", gap: .35, px: .6, py: .45, border: "1px solid #E4E7EC", borderRadius: 2, bgcolor: "#FFFFFF" }}>
            <Tooltip arrow title={atStart ? `Darbo užmokestis DokSkenas skaičiuojamas nuo ${period.start} – ankstesni mėnesiai buvo skaičiuoti kitoje programoje` : ""}>
              <span>
                <IconButton size="small" aria-label="Ankstesnis mėnuo" disabled={atStart} onClick={() => shiftMonth(-1)} sx={{ borderRadius: 1.35, width: 31, height: 31 }}><ChevronLeftIcon fontSize="small" /></IconButton>
              </span>
            </Tooltip>
            <Box sx={{ minWidth: 150, textAlign: "center" }}>
              <Typography sx={{ fontSize: 10, color: "#98A2B3", lineHeight: 1.15, fontWeight: 600, letterSpacing: .3 }}>MĖNUO</Typography>
              <Typography sx={{ fontSize: 15, fontWeight: 600, color: "#101828", lineHeight: 1.5 }}>{MONTHS[month - 1]} {year}</Typography>
            </Box>
            <IconButton size="small" aria-label="Kitas mėnuo" onClick={() => shiftMonth(1)} sx={{ borderRadius: 1.35, width: 31, height: 31 }}><ChevronRightIcon fontSize="small" /></IconButton>
          </Box>
          {run && (
            <Chip size="small" label={locked ? "Patvirtinta" : "Juodraštis"}
              sx={{ height: 28, borderRadius: 1.6, fontWeight: 500, bgcolor: locked ? "#ECFDF3" : "#F2F4F7", color: locked ? "#027A48" : "#475467" }} />
          )}
          {busy && <CircularProgress size={18} />}
          <Box sx={{ flex: 1 }} />
          {!embedded && (
            <Button size="small" onClick={() => setSickOpen(true)} sx={{ textTransform: "none" }}>Sodros ataskaitos (S15, S47)</Button>
          )}
          {run && step === 0 && (
            <HeaderActions run={run} rows={results} ready={ready} year={year} month={month} onDone={loadAll} setError={setError}
              onNotes={setApproveNotes} onNext={() => setStep(1)} />
          )}
          {run && step === 1 && (() => {
            const n = (payItems || []).filter((i) => i.status !== "paid").length;
            return (
              <Stack direction="row" alignItems="center" gap={1.25}>
                {n > 0 && (
                  <Typography sx={{ fontSize: 12.5, color: "#667085", maxWidth: 330, textAlign: "right", lineHeight: 1.35 }}>
                    Nepažymėta sumokėtais: {n}. GPM313 reikia išmokėjimo datos.
                  </Typography>
                )}
                <Button variant="contained" disableElevation endIcon={<ArrowForwardRoundedIcon />}
                  onClick={() => navigate(`/deklaravimas?m=${ym(year, month)}`)}
                  sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, px: 2.25 }}>Toliau – deklaravimas</Button>
              </Stack>
            );
          })()}
        </Stack>
      )}
      {approveNotes.map((n, i) => (
        <Alert key={i} severity="warning" sx={{ mb: 1.5 }} onClose={() => setApproveNotes(approveNotes.filter((_, j) => j !== i))}>{n}</Alert>
      ))}
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={2} mb={2}
        sx={{ display: mode === "payroll" ? "none" : "flex" }}>
        {!embedded ? (
          <Box>
            <Typography variant="h5" fontWeight={700}>Atlyginimai</Typography>
            <Typography variant="body2" color="text.secondary">Trys žingsniai: patikrinti darbo laiką, peržiūrėti atlyginimus ir patvirtinti.</Typography>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 560 }}>
            {mode === "timesheet"
              ? "Darbo laikas užpildomas pagal grafiką ir šventes. Pažymėkite tik tai, kas buvo kitaip."
              : <>Darbo laikas tikrinamas skiltyje <Box component="span" onClick={() => navigate("/grafikai-ir-tabeliai/tabelis")}
                  sx={{ color: "primary.main", cursor: "pointer", fontWeight: 600, "&:hover": { textDecoration: "underline" } }}>Grafikai ir tabeliai → Tabelis</Box>.</>}
          </Typography>
        )}
        <Stack direction="row" alignItems="center" gap={1}>
          {mode !== "timesheet" && !embedded && (
            <Button size="small" onClick={() => setSickOpen(true)} sx={{ mr: 1, textTransform: "none" }}>Sodros ataskaitos (S15, S47)</Button>
          )}
          <SodraReportsDialog open={sickOpen} onClose={() => setSickOpen(false)} onDone={loadAll} />
          <IconButton onClick={() => shiftMonth(-1)} aria-label="Ankstesnis mėnuo"><ChevronLeftIcon /></IconButton>
          <Typography fontWeight={700} sx={{ minWidth: 150, textAlign: "center" }}>{year} m. {MONTHS[month - 1].toLowerCase()}</Typography>
          <IconButton onClick={() => shiftMonth(1)} aria-label="Kitas mėnuo"><ChevronRightIcon /></IconButton>
          {run && <Chip size="small" sx={{ ml: 1 }} color={locked ? "success" : "default"} label={locked ? "Patvirtinta" : "Juodraštis"} />}
          {busy && <CircularProgress size={18} sx={{ ml: 1 }} />}
        </Stack>
      </Stack>

      {mode === "payroll" && run && (
        <PayFlow ready={ready} run={run} step={step} setStep={setStep} year={year} month={month} navigate={navigate} />
      )}
      {mode !== "payroll" && STEPS.length > 1 && (
        <Stepper nonLinear activeStep={step} sx={{ mb: 3 }}>
          {STEPS.map((l, i) => (
            <Step key={l} completed={locked && i < (mode === "payroll" ? 2 : 2)}><StepButton onClick={() => setStep(i)}>{l}</StepButton></Step>
          ))}
        </Stepper>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {mode !== "timesheet" && run && ready && (
        <FlowBar ready={ready} run={run} year={year} month={month} navigate={navigate} onReload={loadAll} setError={setError}
          showSteps={mode !== "payroll"} />
      )}
      {importantWarnings(run?.warnings).length > 0 && step < 1 + (mode === "payroll" ? 0 : 1) && <Warnings items={importantWarnings(run.warnings)} />}
      {mode !== "timesheet" && run && <TripPeriodBlock year={year} month={month} locked={locked} onChanged={recalc} />}

      {loading ? (
        <Box sx={{ py: 8, textAlign: "center" }}><CircularProgress /></Box>
      ) : timesheet.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: "center" }}>
          <Typography fontWeight={600}>Šį mėnesį darbuotojų nėra</Typography>
          <Typography variant="body2" color="text.secondary">Pirmiausia pridėkite darbuotojus ir jų darbo sutartis skiltyje „Darbuotojai“.</Typography>
        </Paper>
      ) : (
        <>
          {mode === "timesheet" && <TimesheetStep rows={timesheet} year={year} month={month} locked={locked} onChanged={recalc}
            onNext={() => navigate("/darbo-uzmokestis/atlyginimai")} />}
          {mode === "payroll" && ready && !ready.timesheet.approved_once && run?.status === "draft" && step < 1 && (
            <WaitCard ready={ready} />
          )}
          {mode === "payroll" && (!ready || ready.timesheet.approved_once || run?.status !== "draft" || step === 1) && <>
            {step === 0 && <ResultsStep run={run} rows={results} locked={locked} onChanged={recalc}
              changed={new Set((ready?.timesheet.changes || []).map((c) => c.employee))}
              regimes={Object.fromEntries((timesheet || []).map((t) => [t.employee, !!t.summed]))} />}
            {step === 1 && <IsmokejimaiPage embedded year={year} month={month} onLoaded={setPayItems} />}
          </>}
          {mode === "full" && <>
            {step === 0 && <TimesheetStep rows={timesheet} year={year} month={month} locked={locked} onChanged={recalc} onNext={() => setStep(1)} />}
            {step === 1 && <ResultsStep run={run} rows={results} locked={locked} onChanged={recalc}
              footer={<Box><Button variant="contained" onClick={() => setStep(2)}>Toliau</Button></Box>} />}
            {step === 2 && <ApproveStep run={run} rows={results} ready={ready} onDone={loadAll} setError={setError} />}
          </>}
        </>
      )}
    </Box>
  );
}

// ============================================================
// Eiga: grafikas (suminei) -> tabelis -> atlyginimai -> patvirtinimas
// ============================================================
const ym = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
const fmtD = (iso) => (iso ? `${iso.slice(5, 7)}-${iso.slice(8, 10)}` : "");
const namesOf = (list, n = 3) => list.slice(0, n).join(", ") + (list.length > n ? ` ir dar ${list.length - n}` : "");

function FlowStep({ n, label, state, sub }) {
  const c = { done: "#12B76A", warn: "#F79009", todo: "#98A2B3", block: "#F04438" }[state];
  const Icon = state === "done" ? CheckCircleRoundedIcon : state === "todo" ? RadioButtonUncheckedRoundedIcon : ErrorOutlineRoundedIcon;
  return (
    <Stack direction="row" gap={1} alignItems="center" sx={{ minWidth: 0 }}>
      <Icon sx={{ fontSize: 20, color: c, flexShrink: 0 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#101828", lineHeight: 1.25 }}>{n}. {label}</Typography>
        <Typography noWrap sx={{ fontSize: 12, color: state === "done" || state === "todo" ? "#667085" : c }}>{sub}</Typography>
      </Box>
    </Stack>
  );
}

function FlowBar({ ready, run, year, month, navigate, onReload, setError, showSteps = true }) {
  const [busy, setBusy] = useState(false);
  const ts = ready.timesheet;
  const missing = ready.roster.missing || [];
  const changes = ts.changes || [];
  const approved = ["approved", "locked"].includes(ts.status);
  const runDone = run.status !== "draft";
  const toTimesheet = () => navigate(`/grafikai-ir-tabeliai/tabelis?m=${ym(year, month)}`);
  const toRoster = () => navigate(`/grafikai-ir-tabeliai?m=${ym(year, month)}`);

  // patvirtinti tabelio pakeitimus čia pat (pažeidimų atveju - į tabelį, ten reikia paaiškinimo)
  const approveChanges = async () => {
    setBusy(true);
    try { await payrollApi.setTimesheetHours({ action: "approve", year, month }); await onReload(); }
    catch (e) {
      if (e?.response?.status === 409) toTimesheet();
      else setError(apiError(e));
    } finally { setBusy(false); }
  };

  const steps = [];
  if (ready.roster.needed) {
    steps.push(<FlowStep key="r" n={steps.length + 1} label="Grafikas"
      state={missing.length ? "block" : ready.roster.stale ? "warn" : "done"}
      sub={missing.length ? `Nepaskelbtas: ${missing.length} darb.` : ready.roster.stale ? "Paskelbtas, bet nebeatitinka" : "Paskelbtas"} />);
  }
  steps.push(<FlowStep key="t" n={steps.length + 1} label="Tabelis"
    state={!ts.approved_once ? "todo" : changes.length ? "warn" : approved ? "done" : "warn"}
    sub={!ts.approved_once ? "Nepatvirtintas" : changes.length ? `Pakeista po patvirtinimo: ${changes.length} darb.`
      : approved ? `Patvirtintas ${fmtD(ts.approved_at?.slice(0, 10))}` : "Atidarytas taisymui"} />);
  steps.push(<FlowStep key="a" n={steps.length + 1} label="Atlyginimai"
    state={!ts.approved_once ? "todo" : changes.length ? "warn" : "done"}
    sub={runDone ? "Patvirtinti" : !ts.approved_once ? "Laukia tabelio" : changes.length ? "Pagal ankstesnį tabelį" : "Apskaičiuoti pagal tabelį"} />);

  return (
    <Box sx={{ mb: .5 }}>
      {showSteps && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: `repeat(${steps.length}, minmax(0,1fr))` }, gap: 2,
          p: 1.75, border: "1px solid #EAECF0", borderRadius: 2.5, bgcolor: "#FFFFFF", mb: 1.5 }}>
          {steps}
        </Box>
      )}

      {!runDone && missing.length > 0 && (
        <Alert severity="warning" sx={{ mb: 1.5 }} action={<Button size="small" color="inherit" onClick={toRoster}>Į grafiką</Button>}>
          Nepaskelbtas darbo grafikas suminės apskaitos darbuotojams: {namesOf(missing)}. Be grafiko neaišku, kiek valandų jie dirbo,
          todėl tabelio patvirtinti negalima.
        </Alert>
      )}
      {!runDone && !ts.approved_once && !missing.length && (
        <Alert severity="info" sx={{ mb: 1.5 }} action={<Button size="small" color="inherit" onClick={toTimesheet}>Į tabelį</Button>}>
          {ts.too_early
            ? `Mėnuo dar nesibaigė – tabelį patvirtinti ir atlyginimus apskaičiuoti bus galima nuo ${ts.approve_from}. Iki tol darbo laikas dar gali keistis.`
            : "Atlyginimai apskaičiuojami tik pagal patvirtintą tabelį – taip jie visada atitinka faktiškai dirbtą laiką."}
        </Alert>
      )}
      {!runDone && changes.length > 0 && (
        <Alert severity="warning" sx={{ mb: 1.5 }}
          action={(
            <Stack direction="row" gap={.5}>
              <Button size="small" color="inherit" onClick={toTimesheet}>Peržiūrėti</Button>
              <Button size="small" color="inherit" variant="outlined" disabled={busy} onClick={approveChanges}>Patvirtinti pakeitimus</Button>
            </Stack>
          )}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Po tabelio patvirtinimo darbo laikas pasikeitė</Typography>
          {changes.slice(0, 4).map((c) => (
            <Typography key={c.employee} sx={{ fontSize: 13 }}>
              {c.name}{c.kind === "added" ? " – naujas darbuotojas" : c.kind === "removed" ? " – nebėra tabelyje"
                : `: ${c.dates.slice(0, 4).map(fmtD).join(", ")}${c.dates.length > 4 ? ` ir dar ${c.dates.length - 4} d.` : ""}`}
            </Typography>
          ))}
          {changes.length > 4 && <Typography sx={{ fontSize: 13 }}>…ir dar {changes.length - 4} darbuotojai</Typography>}
          <Typography sx={{ fontSize: 12.5, mt: .5 }}>
            Atlyginimai rodomi pagal anksčiau patvirtintą tabelį. Patvirtinus pakeitimus – bus perskaičiuoti.
          </Typography>
        </Alert>
      )}
      {!runDone && ts.approved_once && !changes.length && !approved && (
        <Alert severity="info" sx={{ mb: 1.5 }} action={<Button size="small" color="inherit" onClick={toTimesheet}>Į tabelį</Button>}>
          Tabelis atidarytas taisymui. Pataisę patvirtinkite jį iš naujo – tada bus galima tvirtinti atlyginimus.
        </Alert>
      )}
    </Box>
  );
}

// Žingsnio „Atlyginimai ir mokesčiai“ veiksmai antraštėje (dešinėje): Patvirtinti / Atrakinti ir taisyti + Toliau
function HeaderActions({ run, rows, ready, year, month, onDone, setError, onNotes, onNext }) {
  const [busy, setBusy] = useState(false);
  const [adv, setAdv] = useState(null);           // nepažymėti avansai -> sprendimas prieš tvirtinant
  const [unlockAsk, setUnlockAsk] = useState(false);
  const locked = run.status !== "draft";
  const can = ready ? ready.can_approve : ["approved", "locked"].includes(run.timesheet_status);
  const why = locked ? "" : !rows.length ? "nėra apskaičiuotų atlyginimų" : !can ? (ready?.blockers?.[0] || "pirmiausia patvirtinkite mėnesio tabelį") : "";

  const approve = async (decisions) => {
    setBusy(true); setError("");
    try {
      const r = await payrollApi.approveRun(run.id, decisions);
      setAdv(null);
      onNotes?.(r.warnings || []);
      await onDone();
      if (!(r.warnings || []).length) onNext?.();
    } catch (e) {
      if (e?.response?.status === 409 && e.response.data?.advances) {
        setAdv(e.response.data.advances.map((a) => ({ ...a, action: "paid", date: a.due_date || "" })));
      } else setError(apiError(e));
    } finally { setBusy(false); }
  };
  // atlyginimai + tabelis atrakinami kartu (pirmiausia DU - kitaip tabelio atidaryti negalima)
  const unlockAll = async () => {
    setUnlockAsk(false); setBusy(true);
    try {
      await payrollApi.reopenRun(run.id);
      try { await payrollApi.setTimesheetHours({ action: "reopen", year, month }); } catch { /* tabelis gal jau atidarytas */ }
      await onDone();
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Stack direction="row" alignItems="center" gap={1.25}>
      {why && (
        <Typography sx={{ fontSize: 12.5, color: "#B54708", maxWidth: 360, textAlign: "right", lineHeight: 1.35 }}>Kol kas negalima: {why}</Typography>
      )}
      {locked ? (
        <>
          <Button variant="outlined" startIcon={<LockOpenOutlinedIcon />} disabled={busy} onClick={() => setUnlockAsk(true)}
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, color: "#344054", borderColor: "#D0D5DD", bgcolor: "#FFFFFF" }}>
            Atrakinti ir taisyti
          </Button>
          <Button variant="contained" disableElevation endIcon={<ArrowForwardRoundedIcon />} onClick={onNext}
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, px: 2.25 }}>Toliau</Button>
        </>
      ) : (
        <Button variant="contained" disableElevation disabled={busy || !!why} onClick={() => approve()}
          sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, px: 2.25 }}>Patvirtinti atlyginimus</Button>
      )}

      <Dialog open={unlockAsk} onClose={() => setUnlockAsk(false)} maxWidth="xs" fullWidth disableScrollLock>
        <DialogTitle sx={{ fontSize: 17, fontWeight: 600 }}>Atrakinti ir taisyti?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5, color: "#475467" }}>Bus atrakinti:</Typography>
          <Typography sx={{ fontSize: 13.5, color: "#475467", mt: .5 }}>• <b style={{ fontWeight: 600 }}>tabelis</b> – galėsite taisyti darbo laiką;</Typography>
          <Typography sx={{ fontSize: 13.5, color: "#475467" }}>• <b style={{ fontWeight: 600 }}>atlyginimų paskaičiavimai</b> – DK įrašas bus panaikintas.</Typography>
          <Typography sx={{ fontSize: 13, color: "#667085", mt: 1.5 }}>
            Pataisę patvirtinkite tabelį ir atlyginimus iš naujo. Jei deklaracijos jau pateiktos – jas reikės patikslinti.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setUnlockAsk(false)} sx={{ textTransform: "none", color: "#344054" }}>Atšaukti</Button>
          <Button variant="contained" disableElevation onClick={unlockAll} sx={{ textTransform: "none", fontWeight: 600 }}>Atrakinti</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!adv} onClose={() => setAdv(null)} fullWidth maxWidth="sm" disableScrollLock>
        <DialogTitle sx={{ fontSize: 17, fontWeight: 600 }}>Avansai nepažymėti kaip sumokėti</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5, color: "#475467", mb: 2 }}>
            Iš atlyginimo išskaičiuojamas tik faktiškai sumokėtas avansas. Jei avansas sumokėtas, bet banko išrašas dar neįkeltas – pažymėkite jį sumokėtu.
          </Typography>
          <Stack gap={1.5}>
            {(adv || []).map((a, i) => (
              <Box key={a.id} sx={{ ...CARD, p: 1.5 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{a.employee} · {money(a.open)}{Number(a.paid) > 0 ? ` (jau sumokėta ${money(a.paid)})` : ""}</Typography>
                <RadioGroup value={a.action} onChange={(e) => setAdv(adv.map((x, j) => (j === i ? { ...x, action: e.target.value } : x)))}>
                  <FormControlLabel value="paid" control={<Radio size="small" />} label="Sumokėtas – išskaičiuoti iš atlyginimo" />
                  <FormControlLabel value="unpaid" control={<Radio size="small" />} label="Nesumokėtas – visa suma bus išmokėta su atlyginimu" />
                </RadioGroup>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAdv(null)} sx={{ textTransform: "none", color: "#344054" }}>Atšaukti</Button>
          <Button variant="contained" disableElevation disabled={busy} sx={{ textTransform: "none", fontWeight: 600 }}
            onClick={() => approve(Object.fromEntries(adv.map((a) => [a.id, { action: a.action, date: a.date || new Date().toISOString().slice(0, 10) }])))}>
            Patvirtinti atlyginimus
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function WaitCard({ ready }) {
  return (
    <Paper variant="outlined" sx={{ p: 5, textAlign: "center", borderRadius: 2.5, borderColor: "#EAECF0" }}>
      <Typography sx={{ fontSize: 16, fontWeight: 600, color: "#101828" }}>Atlyginimai dar neapskaičiuoti</Typography>
      <Typography sx={{ fontSize: 13.5, color: "#667085", mt: .75, maxWidth: 520, mx: "auto" }}>
        {ready.roster.missing?.length
          ? "Pirmiausia paskelbkite darbo grafiką, tada patvirtinkite tabelį – atlyginimai bus apskaičiuoti automatiškai."
          : ready.timesheet.too_early
            ? `Mėnuo dar nesibaigė. Tabelį patvirtinti bus galima nuo ${ready.timesheet.approve_from} – tada atlyginimai bus apskaičiuoti automatiškai.`
            : "Patvirtinkite mėnesio tabelį – atlyginimai bus apskaičiuoti automatiškai. Premijas ir išskaitas galėsite pridėti po to."}
      </Typography>
    </Paper>
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

      <Box><Button variant="contained" onClick={onNext}>Darbo laikas teisingas – skaičiuoti atlyginimus</Button></Box>

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
            {row.pay_form === "monthly" && !row.summed && (
              <Typography variant="caption" color="text.secondary">
                Mėnesinė alga nuo valandų skaičiaus nepriklauso. Jei darbuotojas dirbo mažiau – pažymėkite priežastį
                („Nedirbo“: pravaikšta, prastova, nemokamos atostogos…).
              </Typography>
            )}
            {row.summed && (
              <Typography variant="caption" color="text.secondary">Suminė apskaita: valandos imamos iš paskelbto darbo grafiko.</Typography>
            )}
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

const n2 = (v) => Number(v || 0);
const HOUR_CODES = ["ALG", "VAL", "VRS", "NAK", "POI", "SVN", "SVP", "VRP", "VRN", "VRF", "SAV", "SAN"];
const NON_TAXED = ["DPN", "AUK", "NUO", "PSM", "PSK"];
const CARD = { border: "1px solid #EAECF0", borderRadius: 2.5, bgcolor: "#FFFFFF" };

// Techninės pastabos - ne į bendrą „Atkreipkite dėmesį“, o tik į darbuotojo detales (žmonių kalba)
const NOTE_RULES = [
  [/Nėra dirbtų dienų per 3 mėn/i, "Vidutinis uždarbis (VDU) dar skaičiuojamas pagal sutartinę algą – nėra 3 mėn. istorijos. Jis naudojamas tik atostoginiams ir ligos išmokai."],
  [/apvalinimo korekcija/i, null],                       // Sodros apvalinimas - nerodoma
];
const noteKind = (w) => NOTE_RULES.find(([re]) => re.test(w));
const importantWarnings = (list) => (list || []).filter((w) => !noteKind(w));
const humanNotes = (list) => [...new Set((list || []).map((w) => noteKind(w)?.[1]).filter(Boolean))];

function PayFlow({ ready, run, step, setStep, year, month, navigate }) {
  const ts = ready?.timesheet;
  const changes = ts?.changes || [];
  const missing = ready?.roster?.missing || [];
  const approvedRun = run.status !== "draft";
  const tsApproved = ts && ["approved", "locked"].includes(ts.status);
  const ext = (path) => () => navigate(`${path}?m=${ym(year, month)}`);
  const items = [];
  if (ready?.roster?.needed) {
    items.push({ key: "r", label: "Grafikas", go: ext("/grafikai-ir-tabeliai"), external: true,
      state: missing.length ? "block" : ready.roster.stale ? "warn" : "done",
      sub: missing.length ? "Nepaskelbtas" : ready.roster.stale ? "Nebeatitinka" : "Paskelbtas",
      tip: `Rodoma, nes ${ready.summed} darb. dirba pagal suminę apskaitą` });
  }
  items.push({ key: "t", label: "Tabelis", go: ext("/grafikai-ir-tabeliai/tabelis"), external: true,
    state: !ts ? "todo" : !ts.approved_once ? "todo" : changes.length ? "warn" : tsApproved ? "done" : "warn",
    sub: !ts ? "" : !ts.approved_once ? (ts.too_early ? `Tvirtinti nuo ${fmtD(ts.approve_from)}` : "Nepatvirtintas") : changes.length ? `Pakeista: ${changes.length} darb.` : tsApproved ? "Patvirtintas" : "Taisomas" });
  items.push({ key: 0, label: "Atlyginimai ir mokesčiai", go: () => setStep(0),
    state: approvedRun ? "done" : !ts?.approved_once ? "todo" : changes.length ? "warn" : "todo",
    sub: approvedRun ? "Patvirtinti" : !ts?.approved_once ? "Laukia tabelio" : changes.length ? "Pagal ankstesnį tabelį" : "Apskaičiuoti – laukia patvirtinimo" });
  items.push({ key: 1, label: "Išmokėjimai", go: () => setStep(1), state: "todo", sub: approvedRun ? "Bankas, VMI, Sodra" : "Po patvirtinimo" });
  items.push({ key: "d", label: "Deklaravimas", go: ext("/deklaravimas"), external: true, state: "todo",
    sub: approvedRun ? "SAM, GPM313, SDUP" : "Po patvirtinimo", tip: "SAM, GPM313 ir SDUP paruošiami iš patvirtintų atlyginimų" });

  const C = { done: "#12B76A", warn: "#F79009", todo: "#D0D5DD", block: "#F04438" };
  return (
    <Box sx={{ ...CARD, p: .75, mb: 2, display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: `repeat(${items.length}, minmax(0,1fr))` }, gap: .5 }}>
      {items.map((it, i) => {
        const active = !it.external && it.key === step;
        const Icon = it.state === "done" ? CheckCircleRoundedIcon : it.state === "todo" ? RadioButtonUncheckedRoundedIcon : ErrorOutlineRoundedIcon;
        return (
          <Tooltip key={it.key} title={it.tip || (it.external ? "Atidaryti skiltyje „Grafikai ir tabeliai“" : "")} arrow>
            <Box onClick={it.go} sx={{
              px: 1.5, py: 1.1, borderRadius: 2, cursor: "pointer", display: "flex", alignItems: "center", gap: 1.1, minWidth: 0,
              bgcolor: active ? "#EFF8FF" : "transparent", outline: active ? "1.5px solid #84CAFF" : "none",
              "&:hover": { bgcolor: active ? "#EFF8FF" : "#F9FAFB" },
            }}>
              <Icon sx={{ fontSize: 20, color: C[it.state], flexShrink: 0 }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: active ? "#175CD3" : "#101828", lineHeight: 1.25 }}>
                  <span style={{ color: "#98A2B3", fontWeight: 500 }}>{i + 1}.</span> {it.label}{it.external ? " ↗" : ""}
                </Typography>
                <Typography noWrap sx={{ fontSize: 12, color: it.state === "warn" ? "#B54708" : it.state === "block" ? "#B42318" : "#667085" }}>{it.sub}</Typography>
              </Box>
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}

function SumTile({ label, value, sub, strong }) {
  return (
    <Box sx={{ ...CARD, p: 2, ...(strong ? { bgcolor: "#F5F8FF", borderColor: "#D1E0FF" } : {}) }}>
      <Typography sx={{ fontSize: 12.5, color: "#667085" }}>{label}</Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 600, color: strong ? "#1849A9" : "#101828", mt: .25 }}>{money(value)}</Typography>
      {[].concat(sub || []).filter(Boolean).map((x, i) => (
        <Typography key={i} sx={{ fontSize: 12, color: "#98A2B3", mt: i ? 0 : .25, lineHeight: 1.5 }}>{x}</Typography>
      ))}
    </Box>
  );
}

// ---------- kas šį mėnesį buvo ypatinga (ikonėlės eilutėje) ----------
const TAX_RE = /gpm|pajamų mokest|vsd|psd|sveikatos draud|socialinio draud|pensij|kaupim/i;
const isTaxLine = (l) => TAX_RE.test(`${l.code} ${l.code_name}`);
const isAdvanceLine = (l) => l.code === "AVN" || /avans/i.test(l.code_name || "");
const isGarnish = (l) => /antstol|alimen|išlaikym|žala sveikatai/i.test(l.code_name || "") || ["ANT", "ALI"].includes(l.code);
const qty = (ls) => ls.reduce((a, l) => a + n2(l.quantity), 0);
const amt = (ls) => ls.reduce((a, l) => a + n2(l.amount), 0);
const num = (v) => Number(v || 0).toLocaleString("lt-LT", { maximumFractionDigits: 2 });

const BADGES = [
  // [raktas, ikona, spalva, eilučių filtras, tekstas]
  ["trip", FlightTakeoffRoundedIcon, "#6366F1", (l) => ["DPN", "DPA"].includes(l.code), (ls) => `Komandiruotė – dienpinigiai ${money(amt(ls))}`],
  ["vac", BeachAccessOutlinedIcon, "#0EA5E9", (l) => l.code === "ATO", (ls) => `Atostogos – ${num(qty(ls))} d., atostoginiai ${money(amt(ls))}`],
  ["sick", SickOutlinedIcon, "#F04438", (l) => l.code === "LIG", (ls) => `Liga – darbdavio apmokamos dienos ${num(qty(ls))}, ${money(amt(ls))}`],
  ["mam", ChildCareOutlinedIcon, "#EC4899", (l) => l.code === "MAM", (ls) => `Mamadieniai / tėvadieniai – ${num(qty(ls))} d.`],
  ["study", SchoolOutlinedIcon, "#0E9384", (l) => ["MOK", "PRS", "VPR", "BUD"].includes(l.code), (ls) => ls.map((l) => l.code_name).join(", ")],
  ["extra", MoreTimeRoundedIcon, "#F79009", (l) => ["VRS", "NAK", "POI", "SVN", "VRP", "VRN", "VRF", "SAV", "SAN", "SVP"].includes(l.code),
    (ls) => `Papildomos valandos: ${ls.map((l) => `${l.code_name.toLowerCase()} ${num(l.quantity)} val.`).join(", ")}`],
  ["bonus", EmojiEventsOutlinedIcon, "#CA8504", (l) => ["PRV", "PRM", "PRK", "PRT"].includes(l.code), (ls) => `Premija – ${money(amt(ls))}`],
  ["recur", AutorenewRoundedIcon, "#7A5AF8", (l) => l.code === "PRD" || (!l.is_manual && l.category === "earning" && /priedas|priemoka/i.test(l.code_name) && !["PRV"].includes(l.code)),
    (ls) => `Nuolatinis priedas – ${money(amt(ls))}`],
  ["gift", CardGiftcardOutlinedIcon, "#0BA5EC", (l) => ["DOV", "SVD", "NAT", "AUK", "NUO", "PSM", "PSK"].includes(l.code), (ls) => ls.map((l) => `${l.code_name} ${money(l.amount)}`).join(", ")],
  ["leave", LogoutRoundedIcon, "#475467", (l) => ["KMP", "ISE"].includes(l.code), (ls) => `Atleidimas: ${ls.map((l) => `${l.code_name.toLowerCase()} ${money(l.amount)}`).join(", ")}`],
  ["garn", GavelRoundedIcon, "#B42318", (l) => l.category === "deduction" && isGarnish(l), (ls) => `Antstolis / alimentai – išskaičiuota ${money(amt(ls))}`],
  ["ded", RemoveCircleOutlineRoundedIcon, "#667085", (l) => l.category === "deduction" && !isTaxLine(l) && !isAdvanceLine(l) && !isGarnish(l),
    (ls) => `Išskaitos: ${ls.map((l) => `${l.code_name} ${money(l.amount)}`).join(", ")}`],
];

function badgesFor(r, lines, changed) {
  const out = [];
  BADGES.forEach(([key, Icon, color, f, text]) => {
    const ls = lines.filter(f);
    if (ls.length) out.push({ key, Icon, color, text: text(ls) });
  });
  if (n2(r.advance_paid) > 0) out.push({ key: "adv", Icon: PaymentsOutlinedIcon, color: "#12B76A", text: `Jau išmokėtas avansas ${money(r.advance_paid)}` });
  const w = r.work || {};
  if (w.scheduled_days && w.worked_days != null && w.worked_days < w.scheduled_days && !out.some((b) => ["vac", "sick", "mam", "trip"].includes(b.key))) {
    out.push({ key: "part", Icon: EventBusyOutlinedIcon, color: "#98A2B3", text: `Dirbo ${w.worked_days} iš ${w.scheduled_days} darbo d. (pradėjo / baigė mėnesio viduryje arba nemokamos atostogos)` });
  }
  if (changed) out.push({ key: "ts", Icon: EditCalendarOutlinedIcon, color: "#F79009", text: "Tabelis pakeistas po patvirtinimo – atlyginimas dar pagal seną versiją" });
  const warn = importantWarnings(r.warnings);
  if (warn.length) out.push({ key: "warn", Icon: ErrorOutlineRoundedIcon, color: "#D92D20", text: warn.join(" · ") });
  return out;
}

function Badges({ items }) {
  return (
    <Stack direction="row" gap={.5} flexWrap="wrap">
      {items.map(({ key, Icon, color, text }) => (
        <Tooltip key={key} arrow title={text}>
          <Box sx={{ width: 24, height: 24, borderRadius: 1.25, display: "grid", placeItems: "center", bgcolor: `${color}14`, color }}>
            <Icon sx={{ fontSize: 15 }} />
          </Box>
        </Tooltip>
      ))}
    </Stack>
  );
}

const COLS = "minmax(240px,1.8fr) repeat(4, minmax(105px,1fr)) 32px";
const employerOf = (r) => n2(r.employer_vsd) + n2(r.gar) + n2(r.ilg) + n2(r.grindys_vsd) + n2(r.grindys_psd);
const sodraOf = (r) => n2(r.vsd) + n2(r.psd) + n2(r.kaupimas);
const gpmOf = (r) => n2(r.gpm) + n2(r.gpm15);

const SHOW = [
  ["", "Visi darbuotojai"],
  ["absence", "Su atostogomis, liga ar mamadieniais"],
  ["trip", "Su komandiruotėmis"],
  ["extra", "Su viršvalandžiais, naktimis, šventėmis"],
  ["bonus", "Su premijomis ar priedais"],
  ["ded", "Su išskaitomis (antstoliai ir kt.)"],
  ["adv", "Su avansu"],
  ["warn", "Su pastabomis"],
];
const SHOW_KEYS = { absence: ["vac", "sick", "mam", "study"], trip: ["trip"], extra: ["extra"], bonus: ["bonus", "recur", "gift"],
  ded: ["garn", "ded"], adv: ["adv"], warn: ["warn", "ts"] };

function RegimeChip({ summed }) {
  return (
    <Chip size="small" label={summed ? "Suminė" : "Standartinė"} sx={{
      height: 20, fontSize: 11, fontWeight: 500, flexShrink: 0,
      bgcolor: summed ? "#E0F2FE" : "#F2F4F7", color: summed ? "#075985" : "#475467",
    }} />
  );
}

function ResultsStep({ run, rows, locked, onChanged, footer, changed = new Set(), regimes = {} }) {
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState("");
  const [reg, setReg] = useState("");
  const [show, setShow] = useState("");
  const [addFor, setAddFor] = useState(null); // {employee, kind}
  const [codes, setCodes] = useState([]);
  const [allLines, setAllLines] = useState([]);
  useEffect(() => { payrollApi.payCodes().then(setCodes).catch(() => {}); }, []);
  const linesKey = rows.map((r) => r.id).join(",");
  useEffect(() => { payrollApi.runLines(run.id).then((ls) => setAllLines(ls || [])).catch(() => setAllLines([])); }, [run.id, linesKey]);
  const linesOf = (emp) => allLines.filter((l) => l.employee === emp);

  const withBadges = rows.map((r) => ({ r, lines: linesOf(r.employee), badges: badgesFor(r, linesOf(r.employee), changed.has(r.employee)) }));
  const hasSummed = rows.some((r) => regimes[r.employee] === true);
  const hasStd = rows.some((r) => regimes[r.employee] === false);
  const qq = q.trim().toLowerCase();
  const shown = withBadges.filter(({ r, badges }) => (!qq || (r.employee_name || "").toLowerCase().includes(qq))
    && (!reg || (reg === "summed") === !!regimes[r.employee])
    && (!show || badges.some((b) => SHOW_KEYS[show].includes(b.key))));
  const sRows = shown.map((x) => x.r);
  const filtered = shown.length !== rows.length;

  const tGross = sum(rows, "gross");
  const tGpm = sum(rows, gpmOf);
  const tSodra = sum(rows, sodraOf);
  const tNet = sum(rows, "net");
  const tAdv = sum(rows, "advance_paid");
  const tPay = sum(rows, "payable");
  const tEmployer = sum(rows, employerOf);

  return (
    <Stack gap={2}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, minmax(0,1fr))" }, gap: 1.5 }}>
        <SumTile label="Priskaičiuota (bruto)" value={tGross} sub={`${rows.length} darbuotojai`} />
        <SumTile label="Mokesčiai" value={tGpm + tSodra} sub={[`GPM ${money(tGpm)}`, `Sodra ${money(tSodra)}`, "Išskaičiuojama iš algų"]} />
        <SumTile label="Išmokėti darbuotojams (neto)" value={tNet} strong
          sub={tAdv > 0 ? [`Avansu jau išmokėta ${money(tAdv)}`, `Liko išmokėti ${money(tPay)}`] : ["Į darbuotojų banko sąskaitas"]} />
        <SumTile label="Darbdavio mokesčiai" value={tEmployer} sub={["Moka įmonė papildomai", `Įmonei kainuoja ${money(tGross + tEmployer)}`]} />
      </Box>

      <Stack direction={{ xs: "column", md: "row" }} gap={1.25} alignItems={{ md: "center" }}>
        <TextField size="small" placeholder="Ieškoti darbuotojo" value={q} onChange={(e) => setQ(e.target.value)}
          sx={{ width: { md: 280 }, bgcolor: "#FFFFFF" }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 19, color: "#98A2B3" }} /></InputAdornment> }} />
        {hasSummed && hasStd && (
          <TextField select size="small" value={reg} onChange={(e) => setReg(e.target.value)} sx={{ width: { md: 200 }, bgcolor: "#FFFFFF" }}
            SelectProps={{ MenuProps: MENU_PROPS, displayEmpty: true }}>
            <MenuItem value="">Visos apskaitos</MenuItem>
            <MenuItem value="standard">Standartinė</MenuItem>
            <MenuItem value="summed">Suminė</MenuItem>
          </TextField>
        )}
        <TextField select size="small" value={show} onChange={(e) => setShow(e.target.value)} sx={{ width: { md: 300 }, bgcolor: "#FFFFFF" }}
          SelectProps={{ MenuProps: MENU_PROPS, displayEmpty: true }}>
          {SHOW.map(([v, l]) => {
            const n = v ? withBadges.filter(({ badges }) => badges.some((b) => SHOW_KEYS[v].includes(b.key))).length : rows.length;
            return <MenuItem key={v} value={v} disabled={!!v && !n}>{l} ({n})</MenuItem>;
          })}
        </TextField>
        {filtered && (
          <Button size="small" onClick={() => { setQ(""); setReg(""); setShow(""); }} sx={{ textTransform: "none", color: "#475467" }}>
            Rodyti visus
          </Button>
        )}
      </Stack>

      <Box sx={{ ...CARD, overflow: "hidden" }}>
        <Box sx={{ display: "grid", gridTemplateColumns: COLS, px: 2, py: 1.1, bgcolor: "#F9FAFB", borderBottom: "1px solid #EAECF0", typography: "body2",
          "& > *": { fontSize: 12, color: "#667085", fontWeight: 500 } }}>
          <Box>Darbuotojas</Box>
          <Box sx={{ textAlign: "right" }}>Priskaičiuota</Box>
          <Box sx={{ textAlign: "right" }}>GPM</Box>
          <Box sx={{ textAlign: "right" }}>Sodra</Box>
          <Box sx={{ textAlign: "right" }}>Išmokėti</Box>
          <Box />
        </Box>
        {shown.length === 0 && (
          <Typography sx={{ px: 2, py: 3, fontSize: 13.5, color: "#98A2B3", textAlign: "center" }}>Pagal pasirinktus filtrus darbuotojų nėra</Typography>
        )}
        {shown.map(({ r, lines, badges }) => {
          const isOpen = open === r.employee;
          return (
            <Box key={r.id} sx={{ borderBottom: "1px solid #F2F4F7" }}>
              <Box onClick={() => setOpen(isOpen ? null : r.employee)} sx={{
                display: "grid", gridTemplateColumns: COLS, alignItems: "center", px: 2, py: 1.1, cursor: "pointer", minHeight: 56,
                bgcolor: isOpen ? "#F9FAFB" : "#FFFFFF", "&:hover": { bgcolor: "#F9FAFB" },
              }}>
                <Stack direction="row" alignItems="center" gap={1.25} sx={{ minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 14, fontWeight: 500, color: "#101828", minWidth: 0 }}>{r.employee_name}</Typography>
                  {regimes[r.employee] !== undefined && <RegimeChip summed={regimes[r.employee]} />}
                  <Badges items={badges} />
                </Stack>
                <Typography sx={{ fontSize: 14, textAlign: "right", color: "#344054" }}>{money(r.gross)}</Typography>
                <Typography sx={{ fontSize: 14, textAlign: "right", color: "#667085" }}>{money(gpmOf(r))}</Typography>
                <Typography sx={{ fontSize: 14, textAlign: "right", color: "#667085" }}>{money(sodraOf(r))}</Typography>
                <Box sx={{ textAlign: "right" }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, color: "#101828" }}>{money(r.payable)}</Typography>
                  {n2(r.advance_paid) > 0 && <Typography sx={{ fontSize: 11.5, color: "#98A2B3" }}>+ avansas {money(r.advance_paid)}</Typography>}
                </Box>
                <Box sx={{ textAlign: "right", color: "#98A2B3" }}>{isOpen ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}</Box>
              </Box>
              <Collapse in={isOpen} unmountOnExit>
                <Payslip result={r} lines={lines} badges={badges} locked={locked} onChanged={onChanged}
                  onAdd={(kind) => setAddFor({ employee: r.employee, name: r.employee_name, kind })} />
              </Collapse>
            </Box>
          );
        })}
        <Box sx={{ display: "grid", gridTemplateColumns: COLS, px: 2, py: 1.25, bgcolor: "#F9FAFB", typography: "body2", "& > *": { fontSize: 14, fontWeight: 600 } }}>
          <Box>{filtered ? `Iš viso (${shown.length} iš ${rows.length})` : "Iš viso"}</Box>
          <Box sx={{ textAlign: "right" }}>{money(sum(sRows, "gross"))}</Box>
          <Box sx={{ textAlign: "right" }}>{money(sum(sRows, gpmOf))}</Box>
          <Box sx={{ textAlign: "right" }}>{money(sum(sRows, sodraOf))}</Box>
          <Box sx={{ textAlign: "right" }}>{money(sum(sRows, "payable"))}</Box>
          <Box />
        </Box>
      </Box>

      {footer}

      <AddLineDialog open={!!addFor} target={addFor} run={run} codes={codes}
        onClose={() => setAddFor(null)} onSaved={() => { setAddFor(null); onChanged(); }} />
    </Stack>
  );
}

// ---------- atlyginimo lapelis (atidarius eilutę) ----------
function SlipRow({ label, sub, value, minus, strong, onDelete }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2} sx={{ py: .55 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: strong ? 600 : 400, color: "#101828" }}>{label}</Typography>
        {sub && <Typography sx={{ fontSize: 11.5, color: "#98A2B3" }}>{sub}</Typography>}
      </Box>
      <Stack direction="row" alignItems="center" gap={.25}>
        <Typography sx={{ fontSize: 13.5, fontWeight: strong ? 600 : 400, whiteSpace: "nowrap", color: minus ? "#B42318" : "#101828" }}>
          {minus ? "−" : ""}{money(Math.abs(n2(value)))}
        </Typography>
        {onDelete && <IconButton size="small" onClick={onDelete}><DeleteOutlineIcon sx={{ fontSize: 16 }} /></IconButton>}
      </Stack>
    </Stack>
  );
}

const lineSub = (l) => [
  n2(l.quantity) > 0 ? `${num(l.quantity)} ${HOUR_CODES.includes(l.code) ? "val." : "d."}${n2(l.rate) > 0 ? ` × ${money(l.rate)}` : ""}` : "",
  NON_TAXED.includes(l.code) ? "neapmokestinama" : "",
  l.comment || "",
].filter(Boolean).join(" · ");

function Payslip({ result: r, lines, badges, locked, onChanged, onAdd }) {
  const earn = lines.filter((l) => ["earning", "compensation", "in_kind"].includes(l.category));
  const ded = lines.filter((l) => l.category === "deduction" && !isTaxLine(l) && !isAdvanceLine(l));
  const remove = (id) => payrollApi.deleteRunLine(id).then(onChanged);
  const usesVdu = earn.some((l) => ["ATO", "LIG", "MAM", "KMP", "MOK", "PRS"].includes(l.code));
  const notes = humanNotes(r.warnings).filter((n) => usesVdu || !/VDU/.test(n));
  const employer = employerOf(r);
  const H = ({ children }) => <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#667085", textTransform: "uppercase", letterSpacing: .3, mt: 1.25, mb: .25 }}>{children}</Typography>;

  return (
    <Box sx={{ px: 2, pb: 2, pt: .5, bgcolor: "#F9FAFB" }}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0,1.2fr) minmax(0,1fr)" }, gap: 1.5 }}>
        <Box sx={{ ...CARD, px: 2, pb: 1.5 }}>
          <H>Priskaičiuota</H>
          {earn.length === 0 && <Typography sx={{ fontSize: 13, color: "#98A2B3" }}>Nėra</Typography>}
          {earn.map((l) => (
            <SlipRow key={l.id} label={l.code_name} sub={lineSub(l)} value={l.amount}
              onDelete={l.is_manual && !locked ? () => remove(l.id) : undefined} />
          ))}
          <Box sx={{ borderTop: "1px solid #EAECF0", mt: .5 }}><SlipRow strong label="Iš viso priskaičiuota" value={r.gross} /></Box>

          <H>Išskaičiuota</H>
          <SlipRow label="GPM" sub={n2(r.npd_applied) > 0 ? `pritaikytas NPD ${money(r.npd_applied)}` : "NPD netaikytas"} value={gpmOf(r)} minus />
          <SlipRow label="Sodra" sub={`VSD ${money(r.vsd)} · PSD ${money(r.psd)}${n2(r.kaupimas) > 0 ? ` · II pakopa ${money(r.kaupimas)}` : ""}`} value={sodraOf(r)} minus />
          {n2(r.advance_paid) > 0 && <SlipRow label="Avansas" sub="jau išmokėtas" value={r.advance_paid} minus />}
          {ded.map((l) => (
            <SlipRow key={l.id} label={l.code_name} sub={l.comment} value={l.amount} minus
              onDelete={l.is_manual && !locked ? () => remove(l.id) : undefined} />
          ))}
          <Box sx={{ borderTop: "1px solid #EAECF0", mt: .5 }}><SlipRow strong label="Išmokėti" value={r.payable} /></Box>

          {!locked && (
            <Stack direction="row" gap={1} mt={1}>
              <Button size="small" startIcon={<AddIcon />} onClick={() => onAdd("earning")} sx={{ textTransform: "none" }}>Premija ar išmoka</Button>
              <Button size="small" startIcon={<AddIcon />} onClick={() => onAdd("deduction")} sx={{ textTransform: "none", color: "#475467" }}>Išskaita</Button>
            </Stack>
          )}
        </Box>

        <Stack gap={1.5}>
          <Box sx={{ ...CARD, p: 2 }}>
            <Stack direction="row" alignItems="center" gap={1} mb={.75}>
              <ReceiptLongOutlinedIcon sx={{ fontSize: 18, color: "#667085" }} />
              <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Šį mėnesį</Typography>
            </Stack>
            {badges.length === 0 && <Typography sx={{ fontSize: 13, color: "#98A2B3" }}>Įprastas mėnuo – tik alga</Typography>}
            {badges.map(({ key, Icon, color, text }) => (
              <Stack key={key} direction="row" gap={1} alignItems="flex-start" sx={{ py: .4 }}>
                <Box sx={{ width: 22, height: 22, borderRadius: 1, display: "grid", placeItems: "center", bgcolor: `${color}14`, color, flexShrink: 0 }}>
                  <Icon sx={{ fontSize: 14 }} />
                </Box>
                <Typography sx={{ fontSize: 13, color: "#344054" }}>{text}</Typography>
              </Stack>
            ))}
            {usesVdu && n2(r.daily_vdu) > 0 && (
              <Typography sx={{ fontSize: 12.5, color: "#667085", mt: .75 }}>Vidutinis dienos uždarbis (VDU): {money(r.daily_vdu)}</Typography>
            )}
            {notes.map((n, i) => <Typography key={i} sx={{ fontSize: 12.5, color: "#667085", mt: .5 }}>{n}</Typography>)}
          </Box>
          <Box sx={{ ...CARD, p: 2 }}>
            <SlipRow label="Darbdavio mokesčiai" value={employer}
              sub={`Sodra ${money(r.employer_vsd)}${n2(r.gar) + n2(r.ilg) > 0 ? ` · fondai ${money(n2(r.gar) + n2(r.ilg))}` : ""}${n2(r.grindys_vsd) + n2(r.grindys_psd) > 0 ? ` · iki MMA ${money(n2(r.grindys_vsd) + n2(r.grindys_psd))}` : ""}`} />
            <SlipRow strong label="Įmonei kainuoja" value={n2(r.gross) + employer} />
          </Box>
        </Stack>
      </Box>
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
function ApproveStep({ run, rows, ready, onDone, setError, onApproved, onNext, compact = false, year, month }) {
  const [unlockAsk, setUnlockAsk] = useState(false);
  // atlyginimai + tabelis atrakinami kartu (pirmiausia DU - kitaip tabelio atidaryti negalima)
  const unlockAll = async () => {
    setUnlockAsk(false);
    try {
      await payrollApi.reopenRun(run.id);
      try { await payrollApi.setTimesheetHours({ action: "reopen", year: year || run.year, month: month || run.month }); } catch { /* tabelis gal jau atidarytas */ }
      await onDone();
    } catch (e) { setError(apiError(e)); }
  };
  const tsOk = run.status !== "draft" || (ready ? ready.can_approve : ["approved", "locked"].includes(run.timesheet_status));
  const why = !tsOk ? (ready?.blockers?.[0] || "Pirmiausia patvirtinkite mėnesio tabelį") : "";
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

  // PAY-03: nepažymėti kaip sumokėti avansai -> sprendimas prieš tvirtinant
  const [adv, setAdv] = useState(null);          // [{id, employee, open, due_date, action, date}]
  const [notes, setNotes] = useState([]);
  const approve = async (decisions) => {
    setBusy(true); setError("");
    try {
      const r = await payrollApi.approveRun(run.id, decisions);
      setAdv(null);
      setNotes(r.warnings || []);
      await onDone();
      if (!(r.warnings || []).length) onApproved?.();          // patvirtinus - iškart į išmokėjimus
    } catch (e) {
      if (e?.response?.status === 409 && e.response.data?.advances) {
        setAdv(e.response.data.advances.map((a) => ({ ...a, action: "paid", date: a.due_date || "" })));
      } else setError(apiError(e));
    } finally { setBusy(false); }
  };

  const Tile = ({ title, value, note }) => (
    <Box sx={{ ...CARD, p: 2.25, flex: 1, minWidth: 200 }}>
      <Typography sx={{ fontSize: 13, color: "#667085" }}>{title}</Typography>
      <Typography sx={{ fontSize: 24, fontWeight: 600, color: "#101828", my: .5 }}>{money(value)}</Typography>
      <Typography sx={{ fontSize: 12, color: "#98A2B3" }}>{note}</Typography>
    </Box>
  );

  return (
    <Stack gap={compact ? 1.5 : 3}>
      {!compact && (
        <>
          <Stack direction={{ xs: "column", md: "row" }} gap={2}>
            <Tile title="Išmokėti darbuotojams" value={toEmployees} note="Pervesti į darbuotojų banko sąskaitas" />
            <Tile title="Sumokėti VMI (pajamų mokestis)" value={toVmi}
              note="Iki 15 d. to mėnesio, kai išmokamas atlyginimas (išmokėjus po 15 d. – iki mėnesio pabaigos). Tikslūs terminai – „Išmokėjimai“." />
            <Tile title="Sumokėti Sodrai" value={toSodra} note="Iki kito mėnesio 15 d. (jei poilsio diena – kitą darbo dieną)" />
          </Stack>
          <Typography variant="body2" color="text.secondary">Įmonei šis mėnuo iš viso kainavo {money(cost)} (atlyginimai su visais mokesčiais).</Typography>
        </>
      )}

      {notes.map((n, i) => <Alert key={i} severity="warning" onClose={() => setNotes(notes.filter((_, j) => j !== i))}>{n}</Alert>)}

      <Dialog open={!!adv} onClose={() => setAdv(null)} fullWidth maxWidth="sm" disableScrollLock>
        <DialogTitle>Avansai nepažymėti kaip sumokėti</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Iš atlyginimo išskaičiuojamas tik faktiškai sumokėtas avansas. Jei avansas sumokėtas, bet banko išrašas dar neįkeltas –
            pažymėkite jį sumokėtu.
          </Typography>
          <Stack gap={2}>
            {(adv || []).map((a, i) => (
              <Paper key={a.id} variant="outlined" sx={{ p: 1.5 }}>
                <Typography fontWeight={600}>{a.employee} · {money(a.open)}{Number(a.paid) > 0 ? ` (jau sumokėta ${money(a.paid)})` : ""}</Typography>
                <RadioGroup value={a.action} onChange={(e) => setAdv(adv.map((x, j) => (j === i ? { ...x, action: e.target.value } : x)))}>
                  <FormControlLabel value="paid" control={<Radio size="small" />} label="Sumokėtas – išskaičiuoti iš atlyginimo" />
                  <FormControlLabel value="unpaid" control={<Radio size="small" />} label="Nesumokėtas – visa suma bus išmokėta su atlyginimu" />
                </RadioGroup>
                {a.action === "paid" && (
                  <TextField size="small" type="date" label="Sumokėjimo data" value={a.date} InputLabelProps={{ shrink: true }}
                    onChange={(e) => setAdv(adv.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
                )}
              </Paper>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setAdv(null)}>Atšaukti</Button>
          <Button variant="contained" disabled={busy || !tsOk}
            onClick={() => approve(Object.fromEntries(adv.map((a) => [a.id, { action: a.action, date: a.date }])))}>
            Patvirtinti atlyginimus
          </Button>
        </DialogActions>
      </Dialog>

      {locked && compact ? (
        <Box sx={{ ...CARD, p: 2, bgcolor: "#F6FEF9", borderColor: "#ABEFC6", display: "flex", flexDirection: { xs: "column", md: "row" }, alignItems: { md: "center" }, gap: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 14.5, fontWeight: 600, color: "#05603A" }}>Atlyginimai patvirtinti</Typography>
            <Typography sx={{ fontSize: 13, color: "#067647", mt: .25 }}>
              Sukurtas DK įrašas ir išmokėjimai. Deklaracijos (SAM, GPM313, SDUP) ruošiamos skiltyje „Deklaravimas“.
            </Typography>
          </Box>
          <Button variant="outlined" startIcon={<LockOpenOutlinedIcon />} disabled={busy} onClick={() => setUnlockAsk(true)}
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, color: "#344054", borderColor: "#D0D5DD", bgcolor: "#FFFFFF", flexShrink: 0 }}>
            Atrakinti ir taisyti
          </Button>
          <Dialog open={unlockAsk} onClose={() => setUnlockAsk(false)} maxWidth="xs" fullWidth disableScrollLock>
            <DialogTitle sx={{ fontSize: 17, fontWeight: 600 }}>Atrakinti ir taisyti?</DialogTitle>
            <DialogContent>
              <Typography sx={{ fontSize: 13.5, color: "#475467" }}>Bus atrakinti:</Typography>
              <Typography sx={{ fontSize: 13.5, color: "#475467", mt: .5 }}>• <b style={{ fontWeight: 600 }}>tabelis</b> – galėsite taisyti darbo laiką;</Typography>
              <Typography sx={{ fontSize: 13.5, color: "#475467" }}>• <b style={{ fontWeight: 600 }}>atlyginimų paskaičiavimai</b> – DK įrašas bus panaikintas.</Typography>
              <Typography sx={{ fontSize: 13, color: "#667085", mt: 1.5 }}>
                Pataisę patvirtinkite tabelį ir atlyginimus iš naujo. Jei deklaracijos jau pateiktos – jas reikės patikslinti.
              </Typography>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setUnlockAsk(false)} sx={{ textTransform: "none", color: "#344054" }}>Atšaukti</Button>
              <Button variant="contained" disableElevation onClick={unlockAll} sx={{ textTransform: "none", fontWeight: 600 }}>Atrakinti</Button>
            </DialogActions>
          </Dialog>
        </Box>
      ) : locked ? (
        <Alert severity="success" action={(
          <Stack direction="row" gap={.5}>
            <Button color="inherit" size="small" disabled={busy} onClick={() => act(payrollApi.reopenRun)} sx={{ textTransform: "none" }}>Atidaryti taisymui</Button>
            {onNext && <Button color="inherit" size="small" variant="outlined" onClick={onNext} sx={{ textTransform: "none" }}>Toliau – išmokėjimai</Button>}
          </Stack>
        )}>
          Atlyginimai patvirtinti, įrašas į didžiąją knygą sukurtas. Deklaracijos (SAM, GPM313, SDUP) paruošiamos skiltyje „Deklaravimas“.
        </Alert>
      ) : (
        <Box sx={{ ...CARD, p: 2, display: "flex", flexDirection: { xs: "column", md: "row" }, alignItems: { md: "center" }, gap: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 14.5, fontWeight: 600, color: "#101828" }}>Ar viskas teisinga?</Typography>
            <Typography sx={{ fontSize: 13, color: why ? "#B54708" : "#667085", mt: .25 }}>
              {why ? `Kol kas negalima: ${why}` : "Patvirtinus bus sukurtas DK įrašas ir paruošti išmokėjimai. Klaidą vėliau galėsite pataisyti atidarę taisymui."}
            </Typography>
          </Box>
          <Button variant="contained" disableElevation size="large" disabled={busy || rows.length === 0 || !tsOk} onClick={() => approve()}
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, flexShrink: 0 }}>
            Patvirtinti atlyginimus
          </Button>
        </Box>
      )}
    </Stack>
  );
}
