// ═══════════════════════════════════════════════════════════
// Suma žodžiais (LT / EN / PL / DE) — 1:1 su backend utils/amount_in_words.py
//   amountInWords(1423.45, 'EUR', 'lt')
//   -> "Vienas tūkstantis keturi šimtai dvidešimt trys eurai keturiasdešimt penki centai"
// ═══════════════════════════════════════════════════════════

const splitTriplets = (n) => {
  const groups = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  return groups.length ? groups : [0];
};

const pad2 = (n) => String(n).padStart(2, '0');

// ISO 4217 valiutos be smulkiųjų vienetų
const ZERO_DECIMAL_CURRENCIES = new Set([
  'JPY', 'KRW', 'VND', 'ISK', 'CLP', 'PYG', 'UGX', 'RWF', 'BIF',
  'DJF', 'GNF', 'KMF', 'VUV', 'XAF', 'XOF', 'XPF',
]);

// '45/100' arba '' (valiutai be centų, kai trupmenos nėra)
const fraction = (cents, cur) => (
  cents === 0 && ZERO_DECIMAL_CURRENCIES.has(cur) ? '' : `${pad2(cents)}/100`
);

// ── LT ──
const LT_ONES_M = ['', 'vienas', 'du', 'trys', 'keturi', 'penki', 'šeši', 'septyni', 'aštuoni', 'devyni'];
const LT_ONES_F = ['', 'viena', 'dvi', 'trys', 'keturios', 'penkios', 'šešios', 'septynios', 'aštuonios', 'devynios'];
const LT_TEENS = ['dešimt', 'vienuolika', 'dvylika', 'trylika', 'keturiolika', 'penkiolika', 'šešiolika', 'septyniolika', 'aštuoniolika', 'devyniolika'];
const LT_TENS = ['', '', 'dvidešimt', 'trisdešimt', 'keturiasdešimt', 'penkiasdešimt', 'šešiasdešimt', 'septyniasdešimt', 'aštuoniasdešimt', 'devyniasdešimt'];
const LT_SCALES = [null, ['tūkstantis', 'tūkstančiai', 'tūkstančių'], ['milijonas', 'milijonai', 'milijonų'], ['milijardas', 'milijardai', 'milijardų']];

const ltForm = (n, forms) => {
  if (n % 10 === 0 || (n % 100 >= 11 && n % 100 <= 19)) return forms[2];
  if (n % 10 === 1) return forms[0];
  return forms[1];
};

const ltTriplet = (n, fem) => {
  const ones = fem ? LT_ONES_F : LT_ONES_M;
  const words = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h === 1) words.push('šimtas');
  else if (h > 1) words.push(LT_ONES_M[h], 'šimtai');
  if (rest >= 10 && rest <= 19) words.push(LT_TEENS[rest - 10]);
  else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    if (t) words.push(LT_TENS[t]);
    if (o) words.push(ones[o]);
  }
  return words;
};

const ltNumber = (n, fem = false) => {
  if (n === 0) return 'nulis';
  const words = [];
  const groups = splitTriplets(n);
  for (let idx = groups.length - 1; idx >= 0; idx--) {
    const g = groups[idx];
    if (!g) continue;
    if (idx === 0) words.push(...ltTriplet(g, fem));
    else words.push(...ltTriplet(g, false), ltForm(g, LT_SCALES[idx]));
  }
  return words.join(' ');
};

// ISO: [pagrindinis, moteriška g., smulkus|null, smulkus moteriška g.]
const LT_CUR = {
  EUR: [['euras', 'eurai', 'eurų'], false, ['centas', 'centai', 'centų'], false],
  USD: [['JAV doleris', 'JAV doleriai', 'JAV dolerių'], false, ['centas', 'centai', 'centų'], false],
  GBP: [['svaras sterlingų', 'svarai sterlingų', 'svarų sterlingų'], false, ['pensas', 'pensai', 'pensų'], false],
  PLN: [['zlotas', 'zlotai', 'zlotų'], false, ['grašis', 'grašiai', 'grašių'], false],
  CHF: [['Šveicarijos frankas', 'Šveicarijos frankai', 'Šveicarijos frankų'], false, null, false],
  CZK: [['Čekijos krona', 'Čekijos kronos', 'Čekijos kronų'], true, null, false],
  SEK: [['Švedijos krona', 'Švedijos kronos', 'Švedijos kronų'], true, null, false],
  NOK: [['Norvegijos krona', 'Norvegijos kronos', 'Norvegijos kronų'], true, null, false],
  DKK: [['Danijos krona', 'Danijos kronos', 'Danijos kronų'], true, null, false],
  UAH: [['Ukrainos grivina', 'Ukrainos grivinos', 'Ukrainos grivinų'], true, null, false],
  RUB: [['Rusijos rublis', 'Rusijos rubliai', 'Rusijos rublių'], false, null, false],
  BGN: [['Bulgarijos levas', 'Bulgarijos levai', 'Bulgarijos levų'], false, null, false],
  RON: [['Rumunijos lėja', 'Rumunijos lėjos', 'Rumunijos lėjų'], true, null, false],
  HUF: [['Vengrijos forintas', 'Vengrijos forintai', 'Vengrijos forintų'], false, null, false],
};

