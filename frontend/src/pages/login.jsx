import { Box, Typography, TextField, Button, Link, Container } from '@mui/material';
import { useState } from "react";
import { useAuth } from "../contexts/useAuth";
import { useNavigate } from "react-router-dom";
import { Helmet } from 'react-helmet';

const Login = () => {
  const [email, setEmail] = useState("");  // Изменено с username на email
  const [password, setPassword] = useState("");
  const nav = useNavigate();
  const { login_user } = useAuth();

  const handleLogin = (e) => {
    e.preventDefault(); // Prevent the page from reloading
    login_user(email, password);  // Передаём email и password
  };

  const handleNav = () => {
    nav('/registruotis');
  };

  return (
    <Container maxWidth={false} disableGutters justifyContent='center'>
      <Helmet>
        <title>Prisijungti – DokSkenas</title>
        <meta
          name="description"
          content="Prisijunk ir naudokis DokSkenu."
        />
      </Helmet>      
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'top',
          minHeight: '100vh',
          bgcolor: '#f5f5f5',
          padding: { xs: 1, sm: 2, md: 3 }, // Responsive padding
        }}
      >
        <Typography 
          variant="h4" 
          sx={{ marginBottom: 2, fontFamily: 'Arial', fontWeight: 'Bold'}}
        >
          Prisijungti
        </Typography>

        <Box
          component="form"
          onSubmit={handleLogin}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            width: { xs: '80%', sm: '400px' }, // Responsive width
            bgcolor: 'white',
            padding: 3,
            borderRadius: 1,
            boxShadow: 2,
          }}
        >
          <TextField
            label="El. paštas"   // Изменено с Username на Email
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
          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            sx={{ 
              height: '50px',
              bgcolor: 'black',
              '&:hover': {
                bgcolor: '#f5be0d',
                color: 'black',
              },
            }}
          >
            Prisijungti
          </Button>
          <Box sx={{ textAlign: 'center' }}>
            <Link
              href="#"
              onClick={handleNav}
              sx={{
                textDecoration: 'none',
                color: 'text.primary',
                '&:hover': { textDecoration: 'underline' },
                fontFamily: 'Arial',
                fontSize: '14px',
              }}
            >
              Neturi paskyros? Užsiregistruok!
            </Link>
          </Box>
        </Box>
      </Box>
    </Container>
  );
};



export default Login;