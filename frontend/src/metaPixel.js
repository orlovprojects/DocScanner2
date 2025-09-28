// /src/metaPixel.js

let readyResolver = null;

/**
 * Промис, который резолвится, когда fbq готов:
 *  - скрипт fbevents.js загружен
 *  - вызван fbq('init', PIXEL_ID)
 */
export const fbqReady = new Promise((resolve) => {
  readyResolver = resolve;
});

function markReady() {
  try {
    readyResolver && readyResolver();
  } catch {}
}

/** Локальный буфер событий, если fbq ещё не готов */
function getBuffer() {
  if (typeof window === "undefined") return [];
  if (!window.__fbq_buffer) window.__fbq_buffer = [];
  return window.__fbq_buffer;
}

/** Слить буфер в fbq, когда он станет готов */
function flushBuffer() {
  const buf = getBuffer();
  if (!buf.length || !window.fbq) return;
  for (const { type, name, params } of buf.splice(0, buf.length)) {
    try {
      if (type === "track") window.fbq("track", name, params || {});
      else if (type === "trackCustom") window.fbq("trackCustom", name, params || {});
    } catch {}
  }
  if (import.meta.env.DEV) console.debug("[MetaPixel] buffer flushed");
}

/**
 * Явное ожидание готовности fbq, с таймаутом (по умолчанию 3000 мс).
 * Если таймаут — не бросаем событие, а положим в буфер (см. track()).
 */
export async function ensureFbqReady(timeoutMs = 3000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("fbq timeout")), timeoutMs);
  });
  try {
    await Promise.race([fbqReady, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Инициализация Meta Pixel. Вставляет скрипт при необходимости и вызывает fbq('init', id).
 * Повторные вызовы безопасны — защита от дублей по флагу window.__fbq_initialized.
 */
export function initMetaPixel(pixelId, options = {}) {
  if (typeof window === "undefined") return;
  if (window.__fbq_initialized) return;

  // Если скрипт ещё не вставлен — вставим
  const existing = document.querySelector(
    'script[src*="connect.facebook.net/en_US/fbevents.js"]'
  );
  if (!existing) {
    (function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod
          ? n.callMethod.apply(n, arguments)
          : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = false; // отметим, что файл ещё не загружен
      n.version = "2.0";
      n.queue = [];
      t = b.createElement(e);
      t.async = true;
      t.src = "https://connect.facebook.net/en_US/fbevents.js";
      t.onload = () => {
        try {
          f.fbq.loaded = true;
        } catch {}
        // если init уже был — считаем готовым и сливаем буфер
        if (f.__fbq_initialized) {
          markReady();
          flushBuffer();
        }
      };
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, "script");
  }

  if (!pixelId) {
    if (import.meta.env.DEV) console.warn("[MetaPixel] VITE_META_PIXEL_ID пуст");
    return;
  }

  // init можно вызывать сразу — shim fbq уже есть
  try {
    window.fbq("init", pixelId, options);
  } catch (e) {
    if (import.meta.env.DEV) console.warn("[MetaPixel] init error:", e);
  }

  window.__fbq_initialized = true;

  // Если файл уже подгружен к этому моменту — fbq готов, можно слить буфер
  if (window.fbq && window.fbq.loaded) {
    markReady();
    flushBuffer();
  }
}

/** Track стандартного события. Если fbq не готов — кладём в буфер. */
export function track(event, params = {}) {
  if (typeof window === "undefined") return;
  if (window.fbq) {
    try {
      window.fbq("track", event, params);
      return;
    } catch {}
  }
  getBuffer().push({ type: "track", name: event, params });
  if (import.meta.env.DEV) console.debug("[MetaPixel] queued:", event, params);
}

/** Track кастомного события. Если fbq не готов — кладём в буфер. */
export function trackCustom(name, params = {}) {
  if (typeof window === "undefined") return;
  if (window.fbq) {
    try {
      window.fbq("trackCustom", name, params);
      return;
    } catch {}
  }
  getBuffer().push({ type: "trackCustom", name, params });
  if (import.meta.env.DEV) console.debug("[MetaPixel] queued custom:", name, params);
}




// // /src/metaPixel.js
// export function initMetaPixel(pixelId, options = {}) {
//   if (typeof window === "undefined") return;

//   // ✅ защита от повторной инициализации (StrictMode/HMR)
//   if (window.__fbq_initialized) return;

//   (function (f, b, e, v, n, t, s) {
//     if (f.fbq) return;
//     n = f.fbq = function () {
//       n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
//     };
//     if (!f._fbq) f._fbq = n;
//     n.push = n;
//     n.loaded = true;
//     n.version = "2.0";
//     n.queue = [];
//     t = b.createElement(e);
//     t.async = true;
//     t.src = "https://connect.facebook.net/en_US/fbevents.js";
//     s = b.getElementsByTagName(e)[0];
//     s.parentNode.insertBefore(t, s);
//   })(window, document, "script");

//   if (!pixelId) {
//     if (import.meta.env.DEV) {
//       console.warn("[MetaPixel] pixelId пуст. Проверь VITE_META_PIXEL_ID");
//     }
//     return;
//   }

//   window.fbq("init", pixelId, options);

//   // ❌ больше НЕ вызываем тут PageView — им займётся App.jsx
//   window.__fbq_initialized = true;
// }

// export function track(event, params = {}) {
//   if (typeof window === "undefined" || !window.fbq) return;
//   window.fbq("track", event, params);
// }

// export function trackCustom(event, params = {}) {
//   if (typeof window === "undefined" || !window.fbq) return;
//   window.fbq("trackCustom", event, params);
// }
