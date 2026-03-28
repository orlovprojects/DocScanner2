import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  components: {
    MuiMenu: {
      defaultProps: { disableScrollLock: true },
    },
    MuiDialog: {
      defaultProps: { disableScrollLock: true },
    },
    MuiPopover: {
      defaultProps: { disableScrollLock: true },
    },
  },
});

export default theme;