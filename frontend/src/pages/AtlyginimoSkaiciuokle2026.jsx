import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from "react-router-dom";
import { publicApi } from "../api/endpoints"; // axios instance

import {
  Table, TableBody, TableCell, TableContainer, TableRow, Grid as Grid2, Container, FormControl,
  FormLabel, RadioGroup, FormControlLabel, Radio, TextField, Select, MenuItem, Typography,
  Box, Paper, Button, Dialog, DialogContent, Stack
} from "@mui/material";
import PlayCircleIcon from '@mui/icons-material/PlayCircle';

/**
 * Atlyginimo skaičiuoklė 2026
 *
 * ✅ Progresinis GPM (20% / 25% / 32%) pagal 36/60 VDU ribas.
 * ✅ NPD taikomas tik iki 2 562,49 € bruto per mėnesį (standartiniam NPD).
 * ✅ VSD 12,52% su metinėmis lubomis (aproksimacija: 5×VDU per mėn.).
 * ✅ PSD 6,98% be lubų. Papildoma pensija: 0% arba 3% (rodoma atskirai).
 */

const VDU = 2304.5;   // VDU, kaip prašei (2025)
const MMA = 1153;

// GPM ribos
const T1_MONTHLY = 3 * VDU; // 36 VDU / 12
const T2_MONTHLY = 5 * VDU; // 60 VDU / 12
const T1_ANNUAL  = 36 * VDU;
const T2_ANNUAL  = 60 * VDU;

const GPM_RATE_1 = 0.20;
const GPM_RATE_2 = 0.25;
const GPM_RATE_3 = 0.32;

const PSD_RATE = 0.0698;
const VSD_RATE = 0.1252;
const EMPLOYER_RATE = 0.0177;

// VSD mėn. riba (aproksimacija)
const VSD_MONTHLY_CAP_BASE = T2_MONTHLY;

