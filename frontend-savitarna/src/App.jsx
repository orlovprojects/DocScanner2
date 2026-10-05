import { Box, CircularProgress } from "@mui/material";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useAuth } from "./auth";
import Layout from "./components/Layout";
import Anketa from "./pages/Anketa";
import ForgotPassword from "./pages/ForgotPassword";
import Grafikas from "./pages/Grafikas";
import Home from "./pages/Home";
import Invite from "./pages/Invite";
import Login from "./pages/Login";
import OtherRequests from "./pages/OtherRequests";
import PayslipDetail from "./pages/PayslipDetail";
import Payslips from "./pages/Payslips";
import RequestForm from "./pages/RequestForm";
import ResetPassword from "./pages/ResetPassword";
import SelectCompany from "./pages/SelectCompany";
import Soon from "./pages/Soon";

function Private({ children }) {
  const { me } = useAuth();
  const loc = useLocation();
  if (me === undefined) return <Box sx={{ display: "grid", placeItems: "center", minHeight: "60vh" }}><CircularProgress /></Box>;
  if (!me) return <Navigate to="/prisijungti" replace state={{ from: loc.pathname }} />;
  if (!me.employee && loc.pathname !== "/imone") return <Navigate to="/imone" replace />;
  if (me.employee?.data_status === "awaiting_employee" && loc.pathname !== "/anketa") return <Navigate to="/anketa" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/prisijungti" element={<Login />} />
      <Route path="/pakvietimas/:token" element={<Invite />} />
      <Route path="/pamirsau" element={<ForgotPassword />} />
      <Route path="/slaptazodis/:token" element={<ResetPassword />} />
      <Route path="/imone" element={<Private><SelectCompany /></Private>} />
      <Route path="/anketa" element={<Private><Anketa /></Private>} />
      <Route path="/netrukus" element={<Private><Soon /></Private>} />
      <Route path="/prasymas/:kind" element={<Private><RequestForm /></Private>} />
      <Route path="/kiti-prasymai" element={<Private><OtherRequests /></Private>} />
      <Route path="/algalapiai" element={<Private><Payslips /></Private>} />
      <Route path="/grafikas" element={<Private><Grafikas /></Private>} />
      <Route path="/algalapiai/:run" element={<Private><PayslipDetail /></Private>} />
      <Route path="/" element={<Private><Home /></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
