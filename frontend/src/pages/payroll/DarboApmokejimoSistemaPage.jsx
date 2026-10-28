import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, InputAdornment, ListItemIcon, Menu, MenuItem, MenuList, Slider, Stack, Switch,
  TextField, Tooltip, Typography,
} from "@mui/material";
import CallMergeIcon from "@mui/icons-material/CallMerge";
import AddIcon from "@mui/icons-material/Add";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import CloseIcon from "@mui/icons-material/Close";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";

import { apiError, money, payrollApi } from "../../api/payroll";
import { pagedHtml } from "./dasPaged";

const today = () => new Date().toISOString().slice(0, 10);

const CRITERIA = [
  { key: "skills", label: "Įgūdžiai ir kompetencijos", help: "Kiek žinių ir patirties reikia šiam darbui" },
  { key: "qualification", label: "Kvalifikacija", help: "Reikalingas išsilavinimas, sertifikatai" },
  { key: "effort", label: "Pastangos", help: "Fizinis, protinis ir emocinis krūvis" },
  { key: "responsibility", label: "Atsakomybė", help: "Už žmones, pinigus, turtą, sprendimus" },
  { key: "conditions", label: "Darbo sąlygos", help: "Aplinka, rizika, darbo laiko ypatumai" },
];

const DEFAULT_OPTS = { order_no: "", bonus: "discretionary", bonus_max_pct: 20, bonus_period: "quarter",
  prev_ext: false, prev_ext_date: "", prev_ext_no: "", reps: false, reps_date: "", recompute: false };
const optsOf = (f) => ({ order_no: f.order_no || "", bonus: f.bonus, bonus_max_pct: Number(f.bonus_max_pct) || 0,
  bonus_period: f.bonus_period, prev_ext: !!f.prev_ext, prev_ext_date: f.prev_ext_date || "", prev_ext_no: f.prev_ext_no || "",
  reps: !!f.reps, reps_date: f.reps_date || "", recompute: !!f.recompute });
const amt = (v, unit) => (unit === "€/val." ? `${money(v)}/val.` : money(v));
const hourlyText = (g) => (g.hourly_min == null && g.hourly_max == null ? ""
  : g.hourly_min === g.hourly_max ? amt(g.hourly_min, "€/val.") : `${amt(g.hourly_min, "€/val.")} – ${amt(g.hourly_max, "€/val.")}`);

const CARD = { border: "1px solid #EAECF0", borderRadius: 2.5, bgcolor: "#FFFFFF", p: { xs: 2, md: 2.5 } };
const BTN = { textTransform: "none", fontWeight: 600, borderRadius: 2, boxShadow: "none" };
const GRID = { display: "grid", gridTemplateColumns: { xs: "1fr", md: "84px minmax(0, 1fr) 120px 110px 190px 40px" }, columnGap: 2, alignItems: "center" };

const rangeText = (g) => (!g.salary_min && !g.salary_max ? "Nenustatyta"
  : g.salary_min === g.salary_max ? money(g.salary_min) : `${money(g.salary_min)} – ${money(g.salary_max)}`);
const people = (n) => (n % 10 === 1 && n % 100 !== 11 ? `${n} darbuotojas` : n % 10 >= 2 && n % 10 <= 9 && !(n % 100 >= 11 && n % 100 <= 19) ? `${n} darbuotojai` : `${n} darbuotojų`);

