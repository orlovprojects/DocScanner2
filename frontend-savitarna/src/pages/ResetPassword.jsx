import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Stack,
  Typography,
} from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";

import { api, apiError } from "../api";
import { useAuth } from "../auth";
import PasswordField from "../components/PasswordField";

function Brand() {
  return (
    <Box sx={{ textAlign: "center", mb: 3.25 }}>
      <Typography
        component="div"
        sx={{
          fontSize: "1.65rem",
          fontWeight: 800,
          letterSpacing: "-0.035em",
          lineHeight: 1,
        }}
      >
        <Box component="span" sx={{ color: "primary.main" }}>e</Box>
        <Box component="span" sx={{ color: "#1F2937" }}>savitarna</Box>
      </Typography>

      <Typography
        sx={{
          mt: 1.1,
          color: "text.secondary",
          fontSize: "0.82rem",
          lineHeight: 1.45,
        }}
      >
        Darbuotojo savitarna
      </Typography>
    </Box>
  );
}

export default function ResetPassword() {
  const { token } = useParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { setMe } = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const { data } = await api.post("auth/password-reset/confirm/", {
        token,
        password,
      });
      setMe(data);
      nav("/", { replace: true });
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        bgcolor: "#F7F8FA",
        px: 2,
        pt: "max(20px, env(safe-area-inset-top))",
        pb: "max(24px, env(safe-area-inset-bottom))",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 420 }}>
        <Brand />

        <Box
          sx={{
            bgcolor: "#fff",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "12px",
            px: { xs: 2.25, sm: 3 },
            py: { xs: 2.5, sm: 3 },
            boxShadow: "0 8px 28px rgba(31, 41, 55, 0.05)",
          }}
        >
          <Box sx={{ mb: 2.4 }}>
            <Typography
              component="h1"
              sx={{
                fontSize: "1.16rem",
                fontWeight: 750,
                lineHeight: 1.3,
                color: "#1F2937",
              }}
            >
              Naujas slaptažodis
            </Typography>

            <Typography
              sx={{
                mt: 0.55,
                color: "text.secondary",
                fontSize: "0.79rem",
                lineHeight: 1.45,
              }}
            >
              Sukurkite naują slaptažodį savo paskyrai.
            </Typography>
          </Box>

          <Stack component="form" gap={1.9} onSubmit={submit}>
            <Box>
              <Typography
                component="label"
                sx={{
                  display: "block",
                  mb: 0.7,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                }}
              >
                Naujas slaptažodis
              </Typography>

              <PasswordField
                fullWidth
                size="small"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Bent 8 simboliai"
                helperText="Slaptažodį turi sudaryti bent 8 simboliai"
                autoComplete="new-password"
                autoFocus
                sx={{
                  "& .MuiOutlinedInput-root": {
                    bgcolor: "#fff",
                    borderRadius: "10px",
                    minHeight: 46,
                    fontSize: "0.9rem",
                  },
                  "& .MuiFormHelperText-root": {
                    mx: 0,
                    mt: 0.55,
                    fontSize: "0.7rem",
                  },
                }}
              />
            </Box>

            {error && (
              <Alert
                severity="error"
                sx={{
                  py: 0.25,
                  borderRadius: "9px",
                  "& .MuiAlert-message": { fontSize: "0.8rem" },
                }}
              >
                {error}
              </Alert>
            )}

            <Button
              type="submit"
              variant="contained"
              disableElevation
              disabled={password.length < 8}
              sx={{
                minHeight: 46,
                borderRadius: "10px",
                fontSize: "0.9rem",
                fontWeight: 700,
                textTransform: "none",
              }}
            >
              Išsaugoti ir prisijungti
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
