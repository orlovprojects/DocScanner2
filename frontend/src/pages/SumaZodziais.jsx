import { useState } from 'react';
import { Helmet } from "react-helmet";
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  MenuItem,
  Container,
  InputAdornment,
  IconButton,
  Snackbar,
  Alert,
  Link,
  Dialog,
  DialogContent,
} from '@mui/material';
import { ContentCopy as CopyIcon, Refresh as RefreshIcon, Close as CloseIcon } from '@mui/icons-material';
import AdSection from '../page_elements/AdSection';

// ---- Currency Data with Lithuanian declensions ----
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

// ---- Lithuanian number to words conversion ----
const sumInWordsLt = (amount, currency = 'EUR') => {
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

  const whole = Math.floor(amount);
  const fraction = Math.round((amount - whole) * 100);
  
  const result = [];
  
  const majorUnit = CURRENCY_DATA[currency]?.major?.single || '';
  const isMajorFeminine = majorUnit.endsWith('a') || majorUnit.endsWith('ė');
  const majorGender = isMajorFeminine ? 'f' : 'm';
  
  if (whole === 0) {
    result.push(`Nulis ${currency_form(0, 'major')}`);
  } else {
    const words = number_to_words(whole, majorGender);
    const lastPart = getLastSignificantPart(whole);
    const curr = currency_form(lastPart, 'major');
    const firstWord = words.charAt(0).toUpperCase() + words.slice(1);
    result.push(`${firstWord} ${curr}`);
  }
  
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

// ---- Helpers ----
const parseLocale = (v) => {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const cleaned = String(v).replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const formatAmount = (v) => {
  if (!v) return '';

  let cleaned = String(v).replace(/\s/g, '');

  const hasDecimalSep = /[,.]/.test(cleaned);
  const endsWithSep = /[,.]$/.test(cleaned);

  cleaned = cleaned.replace(/\./g, ',');

  const parts = cleaned.split(',');
  let wholePart = parts[0];
  let decimalPart = parts.length > 1 ? parts.slice(1).join('') : '';

  wholePart = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  if (decimalPart.length > 2) {
    decimalPart = decimalPart.substring(0, 2);
  }

  if (decimalPart || (hasDecimalSep && endsWithSep)) {
    return `${wholePart},${decimalPart}`;
  }

  return wholePart;
};

// ---- UI tokens ----
const palette = {
  primary: '#1976d2',
  bgSection: '#fafafa',
  border: '#e0e0e0',
};

const sectionSx = {
  p: 2.5,
  backgroundColor: palette.bgSection,
  borderRadius: 3,
  border: `1px solid ${palette.border}`,
};

const titleSx = {
  fontSize: 18,
  fontWeight: 700,
  mb: 1.5,
  color: '#333',
};

// ---- Main Component ----
const SumaZodziais = () => {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [result, setResult] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);

  const handleAmountChange = (e) => {
    let v = e.target.value;
    v = v.replace(/[^\d\s,.]/g, '');

    const commaCount = (v.match(/,/g) || []).length;
    const dotCount = (v.match(/\./g) || []).length;
    if (commaCount + dotCount > 1) return;

    setAmount(v);
  };

  const handleAmountBlur = () => {
    if (!amount) return;
    setAmount(formatAmount(amount));
  };

  const handleGenerate = () => {
    const num = parseLocale(amount);

    if (!num || num <= 0) {
      setResult('');
      return;
    }

    const rounded = Math.round(num * 100) / 100;
    const words = sumInWordsLt(rounded, currency);
    setResult(words);
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setSnackbarOpen(true);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleReset = () => {
    setAmount('');
    setResult('');
  };

  const currencySymbol = CURRENCY_DATA[currency]?.symbol || currency;

  const sortedCurrencies = Object.entries(CURRENCY_DATA).sort((a, b) => 
    a[1].name.localeCompare(b[1].name)
  );

  return (
    <>
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: 'auto' }}>
        <Helmet>
          <title>Nemokamas sumos žodžiais generatorius (su valiutomis) – DokSkenas</title>
          <meta
            name="description"
            content="Nemokamai konvertuokite sumą skaičių į sumą žodžius lietuvių kalba su valiutomis. Palaikoma daugiau nei 70 pasaulio valiutų."
          />
        </Helmet>

        <Paper
          sx={{
            p: { xs: 2, md: 3 },
            borderRadius: 4,
            '& .MuiOutlinedInput-root': { backgroundColor: '#fff' },
          }}
        >
          <Typography variant="h1" gutterBottom sx={{ color: palette.primary, fontWeight: 500, fontSize: 28 }}>
            Suma žodžiais generatorius
          </Typography>

          <Typography sx={{ mb: 3, color: '#666', fontSize: 14 }}>
            Konvertuokite sumą su valiuta į sumą žodžiais lietuvių kalba
          </Typography>

          {/* Input Section */}
          <Box sx={{ ...sectionSx, mb: 3 }}>
            <Typography sx={titleSx}>Įveskite sumą</Typography>
            <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
              <TextField
                fullWidth
                label="Suma"
                type="text"
                inputProps={{ inputMode: 'decimal' }}
                value={amount}
                onChange={handleAmountChange}
                onBlur={handleAmountBlur}
                onFocus={() => {
                  if (amount === '0') setAmount('');
                }}
                placeholder="1 250,50"
                InputProps={{
                  endAdornment: <InputAdornment position="end">{currencySymbol}</InputAdornment>,
                }}
                sx={{ flex: 2 }}
              />

              <TextField
                select
                label="Valiuta"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                sx={{ flex: 1, minWidth: 200 }}
              >
                {sortedCurrencies.map(([code, data]) => (
                  <MenuItem key={code} value={code}>
                    {data.symbol} - {data.name}
                  </MenuItem>
                ))}
              </TextField>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
              <Button
                variant="contained"
                onClick={handleGenerate}
                fullWidth
                size="large"
                sx={{ flex: 1, py: 1.5, fontSize: '16px' }}
                disabled={!amount || parseLocale(amount.replace(/\s/g, '')) <= 0}
              >
                Generuoti
              </Button>
              <Button
                variant="outlined"
                onClick={handleReset}
                startIcon={<RefreshIcon />}
                size="large"
                sx={{ flex: 1, py: 1.5, fontSize: '16px' }}
              >
                Iš naujo
              </Button>
            </Box>
          </Box>

          {/* Result Section */}
          {result && (
            <Box sx={{ ...sectionSx }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Typography sx={{ ...titleSx, mb: 0 }}>Rezultatas</Typography>
                <IconButton
                  onClick={handleCopy}
                  size="small"
                  sx={{
                    backgroundColor: palette.primary,
                    color: '#fff',
                    '&:hover': { backgroundColor: '#1565c0' },
                  }}
                  title="Kopijuoti"
                >
                  <CopyIcon fontSize="small" />
                </IconButton>
              </Box>

              <Box
                sx={{
                  p: 2.5,
                  backgroundColor: '#fff',
                  borderRadius: 2,
                  border: `2px solid ${palette.primary}`,
                  minHeight: 80,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Typography
                  sx={{
                    fontSize: 16,
                    lineHeight: 1.6,
                    color: '#333',
                    fontWeight: 500,
                  }}
                >
                  {result}
                </Typography>
              </Box>
            </Box>
          )}

          {/* Ad Section */}
          <AdSection onOpenVideo={() => setVideoOpen(true)} />
        </Paper>
      </Box>

      {/* Video Modal */}
      <Dialog
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { backgroundColor: 'transparent', boxShadow: 'none' },
        }}
      >
        <DialogContent sx={{ p: 0, position: 'relative' }}>
          <IconButton
            onClick={() => setVideoOpen(false)}
            sx={{
              position: 'absolute',
              top: -40,
              right: 0,
              color: '#fff',
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
            }}
          >
            <CloseIcon />
          </IconButton>
          <Box
            component="iframe"
            src="https://www.youtube.com/embed/ByViuilYxZA?autoplay=1"
            title="DokSkenas demo"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            sx={{
              width: '100%',
              aspectRatio: '16/9',
              border: 'none',
              borderRadius: 2,
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Content Section */}
      <SumaZodziasiInfo />

      {/* Snackbar */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnackbarOpen(false)} severity="success" sx={{ width: '100%' }}>
          Nukopijuota į iškarpinę!
        </Alert>
      </Snackbar>
    </>
  );
};

// Content Component
function SumaZodziasiInfo() {
  return (
    <Container maxWidth="md" sx={{ mt: 8, mb: 10 }}>
      {/* Kaip veikia suma žodžiais generatorius? */}
      <Typography
        variant="h2"
        sx={{
          mt: 5,
          mb: 2,
          fontSize: { xs: '20px', sm: '26px' },
          fontFamily: 'Helvetica',
          fontWeight: 'bold',
          color: '#000',
        }}
      >
        Kaip veikia suma žodžiais generatorius?
      </Typography>

      <Box sx={{ lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
        <Typography sx={{ mb: 2 }}>
          Mūsų įrankis konvertuoja bet tokią sumą (skaičių) į sumą žodžiais lietuvių kalba.
        </Typography>
        <Typography sx={{ mb: 2 }}>
          Tereikia tik įvesti skaičių, pasirinkti valiutą iš sąrašo ir paspausti ant „Generuoti" mygtuko.
        </Typography>
        <Typography sx={{ mb: 2 }}>
          Generatorius akimirksniu atliks konvertaciją bei parodys rezultatą, kurį galėsite nukopijuoti į iškarpinę.
        </Typography>
      </Box>

      {/* Kam tai reikalinga? */}
      <Typography
        variant="h2"
        sx={{
          mt: 5,
          mb: 2,
          fontSize: { xs: '20px', sm: '26px' },
          fontFamily: 'Helvetica',
          fontWeight: 'bold',
          color: '#000',
        }}
      >
        Kam tai reikalinga?
      </Typography>

      <Box
        component="ul"
        sx={{
          pl: 3,
          lineHeight: 1.7,
          fontSize: '16px',
          fontFamily: 'Helvetica',
          color: '#000',
          mb: 4,
        }}
      >
        <li>
          <Link
            href={`${import.meta.env.VITE_BASE_URL}saskaita-faktura`}
            underline="hover"
            sx={{ color: 'inherit' }}
          >
            Sąskaitų faktūrų išrašymui
          </Link>
        </li>
        <li>Sutarčių sudarymui</li>
        <li>Finansinių dokumentų pildymui</li>
        <li>Mokėjimo nurodymų rašymui</li>
        <li>Oficialiai korespondencijai</li>
        <li>
          <Link
            href={`${import.meta.env.VITE_BASE_URL}buhalterine-apskaita`}
            underline="hover"
            sx={{ color: 'inherit' }}
          >
            Buhalterinei apskaitai
          </Link>
        </li>
      </Box>

      {/* Kokios valiutos palaikomos? */}
      <Typography
        variant="h2"
        sx={{
          mt: 5,
          mb: 2,
          fontSize: { xs: '20px', sm: '26px' },
          fontFamily: 'Helvetica',
          fontWeight: 'bold',
          color: '#000',
        }}
      >
        Kokios valiutos palaikomos?
      </Typography>

      <Box sx={{ lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
        <Typography sx={{ mb: 2 }}>
          Mūsų konverteris palaiko daugiau nei 70 pasaulio valiutų. Štai keletas iš jų:
        </Typography>
        <Typography sx={{ mb: 2 }}>
          <strong>Europos valiutos:</strong> Euras (EUR), Svaras sterlingas (GBP), Šveicarijos frankas (CHF), Lenkijos
          zlotas (PLN), Čekijos krona (CZK), Švedijos krona (SEK), Norvegijos krona (NOK), Danijos krona (DKK),
          Ukrainos grivina (UAH), Turkijos lira (TRY) ir kitos.
        </Typography>
        <Typography sx={{ mb: 2 }}>
          <strong>Amerikos valiutos:</strong> JAV doleris (USD), Kanados doleris (CAD), Meksikos pesas (MXN),
          Brazilijos realas (BRL), Argentinos pesas (ARS) ir kitos.
        </Typography>
        <Typography sx={{ mb: 2 }}>
          <strong>Azijos valiutos:</strong> Japonijos jena (JPY), Kinijos juanis (CNY), Pietų Korėjos vona (KRW),
          Indijos rupija (INR), Tailando batas (THB), Vietnamo dongas (VND) ir kitos.
        </Typography>
        <Typography sx={{ mb: 2 }}>
          <strong>Kitos valiutos:</strong> Australijos doleris (AUD), Naujosios Zelandijos doleris (NZD),
          Pietų Afrikos randas (ZAR), Izraelio šekelis (ILS) ir daugelis kitų.
        </Typography>
      </Box>

      {/* Konvertavimo pavyzdžiai */}
      <Typography
        variant="h2"
        sx={{
          mt: 5,
          mb: 2,
          fontSize: { xs: '20px', sm: '26px' },
          fontFamily: 'Helvetica',
          fontWeight: 'bold',
          color: '#000',
        }}
      >
        Konvertavimo pavyzdžiai
      </Typography>

      <Box sx={{ lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
        <Typography sx={{ mb: 1 }}>
          <strong>1 250,50 EUR</strong> → Vienas tūkstantis du šimtai penkiasdešimt eurų penkiasdešimt centų
        </Typography>
        <Typography sx={{ mb: 1 }}>
          <strong>999,99 USD</strong> → Devyni šimtai devyniasdešimt devyni doleriai devyniasdešimt devyni centai
        </Typography>
        <Typography sx={{ mb: 1 }}>
          <strong>5 000,00 JPY</strong> → Penki tūkstančiai jenų (jena neturi centų)
        </Typography>
        <Typography sx={{ mb: 1 }}>
          <strong>0,01 EUR</strong> → Nulis eurų vienas centas
        </Typography>
      </Box>

      {/* Skaitmenizuokite sąskaitas su DokSkenu */}
      <Typography
        variant="h2"
        sx={{
          mt: 5,
          mb: 2,
          fontSize: { xs: '20px', sm: '26px' },
          fontFamily: 'Helvetica',
          fontWeight: 'bold',
          color: '#000',
        }}
      >
        Skaitmenizuokite sąskaitas su DokSkenu
      </Typography>

      <Box sx={{ lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
        <Typography sx={{ mb: 2 }}>
          O jei turite daug dokumentų, kuriuos reikia suvesti į apskaitos programą, skaitmenizuokite juos su DokSkenu.
        </Typography>
        <Typography sx={{ mb: 2 }}>
          Mūsų įrankis automatiškai nuskaito dokumentų duomenis, patikrina juos ir paruošia failą importuoti į jūsų
          apskaitos programą.
        </Typography>
        <Typography sx={{ mb: 2 }}>
          Palaikomos apskaitos programos:
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 0.5,
            maxWidth: 500,
            mb: 2,
          }}
        >
          {[
            { name: "Finvalda", href: null },
            { name: "Rivilė GAMA", href: 'https://atlyginimoskaiciuokle.com/rivile' },
            { name: "Rivilė ERP", href: 'https://atlyginimoskaiciuokle.com/rivile' },
            { name: "Agnum", href: 'https://atlyginimoskaiciuokle.com/agnum' },
            { name: "Centas", href: null },
            { name: "Apskaita5", href: null },
            { name: "Pragma 3.2", href: null },
            { name: "Pragma 4", href: null },
            { name: "Būtenta", href: null },
            { name: "Site.pro", href: null },
            { name: "Debetas", href: null },
            { name: "APSA", href: null },
            { name: "Paulita", href: null },
            { name: "Optimum", href: null },
            { name: "Dineta", href: null },
            { name: "iSAF", href: null },
          ].map((item) => (
            <Box key={item.name} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.3 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#333', flexShrink: 0 }} />
              {item.href ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#003366',
                    fontSize: '15px',
                    fontFamily: 'Helvetica',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  {item.name}
                </a>
              ) : (
                <Typography sx={{ color: '#000', fontSize: '15px', fontFamily: 'Helvetica' }}>
                  {item.name}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      </Box>

      {/* CTA Button */}
      <Box sx={{ textAlign: 'center', mt: 5 }}>
        <Button
          variant="contained"
          size="large"
          href={`${import.meta.env.VITE_BASE_URL}registruotis`}
          sx={{
            backgroundColor: '#F4B400',
            color: '#000',
            fontWeight: '400',
            fontSize: '16px',
            px: 4,
            py: 1.5,
            textTransform: 'uppercase',
            '&:hover': {
              backgroundColor: '#E5A700',
            },
          }}
        >
          Išbandyti DokSkeną nemokamai
        </Button>
      </Box>
    </Container>
  );
}

export default SumaZodziais;



// import { useState } from 'react';
// import { Helmet } from "react-helmet";
// import {
//   Box,
//   Paper,
//   TextField,
//   Button,
//   Typography,
//   MenuItem,
//   Container,
//   InputAdornment,
//   IconButton,
//   Snackbar,
//   Alert,
//   Link,
// } from '@mui/material';
// import { ContentCopy as CopyIcon, Refresh as RefreshIcon } from '@mui/icons-material';

// // ---- Currency Data with Lithuanian declensions ----
// const CURRENCY_DATA = {
//   // Европа
//   'EUR': {
//     symbol: '€',
//     name: 'Euras',
//     major: { single: 'euras', few: 'eurai', many: 'eurų' },
//     minor: { single: 'centas', few: 'centai', many: 'centų' }
//   },
//   'GBP': {
//     symbol: '£',
//     name: 'Svaras sterlingas',
//     major: { single: 'svaras', few: 'svarai', many: 'svarų' },
//     minor: { single: 'pensas', few: 'pensai', many: 'pensų' }
//   },
//   'CHF': {
//     symbol: 'CHF',
//     name: 'Šveicarijos frankas',
//     major: { single: 'frankas', few: 'frankai', many: 'frankų' },
//     minor: { single: 'santimas', few: 'santimai', many: 'santimų' }
//   },
//   'PLN': {
//     symbol: 'zł',
//     name: 'Lenkijos zlotas',
//     major: { single: 'zlotas', few: 'zlotai', many: 'zlotų' },
//     minor: { single: 'grašis', few: 'grašiai', many: 'grašių' }
//   },
//   'CZK': {
//     symbol: 'Kč',
//     name: 'Čekijos krona',
//     major: { single: 'krona', few: 'kronos', many: 'kronų' },
//     minor: { single: 'haleris', few: 'haleriai', many: 'halerių' }
//   },
//   'SEK': {
//     symbol: 'kr',
//     name: 'Švedijos krona',
//     major: { single: 'krona', few: 'kronos', many: 'kronų' },
//     minor: { single: 'erė', few: 'erės', many: 'erių' }
//   },
//   'NOK': {
//     symbol: 'kr',
//     name: 'Norvegijos krona',
//     major: { single: 'krona', few: 'kronos', many: 'kronų' },
//     minor: { single: 'erė', few: 'erės', many: 'erių' }
//   },
//   'DKK': {
//     symbol: 'kr',
//     name: 'Danijos krona',
//     major: { single: 'krona', few: 'kronos', many: 'kronų' },
//     minor: { single: 'erė', few: 'erės', many: 'erių' }
//   },
//   'ISK': {
//     symbol: 'kr',
//     name: 'Islandijos krona',
//     major: { single: 'krona', few: 'kronos', many: 'kronų' },
//     minor: { single: 'auris', few: 'auriai', many: 'aurių' }
//   },
//   'BGN': {
//     symbol: 'лв',
//     name: 'Bulgarijos levas',
//     major: { single: 'levas', few: 'levai', many: 'levų' },
//     minor: { single: 'stotinka', few: 'stotinkos', many: 'stotinkų' }
//   },
//   'RON': {
//     symbol: 'lei',
//     name: 'Rumunijos lėja',
//     major: { single: 'lėja', few: 'lėjos', many: 'lėjų' },
//     minor: { single: 'banas', few: 'banai', many: 'banų' }
//   },
//   'HUF': {
//     symbol: 'Ft',
//     name: 'Vengrijos forintas',
//     major: { single: 'forintas', few: 'forintai', many: 'forintų' },
//     minor: { single: 'fileris', few: 'fileriai', many: 'filerių' }
//   },
//   'HRK': {
//     symbol: 'kn',
//     name: 'Kroatijos kuna',
//     major: { single: 'kuna', few: 'kunos', many: 'kunų' },
//     minor: { single: 'lipa', few: 'lipos', many: 'lipų' }
//   },
//   'RSD': {
//     symbol: 'din',
//     name: 'Serbijos dinaras',
//     major: { single: 'dinaras', few: 'dinarai', many: 'dinarų' },
//     minor: { single: 'para', few: 'paros', many: 'parų' }
//   },
//   'RUB': {
//     symbol: '₽',
//     name: 'Rusijos rublis',
//     major: { single: 'rublis', few: 'rubliai', many: 'rublių' },
//     minor: { single: 'kapeika', few: 'kapeikos', many: 'kapeikų' }
//   },
//   'UAH': {
//     symbol: '₴',
//     name: 'Ukrainos grivina',
//     major: { single: 'grivina', few: 'grivinos', many: 'grivinų' },
//     minor: { single: 'kapeika', few: 'kapeikos', many: 'kapeikų' }
//   },
//   'BYN': {
//     symbol: 'Br',
//     name: 'Baltarusijos rublis',
//     major: { single: 'baltarusijos rublis', few: 'baltarusijos rubliai', many: 'baltarusijos rublių' },
//     minor: { single: 'kapeika', few: 'kapeikos', many: 'kapeikų' }
//   },
//   'TRY': {
//     symbol: '₺',
//     name: 'Turkijos lira',
//     major: { single: 'lira', few: 'liros', many: 'lirų' },
//     minor: { single: 'kuršas', few: 'kuršai', many: 'kuršų' }
//   },
//   'ILS': {
//     symbol: '₪',
//     name: 'Izraelio šekelis',
//     major: { single: 'šekelis', few: 'šekeliai', many: 'šekelių' },
//     minor: { single: 'agora', few: 'agoros', many: 'agorų' }
//   },

//   // Америка
//   'USD': {
//     symbol: '$',
//     name: 'JAV doleris',
//     major: { single: 'doleris', few: 'doleriai', many: 'dolerių' },
//     minor: { single: 'centas', few: 'centai', many: 'centų' }
//   },
//   'CAD': {
//     symbol: 'C$',
//     name: 'Kanados doleris',
//     major: { single: 'Kanados doleris', few: 'Kanados doleriai', many: 'Kanados dolerių' },
//     minor: { single: 'centas', few: 'centai', many: 'centų' }
//   },
//   'MXN': {
//     symbol: 'Mex$',
//     name: 'Meksikos pesas',
//     major: { single: 'pesas', few: 'pesai', many: 'pesų' },
//     minor: { single: 'sentavas', few: 'sentavai', many: 'sentavų' }
//   },
//   'BRL': {
//     symbol: 'R$',
//     name: 'Brazilijos realas',
//     major: { single: 'realas', few: 'realai', many: 'realų' },
//     minor: { single: 'sentavas', few: 'sentavai', many: 'sentavų' }
//   },
//   'ARS': {
//     symbol: '$',
//     name: 'Argentinos pesas',
//     major: { single: 'Argentinos pesas', few: 'Argentinos pesai', many: 'Argentinos pesų' },
//     minor: { single: 'sentavas', few: 'sentavai', many: 'sentavų' }
//   },
//   'CLP': {
//     symbol: '$',
//     name: 'Čilės pesas',
//     major: { single: 'Čilės pesas', few: 'Čilės pesai', many: 'Čilės pesų' },
//     minor: { single: 'sentavas', few: 'sentavai', many: 'sentavų' }
//   },
//   'COP': {
//     symbol: '$',
//     name: 'Kolumbijos pesas',
//     major: { single: 'Kolumbijos pesas', few: 'Kolumbijos pesai', many: 'Kolumbijos pesų' },
//     minor: { single: 'sentavas', few: 'sentavai', many: 'sentavų' }
//   },
//   'CRC': {
//     symbol: '₡',
//     name: 'Kosta Rikos kolonas',
//     major: { single: 'kolonas', few: 'kolonai', many: 'kolonų' },
//     minor: { single: 'sentimas', few: 'sentimai', many: 'sentimų' }
//   },
//   'PYG': {
//     symbol: '₲',
//     name: 'Paragvajaus gvaranis',
//     major: { single: 'gvaranis', few: 'gvaraniai', many: 'gvaranių' },
//     minor: { single: 'sentimas', few: 'sentimai', many: 'sentimų' }
//   },
//   'UYU': {
//     symbol: '$U',
//     name: 'Urugvajaus pesas',
//     major: { single: 'Urugvajaus pesas', few: 'Urugvajaus pesai', many: 'Urugvajaus pesų' },
//     minor: { single: 'sentesimas', few: 'sentesimai', many: 'sentesimų' }
//   },
//   'BOB': {
//     symbol: 'Bs',
//     name: 'Bolivijos bolivianas',
//     major: { single: 'bolivianas', few: 'bolivianai', many: 'bolivianų' },
//     minor: { single: 'sentavas', few: 'sentavai', many: 'sentavų' }
//   },
//   'PEN': {
//     symbol: 'S/',
//     name: 'Peru solis',
//     major: { single: 'solis', few: 'soliai', many: 'solių' },
//     minor: { single: 'sentimas', few: 'sentimai', many: 'sentimų' }
//   },

//   // Азия
//   'JPY': {
//     symbol: '¥',
//     name: 'Japonijos jena',
//     major: { single: 'jena', few: 'jenos', many: 'jenų' },
//     minor: null
//   },
//   'CNY': {
//     symbol: '¥',
//     name: 'Kinijos juanis',
//     major: { single: 'juanis', few: 'juaniai', many: 'juanių' },
//     minor: { single: 'fenas', few: 'fenai', many: 'fenų' }
//   },
//   'KRW': {
//     symbol: '₩',
//     name: 'Pietų Korėjos vona',
//     major: { single: 'vona', few: 'vonos', many: 'vonų' },
//     minor: null
//   },
//   'INR': {
//     symbol: '₹',
//     name: 'Indijos rupija',
//     major: { single: 'rupija', few: 'rupijos', many: 'rupijų' },
//     minor: { single: 'paisa', few: 'paisos', many: 'paisų' }
//   },
//   'IDR': {
//     symbol: 'Rp',
//     name: 'Indonezijos rupija',
//     major: { single: 'Indonezijos rupija', few: 'Indonezijos rupijos', many: 'Indonezijos rupijų' },
//     minor: { single: 'senas', few: 'senai', many: 'senų' }
//   },
//   'THB': {
//     symbol: '฿',
//     name: 'Tailando batas',
//     major: { single: 'batas', few: 'batai', many: 'batų' },
//     minor: { single: 'satangas', few: 'satangai', many: 'satangų' }
//   },
//   'VND': {
//     symbol: '₫',
//     name: 'Vietnamo dongas',
//     major: { single: 'dongas', few: 'dongai', many: 'dongų' },
//     minor: null
//   },
//   'PHP': {
//     symbol: '₱',
//     name: 'Filipinų pesas',
//     major: { single: 'pesas', few: 'pesai', many: 'pesų' },
//     minor: { single: 'sentimas', few: 'sentimai', many: 'sentimų' }
//   },
//   'MYR': {
//     symbol: 'RM',
//     name: 'Malaizijos ringitas',
//     major: { single: 'ringitas', few: 'ringitai', many: 'ringitų' },
//     minor: { single: 'senas', few: 'senai', many: 'senų' }
//   },
//   'SGD': {
//     symbol: 'S$',
//     name: 'Singapūro doleris',
//     major: { single: 'Singapūro doleris', few: 'Singapūro doleriai', many: 'Singapūro dolerių' },
//     minor: { single: 'centas', few: 'centai', many: 'centų' }
//   },
//   'HKD': {
//     symbol: 'HK$',
//     name: 'Honkongo doleris',
//     major: { single: 'Honkongo doleris', few: 'Honkongo doleriai', many: 'Honkongo dolerių' },
//     minor: { single: 'centas', few: 'centai', many: 'centų' }
//   },
//   'TWD': {
//     symbol: 'NT$',
//     name: 'Taivano doleris',
//     major: { single: 'Taivano doleris', few: 'Taivano doleriai', many: 'Taivano dolerių' },
//     minor: { single: 'centas', few: 'centai', many: 'centų' }
//   },
//   'PKR': {
//     symbol: '₨',
//     name: 'Pakistano rupija',
//     major: { single: 'Pakistano rupija', few: 'Pakistano rupijos', many: 'Pakistano rupijų' },
//     minor: { single: 'paisa', few: 'paisos', many: 'paisų' }
//   },
//   'BDT': {
//     symbol: '৳',
//     name: 'Bangladešo taka',
//     major: { single: 'taka', few: 'takos', many: 'takų' },
//     minor: { single: 'paisa', few: 'paisos', many: 'paisų' }
//   },
//   'LKR': {
//     symbol: 'Rs',
//     name: 'Šri Lankos rupija',
//     major: { single: 'Šri Lankos rupija', few: 'Šri Lankos rupijos', many: 'Šri Lankos rupijų' },
//     minor: { single: 'centas', few: 'centai', many: 'centų' }
//   },
//   'KZT': {
//     symbol: '₸',
//     name: 'Kazachstano tengė',
//     major: { single: 'tengė', few: 'tengės', many: 'tengių' },
//     minor: { single: 'tijinas', few: 'tijinai', many: 'tijinų' }
//   },
//   'AZN': {
//     symbol: '₼',
//     name: 'Azerbaidžano manatas',
//     major: { single: 'manatas', few: 'manatai', many: 'manatų' },
//     minor: { single: 'kapeika', few: 'kapeikos', many: 'kapeikų' }
//   },
//   'GEL': {
//     symbol: '₾',
//     name: 'Gruzijos laris',
//     major: { single: 'laris', few: 'lariai', many: 'larių' },
//     minor: { single: 'tetris', few: 'tetriai', many: 'tetrių' }
//   },
//   'AMD': {
//     symbol: '֏',
//     name: 'Armėnijos dramas',
//     major: { single: 'dramas', few: 'dramai', many: 'dramų' },
//     minor: { single: 'luma', few: 'lumos', many: 'lumų' }
//   },
//   'LAK': {
//     symbol: '₭',
//     name: 'Laoso kipas',
//     major: { single: 'kipas', few: 'kipai', many: 'kipų' },
//     minor: { single: 'atas', few: 'atai', many: 'atų' }
//   },
//   'MMK': {
//     symbol: 'K',
//     name: 'Mianmaro kijatas',
//     major: { single: 'kijatas', few: 'kijatai', many: 'kijatų' },
//     minor: { single: 'pija', few: 'pijos', many: 'pijų' }
//   },
//   'KHR': {
//     symbol: '៛',
//     name: 'Kambodžos rielis',
//     major: { single: 'rielis', few: 'rieliai', many: 'rielių' },
//     minor: { single: 'senas', few: 'senai', many: 'senų' }
//   },
//   'NPR': {
//     symbol: 'Rs',
//     name: 'Nepalo rupija',
//     major: { single: 'Nepalo rupija', few: 'Nepalo rupijos', many: 'Nepalo rupijų' },
//     minor: { single: 'paisa', few: 'paisos', many: 'paisų' }
//   },
//   'AFN': {
//     symbol: '؋',
//     name: 'Afganistano afganas',
//     major: { single: 'afganas', few: 'afganai', many: 'afganų' },
//     minor: { single: 'pulis', few: 'puliai', many: 'pulių' }
//   },
//   'MNT': {
//     symbol: '₮',
//     name: 'Mongolijos tugrikas',
//     major: { single: 'tugrikas', few: 'tugrikai', many: 'tugrikų' },
//     minor: { single: 'mengas', few: 'mengai', many: 'mengų' }
//   },

//   // Океания
//   'AUD': {
//     symbol: 'A$',
//     name: 'Australijos doleris',
//     major: { single: 'Australijos doleris', few: 'Australijos doleriai', many: 'Australijos dolerių' },
//     minor: { single: 'centas', few: 'centai', many: 'centų' }
//   },
//   'NZD': {
//     symbol: 'NZ$',
//     name: 'Naujosios Zelandijos doleris',
//     major: { single: 'Naujosios Zelandijos doleris', few: 'Naujosios Zelandijos doleriai', many: 'Naujosios Zelandijos dolerių' },
//     minor: { single: 'centas', few: 'centai', many: 'centų' }
//   },

//   // Африка
//   'ZAR': {
//     symbol: 'R',
//     name: 'Pietų Afrikos randas',
//     major: { single: 'randas', few: 'randai', many: 'randų' },
//     minor: { single: 'centas', few: 'centai', many: 'centų' }
//   },
//   'NGN': {
//     symbol: '₦',
//     name: 'Nigerijos naira',
//     major: { single: 'naira', few: 'nairos', many: 'nairų' },
//     minor: { single: 'kobo', few: 'kobo', many: 'kobo' }
//   },
//   'EGP': {
//     symbol: '£',
//     name: 'Egipto svaras',
//     major: { single: 'Egipto svaras', few: 'Egipto svarai', many: 'Egipto svarų' },
//     minor: { single: 'piastras', few: 'piastrai', many: 'piastrų' }
//   },
//   'KES': {
//     symbol: 'KSh',
//     name: 'Kenijos šilingas',
//     major: { single: 'Kenijos šilingas', few: 'Kenijos šilingai', many: 'Kenijos šilingų' },
//     minor: { single: 'centas', few: 'centai', many: 'centų' }
//   },
//   'GHS': {
//     symbol: '₵',
//     name: 'Ganos sedis',
//     major: { single: 'sedis', few: 'sedžiai', many: 'sedžių' },
//     minor: { single: 'peseva', few: 'pesevos', many: 'pesevų' }
//   },
//   'MAD': {
//     symbol: 'DH',
//     name: 'Maroko dirhamas',
//     major: { single: 'dirhamas', few: 'dirhamai', many: 'dirhamų' },
//     minor: { single: 'santimas', few: 'santimai', many: 'santimų' }
//   },
//   'TND': {
//     symbol: 'DT',
//     name: 'Tuniso dinaras',
//     major: { single: 'dinaras', few: 'dinarai', many: 'dinarų' },
//     minor: { single: 'milimas', few: 'milimai', many: 'milimų' }
//   },

//   // Ближний Восток
//   'AED': {
//     symbol: 'DH',
//     name: 'Arabų Emyratų dirhamas',
//     major: { single: 'dirhamas', few: 'dirhamai', many: 'dirhamų' },
//     minor: { single: 'filsas', few: 'filsai', many: 'filsų' }
//   },
//   'SAR': {
//     symbol: 'SR',
//     name: 'Saudo Arabijos rijalis',
//     major: { single: 'rijalis', few: 'rijaliai', many: 'rijalių' },
//     minor: { single: 'halalas', few: 'halalai', many: 'halalų' }
//   },
//   'QAR': {
//     symbol: 'QR',
//     name: 'Kataro rijalis',
//     major: { single: 'rijalis', few: 'rijaliai', many: 'rijalių' },
//     minor: { single: 'dirhamas', few: 'dirhamai', many: 'dirhamų' }
//   },
//   'KWD': {
//     symbol: 'KD',
//     name: 'Kuveito dinaras',
//     major: { single: 'dinaras', few: 'dinarai', many: 'dinarų' },
//     minor: { single: 'filsas', few: 'filsai', many: 'filsų' }
//   },
//   'BHD': {
//     symbol: 'BD',
//     name: 'Bahreino dinaras',
//     major: { single: 'dinaras', few: 'dinarai', many: 'dinarų' },
//     minor: { single: 'filsas', few: 'filsai', many: 'filsų' }
//   },
//   'OMR': {
//     symbol: 'OMR',
//     name: 'Omano rijalis',
//     major: { single: 'rijalis', few: 'rijaliai', many: 'rijalių' },
//     minor: { single: 'baisa', few: 'baisos', many: 'baisų' }
//   },
//   'JOD': {
//     symbol: 'JD',
//     name: 'Jordanijos dinaras',
//     major: { single: 'dinaras', few: 'dinarai', many: 'dinarų' },
//     minor: { single: 'filsas', few: 'filsai', many: 'filsų' }
//   },
// };

// // ---- Lithuanian number to words conversion ----
// const sumInWordsLt = (amount, currency = 'EUR') => {
//   const ones_lt = (n, gender = 'm') => {
//     const masculine = ['', 'vienas', 'du', 'trys', 'keturi', 'penki', 'šeši', 'septyni', 'aštuoni', 'devyni'];
//     const feminine = ['', 'viena', 'dvi', 'trys', 'keturios', 'penkios', 'šešios', 'septynios', 'aštuonios', 'devynios'];
//     return gender === 'f' ? feminine[n] : masculine[n];
//   };

//     const tens_lt = (n, gender = 'm') => {
//     const tens_names = ['', 'dešimt', 'dvidešimt', 'trisdešimt', 'keturiasdešimt', 
//                         'penkiasdešimt', 'šešiasdešimt', 'septyniasdešimt', 
//                         'aštuoniasdešimt', 'devyniasdešimt'];
//     const teens = ['dešimt', 'vienuolika', 'dvylika', 'trylika', 'keturiolika',
//                     'penkiolika', 'šešiolika', 'septyniolika', 'aštuoniolika', 'devyniolika'];

//     // 1–9: учитываем род
//     if (n < 10) return ones_lt(n, gender);
//     // 10–19: форма одинаковая для м/ж
//     if (n < 20) return teens[n - 10];

//     const tens_part = tens_names[Math.floor(n / 10)];
//     // единицы снова с учётом рода
//     const ones_part = ones_lt(n % 10, gender);
//     return `${tens_part} ${ones_part}`.trim();
//     };

//     const hundreds_lt = (n, gender = 'm') => {
//     const hundreds_names = ['', 'vienas šimtas', 'du šimtai', 'trys šimtai', 'keturi šimtai',
//                             'penki šimtai', 'šeši šimtai', 'septyni šimtai', 'aštuoni šimtai', 'devyni šimtai'];
    
//     if (n === 0) return '';
    
//     const result = [];
//     if (n >= 100) {
//         result.push(hundreds_names[Math.floor(n / 100)]);
//         n = n % 100;
//     }
//     if (n > 0) {
//         result.push(n < 10 ? ones_lt(n, gender) : tens_lt(n, gender));
//     }
//     return result.join(' ');
//     };

//   const get_scale_word = (n, scale) => {
//     if (scale === 'million') {
//       if (n % 10 === 0 || (n % 100 >= 11 && n % 100 <= 19)) return 'milijonų';
//       if (n % 10 === 1) return 'milijonas';
//       return 'milijonai';
//     } else if (scale === 'thousand') {
//       if (n % 10 === 0 || (n % 100 >= 11 && n % 100 <= 19)) return 'tūkstančių';
//       if (n % 10 === 1) return 'tūkstantis';
//       return 'tūkstančiai';
//     }
//   };

//   const number_to_words = (n, genderOverride = null) => {
//     if (n === 0) return '';
    
//     const result = [];
    
//     const millions = Math.floor(n / 1000000);
//     if (millions > 0) {
//       result.push(`${hundreds_lt(millions)} ${get_scale_word(millions, 'million')}`);
//     }
    
//     const thousands = Math.floor((n % 1000000) / 1000);
//     if (thousands > 0) {
//     // tūkstantis – мужской род, поэтому 'm'
//     result.push(`${hundreds_lt(thousands, 'm')} ${get_scale_word(thousands, 'thousand')}`);
//     }
    
//     const remainder = n % 1000;
//     if (remainder > 0) {
//       // Use gender override if provided (for currency declension)
//       const gender = genderOverride || 'm';
//       result.push(hundreds_lt(remainder, gender));
//     }
    
//     return result.join(' ');
//   };

//   const currency_form = (n, type) => {
//     const currencyData = CURRENCY_DATA[currency] || CURRENCY_DATA['EUR'];
//     const unit = type === 'major' ? currencyData.major : currencyData.minor;
    
//     if (!unit) return currency;
    
//     const lastTwoDigits = n % 100;
//     const lastDigit = n % 10;
    
//     // 11-19 всегда родительный множественный (eurų, centų)
//     if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return unit.many;
    
//     // Последняя цифра 0 - родительный множественный (eurų, centų)
//     if (lastDigit === 0) return unit.many;
    
//     // Последняя цифра 1 - единственное число (euras, centas)
//     if (lastDigit === 1) return unit.single;
    
//     // Последние цифры 2-9 - именительный множественный (eurai, centai)
//     return unit.few;
//   };

//   const getLastSignificantPart = (n) => {
//     const remainder = n % 1000;
//     if (remainder > 0) return remainder;
    
//     const thousands = Math.floor((n % 1000000) / 1000);
//     if (thousands > 0) return 0;
    
//     return 0;
//   };

//   // Main logic
//   const whole = Math.floor(amount);
//   const fraction = Math.round((amount - whole) * 100);
  
//   const result = [];
  
//   // Determine gender of major currency unit
//   const majorUnit = CURRENCY_DATA[currency]?.major?.single || '';
//   const isMajorFeminine = majorUnit.endsWith('a') || majorUnit.endsWith('ė');
//   const majorGender = isMajorFeminine ? 'f' : 'm';
  
//   // Process whole part
//   if (whole === 0) {
//     result.push(`Nulis ${currency_form(0, 'major')}`);
//   } else {
//     const words = number_to_words(whole, majorGender);
//     const lastPart = getLastSignificantPart(whole);
//     const curr = currency_form(lastPart, 'major');
//     // Capitalize first letter
//     const firstWord = words.charAt(0).toUpperCase() + words.slice(1);
//     result.push(`${firstWord} ${curr}`);
//   }
  
//   // Process fractional part
//   const hasFraction = CURRENCY_DATA[currency]?.minor !== null && CURRENCY_DATA[currency]?.minor !== undefined;
//   if (fraction > 0 && hasFraction) {
//     // Determine gender based on minor unit ending
//     const minorUnit = CURRENCY_DATA[currency].minor.single;
//     const isFeminine = minorUnit.endsWith('a') || minorUnit.endsWith('ė');
//     const gender = isFeminine ? 'f' : 'm';
    
//     const words = hundreds_lt(fraction, gender);
//     const curr = currency_form(fraction, 'minor');
//     result.push(`${words} ${curr}`);
//   }
  
//   return result.join(' ').trim();
// };

// // ---- Helpers ----
// const parseLocale = (v) => {
//   if (typeof v === 'number') return v;
//   if (!v) return 0;
//   // Remove spaces and replace comma with dot for parsing
//   const cleaned = String(v).replace(/\s/g, '').replace(',', '.');
//   const n = parseFloat(cleaned);
//   return Number.isFinite(n) ? n : 0;
// };

// const allowDec = (v) => {
//   // Allow empty, digits, spaces, and ONE comma or dot
//   return v === '' || /^[0-9\s]*([,.]?[0-9]*)?$/.test(v);
// };

// const stripLeadingZeros = (v) => {
//   if (v == null) return '';
//   const s = String(v);
//   if (s === '0' || s === '0,' || s === '0.') return s;
//   return s.replace(/^0+(?=\d)/, '');
// };

// const formatAmount = (v) => {
//   if (!v) return '';

//   // Убираем пробелы
//   let cleaned = String(v).replace(/\s/g, '');

//   // Проверяем, есть ли вообще разделитель и стоит ли он в конце
//   const hasDecimalSep = /[,.]/.test(cleaned);
//   const endsWithSep = /[,.]$/.test(cleaned);

//   // Нормализуем: точку → запятую
//   cleaned = cleaned.replace(/\./g, ',');

//   const parts = cleaned.split(',');
//   let wholePart = parts[0];
//   let decimalPart = parts.length > 1 ? parts.slice(1).join('') : '';

//   // Пробелы как разделители тысяч
//   wholePart = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

//   // Ограничиваем десятичную часть 2 знаками
//   if (decimalPart.length > 2) {
//     decimalPart = decimalPart.substring(0, 2);
//   }

//   // Если есть десятичная часть ИЛИ пользователь только что ввёл разделитель в конец —
//   // возвращаем с запятой, даже если после неё пока пусто
//   if (decimalPart || (hasDecimalSep && endsWithSep)) {
//     return `${wholePart},${decimalPart}`;
//   }

//   return wholePart;
// };


// // ---- UI tokens ----
// const palette = {
//   primary: '#1976d2',
//   bgSection: '#fafafa',
//   border: '#e0e0e0',
// };

// const sectionSx = {
//   p: 2.5,
//   backgroundColor: palette.bgSection,
//   borderRadius: 3,
//   border: `1px solid ${palette.border}`,
// };

// const titleSx = {
//   fontSize: 18,
//   fontWeight: 700,
//   mb: 1.5,
//   color: '#333',
// };

// // ---- Main Component ----
// const SumaZodziais = () => {
//   const [amount, setAmount] = useState('');
//   const [currency, setCurrency] = useState('EUR');
//   const [result, setResult] = useState('');
//   const [snackbarOpen, setSnackbarOpen] = useState(false);

//     const handleAmountChange = (e) => {
//     let v = e.target.value;

//     // Убираем всё, кроме цифр, пробела, запятой и точки
//     v = v.replace(/[^\d\s,.]/g, '');

//     // Разрешаем только один разделитель (запятую или точку)
//     const commaCount = (v.match(/,/g) || []).length;
//     const dotCount = (v.match(/\./g) || []).length;
//     if (commaCount + dotCount > 1) return;

//     // ВАЖНО: здесь НЕТ formatAmount — просто сохраняем ввод
//     setAmount(v);
//     };

//     const handleAmountBlur = () => {
//     if (!amount) return;
//     setAmount(formatAmount(amount));
//     };

//     const handleGenerate = () => {
//     const num = parseLocale(amount); // parseLocale сам уберёт пробелы и заменит , на .

//     if (!num || num <= 0) {
//         setResult('');
//         return;
//     }

//     // Округляем до 2 знаков для текста
//     const rounded = Math.round(num * 100) / 100;

//     const words = sumInWordsLt(rounded, currency);
//     setResult(words);

//     // ВАЖНО: setAmount здесь не трогаем
//     };


//   const handleCopy = async () => {
//     if (!result) return;
//     try {
//       await navigator.clipboard.writeText(result);
//       setSnackbarOpen(true);
//     } catch (err) {
//       console.error('Failed to copy:', err);
//     }
//   };

//   const handleReset = () => {
//     setAmount('');
//     setResult('');
//   };

//   const currencySymbol = CURRENCY_DATA[currency]?.symbol || currency;

//   // Sort currencies by name for better UX
//   const sortedCurrencies = Object.entries(CURRENCY_DATA).sort((a, b) => 
//     a[1].name.localeCompare(b[1].name)
//   );

//   return (
//     <>
//       <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: 'auto' }}>
//         <Helmet>
//           <title>Nemokamas sumos žodžiais generatorius (su valiutomis) – DokSkenas</title>
//           <meta
//             name="description"
//             content="Nemokamai konvertuokite sumą skaičių į sumą žodžius lietuvių kalba su valiutomis. Palaikoma daugiau nei 70 pasaulio valiutų."
//           />
//         </Helmet>

//         <Paper
//           sx={{
//             p: { xs: 2, md: 3 },
//             borderRadius: 4,
//             '& .MuiOutlinedInput-root': { backgroundColor: '#fff' },
//           }}
//         >
//           <Typography variant="h1" gutterBottom sx={{ color: palette.primary, fontWeight: 500, fontSize: 28 }}>
//             Suma žodžiais generatorius
//           </Typography>

//           <Typography sx={{ mb: 3, color: '#666', fontSize: 14 }}>
//             Konvertuokite sumą su valiuta į sumą žodžiais lietuvių kalba
//           </Typography>

//           {/* Input Section */}
//           <Box sx={{ ...sectionSx, mb: 3 }}>
//             <Typography sx={titleSx}>Įveskite sumą</Typography>
//             <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
//                 <TextField
//                 fullWidth
//                 label="Suma"
//                 type="text"
//                 inputProps={{ inputMode: 'decimal' }}
//                 value={amount}
//                 onChange={handleAmountChange}
//                 onBlur={handleAmountBlur}
//                 onFocus={() => {
//                     if (amount === '0') setAmount('');
//                 }}
//                 placeholder="1 250,50"
//                 InputProps={{
//                     endAdornment: <InputAdornment position="end">{currencySymbol}</InputAdornment>,
//                 }}
//                 sx={{ flex: 2 }}
//                 />

//               <TextField
//                 select
//                 label="Valiuta"
//                 value={currency}
//                 onChange={(e) => setCurrency(e.target.value)}
//                 sx={{ flex: 1, minWidth: 200 }}
//               >
//                 {sortedCurrencies.map(([code, data]) => (
//                   <MenuItem key={code} value={code}>
//                     {data.symbol} - {data.name}
//                   </MenuItem>
//                 ))}
//               </TextField>
//             </Box>

//             <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
//               <Button
//                 variant="contained"
//                 onClick={handleGenerate}
//                 fullWidth
//                 size="large"
//                 sx={{ flex: 1, py: 1.5, fontSize: '16px' }}
//                 disabled={!amount || parseLocale(amount.replace(/\s/g, '')) <= 0}
//               >
//                 Generuoti
//               </Button>
//               <Button
//                 variant="outlined"
//                 onClick={handleReset}
//                 startIcon={<RefreshIcon />}
//                 size="large"
//                 sx={{ flex: 1, py: 1.5, fontSize: '16px' }}
//               >
//                 Iš naujo
//               </Button>
//             </Box>
//           </Box>

//           {/* Result Section */}
//           {result && (
//             <Box sx={{ ...sectionSx }}>
//               <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
//                 <Typography sx={{ ...titleSx, mb: 0 }}>Rezultatas</Typography>
//                 <IconButton
//                   onClick={handleCopy}
//                   size="small"
//                   sx={{
//                     backgroundColor: palette.primary,
//                     color: '#fff',
//                     '&:hover': { backgroundColor: '#1565c0' },
//                   }}
//                   title="Kopijuoti"
//                 >
//                   <CopyIcon fontSize="small" />
//                 </IconButton>
//               </Box>

//               <Box
//                 sx={{
//                   p: 2.5,
//                   backgroundColor: '#fff',
//                   borderRadius: 2,
//                   border: `2px solid ${palette.primary}`,
//                   minHeight: 80,
//                   display: 'flex',
//                   alignItems: 'center',
//                 }}
//               >
//                 <Typography
//                   sx={{
//                     fontSize: 16,
//                     lineHeight: 1.6,
//                     color: '#333',
//                     fontWeight: 500,
//                   }}
//                 >
//                   {result}
//                 </Typography>
//               </Box>
//             </Box>
//           )}
//         </Paper>
//       </Box>

//       {/* Content Section */}
//       <SumaZodziasiInfo />

//       {/* Snackbar */}
//       <Snackbar
//         open={snackbarOpen}
//         autoHideDuration={3000}
//         onClose={() => setSnackbarOpen(false)}
//         anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
//       >
//         <Alert onClose={() => setSnackbarOpen(false)} severity="success" sx={{ width: '100%' }}>
//           Nukopijuota į iškarpinę!
//         </Alert>
//       </Snackbar>
//     </>
//   );
// };

// // Content Component
// function SumaZodziasiInfo() {
//   return (
//     <Container maxWidth="md" sx={{ mt: 8, mb: 10 }}>
//         {/* Kaip veikia suma žodžiais generatorius? */}
//         <Typography
//         variant="h2"
//         sx={{
//             mt: 5,
//             mb: 2,
//             fontSize: { xs: '20px', sm: '26px' },
//             fontFamily: 'Helvetica',
//             fontWeight: 'bold',
//             color: '#000',
//         }}
//         >
//         Kaip veikia suma žodžiais generatorius?
//         </Typography>

//         <Box sx={{ lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
//         <Typography sx={{ mb: 2 }}>
//             Mūsų įrankis konvertuoja bet tokią sumą (skaičių) į sumą žodžiais lietuvių kalba.
//         </Typography>
//         <Typography sx={{ mb: 2 }}>
//             Tereikia tik įvesti skaičių, pasirinkti valiutą iš sąrašo ir paspausti ant „Generuoti“ mygtuko.
//         </Typography>
//         <Typography sx={{ mb: 2 }}>
//             Generatorius akimirksniu atliks konvertaciją bei parodys rezultatą, kurį galėsite nukopijuoti į iškarpinę.
//         </Typography>
//         </Box>

//         {/* Kam tai reikalinga? */}
//         <Typography
//         variant="h2"
//         sx={{
//             mt: 5,
//             mb: 2,
//             fontSize: { xs: '20px', sm: '26px' },
//             fontFamily: 'Helvetica',
//             fontWeight: 'bold',
//             color: '#000',
//         }}
//         >
//         Kam tai reikalinga?
//         </Typography>

//         <Box
//         component="ul"
//         sx={{
//             pl: 3,
//             lineHeight: 1.7,
//             fontSize: '16px',
//             fontFamily: 'Helvetica',
//             color: '#000',
//             mb: 4,
//         }}
//         >
//         <li>
//             <Link
//             href={`${import.meta.env.VITE_BASE_URL}saskaita-faktura`}
//             underline="hover"
//             sx={{ color: 'inherit' }}
//             >
//             Sąskaitų faktūrų išrašymui
//             </Link>
//         </li>
//         <li>Sutarčių sudarymui</li>
//         <li>Finansinių dokumentų pildymui</li>
//         <li>Mokėjimo nurodymų rašymui</li>
//         <li>Oficialiai korespondencijai</li>
//         <li>
//             <Link
//             href={`${import.meta.env.VITE_BASE_URL}buhalterine-apskaita`}
//             underline="hover"
//             sx={{ color: 'inherit' }}
//             >
//             Buhalterinei apskaitai
//             </Link>
//         </li>
//         </Box>

//         {/* Kokios valiutos palaikomos? */}
//         <Typography
//         variant="h2"
//         sx={{
//             mt: 5,
//             mb: 2,
//             fontSize: { xs: '20px', sm: '26px' },
//             fontFamily: 'Helvetica',
//             fontWeight: 'bold',
//             color: '#000',
//         }}
//         >
//         Kokios valiutos palaikomos?
//         </Typography>

//         <Box sx={{ lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
//         <Typography sx={{ mb: 2 }}>
//             Mūsų konverteris palaiko daugiau nei 70 pasaulio valiutų. Štai keletas iš jų:
//         </Typography>
//         <Typography sx={{ mb: 2 }}>
//             <strong>Europos valiutos:</strong> Euras (EUR), Svaras sterlingas (GBP), Šveicarijos frankas (CHF), Lenkijos
//             zlotas (PLN), Čekijos krona (CZK), Švedijos krona (SEK), Norvegijos krona (NOK), Danijos krona (DKK),
//             Ukrainos grivina (UAH), Turkijos lira (TRY) ir kitos.
//         </Typography>
//         <Typography sx={{ mb: 2 }}>
//             <strong>Amerikos valiutos:</strong> JAV doleris (USD), Kanados doleris (CAD), Meksikos pesas (MXN),
//             Brazilijos realas (BRL), Argentinos pesas (ARS) ir kitos.
//         </Typography>
//         <Typography sx={{ mb: 2 }}>
//             <strong>Azijos valiutos:</strong> Japonijos jena (JPY), Kinijos juanis (CNY), Pietų Korėjos vona (KRW),
//             Indijos rupija (INR), Tailando batas (THB), Vietnamo dongas (VND) ir kitos.
//         </Typography>
//         <Typography sx={{ mb: 2 }}>
//             <strong>Kitos valiutos:</strong> Australijos doleris (AUD), Naujosios Zelandijos doleris (NZD),
//             Pietų Afrikos randas (ZAR), Izraelio šekelis (ILS) ir daugelis kitų.
//         </Typography>
//         </Box>

//         {/* Konvertavimo pavyzdžiai */}
//         <Typography
//         variant="h2"
//         sx={{
//             mt: 5,
//             mb: 2,
//             fontSize: { xs: '20px', sm: '26px' },
//             fontFamily: 'Helvetica',
//             fontWeight: 'bold',
//             color: '#000',
//         }}
//         >
//         Konvertavimo pavyzdžiai
//         </Typography>

//         <Box sx={{ lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
//         <Typography sx={{ mb: 1 }}>
//             <strong>1 250,50 EUR</strong> → Vienas tūkstantis du šimtai penkiasdešimt eurų penkiasdešimt centų
//         </Typography>
//         <Typography sx={{ mb: 1 }}>
//             <strong>999,99 USD</strong> → Devyni šimtai devyniasdešimt devyni doleriai devyniasdešimt devyni centai
//         </Typography>
//         <Typography sx={{ mb: 1 }}>
//             <strong>5 000,00 JPY</strong> → Penki tūkstančiai jenų (jena neturi centų)
//         </Typography>
//         <Typography sx={{ mb: 1 }}>
//             <strong>0,01 EUR</strong> → Nulis eurų vienas centas
//         </Typography>
//         </Box>

//         {/* Skaitmenizuokite sąskaitas su DokSkenu */}
//         <Typography
//         variant="h2"
//         sx={{
//             mt: 5,
//             mb: 2,
//             fontSize: { xs: '20px', sm: '26px' },
//             fontFamily: 'Helvetica',
//             fontWeight: 'bold',
//             color: '#000',
//         }}
//         >
//         Skaitmenizuokite sąskaitas su DokSkenu
//         </Typography>

//         <Box sx={{ lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
//         <Typography sx={{ mb: 2 }}>
//             O jei turite daug dokumentų, kuriuos reikia suvesti į apskaitos programą, skaitmenizuokite juos su DokSkenu.
//         </Typography>
//         <Typography sx={{ mb: 2 }}>
//             Mūsų įrankis automatiškai nuskaito dokumentų duomenis, patikrina juos ir paruošia failą importuoti į jūsų
//             apskaitos programą (Rivilę, Finvaldą, Centą ar kitą).
//         </Typography>
//         </Box>


//       {/* CTA Button */}
//       <Box sx={{ textAlign: 'center', mt: 5 }}>
//         <Button
//           variant="contained"
//           size="large"
//           href={`${import.meta.env.VITE_BASE_URL}registruotis`}
//           sx={{
//             backgroundColor: '#F4B400',
//             color: '#000',
//             fontWeight: '400',
//             fontSize: '16px',
//             px: 4,
//             py: 1.5,
//             textTransform: 'uppercase',
//             '&:hover': {
//               backgroundColor: '#E5A700',
//             },
//           }}
//         >
//           Išbandyti DokSkeną nemokamai
//         </Button>
//       </Box>
//     </Container>
//   );
// }

// export default SumaZodziais;