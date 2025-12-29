import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from '@react-pdf/renderer';

// Register fonts with fallback
Font.register({
  family: 'DejaVu Sans',
  fonts: [
    {
      src: 'https://kendo.cdn.telerik.com/2017.2.621/styles/fonts/DejaVu/DejaVuSans.ttf',
    },
    {
      src: 'https://kendo.cdn.telerik.com/2017.2.621/styles/fonts/DejaVu/DejaVuSans-Bold.ttf',
      fontWeight: 'bold',
    },
    {
      src: 'https://kendo.cdn.telerik.com/2017.2.621/styles/fonts/DejaVu/DejaVuSans-Oblique.ttf',
      fontStyle: 'italic',
    },
  ],
});

// Currency symbol mapping
const CURRENCY_SYMBOLS = {
  'USD': '$',
  'EUR': '€',
  'GBP': '£',
  'RUB': '₽',
  'JPY': '¥',
  'CNY': '¥',
  'KRW': '₩',
  'INR': '₹',
  'TRY': '₺',
  'VND': '₫',
  'ILS': '₪',
  'PHP': '₱',
  'NGN': '₦',
  'CRC': '₡',
  'PYG': '₲',
  'LAK': '₭',
  'GHS': '₵',
  'KZT': '₸',
  'AZN': '₼',
  'UAH': '₴',
  'BRL': 'R$',
  'AUD': 'A$',
  'CAD': 'C$',
  'NZD': 'NZ$',
  'HKD': 'HK$',
  'SGD': 'S$',
  'TWD': 'NT$',
  'MXN': 'Mex$',
  'CZK': 'Kč',
  'PLN': 'zł',
  'BGN': 'лв',
  'ZAR': 'R',
  'SEK': 'kr',
  'NOK': 'kr',
  'DKK': 'kr',
  'ISK': 'kr',
  'CHF': 'CHF',
  'RON': 'lei',
  'HUF': 'Ft',
  'HRK': 'kn',
  'RSD': 'din',
  'BYN': 'Br',
  'AED': 'DH',
  'SAR': 'SR',
  'QAR': 'QR',
  'KWD': 'KD',
  'BHD': 'BD',
  'OMR': 'OMR',
  'JOD': 'JD',
  'IDR': 'Rp',
  'THB': '฿',
  'MYR': 'RM',
  'PKR': '₨',
  'BDT': '৳',
  'LKR': 'Rs',
  'GEL': '₾',
  'AMD': '֏',
  'MMK': 'K',
  'KHR': '៛',
  'NPR': 'Rs',
  'AFN': '؋',
  'MNT': '₮',
  'EGP': '£',
  'KES': 'KSh',
  'MAD': 'DH',
  'TND': 'DT',
  'ARS': '$',
  'CLP': '$',
  'COP': '$',
  'UYU': '$U',
  'BOB': 'Bs',
  'PEN': 'S/',
};

const getCurrencySymbol = (currencyCode) => {
  return CURRENCY_SYMBOLS[currencyCode] || currencyCode;
};

