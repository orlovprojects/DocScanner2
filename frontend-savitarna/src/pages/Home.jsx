import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import BeachAccessOutlinedIcon from "@mui/icons-material/BeachAccessOutlined";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { useLocation, useNavigate } from "react-router-dom";

import { api, apiError, days } from "../api";
import { useAuth } from "../auth";
import InstallHint from "../components/InstallHint";

const actionTones = {
  blue: { bg: "#EAF4FF", fg: "#1684F8" },
  green: { bg: "#E9F9EF", fg: "#16A965" },
  red: { bg: "#FDECEF", fg: "#EF476F" },
  violet: { bg: "#F1ECFF", fg: "#7048E8" },
  orange: { bg: "#FFF2DF", fg: "#F57C00" },
  teal: { bg: "#E7F8FA", fg: "#05899A" },
};

function ActionCard({ icon, title, subtitle, tone = "blue", onClick }) {
  const c = actionTones[tone];
  return (
    <Paper
      component="button"
      type="button"
      onClick={onClick}
      elevation={0}
      sx={{
        width: "100%",
        border: "1px solid",
        borderColor: "#edf1f7",
        bgcolor: "#fff",
        borderRadius: 1.5,
        px: { xs: 1.25, sm: 1.8 },
        py: { xs: 1.35, sm: 1.6 },
        display: "flex",
        alignItems: "center",
        textAlign: "left",
        cursor: "pointer",
        minHeight: { xs: 92, sm: 96 },
        font: "inherit",
        transition: "transform .15s ease, box-shadow .15s ease, border-color .15s ease",
        boxShadow: "0 8px 24px rgba(20, 52, 90, 0.045)",
        "&:hover": {
          transform: "translateY(-1px)",
          borderColor: "#dfe6f0",
          boxShadow: "0 10px 28px rgba(20, 52, 90, 0.08)",
        },
      }}
    >
      <Box
        sx={{
          width: { xs: 46, sm: 54 },
          height: { xs: 46, sm: 54 },
          borderRadius: "50%",
          bgcolor: c.bg,
          color: c.fg,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          mr: { xs: 1, sm: 1.6 },
          "& svg": { fontSize: { xs: 25, sm: 29 } },
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontWeight: 800, fontSize: { xs: ".94rem", sm: "1.02rem" }, lineHeight: 1.2, color: "#0b1739" }}>
          {title}
        </Typography>
        <Typography sx={{ mt: 0.45, color: "#68738a", fontSize: { xs: ".78rem", sm: ".82rem" }, lineHeight: 1.32 }}>
          {subtitle}
        </Typography>
      </Box>
      <ChevronRightRoundedIcon sx={{ color: "#77839a", ml: { xs: 0.35, sm: 1 }, fontSize: { xs: 21, sm: 24 }, flexShrink: 0 }} />
    </Paper>
  );
}

function RequestStatus({ status, label }) {
  const colors = {
    approved: { bg: "#E7F8EE", fg: "#079455" },
    pending: { bg: "#E9F2FF", fg: "#1677FF" },
    rejected: { bg: "#FDEBEC", fg: "#E5484D" },
    cancelled: { bg: "#F1F3F6", fg: "#667085" },
  };
  const c = colors[status] || colors.cancelled;
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        bgcolor: c.bg,
        color: c.fg,
        fontWeight: 700,
        borderRadius: 2.5,
        height: 34,
        "& .MuiChip-label": { px: 1.5 },
      }}
    />
  );
}

function parentDayTitle(employee, pd) {
  if (!pd?.days) return "Mamadieniai / tėvadieniai";
  const g = String(employee?.gender || employee?.sex || "").toLowerCase();
  if (["m", "male", "v", "vyras"].includes(g)) return "Tėvadieniai";
  if (["f", "female", "moteris"].includes(g)) return "Mamadieniai";
  return "Mamadieniai / tėvadieniai";
}

const ltd = (iso) => (iso ? iso.split("-").reverse().join(".").slice(0, 5) : "");

function parentDaySubtitle(pd) {
  if (pd?.remaining == null) return "Pateik prašymą";
  if (pd.remaining > 0) return `Liko ${pd.remaining} iš ${pd.days} · ${pd.period_label}`;
  return `Išnaudota · kitas nuo ${ltd(pd.next_period_start)}`;
}

function submittedDate(r) {
  if (!r?.created_at) return "—";
  return String(r.created_at).slice(0, 10);
}

