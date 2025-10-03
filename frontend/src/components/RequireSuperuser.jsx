import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "../contexts/useAuth";
import { Navigate } from "react-router-dom";
import { Typography, CircularProgress, Box, Button } from "@mui/material";
import { api } from "../api/endpoints"; // ⚠️ используем твой axios-инстанс!

const SuperuserContext = createContext(null);
export const useSuperuser = () => useContext(SuperuserContext);

const RequireSuperuser = ({ children, loginPath = "/login", forbiddenPath = "/403" }) => {
  const { isAuthenticated, loading } = useAuth();

  const [checking, setChecking] = useState(false);
  const [isSuper, setIsSuper] = useState(null); // true/false/null
  const [error, setError] = useState(null);     // 'unauth' | 'forbidden' | 'notfound' | string | null

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!isAuthenticated) return;
      setChecking(true);
      setError(null);

      try {
        // дергаем твой защищённый эндпоинт — через axios-инстанс с базовым URL/интерсепторами
        const res = await api.get("/superuser/dashboard-stats/", { withCredentials: true });
        if (cancelled) return;

        // сохраним префетч, чтобы страница не делала повторный запрос
        sessionStorage.setItem("dashboardPrefetch", JSON.stringify({ data: res.data, ts: Date.now() }));
        setIsSuper(true);
      } catch (e) {
        if (cancelled) return;
        const status = e?.response?.status;

        if (status === 401) {
          setIsSuper(false);
          setError("unauth");
        } else if (status === 403) {
          setIsSuper(false);
          setError("forbidden");
        } else if (status === 404) {
          // это важно: 404 часто значит «маршрут не тащитcя до Django (proxy/baseURL)»
          setIsSuper(false);
          setError("notfound");
        } else {
          setIsSuper(false);
          setError(e?.message || "unknown_error");
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // 1) ждём auth
  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <CircularProgress sx={{ color: "#F5BE09" }} />
      </Box>
    );
  }

  // 2) незалогинен → логин
  if (!isAuthenticated) {
    return <Navigate to={loginPath} replace />;
  }

  // 3) проверяем роль
  if (checking || isSuper === null) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <CircularProgress sx={{ color: "#F5BE09" }} />
      </Box>
    );
  }

  // 4) нет прав / ошибки
  if (error === "forbidden") {
    // можно редиректить
    // return <Navigate to={forbiddenPath} replace />;
    return (
      <Box sx={{ maxWidth: 560, mx: "auto", mt: 10, p: 3, textAlign: "center" }}>
        <Typography variant="h5" gutterBottom>Доступ ограничен</Typography>
        <Typography color="text.secondary">Эта страница доступна только суперюзерам.</Typography>
      </Box>
    );
  }

  if (error === "unauth") {
    return <Navigate to={loginPath} replace />;
  }

  if (error === "notfound") {
    return (
      <Box sx={{ maxWidth: 640, mx: "auto", mt: 10, p: 3, textAlign: "center" }}>
        <Typography variant="h6" gutterBottom>Эндпоинт не найден (404)</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Проверь, что фронт бьётся в правильный URL (`/superuser/dashboard-stats/`) и что прокси/baseURL ведут на Django.
        </Typography>
        <Button variant="contained" onClick={() => window.location.reload()}>Повторить</Button>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ maxWidth: 560, mx: "auto", mt: 10, p: 3, textAlign: "center" }}>
        <Typography variant="h6" color="error" gutterBottom>Ошибка проверки прав</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>{String(error)}</Typography>
        <Button variant="contained" onClick={() => window.location.reload()}>Повторить</Button>
      </Box>
    );
  }

  // 5) ок — пропускаем дальше
  let prefetch = null;
  try { prefetch = JSON.parse(sessionStorage.getItem("dashboardPrefetch") || "null"); } catch {}
  return (
    <SuperuserContext.Provider value={{ isSuperuser: true, prefetch }}>
      {children}
    </SuperuserContext.Provider>
  );
};

export default RequireSuperuser;

