import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, AlertTitle, Box, Button, CircularProgress, Typography } from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import HourglassTopOutlinedIcon from "@mui/icons-material/HourglassTopOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import { api } from "../../api/endpoints";

// DU planas: rodoma tik „Personalas ir DU“ ir „Grafikai ir tabelis“ puslapiuose (App.jsx)
const URL = "payroll/subscription/";
const PLAN_PAGE = "/papildyti#du";
const GRADIENT = "linear-gradient(135deg, #FF9800 0%, #F57C00 100%)";
const WARN_DAYS = 3;                      // likus tiek dienų - priminimas įsigyti planą
const fmtDate = (d) => (d ? String(d).slice(0, 10) : "");
// po 1 dienos, po 2 / 3 dienų
const inDays = (n) => (n <= 0 ? "šiandien" : `po ${n} ${n === 1 ? "dienos" : "dienų"}`);

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
  const toPlan = <Primary onClick={() => navigate(PLAN_PAGE)}>Įsigyti planą</Primary>;

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
    body = (
      <Shell icon={<RocketLaunchOutlinedIcon sx={{ fontSize: 20 }} />} soft
        title={`Išbandykite pilną DU ${a.trial_days} d. nemokamai`}
        text="DU tvirtinimas, algalapiai, deklaracijos, grafikų skelbimas ir darbuotojų savitarna. Kortelės nereikia.">
        <Primary onClick={startTrial} disabled={busy}>
          {busy ? <CircularProgress size={16} sx={{ color: "#fff" }} /> : "Pradėti bandomąjį laikotarpį"}
        </Primary>
      </Shell>
    );
  } else if (a.state === "trial" && a.days_left !== null && a.days_left <= WARN_DAYS) {
    body = (
      <Shell icon={<HourglassTopOutlinedIcon sx={{ fontSize: 20 }} />}
        title={`Bandomasis laikotarpis baigiasi ${inDays(a.days_left)}`}
        text={`Įsigykite DU planą, kad galėtumėte toliau tvirtinti DU ir skelbti grafikus (${fmtDate(a.trial_ends_at)}).`}>
        {toPlan}
      </Shell>
    );
  } else if (a.state === "expired") {
    body = (
      <Shell icon={<LockIcon sx={{ fontSize: 20 }} />}
        title="Bandomasis laikotarpis baigėsi"
        text="DU tvirtinimas ir grafikų skelbimas užrakinti. Duomenys, skaičiavimai, DAS ir SDUP – prieinami.">
        {toPlan}
      </Shell>
    );
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
