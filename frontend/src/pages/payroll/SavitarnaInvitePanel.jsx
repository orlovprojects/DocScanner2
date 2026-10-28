import { useState } from "react";
import { Alert, Box, Button, Chip, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";

import { apiError, payrollApi } from "../../api/payroll";

const STATUS = {
  none: { label: "Nepakviestas", color: "#475467", bg: "#F2F4F7" },
  invited: { label: "Pakviestas", color: "#B54708", bg: "#FFFAEB" },
  active: { label: "Naudojasi", color: "#027A48", bg: "#ECFDF3" },
};

export default function SavitarnaInvitePanel({ emp, onChanged }) {
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const st = STATUS[emp.savitarna_status] || STATUS.none;
  const canInvite = !!(emp.email || emp.phone);

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
    <Box sx={{ p: 1.75, borderRadius: 2, border: "1px solid #EAECF0", bgcolor: "#FCFCFD" }}>
      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: "#101828" }}>eSavitarna</Typography>
        <Chip size="small" label={st.label} sx={{ height: 22, fontSize: 12, fontWeight: 600, color: st.color, bgcolor: st.bg }} />
      </Stack>
      <Typography sx={{ fontSize: 12.5, color: "#667085", mt: .5 }}>
        Darbuotojas pats užpildys duomenis, teiks prašymus ir matys atsiskaitymo lapelius.
      </Typography>
      {emp.status === "active" && (
        <Tooltip title={canInvite ? "" : "Pirmiausia įveskite el. paštą"}>
          <span>
            <Button size="small" variant={emp.savitarna_status === "none" ? "contained" : "outlined"} disableElevation
              startIcon={<SendOutlinedIcon sx={{ fontSize: 16 }} />} disabled={busy || !canInvite} onClick={invite}
              sx={{ mt: 1.25, textTransform: "none", fontWeight: 600, borderRadius: 2, whiteSpace: "nowrap" }}>
              {emp.savitarna_status === "none" ? "Pakviesti" : "Siųsti kvietimą iš naujo"}
            </Button>
          </span>
        </Tooltip>
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
    </Box>
  );
}