export default function DarboApmokejimoSistemaPage({ embedded = false } = {}) {
  const navigate = useNavigate();
  const [groups, setGroups] = useState(null);
  const [issues, setIssues] = useState([]);
  const [docs, setDocs] = useState([]);
  const [edit, setEdit] = useState(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [view, setView] = useState(null);         // peržiūrima patvirtinta versija
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [merge, setMerge] = useState(null);
  const [info, setInfo] = useState("");

  const load = useCallback(async () => {
    try {
      const [g, i, d] = await Promise.all([payrollApi.positionGroups(), payrollApi.groupsCheck(), payrollApi.dasList()]);
      setGroups(g); setIssues(i); setDocs(d); setError("");
    } catch (e) { setError(apiError(e)); setGroups((x) => x || []); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const autoCreate = async () => {
    setBusy(true);
    try { await payrollApi.autoCreateGroups(); await load(); } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };
  const remove = async (g) => {
    if (!window.confirm(`Ištrinti grupę ${g.code}? Jos pareigos liks be grupės.`)) return;
    try { await payrollApi.deleteGroup(g.id); await load(); } catch (e) { setError(apiError(e)); }
  };

  const list = groups || [];
  const nums = list.map((g) => /^G(\d+)$/.exec(g.code)).filter(Boolean).map((m) => Number(m[1]));
  const nextCode = `G${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`;
  const noGroup = issues.filter((i) => i.type === "no_group");
  const changes = issues.find((i) => i.type === "das_outdated")?.changes || [];
  const outdated = issues.some((i) => i.type === "das_outdated");
  const current = docs[0] || null;
  const checks = [
    ...noGroup.map((i) => `Pareigos „${i.position}“ nepriskirtos jokiai grupei`),
    ...issues.filter((i) => i.type === "below_mma").map((i) => `${i.employee}: ${amt(i.salary, i.unit)} – mažiau už minimalų atlygį (${amt(i.mma, i.unit)}). Patikrinkite algą ir etatą kortelėje`),
    ...issues.filter((i) => i.type === "out_of_range").map((i) => `${i.employee} (${i.position}): ${amt(i.salary, i.unit)} – už grupės ${i.group} ribų (${amt(i.min, i.unit)} – ${amt(i.max, i.unit)})`),
    ...issues.filter((i) => i.type === "mixed_group").map((i) => `Grupėje ${i.group}: ${i.positions.join(", ")} – paprastai vertinama kitaip. Patikrinkite, ar darbas lygiavertis`),
    ...issues.filter((i) => i.type === "no_salary").map((i) => `Grupė ${i.group}: nenurodytos ribos (${i.unit}) – atidarykite grupę ir nurodykite (be jų patvirtinti negalima)`),
    ...issues.filter((i) => i.type === "mma_qualified").map((i) => `${i.employee} (${i.position}): alga lygi minimaliai – ją galima mokėti tik už nekvalifikuotą darbą`),
  ];
  // švelnūs (pilki) pastebėjimai - ne klaidos
  const seen = new Set();
  const notes = [
    ...issues.filter((i) => i.type === "wide_range").map((i) => `${i.group}: ${amt(i.min, i.unit)} – ${amt(i.max, i.unit)} – platesnės nei rekomenduojama (VDI: ~±20 %)${i.employee ? `. Maksimumą lemia: ${i.employee} (${amt(i.salary, i.unit)})` : ""}`),
    ...issues.filter((i) => i.type === "inversion" && !seen.has(i.group) && seen.add(i.group))
      .map((i) => `${i.group} (${balai(i.score)}) alga iki ${money(i.max)} – daugiau nei ${i.other} (${balai(i.other_score)}, iki ${money(i.other_max)}). Patikrinkite vertinimą ar ribas`),
    ...issues.filter((i) => i.type === "form_mismatch").map((i) => `${i.group}: valandinis atlygis per mėnesį (~168 val.) – ${money(i.eq_min)} – ${money(i.eq_max)}, mėnesinė alga – ${money(i.min)} – ${money(i.max)}. Skirtumas turi būti objektyviai pagrįstas`),
  ];
  const blocked = issues.some((i) => i.type === "no_salary");

  const [showOld, setShowOld] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const docRef = useRef(null);
  const status = !current ? { label: "Nepatvirtinta", color: "#B54708", bg: "#FFFAEB" }
    : outdated ? { label: `Reikia patvirtinti v${current.version + 1}`, color: "#B54708", bg: "#FFFAEB" }
      : { label: `Galioja v${current.version}`, color: "#027A48", bg: "#ECFDF3" };
  const old = docs.slice(1);

  return (
    <Box sx={{ p: embedded ? 0 : { xs: 2, md: 3 }, maxWidth: 1120 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1.5} mb={2.5}>
        <Stack direction="row" alignItems="center" gap={.75}>
          <Typography sx={{ fontSize: 20, fontWeight: 700, color: "#101828" }}>Darbo apmokėjimo sistema</Typography>
          <Help text="Privaloma visiems darbdaviams iki 2026-12-31 (DK 140 str.). Pareigos suskirstomos į grupes pagal darbo vertę, kiekvienai grupei nustatomos algų ribos. Grupių numeriai kas mėnesį teikiami Sodrai (SDUP)." />
        </Stack>
        <Chip label={status.label} onClick={() => docRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          sx={{ height: 28, fontWeight: 700, fontSize: 12.5, color: status.color, bgcolor: status.bg, borderRadius: 1.5 }} />
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {info && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setInfo("")}>{info}</Alert>}

      {/* 1. Grupės */}
      <Section n={1} state={!list.length || checks.length ? "todo" : "done"} title="Pareigybių grupės"
        help="Į vieną grupę dedamos pareigos, kurių darbas vienodos vertės. Naujos pareigos (naujas darbuotojas, perkėlimas) priskiriamos grupei automatiškai."
        action={(
          <Stack direction="row" gap={1}>
            {noGroup.length > 0 && (
              <Button size="small" variant="outlined" startIcon={<AutoFixHighIcon />} disabled={busy} onClick={autoCreate} sx={BTN}>Sukurti automatiškai</Button>
            )}
            <Button size="small" variant="outlined" color="inherit" startIcon={<AddIcon />} onClick={() => setEdit({})}
              sx={{ ...BTN, borderColor: "#D0D5DD", color: "#344054" }}>Nauja grupė</Button>
          </Stack>
        )}>
        <NoticeBox items={checks} tone="warn" />
        <NoticeBox items={notes} tone="info" />
        {groups === null ? (
          <Box sx={{ py: 5, textAlign: "center" }}><CircularProgress size={24} /></Box>
        ) : list.length === 0 ? (
          <Box sx={{ py: 4, textAlign: "center", borderTop: "1px solid #EAECF0" }}>
            <Typography sx={{ fontSize: 13.5, color: "#667085" }}>Grupių dar nėra – jos sukuriamos automatiškai, kai įvedate darbuotojus.</Typography>
          </Box>
        ) : (
          <>
            <Box sx={{ ...GRID, display: { xs: "none", md: "grid" }, px: 2.5, py: 1, bgcolor: "#F9FAFB", borderTop: "1px solid #EAECF0" }}>
              {[["Nr."], ["Grupė ir pareigos"], ["Darbuotojai"], ["Vertinimas", "5 kriterijai po 1–5 balus: įgūdžiai, kvalifikacija, pastangos, atsakomybė, darbo sąlygos"],
                ["Alga visam etatui", "Mėnesinės algos ribos, perskaičiuotos visam etatui. „auto“ – pagal faktines grupės darbuotojų algas"], [""]].map(([h, tip]) => (
                <Stack key={h || "x"} direction="row" alignItems="center" gap={.5}>
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#667085" }}>{h}</Typography>
                  {tip && <Help text={tip} size={14} />}
                </Stack>
              ))}
            </Box>
            {list.map((g) => (
              <GroupRow key={g.id} g={g} canMerge={list.length > 1}
                onEdit={() => setEdit(g)} onMerge={() => setMerge(g)} onDelete={() => remove(g)} />
            ))}
          </>
        )}
      </Section>

      {/* 2. Dokumentas */}
      <Box ref={docRef} sx={{ scrollMarginTop: 80 }}>
        <Section n={2} state={current && !outdated ? "done" : "todo"} title="Darbo apmokėjimo sistemos (DAS) dokumentas"
          help="Sugeneruojama iš grupių: įsakymas, darbo apmokėjimo sistema, priedai ir supažindinimo lapas. Patvirtinus – atsispausdinkite, pasirašykite ir supažindinkite darbuotojus."
          action={current && !outdated && list.length > 0 ? (
            <Button size="small" color="inherit" disabled={blocked} onClick={() => setApproveOpen(true)} sx={{ ...BTN, color: "#475467" }}>Nauja versija</Button>
          ) : null}>
          {!current ? (
            <DocRow tone="grey" title="Dar nepatvirtinta" sub="Privaloma iki 2026-12-31">
              <Button size="small" variant="contained" disableElevation disabled={!list.length || blocked} onClick={() => setApproveOpen(true)} sx={BTN}>
                Peržiūrėti ir patvirtinti
              </Button>
            </DocRow>
          ) : (
            <DocRow tone={outdated ? "grey" : "green"} badge={`v${current.version}`} title={`Galioja nuo ${current.approved_date}`}
              sub={current.manager_name ? `${current.manager_title || "Vadovas"} ${current.manager_name}` : ""}>
              <Button size="small" startIcon={<VisibilityOutlinedIcon />} onClick={() => setView(current)} sx={{ ...BTN, color: "#344054" }}>Peržiūrėti</Button>
              <Tooltip title="Spausdinti / PDF">
                <IconButton size="small" onClick={() => payrollApi.dasHtml(current.id).then(printHtml)}><PrintOutlinedIcon fontSize="small" /></IconButton>
              </Tooltip>
            </DocRow>
          )}
          {current && outdated && (
            <Box sx={{ mx: { xs: 2, md: 2.5 }, mb: 2, p: 1.75, borderRadius: 2, bgcolor: "#FFFAEB", border: "1px solid #FEC84B" }}>
              <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} gap={1.5}>
                <WarningAmberRoundedIcon sx={{ color: "#F79009" }} />
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: "#101828" }}>
                    Grupės pasikeitė – patvirtinkite naują versiją
                  </Typography>
                  <Button size="small" onClick={() => setShowChanges((v) => !v)} endIcon={<ExpandMoreRoundedIcon sx={{ transform: showChanges ? "rotate(180deg)" : "none" }} />}
                    sx={{ ...BTN, p: 0, minWidth: 0, color: "#B54708", fontWeight: 600, fontSize: 13 }}>
                    Kas pasikeitė ({changes.length})
                  </Button>
                </Box>
                <Button variant="contained" disableElevation disabled={blocked} onClick={() => setApproveOpen(true)} sx={{ ...BTN, whiteSpace: "nowrap" }}>
                  Patvirtinti v{current.version + 1}
                </Button>
              </Stack>
              {showChanges && (
                <Box component="ul" sx={{ m: 0, mt: 1, pl: 5.5, color: "#475467", fontSize: 13, "& li": { mb: .3 } }}>
                  {changes.map((c) => <li key={c}>{c}</li>)}
                </Box>
              )}
            </Box>
          )}
          {old.length > 0 && (
            <>
              <Button size="small" onClick={() => setShowOld((v) => !v)} endIcon={<ExpandMoreRoundedIcon sx={{ transform: showOld ? "rotate(180deg)" : "none" }} />}
                sx={{ ...BTN, mx: { xs: 1.5, md: 2 }, mb: 1, color: "#667085", fontWeight: 600, fontSize: 13 }}>
                Ankstesnės versijos ({old.length})
              </Button>
              {showOld && old.map((d) => (
                <DocRow key={d.id} tone="grey" badge={`v${d.version}`} title={`Patvirtinta ${d.approved_date}`} small
                  sub={d.changes?.length ? `${d.changes.length} pakeit.: ${d.changes.slice(0, 2).join("; ")}${d.changes.length > 2 ? "…" : ""}` : d.version === 1 ? "Pirmoji versija" : ""}>
                  <Button size="small" onClick={() => setView(d)} sx={{ ...BTN, color: "#344054" }}>Peržiūrėti</Button>
                </DocRow>
              ))}
            </>
          )}
        </Section>
      </Box>

      {/* 3. SDUP */}
      <SdupSection onOpen={(m) => navigate(m ? `/deklaravimas?m=${m}` : "/deklaravimas")} />

      <GroupDialog group={edit} nextCode={nextCode} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
      <MergeDialog group={merge} groups={list} onClose={() => setMerge(null)}
        onDone={(warning) => { setMerge(null); if (warning) setInfo(warning); load(); }} />
      <ApproveDialog open={approveOpen} last={current} changes={changes} onClose={() => setApproveOpen(false)}
        onApproved={() => { setApproveOpen(false); load(); }} />
      <ViewDialog doc={view} onClose={() => setView(null)} />
    </Box>
  );
}

const balai = (n) => `${n} ${n % 10 === 0 || (n % 100 >= 11 && n % 100 <= 19) ? "balų" : n % 10 === 1 ? "balas" : "balai"}`;

// Pranešimų blokas: rodomi 3, kiti - „Žiūrėti daugiau“
function NoticeBox({ items, tone }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const warn = tone === "warn";
  const shown = open ? items : items.slice(0, 3);
  return (
    <Box sx={{ mx: { xs: 2, md: 2.5 }, my: 1.5, px: 1.75, py: 1, borderRadius: 2,
      bgcolor: warn ? "#FFFAEB" : "#F9FAFB", border: `1px solid ${warn ? "#FEF0C7" : "#EAECF0"}` }}>
      {shown.map((c) => (
        <Stack key={c} direction="row" gap={1} alignItems="flex-start" sx={{ py: .3 }}>
          {warn ? <WarningAmberRoundedIcon sx={{ fontSize: 16, color: "#F79009", mt: .25 }} />
            : <InfoOutlinedIcon sx={{ fontSize: 16, color: "#98A2B3", mt: .25 }} />}
          <Typography sx={{ fontSize: warn ? 13 : 12.5, color: warn ? "#7A2E0E" : "#667085" }}>{c}</Typography>
        </Stack>
      ))}
      {items.length > 3 && (
        <Button size="small" onClick={() => setOpen((v) => !v)}
          endIcon={<ExpandMoreRoundedIcon sx={{ transform: open ? "rotate(180deg)" : "none" }} />}
          sx={{ ...BTN, mt: .25, ml: 2.5, p: 0, minWidth: 0, fontSize: 12.5, color: warn ? "#B54708" : "#475467" }}>
          {open ? "Rodyti mažiau" : `Žiūrėti daugiau (${items.length - 3})`}
        </Button>
      )}
    </Box>
  );
}

function Toggle({ checked, onChange, label, help }) {
  return (
    <Stack direction="row" alignItems="center" gap={.5}>
      <FormControlLabel sx={{ mr: 0 }} control={<Switch size="small" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />}
        label={<Typography sx={{ fontSize: 13 }}>{label}</Typography>} />
      {help && <Help text={help} size={15} />}
    </Stack>
  );
}

function Help({ text, size = 16 }) {
  return (
    <Tooltip title={text} arrow placement="top">
      <HelpOutlineRoundedIcon sx={{ fontSize: size, color: "#98A2B3", cursor: "help" }} />
    </Tooltip>
  );
}

// Numeruotas žingsnis: žalia varnelė - atlikta, oranžinis numeris - reikia veiksmų, pilkas - informacija
function Section({ n, state, title, help, action, children }) {
  const st = { done: ["#027A48", "#ECFDF3"], todo: ["#B54708", "#FEF0C7"], idle: ["#475467", "#FFFFFF"] }[state] || ["#475467", "#FFFFFF"];
  return (
    <Box sx={{ ...CARD, p: 0, mb: 2.5, overflow: "hidden" }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1.5}
        sx={{ px: { xs: 2, md: 2.5 }, py: 1.5, bgcolor: "#F5F6F8" }}>
        <Stack direction="row" alignItems="center" gap={1.25}>
          <Box sx={{ width: 26, height: 26, borderRadius: "50%", bgcolor: st[1], color: st[0], display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13 }}>
            {state === "done" ? <CheckRoundedIcon sx={{ fontSize: 17 }} /> : n}
          </Box>
          <Typography sx={{ fontSize: 15.5, fontWeight: 700, color: "#101828" }}>{title}</Typography>
          {help && <Help text={help} />}
        </Stack>
        {action}
      </Stack>
      {children}
    </Box>
  );
}

function DocRow({ tone, badge, title, sub, small, children }) {
  const [c, bg] = tone === "green" ? ["#027A48", "#ECFDF3"] : ["#667085", "#F2F4F7"];
  return (
    <Stack direction={{ xs: "column", sm: "row" }} gap={1.5} alignItems={{ sm: "center" }}
      sx={{ px: { xs: 2, md: 2.5 }, py: small ? 1 : 1.5, borderTop: "1px solid #EAECF0" }}>
      <Box sx={{ width: small ? 34 : 40, height: small ? 34 : 40, borderRadius: 2, flexShrink: 0, display: "grid", placeItems: "center", bgcolor: bg, color: c, fontWeight: 700, fontSize: 13 }}>
        {badge || <DescriptionOutlinedIcon sx={{ fontSize: 20 }} />}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: small ? 13.5 : 14, fontWeight: 600, color: "#101828" }}>{title}</Typography>
        {sub && <Typography sx={{ fontSize: 12.5, color: "#667085" }}>{sub}</Typography>}
      </Box>
      <Stack direction="row" gap={.5} alignItems="center">{children}</Stack>
    </Stack>
  );
}

