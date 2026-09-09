export const notificationText = value => String(value ?? "").trim().replace(/[.\u2026]+$/u, "");

export const documentErrors = doc => {
  if (!doc) return [];
  const errors = [...new Set((doc.warnings || []).filter(Boolean).map(notificationText))];
  return errors.length || doc.epris_status === "tinkama" ? errors : ["Sąskaita neparuošta eksportui. Patikrinkite jos duomenis ir kategoriją"];
};
