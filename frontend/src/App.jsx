import { useEffect, lazy, Suspense } from 'react';
import { Route, Routes, useLocation, Navigate } from 'react-router-dom';

// ─── Eager: layout shell (всегда нужны сразу) ───
import AuthProvider from './contexts/useAuth';
import Header from './page_elements/Header';
import Footer from './page_elements/Footer';
import ScrollToTop from './page_elements/ScrollToTop';
import PrivateRoute from './components/private_route';
import RedirectIfAuthenticated from './components/RedirectIfAuthenticated';
import RequireSuperuser from "./components/RequireSuperuser";
import CookieConsent from './components/CookieConsent';
import CircularProgress from '@mui/material/CircularProgress';
import { initializeAnalytics, logPageView } from './analytics';
import { initMetaPixel } from './metaPixel';
import { initGTM } from "./gtm";
import './styles/MainChart.css';

// ─── Lazy: все страницы ───
const InvLayout = lazy(() => import('./components/InvLayout'));

const Login = lazy(() => import('./pages/login'));
const Subscribe = lazy(() => import('./pages/subscribe'));
const Register = lazy(() => import('./pages/register'));
const PasswordReset = lazy(() => import('./pages/PasswordReset'));
const Contact = lazy(() => import('./pages/contact'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const AtlyginimoSkaiciuokle2025 = lazy(() => import('./pages/AtlyginimoSkaiciuokle2025'));
const AtlyginimoSkaiciuokle2026 = lazy(() => import('./pages/AtlyginimoSkaiciuokle2026'));
const IndividualiosVeiklosSkaiciuokle2026 = lazy(() => import('./pages/IndividualiosVeiklosSkaiciuokle2026'));
const MBSkaiciuokle = lazy(() => import('./pages/MBSkaiciuokle'));
const InvoiceGenerator = lazy(() => import('./pages/InvoiceGenerator'));
const BuhalterinenApskaita = lazy(() => import('./pages/BuhalterineApskaita'));
const SumaZodziais = lazy(() => import('./pages/SumaZodziais'));
const AboutUs = lazy(() => import('./pages/ApieMus'));

const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminSuvestine = lazy(() => import("./pages/AdminSuvestine"));
const AdminVisiFailai = lazy(() => import("./pages/AdminVisiFailai"));
const AdminVaztarasciai = lazy(() => import("./pages/AdminVaztarasciai"));
const AdminKlientai = lazy(() => import("./pages/AdminKlientai"));
const AdminIsrasytosSaskaitos = lazy(() => import('./pages/AdminIsrasytosSaskaitos'));
const NewsletterPage = lazy(() => import('./pages/NewsletterPage'));

const NaudojimoGidas = lazy(() => import('./pages/NaudojimoGidas'));
const GidoCategories = lazy(() => import('./pages/GidoCategories'));
const GidoArticle = lazy(() => import('./pages/GidoArticle'));

const UploadPage = lazy(() => import('./pages/UploadPage'));
const WaybillsPage = lazy(() => import('./pages/WaybillsPage'));
const NustatymaiPage = lazy(() => import('./pages/Nustatymai'));
const IsKlientu = lazy(() => import('./pages/IsKlientu'));
const Dokskenas = lazy(() => import('./pages/DokSkenas'));
const PvmCalculator = lazy(() => import('./pages/PVMskaiciuokle'));
const GpmSkaiciuokle = lazy(() => import('./pages/GPMskaiciuokle'));

const MokejimuIstorija = lazy(() => import('./pages/MokejimuIstorija'));
const NotFound = lazy(() => import('./pages/NotFound'));

const SitePro = lazy(() => import('./LPs/site_pro'));
const Rivile = lazy(() => import('./LPs/rivile'));
const Agnum = lazy(() => import('./LPs/agnum'));
const Centas = lazy(() => import('./LPs/centas'));
const Apsa = lazy(() => import('./LPs/apsa'));
const Apskaita5 = lazy(() => import('./LPs/apskaita5'));
const Finvalda = lazy(() => import('./LPs/finvalda'));
const Debetas = lazy(() => import('./LPs/debetas'));
const Pragma = lazy(() => import('./LPs/pragma'));

const InvoiceSettingsPage = lazy(() => import('./pages/InvoiceSettingsPage'));
const InvoiceListPage = lazy(() => import('./pages/InvoiceListPage'));
const InvoiceEditorPage = lazy(() => import('./pages/InvoiceEditorPage'));
const InvoiceSeriesPage = lazy(() => import('./pages/InvoiceSeriesPage'));
const MeasurementUnitsPage = lazy(() => import('./pages/MeasurementUnitsPage'));
const CounterpartiesPage = lazy(() => import('./pages/CounterpartiesPage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const BankStatementsPage = lazy(() => import('./pages/BankStatementsPage'));
const InvoicePublicPage = lazy(() => import('./pages/InvoicePublicPage'));
const VeiklosZurnalasPage = lazy(() => import('./pages/VeiklosZurnalasPage'));
const OSSReportPage = lazy(() => import('./pages/Ossreportpage'));
const SVSReportPage = lazy(() => import('./pages/SVSReportPage'));

// ─── Loader для Suspense ───
function PageLoader() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '60vh',
    }}>
      <CircularProgress size={40} />
    </div>
  );
}

