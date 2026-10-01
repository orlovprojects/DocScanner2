import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  InputAdornment, Paper, Slider, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import CloseIcon from "@mui/icons-material/Close";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";

import { apiError, money, payrollApi } from "../../api/payroll";

const today = () => new Date().toISOString().slice(0, 10);
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const CRITERIA = [
  { key: "skills", label: "Įgūdžiai ir kompetencijos", help: "Kiek žinių ir patirties reikia šiam darbui" },
  { key: "qualification", label: "Kvalifikacija", help: "Reikalingas išsilavinimas, sertifikatai" },
  { key: "effort", label: "Pastangos", help: "Fizinis, protinis ir emocinis krūvis" },
  { key: "responsibility", label: "Atsakomybė", help: "Už žmones, pinigus, turtą, sprendimus" },
  { key: "conditions", label: "Darbo sąlygos", help: "Aplinka, rizika, darbo laiko ypatumai" },
];

export default function DarboApmokejimoSistemaPage() {
  const [groups, setGroups] = useState([]);
  const [positions, setPositions] = useState([]);
  const [issues, setIssues] = useState([]);
  const [docs, setDocs] = useState([]);
  const [edit, setEdit] = useState(null);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [g, p, i, d] = await Promise.all([
        payrollApi.positionGroups(), payrollApi.positions(), payrollApi.groupsCheck(), payrollApi.dasList(),
      ]);
      setGroups(g); setPositions(p); setIssues(i); setDocs(d); setError("");
    } catch (e) { setError(apiError(e)); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const autoCreate = async () => {
    setBusy(true);
    try { await payrollApi.autoCreateGroups(); await load(); } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };

  const noGroup = issues.filter((i) => i.type === "no_group");
  const nums = groups.map((g) => /^G(\d+)$/.exec(g.code)).filter(Boolean).map((m) => Number(m[1]));
  const nextCode = `G${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`;
  const outOfRange = issues.filter((i) => i.type === "out_of_range");
  const mmaUpdated = issues.filter((i) => i.type === "mma_updated");
  const outdated = issues.some((i) => i.type === "das_outdated");

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100 }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={2} mb={1}>
        <Typography variant="h5" fontWeight={700}>Darbo apmokėjimo sistema</Typography>
        <Chip color={docs.length && !outdated ? "success" : "warning"}
          label={!docs.length ? "Privaloma iki 2026-12-31" : outdated ? `Reikia atnaujinti (v${docs[0].version})` : `Patvirtinta (v${docs[0].version})`} />
      </Stack>
      <Typography variant="body2" color="text.secondary" mb={3} maxWidth={780}>
        Nuo 2027 m. visi darbdaviai turi turėti patvirtintą darbo apmokėjimo sistemą: pareigos suskirstomos į grupes pagal
        objektyvius kriterijus ir kiekvienai grupei nustatomos algos ribos. Grupių numeriai kas mėnesį teikiami Sodrai (SDUP).
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* 1. Grupės */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} mb={2}>
          <Box>
            <Typography fontWeight={700}>1. Pareigybių grupės</Typography>
            <Typography variant="body2" color="text.secondary">Į vieną grupę dedamos pareigos, kurių darbas vienodos vertės.</Typography>
          </Box>
          <Stack direction="row" gap={1} alignItems="flex-start">
            {noGroup.length > 0 && (
              <Button startIcon={<AutoFixHighIcon />} variant="outlined" disabled={busy} onClick={autoCreate}>Sukurti automatiškai</Button>
            )}
            <Button startIcon={<AddIcon />} variant="contained" onClick={() => setEdit({})}>Nauja grupė</Button>
          </Stack>
        </Stack>

        {outdated && (
          <Alert severity="warning" sx={{ mb: 2 }}
            action={<Button color="inherit" size="small" onClick={() => setPreview(true)}>Patvirtinti</Button>}>
            Grupės pakeistos po patvirtinimo – patvirtinkite naują darbo apmokėjimo sistemos versiją.
          </Alert>
        )}
        {mmaUpdated.length > 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Pakilo minimali mėnesinė alga – grupių minimumai atnaujinti automatiškai:{" "}
            {mmaUpdated.map((i) => `${i.group} ${money(i.old)} → ${money(i.new)}`).join(", ")}.
          </Alert>
        )}
        {noGroup.length > 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Pareigos be grupės: {noGroup.map((i) => i.position).join(", ")}.
            Mažai įmonei paprasčiausia – „Sukurti automatiškai“: kiekvienos pareigos taps atskira grupe, o algų ribos bus užpildytos pagal dabartines algas.
          </Alert>
        )}
        {outOfRange.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {outOfRange.map((i, n) => (
              <div key={n}>{i.employee} ({i.position}): alga visam etatui {money(i.salary)} – už grupės {i.group} ribų ({money(i.min)} – {money(i.max)})</div>
            ))}
          </Alert>
        )}

        {groups.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>Grupių dar nėra.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nr.</TableCell><TableCell>Pavadinimas</TableCell><TableCell>Pareigos</TableCell>
                <TableCell align="center">Balai</TableCell><TableCell align="right">Alga (visam etatui)</TableCell><TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {groups.map((g) => (
                <TableRow key={g.id} hover>
                  <TableCell><b>{g.code}</b></TableCell>
                  <TableCell>{g.name}</TableCell>
                  <TableCell>{g.positions.map((p) => p.name).join(", ") || "–"}</TableCell>
                  <TableCell align="center">{g.total_score} / 25</TableCell>
                  <TableCell align="right">
                    {!g.salary_min && !g.salary_max ? "–"
                      : g.salary_min === g.salary_max ? `${money(g.salary_min)} (fiksuota)`
                      : `${money(g.salary_min)} – ${money(g.salary_max)}`}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    <IconButton size="small" onClick={() => setEdit(g)}><EditOutlinedIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => payrollApi.deleteGroup(g.id).then(load)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      {/* 2. Dokumentas */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
        <Typography fontWeight={700}>2. Dokumentas</Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Dokumentas sugeneruojamas iš grupių. Peržiūrėkite, atsispausdinkite ir patvirtinkite. Tai šablonas – prireikus jį galima papildyti.
        </Typography>
        <Button variant="contained" disabled={groups.length === 0} onClick={() => setPreview(true)}>Peržiūrėti ir patvirtinti</Button>
      </Paper>

      {/* 3. Versijos */}
      {docs.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography fontWeight={700} mb={1}>Patvirtintos versijos</Typography>
          {docs.map((d) => (
            <Stack key={d.id} direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 1, borderBottom: 1, borderColor: "divider" }}>
              <Typography variant="body2">v{d.version} · patvirtinta {d.approved_date}{d.manager_name ? ` · ${d.manager_name}` : ""}</Typography>
              <Button size="small" startIcon={<PrintOutlinedIcon />} onClick={() => payrollApi.dasHtml(d.id).then(printHtml)}>Spausdinti</Button>
            </Stack>
          ))}
        </Paper>
      )}

      <GroupDialog group={edit} nextCode={nextCode} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
      <PreviewDialog open={preview} onClose={() => setPreview(false)} onApproved={() => { setPreview(false); load(); }} />
    </Box>
  );
}

