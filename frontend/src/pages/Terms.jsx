import { Container, Typography, Box, List, ListItem } from "@mui/material";
import { Helmet } from "react-helmet";

const Terms = () => (
  <Container maxWidth="md" sx={{ marginTop: 6, marginBottom: 12, minHeight: '60vh' }}>
    <Helmet>
      <title>Naudojimo taisyklės - DokSkenas ir Atlyginimo skaičiuoklė</title>
      <meta name="description" content="DokSkenas ir Atlyginimo skaičiuoklės naudojimo sąlygos ir apribojimai" />
    </Helmet>

    {/* DokSkenas taisyklės */}
    <Typography
      variant="h1"
      sx={{
        fontFamily: "Helvetica",
        fontWeight: 700,
        fontSize: { xs: "26px", sm: "32px" },
        mb: 2,
        color: "#1b1b1b",
        letterSpacing: 0.05,
      }}
    >
      DokSkenas naudojimo taisyklės
    </Typography>
    <Typography sx={{ fontFamily: "Helvetica", fontSize: 16, color: "#777", mb: 4 }}>
        Paskutinį kartą atnaujinta: <b>2025-08-08</b>
    </Typography>
    <List sx={{ pl: 2, fontFamily: "Helvetica", mb: 5 }}>
      <ListItem sx={{ display: "list-item", fontSize: 17, color: "#333", mb: 2 }}>
        Paslauga skirta tik įmonėms ir pilnamečiams asmenims.
      </ListItem>
      <ListItem sx={{ display: "list-item", fontSize: 17, color: "#333", mb: 2 }}>
        DokSkenas teikia skaitmenizavimo paslaugą pagal pateiktus dokumentus. Už pateiktų duomenų tikslumą atsako pats naudotojas.
      </ListItem>
      <ListItem sx={{ display: "list-item", fontSize: 17, color: "#333", mb: 2 }}>
        Dokumentai, kuriuos įkeliate, turi neprieštarauti teisės aktams ir būti susiję su teisėta veikla.
      </ListItem>
      <ListItem sx={{ display: "list-item", fontSize: 17, color: "#333", mb: 2 }}>
        DokSkenas negarantuoja 100% atpažinimo tikslumo – skaitmeninimo rezultatus visuomet rekomenduojama peržiūrėti ir patikrinti prieš juos naudojant.
      </ListItem>
      <ListItem sx={{ display: "list-item", fontSize: 17, color: "#333", mb: 2 }}>
        Naudotojas įsipareigoja nesidalinti savo paskyros duomenimis su trečiaisiais asmenimis.
      </ListItem>
      <ListItem sx={{ display: "list-item", fontSize: 17, color: "#333", mb: 2 }}>
        Paslauga neteikiama, jei vartotojas pažeidžia taisykles, bando apeiti sistemą ar naudotis ja neteisėtais tikslais.
      </ListItem>
      <ListItem sx={{ display: "list-item", fontSize: 17, color: "#333", mb: 2 }}>
        Dokumentų failai po skaitmenizavimo saugomi iki 18 mėnesių, jei nepašalinate jų anksčiau.
      </ListItem>
      <ListItem sx={{ display: "list-item", fontSize: 17, color: "#333", mb: 2 }}>
        Nepanaudoti kreditai (pvz., įsigyti, bet nepanaudoti dokumentų skaitmenizavimui) negrąžinami ir nekompensuojami.
      </ListItem>
      <ListItem sx={{ display: "list-item", fontSize: 17, color: "#333", mb: 2 }}>
        Kreditai, įsigyti per klaidą (pvz., netyčia pasirinkus per didelį kiekį ar paspaudus apmokėjimą), taip pat negrąžinami ir nekompensuojami.
      </ListItem>
      <ListItem sx={{ display: "list-item", fontSize: 17, color: "#333", mb: 2 }}>
        Visos kainos ir paslaugų sąlygos gali būti keičiamos, apie esminius pakeitimus informuosime per platformą ar el. paštu.
      </ListItem>
      <ListItem sx={{ display: "list-item", fontSize: 17, color: "#333", mb: 2 }}>
        DokSkenas neprisiima atsakomybės už naudotojo patirtus nuostolius ar žalą, jei paslauga buvo naudota nesilaikant šių taisyklių.
      </ListItem>
      <ListItem sx={{ display: "list-item", fontSize: 17, color: "#333", mb: 2 }}>
        Prieš naudodamiesi paslauga, perskaitykite ir susipažinkite su privatumo politika.
      </ListItem>
    </List>

    {/* Atlyginimo skaičiuoklės taisyklės */}
    <Typography
      variant="h2"
      sx={{
        fontFamily: "Helvetica",
        fontWeight: 700,
        fontSize: { xs: "22px", sm: "28px" },
        mb: 2,
        color: "#1b1b1b",
        letterSpacing: 0.03,
        mt: 7,
      }}
    >
      Atlyginimo skaičiuoklės naudojimo taisyklės
    </Typography>
    <Typography
      sx={{
        fontFamily: "Helvetica",
        fontSize: 18,
        color: "#222",
        mb: 2,
        mt: 1,
      }}
    >
      Naudodamiesi šia atlyginimo skaičiuokle, prašome atkreipti dėmesį į šias sąlygas ir apribojimus:
    </Typography>
    <List sx={{ pl: 2, fontFamily: "Helvetica" }}>
      <ListItem sx={{ display: "list-item", fontSize: 17, color: "#333", mb: 2 }}>
        Skaičiuoklė sukurta remiantis 2025 metų Lietuvos mokesčių sistema.
      </ListItem>
      <ListItem sx={{ display: "list-item", fontSize: 17, color: "#333", mb: 2 }}>
        Pateikti skaičiavimai yra informacinio ir edukacinio pobūdžio.
      </ListItem>
      <ListItem sx={{ display: "list-item", fontSize: 17, color: "#333", mb: 2 }}>
        Už skaičiavimų tikslumą neatsakome.
      </ListItem>
      <ListItem sx={{ display: "list-item", fontSize: 17, color: "#333", mb: 2 }}>
        Visi rezultatai privalo būti patikrinti ir patvirtinti kvalifikuotų specialistų.
      </ListItem>
      <ListItem sx={{ display: "list-item", fontSize: 17, color: "#333", mb: 2 }}>
        Skaičiuoklė nėra pritaikyta individualiems atvejams, kuriems gali būti taikomos išimtys.
      </ListItem>
      <ListItem sx={{ display: "list-item", fontSize: 17, color: "#333", mb: 2 }}>
        Rezultatai neturėtų būti naudojami kaip vienintelis pagrindas priimant svarbius finansinius sprendimus.
      </ListItem>
      <ListItem sx={{ display: "list-item", fontSize: 17, color: "#333", mb: 2 }}>
        Mokesčių sistema ir tarifai gali keistis - skaičiuoklė negarantuoja atnaujintų duomenų.
      </ListItem>
      <ListItem sx={{ display: "list-item", fontSize: 17, color: "#333", mb: 2 }}>
        Prieš priimant bet kokius sprendimus, susijusius su mokesčiais ar finansais, rekomenduojame pasikonsultuoti su mokesčių konsultantu, buhalteriu ar kitu kvalifikuotu specialistu.
      </ListItem>
    </List>
  </Container>
);

export default Terms;