import { Box, Typography, Link, Divider, Stack, IconButton } from '@mui/material';
import Grid2 from '@mui/material/Grid2';
import FacebookIcon from '@mui/icons-material/Facebook';
import YouTubeIcon from '@mui/icons-material/YouTube';
import InstagramIcon from '@mui/icons-material/Instagram';
import { Link as RouterLink } from 'react-router-dom';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  const linkSx = {
    fontFamily: 'Arial, sans-serif',
    display: 'inline-block',
    lineHeight: 1.5,
    py: { xs: 0.5, md: 0 },
    fontSize: { xs: '15px', md: '14px' },
  };

  const headingSx = {
    fontWeight: 600,
    fontSize: { xs: '16px', md: '15px' },
    pt: { xs: 0, md: 0 },
    pb: { xs: '16px', md: '12px' },
  };

  return (
    <Box component="footer" sx={{ bgcolor: '#FAFAFA', color: 'text.primary', mt: 6, fontFamily: 'Arial, sans-serif' }}>
      {/* Top: social icons */}
      <Box sx={{ py: { xs: 2.5, md: 3 }, display: 'flex', justifyContent: 'center', gap: 2 }}>
        <IconButton 
          component="a" 
          href="https://www.facebook.com/dokskenas/" 
          target="_blank" 
          rel="noopener noreferrer" 
          aria-label="Facebook" 
          sx={{ color: 'inherit' }}
        >
          <FacebookIcon sx={{ fontSize: { xs: 28, md: 30 } }} />
        </IconButton>
        <IconButton 
          component="a" 
          href="https://www.youtube.com/@dokskenas/" 
          target="_blank" 
          rel="noopener noreferrer" 
          aria-label="YouTube" 
          sx={{ color: 'inherit' }}
        >
          <YouTubeIcon sx={{ fontSize: { xs: 28, md: 30 } }} />
        </IconButton>
        <IconButton 
          component="a" 
          href="https://www.instagram.com/dokskenas/" 
          target="_blank" 
          rel="noopener noreferrer" 
          aria-label="Instagram" 
          sx={{ color: 'inherit' }}
        >
          <InstagramIcon sx={{ fontSize: { xs: 28, md: 30 } }} />
        </IconButton>
      </Box>

      <Divider />

      {/* Middle: Links section */}
      <Box sx={{ px: { xs: 2, sm: 4 }, py: { xs: 4, md: 5 } }}>
        <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
          <Grid2
            container
            spacing={{ xs: 6, md: 6 }}
            justifyContent={{ xs: 'center', md: 'center' }}
          >
            {/* Col 1: DokSkenas */}
            <Grid2 size={{ xs: 12, md: 4 }}>
              <Box sx={{ textAlign: { xs: 'center', md: 'center' } }}>
                <Typography variant="subtitle1" sx={headingSx}>
                  DokSkenas
                </Typography>
                <Stack 
                  spacing={1.25} 
                  alignItems={{ xs: 'center', md: 'center' }}
                >
                  <Link href="/buhalterine-apskaita" underline="none" color="inherit" sx={linkSx}>
                    Buhalterinė apskaita
                  </Link>
                  <Link
                    component={RouterLink}
                    to="/saskaitu-skaitmenizavimas-dokskenas#kaip-veikia"
                    underline="none"
                    color="inherit"
                    sx={linkSx}
                  >
                    Kaip veikia?
                  </Link>
                  <Link
                    component={RouterLink}
                    to="/saskaitu-skaitmenizavimas-dokskenas#ka-moka"
                    underline="none"
                    color="inherit"
                    sx={linkSx}
                  >
                    Ką moka?
                  </Link>
                  <Link
                    component={RouterLink}
                    to="/saskaitu-skaitmenizavimas-dokskenas#kainos"
                    underline="none"
                    color="inherit"
                    sx={linkSx}
                  >
                    Kainos
                  </Link>
                  <Link href="/apie-mus" underline="none" color="inherit" sx={linkSx}>
                    Apie mus
                  </Link>
                </Stack>
              </Box>
            </Grid2>

            {/* Col 2: Pagalba */}
            <Grid2 size={{ xs: 12, md: 4 }}>
              <Box sx={{ textAlign: { xs: 'center', md: 'center' } }}>
                <Typography variant="subtitle1" sx={headingSx}>
                  Pagalba
                </Typography>
                <Stack 
                  spacing={1.25} 
                  alignItems={{ xs: 'center', md: 'center' }}
                >
                  <Link href="/naudojimo-gidas" underline="none" color="inherit" sx={linkSx}>
                    Naudojimo gidas
                  </Link>
                  <Link href="/susisiekti" underline="none" color="inherit" sx={linkSx}>
                    Susisiekti
                  </Link>
                </Stack>
              </Box>
            </Grid2>

            {/* Col 3: Naudingos nuorodos */}
            <Grid2 size={{ xs: 12, md: 4 }}>
              <Box sx={{ textAlign: { xs: 'center', md: 'center' } }}>
                <Typography variant="subtitle1" sx={headingSx}>
                  Naudingos nuorodos
                </Typography>
                <Stack 
                  spacing={1.25} 
                  alignItems={{ xs: 'center', md: 'center' }}
                >
                  <Link href="/saskaita-faktura" underline="none" color="inherit" sx={linkSx}>
                    Nemokamas sąskaitos-faktūros generatorius
                  </Link>
                  <Link href="/2026" underline="none" color="inherit" sx={linkSx}>
                    Atlyginimo skaičiuoklė 2026
                  </Link>
                  <Link href="/" underline="none" color="inherit" sx={linkSx}>
                    Atlyginimo skaičiuoklė 2025
                  </Link>
                  <Link href="/gpm-skaiciuokle" underline="none" color="inherit" sx={linkSx}>
                    GPM skaičiuoklė
                  </Link>
                  <Link href="/pvm-skaiciuokle" underline="none" color="inherit" sx={linkSx}>
                    PVM skaičiuoklė
                  </Link>
                </Stack>
              </Box>
            </Grid2>
          </Grid2>
        </Box>
      </Box>

      <Divider />

      {/* Bottom: Copyright and legal links */}
      <Box sx={{ px: { xs: 2, sm: 4 }, py: { xs: 2.5, md: 2.5 } }}>
        <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
          <Stack 
            direction={{ xs: 'column', sm: 'row' }} 
            justifyContent="space-between" 
            alignItems="center" 
            spacing={2}
          >
            <Typography 
              variant="body2" 
              sx={{ 
                order: { xs: 2, sm: 1 }, 
                textAlign: 'center',
                fontSize: { xs: '13px', md: '14px' }
              }}
            >
              © {currentYear} Atlyginimo Skaičiuoklė. Visos teisės saugomos.
            </Typography>
            
            <Stack 
              direction="row" 
              spacing={{ xs: 2, sm: 3 }} 
              sx={{ 
                order: { xs: 1, sm: 2 },
                flexWrap: 'wrap',
                justifyContent: 'center'
              }}
            >
              <Link 
                href="/privatumo-politika" 
                underline="none" 
                color="inherit" 
                sx={{ ...linkSx, py: 2 }}
              >
                Privatumo politika
              </Link>
              <Link 
                href="/naudojimo-taisykles" 
                underline="none" 
                color="inherit" 
                sx={{ ...linkSx, py: 2 }}
              >
                Naudojimo taisyklės
              </Link>
            </Stack>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
};