// Complete currency data with Lithuanian declensions
const CURRENCY_DATA = {
  // Европа
  'EUR': {
    symbol: '€',
    name: 'Euras',
    major: { single: 'euras', few: 'eurai', many: 'eurų' },
    minor: { single: 'centas', few: 'centai', many: 'centų' }
  },
  'GBP': {
    symbol: '£',
    name: 'Svaras sterlingas',
    major: { single: 'svaras', few: 'svarai', many: 'svarų' },
    minor: { single: 'pensas', few: 'pensai', many: 'pensų' }
  },
  'CHF': {
    symbol: 'CHF',
    name: 'Šveicarijos frankas',
    major: { single: 'frankas', few: 'frankai', many: 'frankų' },
    minor: { single: 'santimas', few: 'santimai', many: 'santimų' }
  },
  'PLN': {
    symbol: 'zł',
    name: 'Lenkijos zlotas',
    major: { single: 'zlotas', few: 'zlotai', many: 'zlotų' },
    minor: { single: 'grašis', few: 'grašiai', many: 'grašių' }
  },
  'CZK': {
    symbol: 'Kč',
    name: 'Čekijos krona',
    major: { single: 'krona', few: 'kronos', many: 'kronų' },
    minor: { single: 'haleris', few: 'haleriai', many: 'halerių' }
  },
  'SEK': {
    symbol: 'kr',
    name: 'Švedijos krona',
    major: { single: 'krona', few: 'kronos', many: 'kronų' },
    minor: { single: 'erė', few: 'erės', many: 'erių' }
  },
  'NOK': {
    symbol: 'kr',
    name: 'Norvegijos krona',
    major: { single: 'krona', few: 'kronos', many: 'kronų' },
    minor: { single: 'erė', few: 'erės', many: 'erių' }
  },
  'DKK': {
    symbol: 'kr',
    name: 'Danijos krona',
    major: { single: 'krona', few: 'kronos', many: 'kronų' },
    minor: { single: 'erė', few: 'erės', many: 'erių' }
  },
  'ISK': {
    symbol: 'kr',
    name: 'Islandijos krona',
    major: { single: 'krona', few: 'kronos', many: 'kronų' },
    minor: { single: 'auris', few: 'auriai', many: 'aurių' }
  },
  'BGN': {
    symbol: 'лв',
    name: 'Bulgarijos levas',
    major: { single: 'levas', few: 'levai', many: 'levų' },
    minor: { single: 'stotinka', few: 'stotinkos', many: 'stotinkų' }
  },
  'RON': {
    symbol: 'lei',
    name: 'Rumunijos lėja',
    major: { single: 'lėja', few: 'lėjos', many: 'lėjų' },
    minor: { single: 'banas', few: 'banai', many: 'banų' }
  },
  'HUF': {
    symbol: 'Ft',
    name: 'Vengrijos forintas',
    major: { single: 'forintas', few: 'forintai', many: 'forintų' },
    minor: { single: 'fileris', few: 'fileriai', many: 'filerių' }
  },
  'HRK': {
    symbol: 'kn',
    name: 'Kroatijos kuna',
    major: { single: 'kuna', few: 'kunos', many: 'kunų' },
    minor: { single: 'lipa', few: 'lipos', many: 'lipų' }
  },
  'RSD': {
    symbol: 'din',
    name: 'Serbijos dinaras',
    major: { single: 'dinaras', few: 'dinarai', many: 'dinarų' },
    minor: { single: 'para', few: 'paros', many: 'parų' }
  },
  'RUB': {
    symbol: '₽',
    name: 'Rusijos rublis',
    major: { single: 'rublis', few: 'rubliai', many: 'rublių' },
    minor: { single: 'kapeika', few: 'kapeikos', many: 'kapeikų' }
  },
  'UAH': {
    symbol: '₴',
    name: 'Ukrainos grivina',
    major: { single: 'grivina', few: 'grivinos', many: 'grivinų' },
    minor: { single: 'kapeika', few: 'kapeikos', many: 'kapeikų' }
  },
  'BYN': {
    symbol: 'Br',
    name: 'Baltarusijos rublis',
    major: { single: 'baltarusijos rublis', few: 'baltarusijos rubliai', many: 'baltarusijos rublių' },
    minor: { single: 'kapeika', few: 'kapeikos', many: 'kapeikų' }
  },
  'TRY': {
    symbol: '₺',
    name: 'Turkijos lira',
    major: { single: 'lira', few: 'liros', many: 'lirų' },
    minor: { single: 'kuršas', few: 'kuršai', many: 'kuršų' }
  },
  'ILS': {
    symbol: '₪',
    name: 'Izraelio šekelis',
    major: { single: 'šekelis', few: 'šekeliai', many: 'šekelių' },
    minor: { single: 'agora', few: 'agoros', many: 'agorų' }
  },

  // Америка
  'USD': {
    symbol: '$',
    name: 'JAV doleris',
    major: { single: 'doleris', few: 'doleriai', many: 'dolerių' },
    minor: { single: 'centas', few: 'centai', many: 'centų' }
  },
  'CAD': {
    symbol: 'C$',
    name: 'Kanados doleris',
    major: { single: 'Kanados doleris', few: 'Kanados doleriai', many: 'Kanados dolerių' },
    minor: { single: 'centas', few: 'centai', many: 'centų' }
  },
  'MXN': {
    symbol: 'Mex$',
    name: 'Meksikos pesas',
    major: { single: 'pesas', few: 'pesai', many: 'pesų' },
    minor: { single: 'sentavas', few: 'sentavai', many: 'sentavų' }
  },
  'BRL': {
    symbol: 'R$',
    name: 'Brazilijos realas',
    major: { single: 'realas', few: 'realai', many: 'realų' },
    minor: { single: 'sentavas', few: 'sentavai', many: 'sentavų' }
  },
  'ARS': {
    symbol: '$',
    name: 'Argentinos pesas',
    major: { single: 'Argentinos pesas', few: 'Argentinos pesai', many: 'Argentinos pesų' },
    minor: { single: 'sentavas', few: 'sentavai', many: 'sentavų' }
  },
  'CLP': {
    symbol: '$',
    name: 'Čilės pesas',
    major: { single: 'Čilės pesas', few: 'Čilės pesai', many: 'Čilės pesų' },
    minor: { single: 'sentavas', few: 'sentavai', many: 'sentavų' }
  },
  'COP': {
    symbol: '$',
    name: 'Kolumbijos pesas',
    major: { single: 'Kolumbijos pesas', few: 'Kolumbijos pesai', many: 'Kolumbijos pesų' },
    minor: { single: 'sentavas', few: 'sentavai', many: 'sentavų' }
  },
  'CRC': {
    symbol: '₡',
    name: 'Kosta Rikos kolonas',
    major: { single: 'kolonas', few: 'kolonai', many: 'kolonų' },
    minor: { single: 'sentimas', few: 'sentimai', many: 'sentimų' }
  },
  'PYG': {
    symbol: '₲',
    name: 'Paragvajaus gvaranis',
    major: { single: 'gvaranis', few: 'gvaraniai', many: 'gvaranių' },
    minor: { single: 'sentimas', few: 'sentimai', many: 'sentimų' }
  },
  'UYU': {
    symbol: '$U',
    name: 'Urugvajaus pesas',
    major: { single: 'Urugvajaus pesas', few: 'Urugvajaus pesai', many: 'Urugvajaus pesų' },
    minor: { single: 'sentesimas', few: 'sentesimai', many: 'sentesimų' }
  },
  'BOB': {
    symbol: 'Bs',
    name: 'Bolivijos bolivianas',
    major: { single: 'bolivianas', few: 'bolivianai', many: 'bolivianų' },
    minor: { single: 'sentavas', few: 'sentavai', many: 'sentavų' }
  },
  'PEN': {
    symbol: 'S/',
    name: 'Peru solis',
    major: { single: 'solis', few: 'soliai', many: 'solių' },
    minor: { single: 'sentimas', few: 'sentimai', many: 'sentimų' }
  },

  // Азия
  'JPY': {
    symbol: '¥',
    name: 'Japonijos jena',
    major: { single: 'jena', few: 'jenos', many: 'jenų' },
    minor: null
  },
  'CNY': {
    symbol: '¥',
    name: 'Kinijos juanis',
    major: { single: 'juanis', few: 'juaniai', many: 'juanių' },
    minor: { single: 'fenas', few: 'fenai', many: 'fenų' }
  },
  'KRW': {
    symbol: '₩',
    name: 'Pietų Korėjos vona',
    major: { single: 'vona', few: 'vonos', many: 'vonų' },
    minor: null
  },
  'INR': {
    symbol: '₹',
    name: 'Indijos rupija',
    major: { single: 'rupija', few: 'rupijos', many: 'rupijų' },
    minor: { single: 'paisa', few: 'paisos', many: 'paisų' }
  },
  'IDR': {
    symbol: 'Rp',
    name: 'Indonezijos rupija',
    major: { single: 'Indonezijos rupija', few: 'Indonezijos rupijos', many: 'Indonezijos rupijų' },
    minor: { single: 'senas', few: 'senai', many: 'senų' }
  },
  'THB': {
    symbol: '฿',
    name: 'Tailando batas',
    major: { single: 'batas', few: 'batai', many: 'batų' },
    minor: { single: 'satangas', few: 'satangai', many: 'satangų' }
  },
  'VND': {
    symbol: '₫',
    name: 'Vietnamo dongas',
    major: { single: 'dongas', few: 'dongai', many: 'dongų' },
    minor: null
  },
  'PHP': {
    symbol: '₱',
    name: 'Filipinų pesas',
    major: { single: 'pesas', few: 'pesai', many: 'pesų' },
    minor: { single: 'sentimas', few: 'sentimai', many: 'sentimų' }
  },
  'MYR': {
    symbol: 'RM',
    name: 'Malaizijos ringitas',
    major: { single: 'ringitas', few: 'ringitai', many: 'ringitų' },
    minor: { single: 'senas', few: 'senai', many: 'senų' }
  },
  'SGD': {
    symbol: 'S$',
    name: 'Singapūro doleris',
    major: { single: 'Singapūro doleris', few: 'Singapūro doleriai', many: 'Singapūro dolerių' },
    minor: { single: 'centas', few: 'centai', many: 'centų' }
  },
  'HKD': {
    symbol: 'HK$',
    name: 'Honkongo doleris',
    major: { single: 'Honkongo doleris', few: 'Honkongo doleriai', many: 'Honkongo dolerių' },
    minor: { single: 'centas', few: 'centai', many: 'centų' }
  },
  'TWD': {
    symbol: 'NT$',
    name: 'Taivano doleris',
    major: { single: 'Taivano doleris', few: 'Taivano doleriai', many: 'Taivano dolerių' },
    minor: { single: 'centas', few: 'centai', many: 'centų' }
  },
  'PKR': {
    symbol: '₨',
    name: 'Pakistano rupija',
    major: { single: 'Pakistano rupija', few: 'Pakistano rupijos', many: 'Pakistano rupijų' },
    minor: { single: 'paisa', few: 'paisos', many: 'paisų' }
  },
  'BDT': {
    symbol: '৳',
    name: 'Bangladešo taka',
    major: { single: 'taka', few: 'takos', many: 'takų' },
    minor: { single: 'paisa', few: 'paisos', many: 'paisų' }
  },
  'LKR': {
    symbol: 'Rs',
    name: 'Šri Lankos rupija',
    major: { single: 'Šri Lankos rupija', few: 'Šri Lankos rupijos', many: 'Šri Lankos rupijų' },
    minor: { single: 'centas', few: 'centai', many: 'centų' }
  },
  'KZT': {
    symbol: '₸',
    name: 'Kazachstano tengė',
    major: { single: 'tengė', few: 'tengės', many: 'tengių' },
    minor: { single: 'tijinas', few: 'tijinai', many: 'tijinų' }
  },
  'AZN': {
    symbol: '₼',
    name: 'Azerbaidžano manatas',
    major: { single: 'manatas', few: 'manatai', many: 'manatų' },
    minor: { single: 'kapeika', few: 'kapeikos', many: 'kapeikų' }
  },
  'GEL': {
    symbol: '₾',
    name: 'Gruzijos laris',
    major: { single: 'laris', few: 'lariai', many: 'larių' },
    minor: { single: 'tetris', few: 'tetriai', many: 'tetrių' }
  },
  'AMD': {
    symbol: '֏',
    name: 'Armėnijos dramas',
    major: { single: 'dramas', few: 'dramai', many: 'dramų' },
    minor: { single: 'luma', few: 'lumos', many: 'lumų' }
  },
  'LAK': {
    symbol: '₭',
    name: 'Laoso kipas',
    major: { single: 'kipas', few: 'kipai', many: 'kipų' },
    minor: { single: 'atas', few: 'atai', many: 'atų' }
  },
  'MMK': {
    symbol: 'K',
    name: 'Mianmaro kijatas',
    major: { single: 'kijatas', few: 'kijatai', many: 'kijatų' },
    minor: { single: 'pija', few: 'pijos', many: 'pijų' }
  },
  'KHR': {
    symbol: '៛',
    name: 'Kambodžos rielis',
    major: { single: 'rielis', few: 'rieliai', many: 'rielių' },
    minor: { single: 'senas', few: 'senai', many: 'senų' }
  },
  'NPR': {
    symbol: 'Rs',
    name: 'Nepalo rupija',
    major: { single: 'Nepalo rupija', few: 'Nepalo rupijos', many: 'Nepalo rupijų' },
    minor: { single: 'paisa', few: 'paisos', many: 'paisų' }
  },
  'AFN': {
    symbol: '؋',
    name: 'Afganistano afganas',
    major: { single: 'afganas', few: 'afganai', many: 'afganų' },
    minor: { single: 'pulis', few: 'puliai', many: 'pulių' }
  },
  'MNT': {
    symbol: '₮',
    name: 'Mongolijos tugrikas',
    major: { single: 'tugrikas', few: 'tugrikai', many: 'tugrikų' },
    minor: { single: 'mengas', few: 'mengai', many: 'mengų' }
  },

  // Океания
  'AUD': {
    symbol: 'A$',
    name: 'Australijos doleris',
    major: { single: 'Australijos doleris', few: 'Australijos doleriai', many: 'Australijos dolerių' },
    minor: { single: 'centas', few: 'centai', many: 'centų' }
  },
  'NZD': {
    symbol: 'NZ$',
    name: 'Naujosios Zelandijos doleris',
    major: { single: 'Naujosios Zelandijos doleris', few: 'Naujosios Zelandijos doleriai', many: 'Naujosios Zelandijos dolerių' },
    minor: { single: 'centas', few: 'centai', many: 'centų' }
  },

  // Африка
  'ZAR': {
    symbol: 'R',
    name: 'Pietų Afrikos randas',
    major: { single: 'randas', few: 'randai', many: 'randų' },
    minor: { single: 'centas', few: 'centai', many: 'centų' }
  },
  'NGN': {
    symbol: '₦',
    name: 'Nigerijos naira',
    major: { single: 'naira', few: 'nairos', many: 'nairų' },
    minor: { single: 'kobo', few: 'kobo', many: 'kobo' }
  },
  'EGP': {
    symbol: '£',
    name: 'Egipto svaras',
    major: { single: 'Egipto svaras', few: 'Egipto svarai', many: 'Egipto svarų' },
    minor: { single: 'piastras', few: 'piastrai', many: 'piastrų' }
  },
  'KES': {
    symbol: 'KSh',
    name: 'Kenijos šilingas',
    major: { single: 'Kenijos šilingas', few: 'Kenijos šilingai', many: 'Kenijos šilingų' },
    minor: { single: 'centas', few: 'centai', many: 'centų' }
  },
  'GHS': {
    symbol: '₵',
    name: 'Ganos sedis',
    major: { single: 'sedis', few: 'sedžiai', many: 'sedžių' },
    minor: { single: 'peseva', few: 'pesevos', many: 'pesevų' }
  },
  'MAD': {
    symbol: 'DH',
    name: 'Maroko dirhamas',
    major: { single: 'dirhamas', few: 'dirhamai', many: 'dirhamų' },
    minor: { single: 'santimas', few: 'santimai', many: 'santimų' }
  },
  'TND': {
    symbol: 'DT',
    name: 'Tuniso dinaras',
    major: { single: 'dinaras', few: 'dinarai', many: 'dinarų' },
    minor: { single: 'milimas', few: 'milimai', many: 'milimų' }
  },

  // Ближний Восток
  'AED': {
    symbol: 'DH',
    name: 'Arabų Emyratų dirhamas',
    major: { single: 'dirhamas', few: 'dirhamai', many: 'dirhamų' },
    minor: { single: 'filsas', few: 'filsai', many: 'filsų' }
  },
  'SAR': {
    symbol: 'SR',
    name: 'Saudo Arabijos rijalis',
    major: { single: 'rijalis', few: 'rijaliai', many: 'rijalių' },
    minor: { single: 'halalas', few: 'halalai', many: 'halalų' }
  },
  'QAR': {
    symbol: 'QR',
    name: 'Kataro rijalis',
    major: { single: 'rijalis', few: 'rijaliai', many: 'rijalių' },
    minor: { single: 'dirhamas', few: 'dirhamai', many: 'dirhamų' }
  },
  'KWD': {
    symbol: 'KD',
    name: 'Kuveito dinaras',
    major: { single: 'dinaras', few: 'dinarai', many: 'dinarų' },
    minor: { single: 'filsas', few: 'filsai', many: 'filsų' }
  },
  'BHD': {
    symbol: 'BD',
    name: 'Bahreino dinaras',
    major: { single: 'dinaras', few: 'dinarai', many: 'dinarų' },
    minor: { single: 'filsas', few: 'filsai', many: 'filsų' }
  },
  'OMR': {
    symbol: 'OMR',
    name: 'Omano rijalis',
    major: { single: 'rijalis', few: 'rijaliai', many: 'rijalių' },
    minor: { single: 'baisa', few: 'baisos', many: 'baisų' }
  },
  'JOD': {
    symbol: 'JD',
    name: 'Jordanijos dinaras',
    major: { single: 'dinaras', few: 'dinarai', many: 'dinarų' },
    minor: { single: 'filsas', few: 'filsai', many: 'filsų' }
  },
};

