import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  IconButton,
  Tooltip,
  LinearProgress,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  AccountBalance as BankIcon,
  CheckCircle as MatchedIcon,
  HelpOutline as LikelyIcon,
  LinkOff as UnmatchedIcon,
  ContentCopy as DupeIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { invoicingApi } from '../api/invoicingApi';

import { useInvSubscription } from '../contexts/InvSubscriptionContext';
import LockIcon from '@mui/icons-material/Lock';

const palette = {
  primary: '#1976d2',
  border: '#e0e0e0',
};

const BANK_CONFIG = {
  swedbank: { label: 'Swedbank', color: '#ff6600' },
  seb:      { label: 'SEB',      color: '#00843d' },
  luminor:  { label: 'Luminor',  color: '#572381' },
  siauliu:  { label: 'Šiaulių bankas', color: '#003882' },
  revolut:  { label: 'Revolut',  color: '#0075eb' },
  other:    { label: 'Kitas',    color: '#757575' },
};

const STATUS_CONFIG = {
  uploaded:   { label: 'Įkeltas',     color: 'default' },
  processing: { label: 'Apdorojamas', color: 'info' },
  processed:  { label: 'Apdorotas',   color: 'success' },
  error:      { label: 'Klaida',      color: 'error' },
};

const fmtDate = (d) => {
  if (!d) return '—';
  const parts = String(d).split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
};

