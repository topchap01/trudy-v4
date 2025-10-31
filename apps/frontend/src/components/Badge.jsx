// apps/frontend/src/components/Badge.jsx
export default function Badge({ kind = 'default', children }) {
  const cls =
    kind === 'mode'
      ? 'bg-blue-100 text-blue-800'
      : kind === 'ok'
      ? 'bg-green-100 text-green-800'
      : kind === 'warn'
      ? 'bg-yellow-100 text-yellow-800'
      : kind === 'err'
      ? 'bg-red-100 text-red-800'
      : 'bg-gray-100 text-gray-800'
  return <span className={`inline-block text-xs px-2 py-0.5 rounded ${cls}`}>{children}</span>
}
