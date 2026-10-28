import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, Dialog, Divider, IconButton, MenuItem, Select, Skeleton, Stack, Tab, Tabs,
  TextField, Tooltip, Typography,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import RefreshIcon from "@mui/icons-material/Refresh";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import BeachAccessOutlinedIcon from "@mui/icons-material/BeachAccessOutlined";
import FamilyRestroomOutlinedIcon from "@mui/icons-material/FamilyRestroomOutlined";
import EuroOutlinedIcon from "@mui/icons-material/EuroOutlined";
import MoneyOffOutlinedIcon from "@mui/icons-material/MoneyOffOutlined";
import ChildCareOutlinedIcon from "@mui/icons-material/ChildCareOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import WorkOffOutlinedIcon from "@mui/icons-material/WorkOffOutlined";
import ThumbUpAltOutlinedIcon from "@mui/icons-material/ThumbUpAltOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import BalanceOutlinedIcon from "@mui/icons-material/BalanceOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import { useNavigate } from "react-router-dom";

import { apiError, payrollApi } from "../../api/payroll";
import { AffectedRosters } from "./RosterRepair";

const CARD = { borderRadius: 3, border: "1px solid #EAECF0", boxShadow: "0 1px 3px rgba(16,24,40,.04)", bgcolor: "#FFFFFF" };
const BTN = { textTransform: "none", fontWeight: 600, borderRadius: 1.75, boxShadow: "none", "&:hover": { boxShadow: "none" } };
const list = (d) => (Array.isArray(d) ? d : d?.results || []);
const MON = ["SAU", "VAS", "KOV", "BAL", "GEG", "BIR", "LIE", "RGP", "RGS", "SPA", "LAP", "GRU"];
const MON_GEN = ["sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio", "liepos", "rugpjūčio", "rugsėjo", "spalio", "lapkričio", "gruodžio"];
const WD = ["Sk", "Pr", "An", "Tr", "Kt", "Pn", "Št"];
const md = (iso) => String(iso || "").slice(5);
const AVATAR = ["#0EA5E9", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#10B981", "#EF4444", "#F59E0B", "#3B82F6"];
const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
const avatarColor = (id) => AVATAR[Math.abs(Number(id) || 0) % AVATAR.length];
const ago = (iso) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "šiandien" : d === 1 ? "vakar" : `prieš ${d} d.`;
};

// ---------- Prašymų tipai (spalvos - kaip nebuvimų grafike ir tabelyje) ----------
const CATS = {
  vacation: { l: "Kasmetinės atostogos", c: "#0E7490", bg: "#CFFAFE", i: BeachAccessOutlinedIcon },
  unpaid: { l: "Nemokamos atostogos", c: "#6D28D9", bg: "#EDE9FE", i: MoneyOffOutlinedIcon },
  parent_day: { l: "Mamadienis / tėvadienis", c: "#BE185D", bg: "#FCE7F3", i: FamilyRestroomOutlinedIcon },
  paternity: { l: "Tėvystės atostogos", c: "#9D174D", bg: "#FCE7F3", i: ChildCareOutlinedIcon },
  childcare: { l: "Vaiko priežiūros atostogos", c: "#9D174D", bg: "#FCE7F3", i: ChildCareOutlinedIcon },
  study: { l: "Mokymosi atostogos", c: "#1D4ED8", bg: "#DBEAFE", i: SchoolOutlinedIcon },
  pay_info: { l: "Informacija apie DU", c: "#4338CA", bg: "#E0E7FF", i: EuroOutlinedIcon },
  dismissal: { l: "Darbo sutarties nutraukimas", c: "#B42318", bg: "#FEE4E2", i: LogoutOutlinedIcon },
  other: { l: "Kita", c: "#475467", bg: "#F2F4F7", i: DescriptionOutlinedIcon },
};
const catOf = (kind) => (CATS[kind] ? kind : "other");
const PREF = {
  day_off: { l: "Laisva diena", c: "#6D28D9", bg: "#EDE9FE", i: EventBusyOutlinedIcon },
  avoid: { l: "Nenori dirbti", c: "#C2410C", bg: "#FFEDD5", i: WorkOffOutlinedIcon },
  want: { l: "Nori dirbti", c: "#15803D", bg: "#DCFCE7", i: ThumbUpAltOutlinedIcon },
};
const STATUS = { pending: ["Laukia", "#C4320A", "#FFF4ED"], approved: ["Patvirtinta", "#027A48", "#ECFDF3"],
  rejected: ["Atmesta", "#B42318", "#FEF3F2"], cancelled: ["Atšaukta", "#475467", "#F2F4F7"] };

