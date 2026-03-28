import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/useAuth";
import { useNavigate, useLocation } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Button,
  Box,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  useMediaQuery,
  Menu,
  MenuItem,
  Tooltip,
  Divider,
  Paper,
  Popper,
  Grow,
  ClickAwayListener,
  MenuList,
  Collapse,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";

import { api } from "../api/endpoints";

// ─── Mega-menu config ────────────────────────────────────────────
// const MEGA_MENUS = {
//   skaitmenizavimas: {
//     label: "Skaitmenizavimas",
//     items: [
//       { text: "Suvestinė", path: "/suvestine" },
//       { text: "Iš klientų", path: "/is-klientu" },
//       { text: "Nustatymai", path: "/nustatymai" },
//     ],
//   },
//   israsymas: {
//     label: "Išrašymas",
//     items: [
//       { text: "Sąskaitos", path: "/israsymas" },
//       { text: "Banko išrašai", path: "/israsymas/banko-israsai" },
//       { text: "Klientai", path: "/israsymas/klientai" },
//       { text: "Prekės / paslaugos", path: "/israsymas/prekes-paslaugos" },
//       { text: "Serijos ir numeracijos", path: "/israsymas/serijos-numeracijos" },
//       { text: "Matavimo vienetai", path: "/israsymas/matavimo-vienetai" },
//       { text: "Nustatymai", path: "/israsymas/nustatymai" },
//     ],
//   },
// };

const MEGA_MENUS = {
  skaitmenizavimas: {
    label: "Skaitmenizavimas",
    items: [
      { text: "Suvestinė", path: "/suvestine" },
      { text: "Iš klientų", path: "/is-klientu" },
      { text: "Nustatymai", path: "/nustatymai" },
    ],
  },
  israsymas: {
    label: "Išrašymas",
    tag: "Nauja",
    items: [
      { text: "Sąskaitos", path: "/israsymas" },
      { text: "Banko išrašai", path: "/israsymas/banko-israsai" },
      { text: "Klientai", path: "/israsymas/klientai" },
      { text: "Prekės / paslaugos", path: "/israsymas/prekes-paslaugos" },
      { text: "Serijos ir numeracijos", path: "/israsymas/serijos-numeracijos" },
      { text: "Matavimo vienetai", path: "/israsymas/matavimo-vienetai" },
      { text: "Nustatymai", path: "/israsymas/nustatymai" },
    ],
  },
};

