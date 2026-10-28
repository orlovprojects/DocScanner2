import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Autocomplete, Avatar, Box, Button, Checkbox, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControl, FormControlLabel, IconButton, InputAdornment, InputLabel, Menu, MenuItem, Radio, Select, Skeleton, Stack,
  Switch, Tab, Tabs, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SearchIcon from "@mui/icons-material/Search";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import BeachAccessOutlinedIcon from "@mui/icons-material/BeachAccessOutlined";
import SickOutlinedIcon from "@mui/icons-material/SickOutlined";
import FlightTakeoffIcon from "@mui/icons-material/FlightTakeoff";
import ChildCareOutlinedIcon from "@mui/icons-material/ChildCareOutlined";
import PregnantWomanOutlinedIcon from "@mui/icons-material/PregnantWomanOutlined";
import FamilyRestroomOutlinedIcon from "@mui/icons-material/FamilyRestroomOutlined";
import MoneyOffOutlinedIcon from "@mui/icons-material/MoneyOffOutlined";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import WorkOutlineIcon from "@mui/icons-material/WorkOutline";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import MarkEmailReadOutlinedIcon from "@mui/icons-material/MarkEmailReadOutlined";
import ScheduleSendOutlinedIcon from "@mui/icons-material/ScheduleSendOutlined";
import PersonOffOutlinedIcon from "@mui/icons-material/PersonOffOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import EuroOutlinedIcon from "@mui/icons-material/EuroOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import { Link as RouterLink } from "react-router-dom";
import "dayjs/locale/lt";

import {
  ABSENCE_KINDS, CONTRACT_TYPES, apiError, days, money, payrollApi,
} from "../../api/payroll";
import NewEmployeeDialog from "./NewEmployeeDialog";
import { parsePersonalCode } from "./personalCode";
import ContractDocumentPanel from "./ContractDocumentPanel";
import PayrollSettingsDialog from "./PayrollSettingsDialog";
import { anchorLabel, cap, norm, periodsFrom, iso } from "./SuminePeriodSection";
import SavitarnaInvitePanel from "./SavitarnaInvitePanel";
import EmployeePayItemsPanel from "./EmployeePayItemsPanel";

const MENU_PROPS = { disableScrollLock: true };
const today = () => new Date().toISOString().slice(0, 10);

const DISMISS_BASES = [
  { value: "54", label: "Šalių susitarimu (DK 54 str.)" },
  { value: "55", label: "Darbuotojo prašymu (DK 55 str.)" },
  { value: "56", label: "Darbuotojo iniciatyva dėl svarbių priežasčių (DK 56 str.)" },
  { value: "57", label: "Darbdavio iniciatyva be darbuotojo kaltės (DK 57 str.)" },
  { value: "58", label: "Darbdavio iniciatyva dėl darbuotojo kaltės (DK 58 str.)" },
  { value: "59", label: "Darbdavio valia (DK 59 str.)" },
  { value: "69", label: "Pasibaigus terminui (DK 69 str.)" },
];
// išeitinė išmoka VDU mėnesiais: DK 57 (ir 56 str. 1 d. 4–6 p.) – 2 mėn., jei dirbo < 1 m. – 0,5; DK 59 – ne mažiau kaip 6
const severanceDefault = (basis, start, end) =>
  basis === "59" ? 6 : basis === "57" ? (end && start && dayjs(end).diff(dayjs(start), "year", true) >= 1 ? 2 : 0.5) : 0;

const WORK_MODES = [
  ["01", "Nekintanti darbo dienos (pamainos) trukmė"],
  ["02", "Suminė darbo laiko apskaita"],
  ["03", "Lankstus darbo grafikas"],
  ["04", "Suskaidytos darbo dienos laiko režimas"],
  ["05", "Individualus darbo laiko režimas"],
];

// Skaičiai visada su kableliu: galima įvesti ir taškelį - į serverį siunčiama su tašku
const toComma = (v) => (v === null || v === undefined || v === "" ? "" : String(v).replace(".", ","));
const toDot = (v) => (v === "" || v === null || v === undefined ? null : String(v).replace(/\s/g, "").replace(",", "."));
const cleanNum = (v) => v.replace(".", ",").replace(/[^\d,\s-]/g, "");

function DateF({ label, value, onChange, size = "small", fullWidth, autoFocus }) {
  return (
    <DatePicker label={label} value={value ? dayjs(value) : null} format="YYYY-MM-DD"
      onChange={(d) => onChange(d && d.isValid() ? d.format("YYYY-MM-DD") : "")}
      slotProps={{ textField: { size, fullWidth, autoFocus } }} />
  );
}

// ============================================================
// Puslapis
// ============================================================
const AV = ["#0EA5E9", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#10B981", "#EF4444", "#F59E0B", "#3B82F6"];
const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
const md = (iso) => (!iso ? "" : String(iso).slice(0, 4) === String(new Date().getFullYear()) ? String(iso).slice(5) : String(iso).slice(0, 10));
const ymd = (iso) => (iso ? String(iso).slice(0, 10) : "");
const dt = (iso) => (iso ? new Date(iso).toLocaleString("lt-LT", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const num = (v, d = 1) => Number(v || 0).toLocaleString("lt-LT", { minimumFractionDigits: 0, maximumFractionDigits: d });

// Kas šiandien - spalvos ir ikonos kaip nebuvimų grafike / tabelyje
const TODAY = {
  work: { l: "Dirba", c: "#027A48", bg: "#ECFDF3", i: WorkOutlineIcon },
  starts: { l: "Pradės dirbti", c: "#175CD3", bg: "#EFF8FF", i: EventOutlinedIcon },
  vacation: { l: "Atostogos", c: "#0E7490", bg: "#CFFAFE", i: BeachAccessOutlinedIcon },
  vacation_prepaid: { l: "Atostogos", c: "#0E7490", bg: "#CFFAFE", i: BeachAccessOutlinedIcon },
  sick: { l: "Liga", c: "#B42318", bg: "#FEE4E2", i: SickOutlinedIcon },
  business_trip: { l: "Komandiruotė", c: "#1D4ED8", bg: "#DBEAFE", i: FlightTakeoffIcon },
  childcare: { l: "Vaiko priežiūra", c: "#9D174D", bg: "#FCE7F3", i: ChildCareOutlinedIcon },
  maternity: { l: "Nėštumo atostogos", c: "#9D174D", bg: "#FCE7F3", i: PregnantWomanOutlinedIcon },
  paternity: { l: "Tėvystės atostogos", c: "#9D174D", bg: "#FCE7F3", i: ChildCareOutlinedIcon },
  parent_day: { l: "Mamadienis", c: "#BE185D", bg: "#FCE7F3", i: FamilyRestroomOutlinedIcon },
  unpaid: { l: "Nemokamos atostogos", c: "#6D28D9", bg: "#EDE9FE", i: MoneyOffOutlinedIcon },
  other: { l: "Nebuvimas", c: "#475467", bg: "#F2F4F7", i: EventBusyOutlinedIcon },
  dismissed: { l: "Atleistas", c: "#B42318", bg: "#FEE4E2", i: PersonOffOutlinedIcon },
};
const SAV = {
  active: { l: "Naudojasi", c: "#027A48", bg: "#ECFDF3", i: VerifiedUserOutlinedIcon },
  invited: { l: "Pakviestas", c: "#175CD3", bg: "#EFF8FF", i: MarkEmailReadOutlinedIcon },
  expired: { l: "Kvietimas negalioja", c: "#B54708", bg: "#FFFAEB", i: ScheduleSendOutlinedIcon },
  none: { l: "Nepakviestas", c: "#667085", bg: "#F2F4F7", i: PersonOffOutlinedIcon },
};
const savTip = (s) => (s?.status === "active" ? `Paskutinis prisijungimas ${dt(s.last_login)}`
  : s?.status === "invited" ? `Kvietimas išsiųstas ${dt(s.invited_at)}${s.expires_at ? ` · galioja iki ${dt(s.expires_at)}` : ""}`
    : s?.status === "expired" ? `Kvietimas išsiųstas ${dt(s.invited_at)} · nebegalioja nuo ${dt(s.expires_at)}. Pakvieskite iš naujo darbuotojo kortelėje.`
      : "Dar nepakviestas į eSavitarną");

function Pill({ cfg, label, sub, tip }) {
  const Icon = cfg.i;
  const el = (
    <Box sx={{ display: "inline-flex", flexDirection: "column", minWidth: 0, maxWidth: "100%" }}>
      <Stack direction="row" alignItems="center" gap={.5} sx={{ px: .85, py: .25, borderRadius: 1.25, bgcolor: cfg.bg, alignSelf: "flex-start", maxWidth: "100%" }}>
        <Icon sx={{ fontSize: 14, color: cfg.c, flexShrink: 0 }} />
        <Typography noWrap sx={{ fontSize: 12, fontWeight: 500, color: cfg.c }}>{label || cfg.l}</Typography>
      </Stack>
      {sub && <Typography noWrap sx={{ fontSize: 11.5, color: "#667085", mt: .3 }}>{sub}</Typography>}
    </Box>
  );
  return tip ? <Tooltip arrow title={tip}>{el}</Tooltip> : el;
}

const COLS = "minmax(200px,1.35fr) minmax(150px,1.1fr) minmax(140px,1fr) 100px 100px 78px minmax(130px,.95fr) 150px 34px 20px";
const HEAD = ["Darbuotojas", "Pareigos", "Sutartis", "Darbo laikas", "Atlyginimas", "Atostogos", "Šiandien", "eSavitarna", "", ""];
const QUICK = [
  { k: "summed", l: "suminė apskaita", c: "#075985", bg: "#E0F2FE", f: (r) => r.table?.work?.regime === "summed" },
  { k: "ending", l: "sutartys baigiasi", c: "#B54708", bg: "#FFFAEB", f: (r) => r.table?.contract?.ending },
  { k: "issues", l: "trūksta duomenų", c: "#B42318", bg: "#FEF3F2", f: (r) => (r.table?.warnings || []).length > 0 },
  { k: "nosav", l: "nenaudoja eSavitarnos", c: "#475467", bg: "#F2F4F7", f: (r) => r.table?.savitarna?.status !== "active" },
];

export default function DarbuotojaiPage({ embedded = false } = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");
  const [regime, setRegime] = useState("all");
  const [position, setPosition] = useState("all");
  const [quick, setQuick] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await payrollApi.employees({ status: status === "all" ? undefined : status });
      setRows(Array.isArray(r) ? r : r.results || []);
      setError("");
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const positions = useMemo(() => [...new Set(rows.map((r) => r.position).filter(Boolean))].sort((a, b) => a.localeCompare(b, "lt")), [rows]);
  const shown = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => (!qq || `${r.full_name} ${r.position || ""}`.toLowerCase().includes(qq))
      && (regime === "all" || r.table?.work?.regime === regime)
      && (position === "all" || r.position === position)
      && (!quick || QUICK.find((x) => x.k === quick).f(r)));
  }, [rows, q, regime, position, quick]);
  const sel = { bgcolor: "#FFFFFF", fontSize: 14, minWidth: 170, "& fieldset": { borderColor: "#D0D5DD" } };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="lt">
    <Box sx={{ p: embedded ? 0 : { xs: 2, md: 3 } }}>
      {!embedded && (
        <Box mb={2.5}>
          <Typography variant="h5" fontWeight={600}>Darbuotojai</Typography>
          <Typography variant="body2" color="text.secondary">Darbuotojų duomenys ir darbo sutartys. Pagal juos kas mėnesį skaičiuojamas atlyginimas.</Typography>
        </Box>
      )}
      <Stack direction="row" gap={1.25} alignItems="center" flexWrap="wrap" mb={1.5}>
        <TextField size="small" placeholder="Ieškoti pagal vardą, pavardę ar pareigas" value={q} onChange={(e) => setQ(e.target.value)}
          sx={{ width: { xs: "100%", sm: 330 }, bgcolor: "#FFFFFF" }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
        <ToggleButtonGroup size="small" exclusive value={status} onChange={(_, v) => v && setStatus(v)}
          sx={{ bgcolor: "#FFFFFF", "& .MuiToggleButton-root": { textTransform: "none", px: 1.6 } }}>
          <ToggleButton value="active">Dirba</ToggleButton>
          <ToggleButton value="dismissed">Atleisti</ToggleButton>
          <ToggleButton value="all">Visi</ToggleButton>
        </ToggleButtonGroup>
        <Select size="small" value={regime} onChange={(e) => setRegime(e.target.value)} sx={sel} MenuProps={MENU_PROPS}>
          <MenuItem value="all">Visos apskaitos</MenuItem>
          <MenuItem value="summed">Suminė apskaita</MenuItem>
          <MenuItem value="standard">Standartinė apskaita</MenuItem>
        </Select>
        <Select size="small" value={position} onChange={(e) => setPosition(e.target.value)} sx={sel} MenuProps={MENU_PROPS}>
          <MenuItem value="all">Visos pareigos</MenuItem>
          {positions.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
        </Select>
        <Box sx={{ flex: 1 }} />
        {!embedded && <Button onClick={() => setSettingsOpen(true)} sx={{ textTransform: "none" }}>Nustatymai</Button>}
        <Button variant="contained" disableElevation startIcon={<AddIcon />} onClick={() => setNewOpen(true)}
          sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}>Pridėti darbuotoją</Button>
      </Stack>

      {rows.length > 0 && (
        <Stack direction="row" gap={1} flexWrap="wrap" mb={1.75}>
          <Chip label={`${rows.length} ${status === "dismissed" ? "atleisti" : status === "all" ? "iš viso" : "dirba"}`} onClick={() => setQuick(null)}
            sx={{ height: 30, borderRadius: 2, fontSize: 13, fontWeight: 500, bgcolor: "#FFFFFF", border: `1px solid ${quick ? "#EAECF0" : "#98A2B3"}` }} />
          {QUICK.map((x) => {
            const n = rows.filter(x.f).length;
            if (!n) return null;
            return (
              <Chip key={x.k} label={`${n} ${x.l}`} onClick={() => setQuick(quick === x.k ? null : x.k)}
                onDelete={quick === x.k ? () => setQuick(null) : undefined}
                sx={{ height: 30, borderRadius: 2, fontSize: 13, fontWeight: 500, color: x.c, bgcolor: x.bg,
                  border: `1px solid ${quick === x.k ? x.c : "transparent"}`, "& .MuiChip-deleteIcon": { color: x.c, fontSize: 17 } }} />
            );
          })}
        </Stack>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ border: "1px solid #EAECF0", borderRadius: 3, bgcolor: "#FFFFFF", overflow: "hidden", boxShadow: "0 1px 3px rgba(16,24,40,.04)" }}>
        {!loading && shown.length === 0 ? (
          <Box sx={{ p: 5, textAlign: "center" }}>
            <Typography fontWeight={600} mb={0.5}>{rows.length ? "Nieko nerasta" : "Dar nėra darbuotojų"}</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              {rows.length ? "Pakeiskite paiešką ar filtrus." : "Pridėkite darbuotoją – reikės asmens duomenų, sutarties datos ir atlyginimo."}
            </Typography>
            {!rows.length && <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setNewOpen(true)}>Pridėti darbuotoją</Button>}
          </Box>
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <Box sx={{ minWidth: 1180 }}>
              <Box sx={{ display: "grid", gridTemplateColumns: COLS, gap: 1.5, px: 2, py: 1.1, bgcolor: "#F9FAFB", borderBottom: "1px solid #EAECF0" }}>
                {HEAD.map((h, i) => <Typography key={i} sx={{ fontSize: 12, fontWeight: 600, color: "#475467", textAlign: [4, 5].includes(i) ? "right" : "left" }}>{h}</Typography>)}
              </Box>
              {loading && !rows.length ? [0, 1, 2, 3].map((i) => (
                <Box key={i} sx={{ px: 2, py: 1.4, borderBottom: "1px solid #F2F4F7" }}><Skeleton variant="rounded" height={36} /></Box>
              )) : shown.map((r) => <EmployeeRow key={r.id} r={r} onOpen={() => setOpenId(r.id)} />)}
            </Box>
          </Box>
        )}
      </Box>

      <NewEmployeeDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={(id) => { setNewOpen(false); load(); setOpenId(id); }} />
      <EmployeeDialog id={openId} row={rows.find((x) => x.id === openId)} onClose={() => { setOpenId(null); load(); }} />
      <PayrollSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Box>
    </LocalizationProvider>
  );
}

