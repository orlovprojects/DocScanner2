import axios from "axios";

// Tas pats domenas (esavitarna.lt) - slapukas esv_session siunčiamas automatiškai.
export const api = axios.create({
  baseURL: "/api/savitarna/",
  headers: { "X-Requested-With": "esavitarna" },
});

export const apiError = (e) => {
  const d = e?.response?.data;
  if (!d) return "Nepavyko susisiekti su serveriu. Patikrinkite internetą.";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.join(" ");
  if (d.detail) return d.detail;
  return Object.values(d).map((v) => (Array.isArray(v) ? v.join(" ") : typeof v === "object" ? JSON.stringify(v) : String(v))).join(" ");
};

export const days = (v) => `${Number(v).toLocaleString("lt-LT", { maximumFractionDigits: 1 })} d.`;
