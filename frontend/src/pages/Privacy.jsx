import { Helmet } from 'react-helmet';
import { Container, Typography, Box } from '@mui/material';

const Privacy = () => {
    return (
        <Container maxWidth="lg" sx={{ marginTop: '30px' ,marginBottom: '100px', minHeight: '70vh'}}>
            <Helmet>
                <title>Privatumo politika - Atlyginimo Skaičiuoklė</title>
                <meta name="description" content="Sužinokite apie mūsų privatumo politiką" />
            </Helmet>
            <Typography variant="h1" sx={{ color: 'black', marginBottom: 3, fontSize: { xs: '24px', sm: '30px' }, fontFamily: 'Helvetica', fontWeight: "bold", letterSpacing: 0.05 }}>
                Privatumo politika
            </Typography>
            <Typography sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
                Jūsų privatumas mums yra svarbus. Ši atlyginimo skaičiuoklė nerenka, nesaugo ir neperduoda jokios asmeninės informacijos. Visi duomenys, kuriuos įvedate, naudojami tik lokaliai jūsų įrenginyje ir nėra perduodami į serverius ar trečiosioms šalims.
            </Typography>
            <Typography sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
                Siekdami gerinti naudotojų patirtį ir suprasti, kaip lankytojai naudojasi svetaine, mes naudojame <Box component="span" sx={{ fontWeight: "bold" }}>Google Analytics</Box>. Tai įrankis, kuris renka anoniminius duomenis, pavyzdžiui, apsilankymų skaičių, naudotojų įrenginių tipus ir naršymo tendencijas. Ši informacija padeda mums tobulinti svetainės funkcionalumą ir turinį.
            </Typography>
            <Typography sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
                <Box component="span" sx={{ fontWeight: "bold" }}>Google Analytics</Box> naudoja slapukus (cookies), kurie leidžia rinkti anoniminius duomenis apie lankytojų veiklą. Ši informacija nėra susiejama su jokiais asmeniniais duomenimis ir nėra naudojama tapatybei nustatyti. Jei norite išvengti duomenų rinkimo per <Box component="span" sx={{ fontWeight: "bold" }}>Google Analytics</Box>, galite išjungti slapukus savo naršyklės nustatymuose arba naudoti <Box component="span" sx={{ fontWeight: "bold" }}>Google Analytics opt-out</Box> plėtinį.
            </Typography>
            <Typography sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
                Naudodamiesi šia skaičiuokle, sutinkate su slapukų naudojimu statistinei analizei. Jei turite klausimų apie privatumo politiką, susisiekite su mumis.
            </Typography>
        </Container>
    );
};

export default Privacy;