// import { useState } from "react";
// import AdSection from "../page_elements/AdSection"; // jei nenaudoji reklamos - gali ištrinti

// import {
//   Table, TableBody, TableCell, TableContainer, TableRow,
//   Grid2, Container, FormControl, FormLabel,
//   RadioGroup, FormControlLabel, Radio, TextField,
//   Select, MenuItem, Typography, Box, Paper,
// } from "@mui/material";

// /**
//  * Atlyginimo skaičiuoklė Lenkijai 2026 (Umowa o pracę)
//  *
//  * PIT 2026 (skalė):
//  *  - iki 120 000 PLN/metus → 12%
//  *  - virš 120 000 PLN/metus → 32%
//  *  - tax-free 30 000 PLN/metus per "kwota zmniejszająca" 3 600 PLN/metus (300/mėn.)
//  *
//  * ZUS (darbuotojas):
//  *  - emerytalne 9.76% (su lubomis)
//  *  - rentowe 1.5% (su lubomis)
//  *  - chorobowe 2.45% (be lubų)
//  * Lubos: 30×vid. alga/metus (2025 cap ~260 190 PLN; 2026 atnaujinsi kai bus oficialu).
//  *
//  * Sveikata (NFZ):
//  *  - 9% nuo (bruto - ZUS employee)
//  *  - nebededukuojama iš PIT.
//  *
//  * PPK:
//  *  - darbuotojas min 2% (gali 0.5% mažoms pajamoms, arba iki 4%)
//  *  - darbdavys min 1.5%
//  */

// // ---------- KONSTANTOS (lengvai atnaujinamos į 2026 faktines) ----------
// const PIT_THRESHOLD_ANNUAL = 120000;
// const PIT_RATE_1 = 0.12;
// const PIT_RATE_2 = 0.32;
// const TAX_DECREASING_AMOUNT_ANNUAL = 3600; // 30k * 12% = 3600
// const TAX_DECREASING_AMOUNT_MONTHLY = TAX_DECREASING_AMOUNT_ANNUAL / 12;

// const SOLIDARITY_THRESHOLD_ANNUAL = 1000000;
// const SOLIDARITY_RATE = 0.04;

// const ZUS_CAP_ANNUAL = 260190; // placeholder (2025). 2026 pakeisi, kai bus žinoma.
// const ZUS_CAP_MONTHLY = ZUS_CAP_ANNUAL / 12;

// // Employee ZUS rates
// const EMP_PENSION_RATE = 0.0976;   // emerytalne
// const EMP_DISABILITY_RATE = 0.015; // rentowe
// const EMP_SICKNESS_RATE = 0.0245;  // chorobowe

// // Health
// const HEALTH_RATE = 0.09;

// // Employer ZUS fixed parts
// const ER_PENSION_RATE = 0.0976;
// const ER_DISABILITY_RATE = 0.065;
// const ER_LABOR_FUND_RATE = 0.0245; // FP
// const ER_FGSP_RATE = 0.001;        // FGŚP

// // Accident insurance (wypadkowe) selectable
// const ACCIDENT_RATES = [
//   { label: "0.67% (maža rizika)", value: 0.0067 },
//   { label: "1.67% (standartinis)", value: 0.0167 },
//   { label: "3.33% (didelė rizika)", value: 0.0333 },
// ];

// // KUP defaults
// const KUP_STANDARD = 250;
// const KUP_OUTSIDE_TOWN = 300;

// // PPK defaults
// const PPK_EMPLOYER_RATE = 0.015;

// // ---------------------------------------------------------

// const AtlyginimoSkaiciuoklePL2026 = () => {
//   const [salary, setSalary] = useState("");
//   const [salaryType, setSalaryType] = useState("gross"); // gross | net

//   const [kupType, setKupType] = useState("standard"); // standard | outside | custom
//   const [kupCustom, setKupCustom] = useState("");

//   const [ppkType, setPpkType] = useState("none"); // none | 0.5 | 2 | 4 | custom
//   const [ppkCustom, setPpkCustom] = useState("");

//   const [accidentRate, setAccidentRate] = useState(0.0167); // default 1.67%

