import { Container, Typography, Box, List, ListItem, Divider } from "@mui/material";
import { Helmet } from "react-helmet";

const Section = ({ title, children, number }) => (
  <Box sx={{ mb: 4 }}>
    <Typography
      variant="h2"
      sx={{
        fontFamily: "Helvetica",
        fontWeight: 700,
        fontSize: "22px",
        color: "#1b1b1b",
        mb: 1,
        display: "flex",
        alignItems: "center",
      }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          background: "#f5cf54",
          color: "#1b1b1b",
          borderRadius: "50%",
          fontSize: "19px",
          fontWeight: 700,
          fontFamily: "Helvetica",
          mr: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {number}
      </Box>
      {title}
    </Typography>
    {children}
  </Box>
);

const Privacy = () => (
  <Container maxWidth="md" sx={{ marginTop: 6, marginBottom: 12, minHeight: '70vh' }}>
    <Helmet>
      <title>Privatumo politika</title>
      <meta name="description" content="Sužinokite apie mūsų privatumo politiką" />
    </Helmet>
    <Typography
      variant="h1"
      sx={{
        fontFamily: "Helvetica",
        fontWeight: 700,
        fontSize: { xs: "28px", sm: "34px" },
        mb: 2.5,
        color: "#1b1b1b",
        letterSpacing: 0.05,
      }}
    >
      Privatumo politika
    </Typography>
    <Typography sx={{ fontFamily: "Helvetica", fontSize: 16, color: "#777", mb: 4 }}>
      Paskutinį kartą atnaujinta: <b>2025-08-08</b>
    </Typography>

    <Section title="Kas mes esame" number="1">
      <Typography sx={{ fontFamily: "Helvetica", fontSize: 17, color: "#333", mb: 1.5 }}>
        <b>DokSkenas</b> – tai debesijos sprendimas, leidžiantis automatizuotai skaitmenizuoti sąskaitas-faktūras ir kitus buhalterinius dokumentus, naudojant dirbtinį intelektą.<br />
        Jei turite klausimų dėl privatumo, kreipkitės el. paštu: <b>mokesciuskaiciuokle@gmail.com</b>
      </Typography>
    </Section>

    <Section title="Kokius duomenis renkame?" number="2">
      <List sx={{ pl: 2 }}>
        <ListItem sx={{ display: "list-item", fontFamily: "Helvetica", fontSize: "16px", color: "#222" }}>
          <b>Registracijos ir paskyros duomenys:</b>
          <ul style={{ marginTop: 3, marginBottom: 3, marginLeft: 16 }}>
            <li>Vardas (nebūtina)</li>
            <li>El. pašto adresas</li>
            <li>Slaptažodis (šifruojamas)</li>
            <li>Įmonės rekvizitus</li>
          </ul>
        </ListItem>
        <ListItem sx={{ display: "list-item", fontFamily: "Helvetica", fontSize: "16px", color: "#222" }}>
          <b>Dokumentų duomenys:</b>
          <ul style={{ marginTop: 3, marginBottom: 3, marginLeft: 16 }}>
            <li>Įkeliami dokumentai (PDF, JPG, PNG ir kt.)</li>
            <li>Dokumentuose esanti informacija</li>
          </ul>
        </ListItem>
        <ListItem sx={{ display: "list-item", fontFamily: "Helvetica", fontSize: "16px", color: "#222" }}>
          <b>Naudojimo duomenys:</b>
          <ul style={{ marginTop: 3, marginBottom: 3, marginLeft: 16 }}>
            <li>IP adresas, naršyklės informacija</li>
            <li>Veiklos žurnalai (logai), naudojimosi funkcijomis istorija</li>
          </ul>
        </ListItem>
        <ListItem sx={{ display: "list-item", fontFamily: "Helvetica", fontSize: "16px", color: "#222" }}>
          <b>Mokėjimų duomenys:</b>
          <ul style={{ marginTop: 3, marginBottom: 3, marginLeft: 16 }}>
            <li>Pirkimų istorija (per Stripe ar kitą apdorotoją)</li>
          </ul>
        </ListItem>
      </List>
    </Section>

    <Section title="Kaip ir kodėl naudojame duomenis?" number="3">
      <List sx={{ pl: 2 }}>
        <ListItem sx={{ display: "list-item", fontFamily: "Helvetica", fontSize: "16px" }}>
          Skaitmenizavimo paslaugų teikimui ir sąskaitų atpažinimui
        </ListItem>
        <ListItem sx={{ display: "list-item", fontFamily: "Helvetica", fontSize: "16px" }}>
          Jūsų prašymų administravimui (pvz., pagalba ar informavimas)
        </ListItem>
        <ListItem sx={{ display: "list-item", fontFamily: "Helvetica", fontSize: "16px" }}>
          Paslaugos kokybės ir saugumo užtikrinimui
        </ListItem>
        <ListItem sx={{ display: "list-item", fontFamily: "Helvetica", fontSize: "16px" }}>
          Įkeltus dokumentus siunčiame mūsų patikimiems partneriams – <b>Google</b> ir <b>OpenAI</b> – tik tam, kad apdorotume ir ištrauktume duomenis pagal jūsų užklausą. Jūsų dokumentai yra naudojami tik skaitmenizavimo paslaugoms teikti.
        </ListItem>
      </List>
    </Section>

    <Section title="Duomenų saugumas" number="4">
      <List sx={{ pl: 2 }}>
        <ListItem sx={{ display: "list-item", fontFamily: "Helvetica", fontSize: "16px" }}>
          Naudojame šifravimą tiek perdavimo, tiek saugojimo metu (HTTPS, AES256 ir kt.)
        </ListItem>
        <ListItem sx={{ display: "list-item", fontFamily: "Helvetica", fontSize: "16px" }}>
          Duomenys laikomi ES teritorijoje esančiuose serveriuose
        </ListItem>
        <ListItem sx={{ display: "list-item", fontFamily: "Helvetica", fontSize: "16px" }}>
          Prieigą prie duomenų turi tik įgalioti darbuotojai pagal būtinybę
        </ListItem>
        <ListItem sx={{ display: "list-item", fontFamily: "Helvetica", fontSize: "16px" }}>
          Periodiškai atliekami saugumo testai
        </ListItem>
      </List>
    </Section>

    <Section title="Duomenų perdavimas tretiesiems asmenims" number="5">
      <List sx={{ pl: 2 }}>
        <ListItem sx={{ display: "list-item", fontFamily: "Helvetica", fontSize: "16px" }}>
          Jūsų dokumentų duomenys perduodami tik mūsų partneriams (<b>Google</b>, <b>OpenAI</b>) dokumentų atpažinimo tikslu.
        </ListItem>
        <ListItem sx={{ display: "list-item", fontFamily: "Helvetica", fontSize: "16px" }}>
          Jūsų kontaktinė informacija, el. paštas ar mokėjimų informacija nėra perduodama reklamos ar kitiems partneriams.
        </ListItem>
        <ListItem sx={{ display: "list-item", fontFamily: "Helvetica", fontSize: "16px" }}>
          Mokėjimų duomenys apdorojami per <b>Stripe</b> (žr. jų privatumo politiką).
        </ListItem>
      </List>
    </Section>

    <Section title="Duomenų saugojimo laikotarpiai" number="6">
      <List sx={{ pl: 2 }}>
        <ListItem sx={{ display: "list-item", fontFamily: "Helvetica", fontSize: "16px" }}>
          Dokumentų failai saugomi archyve iki 18 mėnesių nuo skaitmenizavimo datos, nebent juos ištrinate anksčiau.
        </ListItem>
        <ListItem sx={{ display: "list-item", fontFamily: "Helvetica", fontSize: "16px" }}>
          Kiti duomenys (el. paštas, paskyros informacija) saugomi tol, kol naudojatės paslauga arba pagal teisės aktus.
        </ListItem>
      </List>
    </Section>

    <Section title="Vartotojo teisės" number="7">
      <List sx={{ pl: 2 }}>
        <ListItem sx={{ display: "list-item", fontFamily: "Helvetica", fontSize: "16px" }}>
          Susipažinti su savo duomenimis
        </ListItem>
        <ListItem sx={{ display: "list-item", fontFamily: "Helvetica", fontSize: "16px" }}>
          Ištaisyti netikslius duomenis
        </ListItem>
        <ListItem sx={{ display: "list-item", fontFamily: "Helvetica", fontSize: "16px" }}>
          Reikalauti ištrinti arba apriboti savo duomenų naudojimą
        </ListItem>
        <ListItem sx={{ display: "list-item", fontFamily: "Helvetica", fontSize: "16px" }}>
          Pateikti skundą Valstybinei duomenų apsaugos inspekcijai (<a href="https://www.ada.lt/" target="_blank" rel="noopener noreferrer">www.ada.lt</a>)
        </ListItem>
      </List>
      <Typography sx={{ fontFamily: "Helvetica", fontSize: "16px", color: "#333", mt: 2 }}>
        Kreiptis galite el. paštu: <b>mokesciuskaiciuokle@gmail.com</b>
      </Typography>
    </Section>

    <Section title="Slapukai (cookies)" number="8">
      <Typography sx={{ fontFamily: "Helvetica", fontSize: 16, color: "#333" }}>
        Naudojame techninius, analitinius ir funkcionalius slapukus, kad užtikrintume paslaugų veikimą ir statistiką.<br />
        Slapukus galite valdyti per savo naršyklės nustatymus.
      </Typography>
    </Section>

    <Section title="Mokėjimai ir trečiųjų šalių paslaugos" number="9">
      <Typography sx={{ fontFamily: "Helvetica", fontSize: 16, color: "#333" }}>
        Apmokėjimai vykdomi per Stripe. Stripe gauna tik tuos duomenis, kurie būtini atsiskaitymui – DokSkenas nesaugo jūsų pilnos mokėjimo kortelės informacijos.
      </Typography>
    </Section>

    <Section title="Privatumo politikos keitimas" number="10">
      <Typography sx={{ fontFamily: "Helvetica", fontSize: 16, color: "#333" }}>
        Apie esminius pakeitimus informuosime el. paštu arba per platformą.<br />
        Politika gali būti atnaujinama pagal teisės aktus ar paslaugos pokyčius.
      </Typography>
    </Section>

    <Section title="Vaikų privatumas" number="11">
      <Typography sx={{ fontFamily: "Helvetica", fontSize: 16, color: "#333" }}>
        Paslauga skirta tik verslo klientams ir pilnamečiams asmenims.
      </Typography>
    </Section>

    <Divider sx={{ my: 5 }} />

    <Box sx={{ mt: 2 }}>
      <Typography sx={{ fontFamily: "Helvetica", fontSize: 16, color: "#1b1b1b" }}>
        <b>Turite klausimų dėl privatumo?</b><br />
        Rašykite mums: <b>mokesciuskaiciuokle@gmail.com</b>
      </Typography>
    </Box>
    <Typography sx={{ fontFamily: "Helvetica", fontSize: 14, color: "#999", mt: 5 }}>
      Papildoma pastaba: Šis tekstas nėra teisinė konsultacija, bet atitinka GDPR ir praktikas, taikomas SaaS/fintech/AI produktams Lietuvoje.
    </Typography>
  </Container>
);

export default Privacy;

