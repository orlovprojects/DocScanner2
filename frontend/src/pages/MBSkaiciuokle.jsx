import { useState, useMemo, memo } from "react";
import { Helmet } from "react-helmet";

const VDU = 2312.15, MMA = 1153;
const VDU_12 = 12 * VDU, VDU_36 = 36 * VDU, VDU_60 = 60 * VDU;
const SODRA_CAP_MB = 43 * VDU, SODRA_CAP_DU = VDU_60, CPS_MAX = 100000, PVM_RIBA = 45000;
const PSD_MEN = MMA * 0.0698;        // 80.4794 €/mėn
const PSD_METINE = PSD_MEN * 12;     // 965.7528 €/metus

const PM_OPTIONS = [
  { value: "0", label: "0%", sub: "Lengvata pirmiesiems 2 metams", rate: 0 },
  { value: "7", label: "7%", sub: "Pajamos ≤ 300k, ≤ 10 darbuotojų", rate: 0.07 },
  { value: "17", label: "17%", sub: "Pajamos > 300k arba > 10 darbuotojų", rate: 0.17 },
];
const METHOD_OPTIONS = [
  { value: "optimal", label: "⚙ Automatiškai parinkti optimaliausią" },
  { value: "dividendai", label: "Dividendai (15% GPM)" },
  { value: "cps", label: "Civilinė paslaugų sutartis / Vadovo atlygis (15-25% GPM)" },
  { value: "asmeniniai", label: "Asmeniniai poreikiai (20-32% GPM)" },
  { value: "darbo", label: "Darbo sutartis (GPM + VSD + PSD)" },
];

const fmt = (n) => (Number.isFinite(n) ? n : 0).toLocaleString("lt-LT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Icons
const IconCheck = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{flexShrink:0,marginTop:2}}><circle cx="8" cy="8" r="8" fill="#d1faf0"/><path d="M5 8l2 2 4-4" stroke="#065f56" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IconWarn = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{flexShrink:0,marginTop:2}}><path d="M8 1.5l7 13H1l7-13z" fill="#fef3c7" stroke="#b45309" strokeWidth="1"/><text x="8" y="12" textAnchor="middle" fontSize="9" fontWeight="700" fill="#b45309">!</text></svg>;
const IconTip = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{flexShrink:0,marginTop:2}}><circle cx="8" cy="8" r="8" fill="#e0f2fe"/><text x="8" y="12" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0369a1">i</text></svg>;

// GPM
function gpmDiv(a) { return a * 0.15; }
function gpmCPS(a) {
  if (a <= 0) return 0;
  return Math.min(a, VDU_12) * 0.15 + Math.min(Math.max(a - VDU_12, 0), VDU_36 - VDU_12) * 0.20 + Math.min(Math.max(a - VDU_36, 0), VDU_60 - VDU_36) * 0.25;
}
function gpmProg(a) {
  if (a <= 0) return 0;
  return Math.min(a, VDU_36) * 0.20 + Math.min(Math.max(a - VDU_36, 0), VDU_60 - VDU_36) * 0.25 + Math.max(a - VDU_60, 0) * 0.32;
}
function calcNPD(b) { return b <= MMA ? 747 : Math.max(747 - 0.49 * (b - MMA), 0); }

// ═══ Calculations ═══════════════════════════════════════════
// Each returns a normalized result object. "scenario" describes
// the situation in plain language for beginners.

function calcDividendai(pelnas, pmRate, target) {
  const pm = pelnas * pmRate, available = pelnas - pm;
  const amount = target > 0 ? Math.min(target, available) : available;
  const gpm = gpmDiv(amount), iRankas = amount - gpm;
  const pmDalis = available > 0 ? pm * (amount / available) : pm;
  return {
    method: "dividendai", title: "Dividendai",
    pm, pmBase: pelnas, pmDalis, amount, gpm, vsd: 0, psd: 0, employerVSD: 0, pensija: 0,
    iRankas, totalTax: pmDalis + gpm,
    mokestineNasta: amount > 0 ? ((pmDalis + gpm) / amount) * 100 : 0,
    scenario: "Pelnas paskirstomas metų pabaigoje. Tinka, jei socialinį draudimą jau turite kitur.",
    pros: ["Mažiausias mokestis: tik pelno mokestis + 15% GPM", "Paprasta administruoti, nereikia Sodros ataskaitų", "GPM tarifas fiksuotas, nepriklauso nuo sumos"],
    cons: ["Jokių socialinių garantijų (nei VSD, nei PSD)", "Mokami tik iš paskirstyto pelno (metų pabaigoje)", `Jei neturite PSD iš kito šaltinio, turėsite mokėti savarankiškai: ${fmt(PSD_METINE)} €/metus (${fmt(PSD_MEN)} €/mėn.)`],
    tip: "Tinka, kai esate draustas PSD ir VSD kitur (pvz., dirbate pagal darbo sutartį kitoje įmonėje).",
  };
}