function EmployeeRow({ r, onOpen }) {
  const t = r.table || {};
  const c = t.contract;
  const w = t.work;
  const p = t.pay;
  const v = t.vacation;
  const dismissed = r.status !== "active";
  const today = dismissed ? { kind: "dismissed" } : (t.today || { kind: "work" });
  const tcfg = TODAY[today.kind] || { ...TODAY.other, l: today.label || TODAY.other.l };
  const todaySub = today.kind === "starts" ? `nuo ${ymd(today.until)}` : today.until
    ? `${today.note ? `${today.note} · ` : ""}iki ${md(today.until)}` : "";
  const warns = [...(t.warnings || [])];
  if (r.data_status === "awaiting_employee" && !warns.includes("Laukiama darbuotojo duomenų")) warns.push("Laukiama darbuotojo duomenų");
  return (
    <Box onClick={onOpen} sx={{ display: "grid", gridTemplateColumns: COLS, gap: 1.5, alignItems: "center", px: 2, py: 1.35,
      borderBottom: "1px solid #F2F4F7", cursor: "pointer", opacity: dismissed ? .7 : 1, "&:hover": { bgcolor: "#F8FAFF" } }}>
      <Stack direction="row" gap={1.3} alignItems="center" sx={{ minWidth: 0 }}>
        <Avatar sx={{ width: 36, height: 36, bgcolor: AV[r.id % AV.length], fontSize: 13, fontWeight: 600 }}>{initials(r.full_name)}</Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 14, fontWeight: 600, color: "#101828" }}>{r.full_name}</Typography>
          <Typography noWrap sx={{ fontSize: 12, color: "#98A2B3" }}>{r.personal_code_masked || "–"}</Typography>
        </Box>
      </Stack>
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: 13.5, color: "#344054" }}>{r.position || "–"}</Typography>
        {r.position && (
          <Typography noWrap sx={{ fontSize: 12, color: t.position_group ? "#98A2B3" : "#B54708" }}>
            {t.position_group ? `${t.position_group} grupė` : "be SDUP grupės"}
          </Typography>
        )}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        {c ? (
          <>
            <Typography noWrap sx={{ fontSize: 13.5, color: c.ending ? "#B54708" : "#344054", fontWeight: c.ending ? 500 : 400 }}>
              {c.terminated ? `Nutraukta ${ymd(c.end)}` : c.fixed && c.end ? `Terminuota iki ${c.ending ? md(c.end) : ymd(c.end)}` : (c.type || "Neterminuota")}
            </Typography>
            <Typography noWrap sx={{ fontSize: 12, color: "#98A2B3" }}>nuo {c.start} · {c.seniority}</Typography>
          </>
        ) : <Typography sx={{ fontSize: 13, color: "#B42318" }}>Nėra sutarties</Typography>}
      </Box>
      <Stack gap={.4} alignItems="flex-start">
        {w ? (
          <>
            <Typography sx={{ fontSize: 13.5, color: "#344054" }}>{Number(w.workload).toLocaleString("lt-LT", { minimumFractionDigits: 1, maximumFractionDigits: 3 })} etato</Typography>
            <Box sx={{ px: .8, py: .1, borderRadius: 1, fontSize: 11.5, fontWeight: 500,
              bgcolor: w.regime === "summed" ? "#E0F2FE" : "#DDF4F1", color: w.regime === "summed" ? "#075985" : "#0B6B5F" }}>
              {w.regime === "summed" ? "Suminė" : "Standartinė"}
            </Box>
          </>
        ) : <Typography sx={{ fontSize: 13, color: "#98A2B3" }}>–</Typography>}
      </Stack>
      <Box sx={{ textAlign: "right" }}>
        <Typography sx={{ fontSize: 14, fontWeight: 500, color: "#101828" }}>{p ? money(p.amount) : money(r.base_amount)}</Typography>
        <Typography sx={{ fontSize: 12, color: "#98A2B3" }}>{p?.form === "hourly" ? "/ val." : "/ mėn."}</Typography>
      </Box>
      <Tooltip arrow title={!v ? "" : v.level === "neg" ? "Atostogos išnaudotos avansu" : v.level === "many" ? "Daug nepanaudotų dienų – suplanuokite atostogas" : "Atostogų likutis šiandien"}>
        <Box sx={{ textAlign: "right" }}>
          <Typography sx={{ fontSize: 14, fontWeight: 500, color: !v ? "#98A2B3" : v.level === "neg" ? "#B42318" : v.level === "many" ? "#B54708" : "#101828" }}>
            {v ? num(v.balance) : "–"}
          </Typography>
          {v && <Typography sx={{ fontSize: 12, color: "#98A2B3" }}>d.</Typography>}
        </Box>
      </Tooltip>
      <Box sx={{ minWidth: 0 }}><Pill cfg={tcfg} label={today.kind === "other" || !TODAY[today.kind] ? today.label : undefined} sub={todaySub} /></Box>
      <Box sx={{ minWidth: 0 }}><Pill cfg={SAV[t.savitarna?.status] || SAV.none} tip={savTip(t.savitarna)} /></Box>
      <Box onClick={(e) => warns.length && e.stopPropagation()}>
        {warns.length > 0 && (
          <Tooltip arrow title={<Box>{warns.map((x) => <div key={x}>• {x}</div>)}</Box>}>
            <Box sx={{ width: 30, height: 30, borderRadius: "50%", bgcolor: "#FEF3F2", display: "grid", placeItems: "center" }}>
              <ErrorOutlineRoundedIcon sx={{ fontSize: 18, color: "#D92D20" }} />
            </Box>
          </Tooltip>
        )}
      </Box>
      <ChevronRightIcon sx={{ color: "#D0D5DD" }} />
    </Box>
  );
}

// ============================================================
// Pagalbiniai komponentai
// ============================================================
function Hint({ children }) {
  return (
    <Stack direction="row" gap={1} alignItems="flex-start" sx={{ color: "text.secondary", mt: 0.5 }}>
      <InfoOutlinedIcon sx={{ fontSize: 16, mt: "2px" }} />
      <Typography variant="caption">{children}</Typography>
    </Stack>
  );
}

// ---------- Kortelės dizaino dalys ----------
const CARD_SX = { border: "1px solid #EAECF0", borderRadius: 2.5, p: 2.25, bgcolor: "#FFFFFF" };
const BTN_SX = { textTransform: "none", fontWeight: 600, borderRadius: 2, boxShadow: "none", "&:hover": { boxShadow: "none" } };

// „?“ ikonėlė su paaiškinimu
function Tip({ title }) {
  if (!title) return null;
  return (
    <Tooltip arrow placement="top" enterTouchDelay={0}
      title={<Box sx={{ fontSize: 12.5, lineHeight: 1.5, p: .25, maxWidth: 300 }}>{title}</Box>}>
      <HelpOutlineIcon sx={{ fontSize: 16, color: "#98A2B3", ml: .5, verticalAlign: "-3px", cursor: "help", "&:hover": { color: "#475467" } }} />
    </Tooltip>
  );
}

function Section({ title, desc, tip, action, children, sx }) {
  return (
    <Box sx={{ ...CARD_SX, ...sx }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1} mb={1.75}>
        <Box>
          <Typography component="div" sx={{ fontSize: 14.5, fontWeight: 600, color: "#101828" }}>{title}<Tip title={tip} /></Typography>
          {desc && <Typography sx={{ fontSize: 12.5, color: "#667085", mt: .2 }}>{desc}</Typography>}
        </Box>
        {action}
      </Stack>
      <Stack gap={1.5}>{children}</Stack>
    </Box>
  );
}

// reason - kodėl laukas neaktyvus (rodoma vietoje hint)
function ToggleRow({ label, hint, tip, checked, onChange, disabled, reason }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}
      sx={{ py: 1.1, borderTop: "1px solid #F2F4F7", "&:first-of-type": { borderTop: 0, pt: 0 } }}>
      <Box>
        <Typography component="div" sx={{ fontSize: 13.5, color: disabled ? "#98A2B3" : "#101828" }}>{label}<Tip title={tip} /></Typography>
        {(reason || hint) && <Typography sx={{ fontSize: 12, color: reason ? "#98A2B3" : "#667085", mt: .2 }}>{reason || hint}</Typography>}
      </Box>
      <Switch size="small" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </Stack>
  );
}

// Eilutė „pavadinimas ? ............ reikšmė“ (neaktyviems / tik skaitomiems laukams)
function InfoRow({ label, tip, value, reason }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}
      sx={{ py: 1.1, borderTop: "1px solid #F2F4F7", "&:first-of-type": { borderTop: 0, pt: 0 } }}>
      <Box>
        <Typography component="div" sx={{ fontSize: 13.5, color: "#98A2B3" }}>{label}<Tip title={tip} /></Typography>
        {reason && <Typography sx={{ fontSize: 12, color: "#98A2B3", mt: .2 }}>{reason}</Typography>}
      </Box>
      <Typography sx={{ fontSize: 13, color: "#98A2B3", whiteSpace: "nowrap" }}>{value}</Typography>
    </Stack>
  );
}

