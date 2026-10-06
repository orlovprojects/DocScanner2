import { Box, IconButton, Stack, Typography } from "@mui/material";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth";

const CONTENT_MAX = 600;

const navItems = [
  { label: "Pradžia", path: "/", icon: HomeRoundedIcon },
  { label: "Grafikas", path: "/grafikas", icon: CalendarMonthOutlinedIcon },
  { label: "Prašymai", path: "/kiti-prasymai", icon: DescriptionOutlinedIcon },
  { label: "Duomenys", path: "/anketa", icon: PersonOutlineIcon },
];

function activeFor(pathname, path) {
  if (path === "/") return pathname === "/";
  if (path === "/kiti-prasymai") {
    return pathname === "/kiti-prasymai" || pathname.startsWith("/prasymas/");
  }
  return pathname.startsWith(path);
}

export default function Layout({ children }) {
  const { me, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  const initials = [me?.employee?.first_name, me?.employee?.last_name]
    .filter(Boolean)
    .map((x) => String(x).trim()[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "ME";

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#f6f8fb",
        pb: "calc(82px + env(safe-area-inset-bottom))",
      }}
    >
      <Box
        sx={{
          bgcolor: "rgba(255,255,255,.96)",
          borderBottom: "1px solid #eef1f5",
          pt: "env(safe-area-inset-top)",
          position: "sticky",
          top: 0,
          zIndex: 20,
          backdropFilter: "blur(14px)",
        }}
      >
        <Box sx={{ width: "100%", maxWidth: CONTENT_MAX, mx: "auto", px: { xs: 1.6, sm: 3 } }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 1.35 }}>
            <Box onClick={() => nav("/")} sx={{ cursor: "pointer", minWidth: 0 }}>
              <Typography sx={{ fontWeight: 850, fontSize: "1.35rem", letterSpacing: "-.035em", lineHeight: 1.05 }}>
                <Box component="span" sx={{ color: "#1476ff" }}>e</Box>
                <Box component="span" sx={{ color: "#101828" }}>savitarna</Box>
              </Typography>
              {me?.employee && (
                <Typography sx={{ color: "#77839a", fontSize: ".78rem", mt: 0.35 }} noWrap>
                  {me.employee.company}
                </Typography>
              )}
            </Box>

            <Stack direction="row" alignItems="center" gap={0.6}>
              {me?.employments?.length > 1 && (
                <IconButton onClick={() => nav("/imone")} aria-label="Keisti įmonę" sx={{ color: "#526079" }}>
                  <BusinessOutlinedIcon />
                </IconButton>
              )}
              <IconButton onClick={logout} aria-label="Atsijungti" sx={{ color: "#526079" }}>
                <LogoutRoundedIcon />
              </IconButton>
              <Box
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: "50%",
                  bgcolor: "#E8F2FF",
                  color: "#183b78",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 800,
                  fontSize: ".9rem",
                }}
              >
                {initials}
              </Box>
            </Stack>
          </Stack>
        </Box>
      </Box>

      <Box sx={{ width: "100%", maxWidth: CONTENT_MAX, mx: "auto", pt: 2.2, px: { xs: 1.6, sm: 3 } }}>
        {children}
      </Box>

      <Box
        sx={{
          position: "fixed",
          left: "50vw",
          transform: "translateX(-50%)",
          bottom: 0,
          zIndex: 30,
          width: "100%",
          maxWidth: CONTENT_MAX,
          pb: "env(safe-area-inset-bottom)",
          pointerEvents: "none",
        }}
      >
        <PaperNav pathname={loc.pathname} onNavigate={nav} />
      </Box>
    </Box>
  );
}

function PaperNav({ pathname, onNavigate }) {
  return (
    <Box
      sx={{
        bgcolor: "rgba(255,255,255,.97)",
        border: "1px solid #e8edf4",
        borderBottom: { xs: 0, sm: "1px solid #e8edf4" },
        borderRadius: { xs: "14px 14px 0 0", sm: 1.75 },
        boxShadow: "0 -6px 24px rgba(28, 46, 77, .08)",
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        py: 0.65,
        pointerEvents: "auto",
      }}
    >
      {navItems.map(({ label, path, icon: Icon }) => {
        const active = activeFor(pathname, path);
        return (
          <Box
            key={path}
            component="button"
            type="button"
            onClick={() => onNavigate(path)}
            sx={{
              border: 0,
              bgcolor: "transparent",
              font: "inherit",
              cursor: "pointer",
              color: active ? "#1476ff" : "#77839a",
              minHeight: 56,
              py: 0.45,
              px: 0.5,
              minWidth: 0,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <Icon sx={{ fontSize: 25 }} />
            <Typography sx={{ fontSize: ".7rem", fontWeight: active ? 750 : 550, mt: 0.15, lineHeight: 1.15 }}>
              {label}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
