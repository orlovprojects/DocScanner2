import { useState, useMemo, memo } from "react";
import { Helmet } from "react-helmet";

const VDU = 2312.15;
const MMA = 1153;
const VDU_12 = 12 * VDU;
const VDU_36 = 36 * VDU;
const VDU_60 = 60 * VDU;
const SODRA_CAP_MB = 43 * VDU;
const SODRA_CAP_DU = VDU_60;
const CPS_MAX = 100000;

const PM_OPTIONS = [
  { value: "0",  label: "0%", sub: "Lengvata pirmiesiems 2 metams", rate: 0 },
  { value: "7",  label: "7%", sub: "Pajamos ≤ 300k, ≤ 10 darbuotojų", rate: 0.07 },
  { value: "17", label: "17%", sub: "Pajamos > 300k arba > 10 darbuotojų", rate: 0.17 },
];
const METHOD_OPTIONS = [
  { value: "optimal",    label: "⚙ Automatiškai parinkti optimaliausią" },
  { value: "dividendai", label: "Dividendai (15% GPM)" },
  { value: "cps",        label: "Civilinė paslaugų sutartis / Vadovo atlygis (15–25% GPM)" },
  { value: "asmeniniai", label: "Asmeniniai poreikiai (20–32% GPM)" },
  { value: "darbo",      label: "Darbo sutartis (GPM + VSD + PSD)" },
];

const fmt = (n) => (Number.isFinite(n) ? n : 0).toLocaleString("lt-LT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Icons (inline SVG) ──────────────────────────────────────
const IconCheck = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{flexShrink:0,marginTop:2}}><circle cx="8" cy="8" r="8" fill="#d1faf0"/><path d="M5 8l2 2 4-4" stroke="#065f56" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IconWarn = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{flexShrink:0,marginTop:2}}><path d="M8 1.5l7 13H1l7-13z" fill="#fef3c7" stroke="#b45309" strokeWidth="1"/><text x="8" y="12" textAnchor="middle" fontSize="9" fontWeight="700" fill="#b45309">!</text></svg>;
const IconTip = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{flexShrink:0,marginTop:2}}><circle cx="8" cy="8" r="8" fill="#e0f2fe"/><text x="8" y="12" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0369a1">i</text></svg>;

// ── GPM ─────────────────────────────────────────────────────
function gpmDividendai(a) { return a * 0.15; }

function gpmCPS(a) {
  if (a <= 0) return 0;
  return Math.min(a, VDU_12) * 0.15
    + Math.min(Math.max(a - VDU_12, 0), VDU_36 - VDU_12) * 0.20
    + Math.min(Math.max(a - VDU_36, 0), VDU_60 - VDU_36) * 0.25;
}

function gpmProgressive(a) {
  if (a <= 0) return 0;
  return Math.min(a, VDU_36) * 0.20
    + Math.min(Math.max(a - VDU_36, 0), VDU_60 - VDU_36) * 0.25
    + Math.max(a - VDU_60, 0) * 0.32;
}

function calcNPD(bruto) {
  if (bruto <= MMA) return 747;
  return Math.max(747 - 0.49 * (bruto - MMA), 0);
}

// ── Method calculations ─────────────────────────────────────
function calcDividendai(pelnas, pmRate, target) {
  const pm = pelnas * pmRate;
  const available = pelnas - pm;
  const amount = target > 0 ? Math.min(target, available) : available;
  const gpm = gpmDividendai(amount);
  const iRankas = amount - gpm;
  const pmDalis = available > 0 ? pm * (amount / available) : pm;
  return {
    method: "dividendai", title: "Dividendai",
    pm, pmDalis, amount, gpm, vsd: 0, psd: 0, employerVSD: 0, pensija: 0,
    iRankas, totalTax: pmDalis + gpm,
    mokestineNasta: amount > 0 ? ((pmDalis + gpm) / amount) * 100 : 0,
    pros: [
      "Mažiausias mokestis: tik PM + 15% GPM",
      "Paprasta administruoti, nereikia Sodros ataskaitų",
      "GPM tarifas fiksuotas, nepriklauso nuo sumos",
    ],
    cons: [
      "Jokių socialinių garantijų (nei VSD, nei PSD)",
      "Mokami tik iš paskirstyto pelno (metų pabaigoje)",
    ],
    tip: "Tinka, kai esate draustas PSD ir VSD kitur (pvz., dirbate pagal darbo sutartį kitoje įmonėje).",
  };
}

function calcCPS(pelnas, pmRate, target, cpsMax) {
  const PSD_ANNUAL = MMA * 0.0698 * 12;
  const maxCPS = Math.min(cpsMax, Math.max(pelnas - PSD_ANNUAL, 0));
  const amount = target > 0 ? Math.min(target, maxCPS) : maxCPS;
  const remainingPelnas = Math.max(pelnas - amount - PSD_ANNUAL, 0);
  const pm = remainingPelnas * pmRate;
  const gpm = gpmCPS(amount);
  const iRankas = amount - gpm;
  const totalTax = pm + gpm + PSD_ANNUAL;
  const pvmWarning = amount > 45000;
  return {
    method: "cps", title: "Civilinė paslaugų sutartis (Vadovo atlygis)",
    pm, pmBase: remainingPelnas, amount, gpm, vsd: 0, psd: PSD_ANNUAL, employerVSD: 0, pensija: 0,
    iRankas, totalTax, pvmWarning,
    mokestineNasta: amount > 0 ? (totalTax / amount) * 100 : 0,
    pros: [
      "15% GPM iki 12 VDU (27 746 €/metus)",
      "Mažina pelno mokesčio bazę (CPS yra MB sąnaudos)",
      "Galima išmokėti kas mėnesį",
      "Privalomasis sveikatos draudimas (PSD, ~80 €/mėn.)",
    ],
    cons: [
      "VSD nemokamas: nekaupiamas stažas pensijai",
      "Nėra ligos, motinystės, tėvystės išmokų",
      "Viršijus 12 VDU, GPM didėja iki 20–25%",
      "Metinė riba: 100 000 €",
    ],
    tip: "Tinka daugumai MB narių: mažas GPM, lankstus išmokėjimas, CPS mažina PM bazę.",
  };
}

