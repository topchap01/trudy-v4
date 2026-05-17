import { Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import ShelfBrief from "./pages/ShelfBrief.jsx";
import ShelfRoutes from "./pages/ShelfRoutes.jsx";
import ShelfStressTest from "./pages/ShelfStressTest.jsx";
import ShelfHistory from "./pages/ShelfHistory.jsx";
import TopNav from "./components/TopNav.jsx";
import { Toaster } from "./components/ui/toaster.jsx";
import CommandPalette from "./components/CommandPalette.jsx";

export default function App() {
  return (
    <>
      <TopNav />
      <main id="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/shelf" replace />} />
          <Route path="/shelf" element={<ShelfBrief />} />
          <Route path="/shelf/history" element={<ShelfHistory />} />
          <Route path="/shelf/:campaignId/routes" element={<ShelfRoutes />} />
          <Route path="/shelf/:campaignId/stress-test" element={<ShelfStressTest />} />
          <Route path="/dashboard" element={<Dashboard />} />
          {/* Legacy routes redirect to Shelf */}
          <Route path="/campaigns/:id/war-room" element={<Navigate to="/shelf" replace />} />
          <Route path="/campaigns/new" element={<Navigate to="/shelf" replace />} />
          <Route path="/campaigns/:id/edit" element={<Navigate to="/shelf" replace />} />
          <Route path="/promo-builder" element={<Navigate to="/shelf" replace />} />
          <Route path="/spark" element={<Navigate to="/shelf" replace />} />
          <Route path="*" element={<Navigate to="/shelf" replace />} />
        </Routes>
      </main>
      <Toaster />
      <CommandPalette />
    </>
  );
}