function Tag({ cfg, label }) {
  const Icon = cfg.i;
  return (
    <Stack direction="row" alignItems="center" gap={.5} sx={{ px: .8, py: .2, borderRadius: 1.25, bgcolor: cfg.bg, display: "inline-flex", maxWidth: "100%" }}>
      <Icon sx={{ fontSize: 14, color: cfg.c, flexShrink: 0 }} />
      <Typography noWrap sx={{ fontSize: 12, fontWeight: 500, color: cfg.c }}>{label || cfg.l}</Typography>
    </Stack>
  );
}
function NameLine({ name, position }) {
  return (
    <Stack direction="row" alignItems="baseline" gap={.8} sx={{ minWidth: 0 }}>
      <Typography noWrap sx={{ fontSize: 14, fontWeight: 600, color: "#101828", flexShrink: 0 }}>{name}</Typography>
      {position && <Typography noWrap sx={{ fontSize: 12.5, color: "#667085", minWidth: 0 }}>{position}</Typography>}
    </Stack>
  );
}

function StatusPill({ st }) {
  return (
    <Stack direction="row" alignItems="center" gap={.6} sx={{ px: 1, py: .3, borderRadius: 10, bgcolor: st[2], flexShrink: 0 }}>
      <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: st[1] }} />
      <Typography sx={{ fontSize: 12, fontWeight: 500, color: st[1] }}>{st[0]}</Typography>
    </Stack>
  );
}
const COUNT = (c) => ({ minWidth: 20, height: 20, px: .6, borderRadius: 10, bgcolor: c, color: "#FFFFFF", fontSize: 11.5,
  fontWeight: 600, display: "grid", placeItems: "center" });