function App() {
  const location = useLocation();
  const isPublicInvoice = location.pathname.startsWith('/sf/');

  useEffect(() => {
    initializeAnalytics();
  }, []);

  useEffect(() => {
    initMetaPixel(import.meta.env.VITE_META_PIXEL_ID);
  }, []);

  useEffect(() => {
    initGTM(import.meta.env.VITE_GTM_ID);
  }, []);

  useEffect(() => {
    logPageView(location.pathname);
  }, [location]);

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

  // Публичная страница — без AuthProvider, без Header/Footer
  if (isPublicInvoice) {
    return (
      <>
        <ScrollToTop />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/sf/:uuid" element={<InvoicePublicPage />} />
          </Routes>
        </Suspense>
      </>
    );
  }

  return (
    <AuthProvider>
      <ScrollToTop />
      <Header />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<AtlyginimoSkaiciuokle2026 />} />
          <Route path="/apie-mus" element={<AboutUs />} />
          <Route path="/2025" element={<AtlyginimoSkaiciuokle2025 />} />
          <Route path="/2026" element={<Navigate to="/" replace />} />
          <Route path="/individualios-veiklos-skaiciuokle" element={<IndividualiosVeiklosSkaiciuokle2026 />} />
          <Route path="/mazosios-bendrijos-skaiciuokle" element={<MBSkaiciuokle />} />
          <Route path="/saskaitu-skaitmenizavimas-dokskenas" element={<Dokskenas />} />
          <Route path="/pvm-skaiciuokle" element={<PvmCalculator />} />
          <Route path="/gpm-skaiciuokle" element={<GpmSkaiciuokle />} />
          <Route path="/naudojimo-gidas" element={<NaudojimoGidas />} />
          <Route path="/kategorija/:slug" element={<GidoCategories />} />
          <Route path="/straipsnis/:slug" element={<GidoArticle />} />

          <Route path="/site-pro" element={<SitePro />} />
          <Route path="/rivile" element={<Rivile />} />
          <Route path="/agnum" element={<Agnum />} />
          <Route path="/centas" element={<Centas />} />
          <Route path="/apsa" element={<Apsa />} />
          <Route path="/apskaita5" element={<Apskaita5 />} />
          <Route path="/finvalda" element={<Finvalda />} />
          <Route path="/debetas" element={<Debetas />} />
          <Route path="/pragma" element={<Pragma />} />

          <Route element={<InvLayout />}>
            <Route path="/israsymas" element={<InvoiceListPage />} />
            <Route path="/israsymas/nustatymai" element={<InvoiceSettingsPage />} />
            <Route path="/israsymas/nauja" element={<InvoiceEditorPage />} />
            <Route path="/israsymas/:id" element={<InvoiceEditorPage />} />
            <Route path="/israsymas/serijos-numeracijos" element={<InvoiceSeriesPage />} />
            <Route path="/israsymas/matavimo-vienetai" element={<MeasurementUnitsPage />} />
            <Route path="/israsymas/klientai" element={<CounterpartiesPage />} />
            <Route path="/israsymas/prekes-paslaugos" element={<ProductsPage />} />
            <Route path="/israsymas/banko-israsai" element={<BankStatementsPage />} />
          </Route>

          <Route path="/suvestine" element={<PrivateRoute><UploadPage /></PrivateRoute>} />
          <Route path="/vaztarasciai" element={<PrivateRoute><WaybillsPage /></PrivateRoute>} />
          <Route path="/prisijungti" element={<RedirectIfAuthenticated><Login /></RedirectIfAuthenticated>} />
          <Route path="/registruotis" element={<RedirectIfAuthenticated><Register /></RedirectIfAuthenticated>} />
          <Route path="/veiklos-zurnalas" element={<PrivateRoute><VeiklosZurnalasPage /></PrivateRoute>} />
          <Route path="/oss-zurnalas" element={<PrivateRoute><OSSReportPage /></PrivateRoute>} />
          <Route path="/svs-deklaravimas" element={<PrivateRoute><SVSReportPage /></PrivateRoute>} />
          <Route path="/papildyti" element={<Subscribe />} />
          <Route path="/susisiekti" element={<Contact />} />
          <Route path="/nustatymai" element={<PrivateRoute><NustatymaiPage /></PrivateRoute>} />
          <Route path="/is-klientu" element={<PrivateRoute><IsKlientu /></PrivateRoute>} />
          <Route path="/mokejimu-istorija" element={<PrivateRoute><MokejimuIstorija /></PrivateRoute>} />
          <Route path="/priminti-slaptazodi" element={<PasswordReset />} />
          <Route path="/buhalterine-apskaita" element={<BuhalterinenApskaita />} />
          <Route path="/suma-zodziais" element={<SumaZodziais />} />
          <Route path="/privatumo-politika" element={<Privacy />} />
          <Route path="/naudojimo-taisykles" element={<Terms />} />
          <Route path="/saskaitu-israsymas" element={<InvoiceGenerator />} />
          <Route path="/admin-dashboard" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><AdminDashboard /></RequireSuperuser>} />
          <Route path="/admin-vaztarasciai" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><AdminVaztarasciai /></RequireSuperuser>} />
          <Route path="/admin-visi-failai" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><AdminVisiFailai /></RequireSuperuser>} />
          <Route path="/admin-suvestine" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><AdminSuvestine /></RequireSuperuser>} />
          <Route path="/admin-klientai" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><AdminKlientai /></RequireSuperuser>} />
          <Route path="/admin-israsytos-saskaitos" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><AdminIsrasytosSaskaitos /></RequireSuperuser>} />
          <Route path="/admin-newsletter" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><NewsletterPage /></RequireSuperuser>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Footer />
      <CookieConsent />
    </AuthProvider>
  );
}

