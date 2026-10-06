import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    primary: { main: "#1476ff" },
    background: { default: "#f6f8fb", paper: "#ffffff" },
    text: { primary: "#101828", secondary: "#667085" },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 15,
    button: { textTransform: "none", fontWeight: 700 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          scrollbarGutter: "stable",
        },
        body: {
          minWidth: 0,
        },
        "#root": {
          minWidth: 0,
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 9 } },
    },
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: "none" } },
    },
    MuiTextField: {
      defaultProps: { fullWidth: true },
    },
    MuiDialog: {
      defaultProps: { disableScrollLock: true },
    },
    MuiMenu: {
      defaultProps: { disableScrollLock: true },
    },
    MuiPopover: {
      defaultProps: { disableScrollLock: true },
    },
  },
});
