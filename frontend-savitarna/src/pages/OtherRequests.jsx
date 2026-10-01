import { Button, Stack, Typography } from "@mui/material";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import EuroOutlinedIcon from "@mui/icons-material/EuroOutlined";
import { useNavigate } from "react-router-dom";

export default function OtherRequests() {
  const nav = useNavigate();
  const Big = ({ icon, to, children, sub }) => (
    <Button variant="outlined" size="large" startIcon={icon} onClick={() => nav(to)}
      sx={{ justifyContent: "flex-start", textAlign: "left", py: 2, px: 2, fontSize: "1.1rem", bgcolor: "background.paper", "& .MuiButton-startIcon svg": { fontSize: 28 } }}>
      <span>
        {children}
        {sub && <Typography component="span" display="block" variant="body2" color="text.secondary" fontWeight={400}>{sub}</Typography>}
      </span>
    </Button>
  );
  return (
    <Stack gap={2}>
      <Button onClick={() => nav(-1)} sx={{ alignSelf: "flex-start", minHeight: 36 }}>← Atgal</Button>
      <Typography variant="h5" fontWeight={700}>Kiti prašymai</Typography>
      <Big icon={<EventBusyOutlinedIcon />} to="/prasymas/unpaid">Nemokamos atostogos</Big>
      <Big icon={<LogoutOutlinedIcon />} to="/prasymas/dismissal">Noriu išeiti iš darbo</Big>
      <Big icon={<EuroOutlinedIcon />} to="/prasymas/pay_info"
        sub="Mano vidutinis valandinis atlyginimas ir vidutinis atlyginimas mano grupėje pagal lytį">
        Informacija apie mano atlyginimą
      </Big>
    </Stack>
  );
}
