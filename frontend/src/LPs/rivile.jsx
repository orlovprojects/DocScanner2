import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Box, Typography, Button, Stack } from '@mui/material';


const ACCENT_COLOR = '#f5be0d';
const ACCENT_COLOR_HOVER = '#f5cf54';

const CheckIcon = ({ size = 24 }) => (
  <Box
    component="svg"
    viewBox="0 0 24 24"
    aria-hidden="true"
    sx={{ width: size, height: size, color: ACCENT_COLOR, flexShrink: 0 }}
  >
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="m8 12 2.6 2.6L16.5 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Box>
);

const PlayIcon = () => (
  <Box
    component="svg"
    viewBox="0 0 24 24"
    aria-hidden="true"
    sx={{ width: 30, height: 30, display: 'block' }}
  >
    <path d="M9 7.5 16 12l-7 4.5v-9Z" fill="currentColor" />
  </Box>
);

const StepIcon = ({ type }) => {
  const commonProps = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  return (
    <Box component="svg" viewBox="0 0 24 24" aria-hidden="true" sx={{ width: 25, height: 25 }}>
      {type === 'upload' && (
        <>
          <path {...commonProps} d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
          <path {...commonProps} d="M14 3v5h5M12 17v-6m0 0-2.5 2.5M12 11l2.5 2.5" />
        </>
      )}
      {type === 'scan' && (
        <>
          <path {...commonProps} d="M4 8V6a2 2 0 0 1 2-2h2m8 0h2a2 2 0 0 1 2 2v2M4 16v2a2 2 0 0 0 2 2h2m8 0h2a2 2 0 0 0 2-2v-2" />
          <path {...commonProps} d="M7 12h10M9 9h6M9 15h6" />
        </>
      )}
      {type === 'review' && (
        <>
          <path {...commonProps} d="M9 4h6l1 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2Z" />
          <path {...commonProps} d="m8.5 13 2.2 2.2 4.8-5" />
        </>
      )}
      {type === 'api' && (
        <>
          <path {...commonProps} d="M8 7H6a3 3 0 0 0 0 6h2m8-6h2a3 3 0 0 1 0 6h-2M9 10h6" />
          <path {...commonProps} d="M12 7v10m0 0-2.5-2.5M12 17l2.5-2.5" />
        </>
      )}
    </Box>
  );
};

/* ---------- helpers ---------- */
const getYouTubeId = (embedUrl) => {
  const m = embedUrl.match(/\/embed\/([^?]+)/);
  return m ? m[1] : '';
};

const LazyVideo = ({ src, title, sx = {} }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const videoId = getYouTubeId(src);
  const thumbUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: '900px',
        aspectRatio: '16/9',
        borderRadius: 3,
        overflow: 'hidden',
        boxShadow: 3,
        background: '#fff',
        ...sx,
      }}
    >
      {isLoaded ? (
        <Box
          component="iframe"
          src={`${src}?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3`}
          title={title}
          width="100%"
          height="100%"
          loading="lazy"
          sx={{ border: 'none', display: 'block' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <Box
          component="button"
          type="button"
          aria-label={`Paleisti video: ${title}`}
          onClick={() => setIsLoaded(true)}
          sx={{
            width: '100%',
            height: '100%',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
            padding: 3,
            color: '#fff',
            backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.35) 100%), url(${thumbUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            transition: 'filter 160ms ease',
            '&:hover': {
              filter: 'brightness(1.08)',
            },
            '&:hover .play-btn': {
              transform: 'scale(1.08)',
            },
          }}
        >
          <Box
            className="play-btn"
            sx={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#1b1b1b',
              backgroundColor: ACCENT_COLOR,
              boxShadow: '0px 8px 24px rgba(0,0,0,0.35)',
              transition: 'transform 160ms ease',
            }}
          >
            <PlayIcon />
          </Box>
          <Typography
            sx={{
              fontFamily: 'Helvetica',
              fontSize: { xs: '16px', sm: '19px' },
              fontWeight: 700,
              textAlign: 'center',
              color: '#fff',
              textShadow: '0 1px 4px rgba(0,0,0,0.4)',
            }}
          >
            {title}
          </Typography>
        </Box>
      )}
    </Box>
  );
};


