import { useState } from "react";
import { Helmet } from "react-helmet";
import AdSection from "../page_elements/AdSection";
import {
  Table, TableBody, TableCell, TableContainer, TableRow, Grid2, Container,
  FormControl, FormLabel, TextField, Select, MenuItem, Typography,
  Box, Paper, Dialog, DialogContent
} from "@mui/material";

const formatEuro = (v) => (isFinite(v) ? Number(v).toFixed(2) : "0.00");
const clampNonNegative = (val) => (val < 0 ? 0 : val);

const PvmSkaiciuokle = () => {
  // --- Blokas 1 (iš kainos be PVM -> kaina su PVM) ---
  const [rate1, setRate1] = useState(21);
  const [withoutVat, setWithoutVat] = useState("");

  // --- Blokas 2 (iš kainos su PVM -> kaina be PVM) ---
  const [rate2, setRate2] = useState(21);
  const [withVat, setWithVat] = useState("");

  const [videoOpen, setVideoOpen] = useState(false);

  // --- Calculations ---
  const calcWithVat = () => {
    if (withoutVat === "" || isNaN(Number(withoutVat))) return null;
    const base = clampNonNegative(Number(withoutVat));
    const vat = base * (rate1 / 100);
    const total = base + vat;
    return { vat, total };
  };

  const calcWithoutVat = () => {
    if (withVat === "" || isNaN(Number(withVat))) return null;
    const total = clampNonNegative(Number(withVat));
    const base = total / (1 + rate2 / 100);
    const vat = total - base;
    return { vat, base };
  };

  const r1 = calcWithVat();
  const r2 = calcWithoutVat();

  return (
    <Container maxWidth="lg" sx={{ marginBottom: "100px" }}>
      <Helmet>
        <title>Tiksliausia PVM skaičiuoklė 2026 – DokSkenas</title>
        <meta
          name="description"
          content="Pasiskaičiuokite PVM dydį bei kainas su/be PVM, pasirenkant norimą PVM %"
        />
      </Helmet>

      <Paper
        sx={{
          p: 3,
          mt: 3,
          backgroundColor: "#212121",
          borderRadius: 3,
          minHeight: "600px",
        }}
      >
        <Typography
          variant="h1"
          sx={{
            color: "#d2cbc6",
            mb: 3,
            fontSize: { xs: "24px", sm: "30px" },
            fontFamily: "Helvetica",
            fontWeight: "bold",
            letterSpacing: 0.05,
          }}
        >
          PVM skaičiuoklė 2026
        </Typography>

        {/* ====== BLOKAS 1 ====== */}

        <Grid2
          container
          sx={{
            flexWrap: { md: "nowrap" },
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            justifyContent: "space-between",
            alignItems: "start",
            gap: 2,
          }}
        >
          {/* Form panel */}
          <Grid2 sx={{ maxWidth: { md: "50%" }, width: "100%" }}>
            <Box sx={{ backgroundColor: "#1b1b1b", borderRadius: 2, p: 2 }}>
              <Typography
                variant="h2"
                sx={{
                  color: "#d2cbc6",
                  mb: 3,
                  fontSize: { xs: "18px", sm: "24px" },
                  fontFamily: "Helvetica",
                  fontWeight: "bold",
                  letterSpacing: 0.05,
                }}
              >
                PVM įskaičiavimas
              </Typography>
              <Typography
                sx={{
                  color: "#d2cbc6",
                  mb: 2,
                  fontFamily: "Helvetica",
                  fontSize: { xs: 16, sm: 18 },
                }}
              >
                Apskaičiuok kainą su PVM bei PVM dydį iš kainos be PVM
              </Typography>
              <FormControl fullWidth margin="normal">
                <FormLabel sx={{ color: "#d2cbc6", mb: 1 }}>
                  PVM dydis (%)
                </FormLabel>
                <Select
                  value={rate1}
                  onChange={(e) => setRate1(Number(e.target.value))}
                  sx={{
                    backgroundColor: "#FAFAFA",
                    borderRadius: 1,
                    ".MuiOutlinedInput-notchedOutline": { borderColor: "#555" },
                    "&:hover .MuiOutlinedInput-notchedOutline": {
                      borderColor: "#888",
                    },
                    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                      borderColor: "#d2cbc6",
                    },
                  }}
                >
                  <MenuItem value={21}>21%</MenuItem>
                  <MenuItem value={9}>9%</MenuItem>
                  <MenuItem value={5}>5%</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth margin="normal">
                <FormLabel sx={{ color: "#d2cbc6", mb: 1 }}>
                  Kaina be PVM (€)
                </FormLabel>
                <TextField
                  type="number"
                  value={withoutVat}
                  onChange={(e) => setWithoutVat(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  variant="outlined"
                  sx={{
                    backgroundColor: "#FAFAFA",
                    borderRadius: 1,
                    ".MuiOutlinedInput-notchedOutline": { borderColor: "#555" },
                    "&:hover .MuiOutlinedInput-notchedOutline": {
                      borderColor: "#888",
                    },
                    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                      borderColor: "#d2cbc6",
                    },
                  }}
                />
              </FormControl>
            </Box>
          </Grid2>

          {/* Results panel */}
          <Grid2 sx={{ width: { md: "40%" }, minWidth: { md: "40%" } }}>
            <Typography
              sx={{
                color: "#d2cbc6",
                mt: 2,
                mb: 2,
                fontSize: { xs: "20px", sm: "26px" },
                fontFamily: "Helvetica",
                fontWeight: "bold",
              }}
            >
              Rezultatas
            </Typography>
            <TableContainer component={Paper} sx={{ mt: 2 }}>
              <Table>
                <TableBody>
                  <TableRow sx={{ backgroundColor: "#d2cbc6" }}>
                    <TableCell sx={{ fontSize: "16px", height: "50px" }}>
                      PVM suma (€)
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: "16px" }}>
                      {r1 ? formatEuro(r1.vat) : "0.00"}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: "#FAFAFA" }}>
                    <TableCell>Kaina su PVM (€)</TableCell>
                    <TableCell align="right">
                      {r1 ? formatEuro(r1.total) : "0.00"}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid2>
        </Grid2>

        {/* === AD: between calculators (one shared block) === */}
        <Box sx={{ mt: 4, mb: 5 }}>
          <AdSection
            onOpenVideo={() => setVideoOpen(true)}
            videoUrl="https://www.youtube.com/embed/ByViuilYxZA"
            videoTitle="DokSkenas demo"
            onLearnMoreClick={() => {}}
          />
        </Box>

        {/* ====== BLOKAS 2 ====== */}
        <Grid2
          container
          sx={{
            flexWrap: { md: "nowrap" },
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            justifyContent: "space-between",
            alignItems: "start",
            gap: 2,
          }}
        >
          {/* Form panel */}
          <Grid2 sx={{ maxWidth: { md: "50%" }, width: "100%" }}>
            <Box sx={{ backgroundColor: "#1b1b1b", borderRadius: 2, p: 2 }}>
              <Typography
                variant="h2"
                sx={{
                  color: "#d2cbc6",
                  mb: 3,
                  fontSize: { xs: "18px", sm: "24px" },
                  fontFamily: "Helvetica",
                  fontWeight: "bold",
                  letterSpacing: 0.05,
                }}
              >
                PVM išskaičiavimas
              </Typography>
              <Typography
                sx={{
                  color: "#d2cbc6",
                  mb: 2,
                  fontFamily: "Helvetica",
                  fontSize: { xs: 16, sm: 18 },
                }}
              >
                Apskaičiuok kainą be PVM bei PVM dydį iš kainos su PVM
              </Typography>

              <FormControl fullWidth margin="normal">
                <FormLabel sx={{ color: "#d2cbc6", mb: 1 }}>
                  PVM dydis (%)
                </FormLabel>
                <Select
                  value={rate2}
                  onChange={(e) => setRate2(Number(e.target.value))}
                  sx={{
                    backgroundColor: "#FAFAFA",
                    borderRadius: 1,
                    ".MuiOutlinedInput-notchedOutline": { borderColor: "#555" },
                    "&:hover .MuiOutlinedInput-notchedOutline": {
                      borderColor: "#888",
                    },
                    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                      borderColor: "#d2cbc6",
                    },
                  }}
                >
                  <MenuItem value={21}>21%</MenuItem>
                  <MenuItem value={9}>9%</MenuItem>
                  <MenuItem value={5}>5%</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth margin="normal">
                <FormLabel sx={{ color: "#d2cbc6", mb: 1 }}>
                  Kaina su PVM (€)
                </FormLabel>
                <TextField
                  type="number"
                  value={withVat}
                  onChange={(e) => setWithVat(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  variant="outlined"
                  sx={{
                    backgroundColor: "#FAFAFA",
                    borderRadius: 1,
                    ".MuiOutlinedInput-notchedOutline": { borderColor: "#555" },
                    "&:hover .MuiOutlinedInput-notchedOutline": {
                      borderColor: "#888",
                    },
                    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                      borderColor: "#d2cbc6",
                    },
                  }}
                />
              </FormControl>
            </Box>
          </Grid2>

          {/* Results panel */}
          <Grid2 sx={{ width: { md: "40%" }, minWidth: { md: "40%" } }}>
            <Typography
              sx={{
                color: "#d2cbc6",
                mt: 2,
                mb: 2,
                fontSize: { xs: "20px", sm: "26px" },
                fontFamily: "Helvetica",
                fontWeight: "bold",
              }}
            >
              Rezultatas
            </Typography>
            <TableContainer component={Paper} sx={{ mt: 2 }}>
              <Table>
                <TableBody>
                  <TableRow sx={{ backgroundColor: "#d2cbc6" }}>
                    <TableCell sx={{ fontSize: "16px", height: "50px" }}>
                      PVM suma (€)
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: "16px" }}>
                      {r2 ? formatEuro(r2.vat) : "0.00"}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: "#FAFAFA" }}>
                    <TableCell>Kaina be PVM (€)</TableCell>
                    <TableCell align="right">
                      {r2 ? formatEuro(r2.base) : "0.00"}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid2>
        </Grid2>
      </Paper>

      {/* Info */}
      <Container maxWidth="md" sx={{ mt: 8 }}>
        <Typography
          sx={{
            lineHeight: 1.5,
            fontSize: 14,
            letterSpacing: "0.1px",
            mb: 3,
            fontFamily: "Helvetica",
            fontStyle: "italic",
          }}
        >
          Ši skaičiuoklė leidžia greitai apskaičiuoti PVM sumą ir kainą su / be
          PVM pagal pasirinktą tarifą.
        </Typography>
      </Container>

      {/* Video dialog */}
      <Dialog
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogContent sx={{ p: 0 }}>
          <Box
            component="iframe"
            src="https://www.youtube.com/embed/ByViuilYxZA"
            title="Demo Video"
            width="100%"
            height="600px"
            sx={{ border: "none" }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </DialogContent>
      </Dialog>
      <Paper
        component="section"
        sx={{
          mt: 10,
          p: { xs: 3, sm: 4 },
          bgcolor: "#FAFAFA",
          color: "#111",
          borderRadius: 2,
          lineHeight: 1.7,
          fontFamily: "Helvetica",
        }}
      >
        <Typography variant="h2" sx={{ fontSize: { xs: 22, sm: 28 }, fontWeight: "bold", mb: 1 }}>
          Kas yra PVM?
        </Typography>
        <Box component="p" sx={{ m: 0, mb: 2 }}>
          PVM (pridėtinės vertės mokestis) – tai mokestis, pridedamas prie prekių ar paslaugų vertės. 
          Vartotojas sumoka kainą su PVM, o verslas surinktą mokestį perveda valstybei. Paprastai – tai 
          „antkainis“, kurį matome beveik visose sąskaitose.
        </Box>

        <Typography variant="h3" sx={{ fontSize: { xs: 20, sm: 24 }, fontWeight: "bold", mt: 6, mb: 1 }}>
          Kada PVM buvo įvestas Lietuvoje?
        </Typography>
        <Box component="p" sx={{ m: 0, mb: 2 }}>
          Lietuvoje PVM startavo <strong>1994 m. gegužės 1 d.</strong> – bazinis tarifas buvo <strong>18 %</strong>, 
          skaičiuojamas nuo beveik visų prekių ir paslaugų, išskyrus tuo metu neapmokestintas sritis 
          (medicinos paslaugas ir vaistus, švietimą, viešąjį transportą, pašto, draudimo ir bankų, 
          laidojimo paslaugas, spaudą, privatizuojamą valstybės turtą, žemės nuomą). Vėliau šios 
          išimtys buvo panaikintos ir šios prekės bei paslaugos tapo apmokestinamos PVM.
        </Box>

        <Typography variant="h3" sx={{ fontSize: { xs: 20, sm: 24 }, fontWeight: "bold", mt: 6, mb: 1 }}>
          Kaip keitėsi PVM tarifai Lietuvoje?
        </Typography>
        <ul style={{ paddingLeft: 22, margin: 0 }}>
          <li><strong>1994-05-01</strong> – įvestas bazinis <strong>18 %</strong> PVM</li>
          <li><strong>2009-01-01</strong> – padidintas iki <strong>19 %</strong> (reaguojant į finansų krizę)</li>
          <li><strong>2009-09-01</strong> – bazinis tarifas pakeltas iki <strong>21 %</strong> ir toks taikomas iki dabar</li>
          <li>Be to, taikomi lengvatiniai tarifai – <strong>9 %</strong> ir <strong>5 %</strong> tam tikroms prekėms/paslaugoms</li>
        </ul>

        <Typography variant="h3" sx={{ fontSize: { xs: 20, sm: 24 }, fontWeight: "bold", mt: 6, mb: 1 }}>
          Standartiniai PVM tarifai ES šalyse (2026)
        </Typography>
        <Box component="p" sx={{ m: 0, mb: 2 }}>
          Štai pagrindiniai, daugumai prekių ir paslaugų taikomi tarifai. Lengvatiniai tarifai taip pat
          egzistuoja, bet skiriasi pagal kategorijas ir šalis.
        </Box>

        {/* Šviesi lentelė su tamsiu tekstu */}
        <TableContainer component={Paper} sx={{ mt: 2, borderRadius: 2, overflow: "hidden", bgcolor: "#FFF" }}>
          <Table>
            <thead>
              <TableRow sx={{ bgcolor: "#F2F2F2" }}>
                <TableCell sx={{ fontWeight: "bold" }}>Šalis</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>Standartinis PVM tarifas</TableCell>
              </TableRow>
            </thead>
            <TableBody>
              {[
                ["Austrija", "20 %"],
                ["Belgija", "21 %"],
                ["Bulgarija", "20 %"],
                ["Kroatija", "25 %"],
                ["Kipras", "19 %"],
                ["Čekija", "21 %"],
                ["Danija", "25 %"],
                ["Estija", "24 %"],
                ["Suomija", "25,5 %"],
                ["Prancūzija", "20 %"],
                ["Vokietija", "19 %"],
                ["Graikija", "24 %"],
                ["Vengrija", "27 %"],
                ["Airija", "23 %"],
                ["Italija", "22 %"],
                ["Latvija", "21 %"],
                ["Lietuva", "21 %"],
                ["Liuksemburgas", "17 %"],
                ["Malta", "18 %"],
                ["Nyderlandai", "21 %"],
                ["Lenkija", "23 %"],
                ["Portugalija", "23 %"],
                ["Rumunija", "19 %"],
                ["Slovakija", "23 %"],
                ["Slovėnija", "22 %"],
                ["Ispanija", "21 %"],
              ].map(([country, rate], idx) => (
                <TableRow key={idx}>
                  <TableCell>{country}</TableCell>
                  <TableCell>{rate}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Box component="p" sx={{ m: 0, mt: 3 }}>
          ES kontekste skirtumai gana ryškūs – nuo <strong>17 %</strong> Liuksemburge iki <strong>27 %</strong> Vengrijoje. 
          Lietuva su <strong>21 %</strong> yra netoli ES vidurkio.
        </Box>
      </Paper>

      {/* DokSkenas section */}
      <Container maxWidth="md" sx={{ mt: 8 }}>
        <Typography
          variant="h2"
          sx={{
            fontSize: { xs: '20px', sm: '26px' },
            fontFamily: 'Helvetica',
            fontWeight: 'bold',
            color: '#000',
            mb: 2,
          }}
        >
          Vis dar vedate apskaitą kaip akmens amžiuje?
        </Typography>

        <Typography sx={{ fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 2, lineHeight: 1.7 }}>
          Jei kasdien apdorojate daug sąskaitų ir viską vedate ranka,
          <b> DokSkenas</b> tai padarys automatiškai.
        </Typography>

        <Typography sx={{ fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 2, lineHeight: 1.7 }}>
          Sistema nuskaito dokumentą, atpažįsta PVM tarifus ir sumas, patikrina PVM kodų galiojimą, priskiria klasifikatorius iš jūsų apskaitos programos
          ir paruošia duomenų failą, paruoštą importuoti į jūsų apskaitos programą.
        </Typography>

        <Typography sx={{ fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 3, lineHeight: 1.7 }}>
          Vidutiniškai sutaupoma po keturias minutes vienam dokumentui.
        </Typography>

        <Typography sx={{ fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 2 }}>
          Integruojasi su šiomis apskaitos programomis:
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 0.5,
            maxWidth: 500,
          }}
        >
          {[
            { name: "Finvalda", href: null },
            { name: "Rivilė GAMA", href: 'https://atlyginimoskaiciuokle.com/rivile' },
            { name: "Rivilė ERP", href: 'https://atlyginimoskaiciuokle.com/rivile' },
            { name: "Agnum", href: 'https://atlyginimoskaiciuokle.com/agnum' },
            { name: "Centas", href: 'https://atlyginimoskaiciuokle.com/centas' },
            { name: "Apskaita5", href: 'https://atlyginimoskaiciuokle.com/apskaita5' },
            { name: "Pragma 3.2", href: null },
            { name: "Pragma 4", href: null },
            { name: "Būtenta", href: null },
            { name: "Site.pro", href: 'https://atlyginimoskaiciuokle.com/site-pro' },
            { name: "Debetas", href: null },
            { name: "APSA", href: 'https://atlyginimoskaiciuokle.com/apsa' },
            { name: "Paulita", href: null },
            { name: "Optimum", href: null },
            { name: "Dineta", href: null },
            { name: "iSAF", href: null },
          ].map((item) => (
            <Box key={item.name} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.3 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#333', flexShrink: 0 }} />
              {item.href ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#003366',
                    fontSize: '15px',
                    fontFamily: 'Helvetica',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  {item.name}
                </a>
              ) : (
                <Typography sx={{ color: '#000', fontSize: '15px', fontFamily: 'Helvetica' }}>
                  {item.name}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      </Container>

    </Container>
  );
};

export default PvmSkaiciuokle;


