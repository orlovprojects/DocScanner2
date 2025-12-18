// src/page_elements/AccountingProgramExtraSettings.jsx
import {
  Paper,
  Typography,
  Stack,
  TextField,
  Button,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
} from "@mui/material";
import { Grid2 } from "@mui/material";

const PREKES_ASSEMBLY_OPTIONS = [
  { value: 1, label: "Paprasta" },
  { value: 2, label: "Komplektuojama" },
  { value: 3, label: "Išskaidoma" },
  { value: 4, label: "Generavimai" },
  { value: 5, label: "Sudėtinė" },
  { value: 6, label: "Komplektuojama/Išskaidoma" },
  { value: 7, label: "Mišri" },
  { value: 8, label: "Tara" },
];

export function AccountingProgramExtraSettings(props) {
  const {
    program,

    // nauji props
    prekesAssemblyPirkimas,
    prekesAssemblyPardavimas,
    paslaugosAssemblyPirkimas,
    paslaugosAssemblyPardavimas,
    savingPrekesAssembly,
    successPrekesAssembly,
    onChangePrekesAssemblyPirkimas,
    onChangePrekesAssemblyPardavimas,
    onChangePaslaugosAssemblyPirkimas,
    onChangePaslaugosAssemblyPardavimas,

    // Rivilė ERP
    rivileErpFields,
    setRivileErpFields,
    savingRivileErp,
    successRivileErp,
    errorRivileErp,
    onSaveRivileErp,

    // Rivilė Gama
    rivileGamaFields,
    setRivileGamaFields,
    savingRivileGama,
    successRivileGama,
    errorRivileGama,
    onSaveRivileGama,

    // Butent
    butentFields,
    setButentFields,
    savingButent,
    successButent,
    errorButent,
    onSaveButent,

    // Finvalda
    finvaldaFields,
    setFinvaldaFields,
    savingFinvalda,
    successFinvalda,
    errorFinvalda,
    onSaveFinvalda,

    // Centas
    centasFields,
    setCentasFields,
    savingCentas,
    successCentas,
    errorCentas,
    onSaveCentas,

    // SitePro
    siteProFields,
    setSiteProFields,
    savingSitePro,
    successSitePro,
    errorSitePro,
    onSaveSitePro,

    // Debetas
    debetasFields,
    setDebetasFields,
    savingDebetas,
    successDebetas,
    errorDebetas,
    onSaveDebetas,

    // Agnum
    agnumFields,
    setAgnumFields,
    savingAgnum,
    successAgnum,
    errorAgnum,
    onSaveAgnum,
  } = props;

  // ---------- Rivilė ERP ----------
  if (program === "rivile_erp") {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          Rivilė ERP papildomi laukai
        </Typography>

        <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
          Čia gali nurodyti numatytuosius žurnalo, padalinio ir objekto kodus
          Rivilė ERP sistemai atskirai pirkimams ir pardavimams.
        </Typography>

        <Grid2 container spacing={3}>
          {/* Pirkimas blokas */}
          <Grid2 size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
              Pirkimas
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label="Žurnalo kodas"
                size="small"
                value={rivileErpFields.pirkimas_zurnalo_kodas}
                onChange={(e) =>
                  setRivileErpFields((prev) => ({
                    ...prev,
                    pirkimas_zurnalo_kodas: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Padalinio kodas"
                size="small"
                value={rivileErpFields.pirkimas_padalinio_kodas}
                onChange={(e) =>
                  setRivileErpFields((prev) => ({
                    ...prev,
                    pirkimas_padalinio_kodas: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Objekto kodas"
                size="small"
                value={rivileErpFields.pirkimas_objekto_kodas}
                onChange={(e) =>
                  setRivileErpFields((prev) => ({
                    ...prev,
                    pirkimas_objekto_kodas: e.target.value,
                  }))
                }
                fullWidth
              />
            </Stack>
          </Grid2>

          {/* Pardavimas blokas */}
          <Grid2 size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
              Pardavimas
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label="Žurnalo kodas"
                size="small"
                value={rivileErpFields.pardavimas_zurnalo_kodas}
                onChange={(e) =>
                  setRivileErpFields((prev) => ({
                    ...prev,
                    pardavimas_zurnalo_kodas: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Padalinio kodas"
                size="small"
                value={rivileErpFields.pardavimas_padalinio_kodas}
                onChange={(e) =>
                  setRivileErpFields((prev) => ({
                    ...prev,
                    pardavimas_padalinio_kodas: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Objekto kodas"
                size="small"
                value={rivileErpFields.pardavimas_objekto_kodas}
                onChange={(e) =>
                  setRivileErpFields((prev) => ({
                    ...prev,
                    pardavimas_objekto_kodas: e.target.value,
                  }))
                }
                fullWidth
              />
            </Stack>
          </Grid2>
        </Grid2>

        <Stack direction="row" spacing={2} sx={{ mt: 3 }} alignItems="center">
          <Button
            variant="contained"
            onClick={onSaveRivileErp}
            disabled={savingRivileErp}
          >
            Išsaugoti Rivilė ERP laukus
          </Button>
          {successRivileErp && (
            <Alert severity="success" sx={{ py: 0.5 }}>
              Išsaugota!
            </Alert>
          )}
          {errorRivileErp && (
            <Alert severity="error" sx={{ py: 0.5 }}>
              {errorRivileErp}
            </Alert>
          )}
        </Stack>
      </Paper>
    );
  }

  // ---------- Rivilė Gama ----------
  if (program === "rivile") {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          Rivilė Gama papildomi laukai
        </Typography>

        <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
          Čia gali nurodyti numatytuosius padalinio, objekto, serijos ir kitus
          laukus Rivilė Gama programai, atskirai pirkimams ir pardavimams.
        </Typography>

        <Grid2 container spacing={3}>
          {/* Pirkimas blokas */}
          <Grid2 size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
              Pirkimas
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label="Padalinys"
                size="small"
                value={rivileGamaFields.pirkimas_padalinys}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pirkimas_padalinys: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Objektas"
                size="small"
                value={rivileGamaFields.pirkimas_objektas}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pirkimas_objektas: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Serija"
                size="small"
                value={rivileGamaFields.pirkimas_serija}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pirkimas_serija: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Centras"
                size="small"
                value={rivileGamaFields.pirkimas_centras}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pirkimas_centras: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Atskaitingas asmuo"
                size="small"
                value={rivileGamaFields.pirkimas_atskaitingas_asmuo}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pirkimas_atskaitingas_asmuo: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Logistika"
                size="small"
                value={rivileGamaFields.pirkimas_logistika}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pirkimas_logistika: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Apmokėjimo sąskaitos kodas"
                size="small"
                value={rivileGamaFields.pirkimas_pinigu_saskaitos_kodas}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pirkimas_pinigu_saskaitos_kodas: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Sąskaitos ryšio kodas"
                size="small"
                value={rivileGamaFields.pirkimas_saskaitos_rysio_kodas}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pirkimas_saskaitos_rysio_kodas: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Prekės grupė"
                size="small"
                value={rivileGamaFields.pirkimas_prekes_grupe}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pirkimas_prekes_grupe: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Paslaugos grupė"
                size="small"
                value={rivileGamaFields.pirkimas_paslaugos_grupe}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pirkimas_paslaugos_grupe: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Kodo grupė"
                size="small"
                value={rivileGamaFields.pirkimas_kodo_grupe}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pirkimas_kodo_grupe: e.target.value,
                  }))
                }
                fullWidth
              />
              {/* PREKĖS TIPAS – Pirkimas */}
              <FormControl size="small" fullWidth>
                <InputLabel>Prekės tipas</InputLabel>
                <Select
                  label="Prekės tipas"
                  value={prekesAssemblyPirkimas}
                  onChange={onChangePrekesAssemblyPirkimas}
                  disabled={savingPrekesAssembly}
                >
                  {PREKES_ASSEMBLY_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {/* PASLAUGOS TIPAS – Pirkimas */}
              <FormControl size="small" fullWidth>
                <InputLabel>Paslaugos tipas</InputLabel>
                <Select
                  label="Paslaugos tipas"
                  value={paslaugosAssemblyPirkimas}
                  onChange={onChangePaslaugosAssemblyPirkimas}
                  disabled={savingPrekesAssembly}
                >
                  {PREKES_ASSEMBLY_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          </Grid2>

          {/* Pardavimas blokas */}
          <Grid2 size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
              Pardavimas
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label="Padalinys"
                size="small"
                value={rivileGamaFields.pardavimas_padalinys}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pardavimas_padalinys: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Objektas"
                size="small"
                value={rivileGamaFields.pardavimas_objektas}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pardavimas_objektas: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Serija"
                size="small"
                value={rivileGamaFields.pardavimas_serija}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pardavimas_serija: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Centras"
                size="small"
                value={rivileGamaFields.pardavimas_centras}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pardavimas_centras: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Atskaitingas asmuo"
                size="small"
                value={rivileGamaFields.pardavimas_atskaitingas_asmuo}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pardavimas_atskaitingas_asmuo: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Logistika"
                size="small"
                value={rivileGamaFields.pardavimas_logistika}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pardavimas_logistika: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Apmokėjimo sąskaitos kodas"
                size="small"
                value={rivileGamaFields.pardavimas_pinigu_saskaitos_kodas}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pardavimas_pinigu_saskaitos_kodas: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Sąskaitos ryšio kodas"
                size="small"
                value={rivileGamaFields.pardavimas_saskaitos_rysio_kodas}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pardavimas_saskaitos_rysio_kodas: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Prekės grupė"
                size="small"
                value={rivileGamaFields.pardavimas_prekes_grupe}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pardavimas_prekes_grupe: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Paslaugos grupė"
                size="small"
                value={rivileGamaFields.pardavimas_paslaugos_grupe}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pardavimas_paslaugos_grupe: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Kodo grupė"
                size="small"
                value={rivileGamaFields.pardavimas_kodo_grupe}
                onChange={(e) =>
                  setRivileGamaFields((prev) => ({
                    ...prev,
                    pardavimas_kodo_grupe: e.target.value,
                  }))
                }
                fullWidth
              />
              {/* PREKĖS TIPAS – Pardavimas */}
              <FormControl size="small" fullWidth>
                <InputLabel>Prekės tipas</InputLabel>
                <Select
                  label="Prekės tipas"
                  value={prekesAssemblyPardavimas}
                  onChange={onChangePrekesAssemblyPardavimas}
                  disabled={savingPrekesAssembly}
                >
                  {PREKES_ASSEMBLY_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {/* PASLAUGOS TIPAS – Pardavimas */}
              <FormControl size="small" fullWidth>
                <InputLabel>Paslaugos tipas</InputLabel>
                <Select
                  label="Paslaugos tipas"
                  value={paslaugosAssemblyPardavimas}
                  onChange={onChangePaslaugosAssemblyPardavimas}
                  disabled={savingPrekesAssembly}
                >
                  {PREKES_ASSEMBLY_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          </Grid2>
        </Grid2>

        <Stack direction="row" spacing={2} sx={{ mt: 3 }} alignItems="center">
          <Button
            variant="contained"
            onClick={onSaveRivileGama}
            disabled={savingRivileGama}
          >
            Išsaugoti Rivilė Gama laukus
          </Button>
          {successRivileGama && (
            <Alert severity="success" sx={{ py: 0.5 }}>
              Išsaugota!
            </Alert>
          )}
          {errorRivileGama && (
            <Alert severity="error" sx={{ py: 0.5 }}>
              {errorRivileGama}
            </Alert>
          )}
        </Stack>
      </Paper>
    );
  }

  // ---------- Butent ----------
  if (program === "butent") {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          Butent papildomi laukai
        </Typography>

        <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
          Nurodykite numatytuosius sandėlio ir operacijos kodus pirkimams ir pardavimams.
        </Typography>

        <Grid2 container spacing={3}>
          {/* Pirkimas */}
          <Grid2 size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
              Pirkimas
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label="Sandėlis"
                size="small"
                value={butentFields.pirkimas_sandelis}
                onChange={(e) =>
                  setButentFields((prev) => ({
                    ...prev,
                    pirkimas_sandelis: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Operacija"
                size="small"
                value={butentFields.pirkimas_operacija}
                onChange={(e) =>
                  setButentFields((prev) => ({
                    ...prev,
                    pirkimas_operacija: e.target.value,
                  }))
                }
                fullWidth
              />
            </Stack>
          </Grid2>

          {/* Pardavimas */}
          <Grid2 size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
              Pardavimas
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label="Sandėlis"
                size="small"
                value={butentFields.pardavimas_sandelis}
                onChange={(e) =>
                  setButentFields((prev) => ({
                    ...prev,
                    pardavimas_sandelis: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Operacija"
                size="small"
                value={butentFields.pardavimas_operacija}
                onChange={(e) =>
                  setButentFields((prev) => ({
                    ...prev,
                    pardavimas_operacija: e.target.value,
                  }))
                }
                fullWidth
              />
            </Stack>
          </Grid2>
        </Grid2>

        <Stack direction="row" spacing={2} sx={{ mt: 3 }} alignItems="center">
          <Button
            variant="contained"
            onClick={onSaveButent}
            disabled={savingButent}
          >
            Išsaugoti Butent laukus
          </Button>
          {successButent && (
            <Alert severity="success" sx={{ py: 0.5 }}>
              Išsaugota!
            </Alert>
          )}
          {errorButent && (
            <Alert severity="error" sx={{ py: 0.5 }}>
              {errorButent}
            </Alert>
          )}
        </Stack>
      </Paper>
    );
  }

  // ---------- Finvalda ----------
  if (program === "finvalda") {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          Finvalda papildomi laukai
        </Typography>

        <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
          Nurodykite numatytuosius sandėlio, tipo ir žurnalo kodus pirkimams ir pardavimams.
        </Typography>

        <Grid2 container spacing={3}>
          {/* Pirkimas */}
          <Grid2 size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
              Pirkimas
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label="Sandėlis"
                size="small"
                value={finvaldaFields.pirkimas_sandelis}
                onChange={(e) =>
                  setFinvaldaFields((prev) => ({
                    ...prev,
                    pirkimas_sandelis: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Žurnalas"
                size="small"
                value={finvaldaFields.pirkimas_zurnalas}
                onChange={(e) =>
                  setFinvaldaFields((prev) => ({
                    ...prev,
                    pirkimas_zurnalas: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Tipas"
                size="small"
                value={finvaldaFields.pirkimas_tipas}
                onChange={(e) =>
                  setFinvaldaFields((prev) => ({
                    ...prev,
                    pirkimas_tipas: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Padalinys"
                size="small"
                value={finvaldaFields.pirkimas_padalinys}
                onChange={(e) =>
                  setFinvaldaFields((prev) => ({
                    ...prev,
                    pirkimas_padalinys: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Darbuotojas"
                size="small"
                value={finvaldaFields.pirkimas_darbuotojas}
                onChange={(e) =>
                  setFinvaldaFields((prev) => ({
                    ...prev,
                    pirkimas_darbuotojas: e.target.value,
                  }))
                }
                fullWidth
              />
            </Stack>
          </Grid2>

          {/* Pardavimas */}
          <Grid2 size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
              Pardavimas
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label="Sandėlis"
                size="small"
                value={finvaldaFields.pardavimas_sandelis}
                onChange={(e) =>
                  setFinvaldaFields((prev) => ({
                    ...prev,
                    pardavimas_sandelis: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Žurnalas"
                size="small"
                value={finvaldaFields.pardavimas_zurnalas}
                onChange={(e) =>
                  setFinvaldaFields((prev) => ({
                    ...prev,
                    pardavimas_zurnalas: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Tipas"
                size="small"
                value={finvaldaFields.pardavimas_tipas}
                onChange={(e) =>
                  setFinvaldaFields((prev) => ({
                    ...prev,
                    pardavimas_tipas: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Padalinys"
                size="small"
                value={finvaldaFields.pardavimas_padalinys}
                onChange={(e) =>
                  setFinvaldaFields((prev) => ({
                    ...prev,
                    pardavimas_padalinys: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Darbuotojas"
                size="small"
                value={finvaldaFields.pardavimas_darbuotojas}
                onChange={(e) =>
                  setFinvaldaFields((prev) => ({
                    ...prev,
                    pardavimas_darbuotojas: e.target.value,
                  }))
                }
                fullWidth
              />
            </Stack>
          </Grid2>
        </Grid2>

        <Stack direction="row" spacing={2} sx={{ mt: 3 }} alignItems="center">
          <Button
            variant="contained"
            onClick={onSaveFinvalda}
            disabled={savingFinvalda}
          >
            Išsaugoti Finvalda laukus
          </Button>
          {successFinvalda && (
            <Alert severity="success" sx={{ py: 0.5 }}>
              Išsaugota!
            </Alert>
          )}
          {errorFinvalda && (
            <Alert severity="error" sx={{ py: 0.5 }}>
              {errorFinvalda}
            </Alert>
          )}
        </Stack>
      </Paper>
    );
  }

  // ---------- Centas ----------
  if (program === "centas") {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          Centas papildomi laukai
        </Typography>

        <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
          Nurodykite numatytuosius sandėlio ir objekto laukus pirkimams ir pardavimams.
        </Typography>

        <Grid2 container spacing={3}>
          {/* Pirkimas */}
          <Grid2 size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
              Pirkimas
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label="Sandėlis"
                size="small"
                value={centasFields.pirkimas_sandelis}
                onChange={(e) =>
                  setCentasFields((prev) => ({
                    ...prev,
                    pirkimas_sandelis: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Kaštų centras"
                size="small"
                value={centasFields.pirkimas_kastu_centras}
                onChange={(e) =>
                  setCentasFields((prev) => ({
                    ...prev,
                    pirkimas_kastu_centras: e.target.value,
                  }))
                }
                fullWidth
              />
            </Stack>
          </Grid2>

          {/* Pardavimas */}
          <Grid2 size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
              Pardavimas
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label="Sandėlis"
                size="small"
                value={centasFields.pardavimas_sandelis}
                onChange={(e) =>
                  setCentasFields((prev) => ({
                    ...prev,
                    pardavimas_sandelis: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Kaštų centras"
                size="small"
                value={centasFields.pardavimas_kastu_centras}
                onChange={(e) =>
                  setCentasFields((prev) => ({
                    ...prev,
                    pardavimas_kastu_centras: e.target.value,
                  }))
                }
                fullWidth
              />
            </Stack>
          </Grid2>
        </Grid2>

        <Stack direction="row" spacing={2} sx={{ mt: 3 }} alignItems="center">
          <Button
            variant="contained"
            onClick={onSaveCentas}
            disabled={savingCentas}
          >
            Išsaugoti Centas laukus
          </Button>
          {successCentas && (
            <Alert severity="success" sx={{ py: 0.5 }}>
              Išsaugota!
            </Alert>
          )}
          {errorCentas && (
            <Alert severity="error" sx={{ py: 0.5 }}>
              {errorCentas}
            </Alert>
          )}
        </Stack>
      </Paper>
    );
  }

  // ---------- Agnum ----------
  if (program === "agnum") {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          Agnum papildomi laukai
        </Typography>

        <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
          Nurodykite numatytuosius sandėlio ir grupės laukus pirkimams ir pardavimams.
        </Typography>

        <Grid2 container spacing={3}>
          {/* Pirkimas */}
          <Grid2 size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
              Pirkimas
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label="Sandėlis"
                size="small"
                value={agnumFields.pirkimas_sandelis}
                onChange={(e) =>
                  setAgnumFields((prev) => ({
                    ...prev,
                    pirkimas_sandelis: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Grupė"
                size="small"
                value={agnumFields.pirkimas_grupe}
                onChange={(e) =>
                  setAgnumFields((prev) => ({
                    ...prev,
                    pirkimas_grupe: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Objektas"
                size="small"
                value={agnumFields.pirkimas_objektas}
                onChange={(e) =>
                  setAgnumFields((prev) => ({
                    ...prev,
                    pirkimas_objektas: e.target.value,
                  }))
                }
                fullWidth
              />
            </Stack>
          </Grid2>

          {/* Pardavimas */}
          <Grid2 size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
              Pardavimas
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label="Sandėlis"
                size="small"
                value={agnumFields.pardavimas_sandelis}
                onChange={(e) =>
                  setAgnumFields((prev) => ({
                    ...prev,
                    pardavimas_sandelis: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Grupė"
                size="small"
                value={agnumFields.pardavimas_grupe}
                onChange={(e) =>
                  setAgnumFields((prev) => ({
                    ...prev,
                    pardavimas_grupe: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Objektas"
                size="small"
                value={agnumFields.pardavimas_objektas}
                onChange={(e) =>
                  setAgnumFields((prev) => ({
                    ...prev,
                    pardavimas_objektas: e.target.value,
                  }))
                }
                fullWidth
              />
            </Stack>
          </Grid2>
        </Grid2>

        <Stack direction="row" spacing={2} sx={{ mt: 3 }} alignItems="center">
          <Button
            variant="contained"
            onClick={onSaveAgnum}
            disabled={savingAgnum}
          >
            Išsaugoti Agnum laukus
          </Button>
          {successAgnum && (
            <Alert severity="success" sx={{ py: 0.5 }}>
              Išsaugota!
            </Alert>
          )}
          {errorAgnum && (
            <Alert severity="error" sx={{ py: 0.5 }}>
              {errorAgnum}
            </Alert>
          )}
        </Stack>
      </Paper>
    );
  }


// ---------- Debetas ----------
  if (program === "debetas") {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          Debetas papildomi laukai
        </Typography>

        <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
          Nurodykite numatytuosius filialo, padalinio, objekto ir atsakingų asmenų laukus pirkimams ir pardavimams.
        </Typography>

        <Grid2 container spacing={3}>
          {/* Pirkimas */}
          <Grid2 size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
              Pirkimas
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label="Filialas"
                size="small"
                value={debetasFields.pirkimas_filialas}
                onChange={(e) =>
                  setDebetasFields((prev) => ({
                    ...prev,
                    pirkimas_filialas: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Padalinys"
                size="small"
                value={debetasFields.pirkimas_padalinys}
                onChange={(e) =>
                  setDebetasFields((prev) => ({
                    ...prev,
                    pirkimas_padalinys: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Objektas"
                size="small"
                value={debetasFields.pirkimas_objektas}
                onChange={(e) =>
                  setDebetasFields((prev) => ({
                    ...prev,
                    pirkimas_objektas: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Materialiai atsakingas asmuo"
                size="small"
                value={debetasFields.pirkimas_materialiai_atsakingas_asmuo}
                onChange={(e) =>
                  setDebetasFields((prev) => ({
                    ...prev,
                    pirkimas_materialiai_atsakingas_asmuo: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Atskaitingas asmuo"
                size="small"
                value={debetasFields.pirkimas_atskaitingas_asmuo}
                onChange={(e) =>
                  setDebetasFields((prev) => ({
                    ...prev,
                    pirkimas_atskaitingas_asmuo: e.target.value,
                  }))
                }
                fullWidth
              />
            </Stack>
          </Grid2>

          {/* Pardavimas */}
          <Grid2 size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
              Pardavimas
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label="Filialas"
                size="small"
                value={debetasFields.pardavimas_filialas}
                onChange={(e) =>
                  setDebetasFields((prev) => ({
                    ...prev,
                    pardavimas_filialas: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Padalinys"
                size="small"
                value={debetasFields.pardavimas_padalinys}
                onChange={(e) =>
                  setDebetasFields((prev) => ({
                    ...prev,
                    pardavimas_padalinys: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Objektas"
                size="small"
                value={debetasFields.pardavimas_objektas}
                onChange={(e) =>
                  setDebetasFields((prev) => ({
                    ...prev,
                    pardavimas_objektas: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Materialiai atsakingas asmuo"
                size="small"
                value={debetasFields.pardavimas_materialiai_atsakingas_asmuo}
                onChange={(e) =>
                  setDebetasFields((prev) => ({
                    ...prev,
                    pardavimas_materialiai_atsakingas_asmuo: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Atskaitingas asmuo"
                size="small"
                value={debetasFields.pardavimas_atskaitingas_asmuo}
                onChange={(e) =>
                  setDebetasFields((prev) => ({
                    ...prev,
                    pardavimas_atskaitingas_asmuo: e.target.value,
                  }))
                }
                fullWidth
              />
            </Stack>
          </Grid2>
        </Grid2>

        <Stack direction="row" spacing={2} sx={{ mt: 3 }} alignItems="center">
          <Button
            variant="contained"
            onClick={onSaveDebetas}
            disabled={savingDebetas}
          >
            Išsaugoti Debetas laukus
          </Button>
          {successDebetas && (
            <Alert severity="success" sx={{ py: 0.5 }}>
              Išsaugota!
            </Alert>
          )}
          {errorDebetas && (
            <Alert severity="error" sx={{ py: 0.5 }}>
              {errorDebetas}
            </Alert>
          )}
        </Stack>
      </Paper>
    );
  }  

  // ---------- Site.pro ----------
  if (program === "site_pro") {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          Site.pro (B1) papildomi laukai
        </Typography>

        <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
          Nurodykite numatytuosius sandėlio ir objekto laukus pirkimams ir pardavimams.
        </Typography>

        <Grid2 container spacing={3}>
          {/* Pirkimas */}
          <Grid2 size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
              Pirkimas
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label="Prekės grupė"
                size="small"
                value={siteProFields.pirkimas_prekes_grupe}
                onChange={(e) =>
                  setSiteProFields((prev) => ({
                    ...prev,
                    pirkimas_prekes_grupe: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Sandėlis"
                size="small"
                value={siteProFields.pirkimas_sandelis}
                onChange={(e) =>
                  setSiteProFields((prev) => ({
                    ...prev,
                    pirkimas_sandelis: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Darbuotojas"
                size="small"
                value={siteProFields.pirkimas_darbuotojas}
                onChange={(e) =>
                  setSiteProFields((prev) => ({
                    ...prev,
                    pirkimas_darbuotojas: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Kaštų centras"
                size="small"
                value={siteProFields.pirkimas_kastu_centras}
                onChange={(e) =>
                  setSiteProFields((prev) => ({
                    ...prev,
                    pirkimas_kastu_centras: e.target.value,
                  }))
                }
                fullWidth
              />
            </Stack>
          </Grid2>

          {/* Pardavimas */}
          <Grid2 size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
              Pardavimas
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label="Prekės grupė"
                size="small"
                value={siteProFields.pardavimas_prekes_grupe}
                onChange={(e) =>
                  setSiteProFields((prev) => ({
                    ...prev,
                    pardavimas_prekes_grupe: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Sandėlis"
                size="small"
                value={siteProFields.pardavimas_sandelis}
                onChange={(e) =>
                  setSiteProFields((prev) => ({
                    ...prev,
                    pardavimas_sandelis: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Darbuotojas"
                size="small"
                value={siteProFields.pardavimas_darbuotojas}
                onChange={(e) =>
                  setSiteProFields((prev) => ({
                    ...prev,
                    pardavimas_darbuotojas: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Kaštų centras"
                size="small"
                value={siteProFields.pardavimas_kastu_centras}
                onChange={(e) =>
                  setSiteProFields((prev) => ({
                    ...prev,
                    pardavimas_kastu_centras: e.target.value,
                  }))
                }
                fullWidth
              />
            </Stack>
          </Grid2>
        </Grid2>

        <Stack direction="row" spacing={2} sx={{ mt: 3 }} alignItems="center">
          <Button
            variant="contained"
            onClick={onSaveSitePro}
            disabled={savingSitePro}
          >
            Išsaugoti Site.pro (B1) laukus
          </Button>
          {successSitePro && (
            <Alert severity="success" sx={{ py: 0.5 }}>
              Išsaugota!
            </Alert>
          )}
          {errorSitePro && (
            <Alert severity="error" sx={{ py: 0.5 }}>
              {errorSitePro}
            </Alert>
          )}
        </Stack>
      </Paper>
    );
  }

  // Kitos programos neturi papildomų laukų
  return null;
}