const buildLt = (units, cents, cur) => {
  const [major, majorF, minor, minorF] = LT_CUR[cur] || [null, false, null, false];
  let out = `${ltNumber(units, majorF)} ${major ? ltForm(units, major) : cur}`;
  if (minor) out += ` ${ltNumber(cents, minorF)} ${ltForm(cents, minor)}`;
  else if (fraction(cents, cur)) out += ` ${fraction(cents, cur)}`;
  return out;
};

// ── EN ──
const EN_ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const EN_SCALES = ['', 'thousand', 'million', 'billion'];

const enTriplet = (n) => {
  const words = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) words.push(EN_ONES[h], 'hundred');
  if (rest) {
    if (rest < 20) words.push(EN_ONES[rest]);
    else {
      const t = Math.floor(rest / 10);
      const o = rest % 10;
      words.push(EN_TENS[t] + (o ? `-${EN_ONES[o]}` : ''));
    }
  }
  return words;
};

const enNumber = (n) => {
  if (n === 0) return 'zero';
  const words = [];
  const groups = splitTriplets(n);
  for (let idx = groups.length - 1; idx >= 0; idx--) {
    const g = groups[idx];
    if (!g) continue;
    words.push(...enTriplet(g));
    if (idx) words.push(EN_SCALES[idx]);
  }
  return words.join(' ');
};

const EN_CUR = {
  EUR: [['euro', 'euros'], ['cent', 'cents']],
  USD: [['US dollar', 'US dollars'], ['cent', 'cents']],
  GBP: [['pound sterling', 'pounds sterling'], ['penny', 'pence']],
  PLN: [['zloty', 'zlotys'], ['grosz', 'groszy']],
  CHF: [['Swiss franc', 'Swiss francs'], null],
  CZK: [['Czech koruna', 'Czech korunas'], null],
  SEK: [['Swedish krona', 'Swedish kronor'], null],
  NOK: [['Norwegian krone', 'Norwegian kroner'], null],
  DKK: [['Danish krone', 'Danish kroner'], null],
  UAH: [['Ukrainian hryvnia', 'Ukrainian hryvnias'], null],
  RUB: [['Russian ruble', 'Russian rubles'], null],
  BGN: [['Bulgarian lev', 'Bulgarian leva'], null],
  RON: [['Romanian leu', 'Romanian lei'], null],
  HUF: [['Hungarian forint', 'Hungarian forints'], null],
};

const buildEn = (units, cents, cur) => {
  const [major, minor] = EN_CUR[cur] || [null, null];
  const noun = major ? (units === 1 ? major[0] : major[1]) : cur;
  let out = `${enNumber(units)} ${noun}`;
  if (minor) out += ` and ${enNumber(cents)} ${cents === 1 ? minor[0] : minor[1]}`;
  else if (fraction(cents, cur)) out += ` and ${fraction(cents, cur)}`;
  return out;
};

