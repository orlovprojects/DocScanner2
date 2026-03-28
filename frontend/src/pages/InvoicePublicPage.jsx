import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Paper,
  IconButton,
  Tooltip,
  Snackbar,
  Alert,
  Chip,
  Divider,
  Stack,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Print as PrintIcon,
  ContentCopy as CopyIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { invoicingApi } from '../api/invoicingApi';
import { InvoiceA4 } from '../components/InvoicePreview';

// Helpers

const fmtAmount = (val, currency = 'EUR') => {
  if (val == null) return '0,00';
  const n = parseFloat(val);
  const formatted = n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const symbols = { EUR: '€', USD: '$', GBP: '£', PLN: 'zł', CZK: 'Kč', CHF: 'CHF' };
  return `${formatted} ${symbols[currency] || currency}`;
};

const fmtFullNumber = (series, number) => {
  if (!series && !number) return '-';
  if (series && number) return `${series}-${number}`;
  return series || number || '-';
};

const STATUS_CONFIG = {
  issued: { label: 'Laukiama apmokėjimo', bg: '#FFF4E5', color: '#B45309', border: '#F6D7B8' },
  sent: { label: 'Laukiama apmokėjimo', bg: '#FFF4E5', color: '#B45309', border: '#F6D7B8' },
  partially_paid: { label: 'Dalinai apmokėta', bg: '#FEF3C7', color: '#92400E', border: '#F3D98A' },
  paid: { label: 'Apmokėta', bg: '#DCFCE7', color: '#166534', border: '#A7E3BC' },
  cancelled: { label: 'Atšaukta', bg: '#F3F4F6', color: '#4B5563', border: '#D1D5DB' },
};

const cardBorder = '1px solid #E5E7EB';
const softShadow = '0 8px 24px rgba(15, 23, 42, 0.06)';

// Copy button

const CopyButton = ({ text, size = 14 }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(String(text));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <Tooltip title={copied ? 'Nukopijuota!' : 'Kopijuoti'} arrow>
      <IconButton
        size="small"
        onClick={handleCopy}
        sx={{
          width: 24,
          height: 24,
          border: '1px solid #E5E7EB',
          borderRadius: 1.5,
          color: copied ? '#16A34A' : '#6B7280',
          backgroundColor: '#fff',
          p: 0,
          '&:hover': {
            backgroundColor: '#F9FAFB',
            borderColor: '#D1D5DB',
          },
        }}
      >
        {copied ? <CheckIcon sx={{ fontSize: size }} /> : <CopyIcon sx={{ fontSize: size }} />}
      </IconButton>
    </Tooltip>
  );
};

// UI blocks

const FieldRow = ({ label, value, copyable = false, mono = false }) => {
  if (!value) return null;

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '92px 1fr', sm: '120px 1fr' },
        alignItems: 'center',
        columnGap: 1.5,
        py: 0.85,
      }}
    >
      <Typography
        sx={{
          fontSize: 12,
          lineHeight: 1.2,
          color: '#6B7280',
          fontFamily: 'Roboto, sans-serif',
        }}
      >
        {label}
      </Typography>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          minWidth: 0,
          justifyContent: 'flex-start',
          gap: 1.25,
        }}
      >
        <Typography
          sx={{
            fontSize: 13,
            lineHeight: 1.25,
            fontWeight: 500,
            color: '#111827',
            fontFamily: mono ? 'Roboto, sans-serif' : 'Roboto, sans-serif',
            wordBreak: mono ? 'break-all' : 'break-word',
          }}
        >
          {value}
        </Typography>
        {copyable && <CopyButton text={value} size={14} />}
      </Box>
    </Box>
  );
};

const SmallMeta = ({ label, value, copyable = false }) => {
  if (!value) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        minWidth: 0,
      }}
    >
      <Typography
        sx={{
          fontSize: 12,
          color: '#6B7280',
          fontFamily: 'Roboto, sans-serif',
          whiteSpace: 'nowrap',
        }}
      >
        {label}:
      </Typography>

      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 500,
          color: '#111827',
          fontFamily: 'Roboto, sans-serif',
          minWidth: 0,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </Typography>

      {copyable && <CopyButton text={value} size={14} />}
    </Box>
  );
};