function calcAsmeniniai(pelnas, pmRate, target) {
  const pm = pelnas * pmRate;
  const postPM = pelnas - pm;
  const SODRA_FACTOR = 0.70;
  const VSD_R = 0.1383, PSD_R = 0.0698;
  const sodraOnAmount = SODRA_FACTOR * (VSD_R + PSD_R);
  const maxAmount = postPM / (1 + sodraOnAmount);
  const amount = target > 0 ? Math.min(target, maxAmount) : maxAmount;
  const sodraBase = Math.min(amount * SODRA_FACTOR, SODRA_CAP_MB);
  const vsd = sodraBase * VSD_R;
  const psd = sodraBase * PSD_R;
  const gpm = gpmProgressive(amount);
  const iRankas = amount - gpm;
  const pmDalis = postPM > 0 ? pm * ((amount + vsd + psd) / postPM) : pm;
  const taxOnPayout = pmDalis + gpm + vsd + psd;
  return {
    method: "asmeniniai", title: "Asmeniniai poreikiai",
    pm, pmDalis, amount, gpm, vsd, psd, employerVSD: 0, pensija: 0,
    iRankas, totalTax: taxOnPayout,
    mokestineNasta: amount > 0 ? (taxOnPayout / amount) * 100 : 0,
    pros: [
      "VSD mokamas: kaupiamas pensijos stažas",
      "PSD mokamas: privalomasis sveikatos draudimas",
      "Galima išsiimti bet kada, lanksčios sąlygos",
    ],
    cons: [
      "Didžiausia mokestinė našta (GPM + Sodra + PM)",
      "Progresinis GPM: 20%, viršijus 36 VDU: 25%, 60 VDU: 32%",
      "Nuo 2026-07-01 Sodros bazė didėja nuo 50% iki 90%",
      "Garantijos proporcingos išmokų dydžiui ir reguliarumui",
    ],
    tip: "Tinka, kai reikia socialinių garantijų ir neplanuojate darbo santykių kitoje įmonėje.",
  };
}

function calcDarboSutartis(pelnas, pmRate, target, pensija3, draustasPSD) {
  const maxBruto = pelnas / 1.0177;
  const bruto = target > 0 ? Math.min(target, maxBruto) : maxBruto;
  const employerVSD = bruto * 0.0177;
  const remainingPelnas = Math.max(pelnas - bruto - employerVSD, 0);
  const pm = remainingPelnas * pmRate;
  const npd = calcNPD(bruto);
  const taxable = Math.max(bruto - npd, 0);
  const gpm = gpmProgressive(taxable);
  const vsd = Math.min(bruto, SODRA_CAP_DU) * 0.1252;
  const psd = draustasPSD ? 0 : bruto * 0.0698;
  const pensija = pensija3 ? bruto * 0.03 : 0;
  const iRankas = bruto - gpm - vsd - psd - pensija;
  const totalTax = pm + gpm + vsd + psd + pensija + employerVSD;
  return {
    method: "darbo", title: "Darbo sutartis",
    pm, pmBase: remainingPelnas, amount: bruto, gpm, vsd, psd, pensija, employerVSD, npd,
    iRankas, totalTax,
    mokestineNasta: bruto > 0 ? (totalTax / bruto) * 100 : 0,
    pros: [
      "Pilnos socialinės garantijos (VSD + PSD + pensija)",
      "DU mažina pelno mokesčio bazę",
      "Reguliarus, nuspėjamas atlygis",
      "Taikomas NPD (neapmokestinamasis pajamų dydis)",
    ],
    cons: [
      "Didžiausia Sodros įmokų suma",
      "Darbdavys (MB) papildomai moka 1,77% VSD",
      "Progresinis GPM: 20/25/32%",
    ],
    tip: "Tinka, kai norima pilnų socialinių garantijų ir DU efektyviai mažina pelno mokestį.",
  };
}

