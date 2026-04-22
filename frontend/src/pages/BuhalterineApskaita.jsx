import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Box, Typography, Button, Stack, Modal, Accordion, AccordionSummary, AccordionDetails, TextField } from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useLocation } from 'react-router-dom';

// ✅ Meta Pixel
import { track } from '../metaPixel';

const faqList = [
  {
    question: "Ar DokSkenas gali pakeisti apskaitos įmonę?",
    answer: "DokSkenas automatizuoja dokumentų įvedimą į apskaitos sistemą, tačiau visiškai nepakeičia buhalterio. Sistema sutaupo laiką dokumentams vesti į apskaitos programą, bet strateginiai sprendimai turi būti priimti buhalterio.",
  },
  {
    question: "Kiek laiko sutaupysiu per mėnesį?",
    answer: "Jei įmonė per mėnesį apdoroja 200 dokumentų, vidutiniškai tai užimtų apie 16-17 valandų (5 min/dok), jei vesite ranka. Su DokSkenu vieną dokumentą skaitmenizuosite apie 30 sekundžių, kol gersite kavą. Sutaupysite minimum 15-16 valandų darbo per mėnesį arba iki 93% išlaidų, jei jums apskaitą veda apskaitos įmonė.",
  },
  {
    question: "Ar sistema tinka mano apskaitos programai?",
    answer: "DokSkenas integruotas su dauguma populiariausių Lietuvos apskaitos programų: Rivilė GAMA, Rivilė ERP, Centas, Finvalda, Agnum, Apskaita5, Būtenta, Pragma 3.2 ir 4, Optimum, Dineta, Debetas, Site.Pro(B1), APSA, Paulita ar tiesiog iSAF formatu. Jei jūsų programa nepalaiko tiesioginės integracijos, galite eksportuoti duomenis Excel formatu arba susisiekite su mumis, kad integruotume ir jūsų apskaitos programą.",
  },
  {
    question: "Ar sistema aptinka klaidas dokumentuose?",
    answer: "Taip. DokSkenas automatiškai tikrina ar sumos sutampa, patikrina PVM skaičiavimus ir net bando automatiškai ištaisyti aptiktas klaidas. Jei klaidos nepavyksta pataisyti, sistema neleis eksportuoti duomenų, kol problema nebus išspręsta.",
  },
  {
    question: "Kiek kainuoja paslauga?",
    answer: "0,18 EUR už dokumentą, jei skaitmenizuojate sumiškai.\n0,23 EUR už dokumentą, jei skaitmenizuojate kiekybiškai su eilutėmis.\nUž dublikatus ir netinkamus dokumentus nemokėsite. Nėra mėnesinio mokesčio.",
  },
  {
    question: "Ar galiu išbandyti nemokamai?",
    answer: "Taip, po registracijos gausite 50 nemokamų kreditų dokumentams skaitmenizuoti. Galėsite išbandyti sistemą be jokių įsipareigojimų.",
  },
  {
    question: "Kaip užtikrinamas duomenų saugumas?",
    answer: "Visi jūsų duomenys šifruojami pagal ES GDPR reikalavimus. Dokumentai saugomi saugiuose serveriuose, o jokia informacija nėra perduodama trečiosioms šalims nesusijusioms su paslaugos teikimu.",
  },
  {
    question: "Kokius dokumentų formatus priima sistema?",
    answer: "DokSkenas priima beveik visus failų formatus: JPG/JPEG, PNG, TIFF, PDF, DOCX (Word), XLSX (Excel), Heic (iPhone nuotraukos). Net galite kelti ZIP ar RAR archyvus, o sistema pati iš jų ištrauks dokumentų failus. Dokumentai gali būti nuskenuoti arba nufotografuoti telefonu. Sistema atpažįsta tiek lietuviškus, tiek užsienio kalbomis išrašytus dokumentus.",
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
              "& p": { margin: "0 0 8px 0" },
            }}
          >
            {item.answer.split("\n").map((chunk, i) =>
              chunk.trim() ? <p key={i}>{chunk}</p> : null
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
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if (u.pathname.startsWith('/embed/')) return u.pathname.split('/embed/')[1].split('/')[0];
    const v = u.searchParams.get('v');
    if (v) return v;
  } catch {}
  return url;
}

// ✅ скролл к секции при наличии хэша
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
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (tries < maxTries) {
        tries += 1;
        setTimeout(tick, interval);
      }
    };

    setTimeout(tick, 0);
  }, [hash]);
}

