import { useEffect, useState, useCallback } from "react";
import { Helmet } from 'react-helmet';
import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  Divider,
  Paper,
  Stack,
  IconButton,
  Tooltip,
} from "@mui/material";
import Grid from "@mui/material/Grid2";
import {
  Description,
  People,
  TrendingUp,
  CalendarToday,
  Schedule,
  CheckCircle,
  ErrorOutline,
  Percent,
  Refresh,
  Block,
} from "@mui/icons-material";
import { api } from "../api/endpoints";

function DocStatItem({ label, count = 0, errors = 0, highlight = false }) {
  const ok = Math.max((count || 0) - (errors || 0), 0);
  const successRate = count > 0 ? ((ok / count) * 100).toFixed(1) : 0;
  
  return (
    <Box sx={{ py: 1.25 }}>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {label}
      </Typography>
      <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap">
        <Typography
          variant="h5"
          fontWeight={700}
          color={highlight ? "primary.main" : "text.primary"}
        >
          {(count ?? 0).toLocaleString()}
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          color="success"
          icon={<CheckCircle sx={{ fontSize: 16 }} />}
          label={`${ok.toLocaleString()} (${successRate}%)`}
          sx={{ height: 24, fontWeight: 500 }}
        />
        {errors > 0 && (
          <Chip
            size="small"
            variant="outlined"
            color="warning"
            icon={<ErrorOutline sx={{ fontSize: 16 }} />}
            label={errors.toLocaleString()}
            sx={{ 
              height: 24,
              opacity: 0.7,
              '&:hover': { opacity: 1 }
            }}
          />
        )}
      </Stack>
    </Box>
  );
}

function SimpleStatItem({ label, value, color = "primary" }) {
  return (
    <Box sx={{ py: 1.25 }}>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={700} color={`${color}.main`}>
        {value?.toLocaleString?.() ?? value ?? 0}
      </Typography>
    </Box>
  );
}

function StatCard({ title, items, icon: Icon, color = "primary" }) {
  return (
    <Card
      elevation={0}
      sx={{
        height: "100%",
        border: 1,
        borderColor: "divider",
        transition: "all 0.3s ease",
        "&:hover": {
          borderColor: `${color}.main`,
          boxShadow: 2,
          transform: "translateY(-4px)",
        },
      }}
    >
      <CardContent>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 2,
              bgcolor: `${color}.50`,
              color: `${color}.main`,
            }}
          >
            <Icon />
          </Box>
          <Typography variant="h6" fontWeight={700}>
            {title}
          </Typography>
        </Box>
        <Divider sx={{ mb: 2 }} />
        {items}
      </CardContent>
    </Card>
  );
}

