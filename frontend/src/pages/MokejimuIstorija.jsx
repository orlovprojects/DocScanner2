import { useEffect, useState } from "react";
import { api } from "../api/endpoints";
import { Helmet } from "react-helmet";
import {
  Box,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Typography,
  CircularProgress,
  Alert,
} from "@mui/material";
import PaymentInvoiceButton from "../page_elements/PaymentInvoiceButton";

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

const getPaslaugaLabel = (payment) => {
  const credits = toNumber(payment.credits_purchased);
  if (!credits) return "DokSkeno kreditai";
  return `${credits} DokSkeno kreditų`;
};

const getPaslaugosKodas = (payment) => {
  const credits = toNumber(payment.credits_purchased);
  return SERVICE_CODE_BY_CREDITS[credits] || "—";
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

        const arr = Array.isArray(data) ? data : [];
        arr.sort((a, b) => {
          const ad = a.paid_at ? new Date(a.paid_at).getTime() : 0;
          const bd = b.paid_at ? new Date(b.paid_at).getTime() : 0;
          return bd - ad;
        });

        setPayments(arr);
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

  return (
    <Box px={6} py={4} sx={{ minHeight: "70vh" }}>
        <Helmet>
          <title>Mokėjimų istorija</title>
          <meta
            name="description"
            content="Čia rasite sąskaitas už atliktus mokėjimus DokSkene."
          />
        </Helmet>
        <Box
        sx={{
            mb: 2,
            maxWidth: 1180,
            mx: "auto",
        }}
        >
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
            <Typography variant="h5">Mokėjimų istorija</Typography>
            {hasPayments && (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Iš viso mokėjimų: {payments.length}
            </Typography>
            )}
        </Box>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Norint pakeisti savo įmonės rekvizitus PDF sąskaitose, pakeiskite įmonės duomenis nustatymuose, tada atsisiųskite naujas sąskaitas.
        </Typography>
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
          maxWidth: 1180,
          mx: "auto",
          maxHeight: 520,
        }}
      >
        <Table stickyHeader size="small">
          <TableHead sx={{ "& th": { backgroundColor: "#FAFAFA" } }}>
            <TableRow >
              <TableCell sx={{ fontWeight: 600 }}>Data</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Paslauga</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Paslaugos kodas</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Suma</TableCell>
              <TableCell
                align="right"
                sx={{ fontWeight: 600, width: 80 }}
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
                    Mokėjimų nėra
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
                    <PaymentInvoiceButton payment={payment} />
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
