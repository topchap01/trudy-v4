import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

const KNOWN_CLIENTS = [
  "Electrolux",
  "Vinarchy",
  "Gigacomm",
  "Australian Vintage",
];

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // --- Demo prefs (persisted) ---
  const [demoMode, setDemoMode] = useState(
    () => localStorage.getItem("demoMode") === "true"
  );
  const [clientFilter, setClientFilter] = useState(
    () => localStorage.getItem("demoClientName") || ""
  );

  async function load() {
    try {
      setLoading(true);
      setErr(null);
      const r = await fetch("/api/campaigns");
      if (!r.ok) throw new Error("Failed to fetch campaigns");
      const data = await r.json();
      const list = Array.isArray(data?.campaigns)
        ? data.campaigns
        : Array.isArray(data)
        ? data
        : [];
      setCampaigns(list);
    } catch (e) {
      setErr(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Persist demo prefs
  useEffect(() => {
    localStorage.setItem("demoMode", demoMode ? "true" : "false");
  }, [demoMode]);
  useEffect(() => {
    if (clientFilter) localStorage.setItem("demoClientName", clientFilter);
    else localStorage.removeItem("demoClientName");
  }, [clientFilter]);

  // Build client options from data + known list
  const clientOptions = useMemo(() => {
    const fromData = Array.from(
      new Set(
        campaigns
          .map((c) => (c.clientName || "").trim())
          .filter(Boolean)
      )
    );
    const union = Array.from(new Set([...KNOWN_CLIENTS, ...fromData])).sort(
      (a, b) => a.localeCompare(b)
    );
    return union;
  }, [campaigns]);

  // Apply filter when demo mode ON and client selected
  const visibleCampaigns = useMemo(() => {
    if (!demoMode || !clientFilter) return campaigns;
    const k = clientFilter.toLowerCase();
    return campaigns.filter(
      (c) => String(c.clientName || "").toLowerCase() === k
    );
  }, [campaigns, demoMode, clientFilter]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <Link
          to="/campaigns/new"
          className="inline-flex items-center rounded-md bg-sky-600 px-3 py-2 text-white hover:bg-sky-700"
        >
          + New Campaign
        </Link>
      </div>

      {/* Demo toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={demoMode}
            onChange={(e) => setDemoMode(e.target.checked)}
          />
          <span>Demo mode</span>
        </label>

        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          disabled={!demoMode}
          className="text-sm border rounded px-2 py-1 bg-white"
        >
          <option value="">All clients</option>
          {clientOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        {demoMode && clientFilter ? (
          <span className="text-xs text-gray-600">
            Showing campaigns for <strong>{clientFilter}</strong>
          </span>
        ) : null}
      </div>

      {err && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Couldn’t load campaigns ({err}).</p>
          <p className="mt-2 text-red-700">
            Make sure the backend is running (<code>pnpm -C apps/backend dev</code>) and then try again.
          </p>
          <button
            type="button"
            onClick={load}
            className="mt-3 inline-flex items-center rounded border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse text-gray-500">Loading…</div>
      ) : visibleCampaigns.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleCampaigns.map((c) => (
            <li key={c.id} className="border rounded-lg bg-white">
              <Link
                to={`/campaigns/${c.id}/war-room`}
                className="block p-4 hover:border-sky-300"
              >
                <div className="text-sm text-gray-500">
                  {c.clientName || "—"}
                </div>
                <div className="font-medium">{c.title}</div>
                <div className="mt-2 text-xs text-gray-600 flex flex-wrap gap-2">
                  <Pill>Mode: {c.mode ?? "—"}</Pill>
                  <Pill>{c.status ?? "—"}</Pill>
                  <Pill>Market: {c.market ?? "—"}</Pill>
                  {c.category ? <Pill>{c.category}</Pill> : null}
                </div>
                <div className="mt-3 text-sky-700 text-sm underline">
                  Open War Room →
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border bg-white p-8 text-center">
      <div className="text-gray-700">No campaigns yet.</div>
      <div className="mt-2">
        <Link
          to="/campaigns/new"
          className="inline-flex items-center rounded-md bg-sky-600 px-3 py-2 text-white hover:bg-sky-700"
        >
          Create your first campaign
        </Link>
      </div>
    </div>
  );
}

function Pill({ children }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-gray-700 border-gray-200 bg-white">
      {children}
    </span>
  );
}
