import { useEffect, useState } from "react";
import { Alert, Button, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";

import { api, apiError } from "../api";
import { useAuth } from "../auth";
import AuthCard from "../components/AuthCard";
import PasswordField from "../components/PasswordField";

export default function Invite() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { setMe } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    api.post("auth/invite/check/", { token }).then((r) => setInfo(r.data)).catch((e) => setError(apiError(e)));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const { data } = await api.post("auth/invite/accept/", { token, password });
      setMe(data);
      nav("/", { replace: true });
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  };

  if (!info && !error) return <AuthCard title="Tikrinama nuoroda…"><CircularProgress /></AuthCard>;
  if (!info) return <AuthCard title="Nuoroda nebegalioja"><Alert severity="warning">{error}</Alert></AuthCard>;

  return (
    <AuthCard title={`Sveiki, ${info.first_name}!`} subtitle={`${info.company} kviečia naudotis darbuotojo savitarna.`}>
      <Stack component="form" gap={2} onSubmit={submit}>
        <TextField label="Jūsų prisijungimas" value={info.login} InputProps={{ readOnly: true }} autoComplete="username" />
        {info.has_password ? (
          <PasswordField label="Jūsų slaptažodis" value={password} onChange={(e) => setPassword(e.target.value)}
            helperText="Jau turite paskyrą – įveskite esamą slaptažodį" autoComplete="current-password" autoFocus />
        ) : (
          <PasswordField label="Sukurkite slaptažodį" value={password} onChange={(e) => setPassword(e.target.value)}
            helperText="Bent 8 simboliai" autoComplete="new-password" autoFocus />
        )}
        {error && <Alert severity="error">{error}</Alert>}
        <Button type="submit" variant="contained" size="large" disabled={busy || password.length < 8}>
          {info.has_password ? "Prisijungti" : "Išsaugoti ir prisijungti"}
        </Button>
        <Typography variant="caption" color="text.secondary" textAlign="center">
          Kitą kartą užeikite adresu esavitarna.lt
        </Typography>
      </Stack>
    </AuthCard>
  );
}