function calcCPS(pelnas, pmRate, target) {
  const maxCPS = Math.min(CPS_MAX, Math.max(pelnas - PSD_METINE, 0));
  const amount = target > 0 ? Math.min(target, maxCPS) : maxCPS;
  const remPelnas = Math.max(pelnas - amount - PSD_METINE, 0);
  const pm = remPelnas * pmRate, gpm = gpmCPS(amount), iRankas = amount - gpm;
  const totalTax = pm + gpm + PSD_METINE;
  const reikiaPVM = amount > PVM_RIBA;
  return {
    method: "cps", title: "Civilinė paslaugų sutartis (Vadovo atlygis)",
    pm, pmBase: remPelnas, amount, gpm, vsd: 0, psd: PSD_METINE, employerVSD: 0, pensija: 0,
    iRankas, totalTax, reikiaPVM,
    mokestineNasta: amount > 0 ? (totalTax / amount) * 100 : 0,
    scenario: reikiaPVM
      ? "Atlygis viršija 45 000 € per metus, todėl vadovas (fizinis asmuo) turės registruotis PVM mokėtoju."
      : "Atlygis neviršija 45 000 € per metus, todėl PVM registracija nereikalinga.",
    pros: ["15% GPM iki 12 VDU (27 745,80 €/metus)", "Mažina pelno mokesčio bazę (CPS yra MB sąnaudos)", "Galima išmokėti kas mėnesį", `Privalomasis sveikatos draudimas (PSD ${fmt(PSD_MEN)} €/mėn.)`],
    cons: ["VSD nemokamas: nekaupiamas stažas pensijai", "Nėra ligos, motinystės, tėvystės išmokų", "Viršijus 12 VDU, GPM didėja iki 20-25%", "Metinė riba: 100 000 €"],
    tip: "Tinka daugumai MB narių: mažas GPM, lankstus išmokėjimas, CPS mažina pelno mokesčio bazę.",
  };
}

function calcAsmeniniai(pelnas, pmRate, target) {
  const pm = pelnas * pmRate, postPM = pelnas - pm;
  const SF = 0.70, VR = 0.1383, PR = 0.0698;
  const maxAmt = postPM / (1 + SF * (VR + PR));
  const amount = target > 0 ? Math.min(target, maxAmt) : maxAmt;
  const sb = Math.min(amount * SF, SODRA_CAP_MB);
  const vsd = sb * VR, psd = sb * PR, gpm = gpmProg(amount), iRankas = amount - gpm;
  const pmDalis = postPM > 0 ? pm * ((amount + vsd + psd) / postPM) : pm;
  const taxOn = pmDalis + gpm + vsd + psd;
  return {
    method: "asmeniniai", title: "Asmeniniai poreikiai",
    pm, pmBase: pelnas, pmDalis, amount, gpm, vsd, psd, employerVSD: 0, pensija: 0,
    iRankas, totalTax: taxOn,
    mokestineNasta: amount > 0 ? (taxOn / amount) * 100 : 0,
    scenario: "Lėšos išsiimamos bet kada, o MB sumoka VSD ir PSD: kaupiasi pensijos stažas ir galioja sveikatos draudimas.",
    pros: ["VSD mokamas: kaupiamas pensijos stažas", "PSD mokamas: privalomasis sveikatos draudimas", "Galima išsiimti bet kada, lanksčios sąlygos"],
    cons: ["Didžiausia mokestinė našta (GPM + Sodra + PM)", "Progresinis GPM: 20%, viršijus 36 VDU: 25%, 60 VDU: 32%", "Nuo 2026-07-01 Sodros bazė didėja nuo 50% iki 90%", "Garantijos proporcingos išmokų dydžiui ir reguliarumui"],
    tip: "Tinka, kai reikia socialinių garantijų ir neplanuojate darbo santykių kitoje įmonėje.",
  };
}

function calcDarbo(pelnas, pmRate, target, pen3, drPSD) {
  const maxB = pelnas / 1.0177, bruto = target > 0 ? Math.min(target, maxB) : maxB;
  const eVSD = bruto * 0.0177, remP = Math.max(pelnas - bruto - eVSD, 0), pm = remP * pmRate;
  const npd = calcNPD(bruto), taxable = Math.max(bruto - npd, 0);
  const gpm = gpmProg(taxable), vsd = Math.min(bruto, SODRA_CAP_DU) * 0.1252;
  const psd = drPSD ? 0 : bruto * 0.0698, pensija = pen3 ? bruto * 0.03 : 0;
  const iRankas = bruto - gpm - vsd - psd - pensija;
  const totalTax = pm + gpm + vsd + psd + pensija + eVSD;
  return {
    method: "darbo", title: "Darbo sutartis",
    pm, pmBase: remP, amount: bruto, gpm, vsd, psd, pensija, employerVSD: eVSD, npd,
    iRankas, totalTax,
    mokestineNasta: bruto > 0 ? (totalTax / bruto) * 100 : 0,
    scenario: "Įprasti darbo santykiai su MB: pilnos socialinės garantijos, bet didžiausi mokesčiai.",
    pros: ["Pilnos socialinės garantijos (VSD + PSD + pensija)", "DU mažina pelno mokesčio bazę", "Reguliarus, nuspėjamas atlygis", "Taikomas NPD (neapmokestinamasis pajamų dydis)"],
    cons: ["Didžiausia Sodros įmokų suma", "Darbdavys (MB) papildomai moka 1,77% VSD", "Progresinis GPM: 20/25/32%"],
    tip: "Tinka, kai norima pilnų socialinių garantijų ir DU efektyviai mažina pelno mokestį.",
  };
}

