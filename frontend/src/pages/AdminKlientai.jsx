import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import {
  Box,
  Button,
  Typography,
  Alert,
  LinearProgress,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Stack,
  IconButton,
  Tooltip,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { api } from "../api/endpoints";
import { ACCOUNTING_PROGRAMS } from "../page_elements/AccountingPrograms";

export default function AdminUsers() {
  const [me, setMe] = useState(null);
  const [meLoaded, setMeLoaded] = useState(false);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  // 1) грузим профиль
  useEffect(() => {
    api
      .get("/profile/", { withCredentials: true })
      .then((res) => setMe(res.data))
      .catch(() => setMe(null))
      .finally(() => setMeLoaded(true));
  }, []);

  // 2) грузим пользователей (для суперюзера)
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/users/", { withCredentials: true });
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Nepavyko gauti vartotojų:", e);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (meLoaded && me?.is_superuser) fetchUsers();
  }, [meLoaded]);

  // форматтеры
  const fmtDateTime = (iso) =>
    iso
      ? new Date(iso).toLocaleString("lt-LT", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  const fmtCredits = (v) => {
    if (v === null || v === undefined) return "0.00";
    const num = typeof v === "string" ? Number(v) : v;
    if (Number.isNaN(num)) return String(v);
    return num.toFixed(2);
  };

  const programLabel = (value) =>
    ACCOUNTING_PROGRAMS.find((p) => p.value === value)?.label || value || "—";

  const rows = useMemo(() => {
    return [...(users || [])].sort((a, b) => {
      const da = a?.date_joined ? new Date(a.date_joined).getTime() : 0;
      const db = b?.date_joined ? new Date(b.date_joined).getTime() : 0;
      return db - da;
    });
  }, [users]);

  if (meLoaded && !me?.is_superuser) {
    return (
      <Box 
        display="flex" 
        alignItems="center" 
        justifyContent="center" 
        minHeight="70vh"
        px={3}
      >
        <Alert severity="error" sx={{ maxWidth: 500 }}>
          Neturite prieigos prie administratoriaus suvestinės.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1600, mx: "auto", px: { xs: 2, sm: 4 }, py: 5 }}>
      <Helmet>
        <title>Vartotojai (Admin)</title>
      </Helmet>

      {/* Header */}
      <Stack 
        direction="row" 
        alignItems="center" 
        justifyContent="space-between" 
        mb={4}
        flexWrap="wrap"
        gap={2}
      >
        <Stack direction="row" alignItems="center" gap={2}>
          <Typography variant="h4" fontWeight={300} letterSpacing={-0.5}>
            Vartotojai
          </Typography>
          <Chip 
            label={rows.length} 
            size="medium"
            sx={{ 
              fontWeight: 500,
              bgcolor: "primary.50",
              color: "primary.main"
            }}
          />
        </Stack>
        
        <Tooltip title="Atnaujinti duomenis">
          <IconButton 
            onClick={fetchUsers} 
            disabled={loading}
            sx={{ 
              border: "1px solid",
              borderColor: "divider",
              "&:hover": { bgcolor: "action.hover" }
            }}
          >
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {loading && <LinearProgress sx={{ mb: 3, borderRadius: 1 }} />}

      {/* Table */}
      <Paper 
        elevation={0} 
        sx={{ 
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          overflow: "hidden"
        }}
      >
        <TableContainer sx={{ maxHeight: "calc(100vh - 250px)" }}>
          <Table stickyHeader size="medium">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, bgcolor: "grey.50", py: 2 }}>ID</TableCell>
                <TableCell sx={{ fontWeight: 600, bgcolor: "grey.50", minWidth: 200 }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 600, bgcolor: "grey.50", minWidth: 150 }}>Registruotas</TableCell>
                <TableCell sx={{ fontWeight: 600, bgcolor: "grey.50", minWidth: 100 }}>Kreditai</TableCell>
                <TableCell sx={{ fontWeight: 600, bgcolor: "grey.50", minWidth: 180 }}>Stripe ID</TableCell>
                <TableCell sx={{ fontWeight: 600, bgcolor: "grey.50", minWidth: 180 }}>Apskaitos programa</TableCell>
                <TableCell sx={{ fontWeight: 600, bgcolor: "grey.50", minWidth: 180 }}>Įmonė</TableCell>
                <TableCell sx={{ fontWeight: 600, bgcolor: "grey.50", minWidth: 120 }}>Įmonės kodas</TableCell>
                <TableCell sx={{ fontWeight: 600, bgcolor: "grey.50", minWidth: 120 }}>View Mode</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((u, idx) => (
                <TableRow 
                  key={u.id} 
                  hover
                  sx={{
                    "&:last-child td": { borderBottom: 0 },
                    bgcolor: idx % 2 === 0 ? "transparent" : "grey.50"
                  }}
                >
                  <TableCell sx={{ color: "text.secondary", fontWeight: 500 }}>
                    {u.id}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>
                    {u.email || "—"}
                  </TableCell>
                  <TableCell sx={{ color: "text.secondary", fontSize: "0.875rem" }}>
                    {fmtDateTime(u.date_joined)}
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={fmtCredits(u.credits)}
                      size="small"
                      sx={{ 
                        fontWeight: 600,
                        minWidth: 60,
                        bgcolor: parseFloat(fmtCredits(u.credits)) > 0 ? "success.50" : "grey.100",
                        color: parseFloat(fmtCredits(u.credits)) > 0 ? "success.dark" : "text.secondary"
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ 
                    color: u.stripe_customer_id ? "text.primary" : "text.disabled",
                    fontFamily: "monospace",
                    fontSize: "0.875rem"
                  }}>
                    {u.stripe_customer_id || "—"}
                  </TableCell>
                  <TableCell sx={{ color: "text.secondary" }}>
                    {programLabel(u.default_accounting_program)}
                  </TableCell>
                  <TableCell sx={{ color: "text.secondary" }}>
                    {u.company_name || "—"}
                  </TableCell>
                  <TableCell sx={{ 
                    color: "text.secondary",
                    fontFamily: "monospace",
                    fontSize: "0.875rem"
                  }}>
                    {u.company_code || "—"}
                  </TableCell>
                  <TableCell sx={{ color: "text.secondary" }}>
                    {u.view_mode || "—"}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell 
                    colSpan={9} 
                    align="center"
                    sx={{ py: 8, color: "text.disabled" }}
                  >
                    <Typography variant="body1">
                      Duomenų nėra
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}