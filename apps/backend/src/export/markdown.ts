export function markdownToHtml(src: any) {
  const text = String(src || '').replace(/\r\n/g, '\n')
  if (!text.trim()) return '<p class="empty"><em>No content provided.</em></p>'

  const escape = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  let safe = escape(text)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/\bhttps?:\/\/[^\s<]+/g, (m) => `<a href="${m}" target="_blank" rel="noopener">${m}</a>`)

  const lines = safe.split('\n')
  const out: string[] = []
  let inUL = false
  let inOL = false
  let para: string[] = []

  const closeLists = () => {
    if (inUL) out.push('</ul>')
    if (inOL) out.push('</ol>')
    inUL = false
    inOL = false
  }

  const flushPara = () => {
    if (!para.length) return
    out.push(`<p>${para.join(' ').trim()}</p>`)
    para = []
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      closeLists()
      flushPara()
      continue
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line)
    if (heading) {
      closeLists()
      flushPara()
      const lvl = heading[1].length
      const tag = lvl <= 2 ? 'h3' : 'h4'
      out.push(`<${tag}>${heading[2]}</${tag}>`)
      continue
    }

    if (/^>\s+/.test(line)) {
      closeLists()
      flushPara()
      out.push(`<blockquote>${line.replace(/^>\s+/, '')}</blockquote>`)
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      if (!inUL) {
        closeLists()
        out.push('<ul>')
        inUL = true
      }
      out.push(`<li>${line.replace(/^[-*]\s+/, '')}</li>`)
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      if (!inOL) {
        closeLists()
        out.push('<ol>')
        inOL = true
      }
      out.push(`<li>${line.replace(/^\d+\.\s+/, '')}</li>`)
      continue
    }

    para.push(line)
  }

  closeLists()
  flushPara()

  return out.join('') || '<p class="empty"><em>No content provided.</em></p>'
}
