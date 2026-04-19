import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Box, Typography, Button, Stack, Modal, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import { keyframes } from '@mui/system';
import StarIcon from '@mui/icons-material/Star';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
// Ikonki dlja sekcii "Ką moka DokSkenas?"
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import InventoryIcon from '@mui/icons-material/Inventory2';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DomainVerificationIcon from '@mui/icons-material/DomainVerification';
import PublicIcon from '@mui/icons-material/Public';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import DynamicFeedIcon from '@mui/icons-material/DynamicFeed';
import GppGoodIcon from '@mui/icons-material/GppGood';
import CalculateIcon from '@mui/icons-material/Calculate';
import SellIcon from '@mui/icons-material/Sell';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import { useLocation } from 'react-router-dom';

import { track } from '../metaPixel';

// ===== Accent =====
const ACCENT = '#ff5b2e';

// ===== Animations =====
const scanLine = keyframes`
  0%, 100% { top: 30px; opacity: 0; }
  15% { opacity: 1; }
  50% { top: calc(100% - 30px); opacity: 1; }
  85% { opacity: 1; }
`;

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: none; }
`;

const pulseDot = keyframes`
  0%, 100% { box-shadow: 0 0 0 3px rgba(255, 91, 46, 0.22); }
  50% { box-shadow: 0 0 0 6px rgba(255, 91, 46, 0.1); }
