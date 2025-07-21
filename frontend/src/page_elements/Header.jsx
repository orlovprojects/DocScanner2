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

const Header = () => {
  const { isAuthenticated, logout_user } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const isMobile = useMediaQuery("(max-width:600px)");
  const open = Boolean(anchorEl);

  // --- ДЛЯ ЛОГО ---
  const isDokskenasLogo = [
    "/dokskenas",
    "/suvestine",
    "/prisijungti",
    "/registruotis",
    "/papildyti",
    "/susisiekti",
    "/nustatymai"
  ].includes(location.pathname);

  const logoSrc = isDokskenasLogo
    ? "/DokSkenas_logo.jpg"
    : "/atlyginimo_skaiciuokle_logo.jpg";

  const logoAlt = isDokskenasLogo
    ? "DokSkenas Logo"
    : "Atlyginimo Skaiciuokle Logo";

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

  const scrollToPricing = () => {
    const pricingElement = document.getElementById("pricing");
    if (pricingElement) {
      pricingElement.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleDemoClick = () => {
    if (window.location.pathname === "/") {
      if (window.location.hash === "#demo") {
        window.location.hash = "";
        setTimeout(() => {
          window.location.hash = "#demo";
        }, 0);
      } else {
        window.location.hash = "#demo";
      }
    } else {
      window.location.href = "/#demo";
    }
  };

  const menuItemsCenter = isAuthenticated
    ? [
        { text: "Suvestinė", onClick: () => nav("/suvestine") },
        { text: "Papildyti", onClick: () => nav("/papildyti") },
      ]
    : [
        { text: "DokSkenas", onClick: () => nav("/dokskenas") },
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
          {/* Logo */}
          <Box
            sx={{ display: "flex", alignItems: "center", flexGrow: 0, cursor: "pointer" }}
            onClick={() => nav("/")}
          >
            <img
              src={logoSrc}
              alt={logoAlt}
              style={{ height: "40px", marginRight: 10 }}
            />
          </Box>

          {/* Burger menu for mobile */}
          {isMobile ? (
            <IconButton
              color="inherit"
              edge="end"
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
              sx={{ marginLeft: "auto" }}
            >
              <MenuIcon />
            </IconButton>
          ) : (
            <>
              {/* Centered menu items */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  flexGrow: 2,
                  fontFamily: "Arial",
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
              {/* Profile Icon with Dropdown */}
              <Box sx={{ display: "flex", alignItems: "center" }}>
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
                  <Tooltip title="Account settings">
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
            </>
          )}
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
        <MenuItem onClick={() => { handleClose(); nav("/nustatymai"); }}>
          Nustatymai
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
                    nav("/dokskenas");
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
                    nav("/papildyti");
                  }}
                >
                  <ListItemText primary="Papildyti" />
                </ListItem>
                <ListItem
                  button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    nav("/nustatymai");
                  }}
                >
                  <ListItemText primary="Nustatymai" />
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




