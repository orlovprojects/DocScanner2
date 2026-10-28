import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Collapse, Dialog, DialogContent, DialogTitle, FormControlLabel,
  IconButton, InputAdornment, MenuItem, Select, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField,
  Tooltip, Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import ReplayOutlinedIcon from "@mui/icons-material/ReplayOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import dayjs from "dayjs";
import { api } from "../../api/endpoints";
import { startViewAs, useAdminWhoami } from "../../admin/viewAs";

const BASE = "/admin/du";
const fmt = (d) => (d ? dayjs(d).format("YYYY-MM-DD HH:mm") : "–");
const kb = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const MIG_STATUS = { draft: ["Nepatvirtintas", "warning"], confirmed: ["Patvirtintas", "success"] };
const MONTH_STATUS = {
  roster: { draft: ["Juodraštis", "default"], published: ["Paskelbtas", "success"] },
  timesheet: { draft: ["Nepatvirtintas", "default"], approved: ["Patvirtintas", "success"], locked: ["Užrakintas", "success"] },
  payroll: { draft: ["Juodraštis", "default"], approved: ["Patvirtintas", "success"], paid: ["Išmokėtas", "success"], closed: ["Uždarytas", "success"] },
};
const DONE_LABEL = { roster: "paskelbta", timesheet: "patvirtinta", payroll: "patvirtinta" };
const COLS = [
  ["Įmonė"], ["Vartotojas", "Paskyros savininkas"],
  ["Darbuotojai", "Dirbantys / visi DokSkene"],
  ["Perėjimas", "Perėjimas iš kitos programos: būsena, nuo kada DU skaičiuojamas DokSkene, kiek įkelta ataskaitų ir kiek darbuotojų perėjimo sąraše"],
  ["Grafikas", "Paskutinis mėnuo su pamainomis ir jo būsena; iki kurio mėnesio paskelbta"],
  ["Tabelis", "Paskutinis mėnuo su patvirtintu tabeliu arba rankiniais įrašais; iki kurio mėnesio patvirtinta"],
  ["DU", "Paskutinis mėnesio atlyginimų skaičiavimas; iki kurio mėnesio patvirtinta; ⚠ - įspėjimų skaičius"],
  ["Planas", "DU planas: bandomasis laikotarpis, aktyvus (Stripe), nesumokėta, baigėsi; kaina pagal aktyvius darbuotojus"],
  ["Deklaracijos", "Nepateiktos: su klaidomis / pavėluotos"],
  ["Klaidos 7 d.", "Klaidos DU skiltyje per 7 dienas (500 - serverio klaidos)"],
  ["Failai", "Įkelti failai archyve / neatpažinti"],
  ["Aktyvumas", "Paskutinis DU, grafiko, perėjimo pakeitimas, klaida ar įkeltas failas"],
  [""],
];

const PLAN = { free: ["Nemokama", "default"], none: ["Nepradėta", "default"], trial: ["Bandomasis", "info"],
  active: ["Aktyvus", "success"], past_due: ["Nesumokėta", "error"], expired: ["Baigėsi", "warning"] };

function PlanCell({ p }) {
  if (!p) return <Typography sx={{ fontSize: 12, color: "text.disabled" }}>–</Typography>;
  const [label, color] = PLAN[p.state] || [p.state, "default"];
  return (
    <>
      <Chip size="small" label={label} color={color} sx={{ height: 20, fontSize: 11 }} />
      <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.25, whiteSpace: "nowrap" }}>
        {p.state === "trial" ? `liko ${p.days_left} d.` : p.state === "active" && p.current_period_end
          ? `${p.cancel_at_period_end ? "galioja" : "kitas mokėjimas"} ${p.current_period_end.slice(0, 10)}` : ""}
      </Typography>
      <Typography sx={{ fontSize: 12, color: "text.secondary", whiteSpace: "nowrap" }}>{p.employees} d. · {p.price} €/mėn.</Typography>
    </>
  );
}

