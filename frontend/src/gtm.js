let gtmInited = false;

export function initGTM(containerId) {
  if (typeof window === "undefined") return;
  if (!containerId) return;
  if (gtmInited) return;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  // gt m.js
  const src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`;
  const already = document.querySelector(`script[src="${src}"]`)
    || document.querySelector('script[src^="https://www.googletagmanager.com/gtm.js?id="]');

  if (!already) {
    const s = document.createElement("script");
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }

  gtmInited = true;
}

export function gtmPush(event, params = {}) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });
}