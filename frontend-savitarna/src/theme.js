import { createTheme } from "@mui/material/styles";

// Didelis šriftas ir mygtukai - patogu ir vyresnio amžiaus žmonėms
export const theme = createTheme({
  palette: { primary: { main: "#1565c0" }, background: { default: "#f5f7fa" } },
  shape: { borderRadius: 12 },
  typography: {
    fontSize: 15,
    button: { textTransform: "none", fontWeight: 600, fontSize: "1.05rem" },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { minHeight: 52 } } },
    MuiTextField: { defaultProps: { fullWidth: true } },
    MuiDialog: { defaultProps: { disableScrollLock: true } },
    MuiMenu: { defaultProps: { disableScrollLock: true } },
    MuiPopover: { defaultProps: { disableScrollLock: true } },
  },
});
