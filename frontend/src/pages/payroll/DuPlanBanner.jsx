import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, AlertTitle, Box, Button, CircularProgress, Typography } from "@mui/material";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import CalculateOutlinedIcon from "@mui/icons-material/CalculateOutlined";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import BalanceOutlinedIcon from "@mui/icons-material/BalanceOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import AssignmentTurnedInOutlinedIcon from "@mui/icons-material/AssignmentTurnedInOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import { keyframes } from "@mui/material/styles";
import { api } from "../../api/endpoints";

// siauras blizgesys, kuris kas ~5 s greitai perbėga per mygtuką
const shine = keyframes`
  0%        { transform: translateX(-120%) skewX(-20deg); }
  18%, 100% { transform: translateX(260%) skewX(-20deg); }
`;
// švelnus švytėjimas aplink mygtuką (shadow - šešėlio, ring - žiedo spalva "r, g, b")
const glow = (shadow, ring) => keyframes`
  0%, 100% { box-shadow: 0 4px 12px rgba(${shadow}, 0.35), 0 0 0 0 rgba(${ring}, 0); }
  50%      { box-shadow: 0 4px 14px rgba(${shadow}, 0.4), 0 0 0 4px rgba(${ring}, 0.3); }
`;

// žalias - bandomojo pasiūlymas, mėlynas - bandomasis baigiasi / baigėsi
const THEMES = {
  green: { bg: "linear-gradient(135deg, #047857 0%, #10B981 100%)", shadow: "rgba(5, 150, 105, 0.22)",
    btn: "linear-gradient(135deg, #065F46 0%, #064E3B 100%)", btnHover: "linear-gradient(135deg, #047857 0%, #065F46 100%)",
    btnDisabled: "rgba(6, 78, 59, 0.7)", glow: glow("2, 44, 34", "52, 211, 153") },
  blue: { bg: "linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%)", shadow: "rgba(37, 99, 235, 0.2)",
    btn: "linear-gradient(135deg, #1E3A8A 0%, #172554 100%)", btnHover: "linear-gradient(135deg, #1E40AF 0%, #1E3A8A 100%)",
    btnDisabled: "rgba(30, 58, 138, 0.7)", glow: glow("23, 37, 84", "191, 219, 254") },
};

// DU planas: rodoma tik „Personalas ir DU“ ir „Grafikai ir tabelis“ puslapiuose (App.jsx)
const URL = "payroll/subscription/";
const PLAN_PAGE = "/papildyti#du";
const GRADIENT = "linear-gradient(135deg, #FF9800 0%, #F57C00 100%)";
const WARN_DAYS = 3;                      // likus tiek dienų - priminimas įsigyti planą
const fmtDate = (d) => (d ? String(d).slice(0, 10) : "");
// po 1 dienos, po 2 / 3 dienų
const inDays = (n) => (n <= 0 ? "šiandien" : `po ${n} ${n === 1 ? "dienos" : "dienų"}`);
// 1 aktyvus darbuotojas, 2 aktyvūs darbuotojai, 10 aktyvių darbuotojų
const activeEmployees = (n) => {
  const t = n % 10, h = n % 100;
  if (t === 1 && h !== 11) return `${n} aktyvus darbuotojas`;
  if (t >= 2 && (h < 10 || h > 20)) return `${n} aktyvūs darbuotojai`;
  return `${n} aktyvių darbuotojų`;
};

function Shell({ icon, iconBg = "#FF9800", title, text, children, soft }) {
  return (
    <Box sx={{
      display: "flex", alignItems: "center", gap: 1.75, flexWrap: { xs: "wrap", sm: "nowrap" },
      px: 2, py: 1.5, borderRadius: 3, mb: 2,
      bgcolor: soft ? "rgba(255, 248, 235, 0.7)" : "rgba(255, 243, 224, 0.85)",
      border: "1px solid rgba(255, 152, 0, 0.35)", backdropFilter: "blur(8px)",
      boxShadow: soft ? "none" : "0 6px 20px rgba(245, 124, 0, 0.12)",
    }}>
      <Box sx={{ width: 38, height: 38, borderRadius: "50%", bgcolor: iconBg, color: "#fff", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center" }}>
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 220 }}>
        <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: "#3B2A1A" }}>{title}</Typography>
        {text && <Typography sx={{ fontSize: 13, color: "#6B4F2A", mt: 0.25 }}>{text}</Typography>}
      </Box>
      <Box sx={{ display: "flex", gap: 1, flexShrink: 0 }}>{children}</Box>
    </Box>
  );
}

