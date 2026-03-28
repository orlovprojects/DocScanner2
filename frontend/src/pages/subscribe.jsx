import "../styles/infoPage.css";
import { Helmet } from "react-helmet";
import { useState, useEffect, useRef } from "react";
import config from "../config";
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Snackbar,
  Typography,
} from "@mui/material";
import { Grid2 } from "@mui/material";
import { alpha } from "@mui/material/styles";
import CheckIcon from "@mui/icons-material/Check";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import StarIcon from "@mui/icons-material/Star";
import { api } from "../api/endpoints";

const BRAND = {
  bg: "#f3f4f6",
  surface: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  accent: "#f5be0d",
  accentDark: "#d89d00",
  successSoft: alpha("#4caf50", 0.12),
  successBorder: alpha("#4caf50", 0.24),
  successText: "#2e7d32",
  danger: "#d32f2f",
};

const SectionHeading = ({ title, subtitle, children }) => (
  <Box sx={{ textAlign: "center", mb: { xs: 4, md: 5 } }}>
    <Typography
      variant="h1"
      sx={{
        fontSize: { xs: "30px", md: "40px" },
        fontWeight: 800,
        letterSpacing: "-0.03em",
        color: BRAND.text,
        mb: 1.25,
        lineHeight: 1.1,
      }}
    >
      {title}
    </Typography>

    <Typography
      variant="body1"
      sx={{
        fontSize: { xs: "16px", md: "18px" },
        color: BRAND.muted,
        maxWidth: 720,
        mx: "auto",
        lineHeight: 1.6,
      }}
    >
      {subtitle}
    </Typography>

    {children}
  </Box>
);

const CreditFeatureRow = ({ text, featured = false }) => (
  <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
    <CheckIcon
      sx={{
        color: featured ? BRAND.accentDark : BRAND.text,
        fontSize: 18,
        mt: "2px",
        flexShrink: 0,
      }}
    />
    <Typography sx={{ fontSize: 14, lineHeight: 1.5, color: BRAND.text }}>
      {text}
    </Typography>
  </Box>
);

const CreditPlanCard = ({ plan, loadingId, onCheckout }) => {
  const featured = plan.credits === 500;

  return (
    <Paper
      elevation={0}
      sx={{
        width: "100%",
        maxWidth: 340,
        minHeight: "100%",
        borderRadius: "24px",
        p: { xs: 2.5, sm: 3 },
        background: BRAND.surface,
        border: `1px solid ${featured ? alpha(BRAND.accent, 0.5) : BRAND.border}`,
        boxShadow: featured ? "0 24px 64px rgba(17, 24, 39, 0.14)" : "none",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "visible",
      }}
    >
      {plan.tag && (
        <Chip
          label={plan.tag}
          size="small"
          sx={{
            position: "absolute",
            top: -14,
            left: "50%",
            transform: "translateX(-50%)",
            fontWeight: 800,
            fontSize: 12,
            height: 28,
            color: "#2b2100",
            bgcolor: BRAND.accent,
            borderRadius: "999px",
            boxShadow: "0 50px 100px rgba(245, 190, 53, 0.45)",
            "& .MuiChip-label": { px: 1.5 },
          }}
        />
      )}

      <Box sx={{ mb: 2.5, pt: plan.tag ? 1.5 : 0 }}>
        <Typography
          sx={{ fontWeight: 400, color: BRAND.text, fontSize: 20, lineHeight: 1.2, mb: 1 }}
        >
          {plan.credits} kreditų
        </Typography>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Typography
            sx={{
              fontSize: { xs: "28px", sm: "30px" },
              fontWeight: 700,
              color: "#000000",
              lineHeight: 1,
              letterSpacing: "-0.02em",
            }}
          >
            {plan.cost}
          </Typography>

          {plan.discount && (
            <Chip
              label={plan.discount}
              size="small"
              sx={{
                fontWeight: 700,
                fontSize: 11,
                color: BRAND.accentDark,
                bgcolor: alpha(BRAND.accent, 0.1),
                borderRadius: "999px",
                boxShadow: "none",
              }}
            />
          )}
        </Box>
      </Box>

      <Box sx={{ display: "grid", gap: 1.1, flexGrow: 1 }}>
        <CreditFeatureRow text="1 kreditas = 1 dokumentas" featured={featured} />
        <CreditFeatureRow text={`Dokumento kaina – ${plan.docPrice}`} featured={featured} />
        <CreditFeatureRow text="Galiojimas – neribotas" featured={featured} />
      </Box>

      <Button
        variant="contained"
        fullWidth
        onClick={() => onCheckout(plan.priceId)}
        disabled={loadingId === plan.priceId}
        sx={{
          mt: 3,
          py: 1.4,
          borderRadius: "14px",
          fontWeight: 700,
          fontSize: 15,
          textTransform: "none",
          bgcolor: BRAND.accent,
          color: "#111111",
          boxShadow: "none",
          "&:hover": { bgcolor: BRAND.accentDark, boxShadow: "none" },
          "&.Mui-disabled": { bgcolor: alpha(BRAND.accent, 0.45), color: alpha("#111111", 0.6) },
        }}
      >
        {loadingId === plan.priceId ? "Vykdoma…" : `Pirkti ${plan.credits}`}
      </Button>
    </Paper>
  );
};

const PlanFeatureList = ({ items, iconColor, textColor }) => (
  <List disablePadding sx={{ display: "grid", gap: 0.25 }}>
    {items.map((item, index) => (
      <ListItem key={index} disableGutters sx={{ py: 0.7, alignItems: "flex-start" }}>
        <ListItemIcon sx={{ minWidth: 30, mt: 0.25 }}>
          <CheckIcon sx={{ color: iconColor, fontSize: 18 }} />
        </ListItemIcon>
        <ListItemText
          primary={item}
          primaryTypographyProps={{ fontSize: 16, lineHeight: 1.55, color: textColor }}
        />
      </ListItem>
    ))}
  </List>
);

// ══════════════════════════════════════════
// Component
// ══════════════════════════════════════════

