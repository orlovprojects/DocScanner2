import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  Button,
  Typography,
  Box,
  CircularProgress,
  IconButton,
  Tooltip,
  LinearProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { invoicingApi } from '../api/invoicingApi';

// ════════════════════════════════════════════
// Config
// ════════════════════════════════════════════

const REASON_LABELS = {
  invoice_number_in_purpose: 'Sąskaitos Nr. rastas paskirtyje',
  amount_exact_remaining:    'Suma sutampa su likučiu',
  amount_exact_total:        'Suma tiksliai sutampa',
  amount_close_remaining:    'Suma artima likučiui',
  amount_close_total:        'Suma artima bendrai sumai',
  counterparty_code_match:   'Įmonės kodas sutampa',
  counterparty_name_exact:   'Mokėtojo pavadinimas sutampa',
  counterparty_name_partial: 'Mokėtojo pavadinimas panašus',
  partial_payment:           'Dalinė įmoka',
  multi_invoice:             'Vienas mokėjimas kelioms sąskaitoms',
  manual:                    'Rankinis pažymėjimas',
  manual_match:              'Rankiniu būdu susieta',
};

// Keys in match_reasons to skip when rendering criteria tags
const SKIP_REASON_KEYS = new Set([
  'method', 'provider', 'provider_payment_id',
  'Apmokėta pagal išankstinę sąskaitą',
]);

const fmtDate = (d) => {
  if (!d) return '—';
  const parts = String(d).split('-');
  if (parts.length === 3) return `${parts[0]}-${parts[1]}-${parts[2]}`;
  return d;
};

const fmtAmount = (val) => {
  if (val == null) return '—';
  const n = parseFloat(val);
  return `${Math.abs(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`;
};

const sourceLabel = (alloc) => {
  if (alloc.source === 'payment_link') {
    const provider = alloc.match_reasons?.provider || alloc.provider_name || '';
    const name = provider.charAt(0).toUpperCase() + provider.slice(1);
    return name ? `Mokėjimo nuoroda · ${name}` : 'Mokėjimo nuoroda';
  }
  if (alloc.source === 'bank_import') return 'Banko išrašas';
  if (alloc.source === 'manual') return 'Rankinis pažymėjimas';
  if (alloc.source === 'api') return 'API';
  return alloc.source || '—';
};

const payerName = (alloc) => {
  const txn = alloc.transaction;
  if (txn?.counterparty_name) {
    return txn.counterparty_code
      ? `${txn.counterparty_name} (${txn.counterparty_code})`
      : txn.counterparty_name;
  }
  return '';
};

const getIsankstineNumber = (allocations) => {
  for (const a of allocations) {
    const nr = a.match_reasons?.['Apmokėta pagal išankstinę sąskaitą'];
    if (nr) return nr;
  }
  return null;
};

// ════════════════════════════════════════════
// Main Dialog
// ════════════════════════════════════════════

