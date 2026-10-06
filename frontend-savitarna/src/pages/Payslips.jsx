import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import { useNavigate } from "react-router-dom";

import { api, apiError } from "../api";

export const MONTHS = [
  "Sausis", "Vasaris", "Kovas", "Balandis", "Gegužė", "Birželis",
  "Liepa", "Rugpjūtis", "Rugsėjis", "Spalis", "Lapkritis", "Gruodis",
];

export const eur = (v) =>
  `${Number(v).toLocaleString("lt-LT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;

function BackButton({ onClick }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
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
  );
}

export default function Payslips() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    api
      .get("payslips/")
      .then((r) => setRows(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  return (
    <Stack gap={2.25}>
      <BackButton onClick={() => nav("/")} />

      <Box>
        <Typography
          component="h1"
          sx={{
            fontSize: "1.28rem",
            lineHeight: 1.25,
            fontWeight: 750,
            color: "#1F2937",
          }}
        >
          Mano algalapiai
        </Typography>
        <Typography
          sx={{
            mt: 0.55,
            fontSize: "0.8rem",
            lineHeight: 1.45,
            color: "text.secondary",
          }}
        >
          Čia rasite patvirtintus atsiskaitymo lapelius.
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ borderRadius: "10px" }}>
          {error}
        </Alert>
      )}

      {!rows && !error && (
        <Box sx={{ display: "grid", placeItems: "center", py: 5 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {rows?.length === 0 && (
        <Paper
          variant="outlined"
          sx={{
            p: 2.25,
            borderRadius: "10px",
            bgcolor: "#fff",
            textAlign: "center",
          }}
        >
          <ReceiptLongOutlinedIcon
            sx={{ fontSize: 30, color: "text.disabled", mb: 0.75 }}
          />
          <Typography sx={{ fontSize: "0.9rem", fontWeight: 650 }}>
            Algalapių dar nėra
          </Typography>
          <Typography
            sx={{
              mt: 0.45,
              fontSize: "0.78rem",
              lineHeight: 1.45,
              color: "text.secondary",
            }}
          >
            Jie atsiras, kai darbdavys patvirtins mėnesio atlyginimus.
          </Typography>
        </Paper>
      )}

      {rows?.length > 0 && (
        <Paper
          variant="outlined"
          sx={{
            borderRadius: "10px",
            overflow: "hidden",
            bgcolor: "#fff",
          }}
        >
          {rows.map((r, index) => (
            <Box
              key={r.run}
              onClick={() => nav(`/algalapiai/${r.run}`)}
              sx={{
                minHeight: 68,
                px: 2,
                py: 1.35,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1.5,
                cursor: "pointer",
                borderBottom:
                  index === rows.length - 1 ? 0 : "1px solid",
                borderColor: "divider",
                WebkitTapHighlightColor: "transparent",
                "&:active": { bgcolor: "action.hover" },
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: "0.91rem",
                    lineHeight: 1.35,
                    fontWeight: 650,
                    color: "text.primary",
                  }}
                >
                  {r.year} m. {MONTHS[r.month - 1].toLowerCase()}
                </Typography>
                <Typography
                  sx={{
                    mt: 0.25,
                    fontSize: "0.76rem",
                    color: "text.secondary",
                  }}
                >
                  Į rankas
                </Typography>
              </Box>

              <Stack direction="row" alignItems="center" gap={0.5}>
                <Typography
                  sx={{
                    fontSize: "0.92rem",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    color: "#1F2937",
                  }}
                >
                  {eur(r.net)}
                </Typography>
                <ChevronRightRoundedIcon
                  sx={{ fontSize: 20, color: "text.disabled" }}
                />
              </Stack>
            </Box>
          ))}
        </Paper>
      )}
    </Stack>
  );
}
