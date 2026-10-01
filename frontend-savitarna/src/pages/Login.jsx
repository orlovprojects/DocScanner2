import { useState } from "react";
import { Alert, Button, Link, Stack, TextField } from "@mui/material";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";

import { api, apiError } from "../api";
import { useAuth } from "../auth";
import AuthCard from "../components/AuthCard";
import PasswordField from "../components/PasswordField";

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
    setBusy(true); setError("");
    try {
      const { data } = await api.post("auth/login/", { login, password });
      setMe(data);
      nav(loc.state?.from || "/", { replace: true });
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  };

  return (
    <AuthCard title="Prisijungimas">
      <Stack component="form" gap={2} onSubmit={submit}>
        <TextField label="El. paštas arba telefonas" value={login} onChange={(e) => setLogin(e.target.value)}
          autoComplete="username" inputProps={{ autoCapitalize: "none" }} autoFocus />
        <PasswordField label="Slaptažodis" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {error && <Alert severity="error">{error}</Alert>}
        <Button type="submit" variant="contained" size="large" disabled={busy || !login || !password}>Prisijungti</Button>
        <Link component={RouterLink} to="/pamirsau" textAlign="center">Pamiršau slaptažodį</Link>
      </Stack>
    </AuthCard>
  );
}
