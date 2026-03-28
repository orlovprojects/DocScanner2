import { useState, useEffect } from "react";
import { Box, Typography, Button, IconButton, Snackbar, Alert } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import LockIcon from "@mui/icons-material/Lock";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useInvSubscription } from "../contexts/InvSubscriptionContext";
import { startInvTrial } from "../api/endpoints";
import { useLocation } from "react-router-dom";

const BANNER_CONFIG = {
  trial_available: {
    icon: RocketLaunchIcon,
    iconColor: "#1976D2",
    iconBg: "rgba(25, 118, 210, 0.12)",
    bg: "rgba(25, 118, 210, 0.08)",
    border: "rgba(25, 118, 210, 0.22)",
    shadow: "rgba(25, 118, 210, 0.08)",
    textColor: "#0D47A1",
    text: "Išbandykite visas sąskaitų išrašymo funkcijas 14 dienų nemokamai (be įsipareigojimų)!",
    showTrialButton: true,
    dismissable: true,
  },
  trial_ending: {
    icon: WarningAmberIcon,
    iconColor: "#F57C00",
    iconBg: "rgba(255, 145, 0, 0.14)",
    bg: "rgba(255, 145, 0, 0.10)",
    border: "rgba(255, 145, 0, 0.28)",
    shadow: "rgba(255, 145, 0, 0.10)",
    textColor: "#3B2A1A",
    textFn: (daysLeft) =>
      `Bandomasis laikotarpis baigiasi po ${daysLeft} d. Įsigykite planą, dalis funkcijų netrukus bus apribota.`,
    showBuyButton: true,
  },
  trial_expired: {
    icon: LockIcon,
    iconColor: "#F57C00",
    iconBg: "rgba(255, 145, 0, 0.14)",
    bg: "rgba(255, 145, 0, 0.10)",
    border: "rgba(255, 145, 0, 0.28)",
    shadow: "rgba(255, 145, 0, 0.10)",
    textColor: "#3B2A1A",
    text: "Jūsų bandomasis laikotarpis pasibaigė. Kai kurios funkcijos apribotos.",
    showBuyButton: true,
  },
};

const InvSubscriptionBanner = () => {
  const { invSub, refresh } = useInvSubscription();
  const location = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [snack, setSnack] = useState(false);

  useEffect(() => {
    setDismissed(false);
  }, [location.pathname]);

  const handleStartTrial = async () => {
    setStarting(true);
    try {
      await startInvTrial();
      await refresh();
      setSnack(true);
    } catch (err) {
      console.error("Failed to start trial:", err);
    } finally {
      setStarting(false);
    }
  };

  if (!invSub || !invSub.banner || dismissed) {
    return (
      <Snackbar
        open={snack}
        autoHideDuration={5000}
        onClose={() => setSnack(false)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setSnack(false)}>
          Bandomasis laikotarpis prasidėjo! Visomis sąskaitų išrašymo funkcijomis galite naudotis 14 dienų.
        </Alert>
      </Snackbar>
    );
  }

  const config = BANNER_CONFIG[invSub.banner];
  if (!config) return null;

  const text = config.textFn ? config.textFn(invSub.days_left) : config.text;
  const IconComp = config.icon;

  return (
    <>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 2.5,
          py: { xs: 1.5, md: 1.25 },
          mb: 2,
          borderRadius: 3,
          bgcolor: config.bg,
          border: `1px solid ${config.border}`,
          boxShadow: `0 10px 30px ${config.shadow}`,
          backdropFilter: "blur(8px)",
          flexWrap: "wrap",
        }}
      >
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: config.iconBg,
            flexShrink: 0,
          }}
        >
          <IconComp sx={{ color: config.iconColor, fontSize: 18 }} />
        </Box>

        <Typography
          variant="body2"
          sx={{
            color: config.textColor,
            fontWeight: 500,
            lineHeight: 1.5,
            flex: 1,
            minWidth: 200,
          }}
        >
          {text}
        </Typography>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
          {config.showTrialButton && (
            <Button
              size="small"
              disabled={starting}
              onClick={handleStartTrial}
              sx={{
                textTransform: "none",
                borderRadius: 2.5,
                px: 2,
                py: 0.75,
                minWidth: "fit-content",
                flexShrink: 0,
                fontWeight: 600,
                color: "#fff",
                background: "linear-gradient(135deg, #1976D2 0%, #1565C0 100%)",
                boxShadow: "none",
                "&:hover": {
                  background: "linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)",
                  boxShadow: "none",
                },
              }}
            >
              {starting ? "Pradedama..." : "Pradėti bandomąjį laikotarpį"}
            </Button>
          )}

          {config.showBuyButton && (
            <Button
              size="small"
              href="/papildyti#planai"
              sx={{
                textTransform: "none",
                borderRadius: 2.5,
                px: 2,
                py: 0.75,
                minWidth: "fit-content",
                flexShrink: 0,
                fontWeight: 600,
                color: "#fff",
                background: "linear-gradient(135deg, #FF9800 0%, #F57C00 100%)",
                boxShadow: "none",
                "&:hover": {
                  background: "linear-gradient(135deg, #FB8C00 0%, #EF6C00 100%)",
                  boxShadow: "none",
                },
              }}
            >
              Įsigyti planą
            </Button>
          )}

          {config.dismissable && (
            <IconButton size="small" onClick={() => setDismissed(true)} sx={{ color: config.textColor }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      </Box>

      <Snackbar
        open={snack}
        autoHideDuration={5000}
        onClose={() => setSnack(false)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setSnack(false)}>
          Bandomasis laikotarpis prasidėjo! Visomis sąskaitų išrašymo funkcijomis galite naudotis 14 dienų.
        </Alert>
      </Snackbar>
    </>
  );
};

export default InvSubscriptionBanner;