// Lithuanian number to words conversion with proper declension
const sum_in_words_lt = (amount, currency = 'EUR') => {
  const ones_lt = (n, gender = 'm') => {
    const masculine = ['', 'vienas', 'du', 'trys', 'keturi', 'penki', 'šeši', 'septyni', 'aštuoni', 'devyni'];
    const feminine = ['', 'viena', 'dvi', 'trys', 'keturios', 'penkios', 'šešios', 'septynios', 'aštuonios', 'devynios'];
    return gender === 'f' ? feminine[n] : masculine[n];
  };

  const tens_lt = (n, gender = 'm') => {
    const tens_names = ['', 'dešimt', 'dvidešimt', 'trisdešimt', 'keturiasdešimt', 
                        'penkiasdešimt', 'šešiasdešimt', 'septyniasdešimt', 
                        'aštuoniasdešimt', 'devyniasdešimt'];
    const teens = ['dešimt', 'vienuolika', 'dvylika', 'trylika', 'keturiolika',
                    'penkiolika', 'šešiolika', 'septyniolika', 'aštuoniolika', 'devyniolika'];

    if (n < 10) return ones_lt(n, gender);
    if (n < 20) return teens[n - 10];

    const tens_part = tens_names[Math.floor(n / 10)];
    const ones_part = ones_lt(n % 10, gender);
    return `${tens_part} ${ones_part}`.trim();
  };

  const hundreds_lt = (n, gender = 'm') => {
    const hundreds_names = ['', 'vienas šimtas', 'du šimtai', 'trys šimtai', 'keturi šimtai',
                            'penki šimtai', 'šeši šimtai', 'septyni šimtai', 'aštuoni šimtai', 'devyni šimtai'];
    
    if (n === 0) return '';
    
    const result = [];
    if (n >= 100) {
      result.push(hundreds_names[Math.floor(n / 100)]);
      n = n % 100;
    }
    if (n > 0) {
      result.push(n < 10 ? ones_lt(n, gender) : tens_lt(n, gender));
    }
    return result.join(' ');
  };

  const get_scale_word = (n, scale) => {
    if (scale === 'million') {
      if (n % 10 === 0 || (n % 100 >= 11 && n % 100 <= 19)) return 'milijonų';
      if (n % 10 === 1) return 'milijonas';
      return 'milijonai';
    } else if (scale === 'thousand') {
      if (n % 10 === 0 || (n % 100 >= 11 && n % 100 <= 19)) return 'tūkstančių';
      if (n % 10 === 1) return 'tūkstantis';
      return 'tūkstančiai';
    }
  };

  const number_to_words = (n, genderOverride = null) => {
    if (n === 0) return '';
    
    const result = [];
    
    const millions = Math.floor(n / 1000000);
    if (millions > 0) {
      result.push(`${hundreds_lt(millions)} ${get_scale_word(millions, 'million')}`);
    }
    
    const thousands = Math.floor((n % 1000000) / 1000);
    if (thousands > 0) {
      result.push(`${hundreds_lt(thousands, 'm')} ${get_scale_word(thousands, 'thousand')}`);
    }
    
    const remainder = n % 1000;
    if (remainder > 0) {
      const gender = genderOverride || 'm';
      result.push(hundreds_lt(remainder, gender));
    }
    
    return result.join(' ');
  };

  const currency_form = (n, type) => {
    const currencyData = CURRENCY_DATA[currency] || CURRENCY_DATA['EUR'];
    const unit = type === 'major' ? currencyData.major : currencyData.minor;
    
    if (!unit) return currency;
    
    const lastTwoDigits = n % 100;
    const lastDigit = n % 10;
    
    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return unit.many;
    if (lastDigit === 0) return unit.many;
    if (lastDigit === 1) return unit.single;
    
    return unit.few;
  };

  const getLastSignificantPart = (n) => {
    const remainder = n % 1000;
    if (remainder > 0) return remainder;
    
    const thousands = Math.floor((n % 1000000) / 1000);
    if (thousands > 0) return 0;
    
    return 0;
  };

  // Main logic
  const whole = Math.floor(amount);
  const fraction = Math.round((amount - whole) * 100);
  
  const result = [];
  
  // Determine gender of major currency unit
  const majorUnit = CURRENCY_DATA[currency]?.major?.single || '';
  const isMajorFeminine = majorUnit.endsWith('a') || majorUnit.endsWith('ė');
  const majorGender = isMajorFeminine ? 'f' : 'm';
  
  // Process whole part
  if (whole === 0) {
    result.push(`nulis ${currency_form(0, 'major')}`);
  } else {
    const words = number_to_words(whole, majorGender);
    const lastPart = getLastSignificantPart(whole);
    const curr = currency_form(lastPart, 'major');
    result.push(`${words} ${curr}`);
  }
  
  // Process fractional part
  const hasFraction = CURRENCY_DATA[currency]?.minor !== null && CURRENCY_DATA[currency]?.minor !== undefined;
  if (fraction > 0 && hasFraction) {
    const minorUnit = CURRENCY_DATA[currency].minor.single;
    const isFeminine = minorUnit.endsWith('a') || minorUnit.endsWith('ė');
    const gender = isFeminine ? 'f' : 'm';
    
    const words = hundreds_lt(fraction, gender);
    const curr = currency_form(fraction, 'minor');
    result.push(`${words} ${curr}`);
  }
  
  return result.join(' ').trim();
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'DejaVu Sans' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  logo: { width: 120, height: 60, objectFit: 'contain' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'right' },
  invoiceInfo: { textAlign: 'right', fontSize: 9, marginTop: 5 },

  partiesRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  column: { width: '48%' },
  sectionTitle: { fontSize: 11, fontWeight: 'bold', marginBottom: 5, color: '#333' },
  infoBox: { border: '1 solid #e0e0e0', padding: 10, borderRadius: 4 },
  infoRow: { flexDirection: 'row', marginBottom: 3 },
  label: { fontSize: 9, color: '#666', width: 100 },
  value: { fontSize: 9, color: '#000', flex: 1 },

  table: { marginTop: 15, marginBottom: 15 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f5f5f5', padding: 8, fontWeight: 'bold', fontSize: 7, borderBottom: '2 solid #333' },
  tableRow: { flexDirection: 'row', padding: 6, borderBottom: '1 solid #e0e0e0', fontSize: 7, minHeight: 20 },

  summaryBox: { marginTop: 20, marginLeft: 'auto', width: '50%' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 5, fontSize: 9 },
  summaryRowBold: { flexDirection: 'row', justifyContent: 'space-between', padding: 5, fontSize: 11, fontWeight: 'bold', backgroundColor: '#f5f5f5', marginTop: 5 },
  sumInWords: { marginTop: 10, padding: 8, fontSize: 8, fontStyle: 'italic', color: '#555', borderTop: '1 solid #e0e0e0' },

  footer: { 
    position: 'absolute', 
    bottom: 30, 
    left: 40, 
    right: 40, 
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 8, 
    color: '#666' 
  },
});

