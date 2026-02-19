import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Box, Typography, Button, Stack, Modal, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useLocation } from 'react-router-dom';

// ✅ Meta Pixel
import { track } from '../metaPixel'; // проверь путь: если файл рядом, поменяй на './metaPixel'

const faqList = [
  {
    question: "Kiek trunka vieno dokumento skaitmeninimas?",
    answer: "Vidutiniškai apie 30 sekundžių.",
  },
  {
    question: "Kokius dokumentų tipus galima įkelti?",
    answer: "DokSkenas priima PDF, PNG ir JPG/JPEG failus. Dokumentai gali būti nuskenuoti arba nufotografuoti.",
  },
  {
    question: "Ar DokSkenas atpažįsta užsienio kalbomis išrašytas sąskaitas faktūras?",
    answer: "Taip.",
  },
  {
    question: "Kaip sistema užtikrina duomenų saugumą?",
    answer: "Visi jūsų duomenys yra saugomi saugiuose serveriuose ir šifruojami tiek perdavimo, tiek saugojimo metu. Dokumentų atpažinimui naudojame patikimų partnerių (pvz., Google ir OpenAI) debesų paslaugas, kurios taip pat atitinka aukščiausius saugumo standartus. Apdorojimo metu jūsų informacija nėra perduodama trečiosioms šalims reklamos ar kitiems tikslams. Naudojame tik tiek duomenų, kiek būtina dokumentų skaitmenizavimui, ir laikomės visų ES duomenų apsaugos (GDPR) reikalavimų.",
  },
  {
    question: "Kaip vyksta atsiskaitymas – ar reikia prenumeratos?",
    answer: "Po registracijos gausite 50 nemokamų kreditų, kuriuos galėsite panaudoti dokumentų skaitmenizavimui. Kai kreditai baigsis, suvestinėje pamatysite pranešimą su nuoroda į apmokėjimo puslapį, kur galėsite įsigyti daugiau kreditų. 1 dokumentas = 1 kreditas, arba 1,3 kredito, jei skaitmenizuojate kiekybiškai su eilutėmis.",
  },
  {
    question: "Ar galiu išbandyti paslaugą nemokamai?",
    answer: "Taip, po registracijos gausite 50 nemokamų kreditų, kuriuos galėsite panaudoti dokumentų skaitmenizavimui.",
  },
  {
    question: "Ar galima integruoti su mano buhalterine programa?",
    answerIntro: "Šiuo metu turime integracijas su šiomis programomis:",
    programs: [
      "Rivilė GAMA",
      "Rivilė ERP",
      "Centas",
      "Finvalda",
      "Agnum",
      "Optimum",
      "Dineta",
      "Apskaita5",
      "Pragma 3.2",
      "Pragma 4",
      "Būtenta",
      "Site.pro (B1)",
      "Debetas",
      "APSA",
      "Paulita",
      "iSAF"
    ],
    answerOutro: "Po skaitmenizavimo galėsite eksportuoti duomenis į pasirinktą programą. Atsisiųstus failus iš DokSkeno tereikės importuoti į buhalterinę programą."
  },
  {
    question: "Ar sistema aptinka dublikatus ir netinkamus dokumentus?",
    answer: "Taip. Už dublikatus ir netinkamus dokumentus mokėti nereikės.",
  },
  {
    question: "Ar gali būti keli dokumentai viename faile?",
    answer: "Ne. Viename faile turi būti vienas dokumentas, tačiau jis gali turėti kelis lapus.",
  },
  {
    question: "Kiek kainuoja paslauga?",
    answer: "0,18 EUR už dokumentą, jei skaitmenizuojate sumiškai.\n0,23 EUR už dokumentą, jei skaitmenizuojate kiekybiškai su eilutėmis.",
  },
  {
    question: "Kas atsitinka su dokumentais po apdorojimo?",
    answer: "Po sėkmingo skaitmenizavimo dokumentų failai saugomi mūsų archyve 18 mėnesių.",
  },
];

function FaqSection() {
  const [expanded, setExpanded] = useState(0);

  const handleChange = (panel) => (event, isExpanded) => {
    setExpanded(isExpanded ? panel : false);
  };

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: 820,
        margin: "80px auto",
        padding: { xs: 1, md: 2 },
        borderRadius: 4,
      }}
    >
      <Typography
        variant="h2"
        sx={{
          fontSize: "32px",
          fontFamily: "Helvetica",
          fontWeight: 600,
          marginBottom: 3,
          textAlign: "center",
        }}
      >
        DUK
      </Typography>
      {faqList.map((item, idx) => (
        <Accordion
          key={idx}
          expanded={expanded === idx}
          onChange={handleChange(idx)}
          sx={{
            mb: 2,
            borderRadius: 2,
            background: "#fff",
            boxShadow: "0px 2px 16px rgba(0,0,0,0.05)",
            "&:before": { display: "none" },
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon sx={{ color: "#f5cf54" }} />}
            sx={{
              fontWeight: 700,
              fontFamily: "Helvetica",
              fontSize: "18px",
              color: "#1b1b1b",
              background: "#e2e2e2",
              borderRadius: 2,
              minHeight: 56,
            }}
          >
            {item.question}
          </AccordionSummary>
          <AccordionDetails
            sx={{
              fontFamily: "Helvetica",
              fontSize: "17px",
              color: "#333",
              background: "#fff",
              marginTop: "10px",
              "& ul": { paddingLeft: "1.2rem", margin: "0.5rem 0" },
              "& li": { marginBottom: "6px" },
              "& p": { margin: "0 0 8px 0" },
            }}
          >
            {/* Вариант с programs (intro + <ul> + outro) */}
            {item.programs ? (
              <>
                {item.answerIntro && <p>{item.answerIntro}</p>}
                <ul>
                  {item.programs.map((program, i) => (
                    <li key={i}>{program}</li>
                  ))}
                </ul>
                {item.answerOutro && <p>{item.answerOutro}</p>}
              </>
            ) : (
              // Универсальный рендер для answer-строки (поддерживает абзацы и "-", как список)
              (() => {
                const text = item.answer || "";
                const lines = text.split("\n");

                // Если есть хотя бы одна строка, начинающаяся с "- ", рисуем список.
                const hasBullets = lines.some((l) => l.trim().startsWith("-"));

                if (hasBullets) {
                  const intro = [];
                  const bullets = [];
                  const outro = [];

                  let phase = "intro";
                  for (const l of lines) {
                    const trimmed = l.trim();
                    if (trimmed.startsWith("-")) {
                      phase = "bullets";
                      bullets.push(trimmed.replace(/^-+\s*/, ""));
                    } else {
                      if (phase === "intro") intro.push(trimmed);
                      else if (phase === "bullets") {
                        // Переход к завершающему тексту после списка
                        if (trimmed) {
                          phase = "outro";
                          outro.push(trimmed);
                        }
                      } else {
                        if (trimmed) outro.push(trimmed);
                      }
                    }
                  }

                  return (
                    <>
                      {intro.length > 0 && <p>{intro.join(" ")}</p>}
                      <ul>
                        {bullets.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                      {outro.length > 0 && <p>{outro.join(" ")}</p>}
                    </>
                  );
                }

                // Иначе — просто абзацы
                return lines.map((chunk, i) =>
                  chunk.trim() ? <p key={i}>{chunk}</p> : null
                );
              })()
            )}
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}

// ✅ helper: извлечь YouTube videoId из разных форматов URL
function getYoutubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);             // https://youtu.be/<id>
    if (u.pathname.startsWith('/embed/')) return u.pathname.split('/embed/')[1].split('/')[0]; // /embed/<id>
    const v = u.searchParams.get('v');
    if (v) return v;                                                             // watch?v=<id>
  } catch {}
  return url; // fallback
}

// ✅ скролл к секции при наличии хэша (работает при переходе с другой страницы)
function useScrollToHash() {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;

    const id = decodeURIComponent(hash.replace('#', ''));
    let tries = 0;
    const maxTries = 20;   // до ~2 секунд
    const interval = 100;

    const tick = () => {
      const el = document.getElementById(id) || document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (tries < maxTries) {
        tries += 1;
        setTimeout(tick, interval);
      }
    };

    // дождаться первого рендера
    setTimeout(tick, 0);
  }, [hash]);
}