//   const handleSalaryChange = (event) => {
//     let value = event.target.value;
//     if (value === "") { setSalary(""); return; }
//     const n = Number(value);
//     if (!Number.isNaN(n)) setSalary(n);
//   };

//   const kupMonthly = (() => {
//     if (kupType === "standard") return KUP_STANDARD;
//     if (kupType === "outside") return KUP_OUTSIDE_TOWN;
//     if (kupType === "custom") return Math.max(Number(kupCustom) || 0, 0);
//     return KUP_STANDARD;
//   })();

//   const ppkEmployeeRate = (() => {
//     if (ppkType === "none") return 0;
//     if (ppkType === "0.5") return 0.005;
//     if (ppkType === "2") return 0.02;
//     if (ppkType === "4") return 0.04;
//     if (ppkType === "custom") {
//       const r = (Number(ppkCustom) || 0) / 100;
//       return Math.min(Math.max(r, 0), 0.04);
//     }
//     return 0;
//   })();

//   // ---------- ZUS employee + health + PPK ----------
//   const calcContributions = (gross) => {
//     if (gross <= 0) {
//       return {
//         pension: 0, disability: 0, sickness: 0,
//         zusEmployeeTotal: 0,
//         healthBase: 0, health: 0,
//         ppkEmployee: 0,
//         zusEmployerTotal: 0, ppkEmployer: 0,
//         employerTotal: 0,
//       };
//     }

//     // cap taikomas tik pension+disability bazei
//     const cappedBase = Math.min(gross, ZUS_CAP_MONTHLY);

//     const pension = cappedBase * EMP_PENSION_RATE;
//     const disability = cappedBase * EMP_DISABILITY_RATE;
//     const sickness = gross * EMP_SICKNESS_RATE;

//     const zusEmployeeTotal = pension + disability + sickness;

//     const healthBase = Math.max(gross - zusEmployeeTotal, 0);
//     const health = healthBase * HEALTH_RATE;

//     const ppkEmployee = gross * ppkEmployeeRate;

//     // Employer contributions
//     const erPension = cappedBase * ER_PENSION_RATE;
//     const erDisability = cappedBase * ER_DISABILITY_RATE;
//     const erAccident = gross * accidentRate;
//     const erLaborFund = gross * ER_LABOR_FUND_RATE;
//     const erFgsp = gross * ER_FGSP_RATE;

//     const zusEmployerTotal = erPension + erDisability + erAccident + erLaborFund + erFgsp;

//     const ppkEmployer = gross * (ppkEmployeeRate > 0 ? PPK_EMPLOYER_RATE : 0);
//     const employerTotal = zusEmployerTotal + ppkEmployer;

//     return {
//       pension, disability, sickness,
//       zusEmployeeTotal,
//       healthBase, health,
//       ppkEmployee,
//       zusEmployerTotal, ppkEmployer, employerTotal,
//     };
//   };

//   // ---------- PIT monthly (annualized) ----------
//   const calcPIT = (gross) => {
//     if (gross <= 0) {
//       return {
//         taxBaseMonthly: 0,
//         taxBaseAnnual: 0,
//         pitAnnual: 0,
//         pitMonthly: 0,
//         solidarityAnnual: 0,
//         solidarityMonthly: 0,
//       };
//     }

//     const {
//       zusEmployeeTotal,
//     } = calcContributions(gross);

//     // monthly PIT base: gross - ZUS employee - KUP
//     const taxBaseMonthly = Math.max(gross - zusEmployeeTotal - kupMonthly, 0);
//     const taxBaseAnnual = taxBaseMonthly * 12;

//     let pitAnnual = 0;
//     if (taxBaseAnnual <= PIT_THRESHOLD_ANNUAL) {
//       pitAnnual = Math.max(0, PIT_RATE_1 * taxBaseAnnual - TAX_DECREASING_AMOUNT_ANNUAL);
//     } else {
//       pitAnnual =
//         PIT_RATE_1 * PIT_THRESHOLD_ANNUAL - TAX_DECREASING_AMOUNT_ANNUAL
//         + PIT_RATE_2 * (taxBaseAnnual - PIT_THRESHOLD_ANNUAL);
//     }

