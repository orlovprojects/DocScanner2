import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Popover,
} from "@mui/material";
import { alpha } from "@mui/material/styles";

import DocumentScannerIcon from "@mui/icons-material/DocumentScanner";
import DescriptionIcon from "@mui/icons-material/Description";
import DvrIcon from "@mui/icons-material/Dvr";
import DiamondIcon from "@mui/icons-material/Diamond";
import HelpIcon from "@mui/icons-material/Help";

import CloseIcon from "@mui/icons-material/Close";
import ListAltIcon from "@mui/icons-material/ListAlt";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import InventoryOutlinedIcon from "@mui/icons-material/InventoryOutlined";
import StraightenOutlinedIcon from "@mui/icons-material/StraightenOutlined";
import FormatListNumberedOutlinedIcon from "@mui/icons-material/FormatListNumberedOutlined";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";

import CheckIcon from "@mui/icons-material/Check";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import { ACCOUNTING_PROGRAMS } from "../page_elements/AccountingPrograms";

const RAIL_WIDTH = 58;
const FLYOUT_WIDTH = 238;
const HEADER_FALLBACK_HEIGHT = 64;

const ACTIVE_BG = "#ffebeb";
const ACTIVE_COLOR = "#f66a60";
const OPEN_BG = "#E9EAEC";
const OPEN_COLOR = "#374151";
const HOVER_BG = "#e5e6e7";
const DEFAULT_COLOR = "#404040";
const DEFAULT_HOVER_COLOR = "#101010";

const SWITCHER_BG = "#EDE9FE";
const SWITCHER_HOVER_BG = "#DDD6FE";
const SWITCHER_AVATAR_BG = "#7C3AED";
const SWITCHER_TEXT = "#5B21B6";

const AVATAR_COLORS = [
  { bg: "#EDE9FE", text: "#5B21B6", avatar: "#7C3AED" },
  { bg: "#DBEAFE", text: "#1E40AF", avatar: "#3B82F6" },
  { bg: "#D1FAE5", text: "#065F46", avatar: "#10B981" },
  { bg: "#FEF3C7", text: "#92400E", avatar: "#F59E0B" },
  { bg: "#FCE7F3", text: "#9D174D", avatar: "#EC4899" },
];

const programLabel = (value) =>
  ACCOUNTING_PROGRAMS.find((p) => p.value === value)?.label || value;

