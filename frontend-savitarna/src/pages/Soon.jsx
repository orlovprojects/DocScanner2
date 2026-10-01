import { Button, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";

export default function Soon() {
  const nav = useNavigate();
  return (
    <Stack gap={2} alignItems="flex-start">
      <Typography variant="h6" fontWeight={700}>Netrukus</Typography>
      <Typography color="text.secondary">Ši funkcija jau ruošiama ir greitai atsiras.</Typography>
      <Button variant="outlined" onClick={() => nav("/")}>Grįžti</Button>
    </Stack>
  );
}
