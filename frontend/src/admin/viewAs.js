import { useEffect, useState } from "react";
import { api } from "../api/endpoints";
import { useAuth } from "../contexts/useAuth";

// „Žiūrėti kaip“: saugoma sessionStorage - kiekviena naršyklės kortelė atskirai
// (vienoje - savo paskyra, kitoje - kliento).
const KEY = "dokskenas_view_as";

export const getViewAs = () => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
};

const save = (v) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
};

// v: { userId, email, companyId, companyName }
export const startViewAs = (v, path = "/darbo-uzmokestis") => {
  save({ ...v, write: false });
  window.location.assign(path);          // pilnas perkrovimas - visi kontekstai iš naujo
};

export const setViewAsCompany = (companyId, companyName) => {
  const v = getViewAs();
  if (!v) return;
  save({ ...v, companyId, companyName });
  window.location.reload();
};

export const setViewAsWrite = (write) => {
  const v = getViewAs();
  if (!v) return;
  save({ ...v, write: !!write });
};

// atsijungiant - kad kitas prisijungimas šioje kortelėje neprasidėtų „Žiūrėti kaip“ režimu
export const clearViewAs = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};

export const stopViewAs = (path = "/admin/du") => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.location.assign(path);
};

const ADMIN_URL = /(^|\/)(admin|superuser)[/_-]/i;

// Pridėti prie KIEKVIENO axios instance, kuriuo kviečiamas API
const installed = new WeakSet();
export function installViewAs(instance = api) {
  if (!instance || installed.has(instance)) return;
  installed.add(instance);
  instance.interceptors.request.use((cfg) => {
    const v = getViewAs();
    // admin / superuser API - visada tikru vartotoju (kitaip admin puslapiai peržiūros metu gautų 403)
    if (v?.userId && !ADMIN_URL.test(String(cfg.url || ""))) {
      cfg.headers = cfg.headers || {};
      cfg.headers["X-View-As-User"] = String(v.userId);
      if (v.companyId) cfg.headers["X-View-As-Company"] = String(v.companyId);
      if (v.write) cfg.headers["X-View-As-Write"] = "1";
    }
    return cfg;
  });
}

// Tikras prisijungęs vartotojas (ir „Žiūrėti kaip“ metu).
// Be bendro podėlio: šoninė juosta atsijungus išnyksta, prisijungus sukuriama iš naujo ir paklausia vėl.
export function useAdminWhoami() {
  const { isAuthenticated } = useAuth() || {};
  const [me, setMe] = useState(null);
  useEffect(() => {
    let alive = true;
    setMe(null);
    if (!isAuthenticated) return undefined;
    api.get("/admin/du/whoami/")
      .then((r) => alive && setMe(r.data))
      .catch(() => alive && setMe({ is_superuser: false }));
    return () => {
      alive = false;
    };
  }, [isAuthenticated]);
  return me;
}
