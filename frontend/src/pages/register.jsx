import { useState } from "react";
import { useAuth } from "../contexts/useAuth";
import { useNavigate } from "react-router-dom";
import { Box, Typography, TextField, Button, Link, Container } from "@mui/material";

const Register = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [Cpassword, setCPassword] = useState("");

  const nav = useNavigate();
  const { register_user } = useAuth();

  const handleRegister = (e) => {
    e.preventDefault(); // Prevent the page from reloading
    register_user(email, password, Cpassword);
  };

  const handleNav = () => {
    nav('/prisijungti');
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
          <TextField
            label="El. paštas"
            type="email"
            variant="outlined"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
            fullWidth
          />
          <TextField
            label="Slaptažodis"
            type="password"
            variant="outlined"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
            fullWidth
          />
          <TextField
            label="Pakartok slaptažodį"
            type="password"
            variant="outlined"
            value={Cpassword}
            onChange={(e) => {
              setCPassword(e.target.value);
            }}
            fullWidth
          />
          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            sx={{
              height: "50px",
              bgcolor: "black",
              "&:hover": {
                bgcolor: "#f5be0d",
                color: "black",
              },
            }}
          >
            Registruotis
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
              Jei jau turi paskyrą, prisijunk!
            </Link>
          </Box>
        </Box>
      </Box>
    </Container>
  );
};

export default Register;