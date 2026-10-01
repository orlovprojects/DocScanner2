import { useState } from "react";
import { Alert, Box, Button, Chip, IconButton, Paper, Stack, TextField, Tooltip, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";

import { apiError, payrollApi } from "../../api/payroll";

const STATUS = {
  none: { label: "Nepakviestas", color: "default" },
  invited: { label: "Pakviestas", color: "warning" },
  active: { label: "Naudojasi savitarna", color: "success" },
};

export default function SavitarnaInvitePanel({ emp, onChanged }) {
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const st = STATUS[emp.savitarna_status] || STATUS.none;

  const invite = async () => {
    setBusy(true); setError(""); setMsg("");
    try {
      const r = await payrollApi.inviteEmployee(emp.id);
      setLink(r.link);
      setMsg(r.sent ? `Kvietimas išsiųstas: ${emp.email}` : "Laiškas neišsiųstas – nukopijuokite nuorodą ir nusiųskite darbuotojui patys.");
      onChanged?.();
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1}>
        <Box>
          <Stack direction="row" gap={1} alignItems="center">
            <Typography fontWeight={700}>Savitarna esavitarna.lt</Typography>
            <Chip size="small" label={st.label} color={st.color} variant="outlined" />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Darbuotojas pats užpildys duomenis, teiks prašymus ir matys atsiskaitymo lapelius.
          </Typography>
        </Box>
        {emp.status === "active" && (
          <Button variant={emp.savitarna_status === "none" ? "contained" : "outlined"} startIcon={<SendOutlinedIcon />}
            disabled={busy || (!emp.email && !emp.phone)} onClick={invite}>
            {emp.savitarna_status === "none" ? "Pakviesti" : "Siųsti kvietimą iš naujo"}
          </Button>
        )}
      </Stack>
      {!emp.email && !emp.phone && (
        <Alert severity="info" sx={{ mt: 1.5 }}>Kvietimui reikia darbuotojo el. pašto (skiltyje „Duomenys“).</Alert>
      )}
      {msg && <Alert severity={link && msg.startsWith("Kvietimas") ? "success" : "warning"} sx={{ mt: 1.5 }}>{msg}</Alert>}
      {link && (
        <TextField size="small" fullWidth sx={{ mt: 1.5 }} value={link} label="Kvietimo nuoroda (galioja 7 dienas)"
          InputProps={{
            readOnly: true,
            endAdornment: (
              <Tooltip title="Kopijuoti">
                <IconButton size="small" onClick={() => navigator.clipboard.writeText(link)}><ContentCopyIcon fontSize="small" /></IconButton>
              </Tooltip>
            ),
          }} />
      )}
      {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
    </Paper>
  );
}