`;

const underlineIn = keyframes`
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
`;

const marqueeScroll = keyframes`
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
`;

const faqList = [
  { question: "Kiek trunka vieno dokumento skaitmeninimas?", answer: "Vidutiniškai apie 30 sekundžių." },
  { question: "Kokius dokumentų tipus galima įkelti?", answer: "DokSkenas priima beveik visus dokumentų ir archyvų failus, tokius kaip: PDF, PNG, JPG/JPEG, Heic, WebP, HTML, ZIP, RAR ir kitų formatų failus. Taip pat galite siųsti Word ir Excel formatais. Dokumentai gali būti nuskenuoti arba nufotografuoti." },
  { question: "Ar DokSkenas atpažįsta užsienio kalbomis išrašytas sąskaitas faktūras?", answer: "Taip." },
  { question: "Kaip sistema užtikrina duomenų saugumą?", answer: "Visi jūsų duomenys yra saugomi saugiuose serveriuose ir šifruojami tiek perdavimo, tiek saugojimo metu. Dokumentų atpažinimui naudojame patikimų partnerių (pvz., Google ir OpenAI) debesų paslaugas, kurios taip pat atitinka aukščiausius saugumo standartus. Apdorojimo metu jūsų informacija nėra perduodama trečiosioms šalims reklamos ar kitiems tikslams. Naudojame tik tiek duomenų, kiek būtina dokumentų skaitmenizavimui, ir laikomės visų ES duomenų apsaugos (GDPR) reikalavimų." },
  { question: "Kaip vyksta atsiskaitymas – ar reikia prenumeratos?", answer: "Po registracijos gausite 50 nemokamų kreditų, kuriuos galėsite panaudoti dokumentų skaitmenizavimui. Kai kreditai baigsis, suvestinėje pamatysite pranešimą su nuoroda į apmokėjimo puslapį, kur galėsite įsigyti daugiau kreditų. 1 dokumentas = 1 kreditas, arba 1,3 kredito, jei skaitmenizuojate kiekybiškai su eilutėmis." },
  { question: "Ar galiu išbandyti paslaugą nemokamai?", answer: "Taip, po registracijos gausite 50 nemokamų kreditų, kuriuos galėsite panaudoti dokumentų skaitmenizavimui." },
  {
    question: "Ar galima integruoti su mano buhalterine programa?",
    answerIntro: "Šiuo metu turime integracijas su šiomis programomis:",
    programs: ["Rivilė GAMA","Rivilė ERP","Centas","Finvalda","Agnum","Optimum","Dineta","Apskaita5","Pragma 3.2","Pragma 4","Būtenta","Site.pro (B1)","Debetas","APSA","Paulita","iSAF"],
    answerOutro: "Po skaitmenizavimo galėsite eksportuoti duomenis į pasirinktą programą. Atsisiųstus failus iš DokSkeno tereikės importuoti į buhalterinę programą."
  },
  { question: "Ar sistema aptinka dublikatus ir netinkamus dokumentus?", answer: "Taip. Už dublikatus ir netinkamus dokumentus mokėti nereikės." },
  { question: "Ar gali būti keli dokumentai viename faile?", answer: "Ne. Viename faile turi būti vienas dokumentas, tačiau jis gali turėti kelis lapus." },
  { question: "Kiek kainuoja paslauga?", answer: "0,18 EUR už dokumentą, jei skaitmenizuojate sumiškai.\n0,23 EUR už dokumentą, jei skaitmenizuojate kiekybiškai su eilutėmis." },
  { question: "Kas atsitinka su dokumentais po apdorojimo?", answer: "Po sėkmingo skaitmenizavimo dokumentų failai saugomi mūsų archyve 18 mėnesių." },
];

function FaqSection() {
  const [expanded, setExpanded] = useState(0);
  const handleChange = (panel) => (event, isExpanded) => setExpanded(isExpanded ? panel : false);
  return (
    <Box
      id="duk"
      sx={{
        maxWidth: '920px',
        margin: '0 auto',
        paddingX: { xs: 2, md: 2 },
        paddingTop: { xs: '70px', md: '110px' },
        paddingBottom: { xs: '60px', md: '120px' },
        scrollMarginTop: { xs: '80px', md: '100px' },
      }}
    >
      {/* Section header */}
      <Box sx={{ textAlign: 'center', marginBottom: { xs: 5, md: 7 } }}>
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
          DUK
        </Typography>
        <Typography
          variant="h2"
          sx={{
            fontFamily: '"Fraunces", Georgia, serif',
            fontSize: { xs: '38px', sm: '54px', md: '64px' },
            fontWeight: 400,
            lineHeight: 1.02,
            letterSpacing: '-0.03em',
            color: '#1b1b1b',
            marginBottom: 2,
          }}
        >
          Dažniausiai užduodami{' '}
          <Box
            component="span"
            sx={{ fontStyle: 'italic', fontWeight: 300, color: ACCENT }}
          >
            klausimai.
          </Box>
        </Typography>
        <Typography
          sx={{
            fontFamily: 'Helvetica',
            fontSize: { xs: '16px', md: '18px' },
            color: '#6b6660',
            lineHeight: 1.55,
          }}
        >
          Neradote atsakymo? Susisiekite su mumis.
        </Typography>
      </Box>

      {/* Accordions */}
      <Box>
        {faqList.map((item, idx) => {
          const isOpen = expanded === idx;
          return (
            <Accordion
              key={idx}
              expanded={isOpen}
              onChange={handleChange(idx)}
              disableGutters
              elevation={0}
              sx={{
                mb: 1.5,
                borderRadius: '16px !important',
                background: '#fffdf8',
                border: isOpen
                  ? `1px solid ${ACCENT}55`
                  : '1px solid rgba(0,0,0,0.08)',
                boxShadow: isOpen
                  ? `0 24px 50px -30px rgba(17,17,17,0.15), 0 0 0 1px ${ACCENT}25`
                  : 'none',
                overflow: 'hidden',
                transition: 'all 0.3s cubic-bezier(.2,.7,.2,1)',
                '&:before': { display: 'none' },
                '&.Mui-expanded': { margin: '0 0 12px 0' },
              }}
            >
              <AccordionSummary
                expandIcon={
                  <Box
                    sx={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      background: isOpen ? ACCENT : 'rgba(0,0,0,0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.3s ease',
                      flexShrink: 0,
                    }}
                  >
                    <ExpandMoreIcon
                      sx={{
                        color: isOpen ? '#fff' : '#1b1b1b',
                        fontSize: 22,
                        transition: 'color 0.3s ease',
                      }}
                    />
                  </Box>
                }
                sx={{
                  padding: { xs: '8px 20px', md: '10px 28px' },
                  minHeight: { xs: 68, md: 76 },
                  '& .MuiAccordionSummary-content': {
                    margin: '18px 0',
                  },
                  '& .MuiAccordionSummary-expandIconWrapper': {
                    transform: 'none !important',
                  },
                }}
              >
                <Typography
                  sx={{
                    fontFamily: '"Fraunces", Georgia, serif',
                    fontSize: { xs: '18px', md: '21px' },
                    fontWeight: 500,
                    color: '#1b1b1b',
                    letterSpacing: '-0.01em',
                    lineHeight: 1.25,
                    paddingRight: 2,
                  }}
                >
                  {item.question}
                </Typography>
              </AccordionSummary>
              <AccordionDetails
                sx={{
                  padding: { xs: '0 20px 24px 20px', md: '0 28px 30px 28px' },
                  fontFamily: 'Helvetica',
                  fontSize: { xs: '15px', md: '16px' },
                  color: '#4a4640',
                  lineHeight: 1.65,
                  '& ul': {
                    paddingLeft: '0',
                    margin: '12px 0 4px 0',
                    listStyle: 'none',
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: '8px 20px',
                  },
                  '& li': {
                    position: 'relative',
                    paddingLeft: '18px',
                    color: '#2a2824',
                  },
                  '& li::before': {
                    content: '"→"',
                    position: 'absolute',
                    left: 0,
                    color: ACCENT,
                    fontFamily: '"Fraunces", Georgia, serif',
                    fontWeight: 500,
                  },
                  '& p': { margin: '0 0 10px 0' },
                  '& p:last-child': { margin: 0 },
                }}
              >
                {item.programs ? (
                  <>
                    {item.answerIntro && <p>{item.answerIntro}</p>}
                    <ul>
                      {item.programs.map((program, i) => (
                        <li key={i}>{program}</li>
                      ))}
                    </ul>
                    {item.answerOutro && (
                      <p style={{ marginTop: '14px' }}>{item.answerOutro}</p>
                    )}
                  </>
                ) : (
                  (() => {
                    const text = item.answer || '';
                    const lines = text.split('\n');
                    const hasBullets = lines.some((l) => l.trim().startsWith('-'));
                    if (hasBullets) {
                      const intro = [], bullets = [], outro = [];
                      let phase = 'intro';
                      for (const l of lines) {
                        const trimmed = l.trim();
                        if (trimmed.startsWith('-')) {
                          phase = 'bullets';
                          bullets.push(trimmed.replace(/^-+\s*/, ''));
                        } else {
                          if (phase === 'intro') intro.push(trimmed);
                          else if (phase === 'bullets') {
                            if (trimmed) { phase = 'outro'; outro.push(trimmed); }
                          } else {
                            if (trimmed) outro.push(trimmed);
                          }
                        }
                      }
                      return (
                        <>
                          {intro.length > 0 && <p>{intro.join(' ')}</p>}
                          <ul>{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
                          {outro.length > 0 && <p>{outro.join(' ')}</p>}
                        </>
                      );
                    }
                    return lines.map((chunk, i) =>
                      chunk.trim() ? <p key={i}>{chunk}</p> : null
                    );
                  })()
                )}
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>
    </Box>
  );
}

function getYoutubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if (u.pathname.startsWith('/embed/')) return u.pathname.split('/embed/')[1].split('/')[0];
    const v = u.searchParams.get('v');
    if (v) return v;
  } catch {}
  return url;
}

function useScrollToHash() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.replace('#', ''));
    let tries = 0;
    const maxTries = 20;
    const interval = 100;
    const tick = () => {
      const el = document.getElementById(id) || document.querySelector(hash);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (tries < maxTries) { tries += 1; setTimeout(tick, interval); }
    };
    setTimeout(tick, 0);
  }, [hash]);
}

const Dokskenas = () => {
  const [open, setOpen] = useState(false);
  const [tracked, setTracked] = useState(false);
  useScrollToHash();

  const YT_EMBED_URL = "https://www.youtube.com/embed/ByViuilYxZA";
  const VIDEO_TITLE = "DokSkenas demo";

  const sendViewContent = () => {
    if (!window.fbq || tracked) return;
    const videoId = getYoutubeId(YT_EMBED_URL);
    track('ViewContent', { content_ids: [videoId], content_name: VIDEO_TITLE, content_type: 'video' });
    setTracked(true);
  };

  const handleOpen = () => { setOpen(true); sendViewContent(); };
  const handleClose = () => setOpen(false);

  useEffect(() => {
    const checkHash = () => { if (window.location.hash === "#demo") { setOpen(true); sendViewContent(); } };
    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box sx={{ bgcolor: '#F9F9FA', minHeight: '100vh', padding: { xs: 2, sm: 5 }, paddingTop: { xs: '12px', sm: '20px' }, width: '100%' }}>
      <Helmet>
        <title>Sąskaitų skaitmenizavimas su DI - DokSkenas</title>
        <meta name="description" content="Automatizuokite savo apskaitą su DI bei sutaupykite krūvą laiko. Išbandykit DokSkeną dabar!" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,300;1,9..144,400;1,9..144,500&display=swap"
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
            Nuskaito per 30 sekundžių
          </Box>

          {/* H1 - Fraunces serif with italic orange underlined accent word */}
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
              skaitmenizavimas
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
            Automatizuokite apskaitą su{' '}
            <Box
              component="span"
              sx={{
                fontStyle: 'italic',
                fontWeight: 300,
                color: ACCENT,
              }}
            >
              DI
            </Box>
          </Typography>

          {/* Description */}
          <Typography sx={{ fontSize: '18px', fontFamily: 'Helvetica', color: '#2a2824', lineHeight: 1.55, marginBottom: 1, maxWidth: '52ch' }}>
            Sutaupykite krūvą laiko bei išvenkite žmogiškojo faktoriaus klaidų.
          </Typography>
          <Typography sx={{ fontSize: '18px', fontFamily: 'Helvetica', color: '#2a2824', lineHeight: 1.55, marginBottom: 4, maxWidth: '52ch' }}>
            Leiskite dirbtiniam intelektui atlikti nuobodų apskaitininko darbą.
          </Typography>

          {/* CTAs */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
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
                '&:hover': { backgroundColor: '#e04a20', boxShadow: 'none' },
              }}
            >
              Išbandyti nemokamai →
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={handleOpen}
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

          {/* Microcopy */}
          <Typography sx={{ fontSize: '13px', fontFamily: 'Helvetica', color: '#6b6660', marginTop: 2 }}>
            Pirmi 50 skaitmenizavimų - nemokamai
          </Typography>

          {/* Rating */}
          <Stack direction="row" alignItems="center" spacing={1} sx={{ marginTop: 3 }}>
            <Stack direction="row" spacing={0.01}>
              {[...Array(5)].map((_, index) => (<StarIcon key={index} sx={{ color: '#f5cf54', fontSize: '20px' }} />))}
            </Stack>
            <Typography variant="body2" sx={{ fontFamily: 'Helvetica', color: '#2a2824' }}>
              Daugiau nei 500 įmonių naudojasi DokSkenu kasdien
            </Typography>
          </Stack>
        </Box>

        {/* ---- RIGHT: two demo cards ---- */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            animation: `${fadeUp} 0.9s cubic-bezier(.2,.7,.2,1) 0.25s both`,
          }}
        >
          {/* ----- Receipt (notebook style) with red/orange scan ----- */}
          <Box
            sx={{
              background: '#fffdf8',
              borderRadius: '18px',
              padding: '32px 30px',
              border: '1px solid rgba(0,0,0,0.08)',
              boxShadow: '0 30px 80px -30px rgba(17,17,17,0.25), inset 0 2px 0 rgba(255,255,255,0.6)',
              position: 'relative',
              transform: { md: 'rotate(-1.2deg)' },
              fontFamily: '"Courier New", monospace',
              fontSize: '13px',
              color: '#2a2824',
              overflow: 'hidden',
            }}
          >
            {/* Top perforated edge */}
            <Box sx={{
              position: 'absolute', left: 0, right: 0, top: '-6px', height: '10px',
              background: 'repeating-linear-gradient(90deg, #fffdf8 0 10px, transparent 10px 14px)',
            }} />
            {/* Bottom perforated edge */}
            <Box sx={{
              position: 'absolute', left: 0, right: 0, bottom: '-6px', height: '10px',
              background: 'repeating-linear-gradient(90deg, #fffdf8 0 10px, transparent 10px 14px)',
            }} />

            {/* Scan line */}
            <Box
              sx={{
                position: 'absolute',
                left: '14px',
                right: '14px',
                height: '2px',
                background: ACCENT,
                boxShadow: `0 0 20px 3px ${ACCENT}80`,
                borderRadius: '2px',
                top: '30px',
                animation: `${scanLine} 3.2s ease-in-out infinite`,
                zIndex: 2,
              }}
            />

            {/* Header */}
            <Typography sx={{
              fontFamily: '"Fraunces", Georgia, serif',
              fontSize: '22px',
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: '#1b1b1b',
              marginBottom: '4px',
            }}>
              Testinė įmonė, UAB
            </Typography>
            <Typography sx={{
              fontFamily: 'Helvetica',
              fontSize: '11px',
              color: '#6b6660',
              marginBottom: '18px',
            }}>
              2026-04-12 · SF Nr. RRN-0412
            </Typography>

            {/* Rows */}
            {[
              ['Konsultacijos, 2 val.', '80,00 €'],
              ['Mėnesio ataskaita', '120,00 €'],
              ['Dokumentų tvarkymas', '45,00 €'],
              ['Transportavimas', '30,00 €'],
              ['PVM 21%', '57,75 €'],
            ].map(([name, sum], i) => (
              <Box key={i} sx={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: i < 4 ? '1px dashed rgba(0,0,0,0.14)' : 'none',
              }}>
                <span>{name}</span><span>{sum}</span>
              </Box>
            ))}

            {/* Total */}
            <Box sx={{
              display: 'flex', justifyContent: 'space-between',
              marginTop: '14px', paddingTop: '14px',
              borderTop: '2px solid #1b1b1b',
              fontFamily: '"Fraunces", Georgia, serif',
              fontSize: '19px', fontWeight: 500, color: '#1b1b1b',
            }}>
              <span>VISO</span><span>332,75 €</span>
            </Box>
          </Box>

          {/* ----- Dark "Atpažinti duomenys" card ----- */}
          <Box
            sx={{
              background: '#1b1b1b',
              color: '#F9F9FA',
              borderRadius: '18px',
              padding: '28px 30px',
              boxShadow: '0 30px 80px -30px rgba(17,17,17,0.35)',
              transform: { md: 'rotate(0.8deg)' },
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
            }}
          >
            <Box>
              <Typography sx={{
                fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase',
                color: ACCENT, marginBottom: 0.5, fontFamily: 'Helvetica', fontWeight: 600,
              }}>
                Atpažinti duomenys
              </Typography>
              <Typography sx={{
                fontFamily: 'Helvetica',
                fontSize: '24px',
                fontWeight: 700,
                letterSpacing: '-0.01em',
                color: '#fff',
              }}>
                PVM sąskaita faktūra
              </Typography>
            </Box>

            {[
              ['Pardavėjas', 'Testinė įmonė, UAB'],
              ['Įmonės kodas', '302345678'],
              ['PVM kodas', 'LT100004567891'],
              ['SF numeris', 'RRN-0412'],
              ['Data', '2026-04-12'],
              ['Atpažintos eilutės', '4 paslaugos'],
              ['Suma be PVM', '275,00 €'],
              ['PVM 21%', '57,75 €'],
              ['Suma su PVM', '332,75 €'],
            ].map(([k, v], i) => (
              <Box key={i} sx={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2,
                padding: '8px 0',
                borderBottom: i < 8 ? '1px solid rgba(255,255,255,0.08)' : 'none',
              }}>
                <Typography sx={{
                  fontFamily: 'Helvetica', fontSize: '10.5px', textTransform: 'uppercase',
                  letterSpacing: '0.06em', color: 'rgba(255,255,255,0.5)',
                }}>{k}</Typography>
                <Typography sx={{
                  fontFamily: '"Fraunces", Georgia, serif',
                  fontSize: '15px', fontWeight: 400, color: '#fff',
                }}>{v}</Typography>
              </Box>
            ))}

            <Box sx={{
              marginTop: 1,
              display: 'flex', alignItems: 'center', gap: 1.2,
              padding: '12px 14px',
              background: `${ACCENT}26`,
              border: `1px solid ${ACCENT}80`,
              borderRadius: '10px',
              fontFamily: 'Helvetica', fontSize: '13px', color: '#F9F9FA',
            }}>
              <CheckCircleIcon sx={{ color: ACCENT, fontSize: '18px' }} />
              Paruošta eksportui į buhalteriją
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Video Modal */}
      <Modal open={open} onClose={handleClose} disableScrollLock aria-labelledby="modal-title" aria-describedby="modal-description">
        <Box sx={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          bgcolor: '#1B1B1B', boxShadow: 24, p: 2, borderRadius: 2, maxWidth: '800px', width: '90%', outline: 'none',
        }}>
          <Box
            component="iframe"
            src={YT_EMBED_URL}
            title={VIDEO_TITLE}
            width="100%"
            height="600px"
            sx={{ border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </Box>
      </Modal>

      {/* ========= END HERO ========= */}

      {/* === Ostalnye sekcii (Kaip tai veikia, Ką DokSkenas moka, Kaina, Integracijos, CTA) ostavit bez izmeneniy iz originala === */}

      {/* ===== Integracijos marquee (pered DUK) ===== */}
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
          Integruojasi su 16 apskaitos programų
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
            // duplicate list for seamless loop
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

      {/* ===== Ką moka DokSkenas? ===== */}
      <Box
        id="ka-moka"
        sx={{
          maxWidth: '1280px',
          margin: '0 auto',
          paddingX: { xs: 2, md: 2 },
          paddingTop: { xs: '70px', md: '110px' },
          paddingBottom: { xs: '30px', md: '50px' },
          scrollMarginTop: { xs: '80px', md: '100px' },
        }}
      >
        {/* Section header */}
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
            Ką moka{' '}
            <Box
              component="span"
              sx={{
                fontStyle: 'italic',
                fontWeight: 300,
                color: ACCENT,
              }}
            >
              DokSkenas?
            </Box>
          </Typography>
          <Typography
            sx={{
              fontFamily: 'Helvetica',
              fontSize: { xs: '16px', md: '18px' },
              color: '#6b6660',
              maxWidth: '58ch',
              margin: '0 auto',
              lineHeight: 1.55,
            }}
          >
            Sumanios funkcijos, kurios paverčia sąskaitų skaitmenizavimą į
            visiškai automatinį procesą.
          </Typography>
        </Box>

        {/* Features grid */}
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
              Icon: FormatListNumberedIcon,
              title: 'Sumiškai ir kiekybiškai',
              desc: 'Skaitmenizuoja tiek bendromis sumomis, tiek kiekybiškai su atskiromis eilutėmis.',
            },
            {
              Icon: InventoryIcon,
              title: 'Prekės ir paslaugos',
              desc: 'Atpažįsta tiek prekių, tiek paslaugų pozicijas bei jų detales.',
            },
            {
              Icon: ContentCopyIcon,
              title: 'Dublikatų paieška',
              desc: 'Suranda dublikatus bei netinkamus dokumentus - už juos mokėti nereikės.',
            },
            {
              Icon: DomainVerificationIcon,
              title: 'Registrų Centras',
              desc: 'Įmonių rekvizitus automatiškai sutikrina su Registrų Centro duomenimis.',
            },
            {
              Icon: PublicIcon,
              title: 'ES ir užsienio dokumentai',
              desc: 'Nuskaito ir lietuviškus, ir ES bei kitų užsienio šalių dokumentus.',
            },
            {
              Icon: FileDownloadIcon,
              title: 'Importo failai',
              desc: 'Paruošia duomenų failus tiesiogiai importuoti į jūsų apskaitos programą.',
            },
            {
              Icon: DynamicFeedIcon,
              title: 'Masinis apdorojimas',
              desc: 'Vienu metu gali apdoroti tūkstančius dokumentų - be eilių, be laukimo.',
            },
            {
              Icon: GppGoodIcon,
              title: 'PVM kodo patikra',
              desc: 'Automatiškai patikrina, ar PVM mokėtojo kodas yra galiojantis.',
            },
            {
              Icon: CalculateIcon,
              title: 'Sumų sutikrinimas',
              desc: 'Sutikrina, ar sutampa visos sumos dokumente, ir pataiso jei reikia.',
            },
            {
              Icon: SellIcon,
              title: 'PVM klasifikatorius',
              desc: 'Automatiškai priskiria tinkamą PVM klasifikatorių kiekvienai pozicijai.',
            },
            {
              Icon: MarkEmailReadIcon,
              title: 'El. pašto priėmimas',
              desc: 'Priima dokumentus, atsiųstus tiesiai į jūsų DokSkeno el. pašto adresą.',
            },
            {
              Icon: CloudSyncIcon,
              title: 'Google Drive ir Dropbox',
              desc: 'Pats pasiima dokumentus iš jūsų Google Drive arba Dropbox aplankų.',
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
              {/* top row: icon + number */}
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
                  <Icon sx={{ fontSize: 26, color: ACCENT, transition: 'color 0.3s ease' }} />
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

              {/* title */}
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

              {/* description */}
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

      {/* ===== Palyginimas ===== */}
      <Box
        id="palyginimas"
        sx={{
          maxWidth: '1280px',
          margin: '0 auto',
          paddingX: { xs: 2, md: 2 },
          paddingTop: { xs: '70px', md: '110px' },
          paddingBottom: { xs: '30px', md: '50px' },
          scrollMarginTop: { xs: '80px', md: '100px' },
        }}
      >
        {/* Section header */}
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
            Palyginimas
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
            Skirtumas, kurį pajusite{' '}
            <Box
              component="span"
              sx={{
                fontStyle: 'italic',
                fontWeight: 300,
                color: ACCENT,
              }}
            >
              nuo pirmos dienos.
            </Box>
          </Typography>
          <Typography
            sx={{
              fontFamily: 'Helvetica',
              fontSize: { xs: '16px', md: '18px' },
              color: '#6b6660',
              maxWidth: '58ch',
              margin: '0 auto',
              lineHeight: 1.55,
            }}
          >
            Tas pats darbas - du visiškai skirtingi keliai.
          </Typography>
        </Box>

        {/* Two comparison cards */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: { xs: 3, md: 4 },
            alignItems: 'stretch',
          }}
        >
          {/* ---- LEFT: Manual accounting ---- */}
          <Box
            sx={{
              background: '#ece7de',
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: '22px',
              padding: { xs: '36px 28px', md: '48px 42px' },
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              overflow: 'hidden',
              // subtle diagonal "tired" texture
              '&::before': {
                content: '""',
                position: 'absolute',
                inset: 0,
                backgroundImage:
                  'repeating-linear-gradient(45deg, rgba(0,0,0,0.015) 0 2px, transparent 2px 14px)',
                pointerEvents: 'none',
              },
            }}
          >
            <Typography
              sx={{
                fontSize: '11px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: '#a8a093',
                fontFamily: 'Helvetica',
                fontWeight: 600,
                marginBottom: 1.5,
              }}
            >
              Be DokSkeno
            </Typography>
            <Typography
              sx={{
                fontFamily: '"Fraunces", Georgia, serif',
                fontSize: { xs: '30px', md: '38px' },
                fontWeight: 400,
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
                color: '#6b6660',
                marginBottom: 1,
                fontStyle: 'italic',
              }}
            >
              Apskaita rankiniu būdu
            </Typography>

            {/* big stat */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 1.5,
                marginTop: 3,
                marginBottom: 3,
                paddingBottom: 3,
                borderBottom: '1px dashed rgba(0,0,0,0.15)',
              }}
            >
              <Typography
                sx={{
                  fontFamily: '"Fraunces", Georgia, serif',
                  fontSize: { xs: '72px', md: '92px' },
                  fontWeight: 300,
                  lineHeight: 0.9,
                  letterSpacing: '-0.04em',
                  color: '#8a847a',
                }}
              >
                42h
              </Typography>
              <Typography
                sx={{
                  fontFamily: 'Helvetica',
                  fontSize: '14px',
                  color: '#8a847a',
                  lineHeight: 1.4,
                  maxWidth: '18ch',
                }}
              >
                darbo valandų<br />500-ams sąskaitų
              </Typography>
            </Box>

            {/* Bullets */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                '500 sąskaitų įvedama per 42 valandas darbo',
                'Reikia atskiro žmogaus',
                '12% klaidų tikimybė',
                'Nuobodus ir varginantis darbas',
              ].map((item, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <HighlightOffIcon
                    sx={{
                      color: '#a8a093',
                      fontSize: 22,
                      flexShrink: 0,
                      marginTop: '1px',
                    }}
                  />
                  <Typography
                    sx={{
                      fontFamily: 'Helvetica',
                      fontSize: { xs: '15px', md: '16px' },
                      color: '#6b6660',
                      lineHeight: 1.5,
                      textDecoration: 'line-through',
                      textDecorationColor: 'rgba(107, 102, 96, 0.35)',
                    }}
                  >
                    {item}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {/* ---- RIGHT: DokSkenas ---- */}
          <Box
            sx={{
              background: '#1b1b1b',
              borderRadius: '22px',
              padding: { xs: '36px 28px', md: '48px 42px' },
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: `0 40px 80px -40px rgba(17,17,17,0.4), 0 0 0 1px ${ACCENT}25`,
              // soft orange glow top
              '&::before': {
                content: '""',
                position: 'absolute',
                inset: 0,
                background: `radial-gradient(ellipse at top right, ${ACCENT}22, transparent 55%)`,
                pointerEvents: 'none',
              },
            }}
          >
            <Box sx={{ position: 'relative' }}>
              <Typography
                sx={{
                  fontSize: '11px',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: ACCENT,
                  fontFamily: 'Helvetica',
                  fontWeight: 600,
                  marginBottom: 1.5,
                }}
              >
                Su DokSkenu
              </Typography>
              <Typography
                sx={{
                  fontFamily: '"Fraunces", Georgia, serif',
                  fontSize: { xs: '30px', md: '38px' },
                  fontWeight: 400,
                  lineHeight: 1.05,
                  letterSpacing: '-0.02em',
                  color: '#fff',
                  marginBottom: 1,
                }}
              >
                Apskaita su <Box component="span" sx={{ fontStyle: 'italic', color: ACCENT }}>DokSkenu</Box>
              </Typography>

              {/* big stat */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 1.5,
                  marginTop: 3,
                  marginBottom: 3,
                  paddingBottom: 3,
                  borderBottom: '1px dashed rgba(255,255,255,0.18)',
                }}
              >
                <Typography
                  sx={{
                    fontFamily: '"Fraunces", Georgia, serif',
                    fontSize: { xs: '72px', md: '92px' },
                    fontWeight: 300,
                    lineHeight: 0.9,
                    letterSpacing: '-0.04em',
                    color: ACCENT,
                  }}
                >
                  &lt;1h
                </Typography>
                <Typography
                  sx={{
                    fontFamily: 'Helvetica',
                    fontSize: '14px',
                    color: 'rgba(255,255,255,0.65)',
                    lineHeight: 1.4,
                    maxWidth: '20ch',
                  }}
                >
                  tai pačiai krūvai -<br />kol jūs geriate kavą
                </Typography>
              </Box>

              {/* Bullets */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {[
                  '500 sąskaitų skaitmenizuoja per mažiau nei 1 valandą',
                  'Nereikia atskiro žmogaus',
                  '0,2% klaidų tikimybė - sumos sutikrinamos ir pataisomos',
                  'Pati suranda klaidas dokumentuose',
                  'Šiuolaikiškas apskaitos vedimo būdas',
                ].map((item, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <CheckCircleIcon
                      sx={{
                        color: ACCENT,
                        fontSize: 22,
                        flexShrink: 0,
                        marginTop: '1px',
                      }}
                    />
                    <Typography
                      sx={{
                        fontFamily: 'Helvetica',
                        fontSize: { xs: '15px', md: '16px' },
                        color: '#fff',
                        lineHeight: 1.5,
                        fontWeight: 400,
                      }}
                    >
                      {item}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ===== Kainos ===== */}
      <Box
        id="kainos"
        sx={{
          maxWidth: '1280px',
          margin: '0 auto',
          paddingX: { xs: 2, md: 2 },
          paddingTop: { xs: '70px', md: '110px' },
          paddingBottom: { xs: '30px', md: '50px' },
          scrollMarginTop: { xs: '80px', md: '100px' },
        }}
      >
        {/* Section header */}
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
            Kainos
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
            Paprastos kainos,{' '}
            <Box
              component="span"
              sx={{
                fontStyle: 'italic',
                fontWeight: 300,
                color: ACCENT,
              }}
            >
              be mėnesinio mokesčio.
            </Box>
          </Typography>
          <Typography
            sx={{
              fontFamily: 'Helvetica',
              fontSize: { xs: '16px', md: '18px' },
              color: '#6b6660',
              maxWidth: '58ch',
              margin: '0 auto',
              lineHeight: 1.55,
            }}
          >
            Mokate tik už tai, kiek įkeliate. Be prenumeratos, be pasalų, be smulkiojo šrifto.
          </Typography>
        </Box>

        {/* Pricing cards */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: { xs: 3, md: 4 },
            maxWidth: '920px',
            margin: '0 auto',
          }}
        >
          {[
            {
              tier: 'Sumiškai',
              price: '0,18',
              desc: 'Greitas skaitmenizavimas, kai vedama suminė apskaita.',
              features: [
                'Pirkėjo bei pardavėjo rekvizitai',
                'Datos, terminai, serija bei numeris',
                'Bendra suma ir PVM',
                'Eksportas į visas integruotas programas',
              ],
            },
            {
              tier: 'Kiekybiškai',
              price: '0,23',
              desc: 'Detalus skaitmenizavimas su visomis eilutėmis ir prekėmis.',
              features: [
                'Viskas, kas yra „Sumiškai"',
                'Visos prekių / paslaugų eilutės su pavadinimais',
                'Kiekiai, vienetai, kainos ir nuolaidos',
                'PVM klasifikatorius kiekvienai eilutei',
                'Tinka sąskaitoms su skirtingais PVM %'
              ],
              featured: true,
            },
          ].map((plan, idx) => (
            <Box
              key={idx}
              sx={{
                background: plan.featured ? '#1b1b1b' : '#fffdf8',
                color: plan.featured ? '#fff' : '#1b1b1b',
                border: plan.featured ? 'none' : '1px solid rgba(0,0,0,0.08)',
                borderRadius: '22px',
                padding: { xs: '36px 30px', md: '48px 42px' },
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: plan.featured
                  ? `0 40px 80px -40px rgba(17,17,17,0.4), 0 0 0 1px ${ACCENT}25`
                  : '0 20px 50px -30px rgba(17,17,17,0.12)',
                '&::before': plan.featured
                  ? {
                      content: '""',
                      position: 'absolute',
                      inset: 0,
                      background: `radial-gradient(ellipse at top right, ${ACCENT}22, transparent 55%)`,
                      pointerEvents: 'none',
                    }
                  : {},
              }}
            >
              {plan.featured && (
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
                  }}
                >
                  Detaliau
                </Box>
              )}

              <Box sx={{ position: 'relative' }}>
                <Typography
                  sx={{
                    fontSize: '11px',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: plan.featured ? ACCENT : '#6b6660',
                    fontFamily: 'Helvetica',
                    fontWeight: 600,
                    marginBottom: 1,
                  }}
                >
                  Skaitmenizavimas
                </Typography>
                <Typography
                  sx={{
                    fontFamily: '"Fraunces", Georgia, serif',
                    fontSize: { xs: '32px', md: '40px' },
                    fontWeight: 400,
                    fontStyle: 'italic',
                    lineHeight: 1,
                    letterSpacing: '-0.02em',
                    color: plan.featured ? '#fff' : '#1b1b1b',
                    marginBottom: 3,
                  }}
                >
                  {plan.tier}
                </Typography>

                {/* Price */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 1,
                    marginBottom: 1,
                  }}
                >
                  <Typography
                    sx={{
                      fontFamily: '"Fraunces", Georgia, serif',
                      fontSize: { xs: '72px', md: '88px' },
                      fontWeight: 300,
                      lineHeight: 0.9,
                      letterSpacing: '-0.04em',
                      color: plan.featured ? ACCENT : '#1b1b1b',
                    }}
                  >
                    {plan.price}
                  </Typography>
                  <Typography
                    sx={{
                      fontFamily: 'Helvetica',
                      fontSize: '20px',
                      fontWeight: 600,
                      color: plan.featured ? '#fff' : '#1b1b1b',
                    }}
                  >
                    €
                  </Typography>
                </Box>
                <Typography
                  sx={{
                    fontFamily: 'Helvetica',
                    fontSize: '14px',
                    color: plan.featured ? 'rgba(255,255,255,0.6)' : '#6b6660',
                    marginBottom: 3,
                    paddingBottom: 3,
                    borderBottom: plan.featured
                      ? '1px dashed rgba(255,255,255,0.18)'
                      : '1px dashed rgba(0,0,0,0.15)',
                  }}
                >
                  už vieną dokumentą
                </Typography>

                <Typography
                  sx={{
                    fontFamily: 'Helvetica',
                    fontSize: '15px',
                    color: plan.featured ? 'rgba(255,255,255,0.75)' : '#6b6660',
                    lineHeight: 1.55,
                    marginBottom: 3,
                  }}
                >
                  {plan.desc}
                </Typography>

                {/* Features */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {plan.features.map((f, i) => (
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
                      <Typography
                        sx={{
                          fontFamily: 'Helvetica',
                          fontSize: '15px',
                          color: plan.featured ? '#fff' : '#2a2824',
                          lineHeight: 1.5,
                        }}
                      >
                        {f}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          ))}
        </Box>

        {/* Free-trial banner */}
        <Box
          sx={{
            maxWidth: '920px',
            margin: { xs: '30px auto 0', md: '40px auto 0' },
            background: `${ACCENT}12`,
            border: `1px solid ${ACCENT}40`,
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
              Pirmieji <Box component="span" sx={{ fontStyle: 'italic', color: ACCENT }}>50 skaitmenizavimų</Box> - nemokami
            </Typography>
            <Typography
              sx={{
                fontFamily: 'Helvetica',
                fontSize: '14px',
                color: '#6b6660',
              }}
            >
              Už dublikatus ir netinkamus dokumentus taip pat nemokėsite.
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
              '&:hover': { backgroundColor: '#e04a20', boxShadow: 'none' },
            }}
          >
            Pradėti nemokamai →
          </Button>
        </Box>
      </Box>

      <FaqSection />

    </Box>
  );
};

export default Dokskenas;






// import { useState, useEffect } from 'react';
// import { Helmet } from 'react-helmet';
// import { Box, Typography, Button, Stack, Modal, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
// import StarIcon from '@mui/icons-material/Star';
// import PlayCircleIcon from '@mui/icons-material/PlayCircle';
// import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
// import { useLocation } from 'react-router-dom';

// // ✅ Meta Pixel
// import { track } from '../metaPixel'; // проверь путь: если файл рядом, поменяй на './metaPixel'

// const faqList = [
//   {
//     question: "Kiek trunka vieno dokumento skaitmeninimas?",
//     answer: "Vidutiniškai apie 30 sekundžių.",
//   },
//   {
//     question: "Kokius dokumentų tipus galima įkelti?",
//     answer: "DokSkenas priima PDF, PNG ir JPG/JPEG failus. Dokumentai gali būti nuskenuoti arba nufotografuoti.",
//   },
//   {
//     question: "Ar DokSkenas atpažįsta užsienio kalbomis išrašytas sąskaitas faktūras?",
//     answer: "Taip.",
//   },
//   {
//     question: "Kaip sistema užtikrina duomenų saugumą?",
//     answer: "Visi jūsų duomenys yra saugomi saugiuose serveriuose ir šifruojami tiek perdavimo, tiek saugojimo metu. Dokumentų atpažinimui naudojame patikimų partnerių (pvz., Google ir OpenAI) debesų paslaugas, kurios taip pat atitinka aukščiausius saugumo standartus. Apdorojimo metu jūsų informacija nėra perduodama trečiosioms šalims reklamos ar kitiems tikslams. Naudojame tik tiek duomenų, kiek būtina dokumentų skaitmenizavimui, ir laikomės visų ES duomenų apsaugos (GDPR) reikalavimų.",
//   },
//   {
//     question: "Kaip vyksta atsiskaitymas – ar reikia prenumeratos?",
//     answer: "Po registracijos gausite 50 nemokamų kreditų, kuriuos galėsite panaudoti dokumentų skaitmenizavimui. Kai kreditai baigsis, suvestinėje pamatysite pranešimą su nuoroda į apmokėjimo puslapį, kur galėsite įsigyti daugiau kreditų. 1 dokumentas = 1 kreditas, arba 1,3 kredito, jei skaitmenizuojate kiekybiškai su eilutėmis.",
//   },
//   {
//     question: "Ar galiu išbandyti paslaugą nemokamai?",
//     answer: "Taip, po registracijos gausite 50 nemokamų kreditų, kuriuos galėsite panaudoti dokumentų skaitmenizavimui.",
//   },
//   {
//     question: "Ar galima integruoti su mano buhalterine programa?",
//     answerIntro: "Šiuo metu turime integracijas su šiomis programomis:",
//     programs: [
//       "Rivilė GAMA",
//       "Rivilė ERP",
//       "Centas",
//       "Finvalda",
//       "Agnum",
//       "Optimum",
//       "Dineta",
//       "Apskaita5",
//       "Pragma 3.2",
//       "Pragma 4",
//       "Būtenta",
//       "Site.pro (B1)",
//       "Debetas",
//       "APSA",
//       "Paulita",
//       "iSAF"
//     ],
//     answerOutro: "Po skaitmenizavimo galėsite eksportuoti duomenis į pasirinktą programą. Atsisiųstus failus iš DokSkeno tereikės importuoti į buhalterinę programą."
//   },
//   {
//     question: "Ar sistema aptinka dublikatus ir netinkamus dokumentus?",
//     answer: "Taip. Už dublikatus ir netinkamus dokumentus mokėti nereikės.",
//   },
//   {
//     question: "Ar gali būti keli dokumentai viename faile?",
//     answer: "Ne. Viename faile turi būti vienas dokumentas, tačiau jis gali turėti kelis lapus.",
//   },
//   {
//     question: "Kiek kainuoja paslauga?",
//     answer: "0,18 EUR už dokumentą, jei skaitmenizuojate sumiškai.\n0,23 EUR už dokumentą, jei skaitmenizuojate kiekybiškai su eilutėmis.",
//   },
//   {
//     question: "Kas atsitinka su dokumentais po apdorojimo?",
//     answer: "Po sėkmingo skaitmenizavimo dokumentų failai saugomi mūsų archyve 18 mėnesių.",
//   },
// ];

// function FaqSection() {
//   const [expanded, setExpanded] = useState(0);

//   const handleChange = (panel) => (event, isExpanded) => {
//     setExpanded(isExpanded ? panel : false);
//   };

//   return (
//     <Box
//       sx={{
//         width: "100%",
//         maxWidth: 820,
//         margin: "80px auto",
//         padding: { xs: 1, md: 2 },
//         borderRadius: 4,
//       }}
//     >
//       <Typography
//         variant="h2"
//         sx={{
//           fontSize: "32px",
//           fontFamily: "Helvetica",
//           fontWeight: 600,
//           marginBottom: 3,
//           textAlign: "center",
//         }}
//       >
//         DUK
//       </Typography>
//       {faqList.map((item, idx) => (
//         <Accordion
//           key={idx}
//           expanded={expanded === idx}
//           onChange={handleChange(idx)}
//           sx={{
//             mb: 2,
//             borderRadius: 2,
//             background: "#fff",
//             boxShadow: "0px 2px 16px rgba(0,0,0,0.05)",
//             "&:before": { display: "none" },
//           }}
//         >
//           <AccordionSummary
//             expandIcon={<ExpandMoreIcon sx={{ color: "#f5cf54" }} />}
//             sx={{
//               fontWeight: 700,
//               fontFamily: "Helvetica",
//               fontSize: "18px",
//               color: "#1b1b1b",
//               background: "#e2e2e2",
//               borderRadius: 2,
//               minHeight: 56,
//             }}
//           >
//             {item.question}
//           </AccordionSummary>
//           <AccordionDetails
//             sx={{
//               fontFamily: "Helvetica",
//               fontSize: "17px",
//               color: "#333",
//               background: "#fff",
//               marginTop: "10px",
//               "& ul": { paddingLeft: "1.2rem", margin: "0.5rem 0" },
//               "& li": { marginBottom: "6px" },
//               "& p": { margin: "0 0 8px 0" },
//             }}
//           >
//             {/* Вариант с programs (intro + <ul> + outro) */}
//             {item.programs ? (
//               <>
//                 {item.answerIntro && <p>{item.answerIntro}</p>}
//                 <ul>
//                   {item.programs.map((program, i) => (
//                     <li key={i}>{program}</li>
//                   ))}
//                 </ul>
//                 {item.answerOutro && <p>{item.answerOutro}</p>}
//               </>
//             ) : (
//               // Универсальный рендер для answer-строки (поддерживает абзацы и "-", как список)
//               (() => {
//                 const text = item.answer || "";
//                 const lines = text.split("\n");

//                 // Если есть хотя бы одна строка, начинающаяся с "- ", рисуем список.
//                 const hasBullets = lines.some((l) => l.trim().startsWith("-"));

//                 if (hasBullets) {
//                   const intro = [];
//                   const bullets = [];
//                   const outro = [];

//                   let phase = "intro";
//                   for (const l of lines) {
//                     const trimmed = l.trim();
//                     if (trimmed.startsWith("-")) {
//                       phase = "bullets";
//                       bullets.push(trimmed.replace(/^-+\s*/, ""));
//                     } else {
//                       if (phase === "intro") intro.push(trimmed);
//                       else if (phase === "bullets") {
//                         // Переход к завершающему тексту после списка
//                         if (trimmed) {
//                           phase = "outro";
//                           outro.push(trimmed);
//                         }
//                       } else {
//                         if (trimmed) outro.push(trimmed);
//                       }
//                     }
//                   }

//                   return (
//                     <>
//                       {intro.length > 0 && <p>{intro.join(" ")}</p>}
//                       <ul>
//                         {bullets.map((b, i) => (
//                           <li key={i}>{b}</li>
//                         ))}
//                       </ul>
//                       {outro.length > 0 && <p>{outro.join(" ")}</p>}
//                     </>
//                   );
//                 }

//                 // Иначе - просто абзацы
//                 return lines.map((chunk, i) =>
//                   chunk.trim() ? <p key={i}>{chunk}</p> : null
//                 );
//               })()
//             )}
//           </AccordionDetails>
//         </Accordion>
//       ))}
//     </Box>
//   );
// }

// // ✅ helper: извлечь YouTube videoId из разных форматов URL
// function getYoutubeId(url) {
//   try {
//     const u = new URL(url);
//     if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);             // https://youtu.be/<id>
//     if (u.pathname.startsWith('/embed/')) return u.pathname.split('/embed/')[1].split('/')[0]; // /embed/<id>
//     const v = u.searchParams.get('v');
//     if (v) return v;                                                             // watch?v=<id>
//   } catch {}
//   return url; // fallback
// }

// // ✅ скролл к секции при наличии хэша (работает при переходе с другой страницы)
// function useScrollToHash() {
//   const { hash } = useLocation();

//   useEffect(() => {
//     if (!hash) return;

//     const id = decodeURIComponent(hash.replace('#', ''));
//     let tries = 0;
//     const maxTries = 20;   // до ~2 секунд
//     const interval = 100;

//     const tick = () => {
//       const el = document.getElementById(id) || document.querySelector(hash);
//       if (el) {
//         el.scrollIntoView({ behavior: 'smooth', block: 'start' });
//         return;
//       }
//       if (tries < maxTries) {
//         tries += 1;
//         setTimeout(tick, interval);
//       }
//     };

//     // дождаться первого рендера
//     setTimeout(tick, 0);
//   }, [hash]);
// }

// const Dokskenas = () => {
//   const [open, setOpen] = useState(false);       // состояние модалки
//   const [tracked, setTracked] = useState(false); // защита от дублей события
//   useScrollToHash();

//   // единый источник для видео и его названия
//   const YT_EMBED_URL = "https://www.youtube.com/embed/ByViuilYxZA";
//   const VIDEO_TITLE = "DokSkenas demo";

//   // отправка события ViewContent (один раз за сессию открытия)
//   const sendViewContent = () => {
//     if (!window.fbq || tracked) return;
//     const videoId = getYoutubeId(YT_EMBED_URL);
//     track('ViewContent', {
//       content_ids: [videoId],
//       content_name: VIDEO_TITLE,
//       content_type: 'video',
//     });
//     setTracked(true);
//   };

//   // открытие/закрытие модалки
//   const handleOpen = () => {
//     setOpen(true);
//     sendViewContent(); // отправляем событие при клике на "Žiūrėti video"
//   };
//   const handleClose = () => setOpen(false);

//   // автозапуск через хэш #demo
//   useEffect(() => {
//     const checkHash = () => {
//       if (window.location.hash === "#demo") {
//         setOpen(true);
//         sendViewContent();
//       }
//     };
//     checkHash();
//     window.addEventListener("hashchange", checkHash);
//     return () => window.removeEventListener("hashchange", checkHash);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   return (
//     <Box sx={{ bgcolor: '#F9F9FA', minHeight: '100vh', padding: { xs: 2, sm: 5 }, paddingTop: { xs: '50px', sm: '70px'}, width: '100%' }}>
//       <Helmet>
//         <title>Sąskaitų skaitmenizavimas su DI - DokSkenas</title>
//         <meta name="description" content="Automatizuokite savo apskaitą su DI bei sutaupykite krūvą laiko. Išbandykit DokSkeną dabar!" />
//       </Helmet>

//       {/* Section 1 */}
//       <Stack
//         spacing={4}
//         direction={{ xs: 'column', md: 'row' }}
//         alignItems="top"
//         justifyContent="center"
//         sx={{ width: '100%', textAlign: 'center' }}
//       >
//         <Box
//           sx={{
//             width: '100%',
//             display: 'flex',
//             flexDirection: 'column',
//             alignItems: 'center',
//             paddingBottom: { xs: '20px', sm: '50px'},
//           }}
//         >
//           <Typography
//             variant="h1"
//             sx={{
//               fontSize: { xs: '35px', sm: '76px'},
//               fontFamily: 'Helvetica',
//               fontWeight: '600',
//               marginBottom: 2,
//               textAlign: "center",
//             }}
//           >
//             Sąskaitų skaitmenizavimas
//           </Typography>
//           <Typography
//             variant="h2"
//             sx={{
//               fontSize: { xs: '22px', sm: '45px'},
//               fontFamily: 'Helvetica',
//               fontWeight: '600',
//               marginBottom: 2,
//               textAlign: "center",
//             }}
//           >
//             Automatizuokite apskaitą su DI
//           </Typography>
//           <Typography variant="body1" sx={{ maxWidth: { xs: '100%', md: '70%' }, marginBottom: 0, fontSize: '18px', fontFamily: 'Helvetica', padding: 1 }}>
//             Sutaupykite krūvą laiko bei išvenkite žmogiškojo faktoriaus klaidų. 
//           </Typography>
//           <Typography variant="body1" sx={{ maxWidth: { xs: '100%', md: '70%' }, marginBottom: 5, fontSize: '18px', fontFamily: 'Helvetica', padding: 1 }}>
//             Leiskite dirbtiniam intelektui atlikti nuobodų apskaitininko darbą.
//           </Typography>

//           <Stack direction="row" spacing={2} justifyContent="center">
//             <Button
//               variant="contained"
//               size="large"
//               href="/registruotis"
//               sx={{
//                 backgroundColor: "#f5be0d",
//                 color: "black",
//                 "&:hover": { backgroundColor: "#f5cf54", color: "black" },
//               }}
//             >
//               Išbandyti nemokamai
//             </Button>
//             <Button
//               variant="outlined"
//               size="large"
//               onClick={handleOpen}
//               startIcon={<PlayCircleIcon />}
//               sx={{
//                 borderColor: "black",
//                 color: "black",
//                 "&:hover": { backgroundColor: "#fff6d8", color: "black" },
//               }}
//             >
//               Žiūrėti video
//             </Button>
//           </Stack>

//           {/* Modal для видео */}
//           <Modal
//             open={open}
//             onClose={handleClose}
//             aria-labelledby="modal-title"
//             aria-describedby="modal-description"
//           >
//             <Box
//               sx={{
//                 position: 'absolute',
//                 top: '50%',
//                 left: '50%',
//                 transform: 'translate(-50%, -50%)',
//                 bgcolor: '#1B1B1B',
//                 boxShadow: 24,
//                 p: 2,
//                 borderRadius: 2,
//                 maxWidth: '800px',
//                 width: '90%',
//                 outline: 'none',
//               }}
//             >
//               <Box
//                 component="iframe"
//                 src={YT_EMBED_URL}
//                 title={VIDEO_TITLE}
//                 width="100%"
//                 height="600px"
//                 sx={{ border: 'none' }}
//                 allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
//                 allowFullScreen
//               />
//             </Box>
//           </Modal>

//           <Stack direction="row" alignItems="center" spacing={1} sx={{ marginTop: '15px', marginBottom: 1 }}>
//             <Stack direction="row" spacing={0.01} justifyContent="center">
//               {[...Array(5)].map((_, index) => (
//                 <StarIcon key={index} sx={{ color: '#f5cf54' }} />
//               ))}
//             </Stack>
//             <Typography variant="body2">Daugiau nei 250 įmonių naudojasi DokSkenu kasdien</Typography>
//           </Stack>
//         </Box>
//       </Stack>

//       {/* Section - How It Works */}
//       <Box
//         id="kaip-veikia"
//         sx={{
//           scrollMarginTop: { xs: '80px', md: '100px' },
//           display: 'flex',
//           flexDirection: { xs: 'column', md: 'row' },
//           alignItems: 'top',
//           justifyContent: 'center',
//           width: '100%',
//           marginTop: '50px',
//           marginBottom: '80px',
//           gap: { xs: 5, md: 0 },
//         }}
//       >
//         {/* Левая часть: буллеты */}
//         <Box
//           sx={{
//             width: { xs: '100%', md: '50%' },
//             padding: { xs: 2, md: 5 },
//             display: 'flex',
//             flexDirection: 'column',
//             alignItems: { xs: 'center', md: 'flex-start' },
//           }}
//         >
//           <Typography
//             variant="h2"
//             sx={{
//               fontSize: '36px',
//               fontFamily: 'Helvetica',
//               fontWeight: 600,
//               marginBottom: 3,
//               textAlign: { xs: 'center', md: 'left' },
//             }}
//           >
//             Kaip tai veikia?
//           </Typography>
//           <Stack spacing={3}>
//             {[
//               "Įkelkite sąskaitas-faktūras bei čekius 📤",
//               "Palaukite, kol dirbtinis intelektas nuskaitys dokumentus ⏳",
//               "Eksportuokite failus su duomenimis 📥",
//               "Įmportuokite failus į jūsų buhalterinę programą ✔️",
//             ].map((text, idx) => (
//               <Stack key={idx} direction="row" alignItems="center" spacing={2}>
//                 <Box
//                   sx={{
//                     minWidth: 38,
//                     minHeight: 38,
//                     width: 38,
//                     height: 38,
//                     borderRadius: '50%',
//                     background: "#f5cf54",
//                     color: "#1b1b1b",
//                     display: "flex",
//                     alignItems: "center",
//                     justifyContent: "center",
//                     fontWeight: 700,
//                     fontSize: '20px',
//                     fontFamily: 'Helvetica',
//                     boxShadow: 2,
//                   }}
//                 >
//                   {idx + 1}
//                 </Box>
//                 <Typography variant="body1" sx={{ fontSize: '20px', fontFamily: 'Helvetica' }}>
//                   {text}
//                 </Typography>
//               </Stack>
//             ))}
//           </Stack>
//         </Box>
//         {/* Правая часть: картинка */}
//         <Box
//           sx={{
//             width: { xs: '100%', md: '50%' },
//             display: 'flex',
//             justifyContent: 'center',
//             alignItems: 'center',
//             padding: { xs: 2, md: 5 },
//           }}
//         >
//           <Box
//             component="img"
//             src="/parodomoji_faktura.jpg"
//             alt="Dokumentų įkėlimas"
//             sx={{
//               maxWidth: '100%',
//               maxHeight: { xs: '280px', md: '600px' },
//               borderRadius: 3,
//               boxShadow: 3,
//               objectFit: 'contain',
//             }}
//           />
//         </Box>
//       </Box>

//       {/* Section - Mini Features Grid */}
//       <Box
//         id="ka-moka"
//         sx={{
//           scrollMarginTop: { xs: '80px', md: '100px' },
//           width: '100%',
//           display: 'flex',
//           flexDirection: 'column',
//           alignItems: 'center',
//           marginTop: '80px',
//           marginBottom: '80px',
//         }}
//       >
//         <Typography
//           variant="h2"
//           sx={{
//             fontSize: '36px',
//             fontFamily: 'Helvetica',
//             fontWeight: 600,
//             marginBottom: 5,
//             textAlign: 'center',
//           }}
//         >
//           Ką DokSkenas moka?
//         </Typography>
//         <Box
//           sx={{
//             display: 'grid',
//             gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
//             gap: 5,
//             width: '100%',
//             maxWidth: '1200px',
//           }}
//         >
//           {[
//             { img: '/1.png', title: 'Skaitmenizuoja sumiškai bei kiekybiškai (su eilutėmis)' },
//             { img: '/2.png', title: 'Suranda dublikatus bei netinkamus dokumentus' },
//             { img: '/3.png', title: 'Įmonių rekvizitus sutikrina su Registrų Centru' },
//             { img: '/4.png', title: 'Nuskaito ir ES bei užsienietiškus dokumentus' },
//             { img: '/5.png', title: 'Paruošia importo failus į jūsų buhalterinę programą' },
//             { img: '/6.png', title: 'Vienu metu gali apdoroti tūkstančius dokumentų' },
//           ].map((card, idx) => (
//             <Box
//               key={idx}
//               sx={{
//                 display: 'flex',
//                 flexDirection: 'column',
//                 alignItems: 'center',
//                 minHeight: '130px',
//               }}
//             >
//               <Box
//                 component="img"
//                 src={card.img}
//                 alt={card.title}
//                 sx={{
//                   width: 130,
//                   height: 130,
//                   marginBottom: 2,
//                   objectFit: 'contain',
//                   filter: 'drop-shadow(0px 4px 16px #f5cf54aa)',
//                   background: '#f5cf54',
//                   borderRadius: 2,
//                   padding: 1.5,
//                 }}
//               />
//               <Typography
//                 variant="body2"
//                 sx={{
//                   fontWeight: 600,
//                   fontFamily: 'Helvetica',
//                   fontSize: '17px',
//                   textAlign: 'center',
//                   maxWidth: '210px',
//                   wordBreak: 'break-word',
//                   color: '#1b1b1b',
//                 }}
//               >
//                 {card.title}
//               </Typography>
//             </Box>
//           ))}
//         </Box>
//       </Box>

//       {/* Section - Pricing */}
//       <Box
//         id="kainos"
//         sx={{
//           scrollMarginTop: { xs: '80px', md: '100px' },
//           width: '100%',
//           display: 'flex',
//           flexDirection: 'column',
//           alignItems: 'center',
//           marginTop: '80px',
//           marginBottom: '80px',
//         }}
//       >
//         <Typography
//           variant="h2"
//           sx={{
//             fontSize: '36px',
//             fontFamily: 'Helvetica',
//             fontWeight: 600,
//             marginBottom: 4,
//             textAlign: 'center',
//           }}
//         >
//           Kaina
//         </Typography>

//         <Box
//           sx={{
//             display: 'flex',
//             flexDirection: { xs: 'column', sm: 'row' },
//             justifyContent: 'center',
//             alignItems: 'center',
//             gap: 6,
//             marginBottom: 3,
//           }}
//         >
//           {/* Sumiškai */}
//           <Box
//             sx={{
//               display: 'flex',
//               flexDirection: 'column',
//               alignItems: 'center',
//               padding: 3,
//               borderRadius: 3,
//               background: '#fff6d8',
//               boxShadow: '0px 2px 16px rgba(245,207,84,0.09)',
//               minWidth: 220,
//             }}
//           >
//             <Typography
//               variant="h5"
//               sx={{
//                 fontFamily: 'Helvetica',
//                 fontWeight: 600,
//                 fontSize: '23px',
//                 marginBottom: 1,
//                 color: '#1b1b1b',
//               }}
//             >
//               Sumiškai
//             </Typography>
//             <Typography
//               variant="h4"
//               sx={{
//                 fontWeight: 700,
//                 color: '#f5be0d',
//                 fontSize: '30px',
//               }}
//             >
//               0.18&nbsp;EUR
//             </Typography>
//             <Typography
//               variant="body2"
//               sx={{
//                 color: '#1b1b1b',
//                 fontSize: '18px',
//               }}
//             >
//               už dokumentą
//             </Typography>
//           </Box>
//           {/* Kiekybiškai */}
//           <Box
//             sx={{
//               display: 'flex',
//               flexDirection: 'column',
//               alignItems: 'center',
//               padding: 3,
//               borderRadius: 3,
//               background: '#fff6d8',
//               boxShadow: '0px 2px 16px rgba(245,207,84,0.09)',
//               minWidth: 220,
//             }}
//           >
//             <Typography
//               variant="h5"
//               sx={{
//                 fontFamily: 'Helvetica',
//                 fontWeight: 600,
//                 fontSize: '23px',
//                 marginBottom: 1,
//                 color: '#1b1b1b',
//               }}
//             >
//               Kiekybiškai
//             </Typography>
//             <Typography
//               variant="h4"
//               sx={{
//                 fontWeight: 700,
//                 color: '#f5be0d',
//                 fontSize: '30px',
//               }}
//             >
//               0.23&nbsp;EUR
//             </Typography>
//             <Typography
//               variant="body2"
//               sx={{
//                 color: '#1b1b1b',
//                 fontSize: '18px',
//               }}
//             >
//               už dokumentą
//             </Typography>
//           </Box>
//         </Box>

//         <Typography
//           variant="body1"
//           sx={{
//             maxWidth: 600,
//             textAlign: 'center',
//             color: '#1b1b1b',
//             fontSize: '18px',
//             marginTop: 3,
//             fontFamily: 'Helvetica',
//           }}
//         >
//           Už dublikatus bei netinkamus dokumentus nemokėsite.<br />
//         </Typography>
//         <Typography
//           variant="body1"
//           sx={{
//             maxWidth: 600,
//             textAlign: 'center',
//             color: '#1b1b1b',
//             fontSize: '18px',
//             marginTop: 3,
//             fontFamily: 'Helvetica',
//           }}
//         >
//           Nėra mėnesinio mokesčio. Mokėkite už tiek, kiek įkelsite.
//         </Typography>
//         <Typography
//           variant="body1"
//           sx={{
//             maxWidth: 600,
//             fontWeight: 600,
//             textAlign: 'center',
//             color: '#1b1b1b',
//             fontSize: '18px',
//             marginTop: 3,
//             fontFamily: 'Helvetica',
//           }}
//         >
//           Pirmieji 50 skaitmenizavimų – nemokami.
//         </Typography>
//       </Box>

//       {/* Integracijos */}
//       <Box
//         id="integracijos"
//         sx={{
//           scrollMarginTop: { xs: '80px', md: '100px' },
//           width: '100%',
//           display: 'flex',
//           flexDirection: 'column',
//           alignItems: 'center',
//           marginTop: '80px',
//           marginBottom: '80px',
//         }}
//       >
//         <Typography
//           variant="h2"
//           sx={{
//             fontSize: '36px',
//             fontFamily: 'Helvetica',
//             fontWeight: 600,
//             marginBottom: 2,
//             textAlign: 'center',
//           }}
//         >
//           Integracijos su buhalterinėmis programomis
//         </Typography>
//         <Typography
//           variant="body1"
//           sx={{
//             fontFamily: 'Helvetica',
//             color: '#1b1b1b',
//             fontSize: '20px',
//             marginBottom: 4,
//             textAlign: 'center',
//           }}
//         >
//           Šiuo metu turime šias integracijas:
//         </Typography>

//         <Box
//           sx={{
//             display: 'flex',
//             justifyContent: 'center',
//             width: '100%',
//             marginBottom: 2,
//           }}
//         >
//           <Box
//             sx={{
//               display: 'grid',
//               gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
//               gap: 2,
//             }}
//           >
//             {[
//               { label: 'Finvalda', url: 'https://atlyginimoskaiciuokle.com/finvalda', hasLink: true },
//               { label: 'Rivilė GAMA', url: 'https://atlyginimoskaiciuokle.com/rivile', hasLink: true },
//               { label: 'Rivilė ERP', url: 'https://atlyginimoskaiciuokle.com/rivile', hasLink: true },
//               { label: 'Agnum', url: 'https://atlyginimoskaiciuokle.com/agnum', hasLink: true },
//               { label: 'Centas', url: 'https://atlyginimoskaiciuokle.com/centas', hasLink: true },
//               { label: 'Apskaita5', url: 'https://atlyginimoskaiciuokle.com/apskaita5', hasLink: true },
//               { label: 'Pragma 3.2', url: 'https://atlyginimoskaiciuokle.com/pragma', hasLink: true },
//               { label: 'Pragma 4', url: 'https://atlyginimoskaiciuokle.com/pragma', hasLink: true },
//               { label: 'Būtenta', hasLink: false },
//               { label: 'Site.pro', url: 'https://atlyginimoskaiciuokle.com/site-pro', hasLink: true },
//               { label: 'Debetas', url: 'https://atlyginimoskaiciuokle.com/debetas', hasLink: true },
//               { label: 'APSA', url: 'https://atlyginimoskaiciuokle.com/apsa', hasLink: true },
//               { label: 'Paulita', hasLink: false },
//               { label: 'Optimum', hasLink: false },
//               { label: 'Dineta', hasLink: false },
//               { label: 'iSAF', hasLink: false },
//               { label: 'Excel', hasLink: false },
//             ].map((item, idx) => (
//               <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 200 }}>
//                 <Box
//                   sx={{
//                     minWidth: 28,
//                     width: 28,
//                     height: 28,
//                     background: '#f5cf54',
//                     borderRadius: '50%',
//                     display: 'flex',
//                     alignItems: 'center',
//                     justifyContent: 'center',
//                     boxShadow: 1,
//                     flexShrink: 0,
//                   }}
//                 >
//                   <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
//                     <circle cx="9" cy="9" r="9" fill="#f5cf54"/>
//                     <path d="M5 9.5L8 12L13 7" stroke="#1b1b1b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
//                   </svg>
//                 </Box>
//                 {item.hasLink ? (
//                   <a
//                     href={item.url}
//                     target="_blank"
//                     rel="dofollow noopener"
//                     style={{
//                       textDecoration: 'none',
//                       color: '#1b1b1b',
//                       fontSize: '18px',
//                       fontFamily: 'Helvetica',
//                       borderBottom: '1px solid #f5cf54',
//                       transition: 'all 0.2s ease',
//                     }}
//                     onMouseEnter={(e) => {
//                       e.target.style.color = '#f5be0d';
//                       e.target.style.borderBottomColor = '#f5be0d';
//                     }}
//                     onMouseLeave={(e) => {
//                       e.target.style.color = '#1b1b1b';
//                       e.target.style.borderBottomColor = '#f5cf54';
//                     }}
//                   >
//                     {item.label}
//                   </a>
//                 ) : (
//                   <Typography sx={{ fontSize: '18px', fontFamily: 'Helvetica', color: '#1b1b1b' }}>
//                     {item.label}
//                   </Typography>
//                 )}
//               </Box>
//             ))}
//           </Box>
//         </Box>
//       </Box>

//       <FaqSection />

//       {/* Section 5 - CTA */}
//       <Box sx={{ 
//         width: '100%',
//         display: 'flex',
//         flexDirection: 'column',
//         alignItems: 'center',
//         marginTop: '80px',
//         marginBottom: '100px'
//       }}>
//         <Typography 
//           variant="h2" 
//           sx={{ 
//             fontSize: '36px',
//             fontFamily: 'Helvetica',
//             fontWeight: '600',
//             textAlign: "center"
//           }}
//         >
//           Pradėkite taupyti savo brangų laiką dabar.
//         </Typography>
//         <Typography variant="body1" sx={{ maxWidth:'70%', fontSize: '20px', textAlign: 'center', fontFamily: 'Helvetica', padding: 1, paddingBottom: '60px'}}>
//           Automatizuokitę apskaitą su DokSkenu.
//         </Typography>
//         <Button
//           variant="contained"
//           size="large"
//           href="/registruotis"
//           sx={{ 
//             backgroundColor: "#f5be0d",
//             color: "black",
//             "&:hover": { backgroundColor: "#f5cf54", color: "black" },
//             padding: 1.5,
//             paddingLeft: 6,
//             paddingRight: 6,
//           }}
//         >
//           Išbandyti nemokamai
//         </Button>
//       </Box>
//     </Box>
//   );
// };

// export default Dokskenas;


