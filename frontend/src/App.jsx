import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom'; // Убираем лишний импорт `Router`
import Login from './pages/login';
import Subscribe from './pages/subscribe';
import Register from './pages/register';
import Footer from './page_elements/Footer';
import Contact from './pages/contact';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import AtlyginimoSkaiciuokle from './pages/AtlyginimoSkaiciuokle';
import AtlyginimoSkaiciuokle2026 from './pages/AtlyginimoSkaiciuokle2026';

import AuthProvider from './contexts/useAuth';
import PrivateRoute from './components/private_route';
import RedirectIfAuthenticated from './components/RedirectIfAuthenticated';

import Header from './page_elements/Header';
import { initializeAnalytics, logPageView } from './analytics';

import './styles/MainChart.css';

import UploadPage from './pages/UploadPage';
import NustatymaiPage from './pages/Nustatymai';
import Dokskenas from './pages/DokSkenas';


function App() {
    const location = useLocation();

    useEffect(() => {
        // Инициализация Google Analytics
        initializeAnalytics();
    }, []);

    useEffect(() => {
        // Логирование просмотра страницы при каждом изменении маршрута
        logPageView(location.pathname);
    }, [location]);

    return (
        <AuthProvider>
            <Header /> {/* Добавляем Header сюда */}
            <Routes>
                <Route path="/" element={<AtlyginimoSkaiciuokle />} />
                <Route path="/2026" element={<AtlyginimoSkaiciuokle2026 />} />
                <Route path="/saskaitu-skaitmenizavimas-dokskenas" element={<Dokskenas />} />
                <Route path="/suvestine" element={<PrivateRoute><UploadPage /></PrivateRoute>} />
                <Route path="/prisijungti" element={<RedirectIfAuthenticated><Login /></RedirectIfAuthenticated>} />
                <Route path="/registruotis" element={<RedirectIfAuthenticated><Register /></RedirectIfAuthenticated>} />
                <Route path="/papildyti" element={<Subscribe />} />
                <Route path="/susisiekti" element={<Contact />} />
                <Route path="/nustatymai" element={<PrivateRoute><NustatymaiPage /></PrivateRoute>} />
                <Route path="/privatumo-politika" element={<Privacy />} />
                <Route path="/naudojimo-taisykles" element={<Terms />} />
            </Routes>
            <Footer />
        </AuthProvider>
    );
}

export default App;