export default App;






// import { useEffect } from 'react';
// import { Route, Routes, useLocation, Navigate } from 'react-router-dom';
// import InvLayout from './components/InvLayout';

// import Login from './pages/login';
// import Subscribe from './pages/subscribe';
// import Register from './pages/register';
// import PasswordReset from './pages/PasswordReset';
// import Footer from './page_elements/Footer';
// import Contact from './pages/contact';
// import Terms from './pages/Terms';
// import Privacy from './pages/Privacy';
// import AtlyginimoSkaiciuokle2025 from './pages/AtlyginimoSkaiciuokle2025';
// import AtlyginimoSkaiciuokle2026 from './pages/AtlyginimoSkaiciuokle2026';
// import InvoiceGenerator from './pages/InvoiceGenerator';
// import BuhalterinenApskaita from './pages/BuhalterineApskaita';
// import SumaZodziais from './pages/SumaZodziais';
// import AboutUs from './pages/ApieMus';

// import AdminDashboard from "./pages/AdminDashboard";
// import AdminSuvestine from "./pages/AdminSuvestine";
// import AdminVisiFailai from "./pages/AdminVisiFailai";
// import AdminKlientai from "./pages/AdminKlientai";
// import AdminIsrasytosSaskaitos from './pages/AdminIsrasytosSaskaitos';
// import NewsletterPage from './pages/NewsletterPage';

// import NaudojimoGidas from './pages/NaudojimoGidas';
// import GidoCategories from './pages/GidoCategories';
// import GidoArticle from './pages/GidoArticle';

// import AuthProvider from './contexts/useAuth';
// import PrivateRoute from './components/private_route';
// import RedirectIfAuthenticated from './components/RedirectIfAuthenticated';
// import RequireSuperuser from "./components/RequireSuperuser";
// import CookieConsent from './components/CookieConsent';


