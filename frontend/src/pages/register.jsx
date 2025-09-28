import { useState, useMemo, useRef } from "react";
import { useAuth } from "../contexts/useAuth";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  TextField,
  Button,
  Link,
  Container,
  Alert,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";

// Meta Pixel
import { track, ensureFbqReady } from "../metaPixel";

// --- Validators ---
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

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [Cpassword, setCPassword] = useState("");

  const [touched, setTouched] = useState({
    email: false,
    password: false,
    Cpassword: false,
  });

  const [loading, setLoading] = useState(false);
  const [backendError, setBackendError] = useState("");

  const nav = useNavigate();
  const { register_user } = useAuth();

  // guard от повторной отправки событий (StrictMode/HMR)
  const firedRef = useRef(false);

  const emailError = useMemo(() => {
    if (!touched.email) return "";
    return validateEmail(email);
  }, [email, touched.email]);

  const passwordErrors = useMemo(() => {
    return touched.password ? validatePassword(password) : [];
  }, [password, touched.password]);

  const cpassError = useMemo(() => {
    if (!touched.Cpassword) return "";
    if (!Cpassword) return "Pakartokite slaptažodį";
    if (password !== Cpassword) return "Slaptažodžiai nesutampa";
    return "";
  }, [Cpassword, password, touched.Cpassword]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setBackendError("");
    setTouched({ email: true, password: true, Cpassword: true });

    const emailErrNow = validateEmail(email);
    const passErrsNow = validatePassword(password);
    const cpassErrNow = !Cpassword
      ? "Pakartokite slaptažodį"
      : password !== Cpassword
      ? "Slaptažodžiai nesutampa"
      : "";

    if (emailErrNow || passErrsNow.length > 0 || cpassErrNow) return;

    try {
      setLoading(true);
      await register_user(email, password, Cpassword);

      // ✅ только после успешной регистрации
      if (!firedRef.current) {
        try {
          await ensureFbqReady(3000);
        } catch {
          // ок — событие уйдёт из буфера позже
        }

        track("CompleteRegistration", {
          status: true,
          method: "email",
        });

        firedRef.current = true;

        // маленькая задержка, чтобы Pixel Helper увидел событие в dev
        await new Promise((r) => setTimeout(r, 150));
      }

      nav("/prisijungti");
    } catch (err) {
      const msg =
        (err && (err.message || err.error || err.detail)) ||
        "Įvyko klaida. Bandykite dar kartą.";
      setBackendError(String(msg));
    } finally {
      setLoading(false);
    }
  };

  const handleNav = () => nav("/prisijungti");

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
        {ok ? <CheckCircleIcon fontSize="small" /> : <CancelIcon fontSize="small" />}
        <Typography variant="caption" sx={{ ml: 0.5 }}>
          {text}
        </Typography>
      </Box>
    );

    // ВАЖНО: возвращаем список как самостоятельный блок (не в helperText)
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

  return (
    <Container maxWidth={false} disableGutters justifyContent="center">
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "top",
          minHeight: "100vh",
          bgcolor: "#f5f5f5",
          padding: { xs: 1, sm: 2, md: 3 },
        }}
      >
        <Typography
          variant="h4"
          sx={{ marginBottom: 2, fontFamily: "Arial", fontWeight: "Bold" }}
        >
          Užsiregistruoti
        </Typography>

        <Box
          component="form"
          noValidate
          onSubmit={handleRegister}
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            width: { xs: "80%", sm: "400px" },
            bgcolor: "white",
            padding: 3,
            borderRadius: 1,
            boxShadow: 2,
          }}
        >
          {backendError && <Alert severity="error">{backendError}</Alert>}

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
          />

          <Box>
            <TextField
              label="Slaptažodis"
              type="password"
              variant="outlined"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              error={touched.password && validatePassword(password).length > 0}
              helperText={" " /* держим место, но не кладём <ul> внутрь */}
              fullWidth
            />
            {touched.password && (
              <PasswordRequirements value={password} />
            )}
          </Box>

          <TextField
            label="Pakartok slaptažodį"
            type="password"
            variant="outlined"
            value={Cpassword}
            onChange={(e) => setCPassword(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, Cpassword: true }))}
            error={!!cpassError}
            helperText={cpassError || " "}
            fullWidth
          />

          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={loading}
            fullWidth
            sx={{
              height: "50px",
              bgcolor: loading ? "grey.500" : "black",
              "&:hover": {
                bgcolor: loading ? "grey.600" : "#f5be0d",
                color: "black",
              },
            }}
          >
            {loading ? "Vykdoma..." : "Registruotis"}
          </Button>

          <Box sx={{ textAlign: "center" }}>
            <Link
              href="#"
              onClick={handleNav}
              sx={{
                textDecoration: "none",
                color: "text.primary",
                "&:hover": { textDecoration: "underline" },
                fontFamily: "Arial",
                fontSize: "14px",
              }}
            >
              Jei jau turi paskyrą, <b>prisijunk</b>!
            </Link>
          </Box>

          <Typography
            variant="caption"
            sx={{ display: "block", color: "#555", mt: 0.5, fontFamily: "Helvetica" }}
          >
            Paspausdami Registruotis, jūs sutinkate su{" "}
            <Link href="/privatumo-politika" underline="hover">
              Privatumo politika
            </Link>{" "}
            ir{" "}
            <Link href="/naudojimo-taisykles" underline="hover">
              Naudojimo taisyklėmis
            </Link>
            .
          </Typography>
        </Box>
      </Box>
    </Container>
  );
}









