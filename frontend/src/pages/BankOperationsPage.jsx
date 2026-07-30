import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Paper, Typography, Button, IconButton, Chip, TextField, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tooltip, CircularProgress, Snackbar, Alert, Dialog, DialogTitle,
  DialogContent, DialogActions, LinearProgress, Tab, Tabs,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  AccountBalance as BankIcon,
  Refresh as RefreshIcon,
  Rule as RuleIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
  EditOutlined as EditIcon,
  InfoOutlined as InfoIcon,
  WarningAmberOutlined as WarningIcon,
} from '@mui/icons-material';
import { invoicingApi } from '../api/invoicingApi';
import { useInvSubscription } from '../contexts/InvSubscriptionContext';
import LockIcon from '@mui/icons-material/Lock';
import BankTransactionsTab from './BankTransactionsTab';

const palette = { primary: '#1976d2' };

const BANK_CFG = {
  swedbank: { label: 'Swedbank', color: '#ff6600' },
  seb:      { label: 'SEB',      color: '#00843d' },
  luminor:  { label: 'Luminor',  color: '#572381' },
  siauliu:  { label: 'Šiaulių b.', color: '#003882' },
  revolut:  { label: 'Revolut',  color: '#0075eb' },
  other:    { label: 'Kitas',    color: '#757575' },
};

const STMT_STS = {
  uploaded:   { label: 'Įkeltas',     color: 'default' },
  processing: { label: 'Apdorojamas', color: 'info' },
  processed:  { label: 'Apdorotas',   color: 'success' },
  error:      { label: 'Klaida',      color: 'error' },
};

const fmtD = (d) => {
  if (!d) return '—';
  const p = String(d).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
};

const CHART_ACCOUNTS = ['2711', '2712', '2713', '2714', '2715', '2716', '2717', '2718', '2719'];

const DialogHeader = ({ title, onClose }) => (
  <DialogTitle sx={{ pr: 6, pb: 1.25, fontWeight: 700 }}>
    {title}
    <IconButton
      aria-label="Uždaryti"
      onClick={onClose}
      size="small"
      sx={{
        position: 'absolute',
        right: 12,
        top: 12,
        color: 'text.secondary',
      }}
    >
      <CloseIcon fontSize="small" />
    </IconButton>
  </DialogTitle>
);

