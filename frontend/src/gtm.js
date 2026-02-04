let gtmInited = false;

export function initGTM(containerId) {
  if (typeof window === "undefined") return;

  // VSEGDА vidno v konsoli, dazhe v production:
  if (!window.__gtm_debug_logged) {
    console.log("[GTM] initGTM called, id =", containerId);
    window.__gtm_debug_logged = true;
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

    s.onload = () => console.log("[GTM] loaded", s.src);
    s.onerror = () => console.log("[GTM] failed", s.src);

    document.head.appendChild(s);
    console.log("[GTM] appended", s.src);
  } else {
    console.log("[GTM] script already present");
  }

  gtmInited = true;
}