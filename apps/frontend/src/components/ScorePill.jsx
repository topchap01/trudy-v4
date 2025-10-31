export default function ScorePill({ score }) {
  if (score == null) return null
  const color = score >= 80 ? 'bg-green-600' : score >= 60 ? 'bg-amber-600' : 'bg-red-600'
  return (
    <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white ${color}`}>
      {Math.round(score)}
    </span>
  )
}
