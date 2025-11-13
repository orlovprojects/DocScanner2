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
};

const getCurrencySymbol = (currencyCode) => {
  return CURRENCY_SYMBOLS[currencyCode] || currencyCode;
};

// Lithuanian number to words conversion
const sum_in_words_lt = (amount, currency = 'EUR') => {
  const ones_lt = (n, gender = 'm') => {
    const masculine = ['', 'vienas', 'du', 'trys', 'keturi', 'penki', 'šeši', 'septyni', 'aštuoni', 'devyni'];
    const feminine = ['', 'viena', 'dvi', 'trys', 'keturios', 'penkios', 'šešios', 'septynios', 'aštuonios', 'devynios'];
    return gender === 'f' ? feminine[n] : masculine[n];
  };

  const tens_lt = (n) => {
    const tens_names = ['', 'dešimt', 'dvidešimt', 'trisdešimt', 'keturiasdešimt', 
                       'penkiasdešimt', 'šešiasdešimt', 'septyniasdešimt', 
                       'aštuoniasdešimt', 'devyniasdešimt'];
    const teens = ['dešimt', 'vienuolika', 'dvylika', 'trylika', 'keturiolika',
                  'penkiolika', 'šešiolika', 'septyniolika', 'aštuoniolika', 'devyniolika'];
    
    if (n < 10) return ones_lt(n);
    if (n < 20) return teens[n - 10];
    
    const tens_part = tens_names[Math.floor(n / 10)];
    const ones_part = ones_lt(n % 10);
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
      result.push(n < 10 ? ones_lt(n, gender) : tens_lt(n));
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

  const number_to_words = (n) => {
    if (n === 0) return '';
    
    const result = [];
    
    const millions = Math.floor(n / 1000000);
    if (millions > 0) {
      result.push(`${hundreds_lt(millions)} ${get_scale_word(millions, 'million')}`);
    }
    
    const thousands = Math.floor((n % 1000000) / 1000);
    if (thousands > 0) {
      result.push(`${hundreds_lt(thousands, 'f')} ${get_scale_word(thousands, 'thousand')}`);
    }
    
    const remainder = n % 1000;
    if (remainder > 0) {
      result.push(hundreds_lt(remainder));
    }
    
    return result.join(' ');
  };

  // Currency forms for major and minor units
  const currency_forms = {
    'EUR': { 
      major: { single: 'euras', few: 'eurai', many: 'eurų' },
      minor: { single: 'centas', few: 'centai', many: 'centų' }
    },
    'USD': { 
      major: { single: 'doleris', few: 'doleriai', many: 'dolerių' },
      minor: { single: 'centas', few: 'centai', many: 'centų' }
    },
    'GBP': { 
      major: { single: 'svaras', few: 'svarai', many: 'svarų' },
      minor: { single: 'pensas', few: 'pensai', many: 'pensų' }
    },
    'RUB': { 
      major: { single: 'rublis', few: 'rubliai', many: 'rublių' },
      minor: { single: 'kapeika', few: 'kapeikos', many: 'kapeikų' }
    },
    'JPY': { 
      major: { single: 'jena', few: 'jenos', many: 'jenų' },
      minor: null
    },
    'CNY': { 
      major: { single: 'juanis', few: 'juaniai', many: 'juanių' },
      minor: { single: 'fenas', few: 'fenai', many: 'fenų' }
    },
    'KRW': { 
      major: { single: 'vona', few: 'vonos', many: 'vonų' },
      minor: null
    },
    'INR': { 
      major: { single: 'rupija', few: 'rupijos', many: 'rupijų' },
      minor: { single: 'paisa', few: 'paisos', many: 'paisų' }
    },
    'PLN': { 
      major: { single: 'zlotas', few: 'zlotai', many: 'zlotų' },
      minor: { single: 'grašis', few: 'grašiai', many: 'grašių' }
    },
    'CHF': { 
      major: { single: 'frankas', few: 'frankai', many: 'frankų' },
      minor: { single: 'santimas', few: 'santimai', many: 'santimų' }
    },
  };

  const currency_form = (n, type) => {
    const forms = currency_forms[currency] || currency_forms['EUR'];
    const unit = type === 'major' ? forms.major : forms.minor;
    
    if (!unit) return currency; // Для валют без минорных единиц
    
    const lastTwoDigits = n % 100;
    const lastDigit = n % 10;
    
    // Если число заканчивается на 11-19, используем "many" (родительный мн.ч)
    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return unit.many;
    
    // Если последняя цифра 0, используем "many" (родительный мн.ч)
    if (lastDigit === 0) return unit.many;
    
    // Если последняя цифра 1, используем единственное число
    if (lastDigit === 1) return unit.single;
    
    // Для 2-9 используем "few" (именительный мн.ч)
    return unit.few;
  };

  // Main logic
  const whole = Math.floor(amount);
  const fraction = Math.round((amount - whole) * 100);
  
  // Функция для получения последней значащей части числа для склонения
  const getLastSignificantPart = (n) => {
    const remainder = n % 1000;
    if (remainder > 0) return remainder;
    
    const thousands = Math.floor((n % 1000000) / 1000);
    if (thousands > 0) return 0; // "пять тысяч" -> 0 для родительного падежа
    
    return 0;
  };
  
  const result = [];
  
  // Process whole part
  if (whole === 0) {
    result.push(`nulis ${currency_form(0, 'major')}`);
  } else {
    const words = number_to_words(whole);
    const lastPart = getLastSignificantPart(whole);
    const curr = currency_form(lastPart, 'major');
    result.push(`${words} ${curr}`);
  }
  
  // Process fractional part (only if currency has minor units)
  const hasFraction = currency_forms[currency]?.minor !== null && currency_forms[currency]?.minor !== undefined;
  if (fraction > 0 && hasFraction) {
    const words = hundreds_lt(fraction);
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
  if (isPhone && !/\d/.test(val)) return null; // скрыть без цифр (только "+")
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

const InvoicePDF = ({ data, logo, sumos }) => {
  const currencySymbol = getCurrencySymbol(data?.valiuta || 'EUR');
  const pvmTaikoma = data?.pvmTipas === 'taikoma';
  
  const hasBarcodes = Array.isArray(data?.eilutes)
    ? data.eilutes.some((e) => e?.barkodas && String(e.barkodas).trim() !== '')
    : false;

  // Динамические заголовки в зависимости от PVM
  const priceHeader = pvmTaikoma ? 'Kaina be PVM' : 'Kaina';
  const sumHeader = pvmTaikoma ? 'Suma be PVM' : 'Suma';

  const columnWidths = hasBarcodes
    ? { col1: { width: '30%' }, col2: { width: '10%' }, col3: { width: '10%' }, col4: { width: '10%' }, col5: { width: '10%' }, col6: { width: '15%', textAlign: 'right' }, col7: { width: '15%', textAlign: 'right' } }
    : { col1: { width: '40%' }, col2: { width: '10%' }, col4: { width: '10%' }, col5: { width: '10%' }, col6: { width: '15%', textAlign: 'right' }, col7: { width: '15%', textAlign: 'right' } };

  const sellerHas = hasAnyValue(data?.seller);
  const buyerHas  = hasAnyValue(data?.buyer);
  const leftColStyle  = sellerHas && buyerHas ? styles.column : { width: '100%' };
  const rightColStyle = sellerHas && buyerHas ? styles.column : { width: '100%' };

  // Сборка строки без лишних пробелов перед "Nr."
  const titleParts = [];
  if (data?.saskaitosSerija) titleParts.push(`Serija ${data.saskaitosSerija}`);
  titleParts.push(`Nr. ${data?.saskaitosNumeris || ''}`.trimEnd()); // если номера нет — останется "Nr."
  const idLine = titleParts.join(' ');

  // Для логики сумм
  const nuolaida = toNumber(data?.nuolaida);
  const pristatymas = toNumber(data?.pristatymoMokestis);
  const hasDiscount = nuolaida > 0;
  const hasDelivery = pristatymas > 0;

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
                  <InfoRow label="Įmonės kodas:" value={data?.buyer?.imonesKodas} />
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
                  <InfoRow label="Įmonės kodas:" value={data?.seller?.imonesKodas} />
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
              {/* Tarpinė suma - всегда показываем если есть скидка или доставка */}
              {(hasDiscount || hasDelivery) && (
                <View style={styles.summaryRow}>
                  <Text>Tarpinė suma:</Text>
                  <Text>{sumos?.tarpineSuma || '0,00'} {currencySymbol}</Text>
                </View>
              )}

              {/* Nuolaida - показываем отдельной строкой если есть */}
              {hasDiscount && (
                <View style={styles.summaryRow}>
                  <Text>Nuolaida:</Text>
                  <Text>-{formatCurrency(nuolaida)} {currencySymbol}</Text>
                </View>
              )}

              {/* Pristatymo mokestis - показываем отдельной строкой если есть */}
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
                <Text>Suma žodžiais: {sum_in_words_lt(toNumber(sumos?.sumaSuPvm), data?.valiuta || 'EUR')}</Text>
              </View>
            </>
          ) : (
            <>
              {/* Для случая без PVM также показываем все поля */}
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
                <Text>Suma žodžiais: {sum_in_words_lt(toNumber(sumos?.sumaBePvm), data?.valiuta || 'EUR')}</Text>
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