const InvoicePreviewWrapper = ({ children }) => {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.offsetWidth;
      const newScale = Math.min(1, containerWidth / 794);
      setScale(newScale);
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  return (
    <Box
      ref={containerRef}
      sx={{
        maxWidth: 920,
        mx: 'auto',
        px: { xs: 1, md: 3 },
        mt: 1,
        display: 'flex',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <Box sx={{
        transformOrigin: 'top center',
        transform: scale < 1 ? `scale(${scale})` : 'none',
        mb: scale < 1 ? `${-(1 - scale) * 1123}px` : 0,
      }}>
        {children}
      </Box>
    </Box>
  );
};

const InvoicePublicPage = () => {
  const { uuid } = useParams();
  const printRef = useRef(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [snack, setSnack] = useState({ open: false, msg: '' });

  useEffect(() => {
    if (!uuid) return;

    (async () => {
      setLoading(true);
      setError('');

      try {
        const { data } = await invoicingApi.getPublicInvoice(uuid);
        setInvoice(data);
      } catch (e) {
        setError(
          e.response?.status === 404
            ? 'Sąskaita nerasta arba nėra vieša.'
            : 'Nepavyko įkelti sąskaitos.'
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [uuid]);

  const handleDownloadPdf = async () => {
    if (!uuid) return;

    setPdfLoading(true);
    try {
      const response = await invoicingApi.getPublicInvoicePdf(uuid);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `saskaita-${invoice?.document_series || ''}-${invoice?.document_number || ''}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      setSnack({ open: true, msg: 'Nepavyko atsisiųsti PDF' });
    } finally {
      setPdfLoading(false);
    }
  };

    const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const win = window.open('', '_blank', 'width=900,height=1200');

    const printStyles = `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        @page { 
        size: A4; 
        margin: 0; /* Убирает browser headers/footers */
        }
        
        html, body {
        width: 210mm;
        height: 297mm;
        margin: 0;
        padding: 0;
        background: #fff;
        font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: 11px;
        color: #222;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        }

        @media print {
        html, body {
            width: 210mm;
            height: 297mm;
        }
        body {
            margin: 0 !important;
            padding: 0 !important;
        }
        }

        /* Layout */
        [class*="MuiBox-root"] { display: block; }
        
        /* Typography */
        [class*="MuiTypography-root"] { 
        margin: 0; 
        font-family: inherit;
        }
        
        /* Divider */
        [class*="MuiDivider-root"], hr {
        border: none;
        border-top: 1.2px solid #333;
        margin: 14px 0;
        }

        /* Table */
        table { 
        width: 100%; 
        border-collapse: collapse; 
        table-layout: fixed;
        }
        th, td { 
        padding: 5px 8px; 
        font-size: 10px; 
        text-align: left;
        vertical-align: top;
        border-bottom: 0.5px solid #e0e0e0;
        }
        th { 
        font-weight: 700; 
        font-size: 8.8px;
        color: #555;
        background: #f5f5f5;
        border-bottom: 1.2px solid #333;
        }
        tr:nth-child(even) { background: #fafafa; }

        /* Images */
        img { max-width: 100%; height: auto; }

        /* Links */
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
        'position', 'top', 'left', 'right', 'bottom',
        'opacity',
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
        if (clonedChildren[i]) {
            applyStyles(origChildren[i], clonedChildren[i]);
        }
        }
    };
    
    applyStyles(content, clone);

    win.document.write(`<!DOCTYPE html>
        <html>
        <head>
            <title>${invoice?.full_number || invoice?.document_series + invoice?.document_number || 'Sąskaita'}</title>
            <style>${printStyles}</style>
        </head>
        <body>${clone.outerHTML}</body>
        </html>`);
    win.document.close();

    const images = win.document.querySelectorAll('img');
    let loaded = 0;
    const total = images.length;

    const tryPrint = () => {
        loaded++;
        if (loaded >= total) {
        setTimeout(() => win.print(), 150);
        }
    };

    if (total === 0) {
        setTimeout(() => win.print(), 200);
    } else {
        images.forEach(img => {
        if (img.complete) {
            tryPrint();
        } else {
            img.onload = tryPrint;
            img.onerror = tryPrint;
        }
        });
    }
    };

  const isPaid = invoice?.status === 'paid';
  const isPartiallyPaid = invoice?.status === 'partially_paid';
  const isCancelled = invoice?.status === 'cancelled';
  const hasPaymentLink = invoice?.payment_link_url && !isPaid && !isCancelled;
  const showBankDetails = !hasPaymentLink && !isPaid && !isCancelled && invoice?.seller_iban;

  const statusCfg = STATUS_CONFIG[invoice?.status] || STATUS_CONFIG.issued;

  const totalAmount = parseFloat(invoice?.amount_with_vat || 0);
  const paidAmount = parseFloat(invoice?.paid_amount || 0);
  const remaining = Math.max(0, totalAmount - paidAmount);
  const displayAmount = isPartiallyPaid ? remaining : totalAmount;
  const fullNumber = invoice ? fmtFullNumber(invoice.document_series, invoice.document_number) : '';

  if (loading) {
    return (
      <Box sx={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={40} sx={{ color: '#111827' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
        <Box sx={{ textAlign: 'center', maxWidth: 420 }}>
          <Typography sx={{ fontSize: 56, fontWeight: 300, color: '#D1D5DB', mb: 1 }}>
            404
          </Typography>
          <Typography sx={{ fontSize: 18, fontWeight: 600, color: '#111827', mb: 1 }}>
            {error}
          </Typography>
          <Typography sx={{ fontSize: 14, color: '#6B7280' }}>
            Jei manote, kad tai klaida, susisiekite su sąskaitos siuntėju.
          </Typography>
        </Box>
      </Box>
    );
  }

  if (!invoice) return null;

  const invoiceForPreview = {
    ...invoice,
    payment_link_url: hasPaymentLink ? invoice.payment_link_url : '',
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background:
          'linear-gradient(180deg, #F8FAFC 0%, #F8FAFC 280px, #F3F4F6 100%)',
        pb: 6,
      }}
    >
      {/* Header */}
      <Box sx={{ borderBottom: '1px solid #E5E7EB', backgroundColor: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)' }}>
        <Box
          sx={{
            maxWidth: 920,
            mx: 'auto',
            px: { xs: 2, md: 3 },
            py: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.25 }}>
            <Typography
              sx={{
                fontSize: { xs: 18, md: 22 },
                fontWeight: 700,
                color: '#111827',
                letterSpacing: '-0.02em',
              }}
            >
              {fullNumber}
            </Typography>

            <Chip
            label={statusCfg.label}
            size="medium"
            sx={{
                backgroundColor: statusCfg.bg,
                color: statusCfg.color,
                fontWeight: 700,
                fontFamily: 'Roboto, sans-serif',
                borderRadius: '999px',
                border: `1px solid ${statusCfg.border}`,
                boxShadow: '0 1px 2px rgba(17, 24, 39, 0.05)',
                '& .MuiChip-label': {
                px: 1.5,
                },
            }}
            />
          </Box>
        </Box>
      </Box>

      <Box sx={{ maxWidth: 920, mx: 'auto', px: { xs: 2, md: 3 }, pt: 3 }}>
        {/* Hero block */}
        {!isCancelled && !isPaid && (
          <Paper
            elevation={0}
            sx={{
              p: { xs: 2.5, md: 3.5 },
              borderRadius: 4,
              border: cardBorder,
              boxShadow: softShadow,
              backgroundColor: '#FFFFFF',
              mb: 3,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                justifyContent: 'space-between',
                gap: 3,
                alignItems: { xs: 'stretch', md: 'center' },
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#6B7280', mb: 1 }}>
                  {isPartiallyPaid ? 'Liko apmokėti' : 'Mokėtina suma'}
                </Typography>

                <Typography
                  sx={{
                    fontSize: { xs: 34, md: 42 },
                    lineHeight: 1,
                    fontWeight: 800,
                    color: '#111827',
                    letterSpacing: '-0.03em',
                    mb: 1.25,
                  }}
                >
                  {fmtAmount(displayAmount, invoice.currency)}
                </Typography>

                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={{ xs: 1, sm: 2.5 }}
                  sx={{ color: '#4B5563' }}
                >
                  {invoice.due_date && (
                    <Typography sx={{ fontSize: 14 }}>
                      Apmokėti iki <strong>{invoice.due_date}</strong>
                    </Typography>
                  )}

                  {isPartiallyPaid && (
                    <Typography sx={{ fontSize: 14 }}>
                      Sumokėta {fmtAmount(paidAmount, invoice.currency)}
                    </Typography>
                  )}
                </Stack>
              </Box>

              {hasPaymentLink ? (
                <Button
                  variant="contained"
                  size="large"
                  href={invoice.payment_link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    alignSelf: { xs: 'stretch', md: 'center' },
                    minWidth: { md: 180 },
                    height: 52,
                    borderRadius: 3,
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: 16,
                    backgroundColor: '#2563EB',
                    boxShadow: 'none',
                    '&:hover': {
                      backgroundColor: '#1D4ED8',
                      boxShadow: 'none',
                    },
                  }}
                >
                  Apmokėti
                </Button>
              ) : (
                <Box
                  sx={{
                    px: 2,
                    py: 1.5,
                    borderRadius: 3,
                    backgroundColor: '#F9FAFB',
                    border: '1px solid #E5E7EB',
                    minWidth: { md: 220 },
                  }}
                >
                  <Typography sx={{ fontSize: 12, color: '#6B7280', mb: 0.4 }}>
                    Apmokėjimas bankiniu pavedimu
                  </Typography>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                    Rekvizitai pateikti žemiau
                  </Typography>
                </Box>
              )}
            </Box>
          </Paper>
        )}

        {/* Paid */}
        {isPaid && (
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 4,
              backgroundColor: '#F0FDF4',
              border: '1px solid #BBF7D0',
              boxShadow: softShadow,
              mb: 3,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                backgroundColor: '#22C55E',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <CheckIcon sx={{ color: '#fff', fontSize: 20 }} />
            </Box>

            <Box>
              <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#166534' }}>
                Ši sąskaita yra apmokėta
              </Typography>
            </Box>
          </Paper>
        )}

        {/* Cancelled */}
        {isCancelled && (
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 4,
              backgroundColor: '#FFFFFF',
              border: cardBorder,
              boxShadow: softShadow,
              mb: 3,
            }}
          >
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: '#6B7280', textAlign: 'center' }}>
              Ši sąskaita buvo atšaukta.
            </Typography>
          </Paper>
        )}

        {/* Bank details */}
        {showBankDetails && (
        <Paper
            elevation={0}
            sx={{
            borderRadius: 3,
            border: '1px solid #E5E7EB',
            boxShadow: '0 6px 18px rgba(15, 23, 42, 0.05)',
            backgroundColor: '#FFFFFF',
            mb: 3,
            overflow: 'hidden',
            }}
        >
            <Box
            sx={{
                px: { xs: 2, md: 2.5 },
                py: 1.5,
                borderBottom: '1px solid #EEF2F7',
            }}
            >
            <Typography
                sx={{
                fontSize: 15,
                fontWeight: 700,
                color: '#111827',
                fontFamily: 'Roboto, sans-serif',
                lineHeight: 1.2,
                }}
            >
                Mokėjimo rekvizitai
            </Typography>
            </Box>

            <Box sx={{ px: { xs: 2, md: 2.5 }, py: 0.25 }}>
            <FieldRow label="Gavėjas" value={invoice.seller_name} copyable />
            <Box sx={{ borderTop: '1px solid #F3F4F6' }} />
            <FieldRow label="IBAN" value={invoice.seller_iban} copyable />
            <Box sx={{ borderTop: '1px solid #F3F4F6' }} />
            <FieldRow label="Mokėjimo paskirtis" value={fullNumber} copyable />
            </Box>

            {(invoice.seller_bank_name || invoice.seller_swift) && (
            <Box
                sx={{
                px: { xs: 2, md: 2.5 },
                py: 1.1,
                borderTop: '1px solid #EEF2F7',
                backgroundColor: '#F3F4F6',
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                gap: { xs: 0.8, sm: 2 },
                flexWrap: 'wrap',
                }}
            >
                {invoice.seller_bank_name && (
                <SmallMeta label="Bankas" value={invoice.seller_bank_name} copyable />
                )}
                {invoice.seller_swift && (
                <SmallMeta label="SWIFT" value={invoice.seller_swift} copyable />
                )}
            </Box>
            )}
        </Paper>
        )}
      </Box>

        <Box
        sx={{
            maxWidth: 920,
            mx: 'auto',
            px: { xs: 2, md: 3 },
            mt: 1,
            mb: 1.5,
            display: 'flex',
            justifyContent: 'flex-end',
        }}
        >
        <Box
            sx={{
            display: 'flex',
            gap: 1,
            p: 0.75,
            borderRadius: 3,
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
            }}
        >
            <Button
            size="small"
            variant="outlined"
            startIcon={<PrintIcon sx={{ fontSize: 18 }} />}
            onClick={handlePrint}
            sx={{
                borderColor: '#D1D5DB',
                color: '#374151',
                textTransform: 'none',
                fontWeight: 600,
                fontFamily: 'Roboto, sans-serif',
                borderRadius: 2,
                px: 1.75,
                backgroundColor: '#FFFFFF',
                '&:hover': {
                borderColor: '#9CA3AF',
                backgroundColor: '#F9FAFB',
                },
            }}
            >
            Spausdinti
            </Button>

            <Button
            size="small"
            variant="outlined"
            startIcon={
                pdfLoading ? (
                <CircularProgress size={16} color="inherit" />
                ) : (
                <DownloadIcon sx={{ fontSize: 18 }} />
                )
            }
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            sx={{
                borderColor: '#D1D5DB',
                color: '#111827',
                textTransform: 'none',
                fontWeight: 600,
                fontFamily: 'Roboto, sans-serif',
                borderRadius: 2,
                px: 1.75,
                backgroundColor: '#FFFFFF',
                boxShadow: 'none',
                '&:hover': {
                borderColor: '#9CA3AF',
                backgroundColor: '#F9FAFB',
                boxShadow: 'none',
                },
                '&.Mui-disabled': {
                borderColor: '#E5E7EB',
                color: '#9CA3AF',
                backgroundColor: '#FFFFFF',
                },
            }}
            >
            Atsisiųsti PDF
            </Button>
        </Box>
        </Box>

      <InvoicePreviewWrapper>
        <Box
          sx={{
            width: 794,
            backgroundColor: '#fff',
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
            borderRadius: 2,
            overflow: 'hidden',
            border: '1px solid #E5E7EB',
          }}
        >
          <InvoiceA4 ref={printRef} invoice={invoiceForPreview} logoUrl={invoice.logo_url} watermark={invoice.show_watermark} />
        </Box>
      </InvoicePreviewWrapper>

      {/* Footer */}
      <Box sx={{ textAlign: 'center', mt: 5, px: 2 }}>
        <Typography sx={{ fontSize: 12, color: '#9CA3AF' }}>
          Ši sąskaita sugeneruota naudojant{' '}
          <a
            href="https://atlyginimoskaiciuokle.com/saskaitu-israsymas"
            style={{ color: '#404040', textDecoration: 'none', fontWeight: 500 }}
          >
            DokSkenas
          </a>{' '}
          sąskaitų išrašymo platformą
        </Typography>
      </Box>

      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack({ open: false, msg: '' })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="error"
          variant="filled"
          onClose={() => setSnack({ open: false, msg: '' })}
        >
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default InvoicePublicPage;