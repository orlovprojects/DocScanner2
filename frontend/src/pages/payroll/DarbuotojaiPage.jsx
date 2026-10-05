import { useCallback, useEffect, useState } from "react";
import {
  Autocomplete,
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogContent, DialogTitle, Divider, FormControl,
  FormControlLabel, IconButton, InputAdornment, InputLabel, MenuItem, Paper, Radio, RadioGroup, Select,
  Stack, Switch, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, ToggleButton,
  ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SearchIcon from "@mui/icons-material/Search";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

import {
  ABSENCE_KINDS, CONTRACT_TYPES, NPD_MODES, apiError, days, money, payrollApi,
} from "../../api/payroll";
import NewEmployeeDialog from "./NewEmployeeDialog";
import ContractDocumentPanel from "./ContractDocumentPanel";
import PayrollSettingsDialog from "./PayrollSettingsDialog";
import SavitarnaInvitePanel from "./SavitarnaInvitePanel";

const MENU_PROPS = { disableScrollLock: true };
const today = () => new Date().toISOString().slice(0, 10);

const DISMISS_BASES = [
  { value: "54", label: "Šalių susitarimu (DK 54 str.)" },
  { value: "55", label: "Darbuotojo prašymu (DK 55 str.)" },
  { value: "57", label: "Darbdavio iniciatyva be darbuotojo kaltės (DK 57 str.)" },
  { value: "69", label: "Pasibaigus terminui (DK 69 str.)" },
];

// ============================================================
// Puslapis
// ============================================================
export default function DarbuotojaiPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");
  const [newOpen, setNewOpen] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await payrollApi.employees({ status: status === "all" ? undefined : status, q: q || undefined }));
      setError("");
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100 }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={2} mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Darbuotojai</Typography>
          <Typography variant="body2" color="text.secondary">
            Darbuotojų duomenys ir darbo sutartys. Pagal juos kas mėnesį skaičiuojamas atlyginimas.
          </Typography>
        </Box>
        <Stack direction="row" gap={1}>
          <Button onClick={() => setSettingsOpen(true)}>Nustatymai</Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewOpen(true)}>
            Pridėti darbuotoją
          </Button>
        </Stack>
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} gap={2} mb={2}>
        <TextField
          size="small" placeholder="Ieškoti pagal vardą ar pavardę" value={q} onChange={(e) => setQ(e.target.value)}
          sx={{ flex: 1, maxWidth: 360 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <ToggleButtonGroup size="small" exclusive value={status} onChange={(_, v) => v && setStatus(v)}>
          <ToggleButton value="active">Dirba</ToggleButton>
          <ToggleButton value="dismissed">Atleisti</ToggleButton>
          <ToggleButton value="all">Visi</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper variant="outlined">
        {!loading && rows.length === 0 ? (
          <Box sx={{ p: 5, textAlign: "center" }}>
            <Typography fontWeight={600} mb={0.5}>
              {q || status !== "active" ? "Nieko nerasta" : "Dar nėra darbuotojų"}
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Pridėkite darbuotoją – reikės asmens duomenų, sutarties datos ir atlyginimo.
            </Typography>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setNewOpen(true)}>Pridėti darbuotoją</Button>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Darbuotojas</TableCell>
                <TableCell>Pareigos</TableCell>
                <TableCell align="right">Atlyginimas</TableCell>
                <TableCell>Būsena</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} hover sx={{ cursor: "pointer" }} onClick={() => setOpenId(r.id)}>
                  <TableCell>
                    <Typography fontWeight={600} fontSize={14}>{r.full_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{r.personal_code_masked}</Typography>
                  </TableCell>
                  <TableCell>{r.position || "–"}</TableCell>
                  <TableCell align="right">{money(r.base_amount)}</TableCell>
                  <TableCell>
                    <Chip size="small" label={r.status === "active" ? "Dirba" : "Atleistas"}
                      color={r.status === "active" ? "success" : "default"} variant="outlined" />
                    {r.data_status === "awaiting_employee" && (
                      <Chip size="small" label="Laukiama darbuotojo duomenų" color="warning" variant="outlined" sx={{ ml: 1 }} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      <NewEmployeeDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={(id) => { setNewOpen(false); load(); setOpenId(id); }} />
      <EmployeeDialog id={openId} onClose={() => { setOpenId(null); load(); }} />
      <PayrollSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Box>
  );
}

// ============================================================
// Pagalbiniai komponentai
// ============================================================
function Hint({ children }) {
  return (
    <Stack direction="row" gap={1} alignItems="flex-start" sx={{ color: "text.secondary", mt: 0.5 }}>
      <InfoOutlinedIcon sx={{ fontSize: 16, mt: "2px" }} />
      <Typography variant="caption">{children}</Typography>
    </Stack>
  );
}

function TaxFields({ e, set }) {
  return (
    <Stack gap={2.5}>
      <Box>
        <Typography fontWeight={600} mb={0.5}>Neapmokestinamasis pajamų dydis (NPD)</Typography>
        <RadioGroup value={e.npd_mode} onChange={(ev) => set({ npd_mode: ev.target.value })}>
          {NPD_MODES.map((m) => <FormControlLabel key={m.value} value={m.value} control={<Radio size="small" />} label={<Typography variant="body2">{m.label}</Typography>} />)}
        </RadioGroup>
        <Hint>NPD mažina pajamų mokestį, bet taikomas tik vienoje darbovietėje. Jei nežinote – paklauskite darbuotojo.</Hint>
      </Box>
      <Box>
        <FormControlLabel control={<Switch checked={e.pension_accumulation} onChange={(ev) => set({ pension_accumulation: ev.target.checked })} />}
          label="Darbuotojas kaupia pensiją II pakopoje (+3 %)" />
        <Hint>Tai matyti Sodros suvestinėje arba paklauskite darbuotojo. Jei pažymėsite neteisingai, Sodra kitą mėnesį perskaičiuos pati.</Hint>
      </Box>
      <Box>
        <FormControlLabel control={<Switch checked={e.progressive_gpm_request} onChange={(ev) => set({ progressive_gpm_request: ev.target.checked })} />}
          label="Darbuotojas prašo taikyti progresinį GPM per metus" />
        <Hint>Retas atvejis – tik labai didelėms pajamoms ir tik gavus rašytinį darbuotojo prašymą.</Hint>
      </Box>
    </Stack>
  );
}

// ============================================================
// Darbuotojo kortelė
// ============================================================
function EmployeeDialog({ id, onClose }) {
  const [emp, setEmp] = useState(null);
  const [tab, setTab] = useState(0);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [vac, setVac] = useState(null);

  const load = useCallback(async () => {
    if (!id) return;
    try { setEmp(await payrollApi.employee(id)); setError(""); } catch (e) { setError(apiError(e)); }
    payrollApi.vacation(id).then(setVac).catch(() => setVac(null));
  }, [id]);

  useEffect(() => { setTab(0); setEmp(null); setMsg(""); load(); }, [load]);

  const contract = emp?.contracts?.find((c) => c.status === "active") || emp?.contracts?.[0];

  return (
    <Dialog open={!!id} onClose={onClose} fullWidth maxWidth="md" disableScrollLock>
      <DialogTitle sx={{ pr: 6 }}>
        {emp?.full_name || "Darbuotojas"}
        {vac?.balance != null && (
          <Tooltip title={`Sukaupta ${days(vac.accrued)}, panaudota ${days(vac.used)}${Number(vac.adjustments) ? `, korekcijos ${days(vac.adjustments)}` : ""}`}>
            <Chip size="small" sx={{ ml: 1.5, verticalAlign: "middle" }} color={Number(vac.balance) < 0 ? "warning" : "default"}
              label={`Atostogų likutis: ${days(vac.balance)}`} />
          </Tooltip>
        )}
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 12, top: 12 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 3, borderBottom: 1, borderColor: "divider" }}>
        <Tab label="Duomenys" /><Tab label="Sutartis ir atlyginimas" /><Tab label="Atostogos ir ligos" /><Tab label="Vaikai" />
      </Tabs>
      <DialogContent sx={{ minHeight: 420 }}>
        {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}
        {msg && <Alert severity="success" sx={{ my: 2 }} onClose={() => setMsg("")}>{msg}</Alert>}
        {emp && tab === 0 && <Box mt={2}><SavitarnaInvitePanel emp={emp} onChanged={load} /></Box>}
        {emp && tab === 0 && <PersonTab emp={emp} onSaved={() => { setMsg("Išsaugota"); load(); }} />}
        {emp && tab === 1 && <ContractTab emp={emp} contract={contract} onChanged={(m) => { setMsg(m); load(); }} />}
        {emp && tab === 2 && <AbsencesTab emp={emp} onChanged={load} />}
        {emp && tab === 3 && <ChildrenTab emp={emp} onChanged={load} />}
      </DialogContent>
    </Dialog>
  );
}

function PersonTab({ emp, onSaved }) {
  const [f, setF] = useState(emp);
  const [error, setError] = useState("");
  const set = (v) => setF((s) => ({ ...s, ...v }));
  const save = async () => {
    try {
      const { children, contracts, full_name, onboarding_token, created_at, updated_at, id, ...data } = f;
      await payrollApi.updateEmployee(emp.id, data);
      setError(""); onSaved();
    } catch (e) { setError(apiError(e)); }
  };
  return (
    <Stack gap={2} mt={2} maxWidth={560}>
      <Stack direction="row" gap={2}>
        <TextField label="Vardas" value={f.first_name} onChange={(e) => set({ first_name: e.target.value })} fullWidth />
        <TextField label="Pavardė" value={f.last_name} onChange={(e) => set({ last_name: e.target.value })} fullWidth />
      </Stack>
      <TextField label="Asmens kodas" value={f.personal_code} onChange={(e) => set({ personal_code: e.target.value.replace(/\D/g, "") })} inputProps={{ maxLength: 11 }} />
      <Stack direction="row" gap={2}>
        <TextField label="El. paštas" value={f.email} onChange={(e) => set({ email: e.target.value })} fullWidth />
        <TextField label="Telefonas" value={f.phone} onChange={(e) => set({ phone: e.target.value })} fullWidth />
      </Stack>
      <TextField label="Banko sąskaita (IBAN)" value={f.iban} onChange={(e) => set({ iban: e.target.value.toUpperCase().replace(/\s/g, "") })} />
      <FormControlLabel
        control={<Checkbox checked={!!f.pay_once_a_month} onChange={(e) => set({ pay_once_a_month: e.target.checked })} />}
        label="Atlyginimas mokamas kartą per mėnesį (darbuotojo prašymu)" />
      {!f.pay_once_a_month && (
        <TextField label="Avanso suma, €" value={f.advance_amount ?? ""} sx={{ maxWidth: 240 }}
          onChange={(e) => set({ advance_amount: e.target.value.replace(",", ".") || null })}
          helperText="Tuščia – pagal DU nustatymų procentą" />
      )}
      <TagsField value={f.tags || []} onChange={(tags) => set({ tags })} />
      <Divider sx={{ my: 1 }} />
      <TaxFields e={f} set={set} />
      {error && <Alert severity="error">{error}</Alert>}
      <Box><Button variant="contained" onClick={save}>Išsaugoti pakeitimus</Button></Box>
    </Stack>
  );
}

function TagsField({ value, onChange }) {
  const [tags, setTags] = useState([]);
  useEffect(() => { payrollApi.tags().then((r) => setTags(Array.isArray(r) ? r : r.results || [])).catch(() => {}); }, []);
  if (!tags.length) return null;
  return (
    <Autocomplete multiple options={tags} getOptionLabel={(t) => t.name} value={tags.filter((t) => value.includes(t.id))}
      onChange={(_, v) => onChange(v.map((t) => t.id))} isOptionEqualToValue={(a, b) => a.id === b.id}
      renderInput={(p) => <TextField {...p} label="Žymos (darbo grafikams)" />} />
  );
}

function ContractTab({ emp, contract, onChanged }) {
  const [change, setChange] = useState(null);
  const [dismiss, setDismiss] = useState(null);
  const [error, setError] = useState("");
  if (!contract) return <Typography mt={2}>Darbo sutarties nėra.</Typography>;
  const terms = [...(contract.terms || [])].sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  const current = terms[0];
  const type = CONTRACT_TYPES.find((t) => t.value === contract.sodra_contract_type)?.label;

  const saveChange = async () => {
    try {
      await payrollApi.createTerms({ contract: contract.id, valid_from: change.valid_from, position: current?.position,
        pay_form: change.pay_form, base_amount: change.base_amount, workload: change.workload,
        work_regime: change.work_regime });
      setChange(null); onChanged("Atlyginimo pakeitimas išsaugotas");
    } catch (e) { setError(apiError(e)); }
  };
  const saveDismiss = async () => {
    try {
      await payrollApi.updateContract(contract.id, { termination_date: dismiss.date, termination_basis: { article: dismiss.basis }, status: "terminated" });
      await payrollApi.updateEmployee(emp.id, { status: "dismissed" });
      setDismiss(null); onChanged("Sutartis nutraukta. Galutinis atsiskaitymas bus apskaičiuotas to mėnesio atlyginimuose.");
    } catch (e) { setError(apiError(e)); }
  };

  return (
    <Stack gap={3} mt={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={2}>
          <Box>
            <Typography variant="body2" color="text.secondary">{type} sutartis nuo {contract.start_date}{contract.end_date ? ` iki ${contract.end_date}` : ""}</Typography>
            <Typography variant="h6" fontWeight={700}>{current?.position_name || "–"}</Typography>
            <Typography>
              {current?.pay_form === "hourly" ? `${money(current.base_amount)} / val.` : `${money(current?.base_amount)} / mėn.`}
              {current && Number(current.workload) !== 1 && ` · ${String(current.workload).replace(".", ",")} etato`}
              {current?.work_regime === "summed" && " · suminė darbo laiko apskaita"}
            </Typography>
          </Box>
          {contract.status !== "terminated" && (
            <Stack direction="row" gap={1} alignItems="flex-start">
              <Button variant="outlined" onClick={() => setChange({ valid_from: today(), pay_form: current?.pay_form || "monthly", base_amount: current?.base_amount || "", workload: String(current?.workload || "1"), work_regime: current?.work_regime || "standard" })}>Keisti sąlygas</Button>
              <Button color="error" onClick={() => setDismiss({ date: today(), basis: "55" })}>Nutraukti sutartį</Button>
            </Stack>
          )}
        </Stack>
        {contract.status === "terminated" && <Alert severity="info" sx={{ mt: 2 }}>Sutartis nutraukta {contract.termination_date}</Alert>}
      </Paper>

      <ContractDocumentPanel contract={contract} />

      {change && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography fontWeight={600} mb={2}>Naujos sutarties sąlygos</Typography>
          <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
            <TextField label="Galioja nuo" type="date" value={change.valid_from} InputLabelProps={{ shrink: true }} onChange={(e) => setChange({ ...change, valid_from: e.target.value })} />
            <TextField label={change.pay_form === "hourly" ? "Už valandą" : "Alga per mėnesį"} type="number" value={change.base_amount} onChange={(e) => setChange({ ...change, base_amount: e.target.value })}
              InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }} />
            <FormControl sx={{ minWidth: 180 }}>
              <InputLabel>Darbo krūvis</InputLabel>
              <Select label="Darbo krūvis" value={change.workload} MenuProps={MENU_PROPS} onChange={(e) => setChange({ ...change, workload: e.target.value })}>
                <MenuItem value="1">Visas etatas</MenuItem><MenuItem value="0.75">0,75 etato</MenuItem>
                <MenuItem value="0.5">Pusė etato</MenuItem><MenuItem value="0.25">0,25 etato</MenuItem>
              </Select>
            </FormControl>
            <FormControl sx={{ minWidth: 220 }}>
              <InputLabel>Darbo laiko apskaita</InputLabel>
              <Select label="Darbo laiko apskaita" value={change.work_regime || "standard"} MenuProps={MENU_PROPS}
                onChange={(e) => setChange({ ...change, work_regime: e.target.value })}>
                <MenuItem value="standard">Standartinė (5 d. per savaitę)</MenuItem>
                <MenuItem value="summed">Suminė (pagal pamainų grafiką)</MenuItem>
              </Select>
            </FormControl>
          </Stack>
          <Hint>Jei pakeitimas vidury mėnesio, tą mėnesį atlyginimas bus paskaičiuotas dviem dalimis – iki ir po pakeitimo.</Hint>
          <Stack direction="row" gap={1} mt={2}>
            <Button variant="contained" onClick={saveChange} disabled={!change.base_amount}>Išsaugoti</Button>
            <Button onClick={() => setChange(null)}>Atšaukti</Button>
          </Stack>
        </Paper>
      )}

      {dismiss && (
        <Paper variant="outlined" sx={{ p: 2, borderColor: "error.light" }}>
          <Typography fontWeight={600} mb={2}>Sutarties nutraukimas</Typography>
          <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
            <TextField label="Paskutinė darbo diena" type="date" value={dismiss.date} InputLabelProps={{ shrink: true }} onChange={(e) => setDismiss({ ...dismiss, date: e.target.value })} />
            <FormControl fullWidth>
              <InputLabel>Pagrindas</InputLabel>
              <Select label="Pagrindas" value={dismiss.basis} MenuProps={MENU_PROPS} onChange={(e) => setDismiss({ ...dismiss, basis: e.target.value })}>
                {DISMISS_BASES.map((b) => <MenuItem key={b.value} value={b.value}>{b.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
          <Hint>Kompensacija už nepanaudotas atostogas ir išeitinė išmoka bus apskaičiuotos to mėnesio atlyginimuose.</Hint>
          <Stack direction="row" gap={1} mt={2}>
            <Button variant="contained" color="error" onClick={saveDismiss}>Nutraukti sutartį</Button>
            <Button onClick={() => setDismiss(null)}>Atšaukti</Button>
          </Stack>
        </Paper>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {terms.length > 1 && (
        <Box>
          <Typography fontWeight={600} mb={1}>Atlyginimo istorija</Typography>
          <Table size="small">
            <TableHead><TableRow><TableCell>Nuo</TableCell><TableCell>Pareigos</TableCell><TableCell align="right">Suma</TableCell><TableCell>Krūvis</TableCell></TableRow></TableHead>
            <TableBody>
              {terms.map((t) => (
                <TableRow key={t.id}><TableCell>{t.valid_from}</TableCell><TableCell>{t.position_name}</TableCell>
                  <TableCell align="right">{money(t.base_amount)}{t.pay_form === "hourly" ? " / val." : ""}</TableCell>
                  <TableCell>{String(t.workload).replace(".", ",")}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Stack>
  );
}

export function AbsenceForm({ employee, defaults, onSaved, onCancel }) {
  const [f, setF] = useState({ kind: "vacation", start_date: today(), end_date: today(), ...defaults });
  const [error, setError] = useState("");
  const [vac, setVac] = useState(null);

  useEffect(() => {
    if (f.kind !== "vacation" || !f.start_date || !f.end_date) { setVac(null); return; }
    const t = setTimeout(() => {
      payrollApi.vacation(employee, { date: f.start_date, from: f.start_date, to: f.end_date })
        .then(setVac).catch(() => setVac(null));
    }, 200);
    return () => clearTimeout(t);
  }, [employee, f.kind, f.start_date, f.end_date]);

  const over = vac?.balance != null && Number(vac.requested) > Number(vac.balance);
  const save = async () => {
    try { await payrollApi.createAbsence({ employee, ...f, status: "approved" }); onSaved(); }
    catch (e) { setError(apiError(e)); }
  };
  return (
    <Stack gap={2}>
      <FormControl fullWidth size="small">
        <InputLabel>Kas nutiko?</InputLabel>
        <Select label="Kas nutiko?" value={f.kind} MenuProps={MENU_PROPS} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          {Object.entries(ABSENCE_KINDS).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
        </Select>
      </FormControl>
      <Stack direction="row" gap={2}>
        <TextField size="small" label="Nuo" type="date" value={f.start_date} InputLabelProps={{ shrink: true }} onChange={(e) => setF({ ...f, start_date: e.target.value, end_date: e.target.value > f.end_date ? e.target.value : f.end_date })} fullWidth />
        <TextField size="small" label="Iki (imtinai)" type="date" value={f.end_date} InputLabelProps={{ shrink: true }} onChange={(e) => setF({ ...f, end_date: e.target.value })} fullWidth />
      </Stack>
      {f.kind === "sick" && <Hint>Ligos pažymėjimus galima ir įkelti iš Sodros XML – tada nieko suvesti nereikia.</Hint>}
      {vac?.balance != null && !over && (
        <Hint>Priklauso {days(vac.balance)}, prašoma {days(vac.requested)}. Po atostogų liks {days(Number(vac.balance) - Number(vac.requested))}</Hint>
      )}
      {over && (
        <Alert severity="warning">
          Darbuotojas turi tik {days(vac.balance)}, o prašoma {days(vac.requested)}. Suteikti daugiau galima, jei susitarėte –
          atleidžiant pereikvotos dienos bus išskaičiuotos.
        </Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" gap={1}>
        <Button variant="contained" size="small" color={over ? "warning" : "primary"} onClick={save}>
          {over ? "Vis tiek suteikti" : "Išsaugoti"}
        </Button>
        {onCancel && <Button size="small" onClick={onCancel}>Atšaukti</Button>}
      </Stack>
    </Stack>
  );
}

function AbsencesTab({ emp, onChanged }) {
  const [rows, setRows] = useState([]);
  const [adding, setAdding] = useState(false);
  const [fix, setFix] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => payrollApi.absences({ employee: emp.id }).then(setRows).catch(() => {}), [emp.id]);
  useEffect(() => { load(); }, [load]);
  const saved = () => { load(); onChanged?.(); };

  const saveFix = async () => {
    try { await payrollApi.setVacationBalance(emp.id, fix); setFix(null); setError(""); saved(); }
    catch (e) { setError(apiError(e)); }
  };

  return (
    <Stack gap={2} mt={2}>
      {adding
        ? <Paper variant="outlined" sx={{ p: 2, maxWidth: 520 }}><AbsenceForm employee={emp.id} onSaved={() => { setAdding(false); saved(); }} onCancel={() => setAdding(false)} /></Paper>
        : (
          <Stack direction="row" gap={1}>
            <Button startIcon={<AddIcon />} variant="outlined" onClick={() => setAdding(true)}>Pridėti atostogas, ligą ar kt.</Button>
            <Button onClick={() => setFix({ date: today(), balance: "" })}>Nustatyti atostogų likutį</Button>
          </Stack>
        )}
      {fix && (
        <Paper variant="outlined" sx={{ p: 2, maxWidth: 520 }}>
          <Typography fontWeight={600} mb={0.5}>Atostogų likutis</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Naudokite, kai perkeliate darbuotoją iš kitos programos arba reikia pataisyti likutį. Įveskite, kiek dienų darbuotojui priklauso nurodytą dieną.
          </Typography>
          <Stack direction="row" gap={2}>
            <TextField size="small" label="Data" type="date" value={fix.date} InputLabelProps={{ shrink: true }} onChange={(e) => setFix({ ...fix, date: e.target.value })} />
            <TextField size="small" label="Priklauso dienų" type="number" value={fix.balance} onChange={(e) => setFix({ ...fix, balance: e.target.value })} autoFocus />
          </Stack>
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          <Stack direction="row" gap={1} mt={2}>
            <Button variant="contained" size="small" disabled={fix.balance === ""} onClick={saveFix}>Išsaugoti</Button>
            <Button size="small" onClick={() => setFix(null)}>Atšaukti</Button>
          </Stack>
        </Paper>
      )}
      {rows.length === 0 ? <Typography color="text.secondary">Įrašų dar nėra.</Typography> : (
        <Table size="small">
          <TableHead><TableRow><TableCell>Kas</TableCell><TableCell>Laikotarpis</TableCell><TableCell align="right">Darbo dienų</TableCell><TableCell /></TableRow></TableHead>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell><Chip size="small" label={ABSENCE_KINDS[a.kind]?.label || a.kind} sx={{ bgcolor: ABSENCE_KINDS[a.kind]?.color, color: "#fff" }} /></TableCell>
                <TableCell>{a.start_date === a.end_date ? a.start_date : `${a.start_date} – ${a.end_date}`}</TableCell>
                <TableCell align="right">{Number(a.work_days)}</TableCell>
                <TableCell align="right">
                  <Tooltip title="Ištrinti"><IconButton size="small" onClick={() => payrollApi.deleteAbsence(a.id).then(saved)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Stack>
  );
}

function ChildrenTab({ emp, onChanged }) {
  const [f, setF] = useState({ first_name: "", birth_date: "", has_disability: false });
  const [error, setError] = useState("");
  const add = async () => {
    try { await payrollApi.createChild({ employee: emp.id, ...f }); setF({ first_name: "", birth_date: "", has_disability: false }); onChanged(); }
    catch (e) { setError(apiError(e)); }
  };
  return (
    <Stack gap={2} mt={2} maxWidth={560}>
      <Hint>Vaikai reikalingi papildomoms poilsio dienoms (mamadieniams / tėvadieniams). Sistema pati apskaičiuos, kiek dienų priklauso.</Hint>
      {(emp.children || []).map((c) => (
        <Stack key={c.id} direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 1, borderBottom: 1, borderColor: "divider" }}>
          <Typography>{c.first_name || "Vaikas"}, gim. {c.birth_date}{c.has_disability ? " · su negalia" : ""}</Typography>
          <IconButton size="small" onClick={() => payrollApi.deleteChild(c.id).then(onChanged)}><DeleteOutlineIcon fontSize="small" /></IconButton>
        </Stack>
      ))}
      <Stack direction={{ xs: "column", sm: "row" }} gap={2} alignItems={{ sm: "center" }}>
        <TextField size="small" label="Vardas" value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} />
        <TextField size="small" label="Gimimo data" type="date" value={f.birth_date} InputLabelProps={{ shrink: true }} onChange={(e) => setF({ ...f, birth_date: e.target.value })} />
        <FormControlLabel control={<Checkbox size="small" checked={f.has_disability} onChange={(e) => setF({ ...f, has_disability: e.target.checked })} />} label="Su negalia" />
        <Button variant="outlined" onClick={add} disabled={!f.birth_date}>Pridėti</Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
