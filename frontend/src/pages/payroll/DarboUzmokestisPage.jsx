import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { Box, IconButton, ListItemIcon, Menu, MenuItem, Tooltip, Typography, useMediaQuery, useTheme } from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import BalanceOutlinedIcon from "@mui/icons-material/BalanceOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import { useNavigate, useParams } from "react-router-dom";

import { payrollApi } from "../../api/payroll";
import ModuleTabs from "./ModuleTabs";
import DuApzvalga from "./DuApzvalga";
import DarbuotojaiPage from "./DarbuotojaiPage";
import MenesioDUPage from "./MenesioDUPage";
import SdupTab from "./SdupTab";
import PayrollSettingsDialog from "./PayrollSettingsDialog";
import SodraReportsDialog from "./SodraReportsDialog";

const TABS = ["apzvalga", "darbuotojai", "atlyginimai", "sdup"];

export default function DarboUzmokestisPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const navigate = useNavigate();
  const { tab: rawTab } = useParams();
  const tab = TABS.includes(rawTab) ? rawTab : "apzvalga";
  const [pending, setPending] = useState(0);
  const [menu, setMenu] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sodraOpen, setSodraOpen] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    payrollApi.requests({ status: "pending" }).then((r) => setPending((Array.isArray(r) ? r : r.results || []).length)).catch(() => {});
  }, [tab, reload]);

  const tabs = [
    { value: "apzvalga", label: "Apžvalga", description: "Prašymai, terminai ir ką reikia padaryti", icon: <DashboardIcon />,
      color: "#2563EB", bg: "#EFF6FF", badge: pending },
    { value: "darbuotojai", label: "Darbuotojai", description: "Sutartys, sąlygos, atostogos, išskaitos", icon: <PeopleAltOutlinedIcon />,
      color: "#16A34A", bg: "#F0FDF4" },
    { value: "atlyginimai", label: "Atlyginimai", description: "Skaičiavimas, patvirtinimas ir išmokėjimai", icon: <PaymentsOutlinedIcon />,
      color: "#DC2626", bg: "#FEF2F2" },
    { value: "sdup", label: "Darbo apmokėjimo sistema (DAS / SDUP)", description: "Pareigybių grupės, DAS ir SDUP pranešimai", icon: <BalanceOutlinedIcon />,
      color: "#7C3AED", bg: "#F5F3FF" },
  ];

  return (
    <Box sx={{ p: isMobile ? 2 : 4 }}>
      <Helmet><title>Personalas ir DU - DokSkenas</title></Helmet>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 2.5, gap: 2 }}>
        <Box>
          <Typography variant={isMobile ? "h6" : "h5"} sx={{ fontWeight: 800, lineHeight: 1.2 }}>Personalas ir DU</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.5 }}>
            Darbuotojai, atlyginimų bei mokesčių apskaičiavimas, darbo apmokėjimo sistema
          </Typography>
        </Box>
        <Tooltip title="Nustatymai">
          <IconButton onClick={(e) => setMenu(e.currentTarget)} sx={{ border: 1, borderColor: "divider" }}><SettingsOutlinedIcon /></IconButton>
        </Tooltip>
        <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)} disableScrollLock
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
          <MenuItem onClick={() => { setMenu(null); setSettingsOpen(true); }}>
            <ListItemIcon><TuneOutlinedIcon fontSize="small" /></ListItemIcon>DU nustatymai
          </MenuItem>
          <MenuItem onClick={() => { setMenu(null); setSodraOpen(true); }}>
            <ListItemIcon><CloudUploadOutlinedIcon fontSize="small" /></ListItemIcon>Sodros ataskaitos (S15, S47)
          </MenuItem>
          <MenuItem onClick={() => { setMenu(null); navigate("/perejimas?tab=du"); }}>
            <ListItemIcon><SwapHorizOutlinedIcon fontSize="small" /></ListItemIcon>Perėjimas iš kitos programos
          </MenuItem>
        </Menu>
      </Box>

      <ModuleTabs tabs={tabs} value={tab} onChange={(v) => navigate(v === "apzvalga" ? "/darbo-uzmokestis" : `/darbo-uzmokestis/${v}`)} />

      {tab === "apzvalga" && <DuApzvalga onChanged={() => setReload((x) => x + 1)} />}
      {tab === "darbuotojai" && <DarbuotojaiPage embedded />}
      {tab === "atlyginimai" && <MenesioDUPage mode="payroll" embedded />}
      {tab === "sdup" && <SdupTab />}

      <PayrollSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <SodraReportsDialog open={sodraOpen} onClose={() => setSodraOpen(false)} onDone={() => {}} />
    </Box>
  );
}