function KV({ label, value, sub, color }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 11.5, color: "#667085" }}>{label}</Typography>
      <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: color || "#101828" }}>{value || "–"}</Typography>
      {sub && <Typography sx={{ fontSize: 11.5, color: "#98A2B3" }}>{sub}</Typography>}
    </Box>
  );
}

// Išsaugojimo juosta skirtuko apačioje (matoma, kai yra pakeitimų)
function SaveBar({ dirty, busy, error, onSave, onReset }) {
  return (
    <Box sx={{ position: "sticky", bottom: 0, mx: -2.5, mt: 2.5, px: 2.5, py: 1.5, bgcolor: "#FFFFFF", borderTop: "1px solid #EAECF0", zIndex: 2 }}>
      {error && <Alert severity="error" sx={{ mb: 1.25, py: 0 }}>{error}</Alert>}
      <Stack direction="row" alignItems="center" gap={1}>
        <Typography sx={{ fontSize: 12.5, color: dirty ? "#B54708" : "#98A2B3", mr: "auto" }}>
          {dirty ? "Yra neišsaugotų pakeitimų" : "Visi pakeitimai išsaugoti"}
        </Typography>
        {dirty && <Button onClick={onReset} sx={{ ...BTN_SX, fontWeight: 500, color: "#344054" }}>Atšaukti</Button>}
        <Button variant="contained" disabled={!dirty || busy} onClick={onSave} sx={BTN_SX}>Išsaugoti</Button>
      </Stack>
    </Box>
  );
}

const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;
const ibanOk = (v) => !v || (IBAN_RE.test(v) && (!v.startsWith("LT") || v.length === 20));

// Darbuotojo laukų redagavimas (Asmens duomenys / Mokesčiai) - bendra būsena ir išsaugojimas
function useEmployeeForm(emp, onSaved) {
  const pick = (e) => {
    const data = { ...e };
    ["children", "contracts", "full_name", "onboarding_token", "created_at", "updated_at", "id", "savitarna_status"].forEach((k) => delete data[k]);
    return data;
  };
  const [f, setF] = useState(() => pick(emp));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setF(pick(emp)); }, [emp]);
  const base = pick(emp);
  const dirty = JSON.stringify(f) !== JSON.stringify(base);
  const set = (v) => setF((s) => ({ ...s, ...v }));
  const save = async () => {
    setBusy(true);
    try { await payrollApi.updateEmployee(emp.id, f); setError(""); onSaved("Išsaugota"); } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };
  return { f, set, dirty, busy, error, save, reset: () => setF(base) };
}

// Vardas, pavardė, AK ir kt. - pateikiami Sodrai / VMI, todėl keičiami tik paspaudus „Keisti“
function groupReported(list) {
  const by = {};
  list.forEach((r) => { (by[r.label] = by[r.label] || []).push(r.period); });
  return Object.entries(by).map(([label, ps]) => ({ label, periods: [...new Set(ps.filter(Boolean))] }));
}

function PersonTab({ emp, onSaved, onReload }) {
  const { f, set, dirty, busy, error, save, reset } = useEmployeeForm(emp, onSaved);
  const [unlocked, setUnlocked] = useState(false);
  const [ask, setAsk] = useState(null);            // jau pateiktos ataskaitos -> patvirtinimo langas
  useEffect(() => { setUnlocked(false); }, [emp]);
  const pc = !f.is_foreigner && f.personal_code?.length === 11 ? parsePersonalCode(f.personal_code) : null;   // kontrolinis - tik įspėjimas
  const locked = !unlocked;
  const startEdit = async () => {
    let rep = [];
    try { rep = await payrollApi.employeeReported(emp.id); } catch { rep = []; }
    if (rep?.length) setAsk(rep); else setUnlocked(true);
  };
  const doReset = () => { reset(); setUnlocked(false); };
  return (
    <>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, alignItems: "start" }}>
        <Section title="Asmuo" desc="Kaip nurodyta asmens dokumente"
          tip="Vardas, pavardė ir asmens kodas patenka į Sodros ir VMI ataskaitas, todėl apsaugoti nuo atsitiktinio pakeitimo."
          action={locked ? (
            <Button size="small" startIcon={<EditOutlinedIcon sx={{ fontSize: "16px !important" }} />} onClick={startEdit}
              sx={{ ...BTN_SX, fontWeight: 500, color: "#475467" }}>Keisti</Button>
          ) : (
            <Chip size="small" label="Redaguojama" sx={{ bgcolor: "#FEF0C7", color: "#B54708", fontWeight: 500 }} />
          )}>
          <Stack direction="row" gap={1.5}>
            <TextField size="small" label="Vardas" value={f.first_name || ""} disabled={locked} onChange={(e) => set({ first_name: e.target.value })} fullWidth />
            <TextField size="small" label="Pavardė" value={f.last_name || ""} disabled={locked} onChange={(e) => set({ last_name: e.target.value })} fullWidth />
          </Stack>
          {!f.is_foreigner ? (
            <TextField size="small" label="Asmens kodas" value={f.personal_code || ""} disabled={locked} inputProps={{ maxLength: 11, inputMode: "numeric" }}
              onChange={(e) => set({ personal_code: e.target.value.replace(/\D/g, "") })}
              error={!!pc && !pc.valid}
              FormHelperTextProps={{ sx: { color: pc?.valid && pc.warning ? "#B54708" : undefined } }}
              helperText={pc ? (pc.valid ? `${pc.birth_date ? `Gimė ${pc.birth_date} · ` : ""}${pc.gender === "M" ? "vyras" : "moteris"}${pc.warning ? `. ⚠ ${pc.warning}` : ""}` : pc.error)
                : f.personal_code ? `Įvesta ${f.personal_code.length} iš 11 skaitmenų` : " "} />
          ) : (
            <>
              <Stack direction="row" gap={1.5}>
                <Box sx={{ flex: 1, ...(locked ? { pointerEvents: "none", opacity: .6 } : {}) }}>
                  <DateF label="Gimimo data" value={f.birth_date || ""} fullWidth onChange={(v) => set({ birth_date: v })} />
                </Box>
                <FormControl size="small" sx={{ flex: 1 }} disabled={locked}>
                  <InputLabel>Lytis</InputLabel>
                  <Select label="Lytis" value={f.gender || ""} MenuProps={MENU_PROPS} onChange={(e) => set({ gender: e.target.value })}>
                    <MenuItem value="M">Vyras</MenuItem><MenuItem value="F">Moteris</MenuItem>
                  </Select>
                </FormControl>
              </Stack>
              <TextField size="small" label="Užsieniečio kodas (Sodroje)" value={f.foreign_code || ""} disabled={locked} onChange={(e) => set({ foreign_code: e.target.value })} />
              <Stack direction="row" gap={1.5}>
                <TextField size="small" label="SD pažymėjimo serija" value={f.sd_series || ""} inputProps={{ maxLength: 2 }}
                  onChange={(e) => set({ sd_series: e.target.value.toUpperCase() })} sx={{ width: 170 }} />
                <TextField size="small" label="SD pažymėjimo Nr." value={f.sd_number || ""} inputProps={{ maxLength: 7 }}
                  onChange={(e) => set({ sd_number: e.target.value })} fullWidth />
              </Stack>
            </>
          )}
          {!locked && (
            <FormControlLabel sx={{ ml: -.5 }} control={<Switch size="small" checked={!!f.is_foreigner} onChange={(e) => set({ is_foreigner: e.target.checked })} />}
              label={<Typography sx={{ fontSize: 13.5 }}>Užsienietis (neturi LT asmens kodo)</Typography>} />
          )}
          <TextField size="small" label="Gyvenamoji vieta" value={f.address || ""} onChange={(e) => set({ address: e.target.value })} />
        </Section>

        <Section title="Kontaktai ir eSavitarna" desc="Per eSavitarną darbuotojas mato algalapius ir teikia prašymus">
          <TextField size="small" label="El. paštas" value={f.email || ""} onChange={(e) => set({ email: e.target.value.trim() })} />
          <TextField size="small" label="Telefonas" value={f.phone || ""} onChange={(e) => set({ phone: e.target.value })} />
          <SavitarnaInvitePanel emp={emp} onChanged={onReload} />
        </Section>

        <Section title="Atlyginimo mokėjimas">
          <TextField size="small" label="Banko sąskaita (IBAN)" value={f.iban || ""} placeholder="LT00 0000 0000 0000 0000"
            onChange={(e) => set({ iban: e.target.value.toUpperCase().replace(/\s/g, "") })}
            error={!f.iban || !ibanOk(f.iban)}
            helperText={!f.iban ? "Būtina – be jos nebus paruoštas mokėjimas bankui" : !ibanOk(f.iban) ? "Neteisingas IBAN formatas" : " "} />
          <ToggleRow label="Mokėti kartą per mėnesį" hint="Darbuotojo prašymu – be avanso" checked={f.pay_once_a_month}
            onChange={(v) => set({ pay_once_a_month: v })} />
          {!f.pay_once_a_month && (
            <TextField size="small" label="Avanso suma" value={toComma(f.advance_amount)} inputProps={{ inputMode: "decimal" }}
              onChange={(e) => set({ advance_amount: toDot(cleanNum(e.target.value)) })} placeholder="Pagal DU nustatymus"
              InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }}
              helperText="Tuščia – pagal DU nustatymų procentą" />
          )}
        </Section>

        <Section title="Darbo grafikai" desc="Žymos naudojamos grafiko taisyklėse (pvz. „Gali dirbti naktį“)">
          <TagsField value={f.tags || []} onChange={(tags) => set({ tags })} />
        </Section>
      </Box>
      <SaveBar dirty={dirty} busy={busy} error={error} onSave={save} onReset={doReset} />

      <Dialog open={!!ask} onClose={() => setAsk(null)} maxWidth="xs" fullWidth disableScrollLock>
        <DialogTitle sx={{ fontSize: 17, fontWeight: 600, pb: 1 }}>Duomenys jau pateikti Sodrai / VMI</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5, color: "#475467", mb: 1.5 }}>Šis darbuotojas yra pateiktose ataskaitose:</Typography>
          <Stack gap={.75} mb={2}>
            {groupReported(ask || []).map((g) => (
              <Stack key={g.label} direction="row" gap={1} alignItems="baseline">
                <Typography sx={{ fontSize: 13.5, fontWeight: 600, minWidth: 120 }}>{g.label}</Typography>
                <Typography sx={{ fontSize: 13, color: "#667085" }}>
                  {g.periods.length > 4 ? `${g.periods.slice(0, 2).join(", ")} … ${g.periods[g.periods.length - 1]} (${g.periods.length})` : g.periods.join(", ")}
                </Typography>
              </Stack>
            ))}
          </Stack>
          <Typography sx={{ fontSize: 13, color: "#475467" }}>
            <b style={{ fontWeight: 600 }}>Keičiate pavardę</b> (santuoka ir pan.) – ataskaitų tikslinti nereikia, asmuo atpažįstamas pagal asmens kodą.
          </Typography>
          <Typography sx={{ fontSize: 13, color: "#475467", mt: 1 }}>
            <b style={{ fontWeight: 600 }}>Taisote klaidingą asmens kodą</b> – šias ataskaitas reikės patikslinti Sodroje ir VMI.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAsk(null)} sx={{ ...BTN_SX, fontWeight: 500, color: "#344054" }}>Atšaukti</Button>
          <Button variant="contained" onClick={() => { setAsk(null); setUnlocked(true); }} sx={BTN_SX}>Suprantu, keisti</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

const NPD_OPTS = [
  ["standard", "Taikyti", "Dirba tik pas mus arba mūsų įmonė – pagrindinė darbovietė"],
  ["none", "Netaikyti", "NPD jau taikomas kitoje darbovietėje"],
  ["d30_55", "Taikyti padidintą", "Nustatytas 30–55 % dalyvumo lygis"],
  ["d0_25", "Taikyti padidintą", "Nustatytas 0–25 % dalyvumo lygis"],
];
const isDisNpd = (m) => m === "d30_55" || m === "d0_25";

