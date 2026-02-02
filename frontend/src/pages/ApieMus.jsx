import { Box, Typography, Button } from '@mui/material';

const AboutUs = () => {
  return (
    <Box
      sx={{
        width: '100%',
        bgcolor: '#fff',
        paddingY: { xs: 8, md: 12 },
        paddingX: { xs: 3, sm: 6, md: 10, lg: 14 },
      }}
    >
      <Box
        sx={{
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'flex-start', md: 'flex-start' },
          justifyContent: 'space-between',
          gap: { xs: 0, md: 10, lg: 14 },
        }}
      >
        {/* Text content */}
        <Box
          sx={{
            width: { xs: '100%', md: '50%' },
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
          }}
        >
          <Typography
            sx={{
              fontSize: '13px',
              fontFamily: 'Helvetica',
              fontWeight: 500,
              letterSpacing: '3px',
              textTransform: 'uppercase',
              color: '#888',
              marginBottom: 2,
            }}
          >
            Mūsų misija
          </Typography>

          <Typography
            variant="h1"
            sx={{
              fontSize: { xs: '36px', sm: '44px', md: '48px' },
              fontFamily: 'Helvetica',
              fontWeight: 600,
              color: '#1b1b1b',
              marginBottom: 2,
              lineHeight: 1.1,
            }}
          >
            Apie DokSkeną
          </Typography>

          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: '20px', sm: '24px' },
              fontFamily: 'Helvetica',
              fontWeight: 500,
              color: '#555',
              marginBottom: { xs: 4, md: 5 },
              lineHeight: 1.4,
            }}
          >
            Mes padedame automatizuoti apskaitą
          </Typography>

          {/* Image - only visible on mobile, after h2 */}
          <Box
            sx={{
              display: { xs: 'flex', md: 'none' },
              width: '100%',
              justifyContent: 'center',
              marginBottom: 5,
            }}
          >
            <Box
              component="img"
              src="/apie_dokskena.jpg"
              alt="DokSkenas dokumentų skaitmenizavimas"
              loading="lazy"
              sx={{
                width: '100%',
                maxHeight: '400px',
                borderRadius: 2,
                objectFit: 'cover',
              }}
            />
          </Box>

          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2.5,
            }}
          >
            <Typography sx={{ fontSize: '17px', fontFamily: 'Helvetica', color: '#444', lineHeight: 1.8, textAlign: 'justify' }}>
              Puikiai žinome, kaip atrodo kasdienis buhalterio darbas. Krūvos sąskaitų faktūrų, kvitų ir kitų dokumentų, kuriuos reikia suvesti rankomis.
            </Typography>

            <Typography sx={{ fontSize: '17px', fontFamily: 'Helvetica', color: '#444', lineHeight: 1.8, textAlign: 'justify' }}>
              Nuolatinis dėmesys detalėms, kad nesusimaišytų skaičiai. Ir ta nemaloni baimė, kad kažkur galėjo įsivelt klaida.
            </Typography>

            <Typography sx={{ fontSize: '17px', fontFamily: 'Helvetica', color: '#1b1b1b', lineHeight: 1.8, fontWeight: 600, textAlign: 'justify' }}>
              Būtent todėl sukūrėme DokSkeną.
            </Typography>

            <Typography sx={{ fontSize: '17px', fontFamily: 'Helvetica', color: '#444', lineHeight: 1.8, textAlign: 'justify' }}>
              Mūsų sistema nuskaito dokumentus su 99% tikslumu ir vidutiniškai sutaupo 4 minutes kiekvienam dokumentui.
            </Typography>

            <Typography sx={{ fontSize: '17px', fontFamily: 'Helvetica', color: '#444', lineHeight: 1.8, textAlign: 'justify' }}>
              Įsivaizduokite, kiek tai laiko per mėnesį, jei apdorojate šimtus ar tūkstančius dokumentų. Jums nebereikia samdyti papildomo žmogaus vien tam, kad suvestų dokumentus į apskaitos sistemą.
            </Typography>

            <Typography sx={{ fontSize: '17px', fontFamily: 'Helvetica', color: '#444', lineHeight: 1.8, textAlign: 'justify' }}>
              DokSkenas daro žymiai mažiau klaidų nei žmogus. Ir tai ne tik marketingo frazė.
            </Typography>

            <Typography sx={{ fontSize: '17px', fontFamily: 'Helvetica', color: '#444', lineHeight: 1.8, textAlign: 'justify' }}>
              Kiekvienas dokumentas praeina per mūsų patikros algoritmą, kuris tikrina, ar sutampa sumos, PVM skaičiavimai ir kiti svarbūs duomenys.
            </Typography>

            <Typography sx={{ fontSize: '17px', fontFamily: 'Helvetica', color: '#444', lineHeight: 1.8, textAlign: 'justify' }}>
              Jei sistema randa neatitikimą, ji pirmiausia bando jį ištaisyti automatiškai. O jei kažkas vis tiek nesueina, iškart praneša jums.
            </Typography>

            <Typography sx={{ fontSize: '17px', fontFamily: 'Helvetica', color: '#1b1b1b', lineHeight: 1.8, fontWeight: 600, textAlign: 'justify' }}>
              Mažiau streso. Mažiau klaidų. Daugiau laiko tam, kas iš tikrųjų svarbu jūsų verslui.
            </Typography>

            <Box
              sx={{
                marginTop: 3,
                padding: 3,
                background: '#fafafa',
                borderRadius: 1,
                borderLeft: '4px solid #f5cf54',
              }}
            >
              <Typography sx={{ fontSize: '17px', fontFamily: 'Helvetica', color: '#1b1b1b', lineHeight: 1.8, fontWeight: 600, textAlign: 'justify' }}>
                Mūsų didelė misija: apdoroti 10 000 000 klientų dokumentų ir sutaupyti jiems 750 000 valandų darbo per metus.
              </Typography>
            </Box>
          </Box>

          <Button
            variant="contained"
            size="large"
            href="/saskaitu-skaitmenizavimas-dokskenas"
            sx={{
              marginTop: 5,
              backgroundColor: '#1b1b1b',
              color: '#fff',
              fontFamily: 'Helvetica',
              fontWeight: 500,
              padding: '16px 40px',
              fontSize: '15px',
              borderRadius: 0,
              textTransform: 'none',
              '&:hover': {
                backgroundColor: '#333',
              },
            }}
          >
            Sužinoti daugiau
          </Button>
        </Box>

        {/* Image - only visible on desktop */}
        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            width: '45%',
            justifyContent: 'center',
            alignItems: 'flex-start',
            paddingTop: '140px',
          }}
        >
          <Box
            component="img"
            src="/apie_dokskena.jpg"
            alt="Apie DokSkeną"
            loading="lazy"
            sx={{
              width: '100%',
              maxHeight: '650px',
              borderRadius: 2,
              objectFit: 'cover',
            }}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default AboutUs;