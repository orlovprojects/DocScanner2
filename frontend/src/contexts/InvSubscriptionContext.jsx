import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { getInvSubscription } from "../api/endpoints";

const InvSubscriptionContext = createContext(null);

export const useInvSubscription = () => {
  const ctx = useContext(InvSubscriptionContext);
  if (!ctx) {
    throw new Error("useInvSubscription must be used within InvSubscriptionProvider");
  }
  return ctx;
};

export const InvSubscriptionProvider = ({ children }) => {
  const [invSub, setInvSub] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getInvSubscription();
      setInvSub(data);
    } catch (err) {
      console.error("Failed to fetch inv subscription:", err);
      setInvSub(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      refresh();
    }
  }, [refresh]);

  const isFeatureLocked = useCallback(
    (featureName) => {
      if (loading) return false;
      return !invSub?.features?.[featureName];
    },
    [loading, invSub]
  );

  return (
    <InvSubscriptionContext.Provider
      value={{
        invSub,
        loading,
        refresh,
        isFeatureLocked,
      }}
    >
      {children}
    </InvSubscriptionContext.Provider>
  );
};