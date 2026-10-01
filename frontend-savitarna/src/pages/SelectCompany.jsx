import { Alert, Button, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";

import { api, apiError } from "../api";
import { useAuth } from "../auth";

export default function SelectCompany() {
  const { me, setMe } = useAuth();
  const nav = useNavigate();
  const pick = async (id) => {
    try { setMe((await api.post("me/company/", { employee: id })).data); nav("/", { replace: true }); }
    catch (e) { alert(apiError(e)); }
  };
  return (
    <Stack gap={2}>
      <Typography variant="h6" fontWeight={700}>Pasirinkite įmonę</Typography>
      {me.employments.length === 0 && <Alert severity="info">Aktyvių darboviečių nėra.</Alert>}
      {me.employments.map((e) => (
        <Button key={e.id} variant="outlined" size="large" onClick={() => pick(e.id)} sx={{ justifyContent: "flex-start" }}>
          {e.company}{e.read_only ? " (tik peržiūra)" : ""}
        </Button>
      ))}
    </Stack>
  );
}
