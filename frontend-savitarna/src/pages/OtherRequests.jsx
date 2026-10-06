import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import BeachAccessOutlinedIcon from "@mui/icons-material/BeachAccessOutlined";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import EuroOutlinedIcon from "@mui/icons-material/EuroOutlined";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { useNavigate } from "react-router-dom";

import { api, apiError } from "../api";
import { useAuth } from "../auth";

const PAGE = 10;

function BackButton({ onClick }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        border: 0,
        bgcolor: "transparent",
        p: 0,
        display: "inline-flex",
        alignItems: "center",
        gap: 0.25,
        color: "text.secondary",
        cursor: "pointer",
        font: "inherit",
        fontSize: "0.8rem",
        fontWeight: 600,
        width: "fit-content",
      }}
    >
      <ChevronLeftRoundedIcon sx={{ fontSize: 20 }} />
      Atgal
    </Box>
  );
}

const ltd = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join(".") : "");

function parentTitle(employee) {
  const g = String(employee?.gender || "").toUpperCase();
  if (g === "M") return "Tėvadienis";
  if (g === "F") return "Mamadienis";
  return "Mamadienis / tėvadienis";
}

function parentSubtitle(pd) {
  if (pd?.remaining == null) return "Papildoma poilsio diena";
  if (pd.remaining > 0) return `Liko ${pd.remaining} iš ${pd.days} · ${pd.period_label}`;
  return `Išnaudota · kitas nuo ${ltd(pd.next_period_start).slice(0, 5)}`;
}

function RequestItem({ item, onClick }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        width: "100%",
        border: "1px solid",
        borderColor: "rgba(31, 41, 55, 0.06)",
        bgcolor: item.bg,
        borderRadius: "10px",
        p: 1.5,
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        textAlign: "left",
        color: "inherit",
        cursor: "pointer",
        font: "inherit",
        WebkitTapHighlightColor: "transparent",
        "&:active": { transform: "scale(0.995)" },
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          flex: "0 0 40px",
          display: "grid",
          placeItems: "center",
          borderRadius: "9px",
          bgcolor: item.iconBg,
          color: item.iconColor,
          "& svg": { fontSize: 22 },
        }}
      >
        {item.icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: "0.88rem", lineHeight: 1.3, fontWeight: 700, color: "#1F2937" }}>
          {item.title}
        </Typography>
        <Typography sx={{ mt: 0.25, fontSize: "0.73rem", lineHeight: 1.4, color: "text.secondary" }}>
          {item.subtitle}
        </Typography>
      </Box>
      <ChevronRightRoundedIcon sx={{ fontSize: 20, color: "text.disabled", flex: "0 0 auto" }} />
    </Box>
  );
}

function StatusChip({ status, label }) {
  const colors = {
    approved: { bg: "#E7F8EE", fg: "#079455" },
    pending: { bg: "#E9F2FF", fg: "#1677FF" },
    rejected: { bg: "#FDEBEC", fg: "#E5484D" },
    cancelled: { bg: "#F1F3F6", fg: "#667085" },
  };
  const c = colors[status] || colors.cancelled;
  return <Chip size="small" label={label} sx={{ bgcolor: c.bg, color: c.fg, fontWeight: 700, borderRadius: 2.5 }} />;
}