//     const solidarityAnnual =
//       taxBaseAnnual > SOLIDARITY_THRESHOLD_ANNUAL
//         ? (taxBaseAnnual - SOLIDARITY_THRESHOLD_ANNUAL) * SOLIDARITY_RATE
//         : 0;

//     const pitMonthly = pitAnnual / 12;
//     const solidarityMonthly = solidarityAnnual / 12;

//     return {
//       taxBaseMonthly,
//       taxBaseAnnual,
//       pitAnnual,
//       pitMonthly,
//       solidarityAnnual,
//       solidarityMonthly,
//     };
//   };

//   const netFromGross = (gross) => {
//     if (gross <= 0) return 0;

//     const pit = calcPIT(gross);
//     const c = calcContributions(gross);

//     return gross
//       - c.zusEmployeeTotal
//       - c.health
//       - pit.pitMonthly
//       - pit.solidarityMonthly
//       - c.ppkEmployee;
//   };

//   const getGrossFromNet = (netSalary) => {
//     // binary search kaip pas tave LT
//     const worstTaxGuess =
//       (EMP_PENSION_RATE + EMP_DISABILITY_RATE + EMP_SICKNESS_RATE)
//       + HEALTH_RATE
//       + PIT_RATE_2
//       + SOLIDARITY_RATE
//       + ppkEmployeeRate;

//     const upperGuess = netSalary > 0 ? netSalary / (1 - worstTaxGuess) : 0;

//     let lo = 0, hi = Math.max(netSalary, upperGuess), mid = 0;
//     for (let i = 0; i < 70; i++) {
//       mid = (lo + hi) / 2;
//       (netFromGross(mid) > netSalary) ? (hi = mid) : (lo = mid);
//     }
//     return mid;
//   };

//   const grossSalary = salary
//     ? (salaryType === "gross" ? Number(salary) : getGrossFromNet(Number(salary)))
//     : 0;

//   const pit = calcPIT(grossSalary);
//   const c = calcContributions(grossSalary);
//   const netSalary = netFromGross(grossSalary);

//   const totalCost = grossSalary + c.employerTotal;

//   return (
//     <Container sx={{ maxWidth: "2000px", marginBottom: "100px" }}>
//       <Paper sx={{ p: 3, mt: 3, backgroundColor: "#212121", borderRadius: 3, minHeight: "600px" }}>
//         <Typography
//           variant="h1"
//           sx={{
//             color: "#d2cbc6",
//             mb: 3,
//             fontSize: { xs: "24px", sm: "30px" },
//             fontFamily: "Helvetica",
//             fontWeight: "bold",
//             letterSpacing: 0.05,
//           }}
//         >
//           Atlyginimo skaičiuoklė Lenkijai 2026 (Umowa o pracę)
//         </Typography>

//         <Grid2 container sx={{
//           flexWrap: { md: "nowrap" },
//           display: "flex",
//           flexDirection: { xs: "column", md: "row" },
//           justifyContent: "space-between",
//           alignItems: "start",
//         }}>
//           {/* LEFT COLUMN */}
//           <Grid2 sx={{ maxWidth: { md: "50%" } }}>
//             <FormControl component="fieldset" fullWidth>
//               <FormLabel component="legend" sx={{ color: "#d2cbc6" }}>Atlyginimo tipas</FormLabel>
//               <RadioGroup
//                 row
//                 value={salaryType}
//                 onChange={(e) => setSalaryType(e.target.value)}
//               >
//                 <FormControlLabel
//                   sx={{ color: "#d2cbc6" }}
//                   value="gross"
//                   control={<Radio sx={{ color: "#d2cbc6", "&.Mui-checked": { color: "#d2cbc6" } }} />}
//                   label="Bruto (ant popieriaus)"
//                 />
//                 <FormControlLabel
//                   sx={{ color: "#d2cbc6" }}
//                   value="net"
//                   control={<Radio sx={{ color: "#d2cbc6", "&.Mui-checked": { color: "#d2cbc6" } }} />}
//                   label="Neto (į rankas)"
//                 />
//               </RadioGroup>
//             </FormControl>