// numbers
const toNumber = (v) => {
  if (typeof v === 'number') return v;
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const formatCurrency = (numLike) => toNumber(numLike).toFixed(2).replace('.', ',');
const formatNumber = (numLike) => String(toNumber(numLike)).replace('.', ',');
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? '' : date.toLocaleDateString('lt-LT');
};

const InfoRow = ({ label, value, isPhone = false }) => {
  const val = (value ?? '').toString().trim();
  if (!val) return null;
  if (isPhone && !/\d/.test(val)) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{val}</Text>
    </View>
  );
};
const hasAnyValue = (obj) => {
  if (!obj) return false;
  return Object.values(obj).some((v) => String(v ?? '').trim() !== '');
};

const getCodeField = (party) => {
  if (!party) {
    return { label: 'Įmonės kodas:', value: '' };
  }

  // 1) пробуем iv_numeris / ivNumeris (инд. veikla)
  const iv = party.iv_numeris || party.ivNumeris;
  if (iv) {
    return {
      label: 'Ind. veiklos numeris:',
      value: iv,
    };
  }

  // 2) иначе обычный įmonės kodas
  return {
    label: 'Įmonės kodas:',
    value: party.imonesKodas || '',
  };
};


const InvoicePDF = ({ data, logo, sumos }) => {
  const currencyCode = data?.valiuta || 'EUR';
  const currencySymbol = getCurrencySymbol(currencyCode);
  const pvmTaikoma = data?.pvmTipas === 'taikoma';
  
  const hasBarcodes = Array.isArray(data?.eilutes)
    ? data.eilutes.some((e) => e?.barkodas && String(e.barkodas).trim() !== '')
    : false;

  const priceHeader = pvmTaikoma ? 'Kaina be PVM' : 'Kaina';
  const sumHeader = pvmTaikoma ? 'Suma be PVM' : 'Suma';

  const columnWidths = hasBarcodes
    ? { col1: { width: '30%' }, col2: { width: '10%' }, col3: { width: '10%' }, col4: { width: '10%' }, col5: { width: '10%' }, col6: { width: '15%', textAlign: 'right' }, col7: { width: '15%', textAlign: 'right' } }
    : { col1: { width: '40%' }, col2: { width: '10%' }, col4: { width: '10%' }, col5: { width: '10%' }, col6: { width: '15%', textAlign: 'right' }, col7: { width: '15%', textAlign: 'right' } };

  const sellerHas = hasAnyValue(data?.seller);
  const buyerHas  = hasAnyValue(data?.buyer);
  const leftColStyle  = sellerHas && buyerHas ? styles.column : { width: '100%' };
  const rightColStyle = sellerHas && buyerHas ? styles.column : { width: '100%' };

  const buyerCodeField  = getCodeField(data?.buyer);
  const sellerCodeField = getCodeField(data?.seller);

  const titleParts = [];
  if (data?.saskaitosSerija) titleParts.push(`Serija ${data.saskaitosSerija}`);
  titleParts.push(`Nr. ${data?.saskaitosNumeris || ''}`.trimEnd());
  const idLine = titleParts.join(' ');

  const nuolaida = toNumber(data?.nuolaida);
  const pristatymas = toNumber(data?.pristatymoMokestis);
  const hasDiscount = nuolaida > 0;
  const hasDelivery = pristatymas > 0;

  // Generate sum in words with proper currency
  const finalAmount = pvmTaikoma ? toNumber(sumos?.sumaSuPvm) : toNumber(sumos?.sumaBePvm);
  const sumInWords = sum_in_words_lt(finalAmount, currencyCode);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>{logo ? <Image src={logo} style={styles.logo} /> : null}</View>
          <View>
            <Text style={styles.title}>
              {pvmTaikoma ? 'PVM SĄSKAITA FAKTŪRA' : 'SĄSKAITA FAKTŪRA'}
            </Text>
            <View style={styles.invoiceInfo}>
              <Text>{idLine}</Text>
              <Text>Data: {formatDate(data?.saskaitosData)}</Text>
              {data?.moketiIki ? <Text>Mokėti iki: {formatDate(data.moketiIki)}</Text> : null}
              {data?.uzsakymoNumeris ? <Text>Užsakymo Nr.: {data.uzsakymoNumeris}</Text> : null}
            </View>
          </View>
        </View>

        {/* Pirkėjas & Pardavėjas */}
        {sellerHas || buyerHas ? (
          <View style={styles.partiesRow}>
            {buyerHas ? (
              <View style={leftColStyle}>
                <Text style={styles.sectionTitle}>PIRKĖJAS</Text>
                <View style={styles.infoBox}>
                  <InfoRow label="Pavadinimas:"  value={data?.buyer?.pavadinimas} />
                  <InfoRow
                    label={buyerCodeField.label}
                    value={buyerCodeField.value}
                  />
                  <InfoRow label="PVM kodas:"    value={data?.buyer?.pvmKodas} />
                  <InfoRow label="Adresas:"      value={data?.buyer?.adresas} />
                  <InfoRow label="Telefonas:"    value={data?.buyer?.telefonas} isPhone />
                  <InfoRow label="Bankas:"       value={data?.buyer?.bankoPavadinimas} />
                  <InfoRow label="IBAN:"         value={data?.buyer?.iban} />
                  <InfoRow label="SWIFT:"        value={data?.buyer?.swift} />
                </View>
              </View>
            ) : null}

            {sellerHas ? (
              <View style={rightColStyle}>
                <Text style={styles.sectionTitle}>PARDAVĖJAS</Text>
                <View style={styles.infoBox}>
                  <InfoRow label="Pavadinimas:"  value={data?.seller?.pavadinimas} />
                  <InfoRow
                    label={sellerCodeField.label}
                    value={sellerCodeField.value}
                  />
                  <InfoRow label="PVM kodas:"    value={data?.seller?.pvmKodas} />
                  <InfoRow label="Adresas:"      value={data?.seller?.adresas} />
                  <InfoRow label="Telefonas:"    value={data?.seller?.telefonas} isPhone />
                  <InfoRow label="Bankas:"       value={data?.seller?.bankoPavadinimas} />
                  <InfoRow label="IBAN:"         value={data?.seller?.iban} />
                  <InfoRow label="SWIFT:"        value={data?.seller?.swift} />
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={columnWidths.col1}>Pavadinimas</Text>
            <Text style={columnWidths.col2}>Kodas</Text>
            {hasBarcodes ? <Text style={columnWidths.col3}>Barkodas</Text> : null}
            <Text style={columnWidths.col4}>Kiekis</Text>
            <Text style={columnWidths.col5}>Mato vnt.</Text>
            <Text style={columnWidths.col6}>{priceHeader}</Text>
            <Text style={columnWidths.col7}>{sumHeader}</Text>
          </View>

          {(data?.eilutes || []).map((eilute, index) => {
            const qty = toNumber(eilute?.kiekis);
            const price = toNumber(eilute?.kainaBePvm);
            const lineSum = qty * price;

            return (
              <View key={index} style={styles.tableRow}>
                <Text style={columnWidths.col1}>{eilute?.pavadinimas || ''}</Text>
                <Text style={columnWidths.col2}>{eilute?.kodas || ''}</Text>
                {hasBarcodes ? <Text style={columnWidths.col3}>{eilute?.barkodas || ''}</Text> : null}
                <Text style={columnWidths.col4}>{formatNumber(qty)}</Text>
                <Text style={columnWidths.col5}>{eilute?.matoVnt || ''}</Text>
                <Text style={columnWidths.col6}>{formatCurrency(price)} {currencySymbol}</Text>
                <Text style={columnWidths.col7}>{formatCurrency(lineSum)} {currencySymbol}</Text>
              </View>
            );
          })}
        </View>

        {/* Totals */}
        <View style={styles.summaryBox}>
          {pvmTaikoma ? (
            <>
              {(hasDiscount || hasDelivery) && (
                <View style={styles.summaryRow}>
                  <Text>Tarpinė suma:</Text>
                  <Text>{sumos?.tarpineSuma || '0,00'} {currencySymbol}</Text>
                </View>
              )}

              {hasDiscount && (
                <View style={styles.summaryRow}>
                  <Text>Nuolaida:</Text>
                  <Text>-{formatCurrency(nuolaida)} {currencySymbol}</Text>
                </View>
              )}

              {hasDelivery && (
                <View style={styles.summaryRow}>
                  <Text>Pristatymo mokestis:</Text>
                  <Text>+{formatCurrency(pristatymas)} {currencySymbol}</Text>
                </View>
              )}

              <View style={styles.summaryRow}>
                <Text>Suma be PVM:</Text>
                <Text>{sumos?.sumaBePvm || '0,00'} {currencySymbol}</Text>
              </View>

              <View style={styles.summaryRow}>
                <Text>PVM {toNumber(data?.pvmProcent)}%:</Text>
                <Text>{sumos?.pvmSuma || '0,00'} {currencySymbol}</Text>
              </View>

              <View style={styles.summaryRowBold}>
                <Text>SUMA SU PVM:</Text>
                <Text>{sumos?.sumaSuPvm || '0,00'} {currencySymbol}</Text>
              </View>

              <View style={styles.sumInWords}>
                <Text>Suma žodžiais: {sumInWords}</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.summaryRow}>
                <Text>Tarpinė suma:</Text>
                <Text>{sumos?.tarpineSuma || '0,00'} {currencySymbol}</Text>
              </View>

              {hasDiscount && (
                <View style={styles.summaryRow}>
                  <Text>Nuolaida:</Text>
                  <Text>-{formatCurrency(nuolaida)} {currencySymbol}</Text>
                </View>
              )}

              {hasDelivery && (
                <View style={styles.summaryRow}>
                  <Text>Pristatymo mokestis:</Text>
                  <Text>+{formatCurrency(pristatymas)} {currencySymbol}</Text>
                </View>
              )}

              <View style={styles.summaryRowBold}>
                <Text>BENDRA SUMA:</Text>
                <Text>{sumos?.sumaBePvm || '0,00'} {currencySymbol}</Text>
              </View>

              <View style={styles.sumInWords}>
                <Text>Suma žodžiais: {sumInWords}</Text>
              </View>
            </>
          )}
        </View>

        {/* Footer with page numbers */}
        <View style={styles.footer} fixed>
          <Text>Dokumentas sugeneruotas DokSkenu</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
};

export default InvoicePDF;