// import { useState, useMemo } from "react";
// import { useAuth } from "../contexts/useAuth";
// import { useNavigate } from "react-router-dom";
// import {
//   Box,
//   Typography,
//   TextField,
//   Button,
//   Link,
//   Container,
//   Alert,
// } from "@mui/material";
// import CheckCircleIcon from "@mui/icons-material/CheckCircle";
// import CancelIcon from "@mui/icons-material/Cancel";

// // --- Validators ---
// const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// function validateEmail(value) {
//   if (!value) return "Įveskite el. paštą";
//   if (!emailRegex.test(value)) return "Neteisingas el. pašto formatas";
//   return "";
// }

// const hasLower = /[a-z]/;
// const hasUpper = /[A-Z]/;
// const hasDigit = /\d/;
// const hasSpace = /\s/;

// function validatePassword(password) {
//   const errors = [];
//   if (password.length < 8) errors.push("Minimum 8 simboliai");
//   if (!hasLower.test(password)) errors.push("Bent viena mažoji raidė");
//   if (!hasUpper.test(password)) errors.push("Bent viena didžioji raidė");
//   if (!hasDigit.test(password)) errors.push("Bent vienas skaičius");
//   if (hasSpace.test(password)) errors.push("Be tarpų");
//   return errors;
// }

// export default function Register() {
//   const [email, setEmail] = useState("");
//   const [password, setPassword] = useState("");
//   const [Cpassword, setCPassword] = useState("");

//   const [touched, setTouched] = useState({
//     email: false,
//     password: false,
//     Cpassword: false,
//   });

//   const [loading, setLoading] = useState(false);
//   const [backendError, setBackendError] = useState("");

//   const nav = useNavigate();
//   const { register_user } = useAuth();

//   const emailError = useMemo(() => {
//     if (!touched.email) return "";
//     return validateEmail(email);
//   }, [email, touched.email]);

//   const passwordErrors = useMemo(() => {
//     return touched.password ? validatePassword(password) : [];
//   }, [password, touched.password]);

//   const cpassError = useMemo(() => {
//     if (!touched.Cpassword) return "";
//     if (!Cpassword) return "Pakartokite slaptažodį";
//     if (password !== Cpassword) return "Slaptažodžiai nesutampa";
//     return "";
//   }, [Cpassword, password, touched.Cpassword]);

//   const handleRegister = async (e) => {
//     e.preventDefault();
//     setBackendError("");
//     setTouched({ email: true, password: true, Cpassword: true });

//     const emailErrNow = validateEmail(email);
//     const passErrsNow = validatePassword(password);
//     const cpassErrNow = !Cpassword
//       ? "Pakartokite slaptažodį"
//       : password !== Cpassword
//       ? "Slaptažodžiai nesutampa"
//       : "";

//     if (emailErrNow || passErrsNow.length > 0 || cpassErrNow) return;

//     try {
//       setLoading(true);
//       await register_user(email, password, Cpassword);
//     } catch (err) {
//       const msg =
//         (err && (err.message || err.error || err.detail)) ||
//         "Įvyko klaida. Bandykite dar kartą.";
//       setBackendError(String(msg));
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleNav = () => nav("/prisijungti");

//   const PasswordRequirements = ({ value }) => {
//     const okLen = value.length >= 8;
//     const okLower = hasLower.test(value);
//     const okUpper = hasUpper.test(value);
//     const okDigit = hasDigit.test(value);
//     const okNoSpaces = !hasSpace.test(value) && value !== "";

