import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Typography } from "@mui/material";
import BeachAccessOutlinedIcon from "@mui/icons-material/BeachAccessOutlined";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import { useLocation, useNavigate } from "react-router-dom";

import { api, apiError, days } from "../api";
import { useAuth } from "../auth";
import InstallHint from "../components/InstallHint";

function Big({ icon, children, onClick }) {
  return (
    <Button variant="outlined" size="large" onClick={onClick} startIcon={icon}
      sx={{ justifyContent: "flex-start", py: 2, px: 2, fontSize: "1.1rem", bgcolor: "background.paper", "& .MuiButton-startIcon svg": { fontSize: 28 } }}>
      {children}
    </Button>
  );
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
  const cancel = async (id) => { try { await api.post(`requests/${id}/cancel/`); load(); } catch (e) { alert(apiError(e)); } };
  const readOnly = me.employee.read_only;

  const pd = home?.parent_days;
  return (
    <Stack gap={2}>
      <InstallHint />
      {loc.state?.sent && <Alert severity="success">Prašymas pateiktas. Apie sprendimą pranešime el. paštu.</Alert>}
      <Typography variant="h5" fontWeight={700}>Labas, {me.employee.first_name}</Typography>

      <Paper variant="outlined" sx={{ p: 2.5, bgcolor: "primary.main", color: "primary.contrastText", border: 0 }}>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>Jums priklauso atostogų</Typography>
        <Typography variant="h3" fontWeight={700}>{home?.vacation_balance != null ? days(home.vacation_balance) : "…"}</Typography>
        {pd?.days > 0 && (
          <Typography variant="body2" sx={{ opacity: 0.9 }}>
            Mamadieniai / tėvadieniai: {pd.days} d. {pd.period_months === 1 ? "per mėnesį" : "per 3 mėnesius"}
          </Typography>
        )}
      </Paper>

      {!readOnly && <Big icon={<BeachAccessOutlinedIcon />} onClick={() => nav("/prasymas/vacation")}>Noriu atostogų</Big>}
      {!readOnly && pd?.days > 0 && <Big icon={<FavoriteBorderIcon />} onClick={() => nav("/prasymas/parent_day")}>Mamadienis / tėvadienis</Big>}
      <Big icon={<ReceiptLongOutlinedIcon />} onClick={() => nav("/algalapiai")}>Mano algalapiai</Big>
      {!readOnly && <Big icon={<DescriptionOutlinedIcon />} onClick={() => nav("/kiti-prasymai")}>Kiti prašymai</Big>}
      <Big icon={<PersonOutlineIcon />} onClick={() => nav("/anketa")}>Mano duomenys</Big>

      {reqs.length > 0 && (
        <Box mt={1}>
          <Typography fontWeight={700} mb={1}>Mano prašymai</Typography>
          <Stack gap={1}>
            {reqs.slice(0, 10).map((r) => (
              <Paper key={r.id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                  <Box>
                    <Typography fontWeight={600}>{r.kind_label}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {r.kind === "pay_info" ? `Pateikta ${String(r.created_at).slice(0, 10)}`
                        : r.kind === "dismissal" ? `Paskutinė diena ${r.end_date}` : r.start_date === r.end_date ? r.start_date : `${r.start_date} – ${r.end_date}`}
                    </Typography>
                    {r.answer && <Button size="small" sx={{ minHeight: 28, px: 0 }} onClick={() => setAnswer(r.answer)}>Skaityti atsakymą</Button>}
                    {r.status === "rejected" && r.reject_reason && <Typography variant="caption" color="error">{r.reject_reason}</Typography>}
                  </Box>
                  <Stack alignItems="flex-end" gap={0.5}>
                    <Chip size="small" label={r.status_label}
                      color={{ pending: "warning", approved: "success", rejected: "error", cancelled: "default" }[r.status]} />
                    {r.status === "pending" && <Button size="small" sx={{ minHeight: 28, p: 0 }} onClick={() => cancel(r.id)}>Atšaukti</Button>}
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Box>
      )}
      <Dialog open={!!answer} onClose={() => setAnswer(null)} fullWidth>
        <DialogTitle>Informacija apie atlyginimą</DialogTitle>
        <DialogContent><Typography sx={{ whiteSpace: "pre-line" }}>{answer}</Typography></DialogContent>
        <DialogActions><Button onClick={() => setAnswer(null)}>Uždaryti</Button></DialogActions>
      </Dialog>
    </Stack>
  );
}
