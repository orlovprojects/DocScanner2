export const initializeAnalytics = () => {
  // GTM уже загружает GA4 (G-3KP26W92TR)
};

export const logPageView = (path) => {
  if (typeof window === 'undefined' || !window.dataLayer) return;
  window.dataLayer.push({ event: 'page_view', page_path: path });
};



// import ReactGA from 'react-ga4';

// // Инициализация Google Analytics с Measurement ID
// export const initializeAnalytics = () => {
//     ReactGA.initialize('G-3KP26W92TR'); // Замените на ваш Measurement ID
// };

// // Отслеживание переходов на страницы
// export const logPageView = (path) => {
//     ReactGA.send({ hitType: "pageview", page: path });
// };