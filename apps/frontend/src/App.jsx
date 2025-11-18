import { Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import NewCampaign from "./pages/NewCampaign.jsx";
import WarRoom from "./pages/WarRoom.jsx";
import PromoBuilder from "./pages/PromoBuilder.jsx";
import Spark from "./pages/Spark.jsx";
import TopNav from "./components/TopNav.jsx";

export default function App() {
  return (
    <>
      <TopNav />
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/campaigns/new" element={<NewCampaign />} />
        <Route path="/campaigns/:id/edit" element={<NewCampaign />} />
        <Route path="/campaigns/:id/war-room" element={<WarRoom />} />
        <Route path="/promo-builder" element={<PromoBuilder />} />
        <Route path="/spark" element={<Spark />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}