function calcCPSplusDividendai(pelnas, pmRate, target, cpsMax) {
  const PSD_ANNUAL = MMA * 0.0698 * 12;
  // CPS up to min(cpsMax, pelnas) - NOT just 12 VDU
  const maxCPS = Math.min(cpsMax, Math.max(pelnas - PSD_ANNUAL, 0));
  const totalTarget = target > 0 ? target : pelnas;
  const cpsAmount = Math.min(maxCPS, totalTarget);
  const mbExpenseCPS = cpsAmount + PSD_ANNUAL;
  const pelnasAfterCPS = Math.max(pelnas - mbExpenseCPS, 0);
  const pm = pelnasAfterCPS * pmRate;
  const availableDiv = pelnasAfterCPS - pm;
  const remainingTarget = target > 0 ? Math.max(totalTarget - cpsAmount, 0) : availableDiv;
  const divAmount = Math.min(Math.max(remainingTarget, 0), Math.max(availableDiv, 0));
  const gpmCps = gpmCPS(cpsAmount);
  const gpmDiv = gpmDividendai(divAmount);
  const iRankas = (cpsAmount - gpmCps) + (divAmount - gpmDiv);
  const totalPayout = cpsAmount + divAmount;
  const totalTax = pm + gpmCps + gpmDiv + PSD_ANNUAL;
  return {
    method: "combo_cps_div", title: "CPS + Dividendai",
    pm, pmBase: pelnasAfterCPS, cpsPart: { amount: cpsAmount, gpm: gpmCps, iRankas: cpsAmount - gpmCps },
    divPart: { amount: divAmount, gpm: gpmDiv, iRankas: divAmount - gpmDiv },
    amount: totalPayout, psd: PSD_ANNUAL, vsd: 0, gpm: gpmCps + gpmDiv,
    iRankas, totalTax, pvmWarning: cpsAmount > 45000,
    mokestineNasta: totalPayout > 0 ? (totalTax / totalPayout) * 100 : 0,
    pros: [
      "CPS mažina PM bazę, dividendai be Sodros",
      "Abu apmokestinami 15% GPM (CPS iki 12 VDU)",
      "Privalomasis sveikatos draudimas (PSD, ~80 €/mėn.)",
    ],
    cons: [
      "VSD nekaupiamas (socialinės garantijos tik PSD)",
      "Dividendai mokami tik metų pabaigoje",
    ],
    tip: "Optimaliausias variantas daugumai: CPS išimama kas mėnesį, o likutis paskirstomas kaip dividendai.",
    isCombo: true,
  };
}

// ── Colors ──────────────────────────────────────────────────
const C = {
  accent: "#0d7d72", accentLight: "#b2f0e6", bg: "#f5f7f8", card: "#ffffff",
  text: "#111827", textSec: "#374151", border: "#d1d5db",
  red: "#b91c1c", redBg: "#fef2f2", green: "#065f56", greenBg: "#d1faf0",
  gold: "#78350f", goldBg: "#fef3c7", blue: "#0369a1", blueBg: "#e0f2fe",
  purple: "#7c3aed", purpleBg: "#ede9fe",
};

