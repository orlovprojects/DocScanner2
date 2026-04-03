import { useState, useRef, useEffect, useLayoutEffect, forwardRef, useCallback } from 'react';
import {
  Box, Typography, Divider, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Dialog, DialogContent, IconButton,
  CircularProgress, Snackbar, Alert,
} from '@mui/material';
import {
  PictureAsPdf as PdfIcon, Close as CloseIcon, Download as DownloadIcon,
  Print as PrintIcon, Visibility as PreviewIcon,
} from '@mui/icons-material';
import { invoicingApi } from '../api/invoicingApi';
import { getInvSubscription } from '../api/endpoints';

// ═══════════════════════════════════════════════════════════
// Helpers  (unchanged)
// ═══════════════════════════════════════════════════════════

const parseNum = (v) => {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  return parseFloat(String(v).replace(',', '.')) || 0;
};

const fmt = (n, dec = 2) => Number(n || 0).toFixed(dec).replace('.', ',');

const fmtPrice = (value) => {
  if (value == null || value === '') return '0';
  const n = Number(value || 0);
  let s = n.toFixed(4).replace('.', ',');
  const parts = s.split(',');
  if (parts.length === 2) {
    let dec = parts[1].replace(/0+$/, '');
    if (dec.length < 2) dec = dec.padEnd(2, '0');
    return `${parts[0]},${dec}`;
  }
  return s;
};

const fmtQty = (value) => {
  if (value == null || value === '') return '0';
  const n = Number(value || 0);
  if (Number.isInteger(n)) return String(n);
  return String(n).replace('.', ',').replace(/0+$/, '').replace(/,$/, '');
};

const fmtDate = (d) => d || '';

const getCodeLabel = (personType) =>
  personType === 'fizinis' ? 'Asmens / ind. veiklos kodas' : 'Įm. kodas';

const TYPE_LABELS = {
  isankstine: 'IŠANKSTINĖ SĄSKAITA FAKTŪRA',
  pvm_saskaita: 'PVM SĄSKAITA FAKTŪRA',
  saskaita: 'SĄSKAITA FAKTŪRA',
  kreditine: 'KREDITINĖ SĄSKAITA FAKTŪRA',
};

const CURRENCY_SYMBOLS = {
  EUR: '€', USD: '$', GBP: '£', PLN: 'zł', CZK: 'Kč', CHF: 'CHF',
  SEK: 'kr', NOK: 'kr', DKK: 'kr', UAH: '₴', RUB: '₽', JPY: '¥', CNY: '¥',
};

const getSym = (c) => CURRENCY_SYMBOLS[c] || c;

// ═══════════════════════════════════════════════════════════
// Lithuanian amount in words  (unchanged)
// ═══════════════════════════════════════════════════════════

