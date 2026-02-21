import { useState } from "react";
import { Helmet } from "react-helmet";
import AdSection from "../page_elements/AdSection";
import {
  Table, TableBody, TableCell, TableContainer, TableRow, TableHead, Grid2, Container,
  FormControl, FormLabel, TextField, Select, MenuItem, Typography,
  Box, Paper, Dialog, DialogContent, Link, ToggleButton, ToggleButtonGroup
} from "@mui/material";

const eur = (v) => (isFinite(v) ? Number(v).toFixed(2) : "0.00");

const DividenduSkaiciuokle = () => {
  const [videoOpen, setVideoOpen] = useState(false);

  // --- Gavėjas ---
  const [receiver, setReceiver] = useState("person"); // person | company

  // --- Fizinis asmuo ---
  const [amount, setAmount] = useState("");
  const [isForeign, setIsForeign] = useState("no");
  const [foreignTaxType, setForeignTaxType] = useState("percent");
  const [foreignTaxValue, setForeignTaxValue] = useState("");
  const [hasDais, setHasDais] = useState("yes");

  // --- Įmonė ---
  const [companyAmount, setCompanyAmount] = useState("");
  const [sharePercent, setSharePercent] = useState("");
  const [holdingMonths, setHoldingMonths] = useState("");
  const [isBlacklisted, setIsBlacklisted] = useState("no");

  // ── Person calc ──
  const personCalc = (() => {
    const gross = parseFloat(amount) || 0;
    if (gross <= 0) return null;

    const gpmRate = 0.15;
    const gpmFull = gross * gpmRate;

    let foreignTax = 0;
    if (isForeign === "yes") {
      foreignTax =
        foreignTaxType === "percent"
          ? gross * ((parseFloat(foreignTaxValue) || 0) / 100)
          : parseFloat(foreignTaxValue) || 0;
    }

    let foreignCredit = 0;
    let gpmToPay = gpmFull;

    if (isForeign === "yes" && hasDais === "yes" && foreignTax > 0) {
      foreignCredit = Math.min(foreignTax, gpmFull);
      gpmToPay = Math.max(0, gpmFull - foreignCredit);
    }

    const totalTax = foreignTax + gpmToPay;
    const net = gross - totalTax;

    return { gross, gpmFull, foreignTax, foreignCredit, gpmToPay, totalTax, net };
  })();

  // ── Company calc ──
  const companyCalc = (() => {
    const gross = parseFloat(companyAmount) || 0;
    if (gross <= 0) return null;

    const shares = parseFloat(sharePercent) || 0;
    const months = parseFloat(holdingMonths) || 0;
    const isExempt = shares >= 10 && months >= 12 && isBlacklisted === "no";
    const pmRate = isExempt ? 0 : 0.15;
    const pmAmount = gross * pmRate;
    const net = gross - pmAmount;

    let reason;
    if (isExempt) {
      reason = "Taikoma dalyvavimo išimtis (≥10%, ≥12 mėn., ne tikslinė teritorija)";
    } else if (shares < 10) {
      reason = `Akcijų dalis (${shares || 0}%) nesiekia 10%`;
    } else if (months < 12) {
      reason = `Valdymo laikotarpis (${months || 0} mėn.) trumpesnis nei 12 mėn.`;
    } else {
      reason = "Įmonė registruota tikslinėje teritorijoje";
    }

    return { gross, isExempt, pmRate, pmAmount, net, reason };
  })();

  // ── Shared styles ──
  const inputSx = {
    backgroundColor: "#FAFAFA",
    borderRadius: 1,
    ".MuiOutlinedInput-notchedOutline": { borderColor: "#555" },
    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#888" },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#d2cbc6" },
  };

  const toggleSx = {
    "&.MuiToggleButton-root": {
      color: "#999",
      borderColor: "#444",
      textTransform: "none",
      fontWeight: 500,
      fontSize: 14,
      px: 2.5,
      py: 1,
    },
    "&.Mui-selected": {
      backgroundColor: "#d2cbc6 !important",
      color: "#111 !important",
      fontWeight: 700,
    },
    "&.Mui-selected:hover": {
      backgroundColor: "#c4bbb5 !important",
    },
  };

  return (
    <Container maxWidth="lg" sx={{ marginBottom: "100px" }}>
      <Helmet>
        <title>Dividendų skaičiuoklė 2026 – apskaičiuokite dividendų mokesčius | DokSkenas</title>
        <meta
          name="description"
          content="Dividendų skaičiuoklė Lietuvai 2026 m. Apskaičiuokite GPM nuo dividendų fiziniam asmeniui arba pelno mokestį įmonei. Užsienio dividendai, DAIS įskaitymas, dalyvavimo išimtis."
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
          Dividendų skaičiuoklė 2026
        </Typography>

        {/* ═══════════ CALCULATOR ═══════════ */}
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
          {/* LEFT: inputs */}
          <Grid2 sx={{ maxWidth: { md: "55%" }, width: "100%" }}>
            <Box sx={{ backgroundColor: "#0f0f0f", borderRadius: 2, p: 2 }}>
              <Typography
                sx={{
                  color: "#d2cbc6",
                  mb: 1.5,
                  fontFamily: "Helvetica",
                  fontWeight: "700",
                  fontSize: { xs: 20, sm: 22 },
                }}
              >
                Dividendų mokesčių skaičiavimas
              </Typography>
              <Typography sx={{ color: "#d2cbc6", opacity: 0.85, mb: 2 }}>
                Pasirinkite dividendų gavėją, įveskite sumą ir sužinokite, kiek mokesčių turėsite sumokėti.
              </Typography>

              {/* 1. Gavėjas */}
              <FormControl fullWidth margin="normal">
                <FormLabel sx={{ color: "#d2cbc6", mb: 1 }}>Dividendų gavėjas</FormLabel>
                <ToggleButtonGroup
                  value={receiver}
                  exclusive
                  onChange={(_, v) => v && setReceiver(v)}
                  fullWidth
                >
                  <ToggleButton value="person" sx={toggleSx}>
                    Fizinis asmuo
                  </ToggleButton>
                  <ToggleButton value="company" sx={toggleSx}>
                    Įmonė
                  </ToggleButton>
                </ToggleButtonGroup>
              </FormControl>

              {/* ═══ FIZINIS ASMUO ═══ */}
              {receiver === "person" && (
                <>
                  {/* Suma */}
                  <FormControl fullWidth margin="normal">
                    <FormLabel sx={{ color: "#d2cbc6", mb: 1 }}>Dividendų suma prieš mokesčius (€)</FormLabel>
                    <TextField
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="10000"
                      variant="outlined"
                      sx={inputSx}
                    />
                  </FormControl>

                  {/* Užsienis */}
                  <FormControl fullWidth margin="normal">
                    <FormLabel sx={{ color: "#d2cbc6", mb: 1 }}>Dividendai iš užsienio įmonės?</FormLabel>
                    <ToggleButtonGroup
                      value={isForeign}
                      exclusive
                      onChange={(_, v) => v && setIsForeign(v)}
                      fullWidth
                    >
                      <ToggleButton value="no" sx={toggleSx}>
                        Ne · Lietuva
                      </ToggleButton>
                      <ToggleButton value="yes" sx={toggleSx}>
                        Taip · Užsienis
                      </ToggleButton>
                    </ToggleButtonGroup>
                    <Typography sx={{ color: "#8e8e8e", mt: 0.5, fontSize: 12 }}>
                      {isForeign === "yes"
                        ? "Užsienyje išskaičiuotas mokestis gali būti įskaitomas Lietuvoje"
                        : "Lietuvos įmonė išskaičiuoja ir sumoka GPM automatiškai"}
                    </Typography>
                  </FormControl>

                  {isForeign === "yes" && (
                    <>
                      {/* Mokesčio tipas */}
                      <FormControl fullWidth margin="normal">
                        <FormLabel sx={{ color: "#d2cbc6", mb: 1 }}>
                          Užsienyje išskaičiuoto mokesčio tipas
                        </FormLabel>
                        <ToggleButtonGroup
                          value={foreignTaxType}
                          exclusive
                          onChange={(_, v) => v && setForeignTaxType(v)}
                          fullWidth
                        >
                          <ToggleButton value="percent" sx={toggleSx}>
                            Procentais (%)
                          </ToggleButton>
                          <ToggleButton value="sum" sx={toggleSx}>
                            Suma (€)
                          </ToggleButton>
                        </ToggleButtonGroup>
                      </FormControl>

                      {/* Mokesčio reikšmė */}
                      <FormControl fullWidth margin="normal">
                        <FormLabel sx={{ color: "#d2cbc6", mb: 1 }}>
                          {foreignTaxType === "percent"
                            ? "Mokesčio tarifas užsienyje (%)"
                            : "Užsienyje sumokėtas mokestis (€)"}
                        </FormLabel>
                        <TextField
                          type="number"
                          value={foreignTaxValue}
                          onChange={(e) => setForeignTaxValue(e.target.value)}
                          onWheel={(e) => e.currentTarget.blur()}
                          placeholder="0"
                          variant="outlined"
                          sx={inputSx}
                        />
                      </FormControl>

                      {/* DAIS */}
                      <FormControl fullWidth margin="normal">
                        <FormLabel sx={{ color: "#d2cbc6", mb: 1 }}>
                          Taikoma DAIS (dvigubo apmokestinimo sutartis)?
                        </FormLabel>
                        <ToggleButtonGroup
                          value={hasDais}
                          exclusive
                          onChange={(_, v) => v && setHasDais(v)}
                          fullWidth
                        >
                          <ToggleButton value="yes" sx={toggleSx}>
                            Taip · Įskaitymas
                          </ToggleButton>
                          <ToggleButton value="no" sx={toggleSx}>
                            Ne · Pilnas GPM
                          </ToggleButton>
                        </ToggleButtonGroup>
                        <Typography sx={{ color: "#8e8e8e", mt: 0.5, fontSize: 12 }}>
                          {hasDais === "yes"
                            ? "Užsienio mokestis įskaitomas — mokate tik skirtumą iki 15%"
                            : "Mokėsite pilną 15% GPM Lietuvoje, nepriklausomai nuo užsienyje sumokėto mokesčio"}
                        </Typography>
                      </FormControl>
                    </>
                  )}
                </>
              )}

              {/* ═══ ĮMONĖ ═══ */}
              {receiver === "company" && (
                <>
                  <FormControl fullWidth margin="normal">
                    <FormLabel sx={{ color: "#d2cbc6", mb: 1 }}>Dividendų suma prieš mokesčius (€)</FormLabel>
                    <TextField
                      type="number"
                      value={companyAmount}
                      onChange={(e) => setCompanyAmount(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="10000"
                      variant="outlined"
                      sx={inputSx}
                    />
                  </FormControl>

                  <Typography
                    sx={{
                      color: "#d2cbc6",
                      mt: 3,
                      mb: 1,
                      fontWeight: 700,
                      fontSize: 16,
                      opacity: 0.85,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    Dalyvavimo išimties sąlygos
                  </Typography>

                  <FormControl fullWidth margin="normal">
                    <FormLabel sx={{ color: "#d2cbc6", mb: 1 }}>Balsus suteikiančių akcijų dalis (%)</FormLabel>
                    <TextField
                      type="number"
                      value={sharePercent}
                      onChange={(e) => setSharePercent(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="100"
                      variant="outlined"
                      sx={inputSx}
                    />
                    <Typography sx={{ color: "#8e8e8e", mt: 0.5, fontSize: 12 }}>
                      Būtina ≥ 10% norint taikyti dalyvavimo išimtį
                    </Typography>
                  </FormControl>

                  <FormControl fullWidth margin="normal">
                    <FormLabel sx={{ color: "#d2cbc6", mb: 1 }}>Nepertraukiamo valdymo laikotarpis (mėn.)</FormLabel>
                    <TextField
                      type="number"
                      value={holdingMonths}
                      onChange={(e) => setHoldingMonths(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="12"
                      variant="outlined"
                      sx={inputSx}
                    />
                    <Typography sx={{ color: "#8e8e8e", mt: 0.5, fontSize: 12 }}>
                      Būtina ≥ 12 mėnesių be pertraukų
                    </Typography>
                  </FormControl>

                  <FormControl fullWidth margin="normal">
                    <FormLabel sx={{ color: "#d2cbc6", mb: 1 }}>
                      Ar įmonė registruota tikslinėje teritorijoje?
                    </FormLabel>
                    <ToggleButtonGroup
                      value={isBlacklisted}
                      exclusive
                      onChange={(_, v) => v && setIsBlacklisted(v)}
                      fullWidth
                    >
                      <ToggleButton value="no" sx={toggleSx}>
                        Ne
                      </ToggleButton>
                      <ToggleButton value="yes" sx={toggleSx}>
                        Taip
                      </ToggleButton>
                    </ToggleButtonGroup>
                    <Typography sx={{ color: "#8e8e8e", mt: 0.5, fontSize: 12 }}>
                      Tikslinės teritorijos — VMI patvirtintas sąrašas
                    </Typography>
                  </FormControl>
                </>
              )}
            </Box>
          </Grid2>

          {/* RIGHT: results */}
          <Grid2 sx={{ width: { md: "42%" }, minWidth: { md: "42%" } }}>
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

            {/* ── Person results ── */}
            {receiver === "person" && (
              <TableContainer component={Paper} sx={{ mt: 2 }}>
                <Table>
                  <TableBody>
                    <TableRow sx={{ backgroundColor: "#FAFAFA" }}>
                      <TableCell>Dividendai (bruto)</TableCell>
                      <TableCell align="right">{personCalc ? eur(personCalc.gross) : "0.00"} €</TableCell>
                    </TableRow>
                    <TableRow sx={{ backgroundColor: "#FAFAFA" }}>
                      <TableCell>GPM (15%)</TableCell>
                      <TableCell align="right">
                        {personCalc ? eur(personCalc.gpmFull) : "0.00"} €
                      </TableCell>
                    </TableRow>

                    {isForeign === "yes" && personCalc && personCalc.foreignTax > 0 && (
                      <>
                        <TableRow sx={{ backgroundColor: "#FAFAFA" }}>
                          <TableCell>Išskaičiuota užsienyje</TableCell>
                          <TableCell align="right">{eur(personCalc.foreignTax)} €</TableCell>
                        </TableRow>
                        {hasDais === "yes" && (
                          <TableRow sx={{ backgroundColor: "#FAFAFA" }}>
                            <TableCell>DAIS įskaitymas</TableCell>
                            <TableCell align="right">− {eur(personCalc.foreignCredit)} €</TableCell>
                          </TableRow>
                        )}
                        <TableRow sx={{ backgroundColor: "#FAFAFA" }}>
                          <TableCell>GPM mokėti Lietuvoje</TableCell>
                          <TableCell align="right">{eur(personCalc.gpmToPay)} €</TableCell>
                        </TableRow>
                      </>
                    )}

                    <TableRow sx={{ backgroundColor: "#d2cbc6" }}>
                      <TableCell sx={{ fontSize: "16px", fontWeight: "bold", height: "50px" }}>
                        Mokesčiai iš viso
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: "16px", fontWeight: "bold" }}>
                        {personCalc ? eur(personCalc.totalTax) : "0.00"} €
                      </TableCell>
                    </TableRow>
                    <TableRow sx={{ backgroundColor: "#e8f5e9" }}>
                      <TableCell sx={{ fontSize: "16px", fontWeight: "bold", height: "50px" }}>
                        Į rankas (neto)
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: "16px", fontWeight: "bold", color: "#2e7d32" }}>
                        {personCalc ? eur(personCalc.net) : "0.00"} €
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {/* ── Company results ── */}
            {receiver === "company" && (
              <>
                {companyCalc && (
                  <Box
                    sx={{
                      mb: 2,
                      p: 1.5,
                      borderRadius: 1,
                      backgroundColor: companyCalc.isExempt ? "#2e7d32" : "#c62828",
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: 14,
                    }}
                  >
                    {companyCalc.isExempt
                      ? "✓ Dalyvavimo išimtis taikoma — 0% pelno mokesčio"
                      : "✗ Dalyvavimo išimtis netaikoma"}
                  </Box>
                )}

                {companyCalc && (
                  <Typography sx={{ color: "#d2cbc6", mb: 2, fontSize: 13, fontStyle: "italic" }}>
                    {companyCalc.reason}
                  </Typography>
                )}

                <TableContainer component={Paper} sx={{ mt: 1 }}>
                  <Table>
                    <TableBody>
                      <TableRow sx={{ backgroundColor: "#FAFAFA" }}>
                        <TableCell>Dividendai (bruto)</TableCell>
                        <TableCell align="right">
                          {companyCalc ? eur(companyCalc.gross) : "0.00"} €
                        </TableCell>
                      </TableRow>
                      <TableRow sx={{ backgroundColor: "#FAFAFA" }}>
                        <TableCell>
                          Pelno mokestis ({companyCalc ? (companyCalc.pmRate * 100).toFixed(0) : "15"}%)
                        </TableCell>
                        <TableCell align="right">
                          {companyCalc ? eur(companyCalc.pmAmount) : "0.00"} €
                        </TableCell>
                      </TableRow>
                      <TableRow sx={{ backgroundColor: "#e8f5e9" }}>
                        <TableCell sx={{ fontSize: "16px", fontWeight: "bold", height: "50px" }}>
                          Gauna įmonė (neto)
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: "16px", fontWeight: "bold", color: "#2e7d32" }}>
                          {companyCalc ? eur(companyCalc.net) : "0.00"} €
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}

            {/* Info box */}
            <Box
              sx={{
                mt: 2,
                p: 1.5,
                backgroundColor: "#1a237e15",
                borderLeft: "3px solid #5c6bc0",
                borderRadius: 1,
              }}
            >
              <Typography sx={{ color: "#d2cbc6", fontSize: 12, lineHeight: 1.6 }}>
                {receiver === "person"
                  ? "💡 Dividendams taikomas fiksuotas 15% GPM tarifas — jie neįtraukiami į progresinių GPM tarifų (20/25/32%) skaičiavimą."
                  : "💡 Jei įmonė ≥12 mėn. valdo ≥10% akcijų ir šaltinis nėra tikslinė teritorija — dividendai neapmokestinami pelno mokesčiu (PMĮ 33 str.)."}
              </Typography>
            </Box>
          </Grid2>
        </Grid2>

        {/* ═══ AD SECTION ═══ */}
        <Box sx={{ mt: 4, mb: 2 }}>
          <AdSection
            onOpenVideo={() => setVideoOpen(true)}
            videoUrl="https://www.youtube.com/embed/ByViuilYxZA"
            videoTitle="DokSkenas demo"
            onLearnMoreClick={() => {}}
          />
        </Box>
      </Paper>

      {/* ═══════════ SEO CONTENT ═══════════ */}
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
        {/* CTA */}
        <Box sx={{ mb: 4, p: 2, bgcolor: "#f0f7ff", borderRadius: 1, borderLeft: "4px solid #1976d2" }}>
          <Typography variant="body1" sx={{ m: 0 }}>
            Norite paskaičiuoti GPM nuo atlyginimo?{" "}
            <Link href="/gpm-skaiciuokle" underline="hover" sx={{ fontWeight: "bold", color: "#1976d2" }}>
              GPM skaičiuoklė
            </Link>{" "}
            padės greitai apskaičiuoti gyventojų pajamų mokestį pagal progresinius tarifus, galiojančius nuo 2026 m.
          </Typography>
        </Box>

        {/* Kas yra dividendai */}
        <Typography
          variant="h2"
          component="h2"
          sx={{ fontSize: { xs: 24, sm: 30 }, fontWeight: "bold", mb: 2, mt: 5 }}
        >
          Kas yra dividendai?
        </Typography>
        <Typography variant="body1">
          Dividendai — tai įmonės pelno dalis, kuri paskirstoma akcininkams arba dalyviams proporcingai jų
          turimoms akcijoms ar dalims. Tai vienas pagrindinių būdų, kuriais verslo savininkai gauna pajamas iš
          savo įmonės veiklos. Sprendimą dėl dividendų skyrimo paprastai priima visuotinis akcininkų
          susirinkimas, patvirtinęs metines finansines ataskaitas.
        </Typography>
        <Typography variant="body1" sx={{ mt: 1 }}>
          Lietuvoje dividendai gali būti skiriami ne tik už visus finansinius metus, bet ir už trumpesnį
          laikotarpį (tarpiniai dividendai), jeigu tenkinamos Akcinių bendrovių įstatyme nustatytos sąlygos.
        </Typography>

        {/* Dividendų apmokestinimas fiziniams asmenims */}
        <Typography
          variant="h2"
          component="h2"
          sx={{ fontSize: { xs: 24, sm: 30 }, fontWeight: "bold", mb: 2, mt: 5 }}
        >
          Dividendų apmokestinimas fiziniams asmenims
        </Typography>
        <Typography variant="body1">
          Lietuvos rezidento fizinio asmens gauti dividendai apmokestinami taikant fiksuotą 15% gyventojų
          pajamų mokestį (GPM). Svarbus niuansas — nuo 2026 metų Lietuvoje įvesti progresiniai GPM tarifai
          (20%, 25%, 32%), tačiau dividendų pajamos į šią progresinę skalę neįtraukiamos. Dividendams
          išlieka atskiras 15% tarifas, nepriklausomai nuo bendros metinių pajamų sumos.
        </Typography>
        <Typography variant="body1" sx={{ mt: 1 }}>
          Kai dividendus moka Lietuvos įmonė, ji pati apskaičiuoja, išskaičiuoja ir sumoka GPM į biudžetą —
          akcininkui mokėti papildomai nereikia. Tai vadinamosios A klasės pajamos.
        </Typography>

        {/* Užsienio dividendai */}
        <Typography
          variant="h2"
          component="h2"
          sx={{ fontSize: { xs: 24, sm: 30 }, fontWeight: "bold", mb: 2, mt: 5 }}
        >
          Dividendai iš užsienio: DAIS ir mokesčio įskaitymas
        </Typography>
        <Typography variant="body1">
          Kai dividendus gauna Lietuvos rezidentas iš užsienio bendrovės, situacija sudėtingesnė. Užsienio
          šalis paprastai išskaičiuoja savo mokestį prie šaltinio (withholding tax). Jeigu Lietuva su ta
          šalimi yra pasirašiusi dvigubo apmokestinimo išvengimo sutartį (DAIS), užsienyje sumokėtas
          mokestis gali būti įskaitomas Lietuvoje.
        </Typography>
        <Typography variant="body1" sx={{ mt: 1 }}>
          Praktiškai tai reiškia, kad Lietuvoje reikia sumokėti tik skirtumą tarp 15% ir jau sumokėto
          mokesčio užsienyje. Pavyzdžiui, jei Vokietijoje buvo išskaičiuota 10%, Lietuvoje reikės dopriemokėti
          tik 5%. Jei užsienyje sumokėtas mokestis lygus ar didesnis nei 15% — papildomai Lietuvoje mokėti
          nereikia, tačiau deklaruoti pajamas vis tiek būtina.
        </Typography>
        <Typography variant="body1" sx={{ mt: 1 }}>
          Užsienio dividendai priskiriami B klasės pajamoms — gyventojas pats privalo juos deklaruoti metinėje
          pajamų deklaracijoje ir sumokėti mokestį.
        </Typography>

        {/* Dividendai tarp įmonių */}
        <Typography
          variant="h2"
          component="h2"
          sx={{ fontSize: { xs: 24, sm: 30 }, fontWeight: "bold", mb: 2, mt: 5 }}
        >
          Dividendų apmokestinimas tarp įmonių
        </Typography>
        <Typography variant="body1">
          Kai dividendus gauna juridinis asmuo (įmonė), taikomas pelno mokestis. Standartinis tarifas — 15%
          (nuo 2025 m. — 16%, nuo 2026 m. — 17%). Tačiau egzistuoja svarbi išimtis, vadinamoji dalyvavimo
          išimtis (participation exemption), kuri leidžia visiškai atleisti dividendus nuo pelno mokesčio.
        </Typography>
        <Typography variant="body1" sx={{ mt: 1 }}>
          Dalyvavimo išimtis taikoma, kai:
        </Typography>
        <ul style={{ margin: "8px 0 16px 0", paddingLeft: 24, color: "#111" }}>
          <li>Įmonė valdo ne mažiau kaip <strong>10%</strong> balsus suteikiančių akcijų</li>
          <li>Valdymo laikotarpis — ne trumpesnis kaip <strong>12 mėnesių</strong> be pertraukų</li>
          <li>Dividendų šaltinis <strong>nėra registruotas tikslinėje teritorijoje</strong> (VMI sąrašas)</li>
        </ul>
        <Typography variant="body1">
          Jei visos sąlygos tenkinamos — dividendai neapmokestinami ir neįtraukiami į pajamas pagal Pelno
          mokesčio įstatymo 33 straipsnį.
        </Typography>

        {/* Bendra mokestinė grandinė */}
        <Typography
          variant="h2"
          component="h2"
          sx={{ fontSize: { xs: 24, sm: 30 }, fontWeight: "bold", mb: 2, mt: 5 }}
        >
          Bendra dividendų mokestinė grandinė
        </Typography>
        <Typography variant="body1">
          Norint suprasti tikrąją dividendų mokestinę naštą, reikia matyti visą grandinę: įmonė pirmiausia
          sumoka pelno mokestį (17% nuo 2026 m.), o iš likusio pelno paskirstyti dividendai dar
          apmokestinami 15% GPM. Taigi efektyvus bendras apmokestinimas nuo pradinio pelno siekia apie
          29,45%.
        </Typography>

        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{ borderRadius: 2, overflow: "hidden", mt: 3, mb: 3 }}
        >
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: "#f5f5f5" }}>
                <TableCell sx={{ fontWeight: "bold", fontSize: 15 }}>Etapas</TableCell>
                <TableCell sx={{ fontWeight: "bold", fontSize: 15 }}>Pavyzdys (10 000 €)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>Pelnas prieš mokesčius</TableCell>
                <TableCell sx={{ fontWeight: 500 }}>10 000,00 €</TableCell>
              </TableRow>
              <TableRow sx={{ bgcolor: "#fafafa" }}>
                <TableCell>Pelno mokestis (17%)</TableCell>
                <TableCell sx={{ fontWeight: 500 }}>− 1 700,00 €</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Pelnas po PM → dividendai</TableCell>
                <TableCell sx={{ fontWeight: 500 }}>8 300,00 €</TableCell>
              </TableRow>
              <TableRow sx={{ bgcolor: "#fafafa" }}>
                <TableCell>GPM (15% nuo dividendų)</TableCell>
                <TableCell sx={{ fontWeight: 500 }}>− 1 245,00 €</TableCell>
              </TableRow>
              <TableRow sx={{ bgcolor: "#e8f5e9" }}>
                <TableCell sx={{ fontWeight: "bold" }}>Į rankas</TableCell>
                <TableCell sx={{ fontWeight: "bold", color: "#2e7d32" }}>7 055,00 €</TableCell>
              </TableRow>
              <TableRow sx={{ bgcolor: "#fff3e0" }}>
                <TableCell sx={{ fontWeight: "bold" }}>Efektyvus mokesčio tarifas</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>29,45%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>

        {/* Palyginimas su Baltijos šalimis */}
        <Typography
          variant="h2"
          component="h2"
          sx={{ fontSize: { xs: 24, sm: 30 }, fontWeight: "bold", mb: 2, mt: 5 }}
        >
          Dividendų apmokestinimas Baltijos šalyse
        </Typography>
        <Typography variant="body1">
          Baltijos šalys taiko skirtingus dividendų apmokestinimo modelius. Estijoje ir Latvijoje pelnas
          apmokestinamas tik paskirstymo momentu vienu mokesčiu, o Lietuvoje taikomas dviejų lygių
          apmokestinimas:
        </Typography>

        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{ borderRadius: 2, overflow: "hidden", mt: 3, mb: 3 }}
        >
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: "#f5f5f5" }}>
                <TableCell sx={{ fontWeight: "bold" }}>Šalis</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>Pelno mokestis</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>GPM nuo dividendų</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>Bendra našta</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>🇱🇹 Lietuva</TableCell>
                <TableCell>17%</TableCell>
                <TableCell>15%</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>~29,5%</TableCell>
              </TableRow>
              <TableRow sx={{ bgcolor: "#fafafa" }}>
                <TableCell>🇪🇪 Estija</TableCell>
                <TableCell>22%</TableCell>
                <TableCell>0%</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>22%</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>🇱🇻 Latvija</TableCell>
                <TableCell>20%</TableCell>
                <TableCell>0%</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>20%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>

        <Typography variant="body2" sx={{ color: "#666", fontStyle: "italic" }}>
          * Lentelėje nurodyti standartiniai tarifai. Estijoje ir Latvijoje pelno mokestis taikomas tik
          paskirstant pelną. Tikslūs tarifai gali skirtis priklausomai nuo įmonės tipo ir lengvatų.
        </Typography>

        <Typography variant="body2" sx={{ color: "#666", fontStyle: "italic", mt: 1 }}>
          Skaičiuoklė skirta informaciniams tikslams. Mokesčių klausimais rekomenduojame konsultuotis su
          mokesčių specialistu. Šaltinis: VMI, PMĮ, GPMĮ.
        </Typography>
      </Paper>

      {/* ═══════════ APSKAITA SECTION ═══════════ */}
      <Container maxWidth="md" sx={{ mt: 8 }}>
        <Typography
          variant="h2"
          sx={{
            fontSize: { xs: "20px", sm: "26px" },
            fontFamily: "Helvetica",
            fontWeight: "bold",
            color: "#000",
            mb: 2,
          }}
        >
          Automatizuokite sąskaitų suvedimą
        </Typography>

        <Typography sx={{ fontSize: "16px", fontFamily: "Helvetica", color: "#000", mb: 2, lineHeight: 1.7 }}>
          Kasdien gaunate sąskaitas faktūras, kurias reikia suvesti rankiniu būdu? <b>DokSkenas</b> —
          dokumentų automatizavimo platforma, kuri per kelias sekundes nuskaito sąskaitą, atpažįsta sumas,
          PVM tarifus ir nuolaidas, patikrina kontrahentų duomenis bei paruošia failą tiesioginiam
          importui į jūsų apskaitos programą.
        </Typography>

        <Typography sx={{ fontSize: "16px", fontFamily: "Helvetica", color: "#000", mb: 2 }}>
          Palaikomos apskaitos programos:
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 0.5,
            maxWidth: 500,
          }}
        >
          {[
            { name: "Finvalda", href: null },
            { name: "Rivilė GAMA", href: "https://atlyginimoskaiciuokle.com/rivile" },
            { name: "Rivilė ERP", href: "https://atlyginimoskaiciuokle.com/rivile" },
            { name: "Agnum", href: "https://atlyginimoskaiciuokle.com/agnum" },
            { name: "Centas", href: "https://atlyginimoskaiciuokle.com/centas" },
            { name: "Apskaita5", href: "https://atlyginimoskaiciuokle.com/apskaita5" },
            { name: "Pragma 3.2", href: null },
            { name: "Pragma 4", href: null },
            { name: "Būtenta", href: null },
            { name: "Site.pro", href: "https://atlyginimoskaiciuokle.com/site-pro" },
            { name: "Debetas", href: null },
            { name: "APSA", href: "https://atlyginimoskaiciuokle.com/apsa" },
            { name: "Paulita", href: null },
            { name: "Optimum", href: null },
            { name: "Dineta", href: null },
            { name: "iSAF", href: null },
          ].map((item) => (
            <Box key={item.name} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.3 }}>
              <Box
                sx={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#333", flexShrink: 0 }}
              />
              {item.href ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "#003366",
                    fontSize: "15px",
                    fontFamily: "Helvetica",
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  {item.name}
                </a>
              ) : (
                <Typography sx={{ color: "#000", fontSize: "15px", fontFamily: "Helvetica" }}>
                  {item.name}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      </Container>

      {/* Video dialog */}
      <Dialog open={videoOpen} onClose={() => setVideoOpen(false)} maxWidth="md" fullWidth>
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
    </Container>
  );
};

export default DividenduSkaiciuokle;