//     const Row = ({ ok, text }) => (
//       <Box
//         component="li"
//         sx={{
//           display: "flex",
//           alignItems: "center",
//           mb: 0.25,
//           color: ok ? "success.main" : "error.main",
//         }}
//       >
//         {ok ? <CheckCircleIcon fontSize="small" /> : <CancelIcon fontSize="small" />}
//         <Typography variant="caption" sx={{ ml: 0.5 }}>
//           {text}
//         </Typography>
//       </Box>
//     );

//     return (
//       <Box component="ul" sx={{ pl: 0, m: 1 }}>
//         <Row ok={okLen} text="Minimum 8 simboliai" />
//         <Row ok={okLower} text="Bent viena mažoji raidė" />
//         <Row ok={okUpper} text="Bent viena didžioji raidė" />
//         <Row ok={okDigit} text="Bent vienas skaičius" />
//         <Row ok={okNoSpaces} text="Be tarpų" />
//       </Box>
//     );
//   };

//   return (
//     <Container maxWidth={false} disableGutters justifyContent="center">
//       <Box
//         sx={{
//           display: "flex",
//           flexDirection: "column",
//           alignItems: "center",
//           justifyContent: "top",
//           minHeight: "100vh",
//           bgcolor: "#f5f5f5",
//           padding: { xs: 1, sm: 2, md: 3 },
//         }}
//       >
//         <Typography
//           variant="h4"
//           sx={{ marginBottom: 2, fontFamily: "Arial", fontWeight: "Bold" }}
//         >
//           Užsiregistruoti
//         </Typography>

//         <Box
//           component="form"
//           noValidate
//           onSubmit={handleRegister}
//           sx={{
//             display: "flex",
//             flexDirection: "column",
//             gap: 2,
//             width: { xs: "80%", sm: "400px" },
//             bgcolor: "white",
//             padding: 3,
//             borderRadius: 1,
//             boxShadow: 2,
//           }}
//         >
//           {backendError && <Alert severity="error">{backendError}</Alert>}

//           <TextField
//             label="El. paštas"
//             type="email"
//             variant="outlined"
//             value={email}
//             onChange={(e) => setEmail(e.target.value)}
//             onBlur={() => setTouched((t) => ({ ...t, email: true }))}
//             error={!!emailError}
//             helperText={emailError || " "}
//             fullWidth
//           />

//           <TextField
//             label="Slaptažodis"
//             type="password"
//             variant="outlined"
//             value={password}
//             onChange={(e) => setPassword(e.target.value)}
//             onBlur={() => setTouched((t) => ({ ...t, password: true }))}
//             error={touched.password && validatePassword(password).length > 0}
//             helperText={
//               touched.password ? <PasswordRequirements value={password} /> : " "
//             }
//             fullWidth
//           />

//           <TextField
//             label="Pakartok slaptažodį"
//             type="password"
//             variant="outlined"
//             value={Cpassword}
//             onChange={(e) => setCPassword(e.target.value)}
//             onBlur={() => setTouched((t) => ({ ...t, Cpassword: true }))}
//             error={!!cpassError}
//             helperText={cpassError || " "}
//             fullWidth
//           />

//           <Button
//             type="submit"
//             variant="contained"
//             color="primary"
//             disabled={loading}
//             fullWidth
//             sx={{
//               height: "50px",
//               bgcolor: loading ? "grey.500" : "black",
//               "&:hover": {
//                 bgcolor: loading ? "grey.600" : "#f5be0d",
//                 color: "black",
//               },
//             }}
//           >
//             {loading ? "Vykdoma..." : "Registruotis"}
//           </Button>

//           <Box sx={{ textAlign: "center" }}>
//             <Link
//               href="#"
//               onClick={handleNav}
//               sx={{
//                 textDecoration: "none",
//                 color: "text.primary",
//                 "&:hover": { textDecoration: "underline" },
//                 fontFamily: "Arial",
//                 fontSize: "14px",
//               }}
//             >
//               Jei jau turi paskyrą, <b>prisijunk</b>!
//             </Link>
//           </Box>

//           <Typography
//             variant="caption"
//             sx={{ display: "block", color: "#555", mt: 0.5, fontFamily: "Helvetica" }}
//           >
//             Paspausdami Registruotis, jūs sutinkate su{" "}
//             <Link href="/privatumo-politika" underline="hover">
//               Privatumo politika
//             </Link>{" "}
//             ir{" "}
//             <Link href="/naudojimo-taisykles" underline="hover">
//               Naudojimo taisyklėmis
//             </Link>
//             .
//           </Typography>
//         </Box>
//       </Box>
//     </Container>
//   );
// }
