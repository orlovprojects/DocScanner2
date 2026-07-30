import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { api } from "../api/endpoints";
import { useAuth } from "./useAuth";

const CompanyProfileContext = createContext(null);

export const useCompanyProfiles = () => {
  const ctx = useContext(CompanyProfileContext);
  if (!ctx) {
    throw new Error(
      "useCompanyProfiles must be used within CompanyProfileProvider"
    );
  }
  return ctx;
};

export const CompanyProfileProvider = ({ children }) => {
  const { isAuthenticated, forceLogout } = useAuth();

  const [profiles, setProfiles] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [hasWaybillAccess, setHasWaybillAccess] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  // initialized = true tik po pirmo realaus /me/ užklausos (autentifikuotam),
  // kad gate'as nemirktelėtų redirect'u kol duomenys dar neužkrauti.
  const [initialized, setInitialized] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setProfiles([]);
      setActiveId(null);
      setHasWaybillAccess(false);
      setSubscriptionStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // /me/ atiduoda user'į + company_profiles + subscription_status vienu užklausimu
      const { data } = await api.get("/me/");
      setProfiles(data?.company_profiles || []);
      setActiveId(data?.active_company_profile_id ?? null);
      setHasWaybillAccess(!!data?.has_waybill_access);
      setSubscriptionStatus(data?.subscription_status ?? null);
    } catch (err) {
      // Mirusi sesija (po refresh interceptoriaus) → logout
      if (err?.response?.status === 401) {
        forceLogout();
      }
      setProfiles([]);
      setActiveId(null);
      setHasWaybillAccess(false);
      setSubscriptionStatus(null);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, [isAuthenticated, forceLogout]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Perjungimas iš toolbar'o: set-active serveryje + refetch
  const switchCompany = useCallback(
    async (id) => {
      await api.post(`/company-profiles/${id}/set-active/`);
      await refresh();
    },
    [refresh]
  );

  const value = {
    profiles,
    activeId,
    hasProfiles: profiles.length > 0,
    hasWaybillAccess,
    subscriptionStatus,
    loading,
    initialized,
    refresh,
    switchCompany,
  };

  return (
    <CompanyProfileContext.Provider value={value}>
      {children}
    </CompanyProfileContext.Provider>
  );
};

export default CompanyProfileProvider;