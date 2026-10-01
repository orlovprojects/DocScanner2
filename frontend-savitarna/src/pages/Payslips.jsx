import { useEffect, useState } from "react";
import { Alert, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useNavigate } from "react-router-dom";

import { api, apiError } from "../api";

export const MONTHS = ["Sausis", "Vasaris", "Kovas", "Balandis", "Gegužė", "Birželis", "Liepa", "Rugpjūtis", "Rugsėjis", "Spalis", "Lapkritis", "Gruodis"];
export const eur = (v) => `${Number(v).toLocaleString("lt-LT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export default function Payslips() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const nav = useNavigate();
  useEffect(() => { api.get("payslips/").then((r) => setRows(r.data)).catch((e) => setError(apiError(e))); }, []);

  return (
    <Stack gap={2}>
      <Button onClick={() => nav("/")} sx={{ alignSelf: "flex-start", minHeight: 36 }}>← Atgal</Button>
      <Typography variant="h5" fontWeight={700}>Mano algalapiai</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {!rows && !error && <CircularProgress />}
      {rows?.length === 0 && <Typography color="text.secondary">Atsiskaitymo lapelių dar nėra. Jie atsiras, kai darbdavys patvirtins mėnesio atlyginimus.</Typography>}
      {rows?.map((r) => (
        <Paper key={r.run} variant="outlined" onClick={() => nav(`/algalapiai/${r.run}`)}
          sx={{ p: 2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <Typography fontWeight={600}>{r.year} m. {MONTHS[r.month - 1].toLowerCase()}</Typography>
            <Typography variant="body2" color="text.secondary">Į rankas {eur(r.net)}</Typography>
          </div>
          <ChevronRightIcon color="action" />
        </Paper>
      ))}
    </Stack>
  );
}
