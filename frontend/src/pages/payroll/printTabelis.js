// Darbo laiko apskaitos žiniaraščio (tabelio) spausdinimas: A4 gulsčias, daug darbuotojų - keli puslapiai,
// lentelės antraštė kartojasi kiekviename puslapyje, eilutė neperskeliama. Atidaroma atskirame lange -> Spausdinti / PDF.

const MONTHS_GEN = ["sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio", "liepos", "rugpjūčio", "rugsėjo",
  "spalio", "lapkričio", "gruodžio"];
const WD = ["Pr", "An", "Tr", "Kt", "Pn", "Št", "Sk"];

// Žiniaraščio žymėjimai (pagal įprastus VDI rekomenduojamus kodus)
export const TABELIS_CODES = {
  vacation: ["A", "Kasmetinės atostogos"],
  vacation_prepaid: ["A", "Kasmetinės atostogos"],
  sick: ["L", "Nedarbingumas dėl ligos"],
  parent_day: ["MD", "Papildomas poilsio laikas (mamadienis / tėvadienis)"],
  unpaid: ["NA", "Nemokamos atostogos"],
  childcare: ["VP", "Vaiko priežiūros atostogos"],
  maternity: ["G", "Nėštumo ir gimdymo atostogos"],
  paternity: ["TA", "Tėvystės atostogos"],
  truancy: ["PB", "Pravaikšta"],
  downtime: ["PN", "Prastova"],
  study: ["MA", "Mokymosi atostogos"],
  donor: ["KR", "Kraujo donorystė"],
  civic: ["VV", "Valstybinės pareigos"],
  suspension: ["NS", "Nušalinimas nuo darbo"],
  comp_rest: ["KP", "Kompensacinis poilsis"],
  business_trip: ["K", "Komandiruotė"],
};

