// Apytikslis "į rankas" skaičiavimas formoms (tik užuomina vartotojui - tikslus skaičiavimas backende).
const PARAMS = {
  2026: { mma: 1153 },
  2027: { mma: 1245 },
};

const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

export function paramsFor(dateStr) {
  const y = Number((dateStr || "").slice(0, 4)) || new Date().getFullYear();
  return PARAMS[y] || PARAMS[2027];
}

export function estimateNet({ gross, npdMode = "standard", pension = false, fixedTerm = false, date }) {
  const g = Number(gross) || 0;
  if (g <= 0) return null;
  const { mma } = paramsFor(date);
  let npd = 0;
  if (npdMode === "standard") npd = g <= mma ? 747 : Math.max(r2(747 - 0.49 * (g - mma)), 0);
  if (npdMode === "d30_55") npd = 1057;
  if (npdMode === "d0_25") npd = 1127;
  npd = Math.min(npd, g);
  const gpm = r2((g - npd) * 0.2);
  const sodra = r2(g * 0.195) + (pension ? r2(g * 0.03) : 0);
  const employer = r2(g * ((fixedTerm ? 2.03 : 1.31) + 0.14 + 0.32) / 100);
  return { net: r2(g - gpm - sodra), gpm, sodra, employer, cost: r2(g + employer), mma };
}