//             <FormControl fullWidth margin="normal">
//               <FormLabel sx={{ color: "#d2cbc6", mb: 1 }}>
//                 {salaryType === "gross"
//                   ? "Įveskite bruto atlyginimą (PLN)"
//                   : "Įveskite neto atlyginimą (PLN)"
//                 }
//               </FormLabel>
//               <TextField
//                 type="number"
//                 fullWidth
//                 value={salary}
//                 onChange={handleSalaryChange}
//                 variant="outlined"
//                 onWheel={(e) => e.target.blur()}
//                 sx={{
//                   backgroundColor: "#FAFAFA",
//                   borderRadius: 1,
//                   ".MuiOutlinedInput-notchedOutline": { borderColor: "#555" },
//                   "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#888" },
//                   "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#d2cbc6" },
//                 }}
//               />
//             </FormControl>

//             {/* KUP */}
//             <FormControl fullWidth margin="normal">
//               <FormLabel sx={{ color: "#d2cbc6" }}>KUP (koszty uzyskania przychodu)</FormLabel>
//               <Select
//                 value={kupType}
//                 onChange={(e) => setKupType(e.target.value)}
//                 sx={{
//                   backgroundColor: "#FAFAFA",
//                   borderRadius: 1,
//                   ".MuiOutlinedInput-notchedOutline": { borderColor: "#555" },
//                   "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#888" },
//                   "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#d2cbc6" },
//                 }}
//               >
//                 <MenuItem value="standard">Standartinis 250 PLN/mėn.</MenuItem>
//                 <MenuItem value="outside">Gyvenu kitame mieste 300 PLN/mėn.</MenuItem>
//                 <MenuItem value="custom">Custom</MenuItem>
//               </Select>

//               {kupType === "custom" && (
//                 <TextField
//                   type="number"
//                   fullWidth
//                   value={kupCustom}
//                   onChange={(e) => setKupCustom(e.target.value)}
//                   placeholder="KUP suma PLN/mėn."
//                   variant="outlined"
//                   sx={{
//                     mt: 1,
//                     backgroundColor: "#FAFAFA",
//                     borderRadius: 1,
//                   }}
//                 />
//               )}
//             </FormControl>

//             {/* PPK */}
//             <FormControl fullWidth margin="normal">
//               <FormLabel sx={{ color: "#d2cbc6" }}>PPK (darbuotojo kaupimas)</FormLabel>
//               <Select
//                 value={ppkType}
//                 onChange={(e) => setPpkType(e.target.value)}
//                 sx={{
//                   backgroundColor: "#FAFAFA",
//                   borderRadius: 1,
//                   ".MuiOutlinedInput-notchedOutline": { borderColor: "#555" },
//                   "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#888" },
//                   "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#d2cbc6" },
//                 }}
//               >
//                 <MenuItem value="none">Nekaupiu</MenuItem>
//                 <MenuItem value="0.5">0.5% (jei mažos pajamos)</MenuItem>
//                 <MenuItem value="2">2% (standartinis)</MenuItem>
//                 <MenuItem value="4">4% (maks.)</MenuItem>
//                 <MenuItem value="custom">Custom</MenuItem>
//               </Select>

//               {ppkType === "custom" && (
//                 <TextField
//                   type="number"
//                   fullWidth
//                   value={ppkCustom}
//                   onChange={(e) => setPpkCustom(e.target.value)}
//                   placeholder="PPK % nuo bruto (0–4)"
//                   variant="outlined"
//                   sx={{
//                     mt: 1,
//                     backgroundColor: "#FAFAFA",
//                     borderRadius: 1,
//                   }}
//                 />
//               )}
//             </FormControl>

//             {/* Employer accident rate */}
//             <FormControl fullWidth margin="normal">
//               <FormLabel sx={{ color: "#d2cbc6" }}>Darbdavio wypadkowe tarifas</FormLabel>
//               <Select
//                 value={accidentRate}
//                 onChange={(e) => setAccidentRate(Number(e.target.value))}
//                 sx={{
//                   backgroundColor: "#FAFAFA",
//                   borderRadius: 1,
//                 }}
//               >
//                 {ACCIDENT_RATES.map((r) => (
//                   <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
//                 ))}
//               </Select>
//             </FormControl>
//           </Grid2>