const PaymentProofDialog = ({
  open,
  onClose,
  invoiceId,
  onConfirmAllocation,
  onRejectAllocation,
  onRemoveManualPayment,
  onRefresh,
}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const loadData = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    try {
      const res = await invoicingApi.getInvoicePayments(invoiceId);
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    if (open && invoiceId) loadData();
    else setData(null);
  }, [open, invoiceId, loadData]);

  const withAction = async (allocId, fn) => {
    setActionLoading(allocId);
    try {
      await fn(allocId);
      await loadData();
      onRefresh?.();
    } finally {
      setActionLoading(null);
    }
  };

  const invoiceTotal = data ? parseFloat(data.invoice_total) : 0;
  const paidAmount = data ? parseFloat(data.paid_amount) : 0;
  const remaining = data ? parseFloat(data.remaining) : 0;
  const paidPct = invoiceTotal > 0 ? Math.min((paidAmount / invoiceTotal) * 100, 100) : 0;
  const isFullyPaid = remaining < 0.01 && paidAmount > 0;
  const isPartiallyPaid = paidAmount > 0 && !isFullyPaid;
  const isankstineNr = data ? getIsankstineNumber(data.allocations) : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      disableScrollLock
      PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2.5,
          py: 1.75,
          borderBottom: '1px solid #E5E7EB',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
            Mokėjimo informacija
          </Typography>
          {data && (
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#6B7280' }}>
              {data.invoice_number}
            </Typography>
          )}
        </Box>
        <IconButton
          size="small"
          onClick={onClose}
          sx={{ color: '#9CA3AF', '&:hover': { backgroundColor: '#F3F4F6', color: '#374151' } }}
        >
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>

      <DialogContent sx={{ px: 2.5, py: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={32} />
          </Box>
        ) : !data ? (
          <Typography sx={{ py: 2, textAlign: 'center', fontSize: 14, color: '#9CA3AF' }}>
            Nepavyko įkelti mokėjimo informacijos
          </Typography>
        ) : (
          <Box>
            {/* ── Summary ── */}
            <Box
              sx={{
                p: 2,
                borderRadius: 2.5,
                backgroundColor: isFullyPaid ? '#F0FDF4' : '#F9FAFB',
                border: `1px solid ${isFullyPaid ? '#BBF7D0' : '#E5E7EB'}`,
                mb: 2,
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1.25 }}>
                <Box>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', mb: 0.25 }}>
                    Sąskaitos suma
                  </Typography>
                  <Typography sx={{ fontSize: 22, fontWeight: 700, color: '#111827', lineHeight: 1 }}>
                    {fmtAmount(invoiceTotal)}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                    <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', mb: 0.25 }}>
                    {isFullyPaid ? 'Apmokėta' : isPartiallyPaid ? 'Dalinai apmokėta' : 'Apmokėta'}
                    </Typography>
                  <Typography
                    sx={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: isFullyPaid ? '#16A34A' : paidAmount > 0 ? '#D97706' : '#9CA3AF',
                      lineHeight: 1,
                    }}
                  >
                    {fmtAmount(paidAmount)}
                  </Typography>
                </Box>
              </Box>

              <LinearProgress
                variant="determinate"
                value={paidPct}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: isFullyPaid ? '#BBF7D0' : '#E5E7EB',
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 3,
                    backgroundColor: isFullyPaid ? '#16A34A' : paidAmount > 0 ? '#F59E0B' : '#D1D5DB',
                  },
                }}
              />

              {remaining > 0.01 && (
                <Typography sx={{ fontSize: 12, color: '#6B7280', mt: 0.75, textAlign: 'right' }}>
                  Likutis: <strong>{fmtAmount(remaining)}</strong>
                </Typography>
              )}
            </Box>

            {/* ── Išankstinė source note ── */}
            {isankstineNr && (
            <Box
                sx={{
                px: 2,
                py: 1.25,
                mb: 2,
                borderRadius: 2,
                backgroundColor: '#EFF6FF',
                border: '1px solid #BFDBFE',
                }}
            >
                <Typography sx={{ fontSize: 13, color: '#1E40AF' }}>
                Apmokėta pagal išankstinę sąskaitą faktūrą{' '}
                <strong>{isankstineNr.replace(/([A-Za-z]+)(\d)/, '$1-$2')}</strong>
                </Typography>
            </Box>
            )}

            {/* ── Allocations table ── */}
            {data.allocations.length === 0 ? (
              <Typography sx={{ py: 3, textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>
                Mokėjimų dar nėra
              </Typography>
            ) : (
              <Box>
                {/* Table header */}
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 90px 90px 28px',
                    gap: 1,
                    px: 1.5,
                    pb: 0.75,
                    borderBottom: '1.5px solid #E5E7EB',
                  }}
                >
                  {['Šaltinis', 'Suma', 'Apmokėjimo data', ''].map((h) => (
                    <Typography key={h} sx={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF' }}>
                      {h}
                    </Typography>
                  ))}
                </Box>

                {/* Rows */}
                {data.allocations.map((alloc) => (
                  <AllocationRow
                    key={alloc.id}
                    alloc={alloc}
                    actionLoading={actionLoading}
                    onConfirm={(id) => withAction(id, onConfirmAllocation)}
                    onReject={(id) => withAction(id, onRejectAllocation)}
                    onRemoveManual={(id) => withAction(id, onRemoveManualPayment)}
                  />
                ))}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ════════════════════════════════════════════
// Allocation Row
// ════════════════════════════════════════════

const AllocationRow = ({ alloc, actionLoading, onConfirm, onReject, onRemoveManual }) => {
  const isManual = alloc.source === 'manual';
  const isProposed = alloc.status === 'proposed';
  const isBankImport = alloc.source === 'bank_import';
  const isLoading = actionLoading === alloc.id;
  const txn = alloc.transaction;
  const payer = payerName(alloc);

  const matchReasons = alloc.match_reasons || {};
  const reasonEntries = Object.entries(matchReasons).filter(
    ([k, v]) => v !== false && !SKIP_REASON_KEYS.has(k)
  );
  const hasMatchReasons = isBankImport && reasonEntries.length > 0;
  const hasDetails = isBankImport && (txn || hasMatchReasons);

  return (
    <Box sx={{ borderBottom: '1px solid #F3F4F6', '&:last-child': { borderBottom: 'none' } }}>
      {/* Main row */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr 90px 90px 28px',
          gap: 1,
          px: 1.5,
          py: 1.25,
          alignItems: 'center',
          backgroundColor: isProposed ? '#FFFBEB' : 'transparent',
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>
            {sourceLabel(alloc)}
          </Typography>
          {payer && (
            <Typography sx={{ fontSize: 11.5, color: '#6B7280', lineHeight: 1.3, mt: 0.15 }}>
              {payer}
            </Typography>
          )}
        </Box>

        <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
          {fmtAmount(alloc.amount)}
        </Typography>

        <Typography sx={{ fontSize: 12.5, color: '#6B7280' }}>
          {fmtDate(alloc.payment_date)}
        </Typography>

        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          {isLoading ? (
            <CircularProgress size={16} />
          ) : isManual ? (
            <Tooltip title="Pašalinti" arrow>
              <IconButton
                size="small"
                onClick={() => onRemoveManual(alloc.id)}
                sx={{
                  p: 0.25,
                  color: '#D1D5DB',
                  '&:hover': { color: '#DC2626', backgroundColor: '#FEF2F2' },
                }}
              >
                <DeleteOutlineIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          ) : null}
        </Box>
      </Box>

      {/* Bank import details — inline */}
      {hasDetails && (
        <Box sx={{ px: 1.5, pb: 1.25 }}>
          <Box
            sx={{
              backgroundColor: '#F9FAFB',
              border: '1px solid #F3F4F6',
              borderRadius: 2,
              px: 1.5,
              py: 1,
            }}
          >
            {txn?.counterparty_account && (
              <DetailLine label="Sąskaita" value={txn.counterparty_account} mono />
            )}
            {txn?.payment_purpose && (
              <DetailLine label="Paskirtis" value={txn.payment_purpose} />
            )}
            {txn?.bank_name && (
              <DetailLine
                label="Šaltinis"
                value={`${txn.bank_name}${txn.bank_period ? ` · ${txn.bank_period}` : ''}`}
              />
            )}

            {hasMatchReasons && (
              <Box sx={{ mt: 0.75, pt: 0.75, borderTop: '1px solid #E5E7EB' }}>
                <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: '#9CA3AF', mb: 0.25 }}>
                  Atpažinimo kriterijai
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {reasonEntries.map(([key]) => {
                    const label = REASON_LABELS[key] || key;
                    return (
                      <Typography
                        key={key}
                        sx={{
                          fontSize: 11,
                          color: '#6B7280',
                          backgroundColor: '#F3F4F6',
                          borderRadius: 1,
                          px: 0.75,
                          py: 0.15,
                        }}
                      >
                        <span style={{ color: '#22C55E', marginRight: 3 }}>✓</span>
                        {label}
                      </Typography>
                    );
                  })}
                </Box>

                {alloc.confidence != null && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5 }}>
                    <Typography sx={{ fontSize: 10.5, color: '#9CA3AF' }}>Patikimumas</Typography>
                    <Box sx={{ width: 60 }}>
                      <LinearProgress
                        variant="determinate"
                        value={Math.round(parseFloat(alloc.confidence) * 100)}
                        color={parseFloat(alloc.confidence) >= 0.85 ? 'success' : 'warning'}
                        sx={{ height: 3.5, borderRadius: 2 }}
                      />
                    </Box>
                    <Typography
                      sx={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: parseFloat(alloc.confidence) >= 0.85 ? '#16A34A' : '#D97706',
                      }}
                    >
                      {Math.round(parseFloat(alloc.confidence) * 100)}%
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Manual note */}
      {isManual && alloc.note && (
        <Box sx={{ px: 1.5, pb: 1 }}>
          <Typography sx={{ fontSize: 11.5, color: '#6B7280', fontStyle: 'italic' }}>
            {alloc.note}
          </Typography>
        </Box>
      )}

      {/* Proposed actions */}
      {isProposed && !isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.75, px: 1.5, pb: 1.25 }}>
          <Button
            size="small"
            startIcon={<CancelIcon sx={{ fontSize: 15 }} />}
            onClick={() => onReject(alloc.id)}
            sx={{
              fontSize: 12,
              color: '#6B7280',
              textTransform: 'none',
              fontWeight: 600,
              px: 1.5,
              '&:hover': { color: '#DC2626', backgroundColor: '#FEF2F2' },
            }}
          >
            Atmesti
          </Button>
          <Button
            size="small"
            variant="contained"
            disableElevation
            startIcon={<CheckCircleIcon sx={{ fontSize: 15 }} />}
            onClick={() => onConfirm(alloc.id)}
            sx={{
              fontSize: 12,
              textTransform: 'none',
              fontWeight: 600,
              backgroundColor: '#16A34A',
              borderRadius: 2,
              px: 1.5,
              '&:hover': { backgroundColor: '#15803D' },
            }}
          >
            Patvirtinti
          </Button>
        </Box>
      )}
    </Box>
  );
};

