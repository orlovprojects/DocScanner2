import { Helmet } from 'react-helmet';
import { Container, Typography, Box } from '@mui/material';

const Contact = () => {
    return (
        <Container maxWidth="lg" sx={{ marginTop: '30px' ,marginBottom: '100px', minHeight: '70vh'}}>
            <Helmet>
                <title>Mūsų kontaktai - Atlyginimo Skaičiuoklė</title>
                <meta name="description" content="Prireikus pagalbos ar turint pastebėjimų, susisiekite su mumis" />
            </Helmet>
            <Typography variant="h1" sx={{ color: 'black', marginBottom: 3, fontSize: { xs: '24px', sm: '30px' }, fontFamily: 'Helvetica', fontWeight: "bold", letterSpacing: 0.05 }}>
                Mūsų kontaktai
            </Typography>
            <Typography sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
                Prireikus pagalbos ar turint pastebėjimų, susisiekite su mumis el. paštu: <Box component="span" sx={{ fontWeight: "bold" }}>mokesciuskaiciuokle (eta) gmail.com</Box>
            </Typography>
        </Container>
    );
};

export default Contact;