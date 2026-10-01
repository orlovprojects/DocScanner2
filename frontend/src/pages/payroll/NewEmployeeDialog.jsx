import { useEffect, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControl, FormControlLabel, IconButton, InputAdornment, InputLabel, Link, MenuItem, Radio,
  RadioGroup, Select, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { MuiTelInput } from "mui-tel-input";

import LtDatePicker from "../../components/LtDatePicker"; // ⚠ pataisyk kelią, jei komponentas kitur
import { CONTRACT_TYPES, NPD_MODES, apiError, money, payrollApi } from "../../api/payroll";
import { estimateNet } from "./payrollEstimate";
import { parsePersonalCode } from "./personalCode";

const MENU_PROPS = { disableScrollLock: true };
const today = () => new Date().toISOString().slice(0, 10);
const QUICK_HOURS = [40, 30, 20, 10];

const EMPTY = {
  first_name: "", last_name: "", personal_code: "", is_foreigner: false, birth_date: "", gender: "",
  email: "", phone: "+370",
  position_id: null, position_name: "", lpk_code: "", lpk_title: "", custom_title: "",
  start_date: today(), sodra_contract_type: "01", sodra_contract_subtype: "", end_date: "",
  pay_form: "monthly", base_amount: "", weekly_hours: 40, full_time_hours: 40, shortened: false,
  extended_leave_days: "", extra_leave_days: "",
  fill_mode: "invite",
  iban: "", address: "", npd_mode: "standard", pension_accumulation: false, single_parent: false,
};

function Section({ title, children, sx }) {
  return (
    <Box sx={{ mb: 3, ...sx }}>
      <Typography fontWeight={700} mb={1.5}>{title}</Typography>
      <Stack gap={2}>{children}</Stack>
    </Box>
  );
}

// ---------- Pareigos: įmonės pareigos + LPK paieška ----------
export function PositionPicker({ c, set }) {
  const [input, setInput] = useState("");
  const [opts, setOpts] = useState({ positions: [], lpk: [] });
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => payrollApi.searchPositions(input).then(setOpts).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [input]);

  const options = [
    ...opts.positions.map((p) => ({ kind: "pos", key: `p${p.id}`, label: p.name, sub: p.lpk_code ? `LPK ${p.lpk_code}` : "", p })),
    ...opts.lpk.map((l) => ({ kind: "lpk", key: `l${l.code}`, label: l.title, sub: `${l.name} · ${l.code}`, l })),
  ];
  const value = c.position_id
    ? { kind: "pos", key: `p${c.position_id}`, label: c.position_name, sub: "" }
    : c.lpk_code ? { kind: "lpk", key: `l${c.lpk_code}`, label: c.lpk_title, sub: "" } : null;
  const sameCode = c.lpk_code && !c.position_id ? opts.positions.filter((p) => p.lpk_code === c.lpk_code) : [];

  const pick = (o) => {
    if (!o) return set({ position_id: null, position_name: "", lpk_code: "", lpk_title: "", custom_title: "" });
    if (o.kind === "pos") return set({ position_id: o.p.id, position_name: o.p.name, lpk_code: o.p.lpk_code, lpk_title: "", custom_title: "" });
    set({ position_id: null, position_name: "", lpk_code: o.l.code, lpk_title: o.l.title, custom_title: "" });
  };

  return (
    <Box>
      <Autocomplete
        fullWidth options={options} value={value} filterOptions={(x) => x}
        groupBy={(o) => (o.kind === "pos" ? "Jūsų įmonės pareigos" : "Profesijų klasifikatorius")}
        getOptionLabel={(o) => o.label || ""} isOptionEqualToValue={(a, b) => a.key === b.key}
        onInputChange={(_, v, reason) => reason === "input" && setInput(v)}
        onChange={(_, o) => { pick(o); setCustom(false); }}
        noOptionsText={input.length < 2 ? "Įveskite bent 2 raides" : "Nerasta"}
        renderOption={(props, o) => (
          <li {...props} key={o.key}>
            <Box>
              <Typography fontSize={14}>{o.label}</Typography>
              {o.sub && <Typography variant="caption" color="text.secondary">{o.sub}</Typography>}
            </Box>
          </li>
        )}
        renderInput={(params) => <TextField {...params} label="Pareigos" required placeholder="Pradėkite rašyti, pvz. buhalt" />}
      />
      {sameCode.length > 0 && (
        <Alert severity="info" sx={{ mt: 1 }}
          action={<Button color="inherit" size="small" onClick={() => pick({ kind: "pos", p: sameCode[0] })}>Naudoti</Button>}>
          Įmonėje jau yra „{sameCode[0].name}“ su šiuo kodu. Ar tai ta pati pareigybė?
        </Alert>
      )}
      {c.lpk_code && !c.position_id && (
        custom ? (
          <TextField size="small" fullWidth sx={{ mt: 1 }} label="Pavadinimas sutartyje" value={c.custom_title}
            onChange={(e) => set({ custom_title: e.target.value })}
            helperText={`Profesija pagal klasifikatorių: ${c.lpk_title} (${c.lpk_code})`} autoFocus />
        ) : (
          <Button size="small" sx={{ mt: 0.5, px: 0 }} onClick={() => setCustom(true)}>+ Kitas pavadinimas sutartyje</Button>
        )
      )}
    </Box>
  );
}

