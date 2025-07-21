import "../styles/infoPage.css";
import { Helmet } from "react-helmet";
import React, { useState, useEffect } from "react";
import config from '../config';
import {
  Box,
  Typography,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';

const Subscribe = () => {
  const [message, setMessage] = useState("");
  const [loadingId, setLoadingId] = useState(null);

  // Показ сообщений об успехе/отмене
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("success")) {
      setMessage("🎉 Mokėjimas pavyko! Kreditai netrukus atsiras Jūsų paskyroje.");
    }
    if (query.get("canceled")) {
      setMessage("❌ Mokėjimas atšauktas. Bandykite dar kartą arba pasirinkite kitą paketą.");
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

  // Три пакета кредитов
  const plans = [
    { credits: 100, cost: "€18.00",   priceId: "price_1RfxUWIaJDydaLBY6Y3MGrBj", docPrice: "0.18 €" },
    { credits: 500, cost: "€85.00",   priceId: "price_1RfxWUIaJDydaLBYJomOA1FD", discount: "-5%", docPrice: "0.17 €" },
    { credits: 1000, cost: "€162.00", priceId: "price_1RfxY1IaJDydaLBY4YXDNSAO", discount: "-10%", docPrice: "0.162 €" },
  ];

  return (
    <Box sx={{ p: 2, bgcolor: '#f5f5f5', minHeight: '100vh', pb: '70px' }}>
      <Helmet>
        <title>Pirkti kreditus</title>
        <meta name="description" content="Įsigykite kreditų savo analizėms." />
      </Helmet>

      <Typography
        variant="h1"
        sx={{ fontSize: '35px', fontWeight: 600, mb: 2, textAlign: 'center' }}
      >
        Įsigyti kreditų
      </Typography>
      <Typography
        variant="body1"
        sx={{ textAlign: 'center', fontSize: '18px', mb: 3 }}
      >
        Pasirinkite kreditų paketą
      </Typography>

      {message && (
        <Typography
          variant="body1"
          sx={{
            textAlign: 'center',
            color: message.startsWith('Klaida') ? 'error.main' : 'success.main',
            mb: 3,
          }}
        >
          {message}
        </Typography>
      )}

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={4}
        justifyContent="center"
      >
        {plans.map((plan) => (
          <Box
            key={plan.credits}
            sx={{
              width: { xs: '90%', sm: '300px' },
              p: 4,
              borderRadius: 2,
              bgcolor: '#1b1b1b',
              color: '#fff',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1 }}>
              {plan.credits} kreditų
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'baseline', mb: 2 }}>
              <Typography
                variant="h3"
                sx={{ fontWeight: 'bold', fontSize: '36px' }}
              >
                {plan.cost}
              </Typography>
              {plan.discount && (
                <Typography
                  variant="subtitle2"
                  sx={{ ml: 1, color: '#f5cf54' }}
                >
                  {plan.discount}
                </Typography>
              )}
            </Box>

            {/* Буллет-поинты */}
            <List dense sx={{ flexGrow: 1 }}>
              <ListItem disableGutters>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <CheckIcon sx={{ color: '#f5cf54' }} />
                </ListItemIcon>
                <ListItemText primary="1 kreditas = 1 dokumentas" />
              </ListItem>
              <ListItem disableGutters>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <CheckIcon sx={{ color: '#f5cf54' }} />
                </ListItemIcon>
                <ListItemText primary={`Dokumento kaina – ${plan.docPrice}`} />
              </ListItem>
              <ListItem disableGutters>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <CheckIcon sx={{ color: '#f5cf54' }} />
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
                fontWeight: 'bold',
                py: 1.5,
                "&:hover": { bgcolor: "#d4ae4a" },
              }}
            >
              {loadingId === plan.priceId
                ? "Įkeliama…"
                : `Pirkti ${plan.credits}`}
            </Button>
          </Box>
        ))}
      </Stack>
    </Box>
  );
};

export default Subscribe;




// import "../styles/infoPage.css";
// import { Helmet } from "react-helmet";
// import React, { useState, useEffect } from "react";
// import config from '../config';
// import { Box, Typography, Button, Stack } from '@mui/material';
// import CheckIcon from '@mui/icons-material/Check';
// import CloseIcon from '@mui/icons-material/Close';

// const Subscribe = () => {
//   const [message, setMessage] = useState("");
//   const [loadingId, setLoadingId] = useState(null);

//   // Parodyti sėkmės / atšaukimo žinutes
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

