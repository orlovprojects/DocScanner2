import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "../contexts/useAuth";
import { Navigate } from "react-router-dom";
import { subscription_status } from "../api/endpoints";
import { Typography, CircularProgress, Box } from "@mui/material";

// Создаем контекст
const SubscriptionStatusContext = createContext(null);

// Хук для использования контекста
export const useSubscriptionStatus = () => useContext(SubscriptionStatusContext);

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [error, setError] = useState(null);

  // При смене isAuthenticated триггерим проверку подписки
  useEffect(() => {
    if (isAuthenticated) {
      setCheckingSubscription(true);
      setError(null);
      subscription_status()
        .then(res => setSubscriptionStatus(res.status || "unknown"))
        .catch(err => {
          console.error("Error fetching subscription status:", err);
          setError("error");
        })
        .finally(() => setCheckingSubscription(false));
    }
  }, [isAuthenticated]);

  // 1) Пока проверяем сам факт логина — показываем спиннер
  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <CircularProgress sx={{ color: "#F5BE09" }} />
      </Box>
    );
  }

  // 2) Если не залогинен — сразу переходим на логин
  // if (!isAuthenticated) {
  //   return <Navigate to="/login" />;
  // }

  // 3) Залогинен, но ещё не получили статус подписки — показываем спиннер
  if (checkingSubscription || !subscriptionStatus) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <CircularProgress sx={{ color: "#F5BE09" }} />
      </Box>
    );
  }

  // 4) Если ошибка — показываем спиннер и перезапрашиваем через 2 сек (auto-retry), либо можно показать friendly-UI
  if (error) {
    // Можно автоматом перезапросить (необязательно)
    // setTimeout(() => window.location.reload(), 2000);
    return (
      <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <CircularProgress sx={{ color: "#F5BE09" }} />
        <Typography color="error" sx={{ mt: 2 }}>
          Nepavyksta nustatyti prenumeratos būsenos. Bandom dar kartą…
        </Typography>
      </Box>
    );
  }

  // 5) Дальше уже смотрим на subscriptionStatus
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
          <Typography>Your trial period has ended. Please subscribe to continue.</Typography>
          <Navigate to="/papildyti" />
        </>
      );
    case "expired":
      return (
        <>
          <Typography>Your subscription has expired. Please renew to regain access.</Typography>
          <Navigate to="/papildyti" />
        </>
      );
    case "canceled_expired":
      return (
        <>
          <Typography>
            Your canceled subscription period has ended. Please subscribe again to access features.
          </Typography>
          <Navigate to="/papildyti" />
        </>
      );
    case "unknown":
      return (
        <>
          <Typography>Subscription status unknown. Please contact support.</Typography>
          <Navigate to="/papildyti" />
        </>
      );
    default:
      // fallback на всякий случай
      return null;
  }
};

export default PrivateRoute;








// import React, { createContext, useContext, useEffect, useState } from "react";
// import { useAuth } from "../contexts/useAuth";
// import { Navigate } from "react-router-dom";
// import { subscription_status } from "../api/endpoints";
// import { Typography, CircularProgress, Box } from "@mui/material";

// // Создаем контекст
// const SubscriptionStatusContext = createContext(null);

// // Хук для использования контекста
// export const useSubscriptionStatus = () => useContext(SubscriptionStatusContext);



// const PrivateRoute = ({ children }) => {
//     const { isAuthenticated, loading } = useAuth();
//     const [subscriptionStatus, setSubscriptionStatus] = useState(null);
//     const [checkingSubscription, setCheckingSubscription] = useState(true);

//     useEffect(() => {
//         if (isAuthenticated && subscriptionStatus === null) {
//             const checkSubscriptionStatus = async () => {
//                 try {
//                     const response = await subscription_status();
//                     setSubscriptionStatus(response?.status || "unknown");
//                 } catch (error) {
//                     console.error("Error fetching subscription status:", error);
//                     setSubscriptionStatus("error");
//                 } finally {
//                     setCheckingSubscription(false);
//                 }
//             };

//             checkSubscriptionStatus();
//         } else if (!isAuthenticated) {
//             setCheckingSubscription(false);
//         }
//     }, [isAuthenticated, subscriptionStatus]);

//     if (loading || checkingSubscription || subscriptionStatus === null) {
//         return (
//             <Box
//                 sx={{
//                     display: "flex",
//                     justifyContent: "center",
//                     alignItems: "center",
//                     height: "100vh", // Высота экрана
//                 }}
//             >
//                 <CircularProgress sx={{ color: '#F5BE09'}}/>
//             </Box>
//         );
//     }

//     if (isAuthenticated) {
//         switch (subscriptionStatus) {
//             case "active":
//             case "canceled":
//             case "trial":
//                 // Передаем subscriptionStatus дочернему компоненту
//                 return (
//                     <SubscriptionStatusContext.Provider value={subscriptionStatus}>
//                         {children}
//                     </SubscriptionStatusContext.Provider>
//                 );
//             case "trial_expired":
//                 return (
//                     <>
//                         <Typography>Your trial period has ended. Please subscribe to continue.</Typography>
//                         <Navigate to="/subscribe" />
//                     </>
//                 );
//             case "expired":
//                 return (
//                     <>
//                         <Typography>Your subscription has expired. Please renew to regain access.</Typography>
//                         <Navigate to="/subscribe" />
//                     </>
//                 );
//             case "canceled_expired":
//                 return (
//                     <>
//                         <Typography>Your canceled subscription period has ended. Please subscribe again to access features.</Typography>
//                         <Navigate to="/subscribe" />
//                     </>
//                 );
//             case "unknown":
//                 return (
//                     <>
//                         <Typography>Subscription status unknown. Please contact support.</Typography>
//                         <Navigate to="/subscribe" />
//                     </>
//                 );
//             case "error":
//             default:
//                 return <p>Error determining subscription status. Please try again later.</p>;
//         }
//     }

