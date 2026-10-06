import {
  Alert,
  Box,
  Chip,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { useNavigate } from "react-router-dom";

import { api, apiError } from "../api";
import { useAuth } from "../auth";

const ltd = (iso) => (iso ? iso.split("-").reverse().join(".") : "");

export default function SelectCompany() {
  const { me, setMe } = useAuth();
  const nav = useNavigate();

  const pick = async (id) => {
    try {
      setMe((await api.post("me/company/", { employee: id })).data);
      nav("/", { replace: true });
    } catch (e) {
      alert(apiError(e));
    }
  };

  return (
    <Stack gap={2.25}>
      <Box>
        <Typography
          component="h1"
          sx={{
            fontSize: "1.28rem",
            lineHeight: 1.25,
            fontWeight: 750,
            color: "#1F2937",
          }}
        >
          Pasirinkite įmonę
        </Typography>
        <Typography
          sx={{
            mt: 0.55,
            fontSize: "0.8rem",
            lineHeight: 1.45,
            color: "text.secondary",
          }}
        >
          Pasirinkite darbovietę, kurios savitarną norite atidaryti.
        </Typography>
      </Box>

      {me.employments.length === 0 && (
        <Alert severity="info" sx={{ borderRadius: "10px" }}>
          Aktyvių darboviečių nėra.
        </Alert>
      )}

      {me.employments.length > 0 && (
        <Paper
          variant="outlined"
          sx={{
            borderRadius: "10px",
            overflow: "hidden",
            bgcolor: "#fff",
          }}
        >
          {me.employments.map((e, index) => (
            <Box
              key={e.id}
              component="button"
              type="button"
              onClick={() => pick(e.id)}
              sx={{
                width: "100%",
                minHeight: 70,
                border: 0,
                borderBottom:
                  index === me.employments.length - 1
                    ? 0
                    : "1px solid",
                borderColor: "divider",
                bgcolor: "#fff",
                p: 1.5,
                display: "flex",
                alignItems: "center",
                gap: 1.25,
                textAlign: "left",
                font: "inherit",
                color: "inherit",
                cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
                "&:active": { bgcolor: "action.hover" },
              }}
            >
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  flex: "0 0 40px",
                  borderRadius: "9px",
                  display: "grid",
                  placeItems: "center",
                  bgcolor: e.read_only ? "#F1F3F6" : "#EEF5FF",
                  color: e.read_only ? "text.secondary" : "primary.main",
                }}
              >
                <BusinessOutlinedIcon sx={{ fontSize: 21 }} />
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap">
                  <Typography
                    sx={{
                      fontSize: "0.9rem",
                      lineHeight: 1.3,
                      fontWeight: 700,
                      color: e.read_only ? "text.secondary" : "#1F2937",
                    }}
                  >
                    {e.company}
                  </Typography>
                  {e.read_only && (
                    <Chip
                      size="small"
                      label="Buvusi darbovietė"
                      sx={{ height: 20, fontSize: "0.66rem", fontWeight: 700, bgcolor: "#F1F3F6", color: "#667085" }}
                    />
                  )}
                </Stack>

                {e.read_only && (
                  <Stack
                    direction="row"
                    alignItems="center"
                    gap={0.4}
                    sx={{ mt: 0.3 }}
                  >
                    <LockOutlinedIcon
                      sx={{ fontSize: 13, color: "text.secondary" }}
                    />
                    <Typography
                      sx={{
                        fontSize: "0.72rem",
                        color: "text.secondary",
                      }}
                    >
                      Tik peržiūra{e.ended ? ` · sutartis baigėsi ${ltd(e.ended)}` : ""}
                      {e.access_until ? ` · algalapiai iki ${ltd(e.access_until)}` : ""}
                    </Typography>
                  </Stack>
                )}
              </Box>

              <ChevronRightRoundedIcon
                sx={{ fontSize: 20, color: "text.disabled" }}
              />
            </Box>
          ))}
        </Paper>
      )}
    </Stack>
  );
}
