import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { publicApi } from "../api/endpoints"; // axios instance
import AdSection from '../page_elements/AdSection';

import {
  Table, TableBody, TableCell, TableContainer, TableRow, Grid as Grid2, Container, FormControl,
  FormLabel, RadioGroup, FormControlLabel, Radio, TextField, Select, MenuItem, Typography,
  Box, Paper, Dialog, DialogContent
} from "@mui/material";

/**
 * Atlyginimo skaičiuoklė 2026
 *
 * ✅ Progresinis GPM (20% / 25% / 32%) pagal 36/60 VDU ribas.
 * ✅ VSD 12,52% su metinėmis lubomis (aproksimacija: 5×VDU per mėn.).
 * ✅ PSD 6,98% be lubų. Papildoma pensija: 0% arba 3% (rodoma atskirai).
 */

const VDU = 2312.15;   // VDU, kaip prašei (2025)
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

    // const CUTOFF = 2562.49;
    // if (gross > CUTOFF) return 0;

    // if (gross <= MMA) return 747;
    // if (gross <= 2387.29) return Math.max(747 - 0.49 * (gross - MMA), 0);
    // return Math.max(400 - 0.18 * (gross - 642), 0);
    if (gross <= MMA) return 747;
    return Math.max(747 - 0.49 * (gross - MMA), 0);
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

  // GPM (mėnesio dalys)
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

  const handleLearnMoreClick = () => {
    publicApi.post("/api/track-click/", { ad_name: "AS_suzinoti_daugiau_2026" }).catch(() => {});
  };

  return (
    <Container sx={{ maxWidth:'2000px', marginBottom: '100px' }}>
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
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            <AdSection
              onOpenVideo={() => setVideoOpen(true)}
              videoUrl="https://www.youtube.com/embed/ByViuilYxZA"
              videoTitle="DokSkenas demo"
              onLearnMoreClick={handleLearnMoreClick}
            />
          </Box>

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

            <Box sx={{ mt: 1, color: '#777', fontSize: '12px', fontFamily: "Helvetica" }}>
              <div>Žemiau esanti detalizacija parodo, kokia suma apmokestinta 20% / 25% / 32%.</div>
            </Box>
          </Grid2>
        </Grid2>

        {/* AD: desktop */}
        <Box sx={{ display: { xs: 'none', md: 'block' } }}>
          <AdSection
            onOpenVideo={() => setVideoOpen(true)}
            videoUrl="https://www.youtube.com/embed/ByViuilYxZA"
            videoTitle="DokSkenas demo"
            onLearnMoreClick={handleLearnMoreClick}
          />
        </Box>

        {/* --- Detalus paskaičiavimas --- */}
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

      <DokSkenasSection />

      {/* Video dialog */}
      <Dialog open={videoOpen} onClose={() => setVideoOpen(false)} maxWidth="md" fullWidth>
        <DialogContent sx={{ p: 0 }}>
          <Box
            component="iframe"
            src="https://www.youtube.com/embed/ByViuilYxZA"
            title="DokSkenas demo"
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

  const T1_ANNUAL  = 36 * VDU;
  const T2_ANNUAL  = 60 * VDU;

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
        <b>MMA: 1153 €</b>, <b>VDU: 2312,15 €</b>.
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
          <b>- Neapmokestinamasis pajamų dydis (NPD):</b> nuo 2026 m. taikoma viena NPD formulė:
          NPD = 747 – 0,49 × (DU – MMA). NPD palaipsniui mažėja didėjant atlyginimui
          ir tampa lygus nuliui, kai bruto atlyginimas pasiekia apie <b>2 677 €</b>.
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

  function DokSkenasSection() {
    const integrations = [
      { name: "Finvalda", href: null },
      { name: "Rivilė GAMA", href: 'https://atlyginimoskaiciuokle.com/rivile' },
      { name: "Rivilė ERP", href: 'https://atlyginimoskaiciuokle.com/rivile' },
      { name: "Agnum", href: null },
      { name: "Centas", href: null },
      { name: "Apskaita5", href: null },
      { name: "Pragma 3.2", href: null },
      { name: "Pragma 4", href: null },
      { name: "Būtenta", href: null },
      { name: "B1", href: 'https://atlyginimoskaiciuokle.com/b1' },
      { name: "Site.pro", href: null },
      { name: "Debetas", href: null },
      { name: "APSA", href: null },
      { name: "Paulita", href: null },
      { name: "Optimum", href: null },
      { name: "Dineta", href: null },
      { name: "iSAF", href: null },
    ];

    return (
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
          Automatizuota apskaita
        </Typography>

        <Typography sx={{ fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 2, lineHeight: 1.7 }}>
          Jei vis dar vedate sąskaitas į apskaitos programą ranka, laikas susimąstyti apie automatizaciją.
        </Typography>

        <Typography sx={{ fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 2, lineHeight: 1.7 }}>
          <b>DokSkenas</b> – apskaitos sistema, kuri per 30 sekundžių nuskenuoja jūsų buhalterinius dokumentus
          ir paruošia juos eksportui į apskaitą: sutikrina sumas, atmeta dublikatus, atpažįsta nuolaidas
          ir skirtingus PVM tarifus, patikrina PVM kodų galiojimą, priskiria PVM klasifikatorių, prekių
          ir paslaugų kodus iš jūsų programos, atskiria prekę nuo paslaugos, surūšiuoja pagal kontrahentus,
          sutikrina LT įmonių duomenis su Registrų centru ir pritaiko valiutų kursus pagal Lietuvos banką.
        </Typography>

        <Typography sx={{ fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 2, lineHeight: 1.7 }}>
          Visi duomenys šifruojami, o jūs sutaupote laiką, sumažinate klaidų riziką ir turite tvarkingą
          apskaitą be rankinio suvedimo.
        </Typography>

        <Typography sx={{ fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 3, lineHeight: 1.7 }}>
          Jums belieka atsisiųsti paruoštą failą su suformuotais duomenimis ir lengvai jį importuoti
          tiesiai į savo apskaitos programą.
        </Typography>

        <Typography sx={{ fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 2 }}>
          Turime integracijas su šiomis apskaitos programomis:
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 0.5,
            maxWidth: 500,
          }}
        >
          {integrations.map((item) => (
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
    );
  }

export default AtlyginimoSkaiciuokle2026;



