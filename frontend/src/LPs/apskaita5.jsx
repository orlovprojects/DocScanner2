import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Box, Typography, Button, Stack, TextField } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

const Apskaita5 = () => {
  const [docCount, setDocCount] = useState(200);

  // Калькулятор экономии
  const traditionalCost = docCount * 2.5;
  const dokskenasCost = docCount * 0.18;
  const savings = traditionalCost - dokskenasCost;
  const savingsPercent = Math.round((savings / traditionalCost) * 100);

  // Video
  const VIDEO_URL = "https://www.youtube.com/embed/_HeD_TKUsl0";

  return (
    <Box sx={{ bgcolor: '#F9F9FA', minHeight: '100vh', padding: { xs: 2, sm: 5 }, paddingTop: { xs: '50px', sm: '70px' }, width: '100%' }}>
      <Helmet>
        <title>Sąskaitų importas į Apskaita5</title>
        <meta name="description" content="Automatizuokite sąskaitų faktūrų įvedimą į Apskaita5 buhalterinę programą. DokSkenas atpažįsta dokumentus ir eksportuoja .xml failą, paruoštą Apskaita5 importui." />
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
          Sąskaitų importas į Apskaita5
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
          Automatizuokite sąskaitų faktūrų nuskaitymą ir įvedimą į Apskaita5 buhalterinę programą bei išvenkite nuobodaus rankinio darbo ir klaidų apskaitoje.
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
          DokSkenas atpažįsta dokumentus ir paruošia .xml failus, paruoštus importui į Apskaita5.
        </Typography>
        <Button
          variant="contained"
          size="large"
          href="/registruotis"
          sx={{
            backgroundColor: "#f5be0d",
            color: "black",
            "&:hover": { backgroundColor: "#f5cf54", color: "black" },
            padding: '14px 50px',
            fontSize: '18px',
          }}
        >
          Išbandyti nemokamai
        </Button>
      </Box>

      {/* Ką galite importuoti į Apskaita5? */}
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
            marginBottom: 4,
            textAlign: 'center',
          }}
        >
          Ką galite importuoti į Apskaita5?
        </Typography>
        <Stack spacing={2.5} sx={{ maxWidth: '500px', width: '100%' }}>
          {[
            'Pirkimus',
            'Pardavimus',
            'Prekes / paslaugas',
            'Kontrahentus (įmones ir fizinius asmenis)',
          ].map((item, idx) => (
            <Stack key={idx} direction="row" alignItems="center" spacing={2}>
              <CheckCircleIcon sx={{ color: '#f5be0d', fontSize: 28 }} />
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
          Importavus duomenis prekių, paslaugų bei kontrahentų kortelės automatiškai susikurs Apskaita5 programoje, jei tokių įrašų dar nėra duomenų bazėje.
        </Typography>
      </Box>

      {/* Kas nuskaitoma? */}
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
          Kas nuskaitoma?
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
      </Box>

      {/* Importas į Apskaita5 */}
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
          Importas į Apskaita5
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
          Šiame video parodome pilną procesą nuo sąskaitų įkėlimo skaitmenizuoti iki duomenų importo į Apskaita5. Taip pat paaiškiname, kaip įdiegti adapterį (per kurį kelsite duomenis į Apskaita5) bei kaip nusistatyti PVM schemas, kad jos prisiskirtų importuotiems dokumentams.
        </Typography>
        {/* Embedded YouTube Video */}
        <Box
          sx={{
            width: '100%',
            maxWidth: '900px',
            aspectRatio: '16/9',
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: 3,
            marginBottom: 5,
          }}
        >
          <Box
            component="iframe"
            src={VIDEO_URL}
            title="Importas į Apskaita5"
            width="100%"
            height="100%"
            sx={{ border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </Box>

        {/* PVM schemos instrukcija */}
        <Box
          sx={{
            maxWidth: '800px',
            width: '100%',
            marginBottom: 5,
            padding: { xs: 2, sm: 0 },
          }}
        >
          <Typography
            variant="h3"
            sx={{
              fontSize: { xs: '22px', sm: '26px' },
              fontFamily: 'Helvetica',
              fontWeight: 700,
              marginBottom: 3,
            }}
          >
            Kaip susikurti PVM schemas Apskaita5 programoje?
          </Typography>

          <Typography
            variant="body1"
            sx={{
              fontSize: '18px',
              fontFamily: 'Helvetica',
              color: '#1b1b1b',
              marginBottom: 2.5,
            }}
          >
            Tam kad jūsų dokumentams prisiskirtų teisingi PVM klasifikatoriai (PVM schemos) Apskaita5 programoje, jus reikės:
          </Typography>

          <Box
            component="ul"
            sx={{
              paddingLeft: { xs: '24px', sm: '40px' },
              marginBottom: 4,
              marginTop: 0,
            }}
          >
            {[
              <>nukopijuoti naudojamus PVM kodus iš DokSkeno nustatymų</>,
              <>atidaryti savo Apskaita5 <Box component="span" sx={{ fontWeight: 700 }}>„Bendras -&gt; Mokesčių nustatymai -&gt; Kodai"</Box>, tada pasirinkti <Box component="span" sx={{ fontWeight: 700 }}>„PVM kodas"</Box> iš Paste'inamų kodų tipas meniu ir paspausti ant įkelti įkonėlės</>,
              <>sąraše kairėje atsiras nauji PVM kodai, spauskite OK</>,
              <>tada eikite į <Box component="span" sx={{ fontWeight: 700 }}>„Dokumentai -&gt; PVM deklaravimo schemos"</Box> ir sukurkite PVM schemas kiekvienam iš sukurtų PVM kodų, kaip parodyta video</>,
            ].map((item, idx) => (
              <Typography
                component="li"
                key={idx}
                sx={{
                  fontSize: '18px',
                  fontFamily: 'Helvetica',
                  color: '#1b1b1b',
                  marginBottom: 1.5,
                  paddingLeft: 1,
                }}
              >
                {item}
              </Typography>
            ))}
          </Box>

          <Typography
            variant="body1"
            sx={{
              fontSize: '18px',
              fontFamily: 'Helvetica',
              color: '#1b1b1b',
              marginBottom: 2,
            }}
          >
            Jei norite, kad PVM schema būtų padalinta į pirkimus ir pardavimus, sukurkite tam pačiam PVM kodui dvi PVM schemas: vieną pirkimams, kitą pardavimams.
          </Typography>

          <Typography
            variant="body1"
            sx={{
              fontSize: '18px',
              fontFamily: 'Helvetica',
              color: '#1b1b1b',
              marginBottom: 3,
            }}
          >
            Pvz. PVM1 kodas galioja tiek pirkimams, tiek pardavimams. Norint tai atskirti sukurkite tokias dvi PVM schemas.
          </Typography>

          {/* PVM schemos pavyzdžiai */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 3,
              marginBottom: 4,
            }}
          >
            {/* Pardavimams */}
            <Box
              sx={{
                flex: 1,
                padding: 3,
                borderRadius: 2,
                background: '#fff',
                boxShadow: '0px 2px 12px rgba(0,0,0,0.06)',
                border: '1px solid #e8e8e8',
              }}
            >
              <Typography
                sx={{
                  fontSize: '18px',
                  fontFamily: 'Helvetica',
                  fontWeight: 700,
                  color: '#1b1b1b',
                  marginBottom: 2,
                  textDecoration: 'underline',
                }}
              >
                Pardavimams:
              </Typography>
              {[
                { label: 'Apyvartos tipas', value: 'parduodamos' },
                { label: 'Tarifas (%)', value: '21' },
                { label: 'PVM kodas', value: 'PVM1 (pasirinktas iš sąrašo)' },
                { label: 'Kodas', value: 'PVM1_PARD' },
                { label: 'Pavadinimas', value: 'PVM1 pard' },
              ].map((item, idx) => (
                <Typography key={idx} sx={{ fontSize: '16px', fontFamily: 'Helvetica', color: '#1b1b1b', marginBottom: 0.5 }}>
                  <Box component="span" sx={{ textDecoration: 'underline' }}>{item.label}</Box>: {item.value}
                </Typography>
              ))}
            </Box>

            {/* Pirkimams */}
            <Box
              sx={{
                flex: 1,
                padding: 3,
                borderRadius: 2,
                background: '#fff',
                boxShadow: '0px 2px 12px rgba(0,0,0,0.06)',
                border: '1px solid #e8e8e8',
              }}
            >
              <Typography
                sx={{
                  fontSize: '18px',
                  fontFamily: 'Helvetica',
                  fontWeight: 700,
                  color: '#1b1b1b',
                  marginBottom: 2,
                  textDecoration: 'underline',
                }}
              >
                Pirkimams:
              </Typography>
              {[
                { label: 'Apyvartos tipas', value: 'perkamos' },
                { label: 'Tarifas (%)', value: '21' },
                { label: 'PVM kodas', value: 'PVM1 (pasirinktas iš sąrašo)' },
                { label: 'Kodas', value: 'PVM1_PIRK' },
                { label: 'Pavadinimas', value: 'PVM1 pirk' },
              ].map((item, idx) => (
                <Typography key={idx} sx={{ fontSize: '16px', fontFamily: 'Helvetica', color: '#1b1b1b', marginBottom: 0.5 }}>
                  <Box component="span" sx={{ textDecoration: 'underline' }}>{item.label}</Box>: {item.value}
                </Typography>
              ))}
            </Box>
          </Box>

          <Typography
            variant="body1"
            sx={{
              fontSize: '18px',
              fontFamily: 'Helvetica',
              color: '#1b1b1b',
              marginBottom: 2,
            }}
          >
            Tą patį galit padaryti ir su kitais PVM kodais, kai reikia atskirti PVM schemas į pirkimus ir pardavimus. Tiesiog pirkimams pasirinkite Apyvartos tipas: <Box component="span" sx={{ fontWeight: 700 }}>perkamos</Box> o Kodas turi būti su <Box component="span" sx={{ fontWeight: 700 }}>_PIRK</Box>. Pardavimams Apyvartos tipas: <Box component="span" sx={{ fontWeight: 700 }}>parduodamos</Box>, o Kodas su <Box component="span" sx={{ fontWeight: 700 }}>_PARD</Box> gale.
          </Typography>

          <Typography
            variant="body1"
            sx={{
              fontSize: '18px',
              fontFamily: 'Helvetica',
              color: '#1b1b1b',
            }}
          >
            PVM schemas nusistatyti reikės tik vieną kartą. Kitą kartą atsidarius Apskaita5 programą galėsite eiti tiesiai į sąskaitų importo langą be jokių papildomų nustatymų.
          </Typography>
        </Box>

        {/* Kaip tai veikia? */}
        <Typography
          variant="h3"
          sx={{
            fontSize: { xs: '24px', sm: '28px' },
            fontFamily: 'Helvetica',
            fontWeight: 700,
            marginBottom: 4,
            marginTop: 4,
            textAlign: 'center',
          }}
        >
          Kaip tai veikia?
        </Typography>
        <Stack spacing={3} sx={{ maxWidth: '800px', width: '100%', padding: { xs: 1, sm: 0 } }}>
          {[
            { step: 1, bold: 'Įkelkite dokumentus:', text: ' tinka beveik visi dokumentų, nuotraukų bei archyvų formatai' },
            { step: 2, bold: 'Palaukite kol nusiskaitys duomenys:', text: ' vidutiniškai užtrunka ~30 sekundžių dokumentui' },
            { step: 3, bold: 'Peržiūrėkite rezultatus:', text: ' klaidos pažymimos dokumentų lentelėje. Pakoreguokite, jei reikia' },
            { step: 4, bold: 'Eksportuokite į Apskaita5:', text: ' pasirinkite "Apskaita5" kaip savo apskaitos programą nustatymuose' },
            { step: 5, bold: 'Importuokite į Apskaita5:', text: ' atidarykite failą Apskaita5 programoje ir patvirtinkite' },
          ].map((item, idx) => (
            <Stack key={idx} direction="row" alignItems="flex-start" spacing={2}>
              <Box
                sx={{
                  minWidth: { xs: 36, sm: 42 },
                  minHeight: { xs: 36, sm: 42 },
                  width: { xs: 36, sm: 42 },
                  height: { xs: 36, sm: 42 },
                  borderRadius: '50%',
                  background: "#f5cf54",
                  color: "#1b1b1b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: { xs: '16px', sm: '20px' },
                  fontFamily: 'Helvetica',
                  boxShadow: 2,
                  flexShrink: 0,
                }}
              >
                {item.step}
              </Box>
              <Typography variant="body1" sx={{ fontSize: { xs: '16px', sm: '18px' }, fontFamily: 'Helvetica', paddingTop: { xs: '6px', sm: '8px' } }}>
                <Box component="span" sx={{ fontWeight: 700 }}>{item.bold}</Box>
                {item.text}
              </Typography>
            </Stack>
          ))}
        </Stack>

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
            'Nuskaito ir kuro čekius',
            'Patikrina ar galioja PVM kodai',
            'Atpažįsta nuolaidas',
            'Nuskaito sąskaitas su skirtingais PVM procentais',
            'Priskiria PVM klasifikatorių',
            'Sutikrina LT įmonių duomenis su Registrų centru',
            'Priskiria valiutų kursus iš Lietuvos banko',
            'Atpažįsta kur prekė, kur paslauga',
            'Rūšiuoja sąskaitas pagal kontrahentus',
            'Veikia su bet kokiais dokumentais: lietuviškais, ES, užsienietiškais',
            'Suranda ir pataiso klaidas dokumentuose',
          ].map((item, idx) => (
            <Stack key={idx} direction="row" alignItems="center" spacing={1.5}>
              <CheckCircleIcon sx={{ color: '#f5be0d', fontSize: 24, flexShrink: 0 }} />
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

      {/* Kainos */}
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
            marginBottom: 4,
            textAlign: 'center',
          }}
        >
          Kainos
        </Typography>

        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'center',
            alignItems: 'stretch',
            gap: 4,
            marginBottom: 4,
          }}
        >
          {/* Sumiškai */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: 4,
              borderRadius: 3,
              background: '#fff6d8',
              boxShadow: '0px 2px 16px rgba(245,207,84,0.09)',
              minWidth: 240,
            }}
          >
            <Typography
              variant="h5"
              sx={{
                fontFamily: 'Helvetica',
                fontWeight: 600,
                fontSize: '22px',
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
                fontSize: '36px',
              }}
            >
              0,18&nbsp;EUR
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
          {/* Detaliai */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: 4,
              borderRadius: 3,
              background: '#fff6d8',
              boxShadow: '0px 2px 16px rgba(245,207,84,0.09)',
              minWidth: 240,
            }}
          >
            <Typography
              variant="h5"
              sx={{
                fontFamily: 'Helvetica',
                fontWeight: 600,
                fontSize: '22px',
                marginBottom: 1,
                color: '#1b1b1b',
              }}
            >
              Detaliai su eilutėmis
            </Typography>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                color: '#f5be0d',
                fontSize: '36px',
              }}
            >
              0,23&nbsp;EUR
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

        <Stack spacing={1.5} sx={{ maxWidth: '700px', textAlign: 'center', marginBottom: 4 }}>
          <Typography sx={{ fontSize: '18px', fontFamily: 'Helvetica', color: '#333' }}>
            Nėra mėnesinio mokesčio. Atsiskaitymas vyksta kreditais.
          </Typography>
          <Typography sx={{ fontSize: '18px', fontFamily: 'Helvetica', color: '#333' }}>
            Mokate už tiek, kiek skaitmenizuojate. Perkant daugiau kreditų taikomos iki 20% nuolaidos.
          </Typography>
          <Typography sx={{ fontSize: '18px', fontFamily: 'Helvetica', color: '#333' }}>
            Už dublikatus ir netinkamus dokumentus nemokate.
          </Typography>
        </Stack>

        {/* Калькулятор */}
        <Box
          sx={{
            width: '100%',
            maxWidth: '650px',
            padding: 5,
            borderRadius: 3,
            background: '#fff',
            border: '2px solid #f5cf54',
            boxShadow: '0px 4px 24px rgba(0,0,0,0.08)',
          }}
        >
          <Typography
            variant="h3"
            sx={{
              fontFamily: 'Helvetica',
              fontWeight: 600,
              fontSize: '26px',
              marginBottom: 4,
              textAlign: 'center',
            }}
          >
            Pasiskaičiuokite, kiek sutaupysite laiko ir pinigų
          </Typography>

          <Stack spacing={2} alignItems="center">
            <Typography variant="body1" sx={{ fontFamily: 'Helvetica', fontSize: '18px' }}>
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
                  fontSize: '28px',
                  fontWeight: 600,
                },
              }}
            />

            <Box sx={{ width: '100%', borderTop: '2px dashed #e0e0e0', marginY: 3, paddingTop: 2 }} />

            <Stack spacing={1.5} sx={{ width: '100%' }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body1" sx={{ fontFamily: 'Helvetica', fontSize: '18px' }}>
                  Apskaitos įmonė (~2,50 EUR/dok):
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600, fontSize: '18px' }}>
                  ~{traditionalCost.toFixed(2)} EUR
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body1" sx={{ fontFamily: 'Helvetica', fontSize: '18px' }}>
                  DokSkenas (0,18 EUR/dok):
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600, color: '#f5be0d', fontSize: '18px' }}>
                  ~{dokskenasCost.toFixed(2)} EUR
                </Typography>
              </Stack>
              <Box sx={{ borderTop: '2px solid #f5cf54', marginY: 2 }} />
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="h6" sx={{ fontFamily: 'Helvetica', fontWeight: 700, fontSize: '20px' }}>
                  Sutaupote per mėnesį:
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#2e7d32', fontSize: '20px' }}>
                  ~{savings.toFixed(2)} EUR ({savingsPercent}%)
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body1" sx={{ fontFamily: 'Helvetica', fontSize: '18px' }}>
                  Sutaupote per metus:
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700, color: '#2e7d32', fontSize: '18px' }}>
                  ~{(savings * 12).toFixed(0)} EUR
                </Typography>
              </Stack>
            </Stack>
          </Stack>
        </Box>

        <Typography sx={{ fontSize: '20px', fontFamily: 'Helvetica', color: '#1b1b1b', fontWeight: 600, marginTop: 5 }}>
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
          href="/registruotis"
          sx={{
            backgroundColor: "#f5be0d",
            color: "black",
            "&:hover": { backgroundColor: "#f5cf54", color: "black" },
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

export default Apskaita5;