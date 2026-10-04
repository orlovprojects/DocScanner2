// src/pages/Contact.jsx
import { useState, useRef } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { Helmet } from 'react-helmet';
import {
  Container,
  Typography,
  Box,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  Paper,
  Stack,
  Divider,
  Card,
  CardContent,
  InputAdornment,
} from '@mui/material';
import Grid2 from '@mui/material/Grid2';
import {
  Send as SendIcon,
  CheckCircleOutline as CheckIcon,
  PersonOutline as PersonIcon,
  Email as EmailIcon,
  ChatBubbleOutline as ChatIcon,
} from '@mui/icons-material';

// Публичный инстанс axios (без куков)
import { publicApi } from '../api/endpoints';

// курсив после двоеточия, но эмодзи без курсива
const renderItalicWithoutEmoji = (text) => {
  const emojiRegex = /(\p{Extended_Pictographic}+)/gu;
  const parts = [];
  let lastIndex = 0;
  let m;
  while ((m = emojiRegex.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push({ t: 'i', v: text.slice(lastIndex, m.index) });
    parts.push({ t: 'e', v: m[0] });
    lastIndex = emojiRegex.lastIndex;
  }
  if (lastIndex < text.length) parts.push({ t: 'i', v: text.slice(lastIndex) });
  return (
    <>
      {parts.map((p, i) =>
        p.t === 'e' ? (
          <Box key={i} component="span" sx={{ fontStyle: 'normal' }}>
            {p.v}
          </Box>
        ) : (
          <Box key={i} component="span" sx={{ fontStyle: 'italic' }}>
            {p.v}
          </Box>
        )
      )}
    </>
  );
};

// Инпуты — белые
const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2.5,
    fontFamily: 'Helvetica, Arial, sans-serif',
    backgroundColor: '#ffffff',
    transition: 'box-shadow .2s ease, transform .05s ease',
    boxShadow: '0 1px 0 rgba(2,6,23,0.04)',
    '&:hover fieldset': { borderColor: '#cbd5e1' },
    '&.Mui-focused': {
      boxShadow: '0 0 0 3px rgba(99,102,241,0.15)',
    },
  },
  '& .MuiInputLabel-root': { fontFamily: 'Helvetica, Arial, sans-serif' },
};

// «Окна» — светло-серые
const softCardSx = {
  bgcolor: '#f9f9f9',
  borderRadius: 3,
  border: '1px solid #e2e8f0',
  boxShadow: '0 6px 24px rgba(15,23,42,0.06)',
};