//     return <Navigate to="/login" />;
// };

// export default PrivateRoute;





// import React, { useEffect, useState } from "react";
// import { useAuth } from "../contexts/useAuth";
// import { Navigate } from "react-router-dom";
// import { subscription_status } from "../api/endpoints";
// import { Typography } from "@mui/material";

// const PrivateRoute = ({ children }) => {
//     const { isAuthenticated, loading } = useAuth();
//     const [subscriptionStatus, setSubscriptionStatus] = useState(null);
//     const [checkingSubscription, setCheckingSubscription] = useState(true);

//     useEffect(() => {
//         if (isAuthenticated && subscriptionStatus === null) {
//             const checkSubscriptionStatus = async () => {
//                 try {
//                     const response = await subscription_status();
//                     setSubscriptionStatus(response?.status || "unknown");
//                 } catch (error) {
//                     console.error("Error fetching subscription status:", error);
//                     setSubscriptionStatus("error");
//                 } finally {
//                     setCheckingSubscription(false);
//                 }
//             };

//             checkSubscriptionStatus();
//         } else if (!isAuthenticated) {
//             setCheckingSubscription(false);
//         }
//     }, [isAuthenticated, subscriptionStatus]);

//     if (loading || checkingSubscription || subscriptionStatus === null) {
//         return <p>Loading...</p>; // Показываем сообщение, пока данные загружаются
//     }

//     if (isAuthenticated) {
//         switch (subscriptionStatus) {
//             case "active":
//                 return children; // Полный доступ
//             case "canceled":
//                 return children; // Полный доступ
//             case "trial":
//                 return children; 
//             case "trial_expired":
//                 return (
//                     <>
//                         <Typography>Your trial period has ended. Please subscribe to continue.</Typography>
//                         <Navigate to="/subscribe" />
//                     </>
//                 );
//             case "expired":
//                 return (
//                     <>
//                         <Typography>Your subscription has expired. Please renew to regain access.</Typography>
//                         <Navigate to="/subscribe" />
//                     </>
//                 );
//             case "canceled_expired":
//                 return (
//                     <>
//                         <Typography>Your canceled subscription period has ended. Please subscribe again to access features.</Typography>
//                         <Navigate to="/subscribe" />
//                     </>
//                 );
//             case "unknown":
//                 return (
//                     <>
//                         <Typography>Subscription status unknown. Please contact support.</Typography>
//                         <Navigate to="/subscribe" />
//                     </>
//                 );
//             case "error":
//             default:
//                 return <p>Error determining subscription status. Please try again later.</p>;
//         }
//     }

//     return <Navigate to="/login" />;
// };

// export default PrivateRoute;











// import React, { useEffect, useState } from "react";
// import { useAuth } from "../contexts/useAuth";
// import { Navigate } from "react-router-dom";
// import { subscription_status } from "../api/endpoints";
// import { Typography } from "@mui/material";

// const PrivateRoute = ({ children }) => {
//     const { isAuthenticated, loading } = useAuth();
//     const [subscriptionStatus, setSubscriptionStatus] = useState(null);
//     const [checkingSubscription, setCheckingSubscription] = useState(true);

//     useEffect(() => {
//         // Запрос на подписку только если пользователь аутентифицирован и статус ещё не получен
//         if (isAuthenticated && subscriptionStatus === null) {
//             const checkSubscriptionStatus = async () => {
//                 try {
//                     const response = await subscription_status(); // Выполняем запрос
//                     setSubscriptionStatus(response?.status || "error"); // Устанавливаем статус (извлекаем из объекта)
//                 } catch (error) {
//                     console.error("Error fetching subscription status:", error);
//                     setSubscriptionStatus("error"); // Устанавливаем статус ошибки
//                 } finally {
//                     setCheckingSubscription(false); // Завершаем проверку
//                 }
//             };

//             checkSubscriptionStatus();
//         } else if (!isAuthenticated) {
//             setCheckingSubscription(false); // Если не аутентифицирован, прекращаем проверку
//         }
//     }, [isAuthenticated, subscriptionStatus]);

//     console.log("PrivateRoute - Loading:", loading);
//     console.log("PrivateRoute - isAuthenticated:", isAuthenticated);
//     console.log("PrivateRoute - Subscription Status:", subscriptionStatus);

//     if (loading || checkingSubscription) {
//         return <p>Loading...</p>; // Пока данные загружаются
//     }

//     if (isAuthenticated) {
//         switch (subscriptionStatus) {
//             case "active":
//                 return children; // Полный доступ
//             case "canceled":
//                 return children; // Полный доступ
//             case "trial":
//                 return children; 
//             case "trial_expired":
//                 return <Navigate to="/subscribe"/>;
//             case "expired":
//                 return <Navigate to="/subscribe" />; // Перенаправление на подписку
//             case "canceled_expired":
//                 return <Navigate to="/subscribe"/>;
//             case "unknown":
//                 return <Navigate to="/subscribe"/>;
//             case "error":
//             default:
//                 return <Navigate to="/subscribe"/>; // Ошибка
//         }
//     }

//     // Если пользователь не аутентифицирован, перенаправляем на логин
//     return <Navigate to="/login" />;
// };

// export default PrivateRoute;