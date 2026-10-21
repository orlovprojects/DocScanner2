import { useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, LinearProgress,
  Stack, Tab, Tabs, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import PersonOffOutlinedIcon from "@mui/icons-material/PersonOffOutlined";
import NotificationsOffOutlinedIcon from "@mui/icons-material/NotificationsOffOutlined";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import CloseIcon from "@mui/icons-material/Close";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { useNavigate } from "react-router-dom";

import { MONTHS } from "../../api/payroll";

// Grafiko taisymas po nebuvimų: baneris, paleidimo langas, peržiūra (kas keičiasi, kas paveikta, kam pranešama)
// ir paskelbimo patvirtinimas (kam bus išsiųstas pranešimas).

const GEN = ["sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio", "liepos", "rugpjūčio", "rugsėjo", "spalio", "lapkričio", "gruodžio"];
const WD = ["Pr", "An", "Tr", "Kt", "Pn", "Št", "Sk"];
const mName = (ym) => MONTHS[Number(ym.slice(5)) - 1];
const mGen = (ym) => GEN[Number(ym.slice(5)) - 1];
const md = (iso) => String(iso || "").slice(5).replace("-", "-");
const num = (v) => Number(v || 0);
const h = (v) => num(v).toLocaleString("lt-LT", { maximumFractionDigits: 1 });
const range = (a, b) => (a === b ? md(a) : `${md(a)}–${md(b)}`);

const BTN = { textTransform: "none", fontWeight: 650, borderRadius: 1.75, boxShadow: "none", "&:hover": { boxShadow: "none" } };

export const repairRunning = (rep) => {
  if (!rep || !["queued", "running"].includes(rep.state)) return false;
  const at = rep.started_at || rep.queued_at;
  return !at || Date.now() - new Date(at).getTime() < 15 * 60000;
};

// ---------- Baneris ----------
export function StaleBanner({ stale, repair, busy, onRepair, onPreview, onIgnore }) {
  const running = repairRunning(repair);
  const done = repair?.state === "done";
  if (!stale && !running && !done && repair?.state !== "error") return null;
  const lines = [];
  (stale?.new || []).forEach((x) => lines.push(["Naujas nebuvimas", `${x.name} – ${x.label.toLowerCase()} ${range(x.start, x.end)}`]));
  (stale?.changed || []).forEach((x) => lines.push(["Pakeistas nebuvimas", `${x.name} – ${x.label.toLowerCase()} ${range(x.start, x.end)} (buvo ${range(x.old_start, x.old_end)})`]));
  (stale?.removed || []).forEach((x) => lines.push(["Atšauktas nebuvimas", `${x.name} – ${x.label.toLowerCase()} ${range(x.start, x.end)}`]));
  (stale?.earlier || []).forEach((x) => lines.push([`Pakeistas ${mGen(x.ym)} grafikas`,
    `${x.names.slice(0, 4).join(", ")}${x.names.length > 4 ? ` ir dar ${x.names.length - 4}` : ""} – šio mėnesio valandų tikslai pasikeitė`]));
  return (
    <Box sx={{ mb: 1.6, px: 1.75, py: 1.4, borderRadius: 2.5, bgcolor: "#FFFAEB" }}>
      <Stack direction={{ xs: "column", md: "row" }} gap={1.5} alignItems={{ md: "flex-start" }}>
        <Stack direction="row" gap={1.3} sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ width: 30, height: 30, borderRadius: "50%", bgcolor: "#F79009", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <AutoFixHighOutlinedIcon sx={{ fontSize: 17, color: "#FFFFFF" }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: "#7A2E0E" }}>
              {stale ? "Grafikas nebeatitinka pasikeitusių duomenų" : "Grafiko pataisymai"}
            </Typography>
            {stale?.since && (
              <Typography sx={{ fontSize: 12, color: "#93370D", mb: .4 }}>Po grafiko sudarymo ({String(stale.since).slice(0, 10)}) pasikeitė:</Typography>
            )}
            {lines.map(([k, v], i) => (
              <Typography key={i} sx={{ fontSize: 12.5, color: "#344054", lineHeight: 1.6 }}><b>{k}:</b> {v}</Typography>
            ))}
            {running && (
              <Box sx={{ mt: 1, maxWidth: 520 }}>
                <Typography sx={{ fontSize: 12, color: "#93370D", mb: .5 }}>Ieškoma pataisymų – apie 20 s kiekvienam mėnesiui…</Typography>
                <LinearProgress color="warning" sx={{ borderRadius: 2 }} />
              </Box>
            )}
            {done && (
              <Typography sx={{ fontSize: 12.5, color: "#027A48", mt: .5, fontWeight: 600 }}>
                Pataisymai paruošti – peržiūrėkite ir pasirinkite, ką pritaikyti. Kol nepatvirtinsite, niekas nekeičiama.
              </Typography>
            )}
            {repair?.state === "error" && <Alert severity="error" sx={{ mt: 1, py: 0 }}>{repair.error}</Alert>}
          </Box>
        </Stack>
        <Stack direction="row" gap={1} sx={{ flexShrink: 0 }}>
          {stale && !running && (
            <Tooltip title="Grafiką jau pataisėte rankiniu būdu – pažymėti, kad jis atitinka duomenis">
              <Button size="small" disabled={busy} onClick={onIgnore} sx={{ ...BTN, color: "#93370D" }}>Jau sutvarkyta</Button>
            </Tooltip>
          )}
          {done ? (
            <Button size="small" variant="contained" disabled={busy} onClick={onPreview}
              sx={{ ...BTN, bgcolor: "#B54708", "&:hover": { bgcolor: "#93370D", boxShadow: "none" } }}>Peržiūrėti pataisymus</Button>
          ) : (
            <Button size="small" variant="contained" disabled={busy || running} onClick={onRepair}
              startIcon={<AutoFixHighOutlinedIcon sx={{ fontSize: "16px !important" }} />}
              sx={{ ...BTN, bgcolor: "#B54708", "&:hover": { bgcolor: "#93370D", boxShadow: "none" } }}>
              {running ? "Ieškoma…" : "Pataisyti grafiką"}
            </Button>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}

// ---------- Po prašymo / S15 / komandiruotės: kurie grafikai paveikti ----------
export function AffectedRosters({ items, onClose, onNavigate, sx }) {
  const navigate = useNavigate();
  if (!items?.length) return null;
  const go = (ym) => { onNavigate?.(); navigate(`/grafikai-ir-tabeliai?m=${ym}`); };
  return (
    <Box sx={{ px: 1.5, py: 1.2, borderRadius: 2.5, bgcolor: "#FFFAEB", ...sx }}>
      <Stack direction="row" gap={1.3} alignItems="flex-start">
        <Box sx={{ width: 28, height: 28, borderRadius: "50%", bgcolor: "#F79009", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <AutoFixHighOutlinedIcon sx={{ fontSize: 16, color: "#FFFFFF" }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: "#7A2E0E" }}>
            {items.length === 1 ? `${mGen(items[0].ym).charAt(0).toUpperCase()}${mGen(items[0].ym).slice(1)} grafikas nebeatitinka duomenų` : "Grafikai nebeatitinka duomenų"}
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: "#93370D" }}>
            Pasikeitė nebuvimai – peržiūrėkite grafiką ir pataisykite (pamainos, kurių nebeliko, užpildomos su kuo mažiau pakeitimų).
          </Typography>
          <Stack direction="row" gap={.8} flexWrap="wrap" sx={{ mt: .9 }}>
            {items.map((x) => (
              <Button key={x.ym} size="small" variant="outlined" endIcon={<ArrowForwardIcon sx={{ fontSize: "15px !important" }} />}
                onClick={() => go(x.ym)}
                sx={{ ...BTN, bgcolor: "#FFFFFF", color: "#93370D", borderColor: "#FEC84B", "&:hover": { borderColor: "#F79009", bgcolor: "#FFFFFF" } }}>
                Pataisyti: {mName(x.ym).toLowerCase()}{x.published ? " (paskelbtas)" : ""}
              </Button>
            ))}
          </Stack>
        </Box>
        {onClose && <IconButtonSmall onClick={onClose} />}
      </Stack>
    </Box>
  );
}

function IconButtonSmall({ onClick }) {
  return (
    <Box component="button" type="button" onClick={onClick} aria-label="Uždaryti"
      sx={{ border: 0, bgcolor: "transparent", cursor: "pointer", p: .3, borderRadius: 1, color: "#93370D", display: "grid", "&:hover": { bgcolor: "#FEF0C7" } }}>
      <CloseIcon sx={{ fontSize: 17 }} />
    </Box>
  );
}

// Grafikai: kiti to paties laikotarpio mėnesiai, kurių grafikas nebeatitinka duomenų
export function StaleMonthChips({ period, year, month, onGo }) {
  const cur = `${year}-${String(month).padStart(2, "0")}`;
  const items = (period || []).filter((x) => x.stale && x.ym !== cur);
  if (!items.length) return null;
  return items.map((x) => {
    const diff = (Number(x.ym.slice(0, 4)) * 12 + Number(x.ym.slice(5))) - (year * 12 + month);
    return (
      <Tooltip key={x.ym} arrow title={`${mName(x.ym)} grafikas nebeatitinka duomenų (pasikeitė nebuvimai) – atidaryti ir pataisyti`}>
        <Box component="button" type="button" onClick={() => onGo(diff)}
          sx={{ display: "inline-flex", alignItems: "center", gap: .5, height: 26, px: 1, border: "1px solid #FEC84B", borderRadius: 1.5,
            bgcolor: "#FFFAEB", color: "#B54708", fontSize: 12, fontWeight: 650, fontFamily: "inherit", cursor: "pointer",
            "&:hover": { bgcolor: "#FEF0C7" } }}>
          <Box component="span" sx={{ width: 15, height: 15, borderRadius: "50%", bgcolor: "#F79009", color: "#FFFFFF", fontSize: 10.5,
            fontWeight: 800, display: "grid", placeItems: "center" }}>!</Box>
          {mName(x.ym)}
        </Box>
      </Tooltip>
    );
  });
}

// ---------- Paleidimas ----------
export function RepairStartDialog({ open, period, ym, onClose, onStart }) {
  const chain = (period || []).filter((x) => x.ym >= ym && x.state !== "past" && x.has_shifts);
  const anyPublished = chain.some((x) => x.state === "published");
  const [mode, setMode] = useState("fill");
  useEffect(() => { if (open) setMode("fill"); }, [open]);
  const opt = (value, title, text) => (
    <Box key={value} onClick={() => setMode(value)}
      sx={{ p: 1.4, borderRadius: 2, cursor: "pointer", border: "1.5px solid", borderColor: mode === value ? "#1570EF" : "#EAECF0",
        bgcolor: mode === value ? "#F5F8FF" : "#FFFFFF" }}>
      <Stack direction="row" gap={1} alignItems="center">
        <Box sx={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid", borderColor: mode === value ? "#1570EF" : "#D0D5DD",
          display: "grid", placeItems: "center" }}>
          {mode === value && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#1570EF" }} />}
        </Box>
        <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{title}</Typography>
      </Stack>
      <Typography sx={{ fontSize: 12.5, color: "#475467", mt: .4, ml: 3 }}>{text}</Typography>
    </Box>
  );
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" disableScrollLock PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 800, pb: .5 }}>Pataisyti grafiką</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 13, color: "#475467", mb: 1.5 }}>
          Programa pasiūlys kuo mažiau pakeitimų: užpildys pamainas, kurių nebeliko dėl nebuvimų, ir parodys,
          kurie darbuotojai paveikti ir kam bus pranešta. <b>Kol nepatvirtinsite peržiūros, niekas nekeičiama.</b>
        </Typography>
        <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "#344054", mb: .6 }}>Bus tikrinami mėnesiai</Typography>
        <Stack direction="row" gap={.8} flexWrap="wrap" sx={{ mb: 1.75 }}>
          {chain.map((x) => (
            <Box key={x.ym} sx={{ px: 1.1, py: .45, borderRadius: 1.5, bgcolor: x.state === "published" ? "#ECFDF3" : "#F2F4F7" }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 650, color: "#344054" }}>
                {mName(x.ym)} <Box component="span" sx={{ fontWeight: 500, color: x.state === "published" ? "#027A48" : "#667085" }}>
                  · {x.state === "published" ? "paskelbtas" : "juodraštis"}</Box>
              </Typography>
            </Box>
          ))}
        </Stack>
        {anyPublished ? (
          <>
            <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "#344054", mb: .6 }}>Paskelbtuose mėnesiuose</Typography>
            <Stack gap={1}>
              {opt("fill", "Tik užpildyti trūkstamas pamainas", "Keičiama tik tiek, kiek reikia, kad pamainos nebūtų tuščios. Pirmiausia skiriami tie, kuriems trūksta valandų.")}
              {opt("balance", "Užpildyti ir išlyginti valandas", "Papildomai perskirstomos pamainos, kad darbuotojų valandos atitiktų tikslą. Gali keistis daugiau pamainų ir žmonių.")}
            </Stack>
            <Typography sx={{ fontSize: 12, color: "#667085", mt: 1 }}>Juodraščiuose visada užpildoma ir išlyginamos valandos.</Typography>
          </>
        ) : (
          <Typography sx={{ fontSize: 12.5, color: "#475467" }}>Juodraščiuose užpildomos spragos ir išlyginamos valandos.</Typography>
        )}
        <Box sx={{ mt: 1.75, p: 1.4, borderRadius: 2, bgcolor: "#F8FAFC" }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "#344054", mb: .4 }}>Nekeičiama</Typography>
          {["Praėjusios dienos ir šiandiena – tik nuo rytojaus",
            "Užrakintos pamainos",
            "Paskelbtame grafike pamainos nebuvimo dienomis lieka perbrauktos (pagal jas mažinama norma)"].map((t) => (
            <Typography key={t} sx={{ fontSize: 12.5, color: "#475467", lineHeight: 1.6 }}>• {t}</Typography>
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={BTN}>Atšaukti</Button>
        <Button variant="contained" disabled={!chain.length} onClick={() => onStart(anyPublished ? mode : "balance")} sx={BTN}>Ieškoti pataisymų</Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------- Pranešimo žymė ----------
const NOTIFY = {
  account: { icon: MailOutlineIcon, label: "Gaus pranešimą", sub: "savitarnoje ir el. paštu, paskelbus pakeitimus", color: "#027A48", bg: "#ECFDF3" },
  no_account: { icon: PersonOffOutlinedIcon, label: "Informuokite patys", sub: "neturi savitarnos ar el. pašto", color: "#B54708", bg: "#FFFAEB" },
  draft: { icon: NotificationsOffOutlinedIcon, label: "Nepranešama", sub: "grafikas dar neskelbtas", color: "#475467", bg: "#F2F4F7" },
  none: { icon: NotificationsOffOutlinedIcon, label: "Nepranešama", sub: "nebuvimo dienos – pamainos perbrauktos", color: "#475467", bg: "#F2F4F7" },
};

function NotifyBadge({ kind, late, sub }) {
  const n = NOTIFY[kind] || NOTIFY.none;
  const Icon = n.icon;
  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={.6} sx={{ display: "inline-flex", px: .9, py: .3, borderRadius: 1.25, bgcolor: n.bg }}>
        <Icon sx={{ fontSize: 14, color: n.color }} />
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: n.color }}>{n.label}</Typography>
      </Stack>
      <Typography sx={{ fontSize: 11, color: "#667085", mt: .3 }}>{sub || n.sub}</Typography>
      {late?.length > 0 && (
        <Tooltip title="Pakeitimas įsigalioja greičiau nei po 2 darbuotojo darbo dienų (DK 115 str.) – galima tik darbuotojui sutikus">
          <Stack direction="row" alignItems="center" gap={.4} sx={{ mt: .4, cursor: "help" }}>
            <WarningAmberRoundedIcon sx={{ fontSize: 14, color: "#DC6803" }} />
            <Typography sx={{ fontSize: 11.5, fontWeight: 650, color: "#B54708" }}>Reikia sutikimo ({late.map(md).join(", ")})</Typography>
          </Stack>
        </Tooltip>
      )}
    </Box>
  );
}

