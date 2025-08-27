import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from "react-router-dom";
import { publicApi } from "../api/endpoints"; // axios instance

import {
  Table, TableBody, TableCell, TableContainer, TableRow, Grid2, Container, FormControl,
  FormLabel, RadioGroup, FormControlLabel, Radio, TextField, Select, MenuItem, Typography,
  Box, Paper, Button, Dialog, DialogContent, Stack
} from "@mui/material";
import PlayCircleIcon from '@mui/icons-material/PlayCircle';

/**
 * Atlyginimo skaičiuoklė 2026
 *
 * ✅ Nauja: progresinis GPM (20% / 25% / 32%) pagal 36/60 VDU ribas.
 * ✅ NPD taikomas tik iki 2 562,49 € bruto per mėnesį (standartiniam NPD).
 * ✅ VSD 12,52% su metinėmis lubomis (apytiksliai taikome mėnesinę ribą: 5×VDU).
 * ✅ PSD 6,98% be lubų. Papildoma pensija: 0% arba 3%.
 *
 * Pastabos:
 * - VDU 2026 m. naudojamas: 2 304.50 € (pagal pateiktą informaciją).
 * - GPM laipteliai čia taikomi mėnesio pjūviu (3×VDU ir 5×VDU). Teisiškai tai metinės ribos;
 *   šioje skaičiuoklėje naudojamas mėnesinis aproksimavimas.
 * - NPD formulė kaip 2025 m., bet su „cutoff": jeigu bruto > 2 562,49 €, NPD = 0 (standartiniam NPD).
 */

const VDU_2026 = 2304.50; // €
const T1_MONTHLY = 3 * VDU_2026; // 36 VDU per metus / 12 = 3 VDU per mėn. => 6 913.50 €
const T2_MONTHLY = 5 * VDU_2026; // 60 VDU per metus / 12 = 5 VDU per mėn. => 11 522.50 €

const GPM_RATE_1 = 0.20; // iki T1
const GPM_RATE_2 = 0.25; // tarp T1 ir T2
const GPM_RATE_3 = 0.32; // virš T2

const PSD_RATE = 0.0698; // 6.98%
const VSD_RATE = 0.1252; // 12.52%
const EMPLOYER_RATE = 0.0177; // 1.77%

// VSD lubų aproksimacija: mėnesio lubos = 5×VDU (metinės 60×VDU)
const VSD_MONTHLY_CAP_BASE = T2_MONTHLY;