//   // Trys kreditų paketai
//   const plans = [
//     { credits: 100, cost: "€18.00",   priceId: "price_1RfxUWIaJDydaLBY6Y3MGrBj" },
//     { credits: 500, cost: "€85.00",  priceId: "price_1RfxWUIaJDydaLBYJomOA1FD" },
//     { credits: 1000, cost: "€162.00", priceId: "price_1RfxY1IaJDydaLBY4YXDNSAO" },
//   ];

//   return (
//     <Box sx={{ p: 2, bgcolor: '#f5f5f5', minHeight: '100vh', pb: '70px' }}>
//       <Helmet>
//         <title>Pirkti kreditus</title>
//         <meta name="description" content="Įsigykite kreditų savo analizėms." />
//       </Helmet>

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

//       <Box
//         sx={{
//           display: 'flex',
//           flexDirection: { xs: 'column', md: 'row' },
//           justifyContent: 'center',
//           gap: 4,
//         }}
//       >
//         {plans.map(plan => (
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
//             <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 2 }}>
//               {plan.credits} kreditų
//             </Typography>
//             <Typography
//               variant="h3"
//               sx={{ fontWeight: 'bold', mb: 1, fontSize: '36px' }}
//             >
//               {plan.cost}
//             </Typography>
//             <Stack spacing={1} sx={{ mt: 2, flexGrow: 1 }}>
//               <Typography>
//                 <CheckIcon sx={{ mr:1, color:'#f5cf54' }} />
//                 1 kreditas = 1 dokumentas
//               </Typography>
//               <Typography>
//                 <CheckIcon sx={{ mr:1, color:'#f5cf54' }} />
//                 Dokumento kaina - 0.18 €
//               </Typography>
//               <Typography>
//                 <CheckIcon sx={{ mr:1, color:'#f5cf54' }} />
//                 Galiojimas - neribotas
//               </Typography>
//             </Stack>
//             <Button
//               variant="contained"
//               fullWidth
//               onClick={() => handleCheckout(plan.priceId)}
//               disabled={loadingId === plan.priceId}
//               sx={{
//                 mt: 4,
//                 bgcolor: "#f5be0d",
//                 color: "black",
//                 fontWeight: 'bold',
//                 py: 1.5,
//                 "&:hover": { bgcolor: "#d4ae4a" },
//               }}
//             >
//               {loadingId === plan.priceId ? "Įkeliama…" : `Pirkti ${plan.credits}`}
//             </Button>
//           </Box>
//         ))}
//       </Box>
//     </Box>
//   );
// };

// export default Subscribe;


















// import "../styles/infoPage.css";
// import { Helmet } from "react-helmet";
// import React, { useState, useEffect } from "react";
// import config from '../config';
// import { Box, Typography, Button, Stack } from '@mui/material';
// import CheckIcon from '@mui/icons-material/Check';
// import CloseIcon from '@mui/icons-material/Close';

// const Subscribe = () => {
//   const [message, setMessage] = useState("");
//   const [isLoading, setIsLoading] = useState(false);

//   useEffect(() => {
//     const query = new URLSearchParams(window.location.search);
//     if (query.get("success")) {
//       setMessage("Order placed! Email confirmation will be sent soon.");
//     }
//     if (query.get("canceled")) {
//       setMessage("Order canceled. You can try again or choose another plan.");
//     }
//   }, []);

//   const handleCheckout = async (priceId) => {
//     setIsLoading(true);
//     setMessage("");

//     try {
//       const response = await fetch(`${config.BASE_API_URL}stripe/create-checkout-session/`, {
//         method: "POST",
//         credentials: "include", // Important for cookies
//         headers: {
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({ price_id: priceId }),
//       });

