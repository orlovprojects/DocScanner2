/* eslint-disable react/prop-types -- CodesDialog is supplied by the EPRIS page. */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Checkbox, CircularProgress,
  IconButton, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import { api } from "../api/endpoints";
import { vatRateLabel } from "./eprisAmounts";
import { documentErrors, notificationText } from "./eprisFeedback";

const fmt = value => value == null || value === "" ? "—" : Number(value).toLocaleString("lt-LT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isReady = entry => entry.epris_status === "tinkama";
const isSubmitted = entry => !!entry.epris_submitted_at;
const isSelectable = isReady;
const autoSelect = entry => isReady(entry) && !isSubmitted(entry);
const matchesStatus = (entry, filter) => filter === "all" || (filter === "submitted" ? isSubmitted(entry) : !isSubmitted(entry));

function periods(year) {
  if (!year) return [];
  const result = [{ value: "year", label: "Pilni metai", date_from: `${year}-01-01`, date_to: `${year}-12-31` }];
  for (let q = 1; q <= 4; q++) result.push({
    value: `q${q}`, label: `${q} ketvirtis`,
    date_from: `${year}-${String(q * 3 - 2).padStart(2, "0")}-01`,
    date_to: `${year}-${String(q * 3).padStart(2, "0")}-${new Date(year, q * 3, 0).getDate()}`,
  });
  return result;
}

function defaultPeriod(year) {
  const now = new Date();
  const closedQuarter = Math.floor(now.getMonth() / 3);
  return year === now.getFullYear() && closedQuarter ? `q${closedQuarter}` : "year";
}

export default function EprisWorkspace({ CodesDialog }) {
  const [companies, setCompanies] = useState([]);
  const [options, setOptions] = useState([]);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [overview, setOverview] = useState([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [year, setYear] = useState("");
  const [country, setCountry] = useState("");
  const [period, setPeriod] = useState("year");
  const [statusFilter, setStatusFilter] = useState("all");
  const [data, setData] = useState(null);
  const [checked, setChecked] = useState([]);
  const [dialogDoc, setDialogDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [revision, setRevision] = useState(0);
  const [exportRevision, setExportRevision] = useState(0);
  const generation = useRef(0);
  const keys = useMemo(() => companies.map(c => c.key), [companies]);
  const periodOptions = useMemo(() => periods(year), [year]);
  const countryRows = useMemo(() => overview.filter(r => r.year === year), [overview, year]);
  const dates = periodOptions.find(p => p.value === period);
  const payload = useMemo(() => ({ contractor_keys: keys, country, date_from: dates?.date_from,
    date_to: dates?.date_to, year_remainder: false, include_submitted: true,
  }), [keys, country, dates?.date_from, dates?.date_to]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get("/epris/contractors/", { params: { q: search }, signal: controller.signal });
        setOptions(res.data);
      } catch { if (!controller.signal.aborted) setError("Nepavyko rasti įmonių"); }
      finally { if (!controller.signal.aborted) setSearching(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    if (!keys.length) { setOverview([]); setOverviewLoading(false); return; }
    setOverviewLoading(true);
    api.get("/epris/overview/", { params: { contractor_keys: JSON.stringify(keys), include_submitted: 1 }, signal: controller.signal })
      .then(res => {
        if (controller.signal.aborted) return;
        setOverview(res.data.rows);
        setYear(previous => res.data.rows.some(r => r.year === previous) ? previous : res.data.rows[0]?.year || "");
      })
      .catch(() => { if (!controller.signal.aborted) setError("Nepavyko įkelti sąskaitų"); })
      .finally(() => { if (!controller.signal.aborted) setOverviewLoading(false); });
    return () => controller.abort();
  }, [keys, revision]);

  useEffect(() => {
    setCountry(previous => countryRows.some(r => r.country === previous) ? previous : countryRows[0]?.country || "");
  }, [countryRows]);
  useEffect(() => { setPeriod(defaultPeriod(year)); }, [year]);

  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    setData(null); setChecked([]); setSuccess(""); setError(""); setLoading(false);
    if (!keys.length || !payload.country || !payload.date_from || !payload.date_to) return;
    setLoading(true);
    api.post("/epris/documents/", { ...payload, offset: 0, limit: 100 }, { signal: controller.signal })
      .then(res => {
        if (controller.signal.aborted || current !== generation.current) return;
        setData(res.data);
        setChecked(res.data.entries.filter(e => autoSelect(e) && matchesStatus(e, statusFilter)).map(e => e.id));
      })
      .catch(err => { if (!controller.signal.aborted) setError(err.response?.data?.error || "Nepavyko įkelti sąskaitų"); })
      .finally(() => { if (!controller.signal.aborted && current === generation.current) setLoading(false); });
    return () => controller.abort();
  }, [payload, keys.length, exportRevision]);

  const loadMore = async () => {
    const current = generation.current;
    setLoading(true);
    try {
      const res = await api.post("/epris/documents/", { ...payload, offset: data.entries.length, limit: 100 });
      if (current !== generation.current) return;
      setData(previous => ({ ...res.data, entries: [...previous.entries, ...res.data.entries] }));
      setChecked(previous => [...previous, ...res.data.entries.filter(e => autoSelect(e) && matchesStatus(e, statusFilter)).map(e => e.id)]);
    } catch (err) { if (current === generation.current) setError(err.response?.data?.error || "Nepavyko įkelti sąskaitų"); }
    finally { if (current === generation.current) setLoading(false); }
  };

  const visible = (data?.entries || []).filter(e => matchesStatus(e, statusFilter));
  const ready = visible.filter(isSelectable);
  const selected = (data?.entries || []).filter(e => checked.includes(e.id));
  const sum = selected.reduce((total, e) => total + Number(e.deductible_eur || 0), 0);
  const currency = countryRows.find(row => row.country === country)?.currency || "EUR";
  const currencyTotals = selected.reduce((totals, entry) => {
    totals[entry.currency] = (totals[entry.currency] || 0) + Number(entry.epris_details.deductible_vat || 0);
    return totals;
  }, {});
  if (!selected.length) currencyTotals[currency] = 0;
  const foreignTotals = Object.entries(currencyTotals).filter(([code]) => code !== "EUR");
  const periodErrors = data?.period_errors || [];
  const belowMinimum = data && sum < Number(data.threshold);
  const minimumPeriod = Number(data?.threshold) === 50 ? "Pilniems metams" : "Ketvirčiui";
  const canExport = selected.length > 0 && selected.every(isReady) && !periodErrors.length && !belowMinimum;
  const toggle = id => setChecked(previous => previous.includes(id) ? previous.filter(i => i !== id) : [...previous, id]);
  const download = async format => {
    setDownloading(format); setError(""); setSuccess("");
    try {
      const res = await api.post("/epris/export/", { ...payload, document_ids: checked, format }, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `EPRIS_${country}_${payload.date_from}_${payload.date_to}${format === "csv" ? ".csv" : "_priedai.zip"}`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      setSuccess(format === "csv" ? "Failas paruoštas importui į EPRIS." : "Kopijos paruoštos EPRIS skilčiai „Priedai“.");
      if (format === "csv") { setExportRevision(r => r + 1); setRevision(r => r + 1); }
    } catch (err) {
      let message = err.response?.data?.error;
      if (err.response?.data instanceof Blob) {
        try { message = JSON.parse(await err.response.data.text()).error; } catch { /* use fallback */ }
      }
      setError(message || "Nepavyko paruošti failo");
    } finally { setDownloading(""); }
  };

  return <Box sx={{ maxWidth: 1200, mx: "auto", px: { xs: 1.5, md: 3 }, py: 3 }}>
    <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>Užsienio PVM grąžinimas (per EPRIS)</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Suformuokite prašymų .csv failus importuoti į EPRIS sistemą</Typography>
    <Paper variant="outlined" sx={{ p: 2.5, mb: 3, borderRadius: 2 }}>
      <Autocomplete multiple size="small" options={options} value={companies}
        onChange={(_, value) => { generation.current++; setCompanies(value); setOverview([]); setYear(""); setCountry(""); setData(null); setChecked([]); setDialogDoc(null); }}
        onInputChange={(_, value) => setSearch(value)} loading={searching} filterOptions={items => items}
        isOptionEqualToValue={(a, b) => a.key === b.key}
        getOptionLabel={o => `${o.display_name}${o.code ? ` · ${o.code}` : o.vat ? ` · ${o.vat}` : ""}`}
        noOptionsText="Įmonių nerasta" loadingText="Ieškoma…"
        renderOption={(props, option) => <li {...props} key={option.key}><Box>
          <Typography variant="body2">{option.display_name}</Typography>
          <Typography variant="caption" color="text.secondary">{[option.code, option.vat].filter(Boolean).join(" · ")}</Typography>
        </Box></li>}
        renderInput={params => <TextField {...params} label="Pasirinkite pirkėjo įmonę bei jos variacijas" placeholder="Pavadinimas arba kodas" />} />
      {!!overview.length && <Stack direction={{ xs: "column", sm: "row" }} gap={2} sx={{ mt: 2 }}>
        <TextField select size="small" label="Metai" value={year} sx={{ minWidth: 120 }} onChange={e => { generation.current++; setYear(e.target.value); setData(null); setChecked([]); }}>
          {[...new Set(overview.map(r => r.year))].map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Šalis" value={countryRows.some(r => r.country === country) ? country : ""} sx={{ minWidth: 180, flex: 1 }} onChange={e => setCountry(e.target.value)}>
          {countryRows.map(r => <MenuItem key={r.country} value={r.country}>{r.country_name} · {r.doc_count} sąsk.</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Laikotarpis" value={period} sx={{ minWidth: 180, flex: 1 }} onChange={e => setPeriod(e.target.value)}>
          {periodOptions.map(p => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Būsena" value={statusFilter} sx={{ minWidth: 170 }} onChange={e => {
          setStatusFilter(e.target.value);
          setChecked((data?.entries || []).filter(x => (e.target.value === "submitted" ? isSelectable(x) : autoSelect(x)) && matchesStatus(x, e.target.value)).map(x => x.id));
        }}>
          <MenuItem value="all">Visi</MenuItem>
          <MenuItem value="new">Neeksportuoti</MenuItem>
          <MenuItem value="submitted">Eksportuoti</MenuItem>
        </TextField>
      </Stack>}
    </Paper>

    {error && <Alert severity="error" sx={{ mb: 2 }}>{notificationText(error)}</Alert>}
    {success && <Alert severity="success" sx={{ mb: 2 }}>{notificationText(success)}</Alert>}
    {(overviewLoading || loading) && <Box sx={{ py: 2, textAlign: "center" }}><CircularProgress size={24} /></Box>}
    {!!keys.length && !overviewLoading && !overview.length && <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>Sąskaitų nerasta.</Typography>}
    {data && <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
      <Stack direction="row" gap={1.5} flexWrap="wrap" alignItems="center" sx={{ p: 2 }}>
        <Box sx={{ flex: 1, minWidth: 230 }}>
          <Typography variant="body2" color="text.secondary">Prašymo PVM suma:</Typography>
          <Typography fontWeight={700} variant="h6">
            {foreignTotals.length ? foreignTotals.map(([code, total]) => `${fmt(total)} ${code}`).join(" + ") : `${fmt(sum)} EUR`}
          </Typography>
          {!!foreignTotals.length && <Typography variant="body2" color="text.secondary">≈ {fmt(sum)} EUR</Typography>}
          <Typography variant="caption" color="text.secondary">Pasirinkta sąskaitų: {selected.length}</Typography>
        </Box>
        <Button startIcon={<DownloadIcon />} variant="outlined" disabled={!canExport || !!downloading} onClick={() => download("attachments")}>Sąskaitų kopijos</Button>
        <Button startIcon={<DownloadIcon />} variant="contained" disabled={!canExport || !!downloading} onClick={() => download("csv")}>{downloading ? "Ruošiama…" : "Eksportuoti į EPRIS"}</Button>
      </Stack>
      {!!periodErrors.length && <Alert severity="error" sx={{ mx: 2, mb: 2 }}>
        <Typography component="div" fontWeight={600}>Prašymo eksportuoti negalima</Typography>
        {periodErrors.map(message => <div key={message}>{notificationText(message)}</div>)}
      </Alert>}
      {data.deadline_passed && <Alert severity="warning" sx={{ mx: 2, mb: 2 }}>
        <Typography component="div" fontWeight={600}>Prašymo pateikimo terminas praleistas</Typography>
        Pateikimo terminas: {data.deadline.slice(0, 4)} m. rugsėjo 30 d
      </Alert>}
      {belowMinimum && <Alert severity="warning" sx={{ mx: 2, mb: 2 }}>
        <Typography component="div" fontWeight={600}>Nepakanka grąžintino PVM</Typography>
        {minimumPeriod} reikia bent {fmt(data.threshold)} EUR. Pasirinkta {fmt(sum)} EUR; trūksta {fmt(Number(data.threshold) - sum)} EUR
      </Alert>}
      <TableContainer><Table size="small" sx={{ "& .MuiTableCell-root": { py: 0.5 }, "& .MuiCheckbox-root": { p: 0.5 }, "& .MuiButton-root": { minHeight: 28, py: 0.25, whiteSpace: "nowrap" } }}>
        <TableHead><TableRow>
          <TableCell padding="checkbox"><Checkbox size="small" inputProps={{ "aria-label": "Pasirinkti visas paruoštas sąskaitas" }} checked={ready.length > 0 && checked.length === ready.length} indeterminate={checked.length > 0 && checked.length < ready.length} onChange={() => setChecked(checked.length === ready.length ? [] : ready.map(e => e.id))} /></TableCell>
          {["Sąskaitos data", "Sąskaitos numeris", "Tiekėjas", "Suma be PVM", "PVM %", "Grąžintinas PVM", "Kategorija", "Statusas"].map(label => <TableCell key={label} align={label === "Statusas" ? "center" : "left"} sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>{label}</TableCell>)}
        </TableRow></TableHead>
        <TableBody>{visible.map(entry => <TableRow key={entry.id} hover>
          <TableCell padding="checkbox"><Checkbox size="small" checked={checked.includes(entry.id)} disabled={!isSelectable(entry)} onChange={() => toggle(entry.id)} inputProps={{ "aria-label": `Pasirinkti ${entry.document_number || entry.id}` }} /></TableCell>
          <TableCell sx={{ whiteSpace: "nowrap" }}>{entry.invoice_date}</TableCell>
          <TableCell><Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Typography component="span" variant="body2" onClick={() => setDialogDoc(entry)} sx={{ whiteSpace: "nowrap", color: "primary.main", cursor: "pointer", "&:hover": { textDecoration: "underline" } }}>{entry.document_series}{entry.document_number || "Be numerio"}</Typography>
            {!!documentErrors(entry).length && <Tooltip title={<Box>{documentErrors(entry).map(message => <div key={message}>{message}</div>)}</Box>}>
              <IconButton size="small" color="error" aria-label={`Sąskaitos ${entry.document_number || entry.id} klaidos`} onClick={() => setDialogDoc(entry)}>
                <ErrorOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>}
          </Box></TableCell>
          <TableCell sx={{ maxWidth: 240 }}><Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Typography variant="body2" noWrap>{entry.seller_name}</Typography>
            {entry.supplier_country_notice && <Tooltip title={notificationText(entry.supplier_country_notice)}>
              <Button size="small" color="warning" aria-label="Tiekėjo šalies neatitikimas" sx={{ minWidth: 28, px: 0 }} onClick={() => setDialogDoc(entry)}><WarningAmberIcon fontSize="small" /></Button>
            </Tooltip>}
          </Box></TableCell>
          <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{fmt(entry.amount_wo_vat)} {entry.currency}</TableCell>
          <TableCell sx={{ whiteSpace: "nowrap" }}>{vatRateLabel(entry)}</TableCell>
          <TableCell sx={{ whiteSpace: "nowrap" }}>{fmt(entry.epris_details.deductible_vat)} {entry.currency}</TableCell>
          <TableCell><Tooltip describeChild title={<Box>{(entry.category_labels || []).map(label => <div key={label}>{label}</div>)}</Box>}>
            <Button size="small" sx={{ textTransform: "none" }} variant={entry.epris_codes.length ? "text" : "outlined"} color={entry.epris_codes.length && !isReady(entry) ? "warning" : "primary"} onClick={() => setDialogDoc(entry)}>
              {!entry.epris_codes.length ? "Pasirinkti kategoriją" : entry.epris_codes.map(c => c.subcode || c.code).join(", ")}
            </Button>
          </Tooltip></TableCell>
          <TableCell align="center" sx={{ whiteSpace: "nowrap" }}>
            <Tooltip arrow title={isSubmitted(entry) ? `Eksportuotas${entry.epris_submitted_at ? ` (${String(entry.epris_submitted_at).slice(0, 10)})` : ""}` : "Neeksportuotas"}>
              <Box component="span" sx={{ display: "inline-flex", alignItems: "center" }}>
                {isSubmitted(entry)
                  ? <CheckCircleIcon sx={{ fontSize: 20, color: "#4caf50" }} />
                  : <RemoveCircleOutlineIcon sx={{ fontSize: 20, color: "text.disabled" }} />}
              </Box>
            </Tooltip>
          </TableCell>
        </TableRow>)}{!visible.length && <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4 }}>Šiuo laikotarpiu sąskaitų nėra.</TableCell></TableRow>}</TableBody>
      </Table></TableContainer>
      {data.entries.length < data.total_count && <Box sx={{ p: 2, textAlign: "center" }}><Button disabled={loading} onClick={loadMore}>Rodyti daugiau ({data.entries.length} / {data.total_count})</Button></Box>}
    </Paper>}
    <CodesDialog key={dialogDoc?.id || "closed"} open={!!dialogDoc} doc={dialogDoc} contractorKeys={keys} onClose={() => setDialogDoc(null)} onSaved={entry => {
      if (entry.epris_details.refund_country !== country) { setData(null); setChecked([]); }
      else {
        setData(previous => previous ? { ...previous, entries: previous.entries.map(e => e.id === entry.id ? { ...entry, notices: e.notices } : e) } : previous);
        setChecked(previous => isReady(entry) ? [...new Set([...previous, entry.id])] : previous.filter(id => id !== entry.id));
      }
      setRevision(r => r + 1);
    }} />
  </Box>;
}