// kiekviena kortelė - sava ikonos spalva
const BENEFITS = [
  { icon: <CalendarMonthOutlinedIcon />, color: "#2563EB", bg: "#EFF6FF", title: "Automatiniai grafikai",
    text: "Sudaromi patys pagal suminę darbo laiko apskaitą – su normomis ir poilsio laiku" },
  { icon: <BalanceOutlinedIcon />, color: "#7C3AED", bg: "#F5F3FF", title: "Neribotas DAS ir SDUP",
    text: "Sistema pati praneša, kada DAS reikia tvirtinti iš naujo ar siųsti SDUP" },
  { icon: <PeopleAltOutlinedIcon />, color: "#DB2777", bg: "#FDF2F8", title: "Darbuotojų savitarna",
    text: "Darbuotojas pateikia prašymą, jūs patvirtinate – ir jis jau tabelyje" },
  { icon: <CalculateOutlinedIcon />, color: "#EA580C", bg: "#FFF7ED", title: "DU ir deklaracijos",
    text: "Atlyginimai, GPM313, SAM, 1-SD ir 2-SD – paruošiami automatiškai" },
];

// mygtukas su blizgesiu ir švytėjimu
function ShineButton({ theme, busy, onClick, children }) {
  const t = THEMES[theme];
  return (
    <Button variant="contained" onClick={onClick} disabled={busy}
      endIcon={busy ? null : <ArrowForwardRoundedIcon sx={{ fontSize: 18 }} />}
      sx={{ textTransform: "none", fontWeight: 700, fontSize: 13.5, borderRadius: 2, px: 2, py: 0.85,
        whiteSpace: "nowrap", flexShrink: 0, color: "#fff",
        position: "relative", overflow: "hidden",
        background: t.btn,
        animation: `${t.glow} 2.6s ease-in-out infinite`,
        "&::after": {
          content: '""', position: "absolute", top: 0, bottom: 0, left: 0, width: "45%", pointerEvents: "none",
          background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0) 100%)",
          animation: `${shine} 5s ease-in-out infinite`,
        },
        "& .MuiButton-endIcon": { transition: "transform .2s" },
        "&:hover": { background: t.btnHover },
        "&:hover .MuiButton-endIcon": { transform: "translateX(3px)" },
        "&.Mui-disabled": { background: t.btnDisabled, color: "#fff", animation: "none",
          "&::after": { display: "none" } },
        "@media (prefers-reduced-motion: reduce)": { animation: "none", "&::after": { display: "none" } } }}>
      {busy ? <CircularProgress size={16} sx={{ color: "#fff" }} /> : children}
    </Button>
  );
}

function BenefitCard({ b }) {
  return (
    <Box sx={{ display: "flex", gap: 1.25, alignItems: "flex-start", p: 1.25, borderRadius: 2,
      bgcolor: "#fff", boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)" }}>
      <Box sx={{ width: 30, height: 30, borderRadius: 1.5, bgcolor: b.bg, color: b.color, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center", "& svg": { fontSize: 18 } }}>
        {b.icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "#16181D", lineHeight: 1.3 }}>{b.title}</Typography>
        <Typography sx={{ fontSize: 11.5, color: "#5B606A", lineHeight: 1.38, mt: 0.25 }}>{b.text}</Typography>
      </Box>
    </Box>
  );
}

function PromoBanner({ theme, icon, title, subtitle, button, items, extra }) {
  const t = THEMES[theme];
  return (
    <Box sx={{ borderRadius: 3, mb: 2, px: 2, py: 1.75, color: "#fff", background: t.bg,
      boxShadow: `0 8px 24px ${t.shadow}` }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: { xs: "wrap", sm: "nowrap" } }}>
        <Box sx={{ width: 34, height: 34, borderRadius: "50%", bgcolor: "rgba(255, 255, 255, 0.2)", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center", "& svg": { fontSize: 19 } }}>
          {icon}
        </Box>
        <Typography sx={{ flex: 1, minWidth: 200, fontSize: 15.5, fontWeight: 800, lineHeight: 1.3 }}>
          {title}
          <Box component="span" sx={{ display: "block", fontSize: 12, fontWeight: 500, color: "rgba(255, 255, 255, 0.85)", mt: 0.25 }}>
            {subtitle}
          </Box>
        </Typography>
        {button}
      </Box>
      <Box sx={{ display: "grid", gap: 1.25, mt: 1.5,
        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: extra ? "repeat(4, 1fr) 1.05fr" : "repeat(4, 1fr)" } }}>
        {items.map((b) => <BenefitCard key={b.title} b={b} />)}
        {extra}
      </Box>
    </Box>
  );
}

function TrialPromo({ days, busy, onStart }) {
  return (
    <PromoBanner theme="green" icon={<RocketLaunchOutlinedIcon />}
      title={`Išbandykite pilną DU modulį ${days} d. nemokamai`}
      subtitle="Kortelės nereikia · Jokių įsipareigojimų"
      button={<ShineButton theme="green" busy={busy} onClick={onStart}>Išbandyti nemokamai</ShineButton>}
      items={BENEFITS} />
  );
}

// bandomasis baigiasi / baigėsi - ką duoda planas
const PLAN_BENEFITS = [
  { icon: <CalendarMonthOutlinedIcon />, color: "#2563EB", bg: "#EFF6FF", title: "Kurti ir skelbti grafikus",
    text: "Darbuotojai mato savo grafiką savitarnoje" },
  { icon: <AssignmentTurnedInOutlinedIcon />, color: "#059669", bg: "#ECFDF5", title: "Tvirtinti tabelį ir DU",
    text: "Kas mėnesį – keliais paspaudimais" },
  { icon: <DescriptionOutlinedIcon />, color: "#EA580C", bg: "#FFF7ED", title: "Algalapiai, mokėjimai, deklaracijos",
    text: "Generuojami iš naujų DU automatiškai" },
  { icon: <BalanceOutlinedIcon />, color: "#7C3AED", bg: "#F5F3FF", title: "Neribotas DAS ir SDUP",
    text: "Sistema pati praneša, kada atnaujinti" },
];

function PriceCard({ price, employees }) {
  return (
    <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: "#EFF6FF", border: "1px solid #BFDBFE", color: "#16181D" }}>
      <Typography sx={{ fontSize: 21, fontWeight: 800, color: "#1E3A8A", lineHeight: 1.1 }}>
        {price} €{" "}
        <Box component="span" sx={{ fontSize: 12, fontWeight: 600, color: "#5B606A" }}>/ mėn.</Box>
      </Typography>
      <Typography sx={{ fontSize: 11, color: "#5B606A", lineHeight: 1.4, mt: 0.5 }}>
        Jūsų įmonei: {activeEmployees(employees || 0)}
        <br />
        iki 10 darb. – 20 €, toliau po 2 €
      </Typography>
    </Box>
  );
}