// ============================================================
// SDUP: kada susiformuos ir kokia būsena (pats pranešimas - Deklaravimo puslapyje)
// ============================================================
const SDUP_FROM = "2027-01";
const M_ACC = ["sausį", "vasarį", "kovą", "balandį", "gegužę", "birželį", "liepą", "rugpjūtį", "rugsėjį", "spalį", "lapkritį", "gruodį"];
const M_GEN = ["sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio", "liepos", "rugpjūčio", "rugsėjo", "spalio", "lapkričio", "gruodžio"];
const ymKey = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
const TONE = { green: ["#027A48", "#ECFDF3"], blue: ["#155EEF", "#EFF4FF"], red: ["#B42318", "#FEF3F2"], grey: ["#475467", "#F2F4F7"] };

function sdupStatus(it, m, todayIso) {
  const d = it.declaration;
  const dl = String(it.deadline || "").slice(0, 10);
  const late = dl && dl < todayIso;
  const by = dl ? `Pateikti iki ${dl}` : "";
  if (it.correction || d?.correction) {
    return { label: `Patikslinti iki ${dl}`, tone: "red", sub: "Atlyginimai pakeisti po pateikimo – pateikite patikslintą pranešimą (per 2 darbo dienas)" };
  }
  if (d?.status === "accepted") return { label: "Priimta", tone: "green", sub: "" };
  if (d?.status === "submitted") return { label: `Pateikta${d.submitted_at ? ` ${String(d.submitted_at).slice(0, 10)}` : ""}`, tone: "green", sub: "" };
  if (it.manual) {
    return { label: late ? "Pavėluota" : "Laukia atlyginimų", tone: late ? "red" : "grey",
      sub: `Susiformuos automatiškai, kai patvirtinsite ${M_GEN[m - 1]} atlyginimus · ${by.toLowerCase()}` };
  }
  if (!d) return { label: "Paruošti", tone: late ? "red" : "blue", sub: `Atlyginimai patvirtinti – paruoškite Deklaravime · ${by.toLowerCase()}` };
  if (d.status === "error") return { label: "Yra klaidų", tone: "red", sub: "Atidarykite ir pataisykite klaidas" };
  return { label: late ? "Pavėluota" : "Paruošta – pateikite", tone: late ? "red" : "blue", sub: `Įkelkite JSON į Sodros EDAS · ${by.toLowerCase()}` };
}

