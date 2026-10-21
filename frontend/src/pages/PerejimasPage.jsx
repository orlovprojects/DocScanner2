import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { Box, Chip, Button, Typography, useMediaQuery, useTheme } from "@mui/material";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import { useSearchParams } from "react-router-dom";

import { api } from "../api/endpoints";
import PradiniaiLikuciaiPage from "./PradiniaiLikuciaiPage";
import DuPerejimasTab from "./DuPerejimasTab";

const STATUS = {
  none: { label: "Nepradėta", color: "default" },
  draft: { label: "Vykdoma", color: "warning" },
  confirmed: { label: "Patvirtinta", color: "success" },
  sdup: { label: "SDUP paruošta", color: "success" },
};

export default function PerejimasPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") === "apskaita" ? "apskaita" : "du";
  const [acctStatus, setAcctStatus] = useState("none");
  const [duStatus, setDuStatus] = useState("none");

  useEffect(() => {
    api.get("/apskaita/pradiniai-likuciai/", { withCredentials: true })
      .then(({ data }) => setAcctStatus(data.batch ? (data.batch.status === "confirmed" ? "confirmed" : "draft") : "none"))
      .catch(() => {});
  }, []);

  const areas = [
    { key: "du", label: "Darbo užmokestis", Icon: BadgeOutlinedIcon, status: duStatus },
    { key: "apskaita", label: "Apskaita", Icon: AccountBalanceOutlinedIcon, status: acctStatus },
  ];

  return (
    <Box sx={{ px: { xs: 2, md: 3, xl: 5 }, py: { xs: 2, md: 4 }, maxWidth: 1450, mx: "auto" }}>
      <Helmet><title>Perėjimas iš kitos programos – DokSkenas</title></Helmet>
      <Typography variant={isMobile ? "h5" : "h4"} sx={{ fontWeight: 800, letterSpacing: "-0.03em", mb: 0.75 }}>
        Perėjimas iš kitos programos
      </Typography>
      <Typography sx={{ color: "text.secondary", fontSize: { xs: 13, md: 14.5 }, mb: 3.25, maxWidth: 880 }}>
        Perkelkite turimus duomenis ir pradėkite dirbti „DokSkenas“. Darbo užmokestį ir apskaitą galite perkelti atskirai.
      </Typography>

      {/* These are sections of migration, not extra setup wizard steps. */}
      <Box role="tablist" aria-label="Perėjimo sritis" sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 3.5, pb: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
        {areas.map(({ key, label, Icon, status }) => {
          const active = tab === key;
          const meta = STATUS[status] || STATUS.none;
          return (
            <Button
              role="tab"
              aria-selected={active}
              key={key}
              variant={active ? "contained" : "text"}
              color={active ? "primary" : "inherit"}
              disableElevation
              startIcon={<Icon fontSize="small" />}
              onClick={() => setSp({ tab: key })}
              sx={{ textTransform: "none", borderRadius: 2, fontWeight: 700, px: 2, py: 1.1 }}
            >
              {label}
              {status !== "none" && <Chip label={meta.label} color={active ? "default" : meta.color} size="small"
                sx={{ ml: 1.3, height: 20, fontSize: 10.5, pointerEvents: "none" }} />}
            </Button>
          );
        })}
      </Box>
      {tab === "apskaita" ? <PradiniaiLikuciaiPage embedded /> : <DuPerejimasTab onStatus={setDuStatus} />}
    </Box>
  );
}