// ── PL ──
const PL_ONES = ['', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć'];
const PL_TEENS = ['dziesięć', 'jedenaście', 'dwanaście', 'trzynaście', 'czternaście', 'piętnaście', 'szesnaście', 'siedemnaście', 'osiemnaście', 'dziewiętnaście'];
const PL_TENS = ['', '', 'dwadzieścia', 'trzydzieści', 'czterdzieści', 'pięćdziesiąt', 'sześćdziesiąt', 'siedemdziesiąt', 'osiemdziesiąt', 'dziewięćdziesiąt'];
const PL_HUNDREDS = ['', 'sto', 'dwieście', 'trzysta', 'czterysta', 'pięćset', 'sześćset', 'siedemset', 'osiemset', 'dziewięćset'];
const PL_SCALES = [null, ['tysiąc', 'tysiące', 'tysięcy'], ['milion', 'miliony', 'milionów'], ['miliard', 'miliardy', 'miliardów']];
const PL_ONE_BY_GENDER = { m: 'jeden', f: 'jedna', n: 'jedno' };

const plForm = (n, forms) => {
  if (n === 1) return forms[0];
  if ([2, 3, 4].includes(n % 10) && !(n % 100 >= 12 && n % 100 <= 14)) return forms[1];
  return forms[2];
};

const plTriplet = (n, gender) => {
  const words = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) words.push(PL_HUNDREDS[h]);
  if (rest >= 10 && rest <= 19) words.push(PL_TEENS[rest - 10]);
  else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    if (t) words.push(PL_TENS[t]);
    if (o) words.push(o === 2 && gender === 'f' ? 'dwie' : PL_ONES[o]);
  }
  return words;
};

const plNumber = (n, gender = 'm') => {
  if (n === 0) return 'zero';
  if (n === 1) return PL_ONE_BY_GENDER[gender];
  const words = [];
  const groups = splitTriplets(n);
  for (let idx = groups.length - 1; idx >= 0; idx--) {
    const g = groups[idx];
    if (!g) continue;
    if (idx === 0) words.push(...plTriplet(g, gender));
    else if (g === 1) words.push(PL_SCALES[idx][0]);
    else words.push(...plTriplet(g, 'm'), plForm(g, PL_SCALES[idx]));
  }
  return words.join(' ');
};

// ISO: [pagrindinis (1, 2-4, 5+), giminė, smulkus|null, smulkaus giminė]
const PL_CUR = {
  EUR: [['euro', 'euro', 'euro'], 'n', ['cent', 'centy', 'centów'], 'm'],
  USD: [['dolar amerykański', 'dolary amerykańskie', 'dolarów amerykańskich'], 'm', ['cent', 'centy', 'centów'], 'm'],
  GBP: [['funt szterling', 'funty szterlingi', 'funtów szterlingów'], 'm', ['pens', 'pensy', 'pensów'], 'm'],
  PLN: [['złoty', 'złote', 'złotych'], 'm', ['grosz', 'grosze', 'groszy'], 'm'],
  CHF: [['frank szwajcarski', 'franki szwajcarskie', 'franków szwajcarskich'], 'm', null, 'm'],
  CZK: [['korona czeska', 'korony czeskie', 'koron czeskich'], 'f', null, 'm'],
  SEK: [['korona szwedzka', 'korony szwedzkie', 'koron szwedzkich'], 'f', null, 'm'],
  NOK: [['korona norweska', 'korony norweskie', 'koron norweskich'], 'f', null, 'm'],
  DKK: [['korona duńska', 'korony duńskie', 'koron duńskich'], 'f', null, 'm'],
  UAH: [['hrywna', 'hrywny', 'hrywien'], 'f', null, 'm'],
  RUB: [['rubel rosyjski', 'ruble rosyjskie', 'rubli rosyjskich'], 'm', null, 'm'],
  BGN: [['lew bułgarski', 'lewy bułgarskie', 'lewów bułgarskich'], 'm', null, 'm'],
  RON: [['lej rumuński', 'leje rumuńskie', 'lejów rumuńskich'], 'm', null, 'm'],
  HUF: [['forint', 'forinty', 'forintów'], 'm', null, 'm'],
};

const buildPl = (units, cents, cur) => {
  const [major, g, minor, mg] = PL_CUR[cur] || [null, 'm', null, 'm'];
  let out = `${plNumber(units, g)} ${major ? plForm(units, major) : cur}`;
  if (minor) out += ` ${plNumber(cents, mg)} ${plForm(cents, minor)}`;
  else if (fraction(cents, cur)) out += ` ${fraction(cents, cur)}`;
  return out;
};