export default function Home() {
  const { me } = useAuth();
  const [home, setHome] = useState(null);
  const [reqs, setReqs] = useState([]);
  const [answer, setAnswer] = useState(null);
  const nav = useNavigate();
  const loc = useLocation();

  const load = () => {
    api.get("home/").then((r) => setHome(r.data)).catch(() => {});
    api.get("requests/").then((r) => setReqs(r.data)).catch(() => {});
  };

  useEffect(load, []);

  const cancel = async (id) => {
    try {
      await api.post(`requests/${id}/cancel/`);
      load();
    } catch (e) {
      alert(apiError(e));
    }
  };

  const employee = me?.employee;
  const readOnly = employee?.read_only;
  const pd = home?.parent_days;
  const pdTitle = parentDayTitle(employee, pd);
  const pdPeriod = pd?.period_months === 1 ? "per mėnesį" : pd?.period_months === 3 ? "per 3 mėnesius" : null;

  return (
    <Stack gap={2.2} sx={{ pb: 2 }}>
      <InstallHint />

      {loc.state?.sent && (
        <Alert severity="success" sx={{ borderRadius: 1.5 }}>
          Prašymas pateiktas. Apie sprendimą pranešime el. paštu.
        </Alert>
      )}

      <Paper
        elevation={0}
        sx={{
          position: "relative",
          overflow: "hidden",
          borderRadius: 2,
          px: { xs: 2.2, sm: 3 },
          py: { xs: 2.2, sm: 2.6 },
          minHeight: 172,
          color: "#0b1739",
          border: "1px solid #dfeaf8",
          background:
            "radial-gradient(circle at 88% 18%, rgba(255,214,153,.72) 0 8%, transparent 9%), linear-gradient(118deg, #dceeff 0%, #edf6ff 44%, #fff4e8 100%)",
          boxShadow: "0 14px 34px rgba(44, 90, 140, 0.08)",
          "&::after": {
            content: '""',
            position: "absolute",
            right: -35,
            bottom: -50,
            width: 240,
            height: 120,
            borderRadius: "50% 0 0 0",
            background: "linear-gradient(150deg, rgba(151,194,218,.28), rgba(77,133,166,.16))",
            transform: "rotate(-7deg)",
          },
          "&::before": {
            content: '""',
            position: "absolute",
            right: 30,
            bottom: 0,
            width: 130,
            height: 62,
            borderRadius: "80% 0 0 0",
            background: "linear-gradient(150deg, rgba(142,177,119,.26), rgba(83,145,94,.16))",
            zIndex: 1,
          },
        }}
      >
        <Typography sx={{ fontSize: ".82rem", letterSpacing: ".08em", textTransform: "uppercase", color: "#64748b", fontWeight: 700 }}>
          Jums priklauso
        </Typography>

        <Stack direction="row" alignItems="stretch" sx={{ mt: 1.4, position: "relative", zIndex: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="baseline" gap={0.8}>
              <Typography sx={{ fontSize: { xs: "3rem", sm: "3.35rem" }, fontWeight: 850, lineHeight: 1 }}>
                {home ? (home.vacation_balance != null ? days(home.vacation_balance) : "–") : <Skeleton width={90} sx={{ display: "inline-block" }} />}
              </Typography>
            </Stack>
            <Typography sx={{ mt: 0.7, color: "#4d5d75", fontSize: ".95rem" }}>atostogų likutis</Typography>
          </Box>

          {pd?.days > 0 && (
            <>
              <Box sx={{ width: "1px", bgcolor: "rgba(70,95,125,.18)", mx: { xs: 2, sm: 3 } }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: { xs: "3rem", sm: "3.35rem" }, fontWeight: 850, lineHeight: 1,
                                  color: pd.remaining === 0 ? "#98a2b3" : undefined }}>
                  {pd.remaining ?? pd.days} d.
                </Typography>
                <Typography sx={{ mt: 0.7, color: "#4d5d75", fontSize: ".95rem", lineHeight: 1.25 }}>
                  {pd.remaining == null
                    ? `${pdTitle.toLowerCase()}${pdPeriod ? ` · ${pdPeriod}` : ""}`
                    : pd.remaining > 0
                      ? `${pdTitle.toLowerCase()} · liko ${pd.period_label}`
                      : `${pdTitle.toLowerCase()} išnaudoti · kitas nuo ${ltd(pd.next_period_start)}`}
                </Typography>
              </Box>
            </>
          )}
        </Stack>
      </Paper>

      {home?.roster?.pending_ack?.map((p) => (
        <Alert
          key={`${p.year}-${p.month}`}
          severity="warning"
          sx={{ borderRadius: 3 }}
          action={
            <Button color="inherit" size="small" onClick={() => nav(`/grafikas?y=${p.year}&m=${p.month}`)}>
              Peržiūrėti
            </Button>
          }
        >
          Paskelbtas {p.year}-{String(p.month).padStart(2, "0")} darbo grafikas – patvirtinkite, kad susipažinote.
        </Alert>
      ))}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: { xs: 1, sm: 1.35 },
          "@media (max-width:359px)": {
            gridTemplateColumns: "1fr",
          },
        }}
      >
        {!home && Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" sx={{ height: { xs: 92, sm: 96 }, borderRadius: 1.5 }} />
        ))}
        {home && home.roster && (
          <ActionCard
            icon={<CalendarMonthOutlinedIcon />}
            title="Mano grafikas"
            subtitle="Darbo laikas, pamainos, pageidavimai"
            tone="blue"
            onClick={() => nav("/grafikas")}
          />
        )}
        {home && !readOnly && (
          <ActionCard
            icon={<BeachAccessOutlinedIcon />}
            title="Noriu atostogų"
            subtitle="Pateik prašymą atostogoms"
            tone="green"
            onClick={() => nav("/prasymas/vacation")}
          />
        )}
        {home && !readOnly && pd?.days > 0 && (
          <ActionCard
            icon={<FavoriteBorderIcon />}
            title={pdTitle}
            subtitle={parentDaySubtitle(pd)}
            tone="red"
            onClick={() => nav("/prasymas/parent_day")}
          />
        )}
        {home && <ActionCard
          icon={<ReceiptLongOutlinedIcon />}
          title="Mano algalapiai"
          subtitle="Atlyginimo mokėjimo išrašai"
          tone="violet"
          onClick={() => nav("/algalapiai")}
        />}
        {home && !readOnly && (
          <ActionCard
            icon={<DescriptionOutlinedIcon />}
            title="Kiti prašymai"
            subtitle="Įvairūs prašymai darbdaviui"
            tone="orange"
            onClick={() => nav("/kiti-prasymai")}
          />
        )}
        {home && <ActionCard
          icon={<PersonOutlineIcon />}
          title="Mano duomenys"
          subtitle="Asmens informacija, kontaktai"
          tone="teal"
          onClick={() => nav("/anketa")}
        />}
      </Box>

      {reqs.length > 0 && (
        <Box sx={{ mt: 0.4 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.1, px: 0.2 }}>
            <Typography sx={{ fontWeight: 850, fontSize: "1.35rem", color: "#0b1739" }}>Mano prašymai</Typography>
            <Button
              size="small"
              onClick={() => nav("/kiti-prasymai")}
              sx={{ minHeight: 34, px: 0.5, fontSize: ".9rem", fontWeight: 700 }}
            >
              Žiūrėti visus
            </Button>
          </Stack>

          <Paper
            elevation={0}
            sx={{
              borderRadius: 1.75,
              overflow: "hidden",
              border: "1px solid #edf0f5",
              bgcolor: "#fff",
              boxShadow: "0 8px 24px rgba(20, 52, 90, 0.04)",
            }}
          >
            {reqs.slice(0, 5).map((r, index) => (
              <Box
                key={r.id}
                sx={{
                  px: 1.8,
                  py: 1.45,
                  display: "flex",
                  alignItems: "center",
                  gap: { xs: 0.8, sm: 1.2 },
                  borderTop: index ? "1px solid #eef1f5" : 0,
                }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontWeight: 750, color: "#17213b", fontSize: ".96rem", lineHeight: 1.3 }}>
                    {r.kind_label}
                  </Typography>
                  <Typography sx={{ color: "#7a8599", fontSize: ".83rem", mt: 0.2 }}>
                    Pateikta {submittedDate(r)}
                  </Typography>
                </Box>

                <RequestStatus status={r.status} label={r.status_label} />
              </Box>
            ))}
          </Paper>
        </Box>
      )}

      <Dialog open={!!answer} onClose={() => setAnswer(null)} fullWidth>
        <DialogTitle>Informacija apie atlyginimą</DialogTitle>
        <DialogContent>
          <Typography sx={{ whiteSpace: "pre-line" }}>{answer}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAnswer(null)}>Uždaryti</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