const AtlyginimoSkaiciuokle2026 = () => {
  const [salary, setSalary] = useState("");
  const [npdType, setNpdType] = useState("standard");
  const [pension, setPension] = useState("none"); // "none" | "3"
  const [salaryType, setSalaryType] = useState("gross"); // "gross" | "net"
  const [videoOpen, setVideoOpen] = useState(false);

  const handleSalaryChange = (event) => {
    let value = event.target.value;
    if (value === "") { setSalary(""); return; }
    const n = Number(value);
    if (!Number.isNaN(n)) setSalary(n);
  };

  // NPD 2026
  const calculateNPD = (gross) => {
    if (!gross) return 0;
    if (npdType === "0-25") return 1127;
    if (npdType === "30-55") return 1057;
    if (npdType === "none") return 0;

    const CUTOFF = 2562.49;
    if (gross > CUTOFF) return 0;

    if (gross <= MMA) return 747;
    if (gross <= 2387.29) return Math.max(747 - 0.49 * (gross - MMA), 0);
    return Math.max(400 - 0.18 * (gross - 642), 0);
  };

  // Įmokos (mėnesiui)
  const calcContributions = (gross) => {
    if (gross <= 0) return { vsd12: 0, psd: 0, pensija: 0, employeeTotal: 0 };
    const vsdBase = Math.min(gross, VSD_MONTHLY_CAP_BASE);
    const vsd12 = vsdBase * VSD_RATE;           // VSD 12.52% su lubomis
    const psd = gross * PSD_RATE;               // PSD be lubų
    const pensija = pension === "3" ? gross * 0.03 : 0; // 3% be lubų
    return { vsd12, psd, pensija, employeeTotal: vsd12 + psd + pensija };
  };

  // GPM (mėnesio dalys — ta pati logika kaip viršuje santraukoje)
  const calcIncomeTax = (gross) => {
    if (gross <= 0) return { gpm: 0, npd: 0, parts: {p1:0,p2:0,p3:0}, gpmParts:{g1:0,g2:0,g3:0} };
    const npd = calculateNPD(gross);
    const taxable = Math.max(gross - npd, 0);

    const p1 = Math.min(taxable, T1_MONTHLY);
    const p2 = Math.min(Math.max(taxable - T1_MONTHLY, 0), T2_MONTHLY - T1_MONTHLY);
    const p3 = Math.max(taxable - T2_MONTHLY, 0);

    const g1 = p1 * GPM_RATE_1;
    const g2 = p2 * GPM_RATE_2;
    const g3 = p3 * GPM_RATE_3;
    const gpm = g1 + g2 + g3;

    return { gpm, npd, parts: { p1, p2, p3 }, gpmParts: { g1, g2, g3 } };
  };

  const netFromGross = (gross) => {
    if (gross <= 0) return 0;
    const { gpm } = calcIncomeTax(gross);
    const { employeeTotal } = calcContributions(gross);
    return gross - gpm - employeeTotal;
  };

  const getGrossFromNet = (netSalary) => {
    const worstTax = GPM_RATE_3 + PSD_RATE + VSD_RATE + (pension === "3" ? 0.03 : 0);
    const upperGuess = netSalary > 0 ? netSalary / (1 - worstTax) : 0;
    let lo = 0, hi = Math.max(netSalary, upperGuess), mid = 0;
    for (let i = 0; i < 60; i++) {
      mid = (lo + hi) / 2;
      (netFromGross(mid) > netSalary) ? (hi = mid) : (lo = mid);
    }
    return mid;
  };

  const grossSalary = salary ? (salaryType === "gross" ? salary : getGrossFromNet(salary)) : 0;

  // Gauti ir parts
  const { gpm: incomeTax, npd, gpmParts, parts } = calcIncomeTax(grossSalary);
  const { vsd12, psd, pensija, employeeTotal: socialInsurance } = calcContributions(grossSalary);
  const netSalary = grossSalary - incomeTax - socialInsurance;

  const employerContribution = grossSalary > 0 ? grossSalary * EMPLOYER_RATE : 0;
  const totalCost = grossSalary + employerContribution;

  const DokskenAd = ({ sx }) => {
    const nav = useNavigate();
    const handleClick = (adName) => {
      publicApi.post("/api/track-click/", { ad_name: adName }).catch(() => {});
    };
    return (
      <Box sx={{ mt: 4, p: 3, borderRadius: 2, backgroundColor: "#f2f2f2", border: "1px solid #3a3a3a", ...sx }}>
        <Stack direction="row" spacing={3} alignItems="center">
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ color: "#404040", fontSize: { xs: "22px", sm: "26px" }, fontWeight: 700, mb: 1 }}>
              Gaištate krūvą laiko apskaitai? Automatizuokite apskaitą su DI!
            </Typography>
            <Box component="ol" sx={{ pl: 3, m: 0, color: "#404040", fontFamily: "Helvetica", listStyleType: "decimal", "& > li": { mb: "6px" } }}>
              <li>Įkelkite sąskaitas į DokSkeną</li>
              <li>Palaukite, kol nuskaitys duomenis</li>
              <li>Įkelkite failus į savo buhalterinę programą (Rivilę, Finvaldą, Centą...)</li>
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 2 }}>
              <Button variant="contained" href="/saskaitu-skaitmenizavimas-dokskenas" onClick={() => handleClick("AS_suzinoti_daugiau")}
                sx={{ borderRadius: 1, fontWeight: 300, color: "#1b1b1b", backgroundColor: "#f5be09" }}>Sužinoti daugiau</Button>
              <Button startIcon={<PlayCircleIcon />} variant="outlined" onClick={() => setVideoOpen(true)}
                sx={{ borderColor: "black", color: "black", "&:hover": { backgroundColor: "#fff6d8", color: "black" } }}>Žiūrėti video</Button>
            </Stack>
          </Box>
          <Box component="img" src="/DokSkenas_square.jpg" alt="DokSkenas" onClick={() => nav("/saskaitu-skaitmenizavimas-dokskenas")}
            sx={{ display: { xs: "none", md: "block" }, width: "180px", height: "auto", borderRadius: 2, cursor: "pointer", "&:hover": { opacity: 0.9 } }} />
        </Stack>
      </Box>
    );
  };

  return (
    <Container sx={{maxWidth:'2000px', marginBottom: '100px' }}>
      <Helmet>
        <title>Atlyginimo Skaičiuoklė 2026 metų (Progresinis GPM)</title>
        <meta name="description" content="Apskaičiuokite, kiek uždirbsite 2026 metais, pritaikius progresinį GPM ir kitus mokesčių pakeitimus." />
      </Helmet>

      <Paper sx={{ p: 3, mt: 3, backgroundColor: '#212121', borderRadius: 3, minHeight: '600px' }}>
        <Typography
          variant="h1"
          sx={{
            color: '#d2cbc6',
            mb: 3,
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
                  control={<Radio sx={{ color: '#d2cbc6', '&.Mui-checked': { color: '#d2cbc6' } }} />}
                  label="Ant popieriaus"
                />
                <FormControlLabel
                  sx={{ color: '#d2cbc6' }}
                  value="net"
                  control={<Radio sx={{ color: '#d2cbc6', '&.Mui-checked': { color: '#d2cbc6' } }} />}
                  label="Į rankas"
                />
              </RadioGroup>
            </FormControl>

            <FormControl fullWidth margin="normal">
              <FormLabel sx={{ color: '#d2cbc6', mb: 1 }}>
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
                mt: 2,
                mb: 2,
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
                    <TableCell>Neapmokestinamasis pajamų dydis (NPD) (€)</TableCell>
                    <TableCell align="right">{npd.toFixed(2)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
                    <TableCell>Gyventojų pajamų mokestis (GPM) (€)</TableCell>
                    <TableCell align="right">{incomeTax.toFixed(2)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
                    <TableCell>Socialinis draudimas (VSD + PSD) ir pensija (€)</TableCell>
                    <TableCell align="right">{(vsd12 + psd + pensija).toFixed(2)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: '#f1edeb' }}>
                    <TableCell>Bendra darbo vietos kaina (€)</TableCell>
                    <TableCell align="right">{totalCost.toFixed(2)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
                    <TableCell>Darbdavio soc. draudimo įmoka (€)</TableCell>
                    <TableCell align="right">{(employerContribution).toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>

            <Box sx={{ mt: 1, color: '#777', fontSize: '12px' }}>
              <div>Žemiau esanti detalizacija parodo, kokia suma apmokestinta 20% / 25% / 32%.</div>
            </Box>
          </Grid2>
        </Grid2>

        {/* AD: desktop */}
        <DokskenAd sx={{ display: { xs: 'none', md: 'block' } }} />

        {/* --- DETALUS PASKAIČIAVIMAS (už 1 mėn.) --- */}
        <Box sx={{ mt: 6 }}>
          <Typography sx={{ fontWeight: 'bold', fontSize: { xs: '20px', sm: '26px' }, mb: 2, color: '#d2cbc6' }}>
            Detaliai
          </Typography>
          <DetailedBreakdownTable
            monthlyGross={grossSalary}
            npdType={npdType}
            pension={pension}
            npd={npd}
            gpmParts={gpmParts}
            parts={parts}
            gpmTotal={incomeTax}
            vsd12={vsd12}
            psd={psd}
            pensija={pensija}
            netSalary={netSalary}
          />
        </Box>
      </Paper>

      {/* Informacinis blokas su lentele ir tekstu */}
      <TaxInfo2026 />

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

/** ---------------- Detalus paskaičiavimas (vertikali lentelė) ---------------- */
function DetailedBreakdownTable({
  monthlyGross,
  npdType,
  pension,
  npd,
  gpmParts,   // { g1, g2, g3 }
  parts,      // { p1, p2, p3 }
  gpmTotal,
  vsd12,
  psd,
  pensija,
  netSalary,
}) {
  const fmt = (x) => (Number.isFinite(x) ? x.toFixed(2) : "0.00");

  // GPM (%) tekstas
  const gpmPercents = [
    gpmParts.g1 > 0 ? "20%" : null,
    gpmParts.g2 > 0 ? "25%" : null,
    gpmParts.g3 > 0 ? "32%" : null,
  ].filter(Boolean).join(" + ") || "0%";

  const vsdPercentText = "12.52%"; // VSD procentas (papildoma pensija atskirai)
  const psdPercentText = "6.98%";
  const pensPercentText = pension === "3" ? "3%" : "0%";

  return (
    <TableContainer component={Paper} sx={{ maxWidth: 600 }}>
      <Table>
        <TableBody>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>Atlyginimas Bruto ("Ant popieriaus")</TableCell>
            <TableCell align="right">{fmt(monthlyGross)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>NPD (EUR)</TableCell>
            <TableCell align="right">{fmt(npd)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>GPM (%)</TableCell>
            <TableCell align="right">{gpmPercents}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>GPM (EUR)</TableCell>
            <TableCell align="right">
              {fmt(gpmTotal)}
              <Box sx={{ fontSize: '12px', color: '#555', textAlign: 'right', mt: 1 }}>
                {gpmParts.g1 > 0 && (
                  <div>20% nuo {fmt(parts.p1)} € → {fmt(gpmParts.g1)} €</div>
                )}
                {gpmParts.g2 > 0 && (
                  <div>25% nuo {fmt(parts.p2)} € → {fmt(gpmParts.g2)} €</div>
                )}
                {gpmParts.g3 > 0 && (
                  <div>32% nuo {fmt(parts.p3)} € → {fmt(gpmParts.g3)} €</div>
                )}
              </Box>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>VSD (%)</TableCell>
            <TableCell align="right">{vsdPercentText}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>VSD (EUR)</TableCell>
            <TableCell align="right">{fmt(vsd12)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>PSD (%)</TableCell>
            <TableCell align="right">{psdPercentText}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>PSD (EUR)</TableCell>
            <TableCell align="right">{fmt(psd)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>Papildoma pensija (%)</TableCell>
            <TableCell align="right">{pensPercentText}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>Papildoma pensija (EUR)</TableCell>
            <TableCell align="right">{fmt(pensija)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#EFE9E6' }}>
              Atlyginimas Neto (į rankas)
            </TableCell>
            <TableCell align="right" sx={{ backgroundColor: '#EFE9E6', fontWeight: 'bold' }}>
              {fmt(netSalary)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/** ----------------- Informacinis blokas su lentele ir tekstu ----------------- */
function TaxInfo2026() {
  const fmt2 = (n) =>
    (Number.isFinite(n) ? n : 0).toLocaleString("lt-LT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <Container maxWidth="md" sx={{ mt: 8 }}>
      {/* Pastaba */}
      <Typography
        sx={{
          lineHeight: 1.6,
          fontSize: "14px",
          letterSpacing: "0.1px",
          mb: 3,
          fontFamily: "Helvetica",
          fontStyle: "italic",
        }}
      >
        <b>PASTABA:</b> Šioje skaičiuoklėje naudojame 2026 metų MMA ir VDU reikšmes –{" "}
        <b>MMA: 1153 €</b>, <b>VDU: 2304,5 €</b>.
      </Typography>

      {/* H2 – Atlyginimo mokesčių lentelė 2026 */}
      <Typography
        variant="h2"
        sx={{
          mt: 5,
          mb: 2,
          fontSize: { xs: "20px", sm: "26px" },
          fontFamily: "Helvetica",
          fontWeight: "bold",
          color: "#000",
        }}
      >
        Atlyginimo mokesčių lentelė 2026
      </Typography>

      {/* LENTELĖ – Metinės pajamų dalys (su PSD stulpeliu) */}
      <TableContainer component={Paper} sx={{ mb: 4 }}>
        <Table>
          <TableBody>
            <TableRow sx={{ backgroundColor: "#EFE9E6" }}>
              <TableCell sx={{ fontWeight: "bold" }}>Metinės pajamų dalys</TableCell>
              <TableCell sx={{ fontWeight: "bold" }} align="right">
                Metinės pajamos (€)
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }} align="right">
                GPM tarifas
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }} align="right">
                VSD tarifas
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }} align="right">
                PSD tarifas
              </TableCell>
            </TableRow>

            <TableRow>
              <TableCell>Iki 36 VDU</TableCell>
              <TableCell align="right">iki {fmt2(T1_ANNUAL)}</TableCell>
              <TableCell align="right">20%</TableCell>
              <TableCell align="right">12.52%</TableCell>
              <TableCell align="right">6.98%</TableCell>
            </TableRow>

            <TableRow>
              <TableCell>Nuo 36 iki 60 VDU</TableCell>
              <TableCell align="right">
                {fmt2(T1_ANNUAL)} – {fmt2(T2_ANNUAL)}
              </TableCell>
              <TableCell align="right">25%</TableCell>
              <TableCell align="right">12.52%</TableCell>
              <TableCell align="right">6.98%</TableCell>
            </TableRow>

            <TableRow>
              <TableCell>Virš 60 VDU</TableCell>
              <TableCell align="right">virš {fmt2(T2_ANNUAL)}</TableCell>
              <TableCell align="right">32%</TableCell>
              <TableCell align="right">0%</TableCell>
              <TableCell align="right">6.98%</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      {/* H2 – 2026 metų mokesčių pakeitimai */}
      <Typography
        variant="h2"
        sx={{
          mt: 5,
          mb: 2,
          fontSize: { xs: "20px", sm: "26px" },
          fontFamily: "Helvetica",
          fontWeight: "bold",
          color: "#000",
        }}
      >
        2026 metų mokesčių pakeitimai
      </Typography>

      <Box sx={{ lineHeight: 1.7, fontSize: "16px", fontFamily: "Helvetica", color: "#000" }}>
        <Typography sx={{ mb: 1 }}>
          <b>- Gyventojų pajamų mokestis (GPM):</b> nuo 2026 metų sausio 1 dienos
          įvedami progresiniai GPM tarifai. Nuo šiol taikomi trys tarifai pagal metines pajamas:
        </Typography>
        <Box component="ul" sx={{ pl: 3, mb: 2 }}>
          <li>iki 36 vidutinių darbo užmokesčių (VDU) – <b>20 %</b></li>
          <li>tarp 36 ir 60 VDU – <b>25 %</b></li>
          <li>virš 60 VDU – <b>32 %</b></li>
        </Box>
        <Typography sx={{ mb: 5 }}>
          Tokiu būdu didesnes pajamas gaunantys asmenys moka didesnę GPM dalį,
          o mažesnes pajamas uždirbantys gyventojai išsaugo mažesnį mokestinį krūvį.
        </Typography>

        <Typography sx={{ mb: 5 }}>
          <b>- Neapmokestinamasis pajamų dydis (NPD):</b> 2026 m. NPD taikomas tik tada,
          kai mėnesio bruto (iki mokesčių) alga neviršija <b>2562,49 €</b>. Jeigu
          darbo užmokestis didesnis, NPD nebetaikomas.
        </Typography>

        <Typography sx={{ mb: 1 }}>
          <b>- Socialinis draudimas ir pensija:</b> išlieka dabartiniai tarifai:
        </Typography>
        <Box component="ul" sx={{ pl: 3, mb: 2 }}>
          <li>
            VSD (<b>12,52 %</b>) – turi lubas, skaičiuojamas iki 60 VDU metinių pajamų
            (skaičiuoklėje taikoma mėnesinė riba – <b>5×VDU</b>)
          </li>
          <li>PSD (<b>6,98 %</b>) – be lubų</li>
          <li>papildoma pensijų kaupimo įmoka – <b>0 %</b> arba <b>3 %</b> (priklausomai nuo pasirinkimo)</li>
        </Box>

        <Typography sx={{ mb: 5 }}>
          Darbdaviai, kaip ir anksčiau, moka <b>1,77 %</b> nuo bruto sumos, o skaičiuoklėje
          pateikiama bendra darbo vietos kaina.
        </Typography>

        {/* Pajamos, apmokestinamos progresiniu GPM */}
        <Typography
          variant="h2"
          sx={{
            mt: 4,
            mb: 2,
            fontSize: { xs: "20px", sm: "26px" },
            fontFamily: "Helvetica",
            fontWeight: "bold",
            color: "#000",
          }}
        >
          Pajamos, apmokestinamos progresiniu GPM (20%, 25% ir 32%)
        </Typography>
        <Box component="ul" sx={{ pl: 3, mb: 5 }}>
          <li>Darbo užmokestis ir su darbo santykiais susijusios pajamos</li>
          <li>Pajamos iš individualios veiklos pagal pažymą (dalis virš 42 500 € arba kai baigiasi lengvata)</li>
          <li>Tantjemos, atlygis už veiklą valdybose, stebėtojų tarybose, paskolų komitetuose</li>
          <li>Autoriniai atlyginimai iš darbdavio</li>
          <li>Mažosios bendrijos vadovo (kuris nėra narys) atlygis</li>
          <li>Metinė pajamų dalis iš veiklos su verslo liudijimu, viršijanti 50 000 €</li>
          <li>Metinė pajamų dalis ne iš darbo santykių (pvz., turto nuoma be verslo liudijimo), viršijanti 12 VDU</li>
          <li>Atliekų pardavimo pajamos (virš 12 VDU per metus)</li>
        </Box>

        {/* Pajamos, apmokestinamos 15% GPM */}
        <Typography
          variant="h2"
          sx={{
            mt: 4,
            mb: 2,
            fontSize: { xs: "20px", sm: "26px" },
            fontFamily: "Helvetica",
            fontWeight: "bold",
            color: "#000",
          }}
        >
          Pajamos, apmokestinamos fiksuotu 15% GPM
        </Typography>
        <Box component="ul" sx={{ pl: 3, mb: 5 }}>
          <li>Dividendai (paskirstytasis pelnas)</li>
          <li>Ligos, motinystės, vaiko priežiūros, ilgalaikio darbo išmokos</li>
          <li>Akcijų, dalių, pajų pardavimo pajamos, jei jie laikyti &gt;5 metus (ir ne per investicinę sąskaitą)</li>
          <li>Pasibaigus gyvybės draudimo sutarčiai grąžinamos įmokos (kurios buvo atimtos iš pajamų)</li>
          <li>Pensijų fondo išmokos (iki įmokų dydžio, kurios buvo atimamos iš pajamų)</li>
          <li>Investicinės sąskaitos išmokos, viršijančios įnašą</li>
          <li>Pasirinkimo sandorio (stock option) akcijų pardavimas, jei akcijos laikytos ≥3 metus</li>
        </Box>

        {/* Pajamos, neapmokestinamos GPM */}
        <Typography
          variant="h2"
          sx={{
            mt: 4,
            mb: 2,
            fontSize: { xs: "20px", sm: "26px" },
            fontFamily: "Helvetica",
            fontWeight: "bold",
            color: "#000",
          }}
        >
          Pajamos, neapmokestinamos GPM
        </Typography>
        <Box component="ul" sx={{ pl: 3, mb: 1 }}>
          <li>Neapmokestinamas NPD (iki 8 964 € per metus arba 747 € per mėn., priklausomai nuo pajamų dydžio)</li>
          <li>Gyvybės draudimo įmokos (tam tikromis sąlygomis)</li>
          <li>Papildomas (savanoriškas) sveikatos draudimas iki 350 € per metus</li>
          <li>Pensijų įmokos į pensijų fondą (iki 25% darbo užmokesčio per metus)</li>
          <li>Nekilnojamojo turto pardavimas, jei turtas išlaikytas &gt;5 m. (iki šiol buvo 10 m.)</li>
          <li>Stipendijos tyrėjams pagal trišales sutartis</li>
          <li>Pajamos už žemės ūkio paslaugas pagal kvitus, jei jos &lt; ¼ metinio NPD (iki 1 750 € per metus)</li>
          <li>Nuo 2026 m. – pensijų išmokos ir kitos pensijų fonduose sukaupto turto išmokos, gautos pagal PKĮ</li>
        </Box>
      </Box>
    </Container>
  );
}

export default AtlyginimoSkaiciuokle2026;













// import { useState } from 'react';
// import { Helmet } from 'react-helmet';
// import { useNavigate } from "react-router-dom";
// import { publicApi } from "../api/endpoints"; // axios instance

// import {
//   Table, TableBody, TableCell, TableContainer, TableRow, Grid2, Container, FormControl,
//   FormLabel, RadioGroup, FormControlLabel, Radio, TextField, Select, MenuItem, Typography,
//   Box, Paper, Button, Dialog, DialogContent, Stack
// } from "@mui/material";
// import PlayCircleIcon from '@mui/icons-material/PlayCircle';

// /**
//  * Atlyginimo skaičiuoklė 2026
//  *
//  * ✅ Nauja: progresinis GPM (20% / 25% / 32%) pagal 36/60 VDU ribas.
//  * ✅ NPD taikomas tik iki 2 562,49 € bruto per mėnesį (standartiniam NPD).
//  * ✅ VSD 12,52% su metinėmis lubomis (apytiksliai taikome mėnesinę ribą: 5×VDU).
//  * ✅ PSD 6,98% be lubų. Papildoma pensija: 0% arba 3%.
//  *
//  * Pastabos:
//  * - VDU 2026 m. naudojamas: 2 304.50 € (pagal pateiktą informaciją).
//  * - GPM laipteliai čia taikomi mėnesio pjūviu (3×VDU ir 5×VDU). Teisiškai tai metinės ribos;
//  *   šioje skaičiuoklėje naudojamas mėnesinis aproksimavimas.
//  * - NPD formulė kaip 2025 m., bet su „cutoff": jeigu bruto > 2 562,49 €, NPD = 0 (standartiniam NPD).
//  */

// // === Konfigūruojamos konstantos (pakeisk, kai patvirtins oficialiai) ===
// const VDU = 2304.50;     // 2026 projekcinis VDU (pakeisk, kai bus patvirtinta)
// const MMA = 1038;        // naudoti kaip 2025 (kol nėra oficialaus 2026 MMA)

// // GPM laiptelių ribos (mėnesio aproksimacija ir metinės ribos)
// const T1_MONTHLY = 3 * VDU; // 36 VDU / 12
// const T2_MONTHLY = 5 * VDU; // 60 VDU / 12
// const T1_ANNUAL  = 36 * VDU;
// const T2_ANNUAL  = 60 * VDU;

// const GPM_RATE_1 = 0.20; // iki T1
// const GPM_RATE_2 = 0.25; // tarp T1 ir T2
// const GPM_RATE_3 = 0.32; // virš T2

// const PSD_RATE = 0.0698; // 6.98%
// const VSD_RATE = 0.1252; // 12.52%
// const EMPLOYER_RATE = 0.0177; // 1.77%

// // VSD lubų aproksimacija: mėnesio lubos = 5×VDU (metinės 60×VDU)
// const VSD_MONTHLY_CAP_BASE = T2_MONTHLY;

// const AtlyginimoSkaiciuokle2026 = () => {
//   const [salary, setSalary] = useState("");
//   const [npdType, setNpdType] = useState("standard");
//   const [pension, setPension] = useState("none"); // "none" | "3"
//   const [salaryType, setSalaryType] = useState("gross"); // "gross" | "net"
//   const [videoOpen, setVideoOpen] = useState(false);

//   const handleSalaryChange = (event) => {
//     let value = event.target.value;
//     if (value === "") {
//       setSalary("");
//       return;
//     }
//     let numericValue = Number(value);
//     if (!isNaN(numericValue)) {
//       setSalary(numericValue);
//     }
//   };

//   /**
//    * 2026 NPD (standartinis): taikomas tik, kai bruto ≤ 2 562,49 €.
//    * Naudojame 2025 formules (pagal jūsų 2025 kodo logiką),
//    * bet su cutoff riba. Specialiems darbingumo atvejams – fiksuotos reikšmės.
//    */
//   const calculateNPD = (grossSalary) => {
//     if (!grossSalary) return 0;

//     if (npdType === "0-25") return 1127; // fiksuotas
//     if (npdType === "30-55") return 1057; // fiksuotas
//     if (npdType === "none") return 0;

//     // Standartinis NPD su cutoff
//     const CUTOFF = 2562.49;
//     if (grossSalary > CUTOFF) return 0;

//     // Formulė kaip 2025 m., bet ribas rišame prie MMA konstantos
//     if (grossSalary <= MMA) return 747;
//     if (grossSalary > MMA && grossSalary <= 2387.29)
//       return Math.max(747 - 0.49 * (grossSalary - MMA), 0);
//     return Math.max(400 - 0.18 * (grossSalary - 642), 0);
//   };

//   /**
//    * PSD skaičiuojamas nuo viso bruto.
//    * VSD skaičiuojamas tik iki lubų (mėnesinis aproksimavimas: 5×VDU).
//    * Papildoma pensija (3%) – nuo viso bruto.
//    */
//   const calcContributions = (gross) => {
//     if (gross <= 0) return { vsd: 0, psd: 0, pensionExtra: 0, employeeTotal: 0 };
//     const vsdBase = Math.min(gross, VSD_MONTHLY_CAP_BASE);
//     const vsd = vsdBase * VSD_RATE;
//     const psd = gross * PSD_RATE;
//     const pensionExtra = pension === "3" ? gross * 0.03 : 0;
//     return { vsd, psd, pensionExtra, employeeTotal: vsd + psd + pensionExtra };
//   };

//   /**
//    * Progresinis GPM – taikomas apmokestinamoms pajamoms (bruto - NPD) mėnesio pjūviu.
//    */
//   const calcIncomeTax = (gross) => {
//     if (gross <= 0) return { gpm: 0, npd: 0 };
//     const npd = calculateNPD(gross);
//     const taxable = Math.max(gross - npd, 0);

//     const part1 = Math.min(taxable, T1_MONTHLY);
//     const part2 = Math.min(Math.max(taxable - T1_MONTHLY, 0), T2_MONTHLY - T1_MONTHLY);
//     const part3 = Math.max(taxable - T2_MONTHLY, 0);

//     const gpm = part1 * GPM_RATE_1 + part2 * GPM_RATE_2 + part3 * GPM_RATE_3;
//     return { gpm, npd };
//   };

//   /**
//    * Neto iš bruto – naudodami 2026 taisykles (progresinis GPM, VSD lubos, PSD, pensija).
//    */
//   const netFromGross = (gross) => {
//     if (gross <= 0) return 0;
//     const { gpm } = calcIncomeTax(gross);
//     const { employeeTotal } = calcContributions(gross);
//     return gross - gpm - employeeTotal;
//   };

//   /**
//    * Bruto iš neto (dvejetainė paieška). Viršutinę ribą parenkame konservatyviai.
//    */
//   const getGrossFromNet = (netSalary) => {
//     const upperGuess = netSalary / (1 - (GPM_RATE_3) - (PSD_RATE + VSD_RATE + (pension === "3" ? 0.03 : 0)));
//     let low = netSalary > 0 ? Math.max(0, netSalary * 0.5) : 0;
//     let high = Math.max(netSalary, upperGuess);
//     let mid = 0;

//     for (let i = 0; i < 60; i++) {
//       mid = (low + high) / 2;
//       const computed = netFromGross(mid);
//       if (computed > netSalary) {
//         high = mid;
//       } else {
//         low = mid;
//       }
//     }
//     return mid;
//   };

//   const grossSalary = salary ? (salaryType === "gross" ? salary : getGrossFromNet(salary)) : 0;
//   const { gpm: incomeTax, npd } = calcIncomeTax(grossSalary);
//   const { vsd, psd, pensionExtra, employeeTotal: socialInsurance } = calcContributions(grossSalary);

//   const netSalary = grossSalary - incomeTax - socialInsurance;

//   const employerContribution = grossSalary > 0 ? grossSalary * EMPLOYER_RATE : 0;
//   const totalCost = grossSalary + employerContribution;

//   // Reusable ad block (tas pats kaip 2025)
//   const DokskenAd = ({ sx }) => {
//     const nav = useNavigate();
//     const handleClick = (adName) => {
//       publicApi.post("/api/track-click/", { ad_name: adName })
//         .catch(err => console.error("Tracking error:", err));
//     };
//     return (
//       <Box
//         sx={{
//           mt: 4,
//           p: 3,
//           borderRadius: 2,
//           backgroundColor: "#f2f2f2",
//           border: "1px solid #3a3a3a",
//           ...sx,
//         }}
//       >
//         <Stack direction="row" spacing={3} alignItems="center">
//           <Box sx={{ flex: 1 }}>
//             <Typography
//               sx={{
//                 color: "#404040",
//                 fontSize: { xs: "22px", sm: "26px" },
//                 fontWeight: 700,
//                 mb: 1,
//               }}
//             >
//               Gaištate krūvą laiko apskaitai? Automatizuokite apskaitą su DI!
//             </Typography>

//             <Box
//               component="ol"
//               sx={{
//                 pl: 3,
//                 m: 0,
//                 color: "#404040",
//                 fontFamily: "Helvetica",
//                 listStyleType: "decimal",
//                 "& > li": {
//                   marginBottom: "6px",
//                 },
//               }}
//             >
//               <li>Įkelkite sąskaitas į DokSkeną</li>
//               <li>Palaukite, kol nuskaitys duomenis</li>
//               <li>
//                 Įkelkite failus į savo buhalterinę programą (Rivilę, Finvaldą,
//                 Centą...)
//               </li>
//             </Box>

//             <Stack
//               direction={{ xs: "column", sm: "row" }}
//               spacing={2}
//               sx={{ mt: 2 }}
//             >
//               <Button
//                 variant="contained"
//                 href="/saskaitu-skaitmenizavimas-dokskenas"
//                 onClick={() => handleClick("AS_suzinoti_daugiau")}
//                 sx={{
//                   borderRadius: 1,
//                   fontWeight: 300,
//                   color: "#1b1b1b",
//                   backgroundColor: "#f5be09",
//                 }}
//               >
//                 Sužinoti daugiau
//               </Button>
//               <Button
//                 startIcon={<PlayCircleIcon />}
//                 variant="outlined"
//                 onClick={() => setVideoOpen(true)}
//                 sx={{
//                   borderColor: "black",
//                   color: "black",
//                   "&:hover": { backgroundColor: "#fff6d8", color: "black" },
//                 }}
//               >
//                 Žiūrėti video
//               </Button>
//             </Stack>
//           </Box>

//           <Box
//             component="img"
//             src="/DokSkenas_square.jpg"
//             alt="DokSkenas"
//             onClick={() => nav("/saskaitu-skaitmenizavimas-dokskenas")}
//             sx={{
//               display: { xs: "none", md: "block" },
//               width: "180px",
//               height: "auto",
//               borderRadius: 2,
//               cursor: "pointer",
//               "&:hover": { opacity: 0.9 },
//             }}
//           />
//         </Stack>
//       </Box>
//     );
//   };

//   return (
//     <Container maxWidth="lg" sx={{ marginBottom: '100px' }}>
//       <Helmet>
//         <title>Atlyginimo Skaičiuoklė 2026 metų - DokSkenas</title>
//         <meta name="description" content="Apskaičiuokite, kiek uždirbsite 2026 metais, pritaikius progresinį GPM ir kitus mokesčių pakeitimus." />
//       </Helmet>

//       <Paper sx={{ p: 3, mt: 3, backgroundColor: '#212121', borderRadius: 3, minHeight: '600px' }}>
//         <Typography
//           variant="h1"
//           sx={{
//             color: '#d2cbc6',
//             marginBottom: 3,
//             fontSize: { xs: '24px', sm: '30px' },
//             fontFamily: 'Helvetica',
//             fontWeight: 'bold',
//             letterSpacing: 0.05,
//           }}
//         >
//           Atlyginimo skaičiuoklė 2026
//         </Typography>

//         <Grid2 container sx={{
//           flexWrap: { md: 'nowrap' },
//           display: 'flex',
//           flexDirection: { xs: 'column', md: 'row' },
//           justifyContent: 'space-between',
//           alignItems: 'start',
//         }}>
//           <Grid2 sx={{ maxWidth: { md: '50%' } }}>
//             <FormControl component="fieldset" fullWidth>
//               <FormLabel component="legend" sx={{ color: '#d2cbc6' }}>Atlyginimo tipas</FormLabel>
//               <RadioGroup row value={salaryType} onChange={(e) => setSalaryType(e.target.value)}>
//                 <FormControlLabel
//                   sx={{ color: '#d2cbc6' }}
//                   value="gross"
//                   control={
//                     <Radio
//                       sx={{
//                         color: '#d2cbc6',
//                         '&.Mui-checked': { color: '#d2cbc6' },
//                         '&:hover': { backgroundColor: 'transparent' },
//                       }}
//                     />
//                   }
//                   label="Ant popieriaus"
//                 />
//                 <FormControlLabel
//                   sx={{ color: '#d2cbc6' }}
//                   value="net"
//                   control={
//                     <Radio
//                       sx={{
//                         color: '#d2cbc6',
//                         '&.Mui-checked': { color: '#d2cbc6' },
//                         '&:hover': { backgroundColor: 'transparent' },
//                       }}
//                     />
//                   }
//                   label="Į rankas"
//                 />
//               </RadioGroup>
//             </FormControl>

//             <FormControl fullWidth margin="normal">
//               <FormLabel sx={{ color: '#d2cbc6', marginBottom: 1 }}>
//                 {salaryType === "gross" ? "Įveskite atlyginimą ant popieriaus (€)" : "Įveskite atlyginimą į rankas (€)"}
//               </FormLabel>
//               <TextField
//                 type="number"
//                 fullWidth
//                 value={salary}
//                 onChange={handleSalaryChange}
//                 variant="outlined"
//                 onWheel={(e) => e.target.blur()}
//                 sx={{
//                   backgroundColor: '#FAFAFA',
//                   borderRadius: 1,
//                   '.MuiOutlinedInput-notchedOutline': { borderColor: '#555' },
//                   '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#888' },
//                   '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#d2cbc6' },
//                 }}
//               />
//             </FormControl>

//             <FormControl fullWidth margin="normal">
//               <FormLabel sx={{ color: '#d2cbc6' }}>NPD</FormLabel>
//               <Select
//                 value={npdType}
//                 onChange={(e) => setNpdType(e.target.value)}
//                 sx={{
//                   backgroundColor: '#FAFAFA',
//                   borderRadius: 1,
//                   '.MuiOutlinedInput-notchedOutline': { borderColor: '#555' },
//                   '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#888' },
//                   '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#d2cbc6' },
//                 }}
//               >
//                 <MenuItem value="standard">Standartinis</MenuItem>
//                 <MenuItem value="none">Netaikomas</MenuItem>
//                 <MenuItem value="30-55">30-55% darbingumas</MenuItem>
//                 <MenuItem value="0-25">0-25% darbingumas</MenuItem>
//               </Select>
//             </FormControl>

//             <FormControl fullWidth margin="normal" sx={{ backgroundColor: '#1e1e1e' }}>
//               <FormLabel sx={{ color: '#d2cbc6' }}>Papildomas pensijos kaupimas (%)</FormLabel>
//               <Select
//                 value={pension}
//                 onChange={(e) => setPension(e.target.value)}
//                 sx={{
//                   backgroundColor: '#FAFAFA',
//                   borderRadius: 1,
//                   '.MuiOutlinedInput-notchedOutline': { borderColor: '#555' },
//                   '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#888' },
//                   '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#d2cbc6' },
//                 }}
//               >
//                 <MenuItem value="none">Nekaupiu</MenuItem>
//                 <MenuItem value="3">3%</MenuItem>
//               </Select>
//             </FormControl>
//           </Grid2>

//           {/* AD: mobile */}
//           <DokskenAd sx={{ display: { xs: 'block', md: 'none' } }} />

//           <Grid2 sx={{ width: { md: '40%' } }}>
//             <Typography
//               sx={{
//                 color: '#d2cbc6',
//                 marginTop: 2,
//                 marginBottom: 2,
//                 fontSize: { xs: '20px', sm: '26px' },
//                 fontFamily: 'Helvetica',
//                 fontWeight: 'bold',
//               }}
//             >
//               Paskaičiavimai
//             </Typography>
//             <TableContainer component={Paper} sx={{ mt: 2 }}>
//               <Table>
//                 <TableBody>
//                   <TableRow sx={{ backgroundColor: '#d2cbc6' }}>
//                     <TableCell sx={{ fontSize: '16px', height: '50px' }}>
//                       {salaryType === "gross" ? "Atlyginimas į rankas (€)" : "Atlyginimas ant popieriaus (€)"}
//                     </TableCell>
//                     <TableCell align="right" sx={{ fontSize: '16px' }}>
//                       {salaryType === "gross" ? netSalary.toFixed(2) : grossSalary.toFixed(2)}
//                     </TableCell>
//                   </TableRow>
//                   <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
//                     <TableCell>Pritaikytas NPD (€)</TableCell>
//                     <TableCell align="right">{npd.toFixed(2)}</TableCell>
//                   </TableRow>
//                   <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
//                     <TableCell>Pajamų mokestis (GPM) (€)</TableCell>
//                     <TableCell align="right">{incomeTax.toFixed(2)}</TableCell>
//                   </TableRow>
//                   <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
//                     <TableCell>Socialinis draudimas ir pensija (€)</TableCell>
//                     <TableCell align="right">{socialInsurance.toFixed(2)}</TableCell>
//                   </TableRow>
//                   <TableRow sx={{ backgroundColor: '#f1edeb' }}>
//                     <TableCell>Bendra darbo vietos kaina (€)</TableCell>
//                     <TableCell align="right">{totalCost.toFixed(2)}</TableCell>
//                   </TableRow>
//                   <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
//                     <TableCell>Darbdavio soc. draudimo įmoka (€)</TableCell>
//                     <TableCell align="right">{employerContribution.toFixed(2)}</TableCell>
//                   </TableRow>
//                 </TableBody>
//               </Table>
//             </TableContainer>

//             {/* Optional: parodyti skaidymą į PSD/VSD/pensija */}
//             <Box sx={{ mt: 1, color: '#777', fontSize: '12px' }}>
//               <div>Detalizacija: VSD {vsd.toFixed(2)} €, PSD {psd.toFixed(2)} €, papildoma pensija {pensionExtra.toFixed(2)} €</div>
//               <div>GPM taikymo ribos (mėn.): iki {T1_MONTHLY.toFixed(2)} € → 20 %, {T1_MONTHLY.toFixed(2)}–{T2_MONTHLY.toFixed(2)} € → 25 %, virš {T2_MONTHLY.toFixed(2)} € → 32 %</div>
//             </Box>
//           </Grid2>
//         </Grid2>

//         {/* AD: desktop */}
//         <DokskenAd sx={{ display: { xs: 'none', md: 'block' } }} />

//         {/* --- Monthly breakdown (pagal pateiktą pavyzdį) --- */}
//         <Box sx={{ mt: 6 }}>
//           <Typography
//             sx={{ fontWeight: 'bold', fontSize: { xs: '18px', sm: '22px' }, mb: 2, color: '#d2cbc6' }}
//           >
//             Mėnesinis išskaidymas (2026)
//           </Typography>

//           {grossSalary > 0 && (
//             <MonthlyBreakdownTable
//               monthlyGross={grossSalary}
//               npdType={npdType}
//               pension={pension}
//             />
//           )}
//         </Box>
//       </Paper>

//       {/* Info content */}
//       <Container maxWidth="md" sx={{ mt: 8 }}>
//         <Typography sx={{ lineHeight: 1.5, fontSize: '14px', letterSpacing: '0.1px', marginBottom: 3, fontFamily: 'Helvetica', fontStyle: 'italic' }}>
//           Skaičiuoklė atnaujinta pagal 2026-01-01 GPM pakeitimus (progresiniai tarifai) ir NPD ribą iki 2 562,49 €.
//         </Typography>

//         <Typography sx={{ lineHeight: 1.5, fontSize: '16px', letterSpacing: '0.1px', marginBottom: 1, fontFamily: 'Helvetica' }}>
//           Atlyginimo skaičiuoklė leis jums pasiskaičiuoti savo 2026 metų atlyginimą:
//         </Typography>
//         <Typography component="ul" sx={{ lineHeight: 1.5, fontSize: '16px', letterSpacing: '0.1px', marginTop: 3, marginBottom: 3, paddingLeft: 5, fontFamily: 'Helvetica' }}>
//           <li style={{ marginBottom: '20px' }}>Žinant atlyginimą "ant popieriaus" – sužinosite atlyginimą "į rankas"</li>
//           <li>Žinant atlyginimą "į rankas" – sužinosite atlyginimą "ant popieriaus"</li>
//         </Typography>

//         <Typography variant="h2" sx={{ marginTop: 5, marginBottom: 2, fontSize: { xs: '20px', sm: '26px' }, fontFamily: 'Helvetica', fontWeight: 'bold' }}>
//           2026 m. pakeitimai, kuriuos įvertina skaičiuoklė
//         </Typography>
//         <Typography component="ul" sx={{ lineHeight: 1.5, fontSize: '16px', letterSpacing: '0.1px', marginTop: 3, marginBottom: 3, paddingLeft: 5, fontFamily: 'Helvetica' }}>
//           <li style={{ marginBottom: '20px' }}><Box component="span" sx={{ fontWeight: 'bold' }}>Progresinis GPM</Box> – 20% iki 3×VDU, 25% tarp 3×VDU ir 5×VDU, 32% virš 5×VDU (mėnesio aproksimacija).</li>
//           <li style={{ marginBottom: '20px' }}><Box component="span" sx={{ fontWeight: 'bold' }}>NPD (standartinis)</Box> – taikomas tik kai bruto ≤ 2 562,49 €. Virš šios ribos NPD netaikomas.</li>
//           <li style={{ marginBottom: '20px' }}><Box component="span" sx={{ fontWeight: 'bold' }}>Socialinis draudimas</Box> – PSD 6,98% nuo viso bruto; VSD 12,52% iki lubų (5×VDU per mėn. aproksimacija); papildoma pensija 0% arba 3%.</li>
//           <li><Box component="span" sx={{ fontWeight: 'bold' }}>Darbdavio įmoka</Box> – 1,77% nuo bruto; rodoma bendra darbo vietos kaina.</li>
//         </Typography>

//         <Typography sx={{ lineHeight: 1.5, fontSize: '16px', letterSpacing: '0.1px', marginBottom: 1, fontFamily: 'Helvetica' }}>
//           Pastaba: oficiali MMA 2026 m. dar gali būti patikslinta; ši skaičiuoklė nenaudoja MMA tiesiogiai (išskyrus NPD formulę pagal 2025 m.), todėl rezultatai gali būti minimaliai pakoreguotini po galutinio patvirtinimo.
//         </Typography>
//       </Container>

//       {/* Video dialog */}
//       <Dialog open={videoOpen} onClose={() => setVideoOpen(false)} maxWidth="md" fullWidth>
//         <DialogContent sx={{ p: 0 }}>
//           <Box
//             component="iframe"
//             src="https://www.youtube.com/embed/falGn4_S_5Y?si=LFmb3RYZCG59JKF8"
//             title="Demo Video"
//             width="100%"
//             height="600px"
//             sx={{ border: 'none' }}
//             allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
//             allowFullScreen
//           />
//         </DialogContent>
//       </Dialog>
//     </Container>
//   );
// };

// // --- Pagalbinis komponentas: mėnesių lentelė ---
// const MONTHS_LT = [
//   'Sausis','Vasaris','Kovas','Balandis','Gegužė','Birželis',
//   'Liepa','Rugpjūtis','Rugsėjis','Spalis','Lapkritis','Gruodis'
// ];

// function MonthlyBreakdownTable({ monthlyGross, npdType, pension }) {
//   const calcNpdLocal = (gross) => {
//     if (!gross) return 0;
//     if (npdType === '0-25') return 1127;
//     if (npdType === '30-55') return 1057;
//     if (npdType === 'none') return 0;
//     const CUTOFF = 2562.49;
//     if (gross > CUTOFF) return 0;
//     if (gross <= MMA) return 747;
//     if (gross > MMA && gross <= 2387.29) return Math.max(747 - 0.49 * (gross - MMA), 0);
//     return Math.max(400 - 0.18 * (gross - 642), 0);
//   };

//   const pensionExtraRate = pension === '3' ? 0.03 : 0;

//   let rows = [];
//   let cumulativeGross = 0;
//   for (let i = 0; i < 12; i++) {
//     cumulativeGross += monthlyGross;

//     const npd = calcNpdLocal(monthlyGross);
//     const taxable = Math.max(monthlyGross - npd, 0);

//     const prevCumulative = cumulativeGross - monthlyGross;
//     let gpmRate = GPM_RATE_1;
//     if (prevCumulative >= T2_ANNUAL) gpmRate = GPM_RATE_3;
//     else if (prevCumulative >= T1_ANNUAL) gpmRate = GPM_RATE_2;

//     const gpm = taxable * gpmRate;

//     const vsdBase = Math.min(monthlyGross, VSD_MONTHLY_CAP_BASE);
//     const vsd = vsdBase * VSD_RATE;
//     const psd = monthlyGross * PSD_RATE;
//     const pens = monthlyGross * pensionExtraRate;

//     const net = monthlyGross - gpm - vsd - psd - pens;

//     rows.push({ month: MONTHS_LT[i], net, cumulativeGross, gpmRate, gpm, vsd, psd, npd });
//   }

//   return (
//     <TableContainer component={Paper} sx={{ mt: 2 }}>
//       <Table>
//         <TableBody>
//           <TableRow sx={{ backgroundColor: '#F7F3F1' }}>
//             <TableCell sx={{ fontWeight: 'bold' }}>Atlyginimas į rankas</TableCell>
//             {rows.map(r => (<TableCell key={r.month} align="right">{r.net.toFixed(2)}</TableCell>))}
//           </TableRow>
//           <TableRow>
//             <TableCell sx={{ fontWeight: 'bold' }}>Metinės bruto pajamos</TableCell>
//             {rows.map(r => (<TableCell key={r.month} align="right">{r.cumulativeGross.toFixed(2)}</TableCell>))}
//           </TableRow>
//           <TableRow>
//             <TableCell colSpan={13} sx={{ backgroundColor: '#EFE9E6', fontWeight: 'bold' }}>Mokesčiai</TableCell>
//           </TableRow>
//           <TableRow>
//             <TableCell>GPM, %</TableCell>
//             {rows.map(r => (<TableCell key={r.month} align="right">{(r.gpmRate*100).toFixed(0)}%</TableCell>))}
//           </TableRow>
//           <TableRow>
//             <TableCell>GPM, EUR</TableCell>
//             {rows.map(r => (<TableCell key={r.month} align="right">{r.gpm.toFixed(2)}</TableCell>))}
//           </TableRow>
//           <TableRow>
//             <TableCell>VSD, %</TableCell>
//             {rows.map((_, idx) => (<TableCell key={idx} align="right">{(VSD_RATE*100).toFixed(2)}%</TableCell>))}
//           </TableRow>
//           <TableRow>
//             <TableCell>VSD, EUR</TableCell>
//             {rows.map(r => (<TableCell key={r.month} align="right">{r.vsd.toFixed(2)}</TableCell>))}
//           </TableRow>
//           <TableRow>
//             <TableCell>PSD, %</TableCell>
//             {rows.map((_, idx) => (<TableCell key={idx} align="right">{(PSD_RATE*100).toFixed(2)}%</TableCell>))}
//           </TableRow>
//           <TableRow>
//             <TableCell>PSD, EUR</TableCell>
//             {rows.map(r => (<TableCell key={r.month} align="right">{r.psd.toFixed(2)}</TableCell>))}
//           </TableRow>
//           <TableRow>
//             <TableCell>NPD</TableCell>
//             {rows.map(r => (<TableCell key={r.month} align="right">{r.npd.toFixed(2)}</TableCell>))}
//           </TableRow>
//         </TableBody>
//       </Table>
//     </TableContainer>
//   );
// }

// export default AtlyginimoSkaiciuokle2026;
















// import { useState } from 'react';
// import { Helmet } from 'react-helmet';
// import { useNavigate } from "react-router-dom";
// import { publicApi } from "../api/endpoints"; // axios instance

// import {
//   Table, TableBody, TableCell, TableContainer, TableRow, Grid2, Container, FormControl,
//   FormLabel, RadioGroup, FormControlLabel, Radio, TextField, Select, MenuItem, Typography,
//   Box, Paper, Button, Dialog, DialogContent, Stack
// } from "@mui/material";
// import PlayCircleIcon from '@mui/icons-material/PlayCircle';

// /**
//  * Atlyginimo skaičiuoklė 2026
//  *
//  * ✅ Nauja: progresinis GPM (20% / 25% / 32%) pagal 36/60 VDU ribas.
//  * ✅ NPD taikomas tik iki 2 562,49 € bruto per mėnesį (standartiniam NPD).
//  * ✅ VSD 12,52% su metinėmis lubomis (apytiksliai taikome mėnesinę ribą: 5×VDU).
//  * ✅ PSD 6,98% be lubų. Papildoma pensija: 0% arba 3%.
//  *
//  * Pastabos:
//  * - VDU 2026 m. naudojamas: 2 304.50 € (pagal pateiktą informaciją).
//  * - GPM laipteliai čia taikomi mėnesio pjūviu (3×VDU ir 5×VDU). Teisiškai tai metinės ribos;
//  *   šioje skaičiuoklėje naudojamas mėnesinis aproksimavimas.
//  * - NPD formulė kaip 2025 m., bet su „cutoff": jeigu bruto > 2 562,49 €, NPD = 0 (standartiniam NPD).
//  */

// const VDU_2026 = 2304.50; // €
// const T1_MONTHLY = 3 * VDU_2026; // 36 VDU per metus / 12 = 3 VDU per mėn. => 6 913.50 €
// const T2_MONTHLY = 5 * VDU_2026; // 60 VDU per metus / 12 = 5 VDU per mėn. => 11 522.50 €

// const GPM_RATE_1 = 0.20; // iki T1
// const GPM_RATE_2 = 0.25; // tarp T1 ir T2
// const GPM_RATE_3 = 0.32; // virš T2

// const PSD_RATE = 0.0698; // 6.98%
// const VSD_RATE = 0.1252; // 12.52%
// const EMPLOYER_RATE = 0.0177; // 1.77%

// // VSD lubų aproksimacija: mėnesio lubos = 5×VDU (metinės 60×VDU)
// const VSD_MONTHLY_CAP_BASE = T2_MONTHLY;

// const AtlyginimoSkaiciuokle2026 = () => {
//   const [salary, setSalary] = useState("");
//   const [npdType, setNpdType] = useState("standard");
//   const [pension, setPension] = useState("none"); // "none" | "3"
//   const [salaryType, setSalaryType] = useState("gross"); // "gross" | "net"
//   const [videoOpen, setVideoOpen] = useState(false);

//   const handleSalaryChange = (event) => {
//     let value = event.target.value;
//     if (value === "") {
//       setSalary("");
//       return;
//     }
//     let numericValue = Number(value);
//     if (!isNaN(numericValue)) {
//       setSalary(numericValue);
//     }
//   };

//   /**
//    * 2026 NPD (standartinis): taikomas tik, kai bruto ≤ 2 562,49 €.
//    * Naudojame 2025 formules (pagal jūsų 2025 kodo logiką),
//    * bet su cutoff riba. Specialiems darbingumo atvejams – fiksuotos reikšmės.
//    */
//   const calculateNPD = (grossSalary) => {
//     if (!grossSalary) return 0;

//     if (npdType === "0-25") return 1127; // fiksuotas
//     if (npdType === "30-55") return 1057; // fiksuotas
//     if (npdType === "none") return 0;

//     // Standartinis NPD su cutoff
//     const CUTOFF = 2562.49;
//     if (grossSalary > CUTOFF) return 0;

//     // 2025 formulių perėmimas (kaip jūsų esamoje skaičiuoklėje):
//     if (grossSalary <= 1038) return 747;
//     if (grossSalary > 1038 && grossSalary <= 2387.29)
//       return Math.max(747 - 0.49 * (grossSalary - 1038), 0);
//     return Math.max(400 - 0.18 * (grossSalary - 642), 0);
//   };

//   /**
//    * PSD skaičiuojamas nuo viso bruto.
//    * VSD skaičiuojamas tik iki lubų (mėnesinis aproksimavimas: 5×VDU).
//    * Papildoma pensija (3%) – nuo viso bruto.
//    */
//   const calcContributions = (gross) => {
//     if (gross <= 0) return { vsd: 0, psd: 0, pensionExtra: 0, employeeTotal: 0 };
//     const vsdBase = Math.min(gross, VSD_MONTHLY_CAP_BASE);
//     const vsd = vsdBase * VSD_RATE;
//     const psd = gross * PSD_RATE;
//     const pensionExtra = pension === "3" ? gross * 0.03 : 0;
//     return { vsd, psd, pensionExtra, employeeTotal: vsd + psd + pensionExtra };
//   };

//   /**
//    * Progresinis GPM – taikomas apmokestinamoms pajamoms (bruto - NPD) mėnesio pjūviu.
//    */
//   const calcIncomeTax = (gross) => {
//     if (gross <= 0) return { gpm: 0, npd: 0 };
//     const npd = calculateNPD(gross);
//     const taxable = Math.max(gross - npd, 0);

//     const part1 = Math.min(taxable, T1_MONTHLY);
//     const part2 = Math.min(Math.max(taxable - T1_MONTHLY, 0), T2_MONTHLY - T1_MONTHLY);
//     const part3 = Math.max(taxable - T2_MONTHLY, 0);

//     const gpm = part1 * GPM_RATE_1 + part2 * GPM_RATE_2 + part3 * GPM_RATE_3;
//     return { gpm, npd };
//   };

//   /**
//    * Neto iš bruto – naudodami 2026 taisykles (progresinis GPM, VSD lubos, PSD, pensija).
//    */
//   const netFromGross = (gross) => {
//     if (gross <= 0) return 0;
//     const { gpm } = calcIncomeTax(gross);
//     const { employeeTotal } = calcContributions(gross);
//     return gross - gpm - employeeTotal;
//   };

//   /**
//    * Bruto iš neto (dvejetainė paieška). Viršutinę ribą parenkame konservatyviai.
//    */
//   const getGrossFromNet = (netSalary) => {
//     const upperGuess = netSalary / (1 - (GPM_RATE_3) - (PSD_RATE + VSD_RATE + (pension === "3" ? 0.03 : 0)));
//     let low = netSalary > 0 ? Math.max(0, netSalary * 0.5) : 0;
//     let high = Math.max(netSalary, upperGuess);
//     let mid = 0;

//     for (let i = 0; i < 60; i++) {
//       mid = (low + high) / 2;
//       const computed = netFromGross(mid);
//       if (computed > netSalary) {
//         high = mid;
//       } else {
//         low = mid;
//       }
//     }
//     return mid;
//   };

//   const grossSalary = salary ? (salaryType === "gross" ? salary : getGrossFromNet(salary)) : 0;
//   const { gpm: incomeTax, npd } = calcIncomeTax(grossSalary);
//   const { vsd, psd, pensionExtra, employeeTotal: socialInsurance } = calcContributions(grossSalary);

//   const netSalary = grossSalary - incomeTax - socialInsurance;

//   const employerContribution = grossSalary > 0 ? grossSalary * EMPLOYER_RATE : 0;
//   const totalCost = grossSalary + employerContribution;

//   // Reusable ad block (tas pats kaip 2025)
//   const DokskenAd = ({ sx }) => {
//     const nav = useNavigate();
//     const handleClick = (adName) => {
//       publicApi.post("/api/track-click/", { ad_name: adName })
//         .catch(err => console.error("Tracking error:", err));
//     };
//     return (
//       <Box
//         sx={{
//           mt: 4,
//           p: 3,
//           borderRadius: 2,
//           backgroundColor: "#f2f2f2",
//           border: "1px solid #3a3a3a",
//           ...sx,
//         }}
//       >
//         <Stack direction="row" spacing={3} alignItems="center">
//           <Box sx={{ flex: 1 }}>
//             <Typography
//               sx={{
//                 color: "#404040",
//                 fontSize: { xs: "22px", sm: "26px" },
//                 fontWeight: 700,
//                 mb: 1,
//               }}
//             >
//               Gaištate krūvą laiko apskaitai? Automatizuokite apskaitą su DI!
//             </Typography>

//             <Box
//               component="ol"
//               sx={{
//                 pl: 3,
//                 m: 0,
//                 color: "#404040",
//                 fontFamily: "Helvetica",
//                 listStyleType: "decimal",
//                 "& > li": {
//                   marginBottom: "6px",
//                 },
//               }}
//             >
//               <li>Įkelkite sąskaitas į DokSkeną</li>
//               <li>Palaukite, kol nuskaitys duomenis</li>
//               <li>
//                 Įkelkite failus į savo buhalterinę programą (Rivilę, Finvaldą,
//                 Centą...)
//               </li>
//             </Box>

//             <Stack
//               direction={{ xs: "column", sm: "row" }}
//               spacing={2}
//               sx={{ mt: 2 }}
//             >
//               <Button
//                 variant="contained"
//                 href="/saskaitu-skaitmenizavimas-dokskenas"
//                 onClick={() => handleClick("AS_suzinoti_daugiau")}
//                 sx={{
//                   borderRadius: 1,
//                   fontWeight: 300,
//                   color: "#1b1b1b",
//                   backgroundColor: "#f5be09",
//                 }}
//               >
//                 Sužinoti daugiau
//               </Button>
//               <Button
//                 startIcon={<PlayCircleIcon />}
//                 variant="outlined"
//                 onClick={() => setVideoOpen(true)}
//                 sx={{
//                   borderColor: "black",
//                   color: "black",
//                   "&:hover": { backgroundColor: "#fff6d8", color: "black" },
//                 }}
//               >
//                 Žiūrėti video
//               </Button>
//             </Stack>
//           </Box>

//           <Box
//             component="img"
//             src="/DokSkenas_square.jpg"
//             alt="DokSkenas"
//             onClick={() => nav("/saskaitu-skaitmenizavimas-dokskenas")}
//             sx={{
//               display: { xs: "none", md: "block" },
//               width: "180px",
//               height: "auto",
//               borderRadius: 2,
//               cursor: "pointer",
//               "&:hover": { opacity: 0.9 },
//             }}
//           />
//         </Stack>
//       </Box>
//     );
//   };

//   return (
//     <Container maxWidth="lg" sx={{ marginBottom: '100px' }}>
//       <Helmet>
//         <title>Atlyginimo Skaičiuoklė 2026 metų - pagal naujausius mokesčių pakeitimus</title>
//         <meta name="description" content="Patogiai apskaičiuokite savo 2026 m. atlyginimą į rankas arba ant popieriaus. Skaičiuoklė atnaujinta pagal 2026-01-01 GPM pakeitimus (progresiniai tarifai)." />
//       </Helmet>

//       <Paper sx={{ p: 3, mt: 3, backgroundColor: '#212121', borderRadius: 3, minHeight: '600px' }}>
//         <Typography
//           variant="h1"
//           sx={{
//             color: '#d2cbc6',
//             marginBottom: 3,
//             fontSize: { xs: '24px', sm: '30px' },
//             fontFamily: 'Helvetica',
//             fontWeight: 'bold',
//             letterSpacing: 0.05,
//           }}
//         >
//           Atlyginimo skaičiuoklė 2026
//         </Typography>

//         <Grid2 container sx={{
//           flexWrap: { md: 'nowrap' },
//           display: 'flex',
//           flexDirection: { xs: 'column', md: 'row' },
//           justifyContent: 'space-between',
//           alignItems: 'start',
//         }}>
//           <Grid2 sx={{ maxWidth: { md: '50%' } }}>
//             <FormControl component="fieldset" fullWidth>
//               <FormLabel component="legend" sx={{ color: '#d2cbc6' }}>Atlyginimo tipas</FormLabel>
//               <RadioGroup row value={salaryType} onChange={(e) => setSalaryType(e.target.value)}>
//                 <FormControlLabel
//                   sx={{ color: '#d2cbc6' }}
//                   value="gross"
//                   control={
//                     <Radio
//                       sx={{
//                         color: '#d2cbc6',
//                         '&.Mui-checked': { color: '#d2cbc6' },
//                         '&:hover': { backgroundColor: 'transparent' },
//                       }}
//                     />
//                   }
//                   label="Ant popieriaus"
//                 />
//                 <FormControlLabel
//                   sx={{ color: '#d2cbc6' }}
//                   value="net"
//                   control={
//                     <Radio
//                       sx={{
//                         color: '#d2cbc6',
//                         '&.Mui-checked': { color: '#d2cbc6' },
//                         '&:hover': { backgroundColor: 'transparent' },
//                       }}
//                     />
//                   }
//                   label="Į rankas"
//                 />
//               </RadioGroup>
//             </FormControl>

//             <FormControl fullWidth margin="normal">
//               <FormLabel sx={{ color: '#d2cbc6', marginBottom: 1 }}>
//                 {salaryType === "gross" ? "Įveskite atlyginimą ant popieriaus (€)" : "Įveskite atlyginimą į rankas (€)"}
//               </FormLabel>
//               <TextField
//                 type="number"
//                 fullWidth
//                 value={salary}
//                 onChange={handleSalaryChange}
//                 variant="outlined"
//                 onWheel={(e) => e.target.blur()}
//                 sx={{
//                   backgroundColor: '#FAFAFA',
//                   borderRadius: 1,
//                   '.MuiOutlinedInput-notchedOutline': { borderColor: '#555' },
//                   '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#888' },
//                   '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#d2cbc6' },
//                 }}
//               />
//             </FormControl>

//             <FormControl fullWidth margin="normal">
//               <FormLabel sx={{ color: '#d2cbc6' }}>NPD</FormLabel>
//               <Select
//                 value={npdType}
//                 onChange={(e) => setNpdType(e.target.value)}
//                 sx={{
//                   backgroundColor: '#FAFAFA',
//                   borderRadius: 1,
//                   '.MuiOutlinedInput-notchedOutline': { borderColor: '#555' },
//                   '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#888' },
//                   '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#d2cbc6' },
//                 }}
//               >
//                 <MenuItem value="standard">Standartinis</MenuItem>
//                 <MenuItem value="none">Netaikomas</MenuItem>
//                 <MenuItem value="30-55">30-55% darbingumas</MenuItem>
//                 <MenuItem value="0-25">0-25% darbingumas</MenuItem>
//               </Select>
//             </FormControl>

//             <FormControl fullWidth margin="normal" sx={{ backgroundColor: '#1e1e1e' }}>
//               <FormLabel sx={{ color: '#d2cbc6' }}>Papildomas pensijos kaupimas (%)</FormLabel>
//               <Select
//                 value={pension}
//                 onChange={(e) => setPension(e.target.value)}
//                 sx={{
//                   backgroundColor: '#FAFAFA',
//                   borderRadius: 1,
//                   '.MuiOutlinedInput-notchedOutline': { borderColor: '#555' },
//                   '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#888' },
//                   '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#d2cbc6' },
//                 }}
//               >
//                 <MenuItem value="none">Nekaupiu</MenuItem>
//                 <MenuItem value="3">3%</MenuItem>
//               </Select>
//             </FormControl>
//           </Grid2>

//           {/* AD: mobile */}
//           <DokskenAd sx={{ display: { xs: 'block', md: 'none' } }} />

//           <Grid2 sx={{ width: { md: '40%' } }}>
//             <Typography
//               sx={{
//                 color: '#d2cbc6',
//                 marginTop: 2,
//                 marginBottom: 2,
//                 fontSize: { xs: '20px', sm: '26px' },
//                 fontFamily: 'Helvetica',
//                 fontWeight: 'bold',
//               }}
//             >
//               Paskaičiavimai
//             </Typography>
//             <TableContainer component={Paper} sx={{ mt: 2 }}>
//               <Table>
//                 <TableBody>
//                   <TableRow sx={{ backgroundColor: '#d2cbc6' }}>
//                     <TableCell sx={{ fontSize: '16px', height: '50px' }}>
//                       {salaryType === "gross" ? "Atlyginimas į rankas (€)" : "Atlyginimas ant popieriaus (€)"}
//                     </TableCell>
//                     <TableCell align="right" sx={{ fontSize: '16px' }}>
//                       {salaryType === "gross" ? netSalary.toFixed(2) : grossSalary.toFixed(2)}
//                     </TableCell>
//                   </TableRow>
//                   <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
//                     <TableCell>Pritaikytas NPD (€)</TableCell>
//                     <TableCell align="right">{npd.toFixed(2)}</TableCell>
//                   </TableRow>
//                   <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
//                     <TableCell>Pajamų mokestis (GPM) (€)</TableCell>
//                     <TableCell align="right">{incomeTax.toFixed(2)}</TableCell>
//                   </TableRow>
//                   <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
//                     <TableCell>Socialinis draudimas ir pensija (€)</TableCell>
//                     <TableCell align="right">{socialInsurance.toFixed(2)}</TableCell>
//                   </TableRow>
//                   <TableRow sx={{ backgroundColor: '#f1edeb' }}>
//                     <TableCell>Bendra darbo vietos kaina (€)</TableCell>
//                     <TableCell align="right">{totalCost.toFixed(2)}</TableCell>
//                   </TableRow>
//                   <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
//                     <TableCell>Darbdavio soc. draudimo įmoka (€)</TableCell>
//                     <TableCell align="right">{employerContribution.toFixed(2)}</TableCell>
//                   </TableRow>
//                 </TableBody>
//               </Table>
//             </TableContainer>

//             {/* Optional: parodyti skaidymą į PSD/VSD/pensija */}
//             <Box sx={{ mt: 1, color: '#777', fontSize: '12px' }}>
//               <div>Detalizacija: VSD {vsd.toFixed(2)} €, PSD {psd.toFixed(2)} €, papildoma pensija {pensionExtra.toFixed(2)} €</div>
//               <div>GPM taikymo ribos (mėn.): iki {T1_MONTHLY.toFixed(2)} € → 20 %, {T1_MONTHLY.toFixed(2)}–{T2_MONTHLY.toFixed(2)} € → 25 %, virš {T2_MONTHLY.toFixed(2)} € → 32 %</div>
//             </Box>
//           </Grid2>
//         </Grid2>

//         {/* AD: desktop */}
//         <DokskenAd sx={{ display: { xs: 'none', md: 'block' } }} />
//       </Paper>

//       {/* Info content */}
//       <Container maxWidth="md" sx={{ mt: 8 }}>
//         <Typography sx={{ lineHeight: 1.5, fontSize: '14px', letterSpacing: '0.1px', marginBottom: 3, fontFamily: 'Helvetica', fontStyle: 'italic' }}>
//           Skaičiuoklė atnaujinta pagal 2026-01-01 GPM pakeitimus (progresiniai tarifai) ir NPD ribą iki 2 562,49 €.
//         </Typography>

//         <Typography sx={{ lineHeight: 1.5, fontSize: '16px', letterSpacing: '0.1px', marginBottom: 1, fontFamily: 'Helvetica' }}>
//           Atlyginimo skaičiuoklė leis jums pasiskaičiuoti savo 2026 metų atlyginimą:
//         </Typography>
//         <Typography component="ul" sx={{ lineHeight: 1.5, fontSize: '16px', letterSpacing: '0.1px', marginTop: 3, marginBottom: 3, paddingLeft: 5, fontFamily: 'Helvetica' }}>
//           <li style={{ marginBottom: '20px' }}>Žinant atlyginimą "ant popieriaus" – sužinosite atlyginimą "į rankas"</li>
//           <li>Žinant atlyginimą "į rankas" – sužinosite atlyginimą "ant popieriaus"</li>
//         </Typography>

//         <Typography variant="h2" sx={{ marginTop: 5, marginBottom: 2, fontSize: { xs: '20px', sm: '26px' }, fontFamily: 'Helvetica', fontWeight: 'bold' }}>
//           2026 m. pakeitimai, kuriuos įvertina skaičiuoklė
//         </Typography>
//         <Typography component="ul" sx={{ lineHeight: 1.5, fontSize: '16px', letterSpacing: '0.1px', marginTop: 3, marginBottom: 3, paddingLeft: 5, fontFamily: 'Helvetica' }}>
//           <li style={{ marginBottom: '20px' }}><Box component="span" sx={{ fontWeight: 'bold' }}>Progresinis GPM</Box> – 20% iki 3×VDU, 25% tarp 3×VDU ir 5×VDU, 32% virš 5×VDU (mėnesio aproksimacija).</li>
//           <li style={{ marginBottom: '20px' }}><Box component="span" sx={{ fontWeight: 'bold' }}>NPD (standartinis)</Box> – taikomas tik kai bruto ≤ 2 562,49 €. Virš šios ribos NPD netaikomas.</li>
//           <li style={{ marginBottom: '20px' }}><Box component="span" sx={{ fontWeight: 'bold' }}>Socialinis draudimas</Box> – PSD 6,98% nuo viso bruto; VSD 12,52% iki lubų (5×VDU per mėn. aproksimacija); papildoma pensija 0% arba 3%.</li>
//           <li><Box component="span" sx={{ fontWeight: 'bold' }}>Darbdavio įmoka</Box> – 1,77% nuo bruto; rodoma bendra darbo vietos kaina.</li>
//         </Typography>

//         <Typography sx={{ lineHeight: 1.5, fontSize: '16px', letterSpacing: '0.1px', marginBottom: 1, fontFamily: 'Helvetica' }}>
//           Pastaba: oficiali MMA 2026 m. dar gali būti patikslinta; ši skaičiuoklė nenaudoja MMA tiesiogiai (išskyrus NPD formulę pagal 2025 m.), todėl rezultatai gali būti minimaliai pakoreguotini po galutinio patvirtinimo.
//         </Typography>
//       </Container>

//       {/* Video dialog */}
//       <Dialog open={videoOpen} onClose={() => setVideoOpen(false)} maxWidth="md" fullWidth>
//         <DialogContent sx={{ p: 0 }}>
//           <Box
//             component="iframe"
//             src="https://www.youtube.com/embed/falGn4_S_5Y?si=LFmb3RYZCG59JKF8"
//             title="Demo Video"
//             width="100%"
//             height="600px"
//             sx={{ border: 'none' }}
//             allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
//             allowFullScreen
//           />
//         </DialogContent>
//       </Dialog>
//     </Container>
//   );
// };

// export default AtlyginimoSkaiciuokle2026;