function SdupSection({ onOpen }) {
  const [rows, setRows] = useState(null);
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  useEffect(() => {
    const months = [2, 1].map((back) => { const d = new Date(now.getFullYear(), now.getMonth() - back, 1); return [d.getFullYear(), d.getMonth() + 1]; })
      .filter(([y, m]) => ymKey(y, m) >= SDUP_FROM);
    if (!months.length) { setRows([]); return; }
    Promise.all(months.map(([y, m]) => payrollApi.declarations(y, m)
      .then((r) => ({ y, m, it: (Array.isArray(r) ? r : r.items || []).find((x) => x.form === "SDUP") }))
      .catch(() => ({ y, m, it: null }))))
      .then((all) => setRows(all.filter((x) => x.it)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Section n={3} state="idle" title="SDUP pranešimai Sodrai"
      help="Susiformuoja automatiškai patvirtinus mėnesio atlyginimus. Pateikiami Deklaravimo puslapyje – iki kito mėnesio paskutinės dienos. Pareigybių grupių numeriai įrašomi iš šios sistemos."
      action={(
        <Button size="small" color="inherit" endIcon={<ArrowForwardRoundedIcon />} onClick={() => onOpen()}
          sx={{ ...BTN, color: "#475467", whiteSpace: "nowrap" }}>Į deklaravimą</Button>
      )}>
      {rows === null ? null : rows.length === 0 ? (
        <SdupRow title="Pirmasis – SDUP už 2027 m. sausį" sub="Susiformuos patvirtinus sausio atlyginimus · pateikti iki 2027-02-28"
          status={{ label: "Nuo 2027 m.", tone: "grey" }} />
      ) : rows.map(({ y, m, it }) => (
        <SdupRow key={ymKey(y, m)} title={`SDUP už ${y} m. ${M_ACC[m - 1]}`} status={sdupStatus(it, m, todayIso)}
          onOpen={() => onOpen(ymKey(y, m))} />
      ))}
    </Section>
  );
}

function SdupRow({ title, sub, status, onOpen }) {
  const [c, bg] = TONE[status.tone] || TONE.grey;
  return (
    <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} gap={1.5}
      sx={{ px: { xs: 2, md: 2.5 }, py: 1.25, borderTop: "1px solid #EAECF0" }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: "#101828" }}>{title}</Typography>
        {(sub ?? status.sub) && <Typography sx={{ fontSize: 12.5, color: "#667085" }}>{sub ?? status.sub}</Typography>}
      </Box>
      <Chip size="small" label={status.label} sx={{ height: 24, fontWeight: 700, fontSize: 12, color: c, bgcolor: bg, borderRadius: 1.5 }} />
      {onOpen && <Button size="small" onClick={onOpen} sx={{ ...BTN, color: "#344054", minWidth: 0 }}>Atidaryti</Button>}
    </Stack>
  );
}

function GroupRow({ g, canMerge, onEdit, onMerge, onDelete }) {
  const [menu, setMenu] = useState(null);
  const staff = g.employees || [];
  const score = g.total_score || 0;
  return (
    <Box sx={{ ...GRID, px: { xs: 2, md: 2.5 }, py: 1.5, rowGap: 1, borderTop: "1px solid #EAECF0", "&:hover": { bgcolor: "#FCFCFD" } }}>
      <Box>
        <Box sx={{ display: "inline-block", px: 1, py: .25, borderRadius: 1.25, bgcolor: "#EFF4FF", color: "#155EEF", fontWeight: 700, fontSize: 12.5 }}>{g.code}</Box>
      </Box>
      <Box sx={{ minWidth: 0, cursor: "pointer" }} onClick={onEdit}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: "#101828" }}>{g.name}</Typography>
        <Typography sx={{ fontSize: 12.5, color: "#667085", overflow: "hidden", textOverflow: "ellipsis" }}>
          {g.positions.map((p) => p.name).join(", ") || "Pareigų nėra"}
        </Typography>
      </Box>
      <Tooltip title={staff.length ? staff.join(", ") : "Grupė be darbuotojų į dokumentą neįtraukiama"}>
        <Stack direction="row" gap={.75} alignItems="center" sx={{ color: staff.length ? "#344054" : "#98A2B3" }}>
          <PeopleOutlineIcon sx={{ fontSize: 17 }} />
          <Typography sx={{ fontSize: 13.5 }}>{staff.length ? people(staff.length) : "Nėra"}</Typography>
        </Stack>
      </Tooltip>
      <Tooltip title="Pareigybės vertinimas: 5 kriterijai po 1–5 balus">
        <Box>
          <Typography sx={{ fontSize: 13.5, color: "#344054" }}>{score} <Box component="span" sx={{ color: "#98A2B3" }}>/ 25</Box></Typography>
          <Box sx={{ mt: .5, height: 4, width: 72, borderRadius: 2, bgcolor: "#EAECF0" }}>
            <Box sx={{ height: 4, width: `${(score / 25) * 100}%`, borderRadius: 2, bgcolor: "#528BFF" }} />
          </Box>
        </Box>
      </Tooltip>
      <Stack direction="row" gap={.75} alignItems="center">
        <Box>
          {(g.salary_min != null || g.salary_max != null || g.hourly_min == null) && (
            <Typography sx={{ fontSize: 13.5, color: "#101828", whiteSpace: "nowrap" }}>{rangeText(g)}</Typography>
          )}
          {hourlyText(g) && <Typography sx={{ fontSize: 13.5, color: "#101828", whiteSpace: "nowrap" }}>{hourlyText(g)}</Typography>}
        </Box>
        {g.auto_range && (
          <Tooltip title="Ribos nustatomos automatiškai pagal faktines grupės darbuotojų algas">
            <Chip size="small" label="auto" sx={{ height: 18, fontSize: 10.5, bgcolor: "#F2F4F7", color: "#667085" }} />
          </Tooltip>
        )}
      </Stack>
      <Box sx={{ textAlign: "right" }}>
        <IconButton size="small" onClick={(e) => setMenu(e.currentTarget)} aria-label="Veiksmai"><MoreHorizIcon fontSize="small" /></IconButton>
        <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)} disableScrollLock
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
          <MenuList dense sx={{ py: 0 }}>
            <MenuItem onClick={() => { setMenu(null); onEdit(); }}><ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>Redaguoti</MenuItem>
            {canMerge && <MenuItem onClick={() => { setMenu(null); onMerge(); }}><ListItemIcon><CallMergeIcon fontSize="small" /></ListItemIcon>Sujungti su kita grupe</MenuItem>}
            <MenuItem onClick={() => { setMenu(null); onDelete(); }} sx={{ color: "error.main" }}>
              <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>Ištrinti
            </MenuItem>
          </MenuList>
        </Menu>
      </Box>
    </Box>
  );
}