// ─── Desktop hover-dropdown ──────────────────────────────────────
const NavDropdown = ({ menu, nav }) => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const timeoutRef = useRef(null);

  const handleEnter = () => {
    clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return (
    <Box
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      sx={{ position: "relative", display: "inline-flex" }}
    >
      {/* <Button
        ref={anchorRef}
        disableRipple
        sx={{
          mx: 2,
          color: "black",
          fontWeight: 700,
          fontFamily: "Arial",
          background: "none",
          textTransform: "none",
          fontSize: 16,
          cursor: "default",
          "&:hover": { background: "#F5F5F5" },
        }}
        endIcon={
          <KeyboardArrowDownIcon
            sx={{
              transition: "transform 0.2s",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        }
      >
        {menu.label}
      </Button> */}

      <Button
        ref={anchorRef}
        disableRipple
        sx={{
          mx: 2,
          color: "black",
          fontWeight: 600,
          fontFamily: "Arial",
          background: "none",
          textTransform: "none",
          fontSize: 16,
          cursor: "default",
          px: 1.5,
          py: 1,
          minHeight: 52,
          "&:hover": { background: "#F5F5F5" },
        }}
        endIcon={
          <KeyboardArrowDownIcon
            sx={{
              transition: "transform 0.2s",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        }
      >
        <Box
          sx={{
            position: "relative",
            display: "inline-flex",
            alignItems: "flex-end",
            minHeight: 30,
            pr: menu.tag ? 4.5 : 0,
            pt: 1.2,
            lineHeight: 1,
          }}
        >
          {menu.tag && (
            <Box
              component="span"
              sx={{
                position: "absolute",
                top: 0,
                right: 0,
                px: 0.9,
                py: "2px",
                borderRadius: "999px",
                backgroundColor: "#6B57E5",
                color: "white",
                fontSize: 10,
                fontWeight: 500,
                lineHeight: 1.2,
                textTransform: "none",
                whiteSpace: "nowrap",
              }}
            >
              {menu.tag}
            </Box>
          )}

          <Box
            component="span"
            sx={{
              fontWeight: 600,
            }}
          >
            {menu.label}
          </Box>
        </Box>
      </Button>

      <Popper
        open={open}
        anchorEl={anchorRef.current}
        placement="bottom-start"
        transition
        disablePortal
        sx={{ zIndex: 1300 }}
      >
        {({ TransitionProps }) => (
          <Grow {...TransitionProps} style={{ transformOrigin: "left top" }}>
            <Paper
              elevation={4}
              sx={{
                mt: 0.5,
                borderRadius: 2,
                minWidth: 220,
                py: 0.5,
              }}
            >
              <ClickAwayListener onClickAway={() => setOpen(false)}>
                <MenuList autoFocusItem={false}>
                  {menu.items.map((item) => (
                    <MenuItem
                      key={item.path}
                      onClick={() => {
                        setOpen(false);
                        nav(item.path);
                      }}
                      sx={{
                        fontFamily: "Arial",
                        fontSize: 15,
                        fontWeight: 500,
                        py: 1,
                        "&:hover": { background: "#F5F5F5" },
                      }}
                    >
                      {item.text}
                    </MenuItem>
                  ))}
                </MenuList>
              </ClickAwayListener>
            </Paper>
          </Grow>
        )}
      </Popper>
    </Box>
  );
};

// ─── Mobile collapsible section ──────────────────────────────────
const MobileDropdownSection = ({ menu, nav, closeDrawer }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ListItem
        button
        onClick={() => setOpen((prev) => !prev)}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <ListItemText
          primary={menu.label}
          primaryTypographyProps={{
            fontFamily: "Arial",
            fontWeight: 500,
            fontSize: 16,
          }}
        />

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            ml: 1,
          }}
        >
          {menu.tag && (
            <Box
              component="span"
              sx={{
                px: 1,
                py: "2px",
                borderRadius: "999px",
                backgroundColor: "#6B57E5",
                color: "white",
                fontSize: 10,
                fontWeight: 500,
                lineHeight: 1.2,
                textTransform: "none",
                whiteSpace: "nowrap",
              }}
            >
              {menu.tag}
            </Box>
          )}

          {open ? <ExpandLess /> : <ExpandMore />}
        </Box>
      </ListItem>

      <Collapse in={open} timeout="auto" unmountOnExit>
        <List disablePadding>
          {menu.items.map((item) => (
            <ListItem
              button
              key={item.path}
              sx={{ pl: 4 }}
              onClick={() => {
                closeDrawer();
                nav(item.path);
              }}
            >
              <ListItemText
                primary={item.text}
                primaryTypographyProps={{
                  fontFamily: "Arial",
                  fontSize: 15,
                }}
              />
            </ListItem>
          ))}
        </List>
      </Collapse>
    </>
  );
};