const Dokskenas = () => {
  const [open, setOpen] = useState(false);       // состояние модалки
  const [tracked, setTracked] = useState(false); // защита от дублей события
  useScrollToHash();

  // единый источник для видео и его названия
  const YT_EMBED_URL = "https://www.youtube.com/embed/ByViuilYxZA";
  const VIDEO_TITLE = "DokSkenas demo";

  // отправка события ViewContent (один раз за сессию открытия)
  const sendViewContent = () => {
    if (!window.fbq || tracked) return;
    const videoId = getYoutubeId(YT_EMBED_URL);
    track('ViewContent', {
      content_ids: [videoId],
      content_name: VIDEO_TITLE,
      content_type: 'video',
    });
    setTracked(true);
  };

  // открытие/закрытие модалки
  const handleOpen = () => {
    setOpen(true);
    sendViewContent(); // отправляем событие при клике на "Žiūrėti video"
  };
  const handleClose = () => setOpen(false);

  // автозапуск через хэш #demo
  useEffect(() => {
    const checkHash = () => {
      if (window.location.hash === "#demo") {
        setOpen(true);
        sendViewContent();
      }
    };
    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box sx={{ bgcolor: '#F9F9FA', minHeight: '100vh', padding: { xs: 2, sm: 5 }, paddingTop: { xs: '50px', sm: '70px'}, width: '100%' }}>
      <Helmet>
        <title>Sąskaitų skaitmenizavimas su DI - DokSkenas</title>
        <meta name="description" content="Automatizuokite savo apskaitą su DI bei sutaupykite krūvą laiko. Išbandykit DokSkeną dabar!" />
      </Helmet>

      {/* Section 1 */}
      <Stack
        spacing={4}
        direction={{ xs: 'column', md: 'row' }}
        alignItems="top"
        justifyContent="center"
        sx={{ width: '100%', textAlign: 'center' }}
      >
        <Box
          sx={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingBottom: { xs: '20px', sm: '50px'},
          }}
        >
          <Typography
            variant="h1"
            sx={{
              fontSize: { xs: '35px', sm: '76px'},
              fontFamily: 'Helvetica',
              fontWeight: '600',
              marginBottom: 2,
              textAlign: "center",
            }}
          >
            Sąskaitų skaitmenizavimas
          </Typography>
          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: '22px', sm: '45px'},
              fontFamily: 'Helvetica',
              fontWeight: '600',
              marginBottom: 2,
              textAlign: "center",
            }}
          >
            Automatizuokite apskaitą su DI
          </Typography>
          <Typography variant="body1" sx={{ maxWidth: { xs: '100%', md: '70%' }, marginBottom: 0, fontSize: '18px', fontFamily: 'Helvetica', padding: 1 }}>
            Sutaupykite krūvą laiko bei išvenkite žmogiškojo faktoriaus klaidų. 
          </Typography>
          <Typography variant="body1" sx={{ maxWidth: { xs: '100%', md: '70%' }, marginBottom: 5, fontSize: '18px', fontFamily: 'Helvetica', padding: 1 }}>
            Leiskite dirbtiniam intelektui atlikti nuobodų apskaitininko darbą.
          </Typography>

          <Stack direction="row" spacing={2} justifyContent="center">
            <Button
              variant="contained"
              size="large"
              href="/registruotis"
              sx={{
                backgroundColor: "#f5be0d",
                color: "black",
                "&:hover": { backgroundColor: "#f5cf54", color: "black" },
              }}
            >
              Išbandyti nemokamai
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={handleOpen}
              startIcon={<PlayCircleIcon />}
              sx={{
                borderColor: "black",
                color: "black",
                "&:hover": { backgroundColor: "#fff6d8", color: "black" },
              }}
            >
              Žiūrėti video
            </Button>
          </Stack>

          {/* Modal для видео */}
          <Modal
            open={open}
            onClose={handleClose}
            aria-labelledby="modal-title"
            aria-describedby="modal-description"
          >
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                bgcolor: '#1B1B1B',
                boxShadow: 24,
                p: 2,
                borderRadius: 2,
                maxWidth: '800px',
                width: '90%',
                outline: 'none',
              }}
            >
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

          <Stack direction="row" alignItems="center" spacing={1} sx={{ marginTop: '15px', marginBottom: 1 }}>
            <Stack direction="row" spacing={0.01} justifyContent="center">
              {[...Array(5)].map((_, index) => (
                <StarIcon key={index} sx={{ color: '#f5cf54' }} />
              ))}
            </Stack>
            <Typography variant="body2">Daugiau nei 250 įmonių naudojasi DokSkenu kasdien</Typography>
          </Stack>
        </Box>
      </Stack>

      {/* Section — How It Works */}
      <Box
        id="kaip-veikia"
        sx={{
          scrollMarginTop: { xs: '80px', md: '100px' },
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: 'top',
          justifyContent: 'center',
          width: '100%',
          marginTop: '50px',
          marginBottom: '80px',
          gap: { xs: 5, md: 0 },
        }}
      >
        {/* Левая часть: буллеты */}
        <Box
          sx={{
            width: { xs: '100%', md: '50%' },
            padding: { xs: 2, md: 5 },
            display: 'flex',
            flexDirection: 'column',
            alignItems: { xs: 'center', md: 'flex-start' },
          }}
        >
          <Typography
            variant="h2"
            sx={{
              fontSize: '36px',
              fontFamily: 'Helvetica',
              fontWeight: 600,
              marginBottom: 3,
              textAlign: { xs: 'center', md: 'left' },
            }}
          >
            Kaip tai veikia?
          </Typography>
          <Stack spacing={3}>
            {[
              "Įkelkite sąskaitas-faktūras bei čekius 📤",
              "Palaukite, kol dirbtinis intelektas nuskaitys dokumentus ⏳",
              "Eksportuokite failus su duomenimis 📥",
              "Įmportuokite failus į jūsų buhalterinę programą ✔️",
            ].map((text, idx) => (
              <Stack key={idx} direction="row" alignItems="center" spacing={2}>
                <Box
                  sx={{
                    minWidth: 38,
                    minHeight: 38,
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    background: "#f5cf54",
                    color: "#1b1b1b",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: '20px',
                    fontFamily: 'Helvetica',
                    boxShadow: 2,
                  }}
                >
                  {idx + 1}
                </Box>
                <Typography variant="body1" sx={{ fontSize: '20px', fontFamily: 'Helvetica' }}>
                  {text}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
        {/* Правая часть: картинка */}
        <Box
          sx={{
            width: { xs: '100%', md: '50%' },
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: { xs: 2, md: 5 },
          }}
        >
          <Box
            component="img"
            src="/parodomoji_faktura.jpg"
            alt="Dokumentų įkėlimas"
            sx={{
              maxWidth: '100%',
              maxHeight: { xs: '280px', md: '600px' },
              borderRadius: 3,
              boxShadow: 3,
              objectFit: 'contain',
            }}
          />
        </Box>
      </Box>

      {/* Section — Mini Features Grid */}
      <Box
        id="ka-moka"
        sx={{
          scrollMarginTop: { xs: '80px', md: '100px' },
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: '80px',
          marginBottom: '80px',
        }}
      >
        <Typography
          variant="h2"
          sx={{
            fontSize: '36px',
            fontFamily: 'Helvetica',
            fontWeight: 600,
            marginBottom: 5,
            textAlign: 'center',
          }}
        >
          Ką DokSkenas moka?
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
            gap: 5,
            width: '100%',
            maxWidth: '1200px',
          }}
        >
          {[
            { img: '/1.png', title: 'Skaitmenizuoja sumiškai bei kiekybiškai (su eilutėmis)' },
            { img: '/2.png', title: 'Suranda dublikatus bei netinkamus dokumentus' },
            { img: '/3.png', title: 'Įmonių rekvizitus sutikrina su Registrų Centru' },
            { img: '/4.png', title: 'Nuskaito ir ES bei užsienietiškus dokumentus' },
            { img: '/5.png', title: 'Paruošia importo failus į jūsų buhalterinę programą' },
            { img: '/6.png', title: 'Vienu metu gali apdoroti tūkstančius dokumentų' },
          ].map((card, idx) => (
            <Box
              key={idx}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                minHeight: '130px',
              }}
            >
              <Box
                component="img"
                src={card.img}
                alt={card.title}
                sx={{
                  width: 130,
                  height: 130,
                  marginBottom: 2,
                  objectFit: 'contain',
                  filter: 'drop-shadow(0px 4px 16px #f5cf54aa)',
                  background: '#f5cf54',
                  borderRadius: 2,
                  padding: 1.5,
                }}
              />
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  fontFamily: 'Helvetica',
                  fontSize: '17px',
                  textAlign: 'center',
                  maxWidth: '210px',
                  wordBreak: 'break-word',
                  color: '#1b1b1b',
                }}
              >
                {card.title}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Section — Pricing */}
      <Box
        id="kainos"
        sx={{
          scrollMarginTop: { xs: '80px', md: '100px' },
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: '80px',
          marginBottom: '80px',
        }}
      >
        <Typography
          variant="h2"
          sx={{
            fontSize: '36px',
            fontFamily: 'Helvetica',
            fontWeight: 600,
            marginBottom: 4,
            textAlign: 'center',
          }}
        >
          Kaina
        </Typography>

        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'center',
            alignItems: 'center',
            gap: 6,
            marginBottom: 3,
          }}
        >
          {/* Sumiškai */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: 3,
              borderRadius: 3,
              background: '#fff6d8',
              boxShadow: '0px 2px 16px rgba(245,207,84,0.09)',
              minWidth: 220,
            }}
          >
            <Typography
              variant="h5"
              sx={{
                fontFamily: 'Helvetica',
                fontWeight: 600,
                fontSize: '23px',
                marginBottom: 1,
                color: '#1b1b1b',
              }}
            >
              Sumiškai
            </Typography>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                color: '#f5be0d',
                fontSize: '30px',
              }}
            >
              0.18&nbsp;EUR
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: '#1b1b1b',
                fontSize: '18px',
              }}
            >
              už dokumentą
            </Typography>
          </Box>
          {/* Kiekybiškai */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: 3,
              borderRadius: 3,
              background: '#fff6d8',
              boxShadow: '0px 2px 16px rgba(245,207,84,0.09)',
              minWidth: 220,
            }}
          >
            <Typography
              variant="h5"
              sx={{
                fontFamily: 'Helvetica',
                fontWeight: 600,
                fontSize: '23px',
                marginBottom: 1,
                color: '#1b1b1b',
              }}
            >
              Kiekybiškai
            </Typography>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                color: '#f5be0d',
                fontSize: '30px',
              }}
            >
              0.23&nbsp;EUR
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: '#1b1b1b',
                fontSize: '18px',
              }}
            >
              už dokumentą
            </Typography>
          </Box>
        </Box>

        <Typography
          variant="body1"
          sx={{
            maxWidth: 600,
            textAlign: 'center',
            color: '#1b1b1b',
            fontSize: '18px',
            marginTop: 3,
            fontFamily: 'Helvetica',
          }}
        >
          Už dublikatus bei netinkamus dokumentus nemokėsite.<br />
        </Typography>
        <Typography
          variant="body1"
          sx={{
            maxWidth: 600,
            textAlign: 'center',
            color: '#1b1b1b',
            fontSize: '18px',
            marginTop: 3,
            fontFamily: 'Helvetica',
          }}
        >
          Nėra mėnesinio mokesčio. Mokėkite už tiek, kiek įkelsite.
        </Typography>
        <Typography
          variant="body1"
          sx={{
            maxWidth: 600,
            fontWeight: 600,
            textAlign: 'center',
            color: '#1b1b1b',
            fontSize: '18px',
            marginTop: 3,
            fontFamily: 'Helvetica',
          }}
        >
          Pirmieji 50 skaitmenizavimų – nemokami.
        </Typography>
      </Box>

      {/* Integracijos */}
      <Box
        id="integracijos"
        sx={{
          scrollMarginTop: { xs: '80px', md: '100px' },
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: '80px',
          marginBottom: '80px',
        }}
      >
        <Typography
          variant="h2"
          sx={{
            fontSize: '36px',
            fontFamily: 'Helvetica',
            fontWeight: 600,
            marginBottom: 2,
            textAlign: 'center',
          }}
        >
          Integracijos su buhalterinėmis programomis
        </Typography>
        <Typography
          variant="body1"
          sx={{
            fontFamily: 'Helvetica',
            color: '#1b1b1b',
            fontSize: '20px',
            marginBottom: 4,
            textAlign: 'center',
          }}
        >
          Šiuo metu turime šias integracijas:
        </Typography>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            width: '100%',
            marginBottom: 2,
          }}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 2,
            }}
          >
            {[
              { label: 'Finvalda', url: 'https://finvalda.lt/', hasLink: true },
              { label: 'Rivilė GAMA', url: 'https://atlyginimoskaiciuokle.com/rivile', hasLink: true },
              { label: 'Rivilė ERP', url: 'https://atlyginimoskaiciuokle.com/rivile', hasLink: true },
              { label: 'Agnum', url: 'https://atlyginimoskaiciuokle.com/agnum', hasLink: true },
              { label: 'Centas', hasLink: false },
              { label: 'Apskaita5', hasLink: false },
              { label: 'Pragma 3.2', hasLink: false },
              { label: 'Pragma 4', hasLink: false },
              { label: 'Būtenta', hasLink: false },
              { label: 'Site.pro', hasLink: false },
              { label: 'Debetas', hasLink: false },
              { label: 'APSA', hasLink: false },
              { label: 'Paulita', hasLink: false },
              { label: 'Optimum', hasLink: false },
              { label: 'Dineta', hasLink: false },
              { label: 'iSAF', hasLink: false },
              { label: 'Excel', hasLink: false },
            ].map((item, idx) => (
              <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 200 }}>
                <Box
                  sx={{
                    minWidth: 28,
                    width: 28,
                    height: 28,
                    background: '#f5cf54',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: 1,
                    flexShrink: 0,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <circle cx="9" cy="9" r="9" fill="#f5cf54"/>
                    <path d="M5 9.5L8 12L13 7" stroke="#1b1b1b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </Box>
                {item.hasLink ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="dofollow noopener"
                    style={{
                      textDecoration: 'none',
                      color: '#1b1b1b',
                      fontSize: '18px',
                      fontFamily: 'Helvetica',
                      borderBottom: '1px solid #f5cf54',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.color = '#f5be0d';
                      e.target.style.borderBottomColor = '#f5be0d';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.color = '#1b1b1b';
                      e.target.style.borderBottomColor = '#f5cf54';
                    }}
                  >
                    {item.label}
                  </a>
                ) : (
                  <Typography sx={{ fontSize: '18px', fontFamily: 'Helvetica', color: '#1b1b1b' }}>
                    {item.label}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <FaqSection />

      {/* Section 5 - CTA */}
      <Box sx={{ 
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: '80px',
        marginBottom: '100px'
      }}>
        <Typography 
          variant="h2" 
          sx={{ 
            fontSize: '36px',
            fontFamily: 'Helvetica',
            fontWeight: '600',
            textAlign: "center"
          }}
        >
          Pradėkite taupyti savo brangų laiką dabar.
        </Typography>
        <Typography variant="body1" sx={{ maxWidth:'70%', fontSize: '20px', textAlign: 'center', fontFamily: 'Helvetica', padding: 1, paddingBottom: '60px'}}>
          Automatizuokitę apskaitą su DokSkenu.
        </Typography>
        <Button
          variant="contained"
          size="large"
          href="/registruotis"
          sx={{ 
            backgroundColor: "#f5be0d",
            color: "black",
            "&:hover": { backgroundColor: "#f5cf54", color: "black" },
            padding: 1.5,
            paddingLeft: 6,
            paddingRight: 6,
          }}
        >
          Išbandyti nemokamai
        </Button>
      </Box>
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
//       "Apskaita5"
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

//                 // Иначе — просто абзацы
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

// const Dokskenas = () => {
//   const [open, setOpen] = useState(false);       // состояние модалки
//   const [tracked, setTracked] = useState(false); // защита от дублей события

//   // единый источник для видео и его названия
//   const YT_EMBED_URL = "https://www.youtube.com/embed/falGn4_S_5Y?si=LFmb3RYZCG59JKF8";
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
//         <title>Sąskaitų skaitmenizavimas su DI</title>
//         <meta name="description" content="Automatizuokite savo apskaitą su DI bei sutaupykite krūvą laiko." />
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
//             <Typography variant="body2">Daugiau nei 100 įmonių naudojasi DokSkenu kasdien</Typography>
//           </Stack>
//         </Box>
//       </Stack>

//       {/* Section — How It Works */}
//       <Box
//         sx={{
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

//       {/* Section — Mini Features Grid */}
//       <Box
//         sx={{
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

//       {/* Section — Pricing */}
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

//       {/* Section — Integracijos su buhalterinėmis programomis */}
//       <Box
//         sx={{
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
//             flexDirection: 'column',
//             alignItems: 'center',
//             gap: 2,
//             maxWidth: 400,
//             width: '100%',
//             margin: '0 auto',
//             marginBottom: 2,
//           }}
//         >
//           {[
//             { label: 'Finvalda (.xml)', url: 'https://finvalda.lt/', hasLink: true },
//             { label: 'Rivilė GAMA (.eip)', hasLink: false },
//             { label: 'Rivilė ERP (.xlsx)', hasLink: false },
//             { label: 'Centas (.xml)', hasLink: false },
//             { label: 'Apskaita5 (.xml)', hasLink: false },
//             { label: 'Excel (.csv/.xlsx)', hasLink: false },
//           ].map((item, idx) => (
//             <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
//               <Box
//                 sx={{
//                   width: 28,
//                   height: 28,
//                   background: '#f5cf54',
//                   borderRadius: '50%',
//                   display: 'flex',
//                   alignItems: 'center',
//                   justifyContent: 'center',
//                   fontWeight: 700,
//                   fontSize: '19px',
//                   fontFamily: 'Helvetica',
//                   color: '#1b1b1b',
//                   boxShadow: 1,
//                 }}
//               >
//                 <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
//                   <circle cx="9" cy="9" r="9" fill="#f5cf54"/>
//                   <path d="M5 9.5L8 12L13 7" stroke="#1b1b1b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
//                 </svg>
//               </Box>
//               {item.hasLink ? (
//                 <a 
//                   href={item.url} 
//                   target="_blank" 
//                   rel="dofollow noopener"
//                   style={{
//                     textDecoration: 'none',
//                     color: '#1b1b1b',
//                     fontSize: '18px',
//                     fontFamily: 'Helvetica',
//                     borderBottom: '1px solid #f5cf54',
//                     transition: 'all 0.2s ease'
//                   }}
//                   onMouseEnter={(e) => {
//                     e.target.style.color = '#f5be0d';
//                     e.target.style.borderBottomColor = '#f5be0d';
//                   }}
//                   onMouseLeave={(e) => {
//                     e.target.style.color = '#1b1b1b';
//                     e.target.style.borderBottomColor = '#f5cf54';
//                   }}
//                 >
//                   {item.label}
//                 </a>
//               ) : (
//                 <Typography sx={{ fontSize: '18px', fontFamily: 'Helvetica', color: '#1b1b1b' }}>
//                   {item.label}
//                 </Typography>
//               )}
//             </Box>
//           ))}
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




// import { useState, useEffect } from 'react';
// import { Helmet } from 'react-helmet';
// import { Box, Typography, Button, Stack, Modal, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
// import StarIcon from '@mui/icons-material/Star';
// import PlayCircleIcon from '@mui/icons-material/PlayCircle';
// import ExpandMoreIcon from "@mui/icons-material/ExpandMore";


// const faqList = [
//     {
//         question: "Kiek trunka vieno dokumento skaitmeninimas?",
//         answer: "Vidutiniškai apie 30 sekundžių.",
//     },
//     {
//         question: "Kokius dokumentų tipus galima įkelti?",
//         answer: "DokSkenas priima PDF, PNG ir JPG/JPEG failus. Dokumentai gali būti nuskenuoti arba nufotografuoti.",
//     },
//     {
//         question: "Ar DokSkenas atpažįsta užsienio kalbomis išrašytas sąskaitas faktūras?",
//         answer: "Taip.",
//     },
//     {
//         question: "Kaip sistema užtikrina duomenų saugumą?",
//         answer: "Visi jūsų duomenys yra saugomi saugiuose serveriuose ir šifruojami tiek perdavimo, tiek saugojimo metu. Dokumentų atpažinimui naudojame patikimų partnerių (pvz., Google ir OpenAI) debesų paslaugas, kurios taip pat atitinka aukščiausius saugumo standartus. Apdorojimo metu jūsų informacija nėra perduodama trečiosioms šalims reklamos ar kitiems tikslams. Naudojame tik tiek duomenų, kiek būtina dokumentų skaitmenizavimui, ir laikomės visų ES duomenų apsaugos (GDPR) reikalavimų.",
//     },
//     {
//         question: "Kaip vyksta atsiskaitymas – ar reikia prenumeratos?",
//         answer: "Po registracijos gausite 50 nemokamų kreditų, kuriuos galėsite panaudoti dokumentų skaitmenizavimui. Kai kreditai baigsis, suvestinėje pamatysite pranešimą su nuoroda į apmokėjimo puslapį, kur galėsite įsigyti daugiau kreditų. 1 dokumentas = 1 kreditas, arba 1,3 kredito, jei skaitmenizuojate kiekybiškai su eilutėmis.",
//     },
//     {
//         question: "Ar galiu išbandyti paslaugą nemokamai?",
//         answer: "Taip, po registracijos gausite 50 nemokamų kreditų, kuriuos galėsite panaudoti dokumentų skaitmenizavimui.",
//     },
//     {
//         question: "Ar galima integruoti su mano buhalterine programa?",
//         answerIntro: "Šiuo metu turime integracijas su šiomis programomis:",
//         programs: [
//             "Rivilė GAMA",
//             "Rivilė ERP",
//             "Centas",
//             "Finvalda",
//             "Apskaita5"
//         ],
//         answerOutro: "Po skaitmenizavimo galėsite eksportuoti duomenis į pasirinktą programą. Atsisiųstus failus iš DokSkeno tereikės importuoti į buhalterinę programą."
//     },
//     {
//         question: "Ar sistema aptinka dublikatus ir netinkamus dokumentus?",
//         answer: "Taip. Už dublikatus ir netinkamus dokumentus mokėti nereikės.",
//     },
//     {
//         question: "Ar gali būti keli dokumentai viename faile?",
//         answer: "Ne. Viename faile turi būti vienas dokumentas, tačiau jis gali turėti kelis lapus.",
//     },
//     {
//         question: "Kiek kainuoja paslauga?",
//         answer: "0,18 EUR už dokumentą, jei skaitmenizuojate sumiškai.\n0,23 EUR už dokumentą, jei skaitmenizuojate kiekybiškai su eilutėmis.",
//     },
//     {
//         question: "Kas atsitinka su dokumentais po apdorojimo?",
//         answer: "Po sėkmingo skaitmenizavimo dokumentų failai saugomi mūsų archyve 18 mėnesių.",
//     },
// ];


// function FaqSection() {
//     const [expanded, setExpanded] = useState(0);

//     const handleChange = (panel) => (event, isExpanded) => {
//         setExpanded(isExpanded ? panel : false);
//     };

//     return (
//         <Box
//             sx={{
//                 width: "100%",
//                 maxWidth: 820,
//                 margin: "80px auto",
//                 padding: { xs: 1, md: 2 },
//                 borderRadius: 4,
//             }}
//         >
//             <Typography
//                 variant="h2"
//                 sx={{
//                     fontSize: "32px",
//                     fontFamily: "Helvetica",
//                     fontWeight: 600,
//                     marginBottom: 3,
//                     textAlign: "center",
//                 }}
//             >
//                 DUK
//             </Typography>
//             {faqList.map((item, idx) => (
//                 <Accordion
//                     key={idx}
//                     expanded={expanded === idx}
//                     onChange={handleChange(idx)}
//                     sx={{
//                         mb: 2,
//                         borderRadius: 2,
//                         background: "#fff",
//                         boxShadow: "0px 2px 16px rgba(0,0,0,0.05)",
//                         "&:before": { display: "none" },
//                     }}
//                 >
//                     <AccordionSummary
//                         expandIcon={<ExpandMoreIcon sx={{ color: "#f5cf54" }}/> }
//                         sx={{
//                             fontWeight: 700,
//                             fontFamily: "Helvetica",
//                             fontSize: "18px",
//                             color: "#1b1b1b",
//                             background: "#e2e2e2",
//                             borderRadius: 2,
//                             minHeight: 56,
//                         }}
//                     >
//                         {item.question}
//                     </AccordionSummary>
//                     <AccordionDetails
//                         sx={{
//                             fontFamily: "Helvetica",
//                             fontSize: "17px",
//                             color: "#333",
//                             background: "#fff",
//                             marginTop: "10px",
//                             "& ul": { paddingLeft: "1.2rem", margin: "0.5rem 0" },
//                             "& li": { marginBottom: "6px" },
//                             "& p": { margin: "0 0 8px 0" },
//                         }}
//                         >
//                         {/* Вариант с programs (intro + <ul> + outro) */}
//                         {item.programs ? (
//                             <>
//                             {item.answerIntro && <p>{item.answerIntro}</p>}
//                             <ul>
//                                 {item.programs.map((program, i) => (
//                                 <li key={i}>{program}</li>
//                                 ))}
//                             </ul>
//                             {item.answerOutro && <p>{item.answerOutro}</p>}
//                             </>
//                         ) : (
//                             // Универсальный рендер для answer-строки (поддерживает абзацы и "-", как список)
//                             (() => {
//                             const text = item.answer || "";
//                             const lines = text.split("\n");

//                             // Если есть хотя бы одна строка, начинающаяся с "- ", рисуем список.
//                             const hasBullets = lines.some((l) => l.trim().startsWith("-"));

//                             if (hasBullets) {
//                                 const intro = [];
//                                 const bullets = [];
//                                 const outro = [];

//                                 let phase = "intro";
//                                 for (const l of lines) {
//                                 const trimmed = l.trim();
//                                 if (trimmed.startsWith("-")) {
//                                     phase = "bullets";
//                                     bullets.push(trimmed.replace(/^-+\s*/, ""));
//                                 } else {
//                                     if (phase === "intro") intro.push(trimmed);
//                                     else if (phase === "bullets") {
//                                     // Переход к завершающему тексту после списка
//                                     if (trimmed) {
//                                         phase = "outro";
//                                         outro.push(trimmed);
//                                     }
//                                     } else {
//                                     if (trimmed) outro.push(trimmed);
//                                     }
//                                 }
//                                 }

//                                 return (
//                                 <>
//                                     {intro.length > 0 && <p>{intro.join(" ")}</p>}
//                                     <ul>
//                                     {bullets.map((b, i) => (
//                                         <li key={i}>{b}</li>
//                                     ))}
//                                     </ul>
//                                     {outro.length > 0 && <p>{outro.join(" ")}</p>}
//                                 </>
//                                 );
//                             }

//                             // Иначе — просто абзацы
//                             return lines.map((chunk, i) =>
//                                 chunk.trim() ? <p key={i}>{chunk}</p> : null
//                             );
//                             })()
//                         )}
//                         </AccordionDetails>
//                 </Accordion>
//             ))}
//         </Box>
//     );
// }




// const Dokskenas = () => {
//     // const avatars = Array(5).fill('/static/avatar.png'); // Пример картинок аватаров
//     // const [tabIndex, setTabIndex] = React.useState(0);

//     // const handleTabChange = (event, newValue) => {
//     //     setTabIndex(newValue);
//     // };

//     // const tabsContent = [
//     //     { icon: <TimelineIcon />, title: 'Seasonal Patterns', description: 'Identify clear seasonal patterns for your chosen stock or index and refine your trading strategy using data-driven insights.' },
//     //     { icon: <ListIcon />, title: 'Stocks & Indexes', description: 'Access a comprehensive database of over 700 U.S. stocks and indexes.' },
//     //     { icon: <AttachMoneyIcon />, title: 'Historical Trades', description: 'Validate each trade within identified seasonal patterns.' },
//     //     { icon: <AccessTimeIcon />, title: '20 Years of Data', description: 'Analyze 5 to 20 years of stock performance data to uncover both the most recent and longest-lasting seasonal patterns.' },
//     //     { icon: <CompareArrowsIcon />, title: 'Comparison', description: 'Compare historical seasonal patterns with the performance of the recent year.' },
//     // ];


//     const [open, setOpen] = useState(false); // Состояние для модального окна

//     const handleOpen = () => setOpen(true); // Открытие модального окна
//     const handleClose = () => setOpen(false); // Закрытие модального окна

//     useEffect(() => {
//         const checkHash = () => {
//             if (window.location.hash === "#demo") {
//                 setOpen(true); // Открываем модальное окно
//             }
//         };
    
//         // Проверяем хэш при загрузке страницы
//         checkHash();
    
//         // Слушаем изменения хэша
//         window.addEventListener("hashchange", checkHash);
    
//         // Очищаем слушатель при размонтировании компонента
//         return () => {
//             window.removeEventListener("hashchange", checkHash);
//         };
//     }, []);
 

//     return (
//             <Box sx={{ bgcolor: '#F9F9FA', minHeight: '100vh', padding: { xs: 2, sm: 5 }, paddingTop: { xs: '50px', sm: '70px'}, width: '100%' }}>
//                 <Helmet>
//                 <title>Sąskaitų skaitmenizavimas su DI</title>
//                 <meta name="description" content="Automatizuokite savo apskaitą su DI bei sutaupykite krūvą laiko." />
//                 </Helmet>
                
//                 {/* <Article></Article> */}
//                 {/* Section 1 */}
//                 <Stack
//                     spacing={4}
//                     direction={{ xs: 'column', md: 'row' }}
//                     alignItems="top"
//                     justifyContent="center"
//                     sx={{
//                         width: '100%',
//                         textAlign: 'center',
//                     }}
//                 >
//                     <Box
//                         sx={{
//                             width: '100%',
//                             display: 'flex',
//                             flexDirection: 'column',
//                             alignItems: 'center',
//                             paddingBottom: { xs: '20px', sm: '50px'},
//                         }}
//                     >   <Typography
//                             variant="h1"
//                             sx={{
//                                 fontSize: { xs: '35px', sm: '76px'},
//                                 fontFamily: 'Helvetica',
//                                 fontWeight: '600',
//                                 marginBottom: 2,
//                                 textAlign: "center",
//                             }}
//                         >
//                             Sąskaitų skaitmenizavimas
//                         </Typography>
//                         <Typography
//                             variant="h2"
//                             sx={{
//                                 fontSize: { xs: '22px', sm: '45px'},
//                                 fontFamily: 'Helvetica',
//                                 fontWeight: '600',
//                                 marginBottom: 2,
//                                 textAlign: "center",
//                             }}
//                         >
//                             Automatizuokite apskaitą su DI
//                         </Typography>
//                         <Typography variant="body1" sx={{ maxWidth: { xs: '100%', md: '70%' }, marginBottom: 0, fontSize: '18px', fontFamily: 'Helvetica', padding: 1 }}>
//                             Sutaupykite krūvą laiko bei išvenkite žmogiškojo faktoriaus klaidų. 
//                         </Typography>
//                         <Typography variant="body1" sx={{ maxWidth: { xs: '100%', md: '70%' }, marginBottom: 5, fontSize: '18px', fontFamily: 'Helvetica', padding: 1 }}>
//                         Leiskite dirbtiniam intelektui atlikti nuobodų apskaitininko darbą.
//                         </Typography>
//                         <Stack direction="row" spacing={2} justifyContent="center">
//                             <Button variant="contained" size="large" href="/registruotis"
//                                 sx={{
//                                     backgroundColor: "#f5be0d",
//                                     color: "black",
//                                     "&:hover": { backgroundColor: "#f5cf54", color: "black" },
//                                 }}>
//                                 Išbandyti nemokamai
//                             </Button>
//                             <Button variant="outlined" size="large" onClick={handleOpen} startIcon={<PlayCircleIcon />}
//                                 sx={{
//                                     borderColor: "black",
//                                     color: "black",
//                                     "&:hover": { backgroundColor: "#fff6d8", color: "black" },
//                                 }}>
//                                 Žiūrėti video
//                             </Button>
//                         </Stack>
//                         {/* Modal для видео */}
//                         <Modal
//                             open={open}
//                             onClose={handleClose}
//                             aria-labelledby="modal-title"
//                             aria-describedby="modal-description"
//                         >
//                             <Box
//                                 sx={{
//                                     position: 'absolute',
//                                     top: '50%',
//                                     left: '50%',
//                                     transform: 'translate(-50%, -50%)',
//                                     bgcolor: '#1B1B1B',
//                                     boxShadow: 24,
//                                     p: 2,
//                                     borderRadius: 2,
//                                     maxWidth: '800px',
//                                     width: '90%',
//                                     outline: 'none',
//                                 }}
//                             >
//                                 {/* Встроенное YouTube-видео */}
//                                 <Box
//                                     component="iframe"
//                                     src="https://www.youtube.com/embed/falGn4_S_5Y?si=LFmb3RYZCG59JKF8" // Замените на вашу ссылку
//                                     title="Demo Video"
//                                     width="100%"
//                                     height="600px"
//                                     sx={{
//                                         border: 'none',
//                                     }}
//                                 ></Box>
//                             </Box>
//                         </Modal>
//                         <Stack direction="row" alignItems="center" spacing={1} sx={{ marginTop: '15px', marginBottom: 1 }}>
//                             <Stack direction="row" spacing={0.01} justifyContent="center">
//                                 {[...Array(5)].map((_, index) => (
//                                     <StarIcon key={index} sx={{ color: '#f5cf54' }} />
//                                 ))}
//                             </Stack>
//                             <Typography variant="body2">Daugiau nei 100 įmonių naudojasi DokSkenu kasdien</Typography>
//                         </Stack>
//                         {/* <Stack direction="row" spacing={-1} justifyContent="center">
//                             {avatars.map((src, idx) => (
//                                 <Avatar
//                                     key={idx}
//                                     src={src}
//                                     sx={{
//                                         border: '2px solid #F9F9FA',
//                                     }}
//                                 />
//                             ))}
//                         </Stack> */}
//                     </Box>
//                 </Stack>
//                 {/* <Box
//                     component="img"
//                     src={samplePattern}
//                     alt="Seasonality Chart"
//                     sx={{
//                         width: '100%',
//                         height: 'auto',
//                         borderRadius: 2,
//                         boxShadow: 3,
//                     }}
//                 /> */}
//                 {/* Section - How It Works */}
//                 <Box
//                     sx={{
//                         display: 'flex',
//                         flexDirection: { xs: 'column', md: 'row' },
//                         alignItems: 'top',
//                         justifyContent: 'center',
//                         width: '100%',
//                         marginTop: '50px',
//                         marginBottom: '80px',
//                         gap: { xs: 5, md: 0 },
//                     }}
//                 >
//                     {/* Левая часть: буллеты */}
//                     <Box
//                         sx={{
//                             width: { xs: '100%', md: '50%' },
//                             padding: { xs: 2, md: 5 },
//                             display: 'flex',
//                             flexDirection: 'column',
//                             alignItems: { xs: 'center', md: 'flex-start' },
//                         }}
//                     >
//                         <Typography
//                             variant="h2"
//                             sx={{
//                                 fontSize: '36px',
//                                 fontFamily: 'Helvetica',
//                                 fontWeight: 600,
//                                 marginBottom: 3,
//                                 textAlign: { xs: 'center', md: 'left' },
//                             }}
//                         >
//                             Kaip tai veikia?
//                         </Typography>
//                         <Stack spacing={3}>
//                             {[
//                                 "Įkelkite sąskaitas-faktūras bei čekius 📤",
//                                 "Palaukite, kol dirbtinis intelektas nuskaitys dokumentus ⏳",
//                                 "Eksportuokite failus su duomenimis 📥",
//                                 "Įmportuokite failus į jūsų buhalterinę programą ✔️",
//                             ].map((text, idx) => (
//                                 <Stack key={idx} direction="row" alignItems="center" spacing={2}>
//                                     <Box
//                                         sx={{
//                                             minWidth: 38,
//                                             minHeight: 38,
//                                             width: 38,
//                                             height: 38,
//                                             borderRadius: '50%',
//                                             background: "#f5cf54",
//                                             color: "#1b1b1b",
//                                             display: "flex",
//                                             alignItems: "center",
//                                             justifyContent: "center",
//                                             fontWeight: 700,
//                                             fontSize: '20px',
//                                             fontFamily: 'Helvetica',
//                                             boxShadow: 2,
//                                         }}
//                                     >
//                                         {idx + 1}
//                                     </Box>
//                                     <Typography variant="body1" sx={{ fontSize: '20px', fontFamily: 'Helvetica' }}>
//                                         {text}
//                                     </Typography>
//                                 </Stack>
//                             ))}
//                         </Stack>
//                     </Box>
//                     {/* Правая часть: картинка */}
//                     <Box
//                         sx={{
//                             width: { xs: '100%', md: '50%' },
//                             display: 'flex',
//                             justifyContent: 'center',
//                             alignItems: 'center',
//                             padding: { xs: 2, md: 5 },
//                         }}
//                     >
//                         <Box
//                             component="img"
//                             src="/parodomoji_faktura.jpg" // замените на свой путь к изображению
//                             alt="Dokumentų įkėlimas"
//                             sx={{
//                                 maxWidth: '100%',
//                                 maxHeight: { xs: '280px', md: '600px' },
//                                 borderRadius: 3,
//                                 boxShadow: 3,
//                                 objectFit: 'contain',
//                             }}
//                         />
//                     </Box>
//                 </Box>

//                 {/* Section — Mini Features Grid (no background around image/title) */}
//                 <Box
//                     sx={{
//                         width: '100%',
//                         display: 'flex',
//                         flexDirection: 'column',
//                         alignItems: 'center',
//                         marginTop: '80px',
//                         marginBottom: '80px',
//                     }}
//                 >
//                     <Typography
//                         variant="h2"
//                         sx={{
//                             fontSize: '36px',
//                             fontFamily: 'Helvetica',
//                             fontWeight: 600,
//                             marginBottom: 5,
//                             textAlign: 'center',
//                         }}
//                     >
//                         Ką DokSkenas moka?
//                     </Typography>
//                     <Box
//                         sx={{
//                             display: 'grid',
//                             gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
//                             gap: 5,
//                             width: '100%',
//                             maxWidth: '1200px',
//                         }}
//                     >
//                         {[
//                             {
//                                 img: '/1.png',
//                                 title: 'Skaitmenizuoja sumiškai bei kiekybiškai (su eilutėmis)',
//                             },
//                             {
//                                 img: '/2.png',
//                                 title: 'Suranda dublikatus bei netinkamus dokumentus',
//                             },
//                             {
//                                 img: '/3.png',
//                                 title: 'Įmonių rekvizitus sutikrina su Registrų Centru',
//                             },
//                             {
//                                 img: '/4.png',
//                                 title: 'Nuskaito ir ES bei užsienietiškus dokumentus',
//                             },
//                             {
//                                 img: '/5.png',
//                                 title: 'Paruošia importo failus į jūsų buhalterinę programą',
//                             },
//                             {
//                                 img: '/6.png',
//                                 title: 'Vienu metu gali apdoroti tūkstančius dokumentų',
//                             },
//                         ].map((card, idx) => (
//                             <Box
//                                 key={idx}
//                                 sx={{
//                                     display: 'flex',
//                                     flexDirection: 'column',
//                                     alignItems: 'center',
//                                     minHeight: '130px',
//                                 }}
//                             >
//                                 <Box
//                                     component="img"
//                                     src={card.img}
//                                     alt={card.title}
//                                     sx={{
//                                         width: 130,
//                                         height: 130,
//                                         marginBottom: 2,
//                                         objectFit: 'contain',
//                                         filter: 'drop-shadow(0px 4px 16px #f5cf54aa)',
//                                         background: '#f5cf54',
//                                         borderRadius: 2,
//                                         padding: 1.5,
//                                     }}
//                                 />
//                                 <Typography
//                                     variant="body2"
//                                     sx={{
//                                         fontWeight: 600,
//                                         fontFamily: 'Helvetica',
//                                         fontSize: '17px',
//                                         textAlign: 'center',
//                                         maxWidth: '210px',         // Ограничивает ширину (например, 180-220px оптимально)
//                                         wordBreak: 'break-word',   // Переносит длинные слова
//                                         color: '#1b1b1b',
//                                     }}
//                                 >
//                                     {card.title}
//                                 </Typography>
//                             </Box>
//                         ))}
//                     </Box>
//                 </Box>

//                 {/* Section — Pricing */}
//                 <Box
//                     sx={{
//                         width: '100%',
//                         display: 'flex',
//                         flexDirection: 'column',
//                         alignItems: 'center',
//                         marginTop: '80px',
//                         marginBottom: '80px',
//                     }}
//                 >
//                     <Typography
//                         variant="h2"
//                         sx={{
//                             fontSize: '36px',
//                             fontFamily: 'Helvetica',
//                             fontWeight: 600,
//                             marginBottom: 4,
//                             textAlign: 'center',
//                         }}
//                     >
//                         Kaina
//                     </Typography>

//                     <Box
//                         sx={{
//                             display: 'flex',
//                             flexDirection: { xs: 'column', sm: 'row' },
//                             justifyContent: 'center',
//                             alignItems: 'center',
//                             gap: 6,
//                             marginBottom: 3,
//                         }}
//                     >
//                         {/* Sumiškai */}
//                         <Box
//                             sx={{
//                                 display: 'flex',
//                                 flexDirection: 'column',
//                                 alignItems: 'center',
//                                 padding: 3,
//                                 borderRadius: 3,
//                                 background: '#fff6d8',
//                                 boxShadow: '0px 2px 16px rgba(245,207,84,0.09)',
//                                 minWidth: 220,
//                             }}
//                         >
//                             <Typography
//                                 variant="h5"
//                                 sx={{
//                                     fontFamily: 'Helvetica',
//                                     fontWeight: 600,
//                                     fontSize: '23px',
//                                     marginBottom: 1,
//                                     color: '#1b1b1b',
//                                 }}
//                             >
//                                 Sumiškai
//                             </Typography>
//                             <Typography
//                                 variant="h4"
//                                 sx={{
//                                     fontWeight: 700,
//                                     color: '#f5be0d',
//                                     fontSize: '30px',
//                                 }}
//                             >
//                                 0.18&nbsp;EUR
//                             </Typography>
//                             <Typography
//                                 variant="body2"
//                                 sx={{
//                                     color: '#1b1b1b',
//                                     fontSize: '18px',
//                                 }}
//                             >
//                                 už dokumentą
//                             </Typography>
//                         </Box>
//                         {/* Kiekybiškai */}
//                         <Box
//                             sx={{
//                                 display: 'flex',
//                                 flexDirection: 'column',
//                                 alignItems: 'center',
//                                 padding: 3,
//                                 borderRadius: 3,
//                                 background: '#fff6d8',
//                                 boxShadow: '0px 2px 16px rgba(245,207,84,0.09)',
//                                 minWidth: 220,
//                             }}
//                         >
//                             <Typography
//                                 variant="h5"
//                                 sx={{
//                                     fontFamily: 'Helvetica',
//                                     fontWeight: 600,
//                                     fontSize: '23px',
//                                     marginBottom: 1,
//                                     color: '#1b1b1b',
//                                 }}
//                             >
//                                 Kiekybiškai
//                             </Typography>
//                             <Typography
//                                 variant="h4"
//                                 sx={{
//                                     fontWeight: 700,
//                                     color: '#f5be0d',
//                                     fontSize: '30px',
//                                 }}
//                             >
//                                 0.23&nbsp;EUR
//                             </Typography>
//                             <Typography
//                                 variant="body2"
//                                 sx={{
//                                     color: '#1b1b1b',
//                                     fontSize: '18px',
//                                 }}
//                             >
//                                 už dokumentą
//                             </Typography>
//                         </Box>
//                     </Box>
//                     {/* Extra info */}
//                     <Typography
//                         variant="body1"
//                         sx={{
//                             maxWidth: 600,
//                             textAlign: 'center',
//                             color: '#1b1b1b',
//                             fontSize: '18px',
//                             marginTop: 3,
//                             fontFamily: 'Helvetica',
//                         }}
//                     >
//                         Už dublikatus bei netinkamus dokumentus nemokėsite.<br />
//                     </Typography>
//                                         <Typography
//                         variant="body1"
//                         sx={{
//                             maxWidth: 600,
//                             textAlign: 'center',
//                             color: '#1b1b1b',
//                             fontSize: '18px',
//                             marginTop: 3,
//                             fontFamily: 'Helvetica',
//                         }}
//                     >
//                         Nėra mėnesinio mokesčio. Mokėkite už tiek, kiek įkelsite.
//                     </Typography>
//                     <Typography
//                         variant="body1"
//                         sx={{
//                             maxWidth: 600,
//                             fontWeight: 600,
//                             textAlign: 'center',
//                             color: '#1b1b1b',
//                             fontSize: '18px',
//                             marginTop: 3,
//                             fontFamily: 'Helvetica',
//                         }}
//                     >
//                         Pirmieji 50 skaitmenizavimų – nemokami.
//                     </Typography>
//                 </Box>

//                 {/* Section — Integracijos su buhalterinėmis programomis */}
//                 <Box
//                     sx={{
//                         width: '100%',
//                         display: 'flex',
//                         flexDirection: 'column',
//                         alignItems: 'center',
//                         marginTop: '80px',
//                         marginBottom: '80px',
//                     }}
//                 >
//                     <Typography
//                         variant="h2"
//                         sx={{
//                             fontSize: '36px',
//                             fontFamily: 'Helvetica',
//                             fontWeight: 600,
//                             marginBottom: 2,
//                             textAlign: 'center',
//                         }}
//                     >
//                         Integracijos su buhalterinėmis programomis
//                     </Typography>
//                     <Typography
//                         variant="body1"
//                         sx={{
//                             fontFamily: 'Helvetica',
//                             color: '#1b1b1b',
//                             fontSize: '20px',
//                             marginBottom: 4,
//                             textAlign: 'center',
//                         }}
//                     >
//                         Šiuo metu turime šias integracijas:
//                     </Typography>
// <Box
//                         sx={{
//                             display: 'flex',
//                             flexDirection: 'column',
//                             alignItems: 'center',
//                             gap: 2,
//                             maxWidth: 400,
//                             width: '100%',
//                             margin: '0 auto',
//                             marginBottom: 2,
//                         }}
//                     >
//                         {[
//                             { label: 'Finvalda (.xml)', url: 'https://finvalda.lt/', hasLink: true },
//                             { label: 'Rivilė GAMA (.eip)', hasLink: false },
//                             { label: 'Rivilė ERP (.xlsx)', hasLink: false },
//                             { label: 'Centas (.xml)', hasLink: false },
//                             { label: 'Apskaita5 (.xml)', hasLink: false },
//                             { label: 'Excel (.csv/.xlsx)', hasLink: false },
//                         ].map((item, idx) => (
//                             <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
//                                 <Box
//                                     sx={{
//                                         width: 28,
//                                         height: 28,
//                                         background: '#f5cf54',
//                                         borderRadius: '50%',
//                                         display: 'flex',
//                                         alignItems: 'center',
//                                         justifyContent: 'center',
//                                         fontWeight: 700,
//                                         fontSize: '19px',
//                                         fontFamily: 'Helvetica',
//                                         color: '#1b1b1b',
//                                         boxShadow: 1,
//                                     }}
//                                 >
//                                     <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
//                                         <circle cx="9" cy="9" r="9" fill="#f5cf54"/>
//                                         <path d="M5 9.5L8 12L13 7" stroke="#1b1b1b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
//                                     </svg>
//                                 </Box>
//                                 {item.hasLink ? (
//                                     <a 
//                                         href={item.url} 
//                                         target="_blank" 
//                                         rel="dofollow noopener"
//                                         style={{
//                                             textDecoration: 'none',
//                                             color: '#1b1b1b',
//                                             fontSize: '18px',
//                                             fontFamily: 'Helvetica',
//                                             borderBottom: '1px solid #f5cf54',
//                                             transition: 'all 0.2s ease'
//                                         }}
//                                         onMouseEnter={(e) => {
//                                             e.target.style.color = '#f5be0d';
//                                             e.target.style.borderBottomColor = '#f5be0d';
//                                         }}
//                                         onMouseLeave={(e) => {
//                                             e.target.style.color = '#1b1b1b';
//                                             e.target.style.borderBottomColor = '#f5cf54';
//                                         }}
//                                     >
//                                         {item.label}
//                                     </a>
//                                 ) : (
//                                     <Typography sx={{ fontSize: '18px', fontFamily: 'Helvetica', color: '#1b1b1b' }}>
//                                         {item.label}
//                                     </Typography>
//                                 )}
//                             </Box>
//                         ))}
//                     </Box>
//                 </Box>



//                 <FaqSection />
//                 {/* Section 5 - CTA */}
//                 <Box sx={{ 
//                     width: '100%',
//                     display: 'flex',
//                     flexDirection: 'column',
//                     alignItems: 'center',
//                     marginTop: '80px',
//                     marginBottom: '100px'
//                     }}>
//                     <Typography 
//                             variant="h2" 
//                             sx={{ 
//                                 fontSize: '36px',
//                                 fontFamily: 'Helvetica',
//                                 fontWeight: '600',
//                                 textAlign: "center" // Центрируем текст
//                             }}
//                     >
//                             Pradėkite taupyti savo brangų laiką dabar.
//                     </Typography>
//                     <Typography variant="body1" sx={{ maxWidth:'70%', fontSize: '20px', textAlign: 'center', fontFamily: 'Helvetica', padding: 1, paddingBottom: '60px'}}>
//                             Automatizuokitę apskaitą su DokSkenu.
//                     </Typography>
//                     <Button variant="contained" size="large" href="/registruotis"
//                             sx={{ 
//                                 backgroundColor: "#f5be0d",
//                                 color: "black",
//                                 "&:hover": { backgroundColor: "#f5cf54", color: "black" },
//                                 padding: 1.5,
//                                 paddingLeft: 6,
//                                 paddingRight: 6,
//                                 }}>
//                         Išbandyti nemokamai
//                     </Button>
//                 </Box>
//             </Box>
//         );
// };

// export default Dokskenas;