import { Box, Button, Container, Stack, Typography } from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth";

export default function Layout({ children }) {
  const { me, logout } = useAuth();
  const nav = useNavigate();
  return (
    <Box sx={{ minHeight: "100vh", pb: 4 }}>
      <Box sx={{ bgcolor: "background.paper", borderBottom: 1, borderColor: "divider", pt: "env(safe-area-inset-top)" }}>
        <Container maxWidth="sm">
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 1.5 }}>
            <Box onClick={() => nav("/")} sx={{ cursor: "pointer" }}>
              <Typography fontWeight={700} color="primary">esavitarna</Typography>
              {me?.employee && <Typography variant="caption" color="text.secondary">{me.employee.company}</Typography>}
            </Box>
            <Stack direction="row" gap={1}>
              {me?.employments?.length > 1 && <Button size="small" onClick={() => nav("/imone")} sx={{ minHeight: 36 }}>Įmonė</Button>}
              <Button size="small" color="inherit" startIcon={<LogoutIcon />} onClick={logout} sx={{ minHeight: 36 }}>Atsijungti</Button>
            </Stack>
          </Stack>
        </Container>
      </Box>
      <Container maxWidth="sm" sx={{ pt: 2.5 }}>{children}</Container>
    </Box>
  );
}