export default function MBSkaiciuokle2026() {
  const [pajamos, setPajamos] = useState("");
  const [sanaudos, setSanaudos] = useState("");
  const [pmRate, setPmRate] = useState("7");
  const [method, setMethod] = useState("optimal");
  const [ismokejimas, setIsmokejimas] = useState("");
  const [pensija3, setPensija3] = useState(false);
  const [draustasPSD, setDraustasPSD] = useState(false);
  const [vengtiPVM, setVengtiPVM] = useState(false);
  const [showTooltip, setShowTooltip] = useState(null);

  const handleNum = (s) => (e) => {
    const v = e.target.value;
    if (v === "") { s(""); return; }
    const c = v.replace(",", ".");
    if (!/^\d*\.?\d*$/.test(c)) return;
    const n = Number(c);
    if (!Number.isNaN(n) && n >= 0) s(n);
  };

  const pajamosNum = Number(pajamos) || 0;
  const pmForced = pajamosNum > 300000;
  const pmRateEffective = pmForced ? "17" : pmRate;
  const pmRateNum = PM_OPTIONS.find(o => o.value === pmRateEffective)?.rate ?? 0.07;
  const pelnas = Math.max((Number(pajamos) || 0) - (Number(sanaudos) || 0), 0);
  const target = Number(ismokejimas) || 0;

  // Validation
  const cpsMaxVal = vengtiPVM ? 45000 : CPS_MAX;
  const maxForMethod = method === "cps" ? Math.min(cpsMaxVal, pelnas) : pelnas;
  const validationError = target > 0 && target > maxForMethod
    ? method === "cps" && target > cpsMaxVal
      ? `CPS metinė riba: ${fmt(cpsMaxVal)} €`
      : `Suma viršija pelną: ${fmt(pelnas)} €`
    : null;

  const results = useMemo(() => {
    if (pelnas <= 0) return null;
    const t = validationError ? 0 : target;
    const cpsMax = vengtiPVM ? 45000 : CPS_MAX;
    const all = [
      calcDividendai(pelnas, pmRateNum, t),
      calcCPS(pelnas, pmRateNum, t, cpsMax),
      calcAsmeniniai(pelnas, pmRateNum, t),
      calcDarboSutartis(pelnas, pmRateNum, t, pensija3, draustasPSD),
    ];
    const combo = calcCPSplusDividendai(pelnas, pmRateNum, t, cpsMax);
    // Filter out CPS-only when target exceeds CPS limit
    const allFiltered = t > cpsMax
      ? all.filter(r => r.method !== "cps")
      : all;
    const ranked = [...allFiltered, combo].sort((a, b) => b.iRankas - a.iRankas);
    return { all, combo, ranked };
  }, [pelnas, pmRateNum, target, pensija3, draustasPSD, method, validationError, vengtiPVM]);

  // ── Styles ────────────────────────────────────────────────
  const card = { background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: "28px", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)" };
  const cardTitle = { fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: C.textSec, marginBottom: 20 };
  const lbl = { display: "block", fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 6 };
  const inp = { width: "100%", padding: "12px 14px", fontSize: 16, border: `1.5px solid ${C.border}`, borderRadius: 10, outline: "none", background: "#f9fafb", color: C.text, boxSizing: "border-box", transition: "border-color 0.2s" };
  const sel = { ...inp, cursor: "pointer", appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23374151' stroke-width='2' fill='none'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center", paddingRight: 36 };
  const chkRow = { display: "flex", alignItems: "center", gap: 10, padding: "10px 0", cursor: "pointer", userSelect: "none" };
  const chkBox = (on) => ({ width: 20, height: 20, borderRadius: 6, border: `2px solid ${on ? C.accent : "#9ca3af"}`, background: on ? C.accent : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 });
  const Chk = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;

  const Tooltip = ({ items }) => (
    <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", background: "#111827", color: "#fff", padding: "14px 16px", borderRadius: 12, fontSize: 13, lineHeight: 1.5, width: 280, zIndex: 100, boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}>
      {items.map((t, i) => <div key={i} style={{ marginBottom: 3 }}>{t}</div>)}
    </div>
  );

  const QMark = ({ id, items }) => (
    <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: "#e2e8f0", color: C.textSec, fontSize: 11, fontWeight: 700, cursor: "pointer", marginLeft: 6, position: "relative" }}
      onMouseEnter={() => setShowTooltip(id)} onMouseLeave={() => setShowTooltip(null)} onClick={() => setShowTooltip(showTooltip === id ? null : id)}>
      ?
      {showTooltip === id && <Tooltip items={items} />}
    </div>
  );

  const singleResult = useMemo(() => {
    if (!results || method === "optimal") return null;
    return results.all.find(r => r.method === method);
  }, [results, method]);

  const focusAccent = (e) => { e.target.style.borderColor = C.accent; };
  const blurBorder = (e) => { e.target.style.borderColor = C.border; };

  return (
    <div style={{ fontFamily: "'DM Sans', 'Satoshi', system-ui, sans-serif", background: C.bg, minHeight: "100vh", color: C.text, padding: "0 16px 80px" }}>
      <Helmet>
        <title>Mažosios bendrijos skaičiuoklė 2026 | MB mokesčių skaičiavimas</title>
        <meta name="description" content="Apskaičiuokite MB mokesčius 2026 metams: pelno mokestis, GPM, Sodra. Palyginkite dividendus, CPS, asmeninių poreikių ir darbo sutarties variantus." />
        <link rel="canonical" href="https://atlyginimoskaiciuokle.com/mazoji-bendrija" />
        <script type="application/ld+json">{JSON.stringify({ "@context": "https://schema.org", "@type": "WebApplication", "name": "Mažosios bendrijos skaičiuoklė 2026", "url": "https://atlyginimoskaiciuokle.com/mazoji-bendrija", "applicationCategory": "FinanceApplication", "operatingSystem": "All", "offers": { "@type": "Offer", "price": "0", "priceCurrency": "EUR" }, "inLanguage": "lt" })}</script>
        <script type="application/ld+json">{JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
          { "@type": "Question", "name": "Kokie mokesčiai taikomi mažajai bendrijai 2026 metais?", "acceptedAnswer": { "@type": "Answer", "text": "MB moka pelno mokestį (0%, 7% arba 17%), o nariai, priklausomai nuo pinigų išmokėjimo būdo: GPM (15–32%), VSD ir PSD įmokas. Optimaliausias būdas daugumai yra CPS + dividendai." }},
          { "@type": "Question", "name": "Koks MB pelno mokesčio tarifas 2026 metais?", "acceptedAnswer": { "@type": "Answer", "text": "0% pirmuosius 2 metus, 7% kai apyvarta iki 300 000 € ir iki 10 darbuotojų, 17% standartinis tarifas." }},
          { "@type": "Question", "name": "Kaip MB narys gali išsiimti pinigus?", "acceptedAnswer": { "@type": "Answer", "text": "4 būdais: dividendais (15% GPM), CPS/vadovo atlygiu (15–25% GPM), asmeniniams poreikiams (20–32% GPM + Sodra), arba pagal darbo sutartį (GPM + VSD + PSD)." }},
        ] })}</script>
        <script type="application/ld+json">{JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [ { "@type": "ListItem", "position": 1, "name": "Pradžia", "item": "https://atlyginimoskaiciuokle.com" }, { "@type": "ListItem", "position": 2, "name": "MB skaičiuoklė 2026", "item": "https://atlyginimoskaiciuokle.com/mazoji-bendrija" } ] })}</script>
      </Helmet>

      <div style={{ maxWidth: 1080, margin: "0 auto", paddingTop: 40 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>Mažosios bendrijos skaičiuoklė 2026</h1>
        <p style={{ fontSize: 15, color: C.textSec, marginTop: 8, marginBottom: 32, lineHeight: 1.5 }}>Apskaičiuokite mokesčius ir palyginkite skirtingus pinigų išmokėjimo būdus iš MB.</p>

        <style>{`@media(min-width:768px){.mb-grid{grid-template-columns:1fr 1fr!important}}`}</style>

        <div className="mb-grid" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 24 }}>
          {/* LEFT */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={card}>
              <div style={cardTitle}>MB duomenys</div>
              <div style={{ marginBottom: 20 }}>
                <label style={lbl}>Pajamos per metus (€)</label>
                <input type="text" inputMode="decimal" style={inp} value={pajamos} onChange={handleNum(setPajamos)} placeholder="Metinės pajamos" onFocus={focusAccent} onBlur={blurBorder} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
                  <label style={{ ...lbl, marginBottom: 0 }}>Sąnaudos per metus (€)</label>
                  <QMark id="san" items={["Neįtraukiant MB vadovo atlygio ar kitų išmokų nariams.", "Čia įveskite tik veiklos sąnaudas: nuoma, paslaugos, medžiagos ir pan."]} />
                </div>
                <input type="text" inputMode="decimal" style={inp} value={sanaudos} onChange={handleNum(setSanaudos)} placeholder="Metinės sąnaudos" onFocus={focusAccent} onBlur={blurBorder} />
              </div>
              {pelnas > 0 && <div style={{ background: C.greenBg, borderRadius: 10, padding: "10px 14px", fontSize: 14, fontWeight: 600, color: C.green, marginBottom: 20 }}>Pelnas: {fmt(pelnas)} €</div>}
              <div style={{ marginBottom: 20 }}>
                <label style={lbl}>Pelno mokesčio tarifas</label>
                <select style={{ ...sel, ...(pmForced ? { opacity: 0.5, pointerEvents: "none", background: "#e5e7eb" } : {}) }} value={pmRateEffective} onChange={e => setPmRate(e.target.value)} disabled={pmForced}>{PM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} ({o.sub})</option>)}</select>
                {pmForced && <div style={{ color: "#b45309", fontSize: 13, marginTop: 4 }}>Pajamos viršija 300 000 €, taikomas 17% tarifas visam pelnui</div>}
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={lbl}>Pinigų išmokėjimo būdas</label>
                <select style={sel} value={method} onChange={e => setMethod(e.target.value)}>{METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={lbl}>Išmokėjimo suma per metus, iki mokesčių (€)</label>
                <input type="text" inputMode="decimal" style={{ ...inp, borderColor: validationError ? C.red : C.border }} value={ismokejimas} onChange={handleNum(setIsmokejimas)} placeholder="Tuščia = visas pelnas" onFocus={focusAccent} onBlur={blurBorder} />
                {validationError && <div style={{ color: C.red, fontSize: 13, marginTop: 4 }}>{validationError}</div>}
              </div>

              <div style={chkRow} onClick={() => setVengtiPVM(!vengtiPVM)}>
                <div style={chkBox(vengtiPVM)}>{vengtiPVM && <Chk />}</div>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>Vengti PVM registracijos</span>
                  <div style={{ fontSize: 12, color: C.textSec }}>CPS neviršys 45 000 € per metus</div>
                </div>
              </div>
            </div>

            {method === "darbo" && (
              <div style={card}>
                <div style={cardTitle}>Darbo sutarties nustatymai</div>
                <div style={chkRow} onClick={() => setPensija3(!pensija3)}>
                  <div style={chkBox(pensija3)}>{pensija3 && <Chk />}</div>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>Papildomas pensijos kaupimas (3%)</span>
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <div style={chkRow} onClick={() => setDraustasPSD(!draustasPSD)}>
                    <div style={chkBox(draustasPSD)}>{draustasPSD && <Chk />}</div>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>Draustas (-a) PSD valstybės lėšomis</span>
                  </div>
                  <QMark id="psd" items={["PSD mokėti nereikia, jei:", "• Dirbate pagal darbo sutartį kitoje įmonėje", "• Esate studentas (-ė)", "• Esate vaiko priežiūros atostogose", "• Esate registruotas (-a) bedarbis (-ė)", "• Esate pensininkas (-ė)"]} />
                </div>
              </div>
            )}
          </div>

          {/* RIGHT */}
          <div>
            {!results ? (
              <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: C.textSec, fontSize: 15 }}>Įveskite pajamas, kad pamatytumėte rezultatus</div>
            ) : method === "optimal" ? (
              <OptimalView results={results} pelnas={pelnas} />
            ) : singleResult ? (
              <SingleMethodCard r={singleResult} pelnas={pelnas} />
            ) : null}
          </div>
        </div>
        <MBInfoSection />
      </div>
    </div>
  );
}