const BuhalterinenApskaita = () => {
  const [open, setOpen] = useState(false);
  const [tracked, setTracked] = useState(false);
  const [docCount, setDocCount] = useState(200);
  useScrollToHash();

  const YT_EMBED_URL = "https://www.youtube.com/embed/ByViuilYxZA";
  const VIDEO_TITLE = "DokSkenas demo";

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

  const handleOpen = () => {
    setOpen(true);
    sendViewContent();
  };
  const handleClose = () => setOpen(false);

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

  // Калькулятор экономии
  const traditionalCost = docCount * 2.5; // средняя цена apskaitos įmonė
  const dokskenasCost = docCount * 0.18; // минимальная цена DokSkenas
  const savings = traditionalCost - dokskenasCost;
  const savingsPercent = Math.round((savings / traditionalCost) * 100);

  return (
    <Box sx={{ bgcolor: '#F9F9FA', minHeight: '100vh', padding: { xs: 2, sm: 5 }, paddingTop: { xs: '50px', sm: '70px'}, width: '100%' }}>
      <Helmet>
        <title>Automatizuota buhalterinė apskaita nuo 0,18 EUR/dok | DokSkenas</title>
        <meta name="description" content="Sutaupykite iki 90% apskaitos išlaidų. DokSkenas automatiškai nuskaito dokumentus per 30 sekundžių. Išbandykite nemokamai!" />
      </Helmet>

      {/* Hero Section */}
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
              fontSize: { xs: '32px', sm: '66px'},
              fontFamily: 'Helvetica',
              fontWeight: '600',
              marginBottom: 2,
              textAlign: "center",
            }}
          >
            Automatizuota buhalterinė apskaita
          </Typography>
            <Typography
            variant="h2"
            sx={{
                fontSize: { xs: '24px', sm: '42px' },
                fontFamily: 'Helvetica',
                fontWeight: '600',
                marginBottom: 3,
                textAlign: 'center',
                color: '#000000', // весь текст чёрный
            }}
            >
            nuo{' '}
            <Box
                component="span"
                sx={{ color: '#f5be0d' }} // только 0,18 EUR жёлтым
            >
                0,18 EUR
            </Box>{' '}
            už dokumentą
            </Typography>
          <Typography variant="body1" sx={{ maxWidth: { xs: '100%', md: '70%' }, marginBottom: 0, fontSize: '20px', fontFamily: 'Helvetica', padding: 1 }}>
            Sutaupykite krūvą laiko ir iki 93% išlaidų dokumentams suvesti
          </Typography>
          <Typography variant="body1" sx={{ maxWidth: { xs: '100%', md: '70%' }, marginBottom: 5, fontSize: '20px', fontFamily: 'Helvetica', padding: 1 }}>
            Žmogus vidutiniškai veda vieną sąskaitą 5 minutes. DokSkenas dokumentus nuskaito per 30 sekundžių.
          </Typography>

          <Stack direction="row" spacing={2} justifyContent="center">
            <Button
              variant="contained"
              size="large"
              href="/registruotis?src=skaitmenizavimas"
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
            <Typography variant="body2">Daugiau nei 150 įmonių naudojasi DokSkenu kasdien</Typography>
          </Stack>
        </Box>
      </Stack>

      {/* Problem Statement */}
      <Box
        sx={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: '80px',
          marginBottom: '80px',
          padding: { xs: 2, md: 0 },
        }}
      >
        <Typography
          variant="h2"
          sx={{
            fontSize: { xs: '26px', sm: '34px' },
            fontFamily: 'Helvetica',
            fontWeight: 600,
            marginBottom: 5,
            textAlign: 'center',
            maxWidth: '900px',
          }}
        >
          Turite daug dokumentų, kuriuos vedate į apskaitos programą rankiniu būdu?
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' },
            gap: 4,
            width: '100%',
            maxWidth: '1000px',
          }}
        >
          {[
            { emoji: '📄', title: 'Vėluojate su apskaita', desc: 'Dokumentų įvedimas užima per daug laiko ir kaupiasi darbų eilė' },
            { emoji: '💰', title: 'Permokate apskaitos įmonei', desc: '2-3 EUR už kiekvieną įvestą dokumentą labai greitai suėda jūsų pelną' },
            { emoji: '⏰', title: 'Švaistomate brangų laiką', desc: 'Monotoniškas dokumentų vedimas atima laiką, kurį galėtumėte skirti verslui auginti' },
          ].map((item, idx) => (
            <Box
              key={idx}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: 3,
                borderRadius: 3,
                background: '#fff',
                boxShadow: '0px 2px 16px rgba(0,0,0,0.06)',
              }}
            >
              <Typography sx={{ fontSize: '48px', marginBottom: 2 }}>{item.emoji}</Typography>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 600,
                  fontFamily: 'Helvetica',
                  fontSize: '20px',
                  marginBottom: 1,
                  textAlign: 'center',
                }}
              >
                {item.title}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontFamily: 'Helvetica',
                  fontSize: '16px',
                  textAlign: 'center',
                  color: '#555',
                }}
              >
                {item.desc}
              </Typography>
            </Box>
          ))}
        </Box>

        <Typography
          variant="h3"
          sx={{
            fontSize: { xs: '24px', sm: '32px' },
            fontFamily: 'Helvetica',
            fontWeight: 600,
            marginTop: 6,
            textAlign: 'center',
          }}
        >
          Mes turime šiuolaikišką sprendimą! 🎉
        </Typography>
      </Box>

      {/* How It Works */}
      <Box
        id="kaip-veikia"
        sx={{
          scrollMarginTop: { xs: '80px', md: '100px' },
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          marginTop: '50px',
          marginBottom: '80px',
          gap: { xs: 5, md: 0 },
        }}
      >
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
              "Įkeliate pirkimo bei pardavimo dokumentus 📤",
              "DokSkenas nuskaito duomenis per 30 sekundžių ⏳",
              "Sistema paruošia failą importuoti į jūsų apskaitos programą 📊",
              "Failą persiųnčiate buhalterei ar importuojate patys ✅",
              "Apskaita baigta! ☕",
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
            alt="Dokumentų automatizavimas"
            sx={{
              maxWidth: '100%',
              maxHeight: { xs: '450px', md: '600px' },
              borderRadius: 3,
              boxShadow: 3,
              objectFit: 'contain',
            }}
          />
        </Box>
      </Box>

      {/* Cost Comparison Section */}
      <Box
        id="sutaupykite"
        sx={{
          scrollMarginTop: { xs: '80px', md: '100px' },
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: '80px',
          marginBottom: '80px',
          background: '#fff',
          padding: { xs: 3, md: 6 },
          borderRadius: 4,
          boxShadow: '0px 4px 24px rgba(0,0,0,0.08)',
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
          Sutaupykite iki 93% apskaitos kaštų
        </Typography>

        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'center',
            alignItems: 'stretch',
            gap: 4,
            marginBottom: 5,
            width: '100%',
            maxWidth: '800px',
          }}
        >
          {/* Tradicinė apskaita */}
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: 4,
              borderRadius: 3,
              background: '#f5f5f5',
              border: '2px solid #e0e0e0',
            }}
          >
            <Typography
              variant="h5"
              sx={{
                fontFamily: 'Helvetica',
                fontWeight: 600,
                fontSize: '24px',
                marginBottom: 2,
                color: '#1b1b1b',
              }}
            >
              Tradicinė apskaita
            </Typography>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                color: '#d32f2f',
                fontSize: '36px',
                marginBottom: 1,
              }}
            >
              2-3 EUR
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: '#666',
                fontSize: '18px',
              }}
            >
              už dokumentą
            </Typography>
          </Box>

          {/* DokSkenas */}
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: 4,
              borderRadius: 3,
              background: '#fff6d8',
              border: '2px solid #f5cf54',
              boxShadow: '0px 4px 16px rgba(245,207,84,0.3)',
            }}
          >
            <Typography
              variant="h5"
              sx={{
                fontFamily: 'Helvetica',
                fontWeight: 600,
                fontSize: '24px',
                marginBottom: 2,
                color: '#1b1b1b',
              }}
            >
              DokSkenas
            </Typography>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                color: '#f5be0d',
                fontSize: '36px',
                marginBottom: 1,
              }}
            >
              0.18 EUR
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

        {/* Калькулятор */}
        <Box
          sx={{
            width: '100%',
            maxWidth: '600px',
            padding: 4,
            borderRadius: 3,
            background: '#f9f9fa',
            border: '1px solid #e0e0e0',
          }}
        >
          <Typography
            variant="h3"
            sx={{
              fontFamily: 'Helvetica',
              fontWeight: 600,
              fontSize: '26px',
              marginBottom: 3,
              textAlign: 'center',
            }}
          >
            Apskaičiuokite kiek sutaupysite
          </Typography>

          <Stack spacing={2} alignItems="center">
            <Typography variant="body1" sx={{ fontFamily: 'Helvetica', fontSize: '16px' }}>
              Kiek dokumentų apdorojate per mėnesį?
            </Typography>
            <TextField
              type="number"
              value={docCount}
              onChange={(e) => setDocCount(Math.max(1, parseInt(e.target.value) || 0))}
              sx={{
                width: '200px',
                '& input': {
                  textAlign: 'center',
                  fontSize: '24px',
                  fontWeight: 600,
                },
              }}
            />

            <Box sx={{ width: '100%', borderTop: '2px dashed #e0e0e0', marginY: 2 }} />

            <Stack spacing={1} sx={{ width: '100%' }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body1" sx={{ fontFamily: 'Helvetica' }}>
                  Apskaitos įmonė:
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  ~{traditionalCost.toFixed(2)} EUR
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body1" sx={{ fontFamily: 'Helvetica' }}>
                  DokSkenas:
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600, color: '#f5be0d' }}>
                  ~{dokskenasCost.toFixed(2)} EUR
                </Typography>
              </Stack>
              <Box sx={{ borderTop: '2px solid #f5cf54', marginY: 1 }} />
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="h6" sx={{ fontFamily: 'Helvetica', fontWeight: 700 }}>
                  Sutaupote:
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#2e7d32' }}>
                  ~{savings.toFixed(2)} EUR ({savingsPercent}%)
                </Typography>
              </Stack>
            </Stack>
          </Stack>
        </Box>

        <Typography
          variant="body1"
          sx={{
            maxWidth: 700,
            textAlign: 'center',
            color: '#1b1b1b',
            fontSize: '18px',
            marginTop: 4,
            fontFamily: 'Helvetica',
          }}
        >
          Ir tai tik per vieną mėnesį! Per metus sutaupytumėte <strong>~{(savings * 12).toFixed(0)} EUR</strong>
        </Typography>
      </Box>

      {/* Privalumai */}
      <Box
        id="privalumai"
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
          Privalumai
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
            { img: '/1.png', title: 'Sumažina apskaitos išlaidas 10-15 kartų' },
            { img: '/2.png', title: 'Eliminuoja žmogiškojo faktoriaus klaidas' },
            { img: '/3.png', title: 'Pašalina nuobodžiausią mėnesio užduotį' },
            { img: '/4.png', title: 'Patikrina duomenis ir sutikrina sumas' },
            { img: '/5.png', title: 'Automatiškai bando taisyti klaidas dokumentuose' },
            { img: '/6.png', title: 'Atmeta pasikartojancius ir netinkamus dokumentus' },
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

      {/* Kam tinka */}
      <Box
        id="kam-tinka"
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
          Kam tinka DokSkenas?
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' },
            gap: 4,
            width: '100%',
            maxWidth: '1000px',
          }}
        >
          {[
            { emoji: '👥', title: 'Mažosioms bendrijoms', desc: 'Kurios nori sumažinti apskaitos išlaidas ir automatizuoti dokumentų tvarkymą' },
            { emoji: '🏢', title: 'Įmonėms', desc: 'Apdorojančioms didelį kiekį dokumentų per mėnesį ir norinčioms optimizuoti procesus' },
            { emoji: '👤', title: 'Individualioms veikloms', desc: 'Turinčioms nemažai popierinių ar elektroninių dokumentų ir taupančioms savo laiką' },
          ].map((item, idx) => (
            <Box
              key={idx}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: 4,
                borderRadius: 3,
                background: '#fff',
                boxShadow: '0px 2px 16px rgba(0,0,0,0.06)',
              }}
            >
              <Typography sx={{ fontSize: '64px', marginBottom: 2 }}>{item.emoji}</Typography>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 600,
                  fontFamily: 'Helvetica',
                  fontSize: '20px',
                  marginBottom: 1,
                  textAlign: 'center',
                }}
              >
                {item.title}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontFamily: 'Helvetica',
                  fontSize: '16px',
                  textAlign: 'center',
                  color: '#555',
                }}
              >
                {item.desc}
              </Typography>
            </Box>
          ))}
        </Box>
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
              { label: 'Finvalda', url: 'https://atlyginimoskaiciuokle.com/finvalda', hasLink: true },
              { label: 'Rivilė GAMA', url: 'https://atlyginimoskaiciuokle.com/rivile', hasLink: true },
              { label: 'Rivilė ERP', url: 'https://atlyginimoskaiciuokle.com/rivile', hasLink: true },
              { label: 'Agnum', url: 'https://atlyginimoskaiciuokle.com/agnum', hasLink: true },
              { label: 'Centas', url: 'https://atlyginimoskaiciuokle.com/centas', hasLink: true },
              { label: 'Apskaita5', url: 'https://atlyginimoskaiciuokle.com/apskaita5', hasLink: true },
              { label: 'Pragma 3.2', url: 'https://atlyginimoskaiciuokle.com/pragma', hasLink: true },
              { label: 'Pragma 4', url: 'https://atlyginimoskaiciuokle.com/pragma', hasLink: true },
              { label: 'Būtenta', hasLink: false },
              { label: 'Site.pro', url: 'https://atlyginimoskaiciuokle.com/site-pro', hasLink: true },
              { label: 'Debetas', url: 'https://atlyginimoskaiciuokle.com/debetas', hasLink: true },
              { label: 'APSA', url: 'https://atlyginimoskaiciuokle.com/apsa', hasLink: true },
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

      {/* Saugumas */}
      <Box
        id="saugumas"
        sx={{
          scrollMarginTop: { xs: '80px', md: '100px' },
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: '80px',
          marginBottom: '80px',
          padding: { xs: 3, md: 5 },
          background: '#e7e7e7',
          borderRadius: 4,
        }}
      >
        <Box
          sx={{
            fontSize: '48px',
            marginBottom: 2,
          }}
        >
          🔒
        </Box>
        <Typography
          variant="h2"
          sx={{
            fontSize: '32px',
            fontFamily: 'Helvetica',
            fontWeight: 600,
            marginBottom: 3,
            textAlign: 'center',
          }}
        >
          Saugumas
        </Typography>
        <Typography
          variant="body1"
          sx={{
            maxWidth: 700,
            textAlign: 'center',
            color: '#1b1b1b',
            fontSize: '18px',
            fontFamily: 'Helvetica',
            lineHeight: 1.7,
            marginBottom: 2,
          }}
        >
          Mes rūpinamės mūsų klientų privatumu ir dokumentų duomenų saugumu. Visi duomenys yra šifruojami ir saugomi mūsų serveriuose pagal ES GDPR reikalavimus.
        </Typography>
        <Typography
          variant="body1"
          sx={{
            maxWidth: 700,
            textAlign: 'center',
            color: '#1b1b1b',
            fontSize: '18px',
            fontFamily: 'Helvetica',
            lineHeight: 1.7,
          }}
        >
          Jokių klientų duomenų neparduodame ir neperduodame su paslaugos vykdymu nesusijusiems tretiesiems asmenims ar bendrovėms.
        </Typography>
        <Button
          variant="text"
          href="/privatumo-politika"
          sx={{
            marginTop: 3,
            color: '#1b1b1b',
            textDecoration: 'underline',
            '&:hover': {
              color: '#1b1b1b',
            },
          }}
        >
          Daugiau apie privatumo politiką →
        </Button>
      </Box>

      <FaqSection />

      {/* Final CTA */}
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
            textAlign: "center",
            marginBottom: 2,
          }}
        >
          Pradėkite taupyti laiką ir pinigus dabar
        </Typography>
        <Typography variant="body1" sx={{ maxWidth:'70%', fontSize: '20px', textAlign: 'center', fontFamily: 'Helvetica', padding: 1, paddingBottom: '40px'}}>
          Išbandykite 50 skaitmenizavimų nemokamai ir įsitikinkite, kaip lengvai galite automatizuoti apskaitą
        </Typography>
        <Button
          variant="contained"
          size="large"
          href="/registruotis?src=skaitmenizavimas"
          sx={{ 
            backgroundColor: "#f5be0d",
            color: "black",
            "&:hover": { backgroundColor: "#f5cf54", color: "black" },
            padding: 1,
            paddingLeft: 4,
            paddingRight: 4,
            fontSize: '16px',
          }}
        >
          Išbandyti nemokamai
        </Button>
      </Box>
    </Box>
  );
};

export default BuhalterinenApskaita;