//           {/* RIGHT COLUMN */}
//           <Grid2 sx={{ width: { md: "40%" } }}>
//             <Typography
//               sx={{
//                 color: "#d2cbc6",
//                 mt: 2,
//                 mb: 2,
//                 fontSize: { xs: "20px", sm: "26px" },
//                 fontFamily: "Helvetica",
//                 fontWeight: "bold",
//               }}
//             >
//               Paskaičiavimai
//             </Typography>

//             <TableContainer component={Paper} sx={{ mt: 2 }}>
//               <Table>
//                 <TableBody>
//                   <TableRow sx={{ backgroundColor: "#d2cbc6" }}>
//                     <TableCell sx={{ fontSize: "16px", height: "50px" }}>
//                       {salaryType === "gross" ? "Atlyginimas į rankas (PLN)" : "Atlyginimas bruto (PLN)"}
//                     </TableCell>
//                     <TableCell align="right" sx={{ fontSize: "16px" }}>
//                       {salaryType === "gross" ? netSalary.toFixed(2) : grossSalary.toFixed(2)}
//                     </TableCell>
//                   </TableRow>

//                   <TableRow sx={{ backgroundColor: "#FAFAFA" }}>
//                     <TableCell>PIT bazė po ZUS ir KUP (PLN)</TableCell>
//                     <TableCell align="right">{pit.taxBaseMonthly.toFixed(2)}</TableCell>
//                   </TableRow>

//                   <TableRow sx={{ backgroundColor: "#FAFAFA" }}>
//                     <TableCell>PIT (avansas) (PLN)</TableCell>
//                     <TableCell align="right">{pit.pitMonthly.toFixed(2)}</TableCell>
//                   </TableRow>

//                   <TableRow sx={{ backgroundColor: "#FAFAFA" }}>
//                     <TableCell>Solidarumo mokestis 4% (PLN)</TableCell>
//                     <TableCell align="right">{pit.solidarityMonthly.toFixed(2)}</TableCell>
//                   </TableRow>

//                   <TableRow sx={{ backgroundColor: "#FAFAFA" }}>
//                     <TableCell>ZUS darbuotojo (PLN)</TableCell>
//                     <TableCell align="right">{c.zusEmployeeTotal.toFixed(2)}</TableCell>
//                   </TableRow>

//                   <TableRow sx={{ backgroundColor: "#FAFAFA" }}>
//                     <TableCell>Sveikatos draudimas NFZ 9% (PLN)</TableCell>
//                     <TableCell align="right">{c.health.toFixed(2)}</TableCell>
//                   </TableRow>

//                   <TableRow sx={{ backgroundColor: "#FAFAFA" }}>
//                     <TableCell>PPK darbuotojo (PLN)</TableCell>
//                     <TableCell align="right">{c.ppkEmployee.toFixed(2)}</TableCell>
//                   </TableRow>

//                   <TableRow sx={{ backgroundColor: "#f1edeb" }}>
//                     <TableCell>Bendra darbo vietos kaina (PLN)</TableCell>
//                     <TableCell align="right">{totalCost.toFixed(2)}</TableCell>
//                   </TableRow>

//                   <TableRow sx={{ backgroundColor: "#FAFAFA" }}>
//                     <TableCell>Darbdavio ZUS + PPK (PLN)</TableCell>
//                     <TableCell align="right">{c.employerTotal.toFixed(2)}</TableCell>
//                   </TableRow>
//                 </TableBody>
//               </Table>
//             </TableContainer>
//           </Grid2>
//         </Grid2>

//         {/* --- Detalus paskaičiavimas --- */}
//         <Box sx={{ mt: 6 }}>
//           <Typography sx={{ fontWeight: "bold", fontSize: { xs: "20px", sm: "26px" }, mb: 2, color: "#d2cbc6" }}>
//             Detaliai
//           </Typography>

//           <DetailedBreakdownTable
//             monthlyGross={grossSalary}
//             kupMonthly={kupMonthly}
//             ppkEmployeeRate={ppkEmployeeRate}
//             pit={pit}
//             c={c}
//             netSalary={netSalary}
//           />
//         </Box>

//         {/* jei nenaudoji reklamos – ištrink šitą bloką */}
//         <Box sx={{ mt: 3 }}>
//           <AdSection />
//         </Box>
//       </Paper>
//     </Container>
//   );
// };


