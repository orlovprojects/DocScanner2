import { useEffect, lazy, Suspense } from 'react';
import { Route, Routes, useLocation, Navigate } from 'react-router-dom';

// ─── Eager: layout shell (всегда нужны сразу) ───
import AuthProvider from './contexts/useAuth';
import { CompanyProfileProvider } from "./contexts/useCompanyProfiles";
import { useCompanyProfiles } from "./contexts/useCompanyProfiles";
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

import { useMediaQuery } from "@mui/material";
import Box from "@mui/material/Box";
import SidebarRail from "./components/SidebarRail";
import { useAuth } from "./contexts/useAuth";
import { useState } from "react";
import { api } from "./api/endpoints";
import AddCompanyProfileDialog from "./components/AddCompanyProfileDialog";

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

const OnboardingCompanyProfiles = lazy(() => import('./pages/OnboardingCompanyProfiles'));
const InvoiceSettingsPage = lazy(() => import('./pages/InvoiceSettingsPage'));
const InvoiceListPage = lazy(() => import('./pages/InvoiceListPage'));
const InvoiceEditorPage = lazy(() => import('./pages/InvoiceEditorPage'));
const InvoiceSeriesPage = lazy(() => import('./pages/InvoiceSeriesPage'));
const MeasurementUnitsPage = lazy(() => import('./pages/MeasurementUnitsPage'));
const CounterpartiesPage = lazy(() => import('./pages/CounterpartiesPage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const BankStatementsPage = lazy(() => import('./pages/BankStatementsPage'));
const BankOperationsPage = lazy(() => import('./pages/BankOperationsPage'));
const BankMatchingDebugPage = lazy(() => import('./pages/BankMatchingDebugPage'));
const InvoicePublicPage = lazy(() => import('./pages/InvoicePublicPage'));
const VeiklosZurnalasPage = lazy(() => import('./pages/VeiklosZurnalasPage'));
const OSSReportPage = lazy(() => import('./pages/Ossreportpage'));
const SVSReportPage = lazy(() => import('./pages/SVSReportPage'));
const PurchasesPage = lazy(() => import('./pages/PurchasesPage'));
const ApskaitosCentrasPage = lazy(() => import('./pages/ApskaitosCentrasPage'));

// ─── Sidebar - Toolbar ───
function SidebarRailWrapper() {
  const { isAuthenticated } = useAuth();
  const isMobile = useMediaQuery("(max-width:600px)");
  const {
    profiles,
    activeId,
    hasWaybillAccess,
    switchCompany,
    refresh,
  } = useCompanyProfiles();
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  if (!isAuthenticated || isMobile) return null;

  return (
    <>
      <SidebarRail
        hasWaybillAccess={hasWaybillAccess}
        companyProfiles={profiles}
        activeCompanyProfileId={activeId}
        onSwitchCompany={(id) => switchCompany(id)}
        onAddCompany={() => setAddDialogOpen(true)}
        onDeleteCompany={(id) => {
          if (window.confirm("Ar tikrai norite pašalinti šį profilį?")) {
            api.delete(`/company-profiles/${id}/`).then(() => refresh());
          }
        }}
      />
      <AddCompanyProfileDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onCreated={(data) => {
          if (data?.id) {
            switchCompany(data.id);   // set-active + refresh контекста
          } else {
            refresh();
          }
        }}
      />
    </>
  );
}

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
      <CompanyProfileProvider>
        <ScrollToTop />
        <Header />
        <Box sx={{ display: "flex", minHeight: "calc(100vh - 64px)" }}>
          <SidebarRailWrapper />
          <Box sx={{ flex: 1, minWidth: 0 }}>
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
                  <Route path="/bank" element={<BankOperationsPage />} />
                  <Route path="/susiejimo-diagnostika" element={<BankMatchingDebugPage />} />
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

                <Route path="/pirkimai" element={<PrivateRoute><PurchasesPage /></PrivateRoute>} />
                <Route path="/apskaitos-centras" element={<PrivateRoute><ApskaitosCentrasPage /></PrivateRoute>} />
                <Route path="/profiliai" element={<PrivateRoute><OnboardingCompanyProfiles /></PrivateRoute>} />


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
          </Box>
        </Box>
        <Footer />
        <CookieConsent />
      </CompanyProfileProvider>
    </AuthProvider>
  );
}