function RejectedStatItem({ label, data }) {
  const { rejected = 0, total = 0, pct = 0 } = data || {};
  return (
    <Box textAlign="center">
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" fontWeight={700} color={rejected > 0 ? "error.main" : "text.primary"}>
        {rejected} / {total}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        ({pct.toFixed(2)}%)
      </Typography>
    </Box>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async (useCache = true) => {
    if (useCache) {
      const cached = sessionStorage.getItem("dashboardPrefetch");
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setStats(parsed.data);
        } catch {
          sessionStorage.removeItem("dashboardPrefetch");
        }
      }
    }

    setLoading(true);
    try {
      const { data } = await api.get("/superuser/dashboard-stats/", { withCredentials: true });
      setStats(data);
      setErr(null);
    } catch (e) {
      console.error("Nepavyko gauti statistikos:", e);
      setErr(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats(true);
  }, [fetchStats]);

  const handleRefresh = () => {
    sessionStorage.removeItem("dashboardPrefetch");
    fetchStats(false);
  };

  if (err && !stats) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          Klaida: {String(err)}
        </Alert>
      </Box>
    );
  }

  if (!stats) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress size={60} thickness={4} />
      </Box>
    );
  }

  const docs = stats.documents || {};
  const users = stats.users || {};
  const meta = stats.meta || {};
  const sr = docs.success_rate || {};
  const rej = docs.rejected || {};
  const st = docs.scan_types || {};

  const fmtPct = (v) => (typeof v === "number" ? `${v.toFixed(2)}%` : "0.00%");

  return (
    <Box sx={{ p: 4, bgcolor: "grey.50", minHeight: "100vh" }}>
      <Helmet>
        <title>Analytics</title>
      </Helmet>

      <Paper elevation={0} sx={{ p: 3, mb: 4, borderRadius: 3, border: 1, borderColor: "divider" }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
          <Box>
            <Typography variant="h4" fontWeight={800} gutterBottom>
              Admin'o Valdymo Skydelis
            </Typography>
            <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
              <Chip
                icon={<Schedule />}
                label={`Laiko juosta: ${meta?.timezone || ""}`}
                size="small"
                variant="outlined"
              />
              <Chip
                icon={<CalendarToday />}
                label={`Atnaujinta: ${meta?.generated_at ? new Date(meta.generated_at).toLocaleString("lt-LT") : ""}`}
                size="small"
                variant="outlined"
              />
            </Box>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="Atnaujinti duomenis">
              <IconButton
                onClick={handleRefresh}
                disabled={loading}
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Refresh />
              </IconButton>
            </Tooltip>
            <Chip label="Aktyvus" color="success" sx={{ fontWeight: 700 }} />
          </Stack>
        </Box>
      </Paper>

      <Grid container spacing={3}>
        {/* Documents */}
        <Grid size={{ xs: 12, md: 6 }}>
          <StatCard
            title="Dokumentai"
            icon={Description}
            color="primary"
            items={
              <>
                <DocStatItem
                  label="Šiandien"
                  count={docs?.today?.count}
                  errors={docs?.today?.errors}
                  highlight
                />
                <SimpleStatItem
                  label="Naudotojų skenavo šiandien"
                  value={docs?.unique_users_excluding_1_2_today}
                />
                <DocStatItem label="Vakar" count={docs?.yesterday?.count} errors={docs?.yesterday?.errors} />
                <DocStatItem
                  label="Per paskutines 7 dienas"
                  count={docs?.last_7_days?.count}
                  errors={docs?.last_7_days?.errors}
                />
                <DocStatItem
                  label="Per paskutines 30 dienų"
                  count={docs?.last_30_days?.count}
                  errors={docs?.last_30_days?.errors}
                />
                <DocStatItem label="Viso" count={docs?.total?.count} errors={docs?.total?.errors} />
                <Divider sx={{ my: 1 }} />
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  Tipai (viso laikotarpio):
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Chip 
                    label={`Sumiškai: ${st?.sumiskai?.count ?? 0} (${fmtPct(st?.sumiskai?.pct)})`}
                    size="small"
                    variant="outlined"
                  />
                  <Chip 
                    label={`Detaliai: ${st?.detaliai?.count ?? 0} (${fmtPct(st?.detaliai?.pct)})`}
                    size="small"
                    variant="outlined"
                  />
                </Stack>
              </>
            }
          />
        </Grid>

        {/* Users */}
        <Grid size={{ xs: 12, md: 6 }}>
          <StatCard
            title="Naudotojai"
            icon={People}
            color="secondary"
            items={
              <>
                <SimpleStatItem label="Nauji šiandien" value={users?.new_today} />
                <SimpleStatItem label="Nauji vakar" value={users?.new_yesterday} />
                <SimpleStatItem label="Per paskutines 7 dienas" value={users?.new_last_7_days} />
                <SimpleStatItem label="Per paskutines 30 dienų" value={users?.new_last_30_days} />
                <SimpleStatItem label="Viso" value={users?.total} />
              </>
            }
          />
        </Grid>

        {/* Success rate card */}
        <Grid size={12}>
          <Card
            elevation={0}
            sx={{
              border: 1,
              borderColor: "success.main",
              bgcolor: "success.50",
              borderRadius: 2,
            }}
          >
            <CardContent>
              <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
                <Percent sx={{ color: "success.main", fontSize: 32 }} />
                <Box flex={1} minWidth={260}>
                  <Typography variant="h6" fontWeight={800} color="success.dark">
                    Success rate (be klaidų)
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Procentas sėkmingų skenų per laikotarpius
                  </Typography>
                </Box>

                <Stack direction="row" spacing={3} flexWrap="wrap">
                  <Box textAlign="center">
                    <Typography variant="caption" color="text.secondary">Šiandien</Typography>
                    <Typography variant="h6" fontWeight={700}>{fmtPct(sr?.today)}</Typography>
                  </Box>
                  <Box textAlign="center">
                    <Typography variant="caption" color="text.secondary">Vakar</Typography>
                    <Typography variant="h6" fontWeight={700}>{fmtPct(sr?.yesterday)}</Typography>
                  </Box>
                  <Box textAlign="center">
                    <Typography variant="caption" color="text.secondary">Pask. 7 d.</Typography>
                    <Typography variant="h6" fontWeight={700}>{fmtPct(sr?.last_7_days)}</Typography>
                  </Box>
                  <Box textAlign="center">
                    <Typography variant="caption" color="text.secondary">Pask. 30 d.</Typography>
                    <Typography variant="h6" fontWeight={700}>{fmtPct(sr?.last_30_days)}</Typography>
                  </Box>
                  <Box textAlign="center">
                    <Typography variant="caption" color="text.secondary">Viso</Typography>
                    <Typography variant="h6" fontWeight={700}>{fmtPct(sr?.total)}</Typography>
                  </Box>
                </Stack>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Rejected documents card */}
        <Grid size={12}>
          <Card
            elevation={0}
            sx={{
              border: 1,
              borderColor: "error.main",
              bgcolor: "error.50",
              borderRadius: 2,
            }}
          >
            <CardContent>
              <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
                <Block sx={{ color: "error.main", fontSize: 32 }} />
                <Box flex={1} minWidth={260}>
                  <Typography variant="h6" fontWeight={800} color="error.dark">
                    Atmesti dokumentai
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Rejected / Viso (procentas)
                  </Typography>
                </Box>

                <Stack direction="row" spacing={3} flexWrap="wrap">
                  <RejectedStatItem label="Šiandien" data={rej?.today} />
                  <RejectedStatItem label="Vakar" data={rej?.yesterday} />
                  <RejectedStatItem label="Pask. 7 d." data={rej?.last_7_days} />
                  <RejectedStatItem label="Pask. 30 d." data={rej?.last_30_days} />
                  <RejectedStatItem label="Viso" data={rej?.total} />
                </Stack>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* System health info */}
        <Grid size={12}>
          <Card
            elevation={0}
            sx={{
              border: 1,
              borderColor: "success.main",
              bgcolor: "success.50",
              borderRadius: 2,
            }}
          >
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <TrendingUp sx={{ color: "success.main", fontSize: 32 }} />
                <Box>
                  <Typography variant="h6" fontWeight={700} color="success.dark">
                    Sistema veikia sklandžiai
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Visi rodikliai atnaujinti ir sistema pilnai funkcionali
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}