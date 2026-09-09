export const decimalInput = value => String(value ?? "").replaceAll(".", ",");
export const decimalNumber = value => Number(String(value).replace(",", "."));
export const fixedInput = value => Number(value).toFixed(2).replace(".", ",");
// Django Decimal uses half-even rounding. Work in integer cents/basis points.
const roundRatio = (numerator, denominator) => {
  const whole = Math.floor(numerator / denominator);
  const remainder = numerator % denominator;
  return whole + (remainder * 2 > denominator || (remainder * 2 === denominator && whole % 2) ? 1 : 0);
};
export const amountFromPercent = (vat, percent) => roundRatio(Math.round(decimalNumber(vat) * 100) * Math.round(decimalNumber(percent) * 100), 10000) / 100;
export const vatRateLabel = doc => doc?.separate_vat ? "Keli skirtingi" :
  doc?.vat_percent == null ? "—" : `${decimalNumber(doc.vat_percent).toLocaleString("lt-LT")}%`;

// Keep the edited text (including its trailing comma) and calculate the other field.
export function linkedDeduction(details, field, input, invoiceVat) {
  const text = decimalInput(input);
  if (!/^\d*(,\d{0,2})?$/.test(text)) return null;
  if (text === "" || text === ",") return { ...details, [field]: text };
  const value = decimalNumber(text);
  const vat = decimalNumber(invoiceVat || 0);
  const maximum = amountFromPercent(vat, details.prorata_rate ?? 100);
  if (field === "deduction_percent") {
    if (value > 100 || value > decimalNumber(details.prorata_rate ?? 100)) return null;
    return { ...details, deduction_percent: text, deductible_vat: fixedInput(amountFromPercent(vat, value)) };
  }
  if (value > maximum || vat <= 0) return null;
  const percent = roundRatio(Math.round(value * 100) * 10000, Math.round(vat * 100)) / 100;
  return { ...details, deductible_vat: text, deduction_percent: fixedInput(percent) };
}
