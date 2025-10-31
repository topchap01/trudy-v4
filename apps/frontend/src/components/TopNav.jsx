import { Link, useParams } from "react-router-dom";

export default function TopNav() {
  const { id } = useParams() || {};
  return (
    <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b">
      <div className="max-w-6xl mx-auto px-4 h-11 flex items-center gap-3">
        <Link to="/dashboard" className="font-semibold tracking-tight">Trudy</Link>
        <div className="flex-1" />
        <Link to="/dashboard" className="text-sm underline">Dashboard</Link>
        <Link to="/campaigns/new" className="text-sm underline">New campaign</Link>
        {id ? (
          <Link to={`/campaigns/${id}/war-room`} className="text-sm underline">War Room</Link>
        ) : null}
      </div>
    </div>
  );
}