// import Header from './page_elements/Header';
// import { initializeAnalytics, logPageView } from './analytics';

// import './styles/MainChart.css';

// import UploadPage from './pages/UploadPage';
// import NustatymaiPage from './pages/Nustatymai';
// import IsKlientu from './pages/IsKlientu';
// import Dokskenas from './pages/DokSkenas';
// import PvmCalculator from './pages/PVMskaiciuokle';
// import GpmSkaiciuokle from './pages/GPMskaiciuokle';
// // import DividenduSkaiciuokle from './pages/DividenduSkaiciuokle';

// import { initMetaPixel } from './metaPixel';
// import { initGTM } from "./gtm";
// import ScrollToTop from './page_elements/ScrollToTop';

// import MokejimuIstorija from './pages/MokejimuIstorija';
// import NotFound from './pages/NotFound';

// import SitePro from './LPs/site_pro';
// import Rivile from './LPs/rivile';
// import Agnum from './LPs/agnum';
// import Centas from './LPs/centas';
// import Apsa from './LPs/apsa';
// import Apskaita5 from './LPs/apskaita5';
// import Finvalda from './LPs/finvalda';
// import Debetas from './LPs/debetas';
// import Pragma from './LPs/pragma';

// import InvoiceSettingsPage from './pages/InvoiceSettingsPage';
// import InvoiceListPage from './pages/InvoiceListPage';
// import InvoiceEditorPage from './pages/InvoiceEditorPage';
// import InvoiceSeriesPage from './pages/InvoiceSeriesPage';
// import MeasurementUnitsPage from './pages/MeasurementUnitsPage';
// import CounterpartiesPage from './pages/CounterpartiesPage';
// import ProductsPage from './pages/ProductsPage';
// import BankStatementsPage from './pages/BankStatementsPage';
// import InvoicePublicPage from './pages/InvoicePublicPage';
// import VeiklosZurnalasPage from './pages/VeiklosZurnalasPage';
// import OSSReportPage from './pages/Ossreportpage';


// function App() {
//   const location = useLocation();
//   const isPublicInvoice = location.pathname.startsWith('/sf/');

//   useEffect(() => {
//     initializeAnalytics();
//   }, []);

//   useEffect(() => {
//     initMetaPixel(import.meta.env.VITE_META_PIXEL_ID);
//   }, []);

//   useEffect(() => {
//     initGTM(import.meta.env.VITE_GTM_ID);
//   }, []);

//   useEffect(() => {
//     logPageView(location.pathname);
//   }, [location]);

//   useEffect(() => {
//     if (typeof window === 'undefined' || !window.fbq) return;

//     window.__sent_pv = window.__sent_pv || new Set();
//     const path = location.pathname + location.search;

//     const now = Date.now();
//     const last = window.__fbq_last_pv || { path: '', ts: 0 };

//     const shouldSend =
//       !window.__sent_pv.has(path) || now - last.ts > 1500 || last.path !== path;

//     if (shouldSend) {
//       window.fbq('track', 'PageView');
//       window.__sent_pv.add(path);
//       window.__fbq_last_pv = { path, ts: now };
//       if (import.meta.env.DEV) console.debug('[Pixel] PageView:', path);
//     }
//   }, [location.pathname, location.search]);

//   // Публичная страница — без AuthProvider, без Header/Footer
//   if (isPublicInvoice) {
//     return (
//       <>
//         <ScrollToTop />
//         <Routes>
//           <Route path="/sf/:uuid" element={<InvoicePublicPage />} />
//         </Routes>
//       </>
//     );
//   }  

//   return (
//     <AuthProvider>
//       <ScrollToTop />
//       {!isPublicInvoice && <Header />}
//       <Routes>
//         <Route path="/" element={<AtlyginimoSkaiciuokle2026 />} />
//         <Route path="/apie-mus" element={<AboutUs />} />
//         <Route path="/2025" element={<AtlyginimoSkaiciuokle2025 />} />
//         <Route path="/2026" element={<Navigate to="/" replace />} />
//         <Route path="/saskaitu-skaitmenizavimas-dokskenas" element={<Dokskenas />} />
//         <Route path="/pvm-skaiciuokle" element={<PvmCalculator />} />
//         <Route path="/gpm-skaiciuokle" element={<GpmSkaiciuokle />} />
//         <Route path="/naudojimo-gidas" element={<NaudojimoGidas />} />
//         <Route path="/kategorija/:slug" element={<GidoCategories />} />
//         <Route path="/straipsnis/:slug" element={<GidoArticle />} />