// ═════════════════════════════════════════════════════════════════
// HEADER
// ═════════════════════════════════════════════════════════════════
const Header = () => {
  const { isAuthenticated, logout_user } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const isMobile = useMediaQuery("(max-width:600px)");
  const open = Boolean(anchorEl);

  // Профиль для проверки is_superuser
  const [profile, setProfile] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      setProfileLoaded(false);
      try {
        if (!isAuthenticated) {
          setProfile(null);
          return;
        }
        const { data } = await api.get("/profile/", { withCredentials: true });
        if (!cancelled) setProfile(data);
      } catch {
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setProfileLoaded(true);
      }
    }
    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const isSuper = !!profile?.is_superuser;

  const logoSrc = "/DokSkenas_logo.jpg";
  const logoAlt = "DokSkenas Logo";

  // ─── handlers ────────────────────────────────────────────────
  const handleLogout = async () => {
    await logout_user();
    setAnchorEl(null);
  };

  const handleClose = () => setAnchorEl(null);
  const handleMenuClick = (event) => setAnchorEl(event.currentTarget);
  const handleStartTrial = () => nav("/registruotis");

  // ─── Простые (не-dropdown) desktop-пункты ────────────────────
  const plainDesktopItems = [
    { text: "Kaip naudotis?", onClick: () => nav("/naudojimo-gidas") },
    { text: "Papildyti", onClick: () => nav("/papildyti") },
    ...(isSuper
      ? [
          { text: "Klaidų suvestinė", onClick: () => nav("/admin-suvestine") },
          { text: "Visi failai", onClick: () => nav("/admin-visi-failai") },
          { text: "Klientai", onClick: () => nav("/admin-klientai") },
          { text: "Analytics", onClick: () => nav("/admin-dashboard") },
        ]
      : []),
  ];

  const guestDesktopItems = [
    { text: "DokSkenas", onClick: () => nav("/saskaitu-skaitmenizavimas-dokskenas") },
  ];

  useEffect(() => {
    console.log("Header detected authentication state change:", isAuthenticated);
  }, [isAuthenticated]);

  return (
    <Box>
      <AppBar
        position="static"
        elevation={0}
        sx={{
          bgcolor: "#FAFAFA",
          color: "black",
          fontFamily: "Arial",
          borderBottom: "1px solid #ECECEC",
        }}
      >
        <Toolbar sx={{ minHeight: 64, px: { xs: 2, sm: 4 } }}>
          {/* Логотип */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              flex: "1 1 0",
              cursor: "pointer",
            }}
            onClick={() => nav("/")}
          >
            <img
              src={logoSrc}
              alt={logoAlt}
              style={{ height: "40px", marginRight: 10 }}
            />
          </Box>

          {/* ── Центр-меню (desktop) ─────────────────────────── */}
          <Box
            sx={{
              display: { xs: "none", sm: "flex" },
              alignItems: "center",
              justifyContent: "center",
              flex: "1 1 0",
            }}
          >
            {isAuthenticated ? (
              <>
                {/* Mega-dropdown: Skaitmenizavimas */}
                <NavDropdown menu={MEGA_MENUS.skaitmenizavimas} nav={nav} />

                {/* Mega-dropdown: Išrašymas */}
                <NavDropdown menu={MEGA_MENUS.israsymas} nav={nav} />

                {/* Обычные пункты */}
                {plainDesktopItems.map((item, index) => (
                  <Button
                    key={index}
                    onClick={item.onClick}
                    sx={{
                      mx: 2,
                      color: "black",
                      fontWeight: 700,
                      fontFamily: "Arial",
                      background: "none",
                      textTransform: "none",
                      fontSize: 16,
                      "&:hover": { background: "#F5F5F5" },
                    }}
                  >
                    {item.text}
                  </Button>
                ))}
              </>
            ) : (
              guestDesktopItems.map((item, index) => (
                <Button
                  key={index}
                  onClick={item.onClick}
                  sx={{
                    mx: 2,
                    color: "black",
                    fontWeight: 700,
                    fontFamily: "Arial",
                    background: "none",
                    textTransform: "none",
                    fontSize: 16,
                    "&:hover": { background: "#F5F5F5" },
                  }}
                >
                  {item.text}
                </Button>
              ))
            )}
          </Box>

          {/* ── Правая часть (desktop) ───────────────────────── */}
          <Box
            sx={{
              display: { xs: "none", sm: "flex" },
              alignItems: "center",
              justifyContent: "flex-end",
              flex: "1 1 0",
            }}
          >
            {!isAuthenticated && (
              <Button
                color="inherit"
                sx={{
                  mr: 2,
                  borderColor: "#F5BE0D",
                  color: "white",
                  background:
                    "linear-gradient(90deg,rgb(162, 0, 255) 0%,rgb(90, 51, 189) 100%)",
                  fontWeight: 600,
                  fontFamily: "Arial",
                  textTransform: "none",
                  paddingLeft: 2,
                  paddingRight: 2,
                  "&:hover": {
                    background:
                      "linear-gradient(90deg,rgb(90, 51, 189) 0%, rgb(162, 0, 255) 100%)",
                  },
                }}
                onClick={handleStartTrial}
              >
                Išbandyti nemokamai
              </Button>
            )}
            {isAuthenticated ? (
              <Tooltip title="Paskyra">
                <IconButton
                  onClick={handleMenuClick}
                  size="small"
                  sx={{ ml: 2, color: "black" }}
                  aria-controls={open ? "account-menu" : undefined}
                  aria-haspopup="true"
                  aria-expanded={open ? "true" : undefined}
                >
                  <AccountCircleIcon sx={{ fontSize: 28, color: "black" }} />
                </IconButton>
              </Tooltip>
            ) : (
              <Button
                color="inherit"
                startIcon={<LoginIcon />}
                onClick={() => nav("/prisijungti")}
                sx={{
                  fontFamily: "Arial",
                  textTransform: "none",
                  fontWeight: 700,
                }}
              >
                Prisijungti
              </Button>
            )}
          </Box>

          {/* ── Бургер (mobile) ──────────────────────────────── */}
          <Box
            sx={{
              display: { xs: "flex", sm: "none" },
              alignItems: "center",
              ml: 1,
            }}
          >
            <IconButton
              color="inherit"
              edge="end"
              onClick={() => setIsDrawerOpen(true)}
            >
              <MenuIcon />
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      {/* ── Account dropdown ─────────────────────────────────── */}
      <Menu
        anchorEl={anchorEl}
        id="account-menu"
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        disableScrollLock
      >
        {isAuthenticated && isSuper && (
          <>
            <MenuItem
              onClick={() => {
                handleClose();
                nav("/admin-suvestine");
              }}
            >
              Klaidų suvestinė
            </MenuItem>
            <MenuItem
              onClick={() => {
                handleClose();
                nav("/admin-visi-failai");
              }}
            >
              Visi failai
            </MenuItem>
            <MenuItem
              onClick={() => {
                handleClose();
                nav("/admin-klientai");
              }}
            >
              Klientai
            </MenuItem>
            <MenuItem
              onClick={() => {
                handleClose();
                nav("/admin-dashboard");
              }}
            >
              Analytics
            </MenuItem>
            <Divider />
          </>
        )}
        <MenuItem
          onClick={() => {
            handleClose();
            nav("/nustatymai");
          }}
        >
          Nustatymai
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            handleClose();
            nav("/mokejimu-istorija");
          }}
        >
          Mokėjimų istorija
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Atsijungti
        </MenuItem>
      </Menu>

      {/* ── Mobile Drawer ────────────────────────────────────── */}
      <Drawer
        anchor="right"
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      >
        <Box sx={{ width: 250, fontFamily: "Arial" }}>
          <Box sx={{ display: "flex", justifyContent: "flex-end", p: 1 }}>
            <IconButton onClick={() => setIsDrawerOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
          <List>
            {/* ── Гость ─────────────────────────────────────── */}
            {!isAuthenticated && (
              <>
                <ListItem
                  button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    nav("/saskaitu-skaitmenizavimas-dokskenas");
                  }}
                >
                  <ListItemText primary="DokSkenas" />
                </ListItem>
                <ListItem
                  button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    nav("/prisijungti");
                  }}
                >
                  <ListItemIcon>
                    <LoginIcon />
                  </ListItemIcon>
                  <ListItemText primary="Prisijungti" />
                </ListItem>
                <ListItem
                  button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    nav("/registruotis");
                  }}
                >
                  <ListItemText primary="Registruotis" />
                </ListItem>
              </>
            )}

            {/* ── Авторизован ────────────────────────────────── */}
            {isAuthenticated && (
              <>
                {/* Collapsible: Skaitmenizavimas */}
                <MobileDropdownSection
                  menu={MEGA_MENUS.skaitmenizavimas}
                  nav={nav}
                  closeDrawer={() => setIsDrawerOpen(false)}
                />

                {/* Collapsible: Išrašymas */}
                <MobileDropdownSection
                  menu={MEGA_MENUS.israsymas}
                  nav={nav}
                  closeDrawer={() => setIsDrawerOpen(false)}
                />

                <ListItem
                  button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    nav("/naudojimo-gidas");
                  }}
                >
                  <ListItemText primary="Kaip naudotis?" />
                </ListItem>
                <ListItem
                  button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    nav("/papildyti");
                  }}
                >
                  <ListItemText primary="Papildyti" />
                </ListItem>

                {/* Админ-пункты */}
                {isSuper && (
                  <>
                    <Divider />
                    <ListItem
                      button
                      onClick={() => {
                        setIsDrawerOpen(false);
                        nav("/admin-suvestine");
                      }}
                    >
                      <ListItemText primary="Klaidų suvestinė" />
                    </ListItem>
                    <ListItem
                      button
                      onClick={() => {
                        setIsDrawerOpen(false);
                        nav("/admin-visi-failai");
                      }}
                    >
                      <ListItemText primary="Visi failai" />
                    </ListItem>
                    <ListItem
                      button
                      onClick={() => {
                        setIsDrawerOpen(false);
                        nav("/admin-klientai");
                      }}
                    >
                      <ListItemText primary="Klientai" />
                    </ListItem>
                    <ListItem
                      button
                      onClick={() => {
                        setIsDrawerOpen(false);
                        nav("/admin-dashboard");
                      }}
                    >
                      <ListItemText primary="Analytics" />
                    </ListItem>
                  </>
                )}

                <Divider />
                <ListItem
                  button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    nav("/nustatymai");
                  }}
                >
                  <ListItemText primary="Nustatymai" />
                </ListItem>
                <Divider />
                <ListItem
                  button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    nav("/mokejimu-istorija");
                  }}
                >
                  <ListItemText primary="Mokėjimų istorija" />
                </ListItem>
                <ListItem
                  button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    handleLogout();
                  }}
                >
                  <ListItemIcon>
                    <LogoutIcon />
                  </ListItemIcon>
                  <ListItemText primary="Atsijungti" />
                </ListItem>
              </>
            )}
          </List>
        </Box>
      </Drawer>
    </Box>
  );
};

