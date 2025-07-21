import { Helmet } from 'react-helmet';
import { Container, Typography, Box } from '@mui/material';

const Terms = () => {
    return (
        <Container maxWidth="lg" sx={{ marginTop: '30px' ,marginBottom: '100px', minHeight: '70vh'}}>
            <Helmet>
                <title>Naudojimo taisyklės - Atlyginimo Skaičiuoklė</title>
                <meta name="description" content="Sužinokite apie mūsų naudojimo taisykles" />
            </Helmet>
            <Typography variant="h1" sx={{ color: 'black', marginBottom: 3, fontSize: { xs: '24px', sm: '30px' }, fontFamily: 'Helvetica', fontWeight: "bold", letterSpacing: 0.05 }}>
            Naudojimo taisyklės
            </Typography>
            <Typography sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
                Naudodamiesi šia atlyginimo skaičiuokle, prašome atkreipti dėmesį į šias sąlygas ir apribojimus:
            </Typography>
            <Typography component="ul" sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginTop: 3, marginBottom: 3, paddingLeft: 5, fontFamily: 'Helvetica' }}>
                <li style={{ marginBottom: '20px' }}>
                Skaičiuoklė sukurta remiantis 2025 metų Lietuvos mokesčių sistema.
                </li>
                <li style={{ marginBottom: '20px' }}>
                Pateikti skaičiavimai yra informacinio ir edukacinio pobūdžio.
                </li>
                <li style={{ marginBottom: '20px' }}>
                Už skaičiavimų tikslumą neatsakome.
                </li>
                <li style={{ marginBottom: '20px' }}>
                Visi rezultatai privalo būti patikrinti ir patvirtinti kvalifikuotų specialistų.
                </li>
                <li style={{ marginBottom: '20px' }}>
                Skaičiuoklė nėra pritaikyta individualiems atvejams, kuriems gali būti taikomos išimtys.
                </li>
                <li style={{ marginBottom: '20px' }}>
                Rezultatai neturėtų būti naudojami kaip vienintelis pagrindas priimant svarbius finansinius sprendimus.
                </li>
                <li style={{ marginBottom: '20px' }}>
                Mokesčių sistema ir tarifai gali keistis - skaičiuoklė negarantuoja atnaujintų duomenų.
                </li>
            </Typography>
            <Typography sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
                Prieš priimant bet kokius sprendimus, susijusius su mokesčiais ar finansais, rekomenduojame pasikonsultuoti su mokesčių konsultantu, buhalteriu ar kitu kvalifikuotu specialistu.
            </Typography>
        </Container>
    );
};

export default Terms;