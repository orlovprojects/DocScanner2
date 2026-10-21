import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Paper,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import "dayjs/locale/lt";

import { apiError, payrollApi } from "../../api/payroll";

const menuProps = { MenuProps: { disableScrollLock: true } };
const money = (v) => (v === null || v === undefined || v === "" ? "–"
  : new Intl.NumberFormat("lt-LT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v)) + " €");
const toComma = (v) => (v === null || v === undefined || v === "" ? "" : String(v).replace(".", ","));
const toDot = (v) => (v === "" || v === null || v === undefined ? null : String(v).replace(/\s/g, "").replace(",", "."));

const KINDS = [
  ["ordinary", "Antstolio patvarkymas (skola)"],
  ["maintenance", "Išlaikymas (alimentai) per antstolį"],
  ["harm", "Žala sveikatai / maitintojo netekimas"],
  ["voluntary", "Alimentai darbuotojo prašymu"],
];
const METHODS = [["max", "Kiek leidžia įstatymas (CPK 736)"], ["percent", "Procentas nuo DU po mokesčių"], ["fixed", "Fiksuota suma per mėnesį"]];

function NumField({ label, value, onChange, error, helperText, suffix }) {
  return (
    <TextField size="small" label={label} value={toComma(value)} error={error} helperText={helperText} inputProps={{ inputMode: "decimal" }}
      onChange={(e) => onChange(e.target.value.replace(".", ",").replace(/[^\d,\s]/g, ""))}
      InputProps={suffix ? { endAdornment: <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{suffix}</Typography> } : undefined} />
  );
}

function DateF({ label, value, onChange }) {
  return (
    <DatePicker label={label} value={value ? dayjs(value) : null} format="YYYY-MM-DD"
      onChange={(d) => onChange(d && d.isValid() ? d.format("YYYY-MM-DD") : null)}
      slotProps={{ textField: { size: "small" } }} />
  );
}

// ----------------------------------------------------------------------------------------------------

function GarnishmentDialog({ value, employeeId, onClose, onSaved }) {
  const [f, setF] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setErr("");
    setF(value ? {
      kind: "ordinary", method: "max", document_no: "", received_date: null, bailiff: "", case_no: "", percent: "", amount: "",
      total_debt: "", paid_before: "0", recipient_name: "", recipient_iban: "", payment_purpose: "",
      valid_from: dayjs().format("YYYY-MM-DD"), valid_to: null, status: "active", note: "", ...value,
    } : null);
  }, [value]);
  if (!f) return null;
  const set = (p) => setF({ ...f, ...p });
  const save = async () => {
    try {
      const data = { ...f, employee: employeeId, percent: toDot(f.percent), amount: toDot(f.amount), total_debt: toDot(f.total_debt),
        paid_before: toDot(f.paid_before) || "0", recipient_iban: (f.recipient_iban || "").replace(/\s/g, "").toUpperCase() };
      if (f.id) await payrollApi.updateGarnishment(f.id, data); else await payrollApi.createGarnishment(data);
      onSaved();
    } catch (e) { setErr(apiError(e)); }
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" disableScrollLock>
      <DialogTitle>{f.id ? "Išskaitos dokumentas" : "Naujas išskaitos dokumentas"}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 1.5, pt: "8px !important" }}>
        {err && <Alert severity="error">{err}</Alert>}
        <TextField select size="small" label="Rūšis" value={f.kind} onChange={(e) => set({ kind: e.target.value })} SelectProps={menuProps}>
          {KINDS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
        </TextField>
        {f.kind === "voluntary" && <Alert severity="info" sx={{ "& .MuiAlert-message": { fontSize: 12.5 } }}>
          Pagal darbuotojo rašytinį prašymą (CPK 742 str. 3 d.). Netaikoma, jei vykdomi kiti vykdomieji dokumentai. Darbuotojas gali atšaukti bet kada.
        </Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <TextField size="small" label="Dokumento nr." value={f.document_no} onChange={(e) => set({ document_no: e.target.value })} />
          <DateF label="Gauta" value={f.received_date} onChange={(v) => set({ received_date: v })} />
        </Box>
        {f.kind !== "voluntary" && <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <TextField size="small" label="Antstolis" value={f.bailiff} onChange={(e) => set({ bailiff: e.target.value })} />
          <TextField size="small" label="Vykdomosios bylos nr." value={f.case_no} onChange={(e) => set({ case_no: e.target.value })} />
        </Box>}
        <TextField select size="small" label="Išskaitos dydis" value={f.method} onChange={(e) => set({ method: e.target.value })} SelectProps={menuProps}
          helperText="Bet kuriuo atveju išskaita neviršys CPK 736 str. ribų (nuo DU po mokesčių, pakopomis pagal MMA)">
          {METHODS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
        </TextField>
        {f.method === "percent" && <NumField label="Procentas" value={f.percent} onChange={(v) => set({ percent: v })} suffix="%" error={!f.percent} />}
        {f.method === "fixed" && <NumField label="Suma per mėnesį" value={f.amount} onChange={(v) => set({ amount: v })} suffix="€" error={!f.amount} />}
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <NumField label="Visa skola" value={f.total_debt} onChange={(v) => set({ total_debt: v })} suffix="€"
            helperText="Tuščia – periodinės išmokos be ribos" />
          <NumField label="Jau išskaityta iki DokSkenas" value={f.paid_before} onChange={(v) => set({ paid_before: v })} suffix="€" />
        </Box>
        <Typography sx={{ fontSize: 13, fontWeight: 700, mt: 0.5 }}>Kam pervesti</Typography>
        <TextField size="small" label="Gavėjas" value={f.recipient_name} onChange={(e) => set({ recipient_name: e.target.value })} />
        <TextField size="small" label="IBAN" value={f.recipient_iban} onChange={(e) => set({ recipient_iban: e.target.value })} />
        <TextField size="small" label="Mokėjimo paskirtis" value={f.payment_purpose} onChange={(e) => set({ payment_purpose: e.target.value })}
          helperText="Kaip nurodyta patvarkyme (dažnai – vykdomosios bylos nr. ir skolininkas)" />
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <DateF label="Taikoma nuo" value={f.valid_from} onChange={(v) => set({ valid_from: v })} />
          <DateF label="Iki (nebūtina)" value={f.valid_to} onChange={(v) => set({ valid_to: v })} />
        </Box>
        {f.id && <TextField select size="small" label="Būsena" value={f.status} onChange={(e) => set({ status: e.target.value })} SelectProps={menuProps}>
          <MenuItem value="active">Vykdoma</MenuItem><MenuItem value="finished">Įvykdyta</MenuItem><MenuItem value="cancelled">Atšaukta</MenuItem>
        </TextField>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Atšaukti</Button>
        <Button variant="contained" disableElevation onClick={save} disabled={!f.valid_from}>Išsaugoti</Button>
      </DialogActions>
    </Dialog>
  );
}

function RecurringDialog({ value, employeeId, codes, onClose, onSaved }) {
  const [f, setF] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setErr("");
    setF(value ? { pay_code: "", mode: value.percent ? "percent" : "amount", amount: "", percent: "",
      valid_from: dayjs().startOf("month").format("YYYY-MM-DD"), valid_to: null, comment: "", ...value } : null);
  }, [value]);
  if (!f) return null;
  const set = (p) => setF({ ...f, ...p });
  const save = async () => {
    try {
      const data = { employee: employeeId, pay_code: f.pay_code, valid_from: f.valid_from, valid_to: f.valid_to, comment: f.comment,
        amount: f.mode === "amount" ? toDot(f.amount) : null, percent: f.mode === "percent" ? toDot(f.percent) : null };
      if (f.id) await payrollApi.updateRecurring(f.id, data); else await payrollApi.createRecurring(data);
      onSaved();
    } catch (e) { setErr(apiError(e)); }
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" disableScrollLock>
      <DialogTitle>{f.id ? "Nuolatinis priedas" : "Naujas nuolatinis priedas"}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 1.5, pt: "8px !important" }}>
        {err && <Alert severity="error">{err}</Alert>}
        <TextField select size="small" label="Priedo rūšis" value={f.pay_code} onChange={(e) => set({ pay_code: e.target.value })} SelectProps={menuProps}>
          {codes.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Dydis" value={f.mode} onChange={(e) => set({ mode: e.target.value })} SelectProps={menuProps}>
          <MenuItem value="amount">Fiksuota suma per mėnesį</MenuItem>
          <MenuItem value="percent">% nuo pareiginės algos</MenuItem>
        </TextField>
        {f.mode === "amount" ? <NumField label="Suma" value={f.amount} onChange={(v) => set({ amount: v })} suffix="€" error={!f.amount} />
          : <NumField label="Procentas" value={f.percent} onChange={(v) => set({ percent: v })} suffix="%" error={!f.percent} />}
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <DateF label="Nuo" value={f.valid_from} onChange={(v) => set({ valid_from: v })} />
          <DateF label="Iki (nebūtina)" value={f.valid_to} onChange={(v) => set({ valid_to: v })} />
        </Box>
        <TextField size="small" label="Pastaba (algalapyje)" value={f.comment} onChange={(e) => set({ comment: e.target.value })} />
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          Priedas įtraukiamas į kiekvieno mėnesio DU automatiškai. Jei tą mėnesį tą patį priedą įvesite rankiniu būdu – bus naudojamas rankinis.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Atšaukti</Button>
        <Button variant="contained" disableElevation onClick={save} disabled={!f.pay_code || !f.valid_from}>Išsaugoti</Button>
      </DialogActions>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------------------------------

export default function EmployeePayItemsPanel({ employeeId }) {
  const [garn, setGarn] = useState([]);
  const [rec, setRec] = useState([]);
  const [codes, setCodes] = useState([]);
  const [editG, setEditG] = useState(null);
  const [editR, setEditR] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    Promise.all([payrollApi.garnishments({ employee: employeeId }), payrollApi.recurring({ employee: employeeId })])
      .then(([g, r]) => { setGarn(g); setRec(r); }).catch((e) => setErr(apiError(e)));
  }, [employeeId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    payrollApi.payCodes().then((all) => setCodes((all || []).filter((c) => c.category === "earning" && (c.calc ?? c.calc_method ?? "manual") === "manual"))).catch(() => {});
  }, []);
  const del = async (fn, id) => { if (!window.confirm("Ištrinti?")) return; try { await fn(id); load(); } catch (e) { setErr(apiError(e)); } };
  const cell = { fontSize: 13 };
  const head = (h) => <TableCell key={h} sx={{ fontSize: 11.5, fontWeight: 800 }}>{h}</TableCell>;

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="lt">
      <Box sx={{ display: "grid", gap: 2.5 }}>
        {err && <Alert severity="error" onClose={() => setErr("")}>{err}</Alert>}

        <Paper variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Box>
              <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Nuolatiniai priedai</Typography>
              <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Kas mėnesį įtraukiami į DU automatiškai</Typography>
            </Box>
            <Button size="small" startIcon={<AddIcon />} onClick={() => setEditR({})} sx={{ textTransform: "none" }}>Pridėti</Button>
          </Box>
          {!rec.length ? <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Nėra</Typography> : (
            <Table size="small">
              <TableHead><TableRow>{["Priedas", "Dydis", "Laikotarpis", ""].map(head)}</TableRow></TableHead>
              <TableBody>
                {rec.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell sx={cell}>{r.pay_code_name}{r.comment ? <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>{r.comment}</Typography> : null}</TableCell>
                    <TableCell sx={cell}>{r.percent ? `${toComma(r.percent)} % nuo algos` : money(r.amount)}</TableCell>
                    <TableCell sx={cell}>{r.valid_from} – {r.valid_to || "…"}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <IconButton size="small" onClick={() => setEditR(r)}><EditOutlinedIcon fontSize="small" /></IconButton>
                      <IconButton size="small" onClick={() => del(payrollApi.deleteRecurring, r.id)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Box>
              <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Išskaitos (antstoliai, alimentai)</Typography>
              <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
                Išskaitoma iš DU po mokesčių pagal CPK 736 str. ribas, pervedama gavėjui kartu su atlyginimu
              </Typography>
            </Box>
            <Button size="small" startIcon={<AddIcon />} onClick={() => setEditG({})} sx={{ textTransform: "none" }}>Pridėti</Button>
          </Box>
          {!garn.length ? <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Nėra</Typography> : (
            <Table size="small">
              <TableHead><TableRow>{["Dokumentas", "Dydis", "Skola / likutis", "Gavėjas", "Būsena", ""].map(head)}</TableRow></TableHead>
              <TableBody>
                {garn.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell sx={cell}>{g.kind_label}<Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
                      {[g.document_no, g.case_no, g.received_date && `gauta ${g.received_date}`].filter(Boolean).join(" · ")}</Typography></TableCell>
                    <TableCell sx={cell}>{g.method === "max" ? "Pagal CPK 736" : g.method === "percent" ? `${toComma(g.percent)} %` : money(g.amount)}</TableCell>
                    <TableCell sx={cell}>
                      {g.total_debt ? <>{money(g.total_debt)}<Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
                        išskaityta {money(g.paid)}, liko {money(g.remaining)}</Typography></> : <>Periodinė<Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
                        išskaityta {money(g.paid)}</Typography></>}
                    </TableCell>
                    <TableCell sx={cell}>{g.recipient_name || "–"}{!g.recipient_iban && <Tooltip title="Be IBAN mokėjimo failas nebus sudarytas">
                      <Chip size="small" color="warning" label="nėra IBAN" sx={{ ml: 0.5, height: 18, fontSize: 10.5 }} /></Tooltip>}</TableCell>
                    <TableCell><Chip size="small" label={{ active: "Vykdoma", finished: "Įvykdyta", cancelled: "Atšaukta" }[g.status]}
                      color={g.status === "active" ? "primary" : "default"} variant="outlined" /></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <IconButton size="small" onClick={() => setEditG(g)}><EditOutlinedIcon fontSize="small" /></IconButton>
                      <IconButton size="small" onClick={() => del(payrollApi.deleteGarnishment, g.id)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>

        <GarnishmentDialog value={editG} employeeId={employeeId} onClose={() => setEditG(null)} onSaved={() => { setEditG(null); load(); }} />
        <RecurringDialog value={editR} employeeId={employeeId} codes={codes} onClose={() => setEditR(null)} onSaved={() => { setEditR(null); load(); }} />
      </Box>
    </LocalizationProvider>
  );
}