const AtlyginimoSkaiciuokle2026 = () => {
  const [salary, setSalary] = useState("");
  const [npdType, setNpdType] = useState("standard");
  const [pension, setPension] = useState("none"); // "none" | "3"
  const [salaryType, setSalaryType] = useState("gross"); // "gross" | "net"
  const [videoOpen, setVideoOpen] = useState(false);

  const handleSalaryChange = (event) => {
    let value = event.target.value;
    if (value === "") {
      setSalary("");
      return;
    }
    let numericValue = Number(value);
    if (!isNaN(numericValue)) {
      setSalary(numericValue);
    }
  };

  /**
   * 2026 NPD (standartinis): taikomas tik, kai bruto ≤ 2 562,49 €.
   * Naudojame 2025 formules (pagal jūsų 2025 kodo logiką),
   * bet su cutoff riba. Specialiems darbingumo atvejams – fiksuotos reikšmės.
   */
  const calculateNPD = (grossSalary) => {
    if (!grossSalary) return 0;

    if (npdType === "0-25") return 1127; // fiksuotas
    if (npdType === "30-55") return 1057; // fiksuotas
    if (npdType === "none") return 0;

    // Standartinis NPD su cutoff
    const CUTOFF = 2562.49;
    if (grossSalary > CUTOFF) return 0;

    // 2025 formulių perėmimas (kaip jūsų esamoje skaičiuoklėje):
    if (grossSalary <= 1038) return 747;
    if (grossSalary > 1038 && grossSalary <= 2387.29)
      return Math.max(747 - 0.49 * (grossSalary - 1038), 0);
    return Math.max(400 - 0.18 * (grossSalary - 642), 0);
  };

  /**
   * PSD skaičiuojamas nuo viso bruto.
   * VSD skaičiuojamas tik iki lubų (mėnesinis aproksimavimas: 5×VDU).
   * Papildoma pensija (3%) – nuo viso bruto.
   */
  const calcContributions = (gross) => {
    if (gross <= 0) return { vsd: 0, psd: 0, pensionExtra: 0, employeeTotal: 0 };
    const vsdBase = Math.min(gross, VSD_MONTHLY_CAP_BASE);
    const vsd = vsdBase * VSD_RATE;
    const psd = gross * PSD_RATE;
    const pensionExtra = pension === "3" ? gross * 0.03 : 0;
    return { vsd, psd, pensionExtra, employeeTotal: vsd + psd + pensionExtra };
  };

  /**
   * Progresinis GPM – taikomas apmokestinamoms pajamoms (bruto - NPD) mėnesio pjūviu.
   */
  const calcIncomeTax = (gross) => {
    if (gross <= 0) return { gpm: 0, npd: 0 };
    const npd = calculateNPD(gross);
    const taxable = Math.max(gross - npd, 0);

    const part1 = Math.min(taxable, T1_MONTHLY);
    const part2 = Math.min(Math.max(taxable - T1_MONTHLY, 0), T2_MONTHLY - T1_MONTHLY);
    const part3 = Math.max(taxable - T2_MONTHLY, 0);

    const gpm = part1 * GPM_RATE_1 + part2 * GPM_RATE_2 + part3 * GPM_RATE_3;
    return { gpm, npd };
  };

  /**
   * Neto iš bruto – naudodami 2026 taisykles (progresinis GPM, VSD lubos, PSD, pensija).
   */
  const netFromGross = (gross) => {
    if (gross <= 0) return 0;
    const { gpm } = calcIncomeTax(gross);
    const { employeeTotal } = calcContributions(gross);
    return gross - gpm - employeeTotal;
  };

  /**
   * Bruto iš neto (dvejetainė paieška). Viršutinę ribą parenkame konservatyviai.
   */
  const getGrossFromNet = (netSalary) => {
    const upperGuess = netSalary / (1 - (GPM_RATE_3) - (PSD_RATE + VSD_RATE + (pension === "3" ? 0.03 : 0)));
    let low = netSalary > 0 ? Math.max(0, netSalary * 0.5) : 0;
    let high = Math.max(netSalary, upperGuess);
    let mid = 0;

    for (let i = 0; i < 60; i++) {
      mid = (low + high) / 2;
      const computed = netFromGross(mid);
      if (computed > netSalary) {
        high = mid;
      } else {
        low = mid;
      }
    }
    return mid;
  };

  const grossSalary = salary ? (salaryType === "gross" ? salary : getGrossFromNet(salary)) : 0;
  const { gpm: incomeTax, npd } = calcIncomeTax(grossSalary);
  const { vsd, psd, pensionExtra, employeeTotal: socialInsurance } = calcContributions(grossSalary);

  const netSalary = grossSalary - incomeTax - socialInsurance;

  const employerContribution = grossSalary > 0 ? grossSalary * EMPLOYER_RATE : 0;
  const totalCost = grossSalary + employerContribution;

  // Reusable ad block (tas pats kaip 2025)
  const DokskenAd = ({ sx }) => {
    const nav = useNavigate();
    const handleClick = (adName) => {
      publicApi.post("/api/track-click/", { ad_name: adName })
        .catch(err => console.error("Tracking error:", err));
    };
    return (
      <Box
        sx={{
          mt: 4,
          p: 3,
          borderRadius: 2,
          backgroundColor: "#f2f2f2",
          border: "1px solid #3a3a3a",
          ...sx,
        }}
      >
        <Stack direction="row" spacing={3} alignItems="center">
          <Box sx={{ flex: 1 }}>
            <Typography
              sx={{
                color: "#404040",
                fontSize: { xs: "22px", sm: "26px" },
                fontWeight: 700,
                mb: 1,
              }}
            >
              Gaištate krūvą laiko apskaitai? Automatizuokite apskaitą su DI!
            </Typography>

            <Box
              component="ol"
              sx={{
                pl: 3,
                m: 0,
                color: "#404040",
                fontFamily: "Helvetica",
                listStyleType: "decimal",
                "& > li": {
                  marginBottom: "6px",
                },
              }}
            >
              <li>Įkelkite sąskaitas į DokSkeną</li>
              <li>Palaukite, kol nuskaitys duomenis</li>
              <li>
                Įkelkite failus į savo buhalterinę programą (Rivilę, Finvaldą,
                Centą...)
              </li>
            </Box>

            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              sx={{ mt: 2 }}
            >
              <Button
                variant="contained"
                href="/saskaitu-skaitmenizavimas-dokskenas"
                onClick={() => handleClick("AS_suzinoti_daugiau")}
                sx={{
                  borderRadius: 1,
                  fontWeight: 300,
                  color: "#1b1b1b",
                  backgroundColor: "#f5be09",
                }}
              >
                Sužinoti daugiau
              </Button>
              <Button
                startIcon={<PlayCircleIcon />}
                variant="outlined"
                onClick={() => setVideoOpen(true)}
                sx={{
                  borderColor: "black",
                  color: "black",
                  "&:hover": { backgroundColor: "#fff6d8", color: "black" },
                }}
              >
                Žiūrėti video
              </Button>
            </Stack>
          </Box>

          <Box
            component="img"
            src="/DokSkenas_square.jpg"
            alt="DokSkenas"
            onClick={() => nav("/saskaitu-skaitmenizavimas-dokskenas")}
            sx={{
              display: { xs: "none", md: "block" },
              width: "180px",
              height: "auto",
              borderRadius: 2,
              cursor: "pointer",
              "&:hover": { opacity: 0.9 },
            }}
          />
        </Stack>
      </Box>
    );
  };

  return (
    <Container maxWidth="lg" sx={{ marginBottom: '100px' }}>
      <Helmet>
        <title>Atlyginimo Skaičiuoklė 2026 metų - pagal naujausius mokesčių pakeitimus</title>
        <meta name="description" content="Patogiai apskaičiuokite savo 2026 m. atlyginimą į rankas arba ant popieriaus. Skaičiuoklė atnaujinta pagal 2026-01-01 GPM pakeitimus (progresiniai tarifai)." />
      </Helmet>

      <Paper sx={{ p: 3, mt: 3, backgroundColor: '#212121', borderRadius: 3, minHeight: '600px' }}>
        <Typography
          variant="h1"
          sx={{
            color: '#d2cbc6',
            marginBottom: 3,
            fontSize: { xs: '24px', sm: '30px' },
            fontFamily: 'Helvetica',
            fontWeight: 'bold',
            letterSpacing: 0.05,
          }}
        >
          Atlyginimo skaičiuoklė 2026
        </Typography>

        <Grid2 container sx={{
          flexWrap: { md: 'nowrap' },
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          justifyContent: 'space-between',
          alignItems: 'start',
        }}>
          <Grid2 sx={{ maxWidth: { md: '50%' } }}>
            <FormControl component="fieldset" fullWidth>
              <FormLabel component="legend" sx={{ color: '#d2cbc6' }}>Atlyginimo tipas</FormLabel>
              <RadioGroup row value={salaryType} onChange={(e) => setSalaryType(e.target.value)}>
                <FormControlLabel
                  sx={{ color: '#d2cbc6' }}
                  value="gross"
                  control={
                    <Radio
                      sx={{
                        color: '#d2cbc6',
                        '&.Mui-checked': { color: '#d2cbc6' },
                        '&:hover': { backgroundColor: 'transparent' },
                      }}
                    />
                  }
                  label="Ant popieriaus"
                />
                <FormControlLabel
                  sx={{ color: '#d2cbc6' }}
                  value="net"
                  control={
                    <Radio
                      sx={{
                        color: '#d2cbc6',
                        '&.Mui-checked': { color: '#d2cbc6' },
                        '&:hover': { backgroundColor: 'transparent' },
                      }}
                    />
                  }
                  label="Į rankas"
                />
              </RadioGroup>
            </FormControl>

            <FormControl fullWidth margin="normal">
              <FormLabel sx={{ color: '#d2cbc6', marginBottom: 1 }}>
                {salaryType === "gross" ? "Įveskite atlyginimą ant popieriaus (€)" : "Įveskite atlyginimą į rankas (€)"}
              </FormLabel>
              <TextField
                type="number"
                fullWidth
                value={salary}
                onChange={handleSalaryChange}
                variant="outlined"
                onWheel={(e) => e.target.blur()}
                sx={{
                  backgroundColor: '#FAFAFA',
                  borderRadius: 1,
                  '.MuiOutlinedInput-notchedOutline': { borderColor: '#555' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#888' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#d2cbc6' },
                }}
              />
            </FormControl>

            <FormControl fullWidth margin="normal">
              <FormLabel sx={{ color: '#d2cbc6' }}>NPD</FormLabel>
              <Select
                value={npdType}
                onChange={(e) => setNpdType(e.target.value)}
                sx={{
                  backgroundColor: '#FAFAFA',
                  borderRadius: 1,
                  '.MuiOutlinedInput-notchedOutline': { borderColor: '#555' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#888' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#d2cbc6' },
                }}
              >
                <MenuItem value="standard">Standartinis</MenuItem>
                <MenuItem value="none">Netaikomas</MenuItem>
                <MenuItem value="30-55">30-55% darbingumas</MenuItem>
                <MenuItem value="0-25">0-25% darbingumas</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth margin="normal" sx={{ backgroundColor: '#1e1e1e' }}>
              <FormLabel sx={{ color: '#d2cbc6' }}>Papildomas pensijos kaupimas (%)</FormLabel>
              <Select
                value={pension}
                onChange={(e) => setPension(e.target.value)}
                sx={{
                  backgroundColor: '#FAFAFA',
                  borderRadius: 1,
                  '.MuiOutlinedInput-notchedOutline': { borderColor: '#555' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#888' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#d2cbc6' },
                }}
              >
                <MenuItem value="none">Nekaupiu</MenuItem>
                <MenuItem value="3">3%</MenuItem>
              </Select>
            </FormControl>
          </Grid2>

          {/* AD: mobile */}
          <DokskenAd sx={{ display: { xs: 'block', md: 'none' } }} />

          <Grid2 sx={{ width: { md: '40%' } }}>
            <Typography
              sx={{
                color: '#d2cbc6',
                marginTop: 2,
                marginBottom: 2,
                fontSize: { xs: '20px', sm: '26px' },
                fontFamily: 'Helvetica',
                fontWeight: 'bold',
              }}
            >
              Paskaičiavimai
            </Typography>
            <TableContainer component={Paper} sx={{ mt: 2 }}>
              <Table>
                <TableBody>
                  <TableRow sx={{ backgroundColor: '#d2cbc6' }}>
                    <TableCell sx={{ fontSize: '16px', height: '50px' }}>
                      {salaryType === "gross" ? "Atlyginimas į rankas (€)" : "Atlyginimas ant popieriaus (€)"}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '16px' }}>
                      {salaryType === "gross" ? netSalary.toFixed(2) : grossSalary.toFixed(2)}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
                    <TableCell>Pritaikytas NPD (€)</TableCell>
                    <TableCell align="right">{npd.toFixed(2)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
                    <TableCell>Pajamų mokestis (GPM) (€)</TableCell>
                    <TableCell align="right">{incomeTax.toFixed(2)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
                    <TableCell>Socialinis draudimas ir pensija (€)</TableCell>
                    <TableCell align="right">{socialInsurance.toFixed(2)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: '#f1edeb' }}>
                    <TableCell>Bendra darbo vietos kaina (€)</TableCell>
                    <TableCell align="right">{totalCost.toFixed(2)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
                    <TableCell>Darbdavio soc. draudimo įmoka (€)</TableCell>
                    <TableCell align="right">{employerContribution.toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>

            {/* Optional: parodyti skaidymą į PSD/VSD/pensija */}
            <Box sx={{ mt: 1, color: '#777', fontSize: '12px' }}>
              <div>Detalizacija: VSD {vsd.toFixed(2)} €, PSD {psd.toFixed(2)} €, papildoma pensija {pensionExtra.toFixed(2)} €</div>
              <div>GPM taikymo ribos (mėn.): iki {T1_MONTHLY.toFixed(2)} € → 20 %, {T1_MONTHLY.toFixed(2)}–{T2_MONTHLY.toFixed(2)} € → 25 %, virš {T2_MONTHLY.toFixed(2)} € → 32 %</div>
            </Box>
          </Grid2>
        </Grid2>

        {/* AD: desktop */}
        <DokskenAd sx={{ display: { xs: 'none', md: 'block' } }} />
      </Paper>

      {/* Info content */}
      <Container maxWidth="md" sx={{ mt: 8 }}>
        <Typography sx={{ lineHeight: 1.5, fontSize: '14px', letterSpacing: '0.1px', marginBottom: 3, fontFamily: 'Helvetica', fontStyle: 'italic' }}>
          Skaičiuoklė atnaujinta pagal 2026-01-01 GPM pakeitimus (progresiniai tarifai) ir NPD ribą iki 2 562,49 €.
        </Typography>

        <Typography sx={{ lineHeight: 1.5, fontSize: '16px', letterSpacing: '0.1px', marginBottom: 1, fontFamily: 'Helvetica' }}>
          Atlyginimo skaičiuoklė leis jums pasiskaičiuoti savo 2026 metų atlyginimą:
        </Typography>
        <Typography component="ul" sx={{ lineHeight: 1.5, fontSize: '16px', letterSpacing: '0.1px', marginTop: 3, marginBottom: 3, paddingLeft: 5, fontFamily: 'Helvetica' }}>
          <li style={{ marginBottom: '20px' }}>Žinant atlyginimą "ant popieriaus" – sužinosite atlyginimą "į rankas"</li>
          <li>Žinant atlyginimą "į rankas" – sužinosite atlyginimą "ant popieriaus"</li>
        </Typography>

        <Typography variant="h2" sx={{ marginTop: 5, marginBottom: 2, fontSize: { xs: '20px', sm: '26px' }, fontFamily: 'Helvetica', fontWeight: 'bold' }}>
          2026 m. pakeitimai, kuriuos įvertina skaičiuoklė
        </Typography>
        <Typography component="ul" sx={{ lineHeight: 1.5, fontSize: '16px', letterSpacing: '0.1px', marginTop: 3, marginBottom: 3, paddingLeft: 5, fontFamily: 'Helvetica' }}>
          <li style={{ marginBottom: '20px' }}><Box component="span" sx={{ fontWeight: 'bold' }}>Progresinis GPM</Box> – 20% iki 3×VDU, 25% tarp 3×VDU ir 5×VDU, 32% virš 5×VDU (mėnesio aproksimacija).</li>
          <li style={{ marginBottom: '20px' }}><Box component="span" sx={{ fontWeight: 'bold' }}>NPD (standartinis)</Box> – taikomas tik kai bruto ≤ 2 562,49 €. Virš šios ribos NPD netaikomas.</li>
          <li style={{ marginBottom: '20px' }}><Box component="span" sx={{ fontWeight: 'bold' }}>Socialinis draudimas</Box> – PSD 6,98% nuo viso bruto; VSD 12,52% iki lubų (5×VDU per mėn. aproksimacija); papildoma pensija 0% arba 3%.</li>
          <li><Box component="span" sx={{ fontWeight: 'bold' }}>Darbdavio įmoka</Box> – 1,77% nuo bruto; rodoma bendra darbo vietos kaina.</li>
        </Typography>

        <Typography sx={{ lineHeight: 1.5, fontSize: '16px', letterSpacing: '0.1px', marginBottom: 1, fontFamily: 'Helvetica' }}>
          Pastaba: oficiali MMA 2026 m. dar gali būti patikslinta; ši skaičiuoklė nenaudoja MMA tiesiogiai (išskyrus NPD formulę pagal 2025 m.), todėl rezultatai gali būti minimaliai pakoreguotini po galutinio patvirtinimo.
        </Typography>
      </Container>

      {/* Video dialog */}
      <Dialog open={videoOpen} onClose={() => setVideoOpen(false)} maxWidth="md" fullWidth>
        <DialogContent sx={{ p: 0 }}>
          <Box
            component="iframe"
            src="https://www.youtube.com/embed/falGn4_S_5Y?si=LFmb3RYZCG59JKF8"
            title="Demo Video"
            width="100%"
            height="600px"
            sx={{ border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </DialogContent>
      </Dialog>
    </Container>
  );
};

export default AtlyginimoSkaiciuokle2026;