function MonthCell({ data, kind }) {
  if (!data) return <Typography sx={{ fontSize: 12, color: "text.disabled" }}>Nenaudoja</Typography>;
  const [label, color] = MONTH_STATUS[kind][data.status] || [data.status, "default"];
  return (
    <>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{data.ym}</Typography>
        <Chip size="small" label={label} color={color} sx={{ height: 20, fontSize: 11 }} />
      </Box>
      {data.done_until !== data.ym && (
        <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.25 }}>
          {data.done_until ? `${DONE_LABEL[kind]} iki ${data.done_until}` : `dar nė vienas ne${DONE_LABEL[kind] === "paskelbta" ? "paskelbtas" : "patvirtintas"}`}
        </Typography>
      )}
      {!!data.warnings && <Typography sx={{ fontSize: 12, color: "warning.dark" }}>⚠ {data.warnings} įspėj.</Typography>}
    </>
  );
}
const SOURCES = [["", "Visi šaltiniai"], ["migration", "Perėjimas: ataskaitos"], ["excel", "Perėjimas: Excel"],
  ["sick_import", "Tabelis: ligos (S15)"], ["s47", "Sodra S47"]];
const MENU = { disableScrollLock: true };
const th = { fontSize: 12, fontWeight: 700, color: "text.secondary", whiteSpace: "nowrap", py: 1 };
const td = { fontSize: 13, py: 1, verticalAlign: "top" };

const Num = ({ n, color = "error.main" }) => (
  <Typography component="span" sx={{ fontSize: 13, fontWeight: n ? 700 : 400, color: n ? color : "text.disabled" }}>{n || 0}</Typography>
);

function Search({ value, onChange, placeholder }) {
  return (
    <TextField size="small" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      sx={{ minWidth: 280 }}
      InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment> }} />
  );
}

function useDebounced(v, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

// ---------- Žiūrėti kaip: bet kuris vartotojas ----------
function ViewAsDialog({ open, onClose }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.get(`${BASE}/users/`, { params: { q: dq } }).then((r) => setUsers(r.data)).finally(() => setLoading(false));
  }, [open, dq]);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth disableScrollLock>
      <DialogTitle sx={{ fontWeight: 800, pr: 6 }}>
        Žiūrėti kaip
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 12, top: 12 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth size="small" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="El. paštas, įmonės pavadinimas ar kodas" sx={{ mb: 1.5 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment>,
            endAdornment: loading ? <CircularProgress size={16} /> : null }} />
        {users.map((u) => (
          <Box key={u.id} sx={{ border: "1px solid #EEF0F3", borderRadius: 2, p: 1.25, mb: 1 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{u.email}</Typography>
            <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 0.75 }}>
              {u.name || "–"} · paskutinį kartą prisijungė {fmt(u.last_login)}
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
              {u.profiles.map((p) => (
                <Chip key={p.id} size="small" clickable icon={<VisibilityOutlinedIcon />}
                  color={p.accounting_program === "dokskenas_erp" ? "primary" : "default"}
                  variant={p.accounting_program === "dokskenas_erp" ? "filled" : "outlined"}
                  label={`${p.name}${p.company_code ? ` (${p.company_code})` : ""}`}
                  onClick={() => startViewAs({ userId: u.id, email: u.email, companyId: p.id, companyName: p.name },
                    p.accounting_program === "dokskenas_erp" ? "/darbo-uzmokestis" : "/suvestine")} />
              ))}
              {!u.profiles.length && (
                <Chip size="small" clickable label="Be įmonės profilio" onClick={() => startViewAs({ userId: u.id, email: u.email }, "/suvestine")} />
              )}
            </Box>
          </Box>
        ))}
        {!loading && !users.length && <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Nerasta</Typography>}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Įmonės ----------