const BankStatementsPage = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [statements, setStatements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadDialog, setUploadDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedBank, setSelectedBank] = useState('');
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });
  const [deleteId, setDeleteId] = useState(null);
  const [reMatchLoading, setReMatchLoading] = useState(null);
  const [reMatchId, setReMatchId] = useState(null);

  const showSnack = (msg, severity = 'success') => setSnack({ open: true, msg, severity });

  // ── Load statements ──

  const loadStatements = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await invoicingApi.getBankStatements();
      setStatements(data.results || data || []);
    } catch {
      showSnack('Nepavyko įkelti banko išrašų', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatements(); }, [loadStatements]);

  // ── Auto-refresh when page gets focus (after confirming/rejecting on other pages) ──
  useEffect(() => {
    const handleFocus = () => {
      loadStatements();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadStatements]);

  // ── Upload ──

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const { data } = await invoicingApi.uploadBankStatement(selectedFile, selectedBank);
      showSnack(
        `Importuota: ${data.total_entries || 0} įrašų, ` +
        `${data.auto_matched_count || 0} automatiškai susieta, ` +
        `${data.duplicates_skipped || 0} dublikatų praleista`
      );
      setUploadDialog(false);
      setSelectedFile(null);
      setSelectedBank('');
      loadStatements();
    } catch (e) {
      const msg = e.response?.data?.error || e.response?.data?.detail || 'Importavimas nepavyko';
      showSnack(msg, 'error');
    } finally {
      setUploading(false);
    }
  };

  // ── Delete ──

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await invoicingApi.deleteBankStatement(deleteId);
      showSnack('Banko išrašas ištrintas');
      setDeleteId(null);
      loadStatements();
    } catch {
      showSnack('Nepavyko ištrinti', 'error');
    }
  };

  // ── Re-match ──

  const handleReMatch = async () => {
    if (!reMatchId) return;
    setReMatchLoading(reMatchId);
    setReMatchId(null);
    try {
      await invoicingApi.reMatchBankStatement(reMatchId);
      showSnack('Pakartotinis susiejimas atliktas');
      loadStatements();
    } catch {
      showSnack('Nepavyko atlikti pakartotinio susiejimo', 'error');
    } finally {
      setReMatchLoading(null);
    }
  };

  // ── Summary stats ──

  const totalStats = statements.reduce(
    (acc, s) => ({
      entries: acc.entries + (s.total_entries || 0),
      incoming: acc.incoming + (s.credit_entries || 0),
      outgoing: acc.outgoing + (s.debit_entries || 0),
      matched: acc.matched + (s.auto_matched_count || 0),
      likely: acc.likely + (s.likely_matched_count || 0),
      unmatched: acc.unmatched + (s.unmatched_count || 0),
      dupes: acc.dupes + (s.duplicates_skipped || 0),
    }),
    { entries: 0, incoming: 0, outgoing: 0, matched: 0, likely: 0, unmatched: 0, dupes: 0 }
  );

  const { isFeatureLocked } = useInvSubscription();
  const bankImportLocked = isFeatureLocked("bank_import");

  // ════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h1" sx={{ color: palette.primary, fontWeight: 500, fontSize: 24 }}>
          Banko išrašai
        </Typography>
        <Button
          variant="contained"
          startIcon={<UploadIcon />}
          onClick={() => setUploadDialog(true)}
          disabled={bankImportLocked}
        >
          Importuoti išrašą
        </Button>
      </Box>

        {bankImportLocked && (
            <Box
            sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                px: 2.5,
                py: { xs: 1.5, md: 2 },
                mb: 3,
                borderRadius: 3,
                bgcolor: "rgba(255, 145, 0, 0.10)",
                border: "1px solid rgba(255, 145, 0, 0.28)",
                boxShadow: "0 10px 30px rgba(255, 145, 0, 0.10)",
                backdropFilter: "blur(8px)",
                flexWrap: "wrap",
            }}
            >
            <Box
                sx={{
                width: 34,
                height: 34,
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "rgba(255, 145, 0, 0.14)",
                flexShrink: 0,
                }}
            >
                <LockIcon
                sx={{
                    color: "#F57C00",
                    fontSize: 18,
                }}
                />
            </Box>

            <Typography
                variant="body2"
                sx={{
                color: "#3B2A1A",
                fontWeight: 500,
                lineHeight: 1.5,
                }}
            >
                Banko išrašų importas prieinamas tik su mokamu planu arba bandomuoju laikotarpiu.
            </Typography>

            <Button
                size="small"
                href="/papildyti#planai"
                sx={{
                textTransform: "none",
                borderRadius: 2.5,
                px: 2,
                py: 0.75,
                minWidth: "fit-content",
                flexShrink: 0,
                fontWeight: 600,
                color: "#fff",
                background: "linear-gradient(135deg, #FF9800 0%, #F57C00 100%)",
                boxShadow: "none",
                "&:hover": {
                    background: "linear-gradient(135deg, #FB8C00 0%, #EF6C00 100%)",
                    boxShadow: "none",
                },
                }}
            >
                Įsigyti planą
            </Button>
            </Box>
        )}

        {/* Stats cards */}
        {statements.length > 0 && (
            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
            <StatCard
                icon={<BankIcon sx={{ color: '#1565c0' }} />}
                label="Iš viso įrašų"
                value={totalStats.entries}
                subtitle={`Įplaukos: ${totalStats.incoming} · Išlaidos: ${totalStats.outgoing}`}
            />
            <StatCard
                icon={<MatchedIcon sx={{ color: '#2e7d32' }} />}
                label="Susieta su sąskaitomis"
                value={totalStats.matched}
                color="#2e7d32"
            />
            <StatCard
                icon={<LikelyIcon sx={{ color: '#ed6c02' }} />}
                label="Laukia patvirtinimo"
                value={totalStats.likely}
                color="#ed6c02"
            />
            <StatCard
                icon={<UnmatchedIcon sx={{ color: '#757575' }} />}
                label="Nesusieta"
                value={totalStats.unmatched}
            />
            <StatCard
                icon={<DupeIcon sx={{ color: '#9e9e9e' }} />}
                label="Dublikatai praleisti"
                value={totalStats.dupes}
            />
            </Box>
        )}

        {/* Statements list */}
        {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
            <CircularProgress />
            </Box>
        ) : statements.length === 0 ? (
            <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
            <BankIcon sx={{ fontSize: 48, color: '#bdbdbd', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                Banko išrašų nerasta
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Importuokite banko išrašą (CSV arba XML), kad automatiškai susieti mokėjimus su sąskaitomis
            </Typography>
            <Button
                variant="contained"
                startIcon={<UploadIcon />}
                onClick={() => setUploadDialog(true)}
            >
                Importuoti išrašą
            </Button>
            </Paper>
        ) : isMobile ? (
            <Box>
            {statements.map((stmt) => (
                <MobileStatementCard
                key={stmt.id}
                stmt={stmt}
                reMatchLoading={reMatchLoading}
                onReMatch={setReMatchId}
                onDelete={setDeleteId}
                />
            ))}
            </Box>
        ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
            <Table size="small">
                <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, py: 1.5, backgroundColor: '#f5f5f5' } }}>
                    <TableCell>Bankas</TableCell>
                    <TableCell>Failas</TableCell>
                    <TableCell>Laikotarpis</TableCell>
                    <TableCell align="center">Įrašai</TableCell>
                    <TableCell align="center">Susieta su sąskaitomis</TableCell>
                    <TableCell align="center">Laukia rankinio patvirtinimo</TableCell>
                    <TableCell align="center">Nesusieta</TableCell>
                    <TableCell align="center">Dublikatai</TableCell>
                    <TableCell>Statusas</TableCell>
                    <TableCell>Importuota</TableCell>
                    <TableCell align="left">Veiksmai</TableCell>
                </TableRow>
                </TableHead>
                <TableBody>
                {statements.map((stmt) => {
                    const bankCfg = BANK_CONFIG[stmt.bank_name] || BANK_CONFIG.other;
                    const stsCfg = STATUS_CONFIG[stmt.status] || STATUS_CONFIG.uploaded;
                    const incoming = stmt.credit_entries || 0;
                    const outgoing = stmt.debit_entries || 0;

                    return (
                    <TableRow key={stmt.id} hover sx={{ '& td': { py: 1.2 } }}>
                        <TableCell>
                        <Chip
                            label={bankCfg.label}
                            size="small"
                            sx={{
                            backgroundColor: bankCfg.color,
                            color: '#fff',
                            fontWeight: 600,
                            fontSize: 11,
                            }}
                        />
                        </TableCell>
                        <TableCell>
                        <Typography fontSize={13} sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {stmt.original_filename || '—'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {(stmt.file_format || '').toUpperCase()}
                        </Typography>
                        </TableCell>
                        <TableCell>
                        <Typography fontSize={13}>
                            {fmtDate(stmt.period_from)} – {fmtDate(stmt.period_to)}
                        </Typography>
                        </TableCell>
                        <TableCell align="center" sx={{ minWidth: 80 }}>
                        <Typography fontSize={13} fontWeight={600}>{stmt.total_entries || 0}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, whiteSpace: 'nowrap' }}>
                            Įpl. {incoming}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, whiteSpace: 'nowrap' }}>
                            Išl. {outgoing}
                        </Typography>
                        </TableCell>
                        <TableCell align="center">
                        <Typography fontSize={13} fontWeight={600} color="success.main">
                            {stmt.auto_matched_count || 0}
                        </Typography>
                        </TableCell>
                        <TableCell align="center">
                        <Typography fontSize={13} fontWeight={600} color="warning.main">
                            {stmt.likely_matched_count || 0}
                        </Typography>
                        </TableCell>
                        <TableCell align="center">
                        <Typography fontSize={13} color="text.secondary">
                            {stmt.unmatched_count || 0}
                        </Typography>
                        </TableCell>
                        <TableCell align="center">
                        <Typography fontSize={13} color="text.secondary">
                            {stmt.duplicates_skipped || 0}
                        </Typography>
                        </TableCell>
                        <TableCell>
                        <Chip
                            label={stsCfg.label}
                            color={stsCfg.color}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: 11, height: 22 }}
                        />
                        {stmt.error_message && (
                            <Tooltip title={stmt.error_message}>
                            <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.25, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {stmt.error_message}
                            </Typography>
                            </Tooltip>
                        )}
                        </TableCell>
                        <TableCell>
                        <Typography fontSize={12} color="text.secondary">
                            {fmtDate(stmt.created_at?.split('T')[0])}
                        </Typography>
                        </TableCell>
                        <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.25 }}>
                            {stmt.status === 'processed' && (
                            <Tooltip title="Pakartotinis susiejimas">
                                <IconButton
                                size="small"
                                onClick={() => setReMatchId(stmt.id)}
                                disabled={reMatchLoading === stmt.id}
                                >
                                {reMatchLoading === stmt.id
                                    ? <CircularProgress size={16} />
                                    : <RefreshIcon fontSize="small" />
                                }
                                </IconButton>
                            </Tooltip>
                            )}
                            {stmt.status === 'error' && (
                            <Tooltip title="Ištrinti">
                                <IconButton size="small" color="error" onClick={() => setDeleteId(stmt.id)}>
                                <DeleteIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            )}
                        </Box>
                        </TableCell>
                    </TableRow>
                    );
                })}
                </TableBody>
            </Table>
            </TableContainer>
      )}

      {/* ── Upload Dialog ── */}
      <Dialog
        open={uploadDialog}
        onClose={() => { if (!uploading) { setUploadDialog(false); setSelectedFile(null); setSelectedBank(''); } }}
        maxWidth="xs"
        fullWidth
        disableScrollLock
      >
        <DialogTitle>Importuoti banko išrašą</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Pasirinkite banko išrašo failą (CSV arba XML). Bankas bus nustatytas automatiškai, bet galite pasirinkti rankiniu būdu.
            </Typography>

            <Button
              variant="outlined"
              component="label"
              startIcon={<UploadIcon />}
              fullWidth
              sx={{ justifyContent: 'flex-start', textTransform: 'none', py: 1.5 }}
            >
              {selectedFile ? selectedFile.name : 'Pasirinkti failą...'}
              <input
                type="file"
                hidden
                accept=".csv,.xml"
                onChange={(e) => setSelectedFile(e.target.files[0] || null)}
              />
            </Button>

            <TextField
              select
              size="small"
              label="Bankas"
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
              fullWidth
              SelectProps={{ MenuProps: { disableScrollLock: true } }}
              InputLabelProps={{ shrink: true }}
              helperText="Palikite tuščią automatiniam nustatymui"
            >
              <MenuItem value="">Automatinis</MenuItem>
              <MenuItem value="swedbank">Swedbank</MenuItem>
              <MenuItem value="seb">SEB</MenuItem>
              <MenuItem value="luminor">Luminor</MenuItem>
              <MenuItem value="siauliu">Šiaulių bankas</MenuItem>
              <MenuItem value="revolut">Revolut</MenuItem>
            </TextField>

            {uploading && (
              <Box sx={{ mt: 1 }}>
                <LinearProgress />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                  Apdorojama ir susiejama su sąskaitomis...
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setUploadDialog(false); setSelectedFile(null); setSelectedBank(''); }} disabled={uploading}>
            Atšaukti
          </Button>
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            startIcon={uploading ? <CircularProgress size={16} /> : <UploadIcon />}
          >
            Importuoti
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} disableScrollLock>
        <DialogTitle>Ištrinti banko išrašą?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Bus ištrintos visos importuotos operacijos ir jų susiejimai su sąskaitomis.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Atšaukti</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Ištrinti</Button>
        </DialogActions>
      </Dialog>

      {/* ── Re-match confirmation ── */}
      <Dialog open={!!reMatchId} onClose={() => setReMatchId(null)} disableScrollLock>
        <DialogTitle>Pakartotinis susiejimas</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Bus iš naujo atliktas mokėjimų susiejimas su sąskaitomis šiam banko išrašui.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Nepatvirtinti (laukiantys) susiejimai bus atšaukti ir sukurti iš naujo.
            Jau patvirtinti ir automatiniai susiejimai nebus pakeisti.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReMatchId(null)}>Atšaukti</Button>
          <Button variant="contained" onClick={handleReMatch}>Paleisti iš naujo</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snack.open}
        autoHideDuration={5000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.severity} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};


