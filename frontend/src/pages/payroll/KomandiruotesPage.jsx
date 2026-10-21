import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControlLabel, IconButton, InputAdornment, MenuItem, Radio, RadioGroup, Stack, Table, TableBody, TableCell,
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
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";

import { DatePicker, DateTimePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import "dayjs/locale/lt";

import { MONTHS, apiError, money, payrollApi } from "../../api/payroll";

const dt = (v) => (v ? dayjs(v) : null);

const LT = "Lietuvos Respublika";

function openHtml(html) {
  const w = window.open("", "_blank");
  if (!w) return;
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

// Šalies vėliavą gauname pagal ISO kodą. Intl.DisplayNames atpažįsta CLDR lietuviškus
// valstybių pavadinimus, o papildomi sinonimai padengia oficialius normų sąrašo pavadinimus.
const COUNTRY_ALIASES = {
  "lietuvos respublika": "LT", "latvijos respublika": "LV", "estijos respublika": "EE",
  "lenkijos respublika": "PL", "vokietijos federacine respublika": "DE", "vokietija": "DE",
  "prancuzijos respublika": "FR", "italijos respublika": "IT", "ispanijos karalyste": "ES",
  "jungtine karalyste": "GB", "didzioji britanija": "GB", "didziosios britanijos ir siaures airijos jungtine karalyste": "GB",
  "jungtines amerikos valstijos": "US", "jav": "US", "amerika": "US", "rusijos federacija": "RU",
  "cekijos respublika": "CZ", "cekija": "CZ", "slovakijos respublika": "SK", "austrijos respublika": "AT",
  "suomijos respublika": "FI", "svedijos karalyste": "SE", "norvegijos karalyste": "NO",
  "danijos karalyste": "DK", "nyderlandu karalyste": "NL", "olandija": "NL",
  "belgijos karalyste": "BE", "liuksemburgo didzioji hercogyste": "LU", "sveicarijos konfederacija": "CH",
  "airijos respublika": "IE", "graikijos respublika": "GR", "portugalijos respublika": "PT",
  "kroatijos respublika": "HR", "slovenijos respublika": "SI", "vengrija": "HU",
  "rumunija": "RO", "bulgarijos respublika": "BG", "serbijos respublika": "RS",
  "juodkalnija": "ME", "siaures makedonija": "MK", "bosnija ir hercegovina": "BA",
  "turkijos respublika": "TR", "ukraina": "UA", "baltarusijos respublika": "BY",
  "moldovos respublika": "MD", "sakartvelas": "GE", "gruzija": "GE",
  "kinijos liaudies respublika": "CN", "japonija": "JP", "pietu koreja": "KR",
  "jungtiniai arabu emyratai": "AE", "saudo arabijos karalyste": "SA",
  "kanada": "CA", "meksikos jungtines valstijos": "MX", "brazilijos federacine respublika": "BR",
  "australijos sandrauga": "AU", "naujoji zelandija": "NZ", "islandijos respublika": "IS",
  "kipro respublika": "CY", "maltos respublika": "MT", "izraelio valstybe": "IL",
  "tailandas": "TH", "indonezijos respublika": "ID", "indijos respublika": "IN",
  "egipto arab u respublika": "EG", "maroko karalyste": "MA", "pietu afrikos respublika": "ZA",
  "kosovas": "XK", "vatikanas": "VA", "san marinas": "SM", "monakas": "MC",
};
const normalizeCountry = (value) => String(value || "").toLocaleLowerCase("lt-LT")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();
const COUNTRY_CODES = (() => {
  const byName = new Map(Object.entries(COUNTRY_ALIASES));
  if (typeof Intl.DisplayNames === "function") {
    const names = new Intl.DisplayNames(["lt"], { type: "region" });
    for (let a = 65; a <= 90; a += 1) for (let b = 65; b <= 90; b += 1) {
      const code = String.fromCharCode(a, b);
      const name = names.of(code);
      if (name && name !== code) byName.set(normalizeCountry(name), code);
    }
  }
  return byName;
})();
const flagCode = (country) => COUNTRY_CODES.get(normalizeCountry(country)) || null;
const cleanCountry = (name) => ({ "Lietuvos Respublika": "Lietuva", "Lenkijos Respublika": "Lenkija",
  "Vokietijos Federacinė Respublika": "Vokietija", "Prancūzijos Respublika": "Prancūzija" }[name] || name);
function CountryFlag({ country, size = 23 }) {
  const code = flagCode(country);
  return (
    <Box sx={{ position: "relative", width: size, height: Math.round(size * .72), flexShrink: 0, display: "inline-flex",
      alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: .55,
      bgcolor: "#F3F6FA", border: "1px solid #E4E7EC" }}>
      <PublicOutlinedIcon sx={{ fontSize: size * .75, color: "#94A3B8" }} />
      {code && <Box component="img" src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`} alt=""
        loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }}
        sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
    </Box>
  );
}

const sectionSx = { border: "1px solid #E6EBF2", borderRadius: 2.5, bgcolor: "#FFFFFF", px: { xs: 1.75, sm: 2.4 }, py: 2.2 };
function TripSection({ icon, title, subtitle, children }) {
  return (
    <Box sx={sectionSx}>
      <Stack direction="row" alignItems="flex-start" spacing={1.1} sx={{ mb: 2.1 }}>
        <Box sx={{ height: 32, width: 32, borderRadius: 1.6, bgcolor: "#EEF4FF", color: "#285ACB",
          display: "grid", placeItems: "center", flexShrink: 0 }}>{icon}</Box>
        <Box>
          <Typography sx={{ fontSize: 15, fontWeight: 750, color: "#15223A", lineHeight: 1.35 }}>{title}</Typography>
          {subtitle && <Typography sx={{ mt: .28, fontSize: 12, color: "#728096" }}>{subtitle}</Typography>}
        </Box>
      </Stack>
      {children}
    </Box>
  );
}
function AutoDate({ label, value, hint }) {
  return (
    <Tooltip title={`Apskaičiuojama automatiškai: ${hint}`} arrow>
      <Box sx={{ minWidth: 0, px: 1.25, py: 1, bgcolor: "#F6F8FB", border: "1px solid #E9EDF3",
        borderRadius: 1.6, height: 55, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <Typography sx={{ fontSize: 10.5, color: "#8A96A8" }}>{label} · automatiškai</Typography>
        <Typography sx={{ fontSize: 13, fontWeight: 650, color: "#4B5870" }}>{value || "–"}</Typography>
      </Box>
    </Tooltip>
  );
}

// Šiuos pranešimus pateikia backend tripPreview.conflicts. Privalomas sprendimas
// nuo laukiančio prašymo atskirtas ir spalva, ir konkrečia tolesne instrukcija.
function ConflictsBox({ conflicts, agree, onAgree, checking, checkError, employee, onRetry }) {
  if (!employee) return (
    <Box sx={{ p: 1.6, border: "1px dashed #D9E1ED", borderRadius: 2, bgcolor: "#F8FAFD",
      display: "flex", gap: 1, alignItems: "center" }}>
      <InfoOutlinedIcon sx={{ fontSize: 19, color: "#7891B8" }} />
      <Typography sx={{ fontSize: 12.5, color: "#64748B" }}>Pasirinkus darbuotoją, bus patikrinti jo nebuvimai pasirinktose datose.</Typography>
    </Box>
  );
  if (checking) return (
    <Stack direction="row" spacing={1.2} alignItems="center" sx={{ p: 1.65, bgcolor: "#F4F7FC", borderRadius: 2 }}>
      <CircularProgress size={16} /><Typography sx={{ fontSize: 12.5, color: "#52647B" }}>Tikrinami darbuotojo nebuvimai ir skaičiuojama komandiruotė…</Typography>
    </Stack>
  );
  if (checkError) return <Alert severity="error" sx={{ borderRadius: 2 }}
    action={<Button size="small" color="inherit" onClick={onRetry} sx={{ textTransform: "none", fontWeight: 750 }}>Bandyti dar kartą</Button>}>
    Nepavyko patikrinti nebuvimų: {checkError}.
  </Alert>;
  if (!conflicts) return null;
  const { block = [], resolve = [], pending = [] } = conflicts;
  if (!block.length && !resolve.length && !pending.length) return (
    <Stack direction="row" spacing={1.1} alignItems="center" sx={{ p: 1.4, border: "1px solid #CDECDD", borderRadius: 2, bgcolor: "#F2FBF6" }}>
      <CheckCircleOutlineIcon sx={{ fontSize: 20, color: "#12815C" }} />
      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#116444" }}>Nebuvimų konfliktų nerasta</Typography>
        <Typography sx={{ fontSize: 11.5, color: "#3D7C64" }}>Patikrintos pasirinkto darbuotojo komandiruotės datos.</Typography>
      </Box>
    </Stack>
  );
  const ConflictItem = ({ x, accent, keyPrefix }) => (
    <Box key={`${keyPrefix}-${x.id || `${x.start}-${x.end}`}`} sx={{ py: .9, borderTop: `1px solid ${accent === "red" ? "#F5CDCA" : accent === "amber" ? "#F9E2AF" : "#E5EAF1"}` }}>
      <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
        <Typography sx={{ fontWeight: 750, fontSize: 13.2, color: "#273449" }}>{x.label || "Nebuvimas"}</Typography>
        <Chip size="small" label={rng(x.start, x.end)} sx={{ height: 22, borderRadius: 1.2, fontSize: 11, bgcolor: "#FFFFFF", color: "#4D5E74" }} />
      </Stack>
      {(x.reason || x.result) && <Typography sx={{ fontSize: 12.5, mt: .4, color: "#475569" }}>{x.reason || x.result}</Typography>}
      {x.note && <Typography sx={{ fontSize: 12, mt: .4, color: "#66758A" }}>{x.note}</Typography>}
    </Box>
  );
  return (
    <Stack gap={1.15}>
      {block.length > 0 && (
        <Box sx={{ bgcolor: "#FFF6F5", border: "1px solid #F4C5C2", borderLeft: "4px solid #D92D20", borderRadius: 2, px: 1.8, py: 1.5 }}>
          <Stack direction="row" gap={.85} alignItems="center" sx={{ mb: .6 }}>
            <BlockIcon sx={{ color: "#C32D26", fontSize: 20 }} />
            <Typography sx={{ fontWeight: 800, fontSize: 13.5, color: "#A5221C" }}>Negalima patvirtinti · {block.length} {block.length === 1 ? "konfliktas" : "konfliktai"}</Typography>
          </Stack>
          <Typography sx={{ fontSize: 12.5, color: "#8F3630", mb: .9 }}>Darbuotojas šiomis dienomis negali būti siunčiamas į komandiruotę. Pakeiskite datas arba išspręskite nebuvimo priežastį.</Typography>
          {block.map((x) => <ConflictItem key={x.id || `${x.start}-${x.end}`} x={x} accent="red" keyPrefix="block" />)}
        </Box>
      )}
      {resolve.length > 0 && (
        <Box sx={{ bgcolor: "#FFFBF2", border: "1px solid #F4D99E", borderLeft: "4px solid #E4A02B", borderRadius: 2, px: 1.8, py: 1.5 }}>
          <Stack direction="row" gap={.85} alignItems="center" sx={{ mb: .6 }}>
            <EventBusyOutlinedIcon sx={{ color: "#C57C10", fontSize: 20 }} />
            <Typography sx={{ fontWeight: 800, fontSize: 13.5, color: "#935A10" }}>Reikalingas darbuotojo sutikimas · {resolve.length}</Typography>
          </Stack>
          <Typography sx={{ fontSize: 12.5, color: "#855E27", mb: .9 }}>Patvirtinus komandiruotę šie nebuvimai bus pakeisti taip, kaip nurodyta žemiau.</Typography>
          {resolve.map((x) => <ConflictItem key={x.id || `${x.start}-${x.end}`} x={x} accent="amber" keyPrefix="resolve" />)}
          <Box sx={{ mt: 1.2, px: 1.25, py: .8, borderRadius: 1.6, bgcolor: "#FFFFFF", border: `1px solid ${agree ? "#A4D8BC" : "#E9CC94"}` }}>
            <FormControlLabel sx={{ ml: 0, mr: 0, alignItems: "flex-start" }}
              control={<Checkbox size="small" checked={agree} onChange={(e) => onAgree(e.target.checked)} sx={{ p: .5, mr: .5, mt: -.1 }} />}
              label={<Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "#704C20", pt: .2 }}>Patvirtinu, kad darbuotojas sutinka su nurodytu nebuvimų sutrumpinimu / atšaukimu</Typography>} />
          </Box>
          <Typography sx={{ mt: .8, fontSize: 11.5, color: "#936D38" }}>Atšaukus komandiruotę ankstesni nebuvimai automatiškai neatkuriami.</Typography>
        </Box>
      )}
      {pending.length > 0 && (
        <Box sx={{ bgcolor: "#F7F9FC", border: "1px solid #E0E6EF", borderLeft: "4px solid #92A4BF", borderRadius: 2, px: 1.8, py: 1.5 }}>
          <Stack direction="row" gap={.85} alignItems="center" sx={{ mb: .5 }}>
            <HourglassEmptyOutlinedIcon sx={{ color: "#52647B", fontSize: 19 }} />
            <Typography sx={{ fontWeight: 750, fontSize: 13.3, color: "#475569" }}>Laukiantys prašymai · {pending.length}</Typography>
          </Stack>
          <Typography sx={{ color: "#66758A", fontSize: 12.2, mb: .7 }}>Prašymai dar nepatvirtinti – patikrinkite prieš komandiruotę.</Typography>
          {pending.map((x) => <ConflictItem key={x.id || `${x.start}-${x.end}`} x={x} accent="gray" keyPrefix="pending" />)}
        </Box>
      )}
    </Stack>
  );
}

function TripDialog({ open, trip, onClose, onSaved, employees, norms }) {
  const [f, setF] = useState(emptyTrip());
  const [pre, setPre] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState("");
  const [retryPreview, setRetryPreview] = useState(0);
  const [showDays, setShowDays] = useState(false);
  const [showAllowance, setShowAllowance] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(""); setPre(null); setPreviewLoading(true); setPreviewError("");
    setAgree(false); setShowDays(false); setShowAllowance(false); setShowInfo(false);
    setF(trip ? { ...emptyTrip(), ...trip,
      start_at: trip.start_at.slice(0, 16), end_at: trip.end_at.slice(0, 16),
      per_diem_pct: String(Math.round(Number(trip.per_diem_pct))),
      advance_pct: String(Math.round(Number(trip.advance_pct))),
      travel_out_hours: comma(trip.travel_out_hours), travel_back_hours: comma(trip.travel_back_hours),
      day_edits: trip.day_edits || {},
    } : emptyTrip());
  }, [open, trip]);

  // Naujai pasirinkus darbuotoją ar pasikeitus maršrutui, sutikimą reikia duoti iš naujo.
  useEffect(() => { setAgree(false); }, [f.employee, f.start_at, f.end_at, f.legs]);

  // Neleisti, kad senos užklausos atsakymas paslėptų naujas nebuvimų problemas.
  useEffect(() => {
    if (!open) return undefined;
    let current = true;
    setPre(null); setPreviewLoading(true); setPreviewError("");
    const timer = setTimeout(() => {
      payrollApi.tripPreview({ legs: f.legs, start_at: f.start_at, end_at: f.end_at,
        per_diem_pct: f.per_diem_pct, employee: f.employee || null,
        travel_out_hours: dot(f.travel_out_hours) || 0,
        travel_back_hours: dot(f.travel_back_hours) || 0, day_edits: f.day_edits || {} })
        .then((response) => { if (current) { setPre(response); setPreviewLoading(false); } })
        .catch((err) => { if (current) { setPre(null); setPreviewLoading(false); setPreviewError(apiError(err)); } });
    }, 320);
    return () => { current = false; clearTimeout(timer); };
  }, [open, f.legs, f.start_at, f.end_at, f.per_diem_pct, f.employee,
    f.travel_out_hours, f.travel_back_hours, f.day_edits, retryPreview]);

  const editDay = (date, key, value) => setF((s) => {
    const row = (pre?.plan || []).find((r) => r.date === date) || {};
    const cur = s.day_edits?.[date] || { travel: row.travel, work: row.work };
    return { ...s, day_edits: { ...(s.day_edits || {}), [date]: { ...cur, [key]: dot(value) || 0 } } };
  });
  const setLeg = (i, v) => setF((s) => ({ ...s,
    legs: chainLegs(s.legs.map((l, j) => j === i ? { ...l, ...v } : l), s.start_at, s.end_at) }));
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
  const removeLeg = (i) => setF((s) => ({ ...s,
    legs: chainLegs(s.legs.filter((_, j) => j !== i), s.start_at, s.end_at) }));
  const legErr = legsError(f.legs, f.start_at, f.end_at);
  const blocked = (pre?.conflicts?.block || []).length > 0;
  const needAgree = (pre?.conflicts?.resolve || []).length > 0 && !agree;
  const hasPreviewErrors = (pre?.errors || []).length > 0;
  const pctInvalid = f.per_diem_pct === "" || Number(f.per_diem_pct) < 50 || Number(f.per_diem_pct) > 100;
  const dateInvalid = !dayjs(f.start_at).isValid() || !dayjs(f.end_at).isValid() || f.end_at < f.start_at;
  const canApprove = !busy && !!f.employee && !legErr && !dateInvalid && !pctInvalid &&
    !!pre && !previewLoading && !previewError && !hasPreviewErrors && !blocked && !needAgree;
  const daysCount = Math.max(0, dayjs(f.end_at.slice(0, 10)).diff(dayjs(f.start_at.slice(0, 10)), "day") + 1) || 0;
  const previewTotal = pre && !hasPreviewErrors ? Number(pre.total) : null;
  const advanceAmount = previewTotal === null ? null : Math.round(previewTotal * (Number(f.advance_pct) || 0)) / 100;
  const checkLabel = !f.employee ? "Pasirinkite darbuotoją" : previewLoading ? "Tikrinama…"
    : previewError ? "Patikra nepavyko" : blocked || hasPreviewErrors || legErr || dateInvalid || pctInvalid ? "Negalima patvirtinti"
      : needAgree ? "Reikia sutikimo" : (pre?.conflicts?.pending || []).length > 0 ? "Yra laukiančių prašymų" : "Patikra atlikta";
  const checkColor = !f.employee || previewLoading ? { fg: "#536785", bg: "#EFF3F8" }
    : previewError || blocked || hasPreviewErrors || legErr || dateInvalid || pctInvalid ? { fg: "#B42318", bg: "#FEF0EF" }
      : needAgree || (pre?.conflicts?.pending || []).length > 0 ? { fg: "#956110", bg: "#FFF4DA" }
        : { fg: "#16734C", bg: "#E8F7EE" };
  const approveHint = !f.employee ? "Pasirinkite darbuotoją" : previewLoading ? "Palaukite, kol baigsis patikra"
    : previewError || !pre ? "Nepavyko patikrinti komandiruotės" : blocked ? "Yra komandiruotę blokuojančių nebuvimų"
      : needAgree ? "Patvirtinkite darbuotojo sutikimą" : hasPreviewErrors ? "Ištaisykite nurodytas klaidas"
        : legErr || dateInvalid ? "Patikrinkite maršruto datas" : pctInvalid ? "Dienpinigių dydis: 50–100 %" : "";

  const save = async (approve) => {
    if (approve && !canApprove) return;
    setBusy(true); setError("");
    try {
      const saved = await payrollApi.saveTrip({ ...f, employee: f.employee || null,
        legs: chainLegs(f.legs, f.start_at, f.end_at),
        per_diem_pct: Number(f.per_diem_pct) || 100, advance_pct: Number(f.advance_pct) || 0,
        travel_out_hours: dot(f.travel_out_hours) || 0, travel_back_hours: dot(f.travel_back_hours) || 0 });
      if (approve) await payrollApi.approveTrip(saved.id, { resolve_absences: agree });
      onSaved(); onClose();
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  };

  const rowFieldSx = { "& .MuiOutlinedInput-root": { bgcolor: "#FFFFFF", borderRadius: 1.75 }, "& .MuiInputLabel-root": { fontSize: 13.5 } };
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="lg" disableScrollLock
      PaperProps={{ sx: { width: "min(1100px, calc(100% - 24px))", maxHeight: "min(94vh, 960px)", borderRadius: 3.2,
        boxShadow: "0 26px 80px rgba(20,34,57,.20)", overflow: "hidden" } }}>
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="lt"
        localeText={{ okButtonLabel: "Gerai", cancelButtonLabel: "Atšaukti" }}>
        <DialogTitle sx={{ px: { xs: 2.2, sm: 3 }, py: 2.2, bgcolor: "#FFFFFF", borderBottom: "1px solid #E9EDF4" }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ width: 42, height: 42, borderRadius: 2, bgcolor: "#EAF1FF", color: "#225CD0",
              display: "grid", placeItems: "center" }}><FlightTakeoffIcon /></Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 20, fontWeight: 800, color: "#14233D" }}>
                {trip ? "Redaguoti komandiruotę" : "Nauja komandiruotė"}
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: "#718198", mt: .2 }}>
                Įveskite kelionės informaciją, patikrinkite nebuvimus ir apskaičiuokite dienpinigius.
              </Typography>
            </Box>
            <IconButton size="small" onClick={onClose} disabled={busy} aria-label="Uždaryti" sx={{ border: "1px solid #E8EDF4", borderRadius: 1.5 }}><CloseIcon fontSize="small" /></IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ p: "0 !important", bgcolor: "#F8FAFD" }}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", md: "minmax(0,1.6fr) minmax(285px,.88fr)" },
            alignItems: "start", gap: { xs: 0, md: 0 } }}>
            <Stack gap={2} sx={{ p: { xs: 1.5, sm: 2.5 }, minWidth: 0 }}>
              <TripSection title="Darbuotojas ir laikotarpis" subtitle="Pasirinkus darbuotoją ir datas iškart tikrinami galimi nebuvimai."
                icon={<CalendarMonthOutlinedIcon fontSize="small" />}>
                <Autocomplete options={employees} value={employees.find((e) => String(e.id) === String(f.employee)) || null}
                  getOptionLabel={(e) => e.full_name || `${e.first_name} ${e.last_name}`}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  onChange={(_, v) => setF((s) => ({ ...s, employee: v ? v.id : "" }))}
                  renderOption={(props, e) => <li {...props} key={e.id}>
                    <Stack sx={{ py: .3 }}>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 650 }}>{e.full_name || `${e.first_name} ${e.last_name}`}</Typography>
                      {e.position && <Typography sx={{ fontSize: 11.5, color: "#667085" }}>{e.position}</Typography>}
                    </Stack>
                  </li>}
                  renderInput={(p) => <TextField {...p} label="Darbuotojas" placeholder="Ieškoti pagal vardą ar pavardę" fullWidth sx={rowFieldSx} />} />
                <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
                  <DateTimePicker label="Išvykimas" value={dt(f.start_at)} ampm={false} format="YYYY-MM-DD HH:mm"
                    onChange={(v) => v && v.isValid() && setDates("start_at", v.format("YYYY-MM-DDTHH:mm"))}
                    slotProps={{ textField: { fullWidth: true, sx: rowFieldSx } }} />
                  <DateTimePicker label="Grįžimas" value={dt(f.end_at)} ampm={false} format="YYYY-MM-DD HH:mm"
                    onChange={(v) => v && v.isValid() && setDates("end_at", v.format("YYYY-MM-DDTHH:mm"))}
                    slotProps={{ textField: { fullWidth: true, sx: rowFieldSx } }} />
                </Box>
                {dateInvalid && <Alert severity="error" sx={{ mt: 1.5 }}>Grįžimas negali būti anksčiau už išvykimą.</Alert>}
                <Box sx={{ mt: 2 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 750, color: "#41516A", mb: .9 }}>Nebuvimų patikra</Typography>
                  <ConflictsBox employee={!!f.employee} conflicts={pre?.conflicts} agree={agree} onAgree={setAgree}
                    checking={previewLoading} checkError={previewError} onRetry={() => setRetryPreview((v) => v + 1)} />
                  {pre?.errors?.map((message, i) => <Alert key={`${message}-${i}`} severity="error" sx={{ mt: 1.15, borderRadius: 2 }}>{message}</Alert>)}
                </Box>
              </TripSection>

              <TripSection title="Maršrutas" subtitle="Kelios valstybės? Nurodykite pervykimo datą – kitas datas apskaičiuosime."
                icon={<PublicOutlinedIcon fontSize="small" />}>
                <Stack gap={1.2}>
                  {f.legs.map((leg, i) => (
                    <Box key={i} sx={{ border: "1px solid #E7ECF4", bgcolor: "#FBFCFE", borderRadius: 2, p: 1.3 }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Box sx={{ height: 23, width: 23, bgcolor: "#E9F0FE", color: "#2B5FCD", display: "grid", placeItems: "center",
                            borderRadius: 1.2, fontWeight: 750, fontSize: 11.5 }}>{i + 1}</Box>
                          <Typography sx={{ color: "#42516A", fontSize: 12.5, fontWeight: 750 }}>{i === 0 ? "Pirma valstybė" : "Kita valstybė"}</Typography>
                        </Stack>
                        {f.legs.length > 1 && <Tooltip title="Pašalinti valstybę"><IconButton size="small" aria-label="Pašalinti valstybę"
                          onClick={() => removeLeg(i)} sx={{ color: "#A44949" }}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>}
                      </Stack>
                      <Autocomplete fullWidth size="small" disableClearable
                        options={norms.map((n) => n.name).filter((n) => n !== f.legs[i - 1]?.country && n !== f.legs[i + 1]?.country)}
                        value={leg.country || null} onChange={(_, value) => setLeg(i, { country: value })}
                        renderOption={(props, option) => <li {...props} key={option}>
                          <Stack direction="row" spacing={1.1} alignItems="center" sx={{ width: "100%" }}>
                            <CountryFlag country={option} /><Typography sx={{ fontSize: 13, flex: 1 }}>{option}</Typography>
                            <Typography sx={{ fontSize: 12, color: "#667085" }}>{money(norms.find((n) => n.name === option)?.amount || 0)} / d.</Typography>
                          </Stack>
                        </li>}
                        renderInput={(params) => <TextField {...params} label="Valstybė"
                          InputProps={{ ...params.InputProps,
                            startAdornment: leg.country ? <Box sx={{ ml: .8, mr: .1, display: "flex" }}><CountryFlag country={leg.country} /></Box> : null }}
                          sx={rowFieldSx} />} />
                      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mt: 1.25 }}>
                        {i === 0 ? <AutoDate label="Nuo" value={leg.date_from} hint="išvykimo diena" />
                          : <DatePicker label="Nuo · pervykimo diena" value={dt(leg.date_from)} format="YYYY-MM-DD"
                            minDate={dt(f.legs[i - 1].date_from)} maxDate={dt(f.end_at.slice(0, 10))}
                            onChange={(v) => v && v.isValid() && setLeg(i, { date_from: v.format("YYYY-MM-DD") })}
                            slotProps={{ textField: { size: "small", fullWidth: true, sx: rowFieldSx } }} />}
                        <AutoDate label="Iki" value={leg.date_to}
                          hint={i === f.legs.length - 1 ? "grįžimo diena" : "iki kitos valstybės"} />
                      </Box>
                    </Box>
                  ))}
                  {legErr && <Alert severity="error" sx={{ borderRadius: 2 }}>{legErr}</Alert>}
                  <Button startIcon={<AddIcon />} variant="outlined" size="small" onClick={addLeg}
                    sx={{ alignSelf: "flex-start", textTransform: "none", borderRadius: 1.5, fontWeight: 700, mt: .3 }}>Pridėti valstybę</Button>
                </Stack>
              </TripSection>

              <TripSection title="Dienpinigiai ir kelionės laikas" subtitle="Pagrindiniai nustatymai ir faktinės kelionės valandos."
                icon={<PaymentsOutlinedIcon fontSize="small" />}>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
                  <TextField label="Dienpinigiai, % normos" value={f.per_diem_pct === "" ? "" : String(Math.round(Number(f.per_diem_pct)))}
                    inputProps={{ inputMode: "numeric" }} onChange={(e) => setF({ ...f, per_diem_pct: intOnly(e.target.value) })}
                    error={pctInvalid} helperText="50–100 %" sx={rowFieldSx}
                    InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} />
                  <TextField label="Avansas, %" value={f.advance_pct === "" ? "" : String(Math.round(Number(f.advance_pct)))}
                    inputProps={{ inputMode: "numeric" }} onChange={(e) => setF({ ...f, advance_pct: intOnly(e.target.value) })}
                    helperText="0–100 %" sx={rowFieldSx}
                    InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} />
                  <TextField label="Kelionė pirmyn" value={f.travel_out_hours}
                    onChange={(e) => setF({ ...f, travel_out_hours: cleanNum(e.target.value) })}
                    inputProps={{ inputMode: "decimal" }} helperText="Valandos į kelionės vietą" sx={rowFieldSx}
                    InputProps={{ endAdornment: <InputAdornment position="end">val.</InputAdornment> }} />
                  <TextField label="Kelionė atgal" value={f.travel_back_hours}
                    onChange={(e) => setF({ ...f, travel_back_hours: cleanNum(e.target.value) })}
                    inputProps={{ inputMode: "decimal" }} helperText="Valandos grįžtant" sx={rowFieldSx}
                    InputProps={{ endAdornment: <InputAdornment position="end">val.</InputAdornment> }} />
                </Box>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5, mt: 1.5 }}>
                  <TextField label="Miestas / įmonė (nebūtina)" value={f.destination}
                    onChange={(e) => setF({ ...f, destination: e.target.value })} sx={rowFieldSx} />
                  <TextField label="Tikslas (nebūtina)" value={f.purpose}
                    onChange={(e) => setF({ ...f, purpose: e.target.value })} sx={rowFieldSx} />
                </Box>
              </TripSection>

              {pre?.plan && (
                <TripSection title="Darbo laikas komandiruotėje" subtitle="Pagal grafiką priskirtas valandas galima patikslinti po dieną."
                  icon={<AccessTimeOutlinedIcon fontSize="small" />}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                    <Stack gap={.35}>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: "#233655" }}>
                        {comma(pre.plan_totals?.total)} val. iš viso
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: "#718198" }}>
                        Kelionė {comma(pre.plan_totals?.travel)} val. · Darbas {comma(pre.plan_totals?.work)} val.
                        {Number(pre.plan_totals?.comp_rest) > 0 ? ` · Kompensacinis poilsis ${comma(pre.plan_totals.comp_rest)} val.` : ""}
                      </Typography>
                    </Stack>
                    <Button size="small" endIcon={showDays ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      onClick={() => setShowDays((v) => !v)} sx={{ textTransform: "none", whiteSpace: "nowrap" }}>
                      {showDays ? "Suskleisti" : "Peržiūrėti dienas"}
                    </Button>
                  </Stack>
                  {!pre.roster_exists && <Alert severity="info" sx={{ mt: 1.5, borderRadius: 2, fontSize: 12.5 }}>
                    Grafikas dar nesudarytas – valandos priskirtos pagal darbo dienas. Jei reikia, patikslinkite.
                  </Alert>}
                  <Collapse in={showDays}>
                    <Box sx={{ overflowX: "auto", mt: 1.8 }}>
                      <Table size="small" sx={{ minWidth: 580, "& td, & th": { px: .85, py: .85, fontSize: 12 } }}>
                        <TableHead><TableRow sx={{ bgcolor: "#F5F7FB" }}>
                          <TableCell>Diena</TableCell><TableCell>Pagal grafiką</TableCell>
                          <TableCell align="center">Kelionė, val.</TableCell><TableCell align="center">Darbas, val.</TableCell>
                          <TableCell align="right">Iš viso</TableCell><TableCell align="right">Komp. poilsis</TableCell>
                        </TableRow></TableHead>
                        <TableBody>
                          {pre.plan.map((d) => {
                            const date = new Date(`${d.date}T12:00:00`);
                            const hourInput = (key) => <TextField size="small"
                              value={comma(f.day_edits?.[d.date]?.[key] ?? d[key])}
                              onChange={(e) => editDay(d.date, key, cleanNum(e.target.value))}
                              inputProps={{ inputMode: "decimal", style: { textAlign: "center", padding: "5px 6px", width: 45 } }} />;
                            return <TableRow key={d.date} sx={{ bgcolor: d.edited ? "#FFFAED" : undefined }}>
                              <TableCell sx={{ whiteSpace: "nowrap" }}>{WDN[date.getDay()]} {md(d.date)}</TableCell>
                              <TableCell sx={{ whiteSpace: "nowrap", color: d.off ? "#98A2B3" : "#344054" }}>
                                {d.planned ? `${d.planned.code ? `${d.planned.code} ` : ""}${d.planned.time} · ${comma(d.planned.hours)} val.` : "Poilsio diena"}
                              </TableCell>
                              <TableCell align="center">{hourInput("travel")}</TableCell>
                              <TableCell align="center">{hourInput("work")}</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700 }}>{comma(d.total)}</TableCell>
                              <TableCell align="right">
                                {Number(d.comp_rest) > 0 ? `+${comma(d.comp_rest)} val.` : ""}
                                {Number(d.rest_day_work) > 0 && <Typography sx={{ fontSize: 10.5, color: "#B56A08" }}>Darbas poilsio dieną ×2</Typography>}
                              </TableCell>
                            </TableRow>;
                          })}
                        </TableBody>
                      </Table>
                    </Box>
                    {Object.keys(f.day_edits || {}).length > 0 && <Button size="small" onClick={() => setF({ ...f, day_edits: {} })}
                      sx={{ mt: 1, textTransform: "none" }}>Atstatyti automatinį paskirstymą</Button>}
                  </Collapse>
                  {Number(pre.plan_totals?.comp_rest) > 0 && <Box sx={{ mt: 1.6, pt: 1.6, borderTop: "1px solid #E9EDF4" }}>
                    <Typography sx={{ fontSize: 12.8, fontWeight: 750, color: "#344054", mb: .5 }}>
                      Kompensacinis poilsis už kelionę ne darbo laiku (DK 107 str.)
                    </Typography>
                    <RadioGroup row value={f.comp_rest_mode || "accrue"} onChange={(e) => setF({ ...f, comp_rest_mode: e.target.value })}>
                      <FormControlLabel value="accrue" control={<Radio size="small" />} label={<Typography sx={{ fontSize: 12.5 }}>Kaupti vėlesniam laikui</Typography>} />
                      <FormControlLabel value="vacation" control={<Radio size="small" />} label={<Typography sx={{ fontSize: 12.5 }}>Prijungti prie kasmetinių atostogų</Typography>} />
                    </RadioGroup>
                  </Box>}
                </TripSection>
              )}
              <Box sx={{ px: .7 }}>
                <Button size="small" color="inherit" onClick={() => setShowInfo((v) => !v)}
                  endIcon={showInfo ? <ExpandLessIcon /> : <ExpandMoreIcon />} sx={{ textTransform: "none", color: "#60718A", fontSize: 12 }}>
                  Svarbu žinoti apie įsakymą ir apmokėjimą
                </Button>
                <Collapse in={showInfo}>
                  <Typography sx={{ fontSize: 12, mt: .7, lineHeight: 1.7, color: "#68778D" }}>
                    Patvirtinus sukuriamas įsakymas, tabelyje žymima „K“, o avansas įtraukiamas į „Išmokėjimai“.
                    Likusi dienpinigių dalis mokama su DU; GPM312 kodas 05 taikomas neapmokestinamai daliai.
                    Kelionės ir nakvynės išlaidos apmokamos pagal dokumentus.
                  </Typography>
                </Collapse>
              </Box>
              {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
            </Stack>

            <Box sx={{ position: { md: "sticky" }, top: 0, alignSelf: "start", p: { xs: 1.5, sm: 2.5 },
              pl: { md: 0 }, borderTop: { xs: "1px solid #E7ECF4", md: 0 } }}>
              <Box sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6EBF2", borderRadius: 2.5, overflow: "hidden" }}>
                <Box sx={{ px: 2, py: 1.8, borderBottom: "1px solid #ECF0F5" }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 800, color: "#192A43" }}>Komandiruotės suvestinė</Typography>
                  <Typography sx={{ fontSize: 11.8, color: "#718198", mt: .3 }}>Apskaičiuojama automatiškai</Typography>
                </Box>
                <Box sx={{ p: 2 }}>
                  <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 2 }}>
                    <Box sx={{ height: 29, width: 29, display: "grid", placeItems: "center", bgcolor: checkColor.bg,
                      borderRadius: 1.4, color: checkColor.fg }}>
                      {previewLoading ? <CircularProgress size={15} /> : blocked || previewError || hasPreviewErrors ? <BlockIcon fontSize="small" />
                        : needAgree ? <WarningAmberRoundedIcon fontSize="small" /> : <CheckCircleOutlineIcon fontSize="small" />}
                    </Box>
                    <Typography sx={{ fontSize: 12.7, fontWeight: 750, color: checkColor.fg }}>{checkLabel}</Typography>
                  </Stack>
                  <Stack spacing={1.5}>
                    <Box>
                      <Typography sx={{ color: "#7A889D", fontSize: 11.5 }}>Laikotarpis</Typography>
                      <Typography sx={{ color: "#263853", fontSize: 13, fontWeight: 700, mt: .2 }}>
                        {md(f.start_at)} – {md(f.end_at)} · {daysCount} d.
                      </Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ color: "#7A889D", fontSize: 11.5 }}>Maršrutas</Typography>
                      <Stack spacing={.8} sx={{ mt: .7 }}>
                        {f.legs.map((leg, i) => <Stack direction="row" spacing={1} alignItems="center" key={i}>
                          <CountryFlag country={leg.country} size={22} />
                          <Typography sx={{ color: "#273853", fontSize: 12.6, fontWeight: 650 }}>{cleanCountry(leg.country) || "Nepasirinkta"}</Typography>
                        </Stack>)}
                      </Stack>
                    </Box>
                    <Divider sx={{ borderColor: "#ECF0F5" }} />
                    <Box>
                      <Typography sx={{ color: "#718198", fontSize: 12 }}>Dienpinigiai iš viso</Typography>
                      <Typography sx={{ fontSize: 27, fontWeight: 850, letterSpacing: "-.04em", color: "#184DAD", mt: .3 }}>
                        {previewTotal === null ? "—" : money(previewTotal)}
                      </Typography>
                      <Typography sx={{ fontSize: 11.5, color: "#7A889D", mt: .3 }}>
                        {f.per_diem_pct || 0} % nuo šalies normos
                      </Typography>
                    </Box>
                    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                      <Typography sx={{ fontSize: 12.5, color: "#64748B" }}>Avansas · {f.advance_pct || 0} %</Typography>
                      <Typography sx={{ fontSize: 15, fontWeight: 800, color: "#263853" }}>
                        {advanceAmount === null ? "—" : money(advanceAmount)}
                      </Typography>
                    </Stack>
                    {pre?.plan_totals && <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                      <Typography sx={{ fontSize: 12.5, color: "#64748B" }}>Darbo ir kelionės laikas</Typography>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#263853" }}>{comma(pre.plan_totals.total)} val.</Typography>
                    </Stack>}
                  </Stack>
                </Box>
                {pre && !hasPreviewErrors && <Box sx={{ borderTop: "1px solid #E9EDF4", bgcolor: "#FBFCFE", px: 2, py: 1.3 }}>
                  <Button size="small" fullWidth endIcon={showAllowance ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    onClick={() => setShowAllowance((v) => !v)} sx={{ textTransform: "none", color: "#52647B", fontWeight: 700 }}>
                    Dienpinigių apskaičiavimas po dieną
                  </Button>
                  <Collapse in={showAllowance}>
                    <Box sx={{ mt: .8, maxHeight: 280, overflowY: "auto" }}>
                      {(pre.days || []).map((d) => <Stack key={d.date} direction="row" justifyContent="space-between" gap={1}
                        sx={{ py: .75, borderBottom: "1px solid #EEF1F6", fontSize: 12 }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 600, color: "#3B4D67", fontSize: 12 }}>{md(d.date)} · {cleanCountry(d.country)}</Typography>
                          <Typography sx={{ color: "#8A96A8", fontSize: 11 }}>{comma(d.norm)} € × {Number(d.pct)} %</Typography>
                          {d.note && <Typography sx={{ color: "#9B690E", fontSize: 11 }}>{d.note}</Typography>}
                        </Box>
                        <Typography sx={{ whiteSpace: "nowrap", color: "#273853", fontWeight: 800, fontSize: 12 }}>{money(d.amount)}</Typography>
                      </Stack>)}
                    </Box>
                  </Collapse>
                </Box>}
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2.1, sm: 3 }, py: 1.75, borderTop: "1px solid #E8EDF3", bgcolor: "#FFFFFF" }}>
          <Typography sx={{ fontSize: 11.7, color: "#8A96A8", mr: "auto", display: { xs: "none", sm: "block" } }}>
            {approveHint || "Patvirtinus bus suformuotas komandiruotės įsakymas"}
          </Typography>
          <Button disabled={busy} onClick={onClose} sx={{ textTransform: "none", color: "#64748B" }}>Atšaukti</Button>
          <Button disabled={busy || !f.employee || !!legErr || dateInvalid} onClick={() => save(false)}
            sx={{ textTransform: "none", fontWeight: 700 }}>Išsaugoti juodraštį</Button>
          <Tooltip title={approveHint} arrow disableHoverListener={canApprove || !approveHint}>
            <span><Button variant="contained" disabled={!canApprove} onClick={() => save(true)}
              sx={{ textTransform: "none", fontWeight: 750, borderRadius: 1.5, minWidth: 126, boxShadow: "none", px: 2.5 }}>
              {busy ? "Saugoma…" : "Patvirtinti"}
            </Button></span>
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

function CopyTripDialog({ trip, onClose, onCopied }) {
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
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" disableScrollLock PaperProps={{ sx: { borderRadius: 2.8 } }}>
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="lt" localeText={{ okButtonLabel: "Gerai", cancelButtonLabel: "Atšaukti" }}>
        <DialogTitle sx={{ fontWeight: 800, color: "#1B2B44", pb: 1 }}>Kopijuoti komandiruotę</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {trip.employee_name}: bus sukurtas juodraštis pasirinktame mėnesyje su tomis pačiomis dienomis ir laiku (jei tokios dienos nėra – paskutinė mėnesio diena).
          </Typography>
          <DatePicker label="Į mėnesį" views={["year", "month"]} format="YYYY-MM" value={target}
            onChange={(v) => v && v.isValid() && setTarget(v.startOf("month"))} slotProps={{ textField: { fullWidth: true } }} />
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose}>Atšaukti</Button>
          <Button variant="contained" disabled={busy || !target} onClick={save} sx={{ borderRadius: 1.5, textTransform: "none" }}>Kopijuoti</Button>
        </DialogActions>
      </LocalizationProvider>
    </Dialog>
  );
}

export default function KomandiruotesPage({ embedded = false } = {}) {
  const now = new Date();
  const [ym, setYm] = useState(() => {
    const q = /[?&]m=(\d{4})-(\d{2})/.exec(window.location.search);
    return q ? { y: Number(q[1]), m: Number(q[2]) } : { y: now.getFullYear(), m: now.getMonth() + 1 };
  });
  const [rows, setRows] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [norms, setNorms] = useState([]);
  const [dlg, setDlg] = useState(null);
  const [copy, setCopy] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(() => {
    payrollApi.trips({ year: ym.y, month: ym.m })
      .then((r) => { setRows(Array.isArray(r) ? r : r.results || []); setError(""); })
      .catch((err) => setError(apiError(err)));
  }, [ym]);
  useEffect(load, [load]);
  useEffect(() => {
    payrollApi.employees({ status: "active" })
      .then((r) => setEmployees(Array.isArray(r) ? r : r.results || [])).catch(() => {});
    payrollApi.tripNorms().then(setNorms).catch(() => {});
  }, []);
  const shift = (d) => setYm(({ y, m }) => {
    const x = new Date(y, m - 1 + d, 1);
    return { y: x.getFullYear(), m: x.getMonth() + 1 };
  });
  const act = async (fn, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(""); setActionBusy(true);
    try { await fn(); load(); } catch (err) { setError(apiError(err)); } finally { setActionBusy(false); }
  };
  const stats = useMemo(() => {
    const all = rows || [];
    const approved = all.filter((r) => r.status === "approved");
    return { all: all.length, approved: approved.length, drafts: all.filter((r) => r.status === "draft").length,
      total: approved.reduce((a, r) => a + Number(r.total || 0), 0) };
  }, [rows]);
  const shown = useMemo(() => (rows || []).filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    const q = query.trim().toLocaleLowerCase("lt-LT");
    if (!q) return true;
    return [t.employee_name, t.destination, t.purpose, ...(t.legs || []).map((l) => l.country)]
      .some((x) => String(x || "").toLocaleLowerCase("lt-LT").includes(q));
  }), [rows, query, statusFilter]);
  const statusPill = (status, label) => {
    const palette = status === "approved" ? { bg: "#ECF9F0", fg: "#157249", dot: "#20A46C" }
      : status === "cancelled" ? { bg: "#FFF1EC", fg: "#AD4F2C", dot: "#E8774B" }
        : { bg: "#F1F4F8", fg: "#54647A", dot: "#8493A9" };
    return (
      <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: .7, bgcolor: palette.bg,
        color: palette.fg, px: 1.15, py: .55, borderRadius: 1.3, fontSize: 11.8, fontWeight: 750, whiteSpace: "nowrap" }}>
        <Box component="span" sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: palette.dot }} />
        {label || ({ draft: "Juodraštis", approved: "Patvirtinta", cancelled: "Atšaukta" }[status] || status)}
      </Box>
    );
  };
  const stat = (label, value, accent, sub) => (
    <Box sx={{ border: "1px solid #E5EAF2", borderRadius: 2.4, bgcolor: "#FFFFFF", px: 2, py: 1.65,
      minWidth: 0, borderLeft: `3px solid ${accent}` }}>
      <Typography sx={{ fontSize: 11.5, fontWeight: 650, color: "#718198" }}>{label}</Typography>
      <Typography sx={{ fontSize: 22, mt: .4, fontWeight: 800, letterSpacing: "-.025em", color: "#1B2A44" }}>{value}</Typography>
      {sub && <Typography sx={{ mt: .18, fontSize: 11.2, color: "#8996AA" }}>{sub}</Typography>}
    </Box>
  );

  return (
    <Box sx={{ p: embedded ? 0 : { xs: 2, md: 3 }, minWidth: 0 }}>
      <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }}
        justifyContent="space-between" gap={1.5} sx={{ mb: 2.3 }}>
        <Box>
          {!embedded && <Typography sx={{ fontSize: 23, fontWeight: 850, color: "#182740", letterSpacing: "-.035em" }}>Komandiruotės</Typography>}
          <Typography sx={{ fontSize: 12.5, color: "#7B899F", mt: .3 }}>
            Įsakymai, dienpinigiai ir avansai vienoje vietoje
          </Typography>
        </Box>
        <Stack direction="row" alignItems="center" gap={.65} flexWrap="wrap">
          <Stack direction="row" alignItems="center" gap={.25} sx={{ border: "1px solid #E2E8F0", borderRadius: 1.7,
            bgcolor: "#FFFFFF", px: .3, py: .2 }}>
            <IconButton size="small" aria-label="Ankstesnis mėnuo" onClick={() => shift(-1)}><ChevronLeftIcon fontSize="small" /></IconButton>
            <Typography sx={{ minWidth: 145, textAlign: "center", color: "#263853", fontWeight: 750, fontSize: 13.5 }}>
              {ym.y} m. {MONTHS[ym.m - 1].toLowerCase()}
            </Typography>
            <IconButton size="small" aria-label="Kitas mėnuo" onClick={() => shift(1)}><ChevronRightIcon fontSize="small" /></IconButton>
          </Stack>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDlg({ trip: null })}
            sx={{ borderRadius: 1.7, textTransform: "none", fontWeight: 750, boxShadow: "none", minHeight: 38, ml: { sm: 1 } }}>
            Nauja komandiruotė
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError("")}>{error}</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,minmax(0,1fr))", sm: "repeat(4,minmax(0,1fr))" },
        gap: 1.25, mb: 2.2 }}>
        {stat("Iš viso", stats.all, "#4675DA", "Komandiruotės šį mėnesį")}
        {stat("Patvirtintos", stats.approved, "#2DAA7A")}
        {stat("Juodraščiai", stats.drafts, "#E5A344")}
        {stat("Dienpinigiai", money(stats.total), "#6676D4", "Patvirtintos komandiruotės")}
      </Box>

      <Box sx={{ border: "1px solid #E4EAF2", borderRadius: 2.5, overflow: "hidden", bgcolor: "#FFFFFF" }}>
        <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} gap={1.15} sx={{ p: 1.6, borderBottom: "1px solid #EBEFF5" }}>
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: "#253752", flex: 1 }}>Komandiruočių sąrašas</Typography>
          <TextField value={query} onChange={(e) => setQuery(e.target.value)} size="small"
            placeholder="Ieškoti darbuotojo ar šalies" sx={{ width: { xs: "100%", sm: 255 },
              "& .MuiOutlinedInput-root": { bgcolor: "#FAFBFD", borderRadius: 1.5, fontSize: 12.8 } }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlinedIcon sx={{ color: "#92A0B5", fontSize: 19 }} /></InputAdornment> }} />
          <TextField select size="small" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            sx={{ width: { xs: "100%", sm: 158 }, "& .MuiOutlinedInput-root": { borderRadius: 1.5, fontSize: 12.8 } }}>
            <MenuItem value="all">Visos būsenos</MenuItem>
            <MenuItem value="draft">Juodraščiai</MenuItem>
            <MenuItem value="approved">Patvirtintos</MenuItem>
            <MenuItem value="cancelled">Atšauktos</MenuItem>
          </TextField>
        </Stack>

        {!rows ? <Stack direction="row" gap={1} alignItems="center" sx={{ p: 4, justifyContent: "center" }}>
          <CircularProgress size={23} /><Typography sx={{ fontSize: 13, color: "#718198" }}>Kraunamos komandiruotės…</Typography>
        </Stack> : shown.length === 0 ? (
          <Stack alignItems="center" spacing={1} sx={{ py: 6, px: 2 }}>
            <Box sx={{ bgcolor: "#F1F5FC", color: "#6686C1", width: 48, height: 48, borderRadius: 2.4,
              display: "grid", placeItems: "center" }}><FlightTakeoffIcon /></Box>
            <Typography sx={{ fontSize: 14, color: "#33445F", fontWeight: 750 }}>
              {rows.length ? "Komandiruočių pagal šiuos filtrus nerasta" : "Šį mėnesį komandiruočių nėra"}
            </Typography>
            <Typography sx={{ fontSize: 12, color: "#8996AA" }}>
              {rows.length ? "Pabandykite kitą paiešką ar būseną." : "Sukurkite pirmą komandiruotę paspaudę „Nauja komandiruotė“."}
            </Typography>
          </Stack>
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <Table sx={{ minWidth: 975, "& th": { fontSize: 11.2, textTransform: "none", fontWeight: 750, color: "#708096",
              bgcolor: "#F8FAFD", borderBottom: "1px solid #E7EBF2" },
              "& td": { py: 1.55, borderBottom: "1px solid #EFF2F6", fontSize: 12.6, color: "#34445B" } }}>
              <TableHead><TableRow>
                <TableCell sx={{ width: 175 }}>Darbuotojas</TableCell>
                <TableCell sx={{ minWidth: 235 }}>Maršrutas ir laikotarpis</TableCell>
                <TableCell align="right">Dienpinigiai</TableCell>
                <TableCell>Avansas</TableCell>
                <TableCell>Būsena</TableCell>
                <TableCell align="right" sx={{ minWidth: 255 }}>Veiksmai</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {shown.map((t) => (
                  <TableRow key={t.id} hover sx={{ "&:last-of-type td": { borderBottom: 0 } }}>
                    <TableCell>
                      <Typography sx={{ fontSize: 13, fontWeight: 750, color: "#1D2E49" }}>{t.employee_name}</Typography>
                      {t.order_number && <Typography sx={{ color: "#8390A3", mt: .35, fontSize: 11.3 }}>Įsakymas Nr. {t.order_number}</Typography>}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" gap={.75} flexWrap="wrap" alignItems="center">
                        {(t.legs || []).map((leg, i) => <Stack direction="row" spacing={.5} alignItems="center" key={`${leg.country}-${i}`}>
                          {i > 0 && <Typography sx={{ color: "#A1AFC0", fontSize: 12, mr: .25 }}>→</Typography>}
                          <CountryFlag country={leg.country} size={21} />
                          <Typography sx={{ fontSize: 12.3, fontWeight: 700, color: "#364860" }}>{cleanCountry(leg.country)}</Typography>
                        </Stack>)}
                      </Stack>
                      <Typography sx={{ color: "#8693A7", fontSize: 11.6, mt: .6 }}>
                        {String(t.start_at || "").slice(0, 16).replace("T", " ")} – {String(t.end_at || "").slice(0, 16).replace("T", " ")}
                      </Typography>
                      {t.destination && <Typography sx={{ color: "#66758A", fontSize: 11.5, mt: .25 }}>{t.destination}</Typography>}
                    </TableCell>
                    <TableCell align="right">
                      <Typography sx={{ fontWeight: 800, fontSize: 14, color: "#233D67", fontVariantNumeric: "tabular-nums" }}>{money(t.total)}</Typography>
                    </TableCell>
                    <TableCell>
                      {t.advance_status ? <Stack spacing={.35}>
                        <Typography sx={{ fontSize: 12.6, fontWeight: 700 }}>{money(t.advance_status.amount)}</Typography>
                        <Typography sx={{ fontSize: 11.3, color: t.advance_status.status === "paid" ? "#13815C" : "#BC7B17" }}>
                          {t.advance_status.status === "paid" ? "Sumokėtas" : "Nesumokėtas"}
                        </Typography>
                      </Stack> : <Typography sx={{ color: "#AFB9C7" }}>—</Typography>}
                    </TableCell>
                    <TableCell>{statusPill(t.status, t.status_label)}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" justifyContent="flex-end" alignItems="center" gap={.4}>
                        {t.status === "draft" && <>
                          <Button size="small" onClick={() => setDlg({ trip: t })} sx={{ textTransform: "none", fontSize: 12.2, fontWeight: 700 }}>Redaguoti</Button>
                          <Button size="small" variant="outlined" onClick={() => setDlg({ trip: t })}
                            sx={{ textTransform: "none", borderRadius: 1.4, fontSize: 12, fontWeight: 700 }}>Patvirtinti…</Button>
                          <Tooltip title="Ištrinti juodraštį"><span><IconButton size="small" disabled={actionBusy} color="error"
                            onClick={() => act(() => payrollApi.deleteTrip(t.id), "Ištrinti juodraštį?")}>
                            <DeleteOutlineIcon sx={{ fontSize: 18 }} /></IconButton></span></Tooltip>
                        </>}
                        {t.status === "approved" && <>
                          <Button size="small" onClick={() => payrollApi.tripOrderHtml(t.id).then(openHtml).catch((err) => setError(apiError(err)))}
                            sx={{ textTransform: "none", fontSize: 12.2, fontWeight: 700 }}>Įsakymas</Button>
                          <Button size="small" color="warning" disabled={actionBusy} onClick={() => act(() => payrollApi.cancelTrip(t.id),
                            "Atšaukti komandiruotę? Bus pašalintas avansas ir tabelio žyma.")}
                            sx={{ textTransform: "none", fontSize: 12.2 }}>Atšaukti</Button>
                        </>}
                        <Tooltip title="Kopijuoti į kitą mėnesį"><IconButton size="small" onClick={() => setCopy(t)}
                          sx={{ color: "#64748B", border: "1px solid #E5EAF2", borderRadius: 1.3, ml: .45 }}>
                          <ContentCopyOutlinedIcon sx={{ fontSize: 17 }} />
                        </IconButton></Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
        <Box sx={{ px: 1.8, py: 1.15, borderTop: "1px solid #EEF1F6", bgcolor: "#FCFDFE" }}>
          <Typography sx={{ color: "#8A97AA", fontSize: 11.7 }}>
            Rodoma {shown.length} iš {stats.all} komandiruočių
          </Typography>
        </Box>
      </Box>
      <TripDialog open={!!dlg} trip={dlg?.trip} onClose={() => setDlg(null)} onSaved={load}
        employees={employees} norms={norms} />
      <CopyTripDialog trip={copy} onClose={() => setCopy(null)}
        onCopied={(saved, target) => { setCopy(null); setYm({ y: target.year(), m: target.month() + 1 }); setDlg({ trip: saved }); }} />
    </Box>
  );
}