function TaxTab({ emp, contract, onSaved }) {
  const { f, set, dirty, busy, error, save, reset } = useEmployeeForm(emp, onSaved);
  const year = new Date().getFullYear();
  const cur = [...(contract?.terms || [])].sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];
  const workload = Number(cur?.workload || 1);
  const partTime = workload < 1;
  const disNpd = isDisNpd(f.npd_mode);

  // Padidintas NPD = yra dalyvumo lygis -> automatiškai įjungiam ir atostogų / grindų požymius
  // grįžus nuo padidinto NPD prie įprasto - dalyvumo lygis (ir jo grindų išimtis) išjungiami, kad neliktų per klaidą
  const setNpd = (v) => set({
    npd_mode: v,
    ...(isDisNpd(v) ? { has_disability: true } : {}),
    ...(isDisNpd(v) && partTime && !f.grindys_exempt_reason ? { grindys_exempt_reason: "participation" } : {}),
    ...(!isDisNpd(v) && disNpd ? { has_disability: false } : {}),
    ...(!isDisNpd(v) && disNpd && f.grindys_exempt_reason === "participation" ? { grindys_exempt_reason: "" } : {}),
  });

  return (
    <>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, alignItems: "start" }}>
        <Section title="Neapmokestinamasis pajamų dydis (NPD)"
          tip="NPD – pajamų dalis, nuo kurios neskaičiuojamas GPM. Taikomas tik vienoje darbovietėje: jei darbuotojas dirba keliose, paklauskite, kur jis taikomas. Padidintas NPD – turintiems nustatytą dalyvumo lygį (NDNT pažyma).">
          <Stack gap={1}>
            {NPD_OPTS.map(([v, t, d]) => {
              const on = (f.npd_mode || "standard") === v;
              return (
                <Box key={v} onClick={() => setNpd(v)} sx={{
                  p: 1.25, borderRadius: 2, cursor: "pointer", border: "1.5px solid",
                  borderColor: on ? "#1570EF" : "#EAECF0", bgcolor: on ? "#F5F8FF" : "#FFFFFF",
                }}>
                  <Stack direction="row" alignItems="center" gap={1}>
                    <Radio size="small" checked={on} sx={{ p: 0 }} />
                    <Box>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: "#101828" }}>{t}</Typography>
                      <Typography sx={{ fontSize: 12, color: "#667085" }}>{d}</Typography>
                    </Box>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
          <ToggleRow label="Progresinis GPM per metus" checked={f.progressive_gpm_request}
            tip="Įjunkite tik gavę rašytinį darbuotojo prašymą. Kitais atvejais GPM tarifai taikomi automatiškai."
            onChange={(v) => set({ progressive_gpm_request: v })} />
        </Section>

        <Section title="Sodra">
          <ToggleRow label="Kaupia pensiją II pakopoje" checked={f.pension_accumulation}
            tip="Jei darbuotojas kaupia pensiją II pakopos fonde, nuo jo atlyginimo skaičiuojama papildoma įmoka. Tai matyti Sodros suvestinėje S47; suklydus Sodra perskaičiuos pati."
            onChange={(v) => set({ pension_accumulation: v })} />
          <ToggleRow label={`VSD lubos ${year} m. pasiektos`} checked={f.vsd_cap_year === year}
            tip="Kai darbuotojo metinės pajamos (kartu su kitomis darbovietėmis) pasiekia VSD lubas, įmokos iki metų pabaigos nebeskaičiuojamos. Įjunkite, jei lubos pasiektos dirbant ir kitur."
            onChange={(v) => set({ vsd_cap_year: v ? year : null })} />
          {partTime ? (
            <Box sx={{ pt: 1.1, borderTop: "1px solid #F2F4F7" }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Minimalių įmokų išimtis</InputLabel>
                <Select label="Minimalių įmokų išimtis" value={f.grindys_exempt_reason || ""} MenuProps={MENU_PROPS}
                  onChange={(e) => set({ grindys_exempt_reason: e.target.value || null })}>
                  <MenuItem value="">Netaikoma – įmokos ne mažiau kaip nuo MMA</MenuItem>
                  {GRINDYS_REASONS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
                </Select>
              </FormControl>
              <Typography component="div" sx={{ fontSize: 12, color: "#667085", mt: .75 }}>
                Dirba {num(workload, 3)} etato<Tip title="Dirbant ne visu etatu, Sodros įmokos skaičiuojamos ne mažiau kaip nuo minimalios algos (MMA). Kai kuriems darbuotojams taikoma išimtis – tada įmokos skaičiuojamos tik nuo faktinio atlyginimo." />
              </Typography>
              {f.has_disability && !f.grindys_exempt_reason && (
                <Alert severity="info" sx={{ mt: 1, py: 0 }}
                  action={<Button size="small" color="inherit" onClick={() => set({ grindys_exempt_reason: "participation" })}>Taikyti</Button>}>
                  Nustatytas dalyvumo lygis – galima išimtis
                </Alert>
              )}
            </Box>
          ) : (
            <InfoRow label="Minimalių įmokų išimtis" value="Netaikoma" reason="Aktualu tik dirbant ne visu etatu"
              tip="Dirbant ne visu etatu, Sodros įmokos skaičiuojamos ne mažiau kaip nuo minimalios algos (MMA). Dirbant visu etatu tai neaktualu." />
          )}
        </Section>

        <Section title="Ilgesnės atostogos" tip="Šiais atvejais kasmetinės atostogos – 25 d. d. vietoj 20 (DK 126 str.).">
          <ToggleRow label="Nustatytas 0–55 % dalyvumo lygis" checked={f.has_disability} disabled={disNpd}
            reason={disNpd ? "Įjungta, nes pasirinktas padidintas NPD" : ""}
            tip="Dalyvumo lygį nustato NDNT. Tokiam darbuotojui priklauso 25 d. d. atostogų."
            onChange={(v) => set({ has_disability: v })} />
          <ToggleRow label="Vienas augina vaiką" checked={f.single_parent}
            tip="Vienas auginantis vaiką iki 14 m. arba vaiką su negalia iki 18 m. – 25 d. d. atostogų."
            onChange={(v) => set({ single_parent: v })} />
        </Section>

        <OpeningVdu f={f} set={set} />
      </Box>
      <SaveBar dirty={dirty} busy={busy} error={error} onSave={save} onReset={reset} />
    </>
  );
}

const GRINDYS_REASONS = [
  ["other_employer", "Dirba pas kitą darbdavį"],
  ["pension", "Gauna senatvės / netekto darbingumo pensiją"],
  ["under_24", "Jaunesnis nei 24 m."],
  ["participation", "0–55 % dalyvumo lygis"],
  ["childcare", "Gauna motinystės / tėvystės / vaiko priežiūros išmoką"],
];

function OpeningVdu({ f, set }) {
  if (!f.opening_vdu && !f.opening_vdu_until) return null;
  const unit = f.opening_vdu_unit === "hour" ? "€/val." : "€/d.";
  return (
    <Section title="VDU iš ankstesnės programos" desc={`Naudojamas iki ${f.opening_vdu_until || "–"}, kol DokSkenas sukaups 3 mėnesius`}
      action={<Button size="small" color="error" onClick={() => set({ opening_vdu: null, opening_vdu_until: null })} sx={{ textTransform: "none" }}>Nenaudoti</Button>}>
      <TextField size="small" label="VDU" value={toComma(f.opening_vdu)} sx={{ maxWidth: 200 }} inputProps={{ inputMode: "decimal" }}
        onChange={(e) => set({ opening_vdu: toDot(cleanNum(e.target.value)) })}
        InputProps={{ endAdornment: <InputAdornment position="end">{unit}</InputAdornment> }} />
    </Section>
  );
}

// ============================================================
// Darbuotojo kortelė
// ============================================================
const KTABS = [["person", "Asmens duomenys"], ["contract", "Sutartis"], ["tax", "Mokesčiai"], ["items", "Priedai ir išskaitos"],
  ["absences", "Atostogos ir nebuvimai"], ["family", "Šeima"]];

function ProfilePanel({ emp, row, vac, contract, onTab }) {
  const t = row?.table || {};
  const terms = [...(contract?.terms || [])].sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  const cur = terms[0];
  const dismissed = emp.status !== "active";
  const sav = SAV[t.savitarna?.status || (emp.savitarna_status === "active" ? "active" : emp.savitarna_status === "invited" ? "invited" : "none")];
  const warns = [...(t.warnings || [])];
  if (emp.data_status === "awaiting_employee" && !warns.includes("Laukiama darbuotojo duomenų")) warns.push("Laukiama darbuotojo duomenų");
  const fixed = contract && ["02", "04", "05"].includes(contract.sodra_contract_type);
  const end = contract?.termination_date || (fixed ? contract?.end_date : null);
  const probEnd = contract?.probation_months
    ? dayjs(contract.start_date).add(contract.probation_months, "month").subtract(1, "day").format("YYYY-MM-DD") : null;
  const inProbation = probEnd && probEnd >= today();
  const bal = vac?.balance != null ? Number(vac.balance) : null;
  const perYear = (Number(contract?.extended_leave_days) || Number(contract?.annual_leave_days) || 20) + (Number(contract?.extra_leave_days) || 0);
  return (
    <Box sx={{ bgcolor: "#FFFFFF", borderRight: { md: "1px solid #EAECF0" }, p: 2.5, overflowY: "auto" }}>
      <Stack alignItems="center" textAlign="center">
        <Avatar sx={{ width: 64, height: 64, bgcolor: AV[emp.id % AV.length], fontSize: 22, fontWeight: 600 }}>{initials(emp.full_name)}</Avatar>
        <Typography sx={{ fontSize: 18, fontWeight: 600, mt: 1.25, color: "#101828" }}>{emp.full_name}</Typography>
        <Typography sx={{ fontSize: 13, color: "#667085" }}>
          {cur?.position_name || "Pareigos nenurodytos"}{cur?.group_code ? ` · ${cur.group_code} grupė` : ""}
        </Typography>
        <Stack direction="row" gap={.75} mt={1.25} flexWrap="wrap" justifyContent="center">
          <Chip size="small" label={dismissed ? "Atleistas" : "Dirba"}
            sx={{ bgcolor: dismissed ? "#FEE4E2" : "#ECFDF3", color: dismissed ? "#B42318" : "#027A48", fontWeight: 500 }} />
          {cur && <Chip size="small" label={cur.work_regime === "summed" ? "Suminė" : "Standartinė"}
            sx={{ bgcolor: cur.work_regime === "summed" ? "#E0F2FE" : "#DDF4F1", color: cur.work_regime === "summed" ? "#075985" : "#0B6B5F", fontWeight: 500 }} />}
          <Tooltip arrow title={savTip(t.savitarna)}>
            <Chip size="small" icon={<sav.i sx={{ fontSize: "15px !important", color: `${sav.c} !important` }} />} label="eSavitarna"
              sx={{ bgcolor: sav.bg, color: sav.c, fontWeight: 500 }} />
          </Tooltip>
        </Stack>
      </Stack>
      <Divider sx={{ my: 2 }} />
      <Stack gap={1.6}>
        <PFact icon={DescriptionOutlinedIcon} label="Sutartis" onClick={() => onTab("contract")}
          value={!contract ? "Nėra sutarties" : end ? `${contract.termination_date ? "Nutraukta" : "Terminuota iki"} ${end}` : (CONTRACT_TYPES.find((x) => x.value === contract.sodra_contract_type)?.label || "Neterminuota")}
          color={t.contract?.ending ? "#B54708" : undefined}
          sub={contract ? `nuo ${contract.start_date}${contract.number ? ` · Nr. ${contract.number}` : ""}` : ""} />
        {inProbation && <PFact icon={HourglassEmptyOutlinedIcon} label="Bandomasis laikotarpis" value={`iki ${probEnd}`} color="#175CD3" />}
        {cur && (
          <PFact icon={ScheduleOutlinedIcon} label="Darbo laikas" onClick={() => onTab("contract")}
            value={`${Number(cur.workload).toLocaleString("lt-LT", { minimumFractionDigits: 1, maximumFractionDigits: 3 })} etato · ${cur.work_regime === "summed" ? "suminė" : "standartinė"}`} />
        )}
        {cur && (
          <PFact icon={EuroOutlinedIcon} label="Atlyginimas" onClick={() => onTab("contract")}
            value={`${money(cur.base_amount)} ${cur.pay_form === "hourly" ? "/ val." : "/ mėn."}`} sub={`nuo ${cur.valid_from}`} />
        )}
        {bal != null && (
          <Box onClick={() => onTab("absences")} sx={{ cursor: "pointer" }}>
            <PFact icon={BeachAccessOutlinedIcon} label="Atostogų likutis" value={`${days(vac.balance)}`}
              color={bal < 0 ? "#B42318" : undefined}
              sub={Number(vac.accrued) < 1 && !Number(vac.used)
                ? `kaupiasi po ~${days(perYear / 12)} per mėn. (${perYear} d. per metus)`
                : `sukaupta ${days(vac.accrued)}, panaudota ${days(vac.used)} · ${perYear} d. per metus`} />
          </Box>
        )}
      </Stack>
      {warns.length > 0 && (
        <Box sx={{ mt: 2.25, p: 1.4, borderRadius: 2, bgcolor: "#FEF3F2" }}>
          <Stack direction="row" gap={.8} alignItems="center" mb={.5}>
            <ErrorOutlineRoundedIcon sx={{ fontSize: 17, color: "#D92D20" }} />
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#912018" }}>Reikia dėmesio ({warns.length})</Typography>
          </Stack>
          {warns.map((x) => <Typography key={x} sx={{ fontSize: 12.5, color: "#912018", ml: 3.2 }}>• {x}</Typography>)}
        </Box>
      )}
    </Box>
  );
}

function PFact({ icon: I, label, value, sub, color, onClick }) {
  return (
    <Stack direction="row" gap={1.2} alignItems="flex-start" onClick={onClick}
      sx={{ cursor: onClick ? "pointer" : "default", borderRadius: 1.5, "&:hover .v": { color: onClick ? "#1D4ED8" : undefined } }}>
      <Box sx={{ width: 30, height: 30, borderRadius: 1.75, bgcolor: "#F2F4F7", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <I sx={{ fontSize: 17, color: "#475467" }} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 11.5, color: "#667085" }}>{label}</Typography>
        <Typography className="v" sx={{ fontSize: 13.5, fontWeight: 500, color: color || "#101828" }}>{value}</Typography>
        {sub && <Typography sx={{ fontSize: 11.5, color: "#98A2B3" }}>{sub}</Typography>}
      </Box>
    </Stack>
  );
}

function EmployeeDialog({ id, row, onClose }) {
  const [emp, setEmp] = useState(null);
  const [tab, setTab] = useState("person");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [vac, setVac] = useState(null);

  const load = useCallback(async () => {
    if (!id) return;
    try { setEmp(await payrollApi.employee(id)); setError(""); } catch (e) { setError(apiError(e)); }
    payrollApi.vacation(id).then(setVac).catch(() => setVac(null));
  }, [id]);
  useEffect(() => { setTab("person"); setEmp(null); setMsg(""); load(); }, [load]);
  useEffect(() => { if (!msg) return undefined; const t = setTimeout(() => setMsg(""), 3500); return () => clearTimeout(t); }, [msg]);

  const contract = emp?.contracts?.find((c) => c.status === "active") || emp?.contracts?.[0];
  const done = (m) => { if (m) setMsg(m); load(); };

  return (
    <Dialog open={!!id} onClose={onClose} fullWidth maxWidth="lg" disableScrollLock
      PaperProps={{ sx: { borderRadius: 3, overflow: "hidden", height: { md: "88vh" }, bgcolor: "#F8FAFC" } }}>
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="lt">
        {!emp ? (
          <Box sx={{ p: 4 }}>{error ? <Alert severity="error">{error}</Alert> : <Skeleton variant="rounded" height={420} />}</Box>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "290px minmax(0,1fr)" }, height: "100%", minHeight: 0 }}>
            <ProfilePanel emp={emp} row={row} vac={vac} contract={contract} onTab={setTab} />
            <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
              <Stack direction="row" alignItems="center" sx={{ px: 2, bgcolor: "#FFFFFF", borderBottom: "1px solid #EAECF0" }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto"
                  sx={{ minHeight: 50, flex: 1, "& .MuiTab-root": { textTransform: "none", fontSize: 14, fontWeight: 500, minHeight: 50, px: 1.4 } }}>
                  {KTABS.map(([v, l]) => <Tab key={v} value={v} label={l} />)}
                </Tabs>
                <IconButton onClick={onClose} aria-label="Uždaryti"><CloseIcon /></IconButton>
              </Stack>
              <Box sx={{ flex: 1, overflowY: "auto", px: 2.5, pt: 2.5, pb: tab === "person" || tab === "tax" ? 0 : 2.5 }}>
                {msg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMsg("")}>{msg}</Alert>}
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                {tab === "person" && <PersonTab emp={emp} onSaved={done} onReload={load} />}
                {tab === "tax" && <TaxTab emp={emp} contract={contract} onSaved={done} />}
                {tab === "contract" && <ContractTab emp={emp} contract={contract} onChanged={done} />}
                {tab === "items" && <EmployeePayItemsPanel employeeId={emp.id} />}
                {tab === "absences" && <AbsencesTab emp={emp} vac={vac} onChanged={load} />}
                {tab === "family" && <ChildrenTab emp={emp} onChanged={load} />}
              </Box>
            </Box>
          </Box>
        )}
      </LocalizationProvider>
    </Dialog>
  );
}

