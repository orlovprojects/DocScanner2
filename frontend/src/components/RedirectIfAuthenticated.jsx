import { useAuth } from "../contexts/useAuth";
import { Navigate } from "react-router-dom";

const RedirectIfAuthenticated = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  // Пока идет проверка — ничего не рендерим
  if (loading) return null;

  if (isAuthenticated) {
    return <Navigate to="/suvestine" replace />;
  }
  return children;
};

export default RedirectIfAuthenticated;