// spausdinimas be naujo lango: paslėptas iframe su A4 lapais
function printHtml(html) {
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:900px;height:0;border:0;visibility:hidden";
  f.onload = () => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 1500); };
  f.srcdoc = pagedHtml(html);
  document.body.appendChild(f);
}

// A4 lapų peržiūra (balti lapai su paraštėmis, puslapių numeriai); onPages - lapų skaičius
function DocFrame({ html, frameRef, onPages }) {
  return (
    <Box sx={{ flex: 1, minHeight: 0, borderRadius: 2, overflow: "hidden", border: "1px solid #EAECF0", bgcolor: "#F2F4F7", position: "relative" }}>
      {!html && <CircularProgress size={24} sx={{ position: "absolute", top: "45%", left: "50%" }} />}
      <iframe ref={frameRef} title="Darbo apmokėjimo sistema" srcDoc={pagedHtml(html)}
        onLoad={() => onPages?.(frameRef.current?.contentWindow?.__pages || 0)}
        style={{ width: "100%", height: "100%", border: 0, display: "block" }} />
    </Box>
  );
}

// Dialogo viršus: pavadinimas, A4 · N psl., Spausdinti / PDF, uždaryti
function DocHeader({ title, sub, pages, canPrint, onPrint, onClose }) {
  return (
    <Stack direction="row" alignItems="center" gap={1.5} sx={{ px: 3, pt: 2, pb: 1.5 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 17, color: "#101828" }}>{title}</Typography>
        <Typography sx={{ fontSize: 12.5, color: "#667085" }}>{[sub, pages ? `A4 · ${pages} psl.` : ""].filter(Boolean).join(" · ")}</Typography>
      </Box>
      <Button variant="outlined" color="inherit" startIcon={<PrintOutlinedIcon />} disabled={!canPrint} onClick={onPrint}
        sx={{ ...BTN, borderColor: "#D0D5DD", color: "#344054" }}>Spausdinti / PDF</Button>
      <IconButton onClick={onClose} aria-label="Uždaryti"><CloseIcon /></IconButton>
    </Stack>
  );
}

