import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  InputAdornment, Link, Paper, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";

import { MONTHS, apiError, payrollApi } from "../../api/payroll";

const STATUS_COLOR = { ready: "info", error: "error", submitted: "warning", accepted: "success", rejected: "error" };
const WHERE = {
  Sodra: "Įkelkite failą į Sodros EDAS (pranešimų pateikimas iš failo) ir pasirašykite.",
  VMI: "Įkelkite failą į VMI EDS: Deklaravimas → Persiųsti užpildytą formą.",
};
const G_FIELDS = [
  ["g8", "8. Su darbo santykiais nesusijusios A kl. išmokos (pvz. dividendai)"],
  ["g9", "9. Jų GPM, išmokėtų iki 15 d."],
  ["g10", "10. Jų GPM, išmokėtų po 15 d."],
  ["g11", "11. B klasės išmokos, nuo kurių išskaičiuotas GPM"],
  ["g12", "12. GPM nuo B klasės išmokų"],
];

function prevMonth() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export default function DeklaracijosPage() {
  const [{ year, month }, setYm] = useState(prevMonth);
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [gpm, setGpm] = useState(null); // {item, values}

  const load = useCallback(() => {
    setItems(null);
    payrollApi.declarations(year, month).then(setItems).catch((e) => { setError(apiError(e)); setItems([]); });
  }, [year, month]);
  useEffect(() => { load(); }, [load]);

  const shift = (n) => { const d = new Date(year, month - 1 + n, 1); setYm({ year: d.getFullYear(), month: d.getMonth() + 1 }); };

  const generate = async (it, manual) => {
    setBusy(`${it.form}-${it.contract || ""}`); setError("");
    try { await payrollApi.generateDeclaration({ form: it.form, year, month, contract: it.contract, manual }); load(); }
    catch (e) { setError(apiError(e)); } finally { setBusy(null); }
  };
  const download = async (it) => {
    const blob = await payrollApi.declarationFile(it.declaration.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${it.form}_${year}-${String(month).padStart(2, "0")}.ffdata`; a.click();
    URL.revokeObjectURL(url);
  };
  const submitVmi = async (it) => {
    setBusy(`${it.form}-${it.contract || ""}`); setError("");
    try { await payrollApi.submitDeclaration(it.declaration.id); load(); }
    catch (e) { setError(apiError(e)); } finally { setBusy(null); }
  };
  const checkState = async (it) => {
    try { await payrollApi.checkDeclaration(it.declaration.id); load(); } catch (e) { setError(apiError(e)); }
  };
  const mark = async (it, status) => {
    try { await payrollApi.declarationStatus(it.declaration.id, status); load(); } catch (e) { setError(apiError(e)); }
  };

  const today = new Date().toISOString().slice(0, 10);
  const monthly = items?.filter((i) => ["SAM", "GPM313"].includes(i.form)) || [];
  const people = items?.filter((i) => ["1-SD", "2-SD"].includes(i.form)) || [];

  const Row = ({ it }) => {
    const d = it.declaration;
    const overdue = it.deadline < today && !["submitted", "accepted"].includes(d?.status);
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5}>
          <Box>
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
              <Chip size="small" label={it.authority} variant="outlined" />
              <Typography fontWeight={700}>{it.title}</Typography>
              {d && <Chip size="small" label={d.status_label} color={STATUS_COLOR[d.status]} />}
            </Stack>
            <Typography variant="body2" color={overdue ? "error" : "text.secondary"} mt={0.5}>
              Pateikti iki {it.deadline}{overdue ? " – terminas praėjo" : ""}
            </Typography>
            {d?.submitted_at && <Typography variant="caption" color="text.secondary">Pateikta {new Date(d.submitted_at).toLocaleDateString("lt-LT")}</Typography>}
          </Box>
          <Stack direction="row" gap={1} alignItems="flex-start" flexWrap="wrap">
            {it.form === "GPM313" && (
              <Button size="small" onClick={() => setGpm({ it, values: Object.fromEntries(G_FIELDS.map(([k]) => [k, d?.manual_values?.[k] || ""])) })}>
                Kitos išmokos
              </Button>
            )}
            <Button size="small" variant={d ? "outlined" : "contained"} disabled={busy === `${it.form}-${it.contract || ""}`}
              onClick={() => generate(it, d?.manual_values)}>
              {d ? "Paruošti iš naujo" : "Paruošti"}
            </Button>
            {d && d.status === "ready" && it.form === "GPM313" && (
              <Button size="small" variant="contained" disabled={busy === `${it.form}-${it.contract || ""}`} onClick={() => submitVmi(it)}>
                Pateikti VMI
              </Button>
            )}
            {d && d.status !== "error" && (
              <Button size="small" variant={it.form === "GPM313" ? "outlined" : "contained"} startIcon={<DownloadOutlinedIcon />} onClick={() => download(it)}>.ffdata</Button>
            )}
            {d && d.status === "submitted" && it.form === "GPM313" && <Button size="small" onClick={() => checkState(it)}>Tikrinti būseną</Button>}
            {d && d.status === "ready" && <Button size="small" onClick={() => mark(it, "submitted")}>Pažymėti pateikta</Button>}
            {d && d.status === "submitted" && <Button size="small" color="success" onClick={() => mark(it, "accepted")}>Priimta</Button>}
          </Stack>
        </Stack>
        {d?.errors?.length > 0 && (
          <Alert severity={d.status === "error" ? "error" : "warning"} sx={{ mt: 1.5 }}>
            {d.errors.map((e, i) => <div key={i}>{e}</div>)}
          </Alert>
        )}
        {d && d.status === "ready" && it.form !== "GPM313" && (
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>{WHERE[it.authority]}</Typography>
        )}
        {d && d.status === "submitted" && d.external_status && (
          <Alert severity="info" sx={{ mt: 1.5 }}>
            <b>{d.external_status}.</b>{" "}
            {d.external_status === "Laukia patvirtinimo EDS" && (
              <>Patvirtinkite <Link href="https://deklaravimas.vmi.lt" target="_blank" rel="noopener">EDS</Link>: Deklaravimas → Patvirtinti užpildytą formą. </>
            )}
            {d.external_message}
          </Alert>
        )}
      </Paper>
    );
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000 }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={2} mb={2}>
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography variant="h5" fontWeight={700}>Deklaracijos</Typography>
          <Tooltip title="Atnaujinti">
            <IconButton onClick={load} sx={{ border: 1, borderColor: "divider", borderRadius: "50%" }}><RefreshIcon /></IconButton>
          </Tooltip>
        </Stack>
        <Stack direction="row" alignItems="center" gap={1}>
          <IconButton onClick={() => shift(-1)}><ChevronLeftIcon /></IconButton>
          <Typography fontWeight={700} sx={{ minWidth: 150, textAlign: "center" }}>{year} m. {MONTHS[month - 1].toLowerCase()}</Typography>
          <IconButton onClick={() => shift(1)}><ChevronRightIcon /></IconButton>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!items ? <CircularProgress /> : (
        <Stack gap={3}>
          <Box>
            <Typography fontWeight={700} mb={1}>Mėnesio deklaracijos</Typography>
            <Stack gap={1.5}>{monthly.map((it) => <Row key={`${it.form}-${it.contract || ""}`} it={it} />)}</Stack>
            <Typography variant="caption" color="text.secondary" display="block" mt={1}>
              SAM – už mėnesį, kurį priskaičiuotas atlyginimas. GPM313 – už mėnesį, kurį atlyginimas išmokėtas.
            </Typography>
          </Box>
          <Box>
            <Typography fontWeight={700} mb={1}>Darbuotojų priėmimas ir atleidimas</Typography>
            {people.length === 0
              ? <Typography color="text.secondary">Šį mėnesį darbuotojų nepriimta ir neatleista.</Typography>
              : <Stack gap={1.5}>{people.map((it) => <Row key={`${it.form}-${it.contract || ""}`} it={it} />)}</Stack>}
          </Box>
        </Stack>
      )}

      <Dialog open={!!gpm} onClose={() => setGpm(null)} fullWidth maxWidth="sm" disableScrollLock>
        <DialogTitle>GPM313: kitos išmokos</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Atlyginimų sumos (5–7 laukeliai) užpildomos automatiškai. Čia nurodykite kitas per mėnesį išmokėtas sumas, jei jų buvo.
          </Typography>
          <Stack gap={2}>
            {G_FIELDS.map(([k, label]) => (
              <TextField key={k} label={label} type="number" value={gpm?.values[k] ?? ""}
                onChange={(e) => setGpm({ ...gpm, values: { ...gpm.values, [k]: e.target.value } })}
                InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }} />
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGpm(null)}>Atšaukti</Button>
          <Button variant="contained" onClick={() => { const { it, values } = gpm; setGpm(null); generate(it, values); }}>
            Išsaugoti ir paruošti
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