const sumInWordsLt = (amount) => {
  const ones = ['', 'vienas', 'du', 'trys', 'keturi', 'penki', 'šeši', 'septyni', 'aštuoni', 'devyni'];
  const teens = ['dešimt', 'vienuolika', 'dvylika', 'trylika', 'keturiolika', 'penkiolika', 'šešiolika', 'septyniolika', 'aštuoniolika', 'devyniolika'];
  const tens = ['', 'dešimt', 'dvidešimt', 'trisdešimt', 'keturiasdešimt', 'penkiasdešimt', 'šešiasdešimt', 'septyniasdešimt', 'aštuoniasdešimt', 'devyniasdešimt'];
  const hundreds = ['', 'šimtas', 'du šimtai', 'trys šimtai', 'keturi šimtai', 'penki šimtai', 'šeši šimtai', 'septyni šimtai', 'aštuoni šimtai', 'devyni šimtai'];

  const belowThousand = (n) => {
    if (!n) return '';
    const parts = [];
    if (n >= 100) { parts.push(hundreds[Math.floor(n / 100)]); n %= 100; }
    if (n >= 10 && n <= 19) { parts.push(teens[n - 10]); return parts.join(' '); }
    if (n >= 20) { parts.push(tens[Math.floor(n / 10)]); n %= 10; }
    if (n > 0) parts.push(ones[n]);
    return parts.join(' ');
  };

  const thousandForm = (n) => {
    if (n % 100 >= 11 && n % 100 <= 19) return 'tūkstančių';
    const last = n % 10;
    if (last === 1) return 'tūkstantis';
    if (last === 0) return 'tūkstančių';
    return 'tūkstančiai';
  };

  const millionForm = (n) => {
    if (n % 100 >= 11 && n % 100 <= 19) return 'milijonų';
    const last = n % 10;
    if (last === 1) return 'milijonas';
    if (last === 0) return 'milijonų';
    return 'milijonai';
  };

  const currencyForm = (n, unit = 'eur') => {
    if (unit === 'eur') {
      if ((n % 100 >= 11 && n % 100 <= 19) || n % 10 === 0) return 'eurų';
      if (n % 10 === 1) return 'euras';
      return 'eurai';
    }
    if ((n % 100 >= 11 && n % 100 <= 19) || n % 10 === 0) return 'centų';
    if (n % 10 === 1) return 'centas';
    return 'centai';
  };

  const rounded = Math.round((Number(amount || 0) + Number.EPSILON) * 100) / 100;
  const euros = Math.floor(rounded);
  const cents = Math.round((rounded - euros) * 100);

  const parts = [];
  if (euros === 0) {
    parts.push('nulis');
  } else {
    let e = euros;
    if (e >= 1_000_000) { const m = Math.floor(e / 1_000_000); parts.push(`${belowThousand(m)} ${millionForm(m)}`); e %= 1_000_000; }
    if (e >= 1000) { const t = Math.floor(e / 1000); parts.push(`${belowThousand(t)} ${thousandForm(t)}`); e %= 1000; }
    if (e > 0) parts.push(belowThousand(e));
  }
  parts.push(currencyForm(euros));
  if (cents > 0) parts.push(`${belowThousand(cents)} ${currencyForm(cents, 'cent')}`);

  const text = parts.filter(Boolean).join(' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
};

// ═══════════════════════════════════════════════════════════
// Small components  (unchanged)
// ═══════════════════════════════════════════════════════════

const InfoRow = ({ label, value }) => (
  <Typography sx={{ fontSize: 10.5, lineHeight: 1.55, color: '#222' }}>
    <Box component="span" sx={{ fontSize: 9.2, color: '#888', display: 'inline' }}>{label}:</Box>{' '}
    {value}
  </Typography>
);

const TotalRow = ({ label, value, bold, indent }) => (
  <Box sx={{
    display: 'flex', justifyContent: 'space-between', py: 0.15,
    ...(indent ? { pl: 1.5 } : {}),
    ...(bold ? { mt: 0.6, pt: 0.6, borderTop: '1.5px solid #333' } : {}),
  }}>
    <Typography sx={{ fontSize: indent ? 9.5 : 10.5, fontWeight: bold ? 800 : 400, color: indent ? '#555' : '#222' }}>{label}</Typography>
    <Typography sx={{ fontSize: indent ? 9.5 : 10.5, fontWeight: bold ? 800 : 700, color: indent ? '#555' : '#222' }}>{value}</Typography>
  </Box>
);

const SignatureBlock = ({ label, name }) => (
  <Box>
    <Typography sx={{ fontSize: 9.5, fontWeight: 700, color: '#888', mb: 0.5 }}>{label}</Typography>
    <Typography sx={{ fontSize: 10.5, color: '#222', minHeight: 18 }}>{name || ' '}</Typography>
  </Box>
);

// ═══════════════════════════════════════════════════════════
// Table styles  (unchanged)
// ═══════════════════════════════════════════════════════════

const cellSx = {
  py: 0.55, px: 1, fontSize: 10, borderBottom: '0.5px solid #e0e0e0',
  verticalAlign: 'top', color: '#222', lineHeight: 1.3,
};

const cellHeadSx = {
  ...cellSx, fontWeight: 700, fontSize: 8.8, color: '#555',
  borderBottom: '1.2px solid #333', backgroundColor: '#f5f5f5',
  py: 0.75, letterSpacing: 0, lineHeight: 1.15,
};

// ═══════════════════════════════════════════════════════════
// Page constants
// ═══════════════════════════════════════════════════════════

const PAGE_W = 794;
const PAGE_H = 1123;
const PAD = { top: 44, right: 52, bottom: 56, left: 52 };
const CONTENT_H = PAGE_H - PAD.top - PAD.bottom;   // 1023
const FOOTER_H = 28;
const USABLE_H = CONTENT_H - FOOTER_H;              // 995

// ═══════════════════════════════════════════════════════════
// Shared font / box styles
// ═══════════════════════════════════════════════════════════

const pageFontSx = {
  fontFamily: '"Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
  fontSize: 11,
  color: '#222',
};

// ═══════════════════════════════════════════════════════════
// useComputedLines — shared calculation logic
// ═══════════════════════════════════════════════════════════

function useComputedInvoice(invoice) {
  const inv = invoice || {};
  const lines = inv.line_items || [];
  const sym = getSym(inv.currency || 'EUR');
  const currency = inv.currency || 'EUR';
  const isPvm = inv.pvm_tipas === 'taikoma';

  const computedLines = lines.map((li) => {
    const qty = parseNum(li.quantity);
    const price = parseNum(li.price);
    const discount = parseNum(li.discount_wo_vat || 0);
    const net = Math.max(0, qty * price - discount);
    const vatPct = li.vat_percent != null
      ? parseNum(li.vat_percent)
      : (isPvm ? parseNum(inv.vat_percent || 21) : 0);
    const vat = isPvm ? net * vatPct / 100 : 0;
    return { ...li, qty, price, discount, net, vatPct, vat, total: net + vat };
  });

  const hasCode = computedLines.some((l) => l.prekes_kodas);
  const hasDiscount = computedLines.some((l) => l.discount > 0);

  const sumNet = computedLines.reduce((s, l) => s + l.net, 0);
  const invoiceDiscount = Math.min(parseNum(inv.invoice_discount_wo_vat || 0), sumNet);
  const base = Math.max(0, sumNet - invoiceDiscount);

  const groups = {};
  computedLines.forEach((l) => {
    const r = Number(l.vatPct || 0);
    if (!groups[r]) groups[r] = { net: 0 };
    groups[r].net += l.net;
  });

  const vatBreakdown = Object.entries(groups)
    .map(([rate, g]) => {
      const r = parseFloat(rate);
      const ratio = sumNet > 0 ? g.net / sumNet : 0;
      const discountedNet = Math.max(0, g.net - invoiceDiscount * ratio);
      const vat = isPvm ? Math.max(0, discountedNet * r / 100) : 0;
      return { rate: r, net: discountedNet, vat };
    })
    .sort((a, b) => b.rate - a.rate);

  const multiVat = vatBreakdown.length > 1;
  const vatTotal = vatBreakdown.reduce((s, g) => s + g.vat, 0);
  const grand = base + vatTotal;

  return {
    inv, computedLines, sym, currency, isPvm,
    hasCode, hasDiscount, sumNet, invoiceDiscount, base,
    vatBreakdown, multiVat, vatTotal, grand,
  };
}

// ═══════════════════════════════════════════════════════════
// Section: Header
// ═══════════════════════════════════════════════════════════

const InvoiceHeaderSection = ({ inv, logoUrl }) => {
  const hasLogo = Boolean(logoUrl);
  const sym = getSym(inv.currency || 'EUR');

  const DatesBlock = () => (
    <Box sx={{ textAlign: 'right' }}>
      <Typography sx={{ fontSize: 8.8, color: '#555', lineHeight: 1.35 }}>
        Data: <strong>{fmtDate(inv.invoice_date)}</strong>
      </Typography>
      {inv.due_date && (
        <Typography sx={{ fontSize: 8.8, color: '#555', lineHeight: 1.35 }}>
          Apmokėti iki: <strong>{fmtDate(inv.due_date)}</strong>
        </Typography>
      )}
    </Box>
  );

  const PaymentBtn = () => {
    if (!inv.payment_link_url) return null;
    return (
      <Box
        component="a" href={inv.payment_link_url} target="_blank" rel="noopener noreferrer"
        sx={{
          backgroundColor: '#1976d2', borderRadius: '5px', px: 2, py: 0.8,
          textDecoration: 'none', display: 'inline-flex', flexDirection: 'column',
          alignItems: 'center', flexShrink: 0, minWidth: 100,
          '&:hover': { backgroundColor: '#1565c0' },
        }}
      >
        <Typography sx={{ color: '#fff', fontSize: 8.5, fontWeight: 700, lineHeight: 1.3 }}>Apmokėti sąskaitą</Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontSize: 7.5, lineHeight: 1.3 }}>
          {fmt(inv.amount_with_vat || 0)} {sym}
        </Typography>
      </Box>
    );
  };

  if (hasLogo) {
    return (
      <Box data-section="header" sx={{ mb: 2.2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flexShrink: 0 }}>
            <Box component="img" src={logoUrl} alt="Logo" sx={{ maxWidth: 90, maxHeight: 36, objectFit: 'contain', display: 'block' }} />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <PaymentBtn />
            <DatesBlock />
          </Box>
        </Box>
        <Divider sx={{ borderColor: '#333', borderWidth: 1.2, mt: 1.8 }} />
        <Box sx={{ textAlign: 'center', mt: 2, mb: 0.5 }}>
          <Typography sx={{ fontSize: 17, fontWeight: 800, color: '#222', lineHeight: 1.1 }}>
            {TYPE_LABELS[inv.invoice_type] || 'SĄSKAITA FAKTŪRA'}
          </Typography>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#555', mt: 0.4 }}>
            Serija {inv.document_series || ''} Nr. {inv.document_number || ''}
          </Typography>
          {inv.order_number && (
            <Typography sx={{ fontSize: 8.2, color: '#888', mt: 0.35, lineHeight: 1.2 }}>
              Užsakymo Nr.: {inv.order_number}
            </Typography>
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Box data-section="header" sx={{ mb: 2.2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography sx={{ fontSize: 17, fontWeight: 800, color: '#222', lineHeight: 1.1 }}>
            {TYPE_LABELS[inv.invoice_type] || 'SĄSKAITA FAKTŪRA'}
          </Typography>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#222', mt: 0.4 }}>
            Serija {inv.document_series || ''} Nr. {inv.document_number || ''}
          </Typography>
          {inv.order_number && (
            <Typography sx={{ fontSize: 9, color: '#888', mt: 0.35, lineHeight: 1.2 }}>
              Užsakymo Nr.: {inv.order_number}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <PaymentBtn />
          <DatesBlock />
        </Box>
      </Box>
      <Divider sx={{ borderColor: '#333', borderWidth: 1.2, mt: 1.8 }} />
    </Box>
  );
};

// ═══════════════════════════════════════════════════════════
// Section: Parties
// ═══════════════════════════════════════════════════════════

const InvoicePartiesSection = ({ inv }) => (
  <Box data-section="parties" sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, mb: '46px' }}>
    <Box>
      <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#888', mb: 0.4, letterSpacing: 0.5 }}>PARDAVĖJAS</Typography>
      <Typography sx={{ fontSize: 12.5, fontWeight: 700, mb: 0.5 }}>{inv.seller_name || ''}</Typography>
      {inv.seller_id && <InfoRow label={getCodeLabel(inv.seller_type)} value={inv.seller_id} />}
      {inv.seller_vat_code && <InfoRow label="PVM kodas" value={inv.seller_vat_code} />}
      {inv.seller_address && <InfoRow label="Adresas" value={inv.seller_address} />}
      {inv.seller_phone && <InfoRow label="Tel." value={inv.seller_phone} />}
      {inv.seller_email && <InfoRow label="El. paštas" value={inv.seller_email} />}
      {inv.seller_bank_name && <InfoRow label="Bankas" value={inv.seller_bank_name} />}
      {inv.seller_iban && <InfoRow label="IBAN" value={inv.seller_iban} />}
      {inv.seller_swift && <InfoRow label="SWIFT" value={inv.seller_swift} />}
    </Box>
    <Box>
      <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#888', mb: 0.4, letterSpacing: 0.5 }}>PIRKĖJAS</Typography>
      <Typography sx={{ fontSize: 12.5, fontWeight: 700, mb: 0.5 }}>{inv.buyer_name || ''}</Typography>
      {inv.buyer_id && <InfoRow label={getCodeLabel(inv.buyer_type)} value={inv.buyer_id} />}
      {inv.buyer_vat_code && <InfoRow label="PVM kodas" value={inv.buyer_vat_code} />}
      {inv.buyer_address && <InfoRow label="Adresas" value={inv.buyer_address} />}
      {inv.buyer_phone && <InfoRow label="Tel." value={inv.buyer_phone} />}
      {inv.buyer_email && <InfoRow label="El. paštas" value={inv.buyer_email} />}
      {inv.buyer_bank_name && <InfoRow label="Bankas" value={inv.buyer_bank_name} />}
      {inv.buyer_iban && <InfoRow label="IBAN" value={inv.buyer_iban} />}
      {inv.buyer_swift && <InfoRow label="SWIFT" value={inv.buyer_swift} />}
    </Box>
  </Box>
);

// ═══════════════════════════════════════════════════════════
// Section: Table head
// ═══════════════════════════════════════════════════════════

const InvoiceTableHead = ({ hasCode, hasDiscount, isPvm, currency }) => (
  <TableHead data-section="table-head">
    <TableRow>
      <TableCell sx={{ ...cellHeadSx, width: 30 }}>Nr.</TableCell>
      <TableCell sx={cellHeadSx}>Pavadinimas</TableCell>
      {hasCode && <TableCell sx={{ ...cellHeadSx, width: 120 }}>Kodas</TableCell>}
      <TableCell sx={{ ...cellHeadSx, textAlign: 'right', width: 70 }}>Kiekis</TableCell>
      <TableCell sx={{ ...cellHeadSx, textAlign: 'center', width: 76 }}>Mato vnt.</TableCell>
      <TableCell sx={{ ...cellHeadSx, textAlign: 'right', width: 92 }}>
        <Box sx={{ lineHeight: 1.15 }}><div>Kaina {currency}</div>{isPvm && <div>be PVM</div>}</Box>
      </TableCell>
      {hasDiscount && <TableCell sx={{ ...cellHeadSx, textAlign: 'right', width: 70 }}>Nuol.</TableCell>}
      <TableCell sx={{ ...cellHeadSx, textAlign: 'right', width: 92 }}>
        <Box sx={{ lineHeight: 1.15 }}><div>Suma {currency}</div>{isPvm && <div>be PVM</div>}</Box>
      </TableCell>
    </TableRow>
  </TableHead>
);

// ═══════════════════════════════════════════════════════════
// Section: Table row
// ═══════════════════════════════════════════════════════════

const InvoiceTableRowItem = ({ li, index, hasCode, hasDiscount }) => (
  <TableRow data-row-index={index} sx={{ '&:nth-of-type(even)': { backgroundColor: '#fafafa' } }}>
    <TableCell sx={cellSx}>{index + 1}</TableCell>
    <TableCell sx={cellSx}>
      <Typography sx={{ fontSize: 10.5, color: '#222', lineHeight: 1.35 }}>{li.prekes_pavadinimas || ''}</Typography>
      {li.prekes_barkodas && (
        <Typography sx={{ fontSize: 8.5, color: '#888', lineHeight: 1.2, mt: 0.2 }}>Barkodas: {li.prekes_barkodas}</Typography>
      )}
    </TableCell>
    {hasCode && (
      <TableCell sx={cellSx}><Typography sx={{ fontSize: 9.5, lineHeight: 1.2 }}>{li.prekes_kodas || ''}</Typography></TableCell>
    )}
    <TableCell sx={{ ...cellSx, textAlign: 'right' }}>{fmtQty(li.qty)}</TableCell>
    <TableCell sx={{ ...cellSx, textAlign: 'center' }}>{li.unit || ''}</TableCell>
    <TableCell sx={{ ...cellSx, textAlign: 'right' }}>{fmtPrice(li.price)}</TableCell>
    {hasDiscount && (
      <TableCell sx={{ ...cellSx, textAlign: 'right' }}>{li.discount > 0 ? fmt(li.discount) : ''}</TableCell>
    )}
    <TableCell sx={{ ...cellSx, textAlign: 'right', fontWeight: 700 }}>{fmt(li.net)}</TableCell>
  </TableRow>
);

// ═══════════════════════════════════════════════════════════
// Section: Totals
// ═══════════════════════════════════════════════════════════

const InvoiceTotalsSection = ({
  inv, isPvm, sym, currency, sumNet, invoiceDiscount, base,
  vatBreakdown, multiVat, vatTotal, grand,
}) => (
  <Box data-section="totals" sx={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 3, mb: 3, alignItems: 'start' }}>
    <Box>
      {inv.note && (
        <Box sx={{ mb: isPvm && currency === 'EUR' ? 2.5 : 0 }}>
          <Typography sx={{ fontSize: 9.5, fontWeight: 700, color: '#888', mb: 0.4 }}>PASTABA:</Typography>
          <Typography sx={{ fontSize: 10.5, color: '#222', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{inv.note}</Typography>
        </Box>
      )}
      {isPvm && grand && currency === 'EUR' && (
        <Box>
          <Typography sx={{ fontSize: 9.5, fontWeight: 700, color: '#888', mb: 0.4 }}>SUMA ŽODŽIAIS:</Typography>
          <Typography sx={{ fontSize: 10, color: '#555', lineHeight: 1.45 }}>{sumInWordsLt(grand)}</Typography>
        </Box>
      )}
    </Box>
    <Box sx={{ ml: 'auto', width: 280 }}>
      {invoiceDiscount > 0 && (
        <>
          <TotalRow label="Tarpinė suma:" value={`${fmt(sumNet)} ${sym}`} />
          <TotalRow label="Nuolaida:" value={`-${fmt(invoiceDiscount)} ${sym}`} />
        </>
      )}
      {isPvm ? (
        <>
          <TotalRow label="Suma be PVM:" value={`${fmt(base)} ${sym}`} />
          {multiVat ? (
            <>
              {vatBreakdown.map((g) => (
                <TotalRow key={`b-${g.rate}`} indent label={`Apmokestinama PVM ${Number.isInteger(g.rate) ? g.rate : fmt(g.rate)}%:`} value={`${fmt(g.net)} ${sym}`} />
              ))}
              {vatBreakdown.filter((g) => g.rate > 0).map((g) => (
                <TotalRow key={`v-${g.rate}`} label={`PVM ${Number.isInteger(g.rate) ? g.rate : fmt(g.rate)}%:`} value={`${fmt(g.vat)} ${sym}`} />
              ))}
            </>
          ) : (
            <TotalRow label={`PVM ${vatBreakdown[0]?.rate ?? inv.vat_percent}%:`} value={`${fmt(vatTotal)} ${sym}`} />
          )}
          <TotalRow label="Suma su PVM:" value={`${fmt(grand)} ${sym}`} bold />
        </>
      ) : (
        <TotalRow label="Bendra suma:" value={`${fmt(base)} ${sym}`} bold />
      )}
    </Box>
  </Box>
);

// ═══════════════════════════════════════════════════════════
// Section: Signatures
// ═══════════════════════════════════════════════════════════

const InvoiceSignaturesSection = ({ inv }) => (
  <Box data-section="signatures" sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, mt: 1 }}>
    <SignatureBlock label="SĄSKAITĄ IŠRAŠĖ:" name={inv.issued_by} />
    <SignatureBlock label="SĄSKAITĄ PRIĖMĖ:" name={inv.received_by} />
  </Box>
);

// ═══════════════════════════════════════════════════════════
// Section: Page footer
// ═══════════════════════════════════════════════════════════

const InvoicePageFooter = ({ watermark, pageNumber, totalPages }) => (
  <Box sx={{ mt: 'auto', pt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
    {watermark ? (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography sx={{ fontSize: 10, color: '#999' }}>Sąskaita sugeneruota su</Typography>
        <Box
          component="img" src="/dokskenas_logo_for_invoice.jpg" alt="DokSkenas"
          sx={{ height: 28, opacity: 0.6 }}
          onError={(e) => { e.target.style.display = 'none'; if (e.target.nextElementSibling) e.target.nextElementSibling.style.display = 'inline'; }}
        />
        <Typography sx={{ fontSize: 10, color: '#999', fontWeight: 700, display: 'none' }}>DokSkenas</Typography>
      </Box>
    ) : <Box />}
    <Typography sx={{ fontSize: 6.5, color: '#aaa' }}>
      Puslapis {pageNumber}/{totalPages}
    </Typography>
  </Box>
);

// ═══════════════════════════════════════════════════════════
// InvoiceA4 — single page (backward-compatible + pagination)
// ═══════════════════════════════════════════════════════════

const InvoiceA4 = forwardRef(({
  invoice, logoUrl, watermark = false,
  // Pagination props (optional)
  showHeader = true,
  showParties = true,
  showTable = true,
  rowStart = 0,
  rowEnd = Infinity,
  showTotals = true,
  showSignatures = true,
  pageNumber = 1,
  totalPages = 1,
  fixedHeight = false,
}, ref) => {
  const computed = useComputedInvoice(invoice);
  const { inv, computedLines, sym, currency, isPvm, hasCode, hasDiscount,
    sumNet, invoiceDiscount, base, vatBreakdown, multiVat, vatTotal, grand } = computed;

  const visibleRows = computedLines.slice(rowStart, Math.min(rowEnd, computedLines.length));

  return (
    <Box
      ref={ref}
      sx={{
        width: PAGE_W,
        ...(fixedHeight ? { height: PAGE_H } : { minHeight: PAGE_H }),
        p: `${PAD.top}px ${PAD.right}px ${PAD.bottom}px ${PAD.left}px`,
        ...pageFontSx,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        '@media print': {
          width: '210mm',
          minHeight: '297mm',
          p: '16mm 18mm 18mm 18mm',
          boxShadow: 'none',
        },
      }}
    >
      {/* Content area */}
      <Box sx={{ flex: '1 1 auto', minHeight: 0 }}>
        {showHeader && <InvoiceHeaderSection inv={inv} logoUrl={logoUrl} />}
        {showParties && <InvoicePartiesSection inv={inv} />}

        {showTable && visibleRows.length > 0 && (
          <TableContainer data-section="table" sx={{ mb: 2 }}>
            <Table size="small" sx={{ '& td, & th': { borderLeft: 'none', borderRight: 'none' }, tableLayout: 'fixed', width: '100%' }}>
              <InvoiceTableHead hasCode={hasCode} hasDiscount={hasDiscount} isPvm={isPvm} currency={currency} />
              <TableBody>
                {visibleRows.map((li, i) => (
                  <InvoiceTableRowItem
                    key={rowStart + i}
                    li={li}
                    index={rowStart + i}
                    hasCode={hasCode}
                    hasDiscount={hasDiscount}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {showTotals && (
          <InvoiceTotalsSection
            inv={inv} isPvm={isPvm} sym={sym} currency={currency}
            sumNet={sumNet} invoiceDiscount={invoiceDiscount} base={base}
            vatBreakdown={vatBreakdown} multiVat={multiVat} vatTotal={vatTotal} grand={grand}
          />
        )}

        {showSignatures && <InvoiceSignaturesSection inv={inv} />}
      </Box>

      {/* Footer — pushed to bottom */}
      <InvoicePageFooter watermark={watermark} pageNumber={pageNumber} totalPages={totalPages} />
    </Box>
  );
});

InvoiceA4.displayName = 'InvoiceA4';

// ═══════════════════════════════════════════════════════════
// Pagination logic — measure & split
// ═══════════════════════════════════════════════════════════

/**
 * PaginatedInvoice renders a hidden measurement instance of InvoiceA4,
 * measures section heights, splits rows across A4 pages,
 * then renders visible paginated pages.
 */
const PaginatedInvoice = forwardRef(({ invoice, logoUrl, watermark = false }, ref) => {
  const measureRef = useRef(null);
  const [pages, setPages] = useState(null);

  /* ---- Phase 1: measure sections via hidden render ---- */
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;

    const q = (sel) => el.querySelector(sel);

    const headerH = q('[data-section="header"]')?.offsetHeight || 0;
    const partiesH = q('[data-section="parties"]')?.offsetHeight || 0;
    const tableHeadH = q('[data-section="table-head"]')?.offsetHeight || 0;
    const totalsH = q('[data-section="totals"]')?.offsetHeight || 0;
    const signaturesH = q('[data-section="signatures"]')?.offsetHeight || 0;

    const rowEls = el.querySelectorAll('[data-row-index]');
    const rowHeights = Array.from(rowEls).map((r) => r.offsetHeight);

    /* ---- Calculate page breaks ---- */
    const GAP_AFTER_PARTIES = 0;  // already included in mb:'46px'
    const TABLE_MB = 16;          // mb: 2 = 16px
    const TOTALS_SIG_H = totalsH + signaturesH;

    const pagesArr = [];
    let currentRow = 0;
    const totalRows = rowHeights.length;

    // First page: header + parties + table head + rows
    let space = USABLE_H - headerH - partiesH - GAP_AFTER_PARTIES - tableHeadH;

    // Add rows to first page
    while (currentRow < totalRows && space >= rowHeights[currentRow]) {
      space -= rowHeights[currentRow];
      currentRow++;
    }

    const firstPageDone = currentRow >= totalRows;

    // Check if totals+signatures fit on first page
    if (firstPageDone && space >= TABLE_MB + TOTALS_SIG_H) {
      // Everything on one page
      pagesArr.push({
        showHeader: true, showParties: true, showTable: true,
        rowStart: 0, rowEnd: totalRows,
        showTotals: true, showSignatures: true,
      });
    } else {
      // First page — rows only (no totals)
      pagesArr.push({
        showHeader: true, showParties: true, showTable: true,
        rowStart: 0, rowEnd: currentRow,
        showTotals: false, showSignatures: false,
      });

      // Middle / subsequent pages
      while (currentRow < totalRows) {
        space = USABLE_H - tableHeadH;
        const pageStart = currentRow;

        while (currentRow < totalRows && space >= rowHeights[currentRow]) {
          space -= rowHeights[currentRow];
          currentRow++;
        }

        const isLast = currentRow >= totalRows;

        if (isLast && space >= TABLE_MB + TOTALS_SIG_H) {
          // Last page with totals
          pagesArr.push({
            showHeader: false, showParties: false, showTable: true,
            rowStart: pageStart, rowEnd: currentRow,
            showTotals: true, showSignatures: true,
          });
        } else {
          // Rows only
          pagesArr.push({
            showHeader: false, showParties: false, showTable: true,
            rowStart: pageStart, rowEnd: currentRow,
            showTotals: false, showSignatures: false,
          });
        }
      }

      // If totals didn't fit on the last page
      const last = pagesArr[pagesArr.length - 1];
      if (!last.showTotals) {
        pagesArr.push({
          showHeader: false, showParties: false, showTable: false,
          rowStart: totalRows, rowEnd: totalRows,
          showTotals: true, showSignatures: true,
        });
      }
    }

    setPages(pagesArr);
  }, [invoice, logoUrl]);

  /* ---- Phase 1 render: hidden measurement container ---- */
  if (!pages) {
    return (
      <Box
        ref={measureRef}
        sx={{
          position: 'absolute',
          left: -9999,
          top: 0,
          visibility: 'hidden',
          pointerEvents: 'none',
          width: PAGE_W,
          p: `${PAD.top}px ${PAD.right}px ${PAD.bottom}px ${PAD.left}px`,
          ...pageFontSx,
          boxSizing: 'border-box',
        }}
      >
        <InvoiceA4
          invoice={invoice}
          logoUrl={logoUrl}
          watermark={watermark}
        />
      </Box>
    );
  }

  /* ---- Phase 2 render: paginated ---- */
  const totalPages = pages.length;

  if (totalPages === 1) {
    // Single page — use normal InvoiceA4 (no fixed height)
    return (
      <InvoiceA4
        ref={ref}
        invoice={invoice}
        logoUrl={logoUrl}
        watermark={watermark}
        pageNumber={1}
        totalPages={1}
      />
    );
  }

  return (
    <Box ref={ref}>
      {pages.map((page, i) => (
        <Box key={i}>
          {i > 0 && (
            <Box sx={{
              height: 20,
              background: '#e0e0e0',
              '@media print': { display: 'none' },
            }} />
          )}
          <Box
            className="invoice-page"
            sx={{
              background: '#fff',
              '@media print': { breakBefore: i > 0 ? 'page' : 'auto' },
            }}
          >
            <InvoiceA4
              invoice={invoice}
              logoUrl={logoUrl}
              watermark={watermark}
              showHeader={page.showHeader}
              showParties={page.showParties}
              showTable={page.showTable}
              rowStart={page.rowStart}
              rowEnd={page.rowEnd}
              showTotals={page.showTotals}
              showSignatures={page.showSignatures}
              pageNumber={i + 1}
              totalPages={totalPages}
              fixedHeight
            />
          </Box>
        </Box>
      ))}
    </Box>
  );
});

PaginatedInvoice.displayName = 'PaginatedInvoice';

// ═══════════════════════════════════════════════════════════
// PDF Download hook  (unchanged)
// ═══════════════════════════════════════════════════════════

const useInvoicePdf = () => {
  const [loading, setLoading] = useState(false);

  const downloadPdf = useCallback(async (invoiceId, filename) => {
    setLoading(true);
    try {
      const response = await invoicingApi.getInvoicePdf(invoiceId);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `saskaita-${invoiceId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } finally {
      setLoading(false);
    }
  }, []);

  return { downloadPdf, pdfLoading: loading };
};

// ═══════════════════════════════════════════════════════════
// Print handler — now handles multi-page
// ═══════════════════════════════════════════════════════════

const usePrintInvoice = (printRef, invoice) => {
  const handlePrint = useCallback(() => {
    const content = printRef.current;
    if (!content) return;

    const win = window.open('', '_blank', 'width=900,height=1200');

    const printStyles = `
      * { margin: 0; padding: 0; box-sizing: border-box; }

      @page {
        size: A4;
        margin: 0;
      }

      html, body {
        margin: 0; padding: 0; background: #fff;
        font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: 11px; color: #222;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      /* Each .invoice-page becomes one printed page */
      .invoice-page {
        break-after: page;
        break-inside: avoid;
      }
      .invoice-page:last-child {
        break-after: auto;
      }

      /* Hide the visual gap between pages */
      .page-gap { display: none !important; }

      [class*="MuiBox-root"] { display: block; }
      [class*="MuiTypography-root"] { margin: 0; font-family: inherit; }
      [class*="MuiDivider-root"], hr { border: none; border-top: 1.2px solid #333; margin: 14px 0; }

      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { padding: 5px 8px; font-size: 10px; text-align: left; vertical-align: top; border-bottom: 0.5px solid #e0e0e0; }
      th { font-weight: 700; font-size: 8.8px; color: #555; background: #f5f5f5; border-bottom: 1.2px solid #333; }
      tr:nth-child(even) { background: #fafafa; }
      img { max-width: 100%; height: auto; }
      a { text-decoration: none; }
    `;

    const clone = content.cloneNode(true);

    const applyStyles = (original, cloned) => {
      if (original.nodeType !== 1) return;
      const computed = window.getComputedStyle(original);
      const important = [
        'display', 'flex-direction', 'justify-content', 'align-items', 'gap', 'flex-wrap', 'flex',
        'grid-template-columns', 'grid-column', 'column-gap', 'row-gap',
        'width', 'min-width', 'max-width', 'height', 'min-height',
        'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
        'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
        'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
        'color', 'background-color', 'background',
        'border', 'border-top', 'border-bottom', 'border-left', 'border-right', 'border-radius',
        'text-align', 'vertical-align', 'white-space', 'word-break',
        'position', 'top', 'left', 'right', 'bottom', 'opacity',
      ];
      important.forEach(prop => {
        const val = computed.getPropertyValue(prop);
        if (val && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== 'initial') {
          cloned.style.setProperty(prop, val);
        }
      });
      const origChildren = original.children;
      const clonedChildren = cloned.children;
      for (let i = 0; i < origChildren.length; i++) {
        if (clonedChildren[i]) applyStyles(origChildren[i], clonedChildren[i]);
      }
    };

    applyStyles(content, clone);

    win.document.write(`<!DOCTYPE html><html><head>
      <title>${invoice?.full_number || (invoice?.document_series || '') + (invoice?.document_number || '') || 'Sąskaita'}</title>
      <style>${printStyles}</style>
    </head><body>${clone.outerHTML}</body></html>`);
    win.document.close();

    const images = win.document.querySelectorAll('img');
    let loaded = 0;
    const total = images.length;
    const tryPrint = () => { loaded++; if (loaded >= total) setTimeout(() => win.print(), 150); };
    if (total === 0) { setTimeout(() => win.print(), 200); }
    else { images.forEach(img => { if (img.complete) tryPrint(); else { img.onload = tryPrint; img.onerror = tryPrint; } }); }
  }, [printRef, invoice]);

  return handlePrint;
};

// ═══════════════════════════════════════════════════════════
// Preview Dialog  (uses PaginatedInvoice)
// ═══════════════════════════════════════════════════════════

const InvoicePreviewDialog = ({ open, onClose, invoiceId, invoiceData }) => {
  const printRef = useRef(null);
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [logoUrl, setLogoUrl] = useState(null);
  const { downloadPdf, pdfLoading } = useInvoicePdf();
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });
  const [watermark, setWatermark] = useState(false);

  const handlePrint = usePrintInvoice(printRef, invoice);

  useEffect(() => {
    if (!open) return;
    getInvSubscription()
      .then((data) => setWatermark(data?.features?.watermark || false))
      .catch(() => setWatermark(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    invoicingApi.getSettings()
      .then(({ data }) => setLogoUrl(data.logo_url || null))
      .catch(() => setLogoUrl(null));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (invoiceData) { setInvoice(invoiceData); return; }
    if (!invoiceId) return;
    (async () => {
      setLoading(true);
      setError('');
      try { const { data } = await invoicingApi.getInvoice(invoiceId); setInvoice(data); }
      catch { setError('Nepavyko įkelti sąskaitos'); }
      finally { setLoading(false); }
    })();
  }, [open, invoiceId, invoiceData]);

  const handleDownloadPdf = async () => {
    if (!invoice?.id && !invoiceId) return;
    try {
      const id = invoice?.id || invoiceId;
      const fn = invoice?.full_number || `saskaita-${id}`;
      await downloadPdf(id, `${fn}.pdf`);
    } catch {
      setSnack({ open: true, msg: 'Nepavyko atsisiųsti PDF', severity: 'error' });
    }
  };

  const fullNum = invoice?.full_number || `${invoice?.document_series || ''}${invoice?.document_number || ''}`;

  return (
    <>
      <Dialog
        open={open} onClose={onClose} maxWidth={false} disableScrollLock
        PaperProps={{ sx: { maxWidth: 920, width: '100%', maxHeight: '95vh', borderRadius: 3 } }}
      >
        <Box sx={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          px: 3, py: 1.5, borderBottom: '1px solid #eee', flexWrap: 'wrap', gap: 1,
        }}>
          <Typography sx={{ fontWeight: 700, fontSize: 16 }}>{fullNum || 'Peržiūra'}</Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button size="small" startIcon={<PrintIcon />} onClick={handlePrint} variant="outlined" disabled={!invoice}>
              Spausdinti
            </Button>
            <Button
              size="small" variant="contained" disabled={pdfLoading || !invoice}
              startIcon={pdfLoading ? <CircularProgress size={16} /> : <DownloadIcon />}
              onClick={handleDownloadPdf}
            >
              Parsisiųsti PDF
            </Button>
            <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
          </Box>
        </Box>

        <DialogContent sx={{ p: 3, backgroundColor: '#e0e0e0', display: 'flex', justifyContent: 'center', overflow: 'auto' }}>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
              <CircularProgress />
            </Box>
          )}
          {error && (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
              <Typography color="error">{error}</Typography>
            </Box>
          )}
          {invoice && !loading && (
            <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', py: 2 }}>
              <Box sx={{
                width: PAGE_W,
                background: '#fff',
                boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
                borderRadius: 0.5,
                /* The paginated invoice may render multiple "pages" stacked vertically */
                '& .invoice-page': {
                  boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
                },
              }}>
                <PaginatedInvoice ref={printRef} invoice={invoice} logoUrl={logoUrl} watermark={watermark} />
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.severity} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </>
  );
};

// ═══════════════════════════════════════════════════════════
// Standalone buttons  (unchanged)
// ═══════════════════════════════════════════════════════════

const InvoicePreviewButton = ({ invoiceId, invoiceData, label = 'Peržiūra', size = 'small', variant = 'outlined', iconOnly, ...props }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      {iconOnly ? (
        <IconButton size={size} onClick={() => setOpen(true)} {...props}><PreviewIcon fontSize="small" /></IconButton>
      ) : (
        <Button size={size} variant={variant} startIcon={<PreviewIcon />} onClick={() => setOpen(true)} {...props}>{label}</Button>
      )}
      <InvoicePreviewDialog open={open} onClose={() => setOpen(false)} invoiceId={invoiceId} invoiceData={invoiceData} />
    </>
  );
};

const InvoicePdfButton = ({ invoiceId, filename, size = 'small', variant = 'outlined', iconOnly, onError, ...props }) => {
  const { downloadPdf, pdfLoading } = useInvoicePdf();
  const handleClick = async () => { try { await downloadPdf(invoiceId, filename); } catch { onError?.('Nepavyko atsisiųsti PDF'); } };

  return iconOnly ? (
    <IconButton size={size} onClick={handleClick} disabled={pdfLoading} {...props}>
      {pdfLoading ? <CircularProgress size={16} /> : <PdfIcon fontSize="small" />}
    </IconButton>
  ) : (
    <Button size={size} variant={variant} startIcon={pdfLoading ? <CircularProgress size={16} /> : <PdfIcon />} onClick={handleClick} disabled={pdfLoading} {...props}>
      PDF
    </Button>
  );
};

export {
  InvoiceA4,
  PaginatedInvoice,
  InvoicePreviewDialog,
  InvoicePreviewButton,
  InvoicePdfButton,
  useInvoicePdf,
  usePrintInvoice,
};

export default InvoicePreviewDialog;




// import { useState, useRef, useEffect, forwardRef, useCallback } from 'react';
// import {
//   Box, Typography, Divider, Table, TableBody, TableCell, TableContainer,
//   TableHead, TableRow, Button, Dialog, DialogContent, IconButton,
//   CircularProgress, Snackbar, Alert,
// } from '@mui/material';
// import {
//   PictureAsPdf as PdfIcon, Close as CloseIcon, Download as DownloadIcon,
//   Print as PrintIcon, Visibility as PreviewIcon,
// } from '@mui/icons-material';
// import { invoicingApi } from '../api/invoicingApi';
// import { getInvSubscription } from '../api/endpoints';

// // ═══════════════════════════════════════════════════════════
// // Helpers
// // ═══════════════════════════════════════════════════════════

// const parseNum = (v) => {
//   if (typeof v === 'number') return v;
//   if (!v) return 0;
//   return parseFloat(String(v).replace(',', '.')) || 0;
// };

// const fmt = (n, dec = 2) => Number(n || 0).toFixed(dec).replace('.', ',');

// const fmtPrice = (value) => {
//   if (value == null || value === '') return '0';
//   const n = Number(value || 0);
//   let s = n.toFixed(4).replace('.', ',');
//   const parts = s.split(',');
//   if (parts.length === 2) {
//     let dec = parts[1].replace(/0+$/, '');
//     if (dec.length < 2) dec = dec.padEnd(2, '0');
//     return `${parts[0]},${dec}`;
//   }
//   return s;
// };

// const fmtQty = (value) => {
//   if (value == null || value === '') return '0';
//   const n = Number(value || 0);
//   if (Number.isInteger(n)) return String(n);
//   return String(n).replace('.', ',').replace(/0+$/, '').replace(/,$/, '');
// };

// const fmtDate = (d) => d || '';

// const getCodeLabel = (personType) =>
//   personType === 'fizinis' ? 'Asmens / ind. veiklos kodas' : 'Įm. kodas';

// const TYPE_LABELS = {
//   isankstine: 'IŠANKSTINĖ SĄSKAITA FAKTŪRA',
//   pvm_saskaita: 'PVM SĄSKAITA FAKTŪRA',
//   saskaita: 'SĄSKAITA FAKTŪRA',
//   kreditine: 'KREDITINĖ SĄSKAITA FAKTŪRA',
// };

// const CURRENCY_SYMBOLS = {
//   EUR: '€',
//   USD: '$',
//   GBP: '£',
//   PLN: 'zł',
//   CZK: 'Kč',
//   CHF: 'CHF',
//   SEK: 'kr',
//   NOK: 'kr',
//   DKK: 'kr',
//   UAH: '₴',
//   RUB: '₽',
//   JPY: '¥',
//   CNY: '¥',
// };

// const getSym = (c) => CURRENCY_SYMBOLS[c] || c;

// // ─── Helper component ──────────────────
 
// const PaymentButtonPdf = ({ url, amount, currency }) => {
//   if (!url) return null;
//   const sym = CURRENCY_SYMBOLS[currency] || currency;
//   const fmtAmount = Number(amount || 0).toFixed(2).replace('.', ',');
 
//   return (
//     <Box
//       component="a"
//       href={url}
//       target="_blank"
//       rel="noopener noreferrer"
//       sx={{
//         backgroundColor: '#1976d2',
//         borderRadius: '5px',
//         px: 2,
//         py: 0.8,
//         textDecoration: 'none',
//         display: 'inline-flex',
//         flexDirection: 'column',
//         alignItems: 'center',
//         flexShrink: 0,
//         minWidth: 100,
//         '&:hover': { backgroundColor: '#1565c0' },
//       }}
//     >
//       <Typography sx={{ color: '#fff', fontSize: 8.5, fontWeight: 700, lineHeight: 1.3 }}>
//         Apmokėti sąskaitą
//       </Typography>
//       <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontSize: 7.5, lineHeight: 1.3 }}>
//         {fmtAmount} {sym}
//       </Typography>
//     </Box>
//   );
// };

// // ═══════════════════════════════════════════════════════════
// // Lithuanian amount in words
// // ═══════════════════════════════════════════════════════════

// const sumInWordsLt = (amount) => {
//   const ones = ['', 'vienas', 'du', 'trys', 'keturi', 'penki', 'šeši', 'septyni', 'aštuoni', 'devyni'];
//   const teens = ['dešimt', 'vienuolika', 'dvylika', 'trylika', 'keturiolika', 'penkiolika', 'šešiolika', 'septyniolika', 'aštuoniolika', 'devyniolika'];
//   const tens = ['', 'dešimt', 'dvidešimt', 'trisdešimt', 'keturiasdešimt', 'penkiasdešimt', 'šešiasdešimt', 'septyniasdešimt', 'aštuoniasdešimt', 'devyniasdešimt'];
//   const hundreds = ['', 'šimtas', 'du šimtai', 'trys šimtai', 'keturi šimtai', 'penki šimtai', 'šeši šimtai', 'septyni šimtai', 'aštuoni šimtai', 'devyni šimtai'];

//   const belowThousand = (n) => {
//     if (!n) return '';
//     const parts = [];
//     if (n >= 100) {
//       parts.push(hundreds[Math.floor(n / 100)]);
//       n %= 100;
//     }
//     if (n >= 10 && n <= 19) {
//       parts.push(teens[n - 10]);
//       return parts.join(' ');
//     }
//     if (n >= 20) {
//       parts.push(tens[Math.floor(n / 10)]);
//       n %= 10;
//     }
//     if (n > 0) parts.push(ones[n]);
//     return parts.join(' ');
//   };

//   const thousandForm = (n) => {
//     if (n % 100 >= 11 && n % 100 <= 19) return 'tūkstančių';
//     const last = n % 10;
//     if (last === 1) return 'tūkstantis';
//     if (last === 0) return 'tūkstančių';
//     return 'tūkstančiai';
//   };

//   const millionForm = (n) => {
//     if (n % 100 >= 11 && n % 100 <= 19) return 'milijonų';
//     const last = n % 10;
//     if (last === 1) return 'milijonas';
//     if (last === 0) return 'milijonų';
//     return 'milijonai';
//   };

//   const currencyForm = (n, unit = 'eur') => {
//     if (unit === 'eur') {
//       if ((n % 100 >= 11 && n % 100 <= 19) || n % 10 === 0) return 'eurų';
//       if (n % 10 === 1) return 'euras';
//       return 'eurai';
//     }
//     if ((n % 100 >= 11 && n % 100 <= 19) || n % 10 === 0) return 'centų';
//     if (n % 10 === 1) return 'centas';
//     return 'centai';
//   };

//   const rounded = Math.round((Number(amount || 0) + Number.EPSILON) * 100) / 100;
//   const euros = Math.floor(rounded);
//   const cents = Math.round((rounded - euros) * 100);

//   const parts = [];
//   if (euros === 0) {
//     parts.push('nulis');
//   } else {
//     let e = euros;
//     if (e >= 1_000_000) {
//       const m = Math.floor(e / 1_000_000);
//       parts.push(`${belowThousand(m)} ${millionForm(m)}`);
//       e %= 1_000_000;
//     }
//     if (e >= 1000) {
//       const t = Math.floor(e / 1000);
//       parts.push(`${belowThousand(t)} ${thousandForm(t)}`);
//       e %= 1000;
//     }
//     if (e > 0) {
//       parts.push(belowThousand(e));
//     }
//   }

//   parts.push(currencyForm(euros));

//   if (cents > 0) {
//     parts.push(`${belowThousand(cents)} ${currencyForm(cents, 'cent')}`);
//   }

//   const text = parts.filter(Boolean).join(' ').trim();
//   return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
// };

// // ═══════════════════════════════════════════════════════════
// // Small components
// // ═══════════════════════════════════════════════════════════

// const InfoRow = ({ label, value }) => (
//   <Typography sx={{ fontSize: 10.5, lineHeight: 1.55, color: '#222' }}>
//     <Box component="span" sx={{ fontSize: 9.2, color: '#888', display: 'inline' }}>
//       {label}:
//     </Box>{' '}
//     {value}
//   </Typography>
// );

// const TotalRow = ({ label, value, bold, indent }) => (
//   <Box
//     sx={{
//       display: 'flex',
//       justifyContent: 'space-between',
//       py: 0.15,
//       ...(indent ? { pl: 1.5 } : {}),
//       ...(bold ? { mt: 0.6, pt: 0.6, borderTop: '1.5px solid #333' } : {}),
//     }}
//   >
//     <Typography sx={{ fontSize: indent ? 9.5 : 10.5, fontWeight: bold ? 800 : 400, color: indent ? '#555' : '#222' }}>
//       {label}
//     </Typography>
//     <Typography sx={{ fontSize: indent ? 9.5 : 10.5, fontWeight: bold ? 800 : 700, color: indent ? '#555' : '#222' }}>
//       {value}
//     </Typography>
//   </Box>
// );

// const SignatureBlock = ({ label, name }) => (
//   <Box>
//     <Typography sx={{ fontSize: 9.5, fontWeight: 700, color: '#888', mb: 0.5 }}>
//       {label}
//     </Typography>
//     <Typography sx={{ fontSize: 10.5, color: '#222', minHeight: 18 }}>
//       {name || ' '}
//     </Typography>
//   </Box>
// );

// // ═══════════════════════════════════════════════════════════
// // Table styles  (FIX #1: header bg; FIX #3: thinner lines)
// // ═══════════════════════════════════════════════════════════

// const cellSx = {
//   py: 0.55,
//   px: 1,
//   fontSize: 10,
//   borderBottom: '0.5px solid #e0e0e0',
//   verticalAlign: 'top',
//   color: '#222',
//   lineHeight: 1.3,
// };

// const cellHeadSx = {
//   ...cellSx,
//   fontWeight: 700,
//   fontSize: 8.8,
//   color: '#555',
//   borderBottom: '1.2px solid #333',
//   backgroundColor: '#f5f5f5',
//   py: 0.75,
//   letterSpacing: 0,
//   lineHeight: 1.15,
// };

// // ═══════════════════════════════════════════════════════════
// // Invoice A4 Preview  (FIX #4: logo support)
// // ═══════════════════════════════════════════════════════════

// const InvoiceA4 = forwardRef(({ invoice, logoUrl, watermark = false }, ref) => {
//   const inv = invoice || {};
//   const lines = inv.line_items || [];
//   const sym = getSym(inv.currency || 'EUR');
//   const currency = inv.currency || 'EUR';
//   const isPvm = inv.pvm_tipas === 'taikoma';

//   const computedLines = lines.map((li) => {
//     const qty = parseNum(li.quantity);
//     const price = parseNum(li.price);
//     const discount = parseNum(li.discount_wo_vat || 0);
//     const net = Math.max(0, qty * price - discount);
//     const vatPct = li.vat_percent != null
//       ? parseNum(li.vat_percent)
//       : (isPvm ? parseNum(inv.vat_percent || 21) : 0);
//     const vat = isPvm ? net * vatPct / 100 : 0;

//     return {
//       ...li,
//       qty,
//       price,
//       discount,
//       net,
//       vatPct,
//       vat,
//       total: net + vat,
//     };
//   });

//   const hasCode = computedLines.some((l) => l.prekes_kodas);
//   const hasDiscount = computedLines.some((l) => l.discount > 0);

//   const sumNet = computedLines.reduce((s, l) => s + l.net, 0);
//   const invoiceDiscount = Math.min(parseNum(inv.invoice_discount_wo_vat || 0), sumNet);
//   const base = Math.max(0, sumNet - invoiceDiscount);

//   const groups = {};
//   computedLines.forEach((l) => {
//     const r = Number(l.vatPct || 0);
//     if (!groups[r]) groups[r] = { net: 0 };
//     groups[r].net += l.net;
//   });

//   const vatBreakdown = Object.entries(groups)
//     .map(([rate, g]) => {
//       const r = parseFloat(rate);
//       const ratio = sumNet > 0 ? g.net / sumNet : 0;
//       const discountedNet = Math.max(0, g.net - invoiceDiscount * ratio);
//       const vat = isPvm ? Math.max(0, discountedNet * r / 100) : 0;
//       return { rate: r, net: discountedNet, vat };
//     })
//     .sort((a, b) => b.rate - a.rate);

//   const multiVat = vatBreakdown.length > 1;
//   const vatTotal = vatBreakdown.reduce((s, g) => s + g.vat, 0);
//   const grand = base + vatTotal;

//   const hasLogo = Boolean(logoUrl);

//   return (
//     <Box
//       ref={ref}
//       sx={{
//         width: 794,
//         minHeight: 1123,
//         p: '44px 52px 56px 52px',
//         fontFamily: '"Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
//         fontSize: 11,
//         color: '#222',
//         boxSizing: 'border-box',
//         display: 'flex',
//         flexDirection: 'column',
//         '@media print': {
//           width: '210mm',
//           minHeight: '297mm',
//           p: '16mm 18mm 18mm 18mm',
//           boxShadow: 'none',
//         },
//       }}
//     >
//       {/* ── Header ── */}
//       <Box sx={{ mb: 2.2 }}>
//         {hasLogo ? (
//           <>
//             {/* Logo layout: logo left, [payment button + dates] right */}
//             <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
//               <Box sx={{ flexShrink: 0 }}>
//                 <Box
//                   component="img"
//                   src={logoUrl}
//                   alt="Logo"
//                   sx={{
//                     maxWidth: 90,
//                     maxHeight: 36,
//                     objectFit: 'contain',
//                     display: 'block',
//                   }}
//                 />
//               </Box>
//               <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
//                 {inv.payment_link_url && (
//                   <Box
//                     component="a"
//                     href={inv.payment_link_url}
//                     target="_blank"
//                     rel="noopener noreferrer"
//                     sx={{
//                       backgroundColor: '#1976d2',
//                       borderRadius: '5px',
//                       px: 2,
//                       py: 0.8,
//                       textDecoration: 'none',
//                       display: 'inline-flex',
//                       flexDirection: 'column',
//                       alignItems: 'center',
//                       flexShrink: 0,
//                       minWidth: 100,
//                       '&:hover': { backgroundColor: '#1565c0' },
//                     }}
//                   >
//                     <Typography sx={{ color: '#fff', fontSize: 8.5, fontWeight: 700, lineHeight: 1.3 }}>
//                       Apmokėti sąskaitą
//                     </Typography>
//                     <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontSize: 7.5, lineHeight: 1.3 }}>
//                       {fmt(inv.amount_with_vat || 0)} {getSym(inv.currency || 'EUR')}
//                     </Typography>
//                   </Box>
//                 )}
//                 <Box sx={{ textAlign: 'right' }}>
//                   <Typography sx={{ fontSize: 8.8, color: '#555', lineHeight: 1.35 }}>
//                     Data: <strong>{fmtDate(inv.invoice_date)}</strong>
//                   </Typography>
//                   {inv.due_date && (
//                     <Typography sx={{ fontSize: 8.8, color: '#555', lineHeight: 1.35 }}>
//                       Apmokėti iki: <strong>{fmtDate(inv.due_date)}</strong>
//                     </Typography>
//                   )}
//                 </Box>
//               </Box>
//             </Box>

//             <Divider sx={{ borderColor: '#333', borderWidth: 1.2, mt: 1.8 }} />

//             {/* Centered title block (matches PDF with logo) */}
//             <Box sx={{ textAlign: 'center', mt: 2, mb: 0.5 }}>
//               <Typography sx={{ fontSize: 17, fontWeight: 800, color: '#222', lineHeight: 1.1 }}>
//                 {TYPE_LABELS[inv.invoice_type] || 'SĄSKAITA FAKTŪRA'}
//               </Typography>
//               <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#555', mt: 0.4 }}>
//                 Serija {inv.document_series || ''} Nr. {inv.document_number || ''}
//               </Typography>
//               {inv.order_number && (
//                 <Typography sx={{ fontSize: 8.2, color: '#888', mt: 0.35, lineHeight: 1.2 }}>
//                   Užsakymo Nr.: {inv.order_number}
//                 </Typography>
//               )}
//             </Box>
//           </>
//         ) : (
//           <>
//             {/* No-logo layout: title left, [payment button + dates] right */}
//             <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
//               <Box>
//                 <Typography sx={{ fontSize: 17, fontWeight: 800, color: '#222', lineHeight: 1.1 }}>
//                   {TYPE_LABELS[inv.invoice_type] || 'SĄSKAITA FAKTŪRA'}
//                 </Typography>
//                 <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#222', mt: 0.4 }}>
//                   Serija {inv.document_series || ''} Nr. {inv.document_number || ''}
//                 </Typography>
//                 {inv.order_number && (
//                   <Typography sx={{ fontSize: 9, color: '#888', mt: 0.35, lineHeight: 1.2 }}>
//                     Užsakymo Nr.: {inv.order_number}
//                   </Typography>
//                 )}
//               </Box>
//               <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
//                 {inv.payment_link_url && (
//                   <Box
//                     component="a"
//                     href={inv.payment_link_url}
//                     target="_blank"
//                     rel="noopener noreferrer"
//                     sx={{
//                       backgroundColor: '#1976d2',
//                       borderRadius: '5px',
//                       px: 2,
//                       py: 0.8,
//                       textDecoration: 'none',
//                       display: 'inline-flex',
//                       flexDirection: 'column',
//                       alignItems: 'center',
//                       flexShrink: 0,
//                       minWidth: 100,
//                       '&:hover': { backgroundColor: '#1565c0' },
//                     }}
//                   >
//                     <Typography sx={{ color: '#fff', fontSize: 8.5, fontWeight: 700, lineHeight: 1.3 }}>
//                       Apmokėti sąskaitą
//                     </Typography>
//                     <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontSize: 7.5, lineHeight: 1.3 }}>
//                       {fmt(inv.amount_with_vat || 0)} {getSym(inv.currency || 'EUR')}
//                     </Typography>
//                   </Box>
//                 )}
//                 <Box sx={{ textAlign: 'right' }}>
//                   <Typography sx={{ fontSize: 8.8, color: '#555', lineHeight: 1.35 }}>
//                     Data: <strong>{fmtDate(inv.invoice_date)}</strong>
//                   </Typography>
//                   {inv.due_date && (
//                     <Typography sx={{ fontSize: 8.8, color: '#555', lineHeight: 1.35 }}>
//                       Apmokėti iki: <strong>{fmtDate(inv.due_date)}</strong>
//                     </Typography>
//                   )}
//                 </Box>
//               </Box>
//             </Box>

//             <Divider sx={{ borderColor: '#333', borderWidth: 1.2, mt: 1.8 }} />
//           </>
//         )}
//       </Box>

//       {/* ── Parties ── */}
//       <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, mb: '46px' }}>
//         <Box>
//           <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#888', mb: 0.4, letterSpacing: 0.5 }}>
//             PARDAVĖJAS
//           </Typography>
//           <Typography sx={{ fontSize: 12.5, fontWeight: 700, mb: 0.5 }}>{inv.seller_name || ''}</Typography>
//           {inv.seller_id && <InfoRow label={getCodeLabel(inv.seller_type)} value={inv.seller_id} />}
//           {inv.seller_vat_code && <InfoRow label="PVM kodas" value={inv.seller_vat_code} />}
//           {inv.seller_address && <InfoRow label="Adresas" value={inv.seller_address} />}
//           {inv.seller_phone && <InfoRow label="Tel." value={inv.seller_phone} />}
//           {inv.seller_email && <InfoRow label="El. paštas" value={inv.seller_email} />}
//           {inv.seller_bank_name && <InfoRow label="Bankas" value={inv.seller_bank_name} />}
//           {inv.seller_iban && <InfoRow label="IBAN" value={inv.seller_iban} />}
//           {inv.seller_swift && <InfoRow label="SWIFT" value={inv.seller_swift} />}
//         </Box>

//         <Box>
//           <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#888', mb: 0.4, letterSpacing: 0.5 }}>
//             PIRKĖJAS
//           </Typography>
//           <Typography sx={{ fontSize: 12.5, fontWeight: 700, mb: 0.5 }}>{inv.buyer_name || ''}</Typography>
//           {inv.buyer_id && <InfoRow label={getCodeLabel(inv.buyer_type)} value={inv.buyer_id} />}
//           {inv.buyer_vat_code && <InfoRow label="PVM kodas" value={inv.buyer_vat_code} />}
//           {inv.buyer_address && <InfoRow label="Adresas" value={inv.buyer_address} />}
//           {inv.buyer_phone && <InfoRow label="Tel." value={inv.buyer_phone} />}
//           {inv.buyer_email && <InfoRow label="El. paštas" value={inv.buyer_email} />}
//           {inv.buyer_bank_name && <InfoRow label="Bankas" value={inv.buyer_bank_name} />}
//           {inv.buyer_iban && <InfoRow label="IBAN" value={inv.buyer_iban} />}
//           {inv.buyer_swift && <InfoRow label="SWIFT" value={inv.buyer_swift} />}
//         </Box>
//       </Box>

//       {/* ── Line items ── */}
//       <TableContainer sx={{ mb: 2 }}>
//         <Table size="small" sx={{ '& td, & th': { borderLeft: 'none', borderRight: 'none' }, tableLayout: 'fixed', width: '100%' }}>
//           <TableHead>
//             <TableRow>
//               <TableCell sx={{ ...cellHeadSx, width: 30 }}>Nr.</TableCell>
//               <TableCell sx={cellHeadSx}>Pavadinimas</TableCell>
//               {hasCode && <TableCell sx={{ ...cellHeadSx, width: 120 }}>Kodas</TableCell>}
//               <TableCell sx={{ ...cellHeadSx, textAlign: 'right', width: 70 }}>Kiekis</TableCell>
//               <TableCell sx={{ ...cellHeadSx, textAlign: 'center', width: 76 }}>Mato vnt.</TableCell>
//               <TableCell sx={{ ...cellHeadSx, textAlign: 'right', width: 92 }}>
//                 <Box sx={{ lineHeight: 1.15 }}>
//                   <div>Kaina {currency}</div>
//                   {isPvm && <div>be PVM</div>}
//                 </Box>
//               </TableCell>
//               {hasDiscount && <TableCell sx={{ ...cellHeadSx, textAlign: 'right', width: 70 }}>Nuol.</TableCell>}
//               <TableCell sx={{ ...cellHeadSx, textAlign: 'right', width: 92 }}>
//                 <Box sx={{ lineHeight: 1.15 }}>
//                   <div>Suma {currency}</div>
//                   {isPvm && <div>be PVM</div>}
//                 </Box>
//               </TableCell>
//             </TableRow>
//           </TableHead>

//           <TableBody>
//             {computedLines.map((li, i) => (
//               <TableRow key={i} sx={{ '&:nth-of-type(even)': { backgroundColor: '#fafafa' } }}>
//                 <TableCell sx={cellSx}>{i + 1}</TableCell>

//                 <TableCell sx={cellSx}>
//                   <Typography sx={{ fontSize: 10.5, color: '#222', lineHeight: 1.35 }}>
//                     {li.prekes_pavadinimas || ''}
//                   </Typography>
//                   {li.prekes_barkodas && (
//                     <Typography sx={{ fontSize: 8.5, color: '#888', lineHeight: 1.2, mt: 0.2 }}>
//                       Barkodas: {li.prekes_barkodas}
//                     </Typography>
//                   )}
//                 </TableCell>

//                 {hasCode && (
//                   <TableCell sx={cellSx}>
//                     <Typography sx={{ fontSize: 9.5, lineHeight: 1.2 }}>
//                       {li.prekes_kodas || ''}
//                     </Typography>
//                   </TableCell>
//                 )}

//                 <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
//                   {fmtQty(li.qty)}
//                 </TableCell>

//                 <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
//                   {li.unit || ''}
//                 </TableCell>

//                 <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
//                   {fmtPrice(li.price)}
//                 </TableCell>

//                 {hasDiscount && (
//                   <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
//                     {li.discount > 0 ? fmt(li.discount) : ''}
//                   </TableCell>
//                 )}

//                 <TableCell sx={{ ...cellSx, textAlign: 'right', fontWeight: 700 }}>
//                   {fmt(li.net)}
//                 </TableCell>
//               </TableRow>
//             ))}
//           </TableBody>
//         </Table>
//       </TableContainer>

//       {/* ── Totals + note + words ── */}
//       <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 3, mb: 3, alignItems: 'start' }}>
//         <Box>
//           {inv.note && (
//             <Box sx={{ mb: isPvm && currency === 'EUR' ? 2.5 : 0 }}>
//               <Typography sx={{ fontSize: 9.5, fontWeight: 700, color: '#888', mb: 0.4 }}>
//                 PASTABA:
//               </Typography>
//               <Typography sx={{ fontSize: 10.5, color: '#222', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
//                 {inv.note}
//               </Typography>
//             </Box>
//           )}

//           {isPvm && grand && currency === 'EUR' && (
//             <Box>
//               <Typography sx={{ fontSize: 9.5, fontWeight: 700, color: '#888', mb: 0.4 }}>
//                 SUMA ŽODŽIAIS:
//               </Typography>
//               <Typography sx={{ fontSize: 10, color: '#555', lineHeight: 1.45 }}>
//                 {sumInWordsLt(grand)}
//               </Typography>
//             </Box>
//           )}
//         </Box>

//         <Box sx={{ ml: 'auto', width: 280 }}>
//           {invoiceDiscount > 0 && (
//             <>
//               <TotalRow label="Tarpinė suma:" value={`${fmt(sumNet)} ${sym}`} />
//               <TotalRow label="Nuolaida:" value={`-${fmt(invoiceDiscount)} ${sym}`} />
//             </>
//           )}

//           {isPvm ? (
//             <>
//               <TotalRow label="Suma be PVM:" value={`${fmt(base)} ${sym}`} />
//               {multiVat ? (
//                 <>
//                   {vatBreakdown.map((g) => (
//                     <TotalRow
//                       key={`b-${g.rate}`}
//                       indent
//                       label={`Apmokestinama PVM ${Number.isInteger(g.rate) ? g.rate : fmt(g.rate)}%:`}
//                       value={`${fmt(g.net)} ${sym}`}
//                     />
//                   ))}
//                   {vatBreakdown.filter((g) => g.rate > 0).map((g) => (
//                     <TotalRow
//                       key={`v-${g.rate}`}
//                       label={`PVM ${Number.isInteger(g.rate) ? g.rate : fmt(g.rate)}%:`}
//                       value={`${fmt(g.vat)} ${sym}`}
//                     />
//                   ))}
//                 </>
//               ) : (
//                 <TotalRow
//                   label={`PVM ${vatBreakdown[0]?.rate ?? inv.vat_percent}%:`}
//                   value={`${fmt(vatTotal)} ${sym}`}
//                 />
//               )}
//               <TotalRow label="Suma su PVM:" value={`${fmt(grand)} ${sym}`} bold />
//             </>
//           ) : (
//             <TotalRow label="Bendra suma:" value={`${fmt(base)} ${sym}`} bold />
//           )}
//         </Box>
//       </Box>

//       {/* ── Signatures ── */}
//       <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, mt: 1 }}>
//         <SignatureBlock label="SĄSKAITĄ IŠRAŠĖ:" name={inv.issued_by} />
//         <SignatureBlock label="SĄSKAITĄ PRIĖMĖ:" name={inv.received_by} />
//       </Box>

//       {/* ── Page footer ── */}
//       <Box sx={{ mt: 'auto', pt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
//         {watermark ? (
//           <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
//             <Typography sx={{ fontSize: 10, color: '#999' }}>
//               Sąskaita sugeneruota su
//             </Typography>
//             <Box
//               component="img"
//               src="/dokskenas_logo_for_invoice.jpg"
//               alt="DokSkenas"
//               sx={{ height: 28, opacity: 0.6 }}
//               onError={(e) => {
//                 e.target.style.display = 'none';
//                 if (e.target.nextElementSibling) e.target.nextElementSibling.style.display = 'inline';
//               }}
//             />
//             <Typography
//               sx={{
//                 fontSize: 10,
//                 color: '#999',
//                 fontWeight: 700,
//                 display: 'none',
//               }}
//             >
//               DokSkenas
//             </Typography>
//           </Box>
//         ) : (
//           <Box />
//         )}
//         <Typography sx={{ fontSize: 6.5, color: '#aaa' }}>
//           Puslapis 1/1
//         </Typography>
//       </Box>
//     </Box>
//   );
// });

// InvoiceA4.displayName = 'InvoiceA4';

// // ═══════════════════════════════════════════════════════════
// // PDF Download hook
// // ═══════════════════════════════════════════════════════════

// const useInvoicePdf = () => {
//   const [loading, setLoading] = useState(false);

//   const downloadPdf = useCallback(async (invoiceId, filename) => {
//     setLoading(true);
//     try {
//       const response = await invoicingApi.getInvoicePdf(invoiceId);
//       const blob = new Blob([response.data], { type: 'application/pdf' });
//       const url = window.URL.createObjectURL(blob);
//       const a = document.createElement('a');
//       a.href = url;
//       a.download = filename || `saskaita-${invoiceId}.pdf`;
//       document.body.appendChild(a);
//       a.click();
//       window.URL.revokeObjectURL(url);
//       document.body.removeChild(a);
//     } finally {
//       setLoading(false);
//     }
//   }, []);

//   return { downloadPdf, pdfLoading: loading };
// };

// // ═══════════════════════════════════════════════════════════
// // Preview Dialog  (FIX #4: fetch logo from settings)
// // ═══════════════════════════════════════════════════════════

// const InvoicePreviewDialog = ({ open, onClose, invoiceId, invoiceData }) => {
//   const printRef = useRef(null);
//   const [invoice, setInvoice] = useState(null);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState('');
//   const [logoUrl, setLogoUrl] = useState(null);
//   const { downloadPdf, pdfLoading } = useInvoicePdf();
//   const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });

//   // --- Watermark for free plan ---
//   const [watermark, setWatermark] = useState(false);

//     useEffect(() => {
//       if (!open) return;
//       getInvSubscription()
//         .then((data) => setWatermark(data?.features?.watermark || false))
//         .catch(() => setWatermark(false));
//     }, [open]);

//   // Load logo from settings
//   useEffect(() => {
//     if (!open) return;
//     invoicingApi.getSettings()
//       .then(({ data }) => {
//         setLogoUrl(data.logo_url || null);
//       })
//       .catch(() => setLogoUrl(null));
//   }, [open]);

//   useEffect(() => {
//     if (!open) return;
//     if (invoiceData) {
//       setInvoice(invoiceData);
//       return;
//     }
//     if (!invoiceId) return;

//     (async () => {
//       setLoading(true);
//       setError('');
//       try {
//         const { data } = await invoicingApi.getInvoice(invoiceId);
//         setInvoice(data);
//       } catch {
//         setError('Nepavyko įkelti sąskaitos');
//       } finally {
//         setLoading(false);
//       }
//     })();
//   }, [open, invoiceId, invoiceData]);

//   const handlePrint = () => {
//     const content = printRef.current;
//     if (!content) return;

//     const win = window.open('', '_blank', 'width=900,height=1200');

//     const printStyles = `
//       * { margin: 0; padding: 0; box-sizing: border-box; }
      
//       @page { 
//         size: A4; 
//         margin: 0; /* Убирает browser headers/footers */
//       }
      
//       html, body {
//         width: 210mm;
//         height: 297mm;
//         margin: 0;
//         padding: 0;
//         background: #fff;
//         font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
//         font-size: 11px;
//         color: #222;
//         -webkit-print-color-adjust: exact;
//         print-color-adjust: exact;
//       }

//       @media print {
//         html, body {
//           width: 210mm;
//           height: 297mm;
//         }
//         body {
//           margin: 0 !important;
//           padding: 0 !important;
//         }
//       }

//       /* Layout */
//       [class*="MuiBox-root"] { display: block; }
      
//       /* Typography */
//       [class*="MuiTypography-root"] { 
//         margin: 0; 
//         font-family: inherit;
//       }
      
//       /* Divider */
//       [class*="MuiDivider-root"], hr {
//         border: none;
//         border-top: 1.2px solid #333;
//         margin: 14px 0;
//       }

//       /* Table */
//       table { 
//         width: 100%; 
//         border-collapse: collapse; 
//         table-layout: fixed;
//       }
//       th, td { 
//         padding: 5px 8px; 
//         font-size: 10px; 
//         text-align: left;
//         vertical-align: top;
//         border-bottom: 0.5px solid #e0e0e0;
//       }
//       th { 
//         font-weight: 700; 
//         font-size: 8.8px;
//         color: #555;
//         background: #f5f5f5;
//         border-bottom: 1.2px solid #333;
//       }
//       tr:nth-child(even) { background: #fafafa; }

//       /* Images */
//       img { max-width: 100%; height: auto; }

//       /* Links */
//       a { text-decoration: none; }
//     `;

//     const clone = content.cloneNode(true);
    
//     const applyStyles = (original, cloned) => {
//       if (original.nodeType !== 1) return;
      
//       const computed = window.getComputedStyle(original);
//       const important = [
//         'display', 'flex-direction', 'justify-content', 'align-items', 'gap', 'flex-wrap', 'flex',
//         'grid-template-columns', 'grid-column', 'column-gap', 'row-gap',
//         'width', 'min-width', 'max-width', 'height', 'min-height',
//         'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
//         'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
//         'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
//         'color', 'background-color', 'background',
//         'border', 'border-top', 'border-bottom', 'border-left', 'border-right', 'border-radius',
//         'text-align', 'vertical-align', 'white-space', 'word-break',
//         'position', 'top', 'left', 'right', 'bottom',
//         'opacity',
//       ];
      
//       important.forEach(prop => {
//         const val = computed.getPropertyValue(prop);
//         if (val && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== 'initial') {
//           cloned.style.setProperty(prop, val);
//         }
//       });
      
//       const origChildren = original.children;
//       const clonedChildren = cloned.children;
//       for (let i = 0; i < origChildren.length; i++) {
//         if (clonedChildren[i]) {
//           applyStyles(origChildren[i], clonedChildren[i]);
//         }
//       }
//     };
    
//     applyStyles(content, clone);

//     win.document.write(`<!DOCTYPE html>
//       <html>
//         <head>
//           <title>${invoice?.full_number || invoice?.document_series + invoice?.document_number || 'Sąskaita'}</title>
//           <style>${printStyles}</style>
//         </head>
//         <body>${clone.outerHTML}</body>
//       </html>`);
//     win.document.close();

//     const images = win.document.querySelectorAll('img');
//     let loaded = 0;
//     const total = images.length;

//     const tryPrint = () => {
//       loaded++;
//       if (loaded >= total) {
//         setTimeout(() => win.print(), 150);
//       }
//     };

//     if (total === 0) {
//       setTimeout(() => win.print(), 200);
//     } else {
//       images.forEach(img => {
//         if (img.complete) {
//           tryPrint();
//         } else {
//           img.onload = tryPrint;
//           img.onerror = tryPrint;
//         }
//       });
//     }
//   };

//   const handleDownloadPdf = async () => {
//     if (!invoice?.id && !invoiceId) return;
//     try {
//       const id = invoice?.id || invoiceId;
//       const fn = invoice?.full_number || `saskaita-${id}`;
//       await downloadPdf(id, `${fn}.pdf`);
//     } catch {
//       setSnack({ open: true, msg: 'Nepavyko atsisiųsti PDF', severity: 'error' });
//     }
//   };

//   const fullNum = invoice?.full_number || `${invoice?.document_series || ''}${invoice?.document_number || ''}`;

//   return (
//     <>
//       <Dialog
//         open={open}
//         onClose={onClose}
//         maxWidth={false}
//         disableScrollLock
//         PaperProps={{
//           sx: {
//             maxWidth: 920,
//             width: '100%',
//             maxHeight: '95vh',
//             borderRadius: 3,
//           },
//         }}
//       >
//         <Box
//           sx={{
//             display: 'flex',
//             justifyContent: 'space-between',
//             alignItems: 'center',
//             px: 3,
//             py: 1.5,
//             borderBottom: '1px solid #eee',
//             flexWrap: 'wrap',
//             gap: 1,
//           }}
//         >
//           <Typography sx={{ fontWeight: 700, fontSize: 16 }}>
//             {fullNum || 'Peržiūra'}
//           </Typography>

//           <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
//             <Button
//               size="small"
//               startIcon={<PrintIcon />}
//               onClick={handlePrint}
//               variant="outlined"
//               disabled={!invoice}
//             >
//               Spausdinti
//             </Button>

//             <Button
//               size="small"
//               startIcon={pdfLoading ? <CircularProgress size={16} /> : <DownloadIcon />}
//               onClick={handleDownloadPdf}
//               variant="contained"
//               disabled={pdfLoading || !invoice}
//             >
//               Parsisiųsti PDF
//             </Button>

//             <IconButton onClick={onClose} size="small">
//               <CloseIcon />
//             </IconButton>
//           </Box>
//         </Box>

//         <DialogContent
//           sx={{
//             p: 3,
//             backgroundColor: '#e0e0e0',
//             display: 'flex',
//             justifyContent: 'center',
//             overflow: 'auto',
//           }}
//         >
//           {loading && (
//             <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
//               <CircularProgress />
//             </Box>
//           )}

//           {error && (
//             <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
//               <Typography color="error">{error}</Typography>
//             </Box>
//           )}

//           {invoice && !loading && (
//             <Box
//               sx={{
//                 width: '100%',
//                 display: 'flex',
//                 justifyContent: 'center',
//                 alignItems: 'flex-start',
//                 py: 2,
//               }}
//             >
//               <Box
//                 sx={{
//                   width: 794,
//                   background: '#fff',
//                   boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
//                   borderRadius: 0.5,
//                 }}
//               >
//                 <InvoiceA4 ref={printRef} invoice={invoice} logoUrl={logoUrl} watermark={watermark} />
//               </Box>
//             </Box>
//           )}
//         </DialogContent>
//       </Dialog>

//       <Snackbar
//         open={snack.open}
//         autoHideDuration={4000}
//         onClose={() => setSnack((s) => ({ ...s, open: false }))}
//         anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
//       >
//         <Alert
//           severity={snack.severity}
//           variant="filled"
//           onClose={() => setSnack((s) => ({ ...s, open: false }))}
//         >
//           {snack.msg}
//         </Alert>
//       </Snackbar>
//     </>
//   );
// };

// // ═══════════════════════════════════════════════════════════
// // Standalone buttons
// // ═══════════════════════════════════════════════════════════

// const InvoicePreviewButton = ({
//   invoiceId,
//   invoiceData,
//   label = 'Peržiūra',
//   size = 'small',
//   variant = 'outlined',
//   iconOnly,
//   ...props
// }) => {
//   const [open, setOpen] = useState(false);

//   return (
//     <>
//       {iconOnly ? (
//         <IconButton size={size} onClick={() => setOpen(true)} {...props}>
//           <PreviewIcon fontSize="small" />
//         </IconButton>
//       ) : (
//         <Button
//           size={size}
//           variant={variant}
//           startIcon={<PreviewIcon />}
//           onClick={() => setOpen(true)}
//           {...props}
//         >
//           {label}
//         </Button>
//       )}

//       <InvoicePreviewDialog
//         open={open}
//         onClose={() => setOpen(false)}
//         invoiceId={invoiceId}
//         invoiceData={invoiceData}
//       />
//     </>
//   );
// };

// const InvoicePdfButton = ({ invoiceId, filename, size = 'small', variant = 'outlined', iconOnly, onError, ...props }) => {
//   const { downloadPdf, pdfLoading } = useInvoicePdf();

//   const handleClick = async () => {
//     try {
//       await downloadPdf(invoiceId, filename);
//     } catch {
//       onError?.('Nepavyko atsisiųsti PDF');
//     }
//   };

//   return iconOnly ? (
//     <IconButton size={size} onClick={handleClick} disabled={pdfLoading} {...props}>
//       {pdfLoading ? <CircularProgress size={16} /> : <PdfIcon fontSize="small" />}
//     </IconButton>
//   ) : (
//     <Button
//       size={size}
//       variant={variant}
//       startIcon={pdfLoading ? <CircularProgress size={16} /> : <PdfIcon />}
//       onClick={handleClick}
//       disabled={pdfLoading}
//       {...props}
//     >
//       PDF
//     </Button>
//   );
// };

// export {
//   InvoiceA4,
//   InvoicePreviewDialog,
//   InvoicePreviewButton,
//   InvoicePdfButton,
//   useInvoicePdf,
// };

// export default InvoicePreviewDialog;