// ── Single method card ──────────────────────────────────────
const SingleMethodCard = memo(function SingleMethodCard({ r, pelnas }) {
  const row = { display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.border}`, fontSize: 15 };
  const val = { fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const base = r.pmBase !== undefined ? r.pmBase : pelnas;
  const pmRateLabel = base > 0 && r.pm > 0 ? `${((r.pm / base) * 100).toFixed(0)}%` : "0%";
  return (
    <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: "28px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: C.textSec, marginBottom: 20 }}>{r.title}</div>
      <BreakdownRows r={r} pelnas={pelnas} row={row} val={val} pmRateLabel={pmRateLabel} />
      <TotalBlocks r={r} />
      <ProsCons pros={r.pros} cons={r.cons} tip={r.tip} />
    </div>
  );
});

// ── Breakdown rows with percentages ─────────────────────────
function BreakdownRows({ r, pelnas, row, val, pmRateLabel }) {
  const isDU = r.method === "darbo";
  const hasPmBase = r.pmBase !== undefined && r.pmBase !== pelnas;
  const pmLabel = hasPmBase
    ? `Pelno mokestis (${pmRateLabel} nuo ${fmt(r.pmBase)} €)`
    : `Pelno mokestis (${pmRateLabel})`;
  return <>
    <div style={row}><span style={{ color: C.textSec }}>Pelnas</span><span style={val}>{fmt(pelnas)} €</span></div>
    {r.pm > 0 && <div style={row}><span style={{ color: C.textSec }}>{pmLabel}</span><span style={val}>{fmt(r.pm)} €</span></div>}
    {r.pmDalis !== undefined && r.pmDalis > 0 && r.pmDalis !== r.pm && <div style={row}><span style={{ color: C.textSec, fontSize: 13 }}>PM dalis, tenkanti šiai išmokai</span><span style={{ ...val, fontSize: 13 }}>{fmt(r.pmDalis)} €</span></div>}
    {isDU && r.employerVSD > 0 && <div style={row}><span style={{ color: C.textSec }}>Darbdavio VSD (1,77%)</span><span style={val}>{fmt(r.employerVSD)} €</span></div>}
    <div style={{ ...row, fontWeight: 600 }}><span>Išmokėjimo suma (bruto)</span><span style={val}>{fmt(r.amount)} €</span></div>
    {r.gpm > 0 && <div style={row}><span style={{ color: C.textSec }}>GPM{r.method === "dividendai" ? " (15%)" : ""}</span><span style={val}>{fmt(r.gpm)} €</span></div>}
    {r.vsd > 0 && <div style={row}><span style={{ color: C.textSec }}>VSD{isDU ? " (12,52%)" : " (13,83%, moka MB)"}</span><span style={val}>{fmt(r.vsd)} €</span></div>}
    {r.psd > 0 && <div style={row}><span style={{ color: C.textSec }}>PSD{isDU ? " (6,98%)" : r.method === "cps" ? " (fiksuota, ~80 €/mėn.)" : " (6,98%, moka MB)"}</span><span style={val}>{fmt(r.psd)} €</span></div>}
    {r.pensija > 0 && <div style={row}><span style={{ color: C.textSec }}>Papildoma pensija (3%)</span><span style={val}>{fmt(r.pensija)} €</span></div>}
    {!isDU && r.employerVSD > 0 && <div style={row}><span style={{ color: C.textSec }}>Darbdavio VSD (1,77%)</span><span style={val}>{fmt(r.employerVSD)} €</span></div>}
    {r.pvmWarning && <div style={{ margin: "8px 0", padding: "8px 12px", background: "#fef3c7", borderRadius: 8, fontSize: 13, color: "#92400e", display: "flex", gap: 8 }}><IconWarn /><span>CPS viršija 45 000 €. Vadovas privalo registruotis PVM mokėtoju. Jei MB yra PVM mokėtoja, PVM atskaitomas ir papildomų kaštų nesukelia.</span></div>}
  </>;
}

// ── Total blocks ────────────────────────────────────────────
function TotalBlocks({ r }) {
  return <>
    <div style={{ background: C.redBg, borderRadius: 14, padding: "14px 18px", marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: C.red, fontSize: 15, fontWeight: 700 }}>Iš viso mokesčių</span>
      <span style={{ color: C.red, fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmt(r.totalTax)} €</span>
    </div>
    <div style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.green})`, borderRadius: 14, padding: "14px 18px", marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: "rgba(255,255,255,0.95)", fontSize: 15, fontWeight: 600 }}>Į rankas</span>
      <span style={{ color: "#fff", fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmt(r.iRankas)} €</span>
    </div>
    <div style={{ textAlign: "center", marginTop: 10 }}>
      <span style={{ display: "inline-block", background: C.goldBg, color: C.gold, borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600 }}>
        Efektyvus tarifas: {r.mokestineNasta.toFixed(1)}%
      </span>
    </div>
  </>;
}

