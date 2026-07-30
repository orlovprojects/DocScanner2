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
  Stack,
  Divider,
} from "@mui/material";
import PaymentInvoiceButton from "../page_elements/PaymentInvoiceButton";
import { Button } from "@mui/material";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import EditBillingRequisitesDialog from "../components/EditBillingRequisitesDialog";

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
  const [reqDialogOpen, setReqDialogOpen] = useState(false);

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
    <Box sx={{ px: { xs: 1.5, sm: 3, md: 6 }, py: { xs: 2, md: 4 }, minHeight: "70vh" }}>
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
        {/* Header row: icon + title */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2,
              backgroundColor: "#EDE9FE",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ReceiptLongIcon sx={{ fontSize: 24, color: "#7C3AED" }} />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Mokėjimų istorija
            </Typography>
            {hasPayments && (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Iš viso mokėjimų: {payments.length}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Subtitle above button */}
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 1.5 }}>
          Norint pakeisti savo įmonės rekvizitus PDF sąskaitose, spauskite
          „Keisti rekvizitus" mygtuką
        </Typography>

        <Button
          variant="outlined"
          startIcon={<EditOutlinedIcon />}
          onClick={() => setReqDialogOpen(true)}
          sx={{
            textTransform: "none",
            fontWeight: 600,
            width: { xs: "100%", sm: "auto" },
          }}
        >
          Keisti rekvizitus
        </Button>
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

      {/* ── Loading ── */}
      {loading && (
        <Box
          sx={{
            maxWidth: 1180,
            mx: "auto",
            display: "flex",
            justifyContent: "center",
            py: 6,
          }}
        >
          <CircularProgress size={28} />
        </Box>
      )}

      {/* ── Empty ── */}
      {!loading && !hasPayments && (
        <Box
          sx={{
            maxWidth: 1180,
            mx: "auto",
            border: "2px dashed",
            borderColor: "divider",
            borderRadius: 3,
            backgroundColor: "grey.50",
            textAlign: "center",
            py: 6,
          }}
        >
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Mokėjimų nėra
          </Typography>
        </Box>
      )}

      {/* ── Mobile: cards (xs only) ── */}
      {!loading && hasPayments && (
        <Stack
          spacing={1.5}
          sx={{ maxWidth: 1180, mx: "auto", display: { xs: "flex", md: "none" } }}
        >
          {payments.map((payment) => (
            <Paper
              key={payment.id || payment.dok_number || payment.paid_at}
              variant="outlined"
              sx={{ p: 2, borderRadius: 2 }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 1,
                  mb: 1,
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {getPaslaugaLabel(payment)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {formatDate(payment.paid_at)}
                  </Typography>
                </Box>
                <PaymentInvoiceButton payment={payment} />
              </Box>

              <Divider sx={{ my: 1 }} />

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1,
                }}
              >
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary", display: "block" }}
                  >
                    Paslaugos kodas
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {getPaslaugosKodas(payment)}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "right" }}>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary", display: "block" }}
                  >
                    Suma
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatAmount(payment.net_amount, payment.currency)}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          ))}
        </Stack>
      )}

      {/* ── Desktop/tablet: table (md+) ── */}
      {!loading && hasPayments && (
        <TableContainer
          component={Paper}
          sx={{
            maxWidth: 1180,
            mx: "auto",
            maxHeight: 520,
            display: { xs: "none", md: "block" },
          }}
        >
          <Table stickyHeader size="small">
            <TableHead sx={{ "& th": { backgroundColor: "#FAFAFA" } }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Data</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Paslauga</TableCell>
                <TableCell sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                  Paslaugos kodas
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Suma</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, width: 80 }}>
                  PDF sąskaita
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {payments.map((payment) => (
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
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <EditBillingRequisitesDialog
        open={reqDialogOpen}
        onClose={() => setReqDialogOpen(false)}
      />
    </Box>
  );
}