export default App;



// import { useEffect, lazy, Suspense } from 'react';
// import { Route, Routes, useLocation, Navigate, useNavigate } from 'react-router-dom';

// // ─── Eager: layout shell (всегда нужны сразу) ───
// import AuthProvider from './contexts/useAuth';
// import { CompanyProfileProvider } from "./contexts/useCompanyProfiles";
// import { useCompanyProfiles } from "./contexts/useCompanyProfiles";
// import Header from './page_elements/Header';
// import Footer from './page_elements/Footer';
// import ScrollToTop from './page_elements/ScrollToTop';
// import PrivateRoute from './components/private_route';
// import RedirectIfAuthenticated from './components/RedirectIfAuthenticated';
// import RequireSuperuser from "./components/RequireSuperuser";
// import CookieConsent from './components/CookieConsent';
// import CircularProgress from '@mui/material/CircularProgress';
// import { initializeAnalytics, logPageView } from './analytics';
// import { initMetaPixel } from './metaPixel';
// import { initGTM } from "./gtm";
// import './styles/MainChart.css';

// import { useMediaQuery } from "@mui/material";
// import Box from "@mui/material/Box";
// import SidebarRail from "./components/SidebarRail";
// import { useAuth } from "./contexts/useAuth";
// import { useState } from "react";
// import { api } from "./api/endpoints";
// import AddCompanyProfileDialog from "./components/AddCompanyProfileDialog";

// // ─── Lazy: все страницы ───
// const InvLayout = lazy(() => import('./components/InvLayout'));

// const Login = lazy(() => import('./pages/login'));
// const Subscribe = lazy(() => import('./pages/subscribe'));
// const Register = lazy(() => import('./pages/register'));
// const PasswordReset = lazy(() => import('./pages/PasswordReset'));
// const Contact = lazy(() => import('./pages/contact'));
// const Terms = lazy(() => import('./pages/Terms'));
// const Privacy = lazy(() => import('./pages/Privacy'));
// const AtlyginimoSkaiciuokle2025 = lazy(() => import('./pages/AtlyginimoSkaiciuokle2025'));
// const AtlyginimoSkaiciuokle2026 = lazy(() => import('./pages/AtlyginimoSkaiciuokle2026'));
// const IndividualiosVeiklosSkaiciuokle2026 = lazy(() => import('./pages/IndividualiosVeiklosSkaiciuokle2026'));
// const MBSkaiciuokle = lazy(() => import('./pages/MBSkaiciuokle'));
// const InvoiceGenerator = lazy(() => import('./pages/InvoiceGenerator'));
// const BuhalterinenApskaita = lazy(() => import('./pages/BuhalterineApskaita'));
// const SumaZodziais = lazy(() => import('./pages/SumaZodziais'));
// const AboutUs = lazy(() => import('./pages/ApieMus'));

// const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
// const AdminSuvestine = lazy(() => import("./pages/AdminSuvestine"));
// const AdminVisiFailai = lazy(() => import("./pages/AdminVisiFailai"));
// const AdminVaztarasciai = lazy(() => import("./pages/AdminVaztarasciai"));
// const AdminKlientai = lazy(() => import("./pages/AdminKlientai"));
// const AdminIsrasytosSaskaitos = lazy(() => import('./pages/AdminIsrasytosSaskaitos'));
// const NewsletterPage = lazy(() => import('./pages/NewsletterPage'));

// const NaudojimoGidas = lazy(() => import('./pages/NaudojimoGidas'));
// const GidoCategories = lazy(() => import('./pages/GidoCategories'));
// const GidoArticle = lazy(() => import('./pages/GidoArticle'));

