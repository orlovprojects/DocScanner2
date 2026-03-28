import { useEffect, useState, useCallback, useRef } from "react";
import { Helmet } from "react-helmet";
import {
  Box,
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
import PaymentIcon from "@mui/icons-material/Payment";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import HourglassDisabledIcon from "@mui/icons-material/HourglassDisabled";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import { api } from "../api/endpoints";
import { ACCOUNTING_PROGRAMS } from "../page_elements/AccountingPrograms";

const SkaitmenizavimasCell = ({ lastPaymentDate }) => {
  if (!lastPaymentDate) {
    return <Typography sx={{ color: "text.disabled", fontSize: 13 }}>—</Typography>;
  }

  const date = new Date(lastPaymentDate);
  const formatted = date.toLocaleDateString("lt-LT", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return (
    <Tooltip title={`Paskutinis mokėjimas: ${formatted}`} arrow>
      <PaymentIcon sx={{ color: "success.main", fontSize: 22 }} />
    </Tooltip>
  );
};

const IsrasymasCell = ({ status }) => {
  if (!status) {
    return <Typography sx={{ color: "text.disabled", fontSize: 13 }}>—</Typography>;
  }

  const config = {
    trial_active: {
      icon: <HourglassEmptyIcon sx={{ fontSize: 20 }} />,
      color: "info.main",
      label: "Bandomasis pradėtas",
    },
    trial_expired: {
      icon: <HourglassDisabledIcon sx={{ fontSize: 20 }} />,
      color: "warning.main",
      label: "Bandomasis pasibaigęs",
    },
    monthly: {
      icon: <CalendarTodayIcon sx={{ fontSize: 20 }} />,
      color: "success.main",
      label: "Mėnesinis planas",
    },
    yearly: {
      icon: <CalendarMonthIcon sx={{ fontSize: 20 }} />,
      color: "success.dark",
      label: "Metinis planas",
    },
  };

  const cfg = config[status];
  if (!cfg) return <Typography sx={{ color: "text.disabled" }}>—</Typography>;

  return (
    <Tooltip title={cfg.label} arrow>
      <Box sx={{ color: cfg.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {cfg.icon}
      </Box>
    </Tooltip>
  );
};

const IsleistaCell = ({ totalSpent }) => {
  if (!totalSpent || totalSpent === 0) {
    return <Typography sx={{ color: "text.disabled", fontSize: 13 }}>—</Typography>;
  }

  return (
    <Chip
      label={`€${totalSpent.toFixed(2)}`}
      size="small"
      sx={{
        fontWeight: 600,
        bgcolor: "primary.50",
        color: "primary.dark",
        minWidth: 70,
      }}
    />
  );
};

export default function AdminUsers() {
  const [me, setMe] = useState(null);
  const [meLoaded, setMeLoaded] = useState(false);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);

  const tableContainerRef = useRef(null);

  useEffect(() => {
    api
      .get("/profile/", { withCredentials: true })
      .then((res) => setMe(res.data))
      .catch(() => setMe(null))
      .finally(() => setMeLoaded(true));
  }, []);

  const extractCursor = (nextUrl) => {
    if (!nextUrl) return null;
    try {
      const url = new URL(nextUrl, window.location.origin);
      return url.searchParams.get("cursor");
    } catch {
      return null;
    }
  };

  const buildUrl = useCallback((cursor = null) => {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    const qs = params.toString();
    return `/admin/users/${qs ? `?${qs}` : ""}`;
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(buildUrl(), { withCredentials: true });
      setUsers(data.results || []);
      setNextCursor(extractCursor(data.next));
    } catch (e) {
      console.error("Nepavyko gauti vartotojų:", e);
      setUsers([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);
    try {
      const { data } = await api.get(buildUrl(nextCursor), { withCredentials: true });
      setUsers((prev) => [...prev, ...(data.results || [])]);
      setNextCursor(extractCursor(data.next));
    } catch (e) {
      console.error("Nepavyko įkelti daugiau:", e);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, buildUrl]);

  useEffect(() => {
    if (meLoaded && me?.is_superuser) fetchUsers();
  }, [meLoaded, me?.is_superuser, fetchUsers]);

  // Scroll-based infinite loading
  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (loading || loadingMore || !nextCursor) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop - clientHeight < 300) {
        loadMore();
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [loading, loadingMore, nextCursor, loadMore]);

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

  if (meLoaded && !me?.is_superuser) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" minHeight="70vh" px={3}>
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

      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={4} flexWrap="wrap" gap={2}>
        <Stack direction="row" alignItems="center" gap={2}>
          <Typography variant="h4" fontWeight={300} letterSpacing={-0.5}>
            Vartotojai
          </Typography>
          <Chip
            label={`${users.length}${nextCursor ? "+" : ""}`}
            size="medium"
            sx={{ fontWeight: 500, bgcolor: "primary.50", color: "primary.main" }}
          />
        </Stack>

        <Tooltip title="Atnaujinti duomenis">
          <IconButton
            onClick={fetchUsers}
            disabled={loading}
            sx={{ border: "1px solid", borderColor: "divider", "&:hover": { bgcolor: "action.hover" } }}
          >
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {loading && <LinearProgress sx={{ mb: 3, borderRadius: 1 }} />}

      <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
        <TableContainer ref={tableContainerRef} sx={{ maxHeight: "calc(100vh - 250px)" }}>
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
                <TableCell sx={{ fontWeight: 600, bgcolor: "grey.50", minWidth: 80, textAlign: "center" }}>
                  <Tooltip title="Skaitmenizavimas" arrow>
                    <ReceiptLongIcon sx={{ fontSize: 20, color: "text.secondary" }} />
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ fontWeight: 600, bgcolor: "grey.50", minWidth: 80, textAlign: "center" }}>
                  Išrašymas
                </TableCell>
                <TableCell sx={{ fontWeight: 600, bgcolor: "grey.50", minWidth: 90, textAlign: "center" }}>
                  Išleista
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u, idx) => (
                <TableRow
                  key={u.id}
                  hover
                  sx={{
                    "&:last-child td": { borderBottom: 0 },
                    bgcolor: idx % 2 === 0 ? "transparent" : "grey.50",
                  }}
                >
                  <TableCell sx={{ color: "text.secondary", fontWeight: 500 }}>{u.id}</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>{u.email || "—"}</TableCell>
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
                        color: parseFloat(fmtCredits(u.credits)) > 0 ? "success.dark" : "text.secondary",
                      }}
                    />
                  </TableCell>
                  <TableCell
                    sx={{
                      color: u.stripe_customer_id ? "text.primary" : "text.disabled",
                      fontFamily: "monospace",
                      fontSize: "0.875rem",
                    }}
                  >
                    {u.stripe_customer_id || "—"}
                  </TableCell>
                  <TableCell sx={{ color: "text.secondary" }}>
                    {programLabel(u.default_accounting_program)}
                  </TableCell>
                  <TableCell sx={{ color: "text.secondary" }}>{u.company_name || "—"}</TableCell>
                  <TableCell sx={{ color: "text.secondary", fontFamily: "monospace", fontSize: "0.875rem" }}>
                    {u.company_code || "—"}
                  </TableCell>

                  <TableCell sx={{ textAlign: "center" }}>
                    <SkaitmenizavimasCell lastPaymentDate={u.last_payment_date} />
                  </TableCell>

                  <TableCell sx={{ textAlign: "center" }}>
                    <IsrasymasCell status={u.inv_subscription_status} />
                  </TableCell>

                  <TableCell sx={{ textAlign: "center" }}>
                    <IsleistaCell totalSpent={u.total_spent} />
                  </TableCell>
                </TableRow>
              ))}

              {loadingMore && (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 3 }}>
                    <LinearProgress sx={{ maxWidth: 200, mx: "auto", mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Kraunama daugiau...
                    </Typography>
                  </TableCell>
                </TableRow>
              )}

              {!loading && !loadingMore && users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 8, color: "text.disabled" }}>
                    <Typography variant="body1">Duomenų nėra</Typography>
                  </TableCell>
                </TableRow>
              )}

              {!nextCursor && users.length > 0 && !loading && !loadingMore && (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 2, color: "text.disabled" }}>
                    <Typography variant="body2">Visi vartotojai įkelti ({users.length})</Typography>
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