function TagsField({ value, onChange }) {
  const [tags, setTags] = useState(null);
  useEffect(() => { payrollApi.tags().then((r) => setTags(Array.isArray(r) ? r : r.results || [])).catch(() => setTags([])); }, []);
  if (tags === null) return null;
  if (!tags.length) return <Typography sx={{ fontSize: 13, color: "#667085" }}>Žymų dar nėra – jas sukursite grafiko nustatymuose („Pamainos ir žymos“).</Typography>;
  return (
    <Autocomplete multiple size="small" options={tags} getOptionLabel={(t) => t.name} value={tags.filter((t) => value.includes(t.id))}
      onChange={(_, v) => onChange(v.map((t) => t.id))} isOptionEqualToValue={(a, b) => a.id === b.id}
      renderInput={(p) => <TextField {...p} label="Žymos" placeholder="Pridėti žymą" />} />
  );
}

const DAY_SHORT = ["Pr", "An", "Tr", "Kt", "Pn", "Š", "S"];
const hoursOf = (t) => Number(t?.workload || 0) * Number(t?.full_time_hours || 40);
const etatas = (w) => (Number(w) === 1 ? "visas etatas" : `${num(w, 3)} etato`);

// „Pr–Pn po 8 val.“ iš week_hours (jei nėra - tolygiai Pr–Pn)
function weekText(t) {
  const wh = t?.week_hours?.length === 7 ? t.week_hours.map(Number) : null;
  if (!wh) return `Pr–Pn po ${num(hoursOf(t) / 5, 2)} val.`;
  const runs = [];
  wh.forEach((h, i) => {
    if (!(h > 0)) return;
    const last = runs[runs.length - 1];
    if (last && last[1] === i - 1) last[1] = i; else runs.push([i, i]);
  });
  const names = runs.map(([x, y]) => (x === y ? DAY_SHORT[x] : y - x === 1 ? `${DAY_SHORT[x]}, ${DAY_SHORT[y]}` : `${DAY_SHORT[x]}–${DAY_SHORT[y]}`)).join(", ");
  const hrs = wh.filter((h) => h > 0);
  return hrs.every((h) => h === hrs[0]) ? `${names} po ${num(hrs[0], 2)} val.` : `${names} · skirtingai`;
}