function getInitials(name) {
  if (!name) return "?";
  const clean = name
    .replace(/["""„()]/g, "")
    .replace(/^(UAB|MB|IĮ|VšĮ|AB)\s+/i, "")
    .trim();
  const words = clean.split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

const SECTIONS = [
  {
    id: "skaitmenizavimas",
    label: "Skaitm.",
    fullLabel: "Skaitmenizavimas",
    icon: DocumentScannerIcon,
    pathPrefix: ["/suvestine", "/nustatymai", "/is-klientu", "/vaztarasciai"],
    items: (ctx) => [
      { icon: ListAltIcon, text: "Suvestinė", path: "/suvestine" },
      ...(ctx.hasWaybillAccess
        ? [{ icon: LocalShippingOutlinedIcon, text: "Važtaraščiai", path: "/vaztarasciai" }]
        : []),
      { icon: InboxOutlinedIcon, text: "Iš klientų", path: "/is-klientu" },
      { icon: SettingsOutlinedIcon, text: "Nustatymai", path: "/nustatymai" },
    ],
  },
  // {
  //   id: "pirkimai",
  //   label: "Pirkim.",
  //   fullLabel: "Pirkimai",
  //   icon: ShoppingCartOutlinedIcon,
  //   pathPrefix: ["/pirkimai"],
  //   items: () => [
  //     { icon: ListAltIcon, text: "Sąskaitos", path: "/pirkimai" },
  //   ],
  // },
  {
    id: "pardavimai",
    label: "Pardav.",
    fullLabel: "Pardavimai",
    icon: DescriptionIcon,
    pathPrefix: ["/israsymas"],
    items: () => [
      { icon: ListAltIcon, text: "Sąskaitos", path: "/israsymas" },
      { icon: PeopleAltOutlinedIcon, text: "Klientai", path: "/israsymas/klientai" },
      { icon: InventoryOutlinedIcon, text: "Prekės / paslaugos", path: "/israsymas/prekes-paslaugos" },
      { icon: FormatListNumberedOutlinedIcon, text: "Serijos", path: "/israsymas/serijos-numeracijos" },
      { icon: StraightenOutlinedIcon, text: "Mat. vienetai", path: "/israsymas/matavimo-vienetai" },
      { icon: SettingsOutlinedIcon, text: "Nustatymai", path: "/israsymas/nustatymai" },
    ],
  },
  // {
  //   id: "pinigai",
  //   label: "Pinigai",
  //   fullLabel: "Pinigai",
  //   icon: AccountBalanceIcon,
  //   pathPrefix: ["/bankas"],
  //   items: () => [
  //     { icon: ListAltIcon, text: "Banko operacijos", path: "/bankas" },
  //   ],
  // },
  {
    id: "apskaita",
    label: "Apsk.",
    fullLabel: "Apskaita",
    icon: DvrIcon,
    pathPrefix: ["/apskaitos-centras", "/veiklos-zurnalas", "/oss-zurnalas", "/svs-deklaravimas"],
    items: () => [
      // { icon: ListAltIcon, text: "Apskaitos centras", path: "/apskaitos-centras" },
      { icon: ListAltIcon, text: "IV žurnalas", path: "/veiklos-zurnalas" },
      { icon: ListAltIcon, text: "OSS žurnalas", path: "/oss-zurnalas" },
      { icon: ListAltIcon, text: "SVS žurnalas", path: "/svs-deklaravimas" },
    ],
  },
];

const BOTTOM_ITEMS = [
  {
    id: "gidas",
    label: "Gidas",
    icon: HelpIcon,
    path: "/naudojimo-gidas",
  },
  {
    id: "papildyti",
    label: "Planai / kreditai",
    icon: DiamondIcon,
    path: "/papildyti",
  },
];

export default function SidebarRail({
  hasWaybillAccess = false,
  companyProfiles = [],
  activeCompanyProfileId = null,
  onSwitchCompany,
  onAddCompany,
  onDeleteCompany,
}) {
  const nav = useNavigate();
  const location = useLocation();

  const railRef = useRef(null);
  const flyoutRef = useRef(null);

  const [openSection, setOpenSection] = useState(null);
  const [switcherAnchor, setSwitcherAnchor] = useState(null);
  const [layout, setLayout] = useState({
    top: HEADER_FALLBACK_HEIGHT,
    height: typeof window !== "undefined"
      ? window.innerHeight - HEADER_FALLBACK_HEIGHT
      : 800,
  });

  const activeProfile = companyProfiles.find(
    (p) => p.id === activeCompanyProfileId
  );
  const switcherOpen = Boolean(switcherAnchor);

  useLayoutEffect(() => {
    const updateLayout = () => {
      const header =
        document.querySelector("[data-app-header]") ||
        document.querySelector("header") ||
        document.querySelector(".MuiAppBar-root");

      const footer =
        document.querySelector("[data-app-footer]") ||
        document.querySelector("footer");

      const viewportHeight = window.innerHeight;

      const headerRect = header?.getBoundingClientRect();
      const headerBottom = headerRect
        ? Math.max(0, Math.round(headerRect.bottom))
        : 0;

      const footerRect = footer?.getBoundingClientRect();
      const footerOverlap = footerRect && footerRect.top < viewportHeight
        ? Math.max(0, Math.round(viewportHeight - footerRect.top))
        : 0;

      if (footerOverlap > 0) {
        setLayout({
          top: -footerOverlap,
          height: viewportHeight,
        });
        return;
      }

      setLayout({
        top: headerBottom,
        height: viewportHeight - headerBottom,
      });
    };

    updateLayout();

    window.addEventListener("resize", updateLayout);
    window.addEventListener("scroll", updateLayout, { passive: true });

    return () => {
      window.removeEventListener("resize", updateLayout);
      window.removeEventListener("scroll", updateLayout);
    };
  }, []);

  useEffect(() => {
    if (!openSection) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpenSection(null);
      }
    };

    const handleOutsideClick = (event) => {
      const target = event.target;

      if (railRef.current?.contains(target)) return;
      if (flyoutRef.current?.contains(target)) return;

      setOpenSection(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [openSection]);

  const activeSection = SECTIONS.find((section) =>
    section.pathPrefix.some((path) => location.pathname.startsWith(path))
  );

  const currentFlyout = SECTIONS.find((section) => section.id === openSection);
  const flyoutItems = currentFlyout?.items({ hasWaybillAccess }) || [];

  const handleRailClick = (section) => {
    setOpenSection((current) => (current === section.id ? null : section.id));
  };

  const handleFlyoutNav = (path) => {
    setOpenSection(null);
    nav(path);
  };

  const handleBottomClick = (item) => {
    setOpenSection(null);
    nav(item.path);
  };

  const handleSwitcherClick = (e) => {
    setOpenSection(null);
    setSwitcherAnchor(e.currentTarget);
  };

  const handleSwitchTo = (profileId) => {
    setSwitcherAnchor(null);
    if (profileId !== activeCompanyProfileId) {
      onSwitchCompany?.(profileId);
    }
  };

  const handleAdd = () => {
    setSwitcherAnchor(null);
    onAddCompany?.();
  };

  const handleDelete = (profileId) => {
    setSwitcherAnchor(null);
    onDeleteCompany?.(profileId);
  };

  return (
    <>
      <Box
        sx={{
          width: RAIL_WIDTH,
          minWidth: RAIL_WIDTH,
          flexShrink: 0,
        }}
      />

      <Box
        ref={railRef}
        sx={{
          width: RAIL_WIDTH,
          position: "fixed",
          top: `${layout.top}px`,
          left: 0,
          height: `${layout.height}px`,
          bgcolor: "#F7F7F7",
          borderRight: "1px solid #E2E2E2",
          boxShadow: "4px 0 16px rgba(15, 23, 42, 0.045)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          py: 1,
          gap: 0.5,
          zIndex: 1200,
          overflow: "hidden",
        }}
      >
        {/* ── Company Switcher Chip ── */}
        {activeProfile && (
          <>
            <Tooltip title={activeProfile.name} placement="right" arrow>
              <Box
                onClick={handleSwitcherClick}
                sx={{
                  width: 46,
                  minHeight: 42,
                  borderRadius: "12px",
                  bgcolor: switcherOpen ? SWITCHER_HOVER_BG : SWITCHER_BG,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "2px",
                  cursor: "pointer",
                  transition: "background-color 0.14s ease",
                  "&:hover": { bgcolor: SWITCHER_HOVER_BG },
                }}
              >
                <Box
                  sx={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    bgcolor: SWITCHER_AVATAR_BG,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 500,
                  }}
                >
                  {getInitials(activeProfile.name)}
                </Box>
                <Typography
                  sx={{
                    fontSize: "8px",
                    lineHeight: 1,
                    fontWeight: 600,
                    color: SWITCHER_TEXT,
                    maxWidth: 40,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    textAlign: "center",
                  }}
                >
                  {activeProfile.name}
                </Typography>
              </Box>
            </Tooltip>

            <Box sx={{ width: 30, borderTop: "1px solid #DADADA", my: 0.5 }} />
          </>
        )}

        {SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection?.id === section.id;
            const isOpen = openSection === section.id;

            const itemBg = isOpen ? OPEN_BG : isActive ? ACTIVE_BG : "transparent";
            const itemColor = isOpen ? OPEN_COLOR : isActive ? ACTIVE_COLOR : DEFAULT_COLOR;
            const itemHoverBg = isOpen ? OPEN_BG : isActive ? ACTIVE_BG : HOVER_BG;
            const itemHoverColor = isOpen ? OPEN_COLOR : isActive ? ACTIVE_COLOR : DEFAULT_HOVER_COLOR;
            const itemWeight = isOpen || isActive ? 700 : 600;

            return (
                <Tooltip key={section.id} title={section.fullLabel} placement="right" arrow>
                <Box
                    onClick={() => handleRailClick(section)}
                    sx={{
                    width: 46,
                    minHeight: 54,
                    borderRadius: "14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "3px",
                    cursor: "pointer",
                    transition: "color 0.14s ease, background-color 0.14s ease",
                    bgcolor: itemBg,
                    color: itemColor,
                    "&:hover": {
                        color: itemHoverColor,
                        bgcolor: itemHoverBg,
                    },
                    }}
                >
                    <Icon sx={{ fontSize: 22 }} />

                    <Typography
                    sx={{
                        fontSize: "10px",
                        lineHeight: 1,
                        fontWeight: itemWeight,
                        letterSpacing: "-0.2px",
                    }}
                    >
                    {section.label}
                    </Typography>
                </Box>
                </Tooltip>
            );
        })}

        <Box sx={{ width: 30, borderTop: "1px solid #DADADA", my: 0.75 }} />

        <Box
          sx={{
            mt: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 0.5,
            flexShrink: 0,
          }}
        >
          <Box sx={{ width: 30, borderTop: "1px solid #DADADA", mb: 0.5 }} />

          {BOTTOM_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <Tooltip key={item.id} title={item.label} placement="right" arrow>
                <Box
                  onClick={() => handleBottomClick(item)}
                  sx={{
                    width: 46,
                    minHeight: 54,
                    borderRadius: "14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "3px",
                    cursor: "pointer",
                    transition: "color 0.14s ease, background-color 0.14s ease",
                    bgcolor: isActive ? ACTIVE_BG : "transparent",
                    color: isActive ? ACTIVE_COLOR : DEFAULT_COLOR,
                    "&:hover": {
                      color: isActive ? ACTIVE_COLOR : DEFAULT_HOVER_COLOR,
                      bgcolor: isActive ? ACTIVE_BG : HOVER_BG,
                    },
                  }}
                >
                  <Icon sx={{ fontSize: 22 }} />

                  <Typography
                    sx={{
                        width: "100%",
                        fontSize: "10px",
                        lineHeight: 1.05,
                        fontWeight: isActive ? 700 : 600,
                        letterSpacing: "-0.2px",
                        textAlign: "center",
                        whiteSpace: "normal",
                    }}
                    >
                    {item.label}
                  </Typography>
                </Box>
              </Tooltip>
            );
          })}
        </Box>
      </Box>

      {/* ── Company Switcher Popover ── */}
      <Popover
        open={switcherOpen}
        anchorEl={switcherAnchor}
        onClose={() => setSwitcherAnchor(null)}
        disableScrollLock
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: {
              width: 280,
              borderRadius: "12px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
              ml: 0.5,
            },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid #EEF0F3" }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#6B7280" }}>
            Įmonės profiliai
          </Typography>
        </Box>

        <Box sx={{ py: 0.5 }}>
          {companyProfiles.map((profile, idx) => {
            const isActive = profile.id === activeCompanyProfileId;
            const colors = AVATAR_COLORS[idx % AVATAR_COLORS.length];

            return (
              <Box
                key={profile.id}
                onClick={() => handleSwitchTo(profile.id)}
                sx={{
                  px: 2,
                  py: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  cursor: "pointer",
                  bgcolor: isActive ? "#EDE9FE" : "transparent",
                  transition: "background-color 0.12s ease",
                  "&:hover": {
                    bgcolor: isActive ? "#EDE9FE" : "#F3F4F6",
                  },
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    bgcolor: colors.avatar,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  {getInitials(profile.name)}
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: "#111827",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {profile.name}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: "#6B7280",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {profile.entity_type === "iv"
                      ? profile.iv_certificate_nr || "IV"
                      : profile.company_code}
                    {profile.accounting_program
                      ? ` · ${programLabel(profile.accounting_program)}`
                      : ""}
                  </Typography>
                </Box>

                {isActive && (
                  <CheckIcon sx={{ fontSize: 18, color: "#7C3AED", flexShrink: 0 }} />
                )}

                {!isActive && companyProfiles.length > 1 && (
                  <Tooltip title="Pašalinti" placement="top" arrow>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(profile.id);
                      }}
                      sx={{
                        p: 0.5,
                        color: "#9CA3AF",
                        "&:hover": { color: "#EF4444", bgcolor: "#FEF2F2" },
                      }}
                    >
                      <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            );
          })}
        </Box>

        <Box
          onClick={handleAdd}
          sx={{
            px: 2,
            py: 1.25,
            borderTop: "1px solid #EEF0F3",
            display: "flex",
            alignItems: "center",
            gap: 1,
            cursor: "pointer",
            color: "#6B7280",
            fontSize: 13,
            fontWeight: 500,
            "&:hover": { bgcolor: "#F3F4F6", color: "#374151" },
          }}
        >
          <AddIcon sx={{ fontSize: 18 }} />
          Pridėti įmonę
        </Box>
      </Popover>

      {openSection && currentFlyout && (
        <Box
          ref={flyoutRef}
          sx={{
            position: "fixed",
            top: `${layout.top}px`,
            left: RAIL_WIDTH,
            width: FLYOUT_WIDTH,
            height: `${layout.height}px`,
            bgcolor: "#FFFFFF",
            borderRight: "1px solid #E5E7EB",
            boxShadow: "8px 0 26px rgba(15, 23, 42, 0.075)",
            zIndex: 1199,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              px: 2,
              py: 1.75,
              borderBottom: "1px solid #EEF0F3",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}
          >
            <Typography
              sx={{
                fontSize: 17,
                fontWeight: 800,
                color: "#111827",
                lineHeight: 1.2,
              }}
            >
              {currentFlyout.fullLabel}
            </Typography>

            <IconButton
              size="small"
              onClick={() => setOpenSection(null)}
              sx={{
                p: 0.5,
                color: DEFAULT_COLOR,
                "&:hover": {
                  bgcolor: alpha("#111827", 0.05),
                },
              }}
            >
              <CloseIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>

          <Box
            sx={{
              p: 1,
              display: "flex",
              flexDirection: "column",
              gap: 0.25,
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            {flyoutItems.map((item) => {
              const ItemIcon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <Box
                  key={item.path}
                  onClick={() => handleFlyoutNav(item.path)}
                  sx={{
                    px: 1.25,
                    py: 1.1,
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "center",
                    gap: 1.25,
                    cursor: "pointer",
                    color: isActive ? ACTIVE_COLOR : "#374151",
                    fontWeight: isActive ? 700 : 600,
                    fontSize: 14,
                    bgcolor: isActive ? ACTIVE_BG : "transparent",
                    transition: "color 0.14s ease, background-color 0.14s ease",
                    "&:hover": {
                      bgcolor: isActive ? ACTIVE_BG : HOVER_BG,
                      color: isActive ? ACTIVE_COLOR : DEFAULT_HOVER_COLOR,
                    },
                  }}
                >
                  <ItemIcon
                    sx={{
                      fontSize: 20,
                      color: isActive ? ACTIVE_COLOR : DEFAULT_COLOR,
                      flexShrink: 0,
                    }}
                  />

                  <Box
                    component="span"
                    sx={{
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.text}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
    </>
  );
}









// import { useState, useEffect, useLayoutEffect, useRef } from "react";
// import { useNavigate, useLocation } from "react-router-dom";
// import {
//   Box,
//   Typography,
//   IconButton,
//   Tooltip,
// } from "@mui/material";
// import { alpha } from "@mui/material/styles";

// import DocumentScannerIcon from "@mui/icons-material/DocumentScanner";
// import DescriptionIcon from "@mui/icons-material/Description";
// import DvrIcon from "@mui/icons-material/Dvr";
// import DiamondIcon from "@mui/icons-material/Diamond";
// import HelpIcon from "@mui/icons-material/Help";

// import CloseIcon from "@mui/icons-material/Close";
// import ListAltIcon from "@mui/icons-material/ListAlt";
// import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
// import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
// import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
// import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
// import InventoryOutlinedIcon from "@mui/icons-material/InventoryOutlined";
// import RepeatOutlinedIcon from "@mui/icons-material/RepeatOutlined";
// import StraightenOutlinedIcon from "@mui/icons-material/StraightenOutlined";
// import FormatListNumberedOutlinedIcon from "@mui/icons-material/FormatListNumberedOutlined";
// import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";

// const RAIL_WIDTH = 58;
// const FLYOUT_WIDTH = 238;
// const HEADER_FALLBACK_HEIGHT = 64;

// const ACTIVE_BG = "#ffebeb";
// const ACTIVE_COLOR = "#f66a60";
// const OPEN_BG = "#E9EAEC";
// const OPEN_COLOR = "#374151";
// const HOVER_BG = "#e5e6e7";
// const DEFAULT_COLOR = "#404040";
// const DEFAULT_HOVER_COLOR = "#101010";

// const SECTIONS = [
//   {
//     id: "skaitmenizavimas",
//     label: "Skaitm.",
//     fullLabel: "Skaitmenizavimas",
//     icon: DocumentScannerIcon,
//     pathPrefix: ["/suvestine", "/nustatymai", "/is-klientu", "/vaztarasciai"],
//     items: (ctx) => [
//       { icon: ListAltIcon, text: "Suvestinė", path: "/suvestine" },
//       ...(ctx.hasWaybillAccess
//         ? [{ icon: LocalShippingOutlinedIcon, text: "Važtaraščiai", path: "/vaztarasciai" }]
//         : []),
//       { icon: InboxOutlinedIcon, text: "Iš klientų", path: "/is-klientu" },
//       { icon: SettingsOutlinedIcon, text: "Nustatymai", path: "/nustatymai" },
//     ],
//   },
//   {
//     id: "israsymas",
//     label: "Išraš.",
//     fullLabel: "Išrašymas",
//     icon: DescriptionIcon,
//     pathPrefix: ["/israsymas"],
//     items: () => [
//       { icon: ListAltIcon, text: "Sąskaitos", path: "/israsymas" },
//       { icon: BarChartOutlinedIcon, text: "Banko išrašai", path: "/israsymas/banko-israsai" },
//       { icon: PeopleAltOutlinedIcon, text: "Klientai", path: "/israsymas/klientai" },
//       { icon: InventoryOutlinedIcon, text: "Prekės / paslaugos", path: "/israsymas/prekes-paslaugos" },
//       { icon: FormatListNumberedOutlinedIcon, text: "Serijos", path: "/israsymas/serijos-numeracijos" },
//       { icon: StraightenOutlinedIcon, text: "Mat. vienetai", path: "/israsymas/matavimo-vienetai" },
//       { icon: SettingsOutlinedIcon, text: "Nustatymai", path: "/israsymas/nustatymai" },
//     ],
//   },
//   {
//     id: "apskaita",
//     label: "Apsk.",
//     fullLabel: "Apskaita",
//     icon: DvrIcon,
//     pathPrefix: ["/veiklos-zurnalas", "/oss-zurnalas", "/svs-deklaravimas"],
//     items: () => [
//       { icon: ListAltIcon, text: "IV žurnalas", path: "/veiklos-zurnalas" },
//       { icon: ListAltIcon, text: "OSS žurnalas", path: "/oss-zurnalas" },
//       { icon: ListAltIcon, text: "SVS žurnalas", path: "/svs-deklaravimas" },
//     ],
//   },
// ];

// const BOTTOM_ITEMS = [
//   {
//     id: "gidas",
//     label: "Gidas",
//     icon: HelpIcon,
//     path: "/naudojimo-gidas",
//   },
//   {
//     id: "papildyti",
//     label: "Planai / kreditai",
//     icon: DiamondIcon,
//     path: "/papildyti",
//   },
// ];

// export default function SidebarRail({ hasWaybillAccess = false }) {
//   const nav = useNavigate();
//   const location = useLocation();

//   const railRef = useRef(null);
//   const flyoutRef = useRef(null);

//   const [openSection, setOpenSection] = useState(null);
//   const [layout, setLayout] = useState({
//     top: HEADER_FALLBACK_HEIGHT,
//     height: typeof window !== "undefined"
//       ? window.innerHeight - HEADER_FALLBACK_HEIGHT
//       : 800,
//   });

//   useLayoutEffect(() => {
//     const updateLayout = () => {
//       const header =
//         document.querySelector("[data-app-header]") ||
//         document.querySelector("header") ||
//         document.querySelector(".MuiAppBar-root");

//       const footer =
//         document.querySelector("[data-app-footer]") ||
//         document.querySelector("footer");

//       const viewportHeight = window.innerHeight;

//       const headerRect = header?.getBoundingClientRect();
//       const headerBottom = headerRect
//         ? Math.max(0, Math.round(headerRect.bottom))
//         : 0;

//       const footerRect = footer?.getBoundingClientRect();
//       const footerOverlap = footerRect && footerRect.top < viewportHeight
//         ? Math.max(0, Math.round(viewportHeight - footerRect.top))
//         : 0;

//       if (footerOverlap > 0) {
//         setLayout({
//           top: -footerOverlap,
//           height: viewportHeight,
//         });
//         return;
//       }

//       setLayout({
//         top: headerBottom,
//         height: viewportHeight - headerBottom,
//       });
//     };

//     updateLayout();

//     window.addEventListener("resize", updateLayout);
//     window.addEventListener("scroll", updateLayout, { passive: true });

//     return () => {
//       window.removeEventListener("resize", updateLayout);
//       window.removeEventListener("scroll", updateLayout);
//     };
//   }, []);

//   useEffect(() => {
//     if (!openSection) return;

//     const handleKeyDown = (event) => {
//       if (event.key === "Escape") {
//         setOpenSection(null);
//       }
//     };

//     const handleOutsideClick = (event) => {
//       const target = event.target;

//       if (railRef.current?.contains(target)) return;
//       if (flyoutRef.current?.contains(target)) return;

//       setOpenSection(null);
//     };

//     window.addEventListener("keydown", handleKeyDown);
//     document.addEventListener("mousedown", handleOutsideClick);
//     document.addEventListener("touchstart", handleOutsideClick);

//     return () => {
//       window.removeEventListener("keydown", handleKeyDown);
//       document.removeEventListener("mousedown", handleOutsideClick);
//       document.removeEventListener("touchstart", handleOutsideClick);
//     };
//   }, [openSection]);

//   const activeSection = SECTIONS.find((section) =>
//     section.pathPrefix.some((path) => location.pathname.startsWith(path))
//   );

//   const currentFlyout = SECTIONS.find((section) => section.id === openSection);
//   const flyoutItems = currentFlyout?.items({ hasWaybillAccess }) || [];

//   const handleRailClick = (section) => {
//     setOpenSection((current) => (current === section.id ? null : section.id));
//   };

//   const handleFlyoutNav = (path) => {
//     setOpenSection(null);
//     nav(path);
//   };

//   const handleBottomClick = (item) => {
//     setOpenSection(null);
//     nav(item.path);
//   };

//   return (
//     <>
//       <Box
//         sx={{
//           width: RAIL_WIDTH,
//           minWidth: RAIL_WIDTH,
//           flexShrink: 0,
//         }}
//       />

//       <Box
//         ref={railRef}
//         sx={{
//           width: RAIL_WIDTH,
//           position: "fixed",
//           top: `${layout.top}px`,
//           left: 0,
//           height: `${layout.height}px`,
//           bgcolor: "#F7F7F7",
//           borderRight: "1px solid #E2E2E2",
//           boxShadow: "4px 0 16px rgba(15, 23, 42, 0.045)",
//           display: "flex",
//           flexDirection: "column",
//           alignItems: "center",
//           py: 1,
//           gap: 0.5,
//           zIndex: 1200,
//           overflow: "hidden",
//         }}
//       >
//         {SECTIONS.map((section) => {
//             const Icon = section.icon;
//             const isActive = activeSection?.id === section.id;
//             const isOpen = openSection === section.id;

//             const itemBg = isOpen ? OPEN_BG : isActive ? ACTIVE_BG : "transparent";
//             const itemColor = isOpen ? OPEN_COLOR : isActive ? ACTIVE_COLOR : DEFAULT_COLOR;
//             const itemHoverBg = isOpen ? OPEN_BG : isActive ? ACTIVE_BG : HOVER_BG;
//             const itemHoverColor = isOpen ? OPEN_COLOR : isActive ? ACTIVE_COLOR : DEFAULT_HOVER_COLOR;
//             const itemWeight = isOpen || isActive ? 700 : 600;

//             return (
//                 <Tooltip key={section.id} title={section.fullLabel} placement="right" arrow>
//                 <Box
//                     onClick={() => handleRailClick(section)}
//                     sx={{
//                     width: 46,
//                     minHeight: 54,
//                     borderRadius: "14px",
//                     display: "flex",
//                     flexDirection: "column",
//                     alignItems: "center",
//                     justifyContent: "center",
//                     gap: "3px",
//                     cursor: "pointer",
//                     transition: "color 0.14s ease, background-color 0.14s ease",
//                     bgcolor: itemBg,
//                     color: itemColor,
//                     "&:hover": {
//                         color: itemHoverColor,
//                         bgcolor: itemHoverBg,
//                     },
//                     }}
//                 >
//                     <Icon sx={{ fontSize: 22 }} />

//                     <Typography
//                     sx={{
//                         fontSize: "10px",
//                         lineHeight: 1,
//                         fontWeight: itemWeight,
//                         letterSpacing: "-0.2px",
//                     }}
//                     >
//                     {section.label}
//                     </Typography>
//                 </Box>
//                 </Tooltip>
//             );
//         })}

//         <Box sx={{ width: 30, borderTop: "1px solid #DADADA", my: 0.75 }} />

//         <Box
//           sx={{
//             mt: "auto",
//             display: "flex",
//             flexDirection: "column",
//             alignItems: "center",
//             gap: 0.5,
//             flexShrink: 0,
//           }}
//         >
//           <Box sx={{ width: 30, borderTop: "1px solid #DADADA", mb: 0.5 }} />

//           {BOTTOM_ITEMS.map((item) => {
//             const Icon = item.icon;
//             const isActive = location.pathname === item.path;

//             return (
//               <Tooltip key={item.id} title={item.label} placement="right" arrow>
//                 <Box
//                   onClick={() => handleBottomClick(item)}
//                   sx={{
//                     width: 46,
//                     minHeight: 54,
//                     borderRadius: "14px",
//                     display: "flex",
//                     flexDirection: "column",
//                     alignItems: "center",
//                     justifyContent: "center",
//                     gap: "3px",
//                     cursor: "pointer",
//                     transition: "color 0.14s ease, background-color 0.14s ease",
//                     bgcolor: isActive ? ACTIVE_BG : "transparent",
//                     color: isActive ? ACTIVE_COLOR : DEFAULT_COLOR,
//                     "&:hover": {
//                       color: isActive ? ACTIVE_COLOR : DEFAULT_HOVER_COLOR,
//                       bgcolor: isActive ? ACTIVE_BG : HOVER_BG,
//                     },
//                   }}
//                 >
//                   <Icon sx={{ fontSize: 22 }} />

//                   <Typography
//                     sx={{
//                         width: "100%",
//                         fontSize: "10px",
//                         lineHeight: 1.05,
//                         fontWeight: isActive ? 700 : 600,
//                         letterSpacing: "-0.2px",
//                         textAlign: "center",
//                         whiteSpace: "normal",
//                     }}
//                     >
//                     {item.label}
//                   </Typography>
//                 </Box>
//               </Tooltip>
//             );
//           })}
//         </Box>
//       </Box>

//       {openSection && currentFlyout && (
//         <Box
//           ref={flyoutRef}
//           sx={{
//             position: "fixed",
//             top: `${layout.top}px`,
//             left: RAIL_WIDTH,
//             width: FLYOUT_WIDTH,
//             height: `${layout.height}px`,
//             bgcolor: "#FFFFFF",
//             borderRight: "1px solid #E5E7EB",
//             boxShadow: "8px 0 26px rgba(15, 23, 42, 0.075)",
//             zIndex: 1199,
//             display: "flex",
//             flexDirection: "column",
//             overflow: "hidden",
//           }}
//         >
//           <Box
//             sx={{
//               px: 2,
//               py: 1.75,
//               borderBottom: "1px solid #EEF0F3",
//               display: "flex",
//               alignItems: "center",
//               justifyContent: "space-between",
//               flexShrink: 0,
//             }}
//           >
//             <Typography
//               sx={{
//                 fontSize: 17,
//                 fontWeight: 800,
//                 color: "#111827",
//                 lineHeight: 1.2,
//               }}
//             >
//               {currentFlyout.fullLabel}
//             </Typography>

//             <IconButton
//               size="small"
//               onClick={() => setOpenSection(null)}
//               sx={{
//                 p: 0.5,
//                 color: DEFAULT_COLOR,
//                 "&:hover": {
//                   bgcolor: alpha("#111827", 0.05),
//                 },
//               }}
//             >
//               <CloseIcon sx={{ fontSize: 20 }} />
//             </IconButton>
//           </Box>

//           <Box
//             sx={{
//               p: 1,
//               display: "flex",
//               flexDirection: "column",
//               gap: 0.25,
//               overflowY: "auto",
//               overflowX: "hidden",
//             }}
//           >
//             {flyoutItems.map((item) => {
//               const ItemIcon = item.icon;
//               const isActive = location.pathname === item.path;

//               return (
//                 <Box
//                   key={item.path}
//                   onClick={() => handleFlyoutNav(item.path)}
//                   sx={{
//                     px: 1.25,
//                     py: 1.1,
//                     borderRadius: "10px",
//                     display: "flex",
//                     alignItems: "center",
//                     gap: 1.25,
//                     cursor: "pointer",
//                     color: isActive ? ACTIVE_COLOR : "#374151",
//                     fontWeight: isActive ? 700 : 600,
//                     fontSize: 14,
//                     bgcolor: isActive ? ACTIVE_BG : "transparent",
//                     transition: "color 0.14s ease, background-color 0.14s ease",
//                     "&:hover": {
//                       bgcolor: isActive ? ACTIVE_BG : HOVER_BG,
//                       color: isActive ? ACTIVE_COLOR : DEFAULT_HOVER_COLOR,
//                     },
//                   }}
//                 >
//                   <ItemIcon
//                     sx={{
//                       fontSize: 20,
//                       color: isActive ? ACTIVE_COLOR : DEFAULT_COLOR,
//                       flexShrink: 0,
//                     }}
//                   />

//                   <Box
//                     component="span"
//                     sx={{
//                       minWidth: 0,
//                       overflow: "hidden",
//                       textOverflow: "ellipsis",
//                       whiteSpace: "nowrap",
//                     }}
//                   >
//                     {item.text}
//                   </Box>
//                 </Box>
//               );
//             })}
//           </Box>
//         </Box>
//       )}
//     </>
//   );
// }