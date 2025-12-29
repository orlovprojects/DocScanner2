import "../styles/infoPage.css";
import { Helmet } from "react-helmet";
import { useState, useEffect } from "react";
import config from "../config";
import {
  Box,
  Typography,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import { Grid2 } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import { api } from "../api/endpoints";

const Subscribe = () => {
  const [message, setMessage] = useState("");
  const [loadingId, setLoadingId] = useState(null);
  const [credits, setCredits] = useState(null);

  // Получаем кредиты пользователя при монтировании
  useEffect(() => {
    api
      .get("/me/")
      .then((res) => setCredits(res.data.credits))
      .catch(() => setCredits(null));
  }, []);

  // Показ сообщений об успехе/отмене
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("success")) {
      setMessage(
        "🎉 Mokėjimas pavyko! Kreditai netrukus atsiras Jūsų paskyroje. PDF sąskaitą galite atsisiųsti iš Paskyra (ikonėlė) -> Mokėjimų istorija"
      );
    }
    if (query.get("canceled")) {
      setMessage(
        "❌ Mokėjimas atšauktas. Bandykite dar kartą arba pasirinkite kitą paketą."
      );
    }
  }, []);

  const handleCheckout = async (priceId) => {
    setLoadingId(priceId);
    setMessage("");

    try {
      const res = await fetch(
        `${config.BASE_API_URL}stripe/credit-checkout/`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ price_id: priceId }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Nežinoma klaida");
      }

      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      setMessage(`Klaida: ${err.message}`);
      setLoadingId(null);
    }
  };

  // Пакеты кредитов
  const plans = [
    {
      credits: 100,
      cost: "€18,00",
      priceId: "price_1RfxUWIaJDydaLBY6Y3MGrBj",
      docPrice: "0,18 €",
    },
    {
      credits: 500,
      cost: "€85,00",
      priceId: "price_1RfxWUIaJDydaLBYJomOA1FD",
      discount: "-5%",
      docPrice: "0,17 €",
      tag: "Dažniausiai perkamas",
    },
    {
      credits: 1000,
      cost: "€162,00",
      priceId: "price_1RfxY1IaJDydaLBY4YXDNSAO",
      discount: "-10%",
      docPrice: "0,162 €",
    },
    {
      credits: 5000,
      cost: "€765,00",
      priceId: "price_1SjdLJIaJDydaLBYKixOTMNc",
      discount: "-15%",
      docPrice: "0,153 €",
    },
    {
      credits: 10000,
      cost: "€1440,00",
      priceId: "price_1SjdMMIaJDydaLBYAMXtAUra",
      discount: "-20%",
      docPrice: "0,144 €",
    },
  ];

  return (
    <Box sx={{ p: 2, bgcolor: "#f5f5f5", minHeight: "100vh", pb: "70px" }}>
      <Helmet>
        <title>Pirkti kreditus - DokSkenas</title>
        <meta
          name="description"
          content="Įsigykite kreditų dokumentams skaitmenizuoti."
        />
      </Helmet>

      {/* Показ количества кредитов */}
      <Typography
        variant="body1"
        sx={{
          textAlign: "center",
          fontSize: "18px",
          mb: 3,
          color: "#1b1b1b",
          fontWeight: 500,
          fontFamily: "Helvetica",
        }}
      >
        Turite <b>{credits !== null ? credits : "…"}</b> kreditų
      </Typography>

      <Typography
        variant="h1"
        sx={{ fontSize: "35px", fontWeight: 600, mb: 2, textAlign: "center" }}
      >
        Įsigyti kreditų
      </Typography>
      <Typography
        variant="body1"
        sx={{ textAlign: "center", fontSize: "18px", mb: 3 }}
      >
        Pasirinkite kreditų paketą
      </Typography>

      {message && (
        <Typography
          variant="body1"
          sx={{
            textAlign: "center",
            color: message.startsWith("Klaida") ? "error.main" : "success.main",
            mb: 3,
          }}
        >
          {message}
        </Typography>
      )}

      {/* Ограничиваем ширину сетки, чтобы всегда было 3 + 2 как на скрине */}
      <Box sx={{ maxWidth: 1100, mx: "auto" }}>
        <Grid2 container spacing={4} justifyContent="center">
          {plans.map((plan, index) => (
            <Grid2
              key={plan.credits}
              xs={12}
              sm={6}
              md={index < 3 ? 4 : 6}
              lg={index < 3 ? 4 : 6}
              xl={index < 3 ? 4 : 6}
              display="flex"
              justifyContent="center"
            >
              {plan.credits === 500 ? (
                // Специальная карточка для 500 кредитов с градиентной рамкой и тэгом сверху по центру
                <Box
                  sx={{
                    width: "100%",
                    maxWidth: 320,
                    borderRadius: 3,
                    p: 1.5,
                    background:
                      "linear-gradient(135deg, #f5cf54, #f5be0d, #f18f01)",
                    position: "relative",
                    fontFamily: "Helvetica, Arial, sans-serif",
                  }}
                >
                  {/* Тэг по центру сверху рамки */}
                  {plan.tag && (
                    <Box
                      sx={{
                        position: "absolute",
                        top: 0,
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        bgcolor: "#f5cf54",
                        color: "#000",
                        fontSize: 12,
                        fontWeight: "bold",
                        px: 2,
                        py: 0.5,
                        borderRadius: "999px",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.25)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {plan.tag}
                    </Box>
                  )}

                  <Box
                    sx={{
                      width: "100%",
                      borderRadius: 2,
                      bgcolor: "#1b1b1b",
                      color: "#fff",
                      display: "flex",
                      flexDirection: "column",
                      p: 3,
                    }}
                  >
                    <Typography
                      variant="h5"
                      sx={{ fontWeight: "bold", mb: 1 }}
                    >
                      {plan.credits} kreditų
                    </Typography>
                    <Box
                      sx={{ display: "flex", alignItems: "baseline", mb: 2 }}
                    >
                      <Typography
                        variant="h3"
                        sx={{ fontWeight: "bold", fontSize: "36px" }}
                      >
                        {plan.cost}
                      </Typography>
                      {plan.discount && (
                        <Typography
                          variant="subtitle2"
                          sx={{ ml: 1, color: "#f5cf54" }}
                        >
                          {plan.discount}
                        </Typography>
                      )}
                    </Box>

                    <List dense sx={{ flexGrow: 1 }}>
                      <ListItem disableGutters>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <CheckIcon sx={{ color: "#f5cf54" }} />
                        </ListItemIcon>
                        <ListItemText primary="1 kreditas = 1 dokumentas" />
                      </ListItem>
                      <ListItem disableGutters>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <CheckIcon sx={{ color: "#f5cf54" }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={`Dokumento kaina – ${plan.docPrice}`}
                        />
                      </ListItem>
                      <ListItem disableGutters>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <CheckIcon sx={{ color: "#f5cf54" }} />
                        </ListItemIcon>
                        <ListItemText primary="Galiojimas – neribotas" />
                      </ListItem>
                    </List>

                    <Button
                      variant="contained"
                      fullWidth
                      onClick={() => handleCheckout(plan.priceId)}
                      disabled={loadingId === plan.priceId}
                      sx={{
                        mt: 3,
                        bgcolor: "#f5be0d",
                        color: "black",
                        fontWeight: "bold",
                        py: 1.5,
                        "&:hover": { bgcolor: "#d4ae4a" },
                      }}
                    >
                      {loadingId === plan.priceId
                        ? "Įkeliama…"
                        : `Pirkti ${plan.credits}`}
                    </Button>
                  </Box>
                </Box>
              ) : (
                // Обычные карточки
                <Box
                  sx={{
                    width: "100%",
                    maxWidth: 320,
                    p: 4,
                    borderRadius: 2,
                    bgcolor: "#1b1b1b",
                    color: "#fff",
                    display: "flex",
                    flexDirection: "column",
                    fontFamily: "Helvetica, Arial, sans-serif",
                  }}
                >
                  <Typography
                    variant="h5"
                    sx={{ fontWeight: "bold", mb: 1 }}
                  >
                    {plan.credits} kreditų
                  </Typography>
                  <Box
                    sx={{ display: "flex", alignItems: "baseline", mb: 2 }}
                  >
                    <Typography
                      variant="h3"
                      sx={{ fontWeight: "bold", fontSize: "36px" }}
                    >
                      {plan.cost}
                    </Typography>
                    {plan.discount && (
                      <Typography
                        variant="subtitle2"
                        sx={{ ml: 1, color: "#f5cf54" }}
                      >
                        {plan.discount}
                      </Typography>
                    )}
                  </Box>

                  <List dense sx={{ flexGrow: 1 }}>
                    <ListItem disableGutters>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <CheckIcon sx={{ color: "#f5cf54" }} />
                      </ListItemIcon>
                      <ListItemText primary="1 kreditas = 1 dokumentas" />
                    </ListItem>
                    <ListItem disableGutters>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <CheckIcon sx={{ color: "#f5cf54" }} />
                      </ListItemIcon>
                      <ListItemText
                        primary={`Dokumento kaina – ${plan.docPrice}`}
                      />
                    </ListItem>
                    <ListItem disableGutters>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <CheckIcon sx={{ color: "#f5cf54" }} />
                      </ListItemIcon>
                      <ListItemText primary="Galiojimas – neribotas" />
                    </ListItem>
                  </List>

                  <Button
                    variant="contained"
                    fullWidth
                    onClick={() => handleCheckout(plan.priceId)}
                    disabled={loadingId === plan.priceId}
                    sx={{
                      mt: 3,
                      bgcolor: "#f5be0d",
                      color: "black",
                      fontWeight: "bold",
                      py: 1.5,
                      "&:hover": { bgcolor: "#d4ae4a" },
                    }}
                  >
                    {loadingId === plan.priceId
                      ? "Įkeliama…"
                      : `Pirkti ${plan.credits}`}
                  </Button>
                </Box>
              )}
            </Grid2>
          ))}
        </Grid2>
      </Box>
    </Box>
  );
};

export default Subscribe;






// import "../styles/infoPage.css";
// import { Helmet } from "react-helmet";
// import { useState, useEffect } from "react";
// import config from '../config';
// import {
//   Box,
//   Typography,
//   Button,
//   List,
//   ListItem,
//   ListItemIcon,
//   ListItemText,
//   Stack
// } from '@mui/material';
// import CheckIcon from '@mui/icons-material/Check';
// import { api } from "../api/endpoints"; // поправь путь если нужно

// const Subscribe = () => {
//   const [message, setMessage] = useState("");
//   const [loadingId, setLoadingId] = useState(null);
//   const [credits, setCredits] = useState(null);

//   // Получаем кредиты пользователя при монтировании
//   useEffect(() => {
//     api.get("/me/")
//       .then(res => setCredits(res.data.credits))
//       .catch(() => setCredits(null));
//   }, []);

//   // Показ сообщений об успехе/отмене
//   useEffect(() => {
//     const query = new URLSearchParams(window.location.search);
//     if (query.get("success")) {
//       setMessage("🎉 Mokėjimas pavyko! Kreditai netrukus atsiras Jūsų paskyroje.");
//     }
//     if (query.get("canceled")) {
//       setMessage("❌ Mokėjimas atšauktas. Bandykite dar kartą arba pasirinkite kitą paketą.");
//     }
//   }, []);

//   const handleCheckout = async (priceId) => {
//     setLoadingId(priceId);
//     setMessage("");

//     try {
//       const res = await fetch(
//         `${config.BASE_API_URL}stripe/credit-checkout/`,
//         {
//           method: "POST",
//           credentials: "include",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify({ price_id: priceId }),
//         }
//       );

//       if (!res.ok) {
//         const err = await res.json();
//         throw new Error(err.error || "Nežinoma klaida");
//       }

//       const { url } = await res.json();
//       window.location.href = url;
//     } catch (err) {
//       setMessage(`Klaida: ${err.message}`);
//       setLoadingId(null);
//     }
//   };

//   // Три пакета кредитов
//   const plans = [
//     { credits: 100, cost: "€18.00",   priceId: "price_1RfxUWIaJDydaLBY6Y3MGrBj", docPrice: "0.18 €" },
//     { credits: 500, cost: "€85.00",   priceId: "price_1RfxWUIaJDydaLBYJomOA1FD", discount: "-5%", docPrice: "0.17 €" },
//     { credits: 1000, cost: "€162.00", priceId: "price_1RfxY1IaJDydaLBY4YXDNSAO", discount: "-10%", docPrice: "0.162 €" },
//   ];

//   return (
//     <Box sx={{ p: 2, bgcolor: '#f5f5f5', minHeight: '100vh', pb: '70px' }}>
//       <Helmet>
//         <title>Pirkti kreditus - DokSkenas</title>
//         <meta name="description" content="Įsigykite kreditų dokumentams skaitmenizuoti." />
//       </Helmet>

//       {/* Показ количества кредитов */}
//       <Typography
//         variant="body1"
//         sx={{
//           textAlign: 'center',
//           fontSize: '18px',
//           mb: 3,
//           color: '#1b1b1b',
//           fontWeight: 500,
//           fontFamily: 'Helvetica',
//         }}
//       >
//         Turite <b>{credits !== null ? credits : "…"}</b> kreditų
//       </Typography>

//       <Typography
//         variant="h1"
//         sx={{ fontSize: '35px', fontWeight: 600, mb: 2, textAlign: 'center' }}
//       >
//         Įsigyti kreditų
//       </Typography>
//       <Typography
//         variant="body1"
//         sx={{ textAlign: 'center', fontSize: '18px', mb: 3 }}
//       >
//         Pasirinkite kreditų paketą
//       </Typography>

//       {message && (
//         <Typography
//           variant="body1"
//           sx={{
//             textAlign: 'center',
//             color: message.startsWith('Klaida') ? 'error.main' : 'success.main',
//             mb: 3,
//           }}
//         >
//           {message}
//         </Typography>
//       )}

//       <Stack
//         direction={{ xs: 'column', md: 'row' }}
//         spacing={4}
//         justifyContent="center"
//       >
//         {plans.map((plan) => (
//           <Box
//             key={plan.credits}
//             sx={{
//               width: { xs: '90%', sm: '300px' },
//               p: 4,
//               borderRadius: 2,
//               bgcolor: '#1b1b1b',
//               color: '#fff',
//               display: 'flex',
//               flexDirection: 'column',
//             }}
//           >
//             <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1 }}>
//               {plan.credits} kreditų
//             </Typography>
//             <Box sx={{ display: 'flex', alignItems: 'baseline', mb: 2 }}>
//               <Typography
//                 variant="h3"
//                 sx={{ fontWeight: 'bold', fontSize: '36px' }}
//               >
//                 {plan.cost}
//               </Typography>
//               {plan.discount && (
//                 <Typography
//                   variant="subtitle2"
//                   sx={{ ml: 1, color: '#f5cf54' }}
//                 >
//                   {plan.discount}
//                 </Typography>
//               )}
//             </Box>

//             <List dense sx={{ flexGrow: 1 }}>
//               <ListItem disableGutters>
//                 <ListItemIcon sx={{ minWidth: 32 }}>
//                   <CheckIcon sx={{ color: '#f5cf54' }} />
//                 </ListItemIcon>
//                 <ListItemText primary="1 kreditas = 1 dokumentas" />
//               </ListItem>
//               <ListItem disableGutters>
//                 <ListItemIcon sx={{ minWidth: 32 }}>
//                   <CheckIcon sx={{ color: '#f5cf54' }} />
//                 </ListItemIcon>
//                 <ListItemText primary={`Dokumento kaina – ${plan.docPrice}`} />
//               </ListItem>
//               <ListItem disableGutters>
//                 <ListItemIcon sx={{ minWidth: 32 }}>
//                   <CheckIcon sx={{ color: '#f5cf54' }} />
//                 </ListItemIcon>
//                 <ListItemText primary="Galiojimas – neribotas" />
//               </ListItem>
//             </List>

//             <Button
//               variant="contained"
//               fullWidth
//               onClick={() => handleCheckout(plan.priceId)}
//               disabled={loadingId === plan.priceId}
//               sx={{
//                 mt: 3,
//                 bgcolor: "#f5be0d",
//                 color: "black",
//                 fontWeight: 'bold',
//                 py: 1.5,
//                 "&:hover": { bgcolor: "#d4ae4a" },
//               }}
//             >
//               {loadingId === plan.priceId
//                 ? "Įkeliama…"
//                 : `Pirkti ${plan.credits}`}
//             </Button>
//           </Box>
//         ))}
//       </Stack>
//     </Box>
//   );
// };

// export default Subscribe;

