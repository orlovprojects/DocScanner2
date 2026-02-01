import { Box, Container, Paper, Stack, Typography, Button, Link } from "@mui/material";
import { Link as RouterLink, useNavigate } from "react-router-dom";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        minHeight: "70vh",
        bgcolor: "background.default",
        display: "flex",
        alignItems: "center",
        py: { xs: 3, sm: 6 },
      }}
    >
      <Container maxWidth="sm">
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 2.5, sm: 4 },
            borderRadius: 4,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* soft background decoration */}
          <Box
            aria-hidden
            sx={{
              position: "absolute",
              inset: 0,
              opacity: 0.06,
              background:
                "radial-gradient(circle at 20% 20%, #000 0, transparent 42%), radial-gradient(circle at 80% 35%, #000 0, transparent 45%), radial-gradient(circle at 35% 85%, #000 0, transparent 50%)",
              pointerEvents: "none",
            }}
          />

          <Stack spacing={2.25} alignItems="center" textAlign="center" sx={{ position: "relative" }}>
            <Box
              sx={{
                width: 84,
                height: 84,
                borderRadius: 999,
                bgcolor: "action.hover",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Typography sx={{ fontWeight: 900, fontSize: 28, letterSpacing: 0.5 }}>404</Typography>
            </Box>

            <Box>
              <Typography variant="h4" sx={{ fontWeight: 500, lineHeight: 1.1 }}>
                Puslapis nerastas
              </Typography>
              <Typography variant="body1" sx={{ opacity: 0.8, mt: 1, lineHeight: 1.7 }}>
                Ieškomas puslapis neegzistuoja arba buvo perkeltas. Patikrinkite adresą arba grįžkite į pagrindinį puslapį. 
              </Typography>
            </Box>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ width: "100%" }}>

              <Button
                onClick={() => navigate(-1)}
                variant="outlined"
                fullWidth
                sx={{ borderRadius: 3, py: 1.1 }}
              >
                Grįžti atgal
              </Button>
            </Stack>

          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}