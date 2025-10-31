import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import type { SummaryModel } from '../export/render-html.js'

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function textBlocksFromHtml(html: string): string[] {
  const plain = stripHtml(html)
  return plain
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
}

function paragraphFromLine(line: string): Paragraph {
  const trimmed = line.trim()
  if (!trimmed) return new Paragraph({ children: [new TextRun(' ')] })

  if (/^[-•▪︎]/.test(trimmed)) {
    const cleaned = trimmed.replace(/^[-•▪︎]\s*/, '')
    return new Paragraph({
      children: [new TextRun(cleaned)],
      bullet: { level: 0 },
    })
  }

  if (/^\d+\./.test(trimmed)) {
    const cleaned = trimmed.replace(/^\d+\.\s*/, '')
    return new Paragraph({
      children: [new TextRun(cleaned)],
      numbering: {
        reference: 'numbered-list',
        level: 0,
      },
    })
  }

  return new Paragraph({
    children: [new TextRun(trimmed)],
  })
}

export async function exportDocxFromSummary(model: SummaryModel): Promise<Buffer> {
  const children: Paragraph[] = []

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun(model.meta.documentTitle)],
    })
  )
  children.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun(`${model.meta.brand}`),
        new TextRun(' • '),
        new TextRun(model.meta.timestamp),
      ],
    })
  )

  if (model.meta.chips.length) {
    model.meta.chips.forEach((chip) => {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: chip, bold: true })],
        })
      )
    })
    children.push(new Paragraph({ children: [new TextRun(' ')] }))
  }

  model.sections.forEach((section) => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun(section.title)],
      })
    )

    const blocks = textBlocksFromHtml(section.html)
    if (!blocks.length) {
      children.push(new Paragraph({ children: [new TextRun('_No content available._')] }))
      return
    }

    blocks.forEach((block) => {
      const lines = block.split(/\n/).map((line) => line.trim())
      if (lines.every((line) => /^[-•▪︎]/.test(line))) {
        lines.forEach((line) => children.push(paragraphFromLine(line)))
        children.push(new Paragraph({ children: [new TextRun(' ')] }))
        return
      }
      if (lines.every((line) => /^\d+\./.test(line))) {
        lines.forEach((line) => children.push(paragraphFromLine(line)))
        children.push(new Paragraph({ children: [new TextRun(' ')] }))
        return
      }
      const merged = lines.join(' ').replace(/\s+/g, ' ').trim()
    children.push(paragraphFromLine(merged))
  })

  children.push(new Paragraph({ children: [new TextRun(' ')] }))
})

  if (model.ideation && (model.ideation.harness || (model.ideation.unboxed || []).length)) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun('Creative Sparks')],
      })
    )
    const harness = model.ideation.harness
    if (harness) {
      children.push(
        new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun('Bruce (Retailise)')] })
      )
      const harnessLines = [
        harness.selectedHook ? `Hook: ${harness.selectedHook}` : '',
        harness.point ? `Point: ${harness.point}` : '',
        harness.move ? `Move: ${harness.move}` : '',
        harness.risk ? `Risk: ${harness.risk}` : '',
        harness.oddsCadence ? `Odds & cadence: ${harness.oddsCadence}` : '',
        harness.retailerLine ? `Retailer line: ${harness.retailerLine}` : '',
        harness.legalVariant ? `Legalised variant: ${harness.legalVariant}` : '',
      ].filter(Boolean)
      harnessLines.forEach((line) => {
        children.push(new Paragraph({ children: [new TextRun(line)] }))
      })
      children.push(new Paragraph({ children: [new TextRun(' ')] }))
    }

    const highlightIdeas = (model.ideation.unboxed || []).flatMap((agent) => {
      return (agent?.ideas || []).slice(0, 1).map((idea: any) => ({
        agent: agent.agent,
        tier: idea?.tier,
        hook: idea?.hook,
        what: idea?.what,
        xForY: idea?.xForY,
      }))
    }).slice(0, 5)

    if (highlightIdeas.length) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun('Create_Unboxed Highlights')] }))
      highlightIdeas.forEach((idea) => {
        const lines = [
          idea.hook ? `Hook: ${idea.hook}` : '',
          idea.what ? `What: ${idea.what}` : '',
          idea.xForY ? `X-for-Y: ${idea.xForY}` : '',
          idea.agent ? `Agent: ${idea.agent}${idea.tier ? ` · ${idea.tier}` : ''}` : '',
        ].filter(Boolean)
        lines.forEach((line) => {
          children.push(new Paragraph({ children: [new TextRun(line)] }))
        })
        children.push(new Paragraph({ children: [new TextRun(' ')] }))
      })
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
    numbering: {
      config: [
        {
          levels: [
            {
              format: 'decimal',
              level: 0,
              text: '%1.',
              alignment: 'left',
            },
          ],
          reference: 'numbered-list',
        },
      ],
    },
  })

  return Packer.toBuffer(doc)
}
