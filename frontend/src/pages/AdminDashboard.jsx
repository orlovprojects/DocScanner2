import { useEffect, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
} from "@mui/material";

function StatCard({ title, items }) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
        <List dense>
          {items.map((it) => (
            <ListItem key={it.label} disableGutters>
              <ListItemText
                primary={it.label}
                secondary={it.value}
                primaryTypographyProps={{ variant: "body2", color: "text.secondary" }}
                secondaryTypographyProps={{ variant: "body1", fontWeight: "bold" }}
              />
            </ListItem>
          ))}
        </List>
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
    return <Alert severity="error">Error: {String(err)}</Alert>;
  }

  if (!stats) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="40vh">
        <CircularProgress />
      </Box>
    );
  }

  const docs = stats.documents;
  const users = stats.users;
  const meta = stats.meta;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Admin Dashboard
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        TZ: {meta?.timezone} · Generated:{" "}
        {meta?.generated_at ? new Date(meta.generated_at).toLocaleString() : ""}
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <StatCard
            title="Documents"
            items={[
              { label: "Today", value: docs?.today ?? 0 },
              { label: "Naudotojų skenavo Today", value: docs?.unique_users_excluding_1_2 ?? 0 },
              { label: "Yesterday", value: docs?.yesterday ?? 0 },
              { label: "Last 7 days", value: docs?.last_7_days ?? 0 },
              { label: "Last 30 days", value: docs?.last_30_days ?? 0 },
              { label: "Total", value: docs?.total ?? 0 },
            ]}
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <StatCard
            title="Users"
            items={[
              { label: "New today", value: users?.new_today ?? 0 },
              { label: "New yesterday", value: users?.new_yesterday ?? 0 },
              { label: "Last 7 days", value: users?.new_last_7_days ?? 0 },
              { label: "Last 30 days", value: users?.new_last_30_days ?? 0 },
              { label: "Total", value: users?.total ?? 0 },
            ]}
          />
        </Grid>
      </Grid>
    </Box>
  );
}
