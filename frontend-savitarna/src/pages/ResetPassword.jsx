import { useState } from "react";
import { Alert, Button, Stack } from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";

import { api, apiError } from "../api";
import { useAuth } from "../auth";
import AuthCard from "../components/AuthCard";
import PasswordField from "../components/PasswordField";

export default function ResetPassword() {
  const { token } = useParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { setMe } = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault(); setError("");
    try {
      const { data } = await api.post("auth/password-reset/confirm/", { token, password });
      setMe(data); nav("/", { replace: true });
    } catch (err) { setError(apiError(err)); }
  };

  return (
    <AuthCard title="Naujas slaptažodis">
      <Stack component="form" gap={2} onSubmit={submit}>
        <PasswordField label="Naujas slaptažodis" value={password} onChange={(e) => setPassword(e.target.value)}
          helperText="Bent 8 simboliai" autoComplete="new-password" autoFocus />
        {error && <Alert severity="error">{error}</Alert>}
        <Button type="submit" variant="contained" size="large" disabled={password.length < 8}>Išsaugoti ir prisijungti</Button>
      </Stack>
    </AuthCard>
  );
}