export default Footer;





// import { Box, Typography, Link, Divider, Stack, IconButton } from '@mui/material';
// import Grid2 from '@mui/material/Grid2';
// import FacebookIcon from '@mui/icons-material/Facebook';
// import YouTubeIcon from '@mui/icons-material/YouTube';

// const Footer = () => {
//   const currentYear = new Date().getFullYear();

//   const linkSx = {
//     fontFamily: 'Arial, sans-serif',
//     display: 'inline-block',
//     lineHeight: 1.5,
//     py: { xs: 0.5, md: 0 },
//     fontSize: { xs: '15px', md: '14px' },
//   };

//   const headingSx = {
//     fontWeight: 600,
//     fontSize: { xs: '16px', md: '15px' },
//     pt: { xs: 0, md: 0 },
//     pb: { xs: '16px', md: '12px' },
//   };

//   return (
//     <Box component="footer" sx={{ bgcolor: '#FAFAFA', color: 'text.primary', mt: 6, fontFamily: 'Arial, sans-serif' }}>
//       {/* Top: social icons */}
//       <Box sx={{ py: { xs: 2.5, md: 3 }, display: 'flex', justifyContent: 'center', gap: 2 }}>
//         <IconButton 
//           component="a" 
//           href="https://www.facebook.com/dokskenas/" 
//           target="_blank" 
//           rel="noopener noreferrer" 
//           aria-label="Facebook" 
//           sx={{ color: 'inherit' }}
//         >
//           <FacebookIcon sx={{ fontSize: { xs: 28, md: 30 } }} />
//         </IconButton>
//         <IconButton 
//           component="a" 
//           href="https://www.youtube.com/@dokskenas/" 
//           target="_blank" 
//           rel="noopener noreferrer" 
//           aria-label="YouTube" 
//           sx={{ color: 'inherit' }}
//         >
//           <YouTubeIcon sx={{ fontSize: { xs: 28, md: 30 } }} />
//         </IconButton>
//       </Box>