export default Header;









// import { useState, useEffect } from "react";
// import { useAuth } from "../contexts/useAuth";
// import { useNavigate, useLocation } from "react-router-dom";
// import {
//   AppBar,
//   Toolbar,
//   Button,
//   Box,
//   IconButton,
//   Drawer,
//   List,
//   ListItem,
//   ListItemText,
//   ListItemIcon,
//   useMediaQuery,
//   Menu,
//   MenuItem,
//   Tooltip,
//   Divider,
// } from "@mui/material";
// import MenuIcon from "@mui/icons-material/Menu";
// import CloseIcon from "@mui/icons-material/Close";
// import LoginIcon from "@mui/icons-material/Login";
// import LogoutIcon from "@mui/icons-material/Logout";
// import AccountCircleIcon from "@mui/icons-material/AccountCircle";

// // NEW:
// import { api } from "../api/endpoints";

// const Header = () => {
//   const { isAuthenticated, logout_user } = useAuth();
//   const nav = useNavigate();
//   const location = useLocation();
//   const [isDrawerOpen, setIsDrawerOpen] = useState(false);
//   const [anchorEl, setAnchorEl] = useState(null);
//   const isMobile = useMediaQuery("(max-width:600px)");
//   const open = Boolean(anchorEl);

//   // NEW: профиль для проверки is_superuser
//   const [profile, setProfile] = useState(null);
//   const [profileLoaded, setProfileLoaded] = useState(false);