// const UploadPage = lazy(() => import('./pages/UploadPage'));
// const WaybillsPage = lazy(() => import('./pages/WaybillsPage'));
// const NustatymaiPage = lazy(() => import('./pages/Nustatymai'));
// const IsKlientu = lazy(() => import('./pages/IsKlientu'));
// const Dokskenas = lazy(() => import('./pages/DokSkenas'));
// const PvmCalculator = lazy(() => import('./pages/PVMskaiciuokle'));
// const GpmSkaiciuokle = lazy(() => import('./pages/GPMskaiciuokle'));

// const MokejimuIstorija = lazy(() => import('./pages/MokejimuIstorija'));
// const NotFound = lazy(() => import('./pages/NotFound'));

// const SitePro = lazy(() => import('./LPs/site_pro'));
// const Rivile = lazy(() => import('./LPs/rivile'));
// const Agnum = lazy(() => import('./LPs/agnum'));
// const Centas = lazy(() => import('./LPs/centas'));
// const Apsa = lazy(() => import('./LPs/apsa'));
// const Apskaita5 = lazy(() => import('./LPs/apskaita5'));
// const Finvalda = lazy(() => import('./LPs/finvalda'));
// const Debetas = lazy(() => import('./LPs/debetas'));
// const Pragma = lazy(() => import('./LPs/pragma'));

// const OnboardingCompanyProfiles = lazy(() => import('./pages/OnboardingCompanyProfiles'));
// const InvoiceSettingsPage = lazy(() => import('./pages/InvoiceSettingsPage'));
// const InvoiceListPage = lazy(() => import('./pages/InvoiceListPage'));
// const InvoiceEditorPage = lazy(() => import('./pages/InvoiceEditorPage'));
// const InvoiceSeriesPage = lazy(() => import('./pages/InvoiceSeriesPage'));
// const MeasurementUnitsPage = lazy(() => import('./pages/MeasurementUnitsPage'));
// const CounterpartiesPage = lazy(() => import('./pages/CounterpartiesPage'));
// const ProductsPage = lazy(() => import('./pages/ProductsPage'));
// const BankStatementsPage = lazy(() => import('./pages/BankStatementsPage'));
// const BankOperationsPage = lazy(() => import('./pages/BankOperationsPage'));
// const BankMatchingDebugPage = lazy(() => import('./pages/BankMatchingDebugPage'));
// const InvoicePublicPage = lazy(() => import('./pages/InvoicePublicPage'));
// const VeiklosZurnalasPage = lazy(() => import('./pages/VeiklosZurnalasPage'));
// const OSSReportPage = lazy(() => import('./pages/Ossreportpage'));
// const SVSReportPage = lazy(() => import('./pages/SVSReportPage'));
// const PurchasesPage = lazy(() => import('./pages/PurchasesPage'));
// const ApskaitosCentrasPage = lazy(() => import('./pages/ApskaitosCentrasPage'));

// // ─── Sidebar - Toolbar ───
// function SidebarRailWrapper() {
//   const { isAuthenticated } = useAuth();
//   const isMobile = useMediaQuery("(max-width:600px)");
//   const nav = useNavigate();

//   const [hasWaybillAccess, setHasWaybillAccess] = useState(false);
//   const [companyProfiles, setCompanyProfiles] = useState([]);
//   const [activeCompanyProfileId, setActiveCompanyProfileId] = useState(null);
//   const [addDialogOpen, setAddDialogOpen] = useState(false);

//   const fetchProfile = () => {
//     if (!isAuthenticated) return;
//     api.get("/me/", { withCredentials: true })
//       .then(({ data }) => {
//         setHasWaybillAccess(!!data?.has_waybill_access);
//         setCompanyProfiles(data?.company_profiles || []);
//         setActiveCompanyProfileId(data?.active_company_profile_id);
//       })
//       .catch(() => {});
//   };