// ============================================================
// Prašymai / Grafiko pageidavimai
// ============================================================
function RequestsCard({ rows, loading, status, setStatus, prefs, onRefresh, onOpen, pendingCount, tab, setTab }) {
  const navigate = useNavigate();
  const [cat, setCat] = useState("all");
  const counts = useMemo(() => {
    const m = {};
    rows.forEach((r) => { const k = catOf(r.kind); m[k] = (m[k] || 0) + 1; });
    return m;
  }, [rows]);
  useEffect(() => { if (cat !== "all" && !counts[cat]) setCat("all"); }, [counts, cat]);
  const shown = rows.filter((r) => cat === "all" || catOf(r.kind) === cat);
  const refresh = (
    <Tooltip title="Atnaujinti – parodyti naujus prašymus ir pageidavimus">
      <IconButton size="small" onClick={onRefresh} disabled={loading}
        sx={{ border: "1px solid #D0D5DD", borderRadius: 1.75, width: 32, height: 32 }}>
        <RefreshIcon sx={{ fontSize: 18, animation: loading ? "spin 1s linear infinite" : "none", "@keyframes spin": { to: { transform: "rotate(360deg)" } } }} />
      </IconButton>
    </Tooltip>
  );
  const empty = (text) => (
    <Stack alignItems="center" gap={1} sx={{ py: 5, color: "#98A2B3" }}>
      <TaskAltIcon sx={{ fontSize: 36 }} />
      <Typography sx={{ fontSize: 13.5, color: "#667085" }}>{text}</Typography>
    </Stack>
  );
  return (
    <Box id="requests" sx={CARD}>
      <Stack direction="row" alignItems="center" gap={1} sx={{ px: 2.25, pt: 1, borderBottom: "1px solid #EAECF0", flexWrap: "wrap" }}>
        <Tabs value={tab} onChange={(e, v) => setTab(v)}
          sx={{ minHeight: 46, "& .MuiTab-root": { textTransform: "none", fontWeight: 600, fontSize: 14.5, minHeight: 46, px: 1, mr: 1.5 } }}>
          <Tab value="req" label={<Stack direction="row" gap={.8} alignItems="center">Prašymai
            {pendingCount > 0 && <Box component="span" sx={{ px: .75, py: .1, borderRadius: 1, fontSize: 12, fontWeight: 700, lineHeight: 1.6, bgcolor: "#FEE4E2", color: "#B42318" }}>{pendingCount}</Box>}</Stack>} />
          <Tab value="pref" label={<Stack direction="row" gap={.8} alignItems="center">Grafiko pageidavimai
            {prefs.length > 0 && <Box component="span" sx={{ px: .75, py: .1, borderRadius: 1, fontSize: 12, fontWeight: 700, lineHeight: 1.6, bgcolor: "#F2F4F7", color: "#475467" }}>{prefs.length}</Box>}</Stack>} />
        </Tabs>
        <Box sx={{ flex: 1 }} />
        {tab === "req" && (
          <Select size="small" value={status} onChange={(e) => setStatus(e.target.value)}
            sx={{ fontSize: 13, height: 32, borderRadius: 1.75, "& fieldset": { borderColor: "#D0D5DD" } }} MenuProps={{ disableScrollLock: true }}>
            <MenuItem value="pending">Laukia sprendimo</MenuItem>
            <MenuItem value="decided">Išnagrinėti</MenuItem>
            <MenuItem value="all">Visi</MenuItem>
          </Select>
        )}
        {refresh}
      </Stack>

      {tab === "req" ? (
        <Box sx={{ p: 2.25 }}>
          {rows.length > 0 && (
            <Stack direction="row" gap={.8} flexWrap="wrap" sx={{ mb: 1.75 }}>
              {[["all", "Visi", rows.length], ...Object.keys(CATS).filter((k) => counts[k]).map((k) => [k, CATS[k].l, counts[k]])].map(([k, l, n]) => (
                <Chip key={k} size="small" label={`${l} · ${n}`} onClick={() => setCat(k)}
                  sx={{ height: 28, fontWeight: 500, fontSize: 12.5, borderRadius: 1.75, bgcolor: cat === k ? "#101828" : "#F2F4F7",
                    color: cat === k ? "#FFFFFF" : "#344054", "&:hover": { bgcolor: cat === k ? "#101828" : "#E4E7EC" } }} />
              ))}
            </Stack>
          )}
          {loading && !rows.length ? (
            <Stack gap={1}>{[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={66} sx={{ borderRadius: 2 }} />)}</Stack>
          ) : !shown.length ? empty(status === "pending" ? "Naujų prašymų nėra" : "Prašymų nėra") : (
            <Stack gap={1}>
              {shown.map((r) => {
                const st = STATUS[r.status] || STATUS.pending;
                const dates = r.kind === "pay_info" ? "Prašymas pateikti informaciją apie DU"
                  : r.kind === "dismissal" ? `Paskutinė darbo diena ${r.end_date}`
                    : `${r.start_date === r.end_date ? md(r.start_date) : `${md(r.start_date)} – ${md(r.end_date)}`}`;
                return (
                  <Stack key={r.id} direction="row" alignItems="center" gap={1.5} onClick={() => onOpen(r)}
                    sx={{ p: 1.4, borderRadius: 2, border: "1px solid #EAECF0", cursor: "pointer", transition: ".15s",
                      "&:hover": { borderColor: "#B2CCFF", bgcolor: "#F8FAFF" } }}>
                    <Avatar sx={{ width: 40, height: 40, bgcolor: avatarColor(r.employee), fontSize: 14, fontWeight: 600 }}>{initials(r.employee_name)}</Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <NameLine name={r.employee_name} position={r.employee_position} />
                      <Stack direction="row" alignItems="center" gap={1} sx={{ mt: .5, minWidth: 0 }}>
                        <Box sx={{ flexShrink: 0 }}><Tag cfg={CATS[catOf(r.kind)]} /></Box>
                        <Typography noWrap sx={{ fontSize: 12.5, color: "#475467" }}>
                          <span style={{ color: "#344054", fontWeight: 500 }}>{dates}</span>
                          {Number(r.work_days) > 0 && r.kind !== "dismissal" ? ` · ${Number(r.work_days)} d.d.` : ""}
                          {r.comment ? ` · „${r.comment}“` : ""}
                        </Typography>
                      </Stack>
                    </Box>
                    <StatusPill st={st} />
                    <Typography sx={{ fontSize: 12, color: "#98A2B3", whiteSpace: "nowrap" }}>{ago(r.created_at)}</Typography>
                    <ChevronRightIcon sx={{ color: "#98A2B3" }} />
                  </Stack>
                );
              })}
            </Stack>
          )}
        </Box>
      ) : (
        <Box sx={{ p: 2.25 }}>
          <Typography sx={{ fontSize: 12.5, color: "#667085", mb: 1.5 }}>
            Pageidavimai netvirtinami – sudarant grafiką į juos atsižvelgiama automatiškai.
          </Typography>
          {!prefs.length ? empty("Artimiausiu metu pageidavimų nėra") : (
            <Stack gap={1}>
              {prefs.map((p) => {
                const cfg = PREF[p.kind] || PREF.day_off;
                const d = new Date(`${p.date}T00:00:00`);
                return (
                  <Stack key={p.id} direction="row" alignItems="center" gap={1.5} sx={{ p: 1.4, borderRadius: 2, border: "1px solid #EAECF0" }}>
                    <Avatar sx={{ width: 40, height: 40, bgcolor: avatarColor(p.employee_id), fontSize: 14, fontWeight: 600 }}>{initials(p.employee_name)}</Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <NameLine name={p.employee_name} position={p.employee_position} />
                      <Stack direction="row" alignItems="center" gap={1} sx={{ mt: .5, minWidth: 0 }}>
                        <Box sx={{ flexShrink: 0 }}><Tag cfg={cfg} label={p.shift ? `${cfg.l} · ${p.shift}` : cfg.l} /></Box>
                        <Typography noWrap sx={{ fontSize: 12.5, color: "#475467" }}>
                          <span style={{ color: "#344054", fontWeight: 500 }}>{MON_GEN[d.getMonth()]} {d.getDate()} d. ({WD[d.getDay()]})</span>{p.comment ? ` · „${p.comment}“` : ""}
                        </Typography>
                      </Stack>
                    </Box>
                    <Button size="small" endIcon={<ArrowForwardIcon sx={{ fontSize: "15px !important" }} />}
                      onClick={() => navigate(`/grafikai-ir-tabeliai?m=${p.date.slice(0, 7)}`)}
                      sx={{ ...BTN, color: "#475467" }}>Grafike</Button>
                  </Stack>
                );
              })}
            </Stack>
          )}
        </Box>
      )}
    </Box>
  );
}