const BankOperationsPage = () => {
  const [tab, setTab] = useState(0);
  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'success' });
  const show = (msg, sev = 'success') => setSnack({ open: true, msg, sev });

  // ── Statements ──
  const [stmts, setStmts] = useState([]);
  const [stmtLoad, setStmtLoad] = useState(true);
  const [stmtMore, setStmtMore] = useState(false);
  const stmtOff = useRef(0), stmtHas = useRef(true), stmtSen = useRef(null), stmtObs = useRef(null);

  const [uploadDlg, setUploadDlg] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selFile, setSelFile] = useState(null);
  const [selBank, setSelBank] = useState('');
  const [reMatchId, setReMatchId] = useState(null);
  const [reMatchLoading, setReMatchLoading] = useState(null);
  const [delId, setDelId] = useState(null);
  const [dupDlg, setDupDlg] = useState(null);

  // ── Rules ──
  const [rulesDlg, setRulesDlg] = useState(false);
  const [rules, setRules] = useState([]);
  const [rulesLoad, setRulesLoad] = useState(false);

  // ── Bank Accounts ──
  const [baDlg, setBaDlg] = useState(false);
  const [ba, setBa] = useState([]);
  const [baLoad, setBaLoad] = useState(false);
  const [baEdit, setBaEdit] = useState(null);
  const [baDelete, setBaDelete] = useState(null);

  // ── Filter state shared with Tab 2 ──
  const [stmtFilter, setStmtFilter] = useState('');

  const { isFeatureLocked, loading: subLoad } = useInvSubscription();
  const locked = !subLoad && isFeatureLocked("bank_import");

  // ── Load Statements ──
  const loadStmts = useCallback(async (reset = true) => {
    if (reset) { setStmtLoad(true); stmtOff.current = 0; stmtHas.current = true; }
    else setStmtMore(true);
    try {
      const { data } = await invoicingApi.getBankStatements({ limit: 50, offset: reset ? 0 : stmtOff.current });
      const r = data.results || data || [];
      if (reset) { setStmts(r); stmtOff.current = r.length; }
      else { setStmts(p => [...p, ...r]); stmtOff.current += r.length; }
      stmtHas.current = stmtOff.current < (data.count || r.length);
    } catch { show('Nepavyko įkelti išrašų', 'error'); }
    finally { if (reset) setStmtLoad(false); else setStmtMore(false); }
  }, []);

  useEffect(() => { if (tab === 0) loadStmts(true); }, [tab, loadStmts]);

  useEffect(() => {
    if (tab !== 0) return;
    if (stmtObs.current) stmtObs.current.disconnect();
    stmtObs.current = new IntersectionObserver(
      (e) => { if (e[0].isIntersecting && stmtHas.current && !stmtMore && !stmtLoad) loadStmts(false); },
      { rootMargin: '300px' },
    );
    if (stmtSen.current) stmtObs.current.observe(stmtSen.current);
    return () => stmtObs.current?.disconnect();
  }, [tab, loadStmts, stmtMore, stmtLoad]);

  // ── Handlers ──
  const doUpload = async () => {
    if (!selFile) return;
    setUploading(true);
    try {
      const { data } = await invoicingApi.uploadBankStatement(selFile, selBank);
      const bi = data.bank_account_info;
      show(`Importuota: ${data.total_entries || 0} įrašų, ${data.auto_matched_count || 0} susieta, ${data.duplicates_skipped || 0} dublikatų${bi ? ` · ${bi.bank_label || ''} → ${bi.chart_account}` : ''}`);
      setUploadDlg(false); setSelFile(null); setSelBank('');
      loadStmts(true);
    } catch (e) { show(e.response?.data?.error || 'Importavimas nepavyko', 'error'); }
    finally { setUploading(false); }
  };

  const doReMatch = async () => {
    if (!reMatchId) return;
    const id = reMatchId; setReMatchId(null); setReMatchLoading(id);
    try { await invoicingApi.reMatchBankStatement(id); show('Susiejimas atliktas'); loadStmts(true); }
    catch { show('Nepavyko', 'error'); }
    finally { setReMatchLoading(null); }
  };

  const doDelete = async () => {
    if (!delId) return;
    try { await invoicingApi.deleteBankStatement(delId); show('Ištrinta'); setDelId(null); loadStmts(true); }
    catch { show('Nepavyko', 'error'); }
  };

  const loadRules = async () => { setRulesLoad(true); try { const { data } = await invoicingApi.getBankRules(); setRules(data.results || data || []); } catch {} finally { setRulesLoad(false); } };
  const delRule = async (id) => { try { await invoicingApi.deleteBankRule(id); show('Taisyklė ištrinta'); loadRules(); } catch { show('Nepavyko', 'error'); } };
  const loadBa = async () => { setBaLoad(true); try { const { data } = await invoicingApi.getBankAccounts(); setBa(data || []); } catch {} finally { setBaLoad(false); } };

  const saveBankAccount = async (b) => {
    const acc = document.getElementById(`baa-${b.key}`)?.value || b.account;
    const lbl = document.getElementById(`bal-${b.key}`)?.value || b.label;
    const ibanVal = document.getElementById(`bai-${b.key}`)?.value ?? '';

    const accountChanged = String(acc) !== String(b.account);

    const payload = {
      key: b.key,
      account: acc,
      label: lbl,
      iban: ibanVal,
      bank: b.bank || '',
      currency: b.currency || 'EUR',
    };

    try {
      const { data } = await invoicingApi.updateBankAccount(payload);
      setBa(data.accounts || []);
      setBaEdit(null);

      if (accountChanged) {
        show(
          'Kor. sąskaita atnaujinta. Ankstesni DK įrašai automatiškai nekeičiami. Jei norite pakeisti senus įrašus, paleiskite pakartotinį susiejimą arba importuokite išrašą iš naujo.',
          'info',
        );
      } else {
        show('Atnaujinta');
      }

      loadStmts(true);
    } catch {
      show('Nepavyko', 'error');
    }
  };

  const deleteBankAccount = async () => {
    if (!baDelete) return;

    try {
      const { data } = await invoicingApi.deleteBankAccount(baDelete.key);
      setBa(data.accounts || []);
      setBaDelete(null);
      show('Sąskaita pašalinta');
      loadStmts(true);
    } catch {
      show('Nepavyko pašalinti sąskaitos', 'error');
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1500, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h1" sx={{ color: palette.primary, fontWeight: 500, fontSize: 24 }}>Banko operacijos</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" size="small" startIcon={<BankIcon />} onClick={() => { setBaDlg(true); loadBa(); }}>Sąskaitos</Button>
          <Button variant="outlined" size="small" startIcon={<RuleIcon />} onClick={() => { setRulesDlg(true); loadRules(); }}>Taisyklės</Button>
          <Button variant="contained" startIcon={<UploadIcon />} onClick={() => setUploadDlg(true)} disabled={subLoad || locked}>Importuoti išrašą</Button>
        </Box>
      </Box>

      {/* Lock banner */}
      {!subLoad && locked && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, py: 2, mb: 2, borderRadius: 3,
          bgcolor: 'rgba(255,145,0,0.10)', border: '1px solid rgba(255,145,0,0.28)', backdropFilter: 'blur(8px)', flexWrap: 'wrap' }}>
          <Box sx={{ width: 34, height: 34, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(255,145,0,0.14)' }}>
            <LockIcon sx={{ color: '#F57C00', fontSize: 18 }} />
          </Box>
          <Typography variant="body2" sx={{ color: '#3B2A1A', fontWeight: 500 }}>Banko operacijos prieinamos tik su mokamu planu.</Typography>
          <Button size="small" href="/papildyti#planai" sx={{ textTransform: 'none', borderRadius: 2.5, px: 2, py: 0.75, fontWeight: 600,
            color: '#fff', background: 'linear-gradient(135deg, #FF9800 0%, #F57C00 100%)',
            '&:hover': { background: 'linear-gradient(135deg, #FB8C00 0%, #EF6C00 100%)' } }}>Įsigyti planą</Button>
        </Box>
      )}

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Banko išrašai" />
        <Tab label="Banko operacijos" />
      </Tabs>

      {/* ═══ TAB 1: STATEMENTS ═══ */}
      {tab === 0 && (<>
        {stmtLoad ? <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
        : stmts.length === 0 ? (
          <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
            <BankIcon sx={{ fontSize: 48, color: '#bdbdbd', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>Banko išrašų nerasta</Typography>
            <Button variant="contained" startIcon={<UploadIcon />} onClick={() => setUploadDlg(true)}>Importuoti</Button>
          </Paper>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, py: 1.5, backgroundColor: '#f5f5f5' } }}>
                  <TableCell>Bankas</TableCell>
                  <TableCell>Failas</TableCell>
                  <TableCell>IBAN / Kor. sąskaita</TableCell>
                  <TableCell>Laikotarpis</TableCell>
                  <TableCell align="center">Valiuta</TableCell>
                  <TableCell align="center">Importuoti įrašai</TableCell>
                  <TableCell align="center">Praleisti dublikatai</TableCell>
                  <TableCell align="center">Susieta</TableCell>
                  <TableCell align="center">Reikia patvirtinimo</TableCell>
                  <TableCell align="center">Nesusieta</TableCell>
                  <TableCell>Statusas</TableCell>
                  <TableCell>Importuota</TableCell>
                  <TableCell>Veiksmai</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stmts.map(s => {
                  const bc = BANK_CFG[s.bank_name] || BANK_CFG.other;
                  const sc = STMT_STS[s.status] || STMT_STS.uploaded;
                  const bi = s.bank_account_info;
                  return (
                    <TableRow key={s.id} hover sx={{ '& td': { py: 1.2 }, cursor: 'pointer' }}
                      onClick={() => { setStmtFilter(String(s.id)); setTab(1); }}>
                      <TableCell><Chip label={bc.label} size="small" sx={{ backgroundColor: bc.color, color: '#fff', fontWeight: 600, fontSize: 11 }} /></TableCell>
                      <TableCell>
                        <Tooltip title={s.original_filename || ''} placement="top">
                          <Typography fontSize={12} sx={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.original_filename || '—'}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Typography fontSize={12} sx={{ fontFamily: 'monospace' }}>{bi?.iban || s.account_iban || '—'}</Typography>
                        {bi?.chart_account && <Typography variant="caption" color="text.secondary">Sąsk. {bi.chart_account}</Typography>}
                      </TableCell>
                      <TableCell><Typography fontSize={13}>{fmtD(s.period_from)} – {fmtD(s.period_to)}</Typography></TableCell>
                      <TableCell align="center"><Typography fontSize={12} fontWeight={600}>{s.currency || 'EUR'}</Typography></TableCell>
                      <TableCell align="center">
                        <Typography fontSize={13} fontWeight={600}>{s.total_entries || 0}</Typography>
                        <Typography variant="caption" color="text.secondary">Įpl. {s.credit_entries || 0} · Išl. {s.debit_entries || 0}</Typography>
                      </TableCell>
                      <TableCell align="center" onClick={e => e.stopPropagation()}>
                        {s.duplicates_skipped ? (
                          <Button
                            size="small"
                            color="warning"
                            variant="text"
                            onClick={() => setDupDlg(s)}
                            sx={{ minWidth: 0, fontSize: 13, fontWeight: 700 }}
                          >
                            {s.duplicates_skipped}
                          </Button>
                        ) : (
                          <Typography fontSize={13} color="text.secondary">0</Typography>
                        )}
                      </TableCell>
                      <TableCell align="center"><Typography fontSize={13} fontWeight={600} color="success.main">{s.auto_matched_count || 0}</Typography></TableCell>
                      <TableCell align="center"><Typography fontSize={13} fontWeight={600} color="warning.main">{s.likely_matched_count || 0}</Typography></TableCell>
                      <TableCell align="center"><Typography fontSize={13} color="text.secondary">{s.unmatched_count || 0}</Typography></TableCell>
                      <TableCell><Chip label={sc.label} color={sc.color} size="small" variant="outlined" sx={{ fontSize: 11, height: 22 }} /></TableCell>
                      <TableCell><Typography fontSize={12} color="text.secondary">{fmtD(s.created_at?.split('T')[0])}</Typography></TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Box sx={{ display: 'flex', gap: 0.25 }}>
                          {s.status === 'processed' && (
                            <Tooltip title="Pakartotinis susiejimas">
                              <IconButton size="small" onClick={() => setReMatchId(s.id)} disabled={reMatchLoading === s.id}>
                                {reMatchLoading === s.id ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Ištrinti"><IconButton size="small" color="error" onClick={() => setDelId(s.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow ref={stmtSen}><TableCell colSpan={13} sx={{ p: 0, border: 0, height: 1 }} /></TableRow>
                {stmtMore && <TableRow><TableCell colSpan={13} align="center" sx={{ py: 2 }}><LinearProgress sx={{ maxWidth: 200, mx: 'auto' }} /></TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </>)}

      {/* ═══ TAB 2: TRANSACTIONS ═══ */}
      {tab === 1 && (
        <BankTransactionsTab
          statements={stmts}
          initialStatementId={stmtFilter}
          onClearStatementFilter={() => setStmtFilter('')}
          showSnack={show}
        />
      )}

      {/* ═══ UPLOAD DIALOG ═══ */}
      <Dialog open={uploadDlg} onClose={() => !uploading && setUploadDlg(false)} maxWidth="xs" fullWidth disableScrollLock>
        <DialogHeader title="Importuoti banko išrašą" onClose={() => !uploading && setUploadDlg(false)} />
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Button variant="outlined" component="label" startIcon={<UploadIcon />} fullWidth
              sx={{ justifyContent: 'flex-start', textTransform: 'none', py: 1.5 }}>
              {selFile ? selFile.name : 'Pasirinkti failą...'}
              <input type="file" hidden accept=".csv,.xml" onChange={e => setSelFile(e.target.files[0] || null)} />
            </Button>
            <TextField
                select
                size="small"
                label="Bankas"
                value={selBank}
                onChange={e => setSelBank(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
                SelectProps={{
                    displayEmpty: true,
                    renderValue: (value) => {
                    if (!value) return 'Automatinis atpažinimas';

                    const labels = {
                        swedbank: 'Swedbank',
                        seb: 'SEB',
                        luminor: 'Luminor',
                        siauliu: 'Šiaulių bankas',
                        revolut: 'Revolut',
                    };

                    return labels[value] || value;
                    },
                    MenuProps: { disableScrollLock: true },
                }}
                >
                <MenuItem value="">Automatinis atpažinimas</MenuItem>
                <MenuItem value="seb">SEB</MenuItem>
                <MenuItem value="swedbank">Swedbank</MenuItem>
                <MenuItem value="luminor">Luminor</MenuItem>
                <MenuItem value="siauliu">Artea</MenuItem>
                <MenuItem value="revolut">Revolut</MenuItem>
            </TextField>
            {uploading && <LinearProgress />}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setUploadDlg(false); setSelFile(null); }} disabled={uploading}>Atšaukti</Button>
          <Button variant="contained" onClick={doUpload} disabled={!selFile || uploading}
            startIcon={uploading ? <CircularProgress size={16} /> : <UploadIcon />}>Importuoti</Button>
        </DialogActions>
      </Dialog>

      {/* RE-MATCH */}
      <Dialog open={!!reMatchId} onClose={() => setReMatchId(null)} disableScrollLock maxWidth="xs" fullWidth>
        <DialogTitle>Pakartotinis susiejimas</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Nesusietos ir galimo atitikimo operacijos bus iš naujo susietos su sąskaitomis ir pirkimais.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Jau patvirtinti susiejimai nebus pakeisti. Likusios operacijos bus automatiškai kategorizuotos.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setReMatchId(null)}>Atšaukti</Button>
          <Button variant="contained" onClick={doReMatch}>Susieti pakartotinai</Button>
        </DialogActions>
      </Dialog>

      {/* DELETE */}
      <Dialog open={!!delId} onClose={() => setDelId(null)} disableScrollLock maxWidth="xs" fullWidth>
        <DialogHeader title="Ištrinti banko išrašą?" onClose={() => setDelId(null)} />
        <DialogContent>
          {(() => {
            const ds = stmts.find(s => s.id === delId);
            if (!ds) return null;
            const bc = BANK_CFG[ds.bank_name] || BANK_CFG.other;
            return (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'grey.50' }}>
                  <Typography fontSize={13} fontWeight={600}>{bc.label} · {fmtD(ds.period_from)} – {fmtD(ds.period_to)}</Typography>
                  <Typography variant="caption" color="text.secondary">{ds.original_filename}</Typography>
                </Paper>
                <Typography variant="body2" color="text.secondary">
                  Bus ištrinta: {ds.total_entries || 0} operacij{(ds.total_entries === 1) ? 'a' : 'os'},
                  {' '}{(ds.auto_matched_count || 0) + (ds.likely_matched_count || 0)} susiejim{((ds.auto_matched_count || 0) + (ds.likely_matched_count || 0)) === 1 ? 'as' : 'ai'}
                  {' '}ir susiję DK įrašai.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Sąskaitų ir pirkimų mokėjimo statusai bus perskaičiuoti.
                </Typography>
              </Box>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDelId(null)}>Atšaukti</Button>
          <Button variant="contained" color="error" onClick={doDelete}>Ištrinti</Button>
        </DialogActions>
      </Dialog>

      {/* ═══ RULES DIALOG ═══ */}
      <Dialog open={rulesDlg} onClose={() => setRulesDlg(false)} maxWidth="md" fullWidth disableScrollLock>
        <DialogHeader title="Automatinės taisyklės" onClose={() => setRulesDlg(false)} />
        <DialogContent>
          {rulesLoad ? <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress /></Box>
          : rules.length === 0 ? <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>Nėra taisyklių.</Typography>
          : (
            <TableContainer><Table size="small">
              <TableHead><TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12 } }}>
                <TableCell>Pavadinimas</TableCell><TableCell>Sąlyga</TableCell><TableCell>Kategorija</TableCell>
                <TableCell>Sąskaita</TableCell><TableCell align="center">Panaudota</TableCell><TableCell />
              </TableRow></TableHead>
              <TableBody>
                {rules.map(r => (
                  <TableRow key={r.id} hover>
                    <TableCell><Typography fontSize={13} fontWeight={600}>{r.name}</Typography></TableCell>
                    <TableCell><Typography variant="caption">{r.match_field_display} {r.match_operator} "{r.match_value}"</Typography></TableCell>
                    <TableCell><Chip label={r.category_display} size="small" sx={{ fontSize: 11, height: 20 }} /></TableCell>
                    <TableCell><Typography variant="caption">{r.debit_account || '—'}</Typography></TableCell>
                    <TableCell align="center"><Typography fontSize={12}>{r.times_applied}</Typography></TableCell>
                    <TableCell><IconButton size="small" color="error" onClick={() => delRule(r.id)}><DeleteIcon fontSize="small" /></IconButton></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></TableContainer>
          )}
        </DialogContent>
      </Dialog>

      {/* DUPLICATES */}
      <Dialog open={!!dupDlg} onClose={() => setDupDlg(null)} disableScrollLock maxWidth="md" fullWidth>
        <DialogHeader title="Praleisti dublikatai" onClose={() => setDupDlg(null)} />
        <DialogContent>
          {!dupDlg?.duplicate_details?.length ? (
            <Typography variant="body2" color="text.secondary">
              Dublikatų detalių nėra. Reikia importuoti iš naujo po backend pakeitimų.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {dupDlg.duplicate_details.map((d, idx) => (
                <Paper key={idx} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 1 }}>
                    <Typography fontSize={13} fontWeight={700}>
                      Dublikatas #{idx + 1}
                    </Typography>
                    <Chip
                      size="small"
                      color="warning"
                      variant="outlined"
                      label={d.direction === 'incoming' ? 'Įplauka' : 'Išlaida'}
                    />
                  </Box>

                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                    <Box>
                      <Typography fontSize={12} fontWeight={700} color="warning.main" sx={{ mb: 1 }}>
                        Nauja eilutė iš importo
                      </Typography>
                      <Typography fontSize={12}>Bankas: {d.new?.bank || '—'}</Typography>
                      <Typography fontSize={12}>Failas: {d.new?.statement_filename || '—'}</Typography>
                      <Typography fontSize={12}>Sąskaita: {d.new?.own_account_key || d.new?.statement_iban || '—'}</Typography>
                      <Typography fontSize={12}>Data: {fmtD(d.new?.date)}</Typography>
                      <Typography fontSize={12}>Suma: {d.new?.amount} {d.new?.currency}</Typography>
                      <Typography fontSize={12}>Kontrahentas: {d.new?.counterparty_name || '—'}</Typography>
                      <Typography fontSize={12}>Dok. nr.: {d.new?.doc_number || '—'}</Typography>
                      <Typography fontSize={12} sx={{ mt: 1 }}>
                        Paskirtis: {d.new?.payment_purpose || '—'}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography fontSize={12} fontWeight={700} color="success.main" sx={{ mb: 1 }}>
                        Jau importuota operacija
                      </Typography>
                      <Typography fontSize={12}>Bankas: {d.existing?.bank || '—'}</Typography>
                      <Typography fontSize={12}>Failas: {d.existing?.statement_filename || '—'}</Typography>
                      <Typography fontSize={12}>Sąskaita: {d.existing?.own_account_key || d.existing?.statement_iban || '—'}</Typography>
                      <Typography fontSize={12}>Data: {fmtD(d.existing?.date)}</Typography>
                      <Typography fontSize={12}>Suma: {d.existing?.amount} {d.existing?.currency}</Typography>
                      <Typography fontSize={12}>Kontrahentas: {d.existing?.counterparty_name || '—'}</Typography>
                      <Typography fontSize={12}>Dok. nr.: {d.existing?.doc_number || '—'}</Typography>
                      <Typography fontSize={12} sx={{ mt: 1 }}>
                        Paskirtis: {d.existing?.payment_purpose || '—'}
                      </Typography>
                    </Box>
                  </Box>

                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5, fontFamily: 'monospace' }}>
                    hash: {d.transaction_hash}
                  </Typography>
                </Paper>
              ))}
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ BANK ACCOUNTS DIALOG ═══ */}
      <Dialog open={baDlg} onClose={() => setBaDlg(false)} maxWidth="sm" fullWidth disableScrollLock>
        <DialogHeader title="Banko sąskaitų susiejimas" onClose={() => setBaDlg(false)} />
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Kiekvienai banko sąskaitai priskirkite kor. sąskaitą. Naujos sąskaitos aptinkamos automatiškai importuojant išrašus.
          </Typography>
          {baLoad ? <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress /></Box>
          : ba.length === 0 ? <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>Importuokite išrašą.</Typography>
          : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {ba.map(b => {
                const noI = !b.iban;
                const usedAccounts = ba.filter(x => x.key !== b.key).map(x => x.account);
                return (
                  <Paper key={b.key} variant="outlined" sx={{ p: 2, borderRadius: 2, ...(noI ? { borderColor: '#ed6c02', borderStyle: 'dashed' } : {}) }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                      <Box>
                        <Typography fontSize={14} fontWeight={700}>{b.label || b.bank || b.key}</Typography>
                        {b.iban
                          ? <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>{b.iban}</Typography>
                          : <Chip label="Rekomenduojame priskirti IBAN numerį" size="small" color="warning" variant="outlined" sx={{ fontSize: 11, height: 22, mt: 0.5 }} />
                        }
                      </Box>
                      <Chip label={b.currency} size="small" variant="outlined" />
                    </Box>
                    {baEdit === b.key ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <TextField size="small" label="IBAN numeris" defaultValue={b.iban || ''} placeholder="Pvz. LT197044090100690265"
                          inputProps={{ id: `bai-${b.key}`, style: { fontFamily: 'monospace' } }} fullWidth
                          helperText="IBAN padės tiksliau susieti operacijas" />
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                          <TextField select size="small" label="Kor. sąskaita" defaultValue={b.account}
                            inputProps={{ id: `baa-${b.key}` }} sx={{ width: 150 }}
                            SelectProps={{ MenuProps: { disableScrollLock: true } }} autoFocus>
                            {CHART_ACCOUNTS.map(a => (
                              <MenuItem key={a} value={a} disabled={usedAccounts.includes(a)}>
                                {a}{usedAccounts.includes(a) ? ' (užimta)' : ''}
                              </MenuItem>
                            ))}
                          </TextField>
                          <TextField size="small" label="Pavadinimas" defaultValue={b.label}
                            inputProps={{ id: `bal-${b.key}` }} sx={{ flex: 1 }} />
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                          <Button size="small" onClick={() => setBaEdit(null)}>Atšaukti</Button>
                          <Button size="small" variant="contained" onClick={() => {
                            const acc = document.getElementById(`baa-${b.key}`)?.value || b.account;
                            const lbl = document.getElementById(`bal-${b.key}`)?.value || b.label;
                            const ibanVal = document.getElementById(`bai-${b.key}`)?.value ?? '';
                            const payload = {
                              key: b.key,
                              account: acc,
                              label: lbl,
                              iban: ibanVal,
                              bank: b.bank || '',
                              currency: b.currency || 'EUR',
                            };
                            invoicingApi.updateBankAccount(payload).then(({ data }) => {
                              setBa(data.accounts || []); setBaEdit(null); show('Atnaujinta');
                            }).catch(() => show('Nepavyko', 'error'));
                          }}>Išsaugoti</Button>
                        </Box>
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography fontSize={13}>Kor. sąskaita: <strong style={{ fontFamily: 'monospace' }}>{b.account}</strong></Typography>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Tooltip title="Redaguoti">
                            <IconButton size="small" onClick={() => setBaEdit(b.key)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Pašalinti">
                            <IconButton size="small" color="error" onClick={() => setBaDelete(b)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>
                    )}
                  </Paper>
                );
              })}
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* DELETE BANK ACCOUNT */}
      <Dialog open={!!baDelete} onClose={() => setBaDelete(null)} disableScrollLock maxWidth="xs" fullWidth>
        <DialogHeader title="Pašalinti sąskaitą?" onClose={() => setBaDelete(null)} />
        <DialogContent sx={{ pt: 0 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: '#FAFAFA' }}>
              <Typography fontSize={13} fontWeight={700}>
                {baDelete?.label || baDelete?.bank || baDelete?.key}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {baDelete?.iban || baDelete?.key} · {baDelete?.currency || 'EUR'} · Kor. sąskaita {baDelete?.account}
              </Typography>
            </Paper>
            <Typography variant="body2" color="text.secondary">
              Sąskaita bus pašalinta tik iš susiejimo sąrašo. Jau sukurti DK įrašai ir senos banko operacijos automatiškai nebus pakeisti.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Jei norite pakeisti senus įrašus, po pakeitimų paleiskite pakartotinį susiejimą arba importuokite išrašą iš naujo.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setBaDelete(null)}>Atšaukti</Button>
          <Button variant="contained" color="error" onClick={deleteBankAccount}>
            Pašalinti
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snack.open} autoHideDuration={5000} onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack(s => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default BankOperationsPage;


