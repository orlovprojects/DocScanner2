import { useEffect, useRef, useState } from "react";
import {
  Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, IconButton, MenuItem, Paper, Stack,
  TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useNavigate } from "react-router-dom";

import { api, apiError } from "../api";
import { useAuth } from "../auth";

const emptyChild = () => ({ first_name: "", birth_date: "", has_disability: false });

// Taip / Ne - dideli mygtukai vietoj radio
function YesNo({ value, onChange, disabled }) {
  return (
    <ToggleButtonGroup exclusive fullWidth value={value === null ? null : value ? "yes" : "no"} disabled={disabled}
      onChange={(_, v) => v && onChange(v === "yes")} sx={{ mt: 1 }}>
      <ToggleButton value="yes" sx={{ py: 1.25, fontSize: "1rem" }}>Taip</ToggleButton>
      <ToggleButton value="no" sx={{ py: 1.25, fontSize: "1rem" }}>Ne</ToggleButton>
    </ToggleButtonGroup>
  );
}

function Question({ title, hint, children }) {
  return (
    <Box>
      <Typography fontWeight={600}>{title}</Typography>
      {hint && <Typography variant="body2" color="text.secondary">{hint}</Typography>}
      {children}
    </Box>
  );
}

function ibanOk(v) {
  const s = (v || "").replace(/\s/g, "").toUpperCase();
  if (s.length < 15 || !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s)) return false;
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let m = 0;
  for (const ch of r) m = (m * 10 + Number(ch)) % 97;
  return m === 1;
}

