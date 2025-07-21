import { useState } from 'react';
import { Helmet } from 'react-helmet';

import { Table, TableBody, TableCell, TableContainer, TableRow, Grid2, Container, FormControl, FormLabel, RadioGroup, FormControlLabel, Radio, TextField, Select, MenuItem, Typography, Box, Paper } from "@mui/material";


const AtlyginimoSkaiciuokle = () => {
    const [salary, setSalary] = useState("");
    const [npdType, setNpdType] = useState("standard");
    const [pension, setPension] = useState("none");
    const [salaryType, setSalaryType] = useState("gross");
  
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
  
    const calculateNPD = (grossSalary) => {
      // Если нет валового оклада (например, поле очищено), то возвращаем 0
      if (!grossSalary) return 0;
      if (npdType === "0-25") return 1127;
      if (npdType === "30-55") return 1057;
      if (npdType === "none") return 0;
      if (grossSalary <= 1038) return 747;
      if (grossSalary > 1038 && grossSalary <= 2387.29)
        return Math.max(747 - 0.49 * (grossSalary - 1038), 0);
      return Math.max(400 - 0.18 * (grossSalary - 642), 0);
    };
  
    // Новая версия: итеративное вычисление валового оклада для заданного "на руки"
    const getGrossFromNet = (netSalary) => {
      let socialInsuranceRate = pension === "3" ? 0.225 : 0.195;
      const netFromGross = (gross) => {
        let npd = calculateNPD(gross);
        let incomeTax = Math.max((gross - npd) * 0.2, 0);
        let socialInsurance = gross * socialInsuranceRate;
        return gross - incomeTax - socialInsurance;
      };
  
      let low = netSalary;
      let high = netSalary / (1 - 0.2 - socialInsuranceRate);
      let mid = 0;
      for (let i = 0; i < 50; i++) {
        mid = (low + high) / 2;
        let computedNet = netFromGross(mid);
        if (computedNet > netSalary) {
          high = mid;
        } else {
          low = mid;
        }
      }
      return mid;
    };
  
    // Если выбран "ant popieriaus", salary – это валовая; если "į rankas" – пересчитываем
    const grossSalary = salary ? (salaryType === "gross" ? salary : getGrossFromNet(salary)) : 0;
    const npd = calculateNPD(grossSalary);
    const incomeTax = grossSalary > 0 ? Math.max((grossSalary - npd) * 0.2, 0) : 0;
    const socialInsurance = grossSalary > 0 ? grossSalary * (pension === "3" ? 0.225 : 0.195) : 0;
    const netSalary = grossSalary - incomeTax - socialInsurance;
    const employerContribution = grossSalary > 0 ? grossSalary * 0.0177 : 0;
    const totalCost = grossSalary + employerContribution;
  
    return (
      <Container maxWidth="lg" sx={{ marginBottom: '100px' }}>
        <Helmet>
          <title>Atlyginimo Skaičiuoklė 2025 metų - pagal naujausius mokesčių pakeitimus</title>
          <meta name="description" content="Patogiai apskaičiuokite savo atlyginimą į rankas arba ant popieriaus. Skaičiuoklė nuolat atnaujinama pagal naujausius mokesčių įstatymus." />
        </Helmet>
        {/* <Article></Article> */}
        <Paper sx={{ p: 3, mt: 3, backgroundColor: '#212121', borderRadius: 3, minHeight: '600px' }}>
          <Typography
            variant="h1"
            sx={{
              color: '#d2cbc6',
              marginBottom: 3,
              fontSize: { xs: '24px', sm: '30px' },
              fontFamily: 'Helvetica',
              fontWeight: "bold",
              letterSpacing: 0.05
            }}
          >
            Atlyginimo skaičiuoklė 2025
          </Typography>
  
          <Grid2 container sx={{
            flexWrap: { md: 'nowrap' },
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            justifyContent: 'space-between',
            alignItems: 'start'
          }}>
            <Grid2 sx={{ maxWidth: {md: '50%'}}}>
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
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#d2cbc6' }
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
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#d2cbc6' }
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
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#d2cbc6' }
                  }}
                >
                  <MenuItem value="none">Nekaupiu</MenuItem>
                  <MenuItem value="3">3%</MenuItem>
                </Select>
              </FormControl>
            </Grid2>
  
            <Grid2 sx={{ width: {md: '40%'}}}>
              <Typography
                sx={{
                  color: '#d2cbc6',
                  marginTop: 2,
                  marginBottom: 2,
                  fontSize: { xs: '20px', sm: '26px' },
                  fontFamily: 'Helvetica',
                  fontWeight: "bold"
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
                      <TableCell>Pajamų mokestis (€)</TableCell>
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
            </Grid2>
          </Grid2>
        </Paper>
        <Container maxWidth="md" sx={{ mt: 8 }}>
            <Typography sx={{ lineHeight: 1.5, fontSize: "14px", letterSpacing: "0.1px", marginBottom: 3, fontFamily: 'Helvetica', fontStyle: 'italic' }}>
                Skaičiuoklė yra atnaujinta pagal 2025 metų sausio 1 dienos mokesčių pakeitimus.
            </Typography>
            <Typography sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
                Atlyginimo skaičiuoklė leis jums pasiskaičiuoti savo 2025 metų atlyginimą:
            </Typography>
            <Typography component="ul" sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginTop: 3, marginBottom: 3, paddingLeft: 5, fontFamily: 'Helvetica' }}>
                <li style={{ marginBottom: '20px' }}>Žinant atlyginimą "ant popieriaus" – sužinosite savo atlyginimą "į rankas"</li>
                <li>Žinant atlyginimą "į rankas" – sužinosite savo atlyginimą "ant popieriaus"</li>
            </Typography>
            <Typography sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
                Pasirinkus atlyginimo tipą – "Ant popieriaus" ir įvedus savo algą "ant popieriaus", skaičiuoklė paskaičiuos jūsų darbo užmokestį į rankas.
            </Typography>
            <Typography sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
                Tą patį galite padaryti pasirinkus atlyginimo tipą – "Į rankas" ir įvedus savo algą "į rankas", skaičiuoklė paskaičiuos jūsų darbo užmokestį "ant popieriaus".
            </Typography>
            
            <Typography variant="h2" sx={{ marginTop: 5, marginBottom: 2, fontSize: { xs: '20px', sm: '26px' }, fontFamily: 'Helvetica', fontWeight: "bold" }}>
                Algos skaičiuoklė 2025 taip pat paskaičiuos:
            </Typography>
            <Typography component="ul" sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginTop: 3, marginBottom: 3, paddingLeft: 5, fontFamily: 'Helvetica' }}>
                <li style={{ marginBottom: '20px' }}><Box component="span" sx={{ fontWeight: "bold" }}>Neapmokestinamą pajamų dydį (NPD)</Box> –  tai suma, nuo kurios neskaičiuojamas gyventojų pajamų mokestis. NPD dydis priklauso nuo jūsų atlyginimo dydžio - kuo mažesnis atlyginimas, tuo didesnis NPD. Turint ribotą darbingumą arba uždirbant minimalų atlyginimą, taikomi fiksuoti NPD.</li>
                <li style={{ marginBottom: '20px' }}><Box component="span" sx={{ fontWeight: "bold" }}>Gyventojų pajamų mokestį (GPM)</Box> – tai mokestis, kuris yra atskaitomas nuo jūsų atlyginimo atėmus priklausomą NPD. Šiuo metu standartinis GPM tarifas yra 20%.</li>
                <li style={{ marginBottom: '20px' }}><Box component="span" sx={{ fontWeight: "bold" }}>Socialinio draudimo ir pensijos įmokas</Box> – tai jūsų, kaip darbuotojo, mokamos įmokos "Sodrai", kurios yra skirtos jūsų socialiniam draudimui (ligos, motinystės/tėvystės išmokoms) ir būsimai pensijai. Jeigu kaupiate pensijai papildomus 3%, pasirinkite 3% dydį papildomos pensijos nustatymuose.</li>
                <li style={{ marginBottom: '20px' }}><Box component="span" sx={{ fontWeight: "bold" }}>Darbdavio socialinio draudimo įmoką</Box> – tai papildoma suma, kurią už jus sumoka darbdavys į "Sodrą". Šios įmokos darbuotojas nemato savo atlyginimo lapelyje.</li>
                <li><Box component="span" sx={{ fontWeight: "bold" }}>Bendrą darbo vietos kainą</Box> – tai visa suma, kurią darbdavys išleidžia jūsų darbo vietai, įskaitant atlyginimą "ant popieriaus" ir visas darbdavio mokamas įmokas. Kitaip tariant, tai pilna jūsų įdarbinimo kaina darbdaviui.</li>
            </Typography>
            
            <Typography variant="h2" sx={{ marginTop: 5, marginBottom: 2, fontSize: { xs: '20px', sm: '26px' }, fontFamily: 'Helvetica', fontWeight: "bold" }}>
                Kaip keitėsi su darbo užmokesčiu susiję mokesčiai 2025 metais?
            </Typography>
            <Typography component="ul" sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginTop: 3, marginBottom: 3, paddingLeft: 5, fontFamily: 'Helvetica' }}>
                <li style={{ marginBottom: '20px' }}>Padidėjo minimalus mėnesinis atlyginimas (MMA) iki 1038 eurų</li>
                <li style={{ marginBottom: '20px' }}>Padidinta pajamų riba nuo 2167 Eur. iki 2387,26 Eur., nuo kurios neapmoketinamas pajamų dydis skaičiuojamas pagal antrąją formulę</li>
                <li>Pasikeitė pirmosios NPD apskaičiavimo formulės koeficientas iš 0,5 į 0,49</li>
            </Typography>
            <Typography variant="h2" sx={{ marginTop: 5, marginBottom: 2, fontSize: { xs: '20px', sm: '26px' }, fontFamily: 'Helvetica', fontWeight: "bold" }}>
                Kiek mokesčių mokame nuo algos 2025 metais?
            </Typography>
            <Typography sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
                Ignoruojant neapmokestinamą pajamų dydį, nekaupiant papildomus 3% pensijai bei turint 100% darbingumą, Lietuvos piliečių, dirbančių Lietuvoje, darbovietės apmoketinamos 41,27% mokesčiu:
            </Typography>
            <Typography component="ul" sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginTop: 3 ,marginBottom: 3, paddingLeft: 5, fontFamily: 'Helvetica' }}>
                <li style={{ marginBottom: '20px' }}>Gyventojų pajamų mokestis – <Box component="span" sx={{ fontWeight: "bold" }}>20%</Box></li>
                <li style={{ marginBottom: '20px' }}>Darbuotojo socialinis draudimas bei pensija – <Box component="span" sx={{ fontWeight: "bold" }}>19,5%</Box></li>
                <li>Darbdavio socialinio draudimo įmoka – <Box component="span" sx={{ fontWeight: "bold" }}>1,77%</Box></li>
            </Typography>
            <Typography sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
                Nuo kiekvieno uždirbto 1000 eurų, jūs sumokate 412,7 eurus valstybei.
            </Typography>
        </Container>

    </Container>
    );
  };
  
  export default AtlyginimoSkaiciuokle;