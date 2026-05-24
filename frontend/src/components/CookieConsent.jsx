import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  Typography,
  Link,
  Switch,
  IconButton,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import {
  getConsentCookie,
  setConsentCookie,
  updateConsent,
} from "../gtm";

const CATEGORIES = [
  {
    key: "essential",
    label: "Būtini slapukai",
    labelShort: "Būtini",
    desc: "Šie slapukai yra būtini, kad svetainė veiktų tinkamai. Jie užtikrina pagrindines funkcijas, tokias kaip puslapių navigacija, prieiga prie apsaugotų sričių ir sesijos valdymą. Be šių slapukų svetainė negalės veikti, todėl jų išjungti negalima.",
    descShort: "Šie slapukai yra būtini svetainės veikimui. Sesijos valdymas, navigacija ir saugumas. Jų išjungti negalima.",
    locked: true,
  },
  {
    key: "analytics",
    label: "Statistikos slapukai",
    labelShort: "Statistika",
    desc: "Statistikos slapukai padeda suprasti, kaip lankytojai naudojasi svetaine, rinkdami ir pateikdami anoniminę informaciją. Ši informacija leidžia mums tobulinti svetainės struktūrą, turinį ir naudotojų patirtį, kad apsilankymas būtų patogesnis ir naudingesnis.",
    descShort: "Anoniminė lankomumo analizė, padedanti tobulinti svetainės struktūrą ir turinį.",
    locked: false,
  },
  {
    key: "marketing",
    label: "Rinkodaros slapukai",
    labelShort: "Rinkodara",
    desc: "Rinkodaros slapukai naudojami lankytojų veiklai stebėti įvairiose svetainėse. Jų tikslas yra rodyti reklamas, kurios būtų aktualios ir įdomios konkrečiam naudotojui. Šie slapukai taip pat padeda įvertinti reklamos kampanijų efektyvumą ir riboti reklamos rodymo dažnį.",
    descShort: "Reklamų personalizavimas ir kampanijų efektyvumo vertinimas įvairiose svetainėse.",
    locked: false,
  },
];

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(1);
  const [toggles, setToggles] = useState({ analytics: true, marketing: true });

  useEffect(() => {
    if (!getConsentCookie()) {
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  const save = useCallback((consent) => {
    setConsentCookie(consent);
    updateConsent(consent);
    setVisible(false);
    setStep(1);
  }, []);

  const handleAllow = useCallback(() => {
    save({ analytics: true, marketing: true });
  }, [save]);

  const handleSave = useCallback(() => {
    save({ analytics: toggles.analytics, marketing: toggles.marketing });
  }, [save, toggles]);

  const handleReject = useCallback(() => {
    save({ analytics: false, marketing: false });
  }, [save]);

  if (!visible) return null;

  // ─── Step 1: Main ───
  if (step === 1) {
    return (
      <Box
        sx={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          bgcolor: "background.paper",
          borderTop: "1px solid",
          borderColor: "divider",
          boxShadow: "0 -4px 20px rgba(0,0,0,0.08)",
          px: { xs: 2, sm: 4 },
          py: { xs: 2, sm: 2.5 },
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "stretch", sm: "center" },
          gap: { xs: 1.5, sm: 3 },
        }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, mb: 0.3 }}
          >
            🍪 Slapukų nustatymai
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ lineHeight: 1.5 }}
          >
            Naudojame slapukus, kad užtikrintume svetainės veikimą,
            analizuotume lankomumą ir rodytume aktualesnius skelbimus.{" "}
            <Link href="/privatumo-politika" underline="hover">
              Privatumo politika
            </Link>
          </Typography>
        </Box>

        <Box
          sx={{
            display: "flex",
            gap: 1,
            flexShrink: 0,
            justifyContent: { xs: "stretch", sm: "flex-end" },
          }}
        >
          <Button
            onClick={() => setStep(2)}
            sx={{
              color: "text.secondary",
              textTransform: "none",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1.5,
              px: { xs: 2, sm: 3.5 },
              py: { xs: 1, sm: 1.2 },
              fontSize: { xs: 13, sm: 14 },
              flex: { xs: 1, sm: "none" },
            }}
          >
            Tvarkyti
          </Button>
          <Button
            variant="contained"
            onClick={handleAllow}
            sx={{
              textTransform: "none",
              borderRadius: 1.5,
              px: { xs: 2.5, sm: 4.5 },
              py: { xs: 1, sm: 1.2 },
              fontSize: { xs: 13, sm: 14 },
              flex: { xs: 1.3, sm: "none" },
            }}
          >
            Leisti
          </Button>
        </Box>
      </Box>
    );
  }

  // ─── Step 2: Manage ───
  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        bgcolor: "background.paper",
        borderTop: "1px solid",
        borderColor: "divider",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.08)",
        px: { xs: 2, sm: 4 },
        py: { xs: 2, sm: 2.5 },
      }}
    >
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <IconButton size="small" onClick={() => setStep(1)}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Slapukų nustatymai
        </Typography>
      </Box>

      {/* Desktop: horizontal. Mobile: vertical */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          gap: { xs: 1.5, sm: 4 },
        }}
      >
        {/* Toggles — показываем 1-ю целиком и половину 2-й */}
        <Box
          sx={{
            flex: 1,
            maxHeight: { xs: 170, sm: 130 },
            overflowY: "auto",
            pr: { xs: 0, sm: 1 },
            "&::-webkit-scrollbar": { width: 3 },
            "&::-webkit-scrollbar-thumb": {
              bgcolor: "divider",
              borderRadius: 2,
            },
          }}
        >
          {CATEGORIES.map((cat, i) => (
            <Box
              key={cat.key}
              sx={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 1.5,
                py: 1.25,
                borderBottom:
                  i < CATEGORIES.length - 1
                    ? "1px solid"
                    : "none",
                borderColor: "divider",
              }}
            >
              <Box sx={{ flex: 1 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    mb: 0.3,
                    display: { xs: "none", sm: "block" },
                  }}
                >
                  {cat.label}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    mb: 0.3,
                    display: { xs: "block", sm: "none" },
                  }}
                >
                  {cat.labelShort}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    lineHeight: 1.45,
                    display: { xs: "none", sm: "block" },
                  }}
                >
                  {cat.desc}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    lineHeight: 1.45,
                    display: { xs: "block", sm: "none" },
                  }}
                >
                  {cat.descShort}
                </Typography>
              </Box>
              <Switch
                size="small"
                checked={cat.locked ? true : toggles[cat.key]}
                disabled={cat.locked}
                onChange={(e) =>
                  !cat.locked &&
                  setToggles((prev) => ({
                    ...prev,
                    [cat.key]: e.target.checked,
                  }))
                }
                sx={{ mt: 0.5 }}
              />
            </Box>
          ))}
        </Box>

        {/* Buttons */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            flexShrink: 0,
            justifyContent: "flex-end",
            minWidth: { xs: "auto", sm: 240 },
          }}
        >
          <Button
            variant="contained"
            onClick={handleSave}
            sx={{
              textTransform: "none",
              borderRadius: 1.5,
              py: { xs: 1, sm: 1.2 },
              fontSize: { xs: 13, sm: 14 },
            }}
          >
            Išsaugoti pasirinkimus
          </Button>
          <Button
            onClick={handleReject}
            sx={{
              textTransform: "none",
              borderRadius: 1.5,
              py: { xs: 1, sm: 1.2 },
              fontSize: { xs: 13, sm: 14 },
              color: "error.main",
              borderColor: "error.main",
              border: "1px solid",
              bgcolor: "error.50",
              "&:hover": {
                bgcolor: "error.100",
                borderColor: "error.dark",
              },
            }}
            startIcon={<CloseIcon sx={{ fontSize: 16 }} />}
          >
            Atmesti ir uždaryti svetainę
          </Button>
        </Box>
      </Box>
    </Box>
  );
}