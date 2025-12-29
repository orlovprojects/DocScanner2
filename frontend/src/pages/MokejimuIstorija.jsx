// src/pages/MokejimuIstorija.jsx
import { useEffect, useState } from "react";
import { api } from "../api/endpoints";
import {
  Box,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Button,
  Typography,
  CircularProgress,
  Alert,
  Chip,
} from "@mui/material";

// Map kreditų -> kodas
const SERVICE_CODE_BY_CREDITS = {
  100: "DOK1",
  500: "DOK2",
  1000: "DOK3",
  5000: "DOK4",
  10000: "DOK5",
};

const toNumber = (value) => {
  if (typeof value === "number") return value;
  if (value == null || value === "") return 0;
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
};

const formatAmount = (amountInCents, currency = "EUR") => {
  const cents = toNumber(amountInCents);
  const value = (cents / 100).toFixed(2).replace(".", ",");
  return `${value} ${currency.toUpperCase()}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("lt-LT");
};

// "100 DokSkeno kreditų"
const getPaslaugaLabel = (payment) => {
  const credits = toNumber(payment.credits_purchased);
  if (!credits) return "DokSkeno kreditai";
  return `${credits} DokSkeno kreditų`;
};

// "DOK1" / "—"
const getPaslaugosKodas = (payment) => {
  const credits = toNumber(payment.credits_purchased);
  return SERVICE_CODE_BY_CREDITS[credits] || "—";
};

const getInvoiceUrl = (payment) => {
  if (payment.invoice_url) return payment.invoice_url;
  if (!payment.id) return "#";
  return `/payments/${payment.id}/invoice/`;
};

export default function MokejimuIstorija() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const hasPayments = payments && payments.length > 0;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get("/payments/", {
          withCredentials: true,
        });
        setPayments(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("Failed to load payments", e);
        setError(
          e?.response?.data?.detail ||
            e?.message ||
            "Nepavyko užkrauti mokėjimų."
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const totalNet = payments.reduce(
    (sum, p) => sum + toNumber(p.net_amount),
    0
  );
  const totalCredits = payments.reduce(
    (sum, p) => sum + toNumber(p.credits_purchased),
    0
  );

  return (
    <Box px={6} py={4}>
      {/* верхняя панель */}
      <Box
        sx={{
          mb: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          maxWidth: 1180, // чуть шире
          mx: "auto",
        }}
      >
        <Typography variant="h5">Mokėjimų istorija</Typography>

        {hasPayments && (
          <Box display="flex" alignItems="center" gap={2}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Iš viso mokėjimų: {payments.length}
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Iš viso kreditų: {totalCredits}
            </Typography>
            <Chip
              size="small"
              label={`Neto suma: ${formatAmount(
                totalNet,
                payments[0]?.currency || "EUR"
              )}`}
              sx={{ fontSize: 12 }}
            />
          </Box>
        )}
      </Box>

      {error && (
        <Box
          sx={{
            maxWidth: 1180,
            mx: "auto",
            mb: 2,
          }}
        >
          <Alert severity="error">{error}</Alert>
        </Box>
      )}

      <TableContainer
        component={Paper}
        sx={{
          maxWidth: 1180, // немножко шире таблица
          mx: "auto",
          maxHeight: 520,
        }}
      >
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Data</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Paslauga</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Paslaugos kodas</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Suma</TableCell>
              <TableCell
                align="right"
                sx={{ fontWeight: 600, width: 140 }}
              >
                PDF sąskaita
              </TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : !hasPayments ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                  <Typography
                    variant="body2"
                    sx={{ color: "text.secondary" }}
                  >
                    Mokėjimų nėra.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              payments.map((payment) => (
                <TableRow
                  key={payment.id || payment.dok_number || payment.paid_at}
                  hover
                >
                  <TableCell>
                    <Typography variant="body2">
                      {formatDate(payment.paid_at)}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{
                        maxWidth: 260,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={getPaslaugaLabel(payment)}
                    >
                      {getPaslaugaLabel(payment)}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2">
                      {getPaslaugosKodas(payment)}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2">
                      {formatAmount(payment.net_amount, payment.currency)}
                    </Typography>
                  </TableCell>

                  <TableCell align="right">
                    <Button
                      variant="outlined"
                      size="small"
                      component="a"
                      href={getInvoiceUrl(payment)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      PDF sąskaita
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