export default function OtherRequests() {
  const nav = useNavigate();
  const { me } = useAuth();
  const employee = me?.employee;
  const readOnly = employee?.read_only;

  const [pd, setPd] = useState(undefined);   // undefined = kraunama
  const [reqs, setReqs] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPage = useCallback(async (from, append) => {
    setLoading(true);
    try {
      const r = await api.get("requests/", { params: { limit: PAGE, offset: from } });
      setReqs((prev) => (append ? [...prev, ...r.data.results] : r.data.results));
      setHasMore(r.data.has_more);
      setOffset(r.data.next_offset);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api.get("home/").then((r) => setPd(r.data.parent_days || null)).catch(() => setPd(null));
    loadPage(0, false);
  }, [loadPage]);

  const cancel = async (id) => {
    try {
      await api.post(`requests/${id}/cancel/`);
      loadPage(0, false);
      api.get("home/").then((r) => setPd(r.data.parent_days)).catch(() => {});
    } catch (e) {
      setError(apiError(e));
    }
  };

  const items = [
    {
      icon: <BeachAccessOutlinedIcon />, title: "Kasmetinės atostogos", subtitle: "Pateikti prašymą atostogoms",
      to: "/prasymas/vacation", bg: "#F0FBF4", iconBg: "#D7F3E2", iconColor: "#16A965",
    },
    pd?.days > 0 && {
      icon: <FavoriteBorderIcon />, title: parentTitle(employee), subtitle: parentSubtitle(pd),
      to: "/prasymas/parent_day", bg: "#FFF3F5", iconBg: "#FDDDE3", iconColor: "#EF476F",
    },
    {
      icon: <EventBusyOutlinedIcon />, title: "Nemokamos atostogos", subtitle: "Pateikti prašymą dėl nemokamų atostogų",
      to: "/prasymas/unpaid", bg: "#FFF7E8", iconBg: "#FDE9BA", iconColor: "#9A6700",
    },
    {
      icon: <LogoutOutlinedIcon />, title: "Noriu išeiti iš darbo", subtitle: "Pateikti prašymą dėl darbo sutarties nutraukimo",
      to: "/prasymas/dismissal", bg: "#FFF1F1", iconBg: "#FFDCDC", iconColor: "#B54747",
    },
    {
      icon: <EuroOutlinedIcon />, title: "Informacija apie atlyginimą",
      subtitle: "Vidutinis valandinis atlyginimas ir vidutinis atlyginimas grupėje pagal lytį",
      to: "/prasymas/pay_info", bg: "#EEF7FF", iconBg: "#DCEEFF", iconColor: "#3478B8",
    },
  ].filter(Boolean);

  return (
    <Stack gap={2.25} sx={{ pb: 2 }}>
      <BackButton onClick={() => nav(-1)} />

      <Box>
        <Typography component="h1" sx={{ fontSize: "1.28rem", lineHeight: 1.25, fontWeight: 750, color: "#1F2937" }}>
          Prašymai
        </Typography>
        <Typography sx={{ mt: 0.55, fontSize: "0.8rem", lineHeight: 1.45, color: "text.secondary" }}>
          {readOnly ? "Jūsų pateikti prašymai." : "Pasirinkite, kokį prašymą norite pateikti."}
        </Typography>
      </Box>

      {!readOnly && (
        <Stack gap={1.1}>
          {pd === undefined
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} variant="rounded" sx={{ height: 68, borderRadius: "10px" }} />)
            : items.map((item) => <RequestItem key={item.to} item={item} onClick={() => nav(item.to)} />)}
        </Stack>
      )}

      {error && <Alert severity="error" onClose={() => setError("")} sx={{ borderRadius: "9px" }}>{error}</Alert>}

      <Box>
        <Typography sx={{ fontWeight: 800, fontSize: "1.05rem", color: "#1F2937", mb: 1 }}>Mano prašymai</Typography>
        {loading && reqs.length === 0 && (
          <Stack gap={1}>{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} variant="rounded" sx={{ height: 72, borderRadius: "10px" }} />)}</Stack>
        )}
        {!loading && reqs.length === 0 && (
          <Typography sx={{ fontSize: "0.8rem", color: "text.secondary" }}>Prašymų dar nepateikėte.</Typography>
        )}
        <Stack gap={1}>
          {reqs.map((r) => {
            const period = r.kind === "pay_info" ? "" : r.kind === "dismissal" || r.start_date === r.end_date
              ? ltd(r.end_date) : `${ltd(r.start_date)} – ${ltd(r.end_date)}`;
            return (
              <Box key={r.id} sx={{ p: 1.5, border: "1px solid #EDF0F5", borderRadius: "10px", bgcolor: "#fff" }}>
                <Stack direction="row" alignItems="flex-start" gap={1}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 750, fontSize: "0.88rem", color: "#17213b" }}>
                      {r.kind === "parent_day" ? parentTitle(employee) : r.kind_label}
                    </Typography>
                    {period && <Typography sx={{ fontSize: "0.78rem", color: "#344054", mt: 0.2 }}>{period}</Typography>}
                    <Typography sx={{ fontSize: "0.72rem", color: "#7a8599", mt: 0.2 }}>Pateikta {ltd(r.created_at)}</Typography>
                    {r.status === "rejected" && r.reject_reason && (
                      <Typography sx={{ fontSize: "0.75rem", color: "#B42318", mt: 0.5 }}>Priežastis: {r.reject_reason}</Typography>
                    )}
                    {r.answer && (
                      <Typography sx={{ fontSize: "0.75rem", color: "#344054", mt: 0.5, whiteSpace: "pre-line" }}>{r.answer}</Typography>
                    )}
                  </Box>
                  <Stack alignItems="flex-end" gap={0.6}>
                    <StatusChip status={r.status} label={r.status_label} />
                    {r.status === "pending" && !readOnly && (
                      <Button size="small" color="inherit" onClick={() => cancel(r.id)}
                        sx={{ fontSize: "0.72rem", minHeight: 28, px: 1, color: "text.secondary", textTransform: "none" }}>
                        Atšaukti
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </Box>
            );
          })}
        </Stack>
        {loading && reqs.length > 0 && <Box sx={{ display: "grid", placeItems: "center", py: 2 }}><CircularProgress size={22} /></Box>}
        {!loading && hasMore && (
          <Button fullWidth variant="outlined" onClick={() => loadPage(offset, true)}
            sx={{ mt: 1.2, minHeight: 42, borderRadius: "10px", textTransform: "none", fontWeight: 700 }}>
            Įkelti daugiau
          </Button>
        )}
      </Box>
    </Stack>
  );
}
