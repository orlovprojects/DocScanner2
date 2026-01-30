// src/pages/PasswordReset.jsx

import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import {
  Box,
  Typography,
  TextField,
  Button,
  Link,
  Container,
  Alert,
  CircularProgress,
  Stepper,
  Step,
  StepLabel,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import EmailIcon from "@mui/icons-material/Email";
import LockResetIcon from "@mui/icons-material/LockReset";
import VpnKeyIcon from "@mui/icons-material/VpnKey";

import {
  requestPasswordReset,
  verifyResetCode,
  confirmPasswordReset,
} from "../api/endpoints";

// ═══════════════════════════════════════════════════════════════════════════════
// Validators (tokie patys kaip Register.jsx)
// ═══════════════════════════════════════════════════════════════════════════════
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value) {
  if (!value) return "Įveskite el. paštą";
  if (!emailRegex.test(value)) return "Neteisingas el. pašto formatas";
  return "";
}

const hasLower = /[a-z]/;
const hasUpper = /[A-Z]/;
const hasDigit = /\d/;
const hasSpace = /\s/;

function validatePassword(password) {
  const errors = [];
  if (password.length < 8) errors.push("Minimum 8 simboliai");
  if (!hasLower.test(password)) errors.push("Bent viena mažoji raidė");
  if (!hasUpper.test(password)) errors.push("Bent viena didžioji raidė");
  if (!hasDigit.test(password)) errors.push("Bent vienas skaičius");
  if (hasSpace.test(password)) errors.push("Be tarpų");
  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Password Requirements Component
// ═══════════════════════════════════════════════════════════════════════════════
const PasswordRequirements = ({ value }) => {
  const okLen = value.length >= 8;
  const okLower = hasLower.test(value);
  const okUpper = hasUpper.test(value);
  const okDigit = hasDigit.test(value);
  const okNoSpaces = !hasSpace.test(value) && value !== "";

  const Row = ({ ok, text }) => (
    <Box
      component="li"
      sx={{
        display: "flex",
        alignItems: "center",
        mb: 0.25,
        color: ok ? "success.main" : "error.main",
      }}
    >
      {ok ? (
        <CheckCircleIcon fontSize="small" />
      ) : (
        <CancelIcon fontSize="small" />
      )}
      <Typography variant="caption" sx={{ ml: 0.5 }}>
        {text}
      </Typography>
    </Box>
  );

  return (
    <Box component="ul" sx={{ pl: 2, m: 0.5 }}>
      <Row ok={okLen} text="Minimum 8 simboliai" />
      <Row ok={okLower} text="Bent viena mažoji raidė" />
      <Row ok={okUpper} text="Bent viena didžioji raidė" />
      <Row ok={okDigit} text="Bent vienas skaičius" />
      <Row ok={okNoSpaces} text="Be tarpų" />
    </Box>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// Steps
// ═══════════════════════════════════════════════════════════════════════════════
const steps = ["El. paštas", "Kodas", "Naujas slaptažodis"];

export default function PasswordReset() {
  const nav = useNavigate();

  // Aktyvus žingsnis (0 = email, 1 = code, 2 = new password)
  const [activeStep, setActiveStep] = useState(0);

  // Form state
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  // Touched state
  const [touched, setTouched] = useState({
    email: false,
    code: false,
    password: false,
    passwordConfirm: false,
  });

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Cooldown laikmatis (naujo kodo užklausai)
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Likę bandymai
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);

  // ═══════════════════════════════════════════════════════════════════════════════
  // Cooldown Timer
  // ═══════════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (cooldownSeconds <= 0) return;

    const timer = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const formatCooldown = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════════
  // Validation
  // ═══════════════════════════════════════════════════════════════════════════════
  const emailError = useMemo(() => {
    if (!touched.email) return "";
    return validateEmail(email);
  }, [email, touched.email]);

  const codeError = useMemo(() => {
    if (!touched.code) return "";
    if (!code) return "Įveskite kodą";
    if (!/^\d{7}$/.test(code)) return "Kodas turi būti 7 skaitmenų";
    return "";
  }, [code, touched.code]);

  const passwordErrors = useMemo(() => {
    return touched.password ? validatePassword(password) : [];
  }, [password, touched.password]);

  const passwordConfirmError = useMemo(() => {
    if (!touched.passwordConfirm) return "";
    if (!passwordConfirm) return "Pakartokite slaptažodį";
    if (password !== passwordConfirm) return "Slaptažodžiai nesutampa";
    return "";
  }, [passwordConfirm, password, touched.passwordConfirm]);

  // ═══════════════════════════════════════════════════════════════════════════════
  // Step 1: Request Code
  // ═══════════════════════════════════════════════════════════════════════════════
  const handleRequestCode = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setTouched((t) => ({ ...t, email: true }));

    const emailErr = validateEmail(email);
    if (emailErr) return;

    try {
      setLoading(true);
      const data = await requestPasswordReset(email);

      setSuccess(data.message || "Kodas išsiųstas į jūsų el. paštą.");
      setCooldownSeconds((data.cooldown_minutes || 3) * 60);
      setActiveStep(1);
      setAttemptsRemaining(3);
    } catch (err) {
      const errData = err.response?.data;

      if (err.response?.status === 429 && errData?.retry_after_seconds) {
        setCooldownSeconds(errData.retry_after_seconds);
        setError(errData.error || "Palaukite prieš užklausiant naują kodą.");
      } else {
        setError(
          errData?.error ||
            errData?.message ||
            "Įvyko klaida. Bandykite dar kartą."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // Step 2: Verify Code
  // ═══════════════════════════════════════════════════════════════════════════════
  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setTouched((t) => ({ ...t, code: true }));

    if (!/^\d{7}$/.test(code)) return;

    try {
      setLoading(true);
      const data = await verifyResetCode(email, code);

      if (data.verified) {
        setSuccess("Kodas patvirtintas!");
        setActiveStep(2);
      }
    } catch (err) {
      const errData = err.response?.data;

      if (errData?.blocked) {
        setError("Paskyra užblokuota. Susisiekite su mumis.");
        return;
      }

      if (errData?.expired) {
        setError("Kodo galiojimo laikas baigėsi. Užklaukite naują kodą.");
        setActiveStep(0);
        setCooldownSeconds(0);
        return;
      }

      if (errData?.attempts_remaining !== undefined) {
        setAttemptsRemaining(errData.attempts_remaining);
      }

      setError(errData?.error || "Neteisingas kodas.");
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // Step 3: Set New Password
  // ═══════════════════════════════════════════════════════════════════════════════
  const handleSetPassword = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setTouched((t) => ({ ...t, password: true, passwordConfirm: true }));

    const passErrs = validatePassword(password);
    const confirmErr =
      !passwordConfirm
        ? "Pakartokite slaptažodį"
        : password !== passwordConfirm
        ? "Slaptažodžiai nesutampa"
        : "";

    if (passErrs.length > 0 || confirmErr) return;

    try {
      setLoading(true);
      const data = await confirmPasswordReset(
        email,
        code,
        password,
        passwordConfirm
      );

      if (data.success) {
        setSuccess("Slaptažodis sėkmingai pakeistas! Nukreipiame...");
        setTimeout(() => nav("/prisijungti"), 2000);
      }
    } catch (err) {
      const errData = err.response?.data;

      if (errData?.blocked) {
        setError("Paskyra užblokuota. Susisiekite su mumis.");
        return;
      }

      if (errData?.expired) {
        setError("Kodo galiojimo laikas baigėsi. Pradėkite iš naujo.");
        setActiveStep(0);
        setCooldownSeconds(0);
        return;
      }

      setError(
        errData?.error ||
          errData?.password?.[0] ||
          "Įvyko klaida. Bandykite dar kartą."
      );
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // Resend Code (iš step 1)
  // ═══════════════════════════════════════════════════════════════════════════════
  const handleResendCode = async () => {
    if (cooldownSeconds > 0) return;

    setError("");
    setSuccess("");

    try {
      setLoading(true);
      const data = await requestPasswordReset(email);
      setSuccess("Naujas kodas išsiųstas!");
      setCooldownSeconds((data.cooldown_minutes || 3) * 60);
      setAttemptsRemaining(3);
    } catch (err) {
      const errData = err.response?.data;
      if (err.response?.status === 429 && errData?.retry_after_seconds) {
        setCooldownSeconds(errData.retry_after_seconds);
      }
      setError(errData?.error || "Nepavyko išsiųsti naujo kodo.");
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════════
  return (
    <Container maxWidth={false} disableGutters>
      <Helmet>
        <title>Priminti slaptažodį – DokSkenas</title>
        <meta
          name="description"
          content="Atkurkite savo DokSkenas paskyros slaptažodį."
        />
      </Helmet>

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          minHeight: "100vh",
          bgcolor: "#f5f5f5",
          padding: { xs: 2, sm: 3, md: 4 },
          pt: { xs: 4, sm: 6 },
        }}
      >
        {/* Header */}
        <Box sx={{ textAlign: "center", mb: 3 }}>
          <LockResetIcon sx={{ fontSize: 48, color: "primary.main", mb: 1 }} />
          <Typography
            variant="h4"
            sx={{ fontFamily: "Arial", fontWeight: "bold" }}
          >
            Slaptažodžio atkūrimas
          </Typography>
        </Box>

        {/* Stepper */}
        <Stepper
          activeStep={activeStep}
          alternativeLabel
          sx={{ width: { xs: "100%", sm: "500px" }, mb: 3 }}
        >
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* Main Card */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            width: { xs: "90%", sm: "420px" },
            bgcolor: "white",
            padding: 3,
            borderRadius: 2,
            boxShadow: 3,
          }}
        >
          {/* Alerts */}
          {error && (
            <Alert severity="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" onClose={() => setSuccess("")}>
              {success}
            </Alert>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* STEP 0: Email Input */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {activeStep === 0 && (
            <Box
              component="form"
              noValidate
              onSubmit={handleRequestCode}
              sx={{ display: "flex", flexDirection: "column", gap: 2 }}
            >
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Įveskite el. pašto adresą, kurį naudojote registruodamiesi.
                Išsiųsime jums patvirtinimo kodą.
              </Typography>

              <TextField
                label="El. paštas"
                type="email"
                variant="outlined"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                error={!!emailError}
                helperText={emailError || " "}
                fullWidth
                InputProps={{
                  startAdornment: (
                    <EmailIcon sx={{ mr: 1, color: "action.active" }} />
                  ),
                }}
              />

              <Button
                type="submit"
                variant="contained"
                disabled={loading}
                fullWidth
                sx={{
                  height: 50,
                  bgcolor: loading ? "grey.500" : "black",
                  "&:hover": { bgcolor: "#f5be0d", color: "black" },
                }}
              >
                {loading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  "Siųsti kodą"
                )}
              </Button>
            </Box>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* STEP 1: Code Verification */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {activeStep === 1 && (
            <Box
              component="form"
              noValidate
              onSubmit={handleVerifyCode}
              sx={{ display: "flex", flexDirection: "column", gap: 2 }}
            >
              <Typography variant="body2" color="text.secondary">
                Išsiuntėme 7 skaitmenų kodą į <strong>{email}</strong>.
                Patikrinkite savo el. paštą ir įveskite kodą žemiau.
              </Typography>

              <TextField
                label="7 skaitmenų kodas"
                variant="outlined"
                value={code}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 7);
                  setCode(val);
                }}
                onBlur={() => setTouched((t) => ({ ...t, code: true }))}
                error={!!codeError}
                helperText={codeError || " "}
                fullWidth
                inputProps={{
                  maxLength: 7,
                  style: {
                    textAlign: "center",
                    fontSize: "1.5rem",
                    letterSpacing: "0.3em",
                    fontWeight: "bold",
                  },
                }}
                InputProps={{
                  startAdornment: (
                    <VpnKeyIcon sx={{ mr: 1, color: "action.active" }} />
                  ),
                }}
              />

              {/* Remaining attempts warning */}
              {attemptsRemaining < 3 && (
                <Alert severity="warning" sx={{ py: 0.5 }}>
                  Liko bandymų: <strong>{attemptsRemaining}</strong>
                </Alert>
              )}

              <Button
                type="submit"
                variant="contained"
                disabled={loading}
                fullWidth
                sx={{
                  height: 50,
                  bgcolor: loading ? "grey.500" : "black",
                  "&:hover": { bgcolor: "#f5be0d", color: "black" },
                }}
              >
                {loading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  "Patvirtinti kodą"
                )}
              </Button>

              {/* Resend code link */}
              <Box sx={{ textAlign: "center", mt: 1 }}>
                {cooldownSeconds > 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Naujas kodas galimas po:{" "}
                    <strong>{formatCooldown(cooldownSeconds)}</strong>
                  </Typography>
                ) : (
                  <Link
                    component="button"
                    type="button"
                    onClick={handleResendCode}
                    disabled={loading}
                    sx={{
                      textDecoration: "none",
                      "&:hover": { textDecoration: "underline" },
                    }}
                  >
                    Siųsti naują kodą
                  </Link>
                )}
              </Box>

              {/* Back button */}
              <Button
                variant="text"
                onClick={() => {
                  setActiveStep(0);
                  setCode("");
                  setError("");
                  setSuccess("");
                }}
                sx={{ mt: 1 }}
              >
                ← Grįžti atgal
              </Button>
            </Box>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* STEP 2: New Password */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {activeStep === 2 && (
            <Box
              component="form"
              noValidate
              onSubmit={handleSetPassword}
              sx={{ display: "flex", flexDirection: "column", gap: 2 }}
            >
              <Typography variant="body2" color="text.secondary">
                Kodas patvirtintas! Dabar sukurkite naują slaptažodį.
              </Typography>

              <Box>
                <TextField
                  label="Naujas slaptažodis"
                  type="password"
                  variant="outlined"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  error={touched.password && passwordErrors.length > 0}
                  helperText=" "
                  fullWidth
                />
                {touched.password && <PasswordRequirements value={password} />}
              </Box>

              <TextField
                label="Pakartok slaptažodį"
                type="password"
                variant="outlined"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                onBlur={() =>
                  setTouched((t) => ({ ...t, passwordConfirm: true }))
                }
                error={!!passwordConfirmError}
                helperText={passwordConfirmError || " "}
                fullWidth
              />

              <Button
                type="submit"
                variant="contained"
                disabled={loading}
                fullWidth
                sx={{
                  height: 50,
                  bgcolor: loading ? "grey.500" : "black",
                  "&:hover": { bgcolor: "#f5be0d", color: "black" },
                }}
              >
                {loading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  "Išsaugoti slaptažodį"
                )}
              </Button>
            </Box>
          )}

          {/* Back to login */}
          <Box sx={{ textAlign: "center", mt: 2 }}>
            <Link
              href="#"
              onClick={(e) => {
                e.preventDefault();
                nav("/prisijungti");
              }}
              sx={{
                textDecoration: "none",
                color: "text.primary",
                "&:hover": { textDecoration: "underline" },
                fontFamily: "Arial",
                fontSize: "14px",
              }}
            >
              ← Grįžti į prisijungimą
            </Link>
          </Box>
        </Box>
      </Box>
    </Container>
  );
}