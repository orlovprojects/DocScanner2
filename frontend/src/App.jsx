import { useEffect } from 'react';
import { Route, Routes, useLocation, Navigate } from 'react-router-dom';

import Login from './pages/login';
import Subscribe from './pages/subscribe';
import Register from './pages/register';
import PasswordReset from './pages/PasswordReset';
import Footer from './page_elements/Footer';
import Contact from './pages/contact';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import AtlyginimoSkaiciuokle2025 from './pages/AtlyginimoSkaiciuokle2025';
import AtlyginimoSkaiciuokle2026 from './pages/AtlyginimoSkaiciuokle2026';
import InvoiceGenerator from './pages/InvoiceGenerator';
import BuhalterinenApskaita from './pages/BuhalterineApskaita';
import SumaZodziais from './pages/SumaZodziais';
import AboutUs from './pages/ApieMus';

import AdminDashboard from "./pages/AdminDashboard";
import AdminSuvestine from "./pages/AdminSuvestine";
import AdminVisiFailai from "./pages/AdminVisiFailai";
import AdminKlientai from "./pages/AdminKlientai";

import NaudojimoGidas from './pages/NaudojimoGidas';
import GidoCategories from './pages/GidoCategories';
import GidoArticle from './pages/GidoArticle';

import AuthProvider from './contexts/useAuth';
import PrivateRoute from './components/private_route';
import RedirectIfAuthenticated from './components/RedirectIfAuthenticated';
import RequireSuperuser from "./components/RequireSuperuser";

import Header from './page_elements/Header';
import { initializeAnalytics, logPageView } from './analytics';

import './styles/MainChart.css';

import UploadPage from './pages/UploadPage';
import NustatymaiPage from './pages/Nustatymai';
import IsKlientu from './pages/IsKlientu';
import Dokskenas from './pages/DokSkenas';
import PvmCalculator from './pages/PVMskaiciuokle';
import GpmSkaiciuokle from './pages/GPMskaiciuokle';

import { initMetaPixel } from './metaPixel';
import MokejimuIstorija from './pages/MokejimuIstorija';
import NotFound from './pages/NotFound';

import B1 from './LPs/b1';
import Rivile from './LPs/rivile';

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
        <Route path="/" element={<AtlyginimoSkaiciuokle2026 />} />
        <Route path="/apie-mus" element={<AboutUs />} />
        <Route path="/2025" element={<AtlyginimoSkaiciuokle2025 />} />
        <Route path="/2026" element={<Navigate to="/" replace />} />
        <Route path="/saskaitu-skaitmenizavimas-dokskenas" element={<Dokskenas />} />
        <Route path="/pvm-skaiciuokle" element={<PvmCalculator />} />
        <Route path="/gpm-skaiciuokle" element={<GpmSkaiciuokle />} />
        <Route path="/naudojimo-gidas" element={<NaudojimoGidas />} />
        <Route path="/kategorija/:slug" element={<GidoCategories />} />
        <Route path="/straipsnis/:slug" element={<GidoArticle />} />

        <Route path="/b1" element={<B1 />} />
        <Route path="/rivile" element={<Rivile />} />

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
        <Route
          path="/is-klientu"
          element={
            <PrivateRoute>
              <IsKlientu />
            </PrivateRoute>
          }
        />
        <Route
          path="/mokejimu-istorija"
          element={
            <PrivateRoute>
              <MokejimuIstorija />
            </PrivateRoute>
          }
        />
        {/* <Route path="/pl" element={<AtlyginimoSkaiciuoklePL2026 />} /> */}
        <Route path="/priminti-slaptazodi" element={<PasswordReset />} />
        <Route path="/buhalterine-apskaita" element={<BuhalterinenApskaita />} />
        <Route path="/suma-zodziais" element={<SumaZodziais />} />
        <Route path="/privatumo-politika" element={<Privacy />} />
        <Route path="/naudojimo-taisykles" element={<Terms />} />
        <Route path="/saskaita-faktura" element={<InvoiceGenerator />} />
        <Route path="/admin-dashboard" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><AdminDashboard /></RequireSuperuser>} />
        <Route path="/admin-visi-failai" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><AdminVisiFailai /></RequireSuperuser>} />
        <Route path="/admin-suvestine" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><AdminSuvestine /></RequireSuperuser>} />
        <Route path="/admin-klientai" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><AdminKlientai /></RequireSuperuser>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
      <Footer />
    </AuthProvider>
  );
}

export default App;