function ViewDialog({ doc, onClose }) {
  const [html, setHtml] = useState("");
  const [pages, setPages] = useState(0);
  const frame = useRef(null);
  useEffect(() => { setHtml(""); setPages(0); if (doc) payrollApi.dasHtml(doc.id).then(setHtml).catch(() => setHtml("<p>Nepavyko įkelti</p>")); }, [doc]);
  return (
    <Dialog open={!!doc} onClose={onClose} fullWidth maxWidth="lg" disableScrollLock PaperProps={{ sx: { height: "90vh", borderRadius: 3 } }}>
      <DocHeader title={`Darbo apmokėjimo sistema · v${doc?.version || ""}`} sub={doc ? `patvirtinta ${doc.approved_date}` : ""}
        pages={pages} canPrint={!!html} onPrint={() => frame.current?.contentWindow?.print()} onClose={onClose} />
      <DialogContent sx={{ display: "flex", flexDirection: "column", pb: 2.5 }}>
        <DocFrame html={html} frameRef={frame} onPages={setPages} />
      </DialogContent>
    </Dialog>
  );
}

function ApproveDialog({ open, last, changes, onClose, onApproved }) {
  const [f, setF] = useState({ date: today(), manager: "", title: "Direktorius", city: "", ...DEFAULT_OPTS });
  const [html, setHtml] = useState("");
  const [pages, setPages] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const frame = useRef(null);
  useEffect(() => {
    if (!open) return;
    setError("");
    setF({ date: today(), manager: last?.manager_name || "", title: last?.manager_title || "Direktorius", city: last?.city || "",
      ...DEFAULT_OPTS, ...(last?.settings || {}), order_no: "" });
  }, [open, last]);
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => payrollApi.dasPreview(f.date, f.manager, f.title, f.city, optsOf(f)).then(setHtml).catch((e) => setError(apiError(e))), 300);
    return () => clearTimeout(t);
  }, [open, f]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const approve = async () => {
    setBusy(true); setError("");
    try { await payrollApi.dasApprove({ approved_date: f.date, manager_name: f.manager, manager_title: f.title, city: f.city, settings: optsOf(f) }); onApproved(); }
    catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };
  const version = (last?.version || 0) + 1;
  const reviewDue = !!last?.approved_date && (Date.now() - new Date(last.approved_date).getTime()) / 864e5 > 330;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" disableScrollLock PaperProps={{ sx: { height: "92vh", borderRadius: 3 } }}>
      <DocHeader title={version > 1 ? `Nauja versija v${version}` : "Darbo apmokėjimo sistemos patvirtinimas"}
        pages={pages} canPrint={!!html} onPrint={() => frame.current?.contentWindow?.print()} onClose={onClose} />
      <DialogContent sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 2.5, pb: 1 }}>
        <Stack gap={2} sx={{ width: { md: 300 }, flexShrink: 0, overflowY: "auto", pt: 1 }}>
          <TextField size="small" label="Patvirtinimo data" type="date" value={f.date} onChange={set("date")} InputLabelProps={{ shrink: true }} />
          <TextField size="small" label="Vadovo pareigos" value={f.title} onChange={set("title")} />
          <TextField size="small" label="Vadovo vardas, pavardė" value={f.manager} onChange={set("manager")} />
          <TextField size="small" label="Miestas" value={f.city} onChange={set("city")} placeholder="pvz. Vilnius" />
          <TextField size="small" label="Įsakymo Nr." value={f.order_no} onChange={set("order_no")} placeholder="pvz. V-12" />
          <Box sx={{ pt: .5 }}>
            <Stack direction="row" alignItems="center" gap={.5} mb={1}>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#344054" }}>Premijos</Typography>
              <Help text="Skatinamosios – įmonės iniciatyva, neprivalomos (dokumente – kriterijai ir didžiausias dydis). Už rezultatus – pagal iš anksto nustatytus rodiklius, įvykdžius tampa privalomos. Jei nemokate – „Netaikoma“." size={15} />
            </Stack>
            <TextField select size="small" fullWidth value={f.bonus} onChange={set("bonus")} SelectProps={{ MenuProps: { disableScrollLock: true } }}>
              <MenuItem value="discretionary">Skatinamosios (vadovo iniciatyva)</MenuItem>
              <MenuItem value="results">Už rezultatus pagal rodiklius</MenuItem>
              <MenuItem value="none">Netaikoma</MenuItem>
            </TextField>
            {f.bonus !== "none" && (
              <Stack direction="row" gap={1} mt={1.25}>
                <TextField size="small" label="Iki, % algos" type="number" value={f.bonus_max_pct} onChange={set("bonus_max_pct")} sx={{ width: 120 }}
                  InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} />
                {f.bonus === "results" && (
                  <TextField select size="small" label="Vertinama" value={f.bonus_period} onChange={set("bonus_period")} sx={{ flex: 1 }}
                    SelectProps={{ MenuProps: { disableScrollLock: true } }}>
                    <MenuItem value="month">kas mėnesį</MenuItem>
                    <MenuItem value="quarter">kas ketvirtį</MenuItem>
                    <MenuItem value="year">kas metus</MenuItem>
                  </TextField>
                )}
              </Stack>
            )}
            {f.bonus === "results" && (
              <Typography sx={{ fontSize: 12, color: "#B54708", mt: .75 }}>
                Įvykdžius sąlygas premija tampa privaloma. Jei nenorite įsipareigoti – rinkitės „Vadovo sprendimu“.
              </Typography>
            )}
          </Box>
          <Box>
            {version === 1 && (
              <>
                <Toggle checked={f.prev_ext} onChange={(v) => setF((s) => ({ ...s, prev_ext: v }))} label="Įmonė jau turi patvirtintą DAS"
                  help="Jei sistema anksčiau patvirtinta ne DokSkene – įsakyme ji bus pripažinta netekusia galios." />
                {f.prev_ext && (
                  <Stack direction="row" gap={1} sx={{ mt: .5, mb: 1 }}>
                    <TextField size="small" type="date" label="Patvirtinta" value={f.prev_ext_date} onChange={set("prev_ext_date")} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
                    <TextField size="small" label="Įsakymo Nr." value={f.prev_ext_no} onChange={set("prev_ext_no")} sx={{ width: 110 }} />
                  </Stack>
                )}
              </>
            )}
            <Toggle checked={f.reps} onChange={(v) => setF((s) => ({ ...s, reps: v }))} label="Įmonėje yra darbuotojų atstovai"
              help="Darbo taryba, profesinė sąjunga ar darbuotojų patikėtinis. Prieš tvirtinant su jais reikia atlikti informavimą ir konsultavimą (darbo taryba privaloma nuo 20 darbuotojų)." />
            {f.reps && (
              <TextField size="small" type="date" label="Konsultacijų data" value={f.reps_date} onChange={set("reps_date")} InputLabelProps={{ shrink: true }}
                fullWidth sx={{ mt: .5, mb: 1 }} />
            )}
            {reviewDue && (
              <Toggle checked={f.recompute} onChange={(v) => setF((s) => ({ ...s, recompute: v }))} label="Metinė peržiūra: ribos pagal dabartines algas"
                help="Automatinės grupių ribos bus perskaičiuotos pagal dabartines algas (gali ir susiaurėti). Rekomenduojama kartą per metus." />
            )}
          </Box>
          {version > 1 && changes.length > 0 && (
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: "#F9FAFB", border: "1px solid #EAECF0" }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "#344054", mb: .5 }}>Kas pasikeitė nuo v{version - 1}</Typography>
              {changes.map((c) => <Typography key={c} sx={{ fontSize: 12.5, color: "#475467", py: .2 }}>• {c}</Typography>)}
            </Box>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
        <DocFrame html={html} frameRef={frame} onPages={setPages} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Typography sx={{ fontSize: 12.5, color: "#667085", mr: "auto" }}>
          Patvirtinus – atsispausdinkite, pasirašykite ir supažindinkite darbuotojus. Tai šablonas – rekomenduojame peržiūrėti teisininkui.
        </Typography>
        <Button variant="contained" disableElevation disabled={busy || !f.date} onClick={approve} sx={BTN}>Patvirtinti v{version}</Button>
      </DialogActions>
    </Dialog>
  );
}

