import React from 'react'

function escapeHtml(s='') {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function mdToHtml(src='') {
  // Very small, safe-ish markdown → HTML for our structured outputs
  const safe = escapeHtml(src)
    // bold / italics (simple cases)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')

  const lines = safe.split(/\r?\n/)
  let html = '', inUl = false, inOl = false

  const closeLists = () => {
    if (inUl) { html += '</ul>'; inUl = false }
    if (inOl) { html += '</ol>'; inOl = false }
  }

  const flushPara = (buf) => {
    const t = buf.join(' ').trim()
    if (t) html += `<p>${t}</p>`
    buf.length = 0
  }

  let pbuf = []
  for (let i=0;i<lines.length;i++) {
    const line = lines[i]

    // Headings
    const h2 = /^##\s+(.+)$/.exec(line)
    const h3 = /^###\s+(.+)$/.exec(line)
    const h4 = /^####\s+(.+)$/.exec(line)
    if (h2 || h3 || h4) {
      closeLists()
      flushPara(pbuf)
      const text = (h2?.[1] || h3?.[1] || h4?.[1]).trim()
      const tag = h2 ? 'h2' : h3 ? 'h3' : 'h4'
      html += `<${tag}>${text}</${tag}>`
      continue
    }

    // Bulleted lists
    const li = /^[-*]\s+(.+)$/.exec(line)
    if (li) {
      flushPara(pbuf)
      if (!inUl) { closeLists(); html += '<ul>'; inUl = true }
      html += `<li>${li[1]}</li>`
      continue
    }

    // Numbered lists: "1. foo"
    const oli = /^\d+\.\s+(.+)$/.exec(line)
    if (oli) {
      flushPara(pbuf)
      if (!inOl) { closeLists(); html += '<ol>'; inOl = true }
      html += `<li>${oli[1]}</li>`
      continue
    }

    // Blank line = paragraph break / list close
    if (line.trim()==='') {
      closeLists()
      flushPara(pbuf)
      continue
    }

    // Accumulate paragraph text
    pbuf.push(line)
  }
  closeLists()
  flushPara(pbuf)

  return html || '<p></p>'
}

export default function MarkdownBlock({ text='', className='' }) {
  // fingerprint so you can *visually* verify this component is live:
  // open devtools and run: [...document.querySelectorAll('[data-md="live"]')].length
  const html = mdToHtml(text)
  return (
    <div
      data-md="live"
      className={`prose-trudy border rounded-lg p-4 leading-7 text-[15px] bg-white ${className}`}
      style={{wordBreak:'break-word'}}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