const Contact = () => {
  const [values, setValues] = useState({
    name: '',
    email: '',
    subject: 'Kontaktinė žinutė', // скрытая тема по умолчанию
    message: '',
    consent: false,
  });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ type: null, msg: '' });
  const [loading, setLoading] = useState(false);
  const [cfToken, setCfToken] = useState('');
  const turnstileRef = useRef(null);

  const validate = () => {
    const e = {};
    if (!values.name.trim()) e.name = 'Įveskite vardą';
    if (!values.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))
      e.email = 'Neteisingas el. pašto formatas';
    if (values.message.trim().length < 10)
      e.message = 'Žinutė per trumpa (min. 10 simbolių)';
    if (!values.consent) e.consent = 'Reikalingas sutikimas';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleChange = (field) => (ev) => {
    const v = field === 'consent' ? ev.target.checked : ev.target.value;
    setValues((prev) => ({ ...prev, [field]: v }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    if (!cfToken) {
      setStatus({ type: 'error', msg: 'Vyksta saugumo patikra, palaukite kelias sekundes ir bandykite dar kartą.' });
      return;
    }
    setLoading(true);
    setStatus({ type: null, msg: '' });

    try {
      const { data } = await publicApi.post('/api/contact/', { ...values, cf_token: cfToken });
      setStatus({ type: 'success', msg: data?.detail || 'Žinutė išsiųsta. Ačiū!' });
      setValues({
        name: '',
        email: '',
        subject: 'Kontaktinė žinutė',
        message: '',
        consent: false,
      });
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        (err?.response?.status === 400
          ? 'Klaida formoje'
          : 'Nepavyko išsiųsti. Pabandykite dar kartą.');
      setStatus({ type: 'error', msg });
    } finally {
      setLoading(false);
      setCfToken('');
      turnstileRef.current?.reset();
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        py: { xs: 3, md: 6 },
        backgroundColor: '#ffffff',
        fontFamily: 'Helvetica, Arial, sans-serif',
      }}
    >
      <Container maxWidth="lg">
        <Helmet>
          <title>Mūsų kontaktai - DokSkenas</title>
          <meta
            name="description"
            content="Prireikus pagalbos ar turint pastebėjimų, susisiekite su mumis"
          />
        </Helmet>

        {/* Мобильный заголовок/текст — сверху; на desktop скрыт */}
        <Box sx={{ display: { xs: 'block', md: 'none' }, mb: 2 }}>
          <Typography
            variant="h1"
            sx={{ color: '#0f172a', fontSize: '28px', fontWeight: 700, mb: 1 }}
          >
            Susisiekite su mumis
          </Typography>
          <Typography sx={{ color: '#334155', fontSize: '14px', lineHeight: 1.75 }}>
            Turite klausimų ar pasiūlymų? Mūsų komanda visada pasiruošusi padėti. Atsakysime kuo
            greičiau!
          </Typography>
        </Box>

        <Grid2 container spacing={{ xs: 2.5, md: 6 }} alignItems="stretch">
          {/* Форма — сверху на мобиле; справа на desktop */}
          <Grid2 size={{ xs: 12, md: 7 }} sx={{ order: { xs: 1, md: 2 } }}>
            <Paper elevation={10} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 4, ...softCardSx }}>
              <Box component="form" onSubmit={handleSubmit} noValidate>
                <Stack spacing={3}>
                  <Typography
                    variant="h5"
                    sx={{ fontWeight: 700, color: '#111827', mb: 0.5 }}
                  >
                    Parašykite mums
                  </Typography>

                  <Grid2 container spacing={2}>
                    <Grid2 size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Vardas"
                        fullWidth
                        value={values.name}
                        onChange={handleChange('name')}
                        error={!!errors.name}
                        helperText={errors.name}
                        sx={fieldSx}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <PersonIcon sx={{ color: '#94a3b8' }} />
                            </InputAdornment>
                          ),
                        }}
                      />
                    </Grid2>
                    <Grid2 size={{ xs: 12, sm: 6 }}>
                      <TextField
                        type="email"
                        label="El. paštas"
                        fullWidth
                        value={values.email}
                        onChange={handleChange('email')}
                        error={!!errors.email}
                        helperText={errors.email}
                        sx={fieldSx}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <EmailIcon sx={{ color: '#94a3b8' }} />
                            </InputAdornment>
                          ),
                        }}
                      />
                    </Grid2>
                  </Grid2>

                  <TextField
                    label="Žinutė"
                    fullWidth
                    multiline
                    minRows={6}
                    value={values.message}
                    onChange={handleChange('message')}
                    error={!!errors.message}
                    helperText={errors.message}
                    sx={fieldSx}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment
                          position="start"
                          sx={{ alignSelf: 'flex-start', mt: 1 }}
                        >
                          <ChatIcon sx={{ color: '#94a3b8' }} />
                        </InputAdornment>
                      ),
                    }}
                  />

                  <Box>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={values.consent}
                          onChange={handleChange('consent')}
                          sx={{ color: errors.consent ? 'error.main' : 'primary.main' }}
                        />
                      }
                      label={
                        <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                          Sutinku, kad mano pateikti duomenys būtų naudojami susisiekti.
                        </Typography>
                      }
                    />
                    {errors.consent && (
                      <Typography
                        variant="caption"
                        color="error"
                        display="block"
                        sx={{ ml: 4 }}
                      >
                        {errors.consent}
                      </Typography>
                    )}
                  </Box>

                  <Turnstile
                    ref={turnstileRef}
                    siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
                    options={{ appearance: 'interaction-only' }}
                    onSuccess={setCfToken}
                    onExpire={() => setCfToken('')}
                    onError={() => setCfToken('')}
                  />

                  {status.type && (
                    <Alert
                      severity={status.type}
                      sx={{ borderRadius: 2, '& .MuiAlert-icon': { fontSize: 24 } }}
                    >
                      {status.msg}
                    </Alert>
                  )}

                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    disabled={loading}
                    endIcon={loading ? null : <SendIcon />}
                    sx={{
                      py: 1.5,
                      fontSize: '16px',
                      fontWeight: 700,
                      borderRadius: 2.5,
                      textTransform: 'none',
                      backgroundColor: '#1f2937',
                      '&:hover': {
                        backgroundColor: '#111827',
                        transform: 'translateY(-1px)',
                        boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
                      },
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {loading ? (
                      <CircularProgress size={24} sx={{ color: 'white' }} />
                    ) : (
                      'Siųsti žinutę'
                    )}
                  </Button>
                </Stack>
              </Box>
            </Paper>
          </Grid2>

          {/* Левая колонка — заголовок (desktop) + Atsakymo laikas.
              На мобиле заголовок скрыт, поэтому внизу останется только «Atsakymo laikas». */}
          <Grid2 size={{ xs: 12, md: 5 }} sx={{ order: { xs: 2, md: 1 } }}>
            <Stack spacing={3.5}>
              {/* desktop title/paragraph */}
              <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                <Typography
                  variant="h1"
                  sx={{ color: '#0f172a', fontSize: '44px', fontWeight: 700, mb: 1 }}
                >
                  Susisiekite su mumis
                </Typography>
                <Typography sx={{ color: '#334155', fontSize: '18px', lineHeight: 1.75 }}>
                  Turite klausimų ar pasiūlymų? Mūsų komanda visada pasiruošusi padėti. Atsakysime
                  kuo greičiau!
                </Typography>
              </Box>

              {/* Atsakymo laikas — окажется в самом низу на мобиле */}
              <Card sx={softCardSx}>
                <CardContent>
                  <Stack spacing={2}>
                    <Typography sx={{ color: '#64748b', fontSize: '14px' }}>
                      Atsakymo laikas
                    </Typography>
                    <Stack spacing={1}>
                      {[
                        'Darbo dienomis: kelios valandos',
                        'Savaitgaliais: kaupiam jėgas darbo savaitei 😊',
                      ].map((text, i) => {
                        const [label, rest = ''] = text.split(/:\s*/, 2);
                        return (
                          <Box
                            key={i}
                            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                          >
                            <CheckIcon sx={{ color: '#16a34a', fontSize: 18 }} />
                            <Typography sx={{ color: '#0f172a', fontSize: '14px' }}>
                              {label}:{' '}
                              <Box component="span" sx={{ display: 'inline' }}>
                                {renderItalicWithoutEmoji(rest)}
                              </Box>
                            </Typography>
                          </Box>
                        );
                      })}
                    </Stack>
                    <Divider sx={{ mt: 1 }} />
                  </Stack>
                </CardContent>
              </Card>
            </Stack>
          </Grid2>
        </Grid2>
      </Container>
    </Box>
  );
};

export default Contact;












// import { Helmet } from 'react-helmet';
// import { Container, Typography, Box } from '@mui/material';

// const Contact = () => {
//     return (
//         <Container maxWidth="lg" sx={{ marginTop: '30px' ,marginBottom: '100px', minHeight: '70vh'}}>
//             <Helmet>
//                 <title>Mūsų kontaktai - Atlyginimo Skaičiuoklė</title>
//                 <meta name="description" content="Prireikus pagalbos ar turint pastebėjimų, susisiekite su mumis" />
//             </Helmet>
//             <Typography variant="h1" sx={{ color: 'black', marginBottom: 3, fontSize: { xs: '24px', sm: '30px' }, fontFamily: 'Helvetica', fontWeight: "bold", letterSpacing: 0.05 }}>
//                 Mūsų kontaktai
//             </Typography>
//             <Typography sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
//                 Prireikus pagalbos ar turint pastebėjimų, susisiekite su mumis el. paštu: <Box component="span" sx={{ fontWeight: "bold" }}>mokesciuskaiciuokle (eta) gmail.com</Box>
//             </Typography>
//         </Container>
//     );
// };

// export default Contact;