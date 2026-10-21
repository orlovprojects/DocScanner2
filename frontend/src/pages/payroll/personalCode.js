// Lietuvos asmens kodo tikrinimas (tas pats algoritmas kaip backend payroll/personal_code.py).
// Formatas: G YYMMDD NNN K. Kontrolinio skaičiaus neatitikimas - ĮSPĖJIMAS, ne klaida: registre pasitaiko
// išduotų kodų su nestandartiniu kontroliniu skaičiumi, todėl leidžiama tęsti, jei kodas sutampa su dokumentu.
const W1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1];
const W2 = [3, 4, 5, 6, 7, 8, 9, 1, 2, 3];
const CENTURY = { 1: 1800, 2: 1800, 3: 1900, 4: 1900, 5: 2000, 6: 2000 };

export function controlDigit(first10) {
  const d = first10.split("").map(Number);
  let r = W1.reduce((a, w, i) => a + w * d[i], 0) % 11;
  if (r === 10) {
    r = W2.reduce((a, w, i) => a + w * d[i], 0) % 11;
    if (r === 10) r = 0;
  }
  return r;
}

export function parsePersonalCode(code) {
  const c = (code || "").trim();
  if (!/^\d+$/.test(c)) return { valid: false, error: "Asmens kodą sudaro tik skaitmenys" };
  if (c.length !== 11) return { valid: false, error: `Įvesta ${c.length} iš 11 skaitmenų` };
  if (!CENTURY[c[0]]) {
    return { valid: false, error: `Pirmas skaitmuo turi būti 1–6 (lytis ir gimimo šimtmetis), o įvesta ${c[0]}` };
  }
  const year = CENTURY[c[0]] + Number(c.slice(1, 3));
  const mm = Number(c.slice(3, 5));
  const dd = Number(c.slice(5, 7));
  const gender = Number(c[0]) % 2 ? "M" : "F";
  let birth = "";
  if (mm !== 0 && dd !== 0) {                       // 00 - kai kuriems asmenims data užkoduota nepilnai
    const dt = new Date(Date.UTC(year, mm - 1, dd));
    if (mm > 12 || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) {
      return { valid: false, error: `2–7 skaitmenys turi būti gimimo data, bet ${year}-${c.slice(3, 5)}-${c.slice(5, 7)} tokios datos nėra` };
    }
    if (dt > new Date()) return { valid: false, error: `Gimimo data ${year}-${c.slice(3, 5)}-${c.slice(5, 7)} – ateityje` };
    birth = `${year}-${c.slice(3, 5)}-${c.slice(5, 7)}`;
  }
  const k = controlDigit(c.slice(0, 10));
  const warning = k !== Number(c[10])
    ? `Paskutinis (kontrolinis) skaitmuo pagal algoritmą turėtų būti ${k}, o įvesta ${c[10]}. Dažniausiai tai rašymo klaida – patikrinkite. Jei kodas toks pat kaip asmens dokumente, galite tęsti.`
    : "";
  return { valid: true, gender, birth_date: birth, warning };
}
