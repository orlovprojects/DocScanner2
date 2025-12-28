import { useEffect, useState } from "react";
import { api } from "../api/endpoints";
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  IconButton,
  Tooltip,
  Chip,
  Button,
  CircularProgress,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningIcon from "@mui/icons-material/Warning";

import FailuPreviewDialog from "../page_elements/FailuPreviewDialog";

export default function IsKlientu() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [selectedIds, setSelectedIds] = useState([]);

  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [menuRowId, setMenuRowId] = useState(null);

  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [promoteInProgress, setPromoteInProgress] = useState(false);
  const [promoteError, setPromoteError] = useState(null);
  const [promoteCount, setPromoteCount] = useState(0);

  // preview dialog
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState(null);

  // ==== helpers ====

  const loadInbox = async () => {
    setLoading(true);
    try {
      const resp = await api.get("/web/mobile-inbox/");
      setRows(resp.data || []);
    } catch (e) {
      console.error("Failed to load mobile inbox", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInbox();
  }, []);

  const formatDate = (isoString) => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      return d.toLocaleString("lt-LT");
    } catch {
      return isoString;
    }
  };

  // ==== selection ====

  const handleToggleRow = (id) => () => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleToggleAll = () => {
    if (selectedIds.length === rows.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(rows.map((r) => r.id));
    }
  };

  const allSelected = rows.length > 0 && selectedIds.length === rows.length;
  const someSelected =
    selectedIds.length > 0 && selectedIds.length < rows.length;

  // ==== menu ====

  const handleMenuOpen = (event, rowId) => {
    setMenuAnchorEl(event.currentTarget);
    setMenuRowId(rowId);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setMenuRowId(null);
  };

  // ==== delete ====

  const handleDelete = async (ids) => {
    if (!ids || ids.length === 0) return;
    try {
      await api.delete("/web/mobile-inbox/bulk-delete/", {
        data: { ids },
      });
      await loadInbox();
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
    } catch (e) {
      console.error("Failed to delete mobile inbox docs", e);
      alert("Įvyko klaida trinant failus iš klientų.");
    }
  };

  const handleDeleteSingle = async (id) => {
    handleMenuClose();
    await handleDelete([id]);
  };

  // ==== promote / skaitmenizavimas ====

  const openPromoteDialog = (count) => {
    setPromoteCount(count);
    setPromoteError(null);
    setPromoteInProgress(true);
    setPromoteDialogOpen(true);
  };

  const closePromoteDialog = () => {
    setPromoteDialogOpen(false);
    setPromoteInProgress(false);
    setPromoteError(null);
    setPromoteCount(0);
  };

  const doPromote = async (ids) => {
    if (!ids || ids.length === 0) return;
    openPromoteDialog(ids.length);

    try {
      await api.post("/web/mobile-inbox/promote/", { ids });
      await loadInbox();
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
      setPromoteInProgress(false);
    } catch (e) {
      console.error("Failed to promote mobile docs", e);
      setPromoteError("Įvyko klaida perkeliant failus į suvestinę.");
      setPromoteInProgress(false);
    }
  };

  const handlePromoteSelected = () => {
    if (selectedIds.length === 0) return;
    doPromote(selectedIds);
  };

  const handlePromoteSingle = (id) => {
    handleMenuClose();
    doPromote([id]);
  };

  // ==== preview ====

  const handlePreview = (row) => {
    if (!row?.preview_url && !Array.isArray(row?.preview_urls)) return;
    setPreviewRow(row);
    setPreviewOpen(true);
  };

  const handlePreviewClose = () => {
    setPreviewOpen(false);
    setPreviewRow(null);
  };

  return (
    <Box px={6} py={4}>
      {/* Верхняя панель */}
      <Box
        sx={{
          mb: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Box display="flex" alignItems="center" gap={1}>
          <Button
            variant="contained"
            size="small"
            disabled={selectedIds.length === 0 || loading}
            onClick={handlePromoteSelected}
          >
            Skaitmenizuoti pasirinktus
          </Button>

          {selectedIds.length > 0 && (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Pasirinkta: {selectedIds.length}
            </Typography>
          )}
        </Box>

        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Iš viso failų: {rows.length}
        </Typography>
      </Box>

      <TableContainer component={Paper} sx={{ maxHeight: 580 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={someSelected}
                  checked={allSelected}
                  onChange={handleToggleAll}
                  inputProps={{ "aria-label": "select all" }}
                />
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Failas</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Siuntėjas</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Siuntimo tipas</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Data</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }} />
            </TableRow>
          </TableHead>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Nėra naujų failų iš klientų
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const isSelected = selectedIds.includes(row.id);
                const senderLabel = row.sender_label;
                const senderEmail = row.sender_email;

                return (
                  <TableRow key={row.id} hover>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={isSelected}
                        onChange={handleToggleRow(row.id)}
                        inputProps={{ "aria-label": "select row" }}
                      />
                    </TableCell>

                    <TableCell
                      sx={{
                        cursor:
                          row.preview_url || row.preview_urls
                            ? "pointer"
                            : "default",
                        color:
                          row.preview_url || row.preview_urls
                            ? "primary.main"
                            : "inherit",
                        maxWidth: 260,
                      }}
                      onClick={() => handlePreview(row)}
                    >
                      <Tooltip title={row.original_filename || ""}>
                        <span
                          style={{
                            display: "inline-block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: "100%",
                          }}
                        >
                          {row.original_filename || "—"}
                        </span>
                      </Tooltip>
                    </TableCell>

                    <TableCell>
                      {senderLabel ? (
                        <>
                          <Typography variant="body2">{senderLabel}</Typography>
                          {senderEmail && (
                            <Typography
                              variant="caption"
                              sx={{ color: "text.secondary" }}
                            >
                              {senderEmail}
                            </Typography>
                          )}
                        </>
                      ) : senderEmail ? (
                        <Typography variant="body2">{senderEmail}</Typography>
                      ) : (
                        <Typography
                          variant="body2"
                          sx={{ color: "text.disabled" }}
                        >
                          Nenurodytas
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      <Chip
                        label="Mob"
                        size="small"
                        sx={{ fontSize: 12, height: 22 }}
                      />
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2">
                        {formatDate(row.created_at)}
                      </Typography>
                    </TableCell>

                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuOpen(e, row.id)}
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Меню по 3 точкам */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem
          onClick={() => {
            if (menuRowId != null) {
              handlePromoteSingle(menuRowId);
            }
          }}
        >
          Skaitmenizuoti
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuRowId != null) {
              handleDeleteSingle(menuRowId);
            }
          }}
        >
          Ištrinti
        </MenuItem>
      </Menu>

      {/* Диалог прогресса скaitmenizavimo */}
      <Dialog
        open={promoteDialogOpen}
        onClose={promoteInProgress ? null : closePromoteDialog}
      >
        <DialogTitle>Skaitmenizavimas</DialogTitle>
        <DialogContent sx={{ pt: 2, minWidth: 320 }}>
          {promoteInProgress && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                py: 1,
              }}
            >
              <CircularProgress size={24} />
              <Typography variant="body2">
                Failai perkeliami į suvestinę ir ruošiami skaitmenizavimui...
              </Typography>
            </Box>
          )}

          {!promoteInProgress && !promoteError && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                py: 1,
              }}
            >
              <CheckCircleIcon color="success" />
              <Typography variant="body2">
                {promoteCount === 1
                  ? "1 failas buvo perkeltas į suvestinę и skaitmenizuojamas."
                  : `${promoteCount} failai buvo perkelti į suvestinę и skaitmenizuojami.`}
              </Typography>
            </Box>
          )}

          {!promoteInProgress && promoteError && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                py: 1,
              }}
            >
              <WarningIcon color="error" />
              <Typography variant="body2" sx={{ color: "error.main" }}>
                {promoteError}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {!promoteInProgress && (
            <Button onClick={closePromoteDialog}>Uždaryti</Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Новый диалог превью файлов */}
      <FailuPreviewDialog
        open={previewOpen}
        onClose={handlePreviewClose}
        file={previewRow}
      />
    </Box>
  );
}