//   useEffect(() => {
//     let cancelled = false;
//     async function loadProfile() {
//       setProfileLoaded(false);
//       try {
//         if (!isAuthenticated) {
//           setProfile(null);
//           return;
//         }
//         const { data } = await api.get("/profile/", { withCredentials: true });
//         if (!cancelled) setProfile(data);
//       } catch {
//         if (!cancelled) setProfile(null);
//       } finally {
//         if (!cancelled) setProfileLoaded(true);
//       }
//     }
//     loadProfile();
//     return () => { cancelled = true; };
//   }, [isAuthenticated]);

//   const isSuper = !!profile?.is_superuser; // удобный флаг

//   // --- ДЛЯ ЛОГО ---
//   const logoSrc = "/DokSkenas_logo.jpg";
//   const logoAlt = "DokSkenas Logo";
//   // const isDokskenasLogo = [
//   //   "/suvestine",
//   //   "/prisijungti",
//   //   "/registruotis",
//   //   "/papildyti",
//   //   "/nustatymai"
//   // ].includes(location.pathname);

//   // const logoSrc = isDokskenasLogo
//   //   ? "/DokSkenas_logo.jpg"
//   //   : "/atlyginimo_skaiciuokle_logo.jpg";

//   // const logoAlt = isDokskenasLogo
//   //   ? "DokSkenas Logo"
//   //   : "Atlyginimo Skaiciuokle Logo";

