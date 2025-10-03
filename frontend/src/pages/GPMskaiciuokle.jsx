import { useState } from "react";
import { Helmet } from "react-helmet";
import AdSection from "../page_elements/AdSection";
import {
  Table, TableBody, TableCell, TableContainer, TableRow, TableHead, Grid2, Container,
  FormControl, FormLabel, TextField, Select, MenuItem, Typography,
  Box, Paper, Dialog, DialogContent, Link
} from "@mui/material";

const eur = (v) => (isFinite(v) ? Number(v).toFixed(2) : "0.00");
const nz = (v) => (v < 0 ? 0 : v);

const GpmSkaiciuokle = () => {
  // 1) Išskaiciavimas (iš sumos SU GPM)
  const [rateExtract, setRateExtract] = useState(15);
  const [sumWithGpm, setSumWithGpm] = useState("");

  // 2) Įskaiciavimas (į sumą BE GPM)
  const [rateAdd, setRateAdd] = useState(15);
  const [sumWithoutGpm, setSumWithoutGpm] = useState("");

  const [videoOpen, setVideoOpen] = useState(false);

  // --- computations ---
  const extract = (() => {
    if (sumWithGpm === "" || isNaN(Number(sumWithGpm))) return null;
    const total = nz(Number(sumWithGpm));
    const base = total / (1 + rateExtract / 100);
    const tax = total - base;
    return { base, tax };
  })();

  const add = (() => {
    if (sumWithoutGpm === "" || isNaN(Number(sumWithoutGpm))) return null;
    const base = nz(Number(sumWithoutGpm));
    const tax = base * (rateAdd / 100);
    const total = base + tax;
    return { base, tax, total };
  })();

  const rateOptions = [5, 15, 20, 25, 32];

  const euCountriesData = [
    { country: 'Airija', rates: '20% - 40%', notes: 'Progresiniai tarifai' },
    { country: 'Austrija', rates: '0% - 55%', notes: 'Progresinė sistema' },
    { country: 'Belgija', rates: '25% - 50%', notes: 'Progresiniai tarifai' },
    { country: 'Bulgarija', rates: '10%', notes: 'Vientisas tarifas' },
    { country: 'Čekija', rates: '15% - 23%', notes: 'Progresiniai tarifai' },
    { country: 'Danija', rates: '~37% - 52%', notes: 'Savivaldybių + valstybinis' },
    { country: 'Estija', rates: '20%', notes: 'Vientisas tarifas' },
    { country: 'Graikija', rates: '9% - 44%', notes: 'Progresiniai tarifai' },
    { country: 'Ispanija', rates: '19% - 47%', notes: 'Regioniniai progresiniai tarifai' },
    { country: 'Italija', rates: '23% - 43%', notes: 'Regioniniai priedai' },
    { country: 'Kipras', rates: '0% - 35%', notes: 'Progresiniai tarifai' },
    { country: 'Kroatija', rates: '23,60% - 35,40%', notes: 'Savivaldybių priedai' },
    { country: 'Latvija', rates: '20% - 31%', notes: 'Progresiniai tarifai' },
    { country: 'Lietuva', rates: '20% - 32%', notes: 'Progresiniai tarifai nuo 2026 m.' },
    { country: 'Liuksemburgas', rates: '0% - 42%', notes: 'Daugiapakopiai tarifai' },
    { country: 'Malta', rates: '0% - 35%', notes: 'Skirtingos lentelės statusams' },
    { country: 'Nyderlandai', rates: '36,97% - 49,50%', notes: 'Box sistema' },
    { country: 'Lenkija', rates: '12% - 32%', notes: 'Progresiniai tarifai' },
    { country: 'Portugalija', rates: '14,50% - 48%', notes: 'Progresiniai tarifai' },
    { country: 'Prancūzija', rates: '0% - 45%', notes: 'Šeimos koeficientas' },
    { country: 'Rumunija', rates: '10%', notes: 'Vientisas tarifas' },
    { country: 'Slovakija', rates: '19% - 25%', notes: 'Progresiniai tarifai' },
    { country: 'Slovėnija', rates: '16% - 50%', notes: 'Progresiniai tarifai' },
    { country: 'Suomija', rates: '~31% - 57%', notes: 'Savivaldybių + valstybinis' },
    { country: 'Švedija', rates: '~32% - 52%', notes: 'Savivaldybių + valstybinis' },
    { country: 'Vengrija', rates: '15%', notes: 'Vientisas tarifas' },
    { country: 'Vokietija', rates: '0% - 45%', notes: 'Solidarumo priedas (retai)' },
  ];

  return (
    <Container maxWidth="lg" sx={{ marginBottom: "100px" }}>
      <Helmet>
        <title>Tiksliausia GPM skaičiuoklė 2025 – DokSkenas</title>
        <meta
          name="description"
          content="Pasiskaičiuokite GPM sumas naudojant mūsų skaičiuoklę. Sužinokite, kiek mokesčių mokate."
        />
      </Helmet>

      <Paper sx={{ p: 3, mt: 3, backgroundColor: "#212121", borderRadius: 3, minHeight: "540px" }}>
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
          GPM skaičiuoklė 2025
        </Typography>

        {/* ====== 1. GPM išskaiciavimas ====== */}
        <Grid2 container sx={{ flexWrap: { md: "nowrap" }, display: "flex", flexDirection: { xs: "column", md: "row" }, justifyContent: "space-between", alignItems: "start", gap: 2 }}>
          <Grid2 sx={{ maxWidth: { md: "50%" }, width: "100%" }}>
            <Box sx={{ backgroundColor: "#0f0f0f", borderRadius: 2, p: 2 }}>
              <Typography sx={{ color: "#d2cbc6", mb: 1.5, fontFamily: "Helvetica", fontWeight: "700", fontSize: { xs: 20, sm: 22 } }}>
                GPM išskaiciavimas
              </Typography>
              <Typography sx={{ color: "#d2cbc6", opacity: 0.85, mb: 2 }}>
                Žinodami bendrą sumą su GPM bei GPM procentinį dydį galite lengvai apskaičiuoti GPM eurais bei sumą be GPM.
              </Typography>

              <FormControl fullWidth margin="normal">
                <FormLabel sx={{ color: "#d2cbc6", mb: 1 }}>GPM dydis (%)</FormLabel>
                <Select
                  value={rateExtract}
                  onChange={(e) => setRateExtract(Number(e.target.value))}
                  sx={{
                    backgroundColor: "#FAFAFA",
                    borderRadius: 1,
                    ".MuiOutlinedInput-notchedOutline": { borderColor: "#555" },
                    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#888" },
                    "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#d2cbc6" },
                  }}
                >
                  {rateOptions.map((r) => (
                    <MenuItem key={r} value={r}>{r}%</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth margin="normal">
                <FormLabel sx={{ color: "#d2cbc6", mb: 1 }}>Suma su GPM (€)</FormLabel>
                <TextField
                  type="number"
                  value={sumWithGpm}
                  onChange={(e) => setSumWithGpm(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  variant="outlined"
                  sx={{
                    backgroundColor: "#FAFAFA",
                    borderRadius: 1,
                    ".MuiOutlinedInput-notchedOutline": { borderColor: "#555" },
                    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#888" },
                    "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#d2cbc6" },
                  }}
                />
                <Typography sx={{ color: "#8e8e8e", mt: 0.5, fontSize: 12 }}>Min: 0 - Max: 100000000</Typography>
              </FormControl>
            </Box>
          </Grid2>

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
                    <TableCell sx={{ fontSize: "16px", height: "50px" }}>GPM suma (€)</TableCell>
                    <TableCell align="right" sx={{ fontSize: "16px" }}>
                      {extract ? eur(extract.tax) : "0.00"}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: "#FAFAFA" }}>
                    <TableCell>Suma be GPM (€)</TableCell>
                    <TableCell align="right">{extract ? eur(extract.base) : "0.00"}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid2>
        </Grid2>

        {/* === AD === */}
        <Box sx={{ mt: 4, mb: 5 }}>
          <AdSection
            onOpenVideo={() => setVideoOpen(true)}
            videoUrl="https://www.youtube.com/embed/falGn4_S_5Y?si=LFmb3RYZCG59JKF8"
            videoTitle="DokSkenas demo"
            onLearnMoreClick={() => {}}
          />
        </Box>

        {/* ====== 2. GPM įskaiciavimas ====== */}
        <Grid2 container sx={{ flexWrap: { md: "nowrap" }, display: "flex", flexDirection: { xs: "column", md: "row" }, justifyContent: "space-between", alignItems: "start", gap: 2 }}>
          <Grid2 sx={{ maxWidth: { md: "50%" }, width: "100%" }}>
            <Box sx={{ backgroundColor: "#0f0f0f", borderRadius: 2, p: 2 }}>
              <Typography sx={{ color: "#d2cbc6", mt: 2, mb: 1.5, fontFamily: "Helvetica", fontWeight: "700", fontSize: { xs: 20, sm: 22 } }}>
                GPM priskaičiavimas
              </Typography>
              <Typography sx={{ color: "#d2cbc6", opacity: 0.85, mb: 2 }}>
                Įveskite sumą be GPM ir pasirinkite tarifą – gausite GPM sumą ir bendrą sumą su GPM.
              </Typography>

              <FormControl fullWidth margin="normal">
                <FormLabel sx={{ color: "#d2cbc6", mb: 1 }}>GPM dydis (%)</FormLabel>
                <Select
                  value={rateAdd}
                  onChange={(e) => setRateAdd(Number(e.target.value))}
                  sx={{
                    backgroundColor: "#FAFAFA",
                    borderRadius: 1,
                    ".MuiOutlinedInput-notchedOutline": { borderColor: "#555" },
                    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#888" },
                    "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#d2cbc6" },
                  }}
                >
                  {rateOptions.map((r) => (
                    <MenuItem key={r} value={r}>{r}%</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth margin="normal">
                <FormLabel sx={{ color: "#d2cbc6", mb: 1 }}>Suma be GPM (€)</FormLabel>
                <TextField
                  type="number"
                  value={sumWithoutGpm}
                  onChange={(e) => setSumWithoutGpm(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  variant="outlined"
                  sx={{
                    backgroundColor: "#FAFAFA",
                    borderRadius: 1,
                    ".MuiOutlinedInput-notchedOutline": { borderColor: "#555" },
                    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#888" },
                    "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#d2cbc6" },
                  }}
                />
                <Typography sx={{ color: "#8e8e8e", mt: 0.5, fontSize: 12 }}>Min: 0 - Max: 100000000</Typography>
              </FormControl>
            </Box>
          </Grid2>

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
                    <TableCell sx={{ fontSize: "16px", height: "50px" }}>GPM suma (€)</TableCell>
                    <TableCell align="right" sx={{ fontSize: "16px" }}>
                      {add ? eur(add.tax) : "0.00"}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: "#FAFAFA" }}>
                    <TableCell>Suma su GPM (€)</TableCell>
                    <TableCell align="right">{add ? eur(add.total) : "0.00"}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid2>
        </Grid2>
      </Paper>
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
        {/* CTA skaičiuoklei */}
        <Box sx={{ mb: 4, p: 2, bgcolor: '#f0f7ff', borderRadius: 1, borderLeft: '4px solid #1976d2' }}>
          <Typography variant="body1" sx={{ m: 0 }}>
            Jeigu norite paskaičiuoti, kiek GPM mokėsite nuo savo atlyginimo, pasinaudokite mūsų{' '}
            <Link 
              href="/2026" 
              underline="hover" 
              sx={{ fontWeight: 'bold', color: '#1976d2' }}
            >
              atlyginimo skaičiuokle
            </Link>
            , kuri apskaičiuoja progresinį gyventojų pajamų mokestį, įvestą nuo 2026 metų sausio 1 dienos.
          </Typography>
        </Box>

        {/* Kas yra GPM */}
        <Typography 
          variant="h2" 
          component="h2"
          sx={{ 
            fontSize: { xs: 24, sm: 30 }, 
            fontWeight: 'bold', 
            mb: 2,
            mt: 5 
          }}
        >
          Kas yra GPM?
        </Typography>
        <Typography variant="body1">
          GPM (gyventojų pajamų mokestis) – tai mokestis, kuriuo apmokestinamos gyventojų pajamos: darbo užmokestis, 
          individualios veiklos pajamos, dividendai, palūkanos ir kitos pajamų rūšys. Mokesčio tarifas priklauso nuo 
          pajamų rūšies ir dydžio. Nuo 2026 metų sausio 1 dienos Lietuvoje taikoma progresinio GPM sistema darbo pajamoms.
        </Typography>
        <Typography variant="body1">
          GPM skaičiuojamas nuo apmokestinamųjų pajamų, kurios gali būti mažinamos taikant NPD (neapmokestinamąjį 
          pajamų dydį), įvairias lengvatas ir atskaitas.
        </Typography>

        {/* Kada įvestas Lietuvoje */}
        <Typography 
          variant="h2" 
          component="h2"
          sx={{ 
            fontSize: { xs: 24, sm: 30 }, 
            fontWeight: 'bold', 
            mb: 2,
            mt: 5 
          }}
        >
          Kada įvestas Lietuvoje?
        </Typography>
        <Typography variant="body1">
          Gyventojų pajamų mokestis Lietuvoje taikomas nuo 1990-ųjų metų pradžios, atkūrus nepriklausomybę. Per daugiau 
          nei 30 metų GPM sistema patyrė nemažai pokyčių – keitėsi tarifai, ribos, lengvatų taikymo taisyklės ir 
          apmokestinimo principai.
        </Typography>
        <Typography variant="body1">
          Reikšmingiausias pakeitimas įvyko 2026 metų sausio 1 dieną, kai vietoj vientiso tarifo buvo įvestas progresinis 
          GPM tarifas darbo pajamoms. Tai reiškia, kad didesnes pajamas gaunantys asmenys moka didesnį mokesčio procentą.
        </Typography>

        {/* Naudojami GPM tarifai Lietuvoje */}
        <Typography 
          variant="h2" 
          component="h2"
          sx={{ 
            fontSize: { xs: 24, sm: 30 }, 
            fontWeight: 'bold', 
            mb: 2,
            mt: 5 
          }}
        >
          Naudojami GPM tarifai Lietuvoje
        </Typography>
        <Typography variant="body1">
          Lietuvoje taikomi skirtingi GPM tarifai priklausomai nuo pajamų rūšies:
        </Typography>
        
        <Box component="div" sx={{ mb: 3 }}>
          <Typography variant="h3" sx={{ fontSize: 18, fontWeight: 'bold', mt: 3, mb: 1 }}>
            Darbo pajamoms (nuo 2026 m.):
          </Typography>
          <ul style={{ margin: '0 0 16px 0', paddingLeft: 24 }}>
            <li><strong>20%</strong> – pajamoms iki 36 VDU per metus</li>
            <li><strong>25%</strong> – pajamų daliai tarp 36 ir 60 VDU per metus</li>
            <li><strong>32%</strong> – pajamų daliai, viršijančiai 60 VDU per metus</li>
          </ul>

          <Typography variant="h3" sx={{ fontSize: 18, fontWeight: 'bold', mt: 3, mb: 1 }}>
            Individualios veiklos pajamoms:
          </Typography>
          <ul style={{ margin: '0 0 16px 0', paddingLeft: 24 }}>
            <li><strong>5%</strong> – kai veikla vykdoma pagal verslo liudijimą</li>
            <li><strong>15%</strong> – kai veikla vykdoma pagal individualios veiklos pažymą</li>
          </ul>

          <Typography variant="h3" sx={{ fontSize: 18, fontWeight: 'bold', mt: 3, mb: 1 }}>
            Kapitalo pajamoms:
          </Typography>
          <ul style={{ margin: '0 0 16px 0', paddingLeft: 24 }}>
            <li><strong>15%</strong> – dividendams, palūkanoms, pajamoms iš vertybinių popierių</li>
          </ul>
        </Box>

        <Typography variant="body1" sx={{ fontStyle: 'italic', color: '#555' }}>
          Pastaba: GPM tarifai ir ribos gali keistis, todėl rekomenduojama tikrinti aktualiausią informaciją 
          Valstybinės mokesčių inspekcijos svetainėje arba pasikonsultuoti su buhalteriu.
        </Typography>

        {/* GPM tarifai kituose ES šalyse */}
        <Typography 
          variant="h2" 
          component="h2"
          sx={{ 
            fontSize: { xs: 24, sm: 30 }, 
            fontWeight: 'bold', 
            mb: 2,
            mt: 5 
          }}
        >
          GPM tarifai kitose ES šalyse
        </Typography>
        <Typography variant="body1">
          Gyventojų pajamų mokesčio sistemos Europos Sąjungos šalyse labai skiriasi. Kai kurios šalys taiko 
          vientisą tarifą (pavyzdžiui, Estija, Bulgarija), kitos – progresinę sistemą su keliomis mokesčio 
          pakopomis. Žemiau pateikiama lyginamoji lentelė su pagrindiniais GPM tarifais ES šalyse:
        </Typography>

        <TableContainer 
          component={Paper} 
          variant="outlined" 
          sx={{ 
            borderRadius: 2, 
            overflow: 'hidden', 
            mt: 3,
            mb: 3
          }}
        >
          <Table size="small" aria-label="ES šalių GPM tarifai">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 'bold', fontSize: 15 }}>Šalis</TableCell>
                <TableCell sx={{ fontWeight: 'bold', fontSize: 15 }}>Tarifai</TableCell>
                <TableCell sx={{ fontWeight: 'bold', fontSize: 15 }}>Pastabos</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {euCountriesData.map((row) => (
                <TableRow 
                  key={row.country}
                  sx={{ 
                    '&:nth-of-type(odd)': { bgcolor: '#fafafa' },
                    '&:hover': { bgcolor: '#f0f0f0' }
                  }}
                >
                  <TableCell>{row.country}</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>{row.rates}</TableCell>
                  <TableCell sx={{ color: '#666', fontSize: 14 }}>{row.notes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Typography variant="body2" sx={{ color: '#666', fontStyle: 'italic' }}>
          * Lentelėje nurodyti orientaciniai tarifai, galiojantys 2025 m. Tikslūs tarifai ir jų taikymo ribos 
          gali skirtis priklausomai nuo šalies įstatymų, šeimyninės padėties ir kitų veiksnių. Kai kuriose 
          šalyse papildomai taikomi savivaldybių ar regioniniai mokesčiai.
        </Typography>
      </Paper>

      {/* Dialog with video */}
      <Dialog open={videoOpen} onClose={() => setVideoOpen(false)} maxWidth="md" fullWidth>
        <DialogContent sx={{ p: 0 }}>
          <Box
            component="iframe"
            src="https://www.youtube.com/embed/falGn4_S_5Y?si=LFmb3RYZCG59JKF8"
            title="Demo Video"
            width="100%"
            height="600px"
            sx={{ border: "none" }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </DialogContent>
      </Dialog>
    </Container>
  );
};

export default GpmSkaiciuokle;
