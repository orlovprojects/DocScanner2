import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Link as RouterLink } from "react-router-dom";

import { api, apiError } from "../api";

function FieldLabel({ children }) {
  return (
    <Typography
      component="label"
      sx={{
        display: "block",
        mb: 0.75,
        fontSize: "0.82rem",
        lineHeight: 1.3,
        fontWeight: 600,
        color: "text.primary",
      }}
    >
      {children}
    </Typography>
  );
}

const fieldSx = {
  "& .MuiOutlinedInput-root": {
    bgcolor: "#fff",
    borderRadius: "10px",
    minHeight: 46,
    fontSize: "0.92rem",
  },
  "& .MuiOutlinedInput-input": {
    py: 1.25,
  },
};

export default function ForgotPassword() {
  const [login, setLogin] = useState("");
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      setDone((await api.post("auth/password-reset/", { login })).data.detail);
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
        pt: "max(16px, env(safe-area-inset-top))",
        pb: "max(16px, env(safe-area-inset-bottom))",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 420 }}>
        <Box sx={{ textAlign: "center", mb: 4 }}>
          <Typography
            component="div"
            sx={{
              fontSize: "1.65rem",
              fontWeight: 800,
              letterSpacing: "-0.035em",
              lineHeight: 1,
            }}
          >
            <Box component="span" sx={{ color: "primary.main" }}>
              e
            </Box>
            <Box component="span" sx={{ color: "#1F2937" }}>
              savitarna
            </Box>
          </Typography>

          <Typography
            sx={{
              mt: 1.25,
              color: "text.secondary",
              fontSize: "0.84rem",
              lineHeight: 1.45,
            }}
          >
            Darbuotojo savitarna
          </Typography>
        </Box>

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
          <Box sx={{ mb: 2.5 }}>
            <Typography
              component="h1"
              sx={{
                fontSize: "1.18rem",
                fontWeight: 750,
                color: "#1F2937",
                lineHeight: 1.3,
              }}
            >
              Pamiršote slaptažodį?
            </Typography>

            <Typography
              sx={{
                mt: 0.55,
                color: "text.secondary",
                fontSize: "0.8rem",
                lineHeight: 1.45,
              }}
            >
              Atsiųsime nuorodą naujam slaptažodžiui sukurti.
            </Typography>
          </Box>

          {done ? (
            <Stack gap={2}>
              <Alert
                severity="success"
                sx={{
                  borderRadius: "9px",
                  "& .MuiAlert-message": { fontSize: "0.82rem" },
                }}
              >
                {done}
              </Alert>

              <Link
                component={RouterLink}
                to="/prisijungti"
                textAlign="center"
                underline="hover"
                sx={{ fontSize: "0.82rem", fontWeight: 600 }}
              >
                Grįžti į prisijungimą
              </Link>
            </Stack>
          ) : (
            <Stack component="form" gap={2} onSubmit={submit}>
              <Box>
                <FieldLabel>El. paštas</FieldLabel>
                <TextField
                  fullWidth
                  size="small"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="Įveskite el. paštą"
                  inputProps={{ autoCapitalize: "none" }}
                  autoComplete="email"
                  autoFocus
                  sx={fieldSx}
                />
              </Box>

              {error && (
                <Alert
                  severity="error"
                  sx={{
                    py: 0.25,
                    borderRadius: "9px",
                    "& .MuiAlert-message": { fontSize: "0.82rem" },
                  }}
                >
                  {error}
                </Alert>
              )}

              <Button
                type="submit"
                variant="contained"
                disableElevation
                disabled={!login}
                sx={{
                  minHeight: 46,
                  borderRadius: "10px",
                  fontSize: "0.92rem",
                  fontWeight: 700,
                  textTransform: "none",
                }}
              >
                Siųsti nuorodą
              </Button>

              <Link
                component={RouterLink}
                to="/prisijungti"
                textAlign="center"
                underline="hover"
                sx={{ fontSize: "0.82rem", fontWeight: 600 }}
              >
                Grįžti į prisijungimą
              </Link>
            </Stack>
          )}
        </Box>
      </Box>
    </Box>
  );
}
