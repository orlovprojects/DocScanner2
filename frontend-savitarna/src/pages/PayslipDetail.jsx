import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import { useNavigate, useParams } from "react-router-dom";

import { api, apiError } from "../api";
import { MONTHS, eur } from "./Payslips";

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

function Row({ name, value, sub, bold }) {
  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="flex-start"
      gap={2}
      sx={{ py: 0.85 }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: bold ? "0.87rem" : "0.82rem",
            lineHeight: 1.35,
            fontWeight: bold ? 700 : 500,
            color: "text.primary",
          }}
        >
          {name}
        </Typography>
        {sub && (
          <Typography
            sx={{
              mt: 0.15,
              fontSize: "0.7rem",
              lineHeight: 1.35,
              color: "text.secondary",
            }}
          >
            {sub}
          </Typography>
        )}
      </Box>

      <Typography
        sx={{
          flex: "0 0 auto",
          fontSize: bold ? "0.89rem" : "0.82rem",
          lineHeight: 1.35,
          fontWeight: bold ? 750 : 600,
          whiteSpace: "nowrap",
          color: bold ? "#1F2937" : "text.primary",
        }}
      >
        {value}
      </Typography>
    </Stack>
  );
}

function Section({ title, children }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: "10px",
        bgcolor: "#fff",
      }}
    >
      <Typography
        sx={{
          mb: 0.6,
          fontSize: "0.86rem",
          fontWeight: 750,
          color: "#1F2937",
        }}
      >
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

export default function PayslipDetail() {
  const { run } = useParams();
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    api
      .get(`payslips/${run}/`)
      .then((r) => setD(r.data))
      .catch((e) => setError(apiError(e)));
  }, [run]);

  const openPdf = async () => {
    const html = (
      await api.get(`payslips/${run}/`, {
        params: { html: 1 },
        responseType: "text",
      })
    ).data;

    const w = window.open("", "_blank");
    if (!w) return;

    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!d) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Stack gap={2}>
      <BackButton onClick={() => nav("/algalapiai")} />

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
          Algalapis
        </Typography>

        <Typography
          sx={{
            mt: 0.45,
            fontSize: "0.78rem",
            lineHeight: 1.45,
            color: "text.secondary",
          }}
        >
          {d.year} m. {MONTHS[d.month - 1].toLowerCase()} · dirbta{" "}
          {d.worked_days} d. / {Number(d.worked_hours)} val.
        </Typography>
      </Box>

      <Paper
        elevation={0}
        sx={{
          p: 2.25,
          borderRadius: "10px",
          bgcolor: "#EAF7EF",
          border: "1px solid #D5EBDD",
        }}
      >
        <Typography
          sx={{
            fontSize: "0.76rem",
            fontWeight: 600,
            color: "#4B6B57",
          }}
        >
          Į rankas
        </Typography>

        <Typography
          sx={{
            mt: 0.25,
            fontSize: "1.7rem",
            lineHeight: 1.2,
            fontWeight: 800,
            letterSpacing: "-0.025em",
            color: "#1F5132",
          }}
        >
          {eur(d.net)}
        </Typography>

        {d.payable !== d.net && (
          <Typography
            sx={{
              mt: 0.55,
              fontSize: "0.76rem",
              color: "#4B6B57",
            }}
          >
            Išmokėti: <b>{eur(d.payable)}</b>
          </Typography>
        )}
      </Paper>

      <Section title="Priskaičiuota">
        {d.earnings.map((l, i) => (
          <Row
            key={i}
            name={l.name}
            sub={l.qty}
            value={eur(l.amount)}
          />
        ))}
        <Divider sx={{ my: 0.6 }} />
        <Row name="Iš viso" value={eur(d.gross)} bold />
      </Section>

      <Section title="Išskaičiuota">
        {d.deductions.map((l, i) => (
          <Row key={i} name={l.name} value={`−${eur(l.amount)}`} />
        ))}
      </Section>

      <Button
        variant="outlined"
        startIcon={<DownloadOutlinedIcon />}
        onClick={openPdf}
        sx={{
          minHeight: 44,
          borderRadius: "10px",
          fontSize: "0.85rem",
          fontWeight: 700,
          textTransform: "none",
        }}
      >
        Atsisiųsti PDF
      </Button>
    </Stack>
  );
}