function WorkTimeSettings({ contract, summed, co, onChanged }) {
  const init = useCallback(() => ({
    work_time_mode: contract.work_time_mode && contract.work_time_mode !== "02" ? contract.work_time_mode : "01",
    custom: !!contract.summed_period_months,
    months: Number(contract.summed_period_months) || co.m,
    anchor: Number(contract.summed_period_anchor) || co.a,
    is_company_head: !!contract.is_company_head,
  }), [contract, co]);
  const [f, setF] = useState(init);
  const [error, setError] = useState("");
  useEffect(() => { setF(init()); }, [init]);
  const payload = {
    work_time_mode: summed ? "02" : f.work_time_mode,
    summed_period_months: summed && f.custom ? f.months : null,
    summed_period_anchor: summed && f.custom ? norm(f.months, f.anchor) : null,
    is_company_head: f.is_company_head,
  };
  const orig = {
    work_time_mode: contract.work_time_mode || "01", summed_period_months: contract.summed_period_months || null,
    summed_period_anchor: contract.summed_period_anchor || null, is_company_head: !!contract.is_company_head,
  };
  const dirty = JSON.stringify(payload) !== JSON.stringify(orig);
  const save = async () => {
    try { await payrollApi.updateContract(contract.id, payload); setError(""); onChanged("Darbo laiko nustatymai išsaugoti"); }
    catch (e) { setError(apiError(e)); }
  };
  const pm = f.custom ? f.months : co.m;
  const pa = f.custom ? norm(f.months, f.anchor) : norm(co.m, co.a);
  const now = periodsFrom(new Date(), pm, pa, 0)[0];
  const periodChanged = summed && (payload.summed_period_months !== orig.summed_period_months
    || payload.summed_period_anchor !== orig.summed_period_anchor);

  return (
    <Section title="Darbo laiko nustatymai" desc="Ne darbo sutarties sąlygos – juos nustato darbdavys. Dažniausiai keisti nereikia">
      {summed ? (
        <Box sx={{ pb: 1.1 }}>
          <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
            <Typography component="div" sx={{ fontSize: 13.5, color: "#101828", mr: "auto" }}>
              Apskaitinis laikotarpis
              <Tip title="Per šį laikotarpį sumuojamos valandos – kiek turėjo dirbti ir kiek dirbo. Viršvalandžiai ar neišdirbta norma paaiškėja laikotarpio pabaigoje. Ne ilgiau kaip 3 mėn. (DK 113 str.)." />
            </Typography>
            {f.custom ? (
              <>
                <TextField select size="small" value={f.months} sx={{ width: 110 }}
                  onChange={(e) => setF({ ...f, months: Number(e.target.value), anchor: 1 })} SelectProps={{ MenuProps: MENU_PROPS }}>
                  {[1, 2, 3].map((m) => <MenuItem key={m} value={m}>{m} mėn.</MenuItem>)}
                </TextField>
                {f.months > 1 && (
                  <TextField select size="small" value={norm(f.months, f.anchor)} sx={{ width: 250 }}
                    onChange={(e) => setF({ ...f, anchor: Number(e.target.value) })}
                    SelectProps={{ MenuProps: MENU_PROPS, renderValue: (v) => cap(anchorLabel(f.months, v, true)) }}>
                    {Array.from({ length: f.months }, (_, i) => i + 1).map((x) => <MenuItem key={x} value={x}>{cap(anchorLabel(f.months, x))}</MenuItem>)}
                  </TextField>
                )}
                <Button size="small" onClick={() => setF({ ...f, custom: false })} sx={{ textTransform: "none" }}>Kaip įmonėje</Button>
              </>
            ) : (
              <>
                <Typography sx={{ fontSize: 13.5, color: "#475467" }}><b style={{ fontWeight: 600, color: "#101828" }}>{co.m} mėn.</b> · pagal įmonės nustatymus</Typography>
                <Button size="small" onClick={() => setF({ ...f, custom: true, months: co.m, anchor: co.a })} sx={{ textTransform: "none" }}>Keisti</Button>
              </>
            )}
          </Stack>
          <Typography sx={{ fontSize: 12, color: "#667085", mt: .5 }}>Dabartinis: {iso(now.start)} – {iso(now.end)}</Typography>
          {periodChanged && (
            <Alert severity="warning" sx={{ mt: 1, py: .25, fontSize: 12.5 }}>
              Pakeitimas taikomas iš karto – einamojo laikotarpio valandos (norma, viršvalandžiai) bus perskaičiuotos pagal naują laikotarpį.
              Laikotarpį keiskite prieš prasidedant naujam ir apie tai raštu informuokite darbuotoją.
            </Alert>
          )}
        </Box>
      ) : (
        <InfoRow label="Apskaitinis laikotarpis" value="–" reason="Taikoma tik suminei darbo laiko apskaitai"
          tip="Laikotarpis, per kurį sumuojamos valandos. Reikalingas tik suminei apskaitai." />
      )}

      {summed ? (
        <InfoRow label="Darbo laiko režimas (SDUP)" value="02 – suminė" reason="Nustatoma pagal darbo laiko apskaitą"
          tip="Režimo kodas teikiamas SDUP ataskaitoje (darbo užmokesčio skaidrumas)." />
      ) : (
        <Box sx={{ py: 1.1, borderTop: "1px solid #F2F4F7" }}>
          <Typography component="div" sx={{ fontSize: 13.5, color: "#101828", mb: 1 }}>
            Darbo laiko režimas (SDUP)
            <Tip title="Režimo kodas teikiamas SDUP ataskaitoje (darbo užmokesčio skaidrumas). Dažniausiai – 01: kiekvieną darbo dieną dirbama tiek pat valandų." />
          </Typography>
          <TextField select size="small" fullWidth value={f.work_time_mode} SelectProps={{ MenuProps: MENU_PROPS }}
            onChange={(e) => setF({ ...f, work_time_mode: e.target.value })}>
            {WORK_MODES.filter(([v]) => v !== "02").map(([v, l]) => <MenuItem key={v} value={v}>{v} – {l}</MenuItem>)}
          </TextField>
        </Box>
      )}

      <ToggleRow label="Įmonės vadovas" checked={f.is_company_head} onChange={(v) => setF({ ...f, is_company_head: v })}
        tip="Pažymėkite, jei tai juridinio asmens vienasmenis valdymo organas (direktorius). Jam 1-SD teikiamas ne vėliau kaip prieš 1 darbo valandą." />

      {contract.summed_opening && (
        <Hint>
          Perkeltas laikotarpio likutis iš ankstesnės programos: dirbta {toComma(contract.summed_opening.worked)} val.,
          nebuvimai {toComma(contract.summed_opening.absence)} val., jau apmokėta viršvalandžių {toComma(contract.summed_opening.paid_ot)} val.
        </Hint>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {dirty && <Box><Button size="small" variant="contained" onClick={save} sx={BTN_SX}>Išsaugoti</Button></Box>}
    </Section>
  );
}

function ContractTab({ emp, contract, onChanged }) {
  const [change, setChange] = useState(null);
  const [dismiss, setDismiss] = useState(null);
  const [meta, setMeta] = useState(null);           // sutarties duomenų redagavimas
  const [menu, setMenu] = useState(null);
  const [hist, setHist] = useState(false);
  const [co, setCo] = useState({ m: 3, a: 1 });
  const [error, setError] = useState("");
  useEffect(() => {
    payrollApi.settings().then((st) => setCo({ m: st.summed_period_months || 3, a: st.summed_period_anchor || 1 })).catch(() => {});
  }, []);
  if (!contract) return <Box sx={CARD_SX}><Typography>Darbo sutarties nėra.</Typography></Box>;
  const terms = [...(contract.terms || [])].sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  const current = terms[0];
  const summed = current?.work_regime === "summed";
  const fullH = Number(current?.full_time_hours || 40);
  const type = CONTRACT_TYPES.find((t) => t.value === contract.sodra_contract_type)?.label;
  const fixed = ["02", "04", "05"].includes(contract.sodra_contract_type) || String(contract.sodra_contract_subtype || "").endsWith("1");
  const probEnd = contract.probation_months
    ? dayjs(contract.start_date).add(contract.probation_months, "month").subtract(1, "day").format("YYYY-MM-DD") : null;
  const terminated = contract.status === "terminated";
  const pm = Number(contract.summed_period_months) || co.m;

  const saveChange = async () => {
    const hours = Number(toDot(change.hours)) || 0;
    const old = hoursOf(current);
    const week = change.work_regime === "standard" && current?.week_hours?.length === 7 && old > 0
      ? current.week_hours.map((h) => Math.round((Number(h) * hours / old) * 100) / 100) : null;
    try {
      await payrollApi.createTerms({ contract: contract.id, valid_from: change.valid_from, position: current?.position,
        pay_form: change.pay_form, base_amount: toDot(change.base_amount), workload: (hours / fullH).toFixed(3),
        full_time_hours: fullH, work_regime: change.work_regime, week_hours: week });
      setChange(null); setError(""); onChanged("Naujos darbo sąlygos išsaugotos");
    } catch (e) { setError(apiError(e)); }
  };
  const saveDismiss = async () => {
    try {
      const sev = dismiss.severance ?? severanceDefault(dismiss.basis, contract.start_date, dismiss.date);
      await payrollApi.updateContract(contract.id, {
        termination_date: dismiss.date, status: "terminated",
        termination_basis: { article: dismiss.basis, ...(Number(sev) ? { severance_months: Number(toDot(String(sev))) } : {}),
          ...(dismiss.settle_until ? { settlement_until: dismiss.settle_until } : {}) },
      });
      await payrollApi.updateEmployee(emp.id, { status: "dismissed" });
      setDismiss(null); setError(""); onChanged("Sutartis nutraukta. Galutinis atsiskaitymas bus apskaičiuotas to mėnesio atlyginimuose.");
    } catch (e) { setError(apiError(e)); }
  };
  const saveMeta = async () => {
    try {
      await payrollApi.updateContract(contract.id, { number: meta.number, signed_date: meta.signed_date || null,
        probation_months: Number(meta.probation_months) || 0, ...(fixed ? { end_date: meta.end_date || null } : {}) });
      setMeta(null); setError(""); onChanged("Sutarties duomenys išsaugoti");
    } catch (e) { setError(apiError(e)); }
  };
  const changeHours = Number(toDot(change?.hours)) || 0;

  return (
    <Stack gap={2}>
      {dismiss && (
        <Section title="Sutarties nutraukimas" desc="Kompensacija už nepanaudotas atostogas apskaičiuojama automatiškai, išeitinei išmokai atlyginimuose bus parodyta suma"
          sx={{ borderColor: "#FDA29B", bgcolor: "#FFFBFA" }}>
          <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}>
            <DateF label="Paskutinė darbo diena" value={dismiss.date} fullWidth onChange={(v) => setDismiss({ ...dismiss, date: v })} />
            <FormControl size="small" fullWidth>
              <InputLabel>Pagrindas</InputLabel>
              <Select label="Pagrindas" value={dismiss.basis} MenuProps={MENU_PROPS} onChange={(e) => setDismiss({ ...dismiss, basis: e.target.value, severance: undefined })}>
                {DISMISS_BASES.map((b) => <MenuItem key={b.value} value={b.value}>{b.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}>
            <TextField size="small" fullWidth label="Išeitinė išmoka, mėn. VDU"
              value={dismiss.severance ?? severanceDefault(dismiss.basis, contract.start_date, dismiss.date)}
              onChange={(e) => setDismiss({ ...dismiss, severance: e.target.value })}
              helperText={dismiss.basis === "56" ? "DK 56 str. 1 d. 4–6 p.: 2 mėn. (dirbo < 1 m. – 0,5)" : dismiss.basis === "59" ? "Ne mažiau kaip 6 mėn. VDU" : " "} />
            <DateF label="Susitarta atsiskaityti iki (nebūtina)" value={dismiss.settle_until || null} fullWidth
              onChange={(v) => setDismiss({ ...dismiss, settle_until: v })} />
          </Stack>
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
            Galutinis atsiskaitymas – paskutinę darbo dieną (DK 146 str.). Vėliau – tik jei atleidžiant raštu susitarta:
            iki 1 VDU – ne vėliau kaip per 10 darbo dienų, likusi dalis – ne vėliau kaip per 3 mėnesius. Vėluojant – delspinigiai (nuo 2026-11-01 ×5).
          </Typography>
          <Stack direction="row" gap={1}>
            <Button variant="contained" color="error" size="small" onClick={saveDismiss} disabled={!dismiss.date} sx={BTN_SX}>Nutraukti sutartį</Button>
            <Button size="small" onClick={() => setDismiss(null)} sx={{ ...BTN_SX, fontWeight: 500 }}>Atšaukti</Button>
          </Stack>
        </Section>
      )}

      {/* ---------- 1. Sutartis ---------- */}
      <Section title="Darbo sutartis"
        desc={terminated ? `Nutraukta ${contract.termination_date}` : `${type || "Neterminuota"}${fixed && contract.end_date ? ` iki ${contract.end_date}` : ""}`}
        action={!meta && (
          <Stack direction="row" gap={.5}>
            <Button size="small" startIcon={<EditOutlinedIcon sx={{ fontSize: "16px !important" }} />}
              onClick={() => setMeta({ number: contract.number || "", signed_date: contract.signed_date || "", probation_months: String(contract.probation_months || 0), end_date: contract.end_date || "" })}
              sx={{ ...BTN_SX, fontWeight: 500, color: "#475467" }}>Redaguoti</Button>
            {!terminated && (
              <>
                <IconButton size="small" onClick={(e) => setMenu(e.currentTarget)} aria-label="Daugiau"><MoreHorizIcon fontSize="small" /></IconButton>
                <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)} disableScrollLock
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
                  <MenuItem onClick={() => { setMenu(null); setDismiss({ date: today(), basis: "55" }); }} sx={{ color: "#B42318", fontSize: 14 }}>
                    Nutraukti sutartį…
                  </MenuItem>
                </Menu>
              </>
            )}
          </Stack>
        )}>
        {!meta ? (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, minmax(0,1fr))" }, gap: 2 }}>
            <KV label="Darbo pradžia" value={contract.start_date} sub={fixed && contract.end_date ? `pabaiga ${contract.end_date}` : ""} />
            <KV label="Bandomasis laikotarpis" value={contract.probation_months ? `${contract.probation_months} mėn.` : "Nėra"}
              sub={probEnd ? `iki ${probEnd}` : ""} color={probEnd && probEnd >= today() ? "#175CD3" : undefined} />
            <KV label="Sutarties Nr." value={contract.number || "–"} />
            <KV label="Pasirašyta" value={contract.signed_date || "–"} />
          </Box>
        ) : (
          <>
            <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}>
              <TextField size="small" label="Sutarties Nr." value={meta.number} onChange={(e) => setMeta({ ...meta, number: e.target.value })} fullWidth />
              <DateF label="Pasirašyta" value={meta.signed_date} fullWidth onChange={(v) => setMeta({ ...meta, signed_date: v })} />
              <FormControl size="small" fullWidth>
                <InputLabel>Bandomasis laikotarpis</InputLabel>
                <Select label="Bandomasis laikotarpis" value={meta.probation_months} MenuProps={MENU_PROPS} onChange={(e) => setMeta({ ...meta, probation_months: e.target.value })}>
                  {["0", "1", "2", "3", "4", "5", "6"].map((m) => (
                    <MenuItem key={m} value={m} disabled={Number(m) > 3 && contract.start_date < "2026-11-01"}>
                      {m === "0" ? "Nėra" : `${m} mėn.`}{Number(m) > 3 ? " (tik didelė alga)" : ""}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {fixed && <DateF label="Darbo pabaiga" value={meta.end_date} fullWidth onChange={(v) => setMeta({ ...meta, end_date: v })} />}
            </Stack>
            <Typography component="div" sx={{ fontSize: 12, color: "#667085" }}>
              Bandomasis laikotarpis – iki 3 mėn.
              <Tip title="Nuo 2026-11-01 – iki 6 mėn., jei alga ne mažesnė kaip 2 šalies VDU (DK 36 str.). Terminuotoje sutartyje – proporcingas jos trukmei. Pratęsti susitarus negalima." />
            </Typography>
            <Stack direction="row" gap={1}>
              <Button variant="contained" size="small" onClick={saveMeta} sx={BTN_SX}>Išsaugoti</Button>
              <Button size="small" onClick={() => setMeta(null)} sx={{ ...BTN_SX, fontWeight: 500 }}>Atšaukti</Button>
            </Stack>
          </>
        )}
        <Divider />
        <ContractDocumentPanel contract={contract} bare />
      </Section>

      {/* ---------- 2. Darbo sąlygos ---------- */}
      <Section title="Darbo sąlygos" desc={current ? `Galioja nuo ${current.valid_from}` : ""}
        tip="Pakeitus atlyginimą, etatą ar apskaitą, sukuriamos naujos sąlygos nuo nurodytos datos – ankstesnės lieka istorijoje. Jei pakeitimas vidury mėnesio, tą mėnesį DU skaičiuojamas dviem dalimis."
        action={!terminated && !change && (
          <Button size="small" variant="outlined" onClick={() => setChange({ valid_from: today(), pay_form: current?.pay_form || "monthly",
            base_amount: toComma(current?.base_amount || ""), hours: toComma(String(Math.round(hoursOf(current) * 100) / 100 || fullH)),
            work_regime: current?.work_regime || "standard" })}
            sx={{ ...BTN_SX, fontWeight: 500, color: "#344054", borderColor: "#D0D5DD" }}>Keisti sąlygas</Button>
        )}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, minmax(0,1fr))" }, gap: 2 }}>
          <KV label="Pareigos" value={current?.position_name || "Nenurodytos"} color={current?.position_name ? undefined : "#B54708"}
            sub={current?.group_code ? `${current.group_code} grupė (SDUP)` : ""} />
          <KV label="Atlyginimas" value={current ? `${money(current.base_amount)} ${current.pay_form === "hourly" ? "/ val." : "/ mėn."}` : ""} />
          <KV label="Darbo laikas" value={current ? `${num(hoursOf(current), 2)} val./sav.` : ""}
            sub={current ? `${etatas(current.workload)}${fullH !== 40 ? ` · sutrumpinta norma ${num(fullH)} val.` : ""}` : ""} />
          <KV label="Apskaita" value={summed ? "Suminė" : "Standartinė"}
            sub={current ? (summed ? `${pm} mėn. laikotarpis` : weekText(current)) : ""} />
        </Box>

        {change && (
          <Box sx={{ p: 1.75, borderRadius: 2, bgcolor: "#F5F8FF", border: "1px solid #B2CCFF" }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 1.5 }}>Naujos sąlygos</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
              <DateF label="Galioja nuo" value={change.valid_from} fullWidth onChange={(v) => setChange({ ...change, valid_from: v })} />
              <TextField size="small" fullWidth label={change.pay_form === "hourly" ? "Už valandą" : "Alga per mėnesį"} value={change.base_amount}
                inputProps={{ inputMode: "decimal" }} sx={{ bgcolor: "#FFFFFF" }}
                onChange={(e) => setChange({ ...change, base_amount: cleanNum(e.target.value) })}
                InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }} />
              <TextField size="small" fullWidth label="Valandų per savaitę" value={change.hours} inputProps={{ inputMode: "decimal" }} sx={{ bgcolor: "#FFFFFF" }}
                onChange={(e) => {
                  const v = cleanNum(e.target.value);
                  setChange({ ...change, hours: Number(toDot(v)) > fullH ? toComma(String(fullH)) : v });
                }}
                helperText={changeHours > 0 ? `= ${etatas(changeHours / fullH)} (daugiausia ${num(fullH)} val.)` : `Daugiausia ${num(fullH)} val. – 1 etatas`} />
              <FormControl size="small" fullWidth sx={{ bgcolor: "#FFFFFF" }}>
                <InputLabel>Darbo laiko apskaita</InputLabel>
                <Select label="Darbo laiko apskaita" value={change.work_regime} MenuProps={MENU_PROPS}
                  onChange={(e) => setChange({ ...change, work_regime: e.target.value })}>
                  <MenuItem value="standard">Standartinė (darbo dienomis)</MenuItem>
                  <MenuItem value="summed">Suminė (pagal pamainų grafiką)</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <Stack direction="row" gap={1} mt={1.5}>
              <Button variant="contained" size="small" onClick={saveChange} sx={BTN_SX}
                disabled={!change.base_amount || !change.valid_from || !(changeHours > 0)}>Išsaugoti</Button>
              <Button size="small" onClick={() => setChange(null)} sx={{ ...BTN_SX, fontWeight: 500 }}>Atšaukti</Button>
            </Stack>
          </Box>
        )}

        {terms.length > 1 && (
          <Box>
            <Button size="small" onClick={() => setHist(!hist)} endIcon={<ChevronRightIcon sx={{ transform: hist ? "rotate(90deg)" : "none", transition: ".15s" }} />}
              sx={{ textTransform: "none", px: 0, color: "#475467" }}>Ankstesnės sąlygos ({terms.length - 1})</Button>
            <Collapse in={hist}>
              <Box sx={{ mt: 1 }}>
                {terms.slice(1).map((t, i) => (
                  <Stack key={t.id} direction="row" gap={1.5} sx={{ position: "relative", pb: i < terms.length - 2 ? 1.5 : 0 }}>
                    <Box sx={{ position: "relative", width: 10, flexShrink: 0 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: "50%", mt: .6, bgcolor: "#D0D5DD" }} />
                      {i < terms.length - 2 && <Box sx={{ position: "absolute", left: 4, top: 16, bottom: -4, width: 2, bgcolor: "#EAECF0" }} />}
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 12, color: "#667085" }}>nuo {t.valid_from}</Typography>
                      <Typography sx={{ fontSize: 13.5, color: "#101828" }}>
                        {money(t.base_amount)}{t.pay_form === "hourly" ? " / val." : " / mėn."} · {num(hoursOf(t), 2)} val./sav.
                        {t.work_regime === "summed" ? " · suminė" : ""}{t.position_name ? ` · ${t.position_name}` : ""}
                      </Typography>
                    </Box>
                  </Stack>
                ))}
              </Box>
            </Collapse>
          </Box>
        )}
      </Section>

      {error && <Alert severity="error">{error}</Alert>}

      {/* ---------- 3. Papildomi nustatymai ---------- */}
      {!terminated && <WorkTimeSettings key={contract.id} contract={contract} summed={summed} co={co} onChanged={onChanged} />}
    </Stack>
  );
}

