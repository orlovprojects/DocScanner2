import ReactGA from 'react-ga4';

// Инициализация Google Analytics с Measurement ID
export const initializeAnalytics = () => {
    ReactGA.initialize('G-2XWY6PQKG8'); // Замените на ваш Measurement ID
};

// Отслеживание переходов на страницы
export const logPageView = (path) => {
    ReactGA.send({ hitType: "pageview", page: path });
};