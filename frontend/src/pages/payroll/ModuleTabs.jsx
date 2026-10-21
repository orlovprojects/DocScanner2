import { Badge, Box, Paper, Typography } from "@mui/material";

// Tokio paties stiliaus skirtukai kaip „Apskaitos centras“ (VisualTabs), su skaičiuku
export default function ModuleTabs({ tabs, value, onChange }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: `repeat(${tabs.length}, 1fr)` }, gap: 1.5, mb: 3 }}>
      {tabs.map((tab) => {
        const active = value === tab.value;
        return (
          <Paper key={tab.value} onClick={() => onChange(tab.value)}
            sx={{
              p: 1.75, borderRadius: 2, cursor: "pointer",
              boxShadow: active ? "0 8px 24px rgba(15, 23, 42, 0.08)" : "none",
              border: "1px solid", borderColor: active ? tab.color : "divider",
              bgcolor: active ? tab.bg : "background.paper", transition: "all 0.15s ease",
              "&:hover": { borderColor: tab.color, boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)" },
            }}>
            <Box sx={{ display: "flex", gap: 1.25, alignItems: "flex-start" }}>
              {(() => {
                const icon = (
                  <Box sx={{ width: 36, height: 36, borderRadius: "10px", bgcolor: active ? "background.paper" : tab.bg, color: tab.color,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {tab.icon}
                  </Box>
                );
                return Number(tab.badge) > 0 ? <Badge color="error" badgeContent={tab.badge}>{icon}</Badge> : icon;
              })()}
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 800, lineHeight: 1.2 }}>{tab.label}</Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.35, lineHeight: 1.35 }}>{tab.description}</Typography>
              </Box>
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}
