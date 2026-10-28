import { useState } from "react";
import { Box, Button, Switch, Tooltip, Typography } from "@mui/material";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { getViewAs, setViewAsWrite, stopViewAs } from "./viewAs";

// Rodoma visada, kol aktyvus „Žiūrėti kaip“ (apačioje, per vidurį - nekeičia puslapio išdėstymo)
export default function ViewAsBanner() {
  const [v, setV] = useState(getViewAs());
  if (!v?.userId) return null;
  const write = !!v.write;
  const toggle = (on) => {
    setViewAsWrite(on);
    setV(getViewAs());
  };
  return (
    <Box
      sx={{
        position: "fixed", left: "50%", bottom: 16, transform: "translateX(-50%)", zIndex: 1400,
        display: "flex", alignItems: "center", gap: 1.5, px: 2, py: 0.75, borderRadius: 3,
        bgcolor: write ? "rgba(254, 226, 226, 0.92)" : "rgba(255, 243, 224, 0.92)",
        border: `1px solid ${write ? "#F87171" : "#FFB74D"}`,
        backdropFilter: "blur(8px)", boxShadow: "0 8px 30px rgba(0,0,0,0.15)", maxWidth: "calc(100vw - 32px)",
      }}
    >
      <Box sx={{ width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        bgcolor: write ? "#DC2626" : "#F57C00", color: "#fff", flexShrink: 0 }}>
        {write ? <EditOutlinedIcon sx={{ fontSize: 17 }} /> : <VisibilityOutlinedIcon sx={{ fontSize: 17 }} />}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#3B2A1A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          Peržiūrite kaip {v.email}
        </Typography>
        <Typography sx={{ fontSize: 12, color: "#6B4F2A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {v.companyName || "aktyvi vartotojo įmonė"} · {write ? "galima keisti (veiksmai žurnale)" : "tik skaitymas"}
        </Typography>
      </Box>
      <Tooltip title="Leisti keisti kliento DU duomenis DokSkene. Laiškai, Sodra / VMI, DU tvirtinimas, nustatymai ir paskyra – vis tiek užrakinti. Kiekvienas keitimas įrašomas į žurnalą." arrow>
        <Box sx={{ display: "flex", alignItems: "center", ml: 0.5 }}>
          <Switch size="small" color="error" checked={write} onChange={(e) => toggle(e.target.checked)} />
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#3B2A1A", whiteSpace: "nowrap" }}>Keisti</Typography>
        </Box>
      </Tooltip>
      <Button size="small" variant="contained" onClick={() => stopViewAs()}
        sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2, boxShadow: "none", whiteSpace: "nowrap",
          background: "linear-gradient(135deg, #FF9800 0%, #F57C00 100%)" }}>
        Baigti
      </Button>
    </Box>
  );
}