const Subscribe = () => {
  const [snack, setSnack] = useState({ open: false, msg: "", severity: "success" });
  const [loadingId, setLoadingId] = useState(null);
  const [credits, setCredits] = useState(null);
  const plansRef = useRef(null);
  const [invSub, setInvSub] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [proBilling, setProBilling] = useState("yearly");

  const showMsg = (msg, severity = "success") => setSnack({ open: true, msg, severity });

  // ── Load data ──

  useEffect(() => {
    api
      .get("/me/")
      .then((res) => setCredits(res.data.credits))
      .catch(() => setCredits(null));
  }, []);

  useEffect(() => {
    api
      .get("/inv/subscription/", { withCredentials: true })
      .then((res) => setInvSub(res.data))
      .catch(() => setInvSub(null));
  }, []);

  useEffect(() => {
    if (window.location.hash === "#planai" && plansRef.current) {
      setTimeout(() => {
        plansRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    }
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("success")) {
      showMsg("Mokėjimas pavyko! Kreditai netrukus atsiras Jūsų paskyroje. PDF sąskaitą galite atsisiųsti iš Paskyra → Mokėjimų istorija.");
    }
    if (query.get("canceled")) {
      showMsg("Mokėjimas atšauktas. Bandykite dar kartą arba pasirinkite kitą paketą.", "error");
    }
    if (query.get("inv_success")) {
      showMsg("PRO planas aktyvuotas! Galite naudotis visomis funkcijomis.");
    }
    if (query.get("inv_canceled")) {
      showMsg("Mokėjimas atšauktas.", "error");
    }
  }, []);

  // ── Handlers ──

  const handleCheckout = async (priceId) => {
    setLoadingId(priceId);

    try {
      const res = await fetch(`${config.BASE_API_URL}stripe/credit-checkout/`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price_id: priceId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Nežinoma klaida");
      }

      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      showMsg(err.message, "error");
      setLoadingId(null);
    }
  };

  const handleInvCheckout = async (billing = "yearly") => {
    setLoadingId("inv_pro");

    try {
      const res = await api.post("/inv/subscribe-checkout/", { billing }, { withCredentials: true });
      window.location.href = res.data.url;
    } catch (err) {
      showMsg(err.response?.data?.error || err.message, "error");
      setLoadingId(null);
    }
  };

  const handleCancelSubscription = async () => {
    setCancelLoading(true);
    setCancelDialog(false);

    try {
      const res = await api.post("/inv/cancel-subscription/", {}, { withCredentials: true });
      setInvSub(res.data);
      showMsg(`PRO planas atšauktas. Funkcijomis galite naudotis iki ${res.data.plan_end_display}.`);
    } catch (err) {
      showMsg(err.response?.data?.error || err.message, "error");
    } finally {
      setCancelLoading(false);
    }
  };

  // ── Data ──

  const plans = [
    { credits: 100, cost: "€18,00", priceId: "price_1RfxUWIaJDydaLBY6Y3MGrBj", docPrice: "0,18 €" },
    { credits: 500, cost: "€85,00", priceId: "price_1RfxWUIaJDydaLBYJomOA1FD", discount: "-5%", docPrice: "0,17 €", tag: "Dažniausiai perkamas" },
    { credits: 1000, cost: "€162,00", priceId: "price_1RfxY1IaJDydaLBY4YXDNSAO", discount: "-10%", docPrice: "0,162 €" },
    { credits: 5000, cost: "€765,00", priceId: "price_1SjdLJIaJDydaLBYKixOTMNc", discount: "-15%", docPrice: "0,153 €" },
    { credits: 10000, cost: "€1440,00", priceId: "price_1SjdMMIaJDydaLBYAMXtAUra", discount: "-20%", docPrice: "0,144 €" },
  ];

  const FREE_FEATURES = [
    "Neribotas sąskaitų išrašymas",
    "Neribotos PDF sąskaitos",
    "Greitas sąskaitų dublikavimas",
    "Įmonių duomenys iš Registrų Centro",
    "Sąskaitų išsiuntimas el. paštu (iki 10 sąskaitų / mėn.)",
    "Sąskaitų duomenų eksportas į i.SAF ir 15 apskaitos programų (Rivilė, Finvalda, Centas…) (iki 10 sąskaitų / mėn.)",
    "Prekių / paslaugų katalogas (galimas importas iš jūsų apskaitos programos)",
    "DokSkenas logotipas sąskaitos poraštėje",
  ];

  const PRO_FEATURES = [
    "Apmokėjimo mygtukas sąskaitose (per Montonio / Paysera)",
    "Periodinės sąskaitos",
    "Neribotas sąskaitų išsiuntimas el. paštu",
    "Neribotas sąskaitų duomenų eksportas į i.SAF ir 15 apskaitos programų (Rivilė, Finvalda, Centas…)",
    "Banko išrašų importas ir automatinis apmokėjimų susiejimas su sąskaitomis",
    "Automatiniai apmokėjimų priminimai el. paštu",
    "Jūsų logotipas sąskaitose",
    "Be DokSkenas logotipo sąskaitos poraštėje",
  ];

  // ══════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════

  return (
    <Box sx={{ minHeight: "100vh", pb: { xs: 8, md: 10 }, bgcolor: BRAND.bg }}>
      <Helmet>
        <title>Papildyti - DokSkenas</title>
        <meta name="description" content="Įsigykite kreditų ir sąskaitų išrašymo planą." />
      </Helmet>

      <Container maxWidth="xl" sx={{ pt: { xs: 4, md: 6 }, px: { xs: 2, sm: 3 } }}>

        {/* ═══════════════════════════════════════════
            1. Sąskaitų skaitmenizavimo kreditai
           ═══════════════════════════════════════════ */}

        <Box sx={{ textAlign: "center", mb: { xs: 4, md: 5 } }}>
          <SectionHeading title="Sąskaitų skaitmenizavimo kreditai" subtitle="Pasirinkite kreditų paketą">
            <Chip
              label={`Turite ${credits !== null ? credits : "…"} kreditų`}
              sx={{
                mt: 1,
                mb: 2,
                px: 1,
                height: 40,
                borderRadius: "999px",
                fontWeight: 700,
                fontSize: 15,
                color: BRAND.text,
                bgcolor: "#ffffff",
                border: `1px solid ${BRAND.border}`,
                boxShadow: "0 10px 30px rgba(17, 24, 39, 0.06)",
              }}
            />
          </SectionHeading>
        </Box>

        <Box sx={{ maxWidth: 1180, mx: "auto" }}>
          <Grid2 container spacing={{ xs: 2, sm: 2.5, md: 3 }} justifyContent="center">
            {plans.map((plan, index) => (
              <Grid2
                key={plan.credits}
                xs={12}
                sm={6}
                md={index < 3 ? 4 : 6}
                lg={index < 3 ? 4 : 6}
                display="flex"
                justifyContent="center"
                order={{
                  xs: plan.credits === 500 ? -1 : 0,
                  sm: plan.credits === 500 ? -1 : 0,
                  md: 0,
                }}
              >
                <CreditPlanCard plan={plan} loadingId={loadingId} onCheckout={handleCheckout} />
              </Grid2>
            ))}
          </Grid2>
        </Box>

        {/* ═══════════════════════════════════════════
            2. Sąskaitų išrašymo planai
           ═══════════════════════════════════════════ */}

        <Box
          ref={plansRef}
          sx={{ maxWidth: 1180, mx: "auto", mt: { xs: 8, md: 10 }, scrollMarginTop: "24px" }}
        >
          <SectionHeading
            title="Sąskaitų išrašymo planai"
            subtitle="Įsigykite PRO planą papildomoms funkcijoms bei neribotam naudojimui."
          >
            <Box
              sx={{
                display: "flex",
                bgcolor: alpha("#111827", 0.05),
                borderRadius: "12px",
                p: 0.5,
                mb: 2,
                mt: 2,
                width: "fit-content",
                mx: "auto",
              }}
            >
              {[
                { key: "yearly", label: "Metinis" },
                { key: "monthly", label: "Mėnesinis" },
              ].map(({ key, label }) => (
                <Button
                  key={key}
                  size="small"
                  onClick={() => setProBilling(key)}
                  sx={{
                    px: 2.5,
                    py: 0.75,
                    borderRadius: "10px",
                    textTransform: "none",
                    fontWeight: 700,
                    fontSize: 14,
                    color: proBilling === key ? BRAND.text : BRAND.muted,
                    bgcolor: proBilling === key ? "#ffffff" : "transparent",
                    boxShadow: proBilling === key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                    "&:hover": {
                      bgcolor: proBilling === key ? "#ffffff" : alpha("#111827", 0.04),
                    },
                  }}
                >
                  {label}
                </Button>
              ))}
            </Box>
            <Typography sx={{ fontSize: 14, color: BRAND.accentDark, fontWeight: 600, mb: 1 }}>
              Sutaupykite 17% įsigiję metinį planą
            </Typography>
          </SectionHeading>

          <Grid2 container spacing={{ xs: 2.5, md: 3 }} justifyContent="center">
            {/* ── Nemokamas ── */}
            <Grid2 xs={12} md={6} display="flex" justifyContent="center" order={{ xs: 2, md: 1 }}>
              <Paper
                elevation={0}
                sx={{
                  width: "100%",
                  maxWidth: 520,
                  minHeight: "100%",
                  p: { xs: 2.5, sm: 3.5 },
                  borderRadius: "24px",
                  bgcolor: "#ffffff",
                  border: `1px solid ${BRAND.border}`,
                  boxShadow: "none",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Box
                  sx={{
                    width: 48, height: 48, borderRadius: "14px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    bgcolor: alpha("#111827", 0.04), mb: 2,
                  }}
                >
                  <LockOpenIcon sx={{ color: BRAND.text, fontSize: 26 }} />
                </Box>

                <Typography
                  variant="h5"
                  sx={{ fontWeight: 800, color: BRAND.text, fontSize: { xs: "26px", sm: "28px" }, mb: 1 }}
                >
                  Nemokamas
                </Typography>

                <Box sx={{ display: "flex", alignItems: "baseline", mb: 2.75 }}>
                  <Typography
                    sx={{
                      fontWeight: 800,
                      fontSize: { xs: "38px", sm: "42px" },
                      color: BRAND.text,
                      lineHeight: 1,
                      letterSpacing: "-0.03em",
                    }}
                  >
                    €0
                  </Typography>
                  <Typography sx={{ ml: 0.75, color: BRAND.muted, fontSize: 16 }}>/ mėn.</Typography>
                </Box>

                <Box sx={{ flexGrow: 1 }}>
                  <PlanFeatureList items={FREE_FEATURES} iconColor="#43a047" textColor={BRAND.text} />
                </Box>

                <Button
                  variant="outlined"
                  fullWidth
                  href="/israsymas"
                  sx={{
                    mt: 3, py: 1.5, borderRadius: "14px", fontWeight: 700, fontSize: 15,
                    textTransform: "none", borderColor: BRAND.border, color: BRAND.text, boxShadow: "none",
                    "&:hover": { borderColor: "#d1d5db", bgcolor: alpha("#111827", 0.02), boxShadow: "none" },
                  }}
                >
                  {invSub?.status === "active" ? "Nemokamas" : "Jau naudojate"}
                </Button>
              </Paper>
            </Grid2>

            {/* ── PRO ── */}
            <Grid2 xs={12} md={6} display="flex" justifyContent="center" order={{ xs: 1, md: 2 }}>
              <Paper
                elevation={0}
                sx={{
                  width: "100%",
                  maxWidth: 520,
                  minHeight: "100%",
                  p: { xs: 2.5, sm: 3.5 },
                  borderRadius: "24px",
                  border: `1px solid ${alpha(BRAND.accent, 0.45)}`,
                  background: "linear-gradient(180deg, rgba(245, 190, 13, 0.22) 0%, rgba(245, 190, 13, 0.12) 18%, rgba(245, 190, 13, 0.05) 34%, #ffffff 58%, #ffffff 100%)",
                  boxShadow: "0 28px 68px rgba(17, 24, 39, 0.13)",
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "visible",
                }}
              >
                <Chip
                  label="Rekomenduojamas"
                  size="small"
                  sx={{
                    position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
                    fontWeight: 800, fontSize: 12, height: 28, color: "#2b2100", bgcolor: BRAND.accent,
                    borderRadius: "999px", boxShadow: "0 10px 24px rgba(245, 190, 13, 0.28)",
                    "& .MuiChip-label": { px: 1.5 },
                  }}
                />

                <Box
                  sx={{
                    width: 48, height: 48, borderRadius: "14px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    bgcolor: alpha(BRAND.accent, 0.12), mb: 2, mt: 1,
                  }}
                >
                  <StarIcon sx={{ color: BRAND.accentDark, fontSize: 26 }} />
                </Box>

                <Typography
                  variant="h5"
                  sx={{ fontWeight: 800, color: BRAND.text, fontSize: { xs: "26px", sm: "28px" }, mb: 1 }}
                >
                  PRO
                </Typography>

                <Box sx={{ display: "flex", alignItems: "baseline", mb: 0.25 }}>
                  <Typography
                    sx={{
                      fontWeight: 800,
                      fontSize: { xs: "38px", sm: "42px" },
                      color: BRAND.text,
                      lineHeight: 1,
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {proBilling === "yearly" ? "€9,99" : "€11,99"}
                  </Typography>
                  <Typography sx={{ ml: 0.75, color: BRAND.muted, fontSize: 16 }}>/ mėn.</Typography>
                </Box>

                {proBilling === "yearly" && (
                  <Typography sx={{ fontSize: 13, color: BRAND.muted, mb: 0.75 }}>
                    Mokama iš karto €119,88 už metus
                  </Typography>
                )}

                <Typography
                  sx={{
                    fontSize: 13, fontWeight: 800, color: BRAND.accentDark,
                    mb: 2.25, mt: proBilling === "yearly" ? 0 : 1,
                    textTransform: "uppercase", letterSpacing: "0.05em",
                  }}
                >
                  Visos Nemokamo plano funkcijos, plius:
                </Typography>

                <Box sx={{ flexGrow: 1 }}>
                  <PlanFeatureList items={PRO_FEATURES} iconColor={BRAND.accentDark} textColor={BRAND.text} />
                </Box>

                {invSub?.status === "active" ? (
                  <Box sx={{ mt: 3 }}>
                    <Box
                      sx={{
                        p: 2, borderRadius: "16px", mb: 1.5,
                        bgcolor: BRAND.successSoft, border: `1px solid ${BRAND.successBorder}`,
                      }}
                    >
                      <Typography sx={{ color: BRAND.successText, fontWeight: 700, fontSize: 15, mb: 0.5 }}>
                        ✓ PRO planas aktyvus
                      </Typography>
                      {invSub.plan_end_display && (
                        <Typography sx={{ color: BRAND.muted, fontSize: 13, lineHeight: 1.5 }}>
                          {invSub.cancel_at_period_end
                            ? `Planas baigsis: ${invSub.plan_end_display}`
                            : `Sekantis apmokėjimas: ${invSub.plan_end_display}`}
                        </Typography>
                      )}
                    </Box>

                    {!invSub.cancel_at_period_end && (
                      <Button
                        variant="text"
                        fullWidth
                        onClick={() => setCancelDialog(true)}
                        disabled={cancelLoading}
                        sx={{
                          color: BRAND.muted, fontSize: 13, fontWeight: 600,
                          textTransform: "none", borderRadius: "12px", boxShadow: "none",
                          "&:hover": { color: BRAND.danger, bgcolor: alpha(BRAND.danger, 0.06), boxShadow: "none" },
                        }}
                      >
                        {cancelLoading ? "Atšaukiama..." : "Atšaukti planą"}
                      </Button>
                    )}

                    {invSub.cancel_at_period_end && (
                      <Typography
                        sx={{ color: BRAND.accentDark, fontSize: 13, textAlign: "center", mt: 1, lineHeight: 1.5 }}
                      >
                        Planas atšauktas. PRO funkcijos veiks iki {invSub.plan_end_display}.
                      </Typography>
                    )}
                  </Box>
                ) : (
                  <Button
                    variant="contained"
                    fullWidth
                    onClick={() => handleInvCheckout(proBilling)}
                    disabled={loadingId === "inv_pro"}
                    sx={{
                      mt: 3, py: 1.5, borderRadius: "14px", fontWeight: 700, fontSize: 15,
                      textTransform: "none", bgcolor: BRAND.accent, color: "#111111", boxShadow: "none",
                      "&:hover": { bgcolor: BRAND.accentDark, boxShadow: "none" },
                      "&.Mui-disabled": { bgcolor: alpha(BRAND.accent, 0.45), color: alpha("#111111", 0.6) },
                    }}
                  >
                    {loadingId === "inv_pro" ? "Vykdoma…" : "Įsigyti PRO planą"}
                  </Button>
                )}
              </Paper>
            </Grid2>
          </Grid2>
        </Box>
      </Container>

      {/* ── Cancel dialog ── */}
      <Dialog
        open={cancelDialog}
        onClose={() => setCancelDialog(false)}
        maxWidth="xs"
        fullWidth
        disableScrollLock
        PaperProps={{
          sx: { borderRadius: "22px", p: 0.5, boxShadow: "none", border: `1px solid ${BRAND.border}` },
        }}
      >
        <DialogTitle sx={{ pt: 3, px: 3, pb: 1, fontWeight: 800, fontSize: 22, color: BRAND.text }}>
          Atšaukti PRO planą?
        </DialogTitle>
        <DialogContent sx={{ px: 3, pb: 1 }}>
          <Typography sx={{ color: BRAND.muted, fontSize: 15, lineHeight: 1.7 }}>
            Atšaukus planą, PRO funkcijomis galėsite naudotis iki dabartinio mokėjimo laikotarpio pabaigos.
            Po to bus taikomas nemokamas planas su ribojimais.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, pt: 1.5, gap: 1 }}>
          <Button
            onClick={() => setCancelDialog(false)}
            sx={{ color: BRAND.muted, textTransform: "none", fontWeight: 700, borderRadius: "12px", px: 2 }}
          >
            Grįžti
          </Button>
          <Button
            variant="contained"
            onClick={handleCancelSubscription}
            sx={{
              bgcolor: BRAND.danger, textTransform: "none", fontWeight: 700, borderRadius: "12px",
              px: 2, boxShadow: "none", "&:hover": { bgcolor: "#b71c1c", boxShadow: "none" },
            }}
          >
            Atšaukti planą
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Snackbar ── */}
      <Snackbar
        open={snack.open}
        autoHideDuration={5000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snack.severity}
          variant="filled"
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          sx={{ borderRadius: "12px" }}
        >
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Subscribe;





// import "../styles/infoPage.css";
// import { Helmet } from "react-helmet";
// import { useState, useEffect, useRef } from "react";
// import config from "../config";
// import {
//   Box,
//   Typography,
//   Button,
//   List,
//   ListItem,
//   ListItemIcon,
//   ListItemText,
//   Chip,
// } from "@mui/material";
// import { Grid2 } from "@mui/material";
// import CheckIcon from "@mui/icons-material/Check";
// import LockOpenIcon from "@mui/icons-material/LockOpen";
// import StarIcon from "@mui/icons-material/Star";
// import { api } from "../api/endpoints";

// const Subscribe = () => {
//   const [message, setMessage] = useState("");
//   const [loadingId, setLoadingId] = useState(null);
//   const [credits, setCredits] = useState(null);
//   const plansRef = useRef(null);
//   const [invSub, setInvSub] = useState(null);
//   const [cancelLoading, setCancelLoading] = useState(false);
//   const [cancelDialog, setCancelDialog] = useState(false);

//   useEffect(() => {
//     api
//       .get("/me/")
//       .then((res) => setCredits(res.data.credits))
//       .catch(() => setCredits(null));
//   }, []);

//   useEffect(() => {
//     api.get('/inv/subscription/', { withCredentials: true })
//       .then((res) => setInvSub(res.data))
//       .catch(() => setInvSub(null));
//   }, []);

//   // Scroll to plans section if hash is #planai
//   useEffect(() => {
//     if (window.location.hash === "#planai" && plansRef.current) {
//       setTimeout(() => {
//         plansRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
//       }, 300);
//     }
//   }, []);

//   useEffect(() => {
//     const query = new URLSearchParams(window.location.search);
//     if (query.get("success")) {
//       setMessage(
//         "🎉 Mokėjimas pavyko! Kreditai netrukus atsiras Jūsų paskyroje. PDF sąskaitą galite atsisiųsti iš Paskyra (ikonėlė) -> Mokėjimų istorija"
//       );
//     }
//     if (query.get("canceled")) {
//       setMessage(
//         "❌ Mokėjimas atšauktas. Bandykite dar kartą arba pasirinkite kitą paketą."
//       );
//     }
//     if (query.get("inv_success")) {
//       setMessage("🎉 PRO planas aktyvuotas! Galite naudotis visomis funkcijomis. PDF sąskaitą galite atsisiųsti iš Paskyra (ikonėlė) -> Mokėjimų istorija");
//     }
//     if (query.get("inv_canceled")) {
//       setMessage("❌ Mokėjimas atšauktas.");
//     }
//   }, []);

//   const handleCheckout = async (priceId) => {
//     setLoadingId(priceId);
//     setMessage("");

//     try {
//       const res = await fetch(
//         `${config.BASE_API_URL}stripe/credit-checkout/`,
//         {
//           method: "POST",
//           credentials: "include",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify({ price_id: priceId }),
//         }
//       );

//       if (!res.ok) {
//         const err = await res.json();
//         throw new Error(err.error || "Nežinoma klaida");
//       }

//       const { url } = await res.json();
//       window.location.href = url;
//     } catch (err) {
//       setMessage(`Klaida: ${err.message}`);
//       setLoadingId(null);
//     }
//   };

//   const scrollToPlans = () => {
//     if (plansRef.current) {
//       plansRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
//     }
//   };

//   const handleInvCheckout = async () => {
//     setLoadingId('inv_pro');
//     setMessage("");
//     try {
//       const res = await api.post('/inv/subscribe-checkout/', {}, { withCredentials: true });
//       window.location.href = res.data.url;
//     } catch (err) {
//       setMessage(`Klaida: ${err.response?.data?.error || err.message}`);
//       setLoadingId(null);
//     }
//   };

//   const handleCancelSubscription = async () => {
//     setCancelLoading(true);
//     setCancelDialog(false);
//     try {
//       const res = await api.post('/inv/cancel-subscription/', {}, { withCredentials: true });
//       setInvSub(res.data);
//       setMessage(`PRO planas atšauktas. Funkcijomis galite naudotis iki ${res.data.plan_end_display}.`);
//     } catch (err) {
//       setMessage(`Klaida: ${err.response?.data?.error || err.message}`);
//     } finally {
//       setCancelLoading(false);
//     }
//   };

//   const plans = [
//     {
//       credits: 100,
//       cost: "€18,00",
//       priceId: "price_1RfxUWIaJDydaLBY6Y3MGrBj",
//       docPrice: "0,18 €",
//     },
//     {
//       credits: 500,
//       cost: "€85,00",
//       priceId: "price_1RfxWUIaJDydaLBYJomOA1FD",
//       discount: "-5%",
//       docPrice: "0,17 €",
//       tag: "Dažniausiai perkamas",
//     },
//     {
//       credits: 1000,
//       cost: "€162,00",
//       priceId: "price_1RfxY1IaJDydaLBY4YXDNSAO",
//       discount: "-10%",
//       docPrice: "0,162 €",
//     },
//     {
//       credits: 5000,
//       cost: "€765,00",
//       priceId: "price_1SjdLJIaJDydaLBYKixOTMNc",
//       discount: "-15%",
//       docPrice: "0,153 €",
//     },
//     {
//       credits: 10000,
//       cost: "€1440,00",
//       priceId: "price_1SjdMMIaJDydaLBYAMXtAUra",
//       discount: "-20%",
//       docPrice: "0,144 €",
//     },
//   ];

//   const FREE_FEATURES = [
//     "Neribotas sąskaitų išrašymas",
//     "Neribotos PDF sąskaitos",
//     "Greitas sąskaitų dublikavimas",
//     "Įmonių duomenys iš Registrų Centro",
//     "Sąskaitų išsiuntimas el. paštu (iki 10 sąskaitų / mėn.)",
//     "Sąskaitų duomenų eksportas į i.SAF ir 15 apskaitos programų (Rivilė, Finvalda, Centas…) (iki 10 sąskaitų / mėn.)",
//     "Prekių / paslaugų katalogas (galimas importas iš jūsų apskaitos programos)",
//     "DokSkenas logotipas sąskaitos poraštėje",
//   ];

//   const PRO_FEATURES = [
//     "Apmokėjimo mygtukas sąskaitose (per Montonio / Paysera)",
//     "Periodinės sąskaitos",
//     "Neribotas sąskaitų išsiuntimas el. paštu",
//     "Neribotas sąskaitų duomenų eksportas į i.SAF ir 15 apskaitos programų (Rivilė, Finvalda, Centas…)",
//     "Banko išrašų importas ir automatinis apmokėjimų susiejimas su sąskaitomis",
//     "Automatiniai apmokėjimų priminimai el. paštu",
//     "Jūsų logotipas sąskaitose",
//     "Be DokSkenas logotipo sąskaitos poraštėje",
//   ];

//   return (
//     <Box sx={{ p: 2, bgcolor: "#f5f5f5", minHeight: "100vh", pb: "70px" }}>
//       <Helmet>
//         <title>Papildyti - DokSkenas</title>
//         <meta
//           name="description"
//           content="Įsigykite kreditų ir sąskaitų išrašymo planą."
//         />
//       </Helmet>

//       {/* ═══════════════════════════════════════════
//           1. Sąskaitų skaitmenizavimo kreditai
//          ═══════════════════════════════════════════ */}

//       <Typography
//         variant="body1"
//         sx={{
//           textAlign: "center",
//           fontSize: "18px",
//           mb: 3,
//           color: "#1b1b1b",
//           fontWeight: 500,
//           fontFamily: "Helvetica",
//         }}
//       >
//         Turite <b>{credits !== null ? credits : "…"}</b> kreditų
//       </Typography>

//       <Typography
//         variant="h1"
//         sx={{ fontSize: "35px", fontWeight: 600, mb: 1, textAlign: "center" }}
//       >
//         Sąskaitų skaitmenizavimo kreditai
//       </Typography>
//       <Typography
//         variant="body1"
//         sx={{ textAlign: "center", fontSize: "18px", mb: 3 }}
//       >
//         Pasirinkite kreditų paketą
//       </Typography>

//       {message && (
//         <Typography
//           variant="body1"
//           sx={{
//             textAlign: "center",
//             color: message.startsWith("Klaida") ? "error.main" : "success.main",
//             mb: 3,
//           }}
//         >
//           {message}
//         </Typography>
//       )}

//       <Box sx={{ maxWidth: 1100, mx: "auto" }}>
//         <Grid2 container spacing={4} justifyContent="center">
//           {plans.map((plan, index) => (
//             <Grid2
//               key={plan.credits}
//               xs={12}
//               sm={6}
//               md={index < 3 ? 4 : 6}
//               lg={index < 3 ? 4 : 6}
//               xl={index < 3 ? 4 : 6}
//               display="flex"
//               justifyContent="center"
//             >
//               {plan.credits === 500 ? (
//                 <Box
//                   sx={{
//                     width: "100%",
//                     maxWidth: 320,
//                     borderRadius: 3,
//                     p: 1.5,
//                     background:
//                       "linear-gradient(135deg, #f5cf54, #f5be0d, #f18f01)",
//                     position: "relative",
//                     fontFamily: "Helvetica, Arial, sans-serif",
//                   }}
//                 >
//                   {plan.tag && (
//                     <Box
//                       sx={{
//                         position: "absolute",
//                         top: 0,
//                         left: "50%",
//                         transform: "translate(-50%, -50%)",
//                         bgcolor: "#f5cf54",
//                         color: "#000",
//                         fontSize: 12,
//                         fontWeight: "bold",
//                         px: 2,
//                         py: 0.5,
//                         borderRadius: "999px",
//                         boxShadow: "0 2px 4px rgba(0,0,0,0.25)",
//                         whiteSpace: "nowrap",
//                       }}
//                     >
//                       {plan.tag}
//                     </Box>
//                   )}

//                   <Box
//                     sx={{
//                       width: "100%",
//                       borderRadius: 2,
//                       bgcolor: "#1b1b1b",
//                       color: "#fff",
//                       display: "flex",
//                       flexDirection: "column",
//                       p: 3,
//                     }}
//                   >
//                     <Typography variant="h5" sx={{ fontWeight: "bold", mb: 1 }}>
//                       {plan.credits} kreditų
//                     </Typography>
//                     <Box sx={{ display: "flex", alignItems: "baseline", mb: 2 }}>
//                       <Typography variant="h3" sx={{ fontWeight: "bold", fontSize: "36px" }}>
//                         {plan.cost}
//                       </Typography>
//                       {plan.discount && (
//                         <Typography variant="subtitle2" sx={{ ml: 1, color: "#f5cf54" }}>
//                           {plan.discount}
//                         </Typography>
//                       )}
//                     </Box>

//                     <List dense sx={{ flexGrow: 1 }}>
//                       <ListItem disableGutters>
//                         <ListItemIcon sx={{ minWidth: 32 }}>
//                           <CheckIcon sx={{ color: "#f5cf54" }} />
//                         </ListItemIcon>
//                         <ListItemText primary="1 kreditas = 1 dokumentas" />
//                       </ListItem>
//                       <ListItem disableGutters>
//                         <ListItemIcon sx={{ minWidth: 32 }}>
//                           <CheckIcon sx={{ color: "#f5cf54" }} />
//                         </ListItemIcon>
//                         <ListItemText primary={`Dokumento kaina – ${plan.docPrice}`} />
//                       </ListItem>
//                       <ListItem disableGutters>
//                         <ListItemIcon sx={{ minWidth: 32 }}>
//                           <CheckIcon sx={{ color: "#f5cf54" }} />
//                         </ListItemIcon>
//                         <ListItemText primary="Galiojimas – neribotas" />
//                       </ListItem>
//                     </List>

//                     <Button
//                       variant="contained"
//                       fullWidth
//                       onClick={() => handleCheckout(plan.priceId)}
//                       disabled={loadingId === plan.priceId}
//                       sx={{
//                         mt: 3,
//                         bgcolor: "#f5be0d",
//                         color: "black",
//                         fontWeight: "bold",
//                         py: 1.5,
//                         "&:hover": { bgcolor: "#d4ae4a" },
//                       }}
//                     >
//                       {loadingId === plan.priceId ? "Įkeliama…" : `Pirkti ${plan.credits}`}
//                     </Button>
//                   </Box>
//                 </Box>
//               ) : (
//                 <Box
//                   sx={{
//                     width: "100%",
//                     maxWidth: 320,
//                     p: 4,
//                     borderRadius: 2,
//                     bgcolor: "#1b1b1b",
//                     color: "#fff",
//                     display: "flex",
//                     flexDirection: "column",
//                     fontFamily: "Helvetica, Arial, sans-serif",
//                   }}
//                 >
//                   <Typography variant="h5" sx={{ fontWeight: "bold", mb: 1 }}>
//                     {plan.credits} kreditų
//                   </Typography>
//                   <Box sx={{ display: "flex", alignItems: "baseline", mb: 2 }}>
//                     <Typography variant="h3" sx={{ fontWeight: "bold", fontSize: "36px" }}>
//                       {plan.cost}
//                     </Typography>
//                     {plan.discount && (
//                       <Typography variant="subtitle2" sx={{ ml: 1, color: "#f5cf54" }}>
//                         {plan.discount}
//                       </Typography>
//                     )}
//                   </Box>

//                   <List dense sx={{ flexGrow: 1 }}>
//                     <ListItem disableGutters>
//                       <ListItemIcon sx={{ minWidth: 32 }}>
//                         <CheckIcon sx={{ color: "#f5cf54" }} />
//                       </ListItemIcon>
//                       <ListItemText primary="1 kreditas = 1 dokumentas" />
//                     </ListItem>
//                     <ListItem disableGutters>
//                       <ListItemIcon sx={{ minWidth: 32 }}>
//                         <CheckIcon sx={{ color: "#f5cf54" }} />
//                       </ListItemIcon>
//                       <ListItemText primary={`Dokumento kaina – ${plan.docPrice}`} />
//                     </ListItem>
//                     <ListItem disableGutters>
//                       <ListItemIcon sx={{ minWidth: 32 }}>
//                         <CheckIcon sx={{ color: "#f5cf54" }} />
//                       </ListItemIcon>
//                       <ListItemText primary="Galiojimas – neribotas" />
//                     </ListItem>
//                   </List>

//                   <Button
//                     variant="contained"
//                     fullWidth
//                     onClick={() => handleCheckout(plan.priceId)}
//                     disabled={loadingId === plan.priceId}
//                     sx={{
//                       mt: 3,
//                       bgcolor: "#f5be0d",
//                       color: "black",
//                       fontWeight: "bold",
//                       py: 1.5,
//                       "&:hover": { bgcolor: "#d4ae4a" },
//                     }}
//                   >
//                     {loadingId === plan.priceId ? "Įkeliama…" : `Pirkti ${plan.credits}`}
//                   </Button>
//                 </Box>
//               )}
//             </Grid2>
//           ))}
//         </Grid2>
//       </Box>

//       {/* ═══════════════════════════════════════════
//           2. Sąskaitų išrašymo planai
//          ═══════════════════════════════════════════ */}

//       <Box
//         ref={plansRef}
//         sx={{
//           maxWidth: 1100,
//           mx: "auto",
//           mt: 8,
//           pt: 2,
//           scrollMarginTop: "24px",
//         }}
//       >
//         <Typography
//           variant="h1"
//           sx={{ fontSize: "35px", fontWeight: 600, mb: 1, textAlign: "center" }}
//         >
//           Sąskaitų išrašymo planai
//         </Typography>
//         <Typography
//           variant="body1"
//           sx={{ textAlign: "center", fontSize: "18px", mb: 4, color: "#555" }}
//         >
//           Įsigykite PRO planą papildomoms funkcijoms bei neribotam naudojimui
//         </Typography>

//         <Grid2 container spacing={4} justifyContent="center">
//           {/* ── Nemokamas ── */}
//           <Grid2 xs={12} md={6} display="flex" justifyContent="center">
//             <Box
//               sx={{
//                 width: "100%",
//                 maxWidth: 480,
//                 p: 4,
//                 borderRadius: 3,
//                 bgcolor: "#fff",
//                 border: "2px solid #e0e0e0",
//                 display: "flex",
//                 flexDirection: "column",
//                 fontFamily: "Helvetica, Arial, sans-serif",
//               }}
//             >
//               <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
//                 <LockOpenIcon sx={{ color: "#555", fontSize: 28 }} />
//                 <Typography variant="h5" sx={{ fontWeight: 700, color: "#1b1b1b" }}>
//                   Nemokamas
//                 </Typography>
//               </Box>

//               <Box sx={{ display: "flex", alignItems: "baseline", mb: 2.5 }}>
//                 <Typography sx={{ fontWeight: 800, fontSize: "36px", color: "#1b1b1b" }}>
//                   €0
//                 </Typography>
//                 <Typography sx={{ ml: 0.5, color: "#888", fontSize: 16 }}>
//                   / mėn.
//                 </Typography>
//               </Box>

//               <List dense sx={{ flexGrow: 1 }}>
//                 {FREE_FEATURES.map((f, i) => (
//                   <ListItem key={i} disableGutters sx={{ py: 0.5, alignItems: "flex-start" }}>
//                     <ListItemIcon sx={{ minWidth: 32, mt: 0.5 }}>
//                       <CheckIcon sx={{ color: "#43a047", fontSize: 20 }} />
//                     </ListItemIcon>
//                     <ListItemText
//                       primary={f}
//                       primaryTypographyProps={{ fontSize: 14, color: "#333", lineHeight: 1.5 }}
//                     />
//                   </ListItem>
//                 ))}
//               </List>

//               <Button
//                 variant="outlined"
//                 fullWidth
//                 href="/israsymas"
//                 sx={{
//                   mt: 3,
//                   py: 1.5,
//                   fontWeight: 600,
//                   borderColor: "#ccc",
//                   color: "#555",
//                   "&:hover": { borderColor: "#999", bgcolor: "#fafafa" },
//                 }}
//               >
//                 Jau naudojate
//               </Button>
//             </Box>
//           </Grid2>

//           {/* ── PRO ── */}
//           <Grid2 xs={12} md={6} display="flex" justifyContent="center">
//             <Box
//               sx={{
//                 width: "100%",
//                 maxWidth: 480,
//                 borderRadius: 3,
//                 p: 1.5,
//                 background: "linear-gradient(135deg, #f5cf54, #f5be0d, #f18f01)",
//                 position: "relative",
//                 fontFamily: "Helvetica, Arial, sans-serif",
//               }}
//             >
//               <Box
//                 sx={{
//                   position: "absolute",
//                   top: 0,
//                   left: "50%",
//                   transform: "translate(-50%, -50%)",
//                   bgcolor: "#f5cf54",
//                   color: "#000",
//                   fontSize: 12,
//                   fontWeight: "bold",
//                   px: 2,
//                   py: 0.5,
//                   borderRadius: "999px",
//                   boxShadow: "0 2px 4px rgba(0,0,0,0.25)",
//                   whiteSpace: "nowrap",
//                 }}
//               >
//                 Rekomenduojamas
//               </Box>

//               <Box
//                 sx={{
//                   width: "100%",
//                   borderRadius: 2,
//                   bgcolor: "#1b1b1b",
//                   color: "#fff",
//                   display: "flex",
//                   flexDirection: "column",
//                   p: 4,
//                 }}
//               >
//                 <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
//                   <StarIcon sx={{ color: "#f5cf54", fontSize: 28 }} />
//                   <Typography variant="h5" sx={{ fontWeight: 700 }}>
//                     PRO
//                   </Typography>
//                 </Box>

//                 <Box sx={{ display: "flex", alignItems: "baseline", mb: 0.5 }}>
//                   <Typography sx={{ fontWeight: 800, fontSize: "36px" }}>
//                     €11,99
//                   </Typography>
//                   <Typography sx={{ ml: 0.5, color: "#aaa", fontSize: 16 }}>
//                     / mėn.
//                   </Typography>
//                 </Box>

//                 <Typography
//                   sx={{
//                     fontSize: 13,
//                     fontWeight: 600,
//                     color: "#f5cf54",
//                     mb: 1,
//                     textTransform: "uppercase",
//                     letterSpacing: "0.04em",
//                   }}
//                 >
//                   Visos Nemokamo plano funkcijos, plius:
//                 </Typography>

//                 <List dense sx={{ flexGrow: 1 }}>
//                   {PRO_FEATURES.map((f, i) => (
//                     <ListItem key={i} disableGutters sx={{ py: 0.5, alignItems: "flex-start" }}>
//                       <ListItemIcon sx={{ minWidth: 32, mt: 0.5 }}>
//                         <CheckIcon sx={{ color: "#f5cf54", fontSize: 20 }} />
//                       </ListItemIcon>
//                       <ListItemText
//                         primary={f}
//                         primaryTypographyProps={{ fontSize: 14, lineHeight: 1.5 }}
//                       />
//                     </ListItem>
//                   ))}
//                 </List>

//                 {invSub?.status === 'active' ? (
//                   <Box sx={{ mt: 3 }}>
//                     <Box sx={{
//                       p: 2, borderRadius: 2, mb: 1.5,
//                       bgcolor: 'rgba(76, 175, 80, 0.15)',
//                       border: '1px solid rgba(76, 175, 80, 0.3)',
//                     }}>
//                       <Typography sx={{ color: '#81c784', fontWeight: 700, fontSize: 15, mb: 0.5 }}>
//                         ✓ PRO planas aktyvus
//                       </Typography>
//                       {invSub.plan_end && (
//                         <Typography sx={{ color: '#aaa', fontSize: 13 }}>
//                           {invSub.cancel_at_period_end
//                             ? `Planas baigsis: ${invSub.plan_end_display}`
//                             : `Sekantis apmokėjimas: ${invSub.plan_end_display}`
//                           }
//                         </Typography>
//                       )}
//                     </Box>
//                     {!invSub.cancel_at_period_end && (
//                       <Button
//                         variant="text"
//                         fullWidth
//                         onClick={() => setCancelDialog(true)}
//                         disabled={cancelLoading}
//                         sx={{
//                           color: '#888',
//                           fontSize: 13,
//                           textTransform: 'none',
//                           '&:hover': { color: '#f44336', bgcolor: 'rgba(244,67,54,0.08)' },
//                         }}
//                       >
//                         {cancelLoading ? 'Atšaukiama...' : 'Atšaukti planą'}
//                       </Button>
//                     )}
//                     {invSub.cancel_at_period_end && (
//                       <Typography sx={{ color: '#f5cf54', fontSize: 13, textAlign: 'center', mt: 1 }}>
//                         Planas atšauktas. PRO funkcijos veiks iki {invSub.plan_end_display}.
//                       </Typography>
//                     )}
//                   </Box>
//                 ) : (
//                   <Button
//                     variant="contained"
//                     fullWidth
//                     onClick={handleInvCheckout}
//                     disabled={loadingId === 'inv_pro'}
//                     sx={{
//                       mt: 3,
//                       bgcolor: "#f5be0d",
//                       color: "black",
//                       fontWeight: "bold",
//                       py: 1.5,
//                       "&:hover": { bgcolor: "#d4ae4a" },
//                     }}
//                   >
//                     {loadingId === 'inv_pro' ? "Vykdoma…" : "Įsigyti PRO planą"}
//                   </Button>
//                 )}
//               </Box>
//             </Box>
//           </Grid2>
//         </Grid2>
//       </Box>
//       {/* Cancel subscription dialog */}
//       {cancelDialog && (
//         <Box
//           sx={{
//             position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
//             bgcolor: 'rgba(0,0,0,0.5)', zIndex: 9999,
//             display: 'flex', alignItems: 'center', justifyContent: 'center',
//           }}
//           onClick={() => setCancelDialog(false)}
//         >
//           <Box
//             sx={{
//               bgcolor: '#fff', borderRadius: 3, p: 4, maxWidth: 440, mx: 2,
//               boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
//             }}
//             onClick={(e) => e.stopPropagation()}
//           >
//             <Typography sx={{ fontWeight: 700, fontSize: 20, mb: 1.5, color: '#1b1b1b' }}>
//               Atšaukti PRO planą?
//             </Typography>
//             <Typography sx={{ color: '#555', fontSize: 15, mb: 3, lineHeight: 1.6 }}>
//               Atšaukus planą, PRO funkcijomis galėsite naudotis iki dabartinio mokėjimo laikotarpio pabaigos. 
//               Po to bus taikomas nemokamas planas su ribojimais.
//             </Typography>
//             <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end' }}>
//               <Button
//                 onClick={() => setCancelDialog(false)}
//                 sx={{ color: '#555', textTransform: 'none', fontWeight: 600 }}
//               >
//                 Grįžti
//               </Button>
//               <Button
//                 variant="contained"
//                 onClick={handleCancelSubscription}
//                 sx={{
//                   bgcolor: '#d32f2f', textTransform: 'none', fontWeight: 600,
//                   '&:hover': { bgcolor: '#b71c1c' },
//                 }}
//               >
//                 Atšaukti planą
//               </Button>
//             </Box>
//           </Box>
//         </Box>
//       )}
//     </Box>
//   );
// };

// export default Subscribe;



