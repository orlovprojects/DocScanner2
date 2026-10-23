import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Collapse, IconButton, Stack, Tooltip, Typography,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";

import { MONTHS, apiError, payrollApi } from "../../api/payroll";

const CARD = { border: "1px solid #EAECF0", borderRadius: 2.5, bgcolor: "#FFFFFF" };
const GROUPS = [
  ["Darbuotojams", ["employee", "advance"], "Mokėjimo paskirtis"],
  ["Mokesčiai", ["gpm", "sodra"], "Įmokos kodas"],
  ["Išskaitos (antstoliai, alimentai)", ["deduction"], "Mokėjimo paskirtis"],
];
const STATUS = {
  open: ["Nesumokėta", "#F2F4F7", "#475467"],
  sent: ["Išsiųsta į banką", "#EFF8FF", "#175CD3"],
  partial: ["Dalinai sumokėta", "#FFFAEB", "#B54708"],
  paid: ["Sumokėta", "#ECFDF3", "#027A48"],
};
const COLS = "36px minmax(220px,1.7fr) minmax(140px,1fr) 110px 130px 160px 32px";
const eur = (v) => `${Number(v || 0).toLocaleString("lt-LT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const today = () => new Date().toISOString().slice(0, 10);
const fmtIban = (v) => String(v || "").replace(/(.{4})/g, "$1 ").trim();
const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// VMI / Sodros surenkamosios sąskaitos pagal mokėtojo banką (kaip pain001.py - SEPA faile naudojamos tos pačios)
const VMI_ACCOUNTS = { "73000": "LT247300010112394300", "70440": "LT057044060007887175", "40100": "LT744010051001324763",
  "71800": "LT327180000000141038", "72300": "LT427230000000120025" };
const SODRA_ACCOUNTS = { "73000": "LT777300010129002656", "70440": "LT337044060007740589", "40100": "LT584010042403495020",
  "71800": "LT027180300000690001" };
const ibanFor = (it, debtor) => {
  if (!["gpm", "sodra"].includes(it.kind)) return it.recipient_iban || "";
  const t = it.kind === "gpm" ? VMI_ACCOUNTS : SODRA_ACCOUNTS;
  const bank = String(debtor || "").replace(/\s/g, "").slice(4, 9);
  return t[bank] || t["73000"];
};

function prevMonth() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

// Suvestinė „kiek kam mokėti“ -> PDF failas (atsisiunčiamas iškart, be naujo lango).
// Reikia paketo: npm i html2pdf.js
async function downloadSummaryPdf(items, year, month, debtor) {
  const { default: html2pdf } = await import("html2pdf.js");
  const block = ([title, kinds, col]) => {
    const rs = items.filter((i) => kinds.includes(i.kind));
    if (!rs.length) return "";
    const total = rs.reduce((a, i) => a + Number(i.amount || 0), 0);
    const th = "text-align:left;font-weight:600;color:#667085;font-size:10px;border-bottom:1px solid #D0D5DD;padding:5px 6px";
    const td = "padding:6px;border-bottom:1px solid #EAECF0;vertical-align:top";
    return `<h2 style="font-size:13px;margin:16px 0 6px">${esc(title)}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr>
        <th style="${th}">Gavėjas</th><th style="${th}">Sąskaita</th><th style="${th}">${esc(col)}</th>
        <th style="${th}">Terminas</th><th style="${th};text-align:right">Suma</th></tr></thead><tbody>
      ${rs.map((i) => `<tr><td style="${td}">${esc(i.recipient_name || i.kind_display)}</td>
        <td style="${td};font-family:monospace;font-size:10px;white-space:nowrap">${esc(fmtIban(ibanFor(i, debtor))) || "Nenurodyta"}</td>
        <td style="${td};font-family:monospace">${esc(["gpm", "sodra"].includes(i.kind) ? i.imokos_kodas : i.reference)}</td>
        <td style="${td};white-space:nowrap">${esc(i.due_date || "–")}</td>
        <td style="${td};text-align:right;white-space:nowrap">${eur(i.amount)}</td></tr>`).join("")}
      </tbody><tfoot><tr><td colspan="4" style="padding:6px;font-weight:600">Iš viso</td>
        <td style="padding:6px;font-weight:600;text-align:right;white-space:nowrap">${eur(total)}</td></tr></tfoot></table>`;
  };
  const el = document.createElement("div");
  el.style.cssText = "font-family:Arial,sans-serif;color:#101828;width:180mm;background:#FFFFFF";
  el.innerHTML = `<h1 style="font-size:17px;margin:0 0 4px">Išmokėjimai – ${esc(MONTHS[month - 1])} ${year}</h1>
    <div style="color:#667085;font-size:11px;margin-bottom:6px">Sudaryta ${today()}</div>${GROUPS.map(block).join("")}`;
  await html2pdf().set({
    margin: 12, filename: `Ismokejimai_${year}-${String(month).padStart(2, "0")}.pdf`,
    html2canvas: { scale: 2, backgroundColor: "#FFFFFF" }, jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
  }).from(el).save();
}

export default function IsmokejimaiPage({ embedded = false, year: pYear, month: pMonth, onLoaded } = {}) {
  const [own, setOwn] = useState(prevMonth);
  const year = pYear || own.year;
  const month = pMonth || own.month;
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [debtor, setDebtor] = useState("");          // mokėtojo sąskaita SEPA failui - automatiškai
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [selected, setSelected] = useState([]);
  const [open, setOpen] = useState({});
  const [busy, setBusy] = useState(false);
  const ibanAccounts = useMemo(() => accounts.filter((a) => a.iban), [accounts]);

  const load = useCallback(() => {
    payrollApi.payments(year, month).then((d) => { setData(d); setSelected([]); onLoaded?.(d.items || []); })
      .catch((e) => { setError(apiError(e)); setData({ items: [], totals: {} }); });
  }, [year, month]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(() => {
    payrollApi.settings().then(setSettings).catch(() => {});
    payrollApi.bankAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);
  // mokėtojo sąskaita: numatytoji iš DU nustatymų, kitaip pirmoji su IBAN
  useEffect(() => {
    const def = ibanAccounts.find((a) => a.account === settings?.payout_account) || ibanAccounts[0];
    setDebtor((d) => d || def?.iban || "");
  }, [ibanAccounts, settings]);

  const items = data?.items || [];
  const unpaid = items.filter((i) => i.status !== "paid");
  const allSel = unpaid.length > 0 && unpaid.every((i) => selected.includes(i.id));
  const someSel = selected.length > 0 && !allSel;
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const selItems = items.filter((i) => selected.includes(i.id));
  const selSum = selItems.reduce((a, i) => a + Number(i.open_amount || 0), 0);

  // Pažymėti sumokėta - be dialogų ir be DK įrašo (jis susidarys įkėlus banko išrašą)
  const markPaid = async (ids) => {
    setBusy(true); setError(""); setInfo("");
    try {
      const r = await payrollApi.markPaid({ ids, payment_date: today(), payment_account: "" });
      if (r.errors?.length) setError(r.errors.map((e) => e.detail).join(" "));
      if (r.done?.length) setInfo(`Pažymėta sumokėta: ${r.done.length}. Įkėlus banko išrašą mokėjimai bus susieti ir užregistruoti apskaitoje.`);
      load();
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };

  const downloadSepa = async () => {
    setBusy(true); setError(""); setInfo("");
    try {
      const r = await payrollApi.paymentFile({ ids: selected, debtor_iban: debtor, execution_date: today() });
      const name = (r.headers["content-disposition"] || "").match(/filename="([^"]+)"/)?.[1] || "DU_mokejimai.xml";
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
      const errs = decodeURIComponent(r.headers["x-errors"] || "");
      setInfo(`SEPA failas atsisiųstas – įkelkite jį interneto banke (mokėjimų importas).${errs ? ` Neįtraukta: ${errs}` : ""}`);
      load();
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
  const allocAction = async (fn) => {
    setError("");
    try { await fn(); load(); } catch (e) { setError(apiError(e)); }
  };

  const shift = (d) => setOwn(({ year: y, month: m }) => {
    const x = new Date(y, m - 1 + d, 1);
    return { year: x.getFullYear(), month: x.getMonth() + 1 };
  });

  return (
    <Box sx={{ p: embedded ? 0 : { xs: 2, md: 3 }, maxWidth: 1300 }}>
      {!embedded && (
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography sx={{ fontSize: 22, fontWeight: 600 }}>Išmokėjimai</Typography>
          <Stack direction="row" alignItems="center" gap={.5}>
            <IconButton onClick={() => shift(-1)}><ChevronLeftIcon /></IconButton>
            <Typography sx={{ fontWeight: 600, minWidth: 140, textAlign: "center" }}>{MONTHS[month - 1]} {year}</Typography>
            <IconButton onClick={() => shift(1)}><ChevronRightIcon /></IconButton>
          </Stack>
        </Stack>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {info && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo("")}>{info}</Alert>}

      {!data ? <Box sx={{ py: 6, textAlign: "center" }}><CircularProgress size={26} /></Box> : items.length === 0 ? (
        <Box sx={{ ...CARD, p: 5, textAlign: "center" }}>
          <AccountBalanceOutlinedIcon sx={{ color: "#98A2B3", fontSize: 32 }} />
          <Typography sx={{ fontSize: 15, fontWeight: 600, mt: 1 }}>Išmokėjimų dar nėra</Typography>
          <Typography sx={{ fontSize: 13.5, color: "#667085", mt: .5 }}>Jie atsiranda patvirtinus mėnesio atlyginimus.</Typography>
          {settings?.advance_enabled && <Button size="small" onClick={createAdvances} sx={{ mt: 1.5, textTransform: "none" }}>Sukurti avansus</Button>}
        </Box>
      ) : (
        <Stack gap={2}>
          {/* suvestinė + veiksmai */}
          <Box sx={{ ...CARD, p: 2 }}>
            <Stack direction={{ xs: "column", lg: "row" }} gap={2} alignItems={{ lg: "center" }}>
              <Stack direction="row" gap={4}>
                {[["Iš viso", data.totals.amount, "#101828"], ["Sumokėta", data.totals.paid, "#027A48"], ["Liko sumokėti", data.totals.open, "#1849A9"]].map(([l, v, c]) => (
                  <Box key={l}>
                    <Typography sx={{ fontSize: 12.5, color: "#667085" }}>{l}</Typography>
                    <Typography sx={{ fontSize: 20, fontWeight: 600, color: c }}>{eur(v)}</Typography>
                  </Box>
                ))}
              </Stack>
              <Box sx={{ flex: 1 }} />
              <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
                <Button variant="outlined" startIcon={<PictureAsPdfOutlinedIcon />} onClick={async () => { try { await downloadSummaryPdf(items, year, month, debtor); } catch (e) { setError(`PDF nepavyko: ${e?.message || e}`); } }}
                  sx={{ textTransform: "none", color: "#344054", borderColor: "#D0D5DD" }}>Suvestinė (PDF)</Button>
                <Tooltip arrow title={!ibanAccounts.length ? "Įmonės banko sąskaitų su IBAN nėra – įkelkite banko išrašą arba pridėkite sąskaitą banko nustatymuose" : ""}>
                  <span>
                    <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} disabled={busy || !selected.length || !debtor} onClick={downloadSepa}
                      sx={{ textTransform: "none" }}>SEPA mokėjimų failas{selected.length ? ` (${selected.length})` : ""}</Button>
                  </span>
                </Tooltip>
                <Button variant="contained" disableElevation startIcon={<CheckRoundedIcon />} disabled={busy || !selected.length}
                  onClick={() => markPaid(selected)} sx={{ textTransform: "none", fontWeight: 600 }}>
                  Pažymėti sumokėtais{selected.length ? ` (${selected.length})` : ""}
                </Button>
              </Stack>
            </Stack>
          </Box>

          {/* visų nesumokėtų pasirinkimas */}
          <Stack direction="row" alignItems="center" gap={1} sx={{ px: 1 }}>
            <Checkbox size="small" checked={allSel} indeterminate={someSel} disabled={!unpaid.length}
              onChange={() => setSelected(allSel ? [] : unpaid.map((i) => i.id))} sx={{ p: .5 }} />
            <Typography onClick={() => unpaid.length && setSelected(allSel ? [] : unpaid.map((i) => i.id))}
              sx={{ fontSize: 13.5, color: "#344054", cursor: unpaid.length ? "pointer" : "default", userSelect: "none" }}>
              {selected.length ? `Pasirinkta ${selected.length} · ${eur(selSum)}` : `Pasirinkti visus nesumokėtus (${unpaid.length})`}
            </Typography>
            {settings?.advance_enabled && (
              <Button size="small" onClick={createAdvances} sx={{ ml: "auto", textTransform: "none", color: "#475467" }}>Sukurti avansus</Button>
            )}
          </Stack>

          {GROUPS.map(([title, kinds, col]) => {
            const rows = items.filter((i) => kinds.includes(i.kind));
            if (!rows.length) return null;
            const gUnpaid = rows.filter((i) => i.status !== "paid");
            const gAll = gUnpaid.length > 0 && gUnpaid.every((i) => selected.includes(i.id));
            return (
              <Box key={title} sx={{ ...CARD, overflow: "hidden" }}>
                <Box sx={{ display: "grid", gridTemplateColumns: COLS, alignItems: "center", px: 1.5, py: .9, bgcolor: "#F9FAFB",
                  borderBottom: "1px solid #EAECF0", typography: "body2", "& > *": { fontSize: 12, color: "#667085", fontWeight: 500 } }}>
                  <Checkbox size="small" checked={gAll} disabled={!gUnpaid.length} sx={{ p: .5 }}
                    onChange={() => setSelected((s) => (gAll ? s.filter((x) => !gUnpaid.some((i) => i.id === x))
                      : [...new Set([...s, ...gUnpaid.map((i) => i.id)])]))} />
                  <Box sx={{ fontWeight: "600 !important", color: "#101828 !important", fontSize: "13.5px !important" }}>{title}</Box>
                  <Box>{col}</Box>
                  <Box>Terminas</Box>
                  <Box sx={{ textAlign: "right" }}>Suma</Box>
                  <Box sx={{ pl: 2 }}>Būsena</Box>
                  <Box />
                </Box>
                {rows.map((it) => <PaymentRow key={it.id} it={it} selected={selected.includes(it.id)} onToggle={() => toggle(it.id)}
                  open={!!open[it.id]} onOpen={() => setOpen((o) => ({ ...o, [it.id]: !o[it.id] }))}
                  onMark={() => markPaid([it.id])} busy={busy} allocAction={allocAction} accounts={accounts} iban={ibanFor(it, debtor)} />)}
              </Box>
            );
          })}

          <Typography sx={{ fontSize: 12, color: "#98A2B3", px: 1 }}>
            Pažymėjus „Sumokėta“ galima teikti deklaracijas. Apskaitos įrašas susidarys įkėlus banko išrašą – mokėjimai susiejami pagal
            nuorodą paskirtyje (DU…), darbuotojams – pagal IBAN ir sumą, VMI ir Sodrai – pagal įmokos kodą (1311, 252).
          </Typography>
        </Stack>
      )}
    </Box>
  );
}

function PaymentRow({ it, selected, onToggle, open, onOpen, onMark, busy, allocAction, accounts, iban }) {
  const [label, bg, color] = STATUS[it.status] || [it.status_display, "#F2F4F7", "#475467"];
  const proposed = it.allocations.some((a) => a.status === "proposed");
  const tax = ["gpm", "sodra"].includes(it.kind);
  const paid = it.status === "paid";
  return (
    <Box sx={{ borderBottom: "1px solid #F2F4F7", "&:last-of-type": { borderBottom: 0 } }}>
      <Box sx={{ display: "grid", gridTemplateColumns: COLS, alignItems: "center", px: 1.5, py: 1.1, bgcolor: selected ? "#F5F8FF" : "#FFFFFF" }}>
        <Checkbox size="small" checked={selected} disabled={paid} onChange={onToggle} sx={{ p: .5 }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 14, fontWeight: 500, color: "#101828" }}>{it.recipient_name || it.kind_display}</Typography>
          <Typography noWrap sx={{ fontSize: 11.5, color: iban ? "#98A2B3" : "#B42318", fontFamily: iban ? "monospace" : undefined }}>
            {iban ? fmtIban(iban) : "Nenurodyta"}
            {it.kind === "advance" ? " · avansas" : ""}
          </Typography>
        </Box>
        <Box sx={{ minWidth: 0, pr: 1 }}>
          <Tooltip arrow title={it.purpose || ""}>
            <Typography component="span" sx={{ fontSize: 13, fontFamily: "monospace", color: "#344054", fontWeight: tax ? 600 : 400 }}>
              {tax ? (it.imokos_kodas || "–") : (it.reference || "–")}
            </Typography>
          </Tooltip>
        </Box>
        <Typography sx={{ fontSize: 13, color: it.overdue ? "#B42318" : "#344054", fontWeight: it.overdue ? 600 : 400 }}>{it.due_date || "–"}</Typography>
        <Box sx={{ textAlign: "right" }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: "#101828" }}>{eur(it.amount)}</Typography>
          {Number(it.paid_amount) > 0 && !paid && <Typography sx={{ fontSize: 11.5, color: "#98A2B3" }}>liko {eur(it.open_amount)}</Typography>}
        </Box>
        <Stack direction="row" alignItems="center" gap={.75} sx={{ pl: 2 }}>
          <Chip size="small" label={proposed ? "Patikrinkite" : label} sx={{ height: 22, fontSize: 11.5, fontWeight: 500,
            bgcolor: proposed ? "#FFFAEB" : bg, color: proposed ? "#B54708" : color }} />
          {!paid && (
            <Tooltip arrow title="Pažymėti sumokėta">
              <span><IconButton size="small" disabled={busy} onClick={onMark}><CheckRoundedIcon sx={{ fontSize: 17 }} /></IconButton></span>
            </Tooltip>
          )}
        </Stack>
        <Box>
          {it.allocations.length > 0 && (
            <IconButton size="small" onClick={onOpen} sx={{ transform: open || proposed ? "rotate(180deg)" : "none" }}><ExpandMoreIcon fontSize="small" /></IconButton>
          )}
        </Box>
      </Box>
      <Collapse in={open || proposed}>
        <Stack gap={.75} sx={{ px: 1.5, pb: 1.25, pl: 7 }}>
          {it.allocations.map((a) => <Alloc key={a.id} a={a} allocAction={allocAction} accounts={accounts} />)}
        </Stack>
      </Collapse>
    </Box>
  );
}

function Alloc({ a, allocAction }) {
  const proposed = a.status === "proposed";
  const t = a.transaction;
  return (
    <Stack direction="row" alignItems="center" gap={1.5} sx={{ p: 1, borderRadius: 1.5, bgcolor: proposed ? "#FFFAEB" : "#F9FAFB" }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 13, color: "#344054" }}>
          {eur(a.amount)} · {a.payment_date}
          {t ? ` · ${t.bank || "Bankas"}: ${t.counterparty_name || ""}` : " · pažymėta rankiniu būdu (laukia banko išrašo)"}
        </Typography>
        {t?.purpose && <Typography noWrap sx={{ fontSize: 11.5, color: "#98A2B3" }}>{t.purpose}</Typography>}
        {a.reason && <Typography sx={{ fontSize: 11.5, color: "#98A2B3" }}>Susieta pagal: {a.reason}</Typography>}
        {a.warnings?.map((w) => <Typography key={w} sx={{ fontSize: 11.5, color: "#B54708" }}>⚠ {w}</Typography>)}
      </Box>
      {proposed && (
        <Button size="small" variant="contained" disableElevation sx={{ textTransform: "none" }}
          onClick={() => allocAction(() => payrollApi.allocationAction(a.id, { action: "confirm" }))}>Patvirtinti</Button>
      )}
      <Tooltip arrow title={proposed ? "Atmesti" : "Atšaukti „sumokėta“"}>
        <IconButton size="small" onClick={() => window.confirm(proposed ? "Atmesti šį susiejimą?" : "Atšaukti šį mokėjimą?")
          && allocAction(() => payrollApi.removeAllocation(a.id))}><DeleteOutlineIcon fontSize="small" /></IconButton>
      </Tooltip>
    </Stack>
  );
}