const OT = ["overtime", "ot_night", "ot_rest", "ot_holiday"];
const num = (v) => Number(v || 0);
const fmt = (v) => {
  const n = num(v);
  return n ? n.toLocaleString("lt-LT", { maximumFractionDigits: 2 }) : "";
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const WORK_CODES = new Set(["", "FD", "P", "S", "-"]);
// nebuvimo žymėjimas: pirmiausia - kodas iš tabelio (backend), kitaip - pagal nebuvimo rūšį
const absCode = (d) => (d.code && !WORK_CODES.has(d.code) ? d.code : (d.event_kind && TABELIS_CODES[d.event_kind]?.[0]) || "");

function dayCell(d, info) {
  if (!d || d.code === "-") return { t: "", cls: "na" };                         // nedirbo įmonėje
  const off = info.holiday || info.weekday >= 5;
  const code = d.event_kind !== "business_trip" && absCode(d);
  const h = num(d.hours);
  if (d.event_kind === "business_trip") return { t: h ? `K${fmt(h)}` : "K", cls: off ? "off ab" : "ab" };
  if (code) return { t: code, cls: off ? "off ab" : "ab" };
  if (h) return { t: fmt(h), cls: off ? "off w" : "" };                         // darbas poilsio / švenčių dieną - paryškinta
  return { t: "", cls: off ? "off" : "" };
}

function totalsOf(r) {
  const x = r.totals || {};
  const ot = OT.reduce((a, k) => a + num(x[k]), 0);
  const workedDays = (r.days || []).filter((d) => num(d.hours) > 0 && d.code !== "-").length;
  const abs = Object.values(r.absence_days || {}).reduce((a, v) => a + num(v), 0);
  return { workedDays, hours: num(r.worked_hours), norm: num(r.norm_hours), night: num(x.night) + num(x.ot_night),
    holiday: num(x.holiday) + num(x.ot_holiday), rest: num(x.rest_day) + num(x.ot_rest), ot, abs };
}

export function tabelisHtml({ rows, days, meta = {}, year, month, company = {} }) {
  const n = days.length;
  const used = new Map();                              // kodas -> pavadinimas
  rows.forEach((r) => (r.days || []).forEach((d) => {
    if (d.code === "-" || d.event_kind === "business_trip") return;
    const c = absCode(d);
    if (c && !used.has(c)) used.set(c, (d.event_kind && TABELIS_CODES[d.event_kind]?.[1]) || d.event_label || "");
  }));
  if (rows.some((r) => (r.days || []).some((d) => d.event_kind === "business_trip"))) used.set("K", TABELIS_CODES.business_trip[1]);
  const legend = [...used].map(([c, l]) => `<b>${esc(c)}</b>${l ? ` – ${esc(l)}` : ""}`);
  const anySummed = rows.some((r) => r.summed);
  const sum = { workedDays: 0, hours: 0, norm: 0, night: 0, holiday: 0, rest: 0, ot: 0, abs: 0 };

  const head1 = days.map((d) => `<th class="${d.holiday || d.weekday >= 5 ? "off" : ""}">${Number(d.date.slice(8, 10))}</th>`).join("");
  const head2 = days.map((d) => `<th class="wd ${d.holiday || d.weekday >= 5 ? "off" : ""}">${d.holiday ? "Š" : WD[d.weekday]}</th>`).join("");

  const trs = rows.map((r, i) => {
    const t = totalsOf(r);
    Object.keys(sum).forEach((k) => { sum[k] += t[k]; });
    const cells = days.map((info, k) => {
      const c = dayCell((r.days || [])[k], info);
      return `<td class="${c.cls}">${esc(c.t)}</td>`;
    }).join("");
    return `<tr><td class="nr">${i + 1}</td><td class="nm"><div>${esc(r.employee_name)}</div><span>${esc(r.position || "")}${r.summed ? " · suminė" : ""}</span></td>${cells}
      <td class="tt b">${t.workedDays || ""}</td><td class="tt b">${fmt(t.hours)}</td><td class="tt">${fmt(t.norm)}</td>
      <td class="tt">${fmt(t.night)}</td><td class="tt">${fmt(t.holiday)}</td><td class="tt">${fmt(t.rest)}</td><td class="tt">${fmt(t.ot)}</td>
      <td class="tt">${t.abs || ""}</td></tr>`;
  });
  const W = n + 10;                                    // stulpelių skaičius
  const tail = trs.splice(Math.max(trs.length - 3, 0));  // paskutinės 3 eilutės lieka viename puslapyje su suma ir parašais

  const approved = meta.status === "approved" || meta.status === "locked";
  const title = `${year} m. ${MONTHS_GEN[month - 1]} mėn.`;
  const coLine = [company.company_code && `Įmonės kodas ${company.company_code}`, company.address || company.company_address]
    .filter(Boolean).map(esc).join("<br>");

  return `<!doctype html><html lang="lt"><head><meta charset="utf-8"><title>Darbo laiko apskaitos žiniaraštis – ${esc(title)}</title>
<style>
@page { size: A4 landscape; margin: 8mm 8mm 10mm; }
/* jei naršyklė ar spausdintuvas vis tiek pasirinko stačią lapą - sumažinama, kad tilptų visas plotis */
@media print and (orientation: portrait) { html { zoom: .68; } }
html, body { width: 100%; }
@media print { .page { width: auto; margin: 0; padding: 0; box-shadow: none; } }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 8pt; }
.top { display: flex; justify-content: space-between; align-items: flex-start; font-size: 8.5pt; line-height: 1.35; }
h1 { font-size: 12pt; text-align: center; margin: 2mm 0 0; letter-spacing: .3px; }
.sub { text-align: center; font-size: 9pt; margin: .8mm 0 2.5mm; }
.draft { color: #B42318; font-weight: bold; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; break-inside: avoid; }
th, td { border: .6pt solid #555; padding: 0; text-align: center; vertical-align: middle; overflow: hidden; white-space: nowrap; }
th { font-size: 7pt; font-weight: bold; background: #F2F2F2; height: 4.2mm; }
th.wd { font-weight: normal; font-size: 6.2pt; height: 3.4mm; }
th.grp { font-size: 7pt; height: 4.5mm; }
th.tot { white-space: normal; line-height: 1.1; font-size: 6.4pt; padding: .4mm .2mm; }
td { font-size: 7.4pt; height: ${anySummed ? "6.2mm" : "5.6mm"}; }
td.nr { font-size: 7pt; }
td.nm { text-align: left; padding: 0 1.2mm; }
td.nm div { font-size: 7.6pt; font-weight: bold; overflow: hidden; text-overflow: ellipsis; }
td.nm span { font-size: 6.2pt; color: #555; display: block; overflow: hidden; text-overflow: ellipsis; }
.off { background: #E6E6E6; }
td.ab { font-weight: bold; font-size: 6.8pt; }
td.w { font-weight: bold; }
td.na { background: repeating-linear-gradient(135deg, #fff 0 1.2mm, #ddd 1.2mm 1.5mm); }
td.tt { font-size: 7.4pt; }
td.b { font-weight: bold; }
tbody.tail { page-break-inside: avoid; break-inside: avoid; }
tr.total td { font-weight: bold; background: #F2F2F2; font-size: 7.4pt; }
tr.end td { border: none; text-align: left; white-space: normal; height: auto; padding-top: 1mm; }
.legend { margin-top: 2.5mm; font-size: 7pt; line-height: 1.5; color: #222; }
.sign { display: flex; justify-content: space-between; gap: 20mm; margin-top: 9mm; font-size: 8.5pt; page-break-inside: avoid; break-inside: avoid; }
.sign > div { flex: 1; }
.line { border-top: .6pt solid #000; margin-top: 9mm; padding-top: .8mm; font-size: 6.8pt; color: #555; }
@media screen { body { background: #888; } .page { width: 281mm; margin: 6mm auto; background: #fff; padding: 6mm; box-shadow: 0 2px 10px rgba(0,0,0,.3); } }
</style></head><body><div class="page">
<div class="top">
  <div><b>${esc(company.name || "")}</b>${coLine ? `<br>${coLine}` : ""}</div>
  <div style="text-align:right">Darbuotojų: ${rows.length}<br>${approved ? `Tabelis patvirtintas${meta.approved_at ? ` ${esc(String(meta.approved_at).slice(0, 10))}` : ""}` : '<span class="draft">Tabelis nepatvirtintas</span>'}</div>
</div>
<h1>DARBO LAIKO APSKAITOS ŽINIARAŠTIS</h1>
<div class="sub">${esc(title)}</div>
<table>
  <colgroup>
    <col style="width:6mm"><col style="width:36mm">
    ${days.map(() => "<col>").join("")}
    <col style="width:8mm"><col style="width:10mm"><col style="width:9mm"><col style="width:8.5mm"><col style="width:8.5mm"><col style="width:8.5mm"><col style="width:9mm"><col style="width:8mm">
  </colgroup>
  <thead>
    <tr><th rowspan="3">Eil.<br>Nr.</th><th rowspan="3">Vardas, pavardė<br>pareigos</th>
      <th class="grp" colspan="${n}">Mėnesio dienos – dirbtos valandos arba žymėjimas</th>
      <th class="grp" colspan="2">Dirbta</th><th class="tot" rowspan="3">Nor-<br>ma,<br>val.</th>
      <th class="grp" colspan="4">Iš jų, val.</th><th class="tot" rowspan="3">Nebu-<br>vo,<br>d.</th></tr>
    <tr>${head1}<th class="tot" rowspan="2">d.</th><th class="tot" rowspan="2">val.</th>
      <th class="tot" rowspan="2">nak-<br>tį</th><th class="tot" rowspan="2">šven-<br>tėmis</th><th class="tot" rowspan="2">poil-<br>sio d.</th><th class="tot" rowspan="2">virš-<br>val.</th></tr>
    <tr>${head2}</tr>
  </thead>
  <tbody>${trs.join("")}</tbody>
  <tbody class="tail">${tail.join("")}
    <tr class="total"><td colspan="${n + 2}" style="text-align:right;padding-right:2mm">Iš viso</td>
      <td>${sum.workedDays || ""}</td><td>${fmt(sum.hours)}</td><td>${fmt(sum.norm)}</td><td>${fmt(sum.night)}</td>
      <td>${fmt(sum.holiday)}</td><td>${fmt(sum.rest)}</td><td>${fmt(sum.ot)}</td><td>${sum.abs || ""}</td></tr>
    <tr class="end"><td colspan="${W}">
      <div class="legend"><b>Žymėjimai:</b> skaičius – dirbtos valandos${legend.length ? " · " + legend.join(" · ") : ""} · pilkas fonas – poilsio ir švenčių dienos (Š – šventinė) · paryškintas skaičius pilkame fone – darbas poilsio ar švenčių dieną · užbrūkšniuota – nedirbo įmonėje</div>
      <div class="sign">
        <div>Žiniaraštį sudarė<div class="line">(pareigos, vardas, pavardė, parašas, data)</div></div>
        <div>Patvirtino<div class="line">(vadovo pareigos, vardas, pavardė, parašas, data)</div></div>
      </div>
    </td></tr>
  </tbody>
</table>
</div></body></html>`;
}

// Atidaro spausdinimo langą (naršyklė leidžia, nes kviečiama paspaudus mygtuką)
export function printTabelis(opts) {
  printHtml(tabelisHtml(opts));
}

// Spausdinama per nematomą iframe - be naujo lango ir be iššokančių langų blokavimo
export function printHtml(html) {
  const old = document.getElementById("ds-print-frame");
  if (old) old.remove();
  const f = document.createElement("iframe");
  f.id = "ds-print-frame";
  f.setAttribute("aria-hidden", "true");
  Object.assign(f.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(f);
  const doc = f.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  const go = () => setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); }, 200);
  if (doc.readyState === "complete") go(); else f.onload = go;
}