// /** ---------------- Detalus paskaičiavimas (vertikali lentelė) ---------------- */
// function DetailedBreakdownTable({
//   monthlyGross,
//   kupMonthly,
//   ppkEmployeeRate,
//   pit,
//   c,
//   netSalary,
// }) {
//   const fmt = (x) => (Number.isFinite(x) ? x.toFixed(2) : "0.00");
//   const percent = (r) => `${(r * 100).toFixed(2)}%`;

//   return (
//     <TableContainer component={Paper} sx={{ maxWidth: 650 }}>
//       <Table>
//         <TableBody>
//           <TableRow>
//             <TableCell sx={{ fontWeight: "bold" }}>Atlyginimas Bruto</TableCell>
//             <TableCell align="right">{fmt(monthlyGross)}</TableCell>
//           </TableRow>

//           <TableRow>
//             <TableCell sx={{ fontWeight: "bold" }}>ZUS emerytalne {percent(EMP_PENSION_RATE)}</TableCell>
//             <TableCell align="right">{fmt(c.pension)}</TableCell>
//           </TableRow>
//           <TableRow>
//             <TableCell sx={{ fontWeight: "bold" }}>ZUS rentowe {percent(EMP_DISABILITY_RATE)}</TableCell>
//             <TableCell align="right">{fmt(c.disability)}</TableCell>
//           </TableRow>
//           <TableRow>
//             <TableCell sx={{ fontWeight: "bold" }}>ZUS chorobowe {percent(EMP_SICKNESS_RATE)}</TableCell>
//             <TableCell align="right">{fmt(c.sickness)}</TableCell>
//           </TableRow>
//           <TableRow>
//             <TableCell sx={{ fontWeight: "bold" }}>ZUS darbuotojo viso</TableCell>
//             <TableCell align="right">{fmt(c.zusEmployeeTotal)}</TableCell>
//           </TableRow>

//           <TableRow>
//             <TableCell sx={{ fontWeight: "bold" }}>KUP (mėn.)</TableCell>
//             <TableCell align="right">{fmt(kupMonthly)}</TableCell>
//           </TableRow>

//           <TableRow>
//             <TableCell sx={{ fontWeight: "bold" }}>PIT bazė (mėn.)</TableCell>
//             <TableCell align="right">{fmt(pit.taxBaseMonthly)}</TableCell>
//           </TableRow>

//           <TableRow>
//             <TableCell sx={{ fontWeight: "bold" }}>PIT avansas (mėn.)</TableCell>
//             <TableCell align="right">
//               {fmt(pit.pitMonthly)}
//               <Box sx={{ fontSize: "12px", color: "#555", textAlign: "right", mt: 0.5 }}>
//                 12% iki 120k/metus, vėliau 32% + 300 PLN/mėn. tax credit
//               </Box>
//             </TableCell>
//           </TableRow>

//           <TableRow>
//             <TableCell sx={{ fontWeight: "bold" }}>Solidarumo mokestis (mėn.)</TableCell>
//             <TableCell align="right">{fmt(pit.solidarityMonthly)}</TableCell>
//           </TableRow>

//           <TableRow>
//             <TableCell sx={{ fontWeight: "bold" }}>Sveikata NFZ 9%</TableCell>
//             <TableCell align="right">{fmt(c.health)}</TableCell>
//           </TableRow>

//           <TableRow>
//             <TableCell sx={{ fontWeight: "bold" }}>PPK darbuotojo {percent(ppkEmployeeRate)}</TableCell>
//             <TableCell align="right">{fmt(c.ppkEmployee)}</TableCell>
//           </TableRow>

//           <TableRow>
//             <TableCell sx={{ fontWeight: "bold", backgroundColor: "#EFE9E6" }}>
//               Atlyginimas Neto (į rankas)
//             </TableCell>
//             <TableCell align="right" sx={{ backgroundColor: "#EFE9E6", fontWeight: "bold" }}>
//               {fmt(netSalary)}
//             </TableCell>
//           </TableRow>
//         </TableBody>
//       </Table>
//     </TableContainer>
//   );
// }

// export default AtlyginimoSkaiciuoklePL2026;