//   useEffect(() => {
//     fetchProfile();
//   }, [isAuthenticated]);

//   if (!isAuthenticated || isMobile) return null;

//   return (
//     <>
//       <SidebarRail
//         hasWaybillAccess={hasWaybillAccess}
//         companyProfiles={companyProfiles}
//         activeCompanyProfileId={activeCompanyProfileId}
//         onSwitchCompany={(id) => {
//           api.post(`/company-profiles/${id}/set-active/`).then(() => fetchProfile());
//         }}
//         onAddCompany={() => setAddDialogOpen(true)}
//         onDeleteCompany={(id) => {
//           if (window.confirm("Ar tikrai norite pašalinti šį profilį?")) {
//             api.delete(`/company-profiles/${id}/`).then(() => fetchProfile());
//           }
//         }}
//       />
//       <AddCompanyProfileDialog
//         open={addDialogOpen}
//         onClose={() => setAddDialogOpen(false)}
//         onCreated={() => fetchProfile()}
//       />
//     </>
//   );
// }

// // ─── Loader для Suspense ───
// function PageLoader() {
//   return (
//     <div style={{
//       display: 'flex',
//       justifyContent: 'center',
//       alignItems: 'center',
//       minHeight: '60vh',
//     }}>
//       <CircularProgress size={40} />
//     </div>
//   );
// }

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
//         <Suspense fallback={<PageLoader />}>
//           <Routes>
//             <Route path="/sf/:uuid" element={<InvoicePublicPage />} />
//           </Routes>
//         </Suspense>
//       </>
//     );
//   }

//   return (
//     <AuthProvider>
//       <ScrollToTop />
//       <Header />
//       <Box sx={{ display: "flex", minHeight: "calc(100vh - 64px)" }}>
//         <SidebarRailWrapper />
//         <Box sx={{ flex: 1, minWidth: 0 }}>
//           <Suspense fallback={<PageLoader />}>
//             <Routes>
//               <Route path="/" element={<AtlyginimoSkaiciuokle2026 />} />
//               <Route path="/apie-mus" element={<AboutUs />} />
//               <Route path="/2025" element={<AtlyginimoSkaiciuokle2025 />} />
//               <Route path="/2026" element={<Navigate to="/" replace />} />
//               <Route path="/individualios-veiklos-skaiciuokle" element={<IndividualiosVeiklosSkaiciuokle2026 />} />
//               <Route path="/mazosios-bendrijos-skaiciuokle" element={<MBSkaiciuokle />} />
//               <Route path="/saskaitu-skaitmenizavimas-dokskenas" element={<Dokskenas />} />
//               <Route path="/pvm-skaiciuokle" element={<PvmCalculator />} />
//               <Route path="/gpm-skaiciuokle" element={<GpmSkaiciuokle />} />
//               <Route path="/naudojimo-gidas" element={<NaudojimoGidas />} />
//               <Route path="/kategorija/:slug" element={<GidoCategories />} />
//               <Route path="/straipsnis/:slug" element={<GidoArticle />} />

//               <Route path="/site-pro" element={<SitePro />} />
//               <Route path="/rivile" element={<Rivile />} />
//               <Route path="/agnum" element={<Agnum />} />
//               <Route path="/centas" element={<Centas />} />
//               <Route path="/apsa" element={<Apsa />} />
//               <Route path="/apskaita5" element={<Apskaita5 />} />
//               <Route path="/finvalda" element={<Finvalda />} />
//               <Route path="/debetas" element={<Debetas />} />
//               <Route path="/pragma" element={<Pragma />} />

