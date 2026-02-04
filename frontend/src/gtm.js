let gtmInited = false;

export function initGTM(containerId) {
  if (typeof window === "undefined") return;

  // Debug: pomozhet srazu ponyat’, est li ID v sborke
  if (import.meta?.env?.DEV) {
    console.info("[GTM] init called, id:", containerId);
  }

  if (!containerId) return;
  if (gtmInited) return;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  const src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`;

  const already =
    document.querySelector(`script[src="${src}"]`) ||
    document.querySelector('script[src^="https://www.googletagmanager.com/gtm.js?id="]');

  if (!already) {
    const s = document.createElement("script");
    s.async = true;
    s.src = src;

    // Debug: osobo polezno, esli Network pustoj iz-za togo chto skript ne dobavlen
    if (import.meta?.env?.DEV) {
      s.onload = () => console.info("[GTM] loaded:", s.src);
      s.onerror = () => console.warn("[GTM] failed to load:", s.src);
    }

    document.head.appendChild(s);

    if (import.meta?.env?.DEV) {
      console.info("[GTM] script appended:", s.src);
    }
  }

  gtmInited = true;
}

export function gtmPush(event, params = {}) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });

  if (import.meta?.env?.DEV) {
    console.debug("[GTM] push:", event, params);
  }
}