// ── Optimal view ────────────────────────────────────────────
const OptimalView = memo(function OptimalView({ results, pelnas }) {
  const labeled = results.ranked.map((r, i) => {
    let badge = null;
    const isFirst = i === 0, isLast = i === results.ranked.length - 1;
    if (isFirst) {
      badge = r.method === "cps" || r.method === "combo_cps_div"
        ? { text: "Mažiausi mokesčiai + PSD", color: C.green, bg: C.greenBg }
        : { text: "Mažiausi mokesčiai", color: C.green, bg: C.greenBg };
    } else if (isLast) {
      badge = { text: "Didžiausi mokesčiai", color: C.red, bg: C.redBg };
    } else if (r.method === "cps" || r.method === "combo_cps_div") {
      badge = { text: "Mažiausi mokesčiai + PSD", color: C.blue, bg: C.blueBg };
    } else if (r.method === "asmeniniai") {
      badge = { text: "Jei reikia soc. garantijų", color: C.purple, bg: C.purpleBg };
    } else if (r.method === "darbo") {
      badge = { text: "Pilnos soc. garantijos", color: C.purple, bg: C.purpleBg };
    } else if (r.method === "dividendai") {
      badge = { text: "Paprasčiausias būdas", color: C.textSec, bg: "#f1f5f9" };
    }
    return { ...r, badge };
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {labeled.map((r, i) => <CompactCard key={r.method} r={r} pelnas={pelnas} isBest={i === 0} />)}
    </div>
  );
});

function CompactCard({ r, pelnas, isBest }) {
  const [expanded, setExpanded] = useState(isBest);
  return (
    <div style={{ background: C.card, borderRadius: 14, border: `${isBest ? "2px" : "1px"} solid ${isBest ? C.accent : C.border}`, padding: "18px 20px", boxShadow: isBest ? "0 2px 12px rgba(13,125,114,0.12)" : "0 1px 3px rgba(0,0,0,0.04)", cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        {r.badge && <span style={{ background: r.badge.bg, color: r.badge.color, borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{r.badge.text}</span>}
        <span style={{ fontSize: 16, fontWeight: 700 }}>{r.title}</span>
      </div>

      {/* Only Į rankas */}
      <div style={{ background: isBest ? C.greenBg : "#f9fafb", borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, color: C.textSec }}>Į rankas (po mokesčių)</span>
        <span style={{ fontSize: 22, fontWeight: 700, color: C.green, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmt(r.iRankas)} €</span>
      </div>

      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span style={{ background: C.goldBg, color: C.gold, borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>Mokesčiai: {fmt(r.totalTax)} €</span>
        <span style={{ background: C.redBg, color: C.red, borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>Efektyvus tarifas: {r.mokestineNasta.toFixed(1)}%</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          {r.isCombo ? <ComboDetails r={r} pelnas={pelnas} /> : <CompactDetails r={r} pelnas={pelnas} />}
          <ProsCons pros={r.pros} cons={r.cons} tip={r.tip} />
        </div>
      )}
      {!expanded && <div style={{ fontSize: 12, color: C.textSec, marginTop: 6 }}>Spauskite, kad pamatytumėte detales ▾</div>}
    </div>
  );
}

function CompactDetails({ r, pelnas }) {
  const s = { display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 14 };
  const l = { color: C.textSec }, v = { fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const isDU = r.method === "darbo";
  const base = r.pmBase !== undefined ? r.pmBase : pelnas;
  const pmLabel = base > 0 && r.pm > 0 && base !== pelnas
    ? `Pelno mokestis (${((r.pm / base) * 100).toFixed(0)}% nuo ${fmt(base)} €)`
    : `Pelno mokestis (${base > 0 && r.pm > 0 ? ((r.pm / base) * 100).toFixed(0) : 0}%)`;
  return <div>
    <div style={s}><span style={l}>Pelnas</span><span style={v}>{fmt(pelnas)} €</span></div>
    {r.pm > 0 && <div style={s}><span style={l}>{pmLabel}</span><span style={v}>{fmt(r.pm)} €</span></div>}
    {isDU && r.employerVSD > 0 && <div style={s}><span style={l}>Darbdavio VSD (1,77%)</span><span style={v}>{fmt(r.employerVSD)} €</span></div>}
    <div style={{ ...s, fontWeight: 600 }}><span>Bruto</span><span style={v}>{fmt(r.amount)} €</span></div>
    {r.gpm > 0 && <div style={s}><span style={l}>GPM{r.method === "dividendai" ? " (15%)" : ""}</span><span style={v}>{fmt(r.gpm)} €</span></div>}
    {r.vsd > 0 && <div style={s}><span style={l}>VSD{isDU ? " (12,52%)" : " (13,83%)"}</span><span style={v}>{fmt(r.vsd)} €</span></div>}
    {r.psd > 0 && <div style={s}><span style={l}>PSD{isDU ? " (6,98%)" : r.method === "cps" ? " (fiksuota)" : " (6,98%)"}</span><span style={v}>{fmt(r.psd)} €</span></div>}
    {r.pensija > 0 && <div style={s}><span style={l}>Pensija (3%)</span><span style={v}>{fmt(r.pensija)} €</span></div>}
    {r.pvmWarning && <div style={{ margin: "6px 0", padding: "6px 10px", background: "#fef3c7", borderRadius: 8, fontSize: 12, color: "#92400e", display: "flex", gap: 6 }}><IconWarn /><span>CPS viršija 45 000 €. Vadovas privalo registruotis PVM mokėtoju.</span></div>}
  </div>;
}

function ComboDetails({ r, pelnas }) {
  const s = { display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 14 };
  const l = { color: C.textSec }, v = { fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const sec = { fontSize: 13, fontWeight: 700, color: C.accent, marginTop: 10, marginBottom: 4 };
  return <div>
    <div style={s}><span style={l}>Pelnas</span><span style={v}>{fmt(pelnas)} €</span></div>
    <div style={sec}>CPS dalis ({r.cpsPart.amount <= VDU_12 ? "15" : "15–25"}% GPM)</div>
    <div style={s}><span style={l}>CPS suma</span><span style={v}>{fmt(r.cpsPart.amount)} €</span></div>
    <div style={s}><span style={l}>GPM</span><span style={v}>{fmt(r.cpsPart.gpm)} €</span></div>
    <div style={s}><span style={{ ...l, color: C.green }}>Į rankas</span><span style={{ ...v, color: C.green }}>{fmt(r.cpsPart.iRankas)} €</span></div>
    {r.divPart.amount > 0 && <>
      <div style={sec}>Dividendų dalis (15% GPM)</div>
      <div style={s}><span style={l}>PM nuo likučio ({r.pm > 0 ? ((r.pm / Math.max(pelnas - r.cpsPart.amount - r.psd, 1)) * 100).toFixed(0) + "%" : "0%"})</span><span style={v}>{fmt(r.pm)} €</span></div>
      <div style={s}><span style={l}>Dividendai</span><span style={v}>{fmt(r.divPart.amount)} €</span></div>
      <div style={s}><span style={l}>GPM (15%)</span><span style={v}>{fmt(r.divPart.gpm)} €</span></div>
      <div style={s}><span style={{ ...l, color: C.green }}>Į rankas</span><span style={{ ...v, color: C.green }}>{fmt(r.divPart.iRankas)} €</span></div>
    </>}
    <div style={s}><span style={l}>PSD (fiksuota, ~80 €/mėn.)</span><span style={v}>{fmt(r.psd)} €</span></div>
    {r.pvmWarning && <div style={{ margin: "6px 0", padding: "6px 10px", background: "#fef3c7", borderRadius: 8, fontSize: 12, color: "#92400e", display: "flex", gap: 6 }}><IconWarn /><span>CPS viršija 45 000 €. Vadovas privalo registruotis PVM mokėtoju.</span></div>}
  </div>;
}

// ── Pros / Cons ─────────────────────────────────────────────
function ProsCons({ pros, cons, tip }) {
  return (
    <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.7 }}>
      {pros.map((p, i) => <div key={`p${i}`} style={{ display: "flex", gap: 8, color: C.green, marginBottom: 3 }}><IconCheck /><span>{p}</span></div>)}
      {cons.map((c, i) => <div key={`c${i}`} style={{ display: "flex", gap: 8, color: "#b45309", marginBottom: 3 }}><IconWarn /><span>{c}</span></div>)}
      {tip && <div style={{ marginTop: 8, padding: "8px 12px", background: C.blueBg, borderRadius: 8, display: "flex", gap: 8, color: C.blue, fontSize: 13 }}><IconTip /><span>{tip}</span></div>}
    </div>
  );
}

// ── Info section ─────────────────────────────────────────────
const MBInfoSection = memo(function MBInfoSection() {
  const h2 = { fontSize: 22, fontWeight: 700, color: "#111827", marginTop: 48, marginBottom: 12 };
  const h3 = { fontSize: 20, fontWeight: 700, color: "#111827", marginTop: 32, marginBottom: 10 };
  const p = { fontSize: 15, lineHeight: 1.75, color: "#374151", marginBottom: 14 };
  const ul = { paddingLeft: 24, marginBottom: 16, listStyleType: "disc" };
  const li = { fontSize: 15, lineHeight: 1.75, color: "#374151", marginBottom: 6, listStyleType: "disc" };
  const lk = { color: "#0d7d72", textDecoration: "none", fontWeight: 500 };
  return (
    <div style={{ marginTop: 48 }}>
      <div style={{ fontSize: 14, lineHeight: 1.6, color: "#374151", fontStyle: "italic", background: "#f1f5f9", borderRadius: 10, padding: "16px 20px", marginBottom: 24 }}>
        <strong>PASTABA:</strong> skaičiuoklėje naudojami 2026 m. rodikliai: <strong>VDU 2 312,15 €</strong>, <strong>MMA 1 153 €</strong>. Tikslią mokestinę prievolę rekomenduojame pasitikrinti su buhalteriu arba <a href="https://www.vmi.lt" target="_blank" rel="noopener noreferrer" style={lk}>VMI</a>.
      </div>
      <h2 style={h2}>Mažosios bendrijos mokesčiai 2026 metais</h2>
      <p style={p}>Mažoji bendrija (MB) pirmiausia moka <strong>pelno mokestį</strong>, o likęs pelnas paskirstomas nariams. Konkretūs mokesčiai priklauso nuo pasirinkto išmokėjimo būdo.</p>
      <h3 style={h3}>Pelno mokestis</h3>
      <ul style={ul}>
        <li style={li}><strong>0%</strong> pirmuosius 2 mokestinius laikotarpius (apyvarta iki 300 000 €, iki 10 darbuotojų)</li>
        <li style={li}><strong>7%</strong> lengvatinis tarifas (apyvarta iki 300 000 €, iki 10 darbuotojų)</li>
        <li style={li}><strong>17%</strong> standartinis tarifas</li>
      </ul>
      <h3 style={h3}>Dividendai</h3>
      <p style={p}>Paprasčiausias būdas. Mokami iš paskirstyto pelno, taikomas <strong>fiksuotas 15% GPM</strong>. Sodros įmokos netaikomos. Trūkumas: nėra socialinių garantijų ir dividendai paprastai mokami metų pabaigoje.</p>
      <h3 style={h3}>Civilinė paslaugų sutartis (CPS) / Vadovo atlygis</h3>
      <p style={p}>MB narys-vadovas gauna atlygį pagal civilinę paslaugų sutartį. Iki <strong>12 VDU (27 746 €/metus)</strong> taikomas tik <strong>15% GPM</strong>. CPS yra MB sąnaudos ir mažina pelno mokesčio bazę. Viršijus 12 VDU: 20% (iki 36 VDU), 25% (iki 60 VDU). Metinė riba: 100 000 €. Narys privalo mokėti minimalią PSD įmoką (~80 €/mėn.), bet VSD nemokamas. Plačiau: <a href="https://sodra.lt/imokos/esu-mazosios-bendrijos-narys" target="_blank" rel="noopener noreferrer" style={lk}>Sodros puslapyje</a>.</p>
      <h3 style={h3}>Asmeniniai poreikiai (02 kodas)</h3>
      <p style={p}>Taikomas <strong>progresinis GPM: 20/25/32%</strong>. MB moka VSD (13,83%) ir PSD (6,98%) nuo išmokos dalies. Nuo <strong>2026-07-01</strong> Sodros bazė didėja nuo 50% iki 90% (skaičiuoklėje taikomas 70% metinis vidurkis). Šis būdas brangiausias, bet suteikia VSD ir PSD garantijas <strong>proporcingai išmokų dydžiui ir reguliarumui</strong>.</p>
      <h3 style={h3}>Darbo sutartis</h3>
      <p style={p}>Standartiniai darbo mokesčiai: progresinis GPM su NPD, VSD 12,52%, PSD 6,98%, darbdavio VSD 1,77%. DU yra MB sąnaudos ir mažina pelno mokesčio bazę. Suteikia pilnas socialines garantijas.</p>
      <h2 style={h2}>Koks išmokėjimo būdas optimaliausias?</h2>
      <p style={p}>Kai pelno mokestis <strong>0%</strong>, paprasčiausias ir pigiausias būdas yra <strong>dividendai</strong> (15% GPM, be Sodros). Kai pelno mokestis <strong>7% ar 17%</strong>, optimaliausias variantas dažniausiai yra <strong>CPS</strong> (net viršijus 12 VDU), nes CPS mažina pelno mokesčio bazę ir taip kompensuoja didesnį GPM tarifą. Jei CPS viršija 100 000 € ribą, likutį naudinga paskirstyti kaip dividendus. Svarbu atsižvelgti į individualią situaciją: jei reikia socialinių garantijų, dalį lėšų naudinga išsiimti per darbo sutartį arba asmeniniams poreikiams.</p>
    </div>
  );
});