//       <Divider />

//       {/* Middle: Links section */}
//       <Box sx={{ px: { xs: 2, sm: 4 }, py: { xs: 4, md: 5 } }}>
//         <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
//           <Grid2
//             container
//             spacing={{ xs: 6, md: 6 }}
//             justifyContent={{ xs: 'center', md: 'center' }}
//           >
//             {/* Col 1: DokSkenas */}
//             <Grid2 size={{ xs: 12, md: 4 }}>
//               <Box sx={{ textAlign: { xs: 'center', md: 'center' } }}>
//                 <Typography variant="subtitle1" sx={headingSx}>
//                   DokSkenas
//                 </Typography>
//                 <Stack 
//                   spacing={1.25} 
//                   alignItems={{ xs: 'center', md: 'center' }}
//                 >
//                   <Link href="/kaip-veikia" underline="none" color="inherit" sx={linkSx}>
//                     Kaip veikia?
//                   </Link>
//                   <Link href="/ka-moka" underline="none" color="inherit" sx={linkSx}>
//                     Ką moka?
//                   </Link>
//                   <Link href="/saskaitu-skaitmenizavimas-dokskenas#kainos" underline="none" color="inherit" sx={linkSx}>
//                     Kainos
//                   </Link>
//                   <Link href="/apie-mus" underline="none" color="inherit" sx={linkSx}>
//                     Apie mus
//                   </Link>
//                 </Stack>
//               </Box>
//             </Grid2>

//             {/* Col 2: Pagalba */}
//             <Grid2 size={{ xs: 12, md: 4 }}>
//               <Box sx={{ textAlign: { xs: 'center', md: 'center' } }}>
//                 <Typography variant="subtitle1" sx={headingSx}>
//                   Pagalba
//                 </Typography>
//                 <Stack 
//                   spacing={1.25} 
//                   alignItems={{ xs: 'center', md: 'center' }}
//                 >
//                   <Link href="/naudojimo-gidas" underline="none" color="inherit" sx={linkSx}>
//                     Naudojimo gidas
//                   </Link>
//                   <Link href="/susisiekti" underline="none" color="inherit" sx={linkSx}>
//                     Susisiekti
//                   </Link>
//                 </Stack>
//               </Box>
//             </Grid2>