//   // --- REST HANDLERS ---
//   const handleLogout = async () => {
//     await logout_user();
//     setAnchorEl(null);
//   };

//   const handleClose = () => {
//     setAnchorEl(null);
//   };

//   const handleMenuClick = (event) => {
//     setAnchorEl(event.currentTarget);
//   };

//   const handleStartTrial = () => {
//     nav("/registruotis");
//   };

//   // Центр-меню (desktop). Добавим админ-пункты, если суперюзер.
//   const menuItemsCenter = isAuthenticated
//     ? [
//         { text: "Suvestinė", onClick: () => nav("/suvestine") },
//         { text: "Iš klientų", onClick: () => nav("/is-klientu") },
//         { text: "Išrašymas", onClick: () => nav("/israsymas") },
//         { text: "Kaip naudotis?", onClick: () => nav("/naudojimo-gidas") },
//         { text: "Papildyti", onClick: () => nav("/papildyti") },
//         // NEW: админ-пункты (показываем только если суперюзер)
//         ...(isSuper ? [
//           { text: "Klaidų suvestinė", onClick: () => nav("/admin-suvestine") },
//           { text: "Visi failai", onClick: () => nav("/admin-visi-failai") },
//           { text: "Klientai", onClick: () => nav("/admin-klientai") },
//           { text: "Analytics", onClick: () => nav("/admin-dashboard") },
//         ] : []),
//       ]
//     : [
//         { text: "DokSkenas", onClick: () => nav("/saskaitu-skaitmenizavimas-dokskenas") },
//       ];

//   useEffect(() => {
//     console.log("Header detected authentication state change:", isAuthenticated);
//   }, [isAuthenticated]);

//   return (
//     <Box>
//       <AppBar
//         position="static"
//         elevation={0}
//         sx={{
//           bgcolor: "#FAFAFA",
//           color: "black",
//           fontFamily: "Arial",
//           borderBottom: "1px solid #ECECEC",
//         }}
//       >
//         <Toolbar sx={{ minHeight: 64, px: { xs: 2, sm: 4 } }}>
//           {/* Логотип */}
//           <Box
//             sx={{ display: "flex", alignItems: "center", flex: "1 1 0", cursor: "pointer" }}
//             onClick={() => nav("/")}
//           >
//             <img
//               src={logoSrc}
//               alt={logoAlt}
//               style={{ height: "40px", marginRight: 10 }}
//             />
//           </Box>

//           {/* Центр-меню: только на sm и выше */}
//           <Box
//             sx={{
//               display: { xs: "none", sm: "flex" },
//               alignItems: "center",
//               justifyContent: "center",
//               flex: "1 1 0",
//             }}
//           >
//             {menuItemsCenter.map((item, index) => (
//               <Button
//                 key={index}
//                 onClick={item.onClick}
//                 sx={{
//                   mx: 2,
//                   color: "black",
//                   fontWeight: 700,
//                   fontFamily: "Arial",
//                   background: "none",
//                   textTransform: "none",
//                   fontSize: 16,
//                   '&:hover': { background: "#F5F5F5" },
//                 }}
//               >
//                 {item.text}
//               </Button>
//             ))}
//           </Box>