// ============================================================
// Prašymo peržiūra
// ============================================================
const A4_W = 794;
const A4_H = 1123;
const A4_SCALE = 0.72;
// Bet koks išsaugotas prašymo HTML (ir senesni) - į A4 lapą: dokumentų rengimo paraštės, Times New Roman 12 pt
const A4_CSS = `
@page { size: A4; margin: 0; }
html, body { margin: 0 !important; background: #fff; }
body { max-width: none !important; box-sizing: border-box; position: relative; width: 210mm; height: 297mm; overflow: hidden;
  padding: 25mm 22mm 30mm 22mm !important; margin: 0 !important;
  font-family: "Times New Roman", Times, serif !important; font-size: 12pt !important; line-height: 1.55 !important; color: #000 !important; }
p { margin: 0 0 6pt; text-align: justify; }
h1 { font-size: 12.5pt !important; font-weight: bold; text-align: center; margin: 54pt 0 8pt !important; letter-spacing: .3pt; line-height: 1.45; }
.c, .date { text-align: center; margin-bottom: 36pt !important; }
.to { margin-top: 30pt; }
.text p { text-indent: 12.7mm; }
p + p { margin-top: 0; }
.meta { position: absolute; left: 22mm; right: 22mm; bottom: 15mm; margin: 0 !important; padding-top: 5pt;
  border-top: 1px solid #bbb; font-size: 8.5pt !important; color: #555 !important; text-align: left; }
`;
function a4Document(html) {
  const style = `<style id="a4">${A4_CSS}</style>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${style}</head>`);
  return `<!doctype html><html lang="lt"><head><meta charset="utf-8">${style}</head><body>${html}</body></html>`;
}