//       if (response.ok) {
//         const { url } = await response.json();
//         window.location.href = url;
//       } else {
//         const responseBody = await response.json();
//         setMessage(`Error: ${responseBody.error || "An unknown error occurred."}`);
//       }
//     } catch (error) {
//       setMessage("Network error. Please try again later.");
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const plans = [
//     {
//       name: "Monthly",
//       originalPrice: '$49.99',
//       price: "$34.99",
//       priceId: "price_1QQQiyIaJDydaLBYE59P6e92",
//       features: [
//         { text: "Access to Seasonality Analyser", included: true },
//         { text: "Historical trades", included: true },
//         { text: "Over 700 US stocks & indexes", included: true },
//         { text: "20 years of data", included: true },
//         { text: "Recent year graph", included: true },
//       ],
//     },
//     {
//       name: "Yearly",
//       originalPrice: '$599.99',
//       price: "$314.99",
//       priceId: "price_1QQQjsIaJDydaLBY94wOs5hh",
//       features: [
//         { text: "Everything in Monthly plan", included: true },
//         { text: "PLUS: Faster data updates", included: true },
//         { text: "PLUS: Early access to new features", included: true },
//       ],
//     },
//   ];

//   return (
//     <Box sx={{ padding: 2, bgcolor: '#f5f5f5', minHeight: '100vh', paddingBottom: '70px' }}>
//       <Helmet>
//         <title>Subscribe to Seasonality Chart</title>
//         <meta name="description" content="This page contains subscriptions." />
//       </Helmet>
//       <Typography
//           variant="h1"
//           sx={{
//               fontSize: '35px',
//               fontFamily: 'Helvetica',
//               fontWeight: '600',
//               marginBottom: 2,
//               textAlign: 'center',
//           }}
//       >
//           Subscribe to get full-access
//       </Typography>

//       <Typography variant="body1" sx={{ textAlign: 'center', fontSize: '18px', fontFamily: 'Helvetica', padding: 1, paddingBottom: '40px' }}>
//           Choose your subscription plan
//       </Typography>

//       {message && (
//         <Typography
//           variant="body1"
//           sx={{
//             textAlign: 'center',
//             color: message.startsWith('Error') ? 'error.main' : 'success.main',
//             marginBottom: 3,
//           }}
//         >
//           {message}
//         </Typography>
//       )}

//       <Box
//         sx={{
//           display: 'flex',
//           flexDirection: { xs: 'column', md: 'row' },
//           justifyContent: 'center',
//           alignItems: 'center',
//           gap: 5,
//           marginTop: 5,
//         }}
//       >
//         {plans.map((plan, index) => (
//           <Box
//             key={index}
//             sx={{
//               width: { xs: '90%', sm: '90%'},
//               padding: '40px',
//               borderRadius: '10px',
//               backgroundColor: '#1b1b1b',
//               boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.5)',
//               color: '#fff',
//               display: 'flex',
//               flexDirection: 'column',
//             }}
//           >
//             <Typography variant="h5" sx={{ fontWeight: 'bold', marginBottom: 2 }}>
//               {plan.name}
//             </Typography>
//             <Typography
//               variant="body1"
//               sx={{
//                   textDecoration: 'line-through',
//                   color: '#777',
//                   fontSize: '18px',
//               }}
//             >
//               {plan.originalPrice}
//             </Typography>
//             <Box 
//               sx={{
//                   display: 'inline-flex', // Размещаем цену и USD в одной строке
//                   alignItems: 'baseline', // Выравниваем USD по базовой линии цены
//               }}
//             >
//             <Typography
//                   variant="h3"
//                   sx={{
//                       fontWeight: 'bold',
//                       marginBottom: 1,
//                       display: 'inline',
//                       fontSize: '38px',
//                       justifyContent: 'top',
//                   }}
//             >
//                   {plan.price}
//             </Typography>
//             <Typography
//                   variant="caption"
//                   sx={{
//                       justifyContent: 'center',
//                       verticalAlign: 'top',
//                       marginLeft: 1,
//                       fontSize: '18px',
//                   }}
//             >
//                   USD
//             </Typography>
//             </Box>
//             <Stack spacing={1} sx={{ marginTop: 3 }}>
//               {plan.features.map((feature, idx) => (
//                 <Typography
//                   key={idx}
//                   variant="body2"
//                   sx={{
//                     display: 'flex',
//                     alignItems: 'center',
//                     color: feature.included ? '#fff' : '#777',
//                     fontSize: '16px',
//                   }}
//                 >
//                   {feature.included ? (
//                     <CheckIcon sx={{ color: '#f5cf54', marginRight: 1 }} />
//                   ) : (
//                     <CloseIcon sx={{ color: '#777', marginRight: 1 }} />
//                   )}
//                   {feature.text}
//                 </Typography>
//               ))}
//             </Stack>
//             <Button
//               variant="contained"
//               fullWidth
//               onClick={() => handleCheckout(plan.priceId)}
//               disabled={isLoading}
//               sx={{
//                 marginTop: '50px',
//                 backgroundColor: "#f5be0d",
//                 color: "black",
//                 "&:hover": { backgroundColor: "#d4ae4a", color: "black" },
//                 fontWeight: 'bold',
//                 padding: '10px',
//                 fontFamily: 'Helvetica',
//               }}
//             >
//               {isLoading ? "Loading..." : "Subscribe"}
//             </Button>
//           </Box>
//         ))}
//       </Box>
//     </Box>
//   );
// };

// export default Subscribe;