//           {/* Экшены справа: только на sm и выше */}
//           <Box
//             sx={{
//               display: { xs: "none", sm: "flex" }, // <<< Важно!
//               alignItems: "center",
//               justifyContent: "flex-end",
//               flex: "1 1 0",
//             }}
//           >
//             {!isAuthenticated && (
//               <Button
//                 color="inherit"
//                 sx={{
//                   mr: 2,
//                   borderColor: "#F5BE0D",
//                   color: "white",
//                   background: "linear-gradient(90deg,rgb(162, 0, 255) 0%,rgb(90, 51, 189) 100%)",
//                   fontWeight: 600,
//                   fontFamily: "Arial",
//                   textTransform: "none",
//                   paddingLeft: 2,
//                   paddingRight: 2,
//                   '&:hover': { background: "linear-gradient(90deg,rgb(90, 51, 189) 0%, rgb(162, 0, 255) 100%)" },
//                 }}
//                 onClick={handleStartTrial}
//               >
//                 Išbandyti nemokamai
//               </Button>
//             )}
//             {isAuthenticated ? (
//               <Tooltip title="Paskyra">
//                 <IconButton
//                   onClick={handleMenuClick}
//                   size="small"
//                   sx={{ ml: 2, color: 'black' }}
//                   aria-controls={open ? "account-menu" : undefined}
//                   aria-haspopup="true"
//                   aria-expanded={open ? "true" : undefined}
//                 >
//                   <AccountCircleIcon sx={{ fontSize: 28, color: 'black' }} />
//                 </IconButton>
//               </Tooltip>
//             ) : (
//               <Button
//                 color="inherit"
//                 startIcon={<LoginIcon />}
//                 onClick={() => nav("/prisijungti")}
//                 sx={{
//                   fontFamily: "Arial",
//                   textTransform: "none",
//                   fontWeight: 700,
//                 }}
//               >
//                 Prisijungti
//               </Button>
//             )}
//           </Box>

//           {/* Бургер-меню только на мобиле! */}
//           <Box sx={{ display: { xs: "flex", sm: "none" }, alignItems: "center", ml: 1 }}>
//             <IconButton
//               color="inherit"
//               edge="end"
//               onClick={() => setIsDrawerOpen(true)}
//             >
//               <MenuIcon />
//             </IconButton>
//           </Box>
//         </Toolbar>
//       </AppBar>

//       {/* Dropdown Menu */}
//       <Menu
//         anchorEl={anchorEl}
//         id="account-menu"
//         open={open}
//         onClose={handleClose}
//         transformOrigin={{ horizontal: "right", vertical: "top" }}
//         anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
//       >
//         {/* NEW: админ-ссылки и тут, для удобства */}
//         {isAuthenticated && isSuper && (
//           <>
//             <MenuItem onClick={() => { handleClose(); nav("/admin-suvestine"); }}>
//               Klaidų suvestinė
//             </MenuItem>
//             <MenuItem onClick={() => { handleClose(); nav("/admin-visi-failai"); }}>
//               Visi failai
//             </MenuItem>
//             <MenuItem onClick={() => { handleClose(); nav("/admin-klientai"); }}>
//               Klientai
//             </MenuItem>
//             <MenuItem onClick={() => { handleClose(); nav("/admin-dashboard"); }}>
//               Analytics
//             </MenuItem>
//             <Divider />
//           </>
//         )}
//         <MenuItem onClick={() => { handleClose(); nav("/nustatymai"); }}>
//           Nustatymai
//         </MenuItem>
//         <Divider />
//         <MenuItem onClick={() => { handleClose(); nav("/mokejimu-istorija"); }}>
//           Mokėjimų istorija
//         </MenuItem>
//         <Divider />
//         <MenuItem onClick={handleLogout}>
//           <ListItemIcon>
//             <LogoutIcon fontSize="small" />
//           </ListItemIcon>
//           Atsijungti
//         </MenuItem>
//       </Menu>

//       {/* Drawer for mobile menu */}
//       <Drawer anchor="right" open={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}>
//         <Box sx={{ width: 250, fontFamily: "Arial" }}>
//           <Box sx={{ display: "flex", justifyContent: "flex-end", p: 1 }}>
//             <IconButton onClick={() => setIsDrawerOpen(false)}>
//               <CloseIcon />
//             </IconButton>
//           </Box>
//           <List>
//             {/* Гость/Неавторизован */}
//             {!isAuthenticated && (
//               <>
//                 <ListItem
//                   button
//                   onClick={() => {
//                     setIsDrawerOpen(false);
//                     nav("/saskaitu-skaitmenizavimas-dokskenas");
//                   }}
//                 >
//                   <ListItemText primary="DokSkenas" />
//                 </ListItem>
//                 <ListItem
//                   button
//                   onClick={() => {
//                     setIsDrawerOpen(false);
//                     nav("/prisijungti");
//                   }}
//                 >
//                   <ListItemIcon>
//                     <LoginIcon />
//                   </ListItemIcon>
//                   <ListItemText primary="Prisijungti" />
//                 </ListItem>
//                 <ListItem
//                   button
//                   onClick={() => {
//                     setIsDrawerOpen(false);
//                     nav("/registruotis");
//                   }}
//                 >
//                   <ListItemText primary="Registruotis" />
//                 </ListItem>
//               </>
//             )}

