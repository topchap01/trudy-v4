// apps/frontend/src/components/ScoreboardSummary.jsx
import React from 'react'

function Pill({ status }) {
  const map = {
    GREEN: 'bg-green-600',
    AMBER: 'bg-amber-500',
    RED: 'bg-red-600',
    NA: 'bg-gray-400',
  }
  const cls = map[status] || map.NA
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${cls}`} aria-label={status || 'NA'} />
}

export default function ScoreboardSummary({ board }) {
  if (!board) {
    return (
      <section className="mt-6">
        <h3 className="text-lg font-semibold mb-2">Scoreboard Summary</h3>
        <div className="border rounded p-4 text-sm text-gray-700">
          No scoreboard data found on this evaluation.
        </div>
      </section>
    )
  }

  const rows = [
    ['objectiveFit', 'Objective fit'],
    ['hookStrength', 'Hook strength'],
    ['mechanicFit', 'Mechanic fit'],
    ['frequencyPotential', 'Frequency potential'],
    ['friction', 'Entry friction'],
    ['rewardShape', 'Reward shape & odds'],
    ['retailerReadiness', 'Retailer readiness'],
    ['complianceRisk', 'Compliance risk'],
    ['fulfilment', 'Prize fulfilment'],
    ['kpiRealism', 'KPI realism'],
  ]

  const showFix = (s) => s === 'AMBER' || s === 'RED'

  return (
    <section className="mt-6">
      <h3 className="text-lg font-semibold mb-2">Scoreboard Summary</h3>
      <div className="overflow-hidden rounded border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 w-56">Dimension</th>
              <th className="text-left p-2 w-20">Status</th>
              <th className="text-left p-2">Why</th>
              <th className="text-left p-2 w-[36%]">Fix (explicit)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([key, label]) => {
              const cell = board[key] || {}
              const status = String(cell.status || 'NA').toUpperCase()
              return (
                <tr key={key} className="border-t align-top">
                  <td className="p-2">{label}</td>
                  <td className="p-2">
                    <Pill status={status} />
                    <span className="ml-2 align-middle">{status}</span>
                  </td>
                  <td className="p-2 text-gray-700">{cell.why || '—'}</td>
                  <td className="p-2 text-gray-800 whitespace-pre-wrap">
                    {showFix(status) ? (cell.fix || '—') : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {(board.decision || board.conditions) && (
        <div className="mt-3 text-sm text-gray-700">
          {board.decision ? <>Decision: <strong>{board.decision}</strong></> : null}
          {board.decision && board.conditions ? ' — ' : null}
          {board.conditions ? <>{board.conditions}</> : null}
        </div>
      )}
    </section>
  )
}
