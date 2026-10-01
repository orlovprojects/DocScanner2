import { useState } from "react";
import { Alert, Button, Link, Stack, TextField } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";

import { api, apiError } from "../api";
import AuthCard from "../components/AuthCard";

export default function ForgotPassword() {
  const [login, setLogin] = useState("");
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault(); setError("");
    try { setDone((await api.post("auth/password-reset/", { login })).data.detail); } catch (err) { setError(apiError(err)); }
  };

  return (
    <AuthCard title="Pamiršote slaptažodį?" subtitle="Atsiųsime nuorodą naujam slaptažodžiui sukurti.">
      {done ? <Alert severity="success">{done}</Alert> : (
        <Stack component="form" gap={2} onSubmit={submit}>
          <TextField label="El. paštas" value={login} onChange={(e) => setLogin(e.target.value)} inputProps={{ autoCapitalize: "none" }} autoFocus />
          {error && <Alert severity="error">{error}</Alert>}
          <Button type="submit" variant="contained" size="large" disabled={!login}>Siųsti nuorodą</Button>
        </Stack>
      )}
      <Link component={RouterLink} to="/prisijungti" display="block" textAlign="center" mt={2}>Grįžti į prisijungimą</Link>
    </AuthCard>
  );
}