//         <Route path="/site-pro" element={<SitePro />} />
//         <Route path="/rivile" element={<Rivile />} />
//         <Route path="/agnum" element={<Agnum />} />
//         <Route path="/centas" element={<Centas />} />
//         <Route path="/apsa" element={<Apsa />} />
//         <Route path="/apskaita5" element={<Apskaita5 />} />
//         <Route path="/finvalda" element={<Finvalda />} />
//         <Route path="/debetas" element={<Debetas />} />
//         <Route path="/pragma" element={<Pragma />} />

//         <Route element={<InvLayout />}>
//           <Route path="/israsymas" element={<InvoiceListPage />} />
//           <Route path="/israsymas/nustatymai" element={<InvoiceSettingsPage />} />
//           <Route path="/israsymas/nauja" element={<InvoiceEditorPage />} />
//           <Route path="/israsymas/:id" element={<InvoiceEditorPage />} />
//           <Route path="/israsymas/serijos-numeracijos" element={<InvoiceSeriesPage />} />
//           <Route path="/israsymas/matavimo-vienetai" element={<MeasurementUnitsPage />} />
//           <Route path="/israsymas/klientai" element={<CounterpartiesPage />} />
//           <Route path="/israsymas/prekes-paslaugos" element={<ProductsPage />} />
//           <Route path="/israsymas/banko-israsai" element={<BankStatementsPage />} />
//         </Route>

//         <Route path="/suvestine" element={<PrivateRoute><UploadPage /></PrivateRoute>} />
//         <Route path="/prisijungti" element={<RedirectIfAuthenticated><Login /></RedirectIfAuthenticated>} />
//         <Route path="/registruotis" element={<RedirectIfAuthenticated><Register /></RedirectIfAuthenticated>} />
//         <Route path="/veiklos-zurnalas" element={<PrivateRoute><VeiklosZurnalasPage /></PrivateRoute>} />
//         <Route path="/oss-zurnalas" element={<PrivateRoute><OSSReportPage /></PrivateRoute>} />
//         <Route path="/papildyti" element={<Subscribe />} />
//         <Route path="/susisiekti" element={<Contact />} />
//         <Route path="/nustatymai" element={<PrivateRoute><NustatymaiPage /></PrivateRoute>} />
//         <Route path="/is-klientu" element={<PrivateRoute><IsKlientu /></PrivateRoute>} />
//         <Route path="/mokejimu-istorija" element={<PrivateRoute><MokejimuIstorija /></PrivateRoute>} />
//         <Route path="/priminti-slaptazodi" element={<PasswordReset />} />
//         <Route path="/buhalterine-apskaita" element={<BuhalterinenApskaita />} />
//         <Route path="/suma-zodziais" element={<SumaZodziais />} />
//         <Route path="/privatumo-politika" element={<Privacy />} />
//         <Route path="/naudojimo-taisykles" element={<Terms />} />
//         <Route path="/saskaitu-israsymas" element={<InvoiceGenerator />} />
//         <Route path="/admin-dashboard" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><AdminDashboard /></RequireSuperuser>} />
//         <Route path="/admin-visi-failai" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><AdminVisiFailai /></RequireSuperuser>} />
//         <Route path="/admin-suvestine" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><AdminSuvestine /></RequireSuperuser>} />
//         <Route path="/admin-klientai" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><AdminKlientai /></RequireSuperuser>} />
//         <Route path="/admin-israsytos-saskaitos" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><AdminIsrasytosSaskaitos /></RequireSuperuser>} />
//         <Route path="/admin-newsletter" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><NewsletterPage /></RequireSuperuser>} />

//         {/* <Route path="/sf/:uuid" element={<InvoicePublicPage />} /> */}
//         <Route path="*" element={<NotFound />} />
//       </Routes>
//       {!isPublicInvoice && <Footer />}
//       <CookieConsent />
//     </AuthProvider>
//   );
// }

// export default App;