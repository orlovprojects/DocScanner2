import {
  Box,
  Button,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import ConstructionOutlinedIcon from "@mui/icons-material/ConstructionOutlined";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import { useNavigate } from "react-router-dom";

export default function Soon() {
  const nav = useNavigate();

  return (
    <Stack gap={2.25}>
      <Box
        component="button"
        type="button"
        onClick={() => nav("/")}
        sx={{
          border: 0,
          bgcolor: "transparent",
          p: 0,
          display: "inline-flex",
          alignItems: "center",
          gap: 0.25,
          color: "text.secondary",
          cursor: "pointer",
          font: "inherit",
          fontSize: "0.8rem",
          fontWeight: 600,
          width: "fit-content",
        }}
      >
        <ChevronLeftRoundedIcon sx={{ fontSize: 20 }} />
        Atgal
      </Box>

      <Paper
        variant="outlined"
        sx={{
          p: 2.5,
          borderRadius: "10px",
          bgcolor: "#fff",
          textAlign: "center",
        }}
      >
        <Box
          sx={{
            width: 48,
            height: 48,
            mx: "auto",
            mb: 1.25,
            borderRadius: "10px",
            display: "grid",
            placeItems: "center",
            bgcolor: "#EEF5FF",
            color: "primary.main",
          }}
        >
          <ConstructionOutlinedIcon sx={{ fontSize: 25 }} />
        </Box>

        <Typography
          sx={{
            fontSize: "1rem",
            fontWeight: 750,
            color: "#1F2937",
          }}
        >
          Netrukus
        </Typography>

        <Typography
          sx={{
            mt: 0.55,
            mx: "auto",
            maxWidth: 280,
            fontSize: "0.78rem",
            lineHeight: 1.45,
            color: "text.secondary",
          }}
        >
          Ši funkcija jau ruošiama ir greitai atsiras.
        </Typography>

        <Button
          variant="outlined"
          onClick={() => nav("/")}
          sx={{
            mt: 2,
            minHeight: 42,
            px: 2.5,
            borderRadius: "10px",
            fontSize: "0.82rem",
            fontWeight: 700,
            textTransform: "none",
          }}
        >
          Grįžti į pradžią
        </Button>
      </Paper>
    </Stack>
  );
}
