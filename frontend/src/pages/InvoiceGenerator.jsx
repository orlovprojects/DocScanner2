import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Box, Typography, Button, Stack, Modal } from '@mui/material';
import { keyframes } from '@mui/system';
import StarIcon from '@mui/icons-material/Star';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BoltIcon from '@mui/icons-material/Bolt';
// Иконки для секции Kaip veikia
import EditNoteIcon from '@mui/icons-material/EditNote';
import SendIcon from '@mui/icons-material/Send';
import PaidIcon from '@mui/icons-material/Paid';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
// Иконки для секции Funkcijos
import BrandingWatermarkIcon from '@mui/icons-material/BrandingWatermark';
import DomainVerificationIcon from '@mui/icons-material/DomainVerification';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import OutboxIcon from '@mui/icons-material/Outbox';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';

// ===== Accent (ne tot zhe chto DokSkenas) =====
const ACCENT = '#4338ca'; // indigo
const ACCENT_LIGHT = '#a5b4fc'; // светлый индиго для тёмных фонов (текст/иконки)

// ===== Animations =====

// Generator dlja loop-keyframe polya. Kazhdoye pole poluchaet svoy startPct (% cikla kogda ono nachinaet pisat'sya)
// Duration = 10s. Vsye polya fadeyat vmeste v konce cikla, potom zanovo.
const createFieldKf = (startPct) => keyframes`
  0%, ${startPct}% {
    opacity: 0;
    clip-path: inset(0 100% 0 0);
    transform: translateY(4px);
  }
  ${startPct + 7}% {
    opacity: 1;
    clip-path: inset(0 0% 0 0);
    transform: none;
  }
  75% {
    opacity: 1;
    clip-path: inset(0 0% 0 0);
    transform: none;
  }
  85%, 100% {
    opacity: 0;
    clip-path: inset(0 0% 0 0);
    transform: none;
  }
`;

// Otdelnyy generator dlja "Apmokėjimas gautas" — pop-in vmesto wipe
const createPaidKf = (startPct) => keyframes`
  0%, ${startPct}% {
    opacity: 0;
    transform: translateY(18px) scale(0.96);
  }
  ${startPct + 5}% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  75% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  85%, 100% {
    opacity: 0;
    transform: translateY(0) scale(1);
  }
`;

// Predvychislennye keyframes dlja kazhdogo elementa (startPct v % ot 10s cikla)
const FIELD_KFS = [0, 3, 6, 9].map(createFieldKf);         // 4 meta-polya
const ITEM_KFS  = [13, 16, 19, 22].map(createFieldKf);      // 4 stroki tovarov
const TOTALS_KF = createFieldKf(26);                         // itogi
const PAID_KF   = createPaidKf(32);                          // pop-in paid card

// Pulsiruyushiy indikator "Išrašoma..."
const pulseIndicator = keyframes`
  0%, 100% { transform: scale(1); opacity: 0.9; }
  50% { transform: scale(1.25); opacity: 1; }
`;

const pulseDot = keyframes`
  0%, 100% { box-shadow: 0 0 0 3px rgba(67, 56, 202, 0.22); }
  50% { box-shadow: 0 0 0 6px rgba(67, 56, 202, 0.1); }
`;

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: none; }
`;

const underlineIn = keyframes`
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
`;

const marqueeScroll = keyframes`
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
`;

// Nezhnyy glow pod sascaitoy
const softGlow = keyframes`
  0%, 100% { box-shadow: 0 30px 80px -30px rgba(67, 56, 202, 0.2), inset 0 2px 0 rgba(255,255,255,0.6); }
  50% { box-shadow: 0 30px 90px -30px rgba(67, 56, 202, 0.3), inset 0 2px 0 rgba(255,255,255,0.6); }
