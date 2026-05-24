let gtmInited = false;

const COOKIE_NAME = "cookie_consent";

/**
 * Читает consent cookie → { analytics: bool, marketing: bool } | null
 */
export function getConsentCookie() {
  const match = document.cookie.match(/(?:^|;\s*)cookie_consent=([^;]+)/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

/**
 * Сохраняет consent cookie на 365 дней
 */
export function setConsentCookie(value) {
  const d = new Date();
  d.setTime(d.getTime() + 365 * 86400000);
  const encoded = encodeURIComponent(JSON.stringify(value));
  document.cookie = `${COOKIE_NAME}=${encoded};expires=${d.toUTCString()};path=/;SameSite=Lax`;
}

/**
 * Пушит consent update в dataLayer (вызывается из CookieConsent.jsx)
 */
export function updateConsent(consent) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];

  const analyticsStatus = consent.analytics ? "granted" : "denied";
  const marketingStatus = consent.marketing ? "granted" : "denied";

  window.dataLayer.push("consent", "update", {
    analytics_storage: analyticsStatus,
    ad_storage: marketingStatus,
    ad_user_data: marketingStatus,
    ad_personalization: marketingStatus,
  });
}

export function initGTM(containerId) {
  if (typeof window === "undefined") return;
  if (!containerId) return;
  if (gtmInited) return;

  window.dataLayer = window.dataLayer || [];

  // ── Consent Mode v2: default BEFORE gtm.js loads ──
  const saved = getConsentCookie();
  const analyticsStatus = saved?.analytics ? "granted" : "denied";
  const marketingStatus = saved?.marketing ? "granted" : "denied";

  window.dataLayer.push("consent", "default", {
    ad_storage: marketingStatus,
    ad_user_data: marketingStatus,
    ad_personalization: marketingStatus,
    analytics_storage: analyticsStatus,
    functionality_storage: "granted",
    security_storage: "granted",
    wait_for_update: saved ? 0 : 500,
  });

  // ── GTM init ──
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  const src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(
    containerId
  )}`;

  const already =
    document.querySelector(`script[src="${src}"]`) ||
    document.querySelector(
      'script[src^="https://www.googletagmanager.com/gtm.js?id="]'
    );

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


// let gtmInited = false;

// export function initGTM(containerId) {
//   if (typeof window === "undefined") return;
//   if (!containerId) return;
//   if (gtmInited) return;

//   window.dataLayer = window.dataLayer || [];
//   window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

//   const src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(
//     containerId
//   )}`;

//   const already =
//     document.querySelector(`script[src="${src}"]`) ||
//     document.querySelector(
//       'script[src^="https://www.googletagmanager.com/gtm.js?id="]'
//     );

//   if (!already) {
//     const s = document.createElement("script");
//     s.async = true;
//     s.src = src;
//     document.head.appendChild(s);
//   }

//   gtmInited = true;
// }

// export function gtmPush(event, params = {}) {
//   if (typeof window === "undefined") return;
//   window.dataLayer = window.dataLayer || [];
//   window.dataLayer.push({ event, ...params });
// }