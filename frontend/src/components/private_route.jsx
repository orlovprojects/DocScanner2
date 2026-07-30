import { createContext, useContext } from "react";
import { useAuth } from "../contexts/useAuth";
import { Navigate, useLocation } from "react-router-dom";
import { useCompanyProfiles } from "../contexts/useCompanyProfiles";
import { Typography, CircularProgress, Box } from "@mui/material";

// Создаем контекст
const SubscriptionStatusContext = createContext(null);

// Хук для использования контекста
export const useSubscriptionStatus = () => useContext(SubscriptionStatusContext);

const Spinner = () => (
  <Box
    sx={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
    }}
  >
    <CircularProgress sx={{ color: "#F5BE09" }} />
  </Box>
);

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // Профили + подписка — всё из /me/ (один запрос на сессию)
  const {
    hasProfiles,
    initialized,
    subscriptionStatus,
  } = useCompanyProfiles();

  // 1) Пока проверяем сам факт логина — спиннер
  if (loading) {
    return <Spinner />;
  }

  // 2) Не залогинен — на логин
  if (!isAuthenticated) {
    return <Navigate to="/prisijungti" replace />;
  }

  // 3) Ждём /me/ (профили + подписка), чтобы ничего не мигнуло
  if (!initialized) {
    return <Spinner />;
  }

  // 4) Онбординг-гейт
  const onOnboarding = location.pathname === "/profiliai";
  // Нет ни одного профиля → только на онбординг
  if (!hasProfiles && !onOnboarding) {
    return <Navigate to="/profiliai" replace />;
  }
  // Уже есть профиль → назад на онбординг нельзя (доп. профили — через диалог в тулбаре)
  if (hasProfiles && onOnboarding) {
    return <Navigate to="/suvestine" replace />;
  }

  // 5) Статус подписки (из контекста, без отдельного запроса)
  switch (subscriptionStatus) {
    case "active":
    case "canceled":
    case "trial":
      return (
        <SubscriptionStatusContext.Provider value={subscriptionStatus}>
          {children}
        </SubscriptionStatusContext.Provider>
      );
    case "trial_expired":
      return (
        <>
          <Typography>
            Your trial period has ended. Please subscribe to continue.
          </Typography>
          <Navigate to="/papildyti" replace />
        </>
      );
    case "expired":
      return (
        <>
          <Typography>
            Your subscription has expired. Please renew to regain access.
          </Typography>
          <Navigate to="/papildyti" replace />
        </>
      );
    case "canceled_expired":
      return (
        <>
          <Typography>
            Your canceled subscription period has ended. Please subscribe again
            to access features.
          </Typography>
          <Navigate to="/papildyti" replace />
        </>
      );
    case "unknown":
      return (
        <>
          <Typography>
            Subscription status unknown. Please contact support.
          </Typography>
          <Navigate to="/papildyti" replace />
        </>
      );
    default:
      // fallback — на логин
      return <Navigate to="/prisijungti" replace />;
  }
};

export default PrivateRoute;



// import { createContext, useContext, useEffect, useState } from "react";
// import { useAuth } from "../contexts/useAuth";
// import { Navigate, useLocation } from "react-router-dom";
// import { subscription_status } from "../api/endpoints";
// import { Typography, CircularProgress, Box } from "@mui/material";

// // Создаем контекст
// const SubscriptionStatusContext = createContext(null);

// // Хук для использования контекста
// export const useSubscriptionStatus = () => useContext(SubscriptionStatusContext);

// const PrivateRoute = ({ children }) => {
//   const { isAuthenticated, loading, forceLogout, checkAuth } = useAuth();
//   const location = useLocation();

//   const [subscriptionStatus, setSubscriptionStatus] = useState(null);
//   const [checkingSubscription, setCheckingSubscription] = useState(false);
//   const [error, setError] = useState(null);

//   useEffect(() => {
//     // Если уже есть статус подписки — не проверяем заново
//     if (isAuthenticated && !subscriptionStatus) {
//       setCheckingSubscription(true);
//       setError(null);
//       subscription_status()
//         .then(res => setSubscriptionStatus(res.status || "unknown"))
//         .catch(err => {
//           console.error("Error fetching subscription status:", err);
//           if (err.response?.status === 401) {
//             forceLogout();
//           } else {
//             setError("error");
//           }
//         })
//         .finally(() => setCheckingSubscription(false));
//     } else if (!isAuthenticated) {
//       setSubscriptionStatus(null);
//       setCheckingSubscription(false);
//       setError(null);
//     }
//   }, [isAuthenticated, forceLogout, subscriptionStatus]);

//   // 1) Пока проверяем сам факт логина — показываем спиннер
//   if (loading) {
//     return (
//       <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
//         <CircularProgress sx={{ color: "#F5BE09" }} />
//       </Box>
//     );
//   }

//   // 2) Если не залогинен — редирект на логин
//   if (!isAuthenticated) {
//     return <Navigate to="/prisijungti" replace />;
//   }

//   // 3) Залогинен, но ещё не получили статус подписки — показываем спиннер
//   if (checkingSubscription || (!subscriptionStatus && !error)) {
//     return (
//       <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
//         <CircularProgress sx={{ color: "#F5BE09" }} />
//       </Box>
//     );
//   }

//   // 4) Если ошибка — показываем сообщение
//   if (error) {
//     return (
//       <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100vh" }}>
//         <CircularProgress sx={{ color: "#F5BE09" }} />
//         <Typography color="error" sx={{ mt: 2 }}>
//           Nepavyksta nustatyti prenumeratos būsenos. Bandom dar kartą…
//         </Typography>
//       </Box>
//     );
//   }

//   // 5) Дальше уже смотрим на subscriptionStatus
//   switch (subscriptionStatus) {
//     case "active":
//     case "canceled":
//     case "trial":
//       return (
//         <SubscriptionStatusContext.Provider value={subscriptionStatus}>
//           {children}
//         </SubscriptionStatusContext.Provider>
//       );
//     case "trial_expired":
//       return (
//         <>
//           <Typography>Your trial period has ended. Please subscribe to continue.</Typography>
//           <Navigate to="/papildyti" replace />
//         </>
//       );
//     case "expired":
//       return (
//         <>
//           <Typography>Your subscription has expired. Please renew to regain access.</Typography>
//           <Navigate to="/papildyti" replace />
//         </>
//       );
//     case "canceled_expired":
//       return (
//         <>
//           <Typography>
//             Your canceled subscription period has ended. Please subscribe again to access features.
//           </Typography>
//           <Navigate to="/papildyti" replace />
//         </>
//       );
//     case "unknown":
//       return (
//         <>
//           <Typography>Subscription status unknown. Please contact support.</Typography>
//           <Navigate to="/papildyti" replace />
//         </>
//       );
//     default:
//       // fallback — редирект на логин
//       return <Navigate to="/prisijungti" replace />;
//   }
// };

// export default PrivateRoute;




