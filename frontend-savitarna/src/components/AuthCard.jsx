import { Box, Container, Paper, Typography } from "@mui/material";

export default function AuthCard({ title, subtitle, children }) {
  return (
    <Container maxWidth="xs" sx={{ minHeight: "100vh", display: "flex", alignItems: "center", py: 4 }}>
      <Box sx={{ width: "100%" }}>
        <Typography variant="h5" fontWeight={800} color="primary" textAlign="center" mb={3}>esavitarna</Typography>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={700}>{title}</Typography>
          {subtitle && <Typography color="text.secondary" mt={0.5} mb={2}>{subtitle}</Typography>}
          {!subtitle && <Box mb={2} />}
          {children}
        </Paper>
      </Box>
    </Container>
  );
}