export function MergeDialog({ group, groups, onClose, onDone }) {
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { setTarget(""); setError(""); }, [group]);
  if (!group) return null;
  const go = async () => {
    try { const r = await payrollApi.mergeGroup(group.id, target); onDone(r.warning); } catch (e) { setError(apiError(e)); }
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" disableScrollLock>
      <DialogTitle>Sujungti grupę {group.code}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Visos grupės {group.code} pareigos bus perkeltos į pasirinktą grupę. Junkite tik lygiavertį darbą.
        </Typography>
        <TextField select fullWidth label="Į grupę" value={target} onChange={(e) => setTarget(e.target.value)}
          SelectProps={{ MenuProps: { disableScrollLock: true } }}>
          {groups.filter((g) => g.id !== group.id).map((g) => (
            <MenuItem key={g.id} value={g.id}>{g.code} – {g.name} ({g.total_score} / 25)</MenuItem>
          ))}
        </TextField>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Atšaukti</Button>
        <Button variant="contained" disabled={!target} onClick={go}>Sujungti</Button>
      </DialogActions>
    </Dialog>
  );
}

export function GroupDialog({ group, nextCode, onClose, onSaved }) {
  const [f, setF] = useState(null);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [opts, setOpts] = useState({ positions: [], lpk: [] });
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!group) return;
    setError(""); setInput(""); setTouched(false);
    setF({
      code: group.code || "", name: group.name || "", description: group.description || "",
      salary_min: group.salary_min || "", salary_max: group.salary_max || "",
      hourly_min: group.hourly_min || "", hourly_max: group.hourly_max || "",
      auto_range: group.id ? !!group.auto_range : true,
      positions: (group.positions || []).map((p) => ({ kind: "pos", key: `p${p.id}`, id: p.id, name: p.name, sub: "" })),
      ...Object.fromEntries(CRITERIA.map((c) => [c.key, group[c.key] || 3])),
    });
  }, [group]);

  useEffect(() => {
    if (!group) return;
    const t = setTimeout(() => payrollApi.searchPositions(input).then(setOpts).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [input, group]);

  if (!group || !f) return null;
  const set = (v) => setF((s) => ({ ...s, ...v }));

  const options = [
    ...opts.positions.map((p) => ({
      kind: "pos", key: `p${p.id}`, id: p.id, name: p.name,
      sub: [p.lpk_code, p.group_code && p.group_code !== f.code ? `dabar grupėje ${p.group_code}` : ""].filter(Boolean).join(" · "),
      suggested: p.suggested,
    })),
    ...opts.lpk.map((l) => ({ kind: "lpk", key: `l${l.code}`, code: l.code, name: l.title, sub: `${l.name} · ${l.code}`, suggested: l.suggested })),
  ];

  const save = async () => {
    try {
      const ids = [];
      for (const p of f.positions) {
        if (p.kind === "lpk") {
          const existing = opts.positions.find((x) => x.lpk_code === p.code);
          const pos = existing || await payrollApi.createPosition({ name: p.name, lpk_code: p.code });
          ids.push(pos.id);
        } else {
          ids.push(p.id);
        }
      }
      const { positions: _p, code: _c, ...rest } = f;
      const data = { ...rest, salary_min: f.salary_min || null, salary_max: f.salary_max || null,
        hourly_min: f.hourly_min || null, hourly_max: f.hourly_max || null, position_ids: ids };
      if (f.auto_range) { delete data.salary_min; delete data.salary_max; delete data.hourly_min; delete data.hourly_max; }
      if (group.id) await payrollApi.updateGroup(group.id, data); else await payrollApi.createGroup(data);
      onSaved();
    } catch (e) { setError(apiError(e)); }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" disableScrollLock>
      <DialogTitle sx={{ pr: 6 }}>
        {group.id ? "Grupė " + group.code : "Nauja pareigybių grupė"}
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 12, top: 12 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack gap={2} mt={1}>
          <Stack direction="row" gap={2}>
            <TextField label="Grupės nr." value={group.id ? f.code : nextCode} sx={{ width: 170 }} disabled
              helperText="Priskiriamas automatiškai" />
            <TextField label="Pavadinimas" value={f.name} onChange={(e) => set({ name: e.target.value })} fullWidth required />
          </Stack>
          <Autocomplete
            multiple options={options} value={f.positions} filterOptions={(x) => x}
            groupBy={(o) => (o.kind === "pos" ? "Jūsų įmonės pareigos" : "Profesijų klasifikatorius")}
            getOptionLabel={(o) => o.name || ""} isOptionEqualToValue={(a, b) => a.key === b.key}
            onInputChange={(_, v, reason) => reason === "input" && setInput(v)}
            onChange={(_, v) => {
              const patch = { positions: v };
              const first = v[0];
              if (!group.id && !touched && first?.suggested) {
                const { note, ...scores } = first.suggested;
                Object.assign(patch, scores, {
                  description: `Vertinimas pasiūlytas automatiškai pagal profesijų klasifikatorių - patikrinkite. ${note || ""}`.trim(),
                });
              }
              if (!f.name && first) patch.name = first.name;
              set(patch); setInput("");
            }}
            noOptionsText={input.length < 2 ? "Įveskite bent 2 raides" : "Nerasta"}
            renderOption={(props, o) => (
              <li {...props} key={o.key}>
                <Box>
                  <Typography fontSize={14}>{o.name}</Typography>
                  {o.sub && <Typography variant="caption" color="text.secondary">{o.sub}</Typography>}
                </Box>
              </li>
            )}
            renderInput={(p) => <TextField {...p} label="Pareigos šioje grupėje" placeholder="Ieškoti, pvz. buhalt" />}
          />
          <Box>
            <Typography fontWeight={600}>Kiek šis darbas reikalauja? (1 – mažai, 5 – labai daug)</Typography>
            <Typography variant="caption" color="text.secondary" display="block" mb={1}>
              Vertinamos pareigos, o ne žmogus. Darbuotojo patirtis ir rezultatai lemia, kokia jo alga bus grupės ribose.
            </Typography>
            {f.description?.replace(/Vertinimas pasiūlytas automatiškai.*patikrinkite\.\s*/, "") && (
              <Alert severity="info" sx={{ mb: 1.5, py: 0 }}>
                {f.description.replace(/Vertinimas pasiūlytas automatiškai.*patikrinkite\.\s*/, "")}
              </Alert>
            )}
            {CRITERIA.map((c) => (
              <Box key={c.key} sx={{ mb: 1 }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2">{c.label}</Typography>
                  <Typography variant="body2" fontWeight={700}>{f[c.key]}</Typography>
                </Stack>
                <Slider size="small" min={1} max={5} step={1} marks value={f[c.key]} onChange={(_, v) => { set({ [c.key]: v }); setTouched(true); }} />
                <Typography variant="caption" color="text.secondary">{c.help}</Typography>
              </Box>
            ))}
          </Box>
          {group.id && (group.positions || []).length > 1 && (
            <Box>
              <Typography variant="caption" color="text.secondary">Jei kurios nors pareigos nėra lygiavertės – išskirkite jas į atskirą grupę:</Typography>
              <Stack direction="row" gap={0.75} flexWrap="wrap" mt={0.5}>
                {group.positions.map((p) => (
                  <Chip key={p.id} size="small" variant="outlined" label={`${p.name} · išskirti`}
                    onClick={async () => {
                      if (!window.confirm(`Išskirti „${p.name}“ į atskirą grupę?`)) return;
                      try { await payrollApi.splitPosition(p.id); onSaved(); } catch (e) { setError(apiError(e)); }
                    }} />
                ))}
              </Stack>
            </Box>
          )}
          <FormControlLabel
            control={<Switch checked={f.auto_range} onChange={(e) => set({ auto_range: e.target.checked })} />}
            label={<Box><Typography variant="body2">Automatinės algų ribos</Typography>
              <Typography variant="caption" color="text.secondary">
                Pagal grupės darbuotojų algas su atsarga. Patvirtinus DAS ribos tik plečiasi, jei alga išeina už jų.
              </Typography></Box>} />
          <Stack direction="row" gap={2}>
            <TextField label="Mėnesinė alga nuo" type="number" value={f.salary_min} onChange={(e) => set({ salary_min: e.target.value })} fullWidth
              disabled={f.auto_range} size="small"
              InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }} />
            <TextField label="Mėnesinė alga iki" type="number" value={f.salary_max} onChange={(e) => set({ salary_max: e.target.value })} fullWidth
              disabled={f.auto_range} size="small"
              InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }} />
          </Stack>
          <Stack direction="row" gap={2}>
            <TextField label="Valandinis nuo" type="number" value={f.hourly_min} onChange={(e) => set({ hourly_min: e.target.value })} fullWidth
              disabled={f.auto_range} size="small"
              InputProps={{ endAdornment: <InputAdornment position="end">€/val.</InputAdornment> }} />
            <TextField label="Valandinis iki" type="number" value={f.hourly_max} onChange={(e) => set({ hourly_max: e.target.value })} fullWidth
              disabled={f.auto_range} size="small"
              InputProps={{ endAdornment: <InputAdornment position="end">€/val.</InputAdornment> }} />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Mėnesinė alga – visam etatui; valandinis atlygis – tik jei grupėje yra valandinį atlygį gaunančių. Į SDUP nepateikiama.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Atšaukti</Button>
        <Button variant="contained" onClick={save} disabled={!f.name || (!f.auto_range && !(f.salary_min && f.salary_max) && !(f.hourly_min && f.hourly_max))}>Išsaugoti</Button>
      </DialogActions>
    </Dialog>
  );
}
