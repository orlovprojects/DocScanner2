import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { is_authenticated, login, register, logout } from "../api/endpoints";

const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  // Проверка аутентификации
  const get_authenticated = async () => {
    console.log("Checking authentication...");
    try {
      const data = await is_authenticated();
      console.log("Authentication check result:", data);
      setIsAuthenticated(data.authenticated === true);
    } catch (error) {
      console.log("Error checking authentication:", error);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
      console.log("Authentication loading complete, isAuthenticated:", isAuthenticated);
    }
  };

  // Логин
  const login_user = async (email, password) => {
    console.log("Starting login process...");
    try {
      const success = await login(email, password);
      console.log("Login response:", success);
      if (success) {
        setIsAuthenticated(true);
        console.log("Login successful, redirecting to dashboard...");
        setTimeout(() => {
          navigate('/suvestine');
        }, 50);
      } else {
        console.log("Login failed, invalid credentials");
        alert("Invalid email or password");
      }
    } catch (error) {
      console.log("Error during login:", error);
      alert("Error during login");
    }
  };

  // Логаут
  const logout_user = async () => {
    console.log("Starting logout process...");
    try {
      const success = await logout();
      console.log("Logout response:", success);
      if (success) {
        // Очистка состояния
        setIsAuthenticated(false);
        console.log("Logout successful, redirecting to login...");
        navigate('/prisijungti');
      } else {
        console.log("Logout failed");
      }
    } catch (error) {
      console.log("Error during logout:", error);
    }
  };

  // Регистрация
  const register_user = async (email, password, Cpassword) => {
    console.log("Starting registration process...");
    try {
      if (password === Cpassword) {
        console.log("Passwords match, proceeding with registration...");
        await register(email, password);
        await login(email, password); // <= вот это!
        navigate('/suvestine');       // <= и это!
      } else {
        console.log("Passwords do not match.");
        alert('Passwords do not match.');
      }
    } catch (error) {
      console.log("Error during registration:", error);
      alert('Error registering user');
    }
  };

  // Проверка при загрузке страницы и каждом изменении пути
  useEffect(() => {
    console.log("Checking authentication on path change...", location.pathname);
    get_authenticated();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        loading,
        login_user,
        logout_user,
        register_user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
export default AuthProvider;







// import { createContext, useContext, useEffect, useState } from "react";
// import { is_authenticated, login, register, logout, call_refresh } from "../api/endpoints";
// import { useNavigate } from "react-router-dom";

// const AuthContext = createContext();

// const AuthProvider = ({children}) => {

//     const [isAuthenticated, setIsAuthenticated] = useState(false)
//     const [loading, setLoading] = useState(true)
//     const nav = useNavigate();

    
//     const get_authenticated = async () => {
//         console.log("Checking authentication...");
//         try {
//             const success = await is_authenticated();
//             console.log("Authentication check result:", success);
//             setIsAuthenticated(success);
//         } catch (error) {
//             console.log("Error checking authentication:", error);
//             setIsAuthenticated(false);
//         } finally {
//             setLoading(false);
//             console.log("Authentication loading complete, isAuthenticated:", isAuthenticated);
//         }
//     }

//     const login_user = async (email, password) => {
//         console.log("Starting login process...");
//         try {
//             const success = await login( email, password ); // Передаём объект с email и паролем
//             console.log("Login response:", success);
//             if (success) {
//                 setIsAuthenticated(true);
//                 console.log("Login successful, redirecting to analyser...");
//                 nav('/analyser');
//             } else {
//                 console.log("Login failed, invalid credentials");
//                 alert("Invalid email or password");
//             }
//         } catch (error) {
//             console.log("Error during login:", error);
//             alert("Error during login");
//         }
//     };


//     const logout_user = async () => {
//         console.log("Starting logout process...");
//         try {
//             const success = await logout(); // Вызываем logout API
//             console.log("Logout response:", success);
    
//             if (success) {
//                 // Удаляем токены из cookies
//                 document.cookie = "access_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT;";
//                 document.cookie = "refresh_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT;";
                
//                 // Сбрасываем состояние аутентификации
//                 setIsAuthenticated(false);
//                 console.log("Logout successful, redirecting to login...");
    
//                 // Перенаправляем на страницу логина
//                 nav('/login');
//             } else {
//                 console.log("Logout failed");
//             }
//         } catch (error) {
//             console.log("Error during logout:", error);
//         }
//     };


//     const register_user = async (email, password, Cpassword) => {
//         console.log("Starting registration process...");
//         try {
//             if (password === Cpassword) {
//                 console.log("Passwords match, proceeding with registration...");
//                 await register( email, password );
//                 console.log('User successfully registered');
//                 alert('User successfully registered');
//                 nav('/login');
//             } else {
//                 console.log("Passwords do not match.");
//                 alert('Passwords do not match.');
//             }
//         } catch (error) {
//             console.log("Error during registration:", error);
//             alert('Error registering user');
//         }
//     };

//     useEffect(() => {
//         console.log("Checking authentication on page load...");
//         get_authenticated();
//     }, [window.location.pathname]);

//     return (
//         <AuthContext.Provider value={{isAuthenticated, loading, login_user, logout_user, register_user}}>
//             {children}
//         </AuthContext.Provider>
//     )
// }

// export const useAuth = () => useContext(AuthContext);

// export default AuthProvider;