const CHECK = {
  ok: [CheckIcon, "#039855", "#ECFDF3", "#05603A"],
  warn: [WarningAmberRoundedIcon, "#DC6803", "#FFFAEB", "#93370D"],
  info: [InfoOutlinedIcon, "#1570EF", "#EFF8FF", "#175CD3"],
};

function RequestDialog({ req, onClose, onDecided }) {
  const [rev, setRev] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(null);   // atmetimo priežastis
  const [answer, setAnswer] = useState(null);         // DU informacijos atsakymas
  const frame = useRef(null);
  useEffect(() => {
    if (!req) return;
    setRev(null); setError(""); setRejecting(null); setAnswer(null);
    payrollApi.requestReview(req.id).then(setRev).catch((e) => setError(apiError(e)));
  }, [req]);
  if (!req) return null;
  const cfg = CATS[catOf(req.kind)];
  const pending = req.status === "pending";
  const run = async (fn) => {
    setBusy(true); setError("");
    try { const r = await fn(); onDecided(r); } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };
  const approve = () => run(() => payrollApi.approveRequest(req.id));
  const reject = () => run(() => payrollApi.rejectRequest(req.id, rejecting));
  const sendAnswer = () => run(() => payrollApi.approveRequest(req.id, answer));
  const openAnswer = async () => {
    try { const r = await payrollApi.requestAnswerPreview(req.id); setAnswer(r.answer || ""); } catch (e) { setError(apiError(e)); }
  };
  const print = () => { try { frame.current?.contentWindow?.focus(); frame.current?.contentWindow?.print(); } catch { /* nesvarbu */ } };
  const doc = a4Document(rev?.html || "");
  const st = STATUS[req.status] || STATUS.pending;

  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth disableScrollLock PaperProps={{ sx: { borderRadius: 3, overflow: "hidden" } }}>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ px: 2.5, py: 1.5, borderBottom: "1px solid #EAECF0" }}>
        <Avatar sx={{ width: 38, height: 38, bgcolor: avatarColor(req.employee), fontSize: 13.5, fontWeight: 600 }}>{initials(req.employee_name)}</Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 600 }}>{req.employee_name}</Typography>
          <Typography sx={{ fontSize: 12.5, color: "#667085" }}>
            {(rev?.employee_position || req.employee_position) ? `${rev?.employee_position || req.employee_position} · ` : ""}
            Pateikta esavitarna.lt {new Date(req.created_at).toLocaleString("lt-LT")}
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={print} disabled={!rev?.html}
          sx={{ ...BTN, fontWeight: 500, color: "#344054", borderColor: "#D0D5DD" }}>Spausdinti</Button>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0,1fr) 340px" }, bgcolor: "#F2F4F7" }}>
        <Box sx={{ p: { xs: 1.5, md: 3 }, display: "flex", justifyContent: "center", maxHeight: "78vh", overflow: "auto" }}>
          {!rev ? <CircularProgress sx={{ my: 10 }} /> : rev.html ? (
            // A4 lapas (210 x 297 mm = 794 x 1123 px), sumažintas iki ekrano; spausdinama tokiu pat išdėstymu
            <Box sx={{ width: A4_W * A4_SCALE, height: A4_H * A4_SCALE, flexShrink: 0, bgcolor: "#FFFFFF",
              boxShadow: "0 1px 2px rgba(16,24,40,.06), 0 8px 24px rgba(16,24,40,.12)" }}>
              <Box component="iframe" ref={frame} title="Prašymas" srcDoc={doc} sandbox="allow-same-origin allow-modals"
                sx={{ width: A4_W, height: A4_H, border: 0, transform: `scale(${A4_SCALE})`, transformOrigin: "0 0", display: "block" }} />
            </Box>
          ) : (
            <Typography sx={{ my: 10, color: "#667085" }}>Prašymo teksto nėra.</Typography>
          )}
        </Box>
        <Box sx={{ bgcolor: "#FFFFFF", borderLeft: "1px solid #EAECF0", p: 2.25, display: "flex", flexDirection: "column" }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
            <Box sx={{ minWidth: 0 }}><Tag cfg={cfg} /></Box>
            <StatusPill st={st} />
          </Stack>
          {rev && (
            <Stack gap={1.2} sx={{ mt: 2 }}>
              {rev.facts.map(([l, v]) => (
                <Stack key={l} direction="row" justifyContent="space-between" gap={1}>
                  <Typography sx={{ fontSize: 13, color: "#667085" }}>{l}</Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 500, color: "#101828", textAlign: "right" }}>{v}</Typography>
                </Stack>
              ))}
              {req.comment && <Typography sx={{ fontSize: 13, color: "#344054", fontStyle: "italic" }}>„{req.comment}“</Typography>}
            </Stack>
          )}
          {rev?.checks?.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: "#344054", mb: .8 }}>Prieš tvirtinant</Typography>
              <Stack gap={.8}>
                {rev.checks.map((c, i) => {
                  const [Icon, ic, bg, tx] = CHECK[c.level] || CHECK.info;
                  return (
                    <Stack key={i} direction="row" gap={1} sx={{ p: 1, borderRadius: 1.5, bgcolor: bg }}>
                      <Icon sx={{ fontSize: 17, color: ic, mt: .1 }} />
                      <Typography sx={{ fontSize: 12.5, color: tx }}>{c.text}</Typography>
                    </Stack>
                  );
                })}
              </Stack>
            </>
          )}
          {(rev?.has_attachment || req.has_attachment) && (
            <Button size="small" startIcon={<AttachFileIcon />} sx={{ ...BTN, alignSelf: "flex-start", mt: 1.5, color: "#344054" }}
              onClick={() => payrollApi.requestAttachment(req.id).then((b) => window.open(URL.createObjectURL(b), "_blank"))}>Pažyma</Button>
          )}
          {req.reject_reason && <Alert severity="error" sx={{ mt: 1.5, py: 0 }}>Atmesta: {req.reject_reason}</Alert>}
          {req.answer && <Alert severity="success" sx={{ mt: 1.5, py: 0, whiteSpace: "pre-line" }}>{req.answer}</Alert>}
          <Box sx={{ flex: 1 }} />
          {error && <Alert severity="error" sx={{ mt: 1.5, py: 0 }}>{error}</Alert>}
          {pending && (
            <Box sx={{ mt: 2 }}>
              {answer !== null ? (
                <Stack gap={1}>
                  <TextField multiline minRows={6} size="small" label="Atsakymas darbuotojui" value={answer} onChange={(e) => setAnswer(e.target.value)} />
                  <Stack direction="row" gap={1}>
                    <Button onClick={() => setAnswer(null)} sx={BTN}>Atgal</Button>
                    <Button fullWidth variant="contained" disabled={busy || !answer.trim()} onClick={sendAnswer} sx={BTN}>Siųsti atsakymą</Button>
                  </Stack>
                </Stack>
              ) : rejecting !== null ? (
                <Stack gap={1}>
                  <TextField multiline minRows={2} size="small" autoFocus label="Priežastis (darbuotojas ją matys)"
                    value={rejecting} onChange={(e) => setRejecting(e.target.value)} />
                  <Stack direction="row" gap={1}>
                    <Button onClick={() => setRejecting(null)} sx={BTN}>Atgal</Button>
                    <Button fullWidth variant="contained" color="error" disabled={busy} onClick={reject} sx={BTN}>Atmesti prašymą</Button>
                  </Stack>
                </Stack>
              ) : (
                <Stack gap={1}>
                  {req.kind === "pay_info" ? (
                    <Button fullWidth variant="contained" disabled={busy} onClick={openAnswer} sx={{ ...BTN, py: 1 }}>Paruošti atsakymą</Button>
                  ) : (
                    <Button fullWidth variant="contained" disabled={busy || !rev} startIcon={<CheckIcon />} onClick={approve}
                      sx={{ ...BTN, py: 1, bgcolor: "#16A34A", "&:hover": { bgcolor: "#15803D", boxShadow: "none" } }}>Patvirtinti</Button>
                  )}
                  <Button fullWidth variant="outlined" color="error" disabled={busy} onClick={() => setRejecting("")} sx={BTN}>Atmesti…</Button>
                </Stack>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </Dialog>
  );
}

// ============================================================
// Ką reikia padaryti
// ============================================================
const ICONS = { roster: CalendarMonthOutlinedIcon, repair: AutoFixHighOutlinedIcon, timesheet: EventAvailableOutlinedIcon,
  requests: AssignmentOutlinedIcon, payroll: PaymentsOutlinedIcon, payments: AccountBalanceWalletOutlinedIcon, declaration: DescriptionOutlinedIcon,
  das: BalanceOutlinedIcon };
const ST = { done: ["#16A34A", "#DCFCE7"], todo: ["#2563EB", "#DBEAFE"], warn: ["#D97706", "#FEF3C7"], late: ["#DC2626", "#FEE2E2"] };

function TodoCard({ items, loading, onGo }) {
  const left = items.filter((x) => x.status !== "done").length;
  return (
    <Box sx={{ ...CARD, p: 2.25 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography sx={{ fontSize: 15, fontWeight: 600 }}>Ką reikia padaryti</Typography>
        {!loading && <Typography sx={{ fontSize: 12.5, color: left ? "#667085" : "#16A34A", fontWeight: left ? 500 : 700 }}>{left ? `liko ${left}` : "viskas atlikta"}</Typography>}
      </Stack>
      {loading ? <Stack gap={1}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={44} />)}</Stack> : (
        <Stack>
          {items.map((x, i) => {
            const [c, bg] = ST[x.status] || ST.todo;
            const Icon = ICONS[x.icon] || AssignmentOutlinedIcon;
            const done = x.status === "done";
            return (
              <Stack key={x.key} direction="row" gap={1.3} alignItems="center" sx={{ py: 1.05, borderTop: i ? "1px solid #F2F4F7" : 0, opacity: done ? .6 : 1 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: 2, bgcolor: bg, display: "grid", placeItems: "center", flexShrink: 0 }}>
                  {done ? <CheckIcon sx={{ fontSize: 18, color: c }} /> : <Icon sx={{ fontSize: 18, color: c }} />}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 500, color: "#101828", textDecoration: done ? "line-through" : "none" }}>{x.title}</Typography>
                  {x.sub && <Typography noWrap sx={{ fontSize: 12, color: x.status === "late" ? "#DC2626" : "#667085", fontWeight: x.status === "late" ? 600 : 400 }}>{x.sub}</Typography>}
                </Box>
                {x.action && !done && (
                  <Button size="small" onClick={() => onGo(x.action.to)} sx={{ ...BTN, color: c, minWidth: 0, flexShrink: 0 }}>{x.action.label}</Button>
                )}
              </Stack>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}

// ============================================================
// Artimiausi terminai
// ============================================================
function DeadlinesCard({ items, loading, onGo }) {
  return (
    <Box sx={{ ...CARD, p: 2.25 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1.25}>
        <Typography sx={{ fontSize: 15, fontWeight: 600 }}>Artimiausi terminai</Typography>
        <Button size="small" endIcon={<ArrowForwardIcon sx={{ fontSize: "15px !important" }} />} onClick={() => onGo("/deklaravimas")}
          sx={{ ...BTN, fontWeight: 500, color: "#475467" }}>Deklaracijos</Button>
      </Stack>
      {loading ? <Stack gap={1}>{[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={48} />)}</Stack>
        : !items.length ? <Typography sx={{ fontSize: 13, color: "#667085" }}>Artimiausių terminų nėra – viskas pateikta.</Typography> : (
          <Stack gap={1.1}>
            {items.map((x) => {
              const d = new Date(`${x.date}T00:00:00`);
              const c = x.days_left < 0 ? "#B42318" : x.days_left <= 3 ? "#DC2626" : x.days_left <= 10 ? "#D97706" : "#2563EB";
              const left = x.days_left < 0 ? `vėluoja ${-x.days_left} d.` : x.days_left === 0 ? "šiandien" : `po ${x.days_left} d.`;
              return (
                <Stack key={`${x.title}${x.date}`} direction="row" gap={1.5} alignItems="center" onClick={() => x.to && onGo(x.to)}
                  sx={{ cursor: x.to ? "pointer" : "default", borderRadius: 1.5, "&:hover .t": { color: x.to ? "#1D4ED8" : undefined } }}>
                  <Box sx={{ width: 48, borderRadius: 2, overflow: "hidden", textAlign: "center", border: `1.5px solid ${c}`, flexShrink: 0 }}>
                    <Box sx={{ bgcolor: c, color: "#FFFFFF", fontSize: 10, fontWeight: 600, py: .15, letterSpacing: .5 }}>{MON[d.getMonth()]}</Box>
                    <Typography sx={{ fontSize: 18, fontWeight: 600, color: "#101828", py: .05 }}>{String(d.getDate()).padStart(2, "0")}</Typography>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography className="t" noWrap sx={{ fontSize: 13.5, fontWeight: 500 }}>{x.title}</Typography>
                    <Typography noWrap sx={{ fontSize: 12, color: "#667085" }}>{x.sub}</Typography>
                  </Box>
                  <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                    {x.authority && <Chip size="small" label={x.authority} sx={{ height: 21, fontSize: 11, fontWeight: 600, bgcolor: "#F2F4F7", color: "#344054" }} />}
                    <Typography sx={{ fontSize: 11.5, color: c, fontWeight: 600, mt: .3 }}>{left}</Typography>
                  </Box>
                </Stack>
              );
            })}
          </Stack>
        )}
    </Box>
  );
}

// ============================================================
export default function DuApzvalga({ onChanged }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [ov, setOv] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  const [tab, setTab] = useState("req");
  const [notice, setNotice] = useState(null);   // {warnings, rosters} po sprendimo

  const load = useCallback(() => {
    setLoading(true);
    const reqP = payrollApi.requests({ status: status === "pending" ? "pending" : undefined })
      .then((r) => {
        const all = list(r);
        setRows(status === "decided" ? all.filter((x) => x.status !== "pending") : all);
        if (status === "pending") setPendingCount(all.length);
      });
    const cntP = status === "pending" ? Promise.resolve() :
      payrollApi.requests({ status: "pending" }).then((r) => setPendingCount(list(r).length));
    const ovP = payrollApi.payrollOverview().then(setOv);
    Promise.all([reqP, cntP, ovP]).then(() => setError("")).catch((e) => setError(apiError(e))).finally(() => setLoading(false));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const go = (to) => {
    if (!to) return;
    if (to === "#requests") { setTab("req"); setStatus("pending"); document.getElementById("requests")?.scrollIntoView({ behavior: "smooth" }); return; }
    navigate(to);
  };
  const decided = (r) => {
    setOpen(null);
    setNotice({ warnings: r?.warnings || [], rosters: r?.rosters || [] });
    load();
    onChanged?.();
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {notice?.warnings?.map((w) => <Alert key={w} severity="warning" sx={{ mb: 1 }} onClose={() => setNotice({ ...notice, warnings: [] })}>{w}</Alert>)}
      <AffectedRosters items={notice?.rosters} onClose={() => setNotice({ ...notice, rosters: [] })} sx={{ mb: 2 }} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.45fr) minmax(0, 1fr)" }, gap: 2.25, alignItems: "start" }}>
        <RequestsCard rows={rows} loading={loading} status={status} setStatus={setStatus} prefs={ov?.preferences || []}
          onRefresh={load} onOpen={setOpen} pendingCount={pendingCount} tab={tab} setTab={setTab} />
        <Stack gap={2.25}>
          <TodoCard items={ov?.todo || []} loading={!ov} onGo={go} />
          <DeadlinesCard items={ov?.deadlines || []} loading={!ov} onGo={go} />
        </Stack>
      </Box>
      <RequestDialog req={open} onClose={() => setOpen(null)} onDecided={decided} />
    </Box>
  );
}
