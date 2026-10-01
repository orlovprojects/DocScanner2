// Lietuvos asmens kodo tikrinimas (tas pats algoritmas kaip backend payroll/personal_code.py)
const W1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1];
const W2 = [3, 4, 5, 6, 7, 8, 9, 1, 2, 3];
const CENTURY = { 1: 1800, 2: 1800, 3: 1900, 4: 1900, 5: 2000, 6: 2000 };

export function parsePersonalCode(code) {
  const c = (code || "").trim();
  if (!/^\d{11}$/.test(c)) return { valid: false, error: "Asmens kodą sudaro 11 skaitmenų" };
  if (!CENTURY[c[0]]) return { valid: false, error: "Neteisingas pirmas skaitmuo" };
  const d = c.split("").map(Number);
  let r = W1.reduce((a, w, i) => a + w * d[i], 0) % 11;
  if (r === 10) {
    r = W2.reduce((a, w, i) => a + w * d[i], 0) % 11;
    if (r === 10) r = 0;
  }
  if (r !== d[10]) return { valid: false, error: "Neteisingas asmens kodas (patikrinkite skaitmenis)" };
  const year = CENTURY[c[0]] + Number(c.slice(1, 3));
  const birth = `${year}-${c.slice(3, 5)}-${c.slice(5, 7)}`;
  return { valid: true, gender: Number(c[0]) % 2 ? "M" : "F", birth_date: birth };
}
