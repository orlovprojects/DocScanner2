import axios from 'axios';
import config from '../config';

/**
 * Пытается обновить access-токен по refresh-token в cookie.
 * Возвращает true, если сервер ответил `{ refreshed: true }`, иначе — false.
 */
export const refresh_token = async () => {
  try {
    const { data } = await axios.post(
      `${config.BASE_API_URL}token/refresh/`,
      {},
      { withCredentials: true }
    );
    console.log('REFRESH_TOKEN response:', data);
    // Теперь проверяем именно поле `refreshed`:
    return data.refreshed === true;
  } catch (error) {
    console.error('REFRESH_TOKEN error:', error.response?.data || error.message);
    return false;
  }
};

function getCSRFToken() {
  let cookieValue = null;
  if (document.cookie && document.cookie !== "") {
    const cookies = document.cookie.split(";");
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, "csrftoken".length + 1) === "csrftoken" + "=") {
        cookieValue = decodeURIComponent(cookie.substring("csrftoken".length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

// === Инстанс для авторизованных запросов ===
export const api = axios.create({
  baseURL: config.BASE_API_URL,
  withCredentials: true,
});

// === ГЛОБАЛЬНЫЙ ИНТЕРСЕПТОР ДЛЯ CSRF (ДОБАВЬ ЭТО СРАЗУ ПОСЛЕ СОЗДАНИЯ api) ===
api.interceptors.request.use((config) => {
  const methodsWithCSRF = ["post", "put", "patch", "delete"];
  if (methodsWithCSRF.includes(config.method)) {
    const csrftoken = getCSRFToken();
    if (csrftoken) {
      config.headers["X-CSRFToken"] = csrftoken;
    }
  }
  return config;
});

// Интерсептор, который ловит 401, пробует обновить токен один раз и ретраит запрос
api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    if (
      originalRequest.url.includes('token/refresh') ||
      originalRequest._retry
    ) {
      if (error.response?.status === 401) {
        window.location = '/prisijungti/';
      }
      return Promise.reject(error);
    }
    if (error.response?.status === 401) {
      console.log('Interceptor caught 401, attempting refresh…');
      originalRequest._retry = true;
      const didRefresh = await refresh_token();
      if (didRefresh) {
        console.log('Token was refreshed, retrying original request');
        return api(originalRequest);
      }
    }
    return Promise.reject(error);
  }
);

// === Публичный инстанс (без куков) ===
export const publicApi = axios.create({
  baseURL: config.BASE_API_URL,
  withCredentials: false,
});

// === Реальные endpoint-функции ===
export const login = async (email, password) => {
  try {
    const { data } = await api.post('token/', { email, password });
    return data.success === true;
  } catch (error) {
    console.error('Login error:', error.response?.data || error.message);
    return false;
  }
};

export const logout = async () => {
  try {
    await api.post('logout/');
    return true;
  } catch {
    return false;
  }
};

export const is_authenticated = async () => {
  try {
    const { data } = await api.post('authenticated/');
    return data;  // { authenticated: true/false }
  } catch (error) {
    // Если 401 — просто возвращаем false!
    if (error.response?.status === 401) {
      return { authenticated: false };
    }
    return { authenticated: false }; // На всякий случай для других ошибок
  }
};


// export const is_authenticated = async () => {
//   try {
//     const { data } = await api.post('authenticated/');
//     return data;  // { authenticated: true/false }
//   } catch (error) {
//     console.error('is_authenticated error:', error.response?.data || error.message);
//     throw error;
//   }
// };

export const subscription_status = async () => {
  try {
    const { data } = await api.get('subscription-status/');
    return data;  // { status: ... }
  } catch (error) {
    console.error('Subscription status error:', error.response?.data || error.message);
    throw error;
  }
};

export const register = async (email, password) => {
  try {
    const { data } = await publicApi.post(
      'register/',
      { email, password },
      { headers: { 'Content-Type': 'application/json' } }
    );
    return data;
  } catch (error) {
    console.error('Registration error:', error.response?.data || error.message);
    throw error;
  }
};




// import axios from 'axios';
// import config from '../config';

// /**
//  * Пытается обновить access-токен по refresh-token в cookie.
//  * Возвращает true, если получилось, false — иначе.
//  */
// export const refresh_token = async () => {
//   try {
//     const { data } = await axios.post(
//       `${config.BASE_API_URL}token/refresh/`,
//       {},
//       { withCredentials: true }
//     );
//     console.log('REFRESH_TOKEN successful:', data);
//     return true;
//   } catch (error) {
//     console.error('REFRESH_TOKEN error:', error.response?.data || error.message);
//     return false;
//   }
// };

// // Инстанс для авторизованных запросов
// export const api = axios.create({
//   baseURL: config.BASE_API_URL,
//   withCredentials: true,
// });

// // Интерсептор для автоматического обновления access при 401
// api.interceptors.response.use(
//   response => response,
//   async error => {
//     const originalRequest = error.config;

//     // Если это запрос на обновление токена или уже был retry — не зацикливаемся
//     if (
//       originalRequest.url.includes('token/refresh') ||
//       originalRequest._retry
//     ) {
//       return Promise.reject(error);
//     }

//     if (error.response?.status === 401) {
//       console.log('Interceptor caught 401, refreshing token…');
//       originalRequest._retry = true;
//       const ok = await refresh_token();
//       if (ok) {
//         console.log('Token refreshed, retrying original request');
//         return api(originalRequest);
//       }
//     }

//     return Promise.reject(error);
//   }
// );

// // Публичный инстанс без куков
// export const publicApi = axios.create({
//   baseURL: config.BASE_API_URL,
//   withCredentials: false,
// });

// // Функции для работы с API
// export const login = async (email, password) => {
//   try {
//     const { data } = await api.post('token/', { email, password });
//     return data.success === true;
//   } catch (error) {
//     console.error('Login error:', error.response?.data || error.message);
//     return false;
//   }
// };

// export const logout = async () => {
//   try {
//     await api.post('logout/');
//     return true;
//   } catch {
//     return false;
//   }
// };

// export const is_authenticated = async () => {
//   try {
//     const { data } = await api.post('authenticated/');
//     return data;  // { authenticated: true/false }
//   } catch (error) {
//     console.error('is_authenticated error:', error.response?.data || error.message);
//     throw error;
//   }
// };

// export const subscription_status = async () => {
//   try {
//     const { data } = await api.get('subscription-status/');
//     return data;  // { status: ... }
//   } catch (error) {
//     console.error('Subscription status error:', error.response?.data || error.message);
//     throw error;
//   }
// };

// export const register = async (email, password) => {
//   try {
//     const { data } = await publicApi.post(
//       'register/',
//       { email, password },
//       { headers: { 'Content-Type': 'application/json' } }
//     );
//     return data;
//   } catch (error) {
//     console.error('Registration error:', error.response?.data || error.message);
//     throw error;
//   }
// };







// import axios from 'axios';
// import config from '../config';


// const LOGIN_URL = `${config.BASE_API_URL}token/`
// const REFRESH_URL = `${config.BASE_API_URL}token/refresh/`
// const LOGOUT_URL = `${config.BASE_API_URL}logout/`
// const AUTH_URL = `${config.BASE_API_URL}authenticated/`
// const REGISTER_URL = `${config.BASE_API_URL}register/`
// const SUBSCRIPTION_URL = `${config.BASE_API_URL}subscription-status/`

// axios.defaults.withCredentials = true; 


// export const login = async (email, password) => {
//     try {
//         const response = await axios.post(
//             LOGIN_URL, 
//             { email, password },  // Передаём email вместо username
//             { withCredentials: true }
//         );

//         // Предполагаем, что сервер возвращает объект с ключом success
//         if (response.data.success) {
//             return true;
//         } else {
//             console.error("Login failed: Invalid credentials.");
//             return false;
//         }
//     } catch (error) {
//         if (error.response) {
//             console.error("Server responded with an error:", error.response.data);
//         } else {
//             console.error("Request failed:", error.message);
//         }
//         return false;
//     }
// };


// // two functions to refresh token when getting 401 error

// export const refresh_token = async () => {
//     try {
//         const response = await axios.post(REFRESH_URL, {}, { withCredentials: true });
//         console.log("REFRESH_TOKEN: Успешно получен новый токен", response.data);
//         return true;
//     } catch (error) {
//         console.log("REFRESH_TOKEN: Ошибка при обновлении токена", error.response ? error.response.data : error.message);
//         return false;
//     }
// };


// export const call_refresh = async (error, func) => {
//     console.log("CALL_refresh: Функция вызвана из-за ошибки 401"); // Лог вызова функции

//     if (error.response && error.response.status === 401) {
//         console.log("CALL_refresh: Ошибка 401 обнаружена. Пытаемся обновить токен...");

//         const tokenRefreshed = await refresh_token();

//         if (tokenRefreshed) {
//             console.log("CALL_refresh: Токен успешно обновлён. Повторяем исходный запрос...");
//             const retryResponse = await func(); // Повторяем запрос после обновления токена
//             console.log("CALL_refresh: Повторный запрос выполнен успешно.");
//             return retryResponse.data;
//         } else {
//             console.log("CALL_refresh: Не удалось обновить токен. Возвращаем false.");
//         }
//     } else {
//         console.log("CALL_refresh: Ошибка не связана с 401. Возвращаем false.");
//     }

//     return false;
// };


// // function that logs out a user

// export const logout = async () => {
//     try {
//         await axios.post(LOGOUT_URL, 
//             {},
//             { withCredentials: true })
//         return true
//     } catch (error) {
//         return false
//     }
// }


// // function that checks if user is authenticated

// export const is_authenticated = async () => {
//   // Тело POST-запроса пустое, опции в третьем параметре
//   const response = await axios.post(AUTH_URL, {}, { withCredentials: true });
//   return response.data;  // { authenticated: true/false }
// };


// export const subscription_status = async () => {
//     try {
//         const response = await axios.get(SUBSCRIPTION_URL, { withCredentials: true });
//         return response.data; // Предполагаем, что статус содержится в response.data.status
//     } catch (error) {
//         console.error("Error fetching subscription status:", error);
//         throw error; // Пробрасываем ошибку для обработки в PrivateRoute
//     }
// };


// // function to register user

// export const register = async (email, password) => {
//     try {
//         const response = await axios.post(
//             REGISTER_URL,
//             { email, password },  // Передаём email и пароль, username удалён
//             { 
//                 headers: { 'Content-Type': 'application/json' },
//                 withCredentials: false,  // Отключаем передачу куков
//              }
//         );
//         return response.data;
//     } catch (error) {
//         console.error("Error during registration:", error.response ? error.response.data : error.message);
//         throw error;
//     }
// };