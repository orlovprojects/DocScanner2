import { useState, useEffect } from "react";
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
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";

// NEW:
import { api } from "../api/endpoints";

const Header = () => {
  const { isAuthenticated, logout_user } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const isMobile = useMediaQuery("(max-width:600px)");
  const open = Boolean(anchorEl);

  // NEW: профиль для проверки is_superuser
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
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const isSuper = !!profile?.is_superuser; // удобный флаг

  // --- ДЛЯ ЛОГО ---
  const logoSrc = "/DokSkenas_logo.jpg";
  const logoAlt = "DokSkenas Logo";
  // const isDokskenasLogo = [
  //   "/suvestine",
  //   "/prisijungti",
  //   "/registruotis",
  //   "/papildyti",
  //   "/nustatymai"
  // ].includes(location.pathname);

  // const logoSrc = isDokskenasLogo
  //   ? "/DokSkenas_logo.jpg"
  //   : "/atlyginimo_skaiciuokle_logo.jpg";

  // const logoAlt = isDokskenasLogo
  //   ? "DokSkenas Logo"
  //   : "Atlyginimo Skaiciuokle Logo";

  // --- REST HANDLERS ---
  const handleLogout = async () => {
    await logout_user();
    setAnchorEl(null);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleMenuClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleStartTrial = () => {
    nav("/registruotis");
  };

  // Центр-меню (desktop). Добавим админ-пункты, если суперюзер.
  const menuItemsCenter = isAuthenticated
    ? [
        { text: "Suvestinė", onClick: () => nav("/suvestine") },
        { text: "Kaip naudotis?", onClick: () => nav("/naudojimo-gidas") },
        { text: "Papildyti", onClick: () => nav("/papildyti") },
        // NEW: админ-пункты (показываем только если суперюзер)
        ...(isSuper ? [
          { text: "Klaidų suvestinė", onClick: () => nav("/admin-suvestine") },
          { text: "Visi failai", onClick: () => nav("/admin-visi-failai") },
          { text: "Klientai", onClick: () => nav("/admin-klientai") },
          { text: "Analytics", onClick: () => nav("/admin-dashboard") },
        ] : []),
      ]
    : [
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
            sx={{ display: "flex", alignItems: "center", flex: "1 1 0", cursor: "pointer" }}
            onClick={() => nav("/")}
          >
            <img
              src={logoSrc}
              alt={logoAlt}
              style={{ height: "40px", marginRight: 10 }}
            />
          </Box>

          {/* Центр-меню: только на sm и выше */}
          <Box
            sx={{
              display: { xs: "none", sm: "flex" },
              alignItems: "center",
              justifyContent: "center",
              flex: "1 1 0",
            }}
          >
            {menuItemsCenter.map((item, index) => (
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
                  '&:hover': { background: "#F5F5F5" },
                }}
              >
                {item.text}
              </Button>
            ))}
          </Box>

          {/* Экшены справа: только на sm и выше */}
          <Box
            sx={{
              display: { xs: "none", sm: "flex" }, // <<< Важно!
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
                  background: "linear-gradient(90deg,rgb(162, 0, 255) 0%,rgb(90, 51, 189) 100%)",
                  fontWeight: 600,
                  fontFamily: "Arial",
                  textTransform: "none",
                  paddingLeft: 2,
                  paddingRight: 2,
                  '&:hover': { background: "linear-gradient(90deg,rgb(90, 51, 189) 0%, rgb(162, 0, 255) 100%)" },
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
                  sx={{ ml: 2, color: 'black' }}
                  aria-controls={open ? "account-menu" : undefined}
                  aria-haspopup="true"
                  aria-expanded={open ? "true" : undefined}
                >
                  <AccountCircleIcon sx={{ fontSize: 28, color: 'black' }} />
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

          {/* Бургер-меню только на мобиле! */}
          <Box sx={{ display: { xs: "flex", sm: "none" }, alignItems: "center", ml: 1 }}>
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

      {/* Dropdown Menu */}
      <Menu
        anchorEl={anchorEl}
        id="account-menu"
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
      >
        {/* NEW: админ-ссылки и тут, для удобства */}
        {isAuthenticated && isSuper && (
          <>
            <MenuItem onClick={() => { handleClose(); nav("/admin-suvestine"); }}>
              Klaidų suvestinė
            </MenuItem>
            <MenuItem onClick={() => { handleClose(); nav("/admin-visi-failai"); }}>
              Visi failai
            </MenuItem>
            <MenuItem onClick={() => { handleClose(); nav("/admin-klientai"); }}>
              Klientai
            </MenuItem>
            <MenuItem onClick={() => { handleClose(); nav("/admin-dashboard"); }}>
              Analytics
            </MenuItem>
            <Divider />
          </>
        )}
        <MenuItem onClick={() => { handleClose(); nav("/nustatymai"); }}>
          Nustatymai
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { handleClose(); nav("/mokejimu-istorija"); }}>
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

      {/* Drawer for mobile menu */}
      <Drawer anchor="right" open={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}>
        <Box sx={{ width: 250, fontFamily: "Arial" }}>
          <Box sx={{ display: "flex", justifyContent: "flex-end", p: 1 }}>
            <IconButton onClick={() => setIsDrawerOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
          <List>
            {/* Гость/Неавторизован */}
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

            {/* Авторизован */}
            {isAuthenticated && (
              <>
                <ListItem
                  button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    nav("/suvestine");
                  }}
                >
                  <ListItemText primary="Suvestinė" />
                </ListItem>
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

                {/* NEW: админ-пункты только для суперюзера */}
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