//             {/* Col 3: Naudingos nuorodos */}
//             <Grid2 size={{ xs: 12, md: 4 }}>
//               <Box sx={{ textAlign: { xs: 'center', md: 'center' } }}>
//                 <Typography variant="subtitle1" sx={headingSx}>
//                   Naudingos nuorodos
//                 </Typography>
//                 <Stack 
//                   spacing={1.25} 
//                   alignItems={{ xs: 'center', md: 'center' }}
//                 >
//                   <Link href="/2026" underline="none" color="inherit" sx={linkSx}>
//                     Atlyginimo skaičiuoklė 2026
//                   </Link>
//                   <Link href="/" underline="none" color="inherit" sx={linkSx}>
//                     Atlyginimo skaičiuoklė 2025
//                   </Link>
//                   <Link href="/gpm-skaiciuokle" underline="none" color="inherit" sx={linkSx}>
//                     GPM skaičiuoklė
//                   </Link>
//                   <Link href="/pvm-skaiciuokle" underline="none" color="inherit" sx={linkSx}>
//                     PVM skaičiuoklė
//                   </Link>
//                 </Stack>
//               </Box>
//             </Grid2>
//           </Grid2>
//         </Box>
//       </Box>

//       <Divider />

//       {/* Bottom: Copyright and legal links */}
//       <Box sx={{ px: { xs: 2, sm: 4 }, py: { xs: 2.5, md: 2.5 } }}>
//         <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
//           <Stack 
//             direction={{ xs: 'column', sm: 'row' }} 
//             justifyContent="space-between" 
//             alignItems="center" 
//             spacing={2}
//           >
//             <Typography 
//               variant="body2" 
//               sx={{ 
//                 order: { xs: 2, sm: 1 }, 
//                 textAlign: 'center',
//                 fontSize: { xs: '13px', md: '14px' }
//               }}
//             >
//               © {currentYear} Atlyginimo Skaičiuoklė. Visos teisės saugomos.
//             </Typography>
            
//             <Stack 
//               direction="row" 
//               spacing={{ xs: 2, sm: 3 }} 
//               sx={{ 
//                 order: { xs: 1, sm: 2 },
//                 flexWrap: 'wrap',
//                 justifyContent: 'center'
//               }}
//             >
//               <Link 
//                 href="/privatumo-politika" 
//                 underline="none" 
//                 color="inherit" 
//                 sx={{ ...linkSx, py: 2 }}
//               >
//                 Privatumo politika
//               </Link>
//               <Link 
//                 href="/naudojimo-taisykles" 
//                 underline="none" 
//                 color="inherit" 
//                 sx={{ ...linkSx, py: 2 }}
//               >
//                 Naudojimo taisyklės
//               </Link>
//             </Stack>
//           </Stack>
//         </Box>
//       </Box>
//     </Box>
//   );
// };

// export default Footer;









// import { Box, Typography, Link } from '@mui/material';

// const Footer = () => {
//   const currentYear = new Date().getFullYear();

//   return (
//     <Box 
//       sx={{ 
//         bgcolor: '#FAFAFA', 
//         color: 'black', 
//         padding: 2, 
//         display: 'flex', 
//         flexDirection: { xs: 'column', sm: 'row' },
//         justifyContent: 'space-between', 
//         alignItems: 'center', 
//         minHeight: '60px',
//       }}
//     >
//       <Typography 
//         variant="body2" 
//         sx={{ 
//           flex: 1, 
//           fontFamily: 'Arial', 
//           marginBottom: { xs: 2, sm: 0 }, 
//           textAlign: { xs: 'center', sm: 'left' } 
//         }}
//       >
//         © {currentYear} Atlyginimo Skaičiuoklė. Visos teisės saugomos.
//       </Typography>
      
//       <Box 
//         sx={{ 
//           display: 'flex', 
//           gap: 2, 
//           flexDirection: { xs: 'column', sm: 'row' },
//           alignItems: { xs: 'center', sm: 'flex-start' } 
//         }}
//       >
//         <Link href="/susisiekti" color="inherit" variant="body2" fontFamily='Arial' sx={{ textDecoration: 'none' }}>
//           Susisiekti
//         </Link>
//         <Link href="/privatumo-politika" color="inherit" variant="body2" fontFamily='Arial' sx={{ textDecoration: 'none' }}>
//           Privatumo politika
//         </Link>
//         <Link href="/naudojimo-taisykles" color="inherit" variant="body2" fontFamily='Arial' sx={{ textDecoration: 'none' }}>
//           Naudojimo taisyklės
//         </Link>
//       </Box>
//     </Box>
//   );
// };

// export default Footer;