export function AbsenceForm({ employee, defaults, onSaved, onCancel }) {
  const [f, setF] = useState({ kind: "vacation", start_date: today(), end_date: today(), ...defaults });
  const [error, setError] = useState("");
  const [vac, setVac] = useState(null);

  useEffect(() => {
    if (f.kind !== "vacation" || !f.start_date || !f.end_date) { setVac(null); return; }
    const t = setTimeout(() => {
      payrollApi.vacation(employee, { date: f.start_date, from: f.start_date, to: f.end_date })
        .then(setVac).catch(() => setVac(null));
    }, 200);
    return () => clearTimeout(t);
  }, [employee, f.kind, f.start_date, f.end_date]);

  const [kids, setKids] = useState([]);
  useEffect(() => {
    if (f.kind !== "paternity" && f.kind !== "childcare") return;
    payrollApi.employee(employee).then((e) => setKids(e.children || [])).catch(() => setKids([]));
  }, [employee, f.kind]);
  const sd12 = ["unpaid", "truancy", "suspension", "study", "civic"].includes(f.kind);
  const sd9 = f.kind === "paternity" || f.kind === "childcare";

  const over = vac?.balance != null && Number(vac.requested) > Number(vac.balance);
  const save = async () => {
    try { await payrollApi.createAbsence({ employee, ...f, status: "approved" }); onSaved(); }
    catch (e) { setError(apiError(e)); }
  };
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="lt">
    <Stack gap={2}>
      <FormControl fullWidth size="small">
        <InputLabel>Kas nutiko?</InputLabel>
        <Select label="Kas nutiko?" value={f.kind} MenuProps={MENU_PROPS} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          {Object.entries(ABSENCE_KINDS).filter(([k]) => k !== "vacation_prepaid")
            .map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
        </Select>
      </FormControl>
      <Stack direction="row" gap={2}>
        <DateF label="Nuo" value={f.start_date} fullWidth
          onChange={(v) => setF({ ...f, start_date: v, end_date: v > f.end_date ? v : f.end_date })} />
        <DateF label="Iki (imtinai)" value={f.end_date} fullWidth onChange={(v) => setF({ ...f, end_date: v })} />
      </Stack>
      {f.kind === "sick" && <Hint>Ligos pažymėjimus galima ir įkelti iš Sodros XML – tada nieko suvesti nereikia.</Hint>}
      {sd9 && (
        <FormControl fullWidth size="small">
          <InputLabel>Vaikas</InputLabel>
          <Select label="Vaikas" value={f.child || ""} MenuProps={MENU_PROPS} onChange={(e) => setF({ ...f, child: e.target.value || null })}>
            {kids.map((c) => <MenuItem key={c.id} value={c.id}>{c.first_name || "Vaikas"} ({c.birth_date})</MenuItem>)}
          </Select>
        </FormControl>
      )}
      {sd9 && kids.length === 0 && <Hint>Darbuotojo anketoje nėra vaikų – pridėkite vaiką (9-SD reikia vaiko gimimo datos).</Hint>}
      {f.kind === "childcare" && (
        <FormControl fullWidth size="small">
          <InputLabel>Kam suteikiamos</InputLabel>
          <Select label="Kam suteikiamos" value={f.sodra_reason || "02"} MenuProps={MENU_PROPS} onChange={(e) => setF({ ...f, sodra_reason: e.target.value })}>
            <MenuItem value="02">Tėvui arba motinai</MenuItem>
            <MenuItem value="07">Senelei arba seneliui (iki vaikui sueis 3 metai)</MenuItem>
          </Select>
        </FormControl>
      )}
      {sd12 && (
        <FormControl fullWidth size="small">
          <InputLabel>Priežastis Sodrai (12-SD)</InputLabel>
          <Select label="Priežastis Sodrai (12-SD)" value={f.sodra_reason || ""} MenuProps={MENU_PROPS} onChange={(e) => setF({ ...f, sodra_reason: e.target.value })}>
            <MenuItem value="">{["unpaid", "truancy", "suspension"].includes(f.kind) ? "Pagal rūšį (automatiškai)" : "Nepranešti – laikotarpis apmokamas"}</MenuItem>
            <MenuItem value="01">01 – nemokamos atostogos</MenuItem>
            <MenuItem value="02">02 – atostogos kvalifikacijai tobulinti</MenuItem>
            <MenuItem value="03">03 – kūrybinės atostogos</MenuItem>
            <MenuItem value="04">04 – mokymosi atostogos (neapmokamos)</MenuItem>
            <MenuItem value="05">05 – neatvykimas administracijos leidimu</MenuItem>
            <MenuItem value="08">08 – nušalinimas nuo darbo</MenuItem>
            <MenuItem value="09">09 – pravaikšta</MenuItem>
            <MenuItem value="10">10 – karo tarnyba</MenuItem>
          </Select>
        </FormControl>
      )}
      {(sd9 || (sd12 && (["unpaid", "truancy", "suspension"].includes(f.kind) || f.sodra_reason))) && (
        <Hint>
          Išsaugojus bus paruoštas {sd9 ? "9-SD" : "12-SD"} pranešimas Sodrai (skiltis „Deklaracijos“) – jį reikia pateikti
          ne vėliau kaip kitą darbo dieną{["truancy", "suspension"].includes(f.kind) ? " po laikotarpio pabaigos" : ""}.
        </Hint>
      )}
      {vac?.balance != null && !over && (
        <Hint>Priklauso {days(vac.balance)}, prašoma {days(vac.requested)}. Po atostogų liks {days(Number(vac.balance) - Number(vac.requested))}</Hint>
      )}
      {over && (
        <Alert severity="warning">
          Darbuotojas turi tik {days(vac.balance)}, o prašoma {days(vac.requested)}. Suteikti daugiau galima, jei susitarėte –
          atleidžiant pereikvotos dienos bus išskaičiuotos.
        </Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" gap={1}>
        <Button variant="contained" size="small" color={over ? "warning" : "primary"} onClick={save} disabled={!f.start_date || !f.end_date}>
          {over ? "Vis tiek suteikti" : "Išsaugoti"}
        </Button>
        {onCancel && <Button size="small" onClick={onCancel}>Atšaukti</Button>}
      </Stack>
    </Stack>
    </LocalizationProvider>
  );
}

// Atostogos ir nebuvimai: tik peržiūra. Nebuvimai įvedami Faktas (tabelyje) arba per darbuotojo prašymus.
const STAT_PERIODS = [[1, "1 mėn."], [3, "3 mėn."], [12, "12 mėn."]];
const DAY_MS = 86400000;
const dOf = (s) => new Date(`${s}T00:00:00`);
const signed = (v) => (Number(v) > 0 ? `+${toComma(Number(v))}` : toComma(Number(v)));

function AbsencesTab({ emp, vac, onChanged }) {
  const [rows, setRows] = useState(null);
  const [period, setPeriod] = useState(3);
  const [fix, setFix] = useState(null);             // {mode: "adjust"|"set", date, days, reason, balance}
  const [showHist, setShowHist] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => payrollApi.absences({ employee: emp.id })
    .then((r) => setRows(Array.isArray(r) ? r : r.results || [])).catch(() => setRows([])), [emp.id]);
  useEffect(() => { load(); }, [load]);

  const saveFix = async () => {
    const body = fix.mode === "set"
      ? { date: fix.date, balance: toDot(fix.balance) }
      : { date: fix.date, days: toDot(fix.days), reason: fix.reason };
    try { await payrollApi.setVacationBalance(emp.id, body); setFix(null); setError(""); onChanged?.(); }
    catch (e) { setError(apiError(e)); }
  };
  const fixOk = fix && fix.date && (fix.mode === "set"
    ? fix.balance !== ""
    : fix.days !== "" && Number(toDot(fix.days)) !== 0 && fix.reason.trim());

  const bal = vac?.balance != null ? Number(vac.balance) : null;
  const tiles = vac ? [
    ["Sukaupta", days(vac.accrued), "#101828"],
    ["Panaudota", days(vac.used), "#101828"],
    ["Korekcijos", Number(vac.adjustments) ? signed(vac.adjustments) + " d." : "–", "#101828"],
    ["Likutis", days(vac.balance), bal < 0 ? "#B42318" : "#027A48"],
  ] : [];
  const ent = vac?.entitlement;
  const hist = vac?.history || [];

  // statistika: kalendorinės dienos (ir darbo dienos proporcingai) per pasirinktą laikotarpį
  const stats = useMemo(() => {
    if (!rows) return [];
    const to = dOf(today());
    const from = new Date(to); from.setMonth(from.getMonth() - period); from.setDate(from.getDate() + 1);
    const by = {};
    rows.forEach((a) => {
      if (a.status && a.status !== "approved") return;
      const s = dOf(a.start_date); const e = dOf(a.end_date || a.start_date);
      const lo = s > from ? s : from; const hi = e < to ? e : to;
      if (hi < lo) return;
      const cal = Math.round((hi - lo) / DAY_MS) + 1;
      const total = Math.round((e - s) / DAY_MS) + 1;
      const wd = Number(a.work_days) ? Number(a.work_days) * cal / total : null;
      const k = a.kind === "vacation_prepaid" ? "vacation" : a.kind;
      const x = by[k] || (by[k] = { kind: k, times: 0, cal: 0, wd: 0, hasWd: false });
      x.times += 1; x.cal += cal;
      if (wd != null) { x.wd += wd; x.hasWd = true; }
    });
    return Object.values(by).sort((a, b) => b.cal - a.cal);
  }, [rows, period]);

  const recent = useMemo(() => (rows || []).slice().sort((a, b) => b.start_date.localeCompare(a.start_date)).slice(0, 8), [rows]);

  return (
    <Stack gap={2}>
      {vac && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, minmax(0,1fr))" }, gap: 1.5 }}>
          {tiles.map(([l, v, c], i) => (
            <Box key={l} sx={{ ...CARD_SX, p: 1.75, ...(i === 3 ? { bgcolor: bal < 0 ? "#FEF3F2" : "#ECFDF3", borderColor: "transparent" } : {}) }}>
              <Typography sx={{ fontSize: 12, color: "#667085" }}>{l}</Typography>
              <Typography sx={{ fontSize: 20, fontWeight: 600, color: c, mt: .25 }}>{v}</Typography>
            </Box>
          ))}
        </Box>
      )}

      <Section title="Kasmetinės atostogos"
        desc={ent ? `Priklauso ${ent.total} d. d. per metus` + (ent.parts?.length > 1 ? ` (${ent.parts.map((p) => `${p.days} – ${p.reason}`).join("; ")})` : "") : "Likutis skaičiuojamas automatiškai"}
        action={!fix && vac?.balance != null && (
          <Button size="small" startIcon={<EditOutlinedIcon />} sx={{ ...BTN_SX, fontWeight: 500, color: "#475467" }}
            onClick={() => setFix({ mode: "adjust", date: today(), days: "", reason: "", balance: "" })}>Koreguoti likutį</Button>
        )}>
        {vac?.balance == null && <Typography sx={{ fontSize: 13, color: "#667085" }}>Likutis bus skaičiuojamas, kai darbuotojas turės darbo sutartį.</Typography>}
        {fix && (
          <Box sx={{ p: 2, borderRadius: 2, bgcolor: "#F8FAFC", border: "1px solid #EAECF0", maxWidth: 600 }}>
            <ToggleButtonGroup size="small" exclusive value={fix.mode} onChange={(_, v) => v && setFix({ ...fix, mode: v })}
              sx={{ mb: 1.5, "& .MuiToggleButton-root": { textTransform: "none", px: 1.5, py: .4, fontSize: 13 } }}>
              <ToggleButton value="adjust">Pridėti / atimti dienas</ToggleButton>
              <ToggleButton value="set">Nustatyti likutį</ToggleButton>
            </ToggleButtonGroup>
            <Typography sx={{ fontSize: 12.5, color: "#667085", mb: 1.5 }}>
              {fix.mode === "adjust"
                ? "Pvz. +2 – susitarta dėl papildomų dienų, −1 – pataisoma klaida. Neigiamą skaičių rašykite su minusu."
                : "Perkeliant iš kitos programos: kiek dienų darbuotojui priklauso nurodytą dieną. Skirtumas įrašomas kaip korekcija."}
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}>
              <DateF label="Data" value={fix.date} onChange={(v) => setFix({ ...fix, date: v })} />
              {fix.mode === "adjust" ? (
                <>
                  <TextField size="small" label="Dienos (+/−)" value={fix.days} sx={{ width: { sm: 130 } }} autoFocus
                    inputProps={{ inputMode: "decimal" }} onChange={(e) => setFix({ ...fix, days: cleanNum(e.target.value) })} />
                  <TextField size="small" label="Priežastis" value={fix.reason} sx={{ flex: 1 }}
                    onChange={(e) => setFix({ ...fix, reason: e.target.value })} />
                </>
              ) : (
                <TextField size="small" label="Priklauso dienų" value={fix.balance} autoFocus inputProps={{ inputMode: "decimal" }}
                  onChange={(e) => setFix({ ...fix, balance: cleanNum(e.target.value) })} />
              )}
            </Stack>
            {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
            <Stack direction="row" gap={1} mt={1.5}>
              <Button variant="contained" size="small" disabled={!fixOk} onClick={saveFix} sx={BTN_SX}>Išsaugoti</Button>
              <Button size="small" onClick={() => { setFix(null); setError(""); }} sx={{ ...BTN_SX, fontWeight: 500 }}>Atšaukti</Button>
            </Stack>
          </Box>
        )}
        {hist.length > 0 && (
          <Box>
            <Button size="small" onClick={() => setShowHist(!showHist)} sx={{ textTransform: "none", px: 0, color: "#475467" }}>
              {showHist ? "Slėpti korekcijas" : `Korekcijų istorija (${hist.length})`}
            </Button>
            <Collapse in={showHist}>
              <Stack>
                {hist.map((h, i) => (
                  <Stack key={h.id} direction="row" gap={1.5} alignItems="center" sx={{ py: .9, borderTop: i ? "1px solid #F2F4F7" : 0 }}>
                    <Typography sx={{ fontSize: 13, color: "#667085", width: 90, flexShrink: 0 }}>{h.date}</Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, width: 70, flexShrink: 0, color: Number(h.days) < 0 ? "#B42318" : "#027A48" }}>
                      {signed(h.days)} d.
                    </Typography>
                    <Typography noWrap sx={{ fontSize: 13, color: "#101828", minWidth: 0 }}>{h.reason || "–"}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Collapse>
          </Box>
        )}
      </Section>

      <Section title="Nebuvimų statistika" desc="Patvirtinti nebuvimai per pasirinktą laikotarpį"
        action={(
          <ToggleButtonGroup size="small" exclusive value={period} onChange={(_, v) => v && setPeriod(v)}
            sx={{ "& .MuiToggleButton-root": { textTransform: "none", px: 1.25, py: .3, fontSize: 12.5 } }}>
            {STAT_PERIODS.map(([v, l]) => <ToggleButton key={v} value={v}>{l}</ToggleButton>)}
          </ToggleButtonGroup>
        )}>
        {rows === null ? <Skeleton variant="rounded" height={60} /> : stats.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: "#667085" }}>Per šį laikotarpį nebuvimų nėra.</Typography>
        ) : (
          <Stack>
            {stats.map((x, i) => {
              const k = ABSENCE_KINDS[x.kind] || {};
              return (
                <Stack key={x.kind} direction="row" alignItems="center" gap={1.5} sx={{ py: .9, borderTop: i ? "1px solid #F2F4F7" : 0 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: k.color || "#98A2B3", flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 13.5, color: "#101828", flex: 1, minWidth: 0 }} noWrap>{k.label || x.kind}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: "#667085", whiteSpace: "nowrap" }}>{x.times} k.</Typography>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: "#101828", whiteSpace: "nowrap", minWidth: 120, textAlign: "right" }}>
                    {x.cal} kal. d.{x.hasWd ? <span style={{ fontWeight: 400, color: "#667085" }}> · {num(x.wd)} d. d.</span> : null}
                  </Typography>
                </Stack>
              );
            })}
          </Stack>
        )}
      </Section>

      <Section title="Paskutiniai nebuvimai" desc="Įvedami grafike / tabelyje arba per darbuotojo prašymus – čia tik peržiūra">
        {rows === null ? <Skeleton variant="rounded" height={80} /> : recent.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: "#667085" }}>Įrašų dar nėra.</Typography>
        ) : (
          <Stack>
            {recent.map((a, i) => {
              const k = ABSENCE_KINDS[a.kind] || {};
              return (
                <Stack key={a.id} direction="row" alignItems="center" gap={1.5} sx={{ py: 1.1, borderTop: i ? "1px solid #F2F4F7" : 0 }}>
                  <Box sx={{ width: 34, height: 34, borderRadius: 2, bgcolor: k.color || "#98A2B3", color: "#FFFFFF", fontSize: 11.5, fontWeight: 600,
                    display: "grid", placeItems: "center", flexShrink: 0 }}>{k.short || "?"}</Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: "#101828" }}>{k.label || a.kind}</Typography>
                    <Typography noWrap sx={{ fontSize: 12, color: "#667085" }}>
                      {a.start_date === a.end_date ? a.start_date : `${a.start_date} – ${a.end_date}`}
                      {Number(a.work_days) ? ` · ${toComma(Number(a.work_days))} d. d.` : ""}{a.comment ? ` · ${a.comment}` : ""}
                    </Typography>
                  </Box>
                  <Button size="small" endIcon={<ChevronRightIcon />} component={RouterLink}
                    to={`/grafikai-ir-tabeliai/tabelis?m=${a.start_date.slice(0, 7)}`}
                    sx={{ textTransform: "none", color: "#475467", whiteSpace: "nowrap" }}>Atidaryti tabelyje</Button>
                </Stack>
              );
            })}
          </Stack>
        )}
      </Section>
    </Stack>
  );
}