function calcCombo(pelnas, pmRate, target, cpsLimit) {
  const maxCPS = Math.min(cpsLimit, Math.max(pelnas - PSD_METINE, 0));
  const totalT = target > 0 ? target : pelnas;
  const cpsAmt = Math.min(maxCPS, totalT);
  const mbExp = cpsAmt + PSD_METINE, pAfterCPS = Math.max(pelnas - mbExp, 0);
  const pm = pAfterCPS * pmRate, availDiv = pAfterCPS - pm;
  const remT = target > 0 ? Math.max(totalT - cpsAmt, 0) : availDiv;
  const divAmt = Math.min(Math.max(remT, 0), Math.max(availDiv, 0));
  const gC = gpmCPS(cpsAmt), gD = gpmDiv(divAmt);
  const iRankas = (cpsAmt - gC) + (divAmt - gD);
  const totalPay = cpsAmt + divAmt, totalTax = pm + gC + gD + PSD_METINE;
  const bePVM = cpsLimit <= PVM_RIBA;
  return {
    method: "combo_" + cpsLimit,
    title: bePVM ? "CPS (iki 45 000 €) + Dividendai" : "CPS + Dividendai",
    pm, pmBase: pAfterCPS,
    cpsPart: { amount: cpsAmt, gpm: gC, iRankas: cpsAmt - gC },
    divPart: { amount: divAmt, gpm: gD, iRankas: divAmt - gD },
    amount: totalPay, psd: PSD_METINE, vsd: 0, gpm: gC + gD, employerVSD: 0, pensija: 0,
    iRankas, totalTax, reikiaPVM: cpsAmt > PVM_RIBA,
    mokestineNasta: totalPay > 0 ? (totalTax / totalPay) * 100 : 0,
    scenario: bePVM
      ? "CPS apribojamas iki 45 000 €, kad vadovui (fiziniam asmeniui) nereikėtų registruotis PVM mokėtoju. Likutis paskirstomas dividendais."
      : cpsAmt > PVM_RIBA
        ? "CPS viršija 45 000 €, todėl vadovas (fizinis asmuo) turės registruotis PVM mokėtoju. Likutis paskirstomas dividendais."
        : "CPS atlygis kas mėnesį, o likęs pelnas paskirstomas dividendais metų pabaigoje.",
    pros: ["CPS mažina pelno mokesčio bazę, dividendai be Sodros", bePVM ? "Vadovui nereikia registruotis PVM mokėtoju" : "Maksimaliai išnaudojamas mažas CPS GPM tarifas", `Privalomasis sveikatos draudimas (PSD ${fmt(PSD_MEN)} €/mėn.)`],
    cons: ["VSD nekaupiamas (socialinės garantijos tik PSD)", "Dividendai mokami tik metų pabaigoje"],
    tip: bePVM ? "Geriausias balansas, kai nenorite PVM registracijos: CPS iki 45 000 €, likutis dividendais." : "Optimaliausias variantas daugumai: CPS kas mėnesį, likutis kaip dividendai.",
    isCombo: true,
  };
}