const Rivile = () => {
  const [docCount, setDocCount] = useState(200);

  const traditionalCost = docCount * 2.5;
  const dokskenasCost = docCount * 0.18;
  const savings = traditionalCost - dokskenasCost;
  const savingsPercent = Math.round((savings / traditionalCost) * 100);

  const GAMA_API_VIDEO_URL = "https://www.youtube-nocookie.com/embed/mUTdwZDsGWQ";
  const GAMA_VIDEO_URL = "https://www.youtube-nocookie.com/embed/7uwLLA3uTQ0";
  const ERP_VIDEO_URL = "https://www.youtube-nocookie.com/embed/2ENROTqWfYw";
  const CODES_VIDEO_URL = "https://www.youtube-nocookie.com/embed/MftJl0_4jOE";

  return (
    <Box sx={{ bgcolor: '#F9F9FA', minHeight: '100vh', padding: { xs: 2, sm: 5 }, paddingTop: { xs: '50px', sm: '70px' }, width: '100%' }}>
      <Helmet>
        <title>Sąskaitų importas į Rivilę</title>
        <meta name="description" content="Automatizuokite sąskaitų faktūrų įvedimą į Rivilę Gama ir ERP. DokSkenas atpažįsta dokumentus ir eksportuoja duomenis į jūsų Rivilę" />
        <link rel="preconnect" href="https://img.youtube.com" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            {
              "@type": "ListItem",
              "position": 1,
              "name": "Pagrindinis",
              "item": "https://atlyginimoskaiciuokle.com/"
            },
            {
              "@type": "ListItem",
              "position": 2,
              "name": "Sąskaitų importas į Rivilę",
              "item": "https://atlyginimoskaiciuokle.com/rivile"
            }
          ]
        })}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "name": "DokSkenas",
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web",
          "description": "Automatinis sąskaitų faktūrų nuskaitymas ir eksportas į Rivilę Gama ir Rivilę ERP",
          "url": "https://atlyginimoskaiciuokle.com/rivile",
          "offers": [
            {
              "@type": "Offer",
              "name": "Sumiškai",
              "price": "0.18",
              "priceCurrency": "EUR",
              "priceSpecification": {
                "@type": "UnitPriceSpecification",
                "price": "0.18",
                "priceCurrency": "EUR",
                "unitText": "dokumentas"
              }
            },
            {
              "@type": "Offer",
              "name": "Detaliai su eilutėmis",
              "price": "0.23",
              "priceCurrency": "EUR",
              "priceSpecification": {
                "@type": "UnitPriceSpecification",
                "price": "0.23",
                "priceCurrency": "EUR",
                "unitText": "dokumentas"
              }
            }
          ]
        })}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "HowTo",
          "name": "Kaip importuoti sąskaitas į Rivilę su DokSkenu",
          "description": "Automatizuokite sąskaitų faktūrų nuskaitymą ir įvedimą į Rivilę Gama arba Rivilę ERP",
          "step": [
            {
              "@type": "HowToStep",
              "position": 1,
              "name": "Įkelkite dokumentus",
              "text": "Tinka beveik visi dokumentų, nuotraukų bei archyvų formatai. Įkelkite vieną ar kelis dokumentus vienu metu."
            },
            {
              "@type": "HowToStep",
              "position": 2,
              "name": "Sistema nuskaito ir patikrina",
              "text": "DokSkenas atpažįsta duomenis per ~30 sekundžių. Klaidos ir dublikatai pažymimi automatiškai."
            },
            {
              "@type": "HowToStep",
              "position": 3,
              "name": "Eksportuokite į Rivilę per API",
              "text": "Duomenys keliauja tiesiai į jūsų Rivilę Gama arba ERP keliais mygtukų paspaudimais - be jokių failų."
            }
          ]
        })}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "VideoObject",
              "name": "Importas į Rivilę Gama per API",
              "description": "Kaip siųsti skaitmenizuotus dokumentus iš DokSkeno į Rivilę Gama per API",
              "thumbnailUrl": "https://img.youtube.com/vi/mUTdwZDsGWQ/maxresdefault.jpg",
              "uploadDate": "2026-01-01",
              "contentUrl": "https://www.youtube.com/watch?v=mUTdwZDsGWQ",
              "embedUrl": "https://www.youtube-nocookie.com/embed/mUTdwZDsGWQ"
            },
            {
              "@type": "VideoObject",
              "name": "Importas į Rivilę Gama per failus",
              "description": "Kaip importuoti sąskaitas į Rivilę Gama per failus, skaitmenizuotas su DokSkenas",
              "thumbnailUrl": "https://img.youtube.com/vi/7uwLLA3uTQ0/maxresdefault.jpg",
              "uploadDate": "2026-01-01",
              "contentUrl": "https://www.youtube.com/watch?v=7uwLLA3uTQ0",
              "embedUrl": "https://www.youtube-nocookie.com/embed/7uwLLA3uTQ0"
            },
            {
              "@type": "VideoObject",
              "name": "Importas į Rivilę ERP",
              "description": "Kaip importuoti sąskaitas į Rivilę ERP, skaitmenizuotas su DokSkenas",
              "thumbnailUrl": "https://img.youtube.com/vi/2ENROTqWfYw/maxresdefault.jpg",
              "uploadDate": "2026-01-01",
              "contentUrl": "https://www.youtube.com/watch?v=2ENROTqWfYw",
              "embedUrl": "https://www.youtube-nocookie.com/embed/2ENROTqWfYw"
            },
            {
              "@type": "VideoObject",
              "name": "Automatinis prekių, paslaugų ar kodų iš Rivilės priskyrimas",
              "description": "Kaip nusistatyti, kad prekės, paslaugos ar kodai iš Rivilės automatiškai prisiskirtų dokumentams",
              "thumbnailUrl": "https://img.youtube.com/vi/MftJl0_4jOE/maxresdefault.jpg",
              "uploadDate": "2026-01-01",
              "contentUrl": "https://www.youtube.com/watch?v=MftJl0_4jOE",
              "embedUrl": "https://www.youtube-nocookie.com/embed/MftJl0_4jOE"
            }
          ]
        })}</script>
      </Helmet>

      {/* Hero Section */}
      <Box
        sx={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          paddingBottom: { xs: '40px', sm: '60px' },
        }}
      >
        <Typography
          variant="h1"
          sx={{
            fontSize: { xs: '32px', sm: '60px' },
            fontFamily: 'Helvetica',
            fontWeight: '600',
            marginBottom: 3,
            maxWidth: '1000px',
          }}
        >
          Sąskaitų importas į Rivilę
        </Typography>
        <Typography
          variant="body1"
          sx={{
            maxWidth: '800px',
            marginBottom: 2,
            fontSize: '20px',
            fontFamily: 'Helvetica',
            color: '#333',
          }}
        >
          Automatizuokite sąskaitų faktūrų nuskaitymą ir įvedimą į Rivilę Gama arba Rivilę ERP bei išvenkite nuobodaus darbo ir klaidų apskaitoje.
        </Typography>
        <Typography
          variant="body1"
          sx={{
            maxWidth: '800px',
            marginBottom: 4,
            fontSize: '20px',
            fontFamily: 'Helvetica',
            color: '#333',
          }}
        >
          DokSkenas atpažįsta dokumentus ir išsiunčia duomenis į jūsų Rivilę per API arba
          paruošia failus, jei norite importuoti duomenis rankiniu būdų.
        </Typography>
        <Button
          variant="contained"
          size="large"
          href="/registruotis?src=skaitmenizavimas"
          sx={{
            backgroundColor: ACCENT_COLOR,
            color: "black",
            "&:hover": { backgroundColor: ACCENT_COLOR_HOVER, color: "black" },
            padding: '14px 50px',
            fontSize: '18px',
          }}
        >
          Išbandyti nemokamai
        </Button>
      </Box>

      {/* Importas į Rivilę Gama */}
      <Box
        sx={{
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
          Importas į Rivilę Gama
        </Typography>
        <Typography
          variant="body1"
          sx={{
            maxWidth: '800px',
            marginBottom: 4,
            fontSize: '18px',
            fontFamily: 'Helvetica',
            color: '#333',
            textAlign: 'center',
          }}
        >
          Yra 2 būdai eksportuoti skaitmenizuotų sąskaitų duomenis į Rivilę Gama: per API (rekomenduojamas) arba
          rankiniu būdu importuojant failus.
          Šiame video parodome pilną procesą nuo sąskaitų įkėlimo skaitmenizuoti iki duomenų importo į Rivilę Gama.
        </Typography>

        {/* === Rekomenduojamas būdas – per API === */}
        <Box
          sx={{
            maxWidth: '940px',
            width: '100%',
            marginBottom: 6,
            padding: { xs: 2.5, sm: 4 },
            borderRadius: 3,
            background: '#fff',
            border: '2px solid #f5be0d',
            boxShadow: '0px 4px 24px rgba(245,190,13,0.12)',
            position: 'relative',
          }}
        >
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              backgroundColor: ACCENT_COLOR,
              color: '#1b1b1b',
              borderRadius: '20px',
              padding: '5px 16px',
              fontFamily: 'Helvetica',
              fontWeight: 700,
              fontSize: '13px',
              letterSpacing: '0.02em',
              marginBottom: 2,
            }}
          >
            ★ REKOMENDUOJAMAS
          </Box>
          <Typography
            variant="h3"
            sx={{
              fontSize: { xs: '22px', sm: '26px' },
              fontFamily: 'Helvetica',
              fontWeight: 700,
              color: '#1b1b1b',
              marginBottom: 2,
            }}
          >
            Būdas #1 - per API
          </Typography>
          <Typography
            variant="body1"
            sx={{
              maxWidth: '800px',
              marginBottom: 2,
              fontSize: '18px',
              fontFamily: 'Helvetica',
              color: '#333',
            }}
          >
            Norint eksportuoti sąskaitų duomenis per API, susisiekite su savo Rivilės administratoriumi, kad sugeneruotų jums
            API raktą, kurį reikės įvesti DokSkeno nustatymuose.
          </Typography>
          <Typography
            variant="body1"
            sx={{
              maxWidth: '800px',
              marginBottom: 3,
              fontSize: '18px',
              fontFamily: 'Helvetica',
              color: '#333',
            }}
          >
            Įvedus bei patikrinus API raktą, galėsite eksportuoti duomenis tiesiai į savo Rivilę keliais mygtukų paspaudimais.
            Plačiau šiame video:
          </Typography>
          <LazyVideo
            src={GAMA_API_VIDEO_URL}
            title="Importas į Rivilę Gama per API"
          />
        </Box>

        {/* === Būdas #2 – per failus === */}
        <Box
          sx={{
            maxWidth: '940px',
            width: '100%',
            marginBottom: 5,
            padding: { xs: 2.5, sm: 4 },
            borderRadius: 3,
            background: '#fff',
            boxShadow: '0px 2px 16px rgba(0,0,0,0.06)',
          }}
        >
          <Typography
            variant="h3"
            sx={{
              fontSize: { xs: '22px', sm: '26px' },
              fontFamily: 'Helvetica',
              fontWeight: 700,
              color: '#1b1b1b',
              marginBottom: 2,
            }}
          >
            Būdas #2 - per failus
          </Typography>
          <Typography
            variant="body1"
            sx={{
              maxWidth: '800px',
              marginBottom: 3,
              fontSize: '18px',
              fontFamily: 'Helvetica',
              color: '#333',
            }}
          >
            Jei vis dėlto norite eksportuoti duomenis ne per API, o failus, šis video parodo visą skaitmenizavimo bei
            duomenų per failus importą į Rivilę Gama:
          </Typography>
          <LazyVideo
            src={GAMA_VIDEO_URL}
            title="Importas į Rivilę Gama per failus"
          />
        </Box>

        {/* Ką galima importuoti į Rivilę Gama? */}
        <Typography
          variant="h3"
          sx={{
            fontSize: { xs: '24px', sm: '28px' },
            fontFamily: 'Helvetica',
            fontWeight: 700,
            marginBottom: 4,
            textAlign: 'center',
          }}
        >
          Ką galima importuoti į Rivilę Gama?
        </Typography>
        <Stack spacing={2.5} sx={{ maxWidth: '500px', width: '100%' }}>
          {[
            'Pirkimus',
            'Pardavimus',
            'Prekes / paslaugas / kodus',
            'Kontrahentus (įmones ir fizinius asmenis)',
          ].map((item, idx) => (
            <Stack key={idx} direction="row" alignItems="center" spacing={2}>
              <CheckIcon size={28} />
              <Typography sx={{ fontSize: '20px', fontFamily: 'Helvetica', color: '#1b1b1b' }}>
                {item}
              </Typography>
            </Stack>
          ))}
        </Stack>
        <Typography
          variant="body1"
          sx={{
            maxWidth: '800px',
            marginTop: 4,
            fontSize: '18px',
            fontFamily: 'Helvetica',
            color: '#333',
            textAlign: 'center',
          }}
        >
          Importavus duomenis prekių, paslaugų, kodų bei kontrahentų kortelės automatiškai susikurs Rivilėje Gama.
        </Typography>

        {/* Papildoma informacija apie Gama */}
        <Box
          sx={{
            maxWidth: '900px',
            width: '100%',
            marginTop: 5,
            padding: { xs: 2.5, sm: 4 },
            borderRadius: 3,
            background: '#fff',
            boxShadow: '0px 2px 16px rgba(0,0,0,0.06)',
          }}
        >
          <Typography
            variant="body1"
            sx={{
              fontSize: '17px',
              fontFamily: 'Helvetica',
              color: '#333',
              marginBottom: 2,
            }}
          >
            Kad nesikurtų naujos prekių ir paslaugų kortelės kiekvienai eilutei iš jūsų dokumentų, galite DokSkene nusistatyti sąlygas, pagal kurias prisiskirs prekės, paslaugos ar kodai iš jūsų Rivilės Gama.
          </Typography>
          <Typography
            variant="body1"
            sx={{
              fontSize: '17px',
              fontFamily: 'Helvetica',
              color: '#333',
              marginBottom: 2,
            }}
          >
            Tada bus panaudotos jau sukurtos kortelės iš jūsų Rivilės Gama. Kaip tai padaryti žiūrėkite sekančius video.
          </Typography>
          <Typography
            variant="body1"
            sx={{
              fontSize: '17px',
              fontFamily: 'Helvetica',
              color: '#333',
              marginBottom: 2,
            }}
          >
            Naujausias valiutos kursas iš Lietuvos banko taip pat bus priskirtas automatiškai, Rivilėje Gama nieko papildomai nusistatyti nereikia.
          </Typography>
          <Typography
            variant="body1"
            sx={{
              fontSize: '17px',
              fontFamily: 'Helvetica',
              color: '#333',
              marginBottom: 2,
            }}
          >
            Matavimo vienetai Rivilėje Gama automatiškai nesusikuria. Todėl prieš importuojant duomenis reikėtų sukurti matavimo vienetus, kurie naudojami jūsų sąskaitose.
          </Typography>
          <Typography
            variant="body1"
            sx={{
              fontSize: '17px',
              fontFamily: 'Helvetica',
              color: '#333',
              marginBottom: 3,
            }}
          >
            Tai galite padaryti <Box component="span" sx={{ fontWeight: 600 }}>(Kortelės → Matavimo vienetai)</Box>.
          </Typography>
          <Typography
            variant="body1"
            sx={{
              fontSize: '17px',
              fontFamily: 'Helvetica',
              color: '#333',
              marginBottom: 2,
            }}
          >
            Be to DokSkeno nustatymuose galite nusistatyti numatytąsias reikšmes šių laukų, kurie automatiškai prisiskirs jūsų skaitmenizuotiems dokumentams:
          </Typography>
          <Box
            component="img"
            src="rivile_gama_papildomi_laukai.jpg"
            alt="Rivilė Gama papildomi laukai"
            width="1854"
            height="1778"
            loading="lazy"
            decoding="async"
            sx={{
              width: '100%',
              height: 'auto',
              display: 'block',
              borderRadius: 2,
              marginY: 2,
              boxShadow: '0px 2px 8px rgba(0,0,0,0.1)',
            }}
          />
          <Typography
            variant="body1"
            sx={{
              fontSize: '17px',
              fontFamily: 'Helvetica',
              color: '#333',
              marginTop: 2,
            }}
          >
            Reikšmės nustatomos atskirai pirkimams ir pardavimams.
          </Typography>
        </Box>
      </Box>

      {/* Importas į Rivilę ERP */}
      <Box
        sx={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: '80px',
          marginBottom: '80px',
          contentVisibility: 'auto',
          containIntrinsicSize: '900px',
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
          Importas į Rivilę ERP
        </Typography>
        <Typography
          variant="body1"
          sx={{
            maxWidth: '800px',
            marginBottom: 4,
            fontSize: '18px',
            fontFamily: 'Helvetica',
            color: '#333',
            textAlign: 'center',
          }}
        >
          Šiame video parodome pilną procesą nuo sąskaitų įkėlimo skaitmenizuoti iki duomenų importo į Rivilę ERP.
        </Typography>
        <LazyVideo
          src={ERP_VIDEO_URL}
          title="Importas į Rivilę ERP"
          sx={{ marginBottom: 5 }}
        />

        {/* Ką galima importuoti į Rivilę ERP? */}
        <Typography
          variant="h3"
          sx={{
            fontSize: { xs: '24px', sm: '28px' },
            fontFamily: 'Helvetica',
            fontWeight: 700,
            marginBottom: 4,
            textAlign: 'center',
          }}
        >
          Ką galima importuoti į Rivilę ERP?
        </Typography>
        <Stack spacing={2.5} sx={{ maxWidth: '500px', width: '100%' }}>
          {[
            'Pirkimus',
            'Pardavimus',
            'Prekes / paslaugas',
            'Kontrahentus (įmones ir fizinius asmenis)',
          ].map((item, idx) => (
            <Stack key={idx} direction="row" alignItems="center" spacing={2}>
              <CheckIcon size={28} />
              <Typography sx={{ fontSize: '20px', fontFamily: 'Helvetica', color: '#1b1b1b' }}>
                {item}
              </Typography>
            </Stack>
          ))}
        </Stack>
        <Typography
          variant="body1"
          sx={{
            maxWidth: '800px',
            marginTop: 4,
            fontSize: '18px',
            fontFamily: 'Helvetica',
            color: '#333',
            textAlign: 'center',
          }}
        >
          Importavus duomenis prekių, paslaugų bei kontrahentų kortelės automatiškai susikurs Rivilėje ERP.
        </Typography>

        {/* Papildoma informacija apie ERP */}
        <Box
          sx={{
            maxWidth: '900px',
            width: '100%',
            marginTop: 5,
            padding: { xs: 2.5, sm: 4 },
            borderRadius: 3,
            background: '#fff',
            boxShadow: '0px 2px 16px rgba(0,0,0,0.06)',
          }}
        >
          <Typography
            variant="body1"
            sx={{
              fontSize: '17px',
              fontFamily: 'Helvetica',
              color: '#333',
              marginBottom: 2,
            }}
          >
            Kad nesikurtų naujos prekių ir paslaugų kortelės kiekvienai eilutei iš jūsų dokumentų, galite DokSkene nusistatyti sąlygas, pagal kurias prisiskirs prekių ar paslaugų kodai iš jūsų Rivilės ERP.
          </Typography>
          <Typography
            variant="body1"
            sx={{
              fontSize: '17px',
              fontFamily: 'Helvetica',
              color: '#333',
              marginBottom: 2,
            }}
          >
            Tada bus panaudotos jau sukurtos kortelės iš jūsų Rivilės ERP. Kaip tai padaryti žiūrėkite sekantį video šiame gide.
          </Typography>
          <Typography
            variant="body1"
            sx={{
              fontSize: '17px',
              fontFamily: 'Helvetica',
              color: '#333',
              marginBottom: 2,
            }}
          >
            Valiutinėms sąskaitoms Rivilė ERP pati importuoja valiutų kursus. Video paaiškinta, kaip aktyvuoti valiutas ir importuoti valiutų kursus tam Rivilėje ERP:
          </Typography>
          <Stack spacing={1} sx={{ marginBottom: 2, paddingLeft: 2 }}>
            <Typography
              variant="body1"
              sx={{
                fontSize: '17px',
                fontFamily: 'Helvetica',
                color: '#333',
              }}
            >
              • Aktyvuokite užsienio valiutą <Box component="span" sx={{ fontWeight: 600 }}>(Nustatymai → Apskaita → Valiutų kursai)</Box>
            </Typography>
            <Typography
              variant="body1"
              sx={{
                fontSize: '17px',
                fontFamily: 'Helvetica',
                color: '#333',
              }}
            >
              • Nusistatykite automatizacijas, kad valiutų kursai importuotųsi kiekvieną dieną <Box component="span" sx={{ fontWeight: 600 }}>(Nustatymai → Bendrieji → Automatizacijos)</Box>. Žiūrėkite video.
            </Typography>
          </Stack>
          <Box
            sx={{
              backgroundColor: '#fff3cd',
              padding: 2,
              borderRadius: 2,
              borderLeft: '4px solid #f5be0d',
              marginBottom: 3,
            }}
          >
            <Typography
              variant="body1"
              sx={{
                fontSize: '16px',
                fontFamily: 'Helvetica',
                color: '#856404',
              }}
            >
              <strong>Svarbu:</strong> To nepadarius importuojant pirkimus ar pardavimus gausite klaidą „Cannot read field "intCompact" because "&lt;parameter1&gt;" is null".
            </Typography>
          </Box>
          <Typography
            variant="body1"
            sx={{
              fontSize: '17px',
              fontFamily: 'Helvetica',
              color: '#333',
              marginBottom: 2,
            }}
          >
            Matavimo vienetai Rivilėje ERP automatiškai nesusikuria. Todėl prieš importuojant duomenis reikėtų sukurti matavimo vienetus, kurie naudojami jūsų sąskaitose.
          </Typography>
          <Typography
            variant="body1"
            sx={{
              fontSize: '17px',
              fontFamily: 'Helvetica',
              color: '#333',
              marginBottom: 3,
            }}
          >
            Tai galite padaryti <Box component="span" sx={{ fontWeight: 600 }}>(Nustatymai → Atsargos ir logistika → Matavimo vienetai)</Box>.
          </Typography>
          <Typography
            variant="body1"
            sx={{
              fontSize: '17px',
              fontFamily: 'Helvetica',
              color: '#333',
              marginBottom: 2,
            }}
          >
            Be to DokSkeno nustatymuose galite nusistatyti numatytąsias reikšmes šių laukų, kurie automatiškai prisiskirs jūsų skaitmenizuotiems dokumentams:
          </Typography>
          <Box
            component="img"
            src="rivile_erp_papildomi_laukai.jpg"
            alt="Rivilė ERP papildomi laukai"
            width="1847"
            height="774"
            loading="lazy"
            decoding="async"
            sx={{
              width: '100%',
              height: 'auto',
              display: 'block',
              borderRadius: 2,
              marginY: 2,
              boxShadow: '0px 2px 8px rgba(0,0,0,0.1)',
            }}
          />
          <Typography
            variant="body1"
            sx={{
              fontSize: '17px',
              fontFamily: 'Helvetica',
              color: '#333',
              marginTop: 2,
            }}
          >
            Reikšmės nustatomos atskirai pirkimams ir pardavimams.
          </Typography>
        </Box>
      </Box>

      {/* Ką nuskaito DokSkenas? */}
      <Box
        sx={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: '80px',
          marginBottom: '80px',
          contentVisibility: 'auto',
          containIntrinsicSize: '900px',
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
          Ką nuskaito DokSkenas?
        </Typography>
        <Typography
          variant="body1"
          sx={{
            maxWidth: '800px',
            marginBottom: 5,
            fontSize: '18px',
            fontFamily: 'Helvetica',
            color: '#333',
            textAlign: 'center',
          }}
        >
          Sąskaitas galite skaitmenizuoti sumiškai arba detaliai su eilutėmis.
        </Typography>

        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            gap: { xs: 3, md: 4 },
            width: '100%',
            maxWidth: '1100px',
            justifyContent: 'center',
            padding: { xs: 0, sm: 2 },
          }}
        >
          {/* Sumiškai */}
          <Box
            sx={{
              flex: 1,
              padding: { xs: 2.5, sm: 4 },
              borderRadius: 3,
              background: '#fff',
              boxShadow: '0px 2px 16px rgba(0,0,0,0.06)',
            }}
          >
            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                marginBottom: 3,
                fontSize: { xs: '18px', sm: '22px' },
                fontFamily: 'Helvetica',
                color: '#1b1b1b',
                textAlign: 'center',
              }}
            >
              Skaitmenizuojant sumiškai nuskaitomi:
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 1.5,
              }}
            >
              {[
                'Tiekėjo rekvizitai',
                'Pirkėjo rekvizitai',
                'Sąskaitos numeris, serija ir data',
                'Užsakymo numeris ir operacijos data',
                'Mokėjimo terminas',
                'Nuolaidos',
                'Suma be PVM',
                'PVM suma',
                'PVM procentas',
                'Suma su PVM',
                'Valiutos kodas',
                'Apmokėjimo grynaisiais požymis',
              ].map((item, idx) => (
                <Stack key={idx} direction="row" alignItems="center" spacing={1.5}>
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: '#f5be0d',
                      flexShrink: 0,
                    }}
                  />
                  <Typography sx={{ fontSize: '16px', fontFamily: 'Helvetica', color: '#1b1b1b' }}>
                    {item}
                  </Typography>
                </Stack>
              ))}
            </Box>
          </Box>

          {/* Detaliai */}
          <Box
            sx={{
              flex: 1,
              padding: { xs: 2.5, sm: 4 },
              borderRadius: 3,
              background: '#fff',
              boxShadow: '0px 2px 16px rgba(0,0,0,0.06)',
            }}
          >
            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                marginBottom: 3,
                fontSize: { xs: '18px', sm: '22px' },
                fontFamily: 'Helvetica',
                color: '#1b1b1b',
                textAlign: 'center',
              }}
            >
              Skaitmenizuojant detaliai papildomai nuskaitomos eilutės su:
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 1.5,
              }}
            >
              {[
                'Pavadinimu',
                'Kodu',
                'Barkodu',
                'Mato vienetu',
                'Kiekiu',
                'Kaina',
                'Suma be PVM',
                'PVM suma',
                'PVM procentu',
                'Suma su PVM',
                'Nuolaidomis',
              ].map((item, idx) => (
                <Stack key={idx} direction="row" alignItems="center" spacing={1.5}>
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: '#f5be0d',
                      flexShrink: 0,
                    }}
                  />
                  <Typography sx={{ fontSize: '16px', fontFamily: 'Helvetica', color: '#1b1b1b' }}>
                    {item}
                  </Typography>
                </Stack>
              ))}
            </Box>
          </Box>
        </Box>

        <Typography
          variant="body1"
          sx={{
            maxWidth: '800px',
            marginTop: 4,
            fontSize: '18px',
            fontFamily: 'Helvetica',
            color: '#333',
            textAlign: 'center',
          }}
        >
          Taip pat sistema automatiškai priskiria PVM klasifikatorius.
        </Typography>

        {/* Kaip tai veikia? - 3 steps, API-push */}
        <Typography
          variant="h3"
          sx={{
            fontSize: { xs: '24px', sm: '28px' },
            fontFamily: 'Helvetica',
            fontWeight: 700,
            marginBottom: 4,
            marginTop: 8,
            textAlign: 'center',
          }}
        >
          Kaip tai veikia?
        </Typography>

        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            gap: 3,
            maxWidth: '1000px',
            width: '100%',
            alignItems: 'stretch',
          }}
        >
          {[
            {
              step: 1,
              icon: 'upload',
              bold: 'Įkelkite dokumentus',
              text: 'Tinka beveik visi dokumentų, nuotraukų bei archyvų formatai. Įkelkite vieną ar kelis dokumentus vienu metu.',
            },
            {
              step: 2,
              icon: 'scan',
              bold: 'Sistema nuskaito ir patikrina',
              text: 'DokSkenas atpažįsta duomenis per ~30 sek. Klaidos ir dublikatai pažymimi automatiškai - pakoreguokite, jei reikia.',
            },
            {
              step: 3,
              icon: 'api',
              bold: 'Eksportuokite į Rivilę',
              text: 'Duomenys keliauja tiesiai į jūsų Rivilę Gama arba ERP keliais mygtukų paspaudimais.',
            },
          ].map((item) => (
            <Box
              key={item.step}
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                padding: { xs: 2.5, sm: 3 },
                borderRadius: 3,
                backgroundColor: '#fff',
                border: '1px solid #f1e6b7',
                boxShadow: '0px 2px 12px rgba(0,0,0,0.04)',
                position: 'relative',
              }}
            >
              {/* connector line on desktop */}
              {item.step < 3 && (
                <Box
                  sx={{
                    display: { xs: 'none', md: 'block' },
                    position: 'absolute',
                    top: '36px',
                    right: '-18px',
                    width: '36px',
                    height: '2px',
                    backgroundColor: '#f1e6b7',
                    zIndex: 1,
                  }}
                />
              )}
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: 3,
                  backgroundColor: '#fff6d8',
                  color: '#1b1b1b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  marginBottom: 2,
                }}
              >
                <StepIcon type={item.icon} />
                <Box
                  sx={{
                    position: 'absolute',
                    top: -8,
                    right: -8,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: ACCENT_COLOR,
                    color: '#1b1b1b',
                    fontFamily: 'Helvetica',
                    fontWeight: 700,
                    fontSize: '12px',
                  }}
                >
                  {item.step}
                </Box>
              </Box>
              <Typography
                sx={{
                  fontFamily: 'Helvetica',
                  fontWeight: 700,
                  fontSize: { xs: '17px', sm: '18px' },
                  color: '#1b1b1b',
                  marginBottom: 1,
                }}
              >
                {item.bold}
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  fontSize: '16px',
                  fontFamily: 'Helvetica',
                  color: '#555',
                }}
              >
                {item.text}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Privalumai */}
        <Typography
          variant="h3"
          sx={{
            fontSize: { xs: '24px', sm: '28px' },
            fontFamily: 'Helvetica',
            fontWeight: 700,
            marginBottom: 4,
            marginTop: 8,
            textAlign: 'center',
          }}
        >
          Privalumai
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: 2,
            maxWidth: '1000px',
            width: '100%',
          }}
        >
          {[
            'Skaitmenizuoja sumiškai ir kiekybiškai',
            'Atmeta dublikatus bei netinkamus dokumentus',
            'Automatiškai priskiria prekes/paslaugas/kodus iš jūsų Rivilės Gama arba prekes/paslaugas iš Rivilės ERP',
            'Nuskaito kreditines bei debetines sąskaitas',
            'Nuskaito ir kuro čekius',
            'Patikrina ar galioja PVM kodai',
            'Atpažįsta nuolaidas',
            'Nuskaito sąskaitas su skirtingais PVM procentais',
            'Priskiria PVM klasifikatorių',
            'Sutikrina LT įmonių duomenis su Registrų centru',
            'Priskiria valiutų kursus iš Lietuvos banko',
            'Atpažįsta kur prekė, kur paslauga',
            'Rūšiuoja sąskaitas pagal kontrahentus',
            'Formuoja OSS ataskaitas',
            'Formuoja individualios veiklos žurnalą',
            'Pažymi, kuriuos dokumentus siųsti į iSAF, o kuriuos ne',
            'Veikia su bet kokiais dokumentais: lietuviškais, ES, užsienietiškais',
            'Suranda ir pataiso klaidas dokumentuose',
          ].map((item, idx) => (
            <Stack key={idx} direction="row" alignItems="center" spacing={1.5}>
              <CheckIcon size={24} />
              <Typography sx={{ fontSize: '17px', fontFamily: 'Helvetica', color: '#1b1b1b' }}>
                {item}
              </Typography>
            </Stack>
          ))}
        </Box>
        <Box
          sx={{
            marginTop: 5,
            padding: 3,
            backgroundColor: '#fff6d8',
            borderRadius: 3,
            textAlign: 'center',
            maxWidth: '700px',
          }}
        >
          <Typography
            sx={{
              fontSize: '22px',
              fontFamily: 'Helvetica',
              fontWeight: 600,
              color: '#1b1b1b',
            }}
          >
            Vidutiniškai sutaupo 4,5 minutės darbo ir 93% finansinių kaštų vienam dokumentui
          </Typography>
        </Box>
      </Box>

      {/* Automatinis prekių, paslaugų ar kodų iš Rivilės priskyrimas */}
      <Box
        sx={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: '80px',
          marginBottom: '80px',
          contentVisibility: 'auto',
          containIntrinsicSize: '900px',
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
            maxWidth: '900px',
          }}
        >
          Automatinis prekių, paslaugų ar kodų iš Rivilės priskyrimas
        </Typography>
        <Typography
          variant="body1"
          sx={{
            maxWidth: '800px',
            marginBottom: 4,
            fontSize: '18px',
            fontFamily: 'Helvetica',
            color: '#333',
            textAlign: 'center',
          }}
        >
          Šiame video parodome kaip nusistatyti, kad prekės, paslaugos ar kodai iš Rivilės automatiškai prisiskirtų jūsų dokumentams, pagal jūsų nustatytas sąlygas.
        </Typography>
        <LazyVideo
          src={CODES_VIDEO_URL}
          title="Automatinis prekių, paslaugų ar kodų iš Rivilės priskyrimas"
        />
      </Box>

      {/* Kainos */}
      <Box
        sx={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: '80px',
          marginBottom: '80px',
          contentVisibility: 'auto',
          containIntrinsicSize: '900px',
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
          Kainos
        </Typography>
        <Typography
          variant="body1"
          sx={{
            maxWidth: '700px',
            marginBottom: 5,
            fontSize: '18px',
            fontFamily: 'Helvetica',
            color: '#555',
            textAlign: 'center',
          }}
        >
          Nėra mėnesinio mokesčio - mokate tik už tai, ką skaitmenizuojate
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 3,
            width: '100%',
            maxWidth: '760px',
            marginBottom: 4,
          }}
        >
          {[
            { title: 'Sumiškai', price: '0,18', note: 'už dokumentą' },
            { title: 'Detaliai su eilutėmis', price: '0,23', note: 'už dokumentą' },
          ].map((plan) => (
            <Box
              key={plan.title}
              sx={{
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: { xs: 3, sm: 4 },
                borderRadius: 3,
                background: '#fff',
                border: '1px solid #f1e6b7',
                boxShadow: '0px 6px 20px rgba(0,0,0,0.05)',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 5,
                  backgroundColor: ACCENT_COLOR,
                },
              }}
            >
              <Typography
                variant="h5"
                sx={{
                  fontFamily: 'Helvetica',
                  fontWeight: 700,
                  fontSize: '22px',
                  marginBottom: 1.5,
                  color: '#1b1b1b',
                  textAlign: 'center',
                }}
              >
                {plan.title}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="baseline">
                <Typography sx={{ fontFamily: 'Helvetica', fontWeight: 700, color: '#1b1b1b', fontSize: { xs: '42px', sm: '48px' }, lineHeight: 1 }}>
                  {plan.price}
                </Typography>
                <Typography sx={{ fontFamily: 'Helvetica', fontWeight: 700, color: '#666', fontSize: '17px' }}>
                  EUR
                </Typography>
              </Stack>
              <Typography sx={{ marginTop: 1, color: '#555', fontFamily: 'Helvetica', fontSize: '17px' }}>
                {plan.note}
              </Typography>
            </Box>
          ))}
        </Box>

        <Stack spacing={1.5} sx={{ maxWidth: '700px', width: '100%', marginBottom: 5 }}>
          {[
            'Atsiskaitymas vyksta kreditais. Perkant daugiau - iki 20% nuolaidos.',
            'Už dublikatus ir netinkamus dokumentus nemokate.',
          ].map((item) => (
            <Stack key={item} direction="row" alignItems="center" spacing={1.5}>
              <CheckIcon size={22} />
              <Typography sx={{ fontSize: '18px', fontFamily: 'Helvetica', color: '#333' }}>
                {item}
              </Typography>
            </Stack>
          ))}
        </Stack>

        {/* Калькулятор */}
        <Box
          sx={{
            width: '100%',
            maxWidth: '760px',
            borderRadius: 3,
            overflow: 'hidden',
            border: '1px solid #f1e6b7',
            boxShadow: '0px 6px 24px rgba(0,0,0,0.06)',
          }}
        >
          {/* header */}
          <Box
            sx={{
              padding: { xs: 2.5, sm: 3 },
              background: 'linear-gradient(135deg, #fff8e0 0%, #fff3c4 100%)',
              borderBottom: '1px solid #f1e6b7',
              textAlign: 'center',
            }}
          >
            <Typography
              variant="h3"
              sx={{
                fontFamily: 'Helvetica',
                fontWeight: 700,
                fontSize: { xs: '21px', sm: '25px' },
                color: '#1b1b1b',
              }}
            >
              Pasiskaičiuokite, kiek sutaupysite
            </Typography>
          </Box>
          {/* body */}
          <Box sx={{ padding: { xs: 2.5, sm: 4 }, background: '#fff' }}>
            <Stack spacing={3} alignItems="center">
              <Typography variant="body1" sx={{ fontFamily: 'Helvetica', fontSize: '18px', textAlign: 'center', color: '#333' }}>
                Kiek dokumentų apdorojate per mėnesį?
              </Typography>
              <Box
                component="input"
                type="number"
                min="1"
                inputMode="numeric"
                value={docCount}
                onChange={(e) => setDocCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                aria-label="Kiek dokumentų apdorojate per mėnesį?"
                sx={{
                  width: '180px',
                  padding: '12px 14px',
                  borderRadius: 2,
                  border: '2px solid #f5cf54',
                  outline: 'none',
                  backgroundColor: '#fffdf5',
                  textAlign: 'center',
                  fontFamily: 'Helvetica',
                  fontSize: '28px',
                  fontWeight: 700,
                  color: '#1b1b1b',
                  '&:focus': {
                    borderColor: ACCENT_COLOR,
                    boxShadow: '0px 0px 0px 4px rgba(245,190,13,0.16)',
                  },
                }}
              />

              <Box sx={{ width: '100%', borderTop: '1px solid #f1e6b7' }} />

              <Stack spacing={1.5} sx={{ width: '100%' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} gap={0.5} justifyContent="space-between">
                  <Typography variant="body1" sx={{ fontFamily: 'Helvetica', fontSize: '18px', color: '#444' }}>
                    Apskaitos įmonė (~2,50 EUR/dok):
                  </Typography>
                  <Typography variant="body1" sx={{ fontFamily: 'Helvetica', fontWeight: 700, fontSize: '18px', color: '#1b1b1b' }}>
                    ~{traditionalCost.toFixed(2)} EUR
                  </Typography>
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} gap={0.5} justifyContent="space-between">
                  <Typography variant="body1" sx={{ fontFamily: 'Helvetica', fontSize: '18px', color: '#444' }}>
                    DokSkenas (0,18 EUR/dok):
                  </Typography>
                  <Typography variant="body1" sx={{ fontFamily: 'Helvetica', fontWeight: 700, color: '#b48700', fontSize: '18px' }}>
                    ~{dokskenasCost.toFixed(2)} EUR
                  </Typography>
                </Stack>
              </Stack>

              {/* result */}
              <Box
                sx={{
                  width: '100%',
                  padding: { xs: 2, sm: 2.5 },
                  borderRadius: 2.5,
                  background: 'linear-gradient(135deg, #f0faf0 0%, #e6f5e6 100%)',
                  border: '1px solid #c8e6c9',
                }}
              >
                <Stack direction={{ xs: 'column', sm: 'row' }} gap={0.5} justifyContent="space-between" alignItems={{ sm: 'baseline' }}>
                  <Typography variant="h6" sx={{ fontFamily: 'Helvetica', fontWeight: 700, fontSize: '20px', color: '#1b1b1b' }}>
                    Sutaupote per mėnesį:
                  </Typography>
                  <Typography variant="h6" sx={{ fontFamily: 'Helvetica', fontWeight: 700, color: '#2e7d32', fontSize: '22px' }}>
                    ~{savings.toFixed(2)} EUR ({savingsPercent}%)
                  </Typography>
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} gap={0.5} justifyContent="space-between" sx={{ marginTop: 1 }}>
                  <Typography variant="body1" sx={{ fontFamily: 'Helvetica', fontSize: '18px', color: '#444' }}>
                    Sutaupote per metus:
                  </Typography>
                  <Typography variant="body1" sx={{ fontFamily: 'Helvetica', fontWeight: 700, color: '#2e7d32', fontSize: '18px' }}>
                    ~{(savings * 12).toFixed(0)} EUR
                  </Typography>
                </Stack>
              </Box>
            </Stack>
          </Box>
        </Box>

        <Typography sx={{ fontSize: '20px', fontFamily: 'Helvetica', color: '#1b1b1b', fontWeight: 600, marginTop: 5, textAlign: 'center' }}>
          Išbandykite 50 skaitmenizavimų nemokamai
        </Typography>
      </Box>

      {/* Final CTA */}
      <Box
        sx={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: '60px',
          marginBottom: '100px',
        }}
      >
        <Button
          variant="contained"
          size="large"
          href="/registruotis?src=skaitmenizavimas"
          sx={{
            backgroundColor: ACCENT_COLOR,
            color: "black",
            "&:hover": { backgroundColor: ACCENT_COLOR_HOVER, color: "black" },
            padding: '16px 60px',
            fontSize: '20px',
          }}
        >
          Registruotis
        </Button>
      </Box>
    </Box>
  );
};

export default Rivile;