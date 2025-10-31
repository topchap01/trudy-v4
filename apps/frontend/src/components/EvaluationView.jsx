// apps/frontend/src/components/EvaluationView.jsx
import React from 'react'

export default function EvaluationView({ text }) {
  if (!text) return null
  return (
    <article className="whitespace-pre-wrap border rounded p-3 bg-white">
      {text}
    </article>
  )
}
