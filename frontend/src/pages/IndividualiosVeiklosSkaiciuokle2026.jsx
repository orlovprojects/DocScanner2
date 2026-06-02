import { useState, useMemo, memo } from "react";
import { Helmet } from "react-helmet";

// ═══════════════════════════════════════════════════════════════
//  Individualios veiklos skaičiuoklė 2026
//  ✅ GPM su mokesčio kreditu (5%→20%) iki 42500 €
//  ✅ Progresiniai GPM tarifai (20/25/32%) virš 42500 €
//  ✅ VSD 12.52% nuo 90% AP (su lubomis 99422.45 €)
//  ✅ PSD 6.98% nuo 90% AP
//  ✅ VSD lengvata pirmiems metams
//  ✅ Draustas PSD valstybės lėšomis
//  ✅ Papildoma pensija 0% / 3%
// ═══════════════════════════════════════════════════════════════

const VDU = 2312.15;
const VDU_36 = 36 * VDU;
const VDU_60 = 60 * VDU;
const VSD_RATE = 0.1252;
const PSD_RATE = 0.0698;
const SODRA_CAP = 43 * VDU; // 99422.45 - metinės Sodros lubos (VSD + PSD)

const fmt = (n) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("lt-LT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// ─── GPM mokesčio kreditas (GPMĮ 18-2 str.) ────────────────
function calcGPM(ap) {
  if (ap <= 0) return { gpm: 0, effectiveGpmRate: 0, zones: [] };

  if (ap <= 20000) {
    const gpm = ap * 0.05;
    return { gpm, effectiveGpmRate: 5, zones: [{ label: "5%", base: ap, tax: gpm }] };
  }

  if (ap <= 42500) {
    let pmk = ap * (0.15 - (2 / 300000) * (ap - 20000));
    if (pmk < 0) pmk = 0;
    const gpm = ap * 0.20 - pmk;
    const effectiveGpmRate = (gpm / ap) * 100;
    return { gpm, effectiveGpmRate, zones: [{ label: `${effectiveGpmRate.toFixed(1)}%`, base: ap, tax: gpm }] };
  }

  const p1 = Math.min(ap, VDU_36);
  const p2 = Math.min(Math.max(ap - VDU_36, 0), VDU_60 - VDU_36);
  const p3 = Math.max(ap - VDU_60, 0);
  const g1 = p1 * 0.20, g2 = p2 * 0.25, g3 = p3 * 0.32;
  const gpm = g1 + g2 + g3;
  const zones = [];
  if (p1 > 0) zones.push({ label: "20%", base: p1, tax: g1 });
  if (p2 > 0) zones.push({ label: "25%", base: p2, tax: g2 });
  if (p3 > 0) zones.push({ label: "32%", base: p3, tax: g3 });
  return { gpm, effectiveGpmRate: (gpm / ap) * 100, zones };
}

function calcSodra(ap, vsdLengvata, psdDraustas, pensija3) {
  if (ap <= 0) return { vsd: 0, psd: 0, pensija: 0 };
  const cappedBase = Math.min(ap * 0.9, SODRA_CAP);
  const vsd = vsdLengvata ? 0 : cappedBase * VSD_RATE;
  const psd = psdDraustas ? 0 : cappedBase * PSD_RATE;
  const pensija = pensija3 ? cappedBase * 0.03 : 0;
  return { vsd, psd, pensija };
}

// ═══════════════════════════════════════════════════════════════

const PSD_TOOLTIP_ITEMS = [
  "Dirbate pagal darbo sutartį (darbdavys jau moka PSD)",
  "Esate studentas (-ė)",
  "Esate vaiko priežiūros atostogose",
  "Esate registruotas (-a) bedarbis (-ė)",
  "Esate pensininkas (-ė)",
  "Esate vaikas iki 18 m.",
];

// ── Colors ──────────────────────────────────────────────────
const C = {
  accent: "#0d7d72",
  accentLight: "#b2f0e6",
  bg: "#f5f7f8",
  card: "#ffffff",
  text: "#111827",
  textSec: "#374151",
  border: "#d1d5db",
  red: "#b91c1c",
  redBg: "#fef2f2",
};

export default function IndividualiosVeiklosSkaiciuokle2026() {
  const [pajamos, setPajamos] = useState("");
  const [sanauduTipas, setSanauduTipas] = useState("30");
  const [faktinesSanaudos, setFaktinesSanaudos] = useState("");
  const [vsdLengvata, setVsdLengvata] = useState(false);
  const [psdDraustas, setPsdDraustas] = useState(false);
  const [pensija3, setPensija3] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // ── Input handler: only positive numbers ──────────────────
  const handleNumber = (setter) => (e) => {
    const v = e.target.value;
    if (v === "") { setter(""); return; }
    // Allow only digits and one dot/comma
    const cleaned = v.replace(",", ".");
    if (!/^\d*\.?\d*$/.test(cleaned)) return;
    const n = Number(cleaned);
    if (Number.isNaN(n) || n < 0) return;
    setter(n);
  };

  const result = useMemo(() => {
    const paj = Number(pajamos) || 0;
    if (paj <= 0) return null;
    const sanaudos = sanauduTipas === "30"
      ? paj * 0.3
      : Math.min(Number(faktinesSanaudos) || 0, paj);
    const ap = Math.max(paj - sanaudos, 0);
    const { gpm, effectiveGpmRate, zones } = calcGPM(ap);
    const { vsd, psd, pensija } = calcSodra(ap, vsdLengvata, psdDraustas, pensija3);
    const totalTax = gpm + vsd + psd + pensija;
    const grynos = paj - sanaudos - totalTax;
    const effectiveRate = paj > 0 ? (totalTax / paj) * 100 : 0;
    return { paj, sanaudos, ap, gpm, effectiveGpmRate, zones, vsd, psd, pensija, totalTax, grynos, effectiveRate };
  }, [pajamos, sanauduTipas, faktinesSanaudos, vsdLengvata, psdDraustas, pensija3]);

  // ── Shared styles ─────────────────────────────────────────
  const card = {
    background: C.card,
    borderRadius: 16,
    border: `1px solid ${C.border}`,
    padding: "28px 28px 24px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)",
  };
  const cardTitle = {
    fontSize: 13, fontWeight: 600, textTransform: "uppercase",
    letterSpacing: "0.06em", color: C.textSec, marginBottom: 20,
  };
  const label = { display: "block", fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 6 };
  const input = {
    width: "100%", padding: "12px 14px", fontSize: 16,
    border: `1.5px solid ${C.border}`, borderRadius: 10, outline: "none",
    background: "#f9fafb", color: C.text, boxSizing: "border-box", transition: "border-color 0.2s",
  };
  const radioBtn = (active) => ({
    flex: 1, padding: "10px 16px", fontSize: 14, fontWeight: 500,
    border: `1.5px solid ${active ? C.accent : C.border}`, borderRadius: 10,
    background: active ? C.accentLight : "#f9fafb",
    color: active ? C.accent : C.textSec,
    cursor: "pointer", textAlign: "center", transition: "all 0.2s", userSelect: "none",
  });
  const checkboxRow = {
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 0", cursor: "pointer", userSelect: "none",
  };
  const checkboxBox = (on) => ({
    width: 20, height: 20, borderRadius: 6,
    border: `2px solid ${on ? C.accent : "#9ca3af"}`,
    background: on ? C.accent : "#fff",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    transition: "all 0.2s",
  });
  const resultRow = {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "11px 0", borderBottom: `1px solid ${C.border}`, fontSize: 15,
  };
  const zoneTag = {
    display: "inline-block", background: C.accentLight, color: "#065f56",
    borderRadius: 6, padding: "3px 8px", fontSize: 12, fontWeight: 700, marginRight: 6, marginTop: 4,
  };

  const Checkmark = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  return (
    <div style={{
      fontFamily: "'DM Sans', 'Satoshi', system-ui, -apple-system, sans-serif",
      background: C.bg, minHeight: "100vh", color: C.text, padding: "0 16px 80px",
    }}>
      <Helmet>
        <title>Tiksliausia individualios veiklos skaičiuoklė 2026 - DokSkenas </title>
        <meta name="description" content="Tiksliai bei nemokamai apskaičiuokite individualios veiklos mokesčius bei grynąjį pelną į rankas" />
        <link rel="canonical" href="https://atlyginimoskaiciuokle.com/individualios-veiklos-skaiciuokle" />
        <meta property="og:title" content="Individualios veiklos skaičiuoklė 2026" />
        <meta property="og:description" content="Nemokama skaičiuoklė individualios veiklos mokesčiams: GPM, VSD, PSD, pensija. 2026 m. tarifai su mokesčio kreditu." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://atlyginimoskaiciuokle.com/individualios-veiklos-skaiciuokle" />

        {/* WebApplication */}
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          "name": "Individualios veiklos skaičiuoklė 2026",
          "description": "Nemokama skaičiuoklė individualios veiklos mokesčiams apskaičiuoti pagal 2026 m. tarifus: GPM su mokesčio kreditu, VSD, PSD, papildoma pensija.",
          "url": "https://atlyginimoskaiciuokle.com/individualios-veiklos-skaiciuokle",
          "applicationCategory": "FinanceApplication",
          "operatingSystem": "All",
          "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "EUR"
          },
          "inLanguage": "lt"
        })}</script>

        {/* FAQPage */}
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "Kokie mokesčiai taikomi individualiai veiklai 2026 metais?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Vykdant individualią veiklą pagal pažymą 2026 m. reikia mokėti gyventojų pajamų mokestį (GPM) nuo 5% iki 32%, valstybinio socialinio draudimo (VSD) įmokas 12,52% ir privalomojo sveikatos draudimo (PSD) įmokas 6,98%. VSD ir PSD skaičiuojami nuo 90% apmokestinamųjų pajamų. Papildomai galima rinktis 3% pensijos kaupimą."
              }
            },
            {
              "@type": "Question",
              "name": "Kaip apskaičiuojamas GPM nuo individualios veiklos pajamų?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Nuo 2026 m. individualios veiklos apmokestinamosioms pajamoms (AP) iki 42 500 € taikomas mokesčio kreditas: AP iki 20 000 € apmokestinamos efektyviu 5% tarifu, nuo 20 000 iki 42 500 € tarifas palaipsniui didėja iki 20%. Viršijus 42 500 € taikomi progresiniai tarifai: 20% (iki 36 VDU), 25% (36-60 VDU), 32% (virš 60 VDU)."
              }
            },
            {
              "@type": "Question",
              "name": "Kokios yra Sodros lubos individualiai veiklai 2026 metais?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "2026 m. metinės Sodros lubos individualiai veiklai yra 99422,45 € (43 VDU). Ši riba taikoma tiek VSD, tiek PSD įmokoms. Jei 90% apmokestinamųjų pajamų viršija šią sumą, Sodros įmokos skaičiuojamos tik iki lubų ribos."
              }
            },
            {
              "@type": "Question",
              "name": "Ar galima nemokėti VSD pirmaisiais veiklos metais?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Taip. Jei registruojate individualią veiklą pirmą kartą arba praėjo daugiau nei 10 metų nuo ankstesnės veiklos pabaigos, galite vienerius metus nemokėti VSD įmokų. PSD ir GPM lieka privalomi. Svarbu žinoti, kad nemokant VSD nesikaups stažas pensijai ir socialinėms išmokoms."
              }
            },
            {
              "@type": "Question",
              "name": "Kaip atskaityti sąnaudas vykdant individualią veiklą?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Galimi du būdai: 30% fiksuotas atskaitymas (nereikia dokumentų) arba faktinių sąnaudų atskaitymas su pagrindžiančiais dokumentais. Apmokestinamosios pajamos apskaičiuojamos iš gautų pajamų atėmus pasirinktas sąnaudas. Abu variantus naudoti vienu metu negalima."
              }
            },
            {
              "@type": "Question",
              "name": "Kas yra draustas PSD valstybės lėšomis?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "PSD valstybės lėšomis draudžiami: dirbantys pagal darbo sutartį, studentai, vaiko priežiūros atostogose esantys asmenys, registruoti bedarbiai, pensininkai ir vaikai iki 18 m. Šie asmenys, vykdydami individualią veiklą, PSD įmokų mokėti neprivalo."
              }
            }
          ]
        })}</script>

        {/* BreadcrumbList */}
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            {
              "@type": "ListItem",
              "position": 1,
              "name": "Pradžia",
              "item": "https://atlyginimoskaiciuokle.com"
            },
            {
              "@type": "ListItem",
              "position": 2,
              "name": "Individualios veiklos skaičiuoklė 2026",
              "item": "https://atlyginimoskaiciuokle.com/individualios-veiklos-skaiciuokle"
            }
          ]
        })}</script>
      </Helmet>

      <div style={{ maxWidth: 1080, margin: "0 auto", paddingTop: 40 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, lineHeight: 1.2 }}>
          Individualios veiklos skaičiuoklė 2026
        </h1>
        <p style={{ fontSize: 15, color: C.textSec, marginTop: 8, marginBottom: 32, lineHeight: 1.5 }}>
          Apskaičiuokite mokesčius ir grynąjį pelną vykdant individualią veiklą pagal pažymą.
        </p>

        {/* ═══ TWO-COLUMN: settings left, results right ═══ */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 24,
          "@media(min-width:768px)": {},
        }}>
          {/* Use CSS media query via style tag */}
          <style>{`
            @media (min-width: 768px) {
              .iv-main-grid { grid-template-columns: 1fr 1fr !important; }
            }
          `}</style>

          <div className="iv-main-grid" style={{
            display: "grid", gridTemplateColumns: "1fr", gap: 24,
          }}>
            {/* ── LEFT: Settings ──────────────────────────── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Pajamos ir sąnaudos */}
              <div style={card}>
                <div style={cardTitle}>Pajamos ir sąnaudos</div>

                <div style={{ marginBottom: 20 }}>
                  <label style={label}>Metinės pajamos (€)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    style={input}
                    value={pajamos}
                    onChange={handleNumber(setPajamos)}
                    placeholder="Įveskite metines pajamas"
                    onFocus={(e) => (e.target.style.borderColor = C.accent)}
                    onBlur={(e) => (e.target.style.borderColor = C.border)}
                  />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={label}>Sąnaudų tipas</label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                    <div style={radioBtn(sanauduTipas === "30")} onClick={() => setSanauduTipas("30")}>
                      30% fiksuotos
                    </div>
                    <div style={radioBtn(sanauduTipas === "faktines")} onClick={() => setSanauduTipas("faktines")}>
                      Faktinės sąnaudos
                    </div>
                  </div>
                </div>

                {sanauduTipas === "faktines" && (
                  <div style={{ marginBottom: 20 }}>
                    <label style={label}>Faktinės sąnaudos per metus (€)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      style={input}
                      value={faktinesSanaudos}
                      onChange={handleNumber(setFaktinesSanaudos)}
                      placeholder="Įveskite faktines sąnaudas"
                      onFocus={(e) => (e.target.style.borderColor = C.accent)}
                      onBlur={(e) => (e.target.style.borderColor = C.border)}
                    />
                  </div>
                )}
              </div>

              {/* Lengvatos */}
              <div style={card}>
                <div style={cardTitle}>Lengvatos ir nustatymai</div>

                <div style={checkboxRow} onClick={() => setVsdLengvata(!vsdLengvata)}>
                  <div style={checkboxBox(vsdLengvata)}>{vsdLengvata && <Checkmark />}</div>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>VSD lengvata pirmiems metams</span>
                </div>

                <div style={{ display: "flex", alignItems: "center" }}>
                  <div style={checkboxRow} onClick={() => setPsdDraustas(!psdDraustas)}>
                    <div style={checkboxBox(psdDraustas)}>{psdDraustas && <Checkmark />}</div>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>Draustas (-a) PSD valstybės lėšomis</span>
                  </div>
                  <div
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 18, height: 18, borderRadius: "50%", background: "#d1d5db",
                      color: C.textSec, fontSize: 11, fontWeight: 700, cursor: "pointer",
                      marginLeft: 6, position: "relative", flexShrink: 0,
                    }}
                    onMouseEnter={() => setShowTooltip(true)}
                    onMouseLeave={() => setShowTooltip(false)}
                    onClick={() => setShowTooltip(!showTooltip)}
                  >
                    ?
                    {showTooltip && (
                      <div style={{
                        position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
                        transform: "translateX(-50%)", background: "#111827", color: "#fff",
                        padding: "14px 16px", borderRadius: 12, fontSize: 13, lineHeight: 1.5,
                        width: 280, zIndex: 100, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                      }}>
                        <div style={{ fontWeight: 600, marginBottom: 8 }}>PSD mokėti nereikia, jei:</div>
                        {PSD_TOOLTIP_ITEMS.map((item, i) => (
                          <div key={i} style={{ paddingLeft: 8, marginBottom: 3 }}>• {item}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div style={checkboxRow} onClick={() => setPensija3(!pensija3)}>
                  <div style={checkboxBox(pensija3)}>{pensija3 && <Checkmark />}</div>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>Papildomas pensijos kaupimas (3%)</span>
                </div>
              </div>
            </div>

            {/* ── RIGHT: Results ──────────────────────────── */}
            <div>
              {!result ? (
                <div style={{
                  ...card, display: "flex", alignItems: "center", justifyContent: "center",
                  minHeight: 300, color: C.textSec, fontSize: 15,
                }}>
                  Įveskite pajamas, kad pamatytumėte rezultatus
                </div>
              ) : (
                <div style={card}>
                  <div style={cardTitle}>Rezultatai</div>

                  <div style={resultRow}>
                    <span style={{ color: C.textSec }}>Metinės pajamos</span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmt(result.paj)} €</span>
                  </div>
                  <div style={resultRow}>
                    <span style={{ color: C.textSec }}>Sąnaudos ({sanauduTipas === "30" ? "30%" : "faktinės"})</span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>-{fmt(result.sanaudos)} €</span>
                  </div>
                  <div style={{ ...resultRow, fontWeight: 600 }}>
                    <span>Apmokestinamosios pajamos (AP)</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmt(result.ap)} €</span>
                  </div>

                  <div style={{ height: 12 }} />

                  {/* GPM */}
                  <div style={resultRow}>
                    <div>
                      <span style={{ color: C.textSec }}>GPM</span>
                      {result.zones.length > 1 && (
                        <div style={{ marginTop: 4 }}>
                          {result.zones.map((z, i) => (
                            <span key={i} style={zoneTag}>{z.label} nuo {fmt(z.base)} € = {fmt(z.tax)} €</span>
                          ))}
                        </div>
                      )}
                      {result.zones.length === 1 && (
                        <div style={{ marginTop: 4 }}>
                          <span style={zoneTag}>Efektyvus tarifas: {result.effectiveGpmRate.toFixed(1)}%</span>
                        </div>
                      )}
                    </div>
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmt(result.gpm)} €</span>
                  </div>

                  {/* VSD */}
                  <div style={resultRow}>
                    <span style={{ color: C.textSec }}>VSD (12,52%){vsdLengvata ? " (lengvata)" : ""}</span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {vsdLengvata ? "0,00" : fmt(result.vsd)} €
                    </span>
                  </div>

                  {/* PSD */}
                  <div style={resultRow}>
                    <span style={{ color: C.textSec }}>PSD (6,98%){psdDraustas ? " (draustas)" : ""}</span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {psdDraustas ? "0,00" : fmt(result.psd)} €
                    </span>
                  </div>

                  {/* Pensija */}
                  <div style={{ ...resultRow, borderBottom: "none" }}>
                    <span style={{ color: C.textSec }}>Papildoma pensija (3%)</span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmt(result.pensija)} €</span>
                  </div>

                  {/* ── Iš viso mokesčių ── */}
                  <div style={{
                    background: C.redBg, borderRadius: 14, padding: "16px 20px", marginTop: 8,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <span style={{ color: C.red, fontSize: 15, fontWeight: 700 }}>Iš viso mokesčių</span>
                    <span style={{ color: C.red, fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", letterSpacing: "-0.02em" }}>
                      {fmt(result.totalTax)} €
                    </span>
                  </div>

                  {/* ── Grynasis pelnas ── */}
                  <div style={{
                    background: `linear-gradient(135deg, ${C.accent}, #065f56)`,
                    borderRadius: 14, padding: "16px 20px", marginTop: 8,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <span style={{ color: "rgba(255,255,255,0.95)", fontSize: 15, fontWeight: 600 }}>
                      Grynasis pelnas
                    </span>
                    <span style={{ color: "#fff", fontSize: 28, fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", letterSpacing: "-0.02em" }}>
                      {fmt(result.grynos)} €
                    </span>
                  </div>

                  {/* ── Mokestinė našta ── */}
                  <div style={{ textAlign: "center", marginTop: 12 }}>
                    <span style={{
                      display: "inline-block", background: "#fef3c7", color: "#78350f",
                      borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600,
                    }}>
                      Mokestinė našta: {result.effectiveRate.toFixed(1)}% nuo pajamų
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ═══ FULL-WIDTH: Monthly breakdown ═══ */}
          {result && (
            <div style={card}>
              <div style={cardTitle}>Mėnesinis pjūvis</div>
              <MonthlyBreakdown result={result} vsdLengvata={vsdLengvata} psdDraustas={psdDraustas} />
            </div>
          )}
        </div>

        <InfoSection />
      </div>
    </div>
  );
}

// ─── Mėnesinis pjūvis ──────────────────────────────────────
const MonthlyBreakdown = memo(function MonthlyBreakdown({ result, vsdLengvata, psdDraustas }) {
  const monthly = (v) => fmt(v / 12);
  const rows = [
    ["Pajamos", monthly(result.paj)],
    ["Sąnaudos", `-${monthly(result.sanaudos)}`],
    ["Apmokestinamosios pajamos", monthly(result.ap)],
    ["GPM", monthly(result.gpm)],
    ["VSD", vsdLengvata ? "0,00" : monthly(result.vsd)],
    ["PSD", psdDraustas ? "0,00" : monthly(result.psd)],
    ["Pensija", monthly(result.pensija)],
    ["Iš viso mokesčių", monthly(result.totalTax)],
  ];

  const cell = { padding: "11px 14px", fontSize: 15, borderBottom: "1px solid #d1d5db" };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {rows.map(([lbl, val], i) => (
            <tr key={i}>
              <td style={{ ...cell, color: "#374151", fontWeight: 400 }}>{lbl}</td>
              <td style={{ ...cell, textAlign: "right", fontWeight: 600, color: "#111827", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{val} €</td>
            </tr>
          ))}
          <tr style={{ background: "linear-gradient(135deg, #d1faf0, #a7f3d0)" }}>
            <td style={{ ...cell, fontWeight: 700, color: "#065f56", borderBottom: "none" }}>Grynasis pelnas / mėn.</td>
            <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: "#065f56", fontSize: 18, borderBottom: "none" }}>
              {monthly(result.grynos)} €
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
});

// ─── Informacinis blokas ────────────────────────────────────
const InfoSection = memo(function InfoSection() {
  const h2 = { fontSize: 22, fontWeight: 700, color: "#111827", marginTop: 48, marginBottom: 12, lineHeight: 1.3 };
  const h3 = { fontSize: 20, fontWeight: 700, color: "#111827", marginTop: 36, marginBottom: 10, lineHeight: 1.3 };
  const p = { fontSize: 15, lineHeight: 1.75, color: "#374151", marginBottom: 14 };
  const ul = { paddingLeft: 24, marginBottom: 16, listStyleType: "disc" };
  const li = { fontSize: 15, lineHeight: 1.75, color: "#374151", marginBottom: 6, listStyleType: "disc" };
  const link = { color: "#0d7d72", textDecoration: "none", fontWeight: 500 };
  const note = {
    fontSize: 14, lineHeight: 1.6, color: "#374151", fontStyle: "italic",
    background: "#f1f5f9", borderRadius: 10, padding: "16px 20px", marginBottom: 24,
  };

  return (
    <div style={{ marginTop: 48 }}>
      {/* PASTABA */}
      <div style={note}>
        <strong>PASTABA:</strong> skaičiuoklėje naudojami 2026 m. rodikliai: <strong>VDU 2312,15 €</strong>,{" "}
        <strong>MMA 1153 €</strong>. Skaičiavimai yra informacinio pobūdžio ir gali neatitikti
        individualių atvejų. Tikslią mokestinę prievolę rekomenduojame pasitikrinti su buhalteriu
        arba{" "}
        <a href="https://www.vmi.lt" target="_blank" rel="noopener noreferrer" style={link}>VMI</a>.
      </div>

      {/* H2: Individualios veiklos mokesčiai */}
      <h2 style={h2}>IV mokesčiai 2026 metais</h2>
      <p style={p}>
        Vykdant individualią veiklą pagal pažymą, reikia mokėti kelis mokesčius: <strong>gyventojų
        pajamų mokestį (GPM)</strong>, <strong>valstybinio socialinio draudimo (VSD)</strong> ir{" "}
        <strong>privalomojo sveikatos draudimo (PSD)</strong> įmokas. Papildomai galima rinktis{" "}
        <strong>3% pensijos kaupimą</strong>. Žemiau kiekvieną iš jų aptariame detaliau.
      </p>

      {/* H3: GPM */}
      <h3 style={h3}>Gyventojų pajamų mokestis (GPM)</h3>
      <p style={p}>
        Nuo 2026 m. sausio 1 d. individualios veiklos pajamoms taikomas <strong>20% bazinis GPM
        tarifas</strong>, tačiau gaunantiems mažesnes pajamas taikomas mokesčio kreditas
        pagal{" "}
        <a href="https://www.infolex.lt/teise/DocumentSinglePart.aspx?AktoId=77842&StrNr=18-2" target="_blank" rel="noopener noreferrer" style={link}>
          GPMĮ 18² straipsnį
        </a>
        . Kreditas sumažina efektyvų tarifą iki <strong>5%</strong> mažiausioms pajamoms:
      </p>
      <ul style={ul}>
        <li style={li}>Apmokestinamosios pajamos (AP) iki <strong>20 000 €</strong> per metus: efektyvus tarifas <strong>5%</strong></li>
        <li style={li}>AP nuo <strong>20 000 iki 42 500 €</strong>: tarifas palaipsniui didėja nuo 5% iki 20%</li>
        <li style={li}>AP virš <strong>42 500 €</strong>: kreditas nebetaikomas, pajamos apmokestinamos progresiniais tarifais:
          <strong> 20%</strong> (iki 36 VDU / 83 237 €), <strong>25%</strong> (36-60 VDU / iki 138 729 €),{" "}
          <strong>32%</strong> (virš 60 VDU)
        </li>
      </ul>
      <p style={p}>
        Detalesnę informaciją apie GPM tarifus ir pavyzdžius rasite{" "}
        <a href="https://www.vmi.lt/evmi/5725" target="_blank" rel="noopener noreferrer" style={link}>
          VMI puslapyje apie GPM tarifus
        </a>.
      </p>

      {/* H3: Sodros įmokos */}
      <h3 style={h3}>Sodros įmokos (VSD ir PSD)</h3>
      <p style={p}>
        Individualią veiklą pagal pažymą vykdantys asmenys Sodros įmokas moka nuo{" "}
        <strong>90% apmokestinamųjų pajamų</strong>. Taikomi du tarifai:
      </p>
      <ul style={ul}>
        <li style={li}><strong>VSD (valstybinis socialinis draudimas): 12,52%</strong></li>
        <li style={li}><strong>PSD (privalomasis sveikatos draudimas): 6,98%</strong></li>
      </ul>
      <p style={p}>
        Abiem įmokoms galioja vienodos metinės <strong>lubos: 43 VDU = 99422,45 €</strong>.
        Tai reiškia, kad jei 90% jūsų AP viršija šią sumą, Sodros įmokos skaičiuojamos tik
        iki lubų ribos. Daugiau informacijos apie tarifus rasite{" "}
        <a href="https://sodra.lt/imoku-tarifai/imoku-tarifai-taikomi-savarankiskai-dirbantiems-asmenims" target="_blank" rel="noopener noreferrer" style={link}>
          Sodros puslapyje
        </a>.
      </p>
      <p style={p}>
        Jei esate <strong>draustas (-a) PSD valstybės lėšomis</strong> (dirbate pagal darbo sutartį,
        esate studentas, vaiko priežiūros atostogose, registruotas bedarbis ar pensininkas),
        PSD įmokų nuo individualios veiklos mokėti nereikia. Kitu atveju minimali mėnesinė
        PSD įmoka yra <strong>80,48 €</strong>.
      </p>

      {/* H3: Papildomas pensijos kaupimas */}
      <h3 style={h3}>Papildomas pensijos kaupimas</h3>
      <p style={p}>
        Individualią veiklą vykdantys asmenys gali pasirinkti <strong>papildomą 3% pensijos
        kaupimą</strong> (II pakopa). Ši įmoka skaičiuojama nuo tos pačios bazės kaip VSD
        (90% AP, su lubomis) ir pridedama prie VSD tarifo: <strong>12,52% + 3% = 15,52%</strong>.
      </p>
      <p style={p}>
        Kaupiantiems papildomai valstybė papildomai prisideda <strong>1,5% nuo VDU</strong>,
        todėl bendra nauda pensijai yra didesnė nei vien tik jūsų mokama dalis. Sprendimą
        kaupti ar nekaupti galima keisti kartą per metus.
      </p>

      {/* H2: Sąnaudų atskaitymas */}
      <h2 style={h2}>Sąnaudų atskaitymas</h2>
      <p style={p}>
        Individualios veiklos apmokestinamosios pajamos apskaičiuojamos iš gautų pajamų
        atėmus patirtas sąnaudas. Galimi du būdai:
      </p>
      <ul style={ul}>
        <li style={li}><strong>30% fiksuotas atskaitymas</strong>: nereikia rinkti jokių dokumentų. Tiesiog atimama 30%
          nuo visų gautų pajamų. Šis būdas ypač patogus IT specialistams, konsultantams ir kitiems,
          kurių faktinės sąnaudos yra nedidelės.</li>
        <li style={li}><strong>Faktinės sąnaudos</strong>: atimamos realiai patirtos ir dokumentais pagrįstos išlaidos.
          Naudinga, jei jūsų veikla reikalauja didelių investicijų į įrangą, medžiagas ar patalpas.</li>
      </ul>
      <p style={p}>
        Abu būdus galima pasirinkti deklaruojant pajamas. Svarbu prisiminti, kad <strong>abu
        variantus naudoti vienu metu negalima</strong>: arba 30%, arba faktinės sąnaudos.
      </p>

      {/* H3: Kokias sąnaudas galima įtraukti */}
      <h3 style={h3}>Kokias sąnaudas galima įtraukti</h3>
      <p style={p}>
        Jei pasirenkate faktinių sąnaudų atskaitymo būdą, galite įtraukti visas išlaidas,
        tiesiogiai susijusias su jūsų individualios veiklos pajamų gavimu. Dažniausiai
        pasitaikančios sąnaudų kategorijos:
      </p>
      <ul style={ul}>
        <li style={li}>Darbo priemonės: kompiuteris, programinė įranga, telefonas, kita technika</li>
        <li style={li}>Transportas: kuras, automobilio nuoma ar lizingas, draudimas (proporcingai veiklai)</li>
        <li style={li}>Patalpų nuoma ir komunalinės paslaugos (proporcingai veiklai skirtai daliai)</li>
        <li style={li}>Ryšio paslaugos ir internetas</li>
        <li style={li}>Buhalterinės ir teisinės paslaugos</li>
        <li style={li}>Kvalifikacijos kėlimas: kursai, mokymai, konferencijos</li>
        <li style={li}>Reklama ir rinkodaros išlaidos</li>
      </ul>
      <p style={p}>
        Visos sąnaudos privalo būti <strong>susijusios su vykdoma veikla</strong> ir pagrįstos
        dokumentais (sąskaitomis faktūromis, kvitais, sutartimis). Detalesnę informaciją
        apie leidžiamus atskaitymus rasite{" "}
        <a href="https://www.vmi.lt/evmi/leid%C5%BEiami-/-neleid%C5%BEiami-atskaitymai1#kurios-i%C5%A1laidos-laikomos-gyventojo-kuris-ver%C4%8Diasi-individualia-veikla-leid%C5%BEiamais-atskaitymais" target="_blank" rel="noopener noreferrer" style={link}>
          VMI puslapyje apie leidžiamus atskaitymus
        </a>.
      </p>

      {/* H2: Lengvata pirmaisiais veiklos metais */}
      <h2 style={h2}>Lengvata pirmaisiais veiklos metais</h2>
      <p style={p}>
        Jei registruojate individualią veiklą <strong>pirmą kartą</strong> (arba praėjo daugiau
        nei <strong>10 metų</strong> nuo ankstesnės veiklos pabaigos), galite pasinaudoti VSD
        lengvata ir <strong>vienerius metus nemokėti VSD įmokų</strong>. Tai gali reikšmingai
        sumažinti mokestinę naštą pirmaisiais metais, kol veikla dar tik įsibėgėja.
      </p>
      <p style={p}>
        Tačiau svarbu atsižvelgti, kad nemokant VSD per tą laikotarpį{" "}
        <strong>nesikaups stažas</strong> pensijai ir socialinėms išmokoms (ligos, motinystės,
        tėvystės). GPM ir PSD įmokos pirmaisiais metais lieka privalomos.
      </p>
      <p style={p}>
        Dar viena naujovė nuo 2026 m.: prieš pradedant bet kurios rūšies individualią veiklą
        būtina informuoti VMI <strong>ne vėliau kaip prieš 1 darbo dieną</strong> prieš pradedant veiklą. 
        Anksčiau tokio reikalavimo nebuvo, todėl planuojantys pradėti veiklą turėtų tai
        žinoti iš anksto.
      </p>
    </div>
  );
});