function EndingPromo({ a, onBuy }) {
  const expired = a.state === "expired";
  return (
    <PromoBanner theme="blue"
      icon={expired ? <StarRoundedIcon /> : <ScheduleOutlinedIcon />}
      title={expired ? "Bandomasis laikotarpis baigėsi" : `Bandomasis laikotarpis baigiasi ${inDays(a.days_left)}`}
      subtitle="Įsigiję DU planą galėsite toliau:"
      button={<ShineButton theme="blue" onClick={onBuy}>Įsigyti planą</ShineButton>}
      items={PLAN_BENEFITS}
      extra={<PriceCard price={a.price} employees={a.employees} />} />
  );
}

const Primary = ({ children, ...p }) => (
  <Button variant="contained" size="small" {...p}
    sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2, boxShadow: "none", whiteSpace: "nowrap", background: GRADIENT }}>
    {children}
  </Button>
);

export default function DuPlanBanner() {
  const navigate = useNavigate();
  const [a, setA] = useState(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);      // ką tik pradėtas bandomasis - žalias pranešimas
  const [error, setError] = useState("");

  const load = useCallback(() => api.get(URL).then((r) => setA(r.data)).catch(() => null), []);
  useEffect(() => { load(); }, [load]);

  const startTrial = async () => {
    setBusy(true); setError("");
    try {
      const { data } = await api.post(URL, { action: "start_trial" });
      setA(data);
      setStarted(true);
    } catch (e) {
      const d = e?.response?.data;
      setError((Array.isArray(d) ? d.join(" ") : d?.detail) || "Nepavyko pradėti bandomojo laikotarpio");
    } finally {
      setBusy(false);
    }
  };

  if (!a || !a.enabled || a.state === "free") return null;

  let body = null;
  if (started && a.state === "trial") {
    body = (
      <Alert severity="success" onClose={() => setStarted(false)} sx={{ mb: 2, borderRadius: 3 }}>
        <AlertTitle sx={{ fontWeight: 700 }}>Bandomasis laikotarpis prasidėjo</AlertTitle>
        Pasibaigs {fmtDate(a.trial_ends_at)}
        <br />
        Galite naudotis visomis DU modulio funkcijomis neribotai
      </Alert>
    );
  } else if (a.state === "none") {
    body = <TrialPromo days={a.trial_days} busy={busy} onStart={startTrial} />;
  } else if ((a.state === "trial" && a.days_left !== null && a.days_left <= WARN_DAYS) || a.state === "expired") {
    body = <EndingPromo a={a} onBuy={() => navigate(PLAN_PAGE)} />;
  } else if (a.state === "past_due") {
    body = (
      <Shell icon={<WarningAmberOutlinedIcon sx={{ fontSize: 20 }} />}
        title="Nepavyko nuskaičiuoti mokėjimo už DU planą"
        text="Atnaujinkite mokėjimo kortelę, kad DU tvirtinimas nebūtų užrakintas.">
        <Primary onClick={() => navigate(PLAN_PAGE)}>Tvarkyti planą</Primary>
      </Shell>
    );
  }
  if (!body && !error) return null;
  return (
    <Box sx={{ px: { xs: 2, md: 3 }, pt: 2 }}>
      {body}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
    </Box>
  );
}