// ---------- Dialogas ----------
export default function NewEmployeeDialog({ open, onClose, onCreated }) {
  const [f, setF] = useState(EMPTY);
  const [positions, setPositions] = useState([]);
  const [leave, setLeave] = useState(null);
  const [leaveEdit, setLeaveEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (v) => setF((s) => ({ ...s, ...v }));

  useEffect(() => {
    if (!open) return;
    setF({ ...EMPTY, start_date: today() }); setError(""); setLeaveEdit(false);
    payrollApi.positions().then(setPositions).catch(() => {});
  }, [open]);

  const pc = f.is_foreigner ? null : f.personal_code ? parsePersonalCode(f.personal_code) : null;
  const type = CONTRACT_TYPES.find((t) => t.value === f.sodra_contract_type);
  const fixedTerm = ["02", "04", "05"].includes(f.sodra_contract_type) || f.sodra_contract_subtype?.endsWith("1");
  const needsEnd = f.sodra_contract_type === "02" || f.sodra_contract_subtype?.endsWith("1");
  const workload = Number(f.weekly_hours || 0) / Number(f.full_time_hours || 40);
  const monthlyGross = f.pay_form === "monthly" ? Number(f.base_amount) : Number(f.base_amount) * Number(f.weekly_hours || 0) * 52 / 12;
  const hasContact = !!f.email || (f.phone && f.phone.replace(/\D/g, "").length > 6);

  // atostogų trukmė iš backend (viena taisyklių vieta)
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      payrollApi.leavePreview({
        personal_code: f.is_foreigner ? "" : f.personal_code, birth_date: f.is_foreigner ? f.birth_date : "",
        start_date: f.start_date, weekly_days: 5,
        has_disability: ["d30_55", "d0_25"].includes(f.npd_mode), single_parent: f.single_parent,
        extended_leave_days: f.extended_leave_days, extra_leave_days: f.extra_leave_days,
      }).then(setLeave).catch(() => setLeave(null));
    }, 250);
    return () => clearTimeout(t);
  }, [open, f.personal_code, f.is_foreigner, f.birth_date, f.start_date, f.npd_mode, f.single_parent, f.extended_leave_days, f.extra_leave_days]);

  const errors = [];
  if (!f.first_name || !f.last_name) errors.push("vardas ir pavardė");
  if (!f.is_foreigner && !pc?.valid) errors.push("teisingas asmens kodas");
  if (f.is_foreigner && (!f.birth_date || !f.gender)) errors.push("gimimo data ir lytis");
  if (!f.position_id && !f.lpk_code) errors.push("pareigos");
  if (!f.start_date) errors.push("darbo pradžia");
  if (!(Number(f.base_amount) > 0)) errors.push("atlyginimas");
  if (!(Number(f.weekly_hours) > 0)) errors.push("darbo valandos");
  if (type?.subtypes && !f.sodra_contract_subtype) errors.push("ar sutartis terminuota");
  if (needsEnd && !f.end_date) errors.push("darbo pabaiga");
  if (f.fill_mode === "invite" && !hasContact) errors.push("el. paštas arba telefonas anketai išsiųsti");

  const save = async () => {
    setSaving(true); setError("");
    try {
      const manual = f.fill_mode === "manual";
      const emp = await payrollApi.createEmployee({
        first_name: f.first_name.trim(), last_name: f.last_name.trim(),
        personal_code: f.is_foreigner ? "" : f.personal_code, is_foreigner: f.is_foreigner,
        ...(f.is_foreigner ? { birth_date: f.birth_date, gender: f.gender } : {}),
        email: f.email, phone: f.phone.replace(/\D/g, "").length > 6 ? f.phone.replace(/\s/g, "") : "",
        data_status: manual ? "complete" : "awaiting_employee",
        ...(manual ? {
          iban: f.iban, address: f.address, npd_mode: f.npd_mode, pension_accumulation: f.pension_accumulation,
          single_parent: f.single_parent, has_disability: ["d30_55", "d0_25"].includes(f.npd_mode),
        } : {}),
      });
      let pos = f.position_id ? { id: f.position_id } : null;
      if (!pos) {
        const name = (f.custom_title || f.lpk_title).trim();
        pos = positions.find((p) => p.lpk_code === f.lpk_code && p.name.toLowerCase() === name.toLowerCase())
          || await payrollApi.createPosition({ name, lpk_code: f.lpk_code });
      }
      const c = await payrollApi.createContract({
        employee: emp.id, start_date: f.start_date, end_date: f.end_date || null,
        sodra_contract_type: f.sodra_contract_type, sodra_contract_subtype: f.sodra_contract_subtype, status: "active",
        extra_leave_days: Number(f.extra_leave_days) || 0,
        extended_leave_days: f.extended_leave_days ? Number(f.extended_leave_days) : null,
      });
      await payrollApi.createTerms({
        contract: c.id, valid_from: f.start_date, position: pos.id, pay_form: f.pay_form, base_amount: f.base_amount,
        workload: workload.toFixed(3), full_time_hours: f.full_time_hours,
      });
      onCreated(emp.id);
    } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  };

  const est = f.fill_mode === "manual" ? estimateNet({
    gross: monthlyGross, npdMode: f.npd_mode, pension: f.pension_accumulation, fixedTerm, date: f.start_date,
  }) : estimateNet({ gross: monthlyGross, fixedTerm, date: f.start_date });
  const minWage = f.pay_form === "monthly" && Number(f.base_amount) > 0 && Number(f.base_amount) < (est?.mma || 1153) * workload;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" disableScrollLock>
      <DialogTitle sx={{ pr: 6 }}>
        Naujas darbuotojas
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 12, top: 12 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {/* ---------- Asmuo ---------- */}
        <Section title="Asmuo">
          <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
            <TextField label="Vardas" value={f.first_name} onChange={(e) => set({ first_name: e.target.value })} fullWidth required autoFocus />
            <TextField label="Pavardė" value={f.last_name} onChange={(e) => set({ last_name: e.target.value })} fullWidth required />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} gap={2} alignItems={{ sm: "flex-start" }}>
            {!f.is_foreigner && (
              <TextField label="Asmens kodas" value={f.personal_code} required sx={{ width: { sm: 260 } }}
                inputProps={{ inputMode: "numeric", maxLength: 11 }}
                onChange={(e) => set({ personal_code: e.target.value.replace(/\D/g, "") })}
                error={!!f.personal_code && f.personal_code.length === 11 && !pc?.valid}
                helperText={!f.personal_code ? " " : pc?.valid
                  ? `Gimė ${pc.birth_date} · ${pc.gender === "M" ? "vyras" : "moteris"}`
                  : f.personal_code.length === 11 ? pc?.error : " "} />
            )}
            {f.is_foreigner && (
              <>
                <Box sx={{ width: { sm: 200 } }}>
                  <LtDatePicker label="Gimimo data *" value={f.birth_date} onChange={(v) => set({ birth_date: v })} size="medium" />
                </Box>
                <FormControl sx={{ minWidth: 160 }}>
                  <InputLabel>Lytis *</InputLabel>
                  <Select label="Lytis *" value={f.gender} MenuProps={MENU_PROPS} onChange={(e) => set({ gender: e.target.value })}>
                    <MenuItem value="M">Vyras</MenuItem><MenuItem value="F">Moteris</MenuItem>
                  </Select>
                </FormControl>
              </>
            )}
            <FormControlLabel sx={{ mt: 1 }} control={<Checkbox checked={f.is_foreigner} onChange={(e) => set({ is_foreigner: e.target.checked })} />}
              label="Užsienietis (neturi LT asmens kodo)" />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
            <TextField label="El. paštas" type="email" value={f.email} onChange={(e) => set({ email: e.target.value.trim() })} fullWidth />
            <MuiTelInput label="Telefonas" value={f.phone} onChange={(v) => set({ phone: v })} defaultCountry="LT"
              preferredCountries={["LT", "LV", "PL", "UA"]} fullWidth MenuProps={MENU_PROPS} />
          </Stack>
        </Section>

        <Divider sx={{ mb: 3 }} />

        {/* ---------- Darbas ---------- */}
        <Section title="Darbas">
          <PositionPicker c={f} set={set} />
          <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
            <Box sx={{ width: { sm: 200 }, flexShrink: 0 }}>
              <LtDatePicker label="Darbo pradžia *" value={f.start_date} onChange={(v) => set({ start_date: v })} size="medium" />
            </Box>
            <FormControl fullWidth>
              <InputLabel>Sutarties rūšis</InputLabel>
              <Select label="Sutarties rūšis" value={f.sodra_contract_type} MenuProps={MENU_PROPS}
                onChange={(e) => set({ sodra_contract_type: e.target.value, sodra_contract_subtype: "" })}>
                {CONTRACT_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
          {(type?.subtypes || needsEnd) && (
            <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
              {type?.subtypes && (
                <FormControl fullWidth>
                  <InputLabel>Ar terminuota?</InputLabel>
                  <Select label="Ar terminuota?" value={f.sodra_contract_subtype} MenuProps={MENU_PROPS}
                    onChange={(e) => set({ sodra_contract_subtype: e.target.value })}>
                    <MenuItem value={`${f.sodra_contract_type}1`}>Terminuota</MenuItem>
                    <MenuItem value={`${f.sodra_contract_type}2`}>Neterminuota</MenuItem>
                  </Select>
                </FormControl>
              )}
              {needsEnd && (
                <Box sx={{ width: { sm: 200 }, flexShrink: 0 }}>
                  <LtDatePicker label="Darbo pabaiga *" value={f.end_date} onChange={(v) => set({ end_date: v })} size="medium" />
                </Box>
              )}
            </Stack>
          )}

          <Stack direction={{ xs: "column", sm: "row" }} gap={2} alignItems={{ sm: "center" }}>
            <ToggleButtonGroup exclusive size="small" value={f.pay_form} onChange={(_, v) => v && set({ pay_form: v })}>
              <ToggleButton value="monthly">Mėnesinė alga</ToggleButton>
              <ToggleButton value="hourly">Valandinis</ToggleButton>
            </ToggleButtonGroup>
            <TextField label={f.pay_form === "monthly" ? "Alga „ant popieriaus“" : "Už valandą „ant popieriaus“"} required
              type="number" value={f.base_amount} onChange={(e) => set({ base_amount: e.target.value })} sx={{ flex: 1 }}
              InputProps={{ endAdornment: <InputAdornment position="end">{f.pay_form === "monthly" ? "€ / mėn." : "€ / val."}</InputAdornment> }} />
          </Stack>

          <Box>
            <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
              <TextField label="Valandų per savaitę" type="number" value={f.weekly_hours} sx={{ width: 170 }} required
                onChange={(e) => set({ weekly_hours: e.target.value })} />
              <Stack direction="row" gap={1}>
                {QUICK_HOURS.map((h) => (
                  <Chip key={h} label={h} clickable color={Number(f.weekly_hours) === h ? "primary" : "default"}
                    variant={Number(f.weekly_hours) === h ? "filled" : "outlined"} onClick={() => set({ weekly_hours: h })} />
                ))}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                = {workload === 1 ? "visas etatas" : `${String(Math.round(workload * 1000) / 1000).replace(".", ",")} etato`}
              </Typography>
            </Stack>
            {!f.shortened ? (
              <Link component="button" type="button" variant="caption" onClick={() => set({ shortened: true })} sx={{ mt: 0.5 }}>
                Sutrumpinta darbo laiko norma
              </Link>
            ) : (
              <Stack direction="row" gap={2} alignItems="center" mt={1}>
                <TextField size="small" label="Visas etatas šiai pareigybei, val./sav." type="number" value={f.full_time_hours} sx={{ width: 260 }}
                  onChange={(e) => set({ full_time_hours: e.target.value })} />
                <Button size="small" onClick={() => set({ shortened: false, full_time_hours: 40 })}>Atšaukti</Button>
              </Stack>
            )}
          </Box>
          {minWage && <Alert severity="warning">Alga mažesnė už minimalią (MMA) šiam darbo laikui.</Alert>}

          {/* atostogos */}
          <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: "action.hover" }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography fontWeight={600}>Kasmetinės atostogos: {leave ? `${leave.total} d.d. per metus` : "…"}</Typography>
              <Button size="small" onClick={() => setLeaveEdit(!leaveEdit)}>{leaveEdit ? "Uždaryti" : "Keisti"}</Button>
            </Stack>
            {leave?.parts?.map((p, i) => (
              <Typography key={i} variant="body2" color="text.secondary">{i ? "+ " : ""}{p.days} d.d. – {p.reason}</Typography>
            ))}
            <Collapse in={leaveEdit}>
              <Stack direction={{ xs: "column", sm: "row" }} gap={2} mt={1.5}>
                <TextField size="small" label="Pailgintos pagal profesiją, d.d." type="number" value={f.extended_leave_days}
                  onChange={(e) => set({ extended_leave_days: e.target.value })} helperText="Pvz. mokytojams, medikams (iki 41 d.d.)" fullWidth />
                <TextField size="small" label="Papildomai pagal sutartį, d.d." type="number" value={f.extra_leave_days}
                  onChange={(e) => set({ extra_leave_days: e.target.value })} helperText="Jei įmonė suteikia daugiau" fullWidth />
              </Stack>
            </Collapse>
          </Box>

          {est && (
            <Typography variant="body2" color="text.secondary">
              Į rankas apytiksliai <b>{money(est.net)}</b>, įmonei kainuos {money(est.cost)} per mėnesį.
            </Typography>
          )}
        </Section>

        <Divider sx={{ mb: 3 }} />

        {/* ---------- Kiti duomenys ---------- */}
        <Section title="Kiti duomenys (adresas, banko sąskaita, vaikai, NPD)" sx={{ mb: 0 }}>
          <RadioGroup value={f.fill_mode} onChange={(e) => set({ fill_mode: e.target.value })}>
            <FormControlLabel value="invite" control={<Radio />} label={
              <Box><Typography>Užpildys pats darbuotojas</Typography>
                <Typography variant="caption" color="text.secondary">Jam bus išsiųsta anketa el. paštu ar SMS</Typography></Box>} />
            <FormControlLabel value="manual" control={<Radio />} label={
              <Box><Typography>Suvesiu pats</Typography>
                <Typography variant="caption" color="text.secondary">Jei darbuotojas neturi el. pašto ar telefono</Typography></Box>} sx={{ mt: 1 }} />
          </RadioGroup>
          {f.fill_mode === "invite" && !hasContact && (
            <Alert severity="info">Anketai išsiųsti nurodykite el. paštą arba telefoną.</Alert>
          )}
          <Collapse in={f.fill_mode === "manual"}>
            <Stack gap={2} mt={1}>
              <TextField label="Banko sąskaita (IBAN)" value={f.iban} onChange={(e) => set({ iban: e.target.value.toUpperCase().replace(/\s/g, "") })} />
              <TextField label="Adresas" value={f.address} onChange={(e) => set({ address: e.target.value })} />
              <FormControl fullWidth>
                <InputLabel>Neapmokestinamasis pajamų dydis (NPD)</InputLabel>
                <Select label="Neapmokestinamasis pajamų dydis (NPD)" value={f.npd_mode} MenuProps={MENU_PROPS} onChange={(e) => set({ npd_mode: e.target.value })}>
                  {NPD_MODES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
                </Select>
              </FormControl>
              <Typography variant="caption" color="text.secondary" mt={-1.5}>
                Padidintas NPD taikomas, kai nustatytas dalyvumo lygis (iki 2024 m. – darbingumo lygis).
              </Typography>
              <FormControlLabel control={<Switch checked={f.pension_accumulation} onChange={(e) => set({ pension_accumulation: e.target.checked })} />}
                label="Kaupia pensiją II pakopoje (+3 %)" />
              <FormControlLabel control={<Switch checked={f.single_parent} onChange={(e) => set({ single_parent: e.target.checked })} />}
                label="Vienas (-a) augina vaiką iki 14 m. arba vaiką su negalia iki 18 m." />
              <Typography variant="caption" color="text.secondary" mt={-1.5}>Vaikus galėsite pridėti darbuotojo kortelėje.</Typography>
            </Stack>
          </Collapse>
        </Section>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        {errors.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ mr: "auto" }}>Dar trūksta: {errors.join(", ")}</Typography>
        )}
        <Button onClick={onClose}>Atšaukti</Button>
        <Button variant="contained" disabled={saving || errors.length > 0} onClick={save}>Išsaugoti</Button>
      </DialogActions>
    </Dialog>
  );
}
