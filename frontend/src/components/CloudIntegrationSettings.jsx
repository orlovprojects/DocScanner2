import { useEffect, useState, useCallback } from "react";
import { api } from "../api/endpoints";
import {
  Box, Paper, Typography, Button, TextField, IconButton, Tooltip, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress,
  Alert, Divider, Collapse, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, MenuItem,
} from "@mui/material";
import CloudIcon from "@mui/icons-material/Cloud";
import GoogleIcon from "@mui/icons-material/Google";
import FolderIcon from "@mui/icons-material/Folder";
import ShareIcon from "@mui/icons-material/Share";
import ForwardToInboxIcon from '@mui/icons-material/ForwardToInbox';
import SyncIcon from "@mui/icons-material/Sync";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

export default function CloudIntegrationSettings() {
  const [connections, setConnections] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Naujo kliento dialogas
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientCode, setNewClientCode] = useState("");
  const [newClientProvider, setNewClientProvider] = useState("");
  const [newClientLoading, setNewClientLoading] = useState(false);
  const [newClientError, setNewClientError] = useState(null);

  // Bendrinimo dialogas
  const [shareOpen, setShareOpen] = useState(false);
  const [shareFolder, setShareFolder] = useState(null);
  const [shareEmail, setShareEmail] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [shareResult, setShareResult] = useState(null);

  const [expanded, setExpanded] = useState({});

  // ─── Load data ───

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [c, cl] = await Promise.all([
        api.get("/cloud/connections/"),
        api.get("/cloud/clients/"),
      ]);
      setConnections(c.data || []);
      setClients(cl.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [loadData]);

  const getConn = (p) => connections.find((c) => c.provider === p && c.is_active);
  const hasGoogle = !!getConn("google_drive");
  const hasDropbox = !!getConn("dropbox");
  const hasAny = hasGoogle || hasDropbox;

  const activeConnections = connections.filter((c) => c.is_active);

  // ─── OAuth ───

  const connectProvider = async (endpoint) => {
    try {
      const { data } = await api.get(endpoint);
      window.location.href = data.auth_url;
    } catch (e) {
      console.error(e);
    }
  };

  const disconnect = async (provider) => {
    if (!window.confirm("Ar tikrai norite atjungti?")) return;
    try {
      await api.post(`/cloud/connections/${provider}/disconnect/`);
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  // ─── Klientai ───

  const previewFolderName = (name) => {
    if (!name.trim()) return "";
    const safe = name.trim().replace(/[^a-zA-Z0-9\s\-_\u0080-\uFFFF]/g, "").replace(/\s+/g, "_");
    return `${safe}_DokSkenas`;
  };

  const providerLabel = (p) => (p === "google_drive" ? "Google Drive" : p === "dropbox" ? "Dropbox" : p);

  const openNewClientDialog = () => {
    setNewClientName("");
    setNewClientCode("");
    setNewClientError(null);
    // Автовыбор если подключён только один провайдер
    if (activeConnections.length === 1) {
      setNewClientProvider(activeConnections[0].provider);
    } else {
      setNewClientProvider("");
    }
    setNewClientOpen(true);
  };

  const createClient = async () => {
    if (!newClientName.trim()) return;
    if (!newClientProvider) {
      setNewClientError("Pasirinkite Google Drive ar Dropbox");
      return;
    }
    setNewClientLoading(true);
    setNewClientError(null);
    try {
      await api.post("/cloud/clients/", {
        name: newClientName.trim(),
        company_code: newClientCode.trim(),
        provider: newClientProvider,
      });
      setNewClientOpen(false);
      setNewClientName("");
      setNewClientCode("");
      setNewClientProvider("");
      loadData();
    } catch (e) {
      setNewClientError(e.response?.data?.error || "Klaida kuriant klientą");
    } finally {
      setNewClientLoading(false);
    }
  };

  const deleteClient = async (id) => {
    if (!window.confirm("Ar tikrai norite pašalinti?")) return;
    try {
      await api.delete(`/cloud/clients/${id}/`);
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  // ─── Bendrinimas ───

  const openShare = (folder) => {
    setShareFolder(folder);
    setShareEmail("");
    setShareResult(null);
    setShareOpen(true);
  };

  const doShare = async () => {
    if (!shareEmail.trim() || !shareFolder) return;
    setShareLoading(true);
    setShareResult(null);
    try {
      await api.post("/cloud/folders/share/", {
        folder_id: shareFolder.id,
        email: shareEmail.trim(),
      });
      setShareResult("success");
      loadData();
    } catch (e) {
      setShareResult("error");
    } finally {
      setShareLoading(false);
    }
  };

  const syncFolder = async (folderId) => {
    try {
      await api.post(`/cloud/folders/${folderId}/sync/`);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>;
  }

  return (
    <Box>
      {/* ═══ Debesų paskyros ═══ */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Prijunkite savo Google Drive arba Dropbox. Sistema automatiškai sukurs aplankus jūsų klientams, iš kurių sistema 
        automatiškai pasiims naujus dokumentus ir įkels į jūsų "Iš klientų" puslapį.
      </Typography>

      <Box display="flex" gap={2} flexWrap="wrap" mb={4}>
        {/* Google Drive */}
        <Paper sx={{ p: 2, minWidth: 260, border: hasGoogle ? "2px solid #4caf50" : "1px solid #ddd" }}>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <GoogleIcon color={hasGoogle ? "success" : "disabled"} />
            <Typography variant="subtitle1" fontWeight={600}>Google Drive</Typography>
            {hasGoogle && <CheckCircleIcon color="success" fontSize="small" />}
          </Box>
          {hasGoogle ? (
            <>
              <Typography variant="body2" color="text.secondary" mb={1}>
                {getConn("google_drive")?.account_email || "Prijungta"}
              </Typography>
              <Button size="small" color="error" startIcon={<LinkOffIcon />}
                onClick={() => disconnect("google_drive")}>Atjungti</Button>
            </>
          ) : (
            <Button variant="contained" size="small" startIcon={<CloudIcon />}
              onClick={() => connectProvider("/cloud/google/auth/")}>
              Prijungti
            </Button>
          )}
        </Paper>

        {/* Dropbox */}
        <Paper sx={{ p: 2, minWidth: 260, border: hasDropbox ? "2px solid #4caf50" : "1px solid #ddd" }}>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <CloudIcon color={hasDropbox ? "success" : "disabled"} />
            <Typography variant="subtitle1" fontWeight={600}>Dropbox</Typography>
            {hasDropbox && <CheckCircleIcon color="success" fontSize="small" />}
          </Box>
          {hasDropbox ? (
            <>
              <Typography variant="body2" color="text.secondary" mb={1}>
                {getConn("dropbox")?.account_email || "Prijungta"}
              </Typography>
              <Button size="small" color="error" startIcon={<LinkOffIcon />}
                onClick={() => disconnect("dropbox")}>Atjungti</Button>
            </>
          ) : (
            <Button variant="contained" size="small" startIcon={<CloudIcon />}
              onClick={() => connectProvider("/cloud/dropbox/auth/")}>
              Prijungti
            </Button>
          )}
        </Paper>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* ═══ Klientai ═══ */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography variant="h6">Klientai</Typography>
        <Button variant="contained" startIcon={<AddIcon />}
          onClick={openNewClientDialog} disabled={!hasAny}>
          Naujas klientas
        </Button>
      </Box>

      {!hasAny && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Pirmiausia prijunkite Google Drive arba Dropbox paskyrą.
        </Alert>
      )}

      {clients.length === 0 && hasAny && (
        <Paper sx={{ p: 3, textAlign: "center" }}>
          <Typography color="text.secondary">
            Pridėkite klientą, aplankas Google Drive ar Dropbox bus sukurtas automatiškai.
          </Typography>
        </Paper>
      )}

      {clients.map((client) => (
        <Paper key={client.id} sx={{ mb: 1.5, overflow: "hidden" }}>
          <Box
            sx={{
              px: 2, py: 1.5, display: "flex", alignItems: "center",
              justifyContent: "space-between", cursor: "pointer",
              "&:hover": { bgcolor: "action.hover" },
            }}
            onClick={() => setExpanded(p => ({ ...p, [client.id]: !p[client.id] }))}
          >
            <Box display="flex" alignItems="center" gap={1.5}>
              <FolderIcon color="primary" />
              <Box>
                <Typography variant="subtitle2" fontWeight={600}>{client.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {client.folder_name}
                  {client.company_code && ` · ${client.company_code}`}
                </Typography>
              </Box>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              {client.folders?.map((f) => (
                <Chip key={f.id} label={f.provider_display} size="small"
                  color="success" variant="outlined" sx={{ fontSize: 11 }} />
              ))}
              {expanded[client.id] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </Box>
          </Box>

          <Collapse in={expanded[client.id]}>
            <Divider />
            <Box px={2} py={2}>
              {client.folders?.length > 0 ? (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Debesis</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Bendrinta su</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Pask. sinchronizavimas</TableCell>
                        <TableCell align="right" />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {client.folders.map((f) => (
                        <TableRow key={f.id}>
                          <TableCell>
                            <Chip label={f.provider_display} size="small" sx={{ fontSize: 12 }} />
                          </TableCell>
                          <TableCell>
                            {f.shared_with_emails?.length > 0
                              ? f.shared_with_emails.map((e) => (
                                  <Chip key={e} label={e} size="small" variant="outlined"
                                    sx={{ mr: 0.5, fontSize: 11 }} />
                                ))
                              : <Typography variant="body2" color="text.disabled" fontSize={12}>—</Typography>
                            }
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontSize={12}>
                              {f.last_polled_at ? new Date(f.last_polled_at).toLocaleString("lt-LT") : "—"}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Tooltip title="Pakviesti klientą">
                              <IconButton size="small" onClick={() => openShare(f)}>
                                <ForwardToInboxIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Sinchronizuoti">
                              <IconButton size="small" onClick={() => syncFolder(f.id)}>
                                <SyncIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Aplankai bus sukurti susiejus DokSkeną su Google Drive/Dropbox paskyra.
                </Typography>
              )}

              <Box display="flex" justifyContent="flex-end" mt={1.5}>
                <Button size="small" color="error" startIcon={<DeleteIcon />}
                  onClick={() => deleteClient(client.id)}>
                  Pašalinti
                </Button>
              </Box>
            </Box>
          </Collapse>
        </Paper>
      ))}

      {/* ═══ Dialogs ═══ */}

      {/* Naujas klientas */}
      <Dialog open={newClientOpen} onClose={() => !newClientLoading && setNewClientOpen(false)}
        maxWidth="sm" fullWidth>
        <DialogTitle>Naujas klientas</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Aplankas bus sukurtas pasirinktame debesyje. Tą patį klientą galite pridėti ir kitame debesyje vėliau.
          </Typography>
          <TextField autoFocus fullWidth label="Kliento pavadinimas"
            placeholder="pvz. UAB ManoImonė"
            value={newClientName} onChange={(e) => setNewClientName(e.target.value)}
            sx={{ mb: 2 }}
            helperText={newClientName.trim() ? `Aplankas: ${previewFolderName(newClientName)}` : ""}
          />
          <TextField fullWidth label="Įmonės kodas (neprivaloma)"
            value={newClientCode} onChange={(e) => setNewClientCode(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            select
            fullWidth
            label="Google Drive ar Dropbox"
            value={newClientProvider}
            onChange={(e) => setNewClientProvider(e.target.value)}
            helperText="Pasirinkite, kuriame debesyje sukurti aplanką"
          >
            {activeConnections.map((c) => (
              <MenuItem key={c.provider} value={c.provider}>
                {providerLabel(c.provider)}
              </MenuItem>
            ))}
          </TextField>
          {newClientError && <Alert severity="error" sx={{ mt: 2 }}>{newClientError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewClientOpen(false)} disabled={newClientLoading}>Atšaukti</Button>
          <Button onClick={createClient} variant="contained"
            disabled={!newClientName.trim() || !newClientProvider || newClientLoading}
            startIcon={newClientLoading ? <CircularProgress size={16} /> : <AddIcon />}>
            Sukurti
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bendrinimas */}
      <Dialog open={shareOpen} onClose={() => !shareLoading && setShareOpen(false)}
        maxWidth="sm" fullWidth>
        <DialogTitle>Pakviesti klientą į aplanką</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Klientas gaus pakvietimą ir galės kelti dokumentus į bendrą aplanką.
          </Typography>
          <TextField autoFocus fullWidth type="email" label="Kliento el. paštas"
            placeholder="klientas@gmail.com"
            value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} />
          {shareResult === "success" && <Alert severity="success" sx={{ mt: 2 }}>Sėkmingai išsiųstą!</Alert>}
          {shareResult === "error" && <Alert severity="error" sx={{ mt: 2 }}>Pakvietimas nepavyko</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShareOpen(false)}>
            {shareResult === "success" ? "Uždaryti" : "Atšaukti"}
          </Button>
          {shareResult !== "success" && (
            <Button onClick={doShare} variant="contained"
              disabled={!shareEmail.trim() || shareLoading}
              startIcon={shareLoading ? <CircularProgress size={16} /> : <ForwardToInboxIcon />}>
              Pakviesti klientą
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}