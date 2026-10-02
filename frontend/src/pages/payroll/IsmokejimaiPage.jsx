import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, MenuItem, Paper, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import RefreshIcon from "@mui/icons-material/Refresh";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";

import { MONTHS, apiError, payrollApi } from "../../api/payroll";
import LtDatePicker from "../../components/LtDatePicker"; // ⚠ pataisyk kelią, jei komponentas kitur

const STATUS_COLOR = { open: "default", sent: "info", partial: "warning", paid: "success" };
const GROUPS = [
  ["Darbuotojams", ["employee", "advance"]],
  ["Mokesčiai", ["gpm", "sodra"]],
  ["Išskaitos", ["deduction"]],
];
const eur = (v) => `${Number(v || 0).toLocaleString("lt-LT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const today = () => new Date().toISOString().slice(0, 10);

function prevMonth() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function AccountSelect({ accounts, value, onChange }) {
  const known = accounts.some((a) => a.account === value) || value === "2720" || value === "";
  const [other, setOther] = useState(!known);
  return (
    <Stack gap={1.5}>
      <TextField select label="Kaip sumokėta" value={other ? "__other" : value} fullWidth
        onChange={(e) => {
          if (e.target.value === "__other") { setOther(true); onChange(""); } else { setOther(false); onChange(e.target.value); }
        }}
        SelectProps={{ MenuProps: { disableScrollLock: true } }}>
        {accounts.map((a) => (
          <MenuItem key={a.key} value={a.account}>Banku: {a.label || a.bank} ({a.account}){a.iban ? ` · ${a.iban}` : ""}</MenuItem>
        ))}
        <MenuItem value="2720">Grynaisiais iš kasos (2720)</MenuItem>
        <MenuItem value="__other">Kita sąskaita…</MenuItem>
      </TextField>
      {other && <TextField label="Sąskaitos kodas" value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder="pvz. 2712" />}
    </Stack>
  );
}

export default function IsmokejimaiPage() {
  const [{ year, month }, setYm] = useState(prevMonth);
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [selected, setSelected] = useState([]);
  const [open, setOpen] = useState({});
  const [dlg, setDlg] = useState(null); // {ids, amount, single}
  const [form, setForm] = useState({ payment_date: today(), payment_account: "", amount: "" });
  const [busy, setBusy] = useState(false);
  const [fileDlg, setFileDlg] = useState(null); // {ids}
  const [fileForm, setFileForm] = useState({ debtor_iban: "", execution_date: today() });
  const ibanAccounts = useMemo(() => accounts.filter((a) => a.iban), [accounts]);

  const load = useCallback(() => {
    setData(null); setSelected([]);
    payrollApi.payments(year, month).then(setData).catch((e) => { setError(apiError(e)); setData({ items: [], totals: {} }); });
  }, [year, month]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    payrollApi.settings().then(setSettings).catch(() => {});
    payrollApi.bankAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  const shift = (d) => setYm(({ year: y, month: m }) => {
    const x = new Date(y, m - 1 + d, 1);
    return { year: x.getFullYear(), month: x.getMonth() + 1 };
  });

  const items = data?.items || [];
  const openItems = useMemo(() => items.filter((i) => i.status !== "paid"), [items]);

  const startMark = (ids, single) => {
    setForm({ payment_date: today(), payment_account: settings?.payout_account || accounts[0]?.account || "", amount: single ? single.open_amount : "" });
    setDlg({ ids, single });
  };

  const doMark = async () => {
    setBusy(true); setError("");
    try {
      const r = await payrollApi.markPaid({
        ids: dlg.ids, payment_date: form.payment_date, payment_account: form.payment_account,
        ...(dlg.single ? { amount: form.amount } : {}),
      });
      if (r.errors?.length) setError(r.errors.map((e) => e.detail).join(" "));
      setDlg(null); load();
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };

  const allocAction = async (fn) => {
    setError("");
    try { await fn(); load(); } catch (e) { setError(apiError(e)); }
  };

  const startFile = (ids) => {
    const def = ibanAccounts.find((a) => a.account === settings?.payout_account) || ibanAccounts[0];
    setFileForm({ debtor_iban: def?.iban || "", execution_date: today() });
    setFileDlg({ ids });
  };

  const doFile = async () => {
    setBusy(true); setError(""); setInfo("");
    try {
      const r = await payrollApi.paymentFile({ ids: fileDlg.ids, ...fileForm });
      const name = (r.headers["content-disposition"] || "").match(/filename="([^"]+)"/)?.[1] || "DU_mokejimai.xml";
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
      const errs = decodeURIComponent(r.headers["x-errors"] || "");
      setInfo(`Failas paruoštas. Įkelkite jį į interneto banką (mokėjimų importas) ir patvirtinkite.${errs ? ` Neįtraukta: ${errs}` : ""}`);
      setFileDlg(null); load();
    } catch (e) {
      let msg = apiError(e);
      if (e?.response?.data instanceof Blob) {
        try { const j = JSON.parse(await e.response.data.text()); msg = j.detail || (Array.isArray(j) ? j.join(" ") : msg); } catch { /* */ }
      }
      setError(msg);
    } finally { setBusy(false); }
  };

  const createAdvances = async () => {
    setError(""); setInfo("");
    try {
      const r = await payrollApi.createAdvances(year, month);
      setInfo(`Sukurta avansų: ${r.created}.${r.skipped?.length ? ` Praleisti (nėra algos duomenų): ${r.skipped.join(", ")}.` : ""}`);
      load();
    } catch (e) { setError(apiError(e)); }
  };

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const Alloc = ({ a }) => {
    const proposed = a.status === "proposed";
    return (
      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: proposed ? "rgba(255,152,0,0.06)" : "background.default" }}>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1}>
          <Box>
            <Typography variant="body2" fontWeight={600}>
              {eur(a.amount)} · {a.payment_date}
              {a.transaction
                ? ` · ${a.transaction.bank || "Bankas"}: ${a.transaction.counterparty_name || ""}`
                : a.needs_account ? " · Rankinis (nenurodyta sąskaita)" : ` · Rankinis (${a.payment_account})`}
            </Typography>
            {a.transaction?.purpose && <Typography variant="caption" color="text.secondary" display="block">{a.transaction.purpose}</Typography>}
            {a.reason && <Typography variant="caption" color="text.secondary" display="block">Susieta pagal: {a.reason}</Typography>}
            {a.warnings?.map((w) => <Typography key={w} variant="caption" color="warning.main" display="block">⚠ {w}</Typography>)}
          </Box>
          <Stack direction="row" gap={1} alignItems="center" flexShrink={0}>
            {proposed && <Chip size="small" color="warning" label="Pasiūlymas" />}
            {proposed && <Button size="small" variant="contained" onClick={() => allocAction(() => payrollApi.allocationAction(a.id, { action: "confirm" }))}>Patvirtinti</Button>}
            {a.needs_account && (
              <TextField select size="small" label="Sąskaita" value="" sx={{ minWidth: 160 }}
                onChange={(e) => allocAction(() => payrollApi.allocationAction(a.id, { action: "account", payment_account: e.target.value }))}
                SelectProps={{ MenuProps: { disableScrollLock: true } }}>
                {accounts.map((x) => <MenuItem key={x.key} value={x.account}>{x.label || x.bank} ({x.account})</MenuItem>)}
                <MenuItem value="2720">Kasa (2720)</MenuItem>
              </TextField>
            )}
            <Tooltip title={proposed ? "Atmesti" : "Pašalinti mokėjimą"}>
              <IconButton size="small" onClick={() => allocAction(() => payrollApi.removeAllocation(a.id))}><DeleteOutlineIcon fontSize="small" /></IconButton>
            </Tooltip>
          </Stack>
        </Stack>
      </Paper>
    );
  };

  const Row = ({ it }) => {
    const hasProposed = it.allocations.some((a) => a.status === "proposed");
    return (
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }} gap={1.5}>
          <Checkbox size="small" disabled={it.status === "paid"} checked={selected.includes(it.id)} onChange={() => toggle(it.id)} sx={{ p: 0.5 }} />
          <Box flex={1} minWidth={0}>
            <Typography fontWeight={700} noWrap>{it.recipient_name || it.kind_display}</Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              {it.kind_display}{it.imokos_kodas ? ` · įmokos kodas ${it.imokos_kodas}` : ""}{it.recipient_iban ? ` · ${it.recipient_iban}` : ""} · {it.reference}
              {it.sent_at ? ` · į banką ${String(it.sent_at).slice(0, 10)}` : ""}
            </Typography>
          </Box>
          <Box sx={{ minWidth: 110 }}>
            <Typography variant="caption" color="text.secondary" display="block">Terminas</Typography>
            <Typography variant="body2" color={it.overdue ? "error" : "text.primary"} fontWeight={it.overdue ? 700 : 400}>{it.due_date || "–"}</Typography>
          </Box>
          <Box sx={{ minWidth: 130, textAlign: { md: "right" } }}>
            <Typography fontWeight={700}>{eur(it.amount)}</Typography>
            {Number(it.paid_amount) > 0 && it.status !== "paid" && (
              <Typography variant="caption" color="text.secondary">Liko {eur(it.open_amount)}</Typography>
            )}
          </Box>
          <Stack direction="row" gap={1} alignItems="center" sx={{ minWidth: 250, justifyContent: { md: "flex-end" } }}>
            {hasProposed && <Chip size="small" color="warning" label="Reikia patvirtinti" />}
            <Chip size="small" color={STATUS_COLOR[it.status] || "default"} label={it.status_display} />
            {it.status !== "paid" && <Button size="small" onClick={() => startMark([it.id], it)}>Pažymėti sumokėta</Button>}
            {it.allocations.length > 0 && (
              <IconButton size="small" onClick={() => setOpen((o) => ({ ...o, [it.id]: !o[it.id] }))}
                sx={{ transform: open[it.id] || hasProposed ? "rotate(180deg)" : "none" }}><ExpandMoreIcon /></IconButton>
            )}
          </Stack>
        </Stack>
        <Collapse in={!!open[it.id] || hasProposed}>
          <Stack gap={1} mt={1.5} ml={{ md: 5 }}>{it.allocations.map((a) => <Alloc key={a.id} a={a} />)}</Stack>
        </Collapse>
      </Paper>
    );
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100 }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={2} mb={2}>
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography variant="h5" fontWeight={700}>Išmokėjimai</Typography>
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

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {info && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo("")}>{info}</Alert>}

      {!data ? <CircularProgress /> : (
        <>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack direction={{ xs: "column", sm: "row" }} gap={3} alignItems={{ sm: "center" }}>
              <Box><Typography variant="caption" color="text.secondary">Iš viso</Typography><Typography fontWeight={700}>{eur(data.totals.amount)}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Sumokėta</Typography><Typography fontWeight={700} color="success.main">{eur(data.totals.paid)}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Liko</Typography><Typography fontWeight={700}>{eur(data.totals.open)}</Typography></Box>
              <Box flex={1} />
              {settings?.advance_enabled && <Button variant="outlined" onClick={createAdvances}>Sukurti avansus</Button>}
              <Button variant="outlined" disabled={!selected.length} onClick={() => startFile(selected)}>
                Mokėjimų failas bankui ({selected.length})
              </Button>
              <Button variant="contained" disabled={!selected.length} onClick={() => startMark(selected, null)}>
                Pažymėti sumokėtais ({selected.length})
              </Button>
            </Stack>
            {openItems.length > 0 && (
              <Button size="small" sx={{ mt: 1 }} onClick={() => setSelected(openItems.map((i) => i.id))}>Pažymėti visus nesumokėtus</Button>
            )}
          </Paper>

          {items.length === 0 ? (
            <Alert severity="info" icon={<AccountBalanceOutlinedIcon />}>
              Šiam mėnesiui išmokėjimų nėra. Jie atsiranda patvirtinus mėnesio DU (avansai – paspaudus „Sukurti avansus“).
            </Alert>
          ) : (
            <Stack gap={3}>
              {GROUPS.map(([title, kinds]) => {
                const rows = items.filter((i) => kinds.includes(i.kind));
                if (!rows.length) return null;
                return (
                  <Box key={title}>
                    <Typography fontWeight={700} mb={1}>{title}</Typography>
                    <Stack gap={1}>{rows.map((it) => <Row key={it.id} it={it} />)}</Stack>
                  </Box>
                );
              })}
              <Typography variant="caption" color="text.secondary">
                Įkėlus banko išrašą mokėjimai susiejami automatiškai: darbuotojams – pagal IBAN ir sumą, VMI ir Sodrai – pagal sumą ir įmokos kodą (1311, 252).
                Jei kodas ar suma nesutampa, mokėjimas pasiūlomas patvirtinti.
              </Typography>
            </Stack>
          )}
        </>
      )}

      <Dialog open={!!fileDlg} onClose={() => setFileDlg(null)} fullWidth maxWidth="sm" disableScrollLock>
        <DialogTitle>Mokėjimų failas bankui ({fileDlg?.ids.length})</DialogTitle>
        <DialogContent>
          <Stack gap={2} mt={1}>
            {ibanAccounts.length === 0 ? (
              <Alert severity="warning">Įmonės banko sąskaitų su IBAN nėra. Jos atsiranda įkėlus banko išrašą arba pridėjus sąskaitą banko nustatymuose.</Alert>
            ) : (
              <TextField select label="Iš kurios sąskaitos mokėti" value={fileForm.debtor_iban}
                onChange={(e) => setFileForm((f) => ({ ...f, debtor_iban: e.target.value }))}
                SelectProps={{ MenuProps: { disableScrollLock: true } }}>
                {ibanAccounts.map((a) => <MenuItem key={a.key} value={a.iban}>{a.label || a.bank} · {a.iban} ({a.account})</MenuItem>)}
              </TextField>
            )}
            <LtDatePicker label="Mokėjimo data" value={fileForm.execution_date}
              onChange={(v) => v && setFileForm((f) => ({ ...f, execution_date: v }))} />
            <Typography variant="caption" color="text.secondary">
              Failas ISO 20022 (pain.001) – priima Swedbank, SEB, Luminor, Artea ir kiti bankai. VMI ir Sodros mokėjimai
              siunčiami į surenkamąją sąskaitą jūsų banke su įmokos kodu (1311 / 252). Įkėlus banko išrašą mokėjimai
              bus susieti automatiškai pagal nuorodą paskirtyje.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setFileDlg(null)}>Atšaukti</Button>
          <Button variant="contained" onClick={doFile} disabled={busy || !fileForm.debtor_iban}>Atsisiųsti failą</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!dlg} onClose={() => setDlg(null)} fullWidth maxWidth="xs" disableScrollLock>
        <DialogTitle>{dlg?.single ? `Sumokėta: ${dlg.single.recipient_name}` : `Pažymėti sumokėtais (${dlg?.ids.length})`}</DialogTitle>
        <DialogContent>
          <Stack gap={2} mt={1}>
            <LtDatePicker label="Mokėjimo data" value={form.payment_date} onChange={(v) => v && setForm((f) => ({ ...f, payment_date: v }))} />
            {dlg?.single && (
              <TextField label="Suma, €" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(",", ".") }))}
                helperText="Galima įvesti dalinę sumą" />
            )}
            <AccountSelect accounts={accounts} value={form.payment_account} onChange={(v) => setForm((f) => ({ ...f, payment_account: v }))} />
            <Typography variant="caption" color="text.secondary">
              Bus sukurtas DK įrašas (pvz. D 4480 / K 2711). Vėliau įkėlus banko išrašą su šiuo mokėjimu, jis bus tik susietas – antras DK įrašas nesusidarys.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDlg(null)}>Atšaukti</Button>
          <Button variant="contained" onClick={doMark} disabled={busy || !form.payment_date}>Išsaugoti</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