//             {/* Авторизован */}
//             {isAuthenticated && (
//               <>
//                 <ListItem
//                   button
//                   onClick={() => {
//                     setIsDrawerOpen(false);
//                     nav("/suvestine");
//                   }}
//                 >
//                   <ListItemText primary="Suvestinė" />
//                 </ListItem>
//                 <ListItem
//                   button
//                   onClick={() => {
//                     setIsDrawerOpen(false);
//                     nav("/is-klientu");
//                   }}
//                 >
//                   <ListItemText primary="Iš klientų" />
//                 </ListItem>
//                 <ListItem
//                   button
//                   onClick={() => {
//                     setIsDrawerOpen(false);
//                     nav("/israsymas");
//                   }}
//                 >
//                   <ListItemText primary="Išrašymas" />
//                 </ListItem>
//                 <ListItem
//                   button
//                   onClick={() => {
//                     setIsDrawerOpen(false);
//                     nav("/naudojimo-gidas");
//                   }}
//                 >
//                   <ListItemText primary="Kaip naudotis?" />
//                 </ListItem>
//                 <ListItem
//                   button
//                   onClick={() => {
//                     setIsDrawerOpen(false);
//                     nav("/papildyti");
//                   }}
//                 >
//                   <ListItemText primary="Papildyti" />
//                 </ListItem>

//                 {/* NEW: админ-пункты только для суперюзера */}
//                 {isSuper && (
//                   <>
//                     <Divider />
//                     <ListItem
//                       button
//                       onClick={() => {
//                         setIsDrawerOpen(false);
//                         nav("/admin-suvestine");
//                       }}
//                     >
//                       <ListItemText primary="Klaidų suvestinė" />
//                     </ListItem>
//                     <ListItem
//                       button
//                       onClick={() => {
//                         setIsDrawerOpen(false);
//                         nav("/admin-visi-failai");
//                       }}
//                     >
//                       <ListItemText primary="Visi failai" />
//                     </ListItem>
//                     <ListItem
//                       button
//                       onClick={() => {
//                         setIsDrawerOpen(false);
//                         nav("/admin-klientai");
//                       }}
//                     >
//                       <ListItemText primary="Klientai" />
//                     </ListItem>
//                     <ListItem
//                       button
//                       onClick={() => {
//                         setIsDrawerOpen(false);
//                         nav("/admin-dashboard");
//                       }}
//                     >
//                       <ListItemText primary="Analytics" />
//                     </ListItem>
//                   </>
//                 )}

//                 <Divider />
//                 <ListItem
//                   button
//                   onClick={() => {
//                     setIsDrawerOpen(false);
//                     nav("/nustatymai");
//                   }}
//                 >
//                   <ListItemText primary="Nustatymai" />
//                 </ListItem>
//                 <Divider />
//                 <ListItem
//                   button
//                   onClick={() => {
//                     setIsDrawerOpen(false);
//                     nav("/mokejimu-istorija");
//                   }}
//                 >
//                   <ListItemText primary="Mokėjimų istorija" />
//                 </ListItem>
//                 <ListItem
//                   button
//                   onClick={() => {
//                     setIsDrawerOpen(false);
//                     handleLogout();
//                   }}
//                 >
//                   <ListItemIcon>
//                     <LogoutIcon />
//                   </ListItemIcon>
//                   <ListItemText primary="Atsijungti" />
//                 </ListItem>
//               </>
//             )}
//           </List>
//         </Box>
//       </Drawer>
//     </Box>
//   );
// };

// export default Header;