// ═══ Colors ═════════════════════════════════════════════════
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
  const [showTooltip, setShowTooltip] = useState(null);

  const handleNum = (s) => (e) => {
    const v = e.target.value; if (v === "") { s(""); return; }
    const c = v.replace(",", "."); if (!/^\d*\.?\d*$/.test(c)) return;
    const n = Number(c); if (!Number.isNaN(n) && n >= 0) s(n);
  };

  const pajamosNum = Number(pajamos) || 0;
  const pmForced = pajamosNum > 300000;
  const pmRateEffective = pmForced ? "17" : pmRate;
  const pmRateNum = PM_OPTIONS.find(o => o.value === pmRateEffective)?.rate ?? 0.07;
  const pelnas = Math.max(pajamosNum - (Number(sanaudos) || 0), 0);
  const target = Number(ismokejimas) || 0;

  const maxForMethod = method === "cps" ? Math.min(CPS_MAX, pelnas) : pelnas;
  const validationError = target > 0 && target > maxForMethod
    ? method === "cps" && target > CPS_MAX ? `CPS metinė riba: ${fmt(CPS_MAX)} €` : `Suma viršija pelną: ${fmt(pelnas)} €`
    : null;

  const results = useMemo(() => {
    if (pelnas <= 0) return null;
    const t = validationError ? 0 : target;
    const all = [
      calcDividendai(pelnas, pmRateNum, t),
      calcCPS(pelnas, pmRateNum, t),
      calcAsmeniniai(pelnas, pmRateNum, t),
      calcDarbo(pelnas, pmRateNum, t, pensija3, draustasPSD),
    ];
    // For auto mode: don't include standalone CPS (combo covers it properly)
    const autoItems = [
      calcDividendai(pelnas, pmRateNum, t),
      calcAsmeniniai(pelnas, pmRateNum, t),
      calcDarbo(pelnas, pmRateNum, t, pensija3, draustasPSD),
    ];
    const combo = calcCombo(pelnas, pmRateNum, t, CPS_MAX);
    autoItems.push(combo);
    const comboNoPVM = calcCombo(pelnas, pmRateNum, t, PVM_RIBA);
    if (comboNoPVM.cpsPart.amount < combo.cpsPart.amount) autoItems.push(comboNoPVM);
    const ranked = autoItems.sort((a, b) => b.iRankas - a.iRankas);
    return { all, ranked };
  }, [pelnas, pmRateNum, target, pensija3, draustasPSD, method, validationError]);

  // Styles
  const card = { background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: "28px", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)" };
  const cardTitle = { fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: C.textSec, marginBottom: 20 };
  const lbl = { display: "block", fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 6 };
  const inp = { width: "100%", padding: "12px 14px", fontSize: 16, border: `1.5px solid ${C.border}`, borderRadius: 10, outline: "none", background: "#f9fafb", color: C.text, boxSizing: "border-box" };
  const sel = { ...inp, cursor: "pointer", appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23374151' stroke-width='2' fill='none'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center", paddingRight: 36 };
  const chkRow = { display: "flex", alignItems: "center", gap: 10, padding: "10px 0", cursor: "pointer", userSelect: "none" };
  const chkBox = (on) => ({ width: 20, height: 20, borderRadius: 6, border: `2px solid ${on ? C.accent : "#9ca3af"}`, background: on ? C.accent : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 });
  const Chk = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  const QMark = ({ id, items }) => (
    <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: "#e2e8f0", color: C.textSec, fontSize: 11, fontWeight: 700, cursor: "pointer", marginLeft: 6, position: "relative" }}
      onMouseEnter={() => setShowTooltip(id)} onMouseLeave={() => setShowTooltip(null)} onClick={() => setShowTooltip(showTooltip === id ? null : id)}>?
      {showTooltip === id && <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", background: "#111827", color: "#fff", padding: "14px 16px", borderRadius: 12, fontSize: 13, lineHeight: 1.5, width: 280, zIndex: 100, boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}>{items.map((t, i) => <div key={i} style={{ marginBottom: 3 }}>{t}</div>)}</div>}
    </div>
  );
  const focusA = (e) => { e.target.style.borderColor = C.accent; };
  const blurB = (e) => { e.target.style.borderColor = C.border; };
  const singleResult = useMemo(() => { if (!results || method === "optimal") return null; return results.all.find(r => r.method === method); }, [results, method]);

  return (
    <div style={{ fontFamily: "'DM Sans','Satoshi',system-ui,sans-serif", background: C.bg, minHeight: "100vh", color: C.text, padding: "0 16px 80px" }}>
      <Helmet>
        <title>MB skaičiuoklė 2026 (Mokesčių palyginimai) - DokSkenas</title>
        <meta name="description" content="Apskaičiuokite MB mokesčius 2026 metams. Pagal įvestas sumas sistema suras optimaliausią pinigų išmokėjimo būdą." />
        <link rel="canonical" href="https://atlyginimoskaiciuokle.com/mazoji-bendrija" />
        <script type="application/ld+json">{JSON.stringify({"@context":"https://schema.org","@type":"WebApplication","name":"Mažosios bendrijos skaičiuoklė 2026","url":"https://atlyginimoskaiciuokle.com/mazoji-bendrija","applicationCategory":"FinanceApplication","operatingSystem":"All","offers":{"@type":"Offer","price":"0","priceCurrency":"EUR"},"inLanguage":"lt"})}</script>
        <script type="application/ld+json">{JSON.stringify({"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Kokie mokesčiai taikomi mažajai bendrijai 2026 metais?","acceptedAnswer":{"@type":"Answer","text":"MB moka pelno mokestį (0%, 7% arba 17%), o nariai: GPM (15-32%), VSD ir PSD įmokas, priklausomai nuo išmokėjimo būdo."}},{"@type":"Question","name":"Koks MB pelno mokesčio tarifas 2026 metais?","acceptedAnswer":{"@type":"Answer","text":"0% pirmuosius 2 metus, 7% kai apyvarta iki 300 000 € ir iki 10 darbuotojų, 17% standartinis tarifas."}},{"@type":"Question","name":"Kaip MB narys gali išsiimti pinigus?","acceptedAnswer":{"@type":"Answer","text":"4 būdais: dividendais (15% GPM), CPS/vadovo atlygiu (15-25% GPM), asmeniniams poreikiams (20-32% GPM + Sodra), arba pagal darbo sutartį."}},{"@type":"Question","name":"Kada MB vadovas turi registruotis PVM mokėtoju?","acceptedAnswer":{"@type":"Answer","text":"Kai vadovo atlygis pagal CPS viršija 45 000 € per metus. Jei MB yra PVM mokėtoja, PVM yra atskaitomas ir papildomų kaštų nesukelia."}}]})}</script>
        <script type="application/ld+json">{JSON.stringify({"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Pradžia","item":"https://atlyginimoskaiciuokle.com"},{"@type":"ListItem","position":2,"name":"MB skaičiuoklė 2026","item":"https://atlyginimoskaiciuokle.com/mazoji-bendrija"}]})}</script>
      </Helmet>

      <div style={{ maxWidth: 1080, margin: "0 auto", paddingTop: 40 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>Mažosios bendrijos skaičiuoklė 2026</h1>
        <p style={{ fontSize: 15, color: C.textSec, marginTop: 8, marginBottom: 32 }}>Apskaičiuokite mokesčius ir palyginkite skirtingus pinigų išmokėjimo būdus iš MB.</p>
        <style>{`@media(min-width:768px){.mb-grid{grid-template-columns:1fr 1fr!important}}`}</style>
        <div className="mb-grid" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 24 }}>
          {/* LEFT */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={card}>
              <div style={cardTitle}>MB duomenys</div>
              <div style={{ marginBottom: 20 }}><label style={lbl}>Pajamos per metus (€)</label><input type="text" inputMode="decimal" style={inp} value={pajamos} onChange={handleNum(setPajamos)} placeholder="Metinės pajamos" onFocus={focusA} onBlur={blurB} /></div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}><label style={{ ...lbl, marginBottom: 0 }}>Sąnaudos per metus (€)</label><QMark id="san" items={["Neįtraukiant MB vadovo atlygio ar kitų išmokų nariams.", "Įveskite tik veiklos sąnaudas: nuoma, paslaugos, medžiagos."]} /></div>
                <input type="text" inputMode="decimal" style={inp} value={sanaudos} onChange={handleNum(setSanaudos)} placeholder="Metinės sąnaudos" onFocus={focusA} onBlur={blurB} />
              </div>
              {pelnas > 0 && <div style={{ background: C.greenBg, borderRadius: 10, padding: "10px 14px", fontSize: 14, fontWeight: 600, color: C.green, marginBottom: 20 }}>Pelnas: {fmt(pelnas)} €</div>}
              <div style={{ marginBottom: 20 }}>
                <label style={lbl}>Pelno mokesčio tarifas</label>
                <select style={{ ...sel, ...(pmForced ? { opacity: 0.5, pointerEvents: "none", background: "#e5e7eb" } : {}) }} value={pmRateEffective} onChange={e => setPmRate(e.target.value)} disabled={pmForced}>{PM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} ({o.sub})</option>)}</select>
                {pmForced && <div style={{ color: "#b45309", fontSize: 13, marginTop: 4 }}>Pajamos viršija 300 000 €, taikomas 17% tarifas visam pelnui</div>}
              </div>
              <div style={{ marginBottom: 20 }}><label style={lbl}>Pinigų išmokėjimo būdas</label><select style={sel} value={method} onChange={e => setMethod(e.target.value)}>{METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
              <div style={{ marginBottom: 8 }}>
                <label style={lbl}>Išmokėjimo suma per metus, iki mokesčių (€)</label>
                <input type="text" inputMode="decimal" style={{ ...inp, borderColor: validationError ? C.red : C.border }} value={ismokejimas} onChange={handleNum(setIsmokejimas)} placeholder="Tuščia = visas pelnas" onFocus={focusA} onBlur={blurB} />
                {validationError && <div style={{ color: C.red, fontSize: 13, marginTop: 4 }}>{validationError}</div>}
              </div>
            </div>
            {method === "darbo" && (
              <div style={card}><div style={cardTitle}>Darbo sutarties nustatymai</div>
                <div style={chkRow} onClick={() => setPensija3(!pensija3)}><div style={chkBox(pensija3)}>{pensija3 && <Chk />}</div><span style={{ fontSize: 14, fontWeight: 500 }}>Papildomas pensijos kaupimas (3%)</span></div>
                <div style={{ display: "flex", alignItems: "center" }}><div style={chkRow} onClick={() => setDraustasPSD(!draustasPSD)}><div style={chkBox(draustasPSD)}>{draustasPSD && <Chk />}</div><span style={{ fontSize: 14, fontWeight: 500 }}>Draustas (-a) PSD valstybės lėšomis</span></div><QMark id="psd" items={["PSD mokėti nereikia, jei:","• Dirbate pagal darbo sutartį kitoje įmonėje","• Esate studentas (-ė)","• Esate vaiko priežiūros atostogose","• Esate registruotas (-a) bedarbis (-ė)","• Esate pensininkas (-ė)"]} /></div>
              </div>
            )}
          </div>
          {/* RIGHT */}
          <div>
            {!results ? <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: C.textSec, fontSize: 15 }}>Įveskite pajamas, kad pamatytumėte rezultatus</div>
            : method === "optimal" ? <OptimalView results={results} pelnas={pelnas} />
            : singleResult ? <SingleCard r={singleResult} pelnas={pelnas} />
            : null}
          </div>
        </div>
        <InfoSection />
      </div>
    </div>
  );
}

