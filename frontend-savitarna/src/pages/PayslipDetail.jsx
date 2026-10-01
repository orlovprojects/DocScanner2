import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Divider, Paper, Stack, Typography } from "@mui/material";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import { useNavigate, useParams } from "react-router-dom";

import { api, apiError } from "../api";
import { MONTHS, eur } from "./Payslips";

function Row({ name, value, sub, bold }) {
  return (
    <Stack direction="row" justifyContent="space-between" sx={{ py: 0.75 }}>
      <Box>
        <Typography fontWeight={bold ? 700 : 400}>{name}</Typography>
        {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
      </Box>
      <Typography fontWeight={bold ? 700 : 400} sx={{ whiteSpace: "nowrap" }}>{value}</Typography>
    </Stack>
  );
}

export default function PayslipDetail() {
  const { run } = useParams();
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const nav = useNavigate();
  useEffect(() => { api.get(`payslips/${run}/`).then((r) => setD(r.data)).catch((e) => setError(apiError(e))); }, [run]);

  const openPdf = async () => {
    const html = (await api.get(`payslips/${run}/`, { params: { html: 1 }, responseType: "text" })).data;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => w.print(), 300);
  };

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!d) return <CircularProgress />;

  return (
    <Stack gap={2}>
      <Button onClick={() => nav("/algalapiai")} sx={{ alignSelf: "flex-start", minHeight: 36 }}>← Atgal</Button>
      <Box>
        <Typography variant="h5" fontWeight={700}>Algalapis</Typography>
        <Typography color="text.secondary">{d.year} m. {MONTHS[d.month - 1].toLowerCase()} · dirbta {d.worked_days} d. / {Number(d.worked_hours)} val.</Typography>
      </Box>
      <Paper sx={{ p: 2, bgcolor: "success.main", color: "success.contrastText" }} elevation={0}>
        <Typography variant="body2">Į rankas</Typography>
        <Typography variant="h4" fontWeight={700}>{eur(d.net)}</Typography>
        {d.payable !== d.net && <Typography variant="body2">Išmokėti: {eur(d.payable)}</Typography>}
      </Paper>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography fontWeight={700} mb={0.5}>Priskaičiuota</Typography>
        {d.earnings.map((l, i) => <Row key={i} name={l.name} sub={l.qty} value={eur(l.amount)} />)}
        <Divider sx={{ my: 1 }} />
        <Row name="Iš viso" value={eur(d.gross)} bold />
      </Paper>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography fontWeight={700} mb={0.5}>Išskaičiuota</Typography>
        {d.deductions.map((l, i) => <Row key={i} name={l.name} value={`−${eur(l.amount)}`} />)}
      </Paper>
      <Button variant="outlined" size="large" startIcon={<DownloadOutlinedIcon />} onClick={openPdf}>Atsisiųsti PDF</Button>
    </Stack>
  );
}
