import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [me, setMe] = useState(undefined); // undefined = kraunama, null = neprisijungęs

  const refresh = useCallback(async () => {
    try { setMe((await api.get("me/")).data); } catch { setMe(null); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = async () => {
    try { await api.post("auth/logout/"); } finally { setMe(null); }
  };

  return <AuthCtx.Provider value={{ me, setMe, refresh, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