const ageOf = (bd) => {
  if (!bd) return "";
  const b = new Date(bd);
  const n = new Date();
  let y = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) y -= 1;
  return y < 1 ? `${Math.max(0, (n.getFullYear() - b.getFullYear()) * 12 + n.getMonth() - b.getMonth())} mėn.` : `${y} m.`;
};

function ChildrenTab({ emp, onChanged }) {
  const [f, setF] = useState({ first_name: "", birth_date: "", has_disability: false });
  const [error, setError] = useState("");
  const add = async () => {
    try { await payrollApi.createChild({ employee: emp.id, ...f }); setF({ first_name: "", birth_date: "", has_disability: false }); setError(""); onChanged(); }
    catch (e) { setError(apiError(e)); }
  };
  const kids = emp.children || [];
  const age = (c) => (Date.now() - new Date(c.birth_date)) / 31557600000;
  const under12 = kids.filter((c) => age(c) < 12).length;
  const disabled = kids.filter((c) => c.has_disability && age(c) < 18).length;
  // DK 138 str. 3 d.: 1 vaikas iki 12 m. - 1 d. per 3 mėn.; 2 vaikai iki 12 m. arba vaikas su negalia iki 18 m. - 1 d. per mėn.;
  // 3 ir daugiau vaikų iki 12 m. arba 2 vaikai su negalia iki 18 m. - 2 d. per mėn.
  const parentDays = under12 >= 3 || disabled >= 2 ? "2 papildomos poilsio dienos per mėnesį"
    : under12 === 2 || disabled === 1 ? "1 papildoma poilsio diena per mėnesį"
      : under12 === 1 ? "1 papildoma poilsio diena per 3 mėnesius" : "";
  return (
    <Stack gap={2}>
      {kids.length > 0 && (
        <Box sx={{ ...CARD_SX, bgcolor: "#FDF2F8", borderColor: "transparent" }}>
          <Typography sx={{ fontSize: 13.5, color: "#831843" }}>
            {parentDays ? <>Priklauso <b style={{ fontWeight: 600 }}>{parentDays}</b> (mamadieniai / tėvadieniai).</>
              : "Mamadieniai / tėvadieniai nepriklauso – vaikai vyresni nei 12 m."}
          </Typography>
          <Typography sx={{ fontSize: 12, color: "#9D174D", mt: .3 }}>Pagal DK 138 str. 3 d. – sistema tai įvertina automatiškai.</Typography>
        </Box>
      )}
      <Section title="Vaikai" desc="Reikalingi mamadieniams / tėvadieniams, papildomoms atostogoms ir 9-SD">
        {kids.length === 0 && <Typography sx={{ fontSize: 13, color: "#667085" }}>Vaikų nenurodyta.</Typography>}
        {kids.map((c) => (
          <Stack key={c.id} direction="row" alignItems="center" gap={1.5} sx={{ py: .75 }}>
            <Avatar sx={{ width: 34, height: 34, bgcolor: "#FCE7F3", color: "#BE185D" }}><ChildCareOutlinedIcon sx={{ fontSize: 19 }} /></Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{c.first_name || "Vaikas"}{c.has_disability ? " · su negalia" : ""}</Typography>
              <Typography sx={{ fontSize: 12, color: "#667085" }}>gim. {c.birth_date} · {ageOf(c.birth_date)}</Typography>
            </Box>
            <IconButton size="small" onClick={() => window.confirm("Ištrinti vaiką iš darbuotojo duomenų?") && payrollApi.deleteChild(c.id).then(onChanged)}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}
        <Divider />
        <Stack direction={{ xs: "column", sm: "row" }} gap={1.5} alignItems={{ sm: "center" }}>
          <TextField size="small" label="Vardas (nebūtina)" value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} />
          <DateF label="Gimimo data" value={f.birth_date} onChange={(v) => setF({ ...f, birth_date: v })} />
          <FormControlLabel control={<Checkbox size="small" checked={f.has_disability} onChange={(e) => setF({ ...f, has_disability: e.target.checked })} />}
            label={<Typography sx={{ fontSize: 13.5 }}>Su negalia</Typography>} />
          <Button variant="outlined" onClick={add} disabled={!f.birth_date} startIcon={<AddIcon />} sx={{ ...BTN_SX, fontWeight: 500 }}>Pridėti</Button>
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
      </Section>
    </Stack>
  );
}