// ── DE ──
const DE_ONES = ['', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun'];
const DE_TEENS = ['zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const DE_TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];
const DE_BIG = [null, null, ['Million', 'Millionen'], ['Milliarde', 'Milliarden']];

// 101, 1001, 2001 ... — skaičius baigiasi "-ein(e)" -> daiktavardis vienaskaita
const deEndsWithOne = (n) => n % 100 === 1;

const deTriplet = (n, gender = 'm') => {
  let s = '';
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) s += `${DE_ONES[h]}hundert`;
  if (rest) {
    if (rest < 10) s += rest === 1 && gender === 'f' ? 'eine' : DE_ONES[rest];
    else if (rest < 20) s += DE_TEENS[rest - 10];
    else {
      const t = Math.floor(rest / 10);
      const o = rest % 10;
      s += (o ? `${DE_ONES[o]}und` : '') + DE_TENS[t];
    }
  }
  return s;
};

const deNumber = (n, gender = 'm') => {
  if (n === 0) return 'null';
  if (n === 1) return gender === 'f' ? 'eine' : 'ein';
  const groups = splitTriplets(n);
  const parts = [];
  for (let idx = groups.length - 1; idx > 1; idx--) {
    const g = groups[idx];
    if (!g) continue;
    const [sg, pl] = DE_BIG[idx];
    // Million/Milliarde - moteriška g.: "eine Million", "einhunderteine Million", "zwei Millionen"
    parts.push(`${deTriplet(g, 'f')} ${deEndsWithOne(g) ? sg : pl}`);
  }
  let tail = '';
  if (groups.length > 1 && groups[1]) tail += `${deTriplet(groups[1])}tausend`;
  if (groups[0]) tail += deTriplet(groups[0], gender);
  if (tail) parts.push(tail);
  return parts.join(' ');
};

const DE_CUR = {
  EUR: [['Euro', 'Euro'], 'm', ['Cent', 'Cent'], 'm'],
  USD: [['US-Dollar', 'US-Dollar'], 'm', ['Cent', 'Cent'], 'm'],
  GBP: [['Pfund Sterling', 'Pfund Sterling'], 'n', ['Penny', 'Pence'], 'm'],
  PLN: [['Złoty', 'Złoty'], 'm', ['Grosz', 'Groszy'], 'm'],
  CHF: [['Schweizer Franken', 'Schweizer Franken'], 'm', null, 'm'],
  CZK: [['tschechische Krone', 'tschechische Kronen'], 'f', null, 'm'],
  SEK: [['schwedische Krone', 'schwedische Kronen'], 'f', null, 'm'],
  NOK: [['norwegische Krone', 'norwegische Kronen'], 'f', null, 'm'],
  DKK: [['dänische Krone', 'dänische Kronen'], 'f', null, 'm'],
  RUB: [['russischer Rubel', 'russische Rubel'], 'm', null, 'm'],
  BGN: [['bulgarischer Lew', 'bulgarische Lewa'], 'm', null, 'm'],
  RON: [['rumänischer Leu', 'rumänische Lei'], 'm', null, 'm'],
  HUF: [['Forint', 'Forint'], 'm', null, 'm'],
};

const buildDe = (units, cents, cur) => {
  const [major, g, minor, mg] = DE_CUR[cur] || [null, 'm', null, 'm'];
  // "ein Euro", "einhundertein Euro", "einhunderteine tschechische Krone" — vienaskaita
  const noun = major ? (deEndsWithOne(units) ? major[0] : major[1]) : cur;
  let out = `${deNumber(units, g)} ${noun}`;
  if (minor) out += ` und ${deNumber(cents, mg)} ${cents === 1 ? minor[0] : minor[1]}`;
  else if (fraction(cents, cur)) out += ` ${fraction(cents, cur)}`;
  return out;
};

// ── Public API ──
const BUILDERS = { lt: buildLt, en: buildEn, pl: buildPl, de: buildDe };
const MAX_CENTS = 99999999999999; // 999 999 999 999,99

export const amountInWords = (amount, currency = 'EUR', lang = 'lt') => {
  if (amount === null || amount === undefined || amount === '') return '';
  const num = Number(String(amount).replace(',', '.'));
  if (!Number.isFinite(num)) return '';

  const negative = num < 0;
  // Sveiki centai — be float paklaidų (ROUND_HALF_UP kaip backend)
  const totalCents = Math.round((Math.abs(num) + Number.EPSILON) * 100);
  if (totalCents > MAX_CENTS) return '';

  const units = Math.floor(totalCents / 100);
  const cents = totalCents % 100;
  const cur = String(currency || 'EUR').trim().toUpperCase();
  const build = BUILDERS[String(lang || 'lt').toLowerCase()] || buildLt;

  let text = build(units, cents, cur);
  if (negative) text = `minus ${text}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export default amountInWords;