function CompaniesTab({ onErrors, onUploads }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [rows, setRows] = useState(null);
  const load = useCallback(() => {
    setRows(null);
    api.get(`${BASE}/companies/`, { params: { q: dq } }).then((r) => setRows(r.data)).catch(() => setRows([]));
  }, [dq]);
  useEffect(load, [load]);
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1, mb: 1.5, alignItems: "center" }}>
        <Search value={q} onChange={setQ} placeholder="Įmonė, kodas ar el. paštas" />
        <IconButton onClick={load}><RefreshIcon /></IconButton>
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{rows ? `${rows.length} įmonės su DokSkenas ERP` : ""}</Typography>
      </Box>
      {rows === null ? <CircularProgress size={24} /> : (
        <Box sx={{ overflowX: "auto", border: "1px solid #EEF0F3", borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {COLS.map(([h, tip]) => (
                  <TableCell key={h} sx={th}>
                    {tip ? <Tooltip title={tip} arrow><span style={{ cursor: "help", borderBottom: "1px dotted #9CA3AF" }}>{h}</span></Tooltip> : h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => {
                const mig = r.migration && (MIG_STATUS[r.migration.status] || [r.migration.status, "default"]);
                return (
                  <TableRow key={r.company_id} hover>
                    <TableCell sx={td}>
                      <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{r.company_name}</Typography>
                      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{r.company_code}</Typography>
                    </TableCell>
                    <TableCell sx={td}>{r.user_email}</TableCell>
                    <TableCell sx={td}>{r.employees_active} / {r.employees}</TableCell>
                    <TableCell sx={td}>
                      {mig ? (
                        <>
                          <Chip size="small" label={mig[0]} color={mig[1]} sx={{ height: 20, fontSize: 11 }} />
                          {r.migration.mode === "sdup" && <Chip size="small" label="tik SDUP" sx={{ height: 20, fontSize: 11, ml: 0.5 }} />}
                          <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.25, whiteSpace: "nowrap" }}>
                            DU DokSkene nuo {r.migration.du_start?.slice(0, 7)}
                          </Typography>
                          <Typography sx={{ fontSize: 12, color: "text.secondary", whiteSpace: "nowrap" }}>
                            ataskaitų {r.migration.files} · darbuotojų sąraše {r.migration.people}
                          </Typography>
                        </>
                      ) : <Typography sx={{ fontSize: 12, color: "text.disabled" }}>Nepradėtas</Typography>}
                    </TableCell>
                    <TableCell sx={td}><MonthCell data={r.roster} kind="roster" /></TableCell>
                    <TableCell sx={td}><MonthCell data={r.timesheet} kind="timesheet" /></TableCell>
                    <TableCell sx={td}><MonthCell data={r.payroll} kind="payroll" /></TableCell>
                    <TableCell sx={td}><PlanCell p={r.plan} /></TableCell>
                    <TableCell sx={td}>
                      <Typography sx={{ fontSize: 12 }}>klaidos <Num n={r.declarations_errors} /></Typography>
                      <Typography sx={{ fontSize: 12 }}>vėluoja <Num n={r.declarations_overdue} /></Typography>
                    </TableCell>
                    <TableCell sx={td}>
                      <Box onClick={() => onErrors(r.company_id)} sx={{ cursor: "pointer" }}>
                        <Num n={r.errors_7d} color="warning.dark" />
                        {!!r.errors_500_7d && <Typography sx={{ fontSize: 12, color: "error.main", fontWeight: 700 }}>500: {r.errors_500_7d}</Typography>}
                      </Box>
                    </TableCell>
                    <TableCell sx={td}>
                      <Box onClick={() => onUploads(r.company_id)} sx={{ cursor: "pointer" }}>
                        <Typography sx={{ fontSize: 13 }}>{r.uploads}</Typography>
                        {!!r.uploads_failed && <Typography sx={{ fontSize: 12, color: "error.main" }}>neatpažinta {r.uploads_failed}</Typography>}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ ...td, whiteSpace: "nowrap" }}>{fmt(r.last_activity)}</TableCell>
                    <TableCell sx={td}>
                      <Button size="small" variant="outlined" startIcon={<VisibilityOutlinedIcon />} sx={{ textTransform: "none", whiteSpace: "nowrap" }}
                        onClick={() => startViewAs({ userId: r.user_id, email: r.user_email, companyId: r.company_id, companyName: r.company_name })}>
                        Žiūrėti kaip
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
}

function CompanySelect({ companies, value, onChange }) {
  return (
    <Select size="small" value={value || ""} displayEmpty onChange={(e) => onChange(e.target.value)} MenuProps={MENU} sx={{ minWidth: 220 }}>
      <MenuItem value="">Visos įmonės</MenuItem>
      {companies.map((c) => <MenuItem key={c.company_id} value={c.company_id}>{c.company_name}</MenuItem>)}
    </Select>
  );
}

function useCursorList(url, params) {
  const [items, setItems] = useState(null);
  const [next, setNext] = useState(null);
  const [busy, setBusy] = useState(false);
  const key = JSON.stringify(params);
  const load = useCallback((before) => {
    setBusy(true);
    api.get(url, { params: { ...JSON.parse(key), ...(before ? { before } : {}) } })
      .then((r) => {
        setItems((prev) => (before ? [...(prev || []), ...r.data.items] : r.data.items));
        setNext(r.data.next);
      })
      .catch(() => setItems((prev) => prev || []))
      .finally(() => setBusy(false));
  }, [url, key]);
  useEffect(() => {
    setItems(null);
    load(null);
  }, [load]);
  return { items, next, busy, more: () => load(next), reload: () => load(null) };
}

// ---------- Klaidos ----------
function ErrorsTab({ companies, company, setCompany }) {
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const params = useMemo(() => ({ company: company || undefined, kind: kind || undefined, q: dq || undefined }), [company, kind, dq]);
  const { items, next, busy, more, reload } = useCursorList(`${BASE}/errors/`, params);
  const [open, setOpen] = useState(null);
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1, mb: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <CompanySelect companies={companies} value={company} onChange={setCompany} />
        <Select size="small" value={kind} displayEmpty onChange={(e) => setKind(e.target.value)} MenuProps={MENU}>
          <MenuItem value="">Visos klaidos</MenuItem>
          <MenuItem value="4xx">Vartotojo (4xx)</MenuItem>
          <MenuItem value="5xx">Serverio (500)</MenuItem>
        </Select>
        <Search value={q} onChange={setQ} placeholder="Kelias arba pranešimas" />
        <IconButton onClick={reload}><RefreshIcon /></IconButton>
      </Box>
      {items === null ? <CircularProgress size={24} /> : !items.length ? (
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Klaidų nėra</Typography>
      ) : items.map((e) => (
        <Box key={e.id} sx={{ border: "1px solid #EEF0F3", borderLeft: `3px solid ${e.status >= 500 ? "#DC2626" : "#F59E0B"}`, borderRadius: 2, mb: 1 }}>
          <Box onClick={() => setOpen(open === e.id ? null : e.id)} sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", p: 1.25, cursor: "pointer" }}>
            <Chip size="small" label={e.status} color={e.status >= 500 ? "error" : "warning"} sx={{ height: 20, fontSize: 11, fontWeight: 700 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, wordBreak: "break-word" }}>{e.message}</Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                {fmt(e.created_at)} · {e.method} {e.path} · {e.company_name || "–"} · {e.user_email || "–"}
                {e.impersonator_email ? ` (per ${e.impersonator_email})` : ""}
              </Typography>
            </Box>
            <KeyboardArrowDownIcon sx={{ transform: open === e.id ? "rotate(180deg)" : "none", color: "text.secondary" }} />
          </Box>
          <Collapse in={open === e.id} unmountOnExit>
            <Box sx={{ px: 1.25, pb: 1.25 }}>
              {e.payload && <><Typography sx={{ fontSize: 12, fontWeight: 700, mb: 0.5 }}>Užklausa</Typography>
                <Box component="pre" sx={{ fontSize: 11.5, bgcolor: "#F8FAFC", p: 1, borderRadius: 1, overflow: "auto", maxHeight: 240, m: 0, mb: 1 }}>
                  {JSON.stringify(e.payload, null, 2)}</Box></>}
              {e.traceback && <><Typography sx={{ fontSize: 12, fontWeight: 700, mb: 0.5 }}>Traceback</Typography>
                <Box component="pre" sx={{ fontSize: 11.5, bgcolor: "#FEF2F2", p: 1, borderRadius: 1, overflow: "auto", maxHeight: 360, m: 0 }}>
                  {e.traceback}</Box></>}
              {e.company_id && e.user_id && (
                <Button size="small" startIcon={<VisibilityOutlinedIcon />} sx={{ textTransform: "none", mt: 1 }}
                  onClick={() => startViewAs({ userId: e.user_id, email: e.user_email, companyId: e.company_id, companyName: e.company_name })}>
                  Žiūrėti kaip šis vartotojas
                </Button>
              )}
            </Box>
          </Collapse>
        </Box>
      ))}
      {next && <Button onClick={more} disabled={busy} sx={{ textTransform: "none" }}>Rodyti daugiau</Button>}
    </Box>
  );
}

// ---------- Failai ----------
function ReparseDialog({ item, onClose }) {
  const [res, setRes] = useState(null);
  useEffect(() => {
    if (!item) return;
    setRes(null);
    api.post(`${BASE}/uploads/${item.id}/reparse/`).then((r) => setRes(r.data)).catch((e) => setRes({ error: String(e?.response?.data?.detail || e) }));
  }, [item]);
  return (
    <Dialog open={!!item} onClose={onClose} maxWidth="md" fullWidth disableScrollLock>
      <DialogTitle sx={{ fontWeight: 800, pr: 6 }}>
        Perskaityta dabartiniu parseriu: {item?.file_name}
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 12, top: 12 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        {res === null ? <CircularProgress size={24} /> : (
          <>
            {res.error && <Alert severity="error" sx={{ mb: 1 }}>{res.error}</Alert>}
            <Box component="pre" sx={{ fontSize: 12, bgcolor: "#F8FAFC", p: 1.5, borderRadius: 1, overflow: "auto", maxHeight: "60vh", m: 0 }}>
              {JSON.stringify(res, null, 2)}
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UploadsTab({ companies, company, setCompany }) {
  const [source, setSource] = useState("");
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const params = useMemo(() => ({ company: company || undefined, source: source || undefined, failed: failed ? 1 : undefined, q: dq || undefined }),
    [company, source, failed, dq]);
  const { items, next, busy, more, reload } = useCursorList(`${BASE}/uploads/`, params);
  const [reparse, setReparse] = useState(null);
  const download = async (a) => {
    const r = await api.get(`${BASE}/uploads/${a.id}/download/`, { responseType: "blob" });
    const url = URL.createObjectURL(r.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = a.file_name || `failas-${a.id}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1, mb: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <CompanySelect companies={companies} value={company} onChange={setCompany} />
        <Select size="small" value={source} displayEmpty onChange={(e) => setSource(e.target.value)} MenuProps={MENU}>
          {SOURCES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
        </Select>
        <FormControlLabel control={<Checkbox size="small" checked={failed} onChange={(e) => setFailed(e.target.checked)} />}
          label={<Typography sx={{ fontSize: 13 }}>Tik neatpažinti</Typography>} />
        <Search value={q} onChange={setQ} placeholder="Failo pavadinimas ar forma" />
        <IconButton onClick={reload}><RefreshIcon /></IconButton>
      </Box>
      {items === null ? <CircularProgress size={24} /> : (
        <Box sx={{ overflowX: "auto", border: "1px solid #EEF0F3", borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {["Įkelta", "Įmonė", "Šaltinis", "Failas", "Forma", "Būsena", ""].map((h) => <TableCell key={h} sx={th}>{h}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((a) => (
                <TableRow key={a.id} hover>
                  <TableCell sx={{ ...td, whiteSpace: "nowrap" }}>
                    {fmt(a.created_at)}
                    {a.times > 1 && <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>×{a.times}, paskutinį {fmt(a.last_uploaded_at)}</Typography>}
                  </TableCell>
                  <TableCell sx={td}>
                    <Typography sx={{ fontSize: 13 }}>{a.company_name || "–"}</Typography>
                    <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{a.user_email}</Typography>
                  </TableCell>
                  <TableCell sx={td}>{a.source_label}</TableCell>
                  <TableCell sx={{ ...td, maxWidth: 280, wordBreak: "break-all" }}>
                    {a.file_name}
                    <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{kb(a.size)}</Typography>
                  </TableCell>
                  <TableCell sx={td}>
                    {a.form || "–"}
                    {a.meta?.period && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{a.meta.period.join(" – ")}</Typography>}
                    {!a.meta?.period && a.meta?.year && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{a.meta.year}-{String(a.meta.month || "").padStart(2, "0")}</Typography>}
                  </TableCell>
                  <TableCell sx={{ ...td, maxWidth: 300 }}>
                    <Chip size="small" label={a.parsed ? "Atpažinta" : "Neatpažinta"} color={a.parsed ? "success" : "error"} sx={{ height: 20, fontSize: 11 }} />
                    {a.error && <Typography sx={{ fontSize: 12, color: a.parsed ? "warning.dark" : "error.main", mt: 0.25 }}>{a.error}</Typography>}
                  </TableCell>
                  <TableCell sx={{ ...td, whiteSpace: "nowrap" }}>
                    <Tooltip title="Atsisiųsti"><IconButton size="small" onClick={() => download(a)}><DownloadOutlinedIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Perskaityti dabartiniu parseriu"><IconButton size="small" onClick={() => setReparse(a)}><ReplayOutlinedIcon fontSize="small" /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!items.length && <Typography sx={{ fontSize: 13, color: "text.secondary", p: 2 }}>Failų nėra</Typography>}
        </Box>
      )}
      {next && <Button onClick={more} disabled={busy} sx={{ textTransform: "none", mt: 1 }}>Rodyti daugiau</Button>}
      <ReparseDialog item={reparse} onClose={() => setReparse(null)} />
    </Box>
  );
}

export default function AdminDuPage() {
  const me = useAdminWhoami();
  const [tab, setTab] = useState("companies");
  const [company, setCompany] = useState("");
  const [companies, setCompanies] = useState([]);
  const [viewAs, setViewAs] = useState(false);
  useEffect(() => {
    if (me?.is_superuser) api.get(`${BASE}/companies/`).then((r) => setCompanies(r.data)).catch(() => {});
  }, [me]);

  if (me === null) return <Box sx={{ p: 4 }}><CircularProgress size={24} /></Box>;
  if (!me.is_superuser) return <Box sx={{ p: 4 }}><Alert severity="error">Neturite teisių</Alert></Box>;

  const go = (t) => (id) => {
    setCompany(id);
    setTab(t);
  };
  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: "auto" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1, gap: 2, flexWrap: "wrap" }}>
        <Box>
          <Typography sx={{ fontSize: 22, fontWeight: 800 }}>Admin: Personalas ir DU</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Įmonės, klaidos ir vartotojų įkelti failai</Typography>
        </Box>
        <Button variant="contained" startIcon={<VisibilityOutlinedIcon />} onClick={() => setViewAs(true)}
          sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2, boxShadow: "none" }}>
          Žiūrėti kaip…
        </Button>
      </Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: "1px solid #EEF0F3" }}>
        <Tab value="companies" label="Įmonės" sx={{ textTransform: "none", fontWeight: 700 }} />
        <Tab value="errors" label="Klaidos" sx={{ textTransform: "none", fontWeight: 700 }} />
        <Tab value="uploads" label="Įkelti failai" sx={{ textTransform: "none", fontWeight: 700 }} />
      </Tabs>
      {tab === "companies" && <CompaniesTab onErrors={go("errors")} onUploads={go("uploads")} />}
      {tab === "errors" && <ErrorsTab companies={companies} company={company} setCompany={setCompany} />}
      {tab === "uploads" && <UploadsTab companies={companies} company={company} setCompany={setCompany} />}
      <ViewAsDialog open={viewAs} onClose={() => setViewAs(false)} />
    </Box>
  );
}
