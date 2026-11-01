// Darbo grafiko spausdinimas: A4 gulsčias, daug darbuotojų - keli puslapiai, antraštė kartojasi,
// eilutė neperskeliama, paskutinė stulpelis „Su grafiku susipažinau“ - parašui. Atidaroma atskirame lange -> Spausdinti / PDF.

import { printHtml } from "./printTabelis";

const MONTHS_GEN = ["sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio", "liepos", "rugpjūčio", "rugsėjo",
  "spalio", "lapkričio", "gruodžio"];
const WD = ["Pr", "An", "Tr", "Kt", "Pn", "Št", "Sk"];

// grafiko nebuvimų rūšys -> žiniaraščio žymėjimai
const ABS_CODES = {
  annual: ["A", "Kasmetinės atostogos"], sick: ["L", "Liga"], unpaid: ["NA", "Nemokamos atostogos"],
  family_day: ["MD", "Mamadienis / tėvadienis"], childcare: ["VP", "Vaiko priežiūros atostogos"],
  maternity: ["G", "Nėštumo ir gimdymo atostogos"], truancy: ["PB", "Pravaikšta"], trip: ["K", "Komandiruotė"],
  other: ["KT", "Kiti nebuvimai"], unknown: ["NB", "Nebuvimas"],
};

const num = (v) => Number(v || 0);
const fmt = (v) => {
  const n = num(v);
  return n ? n.toLocaleString("lt-LT", { maximumFractionDigits: 1 }) : "";
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clock = (t) => [String(t?.start || t?.start_time || "").slice(0, 5), String(t?.end || t?.end_time || "").slice(0, 5)];

function shiftHours(t) {
  if (t?.hours != null && t.hours !== "") return num(t.hours);
  const [a, b] = clock(t);
  if (!a || !b) return 0;
  const m = (x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
  let d = m(b) - m(a);
  if (d <= 0) d += 24 * 60;
  return Math.max(d - num(t?.break_minutes), 0) / 60;
}

/**
 * data - payrollApi.roster() atsakymas; absences - createAbsenceIndex(data) ({"empId|date": {kind, label}});
 * positions - {employeeId: pareigos}; company - aktyvus įmonės profilis
 */
export function grafikasHtml({ data, absences = {}, positions = {}, year, month, company = {} }) {
  const days = data?.days || [];
  const n = days.length;
  const types = data?.shift_types || [];
  const typeById = new Map(types.map((t) => [t.id, t]));
  const shiftsBy = {};
  (data?.shifts || []).forEach((s) => { (shiftsBy[`${s.employee_id}|${s.date}`] ||= []).push(s); });
  const usedTypes = new Set();
  const usedAbs = new Set();

  const summed = (data?.employees || []).map((e) => ({ e, fixed: false }));
  const fixed = (data?.fixed_employees || []).map((e) => ({ e, fixed: true }));
  const all = [...summed, ...fixed];
  let totalPlan = 0;

  const trs = all.map(({ e, fixed: isFixed }, i) => {
    let plan = 0;
    const cells = days.map((d) => {
      const off = d.holiday || d.weekday >= 5;
      const key = `${e.id}|${d.date}`;
      const ab = absences[key];
      const abCode = ab ? (ABS_CODES[ab.kind] || ABS_CODES.unknown)[0] : "";
      if (ab) usedAbs.add(ab.kind in ABS_CODES ? ab.kind : "unknown");
      if (isFixed) {
        const h = num((e.fixed_days || {})[d.date]);
        if (ab && ab.kind !== "trip") return `<td class="${off ? "off " : ""}ab">${abCode}</td>`;
        plan += h;
        return `<td class="${off ? "off" : ""}${h && off ? " w" : ""}">${h ? `<b>${fmt(h)}</b>` : ""}</td>`;
      }
      const ts = (shiftsBy[key] || []).filter((s) => !s.cancelled).map((s) => typeById.get(s.shift_type_id)).filter(Boolean);
      if (ab && !["family_day", "truancy", "trip"].includes(ab.kind)) return `<td class="${off ? "off " : ""}ab">${abCode}</td>`;
      if (!ts.length) return `<td class="${off ? "off" : ""}">${abCode ? `<span class="abs">${abCode}</span>` : ""}</td>`;
      ts.forEach((t) => usedTypes.add(t.id));
      const h = ts.reduce((a, t) => a + shiftHours(t), 0);
      plan += h;
      const codes = ts.map((t) => esc(t.code || "?")).join("+");
      return `<td class="${off ? "off" : ""}"><b>${codes}</b><i>${fmt(h)}${abCode ? ` ${abCode}` : ""}</i></td>`;
    }).join("");
    const hours = isFixed ? plan : num(e.hours ?? plan);
    totalPlan += hours;
    const norm = isFixed ? e.target_info?.month_norm ?? e.target : e.target_info?.month_norm ?? e.target;
    const pos = positions[String(e.id)] || e.position_name || e.position || "";
    return `<tr><td class="nr">${i + 1}</td><td class="nm"><div>${esc(e.name)}</div><span>${esc(pos)}${isFixed ? "" : " · suminė"}</span></td>${cells}
      <td class="tt b">${fmt(hours)}</td><td class="tt">${fmt(norm)}</td><td class="sg"></td></tr>`;
  });
  const tail = trs.splice(Math.max(trs.length - 3, 0));

  const head1 = days.map((d) => `<th class="${d.holiday || d.weekday >= 5 ? "off" : ""}">${Number(d.date.slice(8, 10))}</th>`).join("");
  const head2 = days.map((d) => `<th class="wd ${d.holiday || d.weekday >= 5 ? "off" : ""}">${d.holiday ? "Š" : WD[d.weekday]}${d.pre_holiday ? "*" : ""}</th>`).join("");

  const legendShifts = types.filter((t) => usedTypes.has(t.id)).map((t) => {
    const [a, b] = clock(t);
    return `<b>${esc(t.code)}</b> – ${esc(t.name)}${a ? ` ${a}–${b}` : ""} (${fmt(shiftHours(t))} val.)`;
  });
  const legendAbs = [...usedAbs].map((k) => `<b>${ABS_CODES[k][0]}</b> – ${ABS_CODES[k][1]}`);
  const anyPre = days.some((d) => d.pre_holiday);

  const published = data?.status === "published";
  const title = `${year} m. ${MONTHS_GEN[month - 1]} mėn.`;
  const coLine = [company.company_code && `Įmonės kodas ${company.company_code}`, company.address || company.company_address]
    .filter(Boolean).map(esc).join("<br>");

  return `<!doctype html><html lang="lt"><head><meta charset="utf-8"><title>Darbo grafikas – ${esc(title)}</title>
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
tbody.tail { page-break-inside: avoid; break-inside: avoid; }
th, td { border: .6pt solid #555; padding: 0; text-align: center; vertical-align: middle; overflow: hidden; white-space: nowrap; }
th { font-size: 7pt; font-weight: bold; background: #F2F2F2; height: 4.2mm; }
th.wd { font-weight: normal; font-size: 6.2pt; height: 3.4mm; }
th.grp { height: 4.5mm; }
th.tot { white-space: normal; line-height: 1.1; font-size: 6.4pt; padding: .4mm .2mm; }
td { height: 7mm; font-size: 7pt; line-height: 1.05; }
td b { display: block; font-size: 7pt; }
td i { display: block; font-style: normal; font-size: 5.6pt; color: #444; }
td.nr { font-size: 7pt; }
td.nm { text-align: left; padding: 0 1.2mm; }
td.nm div { font-size: 7.6pt; font-weight: bold; overflow: hidden; text-overflow: ellipsis; }
td.nm span { font-size: 6.2pt; color: #555; display: block; overflow: hidden; text-overflow: ellipsis; }
.off { background: #E6E6E6; }
td.ab { font-weight: bold; font-size: 6.8pt; }
td.w b { text-decoration: underline; }
td .abs { font-size: 6pt; color: #444; }
td.tt { font-size: 7.4pt; }
td.b { font-weight: bold; }
td.sg { background: #fff; }
tr.total td { font-weight: bold; background: #F2F2F2; font-size: 7.4pt; height: 5mm; }
tr.end td { border: none; text-align: left; white-space: normal; height: auto; padding-top: 1mm; }
.legend { font-size: 7pt; line-height: 1.5; color: #222; }
.legend b { display: inline; font-size: 7pt; }
.sign { display: flex; justify-content: space-between; gap: 20mm; margin-top: 8mm; font-size: 8.5pt; }
.sign > div { flex: 1; }
.line { border-top: .6pt solid #000; margin-top: 9mm; padding-top: .8mm; font-size: 6.8pt; color: #555; }
@media screen { body { background: #888; } .page { width: 281mm; margin: 6mm auto; background: #fff; padding: 6mm; box-shadow: 0 2px 10px rgba(0,0,0,.3); } }
</style></head><body><div class="page">
<div class="top">
  <div><b>${esc(company.name || "")}</b>${coLine ? `<br>${coLine}` : ""}</div>
  <div style="text-align:right">Darbuotojų: ${all.length}<br>${published
    ? `Grafikas paskelbtas${data?.published_at ? ` ${esc(String(data.published_at).slice(0, 10))}` : ""}`
    : '<span class="draft">Grafikas nepaskelbtas (juodraštis)</span>'}</div>
</div>
<h1>DARBO GRAFIKAS</h1>
<div class="sub">${esc(title)}</div>
<table>
  <colgroup>
    <col style="width:6mm"><col style="width:36mm">
    ${days.map(() => "<col>").join("")}
    <col style="width:10mm"><col style="width:10mm"><col style="width:30mm">
  </colgroup>
  <thead>
    <tr><th rowspan="3">Eil.<br>Nr.</th><th rowspan="3">Vardas, pavardė<br>pareigos</th>
      <th class="grp" colspan="${n}">Mėnesio dienos – pamaina ir valandos</th>
      <th class="tot" rowspan="3">Grafike,<br>val.</th><th class="tot" rowspan="3">Nor-<br>ma,<br>val.</th>
      <th class="tot" rowspan="3">Su grafiku susipažinau<br>(parašas, data)</th></tr>
    <tr>${head1}</tr>
    <tr>${head2}</tr>
  </thead>
  <tbody>${trs.join("")}</tbody>
  <tbody class="tail">${tail.join("")}
    <tr class="total"><td colspan="${n + 2}" style="text-align:right;padding-right:2mm">Iš viso</td>
      <td>${fmt(totalPlan)}</td><td></td><td style="background:#fff"></td></tr>
    <tr class="end"><td colspan="${n + 5}">
      <div class="legend"><b>Pamainos:</b> ${legendShifts.length ? legendShifts.join(" · ") : "–"}${legendAbs.length ? `<br><b>Nebuvimai:</b> ${legendAbs.join(" · ")}` : ""}<br>
        Pilkas fonas – poilsio ir švenčių dienos (Š – šventinė)${anyPre ? " · * – prieššventinė diena (trumpinama 1 val.)" : ""} · standartinės apskaitos darbuotojams nurodytos darbo valandos</div>
      <div class="sign">
        <div>Grafiką sudarė<div class="line">(pareigos, vardas, pavardė, parašas, data)</div></div>
        <div>Tvirtinu<div class="line">(vadovo pareigos, vardas, pavardė, parašas, data)</div></div>
      </div>
    </td></tr>
  </tbody>
</table>
</div></body></html>`;
}

export function printGrafikas(opts) {
  printHtml(grafikasHtml(opts));
}
