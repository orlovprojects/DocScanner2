import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { Box, Chip, IconButton, Paper, Typography, useMediaQuery, useTheme } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import { useNavigate, useSearchParams } from "react-router-dom";

import { api } from "../api/endpoints";
import PradiniaiLikuciaiPage from "./PradiniaiLikuciaiPage";
import DuPerejimasTab from "./DuPerejimasTab";

// Kol nėra pilnos apskaitos - „Apskaita“ skirtukas paslėptas, rodomas tik DU perėjimas
const SHOW_ACCOUNTING = false;

const STATUS = {
  none: { label: "Nepradėta", color: "default" },
  draft: { label: "Juodraštis", color: "warning" },
  confirmed: { label: "Patvirtinta ✓", color: "success" },
  sdup: { label: "SDUP paruošta ✓", color: "success" },
};

export default function PerejimasPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = !SHOW_ACCOUNTING || sp.get("tab") === "du" ? "du" : "apskaita";
  const [acctStatus, setAcctStatus] = useState("none");
  const [duStatus, setDuStatus] = useState("none");

  useEffect(() => {
    if (!SHOW_ACCOUNTING) return;
    api.get("/apskaita/pradiniai-likuciai/", { withCredentials: true })
      .then(({ data }) => setAcctStatus(data.batch ? (data.batch.status === "confirmed" ? "confirmed" : "draft") : "none"))
      .catch(() => {});
  }, [tab]);

  const cards = [
    { key: "apskaita", title: "Apskaita", desc: "Balansas, bankai, pirkėjų ir tiekėjų skolos, ilgalaikis turtas", icon: <AccountBalanceIcon />, status: acctStatus },
    { key: "du", title: "Darbo užmokestis", desc: "Pilnas DU arba tik SDUP pasiruošimas (nemokamai) – iš Sodros / VMI ataskaitų", icon: <BadgeOutlinedIcon />, status: duStatus },
  ];

  const visible = cards.filter((c) => SHOW_ACCOUNTING || c.key !== "apskaita");
  const single = visible.length === 1;

  return (
    <Box sx={{ p: isMobile ? 2 : 4, maxWidth: 1100, mx: "auto" }}>
      <Helmet><title>Perėjimas iš kitos programos - DokSkenas</title></Helmet>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <IconButton size="small" onClick={() => navigate(SHOW_ACCOUNTING ? "/apskaitos-centras" : "/darbo-uzmokestis")}><ArrowBackIcon fontSize="small" /></IconButton>
        <Typography variant={isMobile ? "h6" : "h5"} sx={{ fontWeight: 800 }}>Perėjimas iš kitos programos</Typography>
      </Box>
      <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 2.5, ml: 5 }}>
        {SHOW_ACCOUNTING
          ? "Perkelkite tai, ką naudojate – apskaitą, darbo užmokestį arba abu. Kiekvieną dalį galima atlikti atskirai."
          : "Darbuotojai, atlyginimai ir DU istorija iš Sodros ir VMI ataskaitų."}
      </Typography>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: single ? "minmax(0, 520px)" : "1fr 1fr" }, gap: 1.5, mb: 3 }}>
        {visible.map((c) => {
          const active = tab === c.key && !single;      // vienas skirtukas - be pažymėjimo
          const st = STATUS[c.status] || STATUS.none;
          return (
            <Paper key={c.key} onClick={() => !single && setSp({ tab: c.key })}
              sx={{ p: single ? 1.5 : 2, borderRadius: 2, cursor: single ? "default" : "pointer", boxShadow: "none", border: "1px solid",
                    borderColor: active ? "primary.main" : "divider", bgcolor: active ? "action.selected" : "background.paper" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                <Box sx={{ color: "primary.main", display: "flex" }}>{c.icon}</Box>
                <Typography sx={{ fontSize: 15, fontWeight: 800, flex: 1 }}>{c.title}</Typography>
                <Chip size="small" label={st.label} color={st.color} variant={c.status === "confirmed" ? "filled" : "outlined"} />
              </Box>
              <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: 0.75 }}>{c.desc}</Typography>
            </Paper>
          );
        })}
      </Box>

      {tab === "apskaita" ? <PradiniaiLikuciaiPage embedded /> : <DuPerejimasTab onStatus={setDuStatus} />}
    </Box>
  );
}