function printHtml(html) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open(); w.document.write(html); w.document.close();
  w.focus(); setTimeout(() => w.print(), 300);
}

function GroupDialog({ group, nextCode, onClose, onSaved }) {
  const [f, setF] = useState(null);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [opts, setOpts] = useState({ positions: [], lpk: [] });
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!group) return;
    setError(""); setInput(""); setTouched(false);
    setF({
      code: group.code || "", name: group.name || "", description: group.description || "",
      salary_min: group.salary_min || "", salary_max: group.salary_max || "",
      positions: (group.positions || []).map((p) => ({ kind: "pos", key: `p${p.id}`, id: p.id, name: p.name, sub: "" })),
      ...Object.fromEntries(CRITERIA.map((c) => [c.key, group[c.key] || 3])),
    });
  }, [group]);

  useEffect(() => {
    if (!group) return;
    const t = setTimeout(() => payrollApi.searchPositions(input).then(setOpts).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [input, group]);

  if (!group || !f) return null;
  const set = (v) => setF((s) => ({ ...s, ...v }));

  const options = [
    ...opts.positions.map((p) => ({
      kind: "pos", key: `p${p.id}`, id: p.id, name: p.name,
      sub: [p.lpk_code, p.group_code && p.group_code !== f.code ? `dabar grupėje ${p.group_code}` : ""].filter(Boolean).join(" · "),
      suggested: p.suggested,
    })),
    ...opts.lpk.map((l) => ({ kind: "lpk", key: `l${l.code}`, code: l.code, name: l.title, sub: `${l.name} · ${l.code}`, suggested: l.suggested })),
  ];

  const save = async () => {
    try {
      const ids = [];
      for (const p of f.positions) {
        if (p.kind === "lpk") {
          const existing = opts.positions.find((x) => x.lpk_code === p.code);
          const pos = existing || await payrollApi.createPosition({ name: p.name, lpk_code: p.code });
          ids.push(pos.id);
        } else {
          ids.push(p.id);
        }
      }
      const { positions: _p, code: _c, ...rest } = f;
      const data = { ...rest, salary_min: f.salary_min || null, salary_max: f.salary_max || null, position_ids: ids };
      if (group.id) await payrollApi.updateGroup(group.id, data); else await payrollApi.createGroup(data);
      onSaved();
    } catch (e) { setError(apiError(e)); }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" disableScrollLock>
      <DialogTitle sx={{ pr: 6 }}>
        {group.id ? "Grupė " + group.code : "Nauja pareigybių grupė"}
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 12, top: 12 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack gap={2} mt={1}>
          <Stack direction="row" gap={2}>
            <TextField label="Grupės nr." value={group.id ? f.code : nextCode} sx={{ width: 170 }} disabled
              helperText="Priskiriamas automatiškai" />
            <TextField label="Pavadinimas" value={f.name} onChange={(e) => set({ name: e.target.value })} fullWidth required />
          </Stack>
          <Autocomplete
            multiple options={options} value={f.positions} filterOptions={(x) => x}
            groupBy={(o) => (o.kind === "pos" ? "Jūsų įmonės pareigos" : "Profesijų klasifikatorius")}
            getOptionLabel={(o) => o.name || ""} isOptionEqualToValue={(a, b) => a.key === b.key}
            onInputChange={(_, v, reason) => reason === "input" && setInput(v)}
            onChange={(_, v) => {
              const patch = { positions: v };
              const first = v[0];
              if (!group.id && !touched && first?.suggested) {
                const { note, ...scores } = first.suggested;
                Object.assign(patch, scores, {
                  description: `Vertinimas pasiūlytas automatiškai pagal profesijų klasifikatorių - patikrinkite. ${note || ""}`.trim(),
                });
              }
              if (!f.name && first) patch.name = first.name;
              set(patch); setInput("");
            }}
            noOptionsText={input.length < 2 ? "Įveskite bent 2 raides" : "Nerasta"}
            renderOption={(props, o) => (
              <li {...props} key={o.key}>
                <Box>
                  <Typography fontSize={14}>{o.name}</Typography>
                  {o.sub && <Typography variant="caption" color="text.secondary">{o.sub}</Typography>}
                </Box>
              </li>
            )}
            renderInput={(p) => <TextField {...p} label="Pareigos šioje grupėje" placeholder="Ieškoti, pvz. buhalt" />}
          />
          <Box>
            <Typography fontWeight={600}>Kiek šis darbas reikalauja? (1 – mažai, 5 – labai daug)</Typography>
            <Typography variant="caption" color="text.secondary" display="block" mb={1}>
              Vertinamos pareigos, o ne žmogus. Darbuotojo patirtis ir rezultatai lemia, kokia jo alga bus grupės ribose.
            </Typography>
            {f.description?.replace(/Vertinimas pasiūlytas automatiškai.*patikrinkite\.\s*/, "") && (
              <Alert severity="info" sx={{ mb: 1.5, py: 0 }}>
                {f.description.replace(/Vertinimas pasiūlytas automatiškai.*patikrinkite\.\s*/, "")}
              </Alert>
            )}
            {CRITERIA.map((c) => (
              <Box key={c.key} sx={{ mb: 1 }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2">{c.label}</Typography>
                  <Typography variant="body2" fontWeight={700}>{f[c.key]}</Typography>
                </Stack>
                <Slider size="small" min={1} max={5} step={1} marks value={f[c.key]} onChange={(_, v) => { set({ [c.key]: v }); setTouched(true); }} />
                <Typography variant="caption" color="text.secondary">{c.help}</Typography>
              </Box>
            ))}
          </Box>
          <Stack direction="row" gap={2}>
            <TextField label="Alga nuo" type="number" value={f.salary_min} onChange={(e) => set({ salary_min: e.target.value })} fullWidth
              InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }} />
            <TextField label="Alga iki" type="number" value={f.salary_max} onChange={(e) => set({ salary_max: e.target.value })} fullWidth
              InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }} />
          </Stack>
          <Typography variant="caption" color="text.secondary">Algos ribos nurodomos visam etatui. Konkreti alga ribose priklauso nuo patirties ir rezultatų.</Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Atšaukti</Button>
        <Button variant="contained" onClick={save} disabled={!f.name}>Išsaugoti</Button>
      </DialogActions>
    </Dialog>
  );
}

