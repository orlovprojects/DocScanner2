import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  TextField,
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
        <Box component="span" sx={{ color: "primary.main" }}>
          e
        </Box>
        <Box component="span" sx={{ color: "#1F2937" }}>
          savitarna
        </Box>
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

function FieldLabel({ children }) {
  return (
    <Typography
      component="label"
      sx={{
        display: "block",
        mb: 0.7,
        fontSize: "0.8rem",
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
    fontSize: "0.9rem",
  },
  "& .MuiOutlinedInput-input": {
    py: 1.2,
  },
};

function Shell({ children }) {
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
        {children}
      </Box>
    </Box>
  );
}

export default function Invite() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { setMe } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    api
      .post("auth/invite/check/", { token })
      .then((r) => setInfo(r.data))
      .catch((e) => setError(apiError(e)));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      const { data } = await api.post("auth/invite/accept/", {
        token,
        password,
      });
      setMe(data);
      nav("/", { replace: true });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!info && !error) {
    return (
      <Shell>
        <Box
          sx={{
            bgcolor: "#fff",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "12px",
            p: 3,
            display: "grid",
            placeItems: "center",
            gap: 1.5,
          }}
        >
          <CircularProgress size={28} />
          <Typography sx={{ fontSize: "0.82rem", color: "text.secondary" }}>
            Tikrinama nuoroda…
          </Typography>
        </Box>
      </Shell>
    );
  }

  if (!info) {
    return (
      <Shell>
        <Box
          sx={{
            bgcolor: "#fff",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "12px",
            p: 2.5,
          }}
        >
          <Typography
            sx={{
              mb: 1.5,
              fontSize: "1.05rem",
              fontWeight: 750,
              color: "#1F2937",
            }}
          >
            Nuoroda nebegalioja
          </Typography>
          <Alert severity="warning" sx={{ borderRadius: "9px" }}>
            {error}
          </Alert>
        </Box>
      </Shell>
    );
  }

  return (
    <Shell>
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
            Sveiki, {info.first_name}!
          </Typography>

          <Typography
            sx={{
              mt: 0.55,
              color: "text.secondary",
              fontSize: "0.79rem",
              lineHeight: 1.45,
            }}
          >
            {info.company} kviečia naudotis darbuotojo savitarna.
          </Typography>
        </Box>

        <Stack component="form" gap={1.9} onSubmit={submit}>
          <Box>
            <FieldLabel>Jūsų prisijungimas</FieldLabel>
            <TextField
              fullWidth
              size="small"
              value={info.login}
              InputProps={{ readOnly: true }}
              autoComplete="username"
              sx={{
                ...fieldSx,
                "& .MuiOutlinedInput-root": {
                  ...fieldSx["& .MuiOutlinedInput-root"],
                  bgcolor: "#F8FAFC",
                },
              }}
            />
          </Box>

          <Box>
            <FieldLabel>
              {info.has_password ? "Jūsų slaptažodis" : "Sukurkite slaptažodį"}
            </FieldLabel>

            <PasswordField
              fullWidth
              size="small"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                info.has_password
                  ? "Įveskite slaptažodį"
                  : "Bent 8 simboliai"
              }
              helperText={
                info.has_password
                  ? "Jau turite paskyrą – įveskite esamą slaptažodį"
                  : "Slaptažodį turi sudaryti bent 8 simboliai"
              }
              autoComplete={
                info.has_password ? "current-password" : "new-password"
              }
              autoFocus
              sx={{
                ...fieldSx,
                "& .MuiFormHelperText-root": {
                  mx: 0,
                  mt: 0.55,
                  fontSize: "0.7rem",
                  lineHeight: 1.35,
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
            disabled={busy || password.length < 8}
            sx={{
              minHeight: 46,
              borderRadius: "10px",
              fontSize: "0.9rem",
              fontWeight: 700,
              textTransform: "none",
            }}
          >
            {busy
              ? "Prašome palaukti…"
              : info.has_password
                ? "Prisijungti"
                : "Išsaugoti ir prisijungti"}
          </Button>

          <Typography
            sx={{
              textAlign: "center",
              fontSize: "0.7rem",
              lineHeight: 1.4,
              color: "text.disabled",
            }}
          >
            Kitą kartą užeikite adresu esavitarna.lt
          </Typography>
        </Stack>
      </Box>
    </Shell>
  );
}
