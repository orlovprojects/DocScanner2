import { Outlet } from "react-router-dom";
import PrivateRoute from "./private_route";
import { InvSubscriptionProvider } from "../contexts/InvSubscriptionContext";
import InvSubscriptionBanner from "../components/InvSubscriptionBanner";

const InvLayout = () => (
  <PrivateRoute>
    <InvSubscriptionProvider>
      <InvSubscriptionBanner />
      <Outlet />
    </InvSubscriptionProvider>
  </PrivateRoute>
);

export default InvLayout;