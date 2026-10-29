import { Helmet } from "react-helmet";
import { Box, Typography, useMediaQuery, useTheme } from "@mui/material";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import GridOnOutlinedIcon from "@mui/icons-material/GridOnOutlined";
import FlightTakeoffIcon from "@mui/icons-material/FlightTakeoff";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import ModuleTabs from "./ModuleTabs";
import GrafikaiPage from "./GrafikaiPage";
import TabelisView from "./TabelisView";
import KomandiruotesPage from "./KomandiruotesPage";
import { DuStartNotice, MONTHS_ACC, MONTHS_GEN, isBeforeStart, useDuStart } from "./DuStart";

const TABS = ["grafikai", "tabelis", "komandiruotes"];

// Mėnuo - adrese (?m=2026-11), todėl perjungiant skirtukus išlieka tas pats
function defaultYm(tab) {
  const d = new Date();
  if (tab === "grafikai") d.setMonth(d.getMonth() + 1);       // grafikas paprastai sudaromas kitam mėnesiui
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export default function GrafikaiTabeliaiPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const navigate = useNavigate();
  const { tab: rawTab } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(rawTab) ? rawTab : "grafikai";
  const m = /^(\d{4})-(\d{2})$/.exec(params.get("m") || "");
  const ym = m ? { year: Number(m[1]), month: Number(m[2]) } : defaultYm(tab);
  const setYm = ({ year, month }) => setParams({ m: `${year}-${String(month).padStart(2, "0")}` }, { replace: true });
  const shift = (d) => {
    const x = new Date(ym.year, ym.month - 1 + d, 1);
    setYm({ year: x.getFullYear(), month: x.getMonth() + 1 });
  };
  const go = (v) => {
    const q = `?m=${ym.year}-${String(ym.month).padStart(2, "0")}`;
    navigate((v === "grafikai" ? "/grafikai-ir-tabeliai" : `/grafikai-ir-tabeliai/${v}`) + q);
  };
  // mėnuo iki DU pradžios DokSkenas - grafikai, tabeliai ir komandiruotės tvarkyti kitoje programoje
  const { start, period } = useDuStart();
  const before = isBeforeStart(start, ym.year, ym.month);
  const beforeText = before && {
    grafikai: "Darbo grafikų už ankstesnius mėnesius DokSkene sudaryti nereikia.",
    tabelis: "Dirbto laiko (tabelio) už ankstesnius mėnesius DokSkene pildyti nereikia.",
    komandiruotes: `Ankstesnes komandiruotes įforminkite ankstesnėje programoje. Jei komandiruotė tęsiasi ir ${MONTHS_ACC[start.month - 1]} – įveskite ją ${MONTHS_GEN[start.month - 1]} mėnesyje.`,
  }[tab];

  const tabs = [
    { value: "grafikai", label: "Grafikai", description: "Planas: pamainos, taisyklės, sudarymas", icon: <CalendarMonthOutlinedIcon />,
      color: "#2563EB", bg: "#EFF6FF" },
    { value: "tabelis", label: "Faktas", description: "Faktiškai dirbtas laikas bei nebuvimai", icon: <GridOnOutlinedIcon />,
      color: "#475467", bg: "#F2F4F7" },
    { value: "komandiruotes", label: "Komandiruotės", description: "Įsakymai, dienpinigiai, avansai", icon: <FlightTakeoffIcon />,
      color: "#D97706", bg: "#FFFBEB" },
  ];
  return (
    <Box sx={{ p: isMobile ? 2 : 4 }}>
      <Helmet><title>Grafikai ir tabelis - DokSkenas</title></Helmet>
      <Box sx={{ mb: 2.5 }}>
        <Typography variant={isMobile ? "h6" : "h5"} sx={{ fontWeight: 800, lineHeight: 1.2 }}>Grafikai ir tabelis</Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.5 }}>Darbo grafikų generavimas, faktinio darbo laiko apskaita bei komandiruotės</Typography>
      </Box>
      <ModuleTabs tabs={tabs} value={tab} onChange={go} />
      {before ? (
        <DuStartNotice start={start} year={ym.year} month={ym.month} onShift={shift} text={beforeText}
          fromMigration={!!period?.from_migration} onGo={() => setYm(start)} />
      ) : (
        <>
          {tab === "grafikai" && <GrafikaiPage embedded ym={ym} onYmChange={setYm} />}
          {tab === "tabelis" && <TabelisView year={ym.year} month={ym.month} onShift={shift} />}
          {tab === "komandiruotes" && <KomandiruotesPage embedded ym={ym} onYmChange={setYm} />}
        </>
      )}
    </Box>
  );
}