// ════════════════════════════════════════════
// Detail line helper
// ════════════════════════════════════════════

const DetailLine = ({ label, value, mono = false }) => {
  if (!value) return null;
  return (
    <Box sx={{ display: 'flex', gap: 1, py: 0.2, alignItems: 'flex-start' }}>
      <Typography sx={{ fontSize: 11, color: '#9CA3AF', minWidth: 65, flexShrink: 0, lineHeight: 1.5 }}>
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: 11.5,
          color: '#374151',
          fontFamily: mono ? '"SF Mono", "Roboto Mono", monospace' : 'inherit',
          lineHeight: 1.5,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
};

export default PaymentProofDialog;



// import { useState, useEffect, useCallback } from 'react';
// import {
//   Dialog,
//   DialogTitle,
//   DialogContent,
//   DialogActions,
//   Button,
//   Typography,
//   Box,
//   Chip,
//   CircularProgress,
//   IconButton,
//   Tooltip,
//   LinearProgress,
// } from '@mui/material';
// import CheckCircleIcon from '@mui/icons-material/CheckCircle';
// import CancelIcon from '@mui/icons-material/Cancel';
// import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
// import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
// import TouchAppIcon from '@mui/icons-material/TouchApp';
// import LinkIcon from '@mui/icons-material/Link';
// import { invoicingApi } from '../api/invoicingApi';

// const SOURCE_CONFIG = {
//   bank_import:  { label: 'Banko išrašas',        icon: AccountBalanceIcon, color: '#1565c0' },
//   manual:       { label: 'Rankinis pažymėjimas',  icon: TouchAppIcon,      color: '#6a1b9a' },
//   payment_link: { label: 'Mokėjimo nuoroda',      icon: LinkIcon,          color: '#2e7d32' },
//   api:          { label: 'API',                    icon: LinkIcon,          color: '#455a64' },
// };

// const STATUS_CONFIG = {
//   auto:      { label: 'Automatinis',         color: 'success' },
//   confirmed: { label: 'Patvirtintas',        color: 'success' },
//   proposed:  { label: 'Laukia patvirtinimo', color: 'warning' },
//   manual:    { label: 'Rankinis',            color: 'info' },
// };

// const REASON_LABELS = {
//   invoice_number_in_purpose: 'Sąskaitos numeris rastas mokėjimo paskirtyje',
//   amount_exact_remaining:    'Suma tiksliai sutampa su likučiu',
//   amount_exact_total:        'Suma tiksliai sutampa',
//   amount_close_remaining:    'Suma artima likučiui',
//   amount_close_total:        'Suma artima bendrai sumai',
//   counterparty_code_match:   'Įmonės kodas sutampa',
//   counterparty_name_exact:   'Mokėtojo pavadinimas sutampa',
//   counterparty_name_partial: 'Mokėtojo pavadinimas panašus',
//   partial_payment:           'Dalinė įmoka',
//   multi_invoice:             'Vienas mokėjimas kelioms sąskaitoms',
//   manual:                    'Rankinis pažymėjimas',
//   manual_match:              'Rankiniu būdu susieta',
// };

// const OPERATION_LABELS = {
//   K:  'Bankinis pavedimas',
//   MK: 'Memorialinis',
//   TT: 'Tarptautinis pavedimas',
//   M:  'Mokestis',
// };

// const fmtDate = (d) => {
//   if (!d) return '—';
//   const parts = String(d).split('-');
//   if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
//   return d;
// };

// const fmtAmount = (val) => {
//   if (val == null) return '—';
//   return `${parseFloat(val).toFixed(2).replace('.', ',')} €`;
// };

// // ════════════════════════════════════════════

// const PaymentProofDialog = ({
//   open,
//   onClose,
//   invoiceId,
//   onConfirmAllocation,
//   onRejectAllocation,
//   onRemoveManualPayment,
//   onRefresh,
// }) => {
//   const [data, setData] = useState(null);
//   const [loading, setLoading] = useState(false);
//   const [actionLoading, setActionLoading] = useState(null);

//   const loadData = useCallback(async () => {
//     if (!invoiceId) return;
//     setLoading(true);
//     try {
//       const res = await invoicingApi.getInvoicePayments(invoiceId);
//       setData(res.data);
//     } catch {
//       setData(null);
//     } finally {
//       setLoading(false);
//     }
//   }, [invoiceId]);

//   useEffect(() => {
//     if (open && invoiceId) loadData();
//     else setData(null);
//   }, [open, invoiceId, loadData]);

//   const handleConfirm = async (allocId) => {
//     setActionLoading(allocId);
//     try {
//       await onConfirmAllocation(allocId);
//       await loadData();
//       onRefresh?.();
//     } finally {
//       setActionLoading(null);
//     }
//   };

//   const handleReject = async (allocId) => {
//     setActionLoading(allocId);
//     try {
//       await onRejectAllocation(allocId);
//       await loadData();
//       onRefresh?.();
//     } finally {
//       setActionLoading(null);
//     }
//   };

//   const handleRemoveManual = async (allocId) => {
//     setActionLoading(allocId);
//     try {
//       await onRemoveManualPayment(allocId);
//       await loadData();
//       onRefresh?.();
//     } finally {
//       setActionLoading(null);
//     }
//   };

//   const paidPct = data
//     ? Math.min((parseFloat(data.paid_amount) / parseFloat(data.invoice_total)) * 100, 100)
//     : 0;

//   return (
//     <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth disableScrollLock>
//       <DialogTitle sx={{ pb: 0.5 }}>Mokėjimo informacija</DialogTitle>

//       <DialogContent>
//         {loading ? (
//           <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
//             <CircularProgress />
//           </Box>
//         ) : !data ? (
//           <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
//             Nepavyko įkelti mokėjimo informacijos
//           </Typography>
//         ) : (
//           <Box>
//             {/* Summary */}
//             <Box sx={{ mb: 2.5 }}>
//               <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
//                 <Typography fontWeight={700} fontSize={15}>{data.invoice_number}</Typography>
//                 <Typography fontWeight={700} fontSize={18}>{fmtAmount(data.invoice_total)}</Typography>
//               </Box>

//               <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
//                 <Box sx={{ flex: 1 }}>
//                   <LinearProgress
//                     variant="determinate"
//                     value={paidPct}
//                     color={paidPct >= 99.9 ? 'success' : 'warning'}
//                     sx={{ height: 8, borderRadius: 4 }}
//                   />
//                 </Box>
//                 <Typography
//                   variant="body2"
//                   fontWeight={600}
//                   color={paidPct >= 99.9 ? 'success.main' : 'warning.main'}
//                 >
//                   {fmtAmount(data.paid_amount)}
//                 </Typography>
//               </Box>

//               {parseFloat(data.remaining) > 0.01 && (
//                 <Typography variant="caption" color="text.secondary">
//                   Likutis: {fmtAmount(data.remaining)}
//                 </Typography>
//               )}
//             </Box>

//             {/* Allocations */}
//             {data.allocations.length === 0 ? (
//               <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
//                 Mokėjimų nerasta
//               </Typography>
//             ) : (
//               data.allocations.map((alloc, idx) => (
//                 <AllocationCard
//                   key={alloc.id}
//                   alloc={alloc}
//                   isLast={idx === data.allocations.length - 1}
//                   actionLoading={actionLoading}
//                   onConfirm={handleConfirm}
//                   onReject={handleReject}
//                   onRemoveManual={handleRemoveManual}
//                 />
//               ))
//             )}
//           </Box>
//         )}
//       </DialogContent>

//       <DialogActions sx={{ px: 3, pb: 2 }}>
//         <Button onClick={onClose}>Uždaryti</Button>
//       </DialogActions>
//     </Dialog>
//   );
// };

// // ════════════════════════════════════════════

// const AllocationCard = ({ alloc, isLast, actionLoading, onConfirm, onReject, onRemoveManual }) => {
//   const srcCfg = SOURCE_CONFIG[alloc.source] || SOURCE_CONFIG.manual;
//   const stsCfg = STATUS_CONFIG[alloc.status] || STATUS_CONFIG.proposed;
//   const SrcIcon = srcCfg.icon;
//   const isProposed = alloc.status === 'proposed';
//   const isManual = alloc.source === 'manual';
//   const isLoading = actionLoading === alloc.id;

//   return (
//     <Box sx={{
//       p: 1.5,
//       borderRadius: 2,
//       border: isProposed ? '2px solid #ed6c02' : '1px solid #e0e0e0',
//       backgroundColor: isProposed ? '#fff8e1' : '#fafafa',
//       mb: isLast ? 0 : 1.5,
//     }}>
//       {/* Header */}
//       <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
//         <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
//           <SrcIcon sx={{ fontSize: 18, color: srcCfg.color }} />
//           <Typography variant="body2" fontWeight={600} sx={{ color: srcCfg.color }}>
//             {srcCfg.label}
//           </Typography>
//         </Box>
//         <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
//           <Chip
//             label={stsCfg.label}
//             color={stsCfg.color}
//             size="small"
//             variant="outlined"
//             sx={{ fontSize: 11, height: 22 }}
//           />
//           <Typography fontWeight={700} fontSize={15}>{fmtAmount(alloc.amount)}</Typography>
//         </Box>
//       </Box>

//       {/* Date */}
//       <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
//         📅 {fmtDate(alloc.payment_date)}
//       </Typography>

//       {/* Transaction details (bank import) */}
//       {alloc.transaction && (
//         <Box sx={{ mb: 1 }}>
//           <Typography variant="body2">
//             👤 {alloc.transaction.counterparty_name}
//             {alloc.transaction.counterparty_code && (
//               <Typography component="span" variant="body2" color="text.secondary">
//                 {' '}({alloc.transaction.counterparty_code})
//               </Typography>
//             )}
//           </Typography>

//           {alloc.transaction.counterparty_account && (
//             <Typography variant="body2" color="text.secondary" fontSize={12}>
//               🏦 {alloc.transaction.counterparty_account}
//             </Typography>
//           )}

//           {alloc.transaction.payment_purpose && (
//             <Typography
//               variant="body2" color="text.secondary" fontSize={12}
//               sx={{ mt: 0.25, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 60, overflow: 'hidden' }}
//             >
//               📝 {alloc.transaction.payment_purpose}
//             </Typography>
//           )}

//           {alloc.transaction.bank_operation_code && (
//             <Typography variant="caption" color="text.secondary">
//               💳 {OPERATION_LABELS[alloc.transaction.bank_operation_code] || alloc.transaction.bank_operation_code}
//             </Typography>
//           )}

//           {alloc.transaction.bank_name && (
//             <Typography variant="caption" color="text.secondary" display="block">
//               Šaltinis: {alloc.transaction.bank_name} {alloc.transaction.bank_period}
//             </Typography>
//           )}
//         </Box>
//       )}

//       {/* Manual note */}
//       {isManual && alloc.note && (
//         <Typography variant="body2" color="text.secondary" fontSize={12} sx={{ mb: 1 }}>
//           📝 {alloc.note}
//         </Typography>
//       )}

//       {/* Match reasons (bank import) */}
//       {alloc.source === 'bank_import' && alloc.match_reasons && Object.keys(alloc.match_reasons).length > 0 && (
//         <Box sx={{ mt: 1, pt: 1, borderTop: '1px dashed #e0e0e0' }}>
//           <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
//             Atitikimo kriterijai:
//           </Typography>
//           {Object.entries(alloc.match_reasons).map(([key, value]) => {
//             if (value === false) return null;
//             const label = REASON_LABELS[key] || key;
//             return (
//               <Typography key={key} variant="caption" color="text.secondary" display="block" sx={{ pl: 1 }}>
//                 ✓ {label}
//                 {typeof value === 'string' && value !== 'true' && ` (${value})`}
//               </Typography>
//             );
//           })}
//           <Typography
//             variant="caption" fontWeight={600}
//             sx={{
//               mt: 0.5, display: 'block',
//               color: parseFloat(alloc.confidence) >= 0.85 ? 'success.main' : 'warning.main',
//             }}
//           >
//             Patikimumas: {Math.round(parseFloat(alloc.confidence) * 100)}%
//           </Typography>
//         </Box>
//       )}

//       {/* Actions */}
//       {(isProposed || isManual) && (
//         <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5, mt: 1, pt: 1, borderTop: '1px solid #e0e0e0' }}>
//           {isLoading ? (
//             <CircularProgress size={20} />
//           ) : (
//             <>
//               {isProposed && (
//                 <>
//                   <Button
//                     size="small" color="error"
//                     startIcon={<CancelIcon />}
//                     onClick={() => onReject(alloc.id)}
//                     sx={{ fontSize: 12 }}
//                   >
//                     Atmesti
//                   </Button>
//                   <Button
//                     size="small" variant="contained" color="success"
//                     startIcon={<CheckCircleIcon />}
//                     onClick={() => onConfirm(alloc.id)}
//                     sx={{ fontSize: 12 }}
//                   >
//                     Patvirtinti
//                   </Button>
//                 </>
//               )}
//               {isManual && (
//                 <Tooltip title="Pašalinti rankinį pažymėjimą">
//                   <IconButton size="small" color="error" onClick={() => onRemoveManual(alloc.id)}>
//                     <DeleteOutlineIcon fontSize="small" />
//                   </IconButton>
//                 </Tooltip>
//               )}
//             </>
//           )}
//         </Box>
//       )}
//     </Box>
//   );
// };

// export default PaymentProofDialog;