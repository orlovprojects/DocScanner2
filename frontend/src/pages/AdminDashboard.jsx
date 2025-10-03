import { useEffect, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  Alert,
  Chip,
  Divider,
  Paper,
} from "@mui/material";
import {
  Description,
  People,
  TrendingUp,
  CalendarToday,
  Schedule,
} from "@mui/icons-material";

function StatItem({ label, value, color = "primary" }) {
  return (
    <Box sx={{ py: 1.5 }}>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {label}
      </Typography>
      <Typography variant="h5" fontWeight="600" color={`${color}.main`}>
        {value?.toLocaleString() ?? 0}
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
        }
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
          <Typography variant="h6" fontWeight="600">
            {title}
          </Typography>
        </Box>
        <Divider sx={{ mb: 2 }} />
        {items.map((it, idx) => (
          <StatItem 
            key={it.label} 
            label={it.label} 
            value={it.value}
            color={idx === 0 ? color : "primary"}
          />
        ))}
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const cached = sessionStorage.getItem("dashboardPrefetch");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setStats(parsed.data);
        fetch("/api/superuser/dashboard-stats/", {
          credentials: "include",
          headers: { Accept: "application/json" },
        })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
          .then((fresh) => setStats(fresh))
          .catch(() => {});
        return;
      } catch (_) {
        sessionStorage.removeItem("dashboardPrefetch");
      }
    }

    (async () => {
      try {
        const res = await fetch("/api/superuser/dashboard-stats/", {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setStats(data);
      } catch (e) {
        setErr(e.message);
      }
    })();
  }, []);

  if (err) {
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

  const docs = stats.documents;
  const users = stats.users;
  const meta = stats.meta;

  return (
    <Box sx={{ p: 4, bgcolor: "grey.50", minHeight: "100vh" }}>
      <Paper elevation={0} sx={{ p: 3, mb: 4, borderRadius: 3, border: 1, borderColor: "divider" }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
          <Box>
            <Typography variant="h4" fontWeight="700" gutterBottom>
              Administratoriaus Valdymo Skydelis
            </Typography>
            <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
              <Chip 
                icon={<Schedule />}
                label={`Laiko juosta: ${meta?.timezone}`}
                size="small"
                variant="outlined"
              />
              <Chip 
                icon={<CalendarToday />}
                label={`Atnaujinta: ${meta?.generated_at ? new Date(meta.generated_at).toLocaleString('lt-LT') : ""}`}
                size="small"
                variant="outlined"
              />
            </Box>
          </Box>
          <Chip 
            label="Aktyvus"
            color="success"
            sx={{ fontWeight: 600 }}
          />
        </Box>
      </Paper>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <StatCard
            title="Dokumentai"
            icon={Description}
            color="primary"
            items={[
              { label: "Šiandien", value: docs?.today ?? 0 },
              { label: "Naudotojų skenavo šiandien", value: docs?.unique_users_excluding_1_2 ?? 0 },
              { label: "Vakar", value: docs?.yesterday ?? 0 },
              { label: "Per paskutines 7 dienas", value: docs?.last_7_days ?? 0 },
              { label: "Per paskutines 30 dienų", value: docs?.last_30_days ?? 0 },
              { label: "Viso", value: docs?.total ?? 0 },
            ]}
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <StatCard
            title="Naudotojai"
            icon={People}
            color="secondary"
            items={[
              { label: "Nauji šiandien", value: users?.new_today ?? 0 },
              { label: "Nauji vakar", value: users?.new_yesterday ?? 0 },
              { label: "Per paskutines 7 dienas", value: users?.new_last_7_days ?? 0 },
              { label: "Per paskutines 30 dienų", value: users?.new_last_30_days ?? 0 },
              { label: "Viso", value: users?.total ?? 0 },
            ]}
          />
        </Grid>

        <Grid item xs={12}>
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
                  <Typography variant="h6" fontWeight="600" color="success.dark">
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