function PreviewDialog({ open, onClose, onApproved }) {
  const [date, setDate] = useState(today());
  const [manager, setManager] = useState("");
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const frame = useRef(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => payrollApi.dasPreview(date, manager).then(setHtml).catch((e) => setError(apiError(e))), 250);
    return () => clearTimeout(t);
  }, [open, date, manager]);

  const approve = async () => {
    try { await payrollApi.dasApprove({ approved_date: date, manager_name: manager }); onApproved(); }
    catch (e) { setError(apiError(e)); }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" disableScrollLock>
      <DialogTitle sx={{ pr: 6 }}>
        Darbo apmokėjimo sistema
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 12, top: 12 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack direction="row" gap={2} mb={2} mt={1}>
          <TextField size="small" label="Patvirtinimo data" type="date" value={date} InputLabelProps={{ shrink: true }} onChange={(e) => setDate(e.target.value)} />
          <TextField size="small" label="Vadovas (vardas, pavardė)" value={manager} onChange={(e) => setManager(e.target.value)} sx={{ flex: 1 }} />
        </Stack>
        <Paper variant="outlined" sx={{ height: 520, overflow: "hidden" }}>
          <iframe ref={frame} title="DAS" srcDoc={html} style={{ width: "100%", height: "100%", border: 0, background: "#fff" }} />
        </Paper>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button startIcon={<PrintOutlinedIcon />} onClick={() => frame.current?.contentWindow?.print()}>Spausdinti / PDF</Button>
        <Box flex={1} />
        <Button onClick={onClose}>Uždaryti</Button>
        <Button variant="contained" onClick={approve}>Patvirtinti</Button>
      </DialogActions>
    </Dialog>
  );
}
