import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';

import Login from './pages/login';
import Subscribe from './pages/subscribe';
import Register from './pages/register';
import Footer from './page_elements/Footer';
import Contact from './pages/contact';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import AtlyginimoSkaiciuokle from './pages/AtlyginimoSkaiciuokle';
import AtlyginimoSkaiciuokle2026 from './pages/AtlyginimoSkaiciuokle2026';

import AdminDashboard from "./pages/AdminDashboard";
import AdminSuvestine from "./pages/AdminSuvestine";

import AuthProvider from './contexts/useAuth';
import PrivateRoute from './components/private_route';
import RedirectIfAuthenticated from './components/RedirectIfAuthenticated';
import RequireSuperuser from "./components/RequireSuperuser";

import Header from './page_elements/Header';
import { initializeAnalytics, logPageView } from './analytics';

import './styles/MainChart.css';

import UploadPage from './pages/UploadPage';
import NustatymaiPage from './pages/Nustatymai';
import Dokskenas from './pages/DokSkenas';
import PvmCalculator from './pages/PVMskaiciuokle';
import GpmSkaiciuokle from './pages/GPMskaiciuokle';

import { initMetaPixel } from './metaPixel';

function App() {
  const location = useLocation();

  // Google Analytics — init once
  useEffect(() => {
    initializeAnalytics();
  }, []);

  // Meta Pixel — init once
  useEffect(() => {
    initMetaPixel(import.meta.env.VITE_META_PIXEL_ID);
  }, []);

  // GA: log page view on route change
  useEffect(() => {
    logPageView(location.pathname);
  }, [location]);

  // Meta Pixel: PageView with strong duplicate guard
  useEffect(() => {
    if (typeof window === 'undefined' || !window.fbq) return;

    window.__sent_pv = window.__sent_pv || new Set();
    const path = location.pathname + location.search;

    const now = Date.now();
    const last = window.__fbq_last_pv || { path: '', ts: 0 };

    const shouldSend =
      !window.__sent_pv.has(path) || now - last.ts > 1500 || last.path !== path;

    if (shouldSend) {
      window.fbq('track', 'PageView');
      window.__sent_pv.add(path);
      window.__fbq_last_pv = { path, ts: now };
      if (import.meta.env.DEV) console.debug('[Pixel] PageView:', path);
    }
  }, [location.pathname, location.search]);

  return (
    <AuthProvider>
      <Header />
      <Routes>
        <Route path="/" element={<AtlyginimoSkaiciuokle />} />
        <Route path="/2026" element={<AtlyginimoSkaiciuokle2026 />} />
        <Route path="/saskaitu-skaitmenizavimas-dokskenas" element={<Dokskenas />} />
        <Route path="/pvm-skaiciuokle" element={<PvmCalculator />} />
        <Route path="/gpm-skaiciuokle" element={<GpmSkaiciuokle />} />
        <Route
          path="/suvestine"
          element={
            <PrivateRoute>
              <UploadPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/prisijungti"
          element={
            <RedirectIfAuthenticated>
              <Login />
            </RedirectIfAuthenticated>
          }
        />
        <Route
          path="/registruotis"
          element={
            <RedirectIfAuthenticated>
              <Register />
            </RedirectIfAuthenticated>
          }
        />
        <Route path="/papildyti" element={<Subscribe />} />
        <Route path="/susisiekti" element={<Contact />} />
        <Route
          path="/nustatymai"
          element={
            <PrivateRoute>
              <NustatymaiPage />
            </PrivateRoute>
          }
        />
        <Route path="/privatumo-politika" element={<Privacy />} />
        <Route path="/naudojimo-taisykles" element={<Terms />} />
        <Route path="/admin-dashboard" element={
          <RequireSuperuser loginPath="/login" forbiddenPath="/403">
            <AdminDashboard />
          </RequireSuperuser>
        }
        />
        <Route
          path="/admin-suvestine"
          element={
            <RequireSuperuser>
              <AdminSuvestine />
            </RequireSuperuser>
          }
        />
      </Routes>
      <Footer />
    </AuthProvider>
  );
}

export default App;






// import { useEffect } from 'react';
// import { Route, Routes, useLocation } from 'react-router-dom'; // Убираем лишний импорт `Router`
// import Login from './pages/login';
// import Subscribe from './pages/subscribe';
// import Register from './pages/register';
// import Footer from './page_elements/Footer';
// import Contact from './pages/contact';
// import Terms from './pages/Terms';
// import Privacy from './pages/Privacy';
// import AtlyginimoSkaiciuokle from './pages/AtlyginimoSkaiciuokle';
// import AtlyginimoSkaiciuokle2026 from './pages/AtlyginimoSkaiciuokle2026';

// import AuthProvider from './contexts/useAuth';
// import PrivateRoute from './components/private_route';
// import RedirectIfAuthenticated from './components/RedirectIfAuthenticated';

// import Header from './page_elements/Header';
// import { initializeAnalytics, logPageView } from './analytics';

// import './styles/MainChart.css';

// import UploadPage from './pages/UploadPage';
// import NustatymaiPage from './pages/Nustatymai';
// import Dokskenas from './pages/DokSkenas';


// function App() {
//     const location = useLocation();

//     useEffect(() => {
//         // Инициализация Google Analytics
//         initializeAnalytics();
//     }, []);

//     useEffect(() => {
//         // Логирование просмотра страницы при каждом изменении маршрута
//         logPageView(location.pathname);
//     }, [location]);

//     return (
//         <AuthProvider>
//             <Header /> {/* Добавляем Header сюда */}
//             <Routes>
//                 <Route path="/" element={<AtlyginimoSkaiciuokle />} />
//                 <Route path="/2026" element={<AtlyginimoSkaiciuokle2026 />} />
//                 <Route path="/saskaitu-skaitmenizavimas-dokskenas" element={<Dokskenas />} />
//                 <Route path="/suvestine" element={<PrivateRoute><UploadPage /></PrivateRoute>} />
//                 <Route path="/prisijungti" element={<RedirectIfAuthenticated><Login /></RedirectIfAuthenticated>} />
//                 <Route path="/registruotis" element={<RedirectIfAuthenticated><Register /></RedirectIfAuthenticated>} />
//                 <Route path="/papildyti" element={<Subscribe />} />
//                 <Route path="/susisiekti" element={<Contact />} />
//                 <Route path="/nustatymai" element={<PrivateRoute><NustatymaiPage /></PrivateRoute>} />
//                 <Route path="/privatumo-politika" element={<Privacy />} />
//                 <Route path="/naudojimo-taisykles" element={<Terms />} />
//             </Routes>
//             <Footer />
//         </AuthProvider>
//     );
// }

// export default App;