// ═══ Single method card ═════════════════════════════════════
const SingleCard = memo(function SingleCard({ r, pelnas }) {
  const row = { display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.border}`, fontSize: 15 };
  const vl = { fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  return (
    <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: "28px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: C.textSec, marginBottom: 12 }}>{r.title}</div>
      {r.scenario && <ScenarioBox r={r} />}
      <DetailRows r={r} pelnas={pelnas} s={row} v={vl} />
      <Totals r={r} />
      <ProsCons pros={r.pros} cons={r.cons} tip={r.tip} />
    </div>
  );
});

// Scenario box: plain-language situation summary
function ScenarioBox({ r }) {
  const isPVM = r.reikiaPVM;
  return (
    <div style={{
      marginBottom: 16, padding: "10px 14px", borderRadius: 10, fontSize: 13.5, lineHeight: 1.55,
      background: isPVM ? C.goldBg : "#f8fafc",
      border: `1px solid ${isPVM ? "#fde68a" : C.border}`,
      color: isPVM ? "#92400e" : C.textSec,
      display: "flex", gap: 8,
    }}>
      {isPVM ? <IconWarn /> : <IconTip />}
      <span>{r.scenario}</span>
    </div>
  );
}

function DetailRows({ r, pelnas, s, v }) {
  const isDU = r.method === "darbo", lb = { color: C.textSec };
  const pmB = r.pmBase !== undefined ? r.pmBase : pelnas;
  const pmPct = pmB > 0 && r.pm > 0 ? `${((r.pm / pmB) * 100).toFixed(0)}%` : "0%";
  const pmLbl = pmB !== pelnas && pmB > 0 ? `Pelno mokestis (${pmPct} nuo ${fmt(pmB)} €)` : `Pelno mokestis (${pmPct})`;
  return <>
    <div style={s}><span style={lb}>Pelnas</span><span style={v}>{fmt(pelnas)} €</span></div>
    {r.pm > 0 && <div style={s}><span style={lb}>{pmLbl}</span><span style={v}>{fmt(r.pm)} €</span></div>}
    {isDU && r.employerVSD > 0 && <div style={s}><span style={lb}>Darbdavio VSD (1,77%)</span><span style={v}>{fmt(r.employerVSD)} €</span></div>}
    <div style={{ ...s, fontWeight: 600 }}><span>Išmokėjimo suma (bruto)</span><span style={v}>{fmt(r.amount)} €</span></div>
    {r.gpm > 0 && <div style={s}><span style={lb}>GPM{r.method === "dividendai" ? " (15%)" : ""}</span><span style={v}>{fmt(r.gpm)} €</span></div>}
    {r.vsd > 0 && <div style={s}><span style={lb}>VSD{isDU ? " (12,52%)" : " (13,83%, moka MB)"}</span><span style={v}>{fmt(r.vsd)} €</span></div>}
    {r.psd > 0 && <div style={s}><span style={lb}>PSD{isDU ? " (6,98%)" : r.method === "cps" || r.isCombo ? ` (${fmt(PSD_MEN)} €/mėn.)` : " (6,98%, moka MB)"}</span><span style={v}>{fmt(r.psd)} €</span></div>}
    {r.pensija > 0 && <div style={s}><span style={lb}>Papildoma pensija (3%)</span><span style={v}>{fmt(r.pensija)} €</span></div>}
  </>;
}

function Totals({ r }) {
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
      <span style={{ display: "inline-block", background: C.goldBg, color: C.gold, borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600 }}>Efektyvus tarifas: {r.mokestineNasta.toFixed(1)}%</span>
    </div>
  </>;
}

// ═══ Optimal view ═══════════════════════════════════════════
const OptimalView = memo(function OptimalView({ results, pelnas }) {
  const { ranked } = results;
  const labeled = ranked.map((r, i) => {
    const isFirst = i === 0, isLast = i === ranked.length - 1;
    let badge;
    if (isFirst) badge = { text: "Geriausias pasirinkimas", color: "#fff", bg: C.accent };
    else if (isLast) badge = { text: "Didžiausi mokesčiai", color: C.red, bg: C.redBg };
    else if (r.method.startsWith("combo_45000")) badge = { text: "Be PVM registracijos", color: C.blue, bg: C.blueBg };
    else if (r.method === "cps" || r.method.startsWith("combo_")) badge = { text: "Maži mokesčiai + PSD", color: C.blue, bg: C.blueBg };
    else if (r.method === "asmeniniai") badge = { text: "Jei reikia soc. garantijų", color: C.purple, bg: C.purpleBg };
    else if (r.method === "darbo") badge = { text: "Pilnos soc. garantijos", color: C.purple, bg: C.purpleBg };
    else badge = { text: "Paprasčiausias būdas", color: C.textSec, bg: "#f1f5f9" };
    return { ...r, badge };
  });
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{labeled.map((r, i) => <CompactCard key={r.method} r={r} pelnas={pelnas} isBest={i === 0} />)}</div>;
});

function CompactCard({ r, pelnas, isBest }) {
  const [expanded, setExpanded] = useState(isBest);
  return (
    <div style={{ background: C.card, borderRadius: 14, border: `${isBest ? "2px" : "1px"} solid ${isBest ? C.accent : C.border}`, padding: "18px 20px", cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        {r.badge && <span style={{ background: r.badge.bg, color: r.badge.color, borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{r.badge.text}</span>}
        <span style={{ fontSize: 16, fontWeight: 700 }}>{r.title}</span>
      </div>
      {/* Scenario: plain-language explanation */}
      {r.scenario && <ScenarioBox r={r} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 10, border: `1px solid ${isBest ? C.accent : C.border}`, background: isBest ? C.greenBg : "#fff" }}>
        <span style={{ fontSize: 14, color: C.textSec }}>Į rankas</span>
        <span style={{ fontSize: 22, fontWeight: 700, color: isBest ? C.green : C.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmt(r.iRankas)} €</span>
      </div>
      <div style={{ marginTop: 8, fontSize: 13, color: C.textSec }}>Mokesčiai: {fmt(r.totalTax)} € · Efektyvus tarifas: {r.mokestineNasta.toFixed(1)}%</div>
      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
          {r.isCombo ? <ComboDetail r={r} pelnas={pelnas} /> : <CompactDetail r={r} pelnas={pelnas} />}
          <ProsCons pros={r.pros} cons={r.cons} tip={r.tip} />
        </div>
      )}
      {!expanded && <div style={{ fontSize: 12, color: C.textSec, marginTop: 4 }}>Spauskite, kad pamatytumėte detales ▾</div>}
    </div>
  );
}

function CompactDetail({ r, pelnas }) {
  const s = { display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 14 };
  const lb = { color: C.textSec }, vl = { fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const isDU = r.method === "darbo";
  const pmB = r.pmBase !== undefined ? r.pmBase : pelnas;
  const pmLbl = pmB !== pelnas && pmB > 0 && r.pm > 0 ? `PM (${((r.pm / pmB) * 100).toFixed(0)}% nuo ${fmt(pmB)} €)` : `PM (${pmB > 0 && r.pm > 0 ? ((r.pm / pmB) * 100).toFixed(0) : 0}%)`;
  return <div>
    <div style={s}><span style={lb}>Pelnas</span><span style={vl}>{fmt(pelnas)} €</span></div>
    {r.pm > 0 && <div style={s}><span style={lb}>{pmLbl}</span><span style={vl}>{fmt(r.pm)} €</span></div>}
    {isDU && r.employerVSD > 0 && <div style={s}><span style={lb}>Darbdavio VSD (1,77%)</span><span style={vl}>{fmt(r.employerVSD)} €</span></div>}
    <div style={{ ...s, fontWeight: 600 }}><span>Bruto</span><span style={vl}>{fmt(r.amount)} €</span></div>
    {r.gpm > 0 && <div style={s}><span style={lb}>GPM{r.method === "dividendai" ? " (15%)" : ""}</span><span style={vl}>{fmt(r.gpm)} €</span></div>}
    {r.vsd > 0 && <div style={s}><span style={lb}>VSD{isDU ? " (12,52%)" : " (13,83%)"}</span><span style={vl}>{fmt(r.vsd)} €</span></div>}
    {r.psd > 0 && <div style={s}><span style={lb}>PSD{isDU ? " (6,98%)" : r.method === "cps" ? ` (${fmt(PSD_MEN)} €/mėn.)` : " (6,98%)"}</span><span style={vl}>{fmt(r.psd)} €</span></div>}
    {r.pensija > 0 && <div style={s}><span style={lb}>Pensija (3%)</span><span style={vl}>{fmt(r.pensija)} €</span></div>}
  </div>;
}

function ComboDetail({ r, pelnas }) {
  const s = { display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 14 };
  const lb = { color: C.textSec }, vl = { fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const sec = { fontSize: 13, fontWeight: 700, color: C.accent, marginTop: 10, marginBottom: 4 };
  const pmB = r.pmBase || pelnas;
  return <div>
    <div style={s}><span style={lb}>Pelnas</span><span style={vl}>{fmt(pelnas)} €</span></div>
    <div style={sec}>CPS dalis ({r.cpsPart.amount <= VDU_12 ? "15" : "15-25"}% GPM)</div>
    <div style={s}><span style={lb}>CPS suma</span><span style={vl}>{fmt(r.cpsPart.amount)} €</span></div>
    <div style={s}><span style={lb}>GPM</span><span style={vl}>{fmt(r.cpsPart.gpm)} €</span></div>
    <div style={s}><span style={lb}>PSD (priklauso CPS, {fmt(PSD_MEN)} €/mėn.)</span><span style={vl}>{fmt(r.psd)} €</span></div>
    <div style={s}><span style={{ ...lb, color: C.green }}>Į rankas (CPS)</span><span style={{ ...vl, color: C.green }}>{fmt(r.cpsPart.iRankas)} €</span></div>
    {r.divPart.amount > 0 && <>
      <div style={sec}>Dividendų dalis (15% GPM)</div>
      <div style={s}><span style={lb}>PM nuo likučio ({pmB > 0 && r.pm > 0 ? ((r.pm / pmB) * 100).toFixed(0) + "%" : "0%"})</span><span style={vl}>{fmt(r.pm)} €</span></div>
      <div style={s}><span style={lb}>Dividendai</span><span style={vl}>{fmt(r.divPart.amount)} €</span></div>
      <div style={s}><span style={lb}>GPM (15%)</span><span style={vl}>{fmt(r.divPart.gpm)} €</span></div>
      <div style={s}><span style={{ ...lb, color: C.green }}>Į rankas (dividendai)</span><span style={{ ...vl, color: C.green }}>{fmt(r.divPart.iRankas)} €</span></div>
    </>}
    {r.pvmWarning && <div style={{ margin: "6px 0", padding: "6px 10px", background: "#fef3c7", borderRadius: 8, fontSize: 12, color: "#92400e", display: "flex", gap: 6 }}><IconWarn /><span>CPS viršija 45 000 €. Vadovas (fizinis asmuo) privalo registruotis PVM mokėtoju.</span></div>}
  </div>;
}

function ProsCons({ pros, cons, tip }) {
  return <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.7 }}>
    {pros.map((p, i) => <div key={`p${i}`} style={{ display: "flex", gap: 8, color: C.green, marginBottom: 3 }}><IconCheck /><span>{p}</span></div>)}
    {cons.map((c, i) => <div key={`c${i}`} style={{ display: "flex", gap: 8, color: "#b45309", marginBottom: 3 }}><IconWarn /><span>{c}</span></div>)}
    {tip && <div style={{ marginTop: 8, padding: "8px 12px", background: C.blueBg, borderRadius: 8, display: "flex", gap: 8, color: C.blue, fontSize: 13 }}><IconTip /><span>{tip}</span></div>}
  </div>;
}

// ═══ Info ═══════════════════════════════════════════════════
const InfoSection = memo(function InfoSection() {
  const h2 = { fontSize: 22, fontWeight: 700, color: "#111827", marginTop: 48, marginBottom: 12 };
  const h3 = { fontSize: 20, fontWeight: 700, color: "#111827", marginTop: 32, marginBottom: 10 };
  const p = { fontSize: 15, lineHeight: 1.75, color: "#374151", marginBottom: 14 };
  const ul = { paddingLeft: 24, marginBottom: 16, listStyleType: "disc" };
  const li = { fontSize: 15, lineHeight: 1.75, color: "#374151", marginBottom: 6, listStyleType: "disc" };
  const lk = { color: "#0d7d72", textDecoration: "none", fontWeight: 500 };
  return <div style={{ marginTop: 48 }}>
    <div style={{ fontSize: 14, lineHeight: 1.6, color: "#374151", fontStyle: "italic", background: "#f1f5f9", borderRadius: 10, padding: "16px 20px", marginBottom: 24 }}>
      <strong>PASTABA:</strong> skaičiuoklėje naudojami 2026 m. rodikliai: <strong>VDU 2 312,15 €</strong>, <strong>MMA 1 153 €</strong>. Tikslią mokestinę prievolę rekomenduojame pasitikrinti su buhalteriu arba <a href="https://www.vmi.lt" target="_blank" rel="noopener noreferrer" style={lk}>VMI</a>.
    </div>
    <h2 style={h2}>Mažosios bendrijos mokesčiai 2026 metais</h2>
    <p style={p}>Mažoji bendrija (MB) pirmiausia moka <strong>pelno mokestį</strong>, o likęs pelnas paskirstomas nariams. Konkretūs mokesčiai priklauso nuo pasirinkto išmokėjimo būdo.</p>
    <h3 style={h3}>Pelno mokestis</h3>
    <ul style={ul}>
      <li style={li}><strong>0%</strong> pirmuosius 2 mokestinius laikotarpius (apyvarta iki 300 000 €, iki 10 darbuotojų)</li>
      <li style={li}><strong>7%</strong> lengvatinis tarifas (apyvarta iki 300 000 €, iki 10 darbuotojų)</li>
      <li style={li}><strong>17%</strong> standartinis tarifas (jei pajamos viršija 300 000 € arba daugiau nei 10 darbuotojų, taikomas visam pelnui)</li>
    </ul>
    <h3 style={h3}>Dividendai</h3>
    <p style={p}>Paprasčiausias būdas. Mokami iš paskirstyto pelno, taikomas <strong>fiksuotas 15% GPM</strong>. Sodros įmokos netaikomos. Trūkumas: nėra socialinių garantijų ir dividendai paprastai mokami metų pabaigoje.</p>
    <h3 style={h3}>Civilinė paslaugų sutartis (CPS) / Vadovo atlygis</h3>
    <p style={p}>MB narys-vadovas gauna atlygį pagal civilinę paslaugų sutartį. Iki <strong>12 VDU (27 745,80 €/metus)</strong> taikomas tik <strong>15% GPM</strong>. CPS yra MB sąnaudos ir mažina pelno mokesčio bazę. Viršijus 12 VDU: 20% (iki 36 VDU), 25% (iki 60 VDU). Metinė riba: 100 000 €. Narys privalo mokėti PSD įmoką ({fmt(PSD_MEN)} €/mėn.), bet VSD nemokamas. Viršijus <strong>45 000 €</strong> per metus, vadovas (fizinis asmuo) privalo registruotis PVM mokėtoju: jei MB yra PVM mokėtoja, PVM atskaitomas ir papildomų kaštų nesukelia. Plačiau: <a href="https://sodra.lt/imokos/esu-mazosios-bendrijos-narys" target="_blank" rel="noopener noreferrer" style={lk}>Sodros puslapyje</a>.</p>
    <h3 style={h3}>Asmeniniai poreikiai (02 kodas)</h3>
    <p style={p}>Taikomas <strong>progresinis GPM: 20/25/32%</strong>. MB moka VSD (13,83%) ir PSD (6,98%) nuo išmokos dalies. Nuo <strong>2026-07-01</strong> Sodros bazė didėja nuo 50% iki 90% (skaičiuoklėje taikomas 70% metinis vidurkis). Šis būdas suteikia VSD ir PSD garantijas <strong>proporcingai išmokų dydžiui ir reguliarumui</strong>.</p>
    <h3 style={h3}>Darbo sutartis</h3>
    <p style={p}>Standartiniai darbo mokesčiai: progresinis GPM su NPD, VSD 12,52%, PSD 6,98%, darbdavio VSD 1,77%. DU yra MB sąnaudos ir mažina pelno mokesčio bazę. Suteikia pilnas socialines garantijas.</p>
    <h2 style={h2}>Koks išmokėjimo būdas optimaliausias?</h2>
    <p style={p}>Kai pelno mokestis <strong>0%</strong>, paprasčiausias ir pigiausias būdas yra <strong>dividendai</strong> (15% GPM, be Sodros). Kai pelno mokestis <strong>7% ar 17%</strong>, optimaliausias variantas dažniausiai yra <strong>CPS</strong> (net viršijus 12 VDU), nes CPS mažina pelno mokesčio bazę. Jei CPS viršija 100 000 € ribą, likutį naudinga paskirstyti kaip dividendus. Jei nenorite, kad vadovas registruotųsi PVM mokėtoju, CPS galima apriboti iki 45 000 €, o likutį paskirstyti dividendais.</p>
  </div>;
});