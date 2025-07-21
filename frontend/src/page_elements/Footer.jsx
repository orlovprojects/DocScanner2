import { Box, Typography, Link } from '@mui/material';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <Box 
      sx={{ 
        bgcolor: '#FAFAFA', 
        color: 'black', 
        padding: 2, 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between', 
        alignItems: 'center', 
        minHeight: '60px',
      }}
    >
      <Typography 
        variant="body2" 
        sx={{ 
          flex: 1, 
          fontFamily: 'Arial', 
          marginBottom: { xs: 2, sm: 0 }, 
          textAlign: { xs: 'center', sm: 'left' } 
        }}
      >
        © {currentYear} Atlyginimo Skaičiuoklė. Visos teisės saugomos.
      </Typography>
      
      <Box 
        sx={{ 
          display: 'flex', 
          gap: 2, 
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'center', sm: 'flex-start' } 
        }}
      >
        <Link href="/susisiekti" color="inherit" variant="body2" fontFamily='Arial' sx={{ textDecoration: 'none' }}>
          Susisiekti
        </Link>
        <Link href="/privatumo-politika" color="inherit" variant="body2" fontFamily='Arial' sx={{ textDecoration: 'none' }}>
          Privatumo politika
        </Link>
        <Link href="/naudojimo-taisykles" color="inherit" variant="body2" fontFamily='Arial' sx={{ textDecoration: 'none' }}>
          Naudojimo taisyklės
        </Link>
      </Box>
    </Box>
  );
};

export default Footer;