`;

const Saskaitos = () => {
  const [open, setOpen] = useState(false);

  // Vse polya sascaity
  const invoiceFields = [
    { k: 'Pardavėjas', v: 'Jūsų įmonė, UAB' },
    { k: 'Pirkėjas', v: 'UAB Klientas' },
    { k: 'SF Nr.', v: '2026-0047' },
    { k: 'Data', v: '2026-04-13' },
  ];

  const invoiceItems = [
    { name: 'Konsultacijos, 2 val.', sum: '80,00 €' },
    { name: 'Mėnesio ataskaita', sum: '120,00 €' },
    { name: 'Dokumentų tvarkymas', sum: '45,00 €' },
    { name: 'Transportavimas', sum: '30,00 €' },
  ];

  return (
    <Box
      sx={{
        bgcolor: '#F9F9FA',
        minHeight: '100vh',
        padding: { xs: 2, sm: 5 },
        paddingTop: { xs: '12px', sm: '20px' },
        width: '100%',
      }}
    >
      <Helmet>
        <title>Protingas sąskaitų išrašymas + apskaita – DokSkenas</title>
        <meta
          name="description"
          content="Išrašykite sąskaitas su apmokėjimo mygtukais per 30 sekundžių, o duomenis importuokite į savo apskaitos programą. "
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,300;1,9..144,400;1,9..144,500&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Lora:wght@500&display=swap"
          rel="stylesheet"
        />
      </Helmet>

      {/* ========= HERO ========= */}
      <Box
        sx={{
          maxWidth: '1280px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1.05fr 0.95fr' },
          gap: { xs: 6, md: 8 },
          alignItems: 'start',
          paddingY: { xs: 2, md: 3 },
        }}
      >
        {/* ---- LEFT ---- */}
        <Box sx={{ animation: `${fadeUp} 0.9s cubic-bezier(.2,.7,.2,1) both`, paddingTop: { md: 2 } }}>
          {/* Pill */}
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              padding: '7px 14px',
              border: '1px solid rgba(0,0,0,0.12)',
              borderRadius: '999px',
              fontSize: '13px',
              fontFamily: 'Helvetica',
              color: '#2a2824',
              background: 'rgba(255,255,255,0.7)',
              marginBottom: 3,
            }}
          >
            <Box
              sx={{
                width: 7,
                height: 7,
                background: ACCENT,
                borderRadius: '50%',
                animation: `${pulseDot} 2s ease-in-out infinite`,
              }}
            />
            Išrašykite ir išsiųskite per 30 sekundžių
          </Box>

          {/* H1 */}
          <Typography
            variant="h1"
            sx={{
              fontFamily: '"Fraunces", Georgia, serif',
              fontSize: { xs: '48px', sm: '72px', md: '92px' },
              fontWeight: 400,
              lineHeight: 0.96,
              letterSpacing: '-0.035em',
              marginBottom: 2.5,
              color: '#1b1b1b',
              maxWidth: '12ch',
            }}
          >
            Sąskaitų{' '}
            <Box
              component="span"
              sx={{
                position: 'relative',
                display: 'inline-block',
                fontStyle: 'italic',
                fontWeight: 300,
                color: ACCENT,
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: '0.06em',
                  height: '0.07em',
                  background: ACCENT,
                  transform: 'scaleX(0)',
                  transformOrigin: 'left',
                  animation: `${underlineIn} 1.2s cubic-bezier(.7,0,.2,1) 1.1s forwards`,
                },
              }}
            >
              išrašymas
            </Box>
          </Typography>

          {/* H3 */}
          <Typography
            variant="h3"
            sx={{
              fontFamily: '"Fraunces", Georgia, serif',
              fontSize: { xs: '26px', sm: '32px', md: '36px' },
              fontWeight: 400,
              color: '#1b1b1b',
              marginBottom: 3,
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
            }}
          >
            Sąskaitų išrašymas, apmokėjimas ir apskaita{' '}
            <Box component="span" sx={{ fontStyle: 'italic', fontWeight: 300, color: ACCENT }}>
              vienoje vietoje.
            </Box>
          </Typography>

          <Typography
            sx={{
              fontSize: '18px',
              fontFamily: 'Helvetica',
              color: '#2a2824',
              lineHeight: 1.55,
              marginBottom: 4,
              maxWidth: '52ch',
            }}
          >
            Išrašykite sąskaitas, siųskite jas klientams, gaukite apmokėjimus ir eksportuokite duomenis į apskaitos programą.
          </Typography>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            alignItems={{ xs: 'stretch', sm: 'center' }}
          >
            <Button
              variant="contained"
              size="large"
              href="/registruotis"
              sx={{
                backgroundColor: ACCENT,
                color: '#fff',
                fontFamily: 'Helvetica',
                fontWeight: 600,
                fontSize: '15px',
                textTransform: 'none',
                borderRadius: '999px',
                padding: '12px 26px',
                boxShadow: 'none',
                '&:hover': { backgroundColor: '#0b7d72', boxShadow: 'none' },
              }}
            >
              Pradėti nemokamai →
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={() => setOpen(true)}
              startIcon={<PlayCircleIcon sx={{ color: ACCENT, fontSize: '22px !important' }} />}
              sx={{
                borderColor: '#1b1b1b',
                color: '#1b1b1b',
                fontFamily: 'Helvetica',
                fontWeight: 500,
                fontSize: '15px',
                textTransform: 'none',
                borderRadius: '999px',
                padding: '11px 22px',
                '&:hover': { borderColor: '#1b1b1b', backgroundColor: '#1b1b1b', color: '#fff' },
                '&:hover .MuiButton-startIcon svg': { color: '#fff' },
              }}
            >
              Žiūrėti video
            </Button>
          </Stack>

          <Typography sx={{ fontSize: '13px', fontFamily: 'Helvetica', color: '#6b6660', marginTop: 2 }}>
            Neribotas sąskaitų išrašymas
          </Typography>

          <Stack direction="row" alignItems="center" spacing={1} sx={{ marginTop: 3 }}>
            <Stack direction="row" spacing={0.01}>
              {[...Array(5)].map((_, index) => (
                <StarIcon key={index} sx={{ color: '#f5cf54', fontSize: '20px' }} />
              ))}
            </Stack>
            <Typography variant="body2" sx={{ fontFamily: 'Helvetica', color: '#2a2824' }}>
              500+ Lietuvos įmonių jau išrašo sąskaitas su mumis
            </Typography>
          </Stack>
        </Box>

        {/* ---- RIGHT: auto-filling invoice + paid card ---- */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            animation: `${fadeUp} 0.9s cubic-bezier(.2,.7,.2,1) 0.25s both`,
          }}
        >
          {/* ===== Invoice that writes itself ===== */}
          <Box
            sx={{
              background: '#fffdf8',
              borderRadius: '18px',
              padding: '32px 30px 26px',
              border: '1px solid rgba(0,0,0,0.08)',
              animation: `${softGlow} 4s ease-in-out infinite`,
              position: 'relative',
              transform: { md: 'rotate(-1deg)' },
              fontFamily: 'Helvetica',
              color: '#1b1b1b',
              overflow: 'hidden',
            }}
          >
            {/* Top label with "Išrašoma..." indicator */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 2.5,
                paddingBottom: 2,
                borderBottom: '1px solid rgba(0,0,0,0.08)',
              }}
            >
              <Typography
                sx={{
                  fontFamily: 'Helvetica',
                  fontSize: '11px',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: '#6b6660',
                  fontWeight: 600,
                }}
              >
                PVM Sąskaita faktūra
              </Typography>
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.8,
                  padding: '4px 10px',
                  borderRadius: '999px',
                  background: `${ACCENT}15`,
                  border: `1px solid ${ACCENT}40`,
                }}
              >
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: ACCENT,
                    animation: `${pulseIndicator} 1.4s ease-in-out infinite`,
                  }}
                />
                <Typography
                  sx={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: ACCENT,
                    letterSpacing: '0.02em',
                  }}
                >
                  Išrašoma ir siunčiama…
                </Typography>
              </Box>
            </Box>

            {/* Meta fields — write in sequence */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 2,
                marginBottom: 2.5,
              }}
            >
              {invoiceFields.map((f, i) => (
                <Box
                  key={i}
                  sx={{
                    animation: `${FIELD_KFS[i]} 10s cubic-bezier(.7,0,.2,1) infinite`,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: '10px',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: '#9a948a',
                      marginBottom: '2px',
                      fontWeight: 600,
                    }}
                  >
                    {f.k}
                  </Typography>
                  <Typography
                    sx={{
                      fontFamily: '"Lora", Georgia, serif',
                      fontSize: '16px',
                      fontWeight: 500,
                      color: '#1b1b1b',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {f.v}
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* Line items — also write in sequence */}
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                marginBottom: 1.5,
              }}
            >
              {invoiceItems.map((row, i) => (
                <Box
                  key={i}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom:
                      i < invoiceItems.length - 1 ? '1px dashed rgba(0,0,0,0.12)' : 'none',
                    animation: `${ITEM_KFS[i]} 10s cubic-bezier(.7,0,.2,1) infinite`,
                    fontSize: '13.5px',
                  }}
                >
                  <span>{row.name}</span>
                  <span style={{ fontWeight: 600 }}>{row.sum}</span>
                </Box>
              ))}
            </Box>

            {/* Totals — write last */}
            <Box
              sx={{
                animation: `${TOTALS_KF} 10s cubic-bezier(.7,0,.2,1) infinite`,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12.5px',
                  color: '#6b6660',
                  padding: '4px 0',
                }}
              >
                <span>Suma be PVM</span>
                <span>275,00 €</span>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12.5px',
                  color: '#6b6660',
                  padding: '4px 0',
                }}
              >
                <span>PVM 21%</span>
                <span>57,75 €</span>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '10px',
                  paddingTop: '12px',
                  borderTop: '2px solid #1b1b1b',
                  fontFamily: '"Fraunces", Georgia, serif',
                  fontSize: '20px',
                  fontWeight: 500,
                  color: '#1b1b1b',
                }}
              >
                <span>Suma su PVM</span>
                <span>332,75 €</span>
              </Box>
            </Box>
          </Box>

          {/* ===== Dark "Apmokėjimas gautas" card ===== */}
          <Box
            sx={{
              background: '#1b1b1b',
              color: '#F9F9FA',
              borderRadius: '18px',
              padding: '26px 30px',
              boxShadow: '0 30px 80px -30px rgba(17,17,17,0.35)',
              transform: { md: 'rotate(0.8deg)' },
              display: 'flex',
              alignItems: 'center',
              gap: 2.5,
              position: 'relative',
              overflow: 'hidden',
              animation: `${PAID_KF} 10s cubic-bezier(.2,.7,.2,1) infinite`,
              '&::before': {
                content: '""',
                position: 'absolute',
                inset: 0,
                background: `radial-gradient(ellipse at top right, ${ACCENT}33, transparent 55%)`,
                pointerEvents: 'none',
              },
            }}
          >
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: '14px',
                background: `${ACCENT}22`,
                border: `1px solid ${ACCENT}66`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                position: 'relative',
              }}
            >
              <CheckCircleIcon sx={{ color: ACCENT_LIGHT, fontSize: 28 }} />
            </Box>
            <Box sx={{ position: 'relative', flex: 1 }}>
              <Typography
                sx={{
                  fontSize: '10.5px',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: ACCENT_LIGHT,
                  fontWeight: 600,
                  marginBottom: '2px',
                }}
              >
                Montonio apmokėjimas gautas
              </Typography>
              <Typography
                sx={{
                  fontFamily: 'Helvetica',
                  fontSize: '20px',
                  fontWeight: 700,
                  color: '#fff',
                  letterSpacing: '-0.01em',
                  lineHeight: 1.1,
                }}
              >
                332,75 € · SF-2026-0047
              </Typography>
              <Typography
                sx={{
                  fontSize: '12px',
                  color: 'rgba(255,255,255,0.55)',
                  marginTop: '4px',
                }}
              >
                Automatiškai susietas su sąskaita · prieš 2 min.
              </Typography>
            </Box>
            <BoltIcon sx={{ color: ACCENT_LIGHT, fontSize: 20, opacity: 0.85 }} />
          </Box>
        </Box>
      </Box>

      {/* Video Modal placeholder */}
      <Modal open={open} onClose={() => setOpen(false)} disableScrollLock>
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            bgcolor: '#1B1B1B',
            p: 2,
            borderRadius: 2,
            maxWidth: '800px',
            width: '90%',
            outline: 'none',
            color: '#fff',
            textAlign: 'center',
          }}
        >
          <Typography sx={{ p: 4 }}>Demo video placeholder</Typography>
        </Box>
      </Modal>

      {/* ========= KAIP VEIKIA (4 ETAPAI) ========= */}
      <Box
        id="kaip-veikia"
        sx={{
          maxWidth: '1280px',
          margin: '0 auto',
          paddingX: { xs: 2, md: 2 },
          paddingTop: { xs: '80px', md: '130px' },
          paddingBottom: { xs: '30px', md: '50px' },
          scrollMarginTop: { xs: '80px', md: '100px' },
        }}
      >
        {/* Заголовок */}
        <Box sx={{ textAlign: 'center', marginBottom: { xs: 6, md: 9 } }}>
          <Typography
            sx={{
              fontSize: '12px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: ACCENT,
              fontFamily: 'Helvetica',
              fontWeight: 600,
              marginBottom: 2,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1.2,
              '&::before, &::after': {
                content: '""',
                width: '32px',
                height: '1px',
                background: ACCENT,
              },
            }}
          >
            Kaip veikia
          </Typography>
          <Typography
            variant="h2"
            sx={{
              fontFamily: '"Fraunces", Georgia, serif',
              fontSize: { xs: '38px', sm: '54px', md: '68px' },
              fontWeight: 400,
              lineHeight: 1.02,
              letterSpacing: '-0.03em',
              color: '#1b1b1b',
              marginBottom: 2,
            }}
          >
            Nuo sąskaitos iki{' '}
            <Box
              component="span"
              sx={{ fontStyle: 'italic', fontWeight: 300, color: ACCENT }}
            >
              buhalterijos
            </Box>
            {' '}— keturi žingsniai.
          </Typography>
          <Typography
            sx={{
              fontFamily: 'Helvetica',
              fontSize: { xs: '16px', md: '18px' },
              color: '#6b6660',
              maxWidth: '62ch',
              margin: '0 auto',
              lineHeight: 1.55,
            }}
          >
            Viskas, ko reikia sąskaitų išrašymui ir apskaitai — viename įrankyje. Be Excel
            šablonų, be kopijavimo rankiniu būdu, be rankinio įvedimo į apskaitą.
          </Typography>
        </Box>

        {/* 4 этапа — горизонтальная линия со стрелками */}
        <Box
          sx={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' },
            gap: { xs: 3, md: 2 },
          }}
        >
          {/* Соединительная пунктирная линия (только десктоп) */}
          <Box
            sx={{
              display: { xs: 'none', md: 'block' },
              position: 'absolute',
              top: '36px',
              left: '12.5%',
              right: '12.5%',
              height: '2px',
              backgroundImage: `repeating-linear-gradient(to right, ${ACCENT}55 0 6px, transparent 6px 12px)`,
              zIndex: 0,
            }}
          />

          {[
            {
              Icon: EditNoteIcon,
              title: 'Sukurkite sąskaitą',
              desc: 'Supildykite duomenis — naudokite rekvizitus iš Registrų Centro, prekes, matavimo vienetus, valiutas su LB kursais iš katalogo.',
              tag: '~ 30 sekundžių',
            },
            {
              Icon: SendIcon,
              title: 'Išsiųskite klientui',
              desc: 'Siųskite el. paštu su pridėtu „Apmokėti" mygtuku per Montonio arba Paysera. Klientas sumoka vienu paspaudimu.',
              tag: 'Su apmokėjimo nuoroda',
            },
            {
              Icon: PaidIcon,
              title: 'Gaukite apmokėjimą',
              desc: 'Po apmokėjimo sąskaita pasižymės kaip apmokėta. Papildomai importuokite banko išrašą ir sistema susies bankinius apmokėjimus su sąskaitomis.',
              tag: 'Automatiškai',
            },
            {
              Icon: AccountTreeIcon,
              title: 'Eksportuokite į apskaitą',
              desc: 'Visi sąskaitų duomenys paruošti importui į Rivilę, Finvaldą, Centą ar kitas 13 programų. Taip pat — iSAF.',
              tag: '16 programų + iSAF',
              featured: true,
            },
          ].map(({ Icon, title, desc, tag, featured }, idx) => (
            <Box
              key={idx}
              sx={{
                position: 'relative',
                zIndex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                padding: { xs: '28px 20px', md: '0 14px' },
              }}
            >
              {/* Круг с иконкой */}
              <Box
                sx={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: featured ? ACCENT : '#fffdf8',
                  border: featured
                    ? `2px solid ${ACCENT}`
                    : `2px solid ${ACCENT}44`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 3,
                  position: 'relative',
                  boxShadow: featured
                    ? `0 20px 40px -15px ${ACCENT}66, 0 0 0 6px #F9F9FA`
                    : '0 12px 30px -15px rgba(17,17,17,0.15), 0 0 0 6px #F9F9FA',
                  '&::before': {
                    content: `"${String(idx + 1).padStart(2, '0')}"`,
                    position: 'absolute',
                    top: '-12px',
                    right: '-12px',
                    background: '#1b1b1b',
                    color: '#fff',
                    fontSize: '11px',
                    fontFamily: '"Fraunces", Georgia, serif',
                    fontStyle: 'italic',
                    fontWeight: 500,
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid #F9F9FA',
                  },
                }}
              >
                <Icon sx={{ fontSize: 32, color: featured ? '#fff' : ACCENT }} />
              </Box>

              {/* Тэг-метка */}
              <Typography
                sx={{
                  fontSize: '10.5px',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: ACCENT,
                  fontFamily: 'Helvetica',
                  fontWeight: 700,
                  marginBottom: 1.5,
                  padding: '4px 10px',
                  background: `${ACCENT}12`,
                  borderRadius: '999px',
                  border: `1px solid ${ACCENT}30`,
                }}
              >
                {tag}
              </Typography>

              {/* Заголовок этапа */}
              <Typography
                sx={{
                  fontFamily: '"Fraunces", Georgia, serif',
                  fontSize: { xs: '24px', md: '26px' },
                  fontWeight: 500,
                  color: '#1b1b1b',
                  lineHeight: 1.15,
                  letterSpacing: '-0.01em',
                  marginBottom: 1.5,
                  maxWidth: '14ch',
                }}
              >
                {title}
              </Typography>

              {/* Описание */}
              <Typography
                sx={{
                  fontFamily: 'Helvetica',
                  fontSize: '14.5px',
                  color: '#6b6660',
                  lineHeight: 1.55,
                  maxWidth: '28ch',
                }}
              >
                {desc}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Приписка снизу */}
        <Box
          sx={{
            marginTop: { xs: 6, md: 9 },
            textAlign: 'center',
          }}
        >
        </Box>
      </Box>

      {/* ========= INTEGRACIJOS MARQUEE ========= */}
      <Box
        sx={{
          width: '100vw',
          position: 'relative',
          left: '50%',
          right: '50%',
          marginLeft: '-50vw',
          marginRight: '-50vw',
          marginTop: '80px',
          paddingY: '34px',
          borderTop: '1px solid rgba(0,0,0,0.1)',
          borderBottom: '1px solid rgba(0,0,0,0.1)',
          background: '#f1ede4',
          overflow: 'hidden',
        }}
      >
        <Typography
          sx={{
            textAlign: 'center',
            fontSize: '12px',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#6b6660',
            fontFamily: 'Helvetica',
            fontWeight: 500,
            marginBottom: '22px',
          }}
        >
          Eksportas į 16 apskaitos programų + iSAF
        </Typography>
        <Box
          sx={{
            display: 'flex',
            gap: '72px',
            width: 'max-content',
            animation: `${marqueeScroll} 40s linear infinite`,
            whiteSpace: 'nowrap',
          }}
        >
          {(() => {
            const programs = [
              'Rivilė GAMA', 'Rivilė ERP', 'Centas', 'Finvalda', 'Agnum', 'Optimum',
              'Dineta', 'Apskaita5', 'Pragma 3.2', 'Pragma 4', 'Būtenta', 'Site.pro (B1)',
              'Debetas', 'APSA', 'Paulita', 'iSAF',
            ];
            const doubled = [...programs, ...programs];
            return doubled.map((name, i) => (
              <Typography
                key={i}
                sx={{
                  fontFamily: '"Fraunces", Georgia, serif',
                  fontSize: '30px',
                  fontWeight: 400,
                  color: '#2a2824',
                  letterSpacing: '-0.01em',
                  fontStyle: i % 2 === 1 ? 'italic' : 'normal',
                  opacity: 0.78,
                  flexShrink: 0,
                }}
              >
                {name}
              </Typography>
            ));
          })()}
        </Box>
      </Box>

      {/* ========= FUNKCIJOS ========= */}
      <Box
        id="funkcijos"
        sx={{
          maxWidth: '1280px',
          margin: '0 auto',
          paddingX: { xs: 2, md: 2 },
          paddingTop: { xs: '70px', md: '110px' },
          paddingBottom: { xs: '30px', md: '50px' },
          scrollMarginTop: { xs: '80px', md: '100px' },
        }}
      >
        {/* Заголовок */}
        <Box sx={{ textAlign: 'center', marginBottom: { xs: 5, md: 8 } }}>
          <Typography
            sx={{
              fontSize: '12px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: ACCENT,
              fontFamily: 'Helvetica',
              fontWeight: 600,
              marginBottom: 2,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1.2,
              '&::before, &::after': {
                content: '""',
                width: '32px',
                height: '1px',
                background: ACCENT,
              },
            }}
          >
            Funkcijos
          </Typography>
          <Typography
            variant="h2"
            sx={{
              fontFamily: '"Fraunces", Georgia, serif',
              fontSize: { xs: '38px', sm: '54px', md: '68px' },
              fontWeight: 400,
              lineHeight: 1.02,
              letterSpacing: '-0.03em',
              color: '#1b1b1b',
              marginBottom: 2,
            }}
          >
            Viskas, ko reikia{' '}
            <Box
              component="span"
              sx={{ fontStyle: 'italic', fontWeight: 300, color: ACCENT }}
            >
              pilnam ciklui.
            </Box>
          </Typography>
          <Typography
            sx={{
              fontFamily: 'Helvetica',
              fontSize: { xs: '16px', md: '18px' },
              color: '#6b6660',
              maxWidth: '62ch',
              margin: '0 auto',
              lineHeight: 1.55,
            }}
          >
            Nuo sąskaitos sukūrimo iki apmokėjimo gavimo ir eksporto į apskaitą —
            be atskirų įrankių, be rankinių veiksmų.
          </Typography>
        </Box>

        {/* Сетка функций */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
            },
            gap: { xs: 2, md: 2.5 },
          }}
        >
          {[
            {
              Icon: ContentCopyIcon,
              title: 'Greitas dublikavimas',
              desc: 'Išrašykite tą pačią sąskaitą kitam klientui vienu paspaudimu — be pildymo iš naujo.',
            },
            {
              Icon: EventRepeatIcon,
              title: 'Periodinės sąskaitos',
              desc: 'Nustatykite automatinį išrašymą kas mėnesį, ketvirtį ar kitu intervalu.',
            },
            {
              Icon: OutboxIcon,
              title: 'Siuntimas el. paštu',
              desc: 'Siųskite sąskaitas tiesiai klientui iš sistemos — PDF priedas pridedamas automatiškai.',
            },
            {
              Icon: CreditCardIcon,
              title: 'Apmokėjimo mygtukas',
              desc: 'Pridėkite „Apmokėti" mygtuką per Montonio arba Paysera — klientas sumokės per kelias sekundes.',
            },
            {
              Icon: AccountBalanceIcon,
              title: 'Banko išrašų importas',
              desc: 'Importuokite banko išrašą — apmokėjimai automatiškai susiejami su atitinkamomis sąskaitomis.',
            },
            {
              Icon: FileDownloadIcon,
              title: 'Eksportas į 16 programų',
              desc: 'Rivilė, Finvalda, Centas, Agnum ir dar 12 apskaitos programų — viskas paruošta importui.',
            },
            {
              Icon: NotificationsActiveIcon,
              title: 'Apmokėjimų priminimai',
              desc: 'Sistema pati primins klientui, jei sąskaita nebuvo apmokėta laiku.',
            },
            {
              Icon: ReceiptLongIcon,
              title: 'iSAF eksportas',
              desc: 'Automatiškai generuokite iSAF XML failus be jokių papildomų įrankių.',
            },
            {
              Icon: DomainVerificationIcon,
              title: 'Registrų Centras',
              desc: 'Kurdami sąskaitas naudokite įmonių rekvizitus iš Registro Centro, taip taupydami daug laiko.',
            },
            {
              Icon: Inventory2Icon,
              title: 'Prekių ir paslaugų katalogas',
              desc: 'Susikurkite katalogą arba importuokite jį tiesiai iš savo apskaitos programos.',
            },
            {
              Icon: BrandingWatermarkIcon,
              title: 'Logotipas sąskaitose',
              desc: 'Įkelkite savo logotipą — jis automatiškai atsiras visose išrašytose sąskaitose.',
            },
            {
              Icon: PictureAsPdfIcon,
              title: 'Išankstinių konvertavimas į PVM SF',
              desc: 'Automatiškai konvertuokite apmokėtas išankstines sąskaitas į PVM sąskaitas faktūras.',
            },
          ].map(({ Icon, title, desc }, idx) => (
            <Box
              key={idx}
              sx={{
                background: '#fffdf8',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: '18px',
                padding: { xs: '24px 22px', md: '30px 28px' },
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                position: 'relative',
                transition: 'all 0.3s cubic-bezier(.2,.7,.2,1)',
                cursor: 'default',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  borderColor: `${ACCENT}55`,
                  boxShadow: `0 24px 50px -25px rgba(17,17,17,0.2), 0 0 0 1px ${ACCENT}30`,
                  '& .feature-icon-box': {
                    background: ACCENT,
                    '& svg': { color: '#fff' },
                  },
                  '& .feature-number': {
                    color: ACCENT,
                  },
                },
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 1,
                }}
              >
                <Box
                  className="feature-icon-box"
                  sx={{
                    width: 52,
                    height: 52,
                    borderRadius: '14px',
                    background: `${ACCENT}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s ease',
                  }}
                >
                  <Icon
                    sx={{
                      fontSize: 26,
                      color: ACCENT,
                      transition: 'color 0.3s ease',
                    }}
                  />
                </Box>
                <Typography
                  className="feature-number"
                  sx={{
                    fontFamily: '"Fraunces", Georgia, serif',
                    fontStyle: 'italic',
                    fontSize: '15px',
                    fontWeight: 400,
                    color: '#bcb7ad',
                    transition: 'color 0.3s ease',
                  }}
                >
                  / {String(idx + 1).padStart(2, '0')}
                </Typography>
              </Box>

              <Typography
                sx={{
                  fontFamily: 'Helvetica',
                  fontSize: '19px',
                  fontWeight: 700,
                  color: '#1b1b1b',
                  lineHeight: 1.2,
                  letterSpacing: '-0.01em',
                }}
              >
                {title}
              </Typography>

              <Typography
                sx={{
                  fontFamily: 'Helvetica',
                  fontSize: '14.5px',
                  fontWeight: 400,
                  color: '#6b6660',
                  lineHeight: 1.55,
                }}
              >
                {desc}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ========= PLANAI ========= */}
      <Box
        id="planai"
        sx={{
          maxWidth: '1280px',
          margin: '0 auto',
          paddingX: { xs: 2, md: 2 },
          paddingTop: { xs: '70px', md: '110px' },
          paddingBottom: { xs: '70px', md: '120px' },
          scrollMarginTop: { xs: '80px', md: '100px' },
        }}
      >
        {/* Заголовок */}
        <Box sx={{ textAlign: 'center', marginBottom: { xs: 5, md: 8 } }}>
          <Typography
            sx={{
              fontSize: '12px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: ACCENT,
              fontFamily: 'Helvetica',
              fontWeight: 600,
              marginBottom: 2,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1.2,
              '&::before, &::after': {
                content: '""',
                width: '32px',
                height: '1px',
                background: ACCENT,
              },
            }}
          >
            Planai
          </Typography>
          <Typography
            variant="h2"
            sx={{
              fontFamily: '"Fraunces", Georgia, serif',
              fontSize: { xs: '38px', sm: '54px', md: '68px' },
              fontWeight: 400,
              lineHeight: 1.02,
              letterSpacing: '-0.03em',
              color: '#1b1b1b',
              marginBottom: 2,
            }}
          >
            Pradėkite{' '}
            <Box
              component="span"
              sx={{ fontStyle: 'italic', fontWeight: 300, color: ACCENT }}
            >
              nemokamai.
            </Box>
          </Typography>
          <Typography
            sx={{
              fontFamily: 'Helvetica',
              fontSize: { xs: '16px', md: '18px' },
              color: '#6b6660',
              maxWidth: '60ch',
              margin: '0 auto',
              lineHeight: 1.55,
            }}
          >
            Norint pilnos automatizacijos, užsisakykite PRO bet kuriuo metu.
          </Typography>
        </Box>

        {/* Две карточки планов */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: { xs: 3, md: 4 },
            maxWidth: '1020px',
            margin: '0 auto',
            alignItems: 'stretch',
          }}
        >
          {/* ---- NEMOKAMAS ---- */}
          <Box
            sx={{
              background: '#fffdf8',
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: '22px',
              padding: { xs: '36px 30px', md: '48px 42px' },
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              boxShadow: '0 20px 50px -30px rgba(17,17,17,0.12)',
            }}
          >
            <Typography
              sx={{
                fontSize: '11px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: '#6b6660',
                fontFamily: 'Helvetica',
                fontWeight: 600,
                marginBottom: 1,
              }}
            >
              Pradžiai
            </Typography>
            <Typography
              sx={{
                fontFamily: '"Fraunces", Georgia, serif',
                fontSize: { xs: '36px', md: '44px' },
                fontWeight: 400,
                fontStyle: 'italic',
                lineHeight: 1,
                letterSpacing: '-0.02em',
                color: '#1b1b1b',
                marginBottom: 3,
              }}
            >
              Nemokamas
            </Typography>

            {/* Цена */}
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, marginBottom: 1 }}>
              <Typography
                sx={{
                  fontFamily: '"Fraunces", Georgia, serif',
                  fontSize: { xs: '72px', md: '88px' },
                  fontWeight: 300,
                  lineHeight: 0.9,
                  letterSpacing: '-0.04em',
                  color: '#1b1b1b',
                }}
              >
                0
              </Typography>
              <Typography
                sx={{
                  fontFamily: 'Helvetica',
                  fontSize: '20px',
                  fontWeight: 600,
                  color: '#1b1b1b',
                }}
              >
                €
              </Typography>
            </Box>
            <Typography
              sx={{
                fontFamily: 'Helvetica',
                fontSize: '14px',
                color: '#6b6660',
                marginBottom: 3,
                paddingBottom: 3,
                borderBottom: '1px dashed rgba(0,0,0,0.15)',
              }}
            >
              visam laikui
            </Typography>

            <Typography
              sx={{
                fontFamily: 'Helvetica',
                fontSize: '15px',
                color: '#6b6660',
                lineHeight: 1.55,
                marginBottom: 3,
              }}
            >
              Lengva įrankio versija smulkiam verslui, kuris išrašo nedaug sąskaitų per mėnesį.
            </Typography>

            {/* Список функций */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, marginBottom: 3, flex: 1 }}>
              {[
                { t: 'Neribotas sąskaitų išrašymas' },
                { t: 'Neribotos PDF sąskaitos' },
                { t: 'Greitas sąskaitų dublikavimas' },
                { t: 'Įmonių duomenys iš Registrų Centro' },
                { t: 'Prekių ir paslaugų katalogas' },
                { t: 'Siuntimas el. paštu', limit: 'iki 10 sąsk. / mėn.' },
                { t: 'Eksportas į iSAF + 15 programų', limit: 'iki 10 sąsk. / mėn.' },
                { t: 'DokSkeno logotipas poraštėje', subtle: true },
              ].map((f, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <Box
                    sx={{
                      color: ACCENT,
                      fontSize: '18px',
                      fontFamily: '"Fraunces", Georgia, serif',
                      fontWeight: 500,
                      lineHeight: 1.2,
                      flexShrink: 0,
                    }}
                  >
                    →
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography
                      sx={{
                        fontFamily: 'Helvetica',
                        fontSize: '15px',
                        color: f.subtle ? '#9a948a' : '#2a2824',
                        lineHeight: 1.5,
                      }}
                    >
                      {f.t}
                    </Typography>
                    {f.limit && (
                      <Typography
                        sx={{
                          fontFamily: 'Helvetica',
                          fontSize: '12px',
                          color: '#a8a093',
                          marginTop: '2px',
                          fontStyle: 'italic',
                        }}
                      >
                        {f.limit}
                      </Typography>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>

            <Button
              variant="outlined"
              size="large"
              href="/registruotis"
              sx={{
                borderColor: '#1b1b1b',
                color: '#1b1b1b',
                fontFamily: 'Helvetica',
                fontWeight: 600,
                fontSize: '15px',
                textTransform: 'none',
                borderRadius: '999px',
                padding: '12px 26px',
                marginTop: 'auto',
                '&:hover': { borderColor: '#1b1b1b', backgroundColor: '#1b1b1b', color: '#fff' },
              }}
            >
              Pradėti nemokamai →
            </Button>
          </Box>

          {/* ---- PRO ---- */}
          <Box
            sx={{
              background: '#1b1b1b',
              color: '#fff',
              borderRadius: '22px',
              padding: { xs: '36px 30px', md: '48px 42px' },
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: `0 40px 80px -40px rgba(17,17,17,0.4), 0 0 0 1px ${ACCENT}25`,
              '&::before': {
                content: '""',
                position: 'absolute',
                inset: 0,
                background: `radial-gradient(ellipse at top right, ${ACCENT}26, transparent 55%)`,
                pointerEvents: 'none',
              },
            }}
          >
            {/* Бейдж популярности */}
            <Box
              sx={{
                position: 'absolute',
                top: 18,
                right: 18,
                background: ACCENT,
                color: '#fff',
                fontSize: '10px',
                fontFamily: 'Helvetica',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                padding: '6px 12px',
                borderRadius: '999px',
                zIndex: 2,
              }}
            >
              Be apribojimų
            </Box>

            <Box sx={{ position: 'relative' }}>
              <Typography
                sx={{
                  fontSize: '11px',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: ACCENT_LIGHT,
                  fontFamily: 'Helvetica',
                  fontWeight: 600,
                  marginBottom: 1,
                }}
              >
                Pažengusiems
              </Typography>
              <Typography
                sx={{
                  fontFamily: '"Fraunces", Georgia, serif',
                  fontSize: { xs: '36px', md: '44px' },
                  fontWeight: 400,
                  fontStyle: 'italic',
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                  color: '#fff',
                  marginBottom: 3,
                }}
              >
                PRO
              </Typography>

              {/* Цена */}
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, marginBottom: 1 }}>
                <Typography
                  sx={{
                    fontFamily: '"Fraunces", Georgia, serif',
                    fontSize: { xs: '72px', md: '88px' },
                    fontWeight: 300,
                    lineHeight: 0.9,
                    letterSpacing: '-0.04em',
                    color: ACCENT_LIGHT,
                  }}
                >
                  9,99
                </Typography>
                <Typography
                  sx={{
                    fontFamily: 'Helvetica',
                    fontSize: '20px',
                    fontWeight: 600,
                    color: '#fff',
                  }}
                >
                  € / mėn.
                </Typography>
              </Box>
              <Typography
                sx={{
                  fontFamily: 'Helvetica',
                  fontSize: '14px',
                  color: 'rgba(255,255,255,0.6)',
                  marginBottom: 3,
                  paddingBottom: 3,
                  borderBottom: '1px dashed rgba(255,255,255,0.18)',
                }}
              >
                be įsipareigojimų · atšaukite bet kada
              </Typography>

              <Typography
                sx={{
                  fontFamily: 'Helvetica',
                  fontSize: '15px',
                  color: 'rgba(255,255,255,0.75)',
                  lineHeight: 1.55,
                  marginBottom: 2,
                }}
              >
                <Box component="span" sx={{ color: '#fff', fontWeight: 600 }}>
                  Visos Nemokamo plano funkcijos
                </Box>
                , plius automatiniai procesai ir neribotas eksportas:
              </Typography>

              {/* PRO функции */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, marginBottom: 3 }}>
                {[
                  { t: 'Apmokėjimo mygtukas', hl: 'Montonio / Paysera' },
                  { t: 'Periodinės sąskaitos' },
                  { t: 'Neribotas siuntimas el. paštu' },
                  { t: 'Neribotas eksportas į iSAF + 15 programų' },
                  { t: 'Banko išrašų importas + auto susiejimas' },
                  { t: 'Automatiniai apmokėjimų priminimai' },
                  { t: 'Jūsų logotipas sąskaitose' },
                  { t: 'Be DokSkeno logotipo poraštėje' },
                ].map((f, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <CheckCircleIcon
                      sx={{ color: ACCENT_LIGHT, fontSize: 18, flexShrink: 0, marginTop: '2px' }}
                    />
                    <Typography
                      sx={{
                        fontFamily: 'Helvetica',
                        fontSize: '15px',
                        color: '#fff',
                        lineHeight: 1.5,
                      }}
                    >
                      {f.t}
                      {f.hl && (
                        <Box
                          component="span"
                          sx={{
                            fontFamily: '"Fraunces", Georgia, serif',
                            fontStyle: 'italic',
                            color: ACCENT_LIGHT,
                            marginLeft: '6px',
                          }}
                        >
                          · {f.hl}
                        </Box>
                      )}
                    </Typography>
                  </Box>
                ))}
              </Box>

              <Button
                variant="contained"
                size="large"
                href="/registruotis"
                sx={{
                  backgroundColor: ACCENT,
                  color: '#fff',
                  fontFamily: 'Helvetica',
                  fontWeight: 600,
                  fontSize: '15px',
                  textTransform: 'none',
                  borderRadius: '999px',
                  padding: '12px 26px',
                  boxShadow: 'none',
                  marginTop: 1,
                  '&:hover': { backgroundColor: '#372ea5', boxShadow: 'none' },
                }}
              >
                Pradėti PRO bandomąjį →
              </Button>
            </Box>
          </Box>
        </Box>

        {/* Баннер под планами */}
        <Box
          sx={{
            maxWidth: '1020px',
            margin: { xs: '30px auto 0', md: '40px auto 0' },
            background: `${ACCENT}10`,
            border: `1px solid ${ACCENT}35`,
            borderRadius: '18px',
            padding: { xs: '22px 24px', md: '26px 32px' },
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'flex-start', sm: 'center' },
            justifyContent: 'space-between',
            gap: 2,
          }}
        >
          <Box>
            <Typography
              sx={{
                fontFamily: '"Fraunces", Georgia, serif',
                fontSize: { xs: '22px', md: '26px' },
                fontWeight: 500,
                color: '#1b1b1b',
                lineHeight: 1.2,
                marginBottom: 0.5,
              }}
            >
              Nežinote, ko jums reikia?{' '}
              <Box component="span" sx={{ fontStyle: 'italic', color: ACCENT }}>
                Pradėkite nuo nemokamo.
              </Box>
            </Typography>
            <Typography
              sx={{
                fontFamily: 'Helvetica',
                fontSize: '14px',
                color: '#6b6660',
              }}
            >
              Esant poreikiui galėsite užsisakyti PRO planą bet kuriuo metu.
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="large"
            href="/registruotis"
            sx={{
              backgroundColor: ACCENT,
              color: '#fff',
              fontFamily: 'Helvetica',
              fontWeight: 600,
              fontSize: '15px',
              textTransform: 'none',
              borderRadius: '999px',
              padding: '12px 26px',
              boxShadow: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              '&:hover': { backgroundColor: '#372ea5', boxShadow: 'none' },
            }}
          >
            Sukurti paskyrą →
          </Button>
        </Box>
      </Box>

    </Box>
  );
};

export default Saskaitos;












// import { useState } from 'react';
// import { Helmet } from "react-helmet";
// import {
//   Box,
//   Paper,
//   TextField,
//   Button,
//   Typography,
//   IconButton,
//   MenuItem,
//   Divider,
//   Table,
//   TableBody,
//   TableCell,
//   TableContainer,
//   TableHead,
//   TableRow,
//   InputAdornment,
//   Grid2,
//   Stack,
//   useTheme,
//   useMediaQuery,
//   Container,
//   Dialog,
//   DialogContent,
// } from '@mui/material';
// import { Add as AddIcon, Delete as DeleteIcon, Download as DownloadIcon, Close as CloseIcon } from '@mui/icons-material';
// import { PDFDownloadLink } from '@react-pdf/renderer';
// import InvoicePDF from '../page_elements/InvoicePDF';
// import AdSection from '../page_elements/AdSection';

// // ---- helpers ----
// const parseLocale = (v) => {
//   if (typeof v === 'number') return v;
//   if (!v) return 0;
//   const n = parseFloat(String(v).replace(',', '.'));
//   return Number.isFinite(n) ? n : 0;
// };
// const fmt = (n) => n.toFixed(2).replace('.', ',');
// // Разрешаем только цифры и одну запятую
// const allowDec = (v) => v === '' || /^[0-9]*([,]?[0-9]*)?$/.test(v);
// // Убираем ведущие нули: "045" -> "45". Но оставляем "0", "0,", "0."
// const stripLeadingZeros = (v) => {
//   if (v == null) return '';
//   const s = String(v);
//   if (s === '0' || s === '0,' || s === '0.') return s;
//   return s.replace(/^0+(?=\d)/, '');
// };

// // Currency symbol mapping
// const CURRENCY_SYMBOLS = {
//   'EUR': '€',
//   'USD': '$',
//   'GBP': '£',
//   'PLN': 'zł',
//   'JPY': '¥',
//   'CNY': '¥',
//   'KRW': '₩',
//   'INR': '₹',
//   'TRY': '₺',
//   'VND': '₫',
//   'ILS': '₪',
//   'PHP': '₱',
//   'NGN': '₦',
//   'CRC': '₡',
//   'PYG': '₲',
//   'LAK': '₭',
//   'GHS': '₵',
//   'KZT': '₸',
//   'AZN': '₼',
//   'UAH': '₴',
//   'BRL': 'R$',
//   'RUB': '₽',
//   'AUD': 'A$',
//   'CAD': 'C$',
//   'NZD': 'NZ$',
//   'HKD': 'HK$',
//   'SGD': 'S$',
//   'TWD': 'NT$',
//   'MXN': 'Mex$',
//   'CZK': 'Kč',
//   'BGN': 'лв',
//   'ZAR': 'R',
//   'SEK': 'kr',
//   'NOK': 'kr',
//   'DKK': 'kr',
//   'ISK': 'kr',
// };

// const getCurrencySymbol = (currencyCode) => {
//   return CURRENCY_SYMBOLS[currencyCode] || currencyCode;
// };

// // ---- UI tokens ----
// const palette = {
//   primary: '#1976d2',
//   bgSection: '#fafafa',
//   border: '#e0e0e0',
// };
// const sectionSx = {
//   p: 2.5,
//   backgroundColor: palette.bgSection,
//   borderRadius: 3,
//   border: `1px solid ${palette.border}`,
// };
// const titleSx = {
//   fontSize: 18,
//   fontWeight: 700,
//   mb: 1.5,
//   color: '#333',
// };

// // ---- component ----
// const InvoiceGenerator = () => {
//   const [logo, setLogo] = useState(null);
//   const [isDragging, setIsDragging] = useState(false);
//   const [videoOpen, setVideoOpen] = useState(false);

//   const [invoiceData, setInvoiceData] = useState({
//     buyer: {
//       pavadinimas: '',
//       imonesKodas: '',
//       pvmKodas: '',
//       adresas: '',
//       telefonas: '+',
//       bankoPavadinimas: '',
//       iban: '',
//       swift: '',
//     },
//     seller: {
//       pavadinimas: '',
//       imonesKodas: '',
//       pvmKodas: '',
//       adresas: '',
//       telefonas: '+',
//       bankoPavadinimas: '',
//       iban: '',
//       swift: '',
//     },
//     saskaitosData: new Date().toISOString().split('T')[0],
//     moketiIki: '',
//     saskaitosSerija: '',
//     saskaitosNumeris: '',
//     uzsakymoNumeris: '',
//     valiuta: 'EUR',
//     eilutes: [{ pavadinimas: '', kodas: '', barkodas: '', kiekis: '1', matoVnt: 'vnt', kainaBePvm: '0' }],
//     nuolaida: '0',
//     pristatymoMokestis: '0',
//     pvmProcent: '21',
//     pvmTipas: 'taikoma',
//   });

//   // ---- logo ----
//   const handleLogoUpload = (e) => {
//     const file = e.target.files && e.target.files[0];
//     if (!file) return;
//     const reader = new FileReader();
//     reader.onloadend = () => setLogo(reader.result);
//     reader.readAsDataURL(file);
//   };
//   const handleLogoDrop = (e) => {
//     e.preventDefault();
//     setIsDragging(false);
//     const file = e.dataTransfer.files && e.dataTransfer.files[0];
//     if (!file || !file.type.startsWith('image/')) return;
//     const reader = new FileReader();
//     reader.onloadend = () => setLogo(reader.result);
//     reader.readAsDataURL(file);
//   };

//   // ---- state updaters ----
//   const updateField = (section, field, value) => {
//     setInvoiceData((prev) => ({
//       ...prev,
//       [section]: { ...prev[section], [field]: value },
//     }));
//   };
//   const updateRootField = (field, value) => {
//     setInvoiceData((prev) => ({ ...prev, [field]: value }));
//   };
//   const addEilute = () => {
//     setInvoiceData((prev) => ({
//       ...prev,
//       eilutes: [
//         ...prev.eilutes,
//         { pavadinimas: '', kodas: '', barkodas: '', kiekis: '1', matoVnt: 'vnt', kainaBePvm: '0' },
//       ],
//     }));
//   };
//   const removeEilute = (index) => {
//     setInvoiceData((prev) => ({
//       ...prev,
//       eilutes: prev.eilutes.filter((_, i) => i !== index),
//     }));
//   };
//   const updateEilute = (index, field, value) => {
//     setInvoiceData((prev) => ({
//       ...prev,
//       eilutes: prev.eilutes.map((e, i) => (i === index ? { ...e, [field]: value } : e)),
//     }));
//   };

//   // ---- sums ----
//   const calculateSums = () => {
//     const tarpineSuma = invoiceData.eilutes.reduce(
//       (sum, e) => sum + parseLocale(e.kiekis) * parseLocale(e.kainaBePvm),
//       0
//     );
//     const nuolaida = parseLocale(invoiceData.nuolaida);
//     const pristatymas = parseLocale(invoiceData.pristatymoMokestis);
//     const pvmProcent = parseLocale(invoiceData.pvmProcent);

//     const sumaBePvm = tarpineSuma - nuolaida + pristatymas;
//     const pvmSuma = invoiceData.pvmTipas === 'taikoma' ? (sumaBePvm * pvmProcent) / 100 : 0;
//     const sumaSuPvm = sumaBePvm + pvmSuma;

//     return {
//       tarpineSuma: fmt(tarpineSuma),
//       nuolaida: fmt(nuolaida),
//       pristatymoMokestis: fmt(pristatymas),
//       sumaBePvm: fmt(sumaBePvm),
//       pvmSuma: fmt(pvmSuma),
//       sumaSuPvm: fmt(sumaSuPvm),
//     };
//   };
//   const sumos = calculateSums();
//   const nuolaidaNum = parseLocale(invoiceData.nuolaida);
//   const pristatymasNum = parseLocale(invoiceData.pristatymoMokestis);
//   const hasDiscount = nuolaidaNum > 0;
//   const hasDelivery = pristatymasNum > 0;
//   const currencySymbol = getCurrencySymbol(invoiceData.valiuta);

//   const theme = useTheme();
//   const isMobile = useMediaQuery(theme.breakpoints.down('md'));

//   const isVatApplied = invoiceData.pvmTipas === 'taikoma';
//   const priceLabel = isVatApplied ? 'Kaina be PVM' : 'Kaina';
//   const sumLabel = isVatApplied ? 'Suma be PVM' : 'Suma';

//   return (
//     <>
//       <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
//         <Helmet>
//           <title>Nemokamas sąskaitos-faktūros generatorius – DokSkenas</title>
//           <meta
//             name="description"
//             content="Nemokamai sugeneruokite gražią PDF sąskaitą-faktūrą, suvedę reikiamus duomenis. Rinkitės iš kelių skirtingų šablonų."
//           />
//         </Helmet>
//         <Paper
//           sx={{
//             p: { xs: 2, md: 3 },
//             borderRadius: 4,
//             '& .MuiOutlinedInput-root': { backgroundColor: '#fff' },
//           }}
//         >
//           <Typography variant="h1" gutterBottom sx={{ color: palette.primary, fontWeight: 500, fontSize: 24 }}>
//             Sąskaitos faktūros generatorius
//           </Typography>

//           {/* Logo */}
//           <Box sx={{ ...sectionSx, mb: 3 }}>
//             <Typography sx={titleSx}>Logotipas</Typography>
//             <Box
//               onDrop={handleLogoDrop}
//               onDragOver={(e) => {
//                 e.preventDefault();
//                 if (!isDragging) setIsDragging(true);
//               }}
//               onDragEnter={(e) => {
//                 e.preventDefault();
//                 setIsDragging(true);
//               }}
//               onDragLeave={(e) => {
//                 e.preventDefault();
//                 if (e.currentTarget === e.target) setIsDragging(false);
//               }}
//               sx={{
//                 border: isDragging ? `2px dashed ${palette.primary}` : '2px dashed #ddd',
//                 borderRadius: 3,
//                 textAlign: 'center',
//                 p: 3,
//               }}
//             >
//               <input accept="image/*" type="file" onChange={handleLogoUpload} id="logo-upload" style={{ display: 'none' }} />
//               {!logo ? (
//                 <label htmlFor="logo-upload" style={{ display: 'block', cursor: 'pointer' }}>
//                   <Typography>📁 Įkelti logotipą (PNG, JPG)</Typography>
//                   <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
//                     Arba tempkite failą čia
//                   </Typography>
//                 </label>
//               ) : (
//                 <Box sx={{ mt: 2, position: 'relative', display: 'inline-block' }}>
//                   <img src={logo} alt="Logo" style={{ maxHeight: 100 }} />
//                   <IconButton
//                     onClick={() => setLogo(null)}
//                     sx={{ position: 'absolute', top: -10, right: -10, backgroundColor: '#fff' }}
//                     size="small"
//                   >
//                     <DeleteIcon fontSize="small" />
//                   </IconButton>
//                 </Box>
//               )}
//             </Box>
//           </Box>

//           {/* Buyer / Seller */}
//           <Grid2 container spacing={2} sx={{ mb: 3 }}>
//             <Grid2 size={{ xs: 12, md: 6 }}>
//               <Box sx={{ ...sectionSx, height: '100%' }}>
//                 <Typography sx={{ ...titleSx, color: '#dc004e' }}>PIRKĖJAS</Typography>
//                 <Grid2 container spacing={1.5}>
//                   <Grid2 size={{ xs: 12 }}>
//                     <TextField
//                       fullWidth
//                       label="Pavadinimas"
//                       value={invoiceData.buyer.pavadinimas}
//                       onChange={(e) => updateField('buyer', 'pavadinimas', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12, sm: 6 }}>
//                     <TextField
//                       fullWidth
//                       label="Įmonės kodas"
//                       value={invoiceData.buyer.imonesKodas}
//                       onChange={(e) => updateField('buyer', 'imonesKodas', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12, sm: 6 }}>
//                     <TextField
//                       fullWidth
//                       label="PVM kodas"
//                       value={invoiceData.buyer.pvmKodas}
//                       onChange={(e) => updateField('buyer', 'pvmKodas', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12 }}>
//                     <TextField
//                       fullWidth
//                       label="Adresas"
//                       multiline
//                       rows={2}
//                       value={invoiceData.buyer.adresas}
//                       onChange={(e) => updateField('buyer', 'adresas', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12 }}>
//                     <TextField
//                       fullWidth
//                       label="Telefonas"
//                       placeholder="+370..."
//                       value={invoiceData.buyer.telefonas}
//                       onChange={(e) => {
//                         let v = e.target.value;
//                         if (!v.startsWith('+')) v = '+' + v.replace(/\+/g, '');
//                         v = '+' + v.slice(1).replace(/\D/g, '');
//                         updateField('buyer', 'telefonas', v);
//                       }}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12 }}>
//                     <TextField
//                       fullWidth
//                       label="Banko pavadinimas"
//                       value={invoiceData.buyer.bankoPavadinimas}
//                       onChange={(e) => updateField('buyer', 'bankoPavadinimas', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12, sm: 8 }}>
//                     <TextField
//                       fullWidth
//                       label="IBAN"
//                       value={invoiceData.buyer.iban}
//                       onChange={(e) => updateField('buyer', 'iban', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12, sm: 4 }}>
//                     <TextField
//                       fullWidth
//                       label="SWIFT"
//                       value={invoiceData.buyer.swift}
//                       onChange={(e) => updateField('buyer', 'swift', e.target.value)}
//                     />
//                   </Grid2>
//                 </Grid2>
//               </Box>
//             </Grid2>

//             <Grid2 size={{ xs: 12, md: 6 }}>
//               <Box sx={{ ...sectionSx, height: '100%' }}>
//                 <Typography sx={{ ...titleSx, color: palette.primary }}>PARDAVĖJAS</Typography>
//                 <Grid2 container spacing={1.5}>
//                   <Grid2 size={{ xs: 12 }}>
//                     <TextField
//                       fullWidth
//                       label="Pavadinimas"
//                       value={invoiceData.seller.pavadinimas}
//                       onChange={(e) => updateField('seller', 'pavadinimas', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12, sm: 6 }}>
//                     <TextField
//                       fullWidth
//                       label="Įmonės kodas"
//                       value={invoiceData.seller.imonesKodas}
//                       onChange={(e) => updateField('seller', 'imonesKodas', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12, sm: 6 }}>
//                     <TextField
//                       fullWidth
//                       label="PVM kodas"
//                       value={invoiceData.seller.pvmKodas}
//                       onChange={(e) => updateField('seller', 'pvmKodas', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12 }}>
//                     <TextField
//                       fullWidth
//                       label="Adresas"
//                       multiline
//                       rows={2}
//                       value={invoiceData.seller.adresas}
//                       onChange={(e) => updateField('seller', 'adresas', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12 }}>
//                     <TextField
//                       fullWidth
//                       label="Telefonas"
//                       placeholder="+370..."
//                       value={invoiceData.seller.telefonas}
//                       onChange={(e) => {
//                         let v = e.target.value;
//                         if (!v.startsWith('+')) v = '+' + v.replace(/\+/g, '');
//                         v = '+' + v.slice(1).replace(/\D/g, '');
//                         updateField('seller', 'telefonas', v);
//                       }}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12 }}>
//                     <TextField
//                       fullWidth
//                       label="Banko pavadinimas"
//                       value={invoiceData.seller.bankoPavadinimas}
//                       onChange={(e) => updateField('seller', 'bankoPavadinimas', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12, sm: 8 }}>
//                     <TextField
//                       fullWidth
//                       label="IBAN"
//                       value={invoiceData.seller.iban}
//                       onChange={(e) => updateField('seller', 'iban', e.target.value)}
//                     />
//                   </Grid2>
//                   <Grid2 size={{ xs: 12, sm: 4 }}>
//                     <TextField
//                       fullWidth
//                       label="SWIFT"
//                       value={invoiceData.seller.swift}
//                       onChange={(e) => updateField('seller', 'swift', e.target.value)}
//                     />
//                   </Grid2>
//                 </Grid2>
//               </Box>
//             </Grid2>
//           </Grid2>

//           {/* Invoice info */}
//           <Box sx={{ ...sectionSx, mb: 3 }}>
//             <Typography sx={titleSx}>Sąskaitos informacija</Typography>
//             <Grid2 container spacing={1.5}>
//               <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                 <TextField
//                   fullWidth
//                   label="Sąskaitos data"
//                   type="date"
//                   value={invoiceData.saskaitosData}
//                   onChange={(e) => updateRootField('saskaitosData', e.target.value)}
//                   InputLabelProps={{ shrink: true }}
//                 />
//               </Grid2>
//               <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                 <TextField
//                   fullWidth
//                   label="Mokėti iki"
//                   type="date"
//                   value={invoiceData.moketiIki}
//                   onChange={(e) => updateRootField('moketiIki', e.target.value)}
//                   InputLabelProps={{ shrink: true }}
//                 />
//               </Grid2>
//               <Grid2 size={{ xs: 12, sm: 4, md: 2 }}>
//                 <TextField
//                   fullWidth
//                   label="Serija"
//                   value={invoiceData.saskaitosSerija}
//                   onChange={(e) => updateRootField('saskaitosSerija', e.target.value)}
//                 />
//               </Grid2>
//               <Grid2 size={{ xs: 12, sm: 4, md: 2 }}>
//                 <TextField
//                   fullWidth
//                   label="Numeris"
//                   value={invoiceData.saskaitosNumeris}
//                   onChange={(e) => updateRootField('saskaitosNumeris', e.target.value)}
//                 />
//               </Grid2>
//               <Grid2 size={{ xs: 12, sm: 4, md: 2 }}>
//                 <TextField
//                   fullWidth
//                   label="Užsakymo Nr."
//                   value={invoiceData.uzsakymoNumeris}
//                   onChange={(e) => updateRootField('uzsakymoNumeris', e.target.value)}
//                 />
//               </Grid2>
//               <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                 <TextField
//                   fullWidth
//                   select
//                   label="Valiuta"
//                   value={invoiceData.valiuta}
//                   onChange={(e) => updateRootField('valiuta', e.target.value)}
//                 >
//                   <MenuItem value="EUR">EUR (€)</MenuItem>
//                   <MenuItem value="USD">USD ($)</MenuItem>
//                   <MenuItem value="GBP">GBP (£)</MenuItem>
//                   <MenuItem value="PLN">PLN (zł)</MenuItem>
//                   <MenuItem value="JPY">JPY (¥)</MenuItem>
//                   <MenuItem value="CNY">CNY (¥)</MenuItem>
//                   <MenuItem value="KRW">KRW (₩)</MenuItem>
//                   <MenuItem value="INR">INR (₹)</MenuItem>
//                   <MenuItem value="TRY">TRY (₺)</MenuItem>
//                   <MenuItem value="VND">VND (₫)</MenuItem>
//                   <MenuItem value="ILS">ILS (₪)</MenuItem>
//                   <MenuItem value="PHP">PHP (₱)</MenuItem>
//                   <MenuItem value="NGN">NGN (₦)</MenuItem>
//                   <MenuItem value="CRC">CRC (₡)</MenuItem>
//                   <MenuItem value="PYG">PYG (₲)</MenuItem>
//                   <MenuItem value="LAK">LAK (₭)</MenuItem>
//                   <MenuItem value="GHS">GHS (₵)</MenuItem>
//                   <MenuItem value="KZT">KZT (₸)</MenuItem>
//                   <MenuItem value="AZN">AZN (₼)</MenuItem>
//                   <MenuItem value="UAH">UAH (₴)</MenuItem>
//                   <MenuItem value="RUB">RUB (₽)</MenuItem>
//                   <MenuItem value="BRL">BRL (R$)</MenuItem>
//                   <MenuItem value="AUD">AUD (A$)</MenuItem>
//                   <MenuItem value="CAD">CAD (C$)</MenuItem>
//                   <MenuItem value="NZD">NZD (NZ$)</MenuItem>
//                   <MenuItem value="HKD">HKD (HK$)</MenuItem>
//                   <MenuItem value="SGD">SGD (S$)</MenuItem>
//                   <MenuItem value="TWD">TWD (NT$)</MenuItem>
//                   <MenuItem value="MXN">MXN (Mex$)</MenuItem>
//                   <MenuItem value="CZK">CZK (Kč)</MenuItem>
//                   <MenuItem value="BGN">BGN (лв)</MenuItem>
//                   <MenuItem value="ZAR">ZAR (R)</MenuItem>
//                   <MenuItem value="CHF">CHF</MenuItem>
//                   <MenuItem value="SEK">SEK (kr)</MenuItem>
//                   <MenuItem value="NOK">NOK (kr)</MenuItem>
//                   <MenuItem value="DKK">DKK (kr)</MenuItem>
//                   <MenuItem value="ISK">ISK (kr)</MenuItem>
//                 </TextField>
//               </Grid2>
//             </Grid2>
//           </Box>

//           {/* Lines */}
//           <Box sx={{ ...sectionSx, mb: 3 }}>
//             <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
//               <Typography sx={{ ...titleSx, mb: 0 }}>Prekės / Paslaugos</Typography>
//               <Button startIcon={<AddIcon />} onClick={addEilute} variant="contained">
//                 Pridėti eilutę
//               </Button>
//             </Box>

//             {isMobile && (
//               <Stack spacing={1.5}>
//                 {invoiceData.eilutes.map((eilute, index) => {
//                   const lineSum = fmt(parseLocale(eilute.kiekis) * parseLocale(eilute.kainaBePvm));
//                   return (
//                     <Paper
//                       key={index}
//                       variant="outlined"
//                       sx={{ p: 1.5, borderRadius: 2, borderColor: palette.border, background: '#fff' }}
//                     >
//                       <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
//                         <Typography fontWeight={700}>Eilutė #{index + 1}</Typography>
//                         <IconButton
//                           size="small"
//                           onClick={() => removeEilute(index)}
//                           disabled={invoiceData.eilutes.length === 1}
//                           aria-label="Delete row"
//                         >
//                           <DeleteIcon fontSize="small" />
//                         </IconButton>
//                       </Box>

//                       <Grid2 container spacing={1}>
//                         <Grid2 size={{ xs: 12 }}>
//                           <TextField
//                             size="small"
//                             fullWidth
//                             label="Pavadinimas"
//                             value={eilute.pavadinimas}
//                             onChange={(e) => updateEilute(index, 'pavadinimas', e.target.value)}
//                           />
//                         </Grid2>

//                         <Grid2 size={{ xs: 12 }}>
//                           <TextField
//                             size="small"
//                             fullWidth
//                             label="Kodas"
//                             value={eilute.kodas}
//                             onChange={(e) => updateEilute(index, 'kodas', e.target.value)}
//                           />
//                         </Grid2>

//                         <Grid2 size={{ xs: 12 }}>
//                           <TextField
//                             size="small"
//                             fullWidth
//                             label="Barkodas"
//                             value={eilute.barkodas}
//                             onChange={(e) => updateEilute(index, 'barkodas', e.target.value)}
//                           />
//                         </Grid2>

//                         <Grid2 size={{ xs: 6 }}>
//                           <TextField
//                             size="small"
//                             fullWidth
//                             label="Kiekis"
//                             type="text"
//                             inputProps={{ inputMode: 'decimal', pattern: '[0-9,]*' }}
//                             value={eilute.kiekis ?? ''}
//                             onFocus={() => {
//                               if (eilute.kiekis === '0') updateEilute(index, 'kiekis', '');
//                             }}
//                             onChange={(e) => {
//                               let v = e.target.value.replace('.', ',');
//                               if (!allowDec(v)) return;
//                               updateEilute(index, 'kiekis', stripLeadingZeros(v));
//                             }}
//                           />
//                         </Grid2>

//                         <Grid2 size={{ xs: 6 }}>
//                           <TextField
//                             size="small"
//                             fullWidth
//                             label="Mato vnt."
//                             value={eilute.matoVnt}
//                             onChange={(e) => updateEilute(index, 'matoVnt', e.target.value)}
//                           />
//                         </Grid2>

//                         <Grid2 size={{ xs: 12 }}>
//                           <TextField
//                             size="small"
//                             fullWidth
//                             label={priceLabel}
//                             type="text"
//                             inputProps={{ inputMode: 'decimal', pattern: '[0-9,]*' }}
//                             value={eilute.kainaBePvm ?? ''}
//                             onFocus={() => {
//                               if (eilute.kainaBePvm === '0') updateEilute(index, 'kainaBePvm', '');
//                             }}
//                             onChange={(e) => {
//                               let v = e.target.value.replace('.', ',');
//                               if (!allowDec(v)) return;
//                               updateEilute(index, 'kainaBePvm', stripLeadingZeros(v));
//                             }}
//                           />
//                         </Grid2>

//                         <Grid2 size={{ xs: 12 }}>
//                           <Box
//                             sx={{
//                               display: 'flex',
//                               justifyContent: 'space-between',
//                               alignItems: 'center',
//                               p: 1,
//                               borderRadius: 1.5,
//                               border: `1px dashed ${palette.border}`,
//                               background: palette.bgSection,
//                             }}
//                           >
//                             <Typography fontSize={14}>{sumLabel}</Typography>
//                             <Typography fontWeight={800}>
//                               {lineSum} {currencySymbol}
//                             </Typography>
//                           </Box>
//                         </Grid2>
//                       </Grid2>
//                     </Paper>
//                   );
//                 })}
//               </Stack>
//             )}

//             {!isMobile && (
//               <TableContainer sx={{ overflow: 'visible' }}>
//                 <Table size="small" sx={{ borderCollapse: 'separate', borderSpacing: 0 }}>
//                   <TableHead>
//                     <TableRow
//                       sx={{
//                         '& th': {
//                           background: palette.primary,
//                           color: '#fff',
//                           py: 1.4,
//                           fontSize: 12,
//                           borderBottom: 'none',
//                         },
//                         '& th:first-of-type': { borderTopLeftRadius: 10 },
//                         '& th:last-of-type': { borderTopRightRadius: 10 },
//                       }}
//                     >
//                       <TableCell>Pavadinimas</TableCell>
//                       <TableCell>Kodas</TableCell>
//                       <TableCell>Barkodas</TableCell>
//                       <TableCell>Kiekis</TableCell>
//                       <TableCell>Mato vnt.</TableCell>
//                       <TableCell>{priceLabel}</TableCell>
//                       <TableCell>{sumLabel}</TableCell>
//                       <TableCell />
//                     </TableRow>

//                     <TableRow>
//                       <TableCell colSpan={8} sx={{ p: 0, height: 10, background: 'transparent', borderBottom: 'none' }} />
//                     </TableRow>
//                   </TableHead>

//                   <TableBody>
//                     {invoiceData.eilutes.map((eilute, index) => (
//                       <TableRow key={index} sx={{ '& td': { borderBottom: `1px solid ${palette.border}` } }}>
//                         <TableCell sx={{ minWidth: 180 }}>
//                           <TextField
//                             size="small"
//                             value={eilute.pavadinimas}
//                             onChange={(e) => updateEilute(index, 'pavadinimas', e.target.value)}
//                             fullWidth
//                           />
//                         </TableCell>

//                         <TableCell sx={{ minWidth: 120 }}>
//                           <TextField
//                             size="small"
//                             value={eilute.kodas}
//                             onChange={(e) => updateEilute(index, 'kodas', e.target.value)}
//                             fullWidth
//                           />
//                         </TableCell>

//                         <TableCell sx={{ minWidth: 160 }}>
//                           <TextField
//                             size="small"
//                             value={eilute.barkodas}
//                             onChange={(e) => updateEilute(index, 'barkodas', e.target.value)}
//                             fullWidth
//                           />
//                         </TableCell>

//                         <TableCell sx={{ minWidth: 100 }}>
//                           <TextField
//                             size="small"
//                             type="text"
//                             inputProps={{ inputMode: 'decimal', pattern: '[0-9,]*' }}
//                             value={eilute.kiekis ?? ''}
//                             onFocus={() => {
//                               if (eilute.kiekis === '0') updateEilute(index, 'kiekis', '');
//                             }}
//                             onChange={(e) => {
//                               let v = e.target.value.replace('.', ',');
//                               if (!allowDec(v)) return;
//                               updateEilute(index, 'kiekis', stripLeadingZeros(v));
//                             }}
//                             fullWidth
//                           />
//                         </TableCell>

//                         <TableCell sx={{ minWidth: 100 }}>
//                           <TextField
//                             size="small"
//                             value={eilute.matoVnt}
//                             onChange={(e) => updateEilute(index, 'matoVnt', e.target.value)}
//                             fullWidth
//                           />
//                         </TableCell>

//                         <TableCell sx={{ minWidth: 140 }}>
//                           <TextField
//                             size="small"
//                             type="text"
//                             inputProps={{ inputMode: 'decimal', pattern: '[0-9,]*' }}
//                             value={eilute.kainaBePvm ?? ''}
//                             onFocus={() => {
//                               if (eilute.kainaBePvm === '0') updateEilute(index, 'kainaBePvm', '');
//                             }}
//                             onChange={(e) => {
//                               let v = e.target.value.replace('.', ',');
//                               if (!allowDec(v)) return;
//                               updateEilute(index, 'kainaBePvm', stripLeadingZeros(v));
//                             }}
//                             fullWidth
//                           />
//                         </TableCell>

//                         <TableCell sx={{ whiteSpace: 'nowrap' }}>
//                           {fmt(parseLocale(eilute.kiekis) * parseLocale(eilute.kainaBePvm))} {currencySymbol}
//                         </TableCell>

//                         <TableCell align="center" width={56}>
//                           <IconButton
//                             size="small"
//                             onClick={() => removeEilute(index)}
//                             disabled={invoiceData.eilutes.length === 1}
//                             aria-label="Delete row"
//                           >
//                             <DeleteIcon fontSize="small" />
//                           </IconButton>
//                         </TableCell>
//                       </TableRow>
//                     ))}
//                   </TableBody>
//                 </Table>
//               </TableContainer>
//             )}
//           </Box>

//           {/* Totals */}
//           <Box sx={{ ...sectionSx }}>
//             <Typography sx={titleSx}>Sumos</Typography>

//             <Grid2 container spacing={1.5} sx={{ mb: 2 }}>
//               <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                 <TextField
//                   fullWidth
//                   label="Nuolaida"
//                   type="text"
//                   inputProps={{ inputMode: 'decimal', pattern: '[0-9,]*' }}
//                   value={invoiceData.nuolaida}
//                   onFocus={() => {
//                     if (invoiceData.nuolaida === '0') updateRootField('nuolaida', '');
//                   }}
//                   onChange={(e) => {
//                     let v = e.target.value;
//                     v = v.replace('.', ',');
//                     if (!allowDec(v)) return;
//                     updateRootField('nuolaida', stripLeadingZeros(v));
//                   }}
//                   InputProps={{ endAdornment: <InputAdornment position="end">{currencySymbol}</InputAdornment> }}
//                 />
//               </Grid2>

//               <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                 <TextField
//                   fullWidth
//                   label="Pristatymo mokestis"
//                   type="text"
//                   inputProps={{ inputMode: 'decimal', pattern: '[0-9,]*' }}
//                   value={invoiceData.pristatymoMokestis}
//                   onFocus={() => {
//                     if (invoiceData.pristatymoMokestis === '0') updateRootField('pristatymoMokestis', '');
//                   }}
//                   onChange={(e) => {
//                     let v = e.target.value;
//                     v = v.replace('.', ',');
//                     if (!allowDec(v)) return;
//                     updateRootField('pristatymoMokestis', stripLeadingZeros(v));
//                   }}
//                   InputProps={{ endAdornment: <InputAdornment position="end">{currencySymbol}</InputAdornment> }}
//                 />
//               </Grid2>

//               <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                 <TextField
//                   fullWidth
//                   select
//                   label="PVM"
//                   value={invoiceData.pvmTipas}
//                   onChange={(e) => updateRootField('pvmTipas', e.target.value)}
//                 >
//                   <MenuItem value="taikoma">Taikoma</MenuItem>
//                   <MenuItem value="netaikoma">Netaikoma</MenuItem>
//                 </TextField>
//               </Grid2>

//               {invoiceData.pvmTipas === 'taikoma' && (
//                 <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
//                   <TextField
//                     fullWidth
//                     label="PVM %"
//                     type="text"
//                     inputProps={{ inputMode: 'decimal', pattern: '[0-9,]*' }}
//                     value={invoiceData.pvmProcent}
//                     onFocus={() => {
//                       if (invoiceData.pvmProcent === '0') updateRootField('pvmProcent', '');
//                     }}
//                     onChange={(e) => {
//                       let v = e.target.value;
//                       v = v.replace('.', ',');
//                       if (!allowDec(v)) return;
//                       updateRootField('pvmProcent', stripLeadingZeros(v));
//                     }}
//                     InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
//                   />
//                 </Grid2>
//               )}
//             </Grid2>

//             <Divider sx={{ my: 2 }} />

//             {invoiceData.pvmTipas === 'taikoma' ? (
//               <Box
//                 sx={{
//                   ml: 'auto',
//                   maxWidth: 420,
//                   background: '#fff',
//                   p: 2,
//                   borderRadius: 2,
//                   border: `1px solid ${palette.border}`,
//                 }}
//               >
//                 {(hasDiscount || hasDelivery) && (
//                   <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
//                     <Typography>Tarpinė suma:</Typography>
//                     <Typography fontWeight={700}>
//                       {sumos.tarpineSuma} {currencySymbol}
//                     </Typography>
//                   </Box>
//                 )}

//                 {hasDiscount && (
//                   <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
//                     <Typography>Nuolaida:</Typography>
//                     <Typography fontWeight={700}>
//                       -{sumos.nuolaida} {currencySymbol}
//                     </Typography>
//                   </Box>
//                 )}

//                 {hasDelivery && (
//                   <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
//                     <Typography>Pristatymo mokestis:</Typography>
//                     <Typography fontWeight={700}>
//                       +{sumos.pristatymoMokestis} {currencySymbol}
//                     </Typography>
//                   </Box>
//                 )}

//                 <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
//                   <Typography>Suma be PVM:</Typography>
//                   <Typography fontWeight={700}>
//                     {sumos.sumaBePvm} {currencySymbol}
//                   </Typography>
//                 </Box>

//                 <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
//                   <Typography>PVM {parseLocale(invoiceData.pvmProcent)}%:</Typography>
//                   <Typography fontWeight={700}>
//                     {sumos.pvmSuma} {currencySymbol}
//                   </Typography>
//                 </Box>

//                 <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, pt: 1, borderTop: '2px solid #333' }}>
//                   <Typography fontWeight={800}>SUMA SU PVM:</Typography>
//                   <Typography fontWeight={800} sx={{ color: palette.primary }}>
//                     {sumos.sumaSuPvm} {currencySymbol}
//                   </Typography>
//                 </Box>
//               </Box>
//             ) : (
//               <Box
//                 sx={{
//                   ml: 'auto',
//                   maxWidth: 420,
//                   background: '#fff',
//                   p: 2,
//                   borderRadius: 2,
//                   border: `1px solid ${palette.border}`,
//                 }}
//               >
//                 <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
//                   <Typography>Tarpinė suma:</Typography>
//                   <Typography fontWeight={700}>
//                     {sumos.tarpineSuma} {currencySymbol}
//                   </Typography>
//                 </Box>

//                 {hasDiscount && (
//                   <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
//                     <Typography>Nuolaida:</Typography>
//                     <Typography fontWeight={700}>
//                       -{sumos.nuolaida} {currencySymbol}
//                     </Typography>
//                   </Box>
//                 )}

//                 {hasDelivery && (
//                   <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
//                     <Typography>Pristatymo mokestis:</Typography>
//                     <Typography fontWeight={700}>
//                       +{sumos.pristatymoMokestis} {currencySymbol}
//                     </Typography>
//                   </Box>
//                 )}

//                 <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, pt: 1, borderTop: '2px solid #333' }}>
//                   <Typography fontWeight={800}>BENDRA SUMA:</Typography>
//                   <Typography fontWeight={800} sx={{ color: palette.primary }}>
//                     {sumos.sumaBePvm} {currencySymbol}
//                   </Typography>
//                 </Box>
//               </Box>
//             )}
//           </Box>

//           {/* Download */}
//           <Box sx={{ textAlign: 'center', mt: 3 }}>
//             <PDFDownloadLink
//               document={<InvoicePDF data={invoiceData} logo={logo} sumos={sumos} />}
//               fileName={`saskaita-${invoiceData.saskaitosSerija}${invoiceData.saskaitosNumeris}.pdf`}
//               style={{ textDecoration: 'none' }}
//             >
//               {({ loading }) => (
//                 <Button variant="contained" size="large" startIcon={<DownloadIcon />} disabled={loading}>
//                   {loading ? 'Generuojama...' : 'Atsisiųsti PDF'}
//                 </Button>
//               )}
//             </PDFDownloadLink>
//           </Box>

//           {/* Ad Section */}
//           <AdSection onOpenVideo={() => setVideoOpen(true)} />
//         </Paper>
//       </Box>

//       {/* Video Modal */}
//       <Dialog
//         open={videoOpen}
//         onClose={() => setVideoOpen(false)}
//         maxWidth="md"
//         fullWidth
//         PaperProps={{
//           sx: { backgroundColor: 'transparent', boxShadow: 'none' },
//         }}
//       >
//         <DialogContent sx={{ p: 0, position: 'relative' }}>
//           <IconButton
//             onClick={() => setVideoOpen(false)}
//             sx={{
//               position: 'absolute',
//               top: -40,
//               right: 0,
//               color: '#fff',
//               '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
//             }}
//           >
//             <CloseIcon />
//           </IconButton>
//           <Box
//             component="iframe"
//             src="https://www.youtube.com/embed/ByViuilYxZA?autoplay=1"
//             title="DokSkenas demo"
//             allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
//             allowFullScreen
//             sx={{
//               width: '100%',
//               aspectRatio: '16/9',
//               border: 'none',
//               borderRadius: 2,
//             }}
//           />
//         </DialogContent>
//       </Dialog>

//       {/* Content Section */}
//       <InvoiceGeneratorInfo />
//     </>
//   );
// };

// // Content Component
// function InvoiceGeneratorInfo() {
//   return (
//     <Container maxWidth="md" sx={{ mt: 8, mb: 10 }}>
//       {/* Nemokamas sąskaitų išrašymas */}
//       <Typography
//         variant="h2"
//         sx={{
//           mt: 5,
//           mb: 2,
//           fontSize: { xs: '20px', sm: '26px' },
//           fontFamily: 'Helvetica',
//           fontWeight: 'bold',
//           color: '#000',
//         }}
//       >
//         Nemokamas sąskaitų išrašymas
//       </Typography>

//       <Box sx={{ lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
//         <Typography sx={{ mb: 2 }}>
//           Sugeneruokite profesionalią sąskaitą faktūrą vos keliais paspaudimais. Mūsų įrankis sukurtas tiems,
//           kuriems reikia paprasto, greito ir nemokamo sąskaitų išrašymo.
//         </Typography>
//         <Typography sx={{ mb: 2 }}>
//           Tiesiog suveskite reikiamus duomenis, įkelkite logotipą (jei reikia) ir spauskite generuoti PDF.
//           Jūsų sąskaita faktūra automatiškai susigeneruos ir parsisiųs į jūsų kompiuterį ar mobilųjį telefoną.
//         </Typography>
//       </Box>

//       {/* Kam skirtas įrankis? */}
//       <Typography
//         variant="h2"
//         sx={{
//           mt: 5,
//           mb: 2,
//           fontSize: { xs: '20px', sm: '26px' },
//           fontFamily: 'Helvetica',
//           fontWeight: 'bold',
//           color: '#000',
//         }}
//       >
//         Kam skirtas įrankis?
//       </Typography>

//       <Box sx={{ lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
//         <Typography sx={{ mb: 2 }}>
//           Mūsų online sąskaitos faktūros generatorius, tinka tiek individualiai dirbantiems asmenims, tiek mažoms
//           įmonėms, freelanceriams ir visiems, kuriems reikia greitai išrašyti tvarkingą PVM ar ne PVM sąskaitą.
//         </Typography>
//         <Typography sx={{ mb: 2 }}>
//           Pagrindinis privalumas – paprastumas: įrankis yra greitas, visiškai nemokamas ir generuoja profesionalų
//           PDF, kurį galite siųsti savo klientams.
//         </Typography>
//       </Box>

//       {/* Kaip tai veikia? */}
//       <Typography
//         variant="h2"
//         sx={{
//           mt: 5,
//           mb: 2,
//           fontSize: { xs: '20px', sm: '26px' },
//           fontFamily: 'Helvetica',
//           fontWeight: 'bold',
//           color: '#000',
//         }}
//       >
//         Kaip tai veikia?
//       </Typography>

//       <Box component="ul" sx={{ pl: 3, lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
//         <li>Užpildykite reikiamus laukus: pardavėją, pirkėją, sąskaitos duomenis, eilutes su prekėmis ar paslaugomis</li>
//         <li>Pridėkite savo logotipą (jei reikia)</li>
//         <li>Patikrinkite suvestą informaciją</li>
//         <li>Atsisiųskite sugeneruotą PDF sąskaitą faktūrą</li>
//       </Box>

//       {/* Sąskaitos faktūros šablono privalumai */}
//       <Typography
//         variant="h2"
//         sx={{
//           mt: 5,
//           mb: 2,
//           fontSize: { xs: '20px', sm: '26px' },
//           fontFamily: 'Helvetica',
//           fontWeight: 'bold',
//           color: '#000',
//         }}
//       >
//         Sąskaitos faktūros šablono privalumai
//       </Typography>

//       <Box component="ul" sx={{ pl: 3, lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
//         <li>Rinkitės tarp PVM ir ne PVM sąskaitos šablonų</li>
//         <li>Automatinis sumų ir PVM apskaičiavimas</li>
//         <li>Palaikymo daugiau nei 30 valiutų</li>
//         <li>Galimybė pridėti savo logotipą</li>
//         <li>Automatiškai generuoja sumą žodžiais lietuvių kalba</li>
//         <li>Puikiai tinka Lietuvos įmonėms, mažosioms bendrijoms ir individualioms veikloms</li>
//       </Box>

//       {/* Derinkite su DokSkenu */}
//       <Typography
//         variant="h2"
//         sx={{
//           mt: 5,
//           mb: 2,
//           fontSize: { xs: '20px', sm: '26px' },
//           fontFamily: 'Helvetica',
//           fontWeight: 'bold',
//           color: '#000',
//         }}
//       >
//         Derinkite su DokSkenu
//       </Typography>

//       <Box sx={{ lineHeight: 1.7, fontSize: '16px', fontFamily: 'Helvetica', color: '#000', mb: 4 }}>
//         <Typography sx={{ mb: 2 }}>
//           Jei pavargote sąskaitas į apskaitos programą vesti ranka, išbandykite DokSkeną. Skaitmenizuoja sumiškai ir
//           detaliai su eilutėmis. Nuskaitytus duomenis galėsite importuoti į savo apskaitos programą.
//         </Typography>
//         <Typography sx={{ mb: 2 }}>
//           Integruojamos apskaitos programos:
//         </Typography>
//         <Box
//           sx={{
//             display: 'grid',
//             gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
//             gap: 0.5,
//             maxWidth: 500,
//             mb: 2,
//           }}
//         >
//           {[
//             { name: "Finvalda", href: 'https://atlyginimoskaiciuokle.com/finvalda' },
//             { name: "Rivilė GAMA", href: 'https://atlyginimoskaiciuokle.com/rivile' },
//             { name: "Rivilė ERP", href: 'https://atlyginimoskaiciuokle.com/rivile' },
//             { name: "Agnum", href: 'https://atlyginimoskaiciuokle.com/agnum' },
//             { name: "Centas", href: 'https://atlyginimoskaiciuokle.com/centas' },
//             { name: "Apskaita5", href: 'https://atlyginimoskaiciuokle.com/apskaita5' },
//             { name: "Pragma 3.2", href: 'https://atlyginimoskaiciuokle.com/pragma' },
//             { name: "Pragma 4", href: 'https://atlyginimoskaiciuokle.com/pragma' },
//             { name: "Būtenta", href: null },
//             { name: "Site.pro", href: 'https://atlyginimoskaiciuokle.com/site-pro' },
//             { name: "Debetas", href: 'https://atlyginimoskaiciuokle.com/debetas' },
//             { name: "APSA", href: 'https://atlyginimoskaiciuokle.com/apsa' },
//             { name: "Paulita", href: null },
//             { name: "Optimum", href: null },
//             { name: "Dineta", href: null },
//             { name: "iSAF", href: null },
//           ].map((item) => (
//             <Box key={item.name} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.3 }}>
//               <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#333', flexShrink: 0 }} />
//               {item.href ? (
//                 <a
//                   href={item.href}
//                   target="_blank"
//                   rel="noopener noreferrer"
//                   style={{
//                     color: '#003366',
//                     fontSize: '15px',
//                     fontFamily: 'Helvetica',
//                     fontWeight: 600,
//                     textDecoration: 'none',
//                   }}
//                 >
//                   {item.name}
//                 </a>
//               ) : (
//                 <Typography sx={{ color: '#000', fontSize: '15px', fontFamily: 'Helvetica' }}>
//                   {item.name}
//                 </Typography>
//               )}
//             </Box>
//           ))}
//         </Box>
//       </Box>

//       {/* CTA Button */}
//       <Box sx={{ textAlign: 'center', mt: 5 }}>
//         <Button
//           variant="contained"
//           size="large"
//           href={`${import.meta.env.VITE_BASE_URL}registruotis`}
//           sx={{
//             backgroundColor: '#F4B400',
//             color: '#000',
//             fontWeight: '500',
//             fontSize: '16px',
//             px: 4,
//             py: 1.5,
//             textTransform: 'uppercase',
//             '&:hover': {
//               backgroundColor: '#E5A700',
//             },
//           }}
//         >
//           Išbandyti nemokamai
//         </Button>
//       </Box>
//     </Container>
//   );
// }

// export default InvoiceGenerator;