function Code({ sid, types, color, textColor, strike }) {
  if (!sid) return <Typography component="span" sx={{ fontSize: 12, color: "#98A2B3", fontWeight: 600 }}>laisva</Typography>;
  const t = types.find((x) => x.id === sid);
  return (
    <Box component="span" sx={{ display: "inline-block", minWidth: 22, px: .55, py: .1, borderRadius: .9, textAlign: "center",
      bgcolor: color(sid), color: textColor(sid), fontSize: 11.5, fontWeight: 700, textDecoration: strike ? "line-through" : "none",
      opacity: strike ? .55 : 1 }}>
      {t?.code || "?"}
    </Box>
  );
}

// ---------- Peržiūra ----------
export function RepairPreviewDialog({ open, repair, types, color, textColor, busy, onClose, onDiscard, onApply }) {
  const months = repair?.months || [];
  const [sel, setSel] = useState(() => new Set());
  const [tab, setTab] = useState(0);
  const [gridYm, setGridYm] = useState("");
  useEffect(() => {
    if (!open) return;
    const def = months.filter((m) => m.changes.length).map((m) => m.ym);
    setSel(new Set(def));
    setGridYm(def[0] || months[0]?.ym || "");
    setTab(0);
  }, [open, repair?.created_at]);  // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => (repair?.employees || []).map((e) => {
    const ch = e.changes.filter((c) => sel.has(c.ym));
    const ab = e.absent.filter((a) => sel.has(a.ym));
    const pub = ch.filter((c) => c.published);
    const notify = pub.length ? (e.has_account ? "account" : "no_account") : ch.length ? "draft" : "none";
    return { ...e, ch, ab, notify, lateSel: pub.filter((c) => c.late).map((c) => c.date) };
  }).filter((e) => e.ch.length || e.ab.length), [repair, sel]);

  const nNotify = rows.filter((r) => r.notify === "account").length;
  const nSelf = rows.filter((r) => r.notify === "no_account").length;
  const nLate = rows.filter((r) => r.lateSel.length).length;
  const selMonths = months.filter((m) => sel.has(m.ym));
  const nChanges = selMonths.reduce((s, m) => s + m.changes.length, 0);
  const anyPublished = selMonths.some((m) => m.published && m.changes.length);
  const toggle = (ym) => { const n = new Set(sel); if (n.has(ym)) n.delete(ym); else n.add(ym); setSel(n); };

  const stat = (icon, label, value, c) => (
    <Stack direction="row" alignItems="center" gap={.8} sx={{ px: 1.25, py: .75, borderRadius: 2, bgcolor: "#F8FAFC" }}>
      {icon}
      <Box>
        <Typography sx={{ fontSize: 17, fontWeight: 800, color: c || "#101828", lineHeight: 1.1 }}>{value}</Typography>
        <Typography sx={{ fontSize: 11.5, color: "#667085" }}>{label}</Typography>
      </Box>
    </Stack>
  );

  const gm = months.find((m) => m.ym === gridYm);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" disableScrollLock PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 800, pb: .25 }}>Grafiko pataisymai – peržiūra</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 13, color: "#475467", mb: 1.5 }}>
          Niekas nepakeista, kol nepatvirtinsite. Pažymėkite mėnesius, kuriuos taisyti.
        </Typography>

        <Stack direction="row" gap={1.25} flexWrap="wrap" sx={{ mb: 1.75 }}>
          {months.map((m) => {
            const people = new Set(m.changes.map((c) => c.employee_id)).size;
            const on = sel.has(m.ym);
            return (
              <Box key={m.ym} onClick={() => m.changes.length && toggle(m.ym)}
                sx={{ minWidth: 220, flex: "1 1 220px", maxWidth: 340, p: 1.25, borderRadius: 2, cursor: m.changes.length ? "pointer" : "default",
                  border: "1.5px solid", borderColor: on ? "#1570EF" : "#EAECF0", bgcolor: on ? "#F5F8FF" : "#FFFFFF" }}>
                <Stack direction="row" alignItems="center" gap={.5}>
                  <Checkbox size="small" checked={on} disabled={!m.changes.length} sx={{ p: .25 }} />
                  <Typography sx={{ fontSize: 14, fontWeight: 750 }}>{mName(m.ym)}</Typography>
                  <Box sx={{ ml: "auto", px: .8, py: .15, borderRadius: 1, fontSize: 11.5, fontWeight: 700,
                    bgcolor: m.published ? "#ECFDF3" : "#F2F4F7", color: m.published ? "#027A48" : "#475467" }}>
                    {m.published ? "Paskelbtas" : "Juodraštis"}
                  </Box>
                </Stack>
                <Typography sx={{ fontSize: 12.5, color: "#344054", mt: .6 }}>
                  {m.changes.length ? <><b>{m.changes.length}</b> pakeitimai · <b>{people}</b> darbuotojai</> : "Pakeitimų nereikia"}
                </Typography>
                <Typography sx={{ fontSize: 12, color: "#667085" }}>
                  Neužpildytos pamainos: {m.holes_before} → <b style={{ color: m.holes_after ? "#B42318" : "#027A48" }}>{m.holes_after}</b>
                  {" · "}nuo {md(m.start)}
                </Typography>
                {m.unmet?.length > 0 && (
                  <Typography sx={{ fontSize: 11.5, color: "#B42318", mt: .3 }}>Neįvykdyta: {m.unmet.map((u) => u.label).join(", ")}</Typography>
                )}
              </Box>
            );
          })}
        </Stack>

        <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 1.5 }}>
          {stat(<PeopleOutlineIcon sx={{ color: "#475467" }} />, "paveikti darbuotojai", rows.length)}
          {stat(<MailOutlineIcon sx={{ color: "#027A48" }} />, "gaus pranešimą", nNotify, "#027A48")}
          {stat(<PersonOffOutlinedIcon sx={{ color: "#B54708" }} />, "informuokite patys", nSelf, nSelf ? "#B54708" : undefined)}
          {stat(<WarningAmberRoundedIcon sx={{ color: "#DC6803" }} />, "reikia sutikimo", nLate, nLate ? "#B54708" : undefined)}
        </Stack>

        <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ minHeight: 36, borderBottom: "1px solid #EAECF0", mb: 1.25,
          "& .MuiTab-root": { textTransform: "none", fontWeight: 650, minHeight: 36, py: .5 } }}>
          <Tab label={`Paveikti darbuotojai (${rows.length})`} />
          <Tab label="Grafike" />
        </Tabs>

        {tab === 0 && (
          rows.length === 0 ? <Alert severity="info">Pasirinktuose mėnesiuose pakeitimų nėra.</Alert> : (
            <Box sx={{ border: "1px solid #EAECF0", borderRadius: 2, overflow: "hidden" }}>
              <Box sx={{ display: "grid", gridTemplateColumns: "190px minmax(0,1fr) 170px 230px", px: 1.5, py: .9, bgcolor: "#F9FAFB",
                borderBottom: "1px solid #EAECF0", "& > *": { fontSize: 12, fontWeight: 700, color: "#475467" } }}>
                <Typography>Darbuotojas</Typography><Typography>Kas keičiasi</Typography><Typography>Valandos</Typography><Typography>Pranešimas</Typography>
              </Box>
              {rows.map((r) => (
                <Box key={r.id} sx={{ display: "grid", gridTemplateColumns: "190px minmax(0,1fr) 170px 230px", gap: 1, px: 1.5, py: 1.1,
                  borderBottom: "1px solid #F2F4F7", alignItems: "start" }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 650, color: "#101828" }}>{r.name}</Typography>
                  <Box>
                    <Stack direction="row" gap={.75} flexWrap="wrap">
                      {r.ch.map((c) => (
                        <Stack key={`${c.ym}${c.date}`} direction="row" alignItems="center" gap={.5}
                          sx={{ px: .75, py: .35, borderRadius: 1.25, border: "1px solid", borderColor: c.late ? "#FEC84B" : "#EAECF0",
                            bgcolor: c.late ? "#FFFAEB" : "#FFFFFF" }}>
                          <Typography sx={{ fontSize: 11.5, fontWeight: 650, color: "#475467" }}>{md(c.date)}</Typography>
                          <Code sid={c.old} types={types} color={color} textColor={textColor} strike={!!c.old && !c.new} />
                          <Typography sx={{ fontSize: 11, color: "#98A2B3" }}>→</Typography>
                          <Code sid={c.new} types={types} color={color} textColor={textColor} />
                        </Stack>
                      ))}
                    </Stack>
                    {r.ab.length > 0 && (
                      <Stack direction="row" alignItems="center" gap={.5} sx={{ mt: r.ch.length ? .7 : 0 }}>
                        <EventBusyOutlinedIcon sx={{ fontSize: 14, color: "#667085" }} />
                        <Typography sx={{ fontSize: 12, color: "#667085" }}>
                          Nebuvimas {r.ab.map((a) => md(a.date)).join(", ")} – pamainos lieka perbrauktos
                        </Typography>
                      </Stack>
                    )}
                  </Box>
                  <Box>
                    {Object.entries(r.hours || {}).filter(([ym]) => sel.has(ym)).map(([ym, x]) => {
                      if (!x) return null;
                      const off = Math.abs(num(x.after) - num(x.target)) > 4;
                      return (
                        <Typography key={ym} sx={{ fontSize: 12.5, color: "#344054", lineHeight: 1.55 }}>
                          {selMonths.length > 1 && <Box component="span" sx={{ color: "#667085" }}>{mName(ym).slice(0, 4)}. </Box>}
                          {h(x.before)} → <b style={{ color: off ? "#B54708" : "#027A48" }}>{h(x.after)}</b>
                          <Box component="span" sx={{ color: "#667085" }}> / {h(x.target)}</Box>
                        </Typography>
                      );
                    })}
                  </Box>
                  <NotifyBadge kind={r.notify} late={r.lateSel} />
                </Box>
              ))}
            </Box>
          )
        )}

        {tab === 1 && gm && (
          <Box>
            {months.length > 1 && (
              <ToggleButtonGroup exclusive size="small" value={gridYm} onChange={(e, v) => v && setGridYm(v)} sx={{ mb: 1.25,
                "& .MuiToggleButton-root": { textTransform: "none", fontWeight: 650, px: 1.5, py: .4 } }}>
                {months.map((m) => <ToggleButton key={m.ym} value={m.ym}>{mName(m.ym)}</ToggleButton>)}
              </ToggleButtonGroup>
            )}
            <RepairGrid month={gm} employees={repair.employees} types={types} color={color} textColor={textColor} />
            <Stack direction="row" gap={2} flexWrap="wrap" sx={{ mt: 1.1 }}>
              {[["#D1FADF", "#039855", "Nauja pamaina"], ["#FEE4E2", "#D92D20", "Pašalinta"], ["#FEF0C7", "#DC6803", "Pakeista"],
                ["#F2F4F7", "#98A2B3", "Nebuvimas (perbraukta)"]].map(([bg, bd, t]) => (
                <Stack key={t} direction="row" alignItems="center" gap={.6}>
                  <Box sx={{ width: 14, height: 14, borderRadius: .75, bgcolor: bg, border: `1.5px solid ${bd}` }} />
                  <Typography sx={{ fontSize: 12, color: "#475467" }}>{t}</Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        )}

        {anyPublished && (
          <Alert severity="info" icon={<MailOutlineIcon fontSize="small" />} sx={{ mt: 1.75, borderRadius: 2 }}>
            Paskelbti mėnesiai bus atrakinti. Darbuotojai gaus pranešimą tik tada, kai paspausite <b>„Paskelbti pakeitimus“</b> –
            prieš tai dar kartą parodysime, kam jis bus išsiųstas.
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button color="error" disabled={busy} onClick={onDiscard} sx={BTN}>Atmesti pataisymus</Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={onClose} sx={BTN}>Uždaryti</Button>
        <Button variant="contained" disabled={busy || !nChanges} onClick={() => onApply([...sel])} sx={BTN}>
          Pritaikyti {nChanges} pakeitimus{selMonths.length > 1 ? ` (${selMonths.length} mėn.)` : ""}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RepairGrid({ month, employees, types, color, textColor }) {
  const days = [];
  for (let d = new Date(`${month.start}T00:00:00`); d <= new Date(`${month.end}T00:00:00`); d.setDate(d.getDate() + 1)) {
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  const ch = new Map(month.changes.map((c) => [`${c.employee_id}|${c.date}`, c]));
  const ab = new Set(month.absent.map((a) => `${a.employee_id}|${a.date}`));
  const ids = [...new Set([...month.changes.map((c) => c.employee_id), ...month.absent.map((a) => a.employee_id)])];
  const name = (id) => employees.find((e) => e.id === id)?.name || id;
  const code = (sid) => types.find((t) => t.id === sid)?.code || "?";
  const cell = (id, dd) => {
    const k = `${id}|${dd}`;
    const c = ch.get(k);
    const cur = month.current?.[id]?.[dd];
    const base = { height: 26, borderRadius: .9, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 };
    if (ab.has(k)) {
      return <Tooltip title="Nebuvimas – pamaina lieka perbraukta"><Box sx={{ ...base, bgcolor: "#F2F4F7", border: "1.5px solid #D0D5DD", color: "#98A2B3", textDecoration: "line-through" }}>{code(cur)}</Box></Tooltip>;
    }
    if (c && c.old && c.new) return <Tooltip title={`${code(c.old)} → ${code(c.new)}`}><Box sx={{ ...base, bgcolor: "#FEF0C7", border: "1.5px solid #FDB022", color: "#93370D", fontSize: 10 }}>{code(c.old)}→{code(c.new)}</Box></Tooltip>;
    if (c && c.new) return <Tooltip title={`Nauja pamaina ${code(c.new)}`}><Box sx={{ ...base, bgcolor: "#D1FADF", border: "1.5px solid #32D583", color: "#05603A" }}>{code(c.new)}</Box></Tooltip>;
    if (c && c.old) return <Tooltip title={`Pašalinta ${code(c.old)}`}><Box sx={{ ...base, bgcolor: "#FEE4E2", border: "1.5px solid #F97066", color: "#B42318", textDecoration: "line-through" }}>{code(c.old)}</Box></Tooltip>;
    if (cur) return <Box sx={{ ...base, bgcolor: color(cur), color: textColor(cur), opacity: .55 }}>{code(cur)}</Box>;
    return <Box sx={{ ...base }} />;
  };
  return (
    <Box sx={{ overflowX: "auto", border: "1px solid #EAECF0", borderRadius: 2 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: `170px repeat(${days.length}, 34px)`, minWidth: "max-content" }}>
        <Box sx={{ position: "sticky", left: 0, bgcolor: "#F9FAFB", zIndex: 1, borderBottom: "1px solid #EAECF0" }} />
        {days.map((dd) => {
          const wd = (new Date(`${dd}T00:00:00`).getDay() + 6) % 7;
          return (
            <Box key={dd} sx={{ textAlign: "center", py: .5, bgcolor: wd >= 5 ? "#FEF3F2" : "#F9FAFB", borderBottom: "1px solid #EAECF0" }}>
              <Typography sx={{ fontSize: 9.5, color: wd >= 5 ? "#D92D20" : "#667085", fontWeight: 600 }}>{WD[wd]}</Typography>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#344054" }}>{Number(dd.slice(8))}</Typography>
            </Box>
          );
        })}
        {ids.map((id) => [
          <Box key={`n${id}`} sx={{ position: "sticky", left: 0, bgcolor: "#FFFFFF", zIndex: 1, px: 1.25, display: "flex", alignItems: "center",
            borderBottom: "1px solid #F2F4F7" }}>
            <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 650 }}>{name(id)}</Typography>
          </Box>,
          ...days.map((dd) => <Box key={`${id}${dd}`} sx={{ p: .3, borderBottom: "1px solid #F2F4F7" }}>{cell(id, dd)}</Box>),
        ])}
      </Box>
    </Box>
  );
}

// ---------- Paskelbimas: kam bus pranešta ----------
export function PublishPreviewDialog({ open, preview, busy, onClose, onConfirm }) {
  const [agree, setAgree] = useState(false);
  useEffect(() => { if (open) setAgree(false); }, [open]);
  if (!preview) return null;
  const emps = preview.employees || [];
  const late = preview.late > 0;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" disableScrollLock PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 800, pb: .5 }}>{preview.first ? "Paskelbti grafiką" : "Paskelbti pakeitimus"}</DialogTitle>
      <DialogContent>
        {emps.length === 0 ? (
          <Alert severity="info">Pakeitimų nėra – grafikas bus grąžintas į paskelbtą būseną, pranešimai nesiunčiami.</Alert>
        ) : (
          <>
            <Typography sx={{ fontSize: 13.5, color: "#344054", mb: 1.25 }}>
              Pranešimą savitarnoje ir el. paštu gaus <b>{preview.notify}</b> {preview.notify === 1 ? "darbuotojas" : "darbuotojai"}.
              {preview.no_account > 0 && <> <b style={{ color: "#B54708" }}>{preview.no_account}</b> neturi savitarnos ar el. pašto – juos informuokite patys.</>}
            </Typography>
            <Box sx={{ border: "1px solid #EAECF0", borderRadius: 2, overflow: "hidden", maxHeight: 420, overflowY: "auto" }}>
              {emps.map((e) => (
                <Box key={e.id} sx={{ display: "grid", gridTemplateColumns: "190px minmax(0,1fr) 210px", gap: 1, px: 1.5, py: 1,
                  borderBottom: "1px solid #F2F4F7", alignItems: "start" }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 650 }}>{e.name}</Typography>
                  <Box>
                    {e.lines.slice(0, 6).map((l) => <Typography key={l} sx={{ fontSize: 12.5, color: "#475467", lineHeight: 1.55 }}>{l}</Typography>)}
                    {e.lines.length > 6 && <Typography sx={{ fontSize: 12, color: "#667085" }}>ir dar {e.lines.length - 6}</Typography>}
                  </Box>
                  <NotifyBadge kind={e.has_account ? "account" : "no_account"} late={e.late}
                    sub={e.has_account ? "savitarnoje ir el. paštu" : undefined} />
                </Box>
              ))}
            </Box>
            {late && (
              <Alert severity="warning" sx={{ mt: 1.5, borderRadius: 2 }}>
                {preview.late} darbuotojų pakeitimai įsigalioja greičiau nei po 2 jų darbo dienų (DK 115 str.). Tai galima tik
                darbuotojui sutikus – tai bus pažymėta grafiko istorijoje.
                <FormControlLabel sx={{ display: "flex", mt: .5 }}
                  control={<Checkbox size="small" checked={agree} onChange={(e) => setAgree(e.target.checked)} />}
                  label={<Typography sx={{ fontSize: 13, fontWeight: 650 }}>Darbuotojai su pakeitimais sutinka</Typography>} />
              </Alert>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={BTN}>Atšaukti</Button>
        <Button variant="contained" disabled={busy || (late && !agree)} onClick={() => onConfirm(late)} sx={BTN}>
          {emps.length === 0 ? "Grąžinti" : preview.notify ? `Paskelbti ir pranešti (${preview.notify})` : "Paskelbti"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