// ── Sub-components ──

const StatCard = ({ icon, label, value, color, subtitle }) => (
  <Paper
    variant="outlined"
    sx={{
      px: 2, py: 1.5, borderRadius: 2,
      display: 'flex', alignItems: 'center', gap: 1.5,
      minWidth: 140, flex: '1 1 0',
    }}
  >
    {icon}
    <Box>
      <Typography fontWeight={700} fontSize={20} lineHeight={1.2} color={color || 'text.primary'}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 10, lineHeight: 1.2 }}>
          {subtitle}
        </Typography>
      )}
    </Box>
  </Paper>
);

const MobileStatementCard = ({ stmt, reMatchLoading, onReMatch, onDelete }) => {
  const bankCfg = BANK_CONFIG[stmt.bank_name] || BANK_CONFIG.other;
  const stsCfg = STATUS_CONFIG[stmt.status] || STATUS_CONFIG.uploaded;
  const incoming = stmt.credit_entries || 0;
  const outgoing = stmt.debit_entries || 0;

  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Box>
          <Chip
            label={bankCfg.label} size="small"
            sx={{ backgroundColor: bankCfg.color, color: '#fff', fontWeight: 600, fontSize: 11, mb: 0.5 }}
          />
          <Typography fontSize={12} color="text.secondary" sx={{ mt: 0.25 }}>
            {stmt.original_filename || '—'}
          </Typography>
        </Box>
        <Chip label={stsCfg.label} color={stsCfg.color} size="small" variant="outlined" sx={{ fontSize: 11, height: 22 }} />
      </Box>

      <Typography variant="body2" color="text.secondary" fontSize={12} sx={{ mb: 1 }}>
        {fmtDate(stmt.period_from)} – {fmtDate(stmt.period_to)}
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="caption">
          Įrašai: <strong>{stmt.total_entries || 0}</strong>
          <Typography component="span" variant="caption" color="text.secondary"> (Įpl. {incoming} · Išl. {outgoing})</Typography>
        </Typography>
        <Typography variant="caption" color="success.main">Susieta: <strong>{stmt.auto_matched_count || 0}</strong></Typography>
        <Typography variant="caption" color="warning.main">Laukia: <strong>{stmt.likely_matched_count || 0}</strong></Typography>
        <Typography variant="caption">Nesusieta: <strong>{stmt.unmatched_count || 0}</strong></Typography>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
        {stmt.status === 'processed' && (
          <Tooltip title="Pakartotinis susiejimas">
            <IconButton size="small" onClick={() => onReMatch(stmt.id)} disabled={reMatchLoading === stmt.id}>
              {reMatchLoading === stmt.id ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
        {stmt.status === 'error' && (
          <Tooltip title="Ištrinti">
            <IconButton size="small" color="error" onClick={() => onDelete(stmt.id)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Paper>
  );
};

export default BankStatementsPage;