//               <Route element={<InvLayout />}>
//                 <Route path="/israsymas" element={<InvoiceListPage />} />
//                 <Route path="/israsymas/nustatymai" element={<InvoiceSettingsPage />} />
//                 <Route path="/israsymas/nauja" element={<InvoiceEditorPage />} />
//                 <Route path="/israsymas/:id" element={<InvoiceEditorPage />} />
//                 <Route path="/israsymas/serijos-numeracijos" element={<InvoiceSeriesPage />} />
//                 <Route path="/israsymas/matavimo-vienetai" element={<MeasurementUnitsPage />} />
//                 <Route path="/israsymas/klientai" element={<CounterpartiesPage />} />
//                 <Route path="/israsymas/prekes-paslaugos" element={<ProductsPage />} />
//                 <Route path="/israsymas/banko-israsai" element={<BankStatementsPage />} />
//                 <Route path="/bank" element={<BankOperationsPage />} />
//                 <Route path="/susiejimo-diagnostika" element={<BankMatchingDebugPage />} />
//               </Route>

//               <Route path="/suvestine" element={<PrivateRoute><UploadPage /></PrivateRoute>} />
//               <Route path="/vaztarasciai" element={<PrivateRoute><WaybillsPage /></PrivateRoute>} />
//               <Route path="/prisijungti" element={<RedirectIfAuthenticated><Login /></RedirectIfAuthenticated>} />
//               <Route path="/registruotis" element={<RedirectIfAuthenticated><Register /></RedirectIfAuthenticated>} />
//               <Route path="/veiklos-zurnalas" element={<PrivateRoute><VeiklosZurnalasPage /></PrivateRoute>} />
//               <Route path="/oss-zurnalas" element={<PrivateRoute><OSSReportPage /></PrivateRoute>} />
//               <Route path="/svs-deklaravimas" element={<PrivateRoute><SVSReportPage /></PrivateRoute>} />
//               <Route path="/papildyti" element={<Subscribe />} />
//               <Route path="/susisiekti" element={<Contact />} />
//               <Route path="/nustatymai" element={<PrivateRoute><NustatymaiPage /></PrivateRoute>} />
//               <Route path="/is-klientu" element={<PrivateRoute><IsKlientu /></PrivateRoute>} />
//               <Route path="/mokejimu-istorija" element={<PrivateRoute><MokejimuIstorija /></PrivateRoute>} />

//               <Route path="/pirkimai" element={<PrivateRoute><PurchasesPage /></PrivateRoute>} />
//               <Route path="/apskaitos-centras" element={<PrivateRoute><ApskaitosCentrasPage /></PrivateRoute>} />
//               <Route path="/profiliai" element={<PrivateRoute><OnboardingCompanyProfiles /></PrivateRoute>} />


//               <Route path="/priminti-slaptazodi" element={<PasswordReset />} />
//               <Route path="/buhalterine-apskaita" element={<BuhalterinenApskaita />} />
//               <Route path="/suma-zodziais" element={<SumaZodziais />} />
//               <Route path="/privatumo-politika" element={<Privacy />} />
//               <Route path="/naudojimo-taisykles" element={<Terms />} />
//               <Route path="/saskaitu-israsymas" element={<InvoiceGenerator />} />
//               <Route path="/admin-dashboard" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><AdminDashboard /></RequireSuperuser>} />
//               <Route path="/admin-vaztarasciai" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><AdminVaztarasciai /></RequireSuperuser>} />
//               <Route path="/admin-visi-failai" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><AdminVisiFailai /></RequireSuperuser>} />
//               <Route path="/admin-suvestine" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><AdminSuvestine /></RequireSuperuser>} />
//               <Route path="/admin-klientai" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><AdminKlientai /></RequireSuperuser>} />
//               <Route path="/admin-israsytos-saskaitos" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><AdminIsrasytosSaskaitos /></RequireSuperuser>} />
//               <Route path="/admin-newsletter" element={<RequireSuperuser loginPath="/prisijungti" forbiddenPath="/403"><NewsletterPage /></RequireSuperuser>} />

//               <Route path="*" element={<NotFound />} />
//             </Routes>
//           </Suspense>
//         </Box>
//         </Box>
//       <Footer />
//       <CookieConsent />
//     </AuthProvider>
//   );
// }

// export default App;