export default function Anketa() {
  const { me, refresh } = useAuth();
  const [f, setF] = useState(null);
  const [hasKids, setHasKids] = useState(null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const top = useRef(null);
  const nav = useNavigate();
  const first = me.employee.data_status !== "complete";
  const readOnly = me.employee.read_only;
  const set = (v) => { setF((s) => ({ ...s, ...v })); setSaved(false); };

  useEffect(() => {
    api.get("anketa/").then((r) => {
      setF(r.data);
      setHasKids(r.data.children.length > 0 ? true : first ? null : false);
    }).catch((e) => setError(apiError(e)));
  }, [first]);

  if (!f) return error ? <Alert severity="error">{error}</Alert> : <CircularProgress />;

  const setChild = (i, v) => set({ children: f.children.map((c, j) => (j === i ? { ...c, ...v } : c)) });

  const validate = () => {
    const e = {};
    if (!f.address.trim()) e.address = "Įrašykite adresą";
    if (!ibanOk(f.iban)) e.iban = "Patikrinkite sąskaitos numerį (pvz. LT12 3456 ...)";
    if (hasKids === null) e.kids = "Pasirinkite Taip arba Ne";
    if (hasKids) f.children.forEach((c, i) => { if (!c.birth_date) e[`child${i}`] = "Nurodykite gimimo datą"; });
    return e;
  };

  const save = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      setError("Patikrinkite pažymėtus laukus");
      top.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setBusy(true); setError("");
    try {
      await api.put("anketa/", { ...f, children: hasKids ? f.children : [], single_parent: hasKids ? f.single_parent : false });
      await refresh();
      if (first) nav("/", { replace: true });
      else { setSaved(true); top.current?.scrollIntoView({ behavior: "smooth" }); }
    } catch (err) {
      setError(apiError(err));
      top.current?.scrollIntoView({ behavior: "smooth" });
    } finally { setBusy(false); }
  };

  return (
    <Stack gap={2.5} ref={top}>
      <Box>
        <Typography variant="h5" fontWeight={700}>{first ? "Užpildykite savo duomenis" : "Mano duomenys"}</Typography>
        {first && <Typography color="text.secondary">Tai užtruks apie 3 minutes. Duomenys reikalingi atlyginimui ir darbo sutarčiai.</Typography>}
      </Box>
      {saved && <Alert severity="success">Pakeitimai išsaugoti</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography fontWeight={700} mb={1.5}>Kontaktai ir sąskaita</Typography>
        <Stack gap={2}>
          <TextField label="Gyvenamosios vietos adresas" value={f.address} onChange={(e) => set({ address: e.target.value })}
            placeholder="Gatvė, namas, butas, miestas" disabled={readOnly} error={!!errors.address} helperText={errors.address} />
          <TextField label="Banko sąskaita (IBAN)" value={f.iban} disabled={readOnly}
            onChange={(e) => set({ iban: e.target.value.toUpperCase().replace(/\s/g, "") })}
            error={!!errors.iban} helperText={errors.iban || "Į ją bus pervedamas atlyginimas"} placeholder="LT00 0000 0000 0000 0000" />
          <TextField label="Telefonas (nebūtina)" value={f.phone} onChange={(e) => set({ phone: e.target.value })} disabled={readOnly} inputProps={{ inputMode: "tel" }} />
          <TextField label="El. paštas (nebūtina)" value={f.email} onChange={(e) => set({ email: e.target.value })} disabled={readOnly} inputProps={{ inputMode: "email", autoCapitalize: "none" }} />
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography fontWeight={700} mb={1.5}>Mokesčiai</Typography>
        <Stack gap={3}>
          <Question title="Ar dirbate dar kitoje darbovietėje, kur jums taikomas NPD?"
            hint="NPD mažina pajamų mokestį, bet taikomas tik vienoje darbovietėje. Jei dirbate tik čia – rinkitės „Ne“.">
            <YesNo value={f.works_elsewhere_with_npd} onChange={(v) => set({ works_elsewhere_with_npd: v })} disabled={readOnly} />
          </Question>
          <Question title="Ar kaupiate pensijai II pakopoje?" hint="Nežinote? Tai matyti „Sodros“ savitarnoje arba pensijų fondo sutartyje.">
            <YesNo value={f.pension_accumulation} onChange={(v) => set({ pension_accumulation: v })} disabled={readOnly} />
          </Question>
          <TextField select label="Ar jums nustatytas dalyvumo lygis (negalia)?" value={f.participation_level}
            onChange={(e) => set({ participation_level: e.target.value })} disabled={readOnly}
            SelectProps={{ MenuProps: { disableScrollLock: true } }} helperText="Iki 2024 m. vadinosi darbingumo lygiu">
            <MenuItem value="none">Ne</MenuItem>
            <MenuItem value="30_55">Taip, 30–55 %</MenuItem>
            <MenuItem value="0_25">Taip, 0–25 %</MenuItem>
          </TextField>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Question title="Ar auginate vaikų iki 18 metų?"
          hint="Jei taip – jums gali priklausyti papildomos poilsio dienos (mamadieniai / tėvadieniai) ir ilgesnės atostogos.">
          <YesNo value={hasKids} disabled={readOnly} onChange={(v) => {
            setHasKids(v);
            if (v && f.children.length === 0) set({ children: [emptyChild()] });
          }} />
          {errors.kids && <Typography variant="caption" color="error">{errors.kids}</Typography>}
        </Question>

        {hasKids && (
          <Stack gap={1.5} mt={2}>
            {f.children.map((c, i) => (
              <Paper key={i} variant="outlined" sx={{ p: 1.5, bgcolor: "action.hover" }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography fontWeight={600}>{i + 1}-as vaikas</Typography>
                  {!readOnly && f.children.length > 1 && (
                    <IconButton aria-label="Pašalinti vaiką" onClick={() => set({ children: f.children.filter((_, j) => j !== i) })}>
                      <DeleteOutlineIcon />
                    </IconButton>
                  )}
                </Stack>
                <Stack gap={1.5}>
                  <TextField label="Vardas (nebūtina)" value={c.first_name} onChange={(e) => setChild(i, { first_name: e.target.value })} disabled={readOnly} />
                  <TextField label="Gimimo data" type="date" value={c.birth_date || ""} InputLabelProps={{ shrink: true }} disabled={readOnly}
                    onChange={(e) => setChild(i, { birth_date: e.target.value })}
                    error={!!errors[`child${i}`]} helperText={errors[`child${i}`]} />
                  <FormControlLabel control={<Checkbox checked={c.has_disability} onChange={(e) => setChild(i, { has_disability: e.target.checked })} />}
                    label="Vaikui nustatyta negalia" disabled={readOnly} />
                </Stack>
              </Paper>
            ))}
            {!readOnly && (
              <Button variant="outlined" size="large" startIcon={<AddIcon />} onClick={() => set({ children: [...f.children, emptyChild()] })}>
                Pridėti dar vieną vaiką
              </Button>
            )}
            <FormControlLabel control={<Checkbox checked={f.single_parent} onChange={(e) => set({ single_parent: e.target.checked })} />}
              label="Vaiką (vaikus) auginu vienas (-a)" disabled={readOnly} />
          </Stack>
        )}
      </Paper>

      {!readOnly && (
        <Button variant="contained" size="large" disabled={busy} onClick={save}>
          {first ? "Išsaugoti ir tęsti" : "Išsaugoti pakeitimus"}
        </Button>
      )}
    </Stack>
  );
}
