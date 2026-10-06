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
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";

import { api, apiError } from "../api";
import { useAuth } from "../auth";
import PasswordField from "../components/PasswordField";

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

export default function Login() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const { setMe } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      const { data } = await api.post("auth/login/", { login, password });
      setMe(data);
      nav(loc.state?.from || "/", { replace: true });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        bgcolor: "#F7F8FA",
        px: 2,
        pt: "max(16px, env(safe-area-inset-top))",
        pb: "max(28px, env(safe-area-inset-bottom))",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 420,
          mt: 0,
        }}
      >
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
            Darbuotojų savitarnos portalas
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
              Prisijungimas
            </Typography>
            <Typography
              sx={{
                mt: 0.55,
                color: "text.secondary",
                fontSize: "0.8rem",
                lineHeight: 1.45,
              }}
            >
              Prisijunkite naudodami savo el. paštą arba telefono numerį.
            </Typography>
          </Box>

          <Stack component="form" gap={2} onSubmit={submit}>
            <Box>
              <FieldLabel>El. paštas arba telefonas</FieldLabel>
              <TextField
                fullWidth
                size="small"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="Įveskite el. paštą arba telefoną"
                autoComplete="username"
                inputProps={{ autoCapitalize: "none" }}
                autoFocus
                sx={fieldSx}
              />
            </Box>

            <Box>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 0.75 }}
              >
                <Typography
                  component="label"
                  sx={{
                    fontSize: "0.82rem",
                    lineHeight: 1.3,
                    fontWeight: 600,
                    color: "text.primary",
                  }}
                >
                  Slaptažodis
                </Typography>

                <Link
                  component={RouterLink}
                  to="/pamirsau"
                  underline="hover"
                  sx={{
                    fontSize: "0.78rem",
                    fontWeight: 600,
                  }}
                >
                  Pamiršau slaptažodį
                </Link>
              </Stack>

              <PasswordField
                fullWidth
                size="small"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Įveskite slaptažodį"
                autoComplete="current-password"
                sx={fieldSx}
              />
            </Box>

            {error && (
              <Alert
                severity="error"
                sx={{
                  py: 0.25,
                  borderRadius: "9px",
                  "& .MuiAlert-message": {
                    fontSize: "0.82rem",
                  },
                }}
              >
                {error}
              </Alert>
            )}

            <Button
              type="submit"
              variant="contained"
              disableElevation
              disabled={busy || !login || !password}
              sx={{
                mt: 0.5,
                minHeight: 46,
                borderRadius: "10px",
                fontSize: "0.92rem",
                fontWeight: 700,
                textTransform: "none",
              }}
            >
              {busy ? "Jungiama…" : "Prisijungti"}
            </Button>
          </Stack>
        </Box>

        <Typography
          sx={{
            mt: 2.25,
            textAlign: "center",
            color: "text.disabled",
            fontSize: "0.72rem",
          }}
        >
          eSavitarna
        </Typography>
      </Box>
    </Box>
  );
}
