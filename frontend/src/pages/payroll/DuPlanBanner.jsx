import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Box, Button, CircularProgress, Tooltip, Typography } from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import HourglassTopOutlinedIcon from "@mui/icons-material/HourglassTopOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import { api } from "../../api/endpoints";

// DU planas: rodoma tik „Personalas ir DU“ ir „Grafikai ir tabelis“ puslapiuose (App.jsx)
const URL = "payroll/subscription/";
const GRADIENT = "linear-gradient(135deg, #FF9800 0%, #F57C00 100%)";
const fmtDate = (d) => (d ? String(d).slice(0, 10) : "");

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
  const [sp, setSp] = useSearchParams();
  const [a, setA] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const success = sp.get("du_plan") === "success";

  const load = useCallback(() => api.get(URL).then((r) => { setA(r.data); return r.data; }).catch(() => null), []);
  useEffect(() => { load(); }, [load]);

  // grįžus iš Stripe - laukiame, kol webhook aktyvuos planą
  useEffect(() => {
    if (!success) return undefined;
    let n = 0;
    const t = setInterval(async () => {
      n += 1;
      const d = await load();
      if (d?.state === "active" || n >= 10) {
        clearInterval(t);
        sp.delete("du_plan");
        setSp(sp, { replace: true });
      }
    }, 3000);
    return () => clearInterval(t);
  }, [success]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (action) => {
    setBusy(action); setError("");
    try {
      const { data } = await api.post(URL, { action });
      if (data?.url) { window.location.assign(data.url); return; }
      setA(data);
    } catch (e) {
      const d = e?.response?.data;
      setError((Array.isArray(d) ? d.join(" ") : d?.detail || (d && Object.values(d).flat().join(" "))) || "Nepavyko");
    } finally {
      setBusy("");
    }
  };

  if (!a || !a.enabled || a.state === "free") return null;
  const price = `${a.employees} darb. – ${a.price} €/mėn. be PVM`;
  const priceTip = <Tooltip title={`Kaina: ${a.price_text}. Skaičiuojami darbuotojai, kurių sutartis galiojo mėnesį.`} arrow>
    <span style={{ borderBottom: "1px dotted #6B4F2A", cursor: "help" }}>{price}</span></Tooltip>;
  const order = <Primary onClick={() => act("checkout")} disabled={!!busy}>
    {busy === "checkout" ? <CircularProgress size={16} sx={{ color: "#fff" }} /> : "Užsakyti planą"}</Primary>;
  const portal = (label) => <Button size="small" onClick={() => act("portal")} disabled={!!busy}
    sx={{ textTransform: "none", fontWeight: 600, color: "#3B2A1A", whiteSpace: "nowrap" }}>{label}</Button>;

  let body = null;
  if (success && a.state !== "active") {
    body = <Alert severity="info" sx={{ mb: 2 }}>Ačiū! Mokėjimas gautas – DU planas aktyvuojamas…</Alert>;
  } else if (a.state === "none") {
    body = (
      <Shell icon={<RocketLaunchOutlinedIcon sx={{ fontSize: 20 }} />} soft
        title={`Išbandykite pilną DU ${a.trial_days} d. nemokamai`}
        text="DU tvirtinimas, algalapiai, deklaracijos, grafikų skelbimas ir darbuotojų savitarna. Kortelės nereikia.">
        <Primary onClick={() => act("start_trial")} disabled={!!busy}>
          {busy === "start_trial" ? <CircularProgress size={16} sx={{ color: "#fff" }} /> : "Pradėti bandomąjį laikotarpį"}
        </Primary>
      </Shell>
    );
  } else if (a.state === "trial") {
    body = (
      <Shell icon={<HourglassTopOutlinedIcon sx={{ fontSize: 20 }} />} soft
        title={`Bandomasis laikotarpis – liko ${a.days_left} d. (iki ${fmtDate(a.trial_ends_at)})`}
        text={<>Užsakius dabar, mokėsite tik pasibaigus bandomajam laikotarpiui · {priceTip}</>}>
        {order}
      </Shell>
    );
  } else if (a.state === "expired") {
    body = (
      <Shell icon={<LockIcon sx={{ fontSize: 20 }} />}
        title="Bandomasis laikotarpis baigėsi"
        text={<>DU tvirtinimas ir grafikų skelbimas užrakinti. Duomenys, skaičiavimai ir SDUP – prieinami · {priceTip}</>}>
        {order}
      </Shell>
    );
  } else if (a.state === "past_due") {
    body = (
      <Shell icon={<WarningAmberOutlinedIcon sx={{ fontSize: 20 }} />}
        title="Nepavyko nuskaičiuoti mokėjimo už DU planą"
        text="Atnaujinkite mokėjimo kortelę, kad DU tvirtinimas nebūtų užrakintas.">
        {portal("Atnaujinti mokėjimą")}
      </Shell>
    );
  } else if (a.state === "active" && a.cancel_at_period_end) {
    body = (
      <Shell icon={<HourglassTopOutlinedIcon sx={{ fontSize: 20 }} />} soft
        title={`DU planas atšauktas – galioja iki ${fmtDate(a.current_period_end)}`}
        text="Po šios datos DU tvirtinimas ir grafikų skelbimas bus užrakinti.">
        {portal("Atnaujinti planą")}
      </Shell>
    );
  }
  if (!body) return null;
  return (
    <Box sx={{ px: { xs: 2, md: 3 }, pt: 2 }}>
      {body}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
    </Box>
  );
}
