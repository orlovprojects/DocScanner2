import { Fragment, useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Button, Chip, TextField, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Collapse, IconButton, Tooltip, Snackbar, Alert,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Refresh as RefreshIcon,
  BugReport as BugReportIcon,
} from '@mui/icons-material';
import { invoicingApi } from '../api/invoicingApi';

const fmtD = (d) => {
  if (!d) return '—';
  const p = String(d).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
};

const scoreColor = (score) => {
  const n = Number(score || 0);
  if (n >= 85) return 'success';
  if (n >= 60) return 'warning';
  return 'default';
};

const isMatchedStatus = (status) => {
  return status && status !== 'unmatched' && status !== 'error';
};

const asNum = (v) => {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
};

const BankMatchingDebugPage = () => {
  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'success' });
  const show = (msg, sev = 'success') => setSnack({ open: true, msg, sev });

  const [statements, setStatements] = useState([]);
  const [statementId, setStatementId] = useState('');
  const [onlyUnmatched, setOnlyUnmatched] = useState('true');

  const [statementsLoading, setStatementsLoading] = useState(true);
  const [debugLoading, setDebugLoading] = useState(false);
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState({});

  const loadStatements = async () => {
    setStatementsLoading(true);

    try {
      const { data } = await invoicingApi.getBankStatements({ limit: 100, offset: 0 });
      const rows = data.results || data || [];
      const processed = rows.filter(s => s.status === 'processed');

      setStatements(processed);

      if (!statementId && processed.length) {
        setStatementId(String(processed[0].id));
      }
    } catch {
      show('Nepavyko įkelti banko išrašų', 'error');
    } finally {
      setStatementsLoading(false);
    }
  };

  const loadDebug = async () => {
    if (!statementId) return;

    setDebugLoading(true);

    try {
      const { data } = await invoicingApi.getBankMatchingDebug({
        statement_id: statementId,
        only_unmatched: onlyUnmatched,
        top: 8,
      });

      setData(data);
      setExpanded({});
    } catch (e) {
      show(e.response?.data?.detail || 'Nepavyko įkelti diagnostikos', 'error');
    } finally {
      setDebugLoading(false);
    }
  };

  useEffect(() => {
    loadStatements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (statementId) loadDebug();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statementId, onlyUnmatched]);

  const copyJson = async () => {
    if (!data) return;

    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      show('JSON nukopijuotas');
    } catch {
      show('Nepavyko nukopijuoti JSON', 'error');
    }
  };

  const summary = data?.summary || {};

  const summaryValues = {
    transactions: summary.transactions ?? 0,

    actualAuto: summary.actual_auto_matched ?? summary.with_auto_candidate ?? 0,
    actualLikely: summary.actual_likely_matched ?? summary.with_proposed_candidate ?? 0,
    actualUnmatched: summary.actual_unmatched ?? summary.without_candidate ?? 0,

    signalAuto: summary.signal_auto_matched ?? 0,
    signalLikely: summary.signal_likely_matched ?? 0,
    signalUnmatched: summary.signal_unmatched ?? 0,
    signalSkipped: summary.signal_skipped ?? 0,
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1550, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: 2,
            bgcolor: '#EEF4FF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <BugReportIcon sx={{ color: '#1976d2' }} />
        </Box>

        <Box>
          <Typography variant="h1" sx={{ fontSize: 24, fontWeight: 600, color: '#1976d2' }}>
            Banko susiejimo diagnostika
          </Typography>
          <Typography variant="body2" color="text.secondary">
            DB match rodo realų susiejimą po pakartotinio susiejimo. Signal dry-run rodo, ką naujas signalų engine rastų dabar.
          </Typography>
        </Box>
      </Box>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            select
            size="small"
            label="Banko išrašas"
            value={statementId}
            onChange={(e) => setStatementId(e.target.value)}
            sx={{ minWidth: { xs: '100%', md: 420 } }}
            SelectProps={{
              displayEmpty: true,
              MenuProps: { disableScrollLock: true },
            }}
            InputLabelProps={{ shrink: true }}
            disabled={statementsLoading}
          >
            {statements.length === 0 && (
              <MenuItem value="">
                Nėra apdorotų išrašų
              </MenuItem>
            )}

            {statements.map(s => (
              <MenuItem key={s.id} value={String(s.id)}>
                #{s.id} · {s.bank_display || s.bank_name} · {fmtD(s.period_from)} – {fmtD(s.period_to)} · {s.original_filename}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            label="Rodyti"
            value={onlyUnmatched}
            onChange={(e) => setOnlyUnmatched(e.target.value)}
            sx={{ width: { xs: '100%', md: 300 } }}
            SelectProps={{ MenuProps: { disableScrollLock: true } }}
            InputLabelProps={{ shrink: true }}
          >
            <MenuItem value="true">Be rankiniu būdu patvirtintų</MenuItem>
            <MenuItem value="false">Visas operacijas</MenuItem>
          </TextField>

          <Button
            variant="outlined"
            startIcon={debugLoading ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={loadDebug}
            disabled={!statementId || debugLoading}
          >
            Atnaujinti
          </Button>

          <Button
            variant="contained"
            startIcon={<CopyIcon />}
            onClick={copyJson}
            disabled={!data}
          >
            Kopijuoti JSON
          </Button>
        </Box>

        {data?.summary && (
          <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
            <Chip label={`Operacijos: ${summaryValues.transactions}`} size="small" />

            <Chip
              label={`DB auto: ${summaryValues.actualAuto}`}
              color="success"
              size="small"
              variant="outlined"
            />

            <Chip
              label={`DB laukia: ${summaryValues.actualLikely}`}
              color="warning"
              size="small"
              variant="outlined"
            />

            <Chip
              label={`DB unmatched: ${summaryValues.actualUnmatched}`}
              size="small"
              variant="outlined"
            />

            <Chip
              label={`Signal auto: ${summaryValues.signalAuto}`}
              color="success"
              size="small"
            />

            <Chip
              label={`Signal proposed: ${summaryValues.signalLikely}`}
              color="warning"
              size="small"
            />

            <Chip
              label={`Signal unmatched: ${summaryValues.signalUnmatched}`}
              size="small"
              variant="outlined"
            />

            <Chip
              label={`Signal skipped: ${summaryValues.signalSkipped}`}
              size="small"
            />
          </Box>
        )}
      </Paper>

      {statementsLoading || debugLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress />
        </Box>
      ) : !data ? (
        <Paper sx={{ p: 5, textAlign: 'center', borderRadius: 3 }}>
          <Typography color="text.secondary">
            Pasirinkite banko išrašą diagnostikai.
          </Typography>
        </Paper>
      ) : data.items.length === 0 ? (
        <Paper sx={{ p: 5, textAlign: 'center', borderRadius: 3 }}>
          <Typography color="text.secondary">
            Nėra operacijų pagal pasirinktą filtrą.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, bgcolor: '#f5f5f5' } }}>
                <TableCell>Operacija</TableCell>
                <TableCell>Kontrahentas / paskirtis</TableCell>
                <TableCell>Susiejimas</TableCell>
                <TableCell align="center">Score</TableCell>
                <TableCell>Signalai</TableCell>
                <TableCell align="center">Detalės</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {data.items.map((item) => {
                const tx = item.transaction || {};
                const actual = item.actual_match || {};
                const signal = item.signal_match || {};
                const oldBest = item.best_candidate || null;

                const actualMatched = isMatchedStatus(actual.status);
                const signalMatched = isMatchedStatus(signal.status);

                const fallbackDisplay = oldBest
                  ? {
                      status: oldBest.decision || 'unmatched',
                      confidence_pct: oldBest.score || 0,
                      matched_document_number: oldBest.full_number || '',
                      purchase: oldBest,
                      signals: {},
                    }
                  : {
                      status: tx.match_status || 'unmatched',
                      confidence_pct: asNum(tx.match_confidence) <= 1
                        ? Math.round(asNum(tx.match_confidence) * 100)
                        : asNum(tx.match_confidence),
                      matched_document_number: tx.matched_document_number || '',
                      purchase: null,
                      signals: {},
                    };

                const display = actualMatched
                  ? actual
                  : signalMatched
                    ? signal
                    : fallbackDisplay;

                const purchase = display.purchase;
                const signals = display.signals || {};
                const isOpen = !!expanded[tx.id];

                return (
                  <Fragment key={tx.id}>
                    <TableRow hover>
                      <TableCell>
                        <Typography fontSize={13} fontWeight={700}>
                          {fmtD(tx.transaction_date)} · {tx.amount} {tx.currency}
                        </Typography>

                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          #{tx.id} · {tx.match_status || 'unmatched'}
                        </Typography>

                        {!!tx.transaction_category && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            kategorija: {tx.transaction_category}
                          </Typography>
                        )}
                      </TableCell>

                      <TableCell sx={{ maxWidth: 420 }}>
                        <Typography fontSize={13} fontWeight={600}>
                          {tx.counterparty_name || '—'}
                        </Typography>

                        <Tooltip title={tx.payment_purpose || ''}>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              display: 'block',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: 400,
                            }}
                          >
                            {tx.payment_purpose || '—'}
                          </Typography>
                        </Tooltip>
                      </TableCell>

                      <TableCell sx={{ minWidth: 230 }}>
                        {purchase ? (
                          <>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.3, flexWrap: 'wrap' }}>
                              <Typography fontSize={13} fontWeight={700}>
                                {purchase.full_number || 'Be numerio'}
                              </Typography>

                              <Chip
                                size="small"
                                variant="outlined"
                                color={actualMatched ? 'success' : 'warning'}
                                label={actualMatched ? 'DB' : 'dry-run'}
                                sx={{ height: 20, fontSize: 11 }}
                              />
                            </Box>

                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              {purchase.seller_name || '—'}
                            </Typography>

                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              {purchase.amount_with_vat || purchase.amount || '0'} {purchase.currency || tx.currency}
                            </Typography>
                          </>
                        ) : display.matched_document_number ? (
                          <>
                            <Typography fontSize={13} fontWeight={700}>
                              {display.matched_document_number}
                            </Typography>

                            <Chip
                              size="small"
                              variant="outlined"
                              color={actualMatched ? 'success' : 'warning'}
                              label={actualMatched ? 'DB' : 'dry-run'}
                              sx={{ height: 20, fontSize: 11, mt: 0.5 }}
                            />
                          </>
                        ) : (
                          <Typography fontSize={13} color="text.secondary">
                            Nėra
                          </Typography>
                        )}
                      </TableCell>

                      <TableCell align="center">
                        <Chip
                          label={display.confidence_pct || 0}
                          color={scoreColor(display.confidence_pct || 0)}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>

                      <TableCell sx={{ maxWidth: 460 }}>
                        <Typography variant="caption" sx={{ display: 'block' }}>
                          {display.status || 'unmatched'} · {display.matched_document_number || '—'}
                        </Typography>

                        {!!signals.skip_matching && (
                          <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
                            skipped: {signals.skip_reason || 'skip_matching'}
                          </Typography>
                        )}

                        {!!signals.txn_type && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            type: {signals.txn_type}
                          </Typography>
                        )}

                        {!!signals.merchant_name_clean && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            merchant: {signals.merchant_name_clean}
                          </Typography>
                        )}

                        {!!signals.references?.length && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            refs: {signals.references.slice(0, 3).map(r => r.value).join(', ')}
                          </Typography>
                        )}

                        {!!signals.original_amount && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            original: {signals.original_amount} {signals.original_currency}
                          </Typography>
                        )}

                        {!!signals.conversion_fee && (
                          <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
                            FX fee: {signals.conversion_fee} {signals.settled_currency}
                          </Typography>
                        )}
                      </TableCell>

                      <TableCell align="center">
                        <Tooltip title="Rodyti detales">
                          <IconButton
                            size="small"
                            onClick={() => setExpanded(p => ({ ...p, [tx.id]: !isOpen }))}
                          >
                            {isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>

                    <TableRow>
                      <TableCell colSpan={6} sx={{ p: 0, border: 0 }}>
                        <Collapse in={isOpen} timeout="auto" unmountOnExit>
                          <Box sx={{ p: 2, bgcolor: '#fafafa' }}>
                            <Box
                              sx={{
                                display: 'grid',
                                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                                gap: 2,
                              }}
                            >
                              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                                <Typography fontSize={13} fontWeight={700} sx={{ mb: 1 }}>
                                  Actual DB match
                                </Typography>

                                <Typography variant="caption" sx={{ display: 'block' }}>
                                  Status: {actual.status || tx.match_status || '—'}
                                </Typography>

                                <Typography variant="caption" sx={{ display: 'block' }}>
                                  Confidence: {actual.confidence_pct ?? fallbackDisplay.confidence_pct ?? 0}
                                </Typography>

                                <Typography variant="caption" sx={{ display: 'block' }}>
                                  Document: {actual.matched_document_number || tx.matched_document_number || '—'}
                                </Typography>

                                <Typography variant="caption" sx={{ display: 'block' }}>
                                  Allocation: {actual.allocation?.id || '—'}
                                </Typography>

                                {!!actual.purchase && (
                                  <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                                    Purchase: {actual.purchase.full_number} · {actual.purchase.seller_name} · {actual.purchase.amount_with_vat} {actual.purchase.currency}
                                  </Typography>
                                )}

                                {!!actual.allocation?.amount && (
                                  <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                                    Allocation amount: {actual.allocation.amount}
                                  </Typography>
                                )}
                              </Paper>

                              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                                <Typography fontSize={13} fontWeight={700} sx={{ mb: 1 }}>
                                  Signal dry-run
                                </Typography>

                                <Typography variant="caption" sx={{ display: 'block' }}>
                                  Status: {signal.status || '—'}
                                </Typography>

                                <Typography variant="caption" sx={{ display: 'block' }}>
                                  Confidence: {signal.confidence_pct ?? 0}
                                </Typography>

                                <Typography variant="caption" sx={{ display: 'block' }}>
                                  Document: {signal.matched_document_number || '—'}
                                </Typography>

                                {!!signal.purchase && (
                                  <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                                    Purchase: {signal.purchase.full_number} · {signal.purchase.seller_name} · {signal.purchase.amount_with_vat} {signal.purchase.currency}
                                  </Typography>
                                )}

                                {!!signal.amount && (
                                  <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                                    Allocation amount: {signal.amount}
                                  </Typography>
                                )}
                              </Paper>
                            </Box>

                            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mt: 2 }}>
                              <Typography fontSize={13} fontWeight={700} sx={{ mb: 1 }}>
                                Extracted signals
                              </Typography>

                              <pre style={{
                                margin: 0,
                                fontSize: 12,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}>
                                {JSON.stringify(signal.signals || actual.signals || {}, null, 2)}
                              </pre>
                            </Paper>

                            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mt: 2 }}>
                              <Typography fontSize={13} fontWeight={700} sx={{ mb: 1 }}>
                                Match details
                              </Typography>

                              <pre style={{
                                margin: 0,
                                fontSize: 12,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}>
                                {JSON.stringify(
                                  {
                                    actual_match: actual,
                                    signal_match: signal,
                                  },
                                  null,
                                  2,
                                )}
                              </pre>
                            </Paper>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Snackbar
        open={snack.open}
        autoHideDuration={5000}
        onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snack.sev}
          variant="filled"
          onClose={() => setSnack(s => ({ ...s, open: false }))}
        >
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default BankMatchingDebugPage;